/* ================================================================
   ARQUIVO: backend/server.js
   
   CONCEITO GERAL:
   Este é o PONTO DE ENTRADA do servidor — o primeiro arquivo
   que o Node.js executa quando você roda "node server.js".

   ELE FAZ TRÊS COISAS:
     1. Cria o servidor HTTP com Express
     2. Anexa o Socket.io nesse servidor (tempo real)
     3. Define todos os eventos do jogo (entrar, agir, sair, etc.)

   COMO O SOCKET.IO FUNCIONA:
     O cliente (React) conecta via WebSocket.
     O servidor escuta eventos:  socket.on('nome', dados => ...)
     O servidor emite eventos:   io.to(sala).emit('nome', dados)
     
     É como um chat bidirecional — cliente e servidor se falam
     em tempo real sem precisar de requisições HTTP a cada ação.

   FLUXO DE UMA PARTIDA:
     1. Cliente conecta    → 'connection'
     2. Cliente autentica  → 'autenticar'
     3. Cliente cria mesa  → 'criar_mesa'
     4. Cliente entra mesa → 'entrar_mesa'
     5. Host inicia jogo   → 'iniciar_rodada'
     6. Jogadores agem     → 'acao' (fold/check/call/raise)
     7. Fim de mão         → servidor emite 'estado_mesa' com vencedor
     8. Cliente sai        → 'disconnect' ou 'sair_mesa'

   VARIÁVEIS DE AMBIENTE (.env):
     PORT          → porta do servidor (padrão 3001)
     CLIENT_URL    → URL do frontend React (para CORS)
     SUPABASE_URL  → URL do banco de dados
     SUPABASE_KEY  → chave do Supabase
================================================================ */

import express    from 'express';
import { createServer } from 'http';
import { Server  } from 'socket.io';
import cors       from 'cors';
import dotenv     from 'dotenv';
import { GameManager } from './game-manager.js';

// dotenv.config() lê o arquivo .env e coloca as variáveis em process.env
// Deve ser chamado ANTES de qualquer process.env.VARIAVEL
dotenv.config();


// ================================================================
// BLOCO 1: CONFIGURAÇÃO DO SERVIDOR HTTP + SOCKET.IO
//
// Por que não usar Express sozinho?
//   Express sozinho só suporta HTTP (requisição → resposta).
//   Socket.io precisa de uma conexão persistente (WebSocket).
//   A solução: criar um servidor HTTP nativo e "anexar" os dois.
//
// Hierarquia:
//   app (Express) → server (HTTP) → io (Socket.io)
//   O Express cuida das rotas REST (/health, /mesas).
//   O Socket.io cuida dos eventos em tempo real (acao, entrar_mesa).
// ================================================================

const app    = express();
const server = createServer(app);  // Servidor HTTP nativo do Node.js

// Socket.io anexado ao servidor HTTP
const io = new Server(server, {
    cors: {
        // CLIENT_URL: URL do seu frontend React (ex: http://localhost:5173)
        // Em produção será a URL do Vercel
        origin: process.env.CLIENT_URL || 'http://localhost:5173',

        // Métodos HTTP permitidos para o handshake inicial do WebSocket
        methods: ['GET', 'POST'],
    },
    // pingTimeout: tempo sem resposta antes de considerar desconectado
    pingTimeout: 60000,
    // pingInterval: frequência de verificação de conexão ativa
    pingInterval: 25000,
});

// Instancia o GameManager passando o io para ele poder emitir eventos
const gameManager = new GameManager(io);


// ================================================================
// BLOCO 2: MIDDLEWARES DO EXPRESS
//
// Middlewares são funções que processam a requisição ANTES
// de chegar na rota. Rodam em ordem, da primeira para a última.
//
// cors(): permite que o frontend (outro domínio) acesse a API
// express.json(): permite receber JSON no body das requisições
// ================================================================

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
}));

// Permite receber e enviar JSON nas rotas REST
app.use(express.json());


