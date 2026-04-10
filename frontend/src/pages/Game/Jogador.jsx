/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Jogador.jsx

   CONCEITO GERAL:
   Representa um assento da mesa de poker.
   Cada jogador (humano ou bot) tem um assento com:
     → Avatar com anel colorido (vez, fold, normal)
     → Nome e saldo
     → Cartas (verso para outros, frente para o jogador local)
     → Aposta atual da rodada
     → Badges: Dealer (D), Small Blind (SB), Big Blind (BB)
     → Indicador de vez (timer visual)
     → Status: FOLD, ALL-IN, AGUARDANDO

   ESTADOS DO JOGADOR:
     normal    → aguardando sua vez ou já agiu
     vez       → borda dourada pulsante, é a vez dele
     fold      → opacidade reduzida, cartas viradas
     all-in    → badge vermelho ALL-IN
     souEu     → borda roxa, destaca o jogador local

   CARTAS DO JOGADOR:
     → Jogador local (souEu=true):  recebe cartasPrivadas com os códigos reais
     → Outros jogadores:            mostra o verso (quantidade de cartas)
     → Após showdown:               todos veem as cartas reais

   PROPS:
     jogador       → objeto do jogador { nome, avatar, saldo, aposta, status, cartas }
     uid           → string: id único do jogador
     souEu         → boolean: true se for o jogador local
     ehVez         → boolean: true se for a vez deste jogador
     cartasPrivadas → array: códigos das cartas (só para souEu)
     ehDealer      → boolean: tem o botão D (dealer)
     ehSB          → boolean: tem o badge SB (small blind)
     ehBB          → boolean: tem o badge BB (big blind)
================================================================ */


// ================================================================
// BLOCO 1: CONSTANTES
// ================================================================

const COR_NAIPE = {
    h: '#DC2626', d: '#DC2626',
    s: '#111827', c: '#111827',
};

const SIMBOLO_NAIPE = {
    h: '♥', d: '♦', s: '♠', c: '♣',
};

// Formata número com separador de milhar
function fmt(n) {
    return Number(n || 0).toLocaleString('pt-BR');
}

// Converte código de carta em objeto
function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;
    const naipe = codigo.slice(-1).toLowerCase();
    const valor = codigo.slice(0, -1);
    return {
        codigo,
        valor,
        naipe,
        simbolo: SIMBOLO_NAIPE[naipe] || naipe,
        cor:     COR_NAIPE[naipe]     || '#111827',
    };
}


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL
// ================================================================

