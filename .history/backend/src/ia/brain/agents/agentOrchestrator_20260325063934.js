// backend/src/ia/agents/agentOrchestrator.js
// ═══════════════════════════════════════════════════════════════════════════════
// Orquestrador de Agentes — Roteador inteligente que decide qual agente acionar
// Integrado ao fluxo do processarMensagemComAprendizado do iaBrain.js
// ═══════════════════════════════════════════════════════════════════════════════

import { GoogleGenAI } from '@google/genai';

const GEMINI_FLASH = 'gemini-2.5-flash';

function logOrch(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const ico = { info: '🎯', success: '✅', warn: '⚠️', error: '❌', agent: '🤖' }[type] || '🎯';
  console.log(`\x1b[33m[Orchestrator]\x1b[0m [${t}] ${ico}  ${msg}`);
}

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: key });
}

// ─── Detecção de intenção ─────────────────────────────────────────────────────
const PESQUISA_REGEX = /pesquisa|pesquisar|pesquisando|mercado|concorrente|preço.*web|web.*preço|buscar na internet|busca.*online|busca.*web|tendencia|tendência|buscar|procurar|o que é|como funciona|quanto custa|análise.*mercado|market.*research|comparar.*mercado|pesquisa.*produto|buscar.*produto|pesquisar.*produto|noticias|notícias|informações sobre|fatos sobre|dados sobre|estatistica|estatística|história|wikipedia|como fazer|como se|artigo|blog|site|url|http|www\.|\.com|monitorar|rastrear|rastreio.*produto|ver site|acessar site/i;

const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+\.[a-z]{2,}/i;

/**
 * Detecta se a mensagem requer pesquisa web
 */
export function precisaPesquisaWeb(mensagem) {
  if (!mensagem) return false;
  return PESQUISA_REGEX.test(mensagem) || URL_REGEX.test(mensagem);
}

/**
 * Agente de Pesquisa Profunda com Google Search (streaming de logs)
 * Substitui o agentePesquisaProfunda do iaBrain.js
 */
export async function agentePesquisaWebStream(pergunta, contexto = '', onLog = null) {
  const addLog = (msg, tipo = 'info') => {
    logOrch(msg, tipo);
    if (onLog) onLog(msg, tipo);
  };

  addLog(`🌐 Agente de Pesquisa ativado para: "${pergunta.substring(0, 60)}..."`, 'agent');

  try {
    const ai = getClient();

    const prompt = `Você é o Agente de Pesquisa Profunda da Analyiz, especialista em e-commerce e mercado brasileiro.

Sua missão é realizar uma pesquisa WEB completa e detalhada sobre:
"${pergunta}"

Contexto do sistema:
${contexto || 'Plataforma de gestão de e-commerce e logística.'}

INSTRUÇÕES:
1. Busque informações atualizadas na web sobre o tema
2. Se for pesquisa de mercado: busque preços, concorrentes, tendências e análise competitiva
3. Se for sobre um produto específico: busque ficha técnica, preços de mercado, avaliações, fornecedores
4. Se for uma URL: acesse e analise o conteúdo
5. Cite os sites visitados e as fontes encontradas

Formate a resposta em HTML limpo (<b>, <br>, <ul>, <li>) com:
- Resumo executivo
- Dados encontrados com valores/números reais
- Análise e insights relevantes
- Fontes utilizadas`;

    addLog('🔍 Conectando ao Google Search...', 'info');

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
      },
    });

    // Extrai fontes/links do grounding metadata
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingSupports = response.candidates?.[0]?.groundingMetadata?.groundingSupports || [];
    
    const fontes = groundingChunks
      .map(chunk => ({
        uri: chunk.web?.uri || '',
        title: chunk.web?.title || chunk.web?.uri || 'Fonte',
      }))
      .filter(f => f.uri);

    const sitesVisitados = [...new Set(fontes.map(f => {
      try { return new URL(f.uri).hostname.replace('www.', ''); } catch { return f.uri; }
    }))];

    if (sitesVisitados.length > 0) {
      addLog(`📡 Sites visitados: ${sitesVisitados.slice(0, 5).join(', ')}`, 'success');
    } else {
      addLog('📡 Pesquisa web concluída', 'success');
    }

    const resultado = response.text || '';
    addLog(`✅ ${fontes.length} fonte(s) referenciada(s)`, 'success');

    return {
      sucesso: true,
      conteudo: resultado,
      fontes: fontes,
      sitesVisitados: sitesVisitados,
    };

  } catch (e) {
    addLog(`❌ Erro na pesquisa web: ${e.message}`, 'error');
    return {
      sucesso: false,
      conteudo: `Não foi possível realizar a pesquisa web: ${e.message}`,
      fontes: [],
      sitesVisitados: [],
    };
  }
}

