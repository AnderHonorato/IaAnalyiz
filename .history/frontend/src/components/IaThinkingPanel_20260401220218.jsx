/**
 * frontend/src/components/IaThinkingPanel.jsx
 * 
 * Propósito:
 * Renderizar progressão visual de "pensamento" da IA tipo Claude/Gemini.
 * Sistema de etapas com efeito typewriter (letra por letra).
 * Mostra quanto tempo a IA "pensou" antes de responder.
 * 
 * Responsabilidades:
 * - Renderizar etapas de raciocínio de forma progressiva
 * - Efeito typewriter em cada etapa (texto aparece letra por letra)
 * - Acordeão colapsável mostrando tempo de pensamento
 * - Sincronização com eventos SSE do backend
 * - Controle de velocidade de digitação
 * 
 * Características:
 * - Typewriter effect com velocidade configurável
 * - Delay entre etapas de processamento
 * - Colapso automático após conclusão
 * - Contador de tempo decorrido
 * - Visualização de progresso com ícones
 * 
 * Props:
 *   - inicialSteps: Array de etapas de pensamento
 *   - onUpdate: Callback quando pensamento é atualizado
 *   - ref: ForwardRef para controle externo
 * 
 * Métodos Expostos (via forwardRef):
 *   - addStep(text): Adiciona nova etapa de pensamento
 *   - clearSteps(): Limpa todas as etapas
 *   - finish(): Marca pensamento como finalizado
 * 
 * Velocidades Configuráveis:
 *   - TYPEWRITER_SPEED_MS: Velocidade de digitação
 *   - STEP_APPEAR_DELAY_MS: Delay entre etapas
 *   - COLLAPSE_AFTER_MS: Tempo para colapso automático
 * 
 * @author Anderson Honorato
 * @version 1.2.0
 * @requires React, lucide-react, forwardRef, useImperativeHandle
 */

// frontend/src/components/IaThinkingPanel.jsx
// Sistema completo de "Pensamento Progressivo" estilo Claude/Gemini
// - Etapas com typewriter letra por letra
// - Accordion "Pensou por X segundos" que colapsa
// - Buffer de velocidade controlável
// - Sincronizado com os eventos SSE do backend

import React, {
  useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle
} from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Sparkles } from 'lucide-react';

// ╪═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE VELOCIDADE
// ╪═══════════════════════════════════════════════════════════════════════════

// Ajuste aqui para tornar o efeito mais lento/rápido globalmente
const TYPEWRITER_SPEED_MS   = 28;   // ms por caractere (maior = mais lento)
const STEP_APPEAR_DELAY_MS  = 320;  // delay entre uma etapa terminar e a próxima começar
const COLLAPSE_AFTER_MS     = 1200; // ms após o fim do thinking para colapsar
const TICK_INTERVAL_MS      = 1000; // atualização do contador "X segundos"

// ╪═══════════════════════════════════════════════════════════════════════════
// ETAPAS PADRÃO DE PENSAMENTO
// ╪═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_THINKING_STEPS = [
  'Analisando intenção da mensagem…',
  'Consultando banco de dados local…',
  'Cruzando dados de logística e e-commerce…',
  'Verificando permissões e contexto do usuário…',
  'Selecionando ferramentas necessárias…',
  'Gerando resposta final…',
];

// ╪═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES UTILITÁRIAS
// ╪═══════════════════════════════════════════════════════════════════════════

/** Formata tempo decorrido em "X segundos" ou "X min" */
function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} segundo${s !== 1 ? 's' : ''}`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60}s`;
}

