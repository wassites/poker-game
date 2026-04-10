/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/TemasCartas.jsx

   CONCEITO GERAL:
   Exibe os temas visuais disponíveis para as cartas do jogo.
   O jogador pode:
     → Ver preview de como as cartas ficam com cada tema
     → Comprar temas premium com ₿C
     → Ativar um tema já comprado

   TEMAS DISPONÍVEIS:
     Clássico    → gratuito, padrão vermelho e preto
     4 Cores     → gratuito, cada naipe com cor diferente
     Neon        → 500 ₿C, visual futurista
     Dourado     → 800 ₿C, luxo em tons de ouro
     Minimalista → 300 ₿C, design clean

   PROPS:
     saldoAtual  → number: saldo atual em ₿C
     temaAtual   → string: id do tema ativo ('classico', 'neon', etc.)
     onComprar   → function(tema): chamada ao comprar tema premium
     onAtivar    → function(tema): chamada ao ativar tema já comprado
================================================================ */

import { useState } from 'react';


// ================================================================
// BLOCO 1: CATÁLOGO DE TEMAS
//
// comprado: simula se o jogador já comprou o tema.
// No projeto real, isso vem do perfil do jogador no Supabase.
// ================================================================

const TEMAS = [
    {
        id:       'classico',
        nome:     'Clássico',
        preco:    0,
        premium:  false,
        comprado: true,  // gratuito = sempre comprado
        descricao: 'O visual tradicional do poker',
        naipes: {
            '♥': { cor: '#DC2626' },
            '♦': { cor: '#DC2626' },
            '♣': { cor: '#1a1a1a' },
            '♠': { cor: '#1a1a1a' },
        },
        verso:  { fundo: '#1E3A8A', detalhe: '#1E40AF' },
        frente: { fundo: '#FFFFFF', borda: '#D1D5DB', raio: 8 },
    },
    {
        id:       'quatroCores',
        nome:     '4 Cores',
        preco:    0,
        premium:  false,
        comprado: true,
        descricao: 'Cada naipe com sua própria cor',
        naipes: {
            '♥': { cor: '#DC2626' },
            '♦': { cor: '#2563EB' },
            '♣': { cor: '#16A34A' },
            '♠': { cor: '#1a1a1a' },
        },
        verso:  { fundo: '#111827', detalhe: '#374151' },
        frente: { fundo: '#FFFFFF', borda: '#9CA3AF', raio: 8 },
    },
    {
        id:       'neon',
        nome:     'Neon',
        preco:    500,
        premium:  true,
        comprado: false,
        descricao: 'Visual futurista com brilhos neon',
        naipes: {
            '♥': { cor: '#F472B6' },
            '♦': { cor: '#34D399' },
            '♣': { cor: '#60A5FA' },
            '♠': { cor: '#A78BFA' },
        },
        verso:  { fundo: '#0F0F1A', detalhe: '#7C3AED' },
        frente: { fundo: '#0F172A', borda: '#7C3AED', raio: 10 },
    },
    {
        id:       'dourado',
        nome:     'Dourado',
        preco:    800,
        premium:  true,
        comprado: false,
        descricao: 'Luxo e elegância em tons de ouro',
        naipes: {
            '♥': { cor: '#EF4444' },
            '♦': { cor: '#F59E0B' },
            '♣': { cor: '#92400E' },
            '♠': { cor: '#78350F' },
        },
        verso:  { fundo: '#78350F', detalhe: '#B45309' },
        frente: { fundo: '#FFFBEB', borda: '#D97706', raio: 8 },
    },
    {
        id:       'minimalista',
        nome:     'Minimalista',
        preco:    300,
        premium:  true,
        comprado: false,
        descricao: 'Design clean e moderno',
        naipes: {
            '♥': { cor: '#6B7280' },
            '♦': { cor: '#6B7280' },
            '♣': { cor: '#374151' },
            '♠': { cor: '#374151' },
        },
        verso:  { fundo: '#F9FAFB', detalhe: '#E5E7EB' },
        frente: { fundo: '#FFFFFF', borda: '#E5E7EB', raio: 4 },
    },
];

