import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Minus, Maximize2, Minimize2 } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';
const BRAND = '#1e293b';

// ─── Label contextual do spinner ─────────────────────────────────────────────
function getSpinnerLabel(message) {
  const l = message.toLowerCase();
  if (/usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo/i.test(l)) return 'Consultando usuários';
  if (/produto|sku|peso|kit|estoque|ml|mercado livre|anúncio|preço/i.test(l))      return 'Buscando produtos';
  if (/divergên|divergen|anomalia|erro|auditoria|varredura/i.test(l))              return 'Verificando divergências';
  if (/histórico|conversamos|lembra|anterior/i.test(l))                            return 'Consultando histórico';
  return 'Pensativo';
}

// ─── Spinner: arco CSS girando + label contextual ────────────────────────────
function SpinnerThinking({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }}>
      {/* Arco girando — exato do vídeo: círculo com border-top colorida */}
      <span style={{
        display:      'inline-block',
        width:        '16px',
        height:       '16px',
        borderRadius: '50%',
        border:       '2px solid #e2e8f0',
        borderTop:    `2px solid ${BRAND}`,
        animation:    'ia-spin 0.8s linear infinite',
        flexShrink:   0,
      }} />
      <span style={{ fontSize: '13px', color: '#64748b' }}>
        {getSpinnerLabel(message)}
      </span>
    </div>
  );
}

