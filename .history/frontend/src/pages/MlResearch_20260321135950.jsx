// src/pages/MlResearch.jsx
// Página: Pesquisa de Anúncios ML por Links
// Analisa anúncios (preços, vendedores, concorrentes) em lote com fila anti-timeout

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  XCircle, Clock, AlertTriangle, BarChart2, ShoppingBag, Star,
  TrendingUp, TrendingDown, Package, ChevronDown, ChevronUp,
  Copy, Download, Eye, EyeOff, Zap, ArrowLeft, Users, DollarSign,
  Activity, Filter, X, Info, Medal, Award, ChevronRight,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ── Extrai MLB ID de uma URL ou texto ────────────────────────────────────────
// Ordem de prioridade:
// 1. item_id=MLB... ou item_id:MLB... no query/fragment (mais específico)
// 2. /p/MLB... no path (produto catalog — ID da listagem principal)
// 3. Slug no path tipo /nome-do-produto-MLB123456
// 4. ID direto no texto
function extrairMLBId(input) {
  if (!input) return null;
  const raw = input.trim();

  // Já é um ID direto ex: MLB123456 ou MLB-123456
  if (/^MLB-?\d+$/i.test(raw)) return raw.toUpperCase().replace('-', '');

  // 1. Parâmetro item_id=MLB... ou item_id:MLB... (query string ou fragment)
  const itemIdMatch = raw.match(/item[_-]?id[=:]MLB[-]?(\d+)/i);
  if (itemIdMatch) return `MLB${itemIdMatch[1]}`;

  // 2. /p/MLB... no caminho (catálogo ML — é o anúncio principal)
  const pMatch = raw.match(/\/p\/MLB[-]?(\d+)/i);
  if (pMatch) return `MLB${pMatch[1]}`;

  // 3. Slug: /qualquer-coisa-MLB123456 (anúncio direto na URL)
  const slugMatch = raw.match(/\/[^/?#]+-MLB[-]?(\d+)/i);
  if (slugMatch) return `MLB${slugMatch[1]}`;

  // 4. Qualquer MLB no texto (fallback)
  const anyMatch = raw.match(/MLB[-]?(\d+)/i);
  if (anyMatch) return `MLB${anyMatch[1]}`;

  return null;
}

function safeDate(val) {
  if (!val) return '—';
  try { const d = new Date(val); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  catch { return '—'; }
}

function formatPrice(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v);
}

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────
const STATUS = {
  pendente:    { label:'Pendente',     color:'text-amber-600',   bg:'bg-amber-50',   border:'border-amber-200',   dot:'bg-amber-400',   icon:Clock },
  analisando:  { label:'Analisando',   color:'text-blue-600',    bg:'bg-blue-50',    border:'border-blue-200',    dot:'bg-blue-400 animate-pulse', icon:Loader2 },
  concluido:   { label:'Concluído',    color:'text-emerald-600', bg:'bg-emerald-50', border:'border-emerald-200', dot:'bg-emerald-400', icon:CheckCircle2 },
  erro:        { label:'Erro',         color:'text-red-600',     bg:'bg-red-50',     border:'border-red-200',     dot:'bg-red-400',     icon:XCircle },
  fila:        { label:'Na fila',      color:'text-purple-600',  bg:'bg-purple-50',  border:'border-purple-200',  dot:'bg-purple-400 animate-pulse', icon:Clock },
};

// ── CARD DE RESULTADO ─────────────────────────────────────────────────────────
function CardResultado({ item, onRemover }) {
  const [expandido, setExpandido] = useState(false);
  const [mostrarVendedores, setMostrarVendedores] = useState(false);
  const cfg = STATUS[item.status] || STATUS.pendente;
  const Icone = cfg.icon;
  const dados = item.dados;

  // Seller principal vs concorrentes
  const vendedorPrincipal = dados?.seller;
  const concorrentes      = dados?.concorrentes || [];
  const precoMin          = dados?.precoMin;
  const precoMax          = dados?.precoMax;
  const precoMedio        = dados?.precoMedio;

  const meuPreco = dados?.preco;
  const abaixoMedia = meuPreco && precoMedio && meuPreco < precoMedio;

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all duration-200 ${cfg.border}`}>
      {/* Barra de status */}
      <div className={`h-1 ${cfg.dot.replace('animate-pulse','')}`} style={{ background: item.status==='analisando'?'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)':undefined, backgroundSize:'200%', animation:item.status==='analisando'?'slide 1.5s linear infinite':undefined }} />

      <div className="p-4">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-50 flex items-center justify-center">
            {dados?.thumbnail
              ? <img src={dados.thumbnail} alt="" className="w-full h-full object-cover" />
              : <ShoppingBag className="w-6 h-6 text-slate-300" />}
          </div>

          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`flex items-center gap-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                <Icone className={`w-2.5 h-2.5 ${item.status==='analisando'?'animate-spin':''}`} />
                {cfg.label}
              </span>
              <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.mlbId}</span>
              {dados?.status && (
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase ${dados.status==='active'?'bg-emerald-50 text-emerald-600':'bg-slate-100 text-slate-500'}`}>
                  {dados.status==='active'?'Ativo':'Inativo'}
                </span>
              )}
            </div>
            {/* Título ou URL truncada */}
            <p className="text-sm font-bold text-slate-800 leading-tight truncate">
              {dados?.titulo || (() => {
                try {
                  const u = new URL(item.url);
                  const path = u.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
                  return `${u.hostname}/${path}...`;
                } catch { return item.url.substring(0, 60) + (item.url.length > 60 ? '…' : ''); }
              })()}
            </p>
            {/* URL original compacta */}
            {!dados?.titulo && (
              <p className="text-[9px] text-slate-400 mt-0.5 truncate font-mono max-w-full">
                {item.url.length > 70 ? item.url.substring(0, 70) + '…' : item.url}
              </p>
            )}
            {item.status === 'erro' && (
              <p className="text-[10px] text-red-500 mt-0.5">{item.erro}</p>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {dados?.link && (
              <a href={dados.link} target="_blank" rel="noopener noreferrer"
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

        {/* Métricas rápidas — sempre visíveis quando concluído */}
        {item.status === 'concluido' && dados && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
              <p className="text-base font-black text-slate-800 leading-none">{formatPrice(dados.preco)}</p>
              <p className="text-[9px] text-slate-400 uppercase font-black mt-0.5">Meu Preço</p>
            </div>
            <div className={`border rounded-xl p-2.5 text-center ${abaixoMedia ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              <p className={`text-base font-black leading-none ${abaixoMedia ? 'text-emerald-700' : 'text-amber-700'}`}>{formatPrice(precoMedio)}</p>
              <p className={`text-[9px] uppercase font-black mt-0.5 ${abaixoMedia ? 'text-emerald-500' : 'text-amber-500'}`}>Média Mercado</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
              <p className="text-base font-black text-blue-700 leading-none">{dados.totalVendedores || concorrentes.length + 1}</p>
              <p className="text-[9px] text-blue-400 uppercase font-black mt-0.5">Vendedores</p>
            </div>
          </div>
        )}

        {/* Spinner */}
        {item.status === 'analisando' && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-blue-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            <span className="animate-pulse">Buscando dados do anúncio e concorrentes...</span>
          </div>
        )}

        {/* Expandido — detalhes completos */}
        {expandido && dados && (
          <div className="mt-4 space-y-4">

            {/* Detalhes do anúncio */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                {dados.condicao && (
                  <div className="flex justify-between"><span className="text-slate-400">Condição</span><span className="font-bold text-slate-700">{dados.condicao}</span></div>
                )}
                {dados.estoque !== undefined && (
                  <div className="flex justify-between"><span className="text-slate-400">Estoque</span><span className="font-bold text-slate-700">{dados.estoque} un</span></div>
                )}
                {dados.vendidos !== undefined && (
                  <div className="flex justify-between"><span className="text-slate-400">Vendidos</span><span className="font-bold text-emerald-600">{dados.vendidos}</span></div>
                )}
                {dados.tipoAnuncio && (
                  <div className="flex justify-between"><span className="text-slate-400">Tipo</span><span className="font-bold text-slate-700">{dados.tipoAnuncio}</span></div>
                )}
              </div>
              <div className="space-y-1.5">
                {dados.frete && (
                  <div className="flex justify-between"><span className="text-slate-400">Frete</span>
                    <span className={`font-bold ${dados.freteGratis ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {dados.freteGratis ? '🟢 Grátis' : dados.frete}
                    </span>
                  </div>
                )}
                {precoMin !== undefined && (
                  <div className="flex justify-between"><span className="text-slate-400">Menor preço</span><span className="font-bold text-emerald-600">{formatPrice(precoMin)}</span></div>
                )}
                {precoMax !== undefined && (
                  <div className="flex justify-between"><span className="text-slate-400">Maior preço</span><span className="font-bold text-slate-700">{formatPrice(precoMax)}</span></div>
                )}
                {dados.avaliacoes !== undefined && (
                  <div className="flex justify-between"><span className="text-slate-400">Avaliações</span>
                    <span className="font-bold text-amber-600 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 stroke-amber-400"/>{dados.avaliacoes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Vendedor principal */}
            {vendedorPrincipal && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center gap-1"><Users className="w-3 h-3"/>Vendedor Principal</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-800">{vendedorPrincipal.nome}</p>
                    {vendedorPrincipal.reputacao && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className={`w-2 h-2 rounded-full ${
                          vendedorPrincipal.reputacao === 'platinum' ? 'bg-blue-400' :
                          vendedorPrincipal.reputacao === 'gold' ? 'bg-amber-400' :
                          vendedorPrincipal.reputacao === 'silver' ? 'bg-slate-400' : 'bg-slate-300'
                        }`} />
                        <span className="text-[9px] text-slate-500 capitalize">{vendedorPrincipal.reputacao}</span>
                      </div>
                    )}
                  </div>
                  {vendedorPrincipal.vendas !== undefined && (
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-700">{vendedorPrincipal.vendas?.toLocaleString('pt-BR')}</p>
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
                  className="w-full flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-left">
                  <span className="text-[10px] font-black text-blue-700 uppercase flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5"/>
                    {concorrentes.length} vendedor{concorrentes.length !== 1 ? 'es' : ''} concorrente{concorrentes.length !== 1 ? 's' : ''}
                  </span>
                  {mostrarVendedores ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />}
                </button>

                {mostrarVendedores && (
                  <div className="mt-1.5 border border-slate-200 rounded-xl overflow-hidden">
                    {/* Header da tabela */}
                    <div className="grid grid-cols-12 px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[8px] font-black text-slate-400 uppercase">
                      <div className="col-span-1">#</div>
                      <div className="col-span-4">Vendedor</div>
                      <div className="col-span-2 text-right">Preço</div>
                      <div className="col-span-2 text-center">Reput.</div>
                      <div className="col-span-2 text-right">Vendas</div>
                      <div className="col-span-1"></div>
                    </div>
                    {concorrentes.map((c, i) => (
                      <div key={i} className={`grid grid-cols-12 px-3 py-2.5 items-center border-b border-slate-50 last:border-0 text-xs hover:bg-slate-50 ${c.preco < meuPreco ? 'bg-red-50/30' : ''}`}>
                        <div className="col-span-1">
                          {i === 0 ? <Medal className="w-3.5 h-3.5 text-amber-400" /> :
                           i === 1 ? <Award className="w-3.5 h-3.5 text-slate-400" /> :
                           <span className="text-[9px] text-slate-400 font-black">{i+1}</span>}
                        </div>
                        <div className="col-span-4 font-semibold text-slate-700 truncate pr-1">{c.nome}</div>
                        <div className={`col-span-2 text-right font-black ${c.preco < meuPreco ? 'text-red-600' : c.preco > meuPreco ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {formatPrice(c.preco)}
                          {c.preco < meuPreco && <TrendingDown className="w-3 h-3 inline ml-0.5" />}
                          {c.preco > meuPreco && <TrendingUp className="w-3 h-3 inline ml-0.5" />}
                        </div>
                        <div className="col-span-2 flex justify-center">
                          {c.reputacao && (
                            <span className={`w-3 h-3 rounded-full inline-block ${
                              c.reputacao === 'platinum' ? 'bg-blue-400' :
                              c.reputacao === 'gold' ? 'bg-amber-400' :
                              c.reputacao === 'silver' ? 'bg-slate-400' : 'bg-slate-200'
                            }`} title={c.reputacao} />
                          )}
                        </div>
                        <div className="col-span-2 text-right text-slate-500 text-[10px]">
                          {c.vendas !== undefined ? c.vendas?.toLocaleString('pt-BR') : '—'}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {c.link && (
                            <a href={c.link} target="_blank" rel="noopener noreferrer"
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-400">
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Atributos / Ficha */}
            {dados.atributos && dados.atributos.length > 0 && (
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Package className="w-3 h-3"/>Ficha Técnica</p>
                <div className="grid grid-cols-2 gap-1">
                  {dados.atributos.slice(0, 10).map((a, i) => (
                    <div key={i} className="flex justify-between bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-[9px]">
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

// ── CARD DE RESUMO GERAL ──────────────────────────────────────────────────────
function ResumoGeral({ itens }) {
  const concluidos = itens.filter(i => i.status === 'concluido');
  if (concluidos.length === 0) return null;

  const precos = concluidos.map(i => i.dados?.preco).filter(Boolean);
  const totalVendedores = concluidos.reduce((s, i) => s + (i.dados?.totalVendedores || 0), 0);

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 text-white">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Resumo da Pesquisa</p>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <p className="text-2xl font-black">{concluidos.length}</p>
          <p className="text-[9px] text-slate-400 uppercase">Anúncios</p>
        </div>
        <div>
          <p className="text-2xl font-black text-emerald-400">{formatPrice(Math.min(...precos))}</p>
          <p className="text-[9px] text-slate-400 uppercase">Menor preço</p>
        </div>
        <div>
          <p className="text-2xl font-black text-amber-400">{formatPrice(precos.reduce((s,v)=>s+v,0)/precos.length)}</p>
          <p className="text-[9px] text-slate-400 uppercase">Média</p>
        </div>
        <div>
          <p className="text-2xl font-black text-blue-400">{totalVendedores}</p>
          <p className="text-[9px] text-slate-400 uppercase">Total vendedores</p>
        </div>
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

  const [inputTexto, setInputTexto]       = useState('');
  const [itens, setItens]                 = useState([]);
  const [rodando, setRodando]             = useState(false);
  const [filaEspera, setFilaEspera]       = useState([]);
  const [mlConectado, setMlConectado]     = useState(false);
  const [filtroStatus, setFiltroStatus]   = useState('todos');
  const [mostrarInput, setMostrarInput]   = useState(true);
  const [log, setLog]                     = useState([]);

  const rodandoRef  = useRef(false);
  const filaRef     = useRef([]);
  const abortRef    = useRef(false);

  // Verifica conexão ML
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`)
      .then(r => r.json())
      .then(d => setMlConectado(d.connected && !d.expired))
      .catch(() => {});
  }, [userId]);

  const addLog = useCallback((msg, tipo = 'info') => {
    setLog(prev => [...prev.slice(-50), { msg, tipo, ts: new Date().toLocaleTimeString('pt-BR') }]);
  }, []);

  // ── Parseia input e cria itens ──────────────────────────────────────────────
  const processarInput = () => {
    if (!inputTexto.trim()) return;
    const linhas = inputTexto
      .split(/[\n,;]+/)
      .map(l => l.trim())
      .filter(Boolean);

    const novos = [];
    const jaExiste = new Set(itens.map(i => i.mlbId));

    for (const linha of linhas) {
      const mlbId = extrairMLBId(linha);
      if (!mlbId) {
        addLog(`⚠️ Não foi possível extrair ID de: ${linha.substring(0, 50)}`, 'warn');
        continue;
      }
      if (jaExiste.has(mlbId)) {
        addLog(`ℹ️ ${mlbId} já está na lista`, 'info');
        continue;
      }
      jaExiste.add(mlbId);
      novos.push({
        id:      `${mlbId}-${Date.now()}-${Math.random()}`,
        mlbId,
        url:     linha,
        status:  'pendente',
        dados:   null,
        erro:    null,
      });
    }

    if (novos.length === 0) {
      addLog('Nenhum link válido encontrado.', 'warn');
      return;
    }

    setItens(prev => [...prev, ...novos]);
    setInputTexto('');
    addLog(`✅ ${novos.length} anúncio(s) adicionados à fila`, 'success');
    setMostrarInput(false);
  };

  // ── Busca dados de UM anúncio via API ML ────────────────────────────────────
  const buscarAnuncio = useCallback(async (mlbId) => {
    if (!userId) return null;

    try {
      // 1. Dados principais do anúncio
      const res = await fetch(
        `${API_BASE_URL}/api/ml/research/${mlbId}?userId=${userId}`,
        { signal: AbortSignal.timeout(20000) }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const dados = await res.json();
      return dados;

    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new Error('Timeout — item adicionado à fila de re-tentativa');
      }
      throw e;
    }
  }, [userId]);

  // ── Loop principal da fila ──────────────────────────────────────────────────
  const executarFila = useCallback(async (listaIds) => {
    if (rodandoRef.current) return;
    rodandoRef.current = true;
    abortRef.current   = false;
    setRodando(true);

    const pendentes = [...listaIds];
    const retentar  = [];

    addLog(`🚀 Iniciando análise de ${pendentes.length} anúncio(s)...`, 'success');

    for (let i = 0; i < pendentes.length; i++) {
      if (abortRef.current) break;

      const id = pendentes[i];

      // Marca como analisando
      setItens(prev => prev.map(item =>
        item.mlbId === id ? { ...item, status: 'analisando' } : item
      ));

      addLog(`🔍 [${i+1}/${pendentes.length}] Analisando ${id}...`, 'info');

      try {
        const dados = await buscarAnuncio(id);

        setItens(prev => prev.map(item =>
          item.mlbId === id ? { ...item, status: 'concluido', dados } : item
        ));

        addLog(`✅ ${id}: ${dados.titulo?.substring(0, 40) || 'OK'} — ${dados.totalVendedores || 0} vendedores`, 'success');

        // Pausa anti-timeout entre requisições
        if (i < pendentes.length - 1 && !abortRef.current) {
          await new Promise(r => setTimeout(r, 800));
        }

      } catch (e) {
        const isTimeout = e.message.includes('Timeout') || e.message.includes('timeout');

        if (isTimeout) {
          // Adiciona à fila de re-tentativa
          retentar.push(id);
          setItens(prev => prev.map(item =>
            item.mlbId === id ? { ...item, status: 'fila', erro: 'Aguardando re-tentativa...' } : item
          ));
          addLog(`⏳ ${id}: Timeout — adicionado à fila de re-tentativa`, 'warn');
        } else {
          setItens(prev => prev.map(item =>
            item.mlbId === id ? { ...item, status: 'erro', erro: e.message } : item
          ));
          addLog(`❌ ${id}: ${e.message}`, 'warn');
        }

        // Pausa maior após erro
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Processa re-tentativas
    if (retentar.length > 0 && !abortRef.current) {
      addLog(`🔄 Processando ${retentar.length} item(s) da fila de re-tentativa (aguarde 5s)...`, 'info');
      await new Promise(r => setTimeout(r, 5000));

      for (let i = 0; i < retentar.length; i++) {
        if (abortRef.current) break;
        const id = retentar[i];

        setItens(prev => prev.map(item =>
          item.mlbId === id ? { ...item, status: 'analisando', erro: null } : item
        ));

        addLog(`🔄 Re-tentativa [${i+1}/${retentar.length}]: ${id}`, 'info');

        try {
          const dados = await buscarAnuncio(id);
          setItens(prev => prev.map(item =>
            item.mlbId === id ? { ...item, status: 'concluido', dados } : item
          ));
          addLog(`✅ Re-tentativa OK: ${id}`, 'success');
          if (i < retentar.length - 1) await new Promise(r => setTimeout(r, 1200));
        } catch (e) {
          setItens(prev => prev.map(item =>
            item.mlbId === id ? { ...item, status: 'erro', erro: e.message } : item
          ));
          addLog(`❌ Re-tentativa falhou: ${id} — ${e.message}`, 'warn');
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    rodandoRef.current = false;
    setRodando(false);
    addLog('🎯 Análise concluída!', 'success');
  }, [buscarAnuncio, addLog]);

  const iniciarAnalise = () => {
    const pendentes = itens
      .filter(i => i.status === 'pendente' || i.status === 'erro' || i.status === 'fila')
      .map(i => i.mlbId);
    if (pendentes.length === 0) return;
    executarFila(pendentes);
  };

  const pararAnalise = () => {
    abortRef.current = true;
    addLog('⏹ Análise interrompida pelo usuário', 'warn');
  };

  const removerItem = (id) => {
    setItens(prev => prev.filter(i => i.id !== id));
  };

  const limparTudo = () => {
    if (rodandoRef.current) return;
    setItens([]);
    setLog([]);
  };

  const reanaliarErros = () => {
    const erros = itens.filter(i => i.status === 'erro' || i.status === 'fila').map(i => i.mlbId);
    if (erros.length > 0) executarFila(erros);
  };

  const exportarCSV = () => {
    const concluidos = itens.filter(i => i.status === 'concluido');
    if (concluidos.length === 0) return;

    const header = 'ID,Título,Preço,Estoque,Vendidos,Total Vendedores,Preço Mínimo,Preço Médio,Preço Máximo,Status,Link';
    const rows = concluidos.map(i => {
      const d = i.dados;
      return [
        i.mlbId,
        `"${(d?.titulo || '').replace(/"/g, '""')}"`,
        d?.preco || '',
        d?.estoque || '',
        d?.vendidos || '',
        d?.totalVendedores || '',
        d?.precoMin || '',
        d?.precoMedio || '',
        d?.precoMax || '',
        d?.status || '',
        d?.link || '',
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pesquisa_ml_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const itensFiltrados = itens.filter(i =>
    filtroStatus === 'todos' ? true : i.status === filtroStatus
  );

  const contagens = {
    todos:      itens.length,
    pendente:   itens.filter(i => i.status === 'pendente').length,
    analisando: itens.filter(i => i.status === 'analisando').length,
    concluido:  itens.filter(i => i.status === 'concluido').length,
    erro:       itens.filter(i => i.status === 'erro').length,
    fila:       itens.filter(i => i.status === 'fila').length,
  };

  const temPendentes = contagens.pendente + contagens.erro + contagens.fila > 0;

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col overflow-x-hidden" style={{ minHeight: '100vh' }}>
      <style>{`
        @keyframes slide { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/ml')}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base font-black text-slate-800 leading-tight">Pesquisa de Anúncios</h2>
            <p className="text-[10px] text-slate-400">Analise preços e concorrentes de qualquer anúncio do ML</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {itens.length > 0 && (
            <>
              <button onClick={exportarCSV} disabled={contagens.concluido === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40">
                <Download className="w-3.5 h-3.5" />CSV
              </button>
              {!rodando && temPendentes && (
                <button onClick={reanaliarErros}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">
                  <RefreshCw className="w-3.5 h-3.5" />Re-tentar
                </button>
              )}
              <button onClick={limparTudo} disabled={rodando}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase rounded-lg bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />Limpar
              </button>
            </>
          )}
          <button onClick={() => setMostrarInput(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-black uppercase rounded-lg bg-slate-900 text-white hover:bg-slate-700">
            <Plus className="w-3.5 h-3.5" />Adicionar Links
          </button>
        </div>
      </div>

      {/* INPUT DE LINKS */}
      {mostrarInput && (
        <div className="mb-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm" style={{ animation:'fade-in 0.2s ease' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-blue-500" />
              Cole os links ou IDs dos anúncios
            </p>
            <button onClick={() => setMostrarInput(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <textarea
            value={inputTexto}
            onChange={e => setInputTexto(e.target.value)}
            placeholder={`Cole links ou IDs (um por linha ou separados por vírgula):\n\nhttps://www.mercadolivre.com.br/...\nMLB123456789\nhttps://produto.mercadolivre.com.br/MLB-987654321`}
            className="w-full border border-slate-200 rounded-xl p-3 text-xs font-mono outline-none focus:border-blue-400 resize-none bg-slate-50"
            rows={6}
            onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') processarInput(); }}
          />

          <div className="flex items-center justify-between mt-2">
            <p className="text-[9px] text-slate-400">
              Aceita: links completos, links curtos, IDs MLB, separados por vírgula ou quebra de linha • Ctrl+Enter para adicionar
            </p>
            <button onClick={processarInput} disabled={!inputTexto.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />Adicionar à Fila
            </button>
          </div>
        </div>
      )}

      {/* RESUMO GERAL */}
      {itens.length > 0 && <div className="mb-3"><ResumoGeral itens={itens} /></div>}

      {/* BARRA DE CONTROLE */}
      {itens.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 mb-3 flex items-center gap-2 flex-wrap">
          {/* Filtros */}
          <div className="flex gap-0.5 flex-wrap">
            {Object.entries({
              todos:      { label:`Todos (${contagens.todos})`, color:'text-slate-600 bg-slate-100 border-slate-200' },
              concluido:  { label:`Concluídos (${contagens.concluido})`, color:'text-emerald-600 bg-emerald-50 border-emerald-200' },
              pendente:   { label:`Pendentes (${contagens.pendente})`, color:'text-amber-600 bg-amber-50 border-amber-200' },
              analisando: { label:`Analisando (${contagens.analisando})`, color:'text-blue-600 bg-blue-50 border-blue-200' },
              erro:       { label:`Erros (${contagens.erro})`, color:'text-red-600 bg-red-50 border-red-200' },
              fila:       { label:`Fila (${contagens.fila})`, color:'text-purple-600 bg-purple-50 border-purple-200' },
            }).filter(([, v]) => v.label.match(/\((\d+)\)/)?.[1] !== '0' || 'todos' === Object.keys({todos:1})[0]).map(([k, v]) => (
              <button key={k} onClick={() => setFiltroStatus(k)}
                className={`px-2 py-1 rounded text-[9px] font-black uppercase border transition-all ${filtroStatus === k ? v.color : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {!rodando ? (
              <button onClick={iniciarAnalise} disabled={!temPendentes || !mlConectado}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all">
                <Zap className="w-3.5 h-3.5" />
                {mlConectado ? `Analisar ${contagens.pendente + contagens.erro + contagens.fila} anúncio(s)` : '🔒 Conecte o ML nas Configurações'}
              </button>
            ) : (
              <button onClick={pararAnalise}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase bg-red-600 text-white hover:bg-red-700">
                <XCircle className="w-3.5 h-3.5" />Parar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ESTADO VAZIO */}
      {itens.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
          <div className="w-20 h-20 bg-[#FFE600] rounded-3xl flex items-center justify-center shadow-lg">
            <Search className="w-10 h-10 text-slate-900" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 mb-1">Pesquise qualquer anúncio do ML</h3>
            <p className="text-sm text-slate-400 max-w-md">
              Cole links ou IDs de anúncios para ver preços, vendedores, concorrentes e análise completa de mercado.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-xl text-left">
            {[
              { icon: Users, title:'Concorrentes', desc:'Veja todos os vendedores que oferecem o mesmo produto' },
              { icon: BarChart2, title:'Análise de Preço', desc:'Compare seu preço com o mínimo, máximo e média do mercado' },
              { icon: Activity, title:'Anti-Timeout', desc:'Itens que atingem o limite de requisição são re-tentados automaticamente' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border border-slate-200 rounded-xl p-3">
                <Icon className="w-5 h-5 text-blue-500 mb-2" />
                <p className="text-xs font-black text-slate-700 mb-0.5">{title}</p>
                <p className="text-[10px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
          <button onClick={() => setMostrarInput(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black uppercase bg-slate-900 text-white hover:bg-slate-700">
            <Plus className="w-4 h-4" />Adicionar Links
          </button>
        </div>
      )}

      <div className="flex gap-3 flex-1">
        {/* LOG TERMINAL — sempre à esquerda quando há itens */}
        {itens.length > 0 && (
          <div className="w-64 flex-shrink-0 bg-slate-950 rounded-2xl flex flex-col" style={{ maxHeight: '75vh', minHeight: '200px' }}>
            {/* Cabeçalho do terminal */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800">
              <div className="flex gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              </div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                <Activity className="w-3 h-3" />Terminal
              </p>
              {rodando && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5 font-mono">
              {log.length === 0 ? (
                <p className="text-[9px] text-slate-700 italic">Aguardando análise...</p>
              ) : (
                log.map((l, i) => (
                  <div key={i} className={`text-[9px] leading-relaxed break-all ${
                    l.tipo === 'success' ? 'text-emerald-400' :
                    l.tipo === 'warn'    ? 'text-amber-400' :
                    'text-slate-400'
                  }`}>
                    <span className="text-slate-600 mr-1 select-none">{l.ts}</span>{l.msg}
                  </div>
                ))
              )}
              {rodando && (
                <div className="text-[9px] text-blue-400 flex items-center gap-1 animate-pulse mt-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />processando...
                </div>
              )}
            </div>
          </div>
        )}

        {/* LISTA DE ITENS */}
        {itens.length > 0 && (
          <div className="flex-1 min-w-0 space-y-2.5">
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
        )}
      </div>
    </div>
  );
}