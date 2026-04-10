/* ================================================================
   ARQUIVO: frontend/src/pages/Game/index.jsx

   CONCEITO GERAL:
   Tela principal da mesa de poker.
   Orquestra todos os componentes do jogo e escuta o Socket.io.

   ANTES: tinha todo o código inline (cartas, jogadores, feltro)
   AGORA: delega para componentes especializados:
     → InfoMesa.jsx           — header com pote, fase, blinds
     → Mesa.jsx               — feltro verde + jogadores ao redor
     → CartasJogador.jsx      — suas 2 cartas privadas
     → CartasComunitarias.jsx — flop, turn, river
     → Jogador.jsx            — cada assento (usado dentro de Mesa.jsx)
     → ActionBar.jsx          — botões fold, check, call, raise

   EVENTOS QUE ESCUTA (servidor → cliente):
     estado_mesa   → atualiza todo o estado da partida
     carta_privada → recebe suas 2 cartas (só você vê)
     notificacao   → mensagem de vitória/derrota

   EVENTOS QUE EMITE (cliente → servidor):
     iniciar_rodada → host inicia a partida
     acao           → fold, check, call, raise
     pedir_estado   → pede o estado atual ao conectar

   PROPS:
     socket   → instância do Socket.io (criada no App.jsx)
     usuario  → dados do jogador logado { uid, nome, avatar, saldo }
     mesaId   → ID da mesa atual
     onSair   → função para voltar ao lobby
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';

// Componentes especializados
import InfoMesa           from './InfoMesa';
import Mesa               from './Mesa';
import CartasJogador      from './CartasJogador';
import CartasComunitarias from './CartasComunitarias';
import ActionBar          from '../../components/ActionBar';


// ================================================================
// BLOCO 1: COMPONENTE PRINCIPAL
// ================================================================

export default function Game({ socket, usuario, mesaId, onSair }) {

    // Estado completo da mesa (vindo do servidor via Socket.io)
    const [mesa, setMesa] = useState(null);

    // Minhas 2 cartas privadas — só eu vejo
    const [minhasCartas, setMinhasCartas] = useState([]);

    // Mensagem de notificação (ex: "Você ganhou ₿C 500!")
    const [notificacao, setNotificacao] = useState(null);

    // Ref do timer para limpar no cleanup
    const timerRef = useRef(null);

    // mesaId é recebido como prop mas o estado vem via Socket.io
    // Guardamos apenas para referência/debug
    const _mesaId = mesaId;


    // ----------------------------------------------------------------
    // EFEITO: escuta eventos do Socket.io
    //
    // Registra os listeners ao montar e remove ao desmontar.
    // Sem o cleanup (socket.off), os listeners acumulam a cada
    // re-render causando callbacks duplicados.
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        // 'estado_mesa': recebido sempre que algo muda na partida
        socket.on('estado_mesa', (estadoRecebido) => {
            setMesa(estadoRecebido);
        });

        // 'carta_privada': suas 2 hole cards — só você recebe
        socket.on('carta_privada', ({ cartas }) => {
            setMinhasCartas(cartas || []);
        });

        // 'notificacao': mensagem de evento importante
        socket.on('notificacao', ({ mensagem }) => {
            setNotificacao(mensagem);
            timerRef.current = setTimeout(() => setNotificacao(null), 4000);
        });

        // Pede o estado atual ao entrar na tela
        socket.emit('pedir_estado');

        // Copia o ref para variável local antes do cleanup
        const timer = timerRef.current;

        return () => {
            socket.off('estado_mesa');
            socket.off('carta_privada');
            socket.off('notificacao');
            if (timer) clearTimeout(timer);
        };
    }, [socket]);


    // ----------------------------------------------------------------
    // Envia ação do jogador ao servidor
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


    // ----------------------------------------------------------------
    // Sair da mesa
    // ----------------------------------------------------------------
    const handleSair = useCallback(() => {
        socket?.emit('sair_mesa');
        onSair?.();
    }, [socket, onSair]);


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================

    // Aguardando primeiro estado_mesa do servidor
    if (!mesa) {
        return (
            <div style={estilos.carregando}>
                <style>{`@keyframes girar { to { transform: rotate(360deg); } }`}</style>
                <div style={estilos.spinner} />
                <p style={estilos.carregandoTexto}>Entrando na mesa...</p>
            </div>
        );
    }

    const meuUid         = usuario?.uid;
    const ehMinhaVez     = mesa.vezDeQuem === meuUid;
    const euSou          = mesa.jogadores?.[meuUid];
    const souHost        = mesa.host === meuUid;
    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const foldado        = euSou?.status === 'FOLD';

    // Suprime aviso de variável não usada do mesaId
    void _mesaId;

    return (
        <div style={estilos.pagina}>

            {/* Animações globais + responsividade desktop */}
            <style>{`
                @keyframes girar  { to { transform: rotate(360deg); } }
                @keyframes pulsar { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @media (min-width: 768px) {
                    .game-pagina { max-width: 900px !important; }
                }
            `}</style>

            {/* ---- HEADER: botão sair + info da mesa ---- */}
            <div style={estilos.headerWrapper}>
                <button onClick={handleSair} style={estilos.btnSair}>
                    ← Sair
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* InfoMesa: nome, fase, pote, SB, BB, call */}
                    <InfoMesa mesa={mesa} />
                </div>
            </div>

            {/* ---- MESA DE POKER ---- */}
            {/*
                Mesa.jsx renderiza:
                  - O feltro verde oval
                  - Os jogadores posicionados ao redor (via Jogador.jsx)
                  - As cartas comunitárias no centro (via CartasComunitarias interno)
                  - O pote no centro
            */}
            <div style={estilos.mesaWrapper}>
                <Mesa
                    mesa={mesa}
                    meuUid={meuUid}
                    minhasCartas={minhasCartas}
                />
            </div>

            {/* ---- CARTAS COMUNITÁRIAS ---- */}
            {/*
                Exibidas também abaixo da mesa para melhor visibilidade
                no mobile. CartasComunitarias.jsx cuida da animação de virada
                e dos slots vazios do flop/turn/river.
            */}
            {mesa.fase !== 'AGUARDANDO' && (
                <div style={estilos.cartasComunidadeWrapper}>
                    <CartasComunitarias
                        cartas={mesa.cartasComunitarias || []}
                        fase={mesa.fase}
                    />
                </div>
            )}

            {/* ---- MINHAS CARTAS ---- */}
            {/*
                CartasJogador.jsx exibe as 2 cartas privadas.
                Mostra slots vazios se a rodada está ativa mas sem cartas.
                Mostra cartas viradas/opacas se o jogador foldou.
            */}
            <div style={estilos.minhasCartasWrapper}>
                <CartasJogador
                    cartas={minhasCartas}
                    foldado={foldado}
                    fase={mesa.fase}
                />
            </div>

            {/* ---- BOTÃO INICIAR (host + fase AGUARDANDO) ---- */}
            {mesa.fase === 'AGUARDANDO' && souHost && (
                <div style={estilos.btnIniciarWrapper}>
                    <button
                        onClick={handleIniciar}
                        disabled={jogadoresArray.length < 2}
                        style={{
                            ...estilos.btnIniciar,
                            opacity: jogadoresArray.length < 2 ? 0.5 : 1,
                            cursor:  jogadoresArray.length < 2 ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {jogadoresArray.length < 2
                            ? `Aguardando jogadores (${jogadoresArray.length}/2 mínimo)`
                            : `▶ Iniciar Partida (${jogadoresArray.length} jogadores)`
                        }
                    </button>
                </div>
            )}

            {/* Mensagem para não-hosts aguardando o início */}
            {mesa.fase === 'AGUARDANDO' && !souHost && (
                <div style={estilos.aguardandoHost}>
                    <span style={estilos.aguardandoPonto} />
                    Aguardando o host iniciar a partida...
                </div>
            )}

            {/* ---- BARRA DE AÇÕES ---- */}
            {/*
                ActionBar.jsx: fold, check, call, raise.
                Só aparece quando a rodada está ativa.
                O componente desabilita os botões quando não é a vez do jogador.
            */}
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

            {/* ---- NOTIFICAÇÃO FLUTUANTE ---- */}
            {notificacao && (
                <div style={estilos.notificacao}>
                    {notificacao}
                </div>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 2: ESTILOS
// ================================================================

const estilos = {

    pagina: {
        minHeight:     '100dvh',
        background:    '#0a0f1e',
        display:       'flex',
        flexDirection: 'column',
        fontFamily:    'sans-serif',
        color:         '#F8FAFC',
        overflowX:     'hidden',
        maxWidth:      '480px',
        margin:        '0 auto',
        position:      'relative',
    },

    carregando: {
        minHeight:      '100dvh',
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

    carregandoTexto: {
        color:    'rgba(255,255,255,0.5)',
        fontSize: '14px',
        margin:   0,
    },

    // Header: botão sair + InfoMesa lado a lado
    headerWrapper: {
        display:      'flex',
        alignItems:   'stretch',
        background:   '#0d1424',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink:   0,
    },

    btnSair: {
        background:  'transparent',
        border:      'none',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        color:       'rgba(255,255,255,0.5)',
        fontSize:    '13px',
        padding:     '0 12px',
        cursor:      'pointer',
        fontFamily:  'sans-serif',
        flexShrink:  0,
        whiteSpace:  'nowrap',
        transition:  'color 0.2s',
    },

    // Mesa — ocupa o máximo de espaço disponível
    mesaWrapper: {
        flex:           1,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '8px',
        minHeight:      '220px',
    },

    cartasComunidadeWrapper: {
        display:        'flex',
        justifyContent: 'center',
        padding:        '4px 8px',
        flexShrink:     0,
    },

    minhasCartasWrapper: {
        display:        'flex',
        justifyContent: 'center',
        padding:        '4px 8px',
        flexShrink:     0,
        minHeight:      '50px',
    },

    btnIniciarWrapper: {
        padding:    '8px 14px',
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
        fontFamily:   'sans-serif',
        transition:   'opacity 0.2s',
    },

    aguardandoHost: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '8px',
        padding:        '12px',
        fontSize:       '13px',
        color:          'rgba(255,255,255,0.4)',
        flexShrink:     0,
    },

    aguardandoPonto: {
        display:      'inline-block',
        width:        '6px',
        height:       '6px',
        borderRadius: '50%',
        background:   '#F59E0B',
        animation:    'pulsar 1.5s ease-in-out infinite',
        flexShrink:   0,
    },

    notificacao: {
        position:     'fixed',
        top:          '70px',
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
        whiteSpace:   'nowrap',
    },
};
