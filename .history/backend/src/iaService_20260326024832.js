// backend/src/iaService.js — v5 (Eventos SSE de Agente + Raciocínio Dinâmico)
// Mudanças v5:
//  1. Raciocínio dinâmico: o Chain of Thought agora descreve em tempo real o que
//     está acontecendo com os arquivos, dados e contexto recebidos (não mais texto fixo).
//  2. Eventos SSE agent_start / agent_end / agent_log emitidos no pipeline de agentes.
//  3. Evento `fontes` emitido ao frontend com os links reais da pesquisa web.
//  4. Narrativa de raciocínio em primeira pessoa, reativa ao contexto atual.

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryKnowledge, saveKnowledge } from './ia-engine/knowledge.js';

import { agentePesquisaProfunda } from './ia/brain/agents/searchAgent.js';
import { agenteValidador }        from './ia/brain/agents/validationAgent.js';
import { runOrchestrator } from './ia/brain/agents/agentOrchestrator.js';

const prisma    = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Carrega SKILL.md ──────────────────────────────────────────────────────────
// Lê o arquivo de habilidades (skills) da IA para injetar no prompt do sistema
let SKILL_CONTENT = '';
try {
  SKILL_CONTENT = fs.readFileSync(path.join(__dirname, 'skills', 'SKILL.md'), 'utf-8');
  console.log('\x1b[35m[IA-Skill] SKILL.md carregado ✓\x1b[0m');
} catch {
  console.warn('[IA-Skill] SKILL.md não encontrado — usando instruções padrão.');
}

// ─── Constantes ────────────────────────────────────────────────────────────────
const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;
const MAX_FILES             = 10;
const REASONING_CHUNK_SIZE  = 5;
const REASONING_CHUNK_DELAY = 16;

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN OF THOUGHT — System Prompt Principal
// ═══════════════════════════════════════════════════════════════════════════════
const CHAIN_OF_THOUGHT_PROMPT = `
=== INSTRUÇÕES INTERNAS DE RACIOCÍNIO (NUNCA EXIBA PARA O USUÁRIO) ===

Você DEVE pensar passo a passo internamente ANTES de gerar a resposta final.
Faça todo o raciocínio completo na sua cabeça, mas NUNCA inclua nenhum bloco de pensamento,
skill, classificação, "Chain of Thought", "Analisando intenção" ou qualquer texto de raciocínio
na mensagem enviada ao usuário.

Regras obrigatórias:
- O raciocínio é 100% interno.
- A resposta final deve ser APENAS a mensagem útil, clara e formatada em HTML (quando necessário).
- Nunca comece a resposta com "Pensando…", "Skill ativada", "Analisando intenção".
- Nunca use o formato de blocos de pensamento na saída final.

Após o raciocínio interno, entregue diretamente a resposta para o usuário.
`;

