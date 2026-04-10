/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Header.jsx

   CONCEITO GERAL:
   Cabeçalho do Lobby. Exibe as informações do jogador:
     → Avatar com indicador de nível
     → Nome e rank
     → Saldo em ₿C (Bitchager)
     → Botão da carteira e botão de configurações

   DESIGN:
   Estilo "crypto dark" — fundo escuro com detalhes dourados.
   O saldo em ₿C tem destaque especial pois é o elemento mais
   importante do header (o jogador sempre quer saber quanto tem).

   PROPS:
     usuario      → { uid, nome, avatar, saldo, rankPontos, tema }
     onAbrirLoja  → abre a aba da loja (para comprar mais ₿C)
     onAbrirCarteira → abre a carteira do jogador
     onLogout     → desloga o jogador
================================================================ */

import { useState } from 'react';

// Símbolo oficial da moeda
const SIMBOLO_BC = '₿C';

// ================================================================
// BLOCO 1: FUNÇÕES AUXILIARES
// ================================================================

// Converte rankPontos em nome e cor do rank
// Quanto mais pontos, maior o rank
function calcularRank(rankPontos = 0) {
    if (rankPontos >= 10000) return { nome: 'Lendário',     cor: '#F59E0B', emoji: '👑' };
    if (rankPontos >= 5000)  return { nome: 'Mestre',       cor: '#A855F7', emoji: '💎' };
    if (rankPontos >= 2000)  return { nome: 'Avançado',     cor: '#3B82F6', emoji: '⚡' };
    if (rankPontos >= 500)   return { nome: 'Intermediário', cor: '#22C55E', emoji: '🎯' };
    return                          { nome: 'Iniciante',    cor: '#6B7280', emoji: '🃏' };
}

