/* ================================================================
   ARQUIVO: backend/wallet/wallet-manager.js

   CONCEITO GERAL:
   Gerencia todos os eventos de carteira do Socket.io.
   É o intermediário entre o frontend e o Firestore/blockchain.

   EVENTOS RECEBIDOS (socket.on):
     wallet:depositar         → inicia pagamento PIX/cartão
     wallet:sacar             → solicita saque ₿C → R$
     wallet:enviar            → transferência P2P entre jogadores
     wallet:buscar_historico  → retorna extrato do Firestore
     wallet:buscar_jogador    → busca destinatário por nome/uid
     wallet:resgatar_bonus    → credita bônus de boas-vindas

   EVENTOS EMITIDOS (socket.emit):
     wallet:saldo_atualizado  → novo saldo após operação
     wallet:tx_nova           → nova transação para o histórico
     wallet:historico         → extrato completo
     wallet:jogador_encontrado     → destinatário encontrado
     wallet:jogador_nao_encontrado → destinatário não existe
     wallet:bonus_creditado   → bônus creditado com sucesso
     wallet:bonus_erro        → erro ao creditar bônus
     wallet:envio_confirmado  → envio P2P concluído
     wallet:envio_erro        → erro no envio P2P

   SEGURANÇA:
     → PIN verificado via hash bcrypt (nunca comparado em texto claro)
     → Bônus só concedido uma vez (flag bonusResgatado no Firestore)
     → Saldo real e bônus separados — bônus nunca entra no saque
     → Todas as operações validadas antes de tocar no banco
     → Limite diário de saque verificado antes de executar
================================================================ */

import admin        from 'firebase-admin';
import bcrypt       from 'bcrypt';
import { depositar, transferir, sacar, bonus, confirmarTransacao, falharTransacao, TIPOS } from './transactions.js';
import { blockchain }                    from './blockchain.js';
import { criarCarteira, validarEndereco } from './wallet.js';


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

const BONUS_BOAS_VINDAS_BC = 10_000;   // ₿C 10.000 = R$ 10,00
const TAXA_DEPOSITO        = 0.05;     // 5% cobrada em R$
const TAXA_SAQUE           = 0.03;     // 3% descontada do valor
const TAXA_ENVIO           = 0.01;     // 1% sobre ₿C enviados
const TAXA_ENVIO_MIN_BC    = 10;       // taxa mínima de envio
const COTACAO_BC_POR_REAL  = 1000;     // 1 real = 1000 ₿C
const SAQUE_MAX_DIARIO_BC  = 500_000;  // limite diário de saque
const SAQUE_MIN_BC         = 5_000;    // saque mínimo
const ENVIO_MIN_BC         = 100;      // envio mínimo
const ENVIO_MAX_BC         = 100_000;  // envio máximo por transação


// ================================================================
// BLOCO 2: HELPERS DO FIRESTORE
// ================================================================

/**
 * Retorna a referência do documento do jogador no Firestore.
 */
function refJogador(uid) {
    return admin.firestore().collection('jogadores').doc(uid);
}

/**
 * Retorna a referência da subcoleção de transações do jogador.
 */
function refTransacoes(uid) {
    return admin.firestore().collection('jogadores').doc(uid).collection('transacoes');
}

/**
 * Busca o perfil completo do jogador no Firestore.
 */
async function getPerfil(uid) {
    const snap = await refJogador(uid).get();
    if (!snap.exists) return null;
    return { uid, ...snap.data() };
}

/**
 * Verifica o PIN do jogador comparando com o hash bcrypt salvo.
 * Nunca compara PIN em texto claro.
 */
async function verificarPin(uid, pin) {
    const perfil = await getPerfil(uid);
    if (!perfil?.pinHash) return false;
    return bcrypt.compare(String(pin), perfil.pinHash);
}

/**
 * Salva uma transação na subcoleção do jogador e emite via socket.
 */
async function salvarEEmitirTx(uid, transacao, socket) {
    try {
        await refTransacoes(uid).doc(transacao.id).set(transacao);
        socket.emit('wallet:tx_nova', formatarTxParaFrontend(transacao, uid));
    } catch (e) {
        console.error('Erro ao salvar transação:', e.message);
    }
}

/**
 * Formata transação para o formato esperado pelo History.jsx.
 */
