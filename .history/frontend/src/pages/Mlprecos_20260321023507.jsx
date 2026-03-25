import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, RefreshCw, DollarSign, ExternalLink, Check, X,
  Loader2, AlertTriangle, CheckCircle2, Image as ImageIcon, Edit3,
  Save, XCircle, Square, CheckSquare, Zap, Info, Download,
  TrendingUp, TrendingDown, Wifi, WifiOff, Maximize2, Minimize2,
  History, Package, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────
function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

function ModalOverlay({ onClose, children, side = 'center' }) {
  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:999999, background:'rgba(15,23,42,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems: side==='right'?'stretch':'center', justifyContent: side==='right'?'flex-end':'center', padding: side==='center'?'16px':0 }}>
        <div onClick={e => e.stopPropagation()} style={{ display:'flex', height: side==='right'?'100%':'auto' }}>{children}</div>
      </div>
    </Portal>
  );
}

function VariacaoChip({ anterior, novo }) {
  if (!anterior || !novo || anterior === novo) return null;
  const diff = ((novo - anterior) / anterior) * 100;
  const up   = novo > anterior;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{diff.toFixed(1)}%
    </span>
  );
}

function StatusBadge({ status }) {
  const map = { active:'text-emerald-700 bg-emerald-50 border-emerald-200', paused:'text-amber-700 bg-amber-50 border-amber-200', closed:'text-slate-500 bg-slate-50 border-slate-200' };
  const lbl = { active:'Ativo', paused:'Pausado', closed:'Encerrado' };
  return <span className={`text-[9px] font-black border px-2 py-0.5 rounded-full uppercase tracking-wide ${map[status]||'text-slate-400 bg-slate-50 border-slate-200'}`}>{lbl[status]||status}</span>;
}

