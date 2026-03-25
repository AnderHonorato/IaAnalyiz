// IaAnalyizChat.jsx — v2: balão com teaser real, chat exibe mensagem da IA, notificações do BD

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2,
         ChevronDown, ChevronUp, Paperclip, X, Plus, ExternalLink, Globe } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';
const BRAND        = '#1e293b';
const SESSION_KEY  = 'analyiz_last_session_id';
const POLL_INITIAL = 8 * 1000;       // 8s após montar para 1ª verificação
const POLL_INTERVAL= 10 * 60 * 1000; // Depois verifica a cada 10min (o backend controla cooldown real de 6h)

import gifolhos from '../assets/gifolhos1.gif';
const IA_GIF = gifolhos;

// ─── Spinner contextual ───────────────────────────────────────────────────────
const SPINNER_CONTEXTS = {
  web:     ['Navegando na web...','Lendo fontes...','Compilando dados...','Quase lá...'],
  diverge: ['Verificando pesos...','Cruzando fretes...','Analisando divergências...'],
  produto: ['Buscando produtos...','Consultando catálogo...'],
  usuario: ['Consultando usuários...','Verificando acessos...'],
  imagem:  ['Analisando imagem...','Identificando elementos...'],
  default: ['Pensando...','Processando...','Quase pronto...','Analisando...'],
};

function getSpinnerMessages(message) {
  if (!message) return SPINNER_CONTEXTS.default;
  if (/busca|web|google|pesquis|hora|data|previsão|mercado livre|taxa|tarifa/i.test(message)) return SPINNER_CONTEXTS.web;
  if (/divergên|peso|frete|anúncio|auditoria/i.test(message)) return SPINNER_CONTEXTS.diverge;
  if (/produto|sku|kit|catálogo/i.test(message)) return SPINNER_CONTEXTS.produto;
  if (/usuário|acesso|bloqueio/i.test(message)) return SPINNER_CONTEXTS.usuario;
  if (/imagem|foto/i.test(message)) return SPINNER_CONTEXTS.imagem;
  return SPINNER_CONTEXTS.default;
}

function SpinnerThinking({ message, startTime }) {
  const msgs = getSpinnerMessages(message);
  const [idx, setIdx] = useState(0);
  const [isLate, setIsLate] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % msgs.length), 2200);
    return () => clearInterval(t);
  }, [msgs.length]);

  useEffect(() => {
    const t = setTimeout(() => setIsLate(true), 8000);
    return () => clearTimeout(t);
  }, []);

  const isToolStep = message && (
    message.includes('...') || message.includes('Buscando') ||
    message.includes('Enviando') || message.includes('Ativando') ||
    message.includes('Acessando') || message.includes('Verificando') ||
    message.includes('Marcando') || message.includes('Listando') ||
    message.includes('Compilando') || message.includes('Analisando')
  );

  // Se é mensagem de step de tool, mostra ela diretamente; senão cicla
  const displayMsg = isToolStep ? message : msgs[idx];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'4px', padding:'2px 0' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <span style={{ display:'inline-block', width:'16px', height:'16px', borderRadius:'50%', border:'2px solid #e2e8f0', borderTop:`2px solid ${BRAND}`, animation:'ia-spin 0.8s linear infinite', flexShrink:0 }}/>
        <span style={{ fontSize:'13px', color: isToolStep ? '#1e40af' : '#64748b', transition:'all 0.3s', fontWeight: isToolStep ? 600 : 400 }}>{displayMsg}</span>
      </div>
      {isLate && !isToolStep && <span style={{ fontSize:'11px', color:'#94a3b8', marginLeft:'24px', fontStyle:'italic' }}>Está demorando um pouco mais... ⏳</span>}
    </div>
  );
}

