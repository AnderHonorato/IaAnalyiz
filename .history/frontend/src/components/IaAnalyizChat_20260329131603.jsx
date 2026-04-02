// frontend/src/components/IaAnalyizChat.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Paperclip, X, Plus, ExternalLink,
  FileText, FileSpreadsheet, Music, File, Image as ImageIcon,
  CheckCircle, Sun, Moon, BookOpen, Download, Copy,
  Search, Menu, Monitor, BarChart2, Users, MessageCircle,
  TrendingUp, Edit2, Check, FileCode, Settings, Zap, Globe, Scale,
  Image as ImgIcon, Mic, Video, Lightbulb, Compass, RefreshCw,
  ThumbsUp, ThumbsDown, CornerDownRight, Database, ShieldCheck,
  Terminal, Maximize, Square, Activity, Sparkles
} from 'lucide-react';

import AnalyizStar from './Analyizstar';

const API_BASE_URL = 'http://localhost:3000';
const SESSION_KEYStr = 'analyiz_last_session_id';
const POLL_INITIAL = 8 * 1000;
const POLL_INTERVAL = 2 * 60 * 1000;
const MAX_FILES = 10;

const PESQUISA_WEB_REGEX = /pesquisa|buscar|busca|busque|tendência|concorrente|informações sobre|not[ií]cia|o que [eé]|como funciona|comparar|melhor pre[çc]o|ver pre[çc]o|pre[çc]o de|celular|xiaomi|iphone|samsung|internet|web/i;
const DB_REGEX = /divergen|peso|frete|auditoria|varredura|reincidente|produto|sku|catálogo|estoque|kit|usuário|acesso|aprovar|bloquear|permissão|preço|precific|valor|custo|faturamento|margem|resumo|relatório|métricas|dashboard/i;
const IDENTITY_REGEX = /quem\s+(te\s+|o\s+|)criou|quem\s+(é|foi)\s+(seu|teu|o)\s+(criador|desenvolvedor|autor|pai)|qual\s+(sua|tua)\s+origem|de\s+onde\s+você\s+vem/i;

export const AGENT_CATALOG = {
  pesquisa:    { icon: Globe,        label: 'Pesquisa Web',          color: '#38bdf8' },
  validacao:   { icon: Scale,        label: 'Validador',             color: '#a78bfa' },
  banco:       { icon: Database,     label: 'Dados Internos',        color: '#10b981' },
  seguranca:   { icon: ShieldCheck,  label: 'Segurança',             color: '#f59e0b' },
  programador: { icon: Terminal,     label: 'Agente Programador',    color: '#ef4444' },
  imagem:      { icon: ImgIcon,      label: 'Analisador de Imagem',  color: '#ec4899' },
  video:       { icon: Video,        label: 'Produção de Vídeo',     color: '#8b5cf6' },
  audio:       { icon: Music,        label: 'Processamento de Áudio',color: '#14b8a6' },
  padrao:      { icon: Zap,          label: 'Agente Auxiliar',       color: '#6366f1' },
};

const HEADER_ICONS = {
  image: ImageIcon,
  file: FileText,
  video: Video,
  audio: Music,
  code: FileCode,
  search: Globe,
  chat: MessageCircle,
  list: BookOpen,
  default: Sparkles
};

// ─── UTILITÁRIOS E PARSERS ───────────────────────────────────────────────────

