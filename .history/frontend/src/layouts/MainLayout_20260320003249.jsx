import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Activity, User, LogOut, ChevronDown, Bell, Lock, CheckCircle2, Palette } from 'lucide-react';
import IaAnalyizChat from '../components/IaAnalyizChat';
import ProfileModal from '../components/ProfileModal';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE_URL = 'http://localhost:3000';

// ── Temas disponíveis ─────────────────────────────────────────────────────────
const TEMAS = [
  { id: 'dark',        label: 'Dark',         header: '#1e293b', bg: '#f8fafc', accent: '#3b82f6', text: '#1e293b' },
  { id: 'midnight',    label: 'Midnight',      header: '#0f172a', bg: '#0f172a', accent: '#6366f1', text: '#e2e8f0' },
  { id: 'slate',       label: 'Slate',         header: '#334155', bg: '#f1f5f9', accent: '#0ea5e9', text: '#1e293b' },
  { id: 'forest',      label: 'Forest',        header: '#14532d', bg: '#f0fdf4', accent: '#22c55e', text: '#14532d' },
  { id: 'ocean',       label: 'Ocean',         header: '#164e63', bg: '#ecfeff', accent: '#06b6d4', text: '#164e63' },
  { id: 'wine',        label: 'Wine',          header: '#4c0519', bg: '#fff1f2', accent: '#e11d48', text: '#4c0519' },
  { id: 'graphite',    label: 'Graphite',      header: '#27272a', bg: '#fafafa', accent: '#71717a', text: '#18181b' },
  { id: 'dusk',        label: 'Dusk',          header: '#312e81', bg: '#eef2ff', accent: '#818cf8', text: '#312e81' },
];

const ROLE_LABELS = { 'OWNER': 'Criador', 'EMPRESARIO': 'Empresário', 'BLOQUEADO': 'Bloqueado' };

const getSafeUser = () => {
  try {
    const saved = localStorage.getItem('analyiz_user');
    if (!saved) return { nome: 'Usuário', role: 'BLOQUEADO', solicitouDesbloqueio: false, tema: 'dark' };
    const parsed = JSON.parse(saved);
    return { id: parsed?.id || '', nome: parsed?.nome || 'Usuário', role: parsed?.role || 'BLOQUEADO', avatar: parsed?.avatar || null, solicitouDesbloqueio: !!parsed?.solicitouDesbloqueio, tema: parsed?.tema || 'dark' };
  } catch { return { nome: 'Usuário', role: 'BLOQUEADO', solicitouDesbloqueio: false, tema: 'dark' }; }
};

function applyTheme(temaId) {
  const tema = TEMAS.find(t => t.id === temaId) || TEMAS[0];
  const root = document.documentElement;
  root.style.setProperty('--theme-header',  tema.header);
  root.style.setProperty('--theme-bg',      tema.bg);
  root.style.setProperty('--theme-accent',  tema.accent);
  root.style.setProperty('--theme-text',    tema.text);
}

