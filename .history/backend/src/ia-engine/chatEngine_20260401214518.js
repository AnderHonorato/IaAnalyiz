// src/ia-engine/chatEngine.js
// Motor Agêntico Robusto: Raciocínio em etapas + Contexto Multimodal

import { queryKnowledge, findBestQA, incrementQAUsage, getRecentKnowledge } from './knowledge.js';
import { scheduleBackgroundValidation } from './validator.js';
import { buildAnswer, analyzeImage } from '../iaService.js';

function log(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const level = { info: 'INFO', success: 'OK', warn: 'WARN', error: 'ERROR' }[type] || 'INFO';
  console.log(`[chatEngine.js] [${t}] [${level}] ${msg}`);
}

/**
 * Motor de Chat de Alta Performance
 * Agora suporta análise de intenção e logs de pensamento para o Frontend
 */
export async function smartChat(params) {
  const { 
    message, 
    history = [], 
    baseContext = {}, 
    imageBase64 = null, 
    imageMimeType = null,
    onStep // Callback opcional para enviar etapas do pensamento ao front
  } = params;

  const start = Date.now();
  const thoughts = [];
  
  const addThought = (step) => {
    thoughts.push(step);
    if (onStep) onStep(step); // Envia para o front em tempo real
    log(`Thought: ${step}`);
  };

  try {
    // ── ETAPA 1: Identificação e Visão ──────────────────────────────────────
    addThought("Analisando intenção da solicitação...");
    
    let visualContext = "";
    if (imageBase64) {
      addThought("Processando imagem enviada via visão computacional...");
      visualContext = await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', message);
    }

    // ── ETAPA 2: Recuperação de Memória (RAG) ────────────────────────────────
    addThought("Consultando base de conhecimento e experiências passadas...");
    const [knowledgeResults, qaResults, recentKnowledge] = await Promise.all([
      queryKnowledge(message, 6),
      findBestQA(message, 4),
      getRecentKnowledge(10),
    ]);

    // ── ETAPA 3: Processamento de Dados do Sistema ──────────────────────────
    addThought("Cruzando informações com dados operacionais do banco...");
    const knowledgeBlock = buildKnowledgeBlock(knowledgeResults, qaResults, recentKnowledge);
    
    // Injeção de contexto dinâmico (estilo Claude/Gemini)
    const enrichedDataBlock = [
      baseContext.dataBlock,
      visualContext ? `=== CONTEÚDO VISUAL DETECTADO ===\n${visualContext}` : null,
      knowledgeBlock
    ].filter(Boolean).join('\n\n');

    const enrichedContext = {
      ...baseContext,
      dataBlock: enrichedDataBlock,
    };

    // ── ETAPA 4: Geração da Resposta Final ──────────────────────────────────
    addThought("Gerando resposta estratégica final...");
    const { reply, sources } = await buildAnswer(message, history, enrichedContext);

    // ── ETAPA 5: Ciclo de Aprendizado (Background) ──────────────────────────
    if (reply && message.trim().length > 5) {
      scheduleBackgroundValidation(message, reply, enrichedDataBlock);
    }

    // Incremento de relevância
    qaResults.forEach(qa => incrementQAUsage(qa.id).catch(() => {}));

    log(`Reply completed in ${Date.now() - start}ms`, 'success');

    return { 
      reply, 
      sources, 
      thoughts, // Retorna a lista de passos para o acordeon do front
      usedLocalKnowledge: knowledgeResults.length > 0 
    };

  } catch (e) {
    log(`Flow error: ${e.message}`, 'error');
    return buildAnswer(message, history, baseContext);
  }
}

/**
 * Bloco de Conhecimento Estruturado (Otimizado para LLM)
 */

function buildKnowledgeBlock(knowledge, qas, recent) {
  const sections = [];

  if (knowledge.length > 0) {
    sections.push('=== MEMÓRIA INTERNA RELACIONADA ===');
    knowledge.forEach(k => sections.push(`• [${k.topic}]: ${k.content}`));
  }

  if (qas.length > 0) {
    sections.push('\n=== PRECEDENTES E CORREÇÕES ANTERIORES ===');
    qas.forEach(qa => {
      const resp = qa.correctedAnswer || qa.answer;
      sections.push(`Usuário: ${qa.question}\nAnalyiz (validado): ${resp}\n---`);
    });
  }

  if (sections.length === 0 && recent.length > 0) {
    sections.push('\n=== ÚLTIMOS EVENTOS REGISTRADOS ===');
    recent.slice(0, 5).forEach(r => sections.push(`- ${r.content.substring(0, 150)}`));
  }

  return sections.length > 0 ? sections.join('\n') : null;
}

export { generateShortInsight, generateProactiveInsight } from './chatEngine.js'; // Mantém as outras funções