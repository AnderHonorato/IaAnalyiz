import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2, ChevronDown, ChevronUp, Paperclip, X, Plus } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';
const BRAND        = '#1e293b';
const SESSION_STORAGE_KEY = 'analyiz_last_session_id';

// ─────────────────────────────────────────────────────────────────────────────
// 👇 COLOQUE AQUI O CAMINHO DO SEU GIF
// Se o arquivo estiver em /public/olhinhos.gif  →  '/olhinhos.gif'
// Se estiver em /src/assets/olhinhos.gif        →  import gif from '../assets/olhinhos.gif'
//   e depois use  IA_GIF = gif
// ─────────────────────────────────────────────────────────────────────────────
import gifolhos from '../assets/gifolhos1.gif';
const IA_GIF = gifolhos;

// ─── Detecta página atual pela URL ───────────────────────────────────────────
function getCurrentPageKey() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('divergen'))  return 'divergencias';
  if (path.includes('produto'))   return 'produtos';
  if (path.includes('usuario'))   return 'usuarios';
  if (path.includes('dashboard')) return 'dashboard';
  if (path.includes('bot'))       return 'bot';
  return null;
}

// ─── Spinner arco ─────────────────────────────────────────────────────────────
function SpinnerThinking({ message }) {
  const l = (message || '').toLowerCase();
  const label =
    /usuário|usuario|acesso|desbloqueio/i.test(l) ? 'Consultando usuários...'    :
    /produto|sku|peso|kit|ml/i.test(l)            ? 'Buscando produtos...'        :
    /divergên|divergen|anomalia/i.test(l)          ? 'Verificando divergências...' :
    /imagem|foto/i.test(l)                         ? 'Analisando imagem...'        :
    'Analisando...';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }}>
      <span style={{ display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #e2e8f0', borderTop: `2px solid ${BRAND}`, animation: 'ia-spin 0.8s linear infinite', flexShrink: 0 }} />
      <span style={{ fontSize: '13px', color: '#64748b' }}>{label}</span>
    </div>
  );
}

// ─── Typewriter ───────────────────────────────────────────────────────────────
function tokenizeHTML(html) {
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) { tokens.push(html[i]); i++; }
      else { tokens.push(html.substring(i, end + 1)); i = end + 1; }
    } else if (html[i] === '&') {
      const end = html.indexOf(';', i);
      if (end === -1) { tokens.push(html[i]); i++; }
      else { tokens.push(html.substring(i, end + 1)); i = end + 1; }
    } else { tokens.push(html[i]); i++; }
  }
  return tokens;
}

function TypewriterText({ html, speed = 12, onDone }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone]           = useState(false);
  const idxRef                    = useRef(0);
  const ivRef                     = useRef(null);

  useEffect(() => {
    idxRef.current = 0;
    setDisplayed('');
    setDone(false);
    if (ivRef.current) clearInterval(ivRef.current);
    const tokens = tokenizeHTML(html || '');
    if (!tokens.length) { setDone(true); onDone?.(); return; }
    ivRef.current = setInterval(() => {
      if (idxRef.current >= tokens.length) { clearInterval(ivRef.current); setDone(true); onDone?.(); return; }
      setDisplayed(p => p + tokens[idxRef.current++]);
    }, speed);
    return () => { if (ivRef.current) clearInterval(ivRef.current); };
  }, [html]);

  return (
    <span dangerouslySetInnerHTML={{ __html: displayed + (!done ? '<span style="opacity:0.5;animation:ia-blink 0.8s step-end infinite">▍</span>' : '') }} />
  );
}

// ─── Sources expansíveis ─────────────────────────────────────────────────────
function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div style={{ marginTop: '8px', borderTop: '1px solid #f0f0f0', paddingTop: '6px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#94a3b8', padding: 0 }}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {sources.length} fonte{sources.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: BRAND, textDecoration: 'none', background: '#f8fafc', borderRadius: '6px', padding: '5px 8px', border: '1px solid #e2e8f0' }}>
              <span>🔗</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Badge "NOVO" com linhas onduladas ───────────────────────────────────────
