// src/pages/MlResearch.jsx 

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
  AlertTriangle, TimerReset, Copy, Maximize, Minimize2
} from 'lucide-react';
import AnalyizStar from '../components/Analyizstar';
import { safeDate } from '../utils/safeDate'; // Importando seu formatador de datas seguro

const API_BASE_URL = 'http://localhost:3000';
const LS_KEY       = 'mlresearch_itens_v2';

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

function formatarVendasMercado(vendasStr, vendasNum) {
  if (vendasStr && vendasStr !== '0 vendas' && vendasStr !== '—') return vendasStr;
  const num = Number(vendasNum);
  if (isNaN(num) || num === 0) return '0 vendas';
  if (num >= 50000) return '+50mil vendas';
  if (num >= 10000) return '+10mil vendas';
  if (num >= 5000) return '+5mil vendas';
  if (num >= 1000) return '+1000 vendas';
  if (num >= 500) return '+500 vendas';
  if (num >= 100) return '+100 vendas';
  if (num >= 50) return '+50 vendas';
  return `${num} vendas`;
}

function fmt(v) { return (!v && v !== 0) ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v); }
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

    const addSeller = (nome, vendasStr, vendasNum) => {
      if (!nome || nome === '—') return;
      const v = parseVendas(vendasStr || vendasNum);
      if (!sellersMap.has(nome)) {
        sellersMap.set(nome, { nome, adsCount: 1, totalSales: v, vendasStr });
      } else {
        const s = sellersMap.get(nome);
        s.adsCount += 1;
        s.totalSales += v;
      }
    };

    const pVend = m.vendedor && m.vendedor !== '—' ? m.vendedor : (d.seller?.nome || '—');
    addSeller(pVend, d.vendasStr, d.vendasNum);

    (d.concorrentes || []).forEach(c => { addSeller(c.nome, c.vendasStr, c.vendasNum); });
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
      <button onClick={() => setOpen(v => !v)} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'var(--theme-sidebar)', border:'none', cursor:'pointer', color:'var(--theme-text)', textAlign:'left' }}>
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
    const refUrl = i.url || d.link || `http://www.mercadolivre.com.br/p/${refMlb}/s`;

    const pagItem = String(d.pagina || m.pagina || '1');
    if (paginaFiltrada === 'todas' || pagItem === String(paginaFiltrada)) {
      const precoSem = d.precoOriginal || m.precoSemPromo || d.preco;
      const precoCom = d.preco || 0;
      const desconto = d.desconto || m.promo || (precoSem && precoSem > precoCom ? `${Math.round((1 - precoCom/precoSem)*100)}% OFF` : '0% OFF');

      linhasProcessadas.push({
        nomeAnuncio: refTit, mbl: refMlb, urlOrigem: refUrl, pagina: pagItem, posicao: String(d.posicao || m.posicao || '1'),
        precoSemPromo: precoSem ? String(precoSem).replace('.', ',') : String(precoCom).replace('.', ','),
        precoComPromo: String(precoCom).replace('.', ','), promo: desconto, tipoAnuncio: d.tipoAnuncio || m.tipoAnuncio || 'Clássico',
        envio: d.envio || m.envio || (d.freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios'),
        vendedor: d.seller?.nome || m.vendedor || '—', 
        vendas: formatarVendasMercado(d.vendasStr, d.vendasNum),
      });
    }

    (d.concorrentes || []).forEach(c => {
      const pagConc = String(c.pagina || '1');
      if (paginaFiltrada === 'todas' || pagConc === String(paginaFiltrada)) {
        const cPrecoSem = c.precoOriginal || c.preco;
        const cPrecoCom = c.preco || 0;
        const cDesconto = c.desconto || (cPrecoSem && cPrecoSem > cPrecoCom ? `${Math.round((1 - cPrecoCom/cPrecoSem)*100)}% OFF` : '0% OFF');

        linhasProcessadas.push({
          nomeAnuncio: c.titulo || refTit, mbl: c.mlbId || refMlb,
          urlOrigem: c.link || refUrl,
          pagina: pagConc, posicao: String(c.posicao || '—'),
          precoSemPromo: String(cPrecoSem || cPrecoCom).replace('.', ','),
          precoComPromo: String(cPrecoCom).replace('.', ','), promo: cDesconto,
          tipoAnuncio: c.tipoAnuncio || 'Clássico', envio: c.envio || (c.freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios'),
          vendedor: c.nome || '—', 
          vendas: formatarVendasMercado(c.vendasStr, c.vendasNum),
        });
      }
    });
  });

  if (linhasProcessadas.length === 0) {
    return alert(`Nenhum anúncio encontrado para a Página ${paginaFiltrada}.\nTente exportar com "Todas as Páginas" ou mude o filtro.`);
  }

  if (formato === 'csv' || formato === 'xls') {
    const cabecalho = 'Nome do Anúncio;MBL;URL Origem;Página;Posição;Preço Sem Promo;Preço Com Promo;% Promo;Tipo Anúncio;Envio;Vendedor;Vendas';
    const rows = [cabecalho];
    
    linhasProcessadas.forEach(linha => {
      const escape = (str) => `"${String(str || '').replace(/"/g,'""')}"`;
      rows.push([
        escape(linha.nomeAnuncio), escape(linha.mbl), escape(linha.urlOrigem), escape(linha.pagina), escape(linha.posicao),
        escape(linha.precoSemPromo), escape(linha.precoComPromo), escape(linha.promo), escape(linha.tipoAnuncio),
        escape(linha.envio), escape(linha.vendedor), escape(linha.vendas)
      ].join(';'));
    });

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${nomeArquivo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  } else if (formato === 'pdf') {
    let htmlPrint = `<html><head><title>${nomeArquivo}</title><style>
      body{font-family:sans-serif;font-size:10px;margin:20px}
      h2{color:#1e293b}
      p.meta{font-size:9px;color:#64748b;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
      th{background:#f1f5f9;font-weight:bold}
      tr:nth-child(even){background:#f8fafc}
    </style></head><body>
    <h2>${tituloRelatorio}${paginaFiltrada !== 'todas' ? ` — Página ${paginaFiltrada}` : ''}</h2>
    <p class="meta">Gerado por Analyiz · ${safeDate(new Date())} · ${linhasProcessadas.length} anúncios</p>`;
    if (relatorioHtml) htmlPrint += `<div style="margin-bottom:16px">${relatorioHtml}</div>`;
    htmlPrint += `<table><tr><th>Anúncio</th><th>MBL</th><th>Pág</th><th>Pos</th><th>Preço Sem Promo</th><th>Preço Com Promo</th><th>% Promo</th><th>Tipo</th><th>Envio</th><th>Vendedor</th><th>Vendas</th></tr>`;
    linhasProcessadas.forEach(l => {
      htmlPrint += `<tr><td>${l.nomeAnuncio}</td><td>${l.mbl}</td><td>${l.pagina}</td><td>${l.posicao}</td><td>${l.precoSemPromo}</td><td>${l.precoComPromo}</td><td>${l.promo}</td><td>${l.tipoAnuncio}</td><td>${l.envio}</td><td>${l.vendedor}</td><td>${l.vendas}</td></tr>`;
    });
    htmlPrint += `</table></body></html>`;
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

  useEffect(() => {
    const handleScroll = () => setAberto(false);
    if (aberto) window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [aberto]);

  return (
    <>
      <button ref={btnRef} onClick={toggleMenu} disabled={disabled} style={{ padding:'6px 12px',borderRadius:8,border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textTransform:'uppercase',cursor:disabled?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6, opacity:disabled?0.4:1, transition:'all 0.2s' }}>
        <Download size={14}/> {label} <ChevronDown size={12}/>
      </button>
      {aberto && !disabled && (
        <Portal>
          <div onClick={()=>setAberto(false)} style={{ position:'fixed', inset:0, zIndex:9999990 }}/>
          <div onClick={e=>e.stopPropagation()} style={{ position:'fixed', top: coords.top, right: coords.right, zIndex:9999991, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', borderRadius:12, padding:8, display:'flex', flexDirection:'column', gap:4, boxShadow:'0 10px 40px rgba(0,0,0,0.5)', minWidth:200, animation:'slideDown 0.15s ease' }}>
            <p style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', opacity:0.4, padding:'4px 8px' }}>Filtrar por Página</p>
            <select value={paginaExport} onChange={e => setPaginaExport(e.target.value)} style={{ margin:'0 8px 4px', padding:'6px 8px', borderRadius:8, border:'1px solid var(--theme-card-border)', background:'var(--theme-sidebar)', color:'var(--theme-text)', fontSize:11, fontWeight:700, cursor:'pointer', outline:'none' }}>
              <option value="todas">Todas as Páginas</option>
              {paginasDisponiveis.filter(p => p !== 'todas').map(p => <option key={p} value={String(p)}>Somente Página {p}</option>)}
            </select>
            <p style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', opacity:0.4, padding:'4px 8px' }}>Baixar relatório</p>
            {[ { id:'csv', label:'Excel (.csv)', ic:FileSpreadsheet, c:'#10b981' }, { id:'pdf', label:'PDF (Imprimir)', ic:Printer, c:'#ef4444' }].map(o => (
              <button key={o.id} onClick={(e)=>{ e.stopPropagation(); onExport(o.id, paginaExport); setAberto(false); }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'transparent', border:'none', borderRadius:6, cursor:'pointer', color:'var(--theme-text)', fontSize:11, fontWeight:700, textAlign:'left', width:'100%', transition:'all 0.2s', ':hover':{background:'var(--theme-sidebar)'} }}>
                <o.ic size={14} style={{ color:o.c }}/> {o.label}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
  );
}

function GaleriaFotos({ fotos }) {
  const [fotoMascara, setFotoMascara] = useState(null);
  if (!fotos || fotos.length === 0) return null;
  return (
    <>
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:6, marginTop:10 }} className="ia-scroll">
        {fotos.map((f, idx) => (
          <img key={idx} src={f} alt="Detalhe" onClick={() => setFotoMascara(f)} style={{ width:56, height:56, objectFit:'cover', borderRadius:8, cursor:'pointer', border:'1px solid var(--theme-card-border)', flexShrink:0, transition:'transform 0.15s', ':hover':{transform:'scale(1.05)'} }} />
        ))}
      </div>
      {fotoMascara && (
        <Portal>
          <div onClick={() => setFotoMascara(null)} style={{ position:'fixed', inset:0, zIndex:9999999, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <img src={fotoMascara} alt="Zoom" onClick={e=>e.stopPropagation()} style={{ maxWidth:'100%', maxHeight:'100%', borderRadius:16, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }} />
            <button onClick={()=>setFotoMascara(null)} style={{ position:'absolute', top:20, right:20, background:'rgba(255,255,255,0.1)', color:'#fff', border:'none', borderRadius:'50%', padding:10, cursor:'pointer' }}><X size={24}/></button>
          </div>
        </Portal>
      )}
    </>
  );
}

function DropdownFiltros({ ordem, setOrdem, grupo, setGrupo }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', background:'var(--theme-card)', padding:'8px 12px', borderRadius:10, border:'1px solid var(--theme-card-border)' }}>
      <Filter size={14} style={{ opacity:0.4 }}/>
      <select value={ordem} onChange={e=>setOrdem(e.target.value)} style={{ background:'transparent', border:'none', outline:'none', color:'var(--theme-text)', fontSize:11, fontWeight:700, cursor:'pointer' }}>
        <option value="preco_asc">Menor Preço</option>
        <option value="posicao_asc">Ordem no Anúncio</option>
        <option value="vendas_desc">Mais Vendas Gerais</option>
      </select>
      <div style={{ width:1, height:16, background:'var(--theme-card-border)' }}/>
      <select value={grupo} onChange={e=>setGrupo(e.target.value)} style={{ background:'transparent', border:'none', outline:'none', color:'var(--theme-text)', fontSize:11, fontWeight:700, cursor:'pointer' }}>
        <option value="todos">Mostrar Todos</option>
        <option value="unicos">Ocultar Nomes Repetidos</option>
        <option value="agrupados">Somar Repetidos (x2)</option>
      </select>
    </div>
  );
}

function ModalRaioXMercado({ itens, selecionados, onClose }) {
  const [filtro, setFiltro] = useState('todos');
  const itensAlvo = filtro === 'todos' ? itens.filter(i => i.status === 'concluido') : itens.filter(i => selecionados.has(i.id) && i.status === 'concluido');
  const stats = obterStatsMercado(itensAlvo);

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999990,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width: 800, maxWidth: '96vw', height: '80vh', maxHeight: '80vh', background: 'var(--theme-card)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
          <div style={{ padding:'20px 24px', background:'linear-gradient(135deg, var(--theme-header), #0f172a)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, position:'relative' }}>
             <div className="ia-header-glow" style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg, transparent, #3b82f6, #10b981, transparent)', animation:'slideGrad 2s linear infinite' }} />
             <div style={{ display:'flex', alignItems:'center', gap:14, zIndex:1 }}>
               <div style={{ background:'rgba(59, 130, 246, 0.2)', padding:10, borderRadius:'50%', border:'1px solid rgba(59, 130, 246, 0.3)' }}><PieChart size={24} style={{ color:'#93c5fd' }}/></div>
               <div><p style={{ fontSize:18, fontWeight:900, color:'#fff', lineHeight:1.2 }}>Raio-X de Vendedores</p><p style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:4 }}>Análise de participação e volume no mercado atual</p></div>
             </div>
             <button onClick={onClose} style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', color:'rgba(255,255,255,0.6)', padding:8, borderRadius:'50%', transition:'all 0.2s' }}><X style={{ width:18, height:18 }}/></button>
          </div>

          <div style={{ display:'flex', borderBottom:'1px solid var(--theme-card-border)', padding:'0 18px', flexShrink:0, background:'var(--theme-sidebar)', gap:8 }}>
             <button onClick={() => setFiltro('todos')} style={{ padding:'12px 16px', fontSize:11, fontWeight:900, textTransform:'uppercase', border:'none', borderBottom:`3px solid ${filtro==='todos'?'#3b82f6':'transparent'}`, color: filtro==='todos' ? '#3b82f6':'var(--theme-text)', background:'none', cursor:'pointer', opacity: filtro==='todos' ? 1:0.5, transition:'all 0.2s' }}>Todos os Anúncios ({itens.filter(i=>i.status==='concluido').length})</button>
             <button onClick={() => setFiltro('selecionados')} style={{ padding:'12px 16px', fontSize:11, fontWeight:900, textTransform:'uppercase', border:'none', borderBottom:`3px solid ${filtro==='selecionados'?'#3b82f6':'transparent'}`, color: filtro==='selecionados' ? '#3b82f6':'var(--theme-text)', background:'none', cursor:'pointer', opacity: filtro==='selecionados' ? 1:0.5, transition:'all 0.2s' }}>Somente Selecionados ({selecionados.size})</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:0, borderBottom:'1px solid var(--theme-card-border)', background:'rgba(0,0,0,0.05)', flexShrink:0 }}>
             <div style={{ padding:'16px', textAlign:'center', borderRight:'1px solid var(--theme-card-border)' }}><p style={{ fontSize:24, fontWeight:900, color:'#8b5cf6' }}>{stats.totalVendedores}</p><p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', opacity:0.5, marginTop:4 }}>Vendedores Únicos</p></div>
             <div style={{ padding:'16px', textAlign:'center', borderRight:'1px solid var(--theme-card-border)' }}><p style={{ fontSize:24, fontWeight:900, color:'#3b82f6' }}>{stats.totalAnuncios}</p><p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', opacity:0.5, marginTop:4 }}>Anúncios Processados</p></div>
             <div style={{ padding:'16px', textAlign:'center' }}><p style={{ fontSize:24, fontWeight:900, color:'#10b981' }}>{stats.totalVendas > 0 ? formatarVendasMercado('', stats.totalVendas) : '0'}</p><p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', opacity:0.5, marginTop:4 }}>Volume Mapeado</p></div>
          </div>

          <div style={{ flex:1, overflowY:'auto' }} className="ia-scroll">
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead style={{ background:'var(--theme-sidebar)', position:'sticky', top:0, zIndex:10 }}>
                <tr>{['Rank','Vendedor','Presença','Volume'].map((h,i)=><th key={i} style={{ padding:'12px 16px', fontSize:10, fontWeight:900, textTransform:'uppercase', color:'var(--theme-text)', opacity:0.6, textAlign:i===0?'center':i===3?'right':'left', borderBottom:'1px solid var(--theme-card-border)' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {stats.sellersLista.map((seller, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--theme-card-border)', background: i === 0 ? 'rgba(16, 185, 129, 0.05)' : 'transparent' }}>
                    <td style={{ padding:'14px 16px', textAlign:'center' }}>{i===0 ? <Medal style={{ width:20, height:20, color:'#f59e0b', margin:'0 auto' }}/> : i===1 ? <Award style={{ width:20, height:20, color:'#94a3b8', margin:'0 auto' }}/> : <span style={{ fontSize:13, fontWeight:900, opacity:0.4 }}>{i+1}</span>}</td>
                    <td style={{ padding:'14px 16px' }}><p style={{ fontSize:14, fontWeight:900, color: i===0 ? '#10b981' : 'var(--theme-text)' }}>{seller.nome}</p><a href={gerarLinkVendedor(seller.nome)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:9, color:'#8b5cf6', textDecoration:'none', marginTop:4, fontWeight:700 }}><ExternalLink size={10}/> Ver Perfil</a></td>
                    <td style={{ padding:'14px 16px', textAlign:'center' }}><span style={{ fontSize:12, fontWeight:900, background:'var(--theme-sidebar)', padding:'4px 10px', borderRadius:20, border:'1px solid var(--theme-card-border)' }}>{seller.adsCount}</span></td>
                    <td style={{ padding:'14px 16px', textAlign:'right' }}><span style={{ fontSize:15, fontWeight:900, color: seller.totalSales > 0 ? '#10b981' : 'var(--theme-text)' }}>{seller.vendasStr || formatarVendasMercado('', seller.totalSales)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function ModalAnuncio({ item, onClose, onDispararPesquisa, paginasDisponiveis = [] }) {
  const [tab, setTab] = useState('vendedores');
  const [ordem, setOrdem] = useState('preco_asc');
  const [grupo, setGrupo] = useState('todos');

  if (!item) return null;
  const d  = item.dados;
  const m  = item.metaPlanilha || {};
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const concRaw = d?.concorrentes || [];
  
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
  const linkRealDoAnuncio = gerarLinkAnuncio(item.mlbId, ehCatalogo, item.url);
  const linkOpcoesCompra  = gerarLinkOpcoesCompra(item.mlbId);
  
  const menorPreco = concRaw.length ? Math.min(...concRaw.map(c=>c.preco).filter(v=>v>0)) : null;

  // Lógica de Agrupamento
  let concorrentesProcessados = [...concRaw];
  if (grupo === 'unicos') {
     const seen = new Set();
     concorrentesProcessados = concorrentesProcessados.filter(c => {
         if (seen.has(c.nome)) return false;
         seen.add(c.nome); return true;
     });
  } else if (grupo === 'agrupados') {
     const map = new Map();
     concorrentesProcessados.forEach(c => {
        if (map.has(c.nome)) { map.get(c.nome).count += 1; }
        else { map.set(c.nome, { ...c, count: 1 }); }
     });
     concorrentesProcessados = Array.from(map.values()).map(c => ({...c, nomeExibicao: `${c.nome} (x${c.count})`}));
  } else {
     concorrentesProcessados = concorrentesProcessados.map(c => ({...c, nomeExibicao: c.nome}));
  }

  // Lógica de Ordenação
  concorrentesProcessados.sort((a,b) => {
      if (ordem === 'preco_asc') return a.preco - b.preco;
      if (ordem === 'posicao_asc') return a.posicao - b.posicao;
      if (ordem === 'vendas_desc') return parseVendas(b.vendasStr || b.vendasNum) - parseVendas(a.vendasStr || a.vendasNum);
      return 0;
  });

  const totalVend = d?.totalVendedores !== undefined ? d.totalVendedores : (d?.seller ? (concRaw.length || 0) + 1 : (concRaw.length || 0));

  const tabs = [
    { k:'vendedores', l: ehCatalogo ? `Opções de Compra (${concorrentesProcessados.length})` : `Concorrentes (${concorrentesProcessados.length})` },
    { k:'info',       l:'Detalhes Técnicos' },
    { k:'ficha',      l:`Ficha Completa (${(d?.atributos||[]).length})` },
    { k:'variacoes',  l:`Variações Mapeadas (${(d?.variacoes||[]).length})` },
    { k:'achados',    l:`Logs da IA 🕵️‍♂️` },
  ];

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999990,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:860,maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid rgba(139, 92, 246, 0.3)',color:'var(--theme-text)',borderRadius:20,boxShadow:'0 30px 80px rgba(0,0,0,0.6), 0 0 20px rgba(139, 92, 246, 0.15)',display:'flex',flexDirection:'column',overflow:'hidden', position: 'relative' }}>
          
          <div style={{ background:'linear-gradient(135deg, var(--theme-header), #1e1b4b)', padding:'18px 24px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexShrink:0, position:'relative', overflow:'hidden' }}>
            <div className="ia-header-glow" style={{ position:'absolute', top:0, left:0, right:0, height:'2px', background:'linear-gradient(90deg, transparent, #8b5cf6, #3b82f6, transparent)', animation:'slideGrad 2s linear infinite' }} />
            <div style={{ display:'flex',alignItems:'flex-start',gap:14,minWidth:0, zIndex:1 }}>
              {d?.thumbnail && <img src={d.thumbnail} alt="" style={{ width:60,height:60,borderRadius:12,objectFit:'cover',border:'2px solid rgba(255,255,255,0.1)',flexShrink:0, boxShadow:'0 4px 12px rgba(0,0,0,0.2)' }} />}
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:6 }}>
                  <span style={{ display:'inline-flex',alignItems:'center',gap:4,fontSize:9,fontWeight:900,textTransform:'uppercase',padding:'3px 8px',borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`, boxShadow:'0 2px 4px rgba(0,0,0,0.1)' }}><cfg.Icon style={{ width:10,height:10 }}/>{cfg.label}</span>
                  <span style={{ fontSize:10,fontFamily:'monospace',color:'#94a3b8',background:'rgba(255,255,255,0.05)',padding:'3px 8px',borderRadius:6, border:'1px solid rgba(255,255,255,0.1)' }}>{item.mlbId}</span>
                  {ehCatalogo && <span style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',color:'#93c5fd',background:'rgba(59,130,246,0.2)',border:'1px solid rgba(147,197,253,0.3)',padding:'3px 8px',borderRadius:6 }}>CATÁLOGO</span>}
                  {d?.paginasColetadas && (
                    <span style={{ fontSize:9,fontWeight:900,color:'#c084fc',background:'rgba(192,132,252,0.15)',border:'1px solid rgba(192,132,252,0.3)',padding:'3px 8px',borderRadius:6 }}>
                      {d.paginasColetadas.length} Pág Lida{d.paginasColetadas.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize:16,fontWeight:900,color:'#fff',margin:0,lineHeight:1.3, textShadow:'0 2px 4px rgba(0,0,0,0.5)' }}>{d?.titulo || 'Anúncio não carregado'}</h2>
                <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                  <a href={linkRealDoAnuncio} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10, fontWeight:900, color:'#60a5fa', textDecoration:'none', background:'rgba(59,130,246,0.1)', padding:'5px 12px', borderRadius:8, border:'1px solid rgba(59,130,246,0.2)', transition:'all 0.2s', textTransform:'uppercase' }}><ExternalLink size={12}/> Anúncio Origem</a>
                  {ehCatalogo && <a href={linkOpcoesCompra} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10, fontWeight:900, color:'#a78bfa', textDecoration:'none', background:'rgba(139,92,246,0.1)', padding:'5px 12px', borderRadius:8, border:'1px solid rgba(139,92,246,0.2)', transition:'all 0.2s', textTransform:'uppercase' }}><ListChecks size={12}/> Ver Opções de Compra</a>}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, zIndex:1 }}>
              <MenuExportacao
                onExport={(f, pg) => exportarDadosComplexos(f, [item], `Relatório Individual - ${item.mlbId}`, null, pg)}
                disabled={!d}
                paginaFiltrada="todas"
                paginasDisponiveis={d?.paginasColetadas || [1]}
              />
              <button onClick={()=>{onClose(); onDispararPesquisa([item]);}} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background:'linear-gradient(90deg,#4f46e5,#9333ea)', color:'#fff', fontWeight:900, fontSize:10, border:'none', cursor:'pointer', textTransform:'uppercase', boxShadow:'0 2px 8px rgba(147, 51, 234, 0.3)' }}><Sparkles size={14}/> Pesquisa IA</button>
              <button onClick={onClose} style={{ color:'rgba(255,255,255,0.4)',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.1)', borderRadius:'50%', padding:6, cursor:'pointer', transition:'all 0.2s' }}><X style={{ width:18,height:18 }} /></button>
            </div>
          </div>

          <div style={{ padding:'6px 16px', background:'rgba(139, 92, 246, 0.1)', borderBottom:'1px solid rgba(139, 92, 246, 0.2)', display:'flex', alignItems:'center', gap:6 }}>
             <Bot size={14} style={{ color:'#a78bfa' }}/>
             <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', color:'#a78bfa' }}>Anúncio verificado com inteligência de navegação 🤖</span>
          </div>

          {d && (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid var(--theme-card-border)',flexShrink:0, background:'rgba(0,0,0,0.1)' }}>
              {[{l:'Preço Ref.',v:fmt(d.preco),c:'#10b981'},{l:'Menor preço',v:fmt(d.precoMin??menorPreco??d.preco),c:'#3b82f6'},{l:'Preço médio',v:fmt(d.precoMedio),c:'#f59e0b'},{l:'Vendedores',v:totalVend,c:totalVend===0?'#ef4444':'#8b5cf6'}].map(({l,v,c},i)=>(
                <div key={l} style={{ display:'flex',flexDirection:'column',padding:'14px 18px',borderRight:i<3?'1px solid var(--theme-card-border)':'none' }}>
                  <span style={{ fontSize:20,fontWeight:900,color:c,lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:4 }}>{l}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex',borderBottom:'1px solid var(--theme-card-border)',padding:'0 16px',flexShrink:0,background:'var(--theme-sidebar)', gap:4, overflowX:'auto' }} className="ia-scroll">
            {tabs.map(({k,l})=>(
              <button key={k} onClick={()=>setTab(k)} style={{ padding:'12px 14px',fontSize:11,fontWeight:900,textTransform:'uppercase',borderBottom:`3px solid ${tab===k?'var(--theme-accent)':'transparent'}`,color:tab===k?'var(--theme-accent)':'var(--theme-text)',background:'none',border:'none',cursor:'pointer',opacity:tab===k?1:0.5,whiteSpace:'nowrap', transition:'all 0.2s' }}>{l}</button>
            ))}
          </div>

          <div style={{ flex:1,overflowY:'auto',padding:20 }} className="ia-scroll">
            {tab==='vendedores' && (
              <>
                <div style={{ marginBottom:16 }}>
                   <DropdownFiltros ordem={ordem} setOrdem={setOrdem} grupo={grupo} setGrupo={setGrupo} />
                </div>

                {d?.seller && grupo !== 'unicos' && (
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:14,padding:'16px 20px',border:'1px solid var(--theme-card-border)',marginBottom:16,display:'flex',alignItems:'center',gap:16, boxShadow:'0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:10,fontWeight:900,textTransform:'uppercase',color:'#8b5cf6',marginBottom:4,display:'flex',alignItems:'center',gap:4 }}><Users style={{ width:12,height:12 }}/>Vendedor Analisado</p>
                      <p style={{ fontSize:18,fontWeight:900,color:'var(--theme-text)' }}>{m.vendedor && m.vendedor !== '—' ? m.vendedor : d.seller.nome}</p>
                      <a href={d.seller.perfilLoja || gerarLinkVendedor(d.seller.nome)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, color:'#6366f1', textDecoration:'none', marginTop:4, fontWeight:700 }}><ExternalLink size={10}/> Ver perfil da Loja</a>
                      {(d.mercadoLider || d.seller.reputacao) && <p style={{ fontSize:11,fontWeight:900,color:'#f59e0b', marginTop:6 }}>★ {d.mercadoLider || d.seller.reputacao}</p>}
                    </div>
                    <div style={{ textAlign:'right', paddingRight:16, borderRight:'1px solid var(--theme-card-border)' }}>
                      <p style={{ fontSize:22,fontWeight:900,color:'#6366f1' }}>{formatarVendasMercado(m.vendas && m.vendas !== '—' ? m.vendas : (d.vendasStr || d.vendasNum))}</p>
                      <p style={{ fontSize:10,opacity:0.4 }}>Vendas Gerais</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:26,fontWeight:900,color:'#10b981' }}>{fmt(d.preco)}</p>
                      {d.parcelamento && <p style={{ fontSize:11, opacity:0.6, marginTop:2 }}>{d.parcelamento}</p>}
                      <p style={{ fontSize:11,color:'#10b981',fontWeight:900, marginTop:4 }}>{m.envio && m.envio !== '—' ? m.envio : (d.envio || (d.freteGratis ? '✓ Frete Grátis' : 'Frete Pago'))}</p>
                    </div>
                  </div>
                )}

                {concorrentesProcessados.length > 0 ? (
                  <>
                    <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',opacity:0.5,marginBottom:10, marginLeft:4 }}>{ehCatalogo?'Outras opções de compra (Catálogo)':'Concorrentes Mapeados'}</p>
                    <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                      {concorrentesProcessados.map((c,i)=>{
                        const abaixo=d?.preco&&c.preco<d.preco;const acima=d?.preco&&c.preco>d.preco;const eMin=c.preco===menorPreco&&i===0;
                        return (
                          <div key={i} style={{ background:eMin?'rgba(16, 185, 129, 0.05)':abaixo?'rgba(239, 68, 68, 0.05)':'var(--theme-sidebar)',border:`1px solid ${eMin?'#86efac':abaixo?'#fca5a5':'var(--theme-card-border)'}`,borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12 }}>
                            <div style={{ width:32,textAlign:'center',flexShrink:0 }}>{i===0?<Medal style={{ width:18,height:18,color:'#f59e0b',margin:'0 auto' }}/>:i===1?<Award style={{ width:18,height:18,color:'#94a3b8',margin:'0 auto' }}/>:<span style={{ fontSize:13,fontWeight:900,opacity:0.4 }}>{i+1}</span>}</div>
                            {c.thumbnail&&<img src={c.thumbnail} alt="" style={{ width:40,height:40,borderRadius:8,objectFit:'cover',border:'1px solid var(--theme-card-border)',flexShrink:0 }}/>}
                            <div style={{ flex:1,minWidth:0 }}>
                              <p style={{ fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.nomeExibicao||c.titulo||'—'}</p>
                              <a href={c.perfilLoja || gerarLinkVendedor(c.nome)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, color:'#8b5cf6', textDecoration:'none', marginTop:2, fontWeight:700 }}><ExternalLink size={9}/> Perfil ML</a>
                              {c.mercadoLider && <span style={{ marginLeft:8, fontSize:9, fontWeight:900, color:'#f59e0b' }}>★ {c.mercadoLider}</span>}
                              {c.titulo&&c.nome&&c.nome!==c.titulo&&<p style={{ fontSize:11,opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', marginTop:4 }}>{c.titulo}</p>}
                              <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:6,flexWrap:'wrap' }}>
                                {c.tipoAnuncio&&<span style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',padding:'2px 6px',borderRadius:4,opacity:0.8 }}>{c.tipoAnuncio}</span>}
                                {c.envio ? <span style={{ fontSize:10,fontWeight:900,color:'#10b981' }}>{c.envio}</span> : (c.freteGratis&&<span style={{ fontSize:10,fontWeight:700,color:'#10b981' }}>✓ Frete grátis</span>)}
                                {c.vendasStr && <span style={{ fontSize:10,color:'#f59e0b',fontWeight:900, background:'rgba(245, 158, 11, 0.1)', padding:'2px 6px', borderRadius:4 }}>{formatarVendasMercado(c.vendasStr, c.vendasNum)}</span>}
                                {c.pagina && <span style={{ fontSize:9,color:'#c084fc',fontWeight:900,background:'rgba(192,132,252,0.1)',padding:'2px 6px',borderRadius:4 }}>Pág {c.pagina} | Pos {c.posicao}</span>}
                              </div>
                            </div>
                            <div style={{ textAlign:'right',flexShrink:0,minWidth:110 }}>
                              {c.precoOriginal&&c.precoOriginal>c.preco&&<p style={{ fontSize:11,textDecoration:'line-through',opacity:0.4 }}>{fmt(c.precoOriginal)}</p>}
                              <p style={{ fontSize:20,fontWeight:900,color:eMin?'#059669':abaixo?'#ef4444':acima?'#10b981':'var(--theme-text)', lineHeight:1 }}>{fmt(c.preco)}</p>
                              {c.parcelamento && <p style={{ fontSize:9, opacity:0.5, marginTop:2 }}>{c.parcelamento}</p>}
                              {c.desconto&&<span style={{ display:'inline-block', fontSize:10,fontWeight:900,color:'#059669',background:'#dcfce7',border:'1px solid #86efac',padding:'2px 6px',borderRadius:20, marginTop:4 }}>{c.desconto}</span>}
                              {c.link&&<a href={c.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:8,padding:'5px 12px',borderRadius:8,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textDecoration:'none' }}><ExternalLink style={{ width:12,height:12 }}/>Ver Anúncio</a>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  !d?.seller ? (
                    <div style={{ background:'rgba(239, 68, 68, 0.05)',borderRadius:14,padding:40,border:'1px dashed rgba(239, 68, 68, 0.3)',textAlign:'center', marginTop:10 }}>
                      <ShoppingBag style={{ width:40,height:40,margin:'0 auto 16px',color:'#ef4444',opacity:0.5 }}/>
                      <p style={{ fontSize:14,fontWeight:900,textTransform:'uppercase',color:'#ef4444',marginBottom:8 }}>Sem Opções de Compra</p>
                      <p style={{ fontSize:12, opacity:0.6, maxWidth:350, margin:'0 auto', color:'var(--theme-text)' }}>Não há vendedores participando deste anúncio no momento da pesquisa. O produto pode estar pausado, inativo ou sem estoque no Mercado Livre.</p>
                    </div>
                  ) : (
                    <div style={{ background:'var(--theme-sidebar)',borderRadius:14,padding:30,border:'1px solid var(--theme-card-border)',textAlign:'center' }}>
                      <Users style={{ width:32,height:32,margin:'0 auto 12px',opacity:0.2 }}/>
                      <p style={{ fontSize:13,fontWeight:900,textTransform:'uppercase',opacity:0.4 }}>Nenhum concorrente encontrado</p>
                      <p style={{ fontSize:11, opacity:0.3, marginTop:4 }}>Tente pesquisar por catálogo ou título genérico.</p>
                    </div>
                  )
                )}
              </>
            )}
            {tab==='info' && (
              <div>
                {d?.pictures && d.pictures.length > 0 && (
                  <div style={{ marginBottom:20, background:'var(--theme-sidebar)', padding:16, borderRadius:12, border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'#6366f1' }}>Fotos Capturadas ({d.pictures.length})</p>
                    <GaleriaFotos fotos={d.pictures} />
                  </div>
                )}
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:20 }}>
                  {[{title:'Dados do Anúncio',rows:[['ID Origem',item.mlbId],['Página Ref.',d?.pagina||m.pagina||'—'],['Posição Ref.',d?.posicao||m.posicao||'—'],['Catálogo',d?.ehCatalogo?'Sim':'Não'],['Status',d?.status||'—'],['Estoque',d?.estoque!=null?`${d.estoque} un`:'—'],['Avaliação',d?.avaliacoes?`${d.avaliacoes} ★`:'—'],['Páginas Coletadas',(d?.paginasColetadas||[]).join(', ')||'—']]},{title:'Frete & Mais',rows:[['Envio / Frete',d?.envio || (d?.freteGratis?'✅ Grátis':(d?.frete||'Pago'))],['Parcelamento',d?.parcelamento||'—'],['Fonte da Análise',d?.fonte||'—'],['Data da Análise',safeDate(d?.analisadoEm)]]}].map(({title,rows})=>(
                    <div key={title} style={{ background:'var(--theme-sidebar)', padding:16, borderRadius:12, border:'1px solid var(--theme-card-border)' }}>
                      <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'#6366f1',marginBottom:12 }}>{title}</p>
                      {rows.filter(([,v])=>v&&v!=='—'&&v!=null).map(([k,v])=>(
                        <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.05)',fontSize:13 }}>
                          <span style={{ opacity:0.6 }}>{k}</span>
                          <span style={{ fontWeight:700,maxWidth:220,textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', color:'var(--theme-text)' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab==='ficha' && (
              (d?.atributos||[]).length===0
                ?<div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:40,gap:10,opacity:0.3 }}><Package style={{ width:40,height:40 }}/><p style={{ fontSize:13,fontWeight:900,textTransform:'uppercase' }}>Sem ficha técnica detectada</p></div>
                :<div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))',gap:8 }}>
                  {d.atributos.map((a,i)=>(
                    <div key={i} style={{ display:'flex',justifyContent:'space-between',background:'var(--theme-sidebar)',padding:'10px 14px',borderRadius:10,fontSize:13,border:'1px solid var(--theme-card-border)', alignItems:'center' }}>
                      <span style={{ opacity:0.6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', fontSize:11, textTransform:'uppercase', fontWeight:700 }}>{a.nome}</span>
                      <span style={{ fontWeight:900,marginLeft:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', color:'var(--theme-text)' }}>{a.valor}</span>
                    </div>
                  ))}
                </div>
            )}
            {tab==='variacoes' && (
              (d?.variacoes||[]).length===0
                ?<div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:40,gap:10,opacity:0.3 }}><LayoutList style={{ width:40,height:40 }}/><p style={{ fontSize:13,fontWeight:900,textTransform:'uppercase' }}>Sem variações detectadas</p></div>
                :<div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:8 }}>
                  {d.variacoes.map((a,i)=>(
                    <div key={i} style={{ display:'flex', flexDirection:'column', background:'rgba(16, 185, 129, 0.05)', padding:'12px 16px', borderRadius:12, border:'1px solid rgba(16, 185, 129, 0.2)' }}>
                      <span style={{ opacity:0.5, fontSize:10, textTransform:'uppercase', fontWeight:900, color:'#10b981', marginBottom:4 }}>{a.nome}</span>
                      <span style={{ fontWeight:900, fontSize:15, color:'var(--theme-text)' }}>{a.valor}</span>
                    </div>
                  ))}
                </div>
            )}
            {tab==='achados' && (
              <div style={{ background:'var(--theme-sidebar)', padding:24, borderRadius:16, border:'1px solid var(--theme-card-border)' }}>
                <h3 style={{ fontSize:14, fontWeight:900, textTransform:'uppercase', color:'#8b5cf6', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><Activity size={16}/> Logs de Mapeamento (Debug)</h3>
                <p style={{ fontSize:11, color:'var(--theme-text)', opacity:0.5, marginBottom:16 }}>Abaixo está o log interno de como a Inteligência localizou e extraiu os dados das variações do Mercado Livre em tempo real:</p>
                <div style={{ fontFamily:'monospace', fontSize:11, lineHeight:1.6, color:'var(--theme-text)', opacity:0.8, display:'flex', flexDirection:'column', gap:4 }}>
                  {(!d?.debugLog || d.debugLog.length === 0) ? <p>Nenhum log de rastreamento salvo para este item.</p> : d.debugLog.map((linha, i) => {
                    let color = 'inherit';
                    if (linha.includes('❌') || linha.includes('⚠️')) color = '#ef4444';
                    else if (linha.includes('✅') || linha.includes('🎯')) color = '#10b981';
                    else if (linha.includes('🌐') || linha.includes('📡') || linha.includes(' Scraping')) color = '#3b82f6';
                    return <div key={i} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color, background:'rgba(0,0,0,0.1)', borderRadius:4 }}>{linha}</div>
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function ModalComparador({ itens, onClose, userId, mlNickname }) {
  const concluidos=itens.filter(i=>i.status==='concluido'&&i.dados);
  const [meuId,setMeuId]=useState(null);
  
  const [ordem, setOrdem] = useState('preco_asc');
  const [grupo, setGrupo] = useState('todos');

  const [pergunta, setPergunta] = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [respostasQA, setRespostasQA] = useState([]);
  const taRef = useRef(null);
  const qaEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  
  useEffect(() => { qaEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [respostasQA]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  }, [pergunta]);

  if (!concluidos.length) return null;
  
  let todasOpcoes=[];
  concluidos.forEach(item=>{
    const d=item.dados;
    const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
    const linkBase = gerarLinkAnuncio(item.mlbId, ehCatalogo, item.url);
    if(d.seller?.nome&&d.preco>0) todasOpcoes.push({ mlbId:item.mlbId,titulo:d.titulo||item.mlbId,vendedor:d.seller.nome,preco:d.preco,freteGratis:d.freteGratis,link:d.link||linkBase,thumbnail:d.thumbnail,vendidos:d.vendas||d.vendidos, vendasStr: d.vendasStr, vendasNum: d.vendasNum, estoque:d.estoque,ehPrincipal:true, desconto:d.desconto, envio:d.envio, perfilLoja: d.seller.perfilLoja, posicao: d.posicao, pagina: d.pagina });
    (d.concorrentes||[]).forEach(c=>{if(c.preco>0) todasOpcoes.push({ mlbId:c.mlbId||item.mlbId,titulo:c.titulo||d.titulo,vendedor:c.nome,preco:c.preco,precoOriginal:c.precoOriginal,desconto:c.desconto,freteGratis:c.freteGratis,envio:c.envio,link:c.link||linkBase,thumbnail:c.thumbnail||d.thumbnail,vendidos:c.vendas||c.vendidos, vendasStr: c.vendasStr, vendasNum: c.vendasNum, estoque:c.estoque,ehPrincipal:false, perfilLoja: c.perfilLoja, posicao: c.posicao, pagina: c.pagina });});
  });

  if (grupo === 'unicos') {
     const seen = new Set();
     todasOpcoes = todasOpcoes.filter(c => {
         if (seen.has(c.vendedor)) return false;
         seen.add(c.vendedor); return true;
     });
  } else if (grupo === 'agrupados') {
     const map = new Map();
     todasOpcoes.forEach(c => {
        if (map.has(c.vendedor)) { map.get(c.vendedor).count += 1; }
        else { map.set(c.vendedor, { ...c, count: 1 }); }
     });
     todasOpcoes = Array.from(map.values()).map(c => ({...c, nomeExibicao: `${c.vendedor} (x${c.count})`}));
  } else {
     todasOpcoes = todasOpcoes.map(c => ({...c, nomeExibicao: c.vendedor}));
  }

  todasOpcoes.sort((a,b) => {
      if (ordem === 'preco_asc') return a.preco - b.preco;
      if (ordem === 'posicao_asc') return a.posicao - b.posicao;
      if (ordem === 'vendas_desc') return parseVendas(b.vendasStr || b.vendasNum) - parseVendas(a.vendasStr || a.vendasNum);
      return 0;
  });

  useEffect(() => {
    if (mlNickname && !meuId && todasOpcoes.length > 0) {
      const match = todasOpcoes.find(o => o.vendedor && o.vendedor.toUpperCase() === mlNickname.toUpperCase());
      if (match) setMeuId(match.vendedor);
    }
  }, [mlNickname, todasOpcoes, meuId]);
  
  const menorPreco=todasOpcoes.length? Math.min(...todasOpcoes.map(o=>o.preco)) :0;
  const maiorPreco=todasOpcoes.length? Math.max(...todasOpcoes.map(o=>o.preco)) :0;
  const mediaPreco=todasOpcoes.length?todasOpcoes.reduce((s,o)=>s+o.preco,0)/todasOpcoes.length:0;
  const meuAnuncio=meuId?todasOpcoes.find(o=>o.vendedor===meuId):null;
  
  const prefixoTexto = (meuId && mlNickname && meuId.toUpperCase() === mlNickname.toUpperCase()) ? 'Você está' : 'O vendedor destacado está';
  const vantagem=op=>{
     if(!meuAnuncio||op.vendedor===meuAnuncio.vendedor)return null;
     const diff=meuAnuncio.preco-op.preco;
     const pct=Math.abs(diff/meuAnuncio.preco*100).toFixed(1);
     if(diff>0)return{tipo:'perda',msg:`${prefixoTexto} ${pct}% mais caro`};
     if(diff<0)return{tipo:'ganho',msg:`${prefixoTexto} ${pct}% mais barato`};
     return{tipo:'igual',msg:'Mesmo preço'};
  };

  const grafDados=todasOpcoes.slice(0,8).map(o=>({label:o.vendedor?.substring(0,10)||'—',valor:o.preco,cor:o.vendedor===meuId?'#3b82f6':o.preco===menorPreco?'#10b981':'#94a3b8'}));
  
  const paginasTotal = [...new Set(todasOpcoes.map(o => o.pagina).filter(Boolean))].sort((a,b)=>a-b);

  const enviarPergunta = async () => {
    if (!pergunta.trim() || respondendo) return;
    const q = pergunta.trim(); setPergunta(''); setRespondendo(true);
    setRespostasQA(prev => [...prev, { tipo:'pergunta', texto: q }]);

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/research/deep-market`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({ userId, itens: concluidos.map(i=>i.dados), perguntaFollowUp: `Comando: ${q}\nRegra: NUNCA crie o relatório de 4 tópicos. Responda apenas a minha pergunta de forma super curta, direta e cirúrgica sobre a concorrência.`, contextoAnterior: `Estou na tela de Comparador de Preços. Tabela top 10: ${JSON.stringify(todasOpcoes.slice(0,10))}` }),
      });
      const reader=res.body.getReader(); const decoder=new TextDecoder();
      let buffer=''; let ev=null; let respostaAcumulada='';
      while(true){
        const{value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split('\n');buffer=lines.pop();
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{ const data=JSON.parse(line.slice(6)); if(ev==='done') respostaAcumulada = data.conteudoHtml||data.relatorio||''; }catch{}
            ev=null;
          }
        }
      }
      let safeHtml = respostaAcumulada.replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/<br\s*\/?>/gi, '\n').replace(/\n/g, '<br>');
      setRespostasQA(prev => [...prev, { tipo:'resposta', html: safeHtml }]);
    } catch(e) { 
      if (e.name === 'AbortError') {
        setRespostasQA(prev => [...prev, { tipo:'resposta', html: `<span style="color:#f59e0b">Análise interrompida.</span>` }]);
      } else {
        setRespostasQA(prev => [...prev, { tipo:'resposta', html: `<span style="color:#ef4444">Erro: ${e.message}</span>` }]); 
      }
    } 
    finally { setRespondendo(false); }
  };

  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarPergunta(); } };
  const SUGESTOES = [ 'Quem devo cobrir agora?', 'Qual é o preço ideal?', 'O frete influencia muito?' ];

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:1000,maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid rgba(59, 130, 246, 0.3)',color:'var(--theme-text)',borderRadius:20,boxShadow:'0 30px 80px rgba(0,0,0,0.6), 0 0 20px rgba(59, 130, 246, 0.15)',display:'flex',flexDirection:'column',overflow:'hidden', position:'relative' }}>
          
          <div style={{ padding:'18px 24px',background:'linear-gradient(135deg, var(--theme-header), #0f172a)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0, position:'relative', overflow:'hidden' }}>
            <div className="ia-header-glow" style={{ position:'absolute', top:0, left:0, right:0, height:'2px', background:'linear-gradient(90deg, transparent, #3b82f6, #10b981, transparent)', animation:'slideGrad 2s linear infinite' }} />
            <div style={{ display:'flex',alignItems:'center',gap:12, zIndex:1 }}>
              <div style={{ background:'rgba(255,230,0,0.1)', padding:8, borderRadius:12 }}><BarChart2 style={{ width:24,height:24,color:'#FFE600' }}/></div>
              <div><p style={{ fontSize:16,fontWeight:900,color:'#fff', lineHeight:1.2 }}>Comparador de Concorrentes</p><p style={{ fontSize:11,color:'rgba(255,255,255,0.5)', marginTop:2 }}>{todasOpcoes.length} opções mapeadas de {concluidos.length} anúncio(s)</p></div>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center', zIndex:1 }}>
              <MenuExportacao
                onExport={(f, pg) => exportarDadosComplexos(f, concluidos.map(i=>({dados:i.dados,mlbId:i.mlbId,url:i.url})), 'Comparador de Preços', null, pg)}
                paginasDisponiveis={paginasTotal}
              />
              <button onClick={onClose} style={{ background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'50%', cursor:'pointer',color:'rgba(255,255,255,0.4)', padding:6, transition:'all 0.2s' }}><X style={{ width:18,height:18 }}/></button>
            </div>
          </div>

          <div style={{ display:'grid',gridTemplateColumns:'1fr 1.2fr',gap:0,flex:1,overflow:'hidden' }}>
            <div style={{ overflowY:'auto',borderRight:'1px solid var(--theme-card-border)', display:'flex', flexDirection:'column' }}>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',borderBottom:'1px solid var(--theme-card-border)', background:'rgba(0,0,0,0.05)' }}>
                {[{l:'Menor Preço',v:fmt(menorPreco),c:'#10b981'},{l:'Preço Médio',v:fmt(mediaPreco),c:'#f59e0b'},{l:'Maior Preço',v:fmt(maiorPreco),c:'#ef4444'}].map(({l,v,c},i)=>(
                  <div key={l} style={{ padding:'16px 16px',borderRight:i<2?'1px solid var(--theme-card-border)':'none', textAlign:'center' }}>
                    <p style={{ fontSize:20,fontWeight:900,color:c }}>{v}</p><p style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',opacity:0.5,marginTop:4 }}>{l}</p>
                  </div>
                ))}
              </div>
              <div style={{ padding:'16px' }}><GraficoBarras dados={grafDados} titulo="Comparação visual de mercado"/></div>
              <div style={{ padding:'0 16px 16px',borderTop:'1px solid var(--theme-card-border)', borderBottom:'1px solid var(--theme-card-border)' }}>
                <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'#3b82f6',marginBottom:8,marginTop:16, display:'flex', alignItems:'center', gap:4 }}><Zap size={14}/> {meuId && mlNickname && meuId.toUpperCase() === mlNickname.toUpperCase() ? 'Seu anúncio detectado:' : 'Destacar um vendedor na tabela:'}</p>
                <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                  {[...new Set(todasOpcoes.map(o=>o.vendedor))].slice(0,10).map(nome=>(
                    <button key={nome} onClick={()=>setMeuId(meuId===nome?null:nome)} style={{ padding:'6px 12px',borderRadius:10,border:`1px solid ${meuId===nome?'#3b82f6':'var(--theme-card-border)'}`,background:meuId===nome?'#eff6ff':'var(--theme-sidebar)',color:meuId===nome?'#1d4ed8':'var(--theme-text)',fontSize:11,fontWeight:900,cursor:'pointer', transition:'all 0.2s' }}>{nome}</button>
                  ))}
                </div>
                {meuAnuncio&&<div style={{ marginTop:14,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.3)',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12 }}><span style={{ fontSize:11,fontWeight:900,color:'#3b82f6', textTransform:'uppercase' }}>{meuId && mlNickname && meuId.toUpperCase() === mlNickname.toUpperCase() ? 'Você:' : 'Destacado:'}</span><span style={{ fontSize:20,fontWeight:900,color:'#3b82f6' }}>{fmt(meuAnuncio.preco)}</span>{meuAnuncio.preco===menorPreco?<span style={{ fontSize:11,fontWeight:900,color:'#059669',background:'#ecfdf5',border:'1px solid #a7f3d0',padding:'4px 10px',borderRadius:20, display:'flex', alignItems:'center', gap:4 }}><Medal size={12}/> Líder de Preço</span>:<span style={{ fontSize:11,fontWeight:900,color:'#dc2626',background:'#fee2e2',border:'1px solid #fca5a5',padding:'4px 10px',borderRadius:20, display:'flex', alignItems:'center', gap:4 }}><TrendingUp size={12}/> {((meuAnuncio.preco/menorPreco-1)*100).toFixed(1)}% acima</span>}</div>}
              </div>

              <div style={{ flex:1, display:'flex', flexDirection:'column', background:'var(--theme-chat-bg, var(--theme-sidebar))', padding:'16px' }}>
                <div style={{ flex:1, overflowY:'auto', marginBottom:12, paddingRight:4 }} className="ia-scroll">
                  {respostasQA.length === 0 ? (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, opacity:0.3, justifyContent:'center', height:'100%' }}>
                      <Sparkles size={32}/> 
                      <p style={{ fontSize:12, fontWeight:900, textTransform:'uppercase' }}>Fale com a IA sobre a análise</p>
                    </div>
                  ) : respostasQA.map((item, i) => (
                    item.tipo === 'pergunta' ? (
                      <div key={i} style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
                        <div style={{ background:'var(--theme-user-bubble, #f0f0f0)', color:'var(--theme-user-text, #333)', border:'1px solid var(--theme-card-border)', borderRadius:'18px 18px 4px 18px', padding:'10px 14px', maxWidth:'85%', fontSize:13, lineHeight:1.5, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                          {item.texto}
                        </div>
                      </div>
                    ) : (
                      <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:12 }}>
                        <div style={{ flexShrink:0, marginTop:2 }}>
                          <AnalyizStar size={22} active={false} dark={true}/>
                        </div>
                        <div style={{ flex:1, color:'var(--theme-text)', fontSize:13, lineHeight:1.6 }} dangerouslySetInnerHTML={{ __html: item.html }} />
                      </div>
                    )
                  ))}
                  {respondendo && (
                    <div style={{ display:'flex', gap:12, alignItems:'center', paddingLeft:32 }}>
                      <AnalyizStar size={20} active={true} dark={true}/>
                      <span style={{ fontSize:12, color:'#8b5cf6', fontStyle:'italic' }}>Analisando dados...</span>
                    </div>
                  )}
                  <div ref={qaEndRef}/>
                </div>
                <div style={{ flexShrink:0 }}>
                  {respostasQA.length === 0 && !respondendo && (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                      {SUGESTOES.map(q => (
                        <button key={q} onClick={() => setPergunta(q)} style={{ fontSize:10, padding:'6px 12px', borderRadius:16, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', cursor:'pointer', opacity:0.8, fontFamily:"'Google Sans',sans-serif", maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'all 0.2s', ':hover':{background:'var(--theme-sidebar)', opacity:1} }}>
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ background:'var(--theme-card)', border:`1.5px solid ${pergunta.trim() ? 'rgba(138,180,248,0.45)' : 'var(--theme-card-border)'}`, borderRadius:24, padding:'10px 14px', display:'flex', alignItems:'flex-end', gap:10, transition:'all 0.2s', boxShadow: pergunta.trim() ? '0 0 0 2px rgba(138,180,248,0.08)' : 'none' }}>
                    <textarea ref={taRef} value={pergunta} onChange={e => setPergunta(e.target.value)} onKeyDown={handleKeyDown} placeholder={respondendo ? 'A IA está processando...' : 'Pergunte qualquer coisa...'} rows={1} style={{ flex:1, background:'transparent', border:'none', outline:'none', resize:'none', color:'var(--theme-text)', fontSize:13, fontFamily:"'Google Sans',sans-serif", maxHeight:120, lineHeight:1.5, overflowY:'auto' }} />
                    {respondendo ? (
                       <button onClick={() => abortControllerRef.current?.abort()} style={{ width:34, height:34, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#ef4444', color:'#fff', border:'none', cursor:'pointer', transition:'all 0.2s' }}>
                         <Square size={13} fill="currentColor"/>
                       </button>
                    ) : (
                       <button onClick={enviarPergunta} disabled={!pergunta.trim()} style={{ width:34, height:34, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: pergunta.trim() ? '#8ab4f8' : 'transparent', color: pergunta.trim() ? '#1e1f20' : 'var(--theme-text)', border: pergunta.trim() ? 'none' : '1px solid var(--theme-card-border)', cursor: pergunta.trim() ? 'pointer':'default', opacity: pergunta.trim() ? 1:0.3, transition:'all 0.2s' }}>
                         <Send size={15} style={{ marginLeft:2 }}/>
                       </button>
                    )}
                  </div>
                  <p style={{ textAlign:'center', fontSize:10, color:'var(--theme-text)', opacity:0.4, marginTop:6, fontFamily:"'Google Sans',sans-serif" }}>Analyiz pode cometer erros. Verifique informações importantes.</p>
                </div>
              </div>

            </div>
            <div style={{ overflowY:'auto' }} className="ia-scroll">
              <div style={{ padding: '12px 16px', background: 'var(--theme-sidebar)', borderBottom: '1px solid var(--theme-card-border)' }}>
                 <DropdownFiltros ordem={ordem} setOrdem={setOrdem} grupo={grupo} setGrupo={setGrupo} />
              </div>
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead style={{ background:'var(--theme-sidebar)',position:'sticky',top:0, zIndex:10, boxShadow:'0 2px 4px rgba(0,0,0,0.1)' }}>
                  <tr>{['Rank','Vendedor','Preço','Infos','Análise'].map((h,i)=><th key={i} style={{ padding:'12px 14px',fontSize:10,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)', opacity:0.6,textAlign:'left',borderBottom:'1px solid var(--theme-card-border)' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {todasOpcoes.map((op,i)=>{
                    const isMeu = meuId && op.vendedor === meuId;
                    const vant = vantagem(op);
                    const labelMeu = (meuId && mlNickname && meuId.toUpperCase() === mlNickname.toUpperCase()) ? '◀ Seu Anúncio' : '◀ Em Destaque';
                    const labelBadge = (meuId && mlNickname && meuId.toUpperCase() === mlNickname.toUpperCase()) ? 'Seu Anúncio' : 'Em Destaque';
                    return (
                      <tr key={i} style={{ background:isMeu?'rgba(59,130,246,0.08)':i===0?'rgba(16,185,129,0.05)':undefined,borderBottom:'1px solid var(--theme-card-border)', transition:'background 0.2s' }}>
                        <td style={{ padding:'12px 14px',width:40, textAlign:'center' }}>{i===0?<Medal style={{ width:18,height:18,color:'#f59e0b' }}/>:i===1?<Award style={{ width:18,height:18,color:'#94a3b8' }}/>:<span style={{ fontSize:12,opacity:0.4,fontWeight:900 }}>{i+1}</span>}</td>
                        <td style={{ padding:'12px 14px' }}>
                          <span style={{ fontSize:13,fontWeight:900,color:isMeu?'#3b82f6':'var(--theme-text)' }}>{op.nomeExibicao}</span>
                          {isMeu&&<span style={{ display:'block',fontSize:9,fontWeight:900,color:'#3b82f6',textTransform:'uppercase',marginTop:2 }}>{labelMeu}</span>}
                          <a href={op.perfilLoja || gerarLinkVendedor(op.vendedor)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, color:'#8b5cf6', textDecoration:'none', marginTop:4, fontWeight:700 }}><ExternalLink size={9}/> Perfil ML</a>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <p style={{ fontSize:16,fontWeight:900,color:i===0?'#10b981':isMeu?'#3b82f6':'var(--theme-text)' }}>{fmt(op.preco)}</p>
                          {op.desconto&&<span style={{ display:'inline-block', fontSize:10,fontWeight:900,color:'#059669',background:'#dcfce7',padding:'2px 6px',borderRadius:20, marginTop:4, border:'1px solid #86efac' }}>{op.desconto}</span>}
                        </td>
                        <td style={{ padding:'12px 14px',fontSize:11,fontWeight:700 }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {op.envio ? <span style={{ color:'#10b981' }}>{op.envio}</span> : (op.freteGratis ? <span style={{ color:'#10b981' }}>✓ Frete Grátis</span> : <span style={{ opacity:0.5 }}>Frete Pago</span>)}
                            {op.vendasStr && <span style={{ color:'#f59e0b', background:'rgba(245, 158, 11, 0.1)', padding:'2px 6px', borderRadius:4, display:'inline-block', width:'fit-content' }}>{formatarVendasMercado(op.vendasStr, op.vendasNum)}</span>}
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          {vant&&!isMeu?<span style={{ fontSize:10,fontWeight:900,color:vant.tipo==='ganho'?'#059669':'#dc2626',background:vant.tipo==='ganho'?'#ecfdf5':'#fee2e2',border:`1px solid ${vant.tipo==='ganho'?'#a7f3d0':'#fca5a5'}`,padding:'4px 10px',borderRadius:20,display:'inline-block', whiteSpace:'nowrap' }}>{vant.msg}</span>:isMeu?<span style={{ fontSize:10,fontWeight:900,color:'#1d4ed8',background:'#eff6ff',border:'1px solid #bfdbfe',padding:'4px 10px',borderRadius:20, whiteSpace:'nowrap' }}>{labelBadge}</span>:null}
                          {op.link&&<a href={op.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:6,padding:'4px 10px',borderRadius:8,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textDecoration:'none', transition:'all 0.2s' }}><ExternalLink style={{ width:12,height:12 }}/>Ver Anúncio</a>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// RESTO DO ARQUIVO MANTEVE-SE IGUAL (ModalPesquisaMercado, Cards, Main UI...)
// Os logs e chamadas seguem a mesma base otimizada acima.

export default function MlResearch() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const [aba,                setAba]                = useState('pesquisa');
  const [subAbaHist,         setSubAbaHist]         = useState('itens');
  const [inputTexto,         setInputTexto]         = useState('');
  const [mostrarInput,       setMostrarInput]  = useState(false);
  const [mlConectado,        setMlConectado]   = useState(false);
  const [mlNickname,         setMlNickname]    = useState(null);
  const [rodando,            setRodando]       = useState(false);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  
  const [filtroStatus,       setFiltroStatus]  = useState('todos');
  const [filtroData,         setFiltroData]    = useState('');
  const [filtroPagina,       setFiltroPagina]  = useState('todas');
  const [termoBusca,         setTermoBusca]    = useState('');
  const [ordemData,          setOrdemData]      = useState('desc');
  const [tagAtiva,           setTagAtiva]       = useState('todas');
  const [paginaAtual,        setPaginaAtual]   = useState(1);
  const [itensPorPagina,     setItensPorPagina] = useState(30);

  const [log,                setLog]                = useState([]);
  const [selecionados,       setSelecionados]  = useState(new Set());
  const [modalAberto,        setModalAberto]   = useState(null);
  const [showComparador, setShowComparador] = useState(false);
  const [showRaioX,          setShowRaioX]        = useState(false);
  const [showDica,           setShowDica]         = useState(false);

  const [dadosPlanilha, setDadosPlanilha] = useState([]);

  const [showPesquisaModal, setShowPesquisaModal] = useState(false);
  const [pesquisaInicialData, setPesquisaInicialData] = useState({ pesquisaIA: null, gerandoPesquisa: false, logsPesquisa: [] });
  const [analiseVista,    setAnaliseVista]    = useState(null);
  const [itensParaAnaliseIA, setItensParaAnaliseIA] = useState([]);
  const [showAutoRetry,  setShowAutoRetry]  = useState(false);

  const [itens, setItensRaw] = useState(() => {
    try { const s=localStorage.getItem(LS_KEY); return s?JSON.parse(s):[]; } catch { return []; }
  });
  const setItens = useCallback((fn) => {
    setItensRaw(prev => {
      const next=typeof fn==='function'?fn(prev):fn;
      const toSave=next.map(i=>i.status==='analisando'?{...i,status:'pendente'}:i);
      try { localStorage.setItem(LS_KEY,JSON.stringify(toSave)); } catch {}
      return next;
    });
  }, []);

  const [historico,        setHistorico]        = useState([]);
  const [arquivados,       setArquivados]       = useState([]);
  const [analisesMercado, setAnalisesMercado] = useState([]);
  const [loadingHist,      setLoadingHist]      = useState(false);
  const [selHist,          setSelHist]          = useState(new Set());
  const [contHist,         setContHist]         = useState({ historico:0, arquivados:0 });

  const rodandoRef = useRef(false);
  const abortRef   = useRef(false);
  const logEndRef  = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { if (logEndRef.current && isTerminalExpanded) logEndRef.current.scrollIntoView({ behavior:'smooth' }); }, [log, isTerminalExpanded]);
  useEffect(() => { if (rodando) setIsTerminalExpanded(true); }, [rodando]);

  useEffect(() => {
    if (!userId) return;
    
    fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`)
      .then(r=>r.json())
      .then(d=>{
         setMlConectado(d.connected&&!d.expired);
         if(d.nickname) setMlNickname(d.nickname);
         else if(d.mlbUsername) setMlNickname(d.mlbUsername);
         else if(d.user?.nickname) setMlNickname(d.user.nickname);
      }).catch(()=>{});

    Promise.all([
      fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=false`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=true`).then(r=>r.json()).catch(()=>[]),
    ]).then(([hist,arq]) => {
      if (Array.isArray(hist)) { setHistorico(hist); setContHist(prev=>({...prev,historico:hist.length})); }
      if (Array.isArray(arq))  { setArquivados(arq); setContHist(prev=>({...prev,arquivados:arq.length})); }
    });
    fetch(`${API_BASE_URL}/api/ml/research/market-analyses?userId=${userId}`).then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setAnalisesMercado(d); }).catch(()=>{});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (aba==='historico')  buscarHistorico(false);
    if (aba==='arquivados') buscarHistorico(true);
    if (aba==='historico'||aba==='pesquisa') buscarAnalisesMercado();
  }, [aba, userId]);

  const addLog = useCallback((msg,tipo='info') => {
    const ts=new Date().toLocaleTimeString('pt-BR');
    setLog(prev=>[...prev.slice(-100),{msg,tipo,ts}]);
  }, []);

  const buscarHistorico = useCallback(async (arq) => {
    if (!userId) return;
    setLoadingHist(true);
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=${arq}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      const lista=Array.isArray(data)?data:[];
      if (arq) { setArquivados(lista); setContHist(prev=>({...prev,arquivados:lista.length})); }
      else     { setHistorico(lista);  setContHist(prev=>({...prev,historico:lista.length})); }
    } catch(e) { console.warn('[Histórico]',e.message); }
    finally { setLoadingHist(false); }
  }, [userId]);

  const buscarAnalisesMercado = useCallback(async () => {
    if (!userId) return;
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/market-analyses?userId=${userId}`);
      if (res.ok) { const d=await res.json(); if(Array.isArray(d)) setAnalisesMercado(d); }
    } catch {}
  }, [userId]);

  const arquivarHist   = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/arquivar`,{method:'PUT'}); buscarHistorico(false); };
  const restaurarHist  = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/restaurar`,{method:'PUT'}); buscarHistorico(true); };
  const excluirHist    = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const excluirDefHist = async id => { if (!window.confirm('Excluir permanentemente?')) return; await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/definitivo`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const excluirAnalise = async id => { if (!window.confirm('Excluir esta análise?')) return; await fetch(`${API_BASE_URL}/api/ml/research/market-analyses/${id}`,{method:'DELETE'}); buscarAnalisesMercado(); };
  const acaoLoteHist   = async acao => {
    const ids=[...selHist]; if(!ids.length) return;
    if(acao==='arquivar') await fetch(`${API_BASE_URL}/api/ml/research/historico/lote/arquivar`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    if(acao==='excluir')  await fetch(`${API_BASE_URL}/api/ml/research/historico/lote`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    setSelHist(new Set()); buscarHistorico(aba==='arquivados');
  };

  const recarregarDoHistorico = item => {
    setAba('pesquisa');
    setTimeout(() => {
      if (!item.mlbId) return;
      if (!itens.find(i=>i.mlbId===item.mlbId)) {
        setItens(prev=>[...prev,{id:`${item.mlbId}-${Date.now()}`,mlbId:item.mlbId,url:item.urlOriginal||item.mlbId,status:'pendente',dados:null,erro:null}]);
      }
    }, 100);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    let todosExtraidos = [];
    let lidasTemp = [];
    
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (data.length > 0) {
            lidasTemp.push({ 
              id: Date.now() + Math.random(),
              nome: `${file.name} - ${sheetName}`, 
              dados: data,
              dataImportacao: new Date().toISOString(),
              minimized: true
            });
            
            const headers = (data[0] || []).map(h => String(h || '').toLowerCase().trim());
            const cMlb = headers.findIndex(h => h.includes('mbl') || h.includes('mlb') || h === 'id');
            const cPag = headers.findIndex(h => h.includes('página') || h.includes('pagina'));
            const cPos = headers.findIndex(h => h.includes('posi'));
            const cPrecoSem = headers.findIndex(h => h.includes('sem promo'));
            const cPromo = headers.findIndex(h => h.includes('% promo') || h.includes('desconto'));
            const cTipo = headers.findIndex(h => h.includes('tipo'));
            const cEnvio = headers.findIndex(h => h.includes('envio'));
            const cVendas = headers.findIndex(h => h === 'vendas' || h.includes('vendas'));
            const cVendedor = headers.findIndex(h => h === 'vendedor');
            const cLink = headers.findIndex(h => h === 'url origem' || h === 'link' || h === 'url');

            for (let i = 1; i < data.length; i++) {
              const row = data[i];
              if (!row || row.length === 0) continue;
              
              let mlbId = null;
              let originalUrl = null;

              if (cMlb !== -1 && row[cMlb]) {
                 mlbId = extrairMLBId(String(row[cMlb]));
                 originalUrl = String(row[cMlb]);
              }
              if (cLink !== -1 && row[cLink]) {
                 originalUrl = String(row[cLink]);
                 if(!mlbId) mlbId = extrairMLBId(originalUrl);
              }

              if (!mlbId) {
                for (let cell of row) {
                  const ext = extrairMLBId(String(cell||''));
                  if (ext) { mlbId = ext; originalUrl = String(cell); break; }
                }
              }

              if (mlbId) {
                todosExtraidos.push({
                  mlbId,
                  url: originalUrl,
                  metaPlanilha: {
                    pagina: cPag !== -1 ? row[cPag] : '—',
                    posicao: cPos !== -1 ? row[cPos] : '—',
                    precoSemPromo: cPrecoSem !== -1 ? row[cPrecoSem] : '—',
                    promo: cPromo !== -1 ? row[cPromo] : '—',
                    tipoAnuncio: cTipo !== -1 ? row[cTipo] : '—',
                    envio: cEnvio !== -1 ? row[cEnvio] : '—',
                    vendas: cVendas !== -1 ? row[cVendas] : '—',
                    vendedor: cVendedor !== -1 ? row[cVendedor] : '—',
                  }
                });
              }
            }
          }
        });
      } catch (err) { console.warn('Erro ao ler arquivo', file.name); }
    }
    
    if (lidasTemp.length > 0) setDadosPlanilha(prev => [...prev, ...lidasTemp]);

    if (todosExtraidos.length > 0) {
      setItens(prev => {
        const jaExiste = new Set(prev.map(i => i.mlbId));
        const novos = [];
        for (const ext of todosExtraidos) {
          if (!jaExiste.has(ext.mlbId)) {
            jaExiste.add(ext.mlbId);
            novos.push({ id: `${ext.mlbId}-${Date.now()}-${Math.random()}`, mlbId: ext.mlbId, url: ext.url, status: 'pendente', dados: null, erro: null, metaPlanilha: ext.metaPlanilha });
          }
        }
        if (novos.length > 0) { addLog(`✅ ${novos.length} anúncio(s) carregados da planilha com META DADOS!`, 'success'); return [...prev, ...novos]; }
        return prev;
      });
      setMostrarInput(false); setAba('pesquisa');
    }
    e.target.value = '';
  };

  const processarInput = () => {
    if (!inputTexto.trim()) return;
    const linhas=inputTexto.split(/[\n,;]+/).map(l=>l.trim()).filter(Boolean);
    const novos=[];
    const jaExiste=new Set(itens.map(i=>i.mlbId));
    for (const linha of linhas) {
      const mlbId=extrairMLBId(linha);
      if (!mlbId) { addLog(`⚠️ Formato ignorado: ${linha.substring(0,30)}`,'warn'); continue; }
      if (jaExiste.has(mlbId)) { addLog(`ℹ️ ${mlbId} já está na lista`); continue; }
      jaExiste.add(mlbId);
      novos.push({ id:`${mlbId}-${Date.now()}-${Math.random()}`,mlbId,url:linha,status:'pendente',dados:null,erro:null });
    }
    if (!novos.length) { addLog('Nenhum link novo válido.','warn'); return; }
    setItens(prev=>[...prev,...novos]);
    setInputTexto('');
    addLog(`✅ ${novos.length} anúncio(s) adicionados`,'success');
    setMostrarInput(false);
  };

  const buscarAnuncio = useCallback((mlbId, url) => {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ userId });
      if (url) params.set('urlOriginal', url);

      fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?${params}`, { signal: AbortSignal.timeout(120000) })
      .then(res => { if (!res.ok) { return res.json().then(j => reject(new Error(j.error || `HTTP ${res.status}`))).catch(() => reject(new Error(`HTTP ${res.status}`))); } return res.json(); })
      .then(data => resolve(data)).catch(reject);
    });
  }, [userId]);

  const executarFila = useCallback(async (ids) => {
    if (rodandoRef.current) return;
    rodandoRef.current=true; abortRef.current=false; setRodando(true); setShowAutoRetry(false);
    addLog(`🚀 Analisando ${ids.length} anúncio(s)...`,'success');
    
    const retentar=[];
    
    for (let i=0;i<ids.length;i++) {
      if (abortRef.current) break;
      const{mlbId,url}=ids[i];
      setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando'}:it));
      addLog(`── [${i+1}/${ids.length}] ${mlbId} ──────────────`);
      
      try {
        const dados=await buscarAnuncio(mlbId,url);
        if (Array.isArray(dados.debug)) {
            dados.debug.forEach(linha => {
                let tipo = 'info';
                if (linha.includes('✅') || linha.includes('🎯')) tipo = 'success';
                else if (linha.includes('❌') || linha.includes('⚠️')) tipo = 'warn';
                addLog(`  ${linha}`, tipo);
            });
        }
        
        const{debug:_dbg,...dadosSemDebug}=dados;
        dadosSemDebug.debugLog = _dbg;

        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados:dadosSemDebug}:it));
        const numVend=dadosSemDebug.totalVendedores||(dadosSemDebug.concorrentes?.length||0)+1;
        addLog(`✅ Concluído: ${numVend} vendedor(es)`,'success');
        
        if (i < ids.length - 1 && !abortRef.current) {
          await sleep(1500); 
          if ((i + 1) % 15 === 0) { addLog(`⏳ Pausa anti-bloqueio após ${i+1} itens...`, 'info'); await sleep(10000); }
        }
      } catch(e) {
        const isTO=e.message.includes('timeout')||e.name==='TimeoutError';
        if (isTO) { 
            retentar.push({mlbId,url}); 
            setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'fila',erro:'Re-tentativa pendente...'}:it)); 
            addLog(`⏳ ${mlbId}: timeout — re-tentará`,'warn'); 
        } else { 
            setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it)); 
            addLog(`❌ ${mlbId}: ${e.message}`,'warn'); 
        }
        await sleep(1200);
      }
    }

    if (retentar.length&&!abortRef.current) {
      addLog(`🔄 Re-tentando ${retentar.length} item(s) em 5s...`);
      await sleep(5000);
      for (const{mlbId,url} of retentar) {
        if (abortRef.current) break;
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando',erro:null}:it));
        addLog(`🔄 Re-tentando ${mlbId}...`);
        try {
          const dados=await buscarAnuncio(mlbId,url);
          if (Array.isArray(dados.debug)) {
              dados.debug.forEach(linha => {
                  let tipo = 'info';
                  if (linha.includes('✅') || linha.includes('🎯')) tipo = 'success';
                  else if (linha.includes('❌') || linha.includes('⚠️')) tipo = 'warn';
                  addLog(`  ${linha}`, tipo);
              });
          }
          const{debug:_d,...dadosSemDebug}=dados; dadosSemDebug.debugLog = _d;
          setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados:dadosSemDebug}:it));
          addLog(`✅ ${mlbId} OK`,'success');
        } catch(e) { setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it)); addLog(`❌ ${mlbId}: ${e.message}`,'warn'); }
        await sleep(1000);
      }
    }
    rodandoRef.current=false; setRodando(false); addLog('🎯 Análise concluída!','success');

    setItensRaw(current => {
      const comErro = current.filter(i => i.status === 'erro' || i.status === 'fila');
      if (comErro.length > 0 && !abortRef.current) { setShowAutoRetry(true); addLog(`⚠️ ${comErro.length} item(s) com erro. Auto-retry em 30s...`, 'warn'); }
      return current;
    });
  }, [buscarAnuncio, addLog]);

  const iniciarAnalise  = () => { const ids=itens.filter(i=>['pendente','erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if(ids.length) executarFila(ids); };
  const pararAnalise    = () => { abortRef.current=true; setShowAutoRetry(false); addLog('⏹ Interrompido','warn'); };
  const reanaliarErros  = () => { setShowAutoRetry(false); const ids=itens.filter(i=>['erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if(ids.length) executarFila(ids); };
  const toggleSel       = id => setSelecionados(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  
  const removerDaTela = async (idsParaRemover) => {
    const itensToRem = itens.filter(i => idsParaRemover.includes(i.id));
    const mlbIds = itensToRem.filter(i => i.status === 'concluido').map(i => i.mlbId);
    
    if (mlbIds.length > 0 && userId) {
       try {
         const res = await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=false`);
         const hist = await res.json();
         const dbIds = [];
         if (Array.isArray(hist)) {
            mlbIds.forEach(mlbId => {
               const entrada = hist.find(h => h.mlbId === mlbId);
               if (entrada) dbIds.push(entrada.id);
            });
         }
         if (dbIds.length > 0) {
            await fetch(`${API_BASE_URL}/api/ml/research/historico/lote/arquivar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: dbIds }) });
            addLog(`📦 ${dbIds.length} item(s) movido(s) para os Arquivados.`,'success');
            buscarHistorico(false); buscarHistorico(true);
         }
       } catch (e) { console.error('Erro ao arquivar itens', e); }
    }

    setItens(prev => prev.filter(i => !idsParaRemover.includes(i.id)));
    setSelecionados(prev => { const n = new Set(prev); idsParaRemover.forEach(id => n.delete(id)); return n; });
  };

  const removerItem = id => removerDaTela([id]);
  
  const limparTudo = () => {
    if (rodandoRef.current) return;
    if (!window.confirm('Deseja limpar a tela atual?\n\nNão se preocupe: todos os itens concluídos serão enviados em segurança para a aba "Arquivados".')) return;
    removerDaTela(itens.map(i => i.id)); setLog([]); setShowAutoRetry(false);
  };

  const dispararPesquisaMercado = async (itensAlvo) => {
    const concluidos = (itensAlvo && itensAlvo.length > 0) ? itensAlvo : itens.filter(i => selecionados.has(i.id) && i.status === 'concluido');
    if (!concluidos.length) { addLog('Nenhum item concluído selecionado para análise.', 'warn'); return; }
    setItensParaAnaliseIA(concluidos); setShowPesquisaModal(true);
  };

  const salvarPesquisaNoHistorico = async (dadosIA) => {
    if (!dadosIA) return;
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/market-save`,{ method:'POST',headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId,...dadosIA }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addLog('💾 Análise de mercado salva!','success'); setShowPesquisaModal(false); buscarAnalisesMercado();
    } catch(e) { addLog(`❌ Falha ao salvar: ${e.message}`,'warn'); }
  };

  const contagens      = { todos:itens.length,pendente:itens.filter(i=>i.status==='pendente').length,analisando:itens.filter(i=>i.status==='analisando').length,concluido:itens.filter(i=>i.status==='concluido').length,erro:itens.filter(i=>i.status==='erro').length,fila:itens.filter(i=>i.status==='fila').length };
  const temPendentes   = contagens.pendente+contagens.erro+contagens.fila>0;
  const tempoRestanteSeg = (contagens.pendente + contagens.erro + contagens.fila) * 2; // ~2s por item
  
  const tagsDisponiveis = useMemo(() => {
    const tags = new Set();
    itens.forEach(i => {
      if (i.status === 'concluido' && i.dados) {
        if (i.dados.tipoAnuncio && i.dados.tipoAnuncio !== '—') tags.add(i.dados.tipoAnuncio);
        const primeiraPalavra = i.dados.titulo?.split(' ')[0];
        if (primeiraPalavra && primeiraPalavra.length > 3 && !primeiraPalavra.match(/^[0-9]+$/)) tags.add(primeiraPalavra.toUpperCase());
      }
    });
    return ['todas', ...Array.from(tags).slice(0, 10)];
  }, [itens]);

  const paginasDisponiveis = useMemo(() => {
    const p = new Set();
    itens.forEach(i => {
      if (i.dados) {
        if (i.dados.pagina) p.add(String(i.dados.pagina));
        if (i.metaPlanilha?.pagina && i.metaPlanilha.pagina !== '—') p.add(String(i.metaPlanilha.pagina));
        (i.dados.concorrentes || []).forEach(c => { if (c.pagina) p.add(String(c.pagina)); });
        (i.dados.paginasColetadas || []).forEach(pg => p.add(String(pg)));
      }
    });
    return ['todas', ...Array.from(p).sort((a,b)=>Number(a)-Number(b))];
  }, [itens]);

  let itensFiltrados = filtroStatus==='todos'? [...itens] : itens.filter(i=>i.status===filtroStatus);
  if (filtroData) itensFiltrados = itensFiltrados.filter(i => { if (i.status !== 'concluido' || !i.dados?.analisadoEm) return false; return new Date(i.dados.analisadoEm).toISOString().split('T')[0] === filtroData; });
  if (termoBusca) {
    const term = termoBusca.toLowerCase();
    itensFiltrados = itensFiltrados.filter(i => {
       const d = i.dados || {}; const m = i.metaPlanilha || {};
       return ( (i.mlbId && i.mlbId.toLowerCase().includes(term)) || (d.titulo && d.titulo.toLowerCase().includes(term)) || (d.seller?.nome && d.seller.nome.toLowerCase().includes(term)) || (m.vendedor && m.vendedor.toLowerCase().includes(term)) || (d.preco && String(d.preco).includes(term)) );
    });
  }
  if (tagAtiva !== 'todas') itensFiltrados = itensFiltrados.filter(i => { if (i.status !== 'concluido' || !i.dados) return false; return i.dados.tipoAnuncio === tagAtiva || (i.dados.titulo && i.dados.titulo.toUpperCase().startsWith(tagAtiva)); });

  itensFiltrados.sort((a, b) => {
     const dataA = a.dados?.analisadoEm ? new Date(a.dados.analisadoEm).getTime() : parseInt(a.id.split('-')[1]) || 0;
     const dataB = b.dados?.analisadoEm ? new Date(b.dados.analisadoEm).getTime() : parseInt(b.id.split('-')[1]) || 0;
     return ordemData === 'desc' ? dataB - dataA : dataA - dataB;
  });

  const totalPaginas = Math.ceil(itensFiltrados.length / itensPorPagina);
  const itensPaginados = itensFiltrados.slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina);
  const isNewSession   = itens.length===0;

  const FILTROS=[
    {k:'todos',l:`Todos (${contagens.todos})`,ac:'var(--theme-sidebar)',cc:'var(--theme-text)',bc:'var(--theme-card-border)'},
    {k:'concluido',l:`Concluídos (${contagens.concluido})`,ac:'#ecfdf5',cc:'#059669',bc:'#a7f3d0'},
    {k:'pendente',l:`Pendentes (${contagens.pendente})`,ac:'#fef3c7',cc:'#d97706',bc:'#fde68a'},
    {k:'analisando',l:`Analisando (${contagens.analisando})`,ac:'#eff6ff',cc:'#2563eb',bc:'#bfdbfe'},
    {k:'erro',l:`Erros (${contagens.erro})`,ac:'#fee2e2',cc:'#dc2626',bc:'#fca5a5'},
    {k:'fila',l:`Fila (${contagens.fila})`,ac:'#f3e8ff',cc:'#7c3aed',bc:'#d8b4fe'},
  ];

  const btnBase = { padding:'5px 10px', borderRadius:8, border:'1px solid var(--theme-card-border)', background:'var(--theme-sidebar)', color:'var(--theme-text)', fontSize:10, fontWeight:900, textTransform:'uppercase', cursor:'pointer', display:'flex', alignItems:'center', gap:4, transition:'all 0.2s' };

  const isTerminalFloating = showPesquisaModal;
  const terminalStyle = isTerminalFloating ? {
    position: 'fixed', left: '20px', top: '8vh', bottom: '8vh', width: '320px', maxHeight: 'none',
    zIndex: 999999, boxShadow: '0 30px 80px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', animation: 'slideDown 0.3s ease'
  } : { width: isTerminalExpanded ? 340 : 50, flexShrink: 0, maxHeight: '76vh', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' };

  return (
    <div style={{ maxWidth:1280,margin:'0 auto',padding:'8px 12px',minHeight:'100vh',display:'flex',flexDirection:'column',gap:8,color:'var(--theme-text)' }}>
      <style>{`
        @keyframes slideGrad { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.9)} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        .ia-scroll::-webkit-scrollbar{width:5px} .ia-scroll::-webkit-scrollbar-track{background:transparent} .ia-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px}
      `}</style>

      {/* HEADER */}
      <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
        <button onClick={()=>navigate('/ml')} style={{ ...btnBase,padding:6 }}><ArrowLeft style={{ width:16,height:16 }}/></button>
        <div style={{ marginRight:4 }}><h2 style={{ fontSize:15,fontWeight:900,color:'var(--theme-text)',lineHeight:1 }}>Pesquisa de Anúncios</h2><p style={{ fontSize:11,color:'var(--theme-text)',opacity:0.5 }}>Preços, vendedores e concorrentes</p></div>

        <div style={{ display:'flex',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:3,gap:2,flexShrink:0 }}>
          {[{k:'pesquisa', l:'Pesquisa', Ic:Search}, {k:'planilha', l:'Tabela Excel', Ic:FileSpreadsheet}, {k:'historico', l:`Histórico (${contHist.historico})`, Ic:History}, {k:'arquivados',l:`Arquivados (${contHist.arquivados})`, Ic:Archive}].map(({k,l,Ic})=>(
            <button key={k} onClick={()=>setAba(k)} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,fontSize:10,fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:aba===k?'var(--theme-header)':'transparent',color:aba===k?'#FFE600':'var(--theme-text)',opacity:aba===k?1:0.5,whiteSpace:'nowrap',minWidth:'max-content', transition:'all 0.15s' }}><Ic style={{ width:12,height:12 }}/>{l}</button>
          ))}
        </div>

        {aba==='pesquisa' && (<button onClick={()=>setMostrarInput(v=>!v)} style={{ ...btnBase,background:mostrarInput?'#FFE600':'var(--theme-header)',color:mostrarInput?'#1e293b':'#FFE600',border:'none',padding:'6px 12px',flexShrink:0, transition:'all 0.2s' }}><Plus style={{ width:13,height:13 }}/>Adicionar Links</button>)}

        <div style={{ marginLeft:'auto',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
          {aba==='pesquisa'&&itens.length>0&&(<>
            <MenuExportacao onExport={(f, pg) => exportarDadosComplexos(f, selecionados.size > 0 ? itens.filter(i => selecionados.has(i.id) && i.status === 'concluido') : itensFiltrados.filter(i=>i.status==='concluido'), 'Relatorio_Catálogo', null, pg)} disabled={!contagens.concluido || rodando} label="Exportar Planilha" paginasDisponiveis={paginasDisponiveis} paginaFiltrada={filtroPagina} />
            {!rodando&&(contagens.erro+contagens.fila)>0&&<button onClick={reanaliarErros} style={{ ...btnBase,color:'#d97706',borderColor:'#fde68a',background:'#fef3c7' }}><RefreshCw style={{ width:13,height:13 }}/>Re-tentar</button>}
            <button onClick={limparTudo} disabled={rodando} style={{ ...btnBase,color:'#ef4444',borderColor:'#fca5a5',background:'#fee2e2' }}><Trash2 style={{ width:13,height:13 }}/>Limpar</button>
          </>)}
          {aba==='pesquisa' && (
            <div style={{ position:'relative' }}>
              <button onClick={()=>setShowDica(v=>!v)} style={{ ...btnBase,padding:6,background:showDica?'#fef9c3':'var(--theme-sidebar)',color:showDica?'#854d0e':'var(--theme-text)',borderColor:showDica?'#fde047':'var(--theme-card-border)', transition:'all 0.2s' }}><HelpCircle style={{ width:14,height:14 }}/></button>
              {showDica && (
                <Portal>
                  <div onClick={()=>setShowDica(false)} style={{ position:'fixed',inset:0,zIndex:99990 }}>
                    <div onClick={e=>e.stopPropagation()} style={{ position:'fixed',top:60,right:16,zIndex:99991,width:340,background:'#1e293b',border:'1px solid #334155',borderRadius:14,padding:18,boxShadow:'0 20px 60px rgba(0,0,0,0.5)',animation:'slideDown 0.15s ease' }}>
                      <p style={{ fontSize:12,fontWeight:900,textTransform:'uppercase',color:'#fbbf24',marginBottom:14,display:'flex',alignItems:'center',gap:6 }}><HelpCircle style={{ width:14,height:14 }}/>Dicas do Analyiz</p>
                      {[{e:'🔗',t:'Integração Livre',d:'Cole links normais, URLs de catálogo ou jogue seu Excel com a coluna "URL Origem". O sistema acha os MLB sozinho.'},{e:'🚀',t:'Motor Anti-Bot (Cascata)',d:'O terminal tenta a API oficial. Se bloqueado, aciona navegação web simulada (Puppeteer). Nunca perde dados.'},{e:'📦',t:'Filtros Avançados',d:'Na visualização de um anúncio, oculte ou some vendedores repetidos, ordene por mais vendas ou menor preço.'},{e:'🤖',t:'Agente de Pesquisa IA',d:'Selecione um ou vários anúncios na tela e clique no botão roxo "Pesquisa IA" para gerar laudos e insights em markdown.'},{e:'💾',t:'Gestão',d:'Tudo fica salvo no banco local (Aba Histórico) e você pode exportar em PDF/CSV para enviar à sua equipe.'}].map(({e,t,d})=>(
                        <div key={t} style={{ display:'flex',gap:10,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}><span style={{ fontSize:16,flexShrink:0 }}>{e}</span><div><p style={{ fontSize:12,fontWeight:900,color:'#fff',marginBottom:4 }}>{t}</p><p style={{ fontSize:11,color:'rgba(255,255,255,0.5)',lineHeight:1.5 }}>{d}</p></div></div>
                      ))}
                    </div>
                  </div>
                </Portal>
              )}
            </div>
          )}
        </div>
      </div>

      {aba === 'planilha' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {dadosPlanilha && dadosPlanilha.length > 0 ? dadosPlanilha.map((planilha) => (
            <div key={planilha.id} style={{ background: 'var(--theme-card)', borderRadius: 12, padding: 20, border: '1px solid var(--theme-card-border)', overflow: 'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: planilha.minimized ? 0 : 12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ background:'rgba(16, 185, 129, 0.1)', padding:8, borderRadius:10 }}><FileSpreadsheet size={18} style={{ color: '#10b981' }}/></div>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 900, color: 'var(--theme-text)' }}>{planilha.nome}</h3>
                    <p style={{ fontSize: 10, color: 'var(--theme-text)', opacity: 0.5, marginTop:2 }}>Histórico de importação em arquivo • {safeDate(planilha.dataImportacao)}</p>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                   <button onClick={() => setDadosPlanilha(prev => prev.map(p => p.id === planilha.id ? {...p, minimized: !p.minimized} : p))} style={{ padding:'6px 12px', borderRadius:8, background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', cursor:'pointer', fontSize:10, fontWeight:900 }}>{planilha.minimized ? 'Expandir Visualização' : 'Minimizar'}</button>
                   <button onClick={() => setDadosPlanilha(prev => prev.filter(p => p.id !== planilha.id))} className="ia-tip" data-tip="Apagar importação" style={{ padding:'6px', borderRadius:8, background:'#fee2e2', border:'1px solid #fca5a5', color:'#ef4444', cursor:'pointer' }}><Trash2 size={14}/></button>
                </div>
              </div>
              
              {!planilha.minimized && (
                <div style={{ overflowX: 'auto', maxHeight: '60vh', borderTop:'1px solid var(--theme-card-border)', paddingTop:12 }} className="ia-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--theme-sidebar)', zIndex: 10 }}>
                      <tr>
                        {planilha.dados[0]?.map((col, i) => <th key={i} style={{ padding: '10px 14px', borderBottom: '2px solid var(--theme-card-border)', fontWeight: 900, color: 'var(--theme-text)', opacity: 0.7, whiteSpace: 'nowrap' }}>{col || `Coluna ${i + 1}`}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {planilha.dados.slice(1).map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {planilha.dados[0]?.map((_, cIdx) => (
                            <td key={cIdx} style={{ padding: '8px 14px', whiteSpace: 'nowrap', color: 'var(--theme-text)', opacity: 0.9 }}>{row[cIdx] !== undefined ? row[cIdx] : ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )) : (
            <div style={{ background: 'var(--theme-card)', border: '1px dashed var(--theme-card-border)', borderRadius: 14, padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <FileSpreadsheet style={{ width: 40, height: 40, color: 'var(--theme-text)', opacity: 0.2 }}/>
              <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: 'var(--theme-text)', opacity: 0.4 }}>Nenhuma planilha carregada</p>
              <button onClick={() => setMostrarInput(true)} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, background: 'var(--theme-sidebar)', color: 'var(--theme-text)', border: '1px solid var(--theme-card-border)', cursor: 'pointer', fontWeight: 700 }}>Fazer Upload Agora</button>
            </div>
          )}
        </div>
      )}

      {aba==='pesquisa' && (<>
        {mostrarInput && (
          <Portal>
            <div onClick={()=>setMostrarInput(false)} style={{ position:'fixed',inset:0,zIndex:99998,background:'rgba(15,23,42,0.6)', backdropFilter:'blur(2px)' }}>
              <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:'10%', left:'50%', transform:'translateX(-50%)', width:'600px', maxWidth:'96vw', background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', borderRadius:'16px', padding:'24px', boxShadow:'0 30px 80px rgba(0,0,0,0.6)', animation:'slideDown 0.2s ease' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                   <p style={{ fontSize:15, fontWeight:900, textTransform:'uppercase', display:'flex', alignItems:'center', gap:8, color:'var(--theme-text)' }}><Search style={{ width:18, height:18, color:'var(--theme-accent)' }}/> Importação Central de Anúncios</p>
                   <button onClick={()=>setMostrarInput(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--theme-text)', opacity:0.4 }}><X style={{ width:20, height:20 }}/></button>
                </div>
                
                <p style={{ fontSize:11, color:'var(--theme-text)', opacity:0.6, marginBottom:10 }}>Cole os links do Mercado Livre (um por linha), IDs diretos (ex: MLB12345) ou faça upload de um arquivo Excel/CSV.</p>
                
                <textarea autoFocus value={inputTexto} onChange={e=>setInputTexto(e.target.value)} placeholder={"https://produto.mercadolivre.com.br/MLB-12345-nome-_JM\nhttps://www.mercadolivre.com.br/p/MLB56789/s\nMLB987654321"} style={{ width:'100%', border:'1px solid var(--theme-card-border)', borderRadius:12, padding:'14px', fontSize:13, fontFamily:'monospace', outline:'none', resize:'none', background:'var(--theme-sidebar)', color:'var(--theme-text)', boxSizing:'border-box', marginBottom:16 }} rows={7} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){processarInput();setMostrarInput(false);}}} />
                
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                   <div style={{ flex:1, height:1, background:'var(--theme-card-border)' }}/>
                   <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', opacity:0.4 }}>OU</span>
                   <div style={{ flex:1, height:1, background:'var(--theme-card-border)' }}/>
                </div>

                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--theme-sidebar)', padding:'14px 16px', borderRadius:12, border:'1px dashed var(--theme-card-border)', marginBottom:16 }}>
                   <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ background:'rgba(59, 130, 246, 0.1)', padding:8, borderRadius:8 }}><FileUp size={20} style={{ color:'var(--theme-accent)' }}/></div>
                      <div><p style={{ fontSize:12, fontWeight:900 }}>Extrair de Arquivo</p><p style={{ fontSize:10, opacity:0.5 }}>Lê colunas e captura IDs automaticamente</p></div>
                   </div>
                   <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.csv,.xml,.pdf,.xls,.xlsx,.html" style={{ display:'none' }} />
                   <button onClick={() => fileInputRef.current?.click()} style={{ padding:'8px 16px', fontSize:11, fontWeight:900, textTransform:'uppercase', background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', borderRadius:8, cursor:'pointer', transition:'all 0.2s', ':hover':{background:'var(--theme-accent)', color:'#fff'} }}>Procurar Arquivo...</button>
                </div>
                
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10 }}>
                   <p style={{ fontSize:11, color:'var(--theme-text)', opacity:0.4 }}><kbd style={{ background:'var(--theme-sidebar)', padding:'2px 6px', borderRadius:4, border:'1px solid var(--theme-card-border)' }}>Ctrl</kbd> + <kbd style={{ background:'var(--theme-sidebar)', padding:'2px 6px', borderRadius:4, border:'1px solid var(--theme-card-border)' }}>Enter</kbd> para adicionar textos</p>
                   <button onClick={()=>{processarInput();setMostrarInput(false);}} disabled={!inputTexto.trim()} style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 20px', borderRadius:10, background:inputTexto.trim()?'var(--theme-accent)':'var(--theme-sidebar)', color:inputTexto.trim()?'#fff':'var(--theme-text)', opacity:inputTexto.trim()?1:0.4, fontSize:12, fontWeight:900, textTransform:'uppercase', border:'none', cursor:inputTexto.trim()?'pointer':'not-allowed', transition:'all 0.2s' }}>
                      <Plus style={{ width:16, height:16 }}/> Adicionar à Fila
                   </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {itens.length>0 && <ResumoGeral itens={itens} onAbrirRaioX={() => setShowRaioX(true)} />}
        
        {isNewSession && (
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:16,textAlign:'center' }}>
            <div style={{ width:70,height:70,background:'#FFE600',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(0,0,0,0.15)' }}><Search style={{ width:34,height:34,color:'#1e293b' }}/></div>
            <div><h3 style={{ fontSize:16,fontWeight:900,color:'var(--theme-text)',marginBottom:4 }}>Pesquise anúncios do ML</h3><p style={{ fontSize:13,color:'var(--theme-text)',opacity:0.5 }}>Cole links, IDs ou envie arquivos (Excel, TXT) para analisar preços e concorrentes.</p></div>
            <button onClick={()=>setMostrarInput(true)} style={{ ...btnBase,background:'var(--theme-header)',color:'#FFE600',border:'none',padding:'10px 20px',fontSize:12, transition:'all 0.2s' }}><Plus style={{ width:14,height:14 }}/>Adicionar Links ou Arquivos</button>
          </div>
        )}

        {itens.length>0 && (
          <div style={{ display:'flex',gap:12,flex:1,minHeight:0 }}>
            {/* Terminal Flutuante Inteligente Ocultável */}
            <div style={{ background:'#020617', borderRadius:14, display:'flex', flexDirection:'column', overflow:'hidden', ...terminalStyle }}>
              
              <div onClick={() => !isTerminalFloating && setIsTerminalExpanded(!isTerminalExpanded)} style={{ display:'flex', alignItems:'center', justifyContent: isTerminalExpanded ? 'space-between' : 'center', padding:'12px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0, cursor: isTerminalFloating ? 'default' : 'pointer', background: isTerminalExpanded ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                 {isTerminalExpanded ? (
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ display:'flex', gap:4 }}>{['#ef4444','#f59e0b','#10b981'].map(c=><span key={c} style={{ width:9,height:9,borderRadius:'50%',background:c,opacity:0.6 }}/>)}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}><AnalyizStar size={16} active={rodando} dark={true}/><p style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.25)',letterSpacing:'0.1em' }}>Terminal Processador</p></div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                         {rodando && <span style={{ fontSize:9, fontWeight:900, color:'#8b5cf6', background:'rgba(139, 92, 246, 0.1)', padding:'2px 6px', borderRadius:4 }}>~{tempoRestanteSeg}s rest</span>}
                         {!isTerminalFloating && <Minimize2 size={14} style={{ color:'rgba(255,255,255,0.3)' }}/>}
                      </div>
                    </>
                 ) : (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                       <AnalyizStar size={18} active={rodando} dark={true}/>
                       <Maximize size={14} style={{ color:'rgba(255,255,255,0.3)', marginTop:10 }}/>
                    </div>
                 )}
              </div>

              {isTerminalExpanded && (
                <>
                  <div style={{ padding:'8px 10px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0 }}>
                    {!rodando
                      ?<button onClick={iniciarAnalise} disabled={!temPendentes||!mlConectado} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:8,borderRadius:8,fontSize:11,fontWeight:900,textTransform:'uppercase',border:'none',cursor:!temPendentes||!mlConectado?'not-allowed':'pointer',background:!temPendentes||!mlConectado?'rgba(255,255,255,0.05)':'#1d4ed8',color:!temPendentes||!mlConectado?'rgba(255,255,255,0.2)':'#fff', transition:'all 0.2s' }}><Zap style={{ width:14,height:14 }}/>{mlConectado?(temPendentes?`Iniciar Análise (${contagens.pendente+contagens.erro+contagens.fila})`:'Análise Completa'):'🔒 ML offline'}</button>
                      :<button onClick={pararAnalise} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:8,borderRadius:8,fontSize:11,fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:'#7f1d1d',color:'#fca5a5' }}><XCircle style={{ width:14,height:14 }}/>Interromper Processo</button>}
                  </div>
                  <div style={{ flex:1,overflowY:'auto',padding:12,fontFamily:'monospace',display:'flex',flexDirection:'column',gap:3,minHeight:0 }}>
                    {log.length===0?<p style={{ fontSize:10,color:'rgba(255,255,255,0.2)',fontStyle:'italic' }}>Sistema pronto...</p> :log.map((l,i)=>(<div key={i} style={{ fontSize:10,lineHeight:1.5,wordBreak:'break-words',color:l.tipo==='success'?'#6ee7b7':l.tipo==='warn'?'#fcd34d':'rgba(255,255,255,0.45)' }}><span style={{ color:'rgba(255,255,255,0.2)',marginRight:6 }}>{l.ts}</span>{l.msg}</div>))}
                    {rodando&&<div style={{ fontSize:10,color:'#60a5fa',display:'flex',alignItems:'center',gap:4,marginTop:4 }}><Loader2 style={{ width:10,height:10,animation:'spin 1s linear infinite' }}/>baixando dados estruturados...</div>}
                    <div ref={logEndRef}/>
                  </div>
                </>
              )}
            </div>

            {/* Lista resultados (com Paginação e Pesquisa) */}
            <div style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:8 }}>
              
              <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:'8px 12px',display:'flex',flexDirection:'column',gap:10 }}>
                
                {/* Linha Top: Filtros e Selecionados */}
                <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                  <button onClick={()=>{if(selecionados.size===itensPaginados.length&&itensPaginados.length>0) setSelecionados(new Set()); else setSelecionados(new Set(itensPaginados.map(i=>i.id)));}} style={{ color:selecionados.size===itensPaginados.length&&itensPaginados.length>0?'#3b82f6':'var(--theme-text)',opacity:selecionados.size===itensPaginados.length&&itensPaginados.length>0?1:0.3,background:'none',border:'none',cursor:'pointer',padding:0 }}>
                    {selecionados.size===itensPaginados.length&&itensPaginados.length>0?<CheckSquare style={{ width:16,height:16,color:'#3b82f6' }}/>:<Square style={{ width:16,height:16 }}/>}
                  </button>
                  {FILTROS.map(({k,l,ac,cc,bc})=>(
                    <button key={k} onClick={()=>{setFiltroStatus(k); setPaginaAtual(1);}} style={{ padding:'6px 10px',borderRadius:8,border:`1px solid ${filtroStatus===k?bc:'var(--theme-card-border)'}`,background:filtroStatus===k?ac:'var(--theme-sidebar)',color:filtroStatus===k?cc:'var(--theme-text)',fontSize:10,fontWeight:900,textTransform:'uppercase',cursor:'pointer',opacity:filtroStatus===k?1:0.6, transition:'all 0.15s' }}>{l}</button>
                  ))}
                  
                  {selecionados.size>0&&(
                    <div style={{ display:'flex',alignItems:'center',gap:6,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'4px 10px', marginLeft:'auto' }}>
                      <span style={{ fontSize:10,fontWeight:900,color:'#1d4ed8' }}>{selecionados.size} sel.</span>
                      {[...selecionados].some(id=>itens.find(i=>i.id===id&&i.status==='concluido'))&&(<>
                        <button onClick={() => removerDaTela([...selecionados])} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',cursor:'pointer',fontSize:10,fontWeight:900, transition:'all 0.2s' }}><Archive style={{ width:12,height:12 }}/>Arquivar</button>
                        <button onClick={()=>setShowComparador(true)} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:'#7c3aed',color:'#fff',border:'none',cursor:'pointer',fontSize:10,fontWeight:900, transition:'all 0.2s', ':hover':{background:'#6d28d9'} }}><BarChart2 style={{ width:12,height:12 }}/>Comparar</button>
                        <button disabled={pesquisaInicialData.gerandoPesquisa} onClick={()=>dispararPesquisaMercado()} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:pesquisaInicialData.gerandoPesquisa?'rgba(79,70,229,0.5)':'linear-gradient(90deg,#4f46e5,#9333ea)',color:'#fff',border:'none',cursor:pesquisaInicialData.gerandoPesquisa?'not-allowed':'pointer',fontSize:10,fontWeight:900, boxShadow:'0 2px 6px rgba(147, 51, 234, 0.4)', transition:'all 0.2s' }}>{pesquisaInicialData.gerandoPesquisa?<Loader2 style={{ width:12,height:12,animation:'spin 1s linear infinite' }}/>:<Sparkles style={{ width:12,height:12 }}/>}Pesquisa IA</button>
                      </>)}
                      <button disabled={rodando} onClick={()=>{ const ids=itens.filter(i=>selecionados.has(i.id)).map(i=>({mlbId:i.mlbId,url:i.url})); if(!ids.length)return; setItens(prev=>prev.map(it=>selecionados.has(it.id)?{...it,status:'pendente',dados:null,erro:null}:it)); setSelecionados(new Set()); executarFila(ids); }} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:'#2563eb',color:'#fff',border:'none',cursor:rodando?'not-allowed':'pointer',fontSize:10,fontWeight:900,opacity:rodando?0.5:1, transition:'all 0.2s', ':hover':{background:'#1d4ed8'} }}><RefreshCw style={{ width:12,height:12 }}/>Reprocessar</button>
                      <button onClick={() => removerDaTela([...selecionados])} className="ia-tip" data-tip="Remover da tela e Arquivar" style={{ display:'flex',padding:4,background:'none',border:'none',cursor:'pointer',color:'#ef4444', transition:'all 0.2s', ':hover':{transform:'scale(1.1)'} }}><Trash2 style={{ width:14,height:14 }}/></button>
                    </div>
                  )}
                </div>

                {/* Linha Bottom: Pesquisa, Ordenação, Data e Tags */}
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  
                  <div style={{ display:'flex', alignItems:'center', background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:8, padding:'6px 10px', gap:6, flex:1, minWidth:200 }}>
                    <Search size={14} style={{ opacity:0.4, color:'var(--theme-text)' }}/>
                    <input 
                       type="text" 
                       placeholder="Buscar por nome, MLB, preço ou vendedor..." 
                       value={termoBusca} 
                       onChange={e => { setTermoBusca(e.target.value); setPaginaAtual(1); }}
                       style={{ background:'transparent', border:'none', outline:'none', color:'var(--theme-text)', fontSize:11, width:'100%' }}
                    />
                    {termoBusca && <button onClick={()=>{setTermoBusca(''); setPaginaAtual(1);}} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:0 }}><X size={12}/></button>}
                  </div>

                  <button onClick={() => { setOrdemData(ordemData === 'desc' ? 'asc' : 'desc'); setPaginaAtual(1); }} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:8, color:'var(--theme-text)', fontSize:10, fontWeight:900, textTransform:'uppercase', cursor:'pointer' }}>
                     {ordemData === 'desc' ? <ArrowDownAZ size={14}/> : <ArrowUpZA size={14}/>}
                     {ordemData === 'desc' ? 'Mais Recentes' : 'Mais Antigos'}
                  </button>

                  <div style={{ display:'flex', alignItems:'center', background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:8, padding:'6px 10px', gap:6 }}>
                    <Calendar size={14} style={{ opacity:0.4, color:'var(--theme-text)' }}/>
                    <input type="date" value={filtroData} onChange={e => { setFiltroData(e.target.value); setPaginaAtual(1); }} style={{ background:'transparent', border:'none', color:'var(--theme-text)', fontSize:11, outline:'none', cursor:'pointer' }}/>
                    {filtroData && <button onClick={()=>{setFiltroData(''); setPaginaAtual(1);}} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:0 }}><X size={12}/></button>}
                  </div>

                  <select value={itensPorPagina} onChange={(e)=>{ setItensPorPagina(Number(e.target.value)); setPaginaAtual(1); }} style={{ background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:8, padding:'6px 10px', color:'var(--theme-text)', fontSize:10, fontWeight:900, textTransform:'uppercase', outline:'none', cursor:'pointer' }}>
                     <option value={30}>30 itens / pág</option>
                     <option value={50}>50 itens / pág</option>
                     <option value={100}>100 itens / pág</option>
                  </select>

                  {paginasDisponiveis.length > 1 && (
                    <div style={{ display:'flex', alignItems:'center', background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:8, padding:'6px 10px', gap:6 }}>
                      <FileSpreadsheet size={14} style={{ opacity:0.4, color:'var(--theme-text)' }}/>
                      <select value={filtroPagina} onChange={e => { setFiltroPagina(e.target.value); setPaginaAtual(1); }} style={{ background:'transparent', border:'none', color:'var(--theme-text)', fontSize:11, outline:'none', cursor:'pointer' }}>
                        <option value="todas">Todas as Páginas</option>
                        {paginasDisponiveis.filter(p => p !== 'todas').map(p => <option key={p} value={p}>Página {p}</option> )}
                      </select>
                    </div>
                  )}

                </div>

                {/* Linha Extra: Tags Dinâmicas */}
                {tagsDisponiveis.length > 1 && (
                  <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }} className="ia-scroll">
                    <Tag size={12} style={{ color:'var(--theme-text)', opacity:0.3, marginTop:5, flexShrink:0 }}/>
                    {tagsDisponiveis.map(tag => (
                      <button key={tag} onClick={() => { setTagAtiva(tag); setPaginaAtual(1); }} style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${tagAtiva===tag ? 'var(--theme-accent)' : 'var(--theme-card-border)'}`, background: tagAtiva===tag ? 'rgba(59, 130, 246, 0.1)' : 'var(--theme-sidebar)', color: tagAtiva===tag ? 'var(--theme-accent)' : 'var(--theme-text)', fontSize:9, fontWeight:900, textTransform:'uppercase', cursor:'pointer', flexShrink:0, transition:'all 0.2s' }}>
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Banner de Auto Retry */}
              {showAutoRetry && <BannerAutoRetry contErros={contagens.erro + contagens.fila} onRetentar={reanaliarErros} onDismiss={() => setShowAutoRetry(false)} />}

              {/* Grid de Resultados */}
              <div style={{ flex:1,overflowY:'auto',maxHeight:'calc(76vh - 56px)' }} className="ia-scroll">
                {itensPaginados.length===0
                  ?<div style={{ background:'var(--theme-card)',border:'1px dashed var(--theme-card-border)',borderRadius:14,padding:60,display:'flex',flexDirection:'column',alignItems:'center',gap:10 }}><Filter style={{ width:32,height:32,color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:12,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>Nenhum item corresponde à busca</p></div>
                  :<>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12 }}>
                      {itensPaginados.map(item=>(<CardResultado key={item.id} item={item} onRemover={removerItem} selecionado={selecionados.has(item.id)} onSel={toggleSel} onAbrirModal={setModalAberto}/>))}
                    </div>
                    
                    {/* Controles de Paginação */}
                    {totalPaginas > 1 && (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginTop:20, paddingBottom:20 }}>
                         <button disabled={paginaAtual === 1} onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 16px', borderRadius:8, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', cursor: paginaAtual===1 ? 'not-allowed' : 'pointer', opacity: paginaAtual===1 ? 0.4 : 1, fontSize:11, fontWeight:900 }}>
                           <ChevronLeft size={14}/> Anterior
                         </button>
                         <span style={{ fontSize:11, fontWeight:900, color:'var(--theme-text)' }}>
                           Página <span style={{ color:'var(--theme-accent)' }}>{paginaAtual}</span> de {totalPaginas}
                         </span>
                         <button disabled={paginaAtual === totalPaginas} onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))} style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 16px', borderRadius:8, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', cursor: paginaAtual===totalPaginas ? 'not-allowed' : 'pointer', opacity: paginaAtual===totalPaginas ? 0.4 : 1, fontSize:11, fontWeight:900 }}>
                           Próxima <ChevronRightIcon size={14}/>
                         </button>
                      </div>
                    )}
                  </>}
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ── ABAS HISTÓRICO / ARQUIVADOS ───────────────────────────────────── */}
      {(aba==='historico'||aba==='arquivados') && (
        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
          {aba==='historico' && (
            <div style={{ display:'flex',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:3,gap:2,width:'fit-content' }}>
              {[{k:'itens',l:`Anúncios Mapeados (${historico.length})`},{k:'analises',l:`Inteligência de Mercado (${analisesMercado.length})`}].map(({k,l})=>(<button key={k} onClick={()=>setSubAbaHist(k)} style={{ padding:'8px 16px',borderRadius:8,fontSize:11,fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:subAbaHist===k?'var(--theme-header)':'transparent',color:subAbaHist===k?'#FFE600':'var(--theme-text)',opacity:subAbaHist===k?1:0.5,whiteSpace:'nowrap', transition:'all 0.2s' }}>{l}</button>))}
            </div>
          )}
          <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
            {(aba==='arquivados'||subAbaHist==='itens') && (<button onClick={()=>{const lista=aba==='historico'?historico:arquivados;if(selHist.size===lista.length&&lista.length>0) setSelHist(new Set()); else setSelHist(new Set(lista.map(i=>i.id)));}} style={{ color:selHist.size>0?'#3b82f6':'var(--theme-text)',opacity:selHist.size>0?1:0.4,background:'none',border:'none',cursor:'pointer',padding:0,display:'flex' }}>{selHist.size>0?<CheckSquare style={{ width:16,height:16,color:'#3b82f6' }}/>:<Square style={{ width:16,height:16 }}/>}</button>)}
            <button onClick={()=>buscarHistorico(aba==='arquivados')} style={btnBase}><RefreshCw style={{ width:13,height:13 }}/></button>
            <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.5 }}>{aba==='historico'&&subAbaHist==='itens'?`${historico.length} registros no banco`:aba==='historico'&&subAbaHist==='analises'?`${analisesMercado.length} relatórios gerados`:`${arquivados.length} itens inativos`}</p>
            {selHist.size>0&&(aba==='arquivados'||subAbaHist==='itens')&&(
              <div style={{ marginLeft:'auto',display:'flex',gap:6,alignItems:'center',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'6px 12px' }}>
                <span style={{ fontSize:11,fontWeight:900,color:'#1d4ed8' }}>{selHist.size} selecionados</span>
                {aba==='historico'&&<button onClick={()=>acaoLoteHist('arquivar')} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:10,fontWeight:900,cursor:'pointer', transition:'all 0.2s', ':hover':{background:'var(--theme-card)'} }}><Archive style={{ width:12,height:12 }}/>Arquivar Itens</button>}
                {aba==='arquivados'&&<button onClick={()=>{[...selHist].forEach(id=>restaurarHist(id));setSelHist(new Set());}} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#15803d',fontSize:10,fontWeight:900,cursor:'pointer', transition:'all 0.2s', ':hover':{background:'#dcfce7'} }}><ArchiveRestore style={{ width:12,height:12 }}/>Restaurar Itens</button>}
                <button onClick={()=>acaoLoteHist('excluir')} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'#fee2e2',border:'1px solid #fca5a5',color:'#dc2626',fontSize:10,fontWeight:900,cursor:'pointer', transition:'all 0.2s', ':hover':{background:'#fecaca'} }}><Trash2 style={{ width:12,height:12 }}/>Apagar Banco</button>
              </div>
            )}
          </div>
          <div style={{ minHeight:200 }}>
            {loadingHist
              ?<div style={{ display:'flex',justifyContent:'center',padding:40 }}><Loader2 style={{ width:32,height:32,animation:'spin 1s linear infinite',color:'#94a3b8' }}/></div>
              :(() => {
                  if (aba==='historico'&&subAbaHist==='analises') {
                    if (!analisesMercado.length) return (<div style={{ background:'var(--theme-card)',border:'1px dashed var(--theme-card-border)',borderRadius:14,padding:60,display:'flex',flexDirection:'column',alignItems:'center',gap:10,textAlign:'center' }}><Sparkles style={{ width:40,height:40,color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:13,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>Nenhuma inteligência artificial processada</p></div>);
                    return <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(400px,1fr))',gap:10 }}>{analisesMercado.map(item=>(<CardAnalise key={item.id} item={item} sel={false} onSel={()=>{}} onExcluir={excluirAnalise} onVer={it=>setAnaliseVista(it)}/>))}</div>;
                  }
                  const lista=aba==='historico'?historico:arquivados;
                  if (!lista.length) return (<div style={{ background:'var(--theme-card)',border:'1px dashed var(--theme-card-border)',borderRadius:14,padding:60,display:'flex',flexDirection:'column',alignItems:'center',gap:10,textAlign:'center' }}><History style={{ width:40,height:40,color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:13,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>{aba==='historico'?'Banco de dados vazio':'Lixeira limpa'}</p></div>);
                  return <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:10 }}>{lista.map(item=>(<CardHistorico key={item.id} item={item} sel={selHist.has(item.id)} onSel={id=>setSelHist(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;})} onArquivar={arquivarHist} onRestaurar={restaurarHist} onExcluir={excluirHist} onExcluirDef={excluirDefHist} onRecarregar={recarregarDoHistorico}/>))}</div>;
              })()}
          </div>
        </div>
      )}

      {showRaioX && <ModalRaioXMercado itens={itens} selecionados={selecionados} onClose={()=>setShowRaioX(false)}/>}
      {showComparador && <ModalComparador userId={userId} mlNickname={mlNickname} itens={itens.filter(i=>selecionados.has(i.id))} onClose={()=>setShowComparador(false)}/>}
      {modalAberto    && <ModalAnuncio item={modalAberto} onClose={()=>setModalAberto(null)} onDispararPesquisa={dispararPesquisaMercado} />}

      {showPesquisaModal && (
        <ModalPesquisaMercado
          itens={itensParaAnaliseIA}
          onClose={()=>setShowPesquisaModal(false)}
          onSalvar={salvarPesquisaNoHistorico}
          userId={userId}
          mlNickname={mlNickname}
          pesquisaInicialData={pesquisaInicialData}
          setPesquisaInicialData={setPesquisaInicialData}
        />
      )}

      {analiseVista && (
        <Portal>
          <div onClick={()=>setAnaliseVista(null)} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ width:800,maxWidth:'96vw',maxHeight:'90vh',background:'var(--theme-card)',border:'1px solid rgba(139, 92, 246, 0.4)',borderRadius:24,overflow:'hidden',display:'flex',flexDirection:'column',color:'var(--theme-text)', boxShadow:'0 30px 80px rgba(0,0,0,0.6)' }}>
              <div style={{ padding:'20px 24px',background:'linear-gradient(135deg, var(--theme-header), #2e1065)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0, position:'relative', overflow:'hidden' }}>
                <div className="ia-header-glow" style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg, transparent, #8b5cf6, #d946ef, #3b82f6, transparent)', animation:'slideGrad 2s linear infinite' }} />
                <div style={{ display:'flex',alignItems:'center',gap:14, zIndex:1 }}>
                  <div style={{ background:'rgba(0,0,0,0.2)', padding:8, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.1)' }}><AnalyizStar size={30} active={false} dark={true}/></div>
                  <div><p style={{ fontSize:16,fontWeight:900,color:'#fff', lineHeight:1.2, textShadow:'0 2px 4px rgba(0,0,0,0.5)' }}>{analiseVista.titulo}</p><p style={{ fontSize:11,color:'rgba(255,255,255,0.5)', marginTop:4 }}>Processado pelo motor de IA em: {fmtDate(analiseVista.createdAt)}</p></div>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center', zIndex:1 }}>
                  <MenuExportacao onExport={(f) => exportarDadosComplexos(f, [], analiseVista.titulo, analiseVista.conteudoHtml)} disabled={false} label="Baixar" />
                  <button onClick={()=>setAnaliseVista(null)} style={{ background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'50%',cursor:'pointer',color:'rgba(255,255,255,0.6)', padding:8, zIndex:1, transition:'all 0.2s', ':hover':{background:'rgba(255,255,255,0.1)', color:'#fff'} }}><X style={{ width:20,height:20 }}/></button>
                </div>
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:24, background:'var(--theme-bg)' }} className="ia-scroll"><RelatorioTopicos html={analiseVista.conteudoHtml}/></div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}