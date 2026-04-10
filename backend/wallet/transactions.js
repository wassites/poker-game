/* ================================================================
   ARQUIVO: backend/wallet/transactions.js

   CONCEITO GERAL:
   Gerencia todas as movimentações de ₿C (Bitchager).
   Cada transação é:
     → Assinada digitalmente pelo remetente
     → Encadeada com a transação anterior (como blockchain)
     → Imutável após confirmada

   TIPOS DE TRANSAÇÃO:
     DEPOSITO      → jogador compra ₿C com dinheiro real
     SAQUE         → jogador converte ₿C em dinheiro real (futuro)
     TRANSFERENCIA → jogador envia ₿C para outro jogador
     PREMIO        → sistema recompensa vitória em partida
     TAXA_MESA     → custo para criar uma mesa
     BONUS         → bônus promocional do sistema

   ENCADEAMENTO (base da blockchain):
   Cada transação contém o hash da transação anterior.
   Se alguém tentar alterar uma transação antiga:
     → O hash dela muda
     → O hashAnterior da próxima não bate mais
     → Toda a cadeia posterior fica inválida
   Isso torna o histórico à prova de adulteração.
================================================================ */

import crypto from 'crypto';
import { assinarTransacao, verificarAssinatura, validarEndereco } from './wallet.js';


// ================================================================
// BLOCO 1: TIPOS E TAXAS
// ================================================================

export const TIPOS = {
    DEPOSITO:      'DEPOSITO',
    SAQUE:         'SAQUE',
    TRANSFERENCIA: 'TRANSFERENCIA',
    PREMIO:        'PREMIO',
    TAXA_MESA:     'TAXA_MESA',
    BONUS:         'BONUS',
};

export const TAXAS = {
    TRANSFERENCIA: 0.01,  // 1% da transferência
    SAQUE:         0.02,  // 2% do saque
    DEPOSITO:      0,
    PREMIO:        0,
    TAXA_MESA:     0,
    BONUS:         0,
};

const LIMITES = {
    TRANSFERENCIA_MIN: 10,
    TRANSFERENCIA_MAX: 1000000,
    SAQUE_MIN:         100,
};

// Endereços especiais do sistema
// MINT   = cria novas moedas (depósito, bônus, prêmio)
// BURN   = destrói moedas (saque convertido)
// FEE    = coleta taxas da plataforma
// REWARD = distribui prêmios de partidas
export const ENDERECOS_SISTEMA = {
    MINT:   'BC_SISTEMA_MINT_000000000000',
    BURN:   'BC_SISTEMA_BURN_000000000000',
    FEE:    'BC_SISTEMA_FEE_0000000000000',
    REWARD: 'BC_SISTEMA_REWARD_00000000000',
};


// ================================================================
// BLOCO 2: HASH DA TRANSAÇÃO
//
// Gera o ID único e imutável de cada transação.
// Inclui o hashAnterior para criar o encadeamento da blockchain.
//
// JSON com chaves ordenadas:
//   Garante que o mesmo objeto sempre gere o mesmo hash,
//   independente da ordem em que as propriedades foram definidas.
//   { b:2, a:1 } e { a:1, b:2 } → mesmo resultado após sort().
//   Sem isso, a mesma transação poderia ter hashes diferentes
//   em servidores diferentes — quebraria a verificação da cadeia.
// ================================================================

export function gerarHashTransacao(dados, hashAnterior = '0'.repeat(64)) {
    const payload = { ...dados, hashAnterior };

    const payloadStr = JSON.stringify(
        payload,
        Object.keys(payload).sort()
    );

    return crypto
        .createHash('sha256')
        .update(payloadStr)
        .digest('hex');
}


// ================================================================
// BLOCO 3: CRIAÇÃO DE TRANSAÇÃO
//
// Função central que valida, monta e assina qualquer transação.
// Todas as operações específicas (depositar, transferir, etc.)
// chamam esta função internamente.
//
// Fluxo:
//   1. Valida os parâmetros
//   2. Calcula taxa e valor líquido
//   3. Gera hash encadeado
//   4. Assina com chave privada do remetente
//   5. Retorna transação completa com status PENDENTE
// ================================================================

