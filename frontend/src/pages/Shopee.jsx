import React from 'react';
import { Activity, ShoppingCart } from 'lucide-react';

export default function Shopee() {
  return (
    <div className="h-full flex items-center justify-center flex-col text-slate-400 animate-in fade-in duration-500">
      <div className="bg-[#EE4D2D]/10 p-6 rounded-full mb-6"><ShoppingCart className="w-16 h-16 text-[#EE4D2D] opacity-80" /></div>
      <h2 className="text-2xl font-black uppercase tracking-widest text-slate-700 mb-2">Módulo Shopee</h2>
      <p className="text-sm font-medium text-slate-500">A API da Shopee Xpress está em desenvolvimento e será conectada em breve na IA Analyiz.</p>
    </div>
  );
}