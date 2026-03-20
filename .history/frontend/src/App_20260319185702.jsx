import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, PlayCircle, AlertTriangle, RefreshCw, Activity, ZoomIn, ZoomOut, User, ExternalLink, Loader2, PackagePlus, Plus, Box, Search,
  ShoppingBag, ShoppingCart, ChevronDown, Lock, Mail, ChevronRight, CheckCircle2, Sparkles, ShieldCheck
} from 'lucide-react';
import IaAnalyizChat from './components/IaAnalyizChat';

const API_BASE_URL = 'http://localhost:3000';

// ==========================================
// COMPONENTE DE AUTENTICAÇÃO (NOVO LAYOUT SPLIT)
// ==========================================
function AuthScreens({ onLoginSuccess }) {
  const [view, setView] = useState('login'); // 'login', 'register', 'verify', 'forgot', 'reset'
  const [formData, setFormData] = useState({ nome: '', email: '', senha: '', codigo: '', novaSenha: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e, endpoint, nextView, successMsg) => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      if (endpoint === 'login') {
        localStorage.setItem('analyiz_token', data.token);
        localStorage.setItem('analyiz_user', JSON.stringify(data.user));
        onLoginSuccess();
      } else {
        setMsg(data.message || successMsg);
        if (nextView) setTimeout(() => setView(nextView), 2000);
      }
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen w-full bg-[#0f172a] flex font-sans">
      
      {/* LADO ESQUERDO: INFORMAÇÕES E BOAS VINDAS (Oculto no Mobile) */}
      <div className="hidden lg:flex flex-col justify-center w-1/2 p-16 bg-slate-950 border-r border-slate-800 relative overflow-hidden">
        
        {/* Efeitos de Fundo */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-4 mb-10">
            <div className="bg-blue-600 p-3.5 rounded-2xl shadow-lg shadow-blue-900/50"><Activity className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-4xl font-black text-white italic tracking-tighter leading-none">IA Analyiz</h1>
              <p className="text-blue-400 font-bold uppercase tracking-widest text-xs mt-1">Core Systems</p>
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white mb-8 leading-tight">
            Auditoria logística inteligente para seu e-commerce.
          </h2>
          
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-blue-400 mt-1 shadow-sm"><Box className="w-5 h-5" /></div>
              <div>
                <h3 className="text-white font-bold mb-1.5 text-lg">Integração Multi-Canal</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Sincronize Mercado Livre, Shopee e Amazon. Escaneie todo o seu catálogo em busca de divergências de peso que causam prejuízos no frete.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-emerald-400 mt-1 shadow-sm"><Sparkles className="w-5 h-5" /></div>
              <div>
                <h3 className="text-white font-bold mb-1.5 text-lg">Assistente Neural IA</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Converse em tempo real com a inteligência artificial. Ela acessa seu banco de dados e gera relatórios instantâneos sobre os erros e saúde da conta.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-amber-400 mt-1 shadow-sm"><ShieldCheck className="w-5 h-5" /></div>
              <div>
                <h3 className="text-white font-bold mb-1.5 text-lg">Ambiente Seguro</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Seus dados e credenciais de API ficam protegidos em um Kernel próprio com criptografia de ponta a ponta.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LADO DIREITO: FORMULÁRIOS DE AUTENTICAÇÃO */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="bg-[#1e293b] p-8 sm:p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-700 relative z-10">
          
          {/* Logo para versão Mobile (Oculto no Desktop) */}
          <div className="lg:hidden flex flex-col items-center justify-center mb-8">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg mb-4"><Activity className="w-6 h-6 text-white" /></div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter">IA Analyiz</h1>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/> {error}</div>}
          {msg && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0"/> {msg}</div>}

          {view === 'login' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <h3 className="text-white font-bold text-xl mb-6">Acesso ao Painel</h3>
              <form onSubmit={(e) => handleSubmit(e, 'login', null, null)} className="space-y-4">
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail</label><div className="relative mt-1"><Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" /><input required type="email" name="email" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500 transition-all" /></div></div>
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label><div className="relative mt-1"><Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" /><input required type="password" name="senha" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500 transition-all" /></div></div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-all flex justify-center items-center gap-2 mt-8 shadow-lg shadow-blue-500/20">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Kernel'} <ChevronRight className="w-4 h-4"/></button>
                <div className="flex justify-between mt-6 text-xs text-slate-400 font-medium">
                  <button type="button" onClick={() => setView('forgot')} className="hover:text-blue-400 transition-colors">Esqueci a senha</button>
                  <button type="button" onClick={() => setView('register')} className="hover:text-blue-400 transition-colors">Criar conta</button>
                </div>
              </form>
            </div>
          )}

          {view === 'register' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <h3 className="text-white font-bold text-xl mb-6">Registrar Nova Conta</h3>
              <form onSubmit={(e) => handleSubmit(e, 'register', 'verify', 'Conta criada!')} className="space-y-4">
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</label><input required type="text" name="nome" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail</label><input required type="email" name="email" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label><input required type="password" name="senha" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
                <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 transition-all mt-8">{loading ? 'Criando...' : 'Registrar Conta'}</button>
                <button type="button" onClick={() => setView('login')} className="w-full text-xs text-slate-400 hover:text-white mt-6 transition-colors">Já tenho conta. Fazer Login</button>
              </form>
            </div>
          )}

          {view === 'verify' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <h3 className="text-white font-bold text-xl mb-2">Verificar E-mail</h3>
              <p className="text-xs text-slate-400 mb-6">Enviamos um código de 6 dígitos para o seu e-mail. (Para testes, olhe o terminal do backend).</p>
              <form onSubmit={(e) => handleSubmit(e, 'verify', 'login', 'Verificado! Faça login.')} className="space-y-4">
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código de Verificação</label><input required type="text" name="codigo" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-4 px-4 text-center text-2xl tracking-[0.5em] font-mono outline-none focus:border-blue-500 transition-all" maxLength="6" /></div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 mt-6 transition-all">Validar Código</button>
                <button type="button" onClick={() => setView('login')} className="w-full text-xs text-slate-400 hover:text-white mt-6 transition-colors">Voltar para Login</button>
              </form>
            </div>
          )}

          {view === 'forgot' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <h3 className="text-white font-bold text-xl mb-6">Recuperar Senha</h3>
              
              {/* --- AVISO DE DESENVOLVIMENTO (COMO SOLICITADO) --- */}
              <div className="bg-amber-500/10 border border-amber-500/50 p-4 rounded-xl flex items-start gap-3 mb-6">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Módulo em Desenvolvimento</p>
                  <p className="text-xs text-amber-500/80 leading-relaxed">A integração com o servidor de e-mails SMTP ainda está sendo configurada pelo Admin. Se você gerar um código agora, ele será exibido temporariamente apenas nos logs do terminal do Backend.</p>
                </div>
              </div>

              <form onSubmit={(e) => handleSubmit(e, 'forgot-password', 'reset', 'Código enviado!')} className="space-y-4">
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail Cadastrado</label><input required type="email" name="email" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" placeholder="seu@email.com" /></div>
                <button type="submit" disabled={loading} className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 mt-6 transition-all">Enviar Código de Recuperação</button>
                <button type="button" onClick={() => setView('login')} className="w-full text-xs text-slate-400 hover:text-white mt-6 transition-colors">Lembrei a senha. Voltar</button>
              </form>
            </div>
          )}

          {view === 'reset' && (
            <div className="animate-in fade-in zoom-in duration-300">
               <h3 className="text-white font-bold text-xl mb-6">Definir Nova Senha</h3>
              <form onSubmit={(e) => handleSubmit(e, 'reset-password', 'login', 'Senha alterada com sucesso!')} className="space-y-4">
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código Recebido</label><input required type="text" name="codigo" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-lg font-mono tracking-[0.3em] text-center outline-none focus:border-blue-500 transition-all" maxLength="6"/></div>
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nova Senha</label><input required type="password" name="novaSenha" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
                <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 mt-8 transition-all">Salvar Nova Senha</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ==========================================
// SISTEMA PRINCIPAL (Painel Protegido)
// ==========================================
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('analyiz_token'));
  
  const [zoom, setZoom] = useState(1);
  const [activeMarketplace, setActiveMarketplace] = useState('ml');
  const [activeTab, setActiveTab] = useState('bot'); 
  const [isPlatformMenuOpen, setIsPlatformMenuOpen] = useState(false);
  const platformMenuRef = useRef(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('IDLE');
  const [logs, setLogs] = useState([{ msg: 'KERNEL_READY: IA Analyiz inicializada.', type: 'info' }]);
  const [divergencias, setDivergencias] = useState([]);
  
  const [produtos, setProdutos] = useState([]);
  const [formProd, setFormProd] = useState({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
  const [loadingProd, setLoadingProd] = useState(false);
  const terminalRef = useRef(null);

  useEffect(() => { document.title = "IA Analyiz | Painel Multi-Canal"; }, []);

  const handleLogout = () => {
    localStorage.removeItem('analyiz_token');
    localStorage.removeItem('analyiz_user');
    setIsAuthenticated(false);
  };

  useEffect(() => {
    if (isAuthenticated && activeMarketplace === 'ml') {
      buscarDivergencias(); buscarProdutos();
    }
  }, [activeMarketplace, isAuthenticated]);

  const buscarDivergencias = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/divergencias`);
      setDivergencias(await res.json());
    } catch (e) {}
  };

  const buscarProdutos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/produtos`);
      setProdutos(await res.json());
    } catch (e) {}
  };

  const iniciarBot = () => {
    setIsBotRunning(true); setProgress(0); setLogs([]); setTimeLeft('CALCULANDO...');
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream`);
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.msg) setLogs(prev => [...prev, { msg: data.msg, type: data.type }]);
      if (data.type === 'progress') { setProgress(data.percent); setTimeLeft(data.timeLeft); }
      if (data.type === 'done') { setIsBotRunning(false); eventSource.close(); buscarDivergencias(); }
    };
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setLoadingProd(true);
    try {
      await fetch(`${API_BASE_URL}/api/produtos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formProd)
      });
      setFormProd({ sku: '', nome: '', preco: '', pesoGramas: '', mlItemId: '', eKit: false });
      buscarProdutos();
    } finally { setLoadingProd(false); }
  };

  const handleIaLog = (msg, type) => setLogs(prev => [...prev, { msg, type }]);

  if (!isAuthenticated) {
    return <AuthScreens onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex flex-col font-sans text-slate-900 overflow-hidden relative" style={{ zoom: zoom }}>
      
      <style>{` @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animate-slide-down { animation: slideDown 0.2s ease-out forwards; } `}</style>

      <header className="bg-[#1e293b] border-b border-slate-700 p-4 shadow-xl shrink-0 z-30 relative">
        <div className="w-full max-w-7xl mx-auto flex justify-between items-center text-white">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><Activity className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-black uppercase italic tracking-tighter">IA Analyiz <span className="text-blue-400">Core</span></h1>
            </div>
          </div>
          
          <nav className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
            <button onClick={() => setActiveTab('bot')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'bot' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Scanner</button>
            <button onClick={() => setActiveTab('produtos')} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'produtos' ? 'bg-blue-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}>Database</button>
          </nav>
          
          <div className="flex items-center gap-4">
            <div className="relative" onMouseEnter={() => setIsPlatformMenuOpen(true)} onMouseLeave={() => setIsPlatformMenuOpen(false)}>
              <button className={`flex items-center gap-2 border px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${isPlatformMenuOpen ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white'}`}>
                <span>Plataforma</span><ChevronDown className="w-3.5 h-3.5" />
              </button>
              {isPlatformMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] animate-slide-down overflow-hidden">
                  <button onClick={() => setActiveMarketplace('ml')} className="w-full flex px-4 py-3 hover:bg-blue-50 text-xs font-bold text-slate-700 border-b border-slate-50"><ShoppingBag className="w-4 h-4 mr-2 text-[#FFE600]"/> Mercado Livre</button>
                  <button onClick={() => setActiveMarketplace('shopee')} className="w-full flex px-4 py-3 hover:bg-orange-50 text-xs font-bold text-slate-700 border-b border-slate-50"><ShoppingCart className="w-4 h-4 mr-2 text-[#EE4D2D]"/> Shopee</button>
                  <button onClick={() => setActiveMarketplace('amazon')} className="w-full flex px-4 py-3 hover:bg-yellow-50 text-xs font-bold text-slate-700"><Box className="w-4 h-4 mr-2 text-[#FF9900]"/> Amazon</button>
                </div>
              )}
            </div>

            <button onClick={handleLogout} className="h-10 w-10 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors shadow-inner" title="Sair do Sistema">
              <User className="text-red-400 w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO */}
      <div className="flex-1 flex flex-col p-6 w-full max-w-7xl mx-auto h-full min-h-0 relative z-10">
        {activeMarketplace !== 'ml' ? (
           <div className="flex-1 flex items-center justify-center flex-col text-slate-400">
              <Activity className="w-16 h-16 mb-4 opacity-20 animate-pulse" />
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-300">Integração em Desenvolvimento</h2>
           </div>
        ) : activeTab === 'bot' ? (
          <main className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
             <section className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="p-5 flex flex-col flex-1 min-h-0">
                <button onClick={iniciarBot} disabled={isBotRunning} className={`w-full py-4 rounded-lg font-black text-xs uppercase tracking-widest mb-4 transition-all ${isBotRunning ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-lg'}`}>
                  {isBotRunning ? 'SINCRONIZANDO API ML...' : 'EXECUTAR PROTOCOLO'}
                </button>
                <div ref={terminalRef} className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-[10px] overflow-y-auto custom-scrollbar flex flex-col gap-2">
                  {logs.map((log, i) => (<div key={i} className={log.type === 'warn' ? 'text-amber-500' : log.type === 'success' ? 'text-emerald-500' : 'text-slate-400'}><span className="mr-2">[{new Date().toLocaleTimeString()}]</span>{log.msg}</div>))}
                </div>
              </div>
            </section>

            <section className="col-span-3 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 font-black text-xs uppercase text-slate-400 flex justify-between items-center"><AlertTriangle className="text-amber-500 w-4 h-4" /> Inconsistências</div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100 text-xs italic">
                      {divergencias.map((div) => (
                        <tr key={div.id} className="hover:bg-blue-50/50">
                          <td className="py-4 px-6 font-bold text-blue-600">{div.mlItemId}</td><td className="py-4 px-6">"{div.motivo}"</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </section>
          </main>
        ) : (
          <div className="text-center text-slate-400">Área de Banco de Dados</div>
        )}
      </div>

      <IaAnalyizChat isChatOpen={isChatOpen} toggleChat={() => setIsChatOpen(!isChatOpen)} onLog={handleIaLog} />
    </div>
  );
}