// ─── DiffusionText (typing effect) ───────────────────────────────────────────
function DiffusionText({ html, speed = 6, onDoneRef }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const tokensRef = useRef([]);
  const timerRef  = useRef(null);

  useEffect(() => {
    const tokens = [];
    let i = 0;
    const src = html || '';
    while (i < src.length) {
      if (src[i] === '<') {
        const end = src.indexOf('>', i);
        if (end === -1) { tokens.push(src[i]); i++; }
        else { tokens.push(src.substring(i, end + 1)); i = end + 1; }
      } else if (src[i] === '&') {
        const end = src.indexOf(';', i);
        if (end === -1) { tokens.push(src[i]); i++; }
        else { tokens.push(src.substring(i, end + 1)); i = end + 1; }
      } else { tokens.push(src[i]); i++; }
    }
    tokensRef.current = tokens;
    setVisibleCount(0);
    if (!tokens.length) { setTimeout(() => onDoneRef?.current?.(), 0); return; }

    timerRef.current = setInterval(() => {
      setVisibleCount(prev => {
        const next = Math.min(prev + 4, tokens.length);
        if (next >= tokens.length) {
          clearInterval(timerRef.current);
          setTimeout(() => onDoneRef?.current?.(), 0);
        }
        return next;
      });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [html]); // eslint-disable-line

  const visible = tokensRef.current.slice(0, visibleCount).join('');
  const hidden  = tokensRef.current.slice(visibleCount).join('');
  const cursor  = visibleCount < tokensRef.current.length
    ? '<span style="opacity:0.5;animation:ia-blink 0.8s step-end infinite">▍</span>' : '';
  const fullHtml = visible
    + (hidden ? `<span style="opacity:0;user-select:none;pointer-events:none;font-size:0">${hidden}</span>` : '')
    + cursor;
  return <SafeHTMLMessage html={fullHtml} />;
}

// ─── Extrai links ─────────────────────────────────────────────────────────────
function extractLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1], label = m[2].trim() || m[1];
    if (href && href !== '#') links.push({ href, label });
  }
  return [...new Map(links.map(l => [l.href, l])).values()];
}

