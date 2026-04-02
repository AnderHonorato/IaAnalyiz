// frontend/src/components/IaBrainPanel.jsx
// ═══════════════════════════════════════════════════════════════════════════════
// Painel do Cérebro da IA — Terminal de estudos + conhecimentos + métricas
// Estilo: terminal escuro com dados em tempo real
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, BookOpen, CheckCircle2, XCircle, Activity, Zap,
  RefreshCw, ChevronDown, ChevronRight, Loader2,
  TrendingUp, Database, MessageSquare, Clock, Cpu,
  BarChart2, Shield, Star, AlertTriangle,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function safeTimeAgo(val) {
  if (!val) return '—';
  try {
    const diff = Date.now() - new Date(val).getTime();
    if (diff < 60000)    return 'agora mesmo';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}min atrás`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
    return `${Math.floor(diff / 86400000)}d atrás`;
  } catch { return '—'; }
}

// ─── Configurações de tipo de estudo ─────────────────────────────────────────
const TIPO_CONFIG = {
  analise_sistema:     { label: 'Análise',    color: '#3b82f6', icon: Activity },
  mentoria_gemini:     { label: 'Mentoria',   color: '#a78bfa', icon: Brain },
  validacao_resposta:  { label: 'Validação',  color: '#10b981', icon: Shield },
  aprendizado_validacao: { label: 'Aprend.',  color: '#f59e0b', icon: Star },
};

// ─── Barra de confiança ───────────────────────────────────────────────────────
function BarraConfianca({ valor, compact = false }) {
  const pct = Math.round((valor || 0) * 100);
  const cor  = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  if (compact) {
    return (
      <span className="text-[9px] font-black" style={{ color: cor }}>{pct}%</span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: cor }} />
      </div>
      <span className="text-[9px] font-black w-7 text-right" style={{ color: cor }}>{pct}%</span>
    </div>
  );
}

// ─── Card de stat ─────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub, dark = false }) {
  return (
    <div className={`rounded-xl p-3 flex items-center gap-2.5 border ${
      dark
        ? 'bg-slate-800 border-slate-700'
        : 'bg-white border-slate-200'
    }`}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className={`text-base font-black leading-none ${dark ? 'text-white' : 'text-slate-800'}`}>
          {value ?? '—'}
        </p>
        <p className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 truncate ${
          dark ? 'text-slate-400' : 'text-slate-400'
        }`}>{label}</p>
        {sub && <p className={`text-[8px] mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-300'}`}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Linha do terminal ────────────────────────────────────────────────────────
function LinhaTerminal({ estudo }) {
  const [open, setOpen] = useState(false);
  const cfg  = TIPO_CONFIG[estudo.tipo] || { label: estudo.tipo, color: '#94a3b8', icon: Activity };
  const Icon = cfg.icon;

  let detalhesObj = null;
  try { if (estudo.detalhes) detalhesObj = JSON.parse(estudo.detalhes); } catch {}

  return (
    <div className="border-b border-slate-800/60 last:border-0 group">
      <div
        className="flex items-start gap-2 py-1.5 px-3 hover:bg-slate-800/40 cursor-pointer transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        {/* Ícone de tipo */}
        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${cfg.color}20` }}>
          <Icon className="w-2.5 h-2.5" style={{ color: cfg.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[8px] font-black uppercase tracking-widest"
              style={{ color: cfg.color }}>{cfg.label}</span>
            <span className="text-slate-600 text-[8px] ml-auto flex-shrink-0">
              {safeTimeAgo(estudo.createdAt)}
            </span>
          </div>
          <p className="text-[10px] text-slate-300 leading-relaxed">{estudo.resumo}</p>
        </div>

        {detalhesObj && (
          open
            ? <ChevronDown className="w-3 h-3 text-slate-600 flex-shrink-0 mt-1" />
            : <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0 mt-1" />
        )}
      </div>

      {open && detalhesObj && (
        <div className="mx-3 mb-2 bg-slate-900/80 rounded-lg p-2.5 border border-slate-700/50">
          <pre className="text-[9px] font-mono text-slate-400 leading-relaxed overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(detalhesObj, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function IaBrainPanel({ userId }) {
  const [stats, setStats]             = useState(null);
  const [estudos, setEstudos]         = useState([]);
  const [conhecimentos, setConhecimentos] = useState([]);
  const [aprendizados, setAprendizados]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [abaAtiva, setAbaAtiva]       = useState('terminal');
  const [analisando, setAnalisando]   = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [catFiltro, setCatFiltro]     = useState('todos');

  const terminalRef = useRef(null);
  const intervalRef = useRef(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [statsRes, estudosRes, conhecRes, aprRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/ia/brain/stats`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/ia/brain/estudos?limite=60`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/ia/brain/conhecimentos`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/ia/brain/aprendizados`).then(r => r.json()),
      ]);
      setStats(statsRes);
      setEstudos(Array.isArray(estudosRes) ? estudosRes : []);
      setConhecimentos(Array.isArray(conhecRes) ? conhecRes : []);
      setAprendizados(Array.isArray(aprRes) ? aprRes : []);
    } catch {}
    if (!silencioso) setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => carregar(true), 12000);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, carregar]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current && abaAtiva === 'terminal') {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [estudos, abaAtiva]);

  const forcarAnalise = async () => {
    setAnalisando(true);
    try {
      await fetch(`${API_BASE_URL}/api/ia/brain/analisar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ userId }),
      });
      await carregar(true);
    } catch {}
    setAnalisando(false);
  };

  // Agrupa conhecimentos por categoria
  const categorias = ['todos', ...new Set(conhecimentos.map(k => k.categoria))];
  const conhecimentosFiltrados = catFiltro === 'todos'
    ? conhecimentos
    : conhecimentos.filter(k => k.categoria === catFiltro);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-12 h-12">
            <Brain className="w-12 h-12 text-slate-200" />
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin absolute -bottom-1 -right-1" />
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Carregando cérebro da IA...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-950 rounded-2xl overflow-hidden" style={{ minHeight: '580px' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-blue-400" />
            </div>
            {stats?.loopAtivo && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">Cérebro da IA</p>
            <p className="text-[9px] text-slate-500 flex items-center gap-1">
              {stats?.loopAtivo
                ? <><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block animate-pulse" />Ciclo #{stats?.cicloAtual || 0} — aprendendo</>
                : <><span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block" />Loop inativo</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${
              autoRefresh
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}
          >
            <Activity className={`w-3 h-3 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Parado'}
          </button>
          <button
            onClick={forcarAnalise}
            disabled={analisando}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40 transition-all"
          >
            {analisando
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Zap className="w-3 h-3" />}
            Analisar
          </button>
          <button
            onClick={() => carregar(false)}
            className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 border border-slate-700 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Stats grid ────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 p-3 border-b border-slate-800 shrink-0">
          <StatCard
            dark label="Conhecimentos" value={stats.totalConhecimentos}
            icon={Database} color="#3b82f6"
          />
          <StatCard
            dark label="Interações" value={stats.totalAprendizados}
            icon={MessageSquare} color="#a78bfa"
          />
          <StatCard
            dark label="Taxa Acerto" value={`${stats.taxaAcerto}%`}
            icon={TrendingUp} color="#10b981"
            sub={`${stats.aprovados} aprovadas`}
          />
          <StatCard
            dark label="Reprovadas" value={stats.reprovados}
            icon={XCircle} color="#ef4444"
            sub={`${stats.cicloAtual || 0} ciclos`}
          />
        </div>
      )}

      {/* ── Abas ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-800 shrink-0">
        {[
          { id: 'terminal',     label: `Terminal (${estudos.length})`,           icon: Cpu },
          { id: 'conhecimento', label: `Memória (${conhecimentos.length})`,       icon: BookOpen },
          { id: 'aprendizados', label: `Histórico (${aprendizados.length})`,      icon: BarChart2 },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAbaAtiva(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-black uppercase border-b-2 transition-all ${
              abaAtiva === id
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* TERMINAL */}
        {abaAtiva === 'terminal' && (
          <div
            ref={terminalRef}
            className="h-full overflow-y-auto"
            style={{ maxHeight: '420px', fontFamily: 'monospace' }}
          >
            {/* Barra do terminal */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-3 py-1.5 flex items-center gap-2 z-10">
              <div className="flex gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              </div>
              <span className="text-[9px] text-slate-600 flex-1">
                ia-analyiz — terminal de estudos autônomos
              </span>
              {stats?.ultimoEstudoTipo && (
                <span className="text-[8px] text-slate-600 capitalize">
                  último: {stats.ultimoEstudoTipo.replace('_', ' ')} • {safeTimeAgo(stats.ultimoEstudo)}
                </span>
              )}
            </div>

            {estudos.length === 0 ? (
              <div className="flex flex-col items-center py-14 gap-2">
                <Brain className="w-8 h-8 text-slate-700" />
                <p className="text-[10px] text-slate-600 uppercase font-black">
                  Aguardando primeiro ciclo... (30s após subir o servidor)
                </p>
              </div>
            ) : (
              <>
                {/* Mostra do mais antigo para o mais novo (terminal style) */}
                {[...estudos].reverse().map((e, i) => (
                  <LinhaTerminal key={e.id || i} estudo={e} />
                ))}
                {stats?.loopAtivo && (
                  <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-blue-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="animate-pulse">estudando silenciosamente...</span>
                    <span className="text-slate-600 ml-auto text-[8px]">
                      próximo ciclo em ~{Math.max(0, 15 - ((stats.cicloAtual || 0) % 15))}min
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MEMÓRIA / CONHECIMENTOS */}
        {abaAtiva === 'conhecimento' && (
          <div className="h-full flex flex-col" style={{ maxHeight: '420px' }}>
            {/* Filtro por categoria */}
            <div className="flex gap-1 p-3 border-b border-slate-800 flex-wrap shrink-0">
              {categorias.map(cat => (
                <button key={cat} onClick={() => setCatFiltro(cat)}
                  className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all ${
                    catFiltro === cat
                      ? 'bg-blue-500/30 text-blue-300 border-blue-500/50'
                      : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
                  }`}>
                  {cat === 'todos' ? `Todos (${conhecimentos.length})` : cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {conhecimentosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <BookOpen className="w-8 h-8 text-slate-700" />
                  <p className="text-[10px] text-slate-600 uppercase font-black">
                    Nenhum conhecimento — force uma análise
                  </p>
                </div>
              ) : (
                conhecimentosFiltrados.map(k => (
                  <div key={k.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 hover:border-slate-700 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[7px] font-black text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 uppercase flex-shrink-0">
                          {k.categoria.replace(/_/g, ' ')}
                        </span>
                        <p className="text-[9px] font-black text-slate-300 truncate">{k.chave}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[7px] text-slate-600">{k.usos} uso{k.usos !== 1 ? 's' : ''}</span>
                        <BarraConfianca valor={k.confianca} compact />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {k.valor.substring(0, 200)}{k.valor.length > 200 ? '...' : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[7px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50">
                        {k.fonte}
                      </span>
                      <span className="text-[7px] text-slate-600 ml-auto">{safeDate(k.atualizadoEm)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* HISTÓRICO DE APRENDIZADOS */}
        {abaAtiva === 'aprendizados' && (
          <div className="h-full overflow-y-auto p-3 space-y-2" style={{ maxHeight: '420px' }}>
            {aprendizados.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <BarChart2 className="w-8 h-8 text-slate-700" />
                <p className="text-[10px] text-slate-600 uppercase font-black">
                  Nenhum aprendizado registrado ainda
                </p>
              </div>
            ) : (
              aprendizados.map(a => (
                <div key={a.id}
                  className={`border rounded-xl p-2.5 ${
                    a.aprovada
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {a.aprovada
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                    <p className="text-[10px] text-slate-300 flex-1 leading-snug truncate">
                      {a.pergunta}
                    </p>
                    <span className={`text-[8px] font-black flex-shrink-0 ${
                      a.aprovada ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {Math.round((a.confianca || 0) * 100)}%
                    </span>
                  </div>
                  {a.motivo && (
                    <p className="text-[9px] text-slate-500 ml-5 truncate">{a.motivo}</p>
                  )}
                  <p className="text-[8px] text-slate-600 ml-5 mt-0.5">{safeTimeAgo(a.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Rodapé ────────────────────────────────────────────────────────── */}
      {stats?.ultimoEstudo && (
        <div className="px-4 py-2 border-t border-slate-800 shrink-0 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-600" />
          <p className="text-[9px] text-slate-600">
            Último estudo: {safeDate(stats.ultimoEstudo)}
          </p>
          {stats.categorias?.length > 0 && (
            <p className="text-[9px] text-slate-700 ml-auto">
              {stats.categorias.length} categorias de conhecimento
            </p>
          )}
        </div>
      )}
    </div>
  );
}