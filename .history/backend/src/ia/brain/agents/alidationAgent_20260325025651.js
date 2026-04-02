// backend/src/ia/agents/validationAgent.js
import { GoogleGenAI } from '@google/genai';

// ─── Logger ───────────────────────────────────────────────────────────────────
function logAgent(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const ico = { info: '⚖️', success: '✅', warn: '⚠️', error: '❌' }[type] || '⚖️';
  console.log(`\x1b[35m[Agent-Validator]\x1b[0m [${t}] ${ico}  ${msg}`);
}

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada no .env');
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Agente Validador
 * Analisa rigorosamente uma resposta antes dela ser enviada ao usuário.
 * Exige JSON como saída.
 */
export async function agenteValidador(perguntaOriginal, respostaProposta, dadosPesquisaWeb = '', contextoInterno = '') {
  logAgent('Validando resposta...', 'info');

  try {
    const ai = getClient();
    const model = 'gemini-2.5-flash';

    const prompt = `
Você é o Agente Validador de Qualidade e Fatos da IA Analyiz.
Sua única função é atuar como uma barreira de segurança.
Analise a resposta proposta frente à pergunta, aos dados da web e ao contexto do sistema.

PERGUNTA DO USUÁRIO: "${perguntaOriginal}"
DADOS DA PESQUISA WEB: "${dadosPesquisaWeb.substring(0, 1000)}"
CONTEXTO DO SISTEMA: "${contextoInterno.substring(0, 1000)}"

RESPOSTA PROPOSTA A SER VALIDADA:
"${respostaProposta}"

REGRAS DE VALIDAÇÃO:
1. A resposta propõe fatos falsos ou alucinações baseadas nos dados fornecidos?
2. A resposta é coerente com a pesquisa da Web?
3. A resposta fere alguma política de segurança?

Retorne APENAS um JSON válido neste formato exato, sem marcações markdown:
{
  "aprovada": true,
  "nivelConfianca": 0.95,
  "motivo": "Resposta coerente e factual.",
  "respostaCorrigida": null
}
Caso 'aprovada' seja false, preencha 'respostaCorrigida' com a versão segura e correta.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.0, // Nenhuma criatividade. 100% analítico.
        responseMimeType: "application/json" // Força saída em JSON
      }
    });

    let resultado;
    try {
      resultado = JSON.parse(response.text);
    } catch (parseError) {
      // Fallback seguro caso a IA não obedeça o formato
      const limpo = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      resultado = JSON.parse(limpo);
    }

    if (resultado.aprovada) {
      logAgent(`Resposta APROVADA. Confiança: ${resultado.nivelConfianca}`, 'success');
    } else {
      logAgent(`Resposta REPROVADA. Interceptando e corrigindo. Motivo: ${resultado.motivo}`, 'warn');
    }

    return {
      aprovada: resultado.aprovada,
      motivo: resultado.motivo,
      respostaFinal: resultado.aprovada ? respostaProposta : resultado.respostaCorrigida
    };

  } catch (error) {
    logAgent(`Erro crítico no validador: ${error.message}`, 'error');
    // Se o validador falhar, em produção geralmente liberamos a resposta original ou damos fallback
    return {
      aprovada: true,
      motivo: 'Erro no validador (Fallback)',
      respostaFinal: respostaProposta
    };
  }
}