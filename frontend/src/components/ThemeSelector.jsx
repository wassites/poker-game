/* ================================================================
   ARQUIVO: frontend/src/components/ThemeSelector.jsx
   
   CONCEITO GERAL:
   Componente React que exibe todos os temas disponíveis e permite
   o jogador escolher e pré-visualizar antes de confirmar.

   O QUE É UM COMPONENTE REACT?
   É uma função que recebe dados (props) e retorna HTML (JSX).
   Pensa como uma "peça de LEGO" reutilizável da interface.
   
   PROPS QUE ESTE COMPONENTE RECEBE:
     temaAtual    → id do tema que o jogador usa atualmente
     premium      → boolean: o jogador pagou? (libera temas premium)
     onSalvar     → função chamada quando jogador confirma o tema
                    ex: onSalvar('neon') → salva no banco e fecha modal
================================================================ */

// React e useState são importados do React
// useState é um "Hook" — permite que o componente tenha memória interna
import { useState } from 'react';

// Importa as funções do deck.js que acabamos de criar
import { listarTemas, temaDisponivel } from '../core/deck.js';


// ================================================================
// COMPONENTE: PreviewCarta
// Renderiza uma carta de demonstração com o tema selecionado.
// Usado para o jogador ver como vai ficar antes de confirmar.
//
// Props:
//   tema    → objeto do tema (de TEMAS no deck.js)
//   virada  → boolean: mostrar verso (true) ou frente (false)
// ================================================================
function PreviewCarta({ tema, virada = false }) {

    // Carta de exemplo: Ás de Copas
    const cartaExemplo = { valor: 'A', naipe: '♥' };
    const configNaipe = tema.naipes[cartaExemplo.naipe];

    // Estilos calculados a partir do tema
    // Em React, estilos inline são objetos JavaScript (não strings CSS)
    const estiloFrente = {
        width: '60px',
        height: '84px',
        backgroundColor: tema.frente.fundoCor,
        border: `2px solid ${tema.frente.bordaCor}`,
        borderRadius: `${tema.frente.raio}px`,
        boxShadow: tema.frente.sombra,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        fontWeight: 'bold',
        color: configNaipe.cor,
        cursor: 'default',
        userSelect: 'none',
    };

    // Gera o padrão do verso dinamicamente
    const estiloVerso = {
        width: '60px',
        height: '84px',
        backgroundColor: tema.verso.cor,
        border: `2px solid ${tema.frente.bordaCor}`,
        borderRadius: `${tema.frente.raio}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };

    // Padrão decorativo do verso (simplificado para o preview)
    const estiloVersoInterno = {
        width: '48px',
        height: '72px',
        backgroundColor: tema.verso.corPadrao,
        borderRadius: `${tema.frente.raio - 2}px`,
        opacity: 0.4,
    };

    if (virada) {
        return (
            <div style={estiloVerso}>
                <div style={estiloVersoInterno} />
            </div>
        );
    }

    return (
        <div style={estiloFrente}>
            {/* Valor no topo esquerdo */}
            <span style={{ fontSize: '14px', lineHeight: 1 }}>
                {cartaExemplo.valor}
            </span>
            {/* Ícone do naipe no centro */}
            <span style={{
                fontSize: '22px',
                filter: configNaipe.sombra !== 'none'
                    ? `drop-shadow(0 0 4px ${configNaipe.sombra})`
                    : 'none'
            }}>
                {configNaipe.icone}
            </span>
        </div>
    );
}


// ================================================================
// COMPONENTE PRINCIPAL: ThemeSelector
// ================================================================
export default function ThemeSelector({ temaAtual, premium = false, onSalvar }) {

    // useState: cria uma variável de estado local do componente
    // [valor, setValor] = useState(valorInicial)
    // Quando setValor é chamado, o componente re-renderiza automaticamente
    const [temaSelecionado, setTemaSelecionado] = useState(temaAtual || 'classico');

    // Pega a lista completa de temas do deck.js
    const temas = listarTemas();

    // Estilos do container principal
    const estiloContainer = {
        padding: '20px',
        maxWidth: '500px',
    };

    // Estilo do grid de temas
    const estiloGrid = {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginTop: '16px',
        marginBottom: '20px',
    };

    return (
        <div style={estiloContainer}>
            <h3 style={{ color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Tema das Cartas
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: '0 0 16px' }}>
                Escolha como as cartas aparecem na mesa
            </p>

            <div style={estiloGrid}>
                {/* Renderiza um card para cada tema disponível */}
                {temas.map(tema => {
                    // Verifica se o jogador pode usar este tema
                    const disponivel = temaDisponivel(tema.id, premium);
                    const selecionado = temaSelecionado === tema.id;

                    // Estilo do card muda se está selecionado ou bloqueado
                    const estiloCard = {
                        border: selecionado
                            ? '2px solid var(--color-text-info)'
                            : '2px solid var(--color-border-tertiary)',
                        borderRadius: '12px',
                        padding: '12px',
                        cursor: disponivel ? 'pointer' : 'not-allowed',
                        opacity: disponivel ? 1 : 0.5,
                        backgroundColor: selecionado
                            ? 'var(--color-background-info)'
                            : 'var(--color-background-secondary)',
                        transition: 'all 0.2s',
                        position: 'relative',
                    };

                    return (
                        <div
                            key={tema.id}
                            style={estiloCard}
                            // onClick só funciona se o tema estiver disponível
                            onClick={() => disponivel && setTemaSelecionado(tema.id)}
                        >
                            {/* Badge de PREMIUM no canto superior direito */}
                            {tema.premium && (
                                <span style={{
                                    position: 'absolute',
                                    top: '6px',
                                    right: '6px',
                                    backgroundColor: '#D97706',
                                    color: '#FEF3C7',
                                    fontSize: '10px',
                                    fontWeight: '500',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                }}>
                                    PREMIUM
                                </span>
                            )}

                            {/* Preview das cartas (frente e verso) */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                                <PreviewCarta tema={tema} virada={false} />
                                <PreviewCarta tema={tema} virada={true} />
                            </div>

                            {/* Nome e descrição do tema */}
                            <p style={{
                                margin: '0 0 2px',
                                fontWeight: '500',
                                fontSize: '14px',
                                color: 'var(--color-text-primary)',
                            }}>
                                {tema.nome}
                            </p>
                            <p style={{
                                margin: 0,
                                fontSize: '12px',
                                color: 'var(--color-text-secondary)',
                            }}>
                                {tema.descricao}
                            </p>

                            {/* Ícone de selecionado */}
                            {selecionado && (
                                <div style={{
                                    position: 'absolute',
                                    top: '8px',
                                    left: '8px',
                                    width: '18px',
                                    height: '18px',
                                    backgroundColor: 'var(--color-text-info)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    color: 'white',
                                }}>
                                    ✓
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Botão de confirmar */}
            <button
                onClick={() => onSalvar(temaSelecionado)}
                disabled={temaSelecionado === temaAtual}
                style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: temaSelecionado === temaAtual
                        ? 'var(--color-background-tertiary)'
                        : 'var(--color-text-info)',
                    color: temaSelecionado === temaAtual
                        ? 'var(--color-text-tertiary)'
                        : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '500',
                    cursor: temaSelecionado === temaAtual ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                }}
            >
                {temaSelecionado === temaAtual
                    ? 'Este tema já está ativo'
                    : `Usar tema ${TEMAS_MAP[temaSelecionado]?.nome || temaSelecionado}`
                }
            </button>

            {/* Aviso para usuários não-premium */}
            {!premium && (
                <p style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    color: 'var(--color-text-secondary)',
                    textAlign: 'center',
                }}>
                    Temas premium disponíveis com a assinatura Pro
                </p>
            )}
        </div>
    );
}

// Mapa auxiliar para acessar temas pelo id no botão de confirmar
const TEMAS_MAP = {
    classico:     { nome: 'Clássico'     },
    quatroCores:  { nome: '4 Cores'      },
    neon:         { nome: 'Neon'         },
    dourado:      { nome: 'Dourado'      },
    minimalista:  { nome: 'Minimalista'  },
};
