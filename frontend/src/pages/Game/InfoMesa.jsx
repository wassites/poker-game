/* ================================================================
   ARQUIVO: frontend/src/pages/Game/InfoMesa.jsx

   CONCEITO GERAL:
   Painel de informações da mesa exibido no topo da tela do jogo.
   Mostra ao jogador os dados essenciais da partida em andamento:
     → Nome da mesa
     → Fase atual (Pré-Flop, Flop, Turn, River, Showdown)
     → Pote total acumulado
     → Blinds (Small Blind e Big Blind)
     → Maior aposta atual da rodada

   POR QUE ESSAS INFORMAÇÕES SÃO IMPORTANTES:
     Pote       → quanto o jogador pode ganhar se vencer
     Fase       → em qual momento da mão estamos
     Big Blind  → referência para calcular apostas (ex: "abrir 3x o BB")
     Maior Aposta → quanto precisa pagar para continuar (call)

   DESIGN:
   Compacto e horizontal para não ocupar muito espaço na tela mobile.
   As informações mais importantes (pote e fase) ficam em destaque.
   Blinds ficam em tamanho menor pois mudam menos durante a mão.

   PROPS:
     mesa → objeto completo do estado da mesa
            { nome, fase, pote, smallBlind, bigBlind, maiorAposta }
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

// Mapeamento de fase para label amigável e cor
const CONFIG_FASE = {
    'AGUARDANDO': { label: 'Aguardando',  cor: '#6B7280', icone: '⏳' },
    'PRE-FLOP':   { label: 'Pré-Flop',   cor: '#3B82F6', icone: '🃏' },
    'FLOP':       { label: 'Flop',        cor: '#10B981', icone: '🃏' },
    'TURN':       { label: 'Turn',        cor: '#F59E0B', icone: '🃏' },
    'RIVER':      { label: 'River',       cor: '#EF4444', icone: '🃏' },
    'SHOWDOWN':   { label: 'Showdown',    cor: '#8B5CF6', icone: '🏆' },
};

// Formata número com separador de milhar
function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function InfoMesa({ mesa }) {

    if (!mesa) return null;

    const configFase  = CONFIG_FASE[mesa.fase] || CONFIG_FASE['AGUARDANDO'];
    const temAposta   = (mesa.maiorAposta || 0) > 0;

    return (
        <div style={estilos.container}>

            {/* ---- LINHA SUPERIOR: Nome + Fase ---- */}
            <div style={estilos.linhaTopo}>

                {/* Nome da mesa */}
                <p style={estilos.nomeMesa}>
                    🃏 {mesa.nome || 'Mesa de Poker'}
                </p>

                {/* Badge da fase atual */}
                <div style={{
                    ...estilos.badgeFase,
                    background: `${configFase.cor}20`,
                    border:     `1px solid ${configFase.cor}50`,
                    color:       configFase.cor,
                }}>
                    {/* Ponto pulsante quando em jogo */}
                    {mesa.fase !== 'AGUARDANDO' && mesa.fase !== 'SHOWDOWN' && (
                        <span style={{
                            ...estilos.pontoPulsante,
                            background: configFase.cor,
                        }} />
                    )}
                    {configFase.icone} {configFase.label}
                </div>

            </div>

            {/* ---- LINHA INFERIOR: Pote + Blinds ---- */}
            <div style={estilos.linhaInfo}>

                {/* Pote total */}
                <InfoItem
                    label="Pote"
                    valor={`₿C ${fmt(mesa.pote)}`}
                    destaque
                    corValor="#F59E0B"
                />

                <Separador />

                {/* Small Blind */}
                <InfoItem
                    label="SB"
                    valor={`₿C ${fmt(mesa.smallBlind)}`}
                    corValor="#94A3B8"
                />

                <Separador />

                {/* Big Blind */}
                <InfoItem
                    label="BB"
                    valor={`₿C ${fmt(mesa.bigBlind)}`}
                    corValor="#94A3B8"
                />

                {/* Maior aposta — só mostra quando há aposta ativa */}
                {temAposta && (
                    <>
                        <Separador />
                        <InfoItem
                            label="Call"
                            valor={`₿C ${fmt(mesa.maiorAposta)}`}
                            corValor="#22C55E"
                        />
                    </>
                )}

            </div>

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTES AUXILIARES
// ================================================================

// Item de informação com label e valor
// destaque → valor em tamanho maior
function InfoItem({ label, valor, destaque = false, corValor = '#F8FAFC' }) {
    return (
        <div style={estilos.infoItem}>
            <span style={estilos.infoLabel}>{label}</span>
            <span style={{
                ...estilos.infoValor,
                color:    corValor,
                fontSize: destaque ? '14px' : '11px',
                fontWeight: destaque ? '700' : '600',
            }}>
                {valor}
            </span>
        </div>
    );
}

// Separador vertical entre os itens
function Separador() {
    return <div style={estilos.separador} />;
}


// ================================================================
// BLOCO 4: ESTILOS
// ================================================================

const estilos = {

    // Container principal do painel
    // Fica fixo no topo da tela do jogo
    container: {
        background:   '#0d1424',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding:      '8px 14px',
        display:      'flex',
        flexDirection: 'column',
        gap:          '6px',
        flexShrink:   0,
    },

    // Linha do topo: nome + fase
    linhaTopo: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            '8px',
    },

    // Nome da mesa
    nomeMesa: {
        fontSize:     '13px',
        fontWeight:   '600',
        color:        '#F8FAFC',
        margin:       0,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        flex:         1,
    },

    // Badge colorido da fase atual
    badgeFase: {
        display:      'flex',
        alignItems:   'center',
        gap:          '5px',
        padding:      '3px 8px',
        borderRadius: '20px',
        fontSize:     '11px',
        fontWeight:   '600',
        flexShrink:   0,
        whiteSpace:   'nowrap',
    },

    // Ponto pulsante dentro do badge de fase
    // Indica visualmente que o jogo está ativo
    pontoPulsante: {
        width:        '5px',
        height:       '5px',
        borderRadius: '50%',
        display:      'inline-block',
        animation:    'pulsar 1.5s ease-in-out infinite',
        flexShrink:   0,
    },

    // Linha inferior: pote, blinds, call
    linhaInfo: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
        overflowX:  'auto',                // scroll horizontal se precisar
        scrollbarWidth: 'none',            // esconde scrollbar no Firefox
        msOverflowStyle: 'none',           // esconde scrollbar no IE
        paddingBottom: '2px',
    },

    // Item individual (label + valor)
    infoItem: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '1px',
        flexShrink:    0,
    },

    // Label pequeno acima do valor
    infoLabel: {
        fontSize:      '9px',
        color:         'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        lineHeight:    1,
    },

    // Valor em destaque
    infoValor: {
        lineHeight: 1,
        whiteSpace: 'nowrap',
    },

    // Separador vertical entre itens
    separador: {
        width:        '1px',
        height:       '24px',
        background:   'rgba(255,255,255,0.08)',
        flexShrink:   0,
    },
};
