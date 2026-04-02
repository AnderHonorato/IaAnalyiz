/**
 * frontend/src/pages/MeusAnuncios.jsx
 * 
 * Propósito:
 * Visualizador completo de todos os anúncios próprios no Mercado Livre.
 * Permite buscar, filtrar, paginar e gerenciar lista de anúncios com cache.
 * 
 * Responsabilidades:
 * - Listar todos os anúncios do utilizador
 * - Permitir busca por título, SKU, ID
 * - Filtrar por status (Ativo, Pausado, Fechado)
 * - Paginação de resultados
 * - Caching local em localStorage
 * - Suportar tags/modelos customizados
 * - Ocultar anúncios selecionados temporariamente
 * - Alternância entre visualização em lista/grid
 * - Atualização automática periódica
 * - Acesso rápido para outras ferramentas
 * 
 * Características:
 * - Visualização em tabela ou cards
 * - Filtros por status e novos anúncios
 * - Seleção múltipla com checkbox
 * - Tags e modelos customizáveis
 * - Cache persistente em localStorage
 * - Histórico de visto (seen_ids)
 * - Auto-refresh configurável
 * - Links diretos para edição/auditoria
 * 
 * Estado:
 *   - anuncios: Lista de anúncios
 *   - filtro: Filtro ativo (status, novos, etc)
 *   - pagina: Página atual
 *   - busca: Termo de busca
 *   - loading: Flag de carregamento
 *   - tags: Tags customizadas do utilizador
 *   - ocultos: IDs de anúncios ocultos
 * 
 * APIs:
 *   - GET /api/ml/my-listings - Listar anúncios
 *   - Dados em cache em localStorage[LS_CACHE_KEY]
 * 
 * Configuração:
 *   - PAGE_SIZE: 20 anúncios por página
 *   - AUTO_REFRESH: 2 minutos
 * 
 * @author Anderson Honorato
 * @version 2.0.0
 */

// src/pages/MeusAnuncios.jsx — v2
// Anúncios próprios do ML: busca manual, paginação, tags/modelos, filtro novos,
// dark mode, ocultar selecionados, navegação para outras páginas, modal de detalhes

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Search, ExternalLink, ShoppingBag, Loader2,
  X, Package, DollarSign, Star, CheckCircle2, XCircle, AlertTriangle,
  Eye, Download, Square, CheckSquare, List, LayoutGrid, TrendingUp,
  Clock, Archive, Tag, Plus, Trash2, EyeOff, ChevronLeft, ChevronRight,
  Scale, Image as ImageIcon, Barcode, Ruler,
} from 'lucide-react';

