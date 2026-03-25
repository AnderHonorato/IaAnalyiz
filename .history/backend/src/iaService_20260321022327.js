import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite-preview-06-17';
const MAX_PAIRS             = 20;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function buildGeminiHistory(history) {
  if (!history || history.length === 0) return [];
  const msgs  = history.slice(0, -1);
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur = msgs[i], next = msgs[i + 1];
    if (cur.role === 'user' && next?.role === 'ia') {
      pairs.push({ user: stripHTML(cur.content).substring(0, 800), model: stripHTML(next.content).substring(0, 800) });
      i += 2;
    } else { i++; }
  }
  const result = [];
  for (const p of pairs.slice(-MAX_PAIRS)) {
    result.push({ role: 'user',  parts: [{ text: p.user  }] });
    result.push({ role: 'model', parts: [{ text: p.model }] });
  }
  return result;
}

export function needsWebSearch(message) {
  if (!message) return false;
  return /mercado\s*livre|ml\s*api|taxa|tarifa|comissão|tendência|concorrência|tabela\s*de\s*frete|política\s*de\s*frete|regras?\s*do\s*ml|como\s+(vender|anunciar|calcular\s*frete)|o\s+que\s+(é|são)\s+(o\s+)?ml|novidades?\s*(do|no)\s*ml|atualiza[çc][aã]o\s*(do|no)\s*ml/i.test(message);
}

function buildSystemInstruction(ctx) {
  const {
    totalProdutos     = 0,
    totalDivergencias = 0,
    userRole          = 'USUÁRIO',
    usuarioAtual      = null,
    pendentes         = [],
    imageContext      = null,
    imageOnly         = false,
    isFirstMessage    = false,
    dataBlock         = null,
  } = ctx;

  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  const contextoDados = dataBlock
    ? dataBlock
    : [
        '=== CONTEXTO DO SISTEMA ===',
        `Produtos cadastrados: ${totalProdutos}`,
        `Divergências ativas (pendente/reincidente): ${totalDivergencias}`,
        '(Nenhum dado específico foi necessário para esta pergunta)',
        '=== FIM DO CONTEXTO ===',
      ].join('\n');

  const pendentesBlock = isPrivileged && pendentes.length > 0
    ? `\nATENÇÃO — ${pendentes.length} usuário(s) aguardando desbloqueio:\n${pendentes.map(u => `- ${u.nome} <${u.email}>`).join('\n')}\n`
    : '';

  const imagemBlock = imageContext ? `\nIMAGEM ENVIADA:\n"${imageContext}"\n` : '';

  const saudacaoRule = isFirstMessage
    ? `Nesta primeira mensagem, você pode cumprimentar brevemente o usuário pelo nome (${usuarioAtual?.nome || ''}).`
    : `NÃO repita saudações. Responda direto ao ponto.`;

  const imagemRule = imageOnly
    ? `O usuário enviou apenas uma imagem. Descreva o que vê e pergunte o que deseja saber.`
    : `Quando há imagem, use o conteúdo detectado para responder.`;

  return `Você é a IA Analyiz, assistente especializado em gestão logística e e-commerce.
Usuário: ${usuarioAtual?.nome || '?'} | Cargo: ${userRole}
${imagemBlock}${pendentesBlock}
${contextoDados}

REGRAS ABSOLUTAS:
1. HTML simples apenas: <b>negrito</b>, <i>itálico</i>, <br>. NUNCA markdown.
2. Links internos: <a href="/caminho" style="color:#1e40af;text-decoration:underline;font-weight:600">texto</a>
3. IDs ML como MLB123456 → <a href="https://produto.mercadolivre.com.br/MLB-123456" target="_blank" style="color:#1e40af;text-decoration:underline">MLB123456</a>
4. NUNCA mencione em qual página o usuário está sem ser perguntado.
5. NUNCA invente dados. Use apenas o que está no bloco acima.
6. NUNCA use frases genéricas de abertura ou encerramento.
7. Respostas diretas. Máximo 4 parágrafos.
8. ${saudacaoRule}
9. ${imagemRule}
10. Pendentes de acesso: informe APENAS para OWNER ou ADMIN.`;
}

function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600" rel="noopener">$1</a>')
    .replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, '<a href="$2" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>')
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .trim();
}

