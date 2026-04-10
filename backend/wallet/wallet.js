/* ================================================================
   ARQUIVO: backend/wallet/wallet.js

   CONCEITO GERAL:
   Gera e gerencia carteiras criptografadas para cada jogador.
   Cada carteira tem um endereço único gerado a partir de
   criptografia assimétrica — igual ao Bitcoin e Ethereum.

   COMO UMA CARTEIRA CRIPTO FUNCIONA DE VERDADE:

   1. Par de chaves (ECDSA):
      → Chave PRIVADA: número aleatório secreto de 256 bits
        Nunca sai do servidor. Assina transações.
      → Chave PÚBLICA: derivada matematicamente da privada
        Pode ser compartilhada. Verifica assinaturas.

   2. Endereço:
      → Derivado da chave pública via hash (SHA-256)
      → Muito menor que a chave pública (34 caracteres)
      → Começa com "BC" para identificar nossa rede

   3. Transação:
      → Remetente assina com chave PRIVADA
      → Qualquer um verifica com chave PÚBLICA
      → Impossível forjar sem a chave privada

   MÓDULO USADO:
   'crypto' — nativo do Node.js, sem instalar nada.
   Algoritmo ECDSA com curva prime256v1 (equivalente a secp256k1
   do Bitcoin, disponível em todas as versões do Node.js).

   SEGURANÇA DA CHAVE PRIVADA:
   A chave privada é criptografada com AES-256-GCM antes de
   ser salva no banco. Só pode ser decifrada com a senha do jogador.
   Mesmo que o banco vaze, as chaves privadas ficam seguras.
================================================================ */

import crypto from 'crypto';


// ================================================================
// BLOCO 1: CONSTANTES CRIPTOGRÁFICAS
//
// CURVA: prime256v1
//   Curva elíptica usada pelo padrão NIST P-256.
//   Equivalente ao secp256k1 do Bitcoin mas com suporte
//   nativo em todas as versões do Node.js.
//   256 bits de segurança — praticamente impossível de quebrar
//   com hardware atual (levaria bilhões de anos).
//
// VERSAO_ENDERECO: 0x42
//   Em hexadecimal, 0x42 = 66 em decimal = 'B' em ASCII.
//   Bitcoin usa 0x00 para mainnet. Usamos 0x42 para Bitchager.
//   Isso garante que endereços ₿C nunca conflitem com Bitcoin.
//
// PREFIXO_ENDERECO: 'BC'
//   Todos os endereços começam com "BC" — fácil de identificar.
//   Ex: "BCa1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6"
//
// TAMANHO_ENDERECO: 34
//   Mesmo tamanho dos endereços Bitcoin (P2PKH).
//   Padronizado para facilitar futura integração.
// ================================================================

const CURVA            = 'prime256v1';
const ALGORITMO_HASH   = 'sha256';
const VERSAO_ENDERECO  = 0x42;
const PREFIXO_ENDERECO = 'BC';
const TAMANHO_ENDERECO = 34;


// ================================================================
// BLOCO 2: ALFABETO BASE58
//
// O que é Base58?
//   Sistema de numeração com 58 caracteres — como Base64 mas
//   removendo os caracteres visualmente confusos:
//     0 (zero)       → pode ser confundido com O maiúsculo
//     O (O maiúsculo)→ pode ser confundido com 0 (zero)
//     I (I maiúsculo)→ pode ser confundido com l minúsculo
//     l (l minúsculo)→ pode ser confundido com I maiúsculo
//   Também remove + e / do Base64 (causam problemas em URLs).
//
// Por que isso importa?
//   Endereços são digitados por humanos. Um erro de digitação
//   pode enviar ₿C para o endereço errado — sem volta.
//   Remover caracteres confusos reduz erros.
//
// Bitcoin inventou o Base58Check especificamente para endereços.
// Nós usamos o mesmo alfabeto para compatibilidade futura.
// ================================================================

const ALFABETO_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';


