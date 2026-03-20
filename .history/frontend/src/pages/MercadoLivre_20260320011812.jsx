import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag,
  CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Ruler, Weight, Loader2, Check, XCircle,
  Search, Filter, Tag, ChevronDown, Image, Link2,
  Square, CheckSquare, ArrowLeft, ArrowRight, Minus
} from 'lucide-react';
import MlConfigPanel from '../components/Mlconfigpanel';
import { useModal } from '../components/Modal';

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

const ML_STATUS_OPTS = [
  { value: 'active',   label: 'Ativos' },
  { value: 'paused',   label: 'Pausados' },
  { value: 'closed',   label: 'Encerrados' },
];

export default function MercadoLivre() {
  const { userId } = useOutletContext() || {};
  const { confirm, alert } = useModal();
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

  // Produtos Catálogo (plataforma = Mercado Livre)
  const [produtos, setProdutos]           = useState([]);
  const [categorias, setCategorias]       = useState([]);
  const [formProd, setFormProd]           = useState(FORM_INICIAL);
  const [editandoId, setEditandoId]       = useState(null);
  const [loadingProd, setLoadingProd]     = useState(false);
  const [searchProd, setSearchProd]       = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStatusProd, setFiltroStatusProd] = useState('');
  const [selectedProds, setSelectedProds] = useState(new Set());

  // Não Vinculados (plataforma = ML_PENDENTE)
  const [naoVinculados, setNaoVinculados] = useState([]);
  const [loadingNaoVinc, setLoadingNaoVinc] = useState(false);
  const [selectedNaoVinc, setSelectedNaoVinc] = useState(new Set());

  // Modal de Vinculação (Kit Composition)
  const [vincularAnuncio, setVincularAnuncio] = useState(null);
  const [composicaoKit, setComposicaoKit]     = useState([]); // [{ produto, quantidade }]
  const [buscaBase, setBuscaBase]             = useState('');
  const [pesoManual, setPesoManual]           = useState('');
  const [loadingVincular, setLoadingVincular] = useState(false);

  const terminalRef = useRef(null);

  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [logs]);

  useEffect(() => {
    if (!userId) return;
    buscarDivergencias();
    buscarDivStats();
    buscarProdutos();
    buscarNaoVinculados();
    buscarCategorias();
  }, [userId]);

  useEffect(() => { if (userId) buscarDivergencias(); }, [filtroStatus, userId]);
  useEffect(() => { if (userId) buscarProdutos(); }, [filtroCategoria, filtroStatusProd, userId]);

  const apiGet = useCallback(async (path) => {
    const res  = await fetch(`${API_BASE_URL}${path}`);
    return res.json();
  }, []);

  const toggleSelectAll = (items, selected, setSelected, key = 'id') => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i[key])));
  };

  // ── Divergências ─────────────────────────────────────────────────────────

  const buscarDivergencias = async () => {
    setLoadingDiv(true);
    try {
      const data = await apiGet(`/api/divergencias?status=${filtroStatus}&plataforma=Mercado Livre&userId=${userId}`);
      if (Array.isArray(data)) setDivergencias(data);
    } catch {} finally { setLoadingDiv(false); }
  };

  const buscarDivStats = async () => {
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
    const ok = await confirm({ title: 'Excluir', message: 'Deseja excluir?', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try { await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' }); await buscarDivergencias(); await buscarDivStats(); }
    catch {} finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const acaoLoteDivs = async (tipo) => {
    if (selectedDivs.size === 0) return;
    for (const id of selectedDivs) {
      if (tipo === 'excluir') await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' });
    }
    setSelectedDivs(new Set()); await buscarDivergencias(); await buscarDivStats();
  };

  const limparCorrigidas = async () => {
    const ok = await confirm({ title: 'Limpar Corrigidas', message: 'Remover todas as divergências "Corrigido"?', confirmLabel: 'Limpar', type: 'warning' });
    if (!ok) return;
    try { await fetch(`${API_BASE_URL}/api/divergencias/limpar/corrigidas?userId=${userId}`, { method: 'DELETE' }); await buscarDivergencias(); await buscarDivStats(); } catch {}
  };

  // ── Não Vinculados ────────────────────────────────────────────────────────

  const buscarNaoVinculados = async () => {
    setLoadingNaoVinc(true);
    try {
      const data = await apiGet(`/api/produtos?plataforma=ML_PENDENTE&userId=${userId}`);
      if (Array.isArray(data)) setNaoVinculados(data);
    } catch {} finally { setLoadingNaoVinc(false); }
  };

  const acaoNaoVinculadoBasica = async (id, acaoStr) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      if (acaoStr === 'excluir') {
        await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
      } else if (acaoStr === 'ignorado') {
        await fetch(`${API_BASE_URL}/api/produtos/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plataforma: 'ML_IGNORADO' })
        });
      }
      await buscarNaoVinculados(); await buscarProdutos();
    } catch {} finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const acaoLoteNaoVinculados = async (acaoStr) => {
    if (selectedNaoVinc.size === 0) return;
    const ok = await confirm({ title: 'Ação em Lote', message: `Aplicar ação em ${selectedNaoVinc.size} anúncio(s)?`, confirmLabel: 'Confirmar' });
    if (!ok) return;

    for (const id of selectedNaoVinc) {
      if (acaoStr === 'excluir') {
        await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
      } else if (acaoStr === 'ignorado') {
        await fetch(`${API_BASE_URL}/api/produtos/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plataforma: 'ML_IGNORADO' })
        });
      }
    }
    setSelectedNaoVinc(new Set()); await buscarNaoVinculados(); await buscarProdutos();
  };

  // ── Lógica do Modal de Vinculação (Kits) ──────────────────────────────────

  const abrirModalVincular = (produtoML) => {
    setVincularAnuncio(produtoML);
    setComposicaoKit([]);
    setBuscaBase('');
    setPesoManual('');
  };

  const addNaComposicao = (prod) => {
    const existe = composicaoKit.find(c => c.produto.id === prod.id);
    if (existe) {
      setComposicaoKit(composicaoKit.map(c => c.produto.id === prod.id ? { ...c, quantidade: c.quantidade + 1 } : c));
    } else {
      setComposicaoKit([...composicaoKit, { produto: prod, quantidade: 1 }]);
    }
    setBuscaBase('');
  };

  const alteraQtdComposicao = (prodId, delta) => {
    setComposicaoKit(prev => {
      const atual = prev.find(c => c.produto.id === prodId);
      if (!atual) return prev;
      const novaQtd = atual.quantidade + delta;
      if (novaQtd <= 0) return prev.filter(c => c.produto.id !== prodId); // Remove se zerar
      return prev.map(c => c.produto.id === prodId ? { ...c, quantidade: novaQtd } : c);
    });
  };

  const calculaPesoKit = () => {
    return composicaoKit.reduce((acc, curr) => acc + (curr.produto.pesoGramas * curr.quantidade), 0);
  };

  const salvarVinculacao = async () => {
    setLoadingVincular(true);
    try {
      const payload = {
        composicao: composicaoKit.map(c => ({ produtoId: c.produto.id, quantidade: c.quantidade })),
        pesoManual: pesoManual
      };
      
      await fetch(`${API_BASE_URL}/api/produtos/${vincularAnuncio.id}/vincular`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      setVincularAnuncio(null);
      await buscarNaoVinculados();
      await buscarProdutos();
    } catch {
      alert({ title: 'Erro', message: 'Erro ao vincular anúncio.' });
    } finally {
      setLoadingVincular(false);
    }
  };

  const produtosBaseFiltrados = produtos.filter(p => 
    !p.eKit && (buscaBase === '' || p.nome.toLowerCase().includes(buscaBase.toLowerCase()) || p.sku.toLowerCase().includes(buscaBase.toLowerCase()))
  ).slice(0, 5); // Limita a 5 resultados para não quebrar o layout

  // ── Produtos (Catálogo) ───────────────────────────────────────────────────

  const buscarProdutos = async () => {
    try {
      const params = new URLSearchParams({ userId, plataforma: 'Mercado Livre' });
      if (filtroCategoria)  params.set('categoria', filtroCategoria);
      if (filtroStatusProd) params.set('status', filtroStatusProd);
      if (searchProd)       params.set('search', searchProd);
      const data = await apiGet(`/api/produtos?${params}`);
      if (Array.isArray(data)) setProdutos(data);
    } catch {}
  };

  const buscarCategorias = async () => {
    try { const data = await apiGet(`/api/produtos/categorias?userId=${userId}`); setCategorias(data); } catch {}
  };

  const handleSubmitProduto = async (e) => {
    e.preventDefault();
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
    const ok = await confirm({ title: 'Excluir Produto', danger: true, message: 'Remover produto do catálogo?', confirmLabel: 'Excluir' });
    if (!ok) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' }); await buscarProdutos(); } catch {}
  };

  const excluirLoteProdutos = async () => {
    if (selectedProds.size === 0) return;
    const ok = await confirm({ title: 'Excluir Produtos', danger: true, message: `Excluir ${selectedProds.size} produto(s)?`, confirmLabel: 'Excluir' });
    if (!ok) return;
    for (const id of selectedProds) await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
    setSelectedProds(new Set()); await buscarProdutos();
  };

  // ── Bot ───────────────────────────────────────────────────────────────────

  const iniciarBot = () => {
    if (!userId) return;
    setIsBotRunning(true); setProgress(0);
    setLogs([{ msg: '🚀 Iniciando varredura e sincronização...', type: 'info' }]);
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream?userId=${userId}`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.msg) setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
        if (data.type === 'progress' && typeof data.percent === 'number') setProgress(data.percent);
        if (data.type === 'done') { 
          setIsBotRunning(false); eventSource.close(); 
          buscarDivergencias(); buscarDivStats(); buscarNaoVinculados();
        }
      } catch (_) {}
    };
    eventSource.onerror = () => { setIsBotRunning(false); eventSource.close(); };
  };

  const produtosFiltrados = produtos.filter(p => (!searchProd || p.nome.toLowerCase().includes(searchProd.toLowerCase()) || p.sku.toLowerCase().includes(searchProd.toLowerCase()) || (p.mlItemId || '').toLowerCase().includes(searchProd.toLowerCase())));

  return (
    <div className="w-full max-w-7xl mx-auto p-4 h-full flex flex-col animate-in fade-in duration-500 relative">
      <MlConfigPanel userId={userId} onStatusChange={setMlConectado} />

      {/* Header + Tabs */}
      <div className="flex justify-between items-center mb-4 shrink-0 flex-wrap gap-3">
        <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5" style={{ color: 'var(--theme-text)' }}>
          <div className="bg-[#FFE600] p-1.5 rounded-lg shadow-sm"><ShoppingBag className="w-4 h-4 text-slate-900" /></div>
          Gestão Mercado Livre
        </h2>
        <nav className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {[['bot', 'Scanner ML'], ['pendentes', `Não Vinculados (${naoVinculados.length})`], ['produtos', 'Catálogo Local']].map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all whitespace-nowrap ${activeTab === k ? 'bg-[#FFE600] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </nav>
      </div>

      {/* ── ABA SCANNER ────────────────────────────────────────────────── */}
      {activeTab === 'bot' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Robô de Sincronização e Auditoria</p>
              <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado}
                className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest mb-3 transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:scale-95'}`}>
                {isBotRunning ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando...</span> : !mlConectado ? '🔒 Conecte o ML primeiro' : '🔍 Iniciar Varredura'}
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
          </section>

          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-600">
                  <AlertTriangle className="text-amber-500 w-4 h-4" /> Divergências Encontradas
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedDivs.size > 0 && (
                    <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                      <span className="text-[10px] font-black text-blue-700">{selectedDivs.size} sel.</span>
                      <button onClick={() => acaoLoteDivs('corrigido')} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => acaoLoteDivs('ignorado')} className="text-slate-500 hover:text-slate-700 p-0.5"><EyeOff className="w-3.5 h-3.5" /></button>
                      <button onClick={() => acaoLoteDivs('excluir')} className="text-red-500 hover:text-red-700 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  {divStats.corrigido > 0 && (
                    <button onClick={limparCorrigidas} className="text-[9px] font-black uppercase text-red-500 hover:text-red-600 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Limpar corrigidas
                    </button>
                  )}
                  <button onClick={() => { buscarDivergencias(); buscarDivStats(); }} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100"><RefreshCw className="w-3.5 h-3.5 text-slate-500" /></button>
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
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Tudo limpo por aqui</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-3 py-2.5">
                        <button onClick={() => toggleSelectAll(divergencias, selectedDivs, setSelectedDivs, 'id')} className="text-slate-400">
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
                                  {div.link && div.link !== 'N/A' && <a href={div.link} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><ExternalLink className="w-3.5 h-3.5" /></a>}
                                  {div.status !== 'CORRIGIDO' && <button onClick={() => acao(div.id, 'corrigido')} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check className="w-3.5 h-3.5" /></button>}
                                  {div.status !== 'PENDENTE'  && <button onClick={() => acao(div.id, 'pendente')}  className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"><Clock className="w-3.5 h-3.5" /></button>}
                                  {div.status !== 'IGNORADO'  && <button onClick={() => acao(div.id, 'ignorado')}  className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100"><EyeOff className="w-3.5 h-3.5" /></button>}
                                  <button onClick={() => excluirDivergencia(div.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>
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

      {/* ── ABA NÃO VINCULADOS ─────────────────────────────────────────── */}
      {activeTab === 'pendentes' && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-amber-50/30 flex justify-between items-center">
            <div>
              <h3 className="text-[12px] font-black text-amber-700 uppercase flex items-center gap-2">
                <Box className="w-4 h-4" /> Anúncios Desconhecidos ({naoVinculados.length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-1">Anúncios encontrados no ML aguardando mapeamento de peso.</p>
            </div>
            
            <div className="flex items-center gap-2">
              {selectedNaoVinc.size > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-2.5 py-1.5">
                  <span className="text-[10px] font-black text-blue-700 mr-1">{selectedNaoVinc.size} sel.</span>
                  <button onClick={() => acaoLoteNaoVinculados('ignorado')} className="flex items-center gap-1 text-[10px] font-black uppercase bg-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-300"><EyeOff className="w-3 h-3"/> Ignorar</button>
                  <button onClick={() => acaoLoteNaoVinculados('excluir')} className="flex items-center gap-1 text-[10px] font-black uppercase bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100"><Trash2 className="w-3 h-3"/> Excluir</button>
                </div>
              )}
              <button onClick={buscarNaoVinculados} className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500"><RefreshCw className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingNaoVinc ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : naoVinculados.length === 0 ? (
              <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[10px]">Não há anúncios aguardando vínculo</div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white border-b border-slate-100">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-4 py-3 w-10">
                      <button onClick={() => toggleSelectAll(naoVinculados, selectedNaoVinc, setSelectedNaoVinc, 'id')} className="text-slate-400">
                        {selectedNaoVinc.size === naoVinculados.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="px-4 py-3">Produto ML</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {naoVinculados.map(prod => {
                    const sel = selectedNaoVinc.has(prod.id);
                    const loading = actionLoading[prod.id];
                    return (
                      <tr key={prod.id} className={`hover:bg-slate-50 transition-colors ${sel ? 'bg-blue-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <button onClick={() => { const n = new Set(selectedNaoVinc); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedNaoVinc(n); }} className="text-slate-400 hover:text-blue-600">
                            {sel ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {prod.thumbnail ? <img src={prod.thumbnail} alt="" className="w-10 h-10 object-cover rounded-lg" /> : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><Image className="w-4 h-4 text-slate-300"/></div>}
                            <div>
                              <p className="text-[11px] font-bold text-slate-700 max-w-[300px] truncate">{prod.nome}</p>
                              <div className="flex gap-2 items-center mt-1">
                                <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 rounded">{prod.mlItemId}</span>
                                <span className="text-[10px] font-bold text-slate-500 ml-2">R$ {parseFloat(prod.preco).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : (
                              <>
                                <button onClick={() => abrirModalVincular(prod)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-black uppercase shadow-sm">
                                  <Link2 className="w-3.5 h-3.5" /> Vincular Composição
                                </button>
                                <button onClick={() => acaoNaoVinculadoBasica(prod.id, 'ignorado')} className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100" title="Ignorar este anúncio">
                                  <EyeOff className="w-4 h-4" />
                                </button>
                                <button onClick={() => acaoNaoVinculadoBasica(prod.id, 'excluir')} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" title="Excluir do sistema">
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
      )}

      {/* ── MODAL DE VINCULAÇÃO (KIT COMPOSITION) ────────────────────────── */}
      {vincularAnuncio && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><Package className="w-4 h-4 text-blue-600"/> Composição do Anúncio</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Defina o que tem dentro desta caixa para o robô calcular o peso.</p>
              </div>
              <button onClick={() => setVincularAnuncio(null)} className="p-1 rounded-full hover:bg-slate-200 text-slate-400"><XCircle className="w-5 h-5"/></button>
            </div>

            <div className="p-4 bg-blue-50/30 border-b border-slate-100 flex gap-3 items-center">
              <img src={vincularAnuncio.thumbnail} className="w-12 h-12 rounded-lg object-cover bg-white border border-slate-200"/>
              <div>
                <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black font-mono">{vincularAnuncio.mlItemId}</span>
                <p className="font-bold text-[12px] text-slate-700 mt-1 leading-tight">{vincularAnuncio.nome}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="mb-5">
                <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">1. Selecione os produtos (Itens Físicos)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
                  <input value={buscaBase} onChange={e => setBuscaBase(e.target.value)} placeholder="Buscar Motor, Controle, Placa..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-[12px]" />
                </div>
                
                {buscaBase && (
                  <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
                    {produtosBaseFiltrados.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-slate-400">Nenhum produto base encontrado. Cadastre-o no Catálogo primeiro.</div>
                    ) : (
                      produtosBaseFiltrados.map(p => (
                        <div key={p.id} className="p-2 border-b border-slate-50 hover:bg-slate-50 flex items-center justify-between">
                          <div>
                            <p className="text-[11px] font-bold text-slate-700">{p.nome}</p>
                            <p className="text-[9px] text-slate-400">SKU: {p.sku} • Peso Unitário: {p.pesoGramas}g</p>
                          </div>
                          <button onClick={() => addNaComposicao(p)} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100">Adicionar</button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 mb-2 flex justify-between">
                  <span>2. Itens que compõem este anúncio</span>
                  {composicaoKit.length > 0 && <span className="text-blue-600">Total calculado: {calculaPesoKit()}g</span>}
                </label>
                
                {composicaoKit.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Nenhum item adicionado</p>
                    <p className="text-[10px] text-slate-400 mt-1">Busque os produtos acima ou insira um peso fixo abaixo.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {composicaoKit.map(item => (
                      <div key={item.produto.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                        <div className="flex-1">
                          <p className="text-[11px] font-bold text-slate-700">{item.produto.nome}</p>
                          <p className="text-[10px] text-slate-400">Peso un: {item.produto.pesoGramas}g</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                            <button onClick={() => alteraQtdComposicao(item.produto.id, -1)} className="p-1 hover:bg-white rounded text-slate-500"><Minus className="w-3.5 h-3.5"/></button>
                            <span className="w-8 text-center text-[12px] font-black">{item.quantidade}</span>
                            <button onClick={() => alteraQtdComposicao(item.produto.id, 1)} className="p-1 hover:bg-white rounded text-slate-500"><Plus className="w-3.5 h-3.5"/></button>
                          </div>
                          <span className="w-12 text-right text-[11px] font-bold text-blue-600">{item.produto.pesoGramas * item.quantidade}g</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {composicaoKit.length === 0 && (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Ou defina o peso manualmente (item único)</label>
                  <div className="flex items-center gap-2">
                    <Weight className="w-4 h-4 text-slate-400" />
                    <input type="number" value={pesoManual} onChange={e => setPesoManual(e.target.value)} placeholder="Ex: 850" className="w-32 py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-[12px]" />
                    <span className="text-[11px] font-bold text-slate-500">gramas</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={() => setVincularAnuncio(null)} className="px-5 py-2 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={salvarVinculacao} disabled={loadingVincular || (composicaoKit.length === 0 && !pesoManual)} 
                className="flex items-center gap-2 px-6 py-2 rounded-xl text-[11px] font-black uppercase text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md">
                {loadingVincular ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>}
                Confirmar Vinculação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA CATÁLOGO (Mantida inalterada, apenas formatada para economizar espaço) ─────────────────────────────── */}
      {activeTab === 'produtos' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <h2 className="font-black text-xs uppercase mb-4 flex items-center gap-2 text-blue-600">
                <Plus className="w-4 h-4" /> {editandoId ? 'Editar Produto' : 'Cadastrar Produto Base'}
              </h2>
              <form onSubmit={handleSubmitProduto} className="space-y-3.5 text-[11px] font-semibold text-slate-600">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="uppercase tracking-wider block mb-1 text-[10px]">SKU Interno</label>
                    <input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} placeholder="PROD-001" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                  </div>
                  <div>
                    <label className="uppercase tracking-wider block mb-1 text-[10px]">Categoria</label>
                    <input value={formProd.categoria} onChange={e => setFormProd({...formProd, categoria: e.target.value})} placeholder="Ex: Motores" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" list="cat-list" />
                    <datalist id="cat-list">{categorias.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                </div>
                <div>
                  <label className="uppercase tracking-wider block mb-1 text-[10px]">Nome do Produto (Para compor Kits)</label>
                  <input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} placeholder="Motor DZ Nano..." className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                </div>
                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 space-y-3">
                  <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Peso Unitário</p>
                  <div>
                    <label className="text-[9px] text-blue-600 block mb-1 flex items-center gap-1"><Weight className="w-3 h-3" /> Peso (g)</label>
                    <input required type="number" min="1" value={formProd.pesoGramas} onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})} placeholder="Ex: 500" className="w-full bg-white border border-blue-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button disabled={loadingProd} type="submit" className="flex-1 py-3 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-lg hover:bg-black transition-all shadow-md flex items-center justify-center gap-2">
                    {loadingProd ? <Loader2 className="w-4 h-4 animate-spin" /> : editandoId ? '💾 Salvar Edição' : '📥 Salvar Manual'}
                  </button>
                  {editandoId && <button type="button" onClick={() => { setEditandoId(null); setFormProd(FORM_INICIAL); }} className="px-3 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"><XCircle className="w-4 h-4" /></button>}
                </div>
              </form>
            </div>
          </section>

          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-lg overflow-hidden flex flex-col h-full">
            <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                <input value={searchProd} onChange={e => { setSearchProd(e.target.value); buscarProdutos(); }}
                  placeholder="Buscar produto base ou kit..." className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500" />
              </div>
              {selectedProds.size > 0 && (
                <button onClick={excluirLoteProdutos} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-black hover:bg-red-100">
                  <Trash2 className="w-3 h-3" /> Excluir ({selectedProds.size})
                </button>
              )}
              <span className="text-[10px] text-slate-400 font-bold ml-auto">{produtosFiltrados.length} produto(s)</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {produtosFiltrados.length === 0 ? (
                <div className="py-10 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[10px]">Catálogo vazio</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-3 py-2 w-8"><button onClick={() => toggleSelectAll(produtosFiltrados, selectedProds, setSelectedProds)} className="text-slate-400">{selectedProds.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Peso Calculado</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {produtosFiltrados.map(prod => {
                      const sel = selectedProds.has(prod.id);
                      return (
                        <tr key={prod.id} className={`hover:bg-slate-50 transition-colors group ${sel ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-3 py-2.5">
                            <button onClick={() => { const n = new Set(selectedProds); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedProds(n); }} className="text-slate-400 hover:text-blue-600">{sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}</button>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {prod.thumbnail ? <img src={prod.thumbnail} alt="" className="w-8 h-8 object-cover rounded-lg flex-shrink-0" /> : <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center"><Image className="w-4 h-4 text-slate-300"/></div>}
                              <div>
                                <div className="flex flex-wrap items-center gap-1 mb-0.5">
                                  <span className="text-[9px] font-black text-slate-600 bg-slate-100 border border-slate-200 px-1 rounded uppercase">{prod.sku}</span>
                                  {prod.mlItemId && <span className="text-[8px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 rounded flex items-center gap-0.5"><Check className="w-2 h-2"/> {prod.mlItemId}</span>}
                                  {prod.eKit && <span className="text-[8px] bg-amber-100 text-amber-700 font-black px-1 rounded uppercase">Anúncio Kit</span>}
                                </div>
                                <p className="text-[11px] font-bold text-slate-700 truncate max-w-[200px]">{prod.nome}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {prod.pesoGramas > 0 ? <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-black">{prod.pesoGramas}g</span> : <span className="text-[9px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-bold uppercase">Sem peso</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
      )}
    </div>
  );
}