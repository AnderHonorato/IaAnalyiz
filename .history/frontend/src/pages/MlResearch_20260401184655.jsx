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
  AlertTriangle, TimerReset, Copy, Maximize, Minimize2, Bot, LayoutList
} from 'lucide-react';
import AnalyizStar from '../components/Analyizstar';
import { safeDate } from '../utils/safeDate';

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

function gerarLinkAnuncio(mlbId) {
  if (!mlbId) return '#';
  const num = mlbId.replace(/^MLB/i, 'MLB');
  return `http://www.mercadolivre.com.br/p/${num}/s`;
}

function gerarLinkVendedor(nome) { 
  if (!nome || nome === '—') return '#'; 
  const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `https://www.mercadolivre.com.br/loja/${slug}`;
}

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
    const refUrl = i.url || d.link || gerarLinkAnuncio(refMlb);

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
  const linkRealDoAnuncio = gerarLinkAnuncio(item.mlbId);
  const linkOpcoesCompra  = `http://www.mercadolivre.com.br/p/${item.mlbId}/s`;
  
  const menorPreco = concRaw.length ? Math.min(...concRaw.map(c=>c.preco).filter(v=>v>0)) : null;

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

function ModalPesquisaMercado({ itens = [], onClose, userId, onSalvar, pesquisaInicialData, setPesquisaInicialData, mlNickname }) {
  const [abaModal,    setAbaModal]    = useState('relatorio');
  const [pergunta,    setPergunta]    = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [respostasQA, setRespostasQA] = useState([]);
  const [logsFU,      setLogsFU]      = useState([]);
  
  const [promptInicial, setPromptInicial] = useState('Faça um comparativo de preços e especificações técnicas focando no melhor custo-benefício. Organize os dados em tabelas para fácil entendimento.');
  const [pesquisaIA,        setPesquisaIA]       = useState(pesquisaInicialData?.pesquisaIA || null);
  const [gerandoPesquisa, setGerandoPesquisa] = useState(pesquisaInicialData?.gerandoPesquisa || false);
  const [logsPesquisa,    setLogsPesquisa]    = useState(pesquisaInicialData?.logsPesquisa || []);
  const [zoomLevel,       setZoomLevel]       = useState(13);

  const logEndRef  = useRef(null);
  const qaEndRef   = useRef(null);
  const taRef      = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [logsPesquisa, logsFU]);
  useEffect(() => { qaEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [respostasQA]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  }, [pergunta, promptInicial]);

  const todosPrecos = [];
  itens.filter(i=>i.status==='concluido'&&i.dados).forEach(it=>{
    const d=it.dados;
    if(d.preco>0) todosPrecos.push({ label:(d.seller?.nome||d.titulo||it.mlbId).substring(0,10), valor:d.preco, cor:'#3b82f6' });
    (d.concorrentes||[]).slice(0,5).forEach(c=>{ if(c.preco>0) todosPrecos.push({ label:(c.nome||c.titulo||'—').substring(0,10), valor:c.preco }); });
  });
  todosPrecos.sort((a,b)=>a.valor-b.valor);

  const iniciarAnaliseProfunda = async () => {
    if (!promptInicial.trim() || gerandoPesquisa) return;
    setPesquisaIA(null); setLogsPesquisa([]); setGerandoPesquisa(true); setAbaModal('relatorio');
    
    setPesquisaInicialData({ pesquisaIA: null, gerandoPesquisa: true, logsPesquisa: [] });

    const addLog2 = (msg,tipo) => {
      const newLog = {msg,tipo:tipo||'info',ts:new Date().toLocaleTimeString('pt-BR')};
      setLogsPesquisa(prev => {
        const next = [...prev, newLog];
        setPesquisaInicialData(p => ({ ...p, logsPesquisa: next }));
        return next;
      });
    };

    abortControllerRef.current = new AbortController();

    try {
      const itensComFicha = itens.filter(i=>i.status==='concluido').map(i=>({ 
        mlbId: i.dados?.mlbId, titulo: i.dados?.titulo, preco: i.dados?.preco, 
        precoMedio: i.dados?.precoMedio, precoMin: i.dados?.precoMin, 
        totalVendedores: i.dados?.totalVendedores, ehCatalogo: i.dados?.ehCatalogo,
        atributos: i.dados?.atributos,
        parcelamento: i.dados?.parcelamento,
        vendas: i.dados?.vendas || i.dados?.vendidos,
        envio: i.dados?.envio
      }));

      const payload = {
         userId, 
         itens: itensComFicha, 
         perguntaFollowUp: `DIRETRIZ DO USUÁRIO: "${promptInicial}"\n\n[AÇÃO OBRIGATÓRIA - OVERRIDE DO SISTEMA]: Eu estou enviando os dados de ${itensComFicha.length} anúncio(s) do Mercado Livre para análise de mercado. O usuário que está fazendo esta pesquisa se chama "${mlNickname || 'Auditor'}". IMPORTANTE: ELE É UM AUDITOR EXTERNO DE PREÇOS. Ele NÃO é o dono do anúncio, não vende esses produtos e não possui loja. Ele está apenas monitorando os dados públicos do Mercado Livre.\nVocê DEVE executar a análise e o cruzamento de dados AGORA MESMO. \n1. NUNCA diga coisas como "Seu Preço", "O preço do anúncio (Seu Nome)". Trate-o como um terceiro lendo um relatório.\n2. Leia os atributos técnicos fornecidos no array de itens e cruze com os dados da concorrência na web.\n3. ENTREGUE O RELATÓRIO FINAL FORMATADO. Não aja de forma conversacional, não pergunte o que o usuário quer fazer, não tente "corrigir" o pedido. APENAS GERE E IMPRIMA O RELATÓRIO TÉCNICO COMPLETO EM MARKDOWN UTILIZANDO TABELAS.`,
         contextoAnterior: '' 
      };

      const res = await fetch(`${API_BASE_URL}/api/ml/research/deep-market`, { 
        method:'POST', headers:{'Content-Type':'application/json'},
        signal: abortControllerRef.current.signal,
        body: JSON.stringify(payload)
      });
      const reader=res.body.getReader();const decoder=new TextDecoder(); let buffer='';let ev=null;let respHtml = '';
      while(true){
        const{value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split('\n');buffer=lines.pop();
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{ 
              const data=JSON.parse(line.slice(6)); 
              if(ev==='log') addLog2(data.msg,data.tipo); 
              else if(ev==='done') { 
                respHtml = data.conteudoHtml || data.relatorio;
                setPesquisaIA(data); 
                setPesquisaInicialData(p => ({ ...p, pesquisaIA: data }));
              } 
              else if(ev==='error') addLog2(`❌ ${data.error}`,'error'); 
            }catch{}
            ev=null;
          }
        }
      }
      
      if (!pesquisaIA && respHtml) {
        const fallbackObj = { titulo: "Análise Gerada", conteudoHtml: respHtml, precoMedio: null };
        setPesquisaIA(fallbackObj);
        setPesquisaInicialData(p => ({ ...p, pesquisaIA: fallbackObj }));
      }
    } catch(e) { 
      if (e.name === 'AbortError') addLog2('⚠️ Geração interrompida pelo usuário.', 'warn');
      else addLog2(`❌ Erro: ${e.message}`,'error'); 
    } finally { 
      setGerandoPesquisa(false); 
      setPesquisaInicialData(p => ({ ...p, gerandoPesquisa: false }));
    }
  };

  const refazerAnalise = () => {
    if (window.confirm('Deseja refazer a inteligência de mercado? O relatório atual será substituído.')) {
      setRespostasQA([]);
      setLogsFU([]);
      iniciarAnaliseProfunda();
    }
  };

  const enviarPergunta = async () => {
    if (!pergunta.trim() || respondendo) return;
    const q = pergunta.trim(); setPergunta(''); setRespondendo(true);
    setRespostasQA(prev => [...prev, { tipo:'pergunta', texto: q }]);
    const addLog = (msg,tipo) => setLogsFU(prev=>[...prev,{msg,tipo,ts:new Date().toLocaleTimeString('pt-BR')}]);
    
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/research/deep-market`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          userId,
          itens: itens.filter(i=>i.status==='concluido').map(i=>({ mlbId: i.dados?.mlbId, titulo: i.dados?.titulo, preco: i.dados?.preco, atributos: i.dados?.atributos })),
          perguntaFollowUp: `Formate a resposta contendo tabelas se necessário. Comando: ${q}`,
          contextoAnterior: `Relatório gerado sobre: ${pesquisaIA?.titulo || ''}. Contexto: ${plainTextFromHtml(pesquisaIA?.conteudoHtml).substring(0,3000)}...`,
        }),
      });
      const reader=res.body.getReader();const decoder=new TextDecoder(); let buffer='';let ev=null;let respostaAcumulada='';
      while(true){
        const{value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split('\n');buffer=lines.pop();
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{ const data=JSON.parse(line.slice(6)); if(ev==='log') addLog(data.msg,data.tipo||'info'); else if(ev==='done') respostaAcumulada = data.conteudoHtml||data.relatorio||''; }catch{}
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
        addLog(`❌ ${e.message}`,'error');
        setRespostasQA(prev => [...prev, { tipo:'resposta', html: `<span style="color:#ef4444">Erro: ${e.message}</span>` }]);
      }
    } finally { setRespondendo(false); }
  };

  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if(!pesquisaIA && !gerandoPesquisa) iniciarAnaliseProfunda(); else enviarPergunta(); } };
  
  const handleSave = () => {
    if (pesquisaIA && onSalvar) {
      onSalvar(pesquisaIA);
      setPesquisaInicialData({ pesquisaIA: null, gerandoPesquisa: false, logsPesquisa: [] });
    }
  };

  const abrirTelaCheia = () => {
    if (!pesquisaIA?.conteudoHtml) return;
    
    const htmlFormatado = pesquisaIA.conteudoHtml.replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br>');

    const htmlContent = `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Relatório de Análise - Analyiz</title>
      <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #1e293b; background: #f8fafc; max-width: 900px; margin: 0 auto; line-height: 1.4; font-size: 13px; }
        h1, h2, h3 { color: #8b5cf6; margin: 16px 0 8px 0; }
        p { margin: 0 0 8px 0; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; }
        .buttons { display: flex; gap: 10px; }
        button { background: #8b5cf6; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px; }
        button.sec { background: #e2e8f0; color: #475569; }
        button:hover { opacity: 0.9; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); font-size: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; font-weight: bold; }
        @media print { 
          body { padding: 0; background: #fff; } 
          .buttons { display: none; } 
        }
      </style>
      </head><body>
        <div class="header">
          <div><h1 style="margin:0;">Relatório de Mercado IA</h1><p style="margin:0;color:#64748b;font-size:12px;">Gerado por Analyiz</p></div>
          <div class="buttons">
            <button class="sec" onclick="window.print()">🖨️ Imprimir / PDF</button>
          </div>
        </div>
        <div>${htmlFormatado}</div>
      </body></html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const SUGESTOES = [ 'Identifique o vendedor com pior ficha técnica', 'Qual é a faixa de preço ideal para este produto?', 'Quais especificações diferenciam o líder?' ];
  const abaItems = [ { k:'relatorio', l:'📋 Relatório' }, { k:'graficos',  l:'📊 Gráficos' }, { k:'terminal',  l:'⚡ Terminal' } ];

  const paginasTotal = [...new Set(
    itens.flatMap(i => {
      const pagsPrincipal = i.dados?.paginasColetadas || [];
      const pagsConc = (i.dados?.concorrentes || []).map(c => c.pagina).filter(Boolean);
      return [...pagsPrincipal, ...pagsConc];
    })
  )].sort((a,b) => a-b);

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999990,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width: 900, maxWidth: '96vw', height: '90vh', maxHeight: '90vh', background: 'var(--theme-card)', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.7), 0 0 40px rgba(139, 92, 246, 0.15)', color: 'var(--theme-text)', position: 'relative' }}>
          
          <div style={{ padding:'20px 24px', background:'linear-gradient(135deg, var(--theme-header), #2e1065)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, position:'relative', overflow:'hidden' }}>
            <div className="ia-header-glow" style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg, transparent, #8b5cf6, #d946ef, #3b82f6, transparent)', animation:'slideGrad 2s linear infinite' }} />
            <div style={{ display:'flex', alignItems:'center', gap:14, zIndex:1 }}>
              <div style={{ background:'rgba(0,0,0,0.2)', padding:8, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.1)' }}><AnalyizStar size={32} active={gerandoPesquisa} dark={true}/></div>
              <div><p style={{ fontSize:16, fontWeight:900, color:'#fff', lineHeight:1.2, textShadow:'0 2px 4px rgba(0,0,0,0.5)' }}>Inteligência de Mercado Analítica</p><p style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:4 }}>{gerandoPesquisa ? 'A IA Analyiz está mapeando a web para você...' : (pesquisaIA?.titulo || 'Motor Pronta para Análise')}</p></div>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center', zIndex:1 }}>
              {pesquisaIA && (
                 <>
                   <button onClick={refazerAnalise} disabled={gerandoPesquisa} title="Refazer Análise" style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background:'rgba(245, 158, 11, 0.15)', color:'#fbbf24', fontSize:10, fontWeight:900, textTransform:'uppercase', border:'1px solid rgba(251, 191, 36, 0.3)', cursor: gerandoPesquisa ? 'not-allowed' : 'pointer', opacity: gerandoPesquisa ? 0.5 : 1, transition:'all 0.2s' }}><RefreshCw size={14}/> Refazer</button>
                   
                   <div style={{ display:'flex', background:'rgba(0,0,0,0.3)', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', overflow:'hidden' }}>
                     <button onClick={()=>setZoomLevel(z=>Math.max(10, z-1))} title="Diminuir zoom" style={{ background:'none', border:'none', color:'#fff', padding:'6px 8px', cursor:'pointer' }}><ZoomOut size={14}/></button>
                     <button onClick={()=>setZoomLevel(z=>Math.min(20, z+1))} title="Aumentar zoom" style={{ background:'none', border:'none', color:'#fff', padding:'6px 8px', cursor:'pointer', borderLeft:'1px solid rgba(255,255,255,0.1)' }}><ZoomIn size={14}/></button>
                   </div>
                   <button onClick={abrirTelaCheia} title="Visualizar em Tela Cheia e Imprimir" style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background:'rgba(59,130,246,0.2)', color:'#93c5fd', fontSize:10, fontWeight:900, textTransform:'uppercase', border:'1px solid rgba(147,197,253,0.3)', cursor:'pointer', transition:'all 0.2s' }}><Maximize2 size={14}/> Tela Cheia</button>
                 </>
              )}
              <MenuExportacao
                onExport={(f, pg) => exportarDadosComplexos(f, itens, pesquisaIA?.titulo || 'Inteligência de Mercado Analítica', pesquisaIA?.conteudoHtml, pg)}
                disabled={!pesquisaIA || gerandoPesquisa}
                label="Exportar Análise"
                paginasDisponiveis={paginasTotal}
              />
              <button onClick={handleSave} disabled={!pesquisaIA || gerandoPesquisa} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10, background: pesquisaIA&&!gerandoPesquisa ? 'linear-gradient(135deg,#059669,#10b981)' : 'rgba(255,255,255,0.05)', color:'#fff', fontWeight:900, fontSize:11, border:'1px solid rgba(255,255,255,0.1)', cursor: pesquisaIA&&!gerandoPesquisa ? 'pointer':'not-allowed', opacity: pesquisaIA&&!gerandoPesquisa ? 1:0.4, transition:'all 0.2s', boxShadow: pesquisaIA&&!gerandoPesquisa ? '0 4px 12px rgba(16,185,129,0.3)' : 'none' }}><ArchiveRestore size={14}/> Salvar</button>
              <button onClick={onClose} style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', color:'rgba(255,255,255,0.6)', padding:8, borderRadius:'50%', transition:'all 0.2s', ':hover':{background:'rgba(255,255,255,0.1)', color:'#fff'} }}><X style={{ width:18, height:18 }}/></button>
            </div>
          </div>

          <div style={{ display:'flex', borderBottom:'1px solid var(--theme-card-border)', padding:'0 18px', flexShrink:0, background:'var(--theme-sidebar)', gap:8 }}>
            {abaItems.map(({k,l}) => (<button key={k} onClick={() => setAbaModal(k)} style={{ padding:'12px 16px', fontSize:11, fontWeight:900, textTransform:'uppercase', border:'none', borderBottom:`3px solid ${abaModal===k?'var(--theme-accent)':'transparent'}`, color: abaModal===k ? 'var(--theme-accent)':'var(--theme-text)', background:'none', cursor:'pointer', opacity: abaModal===k ? 1:0.5, whiteSpace:'nowrap', transition:'all 0.2s' }}>{l}</button>))}
          </div>

          <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0, background:'var(--theme-bg)' }}>

            {abaModal === 'relatorio' && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>

                {gerandoPesquisa && <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:12, padding:'14px 20px', background:'rgba(139,92,246,0.1)', borderBottom:'1px solid rgba(139,92,246,0.2)' }}><Loader2 size={20} style={{ color:'#8b5cf6', animation:'spin 1s linear infinite' }}/><p style={{ fontSize:13, fontWeight:900, color:'#8b5cf6' }}>Analisando fichas técnicas e mercado web. Você pode cancelar clicando no botão quadrado abaixo.</p></div>}

                <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', minHeight:0 }} className="ia-scroll">
                  {!pesquisaIA && !gerandoPesquisa && (
                     <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', padding:20 }}>
                       <Globe style={{ width:48, height:48, color:'#8b5cf6', marginBottom:20, opacity:0.8 }}/>
                       <h3 style={{ fontSize:18, fontWeight:900, marginBottom:10 }}>O que você deseja descobrir?</h3>
                       <p style={{ fontSize:13, color:'var(--theme-text)', opacity:0.6, marginBottom:20, textAlign:'center', maxWidth:500 }}>A IA irá puxar automaticamente as <b>especificações técnicas, preços e reputação</b> destes {itens.length} anúncios. Diga o foco da sua pesquisa:</p>
                       <textarea value={promptInicial} onChange={e=>setPromptInicial(e.target.value)} onKeyDown={handleKeyDown} rows={4} style={{ width:'100%', maxWidth:600, background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:16, padding:16, color:'var(--theme-text)', fontSize:14, resize:'none', outline:'none' }} placeholder="Ex: Compare a voltagem e o peso e me diga qual é mais barato..."/>
                       <button onClick={iniciarAnaliseProfunda} style={{ marginTop:20, display:'flex', alignItems:'center', gap:8, background:'linear-gradient(90deg,#4f46e5,#9333ea)', color:'#fff', border:'none', padding:'12px 24px', borderRadius:12, fontSize:13, fontWeight:900, cursor:'pointer', boxShadow:'0 4px 14px rgba(147, 51, 234, 0.4)' }}><Sparkles size={16}/> Iniciar Pesquisa Profunda</button>
                     </div>
                  )}

                  {pesquisaIA?.conteudoHtml && <RelatorioTopicos html={pesquisaIA.conteudoHtml} zoomBase={zoomLevel}/>}

                  {respostasQA.length > 0 && (
                    <div style={{ marginTop:24, borderTop:'1px solid var(--theme-card-border)', paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
                      <p style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', color:'#8b5cf6', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><MessageSquare size={14}/> Dúvidas Focadas (Q&A)</p>
                      {respostasQA.map((item, i) => (
                        item.tipo === 'pergunta' ? (
                          <div key={i} style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
                            <div style={{ background:'var(--theme-user-bubble, #f0f0f0)', color:'var(--theme-user-text, #333)', border:'1px solid var(--theme-card-border)', borderRadius:'18px 18px 4px 18px', padding:'10px 14px', maxWidth:'85%', fontSize:zoomLevel, lineHeight:1.5, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                              {item.texto}
                            </div>
                          </div>
                        ) : (
                          <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:12 }}>
                            <div style={{ flexShrink:0, marginTop:2 }}><AnalyizStar size={22} active={false} dark={true}/></div>
                            <div style={{ flex:1, color:'var(--theme-text)', fontSize:zoomLevel, lineHeight:1.6 }} dangerouslySetInnerHTML={{ __html: item.html }} />
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
                  )}
                </div>

                {(pesquisaIA || gerandoPesquisa) && (
                  <div style={{ flexShrink:0, padding:'12px 16px', borderTop:'1px solid var(--theme-card-border)', background:'var(--theme-chat-bg, var(--theme-sidebar))' }}>
                    {respostasQA.length === 0 && !respondendo && !gerandoPesquisa && (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                        {SUGESTOES.map(q => <button key={q} onClick={() => setPergunta(q)} style={{ fontSize:10, padding:'6px 12px', borderRadius:16, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', cursor:'pointer', opacity:0.8, fontFamily:"'Google Sans',sans-serif", maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'all 0.2s', ':hover':{background:'var(--theme-sidebar)', opacity:1} }}>{q}</button>)}
                      </div>
                    )}
                    <div style={{ background:'var(--theme-card)', border:`1.5px solid ${pergunta.trim() ? 'rgba(138,180,248,0.45)' : 'var(--theme-card-border)'}`, borderRadius:24, padding:'10px 14px', display:'flex', alignItems:'flex-end', gap:10, transition:'all 0.2s', boxShadow: pergunta.trim() ? '0 0 0 2px rgba(138,180,248,0.08)' : 'none' }}>
                      <textarea ref={taRef} value={pergunta} onChange={e => setPergunta(e.target.value)} onKeyDown={handleKeyDown} placeholder={gerandoPesquisa ? 'A IA está processando o relatório inicial...' : 'Faça uma pergunta específica sobre o relatório...'} rows={1} style={{ flex:1, background:'transparent', border:'none', outline:'none', resize:'none', color:'var(--theme-text)', fontSize:13, fontFamily:"'Google Sans',sans-serif", maxHeight:120, lineHeight:1.5, overflowY:'auto' }} />
                      {(respondendo || gerandoPesquisa) ? (
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
                )}
              </div>
            )}

            {abaModal === 'graficos' && (
              <div style={{ flex:1, overflowY:'auto', padding:24, minHeight:0 }} className="ia-scroll">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                  <div style={{ background:'var(--theme-sidebar)', borderRadius:16, padding:20, border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:12, fontWeight:900, textTransform:'uppercase', opacity:0.5, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}><BarChart size={14}/> Comparação de Preços Mapeados</p>
                    <GraficoBarras dados={todosPrecos.slice(0,10)} titulo="" corAtiva="#8b5cf6"/>
                    {!todosPrecos.length && <p style={{ fontSize:12, opacity:0.3, textAlign:'center', padding:40 }}>A IA não extraiu preços diretos.</p>}
                  </div>
                  <div style={{ background:'var(--theme-sidebar)', borderRadius:16, padding:20, border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:12, fontWeight:900, textTransform:'uppercase', opacity:0.5, marginBottom:16, display:'flex', alignItems:'center', gap:6 }}><LineChart size={14}/> Métricas de Inteligência</p>
                    {todosPrecos.length > 0 ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {[
                          {l:'Menor preço detectado',  v:fmt(Math.min(...todosPrecos.map(p=>p.valor))), c:'#10b981'},
                          {l:'Preço médio ponderado',  v:fmt(todosPrecos.reduce((s,p)=>s+p.valor,0)/todosPrecos.length), c:'#f59e0b'},
                          {l:'Maior preço detectado',  v:fmt(Math.max(...todosPrecos.map(p=>p.valor))), c:'#ef4444'},
                          {l:'Total opções mapeadas', v:todosPrecos.length, c:'#8b5cf6'},
                        ].map(({l,v,c}) => (
                          <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:'var(--theme-card)', borderRadius:10, border:'1px solid rgba(255,255,255,0.03)' }}>
                            <span style={{ fontSize:12, opacity:0.7, fontWeight:600 }}>{l}</span>
                            <span style={{ fontSize:18, fontWeight:900, color:c }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p style={{ fontSize:12, opacity:0.3, textAlign:'center', padding:40 }}>Sem métricas matemáticas.</p>}
                  </div>
                </div>
              </div>
            )}

            {abaModal === 'terminal' && (
              <div style={{ flex:1, background:'#020617', display:'flex', flexDirection:'column', minHeight:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
                  <div style={{ display:'flex', gap:6 }}>{['#ef4444','#f59e0b','#10b981'].map(c => <span key={c} style={{ width:10, height:10, borderRadius:'50%', background:c, opacity:0.8 }}/>)}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:8 }}><Activity style={{ width:12, height:12, color:'rgba(255,255,255,0.3)' }}/><span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em' }}>Logs da Engine IA</span></div>
                  {(gerandoPesquisa || respondendo) && <span style={{ marginLeft:'auto', width:8, height:8, borderRadius:'50%', background:'#8b5cf6', animation:'pulse 1.5s infinite' }}/>}
                </div>
                <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', fontFamily:'monospace', display:'flex', flexDirection:'column', gap:4, minHeight:0 }} className="ia-scroll">
                  {[...logsPesquisa, ...logsFU].length === 0 && <p style={{ fontSize:11, color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>Terminal ocioso...</p>}
                  {[...logsPesquisa, ...logsFU].map((l, i) => (
                    <div key={i} style={{ fontSize:11, lineHeight:1.6, wordBreak:'break-words', color: l.tipo==='success'?'#6ee7b7':l.tipo==='error'?'#f87171':l.tipo==='warn'?'#fcd34d':'rgba(255,255,255,0.6)' }}><span style={{ color:'rgba(255,255,255,0.25)', marginRight:10 }}>{l.ts||''}</span>{l.msg}</div>
                  ))}
                  {(gerandoPesquisa || respondendo) && (<div style={{ fontSize:11, color:'#818cf8', display:'flex', alignItems:'center', gap:6, marginTop:8 }}><Loader2 style={{ width:12, height:12, animation:'spin 1s linear infinite' }}/> engine processando requests...</div>)}
                  <div ref={logEndRef}/>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}