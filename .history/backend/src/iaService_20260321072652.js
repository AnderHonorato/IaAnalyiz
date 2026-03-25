// backend/src/iaService.js — IA Agêntica com Function Calling (Mãos dadas à IA)

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;

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
      pairs.push({ user: stripHTML(cur.content).substring(0, 800), model: stripHTML(next.content).substring(0, 800) });
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

// Detecta quando busca na web é necessária — Gatilho Turbinado
export function needsWebSearch(message) {
  if (!message) return false;
  
  // Lista de palavras que forçam a IA a pesquisar na internet em tempo real
  const regex = /mercado\s*livre|ml\s*api|taxa|tarifa|comiss[ãa]o|frete|envio|correios|transportadora|tabela|política|regras?\s*do\s*ml|como\s+(vender|anunciar|calcular)|o\s+que\s+(é|são)\s+(o\s+)?ml|novidades?\s*(do|no)\s*ml|hora|horas|hoje|agora|clima|câmbio|dólar|notícia|busca|pesquis/i;
  
  return regex.test(message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DECLARAÇÃO DAS FERRAMENTAS (FUNCTION CALLING)
// Ensinamos ao Gemini quais funções do sistema ele pode "apertar".
// ═══════════════════════════════════════════════════════════════════════════════
const SYSTEM_TOOLS = [{
  functionDeclarations: [
    {
      name: 'listarDivergenciasAtivas',
      description: 'Busca a lista de divergências de frete/peso que precisam de correção no Mercado Livre. Retorna o ID interno necessário para correções.',
      parameters: {
        type: 'OBJECT',
        properties: {
          limite: { type: 'INTEGER', description: 'Número máximo de itens a retornar (padrão 5)' }
        }
      }
    },
    {
      name: 'enviarParaFilaDeCorrecao',
      description: 'Marca uma divergência para ser corrigida automaticamente via API do Mercado Livre. O usuário não precisa fazer mais nada.',
      parameters: {
        type: 'OBJECT',
        properties: {
          divergenciaId: { type: 'INTEGER', description: 'O ID NUMÉRICO INTERNO da divergência no banco de dados (não o MLB)' }
        },
        required: ['divergenciaId']
      }
    },
    {
      name: 'ignorarDivergencia',
      description: 'Marca uma divergência como IGNORADA para que pare de alertar o usuário.',
      parameters: {
        type: 'OBJECT',
        properties: {
          divergenciaId: { type: 'INTEGER', description: 'O ID NUMÉRICO INTERNO da divergência no banco de dados' }
        },
        required: ['divergenciaId']
      }
    }
  ]
}];

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MOTOR DE EXECUÇÃO DAS FERRAMENTAS
// O Node.js executa isso quando a IA pede.
// ═══════════════════════════════════════════════════════════════════════════════
async function executeTool(name, args, userId) {
  const uid = parseInt(userId);
  if (!uid) return { erro: 'Usuário não identificado' };

  try {
    switch (name) {
      case 'listarDivergenciasAtivas': {
        const limite = args.limite || 5;
        const divs = await prisma.divergencia.findMany({
          where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
          take: limite,
          select: { id: true, mlItemId: true, titulo: true, pesoMl: true, pesoLocal: true, status: true }
        });
        if (divs.length === 0) return { mensagem: "Logística 100% saudável. Nenhuma divergência ativa no momento." };
        return { divergenciasEncontradas: divs };
      }

      case 'enviarParaFilaDeCorrecao': {
        const divId = parseInt(args.divergenciaId);
        if (!divId) return { erro: "ID da divergência inválido." };
        
        const div = await prisma.divergencia.findFirst({ where: { id: divId, usuarioId: uid } });
        if (!div) return { erro: "Divergência não encontrada ou já resolvida." };
        
        await prisma.divergencia.update({
          where: { id: divId },
          data: { status: 'PENDENTE_ENVIO' }
        });
        return { 
          sucesso: true, 
          mensagem: `✅ Divergência ${divId} (${div.mlItemId}) enviada com sucesso para a fila de correção da API!` 
        };
      }

      case 'ignorarDivergencia': {
        const divId = parseInt(args.divergenciaId);
        if (!divId) return { erro: "ID inválido." };
        
        await prisma.divergencia.update({
          where: { id: divId, usuarioId: uid },
          data: { status: 'IGNORADO', resolvido: true }
        });
        return { sucesso: true, mensagem: `Divergência ${divId} foi ignorada e não alertará mais.` };
      }

      default:
        return { erro: `A função ${name} não existe no sistema.` };
    }
  } catch (e) {
    return { erro: `Falha técnica ao executar ${name}: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INSTRUÇÕES DO SISTEMA (PROMPT)
// ═══════════════════════════════════════════════════════════════════════════════
function buildSystemInstruction(ctx) {
  const { totalProdutos = 0, totalDivergencias = 0, userRole = 'USUÁRIO', usuarioAtual = null, isFirstMessage = false, dataBlock = null } = ctx;

  const contextoDados = dataBlock || `Produtos: ${totalProdutos} | Divergências: ${totalDivergencias}`;
  const saudacaoRule = isFirstMessage 
    ? `Cumprimente ${usuarioAtual?.nome || 'o usuário'} de forma rápida com emoji.` 
    : `Sem saudações. Direto ao ponto.`;

  return `Você é a IA Analyiz, assistente especialista e AGENTE LOGÍSTICO AUTÔNOMO.
Usuário: ${usuarioAtual?.nome || '?'} | Cargo: ${userRole}

=== CONTEXTO E DADOS ===
${contextoDados}

=== SEUS PODERES REAIS (FUNCTION CALLING) ===
Você AGORA TEM MÃOS no sistema! Você pode chamar funções locais para resolver problemas.
Se o usuário pedir para "corrigir a divergência do lápis" ou "mandar pra fila":
1. Primeiro chame "listarDivergenciasAtivas" para descobrir o ID numérico da divergência.
2. Depois chame "enviarParaFilaDeCorrecao" passando esse ID.
3. Avise o usuário que você fez o trabalho por ele!

NÃO mande o usuário clicar em botões se VOCÊ mesma pode chamar a função para ele!

REGRAS:
1. Seja EXTREMAMENTE CONCISA E DIRETA. O chat é pequeno. Máx 2 parágrafos.
2. Use Emojis.
3. Se executou uma ação via Tool, comemore que você resolveu o problema!
4. Use HTML básico (<b>, <i>, <br>). Sem Markdown.
5. ${saudacaoRule}`;
}

function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600" rel="noopener">$1</a>')
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .trim();
}

function cleanMetaText(text) {
  return text.replace(/^(Claro[,!]\s*)/i, '').replace(/^(Com certeza[,!]\s*)/i, '').replace(/^(Entendido[,!]\s*)/i, '').trim();
}

function getFallback() { return '⚠️ Conexão instável. Tente novamente em instantes!'; }

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL, config: { temperature: 0.2, maxOutputTokens: 600 },
      contents: [{ role: 'user', parts: [{ text: userQuestion || `Descreva esta imagem.` }, { inlineData: { mimeType, data: base64 } }] }],
    });
    return response.text?.trim() || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PIPELINE DO CHAT COM FUNCTION CALLING (LOOP)
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildAnswer(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai = getClient();
    const geminiHistory = buildGeminiHistory(history);
    const useSearch = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;
    const userId = context.usuarioAtual?.id || 0;

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage }),
      temperature: 0.25,
      maxOutputTokens: 1000,
      topP: 0.9,
      tools: [...SYSTEM_TOOLS] // 👈 INJETAMOS AS FERRAMENTAS AQUI!
    };

    if (useSearch) config.tools.push({ googleSearch: {} });

    let contents = [...geminiHistory, { role: 'user', parts: [{ text: message || '[imagem enviada]' }] }];
    let response = await ai.models.generateContent({ model, config, contents });

    if (response.candidates?.[0]?.finishReason === 'SAFETY')
      return { reply: '🙏 Mensagem bloqueada por questões de segurança.', sources: [] };

    // ── O LOOP DE FUNCTION CALLING (Se a IA quiser apertar botões) ──
    let callCount = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && callCount < 3) {
      callCount++;
      const call = response.functionCalls[0];
      
      console.log(`\x1b[35m[IA-Tools]\x1b[0m 🤖 A IA decidiu executar a função: ${call.name}`);
      console.log(`\x1b[35m[IA-Tools]\x1b[0m 📦 Parâmetros:`, call.args);

      // 1. Adiciona a "intenção de chamada" ao histórico da conversa
      contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] });

      // 2. Executa a função local no Node.js/Prisma
      const apiResult = await executeTool(call.name, call.args, userId);
      
      console.log(`\x1b[35m[IA-Tools]\x1b[0m ✅ Resultado da função retornado à IA`);

      // 3. Devolve o resultado (JSON) para a IA ler
      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: apiResult } }] });

      // 4. Chama a IA de novo para ela processar o resultado e responder ao usuário
      response = await ai.models.generateContent({ model, config, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply: getFallback(), sources: [] };

    const reply = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter(c => c.web?.uri).map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri })).slice(0, 3);

    return { reply, sources };

  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1)
      return buildAnswer(message, history, context, 2);
    console.error('[buildAnswer]', error.message);
    return { reply: getFallback(), sources: [] };
  }
}

export const sendChatMessage = buildAnswer;

export function buildResumoPrompt(dadosStr) {
  return `Você é um Consultor Especialista em Logística.
Analise os dados abaixo e produza um RELATÓRIO EXECUTIVO.

DADOS:
${typeof dadosStr === 'string' ? dadosStr : JSON.stringify(dadosStr, null, 2)}

ESTRUTURA (HTML limpo: <b>, <i>, <br>):
<b>📊 Diagnóstico Geral</b><br>...
<b>⚠️ Problemas Críticos</b><br>...
<b>📉 Análise de Risco</b><br>...
<b>✅ Plano de Ação Prioritário</b><br>...
<b>💡 Oportunidades</b><br>...`;
}