/* ================================================================
   ARQUIVO: frontend/src/pages/Auth/index.jsx

   CONCEITO GERAL:
   Página de autenticação — decide qual tela mostrar:
     → Login    : jogador já tem conta
     → Cadastro : jogador quer criar conta

   É o "porteiro" do app. O jogador só chega no Lobby
   depois de passar por aqui com sucesso.

   FLUXO:
   1. App.jsx renderiza Auth quando não há usuário logado
   2. Auth mostra Login por padrão
   3. Jogador pode alternar para Cadastro e vice-versa
   4. Após login/cadastro com sucesso → App.jsx recebe o usuário
      e mostra o Lobby

   PROPS:
     onAutenticado → function(usuario): chamada após login/cadastro
                     com sucesso. Passa os dados do usuário para o App.
================================================================ */

import { useState } from 'react';
import Login    from './Login';
import Cadastro from './Cadastro';


export default function Auth({ onAutenticado }) {

    // Controla qual tela mostrar: 'login' ou 'cadastro'
    const [tela, setTela] = useState('login');

    return (
        <div style={estilos.pagina}>

            {/* ---- Logo do app ---- */}
            <div style={estilos.logo}>
                <span style={estilos.logoEmoji}>🃏</span>
                <h1 style={estilos.logoTitulo}>Poker Game</h1>
                <p style={estilos.logoSubtitulo}>Powered by ₿C Bitchager</p>
            </div>

            {/* ---- Conteúdo: Login ou Cadastro ---- */}
            <div style={estilos.card}>
                {tela === 'login' ? (
                    <Login
                        onAutenticado={onAutenticado}
                        onIrParaCadastro={() => setTela('cadastro')}
                    />
                ) : (
                    <Cadastro
                        onAutenticado={onAutenticado}
                        onIrParaLogin={() => setTela('login')}
                    />
                )}
            </div>

            {/* ---- Rodapé ---- */}
            <p style={estilos.rodape}>
                Ao continuar você concorda com os{' '}
                <span style={estilos.link}>Termos de Uso</span>
            </p>

        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    pagina: {
        minHeight:      '100vh',
        background:     '#0a0f1e',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '20px 16px',
        fontFamily:     'sans-serif',
        gap:            '24px',
    },

    logo: {
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '6px',
    },

    logoEmoji: {
        fontSize:   '56px',
        lineHeight: 1,
    },

    logoTitulo: {
        fontSize:      '28px',
        fontWeight:    '800',
        color:         '#F8FAFC',
        margin:        0,
        letterSpacing: '-0.02em',
    },

    logoSubtitulo: {
        fontSize:   '12px',
        color:      '#D97706',
        margin:     0,
        fontWeight: '500',
    },

    // Card branco-escuro que contém o formulário
    card: {
        width:        '100%',
        maxWidth:     '400px',
        background:   '#111827',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        overflow:     'hidden', // garante que filhos respeitem o borderRadius
    },

    rodape: {
        fontSize:  '11px',
        color:     'rgba(255,255,255,0.25)',
        textAlign: 'center',
    },

    link: {
        color:  '#7C3AED',
        cursor: 'pointer',
    },
};
