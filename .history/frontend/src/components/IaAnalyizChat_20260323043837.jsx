// frontend/src/components/IaAnalyizChat.jsx — v13: Gemini-style Fullscreen + Dynamic Greetings + Smart Topics

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Minus, Maximize2, Minimize2, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Paperclip, X, Plus, ExternalLink,
  Globe, FileText, FileSpreadsheet, Music, File, Image as ImageIcon,
  CheckCircle, Settings, Sun, Moon, Type, BookOpen, Download, Copy,
  Search, Menu, Monitor, Sparkles, BarChart2, Users, MessageCircle,
  Zap, HelpCircle, Star, TrendingUp, Bell, Package, ChevronRight
} from 'lucide-react';

const API_BASE_URL  = 'http://localhost:3000';
const SESSION_KEY   = 'analyiz_last_session_id';
const POLL_INITIAL  = 8 * 1000;
const POLL_INTERVAL = 10 * 60 * 1000;
const MAX_FILES     = 10;

import gifolhos from '../assets/gifolhos1.gif';
const IA_GIF = gifolhos;

// ─── Temas ────────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: '#ffffff',
    surface: '#f8fafc',
    border: '#e2e8f0',
    text: '#1e293b',
    textMuted: '#64748b',
    textFaint: '#94a3b8',
    brand: '#1e293b',
    userBubble: '#f0f0f0',
    userText: '#333',
    panelBg: '#ffffff',
    panelBorder: 'transparent',
    headerBg: '#fff',
    headerBorder: '#eee',
    inputBg: 'transparent',
    inputBorder: '#eee',
    reasoningBg: 'transparent',
    chatAreaBg: '#ffffff',
    sidebarBg: '#f8fafc',
    inputAreaBg: '#ffffff',
    inputBoxBg: '#f1f3f4',
    inputBoxBorder: '#e8eaed',
    quickActionBg: '#f1f3f4',
    quickActionHover: '#e8eaed',
    greetingGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  dark: {
    bg: '#131314',
    surface: '#1e1f20',
    border: '#3c4043',
    text: '#e3e3e3',
    textMuted: '#9aa0a6',
    textFaint: '#5f6368',
    brand: '#8ab4f8',
    userBubble: '#303134',
    userText: '#e3e3e3',
    panelBg: '#1e1f20',
    panelBorder: 'transparent',
    headerBg: '#1e1f20',
    headerBorder: '#3c4043',
    inputBg: 'transparent',
    inputBorder: '#3c4043',
    reasoningBg: 'transparent',
    chatAreaBg: '#131314',
    sidebarBg: '#1e1f20',
    inputAreaBg: '#1e1f20',
    inputBoxBg: '#282a2c',
    inputBoxBorder: '#3c4043',
    quickActionBg: '#282a2c',
    quickActionHover: '#303134',
    greetingGradient: 'linear-gradient(135deg, #8ab4f8 0%, #c084fc 100%)',
  },
};

// ─── Saudações dinâmicas ──────────────────────────────────────────────────────
const GREETINGS = [
  (user) => `Olá${user ? `, ${user}` : ''}! Por onde começamos? ✨`,
  (user) => `Oi${user ? ` ${user}` : ''}! Como posso te ajudar hoje?`,
  (user) => `Bem-vindo${user ? `, ${user}` : ''}! O que vamos explorar?`,
  (user) => `${user ? `${user}, pronto` : 'Pronto'} para começar! Me pergunte qualquer coisa.`,
  (user) => `Olá${user ? ` ${user}` : ''}! Tenho novas ideias pra compartilhar! 🚀`,
];

// ─── Quick actions por página ─────────────────────────────────────────────────
const PAGE_QUICK_ACTIONS = {
  default: [
    { icon: BarChart2, label: 'Ver relatório de vendas', prompt: 'Me mostre um resumo das vendas recentes' },
    { icon: Users, label: 'Analisar clientes', prompt: 'Quais são meus clientes mais ativos?' },
    { icon: MessageCircle, label: 'Ver conversas', prompt: 'Mostre as últimas conversas do WhatsApp' },
    { icon: TrendingUp, label: 'Métricas do dia', prompt: 'Quais são as métricas de hoje?' },
  ],
  '/dashboard': [
    { icon: TrendingUp, label: 'Resumo do dia', prompt: 'Me dê um resumo completo de hoje' },
    { icon: BarChart2, label: 'Comparar períodos', prompt: 'Compare esta semana com a semana passada' },
    { icon: Bell, label: 'Alertas pendentes', prompt: 'Existem alertas ou anomalias para me mostrar?' },
    { icon: Zap, label: 'Otimizar performance', prompt: 'O que posso fazer para melhorar minha performance?' },
  ],
  '/conversas': [
    { icon: MessageCircle, label: 'Conversas sem resposta', prompt: 'Quais conversas estão sem resposta?' },
    { icon: Users, label: 'Clientes esperando', prompt: 'Quem está esperando resposta há mais tempo?' },
    { icon: Star, label: 'Melhores interações', prompt: 'Quais foram minhas melhores interações?' },
    { icon: TrendingUp, label: 'Volume de mensagens', prompt: 'Como está o volume de mensagens hoje?' },
  ],
  '/contatos': [
    { icon: Users, label: 'Novos contatos', prompt: 'Quantos novos contatos tenho hoje?' },
    { icon: TrendingUp, label: 'Segmentar contatos', prompt: 'Me ajude a segmentar meus contatos' },
    { icon: Package, label: 'Importar lista', prompt: 'Como posso importar uma lista de contatos?' },
    { icon: HelpCircle, label: 'Como organizar?', prompt: 'Qual a melhor forma de organizar meus contatos?' },
  ],
};

function getQuickActions(pageUrl) {
  if (!pageUrl) return PAGE_QUICK_ACTIONS.default;
  for (const [path, actions] of Object.entries(PAGE_QUICK_ACTIONS)) {
    if (path !== 'default' && pageUrl.includes(path)) return actions;
  }
  return PAGE_QUICK_ACTIONS.default;
}

