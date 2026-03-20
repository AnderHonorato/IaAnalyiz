import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, 
  Activity, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box, Search,
  ShoppingBag, ShoppingCart, ChevronDown
} from 'lucide-react';
import IaAnalyizChat from './components/IaAnalyizChat';

const API_BASE_URL = 'http://localhost:3000';

export default function App() {
  const [zoom, setZoom] = useState(1);
  const [activeMarketplace, setActiveMarketplace] = useState('ml');
  const [activeTab, setActiveTab] = useState('bot'); 
  
  const [isPlatformMenuOpen, setIsPlatformMenuOpen] = useState(false);
  const platformMenuRef = useRef(null);

  // Estado para controlar a visibilidade do chat importado
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('IDLE');
  const [logs, setLogs] = useState([{ msg: 'KERNEL_READY: IA Analyiz inicializada com sucesso.', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  const [carregandoDiv, setCarregandoDiv] = useState(false);
  
  const [produtos, setProdutos] = useState([]);
  const [formProd, setFormProd] = useState({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
  const [loadingProd, setLoadingProd] = useState(false);

  const terminalRef = useRef(null);

  useEffect(() => {
    document.title = "IA Analyiz | Painel Multi-Canal";
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (platformMenuRef.current && !platformMenuRef.current.contains(event.target)) {
        setIsPlatformMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (activeMarketplace === 'ml') {
      buscarDivergencias();
      buscarProdutos();
    }
  }, [activeMarketplace]);

  const buscarDivergencias = async () => {
    setCarregandoDiv(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/divergencias`);
      setDivergencias(await res.json());
    } catch (e) { console.error(e); } finally { setCarregandoDiv(false); }
  };

  const iniciarBot = () => {
    setIsBotRunning(true); setProgress(0); setLogs([]); setTimeLeft('CALCULANDO...');
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.msg) setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
      if (data.type === 'progress') { setProgress(data.percent); setTimeLeft(data.timeLeft); }
      if (data.type === 'done') { setIsBotRunning(false); eventSource.close(); buscarDivergencias(); }
    };
  };

  const buscarProdutos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/produtos`);
      setProdutos(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setLoadingProd(true);
    try {
      await fetch(`${API_BASE_URL}/api/produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formProd)
      });
      setFormProd({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
      buscarProdutos();
    } finally { setLoadingProd(false); }
  };

  // Função que permite o Chat flutuante adicionar logs no Terminal da tela principal
  const handleIaLog = (msg, type) => {
    setLogs(prev => [...prev, { msg, type }]);
  };

  const handlePlatformEnter = () => setIsPlatformMenuOpen(true);
  const handlePlatformLeave = () => setIsPlatformMenuOpen(false);

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex flex-col font-sans text-slate-900 overflow-hidden relative" style={{ zoom: zoom }}>
      
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down { animation: slideDown 0.2s ease-out forwards; }
      `}</style>

      {/* HEADER FIXO CORPORATIVO COM DROPDOWN DE PLATAFORMAS */}
      <header className="bg-[#1e293b] border-b border-slate-700 p-4 shadow-xl shrink-0 z-30 relative">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center text-white">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><Activity className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-black uppercase italic tracking-tighter">IA Analyiz <span className="text-blue-400">Core</span></h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Painel Logístico Multi-Canal</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setActiveTab('bot')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'bot' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Scanner</button>
            <button onClick={() => setActiveTab('produtos')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'produtos' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Database</button>
          </nav>
          
          <div className="flex items-center gap-4">
            <div 
              className="relative" 
              ref={platformMenuRef}
              onMouseEnter={handlePlatformEnter}
              onMouseLeave={handlePlatformLeave}
            >
              <button 
                onClick={() => setIsPlatformMenuOpen(!isPlatformMenuOpen)}
                className={`flex items-center gap-2 border px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${isPlatformMenuOpen ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white'}`}
              >
                <span>Escolher Plataforma</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isPlatformMenuOpen ? 'rotate-180 text-blue-400' : 'opacity-50'}`} />
              </button>

              {isPlatformMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] overflow-hidden text-slate-700 animate-slide-down">
                  <div className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 border-b border-slate-100">
                    Selecione a Loja
                  </div>
                  <button onClick={() => { setActiveMarketplace('ml'); setIsPlatformMenuOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-xs font-bold text-left border-b border-slate-50">
                    <span className="flex items-center gap-3 text-slate-700"><ShoppingBag className={`w-4 h-4 ${activeMarketplace === 'ml' ? 'text-[#FFE600]' : 'text-slate-400'}`} /> Mercado Livre</span>
                    {activeMarketplace === 'ml' && <span className="w-2 h-2 bg-blue-500 rounded-full shadow-sm"></span>}
                  </button>
                  <button onClick={() => { setActiveMarketplace('shopee'); setIsPlatformMenuOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 hover:bg-orange-50 transition-colors text-xs font-bold text-left border-b border-slate-50">
                    <span className="flex items-center gap-3 text-slate-700"><ShoppingCart className={`w-4 h-4 ${activeMarketplace === 'shopee' ? 'text-[#EE4D2D]' : 'text-slate-400'}`} /> Shopee</span>
                    {activeMarketplace === 'shopee' && <span className="w-2 h-2 bg-blue-500 rounded-full shadow-sm"></span>}
                  </button>
                  <button onClick={() => { setActiveMarketplace('amazon'); setIsPlatformMenuOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 hover:bg-yellow-50 transition-colors text-xs font-bold text-left">
                    <span className="flex items-center gap-3 text-slate-700"><Box className={`w-4 h-4 ${activeMarketplace === 'amazon' ? 'text-[#FF9900]' : 'text-slate-400'}`} /> Amazon</span>
                    {activeMarketplace === 'amazon' && <span className="w-2 h-2 bg-blue-500 rounded-full shadow-sm"></span>}
                  </button>
                </div>
              )}
            </div>

            <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors shadow-inner">
              <User className="text-blue-400 w-5 h-5" />
            </div>
          </div>
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO */}
      <div className="flex-1 flex flex-col p-6 w-full max-w-7xl mx-auto h-full min-h-0 relative z-10">
        {activeMarketplace !== 'ml' ? (
           <div className="flex-1 flex items-center justify-center flex-col text-slate-400">
              <Activity className="w-16 h-16 mb-4 opacity-20 animate-pulse" />
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-300">Integração em Desenvolvimento</h2>
              <p className="text-sm font-medium mt-2">A API da {activeMarketplace === 'shopee' ? 'Shopee' : 'Amazon'} será conectada em breve na IA Analyiz.</p>
           </div>
        ) : activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
            <section className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="p-5 flex flex-col flex-1 min-h-0">
                <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-4 rounded-lg font-black text-xs uppercase tracking-widest mb-4 transition-all ${isBotRunning ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'}`}>
                  {isBotRunning ? 'SINCRONIZANDO API ML...' : 'EXECUTAR PROTOCOLO'}
                </button>
                <div className="bg-slate-900 rounded-lg p-4 mb-4 border border-slate-800">
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
                <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar border border-slate-800 flex flex-col gap-2">
                  {logs.map((log, i) => (
                    <div key={i} className={log.type === 'warn' ? 'text-amber-500 font-bold' : log.type === 'success' ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                      <span className="text-slate-700 mr-2">[{new Date().toLocaleTimeString()}]</span>{log.msg}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="col-span-3 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 font-black text-xs uppercase text-slate-400 flex justify-between items-center">
                  <span className="flex items-center gap-2"><AlertTriangle className="text-amber-500 w-4 h-4" /> Inconsistências Identificadas</span> 
                  <span className="opacity-50">API_Live_Data</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700 italic">
                      {divergencias.length === 0 ? (
                        <tr><td className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.3em]">Scan_Clean</td></tr>
                      ) : divergencias.map((div) => (
                        <tr key={div.id} className="hover:bg-blue-50/50 transition-all">
                          <td className="py-4 px-6 font-bold text-blue-600 whitespace-nowrap">{div.mlItemId}</td>
                          <td className="py-4 px-6 font-medium">"{div.motivo}"</td>
                          <td className="py-4 px-6 text-right">
                            {div.link && div.link !== "N/A" ? (
                              <a href={div.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-end gap-1 text-blue-500 font-bold uppercase text-[10px] hover:underline whitespace-nowrap">
                                Visualizar <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-400 text-[10px] uppercase">Sem Link</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </section>
          </main>
        ) : (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
             <section className="col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xl overflow-y-auto custom-scrollbar">
                <h2 className="font-black text-sm uppercase mb-6 flex items-center gap-2 text-blue-600"><Plus /> Inserção de Dados</h2>
                <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">SKU_ID</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-600" /></div>
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">ID na Plataforma</label><input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-600" /></div>
                   </div>
                   <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">Identity / Título</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-600" /></div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">Price</label><input required type="number" step="0.01" value={formProd.preco} onChange={e => setFormProd({...formProd, preco: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-600" /></div>
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">Weight Real (g)</label><input required type="number" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-600" /></div>
                   </div>
                   <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <input type="checkbox" id="ekit" checked={formProd.eKit} onChange={e => setFormProd({...formProd, eKit: e.target.checked})} className="w-5 h-5 accent-blue-600" />
                      <label htmlFor="ekit" className="text-[11px] font-black text-slate-600 uppercase cursor-pointer">Composite Object (KIT)</label>
                   </div>
                   <button disabled={loadingProd} type="submit" className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-lg hover:bg-black transition-all">Confirmar Registro</button>
                </form>
             </section>
             <section className="col-span-3 bg-white border border-slate-200 rounded-xl p-6 shadow-xl overflow-hidden flex flex-col h-full">
                <h2 className="font-black text-sm uppercase mb-6 text-blue-600 flex items-center gap-2"><Box /> Base Interna de Pesos</h2>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                  {produtos.map(prod => (
                    <div key={prod.id} className="border border-slate-100 p-4 rounded-xl flex justify-between items-center hover:bg-slate-50 transition-all text-xs">
                       <div>
                          <div className="flex items-center gap-2"><span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">{prod.sku}</span>{prod.eKit && <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase">KIT</span>}</div>
                          <h3 className="text-sm font-bold text-slate-800 mt-2">{prod.nome}</h3>
                       </div>
                       <div className="text-right"><span className="block text-[10px] font-black text-slate-400 uppercase italic">Measured</span><span className="text-sm font-bold text-slate-700">{prod.pesoGramas}g</span></div>
                    </div>
                  ))}
                </div>
             </section>
          </main>
        )}
      </div>

      {/* COMPONENTE DA IA COM INTEGRAÇÃO DO LOG */}
      <IaAnalyizChat 
        isChatOpen={isChatOpen} 
        toggleChat={() => setIsChatOpen(!isChatOpen)} 
        onLog={handleIaLog} 
      />

      <footer className="bg-white border-t border-slate-200 p-2 px-6 shrink-0 z-20 flex justify-between items-center text-[9px] font-black uppercase text-slate-400 tracking-[0.4em] italic">
          <span>IA_Analyiz_Core</span><span>Painel Multi-Plataforma v4.0</span>
      </footer>
    </div>
  );
}