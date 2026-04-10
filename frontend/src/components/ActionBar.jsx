/* ================================================================
   ARQUIVO: frontend/src/components/ActionBar.jsx
   
   CONCEITO GERAL:
   Componente React que exibe os botões de ação do jogador:
   FOLD, CHECK/CALL e RAISE com slider.

   FILOSOFIA MOBILE-FIRST:
   Projetado primeiro para toque (dedos grandes, área de toque
   generosa) e depois adaptado para desktop com atalhos de teclado.
   
   Regras de design mobile:
     → Botões com mínimo 48px de altura (padrão Google Material)
     → Slider largo o suficiente para arrastar com o polegar
     → Feedback visual imediato ao toque (scale + opacity)
     → Sem hover states como comportamento principal

   PROPS:
     ehMinhaVez    → boolean: habilita ou desabilita os botões
     paraPagar     → number: quanto custa para continuar na mão
     ehCheckGratis → boolean: true = mostra CHECK, false = mostra CALL
     saldoAtual    → number: fichas que o jogador tem na mesa
     apostaRodada  → number: quanto o jogador já apostou nessa rodada
     maiorAposta   → number: maior aposta atual da mesa
     bigBlind      → number: valor do big blind (aposta mínima base)
     onAcao        → function(acao, valor): callback chamado ao agir
                     ex: onAcao('RAISE', 120)

   COMO CONECTAR COM O SOCKET.IO:
     No componente pai (Table.jsx ou App.jsx):
     <ActionBar onAcao={(acao, valor) => socket.emit('acao', { acao, valor })} />
================================================================ */

import { useState, useEffect, useCallback, useMemo } from 'react';


// ================================================================
// BLOCO 1: CONSTANTES DE ESTILO
//
// Por que definir estilos fora do componente?
//   Objetos definidos DENTRO do componente são recriados a cada
//   render. Fora do componente, são criados uma vez só na memória.
//   Para estilos estáticos que não dependem de props/state,
//   isso é uma boa prática de performance.
// ================================================================

// Container fixo na parte inferior próximo às cartas
const estiloContainer = {
    position:        'fixed',
    bottom:          0,
    left:            0,
    right:           0,
    zIndex:          500,
    padding:         '10px 12px 16px',  // padding extra embaixo para safe area (iPhone)
    // Safe area do iOS: respeita o "notch" e a barra home
    paddingBottom:   'max(16px, env(safe-area-inset-bottom))',
    background:      'linear-gradient(to top, rgba(10,15,30,0.98) 80%, transparent)',
    backdropFilter:  'blur(4px)',
};

// Grid dos 3 botões principais
const estiloBotoes = {
    display:             'grid',
    gridTemplateColumns: '1fr 1.4fr 1fr',  // Call é mais largo (ação principal)
    gap:                 '8px',
    marginTop:           '10px',
};


// ================================================================
// BLOCO 2: COMPONENTE PRINCIPAL ActionBar
// ================================================================

