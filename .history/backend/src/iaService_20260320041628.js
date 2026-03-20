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
      pairs.push({
        user:  stripHTML(cur.content).substring(0, 600),
        model: stripHTML(next.content).substring(0, 600),
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

// ── Detecta se a pergunta precisa de busca na web ──────────────────────────
export function needsWebSearch(message) {
  if (!message) return false;
  return /mercado\s*livre|mercadolivre|ml\s*api|taxa|tarifa|comissão|categoria\s*ml|tendência|concorrência|estratégia|precificação|tabela\s*de\s*frete|política\s*de\s*frete|regra(s)?\s*do\s*ml|atributos\s*(ml|mercado)|como\s+(vender|anunciar|cadastrar|calcular\s*frete)|o\s+que\s+(é|são)\s+(o\s+)?ml|novidade(s)?\s*(do|no)\s*ml|atualiza[çc][aã]o\s*(do|no)\s*ml/i.test(message);
}

const PAGES = {
  'dashboard':  { path: '/',              label: 'Dashboard Home',        roles: ['OWNER', 'ADMIN', 'USUÁRIO', 'EMPRESARIO'] },
  'ml':         { path: '/ml',            label: 'Painel Mercado Livre',  roles: ['OWNER', 'ADMIN', 'USUÁRIO', 'EMPRESARIO'] },
  'auditoria':  { path: '/ml/auditoria',  label: 'Auditoria de Anúncios', roles: ['OWNER', 'ADMIN', 'USUÁRIO', 'EMPRESARIO'] },
  'usuarios':   { path: '/usuarios',      label: 'Gestão de Usuários',    roles: ['OWNER', 'ADMIN'] },
};

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

  // Pendentes apenas para OWNER e ADMIN
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
  const pendentes    = isPrivileged
    ? usuarios.filter(u => u.role === 'BLOQUEADO' && u.solicitouDesbloqueio === true && u.id !== usuarioAtual?.id)
    : [];

  const produtosDetalhe  = produtos.slice(0, 20).map(p =>
    `[${p.sku}] ${p.nome} — R$${p.preco} | ${p.pesoGramas}g | ${p.plataforma}${p.eKit ? ' | KIT' : ''}${p.mlItemId ? ` | ML:${p.mlItemId}` : ''}`
  ).join('\n');

  const divDetalhe = divergencias.slice(0, 10).map(d =>
    `${d.mlItemId}: ${d.motivo} (${new Date(d.createdAt).toLocaleDateString('pt-BR')})`
  ).join('\n');

  const pendentesDetalhe = pendentes.map(u => `${u.nome} <${u.email}>`).join('\n');

  const paginasAcessiveis = Object.entries(PAGES)
    .filter(([, v]) => v.roles.includes(userRole))
    .map(([, v]) => `  • ${v.label}: ${v.path}`)
    .join('\n');

  const imageCtxBlock = imageContext
    ? `\n⚠️ IMAGEM ENVIADA PELO USUÁRIO — descrição: "${imageContext}"\nResponda considerando esta imagem conforme a pergunta.\n`
    : '';

  const pageCtxBlock = pageUrl
    ? `\n🗺️ PÁGINA ATUAL DO USUÁRIO NO SISTEMA: ${pageUrl}\n`
    : '';

  const pendentesBlock = isPrivileged
    ? `\nAguardando desbloqueio de acesso: ${pendentes.length}\n${pendentesDetalhe || '(nenhum)'}\n`
    : '';

  return `Você é a IA Analyiz 🤖, assistente do sistema de gestão logística FaleZap.
Usuário: ${usuarioAtual?.nome || '?'} | Role: ${userRole}
${imageCtxBlock}${pageCtxBlock}
=== DADOS DO SISTEMA ===
Produtos no Catálogo: ${totalProdutos}
${produtosDetalhe || '(nenhum)'}

Divergências Ativas: ${totalDivergencias}
${divDetalhe || '(nenhuma)'}
${pendentesBlock}
PÁGINAS DO SISTEMA ACESSÍVEIS (role: ${userRole}):
${paginasAcessiveis || '(nenhuma)'}
========================

REGRAS CRÍTICAS:
1. NUNCA use markdown (** ou *). Use SEMPRE tags HTML: <b>negrito</b>, <i>itálico</i>, <br> para quebra.
2. Para links INTERNOS do sistema, use: <a href="/caminho" style="color:#1e40af;text-decoration:underline;font-weight:600">/caminho</a>
3. Para links EXTERNOS, use: <a href="https://..." target="_blank" style="color:#1e40af;text-decoration:underline">texto</a>
4. NUNCA diga "conforme solicitado", "formatado como pedido" ou qualquer meta-comentário. Responda diretamente.
5. Baseie-se nos DADOS DO SISTEMA para números. Se não souber, diga que não tem o dado.
6. Se o usuário estiver em uma página específica (${pageUrl || 'desconhecida'}), explique as funcionalidades daquela página.
7. Seja direto e objetivo. Nunca corte a resposta pela metade.`;
}

function ensureHTML(text) {
  if (!text) return '';
  // Markdown links externos → <a target="_blank">
  let result = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:500" rel="noopener">$1</a>'
  );
  // Markdown links internos → <a href="/caminho">
  result = result.replace(
    /\[([^\]]+)\]\((\/[^)]+)\)/g,
    '<a href="$2" style="color:#1e40af;text-decoration:underline;font-weight:500">$1</a>'
  );
  // Paths soltos como /ml/auditoria → link clicável
  result = result.replace(
    /(?<!['"=\w>])(\/(ml|usuarios|dashboard|produtos)[a-z0-9/_-]*)/g,
    '<a href="$1" style="color:#1e40af;text-decoration:underline;font-weight:500">$1</a>'
  );
  // Limpa resíduos de markdown
  result = result
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<i>$1</i>')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '');
  // Quebras de linha
  result = result.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return result.trim();
}

function getFallback() {
  return 'Conexão neural instável ⚠️. Verifique sua conexão e tente enviar novamente.';
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai     = getClient();
    const prompt = userQuestion
      ? `Imagem recebida. Pergunta do usuário: "${userQuestion}"\nResponda em português.`
      : 'Descreva detalhadamente esta imagem em português.';
    const response = await ai.models.generateContent({
      model:    GEMINI_MODEL,
      config:   { temperature: 0.3, maxOutputTokens: 600 },
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }]
    });
    return response.text?.trim() || null;
  } catch (e) { return null; }
}

export async function sendChatMessage(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai            = getClient();
    const geminiHistory = buildGeminiHistory(history);
    const useSearch     = needsWebSearch(message);

    const config = {
      systemInstruction: buildSystemInstruction(context),
      temperature:       0.2,
      maxOutputTokens:   1400,
      topP:              0.9,
    };

    // Ativa Google Search para perguntas que precisam de dados externos
    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model,
      config,
      contents: [...geminiHistory, { role: 'user', parts: [{ text: message }] }],
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') {
      return { reply: 'Mensagem bloqueada por questões de segurança. 🙏', sources: [] };
    }

    const raw = response.text?.trim();
    if (!raw) return { reply: getFallback(), sources: [] };

    const reply = ensureHTML(raw);

    // Extrai fontes do Google Search grounding
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .filter(c => c.web?.uri)
      .map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri }))
      .slice(0, 5);

    return { reply, sources };

  } catch (error) {
    const isRateLimit = error?.status === 429 || String(error).includes('429');
    if (isRateLimit && attempt === 1) return sendChatMessage(message, history, context, 2);
    return { reply: getFallback(), sources: [] };
  }
}