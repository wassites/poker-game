/* ================================================================
   ARQUIVO: backend/core/bots.js
   VERSÃO:  RANKED — Sistema de Níveis com Sorteio por Rank

   CONCEITO GERAL:
   Este arquivo controla toda a inteligência artificial dos bots.
   Ele resolve três problemas:
     1. Definir QUEM são os bots e como cada um joga
     2. Sortear o bot CERTO para o nível do jogador humano
     3. Fazer o bot TOMAR DECISÕES durante o jogo

   COMO OS ARQUIVOS SE CONECTAM:
   bots.js  →  importa  →  engine-poker.js  (para saber a força da mão)
   server.js  →  importa  →  bots.js  (para gerar e controlar os bots)
================================================================ */

// IMPORT: Traz a função que calcula a força da mão do poker.
// O bot precisa saber se tem uma mão boa antes de decidir o que fazer.
// O './engine-poker.js' é um caminho relativo — significa "na mesma pasta".
import { calcularForca } from './engine-poker.js';


// ================================================================
// BLOCO 1: DEFINIÇÃO DOS BOTS POR NÍVEL
//
// O que é um objeto de bot?
//   É um "molde" que descreve a personalidade de cada bot.
//   Pensa como uma ficha de personagem de RPG.
//
// O que cada propriedade significa?
//
//   vpip (Voluntarily Put money In Pot)
//     → Número entre 0 e 1. Representa com que frequência o bot
//       entra voluntariamente em uma mão apostando dinheiro.
//     → vpip: 0.80 = entra em 80% das mãos (jogador "fish", joga tudo)
//     → vpip: 0.28 = entra em apenas 28% das mãos (jogador "nit", muito seletivo)
//
//   pfr (Pre-Flop Raise)
//     → Número entre 0 e 1. Com que frequência o bot AUMENTA a aposta
//       antes do flop ao invés de só chamar.
//     → pfr: 0.10 = raramente aumenta (passivo, só chama)
//     → pfr: 0.35 = aumenta frequentemente (agressivo)
//     → Regra geral do poker: pfr nunca deve ser maior que vpip.
//
//   blefe
//     → Número entre 0 e 1. Tendência do bot de apostar sem ter mão boa.
//     → blefe: 0.05 = quase nunca blefa (iniciante com medo)
//     → blefe: 0.55 = blefa com frequência (avançado confiante)
//
//   nivel
//     → 1 = Iniciante, 2 = Intermediário, 3 = Avançado
//     → Usado depois na lógica para comportamentos específicos de cada nível
//
//   erroCall
//     → Chance (0 a 1) de chamar uma aposta SEM ter mão boa.
//     → É o erro mais comum do iniciante: "vou ver o que ele tem"
//     → erroCall: 0.50 = chama aleatoriamente em 50% das vezes
//     → erroCall: 0.02 = quase nunca chama sem razão (avançado)
//
//   erroFold
//     → Chance de desistir (fold) mesmo quando poderia checar de graça.
//     → Iniciante às vezes tem medo sem motivo e joga fora a mão.
//
//   erroBlefe
//     → Chance de blefar de forma aleatória, sem contexto estratégico.
//     → Avançados ainda blefarão (alto valor de 'blefe'), mas de forma
//       calculada. Iniciantes blefarão de forma aleatória e mal-calibrada.
// ================================================================