// ================================================================
// BLOCO 3: ROTAS REST (HTTP NORMAL)
//
// Estas rotas são acessadas via fetch() no React.
// Usamos HTTP para operações que NÃO precisam de tempo real:
//   → Verificar saúde do servidor
//   → Listar mesas disponíveis no lobby
//   → Autenticar token do Firebase
//
// Operações de JOGO (ações, cartas, pote) ficam no Socket.io.
// ================================================================

// GET /health → verifica se o servidor está online
// Usado pelo Railway/Render para saber se o servidor está saudável
app.get('/health', (req, res) => {
    res.json({
        status:  'ok',
        uptime:  Math.floor(process.uptime()),  // segundos desde que iniciou
        mesas:   gameManager.getMesasAtivas().length,
        memoria: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    });
});

// GET /mesas → lista mesas abertas para o lobby
// O frontend chama isso ao entrar no lobby para mostrar a lista
app.get('/mesas', (req, res) => {
    const mesas = gameManager.getMesasAtivas()
        .filter(m => m.fase === 'AGUARDANDO')
        .map(m => ({
            // Envia apenas o necessário para o lobby — sem dados secretos
            id:         m.id,
            nome:       m.nome,
            jogadores:  Object.keys(m.jogadores).length,
            maxJogadores: 9,
            bigBlind:   m.bigBlind,
            buyIn:      m.valorBuyIn,
            temSenha:   !!m.senha,
        }));

    res.json({ mesas });
});


// ================================================================
// BLOCO 4: AUTENTICAÇÃO E SESSÃO DOS SOCKETS
//
// O que é socket.data?
//   Cada conexão Socket.io tem um objeto 'data' para guardar
//   informações daquele cliente específico.
//   Guardamos uid, nome e avatar aqui para não precisar
//   receber esses dados em cada evento.
//
// Por que não usar JWT aqui?
//   O Firebase Auth já valida o token no cliente.
//   Para simplificar, confiamos no uid enviado pelo cliente.
//   Em produção, você pode verificar o token Firebase no servidor
//   usando firebase-admin SDK.
// ================================================================

// Map para rastrear em qual mesa cada socket está
// socketId → mesaId
const socketMesa = new Map();


// ================================================================
// BLOCO 5: EVENTOS DO SOCKET.IO
//
// io.on('connection') roda toda vez que um cliente conecta.
// Dentro dele, definimos todos os eventos daquele socket.
//
// O parâmetro 'socket' representa UM cliente conectado.
// 'io' representa TODOS os clientes (para broadcast).
// ================================================================

