import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag, CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, Image as ImageIcon, Link2, Square, CheckSquare,
  Eye, Sparkles, Upload, HelpCircle, Unlink, LayoutList, FileText, Maximize2, Minimize2, ArrowLeft,
  Settings, Wifi, WifiOff, FileSearch, History, Download, TrendingUp, BarChart2, Calendar,
  Tag, Ruler, Barcode, ShieldCheck, Zap, ChevronDown, ChevronRight, GitCompare, Send,
  Bell, BellDot, TriangleAlert, ShieldAlert, User, Clock3, MessageSquareWarning, Inbox
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

const STATUS_CONFIG = {
  PENDENTE:       { label: 'Pendente',      color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: Clock },
  PENDENTE_ENVIO: { label: 'Fila Envio',    color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    icon: Send },
  REINCIDENTE:    { label: 'Reincidente',   color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200',  icon: AlertTriangle },
  CORRIGIDO:      { label: 'Corrigido',     color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  IGNORADO:       { label: 'Ignorado',      color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200',   icon: EyeOff },
  TODOS:          { label: 'Todos',         color: 'text-slate-600',   bg: 'bg-slate-100',  border: 'border-slate-200',   icon: BarChart2 },
};

const TIPO_AVISO_CONFIG = {
  DIMENSOES_INCORRETAS: { label: 'Dimensões Incorretas', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300', icon: Ruler },
  PESO_INCORRETO:       { label: 'Peso Incorreto',       color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300',    icon: Weight },
  ANUNCIO_PAUSADO:      { label: 'Anúncio Pausado',      color: 'text-slate-700',  bg: 'bg-slate-50',  border: 'border-slate-300',  icon: EyeOff },
  OUTROS:               { label: 'Outros',               color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300',  icon: AlertTriangle },
};

const ACAO_HISTORICO_CONFIG = {
  CORRIGIDO_MANUAL: { label: 'Corrigido Manual', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  CORRIGIDO_API:    { label: 'Corrigido via API', color: 'text-blue-700',    bg: 'bg-blue-50',    dot: 'bg-blue-500' },
  PENDENTE_ENVIO:   { label: 'Adicionado à Fila', color: 'text-blue-600',    bg: 'bg-blue-50',    dot: 'bg-blue-400' },
  IGNORADO:         { label: 'Ignorado',          color: 'text-slate-600',   bg: 'bg-slate-50',   dot: 'bg-slate-400' },
  REABERTO:         { label: 'Reaberto',          color: 'text-amber-700',   bg: 'bg-amber-50',   dot: 'bg-amber-500' },
  ERRO_API:         { label: 'Erro na API',       color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-500' },
};

const FORM_INICIAL = {
  sku: '', nome: '', preco: '', mlItemId: '',
  peso: '', unidadePeso: 'g', alturaCm: '', larguraCm: '', comprimentoCm: '',
  eKit: false, categoria: '', plataforma: 'Mercado Livre',
  ean: '', marca: '', modelo: '', condicao: 'Novo',
};

const INTERVALOS = [
  { label: '30min', value: 30 }, { label: '1h', value: 60 }, { label: '2h', value: 120 },
  { label: '4h', value: 240 }, { label: '6h', value: 360 }, { label: '12h', value: 720 }, { label: '24h', value: 1440 },
];

const CAMPOS_FICHA = [
  { campo: 'peso', nomeBonito: 'Peso (g)', icone: Weight, unidade: 'g' },
  { campo: 'ean', nomeBonito: 'EAN / GTIN', icone: Barcode, unidade: '' },
  { campo: 'marca', nomeBonito: 'Marca', icone: Tag, unidade: '' },
  { campo: 'modelo', nomeBonito: 'Modelo', icone: Package, unidade: '' },
  { campo: 'alturaCm', nomeBonito: 'Altura', icone: Ruler, unidade: 'cm' },
  { campo: 'larguraCm', nomeBonito: 'Largura', icone: Ruler, unidade: 'cm' },
  { campo: 'comprimentoCm', nomeBonito: 'Comprimento', icone: Ruler, unidade: 'cm' },
];

function formatarProxima(dt) {
  if (!dt) return '—';
  const diff = new Date(dt) - Date.now();
  if (diff <= 0) return 'Agora';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `em ${h}h ${m}m` : `em ${m}m`;
}

function formatarDataHora(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
        padding: side === 'center' ? '16px' : '0',
      }}>
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', height: side === 'right' ? '100%' : 'auto' }}>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function QuickViewPopover({ item }) {
  return (
    <div style={{
      position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
      marginRight: '8px', background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '12px', padding: '10px', width: '190px', zIndex: 50,
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)', pointerEvents: 'none',
    }}>
      {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: '100%', height: '72px', objectFit: 'cover', borderRadius: '8px', marginBottom: '6px' }} />}
      <p style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', lineHeight: 1.3, marginBottom: '3px' }}>{(item.titulo || item.nome || '').substring(0, 55)}</p>
      {item.mlItemId && <p style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'monospace' }}>{item.mlItemId}</p>}
      {item.motivo && <p style={{ fontSize: '9px', color: '#ef4444', marginTop: '4px', lineHeight: 1.3 }}>{item.motivo.substring(0, 70)}</p>}
    </div>
  );
}

function downloadTxt(conteudo, filename = 'resumo.txt') {
  const texto = conteudo.replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<li>/gi, '  • ').replace(/<\/ul>/gi, '\n').replace(/<b>/gi, '').replace(/<\/b>/gi, '').replace(/<i>/gi, '').replace(/<\/i>/gi, '').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function downloadLogs(logs) {
  const texto = logs.map(l => l.msg).join('\n');
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `varredura_${new Date().toISOString().slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL HISTÓRICO DE DIVERGÊNCIA
// ══════════════════════════════════════════════════════════════════════════
function ModalHistoricoDivergencia({ div, onClose }) {
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!div) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/divergencias/${div.id}/historico`)
      .then(r => r.json())
      .then(data => { setHistorico(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [div?.id]);

  if (!div) return null;
  return (
    <ModalOverlay onClose={onClose} side="right">
      <div className="bg-white shadow-2xl flex flex-col" style={{ width: '380px', height: '100%' }}>
        <div className="px-4 py-3 border-b flex justify-between items-center bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="font-black uppercase text-xs">Histórico de Alterações</h3>
              <p className="text-[9px] text-slate-400 font-mono truncate max-w-[220px]">{div.titulo || div.mlItemId}</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:text-slate-400 text-slate-300"><XCircle className="w-4 h-4" /></button>
        </div>

        {/* Info do item */}
        <div className="px-4 py-2.5 border-b border-slate-100 shrink-0 flex items-center gap-2.5 bg-slate-50">
          {div.thumbnail
            ? <img src={div.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
            : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-4 h-4 text-slate-300" /></div>}
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 truncate">{div.titulo || div.mlItemId}</p>
            <a href={`https://produto.mercadolivre.com.br/MLB-${(div.mlItemId || '').replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-blue-500 hover:underline flex items-center gap-0.5">
              {div.mlItemId}<ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : historico.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-center">
              <Inbox className="w-8 h-8 text-slate-200" />
              <p className="text-xs font-black text-slate-400 uppercase">Nenhum histórico registrado</p>
              <p className="text-[10px] text-slate-400">As próximas ações ficarão registradas aqui.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Linha vertical da timeline */}
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-100" />
              <div className="space-y-4">
                {historico.map((h, i) => {
                  const cfg = ACAO_HISTORICO_CONFIG[h.acao] || { label: h.acao, color: 'text-slate-600', bg: 'bg-slate-50', dot: 'bg-slate-400' };
                  return (
                    <div key={h.id} className="relative flex gap-3">
                      <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 border-white shadow-sm z-10 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`${cfg.bg} border border-slate-100 rounded-xl p-3`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className={`text-[9px] font-black uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
                            <span className="text-[8px] text-slate-400 font-mono flex-shrink-0">{formatarDataHora(h.createdAt)}</span>
                          </div>
                          <p className="text-[10px] text-slate-700 leading-relaxed">{h.descricao}</p>
                          {h.usuario && (
                            <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-white/60">
                              {h.usuario.avatar
                                ? <img src={h.usuario.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                                : <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-2.5 h-2.5 text-slate-500" /></div>}
                              <span className="text-[9px] text-slate-500 font-semibold">{h.usuario.nome}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL ENVIO EM MASSA
// ══════════════════════════════════════════════════════════════════════════
function ModalEnvioMassa({ userId, divergencias, onClose, onConcluido }) {
  const [rodando, setRodando]     = useState(false);
  const [resultados, setResultados] = useState([]);
  const [iniciado, setIniciado]   = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });

  const pendenteEnvio = divergencias.filter(d => d.status === 'PENDENTE_ENVIO');

  const executar = async () => {
    setRodando(true);
    setIniciado(true);
    setProgresso({ atual: 0, total: pendenteEnvio.length });
    setResultados([]);

    // Envia para a rota de envio em massa
    const res = await fetch(`${API_BASE_URL}/api/divergencias/envio-massa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    setResultados(data.resultados || []);
    setProgresso({ atual: data.total, total: data.total });
    setRodando(false);
    if (onConcluido) onConcluido();
  };

  const sucesso = resultados.filter(r => r.status === 'ok').length;
  const erros   = resultados.filter(r => r.status === 'erro').length;

  return (
    <ModalOverlay onClose={rodando ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '520px', maxWidth: '95vw', maxHeight: '88vh' }}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/20 rounded-lg"><Send className="w-4 h-4 text-white" /></div>
            <div>
              <h3 className="font-black text-white text-xs uppercase tracking-widest">Envio em Massa via API</h3>
              <p className="text-blue-200 text-[9px]">{pendenteEnvio.length} item(s) na fila</p>
            </div>
          </div>
          {!rodando && <button onClick={onClose} className="text-white/60 hover:text-white"><XCircle className="w-5 h-5" /></button>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Lista de itens na fila */}
          {!iniciado && (
            <>
              {pendenteEnvio.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2 text-center">
                  <Inbox className="w-8 h-8 text-slate-200" />
                  <p className="text-sm font-black text-slate-500">Nenhum item na fila</p>
                  <p className="text-xs text-slate-400">Marque divergências como "Enviar via API" para adicioná-las à fila.</p>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black text-blue-800">O sistema irá corrigir automaticamente</p>
                      <p className="text-[10px] text-blue-700 mt-0.5">Será enviado o peso correto e as dimensões do catálogo local para cada anúncio via API do ML. Uma pausa de 0,6s é aplicada entre cada envio para evitar bloqueios.</p>
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                      <p className="text-[9px] font-black text-slate-500 uppercase">Itens que serão corrigidos</p>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {pendenteEnvio.map(div => (
                        <div key={div.id} className="flex items-center gap-2.5 px-3 py-2">
                          {div.thumbnail
                            ? <img src={div.thumbnail} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                            : <div className="w-7 h-7 bg-slate-100 rounded flex items-center justify-center flex-shrink-0"><ImageIcon className="w-3 h-3 text-slate-300" /></div>}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{div.titulo || div.mlItemId}</p>
                            <p className="text-[8px] font-mono text-slate-400">{div.mlItemId}</p>
                          </div>
                          <div className="ml-auto flex-shrink-0 text-[8px] text-slate-500">
                            <span className="bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded font-black">ML:{div.pesoMl}g → {div.pesoLocal}g</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Progresso */}
          {rodando && (
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-blue-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Enviando para o ML...</span>
                <span className="text-[10px] font-black text-white">{progresso.atual}/{progresso.total}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: progresso.total > 0 ? `${(progresso.atual / progresso.total) * 100}%` : '0%' }} />
              </div>
            </div>
          )}

          {/* Resultados */}
          {iniciado && !rodando && resultados.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600">{sucesso}</p>
                  <p className="text-[9px] text-emerald-700 font-black uppercase">Corrigidos</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-red-600">{erros}</p>
                  <p className="text-[9px] text-red-700 font-black uppercase">Erros</p>
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-[9px] font-black text-slate-500 uppercase">Resultado por item</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto" style={{ fontFamily: 'monospace' }}>
                  {resultados.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      {r.status === 'ok'
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                      <span className="text-[9px] text-slate-600 flex-1 truncate">{r.titulo || r.mlItemId}</span>
                      {r.status === 'ok'
                        ? <span className="text-[8px] text-emerald-600 font-bold">{r.pesoEnviado}g</span>
                        : <span className="text-[8px] text-red-500 truncate max-w-[120px]">{r.msg}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          {!rodando && <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all">{iniciado ? 'Fechar' : 'Cancelar'}</button>}
          {!iniciado && pendenteEnvio.length > 0 && (
            <button onClick={executar} className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700 transition-all">
              <Zap className="w-3.5 h-3.5" />Enviar {pendenteEnvio.length} item(s)
            </button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAINEL DE AVISOS ML
// ══════════════════════════════════════════════════════════════════════════
function PainelAvisosML({ userId, mlConectado, onClose }) {
  const [avisos, setAvisos]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [filtro, setFiltro]           = useState('nao_resolvidos');

  const buscar = async () => {
    setLoading(true);
    try {
      const resolvido = filtro === 'resolvidos' ? 'true' : 'false';
      const data = await fetch(`${API_BASE_URL}/api/ml/avisos?userId=${userId}&resolvido=${resolvido}`).then(r => r.json());
      setAvisos(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  };

  const sincronizar = async () => {
    if (!mlConectado) return;
    setSincronizando(true);
    try {
      await fetch(`${API_BASE_URL}/api/ml/avisos/sincronizar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      await buscar();
    } catch {} finally { setSincronizando(false); }
  };

  const resolver = async (id) => {
    await fetch(`${API_BASE_URL}/api/ml/avisos/${id}/resolver`, { method: 'PUT' });
    await buscar();
  };

  useEffect(() => { if (userId) buscar(); }, [userId, filtro]);

  return (
    <ModalOverlay onClose={onClose} side="right">
      <div className="bg-white shadow-2xl flex flex-col" style={{ width: '420px', height: '100%' }}>
        {/* Header vermelho chamativo */}
        <div className="px-4 py-3.5 border-b flex justify-between items-center shrink-0" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' }}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/20 rounded-lg animate-pulse">
              <ShieldAlert className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-black text-white text-xs uppercase tracking-widest flex items-center gap-1.5">
                Avisos do Mercado Livre
              </h3>
              <p className="text-red-200 text-[9px]">Anúncios com problemas logísticos detectados</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><XCircle className="w-4 h-4" /></button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
          <div className="flex gap-0.5 bg-white border border-slate-200 p-0.5 rounded-lg">
            {[['nao_resolvidos', 'Ativos'], ['resolvidos', 'Resolvidos']].map(([v, l]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`px-2.5 py-1 rounded text-[9px] font-black uppercase transition-all ${filtro === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          <button onClick={sincronizar} disabled={sincronizando || !mlConectado} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${sincronizando ? 'animate-spin' : ''}`} />
            {sincronizando ? 'Sincronizando...' : 'Sincronizar ML'}
          </button>
        </div>

        {/* Explicação */}
        {filtro === 'nao_resolvidos' && (
          <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 shrink-0">
            <p className="text-[9px] text-red-700 font-semibold leading-relaxed">
              <strong>O que são esses avisos?</strong> O Mercado Livre detecta automaticamente quando o peso ou as dimensões declaradas no anúncio diferem do real, podendo pausar ou desativar o anúncio em cinza. Estes são os itens afetados.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : avisos.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-300" />
              <p className="text-sm font-black text-slate-500">{filtro === 'resolvidos' ? 'Nenhum aviso resolvido' : 'Nenhum aviso ativo'}</p>
              <p className="text-xs text-slate-400">{filtro === 'nao_resolvidos' ? 'Sincronize com o ML para verificar novos avisos.' : ''}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {avisos.map(aviso => {
                const cfg = TIPO_AVISO_CONFIG[aviso.tipoAviso] || TIPO_AVISO_CONFIG.OUTROS;
                const AvisoIcon = cfg.icon;
                return (
                  <div key={aviso.id} className={`border rounded-2xl overflow-hidden ${aviso.resolvido ? 'opacity-60' : ''} ${cfg.border} ${cfg.bg}`}>
                    {/* Barra de severidade */}
                    {!aviso.resolvido && aviso.severidade === 'ALTO' && (
                      <div className="h-1 bg-gradient-to-r from-red-500 to-orange-500 animate-pulse" />
                    )}
                    <div className="p-3">
                      <div className="flex items-start gap-2.5">
                        {aviso.thumbnail
                          ? <img src={aviso.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/60 flex-shrink-0" />
                          : <div className="w-10 h-10 bg-white/60 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-4 h-4 text-slate-400" /></div>}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className={`flex items-center gap-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border bg-white/70 ${cfg.color} ${cfg.border}`}>
                              <AvisoIcon className="w-2.5 h-2.5" />{cfg.label}
                              {!aviso.resolvido && aviso.severidade === 'ALTO' && <span className="ml-0.5 text-red-600">● ALTO</span>}
                            </span>
                            <span className="text-[8px] text-slate-400 font-mono">{formatarDataHora(aviso.createdAt)}</span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 truncate">{aviso.titulo || aviso.mlItemId}</p>
                          <a href={`https://produto.mercadolivre.com.br/MLB-${(aviso.mlItemId || '').replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-mono text-blue-600 hover:underline flex items-center gap-0.5">
                            {aviso.mlItemId}<ExternalLink className="w-2 h-2" />
                          </a>
                          <p className="text-[9px] text-slate-600 mt-1 leading-relaxed line-clamp-2">{aviso.mensagem}</p>
                          {aviso.resolvido && aviso.resolvidoEm && (
                            <p className="text-[8px] text-emerald-600 font-bold mt-1">✓ Resolvido em {formatarDataHora(aviso.resolvidoEm)}</p>
                          )}
                        </div>
                      </div>
                      {!aviso.resolvido && (
                        <div className="flex justify-end mt-2">
                          <button onClick={() => resolver(aviso.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-50 transition-all">
                            <Check className="w-3 h-3" />Marcar Resolvido
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL CONCILIAÇÃO ML vs ERP
// ══════════════════════════════════════════════════════════════════════════
function ModalConciliacao({ dados, userId, onClose, onSucesso }) {
  if (!dados) return null;
  const { itemML, divergencias, produtoLocal } = dados;

  const [selecionados, setSelecionados] = useState(divergencias.reduce((acc, d) => ({ ...acc, [d.campo]: true }), {}));
  const [statusCorrecao, setStatusCorrecao] = useState({});
  const [progresso, setProgresso]           = useState({ ativo: false, total: 0, atual: 0, mensagem: '' });
  const [expandirDetalhes, setExpandirDetalhes] = useState(false);

  const toggleCheck = (campo) => { if (progresso.ativo || statusCorrecao[campo] === 'ok') return; setSelecionados(s => ({ ...s, [campo]: !s[campo] })); };

  const aplicarCorrecao = async () => {
    const camposParaEnviar = divergencias.filter(d => selecionados[d.campo] && statusCorrecao[d.campo] !== 'ok');
    if (camposParaEnviar.length === 0) return;
    setProgresso({ ativo: true, total: camposParaEnviar.length, atual: 0, mensagem: 'Iniciando correções...' });
    const novosStatus = { ...statusCorrecao };
    let processados = 0;
    for (const d of camposParaEnviar) {
      processados++;
      novosStatus[d.campo] = 'enviando';
      setStatusCorrecao({ ...novosStatus });
      setProgresso(prev => ({ ...prev, atual: processados, mensagem: `Enviando ${d.nomeBonito}...` }));
      try {
        const mlItemId = itemML.mlItemId || itemML.id;
        const res = await fetch(`${API_BASE_URL}/api/anuncios/${mlItemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, atributosFicha: { [d.campoML]: d.valorCorretoERP } }) });
        const data = await res.json();
        if (data.error || !data.success) throw new Error(data.error || 'Erro na API');
        novosStatus[d.campo] = 'ok';
      } catch (err) { novosStatus[d.campo] = `erro: ${err.message.substring(0, 60)}`; }
      setStatusCorrecao({ ...novosStatus });
      if (processados < camposParaEnviar.length) { for (let s = 3; s > 0; s--) { setProgresso(prev => ({ ...prev, mensagem: `Pausa anti-bloqueio: ${s}s...` })); await new Promise(r => setTimeout(r, 1000)); } }
    }
    setProgresso(prev => ({ ...prev, ativo: false, mensagem: 'Finalizado!' }));
    if (Object.values(novosStatus).some(s => s === 'ok') && onSucesso) onSucesso();
  };

  const fechar = () => { if (progresso.ativo) return; onClose(); };
  const totalSelecionados = divergencias.filter(d => selecionados[d.campo] && statusCorrecao[d.campo] !== 'ok').length;
  const totalCorrigidos   = Object.values(statusCorrecao).filter(s => s === 'ok').length;
  const pct = progresso.total > 0 ? Math.round((progresso.atual / progresso.total) * 100) : 0;

  return (
    <ModalOverlay onClose={fechar}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '720px', maxWidth: '96vw', maxHeight: '90vh' }}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/20 rounded-lg"><GitCompare className="w-4 h-4 text-white" /></div>
            <div>
              <h3 className="font-black text-white text-xs uppercase tracking-widest">Conciliação ML vs Catálogo</h3>
              <p className="text-blue-200 text-[9px] font-semibold">{divergencias.length} divergência(s) encontrada(s)</p>
            </div>
          </div>
          <button onClick={fechar} disabled={progresso.ativo} className="p-1 hover:bg-white/20 rounded-full text-white/70 hover:text-white disabled:opacity-30"><XCircle className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {(itemML.catalogo || itemML.catalog_listing) && (
            <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div><p className="text-[10px] font-black text-amber-800 uppercase">Produto de Catálogo ML</p><p className="text-[10px] text-amber-700 mt-0.5">Alguns campos podem precisar ser ajustados manualmente no painel do Mercado Livre.</p></div>
            </div>
          )}
          <div className="flex items-start gap-3 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
            {(itemML.thumbnail || itemML.foto)
              ? <img src={itemML.thumbnail || itemML.foto} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
              : <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-5 h-5 text-slate-300" /></div>}
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-sm leading-snug truncate">{itemML.titulo || itemML.title || itemML.nome}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{itemML.mlItemId || itemML.id}</span>
                {produtoLocal && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">SKU: {produtoLocal.sku}</span>}
              </div>
            </div>
          </div>
          {(progresso.ativo || progresso.mensagem === 'Finalizado!') && (
            <div className="mb-4 bg-slate-900 rounded-xl p-3.5">
              <div className="flex justify-between items-center mb-2">
                <span className={`text-[10px] font-black uppercase ${progresso.mensagem.includes('Pausa') ? 'text-amber-400' : progresso.mensagem === 'Finalizado!' ? 'text-emerald-400' : 'text-blue-400'}`}>{progresso.mensagem}</span>
                <span className="text-[10px] font-black text-white">{progresso.atual}/{progresso.total}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : '#3b82f6' }} /></div>
            </div>
          )}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr className="text-[9px] font-black uppercase text-slate-400">
                  <th className="px-3 py-2.5 w-8"></th><th className="px-3 py-2.5">Atributo</th><th className="px-3 py-2.5 text-red-500">No ML</th><th className="px-3 py-2.5 text-emerald-600">No Catálogo</th><th className="px-3 py-2.5 text-right w-32">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {divergencias.map((div, i) => {
                  const st = statusCorrecao[div.campo];
                  const isOk = st === 'ok'; const isEnviando = st === 'enviando'; const isErro = st?.startsWith('erro:');
                  const sel = selecionados[div.campo];
                  const CampoIcon = CAMPOS_FICHA.find(c => c.campo === div.campo)?.icone || Package;
                  return (
                    <tr key={i} className={`transition-colors ${isOk ? 'bg-emerald-50/40' : isErro ? 'bg-red-50/30' : sel ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-3"><button onClick={() => toggleCheck(div.campo)} disabled={progresso.ativo || isOk} className="text-slate-400 disabled:opacity-40">{isOk ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : sel ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}</button></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-1.5"><CampoIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /><span className="text-xs font-bold text-slate-700">{div.nomeBonito}</span></div></td>
                      <td className="px-3 py-3"><span className={`text-xs font-semibold ${isOk ? 'text-slate-300 line-through' : 'text-red-600'}`}>{div.valorML || <span className="italic text-slate-400">Faltando</span>}</span></td>
                      <td className="px-3 py-3"><span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">{div.valorERP}</span></td>
                      <td className="px-3 py-3 text-right">
                        {isEnviando && <span className="flex items-center justify-end gap-1 text-[9px] text-blue-600 font-black uppercase"><Loader2 className="w-3 h-3 animate-spin" />Enviando</span>}
                        {isOk && <span className="flex items-center justify-end gap-1 text-[9px] text-emerald-600 font-black uppercase"><Check className="w-3 h-3" />Corrigido</span>}
                        {isErro && <span className="text-[8px] text-red-500 font-bold leading-tight text-right block max-w-[120px] ml-auto">{st.replace('erro: ', '')}</span>}
                        {!st && <span className="text-[9px] text-slate-400">Aguardando</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalCorrigidos > 0 && <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /><p className="text-xs font-black text-emerald-700">{totalCorrigidos} campo(s) corrigido(s) com sucesso na API do ML.</p></div>}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 flex justify-between items-center shrink-0">
          <button onClick={fechar} disabled={progresso.ativo} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40">{totalCorrigidos > 0 ? 'Fechar e Recarregar' : 'Cancelar'}</button>
          <button onClick={aplicarCorrecao} disabled={progresso.ativo || totalSelecionados === 0} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all">
            {progresso.ativo ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processando...</> : <><Send className="w-3.5 h-3.5" />Corrigir {totalSelecionados > 0 ? `${totalSelecionados} campo(s)` : ''}</>}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// FUNÇÃO: Calcular divergências de ficha técnica
// ══════════════════════════════════════════════════════════════════════════
function calcularDivergenciasFicha(produtoLocal, itemML) {
  const divs = [];
  if (!produtoLocal || !itemML) return divs;
  const pesoLocal = produtoLocal.pesoGramas || 0; const pesoMl = itemML.peso || 0;
  if (pesoLocal > 0 && pesoMl > 0 && Math.abs(pesoLocal - pesoMl) > 50) divs.push({ campo: 'peso', campoML: 'peso', nomeBonito: 'Peso', valorML: `${pesoMl}g`, valorERP: `${pesoLocal}g`, valorCorretoERP: pesoLocal });
  const eanLocal = (produtoLocal.ean || '').trim(); const eanMl = (itemML.ean || '').trim();
  if (eanLocal && eanMl && eanLocal !== eanMl) divs.push({ campo: 'ean', campoML: 'ean', nomeBonito: 'EAN / GTIN', valorML: eanMl, valorERP: eanLocal, valorCorretoERP: eanLocal });
  else if (eanLocal && !eanMl) divs.push({ campo: 'ean', campoML: 'ean', nomeBonito: 'EAN / GTIN', valorML: null, valorERP: eanLocal, valorCorretoERP: eanLocal });
  const marcaLocal = (produtoLocal.marca || '').trim().toUpperCase(); const marcaMl = (itemML.marca || '').trim().toUpperCase();
  if (marcaLocal && marcaMl && marcaLocal !== marcaMl) divs.push({ campo: 'marca', campoML: 'marca', nomeBonito: 'Marca', valorML: itemML.marca, valorERP: produtoLocal.marca, valorCorretoERP: produtoLocal.marca });
  else if (marcaLocal && !marcaMl) divs.push({ campo: 'marca', campoML: 'marca', nomeBonito: 'Marca', valorML: null, valorERP: produtoLocal.marca, valorCorretoERP: produtoLocal.marca });
  const modeloLocal = (produtoLocal.modelo || '').trim().toUpperCase(); const modeloMl = (itemML.modelo || '').trim().toUpperCase();
  if (modeloLocal && modeloMl && modeloLocal !== modeloMl) divs.push({ campo: 'modelo', campoML: 'modelo', nomeBonito: 'Modelo', valorML: itemML.modelo, valorERP: produtoLocal.modelo, valorCorretoERP: produtoLocal.modelo });
  else if (modeloLocal && !modeloMl) divs.push({ campo: 'modelo', campoML: 'modelo', nomeBonito: 'Modelo', valorML: null, valorERP: produtoLocal.modelo, valorCorretoERP: produtoLocal.modelo });
  const altLocal = parseFloat(produtoLocal.alturaCm) || 0; const altMl = parseFloat(itemML.dimensoes?.altura) || 0;
  if (altLocal > 0 && altMl > 0 && Math.abs(altLocal - altMl) > 0.5) divs.push({ campo: 'alturaCm', campoML: 'altura', nomeBonito: 'Altura', valorML: `${altMl}cm`, valorERP: `${altLocal}cm`, valorCorretoERP: altLocal });
  else if (altLocal > 0 && !altMl) divs.push({ campo: 'alturaCm', campoML: 'altura', nomeBonito: 'Altura', valorML: null, valorERP: `${altLocal}cm`, valorCorretoERP: altLocal });
  const largLocal = parseFloat(produtoLocal.larguraCm) || 0; const largMl = parseFloat(itemML.dimensoes?.largura) || 0;
  if (largLocal > 0 && largMl > 0 && Math.abs(largLocal - largMl) > 0.5) divs.push({ campo: 'larguraCm', campoML: 'largura', nomeBonito: 'Largura', valorML: `${largMl}cm`, valorERP: `${largLocal}cm`, valorCorretoERP: largLocal });
  else if (largLocal > 0 && !largMl) divs.push({ campo: 'larguraCm', campoML: 'largura', nomeBonito: 'Largura', valorML: null, valorERP: `${largLocal}cm`, valorCorretoERP: largLocal });
  const compLocal = parseFloat(produtoLocal.comprimentoCm) || 0; const compMl = parseFloat(itemML.dimensoes?.comprimento) || 0;
  if (compLocal > 0 && compMl > 0 && Math.abs(compLocal - compMl) > 0.5) divs.push({ campo: 'comprimentoCm', campoML: 'comprimento', nomeBonito: 'Comprimento', valorML: `${compMl}cm`, valorERP: `${compLocal}cm`, valorCorretoERP: compLocal });
  else if (compLocal > 0 && !compMl) divs.push({ campo: 'comprimentoCm', campoML: 'comprimento', nomeBonito: 'Comprimento', valorML: null, valorERP: `${compLocal}cm`, valorCorretoERP: compLocal });
  return divs;
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function MercadoLivre() {
  const { userId, userRole } = useOutletContext() || {};
  const navigate = useNavigate();
  const { confirm, alert } = useModal();

  const [activeTab, setActiveTab]               = useState('bot');
  const [mlConectado, setMlConectado]           = useState(false);
  const [mlNickname, setMlNickname]             = useState('');
  const [isBotRunning, setIsBotRunning]         = useState(false);
  const [progress, setProgress]                 = useState(0);
  const [currentStep, setCurrentStep]           = useState('');
  const [logs, setLogs]                         = useState([{ msg: `[${new Date().toLocaleTimeString('pt-BR')}] IA_Analyiz Módulo Analítico Carregado. Aguardando comandos.`, type: 'info' }]);
  const [aiInsight, setAiInsight]               = useState('');
  const [botStats, setBotStats]                 = useState(null);

  const [showConfig, setShowConfig]             = useState(false);
  const [showDicas, setShowDicas]               = useState(false);
  const [showResumoModal, setShowResumoModal]   = useState(false);
  const [showAvisosML, setShowAvisosML]         = useState(false);
  const [resumoIA, setResumoIA]                 = useState('');
  const [historicoResumos, setHistoricoResumos] = useState([]);
  const [loadingResumo, setLoadingResumo]       = useState(false);
  const [loadingDiv, setLoadingDiv]             = useState(false);
  const [countAvisosML, setCountAvisosML]       = useState(0);

  const [quickViewItem, setQuickViewItem]       = useState(null);
  const [fullModalItem, setFullModalItem]       = useState(null);
  const [fullItemData, setFullItemData]         = useState(null);
  const [loadingFullData, setLoadingFullData]   = useState(false);

  // Modal histórico de divergência
  const [modalHistoricoDiv, setModalHistoricoDiv] = useState(null);
  // Modal envio em massa
  const [showEnvioMassa, setShowEnvioMassa]       = useState(false);

  const [divergencias, setDivergencias]         = useState([]);
  const [divStats, setDivStats]                 = useState({ pendente: 0, reincidente: 0, corrigido: 0, ignorado: 0, pendenteEnvio: 0, total: 0 });
  const [filtroStatus, setFiltroStatus]         = useState('PENDENTE');
  const [buscaDiv, setBuscaDiv]                 = useState('');
  const [selectedDivs, setSelectedDivs]         = useState(new Set());

  const [scannerFullscreen, setScannerFullscreen] = useState(false);
  const [divFullscreen, setDivFullscreen]         = useState(false);

  const [produtos, setProdutos]                 = useState([]);
  const [categorias, setCategorias]             = useState([]);
  const [formProd, setFormProd]                 = useState(FORM_INICIAL);
  const [editandoId, setEditandoId]             = useState(null);
  const [loadingProd, setLoadingProd]           = useState(false);
  const [searchProd, setSearchProd]             = useState('');
  const [selectedProds, setSelectedProds]       = useState(new Set());
  const [tipoCatalogo, setTipoCatalogo]         = useState('BASE');
  const [showFichaTecnica, setShowFichaTecnica] = useState(false);

  const [naoVinculados, setNaoVinculados]       = useState([]);
  const [selectedNaoVinc, setSelectedNaoVinc]   = useState(new Set());
  const [buscaNaoVinc, setBuscaNaoVinc]         = useState('');

  const [vincularAnuncio, setVincularAnuncio]   = useState(null);
  const [composicaoKit, setComposicaoKit]       = useState([]);
  const [buscaBase, setBuscaBase]               = useState('');
  const [pesoManual, setPesoManual]             = useState('');
  const [unidadeManual, setUnidadeManual]       = useState('g');

  const [agendador, setAgendador]               = useState(null);
  const [intervalo, setIntervalo]               = useState(360);
  const [savingAgendador, setSavingAgendador]   = useState(false);
  const [modoLento, setModoLento]               = useState(false);

  const [modalConciliacao, setModalConciliacao]             = useState(null);
  const [dadosMLCache, setDadosMLCache]                     = useState({});
  const [auditandoFicha, setAuditandoFicha]                 = useState(false);
  const [resultadoAuditoriaFicha, setResultadoAuditoriaFicha] = useState(null);

  const terminalRef = useRef(null);
  useEffect(() => { if (terminalRef.current) setTimeout(() => { terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, 50); }, [logs]);

  useEffect(() => {
    if (!userId) return;
    verificarStatusML(); buscarDivergencias(); buscarDivStats();
    buscarProdutos(); buscarNaoVinculados(); buscarCategorias(); buscarInsightIA(); buscarCountAvisosML();
    const t = setInterval(() => setAgendador(a => a ? { ...a } : a), 30000);
    return () => clearInterval(t);
  }, [userId]);

  useEffect(() => { if (userId) buscarDivergencias(); }, [filtroStatus, userId]);

  const apiGet = useCallback(async (path) => { const res = await fetch(`${API_BASE_URL}${path}`); return res.json(); }, []);

  const toggleSelectAll = (items, selected, setSelected, key = 'id') => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i[key])));
  };

  const verificarStatusML = async () => {
    try {
      const data = await apiGet(`/api/ml/status?userId=${userId}`);
      setMlConectado(data.connected && !data.expired); setMlNickname(data.nickname);
      const conf = await apiGet(`/api/agendador?userId=${userId}`);
      setAgendador(conf); setIntervalo(conf?.intervalo || 360);
    } catch {}
  };

  const buscarCountAvisosML = async () => {
    try { const data = await apiGet(`/api/ml/avisos/count?userId=${userId}`); setCountAvisosML(data.count || 0); } catch {}
  };

  const conectarML = async () => {
    try { const data = await apiGet(`/api/ml/auth-url?userId=${userId}`); if (data.url) window.location.href = data.url; }
    catch { alert({ title: 'Erro', message: 'Falha ao buscar URL.' }); }
  };

  const desconectarML = async () => {
    if (!await confirm({ title: 'Desconectar ML', message: 'Deseja desconectar?', confirmLabel: 'Desconectar', danger: true })) return;
    await fetch(`${API_BASE_URL}/api/ml/disconnect?userId=${userId}`, { method: 'DELETE' });
    verificarStatusML(); setShowConfig(false);
  };

  const salvarAgendador = async (novoAtivo, novoIntervalo) => {
    setSavingAgendador(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agendador`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, ativo: novoAtivo, intervalo: novoIntervalo }) });
      const data = await res.json(); setAgendador(data); setIntervalo(data.intervalo);
    } catch {} finally { setSavingAgendador(false); }
  };

  const buscarInsightIA = async () => {
    try { const data = await apiGet(`/api/ia/proactive?userId=${userId}&userRole=${userRole}&pageKey=divergencias`); if (data.insight) setAiInsight(data.insight); } catch {}
  };

  const gerarResumoLogistico = async () => {
    setLoadingResumo(true);
    try {
      const dadosStr = `Total: ${divStats.total} divergências. Pendentes: ${divStats.pendente}. Reincidentes: ${divStats.reincidente}. Corrigidas: ${divStats.corrigido}. Ignoradas: ${divStats.ignorado}. Fila envio: ${divStats.pendenteEnvio}. Não vinculados: ${naoVinculados.length}. Produtos: ${produtos.length}. Avisos ML: ${countAvisosML}.`;
      const res = await fetch(`${API_BASE_URL}/api/ia/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, dados: dadosStr }) });
      const data = await res.json(); setResumoIA(data.conteudo); buscarHistoricoResumos();
    } catch { setResumoIA('<b>Diagnóstico Geral</b><br>Erro. Tente novamente.'); }
    finally { setLoadingResumo(false); }
  };

  const buscarHistoricoResumos = async () => { try { setHistoricoResumos(await apiGet(`/api/ia/summary/history?userId=${userId}`)); } catch {} };

  const abrirFullModal = async (item) => {
    setQuickViewItem(null); setFullModalItem(item); setFullItemData(null);
    if (!item.mlItemId) return;
    setLoadingFullData(true);
    try { setFullItemData(await apiGet(`/api/ml/item-details/${item.mlItemId}?userId=${userId}`)); }
    catch { alert({ title: 'Erro', message: 'Falha ao conectar com ML.' }); }
    finally { setLoadingFullData(false); }
  };

  const buscarDivergencias = async () => {
    setLoadingDiv(true);
    try {
      const statusParam = filtroStatus === 'TODOS' ? '' : `&status=${filtroStatus}`;
      setDivergencias(await apiGet(`/api/divergencias?plataforma=Mercado%20Livre&userId=${userId}${statusParam}`) || []);
    } catch {} finally { setLoadingDiv(false); }
  };

  const buscarDivStats = async () => { try { setDivStats(await apiGet(`/api/divergencias/stats?userId=${userId}`)); } catch {} };

  // ── AÇÃO CORRIGIDO: pergunta se foi manual ou vai enviar via API ───────────
  const acaoDivCorrigido = async (id, nomeAnuncio) => {
    const res = await confirm({
      title: '✅ Confirmar Correção',
      message: `"${(nomeAnuncio || '').substring(0, 50)}" — Como você corrigiu?\n\nEscolha a opção abaixo:`,
      confirmLabel: 'Corrigi no ML manualmente',
      cancelLabel: 'Enviar via API daqui',
      danger: false,
    });

    if (res === true) {
      // Usuário confirmou que corrigiu manualmente no ML
      await fetch(`${API_BASE_URL}/api/divergencias/${id}/corrigido-manual`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
      });
      await buscarDivergencias(); await buscarDivStats();
    } else if (res === false) {
      // Usuário quer enviar via API — adiciona à fila PENDENTE_ENVIO
      await fetch(`${API_BASE_URL}/api/divergencias/${id}/pendente-envio`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
      });
      await buscarDivergencias(); await buscarDivStats();
    }
    // res === null = cancelou o modal
  };

  const acaoDiv = async (id, tipo) => {
    try {
      await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
      });
      await buscarDivergencias(); await buscarDivStats();
    } catch {}
  };

  // Lote com mesma lógica de corrigido
  const acaoLoteDivs = async (tipo) => {
    if (selectedDivs.size === 0) return;
    if (tipo === 'excluir' && !await confirm({ title: 'Excluir', message: `Remover ${selectedDivs.size} registro(s)?`, confirmLabel: 'Excluir', danger: true })) return;

    if (tipo === 'corrigido') {
      const resposta = await confirm({
        title: `✅ Confirmar Correção em Lote (${selectedDivs.size})`,
        message: 'Como você corrigiu esses itens?',
        confirmLabel: 'Corrigi no ML manualmente',
        cancelLabel: 'Enviar via API daqui',
        danger: false,
      });
      if (resposta === null) return;
      const endpoint = resposta ? 'corrigido-manual' : 'pendente-envio';
      for (const id of selectedDivs) {
        await fetch(`${API_BASE_URL}/api/divergencias/${id}/${endpoint}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      }
    } else {
      for (const id of selectedDivs) {
        if (tipo === 'excluir') await fetch(`${API_BASE_URL}/api/divergencias/${id}`, { method: 'DELETE' });
        else await fetch(`${API_BASE_URL}/api/divergencias/${id}/${tipo}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      }
    }
    setSelectedDivs(new Set()); await buscarDivergencias(); await buscarDivStats();
  };

  const buscarNaoVinculados = async () => { try { setNaoVinculados(await apiGet(`/api/produtos?plataforma=ML_PENDENTE&userId=${userId}`) || []); } catch {} };

  const acaoNaoVinculadoBasica = async (id, acao) => {
    if (acao === 'ignorado') await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plataforma: 'ML_IGNORADO' }) });
    await buscarNaoVinculados(); await buscarProdutos();
  };

  const acaoLoteNaoVinculados = async (acaoStr) => {
    if (selectedNaoVinc.size === 0) return;
    if (acaoStr === 'excluir' && !await confirm({ title: 'Excluir', message: `Excluir ${selectedNaoVinc.size} item(ns)?`, confirmLabel: 'Excluir', danger: true })) return;
    for (const id of selectedNaoVinc) {
      if (acaoStr === 'excluir') await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
      else await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plataforma: 'ML_IGNORADO' }) });
    }
    setSelectedNaoVinc(new Set()); await buscarNaoVinculados(); await buscarProdutos();
  };

  const buscarProdutos = async () => { try { setProdutos(await apiGet(`/api/produtos?userId=${userId}`) || []); } catch {} };
  const buscarCategorias = async () => { try { setCategorias(await apiGet(`/api/produtos/categorias?userId=${userId}`)); } catch {} };

  const handleSubmitProduto = async (e) => {
    e.preventDefault(); setLoadingProd(true);
    let pesoConvertido = parseFloat(formProd.peso) || 0;
    if (formProd.unidadePeso === 'kg') pesoConvertido *= 1000;
    try {
      const url = editandoId ? `${API_BASE_URL}/api/produtos/${editandoId}` : `${API_BASE_URL}/api/produtos`;
      await fetch(url, { method: editandoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formProd, pesoGramas: pesoConvertido, userId, plataforma: formProd.mlItemId ? 'Mercado Livre' : 'BASE', ean: formProd.ean || null, marca: formProd.marca || null, modelo: formProd.modelo || null, condicao: formProd.condicao || 'Novo' }) });
      setFormProd(FORM_INICIAL); setEditandoId(null); setShowFichaTecnica(false); await buscarProdutos();
    } catch {} finally { setLoadingProd(false); }
  };

  const excluirProduto = async (id) => {
    if (!await confirm({ title: 'Excluir', message: 'Remover este produto?', confirmLabel: 'Excluir', danger: true })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' }); await buscarProdutos(); } catch {}
  };

  const desvincularProduto = async (id) => {
    if (!await confirm({ title: 'Desvincular', message: 'Voltará para Não Vinculados?', confirmLabel: 'Desvincular' })) return;
    try { await fetch(`${API_BASE_URL}/api/produtos/${id}/desvincular`, { method: 'PUT' }); await buscarProdutos(); await buscarNaoVinculados(); } catch {}
  };

  const excluirLoteProdutos = async () => {
    if (selectedProds.size === 0) return;
    if (!await confirm({ title: 'Excluir', message: `Excluir ${selectedProds.size} produto(s)?`, confirmLabel: 'Excluir', danger: true })) return;
    for (const id of selectedProds) await fetch(`${API_BASE_URL}/api/produtos/${id}`, { method: 'DELETE' });
    setSelectedProds(new Set()); await buscarProdutos();
  };

  const abrirModalVincular = (prod) => { setVincularAnuncio(prod); setComposicaoKit([]); setBuscaBase(''); setPesoManual(''); setUnidadeManual('g'); };

  const salvarVinculacao = async () => {
    let pManualConvertido = parseFloat(pesoManual) || 0;
    if (unidadeManual === 'kg') pManualConvertido *= 1000;
    try {
      await fetch(`${API_BASE_URL}/api/produtos/${vincularAnuncio.id}/vincular`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ composicao: composicaoKit.map(c => ({ produtoId: c.produto.id, quantidade: c.quantidade })), pesoManual: pManualConvertido }) });
      setVincularAnuncio(null); await buscarNaoVinculados(); await buscarProdutos();
    } catch {}
  };

  const auditarFichaTecnica = async () => {
    if (!mlConectado) { alert({ title: 'ML Desconectado', message: 'Conecte o Mercado Livre nas Configurações para auditar a ficha técnica.' }); return; }
    const produtosVinculadosComFicha = produtos.filter(p => p.mlItemId && p.plataforma !== 'ML_PENDENTE' && p.plataforma !== 'ML_IGNORADO' && (p.ean || p.marca || p.modelo || p.alturaCm || p.larguraCm || p.comprimentoCm));
    if (produtosVinculadosComFicha.length === 0) { alert({ title: 'Nenhum produto com ficha técnica', message: 'Cadastre EAN, marca, modelo ou dimensões nos produtos vinculados para auditar a ficha técnica.' }); return; }
    setAuditandoFicha(true); setResultadoAuditoriaFicha(null);
    const resultados = [];
    for (const prod of produtosVinculadosComFicha) {
      try {
        let mlData = dadosMLCache[prod.mlItemId];
        if (!mlData) { const res = await fetch(`${API_BASE_URL}/api/anuncios?userId=${userId}`); const anuncios = await res.json(); if (Array.isArray(anuncios)) { const cache = {}; anuncios.forEach(a => { cache[a.id] = a; }); setDadosMLCache(prev => ({ ...prev, ...cache })); mlData = cache[prod.mlItemId]; } }
        if (!mlData) continue;
        const divs = calcularDivergenciasFicha(prod, mlData);
        if (divs.length > 0) resultados.push({ prod, mlData, divs });
      } catch {}
    }
    setResultadoAuditoriaFicha(resultados); setAuditandoFicha(false);
    if (resultados.length === 0) alert({ title: 'Ficha técnica OK!', message: 'Nenhuma divergência encontrada nos campos de ficha técnica dos produtos vinculados.' });
  };

  const abrirConciliacao = (prod, mlData, divs) => {
    setModalConciliacao({ itemML: { ...mlData, mlItemId: mlData.id, titulo: mlData.titulo || mlData.title }, divergencias: divs, produtoLocal: prod });
  };

  const iniciarBot = () => {
    if (!userId) return;
    setIsBotRunning(true); setProgress(0); setBotStats(null); setCurrentStep('');
    setLogs([{ msg: `[${new Date().toLocaleTimeString('pt-BR')}] Acordando IA Analyiz e conectando aos servidores...`, type: 'info' }]);
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream?userId=${userId}&modoLento=${modoLento}`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.msg) setLogs(p => [...p, { msg: data.msg, type: data.type }]);
        if (data.percent !== undefined) setProgress(data.percent);
        if (data.step) setCurrentStep(data.step);
        if (data.type === 'done') {
          setIsBotRunning(false); if (data.stats) setBotStats(data.stats);
          eventSource.close(); buscarDivergencias(); buscarDivStats(); buscarNaoVinculados(); buscarInsightIA(); buscarCountAvisosML();
        }
      } catch (_) {}
    };
    eventSource.onerror = () => { setIsBotRunning(false); eventSource.close(); };
  };

  const divsFiltradas = divergencias.filter(d => !buscaDiv || (d.titulo || '').toLowerCase().includes(buscaDiv.toLowerCase()) || (d.mlItemId || '').toLowerCase().includes(buscaDiv.toLowerCase()));
  const nVincFiltrados = naoVinculados.filter(p => !buscaNaoVinc || p.nome.toLowerCase().includes(buscaNaoVinc.toLowerCase()) || (p.mlItemId || '').toLowerCase().includes(buscaNaoVinc.toLowerCase()));
  const produtosFiltrados = produtos.filter(p => {
    const matchTipo = tipoCatalogo === 'BASE' ? !p.mlItemId : !!p.mlItemId;
    const matchBusca = !searchProd || p.nome.toLowerCase().includes(searchProd.toLowerCase()) || p.sku.toLowerCase().includes(searchProd.toLowerCase()) || (p.mlItemId || '').toLowerCase().includes(searchProd.toLowerCase());
    return matchTipo && matchBusca && p.plataforma !== 'ML_PENDENTE' && p.plataforma !== 'ML_IGNORADO';
  });
  const produtosBaseParaBusca = produtos.filter(p => !p.mlItemId && p.plataforma !== 'ML_PENDENTE' && (!buscaBase || p.nome.toLowerCase().includes(buscaBase.toLowerCase()))).slice(0, 5);

  const taxaCorrecao = divStats.total > 0 ? Math.round((divStats.corrigido / divStats.total) * 100) : 0;
  const produtosVinculados = produtos.filter(p => p.mlItemId && p.plataforma !== 'ML_PENDENTE' && p.plataforma !== 'ML_IGNORADO').length;
  const produtosComFicha   = produtos.filter(p => p.ean || p.marca || p.modelo).length;

  const statsItems = [
    { label: 'Pendentes',  value: divStats.pendente + divStats.reincidente, sub: `${divStats.reincidente} reinc.`, color: 'text-amber-600', dot: 'bg-amber-400' },
    { label: 'Fila API',   value: divStats.pendenteEnvio || 0, sub: 'para enviar', color: 'text-blue-600', dot: 'bg-blue-400' },
    { label: 'Correção',   value: `${taxaCorrecao}%`, sub: `${divStats.corrigido} corrig.`, color: 'text-emerald-600', dot: 'bg-emerald-400' },
    { label: 'Anúncios',   value: produtosVinculados, sub: `${naoVinculados.length} pend.`, color: 'text-slate-600', dot: 'bg-slate-400' },
    { label: 'Avisos ML',  value: countAvisosML, sub: 'ativos', color: countAvisosML > 0 ? 'text-red-600' : 'text-slate-400', dot: countAvisosML > 0 ? 'bg-red-400 animate-pulse' : 'bg-slate-300' },
  ];

  // Tabs: adiciona PENDENTE_ENVIO como filtro
  const FILTROS_STATUS = ['PENDENTE', 'PENDENTE_ENVIO', 'REINCIDENTE', 'CORRIGIDO', 'IGNORADO', 'TODOS'];

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col animate-in fade-in duration-300" style={{ minHeight: '100vh' }}>

      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-2 shrink-0 gap-1.5">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/ml')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><ArrowLeft className="w-4 h-4" /></button>
          <h2 className="text-base font-black tracking-tight text-slate-800">Gestão ML</h2>
          {aiInsight && <span className="hidden md:block text-xs text-slate-500 max-w-xs truncate pl-2 border-l border-slate-200" dangerouslySetInnerHTML={{ __html: aiInsight }} />}
        </div>
        <div className="flex items-center flex-wrap gap-1 justify-end">
          {/* BOTÃO AVISOS ML — chamativo quando há avisos */}
          <button
            onClick={() => setShowAvisosML(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase transition-all relative ${
              countAvisosML > 0
                ? 'bg-red-600 text-white border-red-700 hover:bg-red-700 shadow-lg shadow-red-200 animate-pulse'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {countAvisosML > 0 ? <ShieldAlert className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
            Avisos ML
            {countAvisosML > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white text-red-600 rounded-full text-[8px] font-black flex items-center justify-center border border-red-200">{countAvisosML}</span>}
          </button>

          {/* Botão Envio em Massa */}
          {divStats.pendenteEnvio > 0 && (
            <button onClick={() => setShowEnvioMassa(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg border border-blue-700 text-[10px] font-black uppercase hover:bg-blue-700 transition-all shadow-sm">
              <Send className="w-3.5 h-3.5" />Enviar {divStats.pendenteEnvio} via API
            </button>
          )}

          <nav className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-slate-200">
            {[['bot', 'Scanner ML'], ['pendentes', `Não Vinc.(${naoVinculados.length})`], ['produtos', 'Catálogo'], ['ficha', 'Ficha Técnica']].map(([k, l]) => (
              <button key={k} onClick={() => setActiveTab(k)} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === k ? 'bg-slate-900 text-[#FFE600]' : 'text-slate-500 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </nav>
          <button onClick={() => { buscarHistoricoResumos(); setShowResumoModal(true); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 text-[10px] font-black uppercase hover:bg-indigo-100"><FileSearch className="w-3.5 h-3.5" />Resumir</button>
          <button onClick={() => setShowDicas(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><HelpCircle className="w-4 h-4" /></button>
          <button onClick={() => setShowConfig(true)} className="p-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100"><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      {/* BANNER AVISOS ML — aparece quando há avisos ativos */}
      {countAvisosML > 0 && (
        <div className="mb-2 shrink-0 bg-red-600 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/20 rounded-lg flex-shrink-0"><ShieldAlert className="w-4 h-4 text-white" /></div>
            <div>
              <p className="text-white font-black text-xs uppercase tracking-widest">
                ⚠️ {countAvisosML} anúncio(s) com aviso do Mercado Livre
              </p>
              <p className="text-red-200 text-[9px] font-semibold">
                O ML detectou divergências de peso ou dimensões e pode ter pausado esses anúncios. Corrija para reativá-los.
              </p>
            </div>
          </div>
          <button onClick={() => setShowAvisosML(true)} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-700 rounded-lg text-[10px] font-black uppercase hover:bg-red-50 transition-all">
            Ver Avisos <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* STATS BAR */}
      <div className="flex items-center gap-0 bg-white border border-slate-200 rounded-xl mb-2 shrink-0 overflow-hidden">
        {statsItems.map((m, i) => (
          <div key={i} className={`flex items-center gap-2.5 px-4 py-2 flex-1 ${i < statsItems.length - 1 ? 'border-r border-slate-100' : ''}`}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className={`text-sm font-black ${m.color} leading-none`}>{m.value}</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">{m.label}</span>
            </div>
            <span className="text-[9px] text-slate-300 ml-auto shrink-0">{m.sub}</span>
          </div>
        ))}
      </div>

      <div className="flex-1">

        {/* ABA SCANNER */}
        {activeTab === 'bot' && (
          <div className={`grid gap-3 ${scannerFullscreen || divFullscreen ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-5'}`}>

            {/* Painel Scanner */}
            {!divFullscreen && (
              <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden ${scannerFullscreen ? 'xl:col-span-5' : 'xl:col-span-2'}`} style={{ minHeight: '520px' }}>
                <div className="p-3 border-b border-slate-100 space-y-2 shrink-0">
                  <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado} className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${isBotRunning || !mlConectado ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {isBotRunning ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Auditando...</span> : !mlConectado ? '🔒 Conecte o ML nas Configurações' : '🔍 Iniciar Varredura Completa'}
                  </button>
                  <div className="bg-slate-900 rounded-lg p-2.5">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase mb-1.5">
                      <span className="text-slate-400 flex items-center gap-1">{isBotRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-0.5" />}{currentStep || 'Aguardando'} {mlConectado ? <Wifi className="w-2.5 h-2.5 text-emerald-400" /> : <WifiOff className="w-2.5 h-2.5 text-red-400" />}</span>
                      <span className="text-emerald-400 font-black">{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: progress < 30 ? '#3b82f6' : progress < 60 ? '#f59e0b' : progress < 90 ? '#8b5cf6' : '#10b981' }} />
                    </div>
                  </div>
                </div>
                <div ref={terminalRef} className="flex-1 bg-slate-950 m-2 rounded-xl p-2.5 overflow-y-auto flex flex-col gap-0.5" style={{ fontFamily: 'monospace', minHeight: '300px' }}>
                  {logs.map((log, i) => (
                    <div key={i} className={`text-[10px] leading-relaxed ${log.type === 'warn' ? 'text-amber-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'}`}>
                      <span className="text-slate-600 mr-1 select-none">❯</span>{log.msg}
                    </div>
                  ))}
                  {isBotRunning && <div className="flex items-center gap-1.5 text-[10px] text-blue-400 mt-1"><Loader2 className="w-3 h-3 animate-spin" /><span className="animate-pulse">processando...</span></div>}
                  {botStats && !isBotRunning && (
                    <div className="mt-2 border-t border-slate-700 pt-2">
                      <div className="text-[10px] text-emerald-400 font-bold mb-1.5">══ RESULTADO DA VARREDURA ══</div>
                      {[['Total auditados', botStats.totalAnuncios, 'text-slate-300'], ['Sem divergência', botStats.anunciosOk, 'text-emerald-400'], ['Novas divergências', botStats.novasDiv, botStats.novasDiv > 0 ? 'text-amber-400' : 'text-slate-500'], ['Já pendentes', botStats.divExistentes, 'text-slate-400'], ['Reincidentes', botStats.reincidentes, botStats.reincidentes > 0 ? 'text-purple-400' : 'text-slate-500'], ['Resolvidos auto', botStats.resolvidas, 'text-emerald-400'], ['Sem vínculo', botStats.pendentesCriados, 'text-blue-400'], ['Ignorados', botStats.ignorados, 'text-slate-500']].map(([k, v, c], i) => (
                        <div key={i} className="flex justify-between text-[10px] py-0.5 border-b border-slate-800/50 last:border-0">
                          <span className="text-slate-500">{k}</span><span className={`font-black ${c}`}>{v}</span>
                        </div>
                      ))}
                      {botStats.maioresDivergencias?.length > 0 && (<><div className="text-[9px] text-red-400 font-bold mt-1.5 mb-1">── TOP IMPACTO NO FRETE ──</div>{botStats.maioresDivergencias.slice(0, 3).map((d, i) => (<div key={i} className="text-[9px] text-slate-400 py-0.5"><span className="text-red-400 mr-1">{i + 1}.</span>{d.itemId} → <span className="text-amber-400 font-bold">{d.diff}g</span></div>))}</>)}
                      <button onClick={() => downloadLogs(logs)} className="mt-1.5 w-full py-1 rounded bg-slate-800 text-slate-300 text-[9px] font-black uppercase hover:bg-slate-700 flex items-center justify-center gap-1"><Download className="w-2.5 h-2.5" />Baixar Log</button>
                    </div>
                  )}
                </div>
                <div className="px-2 pb-2 shrink-0">
                  <button onClick={() => setScannerFullscreen(v => !v)} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-black uppercase transition-all">
                    {scannerFullscreen ? <><Minimize2 className="w-3.5 h-3.5" />Reduzir</> : <><Maximize2 className="w-3.5 h-3.5" />Tela Cheia</>}
                  </button>
                </div>
              </section>
            )}

            {/* Painel Divergências */}
            {!scannerFullscreen && (
              <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden ${divFullscreen ? 'xl:col-span-5' : 'xl:col-span-3'}`} style={{ minHeight: '520px' }}>
                <div className="p-3 border-b border-slate-100 shrink-0">
                  <div className="flex justify-between items-center mb-2 flex-wrap gap-1">
                    <span className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5"><AlertTriangle className="text-amber-500 w-3.5 h-3.5" />Divergências</span>
                    <div className="flex items-center gap-1">
                      {selectedDivs.size > 0 && (
                        <div className="flex items-center gap-0.5 bg-blue-50 px-1.5 py-0.5 rounded-lg border border-blue-200">
                          <span className="text-[9px] font-black text-blue-700 mr-1">{selectedDivs.size}</span>
                          <button onClick={() => acaoLoteDivs('corrigido')} title="Marcar corrigidos" className="p-0.5 text-emerald-600 hover:bg-white rounded"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => acaoLoteDivs('ignorado')} title="Ignorar selecionados" className="p-0.5 text-slate-500 hover:bg-white rounded"><EyeOff className="w-3.5 h-3.5" /></button>
                          <button onClick={() => acaoLoteDivs('excluir')} title="Excluir selecionados" className="p-0.5 text-red-500 hover:bg-white rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                      {/* Botão Enviar Selecionados via API */}
                      {selectedDivs.size > 0 && (
                        <button
                          onClick={async () => {
                            for (const id of selectedDivs) {
                              await fetch(`${API_BASE_URL}/api/divergencias/${id}/pendente-envio`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
                            }
                            setSelectedDivs(new Set()); await buscarDivergencias(); await buscarDivStats();
                          }}
                          title="Adicionar à fila de envio via API"
                          className="p-0.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 bg-blue-50 px-1.5 py-0.5 flex items-center gap-0.5 text-[9px] font-black"
                        >
                          <Send className="w-3.5 h-3.5" />API
                        </button>
                      )}
                      <button onClick={() => { buscarDivergencias(); buscarDivStats(); }} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200"><RefreshCw className="w-3.5 h-3.5 text-slate-600" /></button>
                      <button onClick={() => setDivFullscreen(v => !v)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500" title={divFullscreen ? 'Reduzir' : 'Tela cheia'}>
                        {divFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Filtros de status — inclui PENDENTE_ENVIO */}
                  <div className="flex gap-0.5 flex-wrap mb-2">
                    {FILTROS_STATUS.map(s => {
                      const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.TODOS;
                      const count = s === 'TODOS' ? divStats.total : s === 'PENDENTE_ENVIO' ? (divStats.pendenteEnvio || 0) : (divStats[s.toLowerCase()] || 0);
                      return (
                        <button key={s} onClick={() => { setFiltroStatus(s); setSelectedDivs(new Set()); }}
                          className={`flex items-center gap-0.5 px-2 py-1 rounded text-[9px] font-black uppercase border transition-all ${filtroStatus === s ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>
                          <cfg.icon className="w-2.5 h-2.5" />
                          {cfg.label} <span className={`text-[8px] px-0.5 rounded ${filtroStatus === s ? 'bg-white/60' : 'bg-slate-100'}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                    <input value={buscaDiv} onChange={e => setBuscaDiv(e.target.value)} placeholder="Filtrar..." className="w-full pl-7 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-xs" />
                  </div>

                  {/* Banner fila de envio */}
                  {filtroStatus === 'PENDENTE_ENVIO' && (divStats.pendenteEnvio || 0) > 0 && (
                    <div className="mt-2 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Send className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <p className="text-[10px] text-blue-700 font-black">{divStats.pendenteEnvio} item(s) prontos para envio via API</p>
                      </div>
                      <button onClick={() => setShowEnvioMassa(true)} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-blue-700">
                        <Zap className="w-3 h-3" />Enviar Tudo
                      </button>
                    </div>
                  )}
                </div>

                <div className="overflow-y-auto" style={{ maxHeight: divFullscreen ? 'calc(100vh - 260px)' : '600px' }}>
                  {loadingDiv ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
                  ) : divsFiltradas.length === 0 ? (
                    <div className="py-12 flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filtroStatus === 'TODOS' ? 'Nenhuma divergência' : `Sem ${STATUS_CONFIG[filtroStatus]?.label?.toLowerCase() || ''}`}</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                        <tr className="text-[9px] font-black uppercase text-slate-400">
                          <th className="px-3 py-2 w-6">
                            <button onClick={() => toggleSelectAll(divsFiltradas, selectedDivs, setSelectedDivs, 'id')} className="text-slate-400">
                              {selectedDivs.size === divsFiltradas.length && divsFiltradas.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            </button>
                          </th>
                          <th className="px-3 py-2">Anúncio</th><th className="px-3 py-2">Divergência</th><th className="px-3 py-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {divsFiltradas.map((div) => {
                          const cfg = STATUS_CONFIG[div.status] || STATUS_CONFIG.PENDENTE;
                          const sel = selectedDivs.has(div.id);
                          const isPendenteEnvio = div.status === 'PENDENTE_ENVIO';
                          return (
                            <tr key={div.id} className={`hover:bg-slate-50/80 transition-colors ${sel ? 'bg-blue-50/30' : ''} ${isPendenteEnvio ? 'bg-blue-50/10' : ''}`}>
                              <td className="px-3 py-2.5"><button onClick={() => { const n = new Set(selectedDivs); sel ? n.delete(div.id) : n.add(div.id); setSelectedDivs(n); }} className="text-slate-400">{sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}</button></td>
                              <td className="py-2.5 px-3">
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} flex items-center gap-0.5 w-fit mb-0.5 border ${cfg.border}`}><cfg.icon className="w-2.5 h-2.5" />{cfg.label}</span>
                                <p className="font-bold text-slate-800 truncate max-w-[150px] text-[11px]">{div.titulo || div.mlItemId}</p>
                                <a href={`https://produto.mercadolivre.com.br/MLB-${(div.mlItemId || '').replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 font-mono flex items-center gap-0.5 hover:text-blue-700 text-[9px]">
                                  {div.mlItemId}<ExternalLink className="w-2 h-2" />
                                </a>
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="text-slate-600 leading-snug max-w-[200px] text-[11px]">{div.motivo}</p>
                                {div.pesoMl > 0 && div.pesoLocal > 0 && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[8px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-bold">ML:{div.pesoMl}g</span>
                                    <span className="text-[8px] text-slate-300">→</span>
                                    <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1 py-0.5 rounded font-bold">Real:{div.pesoLocal}g</span>
                                  </div>
                                )}
                                {div.corrigidoViaApi && <span className="text-[7px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 font-black mt-0.5 inline-block">via API</span>}
                                {div.corrigidoManual && <span className="text-[7px] text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100 font-black mt-0.5 inline-block">manual</span>}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-0.5 relative">
                                  {/* Botão Histórico */}
                                  <button onClick={() => setModalHistoricoDiv(div)} title="Histórico de alterações" className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700">
                                    <History className="w-3.5 h-3.5" />
                                  </button>
                                  <div onMouseEnter={() => setQuickViewItem(div)} onMouseLeave={() => setQuickViewItem(null)}>
                                    <button onClick={() => abrirFullModal(div)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600"><Eye className="w-3.5 h-3.5" /></button>
                                    {quickViewItem?.id === div.id && <QuickViewPopover item={div} />}
                                  </div>
                                  {/* Botão corrigido → pergunta manual ou API */}
                                  {div.status !== 'CORRIGIDO' && (
                                    <button
                                      onClick={() => acaoDivCorrigido(div.id, div.titulo || div.mlItemId)}
                                      title="Marcar como corrigido"
                                      className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {/* Botão enviar via API (manda direto para PENDENTE_ENVIO) */}
                                  {(div.status === 'PENDENTE' || div.status === 'REINCIDENTE') && (
                                    <button
                                      onClick={() => acaoDiv(div.id, 'pendente-envio')}
                                      title="Adicionar à fila de envio via API"
                                      className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {div.status !== 'IGNORADO' && <button onClick={() => acaoDiv(div.id, 'ignorado')} className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><EyeOff className="w-3.5 h-3.5" /></button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ABA NÃO VINCULADOS */}
        {activeTab === 'pendentes' && (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ minHeight: '520px' }}>
            <div className="p-3 border-b border-slate-100 bg-amber-50/30 flex justify-between items-center flex-wrap gap-2">
              <div><h3 className="text-xs font-black text-amber-800 uppercase flex items-center gap-1.5"><Box className="w-4 h-4" />Anúncios Desconhecidos ({nVincFiltrados.length})</h3><p className="text-[10px] text-amber-600">Anúncios do ML sem peso cadastrado</p></div>
              <div className="flex items-center gap-1.5">
                <div className="relative"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-amber-500/50" /><input value={buscaNaoVinc} onChange={e => setBuscaNaoVinc(e.target.value)} placeholder="Pesquisar..." className="pl-7 pr-2 py-2 bg-white border border-amber-200 rounded-lg outline-none text-xs w-36" /></div>
                {selectedNaoVinc.size > 0 && (<div className="flex items-center gap-0.5 bg-white border border-amber-200 rounded-lg px-1.5 py-0.5"><span className="text-[9px] font-black text-amber-700 mr-0.5">{selectedNaoVinc.size}</span><button onClick={() => acaoLoteNaoVinculados('ignorado')} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><EyeOff className="w-3.5 h-3.5" /></button><button onClick={() => acaoLoteNaoVinculados('excluir')} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button></div>)}
                <button onClick={buscarNaoVinculados} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600"><RefreshCw className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              {nVincFiltrados.length === 0 ? <div className="py-16 text-center text-slate-300 font-black uppercase text-xs">Tudo mapeado! 🎉</div> : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100 z-10"><tr className="text-[9px] font-black uppercase text-slate-400"><th className="px-4 py-2.5 w-8"><button onClick={() => toggleSelectAll(nVincFiltrados, selectedNaoVinc, setSelectedNaoVinc, 'id')} className="text-slate-400">{selectedNaoVinc.size === nVincFiltrados.length && nVincFiltrados.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th><th className="px-4 py-2.5">Produto ML</th><th className="px-4 py-2.5 text-right">Ação</th></tr></thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {nVincFiltrados.map(prod => { const sel = selectedNaoVinc.has(prod.id); return (
                      <tr key={prod.id} className={`hover:bg-slate-50/60 ${sel ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3"><button onClick={() => { const n = new Set(selectedNaoVinc); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedNaoVinc(n); }} className="text-slate-400">{sel ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4" />}</button></td>
                        <td className="px-4 py-3 flex items-center gap-2">
                          {prod.thumbnail ? <img src={prod.thumbnail} className="w-9 h-9 object-cover rounded-lg border border-slate-100" alt="" /> : <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-3.5 h-3.5 text-slate-300" /></div>}
                          <div><p className="font-bold text-slate-800 max-w-[300px] truncate">{prod.nome}</p><a href={`https://produto.mercadolivre.com.br/MLB-${(prod.mlItemId || '').replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-blue-500 hover:text-blue-700 flex items-center gap-0.5">{prod.mlItemId}<ExternalLink className="w-2.5 h-2.5" /></a></div>
                        </td>
                        <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1 relative"><div onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}><button onClick={() => abrirFullModal(prod)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"><Eye className="w-3.5 h-3.5" /></button>{quickViewItem?.id === prod.id && <QuickViewPopover item={prod} />}</div><button onClick={() => { abrirModalVincular(prod); setQuickViewItem(null); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-black uppercase"><Link2 className="w-3 h-3" />Vincular</button><button onClick={() => acaoNaoVinculadoBasica(prod.id, 'ignorado')} className="p-1.5 rounded bg-slate-50 text-slate-500 hover:bg-slate-100"><EyeOff className="w-3.5 h-3.5" /></button></div></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ABA CATÁLOGO */}
        {activeTab === 'produtos' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <section className="col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ minHeight: '520px' }}>
              <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="font-black text-xs uppercase flex items-center gap-1.5 text-slate-800"><Plus className="w-3.5 h-3.5 text-blue-600" />{editandoId ? 'Editar' : 'Novo Produto'}</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <form onSubmit={handleSubmitProduto} className="space-y-3 text-xs font-semibold text-slate-600">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="uppercase tracking-widest block mb-1 text-[9px]">SKU</label><input required value={formProd.sku} onChange={e => setFormProd({ ...formProd, sku: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 text-xs" /></div>
                    <div><label className="uppercase tracking-widest block mb-1 text-[9px]">Categoria</label><input value={formProd.categoria} onChange={e => setFormProd({ ...formProd, categoria: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 text-xs" list="cat-list" /><datalist id="cat-list">{categorias.map(c => <option key={c} value={c} />)}</datalist></div>
                  </div>
                  <div><label className="uppercase tracking-widest block mb-1 text-[9px]">Nome</label><input required value={formProd.nome} onChange={e => setFormProd({ ...formProd, nome: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-500 text-xs" /></div>
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-2.5">
                    <p className="text-[9px] font-black text-blue-800 uppercase flex items-center gap-1 mb-1.5"><Weight className="w-3 h-3" />Peso Unitário</p>
                    <div className="flex gap-2">
                      <input required type="number" step="any" min="0" value={formProd.peso} onChange={e => setFormProd({ ...formProd, peso: e.target.value })} className="flex-1 bg-white border border-blue-200 rounded-lg p-2 outline-none focus:border-blue-500 text-sm font-bold" />
                      <select value={formProd.unidadePeso} onChange={e => setFormProd({ ...formProd, unidadePeso: e.target.value })} className="bg-white border border-blue-200 rounded-lg px-2 text-[10px] font-black text-blue-700 outline-none"><option value="g">g</option><option value="kg">kg</option></select>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    <p className="text-[9px] font-black text-slate-600 uppercase flex items-center gap-1 mb-1.5"><Ruler className="w-3 h-3" />Dimensões da Embalagem (cm)</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[['alturaCm','Alt'], ['larguraCm','Larg'], ['comprimentoCm','Comp']].map(([field, label]) => (
                        <div key={field}><label className="text-[8px] text-slate-400 font-black uppercase block mb-0.5">{label}</label><input type="number" step="any" min="0" value={formProd[field]} onChange={e => setFormProd({ ...formProd, [field]: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 outline-none focus:border-blue-500 text-xs font-semibold" placeholder="0" /></div>
                      ))}
                    </div>
                  </div>
                  {/* Ficha Técnica Completa */}
                  <div className="border border-indigo-100 rounded-xl overflow-hidden">
                    <button type="button" onClick={() => setShowFichaTecnica(v => !v)} className="w-full flex items-center justify-between px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">
                      <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest"><Barcode className="w-3 h-3" />Ficha Técnica Completa{(formProd.ean || formProd.marca || formProd.modelo) && <span className="bg-indigo-600 text-white text-[7px] px-1.5 py-0.5 rounded-full font-black">Preenchida</span>}</span>
                      {showFichaTecnica ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    {showFichaTecnica && (
                      <div className="p-2.5 space-y-2 bg-white">
                        <p className="text-[8px] text-slate-400 font-semibold leading-tight">Estes campos são usados na Auditoria de Ficha Técnica para comparar e corrigir automaticamente via API do ML.</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="uppercase tracking-widest block mb-1 text-[8px] text-slate-500 font-black">EAN / GTIN</label><input value={formProd.ean} onChange={e => setFormProd({ ...formProd, ean: e.target.value })} placeholder="Ex: 7891234567890" className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-400 text-xs font-mono" /></div>
                          <div><label className="uppercase tracking-widest block mb-1 text-[8px] text-slate-500 font-black">Condição</label><select value={formProd.condicao} onChange={e => setFormProd({ ...formProd, condicao: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-400 text-xs"><option value="Novo">Novo</option><option value="Usado">Usado</option><option value="Recondicionado">Recondicionado</option></select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="uppercase tracking-widest block mb-1 text-[8px] text-slate-500 font-black">Marca</label><input value={formProd.marca} onChange={e => setFormProd({ ...formProd, marca: e.target.value })} placeholder="Ex: Samsung" className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-400 text-xs" /></div>
                          <div><label className="uppercase tracking-widest block mb-1 text-[8px] text-slate-500 font-black">Modelo</label><input value={formProd.modelo} onChange={e => setFormProd({ ...formProd, modelo: e.target.value })} placeholder="Ex: Galaxy S24" className="w-full bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-400 text-xs" /></div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={loadingProd} className="w-full py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all">{loadingProd ? 'Salvando...' : '📥 Salvar'}</button>
                  {editandoId && <button type="button" onClick={() => { setFormProd(FORM_INICIAL); setEditandoId(null); setShowFichaTecnica(false); }} className="w-full py-2 bg-slate-100 text-slate-600 font-black text-[10px] uppercase rounded-xl">Cancelar</button>}
                </form>
              </div>
            </section>
            <section className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ minHeight: '520px' }}>
              <div className="p-3 border-b border-slate-100 flex justify-between items-center flex-wrap gap-2">
                <div className="bg-slate-100 p-0.5 rounded-lg flex gap-0.5">
                  <button onClick={() => setTipoCatalogo('BASE')} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${tipoCatalogo === 'BASE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Base</button>
                  <button onClick={() => setTipoCatalogo('ML')} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${tipoCatalogo === 'ML' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Vinculados</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="relative"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" /><input value={searchProd} onChange={e => setSearchProd(e.target.value)} placeholder="Pesquisar..." className="pl-7 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs w-36" /></div>
                  {selectedProds.size > 0 && <button onClick={excluirLoteProdutos} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100"><tr className="text-[9px] font-black uppercase text-slate-400"><th className="px-3 py-2.5 w-6"><button onClick={() => toggleSelectAll(produtosFiltrados, selectedProds, setSelectedProds)} className="text-slate-400">{selectedProds.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}</button></th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Peso</th><th className="px-3 py-2.5">Ficha</th><th className="px-3 py-2.5 text-right">Ação</th></tr></thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {produtosFiltrados.length === 0 && <tr><td colSpan="5" className="py-12 text-center text-slate-400 text-[10px] font-black uppercase">Catálogo Vazio</td></tr>}
                    {produtosFiltrados.map(prod => {
                      const sel = selectedProds.has(prod.id); const temFicha = prod.ean || prod.marca || prod.modelo;
                      return (
                        <tr key={prod.id} className={`hover:bg-slate-50/80 transition-colors ${sel ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-3 py-2.5"><button onClick={() => { const n = new Set(selectedProds); sel ? n.delete(prod.id) : n.add(prod.id); setSelectedProds(n); }} className="text-slate-400">{sel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}</button></td>
                          <td className="px-3 py-2.5"><div className="flex items-center gap-2">{prod.thumbnail ? <img src={prod.thumbnail} className="w-9 h-9 rounded-lg object-cover border border-slate-100" alt="" /> : <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-3.5 h-3.5 text-slate-300" /></div>}<div><div className="flex items-center gap-0.5 mb-0.5"><span className="text-[8px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{prod.sku}</span>{prod.mlItemId && <a href={`https://produto.mercadolivre.com.br/MLB-${(prod.mlItemId || '').replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-0.5 hover:bg-emerald-200">{prod.mlItemId}<ExternalLink className="w-1.5 h-1.5" /></a>}{prod.eKit && <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">KIT</span>}</div><p className="font-bold text-slate-800 truncate max-w-[170px]">{prod.nome}</p></div></div></td>
                          <td className="px-3 py-2.5"><span className="text-[9px] text-blue-700 font-black bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{prod.pesoGramas}g</span></td>
                          <td className="px-3 py-2.5">{temFicha ? <div className="flex flex-col gap-0.5">{prod.ean && <span className="text-[7px] text-indigo-600 font-mono bg-indigo-50 px-1 py-0.5 rounded truncate max-w-[80px]">{prod.ean}</span>}{prod.marca && <span className="text-[8px] text-slate-600 font-bold truncate max-w-[80px]">{prod.marca}</span>}</div> : <span className="text-[8px] text-slate-300 italic">—</span>}</td>
                          <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-0.5 relative"><div onMouseEnter={() => setQuickViewItem(prod)} onMouseLeave={() => setQuickViewItem(null)}><button onClick={() => abrirFullModal(prod)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-blue-100"><Eye className="w-3.5 h-3.5" /></button>{quickViewItem?.id === prod.id && <QuickViewPopover item={prod} />}</div><button onClick={() => { setFormProd({ sku: prod.sku, nome: prod.nome, preco: prod.preco, mlItemId: prod.mlItemId || '', peso: prod.pesoGramas, unidadePeso: 'g', alturaCm: prod.alturaCm || '', larguraCm: prod.larguraCm || '', comprimentoCm: prod.comprimentoCm || '', eKit: prod.eKit, categoria: prod.categoria || '', plataforma: prod.plataforma, ean: prod.ean || '', marca: prod.marca || '', modelo: prod.modelo || '', condicao: prod.condicao || 'Novo' }); setEditandoId(prod.id); setShowFichaTecnica(!!(prod.ean || prod.marca || prod.modelo)); }} className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"><Settings className="w-3.5 h-3.5" /></button>{prod.mlItemId && <button onClick={() => desvincularProduto(prod.id)} className="p-1.5 rounded bg-amber-50 text-amber-600 hover:bg-amber-100"><Unlink className="w-3.5 h-3.5" /></button>}<button onClick={() => excluirProduto(prod.id)} className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ABA FICHA TÉCNICA */}
        {activeTab === 'ficha' && (
          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><GitCompare className="w-4 h-4 text-blue-600" />Auditoria de Ficha Técnica</h3><p className="text-[10px] text-slate-500 mt-0.5">Compara EAN, marca, modelo e dimensões do catálogo local com os dados reais do ML. Corrige automaticamente via API.</p></div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-semibold"><ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />{produtosComFicha} produto(s) com ficha preenchida</div>
                  <button onClick={auditarFichaTecnica} disabled={auditandoFicha || !mlConectado} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${auditandoFicha || !mlConectado ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {auditandoFicha ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Auditando...</> : !mlConectado ? <><WifiOff className="w-3.5 h-3.5" />ML Desconectado</> : <><Zap className="w-3.5 h-3.5" />Auditar Ficha Técnica</>}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {[{ label: 'EAN/GTIN', icon: Barcode, desc: 'Código de barras' }, { label: 'Marca', icon: Tag, desc: 'Fabricante/marca' }, { label: 'Modelo', icon: Package, desc: 'Modelo/referência' }, { label: 'Dimensões', icon: Ruler, desc: 'Alt, Larg, Comp' }].map(({ label, icon: Icon, desc }) => (
                  <div key={label} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2"><Icon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" /><div><p className="text-[9px] font-black text-slate-700 uppercase">{label}</p><p className="text-[8px] text-slate-400">{desc}</p></div></div>
                ))}
              </div>
            </div>
            {resultadoAuditoriaFicha === null && !auditandoFicha && (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center"><GitCompare className="w-7 h-7 text-indigo-400" /></div>
                <p className="text-sm font-black text-slate-700">Nenhuma auditoria realizada ainda</p>
                <p className="text-xs text-slate-400 max-w-xs">Clique em "Auditar Ficha Técnica" para comparar os dados do catálogo local com o Mercado Livre.</p>
              </div>
            )}
            {auditandoFicha && (<div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /><p className="text-sm font-black text-slate-600">Buscando dados do ML e comparando...</p></div>)}
            {resultadoAuditoriaFicha !== null && !auditandoFicha && (
              <>
                <div className="flex items-center justify-between"><p className="text-xs font-black text-slate-600">{resultadoAuditoriaFicha.length === 0 ? '✅ Todos os campos estão conciliados!' : `⚠️ ${resultadoAuditoriaFicha.length} produto(s) com divergências na ficha técnica`}</p><button onClick={() => setResultadoAuditoriaFicha(null)} className="text-[9px] text-slate-400 hover:text-slate-600 font-black uppercase px-2 py-1 rounded bg-slate-50 border border-slate-200">Limpar</button></div>
                {resultadoAuditoriaFicha.length === 0 ? (
                  <div className="bg-white border border-emerald-200 rounded-2xl p-8 shadow-sm flex flex-col items-center gap-2 text-center"><CheckCircle2 className="w-10 h-10 text-emerald-400" /><p className="text-sm font-black text-emerald-700">Ficha técnica 100% conciliada!</p></div>
                ) : (
                  <div className="space-y-2">
                    {resultadoAuditoriaFicha.map(({ prod, mlData, divs }) => (
                      <div key={prod.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            {(prod.thumbnail || mlData.thumbnail) ? <img src={prod.thumbnail || mlData.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100 flex-shrink-0" /> : <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon className="w-4 h-4 text-slate-300" /></div>}
                            <div><p className="text-xs font-bold text-slate-800 truncate max-w-xs">{prod.nome}</p><div className="flex items-center gap-1.5 mt-0.5"><span className="text-[8px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">SKU: {prod.sku}</span>{prod.mlItemId && <a href={`https://produto.mercadolivre.com.br/MLB-${prod.mlItemId.replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-[8px] font-mono text-blue-500 hover:underline flex items-center gap-0.5">{prod.mlItemId}<ExternalLink className="w-2 h-2" /></a>}</div></div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg"><AlertTriangle className="w-3 h-3" />{divs.length} campo(s)</span>
                            <button onClick={() => abrirConciliacao(prod, mlData, divs)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase hover:bg-blue-700"><GitCompare className="w-3 h-3" />Ver e Corrigir</button>
                          </div>
                        </div>
                        <div className="px-4 py-2.5 overflow-x-auto">
                          <div className="flex gap-2 flex-wrap">
                            {divs.map((div, i) => { const CampoIcon = CAMPOS_FICHA.find(c => c.campo === div.campo)?.icone || Package; return (
                              <div key={i} className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                                <CampoIcon className="w-3 h-3 text-red-400 flex-shrink-0" />
                                <div><p className="text-[8px] font-black text-slate-500 uppercase">{div.nomeBonito}</p><div className="flex items-center gap-1"><span className="text-[9px] text-red-600 line-through">{div.valorML || 'Faltando'}</span><span className="text-[8px] text-slate-400">→</span><span className="text-[9px] text-emerald-700 font-bold">{div.valorERP}</span></div></div>
                              </div>
                            ); })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ MODAIS ══════════════════════════════════════════════════════════════ */}

      {/* Avisos ML */}
      {showAvisosML && <PainelAvisosML userId={userId} mlConectado={mlConectado} onClose={() => { setShowAvisosML(false); buscarCountAvisosML(); }} />}

      {/* Histórico de Divergência */}
      {modalHistoricoDiv && <ModalHistoricoDivergencia div={modalHistoricoDiv} onClose={() => setModalHistoricoDiv(null)} />}

      {/* Envio em Massa */}
      {showEnvioMassa && (
        <ModalEnvioMassa
          userId={userId}
          divergencias={divergencias}
          onClose={() => setShowEnvioMassa(false)}
          onConcluido={() => { buscarDivergencias(); buscarDivStats(); buscarCountAvisosML(); }}
        />
      )}

      {/* Conciliação Ficha Técnica */}
      {modalConciliacao && <ModalConciliacao dados={modalConciliacao} userId={userId} onClose={() => setModalConciliacao(null)} onSucesso={() => { buscarProdutos(); setResultadoAuditoriaFicha(null); }} />}

      {fullModalItem && (
        <ModalOverlay onClose={() => setFullModalItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '720px', maxWidth: '95vw', maxHeight: '88vh' }}>
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center shrink-0"><h3 className="font-black text-slate-800 uppercase text-xs flex items-center gap-1.5"><Box className="w-4 h-4 text-blue-600" />Detalhes — Mercado Livre</h3><button onClick={() => setFullModalItem(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5" /></button></div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingFullData ? (<div className="flex flex-col items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-400 mb-2" /><p className="text-[10px] text-slate-400 uppercase font-black">Buscando...</p></div>) : fullItemData ? (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-2 space-y-3">
                    <div className="bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center h-44">{fullItemData.pictures?.length > 0 ? <img src={fullItemData.pictures[0].url} className="max-h-full max-w-full object-contain rounded-lg" alt="" /> : <ImageIcon className="w-10 h-10 text-slate-200" />}</div>
                    {fullItemData.pictures?.length > 1 && <div className="flex gap-1 overflow-x-auto pb-1">{fullItemData.pictures.slice(1, 5).map((pic, idx) => <img key={idx} src={pic.url} className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0" alt="" />)}</div>}
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <a href={`https://produto.mercadolivre.com.br/MLB-${(fullItemData.id || '').replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100 inline-flex items-center gap-1">{fullItemData.id}<ExternalLink className="w-2.5 h-2.5" /></a>
                      <h2 className="text-xs font-bold text-slate-800 mt-1.5 leading-snug">{fullItemData.title}</h2>
                      <p className="text-xl font-black text-emerald-600 mt-1">R$ {fullItemData.price}</p>
                      <a href={fullItemData.permalink} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-1.5 w-full py-2 bg-[#FFE600] text-slate-900 rounded-lg text-[10px] font-black uppercase hover:bg-[#facc15]"><ExternalLink className="w-3 h-3" />Ver no ML</a>
                    </div>
                  </div>
                  <div className="lg:col-span-3 space-y-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><h4 className="text-[9px] font-black uppercase text-slate-400 mb-1.5 flex items-center gap-1"><FileText className="w-3 h-3" />Descrição</h4><div className="text-xs text-slate-700 leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap">{fullItemData.description_text || 'Sem descrição.'}</div></div>
                    {fullItemData.attributes?.filter(a => a.value_name).length > 0 && (<div className="bg-white p-3 rounded-xl border border-slate-200"><h4 className="text-[9px] font-black uppercase text-slate-400 mb-1.5 flex items-center gap-1"><LayoutList className="w-3 h-3" />Ficha Técnica</h4><div className="divide-y divide-slate-50">{fullItemData.attributes.filter(a => a.value_name).slice(0, 12).map(attr => (<div key={attr.id} className="flex items-center gap-2 py-1"><span className="text-[9px] text-slate-400 w-24 shrink-0 truncate">{attr.name}</span><span className="text-[10px] text-slate-700 font-medium truncate">{attr.value_name}</span></div>))}</div></div>)}
                  </div>
                </div>
              ) : (<div className="text-center py-14 text-slate-400 text-xs font-black uppercase">{fullModalItem.mlItemId ? 'Falha ao obter dados do ML' : 'Sem ID do ML vinculado'}</div>)}
            </div>
          </div>
        </ModalOverlay>
      )}

      {vincularAnuncio && (
        <ModalOverlay onClose={() => setVincularAnuncio(null)}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{ width: '440px', maxWidth: '95vw', maxHeight: '88vh' }}>
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center shrink-0"><h3 className="font-black text-slate-800 uppercase text-xs flex items-center gap-1.5"><Link2 className="w-4 h-4 text-emerald-600" />Vincular Anúncio</h3><button onClick={() => setVincularAnuncio(null)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1 rounded-full"><XCircle className="w-4 h-4" /></button></div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3 flex gap-2.5 items-center">{vincularAnuncio.thumbnail ? <img src={vincularAnuncio.thumbnail} className="w-12 h-12 object-cover rounded-lg border border-slate-100" alt="" /> : <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-300" /></div>}<div><a href={`https://produto.mercadolivre.com.br/MLB-${(vincularAnuncio.mlItemId || '').replace(/^MLB/i, '')}`} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">{vincularAnuncio.mlItemId}<ExternalLink className="w-2 h-2" /></a><p className="font-bold text-xs text-slate-800 mt-0.5 line-clamp-2">{vincularAnuncio.nome}</p></div></div>
              <div className="mb-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">1. Montar Kit</label>
                <div className="relative mb-1"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" /><input value={buscaBase} onChange={e => setBuscaBase(e.target.value)} placeholder="Buscar produto base..." className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs" /></div>
                {buscaBase && (<div className="mb-2 border border-slate-200 rounded-xl bg-white shadow-md overflow-hidden">{produtosBaseParaBusca.length === 0 && <p className="p-2.5 text-[10px] text-slate-400">Nenhum resultado</p>}{produtosBaseParaBusca.map(p => (<div key={p.id} className="p-2.5 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50"><span className="text-xs font-bold text-slate-700">{p.nome} <span className="text-[9px] text-slate-400">({p.pesoGramas}g)</span></span><button onClick={() => { if (!composicaoKit.find(c => c.produto.id === p.id)) setComposicaoKit([...composicaoKit, { produto: p, quantidade: 1 }]); setBuscaBase(''); }} className="text-[9px] font-black uppercase bg-blue-50 text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-100">Add</button></div>))}</div>)}
                <div className="space-y-1">{composicaoKit.map(item => (<div key={item.produto.id} className="flex justify-between items-center p-2.5 bg-white border border-slate-200 rounded-xl"><span className="text-xs font-bold text-slate-700 flex-1">{item.produto.nome}</span><div className="flex items-center gap-2"><div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5"><button onClick={() => { const q = item.quantidade - 1; if (q <= 0) setComposicaoKit(composicaoKit.filter(c => c.produto.id !== item.produto.id)); else setComposicaoKit(composicaoKit.map(c => c.produto.id === item.produto.id ? { ...c, quantidade: q } : c)); }} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-red-500 bg-white rounded font-black">−</button><span className="w-5 text-center font-black text-xs">{item.quantidade}</span><button onClick={() => setComposicaoKit(composicaoKit.map(c => c.produto.id === item.produto.id ? { ...c, quantidade: item.quantidade + 1 } : c))} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-blue-500 bg-white rounded font-black">+</button></div><span className="w-12 text-right text-[10px] text-emerald-600 font-black">{item.produto.pesoGramas * item.quantidade}g</span></div></div>))}</div>
                {composicaoKit.length > 0 && <div className="mt-1.5 p-2 bg-blue-50 rounded-lg border border-blue-100 flex justify-between text-[10px] font-bold text-blue-700"><span>Peso total:</span><span className="font-black">{composicaoKit.reduce((s, c) => s + c.produto.pesoGramas * c.quantidade, 0)}g</span></div>}
              </div>
              {composicaoKit.length === 0 && (<div><label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">2. Ou Peso Fixo</label><div className="flex gap-2"><input type="number" step="any" min="0" value={pesoManual} onChange={e => setPesoManual(e.target.value)} placeholder="Ex: 1.5" className="px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none w-28 text-xs font-bold" /><select value={unidadeManual} onChange={e => setUnidadeManual(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-2 text-[10px] font-black text-slate-600 outline-none"><option value="g">g</option><option value="kg">kg</option></select></div></div>)}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0"><button onClick={() => setVincularAnuncio(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancelar</button><button onClick={salvarVinculacao} disabled={composicaoKit.length === 0 && !pesoManual} className="px-5 py-2 rounded-xl text-xs font-black uppercase text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400">Confirmar</button></div>
          </div>
        </ModalOverlay>
      )}

      {showResumoModal && (
        <ModalOverlay onClose={() => setShowResumoModal(false)} side="right">
          <div className="bg-white shadow-2xl flex flex-col" style={{ width: '380px', height: '100%' }}>
            <div className="px-4 py-3 border-b flex justify-between items-center bg-indigo-600 text-white shrink-0"><h3 className="font-black uppercase text-xs flex items-center gap-2"><Sparkles className="w-4 h-4" />Resumo Executivo</h3><button onClick={() => setShowResumoModal(false)} className="hover:text-indigo-200"><XCircle className="w-4 h-4" /></button></div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingResumo ? (<div className="flex flex-col items-center justify-center py-14"><Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" /><p className="text-[10px] font-black uppercase text-indigo-400">Gerando...</p></div>) : resumoIA ? (<><div className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200" dangerouslySetInnerHTML={{ __html: resumoIA }} /><button onClick={() => downloadTxt(resumoIA, `resumo_ml_${new Date().toISOString().slice(0, 10)}.txt`)} className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50"><Download className="w-3 h-3" />Baixar TXT</button></>) : <div className="text-center py-12 text-slate-400 text-xs">Clique em "Gerar" para criar o relatório.</div>}
              {historicoResumos.length > 0 && (<div className="mt-5 pt-4 border-t border-slate-200"><h4 className="text-[9px] font-black uppercase text-slate-400 mb-2 flex items-center gap-1"><History className="w-3 h-3" />Histórico</h4><div className="space-y-1.5">{historicoResumos.map(h => (<button key={h.id} onClick={() => setResumoIA(h.conteudo)} className="w-full text-left p-2.5 bg-white border border-slate-200 rounded-xl hover:border-indigo-300"><p className="text-[9px] font-black text-indigo-600 mb-0.5">{new Date(h.createdAt).toLocaleString('pt-BR')}</p><p className="text-[10px] text-slate-500 line-clamp-2" dangerouslySetInnerHTML={{ __html: h.conteudo }} /></button>))}</div></div>)}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 shrink-0"><button onClick={gerarResumoLogistico} disabled={loadingResumo} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700 disabled:opacity-50">{loadingResumo ? 'Gerando...' : 'Gerar Novo Resumo'}</button></div>
          </div>
        </ModalOverlay>
      )}

      {showDicas && (
        <ModalOverlay onClose={() => setShowDicas(false)}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '420px', maxWidth: '95vw' }}>
            <div className="px-4 py-3 border-b flex justify-between items-center bg-blue-600 text-white"><h3 className="font-black uppercase text-xs flex items-center gap-1.5"><HelpCircle className="w-4 h-4" />Como funciona</h3><button onClick={() => setShowDicas(false)} className="text-blue-200 hover:text-white"><XCircle className="w-4 h-4" /></button></div>
            <div className="p-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              {[
                { icon: <Box className="w-3.5 h-3.5 text-amber-500" />, title: 'Não Vinculados', text: 'Anúncios do ML sem peso. Clique em "Vincular" para montar kit ou informar peso fixo.' },
                { icon: <Package className="w-3.5 h-3.5 text-blue-500" />, title: 'Base vs Anúncios', text: 'Base: peça física unitária. Anúncio: pacote final vendido (pode ser kit).' },
                { icon: <AlertTriangle className="w-3.5 h-3.5 text-purple-500" />, title: 'Reincidentes', text: 'Divergências corrigidas que voltaram. O ML atualizou o peso novamente.' },
                { icon: <Check className="w-3.5 h-3.5 text-emerald-500" />, title: 'Botão Corrigido', text: 'Ao clicar em ✔, o sistema pergunta se você corrigiu manualmente no ML ou se quer enviar a correção via API daqui.' },
                { icon: <Send className="w-3.5 h-3.5 text-blue-500" />, title: 'Envio em Massa', text: 'Itens marcados como "Enviar via API" ficam na aba "Fila Envio". Clique em "Enviar via API" no topo para processar tudo de uma vez.' },
                { icon: <History className="w-3.5 h-3.5 text-slate-500" />, title: 'Histórico por Item', text: 'Clique no ícone de relógio ao lado de cada divergência para ver quem fez o quê e quando.' },
                { icon: <ShieldAlert className="w-3.5 h-3.5 text-red-500" />, title: 'Avisos do ML', text: 'O ML detecta automaticamente anúncios com peso/dimensões divergentes e pode pausá-los. Esses avisos aparecem no painel vermelho.' },
                { icon: <GitCompare className="w-3.5 h-3.5 text-indigo-500" />, title: 'Ficha Técnica', text: 'Cadastre EAN, marca, modelo e dimensões para comparar e corrigir automaticamente via API na aba "Ficha Técnica".' },
                { icon: <Calendar className="w-3.5 h-3.5 text-emerald-500" />, title: 'Agendador', text: 'Configure varredura automática nas Configurações.' },
              ].map((d, i) => (
                <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100"><h4 className="font-black text-slate-800 mb-1 flex items-center gap-1.5">{d.icon}{d.title}</h4><p className="text-[11px]">{d.text}</p></div>
              ))}
            </div>
          </div>
        </ModalOverlay>
      )}

      {showConfig && (
        <ModalOverlay onClose={() => setShowConfig(false)}>
          <div className="bg-white rounded-2xl shadow-2xl" style={{ width: '360px', maxWidth: '95vw' }}>
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50"><h3 className="text-xs font-black uppercase flex items-center gap-1.5"><Settings className="w-4 h-4 text-blue-600" />Configurações</h3><button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-4 h-4" /></button></div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Conexão ML</label>
                {!mlConectado ? (<button onClick={conectarML} className="w-full flex items-center justify-center gap-2 bg-[#FFE600] text-slate-900 hover:bg-[#facc15] py-2.5 rounded-xl text-[10px] font-black uppercase"><ShoppingBag className="w-4 h-4" />Conectar</button>) : (<div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl"><span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{mlNickname || 'Vinculada'}</span><button onClick={desconectarML} className="text-[9px] font-black uppercase text-red-500 hover:bg-red-50 px-2 py-1 rounded">Sair</button></div>)}
              </div>
              <div className="pt-3 border-t border-slate-100">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Varredura Automática</label>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-xl cursor-pointer hover:bg-slate-100 mb-2" onClick={() => salvarAgendador(!agendador?.ativo, intervalo)}>
                  <div><p className="text-[10px] font-black text-slate-800 uppercase">{agendador?.ativo ? '✅ Ativa' : 'Ativar'}</p><p className="text-[9px] text-slate-500">{agendador?.ativo ? `Próxima: ${formatarProxima(agendador?.proximaExecucao)}` : 'Clique para ativar'}</p></div>
                  <div className={`w-9 h-5 rounded-full relative transition-colors ${agendador?.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`absolute top-0.5 bg-white w-4 h-4 rounded-full transition-all shadow-sm ${agendador?.ativo ? 'left-4' : 'left-0.5'}`} /></div>
                </div>
                <p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">Intervalo</p>
                <div className="grid grid-cols-4 gap-1">{INTERVALOS.map(opt => (<button key={opt.value} onClick={() => { setIntervalo(opt.value); if (agendador?.ativo) salvarAgendador(true, opt.value); }} className={`py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${intervalo === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>{opt.label}</button>))}</div>
                {!agendador?.ativo && (<button onClick={() => salvarAgendador(true, intervalo)} disabled={savingAgendador} className="w-full py-2 mt-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-600 disabled:opacity-50">{savingAgendador ? 'Salvando...' : 'Ativar Agora'}</button>)}
              </div>
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-xl cursor-pointer" onClick={() => setModoLento(!modoLento)}>
                  <div><p className="text-[10px] font-black text-slate-800 uppercase">Standby Anti-Timeout</p><p className="text-[9px] text-slate-500">Pausas entre buscas para evitar bloqueio.</p></div>
                  <div className={`w-9 h-5 rounded-full relative transition-colors ${modoLento ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`absolute top-0.5 bg-white w-4 h-4 rounded-full transition-all shadow-sm ${modoLento ? 'left-4' : 'left-0.5'}`} /></div>
                </div>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}