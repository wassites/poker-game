/* ================================================================
   ARQUIVO: frontend/src/core/engine-poker.js
   VERSÃO:  BLINDADA — Matemática de Rank Corrigida

   CONCEITO GERAL:
   Este arquivo calcula a FORÇA da mão do jogador.
   No frontend ele serve para UMA coisa só:
     → Mostrar para o jogador o nome da sua mão em tempo real
       ("Par", "Trinca", "Full House", etc.)

   O backend tem uma cópia IDÊNTICA deste arquivo.
   A diferença é o PROPÓSITO:
     Frontend → exibe a força na tela (componente HandStrength.jsx)
     Backend  → decide quem GANHOU a rodada (decisão oficial)

   POR QUE A MESMA LÓGICA NOS DOIS LUGARES?
   Porque o poker tem regras matemáticas fixas.
   Um Full House é sempre mais forte que uma Trinca,
   independente de onde o código roda.

   SISTEMA DE PONTUAÇÃO:
   Cada categoria de mão recebe uma BASE de pontos:
     Straight Flush → 90.000.000+
     Quadra         → 80.000.000+
     Full House     → 70.000.000+
     Flush          → 60.000.000+
     Sequência      → 50.000.000+
     Trinca         → 40.000.000+
     Dois Pares     → 30.000.000+
     Par            → 20.000.000+
     Carta Alta     → 10.000.000+

   Por que bases de 10 milhões?
   Para garantir que NENHUMA mão de categoria inferior
   possa ter pontuação maior que uma de categoria superior.
   Ex: o melhor Par possível (AA com kickers KQJ) dá ~29 milhões.
   Isso é SEMPRE menor que qualquer Trinca (mínimo 40 milhões).
   Chamamos isso de "prevenção de overlap" (sobreposição).
================================================================ */


// ================================================================
// FUNÇÃO PRINCIPAL: calcularForca
//
// É a única função exportada — é o que o HandStrength.jsx importa.
// Todas as outras funções deste arquivo são "privadas" (sem export).
//
// Parâmetros:
//   cartasMao  → array com as 2 cartas do jogador. Ex: ['A♠', 'K♥']
//   cartasMesa → array com as cartas comunitárias (0 a 5 cartas)
//                Ex: ['10♦', 'J♣', 'Q♥']
//
// Retorna:
//   { pontos: number, nome: string }
//   Ex: { pontos: 70140020, nome: "Full House" }
// ================================================================

