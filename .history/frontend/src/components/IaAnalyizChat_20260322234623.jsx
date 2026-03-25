// IaAnalyizChat.jsx — v4: anexos completos (imagem, Excel, PDF, TXT, áudio) com persistência

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Paperclip, X, Plus, ExternalLink,
  Globe, FileText, FileSpreadsheet, Music, File, Image,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';
const BRAND        = '#1e293b';
const SESSION_KEY  = 'analyiz_last_session_id';
const POLL_INITIAL = 8 * 1000;
const POLL_INTERVAL= 10 * 60 * 1000;

import gifolhos from '../assets/gifolhos1.gif';
const IA_GIF = gifolhos;

// ─── Tipos de arquivo suportados ──────────────────────────────────────────────
const FILE_TYPES = {
  'image/jpeg':      { group: 'image', icon: Image,           label: 'Imagem' },
  'image/png':       { group: 'image', icon: Image,           label: 'Imagem' },
  'image/gif':       { group: 'image', icon: Image,           label: 'Imagem' },
  'image/webp':      { group: 'image', icon: Image,           label: 'Imagem' },
  'application/pdf': { group: 'pdf',   icon: FileText,        label: 'PDF'    },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { group:'excel', icon:FileSpreadsheet, label:'Excel' },
  'application/vnd.ms-excel': { group:'excel', icon:FileSpreadsheet, label:'Excel' },
  'text/csv':        { group: 'excel', icon: FileSpreadsheet, label: 'CSV'    },
  'text/plain':      { group: 'txt',   icon: FileText,        label: 'Texto'  },
  'audio/mpeg':      { group: 'audio', icon: Music,           label: 'Áudio MP3' },
  'audio/wav':       { group: 'audio', icon: Music,           label: 'Áudio WAV' },
  'audio/ogg':       { group: 'audio', icon: Music,           label: 'Áudio OGG' },
  'audio/mp4':       { group: 'audio', icon: Music,           label: 'Áudio M4A' },
  'audio/webm':      { group: 'audio', icon: Music,           label: 'Áudio'     },
};

const ACCEPTED_MIME = Object.keys(FILE_TYPES).join(',');
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function getFileInfo(mimeType) {
  return FILE_TYPES[mimeType] || { group: 'unknown', icon: File, label: 'Arquivo' };
}

const GROUP_COLORS = {
  image:'#3b82f6', pdf:'#ef4444', excel:'#10b981', txt:'#8b5cf6', audio:'#f59e0b', unknown:'#94a3b8',
};

// ─── Ícone estrela IA ─────────────────────────────────────────────────────────
function StarSparkleIcon({ size = 13, color = '#6366f1', animated = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      style={animated ? { animation:'ia-star-pulse 2s ease-in-out infinite' } : {}}>
      <path d="M8 2.5L9.2 6.8H13.5L10 9.2L11.2 13.5L8 11.2L4.8 13.5L6 9.2L2.5 6.8H6.8L8 2.5Z" fill={color}/>
    </svg>
  );
}