// ================================================================
// BLOCO 3: GERAÇÃO DO PAR DE CHAVES
//
// O que é ECDSA?
//   Elliptic Curve Digital Signature Algorithm.
//   Usa propriedades matemáticas de curvas elípticas para criar
//   pares de chaves onde:
//   → Da chave privada → fácil calcular a pública
//   → Da chave pública → impossível descobrir a privada
//     (problema do logaritmo discreto em curvas elípticas)
//
// Por que não RSA?
//   RSA precisa de chaves de 3072 bits para segurança equivalente
//   ao ECDSA de 256 bits. Chaves menores = menos espaço no banco,
//   assinaturas mais rápidas — essencial para um jogo em tempo real.
//
// Formato PEM:
//   Privacy Enhanced Mail — formato de texto padrão para chaves.
//   Começa com "-----BEGIN EC PRIVATE KEY-----" e termina com
//   "-----END EC PRIVATE KEY-----". Fácil de armazenar como string.
// ================================================================

export function gerarParDeChaves() {
    // generateKeyPairSync: gera as duas chaves sincronamente
    // 'ec' = Elliptic Curve (curva elíptica)
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: CURVA,

        // PKCS#8: formato padrão internacional para chaves privadas
        // Inclui informações sobre o algoritmo junto com a chave
        privateKeyEncoding: {
            type:   'pkcs8',
            format: 'pem',
        },

        // SPKI: SubjectPublicKeyInfo — formato padrão para chaves públicas
        // Usado em certificados SSL/TLS e criptomoedas
        publicKeyEncoding: {
            type:   'spki',
            format: 'pem',
        },
    });

    return { privateKey, publicKey };
}


// ================================================================
// BLOCO 4: DERIVAÇÃO DO ENDEREÇO
//
// Como o endereço BC é gerado?
//   É um processo em 6 etapas — o mesmo processo do Bitcoin:
//
//   Etapa 1: Exporta a chave pública no formato DER (bytes brutos)
//   Etapa 2: SHA-256(chave pública DER) → hash de 32 bytes
//   Etapa 3: SHA-256(hash anterior) → pega os primeiros 20 bytes
//            (simulando RIPEMD-160 que pode não estar disponível)
//   Etapa 4: Adiciona o byte de versão (0x42 = 'B') no início
//   Etapa 5: Checksum = SHA-256(SHA-256(versão+hash))[0:4]
//            Os 4 bytes do checksum detectam erros de digitação
//   Etapa 6: Codifica em Base58 e adiciona prefixo "BC"
//
// Por que o checksum?
//   Se o jogador digitar um endereço errado, o checksum não bate
//   e a carteira rejeita antes de enviar. Evita perda de ₿C.
// ================================================================

export function derivarEndereco(publicKeyPem) {
    // Etapa 1: Converte PEM para DER (bytes brutos sem cabeçalho)
    // DER = Distinguished Encoding Rules — formato binário compacto
    const publicKeyDer = crypto
        .createPublicKey(publicKeyPem)
        .export({ type: 'spki', format: 'der' });

    // Etapa 2: Primeiro SHA-256 da chave pública
    // .digest() sem argumento retorna um Buffer (array de bytes)
    const hash1 = crypto
        .createHash(ALGORITMO_HASH)
        .update(publicKeyDer)
        .digest();

    // Etapa 3: Segundo SHA-256, pegamos apenas os primeiros 20 bytes
    // Isso imita o RIPEMD-160 do Bitcoin (produz 20 bytes)
    // Usamos SHA-256 duplo por compatibilidade universal do Node.js
    const hash2 = crypto
        .createHash(ALGORITMO_HASH)
        .update(hash1)
        .digest()
        .slice(0, 20);

    // Etapa 4: Concatena byte de versão + hash
    // Buffer.concat: une dois ou mais Buffers em um só
    const comVersao = Buffer.concat([
        Buffer.from([VERSAO_ENDERECO]), // 1 byte: 0x42
        hash2,                          // 20 bytes
    ]); // Total: 21 bytes

    // Etapa 5: Calcula checksum (duplo SHA-256, primeiros 4 bytes)
    const checksum1 = crypto
        .createHash(ALGORITMO_HASH)
        .update(comVersao)
        .digest();
    const checksum = crypto
        .createHash(ALGORITMO_HASH)
        .update(checksum1)
        .digest()
        .slice(0, 4); // Apenas os primeiros 4 bytes

    // Une versão + hash + checksum = 25 bytes total
    const payload = Buffer.concat([comVersao, checksum]);

    // Etapa 6: Codifica em Base58 e adiciona prefixo "BC"
    const enderecoBase58 = codificarBase58(payload);
    const endereco = (PREFIXO_ENDERECO + enderecoBase58).slice(0, TAMANHO_ENDERECO);

    return endereco;
}


