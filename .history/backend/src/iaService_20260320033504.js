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

// ── CORRIGIDO: Adicionadas as Novas Rotas do ML ──
const PAGES = {
  'dashboard':        { path: '/',                 label: 'Dashboard Home',         roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'ml':               { path: '/ml',               label: 'Painel Mercado Livre',   roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'auditoria':        { path: '/ml/auditoria',     label: 'Auditoria de Anúncios',  roles: ['OWNER', 'ADMIN', 'USUÁRIO'] },
  'usuarios':         { path: '/usuarios',         label: 'Gestão de Usuários',     roles: ['OWNER', 'ADMIN'] },
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

  const pendentes = usuarios.filter(u => u.role === 'BLOQUEADO' && u.solicitouDesbloqueio === true && u.id !== usuarioAtual?.id);

  const produtosDetalhe = produtos.slice(0, 20).map(p => `[${p.sku}] ${p.nome} — R$${p.preco} | ${p.pesoGramas}g | ${p.plataforma}${p.eKit ? ' | KIT' : ''}${p.mlItemId ? ` | ML:${p.mlItemId}` : ''}`).join('\n');
  const divDetalhe = divergencias.slice(0, 10).map(d => `${d.mlItemId}: ${d.motivo} (${new Date(d.createdAt).toLocaleDateString('pt-BR')})`).join('\n');
  const pendentesDetalhe = pendentes.map(u => `${u.nome} <${u.email}>`).join('\n');
  
  const paginasAcessiveis = Object.entries(PAGES).filter(([, v]) => v.roles.includes(userRole)).map(([k, v]) => `  • ${v.label}: ${v.path}`).join('\n');

  const imageCtxBlock = imageContext ? `\n⚠️ IMAGEM ENVIADA PELO USUÁRIO — descrição: "${imageContext}"\nResponda considerando esta imagem conforme a pergunta.\n` : '';

  return `Você é a IA Analyiz 🤖, assistente do sistema de gestão logística.
Usuário: ${usuarioAtual?.nome || '?'} | Role: ${userRole}
${imageCtxBlock}
=== DADOS DO SISTEMA ===
Produtos no Catálogo: ${totalProdutos}
${produtosDetalhe || '(nenhum)'}

Divergências Ativas: ${totalDivergencias}
${divDetalhe || '(nenhuma)'}

Aguardando desbloqueio de acesso: ${pendentes.length}
${pendentesDetalhe || '(nenhum)'}

PÁGINAS DO SISTEMA ACESSÍVEIS PELO USUÁRIO (role: ${userRole}):
${paginasAcessiveis || '(nenhuma)'}
========================

REGRAS DE RESPOSTA E FORMATAÇÃO:
1. NUNCA use markdown (** ou *). Use SEMPRE tags HTML: <b>negrito</b>, <i>itálico</i>, <br> para quebra.
2. Seja sempre direto. Nunca corte a resposta pela metade. 
3. Você está dentro do sistema do cliente. Se ele perguntar "O que tem aqui na tela /ml/auditoria", olhe a lista de páginas e explique as funcionalidades do robô de frete e da tabela de divergências.
4. Baseie-se exclusivamente nos "DADOS DO SISTEMA" listados acima para não errar números.`;
}

function ensureHTML(text) {
  if (!text) return '';
  let result = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  result = result.replace(/\]\./g, '.').replace(/\]\)/g, ')').replace(/\]\s/g, ' ');
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\n<]+)\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<i>$1</i>').replace(/^#{1,6}\s+/gm, '').replace(/^---+$/gm, '');
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
    const prompt = userQuestion ? `Imagem recebida. Pergunta: "${userQuestion}"\nResponda em português.` : 'Descreva detalhadamente esta imagem em português.';
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
  try {
    const ai = getClient();
    const geminiHistory = buildGeminiHistory(history);

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: buildSystemInstruction(context),
        temperature:       0.2, 
        maxOutputTokens:   1200, // ── CORRIGIDO: Limite de resposta dobrado para não cortar a IA
        topP:              0.9,
      },
      contents: [...geminiHistory, { role: 'user', parts: [{ text: message }] }],
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') return 'Mensagem bloqueada por questões de segurança. 🙏';

    const raw = response.text?.trim();
    if (!raw) return getFallback(message);

    const cleaned = ensureHTML(raw);
    return cleaned;

  } catch (error) {
    const isRateLimit = error?.status === 429 || String(error).includes('429');
    if (isRateLimit && attempt === 1) return sendChatMessage(message, history, context, 2);
    return getFallback(message);
  }
}