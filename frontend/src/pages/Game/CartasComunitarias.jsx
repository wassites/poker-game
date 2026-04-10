/* ================================================================
   ARQUIVO: frontend/src/pages/Game/CartasComunitarias.jsx

   CONCEITO GERAL:
   Exibe as 5 cartas comunitárias no centro da mesa:
     → Flop  : primeiras 3 cartas reveladas juntas
     → Turn  : 4ª carta revelada
     → River : 5ª e última carta revelada

   NO POKER TEXAS HOLD'EM:
   As cartas comunitárias são compartilhadas por todos os jogadores.
   Cada jogador combina suas 2 cartas privadas com as 5 comunitárias
   para formar a melhor mão de 5 cartas possível.

   REVELAÇÃO DAS CARTAS:
   O servidor envia as cartas conforme a fase avança:
     AGUARDANDO → []                    (nenhuma carta)
     PRE-FLOP   → []                    (nenhuma carta)
     FLOP       → ['As', 'Kh', '2d']   (3 cartas)
     TURN       → ['As', 'Kh', '2d', 'Jc'] (4 cartas)
     RIVER      → ['As', 'Kh', '2d', 'Jc', '9s'] (5 cartas)
     SHOWDOWN   → ['As', 'Kh', '2d', 'Jc', '9s'] (5 cartas)

   ANIMAÇÃO:
   Cada carta nova aparece com uma animação de "virada".
   Cartas já reveladas ficam estáticas.
   Slots futuros ficam como placeholders escuros.

   PROPS:
     cartas → array de códigos das cartas comunitárias
              ex: ['As', 'Kh', '2d'] no flop
     fase   → string: fase atual do jogo
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

const COR_NAIPE = {
    h: '#DC2626',  // copas    ♥ vermelho
    d: '#DC2626',  // ouros    ♦ vermelho
    s: '#111827',  // espadas  ♠ preto escuro
    c: '#111827',  // paus     ♣ preto escuro
};

const SIMBOLO_NAIPE = {
    h: '♥',
    d: '♦',
    s: '♠',
    c: '♣',
};

const NOME_NAIPE = {
    h: 'Copas',
    d: 'Ouros',
    s: 'Espadas',
    c: 'Paus',
};

const NOME_VALOR = {
    A: 'Ás', K: 'Rei', Q: 'Dama', J: 'Valete', T: '10',
    '9': '9', '8': '8', '7': '7', '6': '6',
    '5': '5', '4': '4', '3': '3', '2': '2',
};

// Agrupa as cartas por fase para mostrar o label correto
// Ex: as 3 primeiras são o "Flop", a 4ª é o "Turn", etc.
const LABEL_POR_INDICE = {
    0: 'Flop',
    1: 'Flop',
    2: 'Flop',
    3: 'Turn',
    4: 'River',
};


// ================================================================
// BLOCO 2: FUNÇÃO AUXILIAR
// ================================================================

function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;

    const naipe = codigo.slice(-1).toLowerCase();
    const valor = codigo.slice(0, -1);

    return {
        codigo,
        valor,
        naipe,
        simbolo: SIMBOLO_NAIPE[naipe] || naipe,
        cor:     COR_NAIPE[naipe]     || '#111827',
        nome:    `${NOME_VALOR[valor] || valor} de ${NOME_NAIPE[naipe] || naipe}`,
    };
}


// ================================================================
// BLOCO 3: COMPONENTE PRINCIPAL
// ================================================================

export default function CartasComunitarias({ cartas = [], fase = '' }) {

    // Total de slots sempre é 5 (independente de quantas cartas há)
    // Isso garante que o layout não "pula" quando uma carta é revelada
    const TOTAL_SLOTS = 5;

    // Identifica qual grupo de cartas acabou de ser revelado
    // para aplicar uma animação diferente nas cartas novas
    const novasCartas = obterNovasCartas(cartas, fase);

    return (
        <div style={estilos.container}>

            {/* Label da fase atual acima das cartas */}
            {cartas.length > 0 && (
                <p style={estilos.labelFase}>
                    {getLabelFase(fase, cartas.length)}
                </p>
            )}

            {/* Os 5 slots de cartas */}
            <div style={estilos.slots}>
                {Array.from({ length: TOTAL_SLOTS }).map((_, index) => {
                    const codigo = cartas[index];
                    const carta  = parsearCarta(codigo);
                    const eNova  = novasCartas.includes(index);

                    // Divisor visual entre Flop e Turn/River
                    // Depois do índice 2 (3ª carta = fim do flop) adiciona um espaço
                    const temDivisor = index === 3 || index === 4;

                    return (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>

                            {/* Espaço extra entre flop e turn/river */}
                            {temDivisor && (
                                <div style={estilos.divisor} />
                            )}

                            {/* Slot da carta */}
                            {carta ? (
                                <CartaRevelada
                                    carta={carta}
                                    animada={eNova}
                                    indice={index}
                                />
                            ) : (
                                <SlotVazio indice={index} />
                            )}

                        </div>
                    );
                })}
            </div>

        </div>
    );
}


