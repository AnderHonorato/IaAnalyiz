// src/hooks/useChatStream.js
// Hook que gerencia a conexão SSE com o backend e controla
// o estado do pensamento/resposta com o novo fluxo:
//
// 1. Usuário envia → estado 'waiting' (spinner + mensagens rotativas)
// 2. reasoning_start → estado 'streaming' (pensamento aparece em chunks)
// 3. reasoning_end → pensamento completo, aguarda resposta
// 4. done → resposta chega, estado 'done', reasoning colapsa após 2s
//
// GARANTIA: a resposta NUNCA aparece antes do reasoning terminar.

import { useState, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useChatStream() {
  // Estado do painel de pensamento
  // 'hidden' | 'waiting' | 'streaming' | 'done'
  const [thinkingState,   setThinkingState]   = useState('hidden');
  const [reasoningText,   setReasoningText]   = useState('');
  const [toolSteps,       setToolSteps]       = useState([]);
  const [isLoading,       setIsLoading]       = useState(false);

  // Buffer interno — a resposta fica aqui até o reasoning terminar
  const pendingReply     = useRef(null);
  const reasoningDone    = useRef(false);
  const reasoningBuffer  = useRef('');

  // Reseta o estado para uma nova mensagem
  const resetThinkingState = useCallback(() => {
    setThinkingState('waiting');
    setReasoningText('');
    setToolSteps([]);
    pendingReply.current    = null;
    reasoningDone.current   = false;
    reasoningBuffer.current = '';
  }, []);

  /**
   * Envia mensagem via SSE e processa os eventos do backend
   * @param {object} payload - dados da mensagem (message, sessionId, userId, etc.)
   * @param {function} onDone - callback(reply, sources, sessionId, reasoning, toolsExecutadas, durationMs)
   * @param {function} onError - callback(errorMsg)
   */
  const sendMessage = useCallback(async (payload, onDone, onError) => {
    setIsLoading(true);
    resetThinkingState();

    try {
      const response = await fetch(`${API_URL}/api/ia/chat/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      // Processa o stream SSE linha a linha
      const processLine = (line) => {
        // SSE tem formato: "event: tipo\ndata: json\n\n"
        if (line.startsWith('event: ')) {
          buffer = line.slice(7).trim(); // salva o event type
          return;
        }
        if (line.startsWith('data: ')) {
          const eventType = buffer;
          buffer = '';
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { return; }

          switch (eventType) {

            // ── Arquivos e tools ──────────────────────────────────────────
            case 'step':
              setToolSteps(prev => [...prev, { msg: data.msg, tool: data.tool, done: false, ok: true, key: Date.now() }]);
              break;

            case 'step_done':
              setToolSteps(prev => prev.map((s, i) =>
                i === prev.length - 1 ? { ...s, done: true } : s
              ));
              break;

            case 'tool_result':
              setToolSteps(prev => prev.map((s, i) =>
                i === prev.length - 1 ? { ...s, done: true, ok: data.ok } : s
              ));
              break;

            // ── Reasoning ────────────────────────────────────────────────
            case 'reasoning_start':
              setThinkingState('streaming');
              reasoningBuffer.current = '';
              break;

            case 'reasoning_chunk':
              reasoningBuffer.current += (data.text || '');
              setReasoningText(reasoningBuffer.current);
              break;

            case 'reasoning_end':
              // Reasoning terminou
              reasoningBuffer.current = data.fullText || reasoningBuffer.current;
              setReasoningText(reasoningBuffer.current);
              reasoningDone.current = true;
              // Se a resposta já chegou antes do reasoning terminar, despacha agora
              if (pendingReply.current) {
                const r = pendingReply.current;
                pendingReply.current = null;
                setThinkingState('done');
                setIsLoading(false);
                onDone(r.reply, r.sources, r.sessionId, r.reasoning, r.toolsExecutadas, r.durationMs);
              }
              break;

            // ── Resposta final ────────────────────────────────────────────
            case 'done':
              if (reasoningDone.current) {
                // Reasoning já terminou → despacha imediatamente
                setThinkingState('done');
                setIsLoading(false);
                onDone(data.reply, data.sources, data.sessionId, data.reasoning, data.toolsExecutadas, data.durationMs);
              } else {
                // Reasoning ainda não terminou → guarda para depois
                pendingReply.current = data;
              }
              break;

            case 'error':
              setThinkingState('hidden');
              setIsLoading(false);
              onError(data.message || 'Erro interno. Tente novamente.');
              break;

            default:
              break;
          }
        }
      };

      // Lê o stream
      let sseBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop(); // última linha pode estar incompleta

        for (const line of lines) {
          processLine(line);
        }
      }

      // Processa qualquer dado restante
      if (sseBuffer.trim()) processLine(sseBuffer);

    } catch (err) {
      console.error('[useChatStream]', err);
      setThinkingState('hidden');
      setIsLoading(false);
      onError('Erro de conexão. Verifique sua rede e tente novamente.');
    }
  }, [resetThinkingState]);

  return {
    thinkingState,
    reasoningText,
    toolSteps,
    isLoading,
    sendMessage,
  };
}