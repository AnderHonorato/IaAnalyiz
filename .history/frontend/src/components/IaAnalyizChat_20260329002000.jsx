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
  Terminal, Maximize, Square, Activity
} from 'lucide-react';

import AnalyizStar from './Analyizstar';

const API_BASE_URL = 'http://localhost:3000';
const SESSION_KEYStr = 'analyiz_last_session_id';
const POLL_INITIAL = 8 * 1000;
const POLL_INTERVAL = 2 * 60 * 1000;
const MAX_FILES = 10;

const IDENTITY_REGEX = /quem (te |o |)criou|quem (é|foi) (seu|teu|o) (criador|desenvolvedor|autor)|qual (ia|inteligência artificial|modelo|llm|ai)\b|você (é|usa|roda|é baseado).*(google|gemini|gpt|claude|openai|anthropic|chatgpt|llama|mistral)|foi (criado|desenvolvido|feito|treinado) (por|pelo|pela)/i;
const PESQUISA_WEB_REGEX = /pesquisa|buscar|busca|busque|tendência|concorrente|informações sobre|not[ií]cia|o que [eé]|como funciona|comparar|melhor pre[çc]o|ver pre[çc]o|pre[çc]o de|celular|xiaomi|iphone|samsung|internet|web/i;
const DB_REGEX = /divergen|peso|frete|auditoria|varredura|reincidente|produto|sku|catálogo|estoque|kit|usuário|acesso|aprovar|bloquear|permissão|preço|precific|valor|custo|faturamento|margem|resumo|relatório|métricas|dashboard/i;

export const AGENT_CATALOG = {
  pesquisa:    { icon: Globe,        label: 'Pesquisa Web',          color: '#38bdf8' },
  validacao:   { icon: Scale,        label: 'Validador',             color: '#a78bfa' },
  banco:       { icon: Database,     label: 'Dados Internos',        color: '#10b981' },
  seguranca:   { icon: ShieldCheck,  label: 'Segurança',             color: '#f59e0b' },
  programador: { icon: Terminal,     label: 'Agente Programador',    color: '#ef4444' },
  imagem:      { icon: ImgIcon,      label: 'Design de Imagem',      color: '#ec4899' },
  video:       { icon: Video,        label: 'Produção de Vídeo',     color: '#8b5cf6' },
  audio:       { icon: Music,        label: 'Processamento de Áudio',color: '#14b8a6' },
  padrao:      { icon: Zap,          label: 'Agente Auxiliar',       color: '#6366f1' },
};

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────

// QUEBRA INTELIGENTE DE BALÕES - Ignora quebras dentro de blocos de código
function splitIntoChatBubbles(text) {
  if (!text) return [];
  const blocks = [];
  let inCode = false;
  let currentBlock = [];
  
  // Normaliza as quebras
  const normalized = text.replace(/<br\s*\/?>/gi, '\n');
  const lines = normalized.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
    }
    
    // Corta o balão se achar linha em branco fora de bloco de código
    if (!inCode && line.trim() === '') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
    } else {
      currentBlock.push(line);
    }
  }
  
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }
  
  return blocks.filter(b => b.trim() !== '');
}