export function criarTransacao({
    tipo,
    remetenteUid,
    remetenteEndereco,
    destinatarioEndereco,
    valor,
    privateKeyPem  = null,
    hashAnterior   = '0'.repeat(64),
    metadados      = {},
}) {

    // ---- Validações ----

    if (!Object.values(TIPOS).includes(tipo)) {
        return { sucesso: false, erro: `Tipo inválido: ${tipo}` };
    }

    if (!valor || valor <= 0) {
        return { sucesso: false, erro: 'Valor deve ser maior que zero.' };
    }

    if (tipo === TIPOS.TRANSFERENCIA) {
        if (valor < LIMITES.TRANSFERENCIA_MIN) {
            return { sucesso: false, erro: `Mínimo: ₿C ${LIMITES.TRANSFERENCIA_MIN}` };
        }
        if (valor > LIMITES.TRANSFERENCIA_MAX) {
            return { sucesso: false, erro: `Máximo: ₿C ${LIMITES.TRANSFERENCIA_MAX}` };
        }
        if (!validarEndereco(destinatarioEndereco)) {
            return { sucesso: false, erro: 'Endereço de destino inválido.' };
        }
        if (remetenteEndereco === destinatarioEndereco) {
            return { sucesso: false, erro: 'Não pode transferir para si mesmo.' };
        }
    }

    if (tipo === TIPOS.SAQUE && valor < LIMITES.SAQUE_MIN) {
        return { sucesso: false, erro: `Saque mínimo: ₿C ${LIMITES.SAQUE_MIN}` };
    }

    // ---- Cálculo dos valores ----

    // taxa: percentual cobrado sobre o valor bruto
    // valorLiquido: o que o destinatário realmente recebe
    // Exemplo: transferência de 1000 ₿C com taxa de 1%
    //   → taxa = 10 ₿C
    //   → valorLiquido = 990 ₿C
    //   → remetente perde 1000, destinatário recebe 990, sistema fica com 10
    const taxaPercent  = TAXAS[tipo] || 0;
    const taxa         = Math.floor(valor * taxaPercent);
    const valorLiquido = valor - taxa;
    const timestamp    = new Date().toISOString();

    // ---- Dados da transação ----

    const dados = {
        tipo,
        remetenteUid,
        remetenteEndereco,
        destinatarioEndereco: destinatarioEndereco || null,
        valor,
        taxa,
        valorLiquido,
        timestamp,
        metadados,
    };

    // ---- Hash encadeado ----

    // O hash inclui hashAnterior → cria a corrente de transações
    const hash = gerarHashTransacao(dados, hashAnterior);

    // ---- Assinatura digital ----

    // Assina { dados + hash } com a chave privada
    // Incluir o hash na assinatura amarra os dados ao encadeamento
    let assinatura = null;
    if (privateKeyPem) {
        assinatura = assinarTransacao({ ...dados, hash }, privateKeyPem);
    }

    // ---- Transação completa ----

    // status PENDENTE → aguarda validação de saldo e gravação no banco
    // Só vira CONFIRMADA após salvarmos no Supabase com sucesso
    const transacao = {
        id:           hash,
        hash,
        hashAnterior,
        assinatura,
        status:       'PENDENTE',
        confirmadaEm: null,
        ...dados,
    };

    return { sucesso: true, transacao };
}


// ================================================================
// BLOCO 4: CONFIRMAÇÃO E FALHA
//
// Mudam o status após tentar gravar no banco.
// Sempre crie novas cópias — nunca mutamos a transação original.
// (Imutabilidade é fundamental para auditoria correta)
// ================================================================

export function confirmarTransacao(transacao) {
    // Spread cria nova cópia — a original permanece intacta
    return {
        ...transacao,
        status:       'CONFIRMADA',
        confirmadaEm: new Date().toISOString(),
    };
}

export function falharTransacao(transacao, motivo) {
    return {
        ...transacao,
        status:      'FALHA',
        falhaEm:     new Date().toISOString(),
        motivoFalha: motivo,
    };
}


// ================================================================
// BLOCO 5: OPERAÇÕES ESPECÍFICAS
//
// Funções de conveniência para cada tipo de transação.
// Chamam criarTransacao com os parâmetros corretos.
// Evitam repetição e garantem consistência.
// ================================================================

