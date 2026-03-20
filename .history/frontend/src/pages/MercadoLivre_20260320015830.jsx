import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag,
  CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, 
  Image as ImageIcon, Link2, Square, CheckSquare, 
  ArrowLeft, ArrowRight, Minus, Eye, Sparkles, Upload
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

// ── Componente: Quick View (Olhinho) ──
function QuickViewPopover({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="absolute z-50 bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 w-72 mt-2 right-10 animate-in fade-in zoom-in duration-200">
      <div className="flex justify-between items-start mb-3">
        <h4 className="text-[11px] font-black uppercase tracking-widest text-blue-400">Detalhes do Anúncio</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><XCircle className="w-4 h-4"/></button>
      </div>
      <div className="flex gap-3 mb-3">
        {item.thumbnail ? <img src={item.thumbnail} className="w-12 h-12 rounded object-cover" /> : <div className="w-12 h-12 bg-slate-800 rounded flex items-center justify-center"><ImageIcon className="w-5 h-5 text-slate-600"/></div>}
        <div>
          <p className="text-[12px] font-bold leading-tight line-clamp-2">{item.nome || item.titulo}</p>
          <p className="text-[10px] text-slate-400 font-mono mt-1">{item.mlItemId}</p>
        </div>
      </div>
      <div className="space-y-1.5 text-[11px]">
        {item.pesoMl !== undefined && <p><span className="text-slate-400">Peso no ML:</span> {item.pesoMl}g</p>}
        {item.pesoLocal !== undefined && <p><span className="text-slate-400">Peso Base (Você):</span> {item.pesoLocal}g</p>}
        {item.pesoGramas !== undefined && <p><span className="text-slate-400">Peso Cadastrado:</span> {item.pesoGramas}g</p>}
      </div>
      {(item.link || item.mlItemId) && (
        <a href={item.link || `https://produto.mercadolivre.com.br/${item.mlItemId}`} target="_blank" rel="noopener noreferrer" 
           className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-[11px] font-black uppercase transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> Abrir no Mercado Livre
        </a>
      )}
    </div>
  );
}

