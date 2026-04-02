// src/pages/MlResearch.jsx 
// Fixes: "Limpar" e "Remover" agora enviam os itens automaticamente para a aba Arquivados no Banco de Dados.
// Exclusão definitiva ocorre apenas na aba Arquivados. Persistência de reinicialização mantida.
// Correção: Inclusão do componente ResumoGeral para evitar ReferenceError.
// Novo: Filtro dinâmico de Páginas da Planilha.
// Novo: Extrator Oculto de Código Fonte (Métricas de Concorrentes ML).

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
  ZoomIn, ZoomOut, Maximize2, PieChart, ArrowDownAZ, ArrowUpZA, ChevronLeft, ChevronRight as ChevronRightIcon
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

// Extrator de Dados Ocultos para página de Métricas do ML
function extrairDadosOcultosFonte(texto) {
  const extraidos = [];
  if (!texto) return extraidos;
  // Regex flexível para capturar os blocos do JSON embutido na página de métricas do ML
  const regex = /"item_id"\s*:\s*"([^"]+)"\s*,\s*"price"\s*:\s*([\d.]+)[^{}]*?"seller_name"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(texto)) !== null) {
    extraidos.push({
      mlbId: extrairMLBId(match[1]),
      preco: parseFloat(match[2]),
      vendedor: match[3]
    });
  }
  return extraidos;
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