// ═══════════════════════════════════════════════════════════════════════════════
// GERADOR DINÂMICO DE RACIOCÍNIO (Chain of Thought narrativo)
// Gera texto em 1ª pessoa descrevendo o contexto REAL recebido
// ═══════════════════════════════════════════════════════════════════════════════
function buildDynamicReasoning(message, fileContexts, context, hasFiles) {
  const parts   = [];
  const msg     = message || '';
  const role    = context.userRole || 'USUARIO';
  const nome    = context.usuarioAtual?.nome || 'o usuário';

  // ── Bloco 1: Contexto da mensagem recebida ──────────────────────────────────
  {
    let intro = '';
    if (hasFiles && fileContexts.length > 0) {
      const tipos = [...new Set(fileContexts.map(f => f.group || f.label))];
      const nomes = fileContexts.map(f => `"${f.name}"`).join(', ');
      const totalChars = fileContexts.reduce((s, f) => s + (f.context?.length || 0), 0);
      intro = `${nome} enviou ${fileContexts.length} arquivo(s): ${nomes} (${tipos.join(', ')}). ` +
              `Extraí ${totalChars.toLocaleString('pt-BR')} caracteres de conteúdo. ` +
              `Vou usar esse material como fonte primária da minha resposta.`;
    } else if (msg.length > 0) {
      const preview = msg.substring(0, 120).replace(/\n/g, ' ');
      intro = `Recebi a seguinte mensagem de ${nome}: "${preview}${msg.length > 120 ? '…' : ''}". ` +
              `Preciso entender a intenção real por trás disso antes de responder.`;
    }
    if (intro) parts.push(`**Contexto Recebido**\n\n${intro}`);
  }

  // ── Bloco 2: Classificação de intenção ──────────────────────────────────────
  {
    let classText = '';
    if (/site|website|landing page|página web|html.*css|criar.*página/i.test(msg)) {
      const assunto = msg.match(/(petshop|restaurante|portfolio|clinica|blog|hotel|academia|loja|dashboard|login)/i)?.[1] || 'projeto web';
      classText = `É uma solicitação de desenvolvimento web — preciso criar um "${assunto}". ` +
                  `Vou estruturar o HTML semântico e o CSS responsivo antes de gerar o código. ` +
                  `O arquivo terá nome baseado no projeto: "${assunto.toLowerCase()}.html".`;
    } else if (/```|function|const |import |class |def |<div|<button|\bjsx\b|\btsx\b/i.test(msg)) {
      classText = `Há código-fonte na mensagem. Preciso revisar a sintaxe, lógica e possíveis falhas. ` +
                  `Vou manter os nomes originais de variáveis e funções.`;
    } else if (/divergen|peso|frete|auditoria|varredura|reincidente/i.test(msg)) {
      const n = context.totalDivergencias || 0;
      classText = `Solicitação de logística ML. ${nome} tem ${n} divergência(s) ativa(s) no sistema. ` +
                  `Vou consultar o banco de dados para trazer o estado atualizado.`;
    } else if (/produto|sku|catálogo|estoque|kit/i.test(msg)) {
      const p = context.totalProdutos || 0;
      classText = `Solicitação sobre catálogo. O usuário tem ${p} produto(s) cadastrado(s). ` +
                  `Vou acessar as ferramentas de catálogo para trazer informações precisas.`;
    } else if (/usuário|acesso|aprovar|bloquear|permissão/i.test(msg)) {
      if (role === 'OWNER' || role === 'ADMIN') {
        const pend = (context.pendentes || []).length;
        classText = `Solicitação administrativa. ${nome} tem permissão de nível ${role}. ` +
                    `${pend > 0 ? `Há ${pend} usuário(s) aguardando aprovação.` : 'Nenhum usuário pendente no momento.'}`;
      } else {
        classText = `A solicitação envolve gerenciamento de usuários, mas o nível de acesso (${role}) não permite isso. Vou explicar a limitação.`;
      }
    } else if (/preço|precific|valor|custo|faturamento/i.test(msg)) {
      classText = `Consulta de precificação. Vou verificar o histórico de preços disponível no banco para embasar a resposta.`;
    } else if (/resumo|relatório|métricas|dashboard|visão geral/i.test(msg)) {
      const p = context.totalProdutos || 0;
      const d = context.totalDivergencias || 0;
      classText = `Pedido de visão geral. Estado atual: ${p} produto(s) e ${d} divergência(s) ativa(s). ` +
                  `Vou compilar as métricas disponíveis no sistema.`;
    } else if (hasFiles) {
      const tipoArq = fileContexts[0]?.group || 'arquivo';
      classText = `Analisando ${tipoArq}: extraí o conteúdo e vou estruturar a resposta com base nele. ` +
                  `A pergunta do usuário vai guiar o que preciso extrair ou resumir.`;
    } else {
      classText = `Mensagem de texto sem arquivos. Vou verificar se preciso consultar o banco de dados ` +
                  `ou se consigo responder diretamente com o conhecimento disponível.`;
    }
    if (classText) parts.push(`**Análise de Intenção**\n\n${classText}`);
  }

  // ── Bloco 3: Decisão sobre ferramentas e dados ───────────────────────────────
  {
    let toolText = '';
    if (needsWebSearch(msg)) {
      toolText = `Esta solicitação requer dados externos em tempo real. ` +
                 `Estou acionando o Agente de Pesquisa Web para buscar informações atualizadas antes de formular minha resposta.`;
    } else if (context.dataBlock) {
      const chars = context.dataBlock.length;
      toolText = `Os dados do banco foram carregados — ${chars.toLocaleString('pt-BR')} caracteres de contexto disponíveis. ` +
                 `Vou usar essas informações reais para embasar cada afirmação da resposta.`;
    } else if (/divergen|produto|usuário|preço|agendador/i.test(msg)) {
      toolText = `Vou acionar as ferramentas do sistema (Function Calling) para buscar os dados ` +
                 `diretamente do banco antes de responder. Isso garante que as informações sejam precisas e atuais.`;
    } else {
      toolText = `Nenhuma consulta ao banco ou pesquisa web parece necessária para esta resposta. ` +
                 `Posso formular a resposta com o conhecimento disponível e o contexto da sessão.`;
    }
    parts.push(`**Decisão sobre Ferramentas**\n\n${toolText}`);
  }

  // ── Bloco 4: Arquivos processados (detalhado) ────────────────────────────────
  if (hasFiles && fileContexts.length > 0) {
    const detalhes = fileContexts.map(f => {
      const chars = f.context?.length || 0;
      const preview = (f.context || '').replace(/\n/g, ' ').substring(0, 80);
      return `• "${f.name}" (${f.group || 'arquivo'}): ${chars.toLocaleString('pt-BR')} caracteres extraídos. Prévia: "${preview}…"`;
    }).join('\n');
    parts.push(`**Conteúdo dos Arquivos Processados**\n\n${detalhes}`);
  }

  // ── Bloco 5: Estratégia de resposta ─────────────────────────────────────────
  {
    let estrategia = '';
    if (/site|website|html.*css|criar.*página/i.test(msg)) {
      estrategia = `Vou entregar o código completo sem truncamentos. Cada arquivo terá nome descritivo baseado no assunto. ` +
                   `Não usarei nomes genéricos como "pagina.html" ou "estilo.css".`;
    } else if (/```|código|componente|bug|fix/i.test(msg)) {
      estrategia = `Vou entregar o código corrigido/completo com todas as linhas, sem elipses. ` +
                   `Manterei os nomes originais do projeto.`;
    } else if (/\b(bravo|irritado|raiva|urgente|socorro|preciso já)\b/i.test(msg)) {
      estrategia = `Detectei urgência ou frustração. Serei direto e objetivo — sem rodeios ou contextualizações longas. ` +
                   `Primeiro a solução, depois qualquer explicação necessária.`;
    } else {
      estrategia = `Vou estruturar a resposta de forma clara e acionável, com formatação HTML quando necessário para melhor legibilidade. ` +
                   `Se houver dados numéricos, apresentarei em formato tabular ou com bullets.`;
    }
    parts.push(`**Estratégia de Resposta**\n\n${estrategia}`);
  }

  return parts.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS DE EMISSÃO SSE
// ═══════════════════════════════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function emitReasoningStreamed(onStep, text) {
  if (!onStep || !text) return;
  onStep({ type: 'reasoning_start' });
  for (let i = 0; i < text.length; i += REASONING_CHUNK_SIZE) {
    onStep({ type: 'reasoning_chunk', text: text.slice(i, i + REASONING_CHUNK_SIZE) });
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

// Emite eventos específicos de agente
function emitAgentStart(onStep, agente, mensagem) {
  if (onStep) onStep({ type: 'agent_start', agente, mensagem });
}

function emitAgentLog(onStep, msg, tipo = 'info') {
  if (onStep) onStep({ type: 'agent_log', msg, tipo });
}

function emitAgentEnd(onStep) {
  if (onStep) onStep({ type: 'agent_end' });
}

function emitFontes(onStep, fontes) {
  if (onStep && fontes?.length > 0) onStep({ type: 'fontes', fontes });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE CATALOG / ROLES
// ═══════════════════════════════════════════════════════════════════════════════
export const PAGE_CATALOG = {
  '/':             { titulo:'Home / Dashboard',          desc:'Visão geral do sistema, métricas principais' },
  '/ml':           { titulo:'Mercado Livre — Dashboard', desc:'Ferramentas ML: Radar de Fretes, Precificação, Pesquisa, Anúncios' },
  '/ml/auditoria': { titulo:'Radar de Fretes',           desc:'Scanner de divergências de peso/frete nos anúncios ML' },
  '/ml/precos':    { titulo:'Precificação ML',           desc:'Gerenciamento de preços. Histórico, atualização em lote' },
  '/ml/pesquisa':  { titulo:'Pesquisa de Anúncios',      desc:'Pesquisa por link ou ID. Preços, vendedores, concorrentes' },
  '/ml/anuncios':  { titulo:'Meus Anúncios ML',          desc:'Lista anúncios do usuário. Filtros por status, exportação CSV' },
  '/shopee':       { titulo:'Shopee',                    desc:'Integração com Shopee (em desenvolvimento)' },
  '/amazon':       { titulo:'Amazon',                    desc:'Integração com Amazon (em desenvolvimento)' },
  '/usuarios':     { titulo:'Gerenciamento de Usuários', desc:'Lista e gerencia usuários. Aprovar/bloquear. Alterar roles' },
};

const ROLE_CAPABILITIES = {
  BLOQUEADO: { paginasAcesso:[], acoesPermitidas:[], restricoes:[] },
  USUARIO:   { paginasAcesso:['/','/ml','/ml/auditoria','/ml/precos','/ml/pesquisa','/ml/anuncios','/shopee','/amazon'], acoesPermitidas:['ver próprios produtos','ver próprias divergências','corrigir divergências','configurar agendador'], restricoes:['NÃO pode ver dados de outros usuários'] },
  ADMIN:     { paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['tudo do USUARIO','ver dados de todos','gerenciar usuários'], restricoes:[] },
  OWNER:     { paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['acesso total a tudo'], restricoes:[] },
};

const STEP_DELAYS = {
  pdf_extracting:1200, pdf_done:400, excel_analyzing:1000, excel_done:300,
  txt_reading:300, txt_done:200, audio_transcribing:2000, audio_done:400,
  image_analyzing:700, image_done:300, db_done:250,
};

export function needsWebSearch(message) {
  if (!message) return false;
  return /pesquisa de mercado|pesquisar|buscar|busca|busque|tendência|análise de mercado|concorrente|informações sobre|dados sobre|not[ií]cia|o que [eé]|como funciona|comparar|compare|melhor pre[çc]o|internet|web/i.test(message);
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function buildGeminiHistory(history) {
  if (!history?.length) return [];
  const pairs = [];
  let i = 0;
  const msgs = history.slice(0, -1);
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

// ─── Salvar documentos ─────────────────────────────────────────────────────────
async function saveChatDocument(sessionId, filename, tipo, content, language = null) {
  if (!sessionId) return;
  try {
    const ultimo = await prisma.chatDocument.findFirst({ where: { sessionId, filename }, orderBy: { versao: 'desc' } });
    const versao = ultimo ? ultimo.versao + 1 : 1;
    await prisma.chatDocument.create({ data: { sessionId, filename, tipo, language, content, versao } });
  } catch (e) { console.error('[SaveDoc]', e.message); }
}

function gerarNomeArquivoInteligente(lang, userMessage) {
  const msg = (userMessage || '').toLowerCase();
  const l   = (lang || '').toLowerCase().trim();
  const EXT = { html:'html', css:'css', js:'js', jsx:'jsx', ts:'ts', tsx:'tsx', py:'py', sql:'sql', json:'json', sh:'sh', bash:'sh', md:'md', yaml:'yaml', yml:'yaml', xml:'xml', java:'java', cs:'cs', cpp:'cpp', go:'go', rs:'rs', rb:'rb', php:'php', swift:'swift', kt:'kt', txt:'txt' };
  const ext  = EXT[l] || l || 'txt';
  const patterns = [
    { regex: /petshop|pet shop|loja.*pet/i, name: 'petshop' }, { regex: /landing page|página.*vendas/i, name: 'landing_page' },
    { regex: /portfolio|portfólio/i, name: 'portfolio' }, { regex: /login|autenticação|auth/i, name: 'login' },
    { regex: /dashboard|painel|admin/i, name: 'dashboard' }, { regex: /restaurante|cardápio/i, name: 'restaurante' },
    { regex: /e-?commerce|loja.*online/i, name: 'ecommerce' }, { regex: /calculadora/i, name: 'calculadora' },
    { regex: /divergenc|frete|peso/i, name: 'divergencias' }, { regex: /clinica|médico/i, name: 'clinica' },
  ];
  let base = '';
  for (const p of patterns) { if (p.regex.test(msg)) { base = p.name; break; } }
  if (!base) {
    const d = { html:'pagina', css:'estilo', js:'script', jsx:'componente', tsx:'componente', ts:'codigo', py:'script', sql:'query', json:'dados', sh:'script', yaml:'config', xml:'dados' };
    base = d[l] || 'arquivo';
  }
  const suffix = { css:'_estilo', jsx:'_componente', tsx:'_componente' };
  return `${base}${suffix[l] || ''}.${ext}`;
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
    let attempt  = 1;
    const orig   = filename;
    while (usedNames.has(filename)) {
      attempt++;
      const d = orig.lastIndexOf('.');
      filename = d > -1 ? `${orig.slice(0, d)}_${attempt}.${orig.slice(d + 1)}` : `${orig}_${attempt}`;
    }
    usedNames.add(filename);
    await saveChatDocument(sessionId, filename, 'gerado', code, lang || null);
  }
}

// ─── Extração de arquivos ──────────────────────────────────────────────────────
async function extractPDF(base64, fileName) {
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0, maxOutputTokens: 8000 },
      contents: [{ role: 'user', parts: [{ text: `Extraia TODO o texto deste PDF. Arquivo: ${fileName}` }, { inlineData: { mimeType: 'application/pdf', data: base64 } }] }],
    });
    return r.text?.trim() || null;
  } catch { return null; }
}

