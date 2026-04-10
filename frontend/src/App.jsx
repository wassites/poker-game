/* ================================================================
   ARQUIVO: frontend/src/App.jsx

   CONCEITO GERAL:
   É o componente raiz da aplicação — o "gerente geral".
   Ele decide QUAL tela mostrar baseado no estado atual:
     → Carregando : verificando sessão do Firebase
     → Auth       : tela de login / cadastro
     → Lobby      : tela inicial com lista de mesas
     → Jogo       : mesa de poker ativa

   TAMBÉM É RESPONSÁVEL POR:
     → Verificar se o jogador já está logado (Firebase Auth)
     → Criar e manter a conexão Socket.io com o backend
     → Guardar os dados do usuário logado
     → Passar socket e usuário para os componentes filhos

   FLUXO DO APP:
   1. App monta → verifica sessão Firebase (onAuthStateChanged)
   2. Sem sessão → mostra tela de Auth (Login/Cadastro)
   3. Com sessão → busca perfil no Firestore → conecta Socket.io → Lobby
   4. Jogador entra em mesa → mostra tela de Jogo
   5. Jogador sai da mesa → volta para Lobby
   6. Jogador faz logout → volta para Auth
================================================================ */

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged }               from 'firebase/auth';
import { doc, getDoc }                      from 'firebase/firestore';
import { io }                               from 'socket.io-client';

// Importa auth e db do arquivo central — Firebase inicializado lá
import { auth, db } from './services/firebase-config';

// Importa as telas
import Auth  from './pages/Auth/index';
import Lobby from './pages/Lobby/index';


// ================================================================
// BLOCO 1: CONFIGURAÇÃO DO SOCKET.IO
//
// Criado FORA do componente — garante UMA única conexão.
// Se ficasse dentro, recriaria a cada render.
//
// autoConnect: false → conectamos manualmente após o login,
// não antes. Assim o servidor só recebe jogadores autenticados.
// ================================================================

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const socket = io(SERVER_URL, {
    autoConnect:          false,
    reconnection:         true,
    reconnectionDelay:    1000,
    reconnectionAttempts: 5,
});


// ================================================================
// BLOCO 2: TELAS DISPONÍVEIS
// ================================================================

const TELAS = {
    CARREGANDO: 'carregando', // verificando sessão Firebase
    AUTH:       'auth',       // login / cadastro
    LOBBY:      'lobby',      // lista de mesas
    JOGO:       'jogo',       // mesa de poker
};


// ================================================================
// BLOCO 3: COMPONENTE PRINCIPAL
// ================================================================