export default function Jogador({
    jogador,
    souEu         = false,
    ehVez         = false,
    cartasPrivadas = [],
    ehDealer      = false,
    ehSB          = false,
    ehBB          = false,
}) {
    if (!jogador) return null;

    const foldado  = jogador.status === 'FOLD';
    const allIn    = jogador.status === 'ALL-IN';
    const temAposta = (jogador.aposta || 0) > 0;

    // Cor da borda do assento conforme o estado
    let corBorda = 'rgba(255,255,255,0.12)';
    if (ehVez)  corBorda = '#F59E0B';   // dourado — vez do jogador
    if (souEu)  corBorda = '#7C3AED';   // roxo — jogador local
    if (foldado) corBorda = 'rgba(255,255,255,0.06)';

    return (
        <div style={{
            ...estilos.assento,
            borderColor: corBorda,
            opacity:     foldado ? 0.45 : 1,
            // Sombra dourada pulsante quando é a vez
            boxShadow:   ehVez
                ? '0 0 0 2px rgba(245,158,11,0.4), 0 4px 16px rgba(0,0,0,0.5)'
                : '0 2px 10px rgba(0,0,0,0.4)',
        }}>

            {/* ---- BADGES DE POSIÇÃO (Dealer, SB, BB) ---- */}
            <div style={estilos.badges}>
                {ehDealer && <Badge texto="D"  cor="#F59E0B" />}
                {ehSB     && <Badge texto="SB" cor="#3B82F6" />}
                {ehBB     && <Badge texto="BB" cor="#8B5CF6" />}
            </div>

            {/* ---- AVATAR ---- */}
            <div style={{
                ...estilos.avatarContainer,
                // Anel colorido ao redor do avatar
                boxShadow: ehVez
                    ? `0 0 0 2px #F59E0B`
                    : souEu
                        ? `0 0 0 2px #7C3AED`
                        : `0 0 0 1px rgba(255,255,255,0.15)`,
            }}>
                {jogador.avatar ? (
                    <img
                        src={jogador.avatar}
                        alt={jogador.nome}
                        style={estilos.avatarImg}
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                ) : (
                    // Emoji padrão quando não tem avatar
                    <span style={estilos.avatarEmoji}>
                        {jogador.bot ? '🤖' : '🧑'}
                    </span>
                )}

                {/* Indicador de vez pulsante sobre o avatar */}
                {ehVez && <div style={estilos.pulsando} />}
            </div>

            {/* ---- NOME ---- */}
            <p style={{
                ...estilos.nome,
                color: souEu ? '#A78BFA' : '#F8FAFC',
            }}>
                {jogador.nome?.split(' ')[0] || 'Jogador'}
                {souEu && <span style={estilos.euLabel}> (você)</span>}
            </p>

            {/* ---- SALDO ---- */}
            <p style={estilos.saldo}>
                ₿C {fmt(jogador.saldo)}
            </p>

            {/* ---- CARTAS ---- */}
            <div style={estilos.cartasContainer}>
                {souEu && cartasPrivadas.length > 0 ? (
                    // Jogador local — cartas reais viradas para cima
                    cartasPrivadas.map((codigo, i) => {
                        const carta = parsearCarta(codigo);
                        return carta
                            ? <CartaMini key={i} carta={carta} />
                            : <CartaMiniVerso key={i} />;
                    })
                ) : jogador.cartas?.length > 0 ? (
                    // Outros jogadores — mostra o verso das cartas
                    jogador.cartas.map((codigo, i) => {
                        // No showdown, o servidor revela as cartas de todos
                        const carta = parsearCarta(codigo);
                        return carta
                            ? <CartaMini key={i} carta={carta} />
                            : <CartaMiniVerso key={i} />;
                    })
                ) : null}
            </div>

            {/* ---- APOSTA ATUAL ---- */}
            {temAposta && (
                <div style={estilos.apostaContainer}>
                    <span style={estilos.apostaTexto}>
                        ₿C {fmt(jogador.aposta)}
                    </span>
                </div>
            )}

            {/* ---- STATUS ESPECIAL ---- */}
            {allIn && (
                <div style={estilos.badgeAllIn}>ALL-IN</div>
            )}

            {foldado && (
                <div style={estilos.badgeFold}>FOLD</div>
            )}

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE Badge
// Badge pequeno para Dealer (D), Small Blind (SB), Big Blind (BB)
// ================================================================

function Badge({ texto, cor }) {
    return (
        <div style={{
            ...estilos.badge,
            background:   cor,
            boxShadow:    `0 0 6px ${cor}60`,
        }}>
            {texto}
        </div>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE CartaMini
// Versão pequena da carta para exibir no assento
// ================================================================

function CartaMini({ carta }) {
    return (
        <div style={estilos.cartaMini} aria-label={`${carta.valor}${carta.simbolo}`}>
            <span style={{ ...estilos.cartaMiniValor, color: carta.cor }}>
                {carta.valor}
            </span>
            <span style={{ ...estilos.cartaMiniNaipe, color: carta.cor }}>
                {carta.simbolo}
            </span>
        </div>
    );
}

// Verso da carta (para outros jogadores)
function CartaMiniVerso() {
    return (
        <div style={estilos.cartaMiniVerso} />
    );
}


// ================================================================
// BLOCO 5: ESTILOS
// ================================================================

const estilos = {

    // Container do assento
    // position: relative para posicionar badges e aposta
    assento: {
        position:      'relative',
        background:    'rgba(10, 15, 30, 0.92)',
        borderRadius:  '12px',
        border:        '2px solid',
        padding:       '6px 8px 8px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '2px',
        minWidth:      '68px',
        maxWidth:      '80px',
        transition:    'border-color 0.3s, box-shadow 0.3s, opacity 0.3s',
        // Backdrop blur para efeito de vidro fosco
        backdropFilter: 'blur(4px)',
    },

    // Container dos badges de posição (D, SB, BB)
    badges: {
        position:    'absolute',
        top:         '-8px',
        left:        '50%',
        transform:   'translateX(-50%)',
        display:     'flex',
        gap:         '2px',
        zIndex:      5,
    },

    // Badge individual (D, SB, BB)
    badge: {
        fontSize:     '8px',
        fontWeight:   '800',
        color:        'white',
        padding:      '1px 4px',
        borderRadius: '3px',
        letterSpacing: '0.02em',
        lineHeight:   '14px',
    },

    // Container do avatar com anel
    avatarContainer: {
        width:          '36px',
        height:         '36px',
        borderRadius:   '50%',
        background:     'rgba(255,255,255,0.08)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        overflow:       'hidden',
        flexShrink:     0,
        position:       'relative',
        transition:     'box-shadow 0.3s',
        marginTop:      '4px',
    },

    // Imagem do avatar
    avatarImg: {
        width:      '100%',
        height:     '100%',
        objectFit:  'cover',
        borderRadius: '50%',
    },

    // Emoji padrão quando não há avatar
    avatarEmoji: {
        fontSize:   '18px',
        lineHeight: 1,
    },

    // Anel pulsante ao redor do avatar quando é a vez
    pulsando: {
        position:     'absolute',
        inset:        '-3px',
        borderRadius: '50%',
        border:       '2px solid #F59E0B',
        animation:    'pulsar 1.2s ease-in-out infinite',
        pointerEvents: 'none',
    },

    // Nome do jogador
    nome: {
        fontSize:     '10px',
        fontWeight:   '600',
        margin:       0,
        textAlign:    'center',
        maxWidth:     '72px',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        lineHeight:   1.2,
    },

    // Label "(você)" ao lado do nome
    euLabel: {
        fontSize:   '8px',
        fontWeight: '400',
        color:      'rgba(167,139,250,0.7)',
    },

    // Saldo do jogador
    saldo: {
        fontSize:   '9px',
        fontWeight: '600',
        color:      '#F59E0B',
        margin:     0,
    },

    // Container das cartas mini
    cartasContainer: {
        display: 'flex',
        gap:     '2px',
        marginTop: '2px',
    },

    // Carta mini (frente) — exibida no assento do jogador
    cartaMini: {
        width:          '18px',
        height:         '26px',
        background:     '#FFFFFF',
        borderRadius:   '2px',
        border:         '1px solid #D1D5DB',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '0px',
        boxShadow:      '0 1px 3px rgba(0,0,0,0.3)',
        flexShrink:     0,
        lineHeight:     1,
    },

    cartaMiniValor: {
        fontSize:   '7px',
        fontWeight: '800',
        lineHeight: 1,
        fontFamily: 'Georgia, serif',
    },

    cartaMiniNaipe: {
        fontSize:   '7px',
        lineHeight: 1,
    },

    // Carta mini (verso) — exibida para outros jogadores
    cartaMiniVerso: {
        width:        '18px',
        height:       '26px',
        background:   'linear-gradient(135deg, #1E3A8A, #1E40AF)',
        borderRadius: '2px',
        border:       '1px solid rgba(255,255,255,0.15)',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.3)',
        flexShrink:   0,
    },

    // Container da aposta atual (abaixo do assento)
    apostaContainer: {
        position:     'absolute',
        bottom:       '-20px',
        left:         '50%',
        transform:    'translateX(-50%)',
        background:   'rgba(245,158,11,0.15)',
        border:       '1px solid rgba(245,158,11,0.35)',
        borderRadius: '10px',
        padding:      '2px 6px',
        whiteSpace:   'nowrap',
        zIndex:       4,
    },

    apostaTexto: {
        fontSize:   '9px',
        fontWeight: '700',
        color:      '#F59E0B',
    },

    // Badge ALL-IN
    badgeAllIn: {
        position:      'absolute',
        top:           '50%',
        left:          '50%',
        transform:     'translate(-50%, -50%)',
        background:    'rgba(239,68,68,0.85)',
        color:         'white',
        fontSize:      '8px',
        fontWeight:    '800',
        padding:       '2px 5px',
        borderRadius:  '3px',
        letterSpacing: '0.04em',
        zIndex:        5,
        whiteSpace:    'nowrap',
    },

    // Badge FOLD
    badgeFold: {
        position:      'absolute',
        top:           '50%',
        left:          '50%',
        transform:     'translate(-50%, -50%)',
        background:    'rgba(107,114,128,0.85)',
        color:         'white',
        fontSize:      '8px',
        fontWeight:    '800',
        padding:       '2px 5px',
        borderRadius:  '3px',
        letterSpacing: '0.04em',
        zIndex:        5,
        whiteSpace:    'nowrap',
    },
};
