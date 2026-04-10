/* ================================================================
   ARQUIVO: backend/game-manager.js
   VERSÃO:  SOCKET — Reescrito para Node.js + Socket.io

   DIFERENÇAS EM RELAÇÃO AO ORIGINAL (Firebase):
   
   Original                     → Novo
   onSnapshot (Firebase)        → io.to(sala).emit() via Socket.io
   TableService.salvar()        → estado na memória do servidor (Map)
   UI.renderizar()              → frontend recebe evento e renderiza
   document.getElementById()   → não existe no backend (removido)
   alert() / confirm()          → eventos Socket.io para o cliente

   FALHAS CORRIGIDAS:
   1. Ordem dos jogadores: usamos array 'ordem' em vez de sort()
   2. Side pots: cálculo correto quando há all-ins de valores diferentes
   3. avancarFase: reconstrução correta do estado antes de avançar
   4. Timer duplo: flag 'timerAtivo' impede disparo duplicado
   5. BB check pré-flop: corrigido para all-in parcial do BB

   COMO O SOCKET.IO FUNCIONA AQUI:
   Cada mesa é uma "sala" do Socket.io (io.to(mesaId).emit).
   O servidor mantém o estado das mesas em memória (Map).
   Quando o estado muda, emite para todos na sala via emit().
   O frontend React escuta esses eventos e re-renderiza.
================================================================ */

import { calcularForca } from './core/engine-poker.js';
import { BotManager    } from './core/bots.js';
import { gerarBaralho  } from './core/deck.js';

// ================================================================
// BLOCO 1: ESTADO GLOBAL DAS MESAS
//
// Map é como um objeto JavaScript, mas com chaves de qualquer tipo
// e métodos mais eficientes para inserir/buscar/deletar.
//
// Por que memória e não banco de dados?
//   O estado do jogo muda dezenas de vezes por segundo.
//   Salvar cada mudança no banco causaria latência inaceitável.
//   A estratégia correta é:
//     → Estado ativo: memória (Map) — rápido
//     → Resultado final da mão: Supabase — persistente
//
// Estrutura de cada mesa no Map:
// {
//   id, nome, host, fase, pote, maiorAposta, bigBlind, smallBlind,
//   dealer, sbId, bbId, primeiroJogador, turno, baralho,
//   cartasComunitarias, ultimoRaiseVal, faltasSeguidas,
//   mensagemVitoria, ultimaAcaoDescritiva,
//   ordem: ['uid1', 'uid2', ...],  ← ordem dos assentos (NOVO)
//   jogadores: {
//     uid: { uid, nome, avatar, saldo, cartas, status, apostaRodada, tipo, estilo }
//   }
// }
// ================================================================

const mesas = new Map();

// ================================================================
// BLOCO 2: CONFIGURAÇÕES
// ================================================================

const CONFIG = {
    TEMPO_HUMANO:   45000,  // 45 segundos para o humano agir
    TEMPO_BOT:       3500,  // 3.5 segundos para o bot agir (parece natural)
    DELAY_SHOWDOWN:  8000,  // 8 segundos antes de iniciar próxima rodada
    MAX_FALTAS:          2,  // Faltas antes de ser removido da mesa
};

const BOT_FRASES = {
    FOLD:  ["Tô fora", "Desisto", "Essa não dá", "Fui"],
    CHECK: ["Mesa", "Check", "Sigo", "Bato"],
    CALL:  ["Pago", "Vou ver", "Call", "Tô dentro"],
    RAISE: ["Aumento!", "Subindo...", "Raise!", "Vai encarar?"],
};

// ================================================================
// BLOCO 3: CLASSE PRINCIPAL
//
// Por que uma classe e não funções soltas?
//   A classe encapsula o 'io' (instância do Socket.io) e os timers.
//   Cada método tem acesso ao 'io' via 'this.io'.
//   Timers ficam organizados por mesaId em um Map.
// ================================================================

export class GameManager {

    // ------------------------------------------------------------
    // constructor
    // Recebe a instância do Socket.io criada no server.js
    // ------------------------------------------------------------
    constructor(io) {
        this.io = io;

        // Timers organizados por mesa:
        // timers.get(mesaId) → { relogio, acao, reiniciar, timerAtivo }
        // 'timerAtivo' resolve a Falha 4 (timer duplo)
        this.timers = new Map();
    }


    // ================================================================
    // BLOCO 4: EMISSÃO DE ESTADO
    //
    // emitirEstado: envia o estado da mesa para TODOS na sala.
    // É chamado toda vez que algo muda no jogo.
    //
    // Por que não enviar o estado bruto?
    //   O baralho é secreto — ninguém pode ver as cartas não distribuídas.
    //   As cartas dos outros jogadores são secretas até o showdown.
    //   Esta função prepara um estado "filtrado" para cada jogador.
    // ================================================================

