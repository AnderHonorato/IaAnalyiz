import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Activity, User, LogOut, ChevronDown, Bell, Lock, CheckCircle2, Palette, Home, ChevronRight } from 'lucide-react';
import IaAnalyizChat from '../components/IaAnalyizChat';
import ProfileModal from '../components/ProfileModal';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE_URL = 'http://localhost:3000';

// ── 20 temas agrupados — cada um controla header, bg, accent, text, card, cardBorder, sidebar ──
const TEMAS = [
  // ── Neutro ────────────────────────────────────────────────────────────────
  { id: 'dark',      label: 'Dark',      group: 'Neutro',  header: '#1e293b', bg: '#f8fafc', accent: '#3b82f6', text: '#1e293b', card: '#ffffff',  cardBorder: '#e2e8f0', sidebar: '#f1f5f9' },
  { id: 'graphite',  label: 'Graphite',  group: 'Neutro',  header: '#27272a', bg: '#fafafa', accent: '#71717a', text: '#18181b', card: '#ffffff',  cardBorder: '#e4e4e7', sidebar: '#f4f4f5' },
  { id: 'snow',      label: 'Snow',      group: 'Neutro',  header: '#334155', bg: '#ffffff', accent: '#0ea5e9', text: '#1e293b', card: '#f8fafc',  cardBorder: '#e2e8f0', sidebar: '#f1f5f9' },

  // ── Escuro ────────────────────────────────────────────────────────────────
  { id: 'midnight',  label: 'Midnight',  group: 'Escuro',  header: '#0f172a', bg: '#0f172a', accent: '#6366f1', text: '#e2e8f0', card: '#1e293b',  cardBorder: '#334155', sidebar: '#1e293b' },
  { id: 'charcoal',  label: 'Charcoal',  group: 'Escuro',  header: '#111827', bg: '#111827', accent: '#f59e0b', text: '#f3f4f6', card: '#1f2937',  cardBorder: '#374151', sidebar: '#1f2937' },
  { id: 'obsidian',  label: 'Obsidian',  group: 'Escuro',  header: '#09090b', bg: '#09090b', accent: '#a78bfa', text: '#fafafa',  card: '#18181b',  cardBorder: '#27272a', sidebar: '#18181b' },

  // ── Azul ──────────────────────────────────────────────────────────────────
  { id: 'slate',     label: 'Slate',     group: 'Azul',    header: '#334155', bg: '#f1f5f9', accent: '#0ea5e9', text: '#1e293b', card: '#ffffff',  cardBorder: '#cbd5e1', sidebar: '#e2e8f0' },
  { id: 'ocean',     label: 'Ocean',     group: 'Azul',    header: '#164e63', bg: '#ecfeff', accent: '#06b6d4', text: '#164e63', card: '#ffffff',  cardBorder: '#a5f3fc', sidebar: '#cffafe' },
  { id: 'navy',      label: 'Navy',      group: 'Azul',    header: '#1e3a5f', bg: '#eff6ff', accent: '#2563eb', text: '#1e3a5f', card: '#ffffff',  cardBorder: '#bfdbfe', sidebar: '#dbeafe' },

  // ── Verde ─────────────────────────────────────────────────────────────────
  { id: 'forest',    label: 'Forest',    group: 'Verde',   header: '#14532d', bg: '#f0fdf4', accent: '#22c55e', text: '#14532d', card: '#ffffff',  cardBorder: '#bbf7d0', sidebar: '#dcfce7' },
  { id: 'emerald',   label: 'Emerald',   group: 'Verde',   header: '#065f46', bg: '#ecfdf5', accent: '#10b981', text: '#064e3b', card: '#ffffff',  cardBorder: '#a7f3d0', sidebar: '#d1fae5' },
  { id: 'sage',      label: 'Sage',      group: 'Verde',   header: '#3f6212', bg: '#f7fee7', accent: '#84cc16', text: '#3f6212', card: '#ffffff',  cardBorder: '#d9f99d', sidebar: '#ecfccb' },

  // ── Quente ────────────────────────────────────────────────────────────────
  { id: 'wine',      label: 'Wine',      group: 'Quente',  header: '#4c0519', bg: '#fff1f2', accent: '#e11d48', text: '#4c0519', card: '#ffffff',  cardBorder: '#fecdd3', sidebar: '#ffe4e6' },
  { id: 'crimson',   label: 'Crimson',   group: 'Quente',  header: '#7f1d1d', bg: '#fef2f2', accent: '#ef4444', text: '#7f1d1d', card: '#ffffff',  cardBorder: '#fca5a5', sidebar: '#fee2e2' },
  { id: 'amber',     label: 'Amber',     group: 'Quente',  header: '#78350f', bg: '#fffbeb', accent: '#f59e0b', text: '#78350f', card: '#ffffff',  cardBorder: '#fde68a', sidebar: '#fef3c7' },

  // ── Roxo ──────────────────────────────────────────────────────────────────
  { id: 'dusk',      label: 'Dusk',      group: 'Roxo',    header: '#312e81', bg: '#eef2ff', accent: '#818cf8', text: '#312e81', card: '#ffffff',  cardBorder: '#c7d2fe', sidebar: '#e0e7ff' },
  { id: 'violet',    label: 'Violet',    group: 'Roxo',    header: '#4c1d95', bg: '#f5f3ff', accent: '#8b5cf6', text: '#4c1d95', card: '#ffffff',  cardBorder: '#ddd6fe', sidebar: '#ede9fe' },
  { id: 'plum',      label: 'Plum',      group: 'Roxo',    header: '#581c87', bg: '#faf5ff', accent: '#a855f7', text: '#581c87', card: '#ffffff',  cardBorder: '#e9d5ff', sidebar: '#f3e8ff' },

  // ── Rosa ──────────────────────────────────────────────────────────────────
  { id: 'rose',      label: 'Rose',      group: 'Rosa',    header: '#881337', bg: '#fff1f2', accent: '#fb7185', text: '#881337', card: '#ffffff',  cardBorder: '#fda4af', sidebar: '#ffe4e6' },
  { id: 'blush',     label: 'Blush',     group: 'Rosa',    header: '#9d174d', bg: '#fdf2f8', accent: '#ec4899', text: '#831843', card: '#ffffff',  cardBorder: '#f9a8d4', sidebar: '#fce7f3' },
];

