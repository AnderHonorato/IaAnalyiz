// frontend/src/components/IaBrainPanel.jsx
// ═══════════════════════════════════════════════════════════════════
// Painel do Cérebro da IA — exibe o terminal de estudos, 
// conhecimentos e estatísticas de aprendizado em tempo real
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react';
import {
  Brain, BookOpen, CheckCircle2, XCircle, Activity, Zap,
  RefreshCw, ChevronDown, ChevronRight, Loader2, Eye,
  TrendingUp, Database, MessageSquare, Clock,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

const TIPO_ICONS = {
  analise_sistema:     { icon: Activity,     color: 'text-blue-500',    bg: 'bg-blue-50',    label: 'Análise do Sistema' },
  mentoria_gemini:     { icon: Brain,         color: 'text-purple-500',  bg: 'bg-purple-50',  label: 'Mentoria Gemini' },
  aprendizado_gemini:  { icon: BookOpen,      color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Aprendizado' },
  conversa_usuario:    { icon: MessageSquare, color: 'text-amber-500',   bg: 'bg-amber-50',   label: 'Conversa' },
};

function safeDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}

// ─── Indicador de confiança ───────────────────────────────────────
function BarraConfianca({ valor }) {
  const pct  = Math.round((valor || 0) * 100);
  const cor  = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <span className="text-[9px] font-black" style={{ color: cor }}>{pct}%</span>
    </div>
  );
}