// Formata número com separador
function fmt(n) {
    return Number(n).toLocaleString('pt-BR');
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function TemasCartas({ saldoAtual, temaAtual, onComprar, onAtivar }) {

    // Tema selecionado para ver o preview detalhado
    const [temaSelecionado, setTemaSelecionado] = useState(
        TEMAS.find(t => t.id === temaAtual) || TEMAS[0]
    );


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Preview do tema selecionado ---- */}
            <PreviewTema
                tema={temaSelecionado}
                ativo={temaSelecionado.id === temaAtual}
                saldoAtual={saldoAtual}
                onComprar={() => onComprar(temaSelecionado)}
                onAtivar={() => onAtivar(temaSelecionado)}
            />

            {/* ---- Divisor ---- */}
            <div style={estilos.divisor}>
                <div style={estilos.linhaDivisor} />
                <span style={estilos.textDivisor}>escolha um tema</span>
                <div style={estilos.linhaDivisor} />
            </div>

            {/* ---- Grade de temas ---- */}
            <div style={estilos.grade}>
                {TEMAS.map(tema => (
                    <MiniCardTema
                        key={tema.id}
                        tema={tema}
                        selecionado={temaSelecionado.id === tema.id}
                        ativo={temaAtual === tema.id}
                        onSelecionar={() => setTemaSelecionado(tema)}
                    />
                ))}
            </div>

            {/* ---- Aviso de saldo ---- */}
            <p style={estilos.avisoSaldo}>
                Seu saldo: <span style={{ color: '#F59E0B', fontWeight: '600' }}>
                    ₿C {fmt(saldoAtual)}
                </span>
            </p>

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE PreviewTema
// Exibe o preview detalhado do tema selecionado
// com duas cartas de exemplo (frente e verso)
// ================================================================

function PreviewTema({ tema, ativo, saldoAtual, onComprar, onAtivar }) {

    const temSaldo    = saldoAtual >= tema.preco;
    const podeComprar = tema.premium && !tema.comprado && temSaldo;
    const podeAtivar  = tema.comprado && !ativo;

    return (
        <div style={estilos.previewContainer}>

            {/* ---- Cartas de exemplo ---- */}
            <div style={estilos.cartasExemplo}>

                {/* Carta frente: Ás de Copas */}
                <div style={{
                    ...estilos.cartaFrente,
                    background:   tema.frente.fundo,
                    border:       `2px solid ${tema.frente.borda}`,
                    borderRadius: tema.frente.raio + 'px',
                    boxShadow:    tema.id === 'neon'
                        ? `0 0 20px ${tema.naipes['♥'].cor}40`
                        : '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                    {/* Valor topo-esquerdo */}
                    <div style={{ ...estilos.cartaValorCanto, color: tema.naipes['♥'].cor }}>
                        <span style={estilos.cartaValorTexto}>A</span>
                        <span style={estilos.cartaNaipeCanto}>♥</span>
                    </div>

                    {/* Naipe central grande */}
                    <span style={{
                        fontSize:   '38px',
                        color:      tema.naipes['♥'].cor,
                        lineHeight: 1,
                        filter:     tema.id === 'neon'
                            ? `drop-shadow(0 0 8px ${tema.naipes['♥'].cor})`
                            : 'none',
                    }}>
                        ♥
                    </span>

                    {/* Valor baixo-direito (invertido) */}
                    <div style={{
                        ...estilos.cartaValorCanto,
                        position:  'absolute',
                        bottom:    '6px',
                        right:     '6px',
                        transform: 'rotate(180deg)',
                        color:     tema.naipes['♥'].cor,
                    }}>
                        <span style={estilos.cartaValorTexto}>A</span>
                        <span style={estilos.cartaNaipeCanto}>♥</span>
                    </div>
                </div>

                {/* Carta verso */}
                <div style={{
                    ...estilos.cartaVerso,
                    background:   tema.verso.fundo,
                    borderRadius: tema.frente.raio + 'px',
                }}>
                    <div style={{
                        ...estilos.cartaVersoInterno,
                        background:   tema.verso.detalhe,
                        borderRadius: (tema.frente.raio - 2) + 'px',
                        opacity:      tema.id === 'minimalista' ? 0.6 : 0.35,
                    }} />
                </div>

                {/* Preview dos 4 naipes */}
                <div style={estilos.naipesGrid}>
                    {Object.entries(tema.naipes).map(([naipe, config]) => (
                        <div key={naipe} style={{ textAlign: 'center' }}>
                            <span style={{
                                fontSize: '20px',
                                color:    config.cor,
                                filter:   tema.id === 'neon'
                                    ? `drop-shadow(0 0 4px ${config.cor})`
                                    : 'none',
                            }}>
                                {naipe}
                            </span>
                        </div>
                    ))}
                </div>

            </div>

            {/* ---- Info do tema ---- */}
            <div style={estilos.previewInfo}>

                <div style={estilos.previewTitulo}>
                    <h3 style={estilos.temaNome}>{tema.nome}</h3>
                    {tema.premium && (
                        <span style={estilos.badgePremium}>PREMIUM</span>
                    )}
                    {ativo && (
                        <span style={estilos.badgeAtivo}>ATIVO</span>
                    )}
                </div>

                <p style={estilos.temaDescricao}>{tema.descricao}</p>

                {/* Preço ou gratuito */}
                {tema.premium ? (
                    <p style={estilos.temaPreco}>
                        <span style={{ color: '#F59E0B', fontWeight: '700' }}>
                            ₿C {fmt(tema.preco)}
                        </span>
                        {!temSaldo && !tema.comprado && (
                            <span style={{ color: '#EF4444', fontSize: '11px', marginLeft: '6px' }}>
                                (saldo insuficiente)
                            </span>
                        )}
                    </p>
                ) : (
                    <p style={{ ...estilos.temaPreco, color: '#22C55E' }}>Gratuito</p>
                )}

                {/* Botão de ação */}
                {ativo ? (
                    <div style={estilos.btnAtivo}>
                        ✓ Tema ativo
                    </div>
                ) : podeAtivar ? (
                    <button onClick={onAtivar} style={estilos.btnAtivar}>
                        Usar este tema
                    </button>
                ) : podeComprar ? (
                    <button onClick={onComprar} style={estilos.btnComprar}>
                        Comprar · ₿C {fmt(tema.preco)}
                    </button>
                ) : !tema.comprado && !temSaldo ? (
                    <button disabled style={{ ...estilos.btnComprar, opacity: 0.4, cursor: 'not-allowed' }}>
                        ₿C insuficiente
                    </button>
                ) : null}

            </div>
        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE MiniCardTema
// Card pequeno da grade de seleção de temas
// ================================================================

function MiniCardTema({ tema, selecionado, ativo, onSelecionar }) {
    return (
        <button
            onClick={onSelecionar}
            style={{
                ...estilos.miniCard,
                border: selecionado
                    ? '2px solid #7C3AED'
                    : ativo
                        ? '2px solid #22C55E'
                        : '1px solid rgba(255,255,255,0.07)',
                background: selecionado
                    ? 'rgba(124,58,237,0.1)'
                    : 'rgba(255,255,255,0.02)',
                transform: selecionado ? 'scale(1.03)' : 'scale(1)',
            }}
        >
            {/* Mini preview das cartas */}
            <div style={estilos.miniPreview}>
                {/* Mini carta frente */}
                <div style={{
                    ...estilos.miniCarta,
                    background:   tema.frente.fundo,
                    border:       `1px solid ${tema.frente.borda}`,
                    borderRadius: (tema.frente.raio / 2) + 'px',
                    color:        tema.naipes['♥'].cor,
                }}>
                    <span style={{ fontSize: '12px', lineHeight: 1 }}>A♥</span>
                </div>

                {/* Mini carta verso */}
                <div style={{
                    ...estilos.miniCarta,
                    background:   tema.verso.fundo,
                    border:       `1px solid rgba(255,255,255,0.1)`,
                    borderRadius: (tema.frente.raio / 2) + 'px',
                }}>
                    <div style={{
                        width:        '14px',
                        height:       '20px',
                        background:   tema.verso.detalhe,
                        borderRadius: '2px',
                        opacity:      0.4,
                    }} />
                </div>
            </div>

            {/* Nome do tema */}
            <span style={{
                ...estilos.miniNome,
                color: selecionado ? '#A78BFA' : ativo ? '#22C55E' : 'rgba(255,255,255,0.6)',
                fontWeight: selecionado || ativo ? '600' : '400',
            }}>
                {tema.nome}
            </span>

            {/* Badge de status */}
            {ativo && (
                <span style={estilos.miniAtivo}>ativo</span>
            )}
            {tema.premium && !tema.comprado && (
                <span style={estilos.miniPreco}>₿C {fmt(tema.preco)}</span>
            )}
            {tema.premium && tema.comprado && !ativo && (
                <span style={{ ...estilos.miniPreco, color: '#22C55E' }}>comprado</span>
            )}
            {!tema.premium && !ativo && (
                <span style={{ ...estilos.miniPreco, color: '#22C55E' }}>grátis</span>
            )}

        </button>
    );
}


// ================================================================
// BLOCO 5: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '16px',
    },

    // Container do preview principal
    previewContainer: {
        background:    '#111827',
        border:        '1px solid rgba(255,255,255,0.07)',
        borderRadius:  '14px',
        padding:       '16px',
        display:       'flex',
        gap:           '16px',
        alignItems:    'flex-start',
    },

    // Área das cartas de exemplo
    cartasExemplo: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
        flexShrink:     0,
    },

    // Carta frente (exemplo: Ás de Copas)
    cartaFrente: {
        width:          '70px',
        height:         '98px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        position:       'relative',
        transition:     'all 0.3s',
    },

    cartaValorCanto: {
        position:      'absolute',
        top:           '6px',
        left:          '6px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        lineHeight:    1,
    },

    cartaValorTexto: {
        fontSize:   '13px',
        fontWeight: '800',
        lineHeight: 1,
    },

    cartaNaipeCanto: {
        fontSize:   '11px',
        lineHeight: 1,
    },

    // Carta verso
    cartaVerso: {
        width:          '70px',
        height:         '98px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        transition:     'all 0.3s',
    },

    cartaVersoInterno: {
        width:  '58px',
        height: '86px',
    },

    // Grid dos 4 naipes em 2x2
    naipesGrid: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '2px',
        width:               '70px',
    },

    // Info ao lado do preview
    previewInfo: {
        flex:          1,
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
    },

    previewTitulo: {
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        flexWrap:   'wrap',
    },

    temaNome: {
        fontSize:   '16px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    badgePremium: {
        fontSize:     '9px',
        fontWeight:   '700',
        background:   'rgba(217,119,6,0.2)',
        color:        '#F59E0B',
        padding:      '2px 5px',
        borderRadius: '4px',
        letterSpacing: '0.05em',
    },

    badgeAtivo: {
        fontSize:     '9px',
        fontWeight:   '700',
        background:   'rgba(34,197,94,0.2)',
        color:        '#22C55E',
        padding:      '2px 5px',
        borderRadius: '4px',
        letterSpacing: '0.05em',
    },

    temaDescricao: {
        fontSize:   '12px',
        color:      'rgba(255,255,255,0.4)',
        margin:     0,
        lineHeight: 1.4,
    },

    temaPreco: {
        fontSize:   '14px',
        fontWeight: '500',
        color:      '#F8FAFC',
        margin:     0,
    },

    // Botão de estado: tema já ativo
    btnAtivo: {
        padding:      '8px 12px',
        background:   'rgba(34,197,94,0.1)',
        border:       '1px solid rgba(34,197,94,0.3)',
        borderRadius: '8px',
        color:        '#22C55E',
        fontSize:     '13px',
        fontWeight:   '600',
        textAlign:    'center',
        marginTop:    'auto',
    },

    // Botão de ativar tema comprado
    btnAtivar: {
        padding:      '8px 12px',
        background:   'rgba(124,58,237,0.15)',
        border:       '1px solid rgba(124,58,237,0.4)',
        borderRadius: '8px',
        color:        '#A78BFA',
        fontSize:     '13px',
        fontWeight:   '600',
        cursor:       'pointer',
        marginTop:    'auto',
        WebkitTapHighlightColor: 'transparent',
        outline:      'none',
        transition:   'opacity 0.15s',
    },

    // Botão de comprar tema premium
    btnComprar: {
        padding:      '8px 12px',
        background:   'linear-gradient(135deg, #D97706, #F59E0B)',
        border:       'none',
        borderRadius: '8px',
        color:        'white',
        fontSize:     '13px',
        fontWeight:   '600',
        cursor:       'pointer',
        marginTop:    'auto',
        WebkitTapHighlightColor: 'transparent',
        outline:      'none',
    },

    // Divisor entre preview e grade
    divisor: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
    },

    linhaDivisor: {
        flex:       1,
        height:     '1px',
        background: 'rgba(255,255,255,0.06)',
    },

    textDivisor: {
        fontSize:      '10px',
        color:         'rgba(255,255,255,0.2)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        flexShrink:    0,
    },

    // Grade de mini cards (2 colunas no mobile, 3 em telas maiores)
    grade: {
        display:             'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap:                 '8px',
    },

    // Mini card de cada tema
    miniCard: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '6px',
        padding:        '10px 6px',
        borderRadius:   '10px',
        cursor:         'pointer',
        transition:     'all 0.2s',
        WebkitTapHighlightColor: 'transparent',
        outline:        'none',
    },

    miniPreview: {
        display: 'flex',
        gap:     '3px',
    },

    miniCarta: {
        width:          '24px',
        height:         '34px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontWeight:     '700',
    },

    miniNome: {
        fontSize:     '10px',
        textAlign:    'center',
        lineHeight:   1.2,
    },

    miniAtivo: {
        fontSize:     '9px',
        background:   'rgba(34,197,94,0.15)',
        color:        '#22C55E',
        padding:      '1px 5px',
        borderRadius: '3px',
        fontWeight:   '600',
    },

    miniPreco: {
        fontSize:  '9px',
        color:     'rgba(255,255,255,0.3)',
        textAlign: 'center',
    },

    // Aviso de saldo no final
    avisoSaldo: {
        fontSize:  '12px',
        color:     'rgba(255,255,255,0.3)',
        textAlign: 'center',
        margin:    0,
    },
};
