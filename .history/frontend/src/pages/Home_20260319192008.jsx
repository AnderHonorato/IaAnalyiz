import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ShoppingBag, ShoppingCart, Box, ChevronRight } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('analyiz_user') || '{}');
  
  // Trava de segurança contra objeto nulo na memória
  const primeiroNome = user?.nome ? user.nome.split(' ')[0] : 'Admin';

  const platforms = [
    { id: 'ml', name: 'Mercado Livre', icon: ShoppingBag, color: 'text-[#FFE600]', bg: 'bg-[#FFE600]/10', border: 'border-[#FFE600]/20', route: '/ml', desc: 'Gerenciador de Kits e Pesos' },
    { id: 'shopee', name: 'Shopee', icon: ShoppingCart, color: 'text-[#EE4D2D]', bg: 'bg-[#EE4D2D]/10', border: 'border-[#EE4D2D]/20', route: '/shopee', desc: 'Logística de Shopee Xpress' },
    { id: 'amazon', name: 'Amazon', icon: Box, color: 'text-[#FF9900]', bg: 'bg-[#FF9900]/10', border: 'border-[#FF9900]/20', route: '/amazon', desc: 'FBA e Seller Central' }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-4 lg:p-6 space-y-6 animate-in fade-in duration-500">
      
      {/* BOAS VINDAS COMPACTADO */}
      <div className="bg-[#1e293b] rounded-2xl p-6 lg:p-8 shadow-xl border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[80px] pointer-events-none translate-x-1/3 -translate-y-1/3"></div>
        <div className="relative z-10">
          <h2 className="text-2xl font-black text-white mb-2">Bem-vindo de volta, {primeiroNome}!</h2>
          <p className="text-slate-400 font-medium text-sm max-w-2xl leading-relaxed">
            Seu centro de comando unificado está operante. A <strong className="text-blue-400">IA Analyiz</strong> está monitorando todos os seus canais em segundo plano. Escolha um canal abaixo para realizar auditorias específicas.
          </p>
        </div>
      </div>

      {/* SELEÇÃO DE CANAIS COMPACTADA */}
      <div>
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> Canais Integrados
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {platforms.map((plat) => (
            <div 
              key={plat.id}
              onClick={() => navigate(plat.route)}
              className={`bg-white p-5 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 hover:${plat.border} transition-all duration-300 cursor-pointer group flex flex-col`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${plat.bg} ${plat.color} shadow-sm transition-transform group-hover:scale-110 duration-300`}>
                  <plat.icon className="w-6 h-6" />
                </div>
                <div className="h-7 w-7 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-1">{plat.name}</h4>
              <p className="text-[11px] font-semibold text-slate-500 leading-relaxed flex-1">{plat.desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}