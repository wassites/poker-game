/* ================================================================
   ARQUIVO: frontend/src/pages/Game/Mesa.jsx

   MELHORIAS:
   → Raios dinâmicos baseados no número de jogadores
   → Assentos maiores no desktop via CSS classes
   → Jogador local sempre na base da mesa
   → Passa tempoMs correto (humano=90s, bot=30s) para Jogador.jsx

   PROPS:
     mesa         → estado completo da mesa
     meuUid       → uid do jogador local
     minhasCartas → cartas privadas do jogador local
================================================================ */

import Jogador from './Jogador';

const COR_NAIPE     = { h:'#DC2626', d:'#DC2626', s:'#1a1a2e', c:'#1a1a2e' };
const SIMBOLO_NAIPE = { h:'♥', d:'♦', s:'♠', c:'♣' };

function parsearCarta(codigo) {
    if (!codigo || codigo === 'XX') return null;
    const naipe = codigo.slice(-1).toLowerCase();
    const valor = codigo.slice(0, -1);
    return { codigo, valor, naipe, simbolo:SIMBOLO_NAIPE[naipe]||naipe, cor:COR_NAIPE[naipe]||'#1a1a2e' };
}

function fmt(n) { return Number(n||0).toLocaleString('pt-BR'); }

// Calcula posições ao redor da mesa em elipse
// Jogador local sempre fica na base (parte inferior)
function calcularPosicoes(jogadoresArray, meuUid) {
    const total    = jogadoresArray.length;
    const meuIndex = jogadoresArray.findIndex(([uid]) => uid === meuUid);
    const offset   = meuIndex >= 0 ? meuIndex : 0;

    // Raios maiores para poucos jogadores, menores para muitos
    // Isso evita sobreposição dos assentos
    const raioX = total <= 3 ? 36 : total <= 5 ? 40 : 42;
    const raioY = total <= 3 ? 28 : total <= 5 ? 32 : 34;

    return jogadoresArray.map(([uid, jogador], index) => {
        const indiceRel = (index - offset + total) % total;
        const angulo    = (indiceRel / total) * 360 - 90;
        const radiano   = (angulo * Math.PI) / 180;

        return {
            uid,
            jogador,
            esquerda: 50 + raioX * Math.cos(radiano),
            topo:     50 + raioY * Math.sin(radiano),
            souEu:    uid === meuUid,
        };
    });
}

// Descobre o tempo do timer baseado no uid do jogador
// Bots têm uid começando com 'bot_'
function tempoDoJogador(uid) {
    return uid?.startsWith('bot_') ? 30000 : 90000;
}