// ─── Componente: uma única linha de etapa com typewriter ─────────────────────
function ThinkingStep({ text, status, th }) {
  // status: 'waiting' | 'typing' | 'done'
  const [displayed, setDisplayed] = useState('');
  const timerRef   = useRef(null);
  const doneRef    = useRef(false);

  useEffect(() => {
    if (status !== 'typing') {
      if (status === 'done') setDisplayed(text);
      return;
    }

    setDisplayed('');
    doneRef.current = false;
    clearInterval(timerRef.current);

    let idx = 0;
    timerRef.current = setInterval(() => {
      idx++;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(timerRef.current);
        doneRef.current = true;
      }
    }, TYPEWRITER_SPEED_MS);

    return () => clearInterval(timerRef.current);
  }, [text, status]);

  const isDone    = status === 'done';
  const isTyping  = status === 'typing';
  const isWaiting = status === 'waiting';
  const showCursor = isTyping && displayed.length < text.length;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '5px 0',
      opacity: isWaiting ? 0.35 : 1,
      transition: 'opacity 0.3s ease',
      animation: isTyping ? 'tp-fade-in 0.25s ease' : undefined,
    }}>
      {/* Ícone de estado */}
      <div style={{
        width: '16px',
        height: '16px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: '2px',
      }}>
        {isDone ? (
          <CheckCircle size={13} style={{ color: th.brand, opacity: 0.8 }} />
        ) : isTyping ? (
          <span style={{
            display: 'inline-block',
            width: '11px',
            height: '11px',
            borderRadius: '50%',
            border: `1.5px solid ${th.border}`,
            borderTop: `1.5px solid ${th.brand}`,
            animation: 'tp-spin 0.7s linear infinite',
          }} />
        ) : (
          <span style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: th.textFaint,
            display: 'inline-block',
          }} />
        )}
      </div>

      {/* Texto com typewriter */}
      <span style={{
        fontFamily: "'Google Sans Mono', 'Cascadia Code', ui-monospace, monospace",
        fontSize: '12px',
        lineHeight: '1.5',
        color: isDone ? th.textMuted : isTyping ? th.text : th.textFaint,
        fontWeight: isTyping ? 500 : 400,
        letterSpacing: '0.01em',
      }}>
        {isTyping || isDone ? displayed : text}
        {showCursor && (
          <span style={{
            display: 'inline-block',
            width: '1.5px',
            height: '13px',
            background: th.brand,
            marginLeft: '2px',
            verticalAlign: 'text-bottom',
            animation: 'tp-blink 0.7s step-end infinite',
          }} />
        )}
      </span>
    </div>
  );
}

// ─── Componente principal: ThinkingPanel ─────────────────────────────────────
// Props:
//   steps      — array de strings com as etapas de raciocínio
//   isLive     — true enquanto o backend ainda está "pensando"
//   th         — objeto de tema { brand, text, textMuted, textFaint, border, surface, bg }
//   onFinished — callback chamado quando o thinking termina e colapsa

