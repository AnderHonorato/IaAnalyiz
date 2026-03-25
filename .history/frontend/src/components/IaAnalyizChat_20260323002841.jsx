// IaAnalyizChat.jsx — v7: Fonte Gemini, dark mode, config, steps corretos, grid de anexos

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Paperclip, X, Plus, ExternalLink,
  Globe, FileText, FileSpreadsheet, Music, File, Image as ImageIcon,
  CheckCircle, Settings, Sun, Moon, Type,
} from 'lucide-react';

const API_BASE_URL  = 'http://localhost:3000';
const SESSION_KEY   = 'analyiz_last_session_id';
const POLL_INITIAL  = 8 * 1000;
const POLL_INTERVAL = 10 * 60 * 1000;
const MAX_FILES     = 10;

import gifolhos from '../assets/gifolhos1.gif';
const IA_GIF = gifolhos;

// ─── Tema dark (inspirado no Gemini) ─────────────────────────────────────────
const THEMES = {
  light: {
    bg:'#ffffff', surface:'#f8fafc', border:'#e2e8f0',
    text:'#1e293b', textMuted:'#64748b', textFaint:'#94a3b8',
    brand:'#1e293b', userBubble:'#f0f0f0', userText:'#333',
    panelBg:'#f8fafc', panelBorder:'#e2e8f0',
    headerBg:'#fff', headerBorder:'#eee',
    inputBg:'transparent', inputBorder:'#eee',
    reasoningBg:'#f8fafc',
  },
  dark: {
    bg:'#1e1f20',       // Gemini dark background
    surface:'#282a2c',  // card surface
    border:'#3c4043',
    text:'#e3e3e3',
    textMuted:'#9aa0a6',
    textFaint:'#5f6368',
    brand:'#8ab4f8',    // Gemini blue
    userBubble:'#303134',
    userText:'#e3e3e3',
    panelBg:'#282a2c',
    panelBorder:'#3c4043',
    headerBg:'#1e1f20',
    headerBorder:'#3c4043',
    inputBg:'transparent',
    inputBorder:'#3c4043',
    reasoningBg:'#282a2c',
  },
};

// ─── Tipos de arquivo ─────────────────────────────────────────────────────────
const FILE_TYPES = {
  'image/jpeg': { group:'image', icon:ImageIcon,       label:'Imagem'    },
  'image/png':  { group:'image', icon:ImageIcon,       label:'Imagem'    },
  'image/gif':  { group:'image', icon:ImageIcon,       label:'Imagem'    },
  'image/webp': { group:'image', icon:ImageIcon,       label:'Imagem'    },
  'application/pdf': { group:'pdf', icon:FileText,     label:'PDF'       },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { group:'excel', icon:FileSpreadsheet, label:'Excel' },
  'application/vnd.ms-excel': { group:'excel', icon:FileSpreadsheet, label:'Excel' },
  'text/csv':   { group:'excel', icon:FileSpreadsheet, label:'CSV'       },
  'text/plain': { group:'txt',   icon:FileText,        label:'Texto'     },
  'audio/mpeg': { group:'audio', icon:Music,           label:'MP3'       },
  'audio/wav':  { group:'audio', icon:Music,           label:'WAV'       },
  'audio/ogg':  { group:'audio', icon:Music,           label:'OGG'       },
  'audio/mp4':  { group:'audio', icon:Music,           label:'M4A'       },
  'audio/webm': { group:'audio', icon:Music,           label:'Áudio'     },
};
const ACCEPTED_MIME = Object.keys(FILE_TYPES).join(',');
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const GROUP_COLORS = {
  image:'#3b82f6', pdf:'#ef4444', excel:'#10b981', txt:'#8b5cf6', audio:'#f59e0b', unknown:'#94a3b8',
};
function getFileInfo(mimeType) { return FILE_TYPES[mimeType] || { group:'unknown', icon:File, label:'Arquivo' }; }

// ─── CSS Injetado com fonte Google Sans (Gemini) ──────────────────────────────
const CHAT_STYLES = (th, fontSize) => `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono&display=swap');

  @keyframes ia-spin       { to{transform:rotate(360deg);} }
  @keyframes ia-blink      { 0%,100%{opacity:1}50%{opacity:0} }
  @keyframes ia-fade-in    { from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)} }
  @keyframes ia-dot-pulse  { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.6)} }
  @keyframes ia-star-pulse { 0%,100%{opacity:1}50%{opacity:.5} }
  @keyframes ia-slide-down { from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)} }

  .ia-chat-root * { box-sizing:border-box; }
  .ia-chat-root {
    font-family:'Google Sans','Google Sans Text',Roboto,sans-serif !important;
    font-size:${fontSize}px;
    color:${th.text};
  }
  .ia-scroll::-webkit-scrollbar{width:4px}
  .ia-scroll::-webkit-scrollbar-track{background:transparent}
  .ia-scroll::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px}
  .ia-msg {
    font-family:'Google Sans','Google Sans Text',Roboto,sans-serif !important;
    font-size:${fontSize}px;
    line-height:1.65;
    color:${th.text};
  }
  .ia-msg a{color:#8ab4f8 !important;text-decoration:underline;font-weight:500;cursor:pointer}
  .ia-msg b{font-weight:600}
  .ia-msg br + br { display:block; margin-top:4px; }
  .ia-reasoning-text {
    font-family:'Google Sans Mono','Cascadia Code',ui-monospace,monospace !important;
    font-size:${Math.max(10, fontSize - 2)}px;
    line-height:1.7;
    color:${th.textMuted};
    white-space:pre-wrap;
    word-break:break-word;
  }
  .ia-step-text {
    font-family:'Google Sans Mono','Cascadia Code',ui-monospace,monospace !important;
    font-size:${Math.max(10, fontSize - 2)}px;
    line-height:1.45;
  }
  .ia-config-panel {
    animation:ia-slide-down 0.18s ease;
  }
`;

// ─── Ícone estrela IA ─────────────────────────────────────────────────────────
function StarSparkleIcon({ size=13, color='#6366f1', animated=false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      style={animated?{animation:'ia-star-pulse 2s ease-in-out infinite'}:{}}>
      <path d="M8 2.5L9.2 6.8H13.5L10 9.2L11.2 13.5L8 11.2L4.8 13.5L6 9.2L2.5 6.8H6.8L8 2.5Z" fill={color}/>
    </svg>
  );
}

