/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Jogador.jsx

   Representa um assento da mesa de poker.
   NOVO: Temporizador circular ao redor do avatar.

   PROPS:
     jogador        → { nome, avatar, saldo, aposta, status, cartas }
     souEu          → true se for o jogador local
     ehVez          → true se for a vez deste jogador
     cartasPrivadas → cartas reais (só para souEu)
     ehDealer/ehSB/ehBB → badges de posição
     tempoMs        → tempo total do timer (humano=90000, bot=30000)
================================================================ */

import Temporizador from './Temporizador';

const COR_NAIPE     = { h:'#DC2626', d:'#DC2626', s:'#111827', c:'#111827' };
const SIMBOLO_NAIPE = { h:'♥', d:'♦', s:'♠', c:'♣' };

function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;
    const naipe = codigo.slice(-1).toLowerCase();
    const valor = codigo.slice(0, -1);
    return { codigo, valor, naipe, simbolo: SIMBOLO_NAIPE[naipe]||naipe, cor: COR_NAIPE[naipe]||'#111827' };
}

export default function Jogador({
    jogador,
    souEu          = false,
    ehVez          = false,
    cartasPrivadas = [],
    ehDealer       = false,
    ehSB           = false,
    ehBB           = false,
    tempoMs        = 90000,
}) {
    if (!jogador) return null;

    const foldado   = jogador.status === 'FOLD';
    const allIn     = jogador.status === 'ALL-IN';
    const temAposta = (jogador.aposta || 0) > 0;

    let corBorda = 'rgba(255,255,255,0.12)';
    if (ehVez)   corBorda = '#F59E0B';
    if (souEu)   corBorda = '#7C3AED';
    if (foldado) corBorda = 'rgba(255,255,255,0.06)';

    return (
        <div style={{
            ...estilos.assento,
            borderColor: corBorda,
            opacity:     foldado ? 0.45 : 1,
            boxShadow:   ehVez
                ? '0 0 0 2px rgba(245,158,11,0.3), 0 4px 16px rgba(0,0,0,0.5)'
                : '0 2px 10px rgba(0,0,0,0.4)',
        }}>

            {/* Badges D / SB / BB */}
            <div style={estilos.badges}>
                {ehDealer && <Badge texto="D"  cor="#F59E0B" />}
                {ehSB     && <Badge texto="SB" cor="#3B82F6" />}
                {ehBB     && <Badge texto="BB" cor="#8B5CF6" />}
            </div>

            {/* Avatar + Temporizador circular */}
            <div style={{
                ...estilos.avatarWrapper,
                boxShadow: souEu ? '0 0 0 2px #7C3AED' : 'none',
            }}>
                {/* Avatar */}
                <div style={estilos.avatarInner}>
                    {jogador.avatar ? (
                        <img src={jogador.avatar} alt={jogador.nome} style={estilos.avatarImg}
                            onError={e => { e.target.onerror=null; e.target.style.display='none'; }} />
                    ) : (
                        <span style={{ fontSize:'18px', lineHeight:1 }}>
                            {jogador.bot ? '🤖' : '🧑'}
                        </span>
                    )}
                </div>

                {/* Temporizador circular — aparece só quando é a vez */}
                <Temporizador totalMs={tempoMs} ativo={ehVez} tamanho={50} />
            </div>

            {/* Nome */}
            <p style={{ ...estilos.nome, color: souEu ? '#A78BFA' : '#F8FAFC' }}>
                {jogador.nome?.split(' ')[0] || 'Jogador'}
                {souEu && <span style={{ fontSize:'8px', color:'rgba(167,139,250,0.7)' }}> (você)</span>}
            </p>

            {/* Saldo */}
            <p style={estilos.saldo}>₿C {fmt(jogador.saldo)}</p>

            {/* Cartas mini */}
            <div style={estilos.cartasContainer}>
                {souEu && cartasPrivadas.length > 0 ? (
                    cartasPrivadas.map((c,i) => {
                        const carta = parsearCarta(c);
                        return carta ? <CartaMini key={i} carta={carta}/> : <CartaVerso key={i}/>;
                    })
                ) : jogador.cartas?.length > 0 ? (
                    jogador.cartas.map((c,i) => {
                        const carta = parsearCarta(c);
                        return carta ? <CartaMini key={i} carta={carta}/> : <CartaVerso key={i}/>;
                    })
                ) : null}
            </div>

            {/* Aposta */}
            {temAposta && (
                <div style={estilos.aposta}>
                    <span style={estilos.apostaTexto}>₿C {fmt(jogador.aposta)}</span>
                </div>
            )}

            {allIn   && <div style={estilos.badgeAllIn}>ALL-IN</div>}
            {foldado && <div style={estilos.badgeFold}>FOLD</div>}

        </div>
    );
}

