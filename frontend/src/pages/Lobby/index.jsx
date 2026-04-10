/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/index.jsx

   CONCEITO GERAL:
   Página principal do Lobby. Orquestra os componentes menores
   e gerencia o estado global da tela.

   RESPONSIVIDADE:
   Mobile  → layout vertical, max-width 480px, uma coluna
   Desktop → layout de duas colunas:
               Esquerda: tabs + lista de mesas (flex: 1)
               Direita:  ranking fixo (320px)

   RANKING:
   Busca o ranking via GET /ranking do backend.
   Atualiza a cada 60 segundos automaticamente.
   Exibido na coluna direita (desktop) e na tab Ranking (mobile).

   PERFIL (NOVO):
   Modal que abre ao clicar em "Perfil" no menu do Header.
   Permite editar nome, email, telefone, avatar e recuperar senha.

   PROPS:
     usuario      → { uid, nome, avatar, saldo, rankPontos, tema }
     socket       → instância do Socket.io já conectada
     onEntrarMesa → função chamada quando entra em uma mesa
================================================================ */

import { useState, useEffect, useCallback } from 'react';
import { getAuth, signOut }                 from 'firebase/auth';

import Header         from './Header';
import Tabs           from './Tabs';
import ListaMesas     from './ListaMesas';
import Ranking        from './Ranking';
import Loja           from './Loja';
import ModalCriarMesa from './ModalCriarMesa';
import ModalSenha     from './ModalSenha';
import ModalPerfil    from './ModalPerfil';


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

const TABS = {
    PUBLICAS: 'publicas',
    PRIVADAS: 'privadas',
    RANKING:  'ranking',
    LOJA:     'loja',
};

