import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, Maximize2, Minimize2, X, Bot } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ─── Passos de processamento com timing longo e humano ───────────────────────
function buildProcessingSteps(message) {
  const l = message.toLowerCase();
  const needsProdutos     = /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l);
  const needsDivergencias = /divergên|divergen|anomalia|erro|auditoria|varredura|inconsistên/i.test(l);
  const needsUsuarios     = /usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo|equipe|quem/i.test(l);
  const needsHistorico    = /conversamos|disse antes|lembra|anterior|histórico|falei|perguntei|resuma/i.test(l);
  const isGreeting        = /^(olá|ola|oi|hey|e aí|bom dia|boa tarde|boa noite|tudo bem|como vai)[\s!?.]*$/i.test(l.trim());

  if (isGreeting) return [
    { text: 'lendo sua mensagem...', delay: 0 },
    { text: 'entendido.',            delay: 1200 },
  ];

  const steps = [
    { text: 'lendo sua mensagem...',           delay: 0 },
    { text: 'processando o contexto...',       delay: 1400 },
  ];

  if (needsUsuarios) {
    steps.push({ text: 'consultando registros de usuários...', delay: 2600 });
    steps.push({ text: 'verificando permissões e status...',   delay: 4000 });
    steps.push({ text: 'cruzando dados de acesso...',          delay: 5400 });
    steps.push({ text: 'quase pronto...',                      delay: 6800 });
  } else if (needsProdutos) {
    steps.push({ text: 'acessando catálogo de produtos...',    delay: 2600 });
    steps.push({ text: 'carregando SKUs e pesos...',           delay: 4000 });
    if (l.includes('kit')) {
      steps.push({ text: 'calculando composição dos kits...', delay: 5200 });
    }
    steps.push({ text: 'organizando as informações...',        delay: l.includes('kit') ? 6400 : 5200 });
    steps.push({ text: 'quase pronto...',                      delay: l.includes('kit') ? 7400 : 6200 });
  } else if (needsDivergencias) {
    steps.push({ text: 'acessando registro de divergências...', delay: 2600 });
    steps.push({ text: 'comparando dados internos vs. ML...',   delay: 4000 });
    steps.push({ text: 'analisando anomalias encontradas...',   delay: 5600 });
    steps.push({ text: 'preparando relatório...',               delay: 7000 });
  } else if (needsHistorico) {
    steps.push({ text: 'recuperando histórico da conversa...', delay: 2600 });
    steps.push({ text: 'contextualizando as interações...',    delay: 4200 });
    steps.push({ text: 'organizando a resposta...',            delay: 5600 });
  } else {
    steps.push({ text: 'analisando sua pergunta...',           delay: 2600 });
    steps.push({ text: 'buscando a melhor resposta...',        delay: 4200 });
    steps.push({ text: 'quase pronto...',                      delay: 5800 });
  }

  return steps;
}

