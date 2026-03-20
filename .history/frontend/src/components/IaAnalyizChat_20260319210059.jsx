import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Minus, Maximize2, Minimize2 } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';
const BRAND = '#1e293b';

// ─── Sequência de textos contextuais por intenção ─────────────────────────────
function getThinkingSequence(message) {
  const l = message.toLowerCase();
  const isGreeting = /^(olá|ola|oi|hey|e aí|bom dia|boa tarde|boa noite|tudo bem|como vai|td bem)[\s!?.]*$/i.test(l.trim());

  if (isGreeting) return [
    { text: 'Processando...',             ms: 1000 },
    { text: 'Já respondo.',               ms: 99999 },
  ];
  if (/usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo|equipe|quem/i.test(l)) return [
    { text: 'Consultando registros...',         ms: 1400 },
    { text: 'Verificando permissões...',        ms: 2000 },
    { text: 'Estou verificando. Já respondo.',  ms: 99999 },
  ];
  if (/produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l)) return [
    { text: 'Buscando produtos...',             ms: 1400 },
    { text: 'Estou verificando. Já respondo.',  ms: 99999 },
  ];
  if (/divergên|divergen|anomalia|erro|auditoria|varredura/i.test(l)) return [
    { text: 'Buscando divergências...',         ms: 1400 },
    { text: 'Comparando dados...',              ms: 2000 },
    { text: 'Estou verificando. Já respondo.',  ms: 99999 },
  ];
  if (/histórico|conversamos|lembra|anterior|falei|disse/i.test(l)) return [
    { text: 'Consultando histórico...',         ms: 1400 },
    { text: 'Estou verificando. Já respondo.',  ms: 99999 },
  ];
  return [
    { text: 'Analisando...',                    ms: 1400 },
    { text: 'Estou verificando. Já respondo.',  ms: 99999 },
  ];
}