async function extractExcel(base64, mimeType, fileName) {
  if (mimeType === 'text/csv') {
    try {
      const text  = Buffer.from(base64, 'base64').toString('utf-8');
      const lines = text.split('\n').slice(0, 300);
      const formatted = lines.map((line, idx) => {
        const cols = []; let cur = '', inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; } else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; } else { cur += ch; }
        }
        cols.push(cur.trim());
        return `${idx === 0 ? '## ' : ''}${cols.join(' | ')}`;
      }).join('\n');
      return `=== CSV: ${fileName} (${lines.length} linhas) ===\n${formatted}`.substring(0, 15000);
    } catch {}
  }
  try {
    const XLSX = await import('xlsx').catch(() => null);
    if (XLSX) {
      const buffer = Buffer.from(base64, 'base64');
      const wb     = XLSX.read(buffer, { type:'buffer', cellText:true, cellDates:true, raw:false });
      const allSheets = [];
      for (const sn of (wb.SheetNames || []).slice(0, 8)) {
        const sheet = wb.Sheets[sn]; if (!sheet) continue;
        const data  = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', blankrows:false });
        if (!data?.length) continue;
        const maxCols = Math.max(...data.slice(0, 5).map(r => (Array.isArray(r) ? r.length : 0)));
        const rows    = data.slice(0, 200).map((row, idx) => {
          const cells = Array.isArray(row) ? row : [];
          const norm  = Array.from({ length: maxCols }, (_, c) => String(cells[c] ?? '').trim().replace(/\s+/g, ' ').substring(0, 100));
          return `${idx === 0 ? '## ' : ''}${norm.join(' | ')}`;
        });
        allSheets.push(`=== Aba: "${sn}" (${data.length} linhas × ${maxCols} cols) ===\n${rows.join('\n')}`);
      }
      if (allSheets.length > 0) return (`=== Planilha: ${fileName} ===\n\n${allSheets.join('\n\n')}`).substring(0, 20000);
    }
  } catch {}
  return `Não foi possível extrair os dados de "${fileName}". Salve como CSV para melhor compatibilidade.`;
}

