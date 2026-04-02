// backend/src/ia/agents/searchAgent.js — v2 (Logs Narrativos para SSE)
// Mudanças v2:
//  - Adicionado callback `onLog` para emitir eventos SSE narrativos e imersivos
//  - Logs em primeira pessoa, descrevendo o que o agente está fazendo em tempo real
//  - Retorna `fontes` estruturadas (uri + title) para exibição no frontend

import { GoogleGenAI } from '@google/genai';

// ─── Logger de terminal ───────────────────────────────────────────────────────
function logAgent(msg, type = 'info') {
  const t   = new Date().toLocaleTimeString('pt-BR');
  const ico = { info: '🔎', success: '✅', warn: '⚠️', error: '❌' }[type] || '🔎';
  console.log(`\x1b[33m[Agent-Search]\x1b[0m [${t}] ${ico}  ${msg}`);
}

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada no .env');
  return new GoogleGenAI({ apiKey: key });
}

// ─── Narrativas por tipo de busca ─────────────────────────────────────────────
function narrativaInicio(pergunta) {
  const p = (pergunta || '').toLowerCase();
  if (/preço|custo|valor|quanto/i.test(p))
    return 'Detectei uma consulta de preços. Vou varrer marketplaces e fontes de referência para trazer valores atuais...';
  if (/concorrente|competidor|versus|comparar/i.test(p))
    return 'Vou mapear os concorrentes na web, analisando preços, diferenciais e estratégias de posicionamento...';
  if (/tendência|trend|mercado|crescimento/i.test(p))
    return 'Preciso de dados de mercado atuais. Iniciando varredura em relatórios, portais especializados e fóruns...';
  if (/notícia|news|lançamento|novidade/i.test(p))
    return 'Buscando as notícias mais recentes sobre o tema em fontes confiáveis e portais jornalísticos...';
  if (/https?:\/\/|www\./i.test(p))
    return 'Identificei uma URL. Vou acessar e analisar o conteúdo da página para te dar um resumo completo...';
  return 'A solicitação requer dados externos. Iniciando varredura na internet para trazer informações atualizadas...';
}

/**
 * Agente de Pesquisa Profunda
 * Vasculha a internet em tempo real usando Google Search nativo do Gemini.
 *
 * @param {string}   pergunta         - O que buscar
 * @param {string}   contextoAnterior - Contexto adicional da sessão
 * @param {Function} onLog            - Callback(msg: string, tipo: string) para emitir SSE ao frontend
 */
export async function agentePesquisaProfunda(pergunta, contextoAnterior = '', onLog = null) {
  const emit = (msg, tipo = 'info') => {
    logAgent(msg, tipo);
    if (onLog) onLog(msg, tipo);
  };

  emit('A solicitação do usuário requer dados externos. Chamando o Agente de Pesquisa...', 'info');
  emit('Agente de Pesquisa a postos, analisando solicitação...', 'info');
  emit(narrativaInicio(pergunta), 'info');

  try {
    const ai    = getClient();
    const model = 'gemini-2.5-flash';

    const prompt = `
Você é o Agente de Pesquisa Profunda da Analyiz, especialista em e-commerce, logística e mercado brasileiro.
Sua missão é buscar na internet as informações mais precisas, atualizadas e profundas sobre a solicitação.

CONTEXTO DA SESSÃO:
${contextoAnterior || '(sem contexto adicional)'}

SOLICITAÇÃO:
${pergunta}

INSTRUÇÕES:
- Se houver uma URL, acesse e analise o conteúdo dela.
- Busque preços reais, nomes de vendedores, avaliações e dados de mercado quando relevante.
- Seja técnico e direto. Cite números e fontes específicas.
- Responda em português brasileiro.
    `.trim();

    emit('Compreendi a busca. Iniciando varredura na internet...', 'info');

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.15,
        tools: [{ googleSearch: {} }],
      },
    });

    // Extrai fontes do grounding metadata
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const fontes = groundingChunks
      .filter(c => c.web?.uri)
      .map(c => ({
        uri:   c.web.uri,
        title: c.web.title || c.web.uri,
      }));

    // Deduplica por uri
    const fontesUnicas = [...new Map(fontes.map(f => [f.uri, f])).values()];
    const hosts = fontesUnicas.map(f => {
      try { return new URL(f.uri).hostname.replace('www.', ''); } catch { return f.uri; }
    });

    if (hosts.length > 0) {
      emit(`Sites visitados: ${hosts.slice(0, 6).join(', ')}`, 'success');
    } else {
      emit('Varredura na web concluída.', 'success');
    }

    emit(`Tarefas de busca concluídas. Dados repassados para a IA Mãe...`, 'success');

    return {
      sucesso:         true,
      dadosEncontrados: response.text || '',
      fontes:          fontesUnicas,
      sitesVisitados:  hosts,
    };

  } catch (error) {
    emit(`Falha na pesquisa externa: ${error.message}`, 'error');
    logAgent(`Erro: ${error.message}`, 'error');
    return {
      sucesso:          false,
      dadosEncontrados: 'Não foi possível acessar a internet no momento.',
      fontes:           [],
      sitesVisitados:   [],
    };
  }
}