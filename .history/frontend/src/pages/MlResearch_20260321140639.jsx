// src/pages/MlResearch.jsx
// Pesquisa de Anúncios ML — preços, vendedores, concorrentes

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  XCircle, Clock, AlertTriangle, BarChart2, ShoppingBag, Star,
  TrendingUp, TrendingDown, Package, ChevronDown, ChevronUp,
  Download, Zap, ArrowLeft, Users, Activity, Filter, X,
  Medal, Award, ChevronRight,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ── Parser de MLB ID — prioridade inteligente ─────────────────────────────────
// Problema: URLs de catálogo têm /p/MLBxxx e item_id:MLByyy
// O item_id é de outro vendedor (pode dar 403), então usamos /p/ ou slug
function extrairMLBId(input) {
  if (!input) return null;
  const raw = input.trim();

  // 1. Já é um ID direto: MLB123456 ou MLB-123456
  if (/^MLB-?\d+$/i.test(raw)) return raw.toUpperCase().replace('-', '');

  // 2. /p/MLBxxxx no path — produto de catálogo (ID público, sempre funciona)
  const pMatch = raw.match(/\/p\/MLB[-]?(\d+)/i);
  if (pMatch) return `MLB${pMatch[1]}`;

  // 3. Slug /nome-produto-MLB123456 no path (anúncio direto)
  //    Ignora tudo depois de ? ou #
  const cleanPath = raw.split('?')[0].split('#')[0];
  const slugMatch = cleanPath.match(/\/[^/]+-MLB[-]?(\d+)/i);
  if (slugMatch) return `MLB${slugMatch[1]}`;

  // 4. item_id como fallback apenas se não houver /p/ (item específico, pode dar 403)
  const itemIdMatch = raw.match(/item[_-]?id[=:]MLB[-]?(\d+)/i);
  if (itemIdMatch) return `MLB${itemIdMatch[1]}`;

  // 5. Qualquer MLB no texto
  const anyMatch = raw.match(/MLB[-]?(\d+)/i);
  if (anyMatch) return `MLB${anyMatch[1]}`;

  return null;
}

