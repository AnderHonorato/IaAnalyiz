import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Image as ImageIcon, Film, Sparkles, Maximize2, Minimize2 } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function IaAnalyizChat({ isChatOpen, toggleChat, onLog }) {
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [chatMessages, setChatMessages] = useState(() => {
    const saved = localStorage.getItem('ia_analyiz_memory');
    return saved ? JSON.parse(saved) : [
      { role: 'ia', content: 'Olá Master Admin! Eu sou a **IA Analyiz**, sua inteligência multi-plataforma. Meu banco de memória está ativo. O que analisaremos hoje?' }
    ];
  });
  
  const chatScrollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('ia_analyiz_memory', JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading, isExpanded]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    
    const userMessage = chatInput;
    const currentHistory = [...chatMessages]; 
    
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput("");
    setIsChatLoading(true); // BLOQUEIA O INPUT

    if (onLog) {
      onLog(`[IA_Analyiz] Requisitando análise: "${userMessage.substring(0, 30)}..."`, 'info');
      onLog(`[IA_Analyiz] Sincronizando contexto com o Kernel do Gemini e Database...`, 'info');
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: currentHistory })
      });
      const data = await res.json();
      
      setChatMessages(prev => [...prev, { role: 'ia', content: data.reply }]);
      if (onLog) onLog(`[IA_Analyiz] ✅ Resposta recebida e processada com sucesso.`, 'success');
      
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'ia', content: '⚠️ Erro ao se conectar com o servidor da IA Analyiz.' }]);
      if (onLog) onLog(`[IA_Analyiz] ❌ Falha crítica de conexão.`, 'error');
    } finally {
      setIsChatLoading(false); // LIBERA O INPUT
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSendChat();
  };

  const formatText = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-black text-blue-600">{part.slice(2, -2)}</strong>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  const RobotGif = ({ size = "md" }) => {
    const gifUrl = "https://i.ibb.co/3pY8D0n/robot-chat.gif";
    return (
      <div className={`${size === "sm" ? 'h-10 w-10' : 'h-16 w-16'} rounded-full flex items-center justify-center relative shadow-inner shrink-0 overflow-hidden bg-white`}>
        <img src={gifUrl} alt="IA Analyiz" className="w-full h-full object-cover scale-[1.2]" />
      </div>
    );
  };

  const chatSizeClasses = isExpanded 
    ? "w-[600px] h-[750px] max-w-[85vw] max-h-[85vh]"
    : "w-[320px] h-[550px] max-h-[80vh]"; 

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end max-w-[calc(100vw-32px)]">
      <div className={`${chatSizeClasses} bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.25)] border border-slate-200 flex flex-col mb-4 overflow-hidden origin-bottom-right transition-all duration-500 cubic-bezier(0.19, 1, 0.22, 1) ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
        <div className="bg-[#1e293b] p-4 flex justify-between items-center text-white shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <RobotGif size="sm" />
            <div>
              <p className="text-sm font-black uppercase tracking-widest leading-none">IA Analyiz</p>
              <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mt-1">{isChatLoading ? 'Analisando Banco...' : 'Status: Conectada'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
              <button onClick={() => setIsExpanded(!isExpanded)} className="hover:bg-white/10 p-2 rounded-xl transition-all">
                {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
          </div>
        </div>

        <div ref={chatScrollRef} className="flex-1 bg-slate-50/80 p-5 overflow-y-auto space-y-5 custom-scrollbar text-xs text-slate-700 leading-relaxed">
          {chatMessages.map((msg, index) => (
            <div key={index} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'ia' && (
                <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md"><Sparkles className="w-3.5 h-3.5 text-white" /></div>
              )}
              <div className={`p-3.5 rounded-2xl shadow-sm max-w-[85%] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-tr-none not-italic' : 'bg-white border border-slate-200 rounded-tl-none italic'}`}>
                {formatText(msg.content)}
              </div>
            </div>
          ))}

          {isChatLoading && (
             <div className="flex gap-2.5">
               <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md"><Sparkles className="w-3.5 h-3.5 text-white" /></div>
               <div className="bg-white p-3.5 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                 <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                 <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
               </div>
             </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-200 bg-white shrink-0">
          <div className="flex gap-2">
            <input 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)} 
              onKeyDown={handleKeyPress}
              disabled={isChatLoading}
              placeholder={isChatLoading ? "IA Analyiz acessando o banco..." : "Comandar IA Analyiz..."} 
              className={`flex-1 bg-slate-100 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`} 
            />
            <button onClick={handleSendChat} disabled={isChatLoading} className={`bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center shadow-md ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}