export default function ActionBar({
    ehMinhaVez    = false,
    paraPagar     = 0,
    ehCheckGratis = true,
    saldoAtual    = 0,
    apostaRodada  = 0,
    maiorAposta   = 0,
    bigBlind      = 20,
    onAcao,
}) {

    // ----------------------------------------------------------------
    // STATE
    //
    // valorRaise: valor atual do slider de raise
    // pressionado: qual botão está sendo pressionado agora
    //              (para feedback visual de toque)
    // ----------------------------------------------------------------
    const [valorRaise,  setValorRaise ] = useState(0);
    const [pressionado, setPressionado] = useState(null);


    // ----------------------------------------------------------------
    // CÁLCULO DOS LIMITES DO SLIDER
    //
    // minRaise: raise mínimo legal segundo as regras do poker
    //   → Deve ser pelo menos o dobro da maior aposta atual
    //   → Ou pelo menos 1 big blind se ninguém apostou ainda
    //
    // maxRaise: saldo total que o jogador pode apostar (all-in)
    //   → saldoAtual + apostaRodada (o que já colocou conta)
    //
    // stepRaise: incremento do slider
    //   → 1 big blind por passo (padrão do poker online)
    // ----------------------------------------------------------------
    const maxRaise  = saldoAtual + apostaRodada;
    const minRaise  = Math.min(
        Math.max(maiorAposta * 2, bigBlind),
        maxRaise  // não pode ser maior que o all-in
    );
    const stepRaise = bigBlind;

    // useMemo: recalcula o valorInicial apenas quando minRaise ou ehMinhaVez mudam.
    //
    // POR QUE useMemo E NÃO useEffect ou useRef?
    //   useEffect com setState → renders em cascata (ESLint proíbe)
    //   useRef durante render  → acesso proibido no render (ESLint proíbe)
    //   useMemo               → calcula valor DURANTE o render, de forma
    //                           segura e sem efeitos colaterais.
    //
    // Sempre que ehMinhaVez muda (é a vez do jogador) ou os limites
    // mudam, o slider volta automaticamente para o valor mínimo válido.
    // O useState abaixo usa este valor como estado inicial e o
    // slider pode ser arrastado livremente após isso.
    const valorInicial = useMemo(
        () => minRaise,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [minRaise, ehMinhaVez]
    );

    // Sincroniza o slider com o valorInicial calculado pelo useMemo.
    // useState não reage automaticamente quando o valor inicial muda —
    // por isso precisamos de um useEffect APENAS para sincronizar,
    // sem lógica de negócio dentro dele.
    useEffect(() => {
        setValorRaise(valorInicial);
    }, [valorInicial]);


    // ----------------------------------------------------------------
    // HANDLER DE AÇÃO
    //
    // useCallback: memoriza a função para não recriar a cada render.
    // Só recria quando as dependências mudam.
    // É uma otimização — evita renders desnecessários nos filhos.
    //
    // Feedback de toque: escurece o botão por 150ms ao pressionar.
    // ----------------------------------------------------------------
    const handleAcao = useCallback((acao, valor = 0) => {
        if (!ehMinhaVez || !onAcao) return;

        // Feedback visual: marca o botão como pressionado
        setPressionado(acao);
        setTimeout(() => setPressionado(null), 150);

        // Vibração háptica no mobile (se suportado)
        // navigator.vibrate é suportado no Android Chrome
        // No iOS Safari não funciona — sem erros pois verificamos antes
        if (navigator.vibrate) navigator.vibrate(30);

        onAcao(acao, valor);
    }, [ehMinhaVez, onAcao]);


    // ----------------------------------------------------------------
    // ATALHOS DE TECLADO (DESKTOP)
    //
    // useEffect com addEventListener para capturar teclas globais.
    // O cleanup (return) remove o listener quando o componente
    // é desmontado — evita memory leak.
    //
    // F1 = FOLD, F2 = CHECK/CALL, F3 = RAISE
    // ----------------------------------------------------------------
    useEffect(() => {
        const handleTecla = (e) => {
            // Ignora se estiver digitando em algum input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!ehMinhaVez) return;

            if (e.key === 'F1') { e.preventDefault(); handleAcao('FOLD'); }
            if (e.key === 'F2') { e.preventDefault(); handleAcao(ehCheckGratis ? 'CHECK' : 'CALL', paraPagar); }
            if (e.key === 'F3') { e.preventDefault(); handleAcao('RAISE', valorRaise); }
        };

        // addEventListener no document captura qualquer tecla na página
        document.addEventListener('keydown', handleTecla);

        // Cleanup: remove o listener quando o componente sai da tela
        return () => document.removeEventListener('keydown', handleTecla);

    }, [ehMinhaVez, ehCheckGratis, paraPagar, valorRaise, handleAcao]);


    // ----------------------------------------------------------------
    // RENDERIZAÇÃO CONDICIONAL
    // Se não for a vez do jogador, mostra a barra desabilitada
    // em vez de esconder — o jogador vê que os botões existem mas
    // estão bloqueados. Melhor UX que sumir e aparecer.
    // ----------------------------------------------------------------


    // ================================================================
    // RENDERIZAÇÃO
    // ================================================================
    return (
        <div style={estiloContainer}>

            {/* ---- ÁREA DO SLIDER DE RAISE ---- */}
            <div style={{
                opacity:    ehMinhaVez ? 1 : 0.4,
                transition: 'opacity 0.3s',
            }}>
                {/* Linha superior: label + valor atual + botão all-in */}
                <div style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:            '8px',
                    marginBottom:   '6px',
                }}>
                    <span style={{
                        fontSize:   '11px',
                        color:      'rgba(255,255,255,0.45)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                    }}>
                        Raise
                    </span>

                    {/* Valor do raise — vermelho se for all-in */}
                    <span style={{
                        fontSize:   '15px',
                        fontWeight: '600',
                        color:      valorRaise >= maxRaise ? '#EF4444' : '#F8FAFC',
                        flex:       1,
                        textAlign:  'center',
                    }}>
                        {valorRaise >= maxRaise
                            ? `ALL-IN $${maxRaise}`
                            : `$${valorRaise}`
                        }
                    </span>

                    {/* Botão All-in rápido */}
                    <button
                        onPointerDown={() => setValorRaise(maxRaise)}
                        disabled={!ehMinhaVez}
                        style={{
                            background:   'rgba(239,68,68,0.15)',
                            border:       '1px solid rgba(239,68,68,0.4)',
                            borderRadius: '6px',
                            color:        '#EF4444',
                            fontSize:     '11px',
                            fontWeight:   '600',
                            padding:      '4px 8px',
                            cursor:       ehMinhaVez ? 'pointer' : 'default',
                            flexShrink:   0,
                            // Mínimo 44px de altura para toque (acessibilidade mobile)
                            minHeight:    '32px',
                        }}
                    >
                        ALL-IN
                    </button>
                </div>

                {/* Slider de raise
                    onPointerDown/Up: funciona em touch E mouse
                    onChange: atualiza o valor enquanto arrasta */}
                <input
                    type="range"
                    min={minRaise}
                    max={maxRaise}
                    step={stepRaise}
                    value={valorRaise}
                    disabled={!ehMinhaVez}
                    onChange={e => setValorRaise(parseInt(e.target.value))}
                    style={{
                        width:        '100%',
                        accentColor:  '#7C3AED',  // Cor do thumb e da trilha
                        height:       '4px',
                        cursor:       ehMinhaVez ? 'pointer' : 'default',
                        // Área de toque maior no mobile via padding
                        padding:      '10px 0',
                        margin:       '-10px 0',
                        boxSizing:    'content-box',
                    }}
                />

                {/* Atalhos rápidos de porcentagem do pote */}
                <BotoesRapidos
                    ehMinhaVez={ehMinhaVez}
                    minRaise={minRaise}
                    maxRaise={maxRaise}
                    pote={maiorAposta * 2 || bigBlind * 2}
                    onSelecionar={setValorRaise}
                />
            </div>

            {/* ---- BOTÕES PRINCIPAIS ---- */}
            <div style={{
                ...estiloBotoes,
                opacity:    ehMinhaVez ? 1 : 0.35,
                pointerEvents: ehMinhaVez ? 'all' : 'none',
            }}>

                {/* FOLD */}
                <BotaoAcao
                    label="Fold"
                    sublabel="F1"
                    cor="#EF4444"
                    corFundo="rgba(239,68,68,0.12)"
                    corBorda="rgba(239,68,68,0.35)"
                    pressionado={pressionado === 'FOLD'}
                    onPress={() => handleAcao('FOLD')}
                />

                {/* CHECK ou CALL (centro, maior) */}
                {ehCheckGratis ? (
                    <BotaoAcao
                        label="Check"
                        sublabel="F2 · Mesa"
                        cor="#22C55E"
                        corFundo="rgba(34,197,94,0.15)"
                        corBorda="rgba(34,197,94,0.4)"
                        destaque
                        pressionado={pressionado === 'CHECK'}
                        onPress={() => handleAcao('CHECK', 0)}
                    />
                ) : (
                    <BotaoAcao
                        label={`Call $${paraPagar}`}
                        sublabel="F2 · Pagar"
                        cor="#3B82F6"
                        corFundo="rgba(59,130,246,0.15)"
                        corBorda="rgba(59,130,246,0.4)"
                        destaque
                        pressionado={pressionado === 'CALL'}
                        onPress={() => handleAcao('CALL', paraPagar)}
                    />
                )}

                {/* RAISE */}
                <BotaoAcao
                    label="Raise"
                    sublabel="F3"
                    cor="#A855F7"
                    corFundo="rgba(168,85,247,0.12)"
                    corBorda="rgba(168,85,247,0.35)"
                    pressionado={pressionado === 'RAISE'}
                    onPress={() => handleAcao('RAISE', valorRaise)}
                />

            </div>

        </div>
    );
}


