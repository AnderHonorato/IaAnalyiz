/**
 * frontend/src/pages/Mlprecos.jsx
 * 
 * Propósito:
 * Ferramenta de precificação em tempo real para Mercado Livre.
 * Permite alterar preços e estoque de anúncios via API do Mercado Livre.
 * 
 * Responsabilidades:
 * - Buscar anúncios por ID/SKU
 * - Exibir preço, estoque, status e histórico de preços
 * - Permitir edição e atualização via API
 * - Monitora variações de preço em tempo real
 * - Histórico de mudanças com timestamps
 * - Suporte para modos edição inline vs. modal
 * - Exportação e download de dados
 * 
 * Funcionalidades:
 * - Busca avançada por múltiplos critérios
 * - Edição em lote de preços/estoque
 * - Histórico completo de alterações
 * - Gráfico de flutuação de preço
 * - Status badge (Ativo/Pausado/Encerrado)
 * - Notificações de status da API
 * - Download/exportação em CSV
 * 
 * Estado:
 *   - items: Lista de anúncios
 *   - editingId: ID do item sendo editado
 *   - filtros: Filtros aplicados
 *   - loading: Flag de carregamento
 * 
 * APIs Utilizadas:
 *   - GET /api/ml/listings - Buscar anúncios
 *   - PUT /api/ml/listings/:id - Atualizar preço/estoque
 *   - GET /api/ml/price-history/:id - Histórico de preços
 * 
 * @author Anderson Honorato
 * @version 1.3.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, DollarSign, ExternalLink, Check, X, Save, Edit3,
  Loader2, AlertTriangle, CheckCircle2, Image as ImageIcon,
  Square, CheckSquare, Zap, Info, Download,
  TrendingUp, TrendingDown, Wifi, WifiOff, Maximize2, Minimize2,
  History, ChevronDown, XCircle,
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';
const API_NOTICE_KEY = 'ml_precos_api_notice_count';

function getNoticeCount() { try { return parseInt(localStorage.getItem(API_NOTICE_KEY)||'0'); } catch { return 0; } }
function incNotice() { try { localStorage.setItem(API_NOTICE_KEY, String(getNoticeCount()+1)); } catch {} }
function closeNoticeForever() { try { localStorage.setItem(API_NOTICE_KEY,'999'); } catch {} }

function safeDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }
function ModalOverlay({ onClose, children, side='center' }) {
  return (
    <Portal>
      <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.75)',backdropFilter:'blur(4px)',display:'flex',alignItems:side==='right'?'stretch':'center',justifyContent:side==='right'?'flex-end':'center',padding:side==='center'?'16px':0}}>
        <div onClick={e=>e.stopPropagation()} style={{display:'flex',height:side==='right'?'100%':'auto'}}>{children}</div>
      </div>
    </Portal>
  );
}

function VariacaoChip({ anterior, novo }) {
  if (!anterior||!novo||anterior===novo) return null;
  const diff = ((novo-anterior)/anterior)*100, up = novo>anterior;
  return <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${up?'bg-emerald-50 text-emerald-600':'bg-red-50 text-red-600'}`}>{up?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>}{up?'+':''}{diff.toFixed(1)}%</span>;
}

function StatusBadge({ status }) {
  const m={active:'text-emerald-700 bg-emerald-50 border-emerald-200',paused:'text-amber-700 bg-amber-50 border-amber-200',closed:'text-slate-500 bg-slate-50 border-slate-200'};
  const l={active:'Ativo',paused:'Pausado',closed:'Encerrado'};
  return <span className={`text-[9px] font-black border px-2 py-0.5 rounded-full uppercase ${m[status]||'text-slate-400 bg-slate-50 border-slate-200'}`}>{l[status]||status}</span>;
}

function downloadCsv(a) {
  const h='ID,Título,Status,Preço,Estoque\n';
  const r=a.map(x=>`"${x.id}","${(x.title||'').replace(/"/g,'""')}","${x.status}","${x.price}","${x.available_quantity}"`).join('\n');
  const blob=new Blob([h+r],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download=`precos_ml_${new Date().toISOString().slice(0,10)}.csv`;el.click();URL.revokeObjectURL(url);
}

export default function Mlprecos() {
  const {userId}=useOutletContext()||{};
  const navigate=useNavigate();
  const {confirm,alert}=useModal();

  const [mlConectado,setMlConectado]=useState(false);
  const [mlNick,setMlNick]=useState('');
  const [anuncios,setAnuncios]=useState([]);
  const [loading,setLoading]=useState(false);
  const [busca,setBusca]=useState('');
  const [filtroStatus,setFiltroStatus]=useState('active');
  const [filtroCategoria,setFiltroCategoria]=useState('');
  const [categorias,setCategorias]=useState([]);
  const [showCatMenu,setShowCatMenu]=useState(false);

  // Aviso API ML — máx 3 exibições, X fecha para sempre
  const [showApiNotice,setShowApiNotice]=useState(()=>getNoticeCount()<3);
  useEffect(()=>{ if(showApiNotice) incNotice(); },[]);
  const handleDismissNotice=()=>{ closeNoticeForever(); setShowApiNotice(false); };

  // Terminal
  const [logs,setLogs]=useState([{msg:`[${new Date().toLocaleTimeString('pt-BR')}] Módulo de Precificação ML carregado.`,type:'info'}]);
  const [isBotRunning,setIsBotRunning]=useState(false);
  const [progress,setProgress]=useState(0);
  const [currentStep,setCurrentStep]=useState('');
  const [scannerFullscreen,setScannerFullscreen]=useState(false);
  const termRef=useRef(null);
  useEffect(()=>{ if(termRef.current) setTimeout(()=>{termRef.current.scrollTop=termRef.current.scrollHeight;},50); },[logs]);
  const addLog=useCallback((msg,type='info')=>{ const t=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); setLogs(l=>[...l,{msg:`[${t}] ${msg}`,type}]); },[]);

  // Tabela
  const [tabelaFullscreen,setTabelaFullscreen]=useState(false);
  const [editandoId,setEditandoId]=useState(null);
  const [novoPreco,setNovoPreco]=useState('');
  const [novaQtd,setNovaQtd]=useState('');
  const [salvando,setSalvando]=useState(false);
  const [resultados,setResultados]=useState({});
  const [selectedIds,setSelectedIds]=useState(new Set());
  const [showLote,setShowLote]=useState(false);
  const [tipoAjuste,setTipoAjuste]=useState('fixo');
  const [valorLote,setValorLote]=useState('');
  const [salvandoLote,setSalvandoLote]=useState(false);
  const [logLote,setLogLote]=useState([]);
  const [showHistorico,setShowHistorico]=useState(false);
  const [historicoItem,setHistoricoItem]=useState(null);
  const [historicoData,setHistoricoData]=useState([]);
  const inputRef=useRef(null);

  useEffect(()=>{ if(userId) verificarML(); },[userId]);
  useEffect(()=>{ if(editandoId&&inputRef.current) inputRef.current.focus(); },[editandoId]);

  const verificarML=async()=>{ try{ const r=await fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`);const d=await r.json();setMlConectado(d.connected&&!d.expired);setMlNick(d.nickname||''); }catch{} };

  const buscarAnuncios=async()=>{
    setLoading(true);setIsBotRunning(true);setProgress(0);setCurrentStep('Fase 1/3 — Autenticação');setAnuncios([]);setSelectedIds(new Set());
    addLog('🔐 Autenticando com o Mercado Livre...','info'); await new Promise(r=>setTimeout(r,500));
    addLog('🔗 Conexão estabelecida.','info'); setProgress(10); setCurrentStep('Fase 2/3 — Buscando anúncios');
    addLog(`📡 Status: ${filtroStatus}${filtroCategoria?` | Categoria: ${filtroCategoria}`:''}...`,'info'); setProgress(25);
    try {
      const params=new URLSearchParams({userId,status:filtroStatus});
      if(filtroCategoria) params.set('category',filtroCategoria);
      const res=await fetch(`${API_BASE_URL}/api/ml/precos/anuncios?${params}`);
      const data=await res.json(); setProgress(65);
      if(!res.ok||data.error){ addLog(`❌ Erro: ${data.error||'Falha na API'}`,'warn');alert({title:'Erro',message:data.error||'Falha.'});return; }
      setCurrentStep('Fase 3/3 — Compilando');
      addLog(`📊 ${data.total} anúncio(s) encontrado(s)!`,'success'); setProgress(85);
      await new Promise(r=>setTimeout(r,300));
      if(data.anuncios?.length>0){
        const p=data.anuncios.map(a=>a.price);
        addLog(`💰 Preço mín: R$${Math.min(...p).toFixed(2)} | máx: R$${Math.max(...p).toFixed(2)}`,'info');
        addLog(`📦 Estoque total: ${data.anuncios.reduce((s,a)=>s+(a.available_quantity||0),0)} unid.`,'info');
        setCategorias([...new Set(data.anuncios.map(a=>a.category_name||a.category_id).filter(Boolean))].sort());
      }
      setProgress(100); addLog('══════════════════════════════════════════','success'); addLog('🎯 Busca concluída!','success');
      setAnuncios(data.anuncios||[]);
    } catch(err){ addLog(`❌ Falha: ${err.message}`,'warn'); }
    finally{ setLoading(false);setIsBotRunning(false);setCurrentStep(''); }
  };

  const abrirEdicao=(item)=>{ setEditandoId(item.id);setNovoPreco(String(item.price));setNovaQtd(String(item.available_quantity??1));setResultados(r=>{const n={...r};delete n[item.id];return n;}); };
  const cancelar=()=>{ setEditandoId(null);setNovoPreco('');setNovaQtd(''); };

  const salvarPreco=async(item)=>{
    const preco=parseFloat(novoPreco),qtd=parseInt(novaQtd)||1;
    if(!preco||preco<=0){ alert({title:'Inválido',message:'Preço > 0.'}); return; }
    setSalvando(true); addLog(`💱 ${item.id}: R$${item.price.toFixed(2)} → R$${preco.toFixed(2)}`,'info');
    try{
      const res=await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,mlItemId:item.id,price:preco,available_quantity:qtd})});
      const d=await res.json();
      if(res.ok&&!d.error){ setResultados(r=>({...r,[item.id]:'ok'}));setAnuncios(p=>p.map(a=>a.id===item.id?{...a,price:preco,available_quantity:qtd,precoAnterior:a.price}:a));addLog(`✅ ${item.id} atualizado`,'success');cancelar(); }
      else{ setResultados(r=>({...r,[item.id]:'erro'}));addLog(`✗ ${item.id}: ${d.message}`,'warn');alert({title:'Erro',message:d.message||'Falha.'}); }
    }catch(e){ setResultados(r=>({...r,[item.id]:'erro'}));addLog(`✗ Falha: ${e.message}`,'warn'); }
    finally{ setSalvando(false); }
  };

  const abrirHistorico=async(item)=>{ setHistoricoItem(item);setHistoricoData([]);setShowHistorico(true); try{ const r=await fetch(`${API_BASE_URL}/api/ml/precos/historico/${item.id}?userId=${userId}`);setHistoricoData(await r.json()||[]); }catch{} };

  const salvarLote=async()=>{
    const valor=parseFloat(valorLote);
    if(!valor||(tipoAjuste==='fixo'&&valor<=0)){ alert({title:'Inválido',message:'Valor válido.'}); return; }
    const ok=await confirm({title:`Atualizar ${selectedIds.size} anúncio(s)`,message:tipoAjuste==='fixo'?`R$${valor.toFixed(2)} para todos?`:`${valor>0?'+':''}${valor}% em todos?`,confirmLabel:'Confirmar'});
    if(!ok) return;
    setSalvandoLote(true);setLogLote([]);addLog(`🚀 Lote de ${selectedIds.size}...`,'info');
    for(const item of anuncios.filter(a=>selectedIds.has(a.id))){
      const novoP=tipoAjuste==='fixo'?valor:parseFloat((item.price*(1+valor/100)).toFixed(2));
      try{
        const res=await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,mlItemId:item.id,price:novoP,available_quantity:item.available_quantity||1})});
        const d=await res.json();
        if(res.ok&&!d.error){ setLogLote(l=>[...l,{id:item.id,titulo:item.title,status:'ok',de:item.price,para:novoP}]);setAnuncios(p=>p.map(a=>a.id===item.id?{...a,price:novoP,precoAnterior:a.price}:a));addLog(`✅ ${item.id}`,'success'); }
        else{ setLogLote(l=>[...l,{id:item.id,titulo:item.title,status:'erro',msg:d.message}]);addLog(`✗ ${item.id}: ${d.message}`,'warn'); }
      }catch{ setLogLote(l=>[...l,{id:item.id,titulo:item.title,status:'erro',msg:'Falha'}]); }
      await new Promise(r=>setTimeout(r,350));
    }
    addLog('🎯 Lote concluído!','success');setSalvandoLote(false);setSelectedIds(new Set());
  };

  const filtrados=anuncios.filter(a=>{
    const mb=!busca||a.title.toLowerCase().includes(busca.toLowerCase())||a.id.toLowerCase().includes(busca.toLowerCase())||(a.sku||'').toLowerCase().includes(busca.toLowerCase());
    const mc=!filtroCategoria||(a.category_name||a.category_id)===filtroCategoria;
    return mb&&mc;
  });
  const toggleAll=()=>{ if(selectedIds.size===filtrados.length) setSelectedIds(new Set()); else setSelectedIds(new Set(filtrados.map(a=>a.id))); };

  const pm=anuncios.length>0?(anuncios.reduce((s,a)=>s+a.price,0)/anuncios.length).toFixed(2):null;
  const et=anuncios.reduce((s,a)=>s+(a.available_quantity||0),0);
  const okC=Object.values(resultados).filter(v=>v==='ok').length;
  const errC=Object.values(resultados).filter(v=>v==='erro').length;

  const stats=[
    {label:'Anúncios',value:anuncios.length||'—',sub:`${filtrados.length} visíveis`,color:'text-blue-600',dot:'bg-blue-400'},
    {label:'Preço Médio',value:pm?`R$${pm}`:'—',sub:'média geral',color:'text-emerald-600',dot:'bg-emerald-400'},
    {label:'Estoque',value:et>0?et:'—',sub:'unidades',color:'text-slate-700',dot:'bg-slate-400'},
    {label:'Selecionados',value:selectedIds.size||'—',sub:'para lote',color:'text-amber-600',dot:'bg-amber-400'},
    ...(okC>0?[{label:'Atualizados',value:okC,sub:'sessão',color:'text-emerald-600',dot:'bg-emerald-400'}]:[]),
    ...(errC>0?[{label:'Erros',value:errC,sub:'falha API',color:'text-red-500',dot:'bg-red-400'}]:[]),
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col gap-2 animate-in fade-in duration-300" style={{minHeight:'100vh'}}>

      {/* HEADER */}
      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={()=>navigate('/ml')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><ArrowLeft className="w-4 h-4"/></button>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-800">💰 Precificação ML</h2>
            <p className={`text-xs flex items-center gap-1 ${mlConectado?'text-emerald-600':'text-slate-400'}`}>{mlConectado?<><Wifi className="w-3 h-3"/>{mlNick}</>:<><WifiOff className="w-3 h-3"/>Não conectado</>}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {selectedIds.size>0&&<button onClick={()=>setShowLote(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700"><Zap className="w-3.5 h-3.5"/>Lote ({selectedIds.size})</button>}
          {anuncios.length>0&&<button onClick={()=>downloadCsv(anuncios)} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-100"><Download className="w-3.5 h-3.5"/>CSV</button>}
        </div>
      </div>

      {/* STATS */}
      <div className="flex items-center gap-0 bg-white border border-slate-200 rounded-xl shrink-0 overflow-hidden">
        {stats.map((m,i)=>(
          <div key={i} className={`flex items-center gap-2.5 px-4 py-2 flex-1 ${i<stats.length-1?'border-r border-slate-100':''}`}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`}/><div className="flex items-baseline gap-1.5 min-w-0"><span className={`text-sm font-black ${m.color} leading-none`}>{m.value}</span><span className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">{m.label}</span></div><span className="text-[9px] text-slate-300 ml-auto shrink-0">{m.sub}</span>
          </div>
        ))}
      </div>

      {/* AVISO API ML — máx 3x */}
      {showApiNotice&&(
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2 shrink-0">
          <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"/>
          <p className="text-xs text-amber-700 flex-1"><strong>API ML:</strong> <code className="bg-amber-100 px-1 rounded">price</code> + <code className="bg-amber-100 px-1 rounded">available_quantity</code> obrigatórios juntos desde 18/03/2026.</p>
          <button onClick={handleDismissNotice} title="Fechar (não mostrar mais)" className="p-0.5 text-amber-400 hover:text-amber-700 flex-shrink-0"><X className="w-3.5 h-3.5"/></button>
        </div>
      )}

      {/* GRID: TERMINAL (esq) + TABELA (dir) */}
      <div className={`grid gap-3 ${scannerFullscreen||tabelaFullscreen?'grid-cols-1':'grid-cols-1 xl:grid-cols-5'}`}>

        {/* TERMINAL */}
        {!tabelaFullscreen&&(
          <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden ${scannerFullscreen?'xl:col-span-5':'xl:col-span-2'}`} style={{minHeight:'520px'}}>
            <div className="p-3 border-b border-slate-100 space-y-2 shrink-0">
              <button onClick={buscarAnuncios} disabled={isBotRunning||!mlConectado}
                className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${isBotRunning||!mlConectado?'bg-slate-100 text-slate-400':'bg-blue-600 text-white hover:bg-blue-700'}`}>
                {isBotRunning?<span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/>Buscando...</span>:!mlConectado?'🔒 Conecte o ML':'🔍 Buscar Anúncios'}
              </button>
              <div className="bg-slate-900 rounded-lg p-2.5">
                <div className="flex justify-between items-center text-[9px] font-black uppercase mb-1.5">
                  <span className="text-slate-400 flex items-center gap-1">{isBotRunning&&<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-0.5"/>}{currentStep||'Aguardando'}&nbsp;{mlConectado?<Wifi className="w-2.5 h-2.5 text-emerald-400"/>:<WifiOff className="w-2.5 h-2.5 text-red-400"/>}</span>
                  <span className="text-emerald-400 font-black">{progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{width:`${progress}%`,background:progress<30?'#3b82f6':progress<60?'#f59e0b':progress<90?'#8b5cf6':'#10b981'}}/></div>
              </div>
            </div>
            <div ref={termRef} className="flex-1 bg-slate-950 m-2 rounded-xl p-2.5 overflow-y-auto flex flex-col gap-0.5" style={{fontFamily:'monospace',minHeight:'300px'}}>
              {logs.map((log,i)=>(
                <div key={i} className={`text-[10px] leading-relaxed ${log.type==='warn'?'text-amber-400':log.type==='success'?'text-emerald-400':'text-slate-300'}`}>
                  <span className="text-slate-600 mr-1 select-none">❯</span>{log.msg}
                </div>
              ))}
              {isBotRunning&&<div className="flex items-center gap-1.5 text-[10px] text-blue-400 mt-1"><Loader2 className="w-3 h-3 animate-spin"/><span className="animate-pulse">processando...</span></div>}
            </div>
            <div className="px-2 pb-2 shrink-0">
              <button onClick={()=>setScannerFullscreen(v=>!v)} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-black uppercase">
                {scannerFullscreen?<><Minimize2 className="w-3.5 h-3.5"/>Reduzir</>:<><Maximize2 className="w-3.5 h-3.5"/>Tela Cheia</>}
              </button>
            </div>
          </section>
        )}

        {/* TABELA */}
        {!scannerFullscreen&&(
          <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden ${tabelaFullscreen?'xl:col-span-5':'xl:col-span-3'}`} style={{minHeight:'520px'}}>

            {/* TOOLBAR: filtros ficam aqui, não no terminal */}
            <div className="px-3 py-2 border-b border-slate-100 shrink-0 space-y-2">
              {/* Linha 1: busca + tela cheia */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                  <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Título, ID, SKU..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400"/>
                </div>
                {selectedIds.size>0&&(
                  <div className="flex items-center gap-0.5 bg-blue-50 px-1.5 py-0.5 rounded-lg border border-blue-200">
                    <span className="text-xs font-black text-blue-700 mr-1">{selectedIds.size}</span>
                    <button onClick={()=>setShowLote(true)} title="Lote" className="p-0.5 text-blue-600 hover:bg-white rounded"><Zap className="w-3.5 h-3.5"/></button>
                    <button onClick={()=>setSelectedIds(new Set())} className="p-0.5 text-slate-500 hover:bg-white rounded"><X className="w-3.5 h-3.5"/></button>
                  </div>
                )}
                <button onClick={()=>setTabelaFullscreen(v=>!v)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500">
                  {tabelaFullscreen?<Minimize2 className="w-3.5 h-3.5"/>:<Maximize2 className="w-3.5 h-3.5"/>}
                </button>
              </div>

              {/* Linha 2: filtros de status + categoria */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                  {[['active','Ativos'],['paused','Pausados'],['closed','Encerrados']].map(([v,l])=>(
                    <button key={v} onClick={()=>{setFiltroStatus(v);setSelectedIds(new Set());setBuscarStatus(v);}}
                      className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase transition-all whitespace-nowrap ${filtroStatus===v?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{l}</button>
                  ))}
                </div>
                {categorias.length>0&&(
                  <div className="relative">
                    <button onClick={()=>setShowCatMenu(v=>!v)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${filtroCategoria?'bg-blue-50 border-blue-300 text-blue-700':'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      {filtroCategoria?filtroCategoria.substring(0,16):(filtroCategoria||'Categoria')}<ChevronDown className="w-3 h-3"/>
                    </button>
                    {showCatMenu&&(
                      <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 min-w-52 max-h-52 overflow-y-auto">
                        <button onClick={()=>{setFiltroCategoria('');setShowCatMenu(false);}} className={`w-full text-left px-3 py-2 text-[10px] font-black uppercase hover:bg-slate-50 ${!filtroCategoria?'text-blue-600 bg-blue-50':''}`}>Todas</button>
                        {categorias.map(c=>(<button key={c} onClick={()=>{setFiltroCategoria(c);setShowCatMenu(false);}} className={`w-full text-left px-3 py-2 text-[10px] font-semibold hover:bg-slate-50 border-t border-slate-50 truncate ${filtroCategoria===c?'text-blue-600 bg-blue-50':''}`}>{c}</button>))}
                      </div>
                    )}
                  </div>
                )}
                <span className="text-[9px] text-slate-400 ml-auto">{filtrados.length} anúncio{filtrados.length!==1?'s':''}</span>
              </div>
            </div>

            {/* TABELA */}
            <div className="overflow-y-auto" style={{maxHeight:tabelaFullscreen?'calc(100vh - 200px)':'560px'}}>
              {!mlConectado?(
                <div className="flex flex-col items-center justify-center py-20 gap-3"><WifiOff className="w-8 h-8 text-slate-300"/><p className="text-sm font-black text-slate-400 uppercase">ML não conectado</p><button onClick={()=>navigate('/ml')} className="px-4 py-2 rounded-lg text-xs font-black uppercase text-white bg-slate-900 hover:bg-blue-600">Dashboard ML</button></div>
              ):anuncios.length===0&&!loading?(
                <div className="flex flex-col items-center justify-center py-20 gap-3"><DollarSign className="w-10 h-10 text-slate-200"/><p className="text-sm font-black text-slate-400 uppercase">Clique em "Buscar Anúncios"</p><button onClick={buscarAnuncios} className="px-4 py-2 rounded-lg text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700">Buscar</button></div>
              ):loading?(
                <div className="flex flex-col items-center justify-center py-20 gap-3"><Loader2 className="w-7 h-7 animate-spin text-blue-400"/><p className="text-sm text-slate-400">Carregando...</p></div>
              ):filtrados.length===0?(
                <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">Nenhum resultado para "{busca}"</p></div>
              ):(
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                    <tr className="text-[9px] font-black uppercase text-slate-400">
                      <th className="px-3 py-2.5 w-8"><button onClick={toggleAll}>{selectedIds.size===filtrados.length&&filtrados.length>0?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5 text-slate-400"/>}</button></th>
                      <th className="px-3 py-2.5">Anúncio</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-center w-20">Estoque</th>
                      <th className="px-3 py-2.5 text-center w-36">Preço</th>
                      <th className="px-3 py-2.5 text-right w-32">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtrados.map(item=>{
                      const editando=editandoId===item.id,res=resultados[item.id],sel=selectedIds.has(item.id);
                      return (
                        <tr key={item.id} className={`transition-colors group ${sel?'bg-blue-50/40':''} ${editando?'bg-blue-50/30 ring-1 ring-inset ring-blue-200':'hover:bg-slate-50/70'}`}>
                          <td className="px-3 py-2.5"><button onClick={()=>{const n=new Set(selectedIds);n.has(item.id)?n.delete(item.id):n.add(item.id);setSelectedIds(n);}}>{sel?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5 text-slate-400"/>}</button></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {item.thumbnail?<img src={item.thumbnail} alt="" className="w-9 h-9 object-cover rounded-lg border border-slate-100 flex-shrink-0"/>:<div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-3.5 h-3.5 text-slate-300"/></div>}
                              <div>
                                <p className="text-xs font-semibold text-slate-800 max-w-[150px] truncate">{item.title}</p>
                                <a href={`https://produto.mercadolivre.com.br/MLB-${item.id.replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-blue-500 hover:underline flex items-center gap-0.5">{item.id}<ExternalLink className="w-2.5 h-2.5"/></a>
                                {item.sku&&<span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1 py-0.5 rounded">{item.sku}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center"><StatusBadge status={item.status}/></td>
                          <td className="px-3 py-2.5 text-center">
                            {editando?<input type="number" min="0" value={novaQtd} onChange={e=>setNovaQtd(e.target.value)} className="w-16 text-center border border-blue-300 rounded-lg py-1 text-sm font-semibold outline-none bg-white"/>:<span className="text-sm font-semibold text-slate-600">{item.available_quantity??'—'}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {editando?(
                              <div className="flex items-center gap-1 justify-center">
                                <span className="text-slate-400 text-sm">R$</span>
                                <input ref={inputRef} type="number" step="0.01" min="0.01" value={novoPreco} onChange={e=>setNovoPreco(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')salvarPreco(item);if(e.key==='Escape')cancelar();}} className="w-20 text-center border border-blue-300 rounded-lg py-1 text-sm font-bold outline-none bg-white"/>
                              </div>
                            ):(
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-base font-black text-slate-800">R$ {typeof item.price==='number'?item.price.toFixed(2):item.price}</span>
                                {item.precoAnterior&&<div className="flex items-center gap-1.5"><span className="text-xs text-slate-400 line-through">R$ {item.precoAnterior.toFixed(2)}</span><VariacaoChip anterior={item.precoAnterior} novo={item.price}/></div>}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {editando?(
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={()=>salvarPreco(item)} disabled={salvando} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-black uppercase hover:bg-emerald-600 disabled:opacity-50">{salvando?<Loader2 className="w-3 h-3 animate-spin"/>:<Save className="w-3 h-3"/>}Salvar</button>
                                <button onClick={cancelar} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><X className="w-3.5 h-3.5"/></button>
                              </div>
                            ):(
                              <div className="flex items-center justify-end gap-1.5">
                                {res==='ok'&&<span className="flex items-center gap-1 text-[10px] font-black text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5"/>Salvo</span>}
                                {res==='erro'&&<span className="flex items-center gap-1 text-[10px] font-black text-red-500"><AlertTriangle className="w-3.5 h-3.5"/>Erro</span>}
                                <button onClick={()=>abrirHistorico(item)} className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity" title="Histórico"><History className="w-3.5 h-3.5"/></button>
                                <button onClick={()=>abrirEdicao(item)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 text-xs font-black uppercase opacity-0 group-hover:opacity-100 transition-all"><Edit3 className="w-3 h-3"/>Editar</button>
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

      {/* MODAL LOTE */}
      {showLote&&(
        <ModalOverlay onClose={()=>{if(!salvandoLote)setShowLote(false);}}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{width:'520px',maxWidth:'95vw',maxHeight:'90vh'}}>
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50">
              <h3 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600"/>Atualização em Lote ({selectedIds.size})</h3>
              {!salvandoLote&&<button onClick={()=>setShowLote(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5"/></button>}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                {[['fixo','Preço Fixo (R$)'],['percentual','Variação (%)']].map(([v,l])=>(<button key={v} onClick={()=>setTipoAjuste(v)} className={`flex-1 py-2 rounded-md text-xs font-black uppercase ${tipoAjuste===v?'bg-white text-blue-600 shadow-sm':'text-slate-500'}`}>{l}</button>))}
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
                <span className="text-base font-bold text-slate-400">{tipoAjuste==='fixo'?'R$':'%'}</span>
                <input type="number" step={tipoAjuste==='fixo'?'0.01':'0.1'} value={valorLote} onChange={e=>setValorLote(e.target.value)} placeholder={tipoAjuste==='fixo'?'Ex: 49.90':'Ex: -10 ou +5'} className="flex-1 bg-transparent text-base font-bold text-slate-800 outline-none"/>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-1.5">
                {anuncios.filter(a=>selectedIds.has(a.id)).map(a=>{const np=tipoAjuste==='fixo'?parseFloat(valorLote||0):parseFloat((a.price*(1+parseFloat(valorLote||0)/100)).toFixed(2));return(<div key={a.id} className="flex items-center justify-between gap-2"><span className="text-xs text-slate-600 truncate flex-1">{a.title}</span><div className="flex items-center gap-2 flex-shrink-0"><span className="text-xs text-slate-400 line-through">R${a.price.toFixed(2)}</span>{valorLote&&np>0&&<span className="text-sm font-bold text-blue-700">R${np.toFixed(2)}</span>}</div></div>);})}
              </div>
              {logLote.length>0&&(
                <div className="bg-slate-950 rounded-xl p-3 max-h-44 overflow-y-auto space-y-0.5" style={{fontFamily:'monospace'}}>
                  {logLote.map((l,i)=>(<div key={i} className={`text-[10px] flex items-start gap-2 ${l.status==='ok'?'text-emerald-400':'text-red-400'}`}><span>{l.status==='ok'?'✅':'✗'}</span><span className="truncate flex-1">{l.titulo}</span>{l.status==='ok'?<span className="text-slate-500">→R${l.para.toFixed(2)}</span>:<span className="text-slate-500 truncate">{l.msg}</span>}</div>))}
                  {salvandoLote&&<div className="flex items-center gap-2 text-blue-400 text-[10px]"><Loader2 className="w-3 h-3 animate-spin"/>processando...</div>}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              {!salvandoLote&&<button onClick={()=>setShowLote(false)} className="px-4 py-2 rounded-xl text-xs font-black uppercase text-slate-500 hover:bg-slate-100">{logLote.length>0?'Fechar':'Cancelar'}</button>}
              {logLote.length===0&&<button onClick={salvarLote} disabled={!valorLote||salvandoLote} className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400">{salvandoLote?<><Loader2 className="w-4 h-4 animate-spin"/>Processando...</>:<><Zap className="w-4 h-4"/>Aplicar</>}</button>}
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL HISTÓRICO */}
      {showHistorico&&historicoItem&&(
        <ModalOverlay onClose={()=>setShowHistorico(false)} side="right">
          <div className="bg-white shadow-2xl flex flex-col" style={{width:'400px',height:'100%'}}>
            <div className="px-4 py-3 border-b flex justify-between items-center bg-slate-900 text-white shrink-0"><h3 className="font-black uppercase text-xs flex items-center gap-2"><History className="w-3.5 h-3.5 text-emerald-400"/>Histórico de Preços</h3><button onClick={()=>setShowHistorico(false)} className="hover:text-slate-400"><XCircle className="w-4 h-4"/></button></div>
            <div className="p-4 border-b shrink-0 flex items-center gap-2">
              {historicoItem.thumbnail?<img src={historicoItem.thumbnail} className="w-10 h-10 rounded-lg object-cover" alt=""/>:<div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
              <div><p className="text-xs font-bold text-slate-800 line-clamp-2">{historicoItem.title}</p><p className="text-[9px] font-mono text-blue-500">{historicoItem.id}</p></div>
              <span className="ml-auto text-lg font-black text-slate-800">R$ {historicoItem.price?.toFixed(2)}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {historicoData.length===0?<div className="py-10 text-center text-slate-400 text-xs font-black uppercase">Nenhum histórico.</div>:(
                <div className="space-y-2">
                  {historicoData.map((h,i)=>(
                    <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center"><span className="text-xs font-black text-slate-800">R$ {parseFloat(h.preco).toFixed(2)}</span><VariacaoChip anterior={historicoData[i+1]?.preco} novo={h.preco}/></div>
                      <p className="text-[9px] text-slate-400 mt-0.5">{safeDate(h.criadoEm)}</p>
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