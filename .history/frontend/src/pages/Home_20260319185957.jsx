import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, Activity, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box, Search,
  ShoppingBag, ShoppingCart, ChevronDown
} from 'lucide-react';
import IaAnalyizChat from '../components/IaAnalyizChat';

const API_BASE_URL = 'http://localhost:3000';

export default function Home() {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(1);
  const [activeMarketplace, setActiveMarketplace] = useState('ml');
  const [activeTab, setActiveTab] = useState('bot'); 
  const [isPlatformMenuOpen, setIsPlatformMenuOpen] = useState(false);
  const platformMenuRef = useRef(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('IDLE');
  const [logs, setLogs] = useState([{ msg: 'KERNEL_READY: IA Analyiz inicializada.', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  
  const [produtos, setProdutos] = useState([]);
  const [formProd, setFormProd] = useState({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
  const [loadingProd, setLoadingProd] = useState(false);
  const terminalRef = useRef(null);

  useEffect(() => { document.title = "IA Analyiz | Painel Multi-Canal"; }, []);

  const handleLogout = () => {
    localStorage.removeItem('analyiz_token');
    localStorage.removeItem('analyiz_user');
    navigate('/login');
  };

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
      buscarDivergencias(); buscarProdutos();
    }
  }, [activeMarketplace]);

  const buscarDivergencias = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/divergencias`);
      setDivergencias(await res.json());
    } catch (e) {}
  };

  const buscarProdutos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/produtos`);
      setProdutos(await res.json());
    } catch (e) {}
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

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setLoadingProd(true);
    try {
      await fetch(`${API_BASE_URL}/api/produtos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formProd)
      });
      setFormProd({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
      buscarProdutos();
    } finally { setLoadingProd(false); }
  };

  const handleIaLog = (msg, type) => setLogs(prev => [...prev, { msg, type }]);

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex flex-col font-sans text-slate-900 overflow-hidden relative" style={{ zoom: zoom }}>
      
      <style>{` @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animate-slide-down { animation: slideDown 0.2s ease-out forwards; } `}</style>

      <header className="bg-[#1e293b] border-b border-slate-700 p-4 shadow-xl shrink-0 z-30 relative">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center text-white">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><Activity className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-black uppercase italic tracking-tighter">IA Analyiz <span className="text-blue-400">Core</span></h1>
            </div>
          </div>
          
          <nav className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setActiveTab('bot')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'bot' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Scanner</button>
            <button onClick={() => setActiveTab('produtos')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'produtos' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Database</button>
          </nav>
          
          <div className="flex items-center gap-4">
            <div className="relative" onMouseEnter={() => setIsPlatformMenuOpen(true)} onMouseLeave={() => setIsPlatformMenuOpen(false)}>
              <button className={`flex items-center gap-2 border px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${isPlatformMenuOpen ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white'}`}>
                <span>Plataforma</span><ChevronDown className="w-3.5 h-3.5" />
              </button>
              {isPlatformMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] animate-slide-down overflow-hidden">
                  <button onClick={() => setActiveMarketplace('ml')} className="w-full flex px-4 py-3 hover:bg-blue-50 text-xs font-bold text-slate-700 border-b border-slate-50"><ShoppingBag className="w-4 h-4 mr-2 text-[#FFE600]"/> Mercado Livre</button>
                  <button onClick={() => setActiveMarketplace('shopee')} className="w-full flex px-4 py-3 hover:bg-orange-50 text-xs font-bold text-slate-700 border-b border-slate-50"><ShoppingCart className="w-4 h-4 mr-2 text-[#EE4D2D]"/> Shopee</button>
                  <button onClick={() => setActiveMarketplace('amazon')} className="w-full flex px-4 py-3 hover:bg-yellow-50 text-xs font-bold text-slate-700"><Box className="w-4 h-4 mr-2 text-[#FF9900]"/> Amazon</button>
                </div>
              )}
            </div>

            <button onClick={handleLogout} className="h-10 w-10 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors shadow-inner" title="Sair do Sistema">
              <User className="text-red-400 w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col p-6 w-full max-w-7xl mx-auto h-full min-h-0 relative z-10">
        {activeMarketplace !== 'ml' ? (
           <div className="flex-1 flex items-center justify-center flex-col text-slate-400">
              <Activity className="w-16 h-16 mb-4 opacity-20 animate-pulse" />
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-300">Integração em Desenvolvimento</h2>
           </div>
        ) : activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
             <section className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="p-5 flex flex-col flex-1 min-h-0">
                <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-4 rounded-lg font-black text-xs uppercase tracking-widest mb-4 transition-all ${isBotRunning ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-lg'}`}>
                  {isBotRunning ? 'SINCRONIZANDO API ML...' : 'EXECUTAR PROTOCOLO'}
                </button>
                <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar flex flex-col gap-2">
                  {logs.map((log, i) => (<div key={i} className={log.type === 'warn' ? 'text-amber-500' : log.type === 'success' ? 'text-emerald-500' : 'text-slate-400'}><span className="mr-2">[{new Date().toLocaleTimeString()}]</span>{log.msg}</div>))}
                </div>
              </div>
            </section>

            <section className="col-span-3 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 font-black text-xs uppercase text-slate-400 flex justify-between items-center"><AlertTriangle className="text-amber-500 w-4 h-4" /> Inconsistências</div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100 text-xs italic">
                      {divergencias.map((div) => (
                        <tr key={div.id} className="hover:bg-blue-50/50">
                          <td className="py-4 px-6 font-bold text-blue-600">{div.mlItemId}</td><td className="py-4 px-6">"{div.motivo}"</td>
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

      <IaAnalyizChat isChatOpen={isChatOpen} toggleChat={() => setIsChatOpen(!isChatOpen)} onLog={handleIaLog} />
    </div>
  );
}