function gerarNomeArquivo(lang, userMessage, index, usedNames) {
  const msg = (userMessage || '').toLowerCase();
  const l = (lang || '').toLowerCase().trim();
  const EXT = { html: 'html', css: 'css', js: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', py: 'py', sql: 'sql', json: 'json', sh: 'sh', bash: 'sh', md: 'md', yaml: 'yaml', yml: 'yaml', xml: 'xml', java: 'java', cs: 'cs', cpp: 'cpp', go: 'go', rs: 'rs', rb: 'rb', php: 'php', swift: 'swift', kt: 'kt', txt: 'txt' };
  const ext = EXT[l] || l || 'txt';
  let base = '';
  const patterns = [
    { regex: /petshop|pet shop/i, name: 'petshop' }, { regex: /landing page/i, name: 'landing_page' },
    { regex: /portfolio/i, name: 'portfolio' }, { regex: /login|auth/i, name: 'login' },
    { regex: /dashboard|painel/i, name: 'dashboard' }, { regex: /restaurante/i, name: 'restaurante' },
  ];
  for (const p of patterns) { if (p.regex.test(msg)) { base = p.name; break; } }
  if (!base) {
    const d = { html: 'pagina', css: 'estilo', js: 'script', jsx: 'componente', tsx: 'componente', ts: 'codigo', py: 'script', sql: 'query', json: 'dados' };
    base = d[l] || 'arquivo';
  }
  let filename = `${base}.${ext}`, attempt = 1;
  while (usedNames && usedNames.has(filename)) { attempt++; filename = `${base}_${attempt}.${ext}`; }
  if (usedNames) usedNames.add(filename);
  return filename;
}

function processTextAndCode(content, userMessage = '') {
  if (!content) return [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parts = [];
  const re = /^[ \t]*```([a-zA-Z0-9_+#.\-]*)[^\S\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$|!\[(.*?)\]\((.*?)\)/gm;
  let match, last = 0;
  while ((match = re.exec(normalized)) !== null) {
    const tb = normalized.substring(last, match.index);
    if (tb.trim()) parts.push({ type: 'text', content: tb });

    if (match[2]) { 
      const lang = (match[1] || '').trim().toLowerCase();
      const code = match[2] || '';
      if (code.trim()) parts.push({ type: 'code', lang: lang || 'txt', content: code.replace(/\n$/, '') });
    } else if (match[4]) { 
      const altText = match[3] || 'imagem';
      const imageUrl = match[4];
      parts.push({ type: 'image', content: imageUrl, alt: altText });
    }
    last = re.lastIndex;
  }
  const rem = normalized.substring(last);
  if (rem.trim()) parts.push({ type: 'text', content: rem });
  return parts;
}

function enrichHTML(h) {
  if (!h) return '';
  let html = h;
  
  // Intercepta e substitui qualquer menção ao Google como criador
  html = html.replace(/(criado|treinado|desenvolvido) (pelo|por) Google/gi, '$1 pelo Anderson Honorato');

  // Markdown padrão
  html = html.replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" class="ia-link">$1</a>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<b class="ia-bold">$1</b>');
  html = html.replace(/\*([^*\n<]+)\*/g, '<i>$1</i>');
  html = html.replace(/`([^`]+)`/g, '<span class="ia-highlight">$1</span>');
  html = html.replace(/(?:^|\n)---(?:\n|$)/g, '<div class="ia-divider"></div>');
  html = html.replace(/(?:^|\n)[\-\*]\s+(.+)/g, '<li class="ia-list-item">$1</li>');
  html = html.replace(/(<li class="ia-list-item">.*?<\/li>)+/gs, match => `<ul class="ia-list">${match}</ul>`);
  
  // Cores personalizadas: ==texto== para fundo, [c:red]texto[/c] para cor de texto
  html = html.replace(/==(.+?)==/g, '<span class="ia-color-bg">$1</span>');
  html = html.replace(/\[c:([a-zA-Z0-9#]+)\](.*?)\[\/c\]/g, '<span style="color:$1; font-weight: 600;">$2</span>');

  html = html.replace(/\n/g, '<br>');
  return html.trim();
}

// ── TEMAS E CONSTANTES ────────────────────────────────────────────────────────
const THEMES = {
  light: { bg: '#ffffff', surface: '#f8fafc', border: '#e2e8f0', text: '#1e293b', textMuted: '#64748b', textFaint: '#94a3b8', brand: '#1e293b', userBubble: '#f0f0f0', userText: '#333', chatAreaBg: '#ffffff', sidebarBg: '#f8fafc', inputAreaBg: '#ffffff', inputBoxBg: '#f1f3f4', inputBoxBorder: '#e8eaed', quickActionBg: '#f1f3f4', quickActionHover: '#e8eaed', codeBg: '#f6f8fa', codeBorder: '#e1e4e8', starDark: false, highlightBg: '#e2e8f0', highlightText: '#1e293b', headerDarkBg: '#f1f5f9', colorBgTag: '#e0e7ff', colorBgText: '#3730a3' },
  dark: { bg: '#000000', surface: '#1e1f20', border: '#3c4043', text: '#e3e3e3', textMuted: '#9aa0a6', textFaint: '#5f6368', brand: '#8ab4f8', userBubble: '#303134', userText: '#e3e3e3', chatAreaBg: '#000000', sidebarBg: '#1e1f20', inputAreaBg: '#000000', inputBoxBg: '#1e1f20', inputBoxBorder: 'transparent', quickActionBg: '#1e1f20', quickActionHover: '#303134', codeBg: '#1a1b1e', codeBorder: '#3c4043', starDark: true, highlightBg: '#282a2c', highlightText: '#e3e3e3', headerDarkBg: '#151617', colorBgTag: '#3730a3', colorBgText: '#e0e7ff' },
};

const WELCOME_MESSAGES = [
  "Por onde começamos hoje?",
  "Pronto para otimizar suas vendas?",
  "Como posso ajudar a escalar seu negócio hoje?",
  "O que vamos analisar primeiro?",
  "Qual desafio vamos resolver agora?"
];

const QUICK_ACTIONS = [
  { icon: BarChart2, label: 'Resumo de Vendas', prompt: 'Me dê um resumo das últimas métricas e faturamento.' },
  { icon: Search,    label: 'Pesquisar Mercado',prompt: 'Gostaria de fazer uma pesquisa de concorrentes no mercado.' },
  { icon: Database,  label: 'Auditar Estoque',  prompt: 'Verifique se há divergências no banco de dados e catálogo.' },
  { icon: Edit2,     label: 'Escrever Descrição',prompt: 'Me ajude a reescrever a descrição de um produto para vender mais.' },
];

const FILE_TYPES = {
  'image/jpeg': { group: 'image', icon: ImageIcon },
  'image/png': { group: 'image', icon: ImageIcon },
  'application/pdf': { group: 'pdf', icon: FileText },
  'text/csv': { group: 'excel', icon: FileSpreadsheet },
  'text/plain': { group: 'txt', icon: FileText },
};
const ACCEPTED_MIME = Object.keys(FILE_TYPES).join(',');
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const GROUP_COLORS = { image: '#3b82f6', pdf: '#ef4444', excel: '#10b981', txt: '#8b5cf6', audio: '#f59e0b', unknown: '#94a3b8' };
function getFileInfo(t) { return FILE_TYPES[t] || { group: 'unknown', icon: File }; }
function deriveTitle(msgs) {
  const f = msgs?.find(m => m.role === 'user' && m.content?.trim());
  if (!f) return 'Nova conversa';
  return f.content.length <= 40 ? f.content : f.content.substring(0, 37) + '…';
}
function detectLang(lang) {
  const m = { js: 'JavaScript', jsx: 'React JSX', ts: 'TypeScript', tsx: 'TypeScript React', py: 'Python', html: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL', sh: 'Shell', bash: 'Shell', yaml: 'YAML', xml: 'XML' };
  return m[lang?.toLowerCase()] || lang?.toUpperCase() || 'Código';
}
function getTime() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function safeTime(v) {
  if (!v) return getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const CHAT_STYLES = (th, fs) => `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono+0;swap');
  @keyframes ia-fade-in  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ia-greeting { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes blur-reveal { 0% { filter: blur(8px); opacity: 0; } 100% { filter: blur(0); opacity: 1; } }

  .ia-chat-root *{box-sizing:border-box;}
  .ia-chat-root{font-family:'Google Sans',Roboto,sans-serif!important;font-size:${fs}px;color:${th.text};}
  .ia-scroll::-webkit-scrollbar{width:4px} .ia-scroll::-webkit-scrollbar-track{background:transparent} .ia-scroll::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px}

  .ia-msg{font-family:'Google Sans',sans-serif!important;font-size:${fs}px;line-height:1.65;color:${th.text};animation:ia-fade-in 0.3s ease;}
  .ia-link{color:#8ab4f8!important;text-decoration:underline;font-weight:500;}
  .ia-bold{font-weight:700;color:${th.text};}
  .ia-highlight{background:${th.highlightBg};color:${th.highlightText};padding:2px 6px;border-radius:6px;font-family:'Google Sans Mono',monospace;font-size:0.9em;font-weight:500;}
  .ia-color-bg{background:${th.colorBgTag};color:${th.colorBgText};padding:2px 6px;border-radius:6px;font-weight:600;}
  
  .ia-list{margin:8px 0;padding-left:24px;list-style-type:disc;}
  .ia-list-item{margin-bottom:4px;}
  .ia-divider{height:1px;background:linear-gradient(90deg,transparent,${th.border},transparent);margin:20px 0;}
  
  .ia-header-ghost{background:${th.chatAreaBg}!important;border-bottom:none!important;position:relative;z-index:10;}
  .ia-header-ghost .ia-header-btn{opacity:0.35;transition:opacity 0.18s ease;}
  .ia-header-ghost:hover .ia-header-btn{opacity:0.75;}
  .ia-msg-area-wrap{position:relative;flex:1;display:flex;flex-direction:column;overflow:hidden;}
  .ia-input-area-ghost{background:${th.inputAreaBg}!important;border-top:none!important;padding-top:4px!important;}
  
  .ia-input-box{background:${th.inputBoxBg}!important;border:1px solid ${th.inputBoxBorder}!important;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;transition:border-color 0.2s,box-shadow 0.2s; min-height:80px;}
  .ia-input-box:focus-within{border-color:rgba(138,180,248,0.45)!important;box-shadow:0 0 0 2px rgba(138,180,248,0.08);}
  .ia-textarea{flex:1;background:transparent;border:none;outline:none;color:${th.text};resize:none;padding:0;font-size:${fs}px;font-family:'Google Sans',sans-serif;max-height:160px;line-height:1.5;}
  .ia-textarea::placeholder{color:${th.textFaint};}

  .ia-think-panel{margin-bottom:8px;}
  .ia-think-header{display:inline-flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:6px 0;font-family:'Google Sans',sans-serif;user-select:none;transition:opacity 0.15s;}
  .ia-think-header:hover{opacity:0.8;}

  .ia-sidebar-panel{width:260px;background:${th.sidebarBg};border-right:1px solid ${th.border};display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;transition:width 0.28s cubic-bezier(0.4,0,0.2,1),opacity 0.22s ease;min-width:260px;}
  .ia-sidebar-panel.closed{width:0;min-width:0;opacity:0;pointer-events:none;}
  .ia-sidebar-item{transition:background 0.12s ease;border-radius:8px;margin:1px 6px;cursor:pointer;}
  .ia-sidebar-item:hover{background:${th.quickActionHover}!important;}
  .ia-sidebar-item:hover .ia-del-btn{opacity:1!important;}

  .ia-code-block{border-radius:10px;overflow:hidden;margin:8px 0;border:1px solid ${th.codeBorder};position:relative;}
  .ia-code-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:${th.codeBg};border-bottom:1px solid ${th.codeBorder};}
  .ia-code-body{background:${th.codeBg};padding:14px;overflow-x:hidden;font-size:${Math.max(11,fs-2)}px;line-height:1.5;color:${th.text};white-space:pre;font-family:'Google Sans Mono',monospace;}
  .ia-code-body::-webkit-scrollbar{display:none;}
  
  .ia-chip{transition:all 0.15s ease;cursor:pointer;}
  .ia-chip:hover{background:${th.quickActionHover}!important;transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,0.1);}
  .ia-fs-msg{max-width:720px;width:100%;margin:0 auto;padding:0 24px;}

  .gemini-pill{display:flex;align-items:center;gap:8px;background:${th.quickActionBg};border:1px solid ${th.border};border-radius:999px;padding:10px 18px;cursor:pointer;transition:all 0.2s;font-size:13px;color:${th.text};font-weight:500;}
  .gemini-pill:hover{background:${th.quickActionHover};transform:translateY(-2px);}

  .action-btn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:transparent;border:none;color:${th.textFaint};cursor:pointer;transition:all 0.15s;}
  .action-btn:hover{background:${th.surface};color:${th.textMuted};}
  .action-btn:disabled{opacity:0.4;cursor:not-allowed;background:transparent!important;color:${th.textFaint}!important;}

  .suggestion-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:${th.surface};border:1px solid ${th.border};border-radius:12px;color:${th.textMuted};font-size:12px;cursor:pointer;transition:all 0.2s;width:fit-content;}
  .suggestion-pill:hover{background:${th.highlightBg};color:${th.text};}
  .suggestion-pill svg{flex-shrink:0; color:#8b5cf6;}
  
  .ia-img-msg { border-radius: 12px; overflow: hidden; margin: 10px 0; border: 1px solid ${th.border}; animation: ia-fade-in 0.3s ease; }
  .ia-img-msg img { width: 100%; height: auto; object-fit: cover; display: block; }
  
  /* Efeito de fade nas palavras */
  .diff-word { display: inline-block; animation: blur-reveal 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; opacity: 0; margin-right: 0.25em; }
`;

// ── COMPONENTE: MOEDA DO AGENTE (Mesmo tamanho e sobreposição) ────────────────
function AgentCoin({ agentTipo, th }) {
  const agent = AGENT_CATALOG[agentTipo] || AGENT_CATALOG.padrao;
  const AgIcon = agent.icon;
  return (
    <div title={agent.label} style={{
      width: '26px', height: '26px', borderRadius: '50%',
      background: th.chatAreaBg, border: `1.5px solid ${agent.color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: agent.color, position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: agent.color, opacity: 0.15 }} />
      <AgIcon size={13} style={{ zIndex: 2 }} />
    </div>
  );
}

// ── HOOKS ─────────────────────────────────────────────────────────────────────
function useThinkingOrchestrator() {
  const [phase, setPhase] = useState('idle');
  const [reasoningLog, setReasoningLog] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isReadyForReply, setIsReadyForReply] = useState(false);
  const [thinkingContext, setThinkingContext] = useState('chat'); 

  const targetTextRef = useRef('');
  const currentTextRef = useRef('');
  const tickRef = useRef(null);
  const processTimerRef = useRef(null);
  const isFinishingRef = useRef(false);

  const reset = useCallback(() => {
    setPhase('idle'); setReasoningLog(''); setElapsedMs(0); setIsOpen(false); setIsReadyForReply(false);
    setThinkingContext('chat'); 
    clearInterval(tickRef.current); clearTimeout(processTimerRef.current);
    targetTextRef.current = ''; currentTextRef.current = ''; isFinishingRef.current = false;
  }, []);

  const processQueue = useCallback(() => {
    if (document.hidden) {
      currentTextRef.current = targetTextRef.current;
      setReasoningLog(currentTextRef.current);
      if (isFinishingRef.current) {
        clearInterval(tickRef.current); setPhase('done'); setIsReadyForReply(true);
      } else {
        processTimerRef.current = setTimeout(processQueue, 150);
      }
      return;
    }

    const remaining = targetTextRef.current.length - currentTextRef.current.length;
    if (remaining > 0) {
      const chunkSize = remaining > 150 ? 12 : (remaining > 50 ? 6 : 2);
      const chunk = targetTextRef.current.substring(currentTextRef.current.length, currentTextRef.current.length + chunkSize);
      currentTextRef.current += chunk;
      setReasoningLog(currentTextRef.current);

      const nextChar = chunk[chunk.length - 1];
      // Se for chat normal, velocidade instantânea. Se for pesquisa/banco, atraso maior.
      const isFast = thinkingContext === 'chat';
      const delay = remaining > 150 ? 0 : (nextChar === '\n' ? (isFast?2:15) : (nextChar === '.' ? (isFast?1:10) : (isFast?0:2)));

      processTimerRef.current = setTimeout(processQueue, delay);
    } else {
      if (isFinishingRef.current) {
        clearInterval(tickRef.current); setPhase('done'); setIsReadyForReply(true);
      } else {
        processTimerRef.current = setTimeout(processQueue, 30);
      }
    }
  }, [thinkingContext]);

  const start = useCallback((context = 'chat') => { 
    reset(); setPhase('thinking'); setIsOpen(false); setIsReadyForReply(false);
    setThinkingContext(context); 
    if (context !== 'chat') {
      tickRef.current = setInterval(() => setElapsedMs(prev => prev + 500), 500);
    }
    processQueue();
  }, [reset, processQueue]);

  const pushChunk = useCallback((text) => { targetTextRef.current += (text || ''); }, []);
  const addReasoningBlock = useCallback((text) => { targetTextRef.current += (text || ''); }, []);
  const updateContext = useCallback((context) => { setThinkingContext(context); }, []);

  const finish = useCallback(() => {
    isFinishingRef.current = true;
    if (currentTextRef.current.length === targetTextRef.current.length) {
      clearInterval(tickRef.current); clearTimeout(processTimerRef.current);
      setPhase('done'); setIsReadyForReply(true);
    }
  }, []);

  return { phase, reasoningLog, elapsedMs, isOpen, setIsOpen, isReadyForReply, thinkingContext, start, finish, reset, pushChunk, addReasoningBlock, updateContext };
}

function ThinkingPanel({ orchestrator, th }) {
  const { phase, reasoningLog, elapsedMs, isOpen, setIsOpen, thinkingContext } = orchestrator;
  // Se for contexto de chat simples (rápido), não exibe o "pensando" longo
  if (phase === 'idle' || thinkingContext === 'chat') return null;
  
  const isFinished = phase === 'done';
  const getDynamicThinkingMessage = () => {
    if (elapsedMs < 3000) return 'Iniciando raciocínio...';
    if (elapsedMs < 6000) { 
      switch (thinkingContext) {
        case 'pesquisa': return 'Buscando informações recentes na web...';
        case 'analise': return 'Acessando e cruzando dados do sistema...';
        default: return 'Processando informações...';
      }
    } 
    return 'Demorando um pouco mais que o normal, terminando de analisar...';
  };

  const label = isFinished ? `Raciocínio concluído` : getDynamicThinkingMessage();

  return (
    <div className="ia-think-panel" style={{ marginLeft: '40px', marginTop: '4px' }}>
      <button className="ia-think-header" onClick={() => setIsOpen(v => !v)}>
        <Lightbulb size={16} style={{ color: th.textFaint, zIndex: 2, background: th.chatAreaBg }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: th.text }}>{label}</span>
        {isOpen ? <ChevronUp size={14} style={{ color: th.textFaint }} /> : <ChevronDown size={14} style={{ color: th.textFaint }} />}
      </button>
      <div style={{
        overflow: 'hidden', maxHeight: isOpen ? '5000px' : '0px', opacity: isOpen ? 1 : 0,
        transition: 'max-height 0.4s ease, opacity 0.3s ease', marginLeft: '7px', borderLeft: `2px solid ${th.border}`,
        paddingLeft: '16px', marginTop: '-8px'
      }}>
        <div style={{ paddingTop: '16px', paddingBottom: '8px', fontSize: '13px', color: th.textMuted, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Google Sans', sans-serif" }}>
          <SafeHTMLMsg html={enrichHTML(reasoningLog)} />
        </div>
      </div>
    </div>
  );
}

function MessageFooter({ msg, th, onRegenerate, onFollowUp }) {
  const [feedback, setFeedback] = useState(null);
  const [showFeedbackBox, setShowFeedbackBox] = useState(false);
  const [comment, setComment] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  const dicas = msg.suggestions || [];

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content.replace(/<[^>]+>/g, ''));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedbackClick = (isLike) => {
    if (isSubmitted) return;
    setFeedback(isLike); setShowFeedbackBox(true);
  };

  const enviarParaBackend = async (isLike, text) => {
    setIsSubmitted(true); setShowFeedbackBox(false); setShowThankYou(true);
    setTimeout(() => setShowThankYou(false), 3000);
    try {
      const user = JSON.parse(localStorage.getItem('analyiz_user') || '{}');
      if (!user.id) return;
      await fetch(`${API_BASE_URL}/api/ia/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, mensagemId: msg.id, isPositive: isLike, comentario: text }) });
    } catch { }
  };

  return (
    <div style={{ marginTop: '12px', marginLeft: '40px' }}>
      {dicas.length > 0 && !isSubmitted && !showFeedbackBox && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {dicas.map((dica, idx) => (
            <button key={idx} className="suggestion-pill" onClick={() => onFollowUp(dica)}>
              <Sparkles size={13} /><span>{dica}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button className="action-btn" title="Gerar novamente" onClick={onRegenerate} disabled={isSubmitted}><RefreshCw size= {15}/></button>
        <button className="action-btn" title="Copiar" onClick={handleCopy}>{copied ? <Check size={15} style={{ color: '#10b981' }} /> : <Copy size={15} />}</button>
        <div style={{ width: '1px', height: '16px', background: th.border, margin: '0 8px' }}></div>
        <button className="action-btn" title="Gostei" onClick={() => handleFeedbackClick(true)} disabled={isSubmitted}>
          <ThumbsUp size={15} style={{ fill: feedback === true ? th.textMuted : 'transparent' }} />
        </button>
        <button className="action-btn" title="Não gostei" onClick={() => handleFeedbackClick(false)} disabled={isSubmitted}>
          <ThumbsDown size={15} style={{ fill: feedback === false ? th.textMuted : 'transparent', marginTop: '2px' }} />
        </button>
        {showThankYou && <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginLeft: '8px' }}>Obrigado pelo feedback!</span>}
      </div>

      {showFeedbackBox && (
        <div style={{ marginTop: '12px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: '12px', padding: '12px', maxWidth: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: th.text }}>Deixe um comentário (opcional)</span>
            <button onClick={() => enviarParaBackend(feedback, '')} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="O que achou da resposta?" style={{ width: '100%', minHeight: '60px', background: 'transparent', border: `1px solid ${th.border}`, borderRadius: '8px', padding: '8px', color: th.text, fontSize: '12px', outline: 'none', resize: 'none' }}/>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button onClick={() => enviarParaBackend(feedback, comment)} style={{ background: th.brand, color: th.bg, border: 'none', padding: '6px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Enviar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SafeHTMLMsg({ html }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll('a[href^="http"]').forEach(a => {
      a.classList.add('ia-link'); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [html]);
  return <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} style={{ wordBreak: 'break-word' }} />;
}

// Fade Smooth e Rápido no lugar do Scramble caótico
function DiffusionText({ html, onDoneRef }) {
  const [renderedHtml, setRenderedHtml] = useState('');

  useEffect(() => {
    let mounted = true;
    
    if (document.hidden) {
      setRenderedHtml(html);
      setTimeout(() => onDoneRef?.current?.(), 0);
      return;
    }

    // Separa o HTML em palavras/tags mantendo a estrutura
    const parts = html.split(/([ \n]|<[^>]+>)/g).filter(Boolean);
    let currentHtml = '';
    let idx = 0;

    const iv = setInterval(() => {
      if (!mounted) return;
      if (idx >= parts.length) {
        clearInterval(iv);
        setRenderedHtml(html);
        setTimeout(() => onDoneRef?.current?.(), 0);
        return;
      }

      const part = parts[idx];
      // Se for texto normal, aplica o fade
      if (!part.startsWith('<') && part.trim() !== '') {
        const delay = (idx % 3) * 0.05; // Pequena variação para não ficar mecânico
        currentHtml += `<span class="diff-word" style="animation-delay: ${delay}s">${part}</span>`;
      } else {
        currentHtml += part;
      }
      
      setRenderedHtml(currentHtml);
      idx++;
    }, 15); // Intervalo muito rápido

    return () => { mounted = false; clearInterval(iv); };
  }, [html, onDoneRef]);

  return <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}

function InlineCodeBlock({ lang, code, th, onOpenSidePanel, filename }) {
  const [copied, setCopied] = useState(false);
  const label = detectLang(lang);
  const handleCopy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  return (
    <div className="ia-code-block" style={{ marginLeft: '40px' }}>
      <div className="ia-code-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileCode size={14} style={{ color: th.brand }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: th.text, fontFamily: "'Google Sans Mono',monospace" }}>{filename}</span>
        </div>
        <button onClick={handleCopy} style={{ background: 'none', border: 'none', color: copied ? '#10b981' : th.textFaint, cursor: 'pointer', padding: '3px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
          {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <div className="ia-code-body" style={{ maxHeight: '180px' }}>{code}</div>
        <div className="ia-code-fade-overlay">
          <button onClick={() => onOpenSidePanel({ lang, code, filename })} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: th.chatAreaBg, color: th.text, border: `1px solid ${th.border}`, borderRadius: '16px', padding: '8px 16px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <Maximize size={14} style={{ color: th.brand }} /> Expandir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL DA MENSAGEM DA IA
function IaMessage({ msg, isTyping, onDone, th, onOpenSidePanel, fontSize, userMessage, handleSend }) {
  const parts = processTextAndCode(msg.content, userMessage || '');
  const onDoneRef = useRef(onDone);
  const [animationsEnabled] = useState(() => localStorage.getItem('analyiz_anim') !== 'false');

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const HeaderIcon = HEADER_ICONS[msg.headerIcon] || HEADER_ICONS['default'];
  const isSpecialHeader = !!msg.headerTitle;

  return (
    <div className="ia-msg" style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '20px' }}>
      
      {/* LINHA 1: Ícone(s) e Cabeçalho de Processo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', width: '26px' }}>
          <div style={{ zIndex: 20 }}>
            <AnalyizStar size={26} active={false} dark={th.starDark}/>
          </div>
          {msg.agents && msg.agents.length > 0 && (
            <div style={{ display: 'flex', marginLeft: '-12px' }}>
              {msg.agents.map((ag, idx) => (
                <div key={idx} style={{ marginLeft: idx === 0 ? '0px' : '-12px', zIndex: 19 - idx }}>
                  <AgentCoin agentTipo={ag} th={th} />
                </div>
              ))}
            </div>
          )}
        </div>
        
        {isSpecialHeader && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: th.headerDarkBg, padding: '8px 14px', borderRadius: '12px', border: `1px solid ${th.border}` }}>
             <HeaderIcon size={15} color="#a855f7" />
             <span style={{ fontSize: '13px', fontWeight: 600, color: th.text }}>{msg.headerTitle}</span>
          </div>
        )}
      </div>

      {/* LINHA 2: Conteúdo Limpo sem Fundo */}
      <div style={{ marginTop: isSpecialHeader ? '12px' : '-20px', marginLeft: '40px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {parts.filter(p => p.type === 'text').map((part, i, textParts) => {
          const enriched = enrichHTML(part.content);
          const isLastTextBlock = i === textParts.length - 1;
          
          return enriched ? (
            <div key={`text-${i}`} style={{ fontSize: `${fontSize}px`, lineHeight: '1.65', color: th.text }}>
              {(isTyping && msg.isLastInSequence && isLastTextBlock && animationsEnabled) ? <DiffusionText html={enriched} onDoneRef={onDoneRef} /> : <SafeHTMLMsg html={enriched} />}
            </div>
          ) : null;
        })}

        {/* BLOCOS ESPECIAIS: Códigos e Imagens */}
        {parts.filter(p => p.type === 'code' || p.type === 'image').map((part, i) => {
          if (part.type === 'code') {
            const _usedNames = new Set();
            const filename = gerarNomeArquivo(part.lang, userMessage || msg.userMessage || '', i, _usedNames);
            return <InlineCodeBlock key={`code-${i}`} lang={part.lang} code={part.content} th={th} onOpenSidePanel={onOpenSidePanel} filename={filename} />;
          } else if (part.type === 'image') {
            return (
              <div key={`img-${i}`} className="ia-img-msg">
                <img src={part.content} alt={part.alt} />
              </div>
            );
          }
          return null;
        })}
      </div>

      {/* Rodapé e Sugestões apenas se for a última mensagem da sequência */}
      {msg.isLastInSequence && !isTyping && (
        <MessageFooter msg={msg} th={th} onRegenerate={() => handleSend(userMessage)} onFollowUp={(dica) => handleSend(dica)} />
      )}
    </div>
  );
}

function WelcomeScreenGeminiStyle({ th, userName, onQuickAction, chatInput, setChatInput, handleSend, handleStopLoading, handleKeyDown, handlePaste, isChatLoading, pendingFiles, setPendingFiles, fileInputRef, canSend }) {
  const nomeDisplay = userName || 'Anderson';
  const [welcomeMsg] = useState(() => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px', animation: 'ia-greeting 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <AnalyizStar size={48} active={false} dark={th.starDark} />
        </div>
        <h1 style={{ fontSize: '36px', fontWeight: 600, margin: '0 0 8px 0', background: 'linear-gradient(to right, #a855f7, #ec4899, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Olá, {nomeDisplay}
        </h1>
        <h2 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: th.textFaint }}>{welcomeMsg}</h2>
      </div>
      <div style={{ width: '100%', maxWidth: '800px', animation: 'ia-fade-in 0.8s ease both' }}>
        <InputBox th={th} fontSize={15} chatInput={chatInput} setChatInput={setChatInput} handleSend={handleSend} handleStopLoading={handleStopLoading} handleKeyDown={handleKeyDown} handlePaste={handlePaste} isChatLoading={isChatLoading} pendingFiles={pendingFiles} setPendingFiles={setPendingFiles} fileInputRef={fileInputRef} canSend={canSend} isFullscreen={true}/>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
          {QUICK_ACTIONS.map((action, i) => {
            const Icon = action.icon;
            return (
              <button key={i} className="gemini-pill" onClick={() => onQuickAction(action.prompt)}>
                <Icon size={16} style={{ color: action.color || th.brand }} /> {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InputBox({ th, fontSize, chatInput, setChatInput, handleSend, handleKeyDown, handlePaste, isChatLoading, handleStopLoading, pendingFiles, setPendingFiles, fileInputRef, canSend, isFullscreen }) {
  const taRef = useRef(null);
  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
  }, [chatInput]);
  const placeholder = pendingFiles.length > 0 ? `O que fazer com ${pendingFiles.length === 1 ? 'o arquivo' : `os ${pendingFiles.length} arquivos`}?` : 'Peça a Inteligência...';

  return (
    <div className="ia-input-area-ghost" style={{ padding: isFullscreen ? '8px 24px 20px' : '4px 14px 14px' }}>
      <div style={{ maxWidth: isFullscreen ? '800px' : '100%', margin: '0 auto' }}>
        <div className="ia-input-box" style={{ background: th.chatAreaBg === '#000000' ? '#1e1f20' : th.inputBoxBg }}>
          {pendingFiles.length > 0 && <PendingFilesGrid files={pendingFiles} onRemove={i => setPendingFiles(p => p.filter((_, idx) => idx !== i))} th={th} />}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flex: 1 }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={pendingFiles.length >= MAX_FILES} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: pendingFiles.length >= MAX_FILES ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', paddingBottom: '2px' }}><Plus size={20} /></button>
            <textarea ref={taRef} className="ia-textarea" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} rows={1} placeholder={placeholder} style={{ fontSize: '15px', paddingBottom: '4px', paddingTop: '4px' }} />
            <button style={{ background: 'none', border: 'none', color: th.textFaint, padding: '4px', cursor: 'pointer', paddingBottom: '2px' }}><Mic size={20} /></button>
            {isChatLoading ? (
              <button onClick={handleStopLoading} style={{ background: th.text, color: th.bg, border: 'none', borderRadius: '10px', width: '34px', height: '34px', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'all 0.15s' }}><Square size={13} fill="currentColor" strokeWidth={0} /></button>
            ) : (
              <button onClick={() => handleSend()} disabled={!canSend} style={{ background: canSend ? th.text : 'transparent', color: canSend ? th.bg : th.textFaint, border: 'none', borderRadius: '50%', width: '34px', height: '34px', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: canSend ? 'pointer' : 'default', transition: 'all 0.15s' }}><Send size={15} style={{ marginLeft: '2px' }} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingButton({ onClick, hasUnread, shortPreview, th }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      {hasUnread && shortPreview && (
        <div onClick={onClick} style={{ background: th.brand, color: th.bg, fontSize: '12px', fontWeight: 500, padding: '8px 12px', borderRadius: '12px 12px 12px 4px', maxWidth: '240px', lineHeight: '1.4', boxShadow: '0 2px 12px rgba(0,0,0,0.2)', animation: 'ia-fade-in 0.3s ease', cursor: 'pointer', wordBreak: 'break-word' }}>
          {shortPreview}
        </div>
      )}
      <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{ display: 'flex', alignItems: 'center', borderRadius: '999px', border: `1px solid ${th.border}`, outline: 'none', background: th.chatAreaBg, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', width: hovered ? '172px' : '62px', height: '62px', transition: 'width 0.28s cubic-bezier(0.34,1.2,0.64,1)', padding: 0, overflow: 'hidden' }}>
        <span style={{ width: '62px', height: '62px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: th.chatAreaBg, order: 1, zIndex: 2 }}><AnalyizStar size={44} active={false} dark={th.starDark} /></span>
        <span style={{ color: th.text, fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', paddingRight: '20px', paddingLeft: '4px', order: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.18s', pointerEvents: 'none' }}>Assistente</span>
      </button>
    </div>
  );
}

function EditableUserMessage({ msg, th, fontSize, onSendEdit }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);
  return (
    <div className="ia-msg-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '16px' }}>
      <FileAttachmentGrid attachments={msg.attachments} th={th}/>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-start' }}>
        {!editing && msg.content && (
          <div style={{ maxWidth: '88%' }}>
            <div style={{ background: th.userBubble, color: th.userText, padding: '12px 16px', borderRadius: '18px 18px 4px 18px', fontSize: `${fontSize}px`, lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Google Sans',sans-serif" }}>{msg.content}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function IaAnalyizChat({ isChatOpen, toggleChat, userRole, pageBaseUrl }) {
  const [darkMode, setDMState] = useState(() => { try { return localStorage.getItem('analyiz_darkmode') === 'true'; } catch { return true; } });
  const [fontSize, setFSState] = useState(() => { try { return parseInt(localStorage.getItem('analyiz_fontsize') || '15'); } catch { return 15; } });
  const [animationsEnabled, setAnimState] = useState(() => { try { return localStorage.getItem('analyiz_anim') !== 'false'; } catch { return true; } });
  const [autoScrollOn, setAutoScrollOn] = useState(() => { try { return localStorage.getItem('analyiz_autoscroll') !== 'false'; } catch { return true; } });

  const setDarkMode = v => { setDMState(v); localStorage.setItem('analyiz_darkmode', String(v)); };
  const setFontSize = v => { setFSState(v); localStorage.setItem('analyiz_fontsize', String(v)); };
  const toggleAnim = () => { setAnimState(!animationsEnabled); localStorage.setItem('analyiz_anim', String(!animationsEnabled)); };
  const toggleScrollPref = () => { setAutoScrollOn(!autoScrollOn); localStorage.setItem('analyiz_autoscroll', String(!autoScrollOn)); setAutoScrollAtivo(!autoScrollOn); };

  const th = THEMES[darkMode ? 'dark' : 'light'];

  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [shortPreview, setShortPreview] = useState('');
  const [sidePanelContent, setSidePanelContent] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [searchSession, setSearchSession] = useState('');
  const [typingSet, setTypingSet] = useState(new Set());
  const [autoScrollAtivo, setAutoScrollAtivo] = useState(true);

  const [currentMessageAgents, setCurrentMessageAgents] = useState([]);

  const scrollRef = useRef(null);
  const abortControllerRef = useRef(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (autoScrollOn) {
      setAutoScrollAtivo(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  const thinking = useThinkingOrchestrator();

  const [userId] = useState(() => { try { return JSON.parse(localStorage.getItem('analyiz_user'))?.id; } catch { return null; } });
  const [userName] = useState(() => { try { const u = JSON.parse(localStorage.getItem('analyiz_user')); return u?.nome || u?.name || 'Anderson'; } catch { return 'Anderson'; } });
  const [currentSessionId, setCurrentSessionId] = useState(() => { try { return parseInt(localStorage.getItem(SESSION_KEYStr)); } catch { return null; } });

  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current && autoScrollAtivo && autoScrollOn) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isChatLoading, thinking.reasoningLog, typingSet, autoScrollAtivo, autoScrollOn]);

  const carregarSessions = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`);
      const data = await r.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch { setSessions([]); }
  }, [userId]);

  useEffect(() => {
    if (currentSessionId && userId) {
      localStorage.setItem(SESSION_KEYStr, String(currentSessionId));
      fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`)
        .then(r => r.json())
        .then(msgs => {
          if (Array.isArray(msgs)) {
            setMessages(msgs.map(m => ({ 
              role: m.role, id: String(m.id), content: m.content, time: safeTime(m.createdAt), 
              reasoning: m.reasoning || '', agents: m.agents || [], isLastInSequence: true 
            })));
          } else { setMessages([]); }
        }).catch(() => setMessages([]));
    } else { setMessages([]); }
  }, [currentSessionId, userId]);

  const ensureSession = useCallback(async () => {
    if (currentSessionId) return currentSessionId;
    if (!userId) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      const s = await res.json();
      if (s && s.id) { setCurrentSessionId(s.id); return s.id; }
      return null;
    } catch { return null; }
  }, [userId, currentSessionId]);

  const handleStopLoading = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setIsChatLoading(false);
    thinking.finish();
    setCurrentMessageAgents([]);
  };

  const handleSend = async (overrideInput) => {
    const userMsg = (overrideInput !== undefined ? overrideInput : chatInput).trim();
    if ((!userMsg && !pendingFiles.length) || isChatLoading) return;
    setAutoScrollAtivo(true);

    if (IDENTITY_REGEX.test(userMsg) && !pendingFiles.length) {
      const uId = 'u-id-' + Date.now(), iId = 'ia-id-' + Date.now();
      setChatInput('');
      const identityHtml = `Eu fui desenvolvida pelo meu criador, <b>Anderson Honorato</b>.`;
      setMessages(p => [...p, { role: 'user', content: userMsg, time: getTime(), id: uId }, { role: 'ia', content: identityHtml, time: getTime(), id: iId, isLastInSequence: true }]);
      setTypingSet(prev => new Set(prev).add(iId)); 
      return;
    }

    const isPesquisaMercado = PESQUISA_WEB_REGEX.test(userMsg);
    const isConsultaBanco = DB_REGEX.test(userMsg) && !isPesquisaMercado;

    setMessages(p => [...p, { role: 'user', content: userMsg, time: getTime(), id: `u-${Date.now()}` }]);
    setChatInput(''); setPendingFiles([]); setIsChatLoading(true);
    setCurrentMessageAgents([]);

    if (isPesquisaMercado) {
        thinking.start('pesquisa');
        setCurrentMessageAgents(['pesquisa']);
    } else if (isConsultaBanco) {
        thinking.start('analise');
        setCurrentMessageAgents(['banco']);
    } else {
        thinking.start('chat');
    }

    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;

    try {
      const sid = await ensureSession();
      let endpoint = `${API_BASE_URL}/api/ia/chat/stream`;
      let bodyData = { message: userMsg, sessionId: sid, userId, userRole };

      if (isPesquisaMercado) {
        endpoint = `${API_BASE_URL}/api/ml/research/deep-market`;
        bodyData = { userId, itens: [userMsg], perguntaFollowUp: userMsg, contextoAnterior: '' };
      }

      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData), signal: ctrl.signal });
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      let isDoneEventFired = false;

      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop();
        let ev = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) ev = line.slice(7).trim();
          else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const eventType = data.action || data.type || data.evento || ev;

              if (eventType === 'reasoning_chunk') { thinking.pushChunk(data.text); }
              else if (eventType === 'agent_start') {
                setCurrentMessageAgents(p => Array.from(new Set([...p, data.agente])));
              }
              else if (eventType === 'done' || ev === 'done') {
                isDoneEventFired = true;
                
                let repliesToProcess = [];
                if (data.replies && Array.isArray(data.replies)) {
                  repliesToProcess = data.replies;
                } else {
                  let rawText = data.conteudoHtml || data.resumo || data.reply || '✅ Processado.';
                  
                  // Se o backend nao mandar array, forçamos um array de 1 item (mensagem única)
                  repliesToProcess = [{ content: rawText, headerIcon: data.headerIcon, headerTitle: data.headerTitle, suggestions: data.suggestions || [] }];
                }

                // Encadeamento sequencial assíncrono (Igual ao Vídeo)
                (async () => {
                    for (let idx = 0; idx < repliesToProcess.length; idx++) {
                        if (abortControllerRef.current?.signal.aborted) break;
                        const r = repliesToProcess[idx];
                        const iaIdPart = `ia-${Date.now()}-${idx}`;
                        const isLast = idx === repliesToProcess.length - 1;

                        setMessages(p => [...p, {
                            role: 'ia',
                            content: r.content,
                            headerIcon: r.headerIcon,
                            headerTitle: r.headerTitle,
                            suggestions: r.suggestions || [],
                            reasoning: idx === 0 ? (data.reasoning || '') : '',
                            time: getTime(),
                            id: iaIdPart,
                            userMessage: userMsg,
                            agents: idx === 0 ? currentMessageAgents : [],
                            isLastInSequence: isLast
                        }]);
                        setTypingSet(prev => new Set(prev).add(iaIdPart));

                        // Delay só se houver mais mensagens (1.8s)
                        if (!isLast) await new Promise(res => setTimeout(res, 1800));
                    }
                    setIsChatLoading(false);
                    setCurrentMessageAgents([]);
                    carregarSessions();
                })();
              }
            } catch { }
            ev = null;
          }
        }
      }
      
      if (!isDoneEventFired) { setIsChatLoading(false); setCurrentMessageAgents([]); }
      thinking.finish();
    } catch (e) {
      thinking.finish();
      if (e.name !== 'AbortError') {
        setMessages(p => [...p, { role: 'ia', content: 'Tive um pequeno tropeço aqui. Pode tentar novamente?', time: getTime(), id: `err-${Date.now()}`, isLastInSequence: true }]);
      }
      setIsChatLoading(false);
      setCurrentMessageAgents([]);
    }
  };

  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleNewSession = () => { setCurrentSessionId(null); setMessages([]); setSidePanelContent(null); thinking.reset(); setCurrentMessageAgents([]); localStorage.removeItem(SESSION_KEYStr); };
  const loadSession = id => { setCurrentSessionId(id); setSidebarOpen(false); };
  
  const isNewSession = messages.length === 0 && thinking.phase === 'idle';
  const conversationTitle = deriveTitle(messages);
  const canSend = (chatInput.trim() || pendingFiles.length > 0) && !isChatLoading;
  const chatBaseW = isExpanded ? 600 : 400;
  const totalW = isFullscreen ? '100vw' : `${chatBaseW + (sidebarOpen ? 260 : 0)}px`;
  const H = isFullscreen ? '100vh' : isExpanded ? '85vh' : 'calc(100vh - 5rem)';
  const B = isFullscreen ? '0' : '1.5rem';
  const R = isFullscreen ? '0' : '1.5rem';
  const Radius = isFullscreen ? '0' : '20px';

  const handleDragOver = useCallback(e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(e => { e.preventDefault(); if (!dropRef.current?.contains(e.relatedTarget)) setIsDragging(false); }, []);
  const handleDrop = useCallback(async e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handlePaste = useCallback(async e => { e.preventDefault(); }, []);
  const handleFileSelect = useCallback(async e => { e.preventDefault(); }, []);

  return (
    <>
      <style>{CHAT_STYLES(th, fontSize)}</style>
      
      <div className="ia-chat-root" ref={dropRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{ position: 'fixed', zIndex: 99998, bottom: B, right: isFullscreen && sidePanelContent ? '38%' : R, width: isFullscreen ? (sidePanelContent ? '62%' : '100%') : totalW, height: H, maxHeight: isFullscreen ? 'none' : 'calc(100vh - 3rem)', background: th.chatAreaBg, borderRadius: Radius, boxShadow: isDragging ? '0 4px 32px rgba(99,102,241,0.25),0 0 0 2px #6366f1' : '0 4px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'row', overflow: 'hidden', transform: isChatOpen ? 'scale(1)' : 'scale(0)', transformOrigin: 'bottom right', opacity: isChatOpen ? 1 : 0, pointerEvents: isChatOpen ? 'auto' : 'none', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', border: isDragging ? '2px dashed #6366f1' : `1px solid ${th.border}` }}>

        {/* Sidebar */}
        <div className={`ia-sidebar-panel${sidebarOpen ? '' : ' closed'}`}>
          <div style={{ padding: '14px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }}><X size={16} /></button>
          </div>
          <div style={{ padding: '0 10px 8px', flexShrink: 0 }}>
            <button onClick={handleNewSession} style={{ width: '100%', padding: '9px 12px', background: th.quickActionBg, border: `1px solid ${th.border}`, borderRadius: '10px', color: th.text, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', transition: 'all 0.15s' }}><Plus size={15} /> Nova conversa</button>
          </div>
          <div className="ia-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
            {(Array.isArray(sessions) ? sessions : []).map(s => (
              <div key={s.id} onClick={() => loadSession(s.id)} className="ia-sidebar-item" style={{ padding: '9px 10px', display: 'flex', alignItems: 'center', gap: '8px', background: s.id === currentSessionId ? th.quickActionBg : 'transparent' }}>
                <MessageSquare size={13} style={{ color: th.textFaint, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: th.text }}>{s.titulo || 'Conversa'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          <div className="ia-header-ghost" style={{ padding: isFullscreen ? '12px 20px' : '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="ia-header-btn" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}><Menu size={20} /></button>
              <AnalyizStar size={30} active={isChatLoading} dark={th.starDark} />
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0, padding: '0 8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: th.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>{conversationTitle}</span>
            </div>
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              <button className="ia-header-btn" onClick={() => setIsFullscreen(!isFullscreen)} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>{isFullscreen ? <Minimize2 size={16} /> : <Monitor size={16} />}</button>
              <button className="ia-header-btn" onClick={toggleChat} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}><Minus size={16} /></button>
            </div>
          </div>

          <div className="ia-msg-area-wrap">
            <div ref={scrollRef} onScroll={handleScroll} className="ia-scroll" style={{ flex: 1, overflowY: 'auto', background: th.chatAreaBg, display: 'flex', flexDirection: 'column' }}>

              {isNewSession && (
                <WelcomeScreenGeminiStyle th={th} userName={userName} chatInput={chatInput} setChatInput={setChatInput} handleSend={handleSend} handleStopLoading={handleStopLoading} handleKeyDown={handleKeyDown} handlePaste={handlePaste} isChatLoading={isChatLoading} pendingFiles={pendingFiles} setPendingFiles={setPendingFiles} fileInputRef={fileInputRef} canSend={canSend} isFullscreen={true}/>
              )}

              {!isNewSession && (
                <div style={{ flex: 1, padding: isFullscreen ? '24px 0' : '12px 14px 6px', display: 'flex', flexDirection: 'column' }}>

                  {messages.map(msg => (
                    <div key={msg.id} className={isFullscreen ? 'ia-fs-msg' : ''}>
                      {msg.role === 'ia' ? (
                        <IaMessage msg={msg} isTyping={typingSet.has(msg.id)} onDone={() => setTypingSet(p => { const n = new Set(p); n.delete(msg.id); return n; })} th={th} onOpenSidePanel={setSidePanelContent} fontSize={fontSize} handleSend={handleSend} />
                      ) : (
                        <EditableUserMessage msg={msg} th={th} fontSize={fontSize} />
                      )}
                    </div>
                  ))}

                  {isChatLoading && (
                    <div className={isFullscreen ? 'ia-fs-msg' : ''}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                          <div style={{ zIndex: 20 }}><AnalyizStar size={26} active={true} dark={th.starDark}/></div>
                          {currentMessageAgents.length > 0 && (
                            <div style={{ display: 'flex', marginLeft: '-12px' }}>
                              {currentMessageAgents.map((ag, idx) => (
                                <div key={idx} style={{ marginLeft: idx === 0 ? '0px' : '-12px', zIndex: 19 - idx }}>
                                  <AgentCoin agentTipo={ag} th={th} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}><ThinkingPanel orchestrator={thinking} th={th}/></div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>

          {!isNewSession && (
            <>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_MIME} style={{ display: 'none' }}/>
              <InputBox th={th} fontSize={fontSize} chatInput={chatInput} setChatInput={setChatInput} handleSend={handleSend} handleStopLoading={handleStopLoading} handleKeyDown={handleKeyDown} handlePaste={handlePaste} isChatLoading={isChatLoading} pendingFiles={pendingFiles} setPendingFiles={setPendingFiles} fileInputRef={fileInputRef} canSend={canSend} isFullscreen={isFullscreen} />
            </>
          )}
        </div>
      </div>

      <div style={{ position: 'fixed', zIndex: 9998, bottom: '1.5rem', right: '1.5rem', transform: isChatOpen ? 'scale(0)' : 'scale(1)', opacity: isChatOpen ? 0 : 1, pointerEvents: isChatOpen ? 'none' : 'auto', transition: '0.2s' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview} th={th}/>
      </div>
    </>
  );
}