// ─── Tipos de arquivo ─────────────────────────────────────────────────────────
const FILE_TYPES = {
  'image/jpeg': { group: 'image', icon: ImageIcon, label: 'Imagem' },
  'image/png':  { group: 'image', icon: ImageIcon, label: 'Imagem' },
  'image/gif':  { group: 'image', icon: ImageIcon, label: 'Imagem' },
  'image/webp': { group: 'image', icon: ImageIcon, label: 'Imagem' },
  'application/pdf': { group: 'pdf', icon: FileText, label: 'PDF' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { group: 'excel', icon: FileSpreadsheet, label: 'Excel' },
  'application/vnd.ms-excel': { group: 'excel', icon: FileSpreadsheet, label: 'Excel' },
  'text/csv':   { group: 'excel', icon: FileSpreadsheet, label: 'CSV' },
  'text/plain': { group: 'txt',   icon: FileText,         label: 'Texto' },
  'audio/mpeg': { group: 'audio', icon: Music, label: 'MP3' },
  'audio/wav':  { group: 'audio', icon: Music, label: 'WAV' },
  'audio/ogg':  { group: 'audio', icon: Music, label: 'OGG' },
  'audio/mp4':  { group: 'audio', icon: Music, label: 'M4A' },
  'audio/webm': { group: 'audio', icon: Music, label: 'Áudio' },
};
const ACCEPTED_MIME = Object.keys(FILE_TYPES).join(',');
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const GROUP_COLORS = {
  image: '#3b82f6', pdf: '#ef4444', excel: '#10b981',
  txt: '#8b5cf6', audio: '#f59e0b', unknown: '#94a3b8',
};
function getFileInfo(mimeType) {
  return FILE_TYPES[mimeType] || { group: 'unknown', icon: File, label: 'Arquivo' };
}

// ─── Derivar assunto da conversa ──────────────────────────────────────────────
function deriveConversationTitle(messages) {
  if (!messages || messages.length === 0) return 'Nova conversa';
  const firstUser = messages.find(m => m.role === 'user' && m.content?.trim());
  if (!firstUser) return 'Nova conversa';
  const text = firstUser.content.trim();
  if (text.length <= 40) return text;
  return text.substring(0, 37) + '…';
}

// ─── CSS Injetado ─────────────────────────────────────────────────────────────
const CHAT_STYLES = (th, fontSize) => `
  @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono&display=swap');

  @keyframes ia-spin       { to { transform: rotate(360deg); } }
  @keyframes ia-blink      { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes ia-fade-in    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ia-fade-up    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ia-dot-pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.6)} }
  @keyframes ia-star-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  @keyframes ia-slide-in   { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
  @keyframes ia-greeting   { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }

  .ia-chat-root * { box-sizing: border-box; }
  .ia-chat-root {
    font-family: 'Google Sans', 'Google Sans Text', Roboto, sans-serif !important;
    font-size: ${fontSize}px;
    color: ${th.text};
  }

  .ia-scroll::-webkit-scrollbar { width: 4px }
  .ia-scroll::-webkit-scrollbar-track { background: transparent }
  .ia-scroll::-webkit-scrollbar-thumb { background: ${th.border}; border-radius: 4px }
  .ia-sidepanel-scroll::-webkit-scrollbar { width: 4px }
  .ia-sidepanel-scroll::-webkit-scrollbar-track { background: transparent }
  .ia-sidepanel-scroll::-webkit-scrollbar-thumb { background: ${th.border}; border-radius: 4px }

  .ia-msg {
    font-family: 'Google Sans', 'Google Sans Text', Roboto, sans-serif !important;
    font-size: ${fontSize}px;
    line-height: 1.65;
    color: ${th.text};
    animation: ia-fade-in 0.25s ease;
  }
  .ia-msg a { color: #8ab4f8 !important; text-decoration: underline; font-weight: 500; cursor: pointer }
  .ia-msg b { font-weight: 600 }
  .ia-msg br + br { display: block; margin-top: 4px; }

  .ia-reasoning-text {
    font-family: 'Google Sans', 'Google Sans Text', Roboto, sans-serif !important;
    font-size: ${Math.max(12, fontSize - 1)}px;
    line-height: 1.6;
    color: ${th.textMuted};
    white-space: pre-wrap;
    word-break: break-word;
    font-style: italic;
  }
  .ia-step-text {
    font-family: 'Google Sans Mono', 'Cascadia Code', ui-monospace, monospace !important;
    font-size: ${Math.max(11, fontSize - 2)}px;
    line-height: 1.45;
  }

  /* Fullscreen: conversa centralizada como Gemini */
  .ia-fullscreen-messages {
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* Greeting animation */
  .ia-greeting-block {
    animation: ia-greeting 0.5s cubic-bezier(0.34, 1.2, 0.64, 1) both;
  }

  /* Sidebar item hover */
  .ia-sidebar-item {
    transition: background 0.15s ease;
    border-radius: 8px;
    margin: 1px 6px;
  }
  .ia-sidebar-item:hover {
    background: ${th.quickActionHover} !important;
  }

  /* Quick action chips */
  .ia-quick-chip {
    transition: all 0.15s ease;
    cursor: pointer;
  }
  .ia-quick-chip:hover {
    background: ${th.quickActionHover} !important;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }

  /* Textarea auto-grow */
  .ia-textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: ${th.text};
    resize: none;
    padding: 6px 0;
    font-size: ${fontSize}px;
    font-family: 'Google Sans', sans-serif;
    max-height: 160px;
    line-height: 1.5;
  }
  .ia-textarea::placeholder { color: ${th.textFaint}; }

  /* Input box Gemini style */
  .ia-input-box {
    background: ${th.inputBoxBg};
    border: 1.5px solid ${th.inputBoxBorder};
    border-radius: 24px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .ia-input-box:focus-within {
    border-color: #8ab4f8;
    box-shadow: 0 0 0 2px rgba(138, 180, 248, 0.12);
  }

  /* Tooltip */
  .ia-tooltip {
    position: relative;
  }
  .ia-tooltip:hover::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: #fff;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 999999;
    font-family: 'Google Sans', sans-serif;
  }
`;

// ─── Ícone estrela ────────────────────────────────────────────────────────────
function StarSparkleIcon({ size = 13, color = '#6366f1', animated = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      style={animated ? { animation: 'ia-star-pulse 2s ease-in-out infinite' } : {}}>
      <path d="M8 2.5L9.2 6.8H13.5L10 9.2L11.2 13.5L8 11.2L4.8 13.5L6 9.2L2.5 6.8H6.8L8 2.5Z" fill={color} />
    </svg>
  );
}

// ─── TypewriterText ───────────────────────────────────────────────────────────
function TypewriterText({ text, speed = 28, onDone }) {
  const [displayed, setDisplayed] = useState('');
  const timerRef = useRef(null);
  const doneRef = useRef(false);

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
        if (!doneRef.current) { doneRef.current = true; setTimeout(() => onDone?.(), 80); }
      }
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [text]);

  const done = displayed.length >= (text || '').length;
  return (
    <span>
      {displayed}
      {!done && <span style={{ opacity: 0.4, animation: 'ia-blink 0.6s step-end infinite' }}>|</span>}
    </span>
  );
}

