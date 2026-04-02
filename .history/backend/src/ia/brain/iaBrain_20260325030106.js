// backend/src/ia/brain/iaBrain.js
// ═══════════════════════════════════════════════════════════════════════════════
// CÉREBRO DA IA ANALYIZ — v27 (Revertido para 2.5 + Agentes de Pesquisa e Validação)
// ═══════════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { GoogleGenAI }  from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

// ─── Configurações (Voltando para 2.5 e modelo estável) ────────────────────────
const GEMINI_FLASH      = 'gemini-2.5-flash';
const GEMINI_LITE       = 'gemini-2.5-flash';
const GEMINI_EMBEDDING  = 'gemini-embedding-001'; // Revertido para o estável
const CONFIANCA_MINIMA  = 0.68;
const MAX_CHARS_VALOR   = 2000;
const CICLO_ANALISE_MS  = 1 * 60 * 1000;
const CICLO_MENTORIA_MS = 5 * 60 * 1000;
const BALAO_MAX_CHARS   = 88;

// ─── Logger colorido ──────────────────────────────────────────────────────────
const ICONS = {
  info: '🧠', warn: '⚠️ ', success: '✅', error: '❌',
  learn: '📚', think: '💭', mentor: '🎓', analyze: '🔬', search: '🔎', valid: '⚖️'
};
function logBrain(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const ico = ICONS[type] || '•';
  console.log(`\x1b[36m[IA-Brain]\x1b[0m [${t}] ${ico}  ${msg}`);
}

function geminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no .env');
  return new GoogleGenAI({ apiKey: apiKey });
}

function extrairJSONSeguro(texto) {
  if (!texto) throw new Error('Resposta vazia.');
  const start = texto.indexOf('{');
  let end   = texto.lastIndexOf('}');
  if (start === -1) throw new Error('JSON não encontrado.');
  let jsonStr = texto.slice(start, end + 1).replace(/,\s*([\}\]])/g, '$1');
  try { return JSON.parse(jsonStr); } catch (e) { throw new Error('Erro de sintaxe JSON.'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOVOS AGENTES: PESQUISA E VALIDAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AGENTE DE PESQUISA PROFUNDA (Web Search Grounding)
 */
async function agentePesquisaProfunda(pergunta) {
  logBrain(`Agente Pesquisador ativado: "${pergunta.substring(0, 40)}..."`, 'search');
  try {
    const ai = geminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH,
      contents: `Pesquise profundamente na web e traga fatos atualizados (incluindo links se possível) sobre: ${pergunta}`,
      config: { tools: [{ googleSearch: {} }] }
    });
    return response.text || '';
  } catch (e) {
    logBrain(`Erro na pesquisa web: ${e.message}`, 'error');
    return '';
  }
}

/**
 * AGENTE DE VALIDAÇÃO (Gatekeeper)
 */
