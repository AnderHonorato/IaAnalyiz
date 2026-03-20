import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag,
  CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  ChevronDown, Package, Ruler, Weight, Filter, Loader2,
  Check, XCircle, BarChart3
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
  eKit: false, plataforma: 'Mercado Livre'
};

export default function MercadoLivre() {
  const [activeTab, setActiveTab]   = useState('bot');
  const [mlConectado, setMlConectado] = useState(false);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [logs, setLogs]             = useState([{ msg: 'KERNEL_ML_READY: Sistema de auditoria conectado.', type: 'info' }]);

  // Divergências
  const [divergencias, setDivergencias]   = useState([]);
  const [divStats, setDivStats]           = useState({ pendente: 0, corrigido: 0, ignorado: 0, total: 0 });
  const [filtroStatus, setFiltroStatus]   = useState('PENDENTE');
  const [loadingDiv, setLoadingDiv]       = useState(false);
  const [actionLoading, setActionLoading] = useState({}); // { [id]: true }

  // Produtos
  const [produtos, setProdutos]   = useState([]);
  const [formProd, setFormProd]   = useState(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [loadingProd, setLoadingProd] = useState(false);
  const [searchProd, setSearchProd] = useState('');

  const terminalRef = useRef(null);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    buscarDivergencias();
    buscarDivStats();
    buscarProdutos();
  }, []);

  useEffect(() => {
    buscarDivergencias();
  }, [filtroStatus]);

  // ── Divergências ─────────────────────────────────────────────────────────

  const buscarDivergencias = async () => {
    setLoadingDiv(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/divergencias?status=${filtroStatus}&plataforma=Mercado Livre`);
      const data = await res.json();
      if (Array.isArray(data)) setDivergencias(data);
    } catch (e) { console.error(e); } finally { setLoadingDiv(false); }
  };

  const buscarDivStats = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/divergencias/stats`);
      const data = await res.json();
      setDivStats(data);
    } catch (e) { console.error(e); }
  };

  const acao = async (id, tipo) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT' });
      await buscarDivergencias();
      await buscarDivStats();
    } catch (e) { console.error(e); } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const excluirDivergencia = async (id) => {
    if (!confirm('Excluir esta divergência permanentemente?')) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' });
      await buscarDivergencias();
      await buscarDivStats();
    } catch (e) { console.error(e); } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const limparCorrigidas = async () => {
    if (!confirm('Remover todas as divergências corrigidas?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/divergencias/limpar/corrigidas`, { method: 'DELETE' });
      await buscarDivergencias();
      await buscarDivStats();
    } catch (e) { console.error(e); }
  };

  // ── Produtos ─────────────────────────────────────────────────────────────

  const buscarProdutos = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/produtos`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProdutos(data.filter(p => p.plataforma === 'Mercado Livre' || !p.plataforma));
      }
    } catch (e) { console.error(e); }
  };

  const handleSubmitProduto = async (e) => {
    e.preventDefault();
    setLoadingProd(true);
    try {
      const url    = editandoId ? `${API_BASE_URL}/api/produtos/${editandoId}` : `${API_BASE_URL}/api/produtos`;
      const method = editandoId ? 'PUT' : 'POST';
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formProd)
      });
      setFormProd(FORM_INICIAL);
      setEditandoId(null);
      buscarProdutos();
    } catch (e) { console.error(e); } finally { setLoadingProd(false); }
  };

  const editarProduto = (p) => {
    setEditandoId(p.id);
    setFormProd({
      sku: p.sku, nome: p.nome, preco: p.preco,
      pesoGramas: p.pesoGramas, alturaCm: p.alturaCm || '',
      larguraCm: p.larguraCm || '', comprimentoCm: p.comprimentoCm || '',
      mlItemId: p.mlItemId || '', eKit: p.eKit,
      plataforma: 'Mercado Livre'
    });
  };

  const excluirProduto = async (id) => {
    if (!confirm('Excluir este produto?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
      buscarProdutos();
    } catch (e) { console.error(e); }
  };

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(searchProd.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchProd.toLowerCase()) ||
    (p.mlItemId || '').toLowerCase().includes(searchProd.toLowerCase())
  );

  // ── Bot ───────────────────────────────────────────────────────────────────

  const iniciarBot = () => {
    setIsBotRunning(true); setProgress(0);
    setLogs([{ msg: '🚀 Iniciando auditoria...', type: 'info' }]);
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.msg) setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
        if (data.type === 'progress' && typeof data.percent === 'number') setProgress(data.percent);
        if (data.type === 'done') {
          setIsBotRunning(false);
          eventSource.close();
          buscarDivergencias();
          buscarDivStats();
        }
      } catch (_) {}
    };
    eventSource.onerror = () => {
      setIsBotRunning(false);
      eventSource.close();
    };
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto p-4 h-full flex flex-col animate-in fade-in duration-500">

      {/* Painel de conexão OAuth + Agendador */}
      <MlConfigPanel onStatusChange={setMlConectado} />

      {/* Header + Navegação */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
          <div className="bg-[#FFE600] p-1.5 rounded-lg shadow-sm">
            <ShoppingBag className="w-4 h-4 text-slate-900" />
          </div>
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

      {/* ── ABA SCANNER ──────────────────────────────────────────────────── */}
      {activeTab === 'bot' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">

          {/* Painel do Bot */}
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Protocolo de Auditoria</p>
              <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado}
                className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest mb-3 transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:scale-95'}`}>
                {isBotRunning ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Auditando anúncios...
                  </span>
                ) : !mlConectado ? '🔒 Conecte o ML primeiro' : '🔍 Executar Auditoria ML'}
              </button>

              {/* Barra de progresso */}
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Progresso</span>
                  <span className="text-[10px] font-black text-blue-400">{progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 shadow-[0_0_8px_#3b82f6] transition-all duration-300"
                    style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>

            {/* Terminal */}
            <div ref={terminalRef}
              className="flex-1 bg-slate-950 m-3 rounded-xl p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
              {logs.map((log, i) => (
                <div key={i} className={
                  log.type === 'warn'    ? 'text-amber-400'   :
                  log.type === 'success' ? 'text-emerald-400' :
                  'text-slate-400'
                }>
                  <span className="mr-2 text-slate-600 select-none">›</span>{log.msg}
                </div>
              ))}
            </div>

            {/* Stats de divergências */}
            <div className="p-3 border-t border-slate-100 grid grid-cols-3 gap-2">
              {[
                { k: 'pendente',  label: 'Pendentes',  c: 'text-amber-600',   b: 'bg-amber-50' },
                { k: 'corrigido', label: 'Corrigidos', c: 'text-emerald-600', b: 'bg-emerald-50' },
                { k: 'ignorado',  label: 'Ignorados',  c: 'text-slate-500',   b: 'bg-slate-50' },
              ].map(({ k, label, c, b }) => (
                <div key={k} className={`${b} rounded-xl p-2 text-center`}>
                  <p className={`text-lg font-black ${c}`}>{divStats[k] || 0}</p>
                  <p className={`text-[8px] font-black uppercase tracking-widest ${c} opacity-70`}>{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Tabela de Divergências */}
          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
            {/* Header + Filtros */}
            <div className="p-3 border-b border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-600">
                  <AlertTriangle className="text-amber-500 w-4 h-4" />
                  Inconsistências de Frete
                </div>
                <div className="flex items-center gap-2">
                  {divStats.corrigido > 0 && (
                    <button onClick={limparCorrigidas}
                      className="text-[9px] font-black uppercase text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors">
                      <Trash2 className="w-3 h-3" /> Limpar corrigidas
                    </button>
                  )}
                  <button onClick={() => { buscarDivergencias(); buscarDivStats(); }}
                    className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Filtro de status */}
              <div className="flex gap-1.5">
                {['PENDENTE', 'CORRIGIDO', 'IGNORADO', 'TODOS'].map(s => {
                  const cfg = STATUS_CONFIG[s] || { label: 'Todos', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
                  const count = s === 'TODOS' ? divStats.total : (divStats[s.toLowerCase()] || 0);
                  return (
                    <button key={s} onClick={() => setFiltroStatus(s)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${filtroStatus === s ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                      {cfg.label || 'Todos'} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Listagem */}
            <div className="flex-1 overflow-y-auto">
              {loadingDiv ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : divergencias.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-3">
                  <div className="p-4 bg-emerald-50 rounded-full">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {filtroStatus === 'PENDENTE' ? 'Nenhuma divergência pendente' : `Nenhum item ${filtroStatus.toLowerCase()}`}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-4 py-2.5">Anúncio</th>
                      <th className="px-4 py-2.5">Divergência</th>
                      <th className="px-4 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[11px]">
                    {divergencias.map((div) => {
                      const cfg      = STATUS_CONFIG[div.status] || STATUS_CONFIG.PENDENTE;
                      const Icon     = cfg.icon;
                      const loading  = actionLoading[div.id];

                      return (
                        <tr key={div.id} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                                <Icon className="w-2.5 h-2.5 inline mr-1" />{cfg.label}
                              </span>
                            </div>
                            <p className="font-bold text-blue-600 text-[11px] truncate max-w-[140px]" title={div.titulo || div.mlItemId}>
                              {div.titulo || div.mlItemId}
                            </p>
                            <p className="text-slate-400 text-[9px] font-mono">{div.mlItemId}</p>
                          </td>

                          <td className="py-3 px-4">
                            <p className="text-slate-700 text-[10px] italic leading-relaxed">
                              {div.motivo}
                            </p>
                            {div.pesoMl > 0 && div.pesoLocal > 0 && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">ML: {div.pesoMl}g</span>
                                <span className="text-slate-300 text-[8px]">vs</span>
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">Local: {div.pesoLocal}g</span>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${Math.abs(div.pesoMl - div.pesoLocal) > 100 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                  Δ {Math.abs(div.pesoMl - div.pesoLocal)}g
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1.5">
                              {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                              ) : (
                                <>
                                  {/* Abrir no ML */}
                                  {div.link && div.link !== 'N/A' && (
                                    <a href={div.link} target="_blank" rel="noopener noreferrer"
                                      className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="Abrir no ML">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}

                                  {/* Marcar corrigido */}
                                  {div.status !== 'CORRIGIDO' && (
                                    <button onClick={() => acao(div.id, 'corrigido')}
                                      className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="Marcar como corrigido">
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Marcar pendente (desfazer) */}
                                  {div.status !== 'PENDENTE' && (
                                    <button onClick={() => acao(div.id, 'pendente')}
                                      className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" title="Mover para pendente">
                                      <Clock className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Ignorar */}
                                  {div.status !== 'IGNORADO' && (
                                    <button onClick={() => acao(div.id, 'ignorado')}
                                      className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors" title="Ignorar">
                                      <EyeOff className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Excluir */}
                                  <button onClick={() => excluirDivergencia(div.id)}
                                    className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Excluir">
                                    <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ── ABA CATÁLOGO ─────────────────────────────────────────────────── */}
      {activeTab === 'produtos' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">

          {/* Formulário de cadastro */}
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-lg overflow-y-auto custom-scrollbar">
            <h2 className="font-black text-xs uppercase mb-5 flex items-center gap-2 text-blue-600">
              <Plus className="w-4 h-4" />
              {editandoId ? 'Editar Produto' : 'Cadastrar Produto ML'}
            </h2>

            <form onSubmit={handleSubmitProduto} className="space-y-4 text-[11px] font-semibold text-slate-600">

              {/* SKU + ID ML */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="uppercase tracking-wider block mb-1 text-[10px]">SKU Interno</label>
                  <input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})}
                    placeholder="EX: PROD-001"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors text-[11px]" />
                </div>
                <div>
                  <label className="uppercase tracking-wider block mb-1 text-[10px]">ID ML (MLB...)</label>
                  <input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})}
                    placeholder="MLB123456789"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors text-[11px]" />
                </div>
              </div>

              {/* Título do Anúncio */}
              <div>
                <label className="uppercase tracking-wider block mb-1 text-[10px]">Título do Anúncio</label>
                <input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})}
                  placeholder="Igual ao título no Mercado Livre"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors text-[11px]" />
              </div>

              {/* Preço */}
              <div>
                <label className="uppercase tracking-wider block mb-1 text-[10px]">Preço (R$)</label>
                <input required type="number" step="0.01" min="0" value={formProd.preco}
                  onChange={e => setFormProd({...formProd, preco: e.target.value})}
                  placeholder="0,00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors text-[11px]" />
              </div>

              {/* Dimensões do pacote — igual ao ML */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-3.5 h-3.5 text-blue-600" />
                  <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">
                    Dimensões da Embalagem (pacote com produto)
                  </p>
                </div>
                <p className="text-[9px] text-blue-500 -mt-1 mb-2 leading-relaxed">
                  Informe as medidas reais da embalagem para envio, não do produto nu.
                  Estes valores são usados pelo ML para calcular o frete.
                </p>

                {/* Peso */}
                <div>
                  <label className="uppercase tracking-wider block mb-1 text-[9px] text-blue-600 flex items-center gap-1">
                    <Weight className="w-3 h-3" /> Peso total (gramas)
                  </label>
                  <input required type="number" min="1" value={formProd.pesoGramas}
                    onChange={e => setFormProd({...formProd, pesoGramas: e.target.value})}
                    placeholder="500"
                    className="w-full bg-white border border-blue-200 rounded-lg p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors text-[11px]" />
                </div>

                {/* Altura, Largura, Comprimento */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'alturaCm',      label: 'Altura (cm)',      placeholder: '10' },
                    { key: 'larguraCm',     label: 'Largura (cm)',     placeholder: '15' },
                    { key: 'comprimentoCm', label: 'Comprimento (cm)', placeholder: '20' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="uppercase tracking-wider block mb-1 text-[8px] text-blue-600">
                        <Ruler className="w-2.5 h-2.5 inline mr-1" />{label}
                      </label>
                      <input type="number" step="0.1" min="0" value={formProd[key]}
                        onChange={e => setFormProd({...formProd, [key]: e.target.value})}
                        placeholder={placeholder}
                        className="w-full bg-white border border-blue-200 rounded-lg p-2 outline-none focus:border-blue-500 transition-colors text-[11px]" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Tipo Kit */}
              <div className="flex items-center gap-3 p-3.5 bg-amber-50/50 rounded-xl border border-dashed border-amber-200">
                <input type="checkbox" id="ekit" checked={formProd.eKit}
                  onChange={e => setFormProd({...formProd, eKit: e.target.checked})}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
                <label htmlFor="ekit" className="text-[10px] font-black text-amber-800 uppercase tracking-widest cursor-pointer">
                  Anúncio do Tipo KIT (multi-item)
                </label>
              </div>

              <div className="flex gap-2">
                <button disabled={loadingProd} type="submit"
                  className="flex-1 py-3 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-lg hover:bg-black transition-all shadow-md flex items-center justify-center gap-2">
                  {loadingProd ? <Loader2 className="w-4 h-4 animate-spin" /> : editandoId ? '💾 Salvar Alterações' : '📥 Registrar no Banco'}
                </button>
                {editandoId && (
                  <button type="button" onClick={() => { setEditandoId(null); setFormProd(FORM_INICIAL); }}
                    className="px-3 py-3 bg-slate-100 text-slate-600 font-black text-[11px] rounded-lg hover:bg-slate-200 transition-all">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Lista de produtos */}
          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-lg overflow-hidden flex flex-col h-full">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <h2 className="font-black text-xs uppercase text-slate-800 flex items-center gap-2">
                <Box className="w-4 h-4 text-blue-600" /> Base de Produtos ({produtosFiltrados.length})
              </h2>
              <input
                type="text" value={searchProd} onChange={e => setSearchProd(e.target.value)}
                placeholder="Buscar por SKU, título ou ID ML..."
                className="text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 transition-colors w-56"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              {produtosFiltrados.length === 0 ? (
                <div className="py-10 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[10px]">
                  Nenhum produto encontrado
                </div>
              ) : produtosFiltrados.map(prod => (
                <div key={prod.id}
                  className="border border-slate-100 p-3.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm group">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      {/* Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                          {prod.sku}
                        </span>
                        {prod.eKit && (
                          <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black uppercase">KIT</span>
                        )}
                        {prod.mlItemId && (
                          <span className="text-[8px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono truncate max-w-[110px]" title={prod.mlItemId}>
                            {prod.mlItemId}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-bold text-slate-700 truncate">{prod.nome}</h3>

                      {/* Dimensões */}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[9px] text-slate-500 flex items-center gap-1">
                          <Weight className="w-2.5 h-2.5" /> {prod.pesoGramas}g
                        </span>
                        {prod.alturaCm > 0 && (
                          <span className="text-[9px] text-slate-400 flex items-center gap-1">
                            <Ruler className="w-2.5 h-2.5" />
                            {prod.alturaCm}×{prod.larguraCm}×{prod.comprimentoCm} cm
                          </span>
                        )}
                        <span className="text-[9px] text-slate-500 font-semibold">
                          R$ {parseFloat(prod.preco).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => editarProduto(prod)}
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="Editar">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => excluirProduto(prod.id)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}