/* ================================================================
   ARQUIVO: frontend/src/pages/Lobby/Menu/Wallet/PinConfirm.jsx

   CONCEITO GERAL:
   Modal de segurança que solicita o PIN numérico do jogador
   antes de executar qualquer ação sensível da carteira:
     → Depósito
     → Saque
     → Envio de ₿C

   FLUXO:
     1. Modal abre com título e descrição da ação pendente
     2. Jogador digita PIN de 4 a 6 dígitos via teclado numérico
     3. Cada dígito aparece como ● (ocultado)
     4. Ao completar 4+ dígitos, botão confirmar fica ativo
     5. onConfirmar(pin) é chamado — o pai envia ao backend
     6. Backend valida o PIN real — aqui só validamos o formato

   SEGURANÇA:
     → PIN nunca é exibido em texto claro
     → Máximo 3 tentativas antes de bloquear por 30s
     → Teclado numérico próprio (evita autopreenchimento)
     → Botão de apagar dígito a dígito
     → ESC ou clique no fundo cancela a ação

   PROPS:
     titulo      → string : título da ação (ex: "Confirmar saque")
     descricao   → string : resumo do que vai acontecer
     onConfirmar → fn(pin: string) : chamado com o PIN digitado
     onCancelar  → fn() : chamado ao cancelar
================================================================ */

import { useState, useEffect, useCallback } from 'react';
import { validarFormatoPin } from './walletUtils';


// ================================================================
// CONSTANTES
// ================================================================

const PIN_MIN        = 4;
const PIN_MAX        = 6;
const MAX_TENTATIVAS = 3;
const BLOQUEIO_SEG   = 30;

const TECLAS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['⌫', '0', '✓'],
];

// Helper puro fora do componente — Date.now() aqui não é chamado durante
// render, apenas quando invocado explicitamente em event handlers.
function agora() { return Date.now(); }


// ================================================================
// COMPONENTE PRINCIPAL
// ================================================================

