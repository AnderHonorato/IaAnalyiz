import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Maximize2, Minimize2, X, Bot, Sparkles } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ─── Passos de processamento com timing longo/humano ─────────────────────────
function buildProcessingSteps(message) {
  const l = message.toLowerCase();
  const needsProdutos     = /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l);
  const needsDivergencias = /divergên|divergen|anomalia|erro|auditoria|varredura|inconsistên/i.test(l);
  const needsUsuarios     = /usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo|equipe|quem/i.test(l);
  const isGreeting        = /^(olá|ola|oi|hey|e aí|bom dia|boa tarde|boa noite|tudo bem|como vai)[\s!?.]*$/i.test(l.trim());

  if (isGreeting) return [
    { text: 'lendo sua mensagem...', delay: 0 },
    { text: 'preparando resposta...', delay: 1000 },
  ];

  if (needsUsuarios) return [
    { text: 'lendo sua mensagem...', delay: 0 },
    { text: 'acessando banco de dados...', delay: 1200 },
    { text: 'consultando registros de usuários...', delay: 2800 },
    { text: 'verificando permissões e status...', delay: 4400 },
    { text: 'cruzando os dados...', delay: 5800 },
    { text: 'preparando resposta...', delay: 7000 },
  ];

  if (needsProdutos) return [
    { text: 'lendo sua mensagem...', delay: 0 },
    { text: 'acessando banco de dados...', delay: 1200 },
    { text: 'carregando catálogo de produtos...', delay: 2800 },
    { text: 'verificando SKUs e pesos...', delay: 4200 },
    { text: 'preparando resposta...', delay: 5600 },
  ];

  if (needsDivergencias) return [
    { text: 'lendo sua mensagem...', delay: 0 },
    { text: 'acessando banco de dados...', delay: 1200 },
    { text: 'buscando divergências registradas...', delay: 2800 },
    { text: 'analisando anomalias...', delay: 4400 },
    { text: 'comparando dados internos vs. ML...', delay: 5800 },
    { text: 'preparando resposta...', delay: 7200 },
  ];

  return [
    { text: 'lendo sua mensagem...', delay: 0 },
    { text: 'processando...', delay: 1400 },
    { text: 'preparando resposta...', delay: 3000 },
  ];
}