export function calcularForca(cartasMao, cartasMesa) {

    // 1. Junta as cartas da mão com as da mesa em um único array
    // O spread (...) "espalha" os elementos do array dentro do novo array
    // Ex: [...['A♠','K♥'], ...['10♦','J♣']] → ['A♠','K♥','10♦','J♣']
    const todasCartas = [...cartasMao, ...(cartasMesa || [])];

    // 2. Pré-flop: menos de 5 cartas no total
    // Ainda não é possível ter uma mão completa de poker (precisa de 5)
    // Usamos uma avaliação simplificada para o pré-flop
    if (todasCartas.length < 5) {
        return avaliarMaoInicial(cartasMao);
    }

    // 3. Processa cada carta de string para objeto { valor, naipe }
    // Ex: "A♠" → { valor: 14, naipe: '♠' }
    // .map() transforma cada elemento do array usando a função passada
    const cartasProcessadas = todasCartas.map(processarCarta);

    // 4. Ordena do maior para o menor valor
    // .sort() com função comparadora: (a, b) => b - a = ordem decrescente
    // Importante: ordenar assim facilita todas as verificações abaixo
    cartasProcessadas.sort((a, b) => b.valor - a.valor);

    // 5. Verifica cada categoria do mais forte para o mais fraco
    // A primeira que encontrar, retorna — as demais não precisam checar

    // Straight Flush: sequência do mesmo naipe (inclui Royal Flush)
    const straightFlush = verificarStraightFlush(cartasProcessadas);
    if (straightFlush) return { pontos: 90000000 + straightFlush, nome: "Straight Flush" };

    // Quadra: 4 cartas do mesmo valor (ex: 4 Ases)
    const quadra = verificarGrupos(cartasProcessadas, 4);
    if (quadra) return { pontos: 80000000 + quadra, nome: "Quadra" };

    // Full House: uma Trinca + um Par (ex: AAA + KK)
    const fullHouse = verificarFullHouse(cartasProcessadas);
    if (fullHouse) return { pontos: 70000000 + fullHouse, nome: "Full House" };

    // Flush: 5 cartas do mesmo naipe (não necessariamente em sequência)
    const flush = verificarFlush(cartasProcessadas);
    if (flush) return { pontos: 60000000 + flush, nome: "Flush" };

    // Sequência (Straight): 5 cartas em sequência de valores
    const straight = verificarStraight(cartasProcessadas);
    if (straight) return { pontos: 50000000 + straight, nome: "Sequência" };

    // Trinca: 3 cartas do mesmo valor
    const trinca = verificarGrupos(cartasProcessadas, 3);
    if (trinca) return { pontos: 40000000 + trinca, nome: "Trinca" };

    // Dois Pares: dois pares diferentes (ex: AA + KK)
    const doisPares = verificarDoisPares(cartasProcessadas);
    if (doisPares) return { pontos: 30000000 + doisPares, nome: "Dois Pares" };

    // Par: 2 cartas do mesmo valor
    const par = verificarGrupos(cartasProcessadas, 2);
    if (par) return { pontos: 20000000 + par, nome: "Par" };

    // Carta Alta: nenhuma combinação — a maior carta define a força
    // .slice(0, 5) pega apenas as 5 primeiras (já ordenadas, são as maiores)
    const cartaAlta = calcularKicker(cartasProcessadas.slice(0, 5));
    return { pontos: 10000000 + cartaAlta, nome: "Carta Alta" };
}


// ================================================================
// FUNÇÕES AUXILIARES (PRIVADAS — sem export)
// Não são importadas por ninguém de fora.
// Só existem para ajudar calcularForca() acima.
// ================================================================


// ----------------------------------------------------------------
// processarCarta
// Converte a string de uma carta em um objeto com valor numérico.
//
// Por que precisamos do valor numérico?
//   Strings não dão para comparar matematicamente.
//   "A" > "K" é verdade em strings, mas "10" < "9" também seria!
//   Com números: 14 > 13 > 12 > 11 > 10 > ... > 2. Correto e simples.
//
// Como funciona o slice?
//   cartaStr.slice(-1)    → pega o ÚLTIMO caractere (o naipe)
//   cartaStr.slice(0, -1) → pega TUDO exceto o último (o valor)
//   Ex: "10♥".slice(-1)    → "♥"
//   Ex: "10♥".slice(0, -1) → "10"
// ----------------------------------------------------------------
function processarCarta(cartaStr) {
    if (!cartaStr) return { valor: 0, naipe: '' };

    const naipe    = cartaStr.slice(-1);     // Último caractere = naipe
    const valorStr = cartaStr.slice(0, -1);  // Tudo antes = valor em string
    let valor      = parseInt(valorStr);     // Tenta converter para número

    // parseInt("A") retorna NaN — por isso tratamos manualmente
    if (valorStr === 'A') valor = 14;  // Ás vale 14 (maior carta)
    else if (valorStr === 'K') valor = 13;
    else if (valorStr === 'Q') valor = 12;
    else if (valorStr === 'J') valor = 11;
    // 2 a 10: parseInt() já resolve corretamente

    return { valor, naipe };
}


