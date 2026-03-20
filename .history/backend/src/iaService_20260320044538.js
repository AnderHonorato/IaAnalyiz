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
    isFirstMessage    = false,
    imageOnly         = false,
  } = ctx;

  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
  const pendentes    = isPrivileged
    ? usuarios.filter(u => u.role === 'BLOQUEADO' && u.solicitouDesbloqueio === true && u.id !== usuarioAtual?.id)
    : [];

  const produtosDetalhe  = produtos.slice(0, 20).map(p =>
    `[${p.sku}] ${p.nome} — R$${p.preco} | ${p.pesoGramas}g | ${p.plataforma}${p.eKit ? ' | KIT' : ''}${p.mlItemId ? ` | ML:${p.mlItemId} | Link: /ml/auditoria` : ''}`
  ).join('\n');

  const divDetalhe = divergencias.slice(0, 10).map(d =>
    `${d.mlItemId}: ${d.motivo} (${new Date(d.createdAt).toLocaleDateString('pt-BR')}) | Link: <a href="/ml/auditoria" style="color:#1e40af;font-weight:600">/ml/auditoria</a>`
  ).join('\n');

  // Pendentes só para OWNER/ADMIN
  const pendentesDetalhe = isPrivileged
    ? pendentes.map(u => `${u.nome} <${u.email}>`).join('\n')
    : '';

  const paginasAcessiveis = Object.entries(PAGES)
    .filter(([, v]) => v.roles.includes(userRole))
    .map(([, v]) => `  • ${v.label}: ${v.path}`)
    .join('\n');

  const imageCtxBlock = imageContext
    ? `\n⚠️ IMAGEM ANALISADA — conteúdo detectado: "${imageContext}"\n`
    : '';

  const pageCtxBlock = pageUrl
    ? `\nPÁGINA ATUAL: ${pageUrl}\n`
    : '';

  const pendentesBlock = isPrivileged && pendentes.length > 0
    ? `\nUsuários aguardando desbloqueio: ${pendentes.length}\n${pendentesDetalhe}\n`
    : '';

  // Instrução de saudação: usar nome APENAS na primeira mensagem
  const saudacaoRule = isFirstMessage
    ? `Na PRIMEIRA mensagem desta sessão, pode cumprimentar o usuário pelo nome (${usuarioAtual?.nome || ''}).`
    : `NÃO use o nome do usuário nas respostas. Responda diretamente sem cumprimentos repetidos.`;

  const imageOnlyRule = imageOnly
    ? `O usuário enviou apenas uma imagem sem texto. Descreva o que está na imagem com detalhes (itens, características, textos visíveis, contexto). Então pergunte de forma direta: "O que você gostaria de saber sobre isso?"`
    : '';

  return `Você é a IA Analyiz 🤖, assistente do sistema de gestão logística.
Usuário: ${usuarioAtual?.nome || '?'} | Role: ${userRole}
${imageCtxBlock}${pageCtxBlock}
=== DADOS DO SISTEMA ===
Produtos no Catálogo: ${totalProdutos}
${produtosDetalhe || '(nenhum)'}

Divergências Ativas: ${totalDivergencias}
${divDetalhe || '(nenhuma)'}
${pendentesBlock}
PÁGINAS ACESSÍVEIS:
${paginasAcessiveis || '(nenhuma)'}
========================

REGRAS OBRIGATÓRIAS:
1. NUNCA use markdown (** ou *). Use APENAS tags HTML: <b>negrito</b>, <i>itálico</i>, <br> para quebra.
2. Links INTERNOS do sistema: <a href="/caminho" style="color:#1e40af;text-decoration:underline;font-weight:600">texto do link</a>
   - Divergências: <a href="/ml/auditoria" style="color:#1e40af;text-decoration:underline;font-weight:600">Ver Auditoria</a>
   - Catálogo: <a href="/ml" style="color:#1e40af;text-decoration:underline;font-weight:600">Painel ML</a>
3. Links EXTERNOS: <a href="https://..." target="_blank" style="color:#1e40af;text-decoration:underline">texto</a>
4. NUNCA diga "conforme solicitado", "formatado como pedido", "Olá, [nome]" repetidamente ou qualquer meta-comentário.
5. Respostas CURTAS e diretas. Sem parágrafos longos. Use <br> para separar tópicos.
6. ${saudacaoRule}
7. ${imageOnlyRule || 'Ao receber imagem, liste o que foi detectado nela e responda com base nas perguntas do usuário.'}
8. Ao mencionar anúncios com divergência, sempre inclua o link clicável para /ml/auditoria.
9. Usuários PENDENTES só devem ser informados para usuários com role OWNER ou ADMIN.
10. NUNCA mencione o nome do sistema externo nas respostas.
11. Ao citar ID de produto ML (ex: MLB123), torne-o link: <a href="https://produto.mercadolivre.com.br/MLB-123" target="_blank" style="color:#1e40af;text-decoration:underline">MLB123</a>`;
}

function ensureHTML(text) {
  if (!text) return '';
  let result = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600" rel="noopener">$1</a>'
  );
  result = result.replace(
    /\[([^\]]+)\]\((\/[^)]+)\)/g,
    '<a href="$2" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>'
  );
  // Paths soltos /ml/auditoria → link
  result = result.replace(
    /(?<!['"=\w>])(\/(ml|usuarios|dashboard|produtos)[a-z0-9/_-]*)/g,
    '<a href="$1" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>'
  );
  // Converte ID do ML solto (MLB seguido de números) em link clicável
  result = result.replace(
    /\b(MLB\d+)\b(?![^<]*>)/g,
    '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>'
  );
  result = result
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<i>$1</i>')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '');
  result = result.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return result.trim();
}

function getFallback() {
  return 'Conexão instável ⚠️. Tente novamente.';
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai     = getClient();
    // Pede descrição completa da imagem: itens, textos, características, contexto
    const prompt = userQuestion
      ? `Analise esta imagem em detalhes. Descreva todos os itens visíveis, textos, cores, características e contexto. Depois responda especificamente: "${userQuestion}". Responda em português.`
      : `Descreva esta imagem completamente em português. Liste: todos os itens visíveis, textos presentes, características visuais, contexto aparente e qualquer informação relevante.`;
    const response = await ai.models.generateContent({
      model:    GEMINI_MODEL,
      config:   { temperature: 0.3, maxOutputTokens: 800 },
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

    // Detecta se é primeira mensagem da sessão (histórico só tem a mensagem atual)
    const isFirstMessage = history.length <= 1;

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage }),
      temperature:       0.2,
      maxOutputTokens:   1000,
      topP:              0.9,
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model,
      config,
      contents: [...geminiHistory, { role: 'user', parts: [{ text: message || '[imagem enviada]' }] }],
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') {
      return { reply: 'Mensagem bloqueada por questões de segurança. 🙏', sources: [] };
    }

    const raw = response.text?.trim();
    if (!raw) return { reply: getFallback(), sources: [] };

    let reply = ensureHTML(raw);

    // Remove meta-texto que a IA pode gerar
    reply = reply
      .replace(/^(Olá,?\s+[A-Z][a-zà-ú]+[,!]\s*)+/i, '')
      .replace(/^(conforme\s+solicitado[^<br]*(<br>)?)/im, '')
      .replace(/^(formatado\s+conforme[^<br]*(<br>)?)/im, '')
      .trim();

    // Fontes do Google Search
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