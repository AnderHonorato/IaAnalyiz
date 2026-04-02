/**
 * frontend/src/pages/MLDashboard.jsx
 * 
 * Propósito:
 * Dashboard centralizado de integração Mercado Livre.
 * Gerencia autenticação OAuth, status de conexão e acesso a ferramentas.
 * 
 * Responsabilidades:
 * - Verificar status de conexão OAuth do Mercado Livre
 * - Exibir informações do usuário conectado (nickname, data de expiração)
 * - Permitir conexão/desconexão de conta Mercado Livre
 * - Fornecer acesso às ferramentas de gerenciamento (auditoria, preços, anúncios)
 * - Exibir status de conexão em tempo real
 * 
 * Estado:
 *   - mlConectado: Boolean indicando conexão ativa
 *   - mlNickname: Nome de utilizador Mercado Livre
 *   - mlExpira: Data de expiração do token OAuth
 *   - loading: Flag de carregamento de status
 *   - desconectando: Flag de desconexão em andamento
 * 
 * Props Context:
 *   - userId: ID do utilizador (via useOutletContext)
 * 
 * Ferramentas Disponíveis:
 *   - Radar de Fretes: Detecta divergências de peso
 *   - Precificação: Altera preços/estoque via API
 *   - Meus Anúncios: Visualiza todos os anúncios
 *   - Pesquisa de Anúncios: Analisa konkorrentes
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import {
  ShoppingBag, Scale, DollarSign, MessageCircle, ChevronRight,
  Wifi, WifiOff, CheckCircle2, Loader2, RefreshCw, LogOut,
  AlertTriangle, Settings, Activity, Clock, Search, LayoutList,
  Zap,
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

// ╪═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES UTILITÁRIAS
// ╪═══════════════════════════════════════════════════════════════════════════

/** Formata data para locale português-BR */
function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function MLDashboard() {
  // ╪═══════════════════════════════════════════════════════════════════════════
  // HOOKS E CONTEXTO
  // ╪═══════════════════════════════════════════════════════════════════════════
  const navigate = useNavigate();
  const { userId } = useOutletContext() || {};
  const { confirm, alert } = useModal();

  // ╪═══════════════════════════════════════════════════════════════════════════
  // ESTADOS
  // ╪═══════════════════════════════════════════════════════════════════════════
  const [mlConectado,   setMlConectado]   = useState(false);
  const [mlNickname,    setMlNickname]    = useState('');
  const [mlExpira,      setMlExpira]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [desconectando, setDesconectando] = useState(false);

  // ╪═══════════════════════════════════════════════════════════════════════════
  // EFEITO: Sincroniza status ao montar componente
  // ╪═══════════════════════════════════════════════════════════════════════════
  useEffect(() => { if (userId) verificarStatusML(); }, [userId]);

  // ╪═══════════════════════════════════════════════════════════════════════════
  // FUNÇÕES DE INTEGRAÇÃO COM BACKEND
  // ╪═══════════════════════════════════════════════════════════════════════════
  
  /** Verifica status atual da autenticação Mercado Livre */
  const verificarStatusML = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`);
      const data = await res.json();
      setMlConectado(data.connected && !data.expired);
      setMlNickname(data.nickname || '');
      setMlExpira(data.expiresAt || null);
    } catch {} finally { setLoading(false); }
  };

  /** Inicia fluxo OAuth do Mercado Livre */
  const conectarML = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/auth-url?userId=${userId}`);
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { alert({ title: 'Erro', message: 'Falha ao obter URL.' }); }
  };

  /** Desconecta da conta Mercado Livre */
  const desconectarML = async () => {
    if (!await confirm({
      title: 'Desconectar do ML',
      message: 'Encerrará a sessão e pausará todas as integrações.',
      confirmLabel: 'Desconectar',
      danger: true,
    })) return;
    setDesconectando(true);
    try {
      await fetch(`${API_BASE_URL}/api/ml/disconnect?userId=${userId}`, { method: 'DELETE' });
      await verificarStatusML();
    } catch {} finally { setDesconectando(false); }
  };

  const ferramentas = [
    {
      id: 'auditoria',
      title: '🔍 Radar de Fretes',
      desc: 'Detecta e corrige divergências de peso que aumentam seu custo de frete.',
      icon: Scale,
      accentColor: '#3b82f6',
      route: '/ml/auditoria', active: true, requerML: true,
    },
    {
      id: 'precos',
      title: '💰 Precificação',
      desc: 'Altere preços e estoque dos anúncios diretamente via API do Mercado Livre.',
      icon: DollarSign,
      accentColor: '#10b981',
      route: '/ml/precos', active: true, requerML: true,
    },
    {
      id: 'anuncios',
      title: '📋 Meus Anúncios',
      desc: 'Visualize todos os seus anúncios com estoque, vendidos, fotos e ficha técnica completa.',
      icon: LayoutList,
      accentColor: '#0d9488',
      route: '/ml/anuncios', active: true, requerML: true,
    },
    {
      id: 'pesquisa',
      title: '🔎 Pesquisa de Anúncios',
      desc: 'Analise preços, concorrentes e dados completos de qualquer anúncio do ML por link.',
      icon: Search,
      accentColor: '#7c3aed',
      route: '/ml/pesquisa', active: true, requerML: true,
    },
    {
      id: 'sac',
      title: '🤖 SAC com IA',
      desc: 'Responde perguntas de compradores automaticamente com inteligência artificial.',
      icon: MessageCircle,
      accentColor: '#f59e0b',
      route: '#', active: false, requerML: false,
    },
  ];

  const expiresFormatted = safeDate(mlExpira);

  return (
    <div className="w-full max-w-5xl mx-auto p-4 space-y-4 animate-in fade-in duration-500">
      <style>{`
        @keyframes pill-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.35)} 50%{box-shadow:0 0 0 6px rgba(34,197,94,0)} }
        @keyframes card-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .ml-card-anim { animation: card-in 0.35s ease both; }
        .ml-card-anim:nth-child(1){animation-delay:0.05s}
        .ml-card-anim:nth-child(2){animation-delay:0.10s}
        .ml-card-anim:nth-child(3){animation-delay:0.15s}
        .ml-card-anim:nth-child(4){animation-delay:0.20s}
        .ml-card-anim:nth-child(5){animation-delay:0.25s}
        .ml-tool-card {
          background: var(--theme-card);
          border-color: var(--theme-card-border);
          color: var(--theme-text);
        }
        .ml-tool-card:hover:not(.blocked):not(.inactive) {
          border-color: var(--theme-accent) !important;
          box-shadow: 0 8px 32px -4px rgba(0,0,0,0.10), 0 0 0 1px var(--theme-accent);
        }
        .ml-section-label {
          color: var(--theme-text);
          opacity: 0.4;
        }
        .ml-card-title { color: var(--theme-text); }
        .ml-card-desc { color: var(--theme-text); opacity: 0.55; }
        .ml-chevron-wrap {
          background: var(--theme-sidebar);
          color: var(--theme-text);
          opacity: 0.5;
        }
        .ml-tool-card:not(.blocked):not(.inactive):hover .ml-chevron-wrap {
          background: var(--theme-accent);
          color: #fff;
          opacity: 1;
        }
        .ml-top-bar {
          background: var(--theme-card);
          border-color: var(--theme-card-border);
        }
        .ml-top-bar-label {
          color: var(--theme-text);
          opacity: 0.4;
        }
      `}</style>

      {/* HERO com pílula de conexão */}
      <div className="bg-[#FFE600] rounded-2xl px-6 py-5 shadow-sm border border-yellow-400 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute right-16 bottom-0 w-16 h-16 rounded-full bg-black/5" />

        <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
          {/* Título */}
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-white rounded-xl shadow-sm flex-shrink-0">
              <ShoppingBag className="w-7 h-7 text-slate-900" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 leading-tight">Central Mercado Livre</h2>
              <p className="text-slate-700 text-xs font-semibold mt-0.5">Gerencie anúncios, preços, divergências e integrações.</p>
            </div>
          </div>

          {/* PÍLULA de Conexão — canto direito do hero */}
          <div className="flex-shrink-0">
            {loading ? (
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-white/80 px-3 py-2 rounded-full text-slate-600 text-[10px] font-black shadow-sm">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Verificando...</span>
              </div>
            ) : mlConectado ? (
              <div
                className="flex items-center gap-2 bg-white border border-emerald-200 px-3 py-2 rounded-full shadow-sm group cursor-default select-none"
                style={{ animation: 'pill-pulse 2.5s ease-in-out infinite' }}
              >
                {/* dot verde pulsante */}
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Wifi className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                <span className="text-[10px] font-black text-slate-800 max-w-[100px] truncate">
                  {mlNickname || 'Conectado'}
                </span>
                {expiresFormatted && (
                  <span className="hidden sm:flex items-center gap-1 text-[9px] text-slate-400 font-semibold border-l border-slate-200 pl-2 ml-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {expiresFormatted}
                  </span>
                )}
                {/* Ações inline na pílula */}
                <div className="flex items-center gap-1 border-l border-slate-200 pl-2 ml-0.5">
                  <button
                    onClick={verificarStatusML}
                    className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    title="Atualizar"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={desconectarML}
                    disabled={desconectando}
                    className="p-1 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Desconectar"
                  >
                    {desconectando
                      ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      : <LogOut className="w-2.5 h-2.5" />
                    }
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={conectarML}
                className="flex items-center gap-2 bg-white/90 hover:bg-white border border-white/80 text-slate-800 px-4 py-2 rounded-full text-[10px] font-black uppercase shadow-sm transition-all hover:shadow-md active:scale-95"
              >
                <WifiOff className="w-3 h-3 text-slate-500 flex-shrink-0" />
                Conectar ML
                <ChevronRight className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FERRAMENTAS */}
      <div>
        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2 pl-1 ml-section-label">
          <Activity className="w-3 h-3" /> Ferramentas Disponíveis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ferramentas.map((tool) => {
            const bloqueado = tool.requerML && !mlConectado;
            const inativo = !tool.active;
            return (
              <div
                key={tool.id}
                onClick={() => {
                  if (inativo) return;
                  if (bloqueado) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
                  navigate(tool.route);
                }}
                className={`ml-tool-card ml-card-anim p-5 rounded-2xl shadow-sm border transition-all flex flex-col relative overflow-hidden ${
                  inativo
                    ? 'opacity-60 cursor-not-allowed inactive'
                    : bloqueado
                    ? 'cursor-pointer hover:border-amber-300 blocked'
                    : 'cursor-pointer group'
                }`}
              >
                {/* accent top stripe usando cor fixa da ferramenta */}
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: tool.accentColor }}
                />

                <div className="flex justify-between items-start mb-3">
                  {/* ícone com fundo semitransparente baseado no accentColor da ferramenta */}
                  <div
                    className={`p-3 rounded-xl shadow-sm transition-transform ${!bloqueado && !inativo ? 'group-hover:scale-110' : ''}`}
                    style={{
                      background: tool.accentColor + '18',
                      color: tool.accentColor,
                      border: `1px solid ${tool.accentColor}22`,
                    }}
                  >
                    <tool.icon className="w-5 h-5" />
                  </div>

                  {inativo ? (
                    <span className="text-[9px] font-black uppercase ml-section-label bg-transparent border ml-top-bar px-2 py-1 rounded">Em Breve</span>
                  ) : bloqueado ? (
                    <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                      <AlertTriangle className="w-3 h-3" />ML necessário
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full ml-chevron-wrap flex items-center justify-center transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <h4 className="text-sm font-black mb-1.5 leading-tight ml-card-title">{tool.title}</h4>
                <p className="text-xs leading-relaxed flex-1 ml-card-desc">{tool.desc}</p>

                {bloqueado && !inativo && (
                  <p className="text-[9px] text-amber-600 font-black uppercase mt-3 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Conecte o ML acima para usar
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}