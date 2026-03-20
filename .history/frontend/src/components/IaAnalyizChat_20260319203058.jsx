import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, Maximize2, Minimize2, X, Bot } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ─── Detecta intenção para os passos visuais ─────────────────────────────────
function buildProcessingSteps(message) {
  const l = message.toLowerCase();
  const needsProdutos     = /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l);
  const needsDivergencias = /divergên|divergen|anomalia|erro|auditoria|varredura|inconsistên/i.test(l);
  const needsUsuarios     = /usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo|equipe|quem/i.test(l);
  const needsHistorico    = /conversamos|disse antes|lembra|anterior|histórico|falei|perguntei|resuma/i.test(l);
  const isGreeting        = /^(olá|ola|oi|hey|e aí|bom dia|boa tarde|boa noite|tudo bem)[\s!?.]*$/i.test(l.trim());

  const steps = [
    { text: 'Conectando ao kernel neural...', delay: 0 },
    { text: 'Interpretando sua solicitação...', delay: 600 },
  ];

  if (isGreeting) { steps.push({ text: 'Pronto para te atender.', delay: 900 }); return steps; }
  if (needsUsuarios) {
    steps.push({ text: 'Consultando tabela de usuários...', delay: 900 });
    steps.push({ text: 'Verificando solicitações de desbloqueio...', delay: 1500 });
    steps.push({ text: 'Validando roles e permissões...', delay: 2100 });
  }
  if (needsProdutos) {
    steps.push({ text: 'Buscando catálogo de produtos...', delay: 900 });
    steps.push({ text: 'Carregando SKUs e pesos...', delay: 1500 });
    if (l.includes('kit')) steps.push({ text: 'Calculando pesos compostos dos kits...', delay: 2000 });
  }
  if (needsDivergencias) {
    steps.push({ text: 'Acessando registro de divergências...', delay: 900 });
    steps.push({ text: 'Comparando dados internos vs. Mercado Livre...', delay: 1600 });
    steps.push({ text: 'Analisando anomalias detectadas...', delay: 2200 });
  }
  if (needsHistorico) {
    steps.push({ text: 'Recuperando histórico da conversa...', delay: 900 });
    steps.push({ text: 'Contextualizando interações anteriores...', delay: 1500 });
  }
  if (!needsProdutos && !needsDivergencias && !needsUsuarios && !needsHistorico) {
    steps.push({ text: 'Analisando contexto do sistema...', delay: 900 });
  }
  steps.push({ text: 'Dados validados, gerando resposta...', delay: steps[steps.length - 1].delay + 700 });
  return steps;
}

