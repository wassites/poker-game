/* ================================================================
   ARQUIVO: backend/server.js

   MUDANÇAS DESTA VERSÃO:
     → Importa e registra registrarEventosWallet() para cada socket
     → Rota POST /webhook/mercadopago para confirmação de pagamentos
     → express.raw() para capturar rawBody necessário na validação
       da assinatura HMAC do webhook do Mercado Pago
     → resetarLimiteDiario() agendado para meia-noite todo dia
     → Rota GET /jogador/:uid para buscar perfil (usado pelo SendBC)

   CONCEITO GERAL:
   Este é o PONTO DE ENTRADA do servidor — o primeiro arquivo
   que o Node.js executa quando você roda "node server.js".

   ELE FAZ TRÊS COISAS:
     1. Cria o servidor HTTP com Express
     2. Anexa o Socket.io nesse servidor (tempo real)
     3. Define todos os eventos do jogo (entrar, agir, sair, etc.)
        + todos os eventos da carteira (via wallet-manager.js)

   COMO O SOCKET.IO FUNCIONA:
     O cliente (React) conecta via WebSocket.
     O servidor escuta eventos:  socket.on('nome', dados => ...)
     O servidor emite eventos:   io.to(sala).emit('nome', dados)

   FLUXO DE UMA PARTIDA:
     1. Cliente conecta    → 'connection'
     2. Cliente autentica  → 'autenticar'
     3. Cliente cria mesa  → 'criar_mesa'
     4. Cliente entra mesa → 'entrar_mesa'
     5. Host inicia jogo   → 'iniciar_rodada'
     6. Jogadores agem     → 'acao' (fold/check/call/raise)
     7. Fim de mão         → servidor emite 'estado_mesa' com vencedor
     8. Cliente sai        → 'disconnect' ou 'sair_mesa'

   ROTAS REST:
     GET  /health                → verifica saúde do servidor
     GET  /mesas                 → lista mesas abertas no lobby
     GET  /ranking               → top jogadores (Firestore)
     POST /webhook/mercadopago   → confirmação de pagamentos (NOVO)

   VARIÁVEIS DE AMBIENTE (.env):
     PORT              → porta do servidor (padrão 3001)
     CLIENT_URL        → URL do frontend React (para CORS)
     MP_ACCESS_TOKEN   → token privado do Mercado Pago
     MP_WEBHOOK_SECRET → chave para validar webhooks do MP
================================================================ */

import express          from 'express';
import { createServer } from 'http';
import { Server       } from 'socket.io';
import cors             from 'cors';
import dotenv           from 'dotenv';
import { GameManager  } from './game-manager.js';

// Firebase Admin para ranking e perfis
import { buscarRanking } from './firebase-admin.js';

// Wallet — eventos Socket.io e reset diário
import { registrarEventosWallet, resetarLimiteDiario } from './wallet/wallet-manager.js';

// Mercado Pago — webhook de confirmação de pagamentos
import { processarWebhookMP } from './wallet/mercadopago.js';

dotenv.config();


// ================================================================
// BLOCO 1: CONFIGURAÇÃO DO SERVIDOR HTTP + SOCKET.IO
// ================================================================

const app    = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            process.env.CLIENT_URL || 'http://localhost:5173',
            'http://localhost:5173',
            'https://poker-game-tawny-rho.vercel.app',
        ],
        methods: ['GET', 'POST'],
    },
    pingTimeout:  60000,
    pingInterval: 25000,
});

const gameManager = new GameManager(io);


// ================================================================
// BLOCO 2: MIDDLEWARES DO EXPRESS
//
// IMPORTANTE: express.raw() deve vir ANTES de express.json()
// para capturar o rawBody necessário na validação do webhook MP.
// O rawBody é o body em bytes brutos — necessário para recalcular
// a assinatura HMAC e verificar se o webhook é legítimo.
// ================================================================

// Captura rawBody para validação do webhook HMAC
app.use('/webhook/mercadopago', express.raw({ type: 'application/json' }), (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body.toString('utf8');
        req.body    = JSON.parse(req.rawBody);
    }
    next();
});

