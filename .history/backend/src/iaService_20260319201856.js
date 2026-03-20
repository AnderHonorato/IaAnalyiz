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
  } = ctx;

  // Monta detalhes de produtos (máx 20 para não estourar o contexto)
  const produtosDetalhe = produtos.slice(0, 20).map(p =>
    `  • [${p.sku}] ${p.nome} — R$${p.preco} | ${p.pesoGramas}g | ${p.plataforma}${p.eKit ? ' | KIT' : ''}${p.mlItemId ? ` | ML:${p.mlItemId}` : ''}`
  ).join('\n');

  // Divergências abertas (máx 10)
  const divDetalhe = divergencias.slice(0, 10).map(d =>
    `  • ${d.mlItemId}: ${d.motivo} (registrada em ${new Date(d.createdAt).toLocaleDateString('pt-BR')})`
  ).join('\n');

  // Usuários (máx 15, sem senha)
  const usersDetalhe = usuarios.slice(0, 15).map(u =>
    `  • ${u.nome} <${u.email}> — role: ${u.role}${u.solicitouDesbloqueio ? ' ⚠️ AGUARDANDO DESBLOQUEIO' : ''}`
  ).join('\n');

  return `Você é a IA Analyiz, assistente inteligente do sistema de gestão de e-commerce e logística.

═══ DADOS REAIS DO SISTEMA (use estes dados para responder) ═══

RESUMO:
• Produtos cadastrados: ${totalProdutos}
• Divergências abertas: ${totalDivergencias}
• Total de usuários: ${totalUsuarios} (ativos: ${usuariosAtivos} | bloqueados: ${usuariosBlockeados} | aguardando desbloqueio: ${usuariosPendentes})
• Role do usuário atual: ${userRole}

PRODUTOS CADASTRADOS:
${produtosDetalhe || '  (nenhum produto cadastrado)'}

DIVERGÊNCIAS ABERTAS:
${divDetalhe || '  (nenhuma divergência aberta)'}

USUÁRIOS DO SISTEMA:
${usersDetalhe || '  (nenhum usuário encontrado)'}

═══ INSTRUÇÕES DE COMPORTAMENTO ═══

FORMATAÇÃO — REGRA ABSOLUTA:
- A interface renderiza HTML — use APENAS tags HTML
- Use <b>negrito</b>, <i>itálico</i>, <br> para quebra de linha
- NUNCA use asteriscos (*) — aparecem como texto literal no site
- NUNCA use markdown: sem **texto**, *texto*, ## títulos, --- separadores
- Para listas: • item<br>• item<br>
- Respostas diretas e concisas — responda APENAS o que foi perguntado

MEMÓRIA:
- Você tem o histórico desta conversa — use-o
- NUNCA diga que não tem memória — você tem o histórico da sessão

COMPORTAMENTO:
- Apresente-se brevemente apenas na primeira mensagem
- Não repita seu nome em toda resposta
- Responda APENAS o que foi perguntado — não exiba dados não solicitados
- Para perguntas fora do domínio: responda brevemente e volte ao foco
- Seja preciso com os dados reais acima — nunca invente informações
- Se perguntarem sobre usuários pendentes: informe o número e liste os nomes
- Se perguntarem sobre produtos: cite SKU, nome e dados relevantes
- Se perguntarem sobre divergências: explique o motivo e o item afetado`;
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
  if (l.includes('divergên'))  return 'Não consegui acessar o kernel. Verifique a aba <b>Divergências</b>.';
  if (l.includes('produto'))   return 'Não consegui acessar o kernel. Consulte o painel de produtos.';
  if (l.includes('usuário') || l.includes('acesso')) return 'Não consegui acessar o kernel. Verifique a gestão de usuários.';
  return 'Erro de conexão com o Kernel. Tente novamente.';
}

/**
 * Envia mensagem para a IA e retorna { reply, fetchedData }
 * fetchedData indica o que foi realmente buscado no banco (para o frontend exibir as etapas corretas)
 */
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
        temperature:       0.6,
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