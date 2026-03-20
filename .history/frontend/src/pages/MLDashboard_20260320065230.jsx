import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import {
  ShoppingBag, Scale, DollarSign, MessageCircle, ChevronRight,
  Activity, Wifi, WifiOff, CheckCircle2, Loader2, Settings,
  RefreshCw, LogOut, AlertTriangle
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

export default function MLDashboard() {
  const navigate = useNavigate();
  const { userId } = useOutletContext() || {};
  const { confirm, alert } = useModal();

  const [mlConectado, setMlConectado]     = useState(false);
  const [mlNickname, setMlNickname]       = useState('');
  const [mlExpira, setMlExpira]           = useState(null);
  const [loading, setLoading]             = useState(true);
  const [desconectando, setDesconectando] = useState(false);

  useEffect(() => { if (userId) verificarStatusML(); }, [userId]);

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

  const conectarML = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/auth-url?userId=${userId}`);
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { alert({ title: 'Erro', message: 'Falha ao obter URL de autenticação.' }); }
  };

  const desconectarML = async () => {
    if (!await confirm({
      title: 'Desconectar do ML',
      message: 'Isso encerrará a sessão do Mercado Livre para sua conta. Todas as funcionalidades de integração serão pausadas.',
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
      id: 'pesos',
      title: 'Auditoria de Pesos e Medidas',
      desc: 'Detecta divergências de frete e vincula kits base ao catálogo.',
      icon: Scale,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      accent: '#3b82f6',
      route: '/ml/auditoria',
      active: true,
      requerML: true,
    },
    {
      id: 'precos',
      title: 'Precificação Inteligente',
      desc: 'Altere preços dos seus anúncios diretamente pela API do Mercado Livre.',
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      accent: '#10b981',
      route: '/ml/precos',
      active: true,
      requerML: true,
    },
    {
      id: 'sac',
      title: 'SAC Automático via IA',
      desc: 'Responde perguntas de compradores automaticamente com IA.',
      icon: MessageCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      accent: '#f59e0b',
      route: '#',
      active: false,
      requerML: false,
    },
  ];

  const expiresFormatted = mlExpira
    ? new Date(mlExpira).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 lg:p-6 space-y-5 animate-in fade-in duration-500">

      {/* HERO */}
      <div className="bg-[#FFE600] rounded-3xl p-6 lg:p-8 shadow-md border border-yellow-400 relative overflow-hidden text-slate-900">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute right-10 bottom-0 w-24 h-24 rounded-full bg-black/5" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="p-3 bg-white rounded-2xl shadow-sm">
            <ShoppingBag className="w-8 h-8 text-slate-900" />
          </div>
          <div>
            <h2 className="text-3xl font-black mb-1">Central Mercado Livre</h2>
            <p className="text-slate-700 font-semibold text-xs leading-relaxed">
              Gerencie anúncios, preços, pesos e integrações da sua conta ML.
            </p>
          </div>
        </div>
      </div>

      {/* CARD DE CONEXÃO ML */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Settings className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Conexão Mercado Livre</span>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Verificando conexão...</span>
            </div>
          ) : mlConectado ? (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
                  <Wifi className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-black text-slate-800">{mlNickname || 'Conta vinculada'}</span>
                    <span className="text-[8px] font-black uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Ativo</span>
                  </div>
                  {expiresFormatted && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Token válido até {expiresFormatted}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={verificarStatusML} className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500" title="Verificar status">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={desconectarML}
                  disabled={desconectando}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 text-xs font-black uppercase disabled:opacity-50"
                >
                  {desconectando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-xl border border-slate-200">
                  <WifiOff className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-700">Nenhuma conta conectada</p>
                  <p className="text-xs text-slate-400">Conecte sua conta ML para habilitar as ferramentas abaixo.</p>
                </div>
              </div>
              <button
                onClick={conectarML}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#FFE600] text-slate-900 hover:bg-[#facc15] rounded-xl text-xs font-black uppercase shadow-sm transition-all"
              >
                <ShoppingBag className="w-4 h-4" />
                Conectar Mercado Livre
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FERRAMENTAS */}
      <div>
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 pl-1">
          <Activity className="w-3.5 h-3.5" /> Ferramentas Disponíveis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ferramentas.map((tool) => {
            const bloqueado = tool.requerML && !mlConectado;
            return (
              <div
                key={tool.id}
                onClick={() => {
                  if (!tool.active) return;
                  if (bloqueado) {
                    // Scroll up para ver o card de conexão
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                  }
                  navigate(tool.route);
                }}
                className={`bg-white p-5 rounded-3xl shadow-sm border border-slate-200 transition-all flex flex-col relative overflow-hidden ${
                  !tool.active
                    ? 'opacity-60 cursor-not-allowed'
                    : bloqueado
                    ? 'cursor-pointer hover:border-amber-300 hover:shadow-md'
                    : 'hover:border-blue-400 hover:shadow-lg cursor-pointer group'
                }`}
              >
                {/* stripe de cor no topo */}
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: tool.accent }} />

                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3.5 rounded-2xl ${tool.bg} ${tool.color} shadow-sm ${!bloqueado && tool.active ? 'group-hover:scale-110 transition-transform' : ''}`}>
                    <tool.icon className="w-6 h-6" />
                  </div>
                  {!tool.active ? (
                    <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-1 rounded">Em Breve</span>
                  ) : bloqueado ? (
                    <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                      <AlertTriangle className="w-3 h-3" />ML necessário
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <h4 className="text-sm font-black text-slate-800 mb-1.5 leading-tight">{tool.title}</h4>
                <p className="text-xs font-semibold text-slate-500 leading-relaxed flex-1">{tool.desc}</p>

                {bloqueado && tool.active && (
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