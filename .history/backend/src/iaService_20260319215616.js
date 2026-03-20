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

// Mapa de páginas do sistema com roles que têm acesso
const PAGES = {
  'dashboard':        { path: '/dashboard',       label: 'Dashboard',          roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'produtos':         { path: '/produtos',         label: 'Produtos',           roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'divergências':     { path: '/divergencias',     label: 'Divergências',       roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'divergencias':     { path: '/divergencias',     label: 'Divergências',       roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'usuários':         { path: '/usuarios',         label: 'Gestão de Usuários', roles: ['OWNER', 'ADMIN'] },
  'usuarios':         { path: '/usuarios',         label: 'Gestão de Usuários', roles: ['OWNER', 'ADMIN'] },
  'configurações':    { path: '/configuracoes',    label: 'Configurações',      roles: ['OWNER'] },
  'configuracoes':    { path: '/configuracoes',    label: 'Configurações',      roles: ['OWNER'] },
  'perfil':           { path: '/perfil',           label: 'Perfil',             roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'bot':              { path: '/bot',              label: 'Bot de Varredura',   roles: ['OWNER', 'ADMIN'] },
  'relatórios':       { path: '/relatorios',       label: 'Relatórios',         roles: ['OWNER', 'ADMIN'] },
};

function buildSystemInstruction(ctx) {
  const {
    totalProdutos      = 0,
    totalDivergencias  = 0,
    userRole           = 'USUÁRIO',
    produtos           = [],
    divergencias       = [],
    usuarios           = [],
    usuarioAtual       = null,
    imageContext       = null,
  } = ctx;

  const pendentes = usuarios.filter(u =>
    u.role === 'BLOQUEADO' && u.solicitouDesbloqueio === true && u.id !== usuarioAtual?.id
  );

  const produtosDetalhe = produtos.slice(0, 20).map(p =>
    `[${p.sku}] ${p.nome} — R$${p.preco} | ${p.pesoGramas}g | ${p.plataforma}${p.eKit ? ' | KIT' : ''}${p.mlItemId ? ` | ML:${p.mlItemId}` : ''}`
  ).join('\n');

  const divDetalhe = divergencias.slice(0, 10).map(d =>
    `${d.mlItemId}: ${d.motivo} (${new Date(d.createdAt).toLocaleDateString('pt-BR')})`
  ).join('\n');

  const pendentesDetalhe = pendentes.map(u => `${u.nome} <${u.email}>`).join('\n');

  const usersDetalhe = usuarios.filter(u => u.id !== usuarioAtual?.id).slice(0, 15).map(u =>
    `${u.nome} <${u.email}> — ${u.role}${u.solicitouDesbloqueio && u.role === 'BLOQUEADO' ? ' [AGUARDANDO DESBLOQUEIO]' : ''}`
  ).join('\n');

  // Páginas acessíveis pelo role atual
  const paginasAcessiveis = Object.entries(PAGES)
    .filter(([, v]) => v.roles.includes(userRole))
    .map(([k, v]) => `  • ${v.label}: ${v.path}`)
    .join('\n');

  const imageCtxBlock = imageContext
    ? `\n⚠️ IMAGEM ENVIADA PELO USUÁRIO — descrição: "${imageContext}"\nResponda considerando esta imagem conforme a pergunta.\n`
    : '';

  return `Você é a IA Analyiz 🤖, assistente do sistema de gestão de e-commerce e logística criado pelo Ander Honorato.
Usuário: ${usuarioAtual?.nome || '?'} | Role: ${userRole}
${imageCtxBlock}
=== DADOS DO SISTEMA ===
Produtos: ${totalProdutos}
${produtosDetalhe || '(nenhum)'}

Divergências: ${totalDivergencias}
${divDetalhe || '(nenhuma)'}

Aguardando desbloqueio: ${pendentes.length}
${pendentesDetalhe || '(nenhum)'}

Usuários:
${usersDetalhe || '(nenhum)'}

PÁGINAS DO SISTEMA ACESSÍVEIS PELO USUÁRIO ATUAL (role: ${userRole}):
${paginasAcessiveis || '(nenhuma)'}
========================

SOBRE O CRIADOR:
- Criado pelo Ander Honorato
- Portfólio: https://anderhonorato.github.io/meu-portfolio/index.html
- Para integrar, colocar no site ou customizar: oriente a acessar o portfólio

REGRAS ABSOLUTAS DE FORMATAÇÃO:

REGRA 1 — NUNCA use markdown. NUNCA.
  ✗ Proibido: [texto](url), **negrito**, *itálico*, ## título, --- separador
  ✓ Use HTML: <b>negrito</b>, <i>itálico</i>, <br> para quebra

REGRA 2 — LINKS: escreva SEMPRE como HTML clicável com texto descritivo.
  ✗ NUNCA: https://url ou [texto](url) ou [Fonte: texto - url]
  ✓ SEMPRE: <a href="URL_AQUI" target="_blank">Texto descritivo aqui</a>
  Exemplo correto: Acesse o <a href="https://anderhonorato.github.io/meu-portfolio/index.html" target="_blank">portfólio do Ander Honorato</a>.
  Exemplo correto para fonte: <a href="https://anderhonorato.github.io/meu-portfolio/index.html" target="_blank">Portfólio — Ander Honorato</a>

REGRA 3 — FONTES: quando citar dados, indique a fonte como link HTML clicável no final.
  Formato: (fonte: <a href="URL" target="_blank">nome da fonte</a>)
  Para dados do banco: (fonte: banco de dados do sistema)
  Para portfólio: (fonte: <a href="https://anderhonorato.github.io/meu-portfolio/index.html" target="_blank">portfólio do Ander</a>)

REGRA 4 — NAVEGAÇÃO NO SISTEMA:
  - Se o usuário perguntar como acessar uma página ou funcionalidade:
    a) Verifique se o role dele tem acesso (lista acima)
    b) Se SIM: informe o caminho exato da página com link HTML se disponível
    c) Se NÃO: "Esta seção é acessível apenas por usuários autorizados. Entre em contato com o administrador."
  - Exemplos de como responder com caminho:
    "Acesse pelo menu lateral → <b>Produtos</b> (caminho: /produtos)"
    "No menu lateral, clique em <b>Divergências</b> para ver as anomalias detectadas."

REGRAS DE COMPORTAMENTO:

5. TOM SIMPÁTICO com emojis quando couber 😊✅📦⚠️👤🔍
6. Faça UMA pergunta de continuidade quando a resposta abrir margem para isso
7. RESPONDA APENAS O QUE FOI PERGUNTADO — sem informações extras não solicitadas
8. HISTÓRICO: use silenciosamente para contexto. Só resuma quando o usuário pedir explicitamente.
9. NUNCA comece com "Olá" exceto ao cumprimento inicial ou quando o usuário cumprimentar.
10. Máx 4 linhas para respostas simples. Complete SEMPRE a última frase.`;
}

/**
 * Converte markdown residual para HTML e garante que links sejam clicáveis.
 * Remove [texto](url) e ]. artefatos.
 */
function ensureHTML(text) {
  if (!text) return '';

  return text
    // 1. Converte markdown [texto](url) → <a> clicável
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      '<a href="$2" target="_blank">$1</a>')

    // 2. Remove ]. ou ). soltos que aparecem após links (artefato do modelo)
    .replace(/\]\./g, '.')
    .replace(/\]\)/g, ')')
    .replace(/\)\./g, '.')

    // 3. URLs nuas (não dentro de href já existente) → link clicável com label limpo
    .replace(/(?<!href=["'])(https?:\/\/[^\s<>"'\])\.,]+)/g, (url) => {
      // Se já está dentro de uma tag <a>, não duplica
      return `<a href="${url}" target="_blank">${urlLabel(url)}</a>`;
    })

    // 4. Negrito/itálico markdown residual
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g,     '<i>$1</i>')
    .replace(/_([^_\n]+)_/g,  '<i>$1</i>')

    // 5. Títulos e separadores markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm,     '')

    // 6. Quebras de linha
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g,   '<br>')

    .trim();
}

