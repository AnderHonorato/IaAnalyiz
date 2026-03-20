import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Activity, User, LogOut, ChevronDown, Bell, Lock, CheckCircle2, Palette, Home, ChevronRight } from 'lucide-react';
import IaAnalyizChat from '../components/IaAnalyizChat';
import ProfileModal from '../components/ProfileModal';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE_URL = 'http://localhost:3000';

const TEMAS = [
  { id: 'dark',        label: 'Dark',         header: '#1e293b', bg: '#f8fafc', accent: '#3b82f6', text: '#1e293b' },
  { id: 'midnight',    label: 'Midnight',     header: '#0f172a', bg: '#0f172a', accent: '#6366f1', text: '#e2e8f0' },
  { id: 'slate',       label: 'Slate',        header: '#334155', bg: '#f1f5f9', accent: '#0ea5e9', text: '#1e293b' },
];

const ROLE_LABELS = { 'OWNER': 'Criador', 'EMPRESARIO': 'Empresário', 'BLOQUEADO': 'Bloqueado' };

const ROUTE_NAMES = {
  'ml': 'Mercado Livre',
  'auditoria': 'Auditoria de Anúncios',
  'shopee': 'Shopee',
  'amazon': 'Amazon',
  'usuarios': 'Gestão de Usuários'
};

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

// BREADCRUMBS SEM FUNDO NENHUM
function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  if (pathnames.length === 0) return null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 pt-3 pb-1 flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0">
      <Link to="/" className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors whitespace-nowrap">
        <Home className="w-3 h-3 mb-0.5" /> Início
      </Link>
      {pathnames.map((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const label = ROUTE_NAMES[value] || value;
        return (
          <React.Fragment key={to}>
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            {isLast ? (
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 whitespace-nowrap">{label}</span>
            ) : (
              <Link to={to} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors whitespace-nowrap">{label}</Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function MainLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getSafeUser());
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);

  const userMenuRef  = useRef(null);

  useEffect(() => { applyTheme(user.tema || 'dark'); }, [user.tema]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setIsMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('analyiz_token');
    localStorage.removeItem('analyiz_user');
    navigate('/login');
  };

  const primeiroNome = String(user?.nome || 'Admin').split(' ')[0];
  const labelCargo   = ROLE_LABELS[user?.role] || 'Membro';

  return (
    <div className="h-screen w-full flex flex-col font-sans overflow-hidden relative" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
      {/* HEADER Z-INDEX REMOVIDO PARA DEIXAR A TELA CHEIA PASSAR POR CIMA */}
      <header className="border-b border-white/10 px-4 py-2.5 shadow-md shrink-0 relative text-white" style={{ background: 'var(--theme-header)' }}>
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
                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-200 z-[999999] overflow-hidden text-slate-700">
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

      <Breadcrumbs />

      <div className="flex-1 overflow-y-auto flex flex-col relative">
        <ErrorBoundary>
          {user?.role === 'BLOQUEADO' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
              <div className="bg-red-500/10 p-5 rounded-full mb-5"><Lock className="w-12 h-12 text-red-500" /></div>
              <h2 className="text-2xl font-black mb-3">Acesso Restrito</h2>
            </div>
          ) : (
            <Outlet context={{ userId: user?.id, userRole: user?.role }} />
          )}
        </ErrorBoundary>
      </div>

      <ErrorBoundary>
        <IaAnalyizChat isChatOpen={isChatOpen} toggleChat={() => setIsChatOpen(!isChatOpen)} userRole={user?.role} />
      </ErrorBoundary>

      {isProfileModalOpen && (
        <ProfileModal user={user} onClose={() => setIsProfileModalOpen(false)} onSave={() => setIsProfileModalOpen(false)} />
      )}
    </div>
  );
}