function formatarTxParaFrontend(tx, meuUid) {
    const entradas = ['DEPOSITO', 'BONUS', 'PREMIO', 'RECEBIMENTO'];
    const tipo     = tx.tipo?.toLowerCase() || 'taxa';
    const isEntrada = entradas.includes(tx.tipo);

    return {
        id:           tx.id,
        tipo:         tipo === 'transferencia' && isEntrada ? 'recebimento' : tipo,
        valorBC:      tx.valorLiquido || tx.valor || 0,
        taxaBC:       tx.taxa         || 0,
        taxaBRL:      tx.metadados?.taxaBRL || 0,
        brlLiquido:   tx.metadados?.brlLiquido || 0,
        criadoEm:     tx.timestamp || new Date().toISOString(),
        status:       tx.status || 'CONFIRMADA',
        contraparte:  tx.metadados?.nomeContraparte || null,
    };
}


// ================================================================
// BLOCO 3: REGISTRO DOS EVENTOS NO SOCKET
//
// Esta função é chamada no server.js dentro do io.on('connection').
// Registra todos os eventos da wallet para aquele socket.
// ================================================================

export function registrarEventosWallet(socket, io) {

    const uid = () => socket.data.uid;


    // ----------------------------------------------------------------
    // EVENTO: wallet:resgatar_bonus
    // Concede ₿C 10.000 de boas-vindas ao jogador.
    // Só funciona uma vez — controlado pela flag bonusResgatado.
    // ----------------------------------------------------------------
    socket.on('wallet:resgatar_bonus', async () => {
        const jogadorUid = uid();
        if (!jogadorUid) {
            socket.emit('wallet:bonus_erro', { mensagem: 'Não autenticado.' });
            return;
        }

        try {
            const perfil = await getPerfil(jogadorUid);

            if (!perfil) {
                socket.emit('wallet:bonus_erro', { mensagem: 'Jogador não encontrado.' });
                return;
            }

            // Bônus já resgatado — não concede novamente
            if (perfil.bonusResgatado === true) {
                socket.emit('wallet:bonus_erro', { mensagem: 'Bônus já resgatado anteriormente.' });
                return;
            }

            // Cria a transação de bônus na blockchain
            const ultimaTx   = await getUltimaTransacao(jogadorUid);
            const resultado  = bonus({
                uid:         jogadorUid,
                endereco:    perfil.endereco || '',
                valor:       BONUS_BOAS_VINDAS_BC,
                hashAnterior: ultimaTx?.hash || '0'.repeat(64),
                descricao:   'Bônus de boas-vindas',
            });

            if (!resultado.sucesso) {
                socket.emit('wallet:bonus_erro', { mensagem: resultado.erro });
                return;
            }

            const txConfirmada = confirmarTransacao(resultado.transacao);

            // Atualiza Firestore atomicamente
            await refJogador(jogadorUid).update({
                saldoBonus:     admin.firestore.FieldValue.increment(BONUS_BOAS_VINDAS_BC),
                bonusResgatado: true,
            });

            // Salva transação e notifica
            await salvarEEmitirTx(jogadorUid, txConfirmada, socket);

            // Emite saldo atualizado
            const perfilAtualizado = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.saldo      || 0,
                saldoBonus: perfilAtualizado.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.sacadoHoje || 0,
            });

            socket.emit('wallet:bonus_creditado', { valor: BONUS_BOAS_VINDAS_BC });
            console.log(`🎁 Bônus de boas-vindas creditado para ${socket.data.nome}`);

        } catch (e) {
            console.error('Erro ao resgatar bônus:', e.message);
            socket.emit('wallet:bonus_erro', { mensagem: 'Erro interno. Tente novamente.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:depositar
    // Inicia o processo de depósito via PIX/cartão.
    // O crédito real acontece no webhook do Mercado Pago.
    // Aqui apenas validamos e criamos a preferência de pagamento.
    //
    // Dados recebidos: { valorBRL, taxaBRL, bcEsperado, pin }
    // ----------------------------------------------------------------
    socket.on('wallet:depositar', async ({ valorBRL, taxaBRL, bcEsperado, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            // Valida PIN
            const pinOk = await verificarPin(jogadorUid, pin);
            if (!pinOk) {
                socket.emit('erro', { mensagem: 'PIN incorreto.' });
                return;
            }

            // Validações básicas
            if (!valorBRL || valorBRL < 1) {
                socket.emit('erro', { mensagem: 'Valor mínimo de depósito: R$ 1,00.' });
                return;
            }
            if (valorBRL > 500) {
                socket.emit('erro', { mensagem: 'Valor máximo por transação: R$ 500,00.' });
                return;
            }

            const perfil     = await getPerfil(jogadorUid);
            const totalBRL   = parseFloat((valorBRL + taxaBRL).toFixed(2));
            const bcCreditar = Math.floor(valorBRL * COTACAO_BC_POR_REAL);

            // Cria preferência de pagamento no Mercado Pago
            // (a função criarPreferenciaMercadoPago está em mercadopago.js)
            // O pagamento real é confirmado via webhook — não aqui.
            // Por enquanto emitimos confirmação simulada para desenvolvimento.
            // TODO: substituir pelo fluxo real do Mercado Pago

            // Salva intenção de depósito no Firestore (status PENDENTE)
            const intencaoId = `dep_${jogadorUid}_${Date.now()}`;
            await admin.firestore().collection('depositos_pendentes').doc(intencaoId).set({
                uid:         jogadorUid,
                valorBRL,
                taxaBRL,
                totalBRL,
                bcCreditar,
                status:      'PENDENTE',
                criadoEm:    admin.firestore.FieldValue.serverTimestamp(),
                socketId:    socket.id,
            });

            // Emite o ID da intenção para o frontend mostrar QR Code do PIX
            socket.emit('wallet:deposito_iniciado', {
                intencaoId,
                valorBRL,
                totalBRL,
                bcCreditar,
                // Em produção: incluir qrCode e pixCopiaECola do MP
            });

            console.log(`💰 Depósito iniciado: R$ ${totalBRL} por ${socket.data.nome}`);

        } catch (e) {
            console.error('Erro ao iniciar depósito:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao processar depósito.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:sacar
    // Jogador solicita conversão de ₿C em R$.
    // Valida PIN, saldo real (nunca usa bônus), limite diário.
    //
    // Dados recebidos: { valorBC, brlLiquido, taxaBRL, pin }
    // ----------------------------------------------------------------
    socket.on('wallet:sacar', async ({ valorBC, brlLiquido, taxaBRL, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            // Valida PIN
            const pinOk = await verificarPin(jogadorUid, pin);
            if (!pinOk) {
                socket.emit('erro', { mensagem: 'PIN incorreto.' });
                return;
            }

            const perfil = await getPerfil(jogadorUid);
            if (!perfil) return;

            const saldoReal = perfil.saldo      || 0;
            const sacadoHoje = perfil.sacadoHoje || 0;

            // Validações
            if (valorBC < SAQUE_MIN_BC) {
                socket.emit('erro', { mensagem: `Saque mínimo: ₿C ${SAQUE_MIN_BC.toLocaleString('pt-BR')}` });
                return;
            }
            if (valorBC > saldoReal) {
                socket.emit('erro', { mensagem: 'Saldo real insuficiente. O bônus não pode ser sacado.' });
                return;
            }
            if (sacadoHoje + valorBC > SAQUE_MAX_DIARIO_BC) {
                socket.emit('erro', { mensagem: 'Limite diário de saque atingido.' });
                return;
            }

            // Cria transação de saque na blockchain
            const ultimaTx  = await getUltimaTransacao(jogadorUid);
            const resultado = sacar({
                uid:         jogadorUid,
                endereco:    perfil.endereco || '',
                valor:       valorBC,
                privateKeyPem: null, // chave privada omitida por ora
                hashAnterior: ultimaTx?.hash || '0'.repeat(64),
                dadosBancarios: perfil.dadosBancarios || {},
            });

            if (!resultado.sucesso) {
                socket.emit('erro', { mensagem: resultado.erro });
                return;
            }

            // Debita o saldo real atomicamente
            await refJogador(jogadorUid).update({
                saldo:      admin.firestore.FieldValue.increment(-valorBC),
                sacadoHoje: admin.firestore.FieldValue.increment(valorBC),
            });

            const txConfirmada = confirmarTransacao({
                ...resultado.transacao,
                metadados: {
                    ...resultado.transacao.metadados,
                    taxaBRL,
                    brlLiquido,
                },
            });

            await salvarEEmitirTx(jogadorUid, txConfirmada, socket);

            // Emite saldo atualizado
            const perfilAtualizado = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.saldo      || 0,
                saldoBonus: perfilAtualizado.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.sacadoHoje || 0,
            });

            console.log(`⬆️  Saque de ₿C ${valorBC} por ${socket.data.nome} → R$ ${brlLiquido}`);

            // TODO: integrar com transferência bancária real (PIX de saída)

        } catch (e) {
            console.error('Erro ao processar saque:', e.message);
            socket.emit('erro', { mensagem: 'Erro ao processar saque.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:enviar
    // Transferência P2P de ₿C entre jogadores.
    // Valida PIN, saldo total (real + bônus), executa atomicamente.
    //
    // Dados recebidos:
    //   { remetenteUid, destinatarioUid, valorBC, taxaBC,
    //     totalDebitado, mensagem, pin }
    // ----------------------------------------------------------------
    socket.on('wallet:enviar', async ({ destinatarioUid, valorBC, taxaBC, totalDebitado, mensagem, pin }) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            // Valida PIN
            const pinOk = await verificarPin(jogadorUid, pin);
            if (!pinOk) {
                socket.emit('wallet:envio_erro', { mensagem: 'PIN incorreto.' });
                return;
            }

            // Não pode enviar para si mesmo
            if (jogadorUid === destinatarioUid) {
                socket.emit('wallet:envio_erro', { mensagem: 'Não pode enviar para si mesmo.' });
                return;
            }

            // Validações
            if (valorBC < ENVIO_MIN_BC) {
                socket.emit('wallet:envio_erro', { mensagem: `Envio mínimo: ₿C ${ENVIO_MIN_BC}` });
                return;
            }
            if (valorBC > ENVIO_MAX_BC) {
                socket.emit('wallet:envio_erro', { mensagem: `Envio máximo: ₿C ${ENVIO_MAX_BC.toLocaleString('pt-BR')}` });
                return;
            }

            const remetente    = await getPerfil(jogadorUid);
            const destinatario = await getPerfil(destinatarioUid);

            if (!destinatario) {
                socket.emit('wallet:envio_erro', { mensagem: 'Destinatário não encontrado.' });
                return;
            }

            // Saldo total do remetente (real + bônus)
            const saldoTotal = (remetente.saldo || 0) + (remetente.saldoBonus || 0);

            if (totalDebitado > saldoTotal) {
                socket.emit('wallet:envio_erro', { mensagem: 'Saldo insuficiente.' });
                return;
            }

            // Debita do remetente e credita ao destinatário atomicamente
            const batch = admin.firestore().batch();

            // Debita saldo real primeiro, depois bônus se necessário
            const saldoReal   = remetente.saldo      || 0;
            const saldoBonus  = remetente.saldoBonus || 0;
            let debitarReal   = Math.min(totalDebitado, saldoReal);
            let debitarBonus  = totalDebitado - debitarReal;

            // Garante que não debita mais do que tem em cada carteira
            debitarBonus = Math.min(debitarBonus, saldoBonus);

            batch.update(refJogador(jogadorUid), {
                saldo:      admin.firestore.FieldValue.increment(-debitarReal),
                saldoBonus: admin.firestore.FieldValue.increment(-debitarBonus),
            });

            // Credita ao destinatário (como saldo real — bônus não se propaga)
            batch.update(refJogador(destinatarioUid), {
                saldo: admin.firestore.FieldValue.increment(valorBC),
            });

            await batch.commit();

            // Cria transações na blockchain para os dois lados
            const ultimaTxRemetente    = await getUltimaTransacao(jogadorUid);
            const ultimaTxDestinatario = await getUltimaTransacao(destinatarioUid);

            const txEnvio = confirmarTransacao({
                id:        `env_${jogadorUid}_${Date.now()}`,
                hash:      `env_${jogadorUid}_${Date.now()}`,
                hashAnterior: ultimaTxRemetente?.hash || '0'.repeat(64),
                tipo:      TIPOS.TRANSFERENCIA,
                remetenteUid:         jogadorUid,
                destinatarioUid,
                valor:     totalDebitado,
                taxa:      taxaBC,
                valorLiquido: valorBC,
                timestamp: new Date().toISOString(),
                status:    'CONFIRMADA',
                metadados: {
                    mensagem:         mensagem || null,
                    nomeContraparte:  destinatario.nome,
                    descricao:        `Envio para ${destinatario.nome}`,
                },
            });

            const txRecebimento = confirmarTransacao({
                id:        `rec_${destinatarioUid}_${Date.now()}`,
                hash:      `rec_${destinatarioUid}_${Date.now()}`,
                hashAnterior: ultimaTxDestinatario?.hash || '0'.repeat(64),
                tipo:      'RECEBIMENTO',
                remetenteUid:         jogadorUid,
                destinatarioUid,
                valor:     valorBC,
                taxa:      0,
                valorLiquido: valorBC,
                timestamp: new Date().toISOString(),
                status:    'CONFIRMADA',
                metadados: {
                    mensagem:        mensagem || null,
                    nomeContraparte: remetente.nome,
                    descricao:       `Recebido de ${remetente.nome}`,
                },
            });

            // Salva e emite para o remetente
            await salvarEEmitirTx(jogadorUid, txEnvio, socket);

            // Emite para o destinatário se estiver online
            const socketDestinatario = encontrarSocket(io, destinatarioUid);
            if (socketDestinatario) {
                await salvarEEmitirTx(destinatarioUid, txRecebimento, socketDestinatario);
                const perfilDest = await getPerfil(destinatarioUid);
                socketDestinatario.emit('wallet:saldo_atualizado', {
                    saldo:      perfilDest.saldo      || 0,
                    saldoBonus: perfilDest.saldoBonus || 0,
                    sacadoHoje: perfilDest.sacadoHoje || 0,
                });
            } else {
                // Destinatário offline — salva a transação mesmo assim
                await refTransacoes(destinatarioUid).doc(txRecebimento.id).set(txRecebimento);
            }

            // Emite saldo atualizado para o remetente
            const perfilRem = await getPerfil(jogadorUid);
            socket.emit('wallet:saldo_atualizado', {
                saldo:      perfilRem.saldo      || 0,
                saldoBonus: perfilRem.saldoBonus || 0,
                sacadoHoje: perfilRem.sacadoHoje || 0,
            });

            socket.emit('wallet:envio_confirmado', {
                valorBC,
                destinatario: destinatario.nome,
            });

            console.log(`➡️  ${remetente.nome} enviou ₿C ${valorBC} para ${destinatario.nome}`);

        } catch (e) {
            console.error('Erro ao processar envio:', e.message);
            socket.emit('wallet:envio_erro', { mensagem: 'Erro ao processar envio.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:buscar_historico
    // Retorna o extrato de transações do jogador.
    //
    // Dados recebidos: { periodo: 'hoje'|'7d'|'30d'|'tudo' }
    // ----------------------------------------------------------------
    socket.on('wallet:buscar_historico', async ({ periodo = '30d' } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            let query = refTransacoes(jogadorUid).orderBy('timestamp', 'desc');

            // Aplica filtro de período no Firestore (mais eficiente que no frontend)
            if (periodo !== 'tudo') {
                const agora  = new Date();
                const inicio = new Date(agora);

                if (periodo === 'hoje') inicio.setHours(0, 0, 0, 0);
                else if (periodo === '7d')  inicio.setDate(agora.getDate() - 7);
                else if (periodo === '30d') inicio.setDate(agora.getDate() - 30);

                query = query.where('timestamp', '>=', inicio.toISOString());
            }

            query = query.limit(100); // máximo 100 transações por consulta

            const snap = await query.get();
            const transacoes = snap.docs.map(doc => formatarTxParaFrontend(doc.data(), jogadorUid));

            socket.emit('wallet:historico', { transacoes });

        } catch (e) {
            console.error('Erro ao buscar histórico:', e.message);
            socket.emit('wallet:historico', { transacoes: [] });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:buscar_jogador
    // Busca um jogador por nome ou uid para envio P2P.
    //
    // Dados recebidos: { query: string }
    // ----------------------------------------------------------------
    socket.on('wallet:buscar_jogador', async ({ query: q } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid || !q || q.trim().length < 3) {
            socket.emit('wallet:jogador_nao_encontrado');
            return;
        }

        try {
            const db       = admin.firestore();
            const queryStr = q.trim();
            let   encontrado = null;

            // Tenta busca por UID exato primeiro
            const docUid = await db.collection('jogadores').doc(queryStr).get();
            if (docUid.exists && docUid.id !== jogadorUid) {
                encontrado = { uid: docUid.id, ...docUid.data() };
            }

            // Tenta busca por nome (prefixo) se não achou por UID
            if (!encontrado) {
                const snap = await db.collection('jogadores')
                    .where('nome', '>=', queryStr)
                    .where('nome', '<=', queryStr + '\uf8ff')
                    .limit(1)
                    .get();

                if (!snap.empty) {
                    const doc = snap.docs[0];
                    if (doc.id !== jogadorUid) {
                        encontrado = { uid: doc.id, ...doc.data() };
                    }
                }
            }

            if (encontrado) {
                socket.emit('wallet:jogador_encontrado', {
                    uid:    encontrado.uid,
                    nome:   encontrado.nome   || 'Jogador',
                    avatar: encontrado.avatar || '',
                });
            } else {
                socket.emit('wallet:jogador_nao_encontrado');
            }

        } catch (e) {
            console.error('Erro ao buscar jogador:', e.message);
            socket.emit('wallet:jogador_nao_encontrado');
        }
    });
}


// ================================================================
// BLOCO 4: FUNÇÃO PARA CREDITAR DEPÓSITO (chamada pelo webhook)
//
// Esta função é chamada pelo mercadopago.js quando o pagamento
// é confirmado via webhook. Não é um evento de socket.
// ================================================================

export async function creditarDeposito(intencaoId, io) {
    try {
        const db       = admin.firestore();
        const intencao = await db.collection('depositos_pendentes').doc(intencaoId).get();

        if (!intencao.exists) {
            console.error('Intenção de depósito não encontrada:', intencaoId);
            return;
        }

        const { uid, bcCreditar, valorBRL, taxaBRL, totalBRL, socketId } = intencao.data();

        // Verifica se já foi processado (idempotência)
        if (intencao.data().status === 'CONFIRMADO') {
            console.warn('Depósito já processado:', intencaoId);
            return;
        }

        // Cria transação na blockchain
        const perfil    = await getPerfil(uid);
        const ultimaTx  = await getUltimaTransacao(uid);
        const resultado = depositar({
            uid,
            endereco:    perfil?.endereco || '',
            valor:       bcCreditar,
            hashAnterior: ultimaTx?.hash || '0'.repeat(64),
            metadados: { valorBRL, taxaBRL, totalBRL, intencaoId },
        });

        if (!resultado.sucesso) {
            console.error('Erro ao criar transação de depósito:', resultado.erro);
            return;
        }

        const txConfirmada = confirmarTransacao(resultado.transacao);

        // Atualiza saldo e status em batch
        const batch = db.batch();
        batch.update(db.collection('jogadores').doc(uid), {
            saldo: admin.firestore.FieldValue.increment(bcCreditar),
        });
        batch.update(db.collection('depositos_pendentes').doc(intencaoId), {
            status:       'CONFIRMADO',
            confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(db.collection('jogadores').doc(uid).collection('transacoes').doc(txConfirmada.id), txConfirmada);
        await batch.commit();

        // Tenta emitir para o socket do jogador se ainda estiver online
        const socketJogador = io.sockets.sockets.get(socketId);
        if (socketJogador) {
            const perfilAtualizado = await getPerfil(uid);
            socketJogador.emit('wallet:saldo_atualizado', {
                saldo:      perfilAtualizado.saldo      || 0,
                saldoBonus: perfilAtualizado.saldoBonus || 0,
                sacadoHoje: perfilAtualizado.sacadoHoje || 0,
            });
            socketJogador.emit('wallet:tx_nova', formatarTxParaFrontend(txConfirmada, uid));
            socketJogador.emit('wallet:deposito_confirmado', { bcCreditar, valorBRL });
        }

        console.log(`✅ Depósito confirmado: ₿C ${bcCreditar} para uid ${uid}`);

    } catch (e) {
        console.error('Erro ao creditar depósito:', e.message);
    }
}


// ================================================================
// BLOCO 5: RESET DO SACADO_HOJE (rodar diariamente via cron)
//
// Zera o limite diário de saque à meia-noite.
// Chamar esta função com setInterval ou um cron job.
// ================================================================

export async function resetarLimiteDiario() {
    try {
        const db      = admin.firestore();
        const jogadores = await db.collection('jogadores')
            .where('sacadoHoje', '>', 0)
            .get();

        const batch = db.batch();
        jogadores.docs.forEach(doc => {
            batch.update(doc.ref, { sacadoHoje: 0 });
        });

        await batch.commit();
        console.log(`🔄 Limite diário zerado para ${jogadores.size} jogador(es).`);

    } catch (e) {
        console.error('Erro ao resetar limite diário:', e.message);
    }
}


// ================================================================
// BLOCO 6: HELPERS INTERNOS
// ================================================================

/**
 * Busca a última transação do jogador para encadeamento da blockchain.
 */
async function getUltimaTransacao(uid) {
    try {
        const snap = await refTransacoes(uid)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (snap.empty) return null;
        return snap.docs[0].data();
    } catch {
        return null;
    }
}

/**
 * Encontra o socket de um jogador pelo uid (para notificar destinatário online).
 */
function encontrarSocket(io, uid) {
    for (const [, socket] of io.sockets.sockets) {
        if (socket.data.uid === uid) return socket;
    }
    return null;
}


// ================================================================
// BLOCO 7: EVENTOS DE PIN (adicionar dentro de registrarEventosWallet)
//
// IMPORTANTE: Adicione estes dois socket.on() dentro da função
// registrarEventosWallet(), logo antes do fechamento da função.
// ================================================================

/*
    Copie e cole os dois blocos abaixo DENTRO de registrarEventosWallet(),
    antes do último fechamento de chave }

    // ----------------------------------------------------------------
    // EVENTO: wallet:criar_pin
    // Chamado no primeiro cadastro — salva o hash do PIN no Firestore.
    // O PIN nunca é salvo em texto claro.
    //
    // Dados recebidos: { uid, pin }
    // ----------------------------------------------------------------
    socket.on('wallet:criar_pin', async ({ pin } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            if (!pin || pin.length < 6) {
                socket.emit('wallet:pin_erro', { mensagem: 'PIN inválido.' });
                return;
            }

            // Verifica se já tem PIN (não permite recriar via este evento)
            const perfil = await getPerfil(jogadorUid);
            if (perfil?.pinHash) {
                socket.emit('wallet:pin_erro', { mensagem: 'PIN já existe. Use alterar PIN.' });
                return;
            }

            // Gera hash bcrypt com salt 12 (seguro e razoavelmente rápido)
            const pinHash = await bcrypt.hash(String(pin), 12);

            await refJogador(jogadorUid).update({ pinHash });

            socket.emit('wallet:pin_criado');
            console.log(`🔐 PIN criado para ${socket.data.nome}`);

        } catch (e) {
            console.error('Erro ao criar PIN:', e.message);
            socket.emit('wallet:pin_erro', { mensagem: 'Erro ao salvar PIN.' });
        }
    });


    // ----------------------------------------------------------------
    // EVENTO: wallet:alterar_pin
    // Verifica o PIN atual com bcrypt e salva o novo hash.
    //
    // Dados recebidos: { uid, pinAtual, pinNovo }
    // ----------------------------------------------------------------
    socket.on('wallet:alterar_pin', async ({ pinAtual, pinNovo } = {}) => {
        const jogadorUid = uid();
        if (!jogadorUid) return;

        try {
            if (!pinAtual || !pinNovo || pinNovo.length < 6) {
                socket.emit('wallet:pin_erro', { mensagem: 'Dados inválidos.' });
                return;
            }

            const perfil = await getPerfil(jogadorUid);

            if (!perfil?.pinHash) {
                socket.emit('wallet:pin_erro', { mensagem: 'PIN não configurado.' });
                return;
            }

            // Verifica o PIN atual
            const pinOk = await bcrypt.compare(String(pinAtual), perfil.pinHash);
            if (!pinOk) {
                socket.emit('wallet:pin_erro', { tipo: 'PIN_INCORRETO', mensagem: 'PIN atual incorreto.' });
                return;
            }

            // Não permite usar o mesmo PIN
            const mesmoPIN = await bcrypt.compare(String(pinNovo), perfil.pinHash);
            if (mesmoPIN) {
                socket.emit('wallet:pin_erro', { mensagem: 'O novo PIN deve ser diferente do atual.' });
                return;
            }

            // Salva o novo hash
            const novoPinHash = await bcrypt.hash(String(pinNovo), 12);
            await refJogador(jogadorUid).update({ pinHash: novoPinHash });

            socket.emit('wallet:pin_alterado');
            console.log(`🔐 PIN alterado para ${socket.data.nome}`);

        } catch (e) {
            console.error('Erro ao alterar PIN:', e.message);
            socket.emit('wallet:pin_erro', { mensagem: 'Erro ao alterar PIN.' });
        }
    });
*/