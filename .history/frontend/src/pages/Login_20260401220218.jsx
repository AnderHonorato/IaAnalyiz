/**
 * frontend/src/pages/Login.jsx
 * 
 * Propósito:
 * Página de autenticação para acesso ao painel de controle do Bot ML.
 * Realiza login de usuários com credenciais (email/senha).
 * 
 * Responsabilidades:
 * - Capturar e validar credenciais de login
 * - Comunicar com backend (/api/auth/login)
 * - Armazenar token e dados do usuário em localStorage
 * - Redirecionar para Home após autenticação bem-sucedida
 * - Exibir mensagens de erro/sucesso
 * 
 * Estado:
 *   - formData: { email, senha } - Credenciais do usuário
 *   - error: Mensagem de erro da validação
 *   - msg: Mensagem de sucesso
 *   - loading: Flag de carregamento (requisição em andamento)
 * 
 * Fluxo:
 * 1. Usuário preenche email e senha
 * 2. handleSubmit valida e envia para backend
 * 3. Backend retorna token e dados do usuário
 * 4. Token e user são persistidos em localStorage
 * 5. Redirecionamento para Home (/)
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ChevronRight, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';
const API_BASE_URL = 'http://localhost:3000';

export default function Login() {
  // ╪═══════════════════════════════════════════════════════════════════════════
  // ESTADOS
  // ╪═══════════════════════════════════════════════════════════════════════════
  const [formData, setFormData] = useState({ email: '', senha: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // ╪═══════════════════════════════════════════════════════════════════════════
  // MANIPULADORES DE EVENTOS
  // ╪═══════════════════════════════════════════════════════════════════════════
  
  /** Captura mudanças nos campos de entrada */
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  /** Processa submissão do formulário de login */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      // Envia credenciais para backend
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Persiste token e dados do usuário
      localStorage.setItem('analyiz_token', data.token);
      localStorage.setItem('analyiz_user', JSON.stringify(data.user));
      navigate('/'); // Redireciona para a Home
    } catch (err) { 
      setError(err.message); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <AuthLayout>
      {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/> {error}</div>}
      {msg && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3.5 rounded-xl text-xs font-bold mb-6 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0"/> {msg}</div>}

      <div className="animate-in fade-in zoom-in duration-300">
        <h3 className="text-white font-bold text-xl mb-6">Acesso ao Painel</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail</label><div className="relative mt-1"><Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" /><input required type="email" name="email" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500 transition-all" /></div></div>
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label><div className="relative mt-1"><Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" /><input required type="password" name="senha" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500 transition-all" /></div></div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-all flex justify-center items-center gap-2 mt-8 shadow-lg shadow-blue-500/20">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Kernel'} <ChevronRight className="w-4 h-4"/></button>
          <div className="flex justify-between mt-6 text-xs text-slate-400 font-medium">
            <Link to="/recuperacao" className="hover:text-blue-400 transition-colors">Esqueci a senha</Link>
            <Link to="/cadastro" className="hover:text-blue-400 transition-colors">Criar conta</Link>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}