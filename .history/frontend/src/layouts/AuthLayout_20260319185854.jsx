import React from 'react';
import { Activity, Box, Sparkles, ShieldCheck } from 'lucide-react';

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen w-full bg-[#0f172a] flex font-sans">
      {/* LADO ESQUERDO: INFORMAÇÕES E BOAS VINDAS (Oculto no Mobile) */}
      <div className="hidden lg:flex flex-col justify-center w-1/2 p-16 bg-slate-950 border-r border-slate-800 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-4 mb-10">
            <div className="bg-blue-600 p-3.5 rounded-2xl shadow-lg shadow-blue-900/50"><Activity className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-4xl font-black text-white italic tracking-tighter leading-none">IA Analyiz</h1>
              <p className="text-blue-400 font-bold uppercase tracking-widest text-xs mt-1">Core Systems</p>
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white mb-8 leading-tight">
            Auditoria logística inteligente para seu e-commerce.
          </h2>
          
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-blue-400 mt-1 shadow-sm"><Box className="w-5 h-5" /></div>
              <div>
                <h3 className="text-white font-bold mb-1.5 text-lg">Integração Multi-Canal</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Sincronize Mercado Livre, Shopee e Amazon. Escaneie todo o seu catálogo em busca de divergências de peso que causam prejuízos no frete.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-emerald-400 mt-1 shadow-sm"><Sparkles className="w-5 h-5" /></div>
              <div>
                <h3 className="text-white font-bold mb-1.5 text-lg">Assistente Neural IA</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Converse em tempo real com a inteligência artificial. Ela acessa seu banco de dados e gera relatórios instantâneos sobre os erros e saúde da conta.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-amber-400 mt-1 shadow-sm"><ShieldCheck className="w-5 h-5" /></div>
              <div>
                <h3 className="text-white font-bold mb-1.5 text-lg">Ambiente Seguro</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Seus dados e credenciais de API ficam protegidos em um Kernel próprio com criptografia de ponta a ponta.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LADO DIREITO: FORMULÁRIOS QUE SERÃO INJETADOS */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="bg-[#1e293b] p-8 sm:p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-700 relative z-10">
          <div className="lg:hidden flex flex-col items-center justify-center mb-8">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg mb-4"><Activity className="w-6 h-6 text-white" /></div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter">IA Analyiz</h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}