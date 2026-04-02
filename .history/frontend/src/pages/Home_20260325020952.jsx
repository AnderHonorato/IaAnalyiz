// MainLayout.jsx — Ícone de usuários ativos + rastreamento de sessão + submenu Plataformas + Conversar com IA
import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Activity, User, LogOut, ChevronDown, Bell, Lock, CheckCircle2,
  Palette, Home, ChevronRight, ZoomIn, ZoomOut, Settings2,
  ShoppingBag, ShoppingCart, Box, Users, RefreshCw, Loader2, Bot, LayoutGrid
} from 'lucide-react';
import IaAnalyizChat from '../components/IaAnalyizChat';
import ProfileModal from '../components/ProfileModal';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE_URL = 'http://localhost:3000';

const TEMAS = [
  { id: 'dark',       label: 'Dark',       group: 'Neutro',   header: '#1e293b', bg: '#f8fafc', accent: '#3b82f6', text: '#1e293b', card: '#ffffff',  cardBorder: '#e2e8f0', sidebar: '#f1f5f9' },
  { id: 'graphite',   label: 'Graphite',   group: 'Neutro',   header: '#27272a', bg: '#fafafa', accent: '#52525b', text: '#27272a', card: '#ffffff',  cardBorder: '#e4e4e7', sidebar: '#f4f4f5' },
];

