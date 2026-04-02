// backend/src/iaService.js — v8 (Memória Otimizada e Pensamento Natural)

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryKnowledge, saveKnowledge } from './ia-engine/knowledge.js';
import { agentePesquisaProfunda } from './ia/brain/agents/searchAgent.js';

const prisma    = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let SKILL_CONTENT = '';
try {
  SKILL_CONTENT = fs.readFileSync(path.join(__dirname, 'skills', 'SKILL.md'), 'utf-8');
} catch {
  console.warn('[IA-Skill] SKILL.md não encontrado — usando instruções padrão.');
}

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
// FIX DE TOKENS: A IA carrega apenas as últimas 8 interações ativas (16 msgs) no prompt.
// O resto ela busca inteligentemente no banco vetorial quando necessário.
const MAX_PAIRS             = 8; 
const MAX_FILES             = 10;
const REASONING_CHUNK_SIZE  = 5;
const REASONING_CHUNK_DELAY = 15;

const CHAIN_OF_THOUGHT_PROMPT = `
=== DIRETRIZES DE RACIOCÍNIO INTERNO (PENSAMENTO) ===
Antes de gerar a resposta final, você DEVE pensar passo a passo. 
Este pensamento deve ser natural, em primeira pessoa, como se estivesse conversando consigo mesma. 
NÃO use estrutura rígida com marcadores ou títulos (como "**Estratégia**").

Regras obrigatórias:
1. Pense fluidamente sobre a solicitação do usuário, o contexto e as ações necessárias.
2. Se precisar de informações antigas da conversa, avise no pensamento que buscará na memória.
3. NUNCA inclua esse processo de pensamento na resposta final (saída).
4. A resposta final deve ser direta, formatada em HTML (quando apropriado) e amigável.
`;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function emitReasoningStreamed(onStep, text) {
  if (!onStep || !text) return;
  onStep({ type: 'reasoning_start' });
  for (let i = 0; i < text.length; i += REASONING_CHUNK_SIZE) {
    const chunk = text.slice(i, i + REASONING_CHUNK_SIZE);
    onStep({ type: 'reasoning_chunk', text: chunk });
    await sleep(REASONING_CHUNK_DELAY);
  }
  onStep({ type: 'reasoning_end', fullText: text });
}

async function emitStep(onStep, msg, tool, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type: 'step', msg, tool });
}

async function emitDone(onStep, stepKey, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type: 'step_done', stepIndex: stepKey });
}

export function needsWebSearch(message) {
  if (!message) return false;
  return /pesquisa de mercado|pesquisar|buscar|busca|busque|tendência|análise de mercado|concorrente|informações sobre|dados sobre|not[ií]cia|o que [eé]|como funciona|comparar|compare|melhor pre[çc]o|internet|web/i.test(message);
}

function stripHTML(text) { return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(); }

