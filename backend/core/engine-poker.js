/* ================================================================
   ARQUIVO: backend/core/engine-poker.js
   VERSÃO:  BLINDADA — Matemática de Rank Corrigida

   DIFERENÇA ENTRE ESTE E O DO FRONTEND:
   O código é IDÊNTICO. O que muda é o PROPÓSITO:

   Frontend → exibe a força da mão na tela para o próprio jogador
              (componente HandStrength.jsx)

   Backend  → decide oficialmente quem GANHOU a rodada
              (chamado pelo game-manager.js no showdown)

   POR QUE MANTER DUAS CÓPIAS E NÃO COMPARTILHAR?
   Porque frontend (React/Vite) e backend (Node.js) são ambientes
   separados — não compartilham arquivos diretamente.
   Se a lógica mudar, mude nos dois lugares.

   REGRA DE OURO:
   O backend é a FONTE DA VERDADE.
   Se frontend e backend discordarem sobre quem ganhou,
   o backend sempre prevalece — ele é quem salva no banco.

   SISTEMA DE PONTUAÇÃO (bases de 10 milhões):
     Straight Flush → 90.000.000+
     Quadra         → 80.000.000+
     Full House     → 70.000.000+
     Flush          → 60.000.000+
     Sequência      → 50.000.000+
     Trinca         → 40.000.000+
     Dois Pares     → 30.000.000+
     Par            → 20.000.000+
     Carta Alta     → 10.000.000+

   Bases de 10 milhões garantem que nenhuma mão de categoria
   inferior ultrapasse uma de categoria superior (sem overlap).
================================================================ */


// ================================================================
// FUNÇÃO PRINCIPAL: calcularForca
//
// No backend esta função é chamada pelo game-manager.js assim:
//
//   const resultado = calcularForca(jogador.cartas, mesa.cartasComunitarias);
//   if (resultado.pontos > melhorPontos) {
//       melhorPontos = resultado.pontos;
//       vencedor = jogador;
//   }
//
// Parâmetros:
//   cartasMao  → array com as 2 cartas do jogador. Ex: ['A♠', 'K♥']
//   cartasMesa → array com as cartas comunitárias (0 a 5 cartas)
//
// Retorna:
//   { pontos: number, nome: string }
//   Ex: { pontos: 70140020, nome: "Full House" }
// ================================================================

export function calcularForca(cartasMao, cartasMesa) {

    // Une cartas da mão + cartas da mesa
    // spread (...) espalha os elementos do array dentro do novo
    const todasCartas = [...cartasMao, ...(cartasMesa || [])];

    // Menos de 5 cartas = pré-flop, usa avaliação simplificada
    if (todasCartas.length < 5) {
        return avaliarMaoInicial(cartasMao);
    }

    // Converte strings em objetos { valor: number, naipe: string }
    const cartasProcessadas = todasCartas.map(processarCarta);

    // Ordena do maior para o menor valor
    // Essencial para que todas as verificações abaixo funcionem corretamente
    cartasProcessadas.sort((a, b) => b.valor - a.valor);

    // Verifica categorias do mais forte para o mais fraco
    // A primeira que bater, retorna imediatamente

    const straightFlush = verificarStraightFlush(cartasProcessadas);
    if (straightFlush) return { pontos: 90000000 + straightFlush, nome: "Straight Flush" };

    const quadra = verificarGrupos(cartasProcessadas, 4);
    if (quadra) return { pontos: 80000000 + quadra, nome: "Quadra" };

    const fullHouse = verificarFullHouse(cartasProcessadas);
    if (fullHouse) return { pontos: 70000000 + fullHouse, nome: "Full House" };

    const flush = verificarFlush(cartasProcessadas);
    if (flush) return { pontos: 60000000 + flush, nome: "Flush" };

    const straight = verificarStraight(cartasProcessadas);
    if (straight) return { pontos: 50000000 + straight, nome: "Sequência" };

    const trinca = verificarGrupos(cartasProcessadas, 3);
    if (trinca) return { pontos: 40000000 + trinca, nome: "Trinca" };

    const doisPares = verificarDoisPares(cartasProcessadas);
    if (doisPares) return { pontos: 30000000 + doisPares, nome: "Dois Pares" };

    const par = verificarGrupos(cartasProcessadas, 2);
    if (par) return { pontos: 20000000 + par, nome: "Par" };

    const cartaAlta = calcularKicker(cartasProcessadas.slice(0, 5));
    return { pontos: 10000000 + cartaAlta, nome: "Carta Alta" };
}


// ================================================================
// FUNÇÕES AUXILIARES (PRIVADAS — sem export)
// ================================================================