// Jogador compra ₿C com dinheiro real
// Chamada APÓS confirmação do gateway de pagamento (Stripe/PIX)
export function depositar({ uid, endereco, valor, hashAnterior, metadados = {} }) {
    return criarTransacao({
        tipo:                 TIPOS.DEPOSITO,
        remetenteUid:         'SISTEMA',
        remetenteEndereco:    ENDERECOS_SISTEMA.MINT,
        destinatarioEndereco: endereco,
        valor,
        privateKeyPem:        null,
        hashAnterior,
        metadados: {
            ...metadados,
            descricao: `Compra de ₿C ${valor.toLocaleString('pt-BR')}`,
        },
    });
}

// Envia ₿C de um jogador para outro
// privateKeyPem deve ser decifrada com a senha do jogador
// e descartada logo após usar — nunca persistir decifrada
export function transferir({
    remetenteUid,
    remetenteEndereco,
    destinatarioEndereco,
    valor,
    privateKeyPem,
    hashAnterior,
    metadados = {},
}) {
    return criarTransacao({
        tipo: TIPOS.TRANSFERENCIA,
        remetenteUid,
        remetenteEndereco,
        destinatarioEndereco,
        valor,
        privateKeyPem,
        hashAnterior,
        metadados: {
            ...metadados,
            descricao: `Transferência de ₿C ${valor.toLocaleString('pt-BR')}`,
        },
    });
}

// Solicita conversão de ₿C em dinheiro real
// Cria transação PENDENTE para aprovação do admin
// O ₿C vai para o endereço BURN (destruído) ao confirmar
export function sacar({ uid, endereco, valor, privateKeyPem, hashAnterior, dadosBancarios = {} }) {
    return criarTransacao({
        tipo:              TIPOS.SAQUE,
        remetenteUid:      uid,
        remetenteEndereco: endereco,
        destinatarioEndereco: ENDERECOS_SISTEMA.BURN,
        valor,
        privateKeyPem,
        hashAnterior,
        metadados: {
            dadosBancarios,
            descricao:       `Saque de ₿C ${valor.toLocaleString('pt-BR')}`,
            statusPagamento: 'AGUARDANDO_PROCESSAMENTO',
        },
    });
}

// Sistema premia vitória em partida
// Chamada pelo game-manager.js após o showdown
export function premiar({ uid, endereco, valor, mesaId, hashAnterior }) {
    return criarTransacao({
        tipo:                 TIPOS.PREMIO,
        remetenteUid:         'SISTEMA',
        remetenteEndereco:    ENDERECOS_SISTEMA.REWARD,
        destinatarioEndereco: endereco,
        valor,
        privateKeyPem:        null,
        hashAnterior,
        metadados: {
            mesaId,
            descricao: `Prêmio de vitória: ₿C ${valor.toLocaleString('pt-BR')}`,
        },
    });
}

// Debita ₿C ao criar uma mesa
export function cobrarTaxaMesa({ uid, endereco, valor, privateKeyPem, hashAnterior }) {
    return criarTransacao({
        tipo:              TIPOS.TAXA_MESA,
        remetenteUid:      uid,
        remetenteEndereco: endereco,
        destinatarioEndereco: ENDERECOS_SISTEMA.FEE,
        valor,
        privateKeyPem,
        hashAnterior,
        metadados: {
            descricao: `Taxa de criação de mesa: ₿C ${valor}`,
        },
    });
}

// Concede bônus promocional
export function bonus({ uid, endereco, valor, hashAnterior, descricao = 'Bônus' }) {
    return criarTransacao({
        tipo:                 TIPOS.BONUS,
        remetenteUid:         'SISTEMA',
        remetenteEndereco:    ENDERECOS_SISTEMA.MINT,
        destinatarioEndereco: endereco,
        valor,
        privateKeyPem:        null,
        hashAnterior,
        metadados: { descricao },
    });
}


// ================================================================
// BLOCO 6: VERIFICAÇÃO E AUDITORIA
// ================================================================

// Verifica se uma transação individual é autêntica
// Recalcula o hash e verifica a assinatura digital
export function verificarTransacao(transacao, publicKeyPem = null) {
    const {
        id, hash, hashAnterior, assinatura,
        status, confirmadaEm, falhaEm, motivoFalha,
        ...dados
    } = transacao;

    // Recalcula o hash e compara
    const hashCalculado = gerarHashTransacao(dados, hashAnterior);

    if (hashCalculado !== hash) {
        return {
            valida:  false,
            motivo: `Hash não confere. Esperado: ${hash.slice(0,8)}... Calculado: ${hashCalculado.slice(0,8)}...`,
        };
    }

    // Verifica a assinatura digital se houver
    if (assinatura && publicKeyPem) {
        const valida = verificarAssinatura(
            { ...dados, hash },
            assinatura,
            publicKeyPem
        );
        if (!valida) {
            return { valida: false, motivo: 'Assinatura digital inválida.' };
        }
    }

    return { valida: true };
}