// ─── Indicador de processamento com cursor piscante ──────────────────────────
function ProcessingSteps({ message }) {
  const [visibleStep, setVisibleStep] = useState(0);
  const [elapsed, setElapsed]         = useState(0);
  const [showSlow, setShowSlow]       = useState(false);
  const steps = buildProcessingSteps(message);

  useEffect(() => {
    const start  = Date.now();
    const timers = steps.map((s, i) => setTimeout(() => setVisibleStep(i), s.delay));
    // Mensagem de demora: só após 9s
    const slow   = setTimeout(() => setShowSlow(true), 9000);
    const tick   = setInterval(() => setElapsed(Date.now() - start), 300);
    return () => { timers.forEach(clearTimeout); clearTimeout(slow); clearInterval(tick); };
  }, []);

  const currentText = showSlow
    ? 'demorando mais que o esperado...'
    : steps[Math.min(visibleStep, steps.length - 1)]?.text || '';

  return (
    <div className="flex items-start gap-2 px-4 py-2">
      {/* Ícone pequeno alinhado ao texto */}
      <div className="h-5 w-5 bg-blue-600 rounded-md flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-3 h-3 text-white" style={{ animation: 'ia-spin 2s linear infinite' }} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-slate-400 italic">
          {currentText}
          <span style={{ animation: 'ia-blink 1s step-end infinite' }} className="ml-0.5 text-blue-400 font-bold">|</span>
        </p>
        <div className="flex items-center gap-2">
          <div className="h-[2px] w-24 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-300 rounded-full transition-all duration-700"
              style={{
                width: showSlow ? '92%'
                  : `${Math.min(88, ((visibleStep + 1) / steps.length) * 100)}%`
              }}
            />
          </div>
          <span className="text-[9px] text-slate-300">{(elapsed / 1000).toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

// ─── Ícone IA consistente ─────────────────────────────────────────────────────
function IAIcon({ size = 'md' }) {
  const cls     = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const iconCls = size === 'lg' ? 'w-6 h-6'  : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <div className={`${cls} bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_18px_rgba(59,130,246,0.5)] shrink-0`}>
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
  const [hasUnread, setHasUnread]           = useState(false);

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
    return [{ role: 'ia', content: 'Olá! Sou a <b>IA Analyiz</b>. Como posso ajudar?' }];
  });

  const chatScrollRef = useRef(null);
  const textareaRef   = useRef(null);

  // Badge: marca não lida quando IA responde com chat fechado
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.role === 'ia' && !isChatOpen) setHasUnread(true);
  }, [chatMessages]);

  useEffect(() => {
    if (isChatOpen) setHasUnread(false);
  }, [isChatOpen]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(chatMessages));
  }, [chatMessages, storageKey]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading, pendingMessage]);

  // Auto-resize textarea
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
    if (onLog) onLog('[IA_Analyiz] Processando...', 'info');

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
      setChatMessages(prev => [...prev, { role: 'ia', content: '⚠️ Erro de conexão com o Kernel.' }]);
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
        @keyframes ia-spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ia-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .ia-textarea { resize: none; overflow-y: auto; }
      `}</style>

      {/* ── CHAT WINDOW ───────────────────────────────────────────────────── */}
      <div
        className="fixed z-[9999] bg-white rounded-[1.75rem] shadow-[0_20px_60px_rgba(0,0,0,0.2)] border border-slate-200 flex flex-col overflow-hidden transition-all duration-300"
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
                {isChatLoading ? 'pensando...' : 'Online'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsExpanded(v => !v)} className="hover:bg-white/10 p-2 rounded-xl transition-all">
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={toggleChat} className="hover:bg-red-500/20 p-2 rounded-xl transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mensagens */}
        <div
          ref={chatScrollRef}
          className="flex-1 bg-slate-50/60 overflow-y-auto text-xs text-slate-700 leading-relaxed"
        >
          {chatMessages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' ? (
                /* ── Mensagem do usuário: balão direita ─────────────────── */
                <div className="flex justify-end px-4 py-1.5">
                  <div className="bg-slate-800 text-white rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[80%] break-words shadow-sm">
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  </div>
                </div>
              ) : (
                /* ── Mensagem da IA: sem balão, full-width, borda esquerda ─ */
                <div className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                  {/* Linha de autoria mínima */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="h-4 w-4 bg-blue-600 rounded flex items-center justify-center shrink-0">
                      <Sparkles className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-[9px] font-semibold text-blue-500 uppercase tracking-widest">Analyiz</span>
                  </div>
                  {/* Texto sem qualquer balão */}
                  <div className="text-slate-700 leading-relaxed pl-5.5">
                    <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Indicador de pensamento */}
          {isChatLoading && pendingMessage && (
            <div className="border-b border-slate-100">
              <div className="flex items-center gap-1.5 px-4 pt-3 mb-1">
                <div className="h-4 w-4 bg-blue-600 rounded flex items-center justify-center shrink-0">
                  <Sparkles className="w-2.5 h-2.5 text-white" style={{ animation: 'ia-spin 2s linear infinite' }} />
                </div>
                <span className="text-[9px] font-semibold text-blue-500 uppercase tracking-widest">Analyiz</span>
              </div>
              <ProcessingSteps message={pendingMessage} />
            </div>
          )}
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
              placeholder={isChatLoading ? 'Aguarde...' : 'Escreva... (Shift+Enter = nova linha)'}
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
        <button onClick={toggleChat} className="relative hover:scale-105 active:scale-95 transition-all duration-200 block">
          <IAIcon size="lg" />
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