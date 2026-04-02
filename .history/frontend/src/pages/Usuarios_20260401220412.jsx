/**
 * frontend/src/pages/Usuarios.jsx
 * 
 * Propósito:
 * Painel administrativo para gerenciar utilizadores do sistema.
 * Permite criar, listar, bloquear e alterar papéis (roles) de utilizadores.
 * Acesso restrito a OWNER.
 * 
 * Responsabilidades:
 * - Listar todos os utilizadores registados
 * - Filtrar por status (ativo/bloqueado)
 * - Criar novos utilizadores
 * - Alterar papel (role) de utilizadores
 * - Bloquear/desbloquear utilizadores
 * - Exibir informações de autenticação e status
 * - Cache de dados com refresh manual
 * 
 * Papéis (Roles) Suportados:
 *   - OWNER: Administrador completo
 *   - ADMIN: Administrador limitado
 *   - USER: Utilizador padrão
 *   - BLOCKED: Utilizador bloqueado
 * 
 * Funcionalidades:
 * - Tabela paginada de utilizadores
 * - Modal de criação de nova conta
 * - Filtro por status (Todos/Bloqueados)
 * - Alteração de role com confirmação
 * - Bloqueio/desbloqueio de contas
 * - Refresh manual de dados
 * - Email de utilizador exibido
 * 
 * Estado:
 *   - usuarios: Lista de utilizadores
 *   - filtro: Filtro ativo (TODOS/BLOQUEADOS)
 *   - loading: Flag de carregamento
 *   - showModal: Modal de criação visível
 *   - novoUser: Dados do novo utilizador
 * 
 * APIs:
 *   - GET /api/usuarios - Listar utilizadores
 *   - POST /api/usuarios - Criar utilizador
 *   - PUT /api/usuarios/:id/role - Alterar papel
 *   - PUT /api/usuarios/:id/block - Bloquear/desbloquear
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 * @requires OwnerRoute (acesso restrito)
 */

import React, { useState, useEffect } from 'react';
import { Users, Lock, ShieldCheck, CheckCircle2, AlertTriangle, Loader2, UserPlus, X, Mail } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [filtro, setFiltro] = useState('TODOS'); // 'TODOS' | 'BLOQUEADOS'
  const [loading, setLoading] = useState(true);
  
  // Estados do Modal de Criação de Usuário
  const [showModal, setShowModal] = useState(false);
  const [novoUser, setNovoUser] = useState({ nome: '', email: '', senha: '' });
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    buscarUsuarios();
  }, []);

  const buscarUsuarios = async () => {
    setLoading(true);
    try {
      // Adicionado cache: 'no-store' para garantir dados frescos do servidor
      const res = await fetch(`${API_BASE_URL}/api/usuarios`, { cache: 'no-store' });
      const data = await res.json();
      
      if (res.ok && Array.isArray(data)) {
        setUsuarios(data);
      } else {
        console.error("A API não retornou uma lista válida:", data);
        setUsuarios([]);
      }
    } catch (e) { 
      console.error("Erro na requisição:", e); 
      setUsuarios([]); 
    } finally { 
      setLoading(false); 
    }
  };

  const alterarCargo = async (id, novoCargo) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios/${id}/role`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: novoCargo })
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert('Erro ao alterar cargo: ' + (data.error || 'Erro desconhecido no servidor'));
        return;
      }
      
      buscarUsuarios(); // Atualiza a lista após alterar
    } catch (e) { 
      console.error(e); 
      alert('Erro de comunicação com o servidor ao tentar alterar o cargo.');
    }
  };

  const criarUsuario = async (e) => {
    e.preventDefault();
    setCriando(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoUser)
      });
      
      if (res.ok) {
        setShowModal(false);
        setNovoUser({ nome: '', email: '', senha: '' });
        buscarUsuarios();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao criar usuário');
      }
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      alert('Erro de conexão ao criar usuário.');
    } finally {
      setCriando(false);
    }
  };

  const usuariosFiltrados = filtro === 'BLOQUEADOS' 
    ? usuarios.filter(u => u.role === 'BLOQUEADO')
    : usuarios;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 lg:p-6 space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-xl"><Users className="w-6 h-6 text-emerald-600" /></div>
          Gestão de Usuários
        </h2>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex-1 sm:flex-none">
            <button onClick={() => setFiltro('TODOS')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[11px] font-bold uppercase transition-all ${filtro === 'TODOS' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}>Todos</button>
            <button onClick={() => setFiltro('BLOQUEADOS')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[11px] font-bold uppercase transition-all ${filtro === 'BLOQUEADOS' ? 'bg-red-50 text-red-700' : 'text-slate-500 hover:bg-slate-50'}`}>Bloqueados</button>
          </div>
          
          <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl shadow-md text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all shrink-0">
            <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">Novo Usuário</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                <tr>
                  <th className="p-4">Usuário</th>
                  <th className="p-4">Cargo Atual</th>
                  <th className="p-4">Status de Desbloqueio</th>
                  <th className="p-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {usuariosFiltrados.length === 0 ? (
                  <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">Nenhum usuário encontrado.</td></tr>
                ) : usuariosFiltrados.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 min-w-[200px]">
                      <p className="font-bold text-slate-800">{user.nome}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${user.role === 'OWNER' ? 'bg-blue-100 text-blue-700' : user.role === 'EMPRESARIO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {user.role === 'BLOQUEADO' ? (
                        user.solicitouDesbloqueio 
                          ? <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold"><AlertTriangle className="w-4 h-4"/> Solicitou Acesso</span>
                          : <span className="flex items-center gap-1.5 text-red-500 text-xs font-bold"><Lock className="w-4 h-4"/> Restrito</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold"><CheckCircle2 className="w-4 h-4"/> Liberado</span>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {user.role === 'BLOQUEADO' ? (
                        <button onClick={() => alterarCargo(user.id, 'EMPRESARIO')} className="bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ml-auto transition-colors">
                          <ShieldCheck className="w-3.5 h-3.5" /> Aprovar
                        </button>
                      ) : user.role === 'EMPRESARIO' ? (
                        <button onClick={() => alterarCargo(user.id, 'BLOQUEADO')} className="bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ml-auto transition-colors">
                          <Lock className="w-3.5 h-3.5" /> Bloquear
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Inalterável</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Criar Usuário */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" /> Criar Novo Usuário
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={criarUsuario} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nome Completo</label>
                <div className="relative">
                  <Users className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input required type="text" value={novoUser.nome} onChange={e => setNovoUser({...novoUser, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="Nome do membro" />
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input required type="email" value={novoUser.email} onChange={e => setNovoUser({...novoUser, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="email@exemplo.com" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Senha de Acesso</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input required type="password" value={novoUser.senha} onChange={e => setNovoUser({...novoUser, senha: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="Mínimo 6 caracteres" minLength="6" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={criando} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl shadow-md text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                  {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}