// ─── Typewriter: exibe o HTML da resposta letra a letra ───────────────────────
// Lida com tags HTML (<b>, <i>, <br>) sem quebrá-las
function TypewriterText({ html, speed = 18, onDone }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone]           = useState(false);
  const idxRef                    = useRef(0);

  useEffect(() => {
    idxRef.current = 0;
    setDisplayed('');
    setDone(false);

    // Divide em tokens: tags HTML ou caracteres individuais
    const tokens = [];
    const regex  = /(<[^>]+>|&[^;]+;|.)/gs;
    let match;
    while ((match = regex.exec(html)) !== null) tokens.push(match[0]);

    if (tokens.length === 0) { setDone(true); onDone?.(); return; }

    const interval = setInterval(() => {
      if (idxRef.current >= tokens.length) {
        clearInterval(interval);
        setDone(true);
        onDone?.();
        return;
      }
      // Avança mais rápido em tags HTML (não são visíveis como texto)
      const token = tokens[idxRef.current];
      idxRef.current++;
      setDisplayed(prev => prev + token);
    }, speed);

    return () => clearInterval(interval);
  }, [html]);

  return (
    <span
      dangerouslySetInnerHTML={{ __html: displayed + (!done ? '<span style="opacity:0.6;animation:ia-blink 0.8s step-end infinite">▍</span>' : '') }}
    />
  );
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
function getTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Botão flutuante com expand ao hover ─────────────────────────────────────
function FloatingButton({ onClick, hasUnread }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', overflow: 'hidden',
        borderRadius: '999px', border: 'none', background: BRAND,
        cursor: 'pointer', boxShadow: '0 4px 16px rgba(30,41,59,0.4)',
        width: hovered ? '152px' : '52px', height: '52px',
        transition: 'width 0.25s cubic-bezier(0.34,1.2,0.64,1)',
        position: 'relative', padding: 0,
      }}
    >
      <span style={{
        flex: 1, color: 'white', fontSize: '14px', fontWeight: 600,
        whiteSpace: 'nowrap', paddingLeft: '16px', order: 1,
        opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
      }}>Assistente</span>
      <span style={{
        width: '52px', height: '52px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, order: 2,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.03 2 11c0 2.48 1.07 4.72 2.78 6.33L4 22l4.89-1.6C10.16 20.78 11.07 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" fill="white"/>
          <circle cx="8.5"  cy="11" r="1.3" fill={BRAND}/>
          <circle cx="12"   cy="11" r="1.3" fill={BRAND}/>
          <circle cx="15.5" cy="11" r="1.3" fill={BRAND}/>
        </svg>
      </span>
      {hasUnread && (
        <span style={{
          position: 'absolute', top: 0, right: 0,
          width: '18px', height: '18px', borderRadius: '50%',
          background: '#ef4444', border: '2px solid white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '9px', color: 'white', fontWeight: 900, zIndex: 1,
        }}>!</span>
      )}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function IaAnalyizChat({ isChatOpen, toggleChat, onLog, userRole }) {
  const [chatInput, setChatInput]           = useState('');
  const [isChatLoading, setIsChatLoading]   = useState(false);
  const [isExpanded, setIsExpanded]         = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [hasUnread, setHasUnread]           = useState(false);
  // Controla quais mensagens da IA ainda estão sendo "digitadas"
  const [typingSet, setTypingSet]           = useState(new Set());

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
    return [{ role: 'ia', content: 'Olá! Como posso te ajudar?', time: getTime(), id: 'init' }];
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
  }, [chatMessages, isChatLoading, pendingMessage, typingSet]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  }, [chatInput]);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMessage    = chatInput.trim();
    const historySnapshot = [...chatMessages]; // captura ANTES de adicionar
    const time           = getTime();

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage, time, id: Date.now() + '-u' }]);
    setChatInput('');
    setIsChatLoading(true);
    setPendingMessage(userMessage);
    if (onLog) onLog('[IA_Analyiz] Processando...', 'info');

    try {
      const res  = await fetch(`${API_BASE_URL}/api/ia/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userMessage, history: historySnapshot, userRole, userId }),
      });
      const data  = await res.json();
      const msgId = Date.now() + '-ia';
      setChatMessages(prev => [...prev, { role: 'ia', content: data.reply, time: getTime(), id: msgId }]);
      setTypingSet(prev => new Set(prev).add(msgId));
      if (onLog) onLog('[IA_Analyiz] Resposta gerada.', 'success');
    } catch {
      const msgId = Date.now() + '-err';
      setChatMessages(prev => [...prev, { role: 'ia', content: 'Erro de conexão. Tente novamente.', time: getTime(), id: msgId }]);
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
        @keyframes ia-spin  { to { transform: rotate(360deg); } }
        @keyframes ia-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .ia-scroll::-webkit-scrollbar       { width: 4px; }
        .ia-scroll::-webkit-scrollbar-track { background: transparent; }
        .ia-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .ia-ta { resize: none; overflow-y: auto; }
      `}</style>

      {/* ══ JANELA ═══════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'fixed', zIndex: 9999, bottom: '1.5rem', right: '1.5rem',
        width: W, height: H, maxHeight: 'calc(100vh - 3rem)',
        background: '#ffffff', borderRadius: '20px',
        boxShadow: '0 4px 32px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transformOrigin: 'bottom right',
        transform:     isChatOpen ? 'scale(1)' : 'scale(0)',
        opacity:       isChatOpen ? 1 : 0,
        pointerEvents: isChatOpen ? 'auto' : 'none',
        transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s',
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: '#aaa', display: 'flex' }}>
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={toggleChat}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: '#aaa', display: 'flex' }}>
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

        {/* Mensagens */}
        <div ref={scrollRef} className="ia-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', background: '#ffffff' }}>

          {chatMessages.map((msg) => (
            <div key={msg.id || msg.content} style={{ marginBottom: '10px' }}>
              {msg.role === 'ia' ? (
                <div style={{ fontSize: '13.5px', color: '#333', lineHeight: '1.5' }}>
                  {/* Typewriter apenas para mensagens novas (no typingSet) */}
                  {typingSet.has(msg.id) ? (
                    <TypewriterText
                      html={msg.content}
                      speed={14}
                      onDone={() => setTypingSet(prev => {
                        const next = new Set(prev);
                        next.delete(msg.id);
                        return next;
                      })}
                    />
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                  )}
                </div>
              ) : (
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

          {/* Spinner enquanto aguarda resposta */}
          {isChatLoading && pendingMessage && (
            <div style={{ marginBottom: '10px' }}>
              <SpinnerThinking message={pendingMessage} />
            </div>
          )}
        </div>

        {/* Input */}
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
        transform:     isChatOpen ? 'scale(0)' : 'scale(1)',
        opacity:       isChatOpen ? 0 : 1,
        pointerEvents: isChatOpen ? 'none' : 'auto',
        transition: 'transform 0.2s, opacity 0.15s',
      }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} />
      </div>
    </>
  );
}