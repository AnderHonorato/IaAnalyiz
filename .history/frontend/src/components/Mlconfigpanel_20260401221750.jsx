/**
 * frontend/src/components/Mlconfigpanel.jsx
 * 
 * ╪═════════════════════════════════════════════════════════════════════════════════
 * Propósito: Painel modal de configuração para integração Mercado Livre com gestão
 * de OAuth, scheduler automático de sincronização, controle de intervalos de execução
 * e monitoramento de status de conexão/expiração de token.
 * 
 * Responsabilidades:
 * - Gerenciar fluxo OAuth com Mercado Livre (autorização, renovação de token)
 * - Monitorar status da conexão (conectado, token expirado, desconectado)
 * - Permitir configuração de intervalo automático (30min a 24h) para sincronização
 * - Ativar/desativar robô automático de processamento de anúncios
 * - Exibir próxima execução schedulada e última execução realizada
 * - Lidar com desconexão de conta com confirmação de segurança
 * 
 * Estado:
 * - mlStatus: { connected, expired, nickname } — Status OAuth do Mercado Livre
 * - agendador: { ativo, intervalo, ultimaExecucao, proximaExecucao } — Config scheduler
 * - intervalo: Intervalo em minutos selecionado (30, 60, 120, 240, 360, 720, 1440)
 * - saving, connecting: Flags de loading para requisições
 * - modalOpen: Controla visibilidade do modal de configurações
 * 
 * Intervalos Disponíveis (INTERVALOS):
 * - 30 min (30 minutos)
 * - 1 hora (60 minutos)
 * - 2 horas (120 minutos)
 * - 4 horas (240 minutos)
 * - 6 horas (360 minutos — padrão)
 * - 12 horas (720 minutos)
 * - 24 horas (1440 minutos)
 * 
 * Endpoints API (POST/PUT):
 * - GET /api/ml/status?userId={id} — Verifica status OAuth (conectado, expirado)
 * - GET /api/agendador?userId={id} — Recupera configuração scheduler
 * - GET /api/ml/auth-url?userId={id} — Obtém URL de autorização Mercado Livre
 * - DELETE /api/ml/disconnect?userId={id} — Desconecta conta ML com limpeza
 * - PUT /api/agendador { userId, ativo, intervalo } — Salva nova config scheduler
 * 
 * Ciclo de Vida:
 * - Mount: Carrega status ML e agendador, setup intervalo de sincronização (30s)
 * - Query Params: Detecta ?auth=success/error para refresh automático após OAuth
 * - Update: Polling automático para atualizar próxima execução (30s refresh)
 * 
 * Props Recebidas:
 * - userId: String identificador do usuário (obrigatório)
 * - onStatusChange: Callback (connected: boolean) quando status ML muda
 * 
 * Funcionalidades:
 * - Formatação inteligente de datas/horas em português (pt-BR)
 * - Cálculo diferença horária para próxima execução (em Nh Xm)
 * - Estados visuais: conectado (verde), expirado (âmbar), desconectado (vermelho)
 * - Modal com Tailwind CSS (fixed, backdrop blur, animações)
 * - Indicadores de carregamento com spinner Loader2
 * 
 * Dependências:
 * - React hooks (useState, useEffect)
 * - lucide-react icons (Wifi, Settings, Clock, Zap, Play, Pause, etc.)
 * - Tailwind CSS (classes utility) — versão com suporte a animações
 * 
 * @author Anderson Honorato
 * @version 3.1.0
 * @since 2025-03-25
 * @integrates MercadoLivre.jsx (renderiza este painel dentro da página)
 * @integrates Backend: mlRoutes.js, agendadorRoutes.js (endpoints OAuth e scheduler)
 * @notes Depende de INTERVALOS constante e funções formatarProxima/formatarData locais
 */

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertTriangle, Settings, ShoppingBag, Loader2, RefreshCw, Zap, Clock, Play, Pause, LogOut, XCircle } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

const INTERVALOS = [
  { label: '30 min',  value: 30 },
  { label: '1 hora',  value: 60 },
  { label: '2 horas', value: 120 },
  { label: '4 horas', value: 240 },
  { label: '6 horas', value: 360 },
  { label: '12 horas',value: 720 },
  { label: '24 horas',value: 1440 },
];

function formatarProxima(dt) {
  if (!dt) return '—';
  const diff = new Date(dt) - Date.now();
  if (diff <= 0) return 'Agora';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `em ${h}h ${m}m`;
  return `em ${m}m`;
}

