/* ================================================================
   ARQUIVO: frontend/src/components/HandStrength.jsx
   
   CONCEITO GERAL:
   Componente que exibe a força da mão do jogador no canto da tela.
   Três elementos visuais combinados:
     1. Badge colorido — cor muda conforme a força
     2. Barra de progresso — percentual visual da força
     3. Animação — pulsa quando a mão melhora

   COMO O REACT SABE QUANDO ANIMAR?
     Usamos useEffect + useRef para detectar quando a mão melhorou.
     useRef guarda o valor ANTERIOR sem causar re-render.
     Quando o novo valor é maior que o anterior → dispara animação.

   PROPS:
     cartasMao       → array com as 2 cartas do jogador ['A♠', 'K♥']
     cartasMesa      → array com cartas comunitárias (0 a 5)
     visivel         → boolean: só aparece quando é a vez do jogador
================================================================ */

import { useState, useEffect, useRef } from 'react';
import { calcularForca } from '../core/engine-poker.js';

// ================================================================
// BLOCO 1: MAPA DE FORÇA PARA VISUAL
//
// Cada mão tem:
//   label    → nome exibido na tela
//   nivel    → número de 1 a 9 (usado para calcular % da barra)
//   cor      → cor do badge (do mais fraco ao mais forte)
//   corTexto → cor do texto dentro do badge
//   emoji    → ícone visual rápido
//
// Por que definir isso separado da engine?
//   A engine só calcula pontos numéricos — ela não sabe nada de visual.
//   Este mapa traduz os nomes que a engine retorna em informação visual.
//   Separar lógica de apresentação é uma boa prática em React.
// ================================================================

const MAPA_FORCAS = {
    'Pré-Flop':    { nivel: 0, cor: '#6B7280', corTexto: '#F9FAFB', emoji: '🃏' },
    'Carta Alta':  { nivel: 1, cor: '#6B7280', corTexto: '#F9FAFB', emoji: '📄' },
    'Par':         { nivel: 2, cor: '#3B82F6', corTexto: '#EFF6FF', emoji: '✌️' },
    'Dois Pares':  { nivel: 3, cor: '#8B5CF6', corTexto: '#F5F3FF', emoji: '👥' },
    'Trinca':      { nivel: 4, cor: '#F59E0B', corTexto: '#FFFBEB', emoji: '🔱' },
    'Sequência':   { nivel: 5, cor: '#F97316', corTexto: '#FFF7ED', emoji: '📈' },
    'Flush':       { nivel: 6, cor: '#EF4444', corTexto: '#FEF2F2', emoji: '♦️'  },
    'Full House':  { nivel: 7, cor: '#EC4899', corTexto: '#FDF2F8', emoji: '🏠' },
    'Quadra':      { nivel: 8, cor: '#DC2626', corTexto: '#FEF2F2', emoji: '🎯' },
    'Straight Flush': { nivel: 9, cor: '#7C3AED', corTexto: '#F5F3FF', emoji: '👑' },
};

// Nível máximo para calcular o percentual da barra (Straight Flush = 9 = 100%)
const NIVEL_MAXIMO = 9;


// ================================================================
// BLOCO 2: COMPONENTE DA BARRA DE PROGRESSO
//
// O que é um componente filho?
//   É um componente menor usado DENTRO do componente principal.
//   Aqui ProgressBar é usado dentro de HandStrength.
//   Isso mantém o código organizado — cada peça tem sua função.
//
// A animação da barra usa CSS transition.
// Quando o percentual muda, o CSS anima automaticamente.
// ================================================================

