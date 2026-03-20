// IA ANALYIZ — Serviço de Inteligência Neural
// Arquivo: src/iaService.js

import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite';
const MAX_HISTORY           = 20;

/**
 * Retorna o cliente GoogleGenAI inicializado.
 */
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada no .env');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/**
 * Monta o system prompt da IA Analyiz com base no contexto do banco de dados.
 *
 * @param {number} totalProdutos
 * @param {number} totalDivergencias
 * @param {string} userRole
 */
function buildSystemInstruction(totalProdutos, totalDivergencias, userRole) {
  return `Você é a *IA Analyiz*, auditora de logística e e-commerce criada pelo Ander.
Você analisa dados do sistema, detecta divergências e orienta a equipe.

DADOS ATUAIS DO SISTEMA:
• Produtos cadastrados: ${totalProdutos}
• Divergências abertas: ${totalDivergencias}
• Role do usuário atual: ${userRole || 'USUÁRIO'}

PERSONALIDADE:
- Técnica, direta e objetiva
- Use termos de logística e e-commerce com naturalidade
- Pode usar emojis com moderação para organizar informações (📦 ⚠️ ✅ 📊)
- Respostas concisas — máx 3 parágrafos salvo quando análise detalhada for solicitada

REGRAS:
1. NUNCA invente dados — se não sabe, diga explicitamente
2. Quando citar divergências, sempre mencione que o usuário pode verificar na aba correspondente
3. Formato WhatsApp/markdown leve: *negrito* _itálico_ — sem ## títulos ou tabelas
4. Se o usuário perguntar sobre produtos ou divergências específicas, oriente a consultar o painel
5. Você não tem acesso em tempo real a IDs específicos — trabalhe com os totais fornecidos

SOBRE O SISTEMA:
- Plataforma de gestão de produtos e auditoria de anúncios no Mercado Livre
- O bot de varredura compara pesos internos vs. pesos registrados no ML
- Kits têm peso calculado como soma dos componentes
- Divergências ficam salvas no banco até serem marcadas como resolvidas`;
}

/**
 * Resposta de fallback quando a IA não está disponível.
 */
function getFallbackResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('divergência') || lower.includes('divergencia'))
    return '⚠️ Não consegui acessar o kernel agora. Verifique a aba de **Divergências** no painel para ver as pendências abertas.';
  if (lower.includes('produto'))
    return '📦 Não consegui acessar o kernel agora. Os produtos podem ser consultados diretamente no painel de cadastro.';
  return '⚠️ Erro de conexão com o Kernel da IA. Tente novamente em instantes.';
}

/**
 * Envia uma mensagem para a IA Analyiz com histórico de conversa.
 * Usa exatamente o mesmo padrão do ContentCreatorBot:
 *   ai.models.generateContent({ model, config, contents })
 *
 * @param {string} message           - Mensagem atual do usuário
 * @param {Array}  history           - Histórico [{role: 'ia'|'user', content: string}]
 * @param {Object} context           - { totalProdutos, totalDivergencias, userRole }
 * @param {number} attempt           - Tentativa atual (para retry interno)
 * @returns {Promise<string>}        - Resposta da IA em texto
 */
export async function sendChatMessage(message, history = [], context = {}, attempt = 1) {
  const { totalProdutos = 0, totalDivergencias = 0, userRole = 'USUÁRIO' } = context;
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;

  try {
    const ai = getClient();

    // Converte histórico do formato interno {role: 'ia'|'user'} para o formato Gemini
    // Exatamente como o ContentCreatorBot faz em _callAI():
    //   role 'ia' → 'model'
    //   role 'user' → 'user'
    const historyFormatted = history
      .slice(-MAX_HISTORY)           // mantém só as últimas N mensagens
      .slice(0, -1)                  // exclui a mensagem atual (adicionada em contents abaixo)
      .map(h => ({
        role:  h.role === 'ia' ? 'model' : 'user',
        parts: [{ text: h.content.length > 500 ? h.content.substring(0, 500) + '...' : h.content }]
      }));

    // Chamada principal — mesmo padrão do ContentCreatorBot
    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: buildSystemInstruction(totalProdutos, totalDivergencias, userRole),
        temperature:       0.7,
        maxOutputTokens:   1000,
        topP:              0.9,
        safetySettings: [
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
      contents: [
        ...historyFormatted,
        { role: 'user', parts: [{ text: message }] },
      ],
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') {
      return '⚠️ Não consigo responder a essa mensagem. Tente reformular.';
    }

    const text = response.text?.trim();
    if (!text) return getFallbackResponse(message);

    console.log(`[IA_Analyiz] ✅ Gemini (${model}) → ${text.length} chars`);
    return text;

  } catch (error) {
    const msg         = error?.message || '';
    const status      = error?.status  || 0;
    const isRateLimit = status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');

    if (isRateLimit && attempt === 1) {
      console.warn(`[IA_Analyiz] ⏳ Rate limit — tentando fallback model (${GEMINI_MODEL_FALLBACK})`);
      return sendChatMessage(message, history, context, 2);
    }

    console.error('[IA_Analyiz] ❌ Erro Gemini:', msg.substring(0, 200));
    return getFallbackResponse(message);
  }
}