function extractTXT(base64) { return Buffer.from(base64, 'base64').toString('utf-8').substring(0, 20000); }

async function transcribeAudio(base64, mimeType) {
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({ model: GEMINI_MODEL, config: { temperature: 0 }, contents: [{ role:'user', parts:[{ text:'Transcreva este áudio fielmente.' }, { inlineData:{ mimeType, data:base64 } }] }] });
    return r.text?.trim() || null;
  } catch { return null; }
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({ model: GEMINI_MODEL, config: { temperature: 0.2 }, contents: [{ role:'user', parts:[{ text: userQuestion||'Descreva esta imagem detalhadamente.' }, { inlineData:{ mimeType, data:base64 } }] }] });
    return r.text?.trim() || null;
  } catch { return null; }
}

async function fetchPageContent(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent':'AnalyizBot/1.0', 'Accept':'text/html' } });
    clearTimeout(t);
    if (!resp.ok) return null;
    const html = await resp.text();
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').trim().substring(0, 8000) || null;
  } catch { return null; }
}

export async function processFileToContext(file, userMessage, onStep, baseStepKey = 0, sessionId = null) {
  const { base64, mimeType, name, group } = file;
  let context = null, fileTypeLabel = '', stepKeyLocal = baseStepKey;
  const step = async (msg, delay = 0) => { await emitStep(onStep, msg, null, delay); return stepKeyLocal++; };
  const done = async (key, delay = STEP_DELAYS.db_done) => { await emitDone(onStep, key, delay); };
  switch (group) {
    case 'image': { const k = await step(`Analisando imagem "${name}"…`, STEP_DELAYS.image_analyzing); context = await analyzeImage(base64, mimeType, userMessage||''); await done(k, STEP_DELAYS.image_done); fileTypeLabel='imagem'; break; }
    case 'pdf':   { const k = await step(`Lendo PDF "${name}"…`, STEP_DELAYS.pdf_extracting); context = await extractPDF(base64, name); await done(k, STEP_DELAYS.pdf_done); fileTypeLabel='PDF'; break; }
    case 'excel': { const lbl = mimeType==='text/csv'?'CSV':'planilha Excel'; const k = await step(`Lendo ${lbl} "${name}"…`, STEP_DELAYS.excel_analyzing); context = await extractExcel(base64, mimeType, name); await done(k, STEP_DELAYS.excel_done); fileTypeLabel=lbl; break; }
    case 'txt':   { const k = await step(`Lendo TXT "${name}"…`, STEP_DELAYS.txt_reading); context = extractTXT(base64); await done(k, STEP_DELAYS.txt_done); fileTypeLabel='texto'; break; }
    case 'audio': { const k = await step(`Transcrevendo áudio "${name}"…`, STEP_DELAYS.audio_transcribing); context = await transcribeAudio(base64, mimeType); await done(k, STEP_DELAYS.audio_done); fileTypeLabel='áudio'; break; }
  }
  if (context && sessionId) await saveChatDocument(sessionId, name, 'upload', context);
  return { context, label: fileTypeLabel, name, group, stepsUsed: stepKeyLocal - baseStepKey };
}

