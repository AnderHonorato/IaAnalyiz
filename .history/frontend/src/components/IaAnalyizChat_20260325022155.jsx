import React, { useState, useEffect, useRef } from 'react';
import { Send, Maximize2, Minimize2, X, MessageSquare, Bot } from 'lucide-react';
import ChatHeader from './chat/ChatHeader';
import ChatInput from './chat/ChatInput';
import ThinkingPanel from './IaThinkingPanel';

export default function IaAnalyizChat({ isChatOpen, toggleChat, userRole }) {
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chatScrollRef = useRef(null);

  // Escuta o evento para forçar tela cheia (vindo da Home ou Sidebar)
  useEffect(() => {
    const handleForceFullscreen = () => setIsFullscreen(true);
    window.addEventListener('force-chat-fullscreen', handleForceFullscreen);
    return () => window.removeEventListener('force-chat-fullscreen', handleForceFullscreen);
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatLoading]);

  const handleSend = async () => {
    if (!chatInput.trim()) return;
    
    const newMsg = { id: Date.now(), text: chatInput, sender: 'user' };
    setMessages(prev => [...prev, newMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      // Chamada segura para o seu backend (Node.js), NUNCA direto para o Gemini
      const res = await fetch('http://localhost:3000/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMsg.text })
      });
      const data = await res.json();
      
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        text: data.reply || 'Sem resposta', 
        sender: 'ia',
        isHtml: true // Flag para renderizar a formatação corrigida
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now() + 1, text: 'Erro ao conectar com o servidor.', sender: 'ia' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Ícone Flutuante (Corrigido para Light/Dark Mode)
  if (!isChatOpen) {
    return (
      <button 
        onClick={toggleChat}
        className="fixed bottom-6 right-6 p-4 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 z-[9999] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 group"
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-20 group-hover:opacity-40 transition-opacity blur-md" />
        <MessageSquare className="w-7 h-7 text-indigo-600 dark:text-indigo-400 relative z-10" />
      </button>
    );
  }

  return (
    <div className={`fixed z-[9999] transition-all duration-300 ease-in-out shadow-2xl flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700
      ${isFullscreen ? 'inset-4 rounded-3xl' : 'bottom-6 right-6 w-[400px] h-[600px] rounded-2xl'}`}
    >
      <ChatHeader 
        isFullscreen={isFullscreen} 
        setIsFullscreen={setIsFullscreen} 
        toggleChat={toggleChat} 
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={chatScrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed
              ${msg.sender === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-sm' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-slate-200 dark:border-slate-700'}`}
            >
              {msg.isHtml ? (
                <div dangerouslySetInnerHTML={{ __html: msg.text }} className="html-content" />
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        {isChatLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-bl-sm border border-slate-200 dark:border-slate-700">
              <span className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
      </div>

      <ChatInput 
        chatInput={chatInput} 
        setChatInput={setChatInput} 
        handleSend={handleSend} 
        isChatLoading={isChatLoading} 
      />
    </div>
  );
}