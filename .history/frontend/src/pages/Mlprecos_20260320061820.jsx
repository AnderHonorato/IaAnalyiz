import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, RefreshCw, DollarSign, ExternalLink, Check, X,
  Loader2, AlertTriangle, CheckCircle2, Image as ImageIcon, ChevronDown,
  TrendingUp, TrendingDown, Minus, Edit3, Save, XCircle, ShoppingBag,
  Square, CheckSquare, Zap, Info
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

// ── Portal ────────────────────────────────────────────────────────────────────
function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}
function ModalOverlay({ onClose, children, side = 'center' }) {
  return (
    <Portal>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999999,
          background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: side === 'right' ? 'stretch' : 'center',
          justifyContent: side === 'right' ? 'flex-end' : 'center',
          padding: side === 'center' ? '16px' : '0',
        }}
      >
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', height: side === 'right' ? '100%' : 'auto' }}>
          {children}
        </div>
      </div>
    </Portal>
  );
}

// ── Chip de variação ──────────────────────────────────────────────────────────
function VariacaoChip({ anterior, novo }) {
  if (!anterior || !novo || anterior === novo) return null;
  const diff = ((novo - anterior) / anterior) * 100;
  const up = novo > anterior;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '+' : ''}{diff.toFixed(1)}%
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'active')   return <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">Ativo</span>;
  if (status === 'paused')   return <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">Pausado</span>;
  if (status === 'closed')   return <span className="text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">Encerrado</span>;
  return <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">{status}</span>;
}