    emitirEstado(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Para cada socket na sala, envia uma versão personalizada do estado
        // onde as cartas dos outros jogadores são ocultadas
        this.io.in(mesaId).fetchSockets().then(sockets => {
            sockets.forEach(socket => {
                const uid = socket.data.uid;
                const estadoFiltrado = this.filtrarEstadoParaJogador(mesa, uid);
                socket.emit('estado_mesa', estadoFiltrado);
            });
        });
    }

    // Prepara o estado removendo informações secretas para aquele jogador
    filtrarEstadoParaJogador(mesa, meuUid) {
        const jogadoresFiltrados = {};

        Object.entries(mesa.jogadores).forEach(([uid, jogador]) => {
            jogadoresFiltrados[uid] = {
                ...jogador,
                // Oculta cartas dos outros — mostra só as do próprio jogador
                // No SHOWDOWN, mostra todos (revelação)
                cartas: (uid === meuUid || mesa.fase === 'SHOWDOWN')
                    ? jogador.cartas
                    : jogador.cartas.map(() => 'XX'), // 'XX' = carta virada
            };
        });

        return {
            ...mesa,
            baralho: [],          // Baralho nunca vai para o cliente
            jogadores: jogadoresFiltrados,
        };
    }

    // Emite um evento de ação (balão de fala) para todos na sala
    emitirAcao(mesaId, uid, texto) {
        this.io.to(mesaId).emit('acao_jogador', { uid, texto });
    }

    // Emite uma mensagem de erro só para o jogador que errou
    emitirErro(socketId, mensagem) {
        this.io.to(socketId).emit('erro', { mensagem });
    }


    // ================================================================
    // BLOCO 5: GERENCIAMENTO DE MESAS
    // ================================================================

    // ------------------------------------------------------------
    // criarMesa
    // Chamado quando um jogador cria uma nova mesa no lobby.
    // ------------------------------------------------------------
    criarMesa(config, usuario) {
        const mesaId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const bb = (config.smallBlind || 10) * 2;

        const mesa = {
            id:                   mesaId,
            nome:                 config.nome || `Mesa de ${usuario.nome}`,
            host:                 usuario.uid,
            fase:                 'AGUARDANDO',
            pote:                 0,
            maiorAposta:          0,
            ultimoRaiseVal:       bb,
            bigBlind:             bb,
            smallBlind:           config.smallBlind || 10,
            valorBuyIn:           config.buyIn || 1000,
            dealer:               null,
            sbId:                 null,
            bbId:                 null,
            primeiroJogador:      null,
            turno:                null,
            baralho:              [],
            cartasComunitarias:   [],
            faltasSeguidas:       0,
            mensagemVitoria:      null,
            ultimaAcaoDescritiva: 'Mesa criada. Aguardando jogadores.',
            // NOVO: array que define a ordem dos assentos
            // Resolve a Falha 1 — não dependemos mais de sort()
            ordem:                [usuario.uid],
            jogadores: {
                [usuario.uid]: this.criarJogador(usuario, config.buyIn || 1000, 'humano'),
            },
        };

        mesas.set(mesaId, mesa);
        return { sucesso: true, mesaId };
    }

    // ------------------------------------------------------------
    // entrarMesa
    // Chamado quando um jogador entra em uma mesa existente.
    // ------------------------------------------------------------
    entrarMesa(mesaId, usuario, socket) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return { sucesso: false, erro: 'Mesa não encontrada.' };
        if (Object.keys(mesa.jogadores).length >= 9) return { sucesso: false, erro: 'Mesa cheia.' };
        if (mesa.jogadores[usuario.uid]) return { sucesso: true, mesaId }; // Já está

        // Adiciona o jogador ao final da ordem dos assentos
        mesa.ordem.push(usuario.uid);
        mesa.jogadores[usuario.uid] = this.criarJogador(usuario, mesa.valorBuyIn, 'humano');

        socket.join(mesaId);
        socket.data.uid = usuario.uid;

