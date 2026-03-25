// src/pages/MlResearch.jsx — v4
// Pesquisa de Anúncios ML: persistência, histórico, link clicável, multi-estratégia
// Estado mantido em localStorage para sobreviver a F5

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  XCircle, Clock, ShoppingBag, Star, TrendingUp, TrendingDown, Package,
  ChevronDown, ChevronUp, Download, Zap, ArrowLeft, Users, Activity,
  Filter, X, Medal, Award, Archive, ArchiveRestore, History, BarChart2,
  CheckSquare, Square,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';
const LS_KEY = 'mlresearch_itens_v2';

function extrairMLBId(input) {
  if (!input) return null;
  const raw = input.trim();
  if (/^MLB-?\d+$/i.test(raw)) return raw.toUpperCase().replace('-','');
  const pM = raw.match(/\/p\/MLB[-]?(\d+)/i); if (pM) return `MLB${pM[1]}`;
  const limpa = raw.split('?')[0].split('#')[0];
  const sM = limpa.match(/\/[^/]+-MLB[-]?(\d+)/i); if (sM) return `MLB${sM[1]}`;
  const aM = raw.match(/MLB[-]?(\d+)/i); if (aM) return `MLB${aM[1]}`;
  return null;
}

function formatPrice(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
}
function formatDate(val) {
  if (!val) return '—';
  try { const d=new Date(val); return isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch { return '—'; }
}
function urlCompact(url, max=55) {
  try { const u=new URL(url); const p=(u.pathname.split('/').filter(Boolean)[0]||'').substring(0,max); return `${u.hostname}/${p}${p.length>=max?'…':''}`; }
  catch { return url.length>max?url.substring(0,max)+'…':url; }
}

const STATUS_CFG = {
  pendente:   {label:'Pendente',   color:'text-amber-600',   bg:'bg-amber-50',   border:'border-amber-200',   barColor:'#fbbf24', icon:Clock},
  analisando: {label:'Analisando', color:'text-blue-600',    bg:'bg-blue-50',    border:'border-blue-200',    barColor:null,      icon:Loader2},
  concluido:  {label:'Concluído',  color:'text-emerald-600', bg:'bg-emerald-50', border:'border-emerald-200', barColor:'#34d399', icon:CheckCircle2},
  erro:       {label:'Erro',       color:'text-red-600',     bg:'bg-red-50',     border:'border-red-200',     barColor:'#f87171', icon:XCircle},
  fila:       {label:'Na fila',    color:'text-purple-600',  bg:'bg-purple-50',  border:'border-purple-200',  barColor:'#a78bfa', icon:Clock},
};

// ── CARD RESULTADO ────────────────────────────────────────────────────────────
function CardResultado({ item, onRemover, selecionado, onSel }) {
  const [exp, setExp] = useState(false);
  const [showConc, setShowConc] = useState(false);
  const cfg = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const Icon = cfg.icon;
  const d   = item.dados;
  const conc = d?.concorrentes || [];
  const abaixo = d?.preco && d?.precoMedio && d.preco < d.precoMedio;
  const linkUrl = d?.link || (item.url?.startsWith('http') ? item.url : `https://www.mercadolivre.com.br/p/${item.mlbId}`);
  const textoUrl = urlCompact(item.url || linkUrl);

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${cfg.border} ${selecionado?'ring-2 ring-blue-400':''}`}>
      <div className="h-1" style={item.status==='analisando'
        ?{backgroundImage:'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)',backgroundSize:'200%',animation:'slideGrad 1.5s linear infinite'}
        :{backgroundColor:cfg.barColor||'#94a3b8'}}/>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={()=>onSel(item.id)} className="mt-1 flex-shrink-0 text-slate-400 hover:text-blue-500">
            {selecionado?<CheckSquare className="w-4 h-4 text-blue-500"/>:<Square className="w-4 h-4"/>}
          </button>
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50 flex items-center justify-center">
            {d?.thumbnail?<img src={d.thumbnail} alt="" className="w-full h-full object-cover"/>:<ShoppingBag className="w-5 h-5 text-slate-300"/>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                <Icon className={`w-3 h-3 ${item.status==='analisando'?'animate-spin':''}`}/>{cfg.label}
              </span>
              <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.mlbId}</span>
              {d?.fonte&&<span className="text-[8px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{d.fonte}</span>}
              {d?.status&&<span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${d.status==='active'?'bg-emerald-50 text-emerald-600':'bg-slate-100 text-slate-500'}`}>{d.status==='active'?'Ativo':'Inativo'}</span>}
            </div>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm font-bold text-slate-800 hover:text-blue-600 hover:underline truncate block">
              {d?.titulo||textoUrl}
            </a>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:underline truncate block mt-0.5 font-mono flex items-center gap-1">
              <ExternalLink className="w-3 h-3 flex-shrink-0"/>{textoUrl}
            </a>
            {item.status==='erro'&&<p className="text-xs text-red-500 mt-1">{item.erro}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {item.status==='concluido'&&<button onClick={()=>setExp(v=>!v)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200">{exp?<ChevronUp className="w-3.5 h-3.5"/>:<ChevronDown className="w-3.5 h-3.5"/>}</button>}
            <button onClick={()=>onRemover(item.id)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-100"><Trash2 className="w-3.5 h-3.5"/></button>
          </div>
        </div>

        {item.status==='concluido'&&d&&(
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
              <p className="text-sm font-black text-slate-800 leading-none">{formatPrice(d.preco)}</p>
              <p className="text-[9px] text-slate-400 uppercase font-black mt-1">Preço</p>
            </div>
            <div className={`border rounded-xl p-2.5 text-center ${abaixo?'bg-emerald-50 border-emerald-100':'bg-amber-50 border-amber-100'}`}>
              <p className={`text-sm font-black leading-none ${abaixo?'text-emerald-700':'text-amber-700'}`}>{formatPrice(d.precoMedio)}</p>
              <p className={`text-[9px] uppercase font-black mt-1 ${abaixo?'text-emerald-500':'text-amber-500'}`}>Média</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
              <p className="text-sm font-black text-blue-700 leading-none">{d.totalVendedores||conc.length+1}</p>
              <p className="text-[9px] text-blue-400 uppercase font-black mt-1">Vendedores</p>
            </div>
          </div>
        )}

        {item.status==='analisando'&&(
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0"/>
            <span className="animate-pulse">Tentando múltiplas estratégias: /products → /items → scraping...</span>
          </div>
        )}

        {exp&&d&&(
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                {d.condicao&&<div className="flex justify-between"><span className="text-slate-400">Condição</span><span className="font-bold">{d.condicao}</span></div>}
                {d.estoque!=null&&<div className="flex justify-between"><span className="text-slate-400">Estoque</span><span className="font-bold">{d.estoque} un</span></div>}
                {d.vendidos!=null&&<div className="flex justify-between"><span className="text-slate-400">Vendidos</span><span className="font-bold text-emerald-600">{d.vendidos}</span></div>}
                {d.tipoAnuncio&&<div className="flex justify-between"><span className="text-slate-400">Tipo</span><span className="font-bold">{d.tipoAnuncio}</span></div>}
              </div>
              <div className="space-y-1.5">
                {d.frete&&<div className="flex justify-between"><span className="text-slate-400">Frete</span><span className={`font-bold ${d.freteGratis?'text-emerald-600':''}`}>{d.freteGratis?'🟢 Grátis':d.frete}</span></div>}
                {d.precoMin!=null&&<div className="flex justify-between"><span className="text-slate-400">Menor preço</span><span className="font-bold text-emerald-600">{formatPrice(d.precoMin)}</span></div>}
                {d.precoMax!=null&&<div className="flex justify-between"><span className="text-slate-400">Maior preço</span><span className="font-bold">{formatPrice(d.precoMax)}</span></div>}
                {d.avaliacoes!=null&&<div className="flex justify-between"><span className="text-slate-400">Avaliação</span><span className="font-bold text-amber-600 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 stroke-amber-400"/>{d.avaliacoes}</span></div>}
              </div>
            </div>

            {d.seller&&(
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Users className="w-3 h-3"/>Vendedor Principal</p>
                <div className="flex items-center justify-between">
                  <div><p className="text-xs font-black text-slate-800">{d.seller.nome}</p>{d.seller.reputacao&&<p className="text-[9px] text-slate-500 capitalize mt-0.5">{d.seller.reputacao}</p>}</div>
                  {d.seller.vendas!=null&&<div className="text-right"><p className="text-sm font-black text-slate-700">{d.seller.vendas?.toLocaleString('pt-BR')}</p><p className="text-[9px] text-slate-400">vendas</p></div>}
                </div>
              </div>
            )}

            {conc.length>0&&(
              <div>
                <button onClick={()=>setShowConc(v=>!v)} className="w-full flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                  <span className="text-[10px] font-black text-blue-700 uppercase flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/>{conc.length} concorrente{conc.length!==1?'s':''}</span>
                  {showConc?<ChevronUp className="w-3.5 h-3.5 text-blue-500"/>:<ChevronDown className="w-3.5 h-3.5 text-blue-500"/>}
                </button>
                {showConc&&(
                  <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-12 px-3 py-2 bg-slate-50 border-b text-[9px] font-black text-slate-400 uppercase">
                      <div className="col-span-1">#</div><div className="col-span-4">Vendedor</div><div className="col-span-3 text-right">Preço</div><div className="col-span-4 text-right">Link</div>
                    </div>
                    {conc.map((c,i)=>(
                      <div key={i} className={`grid grid-cols-12 px-3 py-2.5 items-center border-b last:border-0 text-xs hover:bg-slate-50 ${c.preco<d.preco?'bg-red-50/30':''}`}>
                        <div className="col-span-1">{i===0?<Medal className="w-3 h-3 text-amber-400"/>:i===1?<Award className="w-3 h-3 text-slate-400"/>:<span className="text-[9px] text-slate-400">{i+1}</span>}</div>
                        <div className="col-span-4 font-semibold text-slate-700 truncate">{c.nome}</div>
                        <div className={`col-span-3 text-right font-black flex items-center justify-end gap-0.5 ${c.preco<d.preco?'text-red-600':c.preco>d.preco?'text-emerald-600':'text-slate-600'}`}>
                          {formatPrice(c.preco)}{c.preco<d.preco&&<TrendingDown className="w-3 h-3"/>}{c.preco>d.preco&&<TrendingUp className="w-3 h-3"/>}
                        </div>
                        <div className="col-span-4 text-right">
                          {c.link&&<a href={c.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded hover:bg-slate-200 text-slate-400"><ExternalLink className="w-2.5 h-2.5"/></a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {d.atributos?.length>0&&(
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1"><Package className="w-3 h-3"/>Ficha Técnica</p>
                <div className="grid grid-cols-2 gap-1">
                  {d.atributos.slice(0,10).map((a,i)=>(
                    <div key={i} className="flex justify-between bg-slate-50 px-2 py-1 rounded-lg text-[10px]">
                      <span className="text-slate-400 truncate">{a.nome}</span>
                      <span className="font-bold text-slate-700 truncate ml-1">{a.valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CARD HISTÓRICO ────────────────────────────────────────────────────────────
function CardHistorico({ item, sel, onSel, onArquivar, onRestaurar, onExcluir, onExcluirDef, onRecarregar }) {
  return (
    <div className={`bg-white border rounded-xl p-3 flex items-center gap-3 ${sel?'border-blue-300 bg-blue-50/30':'border-slate-200'}`}>
      <button onClick={()=>onSel(item.id)} className="flex-shrink-0 text-slate-400 hover:text-blue-500">
        {sel?<CheckSquare className="w-4 h-4 text-blue-500"/>:<Square className="w-4 h-4"/>}
      </button>
      {item.thumbnail
        ?<img src={item.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100 flex-shrink-0"/>
        :<div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ShoppingBag className="w-4 h-4 text-slate-300"/></div>}
      <div className="flex-1 min-w-0">
        {item.titulo
          ?<a href={item.urlOriginal} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-800 hover:text-blue-600 hover:underline truncate block">{item.titulo}</a>
          :<span className="text-xs font-bold text-red-500 truncate block">{item.erro||'Erro na pesquisa'}</span>}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[9px] font-mono text-slate-400">{item.mlbId}</span>
          {item.preco&&<span className="text-[9px] font-black text-emerald-600">{formatPrice(item.preco)}</span>}
          <span className="text-[9px] text-slate-400">{formatDate(item.updatedAt)}</span>
          {item.arquivado&&<span className="text-[8px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">Arquivado</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={()=>onRecarregar(item)} title="Re-pesquisar" className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100"><RefreshCw className="w-3 h-3"/></button>
        {item.arquivado
          ?<button onClick={()=>onRestaurar(item.id)} title="Restaurar" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100"><ArchiveRestore className="w-3 h-3"/></button>
          :<button onClick={()=>onArquivar(item.id)} title="Arquivar" className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200"><Archive className="w-3 h-3"/></button>}
        <button onClick={()=>onExcluir(item.id)} title="Excluir (soft)" className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100"><Trash2 className="w-3 h-3"/></button>
        <button onClick={()=>onExcluirDef(item.id)} title="Excluir definitivamente" className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-100"><XCircle className="w-3 h-3"/></button>
      </div>
    </div>
  );
}

// ── RESUMO ────────────────────────────────────────────────────────────────────
function ResumoGeral({ itens }) {
  const ok = itens.filter(i=>i.status==='concluido');
  if (!ok.length) return null;
  const precos = ok.map(i=>i.dados?.preco).filter(Boolean);
  const totalV = ok.reduce((s,i)=>s+(i.dados?.totalVendedores||0),0);
  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 text-white mb-3">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Resumo</p>
      <div className="grid grid-cols-4 gap-3">
        <div><p className="text-xl font-black">{ok.length}</p><p className="text-[9px] text-slate-400 uppercase">Anúncios</p></div>
        <div><p className="text-xl font-black text-emerald-400">{precos.length?formatPrice(Math.min(...precos)):'—'}</p><p className="text-[9px] text-slate-400 uppercase">Menor</p></div>
        <div><p className="text-xl font-black text-amber-400">{precos.length?formatPrice(precos.reduce((s,v)=>s+v,0)/precos.length):'—'}</p><p className="text-[9px] text-slate-400 uppercase">Média</p></div>
        <div><p className="text-xl font-black text-blue-400">{totalV}</p><p className="text-[9px] text-slate-400 uppercase">Vendedores</p></div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function MlResearch() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const [aba, setAba]               = useState('pesquisa');
  const [inputTexto, setInputTexto] = useState('');
  const [mostrarInput, setMostrarInput] = useState(true);
  const [mlConectado, setMlConectado]   = useState(false);
  const [rodando, setRodando]           = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [log, setLog]                   = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());

  // Itens salvos no localStorage para sobreviver F5
  const [itens, setItensRaw] = useState(() => {
    try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const setItens = useCallback((fn) => {
    setItensRaw(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      // Salva só os concluídos/pendentes/erro (não analisando)
      const toSave = next.map(i => i.status === 'analisando' ? { ...i, status:'pendente' } : i);
      try { localStorage.setItem(LS_KEY, JSON.stringify(toSave)); } catch {}
      return next;
    });
  }, []);

  // Histórico do banco
  const [historico, setHistorico]   = useState([]);
  const [arquivados, setArquivados] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [selHist, setSelHist]       = useState(new Set());

  const rodandoRef = useRef(false);
  const abortRef   = useRef(false);
  const logEndRef  = useRef(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`)
      .then(r=>r.json()).then(d=>setMlConectado(d.connected&&!d.expired)).catch(()=>{});
  }, [userId]);

  useEffect(() => {
    if (aba==='historico')  buscarHistorico(false);
    if (aba==='arquivados') buscarHistorico(true);
  }, [aba]);

  useEffect(() => { logEndRef.current?.scrollIntoView({behavior:'smooth'}); }, [log]);

  const addLog = useCallback((msg,tipo='info') => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setLog(prev=>[...prev.slice(-100),{msg,tipo,ts}]);
  }, []);

  const buscarHistorico = async (arq) => {
    setLoadingHist(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=${arq}`);
      const data = await res.json();
      if (arq) setArquivados(Array.isArray(data)?data:[]);
      else     setHistorico(Array.isArray(data)?data:[]);
    } catch {}
    finally { setLoadingHist(false); }
  };

  const arquivarHist   = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/arquivar`,{method:'PUT'}); buscarHistorico(false); };
  const restaurarHist  = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/restaurar`,{method:'PUT'}); buscarHistorico(true); };
  const excluirHist    = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const excluirDefHist = async id => {
    if (!window.confirm('Excluir permanentemente? Não pode desfazer.')) return;
    await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/definitivo`,{method:'DELETE'});
    buscarHistorico(aba==='arquivados');
  };
  const acaoLoteHist = async (acao) => {
    const ids=[...selHist]; if (!ids.length) return;
    if (acao==='arquivar') await fetch(`${API_BASE_URL}/api/ml/research/historico/lote/arquivar`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    if (acao==='excluir')  await fetch(`${API_BASE_URL}/api/ml/research/historico/lote`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    setSelHist(new Set()); buscarHistorico(aba==='arquivados');
  };

  const recarregarDoHistorico = (item) => {
    setAba('pesquisa');
    setTimeout(()=>{
      if (!item.mlbId) return;
      const jaExiste = itens.find(i=>i.mlbId===item.mlbId);
      if (!jaExiste) setItens(prev=>[...prev,{id:`${item.mlbId}-${Date.now()}`,mlbId:item.mlbId,url:item.urlOriginal||item.mlbId,status:'pendente',dados:null,erro:null}]);
      setMostrarInput(false);
    },100);
  };

  const processarInput = () => {
    if (!inputTexto.trim()) return;
    const linhas  = inputTexto.split(/[\n,;]+/).map(l=>l.trim()).filter(Boolean);
    const novos   = [];
    const jaExiste = new Set(itens.map(i=>i.mlbId));
    for (const linha of linhas) {
      const mlbId = extrairMLBId(linha);
      if (!mlbId) { addLog(`⚠️ ID não encontrado: ${linha.substring(0,50)}`,'warn'); continue; }
      if (jaExiste.has(mlbId)) { addLog(`ℹ️ ${mlbId} já está na lista`); continue; }
      jaExiste.add(mlbId);
      novos.push({id:`${mlbId}-${Date.now()}-${Math.random()}`,mlbId,url:linha,status:'pendente',dados:null,erro:null});
    }
    if (!novos.length) { addLog('Nenhum link válido.','warn'); return; }
    setItens(prev=>[...prev,...novos]);
    setInputTexto('');
    addLog(`✅ ${novos.length} anúncio(s) adicionados`,'success');
    setMostrarInput(false);
  };

  const buscarAnuncio = useCallback(async (mlbId, url) => {
    const params = new URLSearchParams({userId});
    if (url) params.set('urlOriginal', encodeURIComponent(url));
    const res = await fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?${params}`,{signal:AbortSignal.timeout(25000)});
    if (!res.ok) { const e=await res.json().catch(()=>({error:`HTTP ${res.status}`})); throw new Error(e.error||`HTTP ${res.status}`); }
    return res.json();
  }, [userId]);

  const executarFila = useCallback(async (ids) => {
    if (rodandoRef.current) return;
    rodandoRef.current=true; abortRef.current=false; setRodando(true);
    addLog(`🚀 Analisando ${ids.length} anúncio(s)...`,'success');
    const retentar=[];
    for (let i=0;i<ids.length;i++) {
      if (abortRef.current) break;
      const {mlbId,url}=ids[i];
      setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando'}:it));
      addLog(`🔍 [${i+1}/${ids.length}] ${mlbId}...`);
      try {
        const dados=await buscarAnuncio(mlbId,url);
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados}:it));
        addLog(`✅ ${mlbId} (${dados.fonte||'ok'}) ${dados.titulo?.substring(0,25)||''}`,'success');
        if (i<ids.length-1&&!abortRef.current) await new Promise(r=>setTimeout(r,700));
      } catch(e) {
        const isTO=e.message.includes('timeout')||e.name==='TimeoutError';
        if (isTO) { retentar.push({mlbId,url}); setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'fila',erro:'Re-tentativa pendente...'}:it)); addLog(`⏳ ${mlbId}: timeout`,'warn'); }
        else { setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it)); addLog(`❌ ${mlbId}: ${e.message}`,'warn'); }
        await new Promise(r=>setTimeout(r,1200));
      }
    }
    if (retentar.length&&!abortRef.current) {
      addLog(`🔄 Re-tentando ${retentar.length} item(s) em 5s...`);
      await new Promise(r=>setTimeout(r,5000));
      for (const {mlbId,url} of retentar) {
        if (abortRef.current) break;
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando',erro:null}:it));
        addLog(`🔄 ${mlbId}`);
        try {
          const dados=await buscarAnuncio(mlbId,url);
          setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados}:it));
          addLog(`✅ Re-tentativa OK: ${mlbId}`,'success');
          await new Promise(r=>setTimeout(r,1000));
        } catch(e) {
          setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it));
          addLog(`❌ ${mlbId}: ${e.message}`,'warn');
        }
      }
    }
    rodandoRef.current=false; setRodando(false); addLog('🎯 Análise concluída!','success');
  }, [buscarAnuncio,addLog]);

  const iniciarAnalise = () => { const ids=itens.filter(i=>['pendente','erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if (ids.length) executarFila(ids); };
  const pararAnalise   = () => { abortRef.current=true; addLog('⏹ Interrompido','warn'); };
  const removerItem    = id => { setItens(prev=>prev.filter(i=>i.id!==id)); setSelecionados(prev=>{const n=new Set(prev);n.delete(id);return n;}); };
  const limparTudo     = () => { if (!rodandoRef.current){setItens([]);setLog([]);setSelecionados(new Set());} };
  const reanaliarErros = () => { const ids=itens.filter(i=>['erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if (ids.length) executarFila(ids); };

  const toggleSel      = id => setSelecionados(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleSelTodos = () => { if (selecionados.size===itensFiltrados.length) setSelecionados(new Set()); else setSelecionados(new Set(itensFiltrados.map(i=>i.id))); };

  const exportarCSV = () => {
    const rows=itens.filter(i=>i.status==='concluido').map(i=>{const d=i.dados;return [i.mlbId,`"${(d?.titulo||'').replace(/"/g,'""')}"`,d?.preco||'',d?.estoque||'',d?.vendidos||'',d?.totalVendedores||'',d?.precoMin||'',d?.precoMedio||'',d?.precoMax||'',d?.fonte||'',`"${i.url||''}"`].join(',');});
    if (!rows.length) return;
    const csv=['ID,Título,Preço,Estoque,Vendidos,TotalVendedores,PreçoMin,PreçoMédio,PreçoMax,Fonte,URL',...rows].join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=Object.assign(document.createElement('a'),{href:url,download:`pesquisa_ml_${new Date().toISOString().slice(0,10)}.csv`});
    a.click();URL.revokeObjectURL(url);
  };

  const contagens={
    todos:itens.length,pendente:itens.filter(i=>i.status==='pendente').length,
    analisando:itens.filter(i=>i.status==='analisando').length,concluido:itens.filter(i=>i.status==='concluido').length,
    erro:itens.filter(i=>i.status==='erro').length,fila:itens.filter(i=>i.status==='fila').length,
  };
  const temPendentes  = contagens.pendente+contagens.erro+contagens.fila>0;
  const itensFiltrados = filtroStatus==='todos'?itens:itens.filter(i=>i.status===filtroStatus);

  const FILTROS=[
    {k:'todos',      label:`Todos (${contagens.todos})`,           ativo:'bg-slate-100 text-slate-700 border-slate-300'},
    {k:'concluido',  label:`Concluídos (${contagens.concluido})`,  ativo:'bg-emerald-50 text-emerald-700 border-emerald-300'},
    {k:'pendente',   label:`Pendentes (${contagens.pendente})`,    ativo:'bg-amber-50 text-amber-700 border-amber-300'},
    {k:'analisando', label:`Analisando (${contagens.analisando})`, ativo:'bg-blue-50 text-blue-700 border-blue-300'},
    {k:'erro',       label:`Erros (${contagens.erro})`,            ativo:'bg-red-50 text-red-700 border-red-300'},
    {k:'fila',       label:`Fila (${contagens.fila})`,             ativo:'bg-purple-50 text-purple-700 border-purple-300'},
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col overflow-x-hidden" style={{minHeight:'100vh'}}>
      <style>{`@keyframes slideGrad{0%{background-position:0%}100%{background-position:200%}} @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={()=>navigate('/ml')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><ArrowLeft className="w-4 h-4"/></button>
          <div>
            <h2 className="text-base font-black text-slate-800">Pesquisa de Anúncios</h2>
            <p className="text-xs text-slate-400">Analise preços e concorrentes de qualquer anúncio do ML</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <nav className="flex bg-white border border-slate-200 rounded-xl p-0.5 gap-0.5">
            {[{k:'pesquisa',label:'Pesquisa',icon:Search},{k:'historico',label:`Histórico (${historico.length})`,icon:History},{k:'arquivados',label:`Arquivados (${arquivados.length})`,icon:Archive}].map(({k,label,icon:Icon})=>(
              <button key={k} onClick={()=>setAba(k)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${aba===k?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-100'}`}>
                <Icon className="w-3 h-3"/>{label}
              </button>
            ))}
          </nav>
          {aba==='pesquisa'&&itens.length>0&&(<>
            <button onClick={exportarCSV} disabled={!contagens.concluido} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40"><Download className="w-3.5 h-3.5"/>CSV</button>
            {!rodando&&(contagens.erro+contagens.fila)>0&&<button onClick={reanaliarErros} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"><RefreshCw className="w-3.5 h-3.5"/>Re-tentar</button>}
            <button onClick={limparTudo} disabled={rodando} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5"/>Limpar</button>
          </>)}
          {aba==='pesquisa'&&<button onClick={()=>setMostrarInput(v=>!v)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-black uppercase rounded-lg bg-slate-900 text-white hover:bg-slate-700"><Plus className="w-3.5 h-3.5"/>Adicionar Links</button>}
        </div>
      </div>

      {/* ABA PESQUISA */}
      {aba==='pesquisa'&&(<>
        {mostrarInput&&(
          <div className="mb-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm" style={{animation:'fadeIn 0.2s ease'}}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5"><Search className="w-3.5 h-3.5 text-blue-500"/>Cole os links ou IDs</p>
              <button onClick={()=>setMostrarInput(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
            </div>
            <textarea value={inputTexto} onChange={e=>setInputTexto(e.target.value)}
              placeholder={"Cole links ou IDs (um por linha ou vírgula):\n\nhttps://www.mercadolivre.com.br/...\nMLB123456789"}
              className="w-full border border-slate-200 rounded-xl p-3 text-xs font-mono outline-none focus:border-blue-400 resize-none bg-slate-50" rows={5}
              onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter')processarInput();}}/>
            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-slate-400">Aceita links completos, curtos, IDs MLB • Ctrl+Enter</p>
              <button onClick={processarInput} disabled={!inputTexto.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"><Plus className="w-3.5 h-3.5"/>Adicionar</button>
            </div>
          </div>
        )}

        {itens.length>0&&<ResumoGeral itens={itens}/>}

        {itens.length===0&&(
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className="w-20 h-20 bg-[#FFE600] rounded-3xl flex items-center justify-center shadow-lg"><Search className="w-10 h-10 text-slate-900"/></div>
            <div>
              <h3 className="text-lg font-black text-slate-800 mb-1">Pesquise qualquer anúncio do ML</h3>
              <p className="text-sm text-slate-400 max-w-md">Cole links ou IDs. Pesquisas salvas automaticamente no histórico.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 max-w-xl text-left">
              {[{icon:Users,title:'Concorrentes',desc:'Veja todos os vendedores'},{icon:BarChart2,title:'Análise de Preço',desc:'Mínimo, máximo e média'},{icon:History,title:'Histórico',desc:'Salvo automaticamente no banco'}].map(({icon:Icon,title,desc})=>(
                <div key={title} className="bg-white border border-slate-200 rounded-xl p-3"><Icon className="w-5 h-5 text-blue-500 mb-2"/><p className="text-xs font-black text-slate-700 mb-0.5">{title}</p><p className="text-[11px] text-slate-400">{desc}</p></div>
              ))}
            </div>
            <button onClick={()=>setMostrarInput(true)} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black uppercase bg-slate-900 text-white hover:bg-slate-700"><Plus className="w-4 h-4"/>Adicionar Links</button>
          </div>
        )}

        {itens.length>0&&(
          <div className="flex gap-3 flex-1 min-h-0">
            {/* Terminal */}
            <div className="w-60 flex-shrink-0 bg-slate-950 rounded-2xl flex flex-col" style={{maxHeight:'78vh'}}>
              <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-slate-800 shrink-0">
                <div className="flex gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500/70"/><span className="w-2.5 h-2.5 rounded-full bg-amber-500/70"/><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70"/></div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1"><Activity className="w-3 h-3"/>Terminal</p>
                {rodando&&<span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"/>}
              </div>
              <div className="px-2.5 py-2 border-b border-slate-800 shrink-0">
                {!rodando
                  ?<button onClick={iniciarAnalise} disabled={!temPendentes||!mlConectado} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500">
                    <Zap className="w-3 h-3"/>{mlConectado?(temPendentes?`Analisar ${contagens.pendente+contagens.erro+contagens.fila}`:'Sem pendentes'):'🔒 ML offline'}
                  </button>
                  :<button onClick={pararAnalise} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase bg-red-700 text-white hover:bg-red-600"><XCircle className="w-3 h-3"/>Parar</button>}
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5 font-mono min-h-0">
                {log.length===0?<p className="text-[9px] text-slate-700 italic">Aguardando análise...</p>
                  :log.map((l,i)=>(
                    <div key={i} className={`text-[9px] leading-relaxed break-words ${l.tipo==='success'?'text-emerald-400':l.tipo==='warn'?'text-amber-400':'text-slate-400'}`}>
                      <span className="text-slate-600 mr-1 select-none">{l.ts}</span>{l.msg}
                    </div>
                  ))}
                {rodando&&<div className="text-[9px] text-blue-400 flex items-center gap-1 animate-pulse mt-1"><Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0"/>processando...</div>}
                <div ref={logEndRef}/>
              </div>
            </div>

            {/* Coluna direita */}
            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-1.5 flex-wrap">
                <button onClick={toggleSelTodos} className="p-1 text-slate-400 hover:text-blue-500">
                  {selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?<CheckSquare className="w-4 h-4 text-blue-500"/>:<Square className="w-4 h-4"/>}
                </button>
                {FILTROS.map(({k,label,ativo})=>(
                  <button key={k} onClick={()=>setFiltroStatus(k)} className={`px-2.5 py-1.5 rounded text-xs font-black uppercase border transition-all ${filtroStatus===k?ativo:'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>{label}</button>
                ))}
                {selecionados.size>0&&(
                  <div className="ml-auto flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                    <span className="text-[9px] font-black text-blue-700">{selecionados.size} sel.</span>
                    <button onClick={()=>{[...selecionados].forEach(id=>removerItem(id));}} className="p-0.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto" style={{maxHeight:'calc(78vh - 52px)'}}>
                {itensFiltrados.length===0
                  ?<div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-2"><Filter className="w-8 h-8 text-slate-200"/><p className="text-xs font-black text-slate-400 uppercase">Nenhum item</p></div>
                  :itensFiltrados.map(item=><CardResultado key={item.id} item={item} onRemover={removerItem} selecionado={selecionados.has(item.id)} onSel={toggleSel}/>)}
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ABAS HISTÓRICO / ARQUIVADOS */}
      {(aba==='historico'||aba==='arquivados')&&(
        <div className="flex flex-col gap-3">
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
            <button onClick={()=>buscarHistorico(aba==='arquivados')} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200"><RefreshCw className="w-3.5 h-3.5"/></button>
            <p className="text-xs font-black text-slate-500 uppercase">{aba==='historico'?`${historico.length} pesquisa(s)`:`${arquivados.length} arquivado(s)`}</p>
            {selHist.size>0&&(
              <div className="ml-auto flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
                <span className="text-[9px] font-black text-blue-700">{selHist.size} sel.</span>
                {aba==='historico'&&<button onClick={()=>acaoLoteHist('arquivar')} className="flex items-center gap-1 text-[9px] font-black text-slate-600 hover:text-slate-800 px-1.5 py-0.5 bg-white rounded border border-slate-200"><Archive className="w-3 h-3"/>Arquivar</button>}
                <button onClick={()=>acaoLoteHist('excluir')} className="flex items-center gap-1 text-[9px] font-black text-red-600 px-1.5 py-0.5 bg-red-50 rounded border border-red-200"><Trash2 className="w-3 h-3"/>Excluir</button>
              </div>
            )}
          </div>
          {loadingHist
            ?<div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>
            :(() => {
                const lista=aba==='historico'?historico:arquivados;
                if (!lista.length) return (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-2 text-center">
                    <History className="w-10 h-10 text-slate-200"/>
                    <p className="text-sm font-black text-slate-400 uppercase">{aba==='historico'?'Nenhuma pesquisa ainda':'Nenhum arquivado'}</p>
                    <p className="text-xs text-slate-400">Pesquisas salvas automaticamente ao analisar.</p>
                  </div>
                );
                return (
                  <div className="space-y-2">
                    {lista.map(item=>(
                      <CardHistorico key={item.id} item={item} sel={selHist.has(item.id)}
                        onSel={id=>setSelHist(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;})}
                        onArquivar={arquivarHist} onRestaurar={restaurarHist}
                        onExcluir={excluirHist} onExcluirDef={excluirDefHist}
                        onRecarregar={recarregarDoHistorico}/>
                    ))}
                  </div>
                );
              })()
          }
        </div>
      )}
    </div>
  );
}