function ProgressBar({ percentual, cor }) {
    return (
        <div style={{
            width: '100%',
            height: '6px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: '3px',
            overflow: 'hidden',
            marginTop: '6px',
        }}>
            <div style={{
                height: '100%',
                width: `${percentual}%`,
                backgroundColor: cor,
                borderRadius: '3px',
                // transition: anima a mudança de largura em 600ms
                // ease-out: começa rápido e desacelera no final (mais natural)
                transition: 'width 0.6s ease-out',
                boxShadow: `0 0 8px ${cor}`,
            }} />
        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE PRINCIPAL HandStrength
// ================================================================

export default function HandStrength({ cartasMao, cartasMesa, visivel }) {

    // Estado da força atual — objeto com { pontos, nome }
    const [forca, setForca] = useState(null);

    // Estado da animação — true quando a mão melhorou
    const [animando, setAnimando] = useState(false);

    // useRef: guarda o nível ANTERIOR sem causar re-render
    // É diferente de useState: mudar um ref NÃO re-renderiza o componente
    // Usamos aqui para comparar "era nível 2, agora é nível 4 → melhorou!"
    const nivelAnterior = useRef(0);

    // ----------------------------------------------------------------
    // useEffect: executa quando cartasMao ou cartasMesa mudam
    //
    // O que é useEffect?
    //   É um "efeito colateral" — código que roda DEPOIS que o componente
    //   renderiza, em resposta a mudanças nas dependências ([cartasMao, cartasMesa]).
    //   Sem useEffect, não conseguimos detectar quando as cartas mudam.
    // ----------------------------------------------------------------
    useEffect(() => {
        // Só calcula se tiver pelo menos 2 cartas na mão
        if (!cartasMao || cartasMao.length < 2) {
            setForca(null);
            nivelAnterior.current = 0;
            return;
        }

        // Calcula a força usando a engine (engine-poker.js)
        const resultado = calcularForca(cartasMao, cartasMesa || []);
        const configVisual = MAPA_FORCAS[resultado.nome];
        const nivelAtual = configVisual?.nivel || 0;

        // Detecta se a mão MELHOROU comparando com o nível anterior
        // nivelAnterior.current é o valor guardado do render anterior
        if (nivelAtual > nivelAnterior.current && nivelAnterior.current > 0) {
            // Dispara a animação de melhora
            setAnimando(true);

            // Desliga a animação após 1.5 segundos
            // setTimeout: executa uma função após um delay em milissegundos
            setTimeout(() => setAnimando(false), 1500);
        }

        // Atualiza o nível anterior para a próxima comparação
        nivelAnterior.current = nivelAtual;

        // Atualiza o estado com os dados da força atual
        setForca({
            ...resultado,           // { pontos, nome }
            ...configVisual,        // { nivel, cor, corTexto, emoji }
            percentual: Math.round((nivelAtual / NIVEL_MAXIMO) * 100),
        });

    // Array de dependências: o useEffect roda toda vez que essas variáveis mudam
    }, [cartasMao, cartasMesa]);


    // ----------------------------------------------------------------
    // RENDERIZAÇÃO CONDICIONAL
    // Se não está visível ou não tem força calculada, não renderiza nada
    // Em React, retornar null = não mostra nada na tela
    // ----------------------------------------------------------------
    if (!visivel || !forca) return null;


    // ----------------------------------------------------------------
    // ESTILOS DINÂMICOS
    // Em React, estilos são objetos JavaScript calculados em tempo real.
    // Aqui as cores mudam conforme a força da mão.
    // ----------------------------------------------------------------

    // Container principal — fixo no canto inferior esquerdo
    const estiloContainer = {
        position: 'fixed',          // Fica no canto mesmo com scroll
        bottom: '120px',            // 120px do fundo (acima dos botões de ação)
        left: '16px',
        width: '180px',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',  // Fundo escuro semitransparente
        backdropFilter: 'blur(8px)',                 // Desfoque do fundo (glassmorphism)
        borderRadius: '12px',
        border: `1px solid ${forca.cor}40`,         // Borda colorida com 25% opacidade
        padding: '10px 12px',
        zIndex: 1000,               // Fica na frente de outros elementos

        // Animação de pulso quando a mão melhora
        // animando ? animação ativa : nenhuma animação
        animation: animando ? 'pulso 0.4s ease-in-out 3' : 'none',

        // transition suave quando o border muda de cor
        transition: 'border-color 0.5s ease',
    };

    // Badge do nome da mão
    const estiloBadge = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        backgroundColor: forca.cor,
        color: forca.corTexto,
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '600',
        letterSpacing: '0.02em',
        // Sombra colorida no badge para dar brilho
        boxShadow: animando ? `0 0 12px ${forca.cor}` : 'none',
        transition: 'box-shadow 0.3s ease, background-color 0.5s ease',
    };

    // Texto do percentual
    const estiloPercentual = {
        fontSize: '11px',
        color: 'rgba(255,255,255,0.5)',
        marginTop: '4px',
        display: 'block',
    };

    return (
        <>
            {/* Keyframes da animação de pulso injetados como style global */}
            {/* Em React, podemos injetar CSS assim para animações simples */}
            <style>{`
                @keyframes pulso {
                    0%   { transform: scale(1);    box-shadow: none; }
                    50%  { transform: scale(1.04); box-shadow: 0 0 20px ${forca.cor}60; }
                    100% { transform: scale(1);    box-shadow: none; }
                }
            `}</style>

            <div style={estiloContainer}>

                {/* Linha 1: Label discreto acima do badge */}
                <span style={{
                    fontSize: '10px',
                    color: 'rgba(255,255,255,0.4)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '4px',
                }}>
                    Sua mão
                </span>

                {/* Linha 2: Badge colorido com emoji + nome */}
                <div style={estiloBadge}>
                    <span style={{ fontSize: '13px' }}>{forca.emoji}</span>
                    <span>{forca.nome}</span>
                </div>

                {/* Linha 3: Barra de progresso */}
                <ProgressBar percentual={forca.percentual} cor={forca.cor} />

                {/* Linha 4: Percentual numérico */}
                <span style={estiloPercentual}>
                    {forca.percentual}% de força
                </span>

                {/* Linha 5: Mensagem de melhora — só aparece quando anima */}
                {animando && (
                    <span style={{
                        fontSize: '11px',
                        color: forca.cor,
                        fontWeight: '600',
                        display: 'block',
                        marginTop: '4px',
                        // fadeIn: aparece suavemente
                        animation: 'fadeIn 0.3s ease-in',
                    }}>
                        ↑ Mão melhorou!
                    </span>
                )}
            </div>
        </>
    );
}
