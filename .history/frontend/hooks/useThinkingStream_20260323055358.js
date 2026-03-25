// frontend/src/hooks/useThinkingStream.js
// Hook que gerencia todo o estado do "Thinking" progressivo
// Conecta os eventos SSE do backend com o ThinkingPanel
//
// Eventos SSE esperados do backend (iaService.js / iaRoutes.js):
//   event: reasoning_start   → inicia o painel
//   event: reasoning_chunk   → texto livre de raciocínio (streaming)
//   event: step              → nova etapa: { msg: "Consultando banco..." }
//   event: step_done         → etapa concluída: { stepIndex: 0 }
//   event: done              → resposta final pronta

import { useState, useRef, useCallback } from 'react';

// ─── Velocidade do buffer de digitação de cada chunk ─────────────────────────
// O backend pode mandar chunks rápidos; o buffer os re-emite lentamente
const CHUNK_EMIT_INTERVAL_MS = 18;   // ms entre cada char do chunk
const MIN_STEP_DURATION_MS   = 800;  // cada etapa dura pelo menos este tempo

export function useThinkingStream() {
  // ─── Estado público ──────────────────────────────────────────────────────
  const [isLive,     setIsLive]     = useState(false);
  const [steps,      setSteps]      = useState([]);   // array de strings
  const [stepDones,  setStepDones]  = useState([]);   // array de booleans
  const [reasoning,  setReasoning]  = useState('');   // texto de raciocínio livre
  const [liveItems,  setLiveItems]  = useState([]);   // items para o UnifiedPanel se preferir

  // ─── Refs internas ───────────────────────────────────────────────────────
  const stepTimersRef    = useRef([]);   // timers de duração mínima por etapa
  const chunkQueueRef    = useRef([]);   // fila de chunks pendentes
  const chunkTimerRef    = useRef(null); // timer do buffer de chunks
  const stepCounterRef   = useRef(0);    // chave incremental para cada step

  // ─── Limpa tudo ──────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setIsLive(false);
    setSteps([]);
    setStepDones([]);
    setReasoning('');
    setLiveItems([]);
    chunkQueueRef.current  = [];
    stepTimersRef.current.forEach(t => clearTimeout(t));
    stepTimersRef.current  = [];
    clearInterval(chunkTimerRef.current);
    stepCounterRef.current = 0;
  }, []);

  // ─── Buffer de chunks: re-emite lentamente ───────────────────────────────
  const flushChunkQueue = useCallback(() => {
    if (chunkQueueRef.current.length === 0) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
      return;
    }
    const char = chunkQueueRef.current.shift();
    setReasoning(prev => prev + char);
    setLiveItems(prev => {
      const last = prev[prev.length - 1];
      if (last?.kind === 'text') {
        const next = [...prev];
        next[next.length - 1] = { ...last, text: last.text + char };
        return next;
      }
      return [...prev, { kind: 'text', text: char }];
    });
  }, []);

  const enqueueChunk = useCallback((text) => {
    // Coloca cada caractere na fila
    for (const char of text) {
      chunkQueueRef.current.push(char);
    }
    // Inicia o timer se não estiver rodando
    if (!chunkTimerRef.current) {
      chunkTimerRef.current = setInterval(flushChunkQueue, CHUNK_EMIT_INTERVAL_MS);
    }
  }, [flushChunkQueue]);

  // ─── Handlers para cada evento SSE ───────────────────────────────────────

  const handleReasoningStart = useCallback(() => {
    reset();
    setIsLive(true);
  }, [reset]);

  const handleReasoningChunk = useCallback((text) => {
    enqueueChunk(text || '');
  }, [enqueueChunk]);

  const handleReasoningEnd = useCallback((fullText) => {
    // Drena a fila imediatamente ao receber o texto completo
    clearInterval(chunkTimerRef.current);
    chunkTimerRef.current = null;
    chunkQueueRef.current = [];
    if (fullText) {
      setReasoning(fullText);
      setLiveItems(prev => {
        const last = prev[prev.length - 1];
        if (last?.kind === 'text') {
          const next = [...prev];
          next[next.length - 1] = { ...last, text: fullText };
          return next;
        }
        return [...prev, { kind: 'text', text: fullText }];
      });
    }
  }, []);

  const handleStep = useCallback((msg) => {
    const key = stepCounterRef.current++;
    setSteps(prev => [...prev, msg]);
    setStepDones(prev => [...prev, false]);
    setLiveItems(prev => [...prev, {
      kind:     'step',
      msg,
      stepKey:  key,
      done:     false,
      isActive: true,
    }]);

    // Garante duração mínima antes de poder ser marcada como done
    const timer = setTimeout(() => {
      // Mínimo cumprido — não faz nada automaticamente, espera step_done do backend
    }, MIN_STEP_DURATION_MS);
    stepTimersRef.current.push(timer);
  }, []);

  const handleStepDone = useCallback((stepIndex) => {
    setStepDones(prev => {
      const next = [...prev];
      if (stepIndex < next.length) next[stepIndex] = true;
      return next;
    });
    setLiveItems(prev => prev.map((item, i) =>
      item.kind === 'step' && item.stepKey === stepIndex
        ? { ...item, done: true, isActive: false }
        : item
    ));
  }, []);

  const handleDone = useCallback(() => {
    // Drena qualquer chunk pendente imediatamente
    clearInterval(chunkTimerRef.current);
    chunkTimerRef.current = null;
    const remaining = chunkQueueRef.current.join('');
    chunkQueueRef.current = [];
    if (remaining) {
      setReasoning(prev => prev + remaining);
    }
    // Marca todas as etapas como done
    setStepDones(prev => prev.map(() => true));
    setLiveItems(prev => prev.map(item =>
      item.kind === 'step' ? { ...item, done: true, isActive: false } : item
    ));
    setIsLive(false);
  }, []);

  // ─── Dispatcher central: chame este com o evento SSE ─────────────────────
  // Exemplo de uso em handleSend:
  //   if (ev === 'reasoning_start')  thinkingStream.dispatch('reasoning_start', {})
  //   if (ev === 'reasoning_chunk')  thinkingStream.dispatch('reasoning_chunk', { text: data.text })
  //   if (ev === 'step')             thinkingStream.dispatch('step', { msg: data.msg })
  //   if (ev === 'step_done')        thinkingStream.dispatch('step_done', { stepIndex: data.stepIndex })
  //   if (ev === 'done')             thinkingStream.dispatch('done', data)

  const dispatch = useCallback((eventType, data = {}) => {
    switch (eventType) {
      case 'reasoning_start': handleReasoningStart(); break;
      case 'reasoning_chunk': handleReasoningChunk(data.text); break;
      case 'reasoning_end':   handleReasoningEnd(data.fullText); break;
      case 'step':            handleStep(data.msg); break;
      case 'step_done':       handleStepDone(data.stepIndex); break;
      case 'done':            handleDone(); break;
      default: break;
    }
  }, [handleReasoningStart, handleReasoningChunk, handleReasoningEnd, handleStep, handleStepDone, handleDone]);

  return {
    // Estado
    isLive,
    steps,
    stepDones,
    reasoning,
    liveItems,

    // Ações
    dispatch,
    reset,
  };
}