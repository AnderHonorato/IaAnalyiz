import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, 
  Bot, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box, Search, Activity,
  MessageSquare, X, Send, Paperclip, Image as ImageIcon, Film, Sparkles, Minus
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function App() {
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState('bot');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  // --- IA ENGINE STATES ---
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('IDLE');
  const [logs, setLogs] = useState([{ msg: 'SISTEMA INICIALIZADO: Aguardando comando...', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  
  // --- DATABASE STATES ---
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
    try {
      const res = await fetch(`${API_BASE_URL}/api/divergencias`);
      setDivergencias(await res.json());
    } catch (e) { console.error(e); }
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

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden relative" style={{ zoom: zoom }}>
      
      {/* Estilos de Animação dos Olhinhos do ML */}
      <style>{`
        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        .ai-eye {
          animation: blink 4s infinite;
        }
        .chat-container {
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
      `}</style>

      {/* HEADER CORPORATE */}
      <header className="bg-[#1e293b] border-b border-slate-700 p-4 shadow-xl shrink-0 z-20">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-inner"><Activity className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white uppercase italic">Neural ML Bot <span className="text-blue-400">v3.0</span></h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sistemas Ativos</p>
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
          <div className="h-10 w-10 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center">
            <User className="text-blue-400 w-5 h-5" />
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 flex flex-col p-6 w-full max-w-7xl mx-auto h-full min-h-0">
        {activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
            <section className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center font-bold text-[11px] text-slate-500 uppercase">
                <span>Kernel_Output_Stream</span>
              </div>
              <div className="p-5 flex flex-col flex-1 min-h-0">
                <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-4 rounded-lg font-black text-xs uppercase tracking-widest transition-all mb-4 ${isBotRunning ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'}`}>
                  {isBotRunning ? 'Processando...' : 'Executar Protocolo'}
                </button>
                <div className="bg-slate-900 rounded-lg p-4 mb-4 border border-slate-800">
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6] transition-all duration-700" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
                <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar border border-slate-800 flex flex-col gap-2">
                  {logs.map((log, i) => (
                    <div key={i} className={`leading-relaxed ${log.type === 'info' ? 'text-slate-400 italic' : log.type === 'warn' ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {log.msg}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="col-span-3 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h2 className="font-black text-sm uppercase tracking-tighter flex items-center gap-2">
                    <AlertTriangle className="text-amber-500 w-5 h-5" /> Inconsistências
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left italic text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {divergencias.map((div) => (
                        <tr key={div.id} className="hover:bg-blue-50/30 transition-all">
                          <td className="py-4 px-6 font-bold text-blue-600">{div.mlItemId}</td>
                          <td className="py-4 px-6">{div.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </section>
          </main>
        ) : (
          <div className="text-center p-20 text-slate-400 font-black uppercase tracking-widest opacity-20">Database_Active</div>
        )}
      </div>

      {/* --- IA FLOATING CHAT COMPONENT (ESTILO MERCADO LIVRE) --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        
        {/* Janela de Chat Aumentada e Fluida */}
        <div className={`chat-container w-[400px] h-[550px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 flex flex-col mb-6 overflow-hidden origin-bottom-right ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
          
          {/* Header com os Olhinhos Piscando */}
          <div className="bg-[#1e293b] p-5 flex justify-between items-center text-white">
            <div className="flex items-center gap-4">
              {/* Avatar Aura com Olhinhos */}
              <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center relative overflow-hidden shadow-inner">
                <div className="flex gap-1.5">
                  <div className="ai-eye w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_5px_white]"></div>
                  <div className="ai-eye w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_5px_white]"></div>
                </div>
                <div className="absolute bottom-2 w-4 h-1 border-b border-white/30 rounded-full"></div>
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest leading-none">Aura AI</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Online agora</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="hover:bg-white/10 p-2 rounded-xl transition-all"><Minus className="w-5 h-5" /></button>
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-red-500/20 p-2 rounded-xl transition-all group"><X className="w-5 h-5 group-hover:text-red-400" /></button>
            </div>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto space-y-5 custom-scrollbar">
            <div className="flex gap-3">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm text-xs leading-relaxed text-slate-700 max-w-[85%]">
                Olá! Analisei sua conta e notei que **4 anúncios** possuem divergência de peso que pode aumentar seu custo de frete. Quer que eu te mostre quais são?
              </div>
            </div>
            
            <div className="bg-blue-600 p-4 rounded-2xl rounded-tr-none text-white text-xs shadow-lg ml-auto max-w-[85%] font-medium">
              Sim, por favor. E verifique se o SKU KIT-01 está com as dimensões de embalagem corretas.
            </div>
          </div>

          {/* Footer Multimídia */}
          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex items-center gap-3 mb-3 px-1">
              <button title="Anexar Imagem" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><ImageIcon className="w-5 h-5" /></button>
              <button title="Enviar Vídeo" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Film className="w-5 h-5" /></button>
              <button title="Arquivos" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Paperclip className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-3">
              <input 
                type="text" 
                placeholder="Escreva sua mensagem..." 
                className="flex-1 bg-slate-100 border-none rounded-2xl px-5 py-3 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button className="bg-blue-600 text-white p-3 rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all active:scale-90 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Botão de Trigger Pulsante */}
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`h-16 w-16 rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(59,130,246,0.4)] transition-all duration-500 hover:scale-110 active:scale-90 relative ${isChatOpen ? 'bg-white text-slate-800 rotate-180' : 'bg-blue-600 text-white'}`}
        >
          {isChatOpen ? (
            <X className="w-7 h-7" />
          ) : (
            <div className="relative">
              <MessageSquare className="w-7 h-7" />
              {/* Notificação Pulsante */}
              <span className="absolute -top-3 -right-3 flex h-5 w-5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500 border-2 border-white items-center justify-center text-[8px] font-black text-white">1</span>
              </span>
            </div>
          )}
        </button>
      </div>

      <footer className="bg-white border-t border-slate-200 p-2 px-6 shrink-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">
          <span>IA_KERNEL_3.0_ONLINE</span>
          <span>Neural ML Bot</span>
        </div>
      </footer>
    </div>
  );
}