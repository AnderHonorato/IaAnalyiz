import React, { useState, useEffect } from 'react';
import { Users, Lock, ShieldCheck, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [filtro, setFiltro] = useState('TODOS'); // 'TODOS' | 'BLOQUEADOS'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    buscarUsuarios();
  }, []);

  const buscarUsuarios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios`);
      const data = await res.json();
      setUsuarios(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const alterarCargo = async (id, novoCargo) => {
    try {
      await fetch(`${API_BASE_URL}/api/usuarios/${id}/role`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: novoCargo })
      });
      buscarUsuarios(); // Atualiza a lista após alterar
    } catch (e) { console.error(e); }
  };

  const usuariosFiltrados = filtro === 'BLOQUEADOS' 
    ? usuarios.filter(u => u.role === 'BLOQUEADO')
    : usuarios;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 lg:p-6 space-y-6 animate-in fade-in duration-500">
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-xl"><Users className="w-6 h-6 text-emerald-600" /></div>
          Gestão de Usuários
        </h2>
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
          <button onClick={() => setFiltro('TODOS')} className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase transition-all ${filtro === 'TODOS' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}>Todos</button>
          <button onClick={() => setFiltro('BLOQUEADOS')} className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase transition-all ${filtro === 'BLOQUEADOS' ? 'bg-red-50 text-red-700' : 'text-slate-500 hover:bg-slate-50'}`}>Bloqueados / Pendentes</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
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
                  <td className="p-4">
                    <p className="font-bold text-slate-800">{user.nome}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${user.role === 'OWNER' ? 'bg-blue-100 text-blue-700' : user.role === 'EMPRESARIO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4">
                    {user.role === 'BLOQUEADO' ? (
                      user.solicitouDesbloqueio 
                        ? <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold"><AlertTriangle className="w-4 h-4"/> Solicitou Acesso</span>
                        : <span className="flex items-center gap-1.5 text-red-500 text-xs font-bold"><Lock className="w-4 h-4"/> Restrito</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold"><CheckCircle2 className="w-4 h-4"/> Liberado</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {user.role === 'BLOQUEADO' ? (
                      <button onClick={() => alterarCargo(user.id, 'EMPRESARIO')} className="bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ml-auto transition-colors">
                        <ShieldCheck className="w-3.5 h-3.5" /> Aprovar como Empresário
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
        )}
      </div>
    </div>
  );
}