function cleanMetaText(text) {
  return text
    .replace(/^(Olá[,!]?\s*){1,3}/i, '')
    .replace(/^(Claro[,!]\s*)/i, '')
    .replace(/^(Com certeza[,!]\s*)/i, '')
    .replace(/^(Entendido[,!]\s*)/i, '')
    .replace(/^(Ótima pergunta[,!]\s*)/i, '')
    .replace(/^(conforme solicitado[^<\n]*[\n<])/im, '')
    .replace(/(Espero ter ajudado[^<\n]*[\n<]?)/im, '')
    .replace(/(Posso ajudar em mais algo[^<\n]*[\n<]?)/im, '')
    .replace(/(Você está na página[^<\n]*[\n<]?)/im, '')
    .trim();
}

function getFallback() { return 'Conexão instável ⚠️. Tente novamente.'; }

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai     = getClient();
    const prompt = userQuestion
      ? `Analise esta imagem detalhadamente. Descreva todos os itens, textos, características e contexto. Responda: "${userQuestion}". Em português.`
      : `Descreva esta imagem em português: itens visíveis, textos, características, contexto.`;
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL, config: { temperature: 0.2, maxOutputTokens: 600 },
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
    });
    return response.text?.trim() || null;
  } catch { return null; }
}

export async function buildAnswer(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai             = getClient();
    const geminiHistory  = buildGeminiHistory(history);
    const useSearch      = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage }),
      temperature: 0.15, maxOutputTokens: 1200, topP: 0.9,
    };
    if (useSearch) config.tools = [{ googleSearch: {} }];

    const response = await ai.models.generateContent({
      model, config,
      contents: [...geminiHistory, { role: 'user', parts: [{ text: message || '[imagem enviada]' }] }],
    });

    if (response.candidates?.[0]?.finishReason === 'SAFETY')
      return { reply: 'Mensagem bloqueada por questões de segurança. 🙏', sources: [] };

    const raw = response.text?.trim();
    if (!raw) return { reply: getFallback(), sources: [] };

    const reply = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter(c => c.web?.uri).map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri })).slice(0, 5);

    return { reply, sources };
  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1)
      return buildAnswer(message, history, context, 2);
    console.error('[buildAnswer]', error.message);
    return { reply: getFallback(), sources: [] };
  }
}

export const sendChatMessage = buildAnswer;

// ═══════════════════════════════════════════════════════════════════════════
// RESUMO EXECUTIVO — prompt detalhado (usado em iaRoutes /api/ia/summary)
// ═══════════════════════════════════════════════════════════════════════════
export function buildResumoPrompt(dadosStr) {
  return `Você é um Consultor Especialista em Logística e E-commerce.
Analise os dados abaixo e produza um RELATÓRIO EXECUTIVO COMPLETO E DETALHADO.

DADOS DO SISTEMA:
${typeof dadosStr === 'string' ? dadosStr : JSON.stringify(dadosStr, null, 2)}

ESTRUTURA OBRIGATÓRIA DO RELATÓRIO (use exatamente estas seções em HTML limpo):

<b>📊 Diagnóstico Geral</b><br>
[Análise aprofundada do estado atual. Cite números específicos. Explique o impacto real de cada métrica no negócio. Mínimo 3 parágrafos.]

<b>⚠️ Problemas Críticos Identificados</b><br>
[Liste cada problema com: impacto financeiro estimado, causa raiz provável, urgência (CRÍTICO/ALTO/MÉDIO). Seja específico sobre prejuízo causado por divergências de peso no frete.]

<b>📉 Análise de Risco</b><br>
[Riscos de curto prazo (próximos 30 dias) e médio prazo (próximos 90 dias). Inclua risco de penalização pelo ML por divergências não corrigidas, risco de suspensão de anúncios, impacto no score do vendedor.]

<b>✅ Plano de Ação Prioritário</b><br>
[Mínimo 5 ações específicas e práticas, ordenadas por impacto. Para cada ação: O QUÊ fazer, COMO fazer no sistema, PRAZO sugerido, RESULTADO esperado.]

<b>💡 Oportunidades de Melhoria</b><br>
[Pelo menos 3 oportunidades concretas para aumentar eficiência, reduzir custos ou aumentar vendas. Seja específico e criativo.]

<b>🎯 Meta Sugerida para os Próximos 30 Dias</b><br>
[Uma meta clara, mensurável e atingível baseada nos dados apresentados.]

REGRAS:
- Use APENAS tags HTML: <b>, <i>, <ul>, <li>, <br>
- NUNCA use markdown (**, #, -, *)
- Seja ESPECÍFICO com números e percentuais do sistema
- Critique construtivamente o que está ruim
- O relatório deve ter pelo menos 600 palavras
- Comece DIRETAMENTE no conteúdo, sem introdução`;
}