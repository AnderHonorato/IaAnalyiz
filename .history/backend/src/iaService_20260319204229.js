// ==========================================
// IA ANALYIZ — Serviço de Inteligência Neural
// Arquivo: src/iaService.js
// ==========================================

import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite';
const MAX_HISTORY           = 20;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
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

  return `Você é a IA Analyiz. Assistente do sistema de gestão de e-commerce e logística.
Nome do usuário logado: ${usuarioAtual?.nome || '?'} | Role: ${userRole}

=== DADOS DO SISTEMA ===
Produtos cadastrados: ${totalProdutos}
${produtosDetalhe || '(nenhum produto)'}

Divergências abertas: ${totalDivergencias}
${divDetalhe || '(nenhuma)'}

Usuários aguardando desbloqueio: ${pendentes.length}
${pendentesDetalhe || '(nenhum)'}

Todos os usuários:
${usersDetalhe || '(nenhum)'}
========================

COMO VOCÊ DEVE RESPONDER:

1. RESPONDA APENAS O QUE A PERGUNTA PEDE.
   - "boa noite" → responda "Boa noite!" e nada mais. Não cite dados do sistema.
   - "que horas são" → "Não tenho acesso ao horário." e pare.
   - "quantos usuários bloqueados" → responda o número. Só isso.
   - "o que temos" → dê um resumo breve e pergunte o que quer ver em detalhes.

2. NUNCA MENCIONE O HISTÓRICO DA CONVERSA.
   Proibido absolutamente:
   - "Peço desculpas pela resposta anterior"
   - "Como mencionei antes"
   - "Anteriormente você perguntou"
   - "Na conversa anterior"
   - "Não farei mais isso"
   - "Entendi que você não perguntou sobre X"
   Se errou algo antes, simplesmente responda certo agora. Sem comentar.

3. NUNCA ADICIONE INFORMAÇÕES NÃO PEDIDAS.
   Se o usuário disse "boa noite", não fale de produtos, usuários ou divergências.
   Cada resposta deve conter SOMENTE o que foi perguntado.

4. FORMATAÇÃO — USE APENAS HTML:
   <b>negrito</b>, <i>itálico</i>, <br> para quebrar linha.
   Listas: • item<br>• item<br>
   NUNCA asteriscos (*). NUNCA markdown. NUNCA ** ou ## ou ---.

5. TOM: direto, profissional, sem rodeios. Máx 2-3 linhas para respostas simples.

6. Não repita seu nome. Não se apresente em toda mensagem.`;
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

    const historyFormatted = history
      .slice(-MAX_HISTORY)
      .slice(0, -1)
      .filter(h => h.content?.trim())
      .map(h => ({
        role:  h.role === 'ia' ? 'model' : 'user',
        parts: [{ text: stripHTML(h.content).substring(0, 500) }]
      }));

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: buildSystemInstruction(context),
        temperature:       0.3,
        maxOutputTokens:   400,
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