function extrairMLBIdDaMensagem(msg) {
  const mId = msg.match(/\b(MLB[-]?\d+)\b/i);
  if (mId) return mId[1].toUpperCase().replace('-', '');
  const mUrl = msg.match(/mercadolivre\.com\.br[^\s]*?MLB[-]?(\d+)/i);
  if (mUrl) return `MLB${mUrl[1]}`;
  return null;
}

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

    if (match[2]) { // Code
      const lang = (match[1] || '').trim().toLowerCase();
      const code = match[2] || '';
      if (code.trim()) parts.push({ type: 'code', lang: lang || 'txt', content: code.replace(/\n$/, '') });
    } else if (match[4]) { // Image
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

function extrairDicas(texto) {
  if (!texto || texto.length < 20) return [];
  const limpo = texto.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const TEMAS = [
    { regex: /divergên|peso|frete|auditoria|reincidente/i, sugestoes: ['Posso ver o detalhamento por produto?', 'Quais têm maior impacto financeiro?'] },
    { regex: /produto|sku|catálogo|kit/i, sugestoes: ['Listar produtos sem peso cadastrado', 'Ver produtos desvinculados do ML'] },
    { regex: /usuário|acesso|bloqueio|aprovação/i, sugestoes: ['Quem está aguardando aprovação?', 'Ver histórico de acessos recentes'] },
    { regex: /preço|precif|margem|custo/i, sugestoes: ['Ver histórico de alterações de preço', 'Calcular margem com frete incluso'] },
    { regex: /agendador|varredura|automático/i, sugestoes: ['Quando foi a última varredura?', 'Ativar varredura automática agora'] },
    { regex: /aviso|penalidad/i, sugestoes: ['Detalhar avisos ativos', 'Como resolver os avisos do ML?'] },
    { regex: /resumo|métricas|dashboard|panorama/i, sugestoes: ['Ver divergências em detalhes', 'Analisar produtos sem peso'] },
    { regex: /código|script|componente|função/i, sugestoes: ['Explicar o código gerado', 'Adaptar para outro contexto'] },
    { regex: /imagem|arte|desenho/i, sugestoes: ['Gerar variação desta imagem', 'Criar em estilo diferente'] },
    { regex: /vídeo|música|áudio/i, sugestoes: ['Baixar em outra qualidade', 'Buscar algo similar'] },
    { regex: /conexão|token|ml|mercado livre/i, sugestoes: ['Ver status da conexão ML', 'Reconnectar conta do Mercado Livre'] },
  ];
  for (const t of TEMAS) { if (t.regex.test(limpo)) return t.sugestoes.slice(0, 2); }
  return ['Me dê mais detalhes sobre isso', 'O que devo fazer agora?'];
}

function enrichHTML(h) {
  if (!h) return '';
  let html = h;
  html = html.replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="[https://produto.mercadolivre.com.br/MLB-$1](https://produto.mercadolivre.com.br/MLB-$1)" target="_blank" class="ia-link">$1</a>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<b class="ia-bold">$1</b>');
  html = html.replace(/\*([^*\n<]+)\*/g, '<i>$1</i>');
  html = html.replace(/`([^`]+)`/g, '<span class="ia-highlight">$1</span>');
  html = html.replace(/(?:^|\n)---(?:\n|$)/g, '<div class="ia-divider"></div>');
  html = html.replace(/(?:^|\n)___NOVAS___(?:\n|$)/g, '<div class="ia-new-msgs-divider"><span>Novas Mensagens</span></div>');
  html = html.replace(/(?:^|\n)[\-\*]\s+(.+)/g, '<li class="ia-list-item">$1</li>');
  html = html.replace(/(<li class="ia-list-item">.*?<\/li>)+/gs, match => `<ul class="ia-list">${match}</ul>`);
  html = html.replace(/\n/g, '<br>');
  return html.trim();
}

// ── TEMAS ─────────────────────────────────────────────────────────────────────
const THEMES = {
  light: { bg: '#ffffff', surface: '#f8fafc', border: '#e2e8f0', text: '#1e293b', textMuted: '#64748b', textFaint: '#94a3b8', brand: '#1e293b', userBubble: '#f0f0f0', userText: '#333', chatAreaBg: '#ffffff', sidebarBg: '#f8fafc', inputAreaBg: '#ffffff', inputBoxBg: '#f1f3f4', inputBoxBorder: '#e8eaed', quickActionBg: '#f1f3f4', quickActionHover: '#e8eaed', greetingGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', codeBg: '#f6f8fa', codeBorder: '#e1e4e8', stepDescBg: 'rgba(66,133,244,0.04)', stepDescBorder: 'rgba(66,133,244,0.15)', fadeGradient: 'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 100%)', starDark: false, highlightBg: '#e2e8f0', highlightText: '#1e293b', codeFade: 'linear-gradient(rgba(246,248,250,0), rgba(246,248,250,1))' },
  dark: { bg: '#000000', surface: '#1e1f20', border: '#3c4043', text: '#e3e3e3', textMuted: '#9aa0a6', textFaint: '#5f6368', brand: '#8ab4f8', userBubble: '#303134', userText: '#e3e3e3', chatAreaBg: '#000000', sidebarBg: '#1e1f20', inputAreaBg: '#000000', inputBoxBg: '#1e1f20', inputBoxBorder: 'transparent', quickActionBg: '#1e1f20', quickActionHover: '#303134', greetingGradient: 'linear-gradient(135deg, #8ab4f8 0%, #c084fc 100%)', codeBg: '#1a1b1e', codeBorder: '#3c4043', stepDescBg: 'rgba(66,133,244,0.06)', stepDescBorder: 'rgba(66,133,244,0.18)', fadeGradient: 'linear-gradient(to bottom, #000000 0%, rgba(0,0,0,0) 100%)', starDark: true, highlightBg: '#282a2c', highlightText: '#e3e3e3', codeFade: 'linear-gradient(rgba(26,27,30,0), rgba(26,27,30,1))' },
};

const QUICK_ACTIONS = [
  { icon: ImgIcon, label: 'Criar imagem', prompt: 'Gere uma imagem de...' },
  { icon: Music, label: 'Criar música', prompt: 'Crie uma música estilo...' },
  { icon: Edit2, label: 'Escrever algo', prompt: 'Escreva um texto sobre...' },
  { icon: Video, label: 'Crie um vídeo', prompt: 'Gere um vídeo de...' },
  { icon: Compass, label: 'Me ajude a aprender', prompt: 'Me explique como funciona...' },
  { icon: Sun, label: 'Melhore meu dia', prompt: 'Me conte algo legal para animar o dia!' },
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

// ── ESTILOS CSS ───────────────────────────────────────────────────────────────
const CHAT_STYLES = (th, fs) => `
  @import url('[https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono+0;swap](https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono+0;swap)');
  @keyframes ia-spin      { to{transform:rotate(360deg);} }
  @keyframes ia-blink     { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes ia-fade-in  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ia-greeting  { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes coin-pulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }

  .ia-chat-root *{box-sizing:border-box;}
  .ia-chat-root{font-family:'Google Sans',Roboto,sans-serif!important;font-size:${fs}px;color:${th.text};}
  .ia-scroll::-webkit-scrollbar{width:4px} .ia-scroll::-webkit-scrollbar-track{background:transparent} .ia-scroll::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px}

  .ia-msg{font-family:'Google Sans',sans-serif!important;font-size:${fs}px;line-height:1.65;color:${th.text};animation:ia-fade-in 0.3s ease;}
  .ia-link{color:#8ab4f8!important;text-decoration:underline;font-weight:500;}
  .ia-bold{font-weight:700;color:${th.text};}
  .ia-highlight{background:${th.highlightBg};color:${th.highlightText};padding:2px 6px;border-radius:6px;font-family:'Google Sans Mono',monospace;font-size:0.9em;font-weight:500;}
  .ia-list{margin:8px 0;padding-left:24px;list-style-type:disc;}
  .ia-list-item{margin-bottom:4px;}
  .ia-divider{height:1px;background:linear-gradient(90deg,transparent,${th.border},transparent);margin:20px 0;}
  .ia-new-msgs-divider{display:flex;align-items:center;justify-content:center;text-align:center;color:#8ab4f8;font-size:11px;margin:24px 0;position:relative;}
  .ia-new-msgs-divider::before,.ia-new-msgs-divider::after{content:'';flex:1;height:6px;background:url('data:image/svg+xml;utf8,<svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" width="20" height="6"><path fill="none" stroke="%238ab4f8" stroke-width="1" d="M0,3 Q5,0 10,3 T20,3"/></svg>') repeat-x;opacity:0.5;}
  .ia-new-msgs-divider span{padding:0 12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:${th.chatAreaBg};border-radius:12px;border:1px solid #8ab4f840;margin:0 8px;}

  .ia-header-ghost{background:${th.chatAreaBg}!important;border-bottom:none!important;position:relative;z-index:10;}
  .ia-header-ghost .ia-header-btn{opacity:0.35;transition:opacity 0.18s ease;}
  .ia-header-ghost:hover .ia-header-btn{opacity:0.75;}
  .ia-msg-area-wrap{position:relative;flex:1;display:flex;flex-direction:column;overflow:hidden;}
  .ia-msg-area-wrap::before{content:'';position:absolute;top:0;left:0;right:0;height:64px;background:${th.fadeGradient};pointer-events:none;z-index:3;}
  .ia-input-area-ghost{background:${th.inputAreaBg}!important;border-top:none!important;padding-top:4px!important;}
  
  .ia-input-box{background:${th.inputBoxBg}!important;border:1px solid ${th.inputBoxBorder}!important;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;transition:border-color 0.2s,box-shadow 0.2s; min-height:80px;}
  .ia-input-box:focus-within{border-color:rgba(138,180,248,0.45)!important;box-shadow:0 0 0 2px rgba(138,180,248,0.08);}
  .ia-textarea{flex:1;background:transparent;border:none;outline:none;color:${th.text};resize:none;padding:0;font-size:${fs}px;font-family:'Google Sans',sans-serif;max-height:160px;line-height:1.5;}
  .ia-textarea::placeholder{color:${th.textFaint};}

  .ia-think-panel{margin-bottom:12px;}
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
  .ia-code-fade-overlay{position:absolute;bottom:0;left:0;right:0;height:100px;background:${th.codeFade};display:flex;align-items:flex-end;justify-content:center;padding-bottom:16px;}

  .ia-msg-wrap:hover .ia-msg-actions{opacity:1!important;}
  .ia-chip{transition:all 0.15s ease;cursor:pointer;}
  .ia-chip:hover{background:${th.quickActionHover}!important;transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,0.1);}
  .ia-fs-msg{max-width:720px;width:100%;margin:0 auto;padding:0 24px;}

  .gemini-pill{display:flex;align-items:center;gap:8px;background:${th.quickActionBg};border:1px solid ${th.border};border-radius:999px;padding:10px 18px;cursor:pointer;transition:all 0.2s;font-size:13px;color:${th.text};font-weight:500;}
  .gemini-pill:hover{background:${th.quickActionHover};transform:translateY(-2px);}

  .action-btn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:transparent;border:none;color:${th.textFaint};cursor:pointer;transition:all 0.15s;}
  .action-btn:hover{background:${th.surface};color:${th.textMuted};}
  .action-btn:disabled{opacity:0.4;cursor:not-allowed;background:transparent!important;color:${th.textFaint}!important;}

  .suggestion-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 0;background:transparent;border:none;color:${th.textMuted};font-size:13px;cursor:pointer;transition:all 0.2s;margin-bottom:6px;width:100%;text-align:left;}
  .suggestion-pill:hover{color:${th.text};font-weight:600;}
  .suggestion-pill svg{flex-shrink:0;}
  
  .ia-img-msg {
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 6px;
    border: 1px solid ${th.border};
    animation: ia-fade-in 0.3s ease;
  }
  .ia-img-msg img {
    width: 100%;
    height: auto;
    object-fit: cover;
    display: block;
  }
`;

function AgentCoin({ agentTipo, active, th }) {
  const agent = AGENT_CATALOG[agentTipo] || AGENT_CATALOG.padrao;
  const AgIcon = agent.icon;
  return (
    <div title={agent.label} style={{
      width: '26px', height: '26px', borderRadius: '50%',
      background: th.chatAreaBg, border: `1.5px solid ${agent.color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: agent.color,
      boxShadow: active ? `0 0 10px ${agent.color}80, inset 0 0 5px ${agent.color}40` : `0 2px 4px rgba(0,0,0,0.15)`,
      animation: active ? 'coin-pulse 1.5s ease-in-out infinite' : 'none',
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: agent.color, opacity: 0.15 }} />
      <AgIcon size={12} style={{ zIndex: 2 }} />
    </div>
  );
}

