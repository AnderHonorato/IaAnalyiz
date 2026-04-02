/**
 * frontend/src/pages/Amazon.jsx
 * 
 * Propósito:
 * Módulo de integração Amazon FBA/Seller Central (Em Desenvolvimento).
 * Placeholder para funcionalidades futuras de venda na Amazon.
 * 
 * Responsabilidades (Futuro):
 * - Sincronizar com Seller Central
 * - Gerenciar vendas FBA
 * - Acompanhamento de ordens
 * 
 * Status: EM DESENVOLVIMENTO
 * A integração FBA/Seller Central será conectada na IA Analyiz em breve.
 * 
 * @author Anderson Honorato
 * @version 0.1.0 (Placeholder)
 */

import React from 'react';
import { Box } from 'lucide-react';

export default function Amazon() {
  return (
    <div className="h-full flex items-center justify-center flex-col text-slate-400 animate-in fade-in duration-500">
      <div className="bg-[#FF9900]/10 p-6 rounded-full mb-6"><Box className="w-16 h-16 text-[#FF9900] opacity-80" /></div>
      <h2 className="text-2xl font-black uppercase tracking-widest text-slate-700 mb-2">Módulo Amazon</h2>
      <p className="text-sm font-medium text-slate-500">A integração FBA/Seller Central está em desenvolvimento e será conectada em breve na IA Analyiz.</p>
    </div>
  );
}