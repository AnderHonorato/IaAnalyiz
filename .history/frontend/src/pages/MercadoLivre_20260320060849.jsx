import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag, CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, Image as ImageIcon, Link2, Square, CheckSquare,
  Eye, Sparkles, HelpCircle, Unlink, LayoutList, FileText, Maximize2, Minimize2,
  Settings, Wifi, WifiOff, FileSearch, History, Download, BarChart2, Calendar,
  ChevronDown, Filter, AlertCircle, TrendingUp
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

const STATUS_CFG = {
  PENDENTE:    { label:'Pendente',    dot:'bg-amber-500',   text:'text-amber-700',  bg:'bg-amber-50',   border:'border-amber-200', icon:Clock },
  REINCIDENTE: { label:'Reincidente', dot:'bg-purple-500',  text:'text-purple-700', bg:'bg-purple-50',  border:'border-purple-200',icon:AlertTriangle },
  CORRIGIDO:   { label:'Corrigido',   dot:'bg-emerald-500', text:'text-emerald-700',bg:'bg-emerald-50', border:'border-emerald-200',icon:CheckCircle2 },
  IGNORADO:    { label:'Ignorado',    dot:'bg-slate-400',   text:'text-slate-600',  bg:'bg-slate-50',   border:'border-slate-200', icon:EyeOff },
  TODOS:       { label:'Todos',       dot:'bg-slate-400',   text:'text-slate-600',  bg:'bg-slate-100',  border:'border-slate-200', icon:BarChart2 },
};

const FORM_INICIAL = { sku:'',nome:'',preco:'',mlItemId:'',peso:'',unidadePeso:'g',alturaCm:'',larguraCm:'',comprimentoCm:'',eKit:false,categoria:'',plataforma:'Mercado Livre' };
const INTERVALOS = [{label:'30min',value:30},{label:'1h',value:60},{label:'2h',value:120},{label:'4h',value:240},{label:'6h',value:360},{label:'12h',value:720},{label:'24h',value:1440}];

function fmt(dt) {
  if (!dt) return '—';
  const d=new Date(dt)-Date.now(), h=Math.floor(d/3600000), m=Math.floor((d%3600000)/60000);
  return d<=0?'Agora':h>0?`${h}h ${m}m`:`${m}m`;
}

function Portal({children}){return ReactDOM.createPortal(children,document.body);}
function ModalOverlay({onClose,children,side='center'}){
  return(
    <Portal>
      <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:999999,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(3px)',display:'flex',alignItems:side==='right'?'stretch':'center',justifyContent:side==='right'?'flex-end':'center',padding:side==='center'?'16px':0}}>
        <div onClick={e=>e.stopPropagation()} style={{display:'flex',height:side==='right'?'100%':'auto'}}>{children}</div>
      </div>
    </Portal>
  );
}

function QuickPop({item}){
  return(
    <div style={{position:'absolute',right:'calc(100% + 8px)',top:'50%',transform:'translateY(-50%)',background:'#fff',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'10px',width:'185px',zIndex:50,boxShadow:'0 4px 20px rgba(0,0,0,0.1)',pointerEvents:'none'}}>
      {item.thumbnail&&<img src={item.thumbnail} alt="" style={{width:'100%',height:'64px',objectFit:'cover',borderRadius:'7px',marginBottom:'6px'}}/>}
      <p style={{fontSize:'11px',fontWeight:700,color:'#1e293b',lineHeight:1.3,marginBottom:'3px'}}>{(item.titulo||item.nome||'').substring(0,52)}</p>
      {item.mlItemId&&<p style={{fontSize:'9px',color:'#94a3b8',fontFamily:'monospace'}}>{item.mlItemId}</p>}
      {item.motivo&&<p style={{fontSize:'9px',color:'#ef4444',marginTop:'3px',lineHeight:1.3}}>{item.motivo.substring(0,65)}</p>}
    </div>
  );
}

function dlTxt(html,fn='resumo.txt'){
  const t=html.replace(/<br\s*\/?>/gi,'\n').replace(/<\/li>/gi,'\n').replace(/<li>/gi,'  • ').replace(/<\/ul>/gi,'\n').replace(/<[^>]+>/g,'').replace(/\n{3,}/g,'\n\n').trim();
  const b=new Blob([t],{type:'text/plain;charset=utf-8'}), u=URL.createObjectURL(b), a=document.createElement('a');
  a.href=u;a.download=fn;a.click();URL.revokeObjectURL(u);
}
function dlLogs(logs){
  const t=logs.map(l=>l.msg).join('\n'), b=new Blob([t],{type:'text/plain;charset=utf-8'}), u=URL.createObjectURL(b), a=document.createElement('a');
  a.href=u;a.download=`varredura_${new Date().toISOString().slice(0,10)}.txt`;a.click();URL.revokeObjectURL(u);
}

