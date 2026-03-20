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
  const [logs, setLogs] = useState([{ msg: 'SISTEMA INICIALIZADO: Aguardando varredura...', type: 'info' }]);
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
    setIsBotRunning(true); setProgress(0); setLogs([]); setTimeLeft('PROCESSANDO...');
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

  // Ícone do Robô com Olhos Redondos (Flat Design)
  const RobotIcon = ({ size = "md" }) => (
    <div className={`${size === "sm" ? 'h-10 w-10' : 'h-14 w-14'} bg-[#3483FA] rounded-full flex items-center justify-center relative shadow-lg shrink-0`}>
      <div className="flex gap-2">
        <div className="ai-eye-round w-2 h-2 bg-white rounded-full shadow-[0_0_5px_white]"></div>
        <div className="ai-eye-round w-2 h-2 bg-white rounded-full shadow-[0_0_5px_white]"></div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full bg-[#F5F7FA] flex flex-col font-sans text-slate-900 overflow-hidden relative" style={{ zoom: zoom }}>
      
      <style>{`
        @keyframes blink-round { 0%, 90%, 100% { opacity: 1; transform: scaleY(1); } 95% { opacity: 0.4; transform: scaleY(0.2); } }
        .ai-eye-round { animation: blink-round 4s infinite; }
        .chat-slide { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>

      {/* HEADER CORPORATIVO */}
      <header className="bg-[#1e293b] border-b border-slate-700 p-4 shadow-xl shrink-0 z-20">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center text-white font-bold uppercase tracking-tighter">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg"><Activity className="w-6 h-6" /></div>
            <h1 className="text-xl italic">Neural Bot <span className="text-blue-400">v3</span></h1>
          </div>
          <nav className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setActiveTab('bot')} className={`px-6 py-2 rounded-lg text-xs transition-all ${activeTab === 'bot' ? 'bg-blue-600' : 'text-slate-400 hover:text-white'}`}>Scanner</button>
            <button onClick={() => setActiveTab('produtos')} className={`px-6 py-2 rounded-lg text-xs transition-all ${activeTab === 'produtos' ? 'bg-blue-600' : 'text-slate-400 hover:text-white'}`}>Database</button>
          </nav>
          <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700"><User className="text-blue-400 w-5 h-5" /></div>
        </div>
      </header>

      {/* DASHBOARD PRINCIPAL */}
      <div className="flex-1 flex flex-col p-6 w-full max-w-7xl mx-auto h-full min-h-0">
        {activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
            <section className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col h-full overflow-hidden">
              <div className="p-5 flex flex-col flex-1 min-h-0">
                <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-4 rounded-lg font-black text-xs uppercase mb-4 ${isBotRunning ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 transition-all'}`}>
                  {isBotRunning ? 'Sincronizando...' : 'Iniciar Protocolo'}
                </button>
                <div className="bg-slate-900 rounded-lg p-4 mb-4">
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
                <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar border border-slate-800 flex flex-col gap-2">
                  {logs.map((log, i) => (<div key={i} className={log.type === 'warn' ? 'text-amber-500 font-bold' : 'text-slate-400'}>{log.msg}</div>))}
                </div>
              </div>
            </section>
            <section className="col-span-3 bg-white border border-slate-200 rounded-xl shadow-lg flex flex-col overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-500 uppercase">Inconsistências Logísticas</div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left text-xs italic">
                    <tbody className="divide-y divide-slate-100">
                      {divergencias.map((div) => (<tr key={div.id} className="hover:bg-blue-50/30 transition-all"><td className="py-4 px-6 font-bold text-blue-600">{div.mlItemId}</td><td className="py-4 px-6 text-slate-600">{div.motivo}</td></tr>))}
                    </tbody>
                  </table>
                </div>
            </section>
          </main>
        ) : (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
             <section className="col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
                <h2 className="font-bold text-sm uppercase mb-6 flex items-center gap-2 text-blue-600"><Plus className="w-5 h-5" /> Cadastro Interno</h2>
                <form onSubmit={handleCreateProduct} className="space-y-4">
                   <input required placeholder="SKU" value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs" />
                   <input required placeholder="Nome do Produto" value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs" />
                   <div className="grid grid-cols-2 gap-4">
                      <input required type="number" placeholder="Peso (g)" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs" />
                      <input placeholder="MLB ID" value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs" />
                   </div>
                   <button type="submit" className="w-full py-4 bg-slate-900 text-white font-bold text-xs uppercase rounded-lg">Salvar Registro</button>
                </form>
             </section>
             <section className="col-span-3 bg-white border border-slate-200 rounded-xl p-6 shadow-xl overflow-y-auto">
                <h2 className="font-bold text-sm uppercase mb-6 text-blue-600">Produtos no Banco</h2>
                {produtos.map(prod => (
                  <div key={prod.id} className="p-4 border-b border-slate-100 flex justify-between items-center text-xs">
                    <span className="font-bold text-blue-600">{prod.sku}</span>
                    <span className="text-slate-500">{prod.nome} ({prod.pesoGramas}g)</span>
                  </div>
                ))}
             </section>
          </main>
        )}
      </div>

      {/* AURA IA - FLAT & INTELLIGENT */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        <div className={`chat-slide w-[400px] h-[580px] bg-white rounded-[2rem] shadow-[0_30px_90px_rgba(0,0,0,0.15)] border border-slate-100 flex flex-col mb-4 overflow-hidden origin-bottom-right ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
          <div className="bg-[#3483FA] p-6 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-3">
              <RobotIcon size="sm" />
              <div>
                <p className="text-sm font-bold uppercase tracking-widest">Aura IA</p>
                <p className="text-[10px] text-blue-100 font-medium">Analista Conectada</p>
              </div>
            </div>
            <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/10 p-2 rounded-full"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-4 custom-scrollbar text-xs">
            <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 text-slate-700">
              Olá! Estou conectada ao seu **banco de dados** e lendo o **terminal em tempo real**. Atualmente temos {produtos.length} produtos e {divergencias.length} alertas na tela. Como posso ajudar?
            </div>
          </div>

          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex gap-2 mb-3">
              <button className="p-2 text-slate-400 hover:text-[#3483FA]"><ImageIcon className="w-5 h-5" /></button>
              <button className="p-2 text-slate-400 hover:text-[#3483FA]"><Film className="w-5 h-5" /></button>
              <button className="p-2 text-slate-400 hover:text-[#3483FA]"><Paperclip className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Perguntar sobre os dados..." className="flex-1 bg-slate-100 rounded-xl px-4 py-3 text-xs outline-none" />
              <button className="bg-[#3483FA] text-white p-3 rounded-xl"><Send className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        <button onClick={() => setIsChatOpen(!isChatOpen)} className="transition-all hover:scale-110 active:scale-95">
          <RobotIcon />
          {!isChatOpen && <span className="absolute -top-1 -right-1 flex h-5 w-5"><span className="animate-ping absolute h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative rounded-full h-5 w-5 bg-blue-600 border-2 border-white text-[8px] flex items-center justify-center text-white font-bold">!</span></span>}
        </button>
      </div>
    </div>
  );
}