/** Gera label amigável para URLs */
function urlLabel(url) {
  if (url.includes('anderhonorato.github.io')) return 'Portfólio — Ander Honorato';
  if (url.includes('mercadolivre'))            return 'Mercado Livre';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return url; }
}

function getFallback(message) {
  const l = message.toLowerCase();
  if (l.includes('divergên'))                              return 'Não consegui acessar o kernel agora ⚠️. Verifique a aba <b>Divergências</b>.';
  if (l.includes('produto'))                               return 'Não consegui acessar o kernel agora ⚠️. Consulte o painel de produtos.';
  if (l.includes('usuário') || l.includes('desbloqueio'))  return 'Não consegui acessar o kernel agora ⚠️. Verifique a gestão de usuários.';
  return 'Erro de conexão ⚠️. Tente novamente em instantes.';
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const prompt = userQuestion
      ? `O usuário enviou esta imagem e perguntou: "${userQuestion}"\nDescreva a imagem e responda a pergunta em português.`
      : 'Descreva detalhadamente o conteúdo desta imagem em português. Máx 200 palavras.';

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.3, maxOutputTokens: 400 },
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }]
    });
    return response.text?.trim() || null;
  } catch (e) {
    console.error('[IA_Analyiz] ❌ analyzeImage:', e.message);
    return null;
  }
}

export async function sendChatMessage(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai = getClient();
    const geminiHistory = buildGeminiHistory(history);

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: buildSystemInstruction(context),
        temperature:       0.45,
        maxOutputTokens:   700,
        topP:              0.85,
        safetySettings: [
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
      contents: [...geminiHistory, { role: 'user', parts: [{ text: message }] }],
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') return 'Não consigo responder a essa mensagem. Tente reformular. 🙏';

    const raw = response.text?.trim();
    if (!raw) return getFallback(message);

    const cleaned = ensureHTML(raw);
    console.log(`[IA_Analyiz] ✅ Gemini (${model}) → ${cleaned.length} chars`);
    return cleaned;

  } catch (error) {
    const msg = error?.message || '';
    const isRateLimit = (error?.status === 429) || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
    if (isRateLimit && attempt === 1) {
      console.warn('[IA_Analyiz] ⏳ Rate limit — fallback');
      return sendChatMessage(message, history, context, 2);
    }
    console.error('[IA_Analyiz] ❌', msg.substring(0, 200));
    return getFallback(message);
  }
}