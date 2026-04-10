/* ================================================================
   ARQUIVO: backend/firebase-admin.js

   CONCEITO GERAL:
   Conecta o backend Node.js ao Firebase/Firestore usando o
   Firebase Admin SDK — a versão do Firebase para servidores.

   DIFERENÇA: Firebase cliente vs Firebase Admin
   ─────────────────────────────────────────────
   Firebase cliente (frontend):
     → Usado no React (browser)
     → Autenticação do usuário
     → Regras de segurança do Firestore se aplicam
     → Chaves públicas (podem aparecer no código)

   Firebase Admin (backend):
     → Usado no Node.js (servidor)
     → Acesso total ao Firestore — ignora regras de segurança
     → Pode criar/deletar usuários
     → Chaves PRIVADAS (nunca no frontend, nunca no GitHub)
     → Autenticado via arquivo JSON de credenciais

   POR QUE PRECISAMOS DO ADMIN NO BACKEND:
     O ranking precisa salvar dados no Firestore após cada rodada.
     O backend não tem um usuário logado — usa a conta de serviço
     (service account) que tem permissão total ao projeto Firebase.

   ESTRUTURA NO FIRESTORE:
   ┌─────────────────────────────────────────┐
   │ ranking/                                │
   │   {uid}/                                │
   │     nome: "Walter"                      │
   │     avatar: "https://..."               │
   │     vitorias: 42                        │
   │     fichasGanhas: 150000                │
   │     fichasPerdidas: 80000               │
   │     fichasLiquidas: 70000               │
   │     partidasJogadas: 120                │
   │     ultimaPartida: Timestamp            │
   └─────────────────────────────────────────┘
================================================================ */

import admin       from 'firebase-admin';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join  } from 'path';

// __dirname não existe em ES Modules — precisamos reconstruir
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);


// ================================================================
// BLOCO 1: INICIALIZAÇÃO DO FIREBASE ADMIN
//
// Lemos o arquivo de credenciais do disco.
// O arquivo JSON contém a chave privada da conta de serviço.
//
// Por que não usar process.env aqui?
//   A chave privada tem quebras de linha (\n) que dificultam
//   passar via variável de ambiente. O arquivo JSON é mais seguro
//   e confiável.
//
// IMPORTANTE: firebase-credentials.json está no .gitignore!
//   Nunca suba esse arquivo para o GitHub.
// ================================================================

let db = null;

async function inicializarFirebase() {
    // Evita inicializar duas vezes
    if (admin.apps.length > 0) {
        db = admin.firestore();
        return;
    }

    try {
        // Lê o arquivo de credenciais
        const caminhoCredenciais = join(__dirname, 'firebase-credentials.json');
        const credenciaisJson    = await readFile(caminhoCredenciais, 'utf-8');
        const credenciais        = JSON.parse(credenciaisJson);

        // Inicializa o app do Firebase Admin
        admin.initializeApp({
            credential: admin.credential.cert(credenciais),
        });

        // Cria a instância do Firestore
        db = admin.firestore();

        console.log('✅ Firebase Admin inicializado com sucesso.');

    } catch (erro) {
        console.error('❌ Erro ao inicializar Firebase Admin:', erro.message);
        console.warn('⚠️  Ranking não estará disponível.');
        // Não lança o erro — o servidor continua funcionando sem o ranking
    }
}

// Inicializa ao importar este módulo
await inicializarFirebase();


// ================================================================
// BLOCO 2: FUNÇÕES DE RANKING
//
// Cada função é um CRUD simples no Firestore.
// Usamos 'merge: true' no set() para não sobrescrever dados existentes.
// ================================================================

// ------------------------------------------------------------
// salvarResultadoRodada
//
// Chamado pelo game-manager.js ao fim de cada rodada.
// Atualiza as estatísticas de cada jogador que participou.
//
// resultados: [{
//   uid, nome, avatar,
//   fichasGanhas,   // quanto ganhou nesta rodada (pode ser 0)
//   fichasPerdidas, // quanto perdeu nesta rodada (pode ser 0)
//   venceu,         // boolean
// }]
// ------------------------------------------------------------
export async function salvarResultadoRodada(resultados) {
    if (!db) return; // Firebase não inicializado — silenciosamente ignora

    // Usa batch para salvar todos de uma vez — mais eficiente
    // Um batch agrupa várias operações em uma única chamada à API
    const batch = db.batch();

    resultados.forEach(({ uid, nome, avatar, fichasGanhas, fichasPerdidas, venceu }) => {
        // Só salva jogadores humanos (não bots)
        if (!uid || uid.startsWith('bot_')) return;

        const ref = db.collection('ranking').doc(uid);

        // increment() soma ao valor existente sem precisar ler primeiro
        // Muito mais eficiente que ler → somar → escrever
        batch.set(ref, {
            nome,
            avatar:           avatar || '',
            vitorias:         admin.firestore.FieldValue.increment(venceu ? 1 : 0),
            fichasGanhas:     admin.firestore.FieldValue.increment(fichasGanhas || 0),
            fichasPerdidas:   admin.firestore.FieldValue.increment(fichasPerdidas || 0),
            fichasLiquidas:   admin.firestore.FieldValue.increment((fichasGanhas || 0) - (fichasPerdidas || 0)),
            partidasJogadas:  admin.firestore.FieldValue.increment(1),
            ultimaPartida:    admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }); // merge: true → não sobrescreve campos existentes
    });

    try {
        await batch.commit();
        console.log(`📊 Ranking atualizado para ${resultados.filter(r => !r.uid?.startsWith('bot_')).length} jogador(es).`);
    } catch (erro) {
        console.error('❌ Erro ao salvar ranking:', erro.message);
    }
}


// ------------------------------------------------------------
// buscarRanking
//
// Retorna os top N jogadores ordenados por fichasLiquidas.
// Chamado pela rota GET /ranking no server.js.
//
// top: quantos jogadores retornar (padrão: 20)
// ------------------------------------------------------------
export async function buscarRanking(top = 20) {
    if (!db) return []; // Firebase não inicializado

    try {
        const snapshot = await db
            .collection('ranking')
            .orderBy('fichasLiquidas', 'desc') // Ordena pelo maior saldo líquido
            .limit(top)
            .get();

        return snapshot.docs.map((doc, index) => ({
            posicao:        index + 1,
            uid:            doc.id,
            nome:           doc.data().nome            || 'Jogador',
            avatar:         doc.data().avatar          || '',
            vitorias:       doc.data().vitorias        || 0,
            fichasGanhas:   doc.data().fichasGanhas    || 0,
            fichasPerdidas: doc.data().fichasPerdidas  || 0,
            fichasLiquidas: doc.data().fichasLiquidas  || 0,
            partidasJogadas: doc.data().partidasJogadas || 0,
            ultimaPartida:  doc.data().ultimaPartida?.toDate()?.toISOString() || null,
        }));

    } catch (erro) {
        console.error('❌ Erro ao buscar ranking:', erro.message);
        return [];
    }
}


// ------------------------------------------------------------
// buscarPerfil
//
// Retorna as estatísticas de um jogador específico.
// Útil para mostrar o perfil do jogador logado.
// ------------------------------------------------------------
export async function buscarPerfil(uid) {
    if (!db || !uid) return null;

    try {
        const doc = await db.collection('ranking').doc(uid).get();
        if (!doc.exists) return null;

        return {
            uid,
            ...doc.data(),
            ultimaPartida: doc.data().ultimaPartida?.toDate()?.toISOString() || null,
        };

    } catch (erro) {
        console.error('❌ Erro ao buscar perfil:', erro.message);
        return null;
    }
}