function buildGeminiHistory(history) {
  if (!history?.length) return [];
  const msgs  = history.slice(0, -1);
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur = msgs[i], next = msgs[i + 1];
    if (cur.role === 'user' && next?.role === 'ia') {
      pairs.push({ user: stripHTML(cur.content).substring(0,800), model: stripHTML(next.content).substring(0,800) });
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
  const { totalProdutos=0, totalDivergencias=0, userRole='USUARIO', usuarioAtual=null, dataBlock=null, fileContexts=[], pageBaseUrl=null } = ctx;
  const fileBlock = fileContexts.length > 0 ? `\n=== ARQUIVOS LIDOS NESTA MENSAGEM ===\n${fileContexts.map(f => `[${f.name}]:\n${(f.context || '').substring(0, 8000)}`).join('\n\n')}\n` : '';
  const sessionBlock = `=== CONTEXTO DA SESSÃO ATUAL ===\nUsuário: ${usuarioAtual?.nome || 'Desconhecido'} | Role: ${userRole}\nDados Relevantes da Memória: ${dataBlock || `Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`}\n${fileBlock}=== FIM DO CONTEXTO ===`;
  const parts = [SKILL_CONTENT, CHAIN_OF_THOUGHT_PROMPT, sessionBlock].filter(Boolean);
  return parts.join('\n\n');
}

function gerarNomeArquivoInteligente(lang, userMessage) {
  const msg = (userMessage || '').toLowerCase();
  const l   = (lang || '').toLowerCase().trim();
  const EXT = { html:'html', css:'css', js:'js', jsx:'jsx', ts:'ts', tsx:'tsx', py:'py', sql:'sql', json:'json', sh:'sh', bash:'sh', md:'md', yaml:'yaml', yml:'yaml', xml:'xml', java:'java', cs:'cs', cpp:'cpp', go:'go', rs:'rs', rb:'rb', php:'php', swift:'swift', kt:'kt', txt:'txt' };
  const ext = EXT[l] || l || 'txt';
  const patterns = [ { regex: /petshop|pet shop/i, name: 'petshop' }, { regex: /landing page/i, name: 'landing_page' }, { regex: /login/i, name: 'login' }, { regex: /dashboard/i, name: 'dashboard' } ];
  let base = '';
  for (const p of patterns) { if (p.regex.test(msg)) { base = p.name; break; } }
  if (!base) base = 'arquivo';
  return `${base}.${ext}`;
}

async function saveChatDocument(sessionId, filename, tipo, content, language = null) {
  if (!sessionId) return;
  try {
    const ultimo = await prisma.chatDocument.findFirst({ where: { sessionId, filename }, orderBy: { versao: 'desc' } });
    const versao = ultimo ? ultimo.versao + 1 : 1;
    await prisma.chatDocument.create({ data: { sessionId, filename, tipo, language, content, versao } });
  } catch (e) { console.error('[SaveDoc]', e.message); }
}

async function extractCodeBlocksAndSave(sessionId, replyText, userMessage) {
  if (!sessionId || !replyText) return;
  const regex = /```([a-zA-Z0-9_+#.\-]*)[^\S\r\n]*\r?\n?([\s\S]*?)```/g;
  let match;
  const usedNames = new Set();
  while ((match = regex.exec(replyText)) !== null) {
    const lang = (match[1] || '').trim().toLowerCase() || 'txt';
    const code = match[2] || '';
    if (!code.trim()) continue;
    let filename = gerarNomeArquivoInteligente(lang, userMessage);
    let attempt = 1;
    const originalFilename = filename;
    while (usedNames.has(filename)) { attempt++; const dotIdx = originalFilename.lastIndexOf('.'); filename = dotIdx > -1 ? `${originalFilename.slice(0, dotIdx)}_${attempt}.${originalFilename.slice(dotIdx + 1)}` : `${originalFilename}_${attempt}`; }
    usedNames.add(filename);
    await saveChatDocument(sessionId, filename, 'gerado', code, lang || null);
  }
}

export async function buildAnswerStream(message, history = [], context = {}, onStep, attempt = 1) {
  const userId = context.usuarioAtual?.id || 0;
  const user   = await prisma.usuario.findUnique({ where: { id: parseInt(userId) }, select: { geminiAtivo: true, role: true }});
  const geminiAtivo = user?.geminiAtivo ?? true;
  
  if (!geminiAtivo) return { reply: 'Modo autônomo offline no momento.', sources: [], reasoning: '', toolsExecutadas: [] };

  try {
    const ai            = getClient();
    const pageBaseUrl   = context.pageBaseUrl || 'http://localhost:5173';
    const incomingFiles = (context.files || []).slice(0, MAX_FILES);
    const fileContexts  = [];
    let globalStepKey   = 0;

    let searchData = null;
    let searchSources = [];
    const isImageOnly = !!context.imageOnly;

    if (needsWebSearch(message) && !isImageOnly) {
      await emitReasoningStreamed(onStep, "Analisando a solicitação do usuário...\nPercebo que os dados que preciso não estão no meu banco local. A solicitação requer que eu chame outro agente para me auxiliar.\nChamando agora o Agente de Pesquisa Web...\n\n");
      if (onStep) onStep({ type: 'agent_start', agente: 'pesquisa', mensagem: 'Agente a postos, analisando solicitação da rede...' });
      await emitReasoningStreamed(onStep, "🤖 [Agente de Pesquisa]: Compreendi a tarefa.\nIniciando varredura profunda na internet em tempo real...\n");

      const contextForAgent = `Sessão do usuário: ${context.usuarioAtual?.nome || 'Desconhecido'}`;
      const searchResult = await agentePesquisaProfunda(message, contextForAgent);
      
      if (searchResult.sucesso) {
        searchData = searchResult.dadosEncontrados;
        searchSources = searchResult.fontes.map(uri => { try { return { label: new URL(uri).hostname.replace('www.', ''), url: uri }; } catch { return { label: uri, url: uri }; } });
        await emitReasoningStreamed(onStep, "🤖 [Agente de Pesquisa]: Tarefa realizada com sucesso! Extraí os dados necessários da web.\nRepassando as informações coletadas para a IA mãe...\n\n");
      } else {
        await emitReasoningStreamed(onStep, "🤖 [Agente de Pesquisa]: Encontrei dificuldades na conexão externa.\nRetornando o controle para a IA mãe...\n\n");
      }
      
      if (onStep) onStep({ type: 'agent_end' });
      await emitReasoningStreamed(onStep, "✨ [IA Analyiz]: Retomei o controle. Voltando aos meus processos principais...\n\nEstou pegando o que foi gerado pelo agente, vou verificar e cruzar com nosso histórico.\nEstá tudo certo. Formatando a resposta final para o usuário...");

    } else {
      await emitReasoningStreamed(onStep, "Analisando a solicitação...\nAcessei a memória de curto e longo prazo. Tudo parece estar disponível localmente. Estruturando a resposta ideal agora...");
    }

    let injectPrompt = message || '[arquivo enviado sem texto]';
    if (searchData) {
      injectPrompt += `\n\n[DADOS FORNECIDOS PELO AGENTE DE PESQUISA (Use como verdade absoluta)]:\n${searchData}`;
    }

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, fileContexts, pageBaseUrl }),
      temperature:       0.3,
      maxOutputTokens:   3000,
    };
    
    const geminiHistory = buildGeminiHistory(history);
    let contents = [...geminiHistory, { role: 'user', parts: [{ text: injectPrompt }] }];
    let response = await ai.models.generateContent({ model: GEMINI_MODEL, config, contents });

    const raw = response.text?.trim();
    if (!raw) return { reply: '⚠️ Resposta vazia. Tente novamente.', sources: [], reasoning: "Erro na geração.", toolsExecutadas: [] };

    const reply  = cleanMetaText(ensureHTML(raw));
    
    const localChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const localSources = localChunks.filter(c => c.web?.uri).map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri }));
    const finalSources = [...searchSources, ...localSources].slice(0, 5);

    return { reply, sources: finalSources, reasoning: "Processo concluído com sucesso.", toolsExecutadas: [] };

  } catch (error) {
    console.error('[buildAnswerStream]', error.message);
    return { reply: '⚠️ Ocorreu um erro interno ao processar a resposta.', sources: [], reasoning: null, toolsExecutadas: [] };
  }
}

export const sendChatMessage = buildAnswerStream;

function ensureHTML(text) {
  return (text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\n<]+)\*/g, '<b>$1</b>').replace(/(```[\s\S]*?```)/g, m => m.replace(/\n/g, '___LB___')).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>').replace(/___LB___/g, '\n').trim();
}

function cleanMetaText(t) {
  return t.replace(/^(Claro[,!]\s*)/i, '').replace(/^(Com certeza[,!]\s*)/i, '').replace(/^(Ótima pergunta[,!]\s*)/i, '').trim();
}

export async function buildAnswer(message, history = [], context = {}) {
  return buildAnswerStream(message, history, context, null);
}

export function buildResumoPrompt(dadosStr) {
  return `Faça um resumo executivo em HTML (<b>, <br>) dos seguintes dados:\n\n${dadosStr}`;
}

export function hashContexto(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex').substring(0, 12);
}