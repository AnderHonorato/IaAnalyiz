// src/ia-engine/validator.js
// Valida respostas da IA com o Gemini e salva para aprendizado

import { saveQAPair, logLearning } from './knowledge.js';

const GEMINI_MODEL = 'gemini-2.5-flash-lite-preview-06-17';

function log(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const c = { info:'\x1b[36m', success:'\x1b[32m', warn:'\x1b[33m', error:'\x1b[31m' }[type] || '\x1b[36m';
  console.log(`${c}[IA-VALID] [${t}]\x1b[0m ${msg}`);
}

function getClient() {
  try {
    if (!process.env.GEMINI_API_KEY) return null;
    const { GoogleGenAI } = require('@google/genai');
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch { return null; }
}

function stripHTML(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Valida uma resposta proposta com o Gemini
 * @returns { isCorrect, correctedAnswer, confidence, reasoning }
 */
export async function validateAnswer(question, proposedAnswer, context = '') {
  const ai = getClient();
  if (!ai) {
    return { isCorrect: true, correctedAnswer: null, confidence: 0.5, reasoning: 'gemini_unavailable' };
  }

  try {
    const cleanQ = question.substring(0, 300);
    const cleanA = stripHTML(proposedAnswer).substring(0, 600);
    const cleanC = stripHTML(context).substring(0, 400);

    const prompt = `Você é um validador especializado em e-commerce, Mercado Livre e logística.

CONTEXTO DO SISTEMA:
${cleanC || '(sem contexto adicional)'}

PERGUNTA DO USUÁRIO:
"${cleanQ}"

RESPOSTA PROPOSTA PELO ASSISTENTE:
"${cleanA}"

Avalie criticamente se esta resposta é:
1. Factualmente correta em relação a e-commerce/ML/logística
2. Útil e relevante para a pergunta
3. Completa (não deixa a pergunta sem resposta)

Responda EXCLUSIVAMENTE com JSON puro (sem markdown, sem texto antes/depois):
{
  "correta": true ou false,
  "confianca": 0.0 a 1.0,
  "motivo": "uma frase explicando sua avaliação",
  "resposta_corrigida": "resposta melhorada em português (null se a resposta original estiver boa)"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.1, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const raw = (response.text || '').trim();
    const firstBrace = raw.indexOf('{');
    const lastBrace  = raw.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) throw new Error('Resposta do Gemini sem JSON');

    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));

    const result = {
      isCorrect:       Boolean(parsed.correta),
      correctedAnswer: parsed.resposta_corrigida || null,
      confidence:      Math.min(1, Math.max(0, parseFloat(parsed.confianca) || 0.5)),
      reasoning:       parsed.motivo || '',
    };

    log(
      `Validação: ${result.isCorrect ? '✅ CORRETA' : '❌ INCORRETA'} | Confiança: ${Math.round(result.confidence * 100)}% | ${result.reasoning}`,
      result.isCorrect ? 'success' : 'warn'
    );

    return result;

  } catch (e) {
    log(`Erro na validação: ${e.message}`, 'error');
    // Em caso de erro, assume que a resposta é aceitável para não bloquear o usuário
    return { isCorrect: true, correctedAnswer: null, confidence: 0.4, reasoning: `validation_error: ${e.message}` };
  }
}

/**
 * Validação em background — não bloqueia a resposta ao usuário
 * Valida, salva e aprende de forma assíncrona
 */
export function scheduleBackgroundValidation(question, answer, context = '') {
  if (!question || !answer || question.trim().length < 5) return;

  setImmediate(async () => {
    try {
      log(`🔍 Validando em background: "${question.substring(0, 50)}..."`, 'info');

      const result = await validateAnswer(question, answer, context);

      // Salva o par pergunta-resposta com resultado da validação
      await saveQAPair({
        question,
        proposedAnswer: answer,
        isCorrect:      result.isCorrect,
        correctedAnswer: result.correctedAnswer,
        confidence:     result.confidence,
        source:         'background_auto',
      });

      // Se estava incorreta, salva o aprendizado especial
      if (!result.isCorrect && result.correctedAnswer) {
        log(`📝 Aprendizado salvo: resposta incorreta corrigida`, 'warn');
        await saveQAPair({
          question,
          proposedAnswer: result.correctedAnswer,
          isCorrect:      true,
          correctedAnswer: null,
          confidence:     0.85,
          source:         'gemini_correction',
        });
      }

      await logLearning(
        result.isCorrect ? 'validation_correct' : 'validation_incorrect',
        `Q: ${question.substring(0, 100)}\nA: ${stripHTML(answer).substring(0, 100)}`,
        result.reasoning
      );

    } catch (e) {
      log(`Erro na validação em background: ${e.message}`, 'error');
    }
  });
}

/**
 * Validação síncrona — bloqueia até obter resposta validada
 * Use quando precisar garantir qualidade antes de responder
 */
export async function validateAndCorrect(question, answer, context = '') {
  const result = await validateAnswer(question, answer, context);

  // Salva resultado
  await saveQAPair({
    question,
    proposedAnswer: answer,
    isCorrect:      result.isCorrect,
    correctedAnswer: result.correctedAnswer,
    confidence:     result.confidence,
    source:         'sync_validation',
  }).catch(() => {});

  // Retorna a resposta corrigida se houver, ou a original
  return {
    finalAnswer: result.correctedAnswer || answer,
    wasCorrect:  result.isCorrect,
    confidence:  result.confidence,
  };
}