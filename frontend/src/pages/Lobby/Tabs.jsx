/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Tabs.jsx

   CONCEITO GERAL:
   Barra de navegação entre as seções do Lobby.
   Cada tab leva para uma seção diferente:
     → Públicas   : mesas abertas para qualquer jogador
     → Privadas   : mesas com senha (convite)
     → Ranking    : top jogadores por saldo ₿C
     → Loja       : comprar ₿C e temas de cartas

   DESIGN MOBILE-FIRST:
   As tabs ficam na parte superior, logo abaixo do Header.
   São botões largos e fáceis de tocar com o polegar.
   A tab ativa tem um indicador visual (linha + cor + texto destacado).

   PROPS:
     tabAtiva   → string: id da tab ativa ('publicas', 'privadas', etc.)
     onMudar    → function(tabId): chamada ao trocar de tab
     qtdPublicas → number: quantidade de mesas públicas (badge)
     qtdPrivadas → number: quantidade de mesas privadas (badge)
================================================================ */


// ================================================================
// BLOCO 1: DEFINIÇÃO DAS TABS
//
// Definir as tabs como constante fora do componente tem duas vantagens:
// 1. Não recria o array a cada render (performance)
// 2. Fácil de adicionar ou remover tabs no futuro
//
// Estrutura de cada tab:
//   id      → identificador único usado pelo index.jsx
//   label   → texto exibido no botão
//   icone   → emoji que aparece antes do texto
//   badgeKey → qual prop usar para o contador (null = sem badge)
// ================================================================

const DEFINICAO_TABS = [
    {
        id:       'publicas',
        label:    'Públicas',
        icone:    '🌐',
        badgeKey: 'qtdPublicas',  // mostra quantas mesas públicas existem
    },
    {
        id:       'privadas',
        label:    'Privadas',
        icone:    '🔒',
        badgeKey: 'qtdPrivadas',  // mostra quantas mesas privadas existem
    },
    {
        id:       'ranking',
        label:    'Ranking',
        icone:    '🏆',
        badgeKey: null,           // sem badge no ranking
    },
    {
        id:       'loja',
        label:    'Loja',
        icone:    '₿C',          // símbolo da moeda como ícone
        badgeKey: null,
    },
];

// Cores de cada tab quando ativa
// Cada tab tem sua própria cor para identidade visual
const CORES_TABS = {
    publicas: '#22C55E',   // verde — mesas abertas, acessíveis
    privadas: '#3B82F6',   // azul — privado, exclusivo
    ranking:  '#F59E0B',   // dourado — troféu, conquista
    loja:     '#D97706',   // âmbar — moeda, valor
};


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Tabs({ tabAtiva, onMudar, qtdPublicas = 0, qtdPrivadas = 0 }) {

    // Mapa de badges para acessar pelo badgeKey
    // Assim adicionamos novas tabs com badges sem mudar a lógica
    const badges = {
        qtdPublicas,
        qtdPrivadas,
    };

    return (
        <nav style={estilos.nav} role="tablist" aria-label="Seções do lobby">

            {DEFINICAO_TABS.map(tab => {
                const ativa    = tabAtiva === tab.id;
                const corAtiva = CORES_TABS[tab.id];
                const badge    = tab.badgeKey ? badges[tab.badgeKey] : null;

                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={ativa}
                        onClick={() => onMudar(tab.id)}
                        style={{
                            ...estilos.tab,
                            // Cor do texto muda quando ativa
                            color: ativa ? corAtiva : 'rgba(255,255,255,0.4)',
                            // Fundo sutil quando ativa
                            background: ativa
                                ? `${corAtiva}12`  // 12 em hex = ~7% opacidade
                                : 'transparent',
                        }}
                    >
                        {/* Ícone */}
                        <span style={{
                            fontSize:   tab.id === 'loja' ? '11px' : '15px',
                            fontWeight: tab.id === 'loja' ? '700'  : '400',
                            lineHeight: 1,
                            color:      tab.id === 'loja' && ativa ? '#D97706' : 'inherit',
                        }}>
                            {tab.icone}
                        </span>

                        {/* Label + badge opcional */}
                        <div style={estilos.labelContainer}>
                            <span style={{
                                ...estilos.label,
                                fontWeight: ativa ? '600' : '400',
                            }}>
                                {tab.label}
                            </span>

                            {/* Badge com contador — só aparece se tiver mesas */}
                            {badge > 0 && (
                                <span style={{
                                    ...estilos.badge,
                                    background: ativa ? corAtiva : 'rgba(255,255,255,0.15)',
                                    color:      ativa ? '#fff'    : 'rgba(255,255,255,0.6)',
                                }}>
                                    {badge > 99 ? '99+' : badge}
                                </span>
                            )}
                        </div>

                        {/* Linha indicadora na base — só aparece na tab ativa */}
                        <div style={{
                            ...estilos.indicador,
                            // opacity controla visibilidade com transição suave
                            opacity:    ativa ? 1 : 0,
                            background: corAtiva,
                        }} />

                    </button>
                );
            })}

        </nav>
    );
}


// ================================================================
// BLOCO 3: ESTILOS
// ================================================================

const estilos = {

    // Container da navegação
    nav: {
        display:         'flex',
        background:      '#0d1424',
        borderBottom:    '1px solid rgba(255,255,255,0.06)',
        // Permite scroll horizontal se as tabs não couberem
        // (útil se adicionar mais tabs no futuro)
        overflowX:       'auto',
        // Esconde a scrollbar mas mantém a funcionalidade
        scrollbarWidth:  'none',       // Firefox
        msOverflowStyle: 'none',       // IE/Edge
        WebkitScrollbar: { display: 'none' }, // Chrome/Safari
    },

    // Cada botão de tab
    tab: {
        flex:           1,             // divide o espaço igualmente
        minWidth:       '70px',        // mínimo para não ficar espremido
        padding:        '8px 4px 0',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '3px',
        border:         'none',
        cursor:         'pointer',
        position:       'relative',
        transition:     'color 0.2s, background 0.2s',
        // Remove o destaque azul padrão do toque no mobile
        WebkitTapHighlightColor: 'transparent',
        outline:        'none',
        // Área de toque generosa para mobile
        minHeight:      '52px',
    },

    // Container do label + badge
    labelContainer: {
        display:    'flex',
        alignItems: 'center',
        gap:        '4px',
    },

    // Texto da tab
    label: {
        fontSize:   '11px',
        lineHeight: 1,
        transition: 'font-weight 0.2s',
        // Evita que o texto mude o tamanho do botão ao trocar de peso
        // (font-weight muda a largura do texto)
        letterSpacing: '-0.01em',
    },

    // Badge com contador de mesas
    badge: {
        fontSize:     '9px',
        fontWeight:   '600',
        padding:      '1px 4px',
        borderRadius: '10px',
        lineHeight:   1.4,
        minWidth:     '16px',
        textAlign:    'center',
        transition:   'background 0.2s, color 0.2s',
    },

    // Linha indicadora na base da tab ativa
    indicador: {
        position:     'absolute',
        bottom:       0,
        left:         '20%',
        right:        '20%',
        height:       '2px',
        borderRadius: '2px 2px 0 0',
        transition:   'opacity 0.2s',
    },
};
