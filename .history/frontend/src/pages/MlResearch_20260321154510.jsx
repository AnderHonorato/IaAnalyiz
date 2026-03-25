// src/pages/MlResearch.jsx — v6
// Fix: cards compactos sem overflow, preços visíveis
// Modal grande com "Outras opções de compra" para catálogo/full

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  XCircle, Clock, ShoppingBag, Star, TrendingUp, TrendingDown, Package,
  Download, Zap, ArrowLeft, Users, Activity, Filter, X, Medal, Award,
  Archive, ArchiveRestore, History, CheckSquare, Square, Eye,
  DollarSign, Scale, Tag, Percent, BarChart2, ChevronDown,
} from 'lucide-react';

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

// ── Portal ────────────────────────────────────────────────────────────────────
function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

// ══════════════════════════════════════════════════════════════════════════════
// MODAL DETALHES — com seção de "Outras opções de compra"
// ══════════════════════════════════════════════════════════════════════════════
function ModalAnuncio({ item, onClose }) {
  const [tab, setTab] = useState('vendedores');
  if (!item) return null;
  const d    = item.dados;
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const conc = d?.concorrentes || [];
  const linkUrl = d?.link || (item.url?.startsWith('http') ? item.url : `https://www.mercadolivre.com.br/p/${item.mlbId}`);
  const menorPreco = conc.length ? Math.min(...conc.map(c=>c.preco).filter(v=>v>0)) : null;
  const ehCatalogo = d?.ehCatalogo || d?.fonte === 'products' || d?.fonte === 'products+catalog';

  const tabs = [
    { k:'vendedores', l: ehCatalogo ? `Opções de Compra (${conc.length})` : `Concorrentes (${conc.length})` },
    { k:'info',       l:'Informações' },
    { k:'ficha',      l:`Ficha Técnica (${(d?.atributos||[]).length})` },
  ];

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.82)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:'860px',maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',borderRadius:'20px',boxShadow:'0 30px 80px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column',overflow:'hidden' }}>

          {/* Header */}
          <div style={{ background:'var(--theme-header)',padding:'16px 20px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'flex-start',gap:'12px',minWidth:0 }}>
              {d?.thumbnail && <img src={d.thumbnail} alt="" style={{ width:'52px',height:'52px',borderRadius:'10px',objectFit:'cover',border:'1px solid rgba(255,255,255,0.2)',flexShrink:0 }} />}
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'6px' }}>
                  <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'9px',fontWeight:900,textTransform:'uppercase',padding:'2px 8px',borderRadius:'20px',background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}` }}>
                    <cfg.Icon style={{ width:'10px',height:'10px' }} />{cfg.label}
                  </span>
                  <span style={{ fontSize:'9px',fontFamily:'monospace',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.1)',padding:'2px 6px',borderRadius:'4px' }}>{item.mlbId}</span>
                  {d?.fonte && <span style={{ fontSize:'8px',fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.1)',padding:'2px 6px',borderRadius:'4px' }}>{d.fonte}</span>}
                  {ehCatalogo && <span style={{ fontSize:'8px',fontWeight:900,textTransform:'uppercase',color:'#93c5fd',background:'rgba(59,130,246,0.2)',border:'1px solid rgba(147,197,253,0.3)',padding:'2px 6px',borderRadius:'4px' }}>CATÁLOGO</span>}
                </div>
                <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'15px',fontWeight:900,color:'#fff',display:'block',textDecoration:'none',marginBottom:'4px',lineHeight:1.3 }}>
                  {d?.titulo || urlShort(item.url || linkUrl)}
                </a>
                <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'10px',color:'#93c5fd',display:'flex',alignItems:'center',gap:'4px',textDecoration:'none' }}>
                  <ExternalLink style={{ width:'12px',height:'12px' }} />{urlShort(item.url || linkUrl)}
                </a>
              </div>
            </div>
            <button onClick={onClose} style={{ color:'rgba(255,255,255,0.4)',background:'none',border:'none',cursor:'pointer',flexShrink:0 }}><X style={{ width:'20px',height:'20px' }} /></button>
          </div>

          {/* Stats rápidos */}
          {d && (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid var(--theme-card-border)',flexShrink:0 }}>
              {[
                { l:'Preço Ref.',   v:fmt(d.preco),      c:'#10b981' },
                { l:'Menor preço',  v:fmt(d.precoMin ?? menorPreco ?? d.preco), c:'#3b82f6' },
                { l:'Preço médio',  v:fmt(d.precoMedio),  c:'#f59e0b' },
                { l:'Vendedores',   v:d.totalVendedores || conc.length || 1, c:'#8b5cf6' },
              ].map(({ l, v, c }, i) => (
                <div key={l} style={{ display:'flex',flexDirection:'column',padding:'12px 16px',borderRight:i<3?'1px solid var(--theme-card-border)':'none' }}>
                  <span style={{ fontSize:'18px',fontWeight:900,color:c,lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:'10px',fontWeight:700,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:'3px' }}>{l}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex',borderBottom:'1px solid var(--theme-card-border)',padding:'0 16px',flexShrink:0,background:'var(--theme-sidebar)' }}>
            {tabs.map(({ k, l }) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding:'10px 14px',fontSize:'11px',fontWeight:900,textTransform:'uppercase',borderBottom:`2px solid ${tab===k?'var(--theme-accent)':'transparent'}`,color:tab===k?'var(--theme-accent)':'var(--theme-text)',background:'none',border:'none',borderBottom:`2px solid ${tab===k?'var(--theme-accent)':'transparent'}`,cursor:'pointer',opacity:tab===k?1:0.5,whiteSpace:'nowrap' }}>
                {l}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          <div style={{ flex:1,overflowY:'auto',padding:'16px' }}>

            {/* ABA VENDEDORES / OPÇÕES DE COMPRA */}
            {tab === 'vendedores' && (
              <>
                {/* Vendedor principal */}
                {d?.seller && (
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:'12px',padding:'12px 16px',border:'1px solid var(--theme-card-border)',marginBottom:'12px',display:'flex',alignItems:'center',gap:'12px' }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:'4px',display:'flex',alignItems:'center',gap:'4px' }}><Users style={{ width:'12px',height:'12px' }} />Vendedor principal</p>
                      <p style={{ fontSize:'16px',fontWeight:900,color:'var(--theme-text)' }}>{d.seller.nome}</p>
                      {d.seller.reputacao && <p style={{ fontSize:'11px',opacity:0.5,textTransform:'capitalize',marginTop:'2px' }}>{d.seller.reputacao}</p>}
                    </div>
                    {d.seller.vendas != null && (
                      <div style={{ textAlign:'right' }}>
                        <p style={{ fontSize:'20px',fontWeight:900,color:'#6366f1' }}>{(d.seller.vendas||0).toLocaleString('pt-BR')}</p>
                        <p style={{ fontSize:'10px',opacity:0.4 }}>vendas</p>
                      </div>
                    )}
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:'22px',fontWeight:900,color:'#10b981' }}>{fmt(d.preco)}</p>
                      {d.freteGratis && <p style={{ fontSize:'10px',color:'#10b981',fontWeight:700 }}>✓ Frete grátis</p>}
                    </div>
                  </div>
                )}

                {/* Lista de opções / concorrentes */}
                {conc.length > 0 ? (
                  <>
                    <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:'8px',display:'flex',alignItems:'center',gap:'4px' }}>
                      {ehCatalogo ? <><Tag style={{ width:'12px',height:'12px' }} />Outras opções de compra</> : <><Users style={{ width:'12px',height:'12px' }} />Concorrentes</>}
                    </p>
                    <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
                      {conc.map((c, i) => {
                        const abaixoPrincipal = d?.preco && c.preco < d.preco;
                        const acimaPrincipal  = d?.preco && c.preco > d.preco;
                        const eMenorGeral     = c.preco === menorPreco && i === 0;
                        return (
                          <div key={i} style={{ background:eMenorGeral?'#f0fdf4':abaixoPrincipal?'#fef2f2':'var(--theme-sidebar)',border:`1px solid ${eMenorGeral?'#86efac':abaixoPrincipal?'#fca5a5':'var(--theme-card-border)'}`,borderRadius:'12px',padding:'10px 14px',display:'flex',alignItems:'center',gap:'10px' }}>
                            {/* Ranking */}
                            <div style={{ width:'28px',textAlign:'center',flexShrink:0 }}>
                              {i===0 ? <Medal style={{ width:'16px',height:'16px',color:'#f59e0b',margin:'0 auto' }} />
                                : i===1 ? <Award style={{ width:'16px',height:'16px',color:'#94a3b8',margin:'0 auto' }} />
                                : <span style={{ fontSize:'12px',fontWeight:900,opacity:0.4 }}>{i+1}</span>}
                            </div>

                            {/* Thumb */}
                            {c.thumbnail && <img src={c.thumbnail} alt="" style={{ width:'36px',height:'36px',borderRadius:'8px',objectFit:'cover',border:'1px solid var(--theme-card-border)',flexShrink:0 }} />}

                            {/* Info */}
                            <div style={{ flex:1,minWidth:0 }}>
                              <p style={{ fontSize:'13px',fontWeight:700,color:'var(--theme-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.nome || c.titulo || '—'}</p>
                              {c.titulo && c.nome && c.nome !== c.titulo && (
                                <p style={{ fontSize:'10px',opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{c.titulo}</p>
                              )}
                              <div style={{ display:'flex',alignItems:'center',gap:'8px',marginTop:'3px',flexWrap:'wrap' }}>
                                {c.tipoAnuncio && <span style={{ fontSize:'8px',fontWeight:900,textTransform:'uppercase',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',padding:'1px 6px',borderRadius:'4px',opacity:0.7 }}>{c.tipoAnuncio}</span>}
                                {c.freteGratis && <span style={{ fontSize:'9px',fontWeight:700,color:'#10b981' }}>✓ Frete grátis</span>}
                                {c.estoque != null && <span style={{ fontSize:'9px',opacity:0.5 }}>{c.estoque} un</span>}
                                {c.vendidos != null && <span style={{ fontSize:'9px',color:'#6366f1',fontWeight:700 }}>{c.vendidos} vendidos</span>}
                              </div>
                            </div>

                            {/* Preço + desconto */}
                            <div style={{ textAlign:'right',flexShrink:0,minWidth:'100px' }}>
                              {c.precoOriginal && c.precoOriginal > c.preco && (
                                <p style={{ fontSize:'10px',textDecoration:'line-through',opacity:0.4 }}>{fmt(c.precoOriginal)}</p>
                              )}
                              <p style={{ fontSize:'18px',fontWeight:900,color:eMenorGeral?'#059669':abaixoPrincipal?'#dc2626':acimaPrincipal?'#10b981':'var(--theme-text)',display:'flex',alignItems:'center',gap:'4px',justifyContent:'flex-end' }}>
                                {fmt(c.preco)}
                                {abaixoPrincipal && <TrendingDown style={{ width:'14px',height:'14px' }} />}
                                {acimaPrincipal  && <TrendingUp   style={{ width:'14px',height:'14px' }} />}
                              </p>
                              {c.desconto && (
                                <span style={{ fontSize:'10px',fontWeight:900,color:'#059669',background:'#dcfce7',border:'1px solid #86efac',padding:'1px 6px',borderRadius:'20px',display:'inline-flex',alignItems:'center',gap:'3px' }}>
                                  <Percent style={{ width:'9px',height:'9px' }} />{c.desconto}
                                </span>
                              )}
                              {c.link && (
                                <a href={c.link} target="_blank" rel="noopener noreferrer"
                                  style={{ display:'inline-flex',alignItems:'center',gap:'4px',marginTop:'6px',padding:'4px 10px',borderRadius:'8px',background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8',fontSize:'10px',fontWeight:900,textTransform:'uppercase',textDecoration:'none' }}>
                                  <ExternalLink style={{ width:'11px',height:'11px' }} />Ver anúncio
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:'12px',padding:'24px',border:'1px solid var(--theme-card-border)',textAlign:'center' }}>
                    <Users style={{ width:'28px',height:'28px',margin:'0 auto 8px',opacity:0.2 }} />
                    <p style={{ fontSize:'12px',fontWeight:900,textTransform:'uppercase',opacity:0.4 }}>
                      {ehCatalogo ? 'Nenhuma opção de compra encontrada' : 'Nenhum concorrente encontrado'}
                    </p>
                    <p style={{ fontSize:'10px',opacity:0.25,marginTop:'4px' }}>Tente novamente ou verifique o link</p>
                  </div>
                )}
              </>
            )}

            {/* ABA INFO */}
            {tab === 'info' && (
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px' }}>
                {[
                  { title:'Dados do Anúncio', rows:[['ID',item.mlbId],['Condição',d?.condicao||'—'],['Tipo',d?.tipoAnuncio||'—'],['Catálogo',d?.ehCatalogo?'Sim':'Não'],['Status',d?.status||'—'],['Estoque',d?.estoque!=null?`${d.estoque} un`:'—'],['Vendidos',d?.vendidos!=null?d.vendidos:'—'],['Avaliação',d?.avaliacoes?`${d.avaliacoes} ★`:'—']] },
                  { title:'Frete & Entrega', rows:[['Frete',d?.freteGratis?'✅ Grátis':(d?.frete||'—')],['Fonte de dados',d?.fonte||'—'],['Analisado',fmtDate(d?.analisadoEm)]] },
                ].map(({ title, rows }) => (
                  <div key={title}>
                    <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:'10px' }}>{title}</p>
                    {rows.filter(([,v])=>v&&v!=='—'&&v!=null).map(([k,v]) => (
                      <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--theme-card-border)',fontSize:'13px' }}>
                        <span style={{ opacity:0.5 }}>{k}</span>
                        <span style={{ fontWeight:700,maxWidth:'200px',textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ABA FICHA */}
            {tab === 'ficha' && (
              (d?.atributos||[]).length === 0
                ? <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'32px',gap:'8px',opacity:0.3 }}><Package style={{ width:'32px',height:'32px' }} /><p style={{ fontSize:'11px',fontWeight:900,textTransform:'uppercase' }}>Sem ficha técnica</p></div>
                : <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px' }}>
                    {d.atributos.map((a, i) => (
                      <div key={i} style={{ display:'flex',justifyContent:'space-between',background:'var(--theme-sidebar)',padding:'8px 12px',borderRadius:'8px',fontSize:'13px',border:'1px solid var(--theme-card-border)' }}>
                        <span style={{ opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.nome}</span>
                        <span style={{ fontWeight:700,marginLeft:'8px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.valor}</span>
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

// ══════════════════════════════════════════════════════════════════════════════
// CARD COMPACTO — layout fixo, sem overflow de preços
// ══════════════════════════════════════════════════════════════════════════════
function CardResultado({ item, onRemover, selecionado, onSel, onAbrirModal }) {
  const cfg     = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const d       = item.dados;
  const linkUrl = d?.link || (item.url?.startsWith('http') ? item.url : `https://www.mercadolivre.com.br/p/${item.mlbId}`);
  const abaixo  = d?.preco && d?.precoMedio && d.preco < d.precoMedio;

  return (
    <div style={{
      background:'var(--theme-card)',
      border:`1px solid ${selecionado?'#60a5fa':'var(--theme-card-border)'}`,
      borderRadius:'12px',
      overflow:'hidden',
      boxShadow:selecionado?'0 0 0 2px #3b82f6':undefined,
    }}>
      {/* Barra de status no topo */}
      <div style={{ height:'2px', ...(item.status==='analisando'?{backgroundImage:'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)',backgroundSize:'200%',animation:'slideGrad 1.5s linear infinite'}:{backgroundColor:cfg.barColor||'#94a3b8'}) }} />

      <div style={{ padding:'10px 12px' }}>
        {/* Linha principal: checkbox + thumb + info + ações */}
        <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>

          {/* Checkbox */}
          <button onClick={() => onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',padding:'0',color:selecionado?'#3b82f6':'var(--theme-text)',opacity:selecionado?1:0.3 }}>
            {selecionado ? <CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }} /> : <Square style={{ width:'14px',height:'14px' }} />}
          </button>

          {/* Thumb 36×36 */}
          <div style={{ width:'36px',height:'36px',borderRadius:'8px',overflow:'hidden',border:'1px solid var(--theme-card-border)',flexShrink:0,background:'var(--theme-sidebar)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            {d?.thumbnail ? <img src={d.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : <ShoppingBag style={{ width:'16px',height:'16px',color:'var(--theme-text)',opacity:0.2 }} />}
          </div>

          {/* Info — flex:1 com overflow escondido */}
          <div style={{ flex:1,minWidth:0,overflow:'hidden' }}>
            <div style={{ display:'flex',alignItems:'center',gap:'4px',flexWrap:'wrap',marginBottom:'3px' }}>
              <span style={{ display:'inline-flex',alignItems:'center',gap:'3px',fontSize:'8px',fontWeight:900,textTransform:'uppercase',padding:'1px 6px',borderRadius:'20px',background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,flexShrink:0 }}>
                <cfg.Icon style={{ width:'9px',height:'9px', ...(item.status==='analisando'?{animation:'spin 1s linear infinite'}:{}) }} />{cfg.label}
              </span>
              <span style={{ fontSize:'8px',fontFamily:'monospace',color:'var(--theme-text)',opacity:0.4,flexShrink:0 }}>{item.mlbId}</span>
              {d?.fonte && <span style={{ fontSize:'7px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3,background:'var(--theme-sidebar)',padding:'1px 5px',borderRadius:'4px',flexShrink:0 }}>{d.fonte}</span>}
            </div>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:'12px',fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:'none' }}>
              {d?.titulo || urlShort(item.url || linkUrl)}
            </a>
            {item.status === 'erro' && <p style={{ fontSize:'10px',color:'#ef4444',marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.erro}</p>}
          </div>

          {/* Ações */}
          <div style={{ display:'flex',alignItems:'center',gap:'4px',flexShrink:0 }}>
            {(item.status === 'concluido' || item.status === 'erro') && (
              <button onClick={() => onAbrirModal(item)}
                style={{ padding:'5px',borderRadius:'7px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',cursor:'pointer',display:'flex' }}>
                <Eye style={{ width:'13px',height:'13px' }} />
              </button>
            )}
            <button onClick={() => onRemover(item.id)}
              style={{ padding:'5px',borderRadius:'7px',background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}>
              <Trash2 style={{ width:'13px',height:'13px' }} />
            </button>
          </div>
        </div>

        {/* Métricas — 3 cols com texto que NÃO vaza */}
        {item.status === 'concluido' && d && (
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'5px',marginTop:'8px' }}>
            {[
              { v: fmt(d.preco),      l:'Preço',   c:'var(--theme-text)' },
              { v: fmt(d.precoMedio), l:'Média',   c: abaixo ? '#10b981' : '#f59e0b' },
              { v: d.totalVendedores || (d.concorrentes?.length||0)+1, l:'Vend.', c:'#3b82f6' },
            ].map(({ v, l, c }) => (
              <div key={l} style={{ background:'var(--theme-sidebar)',borderRadius:'7px',padding:'5px 6px',textAlign:'center',border:'1px solid var(--theme-card-border)',overflow:'hidden',minWidth:0 }}>
                {/* Texto com tamanho fixo e overflow escondido */}
                <p style={{ fontSize:'11px',fontWeight:900,color:c,lineHeight:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v}</p>
                <p style={{ fontSize:'8px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:'2px' }}>{l}</p>
              </div>
            ))}
          </div>
        )}

        {item.status === 'analisando' && (
          <div style={{ display:'flex',alignItems:'center',gap:'6px',marginTop:'6px',fontSize:'10px',color:'#3b82f6' }}>
            <Loader2 style={{ width:'11px',height:'11px',flexShrink:0,animation:'spin 1s linear infinite' }} />
            <span style={{ opacity:0.7 }}>Buscando estratégias...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card histórico ─────────────────────────────────────────────────────────────
function CardHistorico({ item, sel, onSel, onArquivar, onRestaurar, onExcluir, onExcluirDef, onRecarregar }) {
  return (
    <div style={{ background:sel?'rgba(59,130,246,0.06)':'var(--theme-card)',border:`1px solid ${sel?'#93c5fd':'var(--theme-card-border)'}`,borderRadius:'11px',padding:'10px 12px',display:'flex',alignItems:'center',gap:'10px',color:'var(--theme-text)' }}>
      <button onClick={() => onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',color:sel?'#3b82f6':'var(--theme-text)',opacity:sel?1:0.3 }}>
        {sel ? <CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }} /> : <Square style={{ width:'14px',height:'14px' }} />}
      </button>
      {item.thumbnail ? <img src={item.thumbnail} alt="" style={{ width:'36px',height:'36px',borderRadius:'8px',objectFit:'cover',border:'1px solid var(--theme-card-border)',flexShrink:0 }} />
        : <div style={{ width:'36px',height:'36px',background:'var(--theme-sidebar)',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}><ShoppingBag style={{ width:'16px',height:'16px',opacity:0.2 }} /></div>}
      <div style={{ flex:1,minWidth:0 }}>
        {item.titulo
          ? <a href={item.urlOriginal} target="_blank" rel="noopener noreferrer" style={{ fontSize:'12px',fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:'none' }}>{item.titulo}</a>
          : <span style={{ fontSize:'12px',fontWeight:700,color:'#ef4444',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.erro||'Erro na pesquisa'}</span>}
        <div style={{ display:'flex',alignItems:'center',gap:'8px',marginTop:'2px',flexWrap:'wrap' }}>
          <span style={{ fontSize:'9px',fontFamily:'monospace',opacity:0.4 }}>{item.mlbId}</span>
          {item.preco && <span style={{ fontSize:'9px',fontWeight:900,color:'#10b981' }}>{fmt(item.preco)}</span>}
          <span style={{ fontSize:'9px',opacity:0.4 }}>{fmtDate(item.updatedAt)}</span>
          {item.arquivado && <span style={{ fontSize:'8px',fontWeight:900,opacity:0.4,background:'var(--theme-sidebar)',padding:'1px 5px',borderRadius:'4px',textTransform:'uppercase' }}>Arquivado</span>}
        </div>
      </div>
      <div style={{ display:'flex',gap:'4px',flexShrink:0 }}>
        <button onClick={() => onRecarregar(item)} style={{ padding:'5px',borderRadius:'7px',background:'#eff6ff',border:'1px solid #bfdbfe',color:'#2563eb',cursor:'pointer',display:'flex' }}><RefreshCw style={{ width:'11px',height:'11px' }} /></button>
        {item.arquivado
          ? <button onClick={() => onRestaurar(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#16a34a',cursor:'pointer',display:'flex' }}><ArchiveRestore style={{ width:'11px',height:'11px' }} /></button>
          : <button onClick={() => onArquivar(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',cursor:'pointer',display:'flex',color:'var(--theme-text)' }}><Archive style={{ width:'11px',height:'11px' }} /></button>}
        <button onClick={() => onExcluir(item.id)}    style={{ padding:'5px',borderRadius:'7px',background:'#fef3c7',border:'1px solid #fde68a',color:'#b45309',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:'11px',height:'11px' }} /></button>
        <button onClick={() => onExcluirDef(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><XCircle style={{ width:'11px',height:'11px' }} /></button>
      </div>
    </div>
  );
}

// ── Resumo geral compacto ─────────────────────────────────────────────────────
function ResumoGeral({ itens }) {
  const ok     = itens.filter(i => i.status === 'concluido');
  if (!ok.length) return null;
  const precos = ok.map(i => i.dados?.preco).filter(Boolean);
  const totalV = ok.reduce((s, i) => s + (i.dados?.totalVendedores||0), 0);
  return (
    <div style={{ background:'linear-gradient(135deg,#0f172a,#1e293b)',borderRadius:'10px',padding:'7px 14px',color:'#fff',marginBottom:'6px',display:'flex',alignItems:'center',gap:'18px',flexWrap:'wrap' }}>
      <span style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.3)',letterSpacing:'0.1em',flexShrink:0 }}>Sessão</span>
      {[
        { v:ok.length,                                                           l:'anúncios', c:'#fff' },
        { v:precos.length ? fmt(Math.min(...precos)) : '—',                      l:'menor',    c:'#6ee7b7' },
        { v:precos.length ? fmt(precos.reduce((s,v)=>s+v,0)/precos.length):'—', l:'média',    c:'#fcd34d' },
        { v:totalV,                                                               l:'vendedores',c:'#93c5fd' },
      ].map(({ v, l, c }) => (
        <div key={l} style={{ display:'flex',alignItems:'baseline',gap:'4px' }}>
          <span style={{ fontSize:'13px',fontWeight:900,color:c }}>{v}</span>
          <span style={{ fontSize:'9px',textTransform:'uppercase',color:'rgba(255,255,255,0.3)' }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL COMPARADOR DE PREÇOS
// ══════════════════════════════════════════════════════════════════════════════
function ModalComparador({ itens, userId, onClose }) {
  const concluidos = itens.filter(i => i.status === 'concluido' && i.dados);

  // Identifica anúncios do próprio usuário via mlUserId no token (aproximação: seller.id)
  // O usuário pode marcar qual é o "meu anúncio" manualmente
  const [meuId, setMeuId] = useState(null);

  if (!concluidos.length) return null;

  // Coleta todos os vendedores de todos os anúncios
  const todasOpcoes = [];
  concluidos.forEach(item => {
    const d = item.dados;
    // Vendedor principal do item
    if (d.seller?.nome && d.preco > 0) {
      todasOpcoes.push({
        mlbId:       item.mlbId,
        anuncioId:   item.id,
        titulo:      d.titulo || item.mlbId,
        vendedor:    d.seller.nome,
        preco:       d.preco,
        freteGratis: d.freteGratis,
        link:        d.link,
        thumbnail:   d.thumbnail,
        vendidos:    d.vendidos,
        estoque:     d.estoque,
        reputacao:   d.seller.reputacao,
        ehPrincipal: true,
        tipoAnuncio: d.tipoAnuncio,
        ehCatalogo:  d.ehCatalogo,
      });
    }
    // Concorrentes/opções do catálogo
    (d.concorrentes || []).forEach(c => {
      if (c.preco > 0) {
        todasOpcoes.push({
          mlbId:       c.mlbId || item.mlbId,
          anuncioId:   item.id,
          titulo:      c.titulo || d.titulo || item.mlbId,
          vendedor:    c.nome,
          preco:       c.preco,
          precoOriginal: c.precoOriginal,
          desconto:    c.desconto,
          freteGratis: c.freteGratis,
          link:        c.link,
          thumbnail:   c.thumbnail || d.thumbnail,
          vendidos:    c.vendidos,
          estoque:     c.estoque,
          reputacao:   null,
          tipoAnuncio: c.tipoAnuncio,
          ehPrincipal: false,
          ehCatalogo:  d.ehCatalogo,
        });
      }
    });
  });

  // Ordena por preço crescente
  todasOpcoes.sort((a, b) => a.preco - b.preco);

  const menorPreco  = todasOpcoes.length ? todasOpcoes[0].preco : 0;
  const maiorPreco  = todasOpcoes.length ? todasOpcoes[todasOpcoes.length-1].preco : 0;
  const mediaPreco  = todasOpcoes.length ? todasOpcoes.reduce((s,o) => s+o.preco,0) / todasOpcoes.length : 0;
  const meuAnuncio  = meuId ? todasOpcoes.find(o => o.vendedor === meuId || o.mlbId === meuId) : null;

  const vantagem = (opcao) => {
    if (!meuAnuncio || opcao.vendedor === meuAnuncio.vendedor) return null;
    const diff    = meuAnuncio.preco - opcao.preco;
    const pct     = Math.abs(diff / meuAnuncio.preco * 100).toFixed(1);
    if (diff > 0) return { tipo:'perda',  msg:`Você está ${pct}% mais caro`, diff };
    if (diff < 0) return { tipo:'ganho',  msg:`Você está ${pct}% mais barato`, diff };
    return { tipo:'igual', msg:'Mesmo preço', diff:0 };
  };

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.82)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:'900px',maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',borderRadius:'20px',boxShadow:'0 30px 80px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column',overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'16px 20px',background:'var(--theme-header)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:'10px' }}>
              <BarChart2 style={{ width:'20px',height:'20px',color:'#FFE600' }}/>
              <div>
                <p style={{ fontSize:'14px',fontWeight:900,color:'#fff' }}>Comparador de Preços</p>
                <p style={{ fontSize:'10px',color:'rgba(255,255,255,0.4)' }}>{todasOpcoes.length} opções de {concluidos.length} anúncio(s)</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.4)' }}><X style={{ width:'20px',height:'20px' }}/></button>
          </div>

          {/* Stats */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',borderBottom:'1px solid var(--theme-card-border)',flexShrink:0 }}>
            {[
              { l:'Menor preço', v:fmt(menorPreco), c:'#10b981' },
              { l:'Preço médio', v:fmt(mediaPreco), c:'#f59e0b' },
              { l:'Maior preço', v:fmt(maiorPreco), c:'#ef4444' },
            ].map(({l,v,c},i)=>(
              <div key={l} style={{ padding:'12px 16px',borderRight:i<2?'1px solid var(--theme-card-border)':'none' }}>
                <p style={{ fontSize:'20px',fontWeight:900,color:c }}>{v}</p>
                <p style={{ fontSize:'10px',fontWeight:700,textTransform:'uppercase',opacity:0.4,marginTop:'2px' }}>{l}</p>
              </div>
            ))}
          </div>

          {/* Selecionar meu anúncio */}
          <div style={{ padding:'10px 16px',borderBottom:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap',flexShrink:0 }}>
            <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.5,flexShrink:0 }}>Meu anúncio:</p>
            <div style={{ display:'flex',gap:'6px',flexWrap:'wrap' }}>
              {[...new Set(todasOpcoes.map(o=>o.vendedor))].slice(0,12).map(nome => (
                <button key={nome} onClick={() => setMeuId(meuId===nome?null:nome)}
                  style={{ padding:'4px 10px',borderRadius:'8px',border:`1px solid ${meuId===nome?'#3b82f6':'var(--theme-card-border)'}`,background:meuId===nome?'#eff6ff':'var(--theme-card)',color:meuId===nome?'#1d4ed8':'var(--theme-text)',fontSize:'10px',fontWeight:900,cursor:'pointer' }}>
                  {nome}
                </button>
              ))}
            </div>
            {meuAnuncio && (
              <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:'8px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'6px 12px' }}>
                <span style={{ fontSize:'10px',fontWeight:900,color:'#1d4ed8' }}>Seu preço:</span>
                <span style={{ fontSize:'16px',fontWeight:900,color:'#1d4ed8' }}>{fmt(meuAnuncio.preco)}</span>
                {meuAnuncio.preco === menorPreco
                  ? <span style={{ fontSize:'10px',fontWeight:900,color:'#059669',background:'#ecfdf5',border:'1px solid #a7f3d0',padding:'2px 8px',borderRadius:'20px' }}>🏆 Melhor preço!</span>
                  : <span style={{ fontSize:'10px',fontWeight:900,color:'#dc2626',background:'#fee2e2',border:'1px solid #fca5a5',padding:'2px 8px',borderRadius:'20px' }}>{((meuAnuncio.preco/menorPreco-1)*100).toFixed(1)}% acima do menor</span>}
              </div>
            )}
          </div>

          {/* Tabela comparativa */}
          <div style={{ flex:1,overflowY:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse' }}>
              <thead style={{ background:'var(--theme-sidebar)',position:'sticky',top:0 }}>
                <tr>
                  {['#','Anúncio','Vendedor','Preço','Frete','Vendidos','Estoque','Vantagem',''].map((h,i)=>(
                    <th key={i} style={{ padding:'8px 12px',fontSize:'9px',fontWeight:900,textTransform:'uppercase',opacity:0.5,textAlign:'left',borderBottom:'1px solid var(--theme-card-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {todasOpcoes.map((op, i) => {
                  const isMeu = meuId && (op.vendedor === meuId || op.mlbId === meuId);
                  const vant  = vantagem(op);
                  const rowBg = isMeu ? 'rgba(59,130,246,0.08)' : i===0 ? 'rgba(16,185,129,0.05)' : undefined;
                  const diff  = mediaPreco > 0 ? ((op.preco - menorPreco) / (maiorPreco - menorPreco || 1) * 100) : 0;
                  return (
                    <tr key={i} style={{ background:rowBg,borderBottom:'1px solid var(--theme-card-border)' }}>
                      <td style={{ padding:'10px 12px',width:'28px' }}>
                        {i===0 ? <Medal style={{ width:'14px',height:'14px',color:'#f59e0b' }}/>
                          : i===1 ? <Award style={{ width:'14px',height:'14px',color:'#94a3b8' }}/>
                          : <span style={{ fontSize:'11px',opacity:0.4,fontWeight:900 }}>{i+1}</span>}
                      </td>
                      <td style={{ padding:'10px 12px',maxWidth:'180px' }}>
                        <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
                          {op.thumbnail && <img src={op.thumbnail} alt="" style={{ width:'28px',height:'28px',borderRadius:'6px',objectFit:'cover',flexShrink:0 }}/>}
                          <p style={{ fontSize:'11px',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{op.titulo?.substring(0,35) || op.mlbId}</p>
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ fontSize:'12px',fontWeight:900,color:isMeu?'#1d4ed8':'var(--theme-text)' }}>{op.vendedor}</span>
                        {isMeu && <span style={{ display:'block',fontSize:'8px',fontWeight:900,color:'#1d4ed8',textTransform:'uppercase',marginTop:'1px' }}>◀ Você</span>}
                      </td>
                      <td style={{ padding:'10px 12px',minWidth:'110px' }}>
                        <p style={{ fontSize:'15px',fontWeight:900,color:i===0?'#10b981':isMeu?'#1d4ed8':'var(--theme-text)' }}>{fmt(op.preco)}</p>
                        {op.precoOriginal && op.precoOriginal > op.preco && (
                          <p style={{ fontSize:'10px',textDecoration:'line-through',opacity:0.4 }}>{fmt(op.precoOriginal)}</p>
                        )}
                        {op.desconto && <span style={{ fontSize:'9px',fontWeight:900,color:'#059669',background:'#ecfdf5',padding:'1px 5px',borderRadius:'20px' }}>{op.desconto}</span>}
                        {/* Barra de comparação */}
                        <div style={{ marginTop:'4px',height:'3px',borderRadius:'2px',background:'var(--theme-card-border)',width:'80px' }}>
                          <div style={{ height:'100%',borderRadius:'2px',width:`${100-diff}%`,background:i===0?'#10b981':isMeu?'#3b82f6':'#94a3b8',transition:'width 0.3s' }}/>
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px',fontSize:'12px',fontWeight:700,color:op.freteGratis?'#10b981':'var(--theme-text)' }}>
                        {op.freteGratis ? '✓ Grátis' : 'Pago'}
                      </td>
                      <td style={{ padding:'10px 12px',fontSize:'12px',color:'#6366f1',fontWeight:700 }}>{op.vendidos??'—'}</td>
                      <td style={{ padding:'10px 12px',fontSize:'12px',opacity:0.7 }}>{op.estoque??'—'}</td>
                      <td style={{ padding:'10px 12px',minWidth:'130px' }}>
                        {vant && !isMeu ? (
                          <span style={{ fontSize:'10px',fontWeight:900,color:vant.tipo==='ganho'?'#059669':vant.tipo==='igual'?'#d97706':'#dc2626',background:vant.tipo==='ganho'?'#ecfdf5':vant.tipo==='igual'?'#fef3c7':'#fee2e2',border:`1px solid ${vant.tipo==='ganho'?'#a7f3d0':vant.tipo==='igual'?'#fde68a':'#fca5a5'}`,padding:'3px 8px',borderRadius:'20px',display:'inline-block' }}>
                            {vant.msg}
                          </span>
                        ) : isMeu ? (
                          <span style={{ fontSize:'10px',fontWeight:900,color:'#1d4ed8',background:'#eff6ff',border:'1px solid #bfdbfe',padding:'3px 8px',borderRadius:'20px' }}>Seu anúncio</span>
                        ) : null}
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        {op.link && (
                          <a href={op.link} target="_blank" rel="noopener noreferrer"
                            style={{ display:'inline-flex',alignItems:'center',gap:'3px',padding:'4px 8px',borderRadius:'7px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'#3b82f6',fontSize:'9px',fontWeight:900,textDecoration:'none' }}>
                            <ExternalLink style={{ width:'10px',height:'10px' }}/>Ver
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding:'12px 16px',borderTop:'1px solid var(--theme-card-border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0 }}>
            <p style={{ fontSize:'10px',opacity:0.4 }}>Selecione um vendedor acima para ver a análise de vantagem comparativa</p>
            <button onClick={onClose} style={{ padding:'7px 16px',borderRadius:'10px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:'11px',fontWeight:900,cursor:'pointer' }}>Fechar</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function MlResearch() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const [aba,           setAba]          = useState('pesquisa');
  const [inputTexto,    setInputTexto]   = useState('');
  const [mostrarInput,  setMostrarInput] = useState(true);
  const [mlConectado,   setMlConectado]  = useState(false);
  const [rodando,       setRodando]      = useState(false);
  const [filtroStatus,  setFiltroStatus] = useState('todos');
  const [log,           setLog]          = useState([]);
  const [selecionados,  setSelecionados] = useState(new Set());
  const [modalAberto,   setModalAberto]  = useState(null);
  const [showComparador, setShowComparador] = useState(false);
  const [inputRef,      setInputRef]      = useState(null);

  const [itens, setItensRaw] = useState(() => { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : []; } catch { return []; } });
  const setItens = useCallback((fn) => {
    setItensRaw(prev => {
      const next    = typeof fn === 'function' ? fn(prev) : fn;
      const toSave  = next.map(i => i.status === 'analisando' ? { ...i, status:'pendente' } : i);
      try { localStorage.setItem(LS_KEY, JSON.stringify(toSave)); } catch {}
      return next;
    });
  }, []);

  const [historico,   setHistorico]   = useState([]);
  const [arquivados,  setArquivados]  = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [selHist,     setSelHist]     = useState(new Set());

  const rodandoRef = useRef(false);
  const abortRef   = useRef(false);
  const logEndRef  = useRef(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`).then(r=>r.json()).then(d=>setMlConectado(d.connected&&!d.expired)).catch(()=>{});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (aba === 'historico')  buscarHistorico(false);
    if (aba === 'arquivados') buscarHistorico(true);
  }, [aba, userId]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [log]);

  const addLog = useCallback((msg, tipo='info') => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setLog(prev => [...prev.slice(-100), { msg, tipo, ts }]);
  }, []);

  const buscarHistorico = useCallback(async (arq) => {
    if (!userId) return;
    setLoadingHist(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=${arq}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (arq) setArquivados(Array.isArray(data) ? data : []);
      else     setHistorico(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[Histórico]', e.message);
    }
    finally { setLoadingHist(false); }
  }, [userId]);

  const arquivarHist   = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/arquivar`,{method:'PUT'}); buscarHistorico(false); };
  const restaurarHist  = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/restaurar`,{method:'PUT'}); buscarHistorico(true); };
  const excluirHist    = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const excluirDefHist = async id => { if (!window.confirm('Excluir permanentemente?')) return; await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/definitivo`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const acaoLoteHist   = async (acao) => {
    const ids = [...selHist]; if (!ids.length) return;
    if (acao==='arquivar') await fetch(`${API_BASE_URL}/api/ml/research/historico/lote/arquivar`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    if (acao==='excluir')  await fetch(`${API_BASE_URL}/api/ml/research/historico/lote`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    setSelHist(new Set()); buscarHistorico(aba==='arquivados');
  };

  const recarregarDoHistorico = (item) => {
    setAba('pesquisa');
    setTimeout(() => {
      if (!item.mlbId) return;
      if (!itens.find(i => i.mlbId === item.mlbId)) {
        setItens(prev => [...prev, { id:`${item.mlbId}-${Date.now()}`,mlbId:item.mlbId,url:item.urlOriginal||item.mlbId,status:'pendente',dados:null,erro:null }]);
      }
      setMostrarInput(false);
    }, 100);
  };

  const processarInput = () => {
    if (!inputTexto.trim()) return;
    const linhas  = inputTexto.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
    const novos   = [];
    const jaExiste = new Set(itens.map(i => i.mlbId));
    for (const linha of linhas) {
      const mlbId = extrairMLBId(linha);
      if (!mlbId) { addLog(`⚠️ ID não encontrado: ${linha.substring(0,50)}`,'warn'); continue; }
      if (jaExiste.has(mlbId)) { addLog(`ℹ️ ${mlbId} já está na lista`); continue; }
      jaExiste.add(mlbId);
      novos.push({ id:`${mlbId}-${Date.now()}-${Math.random()}`,mlbId,url:linha,status:'pendente',dados:null,erro:null });
    }
    if (!novos.length) { addLog('Nenhum link válido.','warn'); return; }
    setItens(prev => [...prev, ...novos]);
    setInputTexto('');
    addLog(`✅ ${novos.length} anúncio(s) adicionados`,'success');
    setMostrarInput(false);
  };

  // Classifica linha de debug do backend para cor no terminal
  const tipoDebug = (linha) => {
    if (linha.startsWith('✅') || linha.startsWith('🎯')) return 'success';
    if (linha.startsWith('❌') || linha.startsWith('⚠️')) return 'warn';
    return 'info';
  };

  const buscarAnuncio = useCallback(async (mlbId, url) => {
    const params = new URLSearchParams({ userId });
    if (url) params.set('urlOriginal', encodeURIComponent(url));
    const res = await fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?${params}`, { signal: AbortSignal.timeout(45000) });
    const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json; // inclui json.debug[]
  }, [userId]);

  const executarFila = useCallback(async (ids) => {
    if (rodandoRef.current) return;
    rodandoRef.current = true; abortRef.current = false; setRodando(true);
    addLog(`🚀 Analisando ${ids.length} anúncio(s)...`, 'success');
    const retentar = [];

    for (let i = 0; i < ids.length; i++) {
      if (abortRef.current) break;
      const { mlbId, url } = ids[i];
      setItens(prev => prev.map(it => it.mlbId === mlbId ? { ...it, status: 'analisando' } : it));
      addLog(`── [${i+1}/${ids.length}] ${mlbId} ──────────────`);
      try {
        const dados = await buscarAnuncio(mlbId, url);

        // Exibe logs do backend no terminal
        if (Array.isArray(dados.debug)) {
          dados.debug.forEach(linha => addLog(`  ${linha}`, tipoDebug(linha)));
        }

        // Remove debug antes de salvar no state
        const { debug: _dbg, ...dadosSemDebug } = dados;
        setItens(prev => prev.map(it => it.mlbId === mlbId ? { ...it, status: 'concluido', dados: dadosSemDebug } : it));

        const numVend = dadosSemDebug.totalVendedores || (dadosSemDebug.concorrentes?.length||0) + 1;
        addLog(`✅ Concluído: ${numVend} vendedor(es) encontrado(s)`, 'success');
        if (i < ids.length - 1 && !abortRef.current) await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        const isTO = e.message.includes('timeout') || e.name === 'TimeoutError';
        if (isTO) {
          retentar.push({ mlbId, url });
          setItens(prev => prev.map(it => it.mlbId===mlbId ? { ...it, status:'fila', erro:'Re-tentativa pendente...' } : it));
          addLog(`⏳ ${mlbId}: timeout — vai re-tentar`, 'warn');
        } else {
          setItens(prev => prev.map(it => it.mlbId===mlbId ? { ...it, status:'erro', erro:e.message } : it));
          addLog(`❌ ${mlbId}: ${e.message}`, 'warn');
        }
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    if (retentar.length && !abortRef.current) {
      addLog(`🔄 Re-tentando ${retentar.length} item(s) em 5s...`);
      await new Promise(r => setTimeout(r, 5000));
      for (const { mlbId, url } of retentar) {
        if (abortRef.current) break;
        setItens(prev => prev.map(it => it.mlbId===mlbId ? { ...it, status:'analisando', erro:null } : it));
        addLog(`🔄 Re-tentando ${mlbId}...`);
        try {
          const dados = await buscarAnuncio(mlbId, url);
          if (Array.isArray(dados.debug)) dados.debug.forEach(l => addLog(`  ${l}`, tipoDebug(l)));
          const { debug: _d, ...dadosSemDebug } = dados;
          setItens(prev => prev.map(it => it.mlbId===mlbId ? { ...it, status:'concluido', dados:dadosSemDebug } : it));
          addLog(`✅ ${mlbId} OK`, 'success');
        } catch (e) {
          setItens(prev => prev.map(it => it.mlbId===mlbId ? { ...it, status:'erro', erro:e.message } : it));
          addLog(`❌ ${mlbId}: ${e.message}`, 'warn');
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    rodandoRef.current = false; setRodando(false); addLog('🎯 Análise concluída!', 'success');
  }, [buscarAnuncio, addLog]);

  const iniciarAnalise = () => { const ids = itens.filter(i => ['pendente','erro','fila'].includes(i.status)).map(i => ({ mlbId:i.mlbId, url:i.url })); if (ids.length) executarFila(ids); };
  const pararAnalise   = () => { abortRef.current = true; addLog('⏹ Interrompido','warn'); };
  const removerItem    = id => { setItens(prev => prev.filter(i => i.id !== id)); setSelecionados(prev => { const n=new Set(prev); n.delete(id); return n; }); };
  const limparTudo     = () => { if (!rodandoRef.current) { setItens([]); setLog([]); setSelecionados(new Set()); } };
  const reanaliarErros = () => { const ids = itens.filter(i => ['erro','fila'].includes(i.status)).map(i => ({ mlbId:i.mlbId, url:i.url })); if (ids.length) executarFila(ids); };
  const toggleSel      = id => setSelecionados(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleSelTodos = () => { if (selecionados.size===itensFiltrados.length) setSelecionados(new Set()); else setSelecionados(new Set(itensFiltrados.map(i=>i.id))); };

  const exportarCSV = () => {
    const rows = itens.filter(i=>i.status==='concluido').map(i=>{const d=i.dados; return [i.mlbId,`"${(d?.titulo||'').replace(/"/g,'""')}"`,d?.preco||'',d?.precoMedio||'',d?.totalVendedores||''].join(',');});
    if (!rows.length) return;
    const blob = new Blob([['ID,Título,Preço,Média,Vendedores',...rows].join('\n')],{type:'text/csv;charset=utf-8'});
    Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`pesquisa_ml_${new Date().toISOString().slice(0,10)}.csv`}).click();
  };

  const contagens      = { todos:itens.length, pendente:itens.filter(i=>i.status==='pendente').length, analisando:itens.filter(i=>i.status==='analisando').length, concluido:itens.filter(i=>i.status==='concluido').length, erro:itens.filter(i=>i.status==='erro').length, fila:itens.filter(i=>i.status==='fila').length };
  const temPendentes   = contagens.pendente + contagens.erro + contagens.fila > 0;
  const itensFiltrados = filtroStatus === 'todos' ? itens : itens.filter(i => i.status === filtroStatus);

  const FILTROS = [
    { k:'todos',     l:`Todos (${contagens.todos})`,          ac:'var(--theme-sidebar)',  cc:'var(--theme-text)',  bc:'var(--theme-card-border)' },
    { k:'concluido', l:`Concluídos (${contagens.concluido})`, ac:'#ecfdf5', cc:'#059669', bc:'#a7f3d0' },
    { k:'pendente',  l:`Pendentes (${contagens.pendente})`,   ac:'#fef3c7', cc:'#d97706', bc:'#fde68a' },
    { k:'analisando',l:`Analisando (${contagens.analisando})`,ac:'#eff6ff', cc:'#2563eb', bc:'#bfdbfe' },
    { k:'erro',      l:`Erros (${contagens.erro})`,           ac:'#fee2e2', cc:'#dc2626', bc:'#fca5a5' },
    { k:'fila',      l:`Fila (${contagens.fila})`,            ac:'#f3e8ff', cc:'#7c3aed', bc:'#d8b4fe' },
  ];

  const btnBase = { padding:'5px 10px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'10px',fontWeight:900,textTransform:'uppercase',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px' };

  return (
    <div style={{ maxWidth:'1280px',margin:'0 auto',padding:'8px 12px',minHeight:'100vh',display:'flex',flexDirection:'column',gap:'8px',color:'var(--theme-text)' }}>
      <style>{`
        @keyframes slideGrad { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* HEADER */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
          <button onClick={() => navigate('/ml')} style={{ ...btnBase,padding:'6px' }}><ArrowLeft style={{ width:'16px',height:'16px' }} /></button>
          <div>
            <h2 style={{ fontSize:'15px',fontWeight:900,color:'var(--theme-text)' }}>Pesquisa de Anúncios</h2>
            <p style={{ fontSize:'11px',color:'var(--theme-text)',opacity:0.5 }}>Preços, vendedores e concorrentes</p>
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap' }}>
          {/* Abas */}
          <div style={{ display:'flex',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'12px',padding:'3px',gap:'2px' }}>
            {[{k:'pesquisa',l:'Pesquisa',Ic:Search},{k:'historico',l:`Histórico (${historico.length})`,Ic:History},{k:'arquivados',l:`Arquivados (${arquivados.length})`,Ic:Archive}].map(({k,l,Ic})=>(
              <button key={k} onClick={() => setAba(k)} style={{ display:'flex',alignItems:'center',gap:'4px',padding:'5px 10px',borderRadius:'8px',fontSize:'10px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:aba===k?'var(--theme-header)':'transparent',color:aba===k?'#FFE600':'var(--theme-text)',opacity:aba===k?1:0.5 }}>
                <Ic style={{ width:'12px',height:'12px' }} />{l}
              </button>
            ))}
          </div>
          {aba==='pesquisa' && itens.length>0 && (<>
            <button onClick={exportarCSV} disabled={!contagens.concluido} style={{ ...btnBase,color:'#15803d',borderColor:'#86efac',background:'#f0fdf4',opacity:contagens.concluido?1:0.4 }}><Download style={{ width:'13px',height:'13px' }} />CSV</button>
            {!rodando && (contagens.erro+contagens.fila)>0 && <button onClick={reanaliarErros} style={{ ...btnBase,color:'#d97706',borderColor:'#fde68a',background:'#fef3c7' }}><RefreshCw style={{ width:'13px',height:'13px' }} />Re-tentar</button>}
            <button onClick={limparTudo} disabled={rodando} style={{ ...btnBase,color:'#ef4444',borderColor:'#fca5a5',background:'#fee2e2' }}><Trash2 style={{ width:'13px',height:'13px' }} />Limpar</button>
          </>)}
          {aba==='pesquisa' && (
            <div style={{ position:'relative' }}>
              <button
                onClick={() => setMostrarInput(v=>!v)}
                style={{ ...btnBase,background:mostrarInput?'#FFE600':'var(--theme-header)',color:mostrarInput?'#1e293b':'#FFE600',border:'none',padding:'6px 12px' }}>
                <Plus style={{ width:'13px',height:'13px' }} />Adicionar Links
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ABA PESQUISA */}
      {aba === 'pesquisa' && (<>
        {/* Input flutuante — sem overlay, ancorando no canto superior direito */}
        {mostrarInput && (
          <Portal>
            <div
              onClick={() => setMostrarInput(false)}
              style={{ position:'fixed',inset:0,zIndex:99998,background:'transparent' }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position:'fixed', top:'60px', right:'16px', zIndex:99999,
                  width:'380px', maxWidth:'96vw',
                  background:'var(--theme-card)', border:'1px solid var(--theme-card-border)',
                  borderRadius:'16px', padding:'16px',
                  boxShadow:'0 20px 60px rgba(0,0,0,0.35)',
                  animation:'slideDown 0.15s ease',
                }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px' }}>
                  <p style={{ fontSize:'12px',fontWeight:900,textTransform:'uppercase',display:'flex',alignItems:'center',gap:'6px',color:'var(--theme-text)' }}>
                    <Search style={{ width:'14px',height:'14px',color:'var(--theme-accent)' }} />Cole os links ou IDs
                  </p>
                  <button onClick={() => setMostrarInput(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--theme-text)',opacity:0.4 }}>
                    <X style={{ width:'16px',height:'16px' }} />
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={inputTexto}
                  onChange={e => setInputTexto(e.target.value)}
                  placeholder={"Links ou IDs (um por linha):\nhttps://www.mercadolivre.com.br/...\nMLB123456789"}
                  style={{ width:'100%',border:'1px solid var(--theme-card-border)',borderRadius:'10px',padding:'10px 12px',fontSize:'12px',fontFamily:'monospace',outline:'none',resize:'none',background:'var(--theme-sidebar)',color:'var(--theme-text)',boxSizing:'border-box' }}
                  rows={5}
                  onKeyDown={e => { if (e.ctrlKey && e.key==='Enter') { processarInput(); setMostrarInput(false); } }}
                />
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'10px' }}>
                  <p style={{ fontSize:'10px',color:'var(--theme-text)',opacity:0.4 }}>Ctrl+Enter para adicionar</p>
                  <button
                    onClick={() => { processarInput(); setMostrarInput(false); }}
                    disabled={!inputTexto.trim()}
                    style={{ display:'flex',alignItems:'center',gap:'5px',padding:'8px 16px',borderRadius:'10px',background:inputTexto.trim()?'var(--theme-accent)':'var(--theme-sidebar)',color:inputTexto.trim()?'#fff':'var(--theme-text)',opacity:inputTexto.trim()?1:0.4,fontSize:'11px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:inputTexto.trim()?'pointer':'not-allowed' }}>
                    <Plus style={{ width:'13px',height:'13px' }} />Adicionar
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

                {itens.length > 0 && <ResumoGeral itens={itens} />}

        {itens.length === 0 && (
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px',gap:'16px',textAlign:'center' }}>
            <div style={{ width:'70px',height:'70px',background:'#FFE600',borderRadius:'20px',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(0,0,0,0.15)' }}><Search style={{ width:'34px',height:'34px',color:'#1e293b' }} /></div>
            <div><h3 style={{ fontSize:'16px',fontWeight:900,color:'var(--theme-text)',marginBottom:'4px' }}>Pesquise anúncios do ML</h3><p style={{ fontSize:'13px',color:'var(--theme-text)',opacity:0.5 }}>Cole links ou IDs para analisar preços e vendedores.</p></div>
            <button onClick={() => setMostrarInput(true)} style={{ ...btnBase,background:'var(--theme-header)',color:'#FFE600',border:'none',padding:'10px 20px',fontSize:'12px' }}><Plus style={{ width:'14px',height:'14px' }} />Adicionar Links</button>
          </div>
        )}

        {itens.length > 0 && (
          <div style={{ display:'flex',gap:'12px',flex:1,minHeight:0 }}>
            {/* Terminal */}
            <div style={{ width:'300px',flexShrink:0,background:'#020617',borderRadius:'14px',display:'flex',flexDirection:'column',maxHeight:'76vh' }}>
              <div style={{ display:'flex',alignItems:'center',gap:'6px',padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0 }}>
                <div style={{ display:'flex',gap:'4px' }}>{['#ef4444','#f59e0b','#10b981'].map(c=><span key={c} style={{ width:'9px',height:'9px',borderRadius:'50%',background:c,opacity:0.6 }}/>)}</div>
                <p style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.25)',letterSpacing:'0.1em',marginLeft:'4px',display:'flex',alignItems:'center',gap:'4px' }}><Activity style={{ width:'11px',height:'11px' }}/>Terminal</p>
                {rodando && <span style={{ marginLeft:'auto',width:'6px',height:'6px',borderRadius:'50%',background:'#3b82f6',animation:'pulse 2s infinite' }}/>}
              </div>
              <div style={{ padding:'8px 10px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0 }}>
                {!rodando
                  ? <button onClick={iniciarAnalise} disabled={!temPendentes||!mlConectado}
                      style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',padding:'7px',borderRadius:'8px',fontSize:'10px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:!temPendentes||!mlConectado?'not-allowed':'pointer',background:!temPendentes||!mlConectado?'rgba(255,255,255,0.05)':'#1d4ed8',color:!temPendentes||!mlConectado?'rgba(255,255,255,0.2)':'#fff' }}>
                      <Zap style={{ width:'11px',height:'11px' }}/>{mlConectado?(temPendentes?`Analisar (${contagens.pendente+contagens.erro+contagens.fila})`:'Sem pendentes'):'🔒 ML offline'}
                    </button>
                  : <button onClick={pararAnalise} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',padding:'7px',borderRadius:'8px',fontSize:'10px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:'#7f1d1d',color:'#fca5a5' }}>
                      <XCircle style={{ width:'11px',height:'11px' }}/>Parar
                    </button>}
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:'10px',fontFamily:'monospace',display:'flex',flexDirection:'column',gap:'2px',minHeight:0 }}>
                {log.length===0 ? <p style={{ fontSize:'9px',color:'rgba(255,255,255,0.2)',fontStyle:'italic' }}>Aguardando...</p>
                  : log.map((l,i) => (
                    <div key={i} style={{ fontSize:'9px',lineHeight:1.5,wordBreak:'break-words',color:l.tipo==='success'?'#6ee7b7':l.tipo==='warn'?'#fcd34d':'rgba(255,255,255,0.45)' }}>
                      <span style={{ color:'rgba(255,255,255,0.2)',marginRight:'4px' }}>{l.ts}</span>{l.msg}
                    </div>
                  ))}
                {rodando && <div style={{ fontSize:'9px',color:'#60a5fa',display:'flex',alignItems:'center',gap:'4px',marginTop:'4px' }}><Loader2 style={{ width:'9px',height:'9px',animation:'spin 1s linear infinite' }}/>processando...</div>}
                <div ref={logEndRef}/>
              </div>
            </div>

            {/* Lista de resultados */}
            <div style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:'8px' }}>
              {/* Filtros */}
              <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'12px',padding:'8px 12px',display:'flex',alignItems:'center',gap:'5px',flexWrap:'wrap' }}>
                <button onClick={toggleSelTodos} style={{ color:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?'#3b82f6':'var(--theme-text)',opacity:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?1:0.3,background:'none',border:'none',cursor:'pointer',padding:0 }}>
                  {selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?<CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }}/>:<Square style={{ width:'14px',height:'14px' }}/>}
                </button>
                {FILTROS.map(({ k, l, ac, cc, bc }) => (
                  <button key={k} onClick={() => setFiltroStatus(k)}
                    style={{ padding:'4px 9px',borderRadius:'7px',border:`1px solid ${filtroStatus===k?bc:'var(--theme-card-border)'}`,background:filtroStatus===k?ac:'var(--theme-sidebar)',color:filtroStatus===k?cc:'var(--theme-text)',fontSize:'10px',fontWeight:900,textTransform:'uppercase',cursor:'pointer',opacity:filtroStatus===k?1:0.6 }}>
                    {l}
                  </button>
                ))}
                {selecionados.size>0 && (
                  <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:'5px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'4px 10px' }}>
                    <span style={{ fontSize:'9px',fontWeight:900,color:'#1d4ed8' }}>{selecionados.size} sel.</span>
                    {/* Comparador de preços */}
                    {[...selecionados].some(id => itens.find(i=>i.id===id&&i.status==='concluido')) && (
                      <button
                        onClick={() => setShowComparador(true)}
                        style={{ display:'flex',alignItems:'center',gap:'3px',padding:'3px 8px',borderRadius:'6px',background:'#7c3aed',color:'#fff',border:'none',cursor:'pointer',fontSize:'9px',fontWeight:900,textTransform:'uppercase' }}>
                        <BarChart2 style={{ width:'11px',height:'11px' }}/>
                        Comparar
                      </button>
                    )}
                    {/* Re-pesquisar selecionados */}
                    <button
                      disabled={rodando}
                      onClick={() => {
                        const ids = itens
                          .filter(i => selecionados.has(i.id))
                          .map(i => ({ mlbId: i.mlbId, url: i.url }));
                        if (!ids.length) return;
                        // Marca todos como pendente antes de re-analisar
                        setItens(prev => prev.map(it =>
                          selecionados.has(it.id) ? { ...it, status:'pendente', dados:null, erro:null } : it
                        ));
                        setSelecionados(new Set());
                        executarFila(ids);
                      }}
                      title="Re-pesquisar selecionados"
                      style={{ display:'flex',alignItems:'center',gap:'3px',padding:'3px 8px',borderRadius:'6px',background:'#2563eb',color:'#fff',border:'none',cursor:rodando?'not-allowed':'pointer',fontSize:'9px',fontWeight:900,textTransform:'uppercase',opacity:rodando?0.5:1 }}>
                      <RefreshCw style={{ width:'11px',height:'11px' }}/>
                      Re-pesquisar
                    </button>
                    <button onClick={()=>{[...selecionados].forEach(id=>removerItem(id));}} title="Remover selecionados" style={{ display:'flex',padding:'3px',background:'none',border:'none',cursor:'pointer',color:'#ef4444' }}><Trash2 style={{ width:'12px',height:'12px' }}/></button>
                  </div>
                )}
              </div>

              {/* Cards em 2 colunas para aproveitar espaço */}
              <div style={{ flex:1,overflowY:'auto',maxHeight:'calc(76vh - 56px)' }}>
                {itensFiltrados.length === 0
                  ? <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'14px',padding:'36px',display:'flex',flexDirection:'column',alignItems:'center',gap:'8px' }}>
                      <Filter style={{ width:'28px',height:'28px',color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:'11px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3 }}>Nenhum item</p>
                    </div>
                  : <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'8px' }}>
                      {itensFiltrados.map(item => (
                        <CardResultado key={item.id} item={item} onRemover={removerItem} selecionado={selecionados.has(item.id)} onSel={toggleSel} onAbrirModal={setModalAberto} />
                      ))}
                    </div>}
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ABAS HISTÓRICO / ARQUIVADOS */}
      {(aba === 'historico' || aba === 'arquivados') && (
        <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
          <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'12px',padding:'8px 12px',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap' }}>
            {/* Selecionar todos */}
            <button
              onClick={() => {
                const lista = aba==='historico' ? historico : arquivados;
                if (selHist.size === lista.length && lista.length > 0) setSelHist(new Set());
                else setSelHist(new Set(lista.map(i => i.id)));
              }}
              style={{ color:selHist.size > 0 ? '#3b82f6' : 'var(--theme-text)',opacity:selHist.size > 0 ? 1 : 0.4,background:'none',border:'none',cursor:'pointer',padding:0,display:'flex' }}>
              {selHist.size > 0 ? <CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }}/> : <Square style={{ width:'14px',height:'14px' }}/>}
            </button>
            <button onClick={() => buscarHistorico(aba==='arquivados')} style={btnBase}><RefreshCw style={{ width:'12px',height:'12px' }}/></button>
            <p style={{ fontSize:'11px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.5 }}>{aba==='historico'?`${historico.length} pesquisa(s)`:`${arquivados.length} arquivado(s)`}</p>
            {selHist.size > 0 && (
              <div style={{ marginLeft:'auto',display:'flex',gap:'5px',alignItems:'center',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'4px 10px' }}>
                <span style={{ fontSize:'9px',fontWeight:900,color:'#1d4ed8' }}>{selHist.size} sel.</span>
                {aba==='historico' && (
                  <button onClick={() => acaoLoteHist('arquivar')} style={{ display:'flex',alignItems:'center',gap:'3px',padding:'3px 8px',borderRadius:'6px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',fontSize:'9px',fontWeight:900,cursor:'pointer' }}>
                    <Archive style={{ width:'11px',height:'11px' }}/>Arquivar
                  </button>
                )}
                {aba==='arquivados' && (
                  <button onClick={() => { [...selHist].forEach(id => restaurarHist(id)); setSelHist(new Set()); }} style={{ display:'flex',alignItems:'center',gap:'3px',padding:'3px 8px',borderRadius:'6px',background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#15803d',fontSize:'9px',fontWeight:900,cursor:'pointer' }}>
                    <ArchiveRestore style={{ width:'11px',height:'11px' }}/>Restaurar
                  </button>
                )}
                <button onClick={() => acaoLoteHist('excluir')} style={{ display:'flex',alignItems:'center',gap:'3px',padding:'3px 8px',borderRadius:'6px',background:'#fee2e2',border:'1px solid #fca5a5',color:'#dc2626',fontSize:'9px',fontWeight:900,cursor:'pointer' }}>
                  <Trash2 style={{ width:'11px',height:'11px' }}/>Excluir
                </button>
              </div>
            )}
          </div>
          {loadingHist
            ? <div style={{ display:'flex',justifyContent:'center',padding:'36px' }}><Loader2 style={{ width:'24px',height:'24px',animation:'spin 1s linear infinite',color:'#94a3b8' }}/></div>
            : (() => {
                const lista = aba==='historico' ? historico : arquivados;
                if (!lista.length) return (
                  <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'14px',padding:'36px',display:'flex',flexDirection:'column',alignItems:'center',gap:'8px',textAlign:'center' }}>
                    <History style={{ width:'32px',height:'32px',color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:'12px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3 }}>{aba==='historico'?'Nenhuma pesquisa ainda':'Nenhum arquivado'}</p>
                  </div>
                );
                return <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
                  {lista.map(item => (
                    <CardHistorico key={item.id} item={item} sel={selHist.has(item.id)}
                      onSel={id => setSelHist(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; })}
                      onArquivar={arquivarHist} onRestaurar={restaurarHist}
                      onExcluir={excluirHist} onExcluirDef={excluirDefHist}
                      onRecarregar={recarregarDoHistorico} />
                  ))}
                </div>;
              })()}
        </div>
      )}

      {/* Modal comparador */}
      {showComparador && (
        <ModalComparador
          itens={itens.filter(i => selecionados.has(i.id))}
          userId={userId}
          onClose={() => setShowComparador(false)}
        />
      )}

      {/* Modal detalhes */}
      {modalAberto && <ModalAnuncio item={modalAberto} onClose={() => setModalAberto(null)} />}
    </div>
  );
}