async function agenteValidacao(pergunta, resposta, contextoWeb = '') {
  logBrain('Agente Validador analisando resposta...', 'valid');
  try {
    const ai = geminiClient();
    const prompt = `Você é o Validador da Analyiz.
PERGUNTA: ${pergunta}
RESPOSTA PROPOSTA: ${resposta}
DADOS WEB: ${contextoWeb}

Valide se a resposta é factual. Retorne JSON: {"aprovada": bool, "correcao": "texto se reprovada"}`;
    
    const res = await ai.models.generateContent({
      model: GEMINI_FLASH,
      config: { responseMimeType: "application/json", temperature: 0 },
      contents: prompt
    });
    return extrairJSONSeguro(res.text);
  } catch {
    return { aprovada: true, correcao: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR VETORIAL (EMBEDDINGS)
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarEmbedding(texto) {
  if (!process.env.GEMINI_API_KEY || !texto) return [];
  try {
    const ai = geminiClient();
    const response = await ai.models.embedContent({
      model: GEMINI_EMBEDDING,
      contents: texto,
    });
    return response.embeddings?.[0]?.values || response.embedding?.values || [];
  } catch (e) {
    console.error('[Embedding Error]', e.message);
    return [];
  }
}

function calcularSimilaridade(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMÓRIA E APRENDIZADO
// ═══════════════════════════════════════════════════════════════════════════════

export async function salvarConhecimento({ categoria, chave, valor, confianca = 0.7, fonte = 'sistema' }) {
  try {
    const textoParaVetorizar = `${categoria} ${chave} ${valor}`.substring(0, 1000);
    const vetor = await gerarEmbedding(textoParaVetorizar);
    const existente = await prisma.iaConhecimento.findFirst({ where: { categoria, chave } });
    if (existente) {
      await prisma.iaConhecimento.update({
        where: { id: existente.id },
        data: { valor: valor.substring(0, MAX_CHARS_VALOR), confianca: Math.min(1.0, existente.confianca * 0.9 + 0.1), fonte, embedding: vetor },
      });
    } else {
      await prisma.iaConhecimento.create({
        data: { categoria, chave: chave.substring(0, 120), valor: valor.substring(0, MAX_CHARS_VALOR), confianca, fonte, embedding: vetor },
      });
    }
    logBrain(`Conhecimento vetorial salvo: [${categoria}] ${chave.substring(0, 60)}`, 'learn');
  } catch (e) { logBrain(`Erro salvar: ${e.message}`, 'error'); }
}

export async function buscarConhecimentoSemantico(pergunta = '', limite = 12) {
  if (!pergunta) return [];
  try {
    const vetorPergunta = await gerarEmbedding(pergunta);
    if (!vetorPergunta.length) return [];
    const todos = await prisma.iaConhecimento.findMany({ where: { confianca: { gte: 0.5 } }, take: 200 });
    return todos.map(k => ({ ...k, score: calcularSimilaridade(vetorPergunta, k.embedding) }))
      .filter(k => k.score > 0.65).sort((a, b) => b.score - a.score).slice(0, limite);
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE COM MULTI-AGENTES
// ═══════════════════════════════════════════════════════════════════════════════

export async function processarMensagemComAprendizado({ mensagem, userRole, userId, historyRaw = [] }) {
  logBrain(`Processando: "${(mensagem || '').substring(0, 50)}..."`, 'think');

  // 1. Decisão de Pesquisa Profunda
  let contextoWeb = '';
  if (/(pesquise|busque|na internet|google|site|link)/i.test(mensagem)) {
    contextoWeb = await agentePesquisaProfunda(mensagem);
  }

  // 2. Busca na Memória Local
  const conhecimentos = await buscarConhecimentoSemantico(mensagem);
  const blocoMemoria = conhecimentos.map(k => `• [${k.categoria}] ${k.valor}`).join('\n');

  // 3. Geração da Resposta (importando iaService)
  const { buildAnswer } = await import('../../iaService.js');
  let { reply, sources } = await buildAnswer(mensagem, historyRaw, { userRole, dataBlock: `${contextoWeb}\n${blocoMemoria}` });

  // 4. Validação pelo Agente Validador
  const validacao = await agenteValidacao(mensagem, reply, contextoWeb);
  if (!validacao.aprovada && validacao.correcao) {
    logBrain('Resposta original reprovada. Aplicando correção do Agente Validador.', 'warn');
    reply = validacao.correcao;
  }

  logBrain(`Respondido (Web: ${!!contextoWeb}, Validado: ${validacao.aprovada})`, 'success');
  return { reply, sources };
}

// ─── Loop de aprendizado (mantido) ─────────────────────────────────────────────
export async function iniciarLoopAprendizado() {
  logBrain('🚀 Loop de aprendizado contínuo (Gemini 2.5) iniciado!', 'success');
  const ciclo = async () => {
    try { await analisarSistemaAutonomamente(); } catch (e) { logBrain(`Erro ciclo: ${e.message}`, 'error'); }
    setTimeout(ciclo, CICLO_ANALISE_MS);
  };
  setTimeout(ciclo, 10_000);
}

// Funções de análise do sistema simplificadas para o exemplo
export async function analisarSistemaAutonomamente() {
  const totalProdutos = await prisma.produto.count();
  await salvarConhecimento({ categoria: 'metricas_produtos', chave: 'resumo_catalogo', valor: `Catálogo: ${totalProdutos} produtos.`, confianca: 1.0 });
  return { sucesso: true };
}

export async function buscarTodoConhecimento(limite = 60) {
  return await prisma.iaConhecimento.findMany({ take: limite });
}

export async function getEstatisticasAprendizado() {
  return { totalConhecimentos: await prisma.iaConhecimento.count() };
}

export async function buscarEstudosRecentes(limite = 40) {
  return await prisma.iaEstudoTerminal.findMany({ take: limite });
}

export async function registrarEstudo({ tipo, resumo }) {
  await prisma.iaEstudoTerminal.create({ data: { tipo, resumo } });
}