// ----------------------------------------------------------------
// processarCarta
// Converte string da carta em objeto com valor numérico e naipe.
//
// Ex: "A♠"  → { valor: 14, naipe: '♠' }
//     "10♥" → { valor: 10, naipe: '♥' }
//     "K♦"  → { valor: 13, naipe: '♦' }
//
// slice(-1)    → último caractere (naipe)
// slice(0, -1) → tudo exceto o último (valor em string)
// parseInt()   → converte "10" para 10, retorna NaN para letras
// ----------------------------------------------------------------
function processarCarta(cartaStr) {
    if (!cartaStr) return { valor: 0, naipe: '' };

    const naipe    = cartaStr.slice(-1);
    const valorStr = cartaStr.slice(0, -1);
    let valor      = parseInt(valorStr);

    if (valorStr === 'A') valor = 14;
    else if (valorStr === 'K') valor = 13;
    else if (valorStr === 'Q') valor = 12;
    else if (valorStr === 'J') valor = 11;

    return { valor, naipe };
}


// ----------------------------------------------------------------
// calcularKicker
// Gera um número único que representa a força de um conjunto de cartas.
// Usado para desempatar mãos da mesma categoria.
//
// Usa sistema posicional de base 15 (maior valor de carta = 14).
// Carta mais forte recebe a maior potência — como casas decimais.
//
// Ex: [14, 13, 12] (A, K, Q):
//   14 × 15² + 13 × 15¹ + 12 × 15⁰ = 3150 + 195 + 12 = 3357
//
// Base 15 garante que nenhuma posição "invade" a próxima.
// ----------------------------------------------------------------
function calcularKicker(cartas) {
    let soma = 0;
    for (let i = 0; i < cartas.length; i++) {
        const potencia = Math.pow(15, (cartas.length - 1 - i));
        soma += cartas[i].valor * potencia;
    }
    return soma;
}


// ----------------------------------------------------------------
// verificarFlush
// 5 ou mais cartas do mesmo naipe.
//
// Agrupa por naipe → se algum tiver 5+ cartas → Flush!
// Retorna o kicker das 5 mais fortes para desempate.
// ----------------------------------------------------------------
function verificarFlush(cartas) {
    const naipes = {};
    cartas.forEach(c => {
        if (!naipes[c.naipe]) naipes[c.naipe] = [];
        naipes[c.naipe].push(c);
    });

    for (let n in naipes) {
        if (naipes[n].length >= 5) {
            return calcularKicker(naipes[n].slice(0, 5));
        }
    }
    return 0;
}


// ----------------------------------------------------------------
// verificarStraight
// 5 cartas consecutivas em valor.
//
// Desafios:
//   1. Remove duplicatas com Set (dois Reis não contam duas vezes)
//   2. O Ás pode ser alto (A-K-Q-J-10) ou baixo (A-2-3-4-5)
//   3. Com 7 cartas, pode haver mais de uma sequência possível
//      → retorna apenas a mais forte
//
// Retorna a carta mais alta da sequência encontrada, ou 0.
// ----------------------------------------------------------------
function verificarStraight(cartas) {
    const valoresUnicos = [...new Set(cartas.map(c => c.valor))];

    const temAs   = valoresUnicos.includes(14);
    const tem2345 = valoresUnicos.includes(2)
                 && valoresUnicos.includes(3)
                 && valoresUnicos.includes(4)
                 && valoresUnicos.includes(5);

    let sequencia = 0;
    for (let i = 0; i < valoresUnicos.length - 1; i++) {
        if (valoresUnicos[i] - valoresUnicos[i + 1] === 1) {
            sequencia++;
            if (sequencia >= 4) {
                return valoresUnicos[i - 3];
            }
        } else {
            sequencia = 0;
        }
    }

    // Caso especial: A-2-3-4-5 (Wheel)
    // Ás age como "1", o 5 é a carta mais alta desta sequência
    if (temAs && tem2345) return 5;

    return 0;
}


// ----------------------------------------------------------------
// verificarStraightFlush
// Sequência do mesmo naipe (inclui Royal Flush A-K-Q-J-10).
//
// Royal Flush é o Straight Flush mais alto possível.
// Não precisamos tratá-lo separadamente — ele retorna o maior
// valor de straightFlush possível (14 para o Ás).
// ----------------------------------------------------------------
function verificarStraightFlush(cartas) {
    const naipes = {};
    cartas.forEach(c => {
        if (!naipes[c.naipe]) naipes[c.naipe] = [];
        naipes[c.naipe].push(c);
    });

    for (let n in naipes) {
        if (naipes[n].length >= 5) {
            const pontosSeq = verificarStraight(naipes[n]);
            if (pontosSeq > 0) return pontosSeq;
        }
    }
    return 0;
}


