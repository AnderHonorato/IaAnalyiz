import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';

const API_BASE_URL = 'http://localhost:3000';

export default function Register() {
  const [view, setView] = useState('register'); // 'register', 'verify'
  const [formData, setFormData] = useState({ nome: '', email: '', senha: '', codigo: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMsg('Conta criada!');
      setTimeout(() => { setMsg(''); setView('verify'); }, 1500);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: formData.email, codigo: formData.codigo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMsg('Verificado! Redirecionando para login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/> {error}</div>}
      {msg && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0"/> {msg}</div>}

      {view === 'register' && (
        <div className="animate-in fade-in zoom-in duration-300">
          <h3 className="text-white font-bold text-xl mb-6">Registrar Nova Conta</h3>
          <form onSubmit={handleRegister} className="space-y-4">
            <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</label><input required type="text" name="nome" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail</label><input required type="email" name="email" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
            <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label><input required type="password" name="senha" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 transition-all mt-8">{loading ? 'Criando...' : 'Registrar Conta'}</button>
            <Link to="/login" className="block text-center w-full text-xs text-slate-400 hover:text-white mt-6 transition-colors">Já tenho conta. Fazer Login</Link>
          </form>
        </div>
      )}

      {view === 'verify' && (
        <div className="animate-in fade-in zoom-in duration-300">
          <h3 className="text-white font-bold text-xl mb-2">Verificar E-mail</h3>
          <p className="text-xs text-slate-400 mb-6">Enviamos um código de 6 dígitos para o seu e-mail. (Para testes, olhe o terminal do backend).</p>
          <form onSubmit={handleVerify} className="space-y-4">
            <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código de Verificação</label><input required type="text" name="codigo" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-4 px-4 text-center text-2xl tracking-[0.5em] font-mono outline-none focus:border-blue-500 transition-all" maxLength="6" /></div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 mt-6 transition-all">Validar Código</button>
            <button type="button" onClick={() => setView('register')} className="w-full text-xs text-slate-400 hover:text-white mt-6 transition-colors">Voltar</button>
          </form>
        </div>
      )}
    </AuthLayout>
  );
}