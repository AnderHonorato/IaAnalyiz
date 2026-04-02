/**
 * frontend/src/pages/Register.jsx
 * 
 * Propósito:
 * Página de criação de nova conta de utilizador.
 * Realiza cadastro com nome, email e senha.
 * 
 * Responsabilidades:
 * - Capturar dados de cadastro (nome, email, senha)
 * - Validar credenciais de registo
 * - Comunicar com backend (/api/auth/register)
 * - Redirecionar para login após sucesso
 * - Exibir mensagens de erro/sucesso
 * 
 * Estado:
 *   - formData: { nome, email, senha } - Dados de registo
 *   - error: Mensagem de erro
 *   - msg: Mensagem de sucesso
 *   - loading: Flag de carregamento
 * 
 * Fluxo:
 * 1. Utilizador preenche nome, email e senha
 * 2. handleRegister valida e envia para backend
 * 3. Conta é criada no banco de dados
 * 4. Redireciona para login após 2 segundos
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';

const API_BASE_URL = 'http://localhost:3000';

export default function Register() {
  // ╪═══════════════════════════════════════════════════════════════════════════
  // ESTADOS
  // ╪═══════════════════════════════════════════════════════════════════════════
  const [formData, setFormData] = useState({ nome: '', email: '', senha: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // ╪═══════════════════════════════════════════════════════════════════════════
  // MANIPULADORES DE EVENTOS
  // ╪═══════════════════════════════════════════════════════════════════════════
  
  /** Captura mudanças nos campos de entrada */
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  /** Processa submissão do formulário de registo */
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setLoading(true);
    try {
      // Envia dados de registo para backend
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMsg('Conta criada com sucesso! Redirecionando para login...');
      // Redireciona direto para o login já que não tem mais etapa de código
      setTimeout(() => navigate('/login'), 2000);
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
        <h3 className="text-white font-bold text-xl mb-6">Registrar Nova Conta</h3>
        <form onSubmit={handleRegister} className="space-y-4">
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</label><input required type="text" name="nome" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail</label><input required type="email" name="email" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label><input required type="password" name="senha" onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 text-white rounded-xl py-3 px-4 text-sm outline-none focus:border-blue-500 transition-all" /></div>
          <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 transition-all mt-8">{loading ? 'Criando...' : 'Registrar Conta'}</button>
          <Link to="/login" className="block text-center w-full text-xs text-slate-400 hover:text-white mt-6 transition-colors">Já tenho conta. Fazer Login</Link>
        </form>
      </div>
    </AuthLayout>
  );
}