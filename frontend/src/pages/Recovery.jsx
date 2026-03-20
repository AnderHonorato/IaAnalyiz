import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';

const API_BASE_URL = 'http://localhost:3000';

export default function Recovery() {
  const [view, setView] = useState('forgot'); // 'forgot', 'reset'
  const [formData, setFormData] = useState({ email: '', codigo: '', novaSenha: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleForgot = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: formData.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMsg('Código enviado!');
      setTimeout(() => { setMsg(''); setView('reset'); }, 1500);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMsg('Senha alterada com sucesso!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/> {error}</div>}
      {msg && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0"/> {msg}</div>}

      {view === 'forgot' && (
        <div className="animate-in fade-in zoom-in duration-300">
          <h3 className="text-white font-bold text-xl mb-6">Recuperar Senha</h3>
          
          <div className="bg-amber-500/10 border border-amber-500/50 p-4 rounded-xl flex items-start gap-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Módulo em Desenvolvimento</p>
              <p className="text-xs text-amber-500/80 leading-relaxed">A integração com o servidor de e-mails SMTP ainda está sendo configurada pelo Admin. O código gerado será exibido temporariamente apenas nos logs do terminal do Backend.</p>
            </div>
          </div>

          <form onSubmit={handleForgot} className="space-y-4">
            <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail Cadastrado</label><input required type="email" name="email" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" placeholder="seu@email.com" /></div>
            <button type="submit" disabled={loading} className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 mt-6 transition-all">Enviar Código de Recuperação</button>
            <Link to="/login" className="block text-center w-full text-xs text-slate-400 hover:text-white mt-6 transition-colors">Lembrei a senha. Voltar</Link>
          </form>
        </div>
      )}

      {view === 'reset' && (
        <div className="animate-in fade-in zoom-in duration-300">
           <h3 className="text-white font-bold text-xl mb-6">Definir Nova Senha</h3>
          <form onSubmit={handleReset} className="space-y-4">
            <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código Recebido</label><input required type="text" name="codigo" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-lg font-mono tracking-[0.3em] text-center outline-none focus:border-blue-500 transition-all" maxLength="6"/></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nova Senha</label><input required type="password" name="novaSenha" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 mt-8 transition-all">Salvar Nova Senha</button>
          </form>
        </div>
      )}
    </AuthLayout>
  );
}