const GROUPS = ['Neutro', 'Escuro', 'Azul', 'Verde', 'Quente', 'Roxo', 'Rosa'];

const ROLE_LABELS = { 'OWNER': 'Criador', 'EMPRESARIO': 'Empresário', 'BLOQUEADO': 'Bloqueado' };

const ROUTE_NAMES = {
  'ml': 'Mercado Livre',
  'auditoria': 'Auditoria de Anúncios',
  'shopee': 'Shopee',
  'amazon': 'Amazon',
  'usuarios': 'Gestão de Usuários',
};

const getSafeUser = () => {
  try {
    const saved = localStorage.getItem('analyiz_user');
    if (!saved) return { nome: 'Usuário', role: 'BLOQUEADO', solicitouDesbloqueio: false, tema: 'dark' };
    const parsed = JSON.parse(saved);
    return {
      id: parsed?.id || '',
      nome: parsed?.nome || 'Usuário',
      role: parsed?.role || 'BLOQUEADO',
      avatar: parsed?.avatar || null,
      solicitouDesbloqueio: !!parsed?.solicitouDesbloqueio,
      tema: parsed?.tema || 'dark',
    };
  } catch {
    return { nome: 'Usuário', role: 'BLOQUEADO', solicitouDesbloqueio: false, tema: 'dark' };
  }
};

