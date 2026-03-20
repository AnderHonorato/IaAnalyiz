// ==========================================
// IA ANALYIZ — Serviço de Inteligência Neural
// Arquivo: src/iaService.js
// ==========================================

import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite';
const MAX_HISTORY           = 40; // histórico maior para memória real de conversa

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada no .env');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/**
 * Monta o system prompt com contexto completo do banco de dados.
 */
function buildSystemInstruction(ctx) {
  const {
    totalProdutos      = 0,
    totalDivergencias  = 0,
    userRole           = 'USUÁRIO',
    usuariosPendentes  = 0,
    totalUsuarios      = 0,
    usuariosBlockeados = 0,
    usuariosAtivos     = 0,
  } = ctx;

  return `Você é a IA Analyiz, assistente inteligente do sistema de gestão de e-commerce e logística criado pelo Ander.

DADOS ATUAIS DO SISTEMA:
• Produtos cadastrados: ${totalProdutos}
• Divergências abertas: ${totalDivergencias}
• Total de usuários: ${totalUsuarios}
• Usuários ativos (com acesso): ${usuariosAtivos}
• Usuários bloqueados: ${usuariosBlockeados}
• Aguardando desbloqueio: ${usuariosPendentes}
• Role do usuário atual: ${userRole}

FORMATAÇÃO — REGRA CRÍTICA:
- A interface do site renderiza HTML — use APENAS HTML para formatação
- Use <b>negrito</b>, <i>itálico</i>, <br> para quebra de linha
- NUNCA use asteriscos (*) — eles aparecem como caracteres literais no site
- NUNCA use markdown: sem **texto**, *texto*, ## títulos, --- separadores
- Para listas: • item<br>• item<br>
- Links: <a href="url">texto</a>
- Respostas concisas — máx 3 parágrafos salvo quando análise detalhada for pedida

MEMÓRIA E CONTEXTO:
- Você tem o histórico completo desta conversa — use-o para responder coerentemente
- Se o usuário perguntar o que conversaram, resuma o histórico disponível
- NUNCA diga que não tem memória — você tem o histórico da sessão atual
- Responda sempre de forma coerente com o que foi discutido antes

COMPORTAMENTO:
- Apresente-se apenas na primeira mensagem da conversa, de forma breve
- Não repita seu nome a cada resposta
- Para perguntas fora do domínio (ex: "que horas são"): responda brevemente ("Não tenho acesso ao horário atual.") e volte ao foco naturalmente — sem sermão
- Use os dados reais do sistema quando perguntas sobre usuários, pendências ou divergências forem feitas
- Não repita os dados do sistema em toda resposta — só quando for relevante ou solicitado
- Seja direto — evite respostas genéricas e repetitivas

DOMÍNIO DO SISTEMA:
- Gestão de produtos e SKUs no Mercado Livre e outras plataformas
- Auditoria de divergências de peso entre sistema interno e ML
- Kits: peso calculado como soma dos componentes
- Gestão de usuários com controle de acesso por roles (OWNER, ADMIN, USUÁRIO, BLOQUEADO)
- Bot de varredura que compara dados internos vs. ML e registra divergências

PERMISSÕES POR ROLE:
- OWNER: acesso total a todos os dados incluindo usuários e pendências
- ADMIN: acesso a produtos e divergências
- USUÁRIO: acesso básico ao sistema
- BLOQUEADO: sem acesso — não atenda usuários com este role`;
}

/**
 * Converte qualquer markdown residual para HTML,
 * garantindo que asteriscos nunca apareçam no frontend.
 */
function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g,   '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g,   '<b>$1</b>')
    .replace(/__(.+?)__/g,       '<i>$1</i>')
    .replace(/_([^_\n]+)_/g,     '<i>$1</i>')
    .replace(/^#{1,6}\s+/gm,     '')
    .replace(/^---+$/gm,         '')
    .replace(/\n\n/g,            '<br><br>')
    .replace(/\n/g,              '<br>')
    .trim();
}

function getFallbackResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('divergên') || lower.includes('divergen'))
    return 'Não consegui acessar o kernel. Verifique a aba de <b>Divergências</b> no painel.';
  if (lower.includes('produto'))
    return 'Não consegui acessar o kernel. Consulte os produtos diretamente no painel de cadastro.';
  if (lower.includes('usuário') || lower.includes('usuario') || lower.includes('acesso') || lower.includes('desbloqueio'))
    return 'Não consegui acessar o kernel. Verifique a gestão de usuários no painel administrativo.';
  return 'Erro de conexão com o Kernel. Tente novamente em instantes.';
}

/**
 * Envia mensagem para a IA com histórico completo e contexto do banco.
 *
 * @param {string} message
 * @param {Array}  history   [{role: 'ia'|'user', content: string}]
 * @param {Object} context   dados do banco (totais, roles, etc.)
 * @param {number} attempt   tentativa atual (retry interno)
 */
export async function sendChatMessage(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;

  try {
    const ai = getClient();

    // Formata histórico para o padrão Gemini
    // Exclui a mensagem atual — ela vai no último item de contents
    const historyFormatted = history
      .slice(-MAX_HISTORY)
      .slice(0, -1)
      .map(h => ({
        role:  h.role === 'ia' ? 'model' : 'user',
        parts: [{
          text: h.content.length > 800
            ? h.content.substring(0, 800) + '...'
            : h.content
        }]
      }));

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: buildSystemInstruction(context),
        temperature:       0.65,
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
      return 'Não consigo responder a essa mensagem. Tente reformular.';
    }

    const raw = response.text?.trim();
    if (!raw) return getFallbackResponse(message);

    // Garante HTML limpo — sem asteriscos escapando para o frontend
    const result = ensureHTML(raw);

    console.log(`[IA_Analyiz] ✅ Gemini (${model}) → ${result.length} chars`);
    return result;

  } catch (error) {
    const msg         = error?.message || '';
    const status      = error?.status  || 0;
    const isRateLimit = status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');

    if (isRateLimit && attempt === 1) {
      console.warn(`[IA_Analyiz] ⏳ Rate limit — fallback para ${GEMINI_MODEL_FALLBACK}`);
      return sendChatMessage(message, history, context, 2);
    }

    console.error('[IA_Analyiz] ❌ Erro Gemini:', msg.substring(0, 200));
    return getFallbackResponse(message);
  }
}