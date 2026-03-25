import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag, CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, Image as ImageIcon, Link2, Square, CheckSquare,
  Eye, Sparkles, HelpCircle, Unlink, FileText, Maximize2, Minimize2, ArrowLeft,
  Settings, Wifi, WifiOff, FileSearch, History, Download, BarChart2, Calendar, Tag, ChevronRight
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

const FORM_INICIAL = { 
  sku: '', nome: '', preco: '', estoque: '', 
  peso: '', altura: '', largura: '', comprimento: '', 
  ean: '', marca: '', modelo: '', condicao: 'Novo'
};

const INTERVALOS = [
  { label: '30min', value: 30 }, { label: '1h', value: 60 }, { label: '2h', value: 120 },
  { label: '4h', value: 240 }, { label: '6h', value: 360 }, { label: '12h', value: 720 }, { label: '24h', value: 1440 },
];

function formatarProxima(dt) {
  if (!dt) return '—';
  const diff = new Date(dt) - Date.now();
  if (diff <= 0) return 'Agora';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `em ${h}h ${m}m` : `em ${m}m`;
}

function Portal({ children }) { return ReactDOM.createPortal(children, document.body); }

function ModalOverlay({ onClose, children, side = 'center' }) {
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-[999999] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div onClick={e => e.stopPropagation()} className="flex flex-col max-h-full">
          {children}
        </div>
      </div>
    </Portal>
  );
}

