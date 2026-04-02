// backend/src/ia/agents/searchAgent.js
import { GoogleGenAI } from '@google/genai';

// ─── Logger ───────────────────────────────────────────────────────────────────
function logAgent(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const ico = { info: '🔎', success: '✅', warn: '⚠️', error: '❌' }[type] || '🔎';
  console.log(`\x1b[33m[Agent-Search]\x1b[0m [${t}] ${ico}  ${msg}`);
}

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada no .env');
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Agente de Pesquisa Profunda
 * Vasculha a internet em tempo real usando a ferramenta nativa do Google Search.
 */
export async function agentePesquisaProfunda(pergunta, contextoAnterior = '') {
  logAgent(`Iniciando pesquisa profunda para: "${pergunta.substring(0, 50)}..."`, 'info');
  
  try {
    const ai = getClient();
    
    // Usamos o Flash para pesquisa por ser extremamente rápido e ter acesso web
    const model = 'gemini-2.5-flash'; 
    
    const prompt = `
Você é o Agente de Pesquisa Profunda da Analyiz.
Sua missão é buscar na internet as informações mais precisas, atualizadas e profundas sobre a solicitação do usuário.
Se o usuário mandar um link, pesquise sobre o conteúdo dele.
Traga dados reais, fatos, links de referência e um resumo completo do que encontrou na web.

CONTEXTO PRÉVIO:
${contextoAnterior}

SOLICITAÇÃO DO USUÁRIO:
${pergunta}
    `;

    // Ativando a ferramenta oficial de pesquisa do Google (Grounding)
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.2, // Baixa criatividade, alto rigor factual
        tools: [{ googleSearch: {} }], // <--- O segredo da pesquisa web em tempo real
      }
    });

    const resultadoPesquisa = response.text || '';
    
    // Extrai os links de fontes que o Google usou para embasar a pesquisa
    const searchChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const fontesWeb = searchChunks
      .map(chunk => chunk.web?.uri)
      .filter(uri => uri);

    logAgent(`Pesquisa concluída. ${fontesWeb.length} fontes web encontradas.`, 'success');

    return {
      sucesso: true,
      dadosEncontrados: resultadoPesquisa,
      fontes: fontesWeb
    };

  } catch (error) {
    logAgent(`Falha na pesquisa profunda: ${error.message}`, 'error');
    return {
      sucesso: false,
      dadosEncontrados: 'Não foi possível acessar a internet no momento.',
      fontes: []
    };
  }
}