import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ShoppingBag, ShoppingCart, Box, ChevronRight, Sparkles } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('analyiz_user') || '{}');

  const platforms = [
    { id: 'ml', name: 'Mercado Livre', icon: ShoppingBag, color: 'text-[#FFE600]', bg: 'bg-[#FFE600]/10', border: 'border-[#FFE600]/20', route: '/ml', desc: 'Gerenciador de Kits e Pesos' },
    { id: 'shopee', name: 'Shopee', icon: ShoppingCart, color: 'text-[#EE4D2D]', bg: 'bg-[#EE4D2D]/10', border: 'border-[#EE4D2D]/20', route: '/shopee', desc: 'Logística de Shopee Xpress' },
    { id: 'amazon', name: 'Amazon', icon: Box, color: 'text-[#FF9900]', bg: 'bg-[#FF9900]/10', border: 'border-[#FF9900]/20', route: '/amazon', desc: 'FBA e Seller Central' }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-6 lg:p-10 space-y-8 animate-in fade-in duration-500">
      
      {/* BOAS VINDAS */}
      <div className="bg-[#1e293b] rounded-3xl p-8 lg:p-10 shadow-2xl border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none translate-x-1/3 -translate-y-1/3"></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-white mb-2">Bem-vindo de volta, {user.nome?.split(' ')[0]}!</h2>
          <p className="text-slate-400 font-medium max-w-2xl leading-relaxed">
            Seu centro de comando unificado está operante. A <strong className="text-blue-400">IA Analyiz</strong> está monitorando todos os seus canais em segundo plano. Escolha um canal abaixo para realizar auditorias específicas.
          </p>
        </div>
      </div>

      {/* SELEÇÃO DE CANAIS */}
      <div>
        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Canais Integrados
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {platforms.map((plat) => (
            <div 
              key={plat.id}
              onClick={() => navigate(plat.route)}
              className={`bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border-2 border-transparent hover:${plat.border} transition-all duration-300 cursor-pointer group flex flex-col`}
            >
              <div className="flex justify-between items-start mb-6">
                <div className={`p-4 rounded-2xl ${plat.bg} ${plat.color} shadow-sm transition-transform group-hover:scale-110 duration-300`}>
                  <plat.icon className="w-8 h-8" />
                </div>
                <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
              <h4 className="text-xl font-black text-slate-800 mb-2">{plat.name}</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed flex-1">{plat.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MENSAGEM DA IA */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-6 shadow-xl flex items-center gap-6 text-white overflow-hidden relative">
        <Sparkles className="w-12 h-12 text-blue-300 opacity-50 shrink-0" />
        <div>
          <h4 className="font-black text-sm uppercase tracking-widest mb-1">Dica do Sistema</h4>
          <p className="text-sm font-medium text-blue-100">Abra o chat flutuante no canto inferior direito a qualquer momento para cruzar informações de prejuízos de frete entre o Mercado Livre e a Shopee.</p>
        </div>
      </div>

    </div>
  );
}