io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);


    // ----------------------------------------------------------------
    // EVENTO: autenticar
    // Primeiro evento que o cliente envia após conectar.
    // Registra uid, nome e avatar no socket para uso posterior.
    //
    // Dados recebidos: { uid, nome, avatar }
    // ----------------------------------------------------------------
    socket.on('autenticar', (dados) => {
        if (!dados?.uid) {
            socket.emit('erro', { mensagem: 'UID inválido.' });
            return;
        }

        // Guarda os dados do usuário neste socket
        socket.data.uid    = dados.uid;
        socket.data.nome   = dados.nome   || 'Anônimo';
        socket.data.avatar = dados.avatar || 'assets/avatar-padrao.png';

        console.log(`Autenticado: ${dados.nome} (${dados.uid})`);

        // Confirma autenticação para o cliente
        socket.emit('autenticado', { sucesso: true });
    });


    // ----------------------------------------------------------------
    // EVENTO: criar_mesa
    // Host cria uma nova mesa no lobby.
    //
    // Dados recebidos: { nome, buyIn, smallBlind, qtdBots }
    // Emite de volta: 'mesa_criada' com o mesaId
    // ----------------------------------------------------------------
    socket.on('criar_mesa', async (config) => {
        if (!socket.data.uid) {
            socket.emit('erro', { mensagem: 'Autentique-se primeiro.' });
            return;
        }

        const usuario = {
            uid:    socket.data.uid,
            nome:   socket.data.nome,
            avatar: socket.data.avatar,
        };

        const resultado = gameManager.criarMesa(config, usuario);

        if (!resultado.sucesso) {
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        const mesaId = resultado.mesaId;

        // Host entra automaticamente na sala Socket.io da mesa
        socket.join(mesaId);
        socket.data.mesaId = mesaId;
        socketMesa.set(socket.id, mesaId);

        // Adiciona bots se solicitado
        // Delay de 300ms entre cada bot para evitar conflitos
        if (config.qtdBots > 0) {
            for (let i = 0; i < config.qtdBots; i++) {
                await new Promise(r => setTimeout(r, 300));
                gameManager.adicionarBot(mesaId, usuario.rankPontos || 0);
            }
        }

        socket.emit('mesa_criada', { mesaId });
        console.log(`Mesa ${mesaId} criada por ${usuario.nome}`);
    });


    // ----------------------------------------------------------------
    // EVENTO: entrar_mesa
    // Jogador entra em uma mesa existente.
    //
    // Dados recebidos: { mesaId }
    // ----------------------------------------------------------------
    socket.on('entrar_mesa', (dados) => {
        if (!socket.data.uid) {
            socket.emit('erro', { mensagem: 'Autentique-se primeiro.' });
            return;
        }

        if (!dados?.mesaId) {
            socket.emit('erro', { mensagem: 'ID da mesa inválido.' });
            return;
        }

        const usuario = {
            uid:    socket.data.uid,
            nome:   socket.data.nome,
            avatar: socket.data.avatar,
        };

        const resultado = gameManager.entrarMesa(dados.mesaId, usuario, socket);

        if (!resultado.sucesso) {
            socket.emit('erro', { mensagem: resultado.erro });
            return;
        }

        socket.data.mesaId = dados.mesaId;
        socketMesa.set(socket.id, dados.mesaId);

        socket.emit('entrou_mesa', { mesaId: dados.mesaId });
        console.log(`${usuario.nome} entrou na mesa ${dados.mesaId}`);
    });


    // ----------------------------------------------------------------
    // EVENTO: iniciar_rodada
    // Somente o host pode iniciar.
    //
    // Dados recebidos: (nenhum — usa socket.data.mesaId)
    // ----------------------------------------------------------------
    socket.on('iniciar_rodada', () => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) return;

        // Verifica se é o host
        if (mesa.host !== socket.data.uid) {
            socket.emit('erro', { mensagem: 'Somente o host pode iniciar.' });
            return;
        }

        const jogadores = Object.keys(mesa.jogadores).length;
        if (jogadores < 2) {
            socket.emit('erro', { mensagem: 'Mínimo 2 jogadores para iniciar.' });
            return;
        }

        gameManager.iniciarRodada(mesaId);
        console.log(`Rodada iniciada na mesa ${mesaId}`);
    });


    // ----------------------------------------------------------------
    // EVENTO: acao
    // Jogador executa uma ação (FOLD, CHECK, CALL, RAISE).
    //
    // Dados recebidos: { acao: 'FOLD'|'CHECK'|'CALL'|'RAISE', valor: number }
    // ----------------------------------------------------------------
    socket.on('acao', (dados) => {
        const mesaId = socket.data.mesaId;
        const uid    = socket.data.uid;

        if (!mesaId || !uid) return;

        const acao  = dados?.acao?.toUpperCase();
        const valor = parseInt(dados?.valor) || 0;

        // Ações válidas
        const acoesValidas = ['FOLD', 'CHECK', 'CALL', 'RAISE'];
        if (!acoesValidas.includes(acao)) {
            socket.emit('erro', { mensagem: 'Ação inválida.' });
            return;
        }

        gameManager.processarAcao(mesaId, uid, acao, valor, socket.id);
    });


    // ----------------------------------------------------------------
    // EVENTO: adicionar_bot
    // Host adiciona um bot manualmente durante a partida.
    //
    // Dados recebidos: { rankPontos: number }
    // ----------------------------------------------------------------
    socket.on('adicionar_bot', (dados) => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa || mesa.host !== socket.data.uid) return;

        gameManager.adicionarBot(mesaId, dados?.rankPontos || 0);
    });


    // ----------------------------------------------------------------
    // EVENTO: rebuy
    // Jogador compra mais fichas entre mãos.
    //
    // Dados recebidos: { valor: number }
    // ----------------------------------------------------------------
    socket.on('rebuy', (dados) => {
        const mesaId = socket.data.mesaId;
        const uid    = socket.data.uid;
        if (!mesaId || !uid) return;

        const valor = parseInt(dados?.valor) || 0;
        if (valor <= 0) {
            socket.emit('erro', { mensagem: 'Valor de rebuy inválido.' });
            return;
        }

        const resultado = gameManager.fazerRebuy(mesaId, uid, valor);
        if (!resultado.sucesso) {
            socket.emit('erro', { mensagem: resultado.erro });
        } else {
            socket.emit('rebuy_ok', { valor });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: sair_mesa
    // Jogador sai voluntariamente da mesa.
    // ----------------------------------------------------------------
    socket.on('sair_mesa', () => {
        const mesaId = socket.data.mesaId;
        const uid    = socket.data.uid;
        if (!mesaId || !uid) return;

        socket.leave(mesaId);
        socketMesa.delete(socket.id);
        socket.data.mesaId = null;

        gameManager.sairMesa(mesaId, uid);
        socket.emit('saiu_mesa', { sucesso: true });

        console.log(`${socket.data.nome} saiu da mesa ${mesaId}`);
    });


    // ----------------------------------------------------------------
    // EVENTO: disconnect
    // Dispara automaticamente quando o cliente perde a conexão.
    // (fechar aba, perder internet, etc.)
    // ----------------------------------------------------------------
    socket.on('disconnect', (motivo) => {
        console.log(`Socket desconectado: ${socket.id} (${motivo})`);

        const mesaId = socketMesa.get(socket.id);
        const uid    = socket.data.uid;

        if (mesaId && uid) {
            // Pequeno delay antes de remover — pode ser reconexão rápida
            // Em produção, você pode implementar reconexão com o mesmo uid
            setTimeout(() => {
                const mesa = gameManager.getMesa(mesaId);
                if (!mesa) return;

                // Só remove se o socket não reconectou
                const aindaNaMesa = mesa.jogadores[uid];
                if (aindaNaMesa) {
                    gameManager.sairMesa(mesaId, uid);
                }
            }, 5000); // 5 segundos de tolerância para reconexão
        }

        socketMesa.delete(socket.id);
    });


    // ----------------------------------------------------------------
    // EVENTO: pedir_estado
    // Cliente pede o estado atual da mesa (útil ao reconectar).
    // ----------------------------------------------------------------
    socket.on('pedir_estado', () => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        // Força emissão do estado só para este socket
        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) return;

        const estadoFiltrado = gameManager.filtrarEstadoParaJogador(mesa, socket.data.uid);
        socket.emit('estado_mesa', estadoFiltrado);
    });

}); // Fim do io.on('connection')


// ================================================================
// BLOCO 6: INICIALIZAÇÃO DO SERVIDOR
//
// process.env.PORT: o Railway/Render define a porta automaticamente.
// Se não definir, usamos 3001 localmente.
//
// server.listen(): inicia o servidor HTTP + Socket.io na mesma porta.
// O Express e o Socket.io compartilham a mesma porta.
// ================================================================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║   Servidor Poker rodando!            ║
║   Porta:    ${PORT}                      ║
║   Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}          ║
╚══════════════════════════════════════╝
    `);
});


// ================================================================
// BLOCO 7: TRATAMENTO DE ERROS GLOBAIS
//
// Sem isso, um erro não capturado derruba o servidor inteiro.
// Em produção, o Railway reinicia automaticamente após uma queda,
// mas é melhor logar e continuar quando possível.
// ================================================================

// Erro assíncrono não capturado (ex: await sem try/catch)
process.on('unhandledRejection', (erro) => {
    console.error('Erro assíncrono não capturado:', erro);
});

// Erro síncrono não capturado (ex: TypeError)
process.on('uncaughtException', (erro) => {
    console.error('Erro síncrono não capturado:', erro);
    // NÃO chame process.exit() aqui em produção — deixe o processo continuar
});
