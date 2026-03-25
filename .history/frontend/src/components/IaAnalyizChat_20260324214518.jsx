// frontend/src/components/IaAnalyizChat.jsx — v23
// Mudanças v23:
//  1. AnalyizFace REMOVIDO completamente (import, useAnalyizFaceState, detectFaceState, todos os usos)
//  2. Header, FloatingButton e mensagens usam AnalyizStar em todos os lugares
//  3. Nenhuma outra linha alterada — código idêntico ao v22 exceto pela remoção acima

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Paperclip, X, Plus, ExternalLink,
  FileText, FileSpreadsheet, Music, File, Image as ImageIcon,
  CheckCircle, Sun, Moon, BookOpen, Download, Copy,
  Search, Menu, Monitor, BarChart2, Users, MessageCircle,
  TrendingUp, Edit2, Check, FileCode,
} from 'lucide-react';

import AnalyizStar from './Analyizstar';

const API_BASE_URL  = 'http://localhost:3000';
const SESSION_KEY   = 'analyiz_last_session_id';
const POLL_INITIAL  = 8 * 1000;
const POLL_INTERVAL = 10 * 60 * 1000;
const MAX_FILES     = 10;

const TYPEWRITER_CHAR_MS   = 18;
const STEP_MIN_DURATION_MS = 900;
const STEP_SEQUENCE_GAP_MS = 180;
const TICK_MS              = 1000;
const THINKING_CHUNK_MS    = 12;

// ═══════════════════════════════════════════════════════════════════════════════
// SKILLS DINÂMICAS
// ═══════════════════════════════════════════════════════════════════════════════
const DYNAMIC_SKILLS = {
  excel:       { detect: msg => /planilha|csv|excel|xlsx|xls|tabela|coluna|linha|dados estruturados/i.test(msg), steps: [{ text: 'Lendo planilha e extraindo dados estruturados…', desc: 'Há uma planilha ou arquivo de dados para processar. Protocolo: Etapa A (Extração) — identificar todas as colunas, cabeçalhos e métricas-chave; Etapa B (Correlação) — cruzar os dados com o contexto do projeto; Etapa C (Síntese) — produzir análise com as descobertas mais relevantes.' }] },
  pdf:         { detect: msg => /pdf|documento|relatório|laudo|contrato|nota fiscal|nf-e/i.test(msg), steps: [{ text: 'Extraindo texto do documento PDF…', desc: 'Iniciando leitura completa do PDF. Protocolo: Etapa A (OCR e extração) — capturar todo o texto, tabelas e metadados; Etapa B (Classificação) — identificar o tipo de documento e suas seções principais; Etapa C (Análise) — extrair informações relevantes para o contexto do usuário.' }] },
  image:       { detect: (msg, fileNames, numImages) => numImages > 0 || /imagem|foto|screenshot|print|captura|visual/i.test(msg), steps: [{ text: 'Ativando visão computacional para análise da imagem…', desc: 'Processando a imagem com modelo de visão. Etapa A (Detecção) — identificar todos os elementos visuais, textos, layouts e contextos presentes; Etapa B (Interpretação) — relacionar o conteúdo visual com a pergunta do usuário; Etapa C (Insights) — gerar análise precisa baseada no que foi detectado.' }] },
  code:        { detect: msg => /código|componente|jsx|react|função|arquivo|bug|erro|fix|corrigir|html|css|javascript|typescript|python|sql/i.test(msg), steps: [{ text: 'Analisando estrutura do código-fonte…', desc: 'Iniciando análise técnica multi-camada. Etapa A (Sintaxe) — verificar erros de escrita, imports ausentes e compatibilidade de versão; Etapa B (Lógica) — mapear o fluxo de dados, identificar gargalos e estados incorretos; Etapa C (Segurança) — verificar vulnerabilidades, tratamento de erros e padrões do projeto.' }, { text: 'Verificando padrões e dependências do projeto…', desc: 'Cruzando o código com as convenções do projeto.' }] },
  logistica:   { detect: msg => /divergên|peso|frete|auditoria|varredura|anúncio|reincidente|pendente/i.test(msg), steps: [{ text: 'Consultando divergências de peso/frete no banco de dados…', desc: 'Acessando o banco de dados para recuperar divergências ativas.' }, { text: 'Cruzando dados de logística com os anúncios do Mercado Livre…', desc: 'Correlacionando os dados de divergência com os anúncios ativos via API do ML.' }] },
  catalogo:    { detect: msg => /produto|sku|catálogo|kit|estoque|vincul|cadastr/i.test(msg), steps: [{ text: 'Consultando catálogo de produtos e SKUs…', desc: 'Acessando o banco de dados do catálogo.' }] },
  usuarios:    { detect: msg => /usuário|acesso|aprovação|bloquear|permiss|role|owner|admin/i.test(msg), steps: [{ text: 'Verificando permissões e usuários pendentes…', desc: 'Consultando o sistema de controle de acesso.' }] },
  precificacao:{ detect: msg => /preço|precific|valor|custo|faturamento|margem/i.test(msg), steps: [{ text: 'Analisando histórico de preços e estratégia de precificação…', desc: 'Recuperando o histórico de alterações de preço dos anúncios.' }] },
  dashboard:   { detect: msg => /resumo|relatório|métrica|dashboard|visão geral|panorama|status geral/i.test(msg), steps: [{ text: 'Compilando métricas e indicadores do sistema…', desc: 'Consultando múltiplas fontes de dados em paralelo.' }] },
  audio:       { detect: (msg, fileNames) => (fileNames || []).some(n => /\.(mp3|wav|ogg|m4a|webm)$/i.test(n)), steps: [{ text: 'Transcrevendo áudio com reconhecimento de fala…', desc: 'Processando o arquivo de áudio com modelo de transcrição.' }] },
  website:     { detect: msg => /site|website|landing page|página web|html.*css|criar.*página|desenvolver.*site/i.test(msg), steps: [{ text: 'Planejando estrutura e layout da página…', desc: 'Analisando os requisitos do site: estrutura HTML, estilo CSS, responsividade e experiência visual.' }, { text: 'Gerando HTML semântico e CSS otimizado…', desc: 'Criando o código com estrutura semântica e CSS moderno.' }] },
  default:     { detect: () => true, steps: [{ text: 'Analisando intenção da solicitação…', desc: 'Interpretando a mensagem para identificar o objetivo principal.' }] },
};

const EMOTION_PATTERNS = [
  { regex: /\b(brav[ao]|irritad[ao]|furioso|raiva|ódio|que merda|droga|porra|que absurdo)\b/i, text: '😤 Detectando frustração na mensagem…', desc: 'O usuário demonstra sinais de frustração. Ajustando o tom da resposta para ser direto e focado em solução.' },
  { regex: /\b(triste|chateado|deprimid[ao]|mal|péssimo|horrível|chorando)\b/i, text: '😔 Detectando sentimento negativo…', desc: 'Identificado tom emocional negativo. A resposta será estruturada com empatia.' },
  { regex: /\b(urgente|rápido|agora|imediato|urgência|preciso já|socorro)\b/i, text: '⚡ Detectando urgência na solicitação…', desc: 'O usuário sinaliza urgência. Priorizando velocidade e clareza na resposta.' },
  { regex: /\b(ansios[ao]|preocupad[ao]|nervos[ao]|assustado|medo|tenso)\b/i, text: '😰 Detectando ansiedade na mensagem…', desc: 'O usuário parece ansioso. A resposta equilibrará clareza técnica com tom tranquilizador.' },
  { regex: /\b(feliz|ótimo|excelente|incrível|perfeito|amei|adorei|massa|show)\b/i, text: '😊 Detectando entusiasmo positivo…', desc: 'O usuário está animado. Manterei o tom positivo na resposta.' },
];

function detectEmotion(msg) {
  if (!msg) return null;
  for (const p of EMOTION_PATTERNS) if (p.regex.test(msg)) return p;
  return null;
}

function selectSkills(message, fileNames = [], numImages = 0) {
  const msg      = message || '';
  const selected = [];
  const emotion  = detectEmotion(msg);
  if (emotion) selected.push({ text: emotion.text, desc: emotion.desc });

  const hasExcel = fileNames.some(n => /\.(xlsx|xls|csv)$/i.test(n));
  const hasPdf   = fileNames.some(n => /\.pdf$/i.test(n));
  const hasAudio = fileNames.some(n => /\.(mp3|wav|ogg|m4a|webm)$/i.test(n));
  if (hasExcel) selected.push(...DYNAMIC_SKILLS.excel.steps);
  if (hasPdf)   selected.push(...DYNAMIC_SKILLS.pdf.steps);
  if (hasAudio) selected.push(...DYNAMIC_SKILLS.audio.steps);
  if (numImages > 0) selected.push(...DYNAMIC_SKILLS.image.steps);

  const skillOrder = ['website', 'code', 'logistica', 'catalogo', 'usuarios', 'precificacao', 'dashboard'];
  for (const key of skillOrder) {
    const skill = DYNAMIC_SKILLS[key];
    if (skill.detect(msg, fileNames, numImages)) { selected.push(...skill.steps); break; }
  }
  selected.push({ text: 'Verificando contexto e permissões do usuário…', desc: 'Validando o role do usuário.' });
  selected.push({ text: 'Preparando resposta…', desc: 'Consolidando todas as informações coletadas.' });

  const hasSpecific = selected.some(s =>
    s.text !== 'Verificando contexto e permissões do usuário…' &&
    s.text !== 'Preparando resposta…' &&
    !EMOTION_PATTERNS.some(e => e.text === s.text)
  );
  if (!hasSpecific) selected.splice(selected.length - 2, 0, ...DYNAMIC_SKILLS.default.steps);
  return selected.map((s, i) => ({ ...s, id: `step-${i}-${Date.now()}`, status: i === 0 ? 'active' : 'waiting' }));
}