const ThinkingPanel = forwardRef(function ThinkingPanel(
  { steps = [], isLive = false, th, onFinished },
  ref
) {
  // Índice da etapa atualmente sendo digitada
  const [activeIdx,  setActiveIdx]  = useState(0);
  // Para cada etapa: 'waiting' | 'typing' | 'done'
  const [stepStates, setStepStates] = useState(
    () => steps.map((_, i) => (i === 0 ? 'typing' : 'waiting'))
  );
  const [isOpen,     setIsOpen]     = useState(true);
  const [elapsedMs,  setElapsedMs]  = useState(0);
  const [finished,   setFinished]   = useState(false);

  const startTimeRef    = useRef(Date.now());
  const tickRef         = useRef(null);
  const collapseRef     = useRef(null);
  const containerRef    = useRef(null);
  const advanceTimerRef = useRef(null);

  // Expõe método para adicionar etapas dinamicamente (via SSE)
  useImperativeHandle(ref, () => ({
    addStep: (text) => {
      setStepStates(prev => {
        const next = [...prev];
        // Se o último está digitando, marca como done e adiciona nova
        const lastActive = next.findLastIndex(s => s === 'typing');
        if (lastActive >= 0) next[lastActive] = 'done';
        next.push('typing');
        return next;
      });
    },
    markDone: () => {
      setStepStates(prev => prev.map(s => (s === 'typing' ? 'done' : s)));
    },
  }));

  // Inicia o ticker de segundos
  useEffect(() => {
    startTimeRef.current = Date.now();
    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, TICK_INTERVAL_MS);
    return () => clearInterval(tickRef.current);
  }, []);

  // Sincroniza stepStates quando steps muda (vindo do backend via SSE)
  useEffect(() => {
    if (steps.length === 0) return;
    setStepStates(prev => {
      if (steps.length <= prev.length) return prev;
      const extra = steps.slice(prev.length).map(() => 'waiting');
      return [...prev, ...extra];
    });
  }, [steps]);

  // Máquina de estado: avança para próxima etapa após a atual terminar de digitar
  useEffect(() => {
    const currentSteps = steps.length > 0 ? steps : DEFAULT_THINKING_STEPS;

    // Observa quando a etapa ativa terminou de digitar
    const currentText = currentSteps[activeIdx] || '';
    const estimatedDuration = currentText.length * TYPEWRITER_SPEED_MS + STEP_APPEAR_DELAY_MS;

    clearTimeout(advanceTimerRef.current);

    if (!isLive || activeIdx >= currentSteps.length - 1) return;

    advanceTimerRef.current = setTimeout(() => {
      setStepStates(prev => {
        const next = [...prev];
        if (next[activeIdx] !== 'done') next[activeIdx] = 'done';
        if (next[activeIdx + 1] === 'waiting') next[activeIdx + 1] = 'typing';
        return next;
      });
      setActiveIdx(i => i + 1);
    }, estimatedDuration);

    return () => clearTimeout(advanceTimerRef.current);
  }, [activeIdx, isLive, steps]);

  // Quando isLive muda para false: marca tudo done e agenda colapso
  useEffect(() => {
    if (isLive) return;

    clearInterval(tickRef.current);
    clearTimeout(advanceTimerRef.current);

    setStepStates(prev => prev.map(() => 'done'));
    setFinished(true);

    collapseRef.current = setTimeout(() => {
      setIsOpen(false);
      onFinished?.();
    }, COLLAPSE_AFTER_MS);

    return () => clearTimeout(collapseRef.current);
  }, [isLive, onFinished]);

  // Auto-scroll para o final durante digitação
  useEffect(() => {
    if (isLive && containerRef.current && isOpen) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [stepStates, isLive, isOpen]);

  const displaySteps = steps.length > 0 ? steps : DEFAULT_THINKING_STEPS;
  const headerLabel  = finished
    ? `Pensou por ${formatDuration(elapsedMs)}`
    : 'Pensando…';

  return (
    <div style={{
      marginBottom: '14px',
      fontFamily: "'Google Sans', sans-serif",
    }}>
      {/* Cabeçalho accordion */}
      <button
        onClick={() => setIsOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '3px 0',
          color: finished ? th.textFaint : th.brand,
          fontSize: '12.5px',
          fontFamily: 'inherit',
          userSelect: 'none',
          transition: 'color 0.2s',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = finished ? th.textMuted : '#a8c7fa'; }}
        onMouseLeave={e => { e.currentTarget.style.color = finished ? th.textFaint : th.brand; }}
      >
        {/* Ícone pulsante enquanto vivo */}
        {!finished ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
          }}>
            <Sparkles
              size={13}
              style={{
                color: th.brand,
                animation: 'tp-star-pulse 1.6s ease-in-out infinite',
              }}
            />
          </span>
        ) : (
          <CheckCircle size={13} style={{ color: th.textFaint, opacity: 0.6 }} />
        )}

        <span style={{ fontWeight: 500, fontStyle: finished ? 'normal' : 'italic' }}>
          {headerLabel}
        </span>

        {isOpen
          ? <ChevronUp   size={13} style={{ opacity: 0.5, marginLeft: '2px' }} />
          : <ChevronDown size={13} style={{ opacity: 0.5, marginLeft: '2px' }} />
        }
      </button>

      {/* Corpo expansível com transição suave */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? '600px' : '0px',
        opacity: isOpen ? 1 : 0,
        transition: isOpen
          ? 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease'
          : 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
      }}>
        <div
          ref={containerRef}
          style={{
            borderLeft: `2px solid ${finished ? th.border : th.brand}`,
            marginLeft: '7px',
            paddingLeft: '14px',
            paddingTop: '8px',
            paddingBottom: '4px',
            marginTop: '6px',
            maxHeight: '320px',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            transition: 'border-color 0.4s ease',
          }}
        >
          {displaySteps.map((stepText, i) => (
            <ThinkingStep
              key={i}
              text={stepText}
              status={stepStates[i] || 'waiting'}
              th={th}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export default ThinkingPanel;

// ─── CSS necessário (injete no componente pai via <style>) ────────────────────
export const THINKING_STYLES = `
  @keyframes tp-spin       { to { transform: rotate(360deg); } }
  @keyframes tp-blink      { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes tp-fade-in    { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes tp-star-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }
`;