// ─── 1 ponto piscante + texto contextual — padrão exato do vídeo ─────────────
// O ML mostra: [•]  Texto contextual...
// O ponto pisca (aparece/some), depois some e fica só o texto
function ThinkingIndicator({ message }) {
  const sequence          = getThinkingSequence(message);
  const [idx, setIdx]     = useState(0);
  const [dotOn, setDotOn] = useState(true);

  // Avança sequência de texto
  useEffect(() => {
    if (idx >= sequence.length - 1) return;
    const t = setTimeout(() => setIdx(i => i + 1), sequence[idx].ms);
    return () => clearTimeout(t);
  }, [idx]);

  // Ponto pisca a cada 500ms enquanto não chegou na última frase
  useEffect(() => {
    if (idx >= sequence.length - 1) { setDotOn(false); return; }
    const t = setInterval(() => setDotOn(v => !v), 500);
    return () => clearInterval(t);
  }, [idx, sequence.length]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '2px 0' }}>
      {/* Ponto único piscante */}
      <span style={{
        width:        '7px',
        height:       '7px',
        borderRadius: '50%',
        background:   '#94a3b8',
        display:      'inline-block',
        flexShrink:   0,
        opacity:      dotOn ? 1 : 0,
        transition:   'opacity 0.15s',
      }} />
      {/* Texto contextual */}
      <span style={{ fontSize: '13px', color: '#94a3b8' }}>
        {sequence[idx].text}
      </span>
    </div>
  );
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
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
    if (saved) { try { return JSON.parse(saved); } catch {} }
    return [{ role: 'ia', content: 'Olá! Como posso te ajudar?', time: getTime() }];
  });

  const scrollRef   = useRef(null);
  const textareaRef = useRef(null);

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
  const H = isExpanded ? 'min(650px, 85vh)' : 'min(520px, calc(100vh - 5rem))';

  return (
    <>
      <style>{`
        .ia-scroll::-webkit-scrollbar       { width: 4px; }
        .ia-scroll::-webkit-scrollbar-track { background: transparent; }
        .ia-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .ia-ta { resize: none; overflow-y: auto; }
      `}</style>

      {/* ══ JANELA ═══════════════════════════════════════════════════════════ */}
      <div style={{
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
      }}>

        {/* Header */}
        <div style={{
          padding: '12px 14px', borderBottom: '1px solid #eeeeee',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#ffffff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px', background: BRAND,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.03 2 11c0 2.48 1.07 4.72 2.78 6.33L4 22l4.89-1.6C10.16 20.78 11.07 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" fill="white"/>
                <circle cx="8.5"  cy="11" r="1.15" fill={BRAND}/>
                <circle cx="12"   cy="11" r="1.15" fill={BRAND}/>
                <circle cx="15.5" cy="11" r="1.15" fill={BRAND}/>
              </svg>
            </div>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#333' }}>Assistente</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setIsExpanded(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: '#999', display: 'flex' }}>
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={toggleChat}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: '#999', display: 'flex' }}>
              <Minus size={14} />
            </button>
          </div>
        </div>

        {/* Aviso IA */}
        <div style={{
          textAlign: 'center', padding: '6px 16px', fontSize: '11px',
          color: '#aaa', borderBottom: '1px solid #f5f5f5',
          background: '#ffffff', flexShrink: 0, lineHeight: '1.4',
        }}>
          Este assistente usa inteligência artificial para te responder
        </div>

        {/* ── Mensagens ──────────────────────────────────────────────────── */}
        <div ref={scrollRef} className="ia-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', background: '#ffffff' }}>

          {chatMessages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              {msg.role === 'ia' ? (
                // IA: texto solto, sem balão, espaçamento compacto
                <div style={{ fontSize: '13.5px', color: '#333', lineHeight: '1.5' }}>
                  <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                </div>
              ) : (
                // Usuário: balão cinza à direita + timestamp
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{
                    background: '#f0f0f0', color: '#333',
                    borderRadius: '16px 16px 4px 16px',
                    padding: '8px 12px', fontSize: '13.5px', lineHeight: '1.45',
                    maxWidth: '80%', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                  {msg.time && (
                    <span style={{ fontSize: '11px', color: '#bbb', marginTop: '2px', paddingRight: '2px' }}>
                      {msg.time}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 1 ponto piscante + texto contextual */}
          {isChatLoading && pendingMessage && (
            <div style={{ marginBottom: '10px' }}>
              <ThinkingIndicator message={pendingMessage} />
            </div>
          )}
        </div>

        {/* ── Input ──────────────────────────────────────────────────────── */}
        <div style={{
          borderTop: '1px solid #eeeeee', background: '#ffffff',
          padding: '9px 12px', display: 'flex', alignItems: 'flex-end',
          gap: '8px', flexShrink: 0,
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
              flex: 1, border: 'none', outline: 'none',
              fontSize: '13.5px', color: '#333', background: 'transparent',
              lineHeight: '1.45', minHeight: '22px', maxHeight: '100px',
              fontFamily: 'inherit', padding: 0,
              opacity: isChatLoading ? 0.5 : 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={isChatLoading || !chatInput.trim()}
            style={{
              width: '32px', height: '32px', borderRadius: '50%', border: 'none',
              background: chatInput.trim() && !isChatLoading ? BRAND : '#e8e8e8',
              cursor: chatInput.trim() && !isChatLoading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}
          >
            <Send size={15} style={{
              color: chatInput.trim() && !isChatLoading ? '#fff' : '#bbb',
              marginLeft: '1px',
            }} />
          </button>
        </div>
      </div>

      {/* ══ BOTÃO FLUTUANTE ══════════════════════════════════════════════════ */}
      <div style={{
        position: 'fixed', zIndex: 9998, bottom: '1.5rem', right: '1.5rem',
        transform: isChatOpen ? 'scale(0)' : 'scale(1)',
        opacity:   isChatOpen ? 0 : 1,
        pointerEvents: isChatOpen ? 'none' : 'auto',
        transition: 'transform 0.2s, opacity 0.15s',
      }}>
        <button
          onClick={toggleChat}
          style={{
            width: '52px', height: '52px', borderRadius: '50%', border: 'none',
            background: BRAND, cursor: 'pointer', position: 'relative',
            boxShadow: '0 4px 16px rgba(30,41,59,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.03 2 11c0 2.48 1.07 4.72 2.78 6.33L4 22l4.89-1.6C10.16 20.78 11.07 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" fill="white"/>
            <circle cx="8.5"  cy="11" r="1.3" fill={BRAND}/>
            <circle cx="12"   cy="11" r="1.3" fill={BRAND}/>
            <circle cx="15.5" cy="11" r="1.3" fill={BRAND}/>
          </svg>
          {hasUnread && (
            <span style={{
              position: 'absolute', top: '-2px', right: '-2px',
              width: '18px', height: '18px', borderRadius: '50%',
              background: '#ef4444', border: '2px solid white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', color: 'white', fontWeight: 900,
            }}>!</span>
          )}
        </button>
      </div>
    </>
  );
}