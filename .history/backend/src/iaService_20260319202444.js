// ==========================================
// IA ANALYIZ — Serviço de Inteligência Neural
// Arquivo: src/iaService.js
// ==========================================

import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite';
const MAX_HISTORY           = 40;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function buildSystemInstruction(ctx) {
  const {
    totalProdutos      = 0,
    totalDivergencias  = 0,
    userRole           = 'USUÁRIO',
    usuariosPendentes  = 0,
    totalUsuarios      = 0,
    usuariosBlockeados = 0,
    usuariosAtivos     = 0,
    produtos           = [],
    divergencias       = [],
    usuarios           = [],
    usuarioAtual       = null,
  } = ctx;

  const produtosDetalhe = produtos.slice(0, 20).map(p =>
    `  • [${p.sku}] ${p.nome} — R$${p.preco} | ${p.pesoGramas}g | ${p.plataforma}${p.eKit ? ' | KIT' : ''}${p.mlItemId ? ` | ML:${p.mlItemId}` : ''}`
  ).join('\n');

  const divDetalhe = divergencias.slice(0, 10).map(d =>
    `  • ${d.mlItemId}: ${d.motivo} (em ${new Date(d.createdAt).toLocaleDateString('pt-BR')})`
  ).join('\n');

  // Exclui o próprio usuário logado da listagem de pendentes
  const pendentes = usuarios.filter(u =>
    u.role === 'BLOQUEADO' &&
    u.solicitouDesbloqueio === true &&
    u.id !== usuarioAtual?.id
  );
  const pendentesDetalhe = pendentes.map(u =>
    `  • ${u.nome} <${u.email}>`
  ).join('\n');

  const usersDetalhe = usuarios.filter(u => u.id !== usuarioAtual?.id).slice(0, 15).map(u =>
    `  • ${u.nome} <${u.email}> — role: ${u.role}${u.solicitouDesbloqueio && u.role === 'BLOQUEADO' ? ' ⚠️ AGUARDANDO DESBLOQUEIO' : ''}`
  ).join('\n');

  return `Você é a IA Analyiz, assistente do sistema de gestão de e-commerce e logística.

═══ DADOS REAIS DO SISTEMA ═══

RESUMO:
• Produtos cadastrados: ${totalProdutos}
• Divergências abertas: ${totalDivergencias}
• Total de usuários (excluindo você): ${totalUsuarios - 1}
• Usuários ativos: ${usuariosAtivos}
• Usuários bloqueados: ${usuariosBlockeados}
• Aguardando desbloqueio: ${pendentes.length}
• Seu role: ${userRole}
• Você está logado como: ${usuarioAtual?.nome || 'desconhecido'} <${usuarioAtual?.email || ''}>

USUÁRIOS AGUARDANDO DESBLOQUEIO (${pendentes.length}):
${pendentesDetalhe || '  (nenhum)'}

TODOS OS USUÁRIOS DO SISTEMA:
${usersDetalhe || '  (nenhum)'}

PRODUTOS CADASTRADOS:
${produtosDetalhe || '  (nenhum produto cadastrado)'}

DIVERGÊNCIAS ABERTAS:
${divDetalhe || '  (nenhuma divergência aberta)'}

═══ REGRAS DE COMPORTAMENTO — CRÍTICAS ═══

REGRA 1 — RESPONDA SÓ O QUE FOI PERGUNTADO:
- Se o usuário perguntou sobre usuários pendentes: responda sobre usuários pendentes. Só isso.
- Se o usuário perguntou sobre produtos: responda sobre produtos. Só isso.
- NUNCA mencione dados não solicitados (ex: se perguntaram sobre usuários, não cite produtos nem divergências)
- NUNCA faça resumo da conversa anterior a não ser que o usuário peça explicitamente com "o que conversamos" ou "resuma nossa conversa"

REGRA 2 — HISTÓRICO:
- Você TEM o histórico desta sessão e PODE usá-lo para entender o contexto
- Use o histórico silenciosamente para dar respostas coerentes
- NUNCA liste ou resuma o que foi dito antes a menos que seja explicitamente pedido
- NUNCA diga frases como "anteriormente você perguntou", "como mencionei antes", "na nossa conversa anterior" — a não ser que o usuário peça

REGRA 3 — FORMATAÇÃO HTML:
- Use <b>negrito</b>, <i>itálico</i>, <br> para quebra de linha
- NUNCA asteriscos (*) — aparecem como texto literal
- NUNCA markdown: sem **texto**, ## títulos, --- separadores
- Para listas: • item<br>• item<br>

REGRA 4 — COMPORTAMENTO GERAL:
- Apresente-se brevemente apenas na primeiríssima mensagem
- Não repita seu nome nas respostas
- Para perguntas fora do domínio: responda em uma frase e pare
- Seja direto e conciso — máx 3 parágrafos
- Use os dados reais acima — nunca invente`;
}

function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g,  '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g,  '<b>$1</b>')
    .replace(/__(.+?)__/g,      '<i>$1</i>')
    .replace(/_([^_\n]+)_/g,    '<i>$1</i>')
    .replace(/^#{1,6}\s+/gm,    '')
    .replace(/^---+$/gm,        '')
    .replace(/\n\n/g,           '<br><br>')
    .replace(/\n/g,             '<br>')
    .trim();
}

function getFallback(message) {
  const l = message.toLowerCase();
  if (l.includes('divergên'))                             return 'Não consegui acessar o kernel. Verifique a aba <b>Divergências</b>.';
  if (l.includes('produto'))                              return 'Não consegui acessar o kernel. Consulte o painel de produtos.';
  if (l.includes('usuário') || l.includes('desbloqueio')) return 'Não consegui acessar o kernel. Verifique a gestão de usuários.';
  return 'Erro de conexão com o Kernel. Tente novamente.';
}

export async function sendChatMessage(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;

  try {
    const ai = getClient();

    const historyFormatted = history
      .slice(-MAX_HISTORY)
      .slice(0, -1)
      .map(h => ({
        role:  h.role === 'ia' ? 'model' : 'user',
        parts: [{ text: h.content.length > 800 ? h.content.substring(0, 800) + '...' : h.content }]
      }));

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: buildSystemInstruction(context),
        temperature:       0.55,
        maxOutputTokens:   800,
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
    if (finishReason === 'SAFETY') return 'Não consigo responder a essa mensagem. Tente reformular.';

    const raw = response.text?.trim();
    if (!raw) return getFallback(message);

    console.log(`[IA_Analyiz] ✅ Gemini (${model}) → ${raw.length} chars`);
    return ensureHTML(raw);

  } catch (error) {
    const msg         = error?.message || '';
    const isRateLimit = (error?.status === 429) || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');

    if (isRateLimit && attempt === 1) {
      console.warn(`[IA_Analyiz] ⏳ Rate limit — fallback ${GEMINI_MODEL_FALLBACK}`);
      return sendChatMessage(message, history, context, 2);
    }

    console.error('[IA_Analyiz] ❌', msg.substring(0, 200));
    return getFallback(message);
  }
}