function LinkCard({ links }) {
  const [open, setOpen] = useState(false);
  if (!links || links.length === 0) return null;
  return (
    <div style={{ marginTop:'10px', borderTop:'1px solid #f0f0f0', paddingTop:'8px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:'6px', background:'#f8fafc', border:'1px solid #e2e8f0', cursor:'pointer', padding:'4px 8px', borderRadius:'8px', fontSize:'11px', color:'#64748b', fontWeight:600 }}>
        <Globe size={12}/> {links.length} link{links.length > 1 ? 's' : ''} referenciado{links.length > 1 ? 's' : ''}
        {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      </button>
      {open && (
        <div style={{ marginTop:'6px', display:'flex', flexDirection:'column', gap:'4px' }}>
          {links.map((l, i) => {
            const isMLB = /MLB\d+/i.test(l.label) || /mercadolivre|mercadolibre/i.test(l.href);
            const isInt  = l.href.startsWith('/');
            return (
              <a key={i} href={l.href} target={isInt ? '_self' : '_blank'} rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', color:isMLB?'#f59e0b':BRAND, textDecoration:'none', background:isMLB?'#fffbeb':'#f8fafc', borderRadius:'8px', padding:'6px 10px', border:`1px solid ${isMLB?'#fde68a':'#e2e8f0'}`, fontWeight:isMLB?700:400 }}>
                {isMLB ? '🛒' : isInt ? '🔗' : <ExternalLink size={11}/>}
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.label}</span>
                {!isInt && <ExternalLink size={10} style={{ opacity:0.4 }}/>}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Enriquece HTML ───────────────────────────────────────────────────────────
function enrichHTML(html) {
  if (!html) return '';
  return html
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#f59e0b;font-weight:700;text-decoration:underline">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .trim();
}

function SafeHTMLMessage({ html }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll('a[href^="/"]').forEach(a => {
      a.style.cssText = 'color:#1e40af;text-decoration:underline;font-weight:600;cursor:pointer';
      const clone = a.cloneNode(true);
      clone.addEventListener('click', e => { e.preventDefault(); window.location.href = a.getAttribute('href'); });
      a.parentNode?.replaceChild(clone, a);
    });
    ref.current.querySelectorAll('a[href^="http"]').forEach(a => {
      a.style.cssText = 'color:#1e40af;text-decoration:underline;font-weight:600';
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [html]);
  return <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} style={{ wordBreak:'break-word' }}/>;
}

// ─── Mensagem da IA ───────────────────────────────────────────────────────────
function ToolStepsLog({ steps }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div style={{ marginTop:'8px', borderTop:'1px solid #f0f0f0', paddingTop:'6px' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:'#64748b' }}>
            <span style={{ color:'#10b981', flexShrink:0 }}>✓</span>
            <span>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IaMessage({ msg, isTyping, onDone }) {
  const enriched  = enrichHTML(msg.content);
  const links     = extractLinks(enriched);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  return (
    <div className="ia-msg" style={{ fontSize:'13px', color:'#333', lineHeight:'1.6' }}>
      {/* Log colapsável dos passos executados */}
      {msg.toolSteps && msg.toolSteps.length > 0 && !isTyping && (
        <ToolStepsLog steps={msg.toolSteps} />
      )}
      {isTyping ? (
        <DiffusionText html={enriched} speed={6} onDoneRef={onDoneRef}/>
      ) : (
        <SafeHTMLMessage html={enriched}/>
      )}
      {!isTyping && links.length > 0 && <LinkCard links={links}/>}
      {msg.sources && msg.sources.length > 0 && <SourcesPanel sources={msg.sources}/>}
    </div>
  );
}

function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div style={{ marginTop:'8px', borderTop:'1px solid #f0f0f0', paddingTop:'6px' }}>
      <button onClick={() => setOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:'4px', background:'none', border:'none', cursor:'pointer', fontSize:'11px', color:'#94a3b8', padding:0 }}>
        {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} {sources.length} fonte{sources.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{ marginTop:'6px', display:'flex', flexDirection:'column', gap:'4px' }}>
          {sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:BRAND, textDecoration:'none', background:'#f8fafc', borderRadius:'6px', padding:'5px 8px', border:'1px solid #e2e8f0' }}>
              <span>🔗</span>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sessões ──────────────────────────────────────────────────────────────────
function SessionsPanel({ userId, currentSessionId, onSelectSession, onNewSession, onClose, onConfirmDelete }) {
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
    const ok = await onConfirmDelete();
    if (!ok) return;
    await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`, { method:'DELETE' });
    if (id === currentSessionId) onNewSession();
    load();
  };

  return (
    <div style={{ position:'absolute', top:'52px', right:0, left:0, background:'#fff', zIndex:10, borderBottom:'1px solid #eee', maxHeight:'260px', overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.06)' }}>
      <button onClick={() => { onNewSession(); onClose(); }}
        style={{ width:'100%', padding:'10px 14px', display:'flex', alignItems:'center', gap:'8px', background:'none', border:'none', borderBottom:'1px solid #f5f5f5', cursor:'pointer', fontSize:'13px', color:BRAND, fontWeight:600 }}>
        <Plus size={14}/> Nova conversa
      </button>
      {loading && <p style={{ padding:'12px', fontSize:'12px', color:'#94a3b8' }}>Carregando... ⏳</p>}
      {sessions.map(s => (
        <div key={s.id} onClick={() => { onSelectSession(s.id); onClose(); }}
          style={{ padding:'9px 14px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'#444', background:s.id===currentSessionId?'#f0f4ff':'transparent', borderBottom:'1px solid #f8f8f8' }}>
          <MessageSquare size={13} style={{ color:'#94a3b8', flexShrink:0 }}/>
          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.titulo}</span>
          <button onClick={e => del(e, s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', padding:'2px' }}><Trash2 size={12}/></button>
        </div>
      ))}
    </div>
  );
}

// ─── Botão flutuante ──────────────────────────────────────────────────────────
function FloatingButton({ onClick, hasUnread, shortPreview }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position:'relative', display:'inline-flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
      {/* Balão de notificação — texto teaser vindo do banco */}
      {hasUnread && shortPreview && (
        <div
          onClick={onClick}
          style={{
            background: BRAND, color:'white', fontSize:'12px', fontWeight:500,
            padding:'8px 12px', borderRadius:'12px 12px 12px 4px',
            maxWidth:'240px', lineHeight:'1.4',
            boxShadow:'0 2px 12px rgba(30,41,59,0.3)',
            animation:'ia-fade-in 0.3s ease',
            cursor:'pointer', wordBreak:'break-word',
          }}
        >
          {shortPreview}
        </div>
      )}
      {/* Fallback quando há notificação mas sem texto (não deveria acontecer) */}
      {hasUnread && !shortPreview && (
        <div style={{ background:BRAND, color:'white', fontSize:'11px', fontWeight:500, padding:'5px 10px', borderRadius:'10px 10px 10px 2px', boxShadow:'0 2px 8px rgba(30,41,59,0.25)', animation:'ia-fade-in 0.3s ease', pointerEvents:'none' }}>
          Tenho algumas coisas relevantes que encontrei
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display:'flex', alignItems:'center', borderRadius:'999px', border:'none', outline:'none', background:BRAND, cursor:'pointer', boxShadow:'0 4px 20px rgba(30,41,59,0.45)', width:hovered?'172px':'62px', height:'62px', transition:'width 0.28s cubic-bezier(0.34,1.2,0.64,1)', padding:0, overflow:'hidden', position:'relative' }}>
        <span style={{ width:'62px', height:'62px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', overflow:'hidden', background:'#ffffff', order:1, zIndex:2 }}>
          <img src={IA_GIF} alt="IA" style={{ width:'58px', height:'58px', objectFit:'contain', display:'block', borderRadius:'50%' }} onError={e => { e.target.style.display='none'; }}/>
        </span>
        <span style={{ color:'white', fontSize:'13px', fontWeight:700, whiteSpace:'nowrap', paddingRight:'20px', paddingLeft:'4px', order:2, opacity:hovered?1:0, transition:'opacity 0.18s', pointerEvents:'none' }}>Assistente</span>
      </button>
    </div>
  );
}

function ChatHeaderAvatar() {
  return (
    <div style={{ width:'38px', height:'38px', borderRadius:'10px', background:'#ffffff', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
      <img src={IA_GIF} alt="IA" style={{ width:'34px', height:'34px', objectFit:'contain', display:'block' }} onError={e => { e.target.style.display='none'; }}/>
    </div>
  );
}

function getTime() { return new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function IaAnalyizChat({ isChatOpen, toggleChat, userRole }) {
  const [chatInput, setChatInput]           = useState('');
  const [isChatLoading, setIsChatLoading]   = useState(false);
  const [isExpanded, setIsExpanded]         = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [spinnerStart, setSpinnerStart]     = useState(null);
  const [hasUnread, setHasUnread]           = useState(false);
  const [shortPreview, setShortPreview]     = useState('');
  const [showSessions, setShowSessions]     = useState(false);
  const [pendingImage, setPendingImage]     = useState(null);
  const [typingSet, setTypingSet]           = useState(new Set());
  const [messages, setMessages]             = useState([]);
  const [toolSteps, setToolSteps]           = useState([]); // passos das tools durante execução

  // Ref para notificação proativa pendente do banco
  const pendingNotifRef = useRef(null); // { notifId, fullInsight }

  let modalConfirm = null;
  try {
    const mod = require('../components/Modal');
    if (mod?.useModal) { const { confirm } = mod.useModal(); modalConfirm = confirm; }
  } catch (_) {}

  const confirmDelete = useCallback(async () => {
    if (modalConfirm) return await modalConfirm({ title:'Excluir conversa', message:'Será removida permanentemente.', confirmLabel:'Excluir', danger:true });
    return window.confirm('Deletar esta conversa?');
  }, [modalConfirm]);

  const readUserId = () => { try { const u = JSON.parse(localStorage.getItem('analyiz_user')); return u?.id||null; } catch { return null; } };
  const [userId] = useState(readUserId);

  const [currentSessionId, setCurrentSessionId] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      const savedUser = localStorage.getItem('analyiz_session_owner');
      if (saved && savedUser === String(readUserId())) return parseInt(saved);
      return null;
    } catch { return null; }
  });

  const sessionIdRef      = useRef(currentSessionId);
  const isChatOpenRef     = useRef(isChatOpen);
  const scrollRef         = useRef(null);
  const textareaRef       = useRef(null);
  const fileInputRef      = useRef(null);
  const pollTimerRef      = useRef(null);

  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { isChatOpenRef.current = isChatOpen; }, [isChatOpen]);

  useEffect(() => {
    if (currentSessionId && userId) {
      localStorage.setItem(SESSION_KEY, String(currentSessionId));
      localStorage.setItem('analyiz_session_owner', String(userId));
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('analyiz_session_owner');
    }
  }, [currentSessionId, userId]);

  // ── Quando o chat ABRE: exibe insight pendente + marca como visto ──────────
  useEffect(() => {
    if (!isChatOpen) return;
    setHasUnread(false);
    setShortPreview('');

    const payload = pendingNotifRef.current;
    if (!payload) return;

    const notifId = payload.notifId;
    const fullInsight = payload.fullInsight;
    pendingNotifRef.current = null;

    // Marca como vista no banco
    if (notifId && userId) {
      fetch(`${API_BASE_URL}/api/ia/proactive/seen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, notifId }),
      }).catch(() => {});
    }

    // Exibe como mensagem da IA no chat
    setTimeout(() => {
      const iaId = `ia-proactive-${Date.now()}`;
      setMessages(prev => [...prev, {
        role:        'ia',
        content:     fullInsight,
        time:        getTime(),
        id:          iaId,
        sources:     [],
        isProactive: true,
      }]);
      setTypingSet(prev => new Set(prev).add(iaId));
    }, 400);
  }, [isChatOpen]); // eslint-disable-line

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isChatLoading, pendingMessage, typingSet]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  }, [chatInput]);

  const mapMessage = m => ({
    role:    m.role,
    content: m.content,
    time: (() => {
      try { const d = new Date(m.createdAt); return isNaN(d.getTime()) ? getTime() : d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
      catch { return getTime(); }
    })(),
    id: String(m.id), sources: [], hadImage: !!m.imageBase64,
  });

  useEffect(() => {
    if (!currentSessionId) {
      setMessages([{ role:'ia', content:'Olá! 😊 Seja bem-vindo à IA Analyiz! Estou aqui para te ajudar com seus anúncios, divergências de frete, pesquisas e muito mais. Como posso te ajudar hoje?', time:getTime(), id:'init', sources:[] }]);
      return;
    }
    fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`)
      .then(r => r.json())
      .then(msgs => {
        setMessages(msgs.length > 0 ? msgs.map(mapMessage) : [{ role:'ia', content:'Olá! 😊 Seja bem-vindo de volta! Como posso te ajudar hoje?', time:getTime(), id:'init', sources:[] }]);
      })
      .catch(() => setMessages([{ role:'ia', content:'Olá! 😊 Como posso te ajudar hoje?', time:getTime(), id:'init', sources:[] }]));
  }, []); // eslint-disable-line

  const loadSession = useCallback((sessionId) => {
    setCurrentSessionId(sessionId); sessionIdRef.current = sessionId;
    setTypingSet(new Set());
    if (!sessionId) {
      setMessages([{ role:'ia', content:'Olá! 😊 Nova conversa! Como posso ajudar?', time:getTime(), id:`init-${Date.now()}`, sources:[] }]);
      return;
    }
    fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages`)
      .then(r => r.json())
      .then(msgs => setMessages(msgs.length > 0 ? msgs.map(mapMessage) : [{ role:'ia', content:'Olá! 😊 Como posso te ajudar?', time:getTime(), id:`init-${Date.now()}`, sources:[] }]))
      .catch(() => {});
  }, []);

  const ensureSession = useCallback(async () => {
    const existingId = sessionIdRef.current;
    if (existingId) return existingId;
    if (!userId) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/sessions`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId }) });
      const s   = await res.json();
      setCurrentSessionId(s.id); sessionIdRef.current = s.id;
      return s.id;
    } catch { return null; }
  }, [userId]);

  // ── Sistema proativo — poll com controle de cooldown no backend ────────────
  const verificarProativo = useCallback(async () => {
    if (!userId || isChatOpenRef.current) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/proactive`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, userRole }),
      });
      const data = await res.json();

      // Backend retorna null se: cooldown ativo, max notifis atingido, sem dados relevantes
      if (!data.insight || !data.hasRelevantData) return;

      // Salva para exibir no chat quando abrir
      pendingNotifRef.current = {
        notifId:    data.notifId,
        fullInsight: data.fullInsight,
      };

      // Mostra balão com o TEASER (resumoBotao do banco — não o fullInsight)
      setShortPreview(data.insight);
      setHasUnread(true);

      // Marca como exibida no balão
      if (data.notifId) {
        fetch(`${API_BASE_URL}/api/ia/proactive/exibida`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ userId, notifId: data.notifId }),
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[Proactive] Erro:', e.message);
    }
  }, [userId, userRole]);

  useEffect(() => {
    if (!userId) return;

    // Primeira verificação após 8s
    const first = setTimeout(verificarProativo, POLL_INITIAL);

    // Poll a cada 10 min (backend controla cooldown de 6h real)
    pollTimerRef.current = setInterval(verificarProativo, POLL_INTERVAL);

    return () => {
      clearTimeout(first);
      clearInterval(pollTimerRef.current);
    };
  }, [verificarProativo]);

  // ── Upload de imagem ──────────────────────────────────────────────────────
  const handleImageSelect = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      setPendingImage({ base64:dataUrl.split(',')[1], mimeType:file.type||'image/jpeg', preview:dataUrl, name:file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePaste = useCallback(e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = ev => {
          const dataUrl = ev.target.result;
          setPendingImage({ base64:dataUrl.split(',')[1], mimeType:item.type||'image/png', preview:dataUrl, name:`imagem_${Date.now()}.png` });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, []);

  // ── Envio ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if ((!chatInput.trim() && !pendingImage) || isChatLoading) return;
    const userMessage = chatInput.trim();
    const imgToSend   = pendingImage;
    const isImageOnly = imgToSend && !userMessage;
    const msgId       = `user-${Date.now()}`;

    setMessages(prev => [...prev, { role:'user', content:userMessage, time:getTime(), id:msgId, imagePreview:imgToSend?.preview||null, hadImage:!!imgToSend, sources:[] }]);
    setChatInput(''); setPendingImage(null); setIsChatLoading(true);
    setPendingMessage(isImageOnly ? 'analisando imagem' : userMessage);
    setSpinnerStart(Date.now());
    setToolSteps([]);

    const stepsAccum = [];

    try {
      const sid = await ensureSession();

      const body = JSON.stringify({
        message:     isImageOnly ? '' : userMessage,
        pageUrl:     window.location.pathname,
        sessionId:   sid, userRole, userId,
        imageOnly:   isImageOnly,
        ...(imgToSend ? { imageBase64:imgToSend.base64, imageMimeType:imgToSend.mimeType } : {}),
      });

      // Usa endpoint SSE para receber progresso das tools em tempo real
      const res = await fetch(`${API_BASE_URL}/api/ia/chat/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';
      let   done    = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) buffer += decoder.decode(value, { stream: true });

        // Processa linhas SSE completas
        const lines = buffer.split('\n');
        buffer = lines.pop(); // última linha pode estar incompleta

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'step') {
                // Mensagem de progresso: adiciona ao estado de steps ativos
                stepsAccum.push(data.msg);
                setToolSteps([...stepsAccum]);
                setPendingMessage(data.msg); // atualiza o spinner com o texto atual

              } else if (currentEvent === 'done') {
                // Resposta final recebida
                if (data.sessionId && !sessionIdRef.current) {
                  setCurrentSessionId(data.sessionId);
                  sessionIdRef.current = data.sessionId;
                }
                const iaId = `ia-${Date.now()}`;
                setMessages(prev => [...prev, {
                  role:    'ia',
                  content: data.reply,
                  time:    getTime(),
                  id:      iaId,
                  sources: data.sources || [],
                  toolSteps: stepsAccum.length > 0 ? [...stepsAccum] : undefined,
                }]);
                setTypingSet(prev => new Set(prev).add(iaId));

              } else if (currentEvent === 'error') {
                throw new Error(data.message || 'Erro no stream');
              }
            } catch (parseErr) {
              if (currentEvent !== 'step') throw parseErr;
            }
            currentEvent = null;
          }
        }
      }

    } catch (err) {
      console.warn('[Chat stream]', err.message);
      setMessages(prev => [...prev, { role:'ia', content:'⚠️ Erro de conexão. Tente novamente!', time:getTime(), id:`err-${Date.now()}`, sources:[] }]);
    } finally {
      setIsChatLoading(false);
      setPendingMessage('');
      setSpinnerStart(null);
      setToolSteps([]);
    }
  }, [chatInput, pendingImage, isChatLoading, userRole, userId, ensureSession]);

  const handleKeyDown = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleNewSession = () => {
    setCurrentSessionId(null); sessionIdRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setMessages([{ role:'ia', content:'😊 Nova conversa! Como posso te ajudar?', time:getTime(), id:`init-${Date.now()}`, sources:[] }]);
    setTypingSet(new Set());
  };

  const W = isExpanded ? 'min(560px, 94vw)' : '370px';
  const H = isExpanded ? 'min(680px, 87vh)' : 'min(540px, calc(100vh - 5rem))';

  return (
    <>
      <style>{`
        @keyframes ia-spin    { to { transform: rotate(360deg); } }
        @keyframes ia-blink   { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes ia-fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .ia-scroll::-webkit-scrollbar       { width:4px; }
        .ia-scroll::-webkit-scrollbar-track { background:transparent; }
        .ia-scroll::-webkit-scrollbar-thumb { background:#e2e8f0;border-radius:4px; }
        .ia-msg a { color:#1e40af !important;text-decoration:underline;font-weight:600;cursor:pointer; }
        .ia-msg b { font-weight:700; }
      `}</style>

      {/* Janela do chat */}
      <div style={{ position:'fixed', zIndex:9999, bottom:'1.5rem', right:'1.5rem', width:W, height:H, maxHeight:'calc(100vh - 3rem)', background:'#ffffff', borderRadius:'20px', boxShadow:'0 4px 32px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', overflow:'hidden', transformOrigin:'bottom right', transform:isChatOpen?'scale(1)':'scale(0)', opacity:isChatOpen?1:0, pointerEvents:isChatOpen?'auto':'none', transition:'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s' }}>

        {/* Header */}
        <div style={{ position:'relative', padding:'12px 14px', borderBottom:'1px solid #eeeeee', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#ffffff', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <ChatHeaderAvatar/>
            <div>
              <span style={{ fontWeight:700, fontSize:'14px', color:'#1e293b', display:'block', lineHeight:'1.2' }}>Assistente</span>
              <span style={{ fontSize:'10px', color:'#94a3b8', fontWeight:500 }}>IA Analyiz • Online ✨</span>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
            <button onClick={() => setShowSessions(v => !v)} style={{ background:showSessions?'#f0f4ff':'none', border:'none', cursor:'pointer', padding:'5px', color:showSessions?BRAND:'#aaa', display:'flex', borderRadius:'6px' }}><MessageSquare size={14}/></button>
            <button onClick={() => setIsExpanded(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', padding:'5px', color:'#aaa', display:'flex' }}>{isExpanded?<Minimize2 size={14}/>:<Maximize2 size={14}/>}</button>
            <button onClick={toggleChat} style={{ background:'none', border:'none', cursor:'pointer', padding:'5px', color:'#aaa', display:'flex' }}><Minus size={14}/></button>
          </div>
          {showSessions && (
            <SessionsPanel userId={userId} currentSessionId={currentSessionId}
              onSelectSession={id => { loadSession(id); setShowSessions(false); }}
              onNewSession={() => { handleNewSession(); setShowSessions(false); }}
              onClose={() => setShowSessions(false)} onConfirmDelete={confirmDelete}/>
          )}
        </div>

        <div style={{ textAlign:'center', padding:'5px 16px', fontSize:'11px', color:'#aaa', borderBottom:'1px solid #f5f5f5', background:'#ffffff', flexShrink:0 }}>
          Assistente com IA — respostas podem conter erros
        </div>

        {/* Mensagens */}
        <div ref={scrollRef} className="ia-scroll" style={{ flex:1, overflowY:'auto', padding:'12px 14px', background:'#ffffff' }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ marginBottom:'12px' }}>
              {msg.role === 'ia' ? (
                <IaMessage
                  msg={msg}
                  isTyping={typingSet.has(msg.id)}
                  onDone={() => setTypingSet(p => { const n = new Set(p); n.delete(msg.id); return n; })}
                />
              ) : (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                  {msg.imagePreview && <img src={msg.imagePreview} alt="" style={{ maxWidth:'160px', maxHeight:'120px', borderRadius:'10px', marginBottom:'4px', objectFit:'cover' }}/>}
                  {msg.content && <div style={{ background:'#f0f0f0', color:'#333', borderRadius:'16px 16px 4px 16px', padding:'8px 12px', fontSize:'13px', lineHeight:'1.45', maxWidth:'85%', wordBreak:'break-word', whiteSpace:'pre-wrap' }}>{msg.content}</div>}
                  {msg.time && <span style={{ fontSize:'11px', color:'#bbb', marginTop:'2px' }}>{msg.time}</span>}
                </div>
              )}
            </div>
          ))}
          {isChatLoading && pendingMessage && (
            <div style={{ marginBottom:'10px' }}>
              <SpinnerThinking message={pendingMessage} startTime={spinnerStart}/>
            </div>
          )}
        </div>

        {/* Preview imagem */}
        {pendingImage && (
          <div style={{ padding:'6px 12px', background:'#f8fafc', borderTop:'1px solid #eee', display:'flex', alignItems:'center', gap:'8px' }}>
            <img src={pendingImage.preview} alt="preview" style={{ width:'40px', height:'40px', objectFit:'cover', borderRadius:'6px' }}/>
            <span style={{ fontSize:'12px', color:'#64748b', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pendingImage.name}</span>
            <button onClick={() => setPendingImage(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={14}/></button>
          </div>
        )}

        {/* Input */}
        <div style={{ borderTop:'1px solid #eeeeee', background:'#ffffff', padding:'9px 12px', display:'flex', alignItems:'flex-end', gap:'8px', flexShrink:0 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={isChatLoading} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:pendingImage?BRAND:'#aaa', display:'flex', flexShrink:0 }}><Paperclip size={16}/></button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageSelect}/>
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={isChatLoading}
            rows={1}
            placeholder={pendingImage?'Pergunta sobre a imagem... 🖼️':'Pergunte ao assistente...'}
            style={{ flex:1, border:'none', outline:'none', fontSize:'13px', color:'#333', background:'transparent', lineHeight:'1.45', minHeight:'22px', maxHeight:'100px', fontFamily:'inherit', padding:0, opacity:isChatLoading?0.5:1, resize:'none', overflowY:'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={isChatLoading||(!chatInput.trim()&&!pendingImage)}
            style={{ width:'32px', height:'32px', borderRadius:'50%', border:'none', background:(chatInput.trim()||pendingImage)&&!isChatLoading?BRAND:'#e8e8e8', cursor:(chatInput.trim()||pendingImage)&&!isChatLoading?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.15s' }}>
            <Send size={15} style={{ color:(chatInput.trim()||pendingImage)&&!isChatLoading?'#fff':'#bbb', marginLeft:'1px' }}/>
          </button>
        </div>
      </div>

      {/* Botão flutuante */}
      <div style={{ position:'fixed', zIndex:9998, bottom:'1.5rem', right:'1.5rem', transform:isChatOpen?'scale(0)':'scale(1)', opacity:isChatOpen?0:1, pointerEvents:isChatOpen?'none':'auto', transition:'transform 0.2s, opacity 0.15s' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview}/>
      </div>
    </>
  );
}