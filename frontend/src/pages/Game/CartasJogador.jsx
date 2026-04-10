/* ================================================================
   ARQUIVO: frontend/src/pages/Game/CartasJogador.jsx

   CONCEITO GERAL:
   Exibe as 2 cartas privadas do jogador local na parte inferior
   da tela — só ele pode ver.

   NO POKER TEXAS HOLD'EM:
   Cada jogador recebe 2 cartas "hole cards" (cartas privadas).
   Ninguém mais vê essas cartas até o showdown.
   O servidor envia via evento 'carta_privada' apenas para o
   socket do dono das cartas.

   ESTADOS DAS CARTAS:
     → Sem cartas    : rodada não iniciou ou jogador foldou
     → Com cartas    : exibe as 2 cartas da mão
     → Foldadas      : cartas viradas para baixo (jogador desistiu)

   CÓDIGO DAS CARTAS:
   O servidor envia códigos no formato: "valor + naipe"
   Exemplos:
     "As" → Ás de Espadas  (A + s)
     "Kh" → Rei de Copas   (K + h)
     "2d" → 2 de Ouros     (2 + d)
     "Tc" → 10 de Paus     (T + c) — T = Ten = 10
     "XX" → carta desconhecida (verso)

   PROPS:
     cartas    → array de códigos ['As', 'Kh'] (vazio se não tiver)
     foldado   → boolean: true se o jogador desistiu desta mão
     fase      → string: fase atual ('AGUARDANDO', 'PRE-FLOP', etc.)
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES DOS NAIPES
// ================================================================

// Cor de cada naipe
// Vermelho para copas (h) e ouros (d)
// Preto para espadas (s) e paus (c)
const COR_NAIPE = {
    h: '#DC2626',  // hearts   ♥ vermelho
    d: '#DC2626',  // diamonds ♦ vermelho
    s: '#111827',  // spades   ♠ preto escuro
    c: '#111827',  // clubs    ♣ preto escuro
};

// Símbolo unicode de cada naipe
const SIMBOLO_NAIPE = {
    h: '♥',
    d: '♦',
    s: '♠',
    c: '♣',
};

// Nome por extenso do naipe (para acessibilidade)
const NOME_NAIPE = {
    h: 'Copas',
    d: 'Ouros',
    s: 'Espadas',
    c: 'Paus',
};

// Nome por extenso do valor (para acessibilidade)
const NOME_VALOR = {
    A:  'Ás',
    K:  'Rei',
    Q:  'Dama',
    J:  'Valete',
    T:  '10',
    '9': '9', '8': '8', '7': '7',
    '6': '6', '5': '5', '4': '4',
    '3': '3', '2': '2',
};


// ================================================================
// BLOCO 2: FUNÇÃO AUXILIAR
// ================================================================

// Converte o código da carta em objeto com todas as informações
// "Kh" → { valor: 'K', naipe: 'h', simbolo: '♥', cor: '#DC2626', nome: 'Rei de Copas' }
function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;

    const naipe  = codigo.slice(-1).toLowerCase();  // último caractere
    const valor  = codigo.slice(0, -1);             // tudo antes do último

    return {
        codigo,
        valor,
        naipe,
        simbolo:  SIMBOLO_NAIPE[naipe] || naipe,
        cor:      COR_NAIPE[naipe]     || '#111827',
        nome:     `${NOME_VALOR[valor] || valor} de ${NOME_NAIPE[naipe] || naipe}`,
    };
}


// ================================================================
// BLOCO 3: COMPONENTE PRINCIPAL
// ================================================================

export default function CartasJogador({ cartas = [], foldado = false, fase = '' }) {

    // Sem cartas — rodada não começou ou não há cartas ainda
    if (!cartas || cartas.length === 0) {
        // Só mostra slots vazios se a rodada estiver ativa
        if (fase === 'AGUARDANDO' || !fase) return null;

        return (
            <div style={estilos.container}>
                <SlotVazio />
                <SlotVazio />
            </div>
        );
    }

    const carta1 = parsearCarta(cartas[0]);
    const carta2 = parsearCarta(cartas[1]);

    return (
        <div style={estilos.container}>

            {/* Indicador de fold */}
            {foldado && (
                <div style={estilos.badgeFold}>
                    FOLD
                </div>
            )}

            {/* As duas cartas */}
            <div style={{
                ...estilos.cartasWrapper,
                // Quando foldado, as cartas ficam sobrepostas e rotacionadas
                transform: foldado ? 'rotate(-5deg)' : 'none',
                opacity:   foldado ? 0.4 : 1,
                filter:    foldado ? 'grayscale(60%)' : 'none',
                transition: 'all 0.3s ease',
            }}>
                {carta1 && (
                    <CartaVisual
                        carta={carta1}
                        rotacao={foldado ? -8 : -4}
                        zIndex={1}
                    />
                )}
                {carta2 && (
                    <CartaVisual
                        carta={carta2}
                        rotacao={foldado ? 8 : 4}
                        zIndex={2}
                    />
                )}
            </div>

            {/* Label "Suas cartas" */}
            {!foldado && (
                <p style={estilos.label}>Suas cartas</p>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE CartaVisual
//
// Renderiza uma carta de baralho com visual realista.
// Cada carta tem:
//   → Valor e naipe no canto superior esquerdo
//   → Naipe grande no centro
//   → Valor e naipe no canto inferior direito (rotacionado 180°)
//
// Props:
//   carta   → objeto da carta (valor, naipe, simbolo, cor)
//   rotacao → graus de rotação para o efeito "leque"
//   zIndex  → qual carta fica na frente
// ================================================================

function CartaVisual({ carta, rotacao = 0, zIndex = 1 }) {
    return (
        <div
            style={{
                ...estilos.carta,
                transform: `rotate(${rotacao}deg)`,
                zIndex,
            }}
            // aria-label: descreve a carta para leitores de tela
            aria-label={carta.nome}
            role="img"
        >
            {/* ---- Canto superior esquerdo ---- */}
            <div style={estilos.cantoSuperior}>
                <span style={{ ...estilos.cantoValor, color: carta.cor }}>
                    {carta.valor}
                </span>
                <span style={{ ...estilos.cantoNaipe, color: carta.cor }}>
                    {carta.simbolo}
                </span>
            </div>

            {/* ---- Naipe central grande ---- */}
            <span style={{
                ...estilos.naipeCentral,
                color:  carta.cor,
                // Sombra colorida sutil no naipe central
                filter: `drop-shadow(0 1px 2px ${carta.cor}40)`,
            }}>
                {carta.simbolo}
            </span>

            {/* ---- Canto inferior direito (rotacionado 180°) ---- */}
            <div style={{
                ...estilos.cantoSuperior,
                top:       'auto',
                left:      'auto',
                bottom:    '6px',
                right:     '6px',
                transform: 'rotate(180deg)',
            }}>
                <span style={{ ...estilos.cantoValor, color: carta.cor }}>
                    {carta.valor}
                </span>
                <span style={{ ...estilos.cantoNaipe, color: carta.cor }}>
                    {carta.simbolo}
                </span>
            </div>

            {/* Brilho sutil no topo da carta — efeito de profundidade */}
            <div style={estilos.brilho} />

        </div>
    );
}


// ================================================================
// BLOCO 5: COMPONENTE SlotVazio
// Placeholder de carta quando ainda não há cartas
// ================================================================

function SlotVazio() {
    return (
        <div style={estilos.slotVazio}>
            <span style={estilos.slotVazioIcone}>🃏</span>
        </div>
    );
}


// ================================================================
// BLOCO 6: ESTILOS
// ================================================================

const estilos = {

    // Container principal — centraliza as cartas
    container: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '6px',
        position:       'relative',
        padding:        '8px 0',
    },

    // Badge de FOLD sobre as cartas
    badgeFold: {
        position:     'absolute',
        top:          '-8px',
        left:         '50%',
        transform:    'translateX(-50%)',
        background:   '#EF4444',
        color:        'white',
        fontSize:     '10px',
        fontWeight:   '700',
        padding:      '2px 8px',
        borderRadius: '4px',
        letterSpacing: '0.08em',
        zIndex:       10,
    },

    // Wrapper das 2 cartas juntas — aplica o efeito leque
    cartasWrapper: {
        display:  'flex',
        gap:      '6px',        // espaço entre as cartas
        position: 'relative',
    },

    // Carta individual
    // Tamanho maior que as cartas comunitárias para dar destaque
    carta: {
        width:          '64px',
        height:         '90px',
        background:     '#FFFFFF',
        borderRadius:   '8px',
        border:         '1px solid #D1D5DB',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        position:       'relative',
        flexShrink:     0,
        // Sombra mais pronunciada para dar sensação de carta física
        boxShadow:      '0 4px 16px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
        transition:     'transform 0.2s ease',
        overflow:       'hidden',
    },

    // Canto superior esquerdo da carta
    cantoSuperior: {
        position:      'absolute',
        top:           '6px',
        left:          '6px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        lineHeight:    1,
        gap:           '1px',
    },

    // Valor no canto (A, K, Q, J, T, 2-9)
    cantoValor: {
        fontSize:   '16px',
        fontWeight: '800',
        lineHeight: 1,
        fontFamily: 'Georgia, serif', // fonte serifada para estilo clássico
    },

    // Naipe no canto (♥ ♦ ♠ ♣)
    cantoNaipe: {
        fontSize:   '12px',
        lineHeight: 1,
    },

    // Naipe grande no centro da carta
    naipeCentral: {
        fontSize:   '32px',
        lineHeight: 1,
        userSelect: 'none', // impede seleção acidental do texto
    },

    // Brilho sutil no topo — simula luz caindo na carta
    brilho: {
        position:   'absolute',
        top:        0,
        left:       0,
        right:      0,
        height:     '40%',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.15), transparent)',
        borderRadius: '8px 8px 0 0',
        pointerEvents: 'none', // não interfere em cliques
    },

    // Label "Suas cartas"
    label: {
        fontSize:      '10px',
        color:         'rgba(255,255,255,0.35)',
        margin:        0,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight:    '500',
    },

    // Slot vazio (quando não há cartas ainda)
    slotVazio: {
        width:          '64px',
        height:         '90px',
        background:     'rgba(255,255,255,0.04)',
        borderRadius:   '8px',
        border:         '1px dashed rgba(255,255,255,0.15)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },

    slotVazioIcone: {
        fontSize:  '24px',
        opacity:   0.3,
    },
};