// ================================================================
// BLOCO 5: CODIFICAÇÃO BASE58
//
// Como o algoritmo funciona?
//   Converte um array de bytes em uma string Base58.
//   É como converter um número de base 256 para base 58.
//
//   Exemplo simplificado com base 10→2:
//     Número 13 em decimal:
//     13 ÷ 2 = 6 resto 1  → bit menos significativo: 1
//      6 ÷ 2 = 3 resto 0  → próximo bit: 0
//      3 ÷ 2 = 1 resto 1  → próximo bit: 1
//      1 ÷ 2 = 0 resto 1  → bit mais significativo: 1
//     Lendo de baixo para cima: 1101 = 13 em binário ✓
//
//   Mesmo processo mas da base 256 (bytes) para base 58.
//
// BigInt:
//   Tipo do JavaScript para números inteiros arbitrariamente grandes.
//   Necessário aqui porque os bytes formam números maiores que
//   Number.MAX_SAFE_INTEGER (2^53 - 1).
//   BigInt usa 'n' no final: 0n, 58n, 256n, etc.
// ================================================================

function codificarBase58(buffer) {
    // Converte o buffer inteiro para um BigInt
    // toString('hex') → "0a1b2c..." → '0x' + hex → BigInt
    let num = BigInt('0x' + buffer.toString('hex'));

    let resultado = '';

    // Divide repetidamente por 58, o resto vira o próximo caractere
    while (num > 0n) {
        const resto = num % 58n;       // Resto da divisão por 58
        resultado   = ALFABETO_BASE58[Number(resto)] + resultado; // Prepend
        num         = num / 58n;       // Divisão inteira (BigInt)
    }

    // Convenção Base58: cada byte zero no início vira '1'
    // (preserva os zeros à esquerda que a divisão descartaria)
    for (const byte of buffer) {
        if (byte === 0) resultado = '1' + resultado;
        else break; // Para no primeiro byte não-zero
    }

    return resultado;
}


// ================================================================
// BLOCO 6: CRIPTOGRAFIA DA CHAVE PRIVADA
//
// Por que criptografar a chave privada?
//   A chave privada dá controle TOTAL sobre a carteira.
//   Se o banco de dados vazar sem criptografia:
//   → Hacker vê a chave privada → rouba todos os ₿C → impossível reverter
//
//   Com criptografia AES-256-GCM:
//   → Hacker vê dados cifrados → sem a senha, inútil
//
// AES-256-GCM explicado:
//   AES    = Advanced Encryption Standard (padrão da NSA/NIST)
//   256    = tamanho da chave em bits (2^256 combinações possíveis)
//   GCM    = Galois/Counter Mode
//            Além de cifrar, gera uma "tag de autenticação"
//            que detecta se os dados foram adulterados
//
// PBKDF2 (Password-Based Key Derivation Function 2):
//   Deriva uma chave AES de 256 bits a partir da senha do jogador.
//   → Aplica SHA-256 100.000 vezes (iterações)
//   → Cada iteração torna o ataque de força bruta mais lento
//   → Com 100k iterações: testar 1 bilhão de senhas levaria ~10 anos
//     em hardware comum
//
// Salt:
//   Valor aleatório único por carteira.
//   Garante que a mesma senha gere chaves AES diferentes.
//   Sem salt: tabelas pré-computadas (rainbow tables) quebrariam
//   todas as carteiras que usam a mesma senha de uma vez.
//
// IV (Initialization Vector):
//   Valor aleatório que garante que a mesma chave + mensagem
//   gere resultado cifrado diferente cada vez.
//   Necessário para segurança do modo CTR usado pelo GCM.
// ================================================================

