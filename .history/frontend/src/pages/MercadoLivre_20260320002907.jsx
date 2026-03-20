import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag,
  CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Ruler, Weight, Loader2, Check, XCircle,
  Download, Search, Filter, Tag, ChevronDown, Image,
  Square, CheckSquare, Minus as MinusIcon, ArrowLeft, ArrowRight
} from 'lucide-react';
import MlConfigPanel from '../components/Mlconfigpanel';

const API_BASE_URL = 'http://localhost:3000';

const STATUS_CONFIG = {
  PENDENTE:  { label: 'Pendente',  color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: Clock },
  CORRIGIDO: { label: 'Corrigido', color: 'text-emerald-600',bg: 'bg-emerald-50',border: 'border-emerald-200', icon: CheckCircle2 },
  IGNORADO:  { label: 'Ignorado',  color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-200',  icon: EyeOff },
};

const FORM_INICIAL = {
  sku: '', nome: '', preco: '', mlItemId: '',
  pesoGramas: '', alturaCm: '', larguraCm: '', comprimentoCm: '',
  eKit: false, categoria: '', plataforma: 'Mercado Livre'
};

// Status disponíveis no ML para filtro
const ML_STATUS_OPTS = [
  { value: 'active',   label: 'Ativos' },
  { value: 'paused',   label: 'Pausados' },
  { value: 'closed',   label: 'Encerrados' },
  { value: 'under_review', label: 'Em revisão' },
];

export default function MercadoLivre() {
  const { userId } = useOutletContext() || {};
  const [activeTab, setActiveTab]         = useState('bot');
  const [mlConectado, setMlConectado]     = useState(false);
  const [isBotRunning, setIsBotRunning]   = useState(false);
  const [progress, setProgress]           = useState(0);
  const [logs, setLogs]                   = useState([{ msg: 'KERNEL_ML_READY: Sistema de auditoria conectado.', type: 'info' }]);

  // Divergências
  const [divergencias, setDivergencias]   = useState([]);
  const [divStats, setDivStats]           = useState({ pendente: 0, corrigido: 0, ignorado: 0, total: 0 });
  const [filtroStatus, setFiltroStatus]   = useState('PENDENTE');
  const [loadingDiv, setLoadingDiv]       = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedDivs, setSelectedDivs]   = useState(new Set());

  // Produtos locais
  const [produtos, setProdutos]           = useState([]);
  const [categorias, setCategorias]       = useState([]);
  const [formProd, setFormProd]           = useState(FORM_INICIAL);
  const [editandoId, setEditandoId]       = useState(null);
  const [loadingProd, setLoadingProd]     = useState(false);
  const [searchProd, setSearchProd]       = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStatusProd, setFiltroStatusProd] = useState('');
  const [selectedProds, setSelectedProds] = useState(new Set());
  const [modoInput, setModoInput]         = useState('manual'); // 'manual' | 'automatico'

  // Importação automática do ML
  const [mlAnuncios, setMlAnuncios]       = useState([]);
  const [mlCategorias, setMlCategorias]   = useState([]);
  const [mlFiltroStatus, setMlFiltroStatus]   = useState('active');
  const [mlFiltroCategoria, setMlFiltroCategoria] = useState('');
  const [mlSearch, setMlSearch]           = useState('');
  const [mlLoading, setMlLoading]         = useState(false);
  const [mlPaging, setMlPaging]           = useState({ total: 0 });
  const [mlOffset, setMlOffset]           = useState(0);
  const [selectedMl, setSelectedMl]       = useState(new Set());
  const [importLoading, setImportLoading] = useState(false);

  const terminalRef = useRef(null);
  const ML_LIMIT    = 50;

  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [logs]);

  useEffect(() => {
    if (!userId) return;
    buscarDivergencias();
    buscarDivStats();
    buscarProdutos();
    buscarCategorias();
  }, [userId]);

  useEffect(() => { if (userId) buscarDivergencias(); }, [filtroStatus, userId]);

  // ── Helpers de URL com userId ───────────────────────────────────────────

  const apiGet = useCallback(async (path) => {
    const res  = await fetch(`${API_BASE_URL}${path}`);
    return res.json();
  }, []);

  // ── Divergências ─────────────────────────────────────────────────────────

  const buscarDivergencias = async () => {
    if (!userId) return;
    setLoadingDiv(true);
    try {
      const data = await apiGet(`/api/divergencias?status=${filtroStatus}&plataforma=Mercado Livre&userId=${userId}`);
      if (Array.isArray(data)) setDivergencias(data);
    } catch {} finally { setLoadingDiv(false); }
  };

  const buscarDivStats = async () => {
    if (!userId) return;
    try { const data = await apiGet(`/api/divergencias/stats?userId=${userId}`); setDivStats(data); } catch {}
  };

  const acao = async (id, tipo) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' });
      await buscarDivergencias(); await buscarDivStats();
    } catch {} finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const excluirDivergencia = async (id) => {
    if (!confirm('Excluir esta divergência permanentemente?')) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try { await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' }); await buscarDivergencias(); await buscarDivStats(); }
    catch {} finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  // Ação em lote para divergências
  const acaoLoteDivs = async (tipo) => {
    if (selectedDivs.size === 0) return;
    if (tipo === 'excluir' && !confirm(`Excluir ${selectedDivs.size} divergência(s)?`)) return;
    for (const id of selectedDivs) {
      if (tipo === 'excluir') await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' });
    }
    setSelectedDivs(new Set());
    await buscarDivergencias(); await buscarDivStats();
  };

  const limparCorrigidas = async () => {
    if (!confirm('Remover todas as divergências corrigidas?')) return;
    try { await fetch(`${API_BASE_URL}/api/divergencias/limpar/corrigidas?userId=${userId}`, { method: 'DELETE' }); await buscarDivergencias(); await buscarDivStats(); } catch {}
  };

  // ── Produtos locais ───────────────────────────────────────────────────────

  const buscarProdutos = async () => {
    if (!userId) return;
    try {
      const params = new URLSearchParams({ userId });
      if (filtroCategoria)  params.set('categoria', filtroCategoria);
      if (filtroStatusProd) params.set('status', filtroStatusProd);
      if (searchProd)       params.set('search', searchProd);
      const data = await apiGet(`/api/produtos?${params}`);
      if (Array.isArray(data)) setProdutos(data);
    } catch {}
  };

  const buscarCategorias = async () => {
    if (!userId) return;
    try { const data = await apiGet(`/api/produtos/categorias?userId=${userId}`); setCategorias(data); } catch {}
  };

  useEffect(() => { if (userId) buscarProdutos(); }, [filtroCategoria, filtroStatusProd, userId]);

  const handleSubmitProduto = async (e) => {
    e.preventDefault();
    if (!userId) return;
    setLoadingProd(true);
    try {
      const url    = editandoId ? `${API_BASE_URL}/api/produtos/${editandoId}` : `${API_BASE_URL}/api/produtos`;
      const method = editandoId ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formProd, userId }) });
      setFormProd(FORM_INICIAL); setEditandoId(null);
      await buscarProdutos(); await buscarCategorias();
    } catch {} finally { setLoadingProd(false); }
  };

  const editarProduto = (p) => {
    setEditandoId(p.id);
    setFormProd({ sku: p.sku, nome: p.nome, preco: p.preco, pesoGramas: p.pesoGramas, alturaCm: p.alturaCm || '', larguraCm: p.larguraCm || '', comprimentoCm: p.comprimentoCm || '', mlItemId: p.mlItemId || '', eKit: p.eKit, categoria: p.categoria || '', plataforma: 'Mercado Livre' });
  };

  const excluirProduto = async (id) => {
    if (!confirm('Excluir este produto?')) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' }); await buscarProdutos(); } catch {}
  };

  const excluirLoteProdutos = async () => {
    if (selectedProds.size === 0 || !confirm(`Excluir ${selectedProds.size} produto(s)?`)) return;
    for (const id of selectedProds) await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
    setSelectedProds(new Set()); await buscarProdutos();
  };

  // ── Importação automática do ML ───────────────────────────────────────────

  const buscarAnunciosMl = async (offset = 0) => {
    if (!userId || !mlConectado) return;
    setMlLoading(true);
    try {
      const params = new URLSearchParams({ userId, status: mlFiltroStatus, offset, limit: ML_LIMIT });
      if (mlFiltroCategoria) params.set('categoria', mlFiltroCategoria);
      if (mlSearch)          params.set('q', mlSearch);
      const data = await apiGet(`/api/ml/anuncios?${params}`);
      setMlAnuncios(data.items || []);
      setMlPaging(data.paging || { total: 0 });
      setMlOffset(offset);
      setSelectedMl(new Set());
    } catch {} finally { setMlLoading(false); }
  };

  const buscarCategoriasMl = async () => {
    try { const data = await apiGet(`/api/ml/categorias?userId=${userId}`); setMlCategorias(Array.isArray(data) ? data : []); } catch {}
  };

  useEffect(() => {
    if (modoInput === 'automatico' && mlConectado && userId) {
      buscarAnunciosMl(0);
      buscarCategoriasMl();
    }
  }, [modoInput, mlConectado, userId]);

  const importarSelecionados = async () => {
    if (selectedMl.size === 0) return;
    setImportLoading(true);
    try {
      const selecionados = mlAnuncios.filter(a => selectedMl.has(a.mlItemId));
      await fetch(`${API_BASE_URL}/api/produtos/import-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, produtos: selecionados })
      });
      setSelectedMl(new Set());
      await buscarProdutos(); await buscarCategorias();
      alert(`✅ ${selecionados.length} anúncio(s) importado(s) com sucesso!`);
    } catch {} finally { setImportLoading(false); }
  };

  const toggleSelectAll = (items, selected, setSelected, key = 'id') => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i[key])));
  };

  // ── Bot ───────────────────────────────────────────────────────────────────

  const iniciarBot = () => {
    if (!userId) return;
    setIsBotRunning(true); setProgress(0);
    setLogs([{ msg: '🚀 Iniciando auditoria...', type: 'info' }]);
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream?userId=${userId}`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.msg) setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
        if (data.type === 'progress' && typeof data.percent === 'number') setProgress(data.percent);
        if (data.type === 'done') { setIsBotRunning(false); eventSource.close(); buscarDivergencias(); buscarDivStats(); }
      } catch (_) {}
    };
    eventSource.onerror = () => { setIsBotRunning(false); eventSource.close(); };
  };

  // ── Produtos filtrados (busca local) ──────────────────────────────────────

  const produtosFiltrados = produtos.filter(p =>
    (!searchProd || p.nome.toLowerCase().includes(searchProd.toLowerCase()) || p.sku.toLowerCase().includes(searchProd.toLowerCase()) || (p.mlItemId || '').toLowerCase().includes(searchProd.toLowerCase()))
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto p-4 h-full flex flex-col animate-in fade-in duration-500">

      <MlConfigPanel userId={userId} onStatusChange={setMlConectado} />

      {/* Header + Tabs */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5" style={{ color: 'var(--theme-text)' }}>
          <div className="bg-[#FFE600] p-1.5 rounded-lg shadow-sm"><ShoppingBag className="w-4 h-4 text-slate-900" /></div>
          Gestão Mercado Livre
        </h2>
        <nav className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          {[['bot', 'Scanner'], ['produtos', 'Catálogo']].map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all ${activeTab === k ? 'bg-[#FFE600] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </nav>
      </div>

      {/* ── ABA SCANNER ────────────────────────────────────────────────── */}
      {activeTab === 'bot' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          {/* Painel do Bot */}
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Protocolo de Auditoria</p>
              <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado}
                className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest mb-3 transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:scale-95'}`}>
                {isBotRunning ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Auditando...</span> : !mlConectado ? '🔒 Conecte o ML primeiro' : '🔍 Executar Auditoria ML'}
              </button>
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Progresso</span>
                  <span className="text-[10px] font-black text-blue-400">{progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 shadow-[0_0_8px_#3b82f6] transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>
            <div ref={terminalRef} className="flex-1 bg-slate-950 m-3 rounded-xl p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
              {logs.map((log, i) => (
                <div key={i} className={log.type === 'warn' ? 'text-amber-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'}>
                  <span className="mr-2 text-slate-600 select-none">›</span>{log.msg}
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-100 grid grid-cols-3 gap-2">
              {[{ k: 'pendente', label: 'Pendentes', c: 'text-amber-600', b: 'bg-amber-50' }, { k: 'corrigido', label: 'Corrigidos', c: 'text-emerald-600', b: 'bg-emerald-50' }, { k: 'ignorado', label: 'Ignorados', c: 'text-slate-500', b: 'bg-slate-50' }].map(({ k, label, c, b }) => (
                <div key={k} className={`${b} rounded-xl p-2 text-center`}>
                  <p className={`text-lg font-black ${c}`}>{divStats[k] || 0}</p>
                  <p className={`text-[8px] font-black uppercase tracking-widest ${c} opacity-70`}>{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Divergências */}
          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-600">
                  <AlertTriangle className="text-amber-500 w-4 h-4" /> Inconsistências de Frete
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Ações em lote */}
                  {selectedDivs.size > 0 && (
                    <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                      <span className="text-[10px] font-black text-blue-700">{selectedDivs.size} sel.</span>
                      <button onClick={() => acaoLoteDivs('corrigido')} className="text-emerald-600 hover:text-emerald-700 p-0.5" title="Marcar corrigido"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => acaoLoteDivs('ignorado')} className="text-slate-500 hover:text-slate-700 p-0.5" title="Ignorar"><EyeOff className="w-3.5 h-3.5" /></button>
                      <button onClick={() => acaoLoteDivs('excluir')} className="text-red-500 hover:text-red-700 p-0.5" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  {divStats.corrigido > 0 && (
                    <button onClick={limparCorrigidas} className="text-[9px] font-black uppercase text-red-500 hover:text-red-600 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Limpar corrigidas
                    </button>
                  )}
                  <button onClick={() => { buscarDivergencias(); buscarDivStats(); }} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100">
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {['PENDENTE', 'CORRIGIDO', 'IGNORADO', 'TODOS'].map(s => {
                  const cfg   = STATUS_CONFIG[s] || { label: 'Todos', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
                  const count = s === 'TODOS' ? divStats.total : (divStats[s.toLowerCase()] || 0);
                  return (
                    <button key={s} onClick={() => { setFiltroStatus(s); setSelectedDivs(new Set()); }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${filtroStatus === s ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                      {cfg.label || 'Todos'} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingDiv ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
              ) : divergencias.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-3">
                  <div className="p-4 bg-emerald-50 rounded-full"><CheckCircle2 className="w-8 h-8 text-emerald-500" /></div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Nenhuma divergência {filtroStatus.toLowerCase()}</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-3 py-2.5">
                        <button onClick={() => toggleSelectAll(divergencias, selectedDivs, setSelectedDivs, 'id')} className="text-slate-400 hover:text-slate-600">
                          {selectedDivs.size === divergencias.length && divergencias.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        </button>
                      </th>
                      <th className="px-3 py-2.5">Anúncio</th>
                      <th className="px-3 py-2.5">Divergência</th>
                      <th className="px-3 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[11px]">
                    {divergencias.map((div) => {
                      const cfg     = STATUS_CONFIG[div.status] || STATUS_CONFIG.PENDENTE;
                      const Icon    = cfg.icon;
                      const loading = actionLoading[div.id];
                      const sel     = selectedDivs.has(div.id);
                      return (
                        <tr key={div.id} className={`hover:bg-slate-50/80 transition-colors group ${sel ? 'bg-blue-50/40' : ''}`}>
                          <td className="px-3 py-3">
                            <button onClick={() => { const n = new Set(selectedDivs); sel ? n.delete(div.id) : n.add(div.id); setSelectedDivs(n); }} className="text-slate-400 hover:text-blue-600">
                              {sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} flex items-center gap-1 w-fit mb-1`}><Icon className="w-2.5 h-2.5" />{cfg.label}</span>
                            <p className="font-bold text-blue-600 text-[11px] truncate max-w-[130px]" title={div.titulo || div.mlItemId}>{div.titulo || div.mlItemId}</p>
                            <p className="text-slate-400 text-[9px] font-mono">{div.mlItemId}</p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="text-slate-700 text-[10px] italic leading-relaxed">{div.motivo}</p>
                            {div.pesoMl > 0 && div.pesoLocal > 0 && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">ML: {div.pesoMl}g</span>
                                <span className="text-slate-300 text-[8px]">vs</span>
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">Local: {div.pesoLocal}g</span>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${Math.abs(div.pesoMl - div.pesoLocal) > 100 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>Δ {Math.abs(div.pesoMl - div.pesoLocal)}g</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-end gap-1">
                              {loading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : (
                                <>
                                  {div.link && div.link !== 'N/A' && <a href={div.link} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100" title="Abrir no ML"><ExternalLink className="w-3.5 h-3.5" /></a>}
                                  {div.status !== 'CORRIGIDO' && <button onClick={() => acao(div.id, 'corrigido')} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100" title="Corrigido"><Check className="w-3.5 h-3.5" /></button>}
                                  {div.status !== 'PENDENTE'  && <button onClick={() => acao(div.id, 'pendente')}  className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"   title="Pendente"><Clock className="w-3.5 h-3.5" /></button>}
                                  {div.status !== 'IGNORADO'  && <button onClick={() => acao(div.id, 'ignorado')}  className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100"   title="Ignorar"><EyeOff className="w-3.5 h-3.5" /></button>}
                                  <button onClick={() => excluirDivergencia(div.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
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

      {/* ── ABA CATÁLOGO ─────────────────────────────────────────────── */}
      {activeTab === 'produtos' && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">

          {/* Toggle Manual / Automático */}
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm shrink-0">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Modo de Cadastro:</span>
            <div className="flex gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
              {[['manual', '✏️ Manual'], ['automatico', '🤖 Importar do ML']].map(([k, l]) => (
                <button key={k} onClick={() => setModoInput(k)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${modoInput === k ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                  {l}
                </button>
              ))}
            </div>
            {!mlConectado && modoInput === 'automatico' && (
              <span className="text-[10px] text-amber-600 font-bold">⚠️ Conecte o ML para importar automaticamente</span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">

            {/* LADO ESQUERDO — Manual ou Automático */}
            <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">

              {/* ── MODO MANUAL ── */}
              {modoInput === 'manual' && (
                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                  <h2 className="font-black text-xs uppercase mb-4 flex items-center gap-2 text-blue-600">
                    <Plus className="w-4 h-4" /> {editandoId ? 'Editar Produto' : 'Cadastrar Produto ML'}
                  </h2>
                  <form onSubmit={handleSubmitProduto} className="space-y-3.5 text-[11px] font-semibold text-slate-600">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="uppercase tracking-wider block mb-1 text-[10px]">SKU Interno</label>
                        <input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} placeholder="PROD-001" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                      </div>
                      <div>
                        <label className="uppercase tracking-wider block mb-1 text-[10px]">ID ML (MLB...)</label>
                        <input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} placeholder="MLB123456789" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                      </div>
                    </div>
                    <div>
                      <label className="uppercase tracking-wider block mb-1 text-[10px]">Título do Anúncio</label>
                      <input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} placeholder="Título no ML" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="uppercase tracking-wider block mb-1 text-[10px]">Preço (R$)</label>
                        <input type="number" step="0.01" value={formProd.preco} onChange={e => setFormProd({...formProd, preco: e.target.value})} placeholder="0,00" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                      </div>
                      <div>
                        <label className="uppercase tracking-wider block mb-1 text-[10px]">Categoria</label>
                        <input value={formProd.categoria} onChange={e => setFormProd({...formProd, categoria: e.target.value})} placeholder="Ex: MLB1051" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" list="cat-list" />
                        <datalist id="cat-list">{categorias.map(c => <option key={c} value={c} />)}</datalist>
                      </div>
                    </div>
                    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 space-y-3">
                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Dimensões da Embalagem</p>
                      <div>
                        <label className="text-[9px] text-blue-600 block mb-1 flex items-center gap-1"><Weight className="w-3 h-3" /> Peso total (g)</label>
                        <input required type="number" min="1" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} placeholder="500" className="w-full bg-white border border-blue-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[['alturaCm','Alt(cm)','10'],['larguraCm','Larg(cm)','15'],['comprimentoCm','Comp(cm)','20']].map(([k,l,p]) => (
                          <div key={k}>
                            <label className="text-[8px] text-blue-600 block mb-1"><Ruler className="w-2.5 h-2.5 inline mr-1" />{l}</label>
                            <input type="number" step="0.1" value={formProd[k]} onChange={e => setFormProd({...formProd, [k]: e.target.value})} placeholder={p} className="w-full bg-white border border-blue-200 rounded-lg p-2 outline-none text-[11px]" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-dashed border-amber-200">
                      <input type="checkbox" id="ekit" checked={formProd.eKit} onChange={e => setFormProd({...formProd, eKit: e.target.checked})} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                      <label htmlFor="ekit" className="text-[10px] font-black text-amber-800 uppercase tracking-widest cursor-pointer">Anúncio KIT (multi-item)</label>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={loadingProd} type="submit" className="flex-1 py-3 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-lg hover:bg-black transition-all shadow-md flex items-center justify-center gap-2">
                        {loadingProd ? <Loader2 className="w-4 h-4 animate-spin" /> : editandoId ? '💾 Salvar' : '📥 Registrar'}
                      </button>
                      {editandoId && <button type="button" onClick={() => { setEditandoId(null); setFormProd(FORM_INICIAL); }} className="px-3 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"><XCircle className="w-4 h-4" /></button>}
                    </div>
                  </form>
                </div>
              )}

              {/* ── MODO AUTOMÁTICO ── */}
              {modoInput === 'automatico' && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 space-y-2.5">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtros de Busca no ML</p>

                    {/* Busca por texto */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                      <input value={mlSearch} onChange={e => setMlSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarAnunciosMl(0)}
                        placeholder="Buscar por título..." className="w-full pl-8 pr-3 py-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500" />
                    </div>

                    {/* Status */}
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Status do Anúncio</label>
                      <div className="flex flex-wrap gap-1">
                        {ML_STATUS_OPTS.map(opt => (
                          <button key={opt.value} onClick={() => setMlFiltroStatus(opt.value)}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${mlFiltroStatus === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Categoria ML */}
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Categoria ML</label>
                      <select value={mlFiltroCategoria} onChange={e => setMlFiltroCategoria(e.target.value)}
                        className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500">
                        <option value="">Todas as categorias</option>
                        {mlCategorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <button onClick={() => buscarAnunciosMl(0)} disabled={!mlConectado || mlLoading}
                      className={`w-full py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${!mlConectado || mlLoading ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      {mlLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      Buscar Anúncios
                    </button>
                  </div>

                  {/* Lista de anúncios ML */}
                  <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-2">
                    {mlLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}
                    {!mlLoading && mlAnuncios.length === 0 && (
                      <div className="py-8 text-center text-[11px] text-slate-400 font-black uppercase">Nenhum anúncio encontrado</div>
                    )}
                    {mlAnuncios.map(a => {
                      const sel = selectedMl.has(a.mlItemId);
                      return (
                        <div key={a.mlItemId} onClick={() => { const n = new Set(selectedMl); sel ? n.delete(a.mlItemId) : n.add(a.mlItemId); setSelectedMl(n); }}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${sel ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-100 hover:border-blue-200'}`}>
                          {a.thumbnail && <img src={a.thumbnail} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />}
                          {!a.thumbnail && <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0"><Image className="w-5 h-5 text-slate-400" /></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-700 truncate">{a.nome}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[9px] font-mono text-slate-400">{a.mlItemId}</span>
                              {a.pesoGramas > 0 && <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded">{a.pesoGramas}g</span>}
                              {a.categoria  && <span className="text-[9px] bg-blue-50 text-blue-500 px-1 rounded">{a.categoria}</span>}
                            </div>
                          </div>
                          {sel ? <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" /> : <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Paginação + Importar */}
                  {mlAnuncios.length > 0 && (
                    <div className="p-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <button onClick={() => buscarAnunciosMl(Math.max(0, mlOffset - ML_LIMIT))} disabled={mlOffset === 0} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-40">
                          <ArrowLeft className="w-3 h-3" /> Anterior
                        </button>
                        <span>{mlOffset + 1}–{Math.min(mlOffset + ML_LIMIT, mlPaging.total)} de {mlPaging.total}</span>
                        <button onClick={() => buscarAnunciosMl(mlOffset + ML_LIMIT)} disabled={mlOffset + ML_LIMIT >= mlPaging.total} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-40">
                          Próxima <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSelectAll(mlAnuncios, selectedMl, setSelectedMl, 'mlItemId')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 transition-all">
                          {selectedMl.size === mlAnuncios.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                          {selectedMl.size === mlAnuncios.length ? 'Desmarcar' : 'Selec. todos'}
                        </button>
                        <button onClick={importarSelecionados} disabled={selectedMl.size === 0 || importLoading}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl font-black text-[11px] uppercase transition-all ${selectedMl.size === 0 ? 'bg-slate-100 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                          {importLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Importar {selectedMl.size > 0 ? `(${selectedMl.size})` : ''}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* LADO DIREITO — Lista de produtos cadastrados */}
            <section className="col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-lg overflow-hidden flex flex-col h-full">
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <input value={searchProd} onChange={e => { setSearchProd(e.target.value); buscarProdutos(); }}
                    placeholder="Buscar produto..." className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500" />
                </div>

                {/* Filtro categoria */}
                <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                  className="text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-500">
                  <option value="">Todas as categorias</option>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Filtro status */}
                <select value={filtroStatusProd} onChange={e => setFiltroStatusProd(e.target.value)}
                  className="text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-500">
                  <option value="">Todos os status</option>
                  {ML_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {/* Ação em lote */}
                {selectedProds.size > 0 && (
                  <button onClick={excluirLoteProdutos} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-black hover:bg-red-100 transition-all">
                    <Trash2 className="w-3 h-3" /> Excluir ({selectedProds.size})
                  </button>
                )}

                <span className="text-[10px] text-slate-400 font-bold ml-auto">{produtosFiltrados.length} produto(s)</span>
              </div>

              {/* Tabela de produtos */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {produtosFiltrados.length === 0 ? (
                  <div className="py-10 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[10px]">Nenhum produto encontrado</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white border-b border-slate-100">
                      <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <th className="px-3 py-2">
                          <button onClick={() => toggleSelectAll(produtosFiltrados, selectedProds, setSelectedProds)} className="text-slate-400 hover:text-slate-600">
                            {selectedProds.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                          </button>
                        </th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">Peso/Dim</th>
                        <th className="px-3 py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {produtosFiltrados.map(prod => {
                        const sel = selectedProds.has(prod.id);
                        return (
                          <tr key={prod.id} className={`hover:bg-slate-50 transition-colors group ${sel ? 'bg-blue-50/30' : ''}`}>
                            <td className="px-3 py-2.5">
                              <button onClick={() => { const n = new Set(selectedProds); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedProds(n); }} className="text-slate-400 hover:text-blue-600">
                                {sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {prod.thumbnail && <img src={prod.thumbnail} alt="" className="w-8 h-8 object-cover rounded-lg flex-shrink-0" />}
                                <div>
                                  <div className="flex flex-wrap items-center gap-1 mb-0.5">
                                    <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">{prod.sku}</span>
                                    {prod.eKit && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black uppercase">KIT</span>}
                                    {prod.categoria && <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{prod.categoria}</span>}
                                    {prod.mlItemId && <span className="text-[8px] font-mono text-slate-400">{prod.mlItemId}</span>}
                                  </div>
                                  <p className="text-[11px] font-bold text-slate-700 truncate max-w-[200px]">{prod.nome}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] text-slate-600 font-bold">{prod.pesoGramas}g</span>
                              {prod.alturaCm > 0 && <p className="text-[9px] text-slate-400">{prod.alturaCm}×{prod.larguraCm}×{prod.comprimentoCm}cm</p>}
                              <p className="text-[9px] text-slate-500">R$ {parseFloat(prod.preco).toFixed(2)}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { editarProduto(prod); setModoInput('manual'); }} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100" title="Editar"><RefreshCw className="w-3.5 h-3.5" /></button>
                                <button onClick={() => excluirProduto(prod.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
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
        </div>
      )}
    </div>
  );
}