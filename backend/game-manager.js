/* ================================================================
   ARQUIVO: backend/game-manager.js

   MUDANÇAS DESTA VERSÃO:
   → TEMPO_HUMANO: 90000 (90s), TEMPO_BOT: 30000 (30s)
   → faltasSeguidas agora é POR JOGADOR (não da mesa)
   → processarEstouroTempo: conta faltas e remove após MAX_FALTAS
   → processarAcao: reseta faltasSeguidas quando jogador age
   → criarJogador: inclui faltasSeguidas: 0
================================================================ */

import { calcularForca } from './core/engine-poker.js';
import { BotManager    } from './core/bots.js';
import { gerarBaralho  } from './core/deck.js';
import { salvarResultadoRodada } from './firebase-admin.js';

const mesas = new Map();

const CONFIG = {
    TEMPO_HUMANO:   90000, // 1 minuto e 30 segundos
    TEMPO_BOT:      30000, // 30 segundos
    DELAY_SHOWDOWN:  8000, // 8 segundos antes da próxima rodada
    MAX_FALTAS:          3, // faltas antes de ser removido da mesa
};

const BOT_FRASES = {
    FOLD:  ["Tô fora", "Desisto", "Essa não dá", "Fui"],
    CHECK: ["Mesa", "Check", "Sigo", "Bato"],
    CALL:  ["Pago", "Vou ver", "Call", "Tô dentro"],
    RAISE: ["Aumento!", "Subindo...", "Raise!", "Vai encarar?"],
};

export class GameManager {

    constructor(io) {
        this.io     = io;
        this.timers = new Map();
    }

    // ================================================================
    // EMISSÃO DE ESTADO
    // ================================================================

    emitirEstado(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        this.io.in(mesaId).fetchSockets().then(sockets => {
            sockets.forEach(socket => {
                const uid = socket.data.uid;
                const estadoFiltrado = this.filtrarEstadoParaJogador(mesa, uid);
                socket.emit('estado_mesa', estadoFiltrado);
            });
        });
    }

    filtrarEstadoParaJogador(mesa, meuUid) {
        const jogadoresFiltrados = {};

        Object.entries(mesa.jogadores).forEach(([uid, jogador]) => {
            jogadoresFiltrados[uid] = {
                ...jogador,
                cartas: (uid === meuUid || mesa.fase === 'SHOWDOWN')
                    ? jogador.cartas
                    : jogador.cartas.map(() => 'XX'),
            };
        });

        return {
            ...mesa,
            baralho:   [],
            jogadores: jogadoresFiltrados,
        };
    }

    emitirAcao(mesaId, uid, texto) {
        this.io.to(mesaId).emit('acao_jogador', { uid, texto });
    }

    emitirErro(socketId, mensagem) {
        this.io.to(socketId).emit('erro', { mensagem });
    }


    // ================================================================
    // GERENCIAMENTO DE MESAS
    // ================================================================

    criarMesa(config, usuario) {
        const mesaId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const bb     = (config.smallBlind || 10) * 2;

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
            mensagemVitoria:      null,
            ultimaAcaoDescritiva: 'Mesa criada. Aguardando jogadores.',
            ordem:                [usuario.uid],
            jogadores: {
                [usuario.uid]: this.criarJogador(usuario, config.buyIn || 1000, 'humano'),
            },
        };