/**
 * Agente Validador — verifica a resposta antes de enviar ao usuário
 */
export async function agenteValidadorStream(pergunta, resposta, dadosWeb = '', contexto = '', onLog = null) {
  const addLog = (msg, tipo = 'info') => {
    if (onLog) onLog(msg, tipo);
  };

  addLog('⚖️ Agente Validador verificando resposta...', 'info');

  try {
    const ai = getClient();

    const prompt = `Você é o Agente Validador da IA Analyiz. Analise rigorosamente:

PERGUNTA: "${pergunta.substring(0, 300)}"
DADOS DA WEB: "${dadosWeb.substring(0, 800)}"
CONTEXTO: "${contexto.substring(0, 400)}"
RESPOSTA PROPOSTA: "${resposta.substring(0, 800)}"

Verifique:
1. Há informações falsas ou alucinações?
2. Os dados são coerentes com o que foi pesquisado?
3. A resposta é útil e completa?

Retorne JSON puro (sem markdown):
{
  "aprovada": true,
  "nivelConfianca": 0.95,
  "motivo": "Resposta coerente e factual.",
  "respostaCorrigida": null
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.0,
      },
    });

    let resultado;
    try {
      resultado = JSON.parse(response.text);
    } catch {
      const limpo = (response.text || '{}').replace(/```json|```/g, '').trim();
      try { resultado = JSON.parse(limpo); } catch { resultado = { aprovada: true, motivo: 'parse_error' }; }
    }

    if (resultado.aprovada) {
      addLog(`✅ Resposta validada (confiança: ${Math.round((resultado.nivelConfianca || 0.8) * 100)}%)`, 'success');
    } else {
      addLog(`⚠️ Resposta corrigida: ${resultado.motivo}`, 'warn');
    }

    return {
      aprovada: resultado.aprovada !== false,
      respostaFinal: resultado.aprovada !== false ? resposta : (resultado.respostaCorrigida || resposta),
      confianca: resultado.nivelConfianca || 0.8,
      motivo: resultado.motivo || '',
    };

  } catch (e) {
    return { aprovada: true, respostaFinal: resposta, confianca: 0.5, motivo: 'validation_error' };
  }
}

/**
 * Pipeline completo: Pesquisa → Geração → Validação
 * Usado pela rota de streaming SSE do chat
 */
export async function executarPipelineAgentes({ mensagem, contextoSistema = '', buildAnswer, historyRaw = [], extraContext = '', onStep, onLog, onFontes }) {
  const addStep = (msg) => { if (onStep) onStep(msg); };
  const addLog  = (msg, tipo = 'info') => { if (onLog) onLog(msg, tipo); };

  addStep('🤖 Ativando Agente de Pesquisa...');
  addLog('Iniciando pipeline de agentes...', 'info');

  // ── 1. Pesquisa Web ────────────────────────────────────────────────────────
  const pesquisa = await agentePesquisaWebStream(mensagem, contextoSistema, (msg, tipo) => {
    addLog(msg, tipo);
    // Repassa sites visitados para o frontend via onStep
    if (msg.includes('Sites visitados:')) addStep(msg);
  });

  let dadosWebFormatados = '';
  if (pesquisa.sucesso) {
    dadosWebFormatados = pesquisa.conteudo;
    if (onFontes && pesquisa.fontes.length > 0) {
      onFontes(pesquisa.fontes);
    }
  }

  // ── 2. Geração da Resposta com contexto da pesquisa ────────────────────────
  addStep('🧠 Compilando análise com dados encontrados...');
  addLog('Gerando resposta com dados da pesquisa...', 'info');

  const dataBlockEnriquecido = [
    extraContext,
    dadosWebFormatados ? `\n=== DADOS DA PESQUISA WEB ===\n${dadosWebFormatados}` : '',
    pesquisa.fontes.length > 0
      ? `\n=== FONTES CONSULTADAS ===\n${pesquisa.fontes.map(f => `• ${f.title}: ${f.uri}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  const { reply, sources } = await buildAnswer(mensagem, historyRaw, {
    ...contextoSistema,
    dataBlock: dataBlockEnriquecido,
  });

  // ── 3. Validação ───────────────────────────────────────────────────────────
  addStep('⚖️ Validando resposta...');

  const validacao = await agenteValidadorStream(
    mensagem,
    reply,
    dadosWebFormatados,
    dataBlockEnriquecido.substring(0, 400),
    addLog
  );

  return {
    reply: validacao.respostaFinal,
    sources: [...(sources || []), ...pesquisa.fontes.map(f => f.uri)],
    fontes: pesquisa.fontes,
    sitesVisitados: pesquisa.sitesVisitados,
    usouPesquisaWeb: pesquisa.sucesso,
  };
}