export default function Mesa({ mesa, meuUid, minhasCartas = [] }) {
    if (!mesa) return null;

    const jogadoresArray = Object.entries(mesa.jogadores || {});
    const posicoes       = calcularPosicoes(jogadoresArray, meuUid);
    const cartasCom      = (mesa.cartasComunitarias || []).map(parsearCarta);

    return (
        <div style={estilos.container}>
            <style>{`
                /* Feltro maior no desktop */
                @media (min-width: 768px) {
                    .mesa-feltro {
                        max-width: 580px !important;
                    }
                }
            `}</style>

            <div className="mesa-feltro" style={estilos.feltro}>
                <div style={estilos.feltroInterno}>

                    {/* Centro: cartas comunitárias + pote */}
                    <div style={estilos.centro}>

                        <div style={estilos.cartasRow}>
                            {mesa.fase === 'AGUARDANDO' ? (
                                <p style={estilos.textoVazio}>Aguardando jogadores...</p>
                            ) : cartasCom.length > 0 ? (
                                Array.from({ length: 5 }).map((_, i) => {
                                    const carta = cartasCom[i];
                                    return carta
                                        ? <CartaCom key={i} carta={carta} />
                                        : <CartaComVazia key={i} />;
                                })
                            ) : (
                                <p style={estilos.textoVazio}>Distribuindo cartas...</p>
                            )}
                        </div>

                        {mesa.pote > 0 && (
                            <div style={estilos.pote}>
                                <span>💰</span>
                                <span style={estilos.poteValor}>₿C {fmt(mesa.pote)}</span>
                            </div>
                        )}

                        {mesa.fase && mesa.fase !== 'AGUARDANDO' && (
                            <div style={estilos.faseBadge}>
                                <span style={estilos.faseTexto}>{mesa.fase.replace('-',' ')}</span>
                            </div>
                        )}
                    </div>

                    {/* Jogadores ao redor */}
                    {posicoes.map(({ uid, jogador, esquerda, topo, souEu }) => (
                        <div key={uid} style={{
                            position:  'absolute',
                            left:      `${esquerda}%`,
                            top:       `${topo}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex:    3,
                        }}>
                            <Jogador
                                jogador={jogador}
                                souEu={souEu}
                                ehVez={mesa.vezDeQuem === uid}
                                cartasPrivadas={souEu ? minhasCartas : []}
                                ehDealer={mesa.dealer === uid}
                                ehSB={mesa.sbId === uid}
                                ehBB={mesa.bbId === uid}
                                tempoMs={tempoDoJogador(uid)}
                            />
                        </div>
                    ))}

                </div>
            </div>
        </div>
    );
}

function CartaCom({ carta }) {
    return (
        <div style={estilos.carta}>
            <span style={{ ...estilos.cartaCanto, color: carta.cor }}>
                {carta.valor}{carta.simbolo}
            </span>
            <span style={{ fontSize:'20px', color:carta.cor, lineHeight:1 }}>
                {carta.simbolo}
            </span>
            <span style={{ ...estilos.cartaCanto, top:'auto', left:'auto',
                bottom:'3px', right:'3px', transform:'rotate(180deg)', color:carta.cor }}>
                {carta.valor}{carta.simbolo}
            </span>
        </div>
    );
}

function CartaComVazia() {
    return <div style={{ ...estilos.carta,
        background:'rgba(255,255,255,0.04)',
        border:'1px dashed rgba(255,255,255,0.15)',
        boxShadow:'none' }} />;
}

const estilos = {
    container: {
        width:'100%', maxWidth:'480px', margin:'0 auto',
        padding:'8px', display:'flex', alignItems:'center', justifyContent:'center',
    },
    feltro: {
        width:'100%',
        aspectRatio:'1.5 / 1',
        background:'radial-gradient(ellipse at center, #1f6b35 0%, #145228 50%, #0c3d1e 100%)',
        borderRadius:'50%',
        border:'8px solid #0a2d14',
        boxShadow:'0 0 0 3px #1a4a22, 0 8px 40px rgba(0,0,0,0.7), inset 0 0 80px rgba(0,0,0,0.3)',
        position:'relative',
        overflow:'visible',
    },
    feltroInterno: {
        position:'absolute', inset:'8px', borderRadius:'50%',
        border:'2px solid rgba(255,255,255,0.06)',
        display:'flex', alignItems:'center', justifyContent:'center',
    },
    centro: {
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        gap:'6px', zIndex:2, padding:'0 8px',
    },
    cartasRow: {
        display:'flex', gap:'4px', alignItems:'center', justifyContent:'center',
    },
    textoVazio: {
        fontSize:'11px', color:'rgba(255,255,255,0.3)',
        margin:0, textAlign:'center', fontStyle:'italic',
    },
    pote: {
        display:'flex', alignItems:'center', gap:'4px',
        background:'rgba(0,0,0,0.45)', borderRadius:'20px',
        padding:'3px 10px', border:'1px solid rgba(245,158,11,0.25)',
        fontSize:'12px',
    },
    poteValor: { fontSize:'12px', fontWeight:'700', color:'#F59E0B' },
    faseBadge: { background:'rgba(0,0,0,0.3)', borderRadius:'10px', padding:'2px 8px' },
    faseTexto: {
        fontSize:'9px', color:'rgba(255,255,255,0.5)',
        textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:'600',
    },
    carta: {
        width:'36px', height:'52px', background:'#FFFFFF',
        borderRadius:'4px', border:'1px solid #D1D5DB',
        display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative', flexShrink:0,
        boxShadow:'0 2px 6px rgba(0,0,0,0.4)',
    },
    cartaCanto: {
        position:'absolute', top:'3px', left:'3px',
        fontSize:'9px', fontWeight:'800', lineHeight:1,
    },
};