/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/index.jsx

   CONCEITO GERAL:
   Esta é a página principal do Lobby. Ela não faz nada sozinha —
   ela MONTA os componentes menores e gerencia o estado global
   da tela (qual tab está ativa, quais modais estão abertos, etc).

   RESPONSABILIDADE ÚNICA:
   index.jsx só cuida de ORQUESTRAR. Cada pedaço visual
   fica no seu próprio componente. Isso se chama "separação
   de responsabilidades" — um dos princípios mais importantes
   do desenvolvimento de software.

   FLUXO DE DADOS:
   Socket.io → index.jsx (estado) → componentes filhos (visual)
   Componentes filhos → callbacks → index.jsx → Socket.io

   ARQUIVOS QUE ESTE COMPONENTE USA:
   → Header.jsx          (avatar, nome, saldo ₿C)
   → Tabs.jsx            (navegação entre seções)
   → ListaMesas.jsx      (cards das mesas)
   → Ranking.jsx         (top jogadores)
   → Loja/index.jsx      (comprar ₿C e temas)
   → ModalCriarMesa.jsx  (formulário nova mesa)
   → ModalSenha.jsx      (senha mesa privada)

   PROPS RECEBIDAS:
   → usuario    : { uid, nome, avatar, saldo, rankPontos, tema }
   → socket     : instância do Socket.io já conectada
   → onEntrarMesa : função chamada quando entra em uma mesa
================================================================ */

import { useState, useEffect, useCallback } from 'react';

// Componentes filhos — cada um em seu próprio arquivo
import Header         from './Header';
import Tabs           from './Tabs';
import ListaMesas     from './ListaMesas';
import Ranking        from './Ranking';
import Loja           from './Loja';
import ModalCriarMesa from './ModalCriarMesa';
import ModalSenha     from './ModalSenha';


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

// IDs das tabs — usamos constantes para evitar erros de digitação
// Se escrevermos 'publicas' errado em algum lugar, o JS avisa
const TABS = {
    PUBLICAS:  'publicas',
    PRIVADAS:  'privadas',
    RANKING:   'ranking',
    LOJA:      'loja',
};

