import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, 
  Bot, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box, Search, Activity,
  X, Send, Paperclip, Image as ImageIcon, Film, Sparkles, Minus
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function App() {
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState('bot');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('IDLE');
  const [logs, setLogs] = useState([{ msg: 'SISTEMA INICIALIZADO: Aguardando comando...', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  const [carregandoDiv, setCarregandoDiv] = useState(false);
  
  const [produtos, setProdutos] = useState([]);
  const [formProd, setFormProd] = useState({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
  const [loadingProd, setLoadingProd] = useState(false);

  const terminalRef = useRef(null);

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
      alert("Produto registrado no Kernel com sucesso.");
    } finally { setLoadingProd(false); }
  };

  const getLogStyle = (type) => {
    switch(type) { 
      case 'info': return 'text-slate-400 italic'; 
      case 'warn': return 'text-amber-500 font-bold'; 
      case 'success': return 'text-emerald-500 font-bold'; 
      default: return 'text-slate-300'; 
    }
  };

  // Componente do Rosto do Robô para reuso
  const RobotFace = ({ size = "md" }) => {
    const isSmall = size === "sm";
    return (
      <div className={`${isSmall ? 'h-10 w-10 rounded-xl' : 'h-14 w-14 rounded-2xl'} bg-blue-600 flex flex-col items-center justify-center relative overflow-hidden shadow-inner shrink-0 border-b-4 border-blue-800`}>
        <div className={`flex ${isSmall ? 'gap-1.5' : 'gap-2'} mb-1`}>
          <div className={`ai-eye ${isSmall ? 'w-1.5 h-3' : 'w-2 h-4'} bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]`}></div>
          <div className={`ai-eye ${isSmall ? 'w-1.5 h-3' : 'w-2 h-4'} bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]`}></div>
        </div>
        <div className={`${isSmall ? 'w-4 h-0.5' : 'w-6 h-1'} bg-blue-400/50 rounded-full mt-1`}></div>
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden relative" style={{ zoom: zoom }}>
      
      <style>{`
        @keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 93%, 97% { transform: scaleY(0); } }
        .ai-eye { animation: blink 4s infinite; transform-origin: center; }
        .chat-container { transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1); }
        .robot-bounce { animation: bounce 2s infinite; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      `}</style>

      {/* HEADER */}
      <header className="bg-[#1e293b] border-b border-slate-700 p-4 shadow-xl shrink-0 z-20">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center text-white">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><Activity className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-extrabold uppercase italic tracking-tighter">Neural Bot <span className="text-blue-400">v3.0</span></h1>
              <div className="flex items-center gap-2 font-black text-[9px] text-slate-400 tracking-widest uppercase">
                 <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Sistema Ativo
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setActiveTab('bot')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'bot' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Scanner</button>
            <button onClick={() => setActiveTab('produtos')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'produtos' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Database</button>
          </nav>
          <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700"><User className="text-blue-400 w-5 h-5" /></div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 flex flex-col p-6 w-full max-w-7xl mx-auto h-full min-h-0">
        {activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
            <section className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="p-5 flex flex-col flex-1 min-h-0">
                <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-4 rounded-lg font-black text-xs uppercase tracking-widest mb-4 transition-all ${isBotRunning ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20'}`}>
                  {isBotRunning ? 'Processando Heurística...' : 'Executar Protocolo'}
                </button>
                <div className="bg-slate-900 rounded-lg p-4 mb-4 border border-slate-800">
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" style={{ width: `${progress}%` }}></div></div>
                </div>
                <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar border border-slate-800 flex flex-col gap-2">
                  {logs.map((log, i) => (<div key={i} className={getLogStyle(log.type)}><span className="text-slate-700 mr-2">[{new Date().toLocaleTimeString()}]</span>{log.msg}</div>))}
                </div>
              </div>
            </section>
            <section className="col-span-3 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center font-black text-xs uppercase tracking-widest text-slate-400"><div className="flex items-center gap-2"><AlertTriangle className="text-amber-500 w-4 h-4" /> Inconsistências</div> <span>Audit_Live</span></div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left text-xs italic">
                    <tbody className="divide-y divide-slate-100">
                      {divergencias.length === 0 ? (
                        <tr><td className="py-20 text-center text-slate-300 font-bold uppercase tracking-[0.3em]">Scan_Clean</td></tr>
                      ) : divergencias.map((div) => (
                        <tr key={div.id} className="hover:bg-blue-50/30 transition-all"><td className="py-4 px-6 font-bold text-blue-600">{div.mlItemId}</td><td className="py-4 px-6 text-slate-600 font-medium">"{div.motivo}"</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </section>
          </main>
        ) : (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
             <section className="col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xl overflow-y-auto custom-scrollbar">
                <h2 className="font-black text-sm uppercase mb-6 flex items-center gap-2"><Plus className="text-blue-600" /> Inserção de Dados</h2>
                <form onSubmit={handleCreateProduct} className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">SKU_ID</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-500" /></div>
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">ML_Ref</label><input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">Identity</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-500" /></div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">Price</label><input required type="number" step="0.01" value={formProd.preco} onChange={e => setFormProd({...formProd, preco: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-500" /></div>
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase">Weight(g)</label><input required type="number" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <input type="checkbox" id="ekit" checked={formProd.eKit} onChange={e => setFormProd({...formProd, eKit: e.target.checked})} className="w-5 h-5 accent-blue-600" />
                      <label htmlFor="ekit" className="text-[11px] font-black text-slate-600 uppercase cursor-pointer">Composite Object (KIT)</label>
                   </div>
                   <button disabled={loadingProd} type="submit" className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-lg hover:bg-black transition-all shadow-lg">Confirmar Registro</button>
                </form>
             </section>
             <section className="col-span-3 bg-white border border-slate-200 rounded-xl p-6 shadow-xl overflow-hidden flex flex-col">
                <h2 className="font-black text-sm uppercase mb-6 flex items-center gap-2"><Box className="text-blue-600" /> Local_Registry</h2>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                  {produtos.map(prod => (
                    <div key={prod.id} className="border border-slate-100 p-4 rounded-xl flex justify-between items-center hover:bg-slate-50 transition-all shadow-sm">
                       <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter">{prod.sku}</span>
                            {prod.eKit && <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase">KIT</span>}
                          </div>
                          <h3 className="text-sm font-bold text-slate-800 mt-2">{prod.nome}</h3>
                       </div>
                       <div className="text-right"><span className="block text-[10px] font-black text-slate-400 uppercase italic">Measured</span><span className="text-sm font-black text-slate-700">{prod.pesoGramas}g</span></div>
                    </div>
                  ))}
                </div>
             </section>
          </main>
        )}
      </div>

      {/* --- IA FLOATING ROBOT CHAT --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end max-w-[calc(100vw-48px)]">
        
        {/* Janela de Chat */}
        <div className={`chat-container w-[420px] max-w-full h-[600px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-[0_25px_60px_rgba(0,0,0,0.25)] border border-slate-100 flex flex-col mb-6 overflow-hidden origin-bottom-right ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
          
          {/* Header do Robô */}
          <div className="bg-[#1e293b] p-6 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-4">
              <RobotFace size="sm" />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] leading-none">Aura AI</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <p className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">Protocolo Ativo</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-red-500/20 p-2 rounded-xl transition-all"><X className="w-6 h-6" /></button>
            </div>
          </div>

          <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto space-y-6 custom-scrollbar">
            <div className="flex gap-3">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md"><Sparkles className="w-4 h-4 text-white" /></div>
              <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm text-xs leading-relaxed text-slate-700 max-w-[85%] font-medium">
                Sistemas operacionais, Master_Admin. Identifiquei anomalias no SKU **PROD-09**. O peso declarado no ML excede o limite permitido para o frete atual. Deseja correção automática?
              </div>
            </div>
          </div>

          {/* Footer Multimídia */}
          <div className="p-5 border-t border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-4 mb-4 px-1">
              <button className="text-slate-400 hover:text-blue-600 transition-colors"><ImageIcon className="w-5 h-5" /></button>
              <button className="text-slate-400 hover:text-blue-600 transition-colors"><Film className="w-5 h-5" /></button>
              <button className="text-slate-400 hover:text-blue-600 transition-colors"><Paperclip className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-3">
              <input type="text" placeholder="Comando de voz ou texto..." className="flex-1 bg-slate-100 border-none rounded-2xl px-6 py-4 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 font-medium" value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
              <button className="bg-blue-600 text-white px-5 rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-500/30 transition-all active:scale-90"><Send className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        {/* Botão Flutuante (O PRÓPRIO ROBÔ) */}
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`chat-container robot-bounce flex items-center justify-center shadow-[0_15px_40px_rgba(59,130,246,0.5)] transition-all duration-500 relative group ${isChatOpen ? 'rotate-12 translate-x-2' : ''}`}
        >
          {isChatOpen ? (
            <div className="h-16 w-16 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center text-slate-800 shadow-xl">
              <X className="w-8 h-8" />
            </div>
          ) : (
            <div className="relative">
              <RobotFace />
              <span className="absolute -top-2 -right-2 flex h-6 w-6">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-6 w-6 bg-blue-500 border-2 border-white items-center justify-center text-[10px] font-black text-white">!</span>
              </span>
            </div>
          )}
        </button>
      </div>

      <footer className="bg-white border-t border-slate-200 p-2 px-6 shrink-0 z-20 text-[9px] font-black uppercase text-slate-400 tracking-[0.4em] flex justify-between items-center italic">
          <span>Neural_ML_Core_Active</span><span>v3.0.1_STABLE</span>
      </footer>
    </div>
  );
}