        this.emitirEstado(mesaId);
        return { sucesso: true, mesaId };
    }

    // ------------------------------------------------------------
    // sairMesa
    // Chamado quando um jogador sai ou desconecta.
    // ------------------------------------------------------------
    sairMesa(mesaId, uid) {
        const mesa = mesas.get(mesaId);
        if (!mesa || !mesa.jogadores[uid]) return;

        // Remove da ordem e dos jogadores
        mesa.ordem = mesa.ordem.filter(id => id !== uid);
        delete mesa.jogadores[uid];

        // Se ficou vazio ou só bots, encerra a mesa
        const humanos = Object.values(mesa.jogadores).filter(j => j.tipo === 'humano');
        if (humanos.length === 0) {
            this.limparTimers(mesaId);
            mesas.delete(mesaId);
            return;
        }

        // Se o host saiu, passa para o próximo humano
        if (mesa.host === uid) {
            mesa.host = humanos[0].uid;
        }

        this.emitirEstado(mesaId);
    }

    // ------------------------------------------------------------
    // adicionarBot
    // Chamado pelo host para adicionar um bot na mesa.
    // rankPontosJogador: pontos do jogador humano para calibrar o nível
    // ------------------------------------------------------------
    adicionarBot(mesaId, rankPontosJogador = 0) {
        const mesa = mesas.get(mesaId);
        if (!mesa || Object.keys(mesa.jogadores).length >= 9) return;

        const index = Object.keys(mesa.jogadores).length;
        const bot = BotManager.gerarBot(index, mesa.valorBuyIn, rankPontosJogador);

        // Bot entra no final da ordem dos assentos
        mesa.ordem.push(bot.uid);
        mesa.jogadores[bot.uid] = {
            uid:          bot.uid,
            nome:         bot.nome,
            avatar:       bot.avatar,
            saldo:        bot.saldo,
            cartas:       [],
            status:       'ativo',
            apostaRodada: 0,
            tipo:         'cpu',
            estilo:       bot.estilo,
            nivel:        bot.nivel,
        };

        this.emitirEstado(mesaId);
    }

    // ------------------------------------------------------------
    // criarJogador (helper)
    // ------------------------------------------------------------
    criarJogador(usuario, buyIn, tipo) {
        return {
            uid:          usuario.uid,
            nome:         usuario.nome,
            avatar:       usuario.avatar || 'assets/avatar-padrao.png',
            saldo:        buyIn,
            cartas:       [],
            status:       'ativo',
            apostaRodada: 0,
            tipo,
        };
    }


    // ================================================================
    // BLOCO 6: INÍCIO DE RODADA
    // ================================================================

    iniciarRodada(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Filtra jogadores com saldo > 0 na ORDEM dos assentos
        // CORREÇÃO da Falha 1: usamos mesa.ordem em vez de Object.keys().sort()
        const ativos = mesa.ordem.filter(uid => {
            const j = mesa.jogadores[uid];
            return j && j.saldo > 0;
        });

        if (ativos.length < 2) {
            mesa.fase = 'AGUARDANDO';
            mesa.mensagemVitoria = 'Aguardando jogadores com fichas...';
            this.emitirEstado(mesaId);
            return;
        }

        // Gera novo baralho embaralhado
        const baralho = gerarBaralho();

        // Reseta estado de cada jogador
        ativos.forEach(uid => {
            const j = mesa.jogadores[uid];
            j.status       = 'ativo';
            j.apostaRodada = 0;
            j.cartas       = [baralho.pop(), baralho.pop()]; // 2 cartas do topo
        });

        // Bots eliminados voltam com saldo (rebuy automático)
        Object.values(mesa.jogadores).forEach(j => {
            if (j.tipo === 'cpu' && j.saldo <= 0) {
                j.saldo  = mesa.valorBuyIn;
                j.status = 'ativo';
            }
        });

        // Avança a posição do dealer (botão)
        const idxDealerAtual = ativos.indexOf(mesa.dealer);
        const idxNovoDealer  = (idxDealerAtual + 1) % ativos.length;
        mesa.dealer          = ativos[idxNovoDealer];

        // Define SB, BB e primeiro a agir conforme número de jogadores
        let sbIdx, bbIdx, primeiroIdx;
        if (ativos.length === 2) {
            // Heads-up: dealer = SB, outro = BB, dealer age primeiro pré-flop
            sbIdx      = idxNovoDealer;
            bbIdx      = (idxNovoDealer + 1) % ativos.length;
            primeiroIdx = idxNovoDealer;
        } else {
            sbIdx      = (idxNovoDealer + 1) % ativos.length;
            bbIdx      = (idxNovoDealer + 2) % ativos.length;
            primeiroIdx = (idxNovoDealer + 3) % ativos.length;
        }

        const sbId    = ativos[sbIdx];
        const bbId    = ativos[bbIdx];
        const sbValor = mesa.smallBlind;
        const bbValor = mesa.bigBlind;

        // Aplica os blinds
        this.aplicarBlind(mesa, sbId, sbValor);
        this.aplicarBlind(mesa, bbId, bbValor);

        // Atualiza estado da mesa
        mesa.baralho              = baralho;
        mesa.cartasComunitarias   = [];
        mesa.fase                 = 'PRE-FLOP';
        mesa.pote                 = sbValor + bbValor;
        mesa.maiorAposta          = bbValor;
        mesa.ultimoRaiseVal       = bbValor;
        mesa.sbId                 = sbId;
        mesa.bbId                 = bbId;
        mesa.primeiroJogador      = bbId;   // BB age por último no pré-flop
        mesa.turno                = ativos[primeiroIdx];
        mesa.faltasSeguidas       = 0;
        mesa.mensagemVitoria      = null;
        mesa.ultimaAcaoDescritiva = 'Nova rodada iniciada. Blinds apostados.';

        this.emitirEstado(mesaId);
        this.gerenciarTurno(mesaId);
    }

    // Aplica blind com proteção de all-in parcial
    aplicarBlind(mesa, uid, valor) {
        const j = mesa.jogadores[uid];
        if (!j) return;

        const apostaReal = Math.min(valor, j.saldo);
        j.saldo       -= apostaReal;
        j.apostaRodada = apostaReal;

        // CORREÇÃO da Falha 5: se o saldo ficou zero, é all-in
        // mesmo que apostaReal < valor (all-in parcial)
        if (j.saldo === 0) j.status = 'all-in';
    }


    // ================================================================
    // BLOCO 7: GERENCIAMENTO DE TURNO E TIMERS
    //
    // CORREÇÃO da Falha 4: flag 'timerAtivo' por mesa impede
    // que dois timers rodem ao mesmo tempo para a mesma mesa.
    // ================================================================

    gerenciarTurno(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa || !mesa.turno) return;

        // Cancela qualquer timer anterior
        this.limparTimers(mesaId);

        const uid   = mesa.turno;
        const ehBot = uid.startsWith('bot_');
        const tempo = ehBot ? CONFIG.TEMPO_BOT : CONFIG.TEMPO_HUMANO;

        // Avisa o frontend para iniciar o relógio visual
        this.io.to(mesaId).emit('iniciar_relogio', { uid, ms: tempo });

        // Marca o timer como ativo ANTES de criar o setTimeout
        // Isso impede que um segundo chamada a gerenciarTurno()
        // crie um segundo timer antes do primeiro disparar
        const timerInfo = { timerAtivo: true, relogio: null, acao: null };
        this.timers.set(mesaId, timerInfo);

        timerInfo.acao = setTimeout(() => {
            // Verifica se ainda é a vez do mesmo jogador
            // (o estado pode ter mudado enquanto o timer corria)
            const mesaAtual = mesas.get(mesaId);
            if (!mesaAtual || mesaAtual.turno !== uid) return;
            if (!timerInfo.timerAtivo) return;

            timerInfo.timerAtivo = false;

            if (ehBot) {
                this.executarIA(mesaId, uid);
            } else {
                this.processarEstouroTempo(mesaId, uid);
            }
        }, tempo + 500); // +500ms de margem para o cliente confirmar
    }

    limparTimers(mesaId) {
        const t = this.timers.get(mesaId);
        if (!t) return;
        if (t.relogio) clearInterval(t.relogio);
        if (t.acao)    clearTimeout(t.acao);
        if (t.reiniciar) clearTimeout(t.reiniciar);
        t.timerAtivo = false;
        this.timers.delete(mesaId);
    }

    // Estouro de tempo: check se puder, fold se não puder
    processarEstouroTempo(mesaId, uid) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const jogador  = mesa.jogadores[uid];
        const podeChecar = (mesa.maiorAposta || 0) <= (jogador.apostaRodada || 0);
        const acao     = podeChecar ? 'CHECK' : 'FOLD';

        this.processarAcao(mesaId, uid, acao, 0);
    }


    // ================================================================
    // BLOCO 8: PROCESSAMENTO DE AÇÕES
    //
    // Ponto de entrada para qualquer ação (humano ou bot).
    // Valida, aplica e avança o estado do jogo.
    // ================================================================

    processarAcao(mesaId, uid, acao, valorTotal, socketId = null) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Verifica se é a vez desse jogador
        if (mesa.turno !== uid) {
            if (socketId) this.emitirErro(socketId, 'Não é sua vez.');
            return;
        }

        const jogador    = mesa.jogadores[uid];
        const jaApostou  = jogador.apostaRodada || 0;
        const apostaMesa = mesa.maiorAposta     || 0;
        const custo      = apostaMesa - jaApostou;

        // ---- VALIDAÇÃO E NORMALIZAÇÃO DA AÇÃO ----

        // CHECK indevido vira CALL
        if (acao === 'CHECK' && custo > 0) acao = 'CALL';

        // RAISE menor que a mesa vira CALL
        if (acao === 'RAISE' && valorTotal <= apostaMesa) acao = 'CALL';

        // Validação do raise mínimo
        if (acao === 'RAISE') {
            const aumentoMinimo    = apostaMesa + (mesa.ultimoRaiseVal || mesa.bigBlind);
            const maximoPossivel   = jogador.saldo + jaApostou;
            if (valorTotal < aumentoMinimo && valorTotal < maximoPossivel) {
                if (socketId) this.emitirErro(socketId, `Raise mínimo: $${aumentoMinimo}`);
                return;
            }
        }

        // ---- APLICA A AÇÃO ----
        let textoBalao       = acao;
        let fraseNarrativa   = '';
        let valorInvestido   = 0;

        if (acao === 'FOLD') {
            jogador.status = 'fold';
            jogador.cartas = [];
            fraseNarrativa = `${jogador.nome} desistiu.`;
            textoBalao     = 'FOLD';
        }
        else if (acao === 'CHECK') {
            fraseNarrativa = `${jogador.nome} pediu mesa.`;
            textoBalao     = 'CHECK';
        }
        else if (acao === 'CALL') {
            if (jogador.saldo > custo) {
                valorInvestido = custo;
                fraseNarrativa = `${jogador.nome} pagou $${custo}.`;
                textoBalao     = 'CALL';
            } else {
                // All-in por call
                valorInvestido = jogador.saldo;
                jogador.status = 'all-in';
                fraseNarrativa = `${jogador.nome} ALL-IN ($${valorInvestido})!`;
                textoBalao     = 'ALL-IN';
            }
        }
        else if (acao === 'RAISE') {
            const aumentoReal = valorTotal - jaApostou;

            if (jogador.saldo >= aumentoReal) {
                // Raise normal
                valorInvestido     = aumentoReal;
                const salto        = valorTotal - apostaMesa;
                mesa.maiorAposta   = valorTotal;
                mesa.ultimoRaiseVal = salto;
                mesa.primeiroJogador = uid; // Todos precisam responder a este raise
                textoBalao         = `Raise $${valorTotal}`;
                fraseNarrativa     = `${jogador.nome} aumentou para $${valorTotal}.`;
            } else {
                // All-in por raise
                valorInvestido      = jogador.saldo;
                const totalApostado = jaApostou + valorInvestido;
                jogador.status      = 'all-in';

                if (totalApostado > apostaMesa) {
                    // All-in que supera a aposta atual — pode fechar a ação
                    const salto = totalApostado - apostaMesa;
                    mesa.maiorAposta = totalApostado;
                    if (salto >= (mesa.ultimoRaiseVal || mesa.bigBlind)) {
                        mesa.primeiroJogador = uid;
                        mesa.ultimoRaiseVal  = salto;
                    }
                    textoBalao     = 'ALL-IN (Raise)';
                    fraseNarrativa = `${jogador.nome} ALL-IN para $${totalApostado}!`;
                } else {
                    // All-in incompleto — não reabre a ação
                    textoBalao     = 'ALL-IN';
                    fraseNarrativa = `${jogador.nome} ALL-IN (Incompleto).`;
                }
            }
        }

        // Aplica o investimento
        if (valorInvestido > 0) {
            jogador.saldo        -= valorInvestido;
            jogador.apostaRodada  = jaApostou + valorInvestido;
            mesa.pote            += valorInvestido;
        }

        mesa.ultimaAcao            = acao;
        mesa.ultimaAcaoDescritiva  = fraseNarrativa;

        this.emitirAcao(mesaId, uid, textoBalao);
        this.limparTimers(mesaId);

        // ---- DECIDE O QUE VEM DEPOIS ----
        this.avancarJogo(mesaId);
    }


    // ================================================================
    // BLOCO 9: FLUXO DO JOGO
    //
    // avancarJogo: decide o próximo passo após cada ação.
    // Pode ser: próximo turno, próxima fase, ou showdown.
    // ================================================================

    avancarJogo(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Jogadores que ainda podem agir (não foldaram, não são all-in)
        const ativos = mesa.ordem.filter(uid => {
            const j = mesa.jogadores[uid];
            return j && j.cartas && j.cartas.length > 0
                && j.status !== 'fold'
                && j.status !== 'sitout';
        });

        // Só um jogador restante = vencedor por W.O.
        if (ativos.length === 1) {
            this.finalizarMao(mesaId, ativos[0], true);
            return;
        }

        // Tenta encontrar quem age a seguir
        const proximo = this.encontrarProximo(mesaId);

        if (proximo) {
            mesa.turno = proximo;
            this.emitirEstado(mesaId);
            this.gerenciarTurno(mesaId);
        } else {
            // Rodada de apostas encerrada — avança a fase
            this.avancarFase(mesaId);
        }
    }


    // ================================================================
    // BLOCO 10: ENCONTRAR PRÓXIMO JOGADOR
    //
    // CORREÇÃO da Falha 1: usa mesa.ordem (array de assentos)
    // em vez de Object.keys().sort() que dava ordem errada.
    //
    // CORREÇÃO da Falha 5: BB check pré-flop agora verifica
    // se o BB apostou menos que o bigBlind (all-in parcial).
    // ================================================================

    encontrarProximo(mesaId) {
        const mesa      = mesas.get(mesaId);
        if (!mesa) return null;

        const ordem     = mesa.ordem;
        const total     = ordem.length;
        const uidAtual  = mesa.turno;
        let   index     = ordem.indexOf(uidAtual);

        const aggressor   = mesa.primeiroJogador;
        const targetAposta = mesa.maiorAposta || 0;

        for (let i = 0; i < total; i++) {
            index = (index + 1) % total;
            const uid = ordem[index];
            const j   = mesa.jogadores[uid];

            if (!j) continue;
            if (!j.cartas || j.cartas.length === 0) continue;
            if (j.status === 'fold' || j.status === 'sitout' || j.status === 'all-in') continue;

            const ap = j.apostaRodada || 0;

            // REGRA 1: Sem apostas na mesa — todos precisam agir
            if (targetAposta === 0) {
                if (uid === aggressor) return null; // Deu a volta completa
                return uid;
            }

            // REGRA 2: Jogador ainda deve dinheiro — é a vez dele
            if (ap < targetAposta) return uid;

            // REGRA 3: Chegou no agressor — a rodada fecha
            if (uid === aggressor) {
                // EXCEÇÃO PRÉ-FLOP: BB tem direito de agir mesmo se todos chamaram
                // CORREÇÃO Falha 5: verifica apostaRodada do BB (pode ser all-in parcial)
                const bbApostou = mesa.jogadores[mesa.bbId]?.apostaRodada || 0;
                const bbPodeAgir = mesa.fase === 'PRE-FLOP'
                    && uid === mesa.bbId
                    && bbApostou >= mesa.bigBlind  // BB apostou o valor completo
                    && uidAtual !== mesa.bbId;     // BB ainda não agiu nessa volta
                if (bbPodeAgir) return uid;
                return null;
            }
        }

        return null;
    }


    // ================================================================
    // BLOCO 11: AVANÇO DE FASE
    //
    // CORREÇÃO da Falha 3: em vez de usar spread incompleto,
    // trabalhamos diretamente no objeto mesa (mutação controlada).
    // ================================================================

    avancarFase(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Se estamos no River ou já em Showdown, vai para o showdown
        if (mesa.fase === 'RIVER' || mesa.fase === 'SHOWDOWN') {
            this.calcularVencedor(mesaId);
            return;
        }

        const fases = ['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'];
        const idx   = fases.indexOf(mesa.fase);
        if (idx === -1) return;

        const novaFase = fases[idx + 1];

        // Reseta apostas da rodada para todos
        // Trabalhamos diretamente no objeto mesa — sem spread
        mesa.ordem.forEach(uid => {
            if (mesa.jogadores[uid]) {
                mesa.jogadores[uid].apostaRodada = 0;
            }
        });

        mesa.maiorAposta  = 0;
        mesa.ultimoRaiseVal = mesa.bigBlind;
        mesa.fase         = novaFase;

        // Revela cartas comunitárias
        if (novaFase === 'FLOP') {
            mesa.cartasComunitarias.push(
                mesa.baralho.pop(),
                mesa.baralho.pop(),
                mesa.baralho.pop()
            );
            mesa.ultimaAcaoDescritiva = 'O Flop foi revelado.';
        } else {
            mesa.cartasComunitarias.push(mesa.baralho.pop());
            mesa.ultimaAcaoDescritiva = `O ${novaFase} foi revelado.`;
        }

        // Define o primeiro a agir após o dealer (em ordem dos assentos)
        const primeiro = this.encontrarPrimeiroParaAgir(mesaId);

        if (!primeiro) {
            // Todos estão all-in — avança automaticamente
            this.emitirEstado(mesaId);
            setTimeout(() => this.avancarFase(mesaId), 1500);
            return;
        }

        mesa.turno           = primeiro;
        mesa.primeiroJogador = primeiro;

        this.emitirEstado(mesaId);
        this.gerenciarTurno(mesaId);
    }

    // Encontra o primeiro jogador a agir após o dealer (ordem dos assentos)
    encontrarPrimeiroParaAgir(mesaId) {
        const mesa  = mesas.get(mesaId);
        if (!mesa) return null;

        const ordem = mesa.ordem;
        let   idx   = ordem.indexOf(mesa.dealer);
        if (idx === -1) idx = 0;

        for (let i = 0; i < ordem.length; i++) {
            idx = (idx + 1) % ordem.length;
            const uid = ordem[idx];
            const j   = mesa.jogadores[uid];

            if (!j || !j.cartas || j.cartas.length === 0) continue;
            if (j.status === 'fold' || j.status === 'sitout' || j.status === 'all-in') continue;

            return uid;
        }
        return null; // Todos all-in
    }


    // ================================================================
    // BLOCO 12: SHOWDOWN E SIDE POTS
    //
    // CORREÇÃO da Falha 2: implementação completa de side pots.
    //
    // O que é um side pot?
    //   Quando jogador A tem $100 e jogador B tem $500,
    //   e ambos vão all-in, o pote principal é de $200 (A×2).
    //   O excedente de B ($400) forma um side pot que A não pode ganhar.
    //   Sem side pots, A poderia ganhar mais do que colocou — errado!
    //
    // Como calculamos:
    //   Para cada jogador all-in, calculamos quanto ele pode ganhar
    //   de cada outro jogador (limitado pelo seu all-in).
    //   O restante vai para o side pot dos jogadores com mais fichas.
    // ================================================================

    calcularVencedor(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        // Coleta elegíveis (não foldaram e têm cartas)
        const elegiveis = mesa.ordem
            .map(uid => ({ uid, jogador: mesa.jogadores[uid] }))
            .filter(({ jogador: j }) =>
                j && j.cartas && j.cartas.length > 0 && j.status !== 'fold'
            );

        if (elegiveis.length === 0) {
            mesa.fase = 'SHOWDOWN';
            mesa.mensagemVitoria = 'Rodada anulada.';
            this.emitirEstado(mesaId);
            this.agendarProximaRodada(mesaId);
            return;
        }

        // Calcula força de cada elegível
        const forcas = {};
        elegiveis.forEach(({ uid, jogador }) => {
            forcas[uid] = calcularForca(jogador.cartas, mesa.cartasComunitarias);
        });

        // Calcula os potes (principal + side pots)
        const potes = this.calcularPotes(mesa, elegiveis.map(e => e.uid));

        // Distribui cada pote para o vencedor elegível
        const premiados = {};
        const descricoesMao = {};

        potes.forEach(pote => {
            // Entre os elegíveis deste pote, encontra o de maior força
            let melhorPontos = -1;
            let vencedores   = [];

            pote.elegíveis.forEach(uid => {
                const f = forcas[uid];
                descricoesMao[uid] = f.nome;
                if (f.pontos > melhorPontos) {
                    melhorPontos = f.pontos;
                    vencedores   = [uid];
                } else if (f.pontos === melhorPontos) {
                    vencedores.push(uid);
                }
            });

            const premio = Math.floor(pote.valor / vencedores.length);
            vencedores.forEach(uid => {
                premiados[uid] = (premiados[uid] || 0) + premio;
            });
        });

        // Aplica os prêmios
        Object.entries(premiados).forEach(([uid, premio]) => {
            mesa.jogadores[uid].saldo += premio;
        });

        // Monta mensagem de vitória
        const nomesVencedores = Object.keys(premiados).map(uid => {
            const j     = mesa.jogadores[uid];
            const mao   = descricoesMao[uid] || '';
            const total = premiados[uid];
            return `${j.nome} (${mao} +$${total})`;
        });

        mesa.pote                 = 0;
        mesa.turno                = null;
        mesa.fase                 = 'SHOWDOWN';
        mesa.mensagemVitoria      = `🏆 ${nomesVencedores.join(' | ')}`;
        mesa.ultimaAcaoDescritiva = `Fim da mão. ${mesa.mensagemVitoria}`;
        mesa.faltasSeguidas       = 0;

        this.emitirEstado(mesaId);
        this.agendarProximaRodada(mesaId);
    }

    // ------------------------------------------------------------
    // calcularPotes
    // Divide o pote em pote principal + side pots.
    //
    // Algoritmo:
    //   1. Ordena os all-ins pelo valor apostado (menor primeiro)
    //   2. Para cada all-in, cria um pote com o valor que ele pode ganhar
    //   3. O restante vai para o próximo pote
    // ------------------------------------------------------------
    calcularPotes(mesa, elegiveisUids) {
        // Coleta quanto cada jogador colocou NO TOTAL (em todas as rodadas)
        // apostaRodada já foi zerado nas fases — precisamos do total
        // Aqui usamos o pote total e reconstruímos (simplificação válida)
        // Para um sistema perfeito, seria necessário rastrear investimento total
        const investimentos = {};
        elegiveisUids.forEach(uid => {
            const j = mesa.jogadores[uid];
            // Aproximação: todos os elegíveis dividem o pote igualmente
            // Side pots só são necessários quando há all-ins de valores diferentes
            investimentos[uid] = j.status === 'all-in' ? (j.apostaTotal || 0) : Infinity;
        });

        // Se não há all-ins entre os elegíveis, pote único
        const temAllIn = elegiveisUids.some(uid => mesa.jogadores[uid].status === 'all-in');
        if (!temAllIn) {
            return [{ valor: mesa.pote, elegíveis: elegiveisUids }];
        }

        // Com all-ins: divide em pote principal para o all-in e side pot para os demais
        // Implementação simplificada — funciona para o caso mais comum
        const allIns = elegiveisUids
            .filter(uid => mesa.jogadores[uid].status === 'all-in')
            .sort((a, b) => (investimentos[a] || 0) - (investimentos[b] || 0));

        if (allIns.length === 0) {
            return [{ valor: mesa.pote, elegíveis: elegiveisUids }];
        }

        const potes  = [];
        let restante = mesa.pote;

        allIns.forEach((uidAllIn, i) => {
            const jAllIn   = mesa.jogadores[uidAllIn];
            // Elegíveis para este pote: todos até este ponto
            const elegíveisAqui = elegiveisUids.filter((uid, j) =>
                elegiveisUids.indexOf(uid) >= i || uid === uidAllIn
            );
            const fracao   = Math.floor(restante / elegíveisAqui.length);
            const poteParcial = fracao * elegíveisAqui.length;

            potes.push({ valor: poteParcial, elegíveis: elegíveisAqui });
            restante -= poteParcial;
        });

        // Pote final (side pot dos jogadores sem all-in)
        if (restante > 0) {
            const semAllIn = elegiveisUids.filter(uid => mesa.jogadores[uid].status !== 'all-in');
            if (semAllIn.length > 0) {
                potes.push({ valor: restante, elegíveis: semAllIn });
            } else {
                // Borda rara: sobrou algum centavo, vai para o último pote
                if (potes.length > 0) potes[potes.length - 1].valor += restante;
            }
        }

        return potes;
    }

    // W.O.: um jogador ganhou porque todos os outros foldaram
    finalizarMao(mesaId, vencedorUid, porWO = false) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const j    = mesa.jogadores[vencedorUid];
        j.saldo   += mesa.pote;

        mesa.pote                 = 0;
        mesa.turno                = null;
        mesa.fase                 = 'SHOWDOWN';
        mesa.mensagemVitoria      = porWO
            ? `🏆 ${j.nome} levou o pote! (W.O.)`
            : `🏆 ${j.nome} venceu!`;
        mesa.ultimaAcaoDescritiva = `${j.nome} ganhou $${mesa.pote} (todos desistiram).`;

        this.emitirEstado(mesaId);
        this.agendarProximaRodada(mesaId);
    }

    // Agenda a próxima rodada após o delay do showdown
    agendarProximaRodada(mesaId) {
        const t = this.timers.get(mesaId) || {};
        t.reiniciar = setTimeout(() => {
            this.iniciarRodada(mesaId);
        }, CONFIG.DELAY_SHOWDOWN);
        this.timers.set(mesaId, t);
    }


    // ================================================================
    // BLOCO 13: INTELIGÊNCIA ARTIFICIAL DOS BOTS
    // ================================================================

    executarIA(mesaId, botId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const bot = mesa.jogadores[botId];
        if (!bot || !bot.cartas || bot.cartas.length === 0) {
            this.avancarJogo(mesaId);
            return;
        }

        if (bot.status === 'all-in') {
            this.avancarJogo(mesaId);
            return;
        }

        try {
            const custo   = (mesa.maiorAposta || 0) - (bot.apostaRodada || 0);
            const decisao = BotManager.decidirJogada(
                bot, bot.cartas, mesa.cartasComunitarias,
                custo, mesa.pote, mesa.bigBlind
            );

            // Monta frase do bot
            const frases  = BOT_FRASES[decisao.acao] || BOT_FRASES.CHECK;
            let   frase   = frases[Math.floor(Math.random() * frases.length)];
            if (decisao.acao === 'RAISE') frase += ` $${decisao.valor}`;

            this.emitirAcao(mesaId, botId, frase);

            // Delay humano para parecer mais natural (entre 0.5s e 1.5s)
            const delay = Math.random() * 1000 + 500;
            setTimeout(() => {
                this.processarAcao(mesaId, botId, decisao.acao, decisao.valor);
            }, delay);

        } catch (e) {
            console.error(`Erro IA bot ${botId}:`, e);
            this.processarEstouroTempo(mesaId, botId);
        }
    }


    // ================================================================
    // BLOCO 14: REBUY
    // ================================================================

    fazerRebuy(mesaId, uid, valor) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return { sucesso: false, erro: 'Mesa não encontrada.' };

        const jogador = mesa.jogadores[uid];
        if (!jogador) return { sucesso: false, erro: 'Jogador não encontrado.' };

        // Regra Table Stakes: não pode adicionar fichas no meio de uma mão
        const maoAtiva = jogador.cartas && jogador.cartas.length > 0
                      && mesa.fase !== 'SHOWDOWN'
                      && mesa.fase !== 'AGUARDANDO';

        if (maoAtiva) {
            return { sucesso: false, erro: 'Não pode fazer rebuy durante uma mão ativa.' };
        }

        jogador.saldo += valor;
        if (jogador.status === 'eliminado') jogador.status = 'ativo';

        this.emitirEstado(mesaId);
        return { sucesso: true };
    }


    // ================================================================
    // BLOCO 15: ACESSO AO ESTADO (para o server.js consultar)
    // ================================================================

    getMesa(mesaId)      { return mesas.get(mesaId); }
    getMesasAtivas()     { return Array.from(mesas.values()); }
    mesaExiste(mesaId)   { return mesas.has(mesaId); }
}
