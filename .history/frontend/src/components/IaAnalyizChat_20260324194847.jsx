// frontend/src/components/IaAnalyizChat.jsx — v21
// CORREÇÕES v21:
//  1. AnalyizFace novo (v3) no botão flutuante e cabeçalho — removido da sidebar
//  2. Texto do chat: fonte Inter 14px, line-height 1.6, sem espaçamentos excessivos
//  3. Modo "pensando": caixa menor, cor apagada (não itálico), colapsa automaticamente
//  4. Respostas IA: o raciocínio NÃO vaza para a resposta final (filtrado)
//  5. ThinkingPanel: sem spinners extras, sem itálico, texto pequeno e apagado

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Paperclip, X, Plus, ExternalLink,
  FileText, FileSpreadsheet, Music, File, Image as ImageIcon,
  CheckCircle, Sun, Moon, BookOpen, Download, Copy,
  Search, Menu, Monitor, BarChart2, Users, MessageCircle,
  TrendingUp, Edit2, Check, FileCode,
} from 'lucide-react';

import AnalyizFace, { useAnalyizFaceState } from './AnalyizFace';
import GeminiIcon from './GeminiIcon';

const API_BASE_URL  = 'http://localhost:3000';
const SESSION_KEY   = 'analyiz_last_session_id';
const POLL_INITIAL  = 8 * 1000;
const POLL_INTERVAL = 10 * 60 * 1000;
const MAX_FILES     = 10;

const TYPEWRITER_CHAR_MS   = 18;
const STEP_MIN_DURATION_MS = 900;
const STEP_SEQUENCE_GAP_MS = 180;
const COLLAPSE_AFTER_MS    = 1400;
const TICK_MS              = 1000;
const THINKING_CHUNK_MS    = 12;

// ═══════════════════════════════════════════════════════════════════════════════
// SKILLS DINÂMICAS
// ═══════════════════════════════════════════════════════════════════════════════
const DYNAMIC_SKILLS = {
  excel: {
    detect: msg => /planilha|csv|excel|xlsx|xls|tabela|coluna|linha|dados estruturados/i.test(msg),
    steps: [{ text: 'Lendo planilha e extraindo dados estruturados…', desc: 'Etapa A: extração de colunas e headers. Etapa B: correlação com contexto. Etapa C: síntese dos dados.' }],
  },
  pdf: {
    detect: msg => /pdf|documento|relatório|laudo|contrato|nota fiscal|nf-e/i.test(msg),
    steps: [{ text: 'Extraindo texto do documento PDF…', desc: 'Leitura completa: OCR, extração de tabelas e metadados.' }],
  },
  image: {
    detect: (msg, fileNames, numImages) => numImages > 0 || /imagem|foto|screenshot|print|captura|visual/i.test(msg),
    steps: [{ text: 'Ativando visão computacional para análise da imagem…', desc: 'Detecção de elementos visuais, textos e layouts.' }],
  },
  code: {
    detect: msg => /código|componente|jsx|react|função|arquivo|bug|erro|fix|corrigir|html|css|javascript|typescript|python|sql/i.test(msg),
    steps: [
      { text: 'Analisando estrutura do código-fonte…', desc: 'Sintaxe, imports e compatibilidade de versão.' },
      { text: 'Verificando padrões e dependências do projeto…', desc: 'Convenções e nomes originais preservados.' },
    ],
  },
  logistica: {
    detect: msg => /divergên|peso|frete|auditoria|varredura|anúncio|reincidente|pendente/i.test(msg),
    steps: [
      { text: 'Consultando divergências de peso/frete no banco de dados…', desc: 'Filtrando por: PENDENTE, REINCIDENTE e PENDENTE_ENVIO.' },
      { text: 'Cruzando dados de logística com os anúncios do Mercado Livre…', desc: 'Correlação via API ML.' },
    ],
  },
  catalogo: {
    detect: msg => /produto|sku|catálogo|kit|estoque|vincul|cadastr/i.test(msg),
    steps: [{ text: 'Consultando catálogo de produtos e SKUs…', desc: 'Acessando banco de dados do catálogo.' }],
  },
  usuarios: {
    detect: msg => /usuário|acesso|aprovação|bloquear|permiss|role|owner|admin/i.test(msg),
    steps: [{ text: 'Verificando permissões e usuários pendentes…', desc: 'Consultando sistema de controle de acesso.' }],
  },
  precificacao: {
    detect: msg => /preço|precific|valor|custo|faturamento|margem/i.test(msg),
    steps: [{ text: 'Analisando histórico de preços e estratégia de precificação…', desc: 'Histórico de alterações nos anúncios.' }],
  },
  dashboard: {
    detect: msg => /resumo|relatório|métrica|dashboard|visão geral|panorama|status geral/i.test(msg),
    steps: [{ text: 'Compilando métricas e indicadores do sistema…', desc: 'Consultando múltiplas fontes de dados em paralelo.' }],
  },
  audio: {
    detect: (msg, fileNames) => (fileNames || []).some(n => /\.(mp3|wav|ogg|m4a|webm)$/i.test(n)),
    steps: [{ text: 'Transcrevendo áudio com reconhecimento de fala…', desc: 'Processando arquivo de áudio.' }],
  },
  website: {
    detect: msg => /site|website|landing page|página web|html.*css|criar.*página|desenvolver.*site/i.test(msg),
    steps: [
      { text: 'Planejando estrutura e layout da página…', desc: 'HTML semântico, CSS moderno, responsividade.' },
      { text: 'Gerando HTML semântico e CSS otimizado…', desc: 'Criando código com estrutura semântica.' },
    ],
  },
  default: {
    detect: () => true,
    steps: [{ text: 'Analisando intenção da solicitação…', desc: 'Identificando o objetivo principal.' }],
  },
};

const EMOTION_PATTERNS = [
  { regex: /\b(brav[ao]|irritad[ao]|furioso|raiva|ódio|que merda|droga|porra|que absurdo)\b/i, text: '😤 Detectando frustração na mensagem…', desc: 'Ajustando tom para ser direto e focado em solução.' },
  { regex: /\b(triste|chateado|deprimid[ao]|mal|péssimo|horrível|chorando)\b/i, text: '😔 Detectando sentimento negativo…', desc: 'Resposta estruturada com empatia.' },
  { regex: /\b(urgente|rápido|agora|imediato|urgência|preciso já|socorro)\b/i, text: '⚡ Detectando urgência na solicitação…', desc: 'Priorizando velocidade e clareza.' },
  { regex: /\b(ansios[ao]|preocupad[ao]|nervos[ao]|assustado|medo|tenso)\b/i, text: '😰 Detectando ansiedade na mensagem…', desc: 'Equilibrando clareza técnica com tom tranquilizador.' },
  { regex: /\b(feliz|ótimo|excelente|incrível|perfeito|amei|adorei|massa|show)\b/i, text: '😊 Detectando entusiasmo positivo…', desc: 'Mantendo tom positivo na resposta.' },
];

function detectEmotion(msg) {
  if (!msg) return null;
  for (const p of EMOTION_PATTERNS) if (p.regex.test(msg)) return p;
  return null;
}

function selectSkills(message, fileNames = [], numImages = 0) {
  const msg = message || '';
  const selected = [];
  const emotion = detectEmotion(msg);
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
  selected.push({ text: 'Preparando resposta…', desc: 'Consolidando informações coletadas.' });
  const hasSpecific = selected.some(s =>
    s.text !== 'Verificando contexto e permissões do usuário…' &&
    s.text !== 'Preparando resposta…' &&
    !EMOTION_PATTERNS.some(e => e.text === s.text)
  );
  if (!hasSpecific) selected.splice(selected.length - 2, 0, ...DYNAMIC_SKILLS.default.steps);
  return selected.map((s, i) => ({ ...s, id: `step-${i}-${Date.now()}`, status: i === 0 ? 'active' : 'waiting' }));
}