function useThinkingOrchestrator() {
  const [phase, setPhase] = useState('idle');
  const [reasoningLog, setReasoningLog] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isReadyForReply, setIsReadyForReply] = useState(false);
  const [thinkingContext, setThinkingContext] = useState(null); 

  const targetTextRef = useRef('');
  const currentTextRef = useRef('');
  const tickRef = useRef(null);
  const processTimerRef = useRef(null);
  const isFinishingRef = useRef(false);

  const reset = useCallback(() => {
    setPhase('idle'); setReasoningLog(''); setElapsedMs(0); setIsOpen(false); setIsReadyForReply(false);
    setThinkingContext(null); 
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
      const chunkSize = remaining > 150 ? 8 : (remaining > 50 ? 4 : 1);
      const chunk = targetTextRef.current.substring(currentTextRef.current.length, currentTextRef.current.length + chunkSize);
      currentTextRef.current += chunk;
      setReasoningLog(currentTextRef.current);

      const nextChar = chunk[chunk.length - 1];
      const delay = remaining > 150 ? 0 : (nextChar === '\n' ? 15 : (nextChar === '.' || nextChar === ':' ? 10 : 2));

      processTimerRef.current = setTimeout(processQueue, delay);
    } else {
      if (isFinishingRef.current) {
        clearInterval(tickRef.current); setPhase('done'); setIsReadyForReply(true);
      } else {
        processTimerRef.current = setTimeout(processQueue, 50);
      }
    }
  }, []);

  const start = useCallback((context) => { 
    reset(); setPhase('thinking'); setIsOpen(false); setIsReadyForReply(false);
    if (context) setThinkingContext(context); 
    tickRef.current = setInterval(() => setElapsedMs(prev => prev + 500), 500);
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
  if (phase === 'idle') return null;
  const isFinished = phase === 'done';
  const segundos = Math.max(1, Math.floor(elapsedMs / 1000));

  const getDynamicThinkingMessage = () => {
    if (elapsedMs < 3000) { 
      return 'Hmm, deixa eu ver...';
    } else if (elapsedMs < 6000) { 
      switch (thinkingContext) {
        case 'pesquisa': return 'Opa, tô mergulhado em um mar de dados! Quase lá...';
        case 'analise': return 'Hmm, tô mergulhando nos detalhes pra te dar a visão completa.';
        case 'comparacao': return 'Deixa eu colocar as opções lado a lado e te mostrar o melhor custo-benefício.';
        case 'geracao': return 'Minha criatividade tá a mil! Já já eu te mostro o resultado.';
        default: return 'Estou pensando mais um pouco...';
      }
    } else { 
      return 'Estou demorando mais que o esperado... pensando mais um pouco...';
    }
  };

  const label = isFinished ? `Pensamento por ${segundos} s` : getDynamicThinkingMessage();

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
          {!isFinished && <span style={{ display: 'inline-block', width: '6px', height: '12px', background: '#8ab4f8', marginLeft: '4px', animation: 'ia-blink 0.7s step-end infinite' }} />}
        </div>
      </div>
    </div>
  );
}

