import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, RefreshCw, DollarSign, ExternalLink, Check, X,
  Loader2, AlertTriangle, CheckCircle2, Image as ImageIcon, Edit3,
  Save, XCircle, Square, CheckSquare, Zap, Info,
  TrendingUp, TrendingDown, Wifi, WifiOff, Terminal
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }
function ModalOverlay({ onClose, children, side = 'center' }) {
  return (
    <Portal>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: side === 'right' ? 'stretch' : 'center',
        justifyContent: side === 'right' ? 'flex-end' : 'center',
        padding: side === 'center' ? '16px' : 0,
      }}>
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', height: side === 'right' ? '100%' : 'auto' }}>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function VariacaoChip({ anterior, novo }) {
  if (!anterior || !novo || anterior === novo) return null;
  const diff = ((novo - anterior) / anterior) * 100;
  const up = novo > anterior;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{diff.toFixed(1)}%
    </span>
  );
}

function StatusBadge({ status }) {
  const map = { active: 'text-emerald-700 bg-emerald-50 border-emerald-200', paused: 'text-amber-700 bg-amber-50 border-amber-200', closed: 'text-slate-500 bg-slate-50 border-slate-200' };
  const lbl = { active: 'Ativo', paused: 'Pausado', closed: 'Encerrado' };
  return <span className={`text-xs font-semibold border px-2 py-0.5 rounded-full ${map[status] || 'text-slate-400 bg-slate-50 border-slate-200'}`}>{lbl[status] || status}</span>;
}