export default function PinConfirm({ titulo, descricao, onConfirmar, onCancelar }) {

    const [pin,          setPin]          = useState('');
    const [erro,         setErro]         = useState(null);
    const [tentativas,   setTentativas]   = useState(0);
    const [bloqueadoAte, setBloqueadoAte] = useState(null); // timestamp
    const [tempoRestante,setTempoRestante]= useState(0);
    const [agitando,     setAgitando]     = useState(false); // animação de erro


    // ----------------------------------------------------------------
    // Countdown do bloqueio
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!bloqueadoAte) return;

        const intervalo = setInterval(() => {
            const restante = Math.ceil((bloqueadoAte - Date.now()) / 1000);
            if (restante <= 0) {
                setBloqueadoAte(null);
                setTempoRestante(0);
                setTentativas(0);
                setErro(null);
                clearInterval(intervalo);
            } else {
                setTempoRestante(restante);
            }
        }, 1000);

        return () => clearInterval(intervalo);
    }, [bloqueadoAte]);


    // ----------------------------------------------------------------
    // Fechar com ESC
    // ----------------------------------------------------------------
    useEffect(() => {
        function handleKey(e) {
            if (e.key === 'Escape') onCancelar();
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onCancelar]);


    // ----------------------------------------------------------------
    // Animação de erro — declarada antes de handleConfirmar para evitar
    // acesso antes da declaração (react-hooks/immutability).
    // ----------------------------------------------------------------
    const agitar = useCallback(() => {
        setAgitando(true);
        setTimeout(() => setAgitando(false), 500);
    }, []);


    // ----------------------------------------------------------------
    // Confirma o PIN — declarado antes de handleTecla pois é referenciado
    // dentro do useCallback de handleTecla.
    // Date.now() fica dentro de um event handler (não no render), portanto
    // é permitido — o eslint/purity só bloqueia chamadas durante render.
    // Usamos uma variável local `agora` para deixar isso explícito.
    // ----------------------------------------------------------------
    const handleConfirmar = useCallback(() => {
        if (bloqueadoAte) return;

        const { valido, erro: erroFormato } = validarFormatoPin(pin);
        if (!valido) {
            agitar();
            setErro(erroFormato);
            return;
        }

        const novasTentativas = tentativas + 1;

        if (novasTentativas >= MAX_TENTATIVAS) {
            setBloqueadoAte(agora() + BLOQUEIO_SEG * 1000);
            setTempoRestante(BLOQUEIO_SEG);
            setPin('');
            agitar();
            setErro(`Muitas tentativas. Aguarde ${BLOQUEIO_SEG} segundos.`);
            return;
        }

        setTentativas(novasTentativas);
        onConfirmar(pin);
    }, [bloqueadoAte, pin, tentativas, agitar, onConfirmar]);


    // ----------------------------------------------------------------
    // Processa clique em tecla do teclado numérico
    // ----------------------------------------------------------------
    const handleTecla = useCallback((tecla) => {
        if (bloqueadoAte) return;

        if (tecla === '⌫') {
            setPin(p => p.slice(0, -1));
            setErro(null);
            return;
        }

        if (tecla === '✓') {
            handleConfirmar();
            return;
        }

        if (pin.length >= PIN_MAX) return;

        setPin(p => p + tecla);
        setErro(null);
    }, [pin, bloqueadoAte, handleConfirmar]);



    const bloqueado = !!bloqueadoAte;
    const pinValido = pin.length >= PIN_MIN && !bloqueado;


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estilos.overlay} onClick={onCancelar}>

            <div
                style={estilos.modal}
                onClick={e => e.stopPropagation()}
            >
                {/* ---- Ícone de cadeado ---- */}
                <div style={estilos.iconeBox}>
                    <span style={estilos.icone}>🔐</span>
                </div>

                {/* ---- Título e descrição ---- */}
                <div style={estilos.textos}>
                    <p style={estilos.titulo}>{titulo}</p>
                    {descricao && (
                        <p style={estilos.descricao}>{descricao}</p>
                    )}
                </div>

                {/* ---- Indicadores de dígitos ---- */}
                <div style={{
                    ...estilos.pontosRow,
                    animation: agitando ? 'agitar 0.4s ease' : 'none',
                }}>
                    {Array.from({ length: PIN_MAX }).map((_, i) => (
                        <div
                            key={i}
                            style={{
                                ...estilos.ponto,
                                background: i < pin.length
                                    ? '#F59E0B'
                                    : 'rgba(255,255,255,0.10)',
                                border: i < pin.length
                                    ? '1px solid #F59E0B'
                                    : '1px solid rgba(255,255,255,0.15)',
                                transform: i < pin.length ? 'scale(1.15)' : 'scale(1)',
                            }}
                        />
                    ))}
                </div>

                {/* ---- Mensagem de erro / bloqueio ---- */}
                {erro && (
                    <p style={estilos.erroTexto}>
                        {bloqueado ? `⏳ ${erro} (${tempoRestante}s)` : `⚠ ${erro}`}
                    </p>
                )}

                {/* ---- Tentativas restantes ---- */}
                {tentativas > 0 && !bloqueado && (
                    <p style={estilos.tentativasTexto}>
                        {MAX_TENTATIVAS - tentativas} tentativa{MAX_TENTATIVAS - tentativas !== 1 ? 's' : ''} restante{MAX_TENTATIVAS - tentativas !== 1 ? 's' : ''}
                    </p>
                )}

                {/* ---- Teclado numérico ---- */}
                <div style={estilos.teclado}>
                    {TECLAS.map((linha, li) => (
                        <div key={li} style={estilos.teclado_linha}>
                            {linha.map(tecla => {
                                const ehConfirmar = tecla === '✓';
                                const ehApagar    = tecla === '⌫';
                                const desabilitado = bloqueado ||
                                    (ehConfirmar && !pinValido) ||
                                    (!ehApagar && !ehConfirmar && pin.length >= PIN_MAX);

                                return (
                                    <button
                                        key={tecla}
                                        onClick={() => handleTecla(tecla)}
                                        disabled={desabilitado}
                                        style={{
                                            ...estilos.tecla,
                                            background: ehConfirmar
                                                ? (pinValido ? '#F59E0B' : 'rgba(255,255,255,0.05)')
                                                : ehApagar
                                                    ? 'rgba(239,68,68,0.10)'
                                                    : 'rgba(255,255,255,0.06)',
                                            border: ehConfirmar
                                                ? (pinValido ? '1px solid #F59E0B' : '1px solid rgba(255,255,255,0.08)')
                                                : ehApagar
                                                    ? '1px solid rgba(239,68,68,0.20)'
                                                    : '1px solid rgba(255,255,255,0.08)',
                                            color: ehConfirmar
                                                ? (pinValido ? '#fff' : 'rgba(255,255,255,0.20)')
                                                : ehApagar
                                                    ? '#FCA5A5'
                                                    : '#F8FAFC',
                                            fontSize: ehConfirmar || ehApagar ? '18px' : '20px',
                                            opacity:  desabilitado && !ehConfirmar ? 0.35 : 1,
                                            cursor:   desabilitado ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {tecla}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* ---- Botão cancelar ---- */}
                <button onClick={onCancelar} style={estilos.btnCancelar}>
                    Cancelar
                </button>

                {/* ---- Aviso de segurança ---- */}
                <p style={estilos.avisoSeguranca}>
                    🔒 Nunca compartilhe seu PIN com ninguém
                </p>

            </div>

            {/* Keyframe da animação de agitar */}
            <style>{`
                @keyframes agitar {
                    0%,100% { transform: translateX(0); }
                    20%     { transform: translateX(-8px); }
                    40%     { transform: translateX(8px); }
                    60%     { transform: translateX(-5px); }
                    80%     { transform: translateX(5px); }
                }
            `}</style>

        </div>
    );
}


// ================================================================
// ESTILOS
// ================================================================

const estilos = {

    overlay: {
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.80)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         1100,
        padding:        '20px',
        backdropFilter: 'blur(6px)',
    },

    modal: {
        background:    '#0F172A',
        border:        '1px solid rgba(255,255,255,0.10)',
        borderRadius:  '20px',
        padding:       '28px 24px',
        maxWidth:      '320px',
        width:         '100%',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '16px',
        boxShadow:     '0 0 60px rgba(0,0,0,0.5)',
    },

    iconeBox: {
        width:          '56px',
        height:         '56px',
        borderRadius:   '50%',
        background:     'rgba(245,158,11,0.10)',
        border:         '1px solid rgba(245,158,11,0.25)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
    },

    icone: {
        fontSize: '26px',
    },

    textos: {
        textAlign: 'center',
        display:   'flex',
        flexDirection: 'column',
        gap: '6px',
    },

    titulo: {
        fontSize:   '17px',
        fontWeight: '700',
        color:      '#F8FAFC',
        margin:     0,
    },

    descricao: {
        fontSize:   '13px',
        color:      'rgba(255,255,255,0.45)',
        margin:     0,
        lineHeight: 1.4,
    },

    // Indicadores de PIN (pontos)
    pontosRow: {
        display: 'flex',
        gap:     '10px',
    },

    ponto: {
        width:        '14px',
        height:       '14px',
        borderRadius: '50%',
        transition:   'all 0.15s ease',
    },

    erroTexto: {
        fontSize:  '12px',
        color:     '#FCA5A5',
        margin:    0,
        textAlign: 'center',
    },

    tentativasTexto: {
        fontSize:  '11px',
        color:     '#F59E0B',
        margin:    0,
        textAlign: 'center',
    },

    // Teclado numérico
    teclado: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
        width:         '100%',
    },

    teclado_linha: {
        display:             'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap:                 '8px',
    },

    tecla: {
        height:       '54px',
        borderRadius: '10px',
        fontWeight:   '600',
        fontFamily:   'inherit',
        cursor:       'pointer',
        outline:      'none',
        transition:   'all 0.12s',
        WebkitTapHighlightColor: 'transparent',
        userSelect:   'none',
    },

    btnCancelar: {
        width:        '100%',
        padding:      '11px',
        background:   'transparent',
        border:       '1px solid rgba(255,255,255,0.10)',
        borderRadius: '10px',
        color:        'rgba(255,255,255,0.40)',
        fontSize:     '13px',
        cursor:       'pointer',
        fontFamily:   'inherit',
        transition:   'all 0.15s',
        WebkitTapHighlightColor: 'transparent',
    },

    avisoSeguranca: {
        fontSize:  '10px',
        color:     'rgba(255,255,255,0.18)',
        margin:    0,
        textAlign: 'center',
    },
};