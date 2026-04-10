/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Header.jsx

   CONCEITO GERAL:
   Cabeçalho do Lobby. Exibe as informações do jogador:
     → Avatar com indicador de nível
     → Nome e rank
     → Saldo em ₿C (Bitchager)
     → Botão da carteira e botão de configurações

   RESPONSIVIDADE:
   Mobile  → layout compacto, fonte menor, padding reduzido
   Desktop → layout mais espaçoso, max-width centralizado

   CORREÇÕES DESTA VERSÃO:
   → Perfil e Configurações mostravam badge "em breve" (antes fechavam sem fazer nada)
   → Avatar usa DiceBear como fallback quando a imagem não carrega
   → Layout responsivo com max-width para telas grandes

   PROPS:
     usuario         → { uid, nome, avatar, saldo, rankPontos }
     onAbrirLoja     → abre a loja para comprar ₿C
     onAbrirCarteira → abre a carteira do jogador
     onLogout        → desloga o jogador
================================================================ */

import { useState } from 'react';

const SIMBOLO_BC = '₿C';

// ================================================================
// BLOCO 1: FUNÇÕES AUXILIARES
// ================================================================

function calcularRank(rankPontos = 0) {
    if (rankPontos >= 10000) return { nome: 'Lendário',      cor: '#F59E0B', emoji: '👑' };
    if (rankPontos >= 5000)  return { nome: 'Mestre',        cor: '#A855F7', emoji: '💎' };
    if (rankPontos >= 2000)  return { nome: 'Avançado',      cor: '#3B82F6', emoji: '⚡' };
    if (rankPontos >= 500)   return { nome: 'Intermediário', cor: '#22C55E', emoji: '🎯' };
    return                          { nome: 'Iniciante',     cor: '#6B7280', emoji: '🃏' };
}