const BOTS_POR_NIVEL = {

    // --- NÍVEL 1: INICIANTES ---
    // Jogam muitas mãos, erram bastante, não calculam pot odds,
    // chamam demais e blefariam nos momentos errados.
    1: [
        {
            nome: "Rookie",
            avatar: "/avata01.png",
            vpip: 0.75,         // Entra em 75% das mãos — joga demais
            pfr: 0.15,          // Raramente aumenta — muito passivo
            blefe: 0.05,        // Quase não blefa — com medo
            inteligencia: "Iniciante",
            nivel: 1,
            erroCall: 0.40,     // 40% de chance de chamar sem mão
            erroFold: 0.10,     // 10% de chance de desistir à toa
            erroBlefe: 0.02,    // 2% de blefe aleatório (raro e ruim)
        },
        {
            nome: "Fishinho",
            avatar: "/avata02.png",
            vpip: 0.80,         // O maior VPIP — joga praticamente tudo
            pfr: 0.10,          // Quase nunca aumenta
            blefe: 0.03,        // Rarissimamente blefa
            inteligencia: "Iniciante",
            nivel: 1,
            erroCall: 0.50,     // Chama aleatoriamente em METADE das vezes
            erroFold: 0.05,
            erroBlefe: 0.01,
        },
        {
            nome: "Sortudo",
            avatar: "/avata03.png",
            vpip: 0.70,
            pfr: 0.20,
            blefe: 0.08,
            inteligencia: "Iniciante",
            nivel: 1,
            erroCall: 0.35,
            erroFold: 0.15,     // Desiste à toa com mais frequência
            erroBlefe: 0.03,
        },
    ],

    // --- NÍVEL 2: INTERMEDIÁRIOS ---
    // Já entendem as regras bem, selecionam mais as mãos,
    // cometem erros ocasionais mas jogam de forma razoável.
    2: [
        {
            nome: "SkyNet",
            avatar: "/avata04.png",
            vpip: 0.55,         // Mais seletivo que iniciante
            pfr: 0.30,          // Aumenta em 30% das mãos — equilibrado
            blefe: 0.20,        // Blefa com alguma frequência
            inteligencia: "Intermediário",
            nivel: 2,
            erroCall: 0.15,     // Ainda comete alguns erros de call
            erroFold: 0.10,
            erroBlefe: 0.10,    // Blefe aleatório menor
        },
        {
            nome: "R2-D2",
            avatar: "/avata05.png",
            vpip: 0.50,
            pfr: 0.40,          // Mais agressivo no pré-flop
            blefe: 0.25,
            inteligencia: "Intermediário",
            nivel: 2,
            erroCall: 0.12,
            erroFold: 0.12,
            erroBlefe: 0.15,
        },
        {
            nome: "Matrix",
            avatar: "/avata06.png",
            vpip: 0.45,         // Mais seletivo do grupo intermediário
            pfr: 0.35,
            blefe: 0.30,
            inteligencia: "Intermediário",
            nivel: 2,
            erroCall: 0.10,
            erroFold: 0.08,
            erroBlefe: 0.20,
        },
    ],

    // --- NÍVEL 3: AVANÇADOS ---
    // Muito seletivos, erram pouco, calibram bem as apostas,
    // fazem slowplay (fingem ter mão fraca) e blefariam de forma calculada.
    3: [
        {
            nome: "Terminator",
            avatar: "/avata07.png",
            vpip: 0.35,         // Joga apenas 35% das mãos — muito seletivo
            pfr: 0.28,
            blefe: 0.45,        // Blefa bastante MAS de forma estratégica
            inteligencia: "Avançado",
            nivel: 3,
            erroCall: 0.03,     // Quase nunca chama sem motivo
            erroFold: 0.03,
            erroBlefe: 0.35,    // O blefe "aleatório" ainda existe mas é alto
                                // porque avançados blefariam muito — a diferença
                                // é que o blefe deles é mais bem-calibrado (pote * 0.6)
        },
        {
            nome: "007-Bot",
            avatar: "/avata08.png",
            vpip: 0.28,         // O mais seletivo do jogo
            pfr: 0.25,
            blefe: 0.50,        // Blefa em metade das situações — muito agressivo
            inteligencia: "Avançado",
            nivel: 3,
            erroCall: 0.02,
            erroFold: 0.02,
            erroBlefe: 0.40,
        },
        {
            nome: "Viper",
            avatar: "/avata09.png",
            vpip: 0.40,         // Um pouco mais loose que os outros avançados
            pfr: 0.35,
            blefe: 0.55,        // O maior blefe do jogo
            inteligencia: "Avançado",
            nivel: 3,
            erroCall: 0.04,
            erroFold: 0.04,
            erroBlefe: 0.45,
        },
    ],
};


// ================================================================
// BLOCO 2: SISTEMA DE RANK DO JOGADOR HUMANO
//
// Esta função converte os PONTOS de rank do jogador em um NÍVEL (1, 2 ou 3).
// Os pontos ficam salvos no banco de dados (Supabase) no perfil do jogador.
//
// Como os pontos aumentam?
//   → Ganhando partidas, ficando em mesa por mais tempo, etc.
//   → Você define as regras de ganho de pontos no server.js
//
// Por que separar em apenas 3 níveis?
//   → Mais níveis = mais complexidade sem benefício real para o jogador.
//   → 3 níveis cobrem bem a curva de aprendizado: aprendendo, jogando bem, expert.
// ================================================================

