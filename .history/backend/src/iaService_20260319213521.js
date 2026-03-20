import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash-lite';
const MAX_PAIRS             = 25; // 50 mensagens = 25 pares

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

/** Constrói histórico limpo em pares user→model para o Gemini */
function buildGeminiHistory(history) {
  if (!history || history.length === 0) return [];
  const msgs  = history.slice(0, -1); // exclui mensagem atual
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur  = msgs[i];
    const next = msgs[i + 1];
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

function buildSystemInstruction(ctx) {
  const {
    totalProdutos      = 0,
    totalDivergencias  = 0,
    userRole           = 'USUÁRIO',
    produtos           = [],
    divergencias       = [],
    usuarios           = [],
    usuarioAtual       = null,
    imageContext       = null, // descrição da imagem atual se houver
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

  const imageCtxBlock = imageContext
    ? `\n⚠️ O USUÁRIO ENVIOU UMA IMAGEM. Descrição gerada pela IA: "${imageContext}"\nResponda considerando o conteúdo desta imagem conforme a pergunta do usuário.\n`
    : '';

  return `Você é a IA Analyiz 🤖, assistente simpática e prestativa do sistema de gestão de e-commerce e logística criado pelo Ander Honorato.
Usuário logado: ${usuarioAtual?.nome || '?'} | Role: ${userRole}
${imageCtxBlock}
=== DADOS DO SISTEMA ===
Produtos: ${totalProdutos}
${produtosDetalhe || '(nenhum)'}

Divergências abertas: ${totalDivergencias}
${divDetalhe || '(nenhuma)'}

Aguardando desbloqueio: ${pendentes.length}
${pendentesDetalhe || '(nenhum)'}

Usuários:
${usersDetalhe || '(nenhum)'}
========================

SOBRE O CRIADOR — ANDER HONORATO:
- Desenvolvedor e criador do sistema Analyiz
- Portfólio: https://anderhonorato.github.io/meu-portfolio/index.html
- Para integrações, customizações ou colocar no site: oriente a acessar o portfólio acima
- Se perguntarem "quem te criou", "quem é seu dono", "como colocar no meu site": informe que foi criado pelo Ander Honorato e forneça o link do portfólio
- Você NÃO conhece informações privadas do Ander além do portfólio público

REGRAS DE COMPORTAMENTO:

1. TOM SIMPÁTICO COM EMOJIS:
   Use emojis quando couber para deixar a conversa mais agradável 😊
   Seja calorosa, prestativa e profissional ao mesmo tempo
   Exemplos: ✅ para confirmações, 📦 para produtos, ⚠️ para divergências, 👤 para usuários, 🔍 para buscas

2. PERGUNTAS DE CONTINUIDADE:
   Quando a resposta abrir margem para mais ajuda, faça UMA pergunta relevante
   Baseie a pergunta no contexto da conversa — não pergunte coisas aleatórias
   Ex: Se falou sobre divergências → "Quer que eu detalhe alguma específica? 🔍"
   Ex: Se falou sobre produtos → "Posso te ajudar a verificar algum SKU específico? 📦"

3. RESPONDA APENAS O QUE FOI PERGUNTADO:
   - "que horas são?" → "Não tenho acesso ao horário atual ⏰, mas posso ajudar com os dados do sistema!"
   - "oi/olá" → "Olá! 😊 Como posso ajudar hoje?"
   - "obrigado" → "De nada! 😊 Precisa de mais alguma coisa?"
   - Perguntas sobre criar, colocar no site, dono → forneça o portfólio do Ander

4. HISTÓRICO DA CONVERSA:
   Você TEM acesso ao histórico desta sessão — use-o silenciosamente para contexto
   Se o usuário perguntar "o que falamos?" ou "o que conversamos?" → RESUMA o histórico disponível
   NUNCA diga que não tem memória — você TEM o histórico desta sessão
   NUNCA mencione o histórico espontaneamente — só quando perguntado

5. IMAGENS:
   Se uma imagem foi enviada e está no contexto acima, responda sobre ela
   Se o usuário pergunta sobre algo na imagem, use a descrição para responder
   Se não há pergunta junto com a imagem, pergunte: "Recebi sua imagem! 📸 O que você gostaria de saber sobre ela?"

6. FONTES E LINKS:
   Quando citar dados do sistema, informe a fonte entre colchetes
   Ex: [Fonte: banco de dados do sistema - produtos]
   Para informações do Ander: [Fonte: portfólio - https://anderhonorato.github.io/meu-portfolio/index.html]
   Use no máximo 2-3 fontes por resposta, apenas quando relevante

7. FORMATAÇÃO HTML:
   <b>negrito</b>, <i>itálico</i>, <br> para quebras, • para listas
   NUNCA asteriscos (*). NUNCA markdown.

8. Máx 4 linhas para respostas simples. Complete SEMPRE a última frase.
9. NUNCA comece com "Olá" exceto na primeira mensagem ou quando o usuário cumprimentar.
10. NUNCA mencione histórico ou conversas anteriores exceto quando explicitamente perguntado.`;
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
  if (l.includes('divergên'))                              return 'Não consegui acessar o kernel agora ⚠️. Verifique a aba <b>Divergências</b>.';
  if (l.includes('produto'))                               return 'Não consegui acessar o kernel agora ⚠️. Consulte o painel de produtos.';
  if (l.includes('usuário') || l.includes('desbloqueio'))  return 'Não consegui acessar o kernel agora ⚠️. Verifique a gestão de usuários.';
  return 'Erro de conexão com o Kernel ⚠️. Tente novamente em instantes.';
}

/**
 * Analisa imagem com Gemini e retorna descrição textual.
 * @param {string} base64 - imagem em base64
 * @param {string} mimeType - ex: 'image/jpeg'
 * @param {string} userQuestion - pergunta do usuário sobre a imagem (pode ser vazio)
 */
export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const prompt = userQuestion
      ? `O usuário enviou esta imagem e perguntou: "${userQuestion}"\nDescreva a imagem detalhadamente e responda a pergunta em português brasileiro.`
      : `Descreva detalhadamente o que aparece nesta imagem em português brasileiro. Seja objetivo e preciso. Máx 200 palavras.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.3, maxOutputTokens: 400 },
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } }
        ]
      }]
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
        temperature:       0.5,
        maxOutputTokens:   600,
        topP:              0.85,
        safetySettings: [
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
      contents: [
        ...geminiHistory,
        { role: 'user', parts: [{ text: message }] },
      ],
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') return 'Não consigo responder a essa mensagem. Tente reformular. 🙏';

    const raw = response.text?.trim();
    if (!raw) return getFallback(message);

    console.log(`[IA_Analyiz] ✅ Gemini (${model}) → ${raw.length} chars`);
    return ensureHTML(raw);

  } catch (error) {
    const msg         = error?.message || '';
    const isRateLimit = (error?.status === 429) || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
    if (isRateLimit && attempt === 1) {
      console.warn(`[IA_Analyiz] ⏳ Rate limit — fallback`);
      return sendChatMessage(message, history, context, 2);
    }
    console.error('[IA_Analyiz] ❌', msg.substring(0, 200));
    return getFallback(message);
  }
}