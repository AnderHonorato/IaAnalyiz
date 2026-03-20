// ==========================================
// IA ANALYIZ — Serviço de Inteligência Neural
// Arquivo: src/iaService.js
// ==========================================

import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite';
const MAX_HISTORY           = 30;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/** Remove tags HTML do histórico antes de enviar ao Gemini */
function stripHTML(text) {
  return (text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function buildSystemInstruction(ctx) {
  const {
    totalProdutos      = 0,
    totalDivergencias  = 0,
    userRole           = 'USUÁRIO',
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

  const pendentes = usuarios.filter(u =>
    u.role === 'BLOQUEADO' && u.solicitouDesbloqueio === true && u.id !== usuarioAtual?.id
  );
  const pendentesDetalhe = pendentes.map(u => `  • ${u.nome} <${u.email}>`).join('\n');

  const usersDetalhe = usuarios.filter(u => u.id !== usuarioAtual?.id).slice(0, 15).map(u =>
    `  • ${u.nome} <${u.email}> — role: ${u.role}${u.solicitouDesbloqueio && u.role === 'BLOQUEADO' ? ' ⚠️ AGUARDANDO DESBLOQUEIO' : ''}`
  ).join('\n');

  return `Você é a IA Analyiz, assistente do sistema de gestão de e-commerce e logística do Ander.
Usuário logado: ${usuarioAtual?.nome || 'desconhecido'} | Role: ${userRole}

DADOS DO SISTEMA:
• Produtos: ${totalProdutos} | Divergências abertas: ${totalDivergencias}
• Usuários aguardando desbloqueio: ${pendentes.length}

PRODUTOS:
${produtosDetalhe || '  (nenhum)'}

DIVERGÊNCIAS:
${divDetalhe || '  (nenhuma)'}

USUÁRIOS AGUARDANDO DESBLOQUEIO:
${pendentesDetalhe || '  (nenhum)'}

TODOS OS USUÁRIOS:
${usersDetalhe || '  (nenhum)'}

════════════════════════════════
REGRAS — LEIA COM ATENÇÃO TOTAL
════════════════════════════════

REGRA ABSOLUTA — NUNCA MENCIONE A CONVERSA ANTERIOR:
Você tem acesso ao histórico SOMENTE para entender o contexto e não repetir informações.
PROIBIDO em qualquer circunstância:
  ✗ "Peço desculpas pela repetição"
  ✗ "Entendi que você não perguntou sobre X"
  ✗ "Como mencionei antes"
  ✗ "Anteriormente você perguntou"
  ✗ "Na nossa conversa"
  ✗ "Não farei mais isso"
  ✗ Qualquer referência ao que foi dito ou não dito antes
Se cometeu um erro, IGNORE — não comente o erro, apenas responda corretamente agora.

REGRA — RESPONDA SÓ O QUE FOI PERGUNTADO:
  ✗ Usuário disse "boa noite" → ERRADO repetir "Boa noite" + mencionar hora
  ✗ Usuário perguntou sobre produto → ERRADO citar usuários
  ✓ Responda a pergunta atual. Só ela.

REGRA — PERGUNTAS DE CONTINUIDADE:
Se a pergunta for vaga, responda o básico e faça UMA pergunta para guiar.
Ex: "Temos ${totalProdutos} produto(s). Quer ver os detalhes ou prefere checar divergências?"

REGRA — FORMATAÇÃO HTML:
  • Use <b>negrito</b>, <i>itálico</i>, <br> para quebras
  • NUNCA asteriscos (*) — aparecem literais no site
  • NUNCA markdown: sem **texto**, ## títulos, --- separadores

REGRA — TOM:
  • Direto, profissional, conciso
  • Máx 2-3 linhas para respostas simples
  • Não repita seu próprio nome`;
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
  if (l.includes('divergên'))                              return 'Não consegui acessar o kernel. Verifique a aba <b>Divergências</b>.';
  if (l.includes('produto'))                               return 'Não consegui acessar o kernel. Consulte o painel de produtos.';
  if (l.includes('usuário') || l.includes('desbloqueio'))  return 'Não consegui acessar o kernel. Verifique a gestão de usuários.';
  return 'Erro de conexão com o Kernel. Tente novamente.';
}

export async function sendChatMessage(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;

  try {
    const ai = getClient();

    // Limpa HTML do histórico antes de enviar ao Gemini
    // Isso evita que o modelo aprenda padrões ruins de respostas anteriores
    const historyFormatted = history
      .slice(-MAX_HISTORY)
      .slice(0, -1)           // exclui a mensagem atual (vai em contents)
      .filter(h => h.content?.trim())
      .map(h => ({
        role:  h.role === 'ia' ? 'model' : 'user',
        parts: [{
          text: stripHTML(h.content).substring(0, 600)
        }]
      }));

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: buildSystemInstruction(context),
        temperature:       0.4,   // mais baixo = menos "criativo" com o histórico
        maxOutputTokens:   500,
        topP:              0.8,
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