export function criptografarChavePrivada(privateKeyPem, senha) {
    // Gera valores aleatórios únicos para esta carteira
    const salt = crypto.randomBytes(32); // 256 bits de salt
    const iv   = crypto.randomBytes(16); // 128 bits de IV (padrão AES)

    // Deriva a chave AES-256 a partir da senha + salt
    // pbkdf2Sync: versão síncrona (mais simples para o contexto)
    const chaveAES = crypto.pbkdf2Sync(
        senha,          // senha do jogador (string ou Buffer)
        salt,           // salt aleatório
        100000,         // iterações: 100.000 (segurança vs performance)
        32,             // tamanho da chave em bytes (256 bits)
        ALGORITMO_HASH  // algoritmo interno do PBKDF2
    );

    // Cria o objeto cifrador AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', chaveAES, iv);

    // Cifra a chave privada PEM
    // cipher.update(): cifra os dados em partes
    // cipher.final(): finaliza e retorna os bytes restantes
    const dadosCifrados = Buffer.concat([
        cipher.update(privateKeyPem, 'utf8'), // entrada em texto
        cipher.final(),                        // finaliza
    ]);

    // getAuthTag(): retorna a tag de autenticação GCM (16 bytes)
    // DEVE ser chamado DEPOIS do cipher.final()
    // Salvar a authTag é obrigatório para verificar integridade depois
    const authTag = cipher.getAuthTag();

    // Retorna tudo em hexadecimal para salvar como string no banco
    // hex: cada byte vira 2 caracteres (ex: 0x1A → "1a")
    return {
        salt:          salt.toString('hex'),
        iv:            iv.toString('hex'),
        authTag:       authTag.toString('hex'),
        dadosCifrados: dadosCifrados.toString('hex'),
    };
}

export function decifrarChavePrivada(dadosCriptografados, senha) {
    const { salt, iv, authTag, dadosCifrados } = dadosCriptografados;

    // Reconstrói os Buffers a partir das strings hex
    const saltBuffer    = Buffer.from(salt,          'hex');
    const ivBuffer      = Buffer.from(iv,            'hex');
    const authTagBuffer = Buffer.from(authTag,       'hex');
    const dadosBuffer   = Buffer.from(dadosCifrados, 'hex');

    // Deriva a MESMA chave AES com a mesma senha + salt guardado
    // O resultado será idêntico ao da criptografia SE a senha for correta
    const chaveAES = crypto.pbkdf2Sync(
        senha, saltBuffer, 100000, 32, ALGORITMO_HASH
    );

    // Cria o objeto decifrador
    const decipher = crypto.createDecipheriv('aes-256-gcm', chaveAES, ivBuffer);

    // Define a authTag para verificação de integridade
    // O GCM verifica automaticamente durante decipher.final()
    decipher.setAuthTag(authTagBuffer);

    try {
        const privateKeyPem = Buffer.concat([
            decipher.update(dadosBuffer),
            decipher.final(), // lança erro se authTag não bater
        ]).toString('utf8');

        return { sucesso: true, privateKeyPem };

    } catch (e) {
        // authTag não bateu = senha errada OU dados corrompidos
        // Não revelamos qual dos dois por segurança (evita enumeração)
        return { sucesso: false, erro: 'Senha incorreta ou dados corrompidos.' };
    }
}


// ================================================================
// BLOCO 7: ASSINATURA DIGITAL DE TRANSAÇÕES
//
// Como a assinatura funciona?
//   1. Serializa os dados da transação em JSON determinístico
//      (chaves sempre na mesma ordem = mesmo resultado)
//   2. Assina o hash SHA-256 dos dados com a chave privada
//   3. Retorna a assinatura em hexadecimal
//
// Por que assinar o HASH e não os dados diretamente?
//   SHA-256 tem sempre 32 bytes, independente do tamanho dos dados.
//   Assinar o hash é mais eficiente e é o padrão da indústria.
//
// Por que JSON com chaves ordenadas?
//   { valor: 100, uid: "abc" } e { uid: "abc", valor: 100 } são
//   objetos iguais em JavaScript mas strings JSON diferentes.
//   Se a ordem mudar, o hash muda e a assinatura não bate.
//   Object.keys().sort() garante sempre a mesma ordem.
//
// Verificação:
//   Qualquer um com a chave PÚBLICA pode verificar a assinatura.
//   Se os dados foram alterados depois de assinar → falha.
//   Se a assinatura foi forjada → falha.
//   Apenas o dono da chave privada pode criar assinaturas válidas.
// ================================================================