// ================================================================
// BLOCO 3: COMPONENTE BotaoAcao
//
// Componente filho que renderiza cada botão individual.
// Separar em componente próprio mantém o JSX do pai limpo.
//
// Por que onPointerDown e não onClick?
//   onPointerDown dispara imediatamente ao toque/clique.
//   onClick só dispara ao soltar — introduz delay perceptível
//   no mobile, o que piora a experiência.
//
// Props:
//   label      → texto principal do botão
//   sublabel   → texto menor abaixo (atalho de teclado)
//   cor        → cor do texto e da borda
//   corFundo   → cor de fundo semitransparente
//   corBorda   → cor da borda
//   destaque   → boolean: botão central é maior
//   pressionado → boolean: está sendo pressionado agora?
//   onPress    → callback ao pressionar
// ================================================================

function BotaoAcao({ label, sublabel, cor, corFundo, corBorda, destaque, pressionado, onPress }) {

    return (
        <button
            onPointerDown={onPress}
            style={{
                background:    pressionado ? corFundo.replace('0.12', '0.25').replace('0.15', '0.3') : corFundo,
                border:        `1px solid ${corBorda}`,
                borderRadius:  '12px',
                color:         cor,
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                justifyContent: 'center',
                gap:           '2px',

                // Altura mínima generosa para toque mobile
                minHeight:     destaque ? '60px' : '54px',
                padding:       '8px 4px',

                // Feedback visual de toque: escurece e encolhe levemente
                transform:     pressionado ? 'scale(0.96)' : 'scale(1)',
                opacity:       pressionado ? 0.8 : 1,
                transition:    'transform 0.1s, opacity 0.1s, background 0.15s',

                cursor:        'pointer',

                // Remove estilo padrão do botão no mobile
                WebkitTapHighlightColor: 'transparent',
                outline:       'none',
                userSelect:    'none',
            }}
        >
            {/* Texto principal */}
            <span style={{
                fontSize:   destaque ? '15px' : '14px',
                fontWeight: '600',
                lineHeight: 1.2,
                // Garante que textos longos como "Call $120" não quebrem
                whiteSpace: 'nowrap',
                overflow:   'hidden',
                textOverflow: 'ellipsis',
                maxWidth:   '100%',
                padding:    '0 4px',
            }}>
                {label}
            </span>

            {/* Atalho de teclado — só aparece em telas grandes */}
            <span style={{
                fontSize:   '10px',
                color:      cor.replace(')', ', 0.5)').replace('rgb', 'rgba'),
                // Em mobile (< 640px) esconde o sublabel para não poluir
                // @media não funciona em inline style — usamos uma solução JS
                display:    window.innerWidth < 400 ? 'none' : 'block',
            }}>
                {sublabel}
            </span>
        </button>
    );
}