// ─── Ferramentas (Function Calling) ───────────────────────────────────────────
function buildTools(userRole) {
  const isPriv = userRole === 'OWNER' || userRole === 'ADMIN';
  const tools  = [
    { name:'listarDivergenciasAtivas',   description:'Lista divergências ativas.',            parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, status:{ type:'STRING' } } } },
    { name:'enviarParaFilaDeCorrecao',   description:'Envia divergência para correção.',      parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'ignorarDivergencia',         description:'Marca divergência como IGNORADA.',      parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'marcarDivergenciaCorrigida', description:'Marca como CORRIGIDO manualmente.',     parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'enviarLoteDivergencias',     description:'Envia TODAS as pendentes.',             parameters:{ type:'OBJECT', properties:{} } },
    { name:'consultarAgendador',         description:'Verifica agendador automático.',        parameters:{ type:'OBJECT', properties:{} } },
    { name:'ativarAgendador',            description:'Ativa varredura automática.',           parameters:{ type:'OBJECT', properties:{ intervaloMinutos:{ type:'INTEGER' } }, required:['intervaloMinutos'] } },
    { name:'desativarAgendador',         description:'Desativa varredura automática.',        parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarProdutos',             description:'Lista produtos do catálogo.',           parameters:{ type:'OBJECT', properties:{ busca:{ type:'STRING' }, limite:{ type:'INTEGER' }, semPeso:{ type:'BOOLEAN' }, semVinculo:{ type:'BOOLEAN' } } } },
    { name:'listarAvisosML',             description:'Lista avisos ativos do ML.',            parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' } } } },
    { name:'consultarStatusConexaoML',   description:'Verifica conexão ML.',                  parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarHistoricoPrecos',      description:'Lista histórico de preços.',            parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, mlItemId:{ type:'STRING' } } } },
    { name:'resumoGeral',                description:'Retorna métricas gerais.',              parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarPaginasDisponiveis',   description:'Lista páginas acessíveis.',             parameters:{ type:'OBJECT', properties:{} } },
    { name:'lerPagina',                  description:'Lê conteúdo de página local/remota.', parameters:{ type:'OBJECT', properties:{ caminho:{ type:'STRING' } }, required:['caminho'] } },
  ];
  if (isPriv) {
    tools.push(
      { name:'listarUsuariosPendentes', description:'Lista usuários aguardando aprovação.', parameters:{ type:'OBJECT', properties:{} } },
      { name:'aprovarUsuario',          description:'Aprova acesso de usuário.',             parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'bloquearUsuario',         description:'Bloqueia acesso de usuário.',           parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'resumoGlobalPlataforma',  description:'Métricas globais (ADMIN/OWNER).',       parameters:{ type:'OBJECT', properties:{} } },
    );
  }
  return [{ functionDeclarations: tools }];
}

async function executeTool(name, args, userId, userRole, pageBaseUrl) {
  const uid = parseInt(userId), isPriv = userRole==='OWNER'||userRole==='ADMIN';
  if (!uid && name !== 'lerPagina') return { erro: 'Usuário não identificado' };
  try {
    switch (name) {
      case 'listarDivergenciasAtivas': {
        const where = { usuarioId:uid, status: args.status ? args.status : { in:['PENDENTE','REINCIDENTE','PENDENTE_ENVIO'] } };
        const divs  = await prisma.divergencia.findMany({ where, take:Math.min(args.limite||5,20), orderBy:{ createdAt:'desc' }, select:{ id:true, mlItemId:true, titulo:true, pesoMl:true, pesoLocal:true, status:true, motivo:true } });
        return divs.length ? { divergenciasEncontradas:divs, total:divs.length } : { mensagem:'Nenhuma divergência ativa.' };
      }
      case 'enviarParaFilaDeCorrecao': {
        const d = await prisma.divergencia.findFirst({ where:{ id:parseInt(args.divergenciaId), usuarioId:uid } });
        if (!d) return { erro:'Não encontrada.' };
        await prisma.divergencia.update({ where:{ id:d.id }, data:{ status:'PENDENTE_ENVIO' } });
        return { sucesso:true, mensagem:`${d.mlItemId} enviada para fila.` };
      }
      case 'ignorarDivergencia': {
        const d = await prisma.divergencia.findFirst({ where:{ id:parseInt(args.divergenciaId), usuarioId:uid } });
        if (!d) return { erro:'Não encontrada.' };
        await prisma.divergencia.update({ where:{ id:d.id }, data:{ status:'IGNORADO', resolvido:true } });
        return { sucesso:true, mensagem:`${d.mlItemId} ignorada.` };
      }
      case 'marcarDivergenciaCorrigida': {
        const d = await prisma.divergencia.findFirst({ where:{ id:parseInt(args.divergenciaId), usuarioId:uid } });
        if (!d) return { erro:'Não encontrada.' };
        await prisma.divergencia.update({ where:{ id:d.id }, data:{ status:'CORRIGIDO', resolvido:true, corrigidoManual:true } });
        await prisma.divergenciaHistorico.create({ data:{ divergenciaId:d.id, usuarioId:uid, acao:'CORRIGIDO_MANUAL', descricao:'Corrigido via chat' } }).catch(()=>{});
        return { sucesso:true, mensagem:`${d.mlItemId} corrigida.` };
      }
      case 'enviarLoteDivergencias': {
        const r = await prisma.divergencia.updateMany({ where:{ usuarioId:uid, status:'PENDENTE' }, data:{ status:'PENDENTE_ENVIO' } });
        return { sucesso:true, mensagem:`${r.count} divergência(s) enviada(s) para fila.` };
      }
      case 'consultarAgendador': {
        const ag = await prisma.agendadorConfig.findUnique({ where:{ usuarioId:uid } });
        if (!ag) return { mensagem:'Nenhum agendador configurado.' };
        return { status:ag.ativo?'Ativo':'Inativo', intervaloMinutos:ag.intervalo, ultimaExecucao:ag.ultimaExecucao, proximaExecucao:ag.proximaExecucao };
      }
      case 'ativarAgendador': {
        const min = parseInt(args.intervaloMinutos)||360;
        await prisma.agendadorConfig.upsert({ where:{ usuarioId:uid }, update:{ ativo:true, intervalo:min }, create:{ usuarioId:uid, ativo:true, intervalo:min } });
        return { sucesso:true, mensagem:`Agendador ativado (a cada ${min}min).` };
      }
      case 'desativarAgendador': {
        await prisma.agendadorConfig.upsert({ where:{ usuarioId:uid }, update:{ ativo:false }, create:{ usuarioId:uid, ativo:false, intervalo:360 } });
        return { sucesso:true, mensagem:'Agendador desativado.' };
      }
      case 'listarProdutos': {
        const where = { usuarioId:uid };
        if (args.semPeso)    where.pesoGramas = 0;
        if (args.semVinculo) where.mlItemId   = null;
        if (args.busca)      where.OR = [{ nome:{ contains:args.busca, mode:'insensitive' } }, { sku:{ contains:args.busca, mode:'insensitive' } }];
        const produtos = await prisma.produto.findMany({ where, take:Math.min(args.limite||10,30), orderBy:{ id:'desc' }, select:{ id:true, sku:true, nome:true, preco:true, pesoGramas:true, mlItemId:true, status:true, eKit:true } });
        return { produtos, totalNoCatalogo: await prisma.produto.count({ where:{ usuarioId:uid } }), exibindo:produtos.length };
      }
      case 'listarAvisosML': {
        const avisos = await prisma.avisoML.findMany({ where:{ usuarioId:uid, resolvido:false }, take:Math.min(args.limite||5,20), orderBy:{ createdAt:'desc' }, select:{ id:true, mlItemId:true, titulo:true, tipoAviso:true, mensagem:true, severidade:true } }).catch(()=>[]);
        return avisos.length ? { avisos, total:avisos.length } : { mensagem:'Nenhum aviso ativo.' };
      }
      case 'consultarStatusConexaoML': {
        const token = await prisma.mlToken.findUnique({ where:{ usuarioId:uid }, select:{ nickname:true, expiresAt:true, mlUserId:true } });
        if (!token) return { conectado:false, mensagem:'Conta ML não conectada.' };
        return { conectado:new Date()<new Date(token.expiresAt), nickname:token.nickname, status:new Date()<new Date(token.expiresAt)?'Conectado e válido':'Token expirado' };
      }
      case 'listarHistoricoPrecos': {
        const where = { usuarioId:uid };
        if (args.mlItemId) where.mlItemId = args.mlItemId;
        const h = await prisma.precificacaoHistorico.findMany({ where, take:Math.min(args.limite||5,20), orderBy:{ criadoEm:'desc' }, select:{ mlItemId:true, titulo:true, preco:true, quantidade:true, criadoEm:true } }).catch(()=>[]);
        return h.length ? { historico:h, total:h.length } : { mensagem:'Nenhum histórico.' };
      }
      case 'resumoGeral': {
        const [totalProd, pend, reinc, corr, ign, penEnvio, avisos, ag, token] = await Promise.all([
          prisma.produto.count({ where:{ usuarioId:uid } }),
          prisma.divergencia.count({ where:{ usuarioId:uid, status:'PENDENTE' } }),
          prisma.divergencia.count({ where:{ usuarioId:uid, status:'REINCIDENTE' } }),
          prisma.divergencia.count({ where:{ usuarioId:uid, status:'CORRIGIDO' } }),
          prisma.divergencia.count({ where:{ usuarioId:uid, status:'IGNORADO' } }),
          prisma.divergencia.count({ where:{ usuarioId:uid, status:'PENDENTE_ENVIO' } }),
          prisma.avisoML.count({ where:{ usuarioId:uid, resolvido:false } }).catch(()=>0),
          prisma.agendadorConfig.findUnique({ where:{ usuarioId:uid } }),
          prisma.mlToken.findUnique({ where:{ usuarioId:uid }, select:{ nickname:true, expiresAt:true } }),
        ]);
        return { produtos:{ total:totalProd }, divergencias:{ pendente:pend, reincidente:reinc, corrigido:corr, ignorado:ign, pendenteEnvio:penEnvio, totalAtivas:pend+reinc }, avisosML:avisos, agendador:ag?{ ativo:ag.ativo, intervalo:ag.intervalo }:{ ativo:false }, conexaoML:token?{ nickname:token.nickname, valida:new Date()<new Date(token.expiresAt) }:{ conectado:false } };
      }
      case 'listarPaginasDisponiveis': {
        const caps    = ROLE_CAPABILITIES[userRole]||ROLE_CAPABILITIES['USUARIO'];
        const paginas = (caps.paginasAcesso||[]).map(p=>({ caminho:p, ...PAGE_CATALOG[p] }));
        return { paginas, totalAcesso:paginas.length };
      }
      case 'lerPagina': {
        let url = args.caminho||'/';
        if (!url.startsWith('http')) url = `${(pageBaseUrl||'http://localhost:5173').replace(/\/$/,'')}${url.startsWith('/')?'':'/'}${url}`;
        const content = await fetchPageContent(url);
        return content ? { url, conteudo:content, resumo:`${content.length} chars extraídos.` } : { erro:`Não foi possível acessar: ${url}` };
      }
      case 'listarUsuariosPendentes': {
        if (!isPriv) return { erro:'Sem permissão.' };
        const p = await prisma.usuario.findMany({ where:{ solicitouDesbloqueio:true, role:'BLOQUEADO' }, select:{ id:true, nome:true, email:true, createdAt:true } });
        return p.length ? { usuariosPendentes:p, total:p.length } : { mensagem:'Nenhum usuário aguardando.' };
      }
      case 'aprovarUsuario': {
        if (!isPriv) return { erro:'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where:{ id:parseInt(args.usuarioId) } });
        if (!u) return { erro:'Usuário não encontrado.' };
        await prisma.usuario.update({ where:{ id:u.id }, data:{ role:'USUARIO', solicitouDesbloqueio:false } });
        return { sucesso:true, mensagem:`${u.nome} aprovado.` };
      }
      case 'bloquearUsuario': {
        if (!isPriv) return { erro:'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where:{ id:parseInt(args.usuarioId) } });
        if (!u) return { erro:'Não encontrado.' };
        if (u.role==='OWNER') return { erro:'Não é possível bloquear um OWNER.' };
        await prisma.usuario.update({ where:{ id:u.id }, data:{ role:'BLOQUEADO' } });
        return { sucesso:true, mensagem:`${u.nome} bloqueado.` };
      }
      case 'resumoGlobalPlataforma': {
        if (!isPriv) return { erro:'Sem permissão.' };
        const [tu,tp,td,to] = await Promise.all([
          prisma.usuario.count(), prisma.produto.count(),
          prisma.divergencia.count({ where:{ status:{ in:['PENDENTE','REINCIDENTE'] } } }),
          prisma.sessaoUsuario.count({ where:{ ativo:true, entradaEm:{ gte:new Date(Date.now()-30*60*1000) } } }).catch(()=>0),
        ]);
        return { totalUsuarios:tu, totalProdutos:tp, divergenciasAtivas:td, usuariosOnline:to };
      }
      default: return { erro:`Função "${name}" não implementada.` };
    }
  } catch (e) { return { erro:`Erro em ${name}: ${e.message}` }; }
}

// ─── System Instruction ────────────────────────────────────────────────────────
function buildSystemInstruction(ctx) {
  const { totalProdutos=0, totalDivergencias=0, userRole='USUARIO', usuarioAtual=null, dataBlock=null, fileContexts=[], pageBaseUrl=null } = ctx;
  const fileBlock = fileContexts.length > 0
    ? `\n=== ARQUIVOS LIDOS NESTA MENSAGEM ===\n${fileContexts.map(f=>`[${f.name}]:\n${(f.context||'').substring(0,8000)}`).join('\n\n')}\n`
    : '';
  const sessionBlock = `=== CONTEXTO DA SESSÃO ATUAL ===
Usuário: ${usuarioAtual?.nome||'Desconhecido'} | Role: ${userRole}
Dados: ${dataBlock||`Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`}
${fileBlock}=== FIM DO CONTEXTO ===`;
  return [SKILL_CONTENT, CHAIN_OF_THOUGHT_PROMPT, sessionBlock].filter(Boolean).join('\n\n');
}

// ─── Modo Autônomo ─────────────────────────────────────────────────────────────
async function generateLocalStreamingResponse(message, onStep) {
  const best       = await queryKnowledge(message, 3);
  const content    = best.length > 0 ? best.map(m=>m.content).join(' ') : 'Não encontrei dados locais suficientes.';
  const confidence = best.length > 0 ? Math.round(best[0].confidence*100) : 10;
  const reasoning  = buildDynamicReasoning(message, [], { userRole:'USUARIO', usuarioAtual:{ nome:'Usuário' } }, false)
    + `\n\n**Modo Autônomo Ativo**\n\nAPI Gemini desativada. Acessando banco vetorial local. Encontrei ${best.length} resultado(s) com ${confidence}% de confiança.`;
  await emitReasoningStreamed(onStep, reasoning);
  return { reply:`<b>[Analyiz — Modo Autônomo]</b><br><br>${content}<br><br><i>Confiança local: ${confidence}%</i>`, sources:[], reasoning, toolsExecutadas:[] };
}

async function processarLivroEAprender(fileContexts, onStep) {
  const reasoning = `**Processando Comando de Aprendizagem**\n\nDetectei o comando de ingestão profunda. Iniciando fragmentação do conteúdo dos ${fileContexts.length} arquivo(s) em blocos de 2000 caracteres para indexação no banco vetorial.`;
  await emitReasoningStreamed(onStep, reasoning);
  let total = 0;
  for (const file of fileContexts) {
    if (!file.context) continue;
    for (let i = 0; i < file.context.length; i += 2000) {
      await saveKnowledge(`livro_${file.name.replace(/[^a-zA-Z0-9]/g,'_')}_p${Math.floor(i/2000)}`, file.context.substring(i,i+2000), 'upload_owner', 0.95);
      total++;
      if (onStep) await emitStep(onStep, `Memorizando bloco ${Math.floor(i/2000)+1} de "${file.name}"…`, null, 150);
    }
  }
  return { reply:`<b>🧠 Aprendizagem concluída!</b><br><br>• Fragmentos absorvidos: <b>${total}</b><br>• Disponível no Modo Autônomo.`, sources:[], reasoning, toolsExecutadas:[] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN — buildAnswerStream (v5)
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildAnswerStream(message, history = [], context = {}, onStep, attempt = 1) {
  const userId = context.usuarioAtual?.id || 0;
  const user   = await prisma.usuario.findUnique({ where:{ id:parseInt(userId) }, select:{ geminiAtivo:true, role:true } }).catch(()=>null);
  const geminiAtivo = user?.geminiAtivo ?? true;
  const isOwner     = user?.role === 'OWNER';

  if (isOwner && message) {
    const ml = message.toLowerCase();
    if (ml.match(/desativar(\s+o|\s+a)?\s+gemini/)) {
      await prisma.usuario.update({ where:{ id:parseInt(userId) }, data:{ geminiAtivo:false } });
      return { reply:'<b>Gemini desativado.</b><br>Operando no Modo Autônomo Local.', sources:[], reasoning:'', toolsExecutadas:[] };
    }
    if (ml.match(/ativar(\s+o|\s+a)?\s+gemini/)) {
      await prisma.usuario.update({ where:{ id:parseInt(userId) }, data:{ geminiAtivo:true } });
      return { reply:'<b>Gemini reativado.</b><br>Capacidade total restaurada.', sources:[], reasoning:'', toolsExecutadas:[] };
    }
  }

  if (!geminiAtivo) return generateLocalStreamingResponse(message, onStep);

  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;

  try {
    const ai           = getClient();
    const pageBaseUrl  = context.pageBaseUrl || 'http://localhost:5173';
    const incomingFiles = (context.files || []).slice(0, MAX_FILES);
    const fileContexts  = [];
    let globalStepKey   = 0;

    if (context.imageContext) {
      fileContexts.push({ label:'imagem', name:context.imageName||'imagem enviada', group:'image', context:context.imageContext });
    }

    if (incomingFiles.length > 0) {
      if (incomingFiles.length > 1 && onStep) {
        await emitStep(onStep, `Processando ${incomingFiles.length} arquivos…`, null, 300);
        await emitDone(onStep, globalStepKey++, 400);
      }
      for (const file of incomingFiles) {
        const r = await processFileToContext(file, message, evt => { if (evt.type==='step'&&onStep) onStep(evt); }, globalStepKey, context.sessionId);
        globalStepKey += r.stepsUsed || 0;
        if (r.context) fileContexts.push(r);
      }
    }

    if (isOwner && message?.toLowerCase().match(/leia (isto|isso|esse) e aprenda/) && fileContexts.length > 0) {
      return processarLivroEAprender(fileContexts, onStep);
    }

    // ── PIPELINE DE AGENTES ────────────────────────────────────────────────────
    let searchData    = null;
    let searchSources = [];
    const isImageOnly = !!context.imageOnly;

    if (needsWebSearch(message) && !isImageOnly) {
      // Anuncia o agente de pesquisa ao frontend
      emitAgentStart(onStep, 'pesquisa', 'Agente de Pesquisa ativado — iniciando varredura na internet...');

      const searchResult = await agentePesquisaProfunda(
        message,
        `Sessão do usuário: ${context.usuarioAtual?.nome || 'Desconhecido'}`,
        (msg, tipo) => emitAgentLog(onStep, msg, tipo)
      );

      emitAgentEnd(onStep);

      if (searchResult.sucesso) {
        searchData    = searchResult.dadosEncontrados;
        searchSources = searchResult.fontes || [];
        emitFontes(onStep, searchSources);
      }
    }

    // ── Raciocínio dinâmico (em chunks para o frontend) ────────────────────────
    const hasFiles      = fileContexts.length > 0;
    const reasoningText = buildDynamicReasoning(message, fileContexts, context, hasFiles);
    await emitReasoningStreamed(onStep, reasoningText);

    // ── Monta prompt ──────────────────────────────────────────────────────────
    let injectPrompt = message || '[arquivo enviado sem texto]';
    if (fileContexts.length > 0) {
      injectPrompt += `\n\n[ARQUIVOS LIDOS]:\n${fileContexts.map(f=>`[${f.name}]:\n${(f.context||'').substring(0,6000)}`).join('\n\n')}`;
    }
    if (searchData) {
      injectPrompt += `\n\n[DADOS DA PESQUISA WEB (use para basear sua resposta)]:\n${searchData}`;
    }

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, fileContexts, pageBaseUrl }),
      temperature:       0.25,
      maxOutputTokens:   2000,
      tools:             buildTools(context.userRole),
    };

    const geminiHistory = buildGeminiHistory(history);
    let contents  = [...geminiHistory, { role:'user', parts:[{ text:injectPrompt }] }];
    let response  = await ai.models.generateContent({ model, config, contents });

    // ── Function Calling loop ─────────────────────────────────────────────────
    const toolsExecutadas = [];
    let callCount = 0;
    while (response.functionCalls?.length > 0 && callCount < 5) {
      callCount++;
      const call    = response.functionCalls[0];
      const toolKey = globalStepKey++;
      toolsExecutadas.push(call.name);
      await emitStep(onStep, `Consultando sistema: ${call.name}…`, call.name, 300);
      contents.push({ role:'model', parts:[{ functionCall:{ name:call.name, args:call.args } }] });
      const apiResult = await executeTool(call.name, call.args, userId, context.userRole, pageBaseUrl);
      const ok        = !apiResult?.erro;
      await emitDone(onStep, toolKey, 200);
      if (onStep) onStep({ type:'tool_result', tool:call.name, ok, msg:ok?'Concluído':`Erro: ${apiResult?.erro}` });
      contents.push({ role:'user', parts:[{ functionResponse:{ name:call.name, response:apiResult } }] });
      response = await ai.models.generateContent({ model, config, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply:'⚠️ Resposta vazia. Tente novamente.', sources:[], reasoning:reasoningText, toolsExecutadas };

    await extractCodeBlocksAndSave(context.sessionId, raw, message||'');

    let replyGerado = cleanMetaText(ensureHTML(raw));

    // ── Agente Validador (apenas para respostas longas/críticas) ───────────────
    const deveValidar = !isImageOnly && message && message.length > 10 && replyGerado.length > 80;
    if (deveValidar) {
      emitAgentStart(onStep, 'validacao', 'Agente Validador ativado — verificando precisão da resposta...');

      const validacao = await agenteValidador(
        message,
        replyGerado,
        searchData || '',
        (context.dataBlock || '').substring(0, 600),
        (msg, tipo) => emitAgentLog(onStep, msg, tipo)
      );

      emitAgentEnd(onStep);
      replyGerado = validacao.respostaFinal || replyGerado;
    }

    // ── Fontes finais ─────────────────────────────────────────────────────────
    const localChunks  = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const localSources = localChunks.filter(c=>c.web?.uri).map(c=>({ uri:c.web.uri, title:c.web.title||c.web.uri }));
    const finalSources = [...searchSources, ...localSources].slice(0, 5);

    return { reply:replyGerado, sources:finalSources, fontes:finalSources, reasoning:reasoningText, toolsExecutadas };

  } catch (error) {
    if ((error?.status===429||String(error).includes('429'))&&attempt===1)
      return buildAnswerStream(message, history, context, onStep, 2);
    console.error('[buildAnswerStream]', error.message);
    return { reply:'⚠️ Erro no processamento. Tente novamente.', sources:[], reasoning:null, toolsExecutadas:[] };
  }
}

export const sendChatMessage = buildAnswerStream;

function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g,'<b>$1</b>')
    .replace(/(```[\s\S]*?```)/g,m=>m.replace(/\n/g,'___LB___'))
    .replace(/\n\n/g,'<br><br>')
    .replace(/\n/g,'<br>')
    .replace(/___LB___/g,'\n')
    .trim();
}

function cleanMetaText(t) {
  return t.replace(/^(Claro[,!]\s*)/i,'').replace(/^(Com certeza[,!]\s*)/i,'').replace(/^(Ótima pergunta[,!]\s*)/i,'').trim();
}

export async function buildAnswer(message, history=[], context={}) {
  return buildAnswerStream(message, history, context, null);
}

export function buildResumoPrompt(dadosStr) {
  return `Faça um resumo executivo em HTML (<b>, <br>) dos seguintes dados:\n\n${dadosStr}`;
}

export function hashContexto(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex').substring(0, 12);
}