// ----------------------------------------------------------------
// verificarGrupos
// Detecta Par (2), Trinca (3) ou Quadra (4) — uma função para os três.
//
// Por que ordenar os valores manualmente?
//   JavaScript trata chaves de objeto como strings.
//   for...in pode retornar em ordem incorreta.
//   Forçamos ordem decrescente para sempre pegar o grupo mais forte.
//
// Retorna: (valorGrupo × 100000) + kicker
// O peso de 100000 garante que o grupo principal sempre domina o kicker.
// ----------------------------------------------------------------
function verificarGrupos(cartas, tamanhoNecessario) {
    const contagem = {};
    cartas.forEach(c => {
        contagem[c.valor] = (contagem[c.valor] || 0) + 1;
    });

    const valoresOrdenados = Object.keys(contagem)
        .map(Number)
        .sort((a, b) => b - a);

    for (let valor of valoresOrdenados) {
        if (contagem[valor] >= tamanhoNecessario) {
            const valorPrincipal = valor;

            const kickers = cartas
                .filter(c => c.valor !== valorPrincipal)
                .slice(0, 5 - tamanhoNecessario);

            return (valorPrincipal * 100000) + calcularKicker(kickers);
        }
    }
    return 0;
}


// ----------------------------------------------------------------
// verificarFullHouse
// Trinca + Par.
//
// Casos especiais com 7 cartas:
//   → Pode haver 2 Trincas: a maior vira Trinca, a menor vira Par
//   → Pode haver Trinca + 2 Pares: usa a Trinca + o Par maior
//
// Retorna: (trinca × 10000) + par
// ----------------------------------------------------------------
function verificarFullHouse(cartas) {
    const contagem = {};
    cartas.forEach(c => {
        contagem[c.valor] = (contagem[c.valor] || 0) + 1;
    });

    let trinca = 0;
    let par    = 0;

    for (let v in contagem) {
        const valor = parseInt(v);

        if (contagem[v] >= 3) {
            if (valor > trinca) {
                if (trinca > 0) par = trinca;
                trinca = valor;
            } else {
                if (valor > par) par = valor;
            }
        } else if (contagem[v] >= 2) {
            if (valor > par) par = valor;
        }
    }

    if (trinca > 0 && par > 0) {
        return (trinca * 10000) + par;
    }
    return 0;
}


// ----------------------------------------------------------------
// verificarDoisPares
// Dois pares diferentes + kicker.
//
// Com 7 cartas pode haver 3 pares → pega os 2 mais fortes.
// Kicker: carta mais alta que não pertence a nenhum dos dois pares.
//
// Retorna: (par1 × 10000) + (par2 × 100) + kicker
// ----------------------------------------------------------------
function verificarDoisPares(cartas) {
    const contagem = {};
    cartas.forEach(c => {
        contagem[c.valor] = (contagem[c.valor] || 0) + 1;
    });

    let pares = [];
    for (let v in contagem) {
        if (contagem[v] >= 2) pares.push(parseInt(v));
    }

    pares.sort((a, b) => b - a);

    if (pares.length >= 2) {
        const par1 = pares[0];
        const par2 = pares[1];

        const kicker = cartas.find(c => c.valor !== par1 && c.valor !== par2);
        const valorKicker = kicker ? kicker.valor : 0;

        return (par1 * 10000) + (par2 * 100) + valorKicker;
    }
    return 0;
}


// ----------------------------------------------------------------
// avaliarMaoInicial
// Estimativa de força para o pré-flop (apenas 2 cartas na mão).
//
// Usado pelo game-manager.js no pré-flop para os bots decidirem.
// Os pontos retornados são pequenos (máximo ~60) — não seguem
// a escala de milhões, mas calcularForca() trata isso antes
// de chegar nas verificações principais.
//
// Heurística:
//   Base:           soma dos valores das 2 cartas
//   Par na mão:     +20 (muito valioso no pré-flop)
//   Par alto (J+):  +15 extra
//   Suited:         +5  (potencial de flush)
//   Conectadas:     +3  (potencial de sequência)
// ----------------------------------------------------------------
function avaliarMaoInicial(cartas) {
    if (!cartas || cartas.length < 2) return { pontos: 0, nome: "Nada" };

    const c1 = processarCarta(cartas[0]);
    const c2 = processarCarta(cartas[1]);

    let pts = c1.valor + c2.valor;

    if (c1.valor === c2.valor) {
        pts += 20;
        if (c1.valor > 10) pts += 15;
    }

    if (c1.naipe === c2.naipe) pts += 5;
    if (Math.abs(c1.valor - c2.valor) === 1) pts += 3;

    return { pontos: pts, nome: "Pré-Flop" };
}
