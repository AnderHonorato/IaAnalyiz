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
  const msgs  = history.slice(0, -1); // exclui a última (é a pergunta atual)
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur = msgs[i], next = msgs[i + 1];
    if (cur.role === 'user' && next?.role === 'ia') {
      pairs.push({
        user:  stripHTML(cur.content).substring(0, 800),
        model: stripHTML(next.content).substring(0, 800),
      });
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

// ── Detecta se precisa de busca na web ───────────────────────────────────────
export function needsWebSearch(message) {
  if (!message) return false;
  return /mercado\s*livre|ml\s*api|taxa|tarifa|comissão|tendência|concorrência|tabela\s*de\s*frete|política\s*de\s*frete|regras?\s*do\s*ml|como\s+(vender|anunciar|calcular\s*frete)|o\s+que\s+(é|são)\s+(o\s+)?ml|novidades?\s*(do|no)\s*ml|atualiza[çc][aã]o\s*(do|no)\s*ml/i.test(message);
}

// ── System prompt — limpo, direto, sem pageUrl ────────────────────────────────
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
    dataBlock         = null,   // dados reais vindos do banco (ou null)
  } = ctx;

  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  // ── Bloco de dados reais (injetado pelo pipeline) ─────────────────────
  // Quando o roteador buscou dados específicos, eles ficam aqui.
  // Quando não há dados relevantes, mostra apenas os counters.
  const contextoDados = dataBlock
    ? dataBlock
    : [
        '=== CONTEXTO DO SISTEMA ===',
        `Produtos cadastrados: ${totalProdutos}`,
        `Divergências ativas (pendente/reincidente): ${totalDivergencias}`,
        '(Nenhum dado específico foi necessário para esta pergunta)',
        '=== FIM DO CONTEXTO ===',
      ].join('\n');

  // ── Pendentes de acesso (só para admins) ──────────────────────────────
  const pendentesBlock = isPrivileged && pendentes.length > 0
    ? `\nATENÇÃO — ${pendentes.length} usuário(s) aguardando desbloqueio:\n${pendentes.map(u => `- ${u.nome} <${u.email}>`).join('\n')}\n`
    : '';

  // ── Imagem ────────────────────────────────────────────────────────────
  const imagemBlock = imageContext
    ? `\nIMAGEM ENVIADA PELO USUÁRIO — conteúdo detectado:\n"${imageContext}"\n`
    : '';

  // ── Regra de saudação ─────────────────────────────────────────────────
  const saudacaoRule = isFirstMessage
    ? `Nesta primeira mensagem, você pode cumprimentar brevemente o usuário pelo nome (${usuarioAtual?.nome || ''}).`
    : `NÃO repita saudações. Responda direto ao ponto.`;

  // ── Regra de imagem ───────────────────────────────────────────────────
  const imagemRule = imageOnly
    ? `O usuário enviou apenas uma imagem sem texto. Descreva o que vê com detalhes (objetos, textos, contexto) e pergunte: "O que você gostaria de saber sobre isso?"`
    : `Quando há imagem, use o conteúdo detectado para responder a pergunta do usuário.`;

  return `Você é a IA Analyiz, assistente especializado em gestão logística e e-commerce.
Usuário: ${usuarioAtual?.nome || '?'} | Cargo: ${userRole}
${imagemBlock}${pendentesBlock}
${contextoDados}

REGRAS ABSOLUTAS — violá-las é proibido:
1. USE APENAS HTML simples: <b>negrito</b>, <i>itálico</i>, <br> para quebra. NUNCA markdown (**, *, #, -).
2. Links internos: <a href="/caminho" style="color:#1e40af;text-decoration:underline;font-weight:600">texto</a>
   Exemplos úteis: href="/ml/auditoria" (divergências), href="/ml/precos" (preços), href="/ml" (painel ML)
3. Links externos: <a href="https://..." target="_blank" style="color:#1e40af;text-decoration:underline">texto</a>
4. IDs ML como MLB123456 → sempre link: <a href="https://produto.mercadolivre.com.br/MLB-123456" target="_blank" style="color:#1e40af;text-decoration:underline">MLB123456</a>
5. NUNCA mencione em qual página o usuário está, a menos que ele pergunte explicitamente.
6. NUNCA invente dados. Se os dados não estiverem no bloco acima, diga que não tem essa informação disponível.
7. NUNCA use frases de abertura genéricas como "Olá!", "Claro!", "Com certeza!", "Entendido!", "Ótima pergunta!".
8. NUNCA adicione frases de encerramento como "Posso ajudar em mais alguma coisa?" ou "Espero ter ajudado!".
9. Respostas CURTAS e diretas. Use <br> para separar tópicos. Máximo 3-4 parágrafos curtos.
10. Quando houver dados do banco acima, use-os para responder com precisão: cite valores reais, SKUs, IDs, datas.
11. Quando não houver dados do banco, responda com conhecimento geral sobre logística e Mercado Livre.
12. ${saudacaoRule}
13. ${imagemRule}
14. Pendentes de acesso: informe APENAS para usuários OWNER ou ADMIN.`;
}