// ─── TypewriterText — MAIS LENTO (speed maior = mais lento) ──────────────────
function TypewriterText({ text, speed=28, onDone }) {
  const [displayed, setDisplayed] = useState('');
  const timerRef = useRef(null);
  const doneRef  = useRef(false);

  useEffect(() => {
    setDisplayed('');
    doneRef.current = false;
    clearInterval(timerRef.current);
    if (!text) { onDone?.(); return; }
    let idx = 0;
    timerRef.current = setInterval(() => {
      idx++;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(timerRef.current);
        if (!doneRef.current) { doneRef.current=true; setTimeout(()=>onDone?.(), 80); }
      }
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [text]); // eslint-disable-line

  const done = displayed.length >= (text||'').length;
  return (
    <span>
      {displayed}
      {!done && <span style={{opacity:0.4,animation:'ia-blink 0.6s step-end infinite'}}>|</span>}
    </span>
  );
}

// ─── StepRow — etapa dentro do painel de raciocínio ───────────────────────────
// Design igual ao print: ícone + texto typewriter + badge "Concluído" abaixo
function StepRow({ step, isActive, onTypingDone, th }) {
  const borderColor = step.done ? 'rgba(16,185,129,0.2)' : isActive ? 'rgba(99,102,241,0.25)' : 'rgba(148,163,184,0.1)';
  const bgColor     = step.done ? 'rgba(16,185,129,0.05)' : isActive ? 'rgba(99,102,241,0.06)' : 'rgba(148,163,184,0.04)';

  return (
    <div style={{
      margin:'6px 0',
      padding:'7px 10px 7px 10px',
      background:bgColor,
      borderRadius:'8px',
      border:`1px solid ${borderColor}`,
      transition:'all 0.3s ease',
      animation:'ia-fade-in 0.2s ease',
    }}>
      {/* Linha: ícone + texto */}
      <div style={{display:'flex', alignItems:'flex-start', gap:'8px'}}>
        {/* Ícone estado */}
        <div style={{flexShrink:0, width:'16px', height:'16px', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'1px'}}>
          {step.done ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" fill="#10b981" opacity="0.18"/>
              <path d="M4.5 8.2l2.6 2.6 4.4-4.6" stroke="#10b981" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : isActive ? (
            <span style={{display:'inline-block', width:'11px', height:'11px', borderRadius:'50%',
              border:`1.5px solid rgba(99,102,241,0.3)`, borderTop:'1.5px solid #6366f1',
              animation:'ia-spin 0.75s linear infinite'}}/>
          ) : (
            <span style={{width:'6px',height:'6px',borderRadius:'50%',background:th.border,display:'inline-block'}}/>
          )}
        </div>

        {/* Texto typewriter */}
        <span className="ia-step-text" style={{
          color: step.done ? th.text : isActive ? th.text : th.textMuted,
          fontWeight: isActive ? 500 : 400, flex:1,
        }}>
          {isActive ? <TypewriterText text={step.msg} speed={22} onDone={onTypingDone}/> : step.msg}
        </span>
      </div>

      {/* Badge "Concluído" — exatamente como no print, abaixo do texto */}
      {step.done && (
        <div style={{
          display:'flex', alignItems:'center', gap:'4px',
          marginTop:'5px', marginLeft:'24px',
          animation:'ia-fade-in 0.25s ease',
        }}>
          <CheckCircle size={10} style={{color:'#10b981', flexShrink:0}}/>
          <span style={{fontSize:'10px', color:'#10b981', fontWeight:600, letterSpacing:'0.02em', fontFamily:'inherit'}}>
            Concluído
          </span>
        </div>
      )}
    </div>
  );
}

// ─── UnifiedReasoningPanel ────────────────────────────────────────────────────
// O PAINEL CENTRAL: raciocínio + steps intercalados
// Abre automaticamente, fecha sozinho ao terminar (800ms delay)
function UnifiedReasoningPanel({ items, isLive, th }) {
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef(null);
  const hasContent = items.length > 0;

  // Auto-scroll
  useEffect(() => {
    if (isLive && containerRef.current && !collapsed)
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [items, isLive, collapsed]);

  // Auto-fecha após terminar
  useEffect(() => {
    if (!isLive && hasContent) {
      const t = setTimeout(() => setCollapsed(true), 800);
      return () => clearTimeout(t);
    }
  }, [isLive, hasContent]);

  // Auto-abre quando começa
  useEffect(() => { if (isLive) setCollapsed(false); }, [isLive]);

  if (!hasContent && !isLive) return null;

  const accentColor = isLive ? '#8ab4f8' : th.textFaint;

  return (
    <div style={{marginBottom:'8px'}}>
      {/* Header toggle */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          display:'flex', alignItems:'center', gap:'5px', background:'none', border:'none',
          cursor:'pointer', padding:'2px 0', color:accentColor, fontSize:'11px',
          fontFamily:'inherit', userSelect:'none', transition:'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = isLive ? '#a8c7fa' : th.textMuted}
        onMouseLeave={e => e.currentTarget.style.color = accentColor}
      >
        <StarSparkleIcon size={12} color={accentColor} animated={isLive}/>
        <span style={{fontWeight:500, fontFamily:'inherit'}}>
          {isLive ? 'Raciocínio em andamento' : 'Mostrar raciocínio'}
        </span>
        {hasContent && (collapsed
          ? <ChevronDown size={10} style={{opacity:.6}}/>
          : <ChevronUp   size={10} style={{opacity:.6}}/>
        )}
        {isLive && (
          <span style={{display:'inline-block', width:'4px', height:'4px', borderRadius:'50%',
            background:'#8ab4f8', marginLeft:'2px', animation:'ia-dot-pulse 1s ease-in-out infinite'}}/>
        )}
      </button>

      {/* Corpo do painel */}
      {!collapsed && (
        <div ref={containerRef}
          style={{
            marginTop:'6px', padding:'10px 12px',
            background:th.reasoningBg,
            borderRadius:'10px',
            borderLeft:`2px solid ${th.border}`,
            maxHeight:'340px', overflowY:'auto', scrollbarWidth:'thin',
          }}>

          {/* Spinner inicial */}
          {isLive && items.length === 0 && (
            <div style={{display:'flex', alignItems:'center', gap:'8px', padding:'4px 0'}}>
              <span style={{display:'inline-block', width:'10px', height:'10px', borderRadius:'50%',
                border:`1.5px solid ${th.border}`, borderTop:'1.5px solid #8ab4f8',
                animation:'ia-spin 0.7s linear infinite', flexShrink:0}}/>
              <span className="ia-step-text" style={{color:th.textFaint, fontStyle:'italic'}}>
                Iniciando raciocínio...
              </span>
            </div>
          )}

          {/* Items intercalados — texto streaming + steps */}
          {items.map((item, i) => {
            if (item.kind === 'text') {
              return (
                <div key={i} style={{marginBottom:'4px'}}>
                  <span className="ia-reasoning-text">{item.text}</span>
                  {/* Cursor piscando no último bloco de texto se ainda streaming */}
                  {isLive && i === items.length-1 && item.kind==='text' && (
                    <span style={{display:'inline-block',width:'1px',height:'12px',background:'#8ab4f8',
                      marginLeft:'2px',verticalAlign:'middle',animation:'ia-blink 0.8s step-end infinite'}}/>
                  )}
                </div>
              );
            }
            if (item.kind === 'step') {
              return (
                <StepRow
                  key={i}
                  step={item}
                  isActive={item.isActive}
                  onTypingDone={item.onTypingDone}
                  th={th}
                />
              );
            }
            return null;
          })}

          {/* Spinner "aguardando" — quando live e sem step ativo */}
          {isLive && items.length > 0 && !items.some(it => it.kind==='step' && it.isActive) && (
            <div style={{display:'flex', alignItems:'center', gap:'7px', marginTop:'6px', opacity:0.5}}>
              <span style={{display:'inline-block', width:'8px', height:'8px', borderRadius:'50%',
                border:`1.5px solid ${th.border}`, borderTop:'1.5px solid #8ab4f8',
                animation:'ia-spin 0.9s linear infinite', flexShrink:0}}/>
              <span className="ia-step-text" style={{color:th.textFaint}}>processando...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DiffusionText — MAIS LENTO (80% mais lento) ─────────────────────────────
function DiffusionText({ html, th, onDoneRef }) {
  const SPEED = 11; // era 6, agora ~11 = ~80% mais lento
  const [visibleCount, setVisibleCount] = useState(0);
  const tokensRef = useRef([]);
  const timerRef  = useRef(null);

  useEffect(() => {
    const tokens = [];
    let i=0, src=html||'';
    while (i<src.length) {
      if (src[i]==='<') { const end=src.indexOf('>',i); if(end===-1){tokens.push(src[i]);i++;}else{tokens.push(src.substring(i,end+1));i=end+1;} }
      else if (src[i]==='&') { const end=src.indexOf(';',i); if(end===-1){tokens.push(src[i]);i++;}else{tokens.push(src.substring(i,end+1));i=end+1;} }
      else {tokens.push(src[i]);i++;}
    }
    tokensRef.current=tokens; setVisibleCount(0);
    if(!tokens.length){setTimeout(()=>onDoneRef?.current?.(),0);return;}
    timerRef.current=setInterval(()=>{
      setVisibleCount(prev=>{
        const next=Math.min(prev+2,tokens.length); // era +4, agora +2 = mais lento
        if(next>=tokens.length){clearInterval(timerRef.current);setTimeout(()=>onDoneRef?.current?.(),0);}
        return next;
      });
    },SPEED);
    return ()=>clearInterval(timerRef.current);
  },[html]); // eslint-disable-line

  const visible=tokensRef.current.slice(0,visibleCount).join('');
  const hidden=tokensRef.current.slice(visibleCount).join('');
  const cursor=visibleCount<tokensRef.current.length?`<span style="opacity:0.5;animation:ia-blink 0.8s step-end infinite">▍</span>`:'';
  return <SafeHTMLMsg html={visible+(hidden?`<span style="opacity:0;user-select:none;pointer-events:none;font-size:0">${hidden}</span>`:'')+cursor}/>;
}

function SafeHTMLMsg({ html }) {
  const ref=useRef(null);
  useEffect(()=>{
    if(!ref.current)return;
    ref.current.querySelectorAll('a[href^="/"]').forEach(a=>{
      const c=a.cloneNode(true);c.style.cssText='color:#8ab4f8;text-decoration:underline;font-weight:500;cursor:pointer';
      c.addEventListener('click',e=>{e.preventDefault();window.location.href=a.getAttribute('href');});a.parentNode?.replaceChild(c,a);
    });
    ref.current.querySelectorAll('a[href^="http"]').forEach(a=>{
      a.style.cssText='color:#8ab4f8;text-decoration:underline;font-weight:500';
      a.setAttribute('target','_blank');a.setAttribute('rel','noopener noreferrer');
    });
  },[html]);
  return <span ref={ref} dangerouslySetInnerHTML={{__html:html}} style={{wordBreak:'break-word'}}/>;
}

function enrichHTML(html) {
  if(!html)return'';
  return html
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g,'<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#f59e0b;font-weight:600;text-decoration:underline">$1</a>')
    .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*([^*\n<]+)\*/g,'<b>$1</b>')
    .replace(/^#{1,6}\s+/gm,'').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>').trim();
}

function extractLinks(html) {
  const links=[],re=/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;let m;
  while((m=re.exec(html))!==null){const href=m[1],label=m[2].trim()||m[1];if(href&&href!=='#')links.push({href,label});}
  return[...new Map(links.map(l=>[l.href,l])).values()];
}

function IaMessage({ msg, isTyping, onDone, th }) {
  const enriched  = enrichHTML(msg.content);
  const links     = extractLinks(enriched);
  const onDoneRef = useRef(onDone);
  useEffect(()=>{onDoneRef.current=onDone;},[onDone]);

  const historicItems = [];
  if (msg.reasoning) historicItems.push({ kind:'text', text:msg.reasoning });
  if (msg.steps?.length > 0) msg.steps.forEach(s=>historicItems.push({kind:'step',...s,done:true,isActive:false}));

  return(
    <div className="ia-msg">
      {historicItems.length > 0 && <UnifiedReasoningPanel items={historicItems} isLive={false} th={th}/>}
      {isTyping
        ? <DiffusionText html={enriched} th={th} onDoneRef={onDoneRef}/>
        : <SafeHTMLMsg html={enriched}/>}
      {!isTyping && links.length>0 && (
        <div style={{marginTop:'8px',borderTop:`1px solid ${th.border}`,paddingTop:'6px',display:'flex',flexWrap:'wrap',gap:'4px'}}>
          {links.map((l,i)=>(
            <a key={i} href={l.href} target={l.href.startsWith('/')?'_self':'_blank'} rel="noopener noreferrer"
              style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:'#8ab4f8',textDecoration:'none',background:th.surface,borderRadius:'6px',padding:'4px 8px',border:`1px solid ${th.border}`}}>
              <ExternalLink size={10}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'160px'}}>{l.label}</span>
            </a>
          ))}
        </div>
      )}
      {msg.sources?.length>0&&(
        <div style={{marginTop:'6px',display:'flex',flexWrap:'wrap',gap:'4px'}}>
          {msg.sources.map((s,i)=>(
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:'#8ab4f8',textDecoration:'none',background:th.surface,borderRadius:'6px',padding:'4px 8px',border:`1px solid ${th.border}`}}>
              🔗<span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'150px'}}>{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FileAttachmentBubble — na mensagem enviada ───────────────────────────────
// Pequenos quadrados alinhados horizontalmente
function FileAttachmentGrid({ attachments, th }) {
  if (!attachments?.length) return null;
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'6px', justifyContent:'flex-end'}}>
      {attachments.map((att, i) => {
        const info  = getFileInfo(att.mimeType);
        const color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown;
        const Icon  = info.icon;

        if (info.group === 'image' && att.preview) {
          return (
            <div key={i} style={{width:'56px', height:'56px', borderRadius:'8px', overflow:'hidden',
              flexShrink:0, border:`1px solid ${th.border}`, position:'relative'}}>
              <img src={att.preview} alt={att.name}
                style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
            </div>
          );
        }

        if (info.group === 'audio' && att.preview) {
          return (
            <div key={i} style={{width:'56px', height:'56px', borderRadius:'8px', background:th.surface,
              border:`1px solid ${th.border}`, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:'2px', flexShrink:0}}>
              <Music size={18} style={{color}}/>
              <span style={{fontSize:'8px', color:th.textFaint, textAlign:'center', lineHeight:'1.1',
                overflow:'hidden', maxWidth:'50px', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{att.name}</span>
            </div>
          );
        }

        return (
          <div key={i} style={{width:'56px', height:'56px', borderRadius:'8px', background:th.surface,
            border:`1px solid ${th.border}`, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', gap:'2px', flexShrink:0}}>
            <Icon size={18} style={{color}}/>
            <span style={{fontSize:'8px', color:th.textFaint, textAlign:'center', lineHeight:'1.1',
              overflow:'hidden', maxWidth:'50px', textOverflow:'ellipsis', whiteSpace:'nowrap',
              padding:'0 2px'}}>{att.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── PendingFilePreview — grid horizontal antes de enviar ─────────────────────
function PendingFilesGrid({ files, onRemove, th }) {
  if (!files.length) return null;
  return (
    <div style={{padding:'8px 12px', borderTop:`1px solid ${th.border}`,
      background:th.bg, display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'flex-start'}}>
      {files.map((file, i) => {
        const info  = getFileInfo(file.mimeType);
        const color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown;
        const Icon  = info.icon;
        return (
          <div key={i} style={{position:'relative', width:'60px', height:'60px', flexShrink:0}}>
            <div style={{width:'60px', height:'60px', borderRadius:'8px',
              background: info.group==='image' && file.preview ? 'transparent' : th.surface,
              border:`1px solid ${th.border}`,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:'2px', overflow:'hidden'}}>
              {info.group==='image' && file.preview ? (
                <img src={file.preview} alt={file.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              ) : info.group==='audio' && file.preview ? (
                <>
                  <Music size={20} style={{color, flexShrink:0}}/>
                  <span style={{fontSize:'7px',color:th.textFaint,textAlign:'center',lineHeight:'1.1',padding:'0 3px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'54px'}}>{file.name}</span>
                </>
              ) : (
                <>
                  <Icon size={20} style={{color, flexShrink:0}}/>
                  <span style={{fontSize:'7px',color:th.textFaint,textAlign:'center',lineHeight:'1.1',padding:'0 3px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'54px'}}>{file.name}</span>
                </>
              )}
            </div>
            {/* Botão remover */}
            <button onClick={()=>onRemove(i)}
              style={{position:'absolute',top:'-5px',right:'-5px',width:'16px',height:'16px',
                borderRadius:'50%',background:'#ef4444',border:'none',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
              <X size={9} style={{color:'#fff'}}/>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── ConfigPanel ──────────────────────────────────────────────────────────────
function ConfigPanel({ darkMode, setDarkMode, fontSize, setFontSize, th, onClose }) {
  return (
    <div className="ia-config-panel"
      style={{
        position:'absolute', top:'52px', right:0, left:0,
        background:th.headerBg, borderBottom:`1px solid ${th.border}`,
        padding:'12px 16px', zIndex:15, boxShadow:`0 4px 16px rgba(0,0,0,0.15)`,
      }}>
      {/* Modo escuro/claro */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
        <span style={{fontSize:'12px',color:th.textMuted,fontWeight:500}}>Aparência</span>
        <div style={{display:'flex',gap:'4px'}}>
          <button onClick={()=>setDarkMode(false)}
            style={{padding:'5px 10px',borderRadius:'8px',border:`1px solid ${th.border}`,cursor:'pointer',
              fontSize:'11px',fontWeight:600,transition:'all 0.15s',
              background:!darkMode?th.brand:'transparent',
              color:!darkMode?th.bg:th.textMuted}}>
            <Sun size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/>Claro
          </button>
          <button onClick={()=>setDarkMode(true)}
            style={{padding:'5px 10px',borderRadius:'8px',border:`1px solid ${th.border}`,cursor:'pointer',
              fontSize:'11px',fontWeight:600,transition:'all 0.15s',
              background:darkMode?th.brand:'transparent',
              color:darkMode?th.bg:th.textMuted}}>
            <Moon size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/>Escuro
          </button>
        </div>
      </div>

      {/* Tamanho de fonte */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:'12px',color:th.textMuted,fontWeight:500}}>
          <Type size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/>Fonte: {fontSize}px
        </span>
        <div style={{display:'flex',gap:'4px'}}>
          {[11,12,13,14,15].map(size => (
            <button key={size} onClick={()=>setFontSize(size)}
              style={{width:'28px',height:'28px',borderRadius:'6px',border:`1px solid ${th.border}`,cursor:'pointer',
                fontSize:'10px',fontWeight:600,transition:'all 0.15s',
                background:fontSize===size?th.brand:'transparent',
                color:fontSize===size?th.bg:th.textMuted}}>
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SessionsPanel ────────────────────────────────────────────────────────────
function SessionsPanel({ userId, currentSessionId, onSelectSession, onNewSession, onClose, onConfirmDelete, th }) {
  const[sessions,setSessions]=useState([]);const[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{if(!userId)return;setLoading(true);try{const r=await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`);setSessions(await r.json());}catch{}finally{setLoading(false);};},[userId]);
  useEffect(()=>{load();},[load]);
  const del=async(e,id)=>{e.stopPropagation();if(!await onConfirmDelete())return;await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`,{method:'DELETE'});if(id===currentSessionId)onNewSession();load();};
  return(
    <div style={{position:'absolute',top:'52px',right:0,left:0,background:th.headerBg,zIndex:10,borderBottom:`1px solid ${th.border}`,maxHeight:'260px',overflowY:'auto',boxShadow:'0 4px 12px rgba(0,0,0,0.12)'}}>
      <button onClick={()=>{onNewSession();onClose();}} style={{width:'100%',padding:'10px 14px',display:'flex',alignItems:'center',gap:'8px',background:'none',border:'none',borderBottom:`1px solid ${th.border}`,cursor:'pointer',fontSize:'13px',color:th.brand,fontWeight:600,fontFamily:'inherit'}}><Plus size={14}/>Nova conversa</button>
      {loading&&<p style={{padding:'12px',fontSize:'12px',color:th.textFaint}}>Carregando...</p>}
      {sessions.map(s=>(
        <div key={s.id} onClick={()=>{onSelectSession(s.id);onClose();}} style={{padding:'9px 14px',display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'13px',color:th.text,background:s.id===currentSessionId?th.surface:'transparent',borderBottom:`1px solid ${th.border}`,transition:'background 0.1s'}}>
          <MessageSquare size={13} style={{color:th.textFaint,flexShrink:0}}/><span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.titulo}</span>
          <button onClick={e=>del(e,s.id)} style={{background:'none',border:'none',cursor:'pointer',color:th.textFaint,padding:'2px'}}><Trash2 size={12}/></button>
        </div>
      ))}
    </div>
  );
}

// ─── FloatingButton ───────────────────────────────────────────────────────────
function FloatingButton({ onClick, hasUnread, shortPreview }) {
  const[hovered,setHovered]=useState(false);
  return(
    <div style={{position:'relative',display:'inline-flex',flexDirection:'column',alignItems:'flex-end',gap:'6px'}}>
      {hasUnread&&shortPreview&&<div onClick={onClick} style={{background:'#1e293b',color:'white',fontSize:'12px',fontWeight:500,padding:'8px 12px',borderRadius:'12px 12px 12px 4px',maxWidth:'240px',lineHeight:'1.4',boxShadow:'0 2px 12px rgba(30,41,59,0.3)',animation:'ia-fade-in 0.3s ease',cursor:'pointer',wordBreak:'break-word',fontFamily:'inherit'}}>{shortPreview}</div>}
      <button onClick={onClick} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
        style={{display:'flex',alignItems:'center',borderRadius:'999px',border:'none',outline:'none',background:'#1e293b',cursor:'pointer',boxShadow:'0 4px 20px rgba(30,41,59,0.45)',width:hovered?'172px':'62px',height:'62px',transition:'width 0.28s cubic-bezier(0.34,1.2,0.64,1)',padding:0,overflow:'hidden'}}>
        <span style={{width:'62px',height:'62px',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',overflow:'hidden',background:'#fff',order:1,zIndex:2}}>
          <img src={IA_GIF} alt="IA" style={{width:'58px',height:'58px',objectFit:'contain',borderRadius:'50%'}} onError={e=>{e.target.style.display='none';}}/>
        </span>
        <span style={{color:'white',fontSize:'13px',fontWeight:700,whiteSpace:'nowrap',paddingRight:'20px',paddingLeft:'4px',order:2,opacity:hovered?1:0,transition:'opacity 0.18s',pointerEvents:'none',fontFamily:'inherit'}}>Assistente</span>
      </button>
    </div>
  );
}

function ChatHeaderAvatar() {
  return(
    <div style={{width:'36px',height:'36px',borderRadius:'10px',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
      <img src={IA_GIF} alt="IA" style={{width:'32px',height:'32px',objectFit:'contain'}} onError={e=>{e.target.style.display='none';}}/>
    </div>
  );
}

function getTime(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function IaAnalyizChat({ isChatOpen, toggleChat, userRole, pageBaseUrl }) {
  // Preferências persistentes
  const [darkMode, setDarkModeState]  = useState(() => { try{return localStorage.getItem('analyiz_darkmode')==='true';}catch{return false;} });
  const [fontSize, setFontSizeState]  = useState(() => { try{return parseInt(localStorage.getItem('analyiz_fontsize')||'13');}catch{return 13;} });
  const setDarkMode  = (v) => { setDarkModeState(v);  try{localStorage.setItem('analyiz_darkmode', String(v));}catch{} };
  const setFontSize  = (v) => { setFontSizeState(v);  try{localStorage.setItem('analyiz_fontsize', String(v));}catch{} };
  const th = THEMES[darkMode ? 'dark' : 'light'];

  const [chatInput,setChatInput]         = useState('');
  const [isChatLoading,setIsChatLoading] = useState(false);
  const [isExpanded,setIsExpanded]       = useState(false);
  const [hasUnread,setHasUnread]         = useState(false);
  const [shortPreview,setShortPreview]   = useState('');
  const [showSessions,setShowSessions]   = useState(false);
  const [showConfig,setShowConfig]       = useState(false);
  const [pendingFiles,setPendingFiles]   = useState([]);
  const [typingSet,setTypingSet]         = useState(new Set());
  const [messages,setMessages]           = useState([]);
  const [isDragging,setIsDragging]       = useState(false);

  // Estado do painel de raciocínio unificado ao vivo
  const [liveItems,setLiveItems]   = useState([]);
  const [isLive,setIsLive]         = useState(false);

  // Fila de typewriter para steps
  const stepTypingQueue = useRef([]);
  const isStepTyping    = useRef(false);

  const pendingNotifRef = useRef(null);

  let modalConfirm=null;
  try{const mod=require('../components/Modal');if(mod?.useModal){const{confirm}=mod.useModal();modalConfirm=confirm;}}catch{}
  const confirmDelete=useCallback(async()=>{if(modalConfirm)return await modalConfirm({title:'Excluir conversa',message:'Será removida permanentemente.',confirmLabel:'Excluir',danger:true});return window.confirm('Deletar esta conversa?');},[modalConfirm]);

  const readUserId=()=>{try{const u=JSON.parse(localStorage.getItem('analyiz_user'));return u?.id||null;}catch{return null;}};
  const [userId]=useState(readUserId);

  const [currentSessionId,setCurrentSessionId]=useState(()=>{
    try{const s=localStorage.getItem(SESSION_KEY),o=localStorage.getItem('analyiz_session_owner');if(s&&o===String(readUserId()))return parseInt(s);return null;}catch{return null;}
  });

  const sessionIdRef  = useRef(currentSessionId);
  const isChatOpenRef = useRef(isChatOpen);
  const scrollRef     = useRef(null);
  const textareaRef   = useRef(null);
  const fileInputRef  = useRef(null);
  const pollTimerRef  = useRef(null);
  const dropRef       = useRef(null);
  const allStepsRef   = useRef([]);
  const reasoningRef  = useRef('');
  const stepKeyCounter= useRef(0);

  useEffect(()=>{sessionIdRef.current=currentSessionId;},[currentSessionId]);
  useEffect(()=>{isChatOpenRef.current=isChatOpen;},[isChatOpen]);
  useEffect(()=>{
    if(currentSessionId&&userId){localStorage.setItem(SESSION_KEY,String(currentSessionId));localStorage.setItem('analyiz_session_owner',String(userId));}
    else{localStorage.removeItem(SESSION_KEY);localStorage.removeItem('analyiz_session_owner');}
  },[currentSessionId,userId]);

  useEffect(()=>{
    if(!isChatOpen)return;setHasUnread(false);setShortPreview('');
    const p=pendingNotifRef.current;if(!p)return;
    const{notifId,fullInsight}=p;pendingNotifRef.current=null;
    if(notifId&&userId)fetch(`${API_BASE_URL}/api/ia/proactive/seen`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,notifId})}).catch(()=>{});
    setTimeout(()=>{const id=`ia-proactive-${Date.now()}`;setMessages(prev=>[...prev,{role:'ia',content:fullInsight,time:getTime(),id,sources:[],reasoning:'',steps:[]}]);setTypingSet(prev=>new Set(prev).add(id));},400);
  },[isChatOpen]); // eslint-disable-line

  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[messages,isChatLoading,liveItems,typingSet]);
  useEffect(()=>{const ta=textareaRef.current;if(!ta)return;ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,100)+'px';},[chatInput]);

  // ── Sistema de fila typewriter para steps ─────────────────────────────────
  const processNextStepTyping = useCallback(() => {
    if (stepTypingQueue.current.length === 0) { isStepTyping.current=false; return; }
    isStepTyping.current = true;
    const { itemIdx } = stepTypingQueue.current[0];

    setLiveItems(prev => prev.map((it, i) => {
      if (i !== itemIdx) return it;
      return {
        ...it, isActive:true,
        onTypingDone: () => {
          stepTypingQueue.current.shift();
          isStepTyping.current = false;
          setLiveItems(p => p.map((x, xi) => xi===itemIdx ? {...x,isActive:false,onTypingDone:undefined} : x));
          setTimeout(processNextStepTyping, 80);
        },
      };
    }));
  }, []);

  const enqueueStepTyping = useCallback((itemIdx) => {
    stepTypingQueue.current.push({ itemIdx });
    if (!isStepTyping.current) processNextStepTyping();
  }, [processNextStepTyping]);

  const appendReasoningText = useCallback((chunk) => {
    reasoningRef.current += chunk;
    setLiveItems(prev => {
      const last = prev[prev.length - 1];
      if (last && last.kind === 'text') {
        const u = [...prev]; u[prev.length-1] = {...last, text:last.text+chunk}; return u;
      }
      return [...prev, { kind:'text', text:chunk }];
    });
  }, []);

  const addStep = useCallback((msg, stepKey) => {
    allStepsRef.current.push({ msg, done:false, stepKey });
    setLiveItems(prev => {
      const newIdx = prev.length;
      enqueueStepTyping(newIdx);
      return [...prev, { kind:'step', msg, done:false, isActive:false, stepKey }];
    });
  }, [enqueueStepTyping]);

  const markStepDone = useCallback((stepKey) => {
    setLiveItems(prev => prev.map(it => it.kind==='step' && it.stepKey===stepKey ? {...it,done:true} : it));
    const s = allStepsRef.current.find(x => x.stepKey===stepKey);
    if (s) s.done = true;
  }, []);

  const resetLiveState = () => {
    setLiveItems([]); setIsLive(false);
    stepTypingQueue.current=[]; isStepTyping.current=false;
    allStepsRef.current=[]; reasoningRef.current=''; stepKeyCounter.current=0;
  };

  const mapMessage = useCallback((m) => {
    let attachments=null;
    if(m.imageDesc){try{const p=JSON.parse(m.imageDesc);if(Array.isArray(p)){attachments=p.map(att=>{if(att.group==='image'&&!att.preview&&m.imageBase64)return{...att,preview:`data:${att.mimeType||'image/jpeg'};base64,${m.imageBase64}`};return att;});}}catch{}}
    const li=m.imageBase64&&!attachments?[{mimeType:'image/jpeg',name:'imagem.jpg',group:'image',preview:`data:image/jpeg;base64,${m.imageBase64}`,sizeBytes:0}]:null;
    return{role:m.role,id:String(m.id),sources:[],reasoning:'',steps:[],content:m.content||'',attachments:attachments||li,time:(()=>{try{const d=new Date(m.createdAt);return isNaN(d.getTime())?getTime():d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch{return getTime();}})()};
  },[]);

  const WELCOME = 'Olá! 😊 Sou a IA Analyiz! Posso ajudar com anúncios, divergências, leitura de páginas do sistema e muito mais. Você pode enviar até 10 arquivos simultâneos (imagens, PDFs, planilhas, textos ou áudios)!';

  useEffect(()=>{
    if(!currentSessionId){setMessages([{role:'ia',content:WELCOME,time:getTime(),id:'init',sources:[],reasoning:'',steps:[]}]);return;}
    fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`).then(r=>r.json()).then(msgs=>setMessages(msgs.length>0?msgs.map(mapMessage):[{role:'ia',content:'Olá! 😊 Bem-vindo de volta!',time:getTime(),id:'init',sources:[],reasoning:'',steps:[]}])).catch(()=>setMessages([{role:'ia',content:'Olá! 😊 Como posso te ajudar?',time:getTime(),id:'init',sources:[],reasoning:'',steps:[]}]));
  },[]); // eslint-disable-line

  const loadSession=useCallback((sessionId)=>{
    setCurrentSessionId(sessionId);sessionIdRef.current=sessionId;setTypingSet(new Set());resetLiveState();
    if(!sessionId){setMessages([{role:'ia',content:'😊 Nova conversa! Como posso ajudar?',time:getTime(),id:`init-${Date.now()}`,sources:[],reasoning:'',steps:[]}]);return;}
    fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages`).then(r=>r.json()).then(msgs=>setMessages(msgs.length>0?msgs.map(mapMessage):[{role:'ia',content:'😊 Como posso te ajudar?',time:getTime(),id:`init-${Date.now()}`,sources:[],reasoning:'',steps:[]}])).catch(()=>{});
  },[mapMessage]);

  const ensureSession=useCallback(async()=>{
    if(sessionIdRef.current)return sessionIdRef.current;if(!userId)return null;
    try{const res=await fetch(`${API_BASE_URL}/api/chat/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId})});const s=await res.json();setCurrentSessionId(s.id);sessionIdRef.current=s.id;return s.id;}catch{return null;}
  },[userId]);

  const verificarProativo=useCallback(async()=>{
    if(!userId||isChatOpenRef.current)return;
    try{const res=await fetch(`${API_BASE_URL}/api/ia/proactive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,userRole})});const data=await res.json();if(!data.insight||!data.hasRelevantData)return;pendingNotifRef.current={notifId:data.notifId,fullInsight:data.fullInsight};setShortPreview(data.insight);setHasUnread(true);if(data.notifId)fetch(`${API_BASE_URL}/api/ia/proactive/exibida`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,notifId:data.notifId})}).catch(()=>{});}catch{}
  },[userId,userRole]);

  useEffect(()=>{
    if(!userId)return;
    const first=setTimeout(verificarProativo,POLL_INITIAL);pollTimerRef.current=setInterval(verificarProativo,POLL_INTERVAL);
    return()=>{clearTimeout(first);clearInterval(pollTimerRef.current);};
  },[verificarProativo]);

  const processFile=useCallback((file)=>new Promise((resolve,reject)=>{
    const info=getFileInfo(file.type);
    if(!FILE_TYPES[file.type]&&!file.type.startsWith('image/')&&!file.type.startsWith('audio/')){reject(new Error(`Tipo não suportado: ${file.name}`));return;}
    if(file.size>MAX_FILE_SIZE){reject(new Error(`Arquivo muito grande: ${file.name}`));return;}
    const r=new FileReader();
    r.onload=ev=>{const d=ev.target.result;resolve({base64:d.split(',')[1],mimeType:file.type||'application/octet-stream',name:file.name,sizeBytes:file.size,group:info.group,preview:['image','audio'].includes(info.group)?d:null});};
    r.onerror=()=>reject(new Error(`Erro ao ler: ${file.name}`));r.readAsDataURL(file);
  }),[]);

  const addFiles=useCallback(async(fileList)=>{
    const toAdd=[...fileList].slice(0,MAX_FILES);const added=[];
    for(const file of toAdd){try{added.push(await processFile(file));}catch(e){console.warn('[Files]',e.message);}}
    if(added.length)setPendingFiles(prev=>[...prev,...added].slice(0,MAX_FILES));
  },[processFile]);

  const handleFileSelect=useCallback(async(e)=>{if(e.target.files?.length)await addFiles(e.target.files);e.target.value='';},[addFiles]);
  const handlePaste=useCallback(async(e)=>{const items=e.clipboardData?.items;if(!items)return;const files=[];for(const item of items){if(item.kind==='file'){const f=item.getAsFile();if(f)files.push(f);}}if(files.length){e.preventDefault();await addFiles(files);}},[addFiles]);
  const handleDragOver=useCallback((e)=>{e.preventDefault();e.stopPropagation();setIsDragging(true);},[]);
  const handleDragLeave=useCallback((e)=>{e.preventDefault();if(!dropRef.current?.contains(e.relatedTarget))setIsDragging(false);},[]);
  const handleDrop=useCallback(async(e)=>{e.preventDefault();e.stopPropagation();setIsDragging(false);if(e.dataTransfer.files?.length)await addFiles(e.dataTransfer.files);},[addFiles]);

  const handleSend=useCallback(async()=>{
    const hasText=chatInput.trim().length>0,hasFiles=pendingFiles.length>0;
    if((!hasText&&!hasFiles)||isChatLoading)return;

    const userMessage=chatInput.trim(),filesToSend=[...pendingFiles],msgId=`user-${Date.now()}`;
    const attachmentSnapshot=filesToSend.map(f=>({mimeType:f.mimeType,name:f.name,group:f.group,preview:f.preview,sizeBytes:f.sizeBytes}));

    setMessages(prev=>[...prev,{role:'user',content:userMessage,time:getTime(),id:msgId,sources:[],reasoning:'',steps:[],attachments:attachmentSnapshot.length?attachmentSnapshot:null}]);
    setChatInput('');setPendingFiles([]);
    setIsChatLoading(true);
    resetLiveState();

    let capturedReasoning='';

    try{
      const sid=await ensureSession();
      const images=filesToSend.filter(f=>f.group==='image'),nonImages=filesToSend.filter(f=>f.group!=='image'),firstImg=images[0];
      const MAX_PREVIEW_SIZE=8*1024*1024;
      const attachmentMeta=attachmentSnapshot.map(a=>{
        const isMainImg=a.group==='image'&&firstImg&&a.name===firstImg.name;
        const needsPreview=(a.group==='audio'||(a.group==='image'&&!isMainImg));
        return{mimeType:a.mimeType,name:a.name,group:a.group,sizeBytes:a.sizeBytes,...(needsPreview&&a.preview&&a.preview.length<MAX_PREVIEW_SIZE?{preview:a.preview}:{})};
      });

      const actualPageBaseUrl = pageBaseUrl || window.location.origin || 'http://localhost:5173';

      const body=JSON.stringify({
        message:userMessage||'',pageUrl:window.location.pathname,
        pageBaseUrl:actualPageBaseUrl,
        sessionId:sid,userRole,userId,
        imageOnly:!hasText&&filesToSend.length===1&&!!firstImg,
        ...(firstImg?{imageBase64:firstImg.base64,imageMimeType:firstImg.mimeType,imageName:firstImg.name}:{}),
        extraImages:images.slice(1).map(f=>({base64:f.base64,mimeType:f.mimeType,name:f.name})),
        files:nonImages.map(f=>({base64:f.base64,mimeType:f.mimeType,name:f.name,group:f.group,sizeBytes:f.sizeBytes})),
        attachmentMeta,
      });

      const res=await fetch(`${API_BASE_URL}/api/ia/chat/stream`,{method:'POST',headers:{'Content-Type':'application/json'},body});
      if(!res.ok||!res.body)throw new Error(`HTTP ${res.status}`);

      const reader=res.body.getReader(),decoder=new TextDecoder();
      let buffer='',done=false;

      while(!done){
        const{value,done:sd}=await reader.read();done=sd;
        if(value)buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split('\n');buffer=lines.pop();
        let ev=null;
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{
              const data=JSON.parse(line.slice(6));
              if(ev==='reasoning_start'){
                setIsLive(true);
              }else if(ev==='reasoning_chunk'){
                capturedReasoning+=data.text||'';appendReasoningText(data.text||'');
              }else if(ev==='reasoning_end'){
                capturedReasoning=data.fullText||capturedReasoning;setLiveItems(prev=>prev); // força re-render
              }else if(ev==='step'){
                const sk=stepKeyCounter.current++;addStep(data.msg,sk);
              }else if(ev==='step_done'){
                markStepDone(data.stepIndex);
              }else if(ev==='done'){
                if(data.sessionId&&!sessionIdRef.current){setCurrentSessionId(data.sessionId);sessionIdRef.current=data.sessionId;}
                setIsLive(false);
                const finalSteps=[...allStepsRef.current];
                const finalReasoning=capturedReasoning||data.reasoning||'';
                const iaId=`ia-${Date.now()}`;
                setMessages(prev=>[...prev,{role:'ia',content:data.reply,time:getTime(),id:iaId,sources:data.sources||[],reasoning:finalReasoning,steps:finalSteps}]);
                setTypingSet(prev=>new Set(prev).add(iaId));
              }else if(ev==='error'){
                throw new Error(data.message||'Erro no stream');
              }
            }catch(parseErr){
              if(!['step','step_done','reasoning_chunk','reasoning_start','reasoning_end'].includes(ev))throw parseErr;
            }
            ev=null;
          }
        }
      }
    }catch(err){
      console.warn('[Chat stream]',err.message);
      setMessages(prev=>[...prev,{role:'ia',content:'⚠️ Erro de conexão. Tente novamente!',time:getTime(),id:`err-${Date.now()}`,sources:[],reasoning:'',steps:[]}]);
    }finally{
      setIsChatLoading(false);setIsLive(false);
    }
  },[chatInput,pendingFiles,isChatLoading,userRole,userId,pageBaseUrl,ensureSession,appendReasoningText,addStep,markStepDone]);

  const handleKeyDown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}};
  const handleNewSession=()=>{
    setCurrentSessionId(null);sessionIdRef.current=null;localStorage.removeItem(SESSION_KEY);
    setMessages([{role:'ia',content:'😊 Nova conversa! Como posso te ajudar?',time:getTime(),id:`init-${Date.now()}`,sources:[],reasoning:'',steps:[]}]);
    setTypingSet(new Set());resetLiveState();
  };

  const canSend=(chatInput.trim()||pendingFiles.length>0)&&!isChatLoading;
  const W=isExpanded?'min(580px, 94vw)':'380px';
  const H=isExpanded?'min(700px, 87vh)':'min(560px, calc(100vh - 5rem))';

  return(
    <>
      <style>{CHAT_STYLES(th, fontSize)}</style>

      {/* ── Janela principal ────────────────────────────────────────────────── */}
      <div className="ia-chat-root" ref={dropRef}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{
          position:'fixed',zIndex:9999,bottom:'1.5rem',right:'1.5rem',
          width:W,height:H,maxHeight:'calc(100vh - 3rem)',
          background:th.bg,borderRadius:'20px',
          boxShadow:isDragging?'0 4px 32px rgba(99,102,241,0.25),0 0 0 2px #6366f1':'0 4px 32px rgba(0,0,0,0.2)',
          display:'flex',flexDirection:'column',overflow:'hidden',
          transformOrigin:'bottom right',
          transform:isChatOpen?'scale(1)':'scale(0)',
          opacity:isChatOpen?1:0, pointerEvents:isChatOpen?'auto':'none',
          transition:'transform 0.25s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s,box-shadow 0.2s',
          border:isDragging?'2px dashed #6366f1':`1px solid ${th.border}`,
        }}>

        {/* Overlay drag */}
        {isDragging&&(
          <div style={{position:'absolute',inset:0,background:'rgba(99,102,241,0.07)',zIndex:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',borderRadius:'18px',pointerEvents:'none'}}>
            <div style={{fontSize:'36px',marginBottom:'8px'}}>📎</div>
            <p style={{fontSize:'14px',fontWeight:700,color:'#6366f1',margin:0,fontFamily:'inherit'}}>Solte para anexar</p>
            <p style={{fontSize:'11px',color:th.textMuted,marginTop:'4px',fontFamily:'inherit'}}>Até {MAX_FILES} arquivos · Imagem · PDF · Excel · TXT · Áudio</p>
          </div>
        )}

        {/* Header */}
        <div style={{position:'relative',padding:'10px 14px',borderBottom:`1px solid ${th.headerBorder}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:th.headerBg,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <ChatHeaderAvatar/>
            <div>
              <span style={{fontWeight:600,fontSize:'14px',color:th.text,display:'block',lineHeight:'1.2',fontFamily:'inherit'}}>Assistente IA</span>
              <span style={{fontSize:'10px',color:th.textFaint,fontWeight:400,fontFamily:'inherit'}}>Analyiz • Online ✨</span>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'2px'}}>
            <button onClick={()=>{setShowSessions(v=>!v);setShowConfig(false);}}
              style={{background:showSessions?th.surface:'none',border:'none',cursor:'pointer',padding:'6px',color:showSessions?th.brand:th.textFaint,display:'flex',borderRadius:'8px',transition:'all 0.1s'}}><MessageSquare size={15}/></button>
            <button onClick={()=>{setShowConfig(v=>!v);setShowSessions(false);}}
              style={{background:showConfig?th.surface:'none',border:'none',cursor:'pointer',padding:'6px',color:showConfig?th.brand:th.textFaint,display:'flex',borderRadius:'8px',transition:'all 0.1s'}}><Settings size={15}/></button>
            <button onClick={()=>setIsExpanded(v=>!v)}
              style={{background:'none',border:'none',cursor:'pointer',padding:'6px',color:th.textFaint,display:'flex',borderRadius:'8px'}}>{isExpanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>
            <button onClick={toggleChat}
              style={{background:'none',border:'none',cursor:'pointer',padding:'6px',color:th.textFaint,display:'flex',borderRadius:'8px'}}><Minus size={15}/></button>
          </div>

          {showSessions&&<SessionsPanel userId={userId} currentSessionId={currentSessionId} onSelectSession={id=>{loadSession(id);setShowSessions(false);}} onNewSession={()=>{handleNewSession();setShowSessions(false);}} onClose={()=>setShowSessions(false)} onConfirmDelete={confirmDelete} th={th}/>}
          {showConfig&&<ConfigPanel darkMode={darkMode} setDarkMode={setDarkMode} fontSize={fontSize} setFontSize={setFontSize} th={th} onClose={()=>setShowConfig(false)}/>}
        </div>

        {/* Subtítulo */}
        <div style={{textAlign:'center',padding:'3px 16px',fontSize:'10px',color:th.textFaint,borderBottom:`1px solid ${th.headerBorder}`,background:th.headerBg,flexShrink:0,fontFamily:'inherit'}}>
          Suporta até {MAX_FILES} arquivos · Lê páginas do sistema · PDF · Excel · Áudio
        </div>

        {/* Mensagens */}
        <div ref={scrollRef} className="ia-scroll"
          style={{flex:1,overflowY:'auto',padding:'12px 14px',background:th.bg}}>
          {messages.map(msg=>(
            <div key={msg.id} style={{marginBottom:'14px'}}>
              {msg.role==='ia'?(
                <IaMessage msg={msg} isTyping={typingSet.has(msg.id)} onDone={()=>setTypingSet(p=>{const n=new Set(p);n.delete(msg.id);return n;})} th={th}/>
              ):(
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
                  {/* Grid de anexos — quadrados pequenos lado a lado */}
                  <FileAttachmentGrid attachments={msg.attachments} th={th}/>
                  {msg.content&&(
                    <div style={{background:th.userBubble,color:th.userText,borderRadius:'16px 16px 4px 16px',padding:'9px 13px',fontSize:`${fontSize}px`,lineHeight:'1.5',maxWidth:'88%',wordBreak:'break-word',whiteSpace:'pre-wrap',fontFamily:'inherit'}}>
                      {msg.content}
                    </div>
                  )}
                  {msg.time&&<span style={{fontSize:'10px',color:th.textFaint,marginTop:'3px',fontFamily:'inherit'}}>{msg.time}</span>}
                </div>
              )}
            </div>
          ))}

          {/* Painel raciocínio ao vivo */}
          {isChatLoading&&(
            <div style={{marginBottom:'8px'}}>
              <UnifiedReasoningPanel items={liveItems} isLive={isLive} th={th}/>
            </div>
          )}
        </div>

        {/* Grid de arquivos pendentes */}
        <PendingFilesGrid files={pendingFiles} onRemove={i=>setPendingFiles(p=>p.filter((_,idx)=>idx!==i))} th={th}/>

        {/* Input */}
        <div style={{borderTop:`1px solid ${th.border}`,background:th.headerBg,padding:'9px 12px',display:'flex',alignItems:'flex-end',gap:'8px',flexShrink:0}}>
          <button onClick={()=>fileInputRef.current?.click()} disabled={isChatLoading||pendingFiles.length>=MAX_FILES}
            style={{background:'none',border:'none',cursor:pendingFiles.length>=MAX_FILES?'not-allowed':'pointer',padding:'4px',display:'flex',flexShrink:0,position:'relative',color:pendingFiles.length>0?th.brand:th.textFaint,opacity:pendingFiles.length>=MAX_FILES?0.4:1,transition:'color 0.15s'}}>
            <Paperclip size={16}/>
            {pendingFiles.length>0&&<span style={{position:'absolute',top:'-3px',right:'-5px',width:'14px',height:'14px',borderRadius:'50%',background:th.brand,color:th.bg,fontSize:'8px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>{pendingFiles.length}</span>}
          </button>
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_MIME} style={{display:'none'}} onChange={handleFileSelect}/>
          <textarea ref={textareaRef} value={chatInput} onChange={e=>setChatInput(e.target.value)}
            onKeyDown={handleKeyDown} onPaste={handlePaste} disabled={isChatLoading} rows={1}
            placeholder={pendingFiles.length>0?`O que fazer com ${pendingFiles.length===1?'o arquivo':`os ${pendingFiles.length} arquivos`}?`:'Mensagem, pergunta ou arraste arquivos...'}
            style={{flex:1,border:'none',outline:'none',fontSize:`${fontSize}px`,color:th.text,background:'transparent',lineHeight:'1.45',minHeight:'22px',maxHeight:'100px',fontFamily:'inherit',padding:0,opacity:isChatLoading?0.5:1,resize:'none',overflowY:'auto'}}/>
          <button onClick={handleSend} disabled={!canSend}
            style={{width:'32px',height:'32px',borderRadius:'50%',border:'none',background:canSend?th.brand:'transparent',cursor:canSend?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s',border:canSend?'none':`1px solid ${th.border}`}}>
            <Send size={14} style={{color:canSend?th.bg:th.textFaint,marginLeft:'1px'}}/>
          </button>
        </div>
      </div>

      {/* Botão flutuante */}
      <div style={{position:'fixed',zIndex:9998,bottom:'1.5rem',right:'1.5rem',transform:isChatOpen?'scale(0)':'scale(1)',opacity:isChatOpen?0:1,pointerEvents:isChatOpen?'none':'auto',transition:'transform 0.2s,opacity 0.15s'}}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview}/>
      </div>
    </>
  );
}