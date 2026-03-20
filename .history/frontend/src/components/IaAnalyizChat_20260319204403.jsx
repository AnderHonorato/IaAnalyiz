import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Minus, Maximize2, Minimize2, X } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ─── Frases de "pensando" baseadas na intenção — exatamente como ML ───────────
function getThinkingPhrases(message) {
  const l = message.toLowerCase();
  const isGreeting        = /^(olá|ola|oi|hey|e aí|bom dia|boa tarde|boa noite|tudo bem|como vai|td bem)[\s!?.]*$/i.test(l.trim());
  const needsUsuarios     = /usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo|equipe|quem/i.test(l);
  const needsProdutos     = /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l);
  const needsDivergencias = /divergên|divergen|anomalia|erro|auditoria|varredura/i.test(l);

  // Cada frase tem: texto e quanto tempo fica visível antes da próxima
  if (isGreeting) return [
    { text: 'Revisando...',         ms: 1200 },
    { text: 'Já respondo.',         ms: 99999 },
  ];
  if (needsUsuarios) return [
    { text: 'Revisando...',                          ms: 1400 },
    { text: 'Consultando os registros...',           ms: 2000 },
    { text: 'Verificando permissões e acessos...',   ms: 2200 },
    { text: 'Analisando...',                         ms: 2000 },
    { text: 'Estou verificando sua solicitação. Já respondo.', ms: 99999 },
  ];
  if (needsProdutos) return [
    { text: 'Revisando...',                          ms: 1400 },
    { text: 'Buscando informações dos produtos...',  ms: 2200 },
    { text: 'Analisando...',                         ms: 2000 },
    { text: 'Estou verificando sua solicitação. Já respondo.', ms: 99999 },
  ];
  if (needsDivergencias) return [
    { text: 'Revisando...',                             ms: 1400 },
    { text: 'Buscando divergências no sistema...',      ms: 2400 },
    { text: 'Comparando dados internos vs. externo...',ms: 2200 },
    { text: 'Analisando...',                            ms: 1800 },
    { text: 'Estou verificando sua solicitação. Já respondo.', ms: 99999 },
  ];
  return [
    { text: 'Revisando...',                          ms: 1600 },
    { text: 'Buscando a melhor maneira de ajudar...', ms: 2200 },
    { text: 'Analisando...',                          ms: 2000 },
    { text: 'Estou verificando sua solicitação. Já respondo.', ms: 99999 },
  ];
}

// ─── Componente de status "pensando" — texto simples, sem balão ──────────────
function ThinkingStatus({ message }) {
  const phrases = getThinkingPhrases(message);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (idx >= phrases.length - 1) return;
    const t = setTimeout(() => setIdx(i => i + 1), phrases[idx].ms);
    return () => clearTimeout(t);
  }, [idx]);

  return (
    <div className="px-4 py-2">
      <p className="text-[13px] text-slate-500">
        {phrases[idx].text}
        {/* pontinho piscante */}
        <span style={{ animation: 'ia-blink 1s step-end infinite' }} className="text-slate-400"> ▍</span>
      </p>
    </div>
  );
}