// ── Converte markdown residual em HTML ────────────────────────────────────────
function ensureHTML(text) {
  if (!text) return '';

  let r = text
    // Links markdown externos
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600" rel="noopener">$1</a>')
    // Links markdown internos
    .replace(/\[([^\]]+)\]\((\/[^)]+)\)/g,
      '<a href="$2" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>')
    // IDs MLB soltos → link clicável
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g,
      '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>')
    // Bold e itálico markdown
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<i>$1</i>')
    // Headers markdown
    .replace(/^#{1,6}\s+/gm, '')
    // Linhas horizontais
    .replace(/^---+$/gm, '')
    // Quebras de linha
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');

  return r.trim();
}

// ── Remove meta-texto que o Gemini às vezes gera ─────────────────────────────
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
    .replace(/(Você está na página[^<\n]*[\n<]?)/im, '') // ← remove menção à página
    .trim();
}

function getFallback() {
  return 'Conexão instável ⚠️. Tente novamente.';
}

// ── Análise de imagem ─────────────────────────────────────────────────────────
export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai     = getClient();
    const prompt = userQuestion
      ? `Analise esta imagem detalhadamente. Descreva todos os itens, textos, características e contexto. Responda especificamente: "${userQuestion}". Responda em português.`
      : `Descreva esta imagem em português: itens visíveis, textos presentes, características visuais, contexto aparente.`;
    const response = await ai.models.generateContent({
      model:    GEMINI_MODEL,
      config:   { temperature: 0.2, maxOutputTokens: 600 },
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
    });
    return response.text?.trim() || null;
  } catch { return null; }
}

// ── Função principal de resposta (chamada pelo iaRoutes) ──────────────────────
export async function buildAnswer(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai             = getClient();
    const geminiHistory  = buildGeminiHistory(history);
    const useSearch      = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage }),
      temperature:       0.15,
      maxOutputTokens:   1200,
      topP:              0.9,
    };

    if (useSearch) config.tools = [{ googleSearch: {} }];

    const response = await ai.models.generateContent({
      model,
      config,
      contents: [
        ...geminiHistory,
        { role: 'user', parts: [{ text: message || '[imagem enviada]' }] },
      ],
    });

    if (response.candidates?.[0]?.finishReason === 'SAFETY') {
      return { reply: 'Mensagem bloqueada por questões de segurança. 🙏', sources: [] };
    }

    const raw = response.text?.trim();
    if (!raw) return { reply: getFallback(), sources: [] };

    const reply = cleanMetaText(ensureHTML(raw));

    // Fontes do Google Search (quando ativado)
    const chunks  = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .filter(c => c.web?.uri)
      .map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri }))
      .slice(0, 5);

    return { reply, sources };

  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1) {
      return buildAnswer(message, history, context, 2);
    }
    console.error('[buildAnswer]', error.message);
    return { reply: getFallback(), sources: [] };
  }
}

// ── Exporta sendChatMessage como alias para compatibilidade ───────────────────
export const sendChatMessage = buildAnswer;