function downloadCsv(anuncios) {
  const header = 'ID,Título,Categoria,Status,Preço,Estoque\n';
  const rows = anuncios.map(a => `"${a.id}","${(a.title||'').replace(/"/g,'""')}","${a.category_name||a.category_id||''}","${a.status}","${a.price}","${a.available_quantity}"`).join('\n');
  const blob = new Blob([header+rows], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a'); el.href=url; el.download=`precos_ml_${new Date().toISOString().slice(0,10)}.csv`; el.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function Mlprecos() {
  const { userId }   = useOutletContext() || {};
  const navigate     = useNavigate();
  const { confirm, alert } = useModal();

  const [mlConectado, setMlConectado]     = useState(false);
  const [mlNick, setMlNick]               = useState('');
  const [anuncios, setAnuncios]           = useState([]);
  const [loading, setLoading]             = useState(false);
  const [busca, setBusca]                 = useState('');
  const [filtroStatus, setFiltroStatus]   = useState('active');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [categorias, setCategorias]       = useState([]);

  // ── Terminal — mesmo padrão do Scanner ──────────────────────────────────────
  const [logs, setLogs] = useState([{ msg: `[${new Date().toLocaleTimeString('pt-BR')}] Módulo de Precificação ML carregado. Aguardando comandos.`, type: 'info' }]);
  const [isBotRunning, setIsBotRunning]     = useState(false);
  const [progress, setProgress]             = useState(0);
  const [currentStep, setCurrentStep]       = useState('');
  const [scannerFullscreen, setScannerFullscreen] = useState(false);
  const terminalRef = useRef(null);
  useEffect(() => {
    if (terminalRef.current) setTimeout(() => { terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, 50);
  }, [logs]);

  const addLog = useCallback((msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    setLogs(l => [...l, { msg: `[${time}] ${msg}`, type }]);
  }, []);

  // ── Tabela ──────────────────────────────────────────────────────────────────
  const [tabelaFullscreen, setTabelaFullscreen] = useState(false);
  const [editandoId, setEditandoId]   = useState(null);
  const [novoPreco, setNovoPreco]     = useState('');
  const [novaQtd, setNovaQtd]         = useState('');
  const [salvando, setSalvando]       = useState(false);
  const [resultados, setResultados]   = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showLote, setShowLote]       = useState(false);
  const [tipoAjuste, setTipoAjuste]   = useState('fixo');
  const [valorLote, setValorLote]     = useState('');
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [logLote, setLogLote]         = useState([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historicoItem, setHistoricoItem] = useState(null);
  const [historicoData, setHistoricoData] = useState([]);
  const inputPrecoRef = useRef(null);

  useEffect(() => { if (userId) verificarML(); }, [userId]);
  useEffect(() => { if (editandoId && inputPrecoRef.current) inputPrecoRef.current.focus(); }, [editandoId]);

  const verificarML = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`);
      const data = await res.json();
      setMlConectado(data.connected && !data.expired);
      setMlNick(data.nickname || '');
    } catch {}
  };

  // ── Buscar anúncios com logs estilo Scanner ──────────────────────────────────
  const buscarAnuncios = async () => {
    setLoading(true);
    setIsBotRunning(true);
    setProgress(0);
    setCurrentStep('Fase 1/3 — Autenticação');
    setAnuncios([]);
    setSelectedIds(new Set());

    addLog('🔐 Iniciando protocolo de autenticação segura com os servidores do ML...', 'info');
    await new Promise(r => setTimeout(r, 600));
    addLog('🔗 Estabelecendo conexão com api.mercadolibre.com:443...', 'info');
    await new Promise(r => setTimeout(r, 500));
    setProgress(10);

    setCurrentStep('Fase 2/3 — Buscando anúncios');
    addLog(`📡 Conectando ao índice de anúncios — status: ${filtroStatus}${filtroCategoria ? `, categoria: ${filtroCategoria}` : ''}...`, 'info');
    setProgress(20);

    try {
      const params = new URLSearchParams({ userId, status: filtroStatus });
      if (filtroCategoria) params.set('category', filtroCategoria);
      const res  = await fetch(`${API_BASE_URL}/api/ml/precos/anuncios?${params}`);
      const data = await res.json();

      setProgress(60);

      if (!res.ok || data.error) {
        addLog(`❌ Erro: ${data.error || 'Falha na API'}`, 'warn');
        alert({ title: 'Erro ao buscar', message: data.error || 'Falha na API.' });
        setIsBotRunning(false); setLoading(false); setProgress(0);
        return;
      }

      setCurrentStep('Fase 3/3 — Compilando dados');
      addLog(`📊 Mapeamento concluído: ${data.total} anúncio(s) encontrado(s)!`, 'success');
      setProgress(80);
      await new Promise(r => setTimeout(r, 400));

      if (data.anuncios?.length > 0) {
        const precos = data.anuncios.map(a => a.price);
        addLog(`💰 Preço mín: R$ ${Math.min(...precos).toFixed(2)} | máx: R$ ${Math.max(...precos).toFixed(2)}`, 'info');
        addLog(`📦 Estoque total: ${data.anuncios.reduce((s, a) => s + (a.available_quantity || 0), 0)} unidades`, 'info');
        const cats = [...new Set(data.anuncios.map(a => a.category_name || a.category_id).filter(Boolean))].sort();
        setCategorias(cats);
      }

      setProgress(100);
      addLog('══════════════════════════════════════════════', 'success');
      addLog('🎯  Busca 100% concluída com sucesso!', 'success');
      setAnuncios(data.anuncios || []);
    } catch (err) {
      addLog(`❌ Falha de conexão: ${err.message}`, 'warn');
      alert({ title: 'Erro', message: 'Falha na conexão com o servidor.' });
    } finally {
      setLoading(false);
      setIsBotRunning(false);
      setCurrentStep('');
    }
  };

  const abrirEdicao = (item) => {
    setEditandoId(item.id); setNovoPreco(String(item.price)); setNovaQtd(String(item.available_quantity ?? 1));
    setResultados(r => { const n = {...r}; delete n[item.id]; return n; });
  };
  const cancelarEdicao = () => { setEditandoId(null); setNovoPreco(''); setNovaQtd(''); };

  const salvarPreco = async (item) => {
    const preco = parseFloat(novoPreco);
    const qtd   = parseInt(novaQtd) || item.available_quantity || 1;
    if (!preco || preco <= 0) { alert({ title:'Valor inválido', message:'Preço maior que zero.' }); return; }
    setSalvando(true);
    addLog(`💱 Atualizando ${item.id}: R$ ${item.price.toFixed(2)} → R$ ${preco.toFixed(2)}`, 'info');
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, mlItemId:item.id, price:preco, available_quantity:qtd }) });
      const data = await res.json();
      if (res.ok && !data.error) {
        setResultados(r => ({...r, [item.id]:'ok'}));
        setAnuncios(prev => prev.map(a => a.id===item.id ? {...a, price:preco, available_quantity:qtd, precoAnterior:a.price} : a));
        addLog(`✅ ${item.id} atualizado com sucesso`, 'success');
        cancelarEdicao();
      } else {
        setResultados(r => ({...r, [item.id]:'erro'}));
        addLog(`✗ Erro em ${item.id}: ${data.message}`, 'warn');
        alert({ title:'Erro ao atualizar', message:data.message||'Falha na API do ML.' });
      }
    } catch (err) {
      setResultados(r => ({...r, [item.id]:'erro'}));
      addLog(`✗ Falha: ${err.message}`, 'warn');
    } finally { setSalvando(false); }
  };

  const abrirHistorico = async (item) => {
    setHistoricoItem(item); setHistoricoData([]); setShowHistorico(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/precos/historico/${item.id}?userId=${userId}`);
      setHistoricoData(await res.json() || []);
    } catch { setHistoricoData([]); }
  };

  const abrirLote = () => { setValorLote(''); setTipoAjuste('fixo'); setLogLote([]); setShowLote(true); };

  const salvarLote = async () => {
    const valor = parseFloat(valorLote);
    if (!valor || (tipoAjuste==='fixo' && valor<=0)) { alert({ title:'Valor inválido', message:'Informe um valor válido.' }); return; }
    const ok = await confirm({ title:`Atualizar ${selectedIds.size} anúncio(s)`, message: tipoAjuste==='fixo' ? `Definir R$ ${valor.toFixed(2)}?` : `Aplicar ${valor>0?'+':''}${valor}%?`, confirmLabel:'Confirmar' });
    if (!ok) return;
    setSalvandoLote(true); setLogLote([]);
    addLog(`🚀 Iniciando atualização em lote de ${selectedIds.size} anúncios...`, 'info');
    const itens = anuncios.filter(a => selectedIds.has(a.id));
    for (const item of itens) {
      const novoP = tipoAjuste==='fixo' ? valor : parseFloat((item.price*(1+valor/100)).toFixed(2));
      const qtd   = item.available_quantity || 1;
      try {
        const res  = await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, mlItemId:item.id, price:novoP, available_quantity:qtd }) });
        const data = await res.json();
        if (res.ok && !data.error) {
          setLogLote(l => [...l, { id:item.id, titulo:item.title, status:'ok', de:item.price, para:novoP }]);
          setAnuncios(prev => prev.map(a => a.id===item.id ? {...a, price:novoP, precoAnterior:a.price} : a));
          addLog(`✅ ${item.id}: R$${item.price.toFixed(2)} → R$${novoP.toFixed(2)}`, 'success');
        } else {
          setLogLote(l => [...l, { id:item.id, titulo:item.title, status:'erro', msg:data.message }]);
          addLog(`✗ ${item.id}: ${data.message}`, 'warn');
        }
      } catch (err) {
        setLogLote(l => [...l, { id:item.id, titulo:item.title, status:'erro', msg:'Falha' }]);
        addLog(`✗ ${item.id}: falha de conexão`, 'warn');
      }
      await new Promise(r => setTimeout(r, 350));
    }
    addLog('══════════════════════════════════════════════', 'success');
    addLog('🎯 Lote concluído!', 'success');
    setSalvandoLote(false); setSelectedIds(new Set());
  };

  const anunciosFiltrados = anuncios.filter(a => {
    const matchBusca = !busca || a.title.toLowerCase().includes(busca.toLowerCase()) || a.id.toLowerCase().includes(busca.toLowerCase()) || (a.sku||'').toLowerCase().includes(busca.toLowerCase());
    const matchCat   = !filtroCategoria || (a.category_name||a.category_id)===filtroCategoria;
    return matchBusca && matchCat;
  });

  const toggleSelect = (id) => setSelectedIds(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll    = () => { if (selectedIds.size===anunciosFiltrados.length) setSelectedIds(new Set()); else setSelectedIds(new Set(anunciosFiltrados.map(a=>a.id))); };

  const precoMedio    = anuncios.length>0 ? (anuncios.reduce((s,a)=>s+a.price,0)/anuncios.length).toFixed(2) : null;
  const estoqueTotal  = anuncios.reduce((s,a)=>s+(a.available_quantity||0),0);
  const atualizadosOk = Object.values(resultados).filter(v=>v==='ok').length;
  const errosCount    = Object.values(resultados).filter(v=>v==='erro').length;

  const statsItems = [
    { label:'Anúncios',    value:anuncios.length||'—',   sub:`${anunciosFiltrados.length} visíveis`, color:'text-blue-600',    dot:'bg-blue-400' },
    { label:'Preço Médio', value:precoMedio?`R$${precoMedio}`:'—', sub:'média geral',     color:'text-emerald-600', dot:'bg-emerald-400' },
    { label:'Estoque',     value:estoqueTotal>0?estoqueTotal:'—', sub:'total unidades',   color:'text-slate-700',   dot:'bg-slate-400' },
    { label:'Selecionados',value:selectedIds.size||'—',  sub:'para lote',          color:'text-amber-600',   dot:'bg-amber-400' },
    ...(atualizadosOk>0?[{ label:'Atualizados', value:atualizadosOk, sub:'esta sessão', color:'text-emerald-600', dot:'bg-emerald-400' }]:[]),
    ...(errosCount>0   ?[{ label:'Erros',        value:errosCount,    sub:'falha API',   color:'text-red-500',     dot:'bg-red-400' }]:[]),
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col gap-2 animate-in fade-in duration-300" style={{ minHeight:'100vh' }}>

      {/* HEADER */}
      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/ml')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-800">💰 Precificação ML</h2>
            <p className={`text-xs flex items-center gap-1 ${mlConectado?'text-emerald-600':'text-slate-400'}`}>
              {mlConectado ? <><Wifi className="w-3 h-3"/>{mlNick}</> : <><WifiOff className="w-3 h-3"/>Não conectado</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {selectedIds.size>0 && (
            <button onClick={abrirLote} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700">
              <Zap className="w-3.5 h-3.5"/>Lote ({selectedIds.size})
            </button>
          )}
          {anuncios.length>0 && (
            <button onClick={()=>downloadCsv(anuncios)} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-100">
              <Download className="w-3.5 h-3.5"/>CSV
            </button>
          )}
        </div>
      </div>

      {/* STATS BAR */}
      <div className="flex items-center gap-0 bg-white border border-slate-200 rounded-xl shrink-0 overflow-hidden">
        {statsItems.map((m,i) => (
          <div key={i} className={`flex items-center gap-2.5 px-4 py-2 flex-1 ${i<statsItems.length-1?'border-r border-slate-100':''}`}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`}/>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className={`text-sm font-black ${m.color} leading-none`}>{m.value}</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">{m.label}</span>
            </div>
            <span className="text-[9px] text-slate-300 ml-auto shrink-0">{m.sub}</span>
          </div>
        ))}
      </div>

      {/* AVISO API */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2 shrink-0">
        <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"/>
        <p className="text-xs text-amber-700">
          <strong>API ML:</strong> atualização exige <code className="bg-amber-100 px-1 rounded">price</code> + <code className="bg-amber-100 px-1 rounded">available_quantity</code> juntos (obrigatório desde 18/03/2026).
        </p>
      </div>

      {/* GRID SCANNER + TABELA — mesmo layout do MercadoLivre.jsx */}
      <div className={`grid gap-3 ${scannerFullscreen || tabelaFullscreen ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-5'}`}>

        {/* ── PAINEL SCANNER (terminal) ── */}
        {!tabelaFullscreen && (
          <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden ${scannerFullscreen ? 'xl:col-span-5' : 'xl:col-span-2'}`} style={{ minHeight:'520px' }}>

            {/* Botão buscar */}
            <div className="p-3 border-b border-slate-100 space-y-2 shrink-0">
              <button
                onClick={buscarAnuncios}
                disabled={isBotRunning || !mlConectado}
                className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                {isBotRunning
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/>Buscando...</span>
                  : !mlConectado ? '🔒 Conecte o ML no Dashboard'
                  : '🔍 Buscar Anúncios'}
              </button>

              {/* Filtros inline */}
              <div className="flex gap-1.5 flex-wrap">
                <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                  {[['active','Ativos'],['paused','Pausados'],['closed','Encerrados']].map(([v,l]) => (
                    <button key={v} onClick={() => setFiltroStatus(v)}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all ${filtroStatus===v?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {categorias.length>0 && (
                  <select value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[9px] outline-none text-slate-600 font-semibold">
                    <option value="">Todas categorias</option>
                    {categorias.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>

              {/* Barra de progresso — igual ao Scanner */}
              <div className="bg-slate-900 rounded-lg p-2.5">
                <div className="flex justify-between items-center text-[9px] font-black uppercase mb-1.5">
                  <span className="text-slate-400 flex items-center gap-1">
                    {isBotRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-0.5"/>}
                    {currentStep || 'Aguardando'}
                    {mlConectado ? <Wifi className="w-2.5 h-2.5 text-emerald-400 ml-1"/> : <WifiOff className="w-2.5 h-2.5 text-red-400 ml-1"/>}
                  </span>
                  <span className="text-emerald-400 font-black">{progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width:`${progress}%`, background: progress<30?'#3b82f6':progress<60?'#f59e0b':progress<90?'#8b5cf6':'#10b981' }}/>
                </div>
              </div>
            </div>

            {/* Terminal — idêntico ao do Scanner */}
            <div ref={terminalRef}
              className="flex-1 bg-slate-950 m-2 rounded-xl p-2.5 overflow-y-auto flex flex-col gap-0.5"
              style={{ fontFamily:'monospace', minHeight:'300px' }}>
              {logs.map((log, i) => (
                <div key={i} className={`text-[10px] leading-relaxed ${log.type==='warn'?'text-amber-400':log.type==='success'?'text-emerald-400':'text-slate-300'}`}>
                  <span className="text-slate-600 mr-1 select-none">❯</span>{log.msg}
                </div>
              ))}
              {isBotRunning && (
                <div className="flex items-center gap-1.5 text-[10px] text-blue-400 mt-1">
                  <Loader2 className="w-3 h-3 animate-spin"/><span className="animate-pulse">processando...</span>
                </div>
              )}
            </div>

            {/* Botão fullscreen terminal */}
            <div className="px-2 pb-2 shrink-0">
              <button onClick={() => setScannerFullscreen(v => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-black uppercase transition-all">
                {scannerFullscreen ? <><Minimize2 className="w-3.5 h-3.5"/>Reduzir</> : <><Maximize2 className="w-3.5 h-3.5"/>Tela Cheia</>}
              </button>
            </div>
          </section>
        )}

        {/* ── TABELA DE ANÚNCIOS ── */}
        {!scannerFullscreen && (
          <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden ${tabelaFullscreen?'xl:col-span-5':'xl:col-span-3'}`} style={{ minHeight:'520px' }}>

            {/* toolbar */}
            <div className="px-4 py-2.5 border-b border-slate-100 shrink-0 flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-36">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Título, ID, SKU..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400"/>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{anunciosFiltrados.length} anúncio{anunciosFiltrados.length!==1?'s':''}</span>
              {selectedIds.size>0 && (
                <div className="flex items-center gap-0.5 bg-blue-50 px-1.5 py-0.5 rounded-lg border border-blue-200">
                  <span className="text-xs font-black text-blue-700 mr-1">{selectedIds.size}</span>
                  <button onClick={abrirLote} className="p-0.5 text-blue-600 hover:bg-white rounded" title="Lote"><Zap className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>setSelectedIds(new Set())} className="p-0.5 text-slate-500 hover:bg-white rounded"><X className="w-3.5 h-3.5"/></button>
                </div>
              )}
              <button onClick={()=>setTabelaFullscreen(v=>!v)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500">
                {tabelaFullscreen?<Minimize2 className="w-3.5 h-3.5"/>:<Maximize2 className="w-3.5 h-3.5"/>}
              </button>
            </div>

            {/* conteúdo */}
            <div className="overflow-y-auto" style={{ maxHeight: tabelaFullscreen?'calc(100vh - 160px)':'600px' }}>
              {!mlConectado ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <WifiOff className="w-8 h-8 text-slate-300"/>
                  <p className="text-sm font-black text-slate-400 uppercase">ML não conectado</p>
                  <button onClick={()=>navigate('/ml')} className="px-4 py-2 rounded-lg text-xs font-black uppercase text-white bg-slate-900 hover:bg-blue-600">Ir para o Dashboard ML</button>
                </div>
              ) : anuncios.length===0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <DollarSign className="w-10 h-10 text-slate-200"/>
                  <p className="text-sm font-black text-slate-400 uppercase">Clique em "Buscar Anúncios" para carregar</p>
                  <button onClick={buscarAnuncios} className="px-4 py-2 rounded-lg text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700">Buscar Anúncios</button>
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-400"/>
                  <p className="text-sm text-slate-400">Carregando anúncios do ML...</p>
                </div>
              ) : anunciosFiltrados.length===0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <p className="text-sm text-slate-400">Nenhum resultado para "{busca}"</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                    <tr className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2.5 w-8">
                        <button onClick={toggleAll} className="text-slate-400 hover:text-blue-600">
                          {selectedIds.size===anunciosFiltrados.length && anunciosFiltrados.length>0
                            ? <CheckSquare className="w-3.5 h-3.5 text-blue-600"/>
                            : <Square className="w-3.5 h-3.5"/>}
                        </button>
                      </th>
                      <th className="px-3 py-2.5">Anúncio</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-center w-24">Estoque</th>
                      <th className="px-3 py-2.5 text-center w-40">Preço</th>
                      <th className="px-3 py-2.5 text-right w-36">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {anunciosFiltrados.map(item => {
                      const editando  = editandoId===item.id;
                      const resStatus = resultados[item.id];
                      const sel       = selectedIds.has(item.id);
                      return (
                        <tr key={item.id} className={`transition-colors group ${sel?'bg-blue-50/40':''} ${editando?'bg-blue-50/30 ring-1 ring-inset ring-blue-200':'hover:bg-slate-50/70'}`}>
                          <td className="px-3 py-2.5">
                            <button onClick={()=>toggleSelect(item.id)} className="text-slate-400 hover:text-blue-600">
                              {sel?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5"/>}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {item.thumbnail
                                ? <img src={item.thumbnail} alt="" className="w-9 h-9 object-cover rounded-lg border border-slate-100 flex-shrink-0"/>
                                : <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-3.5 h-3.5 text-slate-300"/></div>}
                              <div>
                                <p className="text-xs font-semibold text-slate-800 max-w-[180px] truncate">{item.title}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <a href={`https://produto.mercadolivre.com.br/MLB-${item.id.replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer"
                                    className="text-[9px] font-mono text-blue-500 hover:underline flex items-center gap-0.5">
                                    {item.id}<ExternalLink className="w-2.5 h-2.5"/>
                                  </a>
                                  {item.sku && <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1 py-0.5 rounded">{item.sku}</span>}
                                </div>
                                <p className="text-[8px] text-slate-400 truncate max-w-[180px]">{item.category_name||item.category_id||''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center"><StatusBadge status={item.status}/></td>
                          <td className="px-3 py-2.5 text-center">
                            {editando
                              ? <input type="number" min="0" value={novaQtd} onChange={e=>setNovaQtd(e.target.value)}
                                  className="w-16 text-center border border-blue-300 rounded-lg py-1.5 text-sm font-semibold outline-none bg-white"/>
                              : <span className="text-sm font-semibold text-slate-600">{item.available_quantity??'—'}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {editando ? (
                              <div className="flex items-center gap-1 justify-center">
                                <span className="text-sm text-slate-400">R$</span>
                                <input ref={inputPrecoRef} type="number" step="0.01" min="0.01" value={novoPreco}
                                  onChange={e=>setNovoPreco(e.target.value)}
                                  onKeyDown={e=>{ if(e.key==='Enter') salvarPreco(item); if(e.key==='Escape') cancelarEdicao(); }}
                                  className="w-20 text-center border border-blue-300 rounded-lg py-1.5 text-sm font-bold outline-none focus:border-blue-500 bg-white"/>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-base font-black text-slate-800">R$ {typeof item.price==='number'?item.price.toFixed(2):item.price}</span>
                                {item.precoAnterior && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-400 line-through">R$ {item.precoAnterior.toFixed(2)}</span>
                                    <VariacaoChip anterior={item.precoAnterior} novo={item.price}/>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {editando ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={()=>salvarPreco(item)} disabled={salvando}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-black uppercase hover:bg-emerald-600 disabled:opacity-50">
                                  {salvando?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Save className="w-3.5 h-3.5"/>}Salvar
                                </button>
                                <button onClick={cancelarEdicao} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><X className="w-3.5 h-3.5"/></button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                {resStatus==='ok'   && <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5"/>Salvo</span>}
                                {resStatus==='erro' && <span className="flex items-center gap-1 text-[10px] font-black text-red-500"><AlertTriangle className="w-3.5 h-3.5"/>Erro</span>}
                                <button onClick={()=>abrirHistorico(item)} title="Histórico de preços"
                                  className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <History className="w-3.5 h-3.5"/>
                                </button>
                                <button onClick={()=>abrirEdicao(item)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 text-xs font-black uppercase transition-colors opacity-0 group-hover:opacity-100">
                                  <Edit3 className="w-3.5 h-3.5"/>Editar
                                </button>
                              </div>
                            )}
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
      </div>

      {/* ══ MODAL LOTE ══════════════════════════════════════════════════════════ */}
      {showLote && (
        <ModalOverlay onClose={()=>{ if(!salvandoLote) setShowLote(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width:'500px', maxWidth:'95vw', maxHeight:'88vh' }}>
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50">
              <h3 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600"/>Atualização em Lote
                <span className="text-xs font-semibold text-slate-400">— {selectedIds.size} anúncio(s)</span>
              </h3>
              {!salvandoLote && <button onClick={()=>setShowLote(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5"/></button>}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Tipo de ajuste</label>
                <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                  {[['fixo','Preço Fixo (R$)'],['percentual','Variação (%)']].map(([v,l]) => (
                    <button key={v} onClick={()=>setTipoAjuste(v)}
                      className={`flex-1 py-2 rounded-md text-xs font-black uppercase transition-all ${tipoAjuste===v?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                  {tipoAjuste==='fixo'?'Novo preço para todos':'Variação percentual'}
                </label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:bg-white transition-all">
                  <span className="text-base font-bold text-slate-400">{tipoAjuste==='fixo'?'R$':'%'}</span>
                  <input type="number" step={tipoAjuste==='fixo'?'0.01':'0.1'} value={valorLote} onChange={e=>setValorLote(e.target.value)}
                    placeholder={tipoAjuste==='fixo'?'Ex: 49.90':'Ex: -10 ou +5'}
                    className="flex-1 bg-transparent text-base font-bold text-slate-800 outline-none"/>
                </div>
                {tipoAjuste==='percentual' && valorLote && (
                  <p className="text-xs text-slate-400 mt-1.5">Ex: R$ 100,00 → R$ {(100*(1+parseFloat(valorLote||0)/100)).toFixed(2)}</p>
                )}
              </div>
              {/* Preview */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Preview</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2">
                  {anuncios.filter(a=>selectedIds.has(a.id)).map(a => {
                    const novoP = tipoAjuste==='fixo' ? parseFloat(valorLote||0) : parseFloat((a.price*(1+parseFloat(valorLote||0)/100)).toFixed(2));
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-600 truncate flex-1">{a.title}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-slate-400 line-through">R$ {a.price.toFixed(2)}</span>
                          {valorLote && novoP>0 && <><span className="text-slate-300 text-xs">→</span><span className="text-sm font-bold text-blue-700">R$ {novoP.toFixed(2)}</span></>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Resultado do lote no terminal estilo Scanner */}
              {logLote.length>0 && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Resultado</label>
                  <div className="bg-slate-950 rounded-xl p-3 max-h-40 overflow-y-auto space-y-0.5" style={{ fontFamily:'monospace' }}>
                    {logLote.map((l,i) => (
                      <div key={i} className={`text-[10px] flex items-start gap-2 ${l.status==='ok'?'text-emerald-400':'text-red-400'}`}>
                        <span className="flex-shrink-0">{l.status==='ok'?'✅':'✗'}</span>
                        <span className="truncate flex-1">{l.titulo}</span>
                        {l.status==='ok'
                          ? <span className="flex-shrink-0 text-slate-500">R${l.de.toFixed(2)} → R${l.para.toFixed(2)}</span>
                          : <span className="flex-shrink-0 text-slate-500">{l.msg}</span>}
                      </div>
                    ))}
                    {salvandoLote && <div className="flex items-center gap-2 text-blue-400 text-[10px]"><Loader2 className="w-3 h-3 animate-spin"/>processando...</div>}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              {!salvandoLote && <button onClick={()=>setShowLote(false)} className="px-4 py-2 rounded-xl text-xs font-black uppercase text-slate-500 hover:bg-slate-100">{logLote.length>0?'Fechar':'Cancelar'}</button>}
              {logLote.length===0 && (
                <button onClick={salvarLote} disabled={!valorLote||salvandoLote}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400">
                  {salvandoLote?<><Loader2 className="w-4 h-4 animate-spin"/>Processando...</>:<><Zap className="w-4 h-4"/>Aplicar</>}
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ══ MODAL HISTÓRICO ══════════════════════════════════════════════════════ */}
      {showHistorico && historicoItem && (
        <ModalOverlay onClose={()=>setShowHistorico(false)} side="right">
          <div className="bg-white shadow-2xl flex flex-col" style={{ width:'360px', height:'100%' }}>
            <div className="px-4 py-3 border-b flex justify-between items-center bg-slate-900 text-white shrink-0">
              <h3 className="font-black uppercase text-xs flex items-center gap-2"><History className="w-3.5 h-3.5 text-emerald-400"/>Histórico de Preços</h3>
              <button onClick={()=>setShowHistorico(false)} className="hover:text-slate-400"><XCircle className="w-4 h-4"/></button>
            </div>
            <div className="p-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                {historicoItem.thumbnail
                  ? <img src={historicoItem.thumbnail} className="w-10 h-10 rounded-lg object-cover border border-slate-100" alt=""/>
                  : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                <div>
                  <p className="text-xs font-bold text-slate-800 line-clamp-2">{historicoItem.title}</p>
                  <p className="text-[9px] font-mono text-blue-500">{historicoItem.id}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-black">Preço atual</span>
                <span className="text-lg font-black text-slate-800">R$ {historicoItem.price?.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {historicoData.length===0
                ? <div className="py-10 text-center text-slate-400 text-xs font-black uppercase">Nenhum histórico registrado.</div>
                : (
                  <div className="space-y-2">
                    {historicoData.map((h,i) => (
                      <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black text-slate-800">R$ {parseFloat(h.preco).toFixed(2)}</span>
                          <VariacaoChip anterior={historicoData[i+1]?.preco} novo={h.preco}/>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5">{new Date(h.criadoEm).toLocaleString('pt-BR')}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}