function applyTheme(temaId) {
  const tema = TEMAS.find(t => t.id === temaId) || TEMAS[0];
  const root = document.documentElement;
  root.style.setProperty('--theme-header',      tema.header);
  root.style.setProperty('--theme-bg',          tema.bg);
  root.style.setProperty('--theme-accent',      tema.accent);
  root.style.setProperty('--theme-text',        tema.text);
  root.style.setProperty('--theme-card',        tema.card);
  root.style.setProperty('--theme-card-border', tema.cardBorder);
  root.style.setProperty('--theme-sidebar',     tema.sidebar);
}

// ── Breadcrumb: fundo 100% transparente, só o texto ─────────────────────────
function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(x => x);
  if (pathnames.length === 0) return null;

  return (
    <div
      className="w-full px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0 relative z-10"
      style={{ background: 'transparent' }}          // ← sem fundo
    >
      <Link
        to="/"
        className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-opacity whitespace-nowrap hover:opacity-70"
        style={{ color: 'var(--theme-text)', opacity: 0.45 }}
      >
        <Home className="w-3 h-3" /> Início
      </Link>

      {pathnames.map((value, index) => {
        const to     = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const label  = ROUTE_NAMES[value] || value;
        return (
          <React.Fragment key={to}>
            <ChevronRight
              className="w-2.5 h-2.5 flex-shrink-0"
              style={{ color: 'var(--theme-text)', opacity: 0.25 }}
            />
            {isLast ? (
              <span
                className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                style={{ color: 'var(--theme-text)' }}
              >
                {label}
              </span>
            ) : (
              <Link
                to={to}
                className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-opacity hover:opacity-70"
                style={{ color: 'var(--theme-text)', opacity: 0.45 }}
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function MainLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const [user, setUser]                             = useState(getSafeUser());
  const [isChatOpen, setIsChatOpen]                 = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen]                 = useState(false);
  const [isThemeOpen, setIsThemeOpen]               = useState(false);
  const [themeGroup, setThemeGroup]                 = useState('Neutro');
  const [pendingUsersCount, setPendingUsersCount]   = useState(0);
  const [isRequestingUnblock, setIsRequestingUnblock] = useState(false);
  const [isSavingProfile, setIsSavingProfile]       = useState(false);

  const userMenuRef = useRef(null);
  const themeRef    = useRef(null);

  useEffect(() => { applyTheme(user.tema || 'dark'); }, [user.tema]);

  useEffect(() => {
    if (user?.role === 'OWNER') {
      const fetchPending = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/usuarios/pendentes`);
          if (res.ok) { const data = await res.json(); setPendingUsersCount(data?.count || 0); }
        } catch {}
      };
      fetchPending();
      const interval = setInterval(fetchPending, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.role]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setIsMenuOpen(false);
      if (themeRef.current    && !themeRef.current.contains(e.target))    setIsThemeOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('analyiz_token');
    localStorage.removeItem('analyiz_user');
    navigate('/login');
  };

  const handleRequestUnblock = async () => {
    if (!user?.id) return;
    setIsRequestingUnblock(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios/request-unblock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id }),
      });
      if (res.ok) {
        const updated = { ...user, solicitouDesbloqueio: true };
        setUser(updated); localStorage.setItem('analyiz_user', JSON.stringify(updated));
      }
    } catch {} finally { setIsRequestingUnblock(false); }
  };

  const handleSelectTheme = async (temaId) => {
    const updated = { ...user, tema: temaId };
    setUser(updated); localStorage.setItem('analyiz_user', JSON.stringify(updated));
    applyTheme(temaId); setIsThemeOpen(false);
    try {
      await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, nome: user.nome, avatar: user.avatar, tema: temaId }),
      });
    } catch {}
  };

  const primeiroNome  = String(user?.nome || 'Admin').split(' ')[0];
  const labelCargo    = ROLE_LABELS[user?.role] || 'Membro';
  const temaAtual     = TEMAS.find(t => t.id === user.tema) || TEMAS[0];
  const temasDoGrupo  = TEMAS.filter(t => t.group === themeGroup);

  return (
    <div
      className="h-screen w-full flex flex-col font-sans overflow-hidden relative"
      style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}
    >
      <style>{`
        :root {
          --theme-header: #1e293b; --theme-bg: #f8fafc; --theme-accent: #3b82f6;
          --theme-text: #1e293b;  --theme-card: #ffffff; --theme-card-border: #e2e8f0;
          --theme-sidebar: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
      `}</style>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header
        className="border-b border-white/10 px-4 py-2.5 shadow-md shrink-0 z-20 relative text-white"
        style={{ background: 'var(--theme-header)' }}
      >
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center">

          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="p-1.5 rounded-lg shadow-md" style={{ background: 'var(--theme-accent)' }}>
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black uppercase italic tracking-tighter leading-tight">IA Analyiz</h1>
              <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest">Dashboard Global</p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative">

            {/* Notificação de bloqueios */}
            {user?.role === 'OWNER' && pendingUsersCount > 0 && (
              <button
                onClick={() => navigate('/usuarios')}
                className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-full text-[9px] font-black uppercase animate-pulse"
              >
                <Bell className="w-3 h-3" /> Bloqueios ({pendingUsersCount})
              </button>
            )}

            {/* Solicitar acesso */}
            {user?.role === 'BLOQUEADO' && (
              <button
                onClick={handleRequestUnblock}
                disabled={user?.solicitouDesbloqueio || isRequestingUnblock}
                className={`flex items-center gap-2 border px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${user?.solicitouDesbloqueio ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'}`}
              >
                {user?.solicitouDesbloqueio ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                <span>{user?.solicitouDesbloqueio ? 'Aguardando' : 'Solicitar Acesso'}</span>
              </button>
            )}

            {/* ── SELETOR DE TEMA ─────────────────────────────────────── */}
            <div className="relative" ref={themeRef}>
              <button
                onClick={() => setIsThemeOpen(v => !v)}
                title="Alterar tema"
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1.5 rounded-full text-[10px] font-bold transition-all text-white"
              >
                {/* bolinha dupla: header + accent */}
                <span className="relative flex-shrink-0 w-4 h-4">
                  <span className="absolute inset-0 rounded-full" style={{ background: temaAtual.header, border: '1.5px solid rgba(255,255,255,0.2)' }} />
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white" style={{ background: temaAtual.accent }} />
                </span>
                <span className="hidden sm:inline">{temaAtual.label}</span>
                <Palette className="w-3 h-3 opacity-50" />
              </button>

              {isThemeOpen && (
                <div
                  className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[200] overflow-hidden"
                  style={{ width: '290px' }}
                >
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 pt-3 pb-2">
                    Aparência
                  </p>

                  {/* Tabs de grupo */}
                  <div className="flex gap-0.5 px-3 pb-2 flex-wrap">
                    {GROUPS.map(g => (
                      <button
                        key={g}
                        onClick={() => setThemeGroup(g)}
                        className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all ${themeGroup === g ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  {/* Grid de temas do grupo */}
                  <div className="grid grid-cols-3 gap-1 px-2 pb-3">
                    {temasDoGrupo.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTheme(t.id)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl text-[9px] font-bold transition-all border ${user.tema === t.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-transparent hover:bg-slate-50 text-slate-700'}`}
                      >
                        {/* Miniatura: fundo + card + accent */}
                        <span className="relative w-10 h-7 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0"
                          style={{ background: t.bg }}>
                          <span className="absolute top-0 left-0 right-0 h-2.5" style={{ background: t.header }} />
                          <span className="absolute bottom-1 left-1 right-1 h-1.5 rounded-sm opacity-90"
                            style={{ background: t.card, border: `1px solid ${t.cardBorder}` }} />
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                            style={{ background: t.accent }} />
                        </span>
                        <span className="truncate w-full text-center leading-tight">{t.label}</span>
                        {user.tema === t.id && <span className="text-blue-500 text-[8px] leading-none">✓ ativo</span>}
                      </button>
                    ))}
                  </div>

                  {/* Preview ao vivo do card */}
                  <div className="mx-3 mb-3 p-3 rounded-xl border" style={{ background: temaAtual.card, borderColor: temaAtual.cardBorder }}>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Preview</p>
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg flex-shrink-0" style={{ background: temaAtual.accent, opacity: 0.18 }} />
                      <div className="flex-1 space-y-1">
                        <div className="h-1.5 rounded-full w-3/4" style={{ background: temaAtual.text, opacity: 0.25 }} />
                        <div className="h-1 rounded-full w-1/2"   style={{ background: temaAtual.text, opacity: 0.12 }} />
                      </div>
                      <span className="w-5 h-5 rounded-full flex-shrink-0 border-2 border-white" style={{ background: temaAtual.accent }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── MENU PERFIL ──────────────────────────────────────────── */}
            <div className="relative" ref={userMenuRef}>
              <div
                className="flex items-center gap-2.5 bg-white/10 border border-white/10 hover:bg-white/20 px-2 py-1 rounded-full cursor-pointer transition-all"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-[10px] font-bold leading-none">{primeiroNome}</span>
                  <span className={`text-[7px] font-black uppercase tracking-widest mt-0.5 ${user.role === 'BLOQUEADO' ? 'text-red-400' : 'text-blue-400'}`}>
                    {labelCargo}
                  </span>
                </div>
                <div className="h-7 w-7 bg-white/10 rounded-full flex items-center justify-center overflow-hidden border border-white/20">
                  {user?.avatar
                    ? <img src={user.avatar} className="w-full h-full object-cover" alt="" />
                    : <User className="text-blue-400 w-4 h-4" />}
                </div>
                <ChevronDown className="w-3 h-3 text-white/50" />
              </div>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-200 z-[100] overflow-hidden text-slate-700">
                  {user?.role === 'OWNER' && (
                    <button
                      onClick={() => { navigate('/usuarios'); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-[11px] font-bold border-b border-slate-100 transition-colors"
                    >
                      <Activity className="w-3.5 h-3.5 text-emerald-600" /> Gestão Usuários
                    </button>
                  )}
                  <button
                    onClick={() => { setIsProfileModalOpen(true); setIsMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-[11px] font-bold border-b border-slate-100"
                  >
                    <User className="w-3.5 h-3.5 text-blue-600" /> Meu Perfil
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-red-50 text-[11px] font-bold text-red-600"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── BREADCRUMB — fundo transparente ──────────────────────────────── */}
      <Breadcrumbs />

      {/* ── CONTEÚDO PRINCIPAL ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto relative z-10 flex flex-col">
        <ErrorBoundary>
          {user?.role === 'BLOQUEADO' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
              <div className="bg-red-500/10 p-5 rounded-full mb-5 border border-red-500/20">
                <Lock className="w-12 h-12 text-red-500" />
              </div>
              <h2 className="text-2xl font-black mb-3" style={{ color: 'var(--theme-text)' }}>Acesso Restrito</h2>
              <p className="text-slate-500 text-xs max-w-xs leading-relaxed">
                Clique em "Solicitar Acesso" no menu superior para análise do Criador.
              </p>
            </div>
          ) : (
            <Outlet context={{ userId: user?.id, userRole: user?.role }} />
          )}
        </ErrorBoundary>
      </div>

      <ErrorBoundary>
        <IaAnalyizChat
          isChatOpen={isChatOpen}
          toggleChat={() => setIsChatOpen(!isChatOpen)}
          userRole={user?.role}
        />
      </ErrorBoundary>

      {isProfileModalOpen && (
        <ProfileModal
          user={user}
          onClose={() => setIsProfileModalOpen(false)}
          onSave={async (nome, avatar) => {
            if (!user?.id) return;
            try {
              const res  = await fetch(`${API_BASE_URL}/api/auth/profile`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, nome, avatar, tema: user.tema }),
              });
              const data = await res.json();
              if (res.ok && data?.user) {
                const updated = { ...data.user };
                setUser(updated);
                localStorage.setItem('analyiz_user', JSON.stringify(updated));
                setIsProfileModalOpen(false);
              }
            } catch {}
          }}
        />
      )}
    </div>
  );
}