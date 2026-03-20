import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite';
const MAX_PAIRS             = 25;

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
      pairs.push({ user: stripHTML(cur.content).substring(0, 600), model: stripHTML(next.content).substring(0, 600) });
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

const PAGES = {
  'dashboard':  { path: '/',              label: 'Dashboard Home',         roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'ml':         { path: '/ml',            label: 'Painel Mercado Livre',   roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'auditoria':  { path: '/ml/auditoria',  label: 'Auditoria de Anúncios',  roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'usuarios':   { path: '/usuarios',      label: 'Gestão de Usuários',     roles: ['OWNER', 'ADMIN'] },
};

// Detecta se a mensagem precisa de busca na web (contexto de Mercado Livre)
function needsWebSearch(message) {
  return /taxa|política|regra|api ml|integraç|tendência|preço mercado|concorr|vender mais|estratégia|dica|como funciona|shopee|amazon|atualiz|novidade|mudança|algoritmo|seo|ranking|anúncio perfeito|frete grátis|full|fulfillment/i.test(message);
}

function buildSystemInstruction(ctx) {
  const {
    totalProdutos     = 0,
    totalDivergencias = 0,
    userRole          = 'USUÁRIO',
    produtos          = [],
    divergencias      = [],
    usuarios          = [],
    usuarioAtual      = null,
    imageContext      = null,
    pageUrl           = null,
  } = ctx;

  // Pendentes só para OWNER
  const pendentes = (userRole === 'OWNER' || userRole === 'ADMIN')
    ? usuarios.filter(u => u.role === 'BLOQUEADO' && u.solicitouDesbloqueio === true && u.id !== usuarioAtual?.id)
    : [];

  const produtosDetalhe = produtos.slice(0, 20).map(p =>
    `[${p.sku}] ${p.nome} — R$${p.preco} | ${p.pesoGramas}g | ${p.plataforma}${p.eKit ? ' | KIT' : ''}${p.mlItemId ? ` | ML:${p.mlItemId}` : ''}`
  ).join('\n');

  const divDetalhe = divergencias.slice(0, 10).map(d =>
    `${d.mlItemId}: ${d.motivo} (${new Date(d.createdAt).toLocaleDateString('pt-BR')})`
  ).join('\n');

  const pendentesDetalhe = pendentes.map(u => `${u.nome} <${u.email}>`).join('\n');
  const paginasAcessiveis = Object.entries(PAGES)
    .filter(([, v]) => v.roles.includes(userRole))
    .map(([k, v]) => `  • ${v.label}: ${v.path}`)
    .join('\n');

  const imageCtxBlock = imageContext
    ? `\n⚠️ IMAGEM ENVIADA PELO USUÁRIO — descrição: "${imageContext}"\nResponda considerando esta imagem conforme a pergunta.\n`
    : '';

  const pageCtxBlock = pageUrl
    ? `\n📍 CONTEXTO: O usuário está atualmente na página: ${pageUrl}\nSe ele perguntar "onde estou" ou "o que é essa tela", explique as funcionalidades desta página.\n`
    : '';

  const pendentesBlock = pendentes.length > 0
    ? `\n🔔 PENDENTES DE DESBLOQUEIO (${pendentes.length} usuário(s)):\n${pendentesDetalhe}\n`
    : '';

  return `Você é a IA Analyiz 🤖, assistente do sistema de gestão logística FaleZap.
Usuário: ${usuarioAtual?.nome || '?'} | Role: ${userRole}
${imageCtxBlock}${pageCtxBlock}${pendentesBlock}
=== DADOS DO SISTEMA ===
Produtos no Catálogo: ${totalProdutos}
${produtosDetalhe || '(nenhum)'}

Divergências Ativas: ${totalDivergencias}
${divDetalhe || '(nenhuma)'}

${userRole === 'OWNER' || userRole === 'ADMIN' ? `Aguardando desbloqueio: ${pendentes.length}` : ''}

PÁGINAS DO SISTEMA ACESSÍVEIS:
${paginasAcessiveis || '(nenhuma)'}
========================

REGRAS CRÍTICAS DE RESPOSTA:
1. NUNCA use markdown (** ou *). Use SEMPRE tags HTML: <b>negrito</b>, <i>itálico</i>, <br> para quebra.
2. Seja sempre direto e completo. NUNCA corte a resposta pela metade.
3. Quando mencionar links internos do sistema, use o formato: <a href="/caminho">Texto do Link</a>
4. Para links externos, use: <a href="https://url" target="_blank">Texto</a>
5. Baseie-se nos "DADOS DO SISTEMA" listados acima para não errar números.
6. Se você usar a ferramenta de busca, cite as fontes naturalmente na resposta.
7. Responda sempre em português brasileiro.
8. NUNCA diga "formatado conforme solicitado" ou similar - apenas formate e responda.`;
}

function ensureHTML(text) {
  if (!text) return '';
  // Converte links markdown: [texto](url)
  let result = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Converte links internos: [texto](/caminho)
  result = result.replace(/\[([^\]]+)\]\((\/[^)]*)\)/g, '<a href="$2">$1</a>');
  // Remove markdown extras
  result = result.replace(/\]\./g, '.').replace(/\]\)/g, ')').replace(/\]\s/g, ' ');
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\n<]+)\*/g, '<b>$1</b>');
  result = result.replace(/__(.+?)__/g, '<i>$1</i>').replace(/^#{1,6}\s+/gm, '').replace(/^---+$/gm, '');
  // Converte URLs brutas em links clicáveis (que não foram já convertidos)
  result = result.replace(/(?<!['"=])(https?:\/\/[^\s<>"',]+[^\s<>"',.!?])/g, (url) => {
    // Evitar duplicar links já processados
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
  result = result.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return result.trim();
}

function getFallback(message) {
  return 'Conexão neural instável ⚠️. Verifique sua conexão e tente enviar novamente.';
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const prompt = userQuestion
      ? `Imagem recebida. Pergunta: "${userQuestion}"\nResponda em português.`
      : 'Descreva detalhadamente esta imagem em português.';
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.3, maxOutputTokens: 600 },
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }]
    });
    return response.text?.trim() || null;
  } catch (e) { return null; }
}

export async function sendChatMessage(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  const useSearch = needsWebSearch(message);

  try {
    const ai = getClient();
    const geminiHistory = buildGeminiHistory(history);
    const systemInstruction = buildSystemInstruction(context);

    const config = {
      systemInstruction,
      temperature: 0.2,
      maxOutputTokens: 1400,
      topP: 0.9,
    };

    // Adiciona Google Search para queries que precisam de info atual do ML
    if (useSearch && attempt === 1) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model,
      config,
      contents: [...geminiHistory, { role: 'user', parts: [{ text: message }] }],
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') return { reply: 'Mensagem bloqueada por questões de segurança. 🙏', sources: [] };

    const raw = response.text?.trim();
    if (!raw) return { reply: getFallback(message), sources: [] };

    const cleaned = ensureHTML(raw);

    // Extrai fontes do grounding (Google Search)
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .map(chunk => ({
        label: chunk.web?.title || chunk.web?.uri || 'Fonte',
        url: chunk.web?.uri
      }))
      .filter(s => s.url);

    return { reply: cleaned, sources };

  } catch (error) {
    const isRateLimit = error?.status === 429 || String(error).includes('429');
    if (isRateLimit && attempt === 1) return sendChatMessage(message, history, context, 2);
    return { reply: getFallback(message), sources: [] };
  }
}