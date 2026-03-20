import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag,
  CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, 
  Image as ImageIcon, Link2, Square, CheckSquare, 
  Eye, Sparkles, Upload, HelpCircle, Unlink, LayoutList, FileText, Maximize2, Minimize2
} from 'lucide-react';
import MlConfigPanel from '../components/Mlconfigpanel';
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

// ── COMPONENTE: Máquina de Escrever no Terminal ──
function TypewriterLog({ msg, type }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      setText(msg.slice(0, i));
      i++;
      if (i > msg.length) clearInterval(t);
    }, 12); // Velocidade da digitação
    return () => clearInterval(t);
  }, [msg]);

  const colorClass = type === 'warn' ? 'text-amber-400 font-bold' : type === 'success' ? 'text-emerald-400 font-bold' : 'text-slate-300';
  return <div className={colorClass}><span className="mr-2 text-slate-600 select-none">❯</span>{text}</div>;
}

// ── COMPONENTE: Insight IA Discreto e Rolável ──
function AiInsightHeader({ insight }) {
  if (!insight) return null;
  const cleanInsight = insight.replace(/Tenho novos dados para você:/i, '').trim();
  return (
    <div className="flex items-start gap-2 max-w-sm max-h-12 overflow-y-auto custom-scrollbar pr-2 mt-1">
      <Sparkles className="w-3 h-3 text-blue-600 animate-pulse mt-0.5 flex-shrink-0" />
      <p className="text-[10px] font-medium text-slate-600 leading-snug" dangerouslySetInnerHTML={{ __html: cleanInsight || insight }} />
    </div>
  );
}

