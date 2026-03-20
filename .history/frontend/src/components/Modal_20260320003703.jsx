// src/components/Modal.jsx
// Sistema de modal customizado com visual do site
// Substitui confirm(), alert() e prompt() nativos do navegador
//
// USO:
//   const { confirm, alert, prompt } = useModal();
//   const ok = await confirm({ title: 'Excluir?', message: 'Será removido.', danger: true });
//   await alert({ title: 'Sucesso!', message: 'Feito.', type: 'success' });

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X, Trash2, ShieldAlert } from 'lucide-react';

// ─── Context ─────────────────────────────────────────────────────────────────
const ModalContext = createContext(null);

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal deve ser usado dentro de <ModalProvider>');
  return ctx;
}

// ─── Ícones por tipo ──────────────────────────────────────────────────────────
const ICONS = {
  danger:  { icon: ShieldAlert,   bg: 'bg-red-100',     color: 'text-red-600'     },
  warning: { icon: AlertTriangle, bg: 'bg-amber-100',   color: 'text-amber-600'   },
  success: { icon: CheckCircle2,  bg: 'bg-emerald-100', color: 'text-emerald-600' },
  info:    { icon: Info,          bg: 'bg-blue-100',    color: 'text-blue-600'    },
};

// ─── Componente Modal ─────────────────────────────────────────────────────────
function ModalDialog({ modal, onResolve }) {
  const inputRef  = useRef(null);
  const {
    type = 'info', title, message, details = [],
    confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
    showCancel = true, danger = false, inputPlaceholder,
    inputType = 'text', inputMaxLength,
  } = modal;

  const resolvedType = danger ? 'danger' : type;
  const cfg          = ICONS[resolvedType] || ICONS.info;
  const Icon         = cfg.icon;

  const handleConfirm = () => {
    const value = inputRef.current ? inputRef.current.value : true;
    onResolve(value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !inputRef.current) handleConfirm();
    if (e.key === 'Escape') onResolve(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header com cor do tema */}
        <div
          className="px-5 py-4 flex items-center justify-between text-white"
          style={{ background: 'var(--theme-header, #1e293b)' }}
        >
          <span className="font-black text-xs uppercase tracking-widest">{title || 'Atenção'}</span>
          {showCancel && (
            <button onClick={() => onResolve(false)} className="hover:text-white/60 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-4">
          {/* Ícone + Mensagem */}
          <div className="flex items-start gap-4">
            <div className={`${cfg.bg} p-3 rounded-xl flex-shrink-0`}>
              <Icon className={`w-6 h-6 ${cfg.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-slate-700 leading-relaxed">{message}</p>
            </div>
          </div>

          {/* Lista de detalhes */}
          {details.length > 0 && (
            <div className={`rounded-xl p-4 border space-y-2 ${danger ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
              {details.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${danger ? 'bg-red-500' : 'bg-slate-400'}`}></span>
                  <span className={`text-[11px] leading-relaxed ${danger ? 'text-red-700' : 'text-slate-600'}`}>{d}</span>
                </div>
              ))}
            </div>
          )}

          {/* Input (para prompt) */}
          {inputPlaceholder !== undefined && (
            <input
              ref={inputRef}
              type={inputType}
              maxLength={inputMaxLength}
              placeholder={inputPlaceholder}
              autoFocus
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all text-center tracking-widest font-mono"
            />
          )}
        </div>

        {/* Botões */}
        <div className={`px-6 pb-6 flex gap-2.5 ${showCancel ? '' : 'justify-center'}`}>
          {showCancel && (
            <button
              onClick={() => onResolve(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={`flex-1 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2 shadow-md ${
              danger
                ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
                : resolvedType === 'success'
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                : 'shadow-blue-500/20'
            }`}
            style={!danger && resolvedType !== 'success' ? { background: 'var(--theme-accent, #3b82f6)' } : {}}
          >
            {danger && <Trash2 className="w-3.5 h-3.5" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ModalProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const resolverRef = useRef(null);

  const openModal = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setQueue(q => [...q, { ...options, id: Date.now() + Math.random() }]);
    });
  }, []);

  const handleResolve = useCallback((value) => {
    setQueue(q => q.slice(1));
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  // API pública
  const confirm = useCallback((options) =>
    openModal({ showCancel: true, confirmLabel: 'Confirmar', ...options }), [openModal]);

  const alert = useCallback((options) =>
    openModal({ showCancel: false, confirmLabel: 'OK', ...options }), [openModal]);

  const prompt = useCallback((options) =>
    openModal({
      showCancel: true, confirmLabel: 'Confirmar',
      inputPlaceholder: options.placeholder || '',
      ...options,
    }), [openModal]);

  const current = queue[0] || null;

  return (
    <ModalContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      {current && <ModalDialog key={current.id} modal={current} onResolve={handleResolve} />}
    </ModalContext.Provider>
  );
}