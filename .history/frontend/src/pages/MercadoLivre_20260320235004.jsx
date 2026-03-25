// pages/MercadoLivre.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Plus, Box, ExternalLink, ShoppingBag, CheckCircle2, Clock, Trash2, EyeOff, RefreshCw,
  Package, Weight, Loader2, Check, XCircle, Search, Image as ImageIcon, Link2, Square, CheckSquare,
  Eye, Sparkles, Upload, HelpCircle, Unlink, LayoutList, FileText, Maximize2, Minimize2, ArrowLeft,
  Settings, Wifi, WifiOff, FileSearch, History, Download, TrendingUp, BarChart2, Calendar, Tag
} from 'lucide-react';
import { useModal } from '../components/Modal';

const API_BASE_URL = 'http://localhost:3000';

const FORM_INICIAL = { 
  sku: '', nome: '', preco: '', estoque: '', 
  peso: '', altura: '', largura: '', comprimento: '', 
  ean: '', marca: '', modelo: '', condicao: 'Novo', mlItemId: ''
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

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

function ModalOverlay({ onClose, children, side = 'center' }) {
  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: side === 'right' ? 'stretch' : 'center', justifyContent: side === 'right' ? 'flex-end' : 'center', padding: side === 'center' ? '16px' : '0' }}>
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', height: side === 'right' ? '100%' : 'auto' }}>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function downloadTxt(conteudo, filename = 'resumo.txt') {
  const texto = conteudo.replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<li>/gi, '  • ').replace(/<\/ul>/gi, '\n').replace(/<b>/gi, '').replace(/<\/b>/gi, '').replace(/<i>/gi, '').replace(/<\/i>/gi, '').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function MercadoLivre() {
  const { userId, userRole } = useOutletContext() || {};
  const navigate = useNavigate();
  const { confirm, alert } = useModal();

  const [activeTab, setActiveTab] = useState('auditoria');
  const [mlConectado, setMlConectado] = useState(false);
  const [mlNickname, setMlNickname] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados do Bot/Scanner antigos (mantidos para o layout)
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [logs, setLogs] = useState([{ msg: `[${new Date().toLocaleTimeString('pt-BR')}] IA_Analyiz Módulo Analítico Carregado.`, type: 'info' }]);
  const [aiInsight, setAiInsight] = useState('');
  const [botStats, setBotStats] = useState(null);

  const [showConfig, setShowConfig] = useState(false);
  const [showDicas, setShowDicas] = useState(false);
  const [showResumoModal, setShowResumoModal] = useState(false);
  const [resumoIA, setResumoIA] = useState('');
  const [historicoResumos, setHistoricoResumos] = useState([]);
  const [loadingResumo, setLoadingResumo] = useState(false);

  // Estados do ERP Avançado
  const [catalogo, setCatalogo] = useState([]);
  const [vinculos, setVinculos] = useState({}); 
  const [filaEnvio, setFilaEnvio] = useState({}); 
  const [historico, setHistorico] = useState([]); 
  const [validados, setValidados] = useState([]);
  const [anunciosML, setAnunciosML] = useState([]);
  
  const [gruposPrimos, setGruposPrimos] = useState([]); 
  const [statusEnvioMassa, setStatusEnvioMassa] = useState(null);

  const [etiquetas, setEtiquetas] = useState({}); 
  const [filtroEtiqueta, setFiltroEtiqueta] = useState(''); 
  const [novaTagInput, setNovaTagInput] = useState({}); 
  
  const [tempInputs, setTempInputs] = useState({});
  const [editandoLinha, setEditandoLinha] = useState({});

  const [itensPorPagina, setItensPorPagina] = useState(10);
  const [paginaCatalogo, setPaginaCatalogo] = useState(1);
  const [paginaAuditoria, setPaginaAuditoria] = useState(1);
  const [paginaValidados, setPaginaValidados] = useState(1);
  const [paginaHistorico, setPaginaHistorico] = useState(1);

  const [modalDivergencia, setModalDivergencia] = useState(null);
  const [novoProd, setNovoProd] = useState(FORM_INICIAL);
  const fileInputRef = useRef(null);

  const [agendador, setAgendador] = useState(null);
  const [intervalo, setIntervalo] = useState(360);
  const [savingAgendador, setSavingAgendador] = useState(false);
  const [modoLento, setModoLento] = useState(false);

  const terminalRef = useRef(null);
  useEffect(() => {
    if (terminalRef.current) setTimeout(() => { terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, 50);
  }, [logs]);

  useEffect(() => {
    if (!userId) return;
    verificarStatusML();
    
    // Carrega dados locais (simulando BD para apresentação)
    const dbCatalogo = localStorage.getItem(`erp_catalogo_${userId}`);
    const dbVinculos = localStorage.getItem(`erp_vinculos_${userId}`);
    const dbEtiquetas = localStorage.getItem(`erp_etiquetas_${userId}`); 
    const dbHistorico = localStorage.getItem(`erp_historico_${userId}`); 
    const dbValidados = localStorage.getItem(`erp_validados_${userId}`); 
    
    if (dbCatalogo) setCatalogo(JSON.parse(dbCatalogo));
    if (dbVinculos) setVinculos(JSON.parse(dbVinculos));
    if (dbEtiquetas) setEtiquetas(JSON.parse(dbEtiquetas));
    if (dbHistorico) setHistorico(JSON.parse(dbHistorico));
    if (dbValidados) setValidados(JSON.parse(dbValidados));
    
    buscarAnuncios();
    buscarInsightIA();
  }, [userId]);

  const apiGet = useCallback(async (path) => {
    const res = await fetch(`${API_BASE_URL}${path}`); return res.json();
  }, []);

  const verificarStatusML = async () => {
    try {
      const data = await apiGet(`/api/ml/status?userId=${userId}`);
      setMlConectado(data.connected && !data.expired); setMlNickname(data.nickname);
      const conf = await apiGet(`/api/agendador?userId=${userId}`);
      setAgendador(conf); setIntervalo(conf?.intervalo || 360);
    } catch {}
  };

  const conectarML = async () => {
    try { const data = await apiGet(`/api/ml/auth-url?userId=${userId}`); if (data.url) window.location.href = data.url; }
    catch { alert({ title: 'Erro', message: 'Falha ao buscar URL.' }); }
  };

  const desconectarML = async () => {
    if (!await confirm({ title: 'Desconectar ML', message: 'Deseja desconectar?', confirmLabel: 'Desconectar', danger: true })) return;
    await fetch(`${API_BASE_URL}/api/ml/logout?userId=${userId}`, { method: 'POST' });
    setStatus({ connected: false, nickname: '' });
    setAnunciosML([]); 
    setFilaEnvio({});
    verificarStatusML(); setShowConfig(false);
  };

  const salvarAgendador = async (novoAtivo, novoIntervalo) => {
    setSavingAgendador(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agendador`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ativo: novoAtivo, intervalo: novoIntervalo })
      });
      const data = await res.json(); setAgendador(data); setIntervalo(data.intervalo);
    } catch {} finally { setSavingAgendador(false); }
  };

  const buscarInsightIA = async () => {
    try {
      const data = await apiGet(`/api/ia/proactive?userId=${userId}&userRole=${userRole}&pageKey=divergencias`);
      if (data.insight) setAiInsight(data.insight);
    } catch {}
  };

  const gerarResumoLogistico = async () => {
    setLoadingResumo(true);
    try {
      const dadosStr = `Total: ${anunciosML.length} anúncios. Pendentes fila: ${Object.keys(filaEnvio).length}. Catálogo: ${catalogo.length} itens.`;
      const res = await fetch(`${API_BASE_URL}/api/ia/summary`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, dados: dadosStr })
      });
      const data = await res.json(); setResumoIA(data.conteudo); buscarHistoricoResumos();
    } catch { setResumoIA('<b>Diagnóstico Geral</b><br>Erro. Tente novamente.'); }
    finally { setLoadingResumo(false); }
  };

  const buscarHistoricoResumos = async () => { try { setHistoricoResumos(await apiGet(`/api/ia/summary/history?userId=${userId}`)); } catch {} };

  // --- LÓGICA DO ERP AVANÇADO ---
  const registrarNoHistorico = (novoRegistro) => {
    setHistorico(prev => {
      const atualizado = [novoRegistro, ...prev];
      localStorage.setItem(`erp_historico_${userId}`, JSON.stringify(atualizado));
      return atualizado;
    });
  };

  const limparHistorico = async () => {
    if(await confirm({ title: 'Limpar Histórico', message: 'Deseja apagar todo o histórico de logs?', confirmLabel: 'Apagar', danger: true })) {
      setHistorico([]);
      localStorage.removeItem(`erp_historico_${userId}`);
    }
  };

  const alternarValidacao = (id) => {
    let novosValidados;
    if (validados.includes(id)) {
      novosValidados = validados.filter(v => v !== id);
    } else {
      novosValidados = [...validados, id];
    }
    setValidados(novosValidados);
    localStorage.setItem(`erp_validados_${userId}`, JSON.stringify(novosValidados));
  };

  const checarSeEstaConciliado = (mlItem) => {
    const produtosLocais = (vinculos[mlItem.id] || []).map(sku => catalogo.find(c => c.sku === sku)).filter(Boolean);
    if (produtosLocais.length === 0) return false; 
    let temDivergencia = false;
    if (produtosLocais.length === 1) {
      const erp = produtosLocais[0];
      const dim = mlItem.dimensoes || {};
      if (erp.peso && erp.peso != mlItem.peso) temDivergencia = true;
      if (erp.ean && erp.ean !== mlItem.ean) temDivergencia = true;
      if (erp.marca && (!mlItem.marca || erp.marca.toUpperCase() !== mlItem.marca.toUpperCase())) temDivergencia = true;
      if (erp.modelo && (!mlItem.modelo || erp.modelo.toUpperCase() !== mlItem.modelo.toUpperCase())) temDivergencia = true;
      if (erp.altura && (!dim.altura || !dim.altura.includes(erp.altura))) temDivergencia = true;
      if (erp.largura && (!dim.largura || !dim.largura.includes(erp.largura))) temDivergencia = true;
      if (erp.comprimento && (!dim.comprimento || !dim.comprimento.includes(erp.comprimento))) temDivergencia = true;
    } else {
      const pesoSoma = produtosLocais.reduce((acc, p) => acc + (parseInt(p.peso) || 0), 0);
      if (!mlItem.peso || mlItem.peso != pesoSoma) temDivergencia = true;
    }
    return !temDivergencia;
  };

  const autoArquivarConciliados = () => {
    const conciliados = anunciosML.filter(a => !validados.includes(a.id) && checarSeEstaConciliado(a)).map(a => a.id);
    if (conciliados.length === 0) {
        alert({title: 'Auto-Arquivar', message: 'Nenhum item da tela atual está 100% conciliado para arquivar.'});
        return;
    }
    const novos = [...validados, ...conciliados];
    setValidados(novos);
    localStorage.setItem(`erp_validados_${userId}`, JSON.stringify(novos));
    alert({title: 'Sucesso', message: `${conciliados.length} anúncios foram movidos para a aba Validados!`});
  };

  const adicionarEtiqueta = (mlId, tag) => {
    if (!tag || tag.trim() === '') return;
    const tagFormatada = tag.trim().toUpperCase();
    const tagsAtuais = etiquetas[mlId] || [];
    if (tagsAtuais.includes(tagFormatada)) return; 
    const novasEtiquetas = { ...etiquetas, [mlId]: [...tagsAtuais, tagFormatada] };
    setEtiquetas(novasEtiquetas);
    localStorage.setItem(`erp_etiquetas_${userId}`, JSON.stringify(novasEtiquetas));
    setNovaTagInput({ ...novaTagInput, [mlId]: '' }); 
  };

  const removerEtiqueta = (mlId, tagParaRemover) => {
    const novasEtiquetas = { ...etiquetas, [mlId]: (etiquetas[mlId] || []).filter(t => t !== tagParaRemover) };
    setEtiquetas(novasEtiquetas);
    localStorage.setItem(`erp_etiquetas_${userId}`, JSON.stringify(novasEtiquetas));
  };

  const todasAsEtiquetas = Array.from(new Set(Object.values(etiquetas).flat())).sort();
  const anunciosFiltradosBase = filtroEtiqueta ? anunciosML.filter(a => etiquetas[a.id] && etiquetas[a.id].includes(filtroEtiqueta)) : anunciosML;
  const pendentesList = anunciosFiltradosBase.filter(a => !validados.includes(a.id));
  const validadosList = anunciosFiltradosBase.filter(a => validados.includes(a.id));

  const adicionarFiltradosAFila = () => {
    const preco = document.getElementById('mass_preco_filtro').value;
    const estoque = document.getElementById('mass_estoque_filtro').value;
    if (!preco && !estoque) {
        alert({title:'Atenção', message: 'Preencha o preço ou o estoque para aplicar em massa.'});
        return;
    }
    const novaFila = { ...filaEnvio };
    pendentesList.forEach(item => {
      novaFila[item.id] = { preco: preco || item.preco, estoque: estoque || item.estoque, titulo: item.titulo, status: 'Pendente' };
      setEditandoLinha(prev => ({ ...prev, [item.id]: false }));
    });
    setFilaEnvio(novaFila);
    alert({title:'Adicionado', message: `${pendentesList.length} anúncios adicionados à Fila!`});
    document.getElementById('mass_preco_filtro').value = '';
    document.getElementById('mass_estoque_filtro').value = '';
  };

  const salvarProduto = (e) => {
    e.preventDefault();
    if (!novoProd.sku || !novoProd.nome) return;
    const novoCatalogo = [...catalogo.filter(p => p.sku !== novoProd.sku), novoProd];
    setCatalogo(novoCatalogo);
    localStorage.setItem(`erp_catalogo_${userId}`, JSON.stringify(novoCatalogo));
    setNovoProd(FORM_INICIAL);
  };

  const apagarProduto = async (sku) => {
    if(!await confirm({ title: 'Apagar', message: 'Apagar produto do ERP?', confirmLabel: 'Apagar', danger: true })) return;
    const novoCatalogo = catalogo.filter(p => p.sku !== sku);
    setCatalogo(novoCatalogo);
    localStorage.setItem(`erp_catalogo_${userId}`, JSON.stringify(novoCatalogo));
  };

  const carregarParaEdicao = (prod) => {
    setNovoProd(prod);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportarCSV = () => {
    if (catalogo.length === 0) return;
    const cabecalho = "SKU,NOME,PRECO,ESTOQUE,PESO,ALTURA,LARGURA,COMPRIMENTO,EAN,MARCA,MODELO\n";
    const linhas = catalogo.map(p => `${p.sku || ''},${p.nome || ''},${p.preco || ''},${p.estoque || ''},${p.peso || ''},${p.altura || ''},${p.largura || ''},${p.comprimento || ''},${p.ean || ''},${p.marca || ''},${p.modelo || ''}`).join("\n");
    const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Meu_Catalogo_Completo_ERP.csv";
    link.click();
  };

  const detectarPrimos = (anuncios) => {
    const grupos = {};
    anuncios.forEach(a => {
      const prefixo = a.titulo.split(' ').slice(0, 3).join(' ').toLowerCase();
      if (!grupos[prefixo]) grupos[prefixo] = [];
      grupos[prefixo].push(a);
    });
    setGruposPrimos(Object.entries(grupos).filter(([_, items]) => items.length > 1).map(([nome, items]) => ({ nomeBase: nome, items })));
  };

  const buscarAnuncios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/anuncios?userId=${userId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      let vinculosAtualizados = { ...vinculos };
      data.forEach(mlItem => {
        if (mlItem.sku && catalogo.some(c => c.sku === mlItem.sku)) {
          if (!vinculosAtualizados[mlItem.id]) vinculosAtualizados[mlItem.id] = [mlItem.sku];
        }
      });
      setVinculos(vinculosAtualizados);
      localStorage.setItem(`erp_vinculos_${userId}`, JSON.stringify(vinculosAtualizados));
      setAnunciosML(data);
      detectarPrimos(data);
      setPaginaAuditoria(1);
    } catch (err) { console.error("Erro buscar anuncios", err); } 
    finally { setLoading(false); }
  };

  const adicionarAFila = (id, preco, estoque, titulo) => {
    setFilaEnvio(prev => ({ ...prev, [id]: { preco, estoque, titulo, status: 'Pendente' } }));
    setEditandoLinha(prev => ({ ...prev, [id]: false }));
  };

  const enviarTudoParaML = async () => {
    const idsPendentes = Object.keys(filaEnvio);
    if (idsPendentes.length === 0) return;
    
    const delaySegundos = 3; 
    setStatusEnvioMassa({ 
      ativo: true, total: idsPendentes.length, atual: 0, 
      segundosRestantes: idsPendentes.length * delaySegundos, 
      mensagem: 'Iniciando processamento em lote...' 
    });
    
    let filaAtual = { ...filaEnvio };
    let processados = 0;

    for (const id of idsPendentes) {
      processados++;
      const itemFila = filaAtual[id];
      itemFila.status = 'A enviar...';
      setFilaEnvio({ ...filaAtual });
      
      setStatusEnvioMassa(prev => ({ ...prev, atual: processados, mensagem: `Enviando anúncio ${processados} de ${idsPendentes.length}...` }));
      
      let statusFinal = '';
      try {
        const res = await fetch(`${API_BASE_URL}/api/anuncios/${id}?userId=${userId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preco: itemFila.preco, estoque: itemFila.estoque })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        statusFinal = '✅ Sucesso';
      } catch (err) { statusFinal = `❌ Bloqueado: ${err.message}`; }

      registrarNoHistorico({
        id, titulo: itemFila.titulo, acao: 'Lote (Preço/Estoque)', 
        detalhes: `Preço: ${itemFila.preco} | Estq: ${itemFila.estoque}`, 
        status: statusFinal, data: new Date().toLocaleString()
      });

      delete filaAtual[id];
      setFilaEnvio({ ...filaAtual });

      if (processados < idsPendentes.length) {
        for (let s = delaySegundos; s > 0; s--) {
          setStatusEnvioMassa(prev => ({ ...prev, mensagem: `Pausa anti-bloqueio. Próximo em ${s}s...`, segundosRestantes: ((idsPendentes.length - processados) * delaySegundos) - (delaySegundos - s) }));
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    
    setStatusEnvioMassa(prev => ({ ...prev, ativo: false, mensagem: 'Envio Finalizado!' }));
    alert({title: 'Finalizado', message: "Lote finalizado! Verifique os erros na aba Histórico."});
    buscarAnuncios(); 
  };

  const lidarComInputTemp = (id, campo, valor) => setTempInputs(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  
  const vincularSKUManual = (mlId, sku) => {
    if (!sku) return;
    const lista = vinculos[mlId] || [];
    if (!lista.includes(sku)) {
      const novos = { ...vinculos, [mlId]: [...lista, sku] };
      setVinculos(novos);
      localStorage.setItem(`erp_vinculos_${userId}`, JSON.stringify(novos));
    }
  };

  const removerVinculo = (mlId, sku) => {
    const novos = { ...vinculos, [mlId]: (vinculos[mlId] || []).filter(s => s !== sku) };
    setVinculos(novos);
    localStorage.setItem(`erp_vinculos_${userId}`, JSON.stringify(novos));
  };

  const catalogoPaginado = catalogo.slice((paginaCatalogo - 1) * itensPorPagina, (paginaCatalogo - 1) * itensPorPagina + itensPorPagina);
  const anunciosPendentesPaginado = pendentesList.slice((paginaAuditoria - 1) * itensPorPagina, (paginaAuditoria - 1) * itensPorPagina + itensPorPagina);
  const anunciosValidadosPaginado = validadosList.slice((paginaValidados - 1) * itensPorPagina, (paginaValidados - 1) * itensPorPagina + itensPorPagina);
  const historicoPaginado = historico.slice((paginaHistorico - 1) * itensPorPagina, (paginaHistorico - 1) * itensPorPagina + itensPorPagina);

  const PaginacaoUI = ({ paginaAtual, totalPaginas, setPagina }) => (
    <div className="flex justify-end items-center mt-4 gap-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">Itens:</span>
        <select value={itensPorPagina} onChange={(e) => { setItensPorPagina(Number(e.target.value)); setPagina(1); }} className="px-2 py-1 rounded bg-slate-50 border border-slate-200 outline-none">
          <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaAtual <= 1} className="px-3 py-1 rounded bg-white border border-slate-200 disabled:opacity-50">Anterior</button>
        <span>Pág <b>{paginaAtual}</b> de <b>{totalPaginas}</b></span>
        <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas} className="px-3 py-1 rounded bg-white border border-slate-200 disabled:opacity-50">Próxima</button>
      </div>
    </div>
  );

  const TagAtributo = ({ nome, valor }) => (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${valor ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      {nome}: {valor ? valor : 'Falta ML'}
    </span>
  );

  // =========================================================
  // MODAL COM PROGRESS BAR VISÍVEL
  // =========================================================
  const ModalDivergencias = () => {
    if (!modalDivergencia) return null;
    const { itemML, divergencias, erpItem } = modalDivergencia;
    
    const [selecionados, setSelecionados] = useState(divergencias.reduce((acc, d) => ({ ...acc, [d.campo]: true }), {}));
    const [statusCorrecao, setStatusCorrecao] = useState({});
    const [progresso, setProgresso] = useState({ ativo: false, total: 0, atual: 0, mensagem: '' });
    
    const toggleCheck = (campo) => setSelecionados({ ...selecionados, [campo]: !selecionados[campo] });

    const aplicarCorrecao = async () => {
      const camposParaEnviar = divergencias.filter(d => selecionados[d.campo] && statusCorrecao[d.campo] !== '✅ Corrigido');
      if (camposParaEnviar.length === 0) return alert({title:'Atenção', message: "Nenhum campo pendente selecionado."});

      setProgresso({ ativo: true, total: camposParaEnviar.length, atual: 0, mensagem: 'Iniciando correções...' });
      let novosStatus = { ...statusCorrecao };
      let processados = 0;

      for (const d of camposParaEnviar) {
        processados++;
        
        novosStatus[d.campo] = '⏳ Enviando API...';
        setStatusCorrecao({ ...novosStatus });
        setProgresso(prev => ({ ...prev, atual: processados, mensagem: `Enviando campo: ${d.nomeBonito}...` }));
        
        let logStatus = '';
        try {
          const res = await fetch(`${API_BASE_URL}/api/anuncios/${itemML.id}?userId=${userId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ atributosFicha: { [d.campo]: d.valorCorretoERP } })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);

          novosStatus[d.campo] = '✅ Corrigido';
          logStatus = '✅ Sucesso';
        } catch (err) {
          novosStatus[d.campo] = `❌ Bloqueado: ${err.message}`;
          logStatus = `❌ Bloqueado: ${err.message}`;
        }
        
        registrarNoHistorico({ id: itemML.id, titulo: itemML.titulo, acao: `Correção de ${d.nomeBonito}`, detalhes: `Tentou enviar: ${d.valorCorretoERP}`, status: logStatus, data: new Date().toLocaleString() });
        setStatusCorrecao({ ...novosStatus });
        
        if (processados < camposParaEnviar.length) {
          for(let s = 3; s > 0; s--) {
            setProgresso(prev => ({ ...prev, mensagem: `Pausa anti-bloqueio: ${s}s...` }));
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      setProgresso(prev => ({ ...prev, ativo: false, mensagem: 'Finalizado!' }));
    };

    const fecharModalERecarregar = () => {
      setModalDivergencia(null);
      if (Object.values(statusCorrecao).some(s => s === '✅ Corrigido')) buscarAnuncios(); 
    };

    return (
      <ModalOverlay onClose={fecharModalERecarregar}>
        <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-[800px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
            <h2 className="text-sm font-black text-red-600 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Conciliação de Dados</h2>
            <button onClick={fecharModalERecarregar} disabled={progresso.ativo} className="text-slate-400 hover:text-slate-600"><XCircle className="w-5 h-5"/></button>
          </div>

          <div className="p-5">
            {itemML.catalogo && (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200 mb-4 text-xs">
                <b>📌 Produto de Catálogo!</b><br/> Sugerimos preencher os dados manualmente no ML.
              </div>
            )}
            
            {progresso.ativo && (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-4">
                <div className="flex justify-between mb-2 text-xs font-bold">
                  <span className="text-blue-600">{progresso.mensagem}</span>
                  <span className="text-slate-600">{progresso.atual} / {progresso.total} corrigidos</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-emerald-500 h-2.5 transition-all duration-300" style={{ width: `${(progresso.atual / progresso.total) * 100}%` }}></div>
                </div>
              </div>
            )}
            
            <div className="flex gap-4 mb-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
              {itemML.thumbnail ? <img src={itemML.thumbnail} className="w-16 h-16 object-contain bg-white rounded-lg border border-slate-200" alt="" /> : <div className="w-16 h-16 bg-slate-200 rounded-lg flex items-center justify-center text-[10px]">Sem Foto</div>}
              <div>
                <b className="text-blue-600 text-sm">{itemML.titulo}</b><br/>
                <small className="text-slate-500">ID ML: {itemML.id} | SKU ERP: {erpItem.sku}</small>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden mb-5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr><th className="p-3 w-10 text-center"></th><th className="p-3">Atributo</th><th className="p-3 text-red-600">No ML</th><th className="p-3 text-emerald-600">No ERP</th><th className="p-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {divergencias.map((div, i) => (
                    <tr key={i} className={selecionados[div.campo] ? 'bg-slate-50/50' : 'bg-white'}>
                      <td className="p-3 text-center">
                        <input type="checkbox" checked={selecionados[div.campo]} onChange={() => toggleCheck(div.campo)} disabled={progresso.ativo || statusCorrecao[div.campo] === '✅ Corrigido'} className="w-4 h-4 rounded text-blue-600 cursor-pointer" />
                      </td>
                      <td className="p-3 font-bold text-slate-700">{div.nomeBonito}</td>
                      <td className={`p-3 text-red-600 ${statusCorrecao[div.campo] === '✅ Corrigido' ? 'line-through opacity-50' : ''}`}>{div.valorML}</td>
                      <td className="p-3 text-emerald-600 font-bold">{div.valorERP}</td>
                      <td className={`p-3 font-bold text-[10px] ${statusCorrecao[div.campo]?.includes('❌') ? 'text-red-600' : 'text-blue-600'}`}>{statusCorrecao[div.campo] || 'Aguardando...'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-2">
              <small className="text-slate-400">Erros e sucessos vão para o Histórico.</small>
              <div className="flex gap-2">
                <button onClick={fecharModalERecarregar} disabled={progresso.ativo} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200">Fechar</button>
                <button onClick={aplicarCorrecao} disabled={progresso.ativo || !divergencias.some(d => selecionados[d.campo])} className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700">
                  {progresso.ativo ? 'A processar...' : 'Corrigir Selecionados'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalOverlay>
    );
  };

  const renderizarLinhaAnuncio = (mlItem, isValidadoTab = false) => {
    const produtosLocais = (vinculos[mlItem.id] || []).map(sku => catalogo.find(c => c.sku === sku)).filter(Boolean);
    const tagsDoItem = etiquetas[mlItem.id] || [];
    
    let arrayDivergencias = [];
    if (produtosLocais.length === 1) {
      const erp = produtosLocais[0];
      const dim = mlItem.dimensoes || {};

      if (erp.peso && erp.peso != mlItem.peso) arrayDivergencias.push({ campo: 'peso', nomeBonito: 'Peso', valorML: mlItem.peso ? `${mlItem.peso}g` : 'Faltando', valorERP: `${erp.peso}g`, valorCorretoERP: erp.peso });
      if (erp.ean && erp.ean !== mlItem.ean) arrayDivergencias.push({ campo: 'ean', nomeBonito: 'EAN', valorML: mlItem.ean || 'Faltando', valorERP: erp.ean, valorCorretoERP: erp.ean });
      if (erp.marca && (!mlItem.marca || erp.marca.toUpperCase() !== mlItem.marca.toUpperCase())) arrayDivergencias.push({ campo: 'marca', nomeBonito: 'Marca', valorML: mlItem.marca || 'Faltando', valorERP: erp.marca, valorCorretoERP: erp.marca });
      if (erp.modelo && (!mlItem.modelo || erp.modelo.toUpperCase() !== mlItem.modelo.toUpperCase())) arrayDivergencias.push({ campo: 'modelo', nomeBonito: 'Modelo', valorML: mlItem.modelo || 'Faltando', valorERP: erp.modelo, valorCorretoERP: erp.modelo });
      if (erp.altura && (!dim.altura || !dim.altura.includes(erp.altura))) arrayDivergencias.push({ campo: 'altura', nomeBonito: 'Altura', valorML: dim.altura || 'Vazio', valorERP: `${erp.altura} cm`, valorCorretoERP: erp.altura });
      if (erp.largura && (!dim.largura || !dim.largura.includes(erp.largura))) arrayDivergencias.push({ campo: 'largura', nomeBonito: 'Largura', valorML: dim.largura || 'Vazio', valorERP: `${erp.largura} cm`, valorCorretoERP: erp.largura });
      if (erp.comprimento && (!dim.comprimento || !dim.comprimento.includes(erp.comprimento))) arrayDivergencias.push({ campo: 'comprimento', nomeBonito: 'Comprimento', valorML: dim.comprimento || 'Vazio', valorERP: `${erp.comprimento} cm`, valorCorretoERP: erp.comprimento });
    }

    const tPreco = tempInputs[mlItem.id]?.preco !== undefined ? tempInputs[mlItem.id].preco : mlItem.preco;
    const tEstoque = tempInputs[mlItem.id]?.estoque !== undefined ? tempInputs[mlItem.id].estoque : mlItem.estoque;
    const corTipo = mlItem.tipoAnuncio === 'Premium' ? 'bg-purple-100 text-purple-700' : (mlItem.tipoAnuncio === 'Clássico' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700');

    return (
      <tr key={mlItem.id} className={`border-b border-slate-100 hover:bg-slate-50/50 ${isValidadoTab ? 'opacity-90' : ''}`}>
        <td className="p-4 align-top">
          <div className="flex gap-3">
            {mlItem.thumbnail ? <img src={mlItem.thumbnail} className="w-14 h-14 object-contain rounded-lg border border-slate-200 bg-white" alt="" /> : <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center text-[9px] text-slate-400">Sem Foto</div>}
            <div>
              <a href={mlItem.link} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-600 hover:underline line-clamp-2">{mlItem.titulo}</a>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500 font-mono">{mlItem.id}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${corTipo}`}>{mlItem.tipoAnuncio}</span>
                {mlItem.catalogo && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">Catálogo</span>}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap gap-1 mb-2">
              {tagsDoItem.map(t => <span key={t} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200">{t} <button onClick={() => removerEtiqueta(mlItem.id, t)} className="text-red-500 hover:text-red-700">×</button></span>)}
            </div>
            <div className="flex gap-1">
              <input type="text" placeholder="+ Tag (ex: Promo)" value={novaTagInput[mlItem.id] || ''} onChange={(e) => setNovaTagInput({ ...novaTagInput, [mlItem.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') adicionarEtiqueta(mlItem.id, novaTagInput[mlItem.id]); }} className="text-[10px] px-2 py-1 rounded bg-slate-50 border border-slate-200 outline-none w-32" />
            </div>
          </div>
        </td>

        <td className="p-4 align-top">
          {!editandoLinha[mlItem.id] ? (
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div className="text-sm font-black text-slate-800">R$ {mlItem.preco}</div>
              <div className="text-xs text-slate-500 mt-0.5">Estoque: {mlItem.estoque}</div>
              <button onClick={() => setEditandoLinha({ ...editandoLinha, [mlItem.id]: true })} className="mt-2 text-[10px] font-bold uppercase text-blue-600 hover:text-blue-800 flex items-center gap-1"><Settings className="w-3 h-3"/> Editar</button>
            </div>
          ) : (
            <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
              <input type="number" step="any" value={tPreco} onChange={e => lidarComInputTemp(mlItem.id, 'preco', e.target.value)} className="w-full mb-1 p-1 text-xs border rounded outline-none" placeholder="Preço" />
              <input type="number" value={tEstoque} onChange={e => lidarComInputTemp(mlItem.id, 'estoque', e.target.value)} className="w-full mb-2 p-1 text-xs border rounded outline-none" placeholder="Estoque" />
              <div className="flex gap-1">
                <button onClick={() => adicionarAFila(mlItem.id, tPreco, tEstoque, mlItem.titulo)} className="flex-1 bg-blue-600 text-white text-[10px] font-bold py-1 rounded">Filar</button>
                <button onClick={() => setEditandoLinha({ ...editandoLinha, [mlItem.id]: false })} className="px-2 bg-slate-200 text-slate-600 text-[10px] rounded">✕</button>
              </div>
            </div>
          )}
        </td>

        <td className="p-4 align-top">
          {produtosLocais.map(p => (
            <div key={p.sku} className="flex justify-between items-center text-[10px] bg-slate-50 border border-slate-200 rounded p-1.5 mb-1">
              <span className="font-bold truncate" title={p.nome}>{p.sku}</span>
              <button onClick={() => removerVinculo(mlItem.id, p.sku)} className="text-red-500 hover:text-red-700 px-1">✕</button>
            </div>
          ))}
          <select onChange={(e) => vincularSKUManual(mlItem.id, e.target.value)} value="" className="w-full mt-1 p-1.5 text-[10px] bg-white border border-slate-200 rounded outline-none text-slate-600">
            <option value="" disabled>+ Vincular SKU do ERP</option>
            {catalogo.map(c => <option key={c.sku} value={c.sku}>{c.sku}</option>)}
          </select>
        </td>

        <td className="p-4 align-top">
          {produtosLocais.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200"><AlertTriangle className="w-3 h-3"/> Aguarda Vínculo</span>
          ) : arrayDivergencias.length > 0 ? (
            <div className="flex flex-col gap-2 items-start">
              <div className="w-full bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded-lg text-xs font-bold text-center flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5"/> {arrayDivergencias.length} Divergência(s)
              </div>
              <button onClick={() => setModalDivergencia({ itemML: mlItem, divergencias: arrayDivergencias, erpItem: produtosLocais[0] })} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase py-1.5 rounded-lg">
                Corrigir Ficha
              </button>
            </div>
          ) : (
            <span className="w-full inline-flex items-center justify-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-1.5 rounded-lg border border-emerald-200"><CheckCircle2 className="w-4 h-4"/> 100% Conciliado</span>
          )}

          <div className="mt-3 pt-3 border-t border-slate-100">
            {isValidadoTab ? (
               <button onClick={() => alternarValidacao(mlItem.id)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold py-1.5 rounded-lg">Voltar p/ Auditoria</button>
            ) : (
               <button onClick={() => alternarValidacao(mlItem.id)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 rounded-lg">Arquivar (Validar)</button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-2 flex flex-col animate-in fade-in duration-300" style={{ minHeight: '100vh' }}>

      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-4 gap-2">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl"><ShoppingBag className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-black text-slate-800 leading-tight">Hub Mercado Livre</h1>
            <p className="text-xs text-slate-500 font-medium">Auditoria ERP e Automação de Catálogo</p>
          </div>
        </div>
        
        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <button onClick={() => setAbaAtiva('catalogo')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${abaAtiva === 'catalogo' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}><Box className="w-3.5 h-3.5 inline mr-1.5 mb-0.5"/>Catálogo ERP</button>
          <button onClick={() => setAbaAtiva('auditoria')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${abaAtiva === 'auditoria' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}><Search className="w-3.5 h-3.5 inline mr-1.5 mb-0.5"/>Auditoria ML</button>
          <button onClick={() => setAbaAtiva('validados')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${abaAtiva === 'validados' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}><CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 mb-0.5"/>Validados <span className="bg-white/20 px-1.5 rounded ml-1">{validados.length}</span></button>
          <button onClick={() => setAbaAtiva('fila')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${abaAtiva === 'fila' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}><ShoppingCartIcon className="w-3.5 h-3.5 inline mr-1.5 mb-0.5"/>Fila <span className="bg-white/30 px-1.5 rounded ml-1">{Object.keys(filaEnvio).length}</span></button>
          <button onClick={() => setAbaAtiva('historico')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${abaAtiva === 'historico' ? 'bg-slate-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}><History className="w-3.5 h-3.5 inline mr-1.5 mb-0.5"/>Histórico</button>
        </div>
      </div>

      <div className="flex-1 space-y-4">

        {/* ================= ABA: CATÁLOGO ================= */}
        {abaAtiva === 'catalogo' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-800">Catálogo Base</h2>
                <p className="text-xs text-slate-500">Cadastre os pesos e medidas reais para o sistema auditar o ML.</p>
              </div>
              <button onClick={exportarCSV} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors"><Download className="w-4 h-4"/> Exportar CSV</button>
            </div>

            <form onSubmit={salvarProduto} className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="md:col-span-1"><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">SKU *</label><input required disabled={catalogo.some(c => c.sku === novoProd.sku) && novoProd.nome !== ''} value={novoProd.sku} onChange={e => setNovoProd({...novoProd, sku: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" placeholder="CÓDIGO" /></div>
                <div className="md:col-span-3"><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Nome do Produto *</label><input required value={novoProd.nome} onChange={e => setNovoProd({...novoProd, nome: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" placeholder="Descrição completa" /></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                <div className="md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Cód. Barras (EAN)</label><input value={novoProd.ean} onChange={e => setNovoProd({...novoProd, ean: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" /></div>
                <div className="md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Marca</label><input value={novoProd.marca} onChange={e => setNovoProd({...novoProd, marca: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" /></div>
                <div className="md:col-span-2"><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Modelo</label><input value={novoProd.modelo} onChange={e => setNovoProd({...novoProd, modelo: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" /></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="text-[10px] font-black uppercase text-slate-500 mb-1 flex items-center gap-1"><Weight className="w-3 h-3"/> Peso (g)</label><input type="number" value={novoProd.peso} onChange={e => setNovoProd({...novoProd, peso: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Altura (cm)</label><input type="number" value={novoProd.altura} onChange={e => setNovoProd({...novoProd, altura: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Largura (cm)</label><input type="number" value={novoProd.largura} onChange={e => setNovoProd({...novoProd, largura: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Comprim. (cm)</label><input type="number" value={novoProd.comprimento} onChange={e => setNovoProd({...novoProd, comprimento: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white" /></div>
              </div>
              <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="button" onClick={() => setNovoProd(FORM_INICIAL)} className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 transition-colors">Limpar Form</button>
                <button type="submit" className="px-6 py-2 rounded-xl text-xs font-black uppercase text-white bg-slate-800 hover:bg-slate-900 transition-colors flex items-center gap-2"><Check className="w-4 h-4"/> Salvar Produto</button>
              </div>
            </form>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr><th className="p-3 text-xs font-bold text-slate-500">ID / Nome</th><th className="p-3 text-xs font-bold text-slate-500">Ficha Logística</th><th className="p-3 text-xs font-bold text-slate-500 text-right">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catalogoPaginado.map(prod => (
                    <tr key={prod.sku} className="hover:bg-slate-50/50">
                      <td className="p-3"><div className="font-bold text-slate-800">{prod.sku}</div><div className="text-xs text-slate-500">{prod.nome}</div></td>
                      <td className="p-3 text-xs text-slate-600 space-y-0.5">
                        {prod.ean && <div><span className="font-medium text-slate-400">EAN:</span> {prod.ean}</div>}
                        {(prod.marca || prod.modelo) && <div><span className="font-medium text-slate-400">M/M:</span> {prod.marca} {prod.modelo}</div>}
                        <div><span className="font-medium text-slate-400">Dim/Peso:</span> {prod.altura}x{prod.largura}x{prod.comprimento}cm | <span className="font-bold text-blue-600">{prod.peso}g</span></div>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => carregarParaEdicao(prod)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-1"><Settings className="w-4 h-4"/></button>
                        <button onClick={() => apagarProduto(prod.sku)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                      </td>
                    </tr>
                  ))}
                  {catalogo.length === 0 && <tr><td colSpan="3" className="p-8 text-center text-slate-400 text-sm">Catálogo vazio.</td></tr>}
                </tbody>
              </table>
            </div>
            <PaginacaoUI paginaAtual={paginaCatalogo} totalPaginas={Math.ceil(catalogo.length / itensPorPagina) || 1} setPagina={setPaginaCatalogo} />
          </div>
        )}

        {/* ================= ABA: AUDITORIA ML (PENDENTES) ================= */}
        {abaAtiva === 'auditoria' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-h-[600px]">
            {!status.connected ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-4"><WifiOff className="w-8 h-8"/></div>
                <h2 className="text-xl font-black text-slate-800 mb-2">Conexão Necessária</h2>
                <p className="text-slate-500 text-sm mb-6 max-w-md">Para auditar seus anúncios, precisamos de permissão para ler o catálogo do seu Mercado Livre.</p>
                <button onClick={conectarML} className="bg-[#FFE600] text-slate-900 font-black uppercase text-sm px-6 py-3 rounded-xl hover:bg-[#facc15] transition-colors flex items-center gap-2 shadow-sm"><ShoppingBag className="w-5 h-5"/> Conectar Conta Oficial</button>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap justify-between items-center mb-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg"><CheckCircle2 className="w-4 h-4"/> {status.nickname}</span>
                    <button onClick={desconectarML} className="text-xs font-bold text-red-500 hover:text-red-700 underline">Desconectar</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={autoArquivarConciliados} className="bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Auto-Arquivar Perfeitos</button>
                    <button onClick={buscarAnuncios} disabled={loading} className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/> Sincronizar
                    </button>
                  </div>
                </div>

                {anunciosML.length > 0 && (
                  <div className="mb-5 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 p-3 rounded-xl">
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><Tag className="w-4 h-4"/> Filtrar Etiqueta:</span>
                      <button onClick={() => { setFiltroEtiqueta(''); setPaginaAuditoria(1); }} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${filtroEtiqueta === '' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todas</button>
                      {todasAsEtiquetas.map(tag => (
                        <button key={tag} onClick={() => { setFiltroEtiqueta(tag); setPaginaAuditoria(1); }} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${filtroEtiqueta === tag ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{tag}</button>
                      ))}
                    </div>

                    {filtroEtiqueta && (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-4 rounded-xl">
                        <div>
                          <b className="text-blue-800 text-sm flex items-center gap-2"><Sparkles className="w-4 h-4"/> Ação em Lote ({filtroEtiqueta})</b>
                          <p className="text-xs text-blue-600 mt-1">Alterar preço/estoque de <b>{anunciosFiltrados.length}</b> itens filtrados.</p>
                        </div>
                        <div className="flex gap-2">
                          <input type="number" step="any" placeholder="Novo Preço R$" id="mass_preco_filtro" className="w-32 px-3 py-2 rounded-lg border border-blue-200 text-sm outline-none focus:border-blue-500 bg-white" />
                          <input type="number" placeholder="Novo Estoque" id="mass_estoque_filtro" className="w-32 px-3 py-2 rounded-lg border border-blue-200 text-sm outline-none focus:border-blue-500 bg-white" />
                          <button onClick={adicionarFiltradosAFila} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700">Filar Todos</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr><th className="p-4 font-bold text-slate-600 w-[35%]">Anúncio e Etiquetas</th><th className="p-4 font-bold text-slate-600 w-[20%]">Preço/Estoque</th><th className="p-4 font-bold text-slate-600 w-[20%]">Vínculo ERP</th><th className="p-4 font-bold text-slate-600 w-[25%] text-center">Status Conciliação</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {anunciosPendentesPaginado.length === 0 ? <tr><td colSpan="4" className="p-10 text-center text-slate-500 text-sm">Nenhum anúncio pendente. Arquivados ficam na aba "Validados".</td></tr> : anunciosPendentesPaginado.map(mlItem => renderizarLinhaAnuncio(mlItem, false))}
                    </tbody>
                  </table>
                </div>
                <PaginacaoUI paginaAtual={paginaAuditoria} totalPaginas={Math.ceil(pendentesList.length / itensPorPagina) || 1} setPagina={setPaginaAuditoria} />
              </div>
            )}
          </div>
        )}

        {/* ================= ABA: VALIDADOS ================= */}
        {abaAtiva === 'validados' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-h-[600px]">
            <div className="mb-5 pb-4 border-b border-slate-100 flex items-center gap-3">
              <div className="bg-emerald-100 p-2.5 rounded-xl"><CheckCircle2 className="w-6 h-6 text-emerald-600"/></div>
              <div>
                <h2 className="text-xl font-black text-slate-800">Perfeitamente Conciliados</h2>
                <p className="text-xs text-slate-500">Anúncios conferidos. Ficam aqui para não poluir sua caixa de entrada.</p>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-emerald-50 border-b border-emerald-100">
                  <tr><th className="p-4 font-bold text-emerald-800 w-[35%]">Anúncio</th><th className="p-4 font-bold text-emerald-800 w-[20%]">Preço/Estoque</th><th className="p-4 font-bold text-emerald-800 w-[20%]">Vínculo</th><th className="p-4 font-bold text-emerald-800 w-[25%] text-center">Gerenciar</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {anunciosValidadosPaginado.length === 0 ? <tr><td colSpan="4" className="p-10 text-center text-slate-500 text-sm">Nenhum anúncio validado.</td></tr> : anunciosValidadosPaginado.map(mlItem => renderizarLinhaAnuncio(mlItem, true))}
                </tbody>
              </table>
            </div>
            <PaginacaoUI paginaAtual={paginaValidados} totalPaginas={Math.ceil(validadosList.length / itensPorPagina) || 1} setPagina={setPaginaValidados} />
          </div>
        )}

        {/* ================= ABA: FILA DE ENVIO ================= */}
        {abaAtiva === 'fila' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-h-[600px]">
            <div className="mb-5 pb-4 border-b border-slate-100 flex items-center gap-3">
              <div className="bg-amber-100 p-2.5 rounded-xl"><Clock className="w-6 h-6 text-amber-600"/></div>
              <div>
                <h2 className="text-xl font-black text-slate-800">Carrinho de Atualização</h2>
                <p className="text-xs text-slate-500">Altere preços na tela anterior, e dispare para o ML todos de uma vez por aqui.</p>
              </div>
            </div>
            
            {statusEnvioMassa?.ativo && (
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl mb-6">
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <span className="text-blue-600 font-bold text-sm block mb-1">{statusEnvioMassa.mensagem}</span>
                    <span className="text-slate-500 text-xs">Pausas anti-bloqueio inclusas. Restam ~{statusEnvioMassa.segundosRestantes}s</span>
                  </div>
                  <div className="text-2xl font-black text-slate-800">{statusEnvioMassa.atual} <span className="text-sm text-slate-400 font-bold">/ {statusEnvioMassa.total}</span></div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${(statusEnvioMassa.atual / statusEnvioMassa.total) * 100}%` }}></div>
                </div>
              </div>
            )}

            {Object.keys(filaEnvio).length === 0 && !statusEnvioMassa?.ativo ? (
              <div className="text-center py-20 text-slate-400 font-bold text-sm">Nenhuma alteração pendente de envio.</div>
            ) : (
              <div>
                {!statusEnvioMassa?.ativo && <button onClick={enviarTudoParaML} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black text-lg py-4 rounded-2xl transition-colors mb-6 shadow-md shadow-amber-500/20">🚀 DISPARAR LOTE COM SEGURANÇA</button>}
                
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr><th className="p-4 text-slate-600">Anúncio</th><th className="p-4 text-slate-600">Novos Valores</th><th className="p-4 text-slate-600 text-right">Ação</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.keys(filaEnvio).map(id => (
                        <tr key={id} className="hover:bg-slate-50">
                          <td className="p-4 text-slate-800 font-medium">{filaEnvio[id].titulo}</td>
                          <td className="p-4"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold mr-2">R$ {filaEnvio[id].preco}</span><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">Estoque: {filaEnvio[id].estoque}</span></td>
                          <td className="p-4 text-right"><button disabled={statusEnvioMassa?.ativo} onClick={() => { const nova = {...filaEnvio}; delete nova[id]; setFilaEnvio(nova); }} className="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50">Remover</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= ABA: HISTÓRICO ================= */}
        {abaAtiva === 'historico' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-h-[600px]">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="bg-slate-100 p-2.5 rounded-xl"><History className="w-6 h-6 text-slate-600"/></div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">Logs do Sistema</h2>
                  <p className="text-xs text-slate-500">Histórico de erros e sucessos de sincronização com o ML.</p>
                </div>
              </div>
              <button onClick={limparHistorico} className="text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"><Trash2 className="w-4 h-4"/> Limpar Tudo</button>
            </div>

            {historico.length === 0 ? <div className="text-center py-20 text-slate-400 font-bold text-sm">Nenhum log registrado.</div> : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><th className="p-3 text-slate-500">Data</th><th className="p-3 text-slate-500">Anúncio</th><th className="p-3 text-slate-500">Detalhe da Ação</th><th className="p-3 text-slate-500">Resultado ML</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historicoPaginado.map((log, i) => (
                      <tr key={i} className={log.status.includes('✅') ? 'bg-emerald-50/30' : 'bg-red-50/30'}>
                        <td className="p-3 text-slate-500 w-[15%]">{log.data}</td>
                        <td className="p-3 w-[35%]"><div className="font-bold text-slate-700">{log.id}</div><div className="text-slate-500 truncate max-w-[250px]">{log.titulo}</div></td>
                        <td className="p-3 w-[25%]"><div className="font-bold text-slate-700">{log.acao}</div><div className="text-slate-500">{log.detalhes}</div></td>
                        <td className={`p-3 font-bold w-[25%] ${log.status.includes('✅') ? 'text-emerald-600' : 'text-red-600'}`}>{log.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginacaoUI paginaAtual={paginaHistorico} totalPaginas={Math.ceil(historico.length / itensPorPagina) || 1} setPagina={setPaginaHistorico} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Icon SVG Helper if needed
function ShoppingCartIcon(props) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>;
}