// Verifica a integridade de toda a cadeia de transações
// Esta é a verificação fundamental de qualquer blockchain:
//   hashAnterior[i] deve ser igual ao hash[i-1] para todo i > 0
export function verificarCadeia(transacoes) {
    if (!transacoes || transacoes.length === 0) {
        return { valida: true, total: 0 };
    }

    for (let i = 1; i < transacoes.length; i++) {
        const atual    = transacoes[i];
        const anterior = transacoes[i - 1];

        if (atual.hashAnterior !== anterior.hash) {
            return {
                valida:  false,
                indice:  i,
                motivo:  `Cadeia quebrada na transação ${i}.`,
                detalhe: {
                    esperado:   anterior.hash.slice(0, 16) + '...',
                    encontrado: atual.hashAnterior.slice(0, 16) + '...',
                },
            };
        }
    }

    return { valida: true, total: transacoes.length };
}


// ================================================================
// BLOCO 7: FORMATAÇÃO DO HISTÓRICO
//
// Transforma dados técnicos em informação legível para o frontend.
// O componente History.jsx usa esta função para exibir
// as transações na carteira do jogador.
// ================================================================

export function formatarHistorico(transacoes, meuEndereco) {
    return transacoes.map(t => {

        // ENTRADA: recebi ₿C | SAIDA: enviei ₿C
        const direcao = t.destinatarioEndereco === meuEndereco
            ? 'ENTRADA'
            : 'SAIDA';

        // Valor que realmente afetou meu saldo
        // ENTRADA: recebi o valorLiquido (após taxa)
        // SAIDA:   perdi o valor bruto (inclui taxa)
        const valorExibido = direcao === 'ENTRADA'
            ? t.valorLiquido
            : -(t.valor);

        // Ícone visual por tipo
        const icones = {
            DEPOSITO:      '💰',
            SAQUE:         '🏦',
            TRANSFERENCIA: direcao === 'ENTRADA' ? '📥' : '📤',
            PREMIO:        '🏆',
            TAXA_MESA:     '🃏',
            BONUS:         '🎁',
        };

        // Abrevia endereço: "BC1234...5678"
        const outraParte = direcao === 'ENTRADA'
            ? t.remetenteEndereco
            : t.destinatarioEndereco;

        const enderecoAbreviado = outraParte
            ? outraParte.slice(0, 6) + '...' + outraParte.slice(-4)
            : '—';

        return {
            id:           t.id.slice(0, 8) + '...',
            idCompleto:   t.id,
            tipo:         t.tipo,
            direcao,
            valor:        valorExibido,
            taxa:         t.taxa,
            valorLiquido: t.valorLiquido,
            icone:        icones[t.tipo] || '💸',
            descricao:    t.metadados?.descricao || t.tipo,
            outraParte:   enderecoAbreviado,
            data:         new Date(t.timestamp).toLocaleString('pt-BR'),
            dataISO:      t.timestamp,
            status:       t.status,
            confirmadaEm: t.confirmadaEm
                ? new Date(t.confirmadaEm).toLocaleString('pt-BR')
                : null,
        };
    });
}


// ================================================================
// BLOCO 8: CÁLCULO DE SALDO
//
// Reconstrói o saldo de um endereço a partir do histórico.
// Útil para auditoria: deve ser igual ao saldo no banco.
// Se divergir, houve adulteração ou bug na contabilidade.
// ================================================================

export function calcularSaldo(transacoes, meuEndereco) {
    let saldo = 0;

    for (const t of transacoes) {

        // Ignora transações não confirmadas
        if (t.status !== 'CONFIRMADA') continue;

        if (t.destinatarioEndereco === meuEndereco) {
            // Recebi: adiciona o valor líquido (após taxa)
            saldo += t.valorLiquido;
        } else if (t.remetenteEndereco === meuEndereco) {
            // Enviei: subtrai o valor bruto (inclui a taxa)
            saldo -= t.valor;
        }
    }

    // Saldo nunca pode ser negativo em uma carteira honesta
    return Math.max(0, saldo);
}