// Formata o saldo com separadores de milhar
// Ex: 12500 → "12.500"
function formatarSaldo(valor = 0) {
    return Number(valor).toLocaleString('pt-BR');
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Header({ usuario, onAbrirLoja, onAbrirCarteira, onLogout }) {

    // Controla se o menu de opções está aberto
    const [menuAberto, setMenuAberto] = useState(false);

    const rank = calcularRank(usuario?.rankPontos);

    return (
        <header style={estilos.header}>

            {/* Linha decorativa superior com gradiente */}
            <div style={estilos.linhaDecoração} />

            <div style={estilos.conteudo}>

                {/* ---- LADO ESQUERDO: Avatar + Info ---- */}
                <div style={estilos.ladoEsquerdo}>

                    {/* Container do avatar com anel de rank colorido */}
                    <div style={estilos.avatarContainer}>
                        <div style={{
                            ...estilos.avatarAnel,
                            // Cor do anel muda conforme o rank do jogador
                            background: `conic-gradient(${rank.cor} 0%, ${rank.cor}40 100%)`,
                        }}>
                            <img
                                src={usuario?.avatar || 'assets/avatar-padrao.png'}
                                alt={usuario?.nome || 'Jogador'}
                                style={estilos.avatarImg}
                                // onError: se a imagem falhar, usa o avatar padrão
                                onError={e => { e.target.src = 'assets/avatar-padrao.png'; }}
                            />
                        </div>

                        {/* Badge do rank no canto do avatar */}
                        <div style={{
                            ...estilos.rankBadge,
                            background: rank.cor,
                        }}>
                            <span style={{ fontSize: '10px' }}>{rank.emoji}</span>
                        </div>
                    </div>

                    {/* Nome e rank do jogador */}
                    <div style={estilos.infoJogador}>
                        <p style={estilos.nomeJogador}>
                            {usuario?.nome || 'Jogador'}
                        </p>
                        <p style={{ ...estilos.textoRank, color: rank.cor }}>
                            {rank.nome} · {usuario?.rankPontos || 0} pts
                        </p>
                    </div>
                </div>

                {/* ---- LADO DIREITO: Saldo + Menu ---- */}
                <div style={estilos.ladoDireito}>

                    {/* Card do saldo em ₿C */}
                    <button
                        onClick={onAbrirLoja}
                        style={estilos.cardSaldo}
                        title="Comprar mais Bitchager"
                    >
                        {/* Símbolo e valor */}
                        <div style={estilos.saldoLinha}>
                            <span style={estilos.simboloBC}>{SIMBOLO_BC}</span>
                            <span style={estilos.valorSaldo}>
                                {formatarSaldo(usuario?.saldo)}
                            </span>
                        </div>

                        {/* Label e botão de compra */}
                        <div style={estilos.saldoRodape}>
                            <span style={estilos.labelSaldo}>Bitchager</span>
                            <span style={estilos.btnComprar}>+ Comprar</span>
                        </div>
                    </button>

                    {/* Botão de menu (3 pontinhos) */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setMenuAberto(m => !m)}
                            style={estilos.btnMenu}
                            aria-label="Menu de opções"
                        >
                            {/* Ícone de 3 pontos verticais */}
                            <span style={estilos.pontosMenu}>⋮</span>
                        </button>

                        {/* Menu dropdown */}
                        {menuAberto && (
                            <MenuDropdown
                                onAbrirCarteira={() => { onAbrirCarteira?.(); setMenuAberto(false); }}
                                onLogout={() => { onLogout?.(); setMenuAberto(false); }}
                                onFechar={() => setMenuAberto(false)}
                            />
                        )}
                    </div>

                </div>
            </div>

            {/* Linha separadora sutil na parte inferior */}
            <div style={estilos.linhaSeparadora} />
        </header>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE MenuDropdown
//
// Menu de opções que aparece ao clicar nos 3 pontinhos.
// Separado em componente próprio para manter o Header limpo.
// ================================================================

function MenuDropdown({ onAbrirCarteira, onLogout, onFechar }) {

    // Itens do menu
    const itens = [
        { label: 'Minha Carteira ₿C', icone: '💰', acao: onAbrirCarteira },
        { label: 'Perfil',            icone: '👤', acao: onFechar         },
        { label: 'Configurações',     icone: '⚙️', acao: onFechar         },
        { label: 'Sair',              icone: '🚪', acao: onLogout, perigo: true },
    ];

    return (
        <>
            {/* Overlay invisível para fechar o menu ao clicar fora */}
            <div
                onClick={onFechar}
                style={{
                    position: 'fixed',
                    inset:    0,
                    zIndex:   199,
                }}
            />

            {/* Menu em si */}
            <div style={estilos.dropdown}>
                {itens.map(item => (
                    <button
                        key={item.label}
                        onClick={item.acao}
                        style={{
                            ...estilos.itemDropdown,
                            color: item.perigo ? '#EF4444' : '#F8FAFC',
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>{item.icone}</span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
        </>
    );
}


// ================================================================
// BLOCO 4: ESTILOS
// ================================================================

const estilos = {

    // Container principal do header
    header: {
        position:       'relative',
        background:     '#0d1424',
        paddingTop:     'max(12px, env(safe-area-inset-top))',
        zIndex:         100,
    },

    // Linha decorativa no topo com gradiente dourado
    linhaDecoração: {
        height:     '2px',
        background: 'linear-gradient(90deg, transparent, #D97706, #F59E0B, #D97706, transparent)',
    },

    // Área de conteúdo do header
    conteudo: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 14px',
        gap:            '10px',
    },

    // Lado esquerdo: avatar + informações
    ladoEsquerdo: {
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
        flex:       1,
        minWidth:   0,  // permite que o texto corte com ellipsis
    },

    // Container do avatar com padding para o anel
    avatarContainer: {
        position:  'relative',
        flexShrink: 0,
    },

    // Anel colorido ao redor do avatar
    avatarAnel: {
        width:        '48px',
        height:       '48px',
        borderRadius: '50%',
        padding:      '2px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
    },

    // Imagem do avatar
    avatarImg: {
        width:        '44px',
        height:       '44px',
        borderRadius: '50%',
        objectFit:    'cover',
        border:       '2px solid #0d1424', // cria separação entre a foto e o anel
    },

    // Badge do rank no canto do avatar
    rankBadge: {
        position:     'absolute',
        bottom:       '-2px',
        right:        '-2px',
        width:        '18px',
        height:       '18px',
        borderRadius: '50%',
        border:       '2px solid #0d1424',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
    },

    // Informações do jogador (nome + rank)
    infoJogador: {
        minWidth: 0,  // permite ellipsis
    },

    // Nome do jogador
    nomeJogador: {
        fontSize:     '15px',
        fontWeight:   '600',
        color:        '#F8FAFC',
        margin:       0,
        // Corta o nome se for muito longo
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
    },

    // Texto do rank
    textoRank: {
        fontSize: '11px',
        margin:   '2px 0 0',
    },

    // Lado direito: saldo + menu
    ladoDireito: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
        flexShrink: 0,
    },

    // Card clicável do saldo em ₿C
    cardSaldo: {
        background:    'rgba(217,119,6,0.1)',
        border:        '1px solid rgba(217,119,6,0.3)',
        borderRadius:  '10px',
        padding:       '6px 10px',
        cursor:        'pointer',
        textAlign:     'right',
        WebkitTapHighlightColor: 'transparent',
        outline:       'none',
        transition:    'background 0.15s',
        minWidth:      '90px',
    },

    // Linha do símbolo + valor
    saldoLinha: {
        display:    'flex',
        alignItems: 'baseline',
        gap:        '4px',
        justifyContent: 'flex-end',
    },

    // Símbolo ₿C dourado
    simboloBC: {
        fontSize:   '11px',
        color:      '#D97706',
        fontWeight: '700',
    },

    // Valor numérico do saldo
    valorSaldo: {
        fontSize:   '17px',
        fontWeight: '700',
        color:      '#F59E0B',
        lineHeight: 1,
        // Garante que números grandes não quebrem o layout
        whiteSpace: 'nowrap',
    },

    // Rodapé do card de saldo
    saldoRodape: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            '6px',
        marginTop:      '2px',
    },

    // Label "Bitchager"
    labelSaldo: {
        fontSize: '9px',
        color:    'rgba(217,119,6,0.6)',
        letterSpacing: '0.04em',
    },

    // Mini botão "+ Comprar"
    btnComprar: {
        fontSize:      '9px',
        color:         '#D97706',
        background:    'rgba(217,119,6,0.15)',
        borderRadius:  '4px',
        padding:       '1px 4px',
        fontWeight:    '600',
    },

    // Botão dos 3 pontinhos
    btnMenu: {
        background:    'rgba(255,255,255,0.06)',
        border:        '1px solid rgba(255,255,255,0.1)',
        borderRadius:  '8px',
        width:         '34px',
        height:        '34px',
        display:       'flex',
        alignItems:    'center',
        justifyContent: 'center',
        cursor:        'pointer',
        color:         '#F8FAFC',
        WebkitTapHighlightColor: 'transparent',
        outline:       'none',
    },

    // Ícone dos 3 pontinhos
    pontosMenu: {
        fontSize:   '20px',
        lineHeight: 1,
        marginTop:  '-2px',
    },

    // Container do menu dropdown
    dropdown: {
        position:     'absolute',
        top:          '38px',
        right:        0,
        background:   '#1a2235',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        overflow:     'hidden',
        zIndex:       200,
        minWidth:     '180px',
        boxShadow:    '0 8px 24px rgba(0,0,0,0.4)',
    },

    // Item do dropdown
    itemDropdown: {
        width:       '100%',
        padding:     '12px 14px',
        background:  'none',
        border:      'none',
        display:     'flex',
        alignItems:  'center',
        gap:         '10px',
        cursor:      'pointer',
        fontSize:    '14px',
        textAlign:   'left',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        WebkitTapHighlightColor: 'transparent',
        transition:  'background 0.1s',
    },

    // Linha separadora inferior do header
    linhaSeparadora: {
        height:     '1px',
        background: 'rgba(255,255,255,0.05)',
    },
};