function gerarNomeArquivo(lang, userMessage, index, usedNames) {
  const msg  = (userMessage || '').toLowerCase();
  const l    = (lang || '').toLowerCase().trim();
  const EXT  = { html:'html', css:'css', js:'js', jsx:'jsx', ts:'ts', tsx:'tsx', py:'py', sql:'sql', json:'json', sh:'sh', bash:'sh', md:'md', yaml:'yaml', yml:'yaml', xml:'xml', java:'java', cs:'cs', cpp:'cpp', go:'go', rs:'rs', rb:'rb', php:'php', swift:'swift', kt:'kt', txt:'txt', env:'env', dockerfile:'dockerfile', toml:'toml' };
  const ext  = EXT[l] || l || 'txt';
  let base   = '';
  const patterns = [
    { regex: /petshop|pet shop|loja.*pet/i, name: 'petshop' }, { regex: /landing page|página.*vendas|sales/i, name: 'landing_page' },
    { regex: /portfolio|portfólio/i, name: 'portfolio' }, { regex: /login|autenticação|auth/i, name: 'login' },
    { regex: /dashboard|painel|admin/i, name: 'dashboard' }, { regex: /restaurante|cardápio|delivery/i, name: 'restaurante' },
    { regex: /e-?commerce|loja.*online|store/i, name: 'ecommerce' }, { regex: /blog|artigo|post/i, name: 'blog' },
    { regex: /calculadora|calculator/i, name: 'calculadora' }, { regex: /formulário|form|contato/i, name: 'formulario' },
    { regex: /divergenc|frete|peso/i, name: 'divergencias' }, { regex: /usuario|user|perfil/i, name: 'usuarios' },
  ];
  for (const p of patterns) { if (p.regex.test(msg)) { base = p.name; break; } }
  if (!base) {
    const d = { html:'pagina', css:'estilo', js:'script', jsx:'componente', tsx:'componente', ts:'codigo', py:'script', sql:'query', json:'dados', sh:'script', yaml:'config', xml:'dados', java:'codigo', cs:'codigo', cpp:'codigo', go:'codigo', rs:'codigo', rb:'script', php:'script', md:'documento' };
    base = d[l] || 'arquivo';
  }
  const suf = { html:'', css:'_estilo', js:'_script', jsx:'_componente', tsx:'_componente', py:'_script', sql:'_query' };
  const suffix   = suf[l] !== undefined ? suf[l] : '';
  let filename   = `${base}${suffix}.${ext}`;
  let attempt    = 1;
  while (usedNames && usedNames.has(filename)) { attempt++; filename = `${base}${suffix}_${attempt}.${ext}`; }
  if (usedNames) usedNames.add(filename);
  return filename;
}

// ─── Parse blocos por parágrafo duplo ────────────────────────────────────────
function parseResponseBlocks(content) {
  if (!content) return [''];
  const normalized = content.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>').replace(/\n{3,}/g, '\n\n');
  const blocks = normalized.split(/(?:<br>\s*<br>|\n\n)/).map(b => b.trim()).filter(Boolean);
  return blocks.length > 0 ? blocks : [content];
}

// ═══════════════════════════════════════════════════════════════════════════════
// useThinkingOrchestrator
// ═══════════════════════════════════════════════════════════════════════════════
function useThinkingOrchestrator() {
  const [phase,           setPhase]           = useState('idle');
  const [steps,           setSteps]           = useState([]);
  const [reasoningLog,    setReasoningLog]    = useState([]);
  const [elapsedMs,       setElapsedMs]       = useState(0);
  const [isOpen,          setIsOpen]          = useState(true);
  const [isReadyForReply, setIsReadyForReply] = useState(false);

  const startRef     = useRef(null);
  const tickRef      = useRef(null);
  const stepTimerRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const chunkTimerRef = useRef(null);
  const stepsRef     = useRef([]);

  const reset = useCallback(() => {
    setPhase('idle'); setSteps([]); setReasoningLog([]); setElapsedMs(0);
    setIsOpen(true); setIsReadyForReply(false);
    clearInterval(tickRef.current); clearTimeout(stepTimerRef.current); clearInterval(chunkTimerRef.current);
    chunkQueueRef.current = []; stepsRef.current = []; startRef.current = null;
  }, []);

  const scheduleStepAdvance = useCallback((currentIdx, allSteps) => {
    if (currentIdx >= allSteps.length - 1) return;
    const textDuration = (allSteps[currentIdx].text.length * TYPEWRITER_CHAR_MS) + STEP_MIN_DURATION_MS;
    clearTimeout(stepTimerRef.current);
    stepTimerRef.current = setTimeout(() => {
      setSteps(prev => prev.map((s, i) => {
        if (i === currentIdx)     return { ...s, status: 'done' };
        if (i === currentIdx + 1) return { ...s, status: 'active' };
        return s;
      }));
      scheduleStepAdvance(currentIdx + 1, allSteps);
    }, textDuration + STEP_SEQUENCE_GAP_MS);
  }, []);

  const start = useCallback((message, hasFiles, fileNames = [], numImages = 0) => {
    reset();
    const generated = selectSkills(message, fileNames, numImages);
    stepsRef.current = generated;
    setSteps(generated); setPhase('thinking'); setIsOpen(true); setIsReadyForReply(false);
    startRef.current = Date.now();
    tickRef.current  = setInterval(() => setElapsedMs(Date.now() - startRef.current), TICK_MS);
    scheduleStepAdvance(0, generated);
  }, [reset, scheduleStepAdvance]);

  const flushChunk = useCallback(() => {
    if (!chunkQueueRef.current.length) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; return; }
    const char = chunkQueueRef.current.shift();
    setReasoningLog(prev => {
      if (!prev.length) return [{ id: 'live', text: char }];
      const last = prev[prev.length - 1];
      if (last.id === 'live') { const next = [...prev]; next[next.length - 1] = { ...last, text: last.text + char }; return next; }
      return [...prev, { id: 'live', text: char }];
    });
  }, []);

  const pushChunk = useCallback((text) => {
    for (const c of (text || '')) chunkQueueRef.current.push(c);
    if (!chunkTimerRef.current) chunkTimerRef.current = setInterval(flushChunk, THINKING_CHUNK_MS);
  }, [flushChunk]);

  const addReasoningBlock = useCallback((text) => {
    if (!text) return;
    setReasoningLog(prev => [...prev, { id: Date.now(), text }]);
  }, []);

  const finish = useCallback(() => {
    clearInterval(tickRef.current); clearTimeout(stepTimerRef.current); clearInterval(chunkTimerRef.current);
    const rem = chunkQueueRef.current.join(''); chunkQueueRef.current = [];
    if (rem) {
      setReasoningLog(prev => {
        if (!prev.length) return [{ id: 'final', text: rem }];
        const last = prev[prev.length - 1];
        const next = [...prev]; next[next.length - 1] = { ...last, text: last.text + rem }; return next;
      });
    }
    setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
    setPhase('done'); setIsReadyForReply(true);
  }, []);

  const addBackendStep = useCallback((msg) => {
    setSteps(prev => {
      const updated = prev.map(s => s.status === 'active' ? { ...s, status: 'done' } : s);
      return [...updated, { id: `b-${Date.now()}`, text: msg, desc: null, status: 'active' }];
    });
  }, []);

  return { phase, steps, reasoningLog, elapsedMs, isOpen, setIsOpen, isReadyForReply, start, finish, reset, pushChunk, addReasoningBlock, addBackendStep };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMAS
// ═══════════════════════════════════════════════════════════════════════════════
const THEMES = {
  light: {
    bg:'#ffffff', surface:'#f8fafc', border:'#e2e8f0',
    text:'#1e293b', textMuted:'#64748b', textFaint:'#94a3b8',
    brand:'#1e293b', userBubble:'#f0f0f0', userText:'#333',
    chatAreaBg:'#ffffff', sidebarBg:'#f8fafc',
    inputAreaBg:'#ffffff', inputBoxBg:'#f1f3f4', inputBoxBorder:'#e8eaed',
    quickActionBg:'#f1f3f4', quickActionHover:'#e8eaed',
    greetingGradient:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    codeBg:'#f6f8fa', codeBorder:'#e1e4e8',
    stepDescBg:'rgba(66,133,244,0.04)', stepDescBorder:'rgba(66,133,244,0.15)',
    fadeGradient:'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 100%)',
    starDark: false,
  },
  dark: {
    bg:'#131314', surface:'#1e1f20', border:'#3c4043',
    text:'#e3e3e3', textMuted:'#9aa0a6', textFaint:'#5f6368',
    brand:'#8ab4f8', userBubble:'#303134', userText:'#e3e3e3',
    chatAreaBg:'#131314', sidebarBg:'#1e1f20',
    inputAreaBg:'#131314', inputBoxBg:'#1e1f20', inputBoxBorder:'transparent',
    quickActionBg:'#282a2c', quickActionHover:'#303134',
    greetingGradient:'linear-gradient(135deg, #8ab4f8 0%, #c084fc 100%)',
    codeBg:'#1a1b1e', codeBorder:'#3c4043',
    stepDescBg:'rgba(66,133,244,0.06)', stepDescBorder:'rgba(66,133,244,0.18)',
    fadeGradient:'linear-gradient(to bottom, #131314 0%, rgba(19,19,20,0) 100%)',
    starDark: true,
  },
};

const GREETINGS = [
  u => `Olá${u?`, ${u}`:''}! Por onde começamos? ✨`,
  u => `Oi${u?` ${u}`:''}! Como posso te ajudar hoje?`,
  u => `Bem-vindo${u?`, ${u}`:''}! O que vamos explorar?`,
  u => `${u?`${u}, pronto`:'Pronto'} para começar!`,
  u => `Olá${u?` ${u}`:''}! Tenho novidades pra compartilhar! 🚀`,
];

const QUICK_ACTIONS = [
  { icon:BarChart2,     label:'Resumo de vendas',  prompt:'Me mostre um resumo das vendas recentes' },
  { icon:Users,         label:'Analisar clientes', prompt:'Quais são meus clientes mais ativos?' },
  { icon:MessageCircle, label:'Ver conversas',      prompt:'Mostre as últimas conversas do WhatsApp' },
  { icon:TrendingUp,    label:'Métricas do dia',    prompt:'Quais são as métricas de hoje?' },
];

const FILE_TYPES = {
  'image/jpeg':{group:'image',icon:ImageIcon},'image/png':{group:'image',icon:ImageIcon},
  'image/gif':{group:'image',icon:ImageIcon},'image/webp':{group:'image',icon:ImageIcon},
  'application/pdf':{group:'pdf',icon:FileText},
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{group:'excel',icon:FileSpreadsheet},
  'application/vnd.ms-excel':{group:'excel',icon:FileSpreadsheet},
  'text/csv':{group:'excel',icon:FileSpreadsheet},'text/plain':{group:'txt',icon:FileText},
  'audio/mpeg':{group:'audio',icon:Music},'audio/wav':{group:'audio',icon:Music},
  'audio/ogg':{group:'audio',icon:Music},'audio/mp4':{group:'audio',icon:Music},
  'audio/webm':{group:'audio',icon:Music},
};
const ACCEPTED_MIME = Object.keys(FILE_TYPES).join(',');
const MAX_FILE_SIZE = 25*1024*1024;
const GROUP_COLORS  = {image:'#3b82f6',pdf:'#ef4444',excel:'#10b981',txt:'#8b5cf6',audio:'#f59e0b',unknown:'#94a3b8'};
function getFileInfo(t){return FILE_TYPES[t]||{group:'unknown',icon:File};}
function deriveTitle(msgs){const f=msgs?.find(m=>m.role==='user'&&m.content?.trim());if(!f)return'Nova conversa';return f.content.length<=40?f.content:f.content.substring(0,37)+'…';}
function detectLang(lang){const m={js:'JavaScript',jsx:'React JSX',ts:'TypeScript',tsx:'TypeScript React',py:'Python',html:'HTML',css:'CSS',json:'JSON',sql:'SQL',sh:'Shell',bash:'Shell',yaml:'YAML',xml:'XML',java:'Java',cs:'C#',cpp:'C++',go:'Go',rs:'Rust',rb:'Ruby',php:'PHP',swift:'Swift',kt:'Kotlin'};return m[lang?.toLowerCase()]||lang?.toUpperCase()||'Código';}

