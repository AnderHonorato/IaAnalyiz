import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag, CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, Image as ImageIcon, Link2, Square, CheckSquare, 
  Eye, Sparkles, Upload, HelpCircle, Unlink, LayoutList, FileText, Maximize2, Minimize2, ArrowLeft, Settings, 
  Wifi, WifiOff, FileSearch, History, Play, Pause
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

const STATUS_CONFIG = {
  PENDENTE:    { label: 'Pendente',      color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: Clock },
  REINCIDENTE: { label: 'Reincidente',   color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', icon: AlertTriangle },
  CORRIGIDO:   { label: 'Corrigido',     color: 'text-emerald-600',bg: 'bg-emerald-50',border: 'border-emerald-200', icon: CheckCircle2 },
  IGNORADO:    { label: 'Ignorado',      color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-200',  icon: EyeOff },
};

const FORM_INICIAL = {
  sku: '', nome: '', preco: '', mlItemId: '',
  peso: '', unidadePeso: 'g', alturaCm: '', larguraCm: '', comprimentoCm: '',
  eKit: false, categoria: '', plataforma: 'Mercado Livre'
};

const INTERVALOS = [
  { label: '30 min',  value: 30 },
  { label: '1 hora',  value: 60 },
  { label: '2 horas', value: 120 },
  { label: '4 horas', value: 240 },
  { label: '24 horas',value: 1440 },
];

function formatarProxima(dt) {
  if (!dt) return '—';
  const diff = new Date(dt) - Date.now();
  if (diff <= 0) return 'Agora';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `em ${h}h ${m}m`;
  return `em ${m}m`;
}

export default function MercadoLivre() {
  const { userId, userRole } = useOutletContext() || {};
  const navigate = useNavigate();
  const { confirm, alert } = useModal();
  
  const [activeTab, setActiveTab] = useState('bot');
  const [mlConectado, setMlConectado] = useState(false);
  const [mlNickname, setMlNickname] = useState('');
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([{ msg: `[${new Date().toLocaleTimeString('pt-BR')}] IA_Analyiz Módulo Analítico Carregado. Aguardando comandos.`, type: 'info' }]);
  const [aiInsight, setAiInsight] = useState('');

  const [fullScreenMode, setFullScreenMode] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showDicas, setShowDicas] = useState(false);
  const [showResumoModal, setShowResumoModal] = useState(false);
  const [resumoIA, setResumoIA] = useState('');
  const [historicoResumos, setHistoricoResumos] = useState([]);
  const [loadingResumo, setLoadingResumo] = useState(false);
  
  const [quickViewItem, setQuickViewItem] = useState(null); 
  const [fullModalItem, setFullModalItem] = useState(null); 
  const [fullItemData, setFullItemData]   = useState(null); 
  const [loadingFullData, setLoadingFullData] = useState(false);

  const [divergencias, setDivergencias] = useState([]);
  const [divStats, setDivStats] = useState({ pendente: 0, reincidente: 0, corrigido: 0, ignorado: 0, total: 0 });
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE');
  const [buscaDiv, setBuscaDiv] = useState('');
  const [selectedDivs, setSelectedDivs] = useState(new Set());

  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formProd, setFormProd] = useState(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [loadingProd, setLoadingProd] = useState(false);
  const [searchProd, setSearchProd] = useState('');
  const [selectedProds, setSelectedProds] = useState(new Set());
  const [tipoCatalogo, setTipoCatalogo] = useState('BASE'); 

  const [naoVinculados, setNaoVinculados] = useState([]);
  const [selectedNaoVinc, setSelectedNaoVinc] = useState(new Set());
  const [buscaNaoVinc, setBuscaNaoVinc] = useState('');

  const [vincularAnuncio, setVincularAnuncio] = useState(null);
  const [composicaoKit, setComposicaoKit] = useState([]); 
  const [buscaBase, setBuscaBase] = useState('');
  const [pesoManual, setPesoManual] = useState('');
  const [unidadeManual, setUnidadeManual] = useState('g');
  
  const [agendador, setAgendador] = useState(null);
  const [intervalo, setIntervalo] = useState(360);
  const [savingAgendador, setSavingAgendador] = useState(false);
  const [modoLento, setModoLento] = useState(false);

  const terminalRef = useRef(null);
  useEffect(() => { 
    if (terminalRef.current) setTimeout(() => { terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, 50);
  }, [logs]);

  useEffect(() => {
    if (!userId) return;
    verificarStatusML(); buscarDivergencias(); buscarDivStats(); buscarProdutos(); buscarNaoVinculados(); buscarCategorias(); buscarInsightIA();
    const t = setInterval(() => setAgendador(a => a ? { ...a } : a), 30000);
    return () => clearInterval(t);
  }, [userId]);

  useEffect(() => { if (userId) buscarDivergencias(); }, [filtroStatus, userId]);

  const apiGet = useCallback(async (path) => { const res = await fetch(`${API_BASE_URL}${path}`); return res.json(); }, []);

  const toggleSelectAll = (items, selected, setSelected, key = 'id') => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i[key])));
  };

  const verificarStatusML = async () => {
    try {
      const data = await apiGet(`/api/ml/status?userId=${userId}`);
      setMlConectado(data.connected && !data.expired);
      setMlNickname(data.nickname);
      const conf = await apiGet(`/api/agendador?userId=${userId}`);
      setAgendador(conf); setIntervalo(conf?.intervalo || 360);
    } catch {}
  };

  const conectarML = async () => {
    try {
      const data = await apiGet(`/api/ml/auth-url?userId=${userId}`);
      if (data.url) window.location.href = data.url;
    } catch { alert({ title: 'Erro', message: 'Falha ao buscar URL de auth.' }); }
  };

  const desconectarML = async () => {
    if (!await confirm({ title: 'Desconectar', message: 'Deseja desconectar a conta do Mercado Livre?' })) return;
    await fetch(`${API_BASE_URL}/api/ml/disconnect?userId=${userId}`, { method: 'DELETE' });
    verificarStatusML(); setShowConfig(false);
  };

  const salvarAgendador = async (novoAtivo, novoIntervalo) => {
    setSavingAgendador(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agendador`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ativo: novoAtivo, intervalo: novoIntervalo })
      });
      const data = await res.json();
      setAgendador(data); setIntervalo(data.intervalo);
    } catch {} finally { setSavingAgendador(false); }
  };

  const buscarInsightIA = async () => {
    try {
      const data = await apiGet(`/api/ia/proactive?userId=${userId}&userRole=${userRole}&pageKey=divergencias`);
      if (data.insight) setAiInsight(data.insight);
    } catch {}
  };

  const gerarResumoLogistico = async () => {
    setShowResumoModal(true); setLoadingResumo(true);
    try {
      const dadosStr = `Temos ${divStats.pendente} div. pendentes, ${divStats.reincidente} reincidentes. ${naoVinculados.length} anúncios não vinculados no ML.`;
      const res = await fetch(`${API_BASE_URL}/api/ia/summary`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, dados: dadosStr })
      });
      const data = await res.json();
      setResumoIA(data.conteudo); buscarHistoricoResumos();
    } catch { setResumoIA('Erro ao processar resumo.'); }
    finally { setLoadingResumo(false); }
  };

  const buscarHistoricoResumos = async () => { try { setHistoricoResumos(await apiGet(`/api/ia/summary/history?userId=${userId}`)); } catch {} };

  const abrirFullModal = async (item) => {
    setQuickViewItem(null); setFullModalItem(item); setFullItemData(null);
    if (!item.mlItemId) return;
    setLoadingFullData(true);
    try { setFullItemData(await apiGet(`/api/ml/item-details/${item.mlItemId}?userId=${userId}`)); } 
    catch { alert({ title: 'Erro', message: 'Falha ao conectar com Mercado Livre.' }); } 
    finally { setLoadingFullData(false); }
  };

  const buscarDivergencias = async () => {
    setLoadingDiv(true);
    try { setDivergencias(await apiGet(`/api/divergencias?status=${filtroStatus}&plataforma=Mercado Livre&userId=${userId}`) || []); } 
    catch {} finally { setLoadingDiv(false); }
  };

  const buscarDivStats = async () => { try { setDivStats(await apiGet(`/api/divergencias/stats?userId=${userId}`)); } catch {} };

  const acaoDiv = async (id, tipo) => {
    try { await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' }); await buscarDivergencias(); await buscarDivStats(); } catch {}
  };

  const acaoLoteDivs = async (tipo) => {
    if (selectedDivs.size === 0) return;
    if (tipo === 'excluir' && !await confirm({ title: 'Excluir', message: `Remover ${selectedDivs.size} registros?`, confirmLabel: 'Excluir', danger: true })) return;
    for (const id of selectedDivs) {
      if (tipo === 'excluir') await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' });
    }
    setSelectedDivs(new Set()); await buscarDivergencias(); await buscarDivStats();
  };

  const buscarNaoVinculados = async () => { try { setNaoVinculados(await apiGet(`/api/produtos?plataforma=ML_PENDENTE&userId=${userId}`) || []); } catch {} };

  const acaoLoteNaoVinculados = async (acaoStr) => {
    if (selectedNaoVinc.size === 0) return;
    for (const id of selectedNaoVinc) {
      if (acaoStr === 'excluir') await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plataforma: 'ML_IGNORADO' }) });
    }
    setSelectedNaoVinc(new Set()); await buscarNaoVinculados(); await buscarProdutos();
  };

  const buscarProdutos = async () => { try { setProdutos(await apiGet(`/api/produtos?userId=${userId}`) || []); } catch {} };
  const buscarCategorias = async () => { try { setCategorias(await apiGet(`/api/produtos/categorias?userId=${userId}`)); } catch {} };

  const handleSubmitProduto = async (e) => {
    e.preventDefault();
    setLoadingProd(true);
    let pesoConvertido = parseFloat(formProd.peso) || 0;
    if (formProd.unidadePeso === 'kg') pesoConvertido = pesoConvertido * 1000;
    try {
      const url = editandoId ? `${API_BASE_URL}/api/produtos/${editandoId}` : `${API_BASE_URL}/api/produtos`;
      await fetch(url, { method: editandoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ ...formProd, pesoGramas: pesoConvertido, userId, plataforma: formProd.mlItemId ? 'Mercado Livre' : 'BASE' }) });
      setFormProd(FORM_INICIAL); setEditandoId(null); await buscarProdutos();
    } catch {} finally { setLoadingProd(false); }
  };

  const excluirProduto = async (id) => {
    if (!await confirm({ title: 'Excluir', message: 'Remover produto do catálogo?', confirmLabel: 'Excluir', danger: true })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' }); await buscarProdutos(); } catch {}
  };

  const desvincularProduto = async (id) => {
    if (!await confirm({ title: 'Desvincular', message: 'O anúncio voltará para Não Vinculados. Continuar?', confirmLabel: 'Desvincular' })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}/desvincular`, { method: 'PUT' }); await buscarProdutos(); await buscarNaoVinculados(); } catch {}
  };

  const excluirLoteProdutos = async () => {
    if (selectedProds.size === 0) return;
    if (!await confirm({ title: 'Excluir', message: `Excluir ${selectedProds.size} produto(s)?`, confirmLabel: 'Excluir', danger: true })) return;
    for (const id of selectedProds) await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
    setSelectedProds(new Set()); await buscarProdutos();
  };

  const salvarVinculacao = async () => {
    let pManualConvertido = parseFloat(pesoManual) || 0;
    if (unidadeManual === 'kg') pManualConvertido = pManualConvertido * 1000;
    try {
      await fetch(`${API_BASE_URL}/api/produtos/${vincularAnuncio.id}/vincular`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composicao: composicaoKit.map(c => ({ produtoId: c.produto.id, quantidade: c.quantidade })), pesoManual: pManualConvertido }) });
      setVincularAnuncio(null); await buscarNaoVinculados(); await buscarProdutos();
    } catch {}
  };

  const iniciarBot = () => {
    if (!userId) return;
    setIsBotRunning(true); setProgress(0); setLogs([{ msg: `[${new Date().toLocaleTimeString('pt-BR')}] Acordando IA Analyiz e conectando aos servidores...`, type: 'info' }]);
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream?userId=${userId}&modoLento=${modoLento}`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.msg) setLogs(p => [...p, { msg: data.msg, type: data.type }]);
        if (data.percent !== undefined) setProgress(data.percent);
        if (data.type === 'done') { setIsBotRunning(false); eventSource.close(); buscarDivergencias(); buscarDivStats(); buscarNaoVinculados(); buscarInsightIA(); }
      } catch (_) {}
    };
    eventSource.onerror = () => { setIsBotRunning(false); eventSource.close(); };
  };

  const divsFiltradas = divergencias.filter(d => !buscaDiv || (d.titulo || '').toLowerCase().includes(buscaDiv.toLowerCase()) || (d.mlItemId || '').toLowerCase().includes(buscaDiv.toLowerCase()));
  const nVincFiltrados = naoVinculados.filter(p => !buscaNaoVinc || p.nome.toLowerCase().includes(buscaNaoVinc.toLowerCase()) || (p.mlItemId || '').toLowerCase().includes(buscaNaoVinc.toLowerCase()));
  const produtosFiltrados = produtos.filter(p => {
    const matchTipo = tipoCatalogo === 'BASE' ? !p.mlItemId : !!p.mlItemId;
    const matchBusca = !searchProd || p.nome.toLowerCase().includes(searchProd.toLowerCase()) || p.sku.toLowerCase().includes(searchProd.toLowerCase()) || (p.mlItemId || '').toLowerCase().includes(searchProd.toLowerCase());
    return matchTipo && matchBusca && p.plataforma !== 'ML_PENDENTE' && p.plataforma !== 'ML_IGNORADO';
  });
  const produtosBaseParaBusca = produtos.filter(p => !p.mlItemId && p.plataforma !== 'ML_PENDENTE' && (!buscaBase || p.nome.toLowerCase().includes(buscaBase.toLowerCase()))).slice(0, 5);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-2 h-full flex flex-col relative animate-in fade-in duration-300">
      
      {/* ── HEADER ORGANIZADO E LIMPO ── */}
      {!fullScreenMode && (
        <div className="flex flex-col xl:flex-row justify-between xl:items-start mb-4 shrink-0 gap-3 relative z-10">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => navigate('/ml')} className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500" title="Voltar"><ArrowLeft className="w-4 h-4" /></button>
              <h2 className="text-lg font-black tracking-tight text-slate-800 whitespace-nowrap">Gestão ML</h2>
            </div>
            {/* MENSAGEM DA IA: TEXTO LIMPO, SEM BORDA, COM SCROLL MAX-H */}
            <div className="hidden md:flex flex-col max-h-[50px] overflow-y-auto custom-scrollbar max-w-md pl-2">
               {aiInsight && <span className="text-[11px] font-semibold text-slate-600 leading-snug break-words" dangerouslySetInnerHTML={{ __html: aiInsight.replace(/Tenho novos dados para você:/i, '') }} />}
            </div>
          </div>
          
          <div className="flex items-center flex-wrap gap-2 justify-end">
            <nav className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              {[['bot', 'Scanner ML'], ['pendentes', `Não Vinculados (${naoVinculados.length})`], ['produtos', 'Catálogo Local']].map(([k, l]) => (
                <button key={k} onClick={() => setActiveTab(k)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === k ? 'bg-slate-900 text-[#FFE600] shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </nav>
            <div className="flex gap-1.5">
              <button onClick={() => { buscarHistoricoResumos(); setShowResumoModal(true); }} className="flex items-center gap-1 px-2 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 shadow-sm border border-indigo-100 text-[10px] font-black uppercase" title="Gerar Resumo">
                <FileSearch className="w-3.5 h-3.5" /> Resumir
              </button>
              <button onClick={() => setShowDicas(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 shadow-sm" title="Ajuda">
                <HelpCircle className="w-4 h-4" />
              </button>
              <button onClick={() => setShowConfig(true)} className="p-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 shadow-sm" title="Configurações">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MÓDULOS DE CONTEÚDO (Z-INDEX 999999 p/ TELA CHEIA) ── */}
      <div className={`relative flex-1 min-h-0 transition-all duration-300 ${fullScreenMode ? 'fixed inset-0 z-[999999] bg-[#f8fafc] p-3 sm:p-5' : ''}`}>
        
        {/* ── ABA SCANNER ── */}
        {activeTab === 'bot' && (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 h-full">
            <section className="xl:col-span-2 bg-white border border-slate-200 rounded-3xl shadow-md flex flex-col overflow-hidden h-full">
              <div className="p-4 border-b border-slate-100">
                <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado} className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest mb-3 transition-all shadow-sm ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {isBotRunning ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Auditando ML...</span> : !mlConectado ? '🔒 Conecte o ML na Engrenagem' : '🔍 Iniciar Varredura'}
                </button>
                <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest mb-1.5">
                    <span className="text-slate-400 flex items-center gap-1.5">Progresso IA {mlConectado ? <Wifi className="w-2.5 h-2.5 text-emerald-400"/> : <WifiOff className="w-2.5 h-2.5 text-red-400"/>}</span>
                    <span className="text-emerald-400">{progress}%</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }}></div></div>
                </div>
              </div>
              <div ref={terminalRef} className="flex-1 bg-slate-950 m-3 mt-0 rounded-xl p-4 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
                {logs.map((log, i) => (
                  <div key={i} className={`text-[10px] font-mono leading-relaxed ${log.type === 'warn' ? 'text-amber-400 font-bold' : log.type === 'success' ? 'text-emerald-400 font-bold' : 'text-slate-300'}`}>
                    <span className="mr-2 text-slate-600 select-none">❯</span>{log.msg}
                  </div>
                ))}
              </div>
            </section>

            <section className="xl:col-span-3 bg-white border border-slate-200 rounded-3xl shadow-md flex flex-col overflow-hidden h-full">
              <div className="p-4 border-b border-slate-100">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-slate-700">
                    <AlertTriangle className="text-amber-500 w-4 h-4" /> Divergências Encontradas
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectedDivs.size > 0 && (
                      <div className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 shadow-sm">
                        <span className="text-[9px] font-black text-blue-700 px-1">{selectedDivs.size} sel.</span>
                        <button onClick={() => acaoLoteDivs('corrigido')} className="p-1 text-emerald-600 hover:bg-white rounded"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => acaoLoteDivs('ignorado')} className="p-1 text-slate-500 hover:bg-white rounded"><EyeOff className="w-3.5 h-3.5" /></button>
                        <button onClick={() => acaoLoteDivs('excluir')} className="p-1 text-red-500 hover:bg-white rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                    <button onClick={() => { buscarDivergencias(); buscarDivStats(); }} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-sm"><RefreshCw className="w-3.5 h-3.5 text-slate-600" /></button>
                    <button onClick={() => setFullScreenMode(!fullScreenMode)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-sm">
                      {fullScreenMode ? <Minimize2 className="w-3.5 h-3.5 text-slate-600" /> : <Maximize2 className="w-3.5 h-3.5 text-slate-600" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-2 flex-wrap">
                  <div className="flex gap-1 flex-wrap">
                    {['PENDENTE', 'REINCIDENTE', 'CORRIGIDO', 'IGNORADO', 'TODOS'].map(s => {
                      const cfg = STATUS_CONFIG[s] || { label: 'Todos', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' };
                      const count = s === 'TODOS' ? divStats.total : (divStats[s.toLowerCase()] || 0);
                      return (
                        <button key={s} onClick={() => setFiltroStatus(s)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${filtroStatus === s ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm ring-1 ring-offset-1 ring-${cfg.color.split('-')[1]}-200` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                          {cfg.label} <span className="bg-white/60 px-1 rounded text-[9px]">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="relative flex-1 min-w-[150px]">
                    <Search className="absolute left-2.5 top-2 w-3 h-3 text-slate-400"/>
                    <input value={buscaDiv} onChange={e => setBuscaDiv(e.target.value)} placeholder="Filtrar por nome ou ID..." className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-[10px]" />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {divsFiltradas.length === 0 ? (
                  <div className="py-20 flex flex-col items-center gap-3"><div className="p-3 bg-emerald-100 rounded-full"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div><p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Zero Anomalias</p></div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 shadow-sm z-10">
                      <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <th className="px-4 py-2.5 w-8"><button onClick={() => toggleSelectAll(divsFiltradas, selectedDivs, setSelectedDivs, 'id')} className="text-slate-400">{selectedDivs.size === divsFiltradas.length && divsFiltradas.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th>
                        <th className="px-4 py-2.5">Anúncio ML</th><th className="px-4 py-2.5">Relatório de Divergência</th><th className="px-4 py-2.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[10px]">
                      {divsFiltradas.map((div) => {
                        const cfg = STATUS_CONFIG[div.status] || STATUS_CONFIG.PENDENTE;
                        const sel = selectedDivs.has(div.id);
                        return (
                          <tr key={div.id} className={`hover:bg-slate-50/80 transition-colors ${sel ? 'bg-blue-50/30' : ''}`}>
                            <td className="px-4 py-2.5"><button onClick={() => { const n = new Set(selectedDivs); sel ? n.delete(div.id) : n.add(div.id); setSelectedDivs(n); }} className="text-slate-400">{sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}</button></td>
                            <td className="py-2.5 px-4">
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm ${cfg.bg} ${cfg.color} flex items-center gap-1 w-fit mb-1 border ${cfg.border}`}><cfg.icon className="w-2.5 h-2.5" />{cfg.label}</span>
                              <p className="font-bold text-slate-800 text-[11px] truncate max-w-[200px]">{div.titulo || div.mlItemId}</p>
                              <p className="text-slate-400 text-[9px] font-mono mt-0.5">{div.mlItemId}</p>
                            </td>
                            <td className="py-2.5 px-4"><p className="text-slate-600 text-[10px] font-medium leading-relaxed max-w-[250px]">{div.motivo}</p></td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1 relative">
                                <div onMouseEnter={() => setQuickViewItem(div)} onMouseLeave={() => setQuickViewItem(null)}>
                                  <button onClick={() => abrirFullModal(div)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                                  {quickViewItem?.id === div.id && <QuickViewPopover item={div} onClose={() => setQuickViewItem(null)} onOpenFull={abrirFullModal} />}
                                </div>
                                {div.status !== 'CORRIGIDO' && <button onClick={() => acaoDiv(div.id, 'corrigido')} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check className="w-3.5 h-3.5" /></button>}
                                {div.status !== 'IGNORADO' && <button onClick={() => acaoDiv(div.id, 'ignorado')} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><EyeOff className="w-3.5 h-3.5" /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ── ABA NÃO VINCULADOS ── */}
        {activeTab === 'pendentes' && (
          <section className="bg-white border border-slate-200 rounded-3xl shadow-md flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-amber-50/30 flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="text-[14px] font-black text-amber-800 uppercase flex items-center gap-2"><Box className="w-5 h-5" /> Anúncios Desconhecidos</h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-amber-600/50"/>
                  <input value={buscaNaoVinc} onChange={e => setBuscaNaoVinc(e.target.value)} placeholder="Pesquisar fantasma..." className="w-full pl-7 pr-2 py-1.5 bg-white border border-amber-200 rounded-lg outline-none focus:border-amber-400 text-[10px]" />
                </div>
                {selectedNaoVinc.size > 0 && (
                  <div className="flex items-center gap-1 bg-white border border-amber-200 rounded-lg px-2 py-1 shadow-sm">
                    <span className="text-[9px] font-black text-amber-700 mr-1">{selectedNaoVinc.size} sel.</span>
                    <button onClick={() => acaoLoteNaoVinculados('ignorado')} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><EyeOff className="w-3.5 h-3.5"/></button>
                    <button onClick={() => acaoLoteNaoVinculados('excluir')} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                )}
                <button onClick={buscarNaoVinculados} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600"><RefreshCw className="w-3.5 h-3.5" /></button>
                <button onClick={() => setFullScreenMode(!fullScreenMode)} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600">
                  {fullScreenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {nVincFiltrados.length === 0 ? (
                <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[12px]">Tudo mapeado!</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100 shadow-sm z-10">
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400"><th className="px-5 py-3 w-10"><button onClick={() => toggleSelectAll(nVincFiltrados, selectedNaoVinc, setSelectedNaoVinc, 'id')} className="text-slate-400">{selectedNaoVinc.size === nVincFiltrados.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}</button></th><th className="px-5 py-3">Produto ML</th><th className="px-5 py-3 text-right">Ação</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[11px]">
                    {nVincFiltrados.map(prod => {
                      const sel = selectedNaoVinc.has(prod.id);
                      return (
                        <tr key={prod.id} className={`hover:bg-slate-50/60 transition-colors ${sel ? 'bg-amber-50/30' : ''}`}>
                          <td className="px-5 py-3"><button onClick={() => { const n = new Set(selectedNaoVinc); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedNaoVinc(n); }} className="text-slate-400 hover:text-amber-500">{sel ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4" />}</button></td>
                          <td className="px-5 py-3 flex items-center gap-3">
                            {prod.thumbnail ? <img src={prod.thumbnail} className="w-10 h-10 object-cover rounded-lg border border-slate-100" /> : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                            <div>
                              <p className="font-bold text-slate-800 max-w-[350px] truncate">{prod.nome}</p>
                              <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block border border-slate-200">{prod.mlItemId}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 relative">
                              <div onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}>
                                <button onClick={() => abrirFullModal(prod)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"><Eye className="w-3.5 h-3.5" /></button>
                                {quickViewItem?.id === prod.id && <QuickViewPopover item={prod} onClose={() => setQuickViewItem(null)} onOpenFull={abrirFullModal} />}
                              </div>
                              <button onClick={() => { abrirModalVincular(prod); setQuickViewItem(null); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-black uppercase shadow-sm">
                                <Link2 className="w-3 h-3" /> Vincular
                              </button>
                              <button onClick={() => acaoNaoVinculadoBasica(prod.id, 'ignorado')} className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100"><EyeOff className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ── ABA CATÁLOGO ── */}
        {activeTab === 'produtos' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full">
            <section className="col-span-2 bg-white border border-slate-200 rounded-3xl shadow-md flex flex-col overflow-hidden h-full">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="font-black text-[11px] uppercase flex items-center gap-1.5 text-slate-800"><Plus className="w-3.5 h-3.5 text-blue-600" /> {editandoId ? 'Editar Ficha' : 'Registro Base'}</h2>
                <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded uppercase"><Upload className="w-3 h-3"/> CSV</button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <form onSubmit={handleSubmitProduto} className="space-y-4 text-[10px] font-semibold text-slate-600">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="uppercase tracking-widest block mb-1">SKU Interno</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-blue-500 text-[11px]" /></div>
                    <div><label className="uppercase tracking-widest block mb-1">Categoria</label><input value={formProd.categoria} onChange={e => setFormProd({...formProd, categoria: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-blue-500 text-[11px]" list="cat-list" /><datalist id="cat-list">{categorias.map(c => <option key={c} value={c} />)}</datalist></div>
                  </div>
                  <div><label className="uppercase tracking-widest block mb-1">Nome Físico</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-blue-500 text-[11px]" /></div>
                  <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1.5 mb-2"><Weight className="w-4 h-4" /> Peso Unitário Físico</p>
                    <div className="flex gap-2">
                      <input required type="number" step="any" min="0" value={formProd.peso} onChange={e => setFormProd({...formProd, peso: e.target.value})} className="flex-1 bg-white border border-blue-200 rounded-xl p-2.5 outline-none focus:border-blue-500 text-[12px] font-bold" />
                      <select value={formProd.unidadePeso} onChange={e => setFormProd({...formProd, unidadePeso: e.target.value})} className="bg-white border border-blue-200 rounded-xl px-3 text-[11px] font-black text-blue-700 outline-none"><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select>
                    </div>
                  </div>
                  <button type="submit" disabled={loadingProd} className="w-full py-3 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all shadow-sm mt-2">{loadingProd ? 'Salvando...' : '📥 Salvar no Estoque'}</button>
                </form>
              </div>
            </section>

            <section className="col-span-3 bg-white border border-slate-200 rounded-3xl shadow-md flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center flex-wrap gap-3">
                <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1">
                  <button onClick={() => setTipoCatalogo('BASE')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${tipoCatalogo === 'BASE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>Produtos Base</button>
                  <button onClick={() => setTipoCatalogo('ML')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${tipoCatalogo === 'ML' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>Anúncios Vinculados</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                    <input value={searchProd} onChange={e => setSearchProd(e.target.value)} placeholder="Pesquisar catálogo..." className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-[10px]" />
                  </div>
                  {selectedProds.size > 0 && <button onClick={excluirLoteProdutos} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => setFullScreenMode(!fullScreenMode)} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                    {fullScreenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100 shadow-sm">
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400"><th className="px-4 py-3 w-8"><button onClick={() => toggleSelectAll(produtosFiltrados, selectedProds, setSelectedProds)} className="text-slate-400">{selectedProds.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Peso</th><th className="px-4 py-3 text-right">Ação</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[11px]">
                    {produtosFiltrados.length === 0 && <tr><td colSpan="4" className="py-12 text-center text-slate-400 text-[11px] font-black uppercase tracking-widest">Catálogo Vazio</td></tr>}
                    {produtosFiltrados.map(prod => {
                      const sel = selectedProds.has(prod.id);
                      return (
                        <tr key={prod.id} className={`hover:bg-slate-50/80 transition-colors ${sel ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-4 py-3"><button onClick={() => { const n = new Set(selectedProds); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedProds(n); }} className="text-slate-400 hover:text-blue-600">{sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}</button></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {prod.thumbnail ? <img src={prod.thumbnail} className="w-10 h-10 rounded-lg object-cover shadow-sm border border-slate-100" /> : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                              <div>
                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                  <span className="text-[8px] font-black text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{prod.sku}</span>
                                  {prod.mlItemId && <span className="text-[8px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Check className="w-2.5 h-2.5"/> {prod.mlItemId}</span>}
                                </div>
                                <p className="text-[12px] font-bold text-slate-800 truncate max-w-[200px]">{prod.nome}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className="text-[10px] text-blue-700 font-black bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg shadow-sm">{prod.pesoGramas}g</span></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5 relative">
                              <div onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}>
                                <button onClick={() => abrirFullModal(prod)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100"><Eye className="w-4 h-4" /></button>
                                {quickViewItem?.id === prod.id && <QuickViewPopover item={prod} onClose={() => setQuickViewItem(null)} onOpenFull={abrirFullModal} />}
                              </div>
                              {prod.mlItemId && <button onClick={() => desvincularProduto(prod.id)} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100" title="Desvincular"><Unlink className="w-4 h-4" /></button>}
                              <button onClick={() => excluirProduto(prod.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── MODAIS FIXOS (POR CIMA DE TUDO) ── */}

      {fullModalItem && (
        <div className="fixed inset-0 z-[999999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-3xl">
              <h3 className="font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4 text-blue-600"/> Integração Direta: Mercado Livre</h3>
              <button onClick={() => setFullModalItem(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500"><XCircle className="w-6 h-6"/></button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 custom-scrollbar rounded-b-3xl">
              {loadingFullData ? (
                <div className="flex flex-col items-center justify-center py-20 text-blue-500"><Loader2 className="w-8 h-8 animate-spin mb-3"/><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Puxando dados do ML...</p></div>
              ) : fullItemData ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5 space-y-4">
                    <div className="bg-white rounded-2xl p-2 border border-slate-200 flex items-center justify-center h-64 shadow-sm">
                      {fullItemData.pictures?.length > 0 ? <img src={fullItemData.pictures[0].url} className="max-h-full max-w-full object-contain rounded-lg" /> : <ImageIcon className="w-12 h-12 text-slate-200"/>}
                    </div>
                    {fullItemData.pictures?.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {fullItemData.pictures.slice(1, 5).map((pic, idx) => (
                          <img key={idx} src={pic.url} className="w-16 h-16 object-cover rounded-xl border border-slate-200 shadow-sm" />
                        ))}
                      </div>
                    )}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded font-black border border-blue-100">{fullItemData.id}</span>
                      <h2 className="text-sm font-bold text-slate-800 mt-2 leading-snug">{fullItemData.title}</h2>
                      <p className="text-2xl font-black text-emerald-600 mt-2 flex items-baseline gap-1"><span className="text-sm">R$</span> {fullItemData.price}</p>
                      <a href={fullItemData.permalink} target="_blank" className="mt-4 flex items-center justify-center gap-1.5 w-full py-3 bg-[#FFE600] text-slate-900 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-sm">
                        <ExternalLink className="w-4 h-4"/> Ver Original no ML
                      </a>
                    </div>
                  </div>
                  <div className="lg:col-span-7 space-y-4">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="text-[11px] font-black uppercase text-slate-400 border-b border-slate-100 pb-2 mb-4 flex items-center gap-1.5"><LayoutList className="w-4 h-4"/> Ficha Técnica</h4>
                      <div className="grid grid-cols-2 gap-4 text-[11px]">
                        {fullItemData.attributes?.filter(a => a.value_name).slice(0, 10).map(attr => (
                          <div key={attr.id} className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                            <span className="text-slate-400 block uppercase font-bold tracking-widest mb-0.5">{attr.name}</span>
                            <span className="text-slate-700 font-bold">{attr.value_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="text-[11px] font-black uppercase text-slate-400 border-b border-slate-100 pb-2 mb-4 flex items-center gap-1.5"><FileText className="w-4 h-4"/> Descrição</h4>
                      <div className="text-[12px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-slate-50/50 p-4 rounded-xl border border-slate-100 custom-scrollbar">
                        {fullItemData.description_text || 'Sem descrição.'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400 text-[11px] uppercase font-black">Falha ao obter dados do ML</div>
              )}
            </div>
          </div>
        </div>
      )}

      {vincularAnuncio && (
        <div className="fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-white flex justify-between items-center z-10 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase text-[12px] tracking-tight flex items-center gap-2"><Link2 className="w-5 h-5 text-emerald-600"/> Vincular Anúncio</h3>
              <button onClick={() => setVincularAnuncio(null)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex gap-4 items-center">
                {vincularAnuncio.thumbnail ? <img src={vincularAnuncio.thumbnail} className="w-14 h-14 object-cover rounded-xl border border-slate-100" /> : <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center"><ImageIcon className="w-5 h-5 text-slate-300"/></div>}
                <div>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-black">{vincularAnuncio.mlItemId}</span>
                  <p className="font-bold text-[12px] text-slate-800 mt-1 leading-tight line-clamp-2">{vincularAnuncio.nome}</p>
                </div>
              </div>
              <div className="mb-6">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">1. Formar Kit (Buscar Base)</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400"/>
                  <input value={buscaBase} onChange={e => setBuscaBase(e.target.value)} placeholder="Motor, Controle..." className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-[12px]" />
                </div>
                {buscaBase && (
                  <div className="mb-3 border border-slate-200 rounded-xl bg-white shadow-lg overflow-hidden">
                    {produtosBaseParaBusca.map(p => (
                      <div key={p.id} className="p-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50">
                        <div><span className="text-[12px] font-bold text-slate-700">{p.nome}</span> <span className="text-[10px] text-slate-400 ml-1">({p.pesoGramas}g)</span></div>
                        <button onClick={() => { setComposicaoKit([...composicaoKit, {produto: p, quantidade: 1}]); setBuscaBase(''); }} className="text-[10px] font-black uppercase bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg">Add</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2 mt-3">
                  {composicaoKit.map(item => (
                    <div key={item.produto.id} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <span className="text-[12px] font-bold text-slate-700 flex-1">{item.produto.nome}</span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                           <button onClick={() => { const q = item.quantidade - 1; if(q<=0) setComposicaoKit(composicaoKit.filter(c=>c.produto.id!==item.produto.id)); else setComposicaoKit(composicaoKit.map(c=>c.produto.id===item.produto.id?{...c,quantidade:q}:c)); }} className="text-slate-500 hover:text-red-500 bg-white shadow-sm p-0.5 rounded"><Minus className="w-3 h-3"/></button>
                           <span className="w-6 text-center font-black text-[12px]">{item.quantidade}</span>
                           <button onClick={() => setComposicaoKit(composicaoKit.map(c=>c.produto.id===item.produto.id?{...c,quantidade:item.quantidade+1}:c))} className="text-slate-500 hover:text-blue-500 bg-white shadow-sm p-0.5 rounded"><Plus className="w-3 h-3"/></button>
                        </div>
                        <span className="w-14 text-right text-[12px] text-emerald-600 font-black">{item.produto.pesoGramas * item.quantidade}g</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {composicaoKit.length === 0 && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">2. Ou Peso Fixo</label>
                  <div className="flex gap-2">
                    <input type="number" step="any" min="0" value={pesoManual} onChange={e => setPesoManual(e.target.value)} placeholder="Ex: 1.5" className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none w-32 text-[12px] font-bold" />
                    <select value={unidadeManual} onChange={e => setUnidadeManual(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 text-[11px] font-black text-slate-600"><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select>
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 z-10">
              <button onClick={() => setVincularAnuncio(null)} className="px-6 py-2.5 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={salvarVinculacao} disabled={composicaoKit.length === 0 && !pesoManual} className="px-8 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 shadow-md">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {showResumoModal && (
        <div className="fixed inset-0 z-[999999] bg-slate-900/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="bg-white shadow-2xl w-full max-w-md h-full flex flex-col animate-in slide-in-from-right-8">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white">
              <h3 className="font-black uppercase tracking-widest text-[12px] flex items-center gap-2"><Sparkles className="w-4 h-4"/> Resumo Executivo (IA)</h3>
              <button onClick={() => setShowResumoModal(false)} className="hover:text-indigo-200"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
              {loadingResumo ? (
                <div className="flex flex-col items-center justify-center py-20 text-indigo-500"><Loader2 className="w-8 h-8 animate-spin mb-3"/><p className="text-[11px] font-black uppercase tracking-widest text-indigo-400">Gerando insight...</p></div>
              ) : (
                <div className="text-[12px] text-slate-700 leading-relaxed bg-white p-5 rounded-2xl shadow-sm border border-slate-200" dangerouslySetInnerHTML={{ __html: resumoIA || 'Clique abaixo para gerar seu primeiro relatório.' }} />
              )}
              
              <div className="mt-8 pt-6 border-t border-slate-200">
                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-1.5"><History className="w-3.5 h-3.5"/> Histórico</h4>
                {historicoResumos.length === 0 ? <p className="text-[11px] text-slate-400">Nenhum histórico salvo.</p> : (
                  <div className="space-y-3">
                    {historicoResumos.map(h => (
                      <button key={h.id} onClick={() => setResumoIA(h.conteudo)} className="w-full text-left p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition-colors shadow-sm">
                        <p className="text-[10px] font-black text-indigo-600 mb-1">{new Date(h.createdAt).toLocaleString('pt-BR')}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-2" dangerouslySetInnerHTML={{ __html: h.conteudo }}></p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-white">
              <button onClick={gerarResumoLogistico} disabled={loadingResumo} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase shadow-md hover:bg-indigo-700 disabled:opacity-50">Gerar Novo Resumo</button>
            </div>
          </div>
        </div>
      )}

      {showDicas && (
        <div className="fixed inset-0 z-[999999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-600 text-white">
              <h3 className="font-black uppercase tracking-widest text-[12px] flex items-center gap-2"><HelpCircle className="w-5 h-5"/> Entendendo o Sistema</h3>
              <button onClick={() => setShowDicas(false)} className="text-blue-200 hover:text-white"><XCircle className="w-6 h-6"/></button>
            </div>
            <div className="p-8 space-y-6 text-[13px] text-slate-600 leading-relaxed">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100"><h4 className="font-black text-slate-800 mb-2 flex items-center gap-2"><Box className="w-4 h-4 text-amber-500"/> Não Vinculados</h4><p>Anúncios do ML sem peso. Clique em Vincular para montar o Kit ou pôr peso fixo.</p></div>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100"><h4 className="font-black text-slate-800 mb-2 flex items-center gap-2"><Package className="w-4 h-4 text-blue-500"/> Base vs Anúncios</h4><p><b>Base:</b> Peça física unitária.<br/><b>Anúncio:</b> O pacote final que você vende no ML (Soma os itens).</p></div>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100"><h4 className="font-black text-slate-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-purple-500"/> Reincidentes</h4><p>Divergências que você arrumou, mas o ML mudou de novo.</p></div>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-2"><Settings className="w-4 h-4 text-blue-600"/> Configurações</h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Conexão ML</label>
                {!mlConectado ? (
                  <button onClick={conectarML} className="w-full flex items-center justify-center gap-2 bg-[#FFE600] text-slate-900 hover:bg-[#facc15] py-3 rounded-xl text-[11px] font-black uppercase shadow-sm"><ShoppingBag className="w-4 h-4" /> Conectar Conta</button>
                ) : (
                  <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                    <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> {mlNickname || 'Vinculada'}</span>
                    <button onClick={desconectarML} className="text-[10px] font-black uppercase text-red-500 hover:bg-red-50 px-2 py-1 rounded">Desconectar</button>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-slate-100">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Modo de Varredura</label>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setModoLento(!modoLento)}>
                  <div><p className="text-[11px] font-black text-slate-800 uppercase">Standby (Anti-Timeout)</p><p className="text-[10px] text-slate-500 mt-1 max-w-[200px] leading-snug">O robô fará pausas entre as buscas para não ser bloqueado pelo ML.</p></div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${modoLento ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`absolute top-1 bg-white w-3 h-3 rounded-full transition-all ${modoLento ? 'left-6' : 'left-1'}`}></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}