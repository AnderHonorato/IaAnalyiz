// src/ia-engine/knowledge.js
// Cérebro persistente da IA — salva, busca e gerencia todo conhecimento acumulado

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ─── KNOWLEDGE BASE ───────────────────────────────────────────────────────────

/**
 * Salva um conhecimento sobre o sistema
 * Se já existir tópico similar, atualiza
 */
export async function saveKnowledge(topic, content, source = 'auto', confidence = 0.7) {
  try {
    const existing = await prisma.iAKnowledge.findFirst({
      where: { topic: { equals: topic } }
    });

    if (existing) {
      return await prisma.iAKnowledge.update({
        where: { id: existing.id },
        data: {
          content,
          confidence: Math.max(existing.confidence, confidence),
          source,
          updatedAt: new Date(),
        },
      });
    }

    return await prisma.iAKnowledge.create({
      data: { topic, content, source, confidence },
    });
  } catch (e) {
    console.error('[Knowledge] saveKnowledge error:', e.message);
    return null;
  }
}

/**
 * Busca conhecimentos relevantes para uma query por pontuação de palavras-chave
 */
export async function queryKnowledge(query, limit = 6) {
  try {
    const all = await prisma.iAKnowledge.findMany({
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      take: 150,
    });

    const words = (query || '').toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !['que', 'com', 'uma', 'para', 'como', 'não', 'são', 'dos', 'das', 'nos'].includes(w));

    if (words.length === 0) return all.slice(0, limit);

    const scored = all
      .map(k => {
        const text = `${k.topic} ${k.content}`.toLowerCase();
        const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
        return { ...k, score };
      })
      .filter(k => k.score > 0)
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
      .slice(0, limit);

    return scored;
  } catch (e) {
    console.error('[Knowledge] queryKnowledge error:', e.message);
    return [];
  }
}

/**
 * Retorna os conhecimentos mais recentes (para contexto geral)
 */
export async function getRecentKnowledge(limit = 15) {
  try {
    return await prisma.iAKnowledge.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { topic: true, content: true, confidence: true, source: true },
    });
  } catch {
    return [];
  }
}

// ─── Q&A PAIRS ────────────────────────────────────────────────────────────────

/**
 * Salva um par pergunta-resposta com indicação de correção
 */
export async function saveQAPair({ question, proposedAnswer, isCorrect, correctedAnswer = null, confidence = 0.5, source = 'user' }) {
  try {
    return await prisma.iAQAPair.create({
      data: {
        question: question.substring(0, 500),
        answer:   proposedAnswer.substring(0, 2000),
        isCorrect,
        correctedAnswer: correctedAnswer ? correctedAnswer.substring(0, 2000) : null,
        confidence,
        source,
      },
    });
  } catch (e) {
    console.error('[Knowledge] saveQAPair error:', e.message);
    return null;
  }
}

/**
 * Busca pares Q&A corretos mais relevantes para uma pergunta
 */
export async function findBestQA(question, limit = 3) {
  try {
    const correct = await prisma.iAQAPair.findMany({
      where:   { isCorrect: true },
      orderBy: [{ useCount: 'desc' }, { confidence: 'desc' }],
      take:    300,
    });

    const words = (question || '').toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (words.length === 0) return correct.slice(0, limit);

    const scored = correct
      .map(qa => {
        const text = qa.question.toLowerCase();
        const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
        return { ...qa, score };
      })
      .filter(qa => qa.score > 0)
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
      .slice(0, limit);

    return scored;
  } catch (e) {
    console.error('[Knowledge] findBestQA error:', e.message);
    return [];
  }
}

/**
 * Incrementa contador de uso de um par Q&A
 */
export async function incrementQAUsage(id) {
  try {
    await prisma.iAQAPair.update({ where: { id }, data: { useCount: { increment: 1 } } });
  } catch {}
}

// ─── LOGGING ─────────────────────────────────────────────────────────────────

/**
 * Loga atividade de aprendizado no banco
 */
export async function logLearning(type, content, result = null) {
  try {
    await prisma.iALearningLog.create({
      data: { type, content: content.substring(0, 1000), result: result ? String(result).substring(0, 500) : null },
    });
  } catch {}
}

// ─── STATS ───────────────────────────────────────────────────────────────────

/**
 * Estatísticas da base de conhecimento
 */
export async function getKnowledgeStats() {
  try {
    const [knowledgeCount, qaPairCount, correctPairs, logCount, lastLog] = await Promise.all([
      prisma.iAKnowledge.count(),
      prisma.iAQAPair.count(),
      prisma.iAQAPair.count({ where: { isCorrect: true } }),
      prisma.iALearningLog.count(),
      prisma.iALearningLog.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);

    const accuracy = qaPairCount > 0 ? Math.round((correctPairs / qaPairCount) * 100) : 0;

    return {
      knowledgeEntries: knowledgeCount,
      totalQAPairs:     qaPairCount,
      correctAnswers:   correctPairs,
      incorrectAnswers: qaPairCount - correctPairs,
      accuracy,
      learningEvents:   logCount,
      lastActivity:     lastLog?.createdAt || null,
    };
  } catch (e) {
    return { knowledgeEntries: 0, totalQAPairs: 0, correctAnswers: 0, incorrectAnswers: 0, accuracy: 0, learningEvents: 0, lastActivity: null };
  }
}

/**
 * Retorna logs recentes de aprendizado
 */
export async function getRecentLogs(limit = 20) {
  try {
    return await prisma.iALearningLog.findMany({
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select:  { id: true, type: true, content: true, result: true, createdAt: true },
    });
  } catch {
    return [];
  }
}

/**
 * Limpa registros antigos de log (manter últimos 500)
 */
export async function cleanOldLogs() {
  try {
    const count = await prisma.iALearningLog.count();
    if (count > 500) {
      const oldest = await prisma.iALearningLog.findMany({
        orderBy: { createdAt: 'asc' },
        take:    count - 500,
        select:  { id: true },
      });
      await prisma.iALearningLog.deleteMany({ where: { id: { in: oldest.map(l => l.id) } } });
    }
  } catch {}
}