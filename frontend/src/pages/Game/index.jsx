/* ================================================================
   ARQUIVO: frontend/src/pages/Game/index.jsx

   CONCEITO GERAL:
   Tela principal da mesa de poker.
   Escuta eventos do Socket.io e monta a interface do jogo.

   EVENTOS QUE ESCUTA (servidor → cliente):
     estado_mesa   → atualiza todo o estado da partida
     carta_privada → recebe suas cartas (só você vê)
     erro          → mensagem de erro do servidor

   EVENTOS QUE EMITE (cliente → servidor):
     iniciar_rodada → host inicia a partida
     acao           → fold, check, call, raise
     pedir_estado   → pede atualização do estado

   ESTRUTURA DO ESTADO DA MESA (vindo do servidor):
   {
     id, nome, fase,
     pote, maiorAposta, bigBlind, smallBlind,
     cartasComunitarias: ['As', 'Kh', ...],
     jogadores: {
       uid: { nome, avatar, saldo, aposta, status, cartas, posicao }
     },
     vezDeQuem: uid,
     meuUid: uid,
     ordem: [uid, uid, ...],
   }

   PROPS:
     socket   → instância do Socket.io
     usuario  → dados do jogador logado
     mesaId   → ID da mesa atual
     onSair   → função para voltar ao lobby
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import ActionBar from '../../components/ActionBar';


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

// Fases do jogo para exibição
const LABEL_FASE = {
    'AGUARDANDO': 'Aguardando jogadores',
    'PRE-FLOP':   'Pré-Flop',
    'FLOP':       'Flop',
    'TURN':       'Turn',
    'RIVER':      'River',
    'SHOWDOWN':   'Showdown',
};

// Cores dos naipes
const COR_NAIPE = {
    h: '#EF4444', // copas    ♥ vermelho
    d: '#EF4444', // ouros    ♦ vermelho
    s: '#1a1a2e', // espadas  ♠ preto
    c: '#1a1a2e', // paus     ♣ preto
};

// Símbolo dos naipes
const SIMBOLO_NAIPE = {
    h: '♥',
    d: '♦',
    s: '♠',
    c: '♣',
};


// ================================================================
// BLOCO 2: FUNÇÕES AUXILIARES
// ================================================================

// Converte código de carta ("As", "Kh", "2d") em objeto legível
// "As" → { valor: 'A', naipe: 's', simbolo: '♠', cor: '#1a1a2e' }
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


// ================================================================
// BLOCO 3: COMPONENTE PRINCIPAL
// ================================================================

export default function Game({ socket, usuario, onSair }) {

    // Estado completo da mesa (vindo do servidor)
    const [mesa, setMesa] = useState(null);

    // Minhas cartas privadas (só eu vejo)
    const [minhasCartas, setMinhasCartas] = useState([]);

    // Mensagem de notificação (ex: "Você ganhou ₿C 500!")
    const [notificacao, setNotificacao] = useState(null);

    // Controla o timer de ação
    const timerRef = useRef(null);


    // ----------------------------------------------------------------
    // EFEITO: escuta eventos do Socket.io
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        // Recebe o estado completo da mesa
        socket.on('estado_mesa', (estadoRecebido) => {
            setMesa(estadoRecebido);
        });

        // Recebe minhas cartas privadas
        socket.on('carta_privada', ({ cartas }) => {
            setMinhasCartas(cartas || []);
        });

        // Recebe notificações (vencedor, etc.)
        socket.on('notificacao', ({ mensagem }) => {
            setNotificacao(mensagem);
            setTimeout(() => setNotificacao(null), 4000);
        });

        // Pede o estado ao conectar
        socket.emit('pedir_estado');

        // Copia o ref para variável local antes do cleanup
        // O ESLint avisa que timerRef.current pode mudar antes do cleanup rodar
        const timer = timerRef.current;
        return () => {
            socket.off('estado_mesa');
            socket.off('carta_privada');
            socket.off('notificacao');
            if (timer) clearInterval(timer);
        };
    }, [socket]);


    // ----------------------------------------------------------------
    // Envia ação do jogador
    // ----------------------------------------------------------------
    const handleAcao = useCallback((acao, valor = 0) => {
        socket?.emit('acao', { acao, valor });
    }, [socket]);


    // ----------------------------------------------------------------
    // Host inicia a rodada
    // ----------------------------------------------------------------
    const handleIniciar = useCallback(() => {
        socket?.emit('iniciar_rodada');
    }, [socket]);


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================

    // Carregando
    if (!mesa) {
        return (
            <div style={estilos.carregando}>
                <style>{`@keyframes girar { to { transform: rotate(360deg); } }`}</style>
                <div style={estilos.spinner} />
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', margin: 0 }}>
                    Entrando na mesa...
                </p>
            </div>
        );
    }

    const meuUid         = usuario?.uid;
    const ehMinhaVez     = mesa.vezDeQuem === meuUid;
    const euSou          = mesa.jogadores?.[meuUid];
    const sou_host       = mesa.host === meuUid;
    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const fase           = LABEL_FASE[mesa.fase] || mesa.fase;
    const cartasCom      = (mesa.cartasComunitarias || []).map(parsearCarta);

    return (
        <div style={estilos.pagina}>

            {/* ---- HEADER: info da mesa ---- */}
            <div style={estilos.header}>
                <button onClick={onSair} style={estilos.btnSair}>← Sair</button>
                <div style={estilos.headerInfo}>
                    <span style={estilos.nomeMesa}>{mesa.nome}</span>
                    <span style={estilos.faseLabel}>{fase}</span>
                </div>
                <div style={estilos.potContainer}>
                    <span style={estilos.potLabel}>Pote</span>
                    <span style={estilos.potValor}>₿C {fmt(mesa.pote)}</span>
                </div>
            </div>

            {/* ---- MESA DE POKER ---- */}
            <div style={estilos.mesaContainer}>
                <div style={estilos.feltro}>

                    {/* Cartas comunitárias */}
                    <div style={estilos.cartasComunidade}>
                        {cartasCom.length > 0 ? (
                            cartasCom.map((carta, i) => (
                                carta ? (
                                    <CartaVisual key={i} carta={carta} />
                                ) : (
                                    <CartaVazia key={i} />
                                )
                            ))
                        ) : (
                            <p style={estilos.esperandoTexto}>
                                {mesa.fase === 'AGUARDANDO'
                                    ? 'Aguardando jogadores...'
                                    : 'Distribuindo cartas...'}
                            </p>
                        )}
                    </div>

                    {/* Info central */}
                    {mesa.pote > 0 && (
                        <div style={estilos.potCentral}>
                            <span style={estilos.potCentralTexto}>
                                Pote: ₿C {fmt(mesa.pote)}
                            </span>
                        </div>
                    )}

                    {/* Jogadores ao redor da mesa */}
                    {jogadoresArray.map(([uid, jogador], index) => (
                        <AssentoJogador
                            key={uid}
                            jogador={jogador}
                            uid={uid}
                            index={index}
                            total={jogadoresArray.length}
                            ehVez={mesa.vezDeQuem === uid}
                            souEu={uid === meuUid}
                            cartasPrivadas={uid === meuUid ? minhasCartas : []}
                        />
                    ))}

                </div>
            </div>

            {/* ---- MINHAS CARTAS ---- */}
            {minhasCartas.length > 0 && (
                <div style={estilos.minhasCartasContainer}>
                    {minhasCartas.map((codigo, i) => {
                        const carta = parsearCarta(codigo);
                        return carta ? <CartaVisual key={i} carta={carta} grande /> : null;
                    })}
                </div>
            )}

            {/* ---- BOTÃO INICIAR (só para o host) ---- */}
            {mesa.fase === 'AGUARDANDO' && sou_host && (
                <div style={estilos.btnIniciarContainer}>
                    <button
                        onClick={handleIniciar}
                        disabled={jogadoresArray.length < 2}
                        style={{
                            ...estilos.btnIniciar,
                            opacity: jogadoresArray.length < 2 ? 0.5 : 1,
                        }}
                    >
                        {jogadoresArray.length < 2
                            ? `Aguardando jogadores (${jogadoresArray.length}/2)`
                            : `Iniciar Partida (${jogadoresArray.length} jogadores)`
                        }
                    </button>
                </div>
            )}

            {/* ---- BARRA DE AÇÕES ---- */}
            {mesa.fase !== 'AGUARDANDO' && euSou && (
                <ActionBar
                    ehMinhaVez={ehMinhaVez}
                    saldoAtual={euSou.saldo || 0}
                    apostaRodada={euSou.aposta || 0}
                    maiorAposta={mesa.maiorAposta || 0}
                    bigBlind={mesa.bigBlind || 20}
                    pote={mesa.pote || 0}
                    onAcao={handleAcao}
                />
            )}

            {/* ---- NOTIFICAÇÃO ---- */}
            {notificacao && (
                <div style={estilos.notificacao}>
                    {notificacao}
                </div>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE AssentoJogador
// Exibe um jogador ao redor da mesa
// ================================================================

function AssentoJogador({ jogador, index, total, ehVez, souEu }) {

    // Posiciona os assentos ao redor da mesa em círculo
    // Calcula o ângulo com base no índice e total de jogadores
    const angulo     = (index / total) * 360 - 90;
    const radiano    = (angulo * Math.PI) / 180;
    const raioX      = 42; // % do container
    const raioY      = 35;
    const esquerda   = 50 + raioX * Math.cos(radiano);
    const topo       = 50 + raioY * Math.sin(radiano);

    const foldado = jogador.status === 'FOLD';

    return (
        <div style={{
            ...estilos.assento,
            left:    `${esquerda}%`,
            top:     `${topo}%`,
            opacity: foldado ? 0.4 : 1,
            border:  ehVez
                ? '2px solid #F59E0B'
                : souEu
                    ? '2px solid #7C3AED'
                    : '2px solid rgba(255,255,255,0.1)',
            boxShadow: ehVez ? '0 0 16px rgba(245,158,11,0.5)' : 'none',
        }}>

            {/* Avatar */}
            <div style={estilos.assentoAvatar}>
                {jogador.avatar
                    ? <img src={jogador.avatar} alt={jogador.nome} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => e.target.style.display='none'} />
                    : <span style={{ fontSize: '18px' }}>🧑</span>
                }
            </div>

            {/* Nome + saldo */}
            <p style={estilos.assentoNome}>{jogador.nome?.split(' ')[0] || 'Bot'}</p>
            <p style={estilos.assentoSaldo}>₿C {fmt(jogador.saldo)}</p>

            {/* Aposta atual */}
            {jogador.aposta > 0 && (
                <div style={estilos.assentoAposta}>
                    ₿C {fmt(jogador.aposta)}
                </div>
            )}

            {/* Status */}
            {foldado && (
                <div style={estilos.statusFold}>FOLD</div>
            )}

            {/* Cartas do jogador (verso para outros, frente para mim) */}
            {jogador.cartas?.length > 0 && !souEu && (
                <div style={estilos.cartasVerso}>
                    {jogador.cartas.map((_, i) => (
                        <div key={i} style={estilos.cartaVerso} />
                    ))}
                </div>
            )}

            {/* Indicador de vez */}
            {ehVez && (
                <div style={estilos.indicadorVez}>▶</div>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 5: COMPONENTE CartaVisual
// Exibe uma carta com valor e naipe
// ================================================================

function CartaVisual({ carta, grande = false }) {
    const tamanho = grande ? { width: '60px', height: '84px', fontSize: '22px' } : { width: '44px', height: '62px', fontSize: '16px' };

    return (
        <div style={{
            ...estilos.carta,
            ...tamanho,
        }}>
            <span style={{ ...estilos.cartaValorTopo, color: carta.cor }}>
                {carta.valor}{carta.simbolo}
            </span>
            <span style={{ fontSize: grande ? '28px' : '20px', color: carta.cor, lineHeight: 1 }}>
                {carta.simbolo}
            </span>
            <span style={{ ...estilos.cartaValorBase, color: carta.cor }}>
                {carta.valor}{carta.simbolo}
            </span>
        </div>
    );
}

function CartaVazia() {
    return (
        <div style={{ ...estilos.carta, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)' }} />
    );
}


// ================================================================
// BLOCO 6: ESTILOS
// ================================================================

const estilos = {

    pagina: {
        minHeight:     '100vh',
        background:    '#0a0f1e',
        display:       'flex',
        flexDirection: 'column',
        fontFamily:    'sans-serif',
        color:         '#F8FAFC',
        overflowX:     'hidden',
        maxWidth:      '480px',
        margin:        '0 auto',
    },

    carregando: {
        minHeight:      '100vh',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        background:     '#0a0f1e',
        gap:            '16px',
    },

    spinner: {
        width:        '32px',
        height:       '32px',
        border:       '3px solid rgba(255,255,255,0.1)',
        borderTop:    '3px solid #7C3AED',
        borderRadius: '50%',
        animation:    'girar 0.8s linear infinite',
    },

    // Header
    header: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 14px',
        background:     '#0d1424',
        borderBottom:   '1px solid rgba(255,255,255,0.06)',
        flexShrink:     0,
    },

    btnSair: {
        background:   'rgba(255,255,255,0.06)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color:        'rgba(255,255,255,0.6)',
        fontSize:     '13px',
        padding:      '6px 10px',
        cursor:       'pointer',
        fontFamily:   'sans-serif',
    },

    headerInfo: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '2px',
    },

    nomeMesa: {
        fontSize:   '14px',
        fontWeight: '600',
        color:      '#F8FAFC',
    },

    faseLabel: {
        fontSize:  '11px',
        color:     '#F59E0B',
        fontWeight: '500',
    },

    potContainer: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-end',
        gap:           '2px',
    },

    potLabel: {
        fontSize: '10px',
        color:    'rgba(255,255,255,0.4)',
    },

    potValor: {
        fontSize:   '14px',
        fontWeight: '700',
        color:      '#F59E0B',
    },

    // Mesa de poker
    mesaContainer: {
        flex:    1,
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '320px',
    },

    feltro: {
        width:        '100%',
        maxWidth:     '400px',
        aspectRatio:  '1.4',
        background:   'radial-gradient(ellipse at center, #1a5c2e 0%, #0f3d1e 70%, #0a2d15 100%)',
        borderRadius: '50%',
        border:       '6px solid #2d4a1e',
        boxShadow:    '0 0 40px rgba(0,0,0,0.6), inset 0 0 60px rgba(0,0,0,0.3)',
        position:     'relative',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap:           '8px',
    },

    // Cartas comunitárias
    cartasComunidade: {
        display:    'flex',
        gap:        '6px',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex:     2,
    },

    esperandoTexto: {
        fontSize:  '12px',
        color:     'rgba(255,255,255,0.4)',
        margin:    0,
        textAlign: 'center',
    },

    potCentral: {
        background:   'rgba(0,0,0,0.4)',
        borderRadius: '20px',
        padding:      '4px 12px',
        zIndex:       2,
    },

    potCentralTexto: {
        fontSize:   '12px',
        color:      '#F59E0B',
        fontWeight: '600',
    },

    // Assento do jogador
    assento: {
        position:       'absolute',
        transform:      'translate(-50%, -50%)',
        background:     'rgba(13, 20, 36, 0.92)',
        borderRadius:   '12px',
        padding:        '6px 8px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '2px',
        minWidth:       '64px',
        zIndex:         3,
        transition:     'border 0.3s, box-shadow 0.3s',
    },

    assentoAvatar: {
        width:          '32px',
        height:         '32px',
        borderRadius:   '50%',
        background:     'rgba(255,255,255,0.1)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        overflow:       'hidden',
        flexShrink:     0,
    },

    assentoNome: {
        fontSize:     '10px',
        fontWeight:   '600',
        color:        '#F8FAFC',
        margin:       0,
        textAlign:    'center',
        maxWidth:     '60px',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
    },

    assentoSaldo: {
        fontSize:   '9px',
        color:      '#F59E0B',
        margin:     0,
        fontWeight: '500',
    },

    assentoAposta: {
        position:     'absolute',
        bottom:       '-20px',
        background:   'rgba(245,158,11,0.2)',
        border:       '1px solid rgba(245,158,11,0.4)',
        borderRadius: '10px',
        padding:      '2px 6px',
        fontSize:     '9px',
        color:        '#F59E0B',
        fontWeight:   '600',
        whiteSpace:   'nowrap',
    },

    statusFold: {
        position:     'absolute',
        top:          '50%',
        left:         '50%',
        transform:    'translate(-50%, -50%)',
        background:   'rgba(239,68,68,0.8)',
        color:        'white',
        fontSize:     '9px',
        fontWeight:   '700',
        padding:      '2px 6px',
        borderRadius: '4px',
    },

    cartasVerso: {
        display: 'flex',
        gap:     '2px',
        marginTop: '2px',
    },

    cartaVerso: {
        width:        '14px',
        height:       '20px',
        background:   'linear-gradient(135deg, #1E3A8A, #1E40AF)',
        borderRadius: '2px',
        border:       '1px solid rgba(255,255,255,0.2)',
    },

    indicadorVez: {
        position:  'absolute',
        top:       '-14px',
        fontSize:  '10px',
        color:     '#F59E0B',
        animation: 'pulse 1s ease-in-out infinite',
    },

    // Cartas do jogador local
    minhasCartasContainer: {
        display:        'flex',
        gap:            '10px',
        justifyContent: 'center',
        padding:        '8px 0',
        flexShrink:     0,
    },

    // Carta visual
    carta: {
        background:     '#FFFFFF',
        borderRadius:   '6px',
        border:         '1px solid #D1D5DB',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        position:       'relative',
        flexShrink:     0,
        boxShadow:      '0 2px 8px rgba(0,0,0,0.3)',
    },

    cartaValorTopo: {
        position:   'absolute',
        top:        '3px',
        left:       '4px',
        fontSize:   '10px',
        fontWeight: '800',
        lineHeight: 1,
    },

    cartaValorBase: {
        position:   'absolute',
        bottom:     '3px',
        right:      '4px',
        fontSize:   '10px',
        fontWeight: '800',
        lineHeight: 1,
        transform:  'rotate(180deg)',
    },

    // Botão iniciar
    btnIniciarContainer: {
        padding:   '12px 14px',
        flexShrink: 0,
    },

    btnIniciar: {
        width:        '100%',
        padding:      '14px',
        background:   'linear-gradient(135deg, #22C55E, #16A34A)',
        border:       'none',
        borderRadius: '12px',
        color:        'white',
        fontSize:     '15px',
        fontWeight:   '600',
        cursor:       'pointer',
        fontFamily:   'sans-serif',
        transition:   'opacity 0.2s',
    },

    // Notificação
    notificacao: {
        position:     'fixed',
        top:          '80px',
        left:         '50%',
        transform:    'translateX(-50%)',
        background:   'rgba(34,197,94,0.15)',
        border:       '1px solid rgba(34,197,94,0.4)',
        borderRadius: '10px',
        padding:      '10px 20px',
        color:        '#4ADE80',
        fontSize:     '14px',
        fontWeight:   '600',
        zIndex:       999,
        textAlign:    'center',
        maxWidth:     '300px',
        animation:    'fadeIn 0.3s ease',
    },
};