function Badge({ texto, cor }) {
    return (
        <div style={{ fontSize:'8px', fontWeight:'800', color:'white',
            padding:'1px 4px', borderRadius:'3px', letterSpacing:'0.02em',
            lineHeight:'14px', background:cor, boxShadow:`0 0 6px ${cor}60` }}>
            {texto}
        </div>
    );
}

function CartaMini({ carta }) {
    return (
        <div style={estilos.cartaMini}>
            <span style={{ fontSize:'7px', fontWeight:'800', lineHeight:1, fontFamily:'Georgia,serif', color:carta.cor }}>{carta.valor}</span>
            <span style={{ fontSize:'7px', lineHeight:1, color:carta.cor }}>{carta.simbolo}</span>
        </div>
    );
}

function CartaVerso() {
    return <div style={estilos.cartaVerso} />;
}

const estilos = {
    assento: {
        position:      'relative',
        background:    'rgba(10,15,30,0.92)',
        borderRadius:  '12px',
        border:        '2px solid',
        padding:       '6px 8px 8px',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '2px',
        minWidth:      '68px',
        maxWidth:      '84px',
        backdropFilter:'blur(4px)',
        transition:    'border-color 0.3s, box-shadow 0.3s, opacity 0.3s',
    },
    badges: {
        position:'absolute', top:'-8px', left:'50%',
        transform:'translateX(-50%)', display:'flex', gap:'2px', zIndex:5,
    },
    // Wrapper do avatar com overflow:visible para o temporizador aparecer
    avatarWrapper: {
        position:       'relative',
        width:          '40px',
        height:         '40px',
        borderRadius:   '50%',
        flexShrink:     0,
        marginTop:      '4px',
        transition:     'box-shadow 0.3s',
    },
    avatarInner: {
        width:          '40px',
        height:         '40px',
        borderRadius:   '50%',
        background:     'rgba(255,255,255,0.08)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        overflow:       'hidden',
        position:       'relative',
        zIndex:         1,
    },
    avatarImg: {
        width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%',
    },
    nome: {
        fontSize:'10px', fontWeight:'600', margin:0, textAlign:'center',
        maxWidth:'72px', overflow:'hidden', textOverflow:'ellipsis',
        whiteSpace:'nowrap', lineHeight:1.2,
    },
    saldo: {
        fontSize:'9px', fontWeight:'600', color:'#F59E0B', margin:0,
    },
    cartasContainer: {
        display:'flex', gap:'2px', marginTop:'2px',
    },
    cartaMini: {
        width:'18px', height:'26px', background:'#FFFFFF',
        borderRadius:'2px', border:'1px solid #D1D5DB',
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
        flexShrink:0, lineHeight:1,
    },
    cartaVerso: {
        width:'18px', height:'26px',
        background:'linear-gradient(135deg,#1E3A8A,#1E40AF)',
        borderRadius:'2px', border:'1px solid rgba(255,255,255,0.15)',
        boxShadow:'0 1px 3px rgba(0,0,0,0.3)', flexShrink:0,
    },
    aposta: {
        position:'absolute', bottom:'-20px', left:'50%',
        transform:'translateX(-50%)',
        background:'rgba(245,158,11,0.15)',
        border:'1px solid rgba(245,158,11,0.35)',
        borderRadius:'10px', padding:'2px 6px',
        whiteSpace:'nowrap', zIndex:4,
    },
    apostaTexto: { fontSize:'9px', fontWeight:'700', color:'#F59E0B' },
    badgeAllIn: {
        position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        background:'rgba(239,68,68,0.85)', color:'white',
        fontSize:'8px', fontWeight:'800', padding:'2px 5px',
        borderRadius:'3px', zIndex:5, whiteSpace:'nowrap',
    },
    badgeFold: {
        position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        background:'rgba(107,114,128,0.85)', color:'white',
        fontSize:'8px', fontWeight:'800', padding:'2px 5px',
        borderRadius:'3px', zIndex:5, whiteSpace:'nowrap',
    },
};