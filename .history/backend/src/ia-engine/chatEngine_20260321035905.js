// src/ia-engine/chatEngine.js
// Motor de chat inteligente: conhecimento local → Gemini → validação → aprendizado

import { queryKnowledge, findBestQA, incrementQAUsage, getRecentKnowledge } from './knowledge.js';
import { scheduleBackgroundValidation } from './validator.js';
import { buildAnswer } from '../iaService.js';

function log(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const c = { info:'\x1b[36m', success:'\x1b[32m', warn:'\x1b[33m', error:'\x1b[31m' }[type] || '\x1b[36m';
  console.log(`${c}[IA-ENGINE] [${t}]\x1b[0m ${msg}`);
}

/**
 * Gera um insight CURTO (≤75 chars, sem HTML) para o balão de notificação
 * Tenta usar o salvado no banco primeiro, depois gera um novo
 */
export async function generateShortInsight(contextLines) {
  // 1. Tenta usar insight já salvo pelo Learner (evita chamar Gemini)
  try {
    const { getLatestShortInsight } = await import('./learner.js');
    const saved = await getLatestShortInsight();
    if (saved && saved.length > 0 && saved.length <= 80) {
      log(`💡 Insight curto do cache: "${saved}"`, 'success');
      return saved;
    }
  } catch {}

  // 2. Gera novo via Gemini com prompt ultra-restritivo de tamanho
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Dados:
${contextLines.slice(0,5).join('\n')}

Escreva UMA frase de alerta COMPLETA em português.
REGRAS ABSOLUTAS:
- Máximo 70 caracteres (conte cada caractere)
- Sem emoji
- Sem HTML  
- A frase DEVE terminar com ponto final
- Seja específico com números se disponíveis
Exemplo: "3 anúncios com peso divergente aguardam correção."
Responda APENAS a frase:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite-preview-06-17',
      config: { temperature: 0.1, maxOutputTokens: 50, thinkingConfig: { thinkingBudget: 0 } },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    let text = (response.text || '').trim()
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\*+/g, '')
      .trim();

    // Garante tamanho máximo sem cortar no meio da palavra
    if (text.length > 75) {
      const cut = text.lastIndexOf(' ', 72);
      text = cut > 30 ? text.substring(0, cut) + '.' : text.substring(0, 72) + '.';
    }

    // Garante que termina com ponto
    if (text && !text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
      text += '.';
    }

    log(`💡 Insight curto gerado: "${text}" (${text.length} chars)`, 'success');
    return text;

  } catch (e) {
    log(`Erro ao gerar insight curto: ${e.message}`, 'warn');
    return null;
  }
}

/**
 * Motor principal de chat inteligente
 * Pipeline: Conhecimento local → Contexto enriquecido → Gemini → Validação background → Resposta
 */
export async function smartChat(message, history = [], baseContext = {}) {
  const start = Date.now();
  log(`💬 smartChat: "${message.substring(0, 60)}"`);

  try {
    // ── FASE 1: Busca conhecimento local ──────────────────────────────────────
    const [knowledgeResults, qaResults, recentKnowledge] = await Promise.all([
      queryKnowledge(message, 5),
      findBestQA(message, 3),
      getRecentKnowledge(8),
    ]);

    const hasLocalContext = knowledgeResults.length > 0 || qaResults.length > 0;
    log(`📚 Conhecimento: ${knowledgeResults.length} entradas, ${qaResults.length} Q&As ${hasLocalContext ? '✓' : '(nenhum relevante)'}`, hasLocalContext ? 'success' : 'info');

    // ── FASE 2: Constrói contexto enriquecido ────────────────────────────────
    const knowledgeBlock = buildKnowledgeBlock(knowledgeResults, qaResults, recentKnowledge);

    const enrichedContext = {
      ...baseContext,
      dataBlock: [baseContext.dataBlock, knowledgeBlock].filter(Boolean).join('\n\n'),
    };

    // ── FASE 3: Gera resposta via Gemini com contexto local ──────────────────
    const { reply, sources } = await buildAnswer(message, history, enrichedContext);

    // ── FASE 4: Validação em background (não bloqueia o usuário) ────────────
    if (reply && message.trim().length > 5) {
      const context = knowledgeBlock || '';
      scheduleBackgroundValidation(message, reply, context);
    }

    // ── FASE 5: Incrementa uso dos Q&As usados ────────────────────────────
    for (const qa of qaResults.slice(0, 2)) {
      incrementQAUsage(qa.id).catch(() => {});
    }

    const elapsed = Date.now() - start;
    log(`✅ Resposta em ${elapsed}ms | local: ${hasLocalContext ? 'sim' : 'não'}`, 'success');

    return { reply, sources, usedLocalKnowledge: hasLocalContext };

  } catch (e) {
    log(`❌ smartChat error: ${e.message} — fallback para Gemini direto`, 'error');
    // Fallback: Gemini sem contexto local
    return buildAnswer(message, history, baseContext);
  }
}

/**
 * Constrói o bloco de contexto a partir do conhecimento local
 */
function buildKnowledgeBlock(knowledgeResults, qaResults, recentKnowledge) {
  const parts = [];

  // Conhecimento específico para a query
  if (knowledgeResults.length > 0) {
    parts.push('=== CONHECIMENTO ACUMULADO DO SISTEMA (atualizado continuamente) ===');
    for (const k of knowledgeResults) {
      const conf = Math.round(k.confidence * 100);
      parts.push(`[${k.topic}] — confiança ${conf}%:`);
      parts.push(k.content.substring(0, 500));
      parts.push('');
    }
  }

  // Contexto geral recente (se não tiver resultados específicos)
  if (knowledgeResults.length === 0 && recentKnowledge.length > 0) {
    parts.push('=== ESTADO GERAL DO SISTEMA ===');
    for (const k of recentKnowledge.slice(0, 4)) {
      parts.push(`[${k.topic}]: ${k.content.substring(0, 200)}`);
    }
    parts.push('');
  }

  // Perguntas similares respondidas anteriormente
  if (qaResults.length > 0) {
    parts.push('=== RESPOSTAS VALIDADAS ANTERIORMENTE ===');
    for (const qa of qaResults) {
      const bestAnswer = qa.correctedAnswer || qa.answer;
      const conf = Math.round(qa.confidence * 100);
      parts.push(`P: ${qa.question.substring(0, 150)}`);
      parts.push(`R (validada ${conf}%): ${bestAnswer.substring(0, 300)}`);
      parts.push('');
    }
  }

  return parts.length > 0 ? parts.join('\n').trim() : null;
}

/**
 * Gera insight proativo (curto para balão + completo para chat)
 */
export async function generateProactiveInsight(contextLines, userId) {
  const shortInsight = await generateShortInsight(contextLines);

  // Insight completo via Gemini normal (para usar quando chat abrir)
  let fullInsight = null;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Dados do sistema:
${contextLines.join('\n')}

Gere 1 alerta em HTML limpo para o gestor de e-commerce.
Use emojis contextuais. Máximo 150 chars. Comece com emoji.
Use apenas <b> para negrito. Foco no risco operacional mais crítico.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite-preview-06-17',
      config: { temperature: 0.3, maxOutputTokens: 120, thinkingConfig: { thinkingBudget: 0 } },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    fullInsight = (response.text || '').trim();
  } catch {}

  return { shortInsight, fullInsight };
}