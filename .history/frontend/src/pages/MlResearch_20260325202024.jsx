// src/pages/MlResearch.jsx — v12 (Master Edition)
// Melhorias: Terminal flutuante inteligente, Exportação completa com Concorrentes (PDF, Excel), 
// Aba "O que achamos" com debug real do scraping, Chat no Comparador, Correção profunda de links.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  XCircle, Clock, ShoppingBag, Star, TrendingUp, TrendingDown, Package,
  Download, Zap, ArrowLeft, Users, Activity, Filter, X, Medal, Award,
  Archive, ArchiveRestore, History, CheckSquare, Square, Eye,
  DollarSign, Scale, Tag, Percent, BarChart2, ChevronDown, HelpCircle,
  Sparkles, Send, MessageSquare, BarChart, LineChart, Globe, ChevronRight,
  FileUp, FileText, FileSpreadsheet, FileJson, Printer, Calendar, ListChecks
} from 'lucide-react';
import AnalyizStar from '../components/Analyizstar';

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

function extrairVariosMLBs(texto) {
  const regex = /(?:https?:\/\/[^\s"'<>]+MLB[-]?\d+[^\s"'<>]*)|(?:MLB[-]?\d+)/gi;
  const matches = texto.match(regex) || [];
  const ids = new Set();
  for (const m of matches) { const extracted = extrairMLBId(m); if (extracted) ids.add(extracted); }
  return Array.from(ids);
}

function fmt(v) { return (!v && v !== 0) ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v); }
function fmtDate(val) { try { const d=new Date(val); return isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch { return '—'; } }
function urlShort(url, max=44) { try { const u=new URL(url); const p=(u.pathname.split('/').filter(Boolean)[0]||'').substring(0,max); return `${u.hostname}/${p}${p.length>=max?'…':''}`; } catch { return url.length>max?url.substring(0,max)+'…':url; } }

function gerarLinkAnuncio(mlbId, ehCatalogo) {
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

const STATUS_CFG = {
  pendente:   { label:'Pendente',   color:'#d97706', bg:'#fef3c7', border:'#fde68a', barColor:'#fbbf24', Icon:Clock },
  analisando: { label:'Analisando', color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe', barColor:null,      Icon:Loader2 },
  concluido:  { label:'Concluído',  color:'#059669', bg:'#ecfdf5', border:'#a7f3d0', barColor:'#34d399', Icon:CheckCircle2 },
  erro:       { label:'Erro',       color:'#dc2626', bg:'#fee2e2', border:'#fca5a5', barColor:'#f87171', Icon:XCircle },
  fila:       { label:'Na fila',    color:'#7c3aed', bg:'#f3e8ff', border:'#d8b4fe', barColor:'#a78bfa', Icon:Clock },
};

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

// ── Gráfico de barras SVG compacto ───────────────────────────────────────────
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

// ── Tópico colapsável (accordion) ────────────────────────────────────────────
function Topico({ titulo, children, defaultOpen = false, icon = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:'1px solid var(--theme-card-border)', borderRadius:10, overflow:'hidden', marginBottom:6 }}>
      <button onClick={() => setOpen(v => !v)} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'var(--theme-sidebar)', border:'none', cursor:'pointer', color:'var(--theme-text)', textAlign:'left' }}>
        {icon && <span style={{ fontSize:13 }}>{icon}</span>}<span style={{ flex:1, fontSize:12, fontWeight:700 }}>{titulo}</span><ChevronDown size={13} style={{ opacity:0.4, transition:'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}/>
      </button>
      {open && <div style={{ padding:'10px 12px', fontSize:12, lineHeight:1.7, color:'var(--theme-text)', background:'var(--theme-card)' }}>{children}</div>}
    </div>
  );
}

// ── Parser HTML da IA ────────────────────────────────────────────────────────
function RelatorioTopicos({ html }) {
  if (!html) return null;
  let textoTratado = html.replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/<br\s*\/?>/gi, '\n');                   
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
  if (secoes.length > 1) {
    return <div style={{ display:'flex', flexDirection:'column', gap:0 }}>{secoes.map((s, i) => s.titulo ? (<Topico key={i} titulo={s.titulo} icon={emojiParaTitulo(s.titulo)} defaultOpen={i === 0}><div dangerouslySetInnerHTML={{ __html: s.html }}/></Topico>) : (<div key={i} style={{ fontSize:12, lineHeight:1.7, padding:'4px 0', color:'var(--theme-text)' }} dangerouslySetInnerHTML={{ __html: s.html.replace(/\n/g,'<br>') }}/>))}</div>;
  }
  return <div style={{ fontSize:12, lineHeight:1.7 }} dangerouslySetInnerHTML={{ __html: textoTratado.replace(/\n/g, '<br>') }}/>;
}

// ── Exportação Profissional Global ────────────────────────────────────────────
function exportarDadosComplexos(formato, targetList, tituloRelatorio = 'Auditoria de Concorrentes ML') {
  if (!targetList || !targetList.length) return alert('Nenhum dado para exportar.');
  const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const horaHoje = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '');
  const nomeArquivo = `Analyiz_${tituloRelatorio.replace(/\s+/g,'_')}_${dataHoje}_${horaHoje}`;

  if (formato === 'xls' || formato === 'csv') {
    let conteudo = '';
    if (formato === 'xls') {
      conteudo = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; } th { background-color: #1e293b; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; } td { border: 1px solid #cbd5e1; padding: 8px; } .num { mso-number-format: "R$ #,##0.00"; } .sub { background-color: #f1f5f9; }</style></head><body><h2>${tituloRelatorio} - Analyiz</h2><p>Data de exportação: ${dataHoje}</p><table><tr><th>Item Original (MLB)</th><th>Título do Anúncio Origem</th><th>Concorrente / Vendedor</th><th>Preço</th><th>Frete Grátis</th><th>Vendidos</th><th>Link Anúncio</th></tr>`;
      targetList.forEach(i => {
        const d = i.dados || i; 
        const refMlb = i.mlbId || d.mlbId || '';
        const refTit = (d.titulo||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
        conteudo += `<tr class="sub"><td><b>${refMlb}</b></td><td><b>${refTit}</b></td><td><b>${d.seller?.nome||'VOCÊ'}</b></td><td class="num"><b>${d.preco||0}</b></td><td>${d.freteGratis?'Sim':'Não'}</td><td>${d.vendidos||0}</td><td>${d.link||gerarLinkAnuncio(refMlb, d.ehCatalogo)}</td></tr>`;
        (d.concorrentes||[]).forEach(c => {
          conteudo += `<tr><td>${refMlb}</td><td>${(c.titulo||refTit).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td><td>${c.nome||'—'}</td><td class="num">${c.preco||0}</td><td>${c.freteGratis?'Sim':'Não'}</td><td>${c.vendidos||0}</td><td>${c.link||gerarLinkAnuncio(c.mlbId||refMlb, d.ehCatalogo)}</td></tr>`;
        });
      });
      conteudo += `</table></body></html>`;
    } else {
      let rows = ["ID_Origem\tTitulo_Origem\tVendedor\tPreco\tFreteGratis\tVendidos\tLink"];
      targetList.forEach(i => {
        const d = i.dados || i; const refMlb = i.mlbId || d.mlbId || ''; const refTit = `"${(d.titulo||'').replace(/"/g,'""')}"`;
        rows.push(`${refMlb}\t${refTit}\t"${d.seller?.nome||'VOCÊ'}"\t${d.preco||0}\t${d.freteGratis?'Sim':'Nao'}\t${d.vendidos||0}\t${d.link||gerarLinkAnuncio(refMlb, d.ehCatalogo)}`);
        (d.concorrentes||[]).forEach(c => {
          rows.push(`${refMlb}\t"${(c.titulo||'').replace(/"/g,'""')}"\t"${c.nome||'—'}"\t${c.preco||0}\t${c.freteGratis?'Sim':'Nao'}\t${c.vendidos||0}\t${c.link||gerarLinkAnuncio(c.mlbId||refMlb, d.ehCatalogo)}`);
        });
      });
      conteudo = rows.join('\n');
    }
    const blob = new Blob([conteudo], { type: formato === 'xls' ? 'application/vnd.ms-excel;charset=utf-8;' : 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${nomeArquivo}.${formato}`; link.click();
  } else if (formato === 'pdf') {
    let htmlPrint = `<html><head><title>${nomeArquivo}</title><style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap'); body { font-family: 'Roboto', sans-serif; padding: 30px; color: #1e293b; background: #fff; } .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #8b5cf6; padding-bottom: 10px; margin-bottom: 20px; } h1 { margin: 0; color: #0f172a; font-weight: 900; font-size: 24px; } .brand { color: #8b5cf6; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; } .date { color: #64748b; font-size: 10px; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; margin-bottom: 30px;} th { background: #f8fafc; color: #475569; text-transform: uppercase; font-size: 9px; font-weight: 900; text-align: left; padding: 8px; border-bottom: 2px solid #e2e8f0; } td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; } .preco { font-weight: 900; color: #10b981; } .vendedor { font-weight: 700; color: #3b82f6; } .title-item { background: #f1f5f9; font-weight: bold; font-size: 11px; padding: 10px; border-left: 4px solid #8b5cf6; margin-top:20px;}</style></head><body><div class="header"><div><div class="brand">✨ Analyiz Intelligence</div><h1>${tituloRelatorio}</h1></div><div class="date">Gerado em: ${dataHoje} às ${new Date().toLocaleTimeString('pt-BR')}</div></div>`;
    targetList.forEach(i => {
      const d = i.dados || i; const refMlb = i.mlbId || d.mlbId || '';
      htmlPrint += `<div class="title-item">[${refMlb}] ${d.titulo||'Sem Título'} — Seu Preço: ${fmt(d.preco)}</div><table><thead><tr><th>Vendedor / Concorrente</th><th>Preço (R$)</th><th>Frete</th><th>Vendidos</th></tr></thead><tbody>`;
      if (d.seller?.nome) htmlPrint += `<tr><td class="vendedor">${d.seller.nome} (Você)</td><td class="preco">${fmt(d.preco)}</td><td>${d.freteGratis?'Grátis':'Pago'}</td><td>${d.vendidos||0}</td></tr>`;
      (d.concorrentes||[]).forEach(c => {
        htmlPrint += `<tr><td class="vendedor">${c.nome||'—'}</td><td class="preco">${fmt(c.preco)}</td><td>${c.freteGratis?'Grátis':'Pago'}</td><td>${c.vendidos||0}</td></tr>`;
      });
      htmlPrint += `</tbody></table>`;
    });
    htmlPrint += `<p style="margin-top: 30px; text-align: center; font-size: 9px; color: #94a3b8;">Tecnologia gerada por Inteligência Artificial Analyiz © ${new Date().getFullYear()}</p></body></html>`;
    const printWindow = window.open('', '_blank'); printWindow.document.write(htmlPrint); printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
  } else if (formato === 'txt') {
    let txt = `=== ${tituloRelatorio.toUpperCase()} ===\nData: ${dataHoje}\n\n`;
    targetList.forEach(i => {
      const d = i.dados || i; const refMlb = i.mlbId || d.mlbId || '';
      txt += `>> ITEM: [${refMlb}] ${d.titulo}\nSeu Preço: ${fmt(d.preco)} | Vendedores Mapeados: ${d.totalVendedores}\nLink: ${d.link||gerarLinkAnuncio(refMlb, d.ehCatalogo)}\nCONCORRENTES:\n`;
      (d.concorrentes||[]).forEach(c => { txt += `  - ${c.nome}: ${fmt(c.preco)} | Frete: ${c.freteGratis?'Grátis':'Pago'} | Vendidos: ${c.vendidos||0}\n`; });
      txt += `----------------------------------------\n\n`;
    });
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${nomeArquivo}.txt`; link.click();
  } else if (formato === 'xml') {
    let xml = `<?xml version="1.0" encoding="UTF-8"?><analyiz_relatorio data="${dataHoje}"><anuncios>`;
    targetList.forEach(i => {
      const d = i.dados || i; const refMlb = i.mlbId || d.mlbId || '';
      xml += `<anuncio><id>${refMlb}</id><titulo><![CDATA[${d.titulo}]]></titulo><preco>${d.preco}</preco><concorrentes>`;
      (d.concorrentes||[]).forEach(c => { xml += `<concorrente><nome><![CDATA[${c.nome}]]></nome><preco>${c.preco}</preco><vendidos>${c.vendidos||0}</vendidos></concorrente>`; });
      xml += `</concorrentes></anuncio>`;
    });
    xml += `</anuncios></analyiz_relatorio>`;
    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${nomeArquivo}.xml`; link.click();
  }
}

function MenuExportacao({ onExport, disabled, label="Exportar" }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ position:'relative' }}>
      <button onClick={()=>setAberto(!aberto)} disabled={disabled} style={{ padding:'6px 12px',borderRadius:8,border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textTransform:'uppercase',cursor:disabled?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6, opacity:disabled?0.4:1, transition:'all 0.2s' }}>
        <Download size={14}/> {label} <ChevronDown size={12}/>
      </button>
      {aberto && !disabled && (
        <Portal>
          <div onClick={()=>setAberto(false)} style={{ position:'fixed', inset:0, zIndex:99990 }}/>
          <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:36, right:0, zIndex:99991, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', borderRadius:12, padding:8, display:'flex', flexDirection:'column', gap:4, boxShadow:'0 10px 40px rgba(0,0,0,0.3)', minWidth:160, animation:'slideDown 0.15s ease' }}>
            <p style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', opacity:0.4, padding:'4px 8px' }}>Baixar relatório</p>
            {[{ id:'pdf', label:'PDF', ic:Printer, c:'#ef4444' }, { id:'xls', label:'Excel (.xls)', ic:FileSpreadsheet, c:'#10b981' }, { id:'txt', label:'Texto (.txt)', ic:FileText, c:'#8b5cf6' }, { id:'xml', label:'XML', ic:FileJson, c:'#f59e0b' }].map(o => (
              <button key={o.id} onClick={()=>{onExport(o.id);setAberto(false);}} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'transparent', border:'none', borderRadius:6, cursor:'pointer', color:'var(--theme-text)', fontSize:11, fontWeight:700, textAlign:'left', width:'100%', transition:'all 0.2s', ':hover':{background:'var(--theme-sidebar)'} }}>
                <o.ic size={14} style={{ color:o.c }}/> {o.label}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </div>
  );
}

// ── Modal Detalhes (Visualização do Anúncio) ──────────────────────────────────
function ModalAnuncio({ item, onClose, onDispararPesquisa }) {
  const [tab, setTab] = useState('vendedores');
  if (!item) return null;
  const d    = item.dados;
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const conc = d?.concorrentes || [];
  
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
  const linkRealDoAnuncio = d?.link || item.url || gerarLinkAnuncio(item.mlbId, ehCatalogo);
  const linkOpcoesCompra  = gerarLinkOpcoesCompra(item.mlbId);
  
  const menorPreco = conc.length ? Math.min(...conc.map(c=>c.preco).filter(v=>v>0)) : null;
  const tabs = [
    { k:'vendedores', l: ehCatalogo ? `Opções de Compra (${conc.length})` : `Concorrentes (${conc.length})` },
    { k:'info',       l:'Info' },
    { k:'ficha',      l:`Ficha (${(d?.atributos||[]).length})` },
    { k:'achados',    l:`O que achamos 🕵️‍♂️` },
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
                  {d?.analisadoEm && <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', gap:3 }}><Clock size={10}/> {fmtDate(d.analisadoEm)}</span>}
                </div>
                <h2 style={{ fontSize:16,fontWeight:900,color:'#fff',margin:0,lineHeight:1.3, textShadow:'0 2px 4px rgba(0,0,0,0.5)' }}>{d?.titulo || 'Anúncio não carregado'}</h2>
                <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                  <a href={linkRealDoAnuncio} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10, fontWeight:900, color:'#60a5fa', textDecoration:'none', background:'rgba(59,130,246,0.1)', padding:'5px 12px', borderRadius:8, border:'1px solid rgba(59,130,246,0.2)', transition:'all 0.2s', textTransform:'uppercase' }}><ExternalLink size={12}/> Anúncio Origem</a>
                  {ehCatalogo && <a href={linkOpcoesCompra} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10, fontWeight:900, color:'#a78bfa', textDecoration:'none', background:'rgba(139,92,246,0.1)', padding:'5px 12px', borderRadius:8, border:'1px solid rgba(139,92,246,0.2)', transition:'all 0.2s', textTransform:'uppercase' }}><ListChecks size={12}/> Ver Opções de Compra</a>}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, zIndex:1 }}>
              <MenuExportacao onExport={(f) => exportarDadosComplexos(f, [item], `Relatório Individual - ${item.mlbId}`)} disabled={!d} />
              <button onClick={()=>{onClose(); onDispararPesquisa([item]);}} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background:'linear-gradient(90deg,#4f46e5,#9333ea)', color:'#fff', fontWeight:900, fontSize:10, border:'none', cursor:'pointer', textTransform:'uppercase', boxShadow:'0 2px 8px rgba(147, 51, 234, 0.3)' }}><Sparkles size={14}/> Pesquisa IA</button>
              <button onClick={onClose} style={{ color:'rgba(255,255,255,0.4)',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.1)', borderRadius:'50%', padding:6, cursor:'pointer', transition:'all 0.2s' }}><X style={{ width:18,height:18 }} /></button>
            </div>
          </div>

          {d && (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid var(--theme-card-border)',flexShrink:0, background:'rgba(0,0,0,0.1)' }}>
              {[{l:'Preço Ref.',v:fmt(d.preco),c:'#10b981'},{l:'Menor preço',v:fmt(d.precoMin??menorPreco??d.preco),c:'#3b82f6'},{l:'Preço médio',v:fmt(d.precoMedio),c:'#f59e0b'},{l:'Vendedores',v:d.totalVendedores||(d.concorrentes?.length||0)+1,c:'#8b5cf6'}].map(({l,v,c},i)=>(
                <div key={l} style={{ display:'flex',flexDirection:'column',padding:'14px 18px',borderRight:i<3?'1px solid var(--theme-card-border)':'none' }}>
                  <span style={{ fontSize:20,fontWeight:900,color:c,lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:4 }}>{l}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex',borderBottom:'1px solid var(--theme-card-border)',padding:'0 16px',flexShrink:0,background:'var(--theme-sidebar)', gap:4 }}>
            {tabs.map(({k,l})=>(
              <button key={k} onClick={()=>setTab(k)} style={{ padding:'12px 14px',fontSize:11,fontWeight:900,textTransform:'uppercase',borderBottom:`3px solid ${tab===k?'var(--theme-accent)':'transparent'}`,color:tab===k?'var(--theme-accent)':'var(--theme-text)',background:'none',border:'none',cursor:'pointer',opacity:tab===k?1:0.5,whiteSpace:'nowrap', transition:'all 0.2s' }}>{l}</button>
            ))}
          </div>

          <div style={{ flex:1,overflowY:'auto',padding:20 }} className="ia-scroll">
            {tab==='vendedores' && (
              <>
                {d?.seller && (
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:14,padding:'16px 20px',border:'1px solid var(--theme-card-border)',marginBottom:16,display:'flex',alignItems:'center',gap:16, boxShadow:'0 4px 12px rgba(0,0,0,0.05)' }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:10,fontWeight:900,textTransform:'uppercase',color:'#8b5cf6',marginBottom:4,display:'flex',alignItems:'center',gap:4 }}><Users style={{ width:12,height:12 }}/>Vendedor Analisado</p>
                      <p style={{ fontSize:18,fontWeight:900,color:'var(--theme-text)' }}>{d.seller.nome}</p>
                      <a href={gerarLinkVendedor(d.seller.nome)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, color:'#6366f1', textDecoration:'none', marginTop:4, fontWeight:700 }}><ExternalLink size={10}/> Ver perfil da Loja</a>
                      {d.seller.reputacao && <p style={{ fontSize:11,opacity:0.5,textTransform:'capitalize',marginTop:4 }}>Reputação: {d.seller.reputacao}</p>}
                    </div>
                    {d.seller.vendas!=null && <div style={{ textAlign:'right', paddingRight:16, borderRight:'1px solid var(--theme-card-border)' }}><p style={{ fontSize:22,fontWeight:900,color:'#6366f1' }}>{(d.seller.vendas||0).toLocaleString('pt-BR')}</p><p style={{ fontSize:10,opacity:0.4 }}>Vendas Totais</p></div>}
                    {d.vendidos != null && <div style={{ textAlign:'right', paddingRight:16, borderRight:'1px solid var(--theme-card-border)' }}><p style={{ fontSize:22,fontWeight:900,color:'#f59e0b' }}>{d.vendidos}</p><p style={{ fontSize:10,opacity:0.4 }}>Vendas no Anúncio</p></div>}
                    <div style={{ textAlign:'right' }}><p style={{ fontSize:26,fontWeight:900,color:'#10b981' }}>{fmt(d.preco)}</p>{d.freteGratis&&<p style={{ fontSize:11,color:'#10b981',fontWeight:700, marginTop:2 }}>✓ Frete grátis</p>}</div>
                  </div>
                )}
                {conc.length>0 ? (
                  <>
                    <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',opacity:0.5,marginBottom:10, marginLeft:4 }}>{ehCatalogo?'Outras opções de compra (Catálogo)':'Concorrentes Mapeados'}</p>
                    <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                      {conc.map((c,i)=>{
                        const abaixo=d?.preco&&c.preco<d.preco;const acima=d?.preco&&c.preco>d.preco;const eMin=c.preco===menorPreco&&i===0;
                        return (
                          <div key={i} style={{ background:eMin?'rgba(16, 185, 129, 0.05)':abaixo?'rgba(239, 68, 68, 0.05)':'var(--theme-sidebar)',border:`1px solid ${eMin?'#86efac':abaixo?'#fca5a5':'var(--theme-card-border)'}`,borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12, transition:'transform 0.2s', ':hover':{transform:'translateY(-2px)'} }}>
                            <div style={{ width:32,textAlign:'center',flexShrink:0 }}>{i===0?<Medal style={{ width:18,height:18,color:'#f59e0b',margin:'0 auto' }}/>:i===1?<Award style={{ width:18,height:18,color:'#94a3b8',margin:'0 auto' }}/>:<span style={{ fontSize:13,fontWeight:900,opacity:0.4 }}>{i+1}</span>}</div>
                            {c.thumbnail&&<img src={c.thumbnail} alt="" style={{ width:40,height:40,borderRadius:8,objectFit:'cover',border:'1px solid var(--theme-card-border)',flexShrink:0 }}/>}
                            <div style={{ flex:1,minWidth:0 }}>
                              <p style={{ fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.nome||c.titulo||'—'}</p>
                              <a href={gerarLinkVendedor(c.nome)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, color:'#8b5cf6', textDecoration:'none', marginTop:2, fontWeight:700 }}><ExternalLink size={9}/> Perfil ML</a>
                              {c.titulo&&c.nome&&c.nome!==c.titulo&&<p style={{ fontSize:11,opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', marginTop:4 }}>{c.titulo}</p>}
                              <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:6,flexWrap:'wrap' }}>
                                {c.tipoAnuncio&&<span style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',padding:'2px 6px',borderRadius:4,opacity:0.8 }}>{c.tipoAnuncio}</span>}
                                {c.freteGratis&&<span style={{ fontSize:10,fontWeight:700,color:'#10b981' }}>✓ Frete grátis</span>}
                                {c.vendidos!=null&&<span style={{ fontSize:10,color:'#f59e0b',fontWeight:900, background:'rgba(245, 158, 11, 0.1)', padding:'2px 6px', borderRadius:4 }}>{c.vendidos} vendidos</span>}
                              </div>
                            </div>
                            <div style={{ textAlign:'right',flexShrink:0,minWidth:110 }}>
                              {c.precoOriginal&&c.precoOriginal>c.preco&&<p style={{ fontSize:11,textDecoration:'line-through',opacity:0.4 }}>{fmt(c.precoOriginal)}</p>}
                              <p style={{ fontSize:20,fontWeight:900,color:eMin?'#059669':abaixo?'#ef4444':acima?'#10b981':'var(--theme-text)', lineHeight:1 }}>{fmt(c.preco)}</p>
                              {c.desconto&&<span style={{ display:'inline-block', fontSize:10,fontWeight:900,color:'#059669',background:'#dcfce7',border:'1px solid #86efac',padding:'2px 6px',borderRadius:20, marginTop:4 }}>{c.desconto}</span>}
                              {c.link&&<a href={c.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:8,padding:'5px 12px',borderRadius:8,background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8',fontSize:11,fontWeight:900,textDecoration:'none', transition:'background 0.2s' }}><ExternalLink style={{ width:12,height:12 }}/>Ver Anúncio</a>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ):(
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:14,padding:30,border:'1px solid var(--theme-card-border)',textAlign:'center' }}>
                    <Users style={{ width:32,height:32,margin:'0 auto 12px',opacity:0.2 }}/>
                    <p style={{ fontSize:13,fontWeight:900,textTransform:'uppercase',opacity:0.4 }}>Nenhum concorrente encontrado</p>
                    <p style={{ fontSize:11, opacity:0.3, marginTop:4 }}>Tente pesquisar por catálogo ou título genérico.</p>
                  </div>
                )}
              </>
            )}
            {tab==='info' && (
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:20 }}>
                {[{title:'Dados do Anúncio',rows:[['ID Origem',item.mlbId],['Condição',d?.condicao||'—'],['Tipo',d?.tipoAnuncio||'—'],['Catálogo',d?.ehCatalogo?'Sim':'Não'],['Status',d?.status||'—'],['Estoque',d?.estoque!=null?`${d.estoque} un`:'—'],['Vendidos',d?.vendidos!=null?d.vendidos:'—'],['Avaliação',d?.avaliacoes?`${d.avaliacoes} ★`:'—']]},{title:'Frete & Mais',rows:[['Frete',d?.freteGratis?'✅ Grátis':(d?.frete||'—')],['Fonte da Análise',d?.fonte||'—'],['Data da Análise',fmtDate(d?.analisadoEm)]]}].map(({title,rows})=>(
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
            {tab==='achados' && (
              <div style={{ background:'var(--theme-sidebar)', padding:24, borderRadius:16, border:'1px solid var(--theme-card-border)' }}>
                <h3 style={{ fontSize:14, fontWeight:900, textTransform:'uppercase', color:'#8b5cf6', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><Activity size={16}/> Logs da Pesquisa (Debug)</h3>
                <div style={{ fontFamily:'monospace', fontSize:11, lineHeight:1.6, color:'var(--theme-text)', opacity:0.8, display:'flex', flexDirection:'column', gap:4 }}>
                  {(!d?.debugLog || d.debugLog.length === 0) ? <p>Nenhum log de rastreamento salvo para este item.</p> : d.debugLog.map((linha, i) => {
                    let color = 'inherit';
                    if (linha.includes('❌') || linha.includes('⚠️')) color = '#ef4444';
                    else if (linha.includes('✅') || linha.includes('🎯')) color = '#10b981';
                    else if (linha.includes('🌐') || linha.includes('📡')) color = '#3b82f6';
                    return <div key={i} style={{ padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color }}>{linha}</div>
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

// ── Card compacto ─────────────────────────────────────────────────────────────
function CardResultado({ item, onRemover, selecionado, onSel, onAbrirModal }) {
  const cfg=STATUS_CFG[item.status]||STATUS_CFG.pendente;
  const d=item.dados;
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
  const linkUrl = d?.link || item.url || gerarLinkAnuncio(item.mlbId, ehCatalogo);
  const abaixo=d?.preco&&d?.precoMedio&&d.preco<d.precoMedio;
  
  return (
    <div style={{ background:'var(--theme-card)',border:`1px solid ${selecionado?'#60a5fa':'var(--theme-card-border)'}`,borderRadius:12,overflow:'hidden',boxShadow:selecionado?'0 0 0 2px #3b82f6':undefined, transition:'transform 0.15s, box-shadow 0.15s', ':hover':{transform:'translateY(-2px)', boxShadow:'0 4px 12px rgba(0,0,0,0.1)'} }}>
      <div style={{ height:3,...(item.status==='analisando'?{backgroundImage:'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)',backgroundSize:'200%',animation:'slideGrad 1.5s linear infinite'}:{backgroundColor:cfg.barColor||'#94a3b8'}) }}/>
      <div style={{ padding:'12px 14px' }}>
        <div style={{ display:'flex',alignItems:'flex-start',gap:10 }}>
          <button onClick={()=>onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',padding:0,color:selecionado?'#3b82f6':'var(--theme-text)',opacity:selecionado?1:0.3, marginTop:2 }}>
            {selecionado?<CheckSquare style={{ width:16,height:16,color:'#3b82f6' }}/>:<Square style={{ width:16,height:16 }}/>}
          </button>
          <div style={{ width:40,height:40,borderRadius:8,overflow:'hidden',border:'1px solid var(--theme-card-border)',flexShrink:0,background:'var(--theme-sidebar)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            {d?.thumbnail?<img src={d.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>:<ShoppingBag style={{ width:18,height:18,color:'var(--theme-text)',opacity:0.2 }}/>}
          </div>
          <div style={{ flex:1,minWidth:0,overflow:'hidden' }}>
            <div style={{ display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',marginBottom:4 }}>
              <span style={{ display:'inline-flex',alignItems:'center',gap:3,fontSize:8,fontWeight:900,textTransform:'uppercase',padding:'2px 6px',borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,flexShrink:0 }}>
                {item.status==='analisando'
                  ?<span style={{ width:8,height:8,borderRadius:'50%',background:'#2563eb',display:'inline-block',flexShrink:0,animation:'pulse 1s ease-in-out infinite' }}/>
                  :<cfg.Icon style={{ width:9,height:9 }}/>}
                {cfg.label}
              </span>
              <span style={{ fontSize:9,fontFamily:'monospace',color:'var(--theme-text)',opacity:0.4,flexShrink:0 }}>{item.mlbId}</span>
            </div>
            
            <p style={{ fontSize:13,fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', margin:0 }}>
              {d?.titulo||urlShort(item.url||linkUrl)}
            </p>
            
            {(item.status === 'concluido' || item.status === 'pendente') && (
               <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'#3b82f6', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3, marginTop:3, fontWeight:700 }}>
                 <ExternalLink size={10}/> Ver Anúncio
               </a>
            )}

            {item.status==='erro'&&<p style={{ fontSize:10,color:'#ef4444',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.erro}</p>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flexShrink:0 }}>
            {(item.status==='concluido'||item.status==='erro')&&(
              <button onClick={()=>onAbrirModal(item)} className="ia-tip" data-tip="Detalhes" style={{ padding:6,borderRadius:8,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.2)',color:'#3b82f6',cursor:'pointer',display:'flex' }}><Eye style={{ width:14,height:14 }}/></button>
            )}
            <button onClick={()=>onRemover(item.id)} className="ia-tip" data-tip="Remover" style={{ padding:6,borderRadius:8,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:14,height:14 }}/></button>
          </div>
        </div>
        {item.status==='concluido'&&d&&(
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginTop:12 }}>
            {[{v:fmt(d.preco),l:'Preço',c:'var(--theme-text)'},{v:fmt(d.precoMedio),l:'Média',c:abaixo?'#10b981':'#f59e0b'},{v:d.totalVendedores||(d.concorrentes?.length||0)+1,l:'Vend.',c:'#3b82f6'}].map(({v,l,c})=>(
              <div key={l} style={{ background:'var(--theme-sidebar)',borderRadius:8,padding:'6px 8px',textAlign:'center',border:'1px solid var(--theme-card-border)',overflow:'hidden',minWidth:0 }}>
                <p style={{ fontSize:13,fontWeight:900,color:c,lineHeight:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v}</p>
                <p style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:3 }}>{l}</p>
              </div>
            ))}
          </div>
        )}
        {item.status==='analisando'&&(
          <div style={{ display:'flex',alignItems:'center',gap:6,marginTop:10,fontSize:11,color:'#3b82f6', fontWeight:700 }}>
            <AnalyizStar size={20} active={true} dark={true}/>
            <span style={{ opacity:0.8, animation:'pulse 1.5s infinite' }}>Buscando dados na web...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card histórico ─────────────────────────────────────────────────────────────
function CardHistorico({ item, sel, onSel, onArquivar, onRestaurar, onExcluir, onExcluirDef, onRecarregar }) {
  return (
    <div style={{ background:sel?'rgba(59,130,246,0.06)':'var(--theme-card)',border:`1px solid ${sel?'#93c5fd':'var(--theme-card-border)'}`,borderRadius:11,padding:'10px 12px',display:'flex',alignItems:'center',gap:10,color:'var(--theme-text)' }}>
      <button onClick={()=>onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',color:sel?'#3b82f6':'var(--theme-text)',opacity:sel?1:0.3 }}>
        {sel?<CheckSquare style={{ width:14,height:14,color:'#3b82f6' }}/>:<Square style={{ width:14,height:14 }}/>}
      </button>
      {item.thumbnail?<img src={item.thumbnail} alt="" style={{ width:36,height:36,borderRadius:8,objectFit:'cover',border:'1px solid var(--theme-card-border)',flexShrink:0 }}/>
        :<div style={{ width:36,height:36,background:'var(--theme-sidebar)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}><ShoppingBag style={{ width:16,height:16,opacity:0.2 }}/></div>}
      <div style={{ flex:1,minWidth:0 }}>
        {item.titulo
          ?<a href={item.urlOriginal} target="_blank" rel="noopener noreferrer" style={{ fontSize:12,fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:'none' }}>{item.titulo}</a>
          :<span style={{ fontSize:12,fontWeight:700,color:'#ef4444',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.erro||'Erro na pesquisa'}</span>}
        <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:2,flexWrap:'wrap' }}>
          <span style={{ fontSize:9,fontFamily:'monospace',opacity:0.4 }}>{item.mlbId}</span>
          {item.preco&&<span style={{ fontSize:9,fontWeight:900,color:'#10b981' }}>{fmt(item.preco)}</span>}
          <span style={{ fontSize:9,opacity:0.4 }}><Clock size={9} style={{display:'inline', marginBottom:-1}}/> {fmtDate(item.updatedAt)}</span>
          {item.arquivado&&<span style={{ fontSize:8,fontWeight:900,opacity:0.4,background:'var(--theme-sidebar)',padding:'1px 5px',borderRadius:4,textTransform:'uppercase' }}>Arquivado</span>}
        </div>
      </div>
      <div style={{ display:'flex',gap:4,flexShrink:0 }}>
        <button onClick={()=>onRecarregar(item)} className="ia-tip" data-tip="Nova Busca" style={{ padding:5,borderRadius:7,background:'#eff6ff',border:'1px solid #bfdbfe',color:'#2563eb',cursor:'pointer',display:'flex' }}><RefreshCw style={{ width:11,height:11 }}/></button>
        {item.arquivado
          ?<button onClick={()=>onRestaurar(item.id)} className="ia-tip" data-tip="Restaurar" style={{ padding:5,borderRadius:7,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#16a34a',cursor:'pointer',display:'flex' }}><ArchiveRestore style={{ width:11,height:11 }}/></button>
          :<button onClick={()=>onArquivar(item.id)} className="ia-tip" data-tip="Arquivar" style={{ padding:5,borderRadius:7,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',cursor:'pointer',display:'flex',color:'var(--theme-text)' }}><Archive style={{ width:11,height:11 }}/></button>}
        <button onClick={()=>onExcluir(item.id)} className="ia-tip" data-tip="Excluir" style={{ padding:5,borderRadius:7,background:'#fef3c7',border:'1px solid #fde68a',color:'#b45309',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:11,height:11 }}/></button>
        <button onClick={()=>onExcluirDef(item.id)} className="ia-tip" data-tip="Excluir Definitivo" style={{ padding:5,borderRadius:7,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><XCircle style={{ width:11,height:11 }}/></button>
      </div>
    </div>
  );
}

// ── Card análise de mercado ───────────────────────────────────────────────────
function CardAnalise({ item, sel, onSel, onExcluir, onVer }) {
  return (
    <div style={{ background:sel?'rgba(79,70,229,0.06)':'var(--theme-card)',border:`1px solid ${sel?'#a5b4fc':'var(--theme-card-border)'}`,borderRadius:11,padding:'10px 12px',display:'flex',alignItems:'center',gap:10,color:'var(--theme-text)' }}>
      <button onClick={()=>onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',color:sel?'#6366f1':'var(--theme-text)',opacity:sel?1:0.3 }}>
        {sel?<CheckSquare style={{ width:14,height:14,color:'#6366f1' }}/>:<Square style={{ width:14,height:14 }}/>}
      </button>
      <div style={{ width:36,height:36,borderRadius:8,background:'linear-gradient(135deg,#4f46e5,#9333ea)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0, boxShadow:'0 2px 8px rgba(147, 51, 234, 0.3)' }}>
        <Sparkles style={{ width:18,height:18,color:'#fff' }}/>
      </div>
      <div style={{ flex:1,minWidth:0 }}>
        <p style={{ fontSize:13,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.titulo||'Análise de mercado'}</p>
        <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:4 }}>
          {item.precoMedio&&<span style={{ fontSize:10,fontWeight:900,color:'#10b981', background:'rgba(16, 185, 129, 0.1)', padding:'2px 6px', borderRadius:4 }}>Média: {fmt(item.precoMedio)}</span>}
          <span style={{ fontSize:10,opacity:0.5 }}><Clock size={10} style={{display:'inline', marginBottom:-2}}/> {fmtDate(item.createdAt)}</span>
        </div>
      </div>
      <div style={{ display:'flex',gap:6,flexShrink:0 }}>
        <button onClick={()=>onVer(item)} style={{ padding:6,borderRadius:8,background:'linear-gradient(135deg,rgba(79,70,229,0.12),rgba(147,51,234,0.12))',border:'1px solid rgba(99,102,241,0.3)',color:'#818cf8',cursor:'pointer',display:'flex' }}><Eye style={{ width:14,height:14 }}/></button>
        <button onClick={()=>onExcluir(item.id)} style={{ padding:6,borderRadius:8,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:14,height:14 }}/></button>
      </div>
    </div>
  );
}

function ResumoGeral({ itens }) {
  const ok=itens.filter(i=>i.status==='concluido');
  if (!ok.length) return null;
  const precos=ok.map(i=>i.dados?.preco).filter(Boolean);
  const totalV=ok.reduce((s,i)=>s+(i.dados?.totalVendedores||0),0);
  return (
    <div style={{ background:'linear-gradient(135deg,#0f172a,#1e293b)',borderRadius:10,padding:'7px 14px',color:'#fff',marginBottom:6,display:'flex',alignItems:'center',gap:18,flexWrap:'wrap', border:'1px solid #334155', boxShadow:'0 4px 12px rgba(0,0,0,0.2)' }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <AnalyizStar size={20} active={false} dark={true}/>
        <span style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.3)',letterSpacing:'0.1em' }}>Dashboard Sessão</span>
      </div>
      {[{v:ok.length,l:'anúncios',c:'#fff'},{v:precos.length?fmt(Math.min(...precos)):'—',l:'menor preço',c:'#6ee7b7'},{v:precos.length?fmt(precos.reduce((s,v)=>s+v,0)/precos.length):'—',l:'média do mercado',c:'#fcd34d'},{v:totalV,l:'vendedores detectados',c:'#93c5fd'}].map(({v,l,c})=>(
        <div key={l} style={{ display:'flex',alignItems:'baseline',gap:5 }}>
          <span style={{ fontSize:14,fontWeight:900,color:c }}>{v}</span>
          <span style={{ fontSize:9,textTransform:'uppercase',color:'rgba(255,255,255,0.4)', fontWeight:700 }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ── Modal Comparador (Com Exportação e Chat Integrado) ─────────────────────────
function ModalComparador({ itens, onClose, userId }) {
  const concluidos=itens.filter(i=>i.status==='concluido'&&i.dados);
  const [meuId,setMeuId]=useState(null);
  
  // Chat States
  const [pergunta, setPergunta] = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [respostasQA, setRespostasQA] = useState([]);
  const taRef = useRef(null);
  const qaEndRef = useRef(null);
  useEffect(() => { qaEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [respostasQA]);

  if (!concluidos.length) return null;
  
  const todasOpcoes=[];
  concluidos.forEach(item=>{
    const d=item.dados;
    const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
    const linkBase = gerarLinkAnuncio(item.mlbId, ehCatalogo);
    if(d.seller?.nome&&d.preco>0) todasOpcoes.push({ mlbId:item.mlbId,titulo:d.titulo||item.mlbId,vendedor:d.seller.nome,preco:d.preco,freteGratis:d.freteGratis,link:d.link||linkBase,thumbnail:d.thumbnail,vendidos:d.vendidos,estoque:d.estoque,ehPrincipal:true });
    (d.concorrentes||[]).forEach(c=>{if(c.preco>0) todasOpcoes.push({ mlbId:c.mlbId||item.mlbId,titulo:c.titulo||d.titulo,vendedor:c.nome,preco:c.preco,precoOriginal:c.precoOriginal,desconto:c.desconto,freteGratis:c.freteGratis,link:c.link||linkBase,thumbnail:c.thumbnail||d.thumbnail,vendidos:c.vendidos,estoque:c.estoque,ehPrincipal:false });});
  });
  todasOpcoes.sort((a,b)=>a.preco-b.preco);
  
  const menorPreco=todasOpcoes.length?todasOpcoes[0].preco:0;
  const maiorPreco=todasOpcoes.length?todasOpcoes[todasOpcoes.length-1].preco:0;
  const mediaPreco=todasOpcoes.length?todasOpcoes.reduce((s,o)=>s+o.preco,0)/todasOpcoes.length:0;
  const meuAnuncio=meuId?todasOpcoes.find(o=>o.vendedor===meuId):null;
  const vantagem=op=>{if(!meuAnuncio||op.vendedor===meuAnuncio.vendedor)return null;const diff=meuAnuncio.preco-op.preco;const pct=Math.abs(diff/meuAnuncio.preco*100).toFixed(1);if(diff>0)return{tipo:'perda',msg:`Você ${pct}% mais caro`};if(diff<0)return{tipo:'ganho',msg:`Você ${pct}% mais barato`};return{tipo:'igual',msg:'Mesmo preço'};};
  const grafDados=todasOpcoes.slice(0,8).map(o=>({label:o.vendedor?.substring(0,10)||'—',valor:o.preco,cor:o.vendedor===meuId?'#3b82f6':o.preco===menorPreco?'#10b981':'#94a3b8'}));
  
  const enviarPergunta = async () => {
    if (!pergunta.trim() || respondendo) return;
    const q = pergunta.trim(); setPergunta(''); setRespondendo(true);
    setRespostasQA(prev => [...prev, { tipo:'pergunta', texto: q }]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/research/deep-market`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userId, itens: concluidos.map(i=>i.dados), perguntaFollowUp: q, contextoAnterior: `Estou na tela de Comparador de Preços. Tabela de concorrentes: ${JSON.stringify(todasOpcoes.slice(0,10))}` }),
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
    } catch(e) { setRespostasQA(prev => [...prev, { tipo:'resposta', html: `<span style="color:#ef4444">Erro: ${e.message}</span>` }]); } 
    finally { setRespondendo(false); }
  };

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
              <MenuExportacao onExport={(f) => exportarDadosComplexos(f, todasOpcoes, 'Comparador de Preços')} />
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
                <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'#3b82f6',marginBottom:8,marginTop:16, display:'flex', alignItems:'center', gap:4 }}><Zap size={14}/> Referenciar seu anúncio:</p>
                <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                  {[...new Set(todasOpcoes.map(o=>o.vendedor))].slice(0,10).map(nome=>(
                    <button key={nome} onClick={()=>setMeuId(meuId===nome?null:nome)} style={{ padding:'6px 12px',borderRadius:10,border:`1px solid ${meuId===nome?'#3b82f6':'var(--theme-card-border)'}`,background:meuId===nome?'#eff6ff':'var(--theme-sidebar)',color:meuId===nome?'#1d4ed8':'var(--theme-text)',fontSize:11,fontWeight:900,cursor:'pointer', transition:'all 0.2s' }}>{nome}</button>
                  ))}
                </div>
                {meuAnuncio&&<div style={{ marginTop:14,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.3)',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12 }}><span style={{ fontSize:11,fontWeight:900,color:'#3b82f6', textTransform:'uppercase' }}>Você:</span><span style={{ fontSize:20,fontWeight:900,color:'#3b82f6' }}>{fmt(meuAnuncio.preco)}</span>{meuAnuncio.preco===menorPreco?<span style={{ fontSize:11,fontWeight:900,color:'#059669',background:'#ecfdf5',border:'1px solid #a7f3d0',padding:'4px 10px',borderRadius:20, display:'flex', alignItems:'center', gap:4 }}><Medal size={12}/> Líder de Preço</span>:<span style={{ fontSize:11,fontWeight:900,color:'#dc2626',background:'#fee2e2',border:'1px solid #fca5a5',padding:'4px 10px',borderRadius:20, display:'flex', alignItems:'center', gap:4 }}><TrendingUp size={12}/> {((meuAnuncio.preco/menorPreco-1)*100).toFixed(1)}% acima</span>}</div>}
              </div>

              {/* CHAT IA no Comparador */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', background:'var(--theme-sidebar)', padding:'16px' }}>
                <div style={{ flex:1, overflowY:'auto', marginBottom:12 }} className="ia-scroll">
                  {respostasQA.length === 0 ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, opacity:0.4, justifyContent:'center', height:'100%' }}>
                      <Sparkles size={24}/> <p style={{ fontSize:12, fontWeight:900, textTransform:'uppercase' }}>Fale com a IA sobre a concorrência</p>
                    </div>
                  ) : respostasQA.map((item, i) => (
                    item.tipo === 'pergunta' ? (
                      <div key={i} style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}><div style={{ background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', borderRadius:'14px 14px 4px 14px', padding:'8px 12px', maxWidth:'90%', fontSize:12, fontWeight:600 }}>{item.texto}</div></div>
                    ) : (
                      <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:8 }}><div style={{ background:'rgba(59,130,246,0.1)', padding:4, borderRadius:'50%' }}><AnalyizStar size={16} active={false} dark={true}/></div><div style={{ flex:1, background:'rgba(59,130,246,0.05)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:'4px 14px 14px 14px', padding:'10px 14px', fontSize:12, lineHeight:1.6 }} dangerouslySetInnerHTML={{ __html: item.html }} /></div>
                    )
                  ))}
                  {respondendo && <div style={{ display:'flex', gap:8, alignItems:'center', paddingLeft:24 }}><Loader2 size={14} style={{ color:'#3b82f6', animation:'spin 1s linear infinite' }}/><span style={{ fontSize:11, color:'#3b82f6', fontStyle:'italic' }}>Analisando tabela...</span></div>}
                  <div ref={qaEndRef}/>
                </div>
                <div style={{ background:'var(--theme-card)', border:`1px solid ${pergunta.trim() ? '#3b82f6' : 'var(--theme-card-border)'}`, borderRadius:20, padding:'8px 12px', display:'flex', alignItems:'center', gap:8 }}>
                  <input value={pergunta} onChange={e=>setPergunta(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')enviarPergunta();}} disabled={respondendo} placeholder="Pergunte à IA (Ex: Quem devo cobrir?)" style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--theme-text)', fontSize:12 }} />
                  <button onClick={enviarPergunta} disabled={!pergunta.trim() || respondendo} style={{ background:'none', border:'none', color:pergunta.trim()?'#3b82f6':'var(--theme-text)', opacity:pergunta.trim()?1:0.3, cursor:'pointer' }}><Send size={16}/></button>
                </div>
              </div>

            </div>
            <div style={{ overflowY:'auto' }} className="ia-scroll">
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead style={{ background:'var(--theme-sidebar)',position:'sticky',top:0, zIndex:10, boxShadow:'0 2px 4px rgba(0,0,0,0.1)' }}>
                  <tr>{['Rank','Vendedor','Preço','Infos','Análise'].map((h,i)=><th key={i} style={{ padding:'12px 14px',fontSize:10,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)', opacity:0.6,textAlign:'left',borderBottom:'1px solid var(--theme-card-border)' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {todasOpcoes.map((op,i)=>{
                    const isMeu=meuId&&op.vendedor===meuId;const vant=vantagem(op);
                    return (
                      <tr key={i} style={{ background:isMeu?'rgba(59,130,246,0.08)':i===0?'rgba(16,185,129,0.05)':undefined,borderBottom:'1px solid var(--theme-card-border)', transition:'background 0.2s' }}>
                        <td style={{ padding:'12px 14px',width:40, textAlign:'center' }}>{i===0?<Medal style={{ width:18,height:18,color:'#f59e0b' }}/>:i===1?<Award style={{ width:18,height:18,color:'#94a3b8' }}/>:<span style={{ fontSize:12,opacity:0.4,fontWeight:900 }}>{i+1}</span>}</td>
                        <td style={{ padding:'12px 14px' }}>
                          <span style={{ fontSize:13,fontWeight:900,color:isMeu?'#3b82f6':'var(--theme-text)' }}>{op.vendedor}</span>
                          {isMeu&&<span style={{ display:'block',fontSize:9,fontWeight:900,color:'#3b82f6',textTransform:'uppercase',marginTop:2 }}>◀ Sua Posição</span>}
                          <a href={gerarLinkVendedor(op.vendedor)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, color:'#8b5cf6', textDecoration:'none', marginTop:4, fontWeight:700 }}><ExternalLink size={9}/> Perfil ML</a>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <p style={{ fontSize:16,fontWeight:900,color:i===0?'#10b981':isMeu?'#3b82f6':'var(--theme-text)' }}>{fmt(op.preco)}</p>
                          {op.desconto&&<span style={{ display:'inline-block', fontSize:10,fontWeight:900,color:'#059669',background:'#dcfce7',padding:'2px 6px',borderRadius:20, marginTop:4, border:'1px solid #86efac' }}>{op.desconto}</span>}
                        </td>
                        <td style={{ padding:'12px 14px',fontSize:11,fontWeight:700 }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {op.freteGratis ? <span style={{ color:'#10b981' }}>✓ Frete Grátis</span> : <span style={{ opacity:0.5 }}>Frete Pago</span>}
                            {op.vendidos != null && <span style={{ color:'#f59e0b', background:'rgba(245, 158, 11, 0.1)', padding:'2px 6px', borderRadius:4, display:'inline-block', width:'fit-content' }}>{op.vendidos} vendidos</span>}
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          {vant&&!isMeu?<span style={{ fontSize:10,fontWeight:900,color:vant.tipo==='ganho'?'#059669':'#dc2626',background:vant.tipo==='ganho'?'#ecfdf5':'#fee2e2',border:`1px solid ${vant.tipo==='ganho'?'#a7f3d0':'#fca5a5'}`,padding:'4px 10px',borderRadius:20,display:'inline-block', whiteSpace:'nowrap' }}>{vant.msg}</span>:isMeu?<span style={{ fontSize:10,fontWeight:900,color:'#1d4ed8',background:'#eff6ff',border:'1px solid #bfdbfe',padding:'4px 10px',borderRadius:20, whiteSpace:'nowrap' }}>Seu anúncio</span>:null}
                          {op.link&&<a href={op.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:6,padding:'4px 10px',borderRadius:8,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textDecoration:'none', transition:'all 0.2s', ':hover':{background:'var(--theme-card)'} }}><ExternalLink style={{ width:12,height:12 }}/>Ver Anúncio</a>}
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

// ═════════════════════════════════════════════════════════════════════════════
// MODAL PESQUISA DE MERCADO — v12 (Relatório Elegante + Q&A + Terminal Sidebar)
// ═════════════════════════════════════════════════════════════════════════════
function ModalPesquisaMercado({ pesquisaIA, itens, logsPesquisa, gerandoPesquisa, onClose, onSalvar, userId }) {
  const [pergunta,    setPergunta]    = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [respostasQA, setRespostasQA] = useState([]);
  
  const qaEndRef   = useRef(null);
  const taRef      = useRef(null);

  useEffect(() => { qaEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [respostasQA]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  }, [pergunta]);

  const enviarPergunta = async () => {
    if (!pergunta.trim() || respondendo) return;
    const q = pergunta.trim(); setPergunta(''); setRespondendo(true);
    setRespostasQA(prev => [...prev, { tipo:'pergunta', texto: q }]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/research/deep-market`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          userId,
          itens: itens.filter(i=>i.status==='concluido').map(i=>({ mlbId: i.dados?.mlbId, titulo: i.dados?.titulo, preco: i.dados?.preco, precoMedio: i.dados?.precoMedio, precoMin: i.dados?.precoMin, totalVendedores: i.dados?.totalVendedores, ehCatalogo: i.dados?.ehCatalogo })),
          perguntaFollowUp: q,
          contextoAnterior: `Relatório: ${pesquisaIA?.titulo || ''}. P: ${q}`,
        }),
      });
      const reader=res.body.getReader();const decoder=new TextDecoder();
      let buffer='';let ev=null;let respostaAcumulada='';
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
    } catch(e) { setRespostasQA(prev => [...prev, { tipo:'resposta', html: `<span style="color:#ef4444">Erro: ${e.message}</span>` }]); } 
    finally { setRespondendo(false); }
  };

  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarPergunta(); } };
  const SUGESTOES = [ 'Se eu baixar o preço em R$ 20, melhoro minha posição?', 'Qual vendedor é minha maior ameaça?', 'Devo oferecer frete grátis para competir melhor?', 'Qual é a faixa de preço ideal?' ];

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999990,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width: 900, maxWidth: '96vw', height: '90vh', maxHeight: '90vh', background: 'var(--theme-card)', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.7), 0 0 40px rgba(139, 92, 246, 0.15)', color: 'var(--theme-text)', position: 'relative' }}>
          <div style={{ padding:'20px 24px', background:'linear-gradient(135deg, var(--theme-header), #2e1065)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, position:'relative', overflow:'hidden' }}>
            <div className="ia-header-glow" style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg, transparent, #8b5cf6, #d946ef, #3b82f6, transparent)', animation:'slideGrad 2s linear infinite' }} />
            <div style={{ display:'flex', alignItems:'center', gap:14, zIndex:1 }}>
              <div style={{ background:'rgba(0,0,0,0.2)', padding:8, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.1)' }}><AnalyizStar size={32} active={gerandoPesquisa} dark={true}/></div>
              <div><p style={{ fontSize:16, fontWeight:900, color:'#fff', lineHeight:1.2, textShadow:'0 2px 4px rgba(0,0,0,0.5)' }}>Inteligência de Mercado Analítica</p><p style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:4 }}>{gerandoPesquisa ? 'A IA Analyiz está mapeando a web para você...' : (pesquisaIA?.titulo || 'Análise Profunda Concluída')}</p></div>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center', zIndex:1 }}>
              <MenuExportacao onExport={(f) => exportarDadosComplexos(f, itens, 'Inteligência de Mercado Analítica')} disabled={!pesquisaIA || gerandoPesquisa} />
              <button onClick={onSalvar} disabled={!pesquisaIA || gerandoPesquisa} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10, background: pesquisaIA&&!gerandoPesquisa ? 'linear-gradient(135deg,#059669,#10b981)' : 'rgba(255,255,255,0.05)', color:'#fff', fontWeight:900, fontSize:11, border:'1px solid rgba(255,255,255,0.1)', cursor: pesquisaIA&&!gerandoPesquisa ? 'pointer':'not-allowed', opacity: pesquisaIA&&!gerandoPesquisa ? 1:0.4, transition:'all 0.2s', boxShadow: pesquisaIA&&!gerandoPesquisa ? '0 4px 12px rgba(16,185,129,0.3)' : 'none' }}><ArchiveRestore size={14}/> Salvar Relatório</button>
              <button onClick={onClose} style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', color:'rgba(255,255,255,0.6)', padding:8, borderRadius:'50%', transition:'all 0.2s', ':hover':{background:'rgba(255,255,255,0.1)', color:'#fff'} }}><X style={{ width:18, height:18 }}/></button>
            </div>
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0, background:'var(--theme-bg)' }}>
            {gerandoPesquisa && <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:12, padding:'14px 20px', background:'rgba(139,92,246,0.1)', borderBottom:'1px solid rgba(139,92,246,0.2)' }}><Loader2 size={20} style={{ color:'#8b5cf6', animation:'spin 1s linear infinite' }}/><p style={{ fontSize:13, fontWeight:900, color:'#8b5cf6' }}>Análise em Andamento: Aguarde o cruzamento de dados...</p></div>}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', minHeight:0 }} className="ia-scroll">
              {pesquisaIA?.conteudoHtml ? <RelatorioTopicos html={pesquisaIA.conteudoHtml}/> : !gerandoPesquisa && <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:60, gap:12, opacity:0.3 }}><Globe style={{ width:48, height:48 }}/><p style={{ fontSize:14, fontWeight:900, textTransform:'uppercase' }}>Pronto para varrer a web.</p></div>}
              {respostasQA.length > 0 && (
                <div style={{ marginTop:24, borderTop:'1px solid var(--theme-card-border)', paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
                  <p style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', color:'#8b5cf6', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><MessageSquare size={14}/> Dúvidas Focadas (Q&A)</p>
                  {respostasQA.map((item, i) => item.tipo === 'pergunta' ? (<div key={i} style={{ display:'flex', justifyContent:'flex-end' }}><div style={{ background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:'18px 18px 6px 18px', padding:'10px 16px', maxWidth:'85%', fontSize:13, fontWeight:600, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>{item.texto}</div></div>) : (<div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start' }}><div style={{ background:'rgba(139,92,246,0.1)', padding:6, borderRadius:'50%', border:'1px solid rgba(139,92,246,0.2)' }}><AnalyizStar size={20} active={false} dark={true}/></div><div style={{ flex:1, background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.2)', borderRadius:'6px 18px 18px 18px', padding:'12px 18px', fontSize:13, lineHeight:1.65, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }} dangerouslySetInnerHTML={{ __html: item.html }} /></div>))}
                  {respondendo && <div style={{ display:'flex', gap:12, alignItems:'center', paddingLeft:32 }}><Loader2 size={16} style={{ color:'#8b5cf6', animation:'spin 1s linear infinite' }}/><span style={{ fontSize:12, color:'#8b5cf6', fontWeight:700, fontStyle:'italic' }}>Processando resposta...</span></div>}
                  <div ref={qaEndRef}/>
                </div>
              )}
            </div>
            <div style={{ flexShrink:0, padding:'12px 16px', borderTop:'1px solid var(--theme-card-border)', background:'var(--theme-card)' }}>
              {respostasQA.length === 0 && !respondendo && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12, paddingLeft:4 }}>
                  {SUGESTOES.map(q => <button key={q} onClick={() => setPergunta(q)} style={{ fontSize:10, padding:'6px 12px', borderRadius:20, background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', cursor:'pointer', opacity:0.8, fontFamily:"'Google Sans',sans-serif", maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'all 0.2s', ':hover':{background:'rgba(139,92,246,0.1)', borderColor:'rgba(139,92,246,0.3)', opacity:1} }}>{q}</button>)}
                </div>
              )}
              <div style={{ background:'var(--theme-sidebar)', border:`1.5px solid ${pergunta.trim() ? 'rgba(139, 92, 246, 0.5)' : 'var(--theme-card-border)'}`, borderRadius:24, padding:'10px 16px', display:'flex', alignItems:'flex-end', gap:12, transition:'all 0.2s', boxShadow: pergunta.trim() ? '0 0 0 3px rgba(139, 92, 246, 0.1)' : 'none' }}>
                <textarea ref={taRef} value={pergunta} onChange={e => setPergunta(e.target.value)} onKeyDown={handleKeyDown} disabled={respondendo || gerandoPesquisa} placeholder={gerandoPesquisa ? 'A IA está processando...' : 'Faça uma pergunta específica sobre o relatório... (Enter para enviar)'} rows={1} style={{ flex:1, background:'transparent', border:'none', outline:'none', resize:'none', color:'var(--theme-text)', fontSize:13, fontFamily:"'Google Sans',sans-serif", maxHeight:140, lineHeight:1.5, overflowY:'auto' }} />
                <button onClick={enviarPergunta} disabled={!pergunta.trim() || respondendo || gerandoPesquisa} style={{ width:36, height:36, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: pergunta.trim() && !respondendo && !gerandoPesquisa ? '#8b5cf6' : 'transparent', color: pergunta.trim() && !respondendo && !gerandoPesquisa ? '#fff' : 'var(--theme-text)', border: pergunta.trim() && !respondendo && !gerandoPesquisa ? 'none' : '1px solid var(--theme-card-border)', cursor: pergunta.trim() && !respondendo && !gerandoPesquisa ? 'pointer':'default', opacity: pergunta.trim() && !respondendo && !gerandoPesquisa ? 1:0.3, transition:'all 0.2s' }}>{respondendo ? <Loader2 size={16} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={15} style={{ marginLeft:2 }}/>}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
export default function MlResearch() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const [aba,           setAba]          = useState('pesquisa');
  const [subAbaHist,    setSubAbaHist]   = useState('itens');
  const [inputTexto,    setInputTexto]   = useState('');
  const [mostrarInput,  setMostrarInput] = useState(false);
  const [mlConectado,   setMlConectado]  = useState(false);
  const [rodando,       setRodando]      = useState(false);
  const [filtroStatus,  setFiltroStatus] = useState('todos');
  const [filtroData,    setFiltroData]   = useState('');
  const [log,           setLog]          = useState([]);
  const [selecionados,  setSelecionados] = useState(new Set());
  const [modalAberto,   setModalAberto]  = useState(null);
  const [showComparador, setShowComparador] = useState(false);
  const [showDica,       setShowDica]       = useState(false);

  const [pesquisaIA,       setPesquisaIA]       = useState(null);
  const [gerandoPesquisa, setGerandoPesquisa] = useState(false);
  const [showPesquisaModal, setShowPesquisaModal] = useState(false);
  const [logsPesquisa,    setLogsPesquisa]    = useState([]);
  const [analiseVista,    setAnaliseVista]    = useState(null);

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

  const [historico,       setHistorico]       = useState([]);
  const [arquivados,      setArquivados]      = useState([]);
  const [analisesMercado, setAnalisesMercado] = useState([]);
  const [loadingHist,     setLoadingHist]     = useState(false);
  const [selHist,         setSelHist]         = useState(new Set());
  const [contHist,        setContHist]        = useState({ historico:0, arquivados:0 });

  const rodandoRef = useRef(false);
  const abortRef   = useRef(false);
  const logEndRef  = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior:'smooth' }); }, [log]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`).then(r=>r.json()).then(d=>setMlConectado(d.connected&&!d.expired)).catch(()=>{});
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

  const addLog = useCallback((msg,tipo='info') => { const ts=new Date().toLocaleTimeString('pt-BR'); setLog(prev=>[...prev.slice(-100),{msg,tipo,ts}]); }, []);

  const buscarHistorico = useCallback(async (arq) => {
    if (!userId) return; setLoadingHist(true);
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=${arq}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json(); const lista=Array.isArray(data)?data:[];
      if (arq) { setArquivados(lista); setContHist(prev=>({...prev,arquivados:lista.length})); } else { setHistorico(lista);  setContHist(prev=>({...prev,historico:lista.length})); }
    } catch(e) { console.warn('[Histórico]',e.message); } finally { setLoadingHist(false); }
  }, [userId]);

  const buscarAnalisesMercado = useCallback(async () => {
    if (!userId) return;
    try { const res=await fetch(`${API_BASE_URL}/api/ml/research/market-analyses?userId=${userId}`); if (res.ok) { const d=await res.json(); if(Array.isArray(d)) setAnalisesMercado(d); } } catch {}
  }, [userId]);

  const arquivarHist   = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/arquivar`,{method:'PUT'}); buscarHistorico(false); };
  const restaurarHist  = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/restaurar`,{method:'PUT'}); buscarHistorico(true); };
  const excluirHist    = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const excluirDefHist = async id => { if (!window.confirm('Excluir permanentemente?')) return; await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/definitivo`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const excluirAnalise = async id => { if (!window.confirm('Excluir esta análise?')) return; await fetch(`${API_BASE_URL}/api/ml/research/market-analyses/${id}`,{method:'DELETE'}); buscarAnalisesMercado(); };
  const acaoLoteHist   = async acao => { const ids=[...selHist]; if(!ids.length) return; if(acao==='arquivar') await fetch(`${API_BASE_URL}/api/ml/research/historico/lote/arquivar`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})}); if(acao==='excluir')  await fetch(`${API_BASE_URL}/api/ml/research/historico/lote`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})}); setSelHist(new Set()); buscarHistorico(aba==='arquivados'); };
  const recarregarDoHistorico = item => { setAba('pesquisa'); setTimeout(() => { if (!item.mlbId) return; if (!itens.find(i=>i.mlbId===item.mlbId)) { setItens(prev=>[...prev,{id:`${item.mlbId}-${Date.now()}`,mlbId:item.mlbId,url:item.urlOriginal||item.mlbId,status:'pendente',dados:null,erro:null}]); } }, 100); };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    let todosExtraidos = [];
    for (const file of files) {
      try {
        const text = await file.text();
        todosExtraidos.push(...extrairVariosMLBs(text));
      } catch (err) { console.warn('Erro ao ler', file.name); }
    }
    const unicos = [...new Set(todosExtraidos)];
    if (unicos.length > 0) { setInputTexto(prev => (prev ? prev + '\n' : '') + unicos.join('\n')); addLog(`📂 ${unicos.length} links/IDs extraídos de ${files.length} arquivo(s)`, 'success'); } 
    else { alert('Nenhum link do Mercado Livre ou código MLB válido encontrado nos arquivos.'); }
    e.target.value = '';
  };

  const processarInput = () => {
    if (!inputTexto.trim()) return;
    const linhas=inputTexto.split(/[\n,;]+/).map(l=>l.trim()).filter(Boolean);
    const novos=[]; const jaExiste=new Set(itens.map(i=>i.mlbId));
    for (const linha of linhas) {
      const mlbId=extrairMLBId(linha);
      if (!mlbId) { addLog(`⚠️ Formato ignorado: ${linha.substring(0,30)}`,'warn'); continue; }
      if (jaExiste.has(mlbId)) { addLog(`ℹ️ ${mlbId} já está na lista`); continue; }
      jaExiste.add(mlbId);
      novos.push({ id:`${mlbId}-${Date.now()}-${Math.random()}`,mlbId,url:linha,status:'pendente',dados:null,erro:null });
    }
    if (!novos.length) { addLog('Nenhum link novo válido.','warn'); return; }
    setItens(prev=>[...prev,...novos]); setInputTexto(''); addLog(`✅ ${novos.length} anúncio(s) adicionados`,'success'); setMostrarInput(false);
  };

  const tipoDebug = linha => { if (linha.startsWith('✅')||linha.startsWith('🎯')) return 'success'; if (linha.startsWith('❌')||linha.startsWith('⚠️')) return 'warn'; return 'info'; };

  const buscarAnuncio = useCallback(async (mlbId, url) => {
    const params=new URLSearchParams({userId}); if (url) params.set('urlOriginal',encodeURIComponent(url));
    const res=await fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?${params}`,{signal:AbortSignal.timeout(45000)});
    const json=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
    if (!res.ok) throw new Error(json.error||`HTTP ${res.status}`);
    return json;
  }, [userId]);

  const executarFila = useCallback(async (ids) => {
    if (rodandoRef.current) return;
    rodandoRef.current=true; abortRef.current=false; setRodando(true); addLog(`🚀 Analisando ${ids.length} anúncio(s)...`,'success');
    const retentar=[];
    for (let i=0;i<ids.length;i++) {
      if (abortRef.current) break; const{mlbId,url}=ids[i];
      setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando'}:it)); addLog(`── [${i+1}/${ids.length}] ${mlbId} ──────────────`);
      try {
        const dados=await buscarAnuncio(mlbId,url);
        if (Array.isArray(dados.debug)) dados.debug.forEach(linha=>addLog(`  ${linha}`,tipoDebug(linha)));
        // SALVA O DEBUG PARA A ABA "O QUE ACHAMOS"
        const{debug:_dbg,...dadosSemDebug}=dados;
        dadosSemDebug.debugLog = _dbg;
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados:dadosSemDebug}:it));
        const numVend=dadosSemDebug.totalVendedores||(dadosSemDebug.concorrentes?.length||0)+1;
        addLog(`✅ Concluído: ${numVend} vendedor(es)`,'success');
        if (i<ids.length-1&&!abortRef.current) await new Promise(r=>setTimeout(r,800));
      } catch(e) {
        const isTO=e.message.includes('timeout')||e.name==='TimeoutError';
        if (isTO) { retentar.push({mlbId,url}); setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'fila',erro:'Re-tentativa pendente...'}:it)); addLog(`⏳ ${mlbId}: timeout — re-tentará`,'warn'); }
        else { setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it)); addLog(`❌ ${mlbId}: ${e.message}`,'warn'); }
        await new Promise(r=>setTimeout(r,1200));
      }
    }
    if (retentar.length&&!abortRef.current) {
      addLog(`🔄 Re-tentando ${retentar.length} item(s) em 5s...`); await new Promise(r=>setTimeout(r,5000));
      for (const{mlbId,url} of retentar) {
        if (abortRef.current) break;
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando',erro:null}:it)); addLog(`🔄 Re-tentando ${mlbId}...`);
        try {
          const dados=await buscarAnuncio(mlbId,url);
          if (Array.isArray(dados.debug)) dados.debug.forEach(l=>addLog(`  ${l}`,tipoDebug(l)));
          const{debug:_d,...dadosSemDebug}=dados; dadosSemDebug.debugLog = _d;
          setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados:dadosSemDebug}:it)); addLog(`✅ ${mlbId} OK`,'success');
        } catch(e) { setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it)); addLog(`❌ ${mlbId}: ${e.message}`,'warn'); }
        await new Promise(r=>setTimeout(r,1000));
      }
    }
    rodandoRef.current=false; setRodando(false); addLog('🎯 Análise concluída!','success');
  }, [buscarAnuncio, addLog]);

  const iniciarAnalise  = () => { const ids=itens.filter(i=>['pendente','erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if(ids.length) executarFila(ids); };
  const pararAnalise    = () => { abortRef.current=true; addLog('⏹ Interrompido','warn'); };
  const removerItem     = id => { setItens(prev=>prev.filter(i=>i.id!==id)); setSelecionados(prev=>{const n=new Set(prev);n.delete(id);return n;}); };
  const limparTudo      = () => { if(rodandoRef.current) return; if(!window.confirm('Limpar todos os anúncios da sessão atual?')) return; setItens([]); setLog([]); setSelecionados(new Set()); };
  const reanaliarErros  = () => { const ids=itens.filter(i=>['erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if(ids.length) executarFila(ids); };
  const toggleSel       = id => setSelecionados(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  
  const dispararPesquisaMercado = async (itensAlvo) => {
    const concluidos = itensAlvo || itens.filter(i=>selecionados.has(i.id)&&i.status==='concluido');
    if (!concluidos.length) return;
    setPesquisaIA(null); setLogsPesquisa([]); setGerandoPesquisa(true); setShowPesquisaModal(true);
    const addLog2=(msg,tipo)=>setLogsPesquisa(prev=>[...prev,{msg,tipo:tipo||'info',ts:new Date().toLocaleTimeString('pt-BR')}]);
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/deep-market`,{ method:'POST',headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, itens:concluidos.map(i=>i.dados) }) });
      const reader=res.body.getReader();const decoder=new TextDecoder(); let buffer='';let ev=null;
      while(true){
        const{value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split('\n');buffer=lines.pop();
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{ const data=JSON.parse(line.slice(6)); if(ev==='log') addLog2(data.msg,data.tipo); else if(ev==='done') setPesquisaIA(data); else if(ev==='error') addLog2(`❌ ${data.error}`,'error'); }catch{}
            ev=null;
          }
        }
      }
    } catch(e) { addLog2(`❌ Erro: ${e.message}`,'error'); } finally { setGerandoPesquisa(false); }
  };

  const salvarPesquisaNoHistorico = async () => {
    if (!pesquisaIA) return;
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/market-save`,{ method:'POST',headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId,...pesquisaIA }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addLog('💾 Análise de mercado salva!','success'); setShowPesquisaModal(false); setPesquisaIA(null); buscarAnalisesMercado();
    } catch(e) { addLog(`❌ Falha ao salvar: ${e.message}`,'warn'); }
  };

  const contagens      = { todos:itens.length,pendente:itens.filter(i=>i.status==='pendente').length,analisando:itens.filter(i=>i.status==='analisando').length,concluido:itens.filter(i=>i.status==='concluido').length,erro:itens.filter(i=>i.status==='erro').length,fila:itens.filter(i=>i.status==='fila').length };
  const temPendentes   = contagens.pendente+contagens.erro+contagens.fila>0;
  
  let itensFiltrados = filtroStatus==='todos'?itens:itens.filter(i=>i.status===filtroStatus);
  if (filtroData) itensFiltrados = itensFiltrados.filter(i => i.status === 'concluido' && i.dados?.analisadoEm && new Date(i.dados.analisadoEm).toISOString().split('T')[0] === filtroData);
  const isNewSession   = itens.length===0;

  const FILTROS=[
    {k:'todos',l:`Todos (${contagens.todos})`,ac:'var(--theme-sidebar)',cc:'var(--theme-text)',bc:'var(--theme-card-border)'},
    {k:'concluido',l:`Concluídos (${contagens.concluido})`,ac:'#ecfdf5',cc:'#059669',bc:'#a7f3d0'},
    {k:'pendente',l:`Pendentes (${contagens.pendente})`,ac:'#fef3c7',cc:'#d97706',bc:'#fde68a'},
    {k:'analisando',l:`Analisando (${contagens.analisando})`,ac:'#eff6ff',cc:'#2563eb',bc:'#bfdbfe'},
    {k:'erro',l:`Erros (${contagens.erro})`,ac:'#fee2e2',cc:'#dc2626',bc:'#fca5a5'},
    {k:'fila',l:`Fila (${contagens.fila})`,ac:'#f3e8ff',cc:'#7c3aed',bc:'#d8b4fe'},
  ];

  const btnBase={padding:'5px 10px',borderRadius:8,border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textTransform:'uppercase',cursor:'pointer',display:'flex',alignItems:'center',gap:4};

  // ESTILO PARA TERMINAL FLUTUANTE
  const isTerminalFloating = showPesquisaModal;
  const terminalStyle = isTerminalFloating ? {
    position: 'fixed', left: '20px', top: '8vh', bottom: '8vh', width: '320px', maxHeight: 'none',
    zIndex: 999999, boxShadow: '0 30px 80px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', animation: 'slideDown 0.3s ease'
  } : { width: 300, flexShrink: 0, maxHeight: '76vh' };

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
          {[{k:'pesquisa', l:'Pesquisa', Ic:Search}, {k:'historico', l:`Histórico (${contHist.historico})`, Ic:History}, {k:'arquivados',l:`Arquivados (${contHist.arquivados})`, Ic:Archive}].map(({k,l,Ic})=>(
            <button key={k} onClick={()=>setAba(k)} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,fontSize:10,fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:aba===k?'var(--theme-header)':'transparent',color:aba===k?'#FFE600':'var(--theme-text)',opacity:aba===k?1:0.5,whiteSpace:'nowrap',minWidth:'max-content', transition:'all 0.15s' }}><Ic style={{ width:12,height:12 }}/>{l}</button>
          ))}
        </div>

        {aba==='pesquisa' && (<button onClick={()=>setMostrarInput(v=>!v)} style={{ ...btnBase,background:mostrarInput?'#FFE600':'var(--theme-header)',color:mostrarInput?'#1e293b':'#FFE600',border:'none',padding:'6px 12px',flexShrink:0, transition:'all 0.2s' }}><Plus style={{ width:13,height:13 }}/>Adicionar Links</button>)}

        <div style={{ marginLeft:'auto',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
          {aba==='pesquisa'&&itens.length>0&&(<>
            <MenuExportacao onExport={(f) => exportarDadosComplexos(f, itensFiltrados.filter(i=>i.status==='concluido'), 'Relatório Global da Sessão')} disabled={!contagens.concluido || rodando} />
            {!rodando&&(contagens.erro+contagens.fila)>0&&<button onClick={reanaliarErros} style={{ ...btnBase,color:'#d97706',borderColor:'#fde68a',background:'#fef3c7' }}><RefreshCw style={{ width:13,height:13 }}/>Re-tentar</button>}
            <button onClick={limparTudo} disabled={rodando} style={{ ...btnBase,color:'#ef4444',borderColor:'#fca5a5',background:'#fee2e2' }}><Trash2 style={{ width:13,height:13 }}/>Limpar</button>
          </>)}
          {aba==='pesquisa' && (
            <div style={{ position:'relative' }}>
              <button onClick={()=>setShowDica(v=>!v)} style={{ ...btnBase,padding:6,background:showDica?'#fef9c3':'var(--theme-sidebar)',color:showDica?'#854d0e':'var(--theme-text)',borderColor:showDica?'#fde047':'var(--theme-card-border)', transition:'all 0.2s' }}><HelpCircle style={{ width:14,height:14 }}/></button>
              {showDica && (
                <Portal>
                  <div onClick={()=>setShowDica(false)} style={{ position:'fixed',inset:0,zIndex:99990 }}>
                    <div onClick={e=>e.stopPropagation()} style={{ position:'fixed',top:60,right:16,zIndex:99991,width:300,background:'#1e293b',border:'1px solid #334155',borderRadius:14,padding:14,boxShadow:'0 20px 60px rgba(0,0,0,0.5)',animation:'slideDown 0.15s ease' }}>
                      <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'#fbbf24',marginBottom:10,display:'flex',alignItems:'center',gap:6 }}><HelpCircle style={{ width:13,height:13 }}/>Dicas Analyiz</p>
                      {[{e:'🔗',t:'Links ou IDs',d:'Cole um por linha ou importe arquivos TXT/CSV.'},{e:'⚡',t:'Análise auto',d:'Clique Analisar no terminal.'},{e:'📦',t:'Catálogo',d:'Busca todas as opções de compra no ML.'},{e:'📊',t:'Comparador',d:'Selecione 2+ e clique Comparar.'},{e:'🤖',t:'Pesquisa IA',d:'Selecione itens e clique Pesquisa IA.'},{e:'💬',t:'Q&A',d:'No relatório, faça perguntas específicas à IA.'}].map(({e,t,d})=>(
                        <div key={t} style={{ display:'flex',gap:8,padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.07)' }}><span style={{ fontSize:14,flexShrink:0 }}>{e}</span><div><p style={{ fontSize:11,fontWeight:900,color:'#fff',marginBottom:2 }}>{t}</p><p style={{ fontSize:10,color:'rgba(255,255,255,0.45)',lineHeight:1.5 }}>{d}</p></div></div>
                      ))}
                    </div>
                  </div>
                </Portal>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── ABA PESQUISA ─────────────────────────────────────────────────── */}
      {aba==='pesquisa' && (<>
        {mostrarInput && (
          <Portal>
            <div onClick={()=>setMostrarInput(false)} style={{ position:'fixed',inset:0,zIndex:99998,background:'transparent' }}>
              <div onClick={e=>e.stopPropagation()} style={{ position:'fixed',top:60,left:280,zIndex:99999,width:400,maxWidth:'96vw',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:16,padding:20,boxShadow:'0 20px 60px rgba(0,0,0,0.4)',animation:'slideDown 0.15s ease' }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}><p style={{ fontSize:13,fontWeight:900,textTransform:'uppercase',display:'flex',alignItems:'center',gap:6,color:'var(--theme-text)' }}><Search style={{ width:16,height:16,color:'var(--theme-accent)' }}/>Importação de Anúncios</p><button onClick={()=>setMostrarInput(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--theme-text)',opacity:0.4 }}><X style={{ width:18,height:18 }}/></button></div>
                <textarea autoFocus value={inputTexto} onChange={e=>setInputTexto(e.target.value)} placeholder={"Cole Links ou IDs do ML aqui (um por linha)...\nEx:\nhttps://www.mercadolivre.com.br/...\nMLB123456789"} style={{ width:'100%',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:'12px 14px',fontSize:12,fontFamily:'monospace',outline:'none',resize:'none',background:'var(--theme-sidebar)',color:'var(--theme-text)',boxSizing:'border-box', marginBottom:12 }} rows={6} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){processarInput();setMostrarInput(false);}}} />
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--theme-sidebar)', padding:'10px 12px', borderRadius:10, border:'1px dashed var(--theme-card-border)', marginBottom:14 }}><div style={{ display:'flex', alignItems:'center', gap:8 }}><FileUp size={16} style={{ color:'var(--theme-accent)' }}/><div><p style={{ fontSize:10, fontWeight:700 }}>Extrair de Arquivo</p><p style={{ fontSize:9, opacity:0.5 }}>Lê e captura IDs automaticamente</p></div></div><input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.csv,.xml,.pdf,.xls,.xlsx,.html" style={{ display:'none' }} /><button onClick={() => fileInputRef.current?.click()} style={{ padding:'4px 10px', fontSize:9, fontWeight:900, textTransform:'uppercase', background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', borderRadius:6, cursor:'pointer', transition:'all 0.2s', ':hover':{background:'var(--theme-sidebar)'} }}>Procurar...</button></div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}><p style={{ fontSize:10,color:'var(--theme-text)',opacity:0.4 }}>Ctrl+Enter para adicionar</p><button onClick={()=>{processarInput();setMostrarInput(false);}} disabled={!inputTexto.trim()} style={{ display:'flex',alignItems:'center',gap:5,padding:'10px 18px',borderRadius:10,background:inputTexto.trim()?'var(--theme-accent)':'var(--theme-sidebar)',color:inputTexto.trim()?'#fff':'var(--theme-text)',opacity:inputTexto.trim()?1:0.4,fontSize:11,fontWeight:900,textTransform:'uppercase',border:'none',cursor:inputTexto.trim()?'pointer':'not-allowed', transition:'all 0.2s' }}><Plus style={{ width:14,height:14 }}/>Adicionar Fila</button></div>
              </div>
            </div>
          </Portal>
        )}

        {itens.length>0 && <ResumoGeral itens={itens}/>}
        {isNewSession && (
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:16,textAlign:'center' }}>
            <div style={{ width:70,height:70,background:'#FFE600',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(0,0,0,0.15)' }}><Search style={{ width:34,height:34,color:'#1e293b' }}/></div>
            <div><h3 style={{ fontSize:16,fontWeight:900,color:'var(--theme-text)',marginBottom:4 }}>Pesquise anúncios do ML</h3><p style={{ fontSize:13,color:'var(--theme-text)',opacity:0.5 }}>Cole links, IDs ou envie arquivos (Excel, TXT) para analisar preços e concorrentes.</p></div>
            <button onClick={()=>setMostrarInput(true)} style={{ ...btnBase,background:'var(--theme-header)',color:'#FFE600',border:'none',padding:'10px 20px',fontSize:12, transition:'all 0.2s' }}><Plus style={{ width:14,height:14 }}/>Adicionar Links ou Arquivos</button>
          </div>
        )}

        {itens.length>0 && (
          <div style={{ display:'flex',gap:12,flex:1,minHeight:0 }}>
            {/* Terminal Flutuante Inteligente */}
            <div style={{ background:'#020617', borderRadius:14, display:'flex', flexDirection:'column', ...terminalStyle }}>
              <div style={{ display:'flex',alignItems:'center',gap:6,padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0 }}>
                <div style={{ display:'flex',gap:4 }}>{['#ef4444','#f59e0b','#10b981'].map(c=><span key={c} style={{ width:9,height:9,borderRadius:'50%',background:c,opacity:0.6 }}/>)}</div>
                <div style={{ display:'flex',alignItems:'center',gap:6,marginLeft:4 }}><AnalyizStar size={16} active={rodando} dark={true}/><p style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.25)',letterSpacing:'0.1em' }}>Terminal Processador</p></div>
                {rodando&&<span style={{ marginLeft:'auto',width:6,height:6,borderRadius:'50%',background:'#3b82f6',animation:'pulse 2s infinite' }}/>}
              </div>
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
            </div>

            {/* Lista resultados */}
            <div style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:8 }}>
              <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:'8px 12px',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                <button onClick={()=>{if(selecionados.size===itensFiltrados.length&&itensFiltrados.length>0) setSelecionados(new Set()); else setSelecionados(new Set(itensFiltrados.map(i=>i.id)));}} style={{ color:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?'#3b82f6':'var(--theme-text)',opacity:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?1:0.3,background:'none',border:'none',cursor:'pointer',padding:0 }}>
                  {selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?<CheckSquare style={{ width:16,height:16,color:'#3b82f6' }}/>:<Square style={{ width:16,height:16 }}/>}
                </button>
                {FILTROS.map(({k,l,ac,cc,bc})=>(<button key={k} onClick={()=>setFiltroStatus(k)} style={{ padding:'6px 10px',borderRadius:8,border:`1px solid ${filtroStatus===k?bc:'var(--theme-card-border)'}`,background:filtroStatus===k?ac:'var(--theme-sidebar)',color:filtroStatus===k?cc:'var(--theme-text)',fontSize:10,fontWeight:900,textTransform:'uppercase',cursor:'pointer',opacity:filtroStatus===k?1:0.6, transition:'all 0.15s' }}>{l}</button>))}
                <div style={{ display:'flex', alignItems:'center', background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:8, padding:'4px 8px', gap:6, marginLeft:'auto' }}>
                  <Calendar size={12} style={{ opacity:0.4 }}/>
                  <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--theme-text)', fontSize:11, outline:'none', cursor:'pointer' }}/>
                  {filtroData && <button onClick={()=>setFiltroData('')} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:0 }}><X size={12}/></button>}
                </div>
                {selecionados.size>0&&(
                  <div style={{ display:'flex',alignItems:'center',gap:6,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'4px 10px' }}>
                    <span style={{ fontSize:10,fontWeight:900,color:'#1d4ed8' }}>{selecionados.size} sel.</span>
                    {[...selecionados].some(id=>itens.find(i=>i.id===id&&i.status==='concluido'))&&(<>
                      <button onClick={async()=>{ const concluidos=itens.filter(i=>selecionados.has(i.id)&&i.status==='concluido'); for(const it of concluidos){try{const res=await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=false`);const hist=await res.json();const entrada=Array.isArray(hist)?hist.find(h=>h.mlbId===it.mlbId):null;if(entrada)await fetch(`${API_BASE_URL}/api/ml/research/historico/${entrada.id}/arquivar`,{method:'PUT'});}catch{}} addLog(`📦 ${concluidos.length} arquivado(s)`,'success');setSelecionados(new Set()); }} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',cursor:'pointer',fontSize:10,fontWeight:900, transition:'all 0.2s' }}><Archive style={{ width:12,height:12 }}/>Arquivar</button>
                      <button onClick={()=>setShowComparador(true)} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:'#7c3aed',color:'#fff',border:'none',cursor:'pointer',fontSize:10,fontWeight:900, transition:'all 0.2s', ':hover':{background:'#6d28d9'} }}><BarChart2 style={{ width:12,height:12 }}/>Comparar</button>
                      <button disabled={gerandoPesquisa} onClick={()=>dispararPesquisaMercado()} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:gerandoPesquisa?'rgba(79,70,229,0.5)':'linear-gradient(90deg,#4f46e5,#9333ea)',color:'#fff',border:'none',cursor:gerandoPesquisa?'not-allowed':'pointer',fontSize:10,fontWeight:900, boxShadow:'0 2px 6px rgba(147, 51, 234, 0.4)', transition:'all 0.2s' }}>{gerandoPesquisa?<Loader2 style={{ width:12,height:12,animation:'spin 1s linear infinite' }}/>:<Sparkles style={{ width:12,height:12 }}/>}Pesquisa IA</button>
                    </>)}
                    <button disabled={rodando} onClick={()=>{ const ids=itens.filter(i=>selecionados.has(i.id)).map(i=>({mlbId:i.mlbId,url:i.url})); if(!ids.length)return; setItens(prev=>prev.map(it=>selecionados.has(it.id)?{...it,status:'pendente',dados:null,erro:null}:it)); setSelecionados(new Set()); executarFila(ids); }} style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:6,background:'#2563eb',color:'#fff',border:'none',cursor:rodando?'not-allowed':'pointer',fontSize:10,fontWeight:900,opacity:rodando?0.5:1, transition:'all 0.2s', ':hover':{background:'#1d4ed8'} }}><RefreshCw style={{ width:12,height:12 }}/>Reprocessar</button>
                    <button onClick={()=>{[...selecionados].forEach(id=>removerItem(id));}} style={{ display:'flex',padding:4,background:'none',border:'none',cursor:'pointer',color:'#ef4444', transition:'all 0.2s', ':hover':{transform:'scale(1.1)'} }}><Trash2 style={{ width:14,height:14 }}/></button>
                  </div>
                )}
              </div>
              <div style={{ flex:1,overflowY:'auto',maxHeight:'calc(76vh - 56px)' }}>
                {itensFiltrados.length===0
                  ?<div style={{ background:'var(--theme-card)',border:'1px dashed var(--theme-card-border)',borderRadius:14,padding:60,display:'flex',flexDirection:'column',alignItems:'center',gap:10 }}><Filter style={{ width:32,height:32,color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:12,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>Nenhum item corresponde ao filtro</p></div>
                  :<div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12 }}>{itensFiltrados.map(item=>(<CardResultado key={item.id} item={item} onRemover={removerItem} selecionado={selecionados.has(item.id)} onSel={toggleSel} onAbrirModal={setModalAberto}/>))}</div>}
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
                {aba==='historico'&&<button onClick={()=>acaoLoteHist('arquivar')} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:10,fontWeight:900,cursor:'pointer', transition:'all 0.2s' }}><Archive style={{ width:12,height:12 }}/>Arquivar Itens</button>}
                {aba==='arquivados'&&<button onClick={()=>{[...selHist].forEach(id=>restaurarHist(id));setSelHist(new Set());}} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#15803d',fontSize:10,fontWeight:900,cursor:'pointer', transition:'all 0.2s' }}><ArchiveRestore style={{ width:12,height:12 }}/>Restaurar Itens</button>}
                <button onClick={()=>acaoLoteHist('excluir')} style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,background:'#fee2e2',border:'1px solid #fca5a5',color:'#dc2626',fontSize:10,fontWeight:900,cursor:'pointer', transition:'all 0.2s' }}><Trash2 style={{ width:12,height:12 }}/>Apagar Banco</button>
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

      {showComparador && <ModalComparador userId={userId} itens={itens.filter(i=>selecionados.has(i.id))} onClose={()=>setShowComparador(false)}/>}
      {modalAberto    && <ModalAnuncio item={modalAberto} onClose={()=>setModalAberto(null)} onDispararPesquisa={dispararPesquisaMercado} />}

      {showPesquisaModal && (
        <ModalPesquisaMercado
          pesquisaIA={pesquisaIA}
          itens={itens.filter(i=>selecionados.has(i.id))}
          logsPesquisa={logsPesquisa}
          gerandoPesquisa={gerandoPesquisa}
          onClose={()=>setShowPesquisaModal(false)}
          onSalvar={salvarPesquisaNoHistorico}
          userId={userId}
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
                  <MenuExportacao onExport={(f) => exportarDadosComplexos(f, [], analiseVista.titulo)} disabled={false} />
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