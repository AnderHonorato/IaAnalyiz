import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Activity, User, LogOut, Camera, Save, X, Loader2, ChevronDown, Bell, Lock, CheckCircle2 } from 'lucide-react';
import IaAnalyizChat from '../components/IaAnalyizChat';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE_URL = 'http://localhost:3000';

// Mapeamento de cargos conforme solicitado para exibição no perfil
const ROLE_LABELS = {
  'OWNER': 'Criador',
  'EMPRESARIO': 'Empresário',
  'BLOQUEADO': 'Bloqueado'
};

// Função de recuperação segura para evitar quebra de JSON ou campos inexistentes
const getSafeUser = () => {
  try {
    const saved = localStorage.getItem('analyiz_user');
    if (!saved) return { nome: 'Usuário', role: 'BLOQUEADO', solicitouDesbloqueio: false };
    const parsed = JSON.parse(saved);
    return {
      id: parsed?.id || '',
      nome: parsed?.nome || 'Usuário',
      role: parsed?.role || 'BLOQUEADO',
      avatar: parsed?.avatar || parsed?.foto_perfil || null,
      solicitouDesbloqueio: !!parsed?.solicitouDesbloqueio
    };
  } catch (e) {
    return { nome: 'Usuário', role: 'BLOQUEADO', solicitouDesbloqueio: false };
  }
};

export default function MainLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getSafeUser());
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [isRequestingUnblock, setIsRequestingUnblock] = useState(false);
  
  const [editName, setEditName] = useState(user.nome);
  const [editAvatar, setEditAvatar] = useState(user.avatar || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const userMenuRef = useRef(null);

  // Monitora notificações apenas para o Criador (Owner)
  useEffect(() => {
    if (user?.role === 'OWNER') {
      const fetchPending = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/usuarios/pendentes`);
          if (res.ok) {
            const data = await res.json();
            setPendingUsersCount(data?.count || 0);
          }
        } catch (e) { console.error("Erro na sincronização de bloqueios:", e); }
      };
      fetchPending();
      const interval = setInterval(fetchPending, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.role]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setIsMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('analyiz_token');
    localStorage.removeItem('analyiz_user');
    navigate('/login');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditAvatar(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, nome: editName, avatar: editAvatar })
      });
      const data = await res.json();
      if (res.ok && data?.user) {
        const updated = { ...data.user, role: data.user.role || 'BLOQUEADO' };
        setUser(updated);
        localStorage.setItem('analyiz_user', JSON.stringify(updated));
        setIsProfileModalOpen(false);
      }
    } catch (error) { console.error("Falha ao atualizar perfil:", error); } 
    finally { setIsSavingProfile(false); }
  };

  const handleRequestUnblock = async () => {
    if (!user?.id) return;
    setIsRequestingUnblock(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios/request-unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id })
      });
      if (res.ok) {
        const updatedUser = { ...user, solicitouDesbloqueio: true };
        setUser(updatedUser);
        localStorage.setItem('analyiz_user', JSON.stringify(updatedUser));
      }
    } catch (e) { console.error("Erro no pedido de acesso:", e); } 
    finally { setIsRequestingUnblock(false); }
  };

  // Trava de segurança para exibição do nome e cargo
  const primeiroNome = String(user?.nome || 'Admin').split(' ')[0];
  const labelCargo = ROLE_LABELS[user?.role] || 'Membro';

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex flex-col font-sans text-slate-900 overflow-hidden relative">
      
      {/* HEADER GLOBAL - COMPACTADO */}
      <header className="bg-[#1e293b] border-b border-slate-700 px-4 py-2.5 shadow-md shrink-0 z-30 relative text-white">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-md"><Activity className="w-5 h-5" /></div>
            <div>
              <h1 className="text-base font-black uppercase italic tracking-tighter leading-tight">IA Analyiz</h1>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Dashboard Global</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 relative">
            {/* NOTIFICAÇÃO DO CRIADOR (OWNER) */}
            {user?.role === 'OWNER' && pendingUsersCount > 0 && (
              <button onClick={() => navigate('/usuarios')} className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-full text-[9px] font-black uppercase animate-pulse">
                <Bell className="w-3 h-3" /> Bloqueios ({pendingUsersCount})
              </button>
            )}

            {/* BOTÃO DE SOLICITAR ACESSO (BLOQUEADO) */}
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
            
            {/* MENU PERFIL */}
            <div className="relative" ref={userMenuRef}>
              <div 
                className="flex items-center gap-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 px-2 py-1 rounded-full cursor-pointer transition-all" 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <div className="flex flex-col text-right hidden sm:flex">
                  <span className="text-[10px] font-bold leading-none">{primeiroNome}</span>
                  <span className={`text-[7px] font-black uppercase tracking-widest mt-0.5 ${user.role === 'BLOQUEADO' ? 'text-red-400' : 'text-blue-400'}`}>{labelCargo}</span>
                </div>
                <div className="h-7 w-7 bg-slate-900 rounded-full flex items-center justify-center overflow-hidden border border-slate-600">
                  {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : <User className="text-blue-400 w-4 h-4" />}
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400" />
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

      {/* CONTEÚDO DINÂMICO */}
      <div className="flex-1 overflow-y-auto relative z-10 flex flex-col">
        <ErrorBoundary>
          {user?.role === 'BLOQUEADO' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
              <div className="bg-red-500/10 p-5 rounded-full mb-5 border border-red-500/20 shadow-inner"><Lock className="w-12 h-12 text-red-500" /></div>
              <h2 className="text-2xl font-black text-slate-800 mb-3">Acesso Restrito</h2>
              <p className="text-slate-500 text-xs max-w-xs leading-relaxed">O seu acesso ainda não foi autorizado. Clique em "Solicitar Acesso" no menu superior para análise do Criador.</p>
            </div>
          ) : (
            <Outlet />
          )}
        </ErrorBoundary>
      </div>

      {/* IA ANALYIZ - SEMPRE PRESENTE */}
      <ErrorBoundary>
        <IaAnalyizChat 
          isChatOpen={isChatOpen} 
          toggleChat={() => setIsChatOpen(!isChatOpen)} 
          userRole={user?.role} 
        />
      </ErrorBoundary>

      {/* MODAL DE PERFIL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200">
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
              <h3 className="font-black text-xs uppercase tracking-widest">Ajustes de Conta</h3>
              <button onClick={() => setIsProfileModalOpen(false)} className="hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center gap-3">
                <div className="relative group cursor-pointer w-24 h-24 rounded-full overflow-hidden border-4 border-slate-100 shadow-md flex items-center justify-center bg-slate-50">
                  {editAvatar ? <img src={editAvatar} alt="Preview" className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-slate-300" />}
                  <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="w-6 h-6 text-white" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alterar Imagem</span>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Nome Completo</label>
                <input 
                  type="text" value={editName} onChange={(e) => setEditName(e.target.value)} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <button 
                onClick={handleSaveProfile} disabled={isSavingProfile}
                className="w-full bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest py-3.5 rounded-xl hover:bg-blue-700 transition-all flex justify-center items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}