// ----------------------------------------------------------------
// calcularKicker
// Calcula um número único que representa a força de um conjunto de cartas.
// Usado para desempatar mãos da mesma categoria.
//
// O que é um "kicker"?
//   No poker, quando dois jogadores têm a mesma categoria de mão
//   (ex: ambos têm Par de Reis), as cartas restantes (kickers)
//   decidem quem ganha. Rei de Ases bate Rei de Damas.
//
// Como o algoritmo funciona?
//   Usa sistema posicional com base 15 (como decimal usa base 10).
//   A carta mais forte recebe a maior potência.
//   Ex: cartas [14, 13, 12] (A, K, Q):
//     14 × 15² + 13 × 15¹ + 12 × 15⁰
//     14 × 225 + 13 × 15  + 12 × 1
//     3150     + 195      + 12     = 3357
//
//   Por que base 15? Porque o valor máximo de uma carta é 14 (Ás).
//   Usando base 15, garantimos que cada posição não "invade" a próxima.
// ----------------------------------------------------------------
function calcularKicker(cartas) {
    let soma = 0;
    for (let i = 0; i < cartas.length; i++) {
        // Carta mais forte (i=0) recebe a maior potência (length-1)
        // Carta mais fraca (i=length-1) recebe potência 0 (= 1)
        const potencia = Math.pow(15, (cartas.length - 1 - i));
        soma += cartas[i].valor * potencia;
    }
    return soma;
}


// ----------------------------------------------------------------
// verificarFlush
// Verifica se existe um Flush (5+ cartas do mesmo naipe).
//
// Estratégia:
//   1. Agrupa as cartas por naipe em um objeto
//   2. Se algum naipe tiver 5 ou mais cartas → Flush!
//   3. Pega as 5 mais fortes desse naipe (já estão ordenadas)
//   4. Calcula o kicker dessas 5 para desempatar Flushes
// ----------------------------------------------------------------
function verificarFlush(cartas) {
    // Agrupa por naipe: { '♥': [c1, c2, c3, c4, c5], '♠': [c6] }
    const naipes = {};
    cartas.forEach(c => {
        if (!naipes[c.naipe]) naipes[c.naipe] = [];
        naipes[c.naipe].push(c);
    });

    // Verifica se algum naipe tem 5+ cartas
    for (let n in naipes) {
        if (naipes[n].length >= 5) {
            // Pega as 5 mais fortes (array já está ordenado do maior para menor)
            return calcularKicker(naipes[n].slice(0, 5));
        }
    }
    return 0; // Sem flush
}


// ----------------------------------------------------------------
// verificarStraight
// Verifica se existe uma Sequência (5 cartas consecutivas em valor).
//
// Desafios desta função:
//   1. Pode ter 6 ou 7 cartas no total — precisamos achar a melhor sequência de 5
//   2. O Ás pode ser alto (A-K-Q-J-10) OU baixo (A-2-3-4-5 = "Wheel")
//   3. Cartas repetidas (dois Reis) não quebram a sequência mas não ajudam
//
// Estratégia:
//   1. Remove valores duplicados com Set
//   2. Percorre os valores únicos procurando 5 consecutivos
//   3. Verifica separadamente o caso especial A-2-3-4-5
// ----------------------------------------------------------------
function verificarStraight(cartas) {
    // Set remove duplicatas. new Set([14,13,13,12]) → {14,13,12}
    // Spread (...) converte de volta para array
    const valoresUnicos = [...new Set(cartas.map(c => c.valor))];

    // Detecta o caso especial do Ás baixo (A-2-3-4-5)
    const temAs   = valoresUnicos.includes(14);
    const tem2345 = valoresUnicos.includes(2)
                 && valoresUnicos.includes(3)
                 && valoresUnicos.includes(4)
                 && valoresUnicos.includes(5);

    // Procura sequência de 5 valores consecutivos
    let sequencia = 0;
    for (let i = 0; i < valoresUnicos.length - 1; i++) {
        if (valoresUnicos[i] - valoresUnicos[i + 1] === 1) {
            // Diferença de 1 = consecutivos (array decrescente)
            sequencia++;
            if (sequencia >= 4) {
                // Encontrou 5 consecutivos! Retorna o valor da carta mais alta
                // i-3 porque sequencia chegou a 4 após 4 decrementos
                return valoresUnicos[i - 3];
            }
        } else {
            // Quebrou a sequência, reinicia o contador
            sequencia = 0;
        }
    }

    // Caso especial: A-2-3-4-5 (Wheel / Sequência mais baixa)
    // O Ás vale como "1" aqui, e o 5 é a carta mais alta desta sequência
    if (temAs && tem2345) {
        return 5; // Retorna 5 como a maior carta desta sequência
    }

    return 0; // Sem sequência
}


