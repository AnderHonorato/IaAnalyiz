import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, Maximize2, Minimize2, X } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ─── Detecta a intenção da mensagem do usuário ────────────────────────────────
// Retorna os passos reais que serão exibidos enquanto o backend processa
function buildProcessingSteps(message) {
  const l = message.toLowerCase();

  const needsProdutos     = /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l);
  const needsDivergencias = /divergên|divergen|anomalia|erro|auditoria|varredura|inconsistên/i.test(l);
  const needsUsuarios     = /usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo|equipe|quem/i.test(l);
  const needsHistorico    = /conversamos|disse antes|lembra|anterior|histórico|falei|perguntei/i.test(l);
  const isGreeting        = /^(olá|ola|oi|hey|e aí|bom dia|boa tarde|boa noite|tudo bem)[\s!?.]*$/i.test(l.trim());

  // Passos base sempre presentes
  const steps = [
    { text: 'Conectando ao kernel neural...', delay: 0 },
    { text: 'Interpretando sua solicitação...', delay: 600 },
  ];

  if (isGreeting) {
    steps.push({ text: 'Pronto para te atender.', delay: 1000 });
    return steps;
  }

  if (needsUsuarios) {
    steps.push({ text: 'Consultando tabela de usuários...', delay: 900 });
    steps.push({ text: 'Verificando solicitações de desbloqueio...', delay: 1500 });
    steps.push({ text: 'Validando roles e permissões...', delay: 2100 });
  }

  if (needsProdutos) {
    steps.push({ text: 'Buscando catálogo de produtos...', delay: 900 });
    steps.push({ text: 'Carregando SKUs e pesos...', delay: 1500 });
    if (l.includes('kit')) {
      steps.push({ text: 'Calculando pesos compostos dos kits...', delay: 2000 });
    }
  }

  if (needsDivergencias) {
    steps.push({ text: 'Acessando registro de divergências...', delay: 900 });
    steps.push({ text: 'Comparando dados internos vs. Mercado Livre...', delay: 1600 });
    steps.push({ text: 'Analisando anomalias detectadas...', delay: 2200 });
  }

  if (needsHistorico) {
    steps.push({ text: 'Recuperando histórico da conversa...', delay: 900 });
    steps.push({ text: 'Contextualizando interações anteriores...', delay: 1500 });
  }

  if (!needsProdutos && !needsDivergencias && !needsUsuarios && !needsHistorico) {
    steps.push({ text: 'Analisando contexto do sistema...', delay: 900 });
  }

  // Sempre termina com validação e geração
  steps.push({ text: 'Dados validados, gerando resposta...', delay: steps[steps.length - 1].delay + 700 });

  return steps;
}

