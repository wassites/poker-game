/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Mesa.jsx

   CONCEITO GERAL:
   O feltro verde da mesa de poker com os jogadores posicionados
   ao redor em formato oval/circular.

   RESPONSABILIDADE:
   Este componente cuida APENAS do visual da mesa:
     → O feltro verde oval
     → As cartas comunitárias no centro (flop, turn, river)
     → O pote no centro
     → Os assentos dos jogadores ao redor

   O QUE ELE NÃO FAZ:
   → Não processa ações (fold, raise, etc.) — isso é do ActionBar
   → Não escuta Socket.io — isso é do Game/index.jsx
   → Não mostra as cartas do jogador local — isso é do Game/index.jsx

   POSICIONAMENTO DOS JOGADORES:
   Usamos trigonometria para calcular as posições em círculo.
   Cada jogador ocupa um "assento" posicionado em ângulo ao redor
   do centro da mesa.

   Ângulo = (índice / total) × 360°
   X = centro + raio × cos(ângulo)
   Y = centro + raio × sin(ângulo)

   Com 2 jogadores: um em cima, um embaixo (180° de distância)
   Com 6 jogadores: distribuídos a cada 60°
   Com 9 jogadores: distribuídos a cada 40°

   PROPS:
     mesa         → objeto completo do estado da mesa
     meuUid       → uid do jogador logado (para destacar)
     minhasCartas → array com os códigos das cartas do jogador
================================================================ */

import Jogador from './Jogador';


// ================================================================
// BLOCO 1: FUNÇÕES AUXILIARES
// ================================================================

// Converte código de carta ("As", "Kh", "2d") em objeto legível
// "As" → { valor: 'A', naipe: 's', simbolo: '♠', cor: '#1a1a2e' }
const COR_NAIPE = {
    h: '#DC2626', // copas    ♥
    d: '#DC2626', // ouros    ♦
    s: '#1a1a2e', // espadas  ♠
    c: '#1a1a2e', // paus     ♣
};

const SIMBOLO_NAIPE = {
    h: '♥',
    d: '♦',
    s: '♠',
    c: '♣',
};

function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;
    const naipe = codigo.slice(-1).toLowerCase();
    const valor = codigo.slice(0, -1);
    return {
        codigo,
        valor,
        naipe,
        simbolo: SIMBOLO_NAIPE[naipe] || naipe,
        cor:     COR_NAIPE[naipe]     || '#1a1a2e',
    };
}

// Formata número com separador de milhar
function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}