function QuickViewPopover({ item, onClose, onOpenFull }) {
  if (!item) return null;
  return (
    <div className="fixed z-[9999] bg-slate-900 text-white p-3 rounded-xl shadow-2xl border border-slate-700 w-72 right-8 top-32 animate-in fade-in slide-in-from-right-8">
      <div className="flex justify-between items-start mb-2">
        <h4 className="text-[9px] font-black uppercase tracking-widest text-blue-400">Resumo</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><XCircle className="w-4 h-4"/></button>
      </div>
      <div className="flex gap-2 mb-3">
        {item.thumbnail ? <img src={item.thumbnail} className="w-10 h-10 rounded object-cover bg-white" /> : <div className="w-10 h-10 bg-slate-800 rounded flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-600"/></div>}
        <div>
          <p className="text-[11px] font-bold leading-tight line-clamp-2">{item.nome || item.titulo}</p>
          <p className="text-[9px] text-slate-400 font-mono mt-0.5">{item.mlItemId}</p>
        </div>
      </div>
      <div className="space-y-1 text-[10px] mb-3 bg-slate-800 p-2 rounded-lg border border-slate-700">
        {item.pesoMl !== undefined && <p className="flex justify-between"><span className="text-slate-400">ML:</span> <span className="font-bold text-amber-400">{item.pesoMl}g</span></p>}
        {item.pesoLocal !== undefined && <p className="flex justify-between"><span className="text-slate-400">Sistema:</span> <span className="font-bold text-emerald-400">{item.pesoLocal}g</span></p>}
        {item.pesoGramas !== undefined && <p className="flex justify-between"><span className="text-slate-400">Peso:</span> <span className="font-bold text-blue-400">{item.pesoGramas}g</span></p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <button onClick={() => onOpenFull(item)} className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-[10px] font-black uppercase">Ficha Completa</button>
      </div>
    </div>
  );
}

export default function MercadoLivre() {
  const { userId, userRole } = useOutletContext() || {};
  const { confirm, alert } = useModal();
  const [activeTab, setActiveTab] = useState('bot');
  const [mlConectado, setMlConectado] = useState(false);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([{ msg: 'IA_Analyiz carregada. Aguardando comando...', type: 'info' }]);
  const [aiInsight, setAiInsight] = useState('');
  
  const [quickViewItem, setQuickViewItem] = useState(null); 
  const [fullModalItem, setFullModalItem] = useState(null); 
  const [fullItemData, setFullItemData]   = useState(null); 
  const [loadingFullData, setLoadingFullData] = useState(false);
  const [showDicas, setShowDicas] = useState(false);

  const [fullScreenMode, setFullScreenMode] = useState(false);

  const [divergencias, setDivergencias] = useState([]);
  const [divStats, setDivStats] = useState({ pendente: 0, reincidente: 0, corrigido: 0, ignorado: 0, total: 0 });
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE');
  const [buscaDiv, setBuscaDiv] = useState('');
  const [loadingDiv, setLoadingDiv] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
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
  const [showImportModal, setShowImportModal] = useState(false);

  const terminalRef = useRef(null);
  // Auto scroll do terminal
  useEffect(() => { 
    if (terminalRef.current) {
      const scroll = () => terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      scroll();
      setTimeout(scroll, 100); 
    }
  }, [logs]);

  useEffect(() => {
    if (!userId) return;
    buscarDivergencias(); buscarDivStats(); buscarProdutos(); buscarNaoVinculados(); buscarCategorias();
    buscarInsightIA();
  }, [userId]);

  useEffect(() => { if (userId) buscarDivergencias(); }, [filtroStatus, userId]);

  const apiGet = useCallback(async (path) => { const res = await fetch(`${API_BASE_URL}${path}`); return res.json(); }, []);

  const toggleSelectAll = (items, selected, setSelected, key = 'id') => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i[key])));
  };

  const buscarInsightIA = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/proactive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userRole, pageKey: 'divergencias' })
      });
      const data = await res.json();
      if (data.insight) setAiInsight(data.insight);
    } catch {}
  };

  const abrirFullModal = async (item) => {
    setQuickViewItem(null); setFullModalItem(item); setFullItemData(null);
    if (!item.mlItemId) return;
    setLoadingFullData(true);
    try { setFullItemData(await apiGet(`/api/ml/item-details/${item.mlItemId}?userId=${userId}`)); } 
    catch { alert({ title: 'Erro', message: 'Não foi possível buscar os dados direto do ML.' }); } 
    finally { setLoadingFullData(false); }
  };

  const buscarDivergencias = async () => {
    setLoadingDiv(true);
    try {
      const data = await apiGet(`/api/divergencias?status=${filtroStatus}&plataforma=Mercado Livre&userId=${userId}`);
      setDivergencias(Array.isArray(data) ? data : []);
    } catch {} finally { setLoadingDiv(false); }
  };

  const buscarDivStats = async () => { try { setDivStats(await apiGet(`/api/divergencias/stats?userId=${userId}`)); } catch {} };

  const acaoDiv = async (id, tipo) => {
    setActionLoading(p => ({ ...p, [id]: true }));
    try { await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' }); await buscarDivergencias(); await buscarDivStats(); buscarInsightIA(); } 
    catch {} finally { setActionLoading(p => ({ ...p, [id]: false })); }
  };

  const excluirDivergencia = async (id) => {
    if (!await confirm({ title: 'Excluir', message: 'Deseja excluir permanentemente?', confirmLabel: 'Excluir', danger: true })) return;
    setActionLoading(p => ({ ...p, [id]: true }));
    try { await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' }); await buscarDivergencias(); await buscarDivStats(); }
    catch {} finally { setActionLoading(p => ({ ...p, [id]: false })); }
  };

  const acaoLoteDivs = async (tipo) => {
    if (selectedDivs.size === 0) return;
    if (tipo === 'excluir' && !await confirm({ title: 'Excluir Lote', message: `Excluir ${selectedDivs.size} divergências?`, confirmLabel: 'Excluir', danger: true })) return;
    for (const id of selectedDivs) {
      if (tipo === 'excluir') await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' });
    }
    setSelectedDivs(new Set()); await buscarDivergencias(); await buscarDivStats();
  };

  const limparCorrigidas = async () => {
    if (!await confirm({ title: 'Limpar', message: 'Remover divergências Corrigidas?', confirmLabel: 'Limpar', type: 'warning' })) return;
    try { await fetch(`${API_BASE_URL}/api/divergencias/limpar/corrigidas?userId=${userId}`, { method: 'DELETE' }); await buscarDivergencias(); await buscarDivStats(); } catch {}
  };

  const buscarNaoVinculados = async () => {
    try { setNaoVinculados(await apiGet(`/api/produtos?plataforma=ML_PENDENTE&userId=${userId}`)); } catch {}
  };

  const acaoNaoVinculadoBasica = async (id, acaoStr) => {
    setActionLoading(p => ({ ...p, [id]: true }));
    try {
      if (acaoStr === 'excluir') await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plataforma: 'ML_IGNORADO' }) });
      await buscarNaoVinculados(); await buscarProdutos();
    } catch {} finally { setActionLoading(p => ({ ...p, [id]: false })); }
  };

  const acaoLoteNaoVinculados = async (acaoStr) => {
    if (selectedNaoVinc.size === 0) return;
    if (!await confirm({ title: 'Ação', message: `Aplicar ação em ${selectedNaoVinc.size} anúncio(s)?`, confirmLabel: 'Confirmar' })) return;
    for (const id of selectedNaoVinc) {
      if (acaoStr === 'excluir') await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plataforma: 'ML_IGNORADO' }) });
    }
    setSelectedNaoVinc(new Set()); await buscarNaoVinculados(); await buscarProdutos();
  };

  const buscarProdutos = async () => { try { setProdutos(await apiGet(`/api/produtos?userId=${userId}`)); } catch {} };
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
    if (!await confirm({ title: 'Excluir', danger: true, message: 'Remover produto?', confirmLabel: 'Excluir' })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' }); await buscarProdutos(); } catch {}
  };

  const desvincularProduto = async (id) => {
    if (!await confirm({ title: 'Desvincular', message: 'O anúncio voltará para Não Vinculados.', confirmLabel: 'Desvincular' })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}/desvincular`, { method: 'PUT' }); await buscarProdutos(); await buscarNaoVinculados(); } catch {}
  };

  const excluirLoteProdutos = async () => {
    if (selectedProds.size === 0) return;
    if (!await confirm({ title: 'Excluir Lote', danger: true, message: `Excluir ${selectedProds.size} produto(s)?`, confirmLabel: 'Excluir' })) return;
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
    setIsBotRunning(true); setProgress(0); setLogs([{ msg: 'Acordando IA Analyiz e conectando aos servidores do ML...', type: 'info' }]);
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream?userId=${userId}`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.msg) setLogs(p => [...p, { msg: data.msg, type: data.type }]);
        if (data.percent) setProgress(data.percent);
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
    <div className="w-full max-w-7xl mx-auto p-4 h-full flex flex-col animate-in fade-in duration-500 relative">
      {!fullScreenMode && <MlConfigPanel userId={userId} onStatusChange={setMlConectado} />}
      <QuickViewPopover item={quickViewItem} onClose={() => setQuickViewItem(null)} onOpenFull={abrirFullModal} />

      {/* Header Compacto */}
      {!fullScreenMode && (
        <div className="flex flex-col md:flex-row justify-between md:items-start mb-4 shrink-0 gap-3">
          <div className="flex flex-col">
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5 text-slate-800">
              <div className="bg-[#FFE600] p-1.5 rounded-lg shadow-sm"><ShoppingBag className="w-4 h-4 text-slate-900" /></div>
              Gestão ML
            </h2>
            <AiInsightHeader insight={aiInsight} />
          </div>
          
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              {[['bot', 'Scanner ML'], ['pendentes', `Não Vinculados (${naoVinculados.length})`], ['produtos', 'Catálogo Local']].map(([k, l]) => (
                <button key={k} onClick={() => setActiveTab(k)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === k ? 'bg-slate-900 text-[#FFE600] shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </nav>
            <button onClick={() => setShowDicas(true)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors shadow-sm" title="Ajuda">
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── ABA SCANNER ── */}
      {activeTab === 'bot' && (
        <div className={`grid grid-cols-1 ${fullScreenMode ? 'fixed inset-0 z-[9999] bg-slate-100/95 backdrop-blur-sm p-4 gap-4' : 'lg:grid-cols-5 gap-4'} flex-1 min-h-0 transition-all`}>
          {!fullScreenMode && (
            <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado}
                  className={`w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest mb-3 transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700'}`}>
                  {isBotRunning ? <span className="flex items-center justify-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Auditando ML...</span> : !mlConectado ? '🔒 Conecte o ML' : '🔍 Iniciar Varredura'}
                </button>
                <div className="bg-slate-900 rounded-xl p-2 border border-slate-800">
                  <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><span>Progresso IA</span><span className="text-emerald-400">{progress}%</span></div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_10px_#10b981]" style={{ width: `${progress}%` }}></div></div>
                </div>
              </div>
              <div ref={terminalRef} className="flex-1 bg-slate-950 m-2 rounded-xl p-3 font-mono text-[10px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
                {logs.map((log, i) => <TypewriterLog key={i} msg={log.msg} type={log.type} />)}
              </div>
            </section>
          )}

          <section className={`${fullScreenMode ? 'col-span-1 h-full' : 'col-span-3'} bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden`}>
            <div className="p-3 border-b border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-slate-700">
                  <AlertTriangle className="text-amber-500 w-4 h-4" /> Divergências
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedDivs.size > 0 && (
                    <div className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                      <span className="text-[9px] font-black text-blue-700 px-1">{selectedDivs.size} sel.</span>
                      <button onClick={() => acaoLoteDivs('corrigido')} className="p-1 text-emerald-600 hover:bg-white rounded"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => acaoLoteDivs('ignorado')} className="p-1 text-slate-500 hover:bg-white rounded"><EyeOff className="w-3.5 h-3.5" /></button>
                      <button onClick={() => acaoLoteDivs('excluir')} className="p-1 text-red-500 hover:bg-white rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  {divStats.corrigido > 0 && <button onClick={limparCorrigidas} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => { buscarDivergencias(); buscarDivStats(); }} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200"><RefreshCw className="w-3.5 h-3.5 text-slate-600" /></button>
                  <button onClick={() => setFullScreenMode(!fullScreenMode)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200">
                    {fullScreenMode ? <Minimize2 className="w-3.5 h-3.5 text-slate-600" /> : <Maximize2 className="w-3.5 h-3.5 text-slate-600" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center gap-2 flex-wrap">
                <div className="flex gap-1.5 flex-wrap">
                  {['PENDENTE', 'REINCIDENTE', 'CORRIGIDO', 'IGNORADO', 'TODOS'].map(s => {
                    const cfg = STATUS_CONFIG[s] || { label: 'Todos', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' };
                    const count = s === 'TODOS' ? divStats.total : (divStats[s.toLowerCase()] || 0);
                    return (
                      <button key={s} onClick={() => setFiltroStatus(s)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${filtroStatus === s ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                        {cfg.label} <span className="bg-white/50 px-1 rounded text-[10px]">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400"/>
                  <input value={buscaDiv} onChange={e => setBuscaDiv(e.target.value)} placeholder="Pesquisar..." className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-[10px]" />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {divsFiltradas.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-3"><div className="p-3 bg-emerald-100 rounded-full"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Zero Anomalias</p></div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 shadow-sm z-10">
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <th className="px-3 py-2 w-8"><button onClick={() => toggleSelectAll(divsFiltradas, selectedDivs, setSelectedDivs, 'id')} className="text-slate-400 hover:text-slate-600">{selectedDivs.size === divsFiltradas.length && divsFiltradas.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th>
                      <th className="px-3 py-2">Anúncio</th><th className="px-3 py-2">Divergência</th><th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[10px]">
                    {divsFiltradas.map((div) => {
                      const cfg = STATUS_CONFIG[div.status] || STATUS_CONFIG.PENDENTE;
                      const sel = selectedDivs.has(div.id);
                      return (
                        <tr key={div.id} className={`hover:bg-slate-50/80 ${sel ? 'bg-blue-50/40' : ''}`}>
                          <td className="px-3 py-2"><button onClick={() => { const n = new Set(selectedDivs); sel ? n.delete(div.id) : n.add(div.id); setSelectedDivs(n); }} className="text-slate-400">{sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}</button></td>
                          <td className="py-2 px-3">
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm ${cfg.bg} ${cfg.color} flex items-center gap-1 w-fit mb-1`}><cfg.icon className="w-2.5 h-2.5" />{cfg.label}</span>
                            <p className="font-bold text-slate-800 text-[11px] truncate max-w-[200px]">{div.titulo || div.mlItemId}</p>
                            <p className="text-slate-400 text-[9px] font-mono">{div.mlItemId}</p>
                          </td>
                          <td className="py-2 px-3"><p className="text-slate-700 text-[10px] font-medium leading-tight">{div.motivo}</p></td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <div onMouseEnter={() => setQuickViewItem(div)} onMouseLeave={() => setQuickViewItem(null)}>
                                <button onClick={() => abrirFullModal(div)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600"><Eye className="w-3.5 h-3.5" /></button>
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
        <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden ${fullScreenMode ? 'fixed inset-0 z-[9999] bg-slate-100/95 p-4' : ''}`}>
          <div className="p-4 border-b border-slate-100 bg-amber-50/50 flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="text-[12px] font-black text-amber-800 uppercase flex items-center gap-1.5"><Box className="w-4 h-4" /> Não Vinculados</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-amber-600/50"/>
                <input value={buscaNaoVinc} onChange={e => setBuscaNaoVinc(e.target.value)} placeholder="Pesquisar..." className="w-full pl-7 pr-2 py-1.5 bg-white border border-amber-200 rounded-lg outline-none text-[10px]" />
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
              <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[11px]">Tudo mapeado!</div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white border-b border-slate-100 shadow-sm z-10">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400"><th className="px-4 py-2 w-8"><button onClick={() => toggleSelectAll(nVincFiltrados, selectedNaoVinc, setSelectedNaoVinc, 'id')} className="text-slate-400">{selectedNaoVinc.size === nVincFiltrados.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th><th className="px-4 py-2">Produto ML</th><th className="px-4 py-2 text-right">Ação</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {nVincFiltrados.map(prod => {
                    const sel = selectedNaoVinc.has(prod.id);
                    return (
                      <tr key={prod.id} className={`hover:bg-slate-50/60 transition-colors ${sel ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3"><button onClick={() => { const n = new Set(selectedNaoVinc); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedNaoVinc(n); }} className="text-slate-400">{sel ? <CheckSquare className="w-3.5 h-3.5 text-amber-500" /> : <Square className="w-3.5 h-3.5" />}</button></td>
                        <td className="px-4 py-3 flex items-center gap-3">
                          {prod.thumbnail ? <img src={prod.thumbnail} className="w-10 h-10 object-cover rounded-lg border border-slate-100" /> : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                          <div>
                            <p className="font-bold text-slate-800 max-w-[350px] truncate">{prod.nome}</p>
                            <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block border border-slate-200">{prod.mlItemId}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 relative">
                            <div onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}>
                              <button onClick={() => abrirFullModal(prod)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"><Eye className="w-3.5 h-3.5" /></button>
                            </div>
                            <button onClick={() => { abrirModalVincular(prod); setQuickViewItem(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-black uppercase shadow-sm">
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
        <div className={`grid grid-cols-1 ${fullScreenMode ? 'fixed inset-0 z-[9999] bg-slate-100/95 p-4 gap-4' : 'lg:grid-cols-5 gap-4'} flex-1 min-h-0 transition-all`}>
          {!fullScreenMode && (
            <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="font-black text-[10px] uppercase flex items-center gap-1.5 text-slate-800"><Plus className="w-3.5 h-3.5 text-blue-600" /> {editandoId ? 'Editar' : 'Registro Manual'}</h2>
                <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1 text-[8px] font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded uppercase"><Upload className="w-3 h-3"/> CSV</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <form onSubmit={handleSubmitProduto} className="space-y-3 text-[10px] font-semibold text-slate-600">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="uppercase tracking-widest block mb-1">SKU</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 text-[11px]" /></div>
                    <div><label className="uppercase tracking-widest block mb-1">Categoria</label><input value={formProd.categoria} onChange={e => setFormProd({...formProd, categoria: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 text-[11px]" list="cat-list" /><datalist id="cat-list">{categorias.map(c => <option key={c} value={c} />)}</datalist></div>
                  </div>
                  <div><label className="uppercase tracking-widest block mb-1">Nome Base</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 text-[11px]" /></div>
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                    <p className="text-[9px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1 mb-2"><Weight className="w-3.5 h-3.5" /> Peso Unitário</p>
                    <div className="flex gap-2">
                      <input required type="number" step="any" min="0" value={formProd.peso} onChange={e => setFormProd({...formProd, peso: e.target.value})} className="flex-1 bg-white border border-blue-200 rounded-lg p-2 outline-none focus:border-blue-500 text-[11px] font-bold" />
                      <select value={formProd.unidadePeso} onChange={e => setFormProd({...formProd, unidadePeso: e.target.value})} className="bg-white border border-blue-200 rounded-lg px-2 text-[10px] font-black text-blue-700 outline-none"><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select>
                    </div>
                  </div>
                  <button type="submit" disabled={loadingProd} className="w-full py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-blue-600 transition-all shadow-sm">{loadingProd ? 'Salvando...' : '📥 Salvar Ficha'}</button>
                </form>
              </div>
            </section>
          )}

          <section className={`${fullScreenMode ? 'col-span-1 h-full' : 'col-span-3'} bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col`}>
            <div className="p-3 border-b border-slate-100 flex justify-between items-center flex-wrap gap-2">
              <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
                <button onClick={() => setTipoCatalogo('BASE')} className={`px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all ${tipoCatalogo === 'BASE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>Produtos Base</button>
                <button onClick={() => setTipoCatalogo('ML')} className={`px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all ${tipoCatalogo === 'ML' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>Anúncios Vinculados</button>
              </div>
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-48">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <input value={searchProd} onChange={e => setSearchProd(e.target.value)} placeholder="Pesquisar..." className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-[10px]" />
                </div>
                {selectedProds.size > 0 && <button onClick={excluirLoteProdutos} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>}
                <button onClick={() => setFullScreenMode(!fullScreenMode)} className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                  {fullScreenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400"><th className="px-3 py-2 w-8"><button onClick={() => toggleSelectAll(produtosFiltrados, selectedProds, setSelectedProds)} className="text-slate-400">{selectedProds.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th><th className="px-3 py-2">Produto</th><th className="px-3 py-2">Peso</th><th className="px-3 py-2 text-right">Ação</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {produtosFiltrados.length === 0 && <tr><td colSpan="4" className="py-10 text-center text-slate-400 text-[10px] font-black uppercase">Vazio</td></tr>}
                  {produtosFiltrados.map(prod => {
                    const sel = selectedProds.has(prod.id);
                    return (
                      <tr key={prod.id} className={`hover:bg-slate-50/80 transition-colors ${sel ? 'bg-blue-50/30' : ''}`}>
                        <td className="px-3 py-2.5"><button onClick={() => { const n = new Set(selectedProds); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedProds(n); }} className="text-slate-400 hover:text-blue-600">{sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}</button></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            {prod.thumbnail ? <img src={prod.thumbnail} className="w-8 h-8 rounded-md object-cover shadow-sm" /> : <div className="w-8 h-8 bg-slate-100 rounded-md flex items-center justify-center"><ImageIcon className="w-3 h-3 text-slate-300"/></div>}
                            <div>
                              <div className="flex flex-wrap items-center gap-1 mb-0.5">
                                <span className="text-[8px] font-black text-slate-500 bg-slate-100 border border-slate-200 px-1 rounded">{prod.sku}</span>
                                {prod.mlItemId && <span className="text-[8px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">{prod.mlItemId}</span>}
                              </div>
                              <p className="text-[11px] font-bold text-slate-800 truncate max-w-[200px]">{prod.nome}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><span className="text-[10px] text-blue-700 font-black bg-blue-50 border border-blue-100 px-2 py-0.5 rounded shadow-sm">{prod.pesoGramas}g</span></td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex justify-end gap-1.5 relative">
                            <div onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}>
                              <button onClick={() => abrirFullModal(prod)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100"><Eye className="w-3.5 h-3.5" /></button>
                            </div>
                            {prod.mlItemId && <button onClick={() => desvincularProduto(prod.id)} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100" title="Desvincular"><Unlink className="w-3.5 h-3.5" /></button>}
                            <button onClick={() => excluirProduto(prod.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>
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

      {/* ── MODAL FULL DETAILS ML (TELA GRANDE) ── */}
      {fullModalItem && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center z-10 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4 text-blue-600"/> Integração ML</h3>
              <button onClick={() => setFullModalItem(null)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 custom-scrollbar">
              {loadingFullData ? (
                <div className="flex flex-col items-center justify-center py-20 text-blue-500"><Loader2 className="w-8 h-8 animate-spin mb-3"/><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buscando dados no ML...</p></div>
              ) : fullItemData ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5 space-y-4">
                    <div className="bg-white rounded-xl p-2 border border-slate-200 flex items-center justify-center h-64 shadow-sm">
                      {fullItemData.pictures?.length > 0 ? <img src={fullItemData.pictures[0].url} className="max-h-full max-w-full object-contain rounded-lg" /> : <ImageIcon className="w-12 h-12 text-slate-200"/>}
                    </div>
                    {fullItemData.pictures?.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {fullItemData.pictures.slice(1, 5).map((pic, idx) => (
                          <img key={idx} src={pic.url} className="w-14 h-14 object-cover rounded-lg border border-slate-200" />
                        ))}
                      </div>
                    )}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded font-black border border-blue-100">{fullItemData.id}</span>
                      <h2 className="text-sm font-bold text-slate-800 mt-2 leading-snug">{fullItemData.title}</h2>
                      <p className="text-xl font-black text-emerald-600 mt-2">R$ {fullItemData.price}</p>
                      <a href={fullItemData.permalink} target="_blank" className="mt-4 flex items-center justify-center gap-1.5 w-full py-2.5 bg-[#FFE600] text-slate-900 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
                        <ExternalLink className="w-3.5 h-3.5"/> Ver Original
                      </a>
                    </div>
                  </div>
                  <div className="lg:col-span-7 space-y-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 pb-1.5 mb-3 flex items-center gap-1.5"><LayoutList className="w-3.5 h-3.5"/> Características</h4>
                      <div className="grid grid-cols-2 gap-3 text-[10px]">
                        {fullItemData.attributes?.filter(a => a.value_name).slice(0, 10).map(attr => (
                          <div key={attr.id} className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block uppercase font-bold mb-0.5">{attr.name}</span>
                            <span className="text-slate-700 font-semibold">{attr.value_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 pb-1.5 mb-3 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> Descrição</h4>
                      <div className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-slate-50/50 p-3 rounded-lg border border-slate-100 custom-scrollbar">
                        {fullItemData.description_text || 'O vendedor não incluiu descrição.'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400 text-[11px] uppercase tracking-widest font-black">Falha ao obter dados</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VINCULAÇÃO (KIT) ── */}
      {vincularAnuncio && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 bg-white flex justify-between items-center z-10 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase text-[12px] tracking-tight flex items-center gap-2"><Link2 className="w-4 h-4 text-emerald-600"/> Vincular Anúncio</h3>
              <button onClick={() => setVincularAnuncio(null)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><XCircle className="w-4 h-4"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50 custom-scrollbar">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-5 flex gap-3 items-center">
                {vincularAnuncio.thumbnail ? <img src={vincularAnuncio.thumbnail} className="w-12 h-12 object-cover rounded-lg border border-slate-100" /> : <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                <div>
                  <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-black">{vincularAnuncio.mlItemId}</span>
                  <p className="font-bold text-[11px] text-slate-800 mt-1 leading-tight line-clamp-2">{vincularAnuncio.nome}</p>
                </div>
              </div>
              <div className="mb-6">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">1. Itens da Caixa (Kits)</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400"/>
                  <input value={buscaBase} onChange={e => setBuscaBase(e.target.value)} placeholder="Buscar Motor, Controle..." className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-[11px]" />
                </div>
                {buscaBase && (
                  <div className="mb-3 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                    {produtosBaseParaBusca.map(p => (
                      <div key={p.id} className="p-2 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50">
                        <div><span className="text-[11px] font-bold text-slate-700">{p.nome}</span> <span className="text-[9px] text-slate-400 ml-1">({p.pesoGramas}g)</span></div>
                        <button onClick={() => { setComposicaoKit([...composicaoKit, {produto: p, quantidade: 1}]); setBuscaBase(''); }} className="text-[9px] font-black uppercase bg-blue-50 text-blue-600 px-2 py-1 rounded">Adicionar</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {composicaoKit.map(item => (
                    <div key={item.produto.id} className="flex justify-between items-center p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                      <span className="text-[11px] font-bold text-slate-700 flex-1">{item.produto.nome}</span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded p-1">
                           <button onClick={() => { const q = item.quantidade - 1; if(q<=0) setComposicaoKit(composicaoKit.filter(c=>c.produto.id!==item.produto.id)); else setComposicaoKit(composicaoKit.map(c=>c.produto.id===item.produto.id?{...c,quantidade:q}:c)); }} className="text-slate-500 hover:text-red-500"><Minus className="w-3 h-3"/></button>
                           <span className="w-4 text-center font-black text-[10px]">{item.quantidade}</span>
                           <button onClick={() => setComposicaoKit(composicaoKit.map(c=>c.produto.id===item.produto.id?{...c,quantidade:item.quantidade+1}:c))} className="text-slate-500 hover:text-blue-500"><Plus className="w-3 h-3"/></button>
                        </div>
                        <span className="w-12 text-right text-[11px] text-emerald-600 font-black">{item.produto.pesoGramas * item.quantidade}g</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {composicaoKit.length === 0 && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">2. Ou Peso Fixo</label>
                  <div className="flex gap-2">
                    <input type="number" value={pesoManual} onChange={e => setPesoManual(e.target.value)} placeholder="Ex: 1.5" className="px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none w-24 text-[11px]" />
                    <select value={unidadeManual} onChange={e => setUnidadeManual(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 text-[10px] font-black text-slate-600"><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-white flex justify-end gap-2">
              <button onClick={() => setVincularAnuncio(null)} className="px-5 py-2 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={salvarVinculacao} disabled={composicaoKit.length === 0 && !pesoManual} className="px-6 py-2 rounded-lg text-[10px] font-black uppercase text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DICAS (HELP) ── */}
      {showDicas && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-blue-600 text-white">
              <h3 className="font-black uppercase tracking-widest text-[11px] flex items-center gap-2"><HelpCircle className="w-4 h-4"/> Entendendo o Sistema</h3>
              <button onClick={() => setShowDicas(false)} className="text-blue-200 hover:text-white"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-4 text-[11px] text-slate-600 leading-relaxed">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><h4 className="font-black text-slate-800 mb-1 flex items-center gap-1.5"><Box className="w-3.5 h-3.5 text-amber-500"/> Aba Não Vinculados</h4><p>Anúncios do ML sem peso. Clique em Vincular para resolver.</p></div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><h4 className="font-black text-slate-800 mb-1 flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-blue-500"/> Base vs Anúncios</h4><p><b>Base:</b> Peça física (ex: Controle).<br/><b>Anúncio:</b> O pacote final que você vende no ML (ex: Kit com 2 Controles).</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}