function formatarData(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function MlConfigPanel({ userId, onStatusChange }) {
  const [mlStatus,   setMlStatus]   = useState(null); 
  const [agendador,  setAgendador]  = useState(null); 
  const [intervalo,  setIntervalo]  = useState(360);
  const [saving,     setSaving]     = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);

  useEffect(() => {
    carregarStatus(); carregarAgendador();
    const t = setInterval(() => setAgendador(a => a ? { ...a } : a), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') { carregarStatus(); window.history.replaceState({}, '', window.location.pathname); }
    if (params.get('auth') === 'error') { alert('Erro na autenticação.'); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  const carregarStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`);
      const data = await res.json();
      setMlStatus(data);
      if (onStatusChange) onStatusChange(data.connected && !data.expired);
    } catch { setMlStatus({ connected: false }); }
  };

  const carregarAgendador = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/agendador?userId=${userId}`);
      const data = await res.json();
      setAgendador(data);
      setIntervalo(data.intervalo || 360);
    } catch {}
  };

  const conectarML = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/auth-url?userId=${userId}`);
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { alert('Erro de conexão com servidor.'); }
    finally { setConnecting(false); }
  };

  const desconectar = async () => {
    if (!confirm('Desconectar a conta do Mercado Livre?')) return;
    await fetch(`${API_BASE_URL}/api/ml/disconnect?userId=${userId}`, { method: 'DELETE' });
    carregarStatus();
  };

  const salvarAgendador = async (novoAtivo, novoIntervalo) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agendador`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ativo: novoAtivo, intervalo: novoIntervalo })
      });
      const data = await res.json();
      setAgendador(data);
      setIntervalo(data.intervalo);
    } catch {} finally { setSaving(false); }
  };

  const isOnline  = mlStatus?.connected && !mlStatus?.expired;
  const isExpired = mlStatus?.connected && mlStatus?.expired;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest ${isOnline ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : isExpired ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {isOnline ? <Wifi className="w-3 h-3" /> : isExpired ? <AlertTriangle className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isOnline ? mlStatus.nickname : isExpired ? 'Token Expirado' : 'Desconectado'}
        </div>
        <button onClick={() => setModalOpen(true)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors bg-white border border-slate-200 rounded shadow-sm" title="Configurações da Página">
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-[12px] font-black uppercase text-slate-800 flex items-center gap-2"><Settings className="w-4 h-4 text-blue-600"/> Configurações ML</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5"/></button>
            </div>
            
            <div className="p-5 space-y-6">
              {/* Conexão */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Conexão API</label>
                {!isOnline && (
                  <button onClick={conectarML} disabled={connecting} className="w-full flex items-center justify-center gap-2 bg-[#FFE600] text-slate-900 hover:bg-[#facc15] py-2.5 rounded-xl text-[11px] font-black uppercase transition-all shadow-sm">
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
                    Autorizar Conta ML
                  </button>
                )}
                {isExpired && (
                  <button onClick={conectarML} disabled={connecting} className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white hover:bg-amber-600 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all">
                    <RefreshCw className="w-4 h-4" /> Renovar Token Expirado
                  </button>
                )}
                {isOnline && (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                    <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Conta Vinculada</span>
                    <button onClick={desconectar} className="text-[10px] font-black uppercase text-red-500 hover:bg-red-50 px-2 py-1 rounded flex items-center gap-1"><LogOut className="w-3 h-3"/> Desconectar</button>
                  </div>
                )}
              </div>

              {/* Agendador */}
              <div className="pt-4 border-t border-slate-100">
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-3 flex items-center justify-between">
                  <span>Robô Automático</span>
                  {agendador?.ativo && <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Zap className="w-2.5 h-2.5"/> {formatarProxima(agendador.proximaExecucao)}</span>}
                </label>
                
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {INTERVALOS.map(op => (
                    <button key={op.value} onClick={() => setIntervalo(op.value)} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${intervalo === op.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                      {op.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  {!agendador?.ativo ? (
                    <button onClick={() => salvarAgendador(true, intervalo)} disabled={saving || !isOnline} className="flex-1 py-2.5 flex items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Ativar Varredura
                    </button>
                  ) : (
                    <>
                      <button onClick={() => salvarAgendador(false, intervalo)} disabled={saving} className="flex-1 py-2.5 flex items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase bg-amber-100 text-amber-700 hover:bg-amber-200">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />} Pausar
                      </button>
                      {intervalo !== agendador?.intervalo && (
                        <button onClick={() => salvarAgendador(true, intervalo)} disabled={saving} className="flex-1 py-2.5 flex items-center justify-center gap-1 rounded-xl text-[10px] font-black uppercase bg-blue-50 text-blue-600 border border-blue-200">
                          <RefreshCw className="w-3 h-3" /> Aplicar Tempo
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}