function gerarNomeArquivo(lang, userMessage, index, usedNames) {
  const msg = (userMessage || '').toLowerCase();
  const l   = (lang || '').toLowerCase().trim();
  const EXT = { html:'html', css:'css', js:'js', jsx:'jsx', ts:'ts', tsx:'tsx', py:'py', sql:'sql', json:'json', sh:'sh', bash:'sh', md:'md', yaml:'yaml', yml:'yaml', xml:'xml', java:'java', cs:'cs', cpp:'cpp', go:'go', rs:'rs', rb:'rb', php:'php', swift:'swift', kt:'kt', txt:'txt', env:'env', dockerfile:'dockerfile', toml:'toml' };
  const ext = EXT[l] || l || 'txt';
  let base = '';
  const patterns = [
    { regex: /petshop|pet shop|loja.*pet/i, name: 'petshop' },
    { regex: /landing page|página.*vendas|sales/i, name: 'landing_page' },
    { regex: /portfolio|portfólio/i, name: 'portfolio' },
    { regex: /login|autenticação|auth/i, name: 'login' },
    { regex: /dashboard|painel|admin/i, name: 'dashboard' },
    { regex: /restaurante|cardápio|delivery/i, name: 'restaurante' },
    { regex: /e-?commerce|loja.*online|store/i, name: 'ecommerce' },
    { regex: /blog|artigo|post/i, name: 'blog' },
    { regex: /agenda|calendário|schedule/i, name: 'agenda' },
    { regex: /calculadora|calculator/i, name: 'calculadora' },
    { regex: /formulário|form|contato/i, name: 'formulario' },
    { regex: /relatório|report|metricas/i, name: 'relatorio' },
    { regex: /produto|catalog|catálogo/i, name: 'catalogo' },
    { regex: /divergenc|frete|peso/i, name: 'divergencias' },
    { regex: /usuario|user|perfil|profile/i, name: 'usuarios' },
  ];
  for (const p of patterns) { if (p.regex.test(msg)) { base = p.name; break; } }
  if (!base) {
    const d = { html:'pagina', css:'estilo', js:'script', jsx:'componente', tsx:'componente', ts:'codigo', py:'script', sql:'query', json:'dados', sh:'script', bash:'script', yaml:'config', yml:'config', xml:'dados', java:'codigo', cs:'codigo', cpp:'codigo', go:'codigo', rs:'codigo', rb:'script', php:'script', swift:'codigo', kt:'codigo', md:'documento' };
    base = d[l] || 'arquivo';
  }
  const suf = { html:'', css:'_estilo', js:'_script', jsx:'_componente', tsx:'_componente', py:'_script', sql:'_query' };
  const suffix = suf[l] !== undefined ? suf[l] : '';
  let filename = `${base}${suffix}.${ext}`;
  let attempt = 1;
  while (usedNames && usedNames.has(filename)) { attempt++; filename = `${base}${suffix}_${attempt}.${ext}`; }
  if (usedNames) usedNames.add(filename);
  return filename;
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

  const startRef      = useRef(null);
  const tickRef       = useRef(null);
  const stepTimerRef  = useRef(null);
  const collapseRef   = useRef(null);
  const chunkQueueRef = useRef([]);
  const chunkTimerRef = useRef(null);
  const stepsRef      = useRef([]);

  const reset = useCallback(() => {
    setPhase('idle'); setSteps([]); setReasoningLog([]); setElapsedMs(0);
    setIsOpen(true); setIsReadyForReply(false);
    clearInterval(tickRef.current); clearTimeout(stepTimerRef.current);
    clearTimeout(collapseRef.current); clearInterval(chunkTimerRef.current);
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
    collapseRef.current = setTimeout(() => setIsOpen(false), COLLAPSE_AFTER_MS);
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
    headerBg:'#fff', headerBorder:'#eee',
    chatAreaBg:'#ffffff', sidebarBg:'#f8fafc',
    inputAreaBg:'#ffffff', inputBoxBg:'#f1f3f4', inputBoxBorder:'#e8eaed',
    quickActionBg:'#f1f3f4', quickActionHover:'#e8eaed',
    greetingGradient:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    codeBg:'#f6f8fa', codeBorder:'#e1e4e8',
    thinkBorder:'#d1d5db',
    stepDescBg:'rgba(66,133,244,0.04)', stepDescBorder:'rgba(66,133,244,0.15)',
  },
  dark: {
    bg:'#131314', surface:'#1e1f20', border:'#3c4043',
    text:'#e3e3e3', textMuted:'#9aa0a6', textFaint:'#5f6368',
    brand:'#8ab4f8', userBubble:'#303134', userText:'#e3e3e3',
    headerBg:'#1e1f20', headerBorder:'#3c4043',
    chatAreaBg:'#131314', sidebarBg:'#1e1f20',
    inputAreaBg:'#1e1f20', inputBoxBg:'#282a2c', inputBoxBorder:'#3c4043',
    quickActionBg:'#282a2c', quickActionHover:'#303134',
    greetingGradient:'linear-gradient(135deg, #8ab4f8 0%, #c084fc 100%)',
    codeBg:'#1a1b1e', codeBorder:'#3c4043',
    thinkBorder:'#3c4043',
    stepDescBg:'rgba(66,133,244,0.06)', stepDescBorder:'rgba(66,133,244,0.18)',
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
  { icon:BarChart2,     label:'Resumo de vendas',   prompt:'Me mostre um resumo das vendas recentes' },
  { icon:Users,         label:'Analisar clientes',  prompt:'Quais são meus clientes mais ativos?' },
  { icon:MessageCircle, label:'Ver conversas',       prompt:'Mostre as últimas conversas do WhatsApp' },
  { icon:TrendingUp,    label:'Métricas do dia',     prompt:'Quais são as métricas de hoje?' },
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

function processTextAndCode(content) {
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

// ─── FILTRO CRÍTICO: remove texto de raciocínio que vaza para a resposta ──────
// Remove blocos como "Analisando a Intenção\n..." que o backend às vezes inclui
function filterReasoningFromReply(text) {
  if (!text) return '';
  // Remove padrões como "**Título**\n\nTexto de raciocínio..." que vazam
  // Detecta se a resposta começa com um padrão de raciocínio
  const reasoningStartPatterns = [
    /^(\*\*Analisando|Analisando a Inten|Classificação do Tipo|Planejamento da Resposta|Verificação Final|Detectando Frustração|Detectando|Skill |Verificando Dados)/i,
    /^(Aqui está|Certo|Com certeza|Claro[,!])/i,
  ];
  
  // Tenta encontrar onde a resposta "real" começa
  // Se o texto tem seções de raciocínio antes da resposta, tenta pular
  const lines = text.split('\n');
  let startIdx = 0;
  
  // Detecta se as primeiras linhas são padrão de raciocínio
  const isReasoningHeader = (line) => {
    const clean = line.replace(/\*\*/g, '').trim();
    return /^(Analisando|Classificação|Planejamento|Verificação|Detectando|Skill |Verificando Dados|Estratégia)/i.test(clean);
  };
  
  // Se começa com padrão de raciocínio, pula até a resposta real
  if (isReasoningHeader(lines[0])) {
    // Procura por uma linha separadora ou mudança de contexto
    let inReasoning = true;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (inReasoning && !isReasoningHeader(line) && line.length > 10) {
        // Verifica se parece resposta real (não é texto de raciocínio interno)
        const isStillReasoning = /^(O usuário|Preciso|A entrada|A ferramenta|O contexto|Portanto|A resposta deve|Vou |Devo |Não há|A intenção)/i.test(line);
        if (!isStillReasoning) {
          startIdx = i;
          break;
        }
      }
    }
  }
  
  if (startIdx > 0) {
    return lines.slice(startIdx).join('\n').trim();
  }
  
  // Aplica filtros de limpeza padrão
  return text
    .replace(/^(Claro[,!]\s*)/i, '')
    .replace(/^(Com certeza[,!]\s*)/i, '')
    .replace(/^(Ótima pergunta[,!]\s*)/i, '')
    .trim();
}

function enrichHTML(h){if(!h)return'';return h.replace(/\b(MLB\d+)\b(?![^<]*>)/g,'<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#f59e0b;font-weight:600;text-decoration:underline">$1</a>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*([^*\n<]+)\*/g,'<b>$1</b>').replace(/^#{1,6}\s+/gm,'').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>').trim();}
function extractLinks(html){const links=[],re=/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;let m;while((m=re.exec(html))!==null){const h=m[1],l=m[2].trim()||m[1];if(h&&h!=='#')links.push({href:h,label:l});}return[...new Map(links.map(l=>[l.href,l])).values()];}
function getTime(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function safeTime(v){if(!v)return getTime();const d=new Date(v);return isNaN(d.getTime())?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function formatDuration(ms){const s=Math.round(ms/1000);if(s<60)return`${s}s`;const m=Math.floor(s/60);return`${m}m ${s%60}s`;}

// ─── Detecta estado da face com base no contexto ──────────────────────────────
function detectFaceState({ isLoading, isUploading, pendingFiles, lastUserMessage, justDone, isTypingResponse }) {
  if (justDone)         return 'done';
  if (isTypingResponse) return 'happy';
  if (isUploading)      return 'upload';
  if (isLoading) {
    const msg = lastUserMessage || '';
    if (/imagem|foto|screenshot|print/i.test(msg)) return 'photo';
    if (/código|jsx|react|função|bug|html|css|js|py/i.test(msg)) return 'code';
    if (/pdf|documento|relatório/i.test(msg)) return 'book';
    if (/áudio|mp3|wav/i.test(msg)) return 'audio';
    return 'thinking';
  }
  if (pendingFiles?.length > 0) {
    const types = pendingFiles.map(f => f.group);
    if (types.includes('image')) return 'photo';
    if (types.includes('audio')) return 'audio';
    if (types.includes('pdf'))   return 'book';
    if (types.includes('excel')) return 'book';
    return 'upload';
  }
  return 'idle';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS GLOBAL — CORRIGIDO
// - Fonte 14px (igual ao Figma Make)
// - line-height 1.6 (não 1.65)
// - Paragraphs: margin-bottom 0 (sem espaçamento excessivo)
// ═══════════════════════════════════════════════════════════════════════════════
const CHAT_STYLES = (th, fs) => `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono&display=swap');

  @keyframes ia-blink      { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes ia-fade-in    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ia-greeting   { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes ia-dots       { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
  @keyframes ia-step-in    { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }

  .ia-chat-root *{box-sizing:border-box;}
  .ia-chat-root{font-family:'Google Sans',sans-serif!important;font-size:14px;color:${th.text};}

  .ia-scroll::-webkit-scrollbar{width:4px}
  .ia-scroll::-webkit-scrollbar-track{background:transparent}
  .ia-scroll::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px}

  /* ─── TIPOGRAFIA DO CHAT — IGUAL AO FIGMA MAKE ─── */
  .ia-msg {
    font-family: 'Google Sans', sans-serif !important;
    font-size: 14px !important;
    line-height: 1.6 !important;
    color: ${th.text};
    animation: ia-fade-in 0.3s ease;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  /* Remove espaçamento excessivo entre parágrafos */
  .ia-msg p, .ia-msg br + br {
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Espaçamento entre blocos BR controlado */
  .ia-msg .ia-text-block {
    font-size: 14px !important;
    line-height: 1.6 !important;
    letter-spacing: -0.01em;
  }

  .ia-msg a{color:#8ab4f8!important;text-decoration:underline;font-weight:500;}
  .ia-msg b{font-weight:600;}

  /* ─── THINKING PANEL — COMPACTO E APAGADO ─── */
  .ia-think-panel{margin-bottom:10px;}
  .ia-think-header{display:flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:2px 0;font-family:'Google Sans',sans-serif;user-select:none;transition:opacity 0.15s;}
  .ia-think-header:hover{opacity:0.7;}

  .ia-think-step{display:flex;flex-direction:column;padding:2px 0;animation:ia-step-in 0.25s cubic-bezier(0.4,0,0.2,1) both;}
  .ia-think-step.waiting{display:none;}
  .ia-step-row{display:flex;align-items:flex-start;gap:8px;}

  /* Descrição do step — compacta, sem itálico */
  .ia-step-desc{
    margin-left:24px;
    margin-top:2px;
    margin-bottom:4px;
    padding:5px 8px;
    background:${th.stepDescBg};
    border-left:2px solid ${th.stepDescBorder};
    border-radius:0 4px 4px 0;
    font-size:11px;
    line-height:1.5;
    color:${th.textFaint};
    font-family:'Google Sans',sans-serif!important;
    /* SEM itálico */
    font-style:normal;
    animation:ia-step-in 0.22s ease both;
  }

  /* Texto do step — monospace pequeno */
  .ia-step-text{
    font-family:'Google Sans Mono','Cascadia Code',monospace!important;
    font-size:11px;
    line-height:1.45;
    padding-top:1px;
  }

  /* Reasoning block — cor bem apagada */
  .ia-reasoning-text {
    font-size: 11px;
    line-height: 1.55;
    color: ${th.textFaint};
    font-family: 'Google Sans', sans-serif !important;
    font-style: normal;
    opacity: 0.7;
  }

  .ia-sidebar-panel{width:260px;background:${th.sidebarBg};border-right:1px solid ${th.border};display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;transition:width 0.28s cubic-bezier(0.4,0,0.2,1),opacity 0.22s ease,min-width 0.28s;min-width:260px;}
  .ia-sidebar-panel.closed{width:0;min-width:0;opacity:0;pointer-events:none;}
  .ia-sidebar-item{transition:background 0.12s ease;border-radius:8px;margin:1px 6px;cursor:pointer;}
  .ia-sidebar-item:hover{background:${th.quickActionHover}!important;}
  .ia-sidebar-item:hover .ia-del-btn{opacity:1!important;}

  .ia-input-box{background:${th.inputBoxBg};border:1.5px solid ${th.inputBoxBorder};border-radius:24px;padding:12px 16px;display:flex;flex-direction:column;gap:8px;transition:border-color 0.2s,box-shadow 0.2s;}
  .ia-input-box:focus-within{border-color:#8ab4f8;box-shadow:0 0 0 2px rgba(138,180,248,0.12);}
  .ia-textarea{flex:1;background:transparent;border:none;outline:none;color:${th.text};resize:none;padding:0;font-size:14px;font-family:'Google Sans',sans-serif;max-height:160px;line-height:1.5;}
  .ia-textarea::placeholder{color:${th.textFaint};}

  .ia-msg-area-wrap{position:relative;flex:1;display:flex;flex-direction:column;overflow:hidden;}
  .ia-msg-area-wrap::after{content:'';position:absolute;top:0;left:0;right:0;height:56px;background:linear-gradient(to bottom,${th.chatAreaBg} 0%,transparent 100%);pointer-events:none;z-index:2;}

  .ia-tip{position:relative;}
  .ia-tip:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100%+6px);left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;font-size:11px;padding:4px 8px;border-radius:6px;white-space:nowrap;pointer-events:none;z-index:999999;font-family:'Google Sans',sans-serif;}

  .ia-code-block{border-radius:10px;overflow:hidden;margin:6px 0;border:1px solid ${th.codeBorder};}
  .ia-code-header{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:${th.codeBg};border-bottom:1px solid ${th.codeBorder};}
  .ia-code-body{background:${th.codeBg};padding:12px;overflow-x:auto;font-size:12px;line-height:1.5;color:${th.text};white-space:pre;max-height:320px;overflow-y:auto;font-family:'Google Sans Mono',monospace;}
  .ia-code-body::-webkit-scrollbar{height:4px;width:4px;}
  .ia-code-body::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px;}

  .ia-msg-wrap:hover .ia-msg-actions{opacity:1!important;}
  .ia-chip{transition:all 0.15s ease;cursor:pointer;}
  .ia-chip:hover{background:${th.quickActionHover}!important;transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,0.1);}

  .ia-fs-msg{max-width:720px;width:100%;margin:0 auto;padding:0 24px;}
`;

// ── TypewriterSpan ────────────────────────────────────────────────────────────
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
      if (idx >= text.length) {
        clearInterval(timerRef.current);
        if (!doneRef.current) { doneRef.current = true; setTimeout(() => onDone?.(), 60); }
      }
    }, TYPEWRITER_CHAR_MS);
    return () => clearInterval(timerRef.current);
  }, [text, active]);
  const showCursor = active && displayed.length < text.length;
  return (
    <span>
      {displayed}
      {showCursor && <span style={{ display:'inline-block', width:'1.5px', height:'11px', background:'#8ab4f8', marginLeft:'2px', verticalAlign:'text-bottom', animation:'ia-blink 0.7s step-end infinite' }}/>}
    </span>
  );
}

// ── ThinkingStepRow ───────────────────────────────────────────────────────────
function ThinkingStepRow({ step, th }) {
  const isActive  = step.status === 'active';
  const isDone    = step.status === 'done';
  const isWaiting = step.status === 'waiting';
  if (isWaiting) return null;
  return (
    <div className="ia-think-step">
      <div className="ia-step-row">
        <div style={{ width:'16px', height:'16px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:'1px' }}>
          {isDone
            ? <CheckCircle size={12} style={{ color:'#8ab4f8', opacity:0.65 }}/>
            : isActive
              ? <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#4285F4', display:'inline-block', animation:'ia-dots 1.2s ease-in-out infinite' }}/>
              : null
          }
        </div>
        <span className="ia-step-text" style={{
          color: isDone ? th.textFaint : isActive ? th.textMuted : 'transparent',
          fontWeight: isActive ? 500 : 400,
          transition: 'color 0.2s',
        }}>
          {isActive ? <TypewriterSpan text={step.text} active={true} onDone={() => {}}/> : step.text}
        </span>
      </div>
      {isActive && step.desc && <div className="ia-step-desc">{step.desc}</div>}
    </div>
  );
}

// ── ThinkingPanel — COMPACTO ──────────────────────────────────────────────────
function ThinkingPanel({ orchestrator, th }) {
  const { phase, steps, reasoningLog, elapsedMs, isOpen, setIsOpen } = orchestrator;
  if (phase === 'idle') return null;
  const isLive     = phase === 'thinking';
  const isFinished = phase === 'done';
  const label      = isFinished ? `Pensou por ${formatDuration(elapsedMs)}` : 'Pensando…';
  
  // Texto do reasoning concatenado
  const reasoningText = reasoningLog.map(b => b.text).join('');
  
  return (
    <div className="ia-think-panel">
      <button className="ia-think-header" onClick={() => setIsOpen(v => !v)}>
        <div style={{ width:'16px', height:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isFinished
            ? <CheckCircle size={12} style={{ color:th.textFaint, opacity:0.5 }}/>
            : <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#4285F4', display:'inline-block', animation:'ia-dots 1.0s ease-in-out infinite' }}/>
          }
        </div>
        <span style={{
          fontSize:'12px',
          fontWeight: isFinished ? 400 : 500,
          color: isFinished ? th.textFaint : '#5f6368',
          fontFamily:"'Google Sans',sans-serif",
          fontStyle: 'normal',   /* SEM itálico */
          transition:'color 0.3s',
          opacity: isFinished ? 0.7 : 1,
        }}>
          {label}
        </span>
        {isOpen
          ? <ChevronUp size={11} style={{ opacity:0.35, color:th.textFaint }}/>
          : <ChevronDown size={11} style={{ opacity:0.35, color:th.textFaint }}/>
        }
      </button>

      <div style={{
        overflow:'hidden',
        maxHeight: isOpen ? '600px' : '0px',
        opacity: isOpen ? 1 : 0,
        transition: isOpen
          ? 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease'
          : 'max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.18s ease',
      }}>
        <div style={{
          marginTop:'4px', marginLeft:'2px', paddingLeft:'12px',
          borderLeft: `1.5px solid ${isFinished ? th.border : '#4285F444'}`,
          transition:'border-color 0.5s ease',
        }}>
          {steps.map(step => step.status !== 'waiting' && <ThinkingStepRow key={step.id} step={step} th={th}/>)}

          {/* Reasoning text — cor apagada, sem itálico */}
          {reasoningText && (
            <div className="ia-reasoning-text" style={{ marginTop:'4px', paddingTop:'4px' }}>
              {reasoningText.substring(0, 800)}{reasoningText.length > 800 ? '…' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SafeHTMLMsg ───────────────────────────────────────────────────────────────
function SafeHTMLMsg({ html }) {
  const ref = useRef(null);
  useEffect(()=>{
    if(!ref.current)return;
    ref.current.querySelectorAll('a[href^="http"]').forEach(a=>{a.style.cssText='color:#8ab4f8;text-decoration:underline;font-weight:500';a.setAttribute('target','_blank');a.setAttribute('rel','noopener noreferrer');});
  },[html]);
  return <span ref={ref} dangerouslySetInnerHTML={{__html:html}} style={{ wordBreak:'break-word', overflowWrap:'break-word' }}/>;
}

// ── DiffusionText ─────────────────────────────────────────────────────────────
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
    let iter=0;const maxIter=28;
    const iv=setInterval(()=>{
      if(!mounted)return;iter++;
      let cur='';let allResolved=true;
      tokens.forEach((tk,idx)=>{
        if(tk.type==='tag'||tk.resolved){cur+=tk.val;}
        else{const p=iter/maxIter,t=idx/tokens.length;if(p>t+Math.random()*0.15){tk.resolved=true;cur+=tk.val;}else{allResolved=false;cur+=chars[Math.floor(Math.random()*chars.length)];}}
      });
      setScrambled(cur);
      if(allResolved||iter>=maxIter){clearInterval(iv);setScrambled(html);setTimeout(()=>onDoneRef?.current?.(),0);}
    },36);
    return()=>{mounted=false;clearInterval(iv);};
  },[html,onDoneRef]);
  return <SafeHTMLMsg html={scrambled}/>;
}

// ── InlineCodeBlock ───────────────────────────────────────────────────────────
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
          <FileCode size={13} style={{color:th.brand}}/>
          <span style={{fontSize:'11px',fontWeight:600,color:th.text,fontFamily:"'Google Sans Mono',monospace"}}>{filename}</span>
          <span style={{fontSize:'10px',color:th.textFaint,background:th.surface,padding:'1px 5px',borderRadius:'3px',border:`1px solid ${th.border}`}}>{label}</span>
        </div>
        <div style={{display:'flex',gap:'5px'}}>
          <button onClick={handleCopy} style={{background:'none',border:'none',color:copied?'#10b981':th.textFaint,cursor:'pointer',padding:'3px',borderRadius:'5px',display:'flex',alignItems:'center',gap:'3px',fontSize:'11px',transition:'all 0.15s'}}>
            {copied?<><Check size={12}/> Copiado</>:<><Copy size={12}/> Copiar</>}
          </button>
          <button onClick={()=>onOpenSidePanel({lang,code,filename})} style={{background:'none',border:`1px solid ${th.border}`,color:th.brand,cursor:'pointer',padding:'3px 7px',borderRadius:'5px',display:'flex',alignItems:'center',gap:'3px',fontSize:'11px'}}>
            <BookOpen size={11}/> Abrir
          </button>
        </div>
      </div>
      <div className="ia-code-body">
        {preview}
        {hasMore&&<span style={{display:'block',color:th.textFaint,fontSize:'11px',marginTop:'4px',cursor:'pointer'}} onClick={()=>onOpenSidePanel({lang,code,filename})}>… +{lines.length-8} linhas — clique em Abrir</span>}
      </div>
    </div>
  );
}

// ── IaMessage — com filtragem de raciocínio ───────────────────────────────────
function IaMessage({ msg, isTyping, onDone, th, onOpenSidePanel, userMessage }) {
  // FILTRO: remove raciocínio que vaza para a resposta
  const filteredContent = filterReasoningFromReply(msg.content || '');
  const parts     = processTextAndCode(filteredContent);
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
  return (
    <div className="ia-msg">
      {hasThinking && <ThinkingPanel orchestrator={historyOrch} th={th}/>}
      {parts.map((part, i) => {
        if (part.type === 'code') {
          const filename = gerarNomeArquivo(part.lang, userMessage || msg.userMessage || '', i, _usedNames);
          return <InlineCodeBlock key={i} lang={part.lang} code={part.content} th={th} onOpenSidePanel={onOpenSidePanel} filename={filename}/>;
        }
        const enriched = enrichHTML(part.content);
        const links    = extractLinks(enriched);
        return (
          <div key={i} className="ia-text-block" style={{ marginBottom: i < parts.length - 1 ? '6px' : '0' }}>
            {isTyping && i===parts.length-1
              ? <DiffusionText html={enriched} onDoneRef={onDoneRef}/>
              : <SafeHTMLMsg html={enriched}/>
            }
            {!isTyping && links.length>0 && (
              <div style={{marginTop:'6px',borderTop:`1px solid ${th.border}`,paddingTop:'5px',display:'flex',flexWrap:'wrap',gap:'4px'}}>
                {links.map((l,li)=>(
                  <a key={li} href={l.href} target={l.href.startsWith('/')?'_self':'_blank'} rel="noopener noreferrer"
                    style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:'#8ab4f8',textDecoration:'none',background:th.surface,borderRadius:'5px',padding:'3px 7px',border:`1px solid ${th.border}`}}>
                    <ExternalLink size={9}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'160px'}}>{l.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── FileAttachmentGrid / PendingFilesGrid ─────────────────────────────────────
function FileAttachmentGrid({attachments,th}){
  if(!attachments?.length)return null;
  return(
    <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'6px',justifyContent:'flex-end'}}>
      {attachments.map((att,i)=>{
        const info=getFileInfo(att.mimeType),color=GROUP_COLORS[info.group]||GROUP_COLORS.unknown,Icon=info.icon;
        if(info.group==='image'&&att.preview)return(<div key={i} style={{width:'52px',height:'52px',borderRadius:'8px',overflow:'hidden',flexShrink:0,border:`1px solid ${th.border}`}}><img src={att.preview} alt={att.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/></div>);
        return(<div key={i} style={{width:'52px',height:'52px',borderRadius:'8px',background:th.surface,border:`1px solid ${th.border}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px',flexShrink:0}}><Icon size={16} style={{color}}/><span style={{fontSize:'8px',color:th.textFaint,textAlign:'center',lineHeight:'1.1',overflow:'hidden',maxWidth:'46px',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</span></div>);
      })}
    </div>
  );
}

function PendingFilesGrid({files,onRemove,th}){
  if(!files.length)return null;
  return(
    <div style={{display:'flex',flexWrap:'wrap',gap:'6px',padding:'6px 0 2px'}}>
      {files.map((f,i)=>{
        const info=getFileInfo(f.mimeType),color=GROUP_COLORS[info.group]||GROUP_COLORS.unknown,Icon=info.icon;
        return(
          <div key={i} style={{position:'relative',width:'52px',height:'52px',flexShrink:0}}>
            <div style={{width:'52px',height:'52px',borderRadius:'8px',background:info.group==='image'&&f.preview?'transparent':th.surface,border:`1px solid ${th.border}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'2px',overflow:'hidden'}}>
              {info.group==='image'&&f.preview?<img src={f.preview} alt={f.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<><Icon size={16} style={{color,flexShrink:0}}/><span style={{fontSize:'7px',color:th.textFaint,textAlign:'center',lineHeight:'1.1',padding:'0 3px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'46px'}}>{f.name}</span></>}
            </div>
            <button onClick={()=>onRemove(i)} style={{position:'absolute',top:'-5px',right:'-5px',width:'15px',height:'15px',borderRadius:'50%',background:'#ef4444',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}><X size={8} style={{color:'#fff'}}/></button>
          </div>
        );
      })}
    </div>
  );
}

// ── FloatingButton — USA AnalyizFace nova (v3) ────────────────────────────────
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
        style={{
          display:'flex', alignItems:'center', borderRadius:'999px', border:'none', outline:'none',
          background:'#1e293b', cursor:'pointer', boxShadow:'0 4px 20px rgba(30,41,59,0.45)',
          width: hovered ? '172px' : '68px', height:'68px',
          transition:'width 0.28s cubic-bezier(0.34,1.2,0.64,1)',
          padding:0, overflow:'hidden',
        }}
      >
        <span style={{ width:'68px', height:'68px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:'transparent', order:1, zIndex:2 }}>
          {/* AnalyizFace v3 no botão flutuante */}
          <AnalyizFace size={58} state="idle" />
        </span>
        <span style={{ color:'white', fontSize:'13px', fontWeight:700, whiteSpace:'nowrap', paddingRight:'20px', paddingLeft:'2px', order:2, opacity: hovered ? 1 : 0, transition:'opacity 0.18s', pointerEvents:'none' }}>
          Assistente
        </span>
      </button>
    </div>
  );
}

// ── WelcomeGreeting ───────────────────────────────────────────────────────────
function WelcomeGreeting({ th, userName, isFullscreen, onQuickAction, greetingIndex }) {
  const greeting = GREETINGS[greetingIndex % GREETINGS.length](userName);
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, padding: isFullscreen ? '60px 24px 40px' : '32px 20px 24px', textAlign:'center', animation:'ia-greeting 0.5s cubic-bezier(0.34,1.2,0.64,1) both' }}>
      <div style={{ width: isFullscreen ? '84px' : '70px', height: isFullscreen ? '84px' : '70px', borderRadius:'50%', background:'#1e293b', boxShadow:'0 4px 24px rgba(0,0,0,0.18)', marginBottom:'20px', border:'2px solid #3d4060', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <GeminiIcon size={isFullscreen ? 52 : 44} animating={false} />
      </div>
      <h2 style={{ fontSize: isFullscreen ? '26px' : '19px', fontWeight:700, margin:'0 0 8px', background:th.greetingGradient, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', fontFamily:"'Google Sans',sans-serif", lineHeight:1.3 }}>
        {greeting}
      </h2>
      <p style={{ fontSize:'13px', color:th.textMuted, margin:'0 0 24px', fontFamily:"'Google Sans',sans-serif" }}>
        Assistente Analyiz — te ajudo com análises, conversas e muito mais.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px', width:'100%', maxWidth: isFullscreen ? '520px' : '320px' }}>
        {QUICK_ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <button key={i} className="ia-chip" onClick={() => onQuickAction(a.prompt)}
              style={{ display:'flex', alignItems:'center', gap:'8px', background:th.quickActionBg, border:`1px solid ${th.border}`, borderRadius:'12px', padding:'10px 12px', cursor:'pointer', textAlign:'left' }}>
              <Icon size={14} style={{ color:th.brand, flexShrink:0 }}/>
              <span style={{ fontSize:'12px', color:th.text, fontWeight:500, lineHeight:1.3, fontFamily:"'Google Sans',sans-serif" }}>{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── EditableUserMessage ───────────────────────────────────────────────────────
function EditableUserMessage({ msg, th, onSendEdit }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);
  const [copied,  setCopied]  = useState(false);
  const taRef = useRef(null);
  useEffect(() => { if (editing && taRef.current) { taRef.current.style.height='auto'; taRef.current.style.height=taRef.current.scrollHeight+'px'; taRef.current.focus(); } }, [editing]);
  const handleCopy = () => { navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(()=>setCopied(false),1500); };
  const handleSubmit = () => { if (editVal.trim() && editVal.trim() !== msg.content) onSendEdit(msg.id, editVal.trim()); setEditing(false); };
  return (
    <div className="ia-msg-wrap" style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
      <FileAttachmentGrid attachments={msg.attachments} th={th}/>
      <div style={{ display:'flex', alignItems:'flex-end', gap:'8px', flexDirection:'row-reverse', width:'100%', justifyContent:'flex-start' }}>
        {!editing && msg.content && (
          <div style={{ maxWidth:'88%' }}>
            <div style={{ background:th.userBubble, color:th.userText, padding:'9px 13px', borderRadius:'18px 18px 4px 18px', fontSize:'14px', lineHeight:'1.5', whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:"'Google Sans',sans-serif" }}>
              {msg.content}
            </div>
          </div>
        )}
        {editing && (
          <div style={{ maxWidth:'88%', width:'100%' }}>
            <textarea ref={taRef} value={editVal} onChange={e=>{setEditVal(e.target.value);e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSubmit();}if(e.key==='Escape')setEditing(false);}} style={{ width:'100%', background:th.inputBoxBg, color:th.text, border:'1.5px solid #8ab4f8', borderRadius:'12px', padding:'9px 13px', fontSize:'14px', fontFamily:"'Google Sans',sans-serif", resize:'none', outline:'none', lineHeight:'1.5' }}/>
            <div style={{ display:'flex', gap:'6px', marginTop:'5px', justifyContent:'flex-end' }}>
              <button onClick={()=>setEditing(false)} style={{ background:'none', border:`1px solid ${th.border}`, color:th.textMuted, cursor:'pointer', padding:'3px 11px', borderRadius:'7px', fontSize:'12px' }}>Cancelar</button>
              <button onClick={handleSubmit} style={{ background:'#8ab4f8', border:'none', color:'#1e1f20', cursor:'pointer', padding:'3px 11px', borderRadius:'7px', fontSize:'12px', fontWeight:600 }}>Enviar</button>
            </div>
          </div>
        )}
        {!editing && (
          <div className="ia-msg-actions" style={{ display:'flex', gap:'2px', opacity:0, transition:'opacity 0.15s', alignItems:'center', flexShrink:0 }}>
            <button onClick={handleCopy} style={{ background:'none', border:`1px solid ${th.border}`, color:copied?'#10b981':th.textFaint, cursor:'pointer', padding:'3px 6px', borderRadius:'5px', display:'flex', alignItems:'center', fontSize:'11px' }}><Copy size={11}/></button>
            <button onClick={()=>setEditing(true)} style={{ background:'none', border:`1px solid ${th.border}`, color:th.textFaint, cursor:'pointer', padding:'3px 6px', borderRadius:'5px', display:'flex', alignItems:'center', fontSize:'11px' }}><Edit2 size={11}/></button>
          </div>
        )}
      </div>
      {msg.time && !editing && <span style={{ fontSize:'10px', color:th.textFaint, marginTop:'2px' }}>{msg.time}</span>}
    </div>
  );
}

// ── InputBox ──────────────────────────────────────────────────────────────────
function InputBox({ th, chatInput, setChatInput, handleSend, handleKeyDown, handlePaste, isChatLoading, pendingFiles, setPendingFiles, fileInputRef, canSend, isFullscreen }) {
  const taRef = useRef(null);
  useEffect(() => { const ta = taRef.current; if (ta) { ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,160)+'px'; } }, [chatInput]);
  const placeholder = pendingFiles.length > 0 ? `O que fazer com ${pendingFiles.length===1?'o arquivo':`os ${pendingFiles.length} arquivos`}?` : 'Pergunte qualquer coisa…';
  return (
    <div style={{ padding: isFullscreen ? '16px 24px 20px' : '10px 14px', background:th.inputAreaBg }}>
      <div style={{ maxWidth: isFullscreen ? '720px' : '100%', margin:'0 auto' }}>
        <div className="ia-input-box">
          {pendingFiles.length > 0 && <PendingFilesGrid files={pendingFiles} onRemove={i=>setPendingFiles(p=>p.filter((_,idx)=>idx!==i))} th={th}/>}
          <div style={{ display:'flex', alignItems:'flex-end', gap:'8px' }}>
            <textarea ref={taRef} className="ia-textarea" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} disabled={isChatLoading} rows={1} placeholder={placeholder}/>
            <button onClick={handleSend} disabled={!canSend} className="ia-tip" data-tip="Enviar"
              style={{ background:canSend?'#8ab4f8':'transparent', color:canSend?'#1e1f20':th.textFaint, border:canSend?'none':`1px solid ${th.border}`, borderRadius:'50%', width:'34px', height:'34px', flexShrink:0, display:'flex', justifyContent:'center', alignItems:'center', cursor:canSend?'pointer':'default', transition:'all 0.15s' }}>
              <Send size={15} style={{ marginLeft:'2px' }}/>
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <button onClick={()=>fileInputRef.current?.click()} disabled={isChatLoading||pendingFiles.length>=MAX_FILES} className="ia-tip" data-tip="Anexar arquivo"
              style={{ background:'none', border:'none', color:pendingFiles.length>0?th.brand:th.textFaint, cursor:pendingFiles.length>=MAX_FILES?'not-allowed':'pointer', padding:'2px', opacity:pendingFiles.length>=MAX_FILES?0.4:1, display:'flex', alignItems:'center', gap:'4px', position:'relative' }}>
              <Paperclip size={15}/>
              {pendingFiles.length > 0 && <span style={{ background:th.brand, color:th.bg, fontSize:'9px', fontWeight:700, padding:'1px 4px', borderRadius:'9px' }}>{pendingFiles.length}</span>}
            </button>
            <span style={{ fontSize:'10px', color:th.textFaint, fontFamily:"'Google Sans',sans-serif" }}>Enter para enviar · Shift+Enter nova linha</span>
          </div>
        </div>
        <p style={{ textAlign:'center', fontSize:'10px', color:th.textFaint, marginTop:'6px', marginBottom:0, fontFamily:"'Google Sans',sans-serif" }}>
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
  const [fontSize, setFSState] = useState(14); // FIXO em 14px como o Figma Make
  const setDarkMode = v => { setDMState(v); localStorage.setItem('analyiz_darkmode', String(v)); };
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

  // ── Estado da face do cabeçalho ───────────────────────────────────────────
  const [lastUserMsg,      setLastUserMsg]    = useState('');
  const [justDoneHeader,   setJustDoneHeader] = useState(false);
  const [isTypingResp,     setIsTypingResp]   = useState(false);

  const headerFaceState = detectFaceState({
    isLoading:       isChatLoading,
    isUploading:     !isChatLoading && pendingFiles.length > 0,
    pendingFiles,
    lastUserMessage: lastUserMsg,
    justDone:        justDoneHeader,
    isTypingResponse: isTypingResp,
  });

  useEffect(() => {
    if (isTypingResp) setJustDoneHeader(false);
  }, [isTypingResp]);

  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !isChatLoading) {
      setJustDoneHeader(true);
      const t = setTimeout(() => setJustDoneHeader(false), 2200);
      return () => clearTimeout(t);
    }
    prevLoadingRef.current = isChatLoading;
  }, [isChatLoading]);

  const currentUserMessageRef = useRef('');
  const pendingReplyRef       = useRef(null);
  const thinking              = useThinkingOrchestrator();

  const readUserId   = () => { try { return JSON.parse(localStorage.getItem('analyiz_user'))?.id; } catch { return null; } };
  const readUserName = () => { try { const u = JSON.parse(localStorage.getItem('analyiz_user')); return u?.nome || u?.name; } catch { return null; } };
  const [userId]   = useState(readUserId);
  const [userName] = useState(readUserName);
  const [currentSessionId, setCurrentSessionId] = useState(() => { try { return parseInt(localStorage.getItem(SESSION_KEY)); } catch { return null; } });

  const scrollRef        = useRef(null);
  const fileInputRef     = useRef(null);
  const dropRef          = useRef(null);
  const pollTimerRef     = useRef(null);
  const pendingNotifRef  = useRef(null);
  const thinkingMsRef    = useRef(0);
  const thinkingStartRef = useRef(0);

  let modalConfirm = null;
  try { const mod = require('../components/Modal'); if (mod?.useModal) { const { confirm } = mod.useModal(); modalConfirm = confirm; } } catch {}
  const confirmDelete = useCallback(async () => {
    if (modalConfirm) return await modalConfirm({ title:'Excluir conversa', message:'Será removida permanentemente.', confirmLabel:'Excluir', danger:true });
    return window.confirm('Deletar esta conversa?');
  }, [modalConfirm]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isChatLoading, thinking.steps, thinking.reasoningLog, typingSet]);

  useEffect(() => {
    if (thinking.isReadyForReply && pendingReplyRef.current) {
      const { iaId, reply, sources, steps, reasoning, thinkingMs, userMessage } = pendingReplyRef.current;
      pendingReplyRef.current = null;
      const partes    = processTextAndCode(filterReasoningFromReply(reply));
      const firstCode = partes.find(p => p.type === 'code');
      if (firstCode) {
        const fname = gerarNomeArquivo(firstCode.lang, userMessage, 0, new Set());
        setSidePanelContent({ lang: firstCode.lang, code: firstCode.content, filename: fname });
      }
      setMessages(p => [...p, { role:'ia', content:reply, reasoning, steps, thinkingMs, sources:sources||[], time:new Date().toLocaleTimeString(), id:iaId, userMessage }]);
      setTypingSet(prev => new Set(prev).add(iaId));
      setIsTypingResp(true);
    }
  }, [thinking.isReadyForReply]);

  useEffect(() => {
    if (typingSet.size === 0 && isTypingResp) setIsTypingResp(false);
  }, [typingSet, isTypingResp]);

  const carregarSessions = useCallback(async () => {
    if (!userId) return;
    try { const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`); setSessions(await r.json()); } catch {}
  }, [userId]);

  const carregarDocumentos = useCallback(async (sid) => {
    if (!sid) { setSessionDocs([]); return; }
    try { const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${sid}/documents`); setSessionDocs(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    if (currentSessionId && userId) {
      localStorage.setItem(SESSION_KEY, String(currentSessionId));
      fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`).then(r=>r.json()).then(msgs => {
        setMessages(msgs.map(m => {
          let attachments = null;
          if (m.imageDesc) { try { const p = JSON.parse(m.imageDesc); if (Array.isArray(p)) attachments = p.map(att => att.group==='image'&&!att.preview&&m.imageBase64?{...att,preview:`data:${att.mimeType||'image/jpeg'};base64,${m.imageBase64}`}:att); } catch {} }
          const li = m.imageBase64 && !attachments ? [{ mimeType:'image/jpeg', name:'imagem.jpg', group:'image', preview:`data:image/jpeg;base64,${m.imageBase64}`, sizeBytes:0 }] : null;
          return { role:m.role, id:String(m.id), content:m.content, time:safeTime(m.createdAt), attachments:attachments||li, sources:[], reasoning:m.reasoning||'', steps:[] };
        }));
      });
      carregarDocumentos(currentSessionId);
    } else { setMessages([]); }
  }, [currentSessionId, userId, carregarDocumentos]);

  useEffect(() => { if (isChatOpen || isFullscreen) carregarSessions(); }, [isChatOpen, isFullscreen, carregarSessions]);

  useEffect(() => {
    if (!isChatOpen) { setSidePanelContent(null); setHasUnread(false); setShortPreview(''); }
    const p = pendingNotifRef.current; if (!p) return;
    const { notifId, fullInsight } = p; pendingNotifRef.current = null;
    if (notifId && userId) fetch(`${API_BASE_URL}/api/ia/proactive/seen`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId,notifId}) }).catch(()=>{});
    setTimeout(() => {
      const id = `ia-proactive-${Date.now()}`;
      setMessages(prev => [...prev, { role:'ia', content:fullInsight, time:getTime(), id, sources:[], reasoning:'', steps:[] }]);
      setTypingSet(prev => new Set(prev).add(id));
    }, 400);
  }, [isChatOpen]);

  const verificarProativo = useCallback(async () => {
    if (!userId || !isChatOpen) return;
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ia/proactive`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId,userRole}) });
      const data = await res.json();
      if (!data.insight || !data.hasRelevantData) return;
      pendingNotifRef.current = { notifId:data.notifId, fullInsight:data.fullInsight };
      setShortPreview(data.insight); setHasUnread(true);
      if (data.notifId) fetch(`${API_BASE_URL}/api/ia/proactive/exibida`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId,notifId:data.notifId}) }).catch(()=>{});
    } catch {}
  }, [userId, userRole, isChatOpen]);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(verificarProativo, POLL_INITIAL);
    pollTimerRef.current = setInterval(verificarProativo, POLL_INTERVAL);
    return () => { clearTimeout(first); clearInterval(pollTimerRef.current); };
  }, [verificarProativo, userId]);

  const ensureSession = useCallback(async () => {
    if (currentSessionId) return currentSessionId;
    if (!userId) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/sessions`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId}) });
      const s   = await res.json();
      setCurrentSessionId(s.id); return s.id;
    } catch { return null; }
  }, [userId, currentSessionId]);

  // ── handleSend ────────────────────────────────────────────────────────────
  const handleSend = async (overrideInput) => {
    const userMsg = (overrideInput !== undefined ? overrideInput : chatInput).trim();
    if ((!userMsg && !pendingFiles.length) || isChatLoading) return;

    currentUserMessageRef.current = userMsg;
    setLastUserMsg(userMsg);

    const filesToSend        = [...pendingFiles];
    const attachmentSnapshot = filesToSend.map(f => ({ mimeType:f.mimeType, name:f.name, group:f.group, preview:f.preview, sizeBytes:f.sizeBytes }));

    setMessages(p => [...p, { role:'user', content:userMsg, time:new Date().toLocaleTimeString(), id:`u-${Date.now()}`, attachments:attachmentSnapshot.length?attachmentSnapshot:null }]);
    setChatInput(''); setPendingFiles([]); setIsChatLoading(true);
    pendingReplyRef.current = null;

    const fileNames = filesToSend.map(f => f.name);
    const numImages = filesToSend.filter(f => f.group === 'image').length;
    thinkingStartRef.current = Date.now();
    thinking.start(userMsg, filesToSend.length > 0, fileNames, numImages);

    try {
      const sid = await ensureSession();
      const images    = filesToSend.filter(f => f.group === 'image');
      const nonImages = filesToSend.filter(f => f.group !== 'image');
      const firstImg  = images[0];
      const MAX_PREVIEW_SIZE = 8*1024*1024;
      const attachmentMeta = attachmentSnapshot.map(a => {
        const isMainImg    = a.group==='image' && firstImg && a.name===firstImg.name;
        const needsPreview = a.group==='audio' || (a.group==='image' && !isMainImg);
        return { mimeType:a.mimeType, name:a.name, group:a.group, sizeBytes:a.sizeBytes, ...(needsPreview&&a.preview&&a.preview.length<MAX_PREVIEW_SIZE?{preview:a.preview}:{}) };
      });
      const actualPageBaseUrl = pageBaseUrl || window.location.origin || 'http://localhost:5173';
      const res = await fetch(`${API_BASE_URL}/api/ia/chat/stream`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ message:userMsg, sessionId:sid, userId, userRole, pageUrl:window.location.pathname, pageBaseUrl:actualPageBaseUrl, imageOnly:!userMsg&&filesToSend.length===1&&!!firstImg, ...(firstImg?{imageBase64:firstImg.base64,imageMimeType:firstImg.mimeType,imageName:firstImg.name}:{}), extraImages:images.slice(1).map(f=>({base64:f.base64,mimeType:f.mimeType,name:f.name})), files:nonImages.map(f=>({base64:f.base64,mimeType:f.mimeType,name:f.name,group:f.group,sizeBytes:f.sizeBytes})), attachmentMeta }),
      });

      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream:true });
        const lines = buffer.split('\n'); buffer = lines.pop();
        let ev = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) { ev = line.slice(7).trim(); }
          else if (line.startsWith('data: ') && ev) {
            try {
              const data = JSON.parse(line.slice(6));
              if (ev==='reasoning_chunk') { thinking.pushChunk(data.text); }
              else if (ev==='reasoning_end') { if (data.fullText) thinking.addReasoningBlock(data.fullText); }
              else if (ev==='step') { thinking.addBackendStep(data.msg); }
              else if (ev==='done') {
                thinkingMsRef.current = Date.now() - thinkingStartRef.current;
                if (data.sessionId && data.sessionId !== sid) setCurrentSessionId(data.sessionId);
                const iaId = `ia-${Date.now()}`;
                pendingReplyRef.current = {
                  iaId, reply:data.reply, sources:data.sources||[],
                  steps: thinking.steps.map(s => ({ text:s.text, desc:s.desc })),
                  reasoning: thinking.reasoningLog.map(b => b.text).join('\n\n'),
                  thinkingMs: thinkingMsRef.current,
                  sessionId: data.sessionId || sid,
                  userMessage: userMsg,
                };
                carregarDocumentos(data.sessionId || sid);
                carregarSessions();
              }
            } catch {}
            ev = null;
          }
        }
      }
      thinking.finish();
    } catch {
      thinking.finish();
      pendingReplyRef.current = null;
      setMessages(p => [...p, { role:'ia', content:'Erro na comunicação com o servidor.', time:getTime(), id:`err-${Date.now()}`, sources:[], reasoning:'', steps:[] }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleEditMessage = useCallback((msgId, newContent) => {
    setMessages(prev => { const idx = prev.findIndex(m => m.id === msgId); if (idx === -1) return prev; return prev.slice(0, idx); });
    setTimeout(() => handleSend(newContent), 50);
  }, []); // eslint-disable-line

  const processFile = useCallback(file => new Promise((resolve, reject) => {
    const info = getFileInfo(file.type);
    if (!FILE_TYPES[file.type] && !file.type.startsWith('image/') && !file.type.startsWith('audio/')) { reject(new Error(`Tipo não suportado: ${file.name}`)); return; }
    if (file.size > MAX_FILE_SIZE) { reject(new Error(`Arquivo muito grande: ${file.name}`)); return; }
    const r = new FileReader();
    r.onload = ev => { const d = ev.target.result; resolve({ base64:d.split(',')[1], mimeType:file.type||'application/octet-stream', name:file.name, sizeBytes:file.size, group:info.group, preview:['image','audio'].includes(info.group)?d:null }); };
    r.onerror = () => reject(new Error(`Erro ao ler: ${file.name}`));
    r.readAsDataURL(file);
  }), []);

  const addFiles       = useCallback(async fl => { const toAdd=[...fl].slice(0,MAX_FILES),added=[]; for(const f of toAdd){try{added.push(await processFile(f));}catch{}} if(added.length) setPendingFiles(prev=>[...prev,...added].slice(0,MAX_FILES)); }, [processFile]);
  const handleFileSelect = useCallback(async e => { if(e.target.files?.length) await addFiles(e.target.files); e.target.value=''; }, [addFiles]);
  const handlePaste    = useCallback(async e => { const items=e.clipboardData?.items; if(!items) return; const files=[]; for(const item of items){if(item.kind==='file'){const f=item.getAsFile();if(f)files.push(f);}} if(files.length){e.preventDefault();await addFiles(files);} }, [addFiles]);
  const handleDragOver = useCallback(e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(e => { e.preventDefault(); if(!dropRef.current?.contains(e.relatedTarget)) setIsDragging(false); }, []);
  const handleDrop     = useCallback(async e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if(e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files); }, [addFiles]);
  const handleKeyDown  = e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend();} };
  const handleNewSession = () => { setCurrentSessionId(null); setMessages([]); setSidePanelContent(null); thinking.reset(); pendingReplyRef.current=null; setLastUserMsg(''); localStorage.removeItem(SESSION_KEY); };
  const loadSession    = id => { setCurrentSessionId(id); setSidebarOpen(false); };
  const handleCopyCode = () => { if(sidePanelContent?.code) navigator.clipboard.writeText(sidePanelContent.code); };
  const handleDownloadCode = () => { if(!sidePanelContent?.code) return; const blob=new Blob([sidePanelContent.code],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download=sidePanelContent.filename||'documento.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
  const deletarSessao  = async (e, id) => { e.stopPropagation(); if(!await confirmDelete()) return; await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`,{method:'DELETE'}); if(id===currentSessionId) handleNewSession(); carregarSessions(); };

  const isNewSession      = messages.length === 0 && thinking.phase === 'idle';
  const conversationTitle = deriveTitle(messages);
  const canSend           = (chatInput.trim() || pendingFiles.length > 0) && !isChatLoading;
  const chatBaseW         = isExpanded ? 600 : 400;
  const totalW            = isFullscreen ? '100vw' : `${chatBaseW + (sidebarOpen ? 260 : 0)}px`;
  const H                 = isFullscreen ? '100vh' : isExpanded ? '85vh' : 'calc(100vh - 5rem)';
  const B                 = isFullscreen ? '0' : '1.5rem';
  const R                 = isFullscreen ? '0' : '1.5rem';
  const Radius            = isFullscreen ? '0' : '20px';

  return (
    <>
      <style>{CHAT_STYLES(th, fontSize)}</style>

      {/* PAINEL DE CÓDIGO */}
      <div style={{ position:'fixed', zIndex:99999, bottom:B, right: isChatOpen&&sidePanelContent?(isFullscreen?'0':`calc(${R} + ${totalW} + 1rem)`):`-100vw`, width: isFullscreen&&sidePanelContent?'38%':`${chatBaseW}px`, height:H, background:th.bg, borderRadius:Radius, boxShadow:'0 4px 32px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column', overflow:'hidden', border:`1px solid ${th.border}`, transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)', opacity:sidePanelContent?1:0, pointerEvents:sidePanelContent?'auto':'none' }}>
        <div style={{ padding:'10px', borderBottom:`1px solid ${th.headerBorder}`, background:th.headerBg }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' }}>
            <span style={{ fontWeight:600, fontSize:'13px', display:'flex', alignItems:'center', gap:'5px' }}><FileText size={16} style={{ color:th.brand }}/> Visualizador</span>
            <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
              <button onClick={handleCopyCode} title="Copiar" style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'3px', borderRadius:'5px' }}><Copy size={14}/></button>
              <button onClick={handleDownloadCode} title="Baixar" style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'3px', borderRadius:'5px' }}><Download size={14}/></button>
              <button onClick={() => setSidePanelContent(null)} title="Fechar" style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'3px', borderRadius:'5px' }}><X size={16}/></button>
            </div>
          </div>
          <div style={{ display:'flex', gap:'6px', overflowX:'auto', paddingBottom:'3px' }} className="ia-scroll">
            {sessionDocs.map(doc => (
              <button key={doc.id} onClick={() => setSidePanelContent({ lang:doc.language, code:doc.content, filename:doc.filename })}
                style={{ padding:'3px 7px', borderRadius:'5px', background:sidePanelContent?.filename===doc.filename?th.brand:th.surface, color:sidePanelContent?.filename===doc.filename?th.bg:th.text, fontSize:'11px', border:`1px solid ${th.border}`, whiteSpace:'nowrap', cursor:'pointer' }}>
                {doc.filename} (v{doc.versao})
              </button>
            ))}
            {sessionDocs.length === 0 && <span style={{ fontSize:'11px', color:th.textFaint }}>Nenhum arquivo nesta conversa.</span>}
          </div>
        </div>
        <div className="ia-scroll" style={{ flex:1, overflowY:'auto', padding:'14px', background:th.surface }}>
          <pre style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all', fontFamily:"'Google Sans Mono',monospace", fontSize:'13px', color:th.text }}>{sidePanelContent?.code}</pre>
        </div>
      </div>

      {/* JANELA PRINCIPAL */}
      <div className="ia-chat-root" ref={dropRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{ position:'fixed', zIndex:99998, bottom:B, right: isFullscreen&&sidePanelContent?'38%':R, width: isFullscreen?(sidePanelContent?'62%':'100%'):totalW, height:H, maxHeight: isFullscreen?'none':'calc(100vh - 3rem)', background:th.chatAreaBg, borderRadius:Radius, boxShadow: isDragging?'0 4px 32px rgba(99,102,241,0.25),0 0 0 2px #6366f1':'0 4px 32px rgba(0,0,0,0.2)', display:'flex', flexDirection:'row', overflow:'hidden', transform: isChatOpen?'scale(1)':'scale(0)', transformOrigin:'bottom right', opacity: isChatOpen?1:0, pointerEvents: isChatOpen?'auto':'none', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)', border: isDragging?'2px dashed #6366f1':`1px solid ${th.border}` }}>

        {isDragging && (
          <div style={{ position:'absolute', inset:0, background:'rgba(99,102,241,0.07)', zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:Radius, pointerEvents:'none' }}>
            <div style={{ fontSize:'32px', marginBottom:'8px' }}>📎</div>
            <p style={{ fontSize:'14px', fontWeight:700, color:'#6366f1', margin:0 }}>Solte para anexar</p>
          </div>
        )}

        {/* SIDEBAR — SEM AnalyizFace aqui */}
        <div className={`ia-sidebar-panel${sidebarOpen ? '' : ' closed'}`}>
          <div style={{ padding:'12px 10px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <GeminiIcon size={28} animating={false} />
              <span style={{ fontWeight:700, fontSize:'13px', color:th.text, fontFamily:"'Google Sans',sans-serif" }}>Analyiz</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'3px', borderRadius:'5px' }}><X size={15}/></button>
          </div>
          <div style={{ padding:'0 8px 6px', flexShrink:0 }}>
            <button onClick={handleNewSession}
              style={{ width:'100%', padding:'8px 10px', background:th.quickActionBg, border:`1px solid ${th.border}`, borderRadius:'9px', color:th.text, display:'flex', alignItems:'center', gap:'7px', cursor:'pointer', fontWeight:600, fontSize:'12px', fontFamily:"'Google Sans',sans-serif", transition:'all 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background=th.quickActionHover}
              onMouseLeave={e=>e.currentTarget.style.background=th.quickActionBg}>
              <Plus size={14}/> Nova conversa
            </button>
          </div>
          <div style={{ padding:'0 8px 6px', position:'relative', flexShrink:0 }}>
            <Search size={12} style={{ position:'absolute', left:'20px', top:'9px', color:th.textFaint }}/>
            <input type="text" placeholder="Pesquisar…" value={searchSession} onChange={e=>setSearchSession(e.target.value)} style={{ width:'100%', padding:'7px 7px 7px 26px', background:'transparent', border:`1px solid ${th.border}`, borderRadius:'7px', color:th.text, fontSize:'12px', outline:'none', fontFamily:"'Google Sans',sans-serif" }}/>
          </div>
          <div className="ia-scroll" style={{ flex:1, overflowY:'auto', padding:'0 3px' }}>
            {sessions.filter(s => s.titulo?.toLowerCase().includes(searchSession.toLowerCase())).map(s => (
              <div key={s.id} onClick={() => loadSession(s.id)} className="ia-sidebar-item"
                style={{ padding:'8px 9px', display:'flex', alignItems:'center', gap:'7px', background:s.id===currentSessionId?th.quickActionBg:'transparent' }}>
                <MessageSquare size={12} style={{ color:th.textFaint, flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:'12px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:th.text, fontFamily:"'Google Sans',sans-serif" }}>{s.titulo || 'Conversa'}</span>
                <button className="ia-del-btn" onClick={e=>deletarSessao(e,s.id)}
                  style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'2px', opacity:0, transition:'opacity 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.color='#ef4444';}}
                  onMouseLeave={e=>{e.currentTarget.style.opacity='0';e.currentTarget.style.color=th.textFaint;}}>
                  <Trash2 size={11}/>
                </button>
              </div>
            ))}
            {sessions.length === 0 && <div style={{ padding:'18px 10px', textAlign:'center', color:th.textFaint, fontSize:'12px' }}>Nenhuma conversa ainda</div>}
          </div>
          <div style={{ padding:'10px 8px', borderTop:`1px solid ${th.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'12px', color:th.textMuted }}>Modo escuro</span>
              <button onClick={() => setDarkMode(!darkMode)} style={{ background:'none', border:'none', color:th.text, cursor:'pointer', padding:'3px' }}>
                {darkMode ? <Sun size={14}/> : <Moon size={14}/>}
              </button>
            </div>
          </div>
        </div>

        {/* ÁREA DE CHAT */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* ── HEADER — AnalyizFace reativo ─────────────────────────────── */}
          <div style={{ padding: isFullscreen?'10px 20px':'8px 12px', borderBottom:`1px solid ${th.headerBorder}`, background:th.headerBg, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', minWidth:0 }}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'5px', borderRadius:'7px', flexShrink:0 }}>
                <Menu size={16}/>
              </button>

              {/* AnalyizFace v3 NO CABEÇALHO — reativo ao estado */}
              <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', width:'36px', height:'36px' }}>
                <AnalyizFace size={36} state={headerFaceState} />
              </div>

              {isFullscreen
                ? (
                  <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
                    <span style={{ fontSize:'13px', fontWeight:500, color:th.textMuted, fontFamily:"'Google Sans',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'400px' }}>
                      {conversationTitle}
                    </span>
                  </div>
                )
                : (
                  <div style={{ minWidth:0 }}>
                    <span style={{ fontWeight:600, fontSize:'13px', display:'block', lineHeight:'1.2', color:th.text, fontFamily:"'Google Sans',sans-serif" }}>Analyiz</span>
                    <span style={{ fontSize:'10px', color:th.textFaint, fontFamily:"'Google Sans',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'180px', display:'block' }}>
                      {isChatLoading ? 'Pensando…' : isTypingResp ? 'Respondendo…' : conversationTitle}
                    </span>
                  </div>
                )
              }
            </div>
            <div style={{ display:'flex', gap:'1px', flexShrink:0 }}>
              <button onClick={() => setIsFullscreen(!isFullscreen)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'5px', borderRadius:'7px' }}>
                {isFullscreen ? <Minimize2 size={14}/> : <Monitor size={14}/>}
              </button>
              {!isFullscreen && (
                <button onClick={() => setIsExpanded(!isExpanded)} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'5px', borderRadius:'7px' }}>
                  {isExpanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
                </button>
              )}
              <button onClick={toggleChat} style={{ background:'none', border:'none', color:th.textFaint, cursor:'pointer', padding:'5px', borderRadius:'7px' }}>
                <Minus size={14}/>
              </button>
            </div>
          </div>

          {/* MENSAGENS */}
          <div className="ia-msg-area-wrap">
            <div ref={scrollRef} className="ia-scroll" style={{ flex:1, overflowY:'auto', background:th.chatAreaBg, display:'flex', flexDirection:'column' }}>

              {isNewSession && (
                <WelcomeGreeting
                  th={th} userName={userName} isFullscreen={isFullscreen}
                  onQuickAction={prompt => { setChatInput(prompt); setTimeout(() => handleSend(prompt), 50); }}
                  greetingIndex={greetingIndex}
                />
              )}

              {!isNewSession && (
                <div style={{ flex:1, padding: isFullscreen?'20px 0':'12px', display:'flex', flexDirection:'column', gap:'14px' }}>
                  {messages.map(msg => (
                    <div key={msg.id} className={isFullscreen ? 'ia-fs-msg' : ''}>
                      {msg.role === 'ia' ? (
                        <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
                          {/* GeminiIcon — não animando (resposta entregue) */}
                          <div style={{ flexShrink:0, marginTop:'2px' }}>
                            <GeminiIcon size={isFullscreen ? 24 : 20} animating={false} />
                          </div>
                          <div className="ia-msg-wrap" style={{ flex:1, minWidth:0 }}>
                            <IaMessage
                              msg={msg}
                              isTyping={typingSet.has(msg.id)}
                              onDone={() => setTypingSet(p => { const n = new Set(p); n.delete(msg.id); return n; })}
                              th={th}
                              onOpenSidePanel={setSidePanelContent}
                              userMessage={msg.userMessage || ''}
                            />
                          </div>
                        </div>
                      ) : (
                        <EditableUserMessage msg={msg} th={th} onSendEdit={handleEditMessage}/>
                      )}
                    </div>
                  ))}

                  {/* THINKING AO VIVO — GeminiIcon GIRANDO */}
                  {isChatLoading && (
                    <div className={isFullscreen ? 'ia-fs-msg' : ''}>
                      <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
                        <div style={{ flexShrink:0, paddingTop:'2px' }}>
                          <GeminiIcon size={isFullscreen ? 24 : 20} animating={true} />
                        </div>
                        <div style={{ flex:1, paddingTop:'2px' }}>
                          <ThinkingPanel orchestrator={thinking} th={th}/>
                          {thinking.phase === 'idle' && (
                            <div style={{ display:'flex', gap:'4px', alignItems:'center', paddingLeft:'2px', paddingTop:'6px' }}>
                              {[0,1,2].map(i => (
                                <span key={i} style={{ width:'6px', height:'6px', borderRadius:'50%', background:th.textFaint, display:'inline-block', animation:`ia-dots 1.2s ease-in-out ${i*0.2}s infinite` }}/>
                              ))}
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
            th={th} chatInput={chatInput} setChatInput={setChatInput}
            handleSend={() => handleSend()} handleKeyDown={handleKeyDown} handlePaste={handlePaste}
            isChatLoading={isChatLoading} pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
            fileInputRef={fileInputRef} canSend={canSend} isFullscreen={isFullscreen}
          />
        </div>
      </div>

      {/* BOTÃO FLUTUANTE — AnalyizFace v3 */}
      <div style={{ position:'fixed', zIndex:9998, bottom:'1.5rem', right:'1.5rem', transform: isChatOpen?'scale(0)':'scale(1)', opacity: isChatOpen?0:1, transition:'0.2s', pointerEvents: isChatOpen?'none':'auto' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview}/>
      </div>
    </>
  );
}