        mesas.set(mesaId, mesa);
        return { sucesso: true, mesaId };
    }

    entrarMesa(mesaId, usuario, socket) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return { sucesso: false, erro: 'Mesa não encontrada.' };
        if (Object.keys(mesa.jogadores).length >= 9) return { sucesso: false, erro: 'Mesa cheia.' };
        if (mesa.jogadores[usuario.uid]) return { sucesso: true, mesaId };

        mesa.ordem.push(usuario.uid);
        mesa.jogadores[usuario.uid] = this.criarJogador(usuario, mesa.valorBuyIn, 'humano');

        socket.join(mesaId);
        socket.data.uid = usuario.uid;

        this.emitirEstado(mesaId);
        return { sucesso: true, mesaId };
    }

    sairMesa(mesaId, uid) {
        const mesa = mesas.get(mesaId);
        if (!mesa || !mesa.jogadores[uid]) return;

        mesa.ordem = mesa.ordem.filter(id => id !== uid);
        delete mesa.jogadores[uid];

        const humanos = Object.values(mesa.jogadores).filter(j => j.tipo === 'humano');
        if (humanos.length === 0) {
            this.limparTimers(mesaId);
            mesas.delete(mesaId);
            return;
        }

        if (mesa.host === uid) {
            mesa.host = humanos[0].uid;
        }

        this.emitirEstado(mesaId);
    }

    adicionarBot(mesaId, rankPontosJogador = 0) {
        const mesa = mesas.get(mesaId);
        if (!mesa || Object.keys(mesa.jogadores).length >= 9) return;

        const index = Object.keys(mesa.jogadores).length;
        const bot   = BotManager.gerarBot(index, mesa.valorBuyIn, rankPontosJogador);

        mesa.ordem.push(bot.uid);
        mesa.jogadores[bot.uid] = {
            uid:           bot.uid,
            nome:          bot.nome,
            avatar:        bot.avatar,
            saldo:         bot.saldo,
            cartas:        [],
            status:        'ativo',
            apostaRodada:  0,
            faltasSeguidas: 0, // NOVO: faltas por jogador
            tipo:          'cpu',
            estilo:        bot.estilo,
            nivel:         bot.nivel,
        };

        this.emitirEstado(mesaId);
    }

    // NOVO: faltasSeguidas inicializado por jogador
    criarJogador(usuario, buyIn, tipo) {
        return {
            uid:           usuario.uid,
            nome:          usuario.nome,
            avatar:        usuario.avatar || '',
            saldo:         buyIn,
            cartas:        [],
            status:        'ativo',
            apostaRodada:  0,
            faltasSeguidas: 0, // NOVO: contador de faltas por jogador
            tipo,
        };
    }


    // ================================================================
    // INÍCIO DE RODADA
    // ================================================================

    iniciarRodada(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const ativos = mesa.ordem.filter(uid => {
            const j = mesa.jogadores[uid];
            return j && j.saldo > 0;
        });

        if (ativos.length < 2) {
            mesa.fase            = 'AGUARDANDO';
            mesa.mensagemVitoria = 'Aguardando jogadores com fichas...';
            this.emitirEstado(mesaId);
            return;
        }

        const baralho = gerarBaralho();

        ativos.forEach(uid => {
            const j        = mesa.jogadores[uid];
            j.status       = 'ativo';
            j.apostaRodada = 0;
            j.cartas       = [baralho.pop(), baralho.pop()];
        });

        Object.values(mesa.jogadores).forEach(j => {
            if (j.tipo === 'cpu' && j.saldo <= 0) {
                j.saldo  = mesa.valorBuyIn;
                j.status = 'ativo';
            }
        });

        const idxDealerAtual = ativos.indexOf(mesa.dealer);
        const idxNovoDealer  = (idxDealerAtual + 1) % ativos.length;
        mesa.dealer          = ativos[idxNovoDealer];

        let sbIdx, bbIdx, primeiroIdx;
        if (ativos.length === 2) {
            sbIdx       = idxNovoDealer;
            bbIdx       = (idxNovoDealer + 1) % ativos.length;
            primeiroIdx = idxNovoDealer;
        } else {
            sbIdx       = (idxNovoDealer + 1) % ativos.length;
            bbIdx       = (idxNovoDealer + 2) % ativos.length;
            primeiroIdx = (idxNovoDealer + 3) % ativos.length;
        }

        const sbId    = ativos[sbIdx];
        const bbId    = ativos[bbIdx];
        const sbValor = mesa.smallBlind;
        const bbValor = mesa.bigBlind;

        this.aplicarBlind(mesa, sbId, sbValor);
        this.aplicarBlind(mesa, bbId, bbValor);

        mesa.baralho              = baralho;
        mesa.cartasComunitarias   = [];
        mesa.fase                 = 'PRE-FLOP';
        mesa.pote                 = sbValor + bbValor;
        mesa.maiorAposta          = bbValor;
        mesa.ultimoRaiseVal       = bbValor;
        mesa.sbId                 = sbId;
        mesa.bbId                 = bbId;
        mesa.primeiroJogador      = bbId;
        mesa.turno                = ativos[primeiroIdx];
        mesa.mensagemVitoria      = null;
        mesa.ultimaAcaoDescritiva = 'Nova rodada iniciada. Blinds apostados.';

        this.emitirEstado(mesaId);
        this.gerenciarTurno(mesaId);
    }

    aplicarBlind(mesa, uid, valor) {
        const j = mesa.jogadores[uid];
        if (!j) return;

        const apostaReal = Math.min(valor, j.saldo);
        j.saldo        -= apostaReal;
        j.apostaRodada  = apostaReal;

        if (j.saldo === 0) j.status = 'all-in';
    }


    // ================================================================
    // TURNO E TIMERS
    // ================================================================

    gerenciarTurno(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa || !mesa.turno) return;

        this.limparTimers(mesaId);

        const uid   = mesa.turno;
        const ehBot = uid.startsWith('bot_');
        const tempo = ehBot ? CONFIG.TEMPO_BOT : CONFIG.TEMPO_HUMANO;

        // Avisa o frontend para iniciar o temporizador visual
        this.io.to(mesaId).emit('iniciar_relogio', { uid, ms: tempo });

        const timerInfo = { timerAtivo: true, relogio: null, acao: null };
        this.timers.set(mesaId, timerInfo);

        timerInfo.acao = setTimeout(() => {
            const mesaAtual = mesas.get(mesaId);
            if (!mesaAtual || mesaAtual.turno !== uid) return;
            if (!timerInfo.timerAtivo) return;

            timerInfo.timerAtivo = false;

            if (ehBot) {
                this.executarIA(mesaId, uid);
            } else {
                this.processarEstouroTempo(mesaId, uid);
            }
        }, tempo + 500);
    }

    limparTimers(mesaId) {
        const t = this.timers.get(mesaId);
        if (!t) return;
        if (t.relogio)   clearInterval(t.relogio);
        if (t.acao)      clearTimeout(t.acao);
        if (t.reiniciar) clearTimeout(t.reiniciar);
        t.timerAtivo = false;
        this.timers.delete(mesaId);
    }

    // ----------------------------------------------------------------
    // NOVO: processa estouro de tempo com sistema de faltas por jogador
    // Após MAX_FALTAS faltas consecutivas → remove da mesa
    // ----------------------------------------------------------------
    processarEstouroTempo(mesaId, uid) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const jogador = mesa.jogadores[uid];
        if (!jogador) return;

        // Incrementa faltas DO JOGADOR (não da mesa)
        jogador.faltasSeguidas = (jogador.faltasSeguidas || 0) + 1;

        console.log(`⏱ ${jogador.nome} faltou (${jogador.faltasSeguidas}/${CONFIG.MAX_FALTAS})`);

        // Atingiu o limite → remove da mesa por inatividade
        if (jogador.faltasSeguidas >= CONFIG.MAX_FALTAS) {
            console.log(`🚫 ${jogador.nome} removido por inatividade.`);

            // Avisa todos na mesa
            this.io.to(mesaId).emit('notificacao', {
                mensagem: `${jogador.nome} foi removido por inatividade.`
            });

            // Dá fold na mão atual antes de sair
            jogador.status = 'fold';
            jogador.cartas = [];

            // Remove da mesa
            this.sairMesa(mesaId, uid);

            // Avança o jogo normalmente
            this.avancarJogo(mesaId);
            return;
        }

        // Ainda dentro do limite: fold ou check automático
        const podeChecar = (mesa.maiorAposta || 0) <= (jogador.apostaRodada || 0);
        const acao       = podeChecar ? 'CHECK' : 'FOLD';

        // Avisa o jogador sobre a falta
        this.io.to(mesaId).emit('notificacao', {
            mensagem: `${jogador.nome} — falta ${jogador.faltasSeguidas}/${CONFIG.MAX_FALTAS} (${acao} automático)`
        });

        this.processarAcao(mesaId, uid, acao, 0);
    }


    // ================================================================
    // PROCESSAMENTO DE AÇÕES
    // ================================================================

    processarAcao(mesaId, uid, acao, valorTotal, socketId = null) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        if (mesa.turno !== uid) {
            if (socketId) this.emitirErro(socketId, 'Não é sua vez.');
            return;
        }

        const jogador    = mesa.jogadores[uid];
        if (!jogador) return;

        // NOVO: reseta faltas quando o jogador age voluntariamente
        // socketId !== null = ação veio do cliente (não do estouro de tempo)
        if (socketId !== null) {
            jogador.faltasSeguidas = 0;
        }

        const jaApostou  = jogador.apostaRodada || 0;
        const apostaMesa = mesa.maiorAposta     || 0;
        const custo      = apostaMesa - jaApostou;

        if (acao === 'CHECK' && custo > 0) acao = 'CALL';
        if (acao === 'RAISE' && valorTotal <= apostaMesa) acao = 'CALL';

        if (acao === 'RAISE') {
            const aumentoMinimo  = apostaMesa + (mesa.ultimoRaiseVal || mesa.bigBlind);
            const maximoPossivel = jogador.saldo + jaApostou;
            if (valorTotal < aumentoMinimo && valorTotal < maximoPossivel) {
                if (socketId) this.emitirErro(socketId, `Raise mínimo: $${aumentoMinimo}`);
                return;
            }
        }

        let textoBalao     = acao;
        let fraseNarrativa = '';
        let valorInvestido = 0;

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
                valorInvestido = jogador.saldo;
                jogador.status = 'all-in';
                fraseNarrativa = `${jogador.nome} ALL-IN ($${valorInvestido})!`;
                textoBalao     = 'ALL-IN';
            }
        }
        else if (acao === 'RAISE') {
            const aumentoReal = valorTotal - jaApostou;

            if (jogador.saldo >= aumentoReal) {
                valorInvestido       = aumentoReal;
                const salto          = valorTotal - apostaMesa;
                mesa.maiorAposta     = valorTotal;
                mesa.ultimoRaiseVal  = salto;
                mesa.primeiroJogador = uid;
                textoBalao           = `Raise $${valorTotal}`;
                fraseNarrativa       = `${jogador.nome} aumentou para $${valorTotal}.`;
            } else {
                valorInvestido      = jogador.saldo;
                const totalApostado = jaApostou + valorInvestido;
                jogador.status      = 'all-in';

                if (totalApostado > apostaMesa) {
                    const salto      = totalApostado - apostaMesa;
                    mesa.maiorAposta = totalApostado;
                    if (salto >= (mesa.ultimoRaiseVal || mesa.bigBlind)) {
                        mesa.primeiroJogador = uid;
                        mesa.ultimoRaiseVal  = salto;
                    }
                    textoBalao     = 'ALL-IN (Raise)';
                    fraseNarrativa = `${jogador.nome} ALL-IN para $${totalApostado}!`;
                } else {
                    textoBalao     = 'ALL-IN';
                    fraseNarrativa = `${jogador.nome} ALL-IN (Incompleto).`;
                }
            }
        }

        if (valorInvestido > 0) {
            jogador.saldo        -= valorInvestido;
            jogador.apostaRodada  = jaApostou + valorInvestido;
            mesa.pote            += valorInvestido;
        }

        mesa.ultimaAcao           = acao;
        mesa.ultimaAcaoDescritiva = fraseNarrativa;

        this.emitirAcao(mesaId, uid, textoBalao);
        this.limparTimers(mesaId);
        this.avancarJogo(mesaId);
    }


    // ================================================================
    // FLUXO DO JOGO
    // ================================================================

    avancarJogo(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const ativos = mesa.ordem.filter(uid => {
            const j = mesa.jogadores[uid];
            return j && j.cartas && j.cartas.length > 0
                && j.status !== 'fold'
                && j.status !== 'sitout';
        });

        if (ativos.length === 1) {
            this.finalizarMao(mesaId, ativos[0], true);
            return;
        }

        const proximo = this.encontrarProximo(mesaId);

        if (proximo) {
            mesa.turno = proximo;
            this.emitirEstado(mesaId);
            this.gerenciarTurno(mesaId);
        } else {
            this.avancarFase(mesaId);
        }
    }

    encontrarProximo(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return null;

        const ordem      = mesa.ordem;
        const total      = ordem.length;
        const uidAtual   = mesa.turno;
        let   index      = ordem.indexOf(uidAtual);
        const aggressor  = mesa.primeiroJogador;
        const targetAp   = mesa.maiorAposta || 0;

        for (let i = 0; i < total; i++) {
            index = (index + 1) % total;
            const uid = ordem[index];
            const j   = mesa.jogadores[uid];

            if (!j) continue;
            if (!j.cartas || j.cartas.length === 0) continue;
            if (j.status === 'fold' || j.status === 'sitout' || j.status === 'all-in') continue;

            const ap = j.apostaRodada || 0;

            if (targetAp === 0) {
                if (uid === aggressor) return null;
                return uid;
            }

            if (ap < targetAp) return uid;

            if (uid === aggressor) {
                const bbApostou  = mesa.jogadores[mesa.bbId]?.apostaRodada || 0;
                const bbPodeAgir = mesa.fase === 'PRE-FLOP'
                    && uid === mesa.bbId
                    && bbApostou >= mesa.bigBlind
                    && uidAtual !== mesa.bbId;
                if (bbPodeAgir) return uid;
                return null;
            }
        }

        return null;
    }

    avancarFase(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        if (mesa.fase === 'RIVER' || mesa.fase === 'SHOWDOWN') {
            this.calcularVencedor(mesaId);
            return;
        }

        const fases    = ['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'];
        const idx      = fases.indexOf(mesa.fase);
        if (idx === -1) return;

        const novaFase = fases[idx + 1];

        mesa.ordem.forEach(uid => {
            if (mesa.jogadores[uid]) {
                mesa.jogadores[uid].apostaRodada = 0;
            }
        });

        mesa.maiorAposta    = 0;
        mesa.ultimoRaiseVal = mesa.bigBlind;
        mesa.fase           = novaFase;

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

        const primeiro = this.encontrarPrimeiroParaAgir(mesaId);

        if (!primeiro) {
            this.emitirEstado(mesaId);
            setTimeout(() => this.avancarFase(mesaId), 1500);
            return;
        }

        mesa.turno           = primeiro;
        mesa.primeiroJogador = primeiro;

        this.emitirEstado(mesaId);
        this.gerenciarTurno(mesaId);
    }

    encontrarPrimeiroParaAgir(mesaId) {
        const mesa = mesas.get(mesaId);
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
        return null;
    }


    // ================================================================
    // SHOWDOWN E SIDE POTS
    // ================================================================

    calcularVencedor(mesaId) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const elegiveis = mesa.ordem
            .map(uid => ({ uid, jogador: mesa.jogadores[uid] }))
            .filter(({ jogador: j }) =>
                j && j.cartas && j.cartas.length > 0 && j.status !== 'fold'
            );

        if (elegiveis.length === 0) {
            mesa.fase            = 'SHOWDOWN';
            mesa.mensagemVitoria = 'Rodada anulada.';
            this.emitirEstado(mesaId);
            this.agendarProximaRodada(mesaId);
            return;
        }

        const forcas = {};
        elegiveis.forEach(({ uid, jogador }) => {
            forcas[uid] = calcularForca(jogador.cartas, mesa.cartasComunitarias);
        });

        const potes         = this.calcularPotes(mesa, elegiveis.map(e => e.uid));
        const premiados     = {};
        const descricoesMao = {};

        potes.forEach(pote => {
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

        Object.entries(premiados).forEach(([uid, premio]) => {
            mesa.jogadores[uid].saldo += premio;
        });

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

        this.emitirEstado(mesaId);
        this.agendarProximaRodada(mesaId);

        const resultados = elegiveis.map(({ uid, jogador }) => ({
            uid,
            nome:           jogador.nome,
            avatar:         jogador.avatar || '',
            fichasGanhas:   premiados[uid]  || 0,
            fichasPerdidas: premiados[uid]  ? 0 : mesa.valorBuyIn,
            venceu:         !!premiados[uid],
        }));
        salvarResultadoRodada(resultados);
    }

    calcularPotes(mesa, elegiveisUids) {
        const investimentos = {};
        elegiveisUids.forEach(uid => {
            const j = mesa.jogadores[uid];
            investimentos[uid] = j.status === 'all-in' ? (j.apostaTotal || 0) : Infinity;
        });

        const temAllIn = elegiveisUids.some(uid => mesa.jogadores[uid].status === 'all-in');
        if (!temAllIn) {
            return [{ valor: mesa.pote, elegíveis: elegiveisUids }];
        }

        const allIns = elegiveisUids
            .filter(uid => mesa.jogadores[uid].status === 'all-in')
            .sort((a, b) => (investimentos[a] || 0) - (investimentos[b] || 0));

        if (allIns.length === 0) {
            return [{ valor: mesa.pote, elegíveis: elegiveisUids }];
        }

        const potes  = [];
        let restante = mesa.pote;

        allIns.forEach((uidAllIn, i) => {
            const elegíveisAqui = elegiveisUids.filter((uid) =>
                elegiveisUids.indexOf(uid) >= i || uid === uidAllIn
            );
            const fracao      = Math.floor(restante / elegíveisAqui.length);
            const poteParcial = fracao * elegíveisAqui.length;

            potes.push({ valor: poteParcial, elegíveis: elegíveisAqui });
            restante -= poteParcial;
        });

        if (restante > 0) {
            const semAllIn = elegiveisUids.filter(uid => mesa.jogadores[uid].status !== 'all-in');
            if (semAllIn.length > 0) {
                potes.push({ valor: restante, elegíveis: semAllIn });
            } else {
                if (potes.length > 0) potes[potes.length - 1].valor += restante;
            }
        }

        return potes;
    }

    finalizarMao(mesaId, vencedorUid, porWO = false) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return;

        const j        = mesa.jogadores[vencedorUid];
        const potGanho = mesa.pote;
        j.saldo       += potGanho;

        mesa.pote                 = 0;
        mesa.turno                = null;
        mesa.fase                 = 'SHOWDOWN';
        mesa.mensagemVitoria      = porWO
            ? `🏆 ${j.nome} levou o pote! (W.O.)`
            : `🏆 ${j.nome} venceu!`;
        mesa.ultimaAcaoDescritiva = `${j.nome} ganhou $${potGanho} (todos desistiram).`;

        this.emitirEstado(mesaId);
        this.agendarProximaRodada(mesaId);

        salvarResultadoRodada([{
            uid:            vencedorUid,
            nome:           j.nome,
            avatar:         j.avatar || '',
            fichasGanhas:   potGanho,
            fichasPerdidas: 0,
            venceu:         true,
        }]);
    }

    agendarProximaRodada(mesaId) {
        const t     = this.timers.get(mesaId) || {};
        t.reiniciar = setTimeout(() => {
            this.iniciarRodada(mesaId);
        }, CONFIG.DELAY_SHOWDOWN);
        this.timers.set(mesaId, t);
    }


    // ================================================================
    // INTELIGÊNCIA ARTIFICIAL DOS BOTS
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

            const frases = BOT_FRASES[decisao.acao] || BOT_FRASES.CHECK;
            let   frase  = frases[Math.floor(Math.random() * frases.length)];
            if (decisao.acao === 'RAISE') frase += ` $${decisao.valor}`;

            this.emitirAcao(mesaId, botId, frase);

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
    // REBUY
    // ================================================================

    fazerRebuy(mesaId, uid, valor) {
        const mesa = mesas.get(mesaId);
        if (!mesa) return { sucesso: false, erro: 'Mesa não encontrada.' };

        const jogador = mesa.jogadores[uid];
        if (!jogador) return { sucesso: false, erro: 'Jogador não encontrado.' };

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
    // ACESSO AO ESTADO
    // ================================================================

    getMesa(mesaId)    { return mesas.get(mesaId); }
    getMesasAtivas()   { return Array.from(mesas.values()); }
    mesaExiste(mesaId) { return mesas.has(mesaId); }
}