// ─── StepRow ─────────────────────────────────────────────────────────────────
function StepRow({ step, isActive, onTypingDone, th }) {
  return (
    <div style={{
      margin: '4px 0', padding: '4px 0', background: 'transparent',
      transition: 'all 0.3s ease', animation: 'ia-fade-in 0.2s ease',
      display: 'flex', alignItems: 'flex-start', gap: '8px'
    }}>
      <div style={{ flexShrink: 0, width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '3px' }}>
        {step.done ? (
          <CheckCircle size={12} style={{ color: th.textMuted, opacity: 0.7 }} />
        ) : isActive ? (
          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', border: '1.5px solid rgba(138,180,248,0.2)', borderTop: '1.5px solid #8ab4f8', animation: 'ia-spin 0.75s linear infinite' }} />
        ) : (
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: th.border, display: 'inline-block' }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <span className="ia-step-text" style={{ color: step.done ? th.textMuted : isActive ? th.text : th.textFaint, fontWeight: isActive ? 500 : 400 }}>
          {isActive ? <TypewriterText text={step.msg} speed={22} onDone={onTypingDone} /> : step.msg}
        </span>
      </div>
    </div>
  );
}

// ─── UnifiedReasoningPanel ────────────────────────────────────────────────────
function UnifiedReasoningPanel({ items, isLive, th }) {
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef(null);
  const hasContent = items.length > 0;

  useEffect(() => {
    if (isLive && containerRef.current && !collapsed)
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [items, isLive, collapsed]);

  useEffect(() => {
    if (!isLive && hasContent) {
      const t = setTimeout(() => setCollapsed(true), 800);
      return () => clearTimeout(t);
    }
  }, [isLive, hasContent]);

  useEffect(() => { if (isLive) setCollapsed(false); }, [isLive]);

  if (!hasContent && !isLive) return null;

  const accentColor = isLive ? '#8ab4f8' : th.textFaint;

  return (
    <div style={{ marginBottom: '12px', borderLeft: `2px solid ${isLive ? '#8ab4f8' : th.border}`, paddingLeft: '12px', marginLeft: '4px' }}>
      <button onClick={() => setCollapsed(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', color: accentColor, fontSize: '12px', fontFamily: 'inherit', userSelect: 'none', transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = isLive ? '#a8c7fa' : th.textMuted}
        onMouseLeave={e => e.currentTarget.style.color = accentColor}
      >
        <span style={{ fontWeight: 500, fontFamily: 'inherit', fontStyle: 'italic' }}>
          {isLive ? 'Pensando...' : 'Processo analisado'}
        </span>
        {hasContent && (collapsed ? <ChevronDown size={12} style={{ opacity: .6 }} /> : <ChevronUp size={12} style={{ opacity: .6 }} />)}
      </button>

      {!collapsed && (
        <div ref={containerRef} style={{ marginTop: '8px', maxHeight: '340px', overflowY: 'auto', scrollbarWidth: 'thin' }}>
          {items.map((item, i) => {
            if (item.kind === 'text') {
              return (
                <div key={i} style={{ marginBottom: '6px', paddingLeft: '4px' }}>
                  <span className="ia-reasoning-text">{item.text}</span>
                  {isLive && i === items.length - 1 && (
                    <span style={{ display: 'inline-block', width: '4px', height: '12px', background: '#8ab4f8', borderRadius: '2px', marginLeft: '4px', verticalAlign: 'middle', animation: 'ia-blink 0.8s step-end infinite' }} />
                  )}
                </div>
              );
            }
            if (item.kind === 'step') {
              return <StepRow key={i} step={item} isActive={item.isActive} onTypingDone={item.onTypingDone} th={th} />;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

// ─── DiffusionText ────────────────────────────────────────────────────────────
function DiffusionText({ html, th, onDoneRef }) {
  const [scrambled, setScrambled] = useState('');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*';

  useEffect(() => {
    let isMounted = true;
    const tokens = [];
    let i = 0;
    while (i < html.length) {
      if (html[i] === '<') {
        let end = html.indexOf('>', i);
        if (end === -1) end = html.length;
        tokens.push({ type: 'tag', val: html.substring(i, end + 1), resolved: true });
        i = end + 1;
      } else if (html[i] === '&') {
        let end = html.indexOf(';', i);
        if (end === -1) end = html.length;
        tokens.push({ type: 'char', val: html.substring(i, end + 1), resolved: false });
        i = end + 1;
      } else {
        const isSpace = html[i] === ' ' || html[i] === '\n';
        tokens.push({ type: 'char', val: html[i], resolved: isSpace });
        i++;
      }
    }

    let iterations = 0;
    const maxIterations = 35;

    const interval = setInterval(() => {
      if (!isMounted) return;
      iterations++;
      let currentHTML = '';
      let allResolved = true;

      tokens.forEach((token, idx) => {
        if (token.type === 'tag' || token.resolved) {
          currentHTML += token.val;
        } else {
          const progress = iterations / maxIterations;
          const threshold = idx / tokens.length;
          if (progress > threshold + (Math.random() * 0.15)) {
            token.resolved = true;
            currentHTML += token.val;
          } else {
            allResolved = false;
            currentHTML += chars[Math.floor(Math.random() * chars.length)];
          }
        }
      });

      setScrambled(currentHTML);

      if (allResolved || iterations >= maxIterations) {
        clearInterval(interval);
        setScrambled(html);
        setTimeout(() => onDoneRef?.current?.(), 0);
      }
    }, 40);

    return () => { isMounted = false; clearInterval(interval); };
  }, [html, onDoneRef]);

  return <SafeHTMLMsg html={scrambled} />;
}

function SafeHTMLMsg({ html }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll('a[href^="/"]').forEach(a => {
      const c = a.cloneNode(true);
      c.style.cssText = 'color:#8ab4f8;text-decoration:underline;font-weight:500;cursor:pointer';
      c.addEventListener('click', e => { e.preventDefault(); window.location.href = a.getAttribute('href'); });
      a.parentNode?.replaceChild(c, a);
    });
    ref.current.querySelectorAll('a[href^="http"]').forEach(a => {
      a.style.cssText = 'color:#8ab4f8;text-decoration:underline;font-weight:500';
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [html]);
  return <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} style={{ wordBreak: 'break-word' }} />;
}

function processTextAndCode(content) {
  if (!content) return [];
  const regex = /```([\w-]*)\n([\s\S]*?)```/g;
  let match, lastIndex = 0;
  const parts = [];
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: content.substring(lastIndex, match.index) });
    parts.push({ type: 'code', lang: match[1], content: match[2] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) parts.push({ type: 'text', content: content.substring(lastIndex) });
  return parts;
}

function enrichHTML(html) {
  if (!html) return '';
  return html
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#f59e0b;font-weight:600;text-decoration:underline">$1</a>')
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

// ─── IaMessage ────────────────────────────────────────────────────────────────
function IaMessage({ msg, isTyping, onDone, th, onOpenSidePanel, isFullscreen, fontSize }) {
  const parts = processTextAndCode(msg.content);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const historicItems = [];
  if (msg.reasoning) historicItems.push({ kind: 'text', text: msg.reasoning });
  if (msg.steps?.length > 0) msg.steps.forEach(s => historicItems.push({ kind: 'step', ...s, done: true, isActive: false }));

  return (
    <div className="ia-msg" style={{ maxWidth: isFullscreen ? '100%' : '100%' }}>
      {historicItems.length > 0 && <UnifiedReasoningPanel items={historicItems} isLive={false} th={th} />}

      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <div key={index} style={{ margin: '8px 0' }}>
              <button onClick={() => onOpenSidePanel({ lang: part.lang, code: part.content })}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: th.brand, fontWeight: 600, fontSize: '12px', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                onMouseEnter={e => e.currentTarget.style.background = th.bg}
                onMouseLeave={e => e.currentTarget.style.background = th.surface}
              >
                <BookOpen size={16} />
                <span>Abrir Documento/Código {part.lang ? `(${part.lang.toUpperCase()})` : ''}</span>
              </button>
            </div>
          );
        } else {
          const enriched = enrichHTML(part.content);
          const links = extractLinks(enriched);
          return (
            <div key={index}>
              {isTyping && index === parts.length - 1
                ? <DiffusionText html={enriched} th={th} onDoneRef={onDoneRef} />
                : <SafeHTMLMsg html={enriched} />}
              {!isTyping && links.length > 0 && (
                <div style={{ marginTop: '8px', borderTop: `1px solid ${th.border}`, paddingTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {links.map((l, i) => (
                    <a key={i} href={l.href} target={l.href.startsWith('/') ? '_self' : '_blank'} rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#8ab4f8', textDecoration: 'none', background: th.surface, borderRadius: '6px', padding: '4px 8px', border: `1px solid ${th.border}` }}>
                      <ExternalLink size={10} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{l.label}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        }
      })}

      {msg.sources?.length > 0 && (
        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {msg.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#8ab4f8', textDecoration: 'none', background: th.surface, borderRadius: '6px', padding: '4px 8px', border: `1px solid ${th.border}` }}>
              🔗<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FileAttachmentGrid ───────────────────────────────────────────────────────
function FileAttachmentGrid({ attachments, th }) {
  if (!attachments?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px', justifyContent: 'flex-end' }}>
      {attachments.map((att, i) => {
        const info = getFileInfo(att.mimeType);
        const color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown;
        const Icon = info.icon;

        if (info.group === 'image' && att.preview) {
          return (
            <div key={i} style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: `1px solid ${th.border}` }}>
              <img src={att.preview} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          );
        }

        return (
          <div key={i} style={{ width: '56px', height: '56px', borderRadius: '8px', background: th.surface, border: `1px solid ${th.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', flexShrink: 0 }}>
            <Icon size={18} style={{ color }} />
            <span style={{ fontSize: '8px', color: th.textFaint, textAlign: 'center', lineHeight: '1.1', overflow: 'hidden', maxWidth: '50px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>{att.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── PendingFilesGrid ─────────────────────────────────────────────────────────
function PendingFilesGrid({ files, onRemove, th }) {
  if (!files.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 0 4px' }}>
      {files.map((file, i) => {
        const info = getFileInfo(file.mimeType);
        const color = GROUP_COLORS[info.group] || GROUP_COLORS.unknown;
        const Icon = info.icon;
        return (
          <div key={i} style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: info.group === 'image' && file.preview ? 'transparent' : th.surface, border: `1px solid ${th.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', overflow: 'hidden' }}>
              {info.group === 'image' && file.preview ? (
                <img src={file.preview} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <Icon size={18} style={{ color, flexShrink: 0 }} />
                  <span style={{ fontSize: '7px', color: th.textFaint, textAlign: 'center', lineHeight: '1.1', padding: '0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50px' }}>{file.name}</span>
                </>
              )}
            </div>
            <button onClick={() => onRemove(i)}
              style={{ position: 'absolute', top: '-5px', right: '-5px', width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <X size={9} style={{ color: '#fff' }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── FloatingButton ───────────────────────────────────────────────────────────
function FloatingButton({ onClick, hasUnread, shortPreview }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      {hasUnread && shortPreview && (
        <div onClick={onClick} style={{ background: '#1e293b', color: 'white', fontSize: '12px', fontWeight: 500, padding: '8px 12px', borderRadius: '12px 12px 12px 4px', maxWidth: '240px', lineHeight: '1.4', boxShadow: '0 2px 12px rgba(30,41,59,0.3)', animation: 'ia-fade-in 0.3s ease', cursor: 'pointer', wordBreak: 'break-word', fontFamily: 'inherit' }}>
          {shortPreview}
        </div>
      )}
      <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{ display: 'flex', alignItems: 'center', borderRadius: '999px', border: 'none', outline: 'none', background: '#1e293b', cursor: 'pointer', boxShadow: '0 4px 20px rgba(30,41,59,0.45)', width: hovered ? '172px' : '62px', height: '62px', transition: 'width 0.28s cubic-bezier(0.34,1.2,0.64,1)', padding: 0, overflow: 'hidden' }}>
        <span style={{ width: '62px', height: '62px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden', background: '#fff', order: 1, zIndex: 2 }}>
          <img src={IA_GIF} alt="IA" style={{ width: '58px', height: '58px', objectFit: 'contain', borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />
        </span>
        <span style={{ color: 'white', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', paddingRight: '20px', paddingLeft: '4px', order: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.18s', pointerEvents: 'none', fontFamily: 'inherit' }}>Assistente</span>
      </button>
    </div>
  );
}

function getTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── WelcomeGreeting (Gemini style) ──────────────────────────────────────────
function WelcomeGreeting({ th, fontSize, userName, isFullscreen, onQuickAction, pageUrl, greetingIndex }) {
  const greeting = GREETINGS[greetingIndex % GREETINGS.length](userName);
  const quickActions = getQuickActions(pageUrl);

  return (
    <div className="ia-greeting-block" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, padding: isFullscreen ? '60px 24px 40px' : '32px 20px 24px',
      textAlign: 'center',
    }}>
      {/* IA Avatar */}
      <div style={{
        width: isFullscreen ? '72px' : '56px', height: isFullscreen ? '72px' : '56px',
        borderRadius: '50%', overflow: 'hidden', background: '#fff',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)', marginBottom: '20px',
        border: `2px solid ${th.border}`,
      }}>
        <img src={IA_GIF} alt="IA" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>

      {/* Greeting text */}
      <h2 style={{
        fontSize: isFullscreen ? '28px' : '20px',
        fontWeight: 700, margin: '0 0 8px',
        background: th.greetingGradient,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        fontFamily: "'Google Sans', sans-serif",
        lineHeight: 1.3,
      }}>
        {greeting}
      </h2>

      <p style={{ fontSize: `${Math.max(11, fontSize - 1)}px`, color: th.textMuted, margin: '0 0 28px', fontFamily: "'Google Sans', sans-serif" }}>
        Assistente Analyiz — te ajudo com análises, conversas e muito mais.
      </p>

      {/* Quick action chips */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isFullscreen ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)',
        gap: '8px',
        width: '100%',
        maxWidth: isFullscreen ? '560px' : '340px',
      }}>
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <button key={i} className="ia-quick-chip" onClick={() => onQuickAction(action.prompt)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: th.quickActionBg, border: `1px solid ${th.border}`,
                borderRadius: '12px', padding: '10px 14px',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s',
              }}>
              <Icon size={15} style={{ color: th.brand, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: th.text, fontWeight: 500, lineHeight: 1.3, fontFamily: "'Google Sans', sans-serif" }}>
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── InputBox (Gemini style) ──────────────────────────────────────────────────
function InputBox({
  th, fontSize, chatInput, setChatInput, handleSend, handleKeyDown, handlePaste,
  isChatLoading, pendingFiles, setPendingFiles, fileInputRef, canSend,
  isFullscreen, pageUrl
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
  }, [chatInput]);

  const placeholder = pendingFiles.length > 0
    ? `O que fazer com ${pendingFiles.length === 1 ? 'o arquivo' : `os ${pendingFiles.length} arquivos`}?`
    : 'Pergunte qualquer coisa...';

  return (
    <div style={{
      padding: isFullscreen ? '16px 24px 20px' : '12px 14px',
      background: th.inputAreaBg,
      borderTop: isFullscreen ? 'none' : `1px solid ${th.border}`,
    }}>
      <div style={{ maxWidth: isFullscreen ? '720px' : '100%', margin: '0 auto' }}>
        <div className="ia-input-box">
          {/* Arquivos pendentes dentro da caixa */}
          {pendingFiles.length > 0 && (
            <PendingFilesGrid files={pendingFiles} onRemove={i => setPendingFiles(p => p.filter((_, idx) => idx !== i))} th={th} />
          )}

          {/* Row: textarea + send */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <textarea ref={textareaRef} className="ia-textarea"
              value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown} onPaste={handlePaste}
              disabled={isChatLoading} rows={1} placeholder={placeholder}
            />
            <button onClick={handleSend} disabled={!canSend}
              className="ia-tooltip" data-tip="Enviar mensagem"
              style={{
                background: canSend ? '#8ab4f8' : 'transparent',
                color: canSend ? '#1e1f20' : th.textFaint,
                border: canSend ? 'none' : `1px solid ${th.border}`,
                borderRadius: '50%', width: '36px', height: '36px', flexShrink: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                cursor: canSend ? 'pointer' : 'default', transition: 'all 0.15s',
              }}>
              <Send size={16} style={{ marginLeft: '2px' }} />
            </button>
          </div>

          {/* Bottom row: attach */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => fileInputRef.current?.click()}
              disabled={isChatLoading || pendingFiles.length >= MAX_FILES}
              className="ia-tooltip" data-tip="Anexar arquivo"
              style={{
                background: 'none', border: 'none',
                color: pendingFiles.length > 0 ? th.brand : th.textFaint,
                cursor: pendingFiles.length >= MAX_FILES ? 'not-allowed' : 'pointer',
                padding: '2px', opacity: pendingFiles.length >= MAX_FILES ? 0.4 : 1,
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
                position: 'relative',
              }}>
              <Paperclip size={16} />
              {pendingFiles.length > 0 && (
                <span style={{ background: th.brand, color: th.bg, fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '10px' }}>
                  {pendingFiles.length}
                </span>
              )}
            </button>

            <span style={{ fontSize: '10px', color: th.textFaint, fontFamily: "'Google Sans', sans-serif" }}>
              Enter para enviar · Shift+Enter para nova linha
            </span>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '10px', color: th.textFaint, marginTop: '8px', marginBottom: 0, fontFamily: "'Google Sans', sans-serif" }}>
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
  const [darkMode, setDarkModeState] = useState(() => { try { return localStorage.getItem('analyiz_darkmode') === 'true'; } catch { return false; } });
  const [fontSize, setFontSizeState] = useState(() => { try { return parseInt(localStorage.getItem('analyiz_fontsize') || '13'); } catch { return 13; } });
  const setDarkMode = (v) => { setDarkModeState(v); localStorage.setItem('analyiz_darkmode', String(v)); };
  const setFontSize = (v) => { setFontSizeState(v); localStorage.setItem('analyiz_fontsize', String(v)); };
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
  const [greetingIndex] = useState(() => Math.floor(Math.random() * GREETINGS.length));

  // Painel lateral e documentos
  const [sidePanelContent, setSidePanelContent] = useState(null);
  const [sessionDocs, setSessionDocs] = useState([]);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [searchSession, setSearchSession] = useState('');

  const [liveItems, setLiveItems] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [typingSet, setTypingSet] = useState(new Set());

  const readUserId = () => { try { return JSON.parse(localStorage.getItem('analyiz_user'))?.id; } catch { return null; } };
  const readUserName = () => { try { return JSON.parse(localStorage.getItem('analyiz_user'))?.nome || JSON.parse(localStorage.getItem('analyiz_user'))?.name; } catch { return null; } };
  const [userId] = useState(readUserId);
  const [userName] = useState(readUserName);
  const [currentSessionId, setCurrentSessionId] = useState(() => { try { return parseInt(localStorage.getItem(SESSION_KEY)); } catch { return null; } });

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pendingNotifRef = useRef(null);

  const allStepsRef = useRef([]);
  const reasoningRef = useRef('');
  const stepKeyCounter = useRef(0);
  const stepTypingQueue = useRef([]);
  const isStepTyping = useRef(false);

  let modalConfirm = null;
  try { const mod = require('../components/Modal'); if (mod?.useModal) { const { confirm } = mod.useModal(); modalConfirm = confirm; } } catch { }
  const confirmDelete = useCallback(async () => {
    if (modalConfirm) return await modalConfirm({ title: 'Excluir conversa', message: 'Será removida permanentemente.', confirmLabel: 'Excluir', danger: true });
    return window.confirm('Deletar esta conversa?');
  }, [modalConfirm]);

  // Scroll automático
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isChatLoading, liveItems, typingSet]);

  const carregarSessions = useCallback(async () => {
    if (!userId) return;
    try { const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`); setSessions(await r.json()); } catch { }
  }, [userId]);

  const carregarDocumentos = useCallback(async (sid) => {
    if (!sid) { setSessionDocs([]); return; }
    try { const r = await fetch(`${API_BASE_URL}/api/chat/sessions/${sid}/documents`); setSessionDocs(await r.json()); } catch { }
  }, []);

  const resetLiveState = () => {
    setLiveItems([]); setIsLive(false);
    stepTypingQueue.current = []; isStepTyping.current = false;
    allStepsRef.current = []; reasoningRef.current = ''; stepKeyCounter.current = 0;
  };

  const processNextStepTyping = useCallback(() => {
    if (stepTypingQueue.current.length === 0) { isStepTyping.current = false; return; }
    isStepTyping.current = true;
    const { itemIdx } = stepTypingQueue.current[0];
    setLiveItems(prev => prev.map((it, i) => {
      if (i !== itemIdx) return it;
      return {
        ...it, isActive: true,
        onTypingDone: () => {
          stepTypingQueue.current.shift();
          isStepTyping.current = false;
          setLiveItems(p => p.map((x, xi) => xi === itemIdx ? { ...x, isActive: false, onTypingDone: undefined } : x));
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
      if (last && last.kind === 'text') { const u = [...prev]; u[prev.length - 1] = { ...last, text: last.text + chunk }; return u; }
      return [...prev, { kind: 'text', text: chunk }];
    });
  }, []);

  const addStep = useCallback((msg, stepKey) => {
    allStepsRef.current.push({ msg, done: false, stepKey });
    setLiveItems(prev => {
      const newIdx = prev.length;
      enqueueStepTyping(newIdx);
      return [...prev, { kind: 'step', msg, done: false, isActive: false, stepKey }];
    });
  }, [enqueueStepTyping]);

  const markStepDone = useCallback((stepKey) => {
    setLiveItems(prev => prev.map(it => it.kind === 'step' && it.stepKey === stepKey ? { ...it, done: true } : it));
    const s = allStepsRef.current.find(x => x.stepKey === stepKey);
    if (s) s.done = true;
  }, []);

  // Carregar sessão existente ou iniciar nova
  useEffect(() => {
    if (currentSessionId && userId) {
      localStorage.setItem(SESSION_KEY, String(currentSessionId));
      fetch(`${API_BASE_URL}/api/chat/sessions/${currentSessionId}/messages`).then(r => r.json()).then(msgs => {
        setMessages(msgs.map(m => {
          let attachments = null;
          if (m.imageDesc) {
            try {
              const p = JSON.parse(m.imageDesc);
              if (Array.isArray(p)) {
                attachments = p.map(att => {
                  if (att.group === 'image' && !att.preview && m.imageBase64)
                    return { ...att, preview: `data:${att.mimeType || 'image/jpeg'};base64,${m.imageBase64}` };
                  return att;
                });
              }
            } catch (e) { }
          }
          const li = m.imageBase64 && !attachments ? [{ mimeType: 'image/jpeg', name: 'imagem.jpg', group: 'image', preview: `data:image/jpeg;base64,${m.imageBase64}`, sizeBytes: 0 }] : null;
          return { role: m.role, id: String(m.id), content: m.content, time: new Date(m.createdAt).toLocaleTimeString(), attachments: attachments || li, sources: [], reasoning: '', steps: [] };
        }));
      });
      carregarDocumentos(currentSessionId);
    } else {
      setMessages([]); // sessão nova = tela de boas-vindas
    }
  }, [currentSessionId, userId, carregarDocumentos]);

  useEffect(() => { if (isChatOpen || isFullscreen) carregarSessions(); }, [isChatOpen, isFullscreen, carregarSessions]);

  useEffect(() => {
    if (!isChatOpen) { setSidePanelContent(null); setHasUnread(false); setShortPreview(''); }
    const p = pendingNotifRef.current; if (!p) return;
    const { notifId, fullInsight } = p; pendingNotifRef.current = null;
    if (notifId && userId) fetch(`${API_BASE_URL}/api/ia/proactive/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, notifId }) }).catch(() => { });
    setTimeout(() => {
      const id = `ia-proactive-${Date.now()}`;
      setMessages(prev => [...prev, { role: 'ia', content: fullInsight, time: getTime(), id, sources: [], reasoning: '', steps: [] }]);
      setTypingSet(prev => new Set(prev).add(id));
    }, 400);
  }, [isChatOpen]); // eslint-disable-line

  const verificarProativo = useCallback(async () => {
    if (!userId || !isChatOpen) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/proactive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, userRole }) });
      const data = await res.json();
      if (!data.insight || !data.hasRelevantData) return;
      pendingNotifRef.current = { notifId: data.notifId, fullInsight: data.fullInsight };
      setShortPreview(data.insight); setHasUnread(true);
      if (data.notifId) fetch(`${API_BASE_URL}/api/ia/proactive/exibida`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, notifId: data.notifId }) }).catch(() => { });
    } catch { }
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
      const res = await fetch(`${API_BASE_URL}/api/chat/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      const s = await res.json(); setCurrentSessionId(s.id); return s.id;
    } catch { return null; }
  }, [userId, currentSessionId]);

  const handleSend = async () => {
    if ((!chatInput.trim() && !pendingFiles.length) || isChatLoading) return;
    const userMsg = chatInput.trim();
    const filesToSend = [...pendingFiles];
    const attachmentSnapshot = filesToSend.map(f => ({ mimeType: f.mimeType, name: f.name, group: f.group, preview: f.preview, sizeBytes: f.sizeBytes }));

    setMessages(p => [...p, { role: 'user', content: userMsg, time: new Date().toLocaleTimeString(), id: `u-${Date.now()}`, attachments: attachmentSnapshot.length ? attachmentSnapshot : null }]);
    setChatInput(''); setPendingFiles([]); setIsChatLoading(true); setIsLive(true); resetLiveState();

    try {
      const sid = await ensureSession();
      const images = filesToSend.filter(f => f.group === 'image'), nonImages = filesToSend.filter(f => f.group !== 'image'), firstImg = images[0];
      const MAX_PREVIEW_SIZE = 8 * 1024 * 1024;
      const attachmentMeta = attachmentSnapshot.map(a => {
        const isMainImg = a.group === 'image' && firstImg && a.name === firstImg.name;
        const needsPreview = (a.group === 'audio' || (a.group === 'image' && !isMainImg));
        return { mimeType: a.mimeType, name: a.name, group: a.group, sizeBytes: a.sizeBytes, ...(needsPreview && a.preview && a.preview.length < MAX_PREVIEW_SIZE ? { preview: a.preview } : {}) };
      });

      const actualPageBaseUrl = pageBaseUrl || window.location.origin || 'http://localhost:5173';
      const res = await fetch(`${API_BASE_URL}/api/ia/chat/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg, sessionId: sid, userId, userRole, pageUrl: window.location.pathname, pageBaseUrl: actualPageBaseUrl,
          imageOnly: !userMsg && filesToSend.length === 1 && !!firstImg,
          ...(firstImg ? { imageBase64: firstImg.base64, imageMimeType: firstImg.mimeType, imageName: firstImg.name } : {}),
          extraImages: images.slice(1).map(f => ({ base64: f.base64, mimeType: f.mimeType, name: f.name })),
          files: nonImages.map(f => ({ base64: f.base64, mimeType: f.mimeType, name: f.name, group: f.group, sizeBytes: f.sizeBytes })),
          attachmentMeta,
        })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', capturedReasoning = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop();
        let ev = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) ev = line.slice(7).trim();
          else if (line.startsWith('data: ') && ev) {
            try {
              const data = JSON.parse(line.slice(6));
              if (ev === 'reasoning_start') setIsLive(true);
              else if (ev === 'reasoning_chunk') { capturedReasoning += data.text || ''; appendReasoningText(data.text || ''); }
              else if (ev === 'reasoning_end') { capturedReasoning = data.fullText || capturedReasoning; }
              else if (ev === 'step') { const sk = stepKeyCounter.current++; addStep(data.msg, sk); }
              else if (ev === 'step_done') markStepDone(data.stepIndex);
              else if (ev === 'done') {
                if (data.sessionId && data.sessionId !== sid) setCurrentSessionId(data.sessionId);
                setIsLive(false);
                const finalSteps = [...allStepsRef.current];
                const finalReasoning = capturedReasoning || data.reasoning || '';
                const iaId = `ia-${Date.now()}`;
                const partes = processTextAndCode(data.reply);
                const firstCode = partes.find(p => p.type === 'code');
                if (firstCode) setSidePanelContent({ lang: firstCode.lang, code: firstCode.content });
                setMessages(p => [...p, { role: 'ia', content: data.reply, reasoning: finalReasoning, steps: finalSteps, sources: data.sources || [], time: new Date().toLocaleTimeString(), id: iaId }]);
                setTypingSet(prev => new Set(prev).add(iaId));
                carregarDocumentos(data.sessionId || sid);
                carregarSessions();
              }
            } catch (parseErr) { }
            ev = null;
          }
        }
      }
    } catch (e) {
      setMessages(p => [...p, { role: 'ia', content: 'Erro na comunicação com o servidor.', time: getTime(), id: `err-${Date.now()}`, sources: [], reasoning: '', steps: [] }]);
    } finally {
      setIsChatLoading(false); setIsLive(false);
    }
  };

  const processFile = useCallback((file) => new Promise((resolve, reject) => {
    const info = getFileInfo(file.type);
    if (!FILE_TYPES[file.type] && !file.type.startsWith('image/') && !file.type.startsWith('audio/')) { reject(new Error(`Tipo não suportado: ${file.name}`)); return; }
    if (file.size > MAX_FILE_SIZE) { reject(new Error(`Arquivo muito grande: ${file.name}`)); return; }
    const r = new FileReader();
    r.onload = ev => {
      const d = ev.target.result;
      resolve({ base64: d.split(',')[1], mimeType: file.type || 'application/octet-stream', name: file.name, sizeBytes: file.size, group: info.group, preview: ['image', 'audio'].includes(info.group) ? d : null });
    };
    r.onerror = () => reject(new Error(`Erro ao ler: ${file.name}`));
    r.readAsDataURL(file);
  }), []);

  const addFiles = useCallback(async (fileList) => {
    const toAdd = [...fileList].slice(0, MAX_FILES); const added = [];
    for (const file of toAdd) { try { added.push(await processFile(file)); } catch (e) { console.warn('[Files]', e.message); } }
    if (added.length) setPendingFiles(prev => [...prev, ...added].slice(0, MAX_FILES));
  }, [processFile]);

  const handleFileSelect = useCallback(async (e) => { if (e.target.files?.length) await addFiles(e.target.files); e.target.value = ''; }, [addFiles]);
  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items; if (!items) return;
    const files = []; for (const item of items) { if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); } }
    if (files.length) { e.preventDefault(); await addFiles(files); }
  }, [addFiles]);
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); if (!dropRef.current?.contains(e.relatedTarget)) setIsDragging(false); }, []);
  const handleDrop = useCallback(async (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files); }, [addFiles]);

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setSidePanelContent(null);
    resetLiveState();
    localStorage.removeItem(SESSION_KEY);
  };

  const handleQuickAction = (prompt) => {
    setChatInput(prompt);
    setTimeout(() => handleSend(), 50);
  };

  const loadSession = (id) => {
    setCurrentSessionId(id);
    setSidebarOpen(false);
  };

  const handleCopyCode = () => { if (sidePanelContent?.code) navigator.clipboard.writeText(sidePanelContent.code); };
  const handleDownloadCode = () => {
    if (sidePanelContent?.code) {
      const blob = new Blob([sidePanelContent.code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${sidePanelContent.filename || 'documento'}.${sidePanelContent.lang || 'txt'}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  };

  const deletarSessao = async (e, id) => {
    e.stopPropagation();
    if (!await confirmDelete()) return;
    await fetch(`${API_BASE_URL}/api/chat/sessions/${id}`, { method: 'DELETE' });
    if (id === currentSessionId) handleNewSession();
    carregarSessions();
  };

  const isNewSession = messages.length === 0;
  const conversationTitle = isNewSession ? 'Nova conversa' : deriveConversationTitle(messages);
  const canSend = (chatInput.trim() || pendingFiles.length > 0) && !isChatLoading;
  const chatBaseW = isExpanded ? 600 : 400;
  const sidebarW = 260;
  const showSidebar = isFullscreen ? sidebarOpen : sidebarOpen;

  const H = isFullscreen ? '100vh' : isExpanded ? '85vh' : 'calc(100vh - 5rem)';
  const B = isFullscreen ? '0' : '1.5rem';
  const R = isFullscreen ? '0' : '1.5rem';
  const Radius = isFullscreen ? '0' : '20px';

  const totalW = isFullscreen ? '100vw' : `${chatBaseW + (showSidebar ? sidebarW : 0)}px`;

  return (
    <>
      <style>{CHAT_STYLES(th, fontSize)}</style>

      {/* PAINEL LATERAL DE CÓDIGO */}
      <div style={{
        position: 'fixed', zIndex: 99999,
        bottom: B,
        right: isChatOpen && sidePanelContent
          ? (isFullscreen ? '0' : `calc(${R} + ${totalW} + 1rem)`)
          : '-100vw',
        width: isFullscreen && sidePanelContent ? '38%' : `${chatBaseW}px`,
        height: H, background: th.bg, borderRadius: Radius,
        boxShadow: '0 4px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: `1px solid ${th.border}`,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: sidePanelContent ? 1 : 0,
        pointerEvents: sidePanelContent ? 'auto' : 'none',
      }}>
        <div style={{ padding: '12px', borderBottom: `1px solid ${th.headerBorder}`, background: th.headerBg }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={18} style={{ color: th.brand }} /> Visualizador
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={handleCopyCode} title="Copiar" style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }} onMouseEnter={e => e.currentTarget.style.color = th.brand} onMouseLeave={e => e.currentTarget.style.color = th.textFaint}><Copy size={16} /></button>
              <button onClick={handleDownloadCode} title="Baixar" style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }} onMouseEnter={e => e.currentTarget.style.color = th.brand} onMouseLeave={e => e.currentTarget.style.color = th.textFaint}><Download size={16} /></button>
              <button onClick={() => setSidePanelContent(null)} title="Fechar" style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = th.textFaint}><X size={18} /></button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }} className="ia-scroll">
            {sessionDocs.map(doc => (
              <button key={doc.id} onClick={() => setSidePanelContent({ lang: doc.language, code: doc.content, filename: doc.filename })}
                style={{ padding: '4px 8px', borderRadius: '6px', background: sidePanelContent?.filename === doc.filename ? th.brand : th.surface, color: sidePanelContent?.filename === doc.filename ? th.bg : th.text, fontSize: '11px', border: `1px solid ${th.border}`, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                {doc.filename} (v{doc.versao})
              </button>
            ))}
            {sessionDocs.length === 0 && <span style={{ fontSize: '11px', color: th.textFaint }}>Nenhum arquivo nesta conversa.</span>}
          </div>
        </div>
        <div className="ia-sidepanel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px', background: th.surface }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: "'Google Sans Mono', monospace", fontSize: `${fontSize}px`, color: th.text }}>
            {sidePanelContent?.code}
          </pre>
        </div>
      </div>

      {/* JANELA PRINCIPAL DO CHAT */}
      <div className="ia-chat-root" ref={dropRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{
          position: 'fixed', zIndex: 99998, bottom: B,
          right: isFullscreen && sidePanelContent ? '38%' : R,
          width: isFullscreen ? (sidePanelContent ? '62%' : '100%') : totalW,
          height: H, maxHeight: isFullscreen ? 'none' : 'calc(100vh - 3rem)',
          background: th.chatAreaBg, borderRadius: Radius,
          boxShadow: isDragging ? '0 4px 32px rgba(99,102,241,0.25),0 0 0 2px #6366f1' : '0 4px 32px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'row', overflow: 'hidden',
          transform: isChatOpen ? 'scale(1)' : 'scale(0)', transformOrigin: 'bottom right',
          opacity: isChatOpen ? 1 : 0, pointerEvents: isChatOpen ? 'auto' : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          border: isDragging ? '2px dashed #6366f1' : `1px solid ${th.border}`,
        }}>

        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(99,102,241,0.07)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: Radius, pointerEvents: 'none' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📎</div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#6366f1', margin: 0 }}>Solte para anexar</p>
            <p style={{ fontSize: '11px', color: th.textMuted, marginTop: '4px' }}>Até {MAX_FILES} arquivos · Imagem · PDF · Excel · TXT · Áudio</p>
          </div>
        )}

        {/* ── SIDEBAR ESQUERDA ── */}
        {showSidebar && (
          <div style={{
            width: `${sidebarW}px`, background: th.sidebarBg, borderRight: `1px solid ${th.border}`,
            display: 'flex', flexDirection: 'column', flexShrink: 0,
            animation: 'ia-slide-in 0.2s ease',
          }}>
            {/* Sidebar header */}
            <div style={{ padding: '14px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `1px solid ${th.border}` }}>
                  <img src={IA_GIF} alt="IA" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: '13px', color: th.text }}>Analyiz</span>
              </div>
              <button onClick={() => setSidebarOpen(false)}
                style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                onMouseEnter={e => e.currentTarget.style.background = th.quickActionHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <X size={16} />
              </button>
            </div>

            {/* Nova conversa */}
            <div style={{ padding: '0 10px 8px' }}>
              <button onClick={handleNewSession}
                style={{ width: '100%', padding: '9px 12px', background: th.quickActionBg, border: `1px solid ${th.border}`, borderRadius: '10px', color: th.text, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', transition: 'all 0.15s', fontFamily: "'Google Sans', sans-serif" }}
                onMouseEnter={e => e.currentTarget.style.background = th.quickActionHover}
                onMouseLeave={e => e.currentTarget.style.background = th.quickActionBg}>
                <Plus size={15} /> Nova conversa
              </button>
            </div>

            {/* Busca */}
            <div style={{ padding: '0 10px 8px', position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '22px', top: '10px', color: th.textFaint }} />
              <input type="text" placeholder="Pesquisar..." value={searchSession} onChange={e => setSearchSession(e.target.value)}
                style={{ width: '100%', padding: '8px 8px 8px 28px', background: 'transparent', border: `1px solid ${th.border}`, borderRadius: '8px', color: th.text, fontSize: '12px', outline: 'none', fontFamily: "'Google Sans', sans-serif" }} />
            </div>

            {/* Lista de sessões */}
            <div className="ia-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
              {sessions.filter(s => s.titulo?.toLowerCase().includes(searchSession.toLowerCase())).map(s => (
                <div key={s.id} onClick={() => loadSession(s.id)}
                  className="ia-sidebar-item"
                  style={{ padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', background: s.id === currentSessionId ? th.quickActionBg : 'transparent' }}>
                  <MessageSquare size={13} style={{ color: th.textFaint, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: th.text, fontFamily: "'Google Sans', sans-serif" }}>
                    {s.titulo || 'Conversa'}
                  </span>
                  <button onClick={(e) => deletarSessao(e, s.id)}
                    style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '2px', opacity: 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = th.textFaint; }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div style={{ padding: '20px 12px', textAlign: 'center', color: th.textFaint, fontSize: '12px' }}>
                  Nenhuma conversa ainda
                </div>
              )}
            </div>

            {/* Config footer */}
            <div style={{ padding: '12px 10px', borderTop: `1px solid ${th.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: th.textMuted, fontFamily: "'Google Sans', sans-serif" }}>Modo escuro</span>
                <button onClick={() => setDarkMode(!darkMode)}
                  className="ia-tooltip" data-tip={darkMode ? 'Modo claro' : 'Modo escuro'}
                  style={{ background: 'none', border: 'none', color: th.text, cursor: 'pointer', padding: '4px' }}>
                  {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: th.textMuted, fontFamily: "'Google Sans', sans-serif" }}>Fonte</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[11, 13, 15].map(size => (
                    <button key={size} onClick={() => setFontSize(size)}
                      style={{ fontSize: '10px', padding: '2px 7px', cursor: 'pointer', border: `1px solid ${th.border}`, background: fontSize === size ? th.brand : 'transparent', color: fontSize === size ? th.bg : th.text, borderRadius: '4px', fontWeight: 600 }}>
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ÁREA DE CHAT CENTRAL ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* HEADER */}
          <div style={{
            padding: isFullscreen ? '12px 20px' : '10px 14px',
            borderBottom: `1px solid ${th.headerBorder}`,
            background: th.headerBg,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            {/* Esquerda: menu + nome IA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)}
                className="ia-tooltip" data-tip={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
                style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.background = th.quickActionBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Menu size={18} />
              </button>

              {/* Logo pequena */}
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `1px solid ${th.border}`, flexShrink: 0 }}>
                <img src={IA_GIF} alt="IA" style={{ width: '100%', objectFit: 'contain' }} />
              </div>

              {/* Título: assunto da conversa no centro (fullscreen) ou nome IA */}
              {isFullscreen ? (
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: th.textMuted, fontFamily: "'Google Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                    {conversationTitle}
                  </span>
                </div>
              ) : (
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', display: 'block', lineHeight: '1.2', color: th.text, fontFamily: "'Google Sans', sans-serif" }}>Analyiz</span>
                  <span style={{ fontSize: '10px', color: th.textFaint, fontFamily: "'Google Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px', display: 'block' }}>
                    {conversationTitle}
                  </span>
                </div>
              )}
            </div>

            {/* Direita: controles */}
            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              <button onClick={() => setIsFullscreen(!isFullscreen)}
                className="ia-tooltip" data-tip={isFullscreen ? 'Diminuir tela' : 'Tela cheia'}
                style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                onMouseEnter={e => e.currentTarget.style.background = th.quickActionBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {isFullscreen ? <Minimize2 size={16} /> : <Monitor size={16} />}
              </button>

              {!isFullscreen && (
                <button onClick={() => setIsExpanded(!isExpanded)}
                  className="ia-tooltip" data-tip={isExpanded ? 'Diminuir tela' : 'Expandir janela'}
                  style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                  onMouseEnter={e => e.currentTarget.style.background = th.quickActionBg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              )}

              <button onClick={toggleChat}
                className="ia-tooltip" data-tip="Minimizar"
                style={{ background: 'none', border: 'none', color: th.textFaint, cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                onMouseEnter={e => e.currentTarget.style.background = th.quickActionBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Minus size={16} />
              </button>
            </div>
          </div>

          {/* ÁREA DE MENSAGENS */}
          <div ref={scrollRef} className="ia-scroll"
            style={{ flex: 1, overflowY: 'auto', background: th.chatAreaBg, display: 'flex', flexDirection: 'column' }}>

            {/* Tela de boas-vindas (sessão nova) */}
            {isNewSession && (
              <WelcomeGreeting
                th={th} fontSize={fontSize} userName={userName}
                isFullscreen={isFullscreen}
                onQuickAction={(prompt) => { setChatInput(prompt); setTimeout(handleSend, 50); }}
                pageUrl={window.location.pathname}
                greetingIndex={greetingIndex}
              />
            )}

            {/* Mensagens */}
            {!isNewSession && (
              <div style={{ flex: 1, padding: isFullscreen ? '24px 0' : '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {messages.map(msg => (
                  <div key={msg.id}
                    className={isFullscreen ? 'ia-fullscreen-messages' : ''}
                    style={!isFullscreen ? {} : {}}>
                    {msg.role === 'ia' ? (
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {isFullscreen && (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `1px solid ${th.border}`, flexShrink: 0, marginTop: '2px' }}>
                            <img src={IA_GIF} alt="IA" style={{ width: '100%', objectFit: 'contain' }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <IaMessage msg={msg} isTyping={typingSet.has(msg.id)}
                            onDone={() => setTypingSet(p => { const n = new Set(p); n.delete(msg.id); return n; })}
                            th={th} onOpenSidePanel={setSidePanelContent}
                            isFullscreen={isFullscreen} fontSize={fontSize} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <FileAttachmentGrid attachments={msg.attachments} th={th} />
                        {msg.content && (
                          <div style={{ background: th.userBubble, color: th.userText, padding: '10px 14px', borderRadius: '18px 18px 4px 18px', maxWidth: isFullscreen ? '72%' : '88%', fontSize: `${fontSize}px`, lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Google Sans', sans-serif" }}>
                            {msg.content}
                          </div>
                        )}
                        {msg.time && <span style={{ fontSize: '10px', color: th.textFaint, marginTop: '3px' }}>{msg.time}</span>}
                      </div>
                    )}
                  </div>
                ))}
                {isChatLoading && (
                  <div className={isFullscreen ? 'ia-fullscreen-messages' : ''}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      {isFullscreen && (
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `1px solid ${th.border}`, flexShrink: 0, marginTop: '2px' }}>
                          <img src={IA_GIF} alt="IA" style={{ width: '100%', objectFit: 'contain' }} />
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <UnifiedReasoningPanel items={liveItems} isLive={true} th={th} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* INPUT */}
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_MIME} onChange={handleFileSelect} style={{ display: 'none' }} />

          <InputBox
            th={th} fontSize={fontSize}
            chatInput={chatInput} setChatInput={setChatInput}
            handleSend={handleSend} handleKeyDown={handleKeyDown} handlePaste={handlePaste}
            isChatLoading={isChatLoading}
            pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
            fileInputRef={fileInputRef} canSend={canSend}
            isFullscreen={isFullscreen} pageUrl={window.location.pathname}
          />
        </div>
      </div>

      {/* BOTÃO FLUTUANTE */}
      <div style={{ position: 'fixed', zIndex: 9998, bottom: '1.5rem', right: '1.5rem', transform: isChatOpen ? 'scale(0)' : 'scale(1)', opacity: isChatOpen ? 0 : 1, transition: '0.2s', pointerEvents: isChatOpen ? 'none' : 'auto' }}>
        <FloatingButton onClick={toggleChat} hasUnread={hasUnread} shortPreview={shortPreview} />
      </div>
    </>
  );
}