function nivelDoJogador(rankPontos = 0) {
    if (rankPontos < 500)  return 1;  // 0 a 499 pontos = Iniciante
    if (rankPontos < 2000) return 2;  // 500 a 1999 pontos = Intermediário
    return 3;                          // 2000+ pontos = Avançado
}


// ================================================================
// BLOCO 3: TABELA DE SORTEIO PONDERADO
//
// O que é sorteio ponderado?
//   É um sorteio onde NEM TODOS OS RESULTADOS TÊM A MESMA CHANCE.
//   Exemplo: numa loteria normal cada número tem 1/100 de chance.
//   Aqui, o nível 1 tem 80 chances e o nível 3 tem apenas 2 chances
//   (para um jogador iniciante).
//
// Como funciona tecnicamente?
//   Criamos um array com 100 posições.
//   Para iniciante: 80 posições com valor 1, 18 com valor 2, 2 com valor 3.
//   Depois sorteamos UMA posição aleatória desse array.
//   A probabilidade de sair cada nível é proporcional à quantidade de posições.
//
//   Array(80).fill(1)  →  cria [1, 1, 1, ... 1] com 80 elementos
//   ...Array(80)       →  o "..." (spread) "espalha" os elementos no array maior
//
// Distribuição por nível do jogador:
//   Iniciante     (nível 1): 80% nível 1 | 18% nível 2 |  2% nível 3
//   Intermediário (nível 2): 20% nível 1 | 60% nível 2 | 20% nível 3
//   Avançado      (nível 3):  5% nível 1 | 25% nível 2 | 70% nível 3
// ================================================================

const TABELA_SORTEIO = {
    1: [ ...Array(80).fill(1), ...Array(18).fill(2), ...Array(2).fill(3)  ],
    2: [ ...Array(20).fill(1), ...Array(60).fill(2), ...Array(20).fill(3) ],
    3: [ ...Array(5).fill(1),  ...Array(25).fill(2), ...Array(70).fill(3) ],
};

// Escolhe aleatoriamente qual NÍVEL o próximo bot será
function sortearNivelBot(nivelJogador) {
    const tabela = TABELA_SORTEIO[nivelJogador];
    // Math.random() gera número entre 0 e 1
    // Multiplicamos pelo tamanho do array (100) para ter índice de 0 a 99
    // Math.floor arredonda para baixo (0.9 vira 0, 1.7 vira 1, etc.)
    return tabela[Math.floor(Math.random() * tabela.length)];
}

// Dado o nível sorteado, escolhe aleatoriamente UM bot desse nível
function sortearBotDoNivel(nivelSorteado) {
    const lista = BOTS_POR_NIVEL[nivelSorteado];
    return lista[Math.floor(Math.random() * lista.length)];
}


// ================================================================
// BLOCO 4: CLASSE PRINCIPAL BotManager
//
// O que é uma classe?
//   É um "molde" para criar objetos com comportamentos definidos.
//   Pensa como uma fábrica: a classe é a planta da fábrica,
//   e os métodos são as máquinas dentro dela.
//
// Por que "static"?
//   Métodos static pertencem à CLASSE e não a uma instância específica.
//   Ou seja, você chama BotManager.gerarBot() diretamente,
//   sem precisar fazer "const bm = new BotManager(); bm.gerarBot()".
//   É mais simples para módulos utilitários como este.
// ================================================================

export class BotManager {

    // ------------------------------------------------------------
    // MÉTODO: gerarBot
    // Chamado pelo server.js quando alguém cria uma mesa com bots.
    //
    // Parâmetros:
    //   index             → número sequencial do bot (0, 1, 2...)
    //                       usado para gerar um uid único
    //   saldoInicial      → fichas que o bot começa tendo na mesa
    //   rankPontosJogador → pontos do jogador humano, para calibrar o nível
    // ------------------------------------------------------------
    static gerarBot(index, saldoInicial = 2000, rankPontosJogador = 0) {
        // 1. Descobre o nível do jogador humano
        const nivelJogador = nivelDoJogador(rankPontosJogador);

        // 2. Sorteia qual nível de bot esse jogador vai enfrentar
        const nivelSorteado = sortearNivelBot(nivelJogador);

        // 3. Escolhe um bot aleatório dentro do nível sorteado
        const modelo = sortearBotDoNivel(nivelSorteado);

        // 4. Monta e retorna o objeto final do bot
        return {
            uid: `bot_${index}_${Date.now()}`, // ID único. Date.now() = milissegundos desde 1970
            nome: modelo.nome,
            avatar: modelo.avatar,
            saldo: saldoInicial,
            estilo: modelo,        // Guarda a "ficha de personagem" completa
            nivel: modelo.nivel,   // Guarda o nível para usar na lógica de jogo
            tipo: 'cpu',           // Diferencia de jogador humano ('humano')
        };
    }


