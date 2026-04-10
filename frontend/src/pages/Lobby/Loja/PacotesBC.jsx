/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/PacotesBC.jsx

   CONCEITO GERAL:
   Exibe os pacotes de Bitchager disponíveis para compra.
   O jogador escolhe um pacote e paga com PIX ou cartão.

   SOBRE OS PACOTES:
   Cada pacote tem:
     → valorBC   : quantidade de ₿C recebida
     → precoReal : preço em reais (R$)
     → bonus     : ₿C extras incluídos (ex: +20%)
     → destaque  : true = "Mais popular" (destaque visual)

   INTEGRAÇÃO COM PAGAMENTO:
   Por enquanto os botões simulam a compra.
   Quando integrar com Stripe ou PIX:
     1. Chame a API do backend com o pacoteId
     2. Backend cria a sessão de pagamento
     3. Redireciona para o checkout
     4. Webhook confirma o pagamento e credita o ₿C

   PROPS:
     saldoAtual → number: saldo atual do jogador em ₿C
     onComprar  → function(pacote): chamada ao confirmar compra
================================================================ */

import { useState } from 'react';


// ================================================================
// BLOCO 1: CATÁLOGO DE PACOTES
//
// valorBCBase : ₿C sem bônus
// bonus       : ₿C extras de bônus
// valorBC     : total recebido (base + bonus)
// precoReal   : preço em reais
// ================================================================

const PACOTES = [
    {
        id:          'starter',
        nome:        'Starter',
        valorBCBase: 1000,
        bonus:       0,
        valorBC:     1000,
        precoReal:   4.90,
        destaque:    false,
        cor:         '#3B82F6',
        icone:       '🃏',
        descricao:   'Para dar os primeiros passos',
    },
    {
        id:          'popular',
        nome:        'Popular',
        valorBCBase: 5000,
        bonus:       1000,
        valorBC:     6000,
        precoReal:   19.90,
        destaque:    true,
        cor:         '#7C3AED',
        icone:       '⭐',
        descricao:   '+1.000 ₿C de bônus incluído',
    },
    {
        id:          'pro',
        nome:        'Pro',
        valorBCBase: 15000,
        bonus:       7500,
        valorBC:     22500,
        precoReal:   49.90,
        destaque:    false,
        cor:         '#D97706',
        icone:       '💎',
        descricao:   '+7.500 ₿C de bônus incluído',
    },
    {
        id:          'whale',
        nome:        'Whale',
        valorBCBase: 50000,
        bonus:       30000,
        valorBC:     80000,
        precoReal:   149.90,
        destaque:    false,
        cor:         '#EF4444',
        icone:       '🐋',
        descricao:   '+30.000 ₿C de bônus incluído',
    },
];

// Formata número com separador de milhar
function fmt(n) {
    return Number(n).toLocaleString('pt-BR');
}

