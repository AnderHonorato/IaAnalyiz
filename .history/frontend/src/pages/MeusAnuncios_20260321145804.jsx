// src/pages/MeusAnuncios.jsx
// Página dedicada a listar e gerenciar os anúncios próprios do ML do usuário.
// Exibe cards compactos com expand para modal flutuante com todos os detalhes.
// Exporta hook `useMeusAnuncios` para reuso em outras páginas (ex: MlResearch, Precificação).

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Search, ExternalLink, ShoppingBag, Loader2,
  ChevronDown, ChevronUp, X, Package, DollarSign, BarChart2, Tag,
  Weight, Ruler, Barcode, Star, CheckCircle2, XCircle, AlertTriangle,
  Eye, Filter, Download, Square, CheckSquare, List, LayoutGrid,
  TrendingUp, TrendingDown, Minus, Clock, Archive, Zap,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

const STATUS_CFG = {
  active:   { label: 'Ativo',    color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: CheckCircle2 },
  paused:   { label: 'Pausado',  color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   icon: AlertTriangle },
  closed:   { label: 'Fechado',  color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     icon: XCircle },
  inactive: { label: 'Inativo',  color: 'text-slate-500',   bg: 'bg-slate-50',    border: 'border-slate-200',   icon: Archive },
  under_review: { label: 'Em revisão', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: Clock },
};

const TIPO_CFG = {
  gold_pro:      'Premium',
  gold_special:  'Clássico',
  gold:          'Ouro',
  silver:        'Prata',
  bronze:        'Bronze',
  free:          'Grátis',
};

// ── Hook exportável para reuso em outras páginas ──────────────────────────────