function processTextAndCode(content, userMessage = '') {
  if (!content) return [];
  const parts = [];
  const re = /```([a-zA-Z0-9_+#.\-]*)[^\S\r\n]*\r?\n?([\s\S]*?)```/g;
  let match, last = 0;
  while ((match = re.exec(content)) !== null) {
    const tb = content.substring(last, match.index);
    if (tb.trim()) parts.push({ type: 'text', content: tb });
    const lang = (match[1] || '').trim().toLowerCase();
    const code = match[2] || '';
    if (code.trim()) parts.push({ type: 'code', lang: lang || 'txt', content: code });
    last = re.lastIndex;
  }
  const rem = content.substring(last);
  if (rem.trim()) parts.push({ type: 'text', content: rem });
  return parts;
}

function enrichHTML(h){if(!h)return'';return h.replace(/\b(MLB\d+)\b(?![^<]*>)/g,'<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#f59e0b;font-weight:600;text-decoration:underline">$1</a>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*([^*\n<]+)\*/g,'<b>$1</b>').replace(/^#{1,6}\s+/gm,'').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>').trim();}
function extractLinks(html){const links=[],re=/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;let m;while((m=re.exec(html))!==null){const h=m[1],l=m[2].trim()||m[1];if(h&&h!=='#')links.push({href:h,label:l});}return[...new Map(links.map(l=>[l.href,l])).values()];}
function getTime(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function safeTime(v){if(!v)return getTime();const d=new Date(v);return isNaN(d.getTime())?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function formatDuration(ms){const s=Math.round(ms/1000);if(s<60)return`${s} segundo${s!==1?'s':''}`;const m=Math.floor(s/60);return`${m} min ${s%60}s`;}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS GLOBAL
// ═══════════════════════════════════════════════════════════════════════════════
const CHAT_STYLES = (th, fs) => `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono&display=swap');

  @keyframes ia-spin       { to{transform:rotate(360deg);} }
  @keyframes ia-blink      { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes ia-fade-in    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ia-greeting   { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes ia-dots       { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
  @keyframes ia-step-in    { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
  @keyframes ia-desc-in    { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

  .ia-chat-root *{box-sizing:border-box;}
  .ia-chat-root{font-family:'Google Sans',Roboto,sans-serif!important;font-size:${fs}px;color:${th.text};}

  .ia-scroll::-webkit-scrollbar{width:4px}
  .ia-scroll::-webkit-scrollbar-track{background:transparent}
  .ia-scroll::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px}

  .ia-msg{font-family:'Google Sans',sans-serif!important;font-size:${fs}px;line-height:1.65;color:${th.text};animation:ia-fade-in 0.3s ease;}
  .ia-msg a{color:#8ab4f8!important;text-decoration:underline;font-weight:500;}
  .ia-msg b{font-weight:600;}

  /* Header invisível */
  .ia-header-ghost {
    background: ${th.chatAreaBg} !important;
    border-bottom: none !important;
    position: relative;
    z-index: 10;
  }
  .ia-header-ghost .ia-header-btn { opacity:0.35; transition:opacity 0.18s ease; }
  .ia-header-ghost:hover .ia-header-btn { opacity:0.75; }
  .ia-header-ghost .ia-header-title { opacity:0.40; transition:opacity 0.18s ease; }
  .ia-header-ghost:hover .ia-header-title { opacity:0.75; }

  /* Fade no topo */
  .ia-msg-area-wrap { position:relative; flex:1; display:flex; flex-direction:column; overflow:hidden; }
  .ia-msg-area-wrap::before { content:''; position:absolute; top:0; left:0; right:0; height:64px; background:${th.fadeGradient}; pointer-events:none; z-index:3; }

  /* Input sem divisória */
  .ia-input-area-ghost { background:${th.inputAreaBg}!important; border-top:none!important; padding-top:4px!important; }
  .ia-input-box { background:${th.inputBoxBg}!important; border:1.5px solid ${th.inputBoxBorder}!important; border-radius:24px; padding:12px 16px; display:flex; flex-direction:column; gap:8px; transition:border-color 0.2s,box-shadow 0.2s; }
  .ia-input-box:focus-within { border-color:rgba(138,180,248,0.45)!important; box-shadow:0 0 0 2px rgba(138,180,248,0.08); }

  .ia-textarea{flex:1;background:transparent;border:none;outline:none;color:${th.text};resize:none;padding:0;font-size:${fs}px;font-family:'Google Sans',sans-serif;max-height:160px;line-height:1.5;}
  .ia-textarea::placeholder{color:${th.textFaint};}

  /* ThinkingPanel */
  .ia-think-panel{margin-bottom:10px;}
  .ia-think-header{display:flex;align-items:center;gap:7px;background:none;border:none;cursor:pointer;padding:3px 0;font-family:'Google Sans',sans-serif;user-select:none;transition:opacity 0.15s;}
  .ia-think-header:hover{opacity:0.75;}
  .ia-think-step{display:flex;flex-direction:column;padding:3px 0;animation:ia-step-in 0.28s cubic-bezier(0.4,0,0.2,1) both;}
  .ia-think-step.waiting{display:none;}
  .ia-step-row{display:flex;align-items:flex-start;gap:10px;}
  .ia-step-desc{margin-left:28px;margin-top:4px;margin-bottom:6px;padding:8px 12px;background:${th.stepDescBg};border-left:2px solid ${th.stepDescBorder};border-radius:0 6px 6px 0;font-size:${Math.max(11,fs-2)}px;line-height:1.6;color:${th.textMuted};font-family:'Google Sans',sans-serif!important;font-style:italic;animation:ia-desc-in 0.25s ease both;}
  .ia-step-text{font-family:'Google Sans Mono','Cascadia Code',ui-monospace,monospace!important;font-size:${Math.max(11,fs-2)}px;line-height:1.5;padding-top:1px;}

  .ia-sidebar-panel{width:260px;background:${th.sidebarBg};border-right:1px solid ${th.border};display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;transition:width 0.28s cubic-bezier(0.4,0,0.2,1),opacity 0.22s ease,min-width 0.28s;min-width:260px;}
  .ia-sidebar-panel.closed{width:0;min-width:0;opacity:0;pointer-events:none;}
  .ia-sidebar-item{transition:background 0.12s ease;border-radius:8px;margin:1px 6px;cursor:pointer;}
  .ia-sidebar-item:hover{background:${th.quickActionHover}!important;}
  .ia-sidebar-item:hover .ia-del-btn{opacity:1!important;}

  .ia-tip{position:relative;}
  .ia-tip:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100%+6px);left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;font-size:11px;padding:4px 8px;border-radius:6px;white-space:nowrap;pointer-events:none;z-index:999999;font-family:'Google Sans',sans-serif;}

  .ia-code-block{border-radius:10px;overflow:hidden;margin:8px 0;border:1px solid ${th.codeBorder};}
  .ia-code-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:${th.codeBg};border-bottom:1px solid ${th.codeBorder};}
  .ia-code-body{background:${th.codeBg};padding:14px;overflow-x:auto;font-size:${Math.max(11,fs-2)}px;line-height:1.5;color:${th.text};white-space:pre;max-height:320px;overflow-y:auto;font-family:'Google Sans Mono',monospace;}
  .ia-code-body::-webkit-scrollbar{height:4px;width:4px;}
  .ia-code-body::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px;}

  .ia-msg-wrap:hover .ia-msg-actions{opacity:1!important;}
  .ia-chip{transition:all 0.15s ease;cursor:pointer;}
  .ia-chip:hover{background:${th.quickActionHover}!important;transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,0.1);}
  .ia-fs-msg{max-width:720px;width:100%;margin:0 auto;padding:0 24px;}
  .ia-header-star{transition:transform 0.3s cubic-bezier(0.34,1.2,0.64,1);}
  .ia-header-star:hover{transform:scale(1.08);}
`;

// ─── TypewriterSpan ───────────────────────────────────────────────────────────
function TypewriterSpan({ text, active, onDone }) {
  const [displayed, setDisplayed] = useState('');
  const timerRef = useRef(null);
  const doneRef  = useRef(false);
  useEffect(() => {
    if (!active) { setDisplayed(text); return; }
    setDisplayed(''); doneRef.current = false; clearInterval(timerRef.current);
    let idx = 0;
    timerRef.current = setInterval(() => {
      idx++; setDisplayed(text.slice(0, idx));
      if (idx >= text.length) { clearInterval(timerRef.current); if (!doneRef.current) { doneRef.current = true; setTimeout(() => onDone?.(), 60); } }
    }, TYPEWRITER_CHAR_MS);
    return () => clearInterval(timerRef.current);
  }, [text, active]);
  const showCursor = active && displayed.length < text.length;
  return (
    <span>
      {displayed}
      {showCursor && <span style={{ display:'inline-block', width:'1.5px', height:'12px', background:'#8ab4f8', marginLeft:'2px', verticalAlign:'text-bottom', animation:'ia-blink 0.7s step-end infinite' }}/>}
    </span>
  );
}

// ─── ThinkingStepRow ──────────────────────────────────────────────────────────
function ThinkingStepRow({ step, th }) {
  const isActive  = step.status === 'active';
  const isDone    = step.status === 'done';
  if (step.status === 'waiting') return null;
  return (
    <div className="ia-think-step">
      <div className="ia-step-row">
        <div style={{ width:'18px', height:'18px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:'1px' }}>
          {isDone   ? <CheckCircle size={14} style={{ color:'#8ab4f8', opacity:0.8 }}/> :
           isActive ? <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#4285F4', display:'inline-block', animation:'ia-dots 1.2s ease-in-out infinite' }}/> : null}
        </div>
        <span className="ia-step-text" style={{ color: isDone ? th.textMuted : isActive ? th.text : 'transparent', fontWeight: isActive ? 500 : 400, transition:'color 0.2s' }}>
          {isActive ? <TypewriterSpan text={step.text} active={true} onDone={() => {}}/> : step.text}
        </span>
      </div>
      {isActive && step.desc && <div className="ia-step-desc">{step.desc}</div>}
    </div>
  );
}

// ─── ThinkingPanel ────────────────────────────────────────────────────────────
function parseReasoningBlocks(text) {
  if (!text) return [];
  return text.split(/\n\n+/).map(seg => {
    const t = seg.trim(); if (!t) return null;
    const m = t.match(/^\*\*(.+?)\*\*$/);
    return m ? { type: 'title', text: m[1] } : { type: 'paragraph', text: t };
  }).filter(Boolean);
}

function ThinkingReasoningContent({ fullText, isLive, th, fontSize }) {
  const [displayed, setDisplayed] = useState('');
  const queueRef   = useRef([]);
  const timerRef   = useRef(null);
  useEffect(() => {
    queueRef.current = (fullText || '').split('');
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!queueRef.current.length) { clearInterval(timerRef.current); return; }
      const batch = queueRef.current.splice(0, 3).join('');
      setDisplayed(prev => prev + batch);
    }, TYPEWRITER_CHAR_MS);
    return () => clearInterval(timerRef.current);
  }, [fullText]);
  const blocks     = parseReasoningBlocks(displayed);
  const showCursor = isLive && displayed.length < (fullText || '').length;
  return (
    <div style={{ paddingTop:'4px' }}>
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        if (block.type === 'title') return <div key={i} style={{ fontWeight:700, fontSize:'13px', color:th.text, fontFamily:"'Google Sans',sans-serif", marginTop:i>0?'14px':'4px', marginBottom:'4px', lineHeight:1.4 }}>{block.text}</div>;
        return (
          <div key={i} style={{ fontStyle:'italic', fontSize:'12.5px', color:th.textMuted, fontFamily:"'Google Sans',sans-serif", lineHeight:1.65, marginBottom:'2px' }}>
            {block.text}
            {isLast && showCursor && <span style={{ display:'inline-block', width:'1.5px', height:'12px', background:th.textFaint, marginLeft:'2px', verticalAlign:'text-bottom', animation:'ia-blink 0.8s step-end infinite' }}/>}
          </div>
        );
      })}
    </div>
  );
}