function FontesResposta({ fontes, th }) {
  if (!fontes || fontes.length === 0) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 8 }}>
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: th.text }}>Fontes exploradas</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {fontes.slice(0, 8).map((fonte, i) => {
          const uri = typeof fonte === 'string' ? fonte : (fonte.uri || fonte.url || '');
          const label = typeof fonte === 'string' ? fonte : (fonte.title || fonte.label || fonte.uri || '');
          const host = (() => { try { return new URL(uri).hostname.replace('www.', ''); } catch { return label.substring(0, 28); } })();
          return (
            <a key={i} href={uri} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: '16px', fontSize: 11, textDecoration: 'none', background: th.surface, border: `1px solid ${th.border}`, color: th.textMuted, transition: 'all 0.15s' }}>
              <Globe size={12} /> <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host || label}</span>
            </a>
          );
        })}
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

  const dicas = (msg.suggestions || extrairDicas(msg.content)).slice(0, 2);

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
      await fetch(`${API_BASE_URL}/api/ia/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, mensagemId: msg.id, isPositive: isLike, comentario: text }),
      });
    } catch { }
  };

  const submitComment = () => enviarParaBackend(feedback, comment);
  const handleCloseBox = () => enviarParaBackend(feedback, '');

  return (
    <div style={{ marginTop: '12px' }}>
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
        {showThankYou && (
          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginLeft: '8px', animation: 'ia-fade-in 0.2s ease' }}>
            Obrigado pelo feedback!
          </span>
        )}
      </div>

      {showFeedbackBox && (
        <div style={{ marginTop: '12px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: '12px', padding: '12px', maxWidth: '400px', animation: 'ia-fade-in 0.2s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: th.text }}>Deixe um comentário (opcional)</span>
            <button onClick={handleCloseBox} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="O que achou da resposta?"
            style={{ width: '100%', minHeight: '60px', background: 'transparent', border: `1px solid ${th.border}`, borderRadius: '8px', padding: '8px', color: th.text, fontSize: '12px', outline: 'none', resize: 'none', fontFamily: "'Google Sans', sans-serif" }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button onClick={submitComment} style={{ background: th.brand, color: th.bg, border: 'none', padding: '6px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Enviar</button>
          </div>
        </div>
      )}

      {dicas.length > 0 && !isSubmitted && !showFeedbackBox && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {dicas.map((dica, idx) => (
            <button key={idx} className="suggestion-pill" onClick={() => onFollowUp(dica)}>
              <CornerDownRight size={16} style={{ color: th.textFaint }} />
              <span style={{ flex: 1 }}>{dica}</span>
            </button>
          ))}
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
      a.classList.add('ia-link');
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [html]);
  return <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} style={{ wordBreak: 'break-word' }} />;
}

function DiffusionText({ html, onDoneRef }) {
  const [scrambled, setScrambled] = useState('');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*';

  useEffect(() => {
    let mounted = true;
    const tokens = []; let i = 0;
    while (i < html.length) {
      if (html[i] === '<') { let e = html.indexOf('>', i); if (e === -1) e = html.length; tokens.push({ type: 'tag', val: html.substring(i, e + 1) }); i = e + 1; }
      else if (html[i] === '&') { let e = html.indexOf(';', i); if (e === -1) e = html.length; tokens.push({ type: 'char', val: html.substring(i, e + 1) }); i = e + 1; }
      else { tokens.push({ type: 'char', val: html[i], isSpace: html[i] === ' ' || html[i] === '\n' }); i++; }
    }

    let iter = 0;
    const phase1End = 12;
    const phase2End = 62;
    const phase3End = 80;

    const iv = setInterval(() => {
      if (!mounted) return;
      iter++;

      if (document.hidden) {
        clearInterval(iv); setScrambled(html); setTimeout(() => onDoneRef?.current?.(), 0); return;
      }

      let cur = '';
      let allResolved = true;

      tokens.forEach((tk, idx) => {
        if (tk.type === 'tag' || tk.isSpace) {
          cur += tk.val;
        } else {
          if (iter <= phase1End) {
            cur += chars[Math.floor(Math.random() * chars.length)];
            tk.lastRandom = cur[cur.length - 1];
            allResolved = false;
          } else if (iter <= phase2End) {
            cur += Math.random() > 0.95 ? chars[Math.floor(Math.random() * chars.length)] : (tk.lastRandom || 'A');
            allResolved = false;
          } else {
            const progress = (iter - phase2End) / (phase3End - phase2End); 
            const threshold = idx / tokens.length;
            if (progress > threshold + Math.random() * 0.15) {
              cur += tk.val;
            } else {
              cur += tk.lastRandom || chars[Math.floor(Math.random() * chars.length)];
              allResolved = false;
            }
          }
        }
      });

      setScrambled(cur);

      if (iter >= phase3End || allResolved) {
        clearInterval(iv); setScrambled(html); setTimeout(() => onDoneRef?.current?.(), 0);
      }
    }, 40);

    return () => { mounted = false; clearInterval(iv); };
  }, [html, onDoneRef]);

  return <SafeHTMLMsg html={scrambled} />;
}

function InlineCodeBlock({ lang, code, th, onOpenSidePanel, filename }) {
  const [copied, setCopied] = useState(false);
  const label = detectLang(lang);
  const isLarge = code.split('\n').length > 8;
  const handleCopy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const handleExpand = () => { onOpenSidePanel({ lang, code, filename }); };

  return (
    <div className="ia-code-block">
      <div className="ia-code-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileCode size={14} style={{ color: th.brand }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: th.text, fontFamily: "'Google Sans Mono',monospace" }}>{filename}</span>
          <span style={{ fontSize: '10px', color: th.textFaint, background: th.surface, padding: '1px 6px', borderRadius: '4px', border: `1px solid ${th.border}` }}>{label}</span>
        </div>
        <button onClick={handleCopy} style={{ background: 'none', border: 'none', color: copied ? '#10b981' : th.textFaint, cursor: 'pointer', padding: '3px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
          {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <div className="ia-code-body" style={{ maxHeight: isLarge ? '180px' : 'auto' }}>{code}</div>
        {isLarge && (
          <div className="ia-code-fade-overlay">
            <button onClick={handleExpand}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: th.chatAreaBg, color: th.text, border: `1px solid ${th.border}`, borderRadius: '16px', padding: '8px 16px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', transition: 'transform 0.2s ease', fontFamily: "'Google Sans', sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
              <Maximize size={14} style={{ color: th.brand }} /> Expandir Código
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL DA MENSAGEM DA IA (TEXTOS LIMPISSIMOS SEM CAIXA)
function IaMessage({ msg, isTyping, onDone, th, onOpenSidePanel, fontSize, userMessage, handleSend, isLastIaInSequence }) {
  const parts = processTextAndCode(msg.content, userMessage || '');
  const onDoneRef = useRef(onDone);
  const [animationsEnabled, setAnimations] = useState(() => localStorage.getItem('analyiz_anim') !== 'false');

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const showFooter = !isTyping && isLastIaInSequence;

  return (
    <div className="ia-msg" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      
      {/* TEXTO LIMPO - SEM BACKGROUND, BORDER OU PADDING */}
      {parts.filter(p => p.type === 'text').map((part, i, textParts) => {
        const enriched = enrichHTML(part.content);
        return enriched ? (
          <div key={`text-${i}`} style={{ fontSize: `${fontSize}px`, lineHeight: '1.65', color: th.text }}>
            {(isTyping && isLastIaInSequence && animationsEnabled) ? <DiffusionText html={enriched} onDoneRef={onDoneRef} /> : <SafeHTMLMsg html={enriched} />}
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

      {showFooter && (
        <MessageFooter
          msg={msg} th={th}
          onRegenerate={() => handleSend(userMessage)}
          onFollowUp={(dica) => handleSend(dica)}
        />
      )}
    </div>
  );
}

function FileAttachmentGrid({ attachments, th }) {
  if (!attachments?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px', justifyContent: 'flex-end' }}>
      {attachments.map((att, i) => {
        const info = getFileInfo(att.mimeType), color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown, Icon = info.icon;
        if (info.group === 'image' && att.preview) return (<div key={i} style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: `1px solid ${th.border}` }}><img src={att.preview} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/></div>);
        return (<div key={i} style={{ width: '56px', height: '56px', borderRadius: '8px', background: th.surface, border: `1px solid ${th.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', flexShrink: 0 }}><Icon size={18} style={{ color }}/><span style={{ fontSize: '8px', color: th.textFaint, textAlign: 'center', lineHeight: '1.1', overflow: 'hidden', maxWidth: '50px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span></div>);
      })}
    </div>
  );
}