// ================================================================
// BLOCO 4: FUNÇÕES AUXILIARES DO COMPONENTE
// ================================================================

// Retorna os índices das cartas que acabaram de ser reveladas
// nesta fase — para aplicar animação apenas nelas
function obterNovasCartas(cartas, fase) {
    switch (fase) {
        case 'FLOP':     return [0, 1, 2];   // 3 cartas novas
        case 'TURN':     return [3];          // 1 carta nova
        case 'RIVER':    return [4];          // 1 carta nova
        case 'SHOWDOWN': return [];           // nenhuma nova (já reveladas)
        default:         return [];
    }
}

// Retorna o label textual da fase atual
function getLabelFase(fase, qtdCartas) {
    if (qtdCartas === 0) return '';
    switch (fase) {
        case 'FLOP':     return '🂠 Flop';
        case 'TURN':     return '🂠 Turn';
        case 'RIVER':    return '🂠 River';
        case 'SHOWDOWN': return '🏆 Showdown';
        default:         return '';
    }
}


// ================================================================
// BLOCO 5: COMPONENTE CartaRevelada
//
// Uma carta virada para cima com animação opcional.
// A animação simula a "virada" da carta quando revelada.
// ================================================================

function CartaRevelada({ carta, animada = false, indice = 0 }) {

    // Delay de animação escalonado para cartas do flop
    // Carta 0 aparece imediatamente, 1 após 100ms, 2 após 200ms
    const delayMs = indice < 3 ? indice * 100 : 0;

    return (
        <>
            {/* CSS da animação injetado uma vez */}
            <style>{`
                @keyframes virarCarta {
                    0%   { transform: rotateY(90deg) scale(0.8); opacity: 0; }
                    50%  { transform: rotateY(45deg) scale(0.9); opacity: 0.5; }
                    100% { transform: rotateY(0deg)  scale(1);   opacity: 1; }
                }
                .carta-revelada {
                    animation: virarCarta 0.4s ease forwards;
                }
            `}</style>

            <div
                className={animada ? 'carta-revelada' : ''}
                style={{
                    ...estilos.carta,
                    animationDelay: animada ? `${delayMs}ms` : '0ms',
                }}
                aria-label={carta.nome}
                role="img"
            >
                {/* Canto superior esquerdo */}
                <div style={estilos.canto}>
                    <span style={{ ...estilos.cantoValor, color: carta.cor }}>
                        {carta.valor}
                    </span>
                    <span style={{ ...estilos.cantoNaipe, color: carta.cor }}>
                        {carta.simbolo}
                    </span>
                </div>

                {/* Naipe central */}
                <span style={{
                    fontSize:   '20px',
                    color:      carta.cor,
                    lineHeight: 1,
                    userSelect: 'none',
                    filter:     `drop-shadow(0 1px 2px ${carta.cor}30)`,
                }}>
                    {carta.simbolo}
                </span>

                {/* Canto inferior direito (invertido) */}
                <div style={{
                    ...estilos.canto,
                    top:       'auto',
                    left:      'auto',
                    bottom:    '4px',
                    right:     '4px',
                    transform: 'rotate(180deg)',
                }}>
                    <span style={{ ...estilos.cantoValor, color: carta.cor }}>
                        {carta.valor}
                    </span>
                    <span style={{ ...estilos.cantoNaipe, color: carta.cor }}>
                        {carta.simbolo}
                    </span>
                </div>

                {/* Brilho sutil no topo */}
                <div style={estilos.brilho} />
            </div>
        </>
    );
}