app.use(cors({
    origin: (origin, callback) => {
        const permitidas = [
            'http://localhost:5173',
            'http://localhost:3000',
            process.env.CLIENT_URL,
            'https://poker-game-tawny-rho.vercel.app',
        ].filter(Boolean);

        if (!origin || permitidas.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS bloqueado para: ${origin}`));
        }
    },
    credentials: true,
}));

app.use(express.json());


// ================================================================
// BLOCO 3: ROTAS REST
// ================================================================

// GET /health → verifica se o servidor está online
app.get('/health', (req, res) => {
    res.json({
        status:  'ok',
        uptime:  Math.floor(process.uptime()),
        mesas:   gameManager.getMesasAtivas().length,
        memoria: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    });
});

// GET /mesas → lista mesas abertas para o lobby
app.get('/mesas', (req, res) => {
    const mesas = gameManager.getMesasAtivas()
        .filter(m => m.fase === 'AGUARDANDO')
        .map(m => ({
            id:           m.id,
            nome:         m.nome,
            jogadores:    Object.keys(m.jogadores).length,
            maxJogadores: 9,
            bigBlind:     m.bigBlind,
            buyIn:        m.valorBuyIn,
            temSenha:     !!m.senha,
        }));

    res.json({ mesas });
});

// GET /ranking → retorna top jogadores salvos no Firestore
app.get('/ranking', async (req, res) => {
    const top     = Math.min(parseInt(req.query.top) || 20, 100);
    const ranking = await buscarRanking(top);
    res.json({ ranking });
});

// ----------------------------------------------------------------
// POST /webhook/mercadopago
// Recebe notificações de pagamento do Mercado Pago.
//
// FLUXO:
//   1. MP chama este endpoint quando pagamento é aprovado
//   2. Validamos a assinatura HMAC com MP_WEBHOOK_SECRET
//   3. Buscamos detalhes do pagamento na API do MP
//   4. Se status === 'approved' → chamamos creditarDeposito()
//   5. creditarDeposito() credita ₿C e notifica o socket do jogador
//
// IMPORTANTE: respondemos 200 imediatamente (antes do processamento)
//   O MP considera falha se não receber 200 em < 5 segundos.
//   O processamento acontece de forma assíncrona depois.
// ----------------------------------------------------------------
app.post('/webhook/mercadopago', processarWebhookMP(io));


// ================================================================
// BLOCO 4: MAP DE SOCKETS
// ================================================================

const socketMesa = new Map();


// ================================================================
// BLOCO 5: EVENTOS DO SOCKET.IO
// ================================================================

io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);

    // ----------------------------------------------------------------
    // Registra todos os eventos da carteira para este socket
    // Separado em wallet-manager.js para manter o server.js limpo
    // ----------------------------------------------------------------
    registrarEventosWallet(socket, io);


    // ----------------------------------------------------------------
    // EVENTO: autenticar
    // ----------------------------------------------------------------
    socket.on('autenticar', (dados) => {
        if (!dados?.uid) {
            socket.emit('erro', { mensagem: 'UID inválido.' });
            return;
        }

        socket.data.uid    = dados.uid;
        socket.data.nome   = dados.nome   || 'Anônimo';
        socket.data.avatar = dados.avatar || '';

        console.log(`Autenticado: ${dados.nome} (${dados.uid})`);
        socket.emit('autenticado', { sucesso: true });
    });


    // ----------------------------------------------------------------
    // EVENTO: criar_mesa
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

        socket.join(mesaId);
        socket.data.mesaId = mesaId;
        socketMesa.set(socket.id, mesaId);

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
    // ----------------------------------------------------------------
    socket.on('iniciar_rodada', () => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) return;

        if (mesa.host !== socket.data.uid) {
            socket.emit('erro', { mensagem: 'Somente o host pode iniciar.' });
            return;
        }

        if (Object.keys(mesa.jogadores).length < 2) {
            socket.emit('erro', { mensagem: 'Mínimo 2 jogadores para iniciar.' });
            return;
        }

        gameManager.iniciarRodada(mesaId);
        console.log(`Rodada iniciada na mesa ${mesaId}`);
    });


    // ----------------------------------------------------------------
    // EVENTO: acao
    // ----------------------------------------------------------------
    socket.on('acao', (dados) => {
        const mesaId = socket.data.mesaId;
        const uid    = socket.data.uid;
        if (!mesaId || !uid) return;

        const acao  = dados?.acao?.toUpperCase();
        const valor = parseInt(dados?.valor) || 0;

        const acoesValidas = ['FOLD', 'CHECK', 'CALL', 'RAISE'];
        if (!acoesValidas.includes(acao)) {
            socket.emit('erro', { mensagem: 'Ação inválida.' });
            return;
        }

        gameManager.processarAcao(mesaId, uid, acao, valor, socket.id);
    });


    // ----------------------------------------------------------------
    // EVENTO: adicionar_bot
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
    // ----------------------------------------------------------------
    socket.on('disconnect', (motivo) => {
        console.log(`Socket desconectado: ${socket.id} (${motivo})`);

        const mesaId = socketMesa.get(socket.id);
        const uid    = socket.data.uid;

        if (mesaId && uid) {
            setTimeout(() => {
                const mesa = gameManager.getMesa(mesaId);
                if (!mesa) return;
                if (mesa.jogadores[uid]) {
                    gameManager.sairMesa(mesaId, uid);
                }
            }, 5000);
        }

        socketMesa.delete(socket.id);
    });


    // ----------------------------------------------------------------
    // EVENTO: pedir_estado
    // ----------------------------------------------------------------
    socket.on('pedir_estado', () => {
        const mesaId = socket.data.mesaId;
        if (!mesaId) return;

        const mesa = gameManager.getMesa(mesaId);
        if (!mesa) return;

        const estadoFiltrado = gameManager.filtrarEstadoParaJogador(mesa, socket.data.uid);
        socket.emit('estado_mesa', estadoFiltrado);
    });

});


// ================================================================
// BLOCO 6: INICIALIZAÇÃO DO SERVIDOR
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
// BLOCO 7: RESET DIÁRIO DO LIMITE DE SAQUE
//
// Zera sacadoHoje para todos os jogadores à meia-noite.
// Calcula o tempo até a próxima meia-noite e agenda com setTimeout.
// Depois repete a cada 24h com setInterval.
// ================================================================

function agendarResetDiario() {
    const agora       = new Date();
    const meianoite   = new Date(agora);
    meianoite.setHours(24, 0, 0, 0); // próxima meia-noite

    const msAteMeianoite = meianoite.getTime() - agora.getTime();

    setTimeout(async () => {
        await resetarLimiteDiario();
        // Depois da primeira vez, repete a cada 24h
        setInterval(resetarLimiteDiario, 24 * 60 * 60 * 1000);
    }, msAteMeianoite);

    console.log(`🕐 Reset diário agendado em ${Math.round(msAteMeianoite / 1000 / 60)} minutos.`);
}

agendarResetDiario();


// ================================================================
// BLOCO 8: TRATAMENTO DE ERROS GLOBAIS
// ================================================================

process.on('unhandledRejection', (erro) => {
    console.error('Erro assíncrono não capturado:', erro);
});

process.on('uncaughtException', (erro) => {
    console.error('Erro síncrono não capturado:', erro);
});