// ─── Três pontos animados estilo ML ──────────────────────────────────────────
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[3px] ml-1 align-middle">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-slate-400 inline-block"
          style={{ animation: `ia-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  );
}

// ─── Indicador de processamento estilo ML ────────────────────────────────────
function ProcessingBlock({ message }) {
  const [stepIdx, setStepIdx]   = useState(0);
  const [showSlow, setShowSlow] = useState(false);
  const steps = buildProcessingSteps(message);

  useEffect(() => {
    const timers = steps.map((s, i) => setTimeout(() => setStepIdx(i), s.delay));
    const slow   = setTimeout(() => setShowSlow(true), 10000);
    return () => { timers.forEach(clearTimeout); clearTimeout(slow); };
  }, []);

  const text = showSlow
    ? 'isso está demorando mais que o normal...'
    : steps[Math.min(stepIdx, steps.length - 1)]?.text || '';

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Avatar IA */}
      <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Sparkles className="w-4 h-4 text-white" style={{ animation: 'ia-spin 2s linear infinite' }} />
      </div>
      <div className="pt-1">
        <p className="text-[12px] text-slate-500 italic leading-relaxed">
          {text}<TypingDots />
        </p>
      </div>
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
    return [{ role: 'ia', content: 'Olá! Como posso ajudar você hoje?' }];
  });

  const chatScrollRef = useRef(null);
  const textareaRef   = useRef(null);

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
    if (chatScrollRef.current)
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, isChatLoading, pendingMessage]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 110) + 'px';
  }, [chatInput]);

  const handleSend = useCallback(async () => {
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
      setChatMessages(prev => [...prev, { role: 'ia', content: 'Erro de conexão com o Kernel.' }]);
    } finally {
      setIsChatLoading(false);
      setPendingMessage('');
    }
  }, [chatInput, isChatLoading, chatMessages, userRole, userId, onLog]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Dimensões — nunca sai da tela
  const chatW = isExpanded ? 'min(580px, 92vw)' : '360px';
  const chatH = isExpanded ? 'min(680px, 85vh)' : `min(520px, calc(100vh - 5rem))`;

  return (
    <>
      <style>{`
        @keyframes ia-spin   { to { transform: rotate(360deg); } }
        @keyframes ia-bounce {
          0%, 80%, 100% { transform: translateY(0);    opacity: 0.4; }
          40%           { transform: translateY(-5px); opacity: 1;   }
        }
        .ia-scroll::-webkit-scrollbar       { width: 4px; }
        .ia-scroll::-webkit-scrollbar-track { background: transparent; }
        .ia-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .ia-textarea { resize: none; overflow-y: auto; }
      `}</style>

      {/* ══ JANELA DO CHAT ═══════════════════════════════════════════════════ */}
      <div
        className="fixed z-[9999] flex flex-col overflow-hidden transition-all duration-300"
        style={{
          width:           chatW,
          height:          chatH,
          maxHeight:       'calc(100vh - 3rem)',
          bottom:          '1.5rem',
          right:           '1.5rem',
          background:      '#ffffff',
          borderRadius:    '16px',
          boxShadow:       '0 8px 40px rgba(0,0,0,0.18)',
          transformOrigin: 'bottom right',
          transform:       isChatOpen ? 'scale(1)' : 'scale(0)',
          opacity:         isChatOpen ? 1          : 0,
          pointerEvents:   isChatOpen ? 'auto'     : 'none',
        }}
      >

        {/* ── Header estilo ML ─────────────────────────────────────────────── */}
        <div style={{ background: '#2d3277', padding: '12px 16px' }} className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">IA Analyiz</p>
              <p className="text-white/60 text-[10px] leading-tight">
                {isChatLoading ? 'digitando...' : 'online'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsExpanded(v => !v)}
              className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all"
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleChat}
              className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Mensagens ────────────────────────────────────────────────────── */}
        <div
          ref={chatScrollRef}
          className="ia-scroll flex-1 overflow-y-auto py-3"
          style={{ background: '#f6f6f6' }}
        >
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex items-end gap-2 px-4 py-1 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

              {/* Avatar IA */}
              {msg.role === 'ia' && (
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mb-0.5"
                  style={{ background: '#2d3277' }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}

              {/* Balão */}
              <div
                className="max-w-[78%] text-[13px] leading-relaxed"
                style={msg.role === 'user' ? {
                  background:   '#2d3277',
                  color:        '#ffffff',
                  borderRadius: '18px 18px 4px 18px',
                  padding:      '10px 14px',
                  wordBreak:    'break-word',
                } : {
                  background:   '#ffffff',
                  color:        '#333333',
                  borderRadius: '18px 18px 18px 4px',
                  padding:      '10px 14px',
                  boxShadow:    '0 1px 3px rgba(0,0,0,0.08)',
                  wordBreak:    'break-word',
                }}
              >
                {msg.role === 'ia'
                  ? <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                  : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                }
              </div>
            </div>
          ))}

          {/* Estado "pensando" */}
          {isChatLoading && pendingMessage && (
            <div className="flex items-end gap-2 px-4 py-1">
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mb-0.5"
                style={{ background: '#2d3277' }}
              >
                <Sparkles className="w-3.5 h-3.5 text-white" style={{ animation: 'ia-spin 2s linear infinite' }} />
              </div>
              <div
                style={{
                  background:   '#ffffff',
                  borderRadius: '18px 18px 18px 4px',
                  padding:      '10px 14px',
                  boxShadow:    '0 1px 3px rgba(0,0,0,0.08)',
                  maxWidth:     '78%',
                }}
              >
                <ProcessingBlock message={pendingMessage} />
              </div>
            </div>
          )}
        </div>

        {/* ── Input ────────────────────────────────────────────────────────── */}
        <div
          className="shrink-0"
          style={{ background: '#ffffff', borderTop: '1px solid #eeeeee' }}
        >
          {/* Aviso de IA */}
          <div className="flex items-center justify-center gap-1.5 pt-2 pb-0.5">
            <Bot className="w-3 h-3 text-slate-300" />
            <p className="text-[10px] text-slate-300 select-none">Essa conversa usa IA para te responder</p>
          </div>

          <div className="flex items-end gap-2 px-3 py-2.5">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isChatLoading}
              rows={1}
              placeholder={isChatLoading ? 'Aguarde...' : 'Escreva uma mensagem...'}
              className="ia-textarea flex-1 text-[13px] outline-none leading-relaxed text-slate-700 placeholder-slate-400 bg-transparent"
              style={{
                minHeight:    '36px',
                maxHeight:    '110px',
                border:       '1.5px solid #e8e8e8',
                borderRadius: '20px',
                padding:      '8px 14px',
                background:   '#f8f8f8',
              }}
            />
            <button
              onClick={handleSend}
              disabled={isChatLoading || !chatInput.trim()}
              style={{
                background:   chatInput.trim() && !isChatLoading ? '#2d3277' : '#d1d5db',
                borderRadius: '50%',
                width:        '38px',
                height:       '38px',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                transition:   'background 0.2s',
                flexShrink:   0,
              }}
            >
              <Send className="w-4 h-4 text-white" style={{ marginLeft: '2px' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ══ BOTÃO FLUTUANTE ══════════════════════════════════════════════════ */}
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
          className="relative hover:scale-105 active:scale-95 transition-transform duration-150 block"
          style={{
            width:        '56px',
            height:       '56px',
            borderRadius: '50%',
            background:   '#2d3277',
            boxShadow:    '0 4px 20px rgba(45,50,119,0.45)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles className="w-6 h-6 text-white" />

          {/* Badge não lida */}
          {hasUnread && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5">
              <span className="animate-ping absolute h-full w-full rounded-full bg-blue-400 opacity-70" />
              <span
                className="relative rounded-full h-5 w-5 text-[8px] flex items-center justify-center text-white font-black"
                style={{ background: '#2d3277', border: '2px solid white' }}
              >!</span>
            </span>
          )}
        </button>
      </div>
    </>
  );
}