export default function Mlprecos() {
  const { userId } = useOutletContext() || {};
  const navigate = useNavigate();
  const { confirm, alert } = useModal();

  const [mlConectado, setMlConectado]   = useState(false);
  const [mlNick, setMlNick]             = useState('');
  const [anuncios, setAnuncios]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [busca, setBusca]               = useState('');
  const [filtroStatus, setFiltroStatus] = useState('active');

  // terminal de busca
  const [termLogs, setTermLogs]         = useState([]);
  const [termVisible, setTermVisible]   = useState(false);
  const termRef = useRef(null);

  // edição inline
  const [editandoId, setEditandoId]     = useState(null);
  const [novoPreco, setNovoPreco]       = useState('');
  const [novaQtd, setNovaQtd]           = useState('');
  const [salvando, setSalvando]         = useState(false);
  const [resultados, setResultados]     = useState({});

  // lote
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [showLote, setShowLote]         = useState(false);
  const [tipoAjuste, setTipoAjuste]     = useState('fixo');
  const [valorLote, setValorLote]       = useState('');
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [logLote, setLogLote]           = useState([]);

  const inputPrecoRef = useRef(null);

  const addLog = (msg, type = 'info') => setTermLogs(l => [...l, { msg, type, t: new Date().toLocaleTimeString('pt-BR') }]);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [termLogs]);

  useEffect(() => { if (userId) verificarML(); }, [userId]);
  useEffect(() => { if (editandoId && inputPrecoRef.current) inputPrecoRef.current.focus(); }, [editandoId]);

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
    setTermVisible(true);
    setTermLogs([]);
    setAnuncios([]);
    setSelectedIds(new Set());

    addLog(`[${new Date().toLocaleTimeString('pt-BR')}] Iniciando busca de anúncios...`);
    addLog(`Filtro: status=${filtroStatus}`);

    try {
      addLog('Conectando à API do Mercado Livre...');
      const res = await fetch(`${API_BASE_URL}/api/ml/precos/anuncios?userId=${userId}&status=${filtroStatus}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        addLog(`ERRO: ${data.error || 'Falha na API'}`, 'erro');
        alert({ title: 'Erro ao buscar', message: data.error || 'Falha na API.', type: 'warning' });
        return;
      }

      addLog(`✓ ${data.total} anúncio(s) encontrado(s)`, 'ok');
      if (data.anuncios?.length > 0) {
        addLog(`Preço mais baixo: R$ ${Math.min(...data.anuncios.map(a => a.price)).toFixed(2)}`);
        addLog(`Preço mais alto:  R$ ${Math.max(...data.anuncios.map(a => a.price)).toFixed(2)}`);
        addLog(`Estoque total:    ${data.anuncios.reduce((s, a) => s + (a.available_quantity || 0), 0)} unidades`);
      }
      addLog('─── Busca concluída ───', 'ok');
      setAnuncios(data.anuncios || []);
    } catch (err) {
      addLog(`ERRO de conexão: ${err.message}`, 'erro');
      alert({ title: 'Erro', message: 'Falha na conexão com o servidor.', type: 'warning' });
    } finally {
      setLoading(false);
    }
  };

  const abrirEdicao = (item) => {
    setEditandoId(item.id);
    setNovoPreco(String(item.price));
    setNovaQtd(String(item.available_quantity ?? 1));
    setResultados(r => { const n = { ...r }; delete n[item.id]; return n; });
  };
  const cancelarEdicao = () => { setEditandoId(null); setNovoPreco(''); setNovaQtd(''); };

  const salvarPreco = async (item) => {
    const preco = parseFloat(novoPreco);
    const qtd   = parseInt(novaQtd) || item.available_quantity || 1;
    if (!preco || preco <= 0) { alert({ title: 'Valor inválido', message: 'Informe um preço maior que zero.', type: 'warning' }); return; }
    setSalvando(true);
    addLog(`Atualizando ${item.id}: R$ ${item.price.toFixed(2)} → R$ ${preco.toFixed(2)}`);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mlItemId: item.id, price: preco, available_quantity: qtd }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setResultados(r => ({ ...r, [item.id]: 'ok' }));
        setAnuncios(prev => prev.map(a => a.id === item.id ? { ...a, price: preco, available_quantity: qtd, precoAnterior: a.price } : a));
        addLog(`✓ ${item.id} atualizado com sucesso`, 'ok');
        cancelarEdicao();
      } else {
        setResultados(r => ({ ...r, [item.id]: 'erro' }));
        addLog(`✗ Erro em ${item.id}: ${data.message}`, 'erro');
        alert({ title: 'Erro ao atualizar', message: data.message || 'Falha na API do ML.', type: 'warning' });
      }
    } catch (err) {
      setResultados(r => ({ ...r, [item.id]: 'erro' }));
      addLog(`✗ Falha de conexão: ${err.message}`, 'erro');
    } finally { setSalvando(false); }
  };

  const abrirLote = () => { setValorLote(''); setTipoAjuste('fixo'); setLogLote([]); setShowLote(true); };

  const salvarLote = async () => {
    const valor = parseFloat(valorLote);
    if (!valor || (tipoAjuste === 'fixo' && valor <= 0)) {
      alert({ title: 'Valor inválido', message: 'Informe um valor válido.', type: 'warning' }); return;
    }
    const ok = await confirm({
      title: `Atualizar ${selectedIds.size} anúncio(s)`,
      message: tipoAjuste === 'fixo'
        ? `Definir R$ ${valor.toFixed(2)} para ${selectedIds.size} anúncio(s)?`
        : `Aplicar ${valor > 0 ? '+' : ''}${valor}% em ${selectedIds.size} anúncio(s)?`,
      confirmLabel: 'Confirmar',
    });
    if (!ok) return;

    setSalvandoLote(true);
    setLogLote([]);
    addLog(`Iniciando atualização em lote de ${selectedIds.size} anúncios...`);
    const itens = anuncios.filter(a => selectedIds.has(a.id));

    for (const item of itens) {
      const novoP = tipoAjuste === 'fixo' ? valor : parseFloat((item.price * (1 + valor / 100)).toFixed(2));
      const qtd = item.available_quantity || 1;
      try {
        const res = await fetch(`${API_BASE_URL}/api/ml/precos/atualizar`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, mlItemId: item.id, price: novoP, available_quantity: qtd }),
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          setLogLote(l => [...l, { id: item.id, titulo: item.title, status: 'ok', de: item.price, para: novoP }]);
          setAnuncios(prev => prev.map(a => a.id === item.id ? { ...a, price: novoP, precoAnterior: a.price } : a));
          addLog(`✓ ${item.id}: R$${item.price.toFixed(2)} → R$${novoP.toFixed(2)}`, 'ok');
        } else {
          setLogLote(l => [...l, { id: item.id, titulo: item.title, status: 'erro', msg: data.message }]);
          addLog(`✗ ${item.id}: ${data.message}`, 'erro');
        }
      } catch (err) {
        setLogLote(l => [...l, { id: item.id, titulo: item.title, status: 'erro', msg: 'Falha' }]);
        addLog(`✗ ${item.id}: falha de conexão`, 'erro');
      }
      await new Promise(r => setTimeout(r, 350));
    }
    addLog(`Lote concluído: ${logLote.filter(l => l.status === 'ok').length + 1} OK`, 'ok');
    setSalvandoLote(false);
    setSelectedIds(new Set());
  };

  const anunciosFiltrados = anuncios.filter(a =>
    !busca || a.title.toLowerCase().includes(busca.toLowerCase()) || a.id.toLowerCase().includes(busca.toLowerCase())
  );
  const toggleSelect = (id) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (selectedIds.size === anunciosFiltrados.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(anunciosFiltrados.map(a => a.id)));
  };

  const precoMedio  = anuncios.length > 0 ? (anuncios.reduce((s, a) => s + a.price, 0) / anuncios.length).toFixed(2) : null;
  const estoqueTotal = anuncios.reduce((s, a) => s + (a.available_quantity || 0), 0);
  const atualizadosOk = Object.values(resultados).filter(v => v === 'ok').length;

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 h-full flex flex-col gap-2 animate-in fade-in duration-300">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/ml')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-black tracking-tight" style={{ color: 'var(--theme-text)' }}>Precificação ML</h2>
            <p className={`text-xs flex items-center gap-1 ${mlConectado ? 'text-emerald-600' : 'text-slate-400'}`}>
              {mlConectado ? <><Wifi className="w-3 h-3" />{mlNick}</> : <><WifiOff className="w-3 h-3" />Não conectado</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {selectedIds.size > 0 && (
            <button onClick={abrirLote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white hover:opacity-90"
              style={{ background: 'var(--theme-accent)' }}>
              <Zap className="w-3.5 h-3.5" />Lote ({selectedIds.size})
            </button>
          )}
          <button onClick={() => setTermVisible(v => !v)}
            className={`p-1.5 rounded-lg border text-sm transition-colors ${termVisible ? 'bg-slate-900 text-emerald-400 border-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <Terminal className="w-4 h-4" />
          </button>
          <button onClick={buscarAnuncios} disabled={loading || !mlConectado}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Buscando...' : 'Buscar Anúncios'}
          </button>
        </div>
      </div>

      {/* ── CARD UNIFICADO COMPACTO ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-6 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-xs text-slate-400 font-medium">Anúncios</span>
          <span className="text-sm font-black text-blue-600">{anuncios.length}</span>
        </div>
        <div className="w-px h-5 bg-slate-100" />
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-slate-400 font-medium">Preço médio</span>
          <span className="text-sm font-black text-emerald-600">{precoMedio ? `R$ ${precoMedio}` : '—'}</span>
        </div>
        <div className="w-px h-5 bg-slate-100" />
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span className="text-xs text-slate-400 font-medium">Estoque total</span>
          <span className="text-sm font-black text-slate-700">{estoqueTotal > 0 ? estoqueTotal : '—'}</span>
        </div>
        <div className="w-px h-5 bg-slate-100" />
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-slate-400 font-medium">Selecionados</span>
          <span className="text-sm font-black text-amber-600">{selectedIds.size}</span>
        </div>
        {atualizadosOk > 0 && <>
          <div className="w-px h-5 bg-slate-100" />
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-slate-400 font-medium">Atualizados</span>
            <span className="text-sm font-black text-emerald-600">{atualizadosOk}</span>
          </div>
        </>}
        {Object.values(resultados).filter(v => v === 'erro').length > 0 && <>
          <div className="w-px h-5 bg-slate-100" />
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-slate-400 font-medium">Erros</span>
            <span className="text-sm font-black text-red-500">{Object.values(resultados).filter(v => v === 'erro').length}</span>
          </div>
        </>}
      </div>

      {/* ── TERMINAL ────────────────────────────────────────────────────────── */}
      {termVisible && (
        <div className="bg-slate-950 rounded-xl p-3 shrink-0 max-h-36 overflow-y-auto" ref={termRef} style={{ fontFamily: 'monospace' }}>
          {termLogs.length === 0 ? (
            <p className="text-[11px] text-slate-600">Terminal pronto. Clique em "Buscar Anúncios" para começar.</p>
          ) : termLogs.map((l, i) => (
            <div key={i} className={`text-[11px] leading-relaxed ${l.type === 'ok' ? 'text-emerald-400' : l.type === 'erro' ? 'text-red-400' : 'text-slate-300'}`}>
              <span className="text-slate-600 mr-2 select-none">[{l.t}]</span>{l.msg}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-[11px] text-blue-400 mt-1">
              <Loader2 className="w-3 h-3 animate-spin" /><span className="animate-pulse">buscando...</span>
            </div>
          )}
        </div>
      )}

      {/* ── TABELA ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">

        {/* toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-100 shrink-0 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por título ou ID do anúncio..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:bg-white transition-all" />
          </div>
          <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
            {[['active','Ativos'],['paused','Pausados'],['closed','Encerrados']].map(([v,l]) => (
              <button key={v} onClick={() => { setFiltroStatus(v); setSelectedIds(new Set()); }}
                className={`px-3 py-1 rounded-md text-sm font-semibold transition-all ${filtroStatus === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <span className="text-sm text-slate-400">{anunciosFiltrados.length} anúncio{anunciosFiltrados.length !== 1 ? 's' : ''}</span>
        </div>

        {/* aviso API */}
        <div className="mx-4 mt-2.5 shrink-0">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>API ML:</strong> atualização exige <code className="bg-amber-100 px-1 rounded">price</code> + <code className="bg-amber-100 px-1 rounded">available_quantity</code> juntos (obrigatório desde 18/03/2026).
            </p>
          </div>
        </div>

        {/* conteúdo */}
        <div className="flex-1 overflow-y-auto mt-2">
          {!mlConectado ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <WifiOff className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-400">ML não conectado</p>
              <button onClick={() => navigate('/ml/auditoria')}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--theme-accent)' }}>
                Ir para Configurações
              </button>
            </div>
          ) : anuncios.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <DollarSign className="w-10 h-10 text-slate-200" />
              <p className="text-sm font-semibold text-slate-400">Clique em "Buscar Anúncios" para carregar</p>
              <button onClick={buscarAnuncios}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--theme-accent)' }}>
                Buscar Anúncios
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              <p className="text-sm text-slate-400">Carregando anúncios do ML...</p>
            </div>
          ) : anunciosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm text-slate-400">Nenhum resultado para "{busca}"</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 w-10">
                    <button onClick={toggleAll} className="text-slate-400 hover:text-blue-600">
                      {selectedIds.size === anunciosFiltrados.length && anunciosFiltrados.length > 0
                        ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-2.5">Anúncio</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-center w-28">Estoque</th>
                  <th className="px-4 py-2.5 text-center w-44">Preço</th>
                  <th className="px-4 py-2.5 text-right w-36">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {anunciosFiltrados.map(item => {
                  const editando  = editandoId === item.id;
                  const resStatus = resultados[item.id];
                  const sel       = selectedIds.has(item.id);
                  return (
                    <tr key={item.id}
                      className={`transition-colors group ${sel ? 'bg-blue-50/40' : ''} ${editando ? 'bg-blue-50/30 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50/70'}`}>

                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(item.id)} className="text-slate-400 hover:text-blue-600">
                          {sel ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.thumbnail
                            ? <img src={item.thumbnail} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-100 flex-shrink-0" />
                            : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-4 h-4 text-slate-300" /></div>
                          }
                          <div>
                            <p className="text-sm font-semibold text-slate-800 max-w-xs truncate">{item.title}</p>
                            <a href={`https://produto.mercadolivre.com.br/MLB-${item.id.replace(/^MLB/i,'')}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs font-mono text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                              {item.id}<ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center"><StatusBadge status={item.status} /></td>

                      <td className="px-4 py-3 text-center">
                        {editando ? (
                          <input type="number" min="0" value={novaQtd}
                            onChange={e => setNovaQtd(e.target.value)}
                            className="w-20 text-center border border-blue-300 rounded-lg py-1.5 text-sm font-semibold outline-none focus:border-blue-500 bg-white" />
                        ) : (
                          <span className="text-sm font-semibold text-slate-600">{item.available_quantity ?? '—'}</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {editando ? (
                          <div className="flex items-center gap-1 justify-center">
                            <span className="text-sm text-slate-400">R$</span>
                            <input ref={inputPrecoRef} type="number" step="0.01" min="0.01" value={novoPreco}
                              onChange={e => setNovoPreco(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') salvarPreco(item); if (e.key === 'Escape') cancelarEdicao(); }}
                              className="w-24 text-center border border-blue-300 rounded-lg py-1.5 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-base font-black text-slate-800">
                              R$ {typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                            </span>
                            {item.precoAnterior && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-400 line-through">R$ {item.precoAnterior.toFixed(2)}</span>
                                <VariacaoChip anterior={item.precoAnterior} novo={item.price} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {editando ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => salvarPreco(item)} disabled={salvando}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50">
                              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Salvar
                            </button>
                            <button onClick={cancelarEdicao} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {resStatus === 'ok' && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Salvo</span>}
                            {resStatus === 'erro' && <span className="flex items-center gap-1 text-xs font-semibold text-red-500"><AlertTriangle className="w-3.5 h-3.5" />Erro</span>}
                            <button onClick={() => abrirEdicao(item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 text-sm font-semibold transition-colors opacity-0 group-hover:opacity-100">
                              <Edit3 className="w-3.5 h-3.5" />Editar
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

      {/* ── MODAL LOTE ──────────────────────────────────────────────────────── */}
      {showLote && (
        <ModalOverlay onClose={() => { if (!salvandoLote) setShowLote(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '480px', maxWidth: '95vw', maxHeight: '88vh' }}>
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />Atualização em Lote
                <span className="text-sm font-semibold text-slate-400">— {selectedIds.size} anúncio(s)</span>
              </h3>
              {!salvandoLote && <button onClick={() => setShowLote(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5" /></button>}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">Tipo de ajuste</label>
                <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                  {[['fixo','Preço Fixo (R$)'],['percentual','Variação (%)']].map(([v,l]) => (
                    <button key={v} onClick={() => setTipoAjuste(v)}
                      className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${tipoAjuste === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">
                  {tipoAjuste === 'fixo' ? 'Novo preço para todos' : 'Variação percentual'}
                </label>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-blue-400 focus-within:bg-white transition-all">
                  <span className="text-base font-bold text-slate-400">{tipoAjuste === 'fixo' ? 'R$' : '%'}</span>
                  <input type="number" step={tipoAjuste === 'fixo' ? '0.01' : '0.1'} value={valorLote}
                    onChange={e => setValorLote(e.target.value)}
                    placeholder={tipoAjuste === 'fixo' ? 'Ex: 49.90' : 'Ex: -10 ou +5'}
                    className="flex-1 bg-transparent text-base font-bold text-slate-800 outline-none" />
                </div>
                {tipoAjuste === 'percentual' && valorLote && (
                  <p className="text-xs text-slate-400 mt-1.5">
                    Ex: R$ 100,00 → R$ {(100 * (1 + parseFloat(valorLote || 0) / 100)).toFixed(2)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">Preview</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-2">
                  {anuncios.filter(a => selectedIds.has(a.id)).map(a => {
                    const novoP = tipoAjuste === 'fixo'
                      ? parseFloat(valorLote || 0)
                      : parseFloat((a.price * (1 + parseFloat(valorLote || 0) / 100)).toFixed(2));
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600 truncate flex-1">{a.title}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-slate-400 line-through">R$ {a.price.toFixed(2)}</span>
                          {valorLote && novoP > 0 && <><span className="text-slate-300 text-xs">→</span><span className="text-sm font-bold text-blue-700">R$ {novoP.toFixed(2)}</span></>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {logLote.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-2">Resultado</label>
                  <div className="bg-slate-900 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1" style={{ fontFamily: 'monospace' }}>
                    {logLote.map((l, i) => (
                      <div key={i} className={`text-xs flex items-start gap-2 ${l.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span className="flex-shrink-0">{l.status === 'ok' ? '✓' : '✗'}</span>
                        <span className="truncate flex-1">{l.titulo}</span>
                        {l.status === 'ok'
                          ? <span className="flex-shrink-0 text-slate-500">R${l.de.toFixed(2)} → R${l.para.toFixed(2)}</span>
                          : <span className="flex-shrink-0 text-slate-500">{l.msg}</span>}
                      </div>
                    ))}
                    {salvandoLote && <div className="flex items-center gap-2 text-blue-400 text-xs"><Loader2 className="w-3 h-3 animate-spin" />processando...</div>}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              {!salvandoLote && (
                <button onClick={() => setShowLote(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100">
                  {logLote.length > 0 ? 'Fechar' : 'Cancelar'}
                </button>
              )}
              {logLote.length === 0 && (
                <button onClick={salvarLote} disabled={!valorLote || salvandoLote}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400">
                  {salvandoLote ? <><Loader2 className="w-4 h-4 animate-spin" />Processando...</> : <><Zap className="w-4 h-4" />Aplicar</>}
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}