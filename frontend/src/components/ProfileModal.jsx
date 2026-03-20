import React, { useState } from 'react';
import { User, Camera, X, Loader2, Trash2, AlertTriangle, ShieldAlert, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useModal } from './Modal';

const API_BASE_URL = 'http://localhost:3000';

// ── Etapas do fluxo de exclusão ──────────────────────────────────────────────
// 'idle'      → botão "Excluir Conta" visível
// 'aviso'     → tela de aviso com confirmação
// 'codigo'    → aguardando código enviado por e-mail/terminal
// 'agendado'  → exclusão confirmada, aguardando prazo

export default function ProfileModal({ user, onClose, onSave }) {
  const [editName, setEditName]     = useState(user.nome || '');
  const [editAvatar, setEditAvatar] = useState(user.avatar || '');
  const [saving, setSaving]         = useState(false);

  // Fluxo de exclusão
  const [deleteStep, setDeleteStep]   = useState('idle');
  const [codigoInput, setCodigoInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]   = useState('');
  const [exclusaoEm, setExclusaoEm]     = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) { const r = new FileReader(); r.onloadend = () => setEditAvatar(r.result); r.readAsDataURL(file); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(editName, editAvatar); } finally { setSaving(false); }
  };

  // ── Passo 1: Solicitar código ──────────────────────────────────────────────
  const solicitarCodigo = async () => {
    setDeleteLoading(true); setDeleteError('');
    try {
      const res  = await fetch(`${API_BASE_URL}/api/auth/delete-account/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeleteStep('codigo');
    } catch (e) { setDeleteError(e.message); }
    finally { setDeleteLoading(false); }
  };

  // ── Passo 2: Confirmar com código ──────────────────────────────────────────
  const confirmarExclusao = async () => {
    if (!codigoInput.trim()) return;
    setDeleteLoading(true); setDeleteError('');
    try {
      const res  = await fetch(`${API_BASE_URL}/api/auth/delete-account/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, codigo: codigoInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExclusaoEm(data.exclusaoEm);
      setDeleteStep('agendado');
      // Atualiza localStorage para refletir o estado pendente
      const updated = { ...user, exclusaoPendente: true };
      localStorage.setItem('analyiz_user', JSON.stringify(updated));
    } catch (e) { setDeleteError(e.message); }
    finally { setDeleteLoading(false); }
  };

  // ── Cancelar exclusão ──────────────────────────────────────────────────────
  const cancelarExclusao = async () => {
    setDeleteLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/auth/delete-account/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const updated = { ...user, exclusaoPendente: false };
      localStorage.setItem('analyiz_user', JSON.stringify(updated));
      setDeleteStep('idle'); setDeleteError(''); setCodigoInput('');
    } catch {} finally { setDeleteLoading(false); }
  };

  // Formata data de exclusão
  const dataExclusaoFormatada = exclusaoEm
    ? new Date(exclusaoEm).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-200">

        {/* Header */}
        <div className="p-4 flex justify-between items-center text-white" style={{ background: 'var(--theme-header, #1e293b)' }}>
          <div className="flex items-center gap-2">
            {deleteStep !== 'idle' && deleteStep !== 'agendado' && (
              <button onClick={() => { setDeleteStep('idle'); setDeleteError(''); setCodigoInput(''); }} className="hover:text-white/70 transition-colors mr-1">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 className="font-black text-xs uppercase tracking-widest">
              {deleteStep === 'idle'     ? 'Ajustes de Conta'         :
               deleteStep === 'aviso'    ? 'Excluir Conta'            :
               deleteStep === 'codigo'   ? 'Confirmação de Exclusão'  :
               'Exclusão Agendada'}
            </h3>
          </div>
          <button onClick={onClose} className="hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* ── TELA PRINCIPAL (perfil) ── */}
        {deleteStep === 'idle' && (
          <div className="p-6 space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group cursor-pointer w-24 h-24 rounded-full overflow-hidden border-4 border-slate-100 shadow-md flex items-center justify-center bg-slate-50">
                {editAvatar ? <img src={editAvatar} alt="Preview" className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-slate-300" />}
                <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="w-6 h-6 text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alterar Imagem</span>
            </div>

            {/* Nome */}
            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Nome Completo</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-semibold outline-none focus:border-blue-500 transition-all" />
            </div>

            {/* Salvar */}
            <button onClick={handleSave} disabled={saving}
              className="w-full text-white font-black text-[10px] uppercase tracking-widest py-3.5 rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg"
              style={{ background: 'var(--theme-accent, #3b82f6)' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Alterações'}
            </button>

            {/* Divisor */}
            <div className="border-t border-slate-100 pt-4">
              {user.exclusaoPendente ? (
                // Se já tem exclusão agendada mostra aviso + opção de cancelar
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-black text-amber-700">Exclusão em andamento</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">Sua conta será excluída em até 3 dias úteis. Você pode cancelar enquanto o prazo não vencer.</p>
                    </div>
                  </div>
                  <button onClick={cancelarExclusao} disabled={deleteLoading}
                    className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-amber-700 transition-all flex items-center justify-center gap-2">
                    {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '↩ Cancelar Exclusão'}
                  </button>
                </div>
              ) : (
                <button onClick={() => setDeleteStep('aviso')}
                  className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2 border border-red-100">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir Minha Conta
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── TELA DE AVISO ── */}
        {deleteStep === 'aviso' && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h4 className="font-black text-slate-800 text-base mb-1">Tem certeza absoluta?</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">Esta ação irá <strong className="text-red-600">excluir permanentemente</strong> sua conta e todos os dados associados:</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-2">
              {['Todos os seus produtos cadastrados', 'Histórico de divergências', 'Conversas com a IA', 'Conexão com o Mercado Livre', 'Configurações e preferências'].map(item => (
                <div key={item} className="flex items-center gap-2 text-[11px] text-red-700">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"></span>
                  {item}
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-500" /> Atenção
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Estas informações serão <strong>excluídas permanentemente</strong> e <strong>não poderão ser recuperadas</strong> de nenhuma forma.
              </p>
            </div>

            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-600 font-bold flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {deleteError}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setDeleteStep('idle'); setDeleteError(''); }}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={solicitarCodigo} disabled={deleteLoading}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar e Enviar Código'}
              </button>
            </div>
          </div>
        )}

        {/* ── TELA DO CÓDIGO ── */}
        {deleteStep === 'codigo' && (
          <div className="p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7 text-amber-600" />
              </div>
              <h4 className="font-black text-slate-800 text-sm">Insira o código de confirmação</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Um código de 6 dígitos foi enviado. Por ora ele aparece no <strong>terminal do servidor</strong> (e-mail em breve).
              </p>
            </div>

            <div>
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Código de confirmação</label>
              <input
                type="text" maxLength={6} value={codigoInput}
                onChange={e => setCodigoInput(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xl font-mono text-center tracking-[0.5em] outline-none focus:border-red-400 transition-all"
              />
            </div>

            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-600 font-bold flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {deleteError}
              </div>
            )}

            <div className="space-y-2">
              <button onClick={confirmarExclusao} disabled={deleteLoading || codigoInput.length < 6}
                className={`w-full py-3.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${codigoInput.length < 6 ? 'bg-slate-100 text-slate-400' : 'bg-red-600 text-white hover:bg-red-700'}`}>
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-3.5 h-3.5" /> Confirmar Exclusão Definitiva</>}
              </button>
              <button onClick={solicitarCodigo} disabled={deleteLoading}
                className="w-full py-2 text-[10px] text-slate-400 hover:text-slate-600 transition-colors font-bold uppercase tracking-widest">
                Reenviar código
              </button>
            </div>
          </div>
        )}

        {/* ── TELA AGENDADO ── */}
        {deleteStep === 'agendado' && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-black text-slate-800 text-base mb-1">Solicitação registrada</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Sua conta está marcada para exclusão. O processo será concluído até:
                </p>
              </div>
            </div>

            {dataExclusaoFormatada && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest mb-1">Exclusão prevista para</p>
                <p className="text-sm font-black text-amber-800 capitalize">{dataExclusaoFormatada}</p>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">O que acontece agora?</p>
              {[
                'Você ainda pode usar sua conta normalmente até a data de exclusão',
                'Todos os seus dados serão removidos permanentemente na data agendada',
                'Você pode cancelar esta solicitação antes do prazo vencer',
              ].map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-slate-500">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full flex-shrink-0 mt-1.5"></span>
                  {t}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={cancelarExclusao} disabled={deleteLoading}
                className="flex-1 py-3 rounded-xl bg-amber-50 text-amber-700 font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 transition-all border border-amber-200 flex items-center justify-center gap-2">
                {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '↩ Cancelar Exclusão'}
              </button>
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">
                Entendi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}