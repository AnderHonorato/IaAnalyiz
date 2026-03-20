import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Maximize2, Minimize2, X, Paperclip, Image as ImageIcon, Film } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function IaAnalyizChat({ isChatOpen, toggleChat, onLog, userRole }) {
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Isola a conversa usando o ID do usuário como chave
  const userId = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('analyiz_user'));
      return u?.id || 'guest';
    } catch(e) { return 'guest'; }
  })();

  const storageKey = `ia_memory_${userId}`;

  const [chatMessages, setChatMessages] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
    return [{ role: 'ia', content: 'Olá! Eu sou a **IA Analyiz**, sua inteligência multi-plataforma. Como posso ajudar?' }];
  });
  
  const chatScrollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(chatMessages));
  }, [chatMessages, storageKey]);

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
    setIsChatLoading(true);

    if (onLog) onLog(`[IA_Analyiz] Processando requisição...`, 'info');

    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: currentHistory, userRole: userRole })
      });
      const data = await res.json();
      
      setChatMessages(prev => [...prev, { role: 'ia', content: data.reply }]);
      if (onLog) onLog(`[IA_Analyiz] Resposta gerada pelo Kernel.`, 'success');
      
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'ia', content: '⚠️ Erro de conexão com o Kernel da IA.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleKeyPress = (e) => { if (e.key === 'Enter') handleSendChat(); };

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
      <div className={`${size === "sm" ? 'h-10 w-10' : 'h-16 w-16'} rounded-full flex items-center justify-center relative shadow-[0_0_15px_rgba(59,130,246,0.5)] shrink-0 overflow-hidden bg-white border-2 border-white`}>
        <img src={gifUrl} alt="IA Analyiz" className="w-full h-full object-cover scale-[1.2]" />
      </div>
    );
  };

  const chatSizeClasses = isExpanded 
    ? "w-[600px] h-[750px] max-w-[85vw] max-h-[85vh]"
    : "w-[340px] h-[550px] max-h-[80vh]"; 

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none">
      <div className={`pointer-events-auto ${chatSizeClasses} bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-slate-200 flex flex-col mb-4 overflow-hidden origin-bottom-right transition-all duration-500 cubic-bezier(0.19, 1, 0.22, 1) ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
        <div className="bg-[#1e293b] p-4 flex justify-between items-center text-white shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <RobotGif size="sm" />
            <div>
              <p className="text-sm font-black uppercase tracking-widest leading-none">IA Analyiz</p>
              <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mt-1">{isChatLoading ? 'Acessando Kernel...' : 'Status: Conectada'}</p>
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

        <div ref={chatScrollRef} className="flex-1 bg-slate-50/80 p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs text-slate-700 leading-relaxed">
          {chatMessages.map((msg, index) => (
            <div key={index} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'ia' && (
                <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
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
              placeholder={isChatLoading ? "Aguarde..." : "Escreva para a IA..."} 
              className={`flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`} 
            />
            <button onClick={handleSendChat} disabled={isChatLoading} className={`bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center shadow-md ${isChatLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative group pointer-events-auto">
          <button onClick={toggleChat} className={`transition-all duration-300 hover:scale-105 active:scale-95 relative ${isChatOpen ? 'rotate-180 scale-0 opacity-0 absolute' : 'scale-100 opacity-100'}`}>
              <RobotGif />
              {!isChatOpen && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                    <span className="relative rounded-full h-5 w-5 bg-blue-600 border-2 border-white text-[8px] flex items-center justify-center text-white font-black">!</span>
                  </span>
              )}
          </button>
      </div>
    </div>
  );
}