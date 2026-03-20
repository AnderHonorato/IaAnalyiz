import React, { useState, useEffect } from 'react';
import {
  ShoppingBag, Wifi, WifiOff, ExternalLink, RefreshCw,
  Clock, Play, Pause, CheckCircle2, AlertTriangle, Loader2,
  Calendar, Zap, LogOut
} from 'lucide-react';

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
  if (h > 0) return `em ${h}h ${m}min`;
  return `em ${m}min`;
}

function formatarData(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function MlConfigPanel({ userId, onStatusChange }) {
  const [mlStatus,   setMlStatus]   = useState(null);  // { connected, expired, nickname, expiresAt }
  const [agendador,  setAgendador]  = useState(null);  // { ativo, intervalo, ultimaExecucao, proximaExecucao }
  const [intervalo,  setIntervalo]  = useState(360);
  const [saving,     setSaving]     = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [expanded,   setExpanded]   = useState(false);

  useEffect(() => {
    carregarStatus();
    carregarAgendador();

    // Atualiza o countdown a cada 30s
    const t = setInterval(() => setAgendador(a => a ? { ...a } : a), 30000);
    return () => clearInterval(t);
  }, []);

  // Detecta callback de sucesso/erro do OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      carregarStatus();
      window.history.replaceState({}, '', '/ml');
    }
    if (params.get('auth') === 'error') {
      alert('Erro na autenticação com o Mercado Livre. Verifique as credenciais no .env e tente novamente.');
      window.history.replaceState({}, '', '/ml');
    }
  }, []);

  const carregarStatus = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`);
      const data = await res.json();
      setMlStatus(data);
      if (onStatusChange) onStatusChange(data.connected && !data.expired);
    } catch { setMlStatus({ connected: false }); }
  };

  const carregarAgendador = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/agendador?userId=${userId}`);
      const data = await res.json();
      setAgendador(data);
      setIntervalo(data.intervalo || 360);
    } catch {}
  };

  const conectarML = async () => {
    setConnecting(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/ml/auth-url?userId=${userId}`);
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert('Erro: ML_APP_ID não configurado no .env do servidor.');
    } catch { alert('Não foi possível conectar. Servidor offline?'); }
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
      const res  = await fetch(`${API_BASE_URL}/api/agendador`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, ativo: novoAtivo, intervalo: novoIntervalo })
      });
      const data = await res.json();
      setAgendador(data);
      setIntervalo(data.intervalo);
    } catch {} finally { setSaving(false); }
  };

  const isOnline  = mlStatus?.connected && !mlStatus?.expired;
  const isExpired = mlStatus?.connected && mlStatus?.expired;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-4 shrink-0">
      {/* Barra principal — sempre visível */}
      <div className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">

        {/* Status da conexão ML */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase border ${
            isOnline  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            isExpired ? 'bg-amber-50  border-amber-200  text-amber-700'    :
                        'bg-red-50    border-red-200     text-red-600'
          }`}>
            {isOnline  ? <Wifi     className="w-3 h-3" /> :
             isExpired ? <AlertTriangle className="w-3 h-3" /> :
                         <WifiOff  className="w-3 h-3" />}
            {isOnline  ? `Conectado — ${mlStatus.nickname}` :
             isExpired ? 'Token expirado' :
             mlStatus === null ? 'Verificando...' :
             'Desconectado'}
          </div>

          {/* Agendador badge */}
          {agendador?.ativo && isOnline && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full text-[10px] font-black uppercase">
              <Zap className="w-3 h-3" />
              Auto {formatarProxima(agendador.proximaExecucao)}
            </div>
          )}
        </div>

        {/* Ações rápidas */}
        <div className="flex items-center gap-2">
          {!isOnline && (
            <button onClick={conectarML} disabled={connecting}
              className="flex items-center gap-1.5 bg-[#FFE600] text-slate-900 hover:bg-yellow-400 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all shadow-sm">
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingBag className="w-3.5 h-3.5" />}
              Conectar ML
            </button>
          )}
          {isExpired && (
            <button onClick={conectarML} disabled={connecting}
              className="flex items-center gap-1.5 bg-amber-500 text-white hover:bg-amber-600 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Renovar Token
            </button>
          )}
          {isOnline && (
            <button onClick={desconectar}
              className="p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Desconectar">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Toggle configurações */}
          <button onClick={() => setExpanded(e => !e)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase border transition-all ${
              expanded ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}>
            <Calendar className="w-3.5 h-3.5" />
            Agendador
          </button>
        </div>
      </div>

      {/* Painel expandido — agendador */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/60">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Intervalo */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                <Clock className="w-3 h-3 inline mr-1" /> Ciclo de auditoria
              </label>
              <div className="flex flex-wrap gap-1.5">
                {INTERVALOS.map(op => (
                  <button key={op.value}
                    onClick={() => setIntervalo(op.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all ${
                      intervalo === op.value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status do agendador */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                <Zap className="w-3 h-3 inline mr-1" /> Status automático
              </label>
              <div className="space-y-1.5 text-[11px] text-slate-600">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${agendador?.ativo ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                  {agendador?.ativo ? 'Ativo' : 'Inativo'}
                </div>
                {agendador?.ultimaExecucao && (
                  <p className="text-slate-400">
                    Última: <strong>{formatarData(agendador.ultimaExecucao)}</strong>
                  </p>
                )}
                {agendador?.ativo && agendador?.proximaExecucao && (
                  <p className="text-blue-600 font-bold">
                    Próxima: {formatarProxima(agendador.proximaExecucao)}
                  </p>
                )}
              </div>
            </div>

            {/* Botões Ativar/Pausar */}
            <div className="flex flex-col justify-end gap-2">
              {!agendador?.ativo ? (
                <button
                  onClick={() => salvarAgendador(true, intervalo)}
                  disabled={saving || !isOnline}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
                    isOnline
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Ativar agendador
                </button>
              ) : (
                <button
                  onClick={() => salvarAgendador(false, intervalo)}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-[11px] uppercase tracking-widest bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                  Pausar agendador
                </button>
              )}
              {agendador?.ativo && intervalo !== agendador?.intervalo && (
                <button
                  onClick={() => salvarAgendador(true, intervalo)}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-black text-[10px] uppercase bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border border-blue-200">
                  <RefreshCw className="w-3 h-3" /> Aplicar novo ciclo
                </button>
              )}
              {!isOnline && (
                <p className="text-[9px] text-red-400 font-bold text-center uppercase tracking-widest">
                  Conecte o ML para usar o agendador
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}