import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Scale, DollarSign, MessageCircle, ChevronRight, Activity } from 'lucide-react';

export default function MLDashboard() {
  const navigate = useNavigate();

  const ferramentas = [
    { 
      id: 'pesos', 
      title: 'Auditoria de Pesos e Medidas', 
      desc: 'Detecta divergências de frete e vincula kits base.', 
      icon: Scale, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50', 
      border: 'border-blue-200', 
      route: '/ml/auditoria' 
    },
    { 
      id: 'precos', 
      title: 'Precificação Inteligente (Breve)', 
      desc: 'Altere preços em massa baseado no custo.', 
      icon: DollarSign, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50', 
      border: 'border-emerald-200', 
      route: '#' 
    },
    { 
      id: 'sac', 
      title: 'SAC Automático via IA (Breve)', 
      desc: 'Responde perguntas de compradores.', 
      icon: MessageCircle, 
      color: 'text-amber-600', 
      bg: 'bg-amber-50', 
      border: 'border-amber-200', 
      route: '#' 
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-4 lg:p-6 space-y-6 animate-in fade-in duration-500">
      <div className="bg-[#FFE600] rounded-3xl p-6 lg:p-8 shadow-md border border-yellow-400 relative overflow-hidden text-slate-900">
        <div className="relative z-10 flex items-center gap-4">
          <div className="p-3 bg-white rounded-2xl shadow-sm"><ShoppingBag className="w-8 h-8 text-slate-900" /></div>
          <div>
            <h2 className="text-3xl font-black mb-1">Central Mercado Livre</h2>
            <p className="text-slate-700 font-semibold text-xs leading-relaxed">
              Escolha a ferramenta que deseja gerenciar na sua conta.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 pl-2">
          <Activity className="w-3.5 h-3.5" /> Ferramentas Disponíveis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ferramentas.map((tool) => (
            <div 
              key={tool.id} 
              onClick={() => tool.route !== '#' && navigate(tool.route)} 
              className={`bg-white p-5 rounded-3xl shadow-sm border border-slate-200 transition-all ${tool.route !== '#' ? 'hover:border-blue-400 hover:shadow-lg cursor-pointer group' : 'opacity-60 cursor-not-allowed'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3.5 rounded-2xl ${tool.bg} ${tool.color} shadow-sm group-hover:scale-110 transition-transform`}>
                  <tool.icon className="w-6 h-6" />
                </div>
                {tool.route !== '#' && (
                  <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                )}
                {tool.route === '#' && <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-1 rounded">Em Breve</span>}
              </div>
              <h4 className="text-[14px] font-black text-slate-800 mb-1.5 leading-tight">{tool.title}</h4>
              <p className="text-[11px] font-semibold text-slate-500 leading-relaxed flex-1">{tool.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}