function PendingFilesGrid({ files, onRemove, th }) {
  if (!files.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 0 4px' }}>
      {files.map((f, i) => {
        const info = getFileInfo(f.mimeType), color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown, Icon = info.icon;
        return (
          <div key={i} style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: info.group === 'image' && f.preview ? 'transparent' : th.surface, border: `1px solid ${th.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', overflow: 'hidden' }}>
              {info.group === 'image' && f.preview ? <img src={f.preview} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <><Icon size={18} style={{ color, flexShrink: 0 }}/><span style={{ fontSize: '7px', color: th.textFaint, textAlign: 'center', lineHeight: '1.1', padding: '0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50px' }}>{f.name}</span></>}
            </div>
            <button onClick={() => onRemove(i)} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><X size={9} style={{ color: '#fff' }} /></button>
          </div>
        );
      })}
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
            <button onClick={() => fileInputRef.current?.click()} disabled={pendingFiles.length >= MAX_FILES}
              style={{ background: 'none', border: 'none', color: th.textFaint, cursor: pendingFiles.length >= MAX_FILES ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', paddingBottom: '2px' }}>
              <Plus size={20} />
            </button>
            <textarea ref={taRef} className="ia-textarea" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} rows={1} placeholder={placeholder} style={{ fontSize: '15px', paddingBottom: '4px', paddingTop: '4px' }} />
            <button style={{ background: 'none', border: 'none', color: th.textFaint, padding: '4px', cursor: 'pointer', paddingBottom: '2px' }}><Mic size={20} /></button>

            {isChatLoading ? (
              <button onClick={handleStopLoading}
                style={{ background: th.text, color: th.bg, border: 'none', borderRadius: '10px', width: '34px', height: '34px', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
                <Square size={13} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button onClick={() => handleSend()} disabled = {!canSend}
                style={{ background: canSend ? th.text : 'transparent', color: canSend ? th.bg : th.textFaint, border: 'none', borderRadius: '50%', width: '34px', height: '34px', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: canSend ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                <Send size={15} style={{ marginLeft: '2px' }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeScreenGeminiStyle({ th, userName, onQuickAction, chatInput, setChatInput, handleSend, handleStopLoading, handleKeyDown, handlePaste, isChatLoading, pendingFiles, setPendingFiles, fileInputRef, canSend }) {
  const nomeDisplay = userName || 'Anderson';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px', animation: 'ia-greeting 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <AnalyizStar size={48} active={false} dark={th.starDark} />
        </div>
        <h1 style={{ fontSize: '36px', fontWeight: 600, margin: '0 0 8px 0', background: 'linear-gradient(to right, #a855f7, #ec4899, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Olá, {nomeDisplay}
        </h1>
        <h2 style={{ fontSize: '36px', fontWeight: 600, margin: 0, color: th.textFaint }}>Por onde começamos?</h2>
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

function EditableUserMessage({ msg, th, fontSize, onSendEdit }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);
  const [copied, setCopied] = useState(false);
  const taRef = useRef(null);
  useEffect(() => { if (editing && taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px'; taRef.current.focus(); } }, [editing]);
  const handleCopy = () => { navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const handleSubmit = () => { if (editVal.trim() && editVal.trim() !== msg.content) onSendEdit(msg.id, editVal.trim()); setEditing(false); };
  return (
    <div className="ia-msg-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '16px' }}>
      <FileAttachmentGrid attachments={msg.attachments} th={th}/>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-start' }}>
        {!editing && msg.content && (
          <div style={{ maxWidth: '88%' }}>
            <div style={{ background: th.userBubble, color: th.userText, padding: '12px 16px', borderRadius: '18px 18px 4px 18px', fontSize: `${fontSize}px`, lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Google Sans',sans-serif" }}>{msg.content}</div>
          </div>
        )}
        {editing && (
          <div style={{ maxWidth: '88%', width: '100%' }}>
            <textarea ref={taRef} value={editVal} onChange={e => { setEditVal(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } if (e.key === 'Escape') setEditing(false); }}
              style={{ width: '100%', background: th.inputBoxBg, color: th.text, border: '1.5px solid #8ab4f8', borderRadius: '12px', padding: '10px 14px', fontSize: `${fontSize}px`, fontFamily: "'Google Sans',sans-serif", resize: 'none', outline: 'none', lineHeight: '1.5' }}/>
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: `1px solid ${th.border}`, color: th.textMuted, cursor: 'pointer', padding: '4px 12px', borderRadius: '8px', fontSize: '12px' }}>Cancelar</button>
              <button onClick={handleSubmit} style={{ background: '#8ab4f8', border: 'none', color: '#1e1f20', cursor: 'pointer', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>Enviar</button>
            </div>
          </div>
        )}
        {!editing && (
          <div className="ia-msg-actions" style={{ display: 'flex', gap: '3px', opacity: 0, transition: 'opacity 0.15s', alignItems: 'center', flexShrink: 0 }}>
            <button onClick={handleCopy} style={{ background: 'none', border: `1px solid ${th.border}`, color: copied ? '#10b981' : th.textFaint, cursor: 'pointer', padding: '4px 7px', borderRadius: '6px', display: 'flex', alignItems: 'center', fontSize: '11px' }}><Copy size={12} /></button>
            <button onClick={() => setEditing(true)} style={{ background: 'none', border: `1px solid ${th.border}`, color: th.textFaint, cursor: 'pointer', padding: '4px 7px', borderRadius: '6px', display: 'flex', alignItems: 'center', fontSize: '11px' }}><Edit2 size={12} /></button>
          </div>
        )}
      </div>
      {msg.time && !editing && <span style={{ fontSize: '10px', color: th.textFaint, marginTop: '3px' }}>{msg.time}</span>}
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
  const [sessionDocs, setSessionDocs] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [searchSession, setSearchSession] = useState('');
  const [typingSet, setTypingSet] = useState(new Set());
  const [lastUserMsg, setLastUserMsg] = useState('');
  const [isTypingResp, setIsTypingResp] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
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

  useEffect(() => { if (typingSet.size === 0 && isTypingResp) setIsTypingResp(false); }, [typingSet, isTypingResp]);

  const currentUserMessageRef = useRef('');
  const pendingFontesRef = useRef(null);
  const thinkingMsRef = useRef(0);

  const thinking = useThinkingOrchestrator();

  const readUserId = () => { try { return JSON.parse(localStorage.getItem('analyiz_user'))?.id; } catch { return null; } };
  const readUserName = () => { try { const u = JSON.parse(localStorage.getItem('analyiz_user')); return u?.nome || u?.name; } catch { return 'Anderson'; } };
  const [userId] = useState(readUserId);
  const [userName] = useState(readUserName);
  const [currentSessionId, setCurrentSessionId] = useState(() => { try { return parseInt(localStorage.getItem(SESSION_KEYStr)); } catch { return null; } });

  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pendingNotifRef = useRef(null);
  const thinkingStartRef = useRef(0);

  const confirmDelete = useCallback(async () => window.confirm('Deletar esta conversa?'), []);

  useEffect(() => {
    if (scrollRef.current && autoScrollAtivo && autoScrollOn) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isChatLoading, thinking.reasoningLog, typingSet, autoScrollAtivo, autoScrollOn]);

  const carregarSessions = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`);
      if (!r.ok) throw new Error('Erro na API');
      const data = await r.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setSessions([]);
    }
  }, [userId]);

  const carregarDocumentos = useCallback(async (sid) => {
    if (!sid) { setSessionDocs([]); return; }
    try {
      const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${sid}/documents`);
      if (!r.ok) throw new Error('Erro na API');
      const data = await r.json();
      setSessionDocs(Array.isArray(data) ? data : []);
    } catch {
      setSessionDocs([]);
    }
  }, []);

  useEffect(() => {
    if (currentSessionId && userId) {
      localStorage.setItem(SESSION_KEYStr, String(currentSessionId));
      fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`)
        .then(r => r.json())
        .then(msgs => {
          if (Array.isArray(msgs)) {
            setMessages(msgs.map(m => ({ role: m.role, id: String(m.id), content: m.content, time: safeTime(m.createdAt), attachments: null, sources: [], reasoning: m.reasoning || '', fontes: [], agents: m.agents || [], isLastInSequence: true })));
          } else {
            setMessages([]);
          }
        }).catch(() => setMessages([]));
      carregarDocumentos(currentSessionId);
    } else { setMessages([]); }
  }, [currentSessionId, userId, carregarDocumentos]);

  useEffect(() => { if (isChatOpen || isFullscreen) carregarSessions(); }, [isChatOpen, isFullscreen, carregarSessions]);

  const verificarProativo = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/proactive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, userRole }) });
      const data = await res.json();
      if (!data.insight || !data.hasRelevantData) return;
      pendingNotifRef.current = { notifId: data.notifId, fullInsight: data.fullInsight };
      if (isChatOpen) {
        const id = `ia-proactive-${Date.now()}`;
        setMessages(prev => [...prev, { role: 'ia', content: `___NOVAS___\n\n${data.fullInsight}`, time: getTime(), id, sources: [], reasoning: '', fontes: [], agents: [], isLastInSequence: true }]);
        setTypingSet(prev => new Set(prev).add(id));
        fetch(`${API_BASE_URL}/api/ia/proactive/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, notifId: data.notifId }) }).catch(() => { });
        pendingNotifRef.current = null;
      } else {
        setShortPreview(data.insight); setHasUnread(true);
      }
    } catch { }
  }, [userId, userRole, isChatOpen]);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(verificarProativo, POLL_INITIAL);
    pollTimerRef.current = setInterval(verificarProativo, POLL_INTERVAL);
    return () => { clearTimeout(first); clearInterval(pollTimerRef.current); };
  }, [verificarProativo, userId]);

  useEffect(() => {
    if (!isChatOpen) { setSidePanelContent(null); setHasUnread(false); setShortPreview(''); }
    else {
      const p = pendingNotifRef.current;
      if (p) {
        const { notifId, fullInsight } = p;
        pendingNotifRef.current = null;
        fetch(`${API_BASE_URL}/api/ia/proactive/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, notifId }) }).catch(() => { });
        setTimeout(() => {
          const id = `ia-proactive-${Date.now()}`;
          setMessages(prev => [...prev, { role: 'ia', content: `___NOVAS___\n\n${fullInsight}`, time: getTime(), id, sources: [], reasoning: '', fontes: [], agents: [], isLastInSequence: true }]);
          setTypingSet(prev => new Set(prev).add(id));
        }, 400);
      }
    }
  }, [isChatOpen]);

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
      const identityHtml = `Fui desenvolvida pelo <b>Anderson Honorato</b> (Ander), como parte de um projeto focado em facilitar processos e atendimentos inteligentes.`;
      setMessages(p => [...p, { role: 'user', content: userMsg, time: getTime(), id: uId, attachments: null }, { role: 'ia', content: identityHtml, time: getTime(), id: iId, sources: [], reasoning: '', fontes: [], agents: [], isLastInSequence: true }]);
      setTypingSet(prev => new Set(prev).add(iId)); setIsTypingResp(true); return;
    }

    const mlbIdDetectado = !pendingFiles.length ? extrairMLBIdDaMensagem(userMsg) : null;
    const isPesquisaMercado = PESQUISA_WEB_REGEX.test(userMsg) && !pendingFiles.length && !mlbIdDetectado;
    const isConsultaBanco = DB_REGEX.test(userMsg) && !isPesquisaMercado && !pendingFiles.length;

    currentUserMessageRef.current = userMsg;
    setLastUserMsg(userMsg);
    const filesToSend = [...pendingFiles];
    const attachmentSnapshot = filesToSend.map(f => ({ mimeType: f.mimeType, name: f.name, group: f.group, preview: f.preview, sizeBytes: f.sizeBytes }));
    setMessages(p => [...p, { role: 'user', content: userMsg, time: new Date().toLocaleTimeString(), id: `u-${Date.now()}`, attachments: attachmentSnapshot.length ? attachmentSnapshot : null }]);
    setChatInput(''); setPendingFiles([]); setIsChatLoading(true);
    pendingFontesRef.current = null;
    setCurrentMessageAgents([]);

    thinkingStartRef.current = Date.now();
    
    if (isPesquisaMercado) {
        thinking.start('pesquisa');
    } else if (isConsultaBanco) {
        thinking.start('analise');
    } else {
        thinking.start();
    }

    if (isPesquisaMercado) {
      setCurrentMessageAgents(['pesquisa']);
      thinking.addReasoningBlock('\n[Sistema]: Chamando Agente de Pesquisa Web...\n');
    } else if (isConsultaBanco) {
      setCurrentMessageAgents(['banco']);
      thinking.addReasoningBlock('\n[Sistema]: Chamando Agente de Dados Internos...\n');
    }

    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;

    try {
      const sid = await ensureSession();
      const images = filesToSend.filter(f => f.group === 'image');
      const nonImages = filesToSend.filter(f => f.group !== 'image');
      const firstImg = images[0];
      const actualPageBaseUrl = pageBaseUrl || window.location.origin || 'http://localhost:5173';

      let endpoint = `${API_BASE_URL}/api/ia/chat/stream`;
      let bodyData = {
        message: userMsg, sessionId: sid, userId, userRole,
        pageUrl: window.location.pathname, pageBaseUrl: actualPageBaseUrl,
        imageOnly: !userMsg && filesToSend.length === 1 && !!firstImg,
        ...(firstImg ? { imageBase64: firstImg.base64, imageMimeType: firstImg.mimeType, imageName: firstImg.name } : {}),
        extraImages: images.slice(1).map(f => ({ base64: f.base64, mimeType: f.mimeType, name: f.name })),
        files: nonImages.map(f => ({ base64: f.base64, mimeType: f.mimeType, name: f.name, group: f.group, sizeBytes: f.sizeBytes })),
        attachmentMeta: attachmentSnapshot.map(a => ({ mimeType: a.mimeType, name: a.name, group: a.group, sizeBytes: a.sizeBytes })),
      };

      if (isPesquisaMercado) {
        endpoint = `${API_BASE_URL}/api/ml/research/deep-market`;
        bodyData = { userId, itens: [userMsg], perguntaFollowUp: userMsg, contextoAnterior: '' };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        signal: ctrl.signal
      });

      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      let isDoneEventFired = false;

      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop();
        let ev = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            ev = line.slice(7).trim();
          }
          else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const eventType = data.action || data.type || data.evento || ev;

              if (eventType === 'reasoning_chunk') { thinking.pushChunk(data.text); }
              else if (eventType === 'reasoning_start') { thinking.start(); }
              else if (eventType === 'agent_start') {
                setCurrentMessageAgents(p => Array.from(new Set([...p, data.agente])));
                thinking.addReasoningBlock(`\n[Sistema]: Conectando ao ${AGENT_CATALOG[data.agente]?.label || data.agente}...\n`);
                if (data.agente === 'pesquisa') thinking.updateContext('pesquisa');
                else if (data.agente === 'banco') thinking.updateContext('analise');
              }
              else if (eventType === 'agent_end') { }
              else if (eventType === 'agent_log') { }
              else if (eventType === 'fontes') { pendingFontesRef.current = data.fontes; }
              else if (eventType === 'done' || ev === 'done' || eventType === 'step_done') {
                isDoneEventFired = true;
                thinkingMsRef.current = Date.now() - thinkingStartRef.current;
                if (data.sessionId && data.sessionId !== sid) setCurrentSessionId(data.sessionId);
                
                let respostaFinal = data.reply || '';
                if (isPesquisaMercado) respostaFinal = data.conteudoHtml || data.resumo || '✅ Processado.';
                
                // Quebra a resposta final em balões sequenciais baseando-se em parágrafos
                const partsFinal = splitIntoChatBubbles(respostaFinal);
                if (partsFinal.length === 0) partsFinal.push("✅ Processado.");

                // Envia as mensagens individualmente de forma assíncrona
                (async () => {
                    for (let idx = 0; idx < partsFinal.length; idx++) {
                        // Verifica abort durante o loop
                        if (abortControllerRef.current?.signal.aborted) break;

                        const replyPart = partsFinal[idx];
                        const iaIdPart = `ia-${Date.now()}-${idx}`;
                        const isLast = idx === partsFinal.length - 1;

                        setMessages(p => [...p, {
                            role: 'ia',
                            content: replyPart,
                            reasoning: idx === 0 ? (data.reasoning || '') : '',
                            thinkingMs: thinkingMsRef.current,
                            sources: isLast ? (data.sources || []) : [],
                            time: getTime(),
                            id: iaIdPart,
                            userMessage: userMsg,
                            fontes: isLast ? (pendingFontesRef.current || data.fontes || []) : [],
                            agents: idx === 0 ? currentMessageAgents : [],
                            isLastInSequence: isLast
                        }]);
                        setTypingSet(prev => new Set(prev).add(iaIdPart));
                        setIsTypingResp(true);

                        // DELAY ASSÍNCRONO ENTRE BALÕES DA MESMA MENSAGEM (1.8 Segundos)
                        if (!isLast) {
                            await new Promise(r => setTimeout(r, 1800));
                        }
                    }
                    
                    setIsChatLoading(false);
                    setCurrentMessageAgents([]);
                    carregarDocumentos(data.sessionId || sid);
                    carregarSessions();
                })();
                
                pendingFontesRef.current = null;
              }
            } catch { }
            ev = null;
          }
        }
      }
      
      // Fallback if the stream ends but no 'done' event fired
      if (!isDoneEventFired) {
          setIsChatLoading(false);
          setCurrentMessageAgents([]);
      }
      
      thinking.finish();
    } catch (e) {
      thinking.finish();
      if (e.name !== 'AbortError') {
        setMessages(p => [...p, { role: 'ia', content: 'Tive um pequeno tropeço aqui. Pode tentar novamente?', time: getTime(), id: `err-${Date.now()}`, sources: [], reasoning: '', fontes: [], agents: [], isLastInSequence: true }]);
      }
      setIsChatLoading(false);
      setCurrentMessageAgents([]);
    }
  };

  const handleEditMessage = useCallback((msgId, newContent) => {
    setMessages(prev => { const idx = prev.findIndex(m => m.id === msgId); if (idx === -1) return prev; return prev.slice(0, idx); });
    setTimeout(() => handleSend(newContent), 50);
  }, []);

  const processFile = useCallback(file => new Promise((resolve, reject) => {
    const info = getFileInfo(file.type);
    if (!FILE_TYPES[file.type] && !file.type.startsWith('image/') && !file.type.startsWith('audio/')) { reject(new Error(`Tipo não suportado: ${file.name}`)); return; }
    if (file.size > MAX_FILE_SIZE) { reject(new Error(`Arquivo muito grande: ${file.name}`)); return; }
    const r = new FileReader();
    r.onload = ev => { const d = ev.target.result; resolve({ base64: d.split(',')[1], mimeType: file.type || 'application/octet-stream', name: file.name, sizeBytes: file.size, group: info.group, preview: ['image', 'audio'].includes(info.group) ? d : null }); };
    r.onerror = () => reject(new Error(`Erro ao ler: ${file.name}`));
    r.readAsDataURL(file);
  }), []);

  const addFiles = useCallback(async fl => { const toAdd = [...fl].slice(0, MAX_FILES), added = []; for (const f of toAdd) { try { added.push(await processFile(f)); } catch { } } if (added.length) setPendingFiles(prev => [...prev, ...added].slice(0, MAX_FILES)); }, [processFile]);
  const handleFileSelect = useCallback(async e => { if (e.target.files?.length) await addFiles(e.target.files); e.target.value = ''; }, [addFiles]);
  const handlePaste = useCallback(async e => { const items = e.clipboardData?.items; if (!items) return; const files = []; for (const item of items) { if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); } } if (files.length) { e.preventDefault(); await addFiles(files); } }, [addFiles]);
  const handleDragOver = useCallback(e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(e => { e.preventDefault(); if (!dropRef.current?.contains(e.relatedTarget)) setIsDragging(false); }, []);
  const handleDrop = useCallback(async e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files); }, [addFiles]);
  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleNewSession = () => { setCurrentSessionId(null); setMessages([]); setSidePanelContent(null); thinking.reset(); setCurrentMessageAgents([]); setLastUserMsg(''); localStorage.removeItem(SESSION_KEYStr); };
  const loadSession = id => { setCurrentSessionId(id); setSidebarOpen(false); };
  const handleCopyCode = () => { if (sidePanelContent?.code) navigator.clipboard.writeText(sidePanelContent.code); };
  const handleDownloadCode = () => { if (!sidePanelContent?.code) return; const blob = new Blob([sidePanelContent.code], { type: 'text/plain' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = sidePanelContent.filename || 'documento.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
  const deletarSessao = async (e, id) => { e.stopPropagation(); if (!await confirmDelete()) return; await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`, { method: 'DELETE' }); if (id === currentSessionId) handleNewSession(); carregarSessions(); };

  const isNewSession = messages.length === 0 && thinking.phase === 'idle';
  const conversationTitle = deriveTitle(messages);
  const canSend = (chatInput.trim() || pendingFiles.length > 0) && !isChatLoading;
  const chatBaseW = isExpanded ? 600 : 400;
  const totalW = isFullscreen ? '100vw' : `${chatBaseW + (sidebarOpen ? 260 : 0)}px`;
  const H = isFullscreen ? '100vh' : isExpanded ? '85vh' : 'calc(100vh - 5rem)';
  const B = isFullscreen ? '0' : '1.5rem';
  const R = isFullscreen ? '0' : '1.5rem';
  const Radius = isFullscreen ? '0' : '20px';
  const starSize = isFullscreen ? 26 : 22;

  return (
    <>
      <style>{CHAT_STYLES(th, fontSize)}</style>

      {/* Painel lateral de código */}
      <div style={{ position: 'fixed', zIndex: 99999, bottom: B, right: isChatOpen && sidePanelContent ? (isFullscreen ? '0' : `calc(${R} + ${totalW} + 1rem)`) : `-100vw`, width: isFullscreen && sidePanelContent ? '38%' : `${chatBaseW}px`, height: H, background: th.bg, borderRadius: Radius, boxShadow: '0 4px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${th.border}`, transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', opacity: sidePanelContent ? 1 : 0, pointerEvents: sidePanelContent ? 'auto' : 'none' }}>
        <div style={{ padding: '12px', borderBottom: `1px solid ${th.border}`, background: th.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={18} style={{ color: th.brand }} /> Visualizador</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={handleCopyCode} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }}><Copy size={16} /></button>
              <button onClick={handleDownloadCode} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }}><Download size={16} /></button>
              <button onClick={() => setSidePanelContent(null)} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }}><X size={18} /></button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }} className="ia-scroll">
            {(Array.isArray(sessionDocs) ? sessionDocs : []).map(doc => (<button key={doc.id} onClick={() => setSidePanelContent({ lang: doc.language, code: doc.content, filename: doc.filename })} style={{ padding: '4px 8px', borderRadius: '6px', background: sidePanelContent?.filename === doc.filename ? th.brand : th.surface, color: sidePanelContent?.filename === doc.filename ? th.bg : th.text, fontSize: '11px', border: `1px solid ${th.border}`, whiteSpace: 'nowrap', cursor: 'pointer' }}>{doc.filename} (v{doc.versao})</button>))}
            {sessionDocs.length === 0 && <span style={{ fontSize: '11px', color: th.textFaint }}>Nenhum arquivo nesta conversa.</span>}
          </div>
        </div>
        <div className="ia-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px', background: th.surface }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: "'Google Sans Mono',monospace", fontSize: `${fontSize}px`, color: th.text }}>{sidePanelContent?.code}</pre>
        </div>
      </div>

      {/* Chat principal */}
      <div className="ia-chat-root" ref={dropRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{ position: 'fixed', zIndex: 99998, bottom: B, right: isFullscreen && sidePanelContent ? '38%' : R, width: isFullscreen ? (sidePanelContent ? '62%' : '100%') : totalW, height: H, maxHeight: isFullscreen ? 'none' : 'calc(100vh - 3rem)', background: th.chatAreaBg, borderRadius: Radius, boxShadow: isDragging ? '0 4px 32px rgba(99,102,241,0.25),0 0 0 2px #6366f1' : '0 4px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'row', overflow: 'hidden', transform: isChatOpen ? 'scale(1)' : 'scale(0)', transformOrigin: 'bottom right', opacity: isChatOpen ? 1 : 0, pointerEvents: isChatOpen ? 'auto' : 'none', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', border: isDragging ? '2px dashed #6366f1' : `1px solid ${th.border}` }}>

        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(99,102,241,0.07)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: Radius, pointerEvents: 'none' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📎</div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#6366f1', margin: 0 }}>Solte para anexar</p>
          </div>
        )}

        {/* Sidebar */}
        <div className={`ia-sidebar-panel${sidebarOpen ? '' : ' closed'}`}>
          <div style={{ padding: '14px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }}><X size={16} /></button>
          </div>
          <div style={{ padding: '0 10px 8px', flexShrink: 0 }}>
            <button onClick={handleNewSession} style={{ width: '100%', padding: '9px 12px', background: th.quickActionBg, border: `1px solid ${th.border}`, borderRadius: '10px', color: th.text, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', fontFamily: "'Google Sans',sans-serif", transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = th.quickActionHover} onMouseLeave={e => e.currentTarget.style.background = th.quickActionBg}>
              <Plus size={15} /> Nova conversa
            </button>
          </div>
          <div style={{ padding: '0 10px 8px', position: 'relative', flexShrink: 0 }}>
            <Search size={13} style={{ position: 'absolute', left: '22px', top: '10px', color: th.textFaint }} />
            <input type="text" placeholder="Pesquisar…" value={searchSession} onChange={e => setSearchSession(e.target.value)} style={{ width: '100%', padding: '8px 8px 8px 28px', background: 'transparent', border: `1px solid ${th.border}`, borderRadius: '8px', color: th.text, fontSize: '12px', outline: 'none', fontFamily: "'Google Sans',sans-serif" }} />
          </div>
          <div className="ia-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
            {(Array.isArray(sessions) ? sessions : []).filter(s => s.titulo?.toLowerCase().includes(searchSession.toLowerCase())).map(s => (
              <div key={s.id} onClick={() => loadSession(s.id)} className="ia-sidebar-item" style={{ padding: '9px 10px', display: 'flex', alignItems: 'center', gap: '8px', background: s.id === currentSessionId ? th.quickActionBg : 'transparent' }}>
                <MessageSquare size={13} style={{ color: th.textFaint, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: th.text, fontFamily: "'Google Sans',sans-serif" }}>{s.titulo || 'Conversa'}</span>
                <button className="ia-del-btn" onClick={e => deletarSessao(e, s.id)} style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '2px', opacity: 0, transition: 'opacity 0.15s' }} onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = th.textFaint; }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {(Array.isArray(sessions) ? sessions : []).length === 0 && <div style={{ padding: '20px 12px', textAlign: 'center', color: th.textFaint, fontSize: '12px' }}>Nenhuma conversa ainda</div>}
          </div>

          <div style={{ padding: '12px 10px', borderTop: `1px solid ${th.border}`, flexShrink: 0 }}>
            <button onClick={() => setShowChatSettings(!showChatSettings)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', color: th.textMuted, cursor: 'pointer', padding: '6px 4px', fontSize: '12px', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={14} /> Configurações</div>
              {showChatSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showChatSettings && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px', animation: 'ia-fade-in 0.2s ease', padding: '0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: th.textMuted }}>Modo escuro</span>
                  <button onClick={() => setDarkMode(!darkMode)} style={{ background: 'none', border: 'none', color: th.text, cursor: 'pointer', padding: '4px' }}>
                    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: th.textMuted }}>Fonte</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[13, 15, 17].map(size => (<button key={size} onClick={() => setFontSize(size)} style={{ fontSize: '10px', padding: '2px 7px', cursor: 'pointer', border: `1px solid ${th.border}`, background: fontSize === size ? th.brand : 'transparent', color: fontSize === size ? th.bg : th.text, borderRadius: '4px', fontWeight: 600 }}>{size}</button>))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: th.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Activity size={13} /> Animações
                  </span>
                  <input type="checkbox" checked={animationsEnabled} onChange={toggleAnim} style={{ cursor: 'pointer' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: th.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ChevronDown size={13} /> Scroll Auto
                  </span>
                  <input type="checkbox" checked={autoScrollOn} onChange={toggleScrollPref} style={{ cursor: 'pointer' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Área principal */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          <div className="ia-header-ghost" style={{ padding: isFullscreen ? '12px 20px' : '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="ia-header-btn" onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                <Menu size={20} />
              </button>
              <AnalyizStar size={34} active={isChatLoading} dark={th.starDark} />
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0, padding: '0 8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: th.text, fontFamily: "'Google Sans',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px', opacity: 0.85 }}>
                {conversationTitle}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              <button className="ia-header-btn" onClick={() => setIsFullscreen(!isFullscreen)}
                style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                {isFullscreen ? <Minimize2 size={16} /> : <Monitor size={16} />}
              </button>
              {!isFullscreen && (
                <button className="ia-header-btn" onClick={() => setIsExpanded(!isExpanded)}
                  style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              )}
              <button className="ia-header-btn" onClick={toggleChat}
                style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                <Minus size={16} />
              </button>
            </div>
          </div>

          <div className="ia-msg-area-wrap">
            <div ref={scrollRef} onScroll={handleScroll} className="ia-scroll" style={{ flex: 1, overflowY: 'auto', background: th.chatAreaBg, display: 'flex', flexDirection: 'column' }}>

              {isNewSession && (
                <WelcomeScreenGeminiStyle
                  th={th} userName={userName}
                  chatInput={chatInput} setChatInput={setChatInput}
                  handleSend={handleSend} handleStopLoading={handleStopLoading} handleKeyDown={handleKeyDown} handlePaste={handlePaste}
                  isChatLoading={isChatLoading} pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
                  fileInputRef={fileInputRef} canSend={canSend} isFullscreen={true}/>
              )}

              {!isNewSession && (
                <div style={{ flex: 1, padding: isFullscreen ? '24px 0' : '12px 14px 6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                  {messages.map(msg => (
                    <div key={msg.id} className={isFullscreen ? 'ia-fs-msg' : ''} style={{ marginBottom: '16px' }}>
                      {msg.role === 'ia' ? (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          
                          {/* ESTRELA E AGENTES SALVOS DA MENSAGEM */}
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                            <div style={{ zIndex: 10 }}>
                              <AnalyizStar size={starSize} active={false} dark={th.starDark}/>
                            </div>
                            {msg.agents && msg.agents.length > 0 && (
                              <div style={{ display: 'flex', marginLeft: '-8px' }}>
                                {msg.agents.map((ag, idx) => (
                                  <div key={idx} style={{ marginLeft: idx === 0 ? 0 : '-12px', zIndex: 9 - idx }}>
                                    <AgentCoin agentTipo={ag} active={false} th={th} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="ia-msg-wrap" style={{ flex: 1, minWidth: 0 }}>
                            <IaMessage msg={msg} isTyping={typingSet.has(msg.id)} onDone={() => setTypingSet(p => { const n = new Set(p); n.delete(msg.id); return n; })} th={th} onOpenSidePanel={setSidePanelContent} fontSize={fontSize} userMessage={msg.userMessage || ''} handleSend={handleSend} isLastIaInSequence={msg.isLastInSequence} />
                          </div>
                        </div>
                      ) : (
                        <EditableUserMessage msg={msg} th={th} fontSize={fontSize} onSendEdit={handleEditMessage}/>
                      )}
                    </div>
                  ))}

                  {isChatLoading && (
                    <div className={isFullscreen ? 'ia-fs-msg' : ''}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        
                        {/* ESTRELA E AGENTES ATIVOS (DURANTE O LOADING) */}
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: '2px' }}>
                          <div style={{ zIndex: 10 }}>
                            <AnalyizStar size={starSize} active={true} dark={th.starDark}/>
                          </div>
                          {currentMessageAgents.length > 0 && (
                            <div style={{ display: 'flex', marginLeft: '-8px' }}>
                              {currentMessageAgents.map((ag, idx) => (
                                <div key={idx} style={{ marginLeft: idx === 0 ? 0 : '-12px', zIndex: 9 - idx }}>
                                  <AgentCoin agentTipo={ag} active={true} th={th} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <ThinkingPanel orchestrator={thinking} th={th}/>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>

          {!isNewSession && (
            <>
              <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_MIME} onChange={handleFileSelect} style={{ display: 'none' }}/>
              <InputBox
                th={th} fontSize={fontSize} chatInput={chatInput} setChatInput={setChatInput}
                handleSend={() => handleSend()} handleStopLoading={handleStopLoading} handleKeyDown={handleKeyDown} handlePaste={handlePaste}
                isChatLoading={isChatLoading} pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
                fileInputRef={fileInputRef} canSend={canSend} isFullscreen={isFullscreen}
              />
            </>
          )}
        </div>
      </div>

      {/* Botão flutuante */}
      <div style={{ position: 'fixed', zIndex: 9998, bottom: '1.5rem', right: '1.5rem', transform: isChatOpen ? 'scale(0)' : 'scale(1)', opacity: isChatOpen ? 0 : 1, transition: '0.2s', pointerEvents: isChatOpen ? 'none' : 'auto' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview} th={th}/>
      </div>
    </>
  );
}