const API_BASE_URL  = 'http://localhost:3000';
const LS_SEEN_KEY   = 'ml_anuncios_seen_ids';
const LS_TAGS_KEY   = 'ml_anuncios_tags';
const LS_HIDDEN_KEY = 'ml_anuncios_hidden_ids';
const LS_CACHE_KEY  = 'ml_anuncios_cache';
const PAGE_SIZE     = 20;
const AUTO_REFRESH  = 2 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPrice(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function formatDate(val) {
  if (!val) return '—';
  try { const d = new Date(val); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}
function lsGet(key, def) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

const STATUS_CFG = {
  active:       { label: 'Ativo',    color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: CheckCircle2 },
  paused:       { label: 'Pausado',  color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200',   icon: AlertTriangle },
  closed:       { label: 'Fechado',  color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200',     icon: XCircle },
  inactive:     { label: 'Inativo',  color: 'text-slate-500',   bg: 'bg-slate-100',   border: 'border-slate-200',   icon: Archive },
  under_review: { label: 'Revisão',  color: 'text-purple-600',  bg: 'bg-purple-50',   border: 'border-purple-200',  icon: Clock },
};
const TIPO_CFG = {
  gold_pro: 'Premium', gold_special: 'Clássico', gold: 'Ouro',
  silver: 'Prata', bronze: 'Bronze', free: 'Grátis',
};
const TAG_COLORS = [
  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe' },
  { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4' },
  { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
  { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af' },
];

// ── Portal ─────────────────────────────────────────────────────────────────────
function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

// ── Modal Detalhes ─────────────────────────────────────────────────────────────
function ModalDetalhes({ anuncio, userId, onClose, onNavigate }) {
  const [tab,         setTab]        = useState('info');
  const [fullData,    setFullData]   = useState(null);
  const [loadingFull, setLoadingFull] = useState(false);

  useEffect(() => {
    if (!anuncio) return;
    setTab('info'); setFullData(null);
    setLoadingFull(true);
    fetch(`${API_BASE_URL}/api/ml/meus-anuncios/${anuncio.id}?userId=${userId}`)
      .then(r => r.json()).then(d => { if (!d.error) setFullData(d); }).catch(() => {})
      .finally(() => setLoadingFull(false));
  }, [anuncio?.id, userId]);

  if (!anuncio) return null;
  const item    = fullData || anuncio;
  const cfg     = STATUS_CFG[item.status] || STATUS_CFG.inactive;
  const tipo    = TIPO_CFG[item.listing_type_id] || item.listing_type_id || '—';
  const attrs   = (item.attributes || []).filter(a => a.value_name).slice(0, 30);
  const pics    = item.pictures || [];
  const isCat   = !!(item.catalog_listing || item.catalog_product_id);

  return (
    <Portal>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(15,23,42,0.8)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
        <div onClick={e => e.stopPropagation()} style={{ width:'820px',maxWidth:'96vw',maxHeight:'92vh',background:'var(--theme-card)',border:'1px solid var(--theme-card-border)',color:'var(--theme-text)',borderRadius:'20px',boxShadow:'0 25px 60px rgba(0,0,0,0.4)',display:'flex',flexDirection:'column',overflow:'hidden' }}>

          {/* Header */}
          <div style={{ background:'var(--theme-header)',padding:'16px 20px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',flexShrink:0 }}>
            <div style={{ display:'flex',alignItems:'flex-start',gap:'12px',minWidth:0 }}>
              {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width:'56px',height:'56px',borderRadius:'12px',objectFit:'cover',border:'1px solid rgba(255,255,255,0.2)',flexShrink:0 }} />}
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'6px' }}>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}><cfg.icon className="w-2.5 h-2.5" />{cfg.label}</span>
                  <span style={{ fontSize:'9px',fontFamily:'monospace',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.1)',padding:'2px 6px',borderRadius:'4px' }}>{item.id}</span>
                  <span style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.1)',padding:'2px 6px',borderRadius:'4px' }}>{tipo}</span>
                  {isCat && <span style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'#93c5fd',background:'rgba(59,130,246,0.15)',border:'1px solid rgba(147,197,253,0.4)',padding:'2px 6px',borderRadius:'4px' }}>Catálogo</span>}
                </div>
                <p style={{ fontSize:'15px',fontWeight:900,color:'#fff',lineHeight:1.3,marginBottom:'4px' }}>{item.title}</p>
                <a href={item.permalink} target="_blank" rel="noopener noreferrer" style={{ fontSize:'10px',color:'#93c5fd',display:'flex',alignItems:'center',gap:'4px',textDecoration:'none' }}>
                  <ExternalLink style={{ width:'12px',height:'12px' }} />Ver no ML
                </a>
              </div>
            </div>
            <button onClick={onClose} style={{ color:'rgba(255,255,255,0.4)',background:'none',border:'none',cursor:'pointer',flexShrink:0 }}><X style={{ width:'20px',height:'20px' }} /></button>
          </div>

          {/* Stats */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid var(--theme-card-border)',flexShrink:0 }}>
            {[
              { l:'Preço',    v:formatPrice(item.price),                 c:'#10b981', ic:DollarSign },
              { l:'Estoque',  v:`${item.available_quantity ?? '—'} un`,  c:'#3b82f6', ic:Package },
              { l:'Vendidos', v:item.sold_quantity ?? '—',               c:'#6366f1', ic:TrendingUp },
              { l:'Avaliação',v:item.reviews?.rating_average ? `${item.reviews.rating_average.toFixed(1)} ★` : '—', c:'#f59e0b', ic:Star },
            ].map(({ l, v, c, ic: Ic }, i) => (
              <div key={l} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'12px 16px',borderRight:i<3?'1px solid var(--theme-card-border)':'none' }}>
                <Ic style={{ width:'18px',height:'18px',color:c,flexShrink:0 }} />
                <div>
                  <p style={{ fontSize:'15px',fontWeight:900,color:c,lineHeight:1 }}>{v}</p>
                  <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:'2px' }}>{l}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Nav buttons */}
          <div style={{ padding:'8px 16px',borderBottom:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',flexShrink:0 }}>
            <span style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginRight:'4px' }}>Abrir em:</span>
            {[
              { l:'Precificação', ic:DollarSign, r:'/ml/precos' },
              { l:'Radar Fretes', ic:Scale,      r:'/ml/auditoria' },
              { l:'Pesquisa',     ic:Search,     r:'/ml/pesquisa' },
            ].map(({ l, ic: Ic, r }) => (
              <button key={l} onClick={() => { onNavigate(r, item.id); onClose(); }}
                style={{ display:'flex',alignItems:'center',gap:'4px',padding:'4px 10px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-card)',color:'var(--theme-text)',fontSize:'9px',fontWeight:900,textTransform:'uppercase',cursor:'pointer' }}>
                <Ic style={{ width:'12px',height:'12px' }} />{l}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display:'flex',borderBottom:'1px solid var(--theme-card-border)',padding:'0 16px',flexShrink:0 }}>
            {[['info','Informações'],['fotos',`Fotos (${pics.length})`],['ficha',`Ficha (${attrs.length})`],['desc','Descrição']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{ padding:'10px 12px',fontSize:'11px',fontWeight:900,textTransform:'uppercase',borderBottom:`2px solid ${tab===k?'var(--theme-accent)':'transparent'}`,color:tab===k?'var(--theme-accent)':'var(--theme-text)',background:'none',border:'none',borderBottom:`2px solid ${tab===k?'var(--theme-accent)':'transparent'}`,cursor:'pointer',opacity:tab===k?1:0.5 }}>
                {l}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex:1,overflowY:'auto',padding:'20px' }}>
            {loadingFull && <div style={{ display:'flex',justifyContent:'center',padding:'40px' }}><Loader2 style={{ width:'24px',height:'24px',animation:'spin 1s linear infinite',color:'#3b82f6' }} /></div>}

            {!loadingFull && tab === 'info' && (
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px' }}>
                {[
                  { title:'Dados do Anúncio', rows:[['ID',item.id],['Condição',item.condition==='new'?'Novo':'Usado'],['Tipo',tipo],['Catálogo',isCat?'Sim':'Não'],['Categoria',item.category_id],['Criado em',formatDate(item.date_created)],['Atualizado',formatDate(item.last_updated)]] },
                  { title:'Logística', rows:[['Frete grátis',item.shipping?.free_shipping?'✅ Sim':'Não'],['Modo frete',item.shipping?.mode],['Retira loja',item.shipping?.local_pick_up?'Sim':'Não'],['Garantia',item.warranty||'—'],['SKU',item.seller_custom_field]] },
                ].map(({ title, rows }) => (
                  <div key={title}>
                    <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginBottom:'8px' }}>{title}</p>
                    {rows.filter(([,v]) => v).map(([k, v]) => (
                      <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--theme-card-border)',fontSize:'13px' }}>
                        <span style={{ color:'var(--theme-text)',opacity:0.5 }}>{k}</span>
                        <span style={{ fontWeight:700,color:'var(--theme-text)',maxWidth:'200px',textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v}</span>
                      </div>
                    ))}
                    {item.variations?.length > 0 && title === 'Logística' && (
                      <div style={{ marginTop:'12px' }}>
                        <p style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginBottom:'6px' }}>Variações ({item.variations.length})</p>
                        {item.variations.slice(0, 6).map((v, i) => (
                          <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'6px 10px',borderRadius:'8px',background:'var(--theme-sidebar)',marginBottom:'4px',fontSize:'12px' }}>
                            <span style={{ color:'var(--theme-text)' }}>{v.attribute_combinations?.map(c => c.value_name).join(' / ') || `Var ${i+1}`}</span>
                            <span style={{ fontWeight:700,color:'var(--theme-text)' }}>{v.available_quantity} un</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!loadingFull && tab === 'fotos' && (
              pics.length === 0
                ? <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'48px',gap:'8px',opacity:0.3 }}><ImageIcon style={{ width:'40px',height:'40px' }} /><p style={{ fontSize:'12px',fontWeight:900,textTransform:'uppercase' }}>Sem fotos</p></div>
                : <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px' }}>
                    {pics.map((pic, i) => (
                      <a key={i} href={pic.url} target="_blank" rel="noopener noreferrer"
                        style={{ borderRadius:'12px',overflow:'hidden',border:'1px solid var(--theme-card-border)',aspectRatio:'1',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--theme-sidebar)' }}>
                        <img src={pic.url} alt="" style={{ width:'100%',height:'100%',objectFit:'contain' }} />
                      </a>
                    ))}
                  </div>
            )}

            {!loadingFull && tab === 'ficha' && (
              attrs.length === 0
                ? <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'48px',gap:'8px',opacity:0.3 }}><Barcode style={{ width:'40px',height:'40px' }} /><p style={{ fontSize:'12px',fontWeight:900,textTransform:'uppercase' }}>Sem ficha</p></div>
                : <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
                    {attrs.map((a, i) => (
                      <div key={i} style={{ display:'flex',justifyContent:'space-between',borderRadius:'10px',padding:'10px 12px',background:'var(--theme-sidebar)',border:'1px solid var(--theme-card-border)',fontSize:'12px' }}>
                        <span style={{ color:'var(--theme-text)',opacity:0.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.name}</span>
                        <span style={{ fontWeight:700,color:'var(--theme-text)',marginLeft:'8px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.value_name}</span>
                      </div>
                    ))}
                  </div>
            )}

            {tab === 'desc' && (
              <div style={{ borderRadius:'12px',border:'1px solid var(--theme-card-border)',padding:'16px',background:'var(--theme-sidebar)' }}>
                {loadingFull
                  ? <div style={{ display:'flex',justifyContent:'center',padding:'32px' }}><Loader2 style={{ width:'20px',height:'20px',animation:'spin 1s linear infinite',color:'#3b82f6' }} /></div>
                  : <p style={{ fontSize:'13px',lineHeight:1.7,whiteSpace:'pre-wrap',color:'var(--theme-text)' }}>{item.description_text || 'Sem descrição cadastrada.'}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ── Card compacto ─────────────────────────────────────────────────────────────
function CardAnuncio({ anuncio, selecionado, onSel, onExpandir, tags, isNovo }) {
  const cfg    = STATUS_CFG[anuncio.status] || STATUS_CFG.inactive;
  const myTags = tags.filter(t => t.itemIds?.includes(anuncio.id));
  const isCat  = !!(anuncio.catalog_listing || anuncio.catalog_product_id);

  return (
    <div style={{ background:'var(--theme-card)',borderColor:selecionado?'#60a5fa':'var(--theme-card-border)',borderWidth:'1px',borderStyle:'solid',borderRadius:'16px',overflow:'hidden',transition:'box-shadow 0.2s',boxShadow:selecionado?'0 0 0 2px #60a5fa':undefined }}>
      <div style={{ height:'3px', backgroundColor: anuncio.status==='active'?'#10b981':anuncio.status==='paused'?'#f59e0b':'#94a3b8' }} />
      <div style={{ padding:'12px' }}>
        <div style={{ display:'flex',alignItems:'flex-start',gap:'10px' }}>
          <button onClick={() => onSel(anuncio.id)} style={{ marginTop:'2px',flexShrink:0,color:selecionado?'#3b82f6':'var(--theme-text)',opacity:selecionado?1:0.3,background:'none',border:'none',cursor:'pointer' }}>
            {selecionado ? <CheckSquare style={{ width:'16px',height:'16px',color:'#3b82f6' }} /> : <Square style={{ width:'16px',height:'16px' }} />}
          </button>
          <div style={{ width:'48px',height:'48px',borderRadius:'10px',overflow:'hidden',border:'1px solid var(--theme-card-border)',flexShrink:0,background:'var(--theme-sidebar)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            {anuncio.thumbnail ? <img src={anuncio.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : <ShoppingBag style={{ width:'20px',height:'20px',color:'var(--theme-text)',opacity:0.2 }} />}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:'4px',flexWrap:'wrap',marginBottom:'4px' }}>
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                <cfg.icon className="w-2.5 h-2.5" />{cfg.label}
              </span>
              {isNovo && <span style={{ fontSize:'9px',fontWeight:900,background:'#3b82f6',color:'#fff',padding:'1px 6px',borderRadius:'20px' }}>NOVO</span>}
              {isCat  && <span style={{ fontSize:'9px',fontWeight:900,color:'#1d4ed8',background:'#dbeafe',border:'1px solid #93c5fd',padding:'1px 6px',borderRadius:'20px' }}>CAT.</span>}
            </div>
            <p style={{ fontSize:'13px',fontWeight:700,color:'var(--theme-text)',lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{anuncio.title}</p>
            <p style={{ fontSize:'9px',fontFamily:'monospace',color:'var(--theme-text)',opacity:0.4,marginTop:'2px' }}>{anuncio.id}</p>
            {myTags.length > 0 && (
              <div style={{ display:'flex',gap:'4px',flexWrap:'wrap',marginTop:'4px' }}>
                {myTags.map(t => <span key={t.id} style={{ fontSize:'8px',fontWeight:900,padding:'2px 8px',borderRadius:'20px',border:`1px solid ${t.color.border}`,background:t.color.bg,color:t.color.text }}>{t.name}</span>)}
              </div>
            )}
          </div>
          <button onClick={() => onExpandir(anuncio)} style={{ padding:'6px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',cursor:'pointer',flexShrink:0 }}>
            <Eye style={{ width:'14px',height:'14px' }} />
          </button>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px',marginTop:'10px' }}>
          {[{ v:formatPrice(anuncio.price),l:'Preço',c:'#10b981' },{ v:anuncio.available_quantity??'—',l:'Estoque',c:'#3b82f6' },{ v:anuncio.sold_quantity??'—',l:'Vendidos',c:'#6366f1' }].map(({ v, l, c }) => (
            <div key={l} style={{ borderRadius:'8px',padding:'6px 8px',textAlign:'center',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)' }}>
              <p style={{ fontSize:'12px',fontWeight:900,color:c,lineHeight:1 }}>{v}</p>
              <p style={{ fontSize:'8px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4,marginTop:'2px' }}>{l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Linha lista ───────────────────────────────────────────────────────────────
function LinhaAnuncio({ anuncio, selecionado, onSel, onExpandir, tags, isNovo }) {
  const cfg    = STATUS_CFG[anuncio.status] || STATUS_CFG.inactive;
  const myTags = tags.filter(t => t.itemIds?.includes(anuncio.id));
  const isCat  = !!(anuncio.catalog_listing || anuncio.catalog_product_id);
  return (
    <tr style={{ background:selecionado?'rgba(59,130,246,0.07)':undefined }}>
      <td style={{ padding:'10px 12px' }}>
        <button onClick={() => onSel(anuncio.id)} style={{ color:selecionado?'#3b82f6':'var(--theme-text)',opacity:selecionado?1:0.3,background:'none',border:'none',cursor:'pointer' }}>
          {selecionado ? <CheckSquare style={{ width:'14px',height:'14px',color:'#3b82f6' }} /> : <Square style={{ width:'14px',height:'14px' }} />}
        </button>
      </td>
      <td style={{ padding:'10px 12px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'10px' }}>
          <div style={{ width:'36px',height:'36px',borderRadius:'8px',overflow:'hidden',border:'1px solid var(--theme-card-border)',flexShrink:0,background:'var(--theme-sidebar)' }}>
            {anuncio.thumbnail ? <img src={anuncio.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : <ShoppingBag style={{ width:'14px',height:'14px',margin:'11px auto',opacity:0.2 }} />}
          </div>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:'4px',flexWrap:'wrap' }}>
              <p style={{ fontSize:'13px',fontWeight:700,color:'var(--theme-text)',maxWidth:'250px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{anuncio.title}</p>
              {isNovo && <span style={{ fontSize:'8px',fontWeight:900,background:'#3b82f6',color:'#fff',padding:'1px 5px',borderRadius:'20px' }}>NOVO</span>}
              {isCat  && <span style={{ fontSize:'8px',fontWeight:900,color:'#1d4ed8',background:'#dbeafe',border:'1px solid #93c5fd',padding:'1px 5px',borderRadius:'20px' }}>CAT.</span>}
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:'6px',marginTop:'2px',flexWrap:'wrap' }}>
              <a href={`https://produto.mercadolivre.com.br/MLB-${(anuncio.id||'').replace(/^MLB/i,'')}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize:'9px',fontFamily:'monospace',color:'#3b82f6',display:'flex',alignItems:'center',gap:'2px',textDecoration:'none' }}>
                {anuncio.id}<ExternalLink style={{ width:'8px',height:'8px' }} />
              </a>
              {myTags.map(t => <span key={t.id} style={{ fontSize:'8px',fontWeight:900,padding:'1px 6px',borderRadius:'20px',border:`1px solid ${t.color.border}`,background:t.color.bg,color:t.color.text }}>{t.name}</span>)}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding:'10px 12px' }}>
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}><cfg.icon className="w-2.5 h-2.5" />{cfg.label}</span>
      </td>
      <td style={{ padding:'10px 12px',fontSize:'13px',fontWeight:900,color:'#10b981' }}>{formatPrice(anuncio.price)}</td>
      <td style={{ padding:'10px 12px',fontSize:'13px',fontWeight:700,color:'var(--theme-text)' }}>{anuncio.available_quantity??'—'}</td>
      <td style={{ padding:'10px 12px',fontSize:'13px',fontWeight:700,color:'#6366f1' }}>{anuncio.sold_quantity??'—'}</td>
      <td style={{ padding:'10px 12px',textAlign:'right' }}>
        <button onClick={() => onExpandir(anuncio)} style={{ padding:'6px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',cursor:'pointer' }}>
          <Eye style={{ width:'14px',height:'14px' }} />
        </button>
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function MeusAnuncios() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const [anuncios,    setAnuncios]    = useState(() => lsGet(LS_CACHE_KEY, []));
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastFetch,   setLastFetch]   = useState(null);
  const [novosIds,    setNovosIds]    = useState(new Set());
  const [tags,        setTagsRaw]     = useState(() => lsGet(LS_TAGS_KEY, []));
  const [hiddenIds,   setHiddenRaw]   = useState(() => new Set(lsGet(LS_HIDDEN_KEY, [])));
  const [novoTag,     setNovoTag]     = useState('');
  const [showTagForm, setShowTagForm] = useState(false);
  const [busca,          setBusca]          = useState('');
  const [filtroStatus,   setFiltroStatus]   = useState('todos');
  const [filtroTag,      setFiltroTag]      = useState(null);
  const [filtroNovos,    setFiltroNovos]    = useState(false);
  const [filtroOcultos,  setFiltroOcultos]  = useState(false);
  const [modo,           setModo]           = useState('grid');
  const [pagina,         setPagina]         = useState(1);
  const [anuncioAberto,  setAnuncioAberto]  = useState(null);
  const [selecionados,   setSelecionados]   = useState(new Set());
  const [ordenar,        setOrdenar]        = useState('vendidos');
  const autoRef = useRef(null);

  const setTags   = useCallback(fn => { setTagsRaw(prev => { const n = typeof fn === 'function' ? fn(prev) : fn; lsSet(LS_TAGS_KEY, n); return n; }); }, []);
  const setHidden = useCallback(set => { setHiddenRaw(set); lsSet(LS_HIDDEN_KEY, [...set]); }, []);

  const buscarAnuncios = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/meus-anuncios?userId=${userId}&limit=500`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const lista = Array.isArray(data) ? data : (data.items || []);
      const seenIds = new Set(lsGet(LS_SEEN_KEY, []));
      const novos   = new Set();
      lista.forEach(a => { if (!seenIds.has(a.id)) novos.add(a.id); seenIds.add(a.id); });
      lsSet(LS_SEEN_KEY, [...seenIds]);
      setNovosIds(novos);
      setAnuncios(lista);
      lsSet(LS_CACHE_KEY, lista);
      setLastFetch(Date.now());
      setPagina(1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    autoRef.current = setInterval(() => { if (anuncios.length > 0) buscarAnuncios(); }, AUTO_REFRESH);
    return () => clearInterval(autoRef.current);
  }, [buscarAnuncios, anuncios.length]);

  const contagens = anuncios.reduce((acc, a) => { acc.todos=(acc.todos||0)+1; acc[a.status]=(acc[a.status]||0)+1; return acc; }, {});

  const filtrados = anuncios
    .filter(a => {
      if (filtroOcultos) return hiddenIds.has(a.id);
      if (hiddenIds.has(a.id)) return false;
      if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false;
      if (filtroNovos && !novosIds.has(a.id)) return false;
      if (filtroTag) { const t = tags.find(t => t.id === filtroTag); if (!t || !t.itemIds?.includes(a.id)) return false; }
      if (busca) { const b = busca.toLowerCase(); return (a.title||'').toLowerCase().includes(b)||(a.id||'').toLowerCase().includes(b); }
      return true;
    })
    .sort((a, b) => {
      if (ordenar === 'vendidos') return (b.sold_quantity||0)-(a.sold_quantity||0);
      if (ordenar === 'preco')    return (b.price||0)-(a.price||0);
      if (ordenar === 'estoque')  return (b.available_quantity||0)-(a.available_quantity||0);
      return 0;
    });

  const totalPages  = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPages);
  const paginados   = filtrados.slice((paginaAtual-1)*PAGE_SIZE, paginaAtual*PAGE_SIZE);
  useEffect(() => { setPagina(1); }, [busca, filtroStatus, filtroTag, filtroNovos, filtroOcultos, ordenar]);

  const toggleSel   = id => setSelecionados(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleTodos = () => { if (selecionados.size===paginados.length) setSelecionados(new Set()); else setSelecionados(new Set(paginados.map(a=>a.id))); };

  const ocultarSelecionados = () => { const n=new Set(hiddenIds); selecionados.forEach(id=>n.add(id)); setHidden(n); setSelecionados(new Set()); };
  const mostrarOcultos      = () => setHidden(new Set());

  const criarTag = () => {
    const nome = novoTag.trim(); if (!nome) return;
    const ci = tags.length % TAG_COLORS.length;
    setTags(prev => [...prev, { id:`tag_${Date.now()}`, name:nome, color:TAG_COLORS[ci], itemIds:[] }]);
    setNovoTag(''); setShowTagForm(false);
  };
  const adicionarTagSelecionados = tagId => {
    setTags(prev => prev.map(t => { if (t.id!==tagId) return t; const ids=new Set(t.itemIds||[]); selecionados.forEach(id=>ids.add(id)); return { ...t, itemIds:[...ids] }; }));
    setSelecionados(new Set());
  };
  const removerTag = tagId => { setTags(prev => prev.filter(t=>t.id!==tagId)); if (filtroTag===tagId) setFiltroTag(null); };

  const navegarComItem = (route, mlbId) => { sessionStorage.setItem('ml_navigate_item', mlbId); navigate(route); };

  const exportCSV = () => {
    const rows = filtrados.map(a => [a.id,`"${(a.title||'').replace(/"/g,'""')}"`,a.status,a.price,a.available_quantity,a.sold_quantity].join(','));
    const blob  = new Blob([['ID,Título,Status,Preço,Estoque,Vendidos',...rows].join('\n')], { type:'text/csv;charset=utf-8' });
    Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:`anuncios_${new Date().toISOString().slice(0,10)}.csv` }).click();
  };

  const totalVendidos = anuncios.reduce((s,a)=>s+(a.sold_quantity||0),0);
  const totalEstoque  = anuncios.reduce((s,a)=>s+(a.available_quantity||0),0);
  const totalAtivos   = anuncios.filter(a=>a.status==='active').length;

  const btnStyle = (active, activeColor='var(--theme-accent)') => ({
    padding:'6px 12px', borderRadius:'6px', border:`1px solid ${active?activeColor:'var(--theme-card-border)'}`,
    background: active?activeColor:'var(--theme-sidebar)', color:active?'#fff':'var(--theme-text)',
    fontSize:'10px', fontWeight:900, textTransform:'uppercase', cursor:'pointer',
  });

  return (
    <div style={{ maxWidth:'1280px',margin:'0 auto',padding:'8px 12px',minHeight:'100vh',display:'flex',flexDirection:'column',gap:'8px' }}>

      {/* HEADER */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
          <button onClick={() => navigate('/ml')} style={{ padding:'6px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',cursor:'pointer' }}><ArrowLeft style={{ width:'16px',height:'16px' }} /></button>
          <div>
            <h2 style={{ fontSize:'15px',fontWeight:900,color:'var(--theme-text)' }}>Meus Anúncios</h2>
            <p style={{ fontSize:'11px',color:'var(--theme-text)',opacity:0.5 }}>
              {anuncios.length>0?`${anuncios.length} anúncios`:' Nenhum carregado'}
              {lastFetch&&` · ${formatDate(new Date(lastFetch))}`}
            </p>
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap' }}>
          {anuncios.length>0 && <button onClick={exportCSV} style={{ ...btnStyle(false),color:'#15803d',borderColor:'#86efac',background:'#dcfce7',display:'flex',alignItems:'center',gap:'4px' }}><Download style={{ width:'14px',height:'14px' }} />CSV</button>}
          <button onClick={buscarAnuncios} disabled={loading}
            style={{ display:'flex',alignItems:'center',gap:'6px',padding:'8px 18px',borderRadius:'10px',background:'var(--theme-accent)',color:'#fff',fontSize:'13px',fontWeight:900,textTransform:'uppercase',border:'none',cursor:loading?'not-allowed':'pointer',opacity:loading?0.6:1 }}>
            {loading ? <Loader2 style={{ width:'16px',height:'16px',animation:'spin 1s linear infinite' }} /> : <Search style={{ width:'16px',height:'16px' }} />}
            {loading?'Buscando...':'Buscar Anúncios'}
          </button>
        </div>
      </div>

      {/* STATS */}
      {anuncios.length>0 && (
        <div style={{ display:'flex',alignItems:'center',borderRadius:'12px',border:'1px solid var(--theme-card-border)',background:'var(--theme-card)',overflow:'hidden' }}>
          {[{ l:'Ativos',v:totalAtivos,c:'#10b981',d:'#10b981' },{ l:'Vendidos',v:totalVendidos,c:'#6366f1',d:'#6366f1' },{ l:'Estoque',v:`${totalEstoque} un`,c:'#3b82f6',d:'#3b82f6' },{ l:'Novos',v:novosIds.size,c:'#3b82f6',d:'#3b82f6' },{ l:'Ocultos',v:hiddenIds.size,c:'var(--theme-text)',d:'#94a3b8' }].map((m, i) => (
            <div key={i} style={{ display:'flex',alignItems:'center',gap:'8px',padding:'12px 16px',flex:1,borderRight:i<4?'1px solid var(--theme-card-border)':'none' }}>
              <div style={{ width:'8px',height:'8px',borderRadius:'50%',background:m.d,flexShrink:0 }} />
              <span style={{ fontSize:'14px',fontWeight:900,color:m.c }}>{m.v}</span>
              <span style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>{m.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* TAGS/MODELOS */}
      <div style={{ borderRadius:'12px',border:'1px solid var(--theme-card-border)',background:'var(--theme-card)',padding:'10px 12px',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap' }}>
        <span style={{ fontSize:'10px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>Modelos:</span>
        {tags.map(t => (
          <div key={t.id} style={{ display:'flex',alignItems:'center',gap:'2px' }}>
            <button onClick={() => setFiltroTag(filtroTag===t.id?null:t.id)}
              style={{ fontSize:'10px',fontWeight:900,padding:'4px 10px',borderRadius:'8px',border:`1px solid ${filtroTag===t.id?t.color.border:'var(--theme-card-border)'}`,background:filtroTag===t.id?t.color.bg:'var(--theme-sidebar)',color:filtroTag===t.id?t.color.text:'var(--theme-text)',cursor:'pointer' }}>
              {t.name}{t.itemIds?.length>0?` (${t.itemIds.length})`:''}
            </button>
            <button onClick={() => removerTag(t.id)} style={{ width:'16px',height:'16px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'none',cursor:'pointer',color:'#ef4444',marginLeft:'-4px' }}><X style={{ width:'10px',height:'10px' }} /></button>
          </div>
        ))}
        {showTagForm ? (
          <div style={{ display:'flex',alignItems:'center',gap:'4px' }}>
            <input value={novoTag} onChange={e=>setNovoTag(e.target.value)} onKeyDown={e=>e.key==='Enter'&&criarTag()} placeholder="Nome..." autoFocus
              style={{ padding:'4px 8px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'11px',width:'120px',outline:'none' }} />
            <button onClick={criarTag} style={{ padding:'4px 8px',borderRadius:'8px',background:'#3b82f6',color:'#fff',fontSize:'10px',fontWeight:900,border:'none',cursor:'pointer' }}>OK</button>
            <button onClick={() => setShowTagForm(false)} style={{ padding:'4px',borderRadius:'8px',background:'none',border:'none',cursor:'pointer',color:'var(--theme-text)',opacity:0.4 }}><X style={{ width:'14px',height:'14px' }} /></button>
          </div>
        ) : (
          <button onClick={() => setShowTagForm(true)} style={{ display:'flex',alignItems:'center',gap:'4px',padding:'4px 10px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'10px',fontWeight:900,cursor:'pointer' }}>
            <Plus style={{ width:'12px',height:'12px' }} />Novo
          </button>
        )}
        {selecionados.size>0 && tags.length>0 && (
          <>
            <div style={{ width:'1px',height:'16px',background:'var(--theme-card-border)' }} />
            <span style={{ fontSize:'9px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>Aplicar em {selecionados.size}:</span>
            {tags.map(t => (
              <button key={t.id} onClick={() => adicionarTagSelecionados(t.id)}
                style={{ display:'flex',alignItems:'center',gap:'4px',fontSize:'9px',fontWeight:900,padding:'3px 8px',borderRadius:'8px',border:`1px solid ${t.color.border}`,background:t.color.bg,color:t.color.text,cursor:'pointer' }}>
                <Tag style={{ width:'10px',height:'10px' }} />{t.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* FILTROS */}
      <div style={{ borderRadius:'12px',border:'1px solid var(--theme-card-border)',background:'var(--theme-card)',padding:'8px 12px',display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap' }}>
        <button onClick={toggleTodos} style={{ color:selecionados.size===paginados.length&&paginados.length>0?'#3b82f6':'var(--theme-text)',opacity:selecionados.size===paginados.length&&paginados.length>0?1:0.3,background:'none',border:'none',cursor:'pointer' }}>
          {selecionados.size===paginados.length&&paginados.length>0?<CheckSquare style={{ width:'16px',height:'16px',color:'#3b82f6' }}/>:<Square style={{ width:'16px',height:'16px' }}/>}
        </button>
        {[{ k:'todos',l:`Todos (${contagens.todos||0})` },{ k:'active',l:`Ativos (${contagens.active||0})` },{ k:'paused',l:`Pausados (${contagens.paused||0})` },{ k:'closed',l:`Fechados (${contagens.closed||0})` }].map(({ k, l }) => (
          <button key={k} onClick={() => setFiltroStatus(k)} style={btnStyle(filtroStatus===k)}>{l}</button>
        ))}
        <button onClick={() => setFiltroNovos(v=>!v)} style={btnStyle(filtroNovos,'#3b82f6')}>🆕 Novos ({novosIds.size})</button>
        {hiddenIds.size>0 && <button onClick={() => setFiltroOcultos(v=>!v)} style={btnStyle(filtroOcultos,'#64748b')}><EyeOff style={{ width:'12px',height:'12px',display:'inline',marginRight:'4px' }} />Ocultos ({hiddenIds.size})</button>}

        {selecionados.size>0 && (
          <div style={{ display:'flex',alignItems:'center',gap:'4px',padding:'4px 10px',borderRadius:'8px',border:'1px solid #93c5fd',background:'#eff6ff' }}>
            <span style={{ fontSize:'10px',fontWeight:900,color:'#1d4ed8' }}>{selecionados.size} sel.</span>
            <button onClick={ocultarSelecionados} title="Ocultar" style={{ padding:'2px',borderRadius:'6px',background:'none',border:'none',cursor:'pointer',color:'#475569',display:'flex' }}><EyeOff style={{ width:'14px',height:'14px' }} /></button>
            <button onClick={() => setSelecionados(new Set())} style={{ padding:'2px',borderRadius:'6px',background:'none',border:'none',cursor:'pointer',color:'#94a3b8',display:'flex' }}><X style={{ width:'12px',height:'12px' }} /></button>
          </div>
        )}
        {filtroOcultos&&hiddenIds.size>0 && (
          <button onClick={mostrarOcultos} style={{ ...btnStyle(false),color:'#15803d',borderColor:'#86efac',background:'#dcfce7',display:'flex',alignItems:'center',gap:'4px' }}>
            <Eye style={{ width:'12px',height:'12px' }} />Mostrar Todos
          </button>
        )}

        <select value={ordenar} onChange={e => setOrdenar(e.target.value)} style={{ marginLeft:'auto',padding:'6px 10px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'10px',fontWeight:900,outline:'none',textTransform:'uppercase' }}>
          <option value="vendidos">↓ Mais vendidos</option>
          <option value="preco">↓ Maior preço</option>
          <option value="estoque">↓ Maior estoque</option>
        </select>

        <div style={{ display:'flex',borderRadius:'8px',padding:'2px',background:'var(--theme-sidebar)' }}>
          {[['grid',LayoutGrid],['lista',List]].map(([m, Ic]) => (
            <button key={m} onClick={() => setModo(m)} style={{ padding:'6px',borderRadius:'6px',background:modo===m?'var(--theme-card)':'transparent',color:'var(--theme-text)',border:'none',cursor:'pointer',display:'flex' }}>
              <Ic style={{ width:'14px',height:'14px' }} />
            </button>
          ))}
        </div>

        <div style={{ position:'relative' }}>
          <Search style={{ position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',width:'14px',height:'14px',color:'var(--theme-text)',opacity:0.4 }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
            style={{ paddingLeft:'30px',paddingRight:'12px',paddingTop:'6px',paddingBottom:'6px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'12px',width:'180px',outline:'none' }} />
        </div>
      </div>

      {/* LOADING */}
      {loading && <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'64px',gap:'12px' }}><Loader2 style={{ width:'32px',height:'32px',animation:'spin 1s linear infinite',color:'#3b82f6' }} /><p style={{ fontSize:'12px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.4 }}>Buscando no ML...</p></div>}

      {/* ERROR */}
      {error&&!loading && <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'48px',gap:'12px',textAlign:'center' }}><AlertTriangle style={{ width:'32px',height:'32px',color:'#ef4444' }} /><p style={{ fontSize:'13px',fontWeight:900,color:'#ef4444' }}>{error}</p><button onClick={buscarAnuncios} style={{ padding:'8px 16px',borderRadius:'10px',background:'#fee2e2',color:'#b91c1c',border:'1px solid #fca5a5',fontSize:'12px',fontWeight:900,cursor:'pointer' }}>Tentar novamente</button></div>}

      {/* EMPTY */}
      {!loading&&!error&&anuncios.length===0 && (
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'80px',gap:'16px',textAlign:'center' }}>
          <div style={{ width:'80px',height:'80px',background:'#FFE600',borderRadius:'24px',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 10px 30px rgba(0,0,0,0.15)' }}><ShoppingBag style={{ width:'40px',height:'40px',color:'#1e293b' }} /></div>
          <div><h3 style={{ fontSize:'18px',fontWeight:900,color:'var(--theme-text)',marginBottom:'4px' }}>Nenhum anúncio carregado</h3><p style={{ fontSize:'13px',color:'var(--theme-text)',opacity:0.5 }}>Clique em "Buscar Anúncios" para carregar.</p></div>
          <button onClick={buscarAnuncios} style={{ display:'flex',alignItems:'center',gap:'8px',padding:'12px 24px',borderRadius:'12px',background:'var(--theme-accent)',color:'#fff',fontSize:'13px',fontWeight:900,border:'none',cursor:'pointer' }}><Search style={{ width:'16px',height:'16px' }} />Buscar Agora</button>
        </div>
      )}

      {/* GRID */}
      {!loading&&!error&&filtrados.length>0&&modo==='grid' && (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:'12px' }}>
          {paginados.map(a => <CardAnuncio key={a.id} anuncio={a} selecionado={selecionados.has(a.id)} onSel={toggleSel} onExpandir={setAnuncioAberto} tags={tags} isNovo={novosIds.has(a.id)} />)}
        </div>
      )}

      {/* LISTA */}
      {!loading&&!error&&filtrados.length>0&&modo==='lista' && (
        <div style={{ borderRadius:'16px',border:'1px solid var(--theme-card-border)',background:'var(--theme-card)',overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead style={{ background:'var(--theme-sidebar)',borderBottom:'1px solid var(--theme-card-border)' }}>
              <tr>{['','Anúncio','Status','Preço','Estoque','Vendidos',''].map((h,i) => <th key={i} style={{ padding:'10px 12px',fontSize:'10px',fontWeight:900,textTransform:'uppercase',color:'var(--theme-text)',opacity:0.5,textAlign:'left' }}>{h}</th>)}</tr>
            </thead>
            <tbody>{paginados.map((a,i) => <React.Fragment key={a.id}>{i>0&&<tr><td colSpan={7} style={{ height:'1px',background:'var(--theme-card-border)',padding:0 }}></td></tr>}<LinhaAnuncio anuncio={a} selecionado={selecionados.has(a.id)} onSel={toggleSel} onExpandir={setAnuncioAberto} tags={tags} isNovo={novosIds.has(a.id)} /></React.Fragment>)}</tbody>
          </table>
        </div>
      )}

      {/* PAGINAÇÃO */}
      {totalPages>1 && (
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:'4px' }}>
          <span style={{ fontSize:'12px',color:'var(--theme-text)',opacity:0.5 }}>{filtrados.length} anúncio(s) · Pág {paginaAtual}/{totalPages}</span>
          <div style={{ display:'flex',alignItems:'center',gap:'4px' }}>
            {[['«',()=>setPagina(1)],['‹ Ant.',()=>setPagina(p=>Math.max(1,p-1))]].map(([l,fn])=>(
              <button key={l} onClick={fn} disabled={paginaAtual===1} style={{ padding:'6px 10px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'11px',fontWeight:900,cursor:'pointer',opacity:paginaAtual===1?0.3:1 }}>{l}</button>
            ))}
            {Array.from({ length:Math.min(5,totalPages) }, (_,i) => {
              const start = Math.max(1,Math.min(paginaAtual-2,totalPages-4));
              const pg = start+i;
              return pg<=totalPages ? <button key={pg} onClick={()=>setPagina(pg)} style={{ width:'32px',height:'32px',borderRadius:'8px',border:'1px solid',borderColor:paginaAtual===pg?'var(--theme-accent)':'var(--theme-card-border)',background:paginaAtual===pg?'var(--theme-accent)':'var(--theme-sidebar)',color:paginaAtual===pg?'#fff':'var(--theme-text)',fontSize:'11px',fontWeight:900,cursor:'pointer' }}>{pg}</button> : null;
            })}
            {[['Próx. ›',()=>setPagina(p=>Math.min(totalPages,p+1))],['»',()=>setPagina(totalPages)]].map(([l,fn])=>(
              <button key={l} onClick={fn} disabled={paginaAtual===totalPages} style={{ padding:'6px 10px',borderRadius:'8px',border:'1px solid var(--theme-card-border)',background:'var(--theme-sidebar)',color:'var(--theme-text)',fontSize:'11px',fontWeight:900,cursor:'pointer',opacity:paginaAtual===totalPages?0.3:1 }}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {/* MODAL */}
      {anuncioAberto && <ModalDetalhes anuncio={anuncioAberto} userId={userId} onClose={() => setAnuncioAberto(null)} onNavigate={(r,id) => { sessionStorage.setItem('ml_navigate_item',id); navigate(r); }} />}
    </div>
  );
}