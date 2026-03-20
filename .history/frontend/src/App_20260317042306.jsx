import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, 
  Bot, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function App() {
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState('bot');

  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('Aguardando...');
  const [logs, setLogs] = useState([{ msg: 'Pronto para iniciar conexão com a API...', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  const [carregandoDiv, setCarregandoDiv] = useState(false);
  const terminalRef = useRef(null);

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
    switch(type) { case 'info': return 'text-sky-400'; case 'warn': return 'text-yellow-400'; case 'error': return 'text-red-400'; case 'success': return 'text-emerald-400'; default: return 'text-white'; }
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 flex flex-col relative font-sans text-white overflow-hidden transition-all duration-300" style={{ zoom: zoom }}>
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none z-0"></div>
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-600 rounded-full mix-blend-multiply filter blur-[100px] opacity-30 animate-pulse"></div>

      <div className="flex-1 flex flex-col p-6 gap-6 z-10 w-full max-w-7xl mx-auto h-full">
        
        <header className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 px-6 shadow-2xl flex justify-between items-center shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 border-r border-white/10 pr-6">
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 text-emerald-300"><Bot className="w-6 h-6" /></div>
              <div><h1 className="text-xl font-bold tracking-tight">Bot ML API</h1><p className="text-xs text-emerald-200/70">Painel do Vendedor</p></div>
            </div>
            
            <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
              <button onClick={() => setActiveTab('bot')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-