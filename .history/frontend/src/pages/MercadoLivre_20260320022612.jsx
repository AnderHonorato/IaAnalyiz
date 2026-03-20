import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag,
  CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, 
  Image as ImageIcon, Link2, Square, CheckSquare, 
  Eye, Sparkles, Upload, HelpCircle, Unlink, LayoutList, FileText
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

// ── Componente: Insight IA Tempo Real ──
function AiInsightHeader({ insight }) {
  if (!insight) return null;
  return (
    <div className="flex items-start gap-2.5 bg-indigo-50 border border-indigo-100 px-4 py-2.5 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 max-w-2xl">
      <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse flex-shrink-0 mt-0.5" />
      <p className="text-[12px] font-medium text-slate-700 leading-snug" dangerouslySetInnerHTML={{ __html: insight }} />
    </div>
  );
}

// ── Componente: Quick View (Pop-up Lateral Fixo) ──
function QuickViewPopover({ item, onClose, onOpenFull }) {
  if (!item) return null;
  return (
    <div className="fixed z-[100] bg-slate-900 text-white p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-slate-700 w-80 right-8 top-32 animate-in fade-in slide-in-from-right-8">
      <div className="flex justify-between items-start mb-3">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Resumo Rápido</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><XCircle className="w-5 h-5"/></button>
      </div>
      <div className="flex gap-3 mb-4">
        {item.thumbnail ? <img src={item.thumbnail} className="w-14 h-14 rounded-lg object-cover bg-white" /> : <div className="w-14 h-14 bg-slate-800 rounded-lg flex items-center justify-center"><ImageIcon className="w-5 h-5 text-slate-600"/></div>}
        <div>
          <p className="text-[12px] font-bold leading-tight line-clamp-3">{item.nome || item.titulo}</p>
          <p className="text-[10px] text-slate-400 font-mono mt-1">{item.mlItemId}</p>
        </div>
      </div>
      <div className="space-y-1.5 text-[11px] mb-4 bg-slate-800 p-2.5 rounded-xl border border-slate-700">
        {item.pesoMl !== undefined && <p className="flex justify-between items-center"><span className="text-slate-400">ML Diz que pesa:</span> <span className="font-bold text-amber-400">{item.pesoMl}g</span></p>}
        {item.pesoLocal !== undefined && <p className="flex justify-between items-center"><span className="text-slate-400">Peso Real (Sistema):</span> <span className="font-bold text-emerald-400">{item.pesoLocal}g</span></p>}
        {item.pesoGramas !== undefined && <p className="flex justify-between items-center"><span className="text-slate-400">Peso Cadastrado:</span> <span className="font-bold text-blue-400">{item.pesoGramas}g</span></p>}
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onOpenFull(item)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors shadow-md">
          Ficha Completa
        </button>
        {(item.link || item.mlItemId) && (
          <a href={item.link || `https://produto.mercadolivre.com.br/${item.mlItemId}`} target="_blank" rel="noopener noreferrer" 
             className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[10px] font-bold uppercase transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir no Mercado Livre
          </a>
        )}
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
  const [logs, setLogs] = useState([{ msg: 'KERNEL_ML_READY: Sistema de auditoria conectado.', type: 'info' }]);
  const [aiInsight, setAiInsight] = useState('');
  
  const [quickViewItem, setQuickViewItem] = useState(null); // Flutuante lateral (Clique no olho)
  const [fullModalItem, setFullModalItem] = useState(null); // Modal giganta
  const [fullItemData, setFullItemData]   = useState(null); 
  const [loadingFullData, setLoadingFullData] = useState(false);

  const [showDicas, setShowDicas] = useState(false);

  // Divergências
  const [divergencias, setDivergencias] = useState([]);
  const [divStats, setDivStats] = useState({ pendente: 0, reincidente: 0, corrigido: 0, ignorado: 0, total: 0 });
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE');
  const [loadingDiv, setLoadingDiv] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedDivs, setSelectedDivs] = useState(new Set());

  // Produtos Catálogo
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formProd, setFormProd] = useState(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [loadingProd, setLoadingProd] = useState(false);
  const [searchProd, setSearchProd] = useState('');
  const [selectedProds, setSelectedProds] = useState(new Set());
  const [tipoCatalogo, setTipoCatalogo] = useState('BASE'); // 'BASE' | 'ML'

  // Não Vinculados
  const [naoVinculados, setNaoVinculados] = useState([]);
  const [selectedNaoVinc, setSelectedNaoVinc] = useState(new Set());

  // Vinculação Modal
  const [vincularAnuncio, setVincularAnuncio] = useState(null);
  const [composicaoKit, setComposicaoKit] = useState([]); 
  const [buscaBase, setBuscaBase] = useState('');
  const [pesoManual, setPesoManual] = useState('');
  const [unidadeManual, setUnidadeManual] = useState('g');

  const [showImportModal, setShowImportModal] = useState(false);

  const terminalRef = useRef(null);
  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [logs]);

  useEffect(() => {
    if (!userId) return;
    buscarDivergencias(); buscarDivStats(); buscarProdutos(); buscarNaoVinculados(); buscarCategorias();
    buscarInsightIA();
  }, [userId]);

  useEffect(() => { if (userId) buscarDivergencias(); }, [filtroStatus, userId]);

  const apiGet = useCallback(async (path) => { const res = await fetch(`${API_BASE_URL}${path}`); return res.json(); }, []);

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
    setQuickViewItem(null);
    setFullModalItem(item);
    setFullItemData(null);
    
    if (!item.mlItemId) return;
    setLoadingFullData(true);
    try {
      const data = await apiGet(`/api/ml/item-details/${item.mlItemId}?userId=${userId}`);
      setFullItemData(data);
    } catch {
      alert({ title: 'Erro', message: 'Não foi possível buscar os dados direto do ML.' });
    } finally {
      setLoadingFullData(false);
    }
  };

  // ── Divergências ──
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

  // ── Não Vinculados ──
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

  // ── Produtos (Catálogo) ──
  const buscarProdutos = async () => {
    try { setProdutos(await apiGet(`/api/produtos?userId=${userId}`)); } catch {}
  };

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
    if (!await confirm({ title: 'Excluir Produto', danger: true, message: 'Remover produto do catálogo?', confirmLabel: 'Excluir' })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' }); await buscarProdutos(); } catch {}
  };

  const desvincularProduto = async (id) => {
    if (!await confirm({ title: 'Desvincular', message: 'Isto removerá as regras de peso e enviará o anúncio de volta para "Não Vinculados". Continuar?', confirmLabel: 'Desvincular' })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}/desvincular`, { method: 'PUT' }); await buscarProdutos(); await buscarNaoVinculados(); } catch {}
  };

  // ── Lógica de Vinculação (Kits) ──
  const salvarVinculacao = async () => {
    let pManualConvertido = parseFloat(pesoManual) || 0;
    if (unidadeManual === 'kg') pManualConvertido = pManualConvertido * 1000;
    
    try {
      await fetch(`${API_BASE_URL}/api/produtos/${vincularAnuncio.id}/vincular`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composicao: composicaoKit.map(c => ({ produtoId: c.produto.id, quantidade: c.quantidade })), pesoManual: pManualConvertido }) });
      setVincularAnuncio(null); await buscarNaoVinculados(); await buscarProdutos();
    } catch {}
  };

  const produtosFiltrados = produtos.filter(p => {
    const matchTipo = tipoCatalogo === 'BASE' ? !p.mlItemId : !!p.mlItemId;
    const matchBusca = !searchProd || p.nome.toLowerCase().includes(searchProd.toLowerCase()) || p.sku.toLowerCase().includes(searchProd.toLowerCase());
    return matchTipo && matchBusca && p.plataforma !== 'ML_PENDENTE' && p.plataforma !== 'ML_IGNORADO';
  });

  const produtosBaseParaBusca = produtos.filter(p => !p.mlItemId && p.plataforma !== 'ML_PENDENTE' && (!buscaBase || p.nome.toLowerCase().includes(buscaBase.toLowerCase()))).slice(0, 5);

  const iniciarBot = () => {
    if (!userId) return;
    setIsBotRunning(true); setProgress(0); setLogs([{ msg: '🚀 Iniciando varredura...', type: 'info' }]);
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

  return (
    <div className="w-full max-w-7xl mx-auto p-4 h-full flex flex-col animate-in fade-in duration-500 relative">
      <MlConfigPanel userId={userId} onStatusChange={setMlConectado} />

      {/* Renderiza o Popover Lateral SE houver um item selecionado no olhinho */}
      <QuickViewPopover item={quickViewItem} onClose={() => setQuickViewItem(null)} onOpenFull={abrirFullModal} />

      {/* Header + Tabs */}
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 shrink-0 gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-slate-800">
            <div className="bg-[#FFE600] p-2 rounded-xl shadow-sm"><ShoppingBag className="w-5 h-5 text-slate-900" /></div>
            Gestão ML
          </h2>
          <AiInsightHeader insight={aiInsight} />
        </div>
        
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            {[['bot', 'Scanner ML'], ['pendentes', `Não Vinculados (${naoVinculados.length})`], ['produtos', 'Catálogo Local']].map(([k, l]) => (
              <button key={k} onClick={() => setActiveTab(k)}
                className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase transition-all whitespace-nowrap ${activeTab === k ? 'bg-slate-900 text-[#FFE600] shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                {l}
              </button>
            ))}
          </nav>
          <button onClick={() => setShowDicas(true)} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors shadow-sm" title="Ajuda e Dicas">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── ABA SCANNER E DIVERGÊNCIAS ── */}
      {activeTab === 'bot' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          <section className="col-span-2 bg-white border border-slate-200 rounded-3xl shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado}
                className={`w-full py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest mb-4 transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.2)] hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0'}`}>
                {isBotRunning ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Auditando ML...</span> : !mlConectado ? '🔒 Conecte o ML' : '🔍 Iniciar Varredura'}
              </button>
              <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  <span>Progresso do Motor</span><span className="text-emerald-400">{progress}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_10px_#10b981]" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>
            <div ref={terminalRef} className="flex-1 bg-slate-950 m-4 rounded-2xl p-5 font-mono text-[11px] overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {logs.map((log, i) => (
                <div key={i} className={log.type === 'warn' ? 'text-amber-400 font-bold' : log.type === 'success' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  <span className="mr-2 text-slate-600 select-none">❯</span>{log.msg}
                </div>
              ))}
            </div>
          </section>

          <section className="col-span-3 bg-white border border-slate-200 rounded-3xl shadow-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2 text-[12px] font-black uppercase text-slate-700">
                  <AlertTriangle className="text-amber-500 w-5 h-5" /> Painel de Divergências
                </div>
                <button onClick={() => { buscarDivergencias(); buscarDivStats(); }} className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-sm"><RefreshCw className="w-4 h-4 text-slate-600" /></button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['PENDENTE', 'REINCIDENTE', 'CORRIGIDO', 'IGNORADO', 'TODOS'].map(s => {
                  const cfg = STATUS_CONFIG[s] || { label: 'Todos', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' };
                  const count = s === 'TODOS' ? divStats.total : (divStats[s.toLowerCase()] || 0);
                  return (
                    <button key={s} onClick={() => setFiltroStatus(s)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all ${filtroStatus === s ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm ring-2 ring-offset-1 ring-${cfg.color.split('-')[1]}-200` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                      {cfg.label} <span className="bg-white/50 px-1.5 rounded text-[11px]">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {divergencias.length === 0 ? (
                <div className="py-20 flex flex-col items-center gap-4"><div className="p-4 bg-emerald-100 rounded-full"><CheckCircle2 className="w-10 h-10 text-emerald-600" /></div><p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em]">Zero Anomalias</p></div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500"><th className="px-5 py-3">Anúncio</th><th className="px-5 py-3">Divergência</th><th className="px-5 py-3 text-right">Ações</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {divergencias.map((div) => {
                      const cfg = STATUS_CONFIG[div.status] || STATUS_CONFIG.PENDENTE;
                      const Icon = cfg.icon;
                      return (
                        <tr key={div.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-5">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.color} flex items-center gap-1 w-fit mb-1.5 border ${cfg.border}`}><Icon className="w-3 h-3" />{cfg.label}</span>
                            <p className="font-bold text-slate-800 text-[12px] truncate max-w-[220px]">{div.titulo || div.mlItemId}</p>
                            <p className="text-slate-400 text-[10px] font-mono mt-0.5">{div.mlItemId}</p>
                          </td>
                          <td className="py-4 px-5">
                            <p className="text-slate-700 text-[11px] font-medium leading-relaxed">{div.motivo}</p>
                          </td>
                          <td className="py-4 px-5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Clique abre o Popover rápido fixo à direita */}
                              <button onClick={() => setQuickViewItem(div)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 transition-all shadow-sm"><Eye className="w-4 h-4" /></button>
                              {div.status !== 'CORRIGIDO' && <button onClick={() => acaoDiv(div.id, 'corrigido')} className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:scale-105 transition-all shadow-sm"><Check className="w-4 h-4" /></button>}
                              {div.status !== 'IGNORADO' && <button onClick={() => acaoDiv(div.id, 'ignorado')} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:scale-105 transition-all shadow-sm"><EyeOff className="w-4 h-4" /></button>}
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
        <section className="bg-white border border-slate-200 rounded-3xl shadow-lg flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-amber-50 flex justify-between items-center">
            <div>
              <h3 className="text-[14px] font-black text-amber-800 uppercase flex items-center gap-2"><Box className="w-5 h-5" /> Anúncios Desconhecidos</h3>
              <p className="text-[11px] text-amber-700/70 mt-1 font-medium">Estes itens existem na sua conta do ML mas o sistema não sabe o peso deles.</p>
            </div>
            <button onClick={buscarNaoVinculados} className="p-2 rounded-xl bg-white shadow-sm hover:bg-slate-50 border border-slate-200 text-slate-600"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {naoVinculados.length === 0 ? (
              <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[12px]">Tudo mapeado!</div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white border-b border-slate-100 shadow-sm z-10">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400"><th className="px-5 py-4">Anúncio ML</th><th className="px-5 py-4 text-right">O que fazer?</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[12px]">
                  {naoVinculados.map(prod => (
                    <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-4 flex items-center gap-4">
                        {prod.thumbnail ? <img src={prod.thumbnail} className="w-12 h-12 object-cover rounded-xl shadow-sm border border-slate-100" /> : <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center"><ImageIcon className="w-5 h-5 text-slate-300"/></div>}
                        <div>
                          <p className="font-bold text-slate-800 max-w-[450px] truncate leading-tight">{prod.nome}</p>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1.5 inline-block border border-slate-200">{prod.mlItemId}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setQuickViewItem(prod)} className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-105 transition-all shadow-sm"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => { abrirModalVincular(prod); setQuickViewItem(null); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 text-[11px] font-black uppercase shadow-md hover:-translate-y-0.5 transition-all">
                            <Link2 className="w-4 h-4" /> Vincular ao Catálogo
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ── ABA CATÁLOGO ── */}
      {activeTab === 'produtos' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          <section className="col-span-2 bg-white border border-slate-200 rounded-3xl shadow-lg flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="font-black text-xs uppercase flex items-center gap-2 text-slate-800"><Plus className="w-4 h-4 text-blue-600" /> {editandoId ? 'Editar' : 'Registro Manual'}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <form onSubmit={handleSubmitProduto} className="space-y-4 text-[11px] font-semibold text-slate-600">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="uppercase tracking-widest block mb-1.5 text-[9px] text-slate-500">SKU Interno</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} placeholder="PROD-001" className="w-full bg-white border border-slate-300 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-[12px]" /></div>
                  <div><label className="uppercase tracking-widest block mb-1.5 text-[9px] text-slate-500">Categoria</label><input value={formProd.categoria} onChange={e => setFormProd({...formProd, categoria: e.target.value})} placeholder="Ex: Motores" className="w-full bg-white border border-slate-300 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-[12px]" list="cat-list" /><datalist id="cat-list">{categorias.map(c => <option key={c} value={c} />)}</datalist></div>
                </div>
                <div><label className="uppercase tracking-widest block mb-1.5 text-[9px] text-slate-500">Nome (Para compor Kits depois)</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} placeholder="Ex: Motor DZ Nano 500w" className="w-full bg-white border border-slate-300 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-[12px]" /></div>
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1.5 mb-3"><Weight className="w-4 h-4" /> Peso Unitário Fisíco</p>
                  <div className="flex gap-3">
                    <input required type="number" step="any" min="0" value={formProd.peso} onChange={e => setFormProd({...formProd, peso: e.target.value})} placeholder="Ex: 500" className="flex-1 bg-white border border-blue-200 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-[13px] font-bold" />
                    <select value={formProd.unidadePeso} onChange={e => setFormProd({...formProd, unidadePeso: e.target.value})} className="bg-white border border-blue-200 rounded-xl px-4 text-[12px] font-black text-blue-700 outline-none cursor-pointer"><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select>
                  </div>
                </div>
                <button type="submit" disabled={loadingProd} className="w-full py-3.5 bg-slate-900 text-white font-black text-[12px] uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all shadow-md mt-2">{loadingProd ? 'Salvando...' : '📥 Salvar Ficha'}</button>
              </form>
            </div>
          </section>

          <section className="col-span-3 bg-white border border-slate-200 rounded-3xl p-5 shadow-lg overflow-hidden flex flex-col h-full">
            <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-2 mb-4">
              <button onClick={() => setTipoCatalogo('BASE')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tipoCatalogo === 'BASE' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>Produtos Físicos</button>
              <button onClick={() => setTipoCatalogo('ML')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tipoCatalogo === 'ML' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>Anúncios Vinculados</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
              <table className="w-full text-left">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400"><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Peso Fixo</th><th className="px-4 py-3 text-right">Ação</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {produtosFiltrados.length === 0 && <tr><td colSpan="3" className="py-12 text-center text-slate-400 text-[11px] font-black uppercase tracking-widest">Nenhum produto listado</td></tr>}
                  {produtosFiltrados.map(prod => (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {prod.thumbnail ? <img src={prod.thumbnail} className="w-10 h-10 rounded-lg object-cover shadow-sm" /> : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-[9px] font-black text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">{prod.sku}</span>
                              {prod.mlItemId && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1"><Check className="w-2.5 h-2.5"/> {prod.mlItemId}</span>}
                            </div>
                            <p className="text-[12px] font-bold text-slate-800 truncate max-w-[220px]">{prod.nome}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><span className="text-[11px] text-blue-700 font-black bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg shadow-sm">{prod.pesoGramas}g</span></td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setQuickViewItem(prod)} className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-105 transition-all"><Eye className="w-4 h-4" /></button>
                          {prod.mlItemId && <button onClick={() => desvincularProduto(prod.id)} className="p-2 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 hover:scale-105 transition-all" title="Desvincular (Voltar p/ Aba Não Vinculados)"><Unlink className="w-4 h-4" /></button>}
                          <button onClick={() => excluirProduto(prod.id)} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:scale-105 transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── MODAL FULL DETAILS ML (TELA GRANDE) ── */}
      {fullModalItem && (
        <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] w-full max-w-5xl overflow-hidden flex flex-col max-h-full">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white z-10 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase tracking-widest flex items-center gap-2.5"><Box className="w-5 h-5 text-blue-600"/> Integração Direta com ML</h3>
              <button onClick={() => setFullModalItem(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"><XCircle className="w-6 h-6"/></button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 lg:p-8 custom-scrollbar">
              {loadingFullData ? (
                <div className="flex flex-col items-center justify-center py-32 text-blue-500"><Loader2 className="w-10 h-10 animate-spin mb-4"/><p className="text-[12px] font-black uppercase tracking-widest text-slate-500">Extraindo dados do servidor do Mercado Livre...</p></div>
              ) : fullItemData ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* FOTOS E INFO */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="bg-white rounded-2xl p-2 border border-slate-200 flex items-center justify-center h-80 shadow-sm">
                      {fullItemData.pictures?.length > 0 ? <img src={fullItemData.pictures[0].url} className="max-h-full max-w-full object-contain rounded-xl" /> : <ImageIcon className="w-16 h-16 text-slate-200"/>}
                    </div>
                    {fullItemData.pictures?.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {fullItemData.pictures.slice(1, 5).map((pic, idx) => (
                          <img key={idx} src={pic.url} className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-colors" />
                        ))}
                      </div>
                    )}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <span className="text-[11px] font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-black border border-blue-100">{fullItemData.id}</span>
                      <h2 className="text-xl font-bold text-slate-800 mt-3 leading-snug">{fullItemData.title}</h2>
                      <p className="text-3xl font-black text-emerald-600 mt-3 flex items-baseline gap-1"><span className="text-lg">R$</span> {fullItemData.price}</p>
                      <a href={fullItemData.permalink} target="_blank" className="mt-5 flex items-center justify-center gap-2 w-full py-3.5 bg-[#FFE600] hover:bg-[#facc15] text-slate-900 rounded-xl text-[12px] font-black uppercase tracking-widest transition-colors shadow-sm">
                        <ExternalLink className="w-4 h-4"/> Ver Anúncio Original
                      </a>
                    </div>
                  </div>
                  {/* FICHA TÉCNICA E DESCRIÇÃO */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="text-[12px] font-black uppercase text-slate-400 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2"><LayoutList className="w-4 h-4"/> Características Principais</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {fullItemData.attributes?.filter(a => a.value_name).slice(0, 10).map(attr => (
                          <div key={attr.id} className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-widest mb-1">{attr.name}</span>
                            <span className="text-slate-700 font-semibold text-[13px]">{attr.value_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h4 className="text-[12px] font-black uppercase text-slate-400 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2"><FileText className="w-4 h-4"/> Descrição Cadastrada</h4>
                      <div className="text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto bg-slate-50/50 p-4 rounded-xl border border-slate-100 custom-scrollbar">
                        {fullItemData.description_text || 'O vendedor não incluiu descrição neste anúncio.'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400 text-[12px] uppercase tracking-widest font-black">Falha ao obter os dados do Mercado Livre</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VINCULAÇÃO (KIT) ── */}
      {vincularAnuncio && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-white flex justify-between items-center z-10 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><Link2 className="w-5 h-5 text-emerald-600"/> Vincular Anúncio ao Catálogo</h3>
              <button onClick={() => setVincularAnuncio(null)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full transition-colors"><XCircle className="w-6 h-6"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
              
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex gap-4 items-center">
                {vincularAnuncio.thumbnail ? <img src={vincularAnuncio.thumbnail} className="w-16 h-16 object-cover rounded-xl border border-slate-100" /> : <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center"><ImageIcon className="w-6 h-6 text-slate-300"/></div>}
                <div>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-black">{vincularAnuncio.mlItemId}</span>
                  <p className="font-bold text-slate-800 mt-1 leading-tight">{vincularAnuncio.nome}</p>
                </div>
              </div>

              <div className="mb-8">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3 block">Opção 1: O que tem dentro da caixa? (Soma de Pesos)</label>
                <div className="relative mb-3">
                  <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400"/>
                  <input value={buscaBase} onChange={e => setBuscaBase(e.target.value)} placeholder="Buscar Motor, Controle (Produto Físico Base)..." className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 shadow-sm text-[12px]" />
                </div>
                {buscaBase && (
                  <div className="mb-4 border border-slate-200 rounded-xl bg-white shadow-lg overflow-hidden">
                    {produtosBaseParaBusca.length === 0 ? <div className="p-4 text-center text-[11px] text-slate-400">Nenhum Produto Base encontrado. Cadastre no catálogo.</div> : null}
                    {produtosBaseParaBusca.map(p => (
                      <div key={p.id} className="p-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50">
                        <div><span className="text-[12px] font-bold text-slate-700">{p.nome}</span> <span className="text-[10px] text-slate-400 ml-1">({p.pesoGramas}g)</span></div>
                        <button onClick={() => { setComposicaoKit([...composicaoKit, {produto: p, quantidade: 1}]); setBuscaBase(''); }} className="text-[11px] font-black uppercase bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100">Adicionar</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {composicaoKit.map(item => (
                    <div key={item.produto.id} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <span className="text-[12px] font-bold text-slate-700 flex-1">{item.produto.nome}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">Unid: {item.produto.pesoGramas}g</span>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
                           <button onClick={() => { const q = item.quantidade - 1; if(q<=0) setComposicaoKit(composicaoKit.filter(c=>c.produto.id!==item.produto.id)); else setComposicaoKit(composicaoKit.map(c=>c.produto.id===item.produto.id?{...c,quantidade:q}:c)); }} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-500 hover:text-red-500"><Minus className="w-3 h-3"/></button>
                           <span className="w-6 text-center font-black text-[12px]">{item.quantidade}</span>
                           <button onClick={() => setComposicaoKit(composicaoKit.map(c=>c.produto.id===item.produto.id?{...c,quantidade:item.quantidade+1}:c))} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-500 hover:text-blue-500"><Plus className="w-3 h-3"/></button>
                        </div>
                        <span className="w-16 text-right text-[12px] text-emerald-600 font-black">{item.produto.pesoGramas * item.quantidade}g</span>
                      </div>
                    </div>
                  ))}
                  {composicaoKit.length > 0 && <div className="text-right p-2 text-[14px] font-black text-slate-800">Peso Total: <span className="text-emerald-600">{composicaoKit.reduce((a,c)=>a+(c.produto.pesoGramas*c.quantidade),0)}g</span></div>}
                </div>
              </div>

              {composicaoKit.length === 0 && (
                <div>
                  <div className="flex items-center gap-4 mb-4"><div className="h-px bg-slate-200 flex-1"></div><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ou</span><div className="h-px bg-slate-200 flex-1"></div></div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3 block">Opção 2: Informar Peso Fixo Único</label>
                  <div className="flex gap-3">
                    <input type="number" step="any" min="0" value={pesoManual} onChange={e => setPesoManual(e.target.value)} placeholder="Ex: 1.5" className="px-4 py-3.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 w-32 shadow-sm font-bold text-[13px]" />
                    <select value={unidadeManual} onChange={e => setUnidadeManual(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 font-black text-[12px] text-slate-600 shadow-sm outline-none cursor-pointer"><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select>
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
              <button onClick={() => setVincularAnuncio(null)} className="px-6 py-3 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
              <button onClick={salvarVinculacao} disabled={composicaoKit.length === 0 && !pesoManual} 
                className="px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-md">
                Confirmar Vinculação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DICAS (HELP) ── */}
      {showDicas && (
        <div className="fixed inset-0 z-[150] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-600 text-white">
              <h3 className="font-black uppercase tracking-widest flex items-center gap-2"><HelpCircle className="w-5 h-5"/> Entendendo o Sistema</h3>
              <button onClick={() => setShowDicas(false)} className="p-1 rounded-full text-blue-200 hover:bg-blue-500 hover:text-white transition-colors"><XCircle className="w-6 h-6"/></button>
            </div>
            <div className="p-8 space-y-6 text-[13px] text-slate-600 leading-relaxed">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <h4 className="font-black text-slate-800 text-[14px] mb-2 flex items-center gap-2"><Box className="w-4 h-4 text-amber-500"/> Aba Não Vinculados</h4>
                <p>O robô rastreia sua conta do Mercado Livre e coloca aqui todos os anúncios que o nosso sistema ainda não sabe o peso. Clique em <b>Vincular</b> para informar a regra de peso deles e permitir a auditoria.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <h4 className="font-black text-slate-800 text-[14px] mb-2 flex items-center gap-2"><Package className="w-4 h-4 text-blue-500"/> Catálogo: Produtos vs Anúncios</h4>
                <p className="mb-2"><b>Produto Físico:</b> É o item unitário da sua prateleira (ex: <i>Controle Rossi 50g</i>). Serve de base para calcular kits.</p>
                <p><b>Anúncio Vinculado:</b> É a caixa final que você envia pro cliente. Você pode dizer que este anúncio é formado por "2x Controles Rossi", e o sistema calcula o peso final sozinho.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <h4 className="font-black text-slate-800 text-[14px] mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-purple-500"/> O que são Reincidentes?</h4>
                <p>Acontece quando o robô descobre que uma divergência que você já havia resolvido no passado (marcado como Corrigido) voltou a dar problema no Mercado Livre.</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <button onClick={() => setShowDicas(false)} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-md hover:bg-blue-700">Entendi, Vamos Trabalhar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}