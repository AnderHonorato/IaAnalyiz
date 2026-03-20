import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Activity, User, LogOut, Camera, Save, X, Loader2, ChevronDown } from 'lucide-react';
import IaAnalyizChat from '../components/IaAnalyizChat';

const API_BASE_URL = 'http://localhost:3000';

export default function MainLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('analyiz_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      setEditName(parsed.nome);
      setEditAvatar(parsed.avatar || "");
    }
  }, []);

  // Controla o fechamento do menu do usuário ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
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
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditAvatar(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, nome: editName, avatar: editAvatar })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        localStorage.setItem('analyiz_user', JSON.stringify(data.user));
        setIsProfileModalOpen(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex flex-col font-sans text-slate-900 overflow-hidden relative">
      
      {/* HEADER GLOBAL COMPACTO */}
      <header className="bg-[#1e293b] border-b border-slate-700 px-6 py-3 shadow-md shrink-0 z-30 relative">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center text-white">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-md"><Activity className="w-5 h-5" /></div>
            <div>
              <h1 className="text-lg font-black uppercase italic tracking-tighter leading-tight">IA Analyiz</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Dashboard Global</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 relative">
            
            {/* BOTÃO E MENU DE PERFIL */}
            <div className="relative" ref={userMenuRef}>
              <div 
                className="flex items-center gap-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 px-2.5 py-1.5 rounded-full cursor-pointer transition-all shadow-inner"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <div className="flex flex-col text-right hidden sm:flex">
                  <span className="text-[11px] font-bold text-white leading-none">{user?.nome?.split(' ')[0]}</span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-blue-400 mt-0.5">Admin</span>
                </div>
                <div className="h-7 w-7 bg-slate-900 rounded-full flex items-center justify-center overflow-hidden border border-slate-600 shrink-0">
                  {user?.avatar ? <img src={user.avatar} alt="Perfil" className="w-full h-full object-cover" /> : <User className="text-blue-400 w-4 h-4" />}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </div>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-[100] overflow-hidden">
                  <button onClick={() => { setIsProfileModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 text-xs font-bold text-slate-700 border-b border-slate-100 transition-colors text-left">
                    <User className="w-4 h-4 text-blue-600" /> Editar Perfil
                  </button>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-red-50 text-xs font-bold text-red-600 transition-colors text-left">
                    <LogOut className="w-4 h-4" /> Sair do Sistema
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO DINÂMICA (Páginas) */}
      <div className="flex-1 overflow-y-auto relative z-10">
        <Outlet />
      </div>

      {/* O CHAT FLUTUANTE SEMPRE PRESENTE */}
      <IaAnalyizChat isChatOpen={isChatOpen} toggleChat={() => setIsChatOpen(!isChatOpen)} />

      {/* MODAL DE EDIÇÃO DE PERFIL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
              <h3 className="font-black text-xs uppercase tracking-widest">Configurações de Conta</h3>
              <button onClick={() => setIsProfileModalOpen(false)} className="hover:bg-slate-800 p-1 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="p-5 space-y-5">
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="relative group cursor-pointer">
                  <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-slate-100 shadow-sm bg-slate-50 flex items-center justify-center">
                    {editAvatar ? <img src={editAvatar} alt="Preview" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-slate-300" />}
                  </div>
                  <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="w-5 h-5 text-white" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Alterar Foto</p>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Nome de Exibição</label>
                <input 
                  type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              <button 
                onClick={handleSaveProfile} disabled={isSavingProfile}
                className="w-full bg-blue-600 text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl hover:bg-blue-700 transition-all flex justify-center items-center gap-2 shadow-md"
              >
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4"/> Salvar Alterações</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}