// ─── ReasoningPanel ───────────────────────────────────────────────────────────
function ReasoningPanel({ reasoning, isStreaming }) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (expanded && isStreaming && textRef.current)
      textRef.current.scrollTop = textRef.current.scrollHeight;
  }, [reasoning, expanded, isStreaming]);

  useEffect(() => {
    if (isStreaming && reasoning.length > 0) setExpanded(true);
  }, [isStreaming]); // eslint-disable-line

  const hasContent = reasoning && reasoning.length > 0;

  return (
    <div style={{ marginBottom:'6px' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:'5px', background:'none', border:'none',
          cursor:'pointer', padding:'2px 0', color:'#94a3b8', fontSize:'11px', fontFamily:'inherit', userSelect:'none' }}
        onMouseEnter={e => e.currentTarget.style.color = '#64748b'}
        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
      >
        <StarSparkleIcon size={12} color={isStreaming ? '#6366f1' : '#94a3b8'} animated={isStreaming}/>
        <span style={{ fontWeight:500, color: isStreaming ? '#6366f1' : 'inherit' }}>
          {isStreaming && !hasContent ? 'Raciocínio em andamento...' : 'Mostrar raciocínio'}
        </span>
        {hasContent && (expanded ? <ChevronUp size={10} style={{opacity:.6}}/> : <ChevronDown size={10} style={{opacity:.6}}/>)}
        {isStreaming && (
          <span style={{ display:'inline-block', width:'4px', height:'4px', borderRadius:'50%',
            background:'#6366f1', marginLeft:'2px', animation:'ia-dot-pulse 1s ease-in-out infinite' }}/>
        )}
      </button>
      {expanded && (
        <div ref={textRef}
          style={{ marginTop:'6px', padding:'10px 12px', background:'#f8fafc', borderRadius:'8px',
            borderLeft:'2px solid #e2e8f0', maxHeight:'200px', overflowY:'auto', scrollbarWidth:'thin' }}>
          {hasContent ? (
            <p style={{ margin:0, fontSize:'11px', lineHeight:'1.65', color:'#475569',
              fontFamily:'ui-monospace,"Cascadia Code","Source Code Pro",monospace',
              whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {reasoning}
              {isStreaming && (
                <span style={{ display:'inline-block', width:'1px', height:'12px', background:'#6366f1',
                  marginLeft:'2px', verticalAlign:'middle', animation:'ia-blink 0.8s step-end infinite' }}/>
              )}
            </p>
          ) : (
            <p style={{ margin:0, fontSize:'11px', color:'#94a3b8', fontStyle:'italic' }}>Aguardando raciocínio...</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LiveToolPanel ────────────────────────────────────────────────────────────
function LiveToolPanel({ steps, isActive }) {
  if (!isActive && steps.length === 0) return null;
  return (
    <div style={{ marginTop:'6px', padding:'8px 10px', background:'#f8fafc',
      borderRadius:'8px', borderLeft:'2px solid #e2e8f0' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'6px', marginBottom: i < steps.length-1 ? '4px' : 0 }}>
          <span style={{ fontSize:'9px', color:'#10b981', flexShrink:0, marginTop:'2px', fontWeight:700 }}>✓</span>
          <span style={{ fontSize:'11px', color:'#64748b', lineHeight:'1.45' }}>{s}</span>
        </div>
      ))}
      {isActive && (
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop: steps.length > 0 ? '4px' : 0 }}>
          <span style={{ display:'inline-block', width:'12px', height:'12px', borderRadius:'50%',
            border:'1.5px solid #e2e8f0', borderTop:'1.5px solid #6366f1',
            animation:'ia-spin 0.7s linear infinite', flexShrink:0 }}/>
          <span style={{ fontSize:'11px', color:'#94a3b8', fontStyle:'italic' }}>Processando...</span>
        </div>
      )}
    </div>
  );
}

// ─── DiffusionText ────────────────────────────────────────────────────────────
function DiffusionText({ html, speed = 6, onDoneRef }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const tokensRef = useRef([]);
  const timerRef  = useRef(null);

  useEffect(() => {
    const tokens = [];
    let i = 0, src = html || '';
    while (i < src.length) {
      if (src[i] === '<') {
        const end = src.indexOf('>', i);
        if (end === -1) { tokens.push(src[i]); i++; }
        else { tokens.push(src.substring(i, end+1)); i = end+1; }
      } else if (src[i] === '&') {
        const end = src.indexOf(';', i);
        if (end === -1) { tokens.push(src[i]); i++; }
        else { tokens.push(src.substring(i, end+1)); i = end+1; }
      } else { tokens.push(src[i]); i++; }
    }
    tokensRef.current = tokens;
    setVisibleCount(0);
    if (!tokens.length) { setTimeout(() => onDoneRef?.current?.(), 0); return; }
    timerRef.current = setInterval(() => {
      setVisibleCount(prev => {
        const next = Math.min(prev + 4, tokens.length);
        if (next >= tokens.length) { clearInterval(timerRef.current); setTimeout(() => onDoneRef?.current?.(), 0); }
        return next;
      });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [html]); // eslint-disable-line

  const visible = tokensRef.current.slice(0, visibleCount).join('');
  const hidden  = tokensRef.current.slice(visibleCount).join('');
  const cursor  = visibleCount < tokensRef.current.length
    ? '<span style="opacity:0.5;animation:ia-blink 0.8s step-end infinite">▍</span>' : '';
  return <SafeHTMLMessage html={visible
    + (hidden ? `<span style="opacity:0;user-select:none;pointer-events:none;font-size:0">${hidden}</span>` : '')
    + cursor}/>;
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

function extractLinks(html) {
  const links = [], re = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1], label = m[2].trim() || m[1];
    if (href && href !== '#') links.push({ href, label });
  }
  return [...new Map(links.map(l => [l.href, l])).values()];
}

function LinkCard({ links }) {
  const [open, setOpen] = useState(false);
  if (!links || !links.length) return null;
  return (
    <div style={{ marginTop:'10px', borderTop:'1px solid #f0f0f0', paddingTop:'8px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:'6px', background:'#f8fafc', border:'1px solid #e2e8f0',
          cursor:'pointer', padding:'4px 8px', borderRadius:'8px', fontSize:'11px', color:'#64748b', fontWeight:600 }}>
        <Globe size={12}/> {links.length} link{links.length>1?'s':''} {open?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
      </button>
      {open && (
        <div style={{ marginTop:'6px', display:'flex', flexDirection:'column', gap:'4px' }}>
          {links.map((l, i) => (
            <a key={i} href={l.href} target={l.href.startsWith('/')?'_self':'_blank'} rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', color:BRAND, textDecoration:'none',
                background:'#f8fafc', borderRadius:'8px', padding:'6px 10px', border:'1px solid #e2e8f0' }}>
              <ExternalLink size={11}/>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || !sources.length) return null;
  return (
    <div style={{ marginTop:'8px', borderTop:'1px solid #f0f0f0', paddingTop:'6px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:'4px', background:'none', border:'none',
          cursor:'pointer', fontSize:'11px', color:'#94a3b8', padding:0 }}>
        {open?<ChevronUp size={12}/>:<ChevronDown size={12}/>} {sources.length} fonte{sources.length>1?'s':''}
      </button>
      {open && (
        <div style={{ marginTop:'6px', display:'flex', flexDirection:'column', gap:'4px' }}>
          {sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:BRAND,
                textDecoration:'none', background:'#f8fafc', borderRadius:'6px', padding:'5px 8px', border:'1px solid #e2e8f0' }}>
              🔗 <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FileAttachmentBubble — renderiza anexo salvo na mensagem ─────────────────
function FileAttachmentBubble({ attachment }) {
  const info  = getFileInfo(attachment.mimeType);
  const color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown;
  const Icon  = info.icon;

  if (info.group === 'image' && attachment.preview) {
    return (
      <div style={{ marginBottom:'6px', alignSelf:'flex-end' }}>
        <img src={attachment.preview} alt={attachment.name}
          style={{ maxWidth:'200px', maxHeight:'160px', borderRadius:'10px', objectFit:'cover', display:'block' }}/>
        <span style={{ fontSize:'10px', color:'#94a3b8', marginTop:'3px', display:'block', textAlign:'right' }}>{attachment.name}</span>
      </div>
    );
  }

  if (info.group === 'audio' && attachment.preview) {
    return (
      <div style={{ marginBottom:'6px', background:'#f8fafc', border:'1px solid #e2e8f0',
        borderRadius:'10px', padding:'8px 10px', maxWidth:'260px', alignSelf:'flex-end' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
          <Music size={14} style={{ color, flexShrink:0 }}/>
          <span style={{ fontSize:'11px', color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
            {attachment.name}
          </span>
        </div>
        <audio controls style={{ width:'100%', height:'28px' }} src={attachment.preview}/>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'#f8fafc',
      border:'1px solid #e2e8f0', borderRadius:'10px', padding:'8px 10px', marginBottom:'6px',
      maxWidth:'260px', alignSelf:'flex-end' }}>
      <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:`${color}18`,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={16} style={{ color }}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:'11px', fontWeight:600, color:'#1e293b',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{attachment.name}</p>
        <p style={{ margin:0, fontSize:'10px', color:'#94a3b8', marginTop:'1px' }}>
          {info.label}{attachment.sizeBytes ? ` · ${(attachment.sizeBytes/1024).toFixed(0)} KB` : ''}
        </p>
      </div>
    </div>
  );
}

// ─── Mensagem da IA ───────────────────────────────────────────────────────────
function IaMessage({ msg, isTyping, onDone }) {
  const enriched  = enrichHTML(msg.content);
  const links     = extractLinks(enriched);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  return (
    <div className="ia-msg" style={{ fontSize:'13px', color:'#333', lineHeight:'1.6' }}>
      {msg.reasoning !== undefined && <ReasoningPanel reasoning={msg.reasoning || ''} isStreaming={false}/>}
      {isTyping
        ? <DiffusionText html={enriched} speed={6} onDoneRef={onDoneRef}/>
        : <SafeHTMLMessage html={enriched}/>}
      {!isTyping && links.length > 0 && <LinkCard links={links}/>}
      {msg.sources && msg.sources.length > 0 && <SourcesPanel sources={msg.sources}/>}
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
    if (!await onConfirmDelete()) return;
    await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`, { method:'DELETE' });
    if (id === currentSessionId) onNewSession();
    load();
  };

  return (
    <div style={{ position:'absolute', top:'52px', right:0, left:0, background:'#fff', zIndex:10,
      borderBottom:'1px solid #eee', maxHeight:'260px', overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.06)' }}>
      <button onClick={() => { onNewSession(); onClose(); }}
        style={{ width:'100%', padding:'10px 14px', display:'flex', alignItems:'center', gap:'8px',
          background:'none', border:'none', borderBottom:'1px solid #f5f5f5', cursor:'pointer',
          fontSize:'13px', color:BRAND, fontWeight:600 }}>
        <Plus size={14}/> Nova conversa
      </button>
      {loading && <p style={{ padding:'12px', fontSize:'12px', color:'#94a3b8' }}>Carregando...</p>}
      {sessions.map(s => (
        <div key={s.id} onClick={() => { onSelectSession(s.id); onClose(); }}
          style={{ padding:'9px 14px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer',
            fontSize:'13px', color:'#444', background:s.id===currentSessionId?'#f0f4ff':'transparent',
            borderBottom:'1px solid #f8f8f8' }}>
          <MessageSquare size={13} style={{ color:'#94a3b8', flexShrink:0 }}/>
          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.titulo}</span>
          <button onClick={e => del(e, s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', padding:'2px' }}>
            <Trash2 size={12}/>
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── FloatingButton ───────────────────────────────────────────────────────────
function FloatingButton({ onClick, hasUnread, shortPreview }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position:'relative', display:'inline-flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
      {hasUnread && shortPreview && (
        <div onClick={onClick}
          style={{ background:BRAND, color:'white', fontSize:'12px', fontWeight:500, padding:'8px 12px',
            borderRadius:'12px 12px 12px 4px', maxWidth:'240px', lineHeight:'1.4',
            boxShadow:'0 2px 12px rgba(30,41,59,0.3)', animation:'ia-fade-in 0.3s ease',
            cursor:'pointer', wordBreak:'break-word' }}>
          {shortPreview}
        </div>
      )}
      <button onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display:'flex', alignItems:'center', borderRadius:'999px', border:'none', outline:'none',
          background:BRAND, cursor:'pointer', boxShadow:'0 4px 20px rgba(30,41,59,0.45)',
          width:hovered?'172px':'62px', height:'62px',
          transition:'width 0.28s cubic-bezier(0.34,1.2,0.64,1)', padding:0, overflow:'hidden' }}>
        <span style={{ width:'62px', height:'62px', flexShrink:0, display:'flex', alignItems:'center',
          justifyContent:'center', borderRadius:'50%', overflow:'hidden', background:'#fff', order:1, zIndex:2 }}>
          <img src={IA_GIF} alt="IA"
            style={{ width:'58px', height:'58px', objectFit:'contain', borderRadius:'50%' }}
            onError={e => { e.target.style.display='none'; }}/>
        </span>
        <span style={{ color:'white', fontSize:'13px', fontWeight:700, whiteSpace:'nowrap', paddingRight:'20px',
          paddingLeft:'4px', order:2, opacity:hovered?1:0, transition:'opacity 0.18s', pointerEvents:'none' }}>
          Assistente
        </span>
      </button>
    </div>
  );
}

function ChatHeaderAvatar() {
  return (
    <div style={{ width:'38px', height:'38px', borderRadius:'10px', background:'#fff',
      display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
      <img src={IA_GIF} alt="IA" style={{ width:'34px', height:'34px', objectFit:'contain' }}
        onError={e => { e.target.style.display='none'; }}/>
    </div>
  );
}

function getTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

// ─── PendingFilePreview ────────────────────────────────────────────────────────
function PendingFilePreview({ file, onRemove }) {
  const info  = getFileInfo(file.mimeType);
  const color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown;
  const Icon  = info.icon;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 12px',
      background:'#fafafa', borderTop:'1px solid #f0f0f0' }}>

      {info.group === 'image' && file.preview ? (
        <img src={file.preview} alt={file.name}
          style={{ width:'36px', height:'36px', objectFit:'cover', borderRadius:'6px', flexShrink:0 }}/>
      ) : info.group === 'audio' && file.preview ? (
        <div style={{ display:'flex', alignItems:'center', gap:'6px', flex:1 }}>
          <Music size={18} style={{ color, flexShrink:0 }}/>
          <audio controls style={{ height:'24px', maxWidth:'140px' }} src={file.preview}/>
        </div>
      ) : (
        <div style={{ width:'36px', height:'36px', borderRadius:'8px', background:`${color}18`,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={16} style={{ color }}/>
        </div>
      )}

      {info.group !== 'audio' && (
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:'11px', fontWeight:600, color:'#1e293b',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</p>
          <p style={{ margin:0, fontSize:'10px', color:'#94a3b8' }}>
            {info.label}{file.sizeBytes ? ` · ${(file.sizeBytes/1024).toFixed(0)} KB` : ''}
          </p>
        </div>
      )}

      <button onClick={onRemove}
        style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:'2px', flexShrink:0 }}>
        <X size={14}/>
      </button>
    </div>
  );
}

// ─── LiveReasoningArea ────────────────────────────────────────────────────────
function LiveReasoningArea({ reasoning, isReasoningStreaming, toolSteps, isToolsActive }) {
  return (
    <div style={{ marginBottom:'8px' }}>
      <ReasoningPanel reasoning={reasoning} isStreaming={isReasoningStreaming}/>
      {(toolSteps.length > 0 || isToolsActive) && (
        <LiveToolPanel steps={toolSteps} isActive={isToolsActive && !isReasoningStreaming}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function IaAnalyizChat({ isChatOpen, toggleChat, userRole }) {
  const [chatInput, setChatInput]       = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isExpanded, setIsExpanded]     = useState(false);
  const [hasUnread, setHasUnread]       = useState(false);
  const [shortPreview, setShortPreview] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [typingSet, setTypingSet]       = useState(new Set());
  const [messages, setMessages]         = useState([]);
  const [isDragging, setIsDragging]     = useState(false);

  const [liveReasoning, setLiveReasoning]               = useState('');
  const [isReasoningStreaming, setIsReasoningStreaming] = useState(false);
  const [toolSteps, setToolSteps]                       = useState([]);
  const [isToolsActive, setIsToolsActive]               = useState(false);

  const pendingNotifRef = useRef(null);

  let modalConfirm = null;
  try {
    const mod = require('../components/Modal');
    if (mod?.useModal) { const { confirm } = mod.useModal(); modalConfirm = confirm; }
  } catch {}

  const confirmDelete = useCallback(async () => {
    if (modalConfirm) return await modalConfirm({ title:'Excluir conversa', message:'Será removida permanentemente.', confirmLabel:'Excluir', danger:true });
    return window.confirm('Deletar esta conversa?');
  }, [modalConfirm]);

  const readUserId = () => {
    try { const u = JSON.parse(localStorage.getItem('analyiz_user')); return u?.id||null; } catch { return null; }
  };
  const [userId] = useState(readUserId);

  const [currentSessionId, setCurrentSessionId] = useState(() => {
    try {
      const saved     = localStorage.getItem(SESSION_KEY);
      const savedUser = localStorage.getItem('analyiz_session_owner');
      if (saved && savedUser === String(readUserId())) return parseInt(saved);
      return null;
    } catch { return null; }
  });

  const sessionIdRef  = useRef(currentSessionId);
  const isChatOpenRef = useRef(isChatOpen);
  const scrollRef     = useRef(null);
  const textareaRef   = useRef(null);
  const fileInputRef  = useRef(null);
  const pollTimerRef  = useRef(null);
  const dropRef       = useRef(null);

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

  useEffect(() => {
    if (!isChatOpen) return;
    setHasUnread(false); setShortPreview('');
    const payload = pendingNotifRef.current;
    if (!payload) return;
    const { notifId, fullInsight } = payload;
    pendingNotifRef.current = null;
    if (notifId && userId) {
      fetch(`${API_BASE_URL}/api/ia/proactive/seen`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, notifId }),
      }).catch(() => {});
    }
    setTimeout(() => {
      const iaId = `ia-proactive-${Date.now()}`;
      setMessages(prev => [...prev, { role:'ia', content:fullInsight, time:getTime(), id:iaId, sources:[], reasoning:undefined }]);
      setTypingSet(prev => new Set(prev).add(iaId));
    }, 400);
  }, [isChatOpen]); // eslint-disable-line

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isChatLoading, liveReasoning, toolSteps, typingSet]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  }, [chatInput]);

  // Mapeia mensagem do banco — reconstrói anexos do campo imageDesc + imageBase64
  const mapMessage = useCallback((m) => {
    let attachments = null;

    // imageDesc guarda JSON de anexos (metadados + previews de áudio pequenos)
    if (m.imageDesc) {
      try {
        const parsed = JSON.parse(m.imageDesc);
        if (Array.isArray(parsed)) {
          attachments = parsed.map(att => {
            // Reconstrói preview de imagem a partir do imageBase64 (campo legado)
            if (att.group === 'image' && !att.preview && m.imageBase64) {
              return { ...att, preview: `data:${att.mimeType || 'image/jpeg'};base64,${m.imageBase64}` };
            }
            return att;
          });
        }
      } catch {
        // imageDesc é texto descritivo normal (não JSON de anexos)
      }
    }

    // Compatibilidade: mensagem com apenas imageBase64 (formato antigo, sem imageDesc JSON)
    const legacyImage = m.imageBase64 && !attachments ? [{
      mimeType: 'image/jpeg', name: 'imagem.jpg', group: 'image',
      preview: `data:image/jpeg;base64,${m.imageBase64}`, sizeBytes: 0,
    }] : null;

    return {
      role: m.role, id: String(m.id), sources: [], reasoning: undefined,
      content: m.content || '',
      attachments: attachments || legacyImage,
      time: (() => {
        try { const d = new Date(m.createdAt); return isNaN(d.getTime()) ? getTime() : d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
        catch { return getTime(); }
      })(),
    };
  }, []);

  useEffect(() => {
    if (!currentSessionId) {
      setMessages([{ role:'ia', content:'Olá! 😊 Seja bem-vindo à IA Analyiz! Estou aqui para ajudar com anúncios, divergências, pesquisas e muito mais. Você pode enviar mensagens, imagens, PDFs, planilhas, textos ou áudios! Como posso te ajudar?', time:getTime(), id:'init', sources:[], reasoning:undefined }]);
      return;
    }
    fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`)
      .then(r => r.json())
      .then(msgs => setMessages(msgs.length > 0 ? msgs.map(mapMessage) : [{ role:'ia', content:'Olá! 😊 Bem-vindo de volta!', time:getTime(), id:'init', sources:[], reasoning:undefined }]))
      .catch(() => setMessages([{ role:'ia', content:'Olá! 😊 Como posso te ajudar?', time:getTime(), id:'init', sources:[], reasoning:undefined }]));
  }, []); // eslint-disable-line

  const loadSession = useCallback((sessionId) => {
    setCurrentSessionId(sessionId); sessionIdRef.current = sessionId;
    setTypingSet(new Set());
    if (!sessionId) {
      setMessages([{ role:'ia', content:'😊 Nova conversa! Como posso ajudar?', time:getTime(), id:`init-${Date.now()}`, sources:[], reasoning:undefined }]);
      return;
    }
    fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages`)
      .then(r => r.json())
      .then(msgs => setMessages(msgs.length > 0 ? msgs.map(mapMessage) : [{ role:'ia', content:'😊 Como posso te ajudar?', time:getTime(), id:`init-${Date.now()}`, sources:[], reasoning:undefined }]))
      .catch(() => {});
  }, [mapMessage]);

  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!userId) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/sessions`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId }),
      });
      const s = await res.json();
      setCurrentSessionId(s.id); sessionIdRef.current = s.id;
      return s.id;
    } catch { return null; }
  }, [userId]);

  // ── Sistema proativo ──────────────────────────────────────────────────────
  const verificarProativo = useCallback(async () => {
    if (!userId || isChatOpenRef.current) return;
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ia/proactive`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, userRole }),
      });
      const data = await res.json();
      if (!data.insight || !data.hasRelevantData) return;
      pendingNotifRef.current = { notifId:data.notifId, fullInsight:data.fullInsight };
      setShortPreview(data.insight); setHasUnread(true);
      if (data.notifId) {
        fetch(`${API_BASE_URL}/api/ia/proactive/exibida`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, notifId:data.notifId }),
        }).catch(() => {});
      }
    } catch {}
  }, [userId, userRole]);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(verificarProativo, POLL_INITIAL);
    pollTimerRef.current = setInterval(verificarProativo, POLL_INTERVAL);
    return () => { clearTimeout(first); clearInterval(pollTimerRef.current); };
  }, [verificarProativo]);

  // ── Processar arquivo → base64 + preview ──────────────────────────────────
  const processFile = useCallback((file) => new Promise((resolve, reject) => {
    const info = getFileInfo(file.type);
    if (!FILE_TYPES[file.type] && !file.type.startsWith('image/') && !file.type.startsWith('audio/')) {
      reject(new Error(`Tipo não suportado: ${file.name} (${file.type})`)); return;
    }
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`Arquivo muito grande (máx 25MB): ${file.name}`)); return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      resolve({
        base64:    dataUrl.split(',')[1],
        mimeType:  file.type || 'application/octet-stream',
        name:      file.name,
        sizeBytes: file.size,
        group:     info.group,
        preview:   ['image','audio'].includes(info.group) ? dataUrl : null,
      });
    };
    reader.onerror = () => reject(new Error(`Erro ao ler: ${file.name}`));
    reader.readAsDataURL(file);
  }), []);

  const addFiles = useCallback(async (fileList) => {
    const errs = [];
    const added = [];
    for (const file of fileList) {
      try { added.push(await processFile(file)); }
      catch (e) { errs.push(e.message); }
    }
    if (added.length) setPendingFiles(prev => [...prev, ...added]);
    if (errs.length) console.warn('[Files]', errs.join('; '));
  }, [processFile]);

  // ── Handlers de input ─────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e) => {
    if (e.target.files?.length) await addFiles(e.target.files);
    e.target.value = '';
  }, [addFiles]);

  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); }
    }
    if (files.length) { e.preventDefault(); await addFiles(files); }
  }, [addFiles]);

  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); if (!dropRef.current?.contains(e.relatedTarget)) setIsDragging(false); }, []);
  const handleDrop      = useCallback(async (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // ── Envio ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const hasText  = chatInput.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if ((!hasText && !hasFiles) || isChatLoading) return;

    const userMessage  = chatInput.trim();
    const filesToSend  = [...pendingFiles];
    const msgId        = `user-${Date.now()}`;

    // Snapshot dos anexos para exibição imediata (em memória, com preview)
    const attachmentSnapshot = filesToSend.map(f => ({
      mimeType:  f.mimeType,
      name:      f.name,
      group:     f.group,
      preview:   f.preview,    // dataURL para imagem/áudio
      sizeBytes: f.sizeBytes,
    }));

    setMessages(prev => [...prev, {
      role: 'user', content: userMessage, time: getTime(), id: msgId, sources: [],
      attachments: attachmentSnapshot.length ? attachmentSnapshot : null,
    }]);

    setChatInput(''); setPendingFiles([]);
    setIsChatLoading(true);
    setLiveReasoning(''); setIsReasoningStreaming(false);
    setToolSteps([]); setIsToolsActive(false);

    const stepsAccum       = [];
    let   capturedReasoning = '';

    try {
      const sid = await ensureSession();

      // Separar tipos para o backend
      const images    = filesToSend.filter(f => f.group === 'image');
      const nonImages = filesToSend.filter(f => f.group !== 'image');
      const firstImg  = images[0];

      const body = JSON.stringify({
        message:     userMessage || '',
        pageUrl:     window.location.pathname,
        sessionId:   sid,
        userRole,
        userId,
        imageOnly:   !hasText && filesToSend.length === 1 && !!firstImg,
        // Campo legado para primeira imagem
        ...(firstImg ? { imageBase64: firstImg.base64, imageMimeType: firstImg.mimeType, imageName: firstImg.name } : {}),
        // Imagens extras
        extraImages: images.slice(1).map(f => ({ base64:f.base64, mimeType:f.mimeType, name:f.name })),
        // Todos os outros tipos (PDF, Excel, TXT, áudio)
        files: nonImages.map(f => ({ base64:f.base64, mimeType:f.mimeType, name:f.name, group:f.group, sizeBytes:f.sizeBytes })),
        // attachmentMeta para salvar no banco:
        // - Imagem principal: sem preview (reconstruído via imageBase64)
        // - Áudio + imagens extras: inclui preview (dataURL) para sobreviver ao F5
        // - PDF/Excel/TXT: apenas metadados (nome, tipo, tamanho)
        attachmentMeta: attachmentSnapshot.map(a => {
          const isMainImg = a.group === 'image' && firstImg && a.name === firstImg.name;
          const needsPreview = (a.group === 'audio' || (a.group === 'image' && !isMainImg));
          return {
            mimeType:  a.mimeType,
            name:      a.name,
            group:     a.group,
            sizeBytes: a.sizeBytes,
            ...(needsPreview && a.preview ? { preview: a.preview } : {}),
          };
        }),
      });

      const res = await fetch(`${API_BASE_URL}/api/ia/chat/stream`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '', done = false;

      while (!done) {
        const { value, done:streamDone } = await reader.read();
        done = streamDone;
        if (value) buffer += decoder.decode(value, { stream:true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'reasoning_start') {
                setIsReasoningStreaming(true); setLiveReasoning('');
              } else if (currentEvent === 'reasoning_chunk') {
                capturedReasoning += data.text || '';
                setLiveReasoning(capturedReasoning);
              } else if (currentEvent === 'reasoning_end') {
                capturedReasoning = data.fullText || capturedReasoning;
                setLiveReasoning(capturedReasoning);
                setIsReasoningStreaming(false); setIsToolsActive(true);
              } else if (currentEvent === 'step') {
                stepsAccum.push(data.msg); setToolSteps([...stepsAccum]); setIsToolsActive(true);
              } else if (currentEvent === 'done') {
                if (data.sessionId && !sessionIdRef.current) {
                  setCurrentSessionId(data.sessionId); sessionIdRef.current = data.sessionId;
                }
                const iaId = `ia-${Date.now()}`;
                setMessages(prev => [...prev, {
                  role:'ia', content:data.reply, time:getTime(), id:iaId,
                  sources: data.sources || [],
                  reasoning: capturedReasoning || data.reasoning || '',
                }]);
                setTypingSet(prev => new Set(prev).add(iaId));
              } else if (currentEvent === 'error') {
                throw new Error(data.message || 'Erro no stream');
              }
            } catch (parseErr) {
              if (!['step','reasoning_chunk','reasoning_start','reasoning_end'].includes(currentEvent)) throw parseErr;
            }
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      console.warn('[Chat stream]', err.message);
      setMessages(prev => [...prev, {
        role:'ia', content:'⚠️ Erro de conexão. Tente novamente!', time:getTime(),
        id:`err-${Date.now()}`, sources:[], reasoning:undefined,
      }]);
    } finally {
      setIsChatLoading(false);
      setLiveReasoning(''); setIsReasoningStreaming(false);
      setToolSteps([]); setIsToolsActive(false);
    }
  }, [chatInput, pendingFiles, isChatLoading, userRole, userId, ensureSession]);

  const handleKeyDown = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleNewSession = () => {
    setCurrentSessionId(null); sessionIdRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setMessages([{ role:'ia', content:'😊 Nova conversa! Como posso te ajudar?', time:getTime(), id:`init-${Date.now()}`, sources:[], reasoning:undefined }]);
    setTypingSet(new Set());
  };

  const canSend = (chatInput.trim() || pendingFiles.length > 0) && !isChatLoading;
  const W = isExpanded ? 'min(580px, 94vw)' : '380px';
  const H = isExpanded ? 'min(700px, 87vh)' : 'min(560px, calc(100vh - 5rem))';

  return (
    <>
      <style>{`
        @keyframes ia-spin       { to { transform:rotate(360deg); } }
        @keyframes ia-blink      { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes ia-fade-in    { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ia-dot-pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.6)} }
        @keyframes ia-star-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes ia-drag-in    { 0%,100%{border-color:#6366f1} 50%{border-color:#818cf8} }
        .ia-scroll::-webkit-scrollbar       { width:4px; }
        .ia-scroll::-webkit-scrollbar-track { background:transparent; }
        .ia-scroll::-webkit-scrollbar-thumb { background:#e2e8f0;border-radius:4px; }
        .ia-msg a { color:#1e40af !important;text-decoration:underline;font-weight:600;cursor:pointer; }
        .ia-msg b { font-weight:700; }
      `}</style>

      {/* ── Janela principal ────────────────────────────────────────────────── */}
      <div ref={dropRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position:'fixed', zIndex:9999, bottom:'1.5rem', right:'1.5rem',
          width:W, height:H, maxHeight:'calc(100vh - 3rem)',
          background:'#fff', borderRadius:'20px',
          boxShadow: isDragging ? '0 4px 32px rgba(99,102,241,0.25), 0 0 0 2px #6366f1' : '0 4px 32px rgba(0,0,0,0.15)',
          display:'flex', flexDirection:'column', overflow:'hidden',
          transformOrigin:'bottom right',
          transform:    isChatOpen?'scale(1)':'scale(0)',
          opacity:      isChatOpen?1:0,
          pointerEvents:isChatOpen?'auto':'none',
          transition:'transform 0.25s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s,box-shadow 0.2s',
          border: isDragging ? '2px dashed #6366f1' : '2px solid transparent',
        }}
      >
        {/* Overlay drag */}
        {isDragging && (
          <div style={{ position:'absolute', inset:0, background:'rgba(99,102,241,0.05)', zIndex:20,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            borderRadius:'18px', pointerEvents:'none' }}>
            <div style={{ fontSize:'36px', marginBottom:'8px' }}>📎</div>
            <p style={{ fontSize:'14px', fontWeight:700, color:'#6366f1', margin:0 }}>Solte para anexar</p>
            <p style={{ fontSize:'11px', color:'#94a3b8', marginTop:'4px' }}>Imagem · PDF · Excel · TXT · Áudio</p>
          </div>
        )}

        {/* Header */}
        <div style={{ position:'relative', padding:'12px 14px', borderBottom:'1px solid #eee',
          display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <ChatHeaderAvatar/>
            <div>
              <span style={{ fontWeight:700, fontSize:'14px', color:'#1e293b', display:'block', lineHeight:'1.2' }}>Assistente</span>
              <span style={{ fontSize:'10px', color:'#94a3b8', fontWeight:500 }}>IA Analyiz • Online ✨</span>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
            <button onClick={() => setShowSessions(v => !v)}
              style={{ background:showSessions?'#f0f4ff':'none', border:'none', cursor:'pointer', padding:'5px', color:showSessions?BRAND:'#aaa', display:'flex', borderRadius:'6px' }}>
              <MessageSquare size={14}/>
            </button>
            <button onClick={() => setIsExpanded(v => !v)}
              style={{ background:'none', border:'none', cursor:'pointer', padding:'5px', color:'#aaa', display:'flex' }}>
              {isExpanded?<Minimize2 size={14}/>:<Maximize2 size={14}/>}
            </button>
            <button onClick={toggleChat}
              style={{ background:'none', border:'none', cursor:'pointer', padding:'5px', color:'#aaa', display:'flex' }}>
              <Minus size={14}/>
            </button>
          </div>
          {showSessions && (
            <SessionsPanel userId={userId} currentSessionId={currentSessionId}
              onSelectSession={id => { loadSession(id); setShowSessions(false); }}
              onNewSession={() => { handleNewSession(); setShowSessions(false); }}
              onClose={() => setShowSessions(false)} onConfirmDelete={confirmDelete}/>
          )}
        </div>

        <div style={{ textAlign:'center', padding:'4px 16px', fontSize:'10px', color:'#bbb',
          borderBottom:'1px solid #f5f5f5', background:'#fff', flexShrink:0 }}>
          Assistente com IA — suporta imagem, PDF, Excel, TXT e áudio
        </div>

        {/* Mensagens */}
        <div ref={scrollRef} className="ia-scroll"
          style={{ flex:1, overflowY:'auto', padding:'12px 14px', background:'#fff' }}>
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
                  {msg.attachments?.map((att, i) => <FileAttachmentBubble key={i} attachment={att}/>)}
                  {msg.content && (
                    <div style={{ background:'#f0f0f0', color:'#333', borderRadius:'16px 16px 4px 16px',
                      padding:'8px 12px', fontSize:'13px', lineHeight:'1.45', maxWidth:'85%',
                      wordBreak:'break-word', whiteSpace:'pre-wrap' }}>
                      {msg.content}
                    </div>
                  )}
                  {msg.time && <span style={{ fontSize:'11px', color:'#bbb', marginTop:'2px' }}>{msg.time}</span>}
                </div>
              )}
            </div>
          ))}

          {isChatLoading && (
            <div style={{ marginBottom:'8px' }}>
              <LiveReasoningArea
                reasoning={liveReasoning}
                isReasoningStreaming={isReasoningStreaming}
                toolSteps={toolSteps}
                isToolsActive={isToolsActive && !isReasoningStreaming}
              />
            </div>
          )}
        </div>

        {/* Preview de arquivos pendentes */}
        {pendingFiles.length > 0 && (
          <div style={{ flexShrink:0 }}>
            {pendingFiles.map((f, i) => (
              <PendingFilePreview key={i} file={f}
                onRemove={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}/>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ borderTop:'1px solid #eee', background:'#fff', padding:'9px 12px',
          display:'flex', alignItems:'flex-end', gap:'8px', flexShrink:0 }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={isChatLoading}
            style={{ background:'none', border:'none', cursor:'pointer', padding:'4px',
              display:'flex', flexShrink:0, position:'relative',
              color: pendingFiles.length > 0 ? BRAND : '#aaa' }}>
            <Paperclip size={16}/>
            {pendingFiles.length > 0 && (
              <span style={{ position:'absolute', top:'-3px', right:'-5px', width:'14px', height:'14px',
                borderRadius:'50%', background:BRAND, color:'#fff', fontSize:'8px', fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                {pendingFiles.length}
              </span>
            )}
          </button>
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_MIME}
            style={{ display:'none' }} onChange={handleFileSelect}/>
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={isChatLoading}
            rows={1}
            placeholder={
              pendingFiles.length > 0
                ? `O que fazer com ${pendingFiles.length === 1 ? 'o arquivo' : `os ${pendingFiles.length} arquivos`}?`
                : 'Mensagem ou arraste arquivos aqui...'
            }
            style={{ flex:1, border:'none', outline:'none', fontSize:'13px', color:'#333',
              background:'transparent', lineHeight:'1.45', minHeight:'22px', maxHeight:'100px',
              fontFamily:'inherit', padding:0, opacity:isChatLoading?0.5:1, resize:'none', overflowY:'auto' }}
          />
          <button onClick={handleSend} disabled={!canSend}
            style={{ width:'32px', height:'32px', borderRadius:'50%', border:'none',
              background: canSend ? BRAND : '#e8e8e8',
              cursor: canSend ? 'pointer' : 'default',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.15s' }}>
            <Send size={15} style={{ color: canSend ? '#fff' : '#bbb', marginLeft:'1px' }}/>
          </button>
        </div>
      </div>

      {/* Botão flutuante */}
      <div style={{ position:'fixed', zIndex:9998, bottom:'1.5rem', right:'1.5rem',
        transform:    isChatOpen?'scale(0)':'scale(1)',
        opacity:      isChatOpen?0:1,
        pointerEvents:isChatOpen?'none':'auto',
        transition:'transform 0.2s,opacity 0.15s' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview}/>
      </div>
    </>
  );
}