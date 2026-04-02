import React, { useState, useEffect } from 'react';
import { MessageSquareHeart, ThumbsUp, ThumbsDown, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = 'http://localhost:3000';

export default function FeedbacksIA() {
  const [data, setData] = useState({ stats: null, feedbacks: [] });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/ia/feedback`)
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>;

  return (
    <div className="w-full max-w-5xl mx-auto p-4 lg:p-6 space-y-6 animate-in fade-in">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"><ArrowLeft size={18}/></button>
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <MessageSquareHeart className="text-purple-600" /> Análise de Feedbacks da IA
        </h2>
      </div>

      {data.stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
            <p className="text-xs font-bold text-slate-500 uppercase">Total Avaliações</p>
            <p className="text-3xl font-black text-slate-800 mt-2">{data.stats.total}</p>
          </div>
          <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm text-center">
            <p className="text-xs font-bold text-emerald-600 uppercase flex justify-center items-center gap-1"><ThumbsUp size={14}/> Positivos</p>
            <p className="text-3xl font-black text-emerald-700 mt-2">{data.stats.positivos}</p>
          </div>
          <div className="bg-red-50 p-5 rounded-2xl border border-red-100 shadow-sm text-center">
            <p className="text-xs font-bold text-red-600 uppercase flex justify-center items-center gap-1"><ThumbsDown size={14}/> Negativos</p>
            <p className="text-3xl font-black text-red-700 mt-2">{data.stats.negativos}</p>
          </div>
          <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100 shadow-sm text-center">
            <p className="text-xs font-bold text-purple-600 uppercase">Aprovação</p>
            <p className="text-3xl font-black text-purple-700 mt-2">{data.stats.taxaAprovacao}%</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <h3 className="font-bold text-slate-700">Comentários e Avaliações</h3>
        </div>
        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {data.feedbacks.length === 0 ? (
            <p className="p-8 text-center text-slate-400">Nenhum feedback registrado ainda.</p>
          ) : (
            data.feedbacks.map((fb) => (
              <div key={fb.id} className="p-5 flex gap-4">
                <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${fb.isPositive ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                  {fb.isPositive ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{fb.usuario?.nome || 'Usuário Desconhecido'} <span className="text-xs font-normal text-slate-400 ml-2">{new Date(fb.createdAt).toLocaleString('pt-BR')}</span></p>
                  {fb.comentario ? (
                    <p className="text-sm text-slate-600 mt-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">{fb.comentario}</p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1 italic">Sem comentário adicional.</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 font-mono">Msg ID: {fb.mensagemId}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}