// URL base do servidor backend
// import.meta.env é como o Vite lê as variáveis de ambiente (.env)
// VITE_SERVER_URL deve estar no arquivo frontend/.env
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Intervalo de atualização da lista de mesas (em ms)
const INTERVALO_ATUALIZAR = 10000; // 10 segundos


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Lobby({ usuario, socket, onEntrarMesa }) {

    // ----------------------------------------------------------------
    // ESTADO DO LOBBY
    //
    // useState: cria variáveis que quando mudam, re-renderizam o componente.
    // Cada useState é independente — mudar um não afeta os outros.
    // ----------------------------------------------------------------

    // Tab atualmente visível
    const [tabAtiva, setTabAtiva] = useState(TABS.PUBLICAS);

    // Listas de mesas vindas do servidor
    const [mesasPublicas, setMesasPublicas] = useState([]);
    const [mesasPrivadas, setMesasPrivadas] = useState([]);

    // Ranking dos melhores jogadores
    const [ranking, setRanking] = useState([]);

    // Controla quais modais estão abertos
    // null = fechado, qualquer outro valor = aberto
    const [modalCriar, setModalCriar] = useState(false);
    const [modalSenha, setModalSenha] = useState(null); // guarda o mesaId

    // Estado de carregamento — mostra um spinner enquanto busca as mesas
    const [carregando, setCarregando] = useState(true);

    // Mensagem de erro (ex: servidor fora do ar)
    const [erro, setErro] = useState(null);


    // ----------------------------------------------------------------
    // BUSCA DE MESAS
    //
    // useCallback: memoriza a função para não recriar a cada render.
    // Necessário aqui porque essa função é usada no useEffect abaixo.
    // Sem useCallback, o useEffect rodaria infinitamente.
    // ----------------------------------------------------------------
    const buscarMesas = useCallback(async () => {
        try {
            setErro(null);

            // fetch: faz uma requisição HTTP GET para o servidor
            const res  = await fetch(`${SERVER_URL}/mesas`);

            // Se o servidor retornou erro (ex: 500), lança exceção
            if (!res.ok) throw new Error(`Servidor retornou ${res.status}`);

            const data = await res.json();

            // Separa mesas públicas e privadas
            // .filter() cria um novo array com só os elementos que passam no teste
            setMesasPublicas(data.mesas.filter(m => !m.temSenha));
            setMesasPrivadas(data.mesas.filter(m =>  m.temSenha));

        } catch (e) {
            console.error('Erro ao buscar mesas:', e);
            setErro('Não foi possível carregar as mesas. Tente novamente.');
        } finally {
            // finally roda sempre — com erro ou sem erro
            // Garante que o spinner desaparece independente do resultado
            setCarregando(false);
        }
    }, []); // Array vazio: não tem dependências, nunca recria


    // ----------------------------------------------------------------
    // EFEITO: busca mesas ao montar e atualiza periodicamente
    //
    // useEffect com cleanup: o return cancela o intervalo quando
    // o componente é desmontado (ex: jogador entrou na mesa).
    // Sem o cleanup, o intervalo continuaria rodando em background,
    // consumindo memória e causando erros.
    // ----------------------------------------------------------------
    useEffect(() => {
        // Busca imediatamente ao entrar no lobby
        buscarMesas();

        // Depois atualiza a cada INTERVALO_ATUALIZAR ms
        const intervalo = setInterval(buscarMesas, INTERVALO_ATUALIZAR);

        // Cleanup: cancela o intervalo ao sair do lobby
        return () => clearInterval(intervalo);
    }, [buscarMesas]);


    // ----------------------------------------------------------------
    // EFEITO: escuta eventos do Socket.io
    //
    // O servidor pode empurrar atualizações de mesas em tempo real.
    // Isso complementa o polling (buscarMesas) com updates instantâneos.
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!socket) return;

        // Quando o servidor avisa que uma mesa foi criada/atualizada
        socket.on('mesas_atualizadas', buscarMesas);

        // Cleanup: remove o listener ao sair do lobby
        return () => socket.off('mesas_atualizadas', buscarMesas);
    }, [socket, buscarMesas]);


    // ----------------------------------------------------------------
    // HANDLERS (funções que respondem a ações do usuário)
    // ----------------------------------------------------------------

    // Entra em uma mesa pública diretamente
    function handleEntrarPublica(mesaId) {
        socket.emit('entrar_mesa', { mesaId });
        onEntrarMesa(mesaId);
    }

    // Abre o modal de senha para mesa privada
    function handleClicarPrivada(mesaId) {
        setModalSenha(mesaId);
    }

    // Confirma entrada em mesa privada com senha
    function handleConfirmarSenha(senha) {
        if (!modalSenha) return;
        socket.emit('entrar_mesa', { mesaId: modalSenha, senha });
        onEntrarMesa(modalSenha);
        setModalSenha(null);
    }

    // Mesa criada com sucesso — entra automaticamente
    function handleMesaCriada(mesaId) {
        setModalCriar(false);
        onEntrarMesa(mesaId);
    }


    // ================================================================
    // RENDERIZAÇÃO
    //
    // O JSX descreve COMO a tela deve parecer.
    // O React decide O QUE mudar no DOM quando o estado muda.
    // ================================================================
    return (
        <div style={estilos.pagina}>

            {/* HEADER: avatar, nome e saldo do jogador */}
            <Header
                usuario={usuario}
                onAbrirLoja={() => setTabAtiva(TABS.LOJA)}
            />

            {/* TABS: navegação entre as seções do lobby */}
            <Tabs
                tabAtiva={tabAtiva}
                onMudar={setTabAtiva}
                qtdPublicas={mesasPublicas.length}
                qtdPrivadas={mesasPrivadas.length}
            />

            {/* CONTEÚDO: muda conforme a tab ativa */}
            <div style={estilos.conteudo}>

                {/* Mensagem de erro (se houver) */}
                {erro && (
                    <div style={estilos.erro}>
                        <span>{erro}</span>
                        <button
                            onClick={buscarMesas}
                            style={estilos.btnTentar}
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

                {/* Tab: Mesas Públicas */}
                {tabAtiva === TABS.PUBLICAS && (
                    <ListaMesas
                        mesas={mesasPublicas}
                        carregando={carregando}
                        privadas={false}
                        onEntrar={handleEntrarPublica}
                    />
                )}

                {/* Tab: Mesas Privadas */}
                {tabAtiva === TABS.PRIVADAS && (
                    <ListaMesas
                        mesas={mesasPrivadas}
                        carregando={carregando}
                        privadas={true}
                        onEntrar={handleClicarPrivada}
                    />
                )}

                {/* Tab: Ranking */}
                {tabAtiva === TABS.RANKING && (
                    <Ranking
                        ranking={ranking}
                        meuUid={usuario?.uid}
                    />
                )}

                {/* Tab: Loja */}
                {tabAtiva === TABS.LOJA && (
                    <Loja
                        usuario={usuario}
                        socket={socket}
                    />
                )}

            </div>

            {/* BOTÃO CRIAR MESA: fixo no fundo da tela */}
            <div style={estilos.rodape}>
                <button
                    onClick={() => setModalCriar(true)}
                    style={estilos.btnCriar}
                >
                    <span style={{ fontSize: '22px', lineHeight: 1 }}>+</span>
                    Criar Mesa
                </button>
            </div>

            {/* MODAL: formulário para criar nova mesa */}
            {modalCriar && (
                <ModalCriarMesa
                    usuario={usuario}
                    socket={socket}
                    onMesaCriada={handleMesaCriada}
                    onFechar={() => setModalCriar(false)}
                />
            )}

            {/* MODAL: pedir senha da mesa privada */}
            {modalSenha && (
                <ModalSenha
                    onConfirmar={handleConfirmarSenha}
                    onFechar={() => setModalSenha(null)}
                />
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: ESTILOS
//
// Definidos fora do componente para não recriar a cada render.
// Usamos um objeto 'estilos' para organizar — como um mini CSS.
//
// Por que não usar um arquivo .css separado?
//   Em projetos pequenos, manter estilos próximos do componente
//   é mais fácil de manter. Quando o projeto crescer, podemos
//   migrar para CSS Modules ou Tailwind.
// ================================================================

const estilos = {

    // Container principal — ocupa a tela inteira no mobile
    pagina: {
        minHeight:     '100vh',
        background:    '#0a0f1e',
        color:         '#F8FAFC',
        display:       'flex',
        flexDirection: 'column',
        maxWidth:      '480px',   // Mobile-first: limita a largura
        margin:        '0 auto',  // Centraliza em telas maiores
        fontFamily:    'sans-serif',
        position:      'relative',
    },

    // Área de conteúdo com scroll
    // paddingBottom: espaço para o botão "Criar Mesa" não cobrir o conteúdo
    conteudo: {
        flex:          1,
        overflowY:     'auto',
        padding:       '12px 14px 100px',
        WebkitOverflowScrolling: 'touch', // scroll suave no iOS
    },

    // Rodapé fixo com o botão de criar mesa
    rodape: {
        position:      'fixed',
        bottom:        0,
        left:          '50%',
        transform:     'translateX(-50%)',
        width:         '100%',
        maxWidth:      '480px',
        padding:       '10px 14px',
        // safe-area: respeita a barra home do iPhone
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
        background:    'linear-gradient(to top, #0a0f1e 70%, transparent)',
        zIndex:        100,
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
        // Feedback de toque
        WebkitTapHighlightColor: 'transparent',
        transition:     'opacity 0.15s',
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
        background:    'rgba(239,68,68,0.2)',
        border:        '1px solid rgba(239,68,68,0.4)',
        borderRadius:  '6px',
        color:         '#FCA5A5',
        fontSize:      '12px',
        padding:       '6px 12px',
        cursor:        'pointer',
        alignSelf:     'flex-start',
    },
};