    // ------------------------------------------------------------
    // MÉTODO: decidirJogada
    // O coração da IA. Chamado pelo server.js em cada turno do bot.
    //
    // Parâmetros:
    //   bot             → objeto do bot (criado por gerarBot)
    //   mao             → array com as 2 cartas do bot. Ex: ['A♠', 'K♥']
    //   mesaComunitaria → array com as cartas da mesa (0 a 5 cartas)
    //   custoParaPagar  → quanto o bot precisa pagar para continuar na mão
    //   poteTotal       → total de fichas no pote agora
    //   bigBlind        → valor do big blind da mesa (aposta mínima base)
    //
    // Retorna sempre: { acao: 'FOLD'|'CHECK'|'CALL'|'RAISE', valor: number }
    // ------------------------------------------------------------
    static decidirJogada(bot, mao, mesaComunitaria, custoParaPagar, poteTotal, bigBlind = 20) {

        // Proteção: bot sem fichas não pode fazer nada além de checar
        if (bot.saldo <= 0) return { acao: 'CHECK', valor: 0 };

        const stats = bot.estilo;

        // POT ODDS: relação entre o custo de chamar e o tamanho do pote.
        // É a matemática básica do poker para decidir se vale chamar.
        // Exemplo: pote = 100, custo = 20 → potOdds = 20/121 ≈ 0.165 (16.5%)
        // Significa: preciso ganhar pelo menos 16.5% das vezes para chamar valer a pena.
        const poteReal = poteTotal || 1;
        const potOdds = custoParaPagar / (poteReal + custoParaPagar + 1);

        // SPR (Stack-to-Pot Ratio): quanto o bot tem de fichas em relação ao pote.
        // SPR baixo (< 1) = bot está quase all-in, deve ir all-in com mão boa
        // SPR alto (> 5) = tem muito para perder, deve ser cauteloso
        const stackToPotRatio = bot.saldo / (poteReal + 1);

        // Valor total já apostado nessa rodada + o que falta pagar = aposta atual da mesa
        const apostaMesa = custoParaPagar + (bot.apostaRodada || 0);

        // Se não há cartas comunitárias, ainda estamos no PRÉ-FLOP
        const ehPreFlop = (!mesaComunitaria || mesaComunitaria.length === 0);

        // Calcula a força atual da mão (número de 10M a 90M+)
        const { pontos } = calcularForca(mao, mesaComunitaria || []);

        // PASSO 1: Verifica se o bot comete um erro (iniciantes erram mais)
        // Se retornar uma decisão, ignora toda a estratégia e executa o erro
        const decisaoErrada = this.cometerErro(stats, custoParaPagar, apostaMesa, bigBlind);
        if (decisaoErrada) return decisaoErrada;

        // PASSO 2: Se não errou, usa a estratégia correta para a fase
        if (ehPreFlop) {
            return this.estrategiaPreFlop(bot, mao, custoParaPagar, potOdds, apostaMesa, bigBlind);
        } else {
            return this.estrategiaPosFlop(bot, pontos, custoParaPagar, poteReal, stackToPotRatio, apostaMesa, bigBlind);
        }
    }


