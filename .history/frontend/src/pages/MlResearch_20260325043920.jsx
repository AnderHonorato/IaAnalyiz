// src/pages/MlResearch.jsx — v9
// Melhorias:
//  1. Modal com tamanho FIXO — sem salto ao mudar de aba (height fixo no container)
//  2. Perguntas integradas na aba Relatório — sem reenviar o relatório inteiro
//  3. Campo de pergunta segue padrão visual do ia-input-box do chat
//  4. Terminal reutiliza estilo #020617 do site (igual ao já existente)
//  5. Texto compactado com tópicos colapsáveis (accordion)
//  6. Aba Gráficos compacta, sem repetir conteúdo

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
function fmt(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
}
function fmtDate(val) {
  if (!val) return '—';
  try { const d=new Date(val); return isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch { return '—'; }
}
function urlShort(url, max=44) {
  try { const u=new URL(url); const p=(u.pathname.split('/').filter(Boolean)[0]||'').substring(0,max); return `${u.hostname}/${p}${p.length>=max?'…':''}`; }
  catch { return url.length>max?url.substring(0,max)+'…':url; }
}

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
              <text x={marginLeft - 6} y={y + barH / 2 + 4} textAnchor="end"
                fontSize={9} fill="currentColor" opacity={0.6} style={{ fontFamily: 'monospace' }}>
                {(d.label || '').substring(0, 10)}
              </text>
              <rect x={marginLeft} y={y} width={Math.max(w, 2)} height={barH} rx={4} fill={cor} opacity={0.85} />
              <text x={marginLeft + w + 6} y={y + barH / 2 + 4} fontSize={10} fill="currentColor" fontWeight="bold">
                {d.rotulo || fmt(d.valor)}
              </text>
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
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'var(--theme-sidebar)', border:'none', cursor:'pointer', color:'var(--theme-text)', textAlign:'left' }}
      >
        {icon && <span style={{ fontSize:13 }}>{icon}</span>}
        <span style={{ flex:1, fontSize:12, fontWeight:700 }}>{titulo}</span>
        <ChevronDown size={13} style={{ opacity:0.4, transition:'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}/>
      </button>
      {open && (
        <div style={{ padding:'10px 12px', fontSize:12, lineHeight:1.7, color:'var(--theme-text)', background:'var(--theme-card)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Parser do HTML do relatório em tópicos colapsáveis ───────────────────────
function RelatorioTopicos({ html }) {
  if (!html) return null;

  // Tenta quebrar o conteúdo em seções por <b>...</b> ou por <br><br>
  // Estratégia: detectar padrões de título comuns no relatório da IA
  const secoes = [];

  // Substitui <br> por newlines para facilitar o split
  const texto = html.replace(/<br\s*\/?>/gi, '\n');

  // Divide por linha que começa com <b>...</b> (indicador de seção)
  const partes = texto.split(/(?=\n<b>|^<b>)/gm).filter(Boolean);

  if (partes.length > 1) {
    partes.forEach((parte, i) => {
      const tituloMatch = parte.match(/^[\n]*<b>([^<]+)<\/b>/);
      if (tituloMatch) {
        const titulo = tituloMatch[1].trim();
        const corpo  = parte.replace(/^[\n]*<b>[^<]+<\/b>/, '').trim();
        secoes.push({ titulo, html: corpo.replace(/\n/g, '<br>'), open: i === 0 });
      } else {
        secoes.push({ titulo: null, html: parte.replace(/\n/g, '<br>'), open: true });
      }
    });
  }

  // Ícones temáticos automáticos
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
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
        {secoes.map((s, i) =>
          s.titulo ? (
            <Topico key={i} titulo={s.titulo} icon={emojiParaTitulo(s.titulo)} defaultOpen={i === 0}>
              <div dangerouslySetInnerHTML={{ __html: s.html }}/>
            </Topico>
          ) : (
            <div key={i} style={{ fontSize:12, lineHeight:1.7, padding:'4px 0', color:'var(--theme-text)' }}
              dangerouslySetInnerHTML={{ __html: s.html.replace(/\n/g,'<br>') }}/>
          )
        )}
      </div>
    );
  }

  // fallback: render direto
  return <div style={{ fontSize:12, lineHeight:1.7 }} dangerouslySetInnerHTML={{ __html: html }}/>;
}

// ── Modal Detalhes ────────────────────────────────────────────────────────────
function ModalAnuncio({ item, onClose }) {
  const [tab, setTab] = useState('vendedores');
  if (!item) return null;
  const d    = item.dados;
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const conc = d?.concorrentes || [];
  const linkUrl = d?.link || (item.url?.startsWith('http') ? item.url : `https://www.mercadolivre.com.br/p/${item.mlbId}`);
  const menorPreco = conc.length ? Math.min(...conc.map(c=>c.preco).filter(v=>v>0)) : null;
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products';
  const tabs = [
    { k:'vendedores', l: ehCatalogo ? `Opções (${conc.length})` : `Concorrentes (${conc.length})` },
    { k:'info',       l:'Info' },
    { k:'ficha',      l:`Ficha (${(d?.atributos||[]).length})` },
  ];
  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.82)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:860,maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',borderRadius:20,boxShadow:'0 30px 80px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <div style={{ background:'var(--theme-header)',padding:'16px 20px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'flex-start',gap:12,minWidth:0 }}>
              {d?.thumbnail && <img src={d.thumbnail} alt="" style={{ width:52,height:52,borderRadius:10,objectFit:'cover',border:'1px solid rgba(255,255,255,0.2)',flexShrink:0 }} />}
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:6 }}>
                  <span style={{ display:'inline-flex',alignItems:'center',gap:4,fontSize:9,fontWeight:900,textTransform:'uppercase',padding:'2px 8px',borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}` }}>
                    <cfg.Icon style={{ width:10,height:10 }}/>{cfg.label}
                  </span>
                  <span style={{ fontSize:9,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.1)',padding:'2px 6px',borderRadius:4 }}>{item.mlbId}</span>
                  {ehCatalogo && <span style={{ fontSize:8,fontWeight:900,textTransform:'uppercase',color:'#93c5fd',background:'rgba(59,130,246,0.2)',border:'1px solid rgba(147,197,253,0.3)',padding:'2px 6px',borderRadius:4 }}>CATÁLOGO</span>}
                </div>
                <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:15,fontWeight:900,color:'#fff',display:'block',textDecoration:'none',marginBottom:4,lineHeight:1.3 }}>
                  {d?.titulo || urlShort(item.url || linkUrl)}
                </a>
              </div>
            </div>
            <button onClick={onClose} style={{ color:'rgba(255,255,255,0.4)',background:'none',border:'none',cursor:'pointer',flexShrink:0 }}><X style={{ width:20,height:20 }} /></button>
          </div>
          {d && (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid var(--theme-card-border)',flexShrink:0 }}>
              {[{l:'Preço Ref.',v:fmt(d.preco),c:'#10b981'},{l:'Menor preço',v:fmt(d.precoMin??menorPreco??d.preco),c:'#3b82f6'},{l:'Preço médio',v:fmt(d.precoMedio),c:'#f59e0b'},{l:'Vendedores',v:d.totalVendedores||(d.concorrentes?.length||0)+1,c:'#8b5cf6'}].map(({l,v,c},i)=>(
                <div key={l} style={{ display:'flex',flexDirection:'column',padding:'12px 16px',borderRight:i<3?'1px solid var(--theme-card-border)':'none' }}>
                  <span style={{ fontSize:18,fontWeight:900,color:c,lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:3 }}>{l}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex',borderBottom:'1px solid var(--theme-card-border)',padding:'0 16px',flexShrink:0,background:'var(--theme-sidebar)' }}>
            {tabs.map(({k,l})=>(
              <button key={k} onClick={()=>setTab(k)} style={{ padding:'10px 14px',fontSize:11,fontWeight:900,textTransform:'uppercase',borderBottom:`2px solid ${tab===k?'var(--theme-accent)':'transparent'}`,color:tab===k?'var(--theme-accent)':'var(--theme-text)',background:'none',border:'none',cursor:'pointer',opacity:tab===k?1:0.5,whiteSpace:'nowrap' }}>{l}</button>
            ))}
          </div>
          <div style={{ flex:1,overflowY:'auto',padding:16 }}>
            {tab==='vendedores' && (
              <>
                {d?.seller && (
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:12,padding:'12px 16px',border:'1px solid var(--theme-card-border)',marginBottom:12,display:'flex',alignItems:'center',gap:12 }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:10,fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:4,display:'flex',alignItems:'center',gap:4 }}><Users style={{ width:12,height:12 }}/>Vendedor principal</p>
                      <p style={{ fontSize:16,fontWeight:900,color:'var(--theme-text)' }}>{d.seller.nome}</p>
                      {d.seller.reputacao && <p style={{ fontSize:11,opacity:0.5,textTransform:'capitalize',marginTop:2 }}>{d.seller.reputacao}</p>}
                    </div>
                    {d.seller.vendas!=null && <div style={{ textAlign:'right' }}><p style={{ fontSize:20,fontWeight:900,color:'#6366f1' }}>{(d.seller.vendas||0).toLocaleString('pt-BR')}</p><p style={{ fontSize:10,opacity:0.4 }}>vendas</p></div>}
                    <div style={{ textAlign:'right' }}><p style={{ fontSize:22,fontWeight:900,color:'#10b981' }}>{fmt(d.preco)}</p>{d.freteGratis&&<p style={{ fontSize:10,color:'#10b981',fontWeight:700 }}>✓ Frete grátis</p>}</div>
                  </div>
                )}
                {conc.length>0 ? (
                  <>
                    <p style={{ fontSize:10,fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:8 }}>{ehCatalogo?'Outras opções de compra':'Concorrentes'}</p>
                    <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                      {conc.map((c,i)=>{
                        const abaixo=d?.preco&&c.preco<d.preco;const acima=d?.preco&&c.preco>d.preco;const eMin=c.preco===menorPreco&&i===0;
                        return (
                          <div key={i} style={{ background:eMin?'#f0fdf4':abaixo?'#fef2f2':'var(--theme-sidebar)',border:`1px solid ${eMin?'#86efac':abaixo?'#fca5a5':'var(--theme-card-border)'}`,borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10 }}>
                            <div style={{ width:28,textAlign:'center',flexShrink:0 }}>{i===0?<Medal style={{ width:16,height:16,color:'#f59e0b',margin:'0 auto' }}/>:i===1?<Award style={{ width:16,height:16,color:'#94a3b8',margin:'0 auto' }}/>:<span style={{ fontSize:12,fontWeight:900,opacity:0.4 }}>{i+1}</span>}</div>
                            {c.thumbnail&&<img src={c.thumbnail} alt="" style={{ width:36,height:36,borderRadius:8,objectFit:'cover',border:'1px solid var(--theme-card-border)',flexShrink:0 }}/>}
                            <div style={{ flex:1,minWidth:0 }}>
                              <p style={{ fontSize:13,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.nome||c.titulo||'—'}</p>
                              {c.titulo&&c.nome&&c.nome!==c.titulo&&<p style={{ fontSize:10,opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.titulo}</p>}
                              <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:3,flexWrap:'wrap' }}>
                                {c.tipoAnuncio&&<span style={{ fontSize:8,fontWeight:900,textTransform:'uppercase',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',padding:'1px 6px',borderRadius:4,opacity:0.7 }}>{c.tipoAnuncio}</span>}
                                {c.freteGratis&&<span style={{ fontSize:9,fontWeight:700,color:'#10b981' }}>✓ Frete grátis</span>}
                                {c.vendidos!=null&&<span style={{ fontSize:9,color:'#6366f1',fontWeight:700 }}>{c.vendidos} vendidos</span>}
                              </div>
                            </div>
                            <div style={{ textAlign:'right',flexShrink:0,minWidth:100 }}>
                              {c.precoOriginal&&c.precoOriginal>c.preco&&<p style={{ fontSize:10,textDecoration:'line-through',opacity:0.4 }}>{fmt(c.precoOriginal)}</p>}
                              <p style={{ fontSize:18,fontWeight:900,color:eMin?'#059669':abaixo?'#dc2626':acima?'#10b981':'var(--theme-text)' }}>{fmt(c.preco)}</p>
                              {c.desconto&&<span style={{ fontSize:10,fontWeight:900,color:'#059669',background:'#dcfce7',border:'1px solid #86efac',padding:'1px 6px',borderRadius:20 }}>{c.desconto}</span>}
                              {c.link&&<a href={c.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:4,marginTop:6,padding:'4px 10px',borderRadius:8,background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8',fontSize:10,fontWeight:900,textDecoration:'none' }}><ExternalLink style={{ width:11,height:11 }}/>Ver</a>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ):(
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:12,padding:24,border:'1px solid var(--theme-card-border)',textAlign:'center' }}>
                    <Users style={{ width:28,height:28,margin:'0 auto 8px',opacity:0.2 }}/>
                    <p style={{ fontSize:12,fontWeight:900,textTransform:'uppercase',opacity:0.4 }}>Nenhum resultado encontrado</p>
                  </div>
                )}
              </>
            )}
            {tab==='info' && (
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
                {[{title:'Dados do Anúncio',rows:[['ID',item.mlbId],['Condição',d?.condicao||'—'],['Tipo',d?.tipoAnuncio||'—'],['Catálogo',d?.ehCatalogo?'Sim':'Não'],['Status',d?.status||'—'],['Estoque',d?.estoque!=null?`${d.estoque} un`:'—'],['Vendidos',d?.vendidos!=null?d.vendidos:'—'],['Avaliação',d?.avaliacoes?`${d.avaliacoes} ★`:'—']]},{title:'Frete & Mais',rows:[['Frete',d?.freteGratis?'✅ Grátis':(d?.frete||'—')],['Fonte',d?.fonte||'—'],['Analisado',fmtDate(d?.analisadoEm)]]}].map(({title,rows})=>(
                  <div key={title}>
                    <p style={{ fontSize:10,fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:10 }}>{title}</p>
                    {rows.filter(([,v])=>v&&v!=='—'&&v!=null).map(([k,v])=>(
                      <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--theme-card-border)',fontSize:13 }}>
                        <span style={{ opacity:0.5 }}>{k}</span>
                        <span style={{ fontWeight:700,maxWidth:200,textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {tab==='ficha' && (
              (d?.atributos||[]).length===0
                ?<div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:32,gap:8,opacity:0.3 }}><Package style={{ width:32,height:32 }}/><p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase' }}>Sem ficha técnica</p></div>
                :<div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:6 }}>
                  {d.atributos.map((a,i)=>(
                    <div key={i} style={{ display:'flex',justifyContent:'space-between',background:'var(--theme-sidebar)',padding:'8px 12px',borderRadius:8,fontSize:13,border:'1px solid var(--theme-card-border)' }}>
                      <span style={{ opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.nome}</span>
                      <span style={{ fontWeight:700,marginLeft:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.valor}</span>
                    </div>
                  ))}
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
  const linkUrl=d?.link||(item.url?.startsWith('http')?item.url:`https://www.mercadolivre.com.br/p/${item.mlbId}`);
  const abaixo=d?.preco&&d?.precoMedio&&d.preco<d.precoMedio;
  return (
    <div style={{ background:'var(--theme-card)',border:`1px solid ${selecionado?'#60a5fa':'var(--theme-card-border)'}`,borderRadius:12,overflow:'hidden',boxShadow:selecionado?'0 0 0 2px #3b82f6':undefined }}>
      <div style={{ height:2,...(item.status==='analisando'?{backgroundImage:'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)',backgroundSize:'200%',animation:'slideGrad 1.5s linear infinite'}:{backgroundColor:cfg.barColor||'#94a3b8'}) }}/>
      <div style={{ padding:'10px 12px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <button onClick={()=>onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',padding:0,color:selecionado?'#3b82f6':'var(--theme-text)',opacity:selecionado?1:0.3 }}>
            {selecionado?<CheckSquare style={{ width:14,height:14,color:'#3b82f6' }}/>:<Square style={{ width:14,height:14 }}/>}
          </button>
          <div style={{ width:36,height:36,borderRadius:8,overflow:'hidden',border:'1px solid var(--theme-card-border)',flexShrink:0,background:'var(--theme-sidebar)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            {d?.thumbnail?<img src={d.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>:<ShoppingBag style={{ width:16,height:16,color:'var(--theme-text)',opacity:0.2 }}/>}
          </div>
          <div style={{ flex:1,minWidth:0,overflow:'hidden' }}>
            <div style={{ display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',marginBottom:3 }}>
              <span style={{ display:'inline-flex',alignItems:'center',gap:3,fontSize:8,fontWeight:900,textTransform:'uppercase',padding:'1px 6px',borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,flexShrink:0 }}>
                {item.status==='analisando'
                  ?<span style={{ width:8,height:8,borderRadius:'50%',background:'#2563eb',display:'inline-block',flexShrink:0,animation:'pulse 1s ease-in-out infinite' }}/>
                  :<cfg.Icon style={{ width:9,height:9 }}/>}
                {cfg.label}
              </span>
              <span style={{ fontSize:8,fontFamily:'monospace',color:'var(--theme-text)',opacity:0.4,flexShrink:0 }}>{item.mlbId}</span>
            </div>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:12,fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:'none' }}>
              {d?.titulo||urlShort(item.url||linkUrl)}
            </a>
            {item.status==='erro'&&<p style={{ fontSize:10,color:'#ef4444',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.erro}</p>}
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:4,flexShrink:0 }}>
            {(item.status==='concluido'||item.status==='erro')&&(
              <button onClick={()=>onAbrirModal(item)} style={{ padding:5,borderRadius:7,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',cursor:'pointer',display:'flex' }}><Eye style={{ width:13,height:13 }}/></button>
            )}
            <button onClick={()=>onRemover(item.id)} style={{ padding:5,borderRadius:7,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:13,height:13 }}/></button>
          </div>
        </div>
        {item.status==='concluido'&&d&&(
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginTop:8 }}>
            {[{v:fmt(d.preco),l:'Preço',c:'var(--theme-text)'},{v:fmt(d.precoMedio),l:'Média',c:abaixo?'#10b981':'#f59e0b'},{v:d.totalVendedores||(d.concorrentes?.length||0)+1,l:'Vend.',c:'#3b82f6'}].map(({v,l,c})=>(
              <div key={l} style={{ background:'var(--theme-sidebar)',borderRadius:7,padding:'5px 6px',textAlign:'center',border:'1px solid var(--theme-card-border)',overflow:'hidden',minWidth:0 }}>
                <p style={{ fontSize:11,fontWeight:900,color:c,lineHeight:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v}</p>
                <p style={{ fontSize:8,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:2 }}>{l}</p>
              </div>
            ))}
          </div>
        )}
        {item.status==='analisando'&&(
          <div style={{ display:'flex',alignItems:'center',gap:6,marginTop:6,fontSize:10,color:'#3b82f6' }}>
            <AnalyizStar size={18} active={true} dark={true}/>
            <span style={{ opacity:0.7 }}>Buscando dados...</span>
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
          <span style={{ fontSize:9,opacity:0.4 }}>{fmtDate(item.updatedAt)}</span>
          {item.arquivado&&<span style={{ fontSize:8,fontWeight:900,opacity:0.4,background:'var(--theme-sidebar)',padding:'1px 5px',borderRadius:4,textTransform:'uppercase' }}>Arquivado</span>}
        </div>
      </div>
      <div style={{ display:'flex',gap:4,flexShrink:0 }}>
        <button onClick={()=>onRecarregar(item)} style={{ padding:5,borderRadius:7,background:'#eff6ff',border:'1px solid #bfdbfe',color:'#2563eb',cursor:'pointer',display:'flex' }}><RefreshCw style={{ width:11,height:11 }}/></button>
        {item.arquivado
          ?<button onClick={()=>onRestaurar(item.id)} style={{ padding:5,borderRadius:7,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#16a34a',cursor:'pointer',display:'flex' }}><ArchiveRestore style={{ width:11,height:11 }}/></button>
          :<button onClick={()=>onArquivar(item.id)} style={{ padding:5,borderRadius:7,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',cursor:'pointer',display:'flex',color:'var(--theme-text)' }}><Archive style={{ width:11,height:11 }}/></button>}
        <button onClick={()=>onExcluir(item.id)} style={{ padding:5,borderRadius:7,background:'#fef3c7',border:'1px solid #fde68a',color:'#b45309',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:11,height:11 }}/></button>
        <button onClick={()=>onExcluirDef(item.id)} style={{ padding:5,borderRadius:7,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><XCircle style={{ width:11,height:11 }}/></button>
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
      <div style={{ width:36,height:36,borderRadius:8,background:'linear-gradient(135deg,#4f46e5,#9333ea)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
        <Sparkles style={{ width:18,height:18,color:'#fff' }}/>
      </div>
      <div style={{ flex:1,minWidth:0 }}>
        <p style={{ fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.titulo||'Análise de mercado'}</p>
        <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:2 }}>
          {item.precoMedio&&<span style={{ fontSize:9,fontWeight:900,color:'#10b981' }}>Média: {fmt(item.precoMedio)}</span>}
          <span style={{ fontSize:9,opacity:0.4 }}>{fmtDate(item.createdAt)}</span>
        </div>
      </div>
      <div style={{ display:'flex',gap:4,flexShrink:0 }}>
        <button onClick={()=>onVer(item)} style={{ padding:5,borderRadius:7,background:'linear-gradient(135deg,rgba(79,70,229,0.12),rgba(147,51,234,0.12))',border:'1px solid rgba(99,102,241,0.3)',color:'#818cf8',cursor:'pointer',display:'flex' }}><Eye style={{ width:11,height:11 }}/></button>
        <button onClick={()=>onExcluir(item.id)} style={{ padding:5,borderRadius:7,background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:11,height:11 }}/></button>
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
    <div style={{ background:'linear-gradient(135deg,#0f172a,#1e293b)',borderRadius:10,padding:'7px 14px',color:'#fff',marginBottom:6,display:'flex',alignItems:'center',gap:18,flexWrap:'wrap' }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <AnalyizStar size={20} active={false} dark={true}/>
        <span style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.3)',letterSpacing:'0.1em' }}>Sessão</span>
      </div>
      {[{v:ok.length,l:'anúncios',c:'#fff'},{v:precos.length?fmt(Math.min(...precos)):'—',l:'menor',c:'#6ee7b7'},{v:precos.length?fmt(precos.reduce((s,v)=>s+v,0)/precos.length):'—',l:'média',c:'#fcd34d'},{v:totalV,l:'vendedores',c:'#93c5fd'}].map(({v,l,c})=>(
        <div key={l} style={{ display:'flex',alignItems:'baseline',gap:4 }}>
          <span style={{ fontSize:13,fontWeight:900,color:c }}>{v}</span>
          <span style={{ fontSize:9,textTransform:'uppercase',color:'rgba(255,255,255,0.3)' }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ── Modal Comparador ──────────────────────────────────────────────────────────
function ModalComparador({ itens, onClose }) {
  const concluidos=itens.filter(i=>i.status==='concluido'&&i.dados);
  const [meuId,setMeuId]=useState(null);
  if (!concluidos.length) return null;
  const todasOpcoes=[];
  concluidos.forEach(item=>{
    const d=item.dados;
    if(d.seller?.nome&&d.preco>0) todasOpcoes.push({ mlbId:item.mlbId,titulo:d.titulo||item.mlbId,vendedor:d.seller.nome,preco:d.preco,freteGratis:d.freteGratis,link:d.link,thumbnail:d.thumbnail,vendidos:d.vendidos,estoque:d.estoque,ehPrincipal:true });
    (d.concorrentes||[]).forEach(c=>{if(c.preco>0) todasOpcoes.push({ mlbId:c.mlbId||item.mlbId,titulo:c.titulo||d.titulo,vendedor:c.nome,preco:c.preco,precoOriginal:c.precoOriginal,desconto:c.desconto,freteGratis:c.freteGratis,link:c.link,thumbnail:c.thumbnail||d.thumbnail,vendidos:c.vendidos,estoque:c.estoque,ehPrincipal:false });});
  });
  todasOpcoes.sort((a,b)=>a.preco-b.preco);
  const menorPreco=todasOpcoes.length?todasOpcoes[0].preco:0;
  const maiorPreco=todasOpcoes.length?todasOpcoes[todasOpcoes.length-1].preco:0;
  const mediaPreco=todasOpcoes.length?todasOpcoes.reduce((s,o)=>s+o.preco,0)/todasOpcoes.length:0;
  const meuAnuncio=meuId?todasOpcoes.find(o=>o.vendedor===meuId):null;
  const vantagem=op=>{if(!meuAnuncio||op.vendedor===meuAnuncio.vendedor)return null;const diff=meuAnuncio.preco-op.preco;const pct=Math.abs(diff/meuAnuncio.preco*100).toFixed(1);if(diff>0)return{tipo:'perda',msg:`Você ${pct}% mais caro`};if(diff<0)return{tipo:'ganho',msg:`Você ${pct}% mais barato`};return{tipo:'igual',msg:'Mesmo preço'};};
  const grafDados=todasOpcoes.slice(0,8).map(o=>({label:o.vendedor?.substring(0,10)||'—',valor:o.preco,cor:o.vendedor===meuId?'#3b82f6':o.preco===menorPreco?'#10b981':'#94a3b8'}));
  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.82)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:900,maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',borderRadius:20,boxShadow:'0 30px 80px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <div style={{ padding:'16px 20px',background:'var(--theme-header)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}><BarChart2 style={{ width:20,height:20,color:'#FFE600' }}/><div><p style={{ fontSize:14,fontWeight:900,color:'#fff' }}>Comparador de Preços</p><p style={{ fontSize:10,color:'rgba(255,255,255,0.4)' }}>{todasOpcoes.length} opções de {concluidos.length} anúncio(s)</p></div></div>
            <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.4)' }}><X style={{ width:20,height:20 }}/></button>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,flex:1,overflow:'hidden' }}>
            <div style={{ overflowY:'auto',borderRight:'1px solid var(--theme-card-border)' }}>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',borderBottom:'1px solid var(--theme-card-border)' }}>
                {[{l:'Menor',v:fmt(menorPreco),c:'#10b981'},{l:'Média',v:fmt(mediaPreco),c:'#f59e0b'},{l:'Maior',v:fmt(maiorPreco),c:'#ef4444'}].map(({l,v,c},i)=>(
                  <div key={l} style={{ padding:'12px 16px',borderRight:i<2?'1px solid var(--theme-card-border)':'none' }}>
                    <p style={{ fontSize:18,fontWeight:900,color:c }}>{v}</p>
                    <p style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',opacity:0.4,marginTop:2 }}>{l}</p>
                  </div>
                ))}
              </div>
              <div style={{ padding:'12px 16px' }}>
                <GraficoBarras dados={grafDados} titulo="Comparação visual de preços"/>
              </div>
              <div style={{ padding:'0 16px 12px',borderTop:'1px solid var(--theme-card-border)' }}>
                <p style={{ fontSize:10,fontWeight:900,textTransform:'uppercase',opacity:0.5,marginBottom:6,marginTop:10 }}>Marcar meu anúncio:</p>
                <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                  {[...new Set(todasOpcoes.map(o=>o.vendedor))].slice(0,10).map(nome=>(
                    <button key={nome} onClick={()=>setMeuId(meuId===nome?null:nome)} style={{ padding:'4px 10px',borderRadius:8,border:`1px solid ${meuId===nome?'#3b82f6':'var(--theme-card-border)'}`,background:meuId===nome?'#eff6ff':'var(--theme-card)',color:meuId===nome?'#1d4ed8':'var(--theme-text)',fontSize:10,fontWeight:900,cursor:'pointer' }}>{nome}</button>
                  ))}
                </div>
                {meuAnuncio&&<div style={{ marginTop:10,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'8px 12px',display:'flex',alignItems:'center',gap:8 }}><span style={{ fontSize:10,fontWeight:900,color:'#1d4ed8' }}>Seu preço:</span><span style={{ fontSize:16,fontWeight:900,color:'#1d4ed8' }}>{fmt(meuAnuncio.preco)}</span>{meuAnuncio.preco===menorPreco?<span style={{ fontSize:10,fontWeight:900,color:'#059669',background:'#ecfdf5',border:'1px solid #a7f3d0',padding:'2px 8px',borderRadius:20 }}>🏆 Melhor!</span>:<span style={{ fontSize:10,fontWeight:900,color:'#dc2626',background:'#fee2e2',border:'1px solid #fca5a5',padding:'2px 8px',borderRadius:20 }}>{((meuAnuncio.preco/menorPreco-1)*100).toFixed(1)}% acima</span>}</div>}
              </div>
            </div>
            <div style={{ overflowY:'auto' }}>
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead style={{ background:'var(--theme-sidebar)',position:'sticky',top:0 }}>
                  <tr>{['#','Vendedor','Preço','Frete','Vend.','Análise'].map((h,i)=><th key={i} style={{ padding:'8px 12px',fontSize:9,fontWeight:900,textTransform:'uppercase',opacity:0.5,textAlign:'left',borderBottom:'1px solid var(--theme-card-border)' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {todasOpcoes.map((op,i)=>{
                    const isMeu=meuId&&op.vendedor===meuId;const vant=vantagem(op);
                    return (
                      <tr key={i} style={{ background:isMeu?'rgba(59,130,246,0.08)':i===0?'rgba(16,185,129,0.05)':undefined,borderBottom:'1px solid var(--theme-card-border)' }}>
                        <td style={{ padding:'10px 12px',width:28 }}>{i===0?<Medal style={{ width:14,height:14,color:'#f59e0b' }}/>:i===1?<Award style={{ width:14,height:14,color:'#94a3b8' }}/>:<span style={{ fontSize:11,opacity:0.4,fontWeight:900 }}>{i+1}</span>}</td>
                        <td style={{ padding:'10px 12px' }}><span style={{ fontSize:12,fontWeight:900,color:isMeu?'#1d4ed8':'var(--theme-text)' }}>{op.vendedor}</span>{isMeu&&<span style={{ display:'block',fontSize:8,fontWeight:900,color:'#1d4ed8',textTransform:'uppercase',marginTop:1 }}>◀ Você</span>}</td>
                        <td style={{ padding:'10px 12px' }}><p style={{ fontSize:15,fontWeight:900,color:i===0?'#10b981':isMeu?'#1d4ed8':'var(--theme-text)' }}>{fmt(op.preco)}</p>{op.desconto&&<span style={{ fontSize:9,fontWeight:900,color:'#059669',background:'#ecfdf5',padding:'1px 5px',borderRadius:20 }}>{op.desconto}</span>}</td>
                        <td style={{ padding:'10px 12px',fontSize:12,fontWeight:700,color:op.freteGratis?'#10b981':'var(--theme-text)' }}>{op.freteGratis?'✓ Grátis':'Pago'}</td>
                        <td style={{ padding:'10px 12px',fontSize:12,color:'#6366f1',fontWeight:700 }}>{op.vendidos??'—'}</td>
                        <td style={{ padding:'10px 12px' }}>{vant&&!isMeu?<span style={{ fontSize:10,fontWeight:900,color:vant.tipo==='ganho'?'#059669':'#dc2626',background:vant.tipo==='ganho'?'#ecfdf5':'#fee2e2',border:`1px solid ${vant.tipo==='ganho'?'#a7f3d0':'#fca5a5'}`,padding:'3px 8px',borderRadius:20,display:'inline-block' }}>{vant.msg}</span>:isMeu?<span style={{ fontSize:10,fontWeight:900,color:'#1d4ed8',background:'#eff6ff',border:'1px solid #bfdbfe',padding:'3px 8px',borderRadius:20 }}>Seu anúncio</span>:null}</td>
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
// MODAL PESQUISA DE MERCADO — v9 REFORMULADO
// Tamanho fixo, Q&A integrado no relatório, terminal do site, input estilo chat
// ═════════════════════════════════════════════════════════════════════════════
function ModalPesquisaMercado({ pesquisaIA, itens, logsPesquisa, gerandoPesquisa, onClose, onSalvar, userId }) {
  const [abaModal,    setAbaModal]    = useState('relatorio');
  const [pergunta,    setPergunta]    = useState('');
  const [respondendo, setRespondendo] = useState(false);
  // Lista de respostas inline na aba relatório
  const [respostasQA, setRespostasQA] = useState([]);
  const [logsFU,      setLogsFU]      = useState([]);

  const logEndRef  = useRef(null);
  const qaEndRef   = useRef(null);
  const taRef      = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [logsPesquisa, logsFU]);
  useEffect(() => { qaEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [respostasQA]);

  // Ajuste altura da textarea automaticamente
  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  }, [pergunta]);

  // Extrair dados de preços para gráfico
  const todosPrecos = [];
  itens.filter(i=>i.status==='concluido'&&i.dados).forEach(it=>{
    const d=it.dados;
    if(d.preco>0) todosPrecos.push({ label:(d.seller?.nome||d.titulo||it.mlbId).substring(0,10), valor:d.preco, cor:'#3b82f6' });
    (d.concorrentes||[]).slice(0,5).forEach(c=>{ if(c.preco>0) todosPrecos.push({ label:(c.nome||c.titulo||'—').substring(0,10), valor:c.preco }); });
  });
  todosPrecos.sort((a,b)=>a.valor-b.valor);

  const enviarPergunta = async () => {
    if (!pergunta.trim() || respondendo) return;
    const q = pergunta.trim();
    setPergunta('');
    setRespondendo(true);
    // Adiciona a pergunta na lista imediatamente
    setRespostasQA(prev => [...prev, { tipo:'pergunta', texto: q }]);
    const addLog = (msg,tipo) => setLogsFU(prev=>[...prev,{msg,tipo,ts:new Date().toLocaleTimeString('pt-BR')}]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/research/deep-market`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          userId,
          // Envia apenas metadados compactos, não o HTML do relatório inteiro
          itens: itens.filter(i=>i.status==='concluido').map(i=>({
            mlbId: i.dados?.mlbId,
            titulo: i.dados?.titulo,
            preco: i.dados?.preco,
            precoMedio: i.dados?.precoMedio,
            precoMin: i.dados?.precoMin,
            totalVendedores: i.dados?.totalVendedores,
            ehCatalogo: i.dados?.ehCatalogo,
          })),
          perguntaFollowUp: q,
          // Envia apenas o contexto textual resumido (sem o HTML completo)
          contextoAnterior: `Relatório gerado sobre: ${pesquisaIA?.titulo || ''}. Pergunta do usuário: ${q}`,
        }),
      });
      const reader=res.body.getReader();const decoder=new TextDecoder();
      let buffer='';let ev=null;let respostaAcumulada='';
      while(true){
        const{value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split('\n');buffer=lines.pop();
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{
              const data=JSON.parse(line.slice(6));
              if(ev==='log') addLog(data.msg,data.tipo||'info');
              else if(ev==='done') respostaAcumulada = data.conteudoHtml||data.relatorio||'';
            }catch{}
            ev=null;
          }
        }
      }
      setRespostasQA(prev => [...prev, { tipo:'resposta', html: respostaAcumulada }]);
    } catch(e) {
      addLog(`❌ ${e.message}`,'error');
      setRespostasQA(prev => [...prev, { tipo:'resposta', html: `<span style="color:#ef4444">Erro: ${e.message}</span>` }]);
    } finally {
      setRespondendo(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarPergunta(); }
  };

  const SUGESTOES = [
    'Se eu baixar o preço em R$ 20, melhoro minha posição?',
    'Qual vendedor é minha maior ameaça?',
    'Devo oferecer frete grátis para competir melhor?',
    'Qual é a faixa de preço ideal para este produto?',
  ];

  const abaItems = [
    { k:'relatorio', l:'📋 Relatório' },
    { k:'graficos',  l:'📊 Gráficos' },
    { k:'terminal',  l:'⚡ Terminal' },
  ];

  return (
    <Portal>
      <div
        onClick={onClose}
        style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}
      >
        {/* Container com altura FIXA — nunca muda de tamanho */}
        <div
          onClick={e=>e.stopPropagation()}
          style={{
            width: 900,
            maxWidth: '96vw',
            height: '88vh',          // ← FIXO: nunca salta
            maxHeight: '88vh',
            background: 'var(--theme-card)',
            border: '1px solid var(--theme-card-border)',
            borderRadius: 20,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
            color: 'var(--theme-text)',
          }}
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{ padding:'12px 18px', background:'var(--theme-header)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <AnalyizStar size={28} active={gerandoPesquisa} dark={true}/>
              <div>
                <p style={{ fontSize:13, fontWeight:900, color:'#fff', lineHeight:1 }}>Inteligência de Mercado</p>
                <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:2 }}>
                  {gerandoPesquisa ? 'Analisando...' : (pesquisaIA?.titulo || 'Análise profunda com pesquisa web')}
                </p>
              </div>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <button
                onClick={onSalvar}
                disabled={!pesquisaIA || gerandoPesquisa}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:8, background: pesquisaIA&&!gerandoPesquisa ? 'linear-gradient(90deg,#059669,#10b981)' : 'rgba(255,255,255,0.1)', color:'#fff', fontWeight:900, fontSize:10, border:'none', cursor: pesquisaIA&&!gerandoPesquisa ? 'pointer':'not-allowed', opacity: pesquisaIA&&!gerandoPesquisa ? 1:0.5 }}
              >
                💾 Salvar
              </button>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', padding:4 }}><X style={{ width:18, height:18 }}/></button>
            </div>
          </div>

          {/* ── Abas ───────────────────────────────────────────────────────── */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--theme-card-border)', padding:'0 14px', flexShrink:0, background:'var(--theme-sidebar)', gap:2 }}>
            {abaItems.map(({k,l}) => (
              <button
                key={k}
                onClick={() => setAbaModal(k)}
                style={{ padding:'8px 12px', fontSize:10, fontWeight:900, textTransform:'uppercase', border:'none', borderBottom:`2px solid ${abaModal===k?'var(--theme-accent)':'transparent'}`, color: abaModal===k ? 'var(--theme-accent)':'var(--theme-text)', background:'none', cursor:'pointer', opacity: abaModal===k ? 1:0.5, whiteSpace:'nowrap', transition:'all 0.15s' }}
              >
                {l}
              </button>
            ))}
          </div>

          {/* ── Conteúdo — flex:1 + overflow oculto para manter altura fixa ── */}
          <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>

            {/* ── ABA RELATÓRIO ─────────────────────────────────────────── */}
            {abaModal === 'relatorio' && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>

                {/* Geração em andamento */}
                {gerandoPesquisa && (
                  <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:'rgba(79,70,229,0.08)', borderBottom:'1px solid rgba(99,102,241,0.15)' }}>
                    <AnalyizStar size={22} active={true} dark={true}/>
                    <p style={{ fontSize:12, fontWeight:700, color:'#818cf8' }}>Gerando análise profunda na web...</p>
                  </div>
                )}

                {/* Relatório scrollável */}
                <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', minHeight:0 }} className="ia-scroll">
                  {pesquisaIA?.conteudoHtml ? (
                    <RelatorioTopicos html={pesquisaIA.conteudoHtml}/>
                  ) : !gerandoPesquisa && (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:40, gap:8, opacity:0.3 }}>
                      <Sparkles style={{ width:32, height:32 }}/>
                      <p style={{ fontSize:12, fontWeight:900 }}>Aguardando geração do relatório...</p>
                    </div>
                  )}

                  {/* Histórico de Q&A inline */}
                  {respostasQA.length > 0 && (
                    <div style={{ marginTop:16, borderTop:'1px solid var(--theme-card-border)', paddingTop:12, display:'flex', flexDirection:'column', gap:8 }}>
                      <p style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', opacity:0.4, marginBottom:4 }}>Perguntas & Respostas</p>
                      {respostasQA.map((item, i) => (
                        item.tipo === 'pergunta' ? (
                          <div key={i} style={{ display:'flex', justifyContent:'flex-end' }}>
                            <div style={{ background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', borderRadius:'14px 14px 4px 14px', padding:'8px 12px', maxWidth:'80%', fontSize:12, fontWeight:600 }}>
                              {item.texto}
                            </div>
                          </div>
                        ) : (
                          <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                            <AnalyizStar size={18} active={false} dark={true}/>
                            <div style={{ flex:1, background:'rgba(79,70,229,0.06)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:'4px 14px 14px 14px', padding:'8px 12px', fontSize:12, lineHeight:1.65 }}
                              dangerouslySetInnerHTML={{ __html: item.html }}
                            />
                          </div>
                        )
                      ))}
                      {respondendo && (
                        <div style={{ display:'flex', gap:8, alignItems:'center', paddingLeft:26 }}>
                          <AnalyizStar size={18} active={true} dark={true}/>
                          <span style={{ fontSize:11, color:'#818cf8', fontStyle:'italic' }}>Pesquisando resposta...</span>
                        </div>
                      )}
                      <div ref={qaEndRef}/>
                    </div>
                  )}
                </div>

                {/* Campo de pergunta — estilo ia-input-box do chat */}
                <div style={{ flexShrink:0, padding:'8px 12px', borderTop:'1px solid var(--theme-card-border)', background:'var(--theme-card)' }}>
                  {/* Sugestões compactas */}
                  {respostasQA.length === 0 && !respondendo && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
                      {SUGESTOES.map(q => (
                        <button
                          key={q}
                          onClick={() => setPergunta(q)}
                          style={{ fontSize:9, padding:'3px 8px', borderRadius:20, background:'var(--theme-sidebar)', border:'1px solid var(--theme-card-border)', color:'var(--theme-text)', cursor:'pointer', opacity:0.7, fontFamily:"'Google Sans',sans-serif", maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input estilo ia-input-box */}
                  <div style={{ background:'var(--theme-sidebar)', border:`1.5px solid ${pergunta.trim() ? 'rgba(138,180,248,0.45)' : 'var(--theme-card-border)'}`, borderRadius:20, padding:'8px 12px', display:'flex', alignItems:'flex-end', gap:8, transition:'border-color 0.2s, box-shadow 0.2s', boxShadow: pergunta.trim() ? '0 0 0 2px rgba(138,180,248,0.08)' : 'none' }}>
                    <textarea
                      ref={taRef}
                      value={pergunta}
                      onChange={e => setPergunta(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={respondendo || gerandoPesquisa}
                      placeholder={gerandoPesquisa ? 'Aguarde a análise terminar...' : 'Pergunte sobre o mercado… (Enter para enviar)'}
                      rows={1}
                      style={{ flex:1, background:'transparent', border:'none', outline:'none', resize:'none', color:'var(--theme-text)', fontSize:12, fontFamily:"'Google Sans',sans-serif", maxHeight:120, lineHeight:1.5, overflowY:'auto' }}
                    />
                    <button
                      onClick={enviarPergunta}
                      disabled={!pergunta.trim() || respondendo || gerandoPesquisa}
                      style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: pergunta.trim() && !respondendo && !gerandoPesquisa ? '#8ab4f8' : 'transparent', color: pergunta.trim() && !respondendo && !gerandoPesquisa ? '#1e1f20' : 'var(--theme-text)', border: pergunta.trim() && !respondendo && !gerandoPesquisa ? 'none' : '1px solid var(--theme-card-border)', cursor: pergunta.trim() && !respondendo && !gerandoPesquisa ? 'pointer':'default', opacity: pergunta.trim() && !respondendo && !gerandoPesquisa ? 1:0.4, transition:'all 0.15s' }}
                    >
                      {respondendo ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={13} style={{ marginLeft:1 }}/>}
                    </button>
                  </div>
                  <p style={{ fontSize:9, color:'var(--theme-text)', opacity:0.3, marginTop:4, textAlign:'center', fontFamily:"'Google Sans',sans-serif" }}>
                    Enter para enviar · Shift+Enter nova linha
                  </p>
                </div>
              </div>
            )}

            {/* ── ABA GRÁFICOS ──────────────────────────────────────────── */}
            {abaModal === 'graficos' && (
              <div style={{ flex:1, overflowY:'auto', padding:16, minHeight:0 }} className="ia-scroll">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div style={{ background:'var(--theme-sidebar)', borderRadius:12, padding:14, border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', opacity:0.4, marginBottom:4 }}>Comparação de preços</p>
                    <GraficoBarras dados={todosPrecos.slice(0,10)} titulo="" corAtiva="#3b82f6"/>
                    {!todosPrecos.length && <p style={{ fontSize:11, opacity:0.3, textAlign:'center', padding:24 }}>Sem dados de preço</p>}
                  </div>
                  <div style={{ background:'var(--theme-sidebar)', borderRadius:12, padding:14, border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', opacity:0.4, marginBottom:10 }}>Métricas</p>
                    {todosPrecos.length > 0 ? (
                      [
                        {l:'Menor preço',  v:fmt(Math.min(...todosPrecos.map(p=>p.valor))), c:'#10b981'},
                        {l:'Preço médio',  v:fmt(todosPrecos.reduce((s,p)=>s+p.valor,0)/todosPrecos.length), c:'#f59e0b'},
                        {l:'Maior preço',  v:fmt(Math.max(...todosPrecos.map(p=>p.valor))), c:'#ef4444'},
                        {l:'Total opções', v:todosPrecos.length, c:'#3b82f6'},
                      ].map(({l,v,c}) => (
                        <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--theme-card-border)' }}>
                          <span style={{ fontSize:12, opacity:0.6 }}>{l}</span>
                          <span style={{ fontSize:15, fontWeight:900, color:c }}>{v}</span>
                        </div>
                      ))
                    ) : <p style={{ fontSize:11, opacity:0.3, textAlign:'center', padding:24 }}>Sem dados</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ── ABA TERMINAL — igual ao terminal existente no site ───── */}
            {abaModal === 'terminal' && (
              <div style={{ flex:1, background:'#020617', display:'flex', flexDirection:'column', minHeight:0 }}>
                {/* Barra de topo estilo terminal do site */}
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
                  <div style={{ display:'flex', gap:4 }}>
                    {['#ef4444','#f59e0b','#10b981'].map(c => (
                      <span key={c} style={{ width:8, height:8, borderRadius:'50%', background:c, opacity:0.6 }}/>
                    ))}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
                    <Activity style={{ width:10, height:10, color:'rgba(255,255,255,0.25)' }}/>
                    <span style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em' }}>
                      Processo de pesquisa
                    </span>
                  </div>
                  {(gerandoPesquisa || respondendo) && (
                    <span style={{ marginLeft:'auto', width:6, height:6, borderRadius:'50%', background:'#3b82f6', animation:'pulse 2s infinite' }}/>
                  )}
                </div>
                {/* Logs */}
                <div
                  style={{ flex:1, overflowY:'auto', padding:'8px 12px', fontFamily:'monospace', display:'flex', flexDirection:'column', gap:2, minHeight:0 }}
                  className="ia-scroll"
                >
                  {[...logsPesquisa, ...logsFU].length === 0 && (
                    <p style={{ fontSize:9, color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>Aguardando análise...</p>
                  )}
                  {[...logsPesquisa, ...logsFU].map((l, i) => (
                    <div key={i} style={{ fontSize:9, lineHeight:1.5, wordBreak:'break-words', color: l.tipo==='success'?'#6ee7b7':l.tipo==='error'?'#f87171':l.tipo==='warn'?'#fcd34d':'rgba(255,255,255,0.5)' }}>
                      <span style={{ color:'rgba(255,255,255,0.2)', marginRight:6 }}>{l.ts||''}</span>
                      {l.msg}
                    </div>
                  ))}
                  {(gerandoPesquisa || respondendo) && (
                    <div style={{ fontSize:9, color:'#60a5fa', display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
                      <Loader2 style={{ width:9, height:9, animation:'spin 1s linear infinite' }}/>
                      processando...
                    </div>
                  )}
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
  const [log,           setLog]          = useState([]);
  const [selecionados,  setSelecionados] = useState(new Set());
  const [modalAberto,   setModalAberto]  = useState(null);
  const [showComparador, setShowComparador] = useState(false);
  const [showDica,       setShowDica]       = useState(false);

  const [pesquisaIA,      setPesquisaIA]      = useState(null);
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

  const processarInput = () => {
    if (!inputTexto.trim()) return;
    const linhas=inputTexto.split(/[\n,;]+/).map(l=>l.trim()).filter(Boolean);
    const novos=[];
    const jaExiste=new Set(itens.map(i=>i.mlbId));
    for (const linha of linhas) {
      const mlbId=extrairMLBId(linha);
      if (!mlbId) { addLog(`⚠️ ID não encontrado: ${linha.substring(0,50)}`,'warn'); continue; }
      if (jaExiste.has(mlbId)) { addLog(`ℹ️ ${mlbId} já está na lista`); continue; }
      jaExiste.add(mlbId);
      novos.push({ id:`${mlbId}-${Date.now()}-${Math.random()}`,mlbId,url:linha,status:'pendente',dados:null,erro:null });
    }
    if (!novos.length) { addLog('Nenhum link válido.','warn'); return; }
    setItens(prev=>[...prev,...novos]);
    setInputTexto('');
    addLog(`✅ ${novos.length} anúncio(s) adicionados`,'success');
    setMostrarInput(false);
  };

  const tipoDebug = linha => {
    if (linha.startsWith('✅')||linha.startsWith('🎯')) return 'success';
    if (linha.startsWith('❌')||linha.startsWith('⚠️')) return 'warn';
    return 'info';
  };

  const buscarAnuncio = useCallback(async (mlbId, url) => {
    const params=new URLSearchParams({userId});
    if (url) params.set('urlOriginal',encodeURIComponent(url));
    const res=await fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?${params}`,{signal:AbortSignal.timeout(45000)});
    const json=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
    if (!res.ok) throw new Error(json.error||`HTTP ${res.status}`);
    return json;
  }, [userId]);

  const executarFila = useCallback(async (ids) => {
    if (rodandoRef.current) return;
    rodandoRef.current=true; abortRef.current=false; setRodando(true);
    addLog(`🚀 Analisando ${ids.length} anúncio(s)...`,'success');
    const retentar=[];
    for (let i=0;i<ids.length;i++) {
      if (abortRef.current) break;
      const{mlbId,url}=ids[i];
      setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando'}:it));
      addLog(`── [${i+1}/${ids.length}] ${mlbId} ──────────────`);
      try {
        const dados=await buscarAnuncio(mlbId,url);
        if (Array.isArray(dados.debug)) dados.debug.forEach(linha=>addLog(`  ${linha}`,tipoDebug(linha)));
        const{debug:_dbg,...dadosSemDebug}=dados;
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
      addLog(`🔄 Re-tentando ${retentar.length} item(s) em 5s...`);
      await new Promise(r=>setTimeout(r,5000));
      for (const{mlbId,url} of retentar) {
        if (abortRef.current) break;
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando',erro:null}:it));
        addLog(`🔄 Re-tentando ${mlbId}...`);
        try {
          const dados=await buscarAnuncio(mlbId,url);
          if (Array.isArray(dados.debug)) dados.debug.forEach(l=>addLog(`  ${l}`,tipoDebug(l)));
          const{debug:_d,...dadosSemDebug}=dados;
          setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados:dadosSemDebug}:it));
          addLog(`✅ ${mlbId} OK`,'success');
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
  const exportarCSV     = () => {
    const rows=itens.filter(i=>i.status==='concluido').map(i=>{const d=i.dados;return[i.mlbId,`"${(d?.titulo||'').replace(/"/g,'""')}"`,d?.preco||'',d?.precoMedio||'',d?.totalVendedores||''].join(',');});
    if(!rows.length) return;
    const blob=new Blob([['ID,Título,Preço,Média,Vendedores',...rows].join('\n')],{type:'text/csv;charset=utf-8'});
    Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`pesquisa_ml_${new Date().toISOString().slice(0,10)}.csv`}).click();
  };

  const dispararPesquisaMercado = async () => {
    const concluidos=itens.filter(i=>selecionados.has(i.id)&&i.status==='concluido');
    if (!concluidos.length) return;
    setPesquisaIA(null); setLogsPesquisa([]); setGerandoPesquisa(true); setShowPesquisaModal(true);
    const addLog2=(msg,tipo)=>setLogsPesquisa(prev=>[...prev,{msg,tipo:tipo||'info',ts:new Date().toLocaleTimeString('pt-BR')}]);
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/deep-market`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ userId, itens:concluidos.map(i=>i.dados) }),
      });
      const reader=res.body.getReader();const decoder=new TextDecoder();
      let buffer='';let ev=null;
      while(true){
        const{value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split('\n');buffer=lines.pop();
        for(const line of lines){
          if(line.startsWith('event: ')){ev=line.slice(7).trim();}
          else if(line.startsWith('data: ')&&ev){
            try{
              const data=JSON.parse(line.slice(6));
              if(ev==='log') addLog2(data.msg,data.tipo);
              else if(ev==='done') setPesquisaIA(data);
              else if(ev==='error') addLog2(`❌ ${data.error}`,'error');
            }catch{}
            ev=null;
          }
        }
      }
    } catch(e) { addLog2(`❌ Erro: ${e.message}`,'error'); }
    finally { setGerandoPesquisa(false); }
  };

  const salvarPesquisaNoHistorico = async () => {
    if (!pesquisaIA) return;
    try {
      const res=await fetch(`${API_BASE_URL}/api/ml/research/market-save`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ userId,...pesquisaIA }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addLog('💾 Análise de mercado salva!','success');
      setShowPesquisaModal(false); setPesquisaIA(null); buscarAnalisesMercado();
    } catch(e) { addLog(`❌ Falha ao salvar: ${e.message}`,'warn'); }
  };

  const contagens      = { todos:itens.length,pendente:itens.filter(i=>i.status==='pendente').length,analisando:itens.filter(i=>i.status==='analisando').length,concluido:itens.filter(i=>i.status==='concluido').length,erro:itens.filter(i=>i.status==='erro').length,fila:itens.filter(i=>i.status==='fila').length };
  const temPendentes   = contagens.pendente+contagens.erro+contagens.fila>0;
  const itensFiltrados = filtroStatus==='todos'?itens:itens.filter(i=>i.status===filtroStatus);
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
        <div style={{ marginRight:4 }}>
          <h2 style={{ fontSize:15,fontWeight:900,color:'var(--theme-text)',lineHeight:1 }}>Pesquisa de Anúncios</h2>
          <p style={{ fontSize:11,color:'var(--theme-text)',opacity:0.5 }}>Preços, vendedores e concorrentes</p>
        </div>

        <div style={{ display:'flex',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:3,gap:2,flexShrink:0 }}>
          {[
            {k:'pesquisa',  l:'Pesquisa',                             Ic:Search},
            {k:'historico', l:`Histórico (${contHist.historico})`,    Ic:History},
            {k:'arquivados',l:`Arquivados (${contHist.arquivados})`,  Ic:Archive},
          ].map(({k,l,Ic})=>(
            <button key={k} onClick={()=>setAba(k)}
              style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,fontSize:10,fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:aba===k?'var(--theme-header)':'transparent',color:aba===k?'#FFE600':'var(--theme-text)',opacity:aba===k?1:0.5,whiteSpace:'nowrap',minWidth:'max-content' }}>
              <Ic style={{ width:12,height:12 }}/>{l}
            </button>
          ))}
        </div>

        {aba==='pesquisa' && (
          <button onClick={()=>setMostrarInput(v=>!v)}
            style={{ ...btnBase,background:mostrarInput?'#FFE600':'var(--theme-header)',color:mostrarInput?'#1e293b':'#FFE600',border:'none',padding:'6px 12px',flexShrink:0 }}>
            <Plus style={{ width:13,height:13 }}/>Adicionar Links
          </button>
        )}

        <div style={{ marginLeft:'auto',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
          {aba==='pesquisa'&&itens.length>0&&(<>
            <button onClick={exportarCSV} disabled={!contagens.concluido} style={{ ...btnBase,color:'#15803d',borderColor:'#86efac',background:'#f0fdf4',opacity:contagens.concluido?1:0.4 }}><Download style={{ width:13,height:13 }}/>CSV</button>
            {!rodando&&(contagens.erro+contagens.fila)>0&&<button onClick={reanaliarErros} style={{ ...btnBase,color:'#d97706',borderColor:'#fde68a',background:'#fef3c7' }}><RefreshCw style={{ width:13,height:13 }}/>Re-tentar</button>}
            <button onClick={limparTudo} disabled={rodando} style={{ ...btnBase,color:'#ef4444',borderColor:'#fca5a5',background:'#fee2e2' }}><Trash2 style={{ width:13,height:13 }}/>Limpar</button>
          </>)}
          {aba==='pesquisa' && (
            <div style={{ position:'relative' }}>
              <button onClick={()=>setShowDica(v=>!v)} style={{ ...btnBase,padding:6,background:showDica?'#fef9c3':'var(--theme-sidebar)',color:showDica?'#854d0e':'var(--theme-text)',borderColor:showDica?'#fde047':'var(--theme-card-border)' }}>
                <HelpCircle style={{ width:14,height:14 }}/>
              </button>
              {showDica && (
                <Portal>
                  <div onClick={()=>setShowDica(false)} style={{ position:'fixed',inset:0,zIndex:99990 }}>
                    <div onClick={e=>e.stopPropagation()} style={{ position:'fixed',top:60,right:16,zIndex:99991,width:300,background:'#1e293b',border:'1px solid #334155',borderRadius:14,padding:14,boxShadow:'0 20px 60px rgba(0,0,0,0.5)',animation:'slideDown 0.15s ease' }}>
                      <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'#fbbf24',marginBottom:10,display:'flex',alignItems:'center',gap:6 }}><HelpCircle style={{ width:13,height:13 }}/>Dicas</p>
                      {[{e:'🔗',t:'Links ou IDs',d:'Cole um por linha.'},{e:'⚡',t:'Análise auto',d:'Clique Analisar no terminal.'},{e:'📦',t:'Catálogo',d:'Busca todas as opções de compra no ML.'},{e:'📊',t:'Comparador',d:'Selecione 2+ e clique Comparar.'},{e:'🤖',t:'Pesquisa IA',d:'Selecione itens e clique Pesquisa IA.'},{e:'💬',t:'Perguntas',d:'No relatório, faça perguntas diretamente.'}].map(({e,t,d})=>(
                        <div key={t} style={{ display:'flex',gap:8,padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                          <span style={{ fontSize:14,flexShrink:0 }}>{e}</span>
                          <div><p style={{ fontSize:11,fontWeight:900,color:'#fff',marginBottom:2 }}>{t}</p><p style={{ fontSize:10,color:'rgba(255,255,255,0.45)',lineHeight:1.5 }}>{d}</p></div>
                        </div>
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
              <div onClick={e=>e.stopPropagation()} style={{ position:'fixed',top:60,left:280,zIndex:99999,width:380,maxWidth:'96vw',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:16,padding:16,boxShadow:'0 20px 60px rgba(0,0,0,0.35)',animation:'slideDown 0.15s ease' }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
                  <p style={{ fontSize:12,fontWeight:900,textTransform:'uppercase',display:'flex',alignItems:'center',gap:6,color:'var(--theme-text)' }}><Search style={{ width:14,height:14,color:'var(--theme-accent)' }}/>Cole os links ou IDs</p>
                  <button onClick={()=>setMostrarInput(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--theme-text)',opacity:0.4 }}><X style={{ width:16,height:16 }}/></button>
                </div>
                <textarea autoFocus value={inputTexto} onChange={e=>setInputTexto(e.target.value)}
                  placeholder={"Links ou IDs (um por linha):\nhttps://www.mercadolivre.com.br/...\nMLB123456789"}
                  style={{ width:'100%',border:'1px solid var(--theme-card-border)',borderRadius:10,padding:'10px 12px',fontSize:12,fontFamily:'monospace',outline:'none',resize:'none',background:'var(--theme-sidebar)',color:'var(--theme-text)',boxSizing:'border-box' }}
                  rows={5}
                  onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){processarInput();setMostrarInput(false);}}}
                />
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:10 }}>
                  <p style={{ fontSize:10,color:'var(--theme-text)',opacity:0.4 }}>Ctrl+Enter para adicionar</p>
                  <button onClick={()=>{processarInput();setMostrarInput(false);}} disabled={!inputTexto.trim()}
                    style={{ display:'flex',alignItems:'center',gap:5,padding:'8px 16px',borderRadius:10,background:inputTexto.trim()?'var(--theme-accent)':'var(--theme-sidebar)',color:inputTexto.trim()?'#fff':'var(--theme-text)',opacity:inputTexto.trim()?1:0.4,fontSize:11,fontWeight:900,textTransform:'uppercase',border:'none',cursor:inputTexto.trim()?'pointer':'not-allowed' }}>
                    <Plus style={{ width:13,height:13 }}/>Adicionar
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {itens.length>0 && <ResumoGeral itens={itens}/>}

        {isNewSession && (
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:16,textAlign:'center' }}>
            <div style={{ width:70,height:70,background:'#FFE600',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(0,0,0,0.15)' }}><Search style={{ width:34,height:34,color:'#1e293b' }}/></div>
            <div><h3 style={{ fontSize:16,fontWeight:900,color:'var(--theme-text)',marginBottom:4 }}>Pesquise anúncios do ML</h3><p style={{ fontSize:13,color:'var(--theme-text)',opacity:0.5 }}>Cole links ou IDs para analisar preços e vendedores.</p></div>
            <button onClick={()=>setMostrarInput(true)} style={{ ...btnBase,background:'var(--theme-header)',color:'#FFE600',border:'none',padding:'10px 20px',fontSize:12 }}><Plus style={{ width:14,height:14 }}/>Adicionar Links</button>
          </div>
        )}

        {itens.length>0 && (
          <div style={{ display:'flex',gap:12,flex:1,minHeight:0 }}>
            {/* Terminal — idêntico ao existente no site */}
            <div style={{ width:300,flexShrink:0,background:'#020617',borderRadius:14,display:'flex',flexDirection:'column',maxHeight:'76vh' }}>
              <div style={{ display:'flex',alignItems:'center',gap:6,padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0 }}>
                <div style={{ display:'flex',gap:4 }}>{['#ef4444','#f59e0b','#10b981'].map(c=><span key={c} style={{ width:9,height:9,borderRadius:'50%',background:c,opacity:0.6 }}/>)}</div>
                <div style={{ display:'flex',alignItems:'center',gap:6,marginLeft:4 }}>
                  <AnalyizStar size={16} active={rodando} dark={true}/>
                  <p style={{ fontSize:9,fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.25)',letterSpacing:'0.1em' }}>Terminal</p>
                </div>
                {rodando&&<span style={{ marginLeft:'auto',width:6,height:6,borderRadius:'50%',background:'#3b82f6',animation:'pulse 2s infinite' }}/>}
              </div>
              <div style={{ padding:'8px 10px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0 }}>
                {!rodando
                  ?<button onClick={iniciarAnalise} disabled={!temPendentes||!mlConectado}
                    style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:7,borderRadius:8,fontSize:10,fontWeight:900,textTransform:'uppercase',border:'none',cursor:!temPendentes||!mlConectado?'not-allowed':'pointer',background:!temPendentes||!mlConectado?'rgba(255,255,255,0.05)':'#1d4ed8',color:!temPendentes||!mlConectado?'rgba(255,255,255,0.2)':'#fff' }}>
                    <Zap style={{ width:11,height:11 }}/>{mlConectado?(temPendentes?`Analisar (${contagens.pendente+contagens.erro+contagens.fila})`:'Sem pendentes'):'🔒 ML offline'}
                  </button>
                  :<button onClick={pararAnalise} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:7,borderRadius:8,fontSize:10,fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:'#7f1d1d',color:'#fca5a5' }}>
                    <XCircle style={{ width:11,height:11 }}/>Parar
                  </button>}
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:10,fontFamily:'monospace',display:'flex',flexDirection:'column',gap:2,minHeight:0 }}>
                {log.length===0?<p style={{ fontSize:9,color:'rgba(255,255,255,0.2)',fontStyle:'italic' }}>Aguardando...</p>
                  :log.map((l,i)=>(
                    <div key={i} style={{ fontSize:9,lineHeight:1.5,wordBreak:'break-words',color:l.tipo==='success'?'#6ee7b7':l.tipo==='warn'?'#fcd34d':'rgba(255,255,255,0.45)' }}>
                      <span style={{ color:'rgba(255,255,255,0.2)',marginRight:4 }}>{l.ts}</span>{l.msg}
                    </div>
                  ))}
                {rodando&&<div style={{ fontSize:9,color:'#60a5fa',display:'flex',alignItems:'center',gap:4,marginTop:4 }}><Loader2 style={{ width:9,height:9,animation:'spin 1s linear infinite' }}/>processando...</div>}
                <div ref={logEndRef}/>
              </div>
            </div>

            {/* Lista resultados */}
            <div style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:8 }}>
              <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:'8px 12px',display:'flex',alignItems:'center',gap:5,flexWrap:'wrap' }}>
                <button onClick={()=>{if(selecionados.size===itensFiltrados.length&&itensFiltrados.length>0) setSelecionados(new Set()); else setSelecionados(new Set(itensFiltrados.map(i=>i.id)));}} style={{ color:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?'#3b82f6':'var(--theme-text)',opacity:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?1:0.3,background:'none',border:'none',cursor:'pointer',padding:0 }}>
                  {selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?<CheckSquare style={{ width:14,height:14,color:'#3b82f6' }}/>:<Square style={{ width:14,height:14 }}/>}
                </button>
                {FILTROS.map(({k,l,ac,cc,bc})=>(
                  <button key={k} onClick={()=>setFiltroStatus(k)} style={{ padding:'4px 9px',borderRadius:7,border:`1px solid ${filtroStatus===k?bc:'var(--theme-card-border)'}`,background:filtroStatus===k?ac:'var(--theme-sidebar)',color:filtroStatus===k?cc:'var(--theme-text)',fontSize:10,fontWeight:900,textTransform:'uppercase',cursor:'pointer',opacity:filtroStatus===k?1:0.6 }}>{l}</button>
                ))}
                {selecionados.size>0&&(
                  <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:5,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'4px 10px' }}>
                    <span style={{ fontSize:9,fontWeight:900,color:'#1d4ed8' }}>{selecionados.size} sel.</span>
                    {[...selecionados].some(id=>itens.find(i=>i.id===id&&i.status==='concluido'))&&(<>
                      <button onClick={async()=>{
                        const concluidos=itens.filter(i=>selecionados.has(i.id)&&i.status==='concluido');
                        for(const it of concluidos){try{const res=await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=false`);const hist=await res.json();const entrada=Array.isArray(hist)?hist.find(h=>h.mlbId===it.mlbId):null;if(entrada)await fetch(`${API_BASE_URL}/api/ml/research/historico/${entrada.id}/arquivar`,{method:'PUT'});}catch{}}
                        addLog(`📦 ${concluidos.length} arquivado(s)`,'success');setSelecionados(new Set());
                      }} style={{ display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',cursor:'pointer',fontSize:9,fontWeight:900 }}><Archive style={{ width:11,height:11 }}/>Arquivar</button>
                      <button onClick={()=>setShowComparador(true)} style={{ display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:'#7c3aed',color:'#fff',border:'none',cursor:'pointer',fontSize:9,fontWeight:900 }}><BarChart2 style={{ width:11,height:11 }}/>Comparar</button>
                      <button disabled={gerandoPesquisa} onClick={dispararPesquisaMercado}
                        style={{ display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:gerandoPesquisa?'rgba(79,70,229,0.5)':'linear-gradient(90deg,#4f46e5,#9333ea)',color:'#fff',border:'none',cursor:gerandoPesquisa?'not-allowed':'pointer',fontSize:9,fontWeight:900 }}>
                        {gerandoPesquisa?<Loader2 style={{ width:11,height:11,animation:'spin 1s linear infinite' }}/>:<Sparkles style={{ width:11,height:11 }}/>}
                        Pesquisa IA
                      </button>
                    </>)}
                    <button disabled={rodando} onClick={()=>{
                      const ids=itens.filter(i=>selecionados.has(i.id)).map(i=>({mlbId:i.mlbId,url:i.url}));
                      if(!ids.length)return;
                      setItens(prev=>prev.map(it=>selecionados.has(it.id)?{...it,status:'pendente',dados:null,erro:null}:it));
                      setSelecionados(new Set()); executarFila(ids);
                    }} style={{ display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:'#2563eb',color:'#fff',border:'none',cursor:rodando?'not-allowed':'pointer',fontSize:9,fontWeight:900,opacity:rodando?0.5:1 }}>
                      <RefreshCw style={{ width:11,height:11 }}/>Re-pesquisar
                    </button>
                    <button onClick={()=>{[...selecionados].forEach(id=>removerItem(id));}} style={{ display:'flex',padding:3,background:'none',border:'none',cursor:'pointer',color:'#ef4444' }}><Trash2 style={{ width:12,height:12 }}/></button>
                  </div>
                )}
              </div>
              <div style={{ flex:1,overflowY:'auto',maxHeight:'calc(76vh - 56px)' }}>
                {itensFiltrados.length===0
                  ?<div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:14,padding:36,display:'flex',flexDirection:'column',alignItems:'center',gap:8 }}><Filter style={{ width:28,height:28,color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3 }}>Nenhum item</p></div>
                  :<div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:8 }}>
                    {itensFiltrados.map(item=>(
                      <CardResultado key={item.id} item={item} onRemover={removerItem} selecionado={selecionados.has(item.id)} onSel={toggleSel} onAbrirModal={setModalAberto}/>
                    ))}
                  </div>}
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ── ABAS HISTÓRICO / ARQUIVADOS ───────────────────────────────────── */}
      {(aba==='historico'||aba==='arquivados') && (
        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
          {aba==='historico' && (
            <div style={{ display:'flex',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:3,gap:2,width:'fit-content' }}>
              {[{k:'itens',l:`Itens (${historico.length})`},{k:'analises',l:`Análises de Mercado (${analisesMercado.length})`}].map(({k,l})=>(
                <button key={k} onClick={()=>setSubAbaHist(k)}
                  style={{ padding:'6px 14px',borderRadius:8,fontSize:10,fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:subAbaHist===k?'var(--theme-header)':'transparent',color:subAbaHist===k?'#FFE600':'var(--theme-text)',opacity:subAbaHist===k?1:0.5,whiteSpace:'nowrap' }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:12,padding:'8px 12px',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
            {(aba==='arquivados'||subAbaHist==='itens') && (
              <button onClick={()=>{const lista=aba==='historico'?historico:arquivados;if(selHist.size===lista.length&&lista.length>0) setSelHist(new Set()); else setSelHist(new Set(lista.map(i=>i.id)));}}
                style={{ color:selHist.size>0?'#3b82f6':'var(--theme-text)',opacity:selHist.size>0?1:0.4,background:'none',border:'none',cursor:'pointer',padding:0,display:'flex' }}>
                {selHist.size>0?<CheckSquare style={{ width:14,height:14,color:'#3b82f6' }}/>:<Square style={{ width:14,height:14 }}/>}
              </button>
            )}
            <button onClick={()=>buscarHistorico(aba==='arquivados')} style={btnBase}><RefreshCw style={{ width:12,height:12 }}/></button>
            <p style={{ fontSize:11,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.5 }}>
              {aba==='historico'&&subAbaHist==='itens'?`${historico.length} pesquisa(s)`:aba==='historico'&&subAbaHist==='analises'?`${analisesMercado.length} análise(s)`:`${arquivados.length} arquivado(s)`}
            </p>
            {selHist.size>0&&(aba==='arquivados'||subAbaHist==='itens')&&(
              <div style={{ marginLeft:'auto',display:'flex',gap:5,alignItems:'center',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'4px 10px' }}>
                <span style={{ fontSize:9,fontWeight:900,color:'#1d4ed8' }}>{selHist.size} sel.</span>
                {aba==='historico'&&<button onClick={()=>acaoLoteHist('arquivar')} style={{ display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:9,fontWeight:900,cursor:'pointer' }}><Archive style={{ width:11,height:11 }}/>Arquivar</button>}
                {aba==='arquivados'&&<button onClick={()=>{[...selHist].forEach(id=>restaurarHist(id));setSelHist(new Set());}} style={{ display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#15803d',fontSize:9,fontWeight:900,cursor:'pointer' }}><ArchiveRestore style={{ width:11,height:11 }}/>Restaurar</button>}
                <button onClick={()=>acaoLoteHist('excluir')} style={{ display:'flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:6,background:'#fee2e2',border:'1px solid #fca5a5',color:'#dc2626',fontSize:9,fontWeight:900,cursor:'pointer' }}><Trash2 style={{ width:11,height:11 }}/>Excluir</button>
              </div>
            )}
          </div>

          <div style={{ minHeight:200 }}>
            {loadingHist
              ?<div style={{ display:'flex',justifyContent:'center',padding:36 }}><Loader2 style={{ width:24,height:24,animation:'spin 1s linear infinite',color:'#94a3b8' }}/></div>
              :(() => {
                  if (aba==='historico'&&subAbaHist==='analises') {
                    if (!analisesMercado.length) return (
                      <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:14,padding:36,display:'flex',flexDirection:'column',alignItems:'center',gap:8,textAlign:'center' }}>
                        <Sparkles style={{ width:32,height:32,color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:12,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3 }}>Nenhuma análise de mercado salva</p>
                      </div>
                    );
                    return <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                      {analisesMercado.map(item=>(
                        <CardAnalise key={item.id} item={item} sel={false} onSel={()=>{}} onExcluir={excluirAnalise} onVer={it=>setAnaliseVista(it)}/>
                      ))}
                    </div>;
                  }
                  const lista=aba==='historico'?historico:arquivados;
                  if (!lista.length) return (
                    <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:14,padding:36,display:'flex',flexDirection:'column',alignItems:'center',gap:8,textAlign:'center' }}>
                      <History style={{ width:32,height:32,color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:12,fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3 }}>{aba==='historico'?'Nenhuma pesquisa ainda':'Nenhum arquivado'}</p>
                    </div>
                  );
                  return <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                    {lista.map(item=>(
                      <CardHistorico key={item.id} item={item} sel={selHist.has(item.id)}
                        onSel={id=>setSelHist(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;})}
                        onArquivar={arquivarHist} onRestaurar={restaurarHist}
                        onExcluir={excluirHist} onExcluirDef={excluirDefHist}
                        onRecarregar={recarregarDoHistorico}/>
                    ))}
                  </div>;
              })()}
          </div>
        </div>
      )}

      {/* Modais */}
      {showComparador && <ModalComparador itens={itens.filter(i=>selecionados.has(i.id))} onClose={()=>setShowComparador(false)}/>}
      {modalAberto    && <ModalAnuncio item={modalAberto} onClose={()=>setModalAberto(null)}/>}

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

      {/* Modal ver análise salva */}
      {analiseVista && (
        <Portal>
          <div onClick={()=>setAnaliseVista(null)} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ width:720,maxWidth:'96vw',maxHeight:'90vh',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:20,overflow:'hidden',display:'flex',flexDirection:'column',color:'var(--theme-text)' }}>
              <div style={{ padding:'14px 20px',background:'var(--theme-header)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:12 }}><AnalyizStar size={28} active={false} dark={true}/><div><p style={{ fontSize:14,fontWeight:900,color:'#fff' }}>{analiseVista.titulo}</p><p style={{ fontSize:10,color:'rgba(255,255,255,0.4)' }}>{fmtDate(analiseVista.createdAt)}</p></div></div>
                <button onClick={()=>setAnaliseVista(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.4)' }}><X style={{ width:20,height:20 }}/></button>
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:20 }} className="ia-scroll">
                <RelatorioTopicos html={analiseVista.conteudoHtml}/>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}