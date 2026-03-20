import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, 
  Bot, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box, Search
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

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
    switch(type) { 
      case 'info': return 'text-ml-blue'; 
      case 'warn': return 'text-orange-600'; 
      case 'error': return 'text-red-600'; 
      case 'success': return 'text-green-600'; 
      default: return 'text-ml-gray-text'; 
    }
  };

  return (
    <div className="h-screen w-full bg-ml-gray-bg flex flex-col font-sans text-ml-gray-text overflow-hidden transition-all duration-300" style={{ zoom: zoom }}>
      
      {/* HEADER ESTILO MERCADO LIVRE (AMARELO CHAPADO) */}
      <header className="bg-ml-yellow border-b border-ml-gray-border p-3 shadow-sm shrink-0 z-20">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 text-ml-gray-text"><Bot className="w-7 h-7" /></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ml-gray-text">Bot ML API</h1>
              <p className="text-[11px] text-ml-gray-muted -mt-1">Gerenciador Logístico de Kits</p>
            </div>
          </div>
          
          {/* TABS ESTILO ML (LINKS LIMPOS) */}
          <nav className="flex items-center gap-1 bg-white/40 p-1 rounded-full border border-black/5">
            <button onClick={() => setActiveTab('bot')} className={`px-5 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'bot' ? 'bg-white text-ml-blue shadow' : 'text-ml-gray-muted hover:text-ml-gray-text'}`}>
              <Terminal className="w-4 h-4" /> Terminal Bot
            </button>
            <button onClick={() => setActiveTab('produtos')} className={`px-5 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'produtos' ? 'bg-white text-ml-blue shadow' : 'text-ml-gray-muted hover:text-ml-gray-text'}`}>
              <PackagePlus className="w-4 h-4" /> Produtos & Kits
            </button>
          </nav>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-ml-gray-muted text-xs">
              <ZoomOut className="w-3.5 h-3.5 cursor-pointer hover:text-ml-gray-text" onClick={() => setZoom(z => Math.max(0.6, z - 0.1))} />
              <span className="font-bold min-w-[35px] text-center">{Math.round(zoom * 100)}%</span>
              <ZoomIn className="w-3.5 h-3.5 cursor-pointer hover:text-ml-gray-text" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} />
            </div>
            
            <div className="w-px h-6 bg-black/10"></div>
            
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <p className="text-sm font-semibold">Administrador</p>
                <p className="text-[10px] text-ml-gray-muted uppercase tracking-wider">Painel Master</p>
              </div>
              <div className="bg-ml-gray-muted p-2.5 rounded-full text-white">
                <User className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL (FUNDOS BRANCOS SÓLIDOS) */}
      <div className="flex-1 flex flex-col p-6 z-10 w-full max-w-7xl mx-auto h-full min-h-0">
        
        {activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 min-h-0">
            {/* TERMINAL DO BOT */}
            <section className="col-span-2 bg-white border border-ml-gray-border rounded-lg p-5 shadow-sm flex flex-col h-full">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <h2 className="text-base font-semibold text-ml-gray-text flex items-center gap-2.5"><Terminal className="w-5 h-5 text-ml-blue" /> Terminal de Execução</h2>
              </div>
              <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-3 rounded-lg font-semibold text-white text-sm transition-all flex items-center justify-center gap-2.5 shrink-0 ${isBotRunning ? 'bg-ml-gray-muted cursor-not-allowed' : 'bg-ml-blue hover:bg-ml-blue-dark active:scale-[0.98]'}`}>
                {isBotRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />} {isBotRunning ? 'Processando Lote...' : 'Iniciar Varredura'}
              </button>
              <div className="my-5 shrink-0 p-3 bg-ml-gray-bg/50 rounded-lg border border-ml-gray-border">
                <div className="flex justify-between text-xs text-ml-gray-muted mb-2 font-medium"><span>Progresso da Análise</span><span className="font-semibold text-ml-gray-text">{timeLeft}</span></div>
                <div className="h-2.5 bg-white rounded-full overflow-hidden border border-ml-gray-border"><div className="h-full bg-ml-blue transition-all duration-300" style={{ width: `${progress}%` }}></div></div>
              </div>
              <div ref={terminalRef} className="flex-1 bg-white rounded-lg p-4 font-mono text-[11px] overflow-y-auto custom-scrollbar border border-ml-gray-border flex flex-col gap-1.5 text-ml-gray-text">
                {logs.map((log, i) => (<div key={i} className={`break-all ${getLogColor(log.type)}`}><span className="opacity-40 mr-2">{'>'}</span>{log.msg}</div>))}
              </div>
            </section>

            {/* DIVERGÊNCIAS */}
            <section className="col-span-3 bg-white border border-ml-gray-border rounded-lg p-5 shadow-sm flex flex-col h-full">
              <div className="flex justify-between items-center mb-5 shrink-0">
                <h2 className="text-base font-semibold text-ml-gray-text flex items-center gap-2.5"><AlertTriangle className="w-5 h-5 text-orange-500" /> Divergências Encontradas</h2>
                <button onClick={buscarDivergencias} className="p-2 hover:bg-ml-gray-bg rounded-lg text-ml-gray-muted hover:text-ml-blue"><RefreshCw className={`w-4 h-4 ${carregandoDiv ? 'animate-spin' : ''}`} /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar border border-ml-gray-border rounded-lg">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 bg-ml-gray-bg z-10 border-b border-ml-gray-border">
                    <tr><th className="py-3 px-4 text-[11px] text-ml-gray-muted uppercase font-bold">ID Anúncio</th><th className="py-3 px-4 text-[11px] text-ml-gray-muted uppercase font-bold">Motivo da Divergência</th><th className="py-3 px-4 text-[11px] text-ml-gray-muted uppercase font-bold w-24">Ação</th></tr>
                  </thead>
                  <tbody className="divide-y divide-ml-gray-border text-xs text-ml-gray-text">
                    {divergencias.length === 0 ? (<tr><td colSpan="3" className="py-10 text-center text-ml-gray-muted">Tudo sincronizado! Nenhuma divergência pendente.</td></tr>) : divergencias.map((div) => (
                      <tr key={div.id} className="hover:bg-ml-gray-bg/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-ml-blue">{div.mlItemId}</td>
                        <td className="py-3.5 px-4 text-ml-gray-text">{div.motivo}</td>
                        <td className="py-3.5 px-4"><a href={div.link} target="_blank" className="flex items-center gap-1.5 text-ml-blue font-semibold hover:underline"><ExternalLink className="w-3.5 h-3.5" /> Ver</a></td>
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
            <section className="col-span-2 bg-white border border-ml-gray-border rounded-lg p-5 shadow-sm flex flex-col h-full overflow-y-auto custom-scrollbar">
              <h2 className="text-base font-semibold text-ml-gray-text flex items-center gap-2.5 mb-6"><Plus className="w-5 h-5 text-ml-blue" /> Novo Cadastro</h2>
              
              <form onSubmit={handleCreateProduct} className="space-y-5 text-xs">
                <div className="flex gap-4">
                  <div className="flex-1"><label className="block text-ml-gray-muted mb-1.5 font-semibold">SKU (Código Interno)</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-white border border-ml-gray-border rounded-md p-2.5 text-ml-gray-text outline-none focus:ring-1 focus:ring-ml-blue focus:border-ml-blue" placeholder="Ex: PROD-001"/></div>
                  <div className="flex-1"><label className="block text-ml-gray-muted mb-1.5 font-semibold">ID Mercado Livre</label><input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} className="w-full bg-white border border-ml-gray-border rounded-md p-2.5 text-ml-gray-text outline-none focus:ring-1 focus:ring-ml-blue focus:border-ml-blue" placeholder="Ex: MLB123456"/></div>
                </div>
                <div><label className="block text-ml-gray-muted mb-1.5 font-semibold">Nome do Produto (Título do Anúncio)</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-white border border-ml-gray-border rounded-md p-2.5 text-ml-gray-text outline-none focus:ring-1 focus:ring-ml-blue focus:border-ml-blue" placeholder="Nome completo..."/></div>
                <div className="flex gap-4">
                  <div className="flex-1"><label className="block text-ml-gray-muted mb-1.5 font-semibold">Preço Base (R$)</label><input required type="number" step="0.01" value={formProd.preco} onChange={e => setFormProd({...formProd, preco: e.target.value})} className="w-full bg-white border border-ml-gray-border rounded-md p-2.5 text-ml-gray-text outline-none focus:ring-1 focus:ring-ml-blue focus:border-ml-blue" placeholder="0.00"/></div>
                  <div className="flex-1"><label className="block text-ml-gray-muted mb-1.5 font-semibold">Peso Aproximado (Gramas)</label><input required type="number" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} className="w-full bg-white border border-ml-gray-border rounded-md p-2.5 text-ml-gray-text outline-none focus:ring-1 focus:ring-ml-blue focus:border-ml-blue" placeholder="500"/></div>
                </div>
                <div className="flex items-center gap-2.5 mt-5 bg-ml-gray-bg p-3.5 rounded-lg border border-ml-gray-border">
                  <input type="checkbox" id="ekit" checked={formProd.eKit} onChange={e => setFormProd({...formProd, eKit: e.target.checked})} className="w-4 h-4 accent-ml-blue rounded border-ml-gray-border"/>
                  <label htmlFor="ekit" className="text-ml-gray-text font-semibold cursor-pointer text-sm">Este item é um Kit (Composto por outros produtos)</label>
                </div>
                <button disabled={loadingProd} type="submit" className="w-full mt-5 py-3.5 bg-ml-blue hover:bg-ml-blue-dark rounded-md font-semibold text-white transition-colors flex justify-center gap-2.5 text-sm">
                  {loadingProd ? <Loader2 className="w-5 h-5 animate-spin"/> : <Plus className="w-5 h-5"/>} Salvar Produto no Banco
                </button>
              </form>
            </section>

            {/* LISTA DE PRODUTOS CADASTRADOS (CARDS) */}
            <section className="col-span-3 bg-white border border-ml-gray-border rounded-lg p-5 shadow-sm flex flex-col h-full">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <h2 className="text-base font-semibold text-ml-gray-text flex items-center gap-2.5"><Box className="w-5 h-5 text-ml-blue" /> Banco de Dados Interno</h2>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <input type="text" placeholder="Buscar SKU ou Nome..." className="pl-9 pr-3 py-1.5 text-xs bg-white border border-ml-gray-border rounded-md outline-none focus:border-ml-blue focus:ring-1 focus:ring-ml-blue"/>
                        <Search className="w-4 h-4 text-ml-gray-muted absolute left-3 top-1/2 -translate-y-1/2"/>
                    </div>
                    <button onClick={buscarProdutos} className="p-2 hover:bg-ml-gray-bg rounded-lg text-ml-gray-muted hover:text-ml-blue"><RefreshCw className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                {produtos.length === 0 ? <p className="text-center text-xs text-ml-gray-muted mt-12 italic">Nenhum produto cadastrado internamente.</p> : produtos.map(prod => (
                  <div key={prod.id} className="bg-white border border-ml-gray-border p-4 rounded-lg flex justify-between items-center hover:shadow-md transition-shadow">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ml-blue bg-ml-blue/5 px-2 py-0.5 rounded border border-ml-blue/10">{prod.sku}</span>
                        {prod.eKit && <span className="text-[9px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded border border-orange-200 uppercase font-bold tracking-wider">KIT</span>}
                      </div>
                      <p className="text-sm font-semibold mt-1.5 text-ml-gray-text">{prod.nome}</p>
                      <p className="text-xs text-ml-gray-muted mt-1">
                        ID ML: <span className="font-medium text-ml-gray-text">{prod.mlItemId || 'Não vinculado'}</span> | 
                        Preço Base: <span className="font-medium text-ml-gray-text">R$ {prod.preco.toFixed(2)}</span> | 
                        Peso: <span className="font-medium text-ml-gray-text">{prod.pesoGramas}g</span>
                      </p>
                    </div>
                    {prod.eKit && (
                      <button className="text-xs bg-ml-gray-bg hover:bg-ml-gray-border px-4 py-2 rounded-md font-semibold text-ml-gray-text border border-ml-gray-border transition-colors">
                        Gerenciar Composição
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