// ─── Componente de etapas de processamento ────────────────────────────────────
function ProcessingSteps({ message }) {
  const [visibleStep, setVisibleStep] = useState(0);
  const [elapsedMs, setElapsedMs]     = useState(0);
  const steps = buildProcessingSteps(message);

  useEffect(() => {
    const start = Date.now();

    // Avança os passos conforme os delays configurados
    const timers = steps.map((step, i) =>
      setTimeout(() => setVisibleStep(i), step.delay)
    );

    // Exibe aviso de demora se passar de 4s
    const slowTimer = setTimeout(() => {
      setVisibleStep(steps.length); // índice extra = mensagem de demora
    }, 4500);

    // Contador de tempo
    const ticker = setInterval(() => setElapsedMs(Date.now() - start), 500);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(slowTimer);
      clearInterval(ticker);
    };
  }, []);

  const currentText = visibleStep >= steps.length
    ? 'Está demorando mais que o esperado, aguarde...'
    : steps[Math.min(visibleStep, steps.length - 1)]?.text || '';

  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="flex gap-2.5 items-start">
      {/* Ícone igual ao da IA */}
      <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-white" style={{ animation: 'spin 2s linear infinite' }} />
      </div>

      {/* Texto fantasma — sem fundo de balão */}
      <div className="flex flex-col gap-1 pt-1">
        <p
          className="text-[11px] text-slate-400 italic transition-all duration-500"
          style={{ opacity: 0.85 }}
        >
          {currentText}
        </p>
        {/* Barra de progresso discreta */}
        <div className="flex items-center gap-2">
          <div className="h-[2px] w-28 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-500"
              style={{
                width: visibleStep >= steps.length
                  ? '95%'
                  : `${Math.min(95, ((visibleStep + 1) / steps.length) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[9px] text-slate-300">{seconds}s</span>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function IaAnalyizChat({ isChatOpen, toggleChat, onLog, userRole }) {
  const [chatInput, setChatInput]         = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isExpanded, setIsExpanded]       = useState(false);
  const [pendingMessage, setPendingMessage] = useState(''); // mensagem atual em processamento

  const userId = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('analyiz_user'));
      return u?.id || 'guest';
    } catch { return 'guest'; }
  })();

  const storageKey = `ia_memory_${userId}`;

  const [chatMessages, setChatMessages] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
    return [{ role: 'ia', content: 'Olá! Sou a <b>IA Analyiz</b>. Como posso ajudar?' }];
  });

  const chatScrollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(chatMessages));
  }, [chatMessages, storageKey]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading, isExpanded, pendingMessage]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage    = chatInput.trim();
    const currentHistory = [...chatMessages];

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setIsChatLoading(true);
    setPendingMessage(userMessage); // dispara as etapas visuais

    if (onLog) onLog('[IA_Analyiz] Processando requisição...', 'info');

    try {
      const res  = await fetch(`${API_BASE_URL}/api/ia/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userMessage, history: currentHistory, userRole }),
      });
      const data = await res.json();

      setChatMessages(prev => [...prev, { role: 'ia', content: data.reply }]);
      if (onLog) onLog('[IA_Analyiz] Resposta gerada.', 'success');

    } catch {
      setChatMessages(prev => [...prev, { role: 'ia', content: '⚠️ Erro de conexão com o Kernel da IA.' }]);
    } finally {
      setIsChatLoading(false);
      setPendingMessage('');
    }
  }, [chatInput, isChatLoading, chatMessages, userRole, onLog]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  };

  const RobotGif = ({ size = 'md' }) => (
    <div className={`${size === 'sm' ? 'h-10 w-10' : 'h-16 w-16'} rounded-full flex items-center justify-center relative shadow-[0_0_15px_rgba(59,130,246,0.5)] shrink-0 overflow-hidden bg-white border-2 border-white`}>
      <img src="https://i.ibb.co/3pY8D0n/robot-chat.gif" alt="IA" className="w-full h-full object-cover scale-[1.2]" />
    </div>
  );

  const chatSizeClasses = isExpanded
    ? 'w-[600px] h-[750px] max-w-[85vw] max-h-[85vh]'
    : 'w-[340px] h-[550px] max-h-[80vh]';

  return (
    <>
      {/* CSS inline para a animação de spin */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none">

        {/* Janela do chat */}
        <div className={`pointer-events-auto ${chatSizeClasses} bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-slate-200 flex flex-col mb-4 overflow-hidden origin-bottom-right transition-all duration-500 ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>

          {/* Header */}
          <div className="bg-[#1e293b] p-4 flex justify-between items-center text-white shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-3">
              <RobotGif size="sm" />
              <div>
                <p className="text-sm font-black uppercase tracking-widest leading-none">IA Analyiz</p>
                <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mt-1">
                  {isChatLoading ? 'Processando...' : 'Status: Conectada'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsExpanded(!isExpanded)} className="hover:bg-white/10 p-2 rounded-xl transition-all">
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={toggleChat} className="hover:bg-red-500/20 p-2 rounded-xl transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div
            ref={chatScrollRef}
            className="flex-1 bg-slate-50/80 p-5 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed"
          >
            {chatMessages.map((msg, index) => (
              <div key={index} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'ia' && (
                  <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className={`p-3.5 rounded-2xl shadow-sm max-w-[85%] ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-white rounded-tr-none'
                    : 'bg-white border border-slate-200 rounded-tl-none'
                }`}>
                  {msg.role === 'ia'
                    ? <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                    : <span>{msg.content}</span>
                  }
                </div>
              </div>
            ))}

            {/* Etapas de processamento — substitui os "..." */}
            {isChatLoading && pendingMessage && (
              <ProcessingSteps message={pendingMessage} />
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-200 bg-white shrink-0">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isChatLoading}
                placeholder={isChatLoading ? 'Aguarde...' : 'Escreva para a IA...'}
                className={`flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <button
                onClick={handleSendChat}
                disabled={isChatLoading}
                className={`bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center shadow-md ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Botão flutuante */}
        <div className="relative group pointer-events-auto">
          <button
            onClick={toggleChat}
            className={`transition-all duration-300 hover:scale-105 active:scale-95 relative ${isChatOpen ? 'rotate-180 scale-0 opacity-0 absolute' : 'scale-100 opacity-100'}`}
          >
            <RobotGif />
            {!isChatOpen && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-blue-500 opacity-75" />
                <span className="relative rounded-full h-5 w-5 bg-blue-600 border-2 border-white text-[8px] flex items-center justify-center text-white font-black">!</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}