function NewBadge() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', gap: 0 }}>
      <svg width="56" height="14" viewBox="0 0 56 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M0 7 Q7 1 14 7 Q21 13 28 7 Q35 1 42 7 Q49 13 56 7" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </svg>
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '0 8px', whiteSpace: 'nowrap', background: '#fff' }}>
        novo
      </span>
      <svg width="56" height="14" viewBox="0 0 56 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M0 7 Q7 1 14 7 Q21 13 28 7 Q35 1 42 7 Q49 13 56 7" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ─── Painel de sessões ────────────────────────────────────────────────────────
function SessionsPanel({ userId, currentSessionId, onSelectSession, onNewSession, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try { const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`); setSessions(await r.json()); }
    catch {} finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const del = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Deletar esta conversa?')) return;
    await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`, { method: 'DELETE' });
    if (id === currentSessionId) onNewSession();
    load();
  };

  return (
    <div style={{ position: 'absolute', top: '52px', right: 0, left: 0, background: '#fff', zIndex: 10, borderBottom: '1px solid #eee', maxHeight: '260px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
      <button onClick={() => { onNewSession(); onClose(); }}
        style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', fontSize: '13px', color: BRAND, fontWeight: 600 }}>
        <Plus size={14} /> Nova conversa
      </button>
      {loading && <p style={{ padding: '12px', fontSize: '12px', color: '#94a3b8' }}>Carregando...</p>}
      {sessions.map(s => (
        <div key={s.id} onClick={() => { onSelectSession(s.id); onClose(); }}
          style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#444', background: s.id === currentSessionId ? '#f0f4ff' : 'transparent', borderBottom: '1px solid #f8f8f8' }}>
          <MessageSquare size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.titulo}</span>
          <button onClick={(e) => del(e, s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: '2px', flexShrink: 0 }}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Botão flutuante com GIF ──────────────────────────────────────────────────
function FloatingButton({ onClick, hasUnread }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>

      {/* Balão de notificação */}
      {hasUnread && (
        <div style={{
          background: BRAND, color: 'white', fontSize: '11px', fontWeight: 500,
          padding: '5px 10px', borderRadius: '10px 10px 10px 2px', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(30,41,59,0.25)', animation: 'ia-fade-in 0.3s ease',
          pointerEvents: 'none', lineHeight: '1.3',
        }}>
          Você recebeu nova mensagem
        </div>
      )}

      {/* Botão */}
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center',
          borderRadius: '999px', border: 'none', outline: 'none',
          background: BRAND,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(30,41,59,0.45)',
          width: hovered ? '172px' : '62px', height: '62px',
          transition: 'width 0.28s cubic-bezier(0.34,1.2,0.64,1)',
          padding: 0, overflow: 'hidden', position: 'relative',
        }}
      >
        {/* Círculo com GIF — SEMPRE à esquerda, order:1 */}
        <span style={{
          width: '60px', height: '60px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', overflow: 'hidden',
          background: '#ffffff',
          order: 1, zIndex: 2,
        }}>
          <img
            src={IA_GIF}
            alt="IA"
            style={{ width: '58px', height: '58px', objectFit: 'contain', display: 'block', borderRadius: '50%' }}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <span style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.03 2 11c0 2.48 1.07 4.72 2.78 6.33L4 22l4.89-1.6C10.16 20.78 11.07 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" fill="white"/>
              <circle cx="8.5" cy="11" r="1.3" fill={BRAND}/><circle cx="12" cy="11" r="1.3" fill={BRAND}/><circle cx="15.5" cy="11" r="1.3" fill={BRAND}/>
            </svg>
          </span>
        </span>

        {/* Label "Assistente" — aparece à DIREITA no hover, order:2 */}
        <span style={{
          color: 'white', fontSize: '13px', fontWeight: 700,
          whiteSpace: 'nowrap', paddingRight: '20px', paddingLeft: '4px',
          order: 2,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.18s',
          letterSpacing: '0.01em', pointerEvents: 'none',
        }}>
          Assistente
        </span>
      </button>
    </div>
  );
}

// ─── Avatar GIF no header do chat ────────────────────────────────────────────
function ChatHeaderAvatar() {
  return (
    <div style={{
      width: '38px', height: '38px',
      borderRadius: '10px',
      background: '#ffffff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      <img
        src={IA_GIF}
        alt="IA"
        style={{ width: '34px', height: '34px', objectFit: 'contain', display: 'block' }}
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
      <span style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: BRAND, borderRadius: '8px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.03 2 11c0 2.48 1.07 4.72 2.78 6.33L4 22l4.89-1.6C10.16 20.78 11.07 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2z" fill="white"/>
          <circle cx="8.5" cy="11" r="1.15" fill={BRAND}/><circle cx="12" cy="11" r="1.15" fill={BRAND}/><circle cx="15.5" cy="11" r="1.15" fill={BRAND}/>
        </svg>
      </span>
    </div>
  );
}

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
  const [showSessions, setShowSessions]     = useState(false);
  const [newMsgIds, setNewMsgIds]           = useState(new Set());
  const [pendingImage, setPendingImage]     = useState(null);

  const readUserId = () => {
    try { const u = JSON.parse(localStorage.getItem('analyiz_user')); return u?.id || null; }
    catch { return null; }
  };

  const [userId, setUserId]             = useState(readUserId);
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    try {
      const saved     = localStorage.getItem(SESSION_STORAGE_KEY);
      const savedUser = localStorage.getItem('analyiz_session_owner');
      const currentUser = String(readUserId());
      if (saved && savedUser === currentUser) return parseInt(saved);
      return null;
    } catch { return null; }
  });

  useEffect(() => {
    const checkUser = () => {
      const newId = readUserId();
      if (newId !== userId) {
        setUserId(newId);
        setCurrentSessionId(null);
        sessionIdRef.current = null;
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem('analyiz_session_owner');
        setMessages([{ role: 'ia', content: 'Olá! 😊 Como posso te ajudar hoje?', time: getTime(), id: `init-${Date.now()}`, sources: [] }]);
        setTypingSet(new Set());
        setHasUnread(false);
      }
    };
    window.addEventListener('storage', checkUser);
    const iv = setInterval(checkUser, 2000);
    return () => { window.removeEventListener('storage', checkUser); clearInterval(iv); };
  }, [userId]);

  const [messages, setMessages]   = useState([]);
  const [typingSet, setTypingSet] = useState(new Set());

  const sessionLoadedRef = useRef(false);
  const sessionIdRef     = useRef(currentSessionId);
  const isChatOpenRef    = useRef(isChatOpen);
  const scrollRef        = useRef(null);
  const textareaRef      = useRef(null);
  const fileInputRef     = useRef(null);

  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { isChatOpenRef.current = isChatOpen; }, [isChatOpen]);

  useEffect(() => {
    if (currentSessionId && userId) {
      localStorage.setItem(SESSION_STORAGE_KEY, String(currentSessionId));
      localStorage.setItem('analyiz_session_owner', String(userId));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem('analyiz_session_owner');
    }
  }, [currentSessionId, userId]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const last = messages[messages.length - 1];
    if (last?.role === 'ia' && !isChatOpenRef.current) setHasUnread(true);
  }, [messages]);

  useEffect(() => { if (isChatOpen) setHasUnread(false); }, [isChatOpen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isChatLoading, pendingMessage, typingSet]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  }, [chatInput]);

  useEffect(() => {
    if (!currentSessionId) {
      sessionLoadedRef.current = true;
      setMessages([{ role: 'ia', content: 'Olá! 😊 Como posso te ajudar hoje?', time: getTime(), id: 'init', sources: [] }]);
      return;
    }
    fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`)
      .then(r => r.json())
      .then(msgs => {
        sessionLoadedRef.current = true;
        setMessages(msgs.length > 0
          ? msgs.map(m => ({ role: m.role, content: m.content, time: new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), id: String(m.id), sources: [], hadImage: !!m.imageBase64, imageDesc: m.imageDesc || null }))
          : [{ role: 'ia', content: 'Olá! 😊 Como posso te ajudar hoje?', time: getTime(), id: 'init', sources: [] }]
        );
      })
      .catch(() => { sessionLoadedRef.current = true; setMessages([{ role: 'ia', content: 'Olá! 😊 Como posso te ajudar hoje?', time: getTime(), id: 'init', sources: [] }]); });
  }, []);

  const loadSession = useCallback((sessionId) => {
    setCurrentSessionId(sessionId);
    sessionIdRef.current = sessionId;
    setTypingSet(new Set());
    if (!sessionId) {
      setMessages([{ role: 'ia', content: 'Olá! 😊 Como posso te ajudar hoje?', time: getTime(), id: `init-${Date.now()}`, sources: [] }]);
      return;
    }
    fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages`)
      .then(r => r.json())
      .then(msgs => {
        setMessages(msgs.length > 0
          ? msgs.map(m => ({ role: m.role, content: m.content, time: new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), id: String(m.id), sources: [], hadImage: !!m.imageBase64, imageDesc: m.imageDesc || null }))
          : [{ role: 'ia', content: 'Olá! 😊 Como posso te ajudar hoje?', time: getTime(), id: `init-${Date.now()}`, sources: [] }]
        );
      })
      .catch(() => {});
  }, []);

  const ensureSession = useCallback(async () => {
    const existingId = sessionIdRef.current;
    if (existingId) return existingId;
    if (!userId) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const s = await res.json();
      setCurrentSessionId(s.id);
      sessionIdRef.current = s.id;
      return s.id;
    } catch { return null; }
  }, [userId]);

  // ── Análise proativa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const seenInsights = new Set();

    const poll = async () => {
      const pageKey = getCurrentPageKey();
      if (isChatOpenRef.current || !pageKey) return;
      try {
        const res  = await fetch(`${API_BASE_URL}/api/ia/proactive`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body:   JSON.stringify({ userId, userRole, pageKey }),
        });
        const data = await res.json();
        if (!data.insight) return;
        const insightKey = data.insight.substring(0, 80);
        if (seenInsights.has(insightKey)) return;
        seenInsights.add(insightKey);
        const iaId = `proactive-${Date.now()}`;
        setMessages(prev => [...prev, { role: 'ia', content: data.insight, time: getTime(), id: iaId, sources: [], isProactive: true }]);
        setNewMsgIds(prev => new Set(prev).add(iaId));
        setTypingSet(prev => new Set(prev).add(iaId));
        setHasUnread(true);
        if (!isChatOpenRef.current && typeof toggleChat === 'function') setTimeout(() => toggleChat(), 500);
      } catch {}
    };

    const initial  = setTimeout(poll, 3000);
    const interval = setInterval(poll, 2 * 60 * 1000);
    const onNav    = () => { setTimeout(poll, 500); };
    window.addEventListener('popstate', onNav);
    const origPush = history.pushState.bind(history);
    history.pushState = (...args) => { origPush(...args); setTimeout(poll, 600); };

    return () => {
      clearTimeout(initial); clearInterval(interval);
      window.removeEventListener('popstate', onNav);
      history.pushState = origPush;
    };
  }, [userId, userRole, toggleChat]);

  // ── Upload de imagem ──────────────────────────────────────────────────────
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPendingImage({ base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg', preview: dataUrl, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Envio ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if ((!chatInput.trim() && !pendingImage) || isChatLoading) return;
    const userMessage = chatInput.trim();
    const imgToSend   = pendingImage;
    const time        = getTime();
    const msgId       = `user-${Date.now()}`;

    setMessages(prev => [...prev, { role: 'user', content: userMessage, time, id: msgId, imagePreview: imgToSend?.preview || null, hadImage: !!imgToSend, sources: [] }]);
    setChatInput('');
    setPendingImage(null);
    setIsChatLoading(true);
    setPendingMessage(imgToSend && !userMessage ? 'imagem' : userMessage);
    if (onLog) onLog('[IA_Analyiz] Processando...', 'info');

    try {
      const sid  = await ensureSession();
      const res  = await fetch(`${API_BASE_URL}/api/ia/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, sessionId: sid, userRole, userId, ...(imgToSend ? { imageBase64: imgToSend.base64, imageMimeType: imgToSend.mimeType } : {}) }),
      });
      const data = await res.json();
      if (data.sessionId && !sessionIdRef.current) { setCurrentSessionId(data.sessionId); sessionIdRef.current = data.sessionId; }
      const iaId = `ia-${Date.now()}`;
      setMessages(prev => [...prev, { role: 'ia', content: data.reply, time: getTime(), id: iaId, sources: data.sources || [] }]);
      setTypingSet(prev => new Set(prev).add(iaId));
      if (onLog) onLog('[IA_Analyiz] Resposta gerada.', 'success');
    } catch {
      setMessages(prev => [...prev, { role: 'ia', content: 'Erro de conexão. Tente novamente. ⚠️', time: getTime(), id: `err-${Date.now()}`, sources: [] }]);
    } finally { setIsChatLoading(false); setPendingMessage(''); }
  }, [chatInput, pendingImage, isChatLoading, userRole, userId, ensureSession, onLog]);

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setMessages([{ role: 'ia', content: 'Olá! 😊 Como posso te ajudar hoje?', time: getTime(), id: `init-${Date.now()}`, sources: [] }]);
    setTypingSet(new Set());
  };

  const W = isExpanded ? 'min(520px, 92vw)' : '360px';
  const H = isExpanded ? 'min(660px, 85vh)' : 'min(520px, calc(100vh - 5rem))';

  return (
    <>
      <style>{`
        @keyframes ia-spin    { to { transform: rotate(360deg); } }
        @keyframes ia-blink   { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes ia-fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .ia-scroll::-webkit-scrollbar       { width:4px; }
        .ia-scroll::-webkit-scrollbar-track { background:transparent; }
        .ia-scroll::-webkit-scrollbar-thumb { background:#e2e8f0;border-radius:4px; }
        .ia-ta  { resize:none;overflow-y:auto; }
        .ia-msg a { color:#1e40af;text-decoration:underline;text-decoration-color:rgba(30,64,175,0.4);font-weight:500;cursor:pointer; }
        .ia-msg a:hover { color:#1d4ed8;text-decoration-color:#1d4ed8; }
      `}</style>

      {/* ══ JANELA ══════════════════════════════════════════════════════════ */}
      <div style={{
        position:'fixed', zIndex:9999, bottom:'1.5rem', right:'1.5rem',
        width:W, height:H, maxHeight:'calc(100vh - 3rem)',
        background:'#ffffff', borderRadius:'20px',
        boxShadow:'0 4px 32px rgba(0,0,0,0.15)',
        display:'flex', flexDirection:'column', overflow:'hidden',
        transformOrigin:'bottom right',
        transform:     isChatOpen ? 'scale(1)' : 'scale(0)',
        opacity:       isChatOpen ? 1 : 0,
        pointerEvents: isChatOpen ? 'auto' : 'none',
        transition:'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s',
      }}>

        {/* Header */}
        <div style={{ position:'relative', padding:'12px 14px', borderBottom:'1px solid #eeeeee', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#ffffff', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>

            {/* GIF no header */}
            <ChatHeaderAvatar />

            <div>
              <span style={{ fontWeight:700, fontSize:'14px', color:'#1e293b', display:'block', lineHeight:'1.2' }}>
                Assistente
              </span>
              <span style={{ fontSize:'10px', color:'#94a3b8', fontWeight:500 }}>
                IA Analyiz • Online
              </span>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
            <button onClick={() => setShowSessions(v => !v)} title="Conversas"
              style={{ background: showSessions ? '#f0f4ff' : 'none', border:'none', cursor:'pointer', padding:'5px', color: showSessions ? BRAND : '#aaa', display:'flex', borderRadius:'6px' }}>
              <MessageSquare size={14} />
            </button>
            <button onClick={() => setIsExpanded(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', padding:'5px', color:'#aaa', display:'flex' }}>
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={toggleChat} style={{ background:'none', border:'none', cursor:'pointer', padding:'5px', color:'#aaa', display:'flex' }}>
              <Minus size={14} />
            </button>
          </div>

          {showSessions && (
            <SessionsPanel
              userId={userId}
              currentSessionId={currentSessionId}
              onSelectSession={(id) => { loadSession(id); setShowSessions(false); }}
              onNewSession={() => { handleNewSession(); setShowSessions(false); }}
              onClose={() => setShowSessions(false)}
            />
          )}
        </div>

        {/* Aviso IA */}
        <div style={{ textAlign:'center', padding:'5px 16px', fontSize:'11px', color:'#aaa', borderBottom:'1px solid #f5f5f5', background:'#ffffff', flexShrink:0 }}>
          Este assistente usa inteligência artificial para te responder
        </div>

        {/* Mensagens */}
        <div ref={scrollRef} className="ia-scroll" style={{ flex:1, overflowY:'auto', padding:'12px 14px', background:'#ffffff' }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ marginBottom:'10px' }}>
              {msg.role === 'ia' ? (
                <div className="ia-msg" style={{ fontSize:'13.5px', color:'#333', lineHeight:'1.55' }}>
                  {msg.isProactive && newMsgIds.has(msg.id) && <NewBadge />}
                  {typingSet.has(msg.id) ? (
                    <TypewriterText html={msg.content} speed={12}
                      onDone={() => setTypingSet(p => { const n = new Set(p); n.delete(msg.id); return n; })} />
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                  )}
                  <Sources sources={msg.sources} />
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                  {msg.imagePreview && <img src={msg.imagePreview} alt="imagem enviada" style={{ maxWidth:'160px', maxHeight:'120px', borderRadius:'10px', marginBottom:'4px', objectFit:'cover' }} />}
                  {!msg.imagePreview && msg.hadImage && (
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'#f0f0f0', borderRadius:'10px', padding:'6px 10px', marginBottom:'4px', fontSize:'12px', color:'#666' }}>
                      <span>📸</span><span>{msg.imageDesc ? msg.imageDesc.substring(0, 60) + '...' : 'Imagem enviada'}</span>
                    </div>
                  )}
                  {msg.content && (
                    <div style={{ background:'#f0f0f0', color:'#333', borderRadius:'16px 16px 4px 16px', padding:'8px 12px', fontSize:'13.5px', lineHeight:'1.45', maxWidth:'80%', wordBreak:'break-word', whiteSpace:'pre-wrap' }}>
                      {msg.content}
                    </div>
                  )}
                  {msg.time && <span style={{ fontSize:'11px', color:'#bbb', marginTop:'2px', paddingRight:'2px' }}>{msg.time}</span>}
                </div>
              )}
            </div>
          ))}
          {isChatLoading && pendingMessage && <div style={{ marginBottom:'10px' }}><SpinnerThinking message={pendingMessage} /></div>}
        </div>

        {/* Preview imagem pendente */}
        {pendingImage && (
          <div style={{ padding:'6px 12px', background:'#f8fafc', borderTop:'1px solid #eee', display:'flex', alignItems:'center', gap:'8px' }}>
            <img src={pendingImage.preview} alt="preview" style={{ width:'40px', height:'40px', objectFit:'cover', borderRadius:'6px' }} />
            <span style={{ fontSize:'12px', color:'#64748b', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pendingImage.name}</span>
            <button onClick={() => setPendingImage(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={14} /></button>
          </div>
        )}

        {/* Input */}
        <div style={{ borderTop:'1px solid #eeeeee', background:'#ffffff', padding:'9px 12px', display:'flex', alignItems:'flex-end', gap:'8px', flexShrink:0 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={isChatLoading} title="Enviar imagem"
            style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color: pendingImage ? BRAND : '#aaa', display:'flex', flexShrink:0 }}>
            <Paperclip size={16} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageSelect} />
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isChatLoading}
            rows={1}
            placeholder={pendingImage ? 'Pergunta sobre a imagem...' : 'Pergunte ao assistente...'}
            className="ia-ta"
            style={{ flex:1, border:'none', outline:'none', fontSize:'13.5px', color:'#333', background:'transparent', lineHeight:'1.45', minHeight:'22px', maxHeight:'100px', fontFamily:'inherit', padding:0, opacity: isChatLoading ? 0.5 : 1 }}
          />
          <button onClick={handleSend} disabled={isChatLoading || (!chatInput.trim() && !pendingImage)}
            style={{ width:'32px', height:'32px', borderRadius:'50%', border:'none', background:(chatInput.trim() || pendingImage) && !isChatLoading ? BRAND : '#e8e8e8', cursor:(chatInput.trim() || pendingImage) && !isChatLoading ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.15s' }}>
            <Send size={15} style={{ color:(chatInput.trim() || pendingImage) && !isChatLoading ? '#fff' : '#bbb', marginLeft:'1px' }} />
          </button>
        </div>
      </div>

      {/* ══ BOTÃO FLUTUANTE ════════════════════════════════════════════════ */}
      <div style={{ position:'fixed', zIndex:9998, bottom:'1.5rem', right:'1.5rem', transform: isChatOpen ? 'scale(0)' : 'scale(1)', opacity: isChatOpen ? 0 : 1, pointerEvents: isChatOpen ? 'none' : 'auto', transition:'transform 0.2s, opacity 0.15s' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} />
      </div>
    </>
  );
}