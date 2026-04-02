/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CHAT ENGINE — Motor de Raciocínio em Cadeia de Pensamento
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Orquestra todo o fluxo inteligente de uma conversa:
 * 1. Análise de intenção da solicitação
 * 2. Processamento de imagens (se enviadas)
 * 3. Recuperação de conhecimento local (RAG)
 * 4. Enriquecimento com dados do sistema
 * 5. Geração da resposta final
 * 6. Ciclo de aprendizado em background
 * 
 * Cada etapa é registrada em um "pensamento" (thought) que pode ser
 * enviado ao frontend em tempo real para exibir progresso.
 * 
 * Desenvolvido por: Anderson Honorato
 * Versão: 2.0 IA Analyiz
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { queryKnowledge, findBestQA, incrementQAUsage, getRecentKnowledge } from './knowledge.js';  // Recuperação de conhecimento
import { scheduleBackgroundValidation } from './validator.js';                                      // Validação assíncrona
import { buildAnswer, analyzeImage } from '../iaService.js';                                        // Geração de respostas

/**
 * Sistema de logging estruturado com cores ANSI para terminal
 * Facilita debug ao identificar visualmente onde cada mensagem vem
 * 
 * @param {string} msg - Mensagem de log
 * @param {string} type - Tipo: 'info' | 'success' | 'warn' | 'error'
 */
function log(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const ico = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '🚨' }[type] || 'ℹ️';
  console.log(`\x1b[36m[IA-ENGINE]\x1b[0m [${t}] ${ico} ${msg}`);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MOTOR DE CHAT DE ALTA PERFORMANCE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Coordena o fluxo completo de processamento de uma mensagem.
 * Suporta análise de intenção, processamento de imagens, RAG e streaming de pensamentos.
 * 
 * @param {Object} params - Parâmetros da conversa
 * @param {string} params.message - Mensagem do usuário
 * @param {Array} params.history - Histórico de mensagens anteriores
 * @param {Object} params.baseContext - Contexto do sistema (dados do usuário, divergências, etc)
 * @param {string} params.imageBase64 - Imagem codificada em base64 (opcional)
 * @param {string} params.imageMimeType - Tipo MIME da imagem (jpeg, png, etc)
 * @param {Function} params.onStep - Callback para receber pensamentos em tempo real
 * @returns {Promise<Object>} Objeto com resposta, fontes, pensamentos e metadados
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
  const thoughts = [];  // Array de pensamentos para exibição no accordion do frontend
  
  /**
   * Adiciona um pensamento ao histórico e dispara callback se configurado
   * Mantém o frontend informado sobre progresso em tempo real
   */
  const addThought = (step) => {
    thoughts.push(step);
    if (onStep) onStep(step); // Streaming de pensamentos para frontend
    log(`🧠 Pensamento: ${step}`);
  };

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // ETAPA 1: ANÁLISE DE INTENÇÃO E VISÃO
    // ──────────────────────────────────────────────────────────────────────────
    // Identifica o que o usuário quer e processa imagens se houver
    
    addThought("Analisando intenção da solicitação...");
    
    let visualContext = "";
    if (imageBase64) {
      addThought("Processando imagem enviada via visão computacional...");
      visualContext = await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', message);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ETAPA 2: RECUPERAÇÃO DE MEMÓRIA (RAG)
    // ──────────────────────────────────────────────────────────────────────────
    // Busca conhecimento local, respostas anteriores e contexto recente
    
    addThought("Consultando base de conhecimento e experiências passadas...");
    const [knowledgeResults, qaResults, recentKnowledge] = await Promise.all([
      queryKnowledge(message, 6),           // Busca vetorial de conhecimento
      findBestQA(message, 4),               // Recupera Q&As semelhantes
      getRecentKnowledge(10),               // Pega conhecimento recente
    ]);

    // ──────────────────────────────────────────────────────────────────────────
    // ETAPA 3: PROCESSAMENTO E ENRIQUECIMENTO DE DADOS
    // ──────────────────────────────────────────────────────────────────────────
    // Combina dados do sistema com conhecimento recuperado
    
    addThought("Cruzando informações com dados operacionais do banco...");
    const knowledgeBlock = buildKnowledgeBlock(knowledgeResults, qaResults, recentKnowledge);
    
    // Injeção de contexto dinâmico (similar a Claude/GPT)
    // Garante que o modelo tem informações relevantes do sistema
    const enrichedDataBlock = [
      baseContext.dataBlock,
      visualContext ? `=== CONTEÚDO VISUAL DETECTADO ===\n${visualContext}` : null,
      knowledgeBlock
    ].filter(Boolean).join('\n\n');

    const enrichedContext = {
      ...baseContext,
      dataBlock: enrichedDataBlock,
    };

    // ──────────────────────────────────────────────────────────────────────────
    // ETAPA 4: GERAÇÃO DA RESPOSTA FINAL
    // ──────────────────────────────────────────────────────────────────────────
    // Chama modelo de IA para gerar resposta baseada em contexto
    
    addThought("Gerando resposta estratégica final...");
    const { reply, sources } = await buildAnswer(message, history, enrichedContext);

    // ──────────────────────────────────────────────────────────────────────────
    // ETAPA 5: CICLO DE APRENDIZADO (BACKGROUND)
    // ──────────────────────────────────────────────────────────────────────────
    // Agenda validação assíncrona para melhorar futuros modelos
    
    if (reply && message.trim().length > 5) {
      scheduleBackgroundValidation(message, reply, enrichedDataBlock);
    }

    // Incrementa contadores de uso para Q&As mais relevantes
    qaResults.forEach(qa => incrementQAUsage(qa.id).catch(() => {}));

    log(`✅ Resposta concluída em ${Date.now() - start}ms`, 'success');

    return { 
      reply, 
      sources, 
      thoughts,              // Lista de pensamentos para exibição no accordion
      usedLocalKnowledge: knowledgeResults.length > 0  // Flag: usou conhecimento local?
    };

  } catch (e) {
    log(`❌ Falha no fluxo robusto: ${e.message}`, 'error');
    return buildAnswer(message, history, baseContext);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BLOCO DE CONHECIMENTO ESTRUTURADO
 * ═══════════════════════════════════════════════════════════════════════════════
 * Formata conhecimento recuperado em estrutura otimizada para LLMs
 * Garante che modelo tenha contexto relevante estruturado
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