// ─── Indicador de processamento ───────────────────────────────────────────────
function ProcessingSteps({ message }) {
  const [visibleStep, setVisibleStep] = useState(0);
  const [elapsedMs, setElapsedMs]     = useState(0);
  const steps = buildProcessingSteps(message);

  useEffect(() => {
    const start  = Date.now();
    const timers = steps.map((s, i) => setTimeout(() => setVisibleStep(i), s.delay));
    const slow   = setTimeout(() => setVisibleStep(steps.length), 4500);
    const tick   = setInterval(() => setElapsedMs(Date.now() - start), 500);
    return () => { timers.forEach(clearTimeout); clearTimeout(slow); clearInterval(tick); };
  }, []);

  const currentText = visibleStep >= steps.length
    ? 'Está demorando mais que o esperado, aguarde...'
    : steps[Math.min(visibleStep, steps.length - 1)]?.text || '';

  return (
    <div className="flex gap-2.5 items-start">
      <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-white" style={{ animation: 'ia-spin 2s linear infinite' }} />
      </div>
      <div className="flex flex-col gap-1 pt-1">
        <p className="text-[11px] text-slate-400 italic transition-all duration-500">{currentText}</p>
        <div className="flex items-center gap-2">
          <div className="h-[2px] w-28 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-500"
              style={{ width: visibleStep >= steps.length ? '95%' : `${Math.min(95, ((visibleStep + 1) / steps.length) * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-slate-300">{(elapsedMs / 1000).toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

// ─── Ícone IA (mesmo visual dentro e fora do chat) ────────────────────────────
function IAIcon({ size = 'md' }) {
  const cls     = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const iconCls = size === 'lg' ? 'w-6 h-6'  : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <div className={`${cls} bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_18px_rgba(59,130,246,0.55)] shrink-0`}>
      <Sparkles className={`${iconCls} text-white`} />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function IaAnalyizChat({ isChatOpen, toggleChat, onLog, userRole }) {
  const [chatInput, setChatInput]           = useState('');
  const [isChatLoading, setIsChatLoading]   = useState(false);
  const [isExpanded, setIsExpanded]         = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');

  // Badge: só aparece quando chat fechado E há mensagem não lida da IA
  const [hasUnread, setHasUnread] = useState(false);

  const { userId } = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('analyiz_user'));
      return { userId: u?.id || null };
    } catch { return { userId: null }; }
  })();

  const storageKey = `ia_memory_${userId || 'guest'}`;

  const [chatMessages, setChatMessages] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
    // Mensagem inicial da IA — começa como não lida se o chat estiver fechado
    return [{ role: 'ia', content: 'Olá! Sou a <b>IA Analyiz</b>. Como posso ajudar?' }];
  });

  const chatScrollRef = useRef(null);
  const textareaRef   = useRef(null);

  // Quando o chat abre, zera não lidas
  useEffect(() => {
    if (isChatOpen) setHasUnread(false);
  }, [isChatOpen]);

  // Quando chega nova mensagem da IA e o chat está fechado → marca não lida
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.role === 'ia' && !isChatOpen) {
      setHasUnread(true);
    }
  }, [chatMessages]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(chatMessages));
  }, [chatMessages, storageKey]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading, pendingMessage]);

  // Auto-resize do textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [chatInput]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage    = chatInput.trim();
    const currentHistory = [...chatMessages];

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setIsChatLoading(true);
    setPendingMessage(userMessage);

    if (onLog) onLog('[IA_Analyiz] Processando requisição...', 'info');

    try {
      const res  = await fetch(`${API_BASE_URL}/api/ia/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userMessage, history: currentHistory, userRole, userId }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'ia', content: data.reply }]);
      if (onLog) onLog('[IA_Analyiz] Resposta gerada.', 'success');
    } catch {
      setChatMessages(prev => [...prev, { role: 'ia', content: '⚠️ Erro de conexão com o Kernel da IA.' }]);
    } finally {
      setIsChatLoading(false);
      setPendingMessage('');
    }
  }, [chatInput, isChatLoading, chatMessages, userRole, userId, onLog]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  };

  const chatStyle = isExpanded
    ? { width: 'min(600px, 90vw)', height: 'min(700px, 85vh)', bottom: '1.5rem', right: '1.5rem', maxHeight: 'calc(100vh - 3rem)' }
    : { width: '340px', height: 'min(520px, calc(100vh - 5rem))', bottom: '1.5rem', right: '1.5rem', maxHeight: 'calc(100vh - 5rem)' };

  return (
    <>
      <style>{`
        @keyframes ia-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ia-textarea { resize: none; overflow-y: auto; }
      `}</style>

      {/* ── CHAT WINDOW ───────────────────────────────────────────────────── */}
      <div
        className="fixed z-[9999] bg-white rounded-[1.75rem] shadow-[0_20px_60px_rgba(0,0,0,0.25)] border border-slate-200 flex flex-col overflow-hidden transition-all duration-300"
        style={{
          ...chatStyle,
          transformOrigin: 'bottom right',
          transform:       isChatOpen ? 'scale(1)' : 'scale(0)',
          opacity:         isChatOpen ? 1          : 0,
          pointerEvents:   isChatOpen ? 'auto'     : 'none',
        }}
      >
        {/* Header */}
        <div className="bg-[#1e293b] px-4 py-3 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3">
            <IAIcon size="sm" />
            <div>
              <p className="text-sm font-black uppercase tracking-widest leading-none">IA Analyiz</p>
              <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mt-0.5">
                {isChatLoading ? 'Processando...' : 'Status: Conectada'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(v => !v)}
              className="hover:bg-white/10 p-2 rounded-xl transition-all"
              title={isExpanded ? 'Reduzir' : 'Expandir'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={toggleChat} className="hover:bg-red-500/20 p-2 rounded-xl transition-all" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mensagens */}
        <div
          ref={chatScrollRef}
          className="flex-1 bg-slate-50/80 px-4 py-4 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed"
        >
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'ia' && (
                <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div className={`p-3 rounded-2xl shadow-sm max-w-[85%] break-words ${
                msg.role === 'user'
                  ? 'bg-slate-800 text-white rounded-tr-none'
                  : 'bg-white border border-slate-200 rounded-tl-none'
              }`}>
                {msg.role === 'ia'
                  ? <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                  : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                }
              </div>
            </div>
          ))}

          {isChatLoading && pendingMessage && <ProcessingSteps message={pendingMessage} />}
        </div>

        {/* Aviso + Input */}
        <div className="border-t border-slate-200 bg-white shrink-0">
          <div className="flex items-center justify-center gap-1.5 pt-2 pb-0.5">
            <Bot className="w-3 h-3 text-slate-300" />
            <p className="text-[10px] text-slate-300 select-none">Essa conversa usa IA para te responder</p>
          </div>
          <div className="p-3 pt-1.5 flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isChatLoading}
              rows={1}
              placeholder={isChatLoading ? 'Aguarde...' : 'Escreva... (Shift+Enter para quebrar linha)'}
              className={`ia-textarea flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium leading-relaxed ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ minHeight: '38px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSendChat}
              disabled={isChatLoading}
              className={`bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center shadow-md shrink-0 ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTÃO FLUTUANTE ────────────────────────────────────────────────── */}
      <div
        className="fixed z-[9998] transition-all duration-300"
        style={{
          bottom:        '1.5rem',
          right:         '1.5rem',
          transform:     isChatOpen ? 'scale(0)' : 'scale(1)',
          opacity:       isChatOpen ? 0          : 1,
          pointerEvents: isChatOpen ? 'none'     : 'auto',
        }}
      >
        <button
          onClick={toggleChat}
          className="relative hover:scale-105 active:scale-95 transition-all duration-200 block"
        >
          <IAIcon size="lg" />

          {/* Badge "!" — só aparece quando há mensagem não lida E chat está fechado */}
          {hasUnread && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5">
              <span className="animate-ping absolute h-full w-full rounded-full bg-blue-500 opacity-75" />
              <span className="relative rounded-full h-5 w-5 bg-blue-600 border-2 border-white text-[8px] flex items-center justify-center text-white font-black">!</span>
            </span>
          )}
        </button>
      </div>
    </>
  );
}