// ----------------------------------------------------------------
// verificarStraightFlush
// Verifica se existe um Straight Flush (sequência do mesmo naipe).
//
// Estratégia simples:
//   Para cada naipe que tiver 5+ cartas, verifica se essas cartas
//   formam uma sequência. Se sim → Straight Flush!
//
//   Royal Flush (A-K-Q-J-10 do mesmo naipe) é um caso especial de
//   Straight Flush — retorna o maior valor possível (14 para o Ás).
// ----------------------------------------------------------------
function verificarStraightFlush(cartas) {
    const naipes = {};
    cartas.forEach(c => {
        if (!naipes[c.naipe]) naipes[c.naipe] = [];
        naipes[c.naipe].push(c);
    });

    for (let n in naipes) {
        if (naipes[n].length >= 5) {
            // Verifica sequência APENAS com as cartas deste naipe
            const pontosSeq = verificarStraight(naipes[n]);
            if (pontosSeq > 0) return pontosSeq;
        }
    }
    return 0;
}


// ----------------------------------------------------------------
// verificarGrupos
// Verifica grupos de cartas iguais: Par (2), Trinca (3) ou Quadra (4).
//
// Uma única função para os três casos — o tamanhoNecessario define qual.
//
// Estratégia:
//   1. Conta quantas vezes cada valor aparece
//   2. Procura um valor que aparece tamanhoNecessario vezes ou mais
//   3. Calcula o kicker com as cartas restantes (para desempate)
//
// Por que ordenar os valoresOrdenados?
//   JavaScript trata chaves de objeto como strings.
//   { '14': 2, '13': 1 } percorrido com for...in pode dar ordem errada.
//   Forçamos a ordem decrescente para sempre pegar o grupo mais forte.
// ----------------------------------------------------------------
function verificarGrupos(cartas, tamanhoNecessario) {
    // Conta ocorrências: { 14: 2, 13: 1, 10: 1, ... }
    const contagem = {};
    cartas.forEach(c => {
        contagem[c.valor] = (contagem[c.valor] || 0) + 1;
    });

    // Ordena do maior valor para o menor (importante para pegar o grupo mais forte)
    // Object.keys() retorna strings → .map(Number) converte para números
    const valoresOrdenados = Object.keys(contagem)
        .map(Number)
        .sort((a, b) => b - a);

    for (let valor of valoresOrdenados) {
        if (contagem[valor] >= tamanhoNecessario) {
            const valorPrincipal = valor;

            // Cartas que NÃO fazem parte do grupo = kickers
            // .filter() filtra, .slice() limita a quantidade necessária
            // (5 - tamanhoNecessario) = quantos kickers cabem na mão de 5
            const kickers = cartas
                .filter(c => c.valor !== valorPrincipal)
                .slice(0, 5 - tamanhoNecessario);

            // valorPrincipal * 100000: dá muito peso ao grupo principal
            // + calcularKicker(kickers): desempata pelo kicker
            return (valorPrincipal * 100000) + calcularKicker(kickers);
        }
    }
    return 0;
}


// ----------------------------------------------------------------
// verificarFullHouse
// Verifica Full House: uma Trinca + um Par.
//
// Por que não usar verificarGrupos() duas vezes?
//   Porque pode haver situações com 2 Trincas (em mesas de 7 cartas).
//   Precisamos garantir que pegamos a TRINCA mais forte como principal
//   e o MAIOR PAR restante como secundário.
//
// Estratégia:
//   1. Conta ocorrências de cada valor
//   2. Percorre procurando a maior Trinca
//   3. Percorre procurando o maior Par restante
//   4. Retorna a combinação dos dois para desempate
// ----------------------------------------------------------------
function verificarFullHouse(cartas) {
    const contagem = {};
    cartas.forEach(c => {
        contagem[c.valor] = (contagem[c.valor] || 0) + 1;
    });

    let trinca = 0; // Valor da trinca encontrada
    let par    = 0; // Valor do par encontrado

    for (let v in contagem) {
        const valor = parseInt(v);

        if (contagem[v] >= 3) {
            // Encontrou trinca — guarda a mais forte
            if (valor > trinca) {
                // Se já tinha uma trinca, ela vira o par (segunda trinca = par)
                if (trinca > 0) par = trinca;
                trinca = valor;
            } else {
                // Segunda trinca menor vira par
                if (valor > par) par = valor;
            }
        } else if (contagem[v] >= 2) {
            // Par normal — guarda o mais forte
            if (valor > par) par = valor;
        }
    }

    if (trinca > 0 && par > 0) {
        // trinca * 10000: peso alto para a trinca
        // + par: desempata pelo par quando trincas são iguais
        return (trinca * 10000) + par;
    }
    return 0;
}