export default function MercadoLivre(){
  const {userId,userRole}=useOutletContext()||{};
  const navigate=useNavigate();
  const {confirm,alert}=useModal();

  const [tab,setTab]=useState('scanner');
  const [mlOk,setMlOk]=useState(false);
  const [mlNick,setMlNick]=useState('');
  const [running,setRunning]=useState(false);
  const [pct,setPct]=useState(0);
  const [step,setStep]=useState('');
  const [logs,setLogs]=useState([{msg:`[${new Date().toLocaleTimeString('pt-BR')}] IA_Analyiz Módulo Analítico Carregado.`,type:'info'}]);
  const [botStats,setBotStats]=useState(null);
  const [insight,setInsight]=useState('');

  const [cfgOpen,setCfgOpen]=useState(false);
  const [dicasOpen,setDicasOpen]=useState(false);
  const [resumoOpen,setResumoOpen]=useState(false);
  const [resumoTxt,setResumoTxt]=useState('');
  const [resumoHist,setResumoHist]=useState([]);
  const [loadResumo,setLoadResumo]=useState(false);

  const [qv,setQv]=useState(null);
  const [detModal,setDetModal]=useState(null);
  const [detData,setDetData]=useState(null);
  const [loadDet,setLoadDet]=useState(false);

  const [divs,setDivs]=useState([]);
  const [divSt,setDivSt]=useState({pendente:0,reincidente:0,corrigido:0,ignorado:0,total:0});
  const [filtro,setFiltro]=useState('PENDENTE');
  const [busca,setBusca]=useState('');
  const [selDiv,setSelDiv]=useState(new Set());
  const [loadDiv,setLoadDiv]=useState(false);
  const [termFS,setTermFS]=useState(false);
  const [divFS,setDivFS]=useState(false);

  const [prods,setProds]=useState([]);
  const [cats,setCats]=useState([]);
  const [form,setForm]=useState(FORM_INICIAL);
  const [editId,setEditId]=useState(null);
  const [loadProd,setLoadProd]=useState(false);
  const [srchProd,setSrchProd]=useState('');
  const [selProd,setSelProd]=useState(new Set());
  const [tipoCat,setTipoCat]=useState('BASE');

  const [nv,setNv]=useState([]);
  const [selNv,setSelNv]=useState(new Set());
  const [buscaNv,setBuscaNv]=useState('');

  const [vincModal,setVincModal]=useState(null);
  const [kit,setKit]=useState([]);
  const [buscaKit,setBuscaKit]=useState('');
  const [pesoFix,setPesoFix]=useState('');
  const [unidFix,setUnidFix]=useState('g');

  const [agend,setAgend]=useState(null);
  const [intv,setIntv]=useState(360);
  const [savingAg,setSavingAg]=useState(false);
  const [modoLento,setModoLento]=useState(false);

  const termRef=useRef(null);
  useEffect(()=>{if(termRef.current)setTimeout(()=>{termRef.current.scrollTop=termRef.current.scrollHeight;},50);},[logs]);

  useEffect(()=>{
    if(!userId)return;
    statusML();buscarDivs();buscarDivStats();buscarProds();buscarNv();buscarCats();buscarInsight();
    const t=setInterval(()=>setAgend(a=>a?{...a}:a),30000);
    return()=>clearInterval(t);
  },[userId]);

  useEffect(()=>{if(userId)buscarDivs();},[filtro,userId]);

  const get=useCallback(async p=>{const r=await fetch(`${API_BASE_URL}${p}`);return r.json();},[]);
  const selAll=(items,sel,setSel,k='id')=>{if(sel.size===items.length)setSel(new Set());else setSel(new Set(items.map(i=>i[k])));};

  const statusML=async()=>{
    try{const d=await get(`/api/ml/status?userId=${userId}`);setMlOk(d.connected&&!d.expired);setMlNick(d.nickname);const c=await get(`/api/agendador?userId=${userId}`);setAgend(c);setIntv(c?.intervalo||360);}catch{}
  };
  const conectar=async()=>{try{const d=await get(`/api/ml/auth-url?userId=${userId}`);if(d.url)window.location.href=d.url;}catch{alert({title:'Erro',message:'Falha.'});}};
  const desconectarML=async()=>{if(!await confirm({title:'Desconectar',message:'Desconectar ML?',confirmLabel:'Desconectar',danger:true}))return;await fetch(`${API_BASE_URL}/api/ml/disconnect?userId=${userId}`,{method:'DELETE'});statusML();setCfgOpen(false);};
  const salvarAg=async(ativo,iv)=>{setSavingAg(true);try{const r=await fetch(`${API_BASE_URL}/api/agendador`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,ativo,intervalo:iv})});const d=await r.json();setAgend(d);setIntv(d.intervalo);}catch{}finally{setSavingAg(false);}};
  const buscarInsight=async()=>{try{const d=await get(`/api/ia/proactive?userId=${userId}&userRole=${userRole}&pageKey=divergencias`);if(d.insight)setInsight(d.insight);}catch{}};

  const gerarResumo=async()=>{
    setLoadResumo(true);
    try{
      const urgentes=divs.filter(d=>d.status==='PENDENTE'||d.status==='REINCIDENTE');
      const reinc=divs.filter(d=>d.status==='REINCIDENTE');
      const pesoDiff=divs.reduce((a,d)=>d.pesoMl&&d.pesoLocal?a+Math.abs(d.pesoMl-d.pesoLocal):a,0);
      const dados=`OPERAÇÃO: Catálogo: ${prods.length} produtos, ${prods.filter(p=>p.mlItemId).length} vinculados. Sem vínculo: ${nv.length}. Divergências: total=${divSt.total}, pendentes=${divSt.pendente}, reincidentes=${divSt.reincidente}, corrigidas=${divSt.corrigido}. Desvio peso total: ${pesoDiff}g. Taxa correção: ${divSt.total>0?Math.round((divSt.corrigido/divSt.total)*100):0}%. Reincidentes: ${reinc.map(d=>d.mlItemId).join(', ')||'nenhum'}. Urgentes: ${urgentes.map(d=>d.titulo||d.mlItemId).join('; ')||'nenhum'}.

GERE relatório executivo HTML com: 1.<b>📊 Diagnóstico</b> — estado crítico/atenção/ok com justificativa. 2.<b>🚨 Itens Urgentes</b> — liste cada pendente/reincidente com motivo. 3.<b>⚠️ Padrão Reincidência</b> — por que voltam a divergir. 4.<b>📦 Impacto Frete</b> — ${pesoDiff}g de desvio: custo estimado por envio. 5.<b>✅ Plano de Ação</b> — 3 ações priorizadas com prazo. 6.<b>📈 Tendência</b> — melhorando ou piorando. Use números reais. Formato: HTML com <b>,<br>,<ul><li>.`;
      const r=await fetch(`${API_BASE_URL}/api/ia/summary`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,dados})});
      const d=await r.json();setResumoTxt(d.conteudo);buscarResumoHist();
    }catch{setResumoTxt('<b>Erro ao gerar resumo.</b><br>Tente novamente.');}
    finally{setLoadResumo(false);}
  };
  const buscarResumoHist=async()=>{try{setResumoHist(await get(`/api/ia/summary/history?userId=${userId}`));}catch{}};

  const abrirDet=async(item)=>{
    setQv(null);setDetModal(item);setDetData(null);
    if(!item.mlItemId)return;
    setLoadDet(true);
    try{setDetData(await get(`/api/ml/item-details/${item.mlItemId}?userId=${userId}`));}
    catch{alert({title:'Erro',message:'Falha ao conectar com ML.'});}
    finally{setLoadDet(false);}
  };

  const buscarDivs=async()=>{setLoadDiv(true);try{const sp=filtro==='TODOS'?'':`&status=${filtro}`;setDivs(await get(`/api/divergencias?plataforma=Mercado%20Livre&userId=${userId}${sp}`)||[]);}catch{}finally{setLoadDiv(false);}};
  const buscarDivStats=async()=>{try{setDivSt(await get(`/api/divergencias/stats?userId=${userId}`));}catch{}};
  const acaoDiv=async(id,tipo)=>{try{await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`,{method:'PUT'});await buscarDivs();await buscarDivStats();}catch{}};
  const acaoLote=async(tipo)=>{
    if(selDiv.size===0)return;
    if(tipo==='excluir'&&!await confirm({title:'Excluir',message:`Remover ${selDiv.size} item(s)?`,confirmLabel:'Excluir',danger:true}))return;
    for(const id of selDiv){if(tipo==='excluir')await fetch(`${API_BASE_URL}/api/divergencias/${id}`,{method:'DELETE'});else await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`,{method:'PUT'});}
    setSelDiv(new Set());await buscarDivs();await buscarDivStats();
  };
  const buscarNv=async()=>{try{setNv(await get(`/api/produtos?plataforma=ML_PENDENTE&userId=${userId}`)||[]);}catch{}};
  const acaoNv=async(id,acao)=>{if(acao==='ignorado')await fetch(`${API_BASE_URL}/api/produtos/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plataforma:'ML_IGNORADO'})});await buscarNv();await buscarProds();};
  const acaoLoteNv=async(a)=>{
    if(selNv.size===0)return;
    if(a==='excluir'&&!await confirm({title:'Excluir',message:`Excluir ${selNv.size}?`,confirmLabel:'Excluir',danger:true}))return;
    for(const id of selNv){if(a==='excluir')await fetch(`${API_BASE_URL}/api/produtos/${id}`,{method:'DELETE'});else await fetch(`${API_BASE_URL}/api/produtos/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plataforma:'ML_IGNORADO'})});}
    setSelNv(new Set());await buscarNv();await buscarProds();
  };
  const buscarProds=async()=>{try{setProds(await get(`/api/produtos?userId=${userId}`)||[]);}catch{}};
  const buscarCats=async()=>{try{setCats(await get(`/api/produtos/categorias?userId=${userId}`));}catch{}};
  const submitProd=async(e)=>{
    e.preventDefault();setLoadProd(true);
    let pg=parseFloat(form.peso)||0;if(form.unidadePeso==='kg')pg*=1000;
    try{const url=editId?`${API_BASE_URL}/api/produtos/${editId}`:`${API_BASE_URL}/api/produtos`;await fetch(url,{method:editId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,pesoGramas:pg,userId,plataforma:form.mlItemId?'Mercado Livre':'BASE'})});setForm(FORM_INICIAL);setEditId(null);await buscarProds();}catch{}finally{setLoadProd(false);}
  };
  const excluirProd=async(id)=>{if(!await confirm({title:'Excluir',message:'Remover produto?',confirmLabel:'Excluir',danger:true}))return;try{await fetch(`${API_BASE_URL}/api/produtos/${id}`,{method:'DELETE'});await buscarProds();}catch{}};
  const desvincular=async(id)=>{if(!await confirm({title:'Desvincular',message:'Voltará para Não Vinculados?',confirmLabel:'Desvincular'}))return;try{await fetch(`${API_BASE_URL}/api/produtos/${id}/desvincular`,{method:'PUT'});await buscarProds();await buscarNv();}catch{}};
  const excluirLoteP=async()=>{if(selProd.size===0)return;if(!await confirm({title:'Excluir',message:`Excluir ${selProd.size}?`,confirmLabel:'Excluir',danger:true}))return;for(const id of selProd)await fetch(`${API_BASE_URL}/api/produtos/${id}`,{method:'DELETE'});setSelProd(new Set());await buscarProds();};
  const abrirVinc=(p)=>{setVincModal(p);setKit([]);setBuscaKit('');setPesoFix('');setUnidFix('g');};
  const salvarVinc=async()=>{
    let pg=parseFloat(pesoFix)||0;if(unidFix==='kg')pg*=1000;
    try{await fetch(`${API_BASE_URL}/api/produtos/${vincModal.id}/vincular`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({composicao:kit.map(c=>({produtoId:c.p.id,quantidade:c.q})),pesoManual:pg})});setVincModal(null);await buscarNv();await buscarProds();}catch{}
  };
  const iniciarBot=()=>{
    if(!userId)return;
    setRunning(true);setPct(0);setBotStats(null);setStep('');
    setLogs([{msg:`[${new Date().toLocaleTimeString('pt-BR')}] Iniciando varredura...`,type:'info'}]);
    const ev=new EventSource(`${API_BASE_URL}/api/bot/stream?userId=${userId}&modoLento=${modoLento}`);
    ev.onmessage=(e)=>{
      try{const d=JSON.parse(e.data);if(d.msg)setLogs(p=>[...p,{msg:d.msg,type:d.type}]);if(d.percent!==undefined)setPct(d.percent);if(d.step)setStep(d.step);if(d.type==='done'){setRunning(false);if(d.stats)setBotStats(d.stats);ev.close();buscarDivs();buscarDivStats();buscarNv();buscarInsight();}}catch{}
    };
    ev.onerror=()=>{setRunning(false);ev.close();};
  };

  const divsF=divs.filter(d=>!busca||(d.titulo||'').toLowerCase().includes(busca.toLowerCase())||(d.mlItemId||'').toLowerCase().includes(busca.toLowerCase()));
  const nvF=nv.filter(p=>!buscaNv||p.nome.toLowerCase().includes(buscaNv.toLowerCase())||(p.mlItemId||'').toLowerCase().includes(buscaNv.toLowerCase()));
  const prodsF=prods.filter(p=>{const t=tipoCat==='BASE'?!p.mlItemId:!!p.mlItemId;const b=!srchProd||p.nome.toLowerCase().includes(srchProd.toLowerCase())||p.sku.toLowerCase().includes(srchProd.toLowerCase())||(p.mlItemId||'').toLowerCase().includes(srchProd.toLowerCase());return t&&b&&p.plataforma!=='ML_PENDENTE'&&p.plataforma!=='ML_IGNORADO';});
  const baseKit=prods.filter(p=>!p.mlItemId&&p.plataforma!=='ML_PENDENTE'&&(!buscaKit||p.nome.toLowerCase().includes(buscaKit.toLowerCase()))).slice(0,5);
  const taxaC=divSt.total>0?Math.round((divSt.corrigido/divSt.total)*100):0;
  const vinc=prods.filter(p=>p.mlItemId&&p.plataforma!=='ML_PENDENTE'&&p.plataforma!=='ML_IGNORADO').length;
  const urgente=divSt.pendente+divSt.reincidente;

  const TABS=[{k:'scanner',l:'Scanner ML'},{k:'pendentes',l:`Não Vinculados${nv.length>0?` (${nv.length})`:''}`},{k:'catalogo',l:'Catálogo'}];

  return(
    <div className="flex flex-col h-full" style={{background:'var(--theme-bg)'}}>

      {/* CABEÇALHO ESTILO ML */}
      <div className="px-6 pt-5 pb-0 border-b border-slate-200 shrink-0" style={{background:'var(--theme-card,#fff)'}}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{color:'var(--theme-text)'}}>Auditoria de Anúncios</h1>
            {insight&&<p className="text-xs text-slate-500 mt-0.5" dangerouslySetInnerHTML={{__html:insight}}/>}
          </div>
          <div className="flex items-center gap-2">
            {urgente>0&&<span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full"><AlertCircle className="w-3.5 h-3.5"/>{urgente} urgente{urgente>1?'s':''}</span>}
            <button onClick={()=>{buscarResumoHist();setResumoOpen(true);}} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-700 bg-white border border-slate-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-all"><Sparkles className="w-3.5 h-3.5"/>Resumo IA</button>
            <button onClick={()=>setDicasOpen(true)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><HelpCircle className="w-4 h-4"/></button>
            <button onClick={()=>setCfgOpen(true)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"><Settings className="w-4 h-4"/></button>
          </div>
        </div>

        {/* MÉTRICAS HORIZONTAIS */}
        <div className="flex items-stretch border-t border-b border-slate-100 -mx-6 px-0">
          {[
            {l:'Pendentes',v:divSt.pendente+divSt.reincidente,sub:`${divSt.reincidente} reinc.`,dot:'bg-amber-500',color:'text-amber-600'},
            {l:'Corrigidos',v:divSt.corrigido,sub:`${taxaC}% taxa`,dot:'bg-emerald-500',color:'text-emerald-600'},
            {l:'Anúncios ML',v:vinc,sub:`${nv.length} sem vínculo`,dot:'bg-blue-500',color:'text-blue-600'},
            {l:'Catálogo',v:prods.filter(p=>!p.mlItemId&&p.plataforma!=='ML_PENDENTE').length,sub:`${prods.filter(p=>p.eKit).length} kits`,dot:'bg-slate-400',color:'text-slate-600'},
            {l:'Auto-varredura',v:agend?.ativo?'ON':'OFF',sub:agend?.ativo?`Próx: ${fmt(agend?.proximaExecucao)}`:'Desativada',dot:agend?.ativo?'bg-emerald-500 animate-pulse':'bg-slate-300',color:agend?.ativo?'text-emerald-600':'text-slate-500'},
          ].map((m,i)=>(
            <div key={i} className="flex items-center gap-3 px-6 py-3 border-r border-slate-100 last:border-r-0 hover:bg-slate-50/60 transition-colors">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`}/>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-none mb-0.5">{m.l}</p>
                <p className={`text-xl font-bold leading-none ${m.color}`}>{m.v}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{m.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* TABS ESTILO ML */}
        <nav className="flex items-end gap-0 pt-1">
          {TABS.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${tab===t.k?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700'}`}
              style={tab===t.k?{borderColor:'var(--theme-accent)',color:'var(--theme-accent)'}:{}}>
              {t.l}
            </button>
          ))}
        </nav>
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 min-h-0 overflow-hidden" style={{background:'var(--theme-bg)'}}>

        {/* SCANNER */}
        {tab==='scanner'&&(
          <div className="grid grid-cols-5 h-full">
            {/* Painel esquerdo */}
            <div className={`${termFS?'col-span-5':'col-span-2'} flex flex-col h-full border-r`} style={{borderColor:'var(--theme-card-border,#e2e8f0)',background:'var(--theme-sidebar,#f8fafc)'}}>
              <div className="px-4 py-3 border-b space-y-2.5 shrink-0" style={{borderColor:'var(--theme-card-border,#e2e8f0)'}}>
                <button onClick={iniciarBot} disabled={running||!mlOk}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide transition-all ${running||!mlOk?'bg-slate-200 text-slate-400 cursor-not-allowed':'text-white hover:opacity-90'}`}
                  style={!running&&mlOk?{background:'var(--theme-accent)'}:{}}>
                  {running?<span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Auditando...</span>:!mlOk?'🔒 Conecte o ML nas Configurações':'🔍 Iniciar Varredura Completa'}
                </button>
                <div className="bg-slate-900 rounded-xl px-3 py-2.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase mb-1.5">
                    <span className="text-slate-400 flex items-center gap-1.5">{running&&<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>}{step||'Aguardando'} {mlOk?<Wifi className="w-3 h-3 text-emerald-400"/>:<WifiOff className="w-3 h-3 text-red-400"/>}</span>
                    <span className="text-emerald-400">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{width:`${pct}%`,background:pct<30?'#3b82f6':pct<60?'#f59e0b':pct<90?'#8b5cf6':'#10b981'}}/>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col min-h-0 relative">
                <button onClick={()=>setTermFS(v=>!v)} className="absolute top-2 right-2 z-10 p-1 bg-slate-800/70 hover:bg-slate-700 text-slate-300 rounded">
                  {termFS?<Minimize2 className="w-3 h-3"/>:<Maximize2 className="w-3 h-3"/>}
                </button>
                <div ref={termRef} className="flex-1 bg-slate-950 overflow-y-auto px-3 py-3 min-h-0" style={{fontFamily:'monospace'}}>
                  {logs.map((l,i)=>(
                    <div key={i} className={`text-[11px] leading-relaxed py-0.5 ${l.type==='warn'?'text-amber-400':l.type==='success'?'text-emerald-400':'text-slate-300'}`}>
                      <span className="text-slate-600 mr-1.5 select-none">❯</span>{l.msg}
                    </div>
                  ))}
                  {running&&<div className="flex items-center gap-2 text-[11px] text-blue-400 mt-1"><Loader2 className="w-3 h-3 animate-spin"/><span className="animate-pulse">processando...</span></div>}
                  {botStats&&!running&&(
                    <div className="mt-3 border-t border-slate-700 pt-3">
                      <p className="text-[10px] text-emerald-400 font-bold mb-2 tracking-widest">══ RESULTADO DA VARREDURA ══</p>
                      {[['Total auditados',botStats.totalAnuncios,'text-slate-300'],['Sem divergência',botStats.anunciosOk,'text-emerald-400'],['Novas divergências',botStats.novasDiv,botStats.novasDiv>0?'text-amber-400':'text-slate-500'],['Já pendentes',botStats.divExistentes,'text-slate-400'],['Reincidentes',botStats.reincidentes,botStats.reincidentes>0?'text-purple-400':'text-slate-500'],['Resolvidos auto',botStats.resolvidas,'text-emerald-400'],['Sem vínculo',botStats.pendentesCriados,'text-blue-400'],['Ignorados',botStats.ignorados,'text-slate-500']].map(([k,v,c],i)=>(
                        <div key={i} className="flex justify-between text-[10px] py-0.5 border-b border-slate-800/40 last:border-0">
                          <span className="text-slate-500">{k}</span><span className={`font-bold ${c}`}>{v}</span>
                        </div>
                      ))}
                      {botStats.maioresDivergencias?.length>0&&<>
                        <p className="text-[10px] text-red-400 font-bold mt-2 mb-1">── TOP IMPACTO NO FRETE ──</p>
                        {botStats.maioresDivergencias.slice(0,3).map((d,i)=><div key={i} className="text-[10px] text-slate-400 py-0.5"><span className="text-red-400 mr-1">{i+1}.</span>{d.itemId} → <span className="text-amber-400 font-bold">{d.diff}g</span></div>)}
                      </>}
                      <button onClick={()=>dlLogs(logs)} className="mt-2 w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase flex items-center justify-center gap-1"><Download className="w-3 h-3"/>Baixar Log</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Divergências */}
            {!termFS&&(
              <div className={`col-span-3 flex flex-col h-full`} style={{background:'var(--theme-card,#fff)'}}>
                <div className="px-5 py-3 border-b shrink-0" style={{borderColor:'var(--theme-card-border,#e2e8f0)'}}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold" style={{color:'var(--theme-text)'}}>Divergências</h3>
                      <span className="text-xs text-slate-400">{divSt.total} total</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selDiv.size>0&&(
                        <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                          <span className="text-[10px] font-bold text-blue-700 mr-0.5">{selDiv.size}</span>
                          <button onClick={()=>acaoLote('corrigido')} className="p-0.5 text-emerald-600 hover:bg-white rounded"><Check className="w-3 h-3"/></button>
                          <button onClick={()=>acaoLote('ignorado')} className="p-0.5 text-slate-500 hover:bg-white rounded"><EyeOff className="w-3 h-3"/></button>
                          <button onClick={()=>acaoLote('excluir')} className="p-0.5 text-red-500 hover:bg-white rounded"><Trash2 className="w-3 h-3"/></button>
                        </div>
                      )}
                      <button onClick={()=>{buscarDivs();buscarDivStats();}} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><RefreshCw className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>setDivFS(v=>!v)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">{divFS?<Minimize2 className="w-3.5 h-3.5"/>:<Maximize2 className="w-3.5 h-3.5"/>}</button>
                    </div>
                  </div>
                  {/* Filtros pill */}
                  <div className="flex items-center gap-1 flex-wrap mb-2.5">
                    {['PENDENTE','REINCIDENTE','CORRIGIDO','IGNORADO','TODOS'].map(s=>{
                      const c=STATUS_CFG[s];const cnt=s==='TODOS'?divSt.total:(divSt[s.toLowerCase()]||0);
                      return(
                        <button key={s} onClick={()=>{setFiltro(s);setSelDiv(new Set());}}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${filtro===s?`${c.bg} ${c.text} ${c.border}`:'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${filtro===s?c.dot:'bg-slate-300'}`}/>{c.label}{cnt>0&&<span className={`text-[10px] ${filtro===s?'bg-white/50 px-0.5 rounded':''}`}>{cnt}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                    <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por nome ou ID do anúncio..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 focus:bg-white transition-all"/>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loadDiv?(<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-400"/></div>)
                  :divsF.length===0?(<div className="flex flex-col items-center justify-center py-16 gap-3"><CheckCircle2 className="w-8 h-8 text-emerald-400"/><p className="text-sm font-semibold text-slate-400">{filtro==='TODOS'?'Nenhuma divergência':'Sem '+STATUS_CFG[filtro]?.label?.toLowerCase()+' no momento'}</p></div>)
                  :(
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                        <tr>
                          <th className="px-4 py-3 w-10"><button onClick={()=>selAll(divsF,selDiv,setSelDiv,'id')} className="text-slate-400">{selDiv.size===divsF.length&&divsF.length>0?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5"/>}</button></th>
                          <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left">Anúncio</th>
                          <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left">Divergência</th>
                          <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {divsF.map(div=>{
                          const cfg=STATUS_CFG[div.status]||STATUS_CFG.PENDENTE;const sel=selDiv.has(div.id);
                          return(
                            <tr key={div.id} className={`group hover:bg-slate-50/70 transition-colors ${sel?'bg-blue-50/30':''}`}>
                              <td className="px-4 py-3"><button onClick={()=>{const n=new Set(selDiv);sel?n.delete(div.id):n.add(div.id);setSelDiv(n);}} className="text-slate-400">{sel?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5"/>}</button></td>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-2">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`}/>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-800 max-w-[150px] truncate">{div.titulo||div.mlItemId}</p>
                                    <a href={`https://produto.mercadolivre.com.br/MLB-${(div.mlItemId||'').replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">{div.mlItemId}<ExternalLink className="w-2.5 h-2.5"/></a>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs text-slate-600 max-w-[200px] leading-snug">{div.motivo}</p>
                                {div.pesoMl>0&&div.pesoLocal>0&&(
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">ML:{div.pesoMl}g</span>
                                    <span className="text-slate-300">→</span>
                                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Real:{div.pesoLocal}g</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative">
                                  <div onMouseEnter={()=>setQv(div)} onMouseLeave={()=>setQv(null)}>
                                    <button onClick={()=>abrirDet(div)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Eye className="w-3.5 h-3.5"/></button>
                                    {qv?.id===div.id&&<QuickPop item={div}/>}
                                  </div>
                                  {div.status!=='CORRIGIDO'&&<button onClick={()=>acaoDiv(div.id,'corrigido')} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"><Check className="w-3.5 h-3.5"/></button>}
                                  {div.status!=='IGNORADO'&&<button onClick={()=>acaoDiv(div.id,'ignorado')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><EyeOff className="w-3.5 h-3.5"/></button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* NÃO VINCULADOS */}
        {tab==='pendentes'&&(
          <div className="flex flex-col h-full" style={{background:'var(--theme-card,#fff)'}}>
            <div className="px-6 py-3.5 border-b flex items-center justify-between shrink-0" style={{borderColor:'var(--theme-card-border,#e2e8f0)'}}>
              <div>
                <h3 className="text-sm font-semibold" style={{color:'var(--theme-text)'}}>Anúncios sem peso cadastrado</h3>
                <p className="text-xs text-slate-400 mt-0.5">{nvF.length} anúncio{nvF.length!==1?'s':''} aguardando vinculação</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/><input value={buscaNv} onChange={e=>setBuscaNv(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 w-48"/></div>
                {selNv.size>0&&(
                  <div className="flex items-center gap-0.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    <span className="text-[10px] font-bold text-amber-700 mr-1">{selNv.size}</span>
                    <button onClick={()=>acaoLoteNv('ignorado')} className="p-0.5 text-slate-500 hover:bg-white rounded"><EyeOff className="w-3 h-3"/></button>
                    <button onClick={()=>acaoLoteNv('excluir')} className="p-0.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3"/></button>
                  </div>
                )}
                <button onClick={buscarNv} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><RefreshCw className="w-3.5 h-3.5"/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {nvF.length===0?(<div className="flex flex-col items-center justify-center py-16 gap-2"><CheckCircle2 className="w-8 h-8 text-emerald-400"/><p className="text-sm font-semibold text-slate-400">Todos vinculados 🎉</p></div>):(
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                    <tr>
                      <th className="px-6 py-3 w-10"><button onClick={()=>selAll(nvF,selNv,setSelNv,'id')} className="text-slate-400">{selNv.size===nvF.length&&nvF.length>0?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5"/>}</button></th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left">Anúncio ML</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {nvF.map(p=>{const sel=selNv.has(p.id);return(
                      <tr key={p.id} className={`group hover:bg-slate-50/70 transition-colors ${sel?'bg-amber-50/30':''}`}>
                        <td className="px-6 py-3"><button onClick={()=>{const n=new Set(selNv);sel?n.delete(p.id):n.add(p.id);setSelNv(n);}} className="text-slate-400">{sel?<CheckSquare className="w-3.5 h-3.5 text-amber-500"/>:<Square className="w-3.5 h-3.5"/>}</button></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.thumbnail?<img src={p.thumbnail} className="w-10 h-10 object-cover rounded-lg border border-slate-200 flex-shrink-0" alt=""/>:<div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                            <div>
                              <p className="text-sm font-semibold text-slate-800 max-w-sm truncate">{p.nome}</p>
                              <a href={`https://produto.mercadolivre.com.br/MLB-${(p.mlItemId||'').replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">{p.mlItemId}<ExternalLink className="w-2.5 h-2.5"/></a>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div onMouseEnter={()=>setQv(p)} onMouseLeave={()=>setQv(null)} className="relative">
                              <button onClick={()=>abrirDet(p)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><Eye className="w-3.5 h-3.5"/></button>
                              {qv?.id===p.id&&<QuickPop item={p}/>}
                            </div>
                            <button onClick={()=>{abrirVinc(p);setQv(null);}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity" style={{background:'var(--theme-accent)'}}>
                              <Link2 className="w-3 h-3"/>Vincular
                            </button>
                            <button onClick={()=>acaoNv(p.id,'ignorado')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><EyeOff className="w-3.5 h-3.5"/></button>
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* CATÁLOGO */}
        {tab==='catalogo'&&(
          <div className="grid grid-cols-5 h-full">
            <div className="col-span-2 border-r flex flex-col h-full" style={{borderColor:'var(--theme-card-border,#e2e8f0)',background:'var(--theme-sidebar,#f8fafc)'}}>
              <div className="px-5 py-3.5 border-b" style={{borderColor:'var(--theme-card-border,#e2e8f0)'}}>
                <h3 className="text-sm font-semibold" style={{color:'var(--theme-text)'}}>{editId?'Editar Produto':'Novo Produto'}</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <form onSubmit={submitProd} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">SKU *</label><input required value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400"/></div>
                    <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Categoria</label><input value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" list="cats"/><datalist id="cats">{cats.map(c=><option key={c} value={c}/>)}</datalist></div>
                  </div>
                  <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Nome *</label><input required value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400"/></div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1"><Weight className="w-3.5 h-3.5"/>Peso Unitário *</p>
                    <div className="flex gap-2">
                      <input required type="number" step="any" min="0" value={form.peso} onChange={e=>setForm({...form,peso:e.target.value})} className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-semibold outline-none focus:border-blue-500"/>
                      <select value={form.unidadePeso} onChange={e=>setForm({...form,unidadePeso:e.target.value})} className="px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-bold text-blue-700 outline-none"><option value="g">g</option><option value="kg">kg</option></select>
                    </div>
                  </div>
                  <button type="submit" disabled={loadProd} className="w-full py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-all" style={{background:'var(--theme-accent)'}}>{loadProd?'Salvando...':'Salvar Produto'}</button>
                  {editId&&<button type="button" onClick={()=>{setForm(FORM_INICIAL);setEditId(null);}} className="w-full py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200">Cancelar</button>}
                </form>
              </div>
            </div>
            <div className="col-span-3 flex flex-col h-full" style={{background:'var(--theme-card,#fff)'}}>
              <div className="px-5 py-3 border-b flex items-center justify-between shrink-0" style={{borderColor:'var(--theme-card-border,#e2e8f0)'}}>
                <div className="bg-slate-100 rounded-lg p-0.5 flex gap-0.5">
                  <button onClick={()=>setTipoCat('BASE')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${tipoCat==='BASE'?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}>Base</button>
                  <button onClick={()=>setTipoCat('ML')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${tipoCat==='ML'?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}>Vinculados ML</button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/><input value={srchProd} onChange={e=>setSrchProd(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400 w-44"/></div>
                  {selProd.size>0&&<button onClick={excluirLoteP} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5"/></button>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                    <tr>
                      <th className="px-4 py-3 w-10"><button onClick={()=>selAll(prodsF,selProd,setSelProd)} className="text-slate-400">{selProd.size===prodsF.length&&prodsF.length>0?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5"/>}</button></th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-left">Produto</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-center">Peso</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {prodsF.length===0&&<tr><td colSpan={4} className="py-12 text-center text-sm text-slate-400">Catálogo vazio</td></tr>}
                    {prodsF.map(p=>{const sel=selProd.has(p.id);return(
                      <tr key={p.id} className={`group hover:bg-slate-50/70 transition-colors ${sel?'bg-blue-50/30':''}`}>
                        <td className="px-4 py-3"><button onClick={()=>{const n=new Set(selProd);sel?n.delete(p.id):n.add(p.id);setSelProd(n);}} className="text-slate-400">{sel?<CheckSquare className="w-3.5 h-3.5 text-blue-600"/>:<Square className="w-3.5 h-3.5"/>}</button></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {p.thumbnail?<img src={p.thumbnail} className="w-9 h-9 rounded-lg object-cover border border-slate-100 flex-shrink-0" alt=""/>:<div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-3.5 h-3.5 text-slate-300"/></div>}
                            <div>
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.sku}</span>
                                {p.eKit&&<span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">KIT</span>}
                                {p.mlItemId&&<a href={`https://produto.mercadolivre.com.br/MLB-${(p.mlItemId||'').replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5 hover:bg-emerald-100">{p.mlItemId}<ExternalLink className="w-2 h-2"/></a>}
                              </div>
                              <p className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">{p.nome}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center"><span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">{p.pesoGramas}g</span></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative">
                            <div onMouseEnter={()=>setQv(p)} onMouseLeave={()=>setQv(null)}>
                              <button onClick={()=>abrirDet(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Eye className="w-3.5 h-3.5"/></button>
                              {qv?.id===p.id&&<QuickPop item={p}/>}
                            </div>
                            <button onClick={()=>{setForm({sku:p.sku,nome:p.nome,preco:p.preco,mlItemId:p.mlItemId||'',peso:p.pesoGramas,unidadePeso:'g',alturaCm:p.alturaCm||'',larguraCm:p.larguraCm||'',comprimentoCm:p.comprimentoCm||'',eKit:p.eKit,categoria:p.categoria||'',plataforma:p.plataforma});setEditId(p.id);}} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600"><Settings className="w-3.5 h-3.5"/></button>
                            {p.mlItemId&&<button onClick={()=>desvincular(p.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><Unlink className="w-3.5 h-3.5"/></button>}
                            <button onClick={()=>excluirProd(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAIS PORTAL */}
      {detModal&&(
        <ModalOverlay onClose={()=>setDetModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{width:'720px',maxWidth:'95vw',maxHeight:'88vh'}}>
            <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Box className="w-4 h-4 text-blue-500"/>Detalhes do Anúncio</h3>
              <button onClick={()=>setDetModal(null)} className="text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {loadDet?(<div className="flex flex-col items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-blue-400"/><p className="text-xs text-slate-400 mt-2">Buscando dados...</p></div>)
              :detData?(
                <div className="grid grid-cols-5 gap-5">
                  <div className="col-span-2 space-y-3">
                    <div className="bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center h-48">{detData.pictures?.length>0?<img src={detData.pictures[0].url} className="max-h-full max-w-full object-contain rounded-lg" alt=""/>:<ImageIcon className="w-10 h-10 text-slate-200"/>}</div>
                    {detData.pictures?.length>1&&<div className="flex gap-1.5 overflow-x-auto pb-1">{detData.pictures.slice(1,5).map((pic,i)=><img key={i} src={pic.url} className="w-12 h-12 object-cover rounded-lg border border-slate-200 flex-shrink-0" alt=""/>)}</div>}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                      <a href={`https://produto.mercadolivre.com.br/MLB-${(detData.id||'').replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded hover:bg-blue-100 inline-flex items-center gap-1">{detData.id}<ExternalLink className="w-2.5 h-2.5"/></a>
                      <h2 className="text-sm font-semibold text-slate-800 mt-2 leading-snug">{detData.title}</h2>
                      <p className="text-2xl font-bold text-emerald-600 mt-1.5">R$ {detData.price}</p>
                      <a href={detData.permalink} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold text-slate-900 hover:opacity-90" style={{background:'#FFE600'}}><ExternalLink className="w-3.5 h-3.5"/>Ver no ML</a>
                    </div>
                  </div>
                  <div className="col-span-3 space-y-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><FileText className="w-3 h-3"/>Descrição</h4>
                      <div className="text-xs text-slate-700 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">{detData.description_text||'Sem descrição.'}</div>
                    </div>
                    {detData.attributes?.filter(a=>a.value_name).length>0&&(
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><LayoutList className="w-3 h-3"/>Ficha Técnica</h4>
                        <div className="divide-y divide-slate-50">
                          {detData.attributes.filter(a=>a.value_name).slice(0,12).map(a=>(
                            <div key={a.id} className="flex items-center gap-2 py-1.5">
                              <span className="text-[10px] text-slate-400 w-28 shrink-0 truncate">{a.name}</span>
                              <span className="text-xs text-slate-700 font-medium truncate">{a.value_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ):(<div className="text-center py-16 text-slate-400 text-sm">{detModal.mlItemId?'Falha ao obter dados':'Sem ID do ML vinculado'}</div>)}
            </div>
          </div>
        </ModalOverlay>
      )}

      {vincModal&&(
        <ModalOverlay onClose={()=>setVincModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{width:'440px',maxWidth:'95vw',maxHeight:'88vh'}}>
            <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Link2 className="w-4 h-4 text-emerald-500"/>Vincular Anúncio</h3>
              <button onClick={()=>setVincModal(null)} className="text-slate-400 hover:text-red-500"><XCircle className="w-4 h-4"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 flex gap-3 items-center">
                {vincModal.thumbnail?<img src={vincModal.thumbnail} className="w-12 h-12 object-cover rounded-lg border border-slate-100" alt=""/>:<div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300"/></div>}
                <div>
                  <a href={`https://produto.mercadolivre.com.br/MLB-${(vincModal.mlItemId||'').replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">{vincModal.mlItemId}<ExternalLink className="w-2 h-2"/></a>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5 line-clamp-2">{vincModal.nome}</p>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">1. Montar Kit</label>
                <div className="relative mb-2"><Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400"/><input value={buscaKit} onChange={e=>setBuscaKit(e.target.value)} placeholder="Buscar produto base..." className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400"/></div>
                {buscaKit&&<div className="mb-2 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  {baseKit.length===0?<p className="p-3 text-xs text-slate-400">Nenhum resultado</p>:baseKit.map(p=>(
                    <div key={p.id} className="p-2.5 border-b border-slate-50 last:border-0 flex justify-between items-center hover:bg-slate-50">
                      <span className="text-sm font-medium text-slate-700">{p.nome} <span className="text-[10px] text-slate-400">({p.pesoGramas}g)</span></span>
                      <button onClick={()=>{if(!kit.find(c=>c.p.id===p.id))setKit([...kit,{p,q:1}]);setBuscaKit('');}} className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg">Add</button>
                    </div>
                  ))}
                </div>}
                <div className="space-y-1.5">
                  {kit.map(item=>(
                    <div key={item.p.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl">
                      <span className="text-sm font-medium text-slate-700 flex-1">{item.p.nome}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                          <button onClick={()=>{const q=item.q-1;if(q<=0)setKit(kit.filter(c=>c.p.id!==item.p.id));else setKit(kit.map(c=>c.p.id===item.p.id?{...c,q}:c));}} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-red-500 font-bold border-r border-slate-200">−</button>
                          <span className="w-7 text-center text-xs font-bold">{item.q}</span>
                          <button onClick={()=>setKit(kit.map(c=>c.p.id===item.p.id?{...c,q:item.q+1}:c))} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:text-blue-500 font-bold border-l border-slate-200">+</button>
                        </div>
                        <span className="text-xs font-bold text-emerald-600 w-12 text-right">{item.p.pesoGramas*item.q}g</span>
                      </div>
                    </div>
                  ))}
                </div>
                {kit.length>0&&<div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl flex justify-between text-xs font-bold text-blue-700"><span>Peso total:</span><span>{kit.reduce((s,c)=>s+c.p.pesoGramas*c.q,0)}g</span></div>}
              </div>
              {kit.length===0&&<div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">2. Ou Peso Fixo</label>
                <div className="flex gap-2">
                  <input type="number" step="any" min="0" value={pesoFix} onChange={e=>setPesoFix(e.target.value)} placeholder="Ex: 500" className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400"/>
                  <select value={unidFix} onChange={e=>setUnidFix(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none"><option value="g">g</option><option value="kg">kg</option></select>
                </div>
              </div>}
            </div>
            <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button onClick={()=>setVincModal(null)} className="px-5 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={salvarVinc} disabled={kit.length===0&&!pesoFix} className="px-6 py-2 rounded-xl text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400 transition-all" style={kit.length>0||pesoFix?{background:'var(--theme-accent)'}:{}}> Confirmar</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {resumoOpen&&(
        <ModalOverlay onClose={()=>setResumoOpen(false)} side="right">
          <div className="bg-white shadow-2xl flex flex-col" style={{width:'380px',height:'100%'}}>
            <div className="px-5 py-4 border-b flex justify-between items-center shrink-0 text-white" style={{background:'var(--theme-accent)'}}>
              <h3 className="font-bold text-sm flex items-center gap-2"><Sparkles className="w-4 h-4"/>Resumo Executivo IA</h3>
              <button onClick={()=>setResumoOpen(false)} className="hover:opacity-70"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {loadResumo?(<div className="flex flex-col items-center justify-center py-14"><Loader2 className="w-6 h-6 animate-spin mb-2" style={{color:'var(--theme-accent)'}}/><p className="text-xs text-slate-400">Gerando análise detalhada...</p></div>)
              :resumoTxt?(<>
                <div className="text-sm text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-xl p-4" dangerouslySetInnerHTML={{__html:resumoTxt}}/>
                <button onClick={()=>dlTxt(resumoTxt,`resumo_ml_${new Date().toISOString().slice(0,10)}.txt`)} className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"><Download className="w-3.5 h-3.5"/>Baixar TXT</button>
              </>):(<p className="text-center text-slate-400 text-sm py-12">Clique em "Gerar" para criar o relatório.</p>)}
              {resumoHist.length>0&&<div className="mt-5 pt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><History className="w-3 h-3"/>Histórico</h4>
                <div className="space-y-1.5">
                  {resumoHist.map(h=>(
                    <button key={h.id} onClick={()=>setResumoTxt(h.conteudo)} className="w-full text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 transition-colors">
                      <p className="text-[10px] font-bold mb-0.5" style={{color:'var(--theme-accent)'}}>{new Date(h.createdAt).toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-slate-500 line-clamp-2" dangerouslySetInnerHTML={{__html:h.conteudo}}/>
                    </button>
                  ))}
                </div>
              </div>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 shrink-0">
              <button onClick={gerarResumo} disabled={loadResumo} className="w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-50" style={{background:'var(--theme-accent)'}}>{loadResumo?'Gerando...':'Gerar Novo Relatório'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {dicasOpen&&(
        <ModalOverlay onClose={()=>setDicasOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{width:'400px',maxWidth:'95vw'}}>
            <div className="px-5 py-4 border-b flex justify-between items-center text-white" style={{background:'var(--theme-accent)'}}>
              <h3 className="font-bold text-sm flex items-center gap-2"><HelpCircle className="w-4 h-4"/>Como funciona</h3>
              <button onClick={()=>setDicasOpen(false)} className="hover:opacity-70"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                {icon:<Box className="w-3.5 h-3.5 text-amber-500"/>,t:'Não Vinculados',d:'Anúncios do ML sem peso cadastrado. Vincule ao produto base ou informe o peso fixo.'},
                {icon:<Package className="w-3.5 h-3.5 text-blue-500"/>,t:'Base vs Anúncios',d:'Base: peça física unitária. Anúncio ML: pacote vendido (pode ser kit).'},
                {icon:<AlertTriangle className="w-3.5 h-3.5 text-purple-500"/>,t:'Reincidentes',d:'Divergências corrigidas que voltaram. O ML atualizou o peso novamente.'},
                {icon:<Calendar className="w-3.5 h-3.5 text-emerald-500"/>,t:'Auto-varredura',d:'Configure o intervalo nas Configurações para manter o catálogo sincronizado.'},
              ].map((d,i)=>(
                <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                  <h4 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">{d.icon}{d.t}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{d.d}</p>
                </div>
              ))}
            </div>
          </div>
        </ModalOverlay>
      )}

      {cfgOpen&&(
        <ModalOverlay onClose={()=>setCfgOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{width:'340px',maxWidth:'95vw'}}>
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Settings className="w-4 h-4"/>Configurações</h3>
              <button onClick={()=>setCfgOpen(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Conta Mercado Livre</p>
                {!mlOk?(<button onClick={conectar} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-slate-900 hover:opacity-90" style={{background:'#FFE600'}}><ShoppingBag className="w-4 h-4"/>Conectar Conta ML</button>):(
                  <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                    <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4"/>{mlNick||'Vinculada'}</span>
                    <button onClick={desconectarML} className="text-xs font-bold text-red-500 hover:text-red-700">Desconectar</button>
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Varredura Automática</p>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl cursor-pointer hover:bg-slate-100 mb-3" onClick={()=>salvarAg(!agend?.ativo,intv)}>
                  <div><p className="text-sm font-semibold text-slate-800">{agend?.ativo?'Ativa':'Inativa'}</p><p className="text-xs text-slate-400">{agend?.ativo?`Próxima: ${fmt(agend?.proximaExecucao)}`:'Clique para ativar'}</p></div>
                  <div className={`rounded-full relative transition-colors ${agend?.ativo?'bg-emerald-500':'bg-slate-300'}`} style={{height:'22px',width:'42px'}}>
                    <div className={`absolute top-0.5 bg-white rounded-full transition-all shadow ${agend?.ativo?'left-[22px]':'left-0.5'}`} style={{width:'18px',height:'18px'}}/>
                  </div>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Intervalo</p>
                <div className="grid grid-cols-4 gap-1">
                  {INTERVALOS.map(o=>(
                    <button key={o.value} onClick={()=>{setIntv(o.value);if(agend?.ativo)salvarAg(true,o.value);}}
                      className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${intv===o.value?'text-white border-transparent':'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                      style={intv===o.value?{background:'var(--theme-accent)',borderColor:'var(--theme-accent)'}:{}}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {!agend?.ativo&&<button onClick={()=>salvarAg(true,intv)} disabled={savingAg} className="w-full py-2 mt-2 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50">{savingAg?'Salvando...':'Ativar Agora'}</button>}
              </div>
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl cursor-pointer hover:bg-slate-100" onClick={()=>setModoLento(!modoLento)}>
                  <div><p className="text-sm font-semibold text-slate-800">Standby Anti-Timeout</p><p className="text-xs text-slate-400">Pausas entre buscas para evitar bloqueio.</p></div>
                  <div className={`rounded-full relative transition-colors ${modoLento?'bg-emerald-500':'bg-slate-300'}`} style={{height:'22px',width:'42px'}}>
                    <div className={`absolute top-0.5 bg-white rounded-full transition-all shadow ${modoLento?'left-[22px]':'left-0.5'}`} style={{width:'18px',height:'18px'}}/>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}