export default function MainLayout() {
  const navigate = useNavigate();
  const [user, setUser]                   = useState(getSafeUser());
  const [isChatOpen, setIsChatOpen]       = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen]       = useState(false);
  const [isThemeOpen, setIsThemeOpen]     = useState(false);
  const [pendingUsersCount, setPendingUsersCount]   = useState(0);
  const [isRequestingUnblock, setIsRequestingUnblock] = useState(false);
  const [editName, setEditName]           = useState(user.nome);
  const [editAvatar, setEditAvatar]       = useState(user.avatar || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const userMenuRef  = useRef(null);
  const themeRef     = useRef(null);

  // Aplica tema ao montar e quando muda
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
      if (themeRef.current   && !themeRef.current.contains(e.target))    setIsThemeOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('analyiz_token');
    localStorage.removeItem('analyiz_user');
    navigate('/login');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) { const r = new FileReader(); r.onloadend = () => setEditAvatar(r.result); r.readAsDataURL(file); }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, nome: editName, avatar: editAvatar, tema: user.tema })
      });
      const data = await res.json();
      if (res.ok && data?.user) {
        const updated = { ...data.user };
        setUser(updated);
        localStorage.setItem('analyiz_user', JSON.stringify(updated));
        setIsProfileModalOpen(false);
      }
    } catch {} finally { setIsSavingProfile(false); }
  };

  const handleRequestUnblock = async () => {
    if (!user?.id) return;
    setIsRequestingUnblock(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios/request-unblock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id })
      });
      if (res.ok) {
        const updated = { ...user, solicitouDesbloqueio: true };
        setUser(updated);
        localStorage.setItem('analyiz_user', JSON.stringify(updated));
      }
    } catch {} finally { setIsRequestingUnblock(false); }
  };

  const handleSelectTheme = async (temaId) => {
    const updated = { ...user, tema: temaId };
    setUser(updated);
    localStorage.setItem('analyiz_user', JSON.stringify(updated));
    applyTheme(temaId);
    setIsThemeOpen(false);
    // Salva no banco em background
    try {
      await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, nome: user.nome, avatar: user.avatar, tema: temaId })
      });
    } catch {}
  };

  const primeiroNome = String(user?.nome || 'Admin').split(' ')[0];
  const labelCargo   = ROLE_LABELS[user?.role] || 'Membro';
  const temaAtual    = TEMAS.find(t => t.id === user.tema) || TEMAS[0];

  return (
    <div className="h-screen w-full flex flex-col font-sans overflow-hidden relative"
      style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>

      {/* CSS vars globais */}
      <style>{`
        :root { --theme-header:#1e293b; --theme-bg:#f8fafc; --theme-accent:#3b82f6; --theme-text:#1e293b; }
      `}</style>

      {/* HEADER */}
      <header className="border-b border-white/10 px-4 py-2.5 shadow-md shrink-0 z-30 relative text-white"
        style={{ background: 'var(--theme-header)' }}>
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center">

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
            {user?.role === 'OWNER' && pendingUsersCount > 0 && (
              <button onClick={() => navigate('/usuarios')} className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-full text-[9px] font-black uppercase animate-pulse">
                <Bell className="w-3 h-3" /> Bloqueios ({pendingUsersCount})
              </button>
            )}

            {user?.role === 'BLOQUEADO' && (
              <button onClick={handleRequestUnblock} disabled={user?.solicitouDesbloqueio || isRequestingUnblock}
                className={`flex items-center gap-2 border px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${user?.solicitouDesbloqueio ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'}`}>
                {user?.solicitouDesbloqueio ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                <span>{user?.solicitouDesbloqueio ? 'Aguardando' : 'Solicitar Acesso'}</span>
              </button>
            )}

            {/* SELETOR DE TEMA */}
            <div className="relative" ref={themeRef}>
              <button onClick={() => setIsThemeOpen(v => !v)} title="Alterar tema"
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1.5 rounded-full text-[10px] font-bold transition-all text-white">
                <Palette className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{temaAtual.label}</span>
              </button>

              {isThemeOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[200] overflow-hidden p-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 py-1.5">Escolher Tema</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TEMAS.map(t => (
                      <button key={t.id} onClick={() => handleSelectTheme(t.id)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all border ${user.tema === t.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-transparent hover:bg-slate-50 text-slate-700'}`}>
                        <span className="w-4 h-4 rounded-full flex-shrink-0 border border-slate-200"
                          style={{ background: t.header }}></span>
                        {t.label}
                        {user.tema === t.id && <span className="ml-auto text-blue-500 text-[10px]">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* MENU PERFIL */}
            <div className="relative" ref={userMenuRef}>
              <div className="flex items-center gap-2.5 bg-white/10 border border-white/10 hover:bg-white/20 px-2 py-1 rounded-full cursor-pointer transition-all"
                onClick={() => setIsMenuOpen(!isMenuOpen)}>
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-[10px] font-bold leading-none">{primeiroNome}</span>
                  <span className={`text-[7px] font-black uppercase tracking-widest mt-0.5 ${user.role === 'BLOQUEADO' ? 'text-red-400' : 'text-blue-400'}`}>{labelCargo}</span>
                </div>
                <div className="h-7 w-7 bg-white/10 rounded-full flex items-center justify-center overflow-hidden border border-white/20">
                  {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : <User className="text-blue-400 w-4 h-4" />}
                </div>
                <ChevronDown className="w-3 h-3 text-white/50" />
              </div>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-200 z-[100] overflow-hidden text-slate-700">
                  {user?.role === 'OWNER' && (
                    <button onClick={() => { navigate('/usuarios'); setIsMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-[11px] font-bold border-b border-slate-100 transition-colors">
                      <Activity className="w-3.5 h-3.5 text-emerald-600" /> Gestão Usuários
                    </button>
                  )}
                  <button onClick={() => { setIsProfileModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-[11px] font-bold border-b border-slate-100">
                    <User className="w-3.5 h-3.5 text-blue-600" /> Meu Perfil
                  </button>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-red-50 text-[11px] font-bold text-red-600">
                    <LogOut className="w-3.5 h-3.5" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* CONTEÚDO */}
      <div className="flex-1 overflow-y-auto relative z-10 flex flex-col">
        <ErrorBoundary>
          {user?.role === 'BLOQUEADO' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
              <div className="bg-red-500/10 p-5 rounded-full mb-5 border border-red-500/20"><Lock className="w-12 h-12 text-red-500" /></div>
              <h2 className="text-2xl font-black mb-3" style={{ color: 'var(--theme-text)' }}>Acesso Restrito</h2>
              <p className="text-slate-500 text-xs max-w-xs leading-relaxed">Clique em "Solicitar Acesso" no menu superior para análise do Criador.</p>
            </div>
          ) : (
            <Outlet context={{ userId: user?.id, userRole: user?.role }} />
          )}
        </ErrorBoundary>
      </div>

      <ErrorBoundary>
        <IaAnalyizChat isChatOpen={isChatOpen} toggleChat={() => setIsChatOpen(!isChatOpen)} userRole={user?.role} />
      </ErrorBoundary>

      {/* MODAL DE PERFIL */}
      {isProfileModalOpen && (
        <ProfileModal
          user={user}
          onClose={() => setIsProfileModalOpen(false)}
          onSave={async (nome, avatar) => {
            if (!user?.id) return;
            try {
              const res  = await fetch(`${API_BASE_URL}/api/auth/profile`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, nome, avatar, tema: user.tema })
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