// ─── Formata timestamp HH:MM ─────────────────────────────────────────────────
function getTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [{ role: 'ia', content: 'Olá! Como posso te ajudar hoje?', time: getTime() }];
  });

  const scrollRef  = useRef(null);
  const textareaRef = useRef(null);

  // Badge não lida
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.role === 'ia' && !isChatOpen) setHasUnread(true);
  }, [chatMessages]);
  useEffect(() => { if (isChatOpen) setHasUnread(false); }, [isChatOpen]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(chatMessages));
  }, [chatMessages, storageKey]);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMessages, isChatLoading, pendingMessage]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  }, [chatInput]);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMessage    = chatInput.trim();
    const currentHistory = [...chatMessages];
    const time           = getTime();

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage, time }]);
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
      setChatMessages(prev => [...prev, { role: 'ia', content: data.reply, time: getTime() }]);
      if (onLog) onLog('[IA_Analyiz] Resposta gerada.', 'success');
    } catch {
      setChatMessages(prev => [...prev, { role: 'ia', content: 'Erro de conexão. Tente novamente.', time: getTime() }]);
    } finally {
      setIsChatLoading(false);
      setPendingMessage('');
    }
  }, [chatInput, isChatLoading, chatMessages, userRole, userId, onLog]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const W = isExpanded ? 'min(520px, 92vw)' : '360px';
  const H = isExpanded ? 'min(650px, 85vh)' : `min(520px, calc(100vh - 5rem))`;

  return (
    <>
      <style>{`
        @keyframes ia-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .ia-scroll::-webkit-scrollbar       { width: 4px; }
        .ia-scroll::-webkit-scrollbar-track { background: transparent; }
        .ia-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .ia-ta { resize: none; overflow-y: auto; }
      `}</style>

      {/* ══ JANELA ════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position:        'fixed',
          zIndex:          9999,
          bottom:          '1.5rem',
          right:           '1.5rem',
          width:           W,
          height:          H,
          maxHeight:       'calc(100vh - 3rem)',
          background:      '#ffffff',
          borderRadius:    '12px',
          boxShadow:       '0 4px 32px rgba(0,0,0,0.18)',
          display:         'flex',
          flexDirection:   'column',
          overflow:        'hidden',
          transformOrigin: 'bottom right',
          transform:       isChatOpen ? 'scale(1)' : 'scale(0)',
          opacity:         isChatOpen ? 1 : 0,
          pointerEvents:   isChatOpen ? 'auto' : 'none',
          transition:      'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s',
        }}
      >
        {/* ── Header branco exato do ML ───────────────────────────────────── */}
        <div style={{
          padding:      '14px 16px',
          borderBottom: '1px solid #eeeeee',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          background:   '#ffffff',
          flexShrink:   0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Ícone azul arredondado igual ao ML */}
            <div style={{
              width: '32px', height: '32px',
              borderRadius: '8px',
              background: '#3483fa',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {/* Ícone de chat/robô simplificado */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.03 2 11c0 2.48 1.07 4.72 2.78 6.33L4 22l4.89-1.6C10.16 20.78 11.07 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" fill="white"/>
                <circle cx="8.5"  cy="11" r="1.2" fill="#3483fa"/>
                <circle cx="12"   cy="11" r="1.2" fill="#3483fa"/>
                <circle cx="15.5" cy="11" r="1.2" fill="#3483fa"/>
              </svg>
            </div>
            <span style={{ fontWeight: 600, fontSize: '15px', color: '#333' }}>Assistente</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              onClick={() => setIsExpanded(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: '#999', display: 'flex' }}
            >
              {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              onClick={toggleChat}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: '#999', display: 'flex' }}
            >
              <Minus size={15} />
            </button>
          </div>
        </div>

        {/* ── Aviso de IA — linha cinza igual ao ML ───────────────────────── */}
        <div style={{
          textAlign:    'center',
          padding:      '8px 16px',
          fontSize:     '11px',
          color:        '#999',
          borderBottom: '1px solid #f5f5f5',
          background:   '#ffffff',
          flexShrink:   0,
        }}>
          Este assistente usa inteligência artificial para te responder
        </div>

        {/* ── Mensagens ────────────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="ia-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#ffffff' }}
        >
          {chatMessages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '16px' }}>
              {msg.role === 'ia' ? (
                /* ── IA: texto solto, sem balão, sem avatar ──────────────── */
                <div style={{ fontSize: '14px', color: '#333', lineHeight: '1.55' }}>
                  <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                </div>
              ) : (
                /* ── Usuário: balão cinza claro à direita + timestamp ────── */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{
                    background:   '#f0f0f0',
                    color:        '#333',
                    borderRadius: '18px 18px 4px 18px',
                    padding:      '9px 14px',
                    fontSize:     '14px',
                    lineHeight:   '1.45',
                    maxWidth:     '78%',
                    wordBreak:    'break-word',
                    whiteSpace:   'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                  {msg.time && (
                    <span style={{ fontSize: '11px', color: '#bbb', marginTop: '3px', paddingRight: '4px' }}>
                      {msg.time}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* ── Estado "pensando" — texto simples sem balão ────────────── */}
          {isChatLoading && pendingMessage && (
            <div style={{ marginBottom: '16px' }}>
              <ThinkingStatus message={pendingMessage} />
            </div>
          )}
        </div>

        {/* ── Input igual ao ML ────────────────────────────────────────────── */}
        <div style={{
          borderTop:  '1px solid #eeeeee',
          background: '#ffffff',
          padding:    '10px 14px',
          display:    'flex',
          alignItems: 'flex-end',
          gap:        '10px',
          flexShrink: 0,
        }}>
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isChatLoading}
            rows={1}
            placeholder="Pergunte ao assistente..."
            className="ia-ta"
            style={{
              flex:         1,
              border:       'none',
              outline:      'none',
              fontSize:     '14px',
              color:        '#333',
              background:   'transparent',
              lineHeight:   '1.45',
              minHeight:    '24px',
              maxHeight:    '100px',
              fontFamily:   'inherit',
              padding:      0,
              opacity:      isChatLoading ? 0.5 : 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={isChatLoading || !chatInput.trim()}
            style={{
              width:          '34px',
              height:         '34px',
              borderRadius:   '50%',
              border:         'none',
              background:     chatInput.trim() && !isChatLoading ? '#3483fa' : '#e8e8e8',
              cursor:         chatInput.trim() && !isChatLoading ? 'pointer' : 'default',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
              transition:     'background 0.15s',
            }}
          >
            <Send
              size={16}
              style={{
                color:       chatInput.trim() && !isChatLoading ? '#fff' : '#bbb',
                marginLeft:  '1px',
                transition:  'color 0.15s',
              }}
            />
          </button>
        </div>
      </div>

      {/* ══ BOTÃO FLUTUANTE ════════════════════════════════════════════════════ */}
      <div
        style={{
          position:      'fixed',
          zIndex:        9998,
          bottom:        '1.5rem',
          right:         '1.5rem',
          transform:     isChatOpen ? 'scale(0)' : 'scale(1)',
          opacity:       isChatOpen ? 0 : 1,
          pointerEvents: isChatOpen ? 'none' : 'auto',
          transition:    'transform 0.2s, opacity 0.15s',
        }}
      >
        <button
          onClick={toggleChat}
          style={{
            width:          '52px',
            height:         '52px',
            borderRadius:   '50%',
            border:         'none',
            background:     '#3483fa',
            cursor:         'pointer',
            boxShadow:      '0 4px 16px rgba(52,131,250,0.45)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            transition:     'transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.03 2 11c0 2.48 1.07 4.72 2.78 6.33L4 22l4.89-1.6C10.16 20.78 11.07 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" fill="white"/>
            <circle cx="8.5"  cy="11" r="1.3" fill="#3483fa"/>
            <circle cx="12"   cy="11" r="1.3" fill="#3483fa"/>
            <circle cx="15.5" cy="11" r="1.3" fill="#3483fa"/>
          </svg>

          {hasUnread && (
            <span style={{
              position:   'absolute',
              top:        '-2px',
              right:      '-2px',
              width:      '18px',
              height:     '18px',
              borderRadius: '50%',
              background: '#ff4444',
              border:     '2px solid white',
              display:    'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize:   '9px',
              color:      'white',
              fontWeight: 900,
            }}>!</span>
          )}
        </button>
      </div>
    </>
  );
}