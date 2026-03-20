import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Paperclip, Image as ImageIcon, Film, Sparkles, Minus } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function IaAnalyizChat() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'ia', content: 'Olá Master Admin! Eu sou a **IA Analyiz**, sua interface de inteligência multi-plataforma. Estou monitorando seus canais de venda. O que devemos analisar hoje?' }
  ]);
  
  const chatScrollRef = useRef(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    const currentHistory = [...chatMessages]; 
    
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: currentHistory })
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'ia', content: data.reply }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'ia', content: '⚠️ Erro ao se conectar com o servidor da IA Analyiz.' }]);
    } finally {
      setIsChatLoading(false);
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

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end max-w-[calc(100vw-32px)]">
      
      {/* Janela de Chat */}
      <div className={`w-[420px] max-w-full h-[600px] max-h-[calc(100vh-120px)] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] border border-slate-200 flex flex-col mb-4 overflow-hidden origin-bottom-right transition-all duration-500 cubic-bezier(0.19, 1, 0.22, 1) ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
        <div className="bg-[#1e293b] p-5 flex justify-between items-center text-white shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-4">
            <RobotGif size="sm" />
            <div>
              <p className="text-sm font-black uppercase tracking-widest leading-none">IA Analyiz</p>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-1">Status: Conectada</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
              <button className="hover:bg-white/10 p-2 rounded-xl transition-all"><Minus className="w-5 h-5" /></button>
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-red-500/20 p-2 rounded-xl transition-all"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div ref={chatScrollRef} className="flex-1 bg-slate-50/80 p-6 overflow-y-auto space-y-5 custom-scrollbar text-xs text-slate-700 leading-relaxed">
          {chatMessages.map((msg, index) => (
            <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'ia' && (
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`p-4 rounded-2xl shadow-sm max-w-[85%] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-tr-none not-italic' : 'bg-white border border-slate-200 rounded-tl-none italic'}`}>
                {formatText(msg.content)}
              </div>
            </div>
          ))}

          {isChatLoading && (
             <div className="flex gap-3">
               <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-md"><Sparkles className="w-4 h-4 text-white" /></div>
               <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm flex items-center gap-2">
                 <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                 <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
               </div>
             </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <div className="flex gap-2">
            <input 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)} 
              onKeyDown={handleKeyPress}
              placeholder="Comandar a IA Analyiz..." 
              className="flex-1 bg-slate-100 rounded-xl px-5 py-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium" 
            />
            <button onClick={handleSendChat} disabled={isChatLoading} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center shadow-md">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Botão Flutuante */}
      <div className="relative group">
          <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-semibold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-xl pointer-events-none whitespace-nowrap z-50">
              IA Analyiz Support
              <span className="absolute left-full top-1/2 -translate-y-1/2 border-8 border-l-slate-900 border-y-transparent border-r-transparent"></span>
          </div>
          
          <button 
              onClick={() => setIsChatOpen(!isChatOpen)} 
              className={`transition-all duration-300 hover:scale-110 active:scale-90 relative ${isChatOpen ? 'rotate-180 scale-0 opacity-0' : ''}`}
          >
              <RobotGif />
              {!isChatOpen && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative rounded-full h-5 w-5 bg-blue-600 border-2 border-white text-[8px] flex items-center justify-center text-white font-black">!</span>
                  </span>
              )}
          </button>
          
          <button 
              onClick={() => setIsChatOpen(!isChatOpen)} 
              className={`absolute bottom-0 right-0 h-16 w-16 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center text-slate-800 shadow-xl transition-all duration-300 ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
          >
               <X className="w-8 h-8" />
          </button>
      </div>
    </div>
  );
}