// src/pages/MlResearch.jsx 
// Fixes: Processamento de Stream (SSE) para evitar erro de JSON inválido no terminal.
// Fixes: "Limpar" e "Remover" agora enviam os itens automaticamente para a aba Arquivados.
// Correção: Inclusão do componente ResumoGeral e tratamento de bordas CSS para evitar warnings.

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Search, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  XCircle, Clock, ShoppingBag, Star, TrendingUp, TrendingDown, Package,
  Download, Zap, ArrowLeft, Users, Activity, Filter, X, Medal, Award,
  Archive, ArchiveRestore, History, CheckSquare, Square, Eye,
  DollarSign, Scale, Tag, Percent, BarChart2, ChevronDown, HelpCircle,
  Sparkles, Send, MessageSquare, BarChart, LineChart, Globe, ChevronRight,
  FileUp, FileText, FileSpreadsheet, FileJson, Printer, Calendar, ListChecks,
  ZoomIn, ZoomOut, Maximize2, PieChart, ArrowDownAZ, ArrowUpZA, ChevronLeft, ChevronRight as ChevronRightIcon,
  AlertTriangle, TimerReset,
} from 'lucide-react';
import AnalyizStar from '../components/Analyizstar';

const API_BASE_URL = 'http://localhost:3000';
const LS_KEY       = 'mlresearch_itens_v2';
const ITENS_POR_PAGINA = 30;

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

function parseVendas(val) {
  if (!val || val === '—') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).toLowerCase();
  let num = parseFloat(s.replace(/[^\d.,]/g, '').replace(',', '.'));
  if (isNaN(num)) return 0;
  if (s.includes('mil') || s.includes('k')) num *= 1000;
  return Math.floor(num);
}

function gerarLinkAnuncio(mlbId, ehCatalogo, urlOriginal) {
  if (urlOriginal && urlOriginal.startsWith('http')) return urlOriginal;
  if (!mlbId) return '#';
  const num = mlbId.replace(/^MLB/i, '');
  if (ehCatalogo) return `https://www.mercadolivre.com.br/p/MLB${num}`;
  return `https://produto.mercadolivre.com.br/MLB-${num}`;
}

function gerarLinkOpcoesCompra(mlbId) {
  if (!mlbId) return '#';
  const num = mlbId.replace(/^MLB/i, '');
  return `https://www.mercadolivre.com.br/p/MLB${num}/s`;
}

function gerarLinkVendedor(nome) { return (!nome || nome === '—') ? '#' : `https://perfil.mercadolivre.com.br/${encodeURIComponent(nome)}`; }