export default function MainLayout() {
  const [user, setUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeUsers, setActiveUsers] = useState(0);
  const [isVerificandoManual, setIsVerificandoManual] = useState(false);
  
  // Controle de submenus
  const [isPlataformasOpen, setIsPlataformasOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const data = localStorage.getItem('analyiz_user');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        setUser(parsed);
      } catch (e) {
        console.error('Erro ao ler usuario:', e);
      }
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    const atualizarSessao = async () => {
      try {
        const token = localStorage.getItem('analyiz_token');
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/api/sessao/ping`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.activeUsers) setActiveUsers(data.activeUsers);
        }
      } catch (e) { console.error('Erro no ping de sessao:', e); }
    };
    atualizarSessao();
    const int = setInterval(atualizarSessao, 60000);
    return () => clearInterval(int);
  }, []);

  // Escuta o evento da Home para abrir o chat em tela cheia
  useEffect(() => {
    const handleOpenChat = () => {
      setIsChatOpen(true);
      // Dispara um evento secundário que o IaAnalyizChat vai escutar para ativar tela cheia
      setTimeout(() => window.dispatchEvent(new CustomEvent('force-chat-fullscreen')), 100);
    };
    window.addEventListener('open-chat-fullscreen', handleOpenChat);
    return () => window.removeEventListener('open-chat-fullscreen', handleOpenChat);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('analyiz_token');
    localStorage.removeItem('analyiz_user');
    navigate('/login');
  };

  const menuItems = [
    { path: '/', icon: Home, label: 'Início', roles: ['OWNER', 'ADMIN', 'USER'] },
    { path: '/usuarios', icon: Users, label: 'Usuários', roles: ['OWNER'] },
  ];

  const plataformasItems = [
    { path: '/ml', icon: ShoppingBag, label: 'Mercado Livre', roles: ['OWNER', 'ADMIN', 'USER'] },
    { path: '/shopee', icon: ShoppingCart, label: 'Shopee', roles: ['OWNER', 'ADMIN', 'USER'] },
    { path: '/amazon', icon: Box, label: 'Amazon', roles: ['OWNER', 'ADMIN', 'USER'] },
  ];

  const podeAcessar = (roles) => user && roles.includes(user.role);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 font-sans transition-colors duration-300">
      
      {/* SIDEBAR */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-[#1e293b] text-slate-300 flex flex-col transition-all duration-300 ease-in-out border-r border-slate-800/50 shrink-0 z-20`}>
        
        {/* Cabeçalho do Sidebar - Removido ícone e texto da IA conforme solicitado */}
        <div className="h-16 flex items-center justify-center border-b border-slate-800/50 shrink-0">
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent tracking-tight">
            Analyiz
          </h1>
        </div>

        {/* Links Principais */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5 custom-scrollbar">
          {menuItems.map((item) => (
            podeAcessar(item.roles) && (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  location.pathname === item.path ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'
                }`}>
                <item.icon className={`w-5 h-5 flex-shrink-0 ${location.pathname === item.path ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`} />
                {isSidebarOpen && <span className="font-semibold text-sm tracking-wide">{item.label}</span>}
              </Link>
            )
          ))}

          {/* Submenu Plataformas */}
          {podeAcessar(['OWNER', 'ADMIN', 'USER']) && (
            <div className="mt-4">
              <button 
                onClick={() => setIsPlataformasOpen(!isPlataformasOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-slate-800 hover:text-white group"
              >
                <div className="flex items-center gap-3">
                  <LayoutGrid className="w-5 h-5 flex-shrink-0 text-slate-400 group-hover:text-purple-400" />
                  {isSidebarOpen && <span className="font-semibold text-sm tracking-wide">Plataformas</span>}
                </div>
                {isSidebarOpen && (
                  isPlataformasOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {isSidebarOpen && isPlataformasOpen && (
                <div className="ml-4 mt-1 pl-2 border-l border-slate-700/50 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                  {plataformasItems.map((item) => (
                    <Link key={item.path} to={item.path}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group ${
                        location.pathname.startsWith(item.path) ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }`}>
                      <item.icon className={`w-4 h-4 flex-shrink-0 ${location.pathname.startsWith(item.path) ? 'text-purple-400' : 'text-slate-500 group-hover:text-purple-400'}`} />
                      <span className="font-medium text-[13px]">{item.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botão Conversar com IA (Abre Chat em Tela Cheia) */}
          <div className="pt-4 mt-4 border-t border-slate-800/50">
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('open-chat-fullscreen'))}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group bg-gradient-to-r from-indigo-600/20 to-purple-600/20 hover:from-indigo-600/40 hover:to-purple-600/40 border border-indigo-500/30`}
            >
              <Bot className="w-5 h-5 flex-shrink-0 text-indigo-400 group-hover:text-indigo-300" />
              {isSidebarOpen && <span className="font-black text-sm text-indigo-100 uppercase tracking-widest">Conversar com IA</span>}
            </button>
          </div>
        </div>

        {/* Rodapé Sidebar (Perfil & Stats) */}
        <div className="p-3 border-t border-slate-800/50 shrink-0 bg-slate-900/30">
          {user?.role === 'OWNER' && (
            <div className={`mb-3 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 ${!isSidebarOpen && 'justify-center'}`}>
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              {isSidebarOpen && (
                <div className="flex flex-col">
                  <span className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider">Status do Sistema</span>
                  <span className="text-xs text-emerald-100 font-medium">{activeUsers} {activeUsers === 1 ? 'usuário ativo' : 'usuários ativos'}</span>
                </div>
              )}
            </div>
          )}

          <div className={`flex items-center ${isSidebarOpen ? 'justify-between' : 'justify-center flex-col gap-2'} bg-slate-800/50 p-2 rounded-xl border border-slate-700/50`}>
            <button onClick={() => setIsProfileModalOpen(true)} className="flex items-center gap-2 hover:bg-slate-700/50 p-1.5 rounded-lg transition-colors flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shrink-0 shadow-inner overflow-hidden">
                {user?.avatar ? <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" /> : user?.nome?.charAt(0)?.toUpperCase()}
              </div>
              {isSidebarOpen && (
                <div className="flex flex-col text-left truncate">
                  <span className="text-sm font-bold text-white truncate">{user?.nome}</span>
                  <span className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-widest">{user?.role}</span>
                </div>
              )}
            </button>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          <ErrorBoundary>
            {user?.role === 'BLOQUEADO' ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-950 text-center animate-in fade-in duration-500">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                  <Lock className="w-12 h-12 text-red-500" />
                </div>
                <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">Acesso Bloqueado</h2>
                <p className="text-slate-400 max-w-md mb-8 leading-relaxed">Sua conta está aguardando liberação do administrador. Por favor, aguarde ou entre em contato com o suporte.</p>
                <button disabled={isVerificandoManual} onClick={() => window.location.reload()}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md disabled:opacity-70"
                >
                  {isVerificandoManual ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
                  {isVerificandoManual ? 'Verificando...' : 'Verificar Liberação'}
                </button>
              </div>
            ) : <Outlet context={{ userId: user?.id, userRole: user?.role }} />}
          </ErrorBoundary>
        </div>
      </div>

      <ErrorBoundary>
        <IaAnalyizChat isChatOpen={isChatOpen} toggleChat={() => setIsChatOpen(!isChatOpen)} userRole={user?.role} />
      </ErrorBoundary>

      {isProfileModalOpen && (
        <ProfileModal user={user} onClose={() => setIsProfileModalOpen(false)}
          onSave={async (nome, avatar) => {
            if (!user?.id) return;
            try {
              const res  = await fetch(`${API_BASE_URL}/api/auth/profile`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:user.id, nome, avatar, tema:user.tema }) });
              const data = await res.json();
              if (res.ok && data?.user) { 
                const updated = { ...data.user };
                setUser(updated);
                localStorage.setItem('analyiz_user', JSON.stringify(updated));
                setIsProfileModalOpen(false);
              }
            } catch (e) { console.error('Erro ao salvar perfil', e); }
          }} 
        />
      )}
    </div>
  );
}