export default function MercadoLivre() {
  const { userId, userRole } = useOutletContext() || {};
  const navigate = useNavigate();
  const { confirm, alert } = useModal();

  // Navegação e Status
  const [activeTab, setActiveTab] = useState('bot');
  const [mlConectado, setMlConectado] = useState(false);
  const [mlNickname, setMlNickname] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados do Scanner/Bot
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [logs, setLogs] = useState([{ msg: `[${new Date().toLocaleTimeString('pt-BR')}] IA_Analyiz Módulo Analítico Carregado.`, type: 'info' }]);
  const [aiInsight, setAiInsight] = useState('');
  const [botStats, setBotStats] = useState(null);

  // Estados do ERP Avançado
  const [catalogo, setCatalogo] = useState([]);
  const [vinculos, setVinculos] = useState({}); 
  const [filaEnvio, setFilaEnvio] = useState({}); 
  const [historico, setHistorico] = useState([]); 
  const [validados, setValidados] = useState([]);
  const [anunciosML, setAnunciosML] = useState([]);
  const [etiquetas, setEtiquetas] = useState({});
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [tempInputs, setTempInputs] = useState({});
  const [editandoLinha, setEditandoLinha] = useState({});
  const [novaTagInput, setNovaTagInput] = useState({});

  // Paginação
  const [itensPorPagina, setItensPorPagina] = useState(10);
  const [paginaAuditoria, setPaginaAuditoria] = useState(1);

  // Modais e Config
  const [showConfig, setShowConfig] = useState(false);
  const [modalDivergencia, setModalDivergencia] = useState(null);
  const [agendador, setAgendador] = useState(null);
  const [intervalo, setIntervalo] = useState(360);
  const [modoLento, setModoLento] = useState(false);
  const [scannerFullscreen, setScannerFullscreen] = useState(false);

  const terminalRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    verificarStatusML();
    carregarDadosLocais();
    buscarAnuncios();
    buscarInsightIA();
  }, [userId]);

  const carregarDadosLocais = () => {
    const dbCatalogo = localStorage.getItem(`erp_cat_${userId}`);
    const dbVinculos = localStorage.getItem(`erp_vin_${userId}`);
    const dbValidados = localStorage.getItem(`erp_val_${userId}`);
    if (dbCatalogo) setCatalogo(JSON.parse(dbCatalogo));
    if (dbVinculos) setVinculos(JSON.parse(dbVinculos));
    if (dbValidados) setValidados(JSON.parse(dbValidados));
  };

  const verificarStatusML = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/status?userId=${userId}`);
      const data = await res.json();
      setMlConectado(data.connected && !data.expired);
      setMlNickname(data.nickname);
    } catch {}
  };

  const buscarAnuncios = async () => {
    if (!userId || !mlConectado) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/anuncios?userId=${userId}`);
      const data = await res.json();
      setAnunciosML(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const buscarInsightIA = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ia/proactive?userId=${userId}&userRole=${userRole}&pageKey=ml`);
      const data = await res.json();
      if (data.insight) setAiInsight(data.insight);
    } catch {}
  };

  const iniciarBot = () => {
    if (!userId) return;
    setIsBotRunning(true); setProgress(0); setBotStats(null);
    const eventSource = new EventSource(`${API_BASE_URL}/api/bot/stream?userId=${userId}&modoLento=${modoLento}`);
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.msg) setLogs(p => [...p, { msg: data.msg, type: data.type }]);
      if (data.percent !== undefined) setProgress(data.percent);
      if (data.type === 'done') {
        setIsBotRunning(false);
        eventSource.close();
        buscarAnuncios();
      }
    };
  };

  // --- LÓGICA DE AUDITORIA ---
  const pendentesList = anunciosML.filter(a => !validados.includes(a.id));
  const anunciosPaginados = pendentesList.slice((paginaAuditoria - 1) * itensPorPagina, paginaAuditoria * itensPorPagina);

  const TagAtributo = ({ nome, valor }) => (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${valor ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      {nome}: {valor || 'Ausente'}
    </span>
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col animate-in fade-in duration-300">
      
      {/* HEADER INTEGRADO */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-4 gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"><ArrowLeft className="w-4 h-4" /></button>
          <h2 className="text-base font-black tracking-tight text-slate-800">Hub Mercado Livre</h2>
          {aiInsight && <span className="hidden md:block text-[10px] text-slate-500 pl-2 border-l border-slate-200 truncate max-w-xs" dangerouslySetInnerHTML={{ __html: aiInsight }} />}
        </div>

        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {[
            ['bot', 'Scanner ML', Search],
            ['auditoria', 'Auditoria', AlertTriangle],
            ['catalogo', 'Catálogo ERP', Box],
            ['fila', 'Fila Envio', Clock]
          ].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === id ? 'bg-slate-900 text-[#FFE600]' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
          <button onClick={() => setShowConfig(true)} className="p-1.5 ml-1 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100"><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="flex-1 min-h-[600px]">
        
        {/* ABA SCANNER (Seu Layout Original) */}
        {activeTab === 'bot' && (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
             <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden ${scannerFullscreen ? 'xl:col-span-5' : 'xl:col-span-2'}`}>
                <div className="p-3 border-b border-slate-100 space-y-2">
                  <button onClick={iniciarBot} disabled={isBotRunning || !mlConectado} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 disabled:bg-slate-100">
                    {isBotRunning ? 'Auditando...' : '🔍 Iniciar Varredura'}
                  </button>
                  <div className="bg-slate-900 rounded-lg p-2.5">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase text-emerald-400 mb-1">
                      <span>Progresso</span><span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
                <div ref={terminalRef} className="flex-1 bg-slate-950 m-2 rounded-xl p-2.5 overflow-y-auto min-h-[350px] font-mono text-[10px]">
                  {logs.map((l, i) => <div key={i} className="text-slate-300 mb-0.5"><span className="text-slate-600 mr-1">❯</span>{l.msg}</div>)}
                </div>
             </section>
             
             {/* Preview de Divergências Rápido */}
             {!scannerFullscreen && (
               <section className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                  <h3 className="text-xs font-black uppercase text-slate-700 mb-4">Últimas Divergências Detectadas</h3>
                  <div className="space-y-2">
                    {pendentesList.slice(0, 5).map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-3">
                           <ImageIcon className="w-4 h-4 text-slate-300" />
                           <div>
                             <p className="text-[11px] font-bold text-slate-800">{item.titulo}</p>
                             <p className="text-[9px] text-slate-400 font-mono">{item.id}</p>
                           </div>
                        </div>
                        <button onClick={() => setActiveTab('auditoria')} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 text-blue-600">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
               </section>
             )}
          </div>
        )}

        {/* ABA AUDITORIA (Lógica do ERP) */}
        {activeTab === 'auditoria' && (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />Auditoria de Ficha Técnica</h3>
              <button onClick={buscarAnuncios} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase">
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Sincronizar
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Anúncio ML</th>
                    <th className="px-4 py-3">Preço / Estq</th>
                    <th className="px-4 py-3">Vínculo ERP</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {anunciosPaginados.map(item => {
                    const local = (vinculos[item.id] || []).map(sku => catalogo.find(c => c.sku === sku)).filter(Boolean)[0];
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.thumbnail ? <img src={item.thumbnail} className="w-10 h-10 rounded-lg border border-slate-200" alt=""/> : <div className="w-10 h-10 bg-slate-100 rounded-lg" />}
                            <div>
                              <p className="text-[11px] font-bold text-slate-800 line-clamp-1">{item.titulo}</p>
                              <div className="flex gap-1 mt-1">
                                <TagAtributo nome="Peso" valor={item.peso ? `${item.peso}g` : null} />
                                <TagAtributo nome="EAN" valor={item.ean} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px] font-bold text-slate-700">
                          R$ {item.preco}<br/><span className="text-[9px] font-normal text-slate-400">Estoque: {item.estoque}</span>
                        </td>
                        <td className="px-4 py-3">
                          <select className="text-[10px] bg-white border border-slate-200 rounded p-1 w-full outline-none">
                            <option>{local ? local.sku : '+ Vincular SKU'}</option>
                            {catalogo.map(c => <option key={c.sku} value={c.sku}>{c.sku}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!local ? (
                            <span className="text-[9px] font-black uppercase text-amber-500">Sem Vínculo</span>
                          ) : (
                            <button className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200 text-[9px] font-black uppercase">Validar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-slate-100 flex justify-end">
               <button onClick={() => setPaginaAuditoria(p => Math.max(1, p-1))} className="p-1 px-3 border rounded-l">Anterior</button>
               <button onClick={() => setPaginaAuditoria(p => p + 1)} className="p-1 px-3 border rounded-r">Próxima</button>
            </div>
          </section>
        )}

      </div>

      {/* MODAL DE CONFIGURAÇÃO (Seu Layout Original) */}
      {showConfig && (
        <ModalOverlay onClose={() => setShowConfig(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[360px]">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h3 className="text-xs font-black uppercase flex items-center gap-2 text-slate-800"><Settings className="w-4 h-4 text-blue-600" />Configurações</h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-red-500"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Conexão ML</label>
                {!mlConectado ? (
                  <button onClick={conectarML} className="w-full py-2.5 bg-[#FFE600] text-slate-900 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2"><ShoppingBag className="w-4 h-4"/>Conectar Conta</button>
                ) : (
                  <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <span className="text-xs font-bold text-emerald-700">{mlNickname}</span>
                    <button onClick={desconectarML} className="text-[10px] font-black text-red-500 uppercase">Sair</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}