    // ================================================================
    // MÉTODO: cometerErro
    //
    // Por que isso existe?
    //   Sem erros, todos os bots pareceriam robôs perfeitos.
    //   O que diferencia um iniciante de um avançado no poker real
    //   são exatamente esses erros: chamar sem mão, desistir com medo,
    //   blefar na hora errada.
    //
    // Como funciona:
    //   Math.random() gera um número aleatório entre 0 e 1.
    //   Se esse número for MENOR que a taxa de erro, o bot comete o erro.
    //   erroCall: 0.40 → em 40% das vezes, chama sem pensar.
    //
    // Retorna: uma decisão de erro, ou null (sem erro, joga normalmente)
    // ================================================================
    static cometerErro(stats, custo, apostaMesa, bigBlind) {
        const sorte = Math.random();

        // Erro 1: Chama quando não devia — o clássico "fish"
        // Só acontece quando tem custo a pagar (custo > 0)
        if (custo > 0 && sorte < stats.erroCall) {
            return { acao: 'CALL', valor: custo };
        }

        // Erro 2: Desiste com medo mesmo podendo checar de graça
        // Só acontece quando não tem custo (custo === 0)
        if (custo === 0 && sorte < stats.erroFold) {
            return { acao: 'CHECK', valor: 0 };
        }

        // Erro 3: Blefe aleatório sem nenhuma leitura de situação
        if (sorte < stats.erroBlefe) {
            return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 2) };
        }

        return null; // Sem erro — passa para a estratégia normal
    }


    // ================================================================
    // MÉTODO: estrategiaPreFlop
    //
    // O que é pré-flop?
    //   É a primeira rodada de apostas, quando cada jogador tem apenas
    //   suas 2 cartas na mão e as cartas comunitárias ainda não foram viradas.
    //
    // Como avaliamos a mão no pré-flop?
    //   Usamos avaliarForcaPreFlop() que retorna um número de 0 a 20.
    //   Dividimos as mãos em 4 grupos por força:
    //     ≥ 16: Monstros (AA, KK, QQ, JJ, AK) → sempre aumentar
    //     ≥ 12: Fortes (TT, 99, 88, AQ) → aumentar ou chamar
    //     ≥  8: Especulativas (pares baixos, conectores) → às vezes chamar
    //     <  8: Lixo → desistir (ou checar se for de graça)
    // ================================================================
    static estrategiaPreFlop(bot, mao, custo, potOdds, apostaMesa, bigBlind) {
        const valorMao = this.avaliarForcaPreFlop(mao);
        const stats = bot.estilo;

        // GRUPO 1: Monstros — sempre raise, independente do estilo
        if (valorMao >= 16) {
            // Multiplicador 3 = raise de 3x a aposta atual (padrão do poker)
            return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 3) };
        }

        // GRUPO 2: Mãos Fortes
        if (valorMao >= 12) {
            if (custo === 0) {
                // Se é de graça (cheque), aumenta com mão forte
                return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 2.5) };
            }
            // pfr > 0.3 = bot agressivo, vale a pena chamar
            // potOdds < 0.4 = matematicamente vale chamar (precisamos ganhar menos de 40%)
            if (stats.pfr > 0.3 || potOdds < 0.4) {
                return { acao: 'CALL', valor: custo };
            }
        }

        // GRUPO 3: Mãos Especulativas
        if (valorMao >= 8) {
            // fatorCuriosidade: quanto do saldo o bot está disposto a arriscar para "ver o flop"
            // vpip: 0.75 → fator: 0.075 → chama se custo < 7.5% do saldo
            const fatorCuriosidade = stats.vpip * 0.1;
            if (custo < bot.saldo * fatorCuriosidade) {
                return { acao: 'CALL', valor: custo };
            }
        }

        // Se pode checar de graça, cheque
        if (custo === 0) return { acao: 'CHECK', valor: 0 };

        // Blefe situacional no pré-flop — só bots com blefe > 0.4 fazem isso
        // E mesmo assim, a chance é baixa (blefe * 0.2 = máximo 11% para avançados)
        if (stats.blefe > 0.4 && Math.random() < stats.blefe * 0.2) {
            return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 2.5) };
        }

        // Default: mão ruim com custo para pagar → desiste
        return { acao: 'FOLD', valor: 0 };
    }


    // ================================================================
    // MÉTODO: estrategiaPosFlop
    //
    // O que é pós-flop?
    //   Tudo depois do flop (quando as 3 primeiras cartas comunitárias
    //   são reveladas): flop, turn e river.
    //
    // As constantes de força vêm do engine-poker.js:
    //   NUTS    = 50.000.000+  → Sequência, Flush, Full House, Quadra, SF
    //   MONSTRO = 30.000.000+  → Dois Pares, Trinca
    //   FORTE   = 20.000.000+  → Um Par (qualquer)
    //   MEDIO   = 10.000.000+  → Carta Alta
    //
    // Dividimos em dois cenários principais:
    //   1. custo === 0: ninguém apostou ainda (check ou bet)
    //   2. custo > 0:   alguém apostou, precisamos responder
    // ================================================================
    static estrategiaPosFlop(bot, forca, custo, pote, spr, apostaMesa, bigBlind) {
        const stats = bot.estilo;
        const sorte = Math.random();

        // Limiares de força da mão (sincronizados com engine-poker.js)
        const NUTS    = 50000000;   // Mão muito forte (sequência pra cima)
        const MONSTRO = 30000000;   // Dois pares ou trinca
        const FORTE   = 20000000;   // Qualquer par
        const MEDIO   = 10000000;   // Carta alta (sem par)

        // ---- CENÁRIO 1: Ninguém apostou (custo === 0) ----
        if (custo === 0) {

            if (forca >= MONSTRO) {
                // SLOWPLAY: Fingir ter mão fraca para enganar o oponente.
                // Avançados fazem isso 35% das vezes com monstros.
                // Iniciantes fazem apenas 5% — geralmente vão apostar logo.
                const chanceSlowplay = stats.nivel === 3 ? 0.35 : 0.05;
                if (sorte < chanceSlowplay) return { acao: 'CHECK', valor: 0 };

                // Aposta 65% do pote — tamanho padrão com mão forte
                return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 0, pote * 0.65) };
            }

            if (forca >= FORTE && stats.pfr > 0.25) {
                // Bet por valor: aposta 50% do pote com par, se for agressivo
                return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 0, pote * 0.5) };
            }

            // BLEFE (C-Bet = Continuation Bet):
            // Apostar mesmo sem mão, para parecer que pegou o flop.
            // Avançados calibram em 60% do pote (tamanho credível).
            // Iniciantes apostam 120% do pote (overbet que revela fraqueza).
            if (forca <= MEDIO && stats.blefe > 0.3 && sorte < stats.blefe * 0.5) {
                const tamBlefe = stats.nivel >= 2 ? pote * 0.6 : pote * 1.2;
                return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 0, tamBlefe) };
            }

            // Default: checar e esperar
            return { acao: 'CHECK', valor: 0 };

        // ---- CENÁRIO 2: Alguém apostou (custo > 0) ----
        } else {

            // oddsInimigo: tamanho da aposta em relação ao pote.
            // > 1.0 = overbet (apostou mais que o pote) — sinal de mão forte
            // < 0.5 = aposta pequena — sinal de fraqueza ou value bet
            const oddsInimigo = custo / pote;

            // NUTS: Mão top, pressionar sempre
            if (forca >= NUTS) {
                if (spr < 1) return { acao: 'RAISE', valor: 999999 }; // All-in quando SPR < 1
                return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 2.5) };
            }

            // MONSTRO: Avançados re-raise 40% das vezes, iniciantes sempre chamam
            if (forca >= MONSTRO) {
                if (stats.nivel === 3 && sorte < 0.4) {
                    return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 2) };
                }
                return { acao: 'CALL', valor: custo };
            }

            // FORTE (par): decisão baseada no tamanho da aposta e estilo do bot
            if (forca >= FORTE) {
                // Aposta grande demais (overbet) + bot conservador → desiste
                if (oddsInimigo > 1.0 && stats.vpip < 0.35) return { acao: 'FOLD', valor: 0 };
                // Aposta pequena ou bot curioso → chama
                if (oddsInimigo < 0.6 || stats.vpip > 0.5) return { acao: 'CALL', valor: custo };
                return { acao: 'FOLD', valor: 0 };
            }

            // Sem mão: blefe sobre a aposta do oponente (rarissimo)
            // blefe > 0.4 E sorte < blefe * 0.1 → máximo ~5.5% de chance
            if (stats.blefe > 0.4 && sorte < stats.blefe * 0.1) {
                return { acao: 'RAISE', valor: this.calcularRaiseValido(apostaMesa, bigBlind, 3) };
            }

            // Default: sem mão, alguém apostou → desiste
            return { acao: 'FOLD', valor: 0 };
        }
    }


    // ================================================================
    // HELPERS (FUNÇÕES DE APOIO)
    // ================================================================

    // ------------------------------------------------------------
    // MÉTODO: avaliarForcaPreFlop
    // Calcula a força de uma mão de 2 cartas antes do flop.
    // Retorna um número de 0 a 20.
    //
    // Por que não usar calcularForca() aqui?
    //   Porque calcularForca() precisa de pelo menos 5 cartas.
    //   No pré-flop temos apenas 2, então usamos uma heurística simples.
    //
    // Heurística (regra simplificada):
    //   → Soma os valores das 2 cartas (A=14, K=13, Q=12, J=11, 2-10=valor)
    //   → Bônus por par: mãos como AA ou KK são muito fortes
    //   → Bônus por mesmo naipe: suited (mesma cor) tem mais potencial
    //   → Bônus por conectadas: cartas em sequência têm mais potencial
    // ------------------------------------------------------------
    static avaliarForcaPreFlop(mao) {
        if (!mao || mao.length < 2) return 0;
        try {
            const c1 = this.valorCarta(mao[0]);
            const c2 = this.valorCarta(mao[1]);
            const n1 = mao[0].slice(-1); // Último caractere = naipe ('♥', '♦', etc.)
            const n2 = mao[1].slice(-1);

            let pts = c1 + c2; // Base: soma dos valores

            if (c1 === c2) {
                // PAR: bônus significativo. AA = 14+14+12 = 40 → limitado a 20
                pts = Math.max(pts, 10);     // Par mínimo (22) vale pelo menos 10
                if (c1 >= 10) pts += 12;     // Par de T, J, Q, K, A: bônus extra
                return Math.min(pts, 20);    // Limita em 20 (teto do sistema)
            }

            // Sem par: aplica bônus menores
            if (n1 === n2) pts += 3;                  // Suited: mesmo naipe
            if (Math.abs(c1 - c2) === 1) pts += 2;   // Conectadas: diferença de 1

            // Divide por 1.5 para normalizar (mãos sem par são menos fortes que pares)
            return Math.min(pts / 1.5, 20);
        } catch (e) {
            console.error("Erro ao avaliar mão bot:", mao);
            return 0;
        }
    }

    // ------------------------------------------------------------
    // MÉTODO: valorCarta
    // Converte a string de uma carta no seu valor numérico.
    // Ex: 'A♠' → 14, 'K♥' → 13, '7♦' → 7
    //
    // Como funciona:
    //   c.slice(0, -1) → pega tudo EXCETO o último caractere (remove o naipe)
    //   Ex: 'A♠'.slice(0, -1) → 'A'
    //   Ex: '10♥'.slice(0, -1) → '10'
    //   Depois verifica se é A/K/Q/J, senão converte pra número com parseInt
    // ------------------------------------------------------------
    static valorCarta(c) {
        if (!c) return 0;
        const v = c.slice(0, -1); // Remove o naipe
        return { A: 14, K: 13, Q: 12, J: 11 }[v] || parseInt(v) || 0;
    }

    // ------------------------------------------------------------
    // MÉTODO: calcularRaiseValido
    // Garante que o valor do raise seja LEGAL segundo as regras do poker.
    //
    // Regra do poker: o aumento mínimo deve ser igual ao ÚLTIMO aumento feito.
    // Ex: big blind é 20, alguém faz raise para 60 (aumento de 40).
    //     O próximo raise mínimo deve ser de pelo menos 40 a mais: 100.
    //
    // Parâmetros:
    //   apostaMesa   → valor total da maior aposta atual na mesa
    //   bigBlind     → valor do big blind (aposta base mínima)
    //   multiplicador → se > 0, calcula como "X vezes a aposta atual"
    //   valorFixo    → se > 0, usa esse valor diretamente (ex: 60% do pote)
    //
    // Retorna: o valor TOTAL que o bot deve apostar (não só o aumento)
    // ------------------------------------------------------------
    static calcularRaiseValido(apostaMesa, bigBlind, multiplicador, valorFixo = 0) {
        // Calcula o aumento: ou pelo multiplicador ou pelo valor fixo
        let aumento = valorFixo > 0
            ? valorFixo                           // Ex: 60% do pote
            : (apostaMesa * (multiplicador - 1)); // Ex: 3x a aposta = aumento de 2x

        // O aumento mínimo legal:
        // Se ninguém apostou ainda: mínimo é 1 big blind
        // Se alguém apostou: mínimo é o valor da aposta atual
        const aumentoMinimo = apostaMesa === 0 ? bigBlind : apostaMesa;

        // Garante que o aumento respeita o mínimo
        if (aumento < aumentoMinimo) aumento = aumentoMinimo;

        // Retorna o valor TOTAL (aposta atual + aumento), sem centavos
        return Math.floor(apostaMesa + aumento);
    }
}