function formatarSaldo(valor = 0) {
    return Number(valor).toLocaleString('pt-BR');
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Header({ usuario, onAbrirLoja, onAbrirCarteira, onLogout }) {

    const [menuAberto, setMenuAberto] = useState(false);
    const rank = calcularRank(usuario?.rankPontos);

    // URL do avatar com fallback para DiceBear (avatar gerado automaticamente)
    // Se a imagem original falhar, usa um avatar único baseado no uid do jogador
    const avatarFallback = `https://api.dicebear.com/7.x/avataaars/svg?seed=${usuario?.uid || 'default'}`;

    return (
        <header style={estilos.header}>

            {/* CSS responsivo — media queries só funcionam em <style>, não em JS inline */}
            <style>{`
                .header-inner {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 14px;
                    gap: 10px;
                    max-width: 1200px;
                    margin: 0 auto;
                    box-sizing: border-box;
                    width: 100%;
                }
                .header-nome {
                    font-size: 15px;
                    font-weight: 600;
                    color: #F8FAFC;
                    margin: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 140px;
                }
                .header-rank-texto {
                    font-size: 11px;
                    margin: 2px 0 0;
                }
                .header-saldo-valor {
                    font-size: 17px;
                    font-weight: 700;
                    color: #F59E0B;
                    line-height: 1;
                    white-space: nowrap;
                }
                /* Desktop: mais espaço e fontes maiores */
                @media (min-width: 768px) {
                    .header-inner {
                        padding: 14px 32px;
                    }
                    .header-nome {
                        font-size: 18px;
                        max-width: 300px;
                    }
                    .header-rank-texto {
                        font-size: 13px;
                    }
                    .header-saldo-valor {
                        font-size: 22px;
                    }
                }
            `}</style>

            {/* Linha decorativa dourada no topo */}
            <div style={estilos.linhaDecoracao} />

            <div className="header-inner">

                {/* ---- LADO ESQUERDO: Avatar + Info ---- */}
                <div style={estilos.ladoEsquerdo}>

                    <div style={estilos.avatarContainer}>
                        <div style={{
                            ...estilos.avatarAnel,
                            background: `conic-gradient(${rank.cor} 0%, ${rank.cor}40 100%)`,
                        }}>
                            <img
                                src={usuario?.avatar || avatarFallback}
                                alt={usuario?.nome || 'Jogador'}
                                style={estilos.avatarImg}
                                onError={e => {
                                    // Evita loop infinito de erro
                                    e.target.onerror = null;
                                    e.target.src = avatarFallback;
                                }}
                            />
                        </div>

                        <div style={{ ...estilos.rankBadge, background: rank.cor }}>
                            <span style={{ fontSize: '10px' }}>{rank.emoji}</span>
                        </div>
                    </div>

                    <div style={estilos.infoJogador}>
                        <p className="header-nome">
                            {usuario?.nome || 'Jogador'}
                        </p>
                        <p className="header-rank-texto" style={{ color: rank.cor }}>
                            {rank.nome} · {usuario?.rankPontos || 0} pts
                        </p>
                    </div>
                </div>

                {/* ---- LADO DIREITO: Saldo + Menu ---- */}
                <div style={estilos.ladoDireito}>

                    <button onClick={onAbrirLoja} style={estilos.cardSaldo}>
                        <div style={estilos.saldoLinha}>
                            <span style={estilos.simboloBC}>{SIMBOLO_BC}</span>
                            <span className="header-saldo-valor">
                                {formatarSaldo(usuario?.saldo)}
                            </span>
                        </div>
                        <div style={estilos.saldoRodape}>
                            <span style={estilos.labelSaldo}>Bitchager</span>
                            <span style={estilos.btnComprar}>+ Comprar</span>
                        </div>
                    </button>

                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setMenuAberto(m => !m)}
                            style={estilos.btnMenu}
                            aria-label="Menu de opções"
                        >
                            <span style={estilos.pontosMenu}>⋮</span>
                        </button>

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

            <div style={estilos.linhaSeparadora} />
        </header>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE MenuDropdown
//
// CORREÇÃO: Perfil e Configurações agora mostram badge "em breve"
// em vez de simplesmente fechar o menu sem feedback ao usuário.
// ================================================================

function MenuDropdown({ onAbrirCarteira, onLogout, onFechar }) {

    const itens = [
        {
            label:   'Minha Carteira ₿C',
            icone:   '💰',
            acao:    onAbrirCarteira,
            emBreve: false,
            perigo:  false,
        },
        {
            label:   'Perfil',
            icone:   '👤',
            acao:    onFechar,
            // Perfil ainda não implementado — mostra badge "em breve"
            emBreve: true,
            perigo:  false,
        },
        {
            label:   'Configurações',
            icone:   '⚙️',
            acao:    onFechar,
            // Configurações ainda não implementado
            emBreve: true,
            perigo:  false,
        },
        {
            label:   'Sair',
            icone:   '🚪',
            acao:    onLogout,
            emBreve: false,
            perigo:  true,
        },
    ];

    return (
        <>
            {/* Overlay invisível — fecha o menu ao clicar fora */}
            <div onClick={onFechar} style={estilos.overlay} />

            <div style={estilos.dropdown}>
                {itens.map(item => (
                    <button
                        key={item.label}
                        onClick={item.acao}
                        style={{
                            ...estilos.itemDropdown,
                            color:   item.perigo ? '#EF4444' : '#F8FAFC',
                            opacity: item.emBreve ? 0.6 : 1,
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>{item.icone}</span>
                        <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                        {item.emBreve && (
                            <span style={estilos.badgeEmBreve}>em breve</span>
                        )}
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

    header: {
        position:   'relative',
        background: '#0d1424',
        paddingTop: 'max(0px, env(safe-area-inset-top))',
        zIndex:     100,
        width:      '100%',
    },

    linhaDecoracao: {
        height:     '2px',
        background: 'linear-gradient(90deg, transparent, #D97706, #F59E0B, #D97706, transparent)',
    },

    ladoEsquerdo: {
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
        flex:       1,
        minWidth:   0,
    },

    avatarContainer: {
        position:   'relative',
        flexShrink: 0,
    },

    avatarAnel: {
        width:          '48px',
        height:         '48px',
        borderRadius:   '50%',
        padding:        '2px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },

    avatarImg: {
        width:        '44px',
        height:       '44px',
        borderRadius: '50%',
        objectFit:    'cover',
        border:       '2px solid #0d1424',
    },

    rankBadge: {
        position:       'absolute',
        bottom:         '-2px',
        right:          '-2px',
        width:          '18px',
        height:         '18px',
        borderRadius:   '50%',
        border:         '2px solid #0d1424',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },

    infoJogador: {
        minWidth: 0,
    },

    ladoDireito: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
        flexShrink: 0,
    },

    cardSaldo: {
        background:              'rgba(217,119,6,0.1)',
        border:                  '1px solid rgba(217,119,6,0.3)',
        borderRadius:            '10px',
        padding:                 '6px 10px',
        cursor:                  'pointer',
        textAlign:               'right',
        outline:                 'none',
        transition:              'background 0.15s',
        minWidth:                '90px',
        WebkitTapHighlightColor: 'transparent',
        fontFamily:              'sans-serif',
    },

    saldoLinha: {
        display:        'flex',
        alignItems:     'baseline',
        gap:            '4px',
        justifyContent: 'flex-end',
    },

    simboloBC: {
        fontSize:   '11px',
        color:      '#D97706',
        fontWeight: '700',
    },

    saldoRodape: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            '6px',
        marginTop:      '2px',
    },

    labelSaldo: {
        fontSize:      '9px',
        color:         'rgba(217,119,6,0.6)',
        letterSpacing: '0.04em',
    },

    btnComprar: {
        fontSize:     '9px',
        color:        '#D97706',
        background:   'rgba(217,119,6,0.15)',
        borderRadius: '4px',
        padding:      '1px 4px',
        fontWeight:   '600',
    },

    btnMenu: {
        background:              'rgba(255,255,255,0.06)',
        border:                  '1px solid rgba(255,255,255,0.1)',
        borderRadius:            '8px',
        width:                   '34px',
        height:                  '34px',
        display:                 'flex',
        alignItems:              'center',
        justifyContent:          'center',
        cursor:                  'pointer',
        color:                   '#F8FAFC',
        outline:                 'none',
        WebkitTapHighlightColor: 'transparent',
    },

    pontosMenu: {
        fontSize:  '20px',
        lineHeight: 1,
        marginTop: '-2px',
    },

    overlay: {
        position: 'fixed',
        inset:    0,
        zIndex:   199,
    },

    dropdown: {
        position:     'absolute',
        top:          '38px',
        right:        0,
        background:   '#1a2235',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        overflow:     'hidden',
        zIndex:       200,
        minWidth:     '200px',
        boxShadow:    '0 8px 24px rgba(0,0,0,0.4)',
    },

    itemDropdown: {
        width:                   '100%',
        padding:                 '12px 14px',
        background:              'none',
        border:                  'none',
        display:                 'flex',
        alignItems:              'center',
        gap:                     '10px',
        cursor:                  'pointer',
        fontSize:                '14px',
        borderBottom:            '1px solid rgba(255,255,255,0.05)',
        WebkitTapHighlightColor: 'transparent',
        transition:              'background 0.1s',
        fontFamily:              'sans-serif',
    },

    badgeEmBreve: {
        fontSize:      '9px',
        color:         'rgba(255,255,255,0.3)',
        background:    'rgba(255,255,255,0.06)',
        borderRadius:  '4px',
        padding:       '1px 5px',
        fontWeight:    '500',
        letterSpacing: '0.04em',
        whiteSpace:    'nowrap',
    },

    linhaSeparadora: {
        height:     '1px',
        background: 'rgba(255,255,255,0.05)',
    },
};