function formatPrice(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function safeDate(val) {
  if (!val) return '—';
  try { const d = new Date(val); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

// ── STATUS CONFIG ──────────────────────────────────────────────────────────────
const STATUS = {
  pendente:   { label: 'Pendente',   color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400',            icon: Clock },
  analisando: { label: 'Analisando', color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-400',             icon: Loader2 },
  concluido:  { label: 'Concluído',  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400',          icon: CheckCircle2 },
  erro:       { label: 'Erro',       color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-400',              icon: XCircle },
  fila:       { label: 'Na fila',    color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200',  dot: 'bg-purple-400',           icon: Clock },
};

// ── CARD DE RESULTADO ─────────────────────────────────────────────────────────
function CardResultado({ item, onRemover }) {
  const [expandido, setExpandido]             = useState(false);
  const [mostrarVendedores, setMostrarVendedores] = useState(false);

  const cfg  = STATUS[item.status] || STATUS.pendente;
  const Icon = cfg.icon;
  const d    = item.dados;

  const concorrentes = d?.concorrentes || [];
  const precoMedio   = d?.precoMedio;
  const meuPreco     = d?.preco;
  const abaixoMedia  = meuPreco && precoMedio && meuPreco < precoMedio;

  // Monta URL compacta para exibição
  const urlCompacta = (() => {
    try {
      const u = new URL(item.url);
      const segs = u.pathname.split('/').filter(Boolean);
      const slug = segs[0] || '';
      const resumo = slug.length > 45 ? slug.substring(0, 45) + '…' : slug;
      return `${u.hostname}/${resumo}`;
    } catch {
      return item.url.length > 60 ? item.url.substring(0, 60) + '…' : item.url;
    }
  })();

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${cfg.border}`}>
      {/* Barra colorida de status — sem misturar background + backgroundSize */}
      <div
        className="h-1"
        style={item.status === 'analisando'
          ? { backgroundImage: 'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)', backgroundSize: '200%', animation: 'slideGrad 1.5s linear infinite' }
          : { backgroundColor: cfg.dot.replace('bg-', '').includes(' ') ? '#3b82f6' : undefined, background: item.status === 'pendente' ? '#fbbf24' : item.status === 'concluido' ? '#34d399' : item.status === 'erro' ? '#f87171' : item.status === 'fila' ? '#a78bfa' : '#94a3b8' }}
      />

      <div className="p-4">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3">
          {/* Thumb */}
          <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50 flex items-center justify-center">
            {d?.thumbnail
              ? <img src={d.thumbnail} alt="" className="w-full h-full object-cover" />
              : <ShoppingBag className="w-6 h-6 text-slate-300" />}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                <Icon className={`w-3 h-3 ${item.status === 'analisando' ? 'animate-spin' : ''}`} />
                {cfg.label}
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.mlbId}</span>
              {d?.status && (
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${d.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {d.status === 'active' ? 'Ativo' : 'Inativo'}
                </span>
              )}
            </div>

            {/* Título quando disponível, senão URL compacta */}
            <p className="text-sm font-bold text-slate-800 leading-snug truncate">
              {d?.titulo || urlCompacta}
            </p>

            {/* URL original compacta abaixo */}
            {!d?.titulo && (
              <p className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">{urlCompacta}</p>
            )}

            {item.status === 'erro' && (
              <p className="text-xs text-red-500 mt-1">{item.erro}</p>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {d?.link && (
              <a href={d.link} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {item.status === 'concluido' && (
              <button onClick={() => setExpandido(v => !v)}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200">
                {expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
            <button onClick={() => onRemover(item.id)}
              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-100">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Métricas rápidas */}
        {item.status === 'concluido' && d && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
              <p className="text-sm font-black text-slate-800 leading-none">{formatPrice(d.preco)}</p>
              <p className="text-[9px] text-slate-400 uppercase font-black mt-1">Meu Preço</p>
            </div>
            <div className={`border rounded-xl p-2.5 text-center ${abaixoMedia ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              <p className={`text-sm font-black leading-none ${abaixoMedia ? 'text-emerald-700' : 'text-amber-700'}`}>{formatPrice(precoMedio)}</p>
              <p className={`text-[9px] uppercase font-black mt-1 ${abaixoMedia ? 'text-emerald-500' : 'text-amber-500'}`}>Média Mercado</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
              <p className="text-sm font-black text-blue-700 leading-none">{d.totalVendedores || concorrentes.length + 1}</p>
              <p className="text-[9px] text-blue-400 uppercase font-black mt-1">Vendedores</p>
            </div>
          </div>
        )}

        {/* Spinner analisando */}
        {item.status === 'analisando' && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            <span className="animate-pulse">Buscando dados do anúncio e concorrentes...</span>
          </div>
        )}

        {/* Expandido */}
        {expandido && d && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                {d.condicao && <div className="flex justify-between"><span className="text-slate-400">Condição</span><span className="font-bold text-slate-700">{d.condicao}</span></div>}
                {d.estoque !== undefined && <div className="flex justify-between"><span className="text-slate-400">Estoque</span><span className="font-bold text-slate-700">{d.estoque} un</span></div>}
                {d.vendidos !== undefined && <div className="flex justify-between"><span className="text-slate-400">Vendidos</span><span className="font-bold text-emerald-600">{d.vendidos}</span></div>}
                {d.tipoAnuncio && <div className="flex justify-between"><span className="text-slate-400">Tipo</span><span className="font-bold text-slate-700">{d.tipoAnuncio}</span></div>}
              </div>
              <div className="space-y-1.5">
                {d.frete && <div className="flex justify-between"><span className="text-slate-400">Frete</span><span className={`font-bold ${d.freteGratis ? 'text-emerald-600' : 'text-slate-700'}`}>{d.freteGratis ? '🟢 Grátis' : d.frete}</span></div>}
                {d.precoMin !== undefined && <div className="flex justify-between"><span className="text-slate-400">Menor preço</span><span className="font-bold text-emerald-600">{formatPrice(d.precoMin)}</span></div>}
                {d.precoMax !== undefined && <div className="flex justify-between"><span className="text-slate-400">Maior preço</span><span className="font-bold text-slate-700">{formatPrice(d.precoMax)}</span></div>}
                {d.avaliacoes !== undefined && <div className="flex justify-between"><span className="text-slate-400">Avaliações</span><span className="font-bold text-amber-600 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 stroke-amber-400" />{d.avaliacoes}</span></div>}
              </div>
            </div>

            {/* Vendedor principal */}
            {d.seller && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center gap-1"><Users className="w-3 h-3" />Vendedor Principal</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-800">{d.seller.nome}</p>
                    {d.seller.reputacao && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className={`w-2 h-2 rounded-full ${d.seller.reputacao === 'platinum' ? 'bg-blue-400' : d.seller.reputacao === 'gold' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                        <span className="text-[9px] text-slate-500 capitalize">{d.seller.reputacao}</span>
                      </div>
                    )}
                  </div>
                  {d.seller.vendas !== undefined && (
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-700">{d.seller.vendas?.toLocaleString('pt-BR')}</p>
                      <p className="text-[9px] text-slate-400">vendas</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Concorrentes */}
            {concorrentes.length > 0 && (
              <div>
                <button onClick={() => setMostrarVendedores(v => !v)}
                  className="w-full flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  <span className="text-[10px] font-black text-blue-700 uppercase flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />{concorrentes.length} concorrente{concorrentes.length !== 1 ? 's' : ''}
                  </span>
                  {mostrarVendedores ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />}
                </button>

                {mostrarVendedores && (
                  <div className="mt-1.5 border border-slate-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-12 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[9px] font-black text-slate-400 uppercase">
                      <div className="col-span-1">#</div>
                      <div className="col-span-4">Vendedor</div>
                      <div className="col-span-3 text-right">Preço</div>
                      <div className="col-span-2 text-center">Rep.</div>
                      <div className="col-span-2 text-right">Vendas</div>
                    </div>
                    {concorrentes.map((c, i) => (
                      <div key={i} className={`grid grid-cols-12 px-3 py-2.5 items-center border-b border-slate-50 last:border-0 text-xs hover:bg-slate-50 ${c.preco < meuPreco ? 'bg-red-50/30' : ''}`}>
                        <div className="col-span-1">
                          {i === 0 ? <Medal className="w-3.5 h-3.5 text-amber-400" /> : i === 1 ? <Award className="w-3.5 h-3.5 text-slate-400" /> : <span className="text-[9px] text-slate-400 font-black">{i + 1}</span>}
                        </div>
                        <div className="col-span-4 font-semibold text-slate-700 truncate pr-1">{c.nome}</div>
                        <div className={`col-span-3 text-right font-black flex items-center justify-end gap-0.5 ${c.preco < meuPreco ? 'text-red-600' : c.preco > meuPreco ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {formatPrice(c.preco)}
                          {c.preco < meuPreco && <TrendingDown className="w-3 h-3" />}
                          {c.preco > meuPreco && <TrendingUp className="w-3 h-3" />}
                        </div>
                        <div className="col-span-2 flex justify-center">
                          {c.reputacao && <span className={`w-2.5 h-2.5 rounded-full inline-block ${c.reputacao === 'platinum' ? 'bg-blue-400' : c.reputacao === 'gold' ? 'bg-amber-400' : 'bg-slate-300'}`} title={c.reputacao} />}
                        </div>
                        <div className="col-span-2 text-right text-slate-500 text-[10px]">{c.vendas !== undefined ? c.vendas?.toLocaleString('pt-BR') : '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ficha */}
            {d.atributos && d.atributos.length > 0 && (
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Package className="w-3 h-3" />Ficha Técnica</p>
                <div className="grid grid-cols-2 gap-1">
                  {d.atributos.slice(0, 10).map((a, i) => (
                    <div key={i} className="flex justify-between bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-[10px]">
                      <span className="text-slate-400 truncate">{a.nome}</span>
                      <span className="font-bold text-slate-700 truncate ml-1">{a.valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── RESUMO GERAL ──────────────────────────────────────────────────────────────
function ResumoGeral({ itens }) {
  const concluidos = itens.filter(i => i.status === 'concluido');
  if (concluidos.length === 0) return null;
  const precos = concluidos.map(i => i.dados?.preco).filter(Boolean);
  const totalVendedores = concluidos.reduce((s, i) => s + (i.dados?.totalVendedores || 0), 0);
  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 text-white">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Resumo da Pesquisa</p>
      <div className="grid grid-cols-4 gap-3">
        <div><p className="text-2xl font-black">{concluidos.length}</p><p className="text-[10px] text-slate-400 uppercase">Anúncios</p></div>
        <div><p className="text-2xl font-black text-emerald-400">{precos.length ? formatPrice(Math.min(...precos)) : '—'}</p><p className="text-[10px] text-slate-400 uppercase">Menor preço</p></div>
        <div><p className="text-2xl font-black text-amber-400">{precos.length ? formatPrice(precos.reduce((s, v) => s + v, 0) / precos.length) : '—'}</p><p className="text-[10px] text-slate-400 uppercase">Média</p></div>
        <div><p className="text-2xl font-black text-blue-400">{totalVendedores}</p><p className="text-[10px] text-slate-400 uppercase">Total vendedores</p></div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function MlResearch() {
  const { userId } = useOutletContext() || {};
  const navigate   = useNavigate();

  const [inputTexto, setInputTexto]     = useState('');
  const [itens, setItens]               = useState([]);
  const [rodando, setRodando]           = useState(false);
  const [mlConectado, setMlConectado]   = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [mostrarInput, setMostrarInput] = useState(true);
  const [log, setLog]                   = useState([]);

  const rodandoRef = useRef(false);
  const abortRef   = useRef(false);
  const logEndRef  = useRef(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`)
      .then(r => r.json())
      .then(d => setMlConectado(d.connected && !d.expired))
      .catch(() => {});
  }, [userId]);

  // Auto-scroll no terminal
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  const addLog = useCallback((msg, tipo = 'info') => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setLog(prev => [...prev.slice(-80), { msg, tipo, ts }]);
  }, []);

  // Processa textarea → cria itens
  const processarInput = () => {
    if (!inputTexto.trim()) return;
    const linhas = inputTexto.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
    const novos  = [];
    const jaExiste = new Set(itens.map(i => i.mlbId));

    for (const linha of linhas) {
      const mlbId = extrairMLBId(linha);
      if (!mlbId) { addLog(`⚠️ ID não encontrado em: ${linha.substring(0, 50)}`, 'warn'); continue; }
      if (jaExiste.has(mlbId)) { addLog(`ℹ️ ${mlbId} já está na lista`); continue; }
      jaExiste.add(mlbId);
      novos.push({ id: `${mlbId}-${Date.now()}-${Math.random()}`, mlbId, url: linha, status: 'pendente', dados: null, erro: null });
    }

    if (novos.length === 0) { addLog('Nenhum link válido encontrado.', 'warn'); return; }
    setItens(prev => [...prev, ...novos]);
    setInputTexto('');
    addLog(`✅ ${novos.length} anúncio(s) adicionados à fila`, 'success');
    setMostrarInput(false);
  };

  // Busca dados de um anúncio
  const buscarAnuncio = useCallback(async (mlbId) => {
    const res = await fetch(`${API_BASE_URL}/api/ml/research/${mlbId}?userId=${userId}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, [userId]);

  // Loop de fila com re-tentativa
  const executarFila = useCallback(async (ids) => {
    if (rodandoRef.current) return;
    rodandoRef.current = true;
    abortRef.current   = false;
    setRodando(true);
    addLog(`🚀 Iniciando análise de ${ids.length} anúncio(s)...`, 'success');

    const retentar = [];

    for (let i = 0; i < ids.length; i++) {
      if (abortRef.current) break;
      const id = ids[i];
      setItens(prev => prev.map(it => it.mlbId === id ? { ...it, status: 'analisando' } : it));
      addLog(`🔍 [${i + 1}/${ids.length}] Analisando ${id}...`);

      try {
        const dados = await buscarAnuncio(id);
        setItens(prev => prev.map(it => it.mlbId === id ? { ...it, status: 'concluido', dados } : it));
        addLog(`✅ ${id}: ${dados.titulo?.substring(0, 35) || 'OK'} — ${dados.totalVendedores || 0} vendedores`, 'success');
        if (i < ids.length - 1 && !abortRef.current) await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        const isTimeout = e.message.includes('Timeout') || e.message.includes('timeout') || e.name === 'TimeoutError';
        if (isTimeout) {
          retentar.push(id);
          setItens(prev => prev.map(it => it.mlbId === id ? { ...it, status: 'fila', erro: 'Re-tentativa pendente...' } : it));
          addLog(`⏳ ${id}: Timeout — fila de re-tentativa`, 'warn');
        } else {
          setItens(prev => prev.map(it => it.mlbId === id ? { ...it, status: 'erro', erro: e.message } : it));
          addLog(`❌ ${id}: ${e.message}`, 'warn');
        }
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    if (retentar.length > 0 && !abortRef.current) {
      addLog(`🔄 Re-tentando ${retentar.length} item(s) em 5s...`, 'info');
      await new Promise(r => setTimeout(r, 5000));
      for (let i = 0; i < retentar.length; i++) {
        if (abortRef.current) break;
        const id = retentar[i];
        setItens(prev => prev.map(it => it.mlbId === id ? { ...it, status: 'analisando', erro: null } : it));
        addLog(`🔄 Re-tentativa [${i + 1}/${retentar.length}]: ${id}`);
        try {
          const dados = await buscarAnuncio(id);
          setItens(prev => prev.map(it => it.mlbId === id ? { ...it, status: 'concluido', dados } : it));
          addLog(`✅ Re-tentativa OK: ${id}`, 'success');
          if (i < retentar.length - 1) await new Promise(r => setTimeout(r, 1200));
        } catch (e) {
          setItens(prev => prev.map(it => it.mlbId === id ? { ...it, status: 'erro', erro: e.message } : it));
          addLog(`❌ Re-tentativa falhou: ${id} — ${e.message}`, 'warn');
        }
      }
    }

    rodandoRef.current = false;
    setRodando(false);
    addLog('🎯 Análise concluída!', 'success');
  }, [buscarAnuncio, addLog]);

  const iniciarAnalise = () => {
    const ids = itens.filter(i => ['pendente', 'erro', 'fila'].includes(i.status)).map(i => i.mlbId);
    if (ids.length > 0) executarFila(ids);
  };

  const pararAnalise    = () => { abortRef.current = true; addLog('⏹ Interrompido pelo usuário', 'warn'); };
  const removerItem     = id => setItens(prev => prev.filter(i => i.id !== id));
  const limparTudo      = () => { if (!rodandoRef.current) { setItens([]); setLog([]); } };
  const reanaliarErros  = () => {
    const ids = itens.filter(i => ['erro', 'fila'].includes(i.status)).map(i => i.mlbId);
    if (ids.length) executarFila(ids);
  };

  const exportarCSV = () => {
    const rows = itens.filter(i => i.status === 'concluido').map(i => {
      const d = i.dados;
      return [i.mlbId, `"${(d?.titulo || '').replace(/"/g, '""')}"`, d?.preco || '', d?.estoque || '', d?.vendidos || '', d?.totalVendedores || '', d?.precoMin || '', d?.precoMedio || '', d?.precoMax || '', d?.link || ''].join(',');
    });
    if (!rows.length) return;
    const csv  = ['ID,Título,Preço,Estoque,Vendidos,TotalVendedores,PreçoMin,PreçoMédio,PreçoMax,Link', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `pesquisa_ml_${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };

  // Contagens e filtros
  const contagens = {
    todos:      itens.length,
    pendente:   itens.filter(i => i.status === 'pendente').length,
    analisando: itens.filter(i => i.status === 'analisando').length,
    concluido:  itens.filter(i => i.status === 'concluido').length,
    erro:       itens.filter(i => i.status === 'erro').length,
    fila:       itens.filter(i => i.status === 'fila').length,
  };
  const temPendentes    = contagens.pendente + contagens.erro + contagens.fila > 0;
  const itensFiltrados  = filtroStatus === 'todos' ? itens : itens.filter(i => i.status === filtroStatus);

  const FILTROS = [
    { k: 'todos',      label: `Todos (${contagens.todos})`,           ativo: 'bg-slate-100 text-slate-700 border-slate-300' },
    { k: 'concluido',  label: `Concluídos (${contagens.concluido})`,  ativo: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { k: 'pendente',   label: `Pendentes (${contagens.pendente})`,    ativo: 'bg-amber-50 text-amber-700 border-amber-300' },
    { k: 'analisando', label: `Analisando (${contagens.analisando})`, ativo: 'bg-blue-50 text-blue-700 border-blue-300' },
    { k: 'erro',       label: `Erros (${contagens.erro})`,            ativo: 'bg-red-50 text-red-700 border-red-300' },
    { k: 'fila',       label: `Fila (${contagens.fila})`,             ativo: 'bg-purple-50 text-purple-700 border-purple-300' },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col overflow-x-hidden" style={{ minHeight: '100vh' }}>
      <style>{`
        @keyframes slideGrad { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/ml')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base font-black text-slate-800 leading-tight">Pesquisa de Anúncios</h2>
            <p className="text-xs text-slate-400">Analise preços e concorrentes de qualquer anúncio do ML</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {itens.length > 0 && (
            <>
              <button onClick={exportarCSV} disabled={contagens.concluido === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40">
                <Download className="w-3.5 h-3.5" />CSV
              </button>
              {!rodando && (contagens.erro + contagens.fila) > 0 && (
                <button onClick={reanaliarErros}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">
                  <RefreshCw className="w-3.5 h-3.5" />Re-tentar
                </button>
              )}
              <button onClick={limparTudo} disabled={rodando}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-black uppercase rounded-lg bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />Limpar
              </button>
            </>
          )}
          <button onClick={() => setMostrarInput(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-black uppercase rounded-lg bg-slate-900 text-white hover:bg-slate-700">
            <Plus className="w-3.5 h-3.5" />Adicionar Links
          </button>
        </div>
      </div>

      {/* ── INPUT ─────────────────────────────────────────────────────── */}
      {mostrarInput && (
        <div className="mb-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm" style={{ animation: 'fadeIn 0.2s ease' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-blue-500" />Cole os links ou IDs dos anúncios
            </p>
            <button onClick={() => setMostrarInput(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <textarea
            value={inputTexto}
            onChange={e => setInputTexto(e.target.value)}
            placeholder={`Cole links ou IDs (um por linha ou separados por vírgula):\n\nhttps://www.mercadolivre.com.br/...\nMLB123456789`}
            className="w-full border border-slate-200 rounded-xl p-3 text-xs font-mono outline-none focus:border-blue-400 resize-none bg-slate-50"
            rows={5}
            onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') processarInput(); }}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-slate-400">Aceita links completos, curtos, IDs MLB • Ctrl+Enter para adicionar</p>
            <button onClick={processarInput} disabled={!inputTexto.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />Adicionar à Fila
            </button>
          </div>
        </div>
      )}

      {/* ── RESUMO ────────────────────────────────────────────────────── */}
      {itens.length > 0 && <div className="mb-3"><ResumoGeral itens={itens} /></div>}

      {/* ── ESTADO VAZIO ──────────────────────────────────────────────── */}
      {itens.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
          <div className="w-20 h-20 bg-[#FFE600] rounded-3xl flex items-center justify-center shadow-lg">
            <Search className="w-10 h-10 text-slate-900" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 mb-1">Pesquise qualquer anúncio do ML</h3>
            <p className="text-sm text-slate-400 max-w-md">Cole links ou IDs de anúncios para ver preços, vendedores, concorrentes e análise completa de mercado.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-xl text-left">
            {[
              { icon: Users,    title: 'Concorrentes',    desc: 'Veja todos os vendedores que oferecem o mesmo produto' },
              { icon: BarChart2, title: 'Análise de Preço', desc: 'Compare seu preço com mínimo, máximo e média do mercado' },
              { icon: Activity, title: 'Anti-Timeout',    desc: 'Itens que atingem o limite são re-tentados automaticamente' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border border-slate-200 rounded-xl p-3">
                <Icon className="w-5 h-5 text-blue-500 mb-2" />
                <p className="text-xs font-black text-slate-700 mb-0.5">{title}</p>
                <p className="text-[11px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
          <button onClick={() => setMostrarInput(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black uppercase bg-slate-900 text-white hover:bg-slate-700">
            <Plus className="w-4 h-4" />Adicionar Links
          </button>
        </div>
      )}

      {/* ── ÁREA PRINCIPAL: terminal esquerda + lista direita ─────────── */}
      {itens.length > 0 && (
        <div className="flex gap-3 flex-1 min-h-0">

          {/* TERMINAL — coluna esquerda fixa */}
          <div className="w-60 flex-shrink-0 bg-slate-950 rounded-2xl flex flex-col" style={{ maxHeight: '78vh' }}>
            {/* Header terminal */}
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-slate-800 shrink-0">
              <div className="flex gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              </div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                <Activity className="w-3 h-3" />Terminal
              </p>
              {rodando && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
            </div>

            {/* Botão analisar dentro do terminal */}
            <div className="px-2.5 py-2 border-b border-slate-800 shrink-0">
              {!rodando ? (
                <button onClick={iniciarAnalise} disabled={!temPendentes || !mlConectado}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 transition-all">
                  <Zap className="w-3 h-3" />
                  {mlConectado
                    ? temPendentes ? `Analisar ${contagens.pendente + contagens.erro + contagens.fila}` : 'Sem pendentes'
                    : '🔒 ML offline'}
                </button>
              ) : (
                <button onClick={pararAnalise}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase bg-red-700 text-white hover:bg-red-600">
                  <XCircle className="w-3 h-3" />Parar
                </button>
              )}
            </div>

            {/* Log */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5 font-mono min-h-0">
              {log.length === 0
                ? <p className="text-[9px] text-slate-700 italic">Aguardando análise...</p>
                : log.map((l, i) => (
                  <div key={i} className={`text-[9px] leading-relaxed break-words ${l.tipo === 'success' ? 'text-emerald-400' : l.tipo === 'warn' ? 'text-amber-400' : 'text-slate-400'}`}>
                    <span className="text-slate-600 mr-1 select-none">{l.ts}</span>{l.msg}
                  </div>
                ))
              }
              {rodando && (
                <div className="text-[9px] text-blue-400 flex items-center gap-1 animate-pulse mt-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />processando...
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* COLUNA DIREITA: filtros + lista */}
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">

            {/* Barra de filtros — padrão das outras telas */}
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-1.5 flex-wrap">
              {FILTROS.map(({ k, label, ativo }) => (
                <button key={k} onClick={() => setFiltroStatus(k)}
                  className={`px-2.5 py-1.5 rounded text-xs font-black uppercase border transition-all ${filtroStatus === k ? ativo : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Lista de cards */}
            <div className="flex-1 space-y-2.5 overflow-y-auto" style={{ maxHeight: 'calc(78vh - 52px)' }}>
              {itensFiltrados.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-2 text-center">
                  <Filter className="w-8 h-8 text-slate-200" />
                  <p className="text-xs font-black text-slate-400 uppercase">Nenhum item com este filtro</p>
                </div>
              ) : (
                itensFiltrados.map(item => (
                  <CardResultado key={item.id} item={item} onRemover={removerItem} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}