// Calcula a posição X e Y (em %) de cada assento ao redor da mesa
// O assento do jogador local (meuUid) sempre fica na base (ângulo 90°)
function calcularPosicoes(jogadoresArray, meuUid) {
    const total = jogadoresArray.length;

    // Encontra o índice do jogador local para rotacionar os assentos
    // O jogador local sempre aparece na parte de baixo da mesa
    const meuIndex = jogadoresArray.findIndex(([uid]) => uid === meuUid);
    const offset   = meuIndex >= 0 ? meuIndex : 0;

    return jogadoresArray.map(([uid, jogador], index) => {
        // Rotaciona para que o jogador local fique na base (270° = baixo)
        const indiceRelativo = (index - offset + total) % total;
        const angulo         = (indiceRelativo / total) * 360 - 90;
        const radiano        = (angulo * Math.PI) / 180;

        // Raios elípticos — a mesa é oval, não redonda
        // raioX controla a largura do elipse
        // raioY controla a altura do elipse
        const raioX = 40; // % da largura do container
        const raioY = 32; // % da altura do container

        return {
            uid,
            jogador,
            esquerda: 50 + raioX * Math.cos(radiano),
            topo:     50 + raioY * Math.sin(radiano),
            souEu:    uid === meuUid,
        };
    });
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Mesa({ mesa, meuUid, minhasCartas = [] }) {

    if (!mesa) return null;

    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const posicoes       = calcularPosicoes(jogadoresArray, meuUid);
    const cartasCom      = (mesa.cartasComunitarias || []).map(parsearCarta);

    return (
        <div style={estilos.container}>
            {/* ---- FELTRO VERDE ---- */}
            <div style={estilos.feltro}>

                {/* Borda decorativa interna */}
                <div style={estilos.feltroInterno}>

                    {/* ---- CENTRO DA MESA ---- */}
                    <div style={estilos.centro}>

                        {/* Cartas comunitárias (flop, turn, river) */}
                        <div style={estilos.cartasComunidade}>
                            {mesa.fase === 'AGUARDANDO' ? (
                                <p style={estilos.textoAguardando}>
                                    Aguardando jogadores...
                                </p>
                            ) : cartasCom.length > 0 ? (
                                // Sempre exibe 5 slots — preenche com vazio
                                Array.from({ length: 5 }).map((_, i) => {
                                    const carta = cartasCom[i];
                                    return carta
                                        ? <CartaComunitaria key={i} carta={carta} />
                                        : <CartaComunitariaVazia key={i} />;
                                })
                            ) : (
                                <p style={estilos.textoAguardando}>
                                    Distribuindo cartas...
                                </p>
                            )}
                        </div>

                        {/* Pote central */}
                        {mesa.pote > 0 && (
                            <div style={estilos.pote}>
                                <span style={estilos.poteIcone}>💰</span>
                                <span style={estilos.poteValor}>
                                    ₿C {fmt(mesa.pote)}
                                </span>
                            </div>
                        )}

                        {/* Fase atual */}
                        {mesa.fase && mesa.fase !== 'AGUARDANDO' && (
                            <div style={estilos.faseContainer}>
                                <span style={estilos.faseTexto}>
                                    {mesa.fase.replace('-', ' ')}
                                </span>
                            </div>
                        )}

                    </div>

                    {/* ---- JOGADORES AO REDOR ---- */}
                    {posicoes.map(({ uid, jogador, esquerda, topo, souEu }) => (
                        <div
                            key={uid}
                            style={{
                                position:  'absolute',
                                left:      `${esquerda}%`,
                                top:       `${topo}%`,
                                transform: 'translate(-50%, -50%)',
                                zIndex:    3,
                            }}
                        >
                            <Jogador
                                jogador={jogador}
                                uid={uid}
                                souEu={souEu}
                                ehVez={mesa.vezDeQuem === uid}
                                cartasPrivadas={souEu ? minhasCartas : []}
                                ehDealer={mesa.dealer === uid}
                                ehSB={mesa.smallBlindUid === uid}
                                ehBB={mesa.bigBlindUid   === uid}
                            />
                        </div>
                    ))}

                </div>
            </div>
        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE CartaComunitaria
// Uma carta virada para cima no centro da mesa
// ================================================================

function CartaComunitaria({ carta }) {
    return (
        <div style={estilos.carta}>
            {/* Valor no canto superior esquerdo */}
            <span style={{ ...estilos.cartaValorCanto, color: carta.cor }}>
                {carta.valor}{carta.simbolo}
            </span>

            {/* Naipe grande no centro */}
            <span style={{ fontSize: '20px', color: carta.cor, lineHeight: 1 }}>
                {carta.simbolo}
            </span>

            {/* Valor no canto inferior direito (invertido) */}
            <span style={{
                ...estilos.cartaValorCanto,
                bottom:    '3px',
                top:       'auto',
                left:      'auto',
                right:     '3px',
                transform: 'rotate(180deg)',
                color:     carta.cor,
            }}>
                {carta.valor}{carta.simbolo}
            </span>
        </div>
    );
}

// Slot vazio para carta ainda não revelada
function CartaComunitariaVazia() {
    return (
        <div style={{
            ...estilos.carta,
            background:   'rgba(255,255,255,0.04)',
            border:       '1px dashed rgba(255,255,255,0.15)',
            boxShadow:    'none',
        }} />
    );
}


// ================================================================
// BLOCO 4: ESTILOS
// ================================================================

const estilos = {

    // Container externo — define o tamanho da área da mesa
    container: {
        width:          '100%',
        maxWidth:       '480px',
        margin:         '0 auto',
        padding:        '8px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },

    // Feltro verde oval
    // background: gradiente radial que simula a iluminação central
    // borderRadius: 50% transforma o retângulo em oval
    feltro: {
        width:        '100%',
        aspectRatio:  '1.5 / 1',    // proporção largura:altura = 1.5:1 (oval)
        background:   'radial-gradient(ellipse at center, #1f6b35 0%, #145228 50%, #0c3d1e 100%)',
        borderRadius: '50%',
        border:       '8px solid #0a2d14',
        boxShadow:    `
            0 0 0 3px #1a4a22,
            0 8px 40px rgba(0,0,0,0.7),
            inset 0 0 80px rgba(0,0,0,0.3)
        `,
        position:     'relative',
        overflow:     'visible',     // jogadores podem sair da borda oval
    },

    // Borda interna decorativa do feltro
    feltroInterno: {
        position:     'absolute',
        inset:        '8px',
        borderRadius: '50%',
        border:       '2px solid rgba(255,255,255,0.06)',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
    },

    // Centro da mesa — cartas comunitárias + pote
    centro: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '8px',
        zIndex:         2,
        padding:        '0 8px',
    },

    // Container das 5 cartas comunitárias
    cartasComunidade: {
        display:        'flex',
        gap:            '4px',
        alignItems:     'center',
        justifyContent: 'center',
        flexWrap:       'nowrap',
    },

    // Texto quando não há cartas ainda
    textoAguardando: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.3)',
        margin:    0,
        textAlign: 'center',
        fontStyle: 'italic',
    },

    // Container do pote
    pote: {
        display:      'flex',
        alignItems:   'center',
        gap:          '4px',
        background:   'rgba(0,0,0,0.45)',
        borderRadius: '20px',
        padding:      '3px 10px',
        border:       '1px solid rgba(245,158,11,0.25)',
    },

    poteIcone: {
        fontSize:   '12px',
        lineHeight: 1,
    },

    poteValor: {
        fontSize:   '12px',
        fontWeight: '700',
        color:      '#F59E0B',
    },

    // Badge da fase atual
    faseContainer: {
        background:   'rgba(0,0,0,0.3)',
        borderRadius: '10px',
        padding:      '2px 8px',
    },

    faseTexto: {
        fontSize:      '9px',
        color:         'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight:    '600',
    },

    // Carta comunitária
    carta: {
        width:          '36px',
        height:         '52px',
        background:     '#FFFFFF',
        borderRadius:   '4px',
        border:         '1px solid #D1D5DB',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        position:       'relative',
        flexShrink:     0,
        boxShadow:      '0 2px 6px rgba(0,0,0,0.4)',
    },

    // Valor da carta nos cantos
    cartaValorCanto: {
        position:   'absolute',
        top:        '3px',
        left:       '3px',
        fontSize:   '9px',
        fontWeight: '800',
        lineHeight: 1,
    },
};