export default function MLPrecos() {
  const { userId } = useOutletContext() || {};
  const navigate = useNavigate();
  const { confirm, alert } = useModal();

  const [mlConectado, setMlConectado]     = useState(false);
  const [mlNick, setMlNick]               = useState('');
  const [anuncios, setAnuncios]           = useState([]);
  const [loading, setLoading]             = useState(false);
  const [busca, setBusca]                 = useState('');
  const [editandoId, setEditandoId]       = useState(null);
  const [novoPreco, setNovoPreco]         = useState('');
  const [novaQtd, setNovaQtd]             = useState('');
  const [salvando, setSalvando]           = useState(false);
  const [resultados, setResultados]       = useState({}); // { [mlItemId]: 'ok' | 'erro' }
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [showLote, setShowLote]           = useState(false);
  const [precoLote, setPrecoLote]         = useState('');
  const [tipoAjuste, setTipoAjuste]       = useState('fixo'); // 'fixo' | 'percentual'
  const [salvandoLote, setSalvandoLote]   = useState(false);
  const [logLote, setLogLote]             = useState([]);
  const [filtroStatus, setFiltroStatus]   = useState('active');

  const inputRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    verificarML();
  }, [userId]);

  useEffect(() => {
    if (mlConectado) buscarAnuncios();
  }, [mlConectado, filtroStatus]);

  useEffect(() => {
    if (editandoId && inputRef.current) inputRef.current.focus();
  }, [editandoId]);

  const verificarML = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`);
      const data = await res.json();
      setMlConectado(data.connected && !data.expired);
      setMlNick(data.nickname || '');
    } catch {}
  };

  const buscarAnuncios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/precos/anuncios?userId=${userId}&status=${filtroStatus}`);
      const data = await res.json();
      setAnuncios(data.anuncios || []);
    } catch {
      setAnuncios([]);
    } finally {
      setLoading(false);
    }
  };

  const abrirEdicao = (item) => {
    setEditandoId(item.id);
    setNovoPreco(String(item.price));
    setNovaQtd(String(item.available_quantity ?? ''));
    setResultados(r => { const n = { ...r }; delete n[item.id]; return n; });
  };

  const cancelarEdicao = () => {
    setEditandoId(null); setNovoPreco(''); setNovaQtd('');
  };

  const salvarPreco = async (item) => {
    const preco = parseFloat(novoPreco);
    const qtd   = parseInt(novaQtd) || item.available_quantity || 1;
    if (!preco || preco <= 0) {
      alert({ title: 'Valor inválido', message: 'Informe um preço maior que zero.', type: 'warning' });
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mlItemId: item.id, price: preco, available_quantity: qtd }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setResultados(r => ({ ...r, [item.id]: 'ok' }));
        setAnuncios(prev => prev.map(a =>
          a.id === item.id ? { ...a, price: preco, available_quantity: qtd, precoAnterior: a.price } : a
        ));
        setEditandoId(null);
      } else {
        setResultados(r => ({ ...r, [item.id]: 'erro' }));
        alert({ title: 'Erro ao atualizar', message: data.message || 'Falha na API do ML. Verifique o token.', type: 'warning' });
      }
    } catch {
      setResultados(r => ({ ...r, [item.id]: 'erro' }));
      alert({ title: 'Erro', message: 'Falha na conexão com o servidor.', type: 'warning' });
    } finally {
      setSalvando(false);
    }
  };

  const salvarLote = async () => {
    if (selectedIds.size === 0) return;
    const valor = parseFloat(precoLote);
    if (!valor || valor <= 0) {
      alert({ title: 'Valor inválido', message: 'Informe um valor válido.', type: 'warning' });
      return;
    }
    const ok = await confirm({
      title: `Atualizar ${selectedIds.size} anúncio(s)`,
      message: tipoAjuste === 'fixo'
        ? `Definir preço de R$ ${valor.toFixed(2)} para ${selectedIds.size} anúncio(s)?`
        : `Aplicar ${valor > 0 ? '+' : ''}${valor}% em ${selectedIds.size} anúncio(s)?`,
      confirmLabel: 'Confirmar',
    });
    if (!ok) return;

    setSalvandoLote(true);
    setLogLote([]);
    const itens = anuncios.filter(a => selectedIds.has(a.id));

    for (const item of itens) {
      const novoP = tipoAjuste === 'fixo' ? valor : parseFloat((item.price * (1 + valor / 100)).toFixed(2));
      const qtd   = item.available_quantity || 1;
      try {
        const res = await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, mlItemId: item.id, price: novoP, available_quantity: qtd }),
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          setLogLote(l => [...l, { id: item.id, titulo: item.title, status: 'ok', de: item.price, para: novoP }]);
          setAnuncios(prev => prev.map(a =>
            a.id === item.id ? { ...a, price: novoP, precoAnterior: a.price } : a
          ));
        } else {
          setLogLote(l => [...l, { id: item.id, titulo: item.title, status: 'erro', msg: data.message }]);
        }
      } catch {
        setLogLote(l => [...l, { id: item.id, titulo: item.title, status: 'erro', msg: 'Falha de conexão' }]);
      }
      await new Promise(r => setTimeout(r, 300)); // evita rate limit
    }
    setSalvandoLote(false);
    setSelectedIds(new Set());
  };

  const anunciosFiltrados = anuncios.filter(a =>
    !busca || a.title.toLowerCase().includes(busca.toLowerCase()) || a.id.toLowerCase().includes(busca.toLowerCase())
  );

  const toggleSelect = (id) => {
    setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selectedIds.size === anunciosFiltrados.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(anunciosFiltrados.map(a => a.id)));
  };

  const precoMedio = anuncios.length > 0
    ? (anuncios.reduce((s, a) => s + a.price, 0) / anuncios.length).toFixed(2)
    : '—';

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 h-full flex flex-col animate-in fade-in duration-300">

      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-2 shrink-0 gap-1.5">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/ml')} className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <h2 className="text-sm font-black tracking-tight text-slate-800">Precificação ML</h2>
          {mlNick && (
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />{mlNick}
            </span>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-1 justify-end">
          {selectedIds.size > 0 && (
            <button onClick={() => setShowLote(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-blue-700">
              <Zap className="w-3 h-3" />Atualizar em Lote ({selectedIds.size})
            </button>
          )}
          <button onClick={buscarAnuncios} disabled={loading || !mlConectado}
            className="p-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* CARDS COMPACTOS */}
      <div className="grid grid-cols-4 gap-1.5 mb-2 shrink-0">
        {[
          { label: 'Anúncios', value: anuncios.length, sub: `${filtroStatus}`, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', bar: 100, barColor: 'bg-blue-400' },
          { label: 'Preço Médio', value: precoMedio !== '—' ? `R$${precoMedio}` : '—', sub: 'média atual', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', bar: 70, barColor: 'bg-emerald-400' },
          { label: 'Selecionados', value: selectedIds.size, sub: 'para atualizar', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', bar: anuncios.length > 0 ? (selectedIds.size / anuncios.length) * 100 : 0, barColor: 'bg-amber-400' },
          { label: 'Atualizados', value: Object.values(resultados).filter(v => v === 'ok').length, sub: `${Object.values(resultados).filter(v => v === 'erro').length} erros`, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', bar: 0, barColor: 'bg-slate-400' },
        ].map((m, i) => (
          <div key={i} className={`${m.bg} border ${m.border} rounded-xl px-3 py-2`}>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{m.label}</p>
            <p className={`text-lg font-black ${m.color} leading-none`}>{m.value}</p>
            <p className="text-[8px] text-slate-400 mt-0.5">{m.sub}</p>
            <div className="h-0.5 bg-white/60 rounded-full mt-1 overflow-hidden">
              <div className={`h-full ${m.barColor} rounded-full`} style={{ width: `${Math.min(m.bar, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">

        {/* TOOLBAR */}
        <div className="p-3 border-b border-slate-100 shrink-0 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título ou ID do anúncio..."
              className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-[10px]" />
          </div>

          {/* Filtro de status */}
          <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
            {[['active','Ativos'],['paused','Pausados'],['closed','Encerrados']].map(([v,l]) => (
              <button key={v} onClick={() => { setFiltroStatus(v); setSelectedIds(new Set()); }}
                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase transition-all ${filtroStatus === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>

          <span className="text-[9px] text-slate-400 font-semibold">{anunciosFiltrados.length} anúncio{anunciosFiltrados.length !== 1 ? 's' : ''}</span>
        </div>

        {/* AVISO API */}
        <div className="mx-3 mt-2.5 mb-0 shrink-0">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
            <Info className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-[9px] text-amber-700 leading-relaxed">
              <strong>Atenção API ML:</strong> a atualização envia <code className="bg-amber-100 px-0.5 rounded">price</code> + <code className="bg-amber-100 px-0.5 rounded">available_quantity</code> juntos (obrigatório desde 18/03/2026). Verifique o estoque antes de salvar.
            </p>
          </div>
        </div>

        {/* TABELA */}
        <div className="flex-1 overflow-y-auto mt-2.5">
          {!mlConectado ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                <ShoppingBag className="w-8 h-8 text-amber-400" />
              </div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">ML não conectado</p>
              <p className="text-[10px] text-slate-400">Conecte sua conta nas Configurações da Auditoria.</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-[10px] text-slate-400">Carregando anúncios...</span>
            </div>
          ) : anunciosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <DollarSign className="w-8 h-8 text-slate-200" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum anúncio encontrado</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr className="text-[8px] font-black uppercase text-slate-400">
                  <th className="px-3 py-2 w-8">
                    <button onClick={toggleAll} className="text-slate-400">
                      {selectedIds.size === anunciosFiltrados.length && anunciosFiltrados.length > 0
                        ? <CheckSquare className="w-3 h-3 text-blue-600" />
                        : <Square className="w-3 h-3" />}
                    </button>
                  </th>
                  <th className="px-3 py-2">Anúncio</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Estoque</th>
                  <th className="px-3 py-2 text-center">Preço Atual</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[9px]">
                {anunciosFiltrados.map(item => {
                  const editando  = editandoId === item.id;
                  const resStatus = resultados[item.id];
                  const sel       = selectedIds.has(item.id);
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${sel ? 'bg-blue-50/30' : ''} ${editando ? 'bg-blue-50/20 ring-1 ring-inset ring-blue-200' : ''}`}>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleSelect(item.id)} className="text-slate-400">
                          {sel ? <CheckSquare className="w-3 h-3 text-blue-600" /> : <Square className="w-3 h-3" />}
                        </button>
                      </td>

                      {/* Anúncio */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {item.thumbnail
                            ? <img src={item.thumbnail} alt="" className="w-9 h-9 object-cover rounded-lg border border-slate-100 flex-shrink-0" />
                            : <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-3.5 h-3.5 text-slate-300" /></div>
                          }
                          <div>
                            <p className="font-bold text-slate-800 max-w-[280px] truncate text-[10px]">{item.title}</p>
                            <a href={`https://produto.mercadolivre.com.br/MLB-${item.id.replace(/^MLB/i,'')}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[8px] font-mono text-blue-500 hover:text-blue-700 flex items-center gap-0.5 mt-0.5">
                              {item.id}<ExternalLink className="w-2 h-2" />
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={item.status} />
                      </td>

                      {/* Estoque */}
                      <td className="px-3 py-2.5 text-center">
                        {editando ? (
                          <input
                            type="number" min="0" value={novaQtd}
                            onChange={e => setNovaQtd(e.target.value)}
                            className="w-16 text-center border border-blue-300 rounded-lg py-1 text-[10px] font-bold outline-none focus:border-blue-500 bg-white"
                            placeholder="Qtd"
                          />
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-600">{item.available_quantity ?? '—'}</span>
                        )}
                      </td>

                      {/* Preço */}
                      <td className="px-3 py-2.5 text-center">
                        {editando ? (
                          <div className="flex items-center gap-1 justify-center">
                            <span className="text-[9px] text-slate-400 font-bold">R$</span>
                            <input
                              ref={inputRef}
                              type="number" step="0.01" min="0.01" value={novoPreco}
                              onChange={e => setNovoPreco(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') salvarPreco(item); if (e.key === 'Escape') cancelarEdicao(); }}
                              className="w-24 text-center border border-blue-300 rounded-lg py-1 text-[11px] font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[11px] font-black text-slate-800">
                              R$ {typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                            </span>
                            {item.precoAnterior && (
                              <div className="flex items-center gap-1">
                                <span className="text-[8px] text-slate-400 line-through">R$ {item.precoAnterior.toFixed(2)}</span>
                                <VariacaoChip anterior={item.precoAnterior} novo={item.price} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="px-3 py-2.5 text-right">
                        {editando ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => salvarPreco(item)} disabled={salvando}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[9px] font-black uppercase hover:bg-emerald-600 disabled:opacity-50">
                              {salvando ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}Salvar
                            </button>
                            <button onClick={cancelarEdicao} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {resStatus === 'ok' && <span className="flex items-center gap-0.5 text-[8px] font-bold text-emerald-600"><CheckCircle2 className="w-3 h-3" />Salvo</span>}
                            {resStatus === 'erro' && <span className="flex items-center gap-0.5 text-[8px] font-bold text-red-500"><AlertTriangle className="w-3 h-3" />Erro</span>}
                            <button onClick={() => abrirEdicao(item)}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 text-[9px] font-black uppercase transition-colors">
                              <Edit3 className="w-2.5 h-2.5" />Editar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL ATUALIZAÇÃO EM LOTE */}
      {showLote && (
        <ModalOverlay onClose={() => { if (!salvandoLote) setShowLote(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '440px', maxWidth: '95vw', maxHeight: '88vh' }}>
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="font-black text-slate-800 uppercase text-[10px] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-blue-600" />Atualização em Lote — {selectedIds.size} anúncio(s)
              </h3>
              {!salvandoLote && (
                <button onClick={() => setShowLote(false)} className="text-slate-400 hover:text-red-500">
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Tipo de ajuste */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Tipo de ajuste</label>
                <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                  <button onClick={() => setTipoAjuste('fixo')}
                    className={`flex-1 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${tipoAjuste === 'fixo' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                    Preço Fixo
                  </button>
                  <button onClick={() => setTipoAjuste('percentual')}
                    className={`flex-1 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${tipoAjuste === 'percentual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                    % Variação
                  </button>
                </div>
              </div>

              {/* Input */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  {tipoAjuste === 'fixo' ? 'Novo preço (R$)' : 'Variação percentual (ex: -10 para -10%, +5 para +5%)'}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-400">{tipoAjuste === 'fixo' ? 'R$' : '%'}</span>
                  <input type="number" step={tipoAjuste === 'fixo' ? '0.01' : '0.1'} value={precoLote}
                    onChange={e => setPrecoLote(e.target.value)}
                    placeholder={tipoAjuste === 'fixo' ? '0.00' : '-10 ou +5'}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
                </div>
                {tipoAjuste === 'percentual' && precoLote && (
                  <p className="text-[9px] text-slate-400 mt-1">
                    Exemplo: R$ 100,00 → R$ {(100 * (1 + parseFloat(precoLote || 0) / 100)).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Preview dos selecionados */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Anúncios selecionados</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 max-h-36 overflow-y-auto space-y-1">
                  {anuncios.filter(a => selectedIds.has(a.id)).map(a => {
                    const novoP = tipoAjuste === 'fixo'
                      ? parseFloat(precoLote || 0)
                      : parseFloat((a.price * (1 + parseFloat(precoLote || 0) / 100)).toFixed(2));
                    return (
                      <div key={a.id} className="flex items-center justify-between text-[9px]">
                        <span className="text-slate-600 truncate max-w-[220px]">{a.title}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          <span className="text-slate-400 line-through">R${a.price.toFixed(2)}</span>
                          {precoLote && novoP > 0 && <>
                            <span className="text-slate-300">→</span>
                            <span className="font-black text-blue-700">R${novoP.toFixed(2)}</span>
                          </>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Log de resultado */}
              {logLote.length > 0 && (
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Resultado</label>
                  <div className="bg-slate-900 rounded-xl p-3 max-h-32 overflow-y-auto space-y-0.5" style={{ fontFamily: 'monospace' }}>
                    {logLote.map((l, i) => (
                      <div key={i} className={`text-[9px] flex items-start gap-1.5 ${l.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span>{l.status === 'ok' ? '✓' : '✗'}</span>
                        <span className="truncate">{l.titulo}</span>
                        {l.status === 'ok' && <span className="ml-auto flex-shrink-0 text-slate-500">R${l.de.toFixed(2)} → R${l.para.toFixed(2)}</span>}
                        {l.status === 'erro' && <span className="ml-auto flex-shrink-0 text-slate-500">{l.msg}</span>}
                      </div>
                    ))}
                    {salvandoLote && (
                      <div className="flex items-center gap-1.5 text-blue-400 text-[9px]">
                        <Loader2 className="w-3 h-3 animate-spin" /><span>processando...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              {!salvandoLote && (
                <button onClick={() => setShowLote(false)} className="px-4 py-2 rounded-xl text-[9px] font-bold text-slate-500 hover:bg-slate-100">
                  {logLote.length > 0 ? 'Fechar' : 'Cancelar'}
                </button>
              )}
              {logLote.length === 0 && (
                <button onClick={salvarLote} disabled={!precoLote || salvandoLote}
                  className="px-5 py-2 rounded-xl text-[9px] font-black uppercase text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 flex items-center gap-1.5">
                  {salvandoLote ? <><Loader2 className="w-3 h-3 animate-spin" />Processando...</> : <><Zap className="w-3 h-3" />Aplicar</>}
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}