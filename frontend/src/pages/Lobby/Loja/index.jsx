/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Loja/index.jsx

   CONCEITO GERAL:
   Página da loja onde o jogador pode:
     → Comprar pacotes de Bitchager (₿C) com dinheiro real
     → Comprar temas visuais para as cartas com ₿C

   ESTRUTURA DA LOJA:
   A loja tem duas seções exibidas em tabs internas:
     → Bitchager  : pacotes de compra com PIX/cartão
     → Temas      : visuais das cartas comprados com ₿C

   SOBRE O PAGAMENTO:
   Por enquanto os pacotes de ₿C são simulados (sem gateway real).
   A integração com Stripe/PIX vem em uma próxima etapa.
   O botão já existe e está preparado para receber o gateway.

   PROPS:
     usuario → { uid, nome, saldo, tema }
     socket  → instância do Socket.io
================================================================ */

import { useState } from 'react';
import PacotesBC    from './PacotesBC';
import TemasCartas  from './TemasCartas';


// ================================================================
// BLOCO 1: TABS INTERNAS DA LOJA
// ================================================================

const TABS_LOJA = [
    { id: 'bc',     label: '₿C Bitchager', icone: '💰' },
    { id: 'temas',  label: 'Temas',         icone: '🎨' },
];


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Loja({ usuario, socket }) {

    const [tabAtiva, setTabAtiva] = useState('bc');

    // Feedback de compra — mostra mensagem de sucesso/erro
    const [feedback, setFeedback] = useState(null);
    // feedback = { tipo: 'sucesso'|'erro', mensagem: string }


    // ----------------------------------------------------------------
    // Mostra feedback temporário por 3 segundos
    // ----------------------------------------------------------------
    function mostrarFeedback(tipo, mensagem) {
        setFeedback({ tipo, mensagem });
        setTimeout(() => setFeedback(null), 3000);
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.container}>

            {/* ---- Cabeçalho da loja ---- */}
            <div style={estilos.cabecalho}>
                <div>
                    <h2 style={estilos.titulo}>Loja</h2>
                    <p style={estilos.subtitulo}>
                        Seu saldo:{' '}
                        <span style={{ color: '#F59E0B', fontWeight: '700' }}>
                            ₿C {Number(usuario?.saldo || 0).toLocaleString('pt-BR')}
                        </span>
                    </p>
                </div>
                {/* Ícone decorativo */}
                <span style={estilos.iconeDecorativo}>🏪</span>
            </div>

            {/* ---- Feedback de compra ---- */}
            {feedback && (
                <div style={{
                    ...estilos.feedback,
                    background: feedback.tipo === 'sucesso'
                        ? 'rgba(34,197,94,0.1)'
                        : 'rgba(239,68,68,0.1)',
                    border: feedback.tipo === 'sucesso'
                        ? '1px solid rgba(34,197,94,0.3)'
                        : '1px solid rgba(239,68,68,0.3)',
                    color: feedback.tipo === 'sucesso' ? '#4ADE80' : '#FCA5A5',
                }}>
                    <span style={{ fontSize: '16px' }}>
                        {feedback.tipo === 'sucesso' ? '✓' : '✕'}
                    </span>
                    {feedback.mensagem}
                </div>
            )}

            {/* ---- Tabs internas ---- */}
            <div style={estilos.tabs}>
                {TABS_LOJA.map(tab => {
                    const ativa = tabAtiva === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setTabAtiva(tab.id)}
                            style={{
                                ...estilos.tab,
                                background: ativa
                                    ? 'rgba(124,58,237,0.15)'
                                    : 'transparent',
                                border: ativa
                                    ? '1px solid rgba(124,58,237,0.4)'
                                    : '1px solid rgba(255,255,255,0.06)',
                                color: ativa ? '#A78BFA' : 'rgba(255,255,255,0.4)',
                            }}
                        >
                            <span style={{ fontSize: '14px' }}>{tab.icone}</span>
                            <span style={{
                                fontSize:   '13px',
                                fontWeight: ativa ? '600' : '400',
                            }}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ---- Conteúdo da tab ativa ---- */}
            {tabAtiva === 'bc' && (
                <PacotesBC
                    saldoAtual={usuario?.saldo || 0}
                    onComprar={(pacote) => {
                        // Aqui virá a integração com Stripe/PIX
                        // Por enquanto simula a compra
                        mostrarFeedback(
                            'sucesso',
                            `₿C ${pacote.valorBC.toLocaleString('pt-BR')} adicionados! (simulado)`
                        );
                    }}
                />
            )}

            {tabAtiva === 'temas' && (
                <TemasCartas
                    saldoAtual={usuario?.saldo || 0}
                    temaAtual={usuario?.tema || 'classico'}
                    onComprar={(tema) => {
                        if ((usuario?.saldo || 0) < tema.preco) {
                            mostrarFeedback('erro', 'Saldo insuficiente de ₿C.');
                            return;
                        }
                        // Emite compra do tema via socket
                        socket?.emit('comprar_tema', { temaId: tema.id });
                        mostrarFeedback('sucesso', `Tema "${tema.nome}" ativado!`);
                    }}
                    onAtivar={(tema) => {
                        socket?.emit('ativar_tema', { temaId: tema.id });
                        mostrarFeedback('sucesso', `Tema "${tema.nome}" ativado!`);
                    }}
                />
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: ESTILOS
// ================================================================

const estilos = {

    container: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '14px',
    },

    cabecalho: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
    },

    titulo: {
        fontSize:   '20px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    subtitulo: {
        fontSize: '13px',
        color:    'rgba(255,255,255,0.4)',
        margin:   '4px 0 0',
    },

    iconeDecorativo: {
        fontSize: '36px',
        opacity:  0.6,
    },

    // Box de feedback (sucesso ou erro)
    feedback: {
        display:      'flex',
        alignItems:   'center',
        gap:          '8px',
        padding:      '10px 14px',
        borderRadius: '8px',
        fontSize:     '13px',
        fontWeight:   '500',
        animation:    'fadeIn 0.2s ease',
    },

    // Tabs internas da loja
    tabs: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '8px',
    },

    tab: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '6px',
        padding:        '10px',
        borderRadius:   '8px',
        cursor:         'pointer',
        transition:     'all 0.2s',
        WebkitTapHighlightColor: 'transparent',
        outline:        'none',
    },
};