// ── Componente: Insight IA Tempo Real ──
function AiInsightHeader({ insight }) {
  if (!insight) return null;
  return (
    <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 px-3 py-1.5 rounded-full shadow-sm animate-in fade-in slide-in-from-left-4">
      <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
      <span className="text-[11px] font-semibold text-slate-700" dangerouslySetInnerHTML={{ __html: insight }} />
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
  const [quickViewItem, setQuickViewItem] = useState(null);

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

  // Vinculação
  const [vincularAnuncio, setVincularAnuncio] = useState(null);
  const [composicaoKit, setComposicaoKit] = useState([]); 
  const [buscaBase, setBuscaBase] = useState('');
  const [pesoManual, setPesoManual] = useState('');
  const [unidadeManual, setUnidadeManual] = useState('g');

  // Modal Importar Planilha
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

  // ── Divergências ─────────────────────────────────────────────────────────
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
    if (!await confirm({ title: 'Excluir', message: 'Deseja excluir?', confirmLabel: 'Excluir', danger: true })) return;
    setActionLoading(p => ({ ...p, [id]: true }));
    try { await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' }); await buscarDivergencias(); await buscarDivStats(); }
    catch {} finally { setActionLoading(p => ({ ...p, [id]: false })); }
  };

  // ── Não Vinculados ────────────────────────────────────────────────────────
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

  // ── Produtos (Catálogo) ───────────────────────────────────────────────────
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

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      const rows = text.split('\n').map(r => r.split(','));
      const produtosCSV = [];
      // Ignora cabecalho
      for(let i=1; i<rows.length; i++) {
        const cols = rows[i];
        if (cols.length >= 3 && cols[0].trim() !== '') {
          produtosCSV.push({ sku: cols[0], nome: cols[1], pesoGramas: parseInt(cols[2])||0, mlItemId: cols[3]||null });
        }
      }
      try {
        await fetch(`${API_BASE_URL}/api/produtos/import-batch`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, produtos: produtosCSV }) });
        alert({ title: 'Sucesso', message: `${produtosCSV.length} produtos importados!`, type: 'success' });
        buscarProdutos(); setShowImportModal(false);
      } catch { alert({ title: 'Erro', message: 'Falha ao importar CSV.' }); }
    };
    reader.readAsText(file);
  };

  // ── Lógica de Vinculação ──
  const salvarVinculacao = async () => {
    let pManualConvertido = parseFloat(pesoManual) || 0;
    if (unidadeManual === 'kg') pManualConvertido = pManualConvertido * 1000;
    
    try {
      await fetch(`${API_BASE_URL}/api/produtos/${vincularAnuncio.id}/vincular`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composicao: composicaoKit.map(c => ({ produtoId: c.produto.id, quantidade: c.quantidade })), pesoManual: pManualConvertido }) });
      setVincularAnuncio(null); await buscarNaoVinculados(); await buscarProdutos();
    } catch {}
  };

  // Filtros de Catálogo
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

      {/* Header + Tabs + AI Insight */}
      <div className="flex justify-between items-center mb-4 shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5 text-slate-800">
            <div className="bg-[#FFE600] p-1.5 rounded-lg shadow-sm"><ShoppingBag className="w-4 h-4 text-slate-900" /></div>
            Gestão ML
          </h2>
          <AiInsightHeader insight={aiInsight} />
        </div>
        <nav className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {[['bot', 'Scanner ML'], ['pendentes', `Não Vinculados (${naoVinculados.length})`], ['produtos', 'Catálogo Local']].map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all whitespace-nowrap ${activeTab === k ? 'bg-[#FFE600] text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </nav>
      </div>

      {/* ── ABA SCANNER E DIVERGÊNCIAS ── */}
      {activeTab === 'bot' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado}
                className={`w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest mb-3 transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:scale-95'}`}>
                {isBotRunning ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando...</span> : !mlConectado ? '🔒 Conecte o ML' : '🔍 Iniciar Varredura'}
              </button>
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
                <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                  <span>Progresso</span><span className="text-blue-400">{progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>
            <div ref={terminalRef} className="flex-1 bg-slate-950 m-3 rounded-xl p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
              {logs.map((log, i) => (
                <div key={i} className={log.type === 'warn' ? 'text-amber-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'}>
                  <span className="mr-2 text-slate-600">›</span>{log.msg}
                </div>
              ))}
            </div>
          </section>

          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-600">
                  <AlertTriangle className="text-amber-500 w-4 h-4" /> Divergências
                </div>
                <button onClick={() => { buscarDivergencias(); buscarDivStats(); }} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100"><RefreshCw className="w-3.5 h-3.5 text-slate-500" /></button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {['PENDENTE', 'REINCIDENTE', 'CORRIGIDO', 'IGNORADO', 'TODOS'].map(s => {
                  const cfg = STATUS_CONFIG[s] || { label: 'Todos', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
                  const count = s === 'TODOS' ? divStats.total : (divStats[s.toLowerCase()] || 0);
                  return (
                    <button key={s} onClick={() => setFiltroStatus(s)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${filtroStatus === s ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                      {cfg.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto relative">
              {divergencias.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-3"><CheckCircle2 className="w-8 h-8 text-emerald-500" /><p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Limpo</p></div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-3 py-2.5">Anúncio</th>
                      <th className="px-3 py-2.5">Divergência</th>
                      <th className="px-3 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[11px]">
                    {divergencias.map((div) => {
                      const cfg = STATUS_CONFIG[div.status] || STATUS_CONFIG.PENDENTE;
                      const Icon = cfg.icon;
                      return (
                        <tr key={div.id} className="hover:bg-slate-50/80 transition-colors group relative">
                          <td className="py-3 px-3">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} flex items-center gap-1 w-fit mb-1`}><Icon className="w-2.5 h-2.5" />{cfg.label}</span>
                            <p className="font-bold text-blue-600 text-[11px] truncate max-w-[180px]">{div.titulo || div.mlItemId}</p>
                            <p className="text-slate-400 text-[9px] font-mono">{div.mlItemId}</p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="text-slate-700 text-[10px] italic leading-relaxed">{div.motivo}</p>
                            {div.pesoMl !== undefined && div.pesoLocal !== undefined && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">ML: {div.pesoMl}g</span>
                                <span className="text-slate-300 text-[8px]">vs</span>
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">Local: {div.pesoLocal}g</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Botão de Olhinho */}
                              <div className="relative" onMouseEnter={() => setQuickViewItem(div)} onMouseLeave={() => setQuickViewItem(null)}>
                                <button className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye className="w-3.5 h-3.5" /></button>
                                {quickViewItem?.id === div.id && <QuickViewPopover item={div} onClose={() => setQuickViewItem(null)} />}
                              </div>
                              {div.status !== 'CORRIGIDO' && <button onClick={() => acaoDiv(div.id, 'corrigido')} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check className="w-3.5 h-3.5" /></button>}
                              <button onClick={() => excluirDivergencia(div.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>
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
        <section className="bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-amber-50/30 flex justify-between items-center">
            <div>
              <h3 className="text-[12px] font-black text-amber-700 uppercase flex items-center gap-2"><Box className="w-4 h-4" /> Anúncios Desconhecidos no ML</h3>
            </div>
            <button onClick={buscarNaoVinculados} className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {naoVinculados.length === 0 ? (
              <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-[10px]">Tudo mapeado</div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white border-b border-slate-100">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-4 py-3">Produto ML</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {naoVinculados.map(prod => (
                    <tr key={prod.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 flex items-center gap-3">
                        {prod.thumbnail ? <img src={prod.thumbnail} className="w-10 h-10 object-cover rounded-lg" /> : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                        <div>
                          <p className="text-[11px] font-bold text-slate-700 max-w-[400px] truncate">{prod.nome}</p>
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 rounded mt-1 inline-block">{prod.mlItemId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="relative" onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}>
                            <button className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye className="w-3.5 h-3.5" /></button>
                            {quickViewItem?.id === prod.id && <QuickViewPopover item={prod} onClose={() => setQuickViewItem(null)} />}
                          </div>
                          <button onClick={() => { abrirModalVincular(prod); setQuickViewItem(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-black uppercase shadow-sm">
                            <Link2 className="w-3.5 h-3.5" /> Vincular Composição
                          </button>
                          <button onClick={() => acaoNaoVinculadoBasica(prod.id, 'ignorado')} className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100"><EyeOff className="w-4 h-4" /></button>
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
          <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between">
              <h2 className="font-black text-xs uppercase flex items-center gap-2 text-blue-600"><Plus className="w-4 h-4" /> {editandoId ? 'Editar' : 'Cadastrar Manual'}</h2>
              <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded uppercase hover:bg-emerald-200"><Upload className="w-3 h-3"/> Excel / CSV</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <form onSubmit={handleSubmitProduto} className="space-y-3.5 text-[11px] font-semibold text-slate-600">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="uppercase tracking-wider block mb-1 text-[10px]">SKU Interno</label><input required value={formProd.sku} onChange={e => setFormProd({...formProd, sku: e.target.value})} placeholder="PROD-001" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" /></div>
                  <div><label className="uppercase tracking-wider block mb-1 text-[10px]">ID ML (Se já for anúncio)</label><input value={formProd.mlItemId} onChange={e => setFormProd({...formProd, mlItemId: e.target.value})} placeholder="MLB123..." className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" /></div>
                </div>
                <div><label className="uppercase tracking-wider block mb-1 text-[10px]">Nome do Produto (Para Base ou ML)</label><input required value={formProd.nome} onChange={e => setFormProd({...formProd, nome: e.target.value})} placeholder="Nome..." className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" /></div>
                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
                  <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1 mb-2"><Weight className="w-3.5 h-3.5" /> Peso Unitário</p>
                  <div className="flex gap-2">
                    <input required type="number" step="any" min="0" value={formProd.peso} onChange={e => setFormProd({...formProd, peso: e.target.value})} placeholder="Ex: 500" className="flex-1 bg-white border border-blue-200 rounded-lg p-2.5 outline-none focus:border-blue-500 text-[11px]" />
                    <select value={formProd.unidadePeso} onChange={e => setFormProd({...formProd, unidadePeso: e.target.value})} className="bg-white border border-blue-200 rounded-lg px-2 text-[11px] font-bold text-blue-700 outline-none">
                      <option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={loadingProd} className="w-full py-3 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-lg hover:bg-black transition-all shadow-md">{loadingProd ? 'Salvando...' : '📥 Salvar'}</button>
              </form>
            </div>
          </section>

          <section className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex gap-2">
              <button onClick={() => setTipoCatalogo('BASE')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${tipoCatalogo === 'BASE' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Produtos Base Físicos</button>
              <button onClick={() => setTipoCatalogo('ML')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${tipoCatalogo === 'ML' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Anúncios Vinculados</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-3 py-2">Produto</th><th className="px-3 py-2">Peso Info</th><th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {produtosFiltrados.map(prod => (
                    <tr key={prod.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {prod.thumbnail && <img src={prod.thumbnail} className="w-8 h-8 rounded object-cover" />}
                          <div>
                            <span className="text-[8px] bg-slate-200 text-slate-600 px-1 rounded mr-1 font-mono">{prod.sku}</span>
                            {prod.mlItemId && <span className="text-[8px] text-blue-600 bg-blue-100 px-1 rounded font-mono">{prod.mlItemId}</span>}
                            <p className="text-[11px] font-bold text-slate-700 truncate max-w-[200px] mt-0.5">{prod.nome}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><span className="text-[10px] text-emerald-700 font-black bg-emerald-50 px-2 py-0.5 rounded">{prod.pesoGramas}g</span></td>
                      <td className="px-3 py-2.5 text-right flex justify-end gap-1">
                        <div className="relative" onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}>
                          <button className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye className="w-3.5 h-3.5" /></button>
                          {quickViewItem?.id === prod.id && <QuickViewPopover item={prod} onClose={() => setQuickViewItem(null)} />}
                        </div>
                        <button onClick={() => excluirProduto(prod.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── MODAL VINCULAÇÃO ── */}
      {vincularAnuncio && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><Package className="w-4 h-4 text-blue-600"/> Composição do Anúncio</h3>
              <button onClick={() => setVincularAnuncio(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="mb-5">
                <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Adicionar Produtos Base</label>
                <input value={buscaBase} onChange={e => setBuscaBase(e.target.value)} placeholder="Buscar Motor, Controle..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-[12px]" />
                {buscaBase && (
                  <div className="mt-2 border border-slate-100 rounded-xl bg-white shadow-sm">
                    {produtosBaseParaBusca.map(p => (
                      <div key={p.id} className="p-2 border-b flex justify-between items-center"><span className="text-[11px] font-bold">{p.nome} ({p.pesoGramas}g)</span><button onClick={() => { setComposicaoKit([...composicaoKit, {produto: p, quantidade: 1}]); setBuscaBase(''); }} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded">Add</button></div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {composicaoKit.map(item => (
                  <div key={item.produto.id} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[11px] font-bold">{item.produto.nome}</span>
                    <span className="text-[11px] text-blue-600 font-bold">{item.produto.pesoGramas * item.quantidade}g</span>
                  </div>
                ))}
              </div>
              {composicaoKit.length === 0 && (
                <div className="mt-4">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Ou Peso Manual do Anúncio Inteiro</label>
                  <div className="flex gap-2">
                    <input type="number" value={pesoManual} onChange={e => setPesoManual(e.target.value)} placeholder="Ex: 1.5" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none w-32" />
                    <select value={unidadeManual} onChange={e => setUnidadeManual(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2"><option value="g">Gramas (g)</option><option value="kg">Quilos (kg)</option></select>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button onClick={salvarVinculacao} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase">Confirmar Vinculação</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL IMPORTAR PLANILHA ── */}
      {showImportModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase flex items-center gap-2"><Upload className="w-4 h-4 text-emerald-600"/> Importar CSV</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[11px] text-slate-600">Para importar em massa, crie uma planilha no Excel, preencha as colunas abaixo exatamente nesta ordem e salve como <b>CSV (Separado por vírgulas)</b>.</p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-[10px] text-slate-500 overflow-x-auto whitespace-nowrap">
                SKU,Nome do Produto,Peso em Gramas,ID MercadoLivre (Opcional)<br/>
                MOT-001,Motor DZ Nano Turbo,5000,<br/>
                CTL-001,Controle Remoto Rossi,50,<br/>
                KIT-001,Kit Motor DZ Nano + 2 Controles,5100,MLB123456789
              </div>
              <label className="flex items-center justify-center w-full p-6 border-2 border-dashed border-emerald-200 rounded-xl bg-emerald-50 text-emerald-700 cursor-pointer hover:bg-emerald-100 transition-colors">
                <div className="text-center">
                  <Upload className="w-6 h-6 mx-auto mb-2 opacity-70" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Selecionar arquivo .CSV</span>
                </div>
                <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}