// Calcula o valor por ₿C de cada pacote (custo-benefício)
function valorPorBC(pacote) {
    return (pacote.precoReal / pacote.valorBC * 100).toFixed(3);
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function PacotesBC({ saldoAtual, onComprar }) {

    // Pacote selecionado para confirmar
    const [selecionado, setSelecionado] = useState(null);

    // Estado de compra em andamento
    const [comprando, setComprando] = useState(false);


    // ----------------------------------------------------------------
    // Confirma a compra do pacote selecionado
    // ----------------------------------------------------------------
    async function handleConfirmar() {
        if (!selecionado || comprando) return;
        setComprando(true);

        // Simula delay de processamento (substituir por chamada real)
        await new Promise(r => setTimeout(r, 1200));

        onComprar(selecionado);
        setSelecionado(null);
        setComprando(false);
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Aviso sobre a moeda ---- */}
            <div style={estilos.avisoMoeda}>
                <span style={{ fontSize: '16px' }}>ℹ️</span>
                <p style={estilos.avisoTexto}>
                    Bitchager (₿C) é a moeda do jogo. No futuro será
                    uma criptomoeda trocável por dinheiro real.
                </p>
            </div>

            {/* ---- Grid de pacotes ---- */}
            <div style={estilos.grid}>
                {PACOTES.map(pacote => {
                    const estaSelecionado = selecionado?.id === pacote.id;
                    return (
                        <CardPacote
                            key={pacote.id}
                            pacote={pacote}
                            selecionado={estaSelecionado}
                            onSelecionar={() => setSelecionado(
                                estaSelecionado ? null : pacote
                            )}
                        />
                    );
                })}
            </div>

            {/* ---- Painel de confirmação ---- */}
            {selecionado && (
                <div style={estilos.confirmacao}>

                    {/* Resumo do pacote */}
                    <div style={estilos.resumo}>
                        <div style={estilos.resumoLinha}>
                            <span style={estilos.resumoLabel}>Pacote</span>
                            <span style={estilos.resumoValor}>
                                {selecionado.icone} {selecionado.nome}
                            </span>
                        </div>
                        <div style={estilos.resumoLinha}>
                            <span style={estilos.resumoLabel}>₿C base</span>
                            <span style={estilos.resumoValor}>
                                ₿C {fmt(selecionado.valorBCBase)}
                            </span>
                        </div>
                        {selecionado.bonus > 0 && (
                            <div style={estilos.resumoLinha}>
                                <span style={estilos.resumoLabel}>Bônus</span>
                                <span style={{ ...estilos.resumoValor, color: '#22C55E' }}>
                                    + ₿C {fmt(selecionado.bonus)}
                                </span>
                            </div>
                        )}
                        <div style={estilos.separador} />
                        <div style={estilos.resumoLinha}>
                            <span style={{ ...estilos.resumoLabel, color: '#F8FAFC', fontWeight: '600' }}>
                                Total ₿C
                            </span>
                            <span style={{ ...estilos.resumoValor, color: '#F59E0B', fontSize: '16px' }}>
                                ₿C {fmt(selecionado.valorBC)}
                            </span>
                        </div>
                        <div style={estilos.resumoLinha}>
                            <span style={{ ...estilos.resumoLabel, color: '#F8FAFC', fontWeight: '600' }}>
                                Valor
                            </span>
                            <span style={{ ...estilos.resumoValor, color: '#F8FAFC', fontSize: '16px' }}>
                                R$ {selecionado.precoReal.toFixed(2).replace('.', ',')}
                            </span>
                        </div>
                        <div style={estilos.resumoLinha}>
                            <span style={estilos.resumoLabel}>Saldo após compra</span>
                            <span style={{ ...estilos.resumoValor, color: '#22C55E' }}>
                                ₿C {fmt(saldoAtual + selecionado.valorBC)}
                            </span>
                        </div>
                    </div>

                    {/* Métodos de pagamento */}
                    <p style={estilos.labelPagamento}>Pagar com</p>
                    <div style={estilos.metodosPagamento}>
                        <BotaoPagamento icone="📱" label="PIX"     destaque />
                        <BotaoPagamento icone="💳" label="Cartão"  />
                    </div>

                    {/* Botão confirmar */}
                    <button
                        onClick={handleConfirmar}
                        disabled={comprando}
                        style={{
                            ...estilos.btnConfirmar,
                            background: selecionado.cor,
                            opacity:    comprando ? 0.7 : 1,
                            cursor:     comprando ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {comprando
                            ? 'Processando...'
                            : `Comprar por R$ ${selecionado.precoReal.toFixed(2).replace('.', ',')}`
                        }
                    </button>

                    <p style={estilos.avisoSeguro}>
                        🔒 Pagamento seguro · Crédito imediato
                    </p>

                </div>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE CardPacote
// Card clicável de cada pacote disponível
// ================================================================

function CardPacote({ pacote, selecionado, onSelecionar }) {

    const percentBonus = pacote.bonus > 0
        ? Math.round((pacote.bonus / pacote.valorBCBase) * 100)
        : 0;

    return (
        <div
            onClick={onSelecionar}
            style={{
                ...estilos.card,
                border: selecionado
                    ? `2px solid ${pacote.cor}`
                    : '1px solid rgba(255,255,255,0.07)',
                background: selecionado
                    ? `${pacote.cor}12`
                    : '#111827',
                transform: selecionado ? 'scale(1.01)' : 'scale(1)',
            }}
        >
            {/* Badge "Mais popular" */}
            {pacote.destaque && (
                <div style={{
                    ...estilos.badgeDestaque,
                    background: pacote.cor,
                }}>
                    Mais popular
                </div>
            )}

            {/* Badge de bônus */}
            {percentBonus > 0 && (
                <div style={estilos.badgeBonus}>
                    +{percentBonus}%
                </div>
            )}

            {/* Ícone e nome */}
            <div style={estilos.cardTopo}>
                <span style={{ fontSize: '24px' }}>{pacote.icone}</span>
                <span style={{ ...estilos.cardNome, color: pacote.cor }}>
                    {pacote.nome}
                </span>
            </div>

            {/* Valor em ₿C */}
            <div style={estilos.cardBC}>
                <span style={estilos.simboloBC}>₿C</span>
                <span style={{ ...estilos.valorBC, color: pacote.cor }}>
                    {fmt(pacote.valorBC)}
                </span>
            </div>

            {/* Descrição do bônus */}
            {pacote.bonus > 0 && (
                <p style={estilos.cardDescricao}>{pacote.descricao}</p>
            )}

            {/* Preço em reais */}
            <div style={{
                ...estilos.cardPreco,
                background: selecionado ? `${pacote.cor}20` : 'rgba(255,255,255,0.04)',
                border:     selecionado ? `1px solid ${pacote.cor}40` : '1px solid transparent',
            }}>
                <span style={estilos.cifrao}>R$</span>
                <span style={estilos.precoValor}>
                    {pacote.precoReal.toFixed(2).replace('.', ',')}
                </span>
            </div>

            {/* Custo-benefício */}
            <p style={estilos.custoBeneficio}>
                R$ {valorPorBC(pacote)} por 100 ₿C
            </p>

        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE BotaoPagamento
// Botão de método de pagamento (PIX, Cartão)
// ================================================================

function BotaoPagamento({ icone, label, destaque }) {
    const [ativo, setAtivo] = useState(destaque || false);

    return (
        <button
            onClick={() => setAtivo(true)}
            style={{
                ...estilos.btnPagamento,
                background: ativo ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                border:     ativo
                    ? '1px solid rgba(124,58,237,0.4)'
                    : '1px solid rgba(255,255,255,0.08)',
                color:      ativo ? '#A78BFA' : 'rgba(255,255,255,0.5)',
            }}
        >
            <span style={{ fontSize: '18px' }}>{icone}</span>
            <span style={{ fontSize: '13px', fontWeight: ativo ? '600' : '400' }}>
                {label}
            </span>
            {destaque && (
                <span style={estilos.badgePix}>Recomendado</span>
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
        gap:           '14px',
    },

    // Aviso informativo sobre a moeda
    avisoMoeda: {
        display:      'flex',
        gap:          '10px',
        alignItems:   'flex-start',
        padding:      '10px 12px',
        background:   'rgba(59,130,246,0.08)',
        border:       '1px solid rgba(59,130,246,0.2)',
        borderRadius: '8px',
    },

    avisoTexto: {
        fontSize:   '12px',
        color:      'rgba(255,255,255,0.5)',
        margin:     0,
        lineHeight: 1.5,
    },

    // Grid 2x2 de pacotes
    grid: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '10px',
    },

    // Card de pacote
    card: {
        borderRadius:  '12px',
        padding:       '14px 12px',
        cursor:        'pointer',
        position:      'relative',
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
        transition:    'all 0.2s',
        WebkitTapHighlightColor: 'transparent',
        overflow:      'hidden',
    },

    // Badge "Mais popular"
    badgeDestaque: {
        position:     'absolute',
        top:          0,
        left:         0,
        right:        0,
        textAlign:    'center',
        fontSize:     '10px',
        fontWeight:   '600',
        color:        'white',
        padding:      '3px 0',
        letterSpacing: '0.04em',
    },

    // Badge de % de bônus
    badgeBonus: {
        position:     'absolute',
        top:          '6px',
        right:        '6px',
        background:   'rgba(34,197,94,0.2)',
        border:       '1px solid rgba(34,197,94,0.3)',
        borderRadius: '4px',
        fontSize:     '10px',
        fontWeight:   '700',
        color:        '#4ADE80',
        padding:      '2px 5px',
    },

    cardTopo: {
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        marginTop:  '14px', // espaço para o badge "Mais popular"
    },

    cardNome: {
        fontSize:   '14px',
        fontWeight: '700',
    },

    cardBC: {
        display:    'flex',
        alignItems: 'baseline',
        gap:        '3px',
    },

    simboloBC: {
        fontSize:   '11px',
        color:      '#F59E0B',
        fontWeight: '700',
    },

    valorBC: {
        fontSize:   '20px',
        fontWeight: '800',
        lineHeight: 1,
    },

    cardDescricao: {
        fontSize:   '10px',
        color:      '#4ADE80',
        margin:     0,
        lineHeight: 1.3,
    },

    // Box do preço em reais
    cardPreco: {
        display:        'flex',
        alignItems:     'baseline',
        justifyContent: 'center',
        gap:            '3px',
        padding:        '6px',
        borderRadius:   '6px',
        transition:     'all 0.2s',
        marginTop:      'auto',
    },

    cifrao: {
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.4)',
    },

    precoValor: {
        fontSize:   '16px',
        fontWeight: '700',
        color:      '#F8FAFC',
    },

    custoBeneficio: {
        fontSize:  '9px',
        color:     'rgba(255,255,255,0.25)',
        margin:    0,
        textAlign: 'center',
    },

    // Painel de confirmação de compra
    confirmacao: {
        background:    '#111827',
        border:        '1px solid rgba(255,255,255,0.08)',
        borderRadius:  '12px',
        padding:       '16px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '12px',
    },

    // Resumo dos valores
    resumo: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },

    resumoLinha: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
    },

    resumoLabel: {
        fontSize: '13px',
        color:    'rgba(255,255,255,0.4)',
    },

    resumoValor: {
        fontSize:   '13px',
        fontWeight: '500',
        color:      '#F8FAFC',
    },

    separador: {
        height:     '1px',
        background: 'rgba(255,255,255,0.06)',
        margin:     '2px 0',
    },

    labelPagamento: {
        fontSize:      '11px',
        color:         'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin:        0,
    },

    // Container dos métodos de pagamento
    metodosPagamento: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '8px',
    },

    btnPagamento: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '4px',
        padding:       '10px',
        borderRadius:  '8px',
        cursor:        'pointer',
        transition:    'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
        outline:       'none',
        position:      'relative',
    },

    badgePix: {
        fontSize:     '9px',
        background:   'rgba(34,197,94,0.2)',
        color:        '#4ADE80',
        padding:      '1px 5px',
        borderRadius: '4px',
        fontWeight:   '600',
    },

    // Botão de confirmar compra
    btnConfirmar: {
        width:        '100%',
        padding:      '13px',
        border:       'none',
        borderRadius: '10px',
        color:        'white',
        fontSize:     '15px',
        fontWeight:   '600',
        transition:   'opacity 0.2s',
        WebkitTapHighlightColor: 'transparent',
    },

    avisoSeguro: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.25)',
        textAlign: 'center',
        margin:    0,
    },
};