// ================================================================
// BLOCO 4: COMPONENTE BotoesRapidos
//
// Botões de atalho para valores comuns de raise:
//   Min, 1/3 do pote, 1/2 pote, 2/3 pote, Pote
//
// Por que esses valores?
//   São os tamanhos de aposta mais usados no poker profissional.
//   "1/2 pote" e "2/3 pote" são as apostas mais comuns no cash game.
//   Oferecer esses atalhos acelera muito o jogo no mobile.
//
// Props:
//   ehMinhaVez  → boolean: habilita os botões
//   minRaise    → número mínimo do raise
//   maxRaise    → all-in (máximo)
//   bigBlind    → valor do BB para cálculo
//   pote        → estimativa do pote para calcular frações
//   onSelecionar → callback com o valor selecionado
// ================================================================

function BotoesRapidos({ ehMinhaVez, minRaise, maxRaise, pote, onSelecionar }) {

    // Define os atalhos com seus labels e valores calculados
    const atalhos = [
        { label: 'Min',  valor: minRaise },
        { label: '½',    valor: Math.round(pote * 0.5) },
        { label: '⅔',    valor: Math.round(pote * 0.67) },
        { label: 'Pote', valor: pote },
    ].map(a => ({
        ...a,
        // Garante que o valor está dentro dos limites legais
        valor: Math.max(minRaise, Math.min(maxRaise, a.valor)),
    }));

    return (
        <div style={{
            display:             'flex',
            gap:                 '6px',
            marginTop:           '8px',
            justifyContent:      'flex-end',
        }}>
            {atalhos.map(({ label, valor }) => (
                <button
                    key={label}
                    onPointerDown={() => ehMinhaVez && onSelecionar(valor)}
                    style={{
                        background:    'rgba(255,255,255,0.06)',
                        border:        '1px solid rgba(255,255,255,0.12)',
                        borderRadius:  '6px',
                        color:         'rgba(255,255,255,0.55)',
                        fontSize:      '11px',
                        fontWeight:    '500',
                        padding:       '4px 8px',
                        minHeight:     '28px',
                        cursor:        ehMinhaVez ? 'pointer' : 'default',
                        WebkitTapHighlightColor: 'transparent',
                        outline:       'none',
                    }}
                >
                    {label}
                    <span style={{ display: 'block', fontSize: '9px', opacity: 0.6 }}>
                        ${valor}
                    </span>
                </button>
            ))}
        </div>
    );
}