function ThinkingPanel({ orchestrator, th, fontSize }) {
  const { phase, steps, reasoningLog, elapsedMs, isOpen, setIsOpen } = orchestrator;
  if (phase === 'idle') return null;
  const isFinished = phase === 'done';
  const label      = isFinished ? `Pensou por ${formatDuration(elapsedMs)}` : 'Pensando…';
  return (
    <div className="ia-think-panel">
      <button className="ia-think-header" onClick={() => setIsOpen(v => !v)}>
        <div style={{ width:'18px', height:'18px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isFinished
            ? <CheckCircle size={14} style={{ color:th.textFaint, opacity:0.6 }}/>
            : <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#4285F4', display:'inline-block', animation:'ia-dots 1.0s ease-in-out infinite' }}/>
          }
        </div>
        <span style={{ fontSize:'13px', fontWeight:500, color:isFinished?th.textFaint:'#4285F4', fontFamily:"'Google Sans',sans-serif", fontStyle:isFinished?'normal':'italic', transition:'color 0.3s' }}>
          {label}
        </span>
        {isOpen ? <ChevronUp size={13} style={{ opacity:0.4, color:th.textFaint }}/> : <ChevronDown size={13} style={{ opacity:0.4, color:th.textFaint }}/>}
      </button>
      <div style={{ overflow:'hidden', maxHeight:isOpen?'1000px':'0px', opacity:isOpen?1:0, transition:isOpen?'max-height 0.45s cubic-bezier(0.4,0,0.2,1),opacity 0.28s ease':'max-height 0.38s cubic-bezier(0.4,0,0.2,1),opacity 0.2s ease' }}>
        <div style={{ marginTop:'6px', marginLeft:'4px', paddingLeft:'14px', borderLeft:`2px solid ${isFinished?th.border:'#4285F4'}`, transition:'border-color 0.5s ease' }}>
          {steps.map(step => step.status !== 'waiting' && <ThinkingStepRow key={step.id} step={step} th={th}/>)}
          {reasoningLog.length > 0 && <ThinkingReasoningContent fullText={reasoningLog.map(b => b.text).join('')} isLive={phase==='thinking'} th={th} fontSize={fontSize}/>}
        </div>
      </div>
    </div>
  );
}

// ─── DiffusionText / SafeHTMLMsg ──────────────────────────────────────────────
function DiffusionText({ html, onDoneRef }) {
  const [scrambled, setScrambled] = useState('');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*';
  useEffect(() => {
    let mounted = true;
    const tokens = [];
    let i = 0;
    while (i < html.length) {
      if (html[i]==='<'){let e=html.indexOf('>',i);if(e===-1)e=html.length;tokens.push({type:'tag',val:html.substring(i,e+1),resolved:true});i=e+1;}
      else if(html[i]==='&'){let e=html.indexOf(';',i);if(e===-1)e=html.length;tokens.push({type:'char',val:html.substring(i,e+1),resolved:false});i=e+1;}
      else{tokens.push({type:'char',val:html[i],resolved:html[i]===' '||html[i]==='\n'});i++;}
    }
    let iter=0;const maxIter=32;
    const iv=setInterval(()=>{
      if(!mounted)return;iter++;
      let cur='';let allResolved=true;
      tokens.forEach((tk,idx)=>{
        if(tk.type==='tag'||tk.resolved){cur+=tk.val;}
        else{const p=iter/maxIter,t=idx/tokens.length;if(p>t+Math.random()*0.15){tk.resolved=true;cur+=tk.val;}else{allResolved=false;cur+=chars[Math.floor(Math.random()*chars.length)];}}
      });
      setScrambled(cur);
      if(allResolved||iter>=maxIter){clearInterval(iv);setScrambled(html);setTimeout(()=>onDoneRef?.current?.(),0);}
    },38);
    return()=>{mounted=false;clearInterval(iv);};
  },[html,onDoneRef]);
  return <SafeHTMLMsg html={scrambled}/>;
}

function SafeHTMLMsg({ html }) {
  const ref = useRef(null);
  useEffect(()=>{if(!ref.current)return;ref.current.querySelectorAll('a[href^="http"]').forEach(a=>{a.style.cssText='color:#8ab4f8;text-decoration:underline;font-weight:500';a.setAttribute('target','_blank');a.setAttribute('rel','noopener noreferrer');});},[html]);
  return <span ref={ref} dangerouslySetInnerHTML={{__html:html}} style={{wordBreak:'break-word'}}/>;
}

// ─── InlineCodeBlock ──────────────────────────────────────────────────────────
function InlineCodeBlock({ lang, code, th, onOpenSidePanel, filename }) {
  const [copied, setCopied] = useState(false);
  const label      = detectLang(lang);
  const lines      = code.split('\n');
  const preview    = lines.slice(0, 8).join('\n');
  const hasMore    = lines.length > 8;
  const handleCopy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),1800); };
  return (
    <div className="ia-code-block">
      <div className="ia-code-header">
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <FileCode size={14} style={{color:th.brand}}/>
          <span style={{fontSize:'12px',fontWeight:600,color:th.text,fontFamily:"'Google Sans Mono',monospace"}}>{filename}</span>
          <span style={{fontSize:'10px',color:th.textFaint,background:th.surface,padding:'1px 6px',borderRadius:'4px',border:`1px solid ${th.border}`}}>{label}</span>
        </div>
        <div style={{display:'flex',gap:'6px'}}>
          <button onClick={handleCopy} style={{background:'none',border:'none',color:copied?'#10b981':th.textFaint,cursor:'pointer',padding:'3px',borderRadius:'5px',display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',transition:'all 0.15s'}}>
            {copied?<><Check size={13}/> Copiado</>:<><Copy size={13}/> Copiar</>}
          </button>
          <button onClick={()=>onOpenSidePanel({lang,code,filename})} style={{background:'none',border:`1px solid ${th.border}`,color:th.brand,cursor:'pointer',padding:'3px 8px',borderRadius:'6px',display:'flex',alignItems:'center',gap:'4px',fontSize:'11px'}}>
            <BookOpen size={12}/> Abrir
          </button>
        </div>
      </div>
      <div className="ia-code-body">
        {preview}
        {hasMore&&<span style={{display:'block',color:th.textFaint,fontSize:'11px',marginTop:'6px',cursor:'pointer'}} onClick={()=>onOpenSidePanel({lang,code,filename})}>… +{lines.length-8} linhas — clique em Abrir</span>}
      </div>
    </div>
  );
}

// ─── IaMessage ────────────────────────────────────────────────────────────────
function IaMessage({ msg, isTyping, onDone, th, onOpenSidePanel, fontSize, userMessage }) {
  const parts     = processTextAndCode(msg.content, userMessage || '');
  const hasCode   = parts.some(p => p.type === 'code');
  const onDoneRef = useRef(onDone);
  useEffect(()=>{onDoneRef.current=onDone;},[onDone]);
  const [histOpen, setHistOpen] = useState(false);
  const historyOrch = {
    phase:        'done',
    steps:        (msg.steps||[]).map((s,i) => ({ id:`h-${i}`, text: typeof s === 'string' ? s : (s.text || s.msg || ''), desc: typeof s === 'object' ? s.desc : null, status: 'done' })),
    reasoningLog: msg.reasoning ? [{ id:'h0', text: msg.reasoning }] : [],
    elapsedMs:    msg.thinkingMs || 0,
    isOpen:       histOpen,
    setIsOpen:    setHistOpen,
  };
  const hasThinking = (msg.steps?.length > 0) || msg.reasoning;
  const _usedNames  = new Set();

  if (hasCode) {
    return (
      <div className="ia-msg">
        {hasThinking && <ThinkingPanel orchestrator={historyOrch} th={th} fontSize={fontSize}/>}
        {parts.map((part, i) => {
          if (part.type === 'code') {
            const filename = gerarNomeArquivo(part.lang, userMessage || msg.userMessage || '', i, _usedNames);
            return <InlineCodeBlock key={i} lang={part.lang} code={part.content} th={th} onOpenSidePanel={onOpenSidePanel} filename={filename}/>;
          }
          const enriched = enrichHTML(part.content);
          const links    = extractLinks(enriched);
          return (
            <div key={i}>
              {isTyping && i===parts.length-1 ? <DiffusionText html={enriched} onDoneRef={onDoneRef}/> : <SafeHTMLMsg html={enriched}/>}
              {!isTyping && links.length>0 && (
                <div style={{marginTop:'8px',borderTop:`1px solid ${th.border}`,paddingTop:'6px',display:'flex',flexWrap:'wrap',gap:'4px'}}>
                  {links.map((l,li)=>(<a key={li} href={l.href} target={l.href.startsWith('/')?'_self':'_blank'} rel="noopener noreferrer" style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:'#8ab4f8',textDecoration:'none',background:th.surface,borderRadius:'6px',padding:'4px 8px',border:`1px solid ${th.border}`}}><ExternalLink size={10}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'160px'}}>{l.label}</span></a>))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const textBlocks = parseResponseBlocks(msg.content);
  return (
    <div className="ia-msg">
      {hasThinking && <ThinkingPanel orchestrator={historyOrch} th={th} fontSize={fontSize}/>}
      <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
        {textBlocks.map((block, i) => {
          const enriched = enrichHTML(block);
          const isLast   = i === textBlocks.length - 1;
          const links    = extractLinks(enriched);
          return (
            <div key={i}>
              <div style={{ fontSize:`${fontSize}px`, lineHeight:'1.60', color:th.text }}>
                {isTyping && isLast ? <DiffusionText html={enriched} onDoneRef={onDoneRef}/> : <SafeHTMLMsg html={enriched}/>}
              </div>
              {!isTyping && isLast && links.length > 0 && (
                <div style={{ marginTop:'8px', borderTop:`1px solid ${th.border}`, paddingTop:'6px', display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {links.map((l,li)=>(<a key={li} href={l.href} target={l.href.startsWith('/')?'_self':'_blank'} rel="noopener noreferrer" style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',color:'#8ab4f8',textDecoration:'none',background:th.surface,borderRadius:'6px',padding:'4px 8px',border:`1px solid ${th.border}`}}><ExternalLink size={10}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'160px'}}>{l.label}</span></a>))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FileAttachmentGrid / PendingFilesGrid ────────────────────────────────────
function FileAttachmentGrid({attachments,th}){
  if(!attachments?.length)return null;
  return(<div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'6px',justifyContent:'flex-end'}}>
    {attachments.map((att,i)=>{const info=getFileInfo(att.mimeType),color=GROUP_COLORS[info.group]||GROUP_COLORS.unknown,Icon=info.icon;if(info.group==='image'&&att.preview)return(<div key={i} style={{width:'56px',height:'56px',borderRadius:'8px',overflow:'hidden',flexShrink:0,border:`1px solid ${th.border}`}}><img src={att.preview} alt={att.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/></div>);return(<div key={i} style={{width:'56px',height:'56px',borderRadius:'8px',background:th.surface,border:`1px solid ${th.border}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px',flexShrink:0}}><Icon size={18} style={{color}}/><span style={{fontSize:'8px',color:th.textFaint,textAlign:'center',lineHeight:'1.1',overflow:'hidden',maxWidth:'50px',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</span></div>);})}
  </div>);
}

function PendingFilesGrid({files,onRemove,th}){
  if(!files.length)return null;
  return(<div style={{display:'flex',flexWrap:'wrap',gap:'6px',padding:'8px 0 4px'}}>
    {files.map((f,i)=>{const info=getFileInfo(f.mimeType),color=GROUP_COLORS[info.group]||GROUP_COLORS.unknown,Icon=info.icon;return(<div key={i} style={{position:'relative',width:'56px',height:'56px',flexShrink:0}}><div style={{width:'56px',height:'56px',borderRadius:'8px',background:info.group==='image'&&f.preview?'transparent':th.surface,border:`1px solid ${th.border}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px',overflow:'hidden'}}>{info.group==='image'&&f.preview?<img src={f.preview} alt={f.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<><Icon size={18} style={{color,flexShrink:0}}/><span style={{fontSize:'7px',color:th.textFaint,textAlign:'center',lineHeight:'1.1',padding:'0 3px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'50px'}}>{f.name}</span></>}</div><button onClick={()=>onRemove(i)} style={{position:'absolute',top:'-5px',right:'-5px',width:'16px',height:'16px',borderRadius:'50%',background:'#ef4444',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}><X size={9} style={{color:'#fff'}}/></button></div>);})}
  </div>);
}

// ─── FloatingButton ───────────────────────────────────────────────────────────
function FloatingButton({ onClick, hasUnread, shortPreview }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position:'relative', display:'inline-flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
      {hasUnread && shortPreview && (
        <div onClick={onClick} style={{ background:'#1e293b', color:'white', fontSize:'12px', fontWeight:500, padding:'8px 12px', borderRadius:'12px 12px 12px 4px', maxWidth:'240px', lineHeight:'1.4', boxShadow:'0 2px 12px rgba(30,41,59,0.3)', animation:'ia-fade-in 0.3s ease', cursor:'pointer', wordBreak:'break-word' }}>
          {shortPreview}
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display:'flex', alignItems:'center', borderRadius:'999px', border:'none', outline:'none', background:'#1e293b', cursor:'pointer', boxShadow:'0 4px 20px rgba(30,41,59,0.45)', width:hovered?'172px':'62px', height:'62px', transition:'width 0.28s cubic-bezier(0.34,1.2,0.64,1)', padding:0, overflow:'hidden' }}
      >
        <span style={{ width:'62px', height:'62px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:'#1e293b', order:1, zIndex:2 }}>
          {/* ✅ AnalyizStar no botão flutuante */}
          <AnalyizStar size={44} active={false} dark={true} />
        </span>
        <span style={{ color:'white', fontSize:'13px', fontWeight:700, whiteSpace:'nowrap', paddingRight:'20px', paddingLeft:'4px', order:2, opacity:hovered?1:0, transition:'opacity 0.18s', pointerEvents:'none' }}>
          Assistente
        </span>
      </button>
    </div>
  );
}

// ─── WelcomeGreeting ──────────────────────────────────────────────────────────
function WelcomeGreeting({ th, fontSize, userName, isFullscreen, onQuickAction, greetingIndex, isLoading }) {
  const greeting = GREETINGS[greetingIndex % GREETINGS.length](userName);
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, padding:isFullscreen?'60px 24px 40px':'32px 20px 24px', textAlign:'center', animation:'ia-greeting 0.5s cubic-bezier(0.34,1.2,0.64,1) both' }}>
      <div style={{ marginBottom:'20px' }}>
        <AnalyizStar size={isFullscreen ? 80 : 64} active={isLoading} dark={th.starDark}/>
      </div>
      <h2 style={{ fontSize:isFullscreen?'28px':'20px', fontWeight:700, margin:'0 0 8px', background:th.greetingGradient, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', fontFamily:"'Google Sans',sans-serif", lineHeight:1.3 }}>
        {greeting}
      </h2>
      <p style={{ fontSize:`${Math.max(11,fontSize-1)}px`, color:th.textMuted, margin:'0 0 28px', fontFamily:"'Google Sans',sans-serif" }}>
        Assistente Analyiz — te ajudo com análises, conversas e muito mais.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px', width:'100%', maxWidth:isFullscreen?'560px':'340px' }}>
        {QUICK_ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <button key={i} className="ia-chip" onClick={() => onQuickAction(a.prompt)}
              style={{ display:'flex', alignItems:'center', gap:'8px', background:th.quickActionBg, border:`1px solid ${th.border}`, borderRadius:'12px', padding:'10px 14px', cursor:'pointer', textAlign:'left' }}>
              <Icon size={15} style={{ color:th.brand, flexShrink:0 }}/>
              <span style={{ fontSize:'12px', color:th.text, fontWeight:500, lineHeight:1.3, fontFamily:"'Google Sans',sans-serif" }}>{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── EditableUserMessage / InputBox ───────────────────────────────────────────
function EditableUserMessage({ msg, th, fontSize, onSendEdit }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);
  const [copied,  setCopied]  = useState(false);
  const taRef = useRef(null);
  useEffect(() => { if (editing && taRef.current) { taRef.current.style.height='auto'; taRef.current.style.height=taRef.current.scrollHeight+'px'; taRef.current.focus(); } }, [editing]);
  const handleCopy   = () => { navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(()=>setCopied(false),1500); };
  const handleSubmit = () => { if (editVal.trim() && editVal.trim() !== msg.content) onSendEdit(msg.id, editVal.trim()); setEditing(false); };
  return (
    <div className="ia-msg-wrap" style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
      <FileAttachmentGrid attachments={msg.attachments} th={th}/>
      <div style={{ display:'flex', alignItems:'flex-end', gap:'8px', flexDirection:'row-reverse', width:'100%', justifyContent:'flex-start' }}>
        {!editing && msg.content && (
          <div style={{ maxWidth:'88%' }}>
            <div style={{ background:th.userBubble, color:th.userText, padding:'10px 14px', borderRadius:'18px 18px 4px 18px', fontSize:`${fontSize}px`, lineHeight:'1.5', whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:"'Google Sans',sans-serif" }}>
              {msg.content}
            </div>
          </div>
        )}
        {editing && (
          <div style={{ maxWidth:'88%', width:'100%' }}>
            <textarea ref={taRef} value={editVal} onChange={e=>{setEditVal(e.target.value);e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSubmit();}if(e.key==='Escape')setEditing(false);}} style={{ width:'100%', background:th.inputBoxBg, color:th.text, border:'1.5px solid #8ab4f8', borderRadius:'12px', padding:'10px 14px', fontSize:`${fontSize}px`, fontFamily:"'Google Sans',sans-serif", resize:'none', outline:'none', lineHeight:'1.5' }}/>
            <div style={{ display:'flex', gap:'6px', marginTop:'6px', justifyContent:'flex-end' }}>
              <button onClick={()=>setEditing(false)} style={{ background:'none', border:`1px solid ${th.border}`, color:th.textMuted, cursor:'pointer', padding:'4px 12px', borderRadius:'8px', fontSize:'12px' }}>Cancelar</button>
              <button onClick={handleSubmit} style={{ background:'#8ab4f8', border:'none', color:'#1e1f20', cursor:'pointer', padding:'4px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600 }}>Enviar</button>
            </div>
          </div>
        )}
        {!editing && (
          <div className="ia-msg-actions" style={{ display:'flex', gap:'3px', opacity:0, transition:'opacity 0.15s', alignItems:'center', flexShrink:0 }}>
            <button onClick={handleCopy} style={{ background:'none', border:`1px solid ${th.border}`, color:copied?'#10b981':th.textFaint, cursor:'pointer', padding:'4px 7px', borderRadius:'6px', display:'flex', alignItems:'center', fontSize:'11px', transition:'all 0.15s' }}><Copy size={12}/></button>
            <button onClick={()=>setEditing(true)} style={{ background:'none', border:`1px solid ${th.border}`, color:th.textFaint, cursor:'pointer', padding:'4px 7px', borderRadius:'6px', display:'flex', alignItems:'center', fontSize:'11px', transition:'all 0.15s' }}><Edit2 size={12}/></button>
          </div>
        )}
      </div>
      {msg.time && !editing && <span style={{ fontSize:'10px', color:th.textFaint, marginTop:'3px' }}>{msg.time}</span>}
    </div>
  );
}

function InputBox({ th, fontSize, chatInput, setChatInput, handleSend, handleKeyDown, handlePaste, isChatLoading, pendingFiles, setPendingFiles, fileInputRef, canSend, isFullscreen }) {
  const taRef = useRef(null);
  useEffect(() => { const ta = taRef.current; if (ta) { ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,160)+'px'; } }, [chatInput]);
  const placeholder = pendingFiles.length > 0 ? `O que fazer com ${pendingFiles.length===1?'o arquivo':`os ${pendingFiles.length} arquivos`}?` : 'Pergunte qualquer coisa…';
  return (
    <div className="ia-input-area-ghost" style={{ padding:isFullscreen?'8px 24px 20px':'4px 14px 14px' }}>
      <div style={{ maxWidth:isFullscreen?'720px':'100%', margin:'0 auto' }}>
        <div className="ia-input-box">
          {pendingFiles.length > 0 && <PendingFilesGrid files={pendingFiles} onRemove={i=>setPendingFiles(p=>p.filter((_,idx)=>idx!==i))} th={th}/>}
          <div style={{ display:'flex', alignItems:'flex-end', gap:'8px' }}>
            <textarea ref={taRef} className="ia-textarea" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} disabled={isChatLoading} rows={1} placeholder={placeholder}/>
            <button onClick={handleSend} disabled={!canSend} className="ia-tip" data-tip="Enviar"
              style={{ background:canSend?'#8ab4f8':'transparent', color:canSend?'#1e1f20':th.textFaint, border:canSend?'none':`1px solid ${th.border}`, borderRadius:'50%', width:'36px', height:'36px', flexShrink:0, display:'flex', justifyContent:'center', alignItems:'center', cursor:canSend?'pointer':'default', transition:'all 0.15s' }}>
              <Send size={16} style={{ marginLeft:'2px' }}/>
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <button onClick={()=>fileInputRef.current?.click()} disabled={isChatLoading||pendingFiles.length>=MAX_FILES} className="ia-tip" data-tip="Anexar arquivo"
              style={{ background:'none', border:'none', color:pendingFiles.length>0?th.brand:th.textFaint, cursor:pendingFiles.length>=MAX_FILES?'not-allowed':'pointer', padding:'2px', opacity:pendingFiles.length>=MAX_FILES?0.4:1, display:'flex', alignItems:'center', gap:'4px', position:'relative' }}>
              <Paperclip size={16}/>
              {pendingFiles.length > 0 && <span style={{ background:th.brand, color:th.bg, fontSize:'9px', fontWeight:700, padding:'1px 5px', borderRadius:'10px' }}>{pendingFiles.length}</span>}
            </button>
            <span style={{ fontSize:'10px', color:th.textFaint, fontFamily:"'Google Sans',sans-serif" }}>Enter para enviar · Shift+Enter nova linha</span>
          </div>
        </div>
        <p style={{ textAlign:'center', fontSize:'10px', color:th.textFaint, marginTop:'8px', marginBottom:0, fontFamily:"'Google Sans',sans-serif" }}>
          Analyiz pode cometer erros. Verifique informações importantes.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function IaAnalyizChat({ isChatOpen, toggleChat, userRole, pageBaseUrl }) {
  const [darkMode, setDMState] = useState(() => { try { return localStorage.getItem('analyiz_darkmode')==='true'; } catch { return false; } });
  const [fontSize, setFSState] = useState(() => { try { return parseInt(localStorage.getItem('analyiz_fontsize')||'13'); } catch { return 13; } });
  const setDarkMode = v => { setDMState(v); localStorage.setItem('analyiz_darkmode', String(v)); };
  const setFontSize = v => { setFSState(v); localStorage.setItem('analyiz_fontsize', String(v)); };
  const th = THEMES[darkMode ? 'dark' : 'light'];

  const [chatInput,        setChatInput]       = useState('');
  const [isChatLoading,    setIsChatLoading]   = useState(false);
  const [isExpanded,       setIsExpanded]      = useState(false);
  const [isFullscreen,     setIsFullscreen]    = useState(false);
  const [pendingFiles,     setPendingFiles]    = useState([]);
  const [messages,         setMessages]        = useState([]);
  const [isDragging,       setIsDragging]      = useState(false);
  const [hasUnread,        setHasUnread]       = useState(false);
  const [shortPreview,     setShortPreview]    = useState('');
  const [greetingIndex]                        = useState(() => Math.floor(Math.random() * GREETINGS.length));
  const [sidePanelContent, setSidePanelContent] = useState(null);
  const [sessionDocs,      setSessionDocs]    = useState([]);
  const [sidebarOpen,      setSidebarOpen]    = useState(false);
  const [sessions,         setSessions]        = useState([]);
  const [searchSession,    setSearchSession]  = useState('');
  const [typingSet,        setTypingSet]      = useState(new Set());
  const [lastUserMsg,      setLastUserMsg]    = useState('');
  const [isTypingResp,     setIsTypingResp]   = useState(false);

  // ✅ Estado de loading para o AnalyizStar no header
  const headerStarActive = isChatLoading || isTypingResp;

  useEffect(() => { if (typingSet.size===0&&isTypingResp) setIsTypingResp(false); }, [typingSet, isTypingResp]);

  const currentUserMessageRef = useRef('');
  const pendingReplyRef       = useRef(null);
  const thinking              = useThinkingOrchestrator();

  const readUserId   = () => { try { return JSON.parse(localStorage.getItem('analyiz_user'))?.id; } catch { return null; } };
  const readUserName = () => { try { const u=JSON.parse(localStorage.getItem('analyiz_user')); return u?.nome||u?.name; } catch { return null; } };
  const [userId]   = useState(readUserId);
  const [userName] = useState(readUserName);
  const [currentSessionId, setCurrentSessionId] = useState(() => { try { return parseInt(localStorage.getItem(SESSION_KEY)); } catch { return null; } });

  const scrollRef       = useRef(null);
  const fileInputRef    = useRef(null);
  const dropRef         = useRef(null);
  const pollTimerRef    = useRef(null);
  const pendingNotifRef = useRef(null);
  const thinkingMsRef   = useRef(0);
  const thinkingStartRef= useRef(0);

  let modalConfirm = null;
  try { const mod=require('../components/Modal');if(mod?.useModal){const{confirm}=mod.useModal();modalConfirm=confirm;} } catch {}
  const confirmDelete = useCallback(async () => {
    if (modalConfirm) return await modalConfirm({ title:'Excluir conversa', message:'Será removida permanentemente.', confirmLabel:'Excluir', danger:true });
    return window.confirm('Deletar esta conversa?');
  }, [modalConfirm]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; }, [messages, isChatLoading, thinking.steps, thinking.reasoningLog, typingSet]);

  useEffect(() => {
    if (thinking.isReadyForReply && pendingReplyRef.current) {
      const { iaId, reply, sources, steps, reasoning, thinkingMs, userMessage } = pendingReplyRef.current;
      pendingReplyRef.current = null;
      const partes    = processTextAndCode(reply, userMessage);
      const firstCode = partes.find(p => p.type === 'code');
      if (firstCode) { const fname=gerarNomeArquivo(firstCode.lang,userMessage,0,new Set()); setSidePanelContent({lang:firstCode.lang,code:firstCode.content,filename:fname}); }
      setMessages(p => [...p, { role:'ia', content:reply, reasoning, steps, thinkingMs, sources:sources||[], time:new Date().toLocaleTimeString(), id:iaId, userMessage }]);
      setTypingSet(prev => new Set(prev).add(iaId));
      setIsTypingResp(true);
    }
  }, [thinking.isReadyForReply]);

  const carregarSessions = useCallback(async () => {
    if (!userId) return;
    try { const r=await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`); setSessions(await r.json()); } catch {}
  }, [userId]);

  const carregarDocumentos = useCallback(async (sid) => {
    if (!sid) { setSessionDocs([]); return; }
    try { const r=await fetch(`${API_BASE_URL}/api/chat/sessions/${sid}/documents`); setSessionDocs(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    if (currentSessionId && userId) {
      localStorage.setItem(SESSION_KEY, String(currentSessionId));
      fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`).then(r=>r.json()).then(msgs => {
        setMessages(msgs.map(m => {
          let attachments=null;
          if(m.imageDesc){try{const p=JSON.parse(m.imageDesc);if(Array.isArray(p))attachments=p.map(att=>att.group==='image'&&!att.preview&&m.imageBase64?{...att,preview:`data:${att.mimeType||'image/jpeg'};base64,${m.imageBase64}`}:att);}catch{}}
          const li=m.imageBase64&&!attachments?[{mimeType:'image/jpeg',name:'imagem.jpg',group:'image',preview:`data:image/jpeg;base64,${m.imageBase64}`,sizeBytes:0}]:null;
          return{role:m.role,id:String(m.id),content:m.content,time:safeTime(m.createdAt),attachments:attachments||li,sources:[],reasoning:m.reasoning||'',steps:[]};
        }));
      });
      carregarDocumentos(currentSessionId);
    } else { setMessages([]); }
  }, [currentSessionId, userId, carregarDocumentos]);

  useEffect(() => { if (isChatOpen||isFullscreen) carregarSessions(); }, [isChatOpen, isFullscreen, carregarSessions]);

  useEffect(() => {
    if (!isChatOpen) { setSidePanelContent(null); setHasUnread(false); setShortPreview(''); }
    const p=pendingNotifRef.current; if(!p) return;
    const{notifId,fullInsight}=p; pendingNotifRef.current=null;
    if(notifId&&userId) fetch(`${API_BASE_URL}/api/ia/proactive/seen`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,notifId})}).catch(()=>{});
    setTimeout(()=>{const id=`ia-proactive-${Date.now()}`;setMessages(prev=>[...prev,{role:'ia',content:fullInsight,time:getTime(),id,sources:[],reasoning:'',steps:[]}]);setTypingSet(prev=>new Set(prev).add(id));},400);
  }, [isChatOpen]);

  const verificarProativo = useCallback(async () => {
    if (!userId||!isChatOpen) return;
    try {
      const res=await fetch(`${API_BASE_URL}/api/ia/proactive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,userRole})});
      const data=await res.json();
      if(!data.insight||!data.hasRelevantData)return;
      pendingNotifRef.current={notifId:data.notifId,fullInsight:data.fullInsight};
      setShortPreview(data.insight);setHasUnread(true);
      if(data.notifId)fetch(`${API_BASE_URL}/api/ia/proactive/exibida`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,notifId:data.notifId})}).catch(()=>{});
    } catch {}
  }, [userId, userRole, isChatOpen]);

  useEffect(() => {
    if (!userId) return;
    const first=setTimeout(verificarProativo,POLL_INITIAL);
    pollTimerRef.current=setInterval(verificarProativo,POLL_INTERVAL);
    return()=>{clearTimeout(first);clearInterval(pollTimerRef.current);};
  }, [verificarProativo, userId]);

  const ensureSession = useCallback(async () => {
    if (currentSessionId) return currentSessionId;
    if (!userId) return null;
    try { const res=await fetch(`${API_BASE_URL}/api/chat/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId})});const s=await res.json();setCurrentSessionId(s.id);return s.id; } catch { return null; }
  }, [userId, currentSessionId]);

  // ─── handleSend ─────────────────────────────────────────────────────────────
  const handleSend = async (overrideInput) => {
    const userMsg = (overrideInput !== undefined ? overrideInput : chatInput).trim();
    if ((!userMsg && !pendingFiles.length) || isChatLoading) return;
    currentUserMessageRef.current = userMsg;
    setLastUserMsg(userMsg);
    const filesToSend        = [...pendingFiles];
    const attachmentSnapshot = filesToSend.map(f=>({mimeType:f.mimeType,name:f.name,group:f.group,preview:f.preview,sizeBytes:f.sizeBytes}));
    setMessages(p=>[...p,{role:'user',content:userMsg,time:new Date().toLocaleTimeString(),id:`u-${Date.now()}`,attachments:attachmentSnapshot.length?attachmentSnapshot:null}]);
    setChatInput(''); setPendingFiles([]); setIsChatLoading(true);
    pendingReplyRef.current = null;
    const fileNames  = filesToSend.map(f=>f.name);
    const numImages  = filesToSend.filter(f=>f.group==='image').length;
    thinkingStartRef.current = Date.now();
    thinking.start(userMsg, filesToSend.length>0, fileNames, numImages);
    try {
      const sid       = await ensureSession();
      const images    = filesToSend.filter(f=>f.group==='image');
      const nonImages = filesToSend.filter(f=>f.group!=='image');
      const firstImg  = images[0];
      const MAX_PREVIEW_SIZE = 8*1024*1024;
      const attachmentMeta = attachmentSnapshot.map(a=>{const isMainImg=a.group==='image'&&firstImg&&a.name===firstImg.name;const needsPreview=a.group==='audio'||(a.group==='image'&&!isMainImg);return{mimeType:a.mimeType,name:a.name,group:a.group,sizeBytes:a.sizeBytes,...(needsPreview&&a.preview&&a.preview.length<MAX_PREVIEW_SIZE?{preview:a.preview}:{})};});
      const actualPageBaseUrl = pageBaseUrl||window.location.origin||'http://localhost:5173';
      const res = await fetch(`${API_BASE_URL}/api/ia/chat/stream`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:userMsg,sessionId:sid,userId,userRole,pageUrl:window.location.pathname,pageBaseUrl:actualPageBaseUrl,imageOnly:!userMsg&&filesToSend.length===1&&!!firstImg,...(firstImg?{imageBase64:firstImg.base64,imageMimeType:firstImg.mimeType,imageName:firstImg.name}:{}),extraImages:images.slice(1).map(f=>({base64:f.base64,mimeType:f.mimeType,name:f.name})),files:nonImages.map(f=>({base64:f.base64,mimeType:f.mimeType,name:f.name,group:f.group,sizeBytes:f.sizeBytes})),attachmentMeta})});
      const reader=res.body.getReader(),decoder=new TextDecoder();
      let buffer='';
      while(true){
        const{value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split('\n');buffer=lines.pop();
        let ev=null;
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{
              const data=JSON.parse(line.slice(6));
              if(ev==='reasoning_chunk'){thinking.pushChunk(data.text);}
              else if(ev==='reasoning_end'){if(data.fullText)thinking.addReasoningBlock(data.fullText);}
              else if(ev==='step'){thinking.addBackendStep(data.msg);}
              else if(ev==='done'){
                thinkingMsRef.current=Date.now()-thinkingStartRef.current;
                if(data.sessionId&&data.sessionId!==sid)setCurrentSessionId(data.sessionId);
                const iaId=`ia-${Date.now()}`;
                pendingReplyRef.current={
                  iaId,
                  reply:      data.reply,
                  sources:    data.sources||[],
                  steps:      thinking.steps.map(s=>({text:s.text,desc:s.desc})),
                  reasoning:  data.reasoning||'',
                  thinkingMs: thinkingMsRef.current,
                  sessionId:  data.sessionId||sid,
                  userMessage: userMsg,
                };
                carregarDocumentos(data.sessionId||sid);
                carregarSessions();
              }
            }catch{}
            ev=null;
          }
        }
      }
      thinking.finish();
    } catch {
      thinking.finish();
      pendingReplyRef.current=null;
      setMessages(p=>[...p,{role:'ia',content:'Erro na comunicação com o servidor.',time:getTime(),id:`err-${Date.now()}`,sources:[],reasoning:'',steps:[]}]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleEditMessage = useCallback((msgId, newContent) => {
    setMessages(prev=>{const idx=prev.findIndex(m=>m.id===msgId);if(idx===-1)return prev;return prev.slice(0,idx);});
    setTimeout(()=>handleSend(newContent),50);
  }, []); // eslint-disable-line

  const processFile = useCallback(file=>new Promise((resolve,reject)=>{
    const info=getFileInfo(file.type);
    if(!FILE_TYPES[file.type]&&!file.type.startsWith('image/')&&!file.type.startsWith('audio/')){reject(new Error(`Tipo não suportado: ${file.name}`));return;}
    if(file.size>MAX_FILE_SIZE){reject(new Error(`Arquivo muito grande: ${file.name}`));return;}
    const r=new FileReader();
    r.onload=ev=>{const d=ev.target.result;resolve({base64:d.split(',')[1],mimeType:file.type||'application/octet-stream',name:file.name,sizeBytes:file.size,group:info.group,preview:['image','audio'].includes(info.group)?d:null});};
    r.onerror=()=>reject(new Error(`Erro ao ler: ${file.name}`));
    r.readAsDataURL(file);
  }),[]);

  const addFiles       = useCallback(async fl=>{const toAdd=[...fl].slice(0,MAX_FILES),added=[];for(const f of toAdd){try{added.push(await processFile(f));}catch{}}if(added.length)setPendingFiles(prev=>[...prev,...added].slice(0,MAX_FILES));},[processFile]);
  const handleFileSelect=useCallback(async e=>{if(e.target.files?.length)await addFiles(e.target.files);e.target.value='';},[addFiles]);
  const handlePaste    =useCallback(async e=>{const items=e.clipboardData?.items;if(!items)return;const files=[];for(const item of items){if(item.kind==='file'){const f=item.getAsFile();if(f)files.push(f);}}if(files.length){e.preventDefault();await addFiles(files);}},[addFiles]);
  const handleDragOver =useCallback(e=>{e.preventDefault();e.stopPropagation();setIsDragging(true);},[]);
  const handleDragLeave=useCallback(e=>{e.preventDefault();if(!dropRef.current?.contains(e.relatedTarget))setIsDragging(false);},[]);
  const handleDrop     =useCallback(async e=>{e.preventDefault();e.stopPropagation();setIsDragging(false);if(e.dataTransfer.files?.length)await addFiles(e.dataTransfer.files);},[addFiles]);
  const handleKeyDown  =e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();}};
  const handleNewSession=()=>{setCurrentSessionId(null);setMessages([]);setSidePanelContent(null);thinking.reset();pendingReplyRef.current=null;setLastUserMsg('');localStorage.removeItem(SESSION_KEY);};
  const loadSession    =id=>{setCurrentSessionId(id);setSidebarOpen(false);};
  const handleCopyCode =()=>{if(sidePanelContent?.code)navigator.clipboard.writeText(sidePanelContent.code);};
  const handleDownloadCode=()=>{if(!sidePanelContent?.code)return;const blob=new Blob([sidePanelContent.code],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=sidePanelContent.filename||'documento.txt';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);};
  const deletarSessao  =async(e,id)=>{e.stopPropagation();if(!await confirmDelete())return;await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`,{method:'DELETE'});if(id===currentSessionId)handleNewSession();carregarSessions();};

  const isNewSession      = messages.length===0&&thinking.phase==='idle';
  const conversationTitle = deriveTitle(messages);
  const canSend           = (chatInput.trim()||pendingFiles.length>0)&&!isChatLoading;
  const chatBaseW         = isExpanded?600:400;
  const totalW            = isFullscreen?'100vw':`${chatBaseW+(sidebarOpen?260:0)}px`;
  const H                 = isFullscreen?'100vh':isExpanded?'85vh':'calc(100vh - 5rem)';
  const B                 = isFullscreen?'0':'1.5rem';
  const R                 = isFullscreen?'0':'1.5rem';
  const Radius            = isFullscreen?'0':'20px';

  return (
    <>
      <style>{CHAT_STYLES(th, fontSize)}</style>

      {/* PAINEL DE CÓDIGO */}
      <div style={{ position:'fixed', zIndex:99999, bottom:B, right:isChatOpen&&sidePanelContent?(isFullscreen?'0':`calc(${R} + ${totalW} + 1rem)`):`-100vw`, width:isFullscreen&&sidePanelContent?'38%':`${chatBaseW}px`, height:H, background:th.bg, borderRadius:Radius, boxShadow:'0 4px 32px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', overflow:'hidden', border:`1px solid ${th.border}`, transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)', opacity:sidePanelContent?1:0, pointerEvents:sidePanelContent?'auto':'none' }}>
        <div style={{ padding:'12px', borderBottom:`1px solid ${th.border}`, background:th.surface }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontWeight:600, fontSize:'14px', display:'flex', alignItems:'center', gap:'6px' }}><FileText size={18} style={{ color:th.brand }}/> Visualizador</span>
            <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
              <button onClick={handleCopyCode} title="Copiar" style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'4px', borderRadius:'6px' }}><Copy size={16}/></button>
              <button onClick={handleDownloadCode} title="Baixar" style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'4px', borderRadius:'6px' }}><Download size={16}/></button>
              <button onClick={()=>setSidePanelContent(null)} title="Fechar" style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'4px', borderRadius:'6px' }}><X size={18}/></button>
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'4px' }} className="ia-scroll">
            {sessionDocs.map(doc=>(<button key={doc.id} onClick={()=>setSidePanelContent({lang:doc.language,code:doc.content,filename:doc.filename})} style={{ padding:'4px 8px', borderRadius:'6px', background:sidePanelContent?.filename===doc.filename?th.brand:th.surface, color:sidePanelContent?.filename===doc.filename?th.bg:th.text, fontSize:'11px', border:`1px solid ${th.border}`, whiteSpace:'nowrap', cursor:'pointer' }}>{doc.filename} (v{doc.versao})</button>))}
            {sessionDocs.length===0&&<span style={{ fontSize:'11px', color:th.textFaint }}>Nenhum arquivo nesta conversa.</span>}
          </div>
        </div>
        <div className="ia-scroll" style={{ flex:1, overflowY:'auto', padding:'16px', background:th.surface }}>
          <pre style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all', fontFamily:"'Google Sans Mono',monospace", fontSize:`${fontSize}px`, color:th.text }}>{sidePanelContent?.code}</pre>
        </div>
      </div>

      {/* JANELA PRINCIPAL */}
      <div className="ia-chat-root" ref={dropRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{ position:'fixed', zIndex:99998, bottom:B, right:isFullscreen&&sidePanelContent?'38%':R, width:isFullscreen?(sidePanelContent?'62%':'100%'):totalW, height:H, maxHeight:isFullscreen?'none':'calc(100vh - 3rem)', background:th.chatAreaBg, borderRadius:Radius, boxShadow:isDragging?'0 4px 32px rgba(99,102,241,0.25),0 0 0 2px #6366f1':'0 4px 32px rgba(0,0,0,0.2)', display:'flex', flexDirection:'row', overflow:'hidden', transform:isChatOpen?'scale(1)':'scale(0)', transformOrigin:'bottom right', opacity:isChatOpen?1:0, pointerEvents:isChatOpen?'auto':'none', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)', border:isDragging?'2px dashed #6366f1':`1px solid ${th.border}` }}>

        {isDragging && (
          <div style={{ position:'absolute', inset:0, background:'rgba(99,102,241,0.07)', zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:Radius, pointerEvents:'none' }}>
            <div style={{ fontSize:'36px', marginBottom:'8px' }}>📎</div>
            <p style={{ fontSize:'14px', fontWeight:700, color:'#6366f1', margin:0 }}>Solte para anexar</p>
          </div>
        )}

        {/* SIDEBAR */}
        <div className={`ia-sidebar-panel${sidebarOpen?'':' closed'}`}>
          <div style={{ padding:'14px 12px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              {/* ✅ AnalyizStar na sidebar */}
              <AnalyizStar size={28} active={isChatLoading} dark={th.starDark}/>
              <span style={{ fontWeight:700, fontSize:'13px', color:th.text, fontFamily:"'Google Sans',sans-serif" }}>Analyiz</span>
            </div>
            <button onClick={()=>setSidebarOpen(false)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'4px', borderRadius:'6px' }}><X size={16}/></button>
          </div>
          <div style={{ padding:'0 10px 8px', flexShrink:0 }}>
            <button onClick={handleNewSession}
              style={{ width:'100%', padding:'9px 12px', background:th.quickActionBg, border:`1px solid ${th.border}`, borderRadius:'10px', color:th.text, display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontWeight:600, fontSize:'12px', fontFamily:"'Google Sans',sans-serif", transition:'all 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background=th.quickActionHover}
              onMouseLeave={e=>e.currentTarget.style.background=th.quickActionBg}>
              <Plus size={15}/> Nova conversa
            </button>
          </div>
          <div style={{ padding:'0 10px 8px', position:'relative', flexShrink:0 }}>
            <Search size={13} style={{ position:'absolute', left:'22px', top:'10px', color:th.textFaint }}/>
            <input type="text" placeholder="Pesquisar…" value={searchSession} onChange={e=>setSearchSession(e.target.value)} style={{ width:'100%', padding:'8px 8px 8px 28px', background:'transparent', border:`1px solid ${th.border}`, borderRadius:'8px', color:th.text, fontSize:'12px', outline:'none', fontFamily:"'Google Sans',sans-serif" }}/>
          </div>
          <div className="ia-scroll" style={{ flex:1, overflowY:'auto', padding:'0 4px' }}>
            {sessions.filter(s=>s.titulo?.toLowerCase().includes(searchSession.toLowerCase())).map(s=>(
              <div key={s.id} onClick={()=>loadSession(s.id)} className="ia-sidebar-item"
                style={{ padding:'9px 10px', display:'flex', alignItems:'center', gap:'8px', background:s.id===currentSessionId?th.quickActionBg:'transparent' }}>
                <MessageSquare size={13} style={{ color:th.textFaint, flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:'12px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:th.text, fontFamily:"'Google Sans',sans-serif" }}>{s.titulo||'Conversa'}</span>
                <button className="ia-del-btn" onClick={e=>deletarSessao(e,s.id)}
                  style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'2px', opacity:0, transition:'opacity 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.color='#ef4444';}}
                  onMouseLeave={e=>{e.currentTarget.style.opacity='0';e.currentTarget.style.color=th.textFaint;}}>
                  <Trash2 size={12}/>
                </button>
              </div>
            ))}
            {sessions.length===0&&<div style={{ padding:'20px 12px', textAlign:'center', color:th.textFaint, fontSize:'12px' }}>Nenhuma conversa ainda</div>}
          </div>
          <div style={{ padding:'12px 10px', borderTop:`1px solid ${th.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <span style={{ fontSize:'12px', color:th.textMuted }}>Modo escuro</span>
              <button onClick={()=>setDarkMode(!darkMode)} style={{ background:'none', border:'none', color:th.text, cursor:'pointer', padding:'4px' }}>
                {darkMode?<Sun size={16}/>:<Moon size={16}/>}
              </button>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'12px', color:th.textMuted }}>Fonte</span>
              <div style={{ display:'flex', gap:'4px' }}>
                {[11,13,15].map(size=>(<button key={size} onClick={()=>setFontSize(size)} style={{ fontSize:'10px', padding:'2px 7px', cursor:'pointer', border:`1px solid ${th.border}`, background:fontSize===size?th.brand:'transparent', color:fontSize===size?th.bg:th.text, borderRadius:'4px', fontWeight:600 }}>{size}</button>))}
              </div>
            </div>
          </div>
        </div>

        {/* ÁREA DE CHAT */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* HEADER INVISÍVEL */}
          <div className="ia-header-ghost" style={{ padding:isFullscreen?'12px 20px':'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
              <button className="ia-header-btn" onClick={()=>setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'6px', borderRadius:'8px', flexShrink:0 }}>
                <Menu size={18}/>
              </button>
              {/* ✅ AnalyizStar no header — active quando carregando ou respondendo */}
              <div className="ia-header-star" style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', width:'36px', height:'36px' }}>
                <AnalyizStar size={32} active={headerStarActive} dark={th.starDark} />
              </div>
              {isFullscreen
                ? (<div style={{ flex:1, display:'flex', justifyContent:'center' }}>
                    <span className="ia-header-title" style={{ fontSize:'14px', fontWeight:500, color:th.textMuted, fontFamily:"'Google Sans',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'400px' }}>{conversationTitle}</span>
                  </div>)
                : (<div style={{ minWidth:0 }}>
                    <span className="ia-header-title" style={{ fontWeight:600, fontSize:'14px', display:'block', lineHeight:'1.2', color:th.text, fontFamily:"'Google Sans',sans-serif" }}>Analyiz</span>
                    <span className="ia-header-title" style={{ fontSize:'10px', color:th.textFaint, fontFamily:"'Google Sans',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'200px', display:'block' }}>
                      {isChatLoading?'Pensando…':isTypingResp?'Respondendo…':conversationTitle}
                    </span>
                  </div>)
              }
            </div>
            <div style={{ display:'flex', gap:'2px', flexShrink:0 }}>
              <button className="ia-header-btn" onClick={()=>setIsFullscreen(!isFullscreen)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'6px', borderRadius:'8px' }}>
                {isFullscreen?<Minimize2 size={16}/>:<Monitor size={16}/>}
              </button>
              {!isFullscreen&&(<button className="ia-header-btn" onClick={()=>setIsExpanded(!isExpanded)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'6px', borderRadius:'8px' }}>{isExpanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>)}
              <button className="ia-header-btn" onClick={toggleChat} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'6px', borderRadius:'8px' }}><Minus size={16}/></button>
            </div>
          </div>

          {/* MENSAGENS */}
          <div className="ia-msg-area-wrap">
            <div ref={scrollRef} className="ia-scroll" style={{ flex:1, overflowY:'auto', background:th.chatAreaBg, display:'flex', flexDirection:'column' }}>
              {isNewSession && (
                <WelcomeGreeting
                  th={th} fontSize={fontSize} userName={userName} isFullscreen={isFullscreen}
                  isLoading={isChatLoading}
                  onQuickAction={prompt=>{setChatInput(prompt);setTimeout(()=>handleSend(prompt),50);}}
                  greetingIndex={greetingIndex}
                />
              )}
              {!isNewSession && (
                <div style={{ flex:1, padding:isFullscreen?'24px 0':'12px 14px 6px', display:'flex', flexDirection:'column', gap:'10px' }}>
                  {messages.map(msg=>(
                    <div key={msg.id} className={isFullscreen?'ia-fs-msg':''}>
                      {msg.role==='ia'?(
                        <div style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>
                          {/* ✅ AnalyizStar nas mensagens da IA */}
                          <div style={{ flexShrink:0, marginTop:'2px' }}>
                            <AnalyizStar size={isFullscreen?26:22} active={false} dark={th.starDark}/>
                          </div>
                          <div className="ia-msg-wrap" style={{ flex:1, minWidth:0 }}>
                            <IaMessage msg={msg} isTyping={typingSet.has(msg.id)} onDone={()=>setTypingSet(p=>{const n=new Set(p);n.delete(msg.id);return n;})} th={th} onOpenSidePanel={setSidePanelContent} fontSize={fontSize} userMessage={msg.userMessage||''}/>
                          </div>
                        </div>
                      ):(
                        <EditableUserMessage msg={msg} th={th} fontSize={fontSize} onSendEdit={handleEditMessage}/>
                      )}
                    </div>
                  ))}

                  {/* THINKING AO VIVO */}
                  {isChatLoading&&(
                    <div className={isFullscreen?'ia-fs-msg':''}>
                      <div style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>
                        <div style={{ flexShrink:0, paddingTop:'2px' }}>
                          {/* ✅ AnalyizStar active=true enquanto processa */}
                          <AnalyizStar size={isFullscreen?26:22} active={true} dark={th.starDark}/>
                        </div>
                        <div style={{ flex:1, paddingTop:'2px' }}>
                          <ThinkingPanel orchestrator={thinking} th={th} fontSize={fontSize}/>
                          {thinking.phase==='idle'&&(
                            <div style={{ display:'flex', gap:'5px', alignItems:'center', paddingLeft:'4px', paddingTop:'8px' }}>
                              {[0,1,2].map(i=>(<span key={i} style={{ width:'7px', height:'7px', borderRadius:'50%', background:th.textFaint, display:'inline-block', animation:`ia-dots 1.2s ease-in-out ${i*0.2}s infinite` }}/>))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* INPUT */}
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_MIME} onChange={handleFileSelect} style={{ display:'none' }}/>
          <InputBox
            th={th} fontSize={fontSize} chatInput={chatInput} setChatInput={setChatInput}
            handleSend={()=>handleSend()} handleKeyDown={handleKeyDown} handlePaste={handlePaste}
            isChatLoading={isChatLoading} pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
            fileInputRef={fileInputRef} canSend={canSend} isFullscreen={isFullscreen}
          />
        </div>
      </div>

      {/* BOTÃO FLUTUANTE */}
      <div style={{ position:'fixed', zIndex:9998, bottom:'1.5rem', right:'1.5rem', transform:isChatOpen?'scale(0)':'scale(1)', opacity:isChatOpen?0:1, transition:'0.2s', pointerEvents:isChatOpen?'none':'auto' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview}/>
      </div>
    </>
  );
}