export default function App() {

    // Tela atual
    const [tela, setTela] = useState(TELAS.CARREGANDO);

    // Dados do jogador logado (vem do Firestore após login)
    const [usuario, setUsuario] = useState(null);

    // ID da mesa atual (quando estiver jogando)
    const [mesaAtual, setMesaAtual] = useState(null);


    // ----------------------------------------------------------------
    // EFEITO: monitora sessão do Firebase
    //
    // onAuthStateChanged: dispara toda vez que o estado muda:
    //   → App abre com sessão salva → user !== null (vai direto ao lobby)
    //   → Jogador faz login         → user !== null
    //   → Jogador faz logout        → user === null (volta ao login)
    //
    // O return cancela o listener ao desmontar o componente.
    // Sem o cancelamento, o listener ficaria ativo mesmo após desmontar.
    // ----------------------------------------------------------------
    useEffect(() => {

        const cancelar = onAuthStateChanged(auth, async (userFirebase) => {

            if (userFirebase) {
                // Sessão ativa — busca perfil no Firestore
                try {
                    const ref  = doc(db, 'jogadores', userFirebase.uid);
                    const snap = await getDoc(ref);

                    if (snap.exists()) {
                        // Perfil encontrado — monta o objeto do usuário
                        const perfil = { uid: userFirebase.uid, ...snap.data() };
                        setUsuario(perfil);
                        conectarSocket(perfil);
                        setTela(TELAS.LOBBY);
                    } else {
                        // Perfil não existe ainda — vai para Auth criar
                        setTela(TELAS.AUTH);
                    }

                } catch (e) {
                    console.error('Erro ao buscar perfil:', e);
                    setTela(TELAS.AUTH);
                }

            } else {
                // Sem sessão ativa — desconecta socket e vai para login
                setUsuario(null);
                socket.disconnect();
                setTela(TELAS.AUTH);
            }
        });

        // Cleanup: cancela o listener ao desmontar
        return () => cancelar();

    }, []); // Array vazio: roda só uma vez ao montar


    // ----------------------------------------------------------------
    // Conecta Socket.io após autenticação bem-sucedida
    //
    // Só conecta se ainda não estiver conectado.
    // Emite 'autenticar' logo após conectar para o servidor
    // saber quem é o jogador.
    // ----------------------------------------------------------------
    function conectarSocket(perfil) {
        if (socket.connected) return;

        socket.connect();

        // 'once' escuta apenas uma vez — não acumula listeners
        socket.once('connect', () => {
            console.log('✅ Conectado ao servidor:', socket.id);
            socket.emit('autenticar', {
                uid:    perfil.uid,
                nome:   perfil.nome,
                avatar: perfil.avatar || '',
            });
        });

        socket.on('disconnect', (motivo) => {
            console.warn('❌ Desconectado:', motivo);
        });

        socket.on('erro', ({ mensagem }) => {
            console.error('Erro servidor:', mensagem);
        });
    }


    // ----------------------------------------------------------------
    // Chamado pelo Auth após login/cadastro com sucesso
    // ----------------------------------------------------------------
    const handleAutenticado = useCallback((perfil) => {
        setUsuario(perfil);
        conectarSocket(perfil);
        setTela(TELAS.LOBBY);
    }, []);


    // ----------------------------------------------------------------
    // Chamado pelo Lobby ao entrar em uma mesa
    // ----------------------------------------------------------------
    const handleEntrarMesa = useCallback((mesaId) => {
        setMesaAtual(mesaId);
        setTela(TELAS.JOGO);
    }, []);


    // ----------------------------------------------------------------
    // Chamado pelo Jogo ao sair da mesa — volta ao Lobby
    // ----------------------------------------------------------------
    const handleSairMesa = useCallback(() => {
        socket.emit('sair_mesa');
        setMesaAtual(null);
        setTela(TELAS.LOBBY);
    }, []);


    // ================================================================
    // RENDERIZAÇÃO — decide qual tela mostrar
    // ================================================================

    // ---- Verificando sessão Firebase ----
    if (tela === TELAS.CARREGANDO) {
        return (
            <div style={estilos.telaCarregando}>
                <style>{`
                    @keyframes girar {
                        to { transform: rotate(360deg); }
                    }
                `}</style>

                <div style={estilos.logoContainer}>
                    <span style={estilos.logoEmoji}>🃏</span>
                    <h1 style={estilos.logoTitulo}>Poker Game</h1>
                    <p style={estilos.logoBitchager}>Powered by ₿C Bitchager</p>
                </div>

                <div style={estilos.spinnerContainer}>
                    <div style={estilos.spinner} />
                    <p style={estilos.statusTexto}>Verificando sessão...</p>
                </div>
            </div>
        );
    }

    // ---- Login / Cadastro ----
    if (tela === TELAS.AUTH) {
        return <Auth onAutenticado={handleAutenticado} />;
    }

    // ---- Mesa de poker (placeholder até Game/index.jsx ficar pronto) ----
    if (tela === TELAS.JOGO) {
        return (
            <div style={estilos.telaJogo}>
                <div style={estilos.jogoCard}>
                    <span style={{ fontSize: '48px' }}>🃏</span>
                    <p style={{ color: '#F8FAFC', fontSize: '15px', margin: '12px 0 4px', fontWeight: '600' }}>
                        Mesa: {mesaAtual}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>
                        Tela do jogo em construção...
                    </p>
                    <button onClick={handleSairMesa} style={estilos.btnSair}>
                        ← Voltar ao Lobby
                    </button>
                </div>
            </div>
        );
    }

    // ---- Lobby — tela principal após login ----
    return (
        <Lobby
            usuario={usuario}
            socket={socket}
            onEntrarMesa={handleEntrarMesa}
        />
    );
}


// ================================================================
// BLOCO 4: ESTILOS
// ================================================================

const estilos = {

    // Tela de carregamento enquanto verifica sessão Firebase
    telaCarregando: {
        minHeight:      '100vh',
        background:     '#0a0f1e',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '32px',
        fontFamily:     'sans-serif',
    },

    logoContainer: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
    },

    logoEmoji: {
        fontSize:   '64px',
        lineHeight: 1,
    },

    logoTitulo: {
        fontSize:      '32px',
        fontWeight:    '800',
        color:         '#F8FAFC',
        margin:        0,
        letterSpacing: '-0.02em',
    },

    logoBitchager: {
        fontSize:   '13px',
        color:      '#D97706',
        margin:     0,
        fontWeight: '500',
    },

    spinnerContainer: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '12px',
    },

    spinner: {
        width:        '36px',
        height:       '36px',
        border:       '3px solid rgba(255,255,255,0.1)',
        borderTop:    '3px solid #7C3AED',
        borderRadius: '50%',
        animation:    'girar 0.8s linear infinite',
    },

    statusTexto: {
        fontSize:  '14px',
        color:     'rgba(255,255,255,0.4)',
        margin:    0,
        textAlign: 'center',
    },

    // Tela do jogo (placeholder)
    telaJogo: {
        minHeight:      '100vh',
        background:     '#0a0f1e',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'sans-serif',
    },

    jogoCard: {
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '8px',
        padding:        '32px',
        background:     '#111827',
        borderRadius:   '16px',
        border:         '1px solid rgba(255,255,255,0.08)',
    },

    btnSair: {
        marginTop:    '16px',
        padding:      '10px 20px',
        background:   'rgba(255,255,255,0.06)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color:        'rgba(255,255,255,0.6)',
        fontSize:     '14px',
        cursor:       'pointer',
        fontFamily:   'sans-serif',
    },
};