// ----------------------------------------------------------------
// verificarDoisPares
// Verifica Dois Pares.
//
// Estratégia:
//   1. Coleta todos os pares existentes
//   2. Ordena e pega os 2 mais fortes
//   3. O kicker é a carta mais alta que não faz parte de nenhum par
// ----------------------------------------------------------------
function verificarDoisPares(cartas) {
    const contagem = {};
    cartas.forEach(c => {
        contagem[c.valor] = (contagem[c.valor] || 0) + 1;
    });

    // Coleta todos os valores que aparecem 2+ vezes
    let pares = [];
    for (let v in contagem) {
        if (contagem[v] >= 2) pares.push(parseInt(v));
    }

    // Ordena decrescente para pegar os 2 pares mais fortes
    pares.sort((a, b) => b - a);

    if (pares.length >= 2) {
        const par1 = pares[0]; // Par mais forte
        const par2 = pares[1]; // Par segundo mais forte

        // Kicker: primeira carta que não pertence a nenhum dos dois pares
        // cartas já está ordenada decrescente, então .find() pega a maior
        const kicker = cartas.find(c => c.valor !== par1 && c.valor !== par2);
        const valorKicker = kicker ? kicker.valor : 0;

        // par1 * 10000: peso máximo para o par mais forte
        // par2 * 100: peso médio para o segundo par
        // valorKicker: desempate final pelo kicker
        return (par1 * 10000) + (par2 * 100) + valorKicker;
    }
    return 0;
}


// ----------------------------------------------------------------
// avaliarMaoInicial
// Avaliação simplificada para o PRÉ-FLOP (menos de 5 cartas no total).
//
// Por que precisamos disso?
//   Com apenas 2 cartas na mão, não é possível ter uma mão completa.
//   Mas o HandStrength.jsx ainda quer mostrar alguma informação útil.
//   Esta função retorna uma estimativa da força da mão inicial.
//
// Heurística usada:
//   Base: soma dos valores das 2 cartas
//   Bônus par:       +20 (par é muito valioso no pré-flop)
//   Bônus par alto:  +15 extra para par de J, Q, K, A
//   Bônus suited:    +5  (mesmo naipe tem mais potencial de flush)
//   Bônus connector: +3  (cartas consecutivas têm potencial de sequência)
//
// NOTA: Os pontos retornados aqui são PEQUENOS (máximo ~60).
//   Não seguem a escala de milhões das outras funções.
//   Por isso calcularForca() trata esse caso antes de chegar nas verificações.
// ----------------------------------------------------------------
function avaliarMaoInicial(cartas) {
    if (!cartas || cartas.length < 2) return { pontos: 0, nome: "Nada" };

    const c1 = processarCarta(cartas[0]);
    const c2 = processarCarta(cartas[1]);

    let pts = c1.valor + c2.valor; // Base: soma dos valores (mínimo 4, máximo 28)

    if (c1.valor === c2.valor) {
        // PAR NA MÃO: muito valioso no pré-flop
        pts += 20;
        if (c1.valor > 10) pts += 15; // Par de J, Q, K ou A: bônus extra
    }

    // Mesmo naipe: potencial de flush
    if (c1.naipe === c2.naipe) pts += 5;

    // Cartas conectadas: potencial de sequência
    // Math.abs() = valor absoluto (garante positivo independente da ordem)
    if (Math.abs(c1.valor - c2.valor) === 1) pts += 3;

    return { pontos: pts, nome: "Pré-Flop" };
}