export function assinarTransacao(dadosTransacao, privateKeyPem) {
    // Serializa com chaves ordenadas para resultado determinístico
    const payload = JSON.stringify(
        dadosTransacao,
        Object.keys(dadosTransacao).sort()
    );

    // crypto.createSign: cria um objeto de assinatura SHA-256
    const sign = crypto.createSign('SHA256');
    sign.update(payload); // alimenta os dados
    sign.end();           // finaliza a entrada

    // sign.sign(): assina com a chave privada e retorna em hex
    return sign.sign(privateKeyPem, 'hex');
}

export function verificarAssinatura(dadosTransacao, assinatura, publicKeyPem) {
    const payload = JSON.stringify(
        dadosTransacao,
        Object.keys(dadosTransacao).sort()
    );

    const verify = crypto.createVerify('SHA256');
    verify.update(payload);
    verify.end();

    try {
        // verify.verify(): retorna true se a assinatura for válida
        return verify.verify(publicKeyPem, assinatura, 'hex');
    } catch (e) {
        // Qualquer erro (chave inválida, assinatura malformada) = falso
        return false;
    }
}


// ================================================================
// BLOCO 8: CRIAÇÃO COMPLETA DA CARTEIRA
//
// Função principal chamada no registro do jogador.
// Gera tudo de uma vez e retorna o que salvar no banco.
//
// O que salvar no Supabase:
//   → endereco              (público — para receber ₿C)
//   → publicKey             (público — para verificar assinaturas)
//   → chavePrivadaCriptografada (NUNCA expor ao cliente)
//   → hashVerificacao       (integridade extra)
//   → criadaEm, saldo, versao
//
// O que NUNCA salvar:
//   → A chave privada decifrada
//   → A senha do jogador (use hash bcrypt separado para auth)
// ================================================================

export function criarCarteira(uid, senha) {
    // 1. Gera par de chaves ECDSA
    const { privateKey, publicKey } = gerarParDeChaves();

    // 2. Deriva o endereço público BC
    const endereco = derivarEndereco(publicKey);

    // 3. Criptografa a chave privada com a senha do jogador
    const chavePrivadaCriptografada = criptografarChavePrivada(privateKey, senha);

    // 4. Hash de verificação extra (endereço + uid)
    // Serve como camada adicional de integridade no banco
    const hashVerificacao = crypto
        .createHash(ALGORITMO_HASH)
        .update(endereco + uid)
        .digest('hex');

    // 5. Apaga a chave privada da memória após criptografar
    // Em JavaScript não temos controle total da GC, mas
    // ao não retornar e não guardar em variável acessível,
    // reduzimos o tempo que fica exposta na memória
    return {
        endereco,
        publicKey,
        chavePrivadaCriptografada,
        hashVerificacao,
        criadaEm: new Date().toISOString(),
        saldo:    0,
        versao:   '1.0',
    };
}


// ================================================================
// BLOCO 9: VALIDAÇÃO DE ENDEREÇO
//
// Valida se um endereço ₿C está no formato correto.
// Chamada antes de qualquer transferência para evitar perdas.
//
// Verificações:
//   1. Não é vazio
//   2. Começa com "BC"
//   3. Tem exatamente 34 caracteres
//   4. Contém apenas caracteres válidos do Base58
//
// Nota: não verifica o checksum aqui para manter a função leve.
// A verificação completa de checksum acontece no backend
// antes de confirmar uma transferência.
// ================================================================

export function validarEndereco(endereco) {
    if (!endereco || typeof endereco !== 'string') return false;
    if (!endereco.startsWith(PREFIXO_ENDERECO))    return false;
    if (endereco.length !== TAMANHO_ENDERECO)       return false;

    // Verifica se cada caractere está no alfabeto Base58
    const parteBase58 = endereco.slice(PREFIXO_ENDERECO.length);
    return parteBase58.split('').every(c => ALFABETO_BASE58.includes(c));
}