// ─── Card de estatísticas ─────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color} bg-opacity-10`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <p className="text-base font-black text-slate-800 leading-none">{value}</p>
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{label}</p>
        {sub && <p className="text-[8px] text-slate-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Linha do terminal ────────────────────────────────────────────
function LinhaTerminal({ estudo, idx }) {
  const [aberto, setAberto] = useState(false);
  const cfg = TIPO_ICONS[estudo.tipo] || TIPO_ICONS.analise_sistema;
  const Icon = cfg.icon;

  return (
    <div className="border-b border-slate-800/50 last:border-0">
      <div
        className="flex items-start gap-2 py-1.5 px-2 hover:bg-slate-800/30 cursor-pointer transition-colors"
        onClick={() => setAberto(v => !v)}
      >
        <span className="text-slate-600 text-[9px] font-mono shrink-0 mt-0.5">❯</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Icon className={`w-2.5 h-2.5 shrink-0 ${cfg.color}`} />
            <span className={`text-[8px] font-black uppercase ${cfg.color}`}>{cfg.label}</span>
            <span className="text-slate-600 text-[8px] ml-auto">{safeDate(estudo.createdAt)}</span>
          </div>
          <p className="text-[10px] text-slate-300 leading-relaxed">{estudo.resumo}</p>
        </div>
        {estudo.detalhes && (
          aberto ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
        )}
      </div>
      {aberto && estudo.detalhes && (
        <div className="mx-2 mb-1.5 bg-slate-900 rounded-lg p-2 text-[9px] font-mono text-slate-400 leading-relaxed overflow-x-auto">
          {(() => {
            try { return JSON.stringify(JSON.parse(estudo.detalhes), null, 2); }
            catch { return estudo.detalhes; }
          })()}
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────
export default function IaBrainPanel({ userId }) {
  const [stats, setStats]           = useState(null);
  const [estudos, setEstudos]       = useState([]);
  const [conhecimentos, setConhecimentos] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [abaAtiva, setAbaAtiva]     = useState('terminal');
  const [analisando, setAnalisando] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const terminalRef = useRef(null);
  const intervalRef = useRef(null);

  const carregar = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [statsRes, estudosRes, conhecRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/ia/brain/stats`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/ia/brain/estudos?limite=50`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/ia/brain/conhecimentos`).then(r => r.json()),
      ]);
      setStats(statsRes);
      setEstudos(Array.isArray(estudosRes) ? estudosRes : []);
      setConhecimentos(Array.isArray(conhecRes) ? conhecRes : []);
    } catch {}
    if (!silencioso) setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, [userId]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => carregar(true), 15000);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh]);

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
        body: JSON.stringify({ userId }),
      });
      await carregar(true);
    } catch {}
    setAnalisando(false);
  };

  const categorias = [...new Set(conhecimentos.map(k => k.categoria))];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Brain className="w-10 h-10 text-slate-200" />
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin absolute -bottom-1 -right-1" />
          </div>
          <p className="text-xs font-black text-slate-400 uppercase">Carregando cérebro da IA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: '600px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-900 rounded-t-2xl flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-blue-400" />
            </div>
            {stats?.loopAtivo && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-slate-900 animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">Cérebro da IA</p>
            <p className="text-[9px] text-slate-400">
              {stats?.loopAtivo ? '🟢 Aprendendo continuamente' : '🔴 Loop inativo'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${autoRefresh ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}
          >
            <Activity className={`w-3 h-3 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Pausado'}
          </button>
          <button
            onClick={forcarAnalise}
            disabled={analisando}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40 transition-all"
          >
            {analisando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Analisar
          </button>
          <button onClick={() => carregar(false)} className="p-1.5 bg-slate-700 text-slate-400 rounded-lg hover:bg-slate-600 transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 p-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <StatCard label="Conhecimentos"   value={stats.totalConhecimentos}    icon={Database}    color="text-blue-500"    />
          <StatCard label="Interações"      value={stats.totalAprendizados}     icon={MessageSquare} color="text-purple-500" />
          <StatCard label="Taxa de Acerto"  value={`${stats.taxaAcerto}%`}       icon={TrendingUp}  color="text-emerald-500" sub={`${stats.aprovados} aprovadas`} />
          <StatCard label="Reprovadas"      value={stats.reprovados}            icon={XCircle}     color="text-red-500"     />
        </div>
      )}

      {/* Abas */}
      <div className="flex border-b border-slate-200 shrink-0 bg-white">
        {[
          { id: 'terminal',     label: 'Terminal de Estudos', icon: Activity },
          { id: 'conhecimento', label: `Conhecimentos (${conhecimentos.length})`, icon: BookOpen },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAbaAtiva(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-black uppercase border-b-2 transition-all ${abaAtiva === id ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-hidden">

        {/* Terminal */}
        {abaAtiva === 'terminal' && (
          <div
            ref={terminalRef}
            className="h-full overflow-y-auto bg-slate-950 font-mono"
            style={{ maxHeight: '500px' }}
          >
            {/* Cabeçalho do terminal */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-3 py-1.5 flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <span className="text-[9px] text-slate-500 font-mono">ia-analyiz — terminal de estudos</span>
              {stats?.loopAtivo && (
                <span className="ml-auto flex items-center gap-1 text-[8px] text-emerald-400">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Aprendendo
                </span>
              )}
            </div>

            {estudos.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2">
                <Brain className="w-8 h-8 text-slate-700" />
                <p className="text-[10px] text-slate-600 uppercase font-black">Aguardando primeiro ciclo de estudo...</p>
                <p className="text-[9px] text-slate-700">O primeiro ciclo inicia 30s após o servidor subir</p>
              </div>
            ) : (
              <div>
                {estudos.slice().reverse().map((e, i) => (
                  <LinhaTerminal key={e.id || i} estudo={e} idx={i} />
                ))}
                {stats?.loopAtivo && (
                  <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-blue-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="animate-pulse">estudando silenciosamente...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Conhecimentos */}
        {abaAtiva === 'conhecimento' && (
          <div className="h-full overflow-y-auto p-3 space-y-3" style={{ maxHeight: '500px' }}>
            {categorias.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2">
                <BookOpen className="w-8 h-8 text-slate-200" />
                <p className="text-[10px] text-slate-400 uppercase font-black">Nenhum conhecimento ainda</p>
                <p className="text-[9px] text-slate-300">Force uma análise para começar</p>
              </div>
            ) : (
              categorias.map(cat => {
                const items = conhecimentos.filter(k => k.categoria === cat);
                return (
                  <div key={cat} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{cat.replace(/_/g, ' ')}</p>
                      <span className="text-[8px] text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full font-bold">{items.length}</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {items.map(k => (
                        <div key={k.id} className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-[9px] font-black text-slate-700 uppercase truncate flex-1">{k.chave}</p>
                            <div className="shrink-0 w-20">
                              <BarraConfianca valor={k.confianca} />
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-relaxed">{k.valor.substring(0, 180)}{k.valor.length > 180 ? '...' : ''}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[7px] text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{k.fonte}</span>
                            <span className="text-[7px] text-slate-300">{k.usos} uso{k.usos !== 1 ? 's' : ''}</span>
                            <span className="text-[7px] text-slate-300 ml-auto">{safeDate(k.atualizadoEm)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      {stats?.ultimoEstudo && (
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-400" />
          <p className="text-[9px] text-slate-400">Último estudo: {safeDate(stats.ultimoEstudo)}</p>
        </div>
      )}
    </div>
  );
}