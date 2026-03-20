import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Plus, Box, ExternalLink, ShoppingBag } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function MercadoLivre() {
  const [activeTab, setActiveTab] = useState('bot'); 
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([{ msg: 'KERNEL_ML_READY: Auditoria conectada.', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  
  const [produtos, setProdutos] = useState([]);
  const [formProd, setFormProd] = useState({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false, plataforma: 'Mercado Livre' });
  const [loadingProd, setLoadingProd] = useState(false);
  const terminalRef = useRef(null);

  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [logs]);
  useEffect(() => { buscarDivergencias(); buscarProdutos(); }, []);

  const buscarDivergencias = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/divergencias`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDivergencias(data.filter(d => d.plataforma === 'Mercado Livre' || !d.plataforma));
      }
    } catch (e) { console.error(e); }
  };

  const buscarProdutos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/produtos`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProdutos(data.filter(p => p.plataforma === 'Mercado Livre' || !p.plataforma));
      }
    } catch (e) { console.error(e); }
  };

  const iniciarBot = () => {
    setIsBotRunning(true); setProgress(0); setLogs([]); 
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.msg) setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
      if (data.type === 'progress') setProgress(data.percent);
      if (data.type === 'done') { setIsBotRunning(false); eventSource.close(); buscarDivergencias(); }
    };
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setLoadingProd(true);
    try {
      await fetch(`${API_BASE_URL}/api/produtos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formProd)
      });
      setFormProd({ ...formProd, sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
      buscarProdutos();
    } finally { setLoadingProd(false); }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 h-full flex flex-col animate-in fade-in duration-500">
      
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
          <div className="bg-[#FFE600] p-1.5 rounded-lg shadow-sm"><ShoppingBag className="w-4 h-4 text-slate-900" /></div>
          Gestão Mercado Livre
        </h2>
        <nav className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          <button onClick={() => setActiveTab('bot')} className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all ${activeTab === 'bot' ? 'bg-[#FFE600] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>Scanner</button>
          <button onClick={() => setActiveTab('produtos')} className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all ${activeTab === 'produtos' ? 'bg-[#FFE600] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>Catálogo</button>
        </nav>
      </div>

      {activeTab === 'bot' ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-4 flex flex-col flex-1 min-h-0">
              <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest mb-3 transition-all ${isBotRunning ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700'}`}>
                {isBotRunning ? 'SINCRONIZANDO API ML...' : 'EXECUTAR PROTOCOLO'}
              </button>
              <div className="bg-slate-900 rounded-xl p-3 mb-3 border border-slate-800">
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
              <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar flex flex-col gap-2">
                {logs.map((log, i) => (<div key={i} className={log.type === 'warn' ? 'text-amber-500' : log.type === 'success' ? 'text-emerald-500' : 'text-slate-400'}><span className="mr-2 text-slate-600">[{new Date().toLocaleTimeString()}]</span>{log.msg}</div>))}
              </div>
            </div>
          </section>

          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-100 font-black text-[11px] uppercase text-slate-400 flex justify-between items-center"><span className="flex items-center gap-2"><AlertTriangle className="text-amber-500 w-4 h-4" /> Inconsistências de Frete ML</span></div>
              <div className="flex-1 overflow-y-auto p-1">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-50 text-[11px] font-medium">
                    {divergencias.length === 0 ? (<tr><td className="py-12 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Scan Clean</td></tr>) : divergencias.map((div) => (
                      <tr key={div.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-blue-600 whitespace-nowrap">{div.mlItemId}</td><td className="py-3 px-4 text-slate-600 italic">"{div.motivo}"</td>
                        <td className="py-3 px-4 text-right">
                          {div.link && div.link !== "N/A" && (
                            <a href={div.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-bold uppercase text-[9px] transition-colors whitespace-nowrap">
                              Corrigir <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-lg overflow-y-auto custom-scrollbar">
            <h2 className="font-black text-xs uppercase mb-5 flex items-center gap-2 text-blue-600"><Plus className="w-4 h-4"/> Inserção de Dados ML</h2>
            <form onSubmit={handleCreateProduct} className="space-y-4 text-[11px] font-semibold text-slate-600">
               <div className="grid grid-cols-2 gap-3">
                  <div><label className="uppercase tracking-wider block mb-1">SKU_ID</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 transition-colors" /></div>
                  <div><label className="uppercase tracking-wider block mb-1">ID ML (MLB...)</label><input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 transition-colors" /></div>
               </div>
               <div><label className="uppercase tracking-wider block mb-1">Título do Anúncio</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 transition-colors" /></div>
               <div className="grid grid-cols-2 gap-3">
                  <div><label className="uppercase tracking-wider block mb-1">Price (R$)</label><input required type="number" step="0.01" value={formProd.preco} onChange={e => setFormProd({...formProd, preco: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 transition-colors" /></div>
                  <div><label className="uppercase tracking-wider block mb-1">Weight Real (g)</label><input required type="number" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 transition-colors" /></div>
               </div>
               <div className="flex items-center gap-3 p-3.5 bg-blue-50/50 rounded-xl border border-dashed border-blue-200">
                  <input type="checkbox" id="ekit" checked={formProd.eKit} onChange={e => setFormProd({...formProd, eKit: e.target.checked})} className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
                  <label htmlFor="ekit" className="text-[10px] font-black text-blue-800 uppercase tracking-widest cursor-pointer">Anúncio do Tipo KIT</label>
               </div>
               <button disabled={loadingProd} type="submit" className="w-full py-3 mt-2 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-lg hover:bg-black transition-all shadow-md">Registrar no Banco</button>
            </form>
          </section>
          
          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl p-5 shadow-lg overflow-hidden flex flex-col h-full">
            <h2 className="font-black text-xs uppercase mb-4 text-slate-800 flex items-center gap-2"><Box className="w-4 h-4 text-blue-600"/> Base Interna de Pesos</h2>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-2">
              {produtos.map(prod => (
                <div key={prod.id} className="border border-slate-100 p-3.5 rounded-xl flex justify-between items-center hover:bg-slate-50 transition-colors shadow-sm">
                   <div>
                      <div className="flex items-center gap-2 mb-1"><span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">{prod.sku}</span>{prod.eKit && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">KIT</span>}</div>
                      <h3 className="text-xs font-bold text-slate-700">{prod.nome}</h3>
                   </div>
                   <div className="text-right"><span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Medição</span><span className="text-sm font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-md">{prod.pesoGramas}g</span></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}