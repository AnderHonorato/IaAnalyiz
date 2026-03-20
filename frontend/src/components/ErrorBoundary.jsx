import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Atualiza o estado para exibir a UI de fallback na próxima renderização
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Aqui você poderia enviar o erro para um serviço de monitoramento
    console.error("Erro capturado pelo Error Boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[200px] p-6 bg-slate-900 border border-red-500/30 rounded-3xl flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300 shadow-inner">
          <div className="bg-red-500/10 p-4 rounded-full mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-red-500 font-black uppercase tracking-widest text-sm mb-2">Falha no Módulo</h3>
          <p className="text-slate-400 text-xs mb-6 max-w-xs leading-relaxed">
            Ocorreu um erro interno ao renderizar esta parte da interface. O restante do sistema continua operante.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all shadow-md"
          >
            <RefreshCw className="w-3 h-3" /> Recarregar Módulo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}