export function useMeusAnuncios(userId) {
  const [anuncios,    setAnuncios]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const [error,       setError]       = useState(null);

  const buscar = useCallback(async (force = false) => {
    if (!userId) return;
    // Cache de 5 min — não recarrega sem forçar
    if (!force && lastFetch && Date.now() - lastFetch < 5 * 60_000) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/meus-anuncios?userId=${userId}&limit=200`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnuncios(Array.isArray(data) ? data : (data.items || []));
      setLastFetch(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId, lastFetch]);

  useEffect(() => { buscar(); }, [userId]);

  return { anuncios, loading, error, recarregar: () => buscar(true) };
}

// ── Modal Detalhes ─────────────────────────────────────────────────────────────

function ModalDetalhes({ anuncio, onClose }) {
  const [tab, setTab] = useState('info');
  if (!anuncio) return null;

  const cfg    = STATUS_CFG[anuncio.status] || STATUS_CFG.inactive;
  const Icon   = cfg.icon;
  const tipo   = TIPO_CFG[anuncio.listing_type_id] || anuncio.listing_type_id || '—';
  const attrs  = (anuncio.attributes || []).filter(a => a.value_name).slice(0, 20);
  const pics   = anuncio.pictures || [];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '760px', maxWidth: '96vw', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-start justify-between gap-3 shrink-0"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
        >
          <div className="flex items-start gap-3 min-w-0">
            {anuncio.thumbnail && (
              <img src={anuncio.thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/20 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                  <Icon className="w-2.5 h-2.5" />{cfg.label}
                </span>
                <span className="text-[8px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">{anuncio.id}</span>
                <span className="text-[8px] font-black text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded uppercase">{tipo}</span>
              </div>
              <h3 className="text-sm font-black text-white leading-snug line-clamp-2">{anuncio.title}</h3>
              <a
                href={anuncio.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 mt-0.5"
              >
                <ExternalLink className="w-3 h-3" />Ver no Mercado Livre
              </a>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white flex-shrink-0 mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats rápidos */}
        <div className="grid grid-cols-4 border-b border-slate-100 shrink-0">
          {[
            { label: 'Preço',    value: formatPrice(anuncio.price),              color: 'text-emerald-700', icon: DollarSign },
            { label: 'Estoque',  value: `${anuncio.available_quantity ?? '—'} un`, color: 'text-blue-700',    icon: Package },
            { label: 'Vendidos', value: anuncio.sold_quantity ?? '—',            color: 'text-indigo-700',  icon: TrendingUp },
            { label: 'Avaliação',value: anuncio.reviews?.rating_average ? `${anuncio.reviews.rating_average.toFixed(1)} ★` : '—', color: 'text-amber-700', icon: Star },
          ].map(({ label, value, color, icon: IcStat }) => (
            <div key={label} className="flex items-center gap-2 px-4 py-3 border-r border-slate-100 last:border-0">
              <IcStat className={`w-4 h-4 ${color} flex-shrink-0`} />
              <div>
                <p className={`text-sm font-black leading-none ${color}`}>{value}</p>
                <p className="text-[9px] text-slate-400 uppercase font-black mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-4 shrink-0">
          {[['info','Informações'],['fotos',`Fotos (${pics.length})`],['ficha',`Ficha (${attrs.length})`],['desc','Descrição']].map(([k,l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-[10px] font-black uppercase border-b-2 transition-all ${tab === k ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Conteúdo das abas */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* Aba Info */}
          {tab === 'info' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase">Dados do Anúncio</p>
                {[
                  ['ID',          anuncio.id],
                  ['Condição',    anuncio.condition === 'new' ? 'Novo' : 'Usado'],
                  ['Tipo',        tipo],
                  ['Categoria',   anuncio.category_id],
                  ['Modo',        anuncio.buying_mode],
                  ['Moeda',       anuncio.currency_id],
                  ['Criado em',   formatDate(anuncio.date_created)],
                  ['Atualizado',  formatDate(anuncio.last_updated)],
                ].map(([k, v]) => v && (
                  <div key={k} className="flex justify-between items-center py-1 border-b border-slate-50 text-xs">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-bold text-slate-700 text-right max-w-[180px] truncate">{v}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase">Logística</p>
                {[
                  ['Frete grátis', anuncio.shipping?.free_shipping ? 'Sim' : 'Não'],
                  ['Modo frete',   anuncio.shipping?.mode],
                  ['Retira loja',  anuncio.shipping?.local_pick_up ? 'Sim' : 'Não'],
                  ['Garantia',     anuncio.warranty || '—'],
                  ['SKU (seu)',    anuncio.seller_custom_field],
                ].map(([k, v]) => v && (
                  <div key={k} className="flex justify-between items-center py-1 border-b border-slate-50 text-xs">
                    <span className="text-slate-400">{k}</span>
                    <span className={`font-bold text-right ${k === 'Frete grátis' && v === 'Sim' ? 'text-emerald-600' : 'text-slate-700'}`}>{v}</span>
                  </div>
                ))}
                {/* Variações */}
                {anuncio.variations?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">Variações ({anuncio.variations.length})</p>
                    <div className="space-y-1">
                      {anuncio.variations.slice(0, 5).map((v, i) => (
                        <div key={i} className="bg-slate-50 rounded-lg px-2 py-1 flex justify-between text-xs">
                          <span className="text-slate-600 truncate">{v.attribute_combinations?.map(c => c.value_name).join(' / ') || `Var ${i + 1}`}</span>
                          <span className="font-bold text-slate-700 ml-2">{v.available_quantity} un</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aba Fotos */}
          {tab === 'fotos' && (
            pics.length === 0
              ? <div className="flex flex-col items-center py-12 gap-2 text-slate-300"><ShoppingBag className="w-10 h-10" /><p className="text-xs font-black uppercase text-slate-400">Sem fotos</p></div>
              : <div className="grid grid-cols-3 gap-3">
                  {pics.map((pic, i) => (
                    <div key={i} className="rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-50">
                      <img src={pic.url} alt="" className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
          )}

          {/* Aba Ficha técnica */}
          {tab === 'ficha' && (
            attrs.length === 0
              ? <div className="flex flex-col items-center py-12 gap-2 text-slate-300"><Barcode className="w-10 h-10" /><p className="text-xs font-black uppercase text-slate-400">Sem ficha técnica</p></div>
              : <div className="grid grid-cols-2 gap-2">
                  {attrs.map((a, i) => (
                    <div key={i} className="flex justify-between bg-slate-50 px-3 py-2 rounded-xl text-xs border border-slate-100">
                      <span className="text-slate-400 truncate">{a.name}</span>
                      <span className="font-bold text-slate-700 truncate ml-2">{a.value_name}</span>
                    </div>
                  ))}
                </div>
          )}

          {/* Aba Descrição */}
          {tab === 'desc' && (
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {anuncio.description_text || 'Sem descrição cadastrada.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card compacto ─────────────────────────────────────────────────────────────

function CardAnuncio({ anuncio, selecionado, onSel, onExpandir }) {
  const cfg  = STATUS_CFG[anuncio.status] || STATUS_CFG.inactive;
  const Icon = cfg.icon;
  const tipo = TIPO_CFG[anuncio.listing_type_id] || '—';

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md ${cfg.border} ${selecionado ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="h-0.5" style={{ backgroundColor: anuncio.status === 'active' ? '#10b981' : anuncio.status === 'paused' ? '#f59e0b' : '#94a3b8' }} />
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          {/* Checkbox */}
          <button onClick={() => onSel(anuncio.id)} className="mt-1 flex-shrink-0 text-slate-400 hover:text-blue-500">
            {selecionado ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}
          </button>

          {/* Thumb */}
          <div className="w-11 h-11 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50 flex items-center justify-center">
            {anuncio.thumbnail
              ? <img src={anuncio.thumbnail} alt="" className="w-full h-full object-cover" />
              : <ShoppingBag className="w-5 h-5 text-slate-300" />}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap mb-0.5">
              <span className={`inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                <Icon className="w-2.5 h-2.5" />{cfg.label}
              </span>
              <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{anuncio.id}</span>
              <span className="text-[8px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-black">{tipo}</span>
            </div>
            <p className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug">{anuncio.title}</p>
          </div>

          {/* Expandir */}
          <button
            onClick={() => onExpandir(anuncio)}
            className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200 flex-shrink-0 transition-all"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Métricas compactas */}
        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
          <div className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-black text-slate-800 leading-none">{formatPrice(anuncio.price)}</p>
            <p className="text-[8px] text-slate-400 uppercase font-black mt-0.5">Preço</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-black text-blue-700 leading-none">{anuncio.available_quantity ?? '—'}</p>
            <p className="text-[8px] text-blue-400 uppercase font-black mt-0.5">Estoque</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs font-black text-indigo-700 leading-none">{anuncio.sold_quantity ?? '—'}</p>
            <p className="text-[8px] text-indigo-400 uppercase font-black mt-0.5">Vendidos</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Linha compacta (modo lista) ───────────────────────────────────────────────

function LinhaAnuncio({ anuncio, selecionado, onSel, onExpandir }) {
  const cfg  = STATUS_CFG[anuncio.status] || STATUS_CFG.inactive;
  const Icon = cfg.icon;

  return (
    <tr className={`hover:bg-slate-50/80 transition-colors ${selecionado ? 'bg-blue-50/30' : ''}`}>
      <td className="px-3 py-2.5">
        <button onClick={() => onSel(anuncio.id)} className="text-slate-400">
          {selecionado ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50">
            {anuncio.thumbnail
              ? <img src={anuncio.thumbnail} alt="" className="w-full h-full object-cover" />
              : <ShoppingBag className="w-4 h-4 text-slate-300 m-auto mt-1" />}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800 truncate max-w-xs">{anuncio.title}</p>
            <a
              href={anuncio.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-mono text-blue-500 hover:underline flex items-center gap-0.5"
            >
              {anuncio.id}<ExternalLink className="w-2 h-2" />
            </a>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
          <Icon className="w-2.5 h-2.5" />{cfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs font-black text-emerald-700">{formatPrice(anuncio.price)}</td>
      <td className="px-3 py-2.5 text-xs font-bold text-slate-600">{anuncio.available_quantity ?? '—'}</td>
      <td className="px-3 py-2.5 text-xs font-bold text-indigo-600">{anuncio.sold_quantity ?? '—'}</td>
      <td className="px-3 py-2.5">
        <button
          onClick={() => onExpandir(anuncio)}
          className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200 transition-all"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export default function MeusAnuncios() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const { anuncios, loading, error, recarregar } = useMeusAnuncios(userId);

  const [busca,        setBusca]        = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modo,         setModo]         = useState('grid'); // grid | lista
  const [anuncioAberto, setAnuncioAberto] = useState(null);
  const [selecionados,  setSelecionados]  = useState(new Set());
  const [ordenar,       setOrdenar]       = useState('vendidos'); // vendidos | preco | estoque

  // ── Filtros ────────────────────────────────────────────────────────────────

  const filtrados = anuncios
    .filter(a => {
      if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false;
      if (busca) {
        const b = busca.toLowerCase();
        return (a.title || '').toLowerCase().includes(b) || (a.id || '').toLowerCase().includes(b);
      }
      return true;
    })
    .sort((a, b) => {
      if (ordenar === 'vendidos') return (b.sold_quantity || 0) - (a.sold_quantity || 0);
      if (ordenar === 'preco')    return (b.price || 0) - (a.price || 0);
      if (ordenar === 'estoque')  return (b.available_quantity || 0) - (a.available_quantity || 0);
      return 0;
    });

  // ── Contagens status ────────────────────────────────────────────────────────

  const contagens = anuncios.reduce((acc, a) => {
    acc.todos = (acc.todos || 0) + 1;
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  // ── Seleção ─────────────────────────────────────────────────────────────────

  const toggleSel = id => setSelecionados(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const toggleTodos = () => {
    if (selecionados.size === filtrados.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrados.map(a => a.id)));
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const rows = filtrados.map(a => [
      a.id,
      `"${(a.title || '').replace(/"/g, '""')}"`,
      a.status,
      a.price,
      a.available_quantity,
      a.sold_quantity,
      TIPO_CFG[a.listing_type_id] || a.listing_type_id,
      a.shipping?.free_shipping ? 'Sim' : 'Não',
    ].join(','));
    const csv  = ['ID,Título,Status,Preço,Estoque,Vendidos,Tipo,FreteGrátis', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `meus_anuncios_${new Date().toISOString().slice(0, 10)}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  };

  // ── Stats rápidos ──────────────────────────────────────────────────────────

  const totalVendidos  = anuncios.reduce((s, a) => s + (a.sold_quantity || 0), 0);
  const totalEstoque   = anuncios.reduce((s, a) => s + (a.available_quantity || 0), 0);
  const totalAtivos    = anuncios.filter(a => a.status === 'active').length;
  const totalPausados  = anuncios.filter(a => a.status === 'paused').length;

  const FILTROS_STATUS = [
    { k: 'todos',  label: `Todos (${contagens.todos || 0})` },
    { k: 'active', label: `Ativos (${contagens.active || 0})` },
    { k: 'paused', label: `Pausados (${contagens.paused || 0})` },
    { k: 'closed', label: `Fechados (${contagens.closed || 0})` },
  ];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col" style={{ minHeight: '100vh' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/ml')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base font-black text-slate-800">Meus Anúncios</h2>
            <p className="text-xs text-slate-400">{anuncios.length} anúncio(s) encontrado(s) no seu catálogo ML</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <button
            onClick={exportCSV}
            disabled={filtrados.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />CSV
          </button>
          <button
            onClick={recarregar}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Atualizar
          </button>
        </div>
      </div>

      {/* STATS BAR */}
      {anuncios.length > 0 && (
        <div className="flex items-center gap-0 bg-white border border-slate-200 rounded-xl mb-3 shrink-0 overflow-hidden">
          {[
            { label: 'Ativos',    value: totalAtivos,   color: 'text-emerald-700', dot: 'bg-emerald-400' },
            { label: 'Pausados',  value: totalPausados, color: 'text-amber-700',   dot: 'bg-amber-400' },
            { label: 'Vendidos',  value: totalVendidos, color: 'text-indigo-700',  dot: 'bg-indigo-400' },
            { label: 'Estoque',   value: `${totalEstoque} un`, color: 'text-blue-700', dot: 'bg-blue-400' },
          ].map((m, i) => (
            <div key={i} className={`flex items-center gap-2 px-4 py-2.5 flex-1 ${i < 3 ? 'border-r border-slate-100' : ''}`}>
              <div className={`w-2 h-2 rounded-full ${m.dot}`} />
              <span className={`text-sm font-black ${m.color}`}>{m.value}</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{m.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* FILTROS + BUSCA */}
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2 mb-3 flex-wrap">
        {/* Select todos */}
        <button onClick={toggleTodos} className="p-1 text-slate-400 hover:text-blue-500">
          {selecionados.size > 0 && selecionados.size === filtrados.length
            ? <CheckSquare className="w-4 h-4 text-blue-500" />
            : <Square className="w-4 h-4" />}
        </button>

        {/* Filtros status */}
        {FILTROS_STATUS.map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setFiltroStatus(k)}
            className={`px-2.5 py-1.5 rounded text-[9px] font-black uppercase border transition-all ${
              filtroStatus === k
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}

        {/* Ordenar */}
        <select
          value={ordenar}
          onChange={e => setOrdenar(e.target.value)}
          className="ml-auto px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-600 outline-none"
        >
          <option value="vendidos">↓ Mais vendidos</option>
          <option value="preco">↓ Maior preço</option>
          <option value="estoque">↓ Maior estoque</option>
        </select>

        {/* Modo grid/lista */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg">
          <button onClick={() => setModo('grid')} className={`p-1.5 rounded ${modo === 'grid' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
          <button onClick={() => setModo('lista')} className={`p-1.5 rounded ${modo === 'lista' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400'}`}><List className="w-3.5 h-3.5" /></button>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título ou ID..."
            className="pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 text-xs w-52"
          />
        </div>

        {/* Lote selecionado */}
        {selecionados.size > 0 && (
          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
            <span className="text-[9px] font-black text-blue-700">{selecionados.size} sel.</span>
          </div>
        )}
      </div>

      {/* LOADING / ERROR */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
          <p className="text-xs font-black text-slate-400 uppercase">Buscando seus anúncios no ML...</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <p className="text-sm font-black text-red-600">Erro ao carregar anúncios</p>
          <p className="text-xs text-slate-400 max-w-sm">{error}</p>
          <button onClick={recarregar} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase hover:bg-red-100">
            Tentar novamente
          </button>
        </div>
      )}

      {/* EMPTY */}
      {!loading && !error && anuncios.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-20 h-20 bg-[#FFE600] rounded-3xl flex items-center justify-center shadow-lg">
            <ShoppingBag className="w-10 h-10 text-slate-900" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 mb-1">Nenhum anúncio encontrado</h3>
            <p className="text-sm text-slate-400">Certifique-se que o Mercado Livre está conectado nas configurações.</p>
          </div>
          <button onClick={recarregar} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-black uppercase hover:bg-slate-700">
            <RefreshCw className="w-4 h-4" />Atualizar
          </button>
        </div>
      )}

      {/* GRID */}
      {!loading && !error && filtrados.length > 0 && modo === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" style={{ animation: 'fadeIn 0.2s ease' }}>
          {filtrados.map(a => (
            <CardAnuncio
              key={a.id}
              anuncio={a}
              selecionado={selecionados.has(a.id)}
              onSel={toggleSel}
              onExpandir={setAnuncioAberto}
            />
          ))}
        </div>
      )}

      {/* LISTA */}
      {!loading && !error && filtrados.length > 0 && modo === 'lista' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" style={{ animation: 'fadeIn 0.2s ease' }}>
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[9px] font-black uppercase text-slate-400">
                <th className="px-3 py-2.5 w-8">
                  <button onClick={toggleTodos} className="text-slate-400">
                    {selecionados.size === filtrados.length && filtrados.length > 0
                      ? <CheckSquare className="w-3.5 h-3.5" />
                      : <Square className="w-3.5 h-3.5" />}
                  </button>
                </th>
                <th className="px-3 py-2.5">Anúncio</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Preço</th>
                <th className="px-3 py-2.5">Estoque</th>
                <th className="px-3 py-2.5">Vendidos</th>
                <th className="px-3 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.map(a => (
                <LinhaAnuncio
                  key={a.id}
                  anuncio={a}
                  selecionado={selecionados.has(a.id)}
                  onSel={toggleSel}
                  onExpandir={setAnuncioAberto}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DETALHES */}
      {anuncioAberto && (
        <ModalDetalhes anuncio={anuncioAberto} onClose={() => setAnuncioAberto(null)} />
      )}
    </div>
  );
}