function fmt(v) { return (!v && v !== 0) ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v); }
function fmtDate(val) { try { const d=new Date(val); return isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch { return '—'; } }
function urlShort(url, max=44) { try { const u=new URL(url); const p=(u.pathname.split('/').filter(Boolean)[0]||'').substring(0,max); return `${u.hostname}/${p}${p.length>=max?'…':''}`; } catch { return url.length>max?url.substring(0,max)+'…':url; } }

const STATUS_CFG = {
  pendente:   { label:'Pendente',   color:'#d97706', bg:'#fef3c7', border:'#fde68a', barColor:'#fbbf24', Icon:Clock },
  analisando: { label:'Analisando', color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe', barColor:null,      Icon:Loader2 },
  concluido:  { label:'Concluído',  color:'#059669', bg:'#ecfdf5', border:'#a7f3d0', barColor:'#34d399', Icon:CheckCircle2 },
  erro:       { label:'Erro',       color:'#dc2626', bg:'#fee2e2', border:'#fca5a5', barColor:'#f87171', Icon:XCircle },
  fila:       { label:'Na fila',    color:'#7c3aed', bg:'#f3e8ff', border:'#d8b4fe', barColor:'#a78bfa', Icon:Clock },
};

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

function obterStatsMercado(itensLista) {
  const sellersMap = new Map();
  let precos = [];

  itensLista.forEach(item => {
    if (item.status !== 'concluido' || !item.dados) return;
    const d = item.dados;
    const m = item.metaPlanilha || {};

    if (d.preco > 0) precos.push(d.preco);

    const addSeller = (nome, vendas) => {
      if (!nome || nome === '—') return;
      const v = parseVendas(vendas);
      if (!sellersMap.has(nome)) {
        sellersMap.set(nome, { nome, adsCount: 1, totalSales: v });
      } else {
        const s = sellersMap.get(nome);
        s.adsCount += 1;
        s.totalSales += v;
      }
    };

    const pVend = m.vendedor && m.vendedor !== '—' ? m.vendedor : (d.seller?.nome || '—');
    const pVendas = m.vendas && m.vendas !== '—' ? m.vendas : (d.vendas || d.vendidos || d.seller?.vendas || 0);
    addSeller(pVend, pVendas);

    (d.concorrentes || []).forEach(c => { addSeller(c.nome, c.vendas || c.vendidos || 0); });
  });

  const sellersLista = Array.from(sellersMap.values()).sort((a,b) => b.totalSales - a.totalSales);

  return {
     totalAnuncios: itensLista.length,
     menorPreco: precos.length ? Math.min(...precos) : null,
     mediaPreco: precos.length ? precos.reduce((a,b)=>a+b,0)/precos.length : null,
     totalVendedores: sellersMap.size,
     totalVendas: sellersLista.reduce((acc, s) => acc + s.totalSales, 0),
     sellersLista
  };
}

function GraficoBarras({ dados, titulo, corAtiva = '#3b82f6' }) {
  if (!dados || !dados.length) return null;
  const maxVal = Math.max(...dados.map(d => d.valor));
  const W = 340, barH = 22, gap = 6, marginLeft = 80;
  const H = dados.length * (barH + gap) + 30;
  return (
    <div style={{ marginTop: 12 }}>
      {titulo && <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', opacity: 0.4, marginBottom: 6 }}>{titulo}</p>}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {dados.map((d, i) => {
          const y = 20 + i * (barH + gap);
          const w = maxVal > 0 ? ((d.valor / maxVal) * (W - marginLeft - 20)) : 0;
          const cor = d.cor || (i === 0 ? '#10b981' : i === dados.length - 1 ? '#ef4444' : corAtiva);
          return (
            <g key={i}>
              <text x={marginLeft - 6} y={y + barH / 2 + 4} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.6} style={{ fontFamily: 'monospace' }}>{(d.label || '').substring(0, 10)}</text>
              <rect x={marginLeft} y={y} width={Math.max(w, 2)} height={barH} rx={4} fill={cor} opacity={0.85} />
              <text x={marginLeft + w + 6} y={y + barH / 2 + 4} fontSize={10} fill="currentColor" fontWeight="bold">{d.rotulo || fmt(d.valor)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Topico({ titulo, children, defaultOpen = false, icon = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:'1px solid var(--theme-card-border)', borderRadius:10, overflow:'hidden', marginBottom:6 }}>
      <button onClick={() => setOpen(v => !v)} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'var(--theme-sidebar)', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer', color:'var(--theme-text)', textAlign:'left' }}>
        {icon && <span style={{ fontSize:13 }}>{icon}</span>}<span style={{ flex:1, fontSize:12, fontWeight:700 }}>{titulo}</span><ChevronDown size={13} style={{ opacity:0.4, transition:'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}/>
      </button>
      {open && <div style={{ padding:'8px 12px', fontSize:'inherit', lineHeight:1.5, color:'var(--theme-text)', background:'var(--theme-card)' }}>{children}</div>}
    </div>
  );
}

function RelatorioTopicos({ html, zoomBase = 12 }) {
  if (!html) return null;
  let textoTratado = html.replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/<br\s*\/?>/gi, '\n').replace(/\n{3,}/g, '\n\n');
  const secoes = [];
  const partes = textoTratado.split(/(?=\n<b>|^<b>)/gm).filter(Boolean);
  if (partes.length > 1) {
    partes.forEach((parte, i) => {
      const tituloMatch = parte.match(/^[\n]*<b>([^<]+)<\/b>/);
      if (tituloMatch) {
        secoes.push({ titulo: tituloMatch[1].trim(), html: parte.replace(/^[\n]*<b>[^<]+<\/b>/, '').trim().replace(/\n/g, '<br>'), open: i === 0 });
      } else {
        secoes.push({ titulo: null, html: parte.replace(/\n/g, '<br>'), open: true });
      }
    });
  }
  const emojiParaTitulo = t => {
    const l = (t || '').toLowerCase();
    if (l.includes('panorama') || l.includes('competitiv')) return '📊';
    if (l.includes('oportunidade') || l.includes('precific')) return '💡';
    if (l.includes('sugest') || l.includes('anúncio')) return '✏️';
    if (l.includes('veredito') || l.includes('ação') || l.includes('final')) return '🏁';
    if (l.includes('vendedor') || l.includes('concorrente')) return '👥';
    if (l.includes('preço') || l.includes('preco')) return '💰';
    if (l.includes('tendência') || l.includes('web')) return '🌐';
    return '📌';
  };
  const containerStyle = { fontSize: `${zoomBase}px` };
  if (secoes.length > 1) {
    return <div style={{ display:'flex', flexDirection:'column', gap:0, ...containerStyle }}>{secoes.map((s, i) => s.titulo ? (<Topico key={i} titulo={s.titulo} icon={emojiParaTitulo(s.titulo)} defaultOpen={i === 0}><div dangerouslySetInnerHTML={{ __html: s.html }}/></Topico>) : (<div key={i} style={{ lineHeight:1.5, padding:'4px 0', color:'var(--theme-text)' }} dangerouslySetInnerHTML={{ __html: s.html.replace(/\n/g,'<br>') }}/>))}</div>;
  }
  return <div style={{ lineHeight:1.5, ...containerStyle }} dangerouslySetInnerHTML={{ __html: textoTratado.replace(/\n/g, '<br>') }}/>;
}

function plainTextFromHtml(html) {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<li>/gi, '  • ').replace(/<[^>]+>/g, '').trim();
}

function exportarDadosComplexos(formato, targetList, tituloRelatorio = 'Auditoria ML', relatorioHtml = null, paginaFiltrada = 'todas') {
  if ((!targetList || !targetList.length) && !relatorioHtml) return alert('Nenhum dado para exportar.');
  
  const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const horaHoje = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '');
  const cleanTitle = tituloRelatorio.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').substring(0,25);
  const sufixoPagina = paginaFiltrada !== 'todas' ? `_Pag${paginaFiltrada}` : '';
  const nomeArquivo = `Analyiz_${cleanTitle}${sufixoPagina}_${dataHoje}_${horaHoje}`;

  let linhasProcessadas = [];
  
  targetList.forEach(i => {
    const d = i.dados || i; 
    const m = i.metaPlanilha || {};
    const refMlb = i.mlbId || d.mlbId || '';
    const refTit = d.titulo || '';
    const refUrl = i.url || gerarLinkAnuncio(refMlb, d.ehCatalogo);

    const pagItem = String(d.pagina || m.pagina || '1');
    if (paginaFiltrada === 'todas' || pagItem === String(paginaFiltrada)) {
      const precoSem = d.precoOriginal || m.precoSemPromo || d.preco;
      const precoCom = d.preco || 0;
      const desconto = d.desconto || m.promo || (precoSem && precoSem > precoCom
        ? `${Math.round((1 - precoCom/precoSem)*100)}% OFF`
        : '0% OFF');

      linhasProcessadas.push({
        nomeAnuncio: refTit, mbl: refMlb, urlOrigem: refUrl, pagina: pagItem, posicao: String(d.posicao || m.posicao || '1'),
        precoSemPromo: precoSem ? String(precoSem).replace('.', ',') : String(precoCom).replace('.', ','),
        precoComPromo: String(precoCom).replace('.', ','), promo: desconto, tipoAnuncio: d.tipoAnuncio || m.tipoAnuncio || 'Clássico',
        envio: d.envio || m.envio || (d.freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios'),
        vendedor: d.seller?.nome || m.vendedor || '—', vendas: d.vendas || m.vendas || '—',
      });
    }

    (d.concorrentes || []).forEach(c => {
      const pagConc = String(c.pagina || '1');
      if (paginaFiltrada === 'todas' || pagConc === String(paginaFiltrada)) {
        const cPrecoSem = c.precoOriginal || c.preco;
        const cPrecoCom = c.preco || 0;
        const cDesconto = c.desconto || (cPrecoSem && cPrecoSem > cPrecoCom
          ? `${Math.round((1 - cPrecoCom/cPrecoSem)*100)}% OFF`
          : '0% OFF');

        linhasProcessadas.push({
          nomeAnuncio: c.titulo || refTit, mbl: c.mlbId || refMlb,
          urlOrigem: c.link || gerarLinkAnuncio(c.mlbId || refMlb, d.ehCatalogo, c.link),
          pagina: pagConc, posicao: String(c.posicao || '—'),
          precoSemPromo: String(cPrecoSem || cPrecoCom).replace('.', ','),
          precoComPromo: String(cPrecoCom).replace('.', ','), promo: cDesconto,
          tipoAnuncio: c.tipoAnuncio || 'Clássico', envio: c.envio || (c.freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios'),
          vendedor: c.nome || '—', vendas: c.vendas || c.vendidos || '—',
        });
      }
    });
  });

  if (linhasProcessadas.length === 0) {
    return alert(`Nenhum anúncio encontrado para a Página ${paginaFiltrada}.`);
  }

  if (formato === 'xls' || formato === 'csv') {
    const cabecalho = 'Nome do Anúncio\tMBL\tURL Origem\tPágina\tPosição\tPreço Sem Promo\tPreço Com Promo\t% Promo\tTipo Anúncio\tEnvio\tVendedor\tVendas';
    const rows = [cabecalho];
    
    linhasProcessadas.forEach(linha => {
      const _nome = `"${(linha.nomeAnuncio||'').replace(/"/g,'""')}"`;
      const _vendedor = `"${(linha.vendedor||'').replace(/"/g,'""')}"`;
      rows.push([
        _nome, linha.mbl, linha.urlOrigem, linha.pagina, linha.posicao,
        `"${linha.precoSemPromo}"`, `"${linha.precoComPromo}"`, linha.promo,
        linha.tipoAnuncio, linha.envio, _vendedor, linha.vendas,
      ].join('\t'));
    });

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${nomeArquivo}.csv`;
    link.click();
  } else if (formato === 'pdf') {
    let htmlPrint = `<html><head><title>${nomeArquivo}</title></head><body><h2>${tituloRelatorio}</h2><table>...</table></body></html>`;
    const pw = window.open('', '_blank');
    pw.document.write(htmlPrint);
    pw.document.close();
    setTimeout(() => { pw.focus(); pw.print(); }, 500);
  }
}

function MenuExportacao({ onExport, disabled, label="Exportar", paginaFiltrada = 'todas', paginasDisponiveis = [] }) {
  const [aberto, setAberto] = useState(false);
  const [paginaExport, setPaginaExport] = useState(paginaFiltrada);
  const btnRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  useEffect(() => { setPaginaExport(paginaFiltrada); }, [paginaFiltrada]);

  const toggleMenu = () => {
    if (!aberto && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setAberto(!aberto);
  };

  return (
    <>
      <button ref={btnRef} onClick={toggleMenu} disabled={disabled} style={{ padding:'6px 12px',borderRadius:8,border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textTransform:'uppercase',cursor:disabled?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6, opacity:disabled?0.4:1 }}>
        <Download size={14}/> {label} <ChevronDown size={12}/>
      </button>
      {aberto && !disabled && (
        <Portal>
          <div onClick={()=>setAberto(false)} style={{ position:'fixed', inset:0, zIndex:9999990 }}/>
          <div onClick={e=>e.stopPropagation()} style={{ position:'fixed', top: coords.top, right: coords.right, zIndex:9999991, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', borderRadius:12, padding:8, display:'flex', flexDirection:'column', gap:4, boxShadow:'0 10px 40px rgba(0,0,0,0.5)', minWidth:200 }}>
            <p style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', opacity:0.4, padding:'4px 8px' }}>Filtrar por Página</p>
            <select value={paginaExport} onChange={e => setPaginaExport(e.target.value)} style={{ margin:'0 8px 4px', padding:'6px 8px', borderRadius:8, border:'1px solid var(--theme-card-border)', background:'var(--theme-sidebar)', color:'var(--theme-text)', fontSize:11, fontWeight:700 }}>
              <option value="todas">Todas as Páginas</option>
              {paginasDisponiveis.map(p => (p !== 'todas' && <option key={p} value={String(p)}>Somente Página {p}</option>))}
            </select>
            <button onClick={()=>{ onExport('csv', paginaExport); setAberto(false); }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'transparent', border:'none', borderRadius:6, cursor:'pointer', color:'var(--theme-text)', fontSize:11, fontWeight:700 }}>
              <FileSpreadsheet size={14} style={{ color:'#10b981' }}/> Excel (.csv)
            </button>
          </div>
        </Portal>
      )}
    </>
  );
}

function ResumoGeral({ itens, onAbrirRaioX }) {
  const concluidos = itens.filter(i => i.status === 'concluido' && i.dados);
  if (concluidos.length === 0) return null;
  const precos = concluidos.map(i => i.dados.preco).filter(v => v > 0);
  const mediaPreco = precos.length ? precos.reduce((a, b) => a + b, 0) / precos.length : 0;
  return (
    <div style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-card-border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', gap: 24 }}>
        <div><p style={{ fontSize: 10, fontWeight: 900, opacity: 0.5 }}>Anúncios Analisados</p><p style={{ fontSize: 20, fontWeight: 900, color: '#3b82f6' }}>{concluidos.length}</p></div>
        <div><p style={{ fontSize: 10, fontWeight: 900, opacity: 0.5 }}>Preço Médio Global</p><p style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>{fmt(mediaPreco)}</p></div>
      </div>
      <button onClick={onAbrirRaioX} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none', fontWeight: 900, cursor: 'pointer' }}>
        <PieChart size={16} /> Raio-X do Mercado
      </button>
    </div>
  );
}

function ModalAnuncio({ item, onClose, onDispararPesquisa }) {
  const [tab, setTab] = useState('vendedores');
  if (!item) return null;
  const d = item.dados;
  const m = item.metaPlanilha || {};
  const cfg = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const conc = d?.concorrentes || [];
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999990,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:860,maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid rgba(139, 92, 246, 0.3)',borderRadius:20,display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(135deg, var(--theme-header), #1e1b4b)', padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
             <h2 style={{ color:'#fff', margin:0 }}>{d?.titulo || 'Anúncio'}</h2>
             <button onClick={onClose} style={{ color:'#fff', background:'rgba(0,0,0,0.2)', border:'none', borderRadius:'50%', padding:6, cursor:'pointer' }}><X size={20}/></button>
          </div>
          <div style={{ display:'flex', borderBottom:'1px solid var(--theme-card-border)', background:'var(--theme-sidebar)' }}>
            {['vendedores', 'info', 'ficha', 'achados'].map(k => (
              <button key={k} onClick={()=>setTab(k)} style={{ flex:1, padding:12, borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: tab===k?'3px solid var(--theme-accent)':'3px solid transparent', background:'none', color:tab===k?'var(--theme-accent)':'var(--theme-text)', fontWeight:900, cursor:'pointer' }}>{k.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:20 }} className="ia-scroll">
            {tab==='vendedores' && (
              conc.map((c,idx)=>(<div key={idx} style={{ padding:10, borderBottom:'1px solid var(--theme-card-border)' }}>{c.nome} - {fmt(c.preco)}</div>))
            )}
            {tab==='achados' && <div style={{ fontFamily:'monospace' }}>{d?.debugLog?.map((l,i)=><div key={i}>{l}</div>)}</div>}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function CardResultado({ item, onRemover, selecionado, onSel, onAbrirModal }) {
  const cfg=STATUS_CFG[item.status]||STATUS_CFG.pendente;
  const d=item.dados;
  return (
    <div style={{ background:'var(--theme-card)',border:`1px solid ${selecionado?'#60a5fa':'var(--theme-card-border)'}`,borderRadius:12,overflow:'hidden' }}>
      <div style={{ height:3, backgroundColor:cfg.barColor||'#94a3b8' }}/>
      <div style={{ padding:12 }}>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>onSel(item.id)} style={{ background:'none', border:'none', cursor:'pointer' }}>{selecionado?<CheckSquare size={16} color="#3b82f6"/>:<Square size={16}/>}</button>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', margin:0 }}>{d?.titulo || item.mlbId}</p>
            <span style={{ fontSize:10, opacity:0.5 }}>{cfg.label}</span>
          </div>
          <button onClick={()=>onAbrirModal(item)} style={{ padding:4, background:'none', border:'none', cursor:'pointer' }}><Eye size={14}/></button>
          <button onClick={()=>onRemover(item.id)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', color:'#ef4444' }}><Trash2 size={14}/></button>
        </div>
      </div>
    </div>
  );
}

export default function MlResearch() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();
  const [itens, setItensRaw] = useState(() => { try { const s=localStorage.getItem(LS_KEY); return s?JSON.parse(s):[]; } catch { return []; } });
  const [aba, setAba] = useState('pesquisa');
  const [rodando, setRodando] = useState(false);
  const [log, setLog] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [modalAberto, setModalAberto] = useState(null);
  const [showRaioX, setShowRaioX] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [showAutoRetry, setShowAutoRetry] = useState(false);
  const rodandoRef = useRef(false);
  const abortRef = useRef(false);

  const setItens = useCallback((fn) => { setItensRaw(prev => { const next=typeof fn==='function'?fn(prev):fn; localStorage.setItem(LS_KEY,JSON.stringify(next)); return next; }); }, []);
  const addLog = useCallback((msg,tipo='info') => { setLog(prev=>[...prev.slice(-100),{msg,tipo,ts:new Date().toLocaleTimeString('pt-BR')}]); }, []);

  // -------------------------------------------------------------------------
  // MUDANÇA CRUCIAL: Leitura de Stream (SSE) para logs em tempo real
  // -------------------------------------------------------------------------
  const buscarAnuncio = useCallback(async (mlbId, url) => {
    const params = new URLSearchParams({ userId });
    if (url) params.set('urlOriginal', url);

    const res = await fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?${params}`, {
      signal: AbortSignal.timeout(120000)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.msg) {
              let tipo = 'info';
              if (evt.msg.includes('✅') || evt.msg.includes('🎯')) tipo = 'success';
              else if (evt.msg.includes('❌') || evt.msg.includes('⚠️')) tipo = 'warn';
              addLog(`  ${evt.msg}`, tipo); // Log em tempo real agora funciona!
            } else if (evt.done) {
              finalData = evt.data;
            } else if (evt.error) {
              throw new Error(evt.error);
            }
          } catch (e) {}
        }
      }
    }
    return finalData;
  }, [userId, addLog]);

  const executarFila = useCallback(async (ids) => {
    if (rodandoRef.current) return;
    rodandoRef.current=true; setRodando(true); setShowAutoRetry(false);
    addLog(`🚀 Analisando ${ids.length} anúncio(s)...`,'success');

    for (let i=0; i<ids.length; i++) {
      if (abortRef.current) break;
      const{mlbId,url}=ids[i];
      setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando'}:it));
      addLog(`── [${i+1}/${ids.length}] ${mlbId} ──────────────`);
      try {
        const dados = await buscarAnuncio(mlbId, url);
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados}:it));
        addLog(`✅ Concluído!`,'success');
      } catch(e) {
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it));
        addLog(`❌ Erro: ${e.message}`,'warn');
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    rodandoRef.current=false; setRodando(false);
  }, [buscarAnuncio, addLog, setItens]);

  const iniciarAnalise = () => { const ids=itens.filter(i=>['pendente','erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if(ids.length) executarFila(ids); };
  const toggleSel = id => setSelecionados(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const removerDaTela = ids => { setItens(prev => prev.filter(i => !ids.includes(i.id))); setSelecionados(new Set()); };

  const itensFiltrados = itens.filter(i => filtroStatus==='todos' || i.status === filtroStatus);
  const itensPaginados = itensFiltrados.slice((paginaAtual-1)*ITENS_POR_PAGINA, paginaAtual*ITENS_POR_PAGINA);

  return (
    <div style={{ maxWidth:1280, margin:'0 auto', padding:12, color:'var(--theme-text)' }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
        <button onClick={()=>navigate('/ml')} style={btnBase}><ArrowLeft size={16}/></button>
        <h2 style={{ margin:0 }}>Pesquisa de Anúncios</h2>
        <button onClick={()=>setAba('pesquisa')} style={{ ...btnBase, marginLeft:'auto' }}>PESQUISA</button>
      </div>

      {itens.length > 0 && <ResumoGeral itens={itens} onAbrirRaioX={()=>setShowRaioX(true)} />}

      <div style={{ display:'flex', gap:12, marginTop:12 }}>
        <div style={{ width:300, background:'#020617', borderRadius:14, padding:12, height:'76vh', overflowY:'auto' }} className="ia-scroll">
            <button onClick={iniciarAnalise} disabled={rodando} style={{ width:'100%', padding:10, borderRadius:8, background:'#1d4ed8', color:'#fff', border:'none', fontWeight:900, cursor:'pointer' }}>{rodando?'ANALISANDO...':'INICIAR ANÁLISE'}</button>
            <div style={{ marginTop:12, fontSize:10, fontFamily:'monospace' }}>
                {log.map((l,i)=>(<div key={i} style={{ color:l.tipo==='success'?'#6ee7b7':'#94a3b8', marginBottom:4 }}>{l.msg}</div>))}
            </div>
        </div>

        <div style={{ flex:1 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:10 }}>
                {itensPaginados.map(it => <CardResultado key={it.id} item={it} onSel={toggleSel} selecionado={selecionados.has(it.id)} onAbrirModal={setModalAberto} onRemover={(id)=>removerDaTela([id])} />)}
            </div>
        </div>
      </div>
      {modalAberto && <ModalAnuncio item={modalAberto} onClose={()=>setModalAberto(null)} />}
    </div>
  );
}