function exportarDadosComplexos(formato, targetList, tituloRelatorio = 'Auditoria de Concorrentes ML', relatorioHtml = null) {
  if ((!targetList || !targetList.length) && !relatorioHtml) return alert('Nenhum dado para exportar.');
  
  const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const horaHoje = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '');
  const cleanTitle = tituloRelatorio.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').substring(0,25);
  const nomeArquivo = `Analyiz_${cleanTitle}_${dataHoje}_${horaHoje}`;

  const safeGet = (d, m, key, keyAlt) => {
    if (m && m[key] && m[key] !== '—') return m[key];
    if (d && d[key]) return d[key];
    if (d && keyAlt && d[keyAlt]) return d[keyAlt];
    return '—';
  };

  if (formato === 'xls' || formato === 'csv') {
    let conteudo = '';
    if (formato === 'xls') {
      conteudo = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; } th { background-color: #1e293b; color: #ffffff; font-weight: bold; padding: 6px; border: 1px solid #cbd5e1; font-size: 11px; } td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; font-size: 11px; } .num { mso-number-format: "R$ #,##0.00"; } .sub { background-color: #f1f5f9; } .ia-report { background-color: #f8fafc; padding: 15px; border: 1px solid #e2e8f0; margin-bottom: 15px; text-align: left; }</style></head><body><h2>${tituloRelatorio} - Analyiz</h2><p>Data de exportação: ${dataHoje}</p>`;
      
      if (relatorioHtml) {
        conteudo += `<table><tr><td colspan="14" class="ia-report"><h3 style="color:#8b5cf6; margin-top:0;">Relatório de Inteligência da IA</h3>${relatorioHtml}</td></tr></table><br/>`;
      }

      if (targetList && targetList.length > 0) {
        conteudo += `<table><tr><th>ID (MLB)</th><th>Título do Anúncio</th><th>Página</th><th>Posição</th><th>Preço Atual</th><th>Preço Sem Promo</th><th>% Promo</th><th>Tipo Anúncio</th><th>Frete / Envio</th><th>Vendedor</th><th>Reputação ML</th><th>Vendas</th><th>Parcelamento</th><th>Link</th></tr>`;
        targetList.forEach(i => {
          const d = i.dados || i; 
          const m = i.metaPlanilha || {};
          const refMlb = i.mlbId || d.mlbId || '';
          const refTit = (d.titulo||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
          
          const pPag = m.pagina || '—';
          const pPos = m.posicao || '—';
          const pPrecoSem = safeGet(d, m, 'precoSemPromo', 'precoOriginal');
          const pPromo = safeGet(d, m, 'promo', 'desconto');
          const pTipo = safeGet(d, m, 'tipoAnuncio');
          const pEnvio = m.envio && m.envio !== '—' ? m.envio : (d.envio || (d.freteGratis ? 'Grátis' : 'Pago'));
          const pVendas = m.vendas && m.vendas !== '—' ? m.vendas : (d.vendas || d.vendidos || d.seller?.vendas || 0);
          const pVend = m.vendedor && m.vendedor !== '—' ? m.vendedor : (d.seller?.nome || '—');
          const pRep = d.mercadoLider || d.seller?.reputacao || '—';
          const pParc = d.parcelamento || '—';
          const linkCorreto = gerarLinkAnuncio(refMlb, d.ehCatalogo, i.url);

          conteudo += `<tr class="sub"><td><b>${refMlb}</b></td><td><b>${refTit}</b></td><td>${pPag}</td><td>${pPos}</td><td class="num"><b>${d.preco||0}</b></td><td class="num">${pPrecoSem}</td><td>${pPromo}</td><td>${pTipo}</td><td>${pEnvio}</td><td><b>${pVend}</b></td><td>${pRep}</td><td>${pVendas}</td><td>${pParc}</td><td>${linkCorreto}</td></tr>`;
          
          (d.concorrentes||[]).forEach(c => {
            conteudo += `<tr><td>${refMlb}</td><td>${(c.titulo||refTit).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td><td>—</td><td>—</td><td class="num">${c.preco||0}</td><td class="num">${c.precoOriginal||'—'}</td><td>${c.desconto||'—'}</td><td>${c.tipoAnuncio||'—'}</td><td>${c.envio || (c.freteGratis?'Grátis':'Pago')}</td><td>${c.nome||'—'}</td><td>${c.mercadoLider||'—'}</td><td>${c.vendas || c.vendidos || 0}</td><td>${c.parcelamento||'—'}</td><td>${c.link||gerarLinkAnuncio(c.mlbId||refMlb, d.ehCatalogo, c.link)}</td></tr>`;
          });
        });
        conteudo += `</table>`;
      }
      conteudo += `</body></html>`;
    } else {
      let rows = [];
      if (relatorioHtml) {
        rows.push("=== RELATÓRIO DE INTELIGÊNCIA IA ===");
        rows.push(`"${plainTextFromHtml(relatorioHtml).replace(/"/g, '""')}"`);
        rows.push("");
      }
      if (targetList && targetList.length > 0) {
        rows.push("ID_MLB\tTitulo_Anuncio\tPagina\tPosicao\tPrecoAtual\tPrecoSemPromo\tPromo\tTipoAnuncio\tEnvio\tVendedor\tReputacao\tVendas\tParcelamento\tLink");
        targetList.forEach(i => {
          const d = i.dados || i; 
          const m = i.metaPlanilha || {};
          const refMlb = i.mlbId || d.mlbId || ''; 
          const refTit = `"${(d.titulo||'').replace(/"/g,'""')}"`;
          
          const pPag = m.pagina || '—';
          const pPos = m.posicao || '—';
          const pPrecoSem = safeGet(d, m, 'precoSemPromo', 'precoOriginal');
          const pPromo = safeGet(d, m, 'promo', 'desconto');
          const pTipo = safeGet(d, m, 'tipoAnuncio');
          const pEnvio = m.envio && m.envio !== '—' ? m.envio : (d.envio || (d.freteGratis ? 'Grátis' : 'Pago'));
          const pVendas = m.vendas && m.vendas !== '—' ? m.vendas : (d.vendas || d.vendidos || d.seller?.vendas || 0);
          const pVend = `"${(m.vendedor && m.vendedor !== '—' ? m.vendedor : (d.seller?.nome || '—')).replace(/"/g,'""')}"`;
          const pRep = `"${d.mercadoLider || d.seller?.reputacao || '—'}"`;
          const pParc = `"${d.parcelamento || '—'}"`;
          const linkCorreto = gerarLinkAnuncio(refMlb, d.ehCatalogo, i.url);

          rows.push(`${refMlb}\t${refTit}\t${pPag}\t${pPos}\t${d.preco||0}\t${pPrecoSem}\t${pPromo}\t${pTipo}\t${pEnvio}\t${pVend}\t${pRep}\t${pVendas}\t${pParc}\t${linkCorreto}`);
          
          (d.concorrentes||[]).forEach(c => {
            rows.push(`${refMlb}\t"${(c.titulo||'').replace(/"/g,'""')}"\t—\t—\t${c.preco||0}\t${c.precoOriginal||'—'}\t${c.desconto||'—'}\t${c.tipoAnuncio||'—'}\t${c.envio || (c.freteGratis?'Grátis':'Pago')}\t"${(c.nome||'—').replace(/"/g,'""')}"\t"${c.mercadoLider||'—'}"\t${c.vendas || c.vendidos || 0}\t"${c.parcelamento||'—'}"\t${c.link||gerarLinkAnuncio(c.mlbId||refMlb, d.ehCatalogo, c.link)}`);
          });
        });
      }
      conteudo = rows.join('\n');
    }
    const blob = new Blob([conteudo], { type: formato === 'xls' ? 'application/vnd.ms-excel;charset=utf-8;' : 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${nomeArquivo}.${formato}`; link.click();
  } else if (formato === 'pdf') {
    let htmlPrint = `<html><head><title>${nomeArquivo}</title><style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap'); body { font-family: 'Roboto', sans-serif; padding: 15px; color: #1e293b; background: #fff; line-height: 1.3; } .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #8b5cf6; padding-bottom: 8px; margin-bottom: 15px; } h1 { margin: 0; color: #0f172a; font-weight: 900; font-size: 20px; } .brand { color: #8b5cf6; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; } .date { color: #64748b; font-size: 9px; } .ia-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #8b5cf6; padding: 12px; border-radius: 6px; margin-bottom: 15px; } .ia-box h2 { margin-top: 0; margin-bottom: 8px; color: #8b5cf6; font-size: 13px; } .ia-box div { font-size: 11px; line-height: 1.4; } table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9px; margin-bottom: 20px;} th { background: #f8fafc; color: #475569; text-transform: uppercase; font-size: 8px; font-weight: 900; text-align: left; padding: 6px; border-bottom: 2px solid #e2e8f0; } td { padding: 6px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; } p { margin: 0 0 6px 0; } .preco { font-weight: 900; color: #10b981; } .vendedor { font-weight: 700; color: #3b82f6; } .title-item { background: #f1f5f9; font-weight: bold; font-size: 11px; padding: 8px; border-left: 4px solid #3b82f6; margin-top:15px;} .meta-badge { display:inline-block; background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:4px; font-size:8px; margin-left:8px; }</style></head><body><div class="header"><div><div class="brand">✨ Analyiz Intelligence</div><h1>${tituloRelatorio}</h1></div><div class="date">Gerado em: ${dataHoje} às ${new Date().toLocaleTimeString('pt-BR')}</div></div>`;
    
    if (relatorioHtml) {
      const formatado = relatorioHtml.replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br>');
      htmlPrint += `<div class="ia-box"><h2>Relatório de Inteligência IA</h2><div>${formatado}</div></div>`;
    }

    if (targetList && targetList.length > 0) {
      targetList.forEach(i => {
        const d = i.dados || i; 
        const m = i.metaPlanilha || {};
        const refMlb = i.mlbId || d.mlbId || '';
        
        let metaTags = '';
        if (m.pagina && m.pagina !== '—') metaTags += `<span class="meta-badge">Pág: ${m.pagina}</span>`;
        if (m.posicao && m.posicao !== '—') metaTags += `<span class="meta-badge">Pos: ${m.posicao}</span>`;

        htmlPrint += `<div class="title-item">[${refMlb}] ${d.titulo||'Sem Título'} ${metaTags}</div><table><thead><tr><th>Vendedor / Concorrente</th><th>Preço Atual</th><th>S/ Promo</th><th>% Promo</th><th>Envio</th><th>Vendas</th><th>Status ML</th><th>Parcelamento</th></tr></thead><tbody>`;
        
        const pPrecoSem = safeGet(d, m, 'precoSemPromo', 'precoOriginal');
        const pPromo = safeGet(d, m, 'promo', 'desconto');
        const pEnvio = m.envio && m.envio !== '—' ? m.envio : (d.envio || (d.freteGratis ? 'Grátis' : 'Pago'));
        const pVendas = m.vendas && m.vendas !== '—' ? m.vendas : (d.vendas || d.vendidos || d.seller?.vendas || 0);
        const pVend = m.vendedor && m.vendedor !== '—' ? m.vendedor : (d.seller?.nome || '—');
        const pRep = d.mercadoLider || d.seller?.reputacao || '—';
        const pParc = d.parcelamento || '—';

        if (pVend) htmlPrint += `<tr><td class="vendedor">${pVend} (Analisado)</td><td class="preco">${fmt(d.preco)}</td><td>${pPrecoSem}</td><td>${pPromo}</td><td>${pEnvio}</td><td>${pVendas}</td><td>${pRep}</td><td>${pParc}</td></tr>`;
        
        (d.concorrentes||[]).forEach(c => {
          htmlPrint += `<tr><td class="vendedor">${c.nome||'—'}</td><td class="preco">${fmt(c.preco)}</td><td>${c.precoOriginal?fmt(c.precoOriginal):'—'}</td><td>${c.desconto||'—'}</td><td>${c.envio || (c.freteGratis?'Grátis':'Pago')}</td><td>${c.vendas || c.vendidos || 0}</td><td>${c.mercadoLider||'—'}</td><td>${c.parcelamento||'—'}</td></tr>`;
        });
        htmlPrint += `</tbody></table>`;
      });
    }
    
    htmlPrint += `<p style="margin-top: 20px; text-align: center; font-size: 9px; color: #94a3b8;">Tecnologia gerada por Inteligência Artificial Analyiz © ${new Date().getFullYear()}</p></body></html>`;
    const printWindow = window.open('', '_blank'); printWindow.document.write(htmlPrint); printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
  } else if (formato === 'txt') {
    let txt = `=== ${tituloRelatorio.toUpperCase()} ===\nData: ${dataHoje}\n\n`;
    if (relatorioHtml) txt += `--- RELATÓRIO DA IA ---\n${plainTextFromHtml(relatorioHtml)}\n\n`;
    if (targetList && targetList.length > 0) {
      targetList.forEach(i => {
        const d = i.dados || i; 
        const m = i.metaPlanilha || {};
        const refMlb = i.mlbId || d.mlbId || '';
        
        const pPag = m.pagina || '—';
        const pPos = m.posicao || '—';
        const pVend = m.vendedor && m.vendedor !== '—' ? m.vendedor : (d.seller?.nome || 'Vendedor Analisado');
        const linkCorreto = gerarLinkAnuncio(refMlb, d.ehCatalogo, i.url);

        txt += `>> ITEM: [${refMlb}] ${d.titulo}\nPreço Atual: ${fmt(d.preco)} | Vendedor: ${pVend} | Pág: ${pPag} | Pos: ${pPos}\nLink: ${linkCorreto}\nCONCORRENTES MAPEDADOS:\n`;
        (d.concorrentes||[]).forEach(c => { txt += `  - ${c.nome}: ${fmt(c.preco)} | Frete/Envio: ${c.envio||(c.freteGratis?'Grátis':'Pago')} | Vendidos: ${c.vendas||c.vendidos||0} | Reputação: ${c.mercadoLider||'—'}\n`; });
        txt += `----------------------------------------\n\n`;
      });
    }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${nomeArquivo}.txt`; link.click();
  } else if (formato === 'xml') {
    let xml = `<?xml version="1.0" encoding="UTF-8"?><analyiz_relatorio data="${dataHoje}">`;
    if (relatorioHtml) xml += `<relatorio_ia><![CDATA[${plainTextFromHtml(relatorioHtml)}]]></relatorio_ia>`;
    if (targetList && targetList.length > 0) {
      xml += `<anuncios>`;
      targetList.forEach(i => {
        const d = i.dados || i; const refMlb = i.mlbId || d.mlbId || '';
        xml += `<anuncio><id>${refMlb}</id><titulo><![CDATA[${d.titulo}]]></titulo><preco>${d.preco}</preco><concorrentes>`;
        (d.concorrentes||[]).forEach(c => { xml += `<concorrente><nome><![CDATA[${c.nome}]]></nome><preco>${c.preco}</preco><vendidos>${c.vendas||c.vendidos||0}</vendidos></concorrente>`; });
        xml += `</concorrentes></anuncio>`;
      });
      xml += `</anuncios>`;
    }
    xml += `</analyiz_relatorio>`;
    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${nomeArquivo}.xml`; link.click();
  }
}

function MenuExportacao({ onExport, disabled, label="Exportar" }) {
  const [aberto, setAberto] = useState(false);
  const btnRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

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
          <div onClick={e=>e.stopPropagation()} style={{ position:'fixed', top: coords.top, right: coords.right, zIndex:9999991, background:'var(--theme-card)', border:'1px solid var(--theme-card-border)', borderRadius:12, padding:8, display:'flex', flexDirection:'column', gap:4, boxShadow:'0 10px 40px rgba(0,0,0,0.5)', minWidth:160, animation:'slideDown 0.15s ease' }}>
            <p style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', opacity:0.4, padding:'4px 8px' }}>Baixar relatório</p>
            {[{ id:'pdf', label:'PDF', ic:Printer, c:'#ef4444' }, { id:'xls', label:'Excel (.xls)', ic:FileSpreadsheet, c:'#10b981' }, { id:'txt', label:'Texto (.txt)', ic:FileText, c:'#8b5cf6' }, { id:'xml', label:'XML', ic:FileJson, c:'#f59e0b' }].map(o => (
              <button key={o.id} onClick={(e)=>{ e.stopPropagation(); onExport(o.id); setAberto(false); }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'transparent', border:'none', borderRadius:6, cursor:'pointer', color:'var(--theme-text)', fontSize:11, fontWeight:700, textAlign:'left', width:'100%', transition:'all 0.2s', ':hover':{background:'var(--theme-sidebar)'} }}>
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
          <img key={idx} src={f.url || f} alt="Detalhe do anúncio" onClick={() => setFotoMascara(f.url || f)} style={{ width:48, height:48, objectFit:'cover', borderRadius:8, cursor:'pointer', border:'1px solid var(--theme-card-border)', flexShrink:0, transition:'transform 0.15s', ':hover':{transform:'scale(1.05)'} }} />
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

function ModalRaioXMercado({ itens, selecionados, onClose }) {
  const [filtro, setFiltro] = useState('todos');

  const itensAlvo = filtro === 'todos' 
    ? itens.filter(i => i.status === 'concluido')
    : itens.filter(i => selecionados.has(i.id) && i.status === 'concluido');

  const stats = obterStatsMercado(itensAlvo);

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999990,background:'rgba(15,23,42,0.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width: 800, maxWidth: '96vw', height: '80vh', maxHeight: '80vh', background: 'var(--theme-card)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
          
          <div style={{ padding:'20px 24px', background:'linear-gradient(135deg, var(--theme-header), #0f172a)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, position:'relative' }}>
             <div className="ia-header-glow" style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg, transparent, #3b82f6, #10b981, transparent)', animation:'slideGrad 2s linear infinite' }} />
             <div style={{ display:'flex', alignItems:'center', gap:14, zIndex:1 }}>
               <div style={{ background:'rgba(59, 130, 246, 0.2)', padding:10, borderRadius:'50%', border:'1px solid rgba(59, 130, 246, 0.3)' }}><PieChart size={24} style={{ color:'#93c5fd' }}/></div>
               <div>
                 <p style={{ fontSize:18, fontWeight:900, color:'#fff', lineHeight:1.2 }}>Raio-X de Vendedores</p>
                 <p style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:4 }}>Análise de participação e volume no mercado atual</p>
               </div>
             </div>
             <button onClick={onClose} style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', color:'rgba(255,255,255,0.6)', padding:8, borderRadius:'50%', transition:'all 0.2s', ':hover':{background:'rgba(255,255,255,0.1)', color:'#fff'} }}><X style={{ width:18, height:18 }}/></button>
          </div>

          <div style={{ display:'flex', borderBottom:'1px solid var(--theme-card-border)', padding:'0 18px', flexShrink:0, background:'var(--theme-sidebar)', gap:8 }}>
             <button onClick={() => setFiltro('todos')} style={{ padding:'12px 16px', fontSize:11, fontWeight:900, textTransform:'uppercase', border:'none', borderBottom:`3px solid ${filtro==='todos'?'#3b82f6':'transparent'}`, color: filtro==='todos' ? '#3b82f6':'var(--theme-text)', background:'none', cursor:'pointer', opacity: filtro==='todos' ? 1:0.5, transition:'all 0.2s' }}>Todos os Anúncios ({itens.filter(i=>i.status==='concluido').length})</button>
             <button onClick={() => setFiltro('selecionados')} style={{ padding:'12px 16px', fontSize:11, fontWeight:900, textTransform:'uppercase', border:'none', borderBottom:`3px solid ${filtro==='selecionados'?'#3b82f6':'transparent'}`, color: filtro==='selecionados' ? '#3b82f6':'var(--theme-text)', background:'none', cursor:'pointer', opacity: filtro==='selecionados' ? 1:0.5, transition:'all 0.2s' }}>Somente Selecionados ({selecionados.size})</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:0, borderBottom:'1px solid var(--theme-card-border)', background:'rgba(0,0,0,0.05)', flexShrink:0 }}>
             <div style={{ padding:'16px', textAlign:'center', borderRight:'1px solid var(--theme-card-border)' }}>
               <p style={{ fontSize:24, fontWeight:900, color:'#8b5cf6' }}>{stats.totalVendedores}</p>
               <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', opacity:0.5, marginTop:4 }}>Vendedores Únicos</p>
             </div>
             <div style={{ padding:'16px', textAlign:'center', borderRight:'1px solid var(--theme-card-border)' }}>
               <p style={{ fontSize:24, fontWeight:900, color:'#3b82f6' }}>{stats.totalAnuncios}</p>
               <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', opacity:0.5, marginTop:4 }}>Anúncios Processados</p>
             </div>
             <div style={{ padding:'16px', textAlign:'center' }}>
               <p style={{ fontSize:24, fontWeight:900, color:'#10b981' }}>{stats.totalVendas > 0 ? stats.totalVendas.toLocaleString('pt-BR') : '0'}</p>
               <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', opacity:0.5, marginTop:4 }}>Volume Mapeado</p>
             </div>
          </div>

          <div style={{ flex:1, overflowY:'auto' }} className="ia-scroll">
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead style={{ background:'var(--theme-sidebar)', position:'sticky', top:0, zIndex:10 }}>
                <tr>
                  <th style={{ padding:'12px 16px', fontSize:10, fontWeight:900, textTransform:'uppercase', color:'var(--theme-text)', opacity:0.6, textAlign:'left', borderBottom:'1px solid var(--theme-card-border)', width:60 }}>Rank</th>
                  <th style={{ padding:'12px 16px', fontSize:10, fontWeight:900, textTransform:'uppercase', color:'var(--theme-text)', opacity:0.6, textAlign:'left', borderBottom:'1px solid var(--theme-card-border)' }}>Vendedor</th>
                  <th style={{ padding:'12px 16px', fontSize:10, fontWeight:900, textTransform:'uppercase', color:'var(--theme-text)', opacity:0.6, textAlign:'center', borderBottom:'1px solid var(--theme-card-border)', width:120 }}>Presença</th>
                  <th style={{ padding:'12px 16px', fontSize:10, fontWeight:900, textTransform:'uppercase', color:'var(--theme-text)', opacity:0.6, textAlign:'right', borderBottom:'1px solid var(--theme-card-border)', width:140 }}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {stats.sellersLista.map((seller, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--theme-card-border)', background: i === 0 ? 'rgba(16, 185, 129, 0.05)' : 'transparent', transition:'background 0.2s', ':hover':{background:'rgba(255,255,255,0.02)'} }}>
                    <td style={{ padding:'14px 16px', textAlign:'center' }}>
                      {i===0 ? <Medal style={{ width:20, height:20, color:'#f59e0b', margin:'0 auto' }}/> : i===1 ? <Award style={{ width:20, height:20, color:'#94a3b8', margin:'0 auto' }}/> : <span style={{ fontSize:13, fontWeight:900, opacity:0.4 }}>{i+1}</span>}
                    </td>
                    <td style={{ padding:'14px 16px' }}>
                      <p style={{ fontSize:14, fontWeight:900, color: i===0 ? '#10b981' : 'var(--theme-text)' }}>{seller.nome}</p>
                      <a href={gerarLinkVendedor(seller.nome)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:9, color:'#8b5cf6', textDecoration:'none', marginTop:4, fontWeight:700 }}><ExternalLink size={10}/> Ver Perfil</a>
                    </td>
                    <td style={{ padding:'14px 16px', textAlign:'center' }}>
                      <span style={{ fontSize:12, fontWeight:900, background:'var(--theme-sidebar)', padding:'4px 10px', borderRadius:20, border:'1px solid var(--theme-card-border)' }}>{seller.adsCount}</span>
                    </td>
                    <td style={{ padding:'14px 16px', textAlign:'right' }}>
                       <span style={{ fontSize:15, fontWeight:900, color: seller.totalSales > 0 ? '#10b981' : 'var(--theme-text)' }}>
                         {seller.totalSales > 0 ? seller.totalSales.toLocaleString('pt-BR') : '—'}
                       </span>
                       {seller.totalSales > 0 && <span style={{ display:'block', fontSize:9, opacity:0.4, marginTop:2, textTransform:'uppercase', fontWeight:700 }}>Vendas</span>}
                    </td>
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

function ModalAnuncio({ item, onClose, onDispararPesquisa }) {
  const [tab, setTab] = useState('vendedores');
  if (!item) return null;
  const d    = item.dados;
  const m    = item.metaPlanilha || {};
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const conc = d?.concorrentes || [];
  
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
  const linkRealDoAnuncio = gerarLinkAnuncio(item.mlbId, ehCatalogo, item.url);
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
                  {m.pagina && m.pagina !== '—' && <span style={{ fontSize:9,fontWeight:900,color:'#c084fc',background:'rgba(192,132,252,0.15)',border:'1px solid rgba(192,132,252,0.3)',padding:'3px 8px',borderRadius:6 }}>Pág {m.pagina}</span>}
                  {m.posicao && m.posicao !== '—' && <span style={{ fontSize:9,fontWeight:900,color:'#c084fc',background:'rgba(192,132,252,0.15)',border:'1px solid rgba(192,132,252,0.3)',padding:'3px 8px',borderRadius:6 }}>Pos {m.posicao}</span>}
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
                      <p style={{ fontSize:18,fontWeight:900,color:'var(--theme-text)' }}>{m.vendedor && m.vendedor !== '—' ? m.vendedor : d.seller.nome}</p>
                      <a href={gerarLinkVendedor(m.vendedor && m.vendedor !== '—' ? m.vendedor : d.seller.nome)} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, color:'#6366f1', textDecoration:'none', marginTop:4, fontWeight:700 }}><ExternalLink size={10}/> Ver perfil da Loja</a>
                      {(d.mercadoLider || d.seller.reputacao) && <p style={{ fontSize:11,fontWeight:900,color:'#f59e0b', marginTop:6 }}>★ {d.mercadoLider || d.seller.reputacao}</p>}
                    </div>
                    <div style={{ textAlign:'right', paddingRight:16, borderRight:'1px solid var(--theme-card-border)' }}>
                      <p style={{ fontSize:22,fontWeight:900,color:'#6366f1' }}>{m.vendas && m.vendas !== '—' ? m.vendas : (d.vendas || d.vendidos || d.seller.vendas || 0)}</p>
                      <p style={{ fontSize:10,opacity:0.4 }}>Vendas</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:26,fontWeight:900,color:'#10b981' }}>{fmt(d.preco)}</p>
                      {d.parcelamento && <p style={{ fontSize:11, opacity:0.6, marginTop:2 }}>{d.parcelamento}</p>}
                      <p style={{ fontSize:11,color:'#10b981',fontWeight:900, marginTop:4 }}>{m.envio && m.envio !== '—' ? m.envio : (d.envio || (d.freteGratis ? '✓ Frete Grátis' : 'Frete Pago'))}</p>
                    </div>
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
                              {c.mercadoLider && <span style={{ marginLeft:8, fontSize:9, fontWeight:900, color:'#f59e0b' }}>★ {c.mercadoLider}</span>}
                              {c.titulo&&c.nome&&c.nome!==c.titulo&&<p style={{ fontSize:11,opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', marginTop:4 }}>{c.titulo}</p>}
                              <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:6,flexWrap:'wrap' }}>
                                {c.tipoAnuncio&&<span style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',padding:'2px 6px',borderRadius:4,opacity:0.8 }}>{c.tipoAnuncio}</span>}
                                {c.envio ? <span style={{ fontSize:10,fontWeight:900,color:'#10b981' }}>{c.envio}</span> : (c.freteGratis&&<span style={{ fontSize:10,fontWeight:700,color:'#10b981' }}>✓ Frete grátis</span>)}
                                {(c.vendas!=null || c.vendidos!=null)&&<span style={{ fontSize:10,color:'#f59e0b',fontWeight:900, background:'rgba(245, 158, 11, 0.1)', padding:'2px 6px', borderRadius:4 }}>{c.vendas || c.vendidos} vendidos</span>}
                              </div>
                            </div>
                            <div style={{ textAlign:'right',flexShrink:0,minWidth:110 }}>
                              {c.precoOriginal&&c.precoOriginal>c.preco&&<p style={{ fontSize:11,textDecoration:'line-through',opacity:0.4 }}>{fmt(c.precoOriginal)}</p>}
                              <p style={{ fontSize:20,fontWeight:900,color:eMin?'#059669':abaixo?'#ef4444':acima?'#10b981':'var(--theme-text)', lineHeight:1 }}>{fmt(c.preco)}</p>
                              {c.parcelamento && <p style={{ fontSize:9, opacity:0.5, marginTop:2 }}>{c.parcelamento}</p>}
                              {c.desconto&&<span style={{ display:'inline-block', fontSize:10,fontWeight:900,color:'#059669',background:'#dcfce7',border:'1px solid #86efac',padding:'2px 6px',borderRadius:20, marginTop:4 }}>{c.desconto}</span>}
                              {c.link&&<a href={c.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:8,padding:'5px 12px',borderRadius:8,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:10,fontWeight:900,textDecoration:'none', transition:'background 0.2s', ':hover':{background:'var(--theme-card)'} }}><ExternalLink style={{ width:12,height:12 }}/>Ver Anúncio</a>}
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
              <div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:20 }}>
                  {[{title:'Dados do Anúncio',rows:[['ID Origem',item.mlbId],['Página Ref.',m.pagina||'—'],['Posição Ref.',m.posicao||'—'],['Catálogo',d?.ehCatalogo?'Sim':'Não'],['Status',d?.status||'—'],['Estoque',d?.estoque!=null?`${d.estoque} un`:'—'],['Avaliação',d?.avaliacoes?`${d.avaliacoes} ★`:'—']]},{title:'Frete & Mais',rows:[['Envio / Frete',d?.envio || (d?.freteGratis?'✅ Grátis':(d?.frete||'Pago'))],['Parcelamento',d?.parcelamento||'—'],['Fonte da Análise',d?.fonte||'—'],['Data da Análise',fmtDate(d?.analisadoEm)]]}].map(({title,rows})=>(
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
                {d?.pictures && d.pictures.length > 0 && (
                  <div style={{ marginTop:20, background:'var(--theme-sidebar)', padding:16, borderRadius:12, border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'#6366f1' }}>Galeria de Imagens</p>
                    <GaleriaFotos fotos={d.pictures} />
                  </div>
                )}
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

function CardResultado({ item, onRemover, selecionado, onSel, onAbrirModal }) {
  const cfg=STATUS_CFG[item.status]||STATUS_CFG.pendente;
  const d=item.dados;
  const m=item.metaPlanilha || {};
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
  const linkUrl = gerarLinkAnuncio(item.mlbId, ehCatalogo, item.url);
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
              {m.pagina && m.pagina !== '—' && (
                <span style={{ fontSize:9, fontWeight:900, color:'#c084fc', background:'rgba(192,132,252,0.15)', padding:'2px 6px', borderRadius:4 }}>
                   Pág {m.pagina} | Pos {m.posicao}
                </span>
              )}
            </div>
            <p style={{ fontSize:13,fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', margin:0 }}>
              {d?.titulo||urlShort(linkUrl)}
            </p>
            {m.vendedor && m.vendedor !== '—' && (
               <p style={{ fontSize:11, color:'#8b5cf6', fontWeight:900, marginTop:2 }}>👤 {m.vendedor}</p>
            )}
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
            <button onClick={()=>onRemover(item.id)} className="ia-tip" data-tip="Remover e Arquivar" style={{ padding:6,borderRadius:8,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:14,height:14 }}/></button>
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
        {item.arquivado 
          ? <button onClick={()=>onExcluirDef(item.id)} className="ia-tip" data-tip="Excluir Definitivo" style={{ padding:5,borderRadius:7,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><XCircle style={{ width:11,height:11 }}/></button>
          : <button onClick={()=>onExcluir(item.id)} className="ia-tip" data-tip="Excluir" style={{ padding:5,borderRadius:7,background:'#fef3c7',border:'1px solid #fde68a',color:'#b45309',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:11,height:11 }}/></button>
        }
      </div>
    </div>
  );
}

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