const SERVER_URL        = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const INTERVALO_MESAS   = 10000; // atualiza mesas a cada 10 segundos
const INTERVALO_RANKING = 60000; // atualiza ranking a cada 60 segundos


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Lobby({ usuario, socket, onEntrarMesa }) {

    const [tabAtiva,      setTabAtiva     ] = useState(TABS.PUBLICAS);
    const [mesasPublicas, setMesasPublicas] = useState([]);
    const [mesasPrivadas, setMesasPrivadas] = useState([]);

    // ranking: array de jogadores com posicao, nome, vitorias, fichasLiquidas, etc.
    const [ranking,       setRanking      ] = useState([]);

    const [modalCriar,    setModalCriar   ] = useState(false);
    const [modalSenha,    setModalSenha   ] = useState(null);
    const [modalPerfil,   setModalPerfil  ] = useState(false);
    const [carregando,    setCarregando   ] = useState(true);
    const [erro,          setErro         ] = useState(null);


    // ----------------------------------------------------------------
    // Busca mesas do servidor via HTTP GET /mesas
    //
    // useCallback com [] — nunca recria a função entre renders.
    // Necessário para não causar loop no useEffect abaixo.
    // ----------------------------------------------------------------
    const buscarMesas = useCallback(async () => {
        try {
            setErro(null);
            const res  = await fetch(`${SERVER_URL}/mesas`);
            if (!res.ok) throw new Error(`Servidor retornou ${res.status}`);
            const data = await res.json();
            setMesasPublicas(data.mesas.filter(m => !m.temSenha));
            setMesasPrivadas(data.mesas.filter(m =>  m.temSenha));
        } catch (e) {
            console.error('Erro ao buscar mesas:', e);
            setErro('Não foi possível carregar as mesas.');
        } finally {
            setCarregando(false);
        }
    }, []);


    // ----------------------------------------------------------------
    // Busca ranking do servidor via HTTP GET /ranking
    //
    // O backend busca os dados do Firestore (salvos pelo game-manager)
    // e retorna os top 20 jogadores ordenados por fichasLiquidas.
    // ----------------------------------------------------------------
    const buscarRankingAPI = useCallback(async () => {
        try {
            const res = await fetch(`${SERVER_URL}/ranking?top=20`);
            if (!res.ok) return;
            const data = await res.json();
            setRanking(data.ranking || []);
        } catch (e) {
            console.error('Erro ao buscar ranking:', e);
        }
    }, []);


    // Busca mesas ao montar + polling a cada 10 segundos
    useEffect(() => {
        buscarMesas();
        const intervalo = setInterval(buscarMesas, INTERVALO_MESAS);
        return () => clearInterval(intervalo);
    }, [buscarMesas]);


    // Busca ranking ao montar + atualiza a cada 60 segundos
    // Intervalo maior pois o ranking muda menos frequentemente
    useEffect(() => {
        buscarRankingAPI();
        const intervalo = setInterval(buscarRankingAPI, INTERVALO_RANKING);
        return () => clearInterval(intervalo);
    }, [buscarRankingAPI]);


    // Atualizações de mesas em tempo real via Socket.io
    useEffect(() => {
        if (!socket) return;
        socket.on('mesas_atualizadas', buscarMesas);
        return () => socket.off('mesas_atualizadas', buscarMesas);
    }, [socket, buscarMesas]);


    // ----------------------------------------------------------------
    // Handlers
    // ----------------------------------------------------------------

    function handleEntrarPublica(mesaId) {
        socket.emit('entrar_mesa', { mesaId });
        onEntrarMesa(mesaId);
    }

    function handleClicarPrivada(mesaId) {
        setModalSenha(mesaId);
    }

    function handleConfirmarSenha(senha) {
        if (!modalSenha) return;
        socket.emit('entrar_mesa', { mesaId: modalSenha, senha });
        onEntrarMesa(modalSenha);
        setModalSenha(null);
    }

    function handleMesaCriada(mesaId) {
        setModalCriar(false);
        onEntrarMesa(mesaId);
    }

    function handleLogout() {
        signOut(getAuth());
    }


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.pagina} className="lobby-pagina">

            {/* CSS responsivo — media queries só funcionam em <style> */}
            <style>{`
                /* ---- Mobile (padrão) ---- */
                .lobby-pagina {
                    max-width: 480px;
                }
                .lobby-body {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    overflow: hidden;
                }
                .lobby-esquerda {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    overflow: hidden;
                }
                .lobby-direita {
                    display: none;
                }
                .lobby-conteudo {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px 14px 100px;
                    -webkit-overflow-scrolling: touch;
                }
                .lobby-rodape {
                    position: fixed;
                    bottom: 0;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 100%;
                    max-width: 480px;
                    padding: 10px 14px max(14px, env(safe-area-inset-bottom));
                    background: linear-gradient(to top, #0a0f1e 70%, transparent);
                    z-index: 100;
                    box-sizing: border-box;
                }

                /* ---- Desktop (768px+) ---- */
                @media (min-width: 768px) {
                    .lobby-pagina {
                        max-width: 1200px !important;
                    }
                    .lobby-body {
                        flex-direction: row;
                    }
                    .lobby-esquerda {
                        flex: 1;
                        border-right: 1px solid rgba(255,255,255,0.06);
                        min-width: 0;
                    }
                    .lobby-direita {
                        display: flex;
                        flex-direction: column;
                        width: 320px;
                        flex-shrink: 0;
                        background: #0d1424;
                    }
                    .lobby-conteudo {
                        padding: 16px 20px 100px;
                    }
                    .lobby-rodape {
                        max-width: 1200px;
                        padding: 12px 20px max(16px, env(safe-area-inset-bottom));
                    }
                }

                /* ---- Large desktop (1024px+) ---- */
                @media (min-width: 1024px) {
                    .lobby-direita {
                        width: 380px;
                    }
                }
            `}</style>

            {/* ---- HEADER ---- */}
            {/*
                NOVO: passa onAbrirPerfil para o Header.
                O Header repassa para o MenuDropdown → item "Perfil".
            */}
            <Header
                usuario={usuario}
                onAbrirLoja={()   => setTabAtiva(TABS.LOJA)}
                onAbrirCarteira={() => setTabAtiva(TABS.LOJA)}
                onAbrirPerfil={()  => setModalPerfil(true)}
                onLogout={handleLogout}
            />

            {/* ---- CORPO ---- */}
            <div className="lobby-body">

                {/* Coluna esquerda: tabs + conteúdo da tab */}
                <div className="lobby-esquerda">
                    <Tabs
                        tabAtiva={tabAtiva}
                        onMudar={setTabAtiva}
                        qtdPublicas={mesasPublicas.length}
                        qtdPrivadas={mesasPrivadas.length}
                    />

                    <div className="lobby-conteudo">
                        {erro && (
                            <div style={estilos.erro}>
                                <span>{erro}</span>
                                <button onClick={buscarMesas} style={estilos.btnTentar}>
                                    Tentar novamente
                                </button>
                            </div>
                        )}

                        {tabAtiva === TABS.PUBLICAS && (
                            <ListaMesas
                                mesas={mesasPublicas}
                                carregando={carregando}
                                privadas={false}
                                onEntrar={handleEntrarPublica}
                            />
                        )}

                        {tabAtiva === TABS.PRIVADAS && (
                            <ListaMesas
                                mesas={mesasPrivadas}
                                carregando={carregando}
                                privadas={true}
                                onEntrar={handleClicarPrivada}
                            />
                        )}

                        {/* No mobile, ranking aparece como tab normal */}
                        {tabAtiva === TABS.RANKING && (
                            <Ranking ranking={ranking} meuUid={usuario?.uid} />
                        )}

                        {tabAtiva === TABS.LOJA && (
                            <Loja usuario={usuario} socket={socket} />
                        )}
                    </div>
                </div>

                {/* Coluna direita: ranking fixo (só desktop) */}
                <div className="lobby-direita">
                    <div style={estilos.direitaTitulo}>
                        <span style={estilos.direitaTituloTexto}>🏆 Ranking</span>
                    </div>
                    <div style={estilos.direitaConteudo}>
                        <Ranking ranking={ranking} meuUid={usuario?.uid} />
                    </div>
                </div>

            </div>

            {/* ---- BOTÃO CRIAR MESA ---- */}
            <div className="lobby-rodape">
                <button
                    onClick={() => setModalCriar(true)}
                    style={estilos.btnCriar}
                >
                    <span style={{ fontSize: '22px', lineHeight: 1 }}>+</span>
                    Criar Mesa
                </button>
            </div>

            {/* ---- MODAIS ---- */}
            {modalCriar && (
                <ModalCriarMesa
                    usuario={usuario}
                    socket={socket}
                    onMesaCriada={handleMesaCriada}
                    onFechar={() => setModalCriar(false)}
                />
            )}

            {modalSenha && (
                <ModalSenha
                    onConfirmar={handleConfirmarSenha}
                    onFechar={() => setModalSenha(null)}
                />
            )}

            {/* Modal de Perfil — abre ao clicar em "Perfil" no menu do Header */}
            {modalPerfil && (
                <ModalPerfil
                    usuario={usuario}
                    onFechar={() => setModalPerfil(false)}
                    onAtualizar={(novoUsuario) => {
                        // Aqui poderíamos atualizar o estado do usuário no App.jsx
                        // via prop callback. Por enquanto apenas fecha o modal.
                        console.log('Perfil atualizado:', novoUsuario);
                        setModalPerfil(false);
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

    // Container principal — ocupa a tela inteira no mobile
    pagina: {
        minHeight:     '100vh',
        background:    '#0a0f1e',
        color:         '#F8FAFC',
        display:       'flex',
        flexDirection: 'column',
        margin:        '0 auto',
        fontFamily:    'sans-serif',
        position:      'relative',
    },

    // Título da coluna direita (desktop)
    direitaTitulo: {
        padding:      '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink:   0,
    },

    direitaTituloTexto: {
        fontSize:   '14px',
        fontWeight: '600',
        color:      '#F8FAFC',
    },

    // Conteúdo da coluna direita com scroll
    direitaConteudo: {
        flex:      1,
        overflowY: 'auto',
        padding:   '12px 16px',
        WebkitOverflowScrolling: 'touch',
    },

    // Botão principal de criar mesa
    btnCriar: {
        width:          '100%',
        padding:        '14px',
        background:     'linear-gradient(135deg, #7C3AED, #4F46E5)',
        border:         'none',
        borderRadius:   '12px',
        color:          'white',
        fontSize:       '16px',
        fontWeight:     '600',
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '8px',
        WebkitTapHighlightColor: 'transparent',
        transition:     'opacity 0.15s',
        fontFamily:     'sans-serif',
    },

    // Box de erro
    erro: {
        background:    'rgba(239,68,68,0.1)',
        border:        '1px solid rgba(239,68,68,0.3)',
        borderRadius:  '10px',
        padding:       '12px 14px',
        marginBottom:  '12px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
        fontSize:      '13px',
        color:         '#FCA5A5',
    },

    // Botão "Tentar novamente" dentro do erro
    btnTentar: {
        background:   'rgba(239,68,68,0.2)',
        border:       '1px solid rgba(239,68,68,0.4)',
        borderRadius: '6px',
        color:        '#FCA5A5',
        fontSize:     '12px',
        padding:      '6px 12px',
        cursor:       'pointer',
        alignSelf:    'flex-start',
        fontFamily:   'sans-serif',
    },
};