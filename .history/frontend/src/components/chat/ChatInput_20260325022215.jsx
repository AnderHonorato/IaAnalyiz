import React from 'react';
import { Send } from 'lucide-react';

export default function ChatInput({ chatInput, setChatInput, handleSend, isChatLoading }) {
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-b-inherit shrink-0">
      <div className="relative flex items-end gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl p-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-sm">
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Pergunte sobre seus produtos, lucros ou concorrência..."
          className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none outline-none text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 custom-scrollbar py-2.5 px-2"
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!chatInput.trim() || isChatLoading}
          className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shrink-0 mb-0.5"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <div className="text-center mt-2">
        <span className="text-[10px] text-slate-400 font-medium tracking-wide">
          A IA pode cometer erros. Verifique dados críticos.
        </span>
      </div>
    </div>
  );
}