// ================================================================
// BLOCO 6: COMPONENTE SlotVazio
//
// Placeholder escuro para cartas ainda não reveladas.
// Mantém o espaço reservado para não "pular" o layout.
// ================================================================

function SlotVazio({ indice }) {
    return (
        <div
            style={estilos.slotVazio}
            aria-label={`Slot ${indice + 1} — carta não revelada`}
            role="img"
        >
            {/* Padrão decorativo no verso */}
            <div style={estilos.slotVazioInterno} />
        </div>
    );
}


// ================================================================
// BLOCO 7: ESTILOS
// ================================================================

const estilos = {

    // Container geral
    container: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '6px',
    },

    // Label da fase (Flop, Turn, River, Showdown)
    labelFase: {
        fontSize:      '10px',
        color:         'rgba(255,255,255,0.4)',
        margin:        0,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight:    '600',
    },

    // Container dos 5 slots lado a lado
    slots: {
        display:    'flex',
        gap:        '4px',
        alignItems: 'center',
    },

    // Linha divisória entre Flop e Turn/River
    // Ajuda o jogador a identificar visualmente os grupos de cartas
    divisor: {
        width:        '1px',
        height:       '36px',
        background:   'rgba(255,255,255,0.1)',
        marginRight:  '2px',
        borderRadius: '1px',
    },

    // Carta revelada
    carta: {
        width:          '44px',
        height:         '62px',
        background:     '#FFFFFF',
        borderRadius:   '5px',
        border:         '1px solid #E5E7EB',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        position:       'relative',
        flexShrink:     0,
        boxShadow:      '0 3px 10px rgba(0,0,0,0.5)',
        overflow:       'hidden',
    },

    // Canto superior esquerdo da carta
    canto: {
        position:      'absolute',
        top:           '4px',
        left:          '4px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '0px',
        lineHeight:    1,
    },

    cantoValor: {
        fontSize:   '12px',
        fontWeight: '800',
        lineHeight: 1,
        fontFamily: 'Georgia, serif',
    },

    cantoNaipe: {
        fontSize:   '10px',
        lineHeight: 1,
    },

    // Brilho no topo da carta
    brilho: {
        position:      'absolute',
        top:           0,
        left:          0,
        right:         0,
        height:        '35%',
        background:    'linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)',
        borderRadius:  '5px 5px 0 0',
        pointerEvents: 'none',
    },

    // Slot vazio (carta não revelada)
    slotVazio: {
        width:          '44px',
        height:         '62px',
        background:     'linear-gradient(135deg, #1a3a5c, #0f2540)',
        borderRadius:   '5px',
        border:         '1px solid rgba(255,255,255,0.08)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        boxShadow:      'inset 0 2px 6px rgba(0,0,0,0.4)',
        flexShrink:     0,
    },

    // Padrão interno do verso da carta
    slotVazioInterno: {
        width:        '32px',
        height:       '48px',
        borderRadius: '3px',
        border:       '1px solid rgba(255,255,255,0.06)',
        background:   'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px)',
    },
};
