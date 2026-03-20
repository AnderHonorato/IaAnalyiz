import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, 
  Bot, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box, Search, Activity
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function App() {
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState('bot');

  // --- IA ENGINE STATES ---
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('IDLE');
  const [logs, setLogs] = useState([{ msg: 'SISTEMA INICIALIZADO: Aguardando comando de varredura...', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  const [carregandoDiv, setCarregandoDiv] = useState(false);
  const terminalRef = useRef(null);

  // --- DATABASE STATES ---
  const [produtos, setProdutos] = useState([]);
  const [formProd, setFormProd] = useState({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
  const [loadingProd, setLoadingProd] = useState(false);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    buscarDivergencias();
    buscarProdutos();
  }, []);

  const buscarDivergencias = async () => {
    setCarregandoDiv(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/divergencias`);
      setDivergencias(await res.json());
    } catch (e) { console.error(e); } finally { setCarregandoDiv(false); }
  };

  const iniciarBot = () => {
    setIsBotRunning(true); 
    setProgress(0); 
    setLogs([]); 
    setTimeLeft('CALCULANDO...');
    
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.msg) {
        setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
      }
      
      if (data.type === 'progress') { 
        setProgress(data.percent); 
        setTimeLeft(data.timeLeft); 
      }
      
      if (data.type === 'done') {
        setProgress(100); 
        setTimeLeft('CONCLUÍDO'); 
        setIsBotRunning(false);
        eventSource.close(); 
        buscarDivergencias();
      }
    };

    eventSource.onerror = () => {
      setLogs(prev => [...prev, { msg: 'CRITICAL ERROR: Falha na comunicação com o Kernel da API.', type: 'error' }]);
      setIsBotRunning(false); 
      eventSource.close();
    };
  };

  const buscarProdutos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/produtos`);
      setProdutos(await res.json());
    } catch (e) { console.error("Database Error", e); }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setLoadingProd(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formProd)
      });
      if (res.ok) {
        setFormProd({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
        buscarProdutos();
      }
    } catch (e) { console.error(e); } 
    finally { setLoadingProd(false); }
  };

  const getLogStyle = (type) => {
    switch(type) { 
      case 'info': return 'text-slate-400 italic'; 
      case 'warn': return 'text-amber-500 font-bold border-l-2 border-amber-500 pl-2 my-1'; 
      case 'error': return 'text-red-500 font-bold bg-red-50 p-1'; 
      case 'success': return 'text-emerald-600 font-bold'; 
      default: return 'text-slate-600'; 
    }
  };

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden" style={{ zoom: zoom }}>
      
      {/* HEADER IA CORPORATE */}
      <header className="bg-[#1e293b] border-b border-slate-700 p-4 shadow-xl shrink-0 z-20">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-inner"><Activity className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white uppercase italic">Neural ML Bot <span className="text-blue-400">v3.0</span></h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sistemas Ativos // Latência: 24ms</p>
              </div>
            </div>
          </div>
          
          <nav className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setActiveTab('bot')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 ${activeTab === 'bot' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
              <Terminal className="w-4 h-4" /> Scanner
            </button>
            <button onClick={() => setActiveTab('produtos')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 ${activeTab === 'produtos' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
              <Box className="w-4 h-4" /> Database
            </button>
          </nav>
          
          <div className="flex items-center gap-6">
             <div className="hidden md:flex flex-col text-right">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Auth User</span>
                <span className="text-sm text-white font-semibold">Master_Admin</span>
             </div>
             <div className="h-10 w-10 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center">
                <User className="text-blue-400 w-5 h-5" />
             </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col p-6 w-full max-w-7xl mx-auto h-full min-h-0">
        
        {activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
            {/* TERMINAL IA */}
            <section className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center font-bold text-[11px] text-slate-500 tracking-tighter uppercase">
                <span>Kernel_Output_Stream</span>
                <span className="text-blue-600">Encrypted_Link</span>
              </div>
              
              <div className="p-5 flex flex-col flex-1 min-h-0">
                <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-4 rounded-lg font-black text-xs uppercase tracking-widest transition-all mb-4 ${isBotRunning ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 active:scale-95'}`}>
                  {isBotRunning ? 'Processando Heurística...' : 'Executar Protocolo de Busca'}
                </button>

                <div className="bg-slate-900 rounded-lg p-4 mb-4 border border-slate-800 shadow-inner">
                  <div className="flex justify-between text-[10px] font-black text-blue-400 uppercase mb-2">
                    <span>Task_Progress</span>
                    <span>ETA: {timeLeft}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6] transition-all duration-700" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar border border-slate-800 flex flex-col gap-2">
                  {logs.map((log, i) => (
                    <div key={i} className={`leading-relaxed ${getLogStyle(log.type)}`}>
                      <span className="text-slate-700 mr-2">[{new Date().toLocaleTimeString()}]</span>
                      {log.msg}
                    </div>
                  ))}
                  {isBotRunning && <div className="text-blue-400 animate-pulse">_ EXECUNTANDO ANÁLISE...</div>}
                </div>
              </div>
            </section>

            {/* DIVERGÊNCIAS TABELA */}
            <section className="col-span-3 flex flex-col h-full gap-4 min-h-0">
              <div className="bg-white border border-slate-200 rounded-xl shadow-xl flex-1 flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="font-black text-sm uppercase tracking-tighter flex items-center gap-2">
                    <AlertTriangle className="text-amber-500 w-5 h-5" /> 
                    Inconsistências Logísticas Detectadas
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Live_Database</span>
                    <button onClick={buscarDivergencias} className="p-2 hover:bg-slate-100 rounded-lg transition-all text-blue-600"><RefreshCw className={`w-4 h-4 ${carregandoDiv ? 'animate-spin' : ''}`} /></button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 uppercase text-[10px] font-black text-slate-500">
                      <tr>
                        <th className="py-4 px-6">Registro_ML</th>
                        <th className="py-4 px-6">Diagnóstico_IA</th>
                        <th className="py-4 px-6 w-20">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {divergencias.length === 0 ? (
                        <tr><td colSpan="3" className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest opacity-30">Scan_Clean: Nenhuma anomalia</td></tr>
                      ) : divergencias.map((div) => (
                        <tr key={div.id} className="hover:bg-blue-50/30 transition-all group">
                          <td className="py-4 px-6 font-bold text-blue-600 tracking-tighter">{div.mlItemId}</td>
                          <td className="py-4 px-6 text-slate-700 font-medium italic">"{div.motivo}"</td>
                          <td className="py-4 px-6 text-right">
                            <a href={div.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-black uppercase text-[10px] text-blue-600 hover:text-blue-800 transition-colors">
                              Corrigir <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </main>
        ) : (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
             {/* O formulário de cadastro e a lista de produtos seguem o mesmo estilo de cartões brancos e bordas Slate */}
             {/* Implementação idêntica ao visual anterior, mas com tipografia Heavy para botões e labels */}
             <section className="col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xl overflow-y-auto custom-scrollbar">
                <h2 className="font-black text-sm uppercase tracking-tighter mb-6 flex items-center gap-2">
                  <Plus className="text-blue-600 w-5 h-5" /> Inserção de Dados
                </h2>
                <form onSubmit={handleCreateProduct} className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase">SKU_ID</label>
                        <input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase">ML_Reference</label>
                        <input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                      </div>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase">Product_Identity</label>
                      <input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                   </div>
                   <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <input type="checkbox" id="ekit" checked={formProd.eKit} onChange={e => setFormProd({...formProd, eKit: e.target.checked})} className="w-5 h-5 rounded accent-blue-600" />
                      <label htmlFor="ekit" className="text-[11px] font-black text-slate-600 uppercase cursor-pointer">Definir como Objeto Composto (KIT)</label>
                   </div>
                   <button disabled={loadingProd} type="submit" className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-[0.2em] rounded-lg hover:bg-black transition-all">
                      {loadingProd ? 'Sincronizando...' : 'Confirmar Write_Operation'}
                   </button>
                </form>
             </section>

             <section className="col-span-3 bg-white border border-slate-200 rounded-xl p-6 shadow-xl overflow-hidden flex flex-col h-full">
                <h2 className="font-black text-sm uppercase tracking-tighter mb-6 flex items-center gap-2">
                  <Box className="text-blue-600 w-5 h-5" /> Local_Registry
                </h2>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                  {produtos.map(prod => (
                    <div key={prod.id} className="border border-slate-100 p-4 rounded-xl flex justify-between items-center hover:bg-slate-50 transition-all group">
                       <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter">{prod.sku}</span>
                            {prod.eKit && <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase">COMPOSITE</span>}
                          </div>
                          <h3 className="text-sm font-bold text-slate-800 mt-2">{prod.nome}</h3>
                       </div>
                       <div className="text-right">
                          <span className="block text-[10px] font-black text-slate-400 uppercase italic">Weight_Verified</span>
                          <span className="text-sm font-bold text-slate-700">{prod.pesoGramas}g</span>
                       </div>
                    </div>
                  ))}
                </div>
             </section>
          </main>
        )}
      </div>
      
      {/* STATUS BAR IA */}
      <footer className="bg-white border-t border-slate-200 p-2 px-6 shrink-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">
          <div className="flex items-center gap-4">
             <span>System: Operational</span>
             <span className="text-blue-500">Kernel: Node.js 22.14</span>
          </div>
          <div>© 2026 Neural ML Logistics Engine // All Rights Reserved</div>
        </div>
      </footer>
    </div>
  );
}