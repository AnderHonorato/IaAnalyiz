import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, 
  Bot, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000'; // Mude para 3001 se tiver alterado no backend

export default function App() {
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState('bot'); // 'bot' | 'produtos'

  // --- ESTADOS DO BOT ---
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('Aguardando...');
  const [logs, setLogs] = useState([{ msg: 'Pronto para iniciar conexão com a API...', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  const [carregandoDiv, setCarregandoDiv] = useState(false);
  const terminalRef = useRef(null);

  // --- ESTADOS DE PRODUTOS ---
  const [produtos, setProdutos] = useState([]);
  const [formProd, setFormProd] = useState({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
  const [loadingProd, setLoadingProd] = useState(false);

  // Efeito Auto-scroll Terminal
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  // Carrega dados iniciais
  useEffect(() => {
    buscarDivergencias();
    buscarProdutos();
  }, []);

  // --- FUNÇÕES DO BOT ---
  const buscarDivergencias = async () => {
    setCarregandoDiv(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/divergencias`);
      setDivergencias(await res.json());
    } catch (e) { console.error(e); } finally { setCarregandoDiv(false); }
  };

  const iniciarBot = () => {
    setIsBotRunning(true); setProgress(0); setLogs([]); setTimeLeft('Calculando tempo...');
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.msg) setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
      if (data.type === 'progress') { setProgress(data.percent); setTimeLeft(data.timeLeft); }
      if (data.type === 'done') {
        setProgress(100); setTimeLeft('Finalizado.'); setIsBotRunning(false);
        eventSource.close(); buscarDivergencias();
      }
    };
    eventSource.onerror = () => {
      setLogs(prev => [...prev, { msg: 'Conexão perdida com o bot API.', type: 'error' }]);
      setIsBotRunning(false); eventSource.close();
    };
  };

  // --- FUNÇÕES DE PRODUTOS ---
  const buscarProdutos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/produtos`);
      setProdutos(await res.json());
    } catch (e) { console.error("Erro ao buscar produtos", e); }
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
        alert("Produto cadastrado com sucesso!");
      } else {
        const error = await res.json();
        alert(error.error);
      }
    } catch (e) { console.error(e); alert("Erro ao cadastrar."); } 
    finally { setLoadingProd(false); }
  };

  const getLogColor = (type) => {
    switch(type) { case 'info': return 'text-sky-400'; case 'warn': return 'text-yellow-400'; case 'error': return 'text-red-400'; case 'success': return 'text-emerald-400'; default: return 'text-white'; }
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 flex flex-col relative font-sans text-white overflow-hidden transition-all duration-300" style={{ zoom: zoom }}>
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none z-0"></div>
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-600 rounded-full mix-blend-multiply filter blur-[100px] opacity-30 animate-pulse"></div>

      <div className="flex-1 flex flex-col p-6 gap-6 z-10 w-full max-w-7xl mx-auto h-full">
        
        {/* HEADER & NAVEGAÇÃO */}
        <header className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 px-6 shadow-2xl flex justify-between items-center shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 border-r border-white/10 pr-6">
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 text-emerald-300"><Bot className="w-6 h-6" /></div>
              <div><h1 className="text-xl font-bold tracking-tight">Bot ML API</h1><p className="text-xs text-emerald-200/70">Painel do Vendedor</p></div>
            </div>
            
            {/* TABS */}
            <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
              <button onClick={() => setActiveTab('bot')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'bot' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-200/50 hover:text-white hover:bg-white/5'}`}>
                <Terminal className="w-4 h-4" /> Terminal Bot
              </button>
              <button onClick={() => setActiveTab('produtos')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'produtos' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-200/50 hover:text-white hover:bg-white/5'}`}>
                <PackagePlus className="w-4 h-4" /> Produtos & Kits
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-black/20 p-1 rounded-full border border-white/5">
              <button onClick={() => setZoom(z => Math.max(0.6, z - 0.1))} className="p-1.5 hover:bg-white/10 rounded-full text-emerald-200 hover:text-white"><ZoomOut className="w-4 h-4" /></button>
              <span className="text-xs font-bold min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="p-1.5 hover:bg-white/10 rounded-full text-emerald-200 hover:text-white"><ZoomIn className="w-4 h-4" /></button>
            </div>
          </div>
        </header>

        {/* CONTEÚDO DINÂMICO BASEADO NA ABA */}
        {activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 min-h-0">
            {/* TERMINAL DO BOT */}
            <section className="col-span-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col h-full">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <h2 className="text-sm font-bold text-emerald-100 flex items-center gap-2 uppercase tracking-wider"><Terminal className="w-4 h-4" /> Terminal de Execução</h2>
              </div>
              <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-3.5 rounded-xl font-bold text-white text-sm shadow-lg transition-all flex items-center justify-center gap-2 shrink-0 ${isBotRunning ? 'bg-emerald-800/50 cursor-not-allowed border border-emerald-500/30' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:scale-[1.02] active:scale-[0.98]'}`}>
                {isBotRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />} {isBotRunning ? 'Processando Lote...' : 'Iniciar Varredura'}
              </button>
              <div className="my-5 shrink-0">
                <div className="flex justify-between text-[11px] text-emerald-200/70 mb-2 font-medium"><span>Progresso da Análise</span><span>{timeLeft}</span></div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden border border-white/5"><div className="h-full bg-emerald-400 transition-all duration-300 shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: `${progress}%` }}></div></div>
              </div>
              <div ref={terminalRef} className="flex-1 bg-black/40 rounded-xl p-4 font-mono text-[11px] overflow-y-auto custom-scrollbar border border-white/5 flex flex-col gap-1.5">
                {logs.map((log, i) => (<div key={i} className={`break-all ${getLogColor(log.type)}`}><span className="opacity-50 mr-2">{'>'}</span>{log.msg}</div>))}
              </div>
            </section>

            {/* DIVERGÊNCIAS */}
            <section className="col-span-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col h-full">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <h2 className="text-sm font-bold text-emerald-100 flex items-center gap-2 uppercase tracking-wider"><AlertTriangle className="w-4 h-4 text-yellow-400" /> Divergências Encontradas</h2>
                <button onClick={buscarDivergencias} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-emerald-200 hover:text-white"><RefreshCw className={`w-4 h-4 ${carregandoDiv ? 'animate-spin' : ''}`} /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-emerald-950/90 z-10">
                    <tr><th className="py-3 px-4 text-[10px] text-emerald-200/70 uppercase">ID ML</th><th className="py-3 px-4 text-[10px] text-emerald-200/70 uppercase">Motivo</th><th className="py-3 px-4 text-[10px] text-emerald-200/70 uppercase w-24">Ação</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {divergencias.length === 0 ? (<tr><td colSpan="3" className="py-8 text-center text-emerald-200/50">Tudo sincronizado!</td></tr>) : divergencias.map((div) => (
                      <tr key={div.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-emerald-100">{div.mlItemId}</td>
                        <td className="py-3 px-4 text-emerald-100/80">{div.motivo}</td>
                        <td className="py-3 px-4"><a href={div.link} target="_blank" className="flex items-center gap-1.5 text-emerald-400 font-bold"><ExternalLink className="w-3 h-3" /> Ver</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        ) : (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 min-h-0">
            {/* FORMULÁRIO DE CADASTRO */}
            <section className="col-span-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col h-full overflow-y-auto custom-scrollbar">
              <h2 className="text-sm font-bold text-emerald-100 flex items-center gap-2 uppercase tracking-wider mb-5"><Plus className="w-4 h-4" /> Novo Cadastro</h2>
              
              <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
                <div className="flex gap-4">
                  <div className="flex-1"><label className="block text-emerald-200/70 mb-1">SKU (Código Interno)</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none focus:border-emerald-500" placeholder="Ex: PROD-001"/></div>
                  <div className="flex-1"><label className="block text-emerald-200/70 mb-1">ID Mercado Livre</label><input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none focus:border-emerald-500" placeholder="Ex: MLB123456"/></div>
                </div>
                <div><label className="block text-emerald-200/70 mb-1">Nome do Produto</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none focus:border-emerald-500" placeholder="Nome completo..."/></div>
                <div className="flex gap-4">
                  <div className="flex-1"><label className="block text-emerald-200/70 mb-1">Preço Base (R$)</label><input required type="number" step="0.01" value={formProd.preco} onChange={e => setFormProd({...formProd, preco: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none focus:border-emerald-500" placeholder="0.00"/></div>
                  <div className="flex-1"><label className="block text-emerald-200/70 mb-1">Peso (Gramas)</label><input required type="number" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-white outline-none focus:border-emerald-500" placeholder="500"/></div>
                </div>
                <div className="flex items-center gap-2 mt-4 bg-black/20 p-3 rounded-lg border border-white/10">
                  <input type="checkbox" id="ekit" checked={formProd.eKit} onChange={e => setFormProd({...formProd, eKit: e.target.checked})} className="w-4 h-4 accent-emerald-500 rounded"/>
                  <label htmlFor="ekit" className="text-emerald-100 font-bold cursor-pointer">Este item é um Kit (Composto por outros itens)</label>
                </div>
                <button disabled={loadingProd} type="submit" className="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition-colors flex justify-center gap-2">
                  {loadingProd ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>} Salvar Produto
                </button>
              </form>
            </section>

            {/* LISTA DE PRODUTOS CADASTRADOS */}
            <section className="col-span-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col h-full">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <h2 className="text-sm font-bold text-emerald-100 flex items-center gap-2 uppercase tracking-wider"><Box className="w-4 h-4" /> Banco de Dados Local</h2>
                <button onClick={buscarProdutos} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-emerald-200 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                {produtos.length === 0 ? <p className="text-center text-xs text-emerald-200/50 mt-10">Nenhum produto cadastrado ainda.</p> : produtos.map(prod => (
                  <div key={prod.id} className="bg-black/20 border border-white/10 p-3 rounded-xl flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-400">{prod.sku}</span>
                        {prod.eKit && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30 uppercase font-bold">KIT</span>}
                      </div>
                      <p className="text-sm font-medium mt-1">{prod.nome}</p>
                      <p className="text-[10px] text-emerald-200/60 mt-0.5">ML ID: {prod.mlItemId || 'Não vinculado'} | R$ {prod.preco.toFixed(2)} | {prod.pesoGramas}g</p>
                    </div>
                    {prod.eKit && (
                      <button className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-bold border border-white/10 transition-colors">
                        Gerenciar Itens do Kit
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  );
}