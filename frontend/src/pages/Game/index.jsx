/* ================================================================
   ARQUIVO: frontend/src/pages/Game/index.jsx

   MELHORIAS:
   → Corrige campo: mesa.turno (não mesa.vezDeQuem)
   → PC: mesa ocupa toda a área, ActionBar sempre visível no fundo
   → Mobile: layout vertical compacto
   → Listeners do socket com referências nomeadas (sem travamento)
================================================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import InfoMesa           from './InfoMesa';
import Mesa               from './Mesa';
import CartasJogador      from './CartasJogador';
import CartasComunitarias from './CartasComunitarias';
import ActionBar          from '../../components/ActionBar';

export default function Game({ socket, usuario, mesaId, onSair }) {

    const [mesa,         setMesa        ] = useState(null);
    const [minhasCartas, setMinhasCartas] = useState([]);
    const [notificacao,  setNotificacao ] = useState(null);
    const timerRef = useRef(null);

    void mesaId;

    useEffect(() => {
        if (!socket) return;

        const onEstado      = (e)              => setMesa(e);
        const onCartas      = ({ cartas })     => setMinhasCartas(cartas || []);
        const onNotificacao = ({ mensagem })   => {
            setNotificacao(mensagem);
            timerRef.current = setTimeout(() => setNotificacao(null), 4000);
        };

        socket.on('estado_mesa',   onEstado);
        socket.on('carta_privada', onCartas);
        socket.on('notificacao',   onNotificacao);
        socket.emit('pedir_estado');

        const timer = timerRef.current;
        return () => {
            socket.off('estado_mesa',   onEstado);
            socket.off('carta_privada', onCartas);
            socket.off('notificacao',   onNotificacao);
            if (timer) clearTimeout(timer);
        };
    }, [socket]);

    const handleAcao    = useCallback((a, v=0) => socket?.emit('acao', { acao:a, valor:v }), [socket]);
    const handleIniciar = useCallback(()       => socket?.emit('iniciar_rodada'), [socket]);
    const handleSair    = useCallback(()       => { socket?.emit('sair_mesa'); onSair?.(); }, [socket, onSair]);

    if (!mesa) return (
        <div style={estilos.carregando}>
            <style>{`@keyframes girar { to { transform:rotate(360deg); } }`}</style>
            <div style={estilos.spinner} />
            <p style={estilos.carregandoTexto}>Entrando na mesa...</p>
        </div>
    );

    const meuUid         = usuario?.uid;
    // CORREÇÃO: o backend usa mesa.turno, não mesa.vezDeQuem
    const ehMinhaVez     = mesa.turno === meuUid;
    const euSou          = mesa.jogadores?.[meuUid];
    const souHost        = mesa.host === meuUid;
    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const foldado        = euSou?.status === 'fold' || euSou?.status === 'FOLD';
    const jogoAtivo      = mesa.fase !== 'AGUARDANDO' && mesa.fase !== 'SHOWDOWN';

    return (
        <div style={estilos.pagina} className="game-pagina">

            <style>{`
                @keyframes girar  { to { transform:rotate(360deg); } }
                @keyframes pulsar { 0%,100%{opacity:1} 50%{opacity:0.4} }
                @keyframes fadeIn {
                    from { opacity:0; transform:translateX(-50%) translateY(-8px); }
                    to   { opacity:1; transform:translateX(-50%) translateY(0); }
                }

                /* Mobile: coluna única */
                .game-pagina  { max-width:480px; }
                .game-corpo   {
                    display:flex; flex-direction:column;
                    flex:1; overflow:hidden; min-height:0;
                }
                .game-mesa-area {
                    flex:1; display:flex;
                    align-items:center; justify-content:center;
                    padding:4px; min-height:0; overflow:hidden;
                }
                .game-painel {
                    flex-shrink:0; display:flex; flex-direction:column;
                    align-items:center; gap:4px;
                    padding:4px 8px 8px; background:#0a0f1e;
                }

                /* Desktop: mesa grande + painel fixo na base */
                @media (min-width: 768px) {
                    .game-pagina  { max-width:1200px !important; }
                    .game-corpo   { flex-direction:column; }
                    .game-mesa-area {
                        flex:1; padding:16px 24px 8px;
                        align-items:center;
                    }
                    .game-painel {
                        padding:8px 24px 16px;
                        border-top:1px solid rgba(255,255,255,0.06);
                        background:#0d1424;
                        flex-direction:row;
                        align-items:center;
                        gap:16px;
                    }
                    .game-painel-cartas {
                        display:flex; flex-direction:column;
                        align-items:center; gap:6px;
                        flex-shrink:0;
                    }
                    .game-painel-acoes {
                        flex:1; min-width:0;
                    }
                }
            `}</style>

            {/* Header */}
            <div style={estilos.headerWrapper}>
                <button onClick={handleSair} style={estilos.btnSair}>← Sair</button>
                <div style={{ flex:1, minWidth:0 }}>
                    <InfoMesa mesa={mesa} />
                </div>
            </div>

            {/* Corpo */}
            <div className="game-corpo" style={{ flex:1, overflow:'hidden' }}>

                {/* Mesa central */}
                <div className="game-mesa-area">
                    <Mesa mesa={mesa} meuUid={meuUid} minhasCartas={minhasCartas} />
                </div>

                {/* Painel inferior: cartas + ações */}
                <div className="game-painel">

                    {/* Cartas do jogador + comunitárias */}
                    <div className="game-painel-cartas">
                        {mesa.fase !== 'AGUARDANDO' && (
                            <CartasComunitarias
                                cartas={mesa.cartasComunitarias || []}
                                fase={mesa.fase}
                            />
                        )}
                        <CartasJogador
                            cartas={minhasCartas}
                            foldado={foldado}
                            fase={mesa.fase}
                        />
                    </div>

                    {/* Ações */}
                    <div className="game-painel-acoes">

                        {/* Botão iniciar (host) */}
                        {mesa.fase === 'AGUARDANDO' && souHost && (
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
                                    ? `Aguardando (${jogadoresArray.length}/2)`
                                    : `▶ Iniciar (${jogadoresArray.length} jogadores)`}
                            </button>
                        )}

                        {/* Aguardando host */}
                        {mesa.fase === 'AGUARDANDO' && !souHost && (
                            <div style={estilos.aguardando}>
                                <span style={estilos.ponto} />
                                Aguardando o host iniciar...
                            </div>
                        )}

                        {/* ActionBar — sempre visível quando jogo ativo */}
                        {jogoAtivo && euSou && (
                            <ActionBar
                                ehMinhaVez={ehMinhaVez}
                                saldoAtual={euSou.saldo || 0}
                                apostaRodada={euSou.apostaRodada || 0}
                                maiorAposta={mesa.maiorAposta || 0}
                                bigBlind={mesa.bigBlind || 20}
                                pote={mesa.pote || 0}
                                onAcao={handleAcao}
                            />
                        )}

                        {/* Showdown: aguardando próxima rodada */}
                        {mesa.fase === 'SHOWDOWN' && (
                            <div style={estilos.showdown}>
                                <span style={{ fontSize:'20px' }}>🏆</span>
                                <span>{mesa.mensagemVitoria || 'Fim da rodada!'}</span>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* Notificação flutuante */}
            {notificacao && (
                <div style={estilos.notificacao}>{notificacao}</div>
            )}

        </div>
    );
}

const estilos = {
    pagina: {
        height:        '100dvh',
        background:    '#0a0f1e',
        display:       'flex',
        flexDirection: 'column',
        fontFamily:    'sans-serif',
        color:         '#F8FAFC',
        overflow:      'hidden',
        margin:        '0 auto',
        position:      'relative',
    },
    carregando: {
        height:'100dvh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        background:'#0a0f1e', gap:'16px',
    },
    spinner: {
        width:'32px', height:'32px',
        border:'3px solid rgba(255,255,255,0.1)',
        borderTop:'3px solid #7C3AED',
        borderRadius:'50%', animation:'girar 0.8s linear infinite',
    },
    carregandoTexto: { color:'rgba(255,255,255,0.5)', fontSize:'14px', margin:0 },
    headerWrapper: {
        display:'flex', alignItems:'stretch', background:'#0d1424',
        borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0,
    },
    btnSair: {
        background:'transparent', border:'none',
        borderRight:'1px solid rgba(255,255,255,0.06)',
        color:'rgba(255,255,255,0.5)', fontSize:'13px',
        padding:'0 12px', cursor:'pointer',
        fontFamily:'sans-serif', flexShrink:0, whiteSpace:'nowrap',
    },
    btnIniciar: {
        width:'100%', padding:'12px',
        background:'linear-gradient(135deg,#22C55E,#16A34A)',
        border:'none', borderRadius:'10px', color:'white',
        fontSize:'14px', fontWeight:'600', fontFamily:'sans-serif',
    },
    aguardando: {
        display:'flex', alignItems:'center', gap:'8px',
        fontSize:'13px', color:'rgba(255,255,255,0.4)', padding:'8px 0',
        justifyContent:'center',
    },
    ponto: {
        display:'inline-block', width:'6px', height:'6px',
        borderRadius:'50%', background:'#F59E0B',
        animation:'pulsar 1.5s ease-in-out infinite', flexShrink:0,
    },
    showdown: {
        display:'flex', alignItems:'center', justifyContent:'center',
        gap:'8px', fontSize:'14px', fontWeight:'600',
        color:'#F59E0B', padding:'12px', textAlign:'center',
    },
    notificacao: {
        position:'fixed', top:'70px', left:'50%',
        transform:'translateX(-50%)',
        background:'rgba(34,197,94,0.15)',
        border:'1px solid rgba(34,197,94,0.4)',
        borderRadius:'10px', padding:'10px 20px',
        color:'#4ADE80', fontSize:'14px', fontWeight:'600',
        zIndex:999, textAlign:'center', maxWidth:'320px',
        animation:'fadeIn 0.3s ease', whiteSpace:'nowrap',
    },
};