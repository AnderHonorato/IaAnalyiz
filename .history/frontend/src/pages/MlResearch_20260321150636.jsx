// src/pages/MlResearch.jsx — v5
// Cards compactos, popup grande para detalhes, fix de vendedores

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  XCircle, Clock, ShoppingBag, Star, TrendingUp, TrendingDown, Package,
  Download, Zap, ArrowLeft, Users, Activity, Filter, X, Medal, Award,
  Archive, ArchiveRestore, History, BarChart2, CheckSquare, Square,
  DollarSign, Eye,
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
function formatPrice(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
}
function formatDate(val) {
  if (!val) return '—';
  try { const d=new Date(val); return isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch { return '—'; }
}
function urlCompact(url, max=45) {
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

// ── Portal ────────────────────────────────────────────────────────────────────
function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

// ── Modal de detalhes do anúncio ──────────────────────────────────────────────
function ModalAnuncio({ item, onClose }) {
  if (!item) return null;
  const d    = item.dados;
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const conc = d?.concorrentes || [];
  const abaixo = d?.preco && d?.precoMedio && d.preco < d.precoMedio;
  const linkUrl = d?.link || (item.url?.startsWith('http') ? item.url : `https://www.mercadolivre.com.br/p/${item.mlbId}`);

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.82)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:'820px',maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'20px',boxShadow:'0 30px 70px rgba(0,0,0,0.5)',display:'flex',flexDirection:'column',overflow:'hidden',color:'var(--theme-text)' }}>

          {/* Header */}
          <div style={{ background:'var(--theme-header)',padding:'16px 20px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'flex-start',gap:'12px',minWidth:0 }}>
              {d?.thumbnail && <img src={d.thumbnail} alt="" style={{ width:'52px',height:'52px',borderRadius:'10px',objectFit:'cover',border:'1px solid rgba(255,255,255,0.2)',flexShrink:0 }} />}
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'6px' }}>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}><cfg.icon className="w-2.5 h-2.5" />{cfg.label}</span>
                  <span style={{ fontSize:'9px',fontFamily:'monospace',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.1)',padding:'2px 6px',borderRadius:'4px' }}>{item.mlbId}</span>
                  {d?.fonte && <span style={{ fontSize:'8px',fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.1)',padding:'2px 6px',borderRadius:'4px' }}>{d.fonte}</span>}
                  {d?.status && <span style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',padding:'2px 6px',borderRadius:'20px',background:d.status==='active'?'rgba(16,185,129,0.2)':'rgba(148,163,184,0.2)',color:d.status==='active'?'#6ee7b7':'#94a3b8' }}>{d.status==='active'?'Ativo':'Inativo'}</span>}
                </div>
                <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'15px',fontWeight:900,color:'#fff',display:'block',marginBottom:'4px',textDecoration:'none' }}>
                  {d?.titulo || urlCompact(item.url || linkUrl)}
                </a>
                <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'10px',color:'#93c5fd',display:'flex',alignItems:'center',gap:'4px',textDecoration:'none' }}>
                  <ExternalLink style={{ width:'12px',height:'12px' }} />{urlCompact(item.url || linkUrl)}
                </a>
              </div>
            </div>
            <button onClick={onClose} style={{ color:'rgba(255,255,255,0.4)',background:'none',border:'none',cursor:'pointer',flexShrink:0 }}><X style={{ width:'20px',height:'20px' }} /></button>
          </div>

          {/* Stats rápidos */}
          {d && (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid var(--theme-card-border)',flexShrink:0 }}>
              {[
                { l:'Preço',   v:formatPrice(d.preco),  c:'#10b981', extra: abaixo?<span style={{ fontSize:'10px',color:'#10b981',marginLeft:'4px' }}>▼ abaixo da média</span>:<span style={{ fontSize:'10px',color:'#f59e0b',marginLeft:'4px' }}>▲ acima da média</span> },
                { l:'Média',   v:formatPrice(d.precoMedio), c:abaixo?'#f59e0b':'#6366f1' },
                { l:'Estoque', v:d.estoque!=null?`${d.estoque} un`:'—', c:'#3b82f6' },
                { l:'Vendidos',v:d.vendidos!=null?d.vendidos:'—', c:'#6366f1' },
              ].map(({ l, v, c, extra }, i) => (
                <div key={l} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'12px 16px',borderRight:i<3?'1px solid var(--theme-card-border)':'none' }}>
                  <div>
                    <div style={{ display:'flex',alignItems:'center' }}>
                      <p style={{ fontSize:'16px',fontWeight:900,color:c,lineHeight:1 }}>{v}</p>
                      {extra}
                    </div>
                    <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:'2px' }}>{l}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Corpo */}
          <div style={{ flex:1,overflowY:'auto',padding:'20px',display:'flex',flexDirection:'column',gap:'16px' }}>
            {item.status==='erro' && <div style={{ padding:'12px 16px',borderRadius:'12px',background:'#fee2e2',border:'1px solid #fca5a5',color:'#b91c1c',fontSize:'13px' }}>{item.erro}</div>}
            {item.status==='analisando' && <div style={{ display:'flex',alignItems:'center',gap:'8px',padding:'16px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'12px',color:'#1d4ed8',fontSize:'13px' }}><Loader2 style={{ width:'16px',height:'16px',animation:'spin 1s linear infinite' }} />Tentando múltiplas estratégias...</div>}

            {d && (
              <>
                {/* Info + Frete */}
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px' }}>
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:'12px',padding:'14px',border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:'10px' }}>Informações</p>
                    {[['Condição',d.condicao],['Tipo',d.tipoAnuncio],['Avaliação',d.avaliacoes?`${d.avaliacoes} ★`:'—'],['Menor preço',formatPrice(d.precoMin)],['Maior preço',formatPrice(d.precoMax)],['Vendedores',d.totalVendedores||conc.length+1]].filter(([,v])=>v).map(([k,v]) => (
                      <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--theme-card-border)',fontSize:'13px' }}>
                        <span style={{ opacity:0.5 }}>{k}</span>
                        <span style={{ fontWeight:700 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:'12px',padding:'14px',border:'1px solid var(--theme-card-border)' }}>
                    <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:'10px' }}>Frete</p>
                    {[['Frete',d.freteGratis?'🟢 Grátis':(d.frete||'—')]].map(([k,v]) => (
                      <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--theme-card-border)',fontSize:'13px' }}>
                        <span style={{ opacity:0.5 }}>{k}</span>
                        <span style={{ fontWeight:700,color:d.freteGratis?'#10b981':undefined }}>{v}</span>
                      </div>
                    ))}
                    {d.seller && (
                      <div style={{ marginTop:'12px' }}>
                        <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:'8px',display:'flex',alignItems:'center',gap:'4px' }}><Users style={{ width:'12px',height:'12px' }} />Vendedor Principal</p>
                        <p style={{ fontSize:'14px',fontWeight:900 }}>{d.seller.nome}</p>
                        {d.seller.reputacao && <p style={{ fontSize:'11px',opacity:0.5,textTransform:'capitalize',marginTop:'2px' }}>{d.seller.reputacao}</p>}
                        {d.seller.vendas!=null && <p style={{ fontSize:'12px',fontWeight:700,marginTop:'4px',color:'#6366f1' }}>{d.seller.vendas?.toLocaleString('pt-BR')} vendas</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Concorrentes */}
                {conc.length > 0 ? (
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:'12px',border:'1px solid var(--theme-card-border)',overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px',background:'#eff6ff',borderBottom:'1px solid #bfdbfe',display:'flex',alignItems:'center',gap:'6px' }}>
                      <Users style={{ width:'14px',height:'14px',color:'#1d4ed8' }} />
                      <p style={{ fontSize:'11px',fontWeight:900,textTransform:'uppercase',color:'#1d4ed8' }}>{conc.length} Concorrente{conc.length!==1?'s':''}</p>
                    </div>
                    <table style={{ width:'100%',borderCollapse:'collapse' }}>
                      <thead style={{ background:'var(--theme-card)',borderBottom:'1px solid var(--theme-card-border)' }}>
                        <tr>{['#','Vendedor','Preço','Link'].map(h => <th key={h} style={{ padding:'8px 12px',fontSize:'9px',fontWeight:900,textTransform:'uppercase',textAlign:'left',opacity:0.5 }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {conc.map((c, i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--theme-card-border)',background:c.preco<d.preco?'rgba(239,68,68,0.05)':undefined }}>
                            <td style={{ padding:'10px 12px',width:'32px' }}>
                              {i===0?<Medal style={{ width:'14px',height:'14px',color:'#f59e0b' }}/>:i===1?<Award style={{ width:'14px',height:'14px',color:'#94a3b8' }}/>:<span style={{ fontSize:'11px',opacity:0.4 }}>{i+1}</span>}
                            </td>
                            <td style={{ padding:'10px 12px',fontSize:'13px',fontWeight:600 }}>{c.nome}</td>
                            <td style={{ padding:'10px 12px',fontSize:'13px',fontWeight:900,color:c.preco<d.preco?'#ef4444':c.preco>d.preco?'#10b981':'var(--theme-text)',display:'flex',alignItems:'center',gap:'4px' }}>
                              {formatPrice(c.preco)}
                              {c.preco<d.preco&&<TrendingDown style={{ width:'12px',height:'12px' }}/>}
                              {c.preco>d.preco&&<TrendingUp style={{ width:'12px',height:'12px' }}/>}
                            </td>
                            <td style={{ padding:'10px 12px' }}>
                              {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'4px 8px',background:'var(--theme-sidebar)',borderRadius:'6px',border:'1px solid var(--theme-card-border)',fontSize:'10px',color:'#3b82f6',textDecoration:'none' }}><ExternalLink style={{ width:'10px',height:'10px' }} />Ver</a>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ background:'var(--theme-sidebar)',borderRadius:'12px',padding:'16px',border:'1px solid var(--theme-card-border)',textAlign:'center' }}>
                    <p style={{ fontSize:'12px',fontWeight:900,textTransform:'uppercase',opacity:0.4,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px' }}><Users style={{ width:'14px',height:'14px' }} />Nenhum concorrente encontrado para este anúncio</p>
                    <p style={{ fontSize:'11px',opacity:0.3,marginTop:'4px' }}>Anúncios de catálogo podem não ter dados de concorrentes via API</p>
                  </div>
                )}

                {/* Ficha Técnica */}
                {d.atributos?.length > 0 && (
                  <div>
                    <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',opacity:0.4,marginBottom:'8px',display:'flex',alignItems:'center',gap:'4px' }}><Package style={{ width:'12px',height:'12px' }} />Ficha Técnica</p>
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px' }}>
                      {d.atributos.map((a, i) => (
                        <div key={i} style={{ display:'flex',justifyContent:'space-between',background:'var(--theme-sidebar)',padding:'8px 12px',borderRadius:'8px',fontSize:'12px',border:'1px solid var(--theme-card-border)' }}>
                          <span style={{ opacity:0.5 }}>{a.nome}</span>
                          <span style={{ fontWeight:700,marginLeft:'8px' }}>{a.valor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ── Card compacto (sem expansão inline) ───────────────────────────────────────
function CardResultado({ item, onRemover, selecionado, onSel, onAbrirModal }) {
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendente;
  const d    = item.dados;
  const linkUrl = d?.link || (item.url?.startsWith('http') ? item.url : `https://www.mercadolivre.com.br/p/${item.mlbId}`);

  return (
    <div style={{ background:'var(--theme-card)',border:`1px solid var(--theme-card-border)`,borderRadius:'14px',overflow:'hidden',boxShadow:selecionado?'0 0 0 2px #60a5fa':'0 1px 4px rgba(0,0,0,0.06)',transition:'box-shadow 0.15s' }}>
      <div style={{ height:'2px', ...(item.status==='analisando'?{backgroundImage:'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)',backgroundSize:'200%',animation:'slideGrad 1.5s linear infinite'}:{backgroundColor:cfg.barColor||'#94a3b8'}) }} />
      <div style={{ padding:'10px 12px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
          {/* Checkbox */}
          <button onClick={() => onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',color:selecionado?'#3b82f6':'var(--theme-text)',opacity:selecionado?1:0.3 }}>
            {selecionado?<CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }}/>:<Square style={{ width:'14px',height:'14px' }}/>}
          </button>

          {/* Thumb */}
          <div style={{ width:'36px',height:'36px',borderRadius:'8px',overflow:'hidden',border:'1px solid var(--theme-card-border)',flexShrink:0,background:'var(--theme-sidebar)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            {d?.thumbnail?<img src={d.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>:<ShoppingBag style={{ width:'16px',height:'16px',color:'var(--theme-text)',opacity:0.2 }}/>}
          </div>

          {/* Info */}
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:'4px',flexWrap:'wrap',marginBottom:'3px' }}>
              <span className={`inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                <cfg.icon className={`w-2.5 h-2.5 ${item.status==='analisando'?'animate-spin':''}`}/>{cfg.label}
              </span>
              <span style={{ fontSize:'8px',fontFamily:'monospace',color:'var(--theme-text)',opacity:0.4,background:'var(--theme-sidebar)',padding:'1px 5px',borderRadius:'4px' }}>{item.mlbId}</span>
              {d?.fonte && <span style={{ fontSize:'7px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3,background:'var(--theme-sidebar)',padding:'1px 5px',borderRadius:'4px' }}>{d.fonte}</span>}
            </div>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:'12px',fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:'none' }}>
              {d?.titulo || urlCompact(item.url || linkUrl)}
            </a>
            {item.status==='erro' && <p style={{ fontSize:'10px',color:'#ef4444',marginTop:'2px' }}>{item.erro}</p>}
          </div>

          {/* Ações */}
          <div style={{ display:'flex',alignItems:'center',gap:'4px',flexShrink:0 }}>
            {(item.status==='concluido'||item.status==='erro') && (
              <button onClick={() => onAbrirModal(item)} style={{ padding:'5px',borderRadius:'7px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }} title="Ver detalhes">
                <Eye style={{ width:'13px',height:'13px' }}/>
              </button>
            )}
            <button onClick={() => onRemover(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}>
              <Trash2 style={{ width:'13px',height:'13px' }}/>
            </button>
          </div>
        </div>

        {/* Métricas compactas */}
        {item.status==='concluido' && d && (
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'5px',marginTop:'8px' }}>
            {[
              { v:formatPrice(d.preco), l:'Preço', c:'var(--theme-text)' },
              { v:formatPrice(d.precoMedio), l:'Média', c:d.preco<d.precoMedio?'#10b981':'#f59e0b' },
              { v:d.totalVendedores||(d.concorrentes?.length||0)+1, l:'Vend.', c:'#3b82f6' },
            ].map(({ v, l, c }) => (
              <div key={l} style={{ background:'var(--theme-sidebar)',borderRadius:'7px',padding:'4px 8px',textAlign:'center',border:'1px solid var(--theme-card-border)' }}>
                <p style={{ fontSize:'11px',fontWeight:900,color:c,lineHeight:1 }}>{v}</p>
                <p style={{ fontSize:'8px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:'1px' }}>{l}</p>
              </div>
            ))}
          </div>
        )}

        {item.status==='analisando' && (
          <div style={{ display:'flex',alignItems:'center',gap:'6px',marginTop:'6px',fontSize:'10px',color:'#3b82f6' }}>
            <Loader2 style={{ width:'12px',height:'12px',animation:'spin 1s linear infinite',flexShrink:0 }}/>
            <span style={{ animation:'pulse 2s infinite' }}>Tentando estratégias...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card histórico ─────────────────────────────────────────────────────────────
function CardHistorico({ item, sel, onSel, onArquivar, onRestaurar, onExcluir, onExcluirDef, onRecarregar }) {
  return (
    <div style={{ background:'var(--theme-card)',border:`1px solid ${sel?'#93c5fd':'var(--theme-card-border)'}`,borderRadius:'12px',padding:'10px 12px',display:'flex',alignItems:'center',gap:'10px',background:sel?'rgba(59,130,246,0.06)':undefined }}>
      <button onClick={() => onSel(item.id)} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',color:sel?'#3b82f6':'var(--theme-text)',opacity:sel?1:0.3 }}>
        {sel?<CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }}/>:<Square style={{ width:'14px',height:'14px' }}/>}
      </button>
      {item.thumbnail?<img src={item.thumbnail} alt="" style={{ width:'36px',height:'36px',borderRadius:'8px',objectFit:'cover',border:'1px solid var(--theme-card-border)',flexShrink:0 }}/>:<div style={{ width:'36px',height:'36px',background:'var(--theme-sidebar)',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}><ShoppingBag style={{ width:'16px',height:'16px',opacity:0.2 }}/></div>}
      <div style={{ flex:1,minWidth:0 }}>
        {item.titulo?<a href={item.urlOriginal} target="_blank" rel="noopener noreferrer" style={{ fontSize:'12px',fontWeight:700,color:'var(--theme-text)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textDecoration:'none' }}>{item.titulo}</a>:<span style={{ fontSize:'12px',fontWeight:700,color:'#ef4444',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.erro||'Erro na pesquisa'}</span>}
        <div style={{ display:'flex',alignItems:'center',gap:'8px',marginTop:'2px',flexWrap:'wrap' }}>
          <span style={{ fontSize:'9px',fontFamily:'monospace',color:'var(--theme-text)',opacity:0.4 }}>{item.mlbId}</span>
          {item.preco&&<span style={{ fontSize:'9px',fontWeight:900,color:'#10b981' }}>{formatPrice(item.preco)}</span>}
          <span style={{ fontSize:'9px',color:'var(--theme-text)',opacity:0.4 }}>{formatDate(item.updatedAt)}</span>
          {item.arquivado&&<span style={{ fontSize:'8px',fontWeight:900,color:'var(--theme-text)',opacity:0.4,background:'var(--theme-sidebar)',padding:'1px 6px',borderRadius:'4px',textTransform:'uppercase' }}>Arquivado</span>}
        </div>
      </div>
      <div style={{ display:'flex',alignItems:'center',gap:'4px',flexShrink:0 }}>
        <button onClick={() => onRecarregar(item)} style={{ padding:'5px',borderRadius:'7px',background:'#eff6ff',border:'1px solid #bfdbfe',color:'#3b82f6',cursor:'pointer',display:'flex' }}><RefreshCw style={{ width:'12px',height:'12px' }}/></button>
        {item.arquivado?<button onClick={() => onRestaurar(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#16a34a',cursor:'pointer',display:'flex' }}><ArchiveRestore style={{ width:'12px',height:'12px' }}/></button>:<button onClick={() => onArquivar(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',cursor:'pointer',display:'flex' }}><Archive style={{ width:'12px',height:'12px' }}/></button>}
        <button onClick={() => onExcluir(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'#fef3c7',border:'1px solid #fde68a',color:'#b45309',cursor:'pointer',display:'flex' }}><Trash2 style={{ width:'12px',height:'12px' }}/></button>
        <button onClick={() => onExcluirDef(item.id)} style={{ padding:'5px',borderRadius:'7px',background:'#fee2e2',border:'1px solid #fca5a5',color:'#ef4444',cursor:'pointer',display:'flex' }}><XCircle style={{ width:'12px',height:'12px' }}/></button>
      </div>
    </div>
  );
}

// ── Resumo ─────────────────────────────────────────────────────────────────────
function ResumoGeral({ itens }) {
  const ok = itens.filter(i=>i.status==='concluido');
  if (!ok.length) return null;
  const precos = ok.map(i=>i.dados?.preco).filter(Boolean);
  const totalV = ok.reduce((s,i)=>s+(i.dados?.totalVendedores||0),0);
  return (
    <div style={{ background:'linear-gradient(135deg,#0f172a,#1e293b)',borderRadius:'14px',padding:'14px 16px',color:'#fff',marginBottom:'8px' }}>
      <p style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.3)',letterSpacing:'0.1em',marginBottom:'8px' }}>Resumo</p>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px' }}>
        {[
          { v:ok.length,                                               l:'Anúncios', c:'#fff' },
          { v:precos.length?formatPrice(Math.min(...precos)):'—',     l:'Menor',    c:'#6ee7b7' },
          { v:precos.length?formatPrice(precos.reduce((s,v)=>s+v,0)/precos.length):'—', l:'Média', c:'#fcd34d' },
          { v:totalV,                                                  l:'Vendedores',c:'#93c5fd' },
        ].map(({ v, l, c }) => (
          <div key={l}><p style={{ fontSize:'18px',fontWeight:900,color:c,lineHeight:1 }}>{v}</p><p style={{ fontSize:'9px',textTransform:'uppercase',color:'rgba(255,255,255,0.3)',marginTop:'3px' }}>{l}</p></div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function MlResearch() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const [aba, setAba]                     = useState('pesquisa');
  const [inputTexto, setInputTexto]       = useState('');
  const [mostrarInput, setMostrarInput]   = useState(true);
  const [mlConectado, setMlConectado]     = useState(false);
  const [rodando, setRodando]             = useState(false);
  const [filtroStatus, setFiltroStatus]   = useState('todos');
  const [log, setLog]                     = useState([]);
  const [selecionados, setSelecionados]   = useState(new Set());
  const [modalAberto, setModalAberto]     = useState(null);

  const [itens, setItensRaw] = useState(() => { try { const s=localStorage.getItem(LS_KEY); return s?JSON.parse(s):[]; } catch { return []; } });
  const setItens = useCallback((fn) => {
    setItensRaw(prev => {
      const next = typeof fn==='function'?fn(prev):fn;
      const toSave = next.map(i=>i.status==='analisando'?{...i,status:'pendente'}:i);
      try { localStorage.setItem(LS_KEY, JSON.stringify(toSave)); } catch {}
      return next;
    });
  }, []);

  const [historico,    setHistorico]    = useState([]);
  const [arquivados,   setArquivados]   = useState([]);
  const [loadingHist,  setLoadingHist]  = useState(false);
  const [selHist,      setSelHist]      = useState(new Set());

  const rodandoRef = useRef(false);
  const abortRef   = useRef(false);
  const logEndRef  = useRef(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`).then(r=>r.json()).then(d=>setMlConectado(d.connected&&!d.expired)).catch(()=>{});
  }, [userId]);

  useEffect(() => {
    if (aba==='historico')  buscarHistorico(false);
    if (aba==='arquivados') buscarHistorico(true);
  }, [aba]);

  useEffect(() => { logEndRef.current?.scrollIntoView({behavior:'smooth'}); }, [log]);

  const addLog = useCallback((msg, tipo='info') => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setLog(prev=>[...prev.slice(-100),{msg,tipo,ts}]);
  }, []);

  const buscarHistorico = async (arq) => {
    setLoadingHist(true);
    try { const res=await fetch(`${API_BASE_URL}/api/ml/research/historico?userId=${userId}&arquivado=${arq}`); const data=await res.json(); if(arq) setArquivados(Array.isArray(data)?data:[]); else setHistorico(Array.isArray(data)?data:[]); } catch {}
    finally { setLoadingHist(false); }
  };

  const arquivarHist   = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/arquivar`,{method:'PUT'}); buscarHistorico(false); };
  const restaurarHist  = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/restaurar`,{method:'PUT'}); buscarHistorico(true); };
  const excluirHist    = async id => { await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const excluirDefHist = async id => { if(!window.confirm('Excluir permanentemente?')) return; await fetch(`${API_BASE_URL}/api/ml/research/historico/${id}/definitivo`,{method:'DELETE'}); buscarHistorico(aba==='arquivados'); };
  const acaoLoteHist   = async (acao) => {
    const ids=[...selHist]; if(!ids.length) return;
    if(acao==='arquivar') await fetch(`${API_BASE_URL}/api/ml/research/historico/lote/arquivar`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    if(acao==='excluir')  await fetch(`${API_BASE_URL}/api/ml/research/historico/lote`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    setSelHist(new Set()); buscarHistorico(aba==='arquivados');
  };

  const recarregarDoHistorico = (item) => {
    setAba('pesquisa');
    setTimeout(() => {
      if(!item.mlbId) return;
      const jaExiste = itens.find(i=>i.mlbId===item.mlbId);
      if(!jaExiste) setItens(prev=>[...prev,{id:`${item.mlbId}-${Date.now()}`,mlbId:item.mlbId,url:item.urlOriginal||item.mlbId,status:'pendente',dados:null,erro:null}]);
      setMostrarInput(false);
    }, 100);
  };

  const processarInput = () => {
    if(!inputTexto.trim()) return;
    const linhas  = inputTexto.split(/[\n,;]+/).map(l=>l.trim()).filter(Boolean);
    const novos   = [];
    const jaExiste = new Set(itens.map(i=>i.mlbId));
    for(const linha of linhas) {
      const mlbId = extrairMLBId(linha);
      if(!mlbId) { addLog(`⚠️ ID não encontrado: ${linha.substring(0,50)}`,'warn'); continue; }
      if(jaExiste.has(mlbId)) { addLog(`ℹ️ ${mlbId} já está na lista`); continue; }
      jaExiste.add(mlbId);
      novos.push({id:`${mlbId}-${Date.now()}-${Math.random()}`,mlbId,url:linha,status:'pendente',dados:null,erro:null});
    }
    if(!novos.length) { addLog('Nenhum link válido.','warn'); return; }
    setItens(prev=>[...prev,...novos]);
    setInputTexto('');
    addLog(`✅ ${novos.length} anúncio(s) adicionados`,'success');
    setMostrarInput(false);
  };

  const buscarAnuncio = useCallback(async (mlbId, url) => {
    const params = new URLSearchParams({userId});
    if(url) params.set('urlOriginal', encodeURIComponent(url));
    const res = await fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?${params}`,{signal:AbortSignal.timeout(25000)});
    if(!res.ok) { const e=await res.json().catch(()=>({error:`HTTP ${res.status}`})); throw new Error(e.error||`HTTP ${res.status}`); }
    return res.json();
  }, [userId]);

  const executarFila = useCallback(async (ids) => {
    if(rodandoRef.current) return;
    rodandoRef.current=true; abortRef.current=false; setRodando(true);
    addLog(`🚀 Analisando ${ids.length} anúncio(s)...`,'success');
    const retentar=[];
    for(let i=0;i<ids.length;i++) {
      if(abortRef.current) break;
      const {mlbId,url}=ids[i];
      setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando'}:it));
      addLog(`🔍 [${i+1}/${ids.length}] ${mlbId}...`);
      try {
        const dados=await buscarAnuncio(mlbId,url);
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados}:it));
        addLog(`✅ ${mlbId} (${dados.fonte||'ok'}) ${dados.titulo?.substring(0,25)||''}`,'success');
        if(i<ids.length-1&&!abortRef.current) await new Promise(r=>setTimeout(r,700));
      } catch(e) {
        const isTO=e.message.includes('timeout')||e.name==='TimeoutError';
        if(isTO) { retentar.push({mlbId,url}); setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'fila',erro:'Re-tentativa pendente...'}:it)); addLog(`⏳ ${mlbId}: timeout`,'warn'); }
        else { setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it)); addLog(`❌ ${mlbId}: ${e.message}`,'warn'); }
        await new Promise(r=>setTimeout(r,1200));
      }
    }
    if(retentar.length&&!abortRef.current) {
      addLog(`🔄 Re-tentando ${retentar.length} item(s) em 5s...`);
      await new Promise(r=>setTimeout(r,5000));
      for(const {mlbId,url} of retentar) {
        if(abortRef.current) break;
        setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'analisando',erro:null}:it));
        try { const dados=await buscarAnuncio(mlbId,url); setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'concluido',dados}:it)); addLog(`✅ Re-tentativa OK: ${mlbId}`,'success'); }
        catch(e) { setItens(prev=>prev.map(it=>it.mlbId===mlbId?{...it,status:'erro',erro:e.message}:it)); addLog(`❌ ${mlbId}: ${e.message}`,'warn'); }
        await new Promise(r=>setTimeout(r,1000));
      }
    }
    rodandoRef.current=false; setRodando(false); addLog('🎯 Análise concluída!','success');
  }, [buscarAnuncio, addLog]);

  const iniciarAnalise = () => { const ids=itens.filter(i=>['pendente','erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if(ids.length) executarFila(ids); };
  const pararAnalise   = () => { abortRef.current=true; addLog('⏹ Interrompido','warn'); };
  const removerItem    = id => { setItens(prev=>prev.filter(i=>i.id!==id)); setSelecionados(prev=>{const n=new Set(prev);n.delete(id);return n;}); };
  const limparTudo     = () => { if(!rodandoRef.current){setItens([]);setLog([]);setSelecionados(new Set());} };
  const reanaliarErros = () => { const ids=itens.filter(i=>['erro','fila'].includes(i.status)).map(i=>({mlbId:i.mlbId,url:i.url})); if(ids.length) executarFila(ids); };
  const toggleSel      = id => setSelecionados(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleSelTodos = () => { if(selecionados.size===itensFiltrados.length) setSelecionados(new Set()); else setSelecionados(new Set(itensFiltrados.map(i=>i.id))); };

  const exportarCSV = () => {
    const rows=itens.filter(i=>i.status==='concluido').map(i=>{const d=i.dados;return [i.mlbId,`"${(d?.titulo||'').replace(/"/g,'""')}"`,d?.preco||'',d?.precoMedio||'',d?.totalVendedores||''].join(',');});
    if(!rows.length) return;
    const blob=new Blob([['ID,Título,Preço,Média,Vendedores',...rows].join('\n')],{type:'text/csv;charset=utf-8'});
    Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`pesquisa_ml_${new Date().toISOString().slice(0,10)}.csv`}).click();
  };

  const contagens = { todos:itens.length, pendente:itens.filter(i=>i.status==='pendente').length, analisando:itens.filter(i=>i.status==='analisando').length, concluido:itens.filter(i=>i.status==='concluido').length, erro:itens.filter(i=>i.status==='erro').length, fila:itens.filter(i=>i.status==='fila').length };
  const temPendentes    = contagens.pendente+contagens.erro+contagens.fila>0;
  const itensFiltrados  = filtroStatus==='todos'?itens:itens.filter(i=>i.status===filtroStatus);

  const FILTROS=[
    {k:'todos',      label:`Todos (${contagens.todos})`,           ativo:{background:'var(--theme-sidebar)',color:'var(--theme-text)',borderColor:'var(--theme-card-border)'}},
    {k:'concluido',  label:`Concluídos (${contagens.concluido})`,  ativo:{background:'#f0fdf4',color:'#15803d',borderColor:'#86efac'}},
    {k:'pendente',   label:`Pendentes (${contagens.pendente})`,    ativo:{background:'#fef3c7',color:'#b45309',borderColor:'#fde68a'}},
    {k:'analisando', label:`Analisando (${contagens.analisando})`, ativo:{background:'#eff6ff',color:'#1d4ed8',borderColor:'#bfdbfe'}},
    {k:'erro',       label:`Erros (${contagens.erro})`,            ativo:{background:'#fee2e2',color:'#b91c1c',borderColor:'#fca5a5'}},
    {k:'fila',       label:`Fila (${contagens.fila})`,             ativo:{background:'#f3e8ff',color:'#7e22ce',borderColor:'#d8b4fe'}},
  ];

  const btnBase = { padding:'5px 10px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'10px',fontWeight:900,textTransform:'uppercase',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px' };

  return (
    <div style={{ maxWidth:'1280px',margin:'0 auto',padding:'8px 12px',minHeight:'100vh',display:'flex',flexDirection:'column',gap:'8px',color:'var(--theme-text)' }}>
      <style>{`@keyframes slideGrad{0%{background-position:0%}100%{background-position:200%}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      {/* HEADER */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
          <button onClick={() => navigate('/ml')} style={{ ...btnBase,padding:'6px' }}><ArrowLeft style={{ width:'16px',height:'16px' }}/></button>
          <div>
            <h2 style={{ fontSize:'15px',fontWeight:900,color:'var(--theme-text)' }}>Pesquisa de Anúncios</h2>
            <p style={{ fontSize:'11px',color:'var(--theme-text)',opacity:0.5 }}>Analise preços e concorrentes</p>
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap' }}>
          {/* Nav abas */}
          <div style={{ display:'flex',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'12px',padding:'3px',gap:'3px' }}>
            {[{k:'pesquisa',l:'Pesquisa',ic:Search},{k:'historico',l:`Histórico (${historico.length})`,ic:History},{k:'arquivados',l:`Arquivados (${arquivados.length})`,ic:Archive}].map(({k,l,ic:Ic})=>(
              <button key={k} onClick={() => setAba(k)} style={{ display:'flex',alignItems:'center',gap:'4px',padding:'5px 10px',borderRadius:'8px',fontSize:'10px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:aba===k?'var(--theme-header)':undefined,color:aba===k?'#FFE600':'var(--theme-text)',opacity:aba===k?1:0.5 }}>
                <Ic style={{ width:'12px',height:'12px' }}/>{l}
              </button>
            ))}
          </div>
          {aba==='pesquisa'&&itens.length>0&&(<>
            <button onClick={exportarCSV} disabled={!contagens.concluido} style={{ ...btnBase,color:'#15803d',borderColor:'#86efac',background:'#f0fdf4',opacity:contagens.concluido?1:0.4 }}><Download style={{ width:'13px',height:'13px' }}/>CSV</button>
            {!rodando&&(contagens.erro+contagens.fila)>0&&<button onClick={reanaliarErros} style={{ ...btnBase,color:'#b45309',borderColor:'#fde68a',background:'#fef3c7' }}><RefreshCw style={{ width:'13px',height:'13px' }}/>Re-tentar</button>}
            <button onClick={limparTudo} disabled={rodando} style={{ ...btnBase,color:'#ef4444',borderColor:'#fca5a5',background:'#fee2e2' }}><Trash2 style={{ width:'13px',height:'13px' }}/>Limpar</button>
          </>)}
          {aba==='pesquisa'&&<button onClick={() => setMostrarInput(v=>!v)} style={{ ...btnBase,background:'var(--theme-header)',color:'#FFE600',border:'none' }}><Plus style={{ width:'13px',height:'13px' }}/>Adicionar</button>}
        </div>
      </div>

      {/* ABA PESQUISA */}
      {aba==='pesquisa'&&(<>
        {mostrarInput && (
          <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'16px',padding:'14px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px' }}>
              <p style={{ fontSize:'11px',fontWeight:900,textTransform:'uppercase',display:'flex',alignItems:'center',gap:'6px' }}><Search style={{ width:'14px',height:'14px',color:'#3b82f6' }}/>Cole os links ou IDs</p>
              <button onClick={() => setMostrarInput(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--theme-text)',opacity:0.4 }}><X style={{ width:'16px',height:'16px' }}/></button>
            </div>
            <textarea value={inputTexto} onChange={e=>setInputTexto(e.target.value)}
              placeholder={"Links ou IDs (um por linha):\n\nhttps://www.mercadolivre.com.br/...\nMLB123456789"}
              style={{ width:'100%',border:'1px solid var(--theme-card-border)',borderRadius:'10px',padding:'10px 12px',fontSize:'12px',fontFamily:'monospace',outline:'none',resize:'none',background:'var(--theme-sidebar)',color:'var(--theme-text)' }} rows={4}
              onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter')processarInput();}}/>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'8px' }}>
              <p style={{ fontSize:'10px',color:'var(--theme-text)',opacity:0.4 }}>Ctrl+Enter para adicionar</p>
              <button onClick={processarInput} disabled={!inputTexto.trim()} style={{ ...btnBase,background:inputTexto.trim()?'#3b82f6':'var(--theme-sidebar)',color:inputTexto.trim()?'#fff':'var(--theme-text)',opacity:inputTexto.trim()?1:0.4,padding:'7px 16px',fontSize:'11px' }}><Plus style={{ width:'13px',height:'13px' }}/>Adicionar</button>
            </div>
          </div>
        )}

        {itens.length>0 && <ResumoGeral itens={itens}/>}

        {itens.length===0 && (
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px',gap:'16px',textAlign:'center' }}>
            <div style={{ width:'72px',height:'72px',background:'#FFE600',borderRadius:'20px',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(0,0,0,0.15)' }}><Search style={{ width:'36px',height:'36px',color:'#1e293b' }}/></div>
            <div><h3 style={{ fontSize:'17px',fontWeight:900,color:'var(--theme-text)',marginBottom:'4px' }}>Pesquise anúncios do ML</h3><p style={{ fontSize:'13px',color:'var(--theme-text)',opacity:0.5 }}>Cole links ou IDs para analisar.</p></div>
            <button onClick={() => setMostrarInput(true)} style={{ ...btnBase,background:'var(--theme-header)',color:'#FFE600',border:'none',padding:'10px 20px',fontSize:'12px',fontWeight:900 }}><Plus style={{ width:'14px',height:'14px' }}/>Adicionar Links</button>
          </div>
        )}

        {itens.length>0 && (
          <div style={{ display:'flex',gap:'12px',flex:1,minHeight:0 }}>
            {/* Terminal */}
            <div style={{ width:'220px',flexShrink:0,background:'#020617',borderRadius:'16px',display:'flex',flexDirection:'column',maxHeight:'75vh' }}>
              <div style={{ display:'flex',alignItems:'center',gap:'6px',padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0 }}>
                <div style={{ display:'flex',gap:'4px' }}>
                  {['#ef4444','#f59e0b','#10b981'].map(c=><span key={c} style={{ width:'10px',height:'10px',borderRadius:'50%',background:c,opacity:0.6 }}/>)}
                </div>
                <p style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.3)',letterSpacing:'0.1em',display:'flex',alignItems:'center',gap:'4px',marginLeft:'4px' }}><Activity style={{ width:'12px',height:'12px' }}/>Terminal</p>
                {rodando&&<span style={{ marginLeft:'auto',width:'6px',height:'6px',borderRadius:'50%',background:'#3b82f6',animation:'pulse 2s infinite' }}/>}
              </div>
              <div style={{ padding:'8px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0 }}>
                {!rodando
                  ?<button onClick={iniciarAnalise} disabled={!temPendentes||!mlConectado} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'8px',borderRadius:'8px',fontSize:'10px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:!temPendentes||!mlConectado?'not-allowed':'pointer',background:!temPendentes||!mlConectado?'rgba(255,255,255,0.05)':'#2563eb',color:!temPendentes||!mlConectado?'rgba(255,255,255,0.2)':'#fff' }}>
                    <Zap style={{ width:'12px',height:'12px' }}/>{mlConectado?(temPendentes?`Analisar ${contagens.pendente+contagens.erro+contagens.fila}`:'Sem pendentes'):'🔒 ML offline'}
                  </button>
                  :<button onClick={pararAnalise} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'8px',borderRadius:'8px',fontSize:'10px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:'pointer',background:'#7f1d1d',color:'#fca5a5' }}><XCircle style={{ width:'12px',height:'12px' }}/>Parar</button>}
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:'2px',fontFamily:'monospace',minHeight:0 }}>
                {log.length===0?<p style={{ fontSize:'9px',color:'rgba(255,255,255,0.2)',fontStyle:'italic' }}>Aguardando...</p>
                  :log.map((l,i)=>(
                    <div key={i} style={{ fontSize:'9px',lineHeight:1.5,wordBreak:'break-words',color:l.tipo==='success'?'#6ee7b7':l.tipo==='warn'?'#fcd34d':'rgba(255,255,255,0.5)' }}>
                      <span style={{ color:'rgba(255,255,255,0.2)',marginRight:'4px' }}>{l.ts}</span>{l.msg}
                    </div>
                  ))}
                {rodando&&<div style={{ fontSize:'9px',color:'#60a5fa',display:'flex',alignItems:'center',gap:'4px',marginTop:'4px',animation:'pulse 2s infinite' }}><Loader2 style={{ width:'10px',height:'10px',animation:'spin 1s linear infinite' }}/>processando...</div>}
                <div ref={logEndRef}/>
              </div>
            </div>

            {/* Lista de resultados */}
            <div style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:'8px' }}>
              {/* Filtros */}
              <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'12px',padding:'8px 12px',display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap' }}>
                <button onClick={toggleSelTodos} style={{ color:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?'#3b82f6':'var(--theme-text)',opacity:selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?1:0.3,background:'none',border:'none',cursor:'pointer' }}>
                  {selecionados.size===itensFiltrados.length&&itensFiltrados.length>0?<CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }}/>:<Square style={{ width:'14px',height:'14px' }}/>}
                </button>
                {FILTROS.map(({k,label,ativo})=>(
                  <button key={k} onClick={() => setFiltroStatus(k)}
                    style={{ ...btnStyle_filter(filtroStatus===k,ativo) }}>{label}</button>
                ))}
                {selecionados.size>0 && (
                  <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:'6px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'4px 10px' }}>
                    <span style={{ fontSize:'9px',fontWeight:900,color:'#1d4ed8' }}>{selecionados.size} sel.</span>
                    <button onClick={()=>{[...selecionados].forEach(id=>removerItem(id));}} style={{ padding:'2px',background:'none',border:'none',cursor:'pointer',color:'#ef4444',display:'flex' }}><Trash2 style={{ width:'13px',height:'13px' }}/></button>
                  </div>
                )}
              </div>

              {/* Cards */}
              <div style={{ flex:1,overflowY:'auto',maxHeight:'calc(75vh - 56px)',display:'flex',flexDirection:'column',gap:'6px' }}>
                {itensFiltrados.length===0
                  ?<div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'16px',padding:'40px',display:'flex',flexDirection:'column',alignItems:'center',gap:'8px' }}><Filter style={{ width:'28px',height:'28px',color:'var(--theme-text)',opacity:0.2 }}/><p style={{ fontSize:'11px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3 }}>Nenhum item</p></div>
                  :itensFiltrados.map(item=>(
                    <CardResultado key={item.id} item={item} onRemover={removerItem} selecionado={selecionados.has(item.id)} onSel={toggleSel} onAbrirModal={setModalAberto}/>
                  ))}
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ABAS HISTÓRICO / ARQUIVADOS */}
      {(aba==='historico'||aba==='arquivados') && (
        <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
          <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'12px',padding:'8px 12px',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap' }}>
            <button onClick={() => buscarHistorico(aba==='arquivados')} style={btnBase}><RefreshCw style={{ width:'13px',height:'13px' }}/></button>
            <p style={{ fontSize:'11px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.5 }}>{aba==='historico'?`${historico.length} pesquisa(s)`:`${arquivados.length} arquivado(s)`}</p>
            {selHist.size>0 && (
              <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:'6px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'4px 10px' }}>
                <span style={{ fontSize:'9px',fontWeight:900,color:'#1d4ed8' }}>{selHist.size} sel.</span>
                {aba==='historico'&&<button onClick={() => acaoLoteHist('arquivar')} style={{ ...btnBase,padding:'3px 8px' }}><Archive style={{ width:'12px',height:'12px' }}/>Arquivar</button>}
                <button onClick={() => acaoLoteHist('excluir')} style={{ ...btnBase,padding:'3px 8px',color:'#ef4444',borderColor:'#fca5a5',background:'#fee2e2' }}><Trash2 style={{ width:'12px',height:'12px' }}/>Excluir</button>
              </div>
            )}
          </div>
          {loadingHist
            ?<div style={{ display:'flex',justifyContent:'center',padding:'40px' }}><Loader2 style={{ width:'24px',height:'24px',animation:'spin 1s linear infinite',color:'rgba(148,163,184,1)' }}/></div>
            :(() => {
                const lista = aba==='historico'?historico:arquivados;
                if(!lista.length) return (
                  <div style={{ background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',borderRadius:'16px',padding:'40px',display:'flex',flexDirection:'column',alignItems:'center',gap:'8px',textAlign:'center' }}>
                    <History style={{ width:'36px',height:'36px',color:'var(--theme-text)',opacity:0.2 }}/>
                    <p style={{ fontSize:'13px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.3 }}>{aba==='historico'?'Nenhuma pesquisa ainda':'Nenhum arquivado'}</p>
                  </div>
                );
                return <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
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
      )}

      {/* Modal detalhes */}
      {modalAberto && <ModalAnuncio item={modalAberto} onClose={() => setModalAberto(null)} />}
    </div>
  );
}

// helper interno
function btnStyle_filter(active, ativo) {
  return {
    padding:'5px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'10px', fontWeight:900, textTransform:'uppercase',
    border:`1px solid ${active?(ativo?.borderColor||'var(--theme-card-border)'):'var(--theme-card-border)'}`,
    background: active?(ativo?.background||'var(--theme-sidebar)'):'var(--theme-sidebar)',
    color: active?(ativo?.color||'var(--theme-text)'):'var(--theme-text)',
    opacity: active?1:0.6,
  };
}