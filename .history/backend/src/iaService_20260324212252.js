// backend/src/iaService.js — v4 NOVO FLUXO
// Fluxo corrigido:
//  1. Gemini gera PENSAMENTO curto (tópicos do que está fazendo)
//  2. Enquanto isso, frontend mostra "Pensando..." com variações de tempo
//  3. Gemini gera RESPOSTA REAL separada, usando o pensamento como contexto
//  4. Resposta só aparece DEPOIS que o pensamento terminar

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryKnowledge, saveKnowledge } from './ia-engine/knowledge.js';

const prisma    = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Carrega SKILL.md ──────────────────────────────────────────────────────────
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
// PROMPT DE PENSAMENTO — Gemini gera raciocínio curto em tópicos
// ═══════════════════════════════════════════════════════════════════════════════
const THINKING_SYSTEM_PROMPT = `
Você é a IA Analyiz. Sua tarefa é gerar um RACIOCÍNIO INTERNO CURTO antes de responder.

REGRAS OBRIGATÓRIAS:
- Gere entre 2 e 4 blocos de pensamento
- Cada bloco: título em negrito (**Título**) + parágrafo curto (máx 2 frases)
- Tom: primeira pessoa, monólogo interno, análise rápida
- Sem HTML, sem markdown extra, só **negrito** para títulos
- Máximo 300 palavras no total
- Seja direto e específico ao contexto da mensagem

FORMATO:
**Título do Bloco**
Descrição curta do raciocínio neste estágio.

**Próximo Bloco**
Outra etapa do pensamento.

NÃO inclua a resposta final aqui. APENAS o raciocínio interno.
`;

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT DE RESPOSTA — Gemini gera resposta final coerente
// ═══════════════════════════════════════════════════════════════════════════════
const RESPONSE_SYSTEM_PROMPT = `
=== INSTRUÇÕES DE RESPOSTA ===

Você é a IA Analyiz, assistente especialista em logística e e-commerce.

REGRAS:
- Responda APENAS com a resposta final ao usuário
- Não repita o raciocínio interno
- Use HTML básico (<b>, <br>) para formatação
- Não use Markdown (**, ##, -)
- Seja direto e acionável
- Responda sempre em Português do Brasil
- Nunca comece com "Claro!", "Com certeza!", "Ótima pergunta!"
- Código sempre completo, nunca truncado
- Nomes de arquivos baseados no assunto do cliente

CONTEXTO DE PERMISSÕES:
`;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function buildGeminiHistory(history) {
  if (!history?.length) return [];
  const msgs  = history.slice(0, -1);
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur = msgs[i], next = msgs[i + 1];
    if (cur.role === 'user' && next?.role === 'ia') {
      pairs.push({
        user:  stripHTML(cur.content).substring(0, 800),
        model: stripHTML(next.content).substring(0, 800),
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

export function needsWebSearch(message) {
  if (!message) return false;
  return /mercado\s*livre|ml\s*api|taxa|tarifa|comiss[ãa]o|frete|clima|dólar|notícia/i.test(message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMISSÃO DE REASONING EM CHUNKS (streaming suave)
// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// GERADOR DE NOME DE ARQUIVO INTELIGENTE
// ═══════════════════════════════════════════════════════════════════════════════
function gerarNomeArquivoInteligente(lang, userMessage) {
  const msg = (userMessage || '').toLowerCase();
  const l   = (lang || '').toLowerCase().trim();

  const EXT = {
    html:'html', css:'css', js:'js', jsx:'jsx', ts:'ts', tsx:'tsx',
    py:'py', sql:'sql', json:'json', sh:'sh', bash:'sh', md:'md',
    yaml:'yaml', yml:'yaml', xml:'xml', java:'java', cs:'cs', cpp:'cpp',
    go:'go', rs:'rs', rb:'rb', php:'php', swift:'swift', kt:'kt',
    txt:'txt', env:'env', dockerfile:'dockerfile', toml:'toml',
  };
  const ext = EXT[l] || l || 'txt';

  const patterns = [
    { regex: /petshop|pet shop|loja.*pet/i,          name: 'petshop' },
    { regex: /landing page|página.*vendas|sales/i,   name: 'landing_page' },
    { regex: /portfolio|portfólio/i,                  name: 'portfolio' },
    { regex: /login|autenticação|auth/i,              name: 'login' },
    { regex: /dashboard|painel|admin/i,               name: 'dashboard' },
    { regex: /restaurante|cardápio|delivery/i,        name: 'restaurante' },
    { regex: /e-?commerce|loja.*online|store/i,       name: 'ecommerce' },
    { regex: /blog|artigo|post/i,                     name: 'blog' },
    { regex: /agenda|calendário|schedule/i,           name: 'agenda' },
    { regex: /calculadora|calculator/i,               name: 'calculadora' },
    { regex: /formulário|form|contato/i,              name: 'formulario' },
    { regex: /relatório|report|métricas/i,             name: 'relatorio' },
    { regex: /produto|catalog|catálogo/i,             name: 'catalogo' },
    { regex: /divergenc|frete|peso/i,                  name: 'divergencias' },
    { regex: /usuari|user|perfil|profile/i,           name: 'usuarios' },
    { regex: /clinica|consultório|médico/i,            name: 'clinica' },
    { regex: /escola|educação|curso/i,                name: 'educacao' },
    { regex: /hotél|hotel|hospedagem|pousada/i,       name: 'hotel' },
    { regex: /academia|fitness|gym/i,                 name: 'academia' },
    { regex: /imobiliária|imoveis|apartamento/i,      name: 'imobiliaria' },
  ];

  let base = '';
  for (const p of patterns) {
    if (p.regex.test(msg)) { base = p.name; break; }
  }

  if (!base) {
    const defaultNames = {
      html:'pagina', css:'estilo', js:'script', jsx:'componente',
      tsx:'componente', ts:'codigo', py:'script', sql:'query',
      json:'dados', sh:'script', bash:'script', yaml:'config',
      yml:'config', xml:'dados', java:'codigo', cs:'codigo',
      cpp:'codigo', go:'codigo', rs:'codigo', rb:'script',
      php:'script', swift:'codigo', kt:'codigo', md:'documento',
    };
    base = defaultNames[l] || 'arquivo';
  }

  const typeSuffix = {
    html:'', css:'_estilo', js:'_script', jsx:'_componente',
    tsx:'_componente', py:'_script', sql:'_query',
  };
  const suffix = typeSuffix[l] !== undefined ? typeSuffix[l] : '';

  return `${base}${suffix}.${ext}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE CATALOG / ROLES
// ═══════════════════════════════════════════════════════════════════════════════
export const PAGE_CATALOG = {
  '/':             { titulo:'Home / Dashboard',          desc:'Visão geral do sistema, métricas principais' },
  '/ml':           { titulo:'Mercado Livre — Dashboard', desc:'Ferramentas ML: Radar de Fretes, Precificação, Pesquisa, Anúncios' },
  '/ml/auditoria': { titulo:'Radar de Fretes',           desc:'Scanner de divergências de peso/frete nos anúncios ML' },
  '/ml/precos':    { titulo:'Precificação ML',            desc:'Gerenciamento de preços. Histórico, atualização em lote' },
  '/ml/pesquisa':  { titulo:'Pesquisa de Anúncios',      desc:'Pesquisa por link ou ID. Preços, vendedores, concorrentes' },
  '/ml/anuncios':  { titulo:'Meus Anúncios ML',          desc:'Lista anúncios do usuário. Filtros por status, exportação CSV' },
  '/shopee':       { titulo:'Shopee',                    desc:'Integração com Shopee (em desenvolvimento)' },
  '/amazon':       { titulo:'Amazon',                    desc:'Integração com Amazon (em desenvolvimento)' },
  '/usuarios':     { titulo:'Gerenciamento de Usuários', desc:'Lista e gerencia usuários. Aprovar/bloquear. Alterar roles' },
};

const ROLE_CAPABILITIES = {
  BLOQUEADO: { desc:'Sem acesso.', paginasAcesso:[], acoesPermitidas:[], restricoes:[] },
  USUARIO:   { desc:'Acesso ao próprio catálogo.', paginasAcesso:['/','/ml','/ml/auditoria','/ml/precos','/ml/pesquisa','/ml/anuncios','/shopee','/amazon'], acoesPermitidas:['ver próprios produtos','ver próprias divergências','corrigir divergências','configurar agendador'], restricoes:['NÃO pode ver dados de outros usuários','NÃO pode aprovar/bloquear usuários'] },
  ADMIN:     { desc:'Acesso ampliado.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['tudo do USUARIO','ver dados de todos','gerenciar usuários'], restricoes:['NÃO pode excluir usuários permanentemente'] },
  OWNER:     { desc:'Acesso total.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['acesso total a tudo'], restricoes:[] },
};

const STEP_DELAYS = {
  pdf_extracting:1200, pdf_done:400, excel_analyzing:1000, excel_done:300,
  txt_reading:300,     txt_done:200, audio_transcribing:2000, audio_done:400,
  image_analyzing:700, image_done:300, db_done:250,
};

// ─── Salvar documentos ─────────────────────────────────────────────────────────
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
    while (usedNames.has(filename)) {
      attempt++;
      const dotIdx = originalFilename.lastIndexOf('.');
      filename = dotIdx > -1
        ? `${originalFilename.slice(0, dotIdx)}_${attempt}.${originalFilename.slice(dotIdx + 1)}`
        : `${originalFilename}_${attempt}`;
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
      contents: [{ role: 'user', parts: [
        { text: `Extraia TODO o texto deste PDF. Arquivo: ${fileName}` },
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
      ]}],
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
        const cols = [];
        let cur = '', inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; }
          else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        cols.push(cur.trim());
        return `${idx === 0 ? '## ' : ''}${cols.join(' | ')}`;
      }).join('\n');
      return `=== CSV: ${fileName} (${lines.length} linhas) ===\n${formatted}`.substring(0, 15000);
    } catch (e) { console.warn('[extractExcel CSV]', e.message); }
  }

  try {
    const XLSX = await import('xlsx').catch(() => null);
    if (XLSX) {
      const buffer   = Buffer.from(base64, 'base64');
      const workbook = XLSX.read(buffer, { type:'buffer', cellText:true, cellDates:true, raw:false });
      const sheetNames = workbook.SheetNames;
      if (!sheetNames || sheetNames.length === 0) throw new Error('Workbook sem abas');
      const allSheets = [];
      for (const sheetName of sheetNames.slice(0, 8)) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const data = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', blankrows:false });
        if (!data || data.length === 0) continue;
        const maxCols = Math.max(...data.slice(0, 5).map(r => (Array.isArray(r) ? r.length : 0)));
        const rows = data.slice(0, 200).map((row, idx) => {
          const cells = Array.isArray(row) ? row : [];
          const normalized = Array.from({ length: maxCols }, (_, c) =>
            String(cells[c] ?? '').trim().replace(/\s+/g, ' ').substring(0, 100)
          );
          return `${idx === 0 ? '## ' : ''}${normalized.join(' | ')}`;
        });
        allSheets.push(`=== Aba: "${sheetName}" (${data.length} linhas × ${maxCols} colunas) ===\n${rows.join('\n')}`);
      }
      if (allSheets.length > 0) {
        const header = `=== Planilha: ${fileName} (${sheetNames.length} aba${sheetNames.length !== 1 ? 's' : ''}: ${sheetNames.slice(0, 8).join(', ')}) ===\n\n`;
        return (header + allSheets.join('\n\n')).substring(0, 20000);
      }
    }
  } catch (e) { console.warn('[extractExcel SheetJS]', e.message); }

  try {
    const ai = getClient();
    const geminiMime = mimeType.includes('openxmlformats')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.ms-excel';
    const r = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0, maxOutputTokens: 8000 },
      contents: [{ role: 'user', parts: [
        { text: `Extraia TODOS os dados desta planilha Excel "${fileName}". Liste cada linha no formato: COLUNA1 | COLUNA2 | COLUNA3.` },
        { inlineData: { mimeType: geminiMime, data: base64 } },
      ]}],
    });
    const result = r.text?.trim();
    if (result && result.length > 20) return result;
  } catch (e2) { console.warn('[extractExcel Gemini fallback]', e2.message); }

  return `Não foi possível extrair os dados de "${fileName}". Dica: salve o arquivo como CSV (UTF-8) para melhor compatibilidade.`;
}

function extractTXT(base64) {
  return Buffer.from(base64, 'base64').toString('utf-8').substring(0, 20000);
}

async function transcribeAudio(base64, mimeType) {
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0 },
      contents: [{ role: 'user', parts: [
        { text: 'Transcreva este áudio fielmente.' },
        { inlineData: { mimeType, data: base64 } },
      ]}],
    });
    return r.text?.trim() || null;
  } catch { return null; }
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.2 },
      contents: [{ role: 'user', parts: [
        { text: userQuestion || 'Descreva esta imagem detalhadamente.' },
        { inlineData: { mimeType, data: base64 } },
      ]}],
    });
    return r.text?.trim() || null;
  } catch { return null; }
}

async function fetchPageContent(url) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'AnalyizBot/1.0', 'Accept': 'text/html' },
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const html = await resp.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 8000) || null;
  } catch { return null; }
}

export async function processFileToContext(file, userMessage, onStep, baseStepKey = 0, sessionId = null) {
  const { base64, mimeType, name, group } = file;
  let context = null, fileTypeLabel = '', stepKeyLocal = baseStepKey;

  const step = async (msg, delay = 0) => { await emitStep(onStep, msg, null, delay); return stepKeyLocal++; };
  const done = async (key, delay = STEP_DELAYS.db_done) => { await emitDone(onStep, key, delay); };

  switch (group) {
    case 'image': {
      const k = await step(`Analisando imagem "${name}"…`, STEP_DELAYS.image_analyzing);
      context = await analyzeImage(base64, mimeType, userMessage || '');
      await done(k, STEP_DELAYS.image_done);
      fileTypeLabel = 'imagem';
      break;
    }
    case 'pdf': {
      const k = await step(`Lendo PDF "${name}"…`, STEP_DELAYS.pdf_extracting);
      context = await extractPDF(base64, name);
      await done(k, STEP_DELAYS.pdf_done);
      fileTypeLabel = 'PDF';
      break;
    }
    case 'excel': {
      const label = mimeType === 'text/csv' ? 'CSV' : 'planilha Excel';
      const k     = await step(`Lendo ${label} "${name}"…`, STEP_DELAYS.excel_analyzing);
      context     = await extractExcel(base64, mimeType, name);
      await done(k, STEP_DELAYS.excel_done);
      fileTypeLabel = label;
      break;
    }
    case 'txt': {
      const k = await step(`Lendo TXT "${name}"…`, STEP_DELAYS.txt_reading);
      context = extractTXT(base64);
      await done(k, STEP_DELAYS.txt_done);
      fileTypeLabel = 'texto';
      break;
    }
    case 'audio': {
      const k = await step(`Transcrevendo áudio "${name}"…`, STEP_DELAYS.audio_transcribing);
      context = await transcribeAudio(base64, mimeType);
      await done(k, STEP_DELAYS.audio_done);
      fileTypeLabel = 'áudio';
      break;
    }
  }

  if (context && sessionId) await saveChatDocument(sessionId, name, 'upload', context);
  return { context, label: fileTypeLabel, name, group, stepsUsed: stepKeyLocal - baseStepKey };
}

// ─── Ferramentas (Function Calling) ───────────────────────────────────────────
function buildTools(userRole) {
  const isPriv = userRole === 'OWNER' || userRole === 'ADMIN';
  const tools  = [
    { name:'listarDivergenciasAtivas',   description:'Lista divergências de frete/peso ativas.',           parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, status:{ type:'STRING' } } } },
    { name:'enviarParaFilaDeCorrecao',   description:'Envia divergência para correção automática.',         parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'ignorarDivergencia',         description:'Marca divergência como IGNORADA.',                    parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'marcarDivergenciaCorrigida', description:'Marca divergência como CORRIGIDO manualmente.',       parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'enviarLoteDivergencias',     description:'Envia TODAS as divergências PENDENTES para correção.',parameters:{ type:'OBJECT', properties:{} } },
    { name:'consultarAgendador',         description:'Verifica estado do agendador automático.',            parameters:{ type:'OBJECT', properties:{} } },
    { name:'ativarAgendador',            description:'Ativa varredura automática no intervalo informado.',  parameters:{ type:'OBJECT', properties:{ intervaloMinutos:{ type:'INTEGER' } }, required:['intervaloMinutos'] } },
    { name:'desativarAgendador',         description:'Desativa varredura automática.',                      parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarProdutos',             description:'Lista produtos do catálogo.',                         parameters:{ type:'OBJECT', properties:{ busca:{ type:'STRING' }, limite:{ type:'INTEGER' }, semPeso:{ type:'BOOLEAN' }, semVinculo:{ type:'BOOLEAN' } } } },
    { name:'listarAvisosML',             description:'Lista avisos ativos do Mercado Livre.',               parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' } } } },
    { name:'consultarStatusConexaoML',   description:'Verifica se a conta ML está conectada.',              parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarHistoricoPrecos',      description:'Lista histórico de preços dos anúncios.',             parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, mlItemId:{ type:'STRING' } } } },
    { name:'resumoGeral',                description:'Retorna métricas gerais do sistema.',                 parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarPaginasDisponiveis',   description:'Lista páginas acessíveis pelo usuário.',              parameters:{ type:'OBJECT', properties:{} } },
    { name:'lerPagina',                  description:'Lê conteúdo de página local ou remota.',              parameters:{ type:'OBJECT', properties:{ caminho:{ type:'STRING' } }, required:['caminho'] } },
  ];
  if (isPriv) {
    tools.push(
      { name:'listarUsuariosPendentes',  description:'Lista usuários aguardando aprovação.',               parameters:{ type:'OBJECT', properties:{} } },
      { name:'aprovarUsuario',           description:'Aprova acesso de um usuário.',                       parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'bloquearUsuario',          description:'Bloqueia acesso de um usuário.',                     parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'resumoGlobalPlataforma',   description:'Métricas globais (apenas ADMIN/OWNER).',             parameters:{ type:'OBJECT', properties:{} } },
    );
  }
  return [{ functionDeclarations: tools }];
}

async function executeTool(name, args, userId, userRole, pageBaseUrl) {
  const uid    = parseInt(userId);
  const isPriv = userRole === 'OWNER' || userRole === 'ADMIN';
  if (!uid && name !== 'lerPagina') return { erro: 'Usuário não identificado' };
  try {
    switch (name) {
      case 'listarDivergenciasAtivas': {
        const where = { usuarioId: uid, status: args.status ? args.status : { in: ['PENDENTE', 'REINCIDENTE', 'PENDENTE_ENVIO'] } };
        const divs  = await prisma.divergencia.findMany({ where, take: Math.min(args.limite || 5, 20), orderBy: { createdAt: 'desc' }, select: { id: true, mlItemId: true, titulo: true, pesoMl: true, pesoLocal: true, status: true, motivo: true } });
        return divs.length ? { divergenciasEncontradas: divs, total: divs.length } : { mensagem: 'Nenhuma divergência ativa.' };
      }
      case 'enviarParaFilaDeCorrecao': {
        const d = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!d) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: d.id }, data: { status: 'PENDENTE_ENVIO' } });
        return { sucesso: true, mensagem: `${d.mlItemId} enviada para fila.` };
      }
      case 'ignorarDivergencia': {
        const d = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!d) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: d.id }, data: { status: 'IGNORADO', resolvido: true } });
        return { sucesso: true, mensagem: `${d.mlItemId} ignorada.` };
      }
      case 'marcarDivergenciaCorrigida': {
        const d = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!d) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: d.id }, data: { status: 'CORRIGIDO', resolvido: true, corrigidoManual: true } });
        await prisma.divergenciaHistorico.create({ data: { divergenciaId: d.id, usuarioId: uid, acao: 'CORRIGIDO_MANUAL', descricao: 'Corrigido via chat' } }).catch(() => {});
        return { sucesso: true, mensagem: `${d.mlItemId} corrigida.` };
      }
      case 'enviarLoteDivergencias': {
        const r = await prisma.divergencia.updateMany({ where: { usuarioId: uid, status: 'PENDENTE' }, data: { status: 'PENDENTE_ENVIO' } });
        return { sucesso: true, mensagem: `${r.count} divergência(s) enviada(s) para fila.` };
      }
      case 'consultarAgendador': {
        const ag = await prisma.agendadorConfig.findUnique({ where: { usuarioId: uid } });
        if (!ag) return { mensagem: 'Nenhum agendador configurado.' };
        return { status: ag.ativo ? 'Ativo' : 'Inativo', intervaloMinutos: ag.intervalo, ultimaExecucao: ag.ultimaExecucao, proximaExecucao: ag.proximaExecucao };
      }
      case 'ativarAgendador': {
        const min = parseInt(args.intervaloMinutos) || 360;
        await prisma.agendadorConfig.upsert({ where: { usuarioId: uid }, update: { ativo: true, intervalo: min }, create: { usuarioId: uid, ativo: true, intervalo: min } });
        return { sucesso: true, mensagem: `Agendador ativado (a cada ${min}min).` };
      }
      case 'desativarAgendador': {
        await prisma.agendadorConfig.upsert({ where: { usuarioId: uid }, update: { ativo: false }, create: { usuarioId: uid, ativo: false, intervalo: 360 } });
        return { sucesso: true, mensagem: 'Agendador desativado.' };
      }
      case 'listarProdutos': {
        const where = { usuarioId: uid };
        if (args.semPeso)    where.pesoGramas = 0;
        if (args.semVinculo) where.mlItemId   = null;
        if (args.busca)      where.OR = [{ nome: { contains: args.busca, mode: 'insensitive' } }, { sku: { contains: args.busca, mode: 'insensitive' } }];
        const produtos = await prisma.produto.findMany({ where, take: Math.min(args.limite || 10, 30), orderBy: { id: 'desc' }, select: { id: true, sku: true, nome: true, preco: true, pesoGramas: true, mlItemId: true, status: true, eKit: true } });
        return { produtos, totalNoCatalogo: await prisma.produto.count({ where: { usuarioId: uid } }), exibindo: produtos.length };
      }
      case 'listarAvisosML': {
        const avisos = await prisma.avisoML.findMany({ where: { usuarioId: uid, resolvido: false }, take: Math.min(args.limite || 5, 20), orderBy: { createdAt: 'desc' }, select: { id: true, mlItemId: true, titulo: true, tipoAviso: true, mensagem: true, severidade: true } }).catch(() => []);
        return avisos.length ? { avisos, total: avisos.length } : { mensagem: 'Nenhum aviso ativo.' };
      }
      case 'consultarStatusConexaoML': {
        const token = await prisma.mlToken.findUnique({ where: { usuarioId: uid }, select: { nickname: true, expiresAt: true, mlUserId: true } });
        if (!token) return { conectado: false, mensagem: 'Conta ML não conectada.' };
        return { conectado: new Date() < new Date(token.expiresAt), nickname: token.nickname, status: new Date() < new Date(token.expiresAt) ? 'Conectado e válido' : 'Token expirado' };
      }
      case 'listarHistoricoPrecos': {
        const where = { usuarioId: uid };
        if (args.mlItemId) where.mlItemId = args.mlItemId;
        const h = await prisma.precificacaoHistorico.findMany({ where, take: Math.min(args.limite || 5, 20), orderBy: { criadoEm: 'desc' }, select: { mlItemId: true, titulo: true, preco: true, quantidade: true, criadoEm: true } }).catch(() => []);
        return h.length ? { historico: h, total: h.length } : { mensagem: 'Nenhum histórico.' };
      }
      case 'resumoGeral': {
        const [totalProd, pend, reinc, corr, ign, penEnvio, avisos, ag, token] = await Promise.all([
          prisma.produto.count({ where: { usuarioId: uid } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE_ENVIO' } }),
          prisma.avisoML.count({ where: { usuarioId: uid, resolvido: false } }).catch(() => 0),
          prisma.agendadorConfig.findUnique({ where: { usuarioId: uid } }),
          prisma.mlToken.findUnique({ where: { usuarioId: uid }, select: { nickname: true, expiresAt: true } }),
        ]);
        return {
          produtos:     { total: totalProd },
          divergencias: { pendente: pend, reincidente: reinc, corrigido: corr, ignorado: ign, pendenteEnvio: penEnvio, totalAtivas: pend + reinc },
          avisosML:     avisos,
          agendador:    ag ? { ativo: ag.ativo, intervalo: ag.intervalo } : { ativo: false },
          conexaoML:    token ? { nickname: token.nickname, valida: new Date() < new Date(token.expiresAt) } : { conectado: false },
        };
      }
      case 'listarPaginasDisponiveis': {
        const caps    = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
        const paginas = (caps.paginasAcesso || []).map(p => ({ caminho: p, ...PAGE_CATALOG[p] }));
        return { paginas, totalAcesso: paginas.length };
      }
      case 'lerPagina': {
        let url = args.caminho || '/';
        if (!url.startsWith('http')) url = `${(pageBaseUrl || 'http://localhost:5173').replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
        const content = await fetchPageContent(url);
        return content ? { url, conteudo: content, resumo: `${content.length} chars extraídos.` } : { erro: `Não foi possível acessar: ${url}` };
      }
      case 'listarUsuariosPendentes': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const p = await prisma.usuario.findMany({ where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }, select: { id: true, nome: true, email: true, createdAt: true } });
        return p.length ? { usuariosPendentes: p, total: p.length } : { mensagem: 'Nenhum usuário aguardando.' };
      }
      case 'aprovarUsuario': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where: { id: parseInt(args.usuarioId) } });
        if (!u) return { erro: 'Usuário não encontrado.' };
        await prisma.usuario.update({ where: { id: u.id }, data: { role: 'USUARIO', solicitouDesbloqueio: false } });
        return { sucesso: true, mensagem: `${u.nome} aprovado.` };
      }
      case 'bloquearUsuario': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where: { id: parseInt(args.usuarioId) } });
        if (!u) return { erro: 'Usuário não encontrado.' };
        if (u.role === 'OWNER') return { erro: 'Não é possível bloquear um OWNER.' };
        await prisma.usuario.update({ where: { id: u.id }, data: { role: 'BLOQUEADO' } });
        return { sucesso: true, mensagem: `${u.nome} bloqueado.` };
      }
      case 'resumoGlobalPlataforma': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const [tu, tp, td, to] = await Promise.all([
          prisma.usuario.count(),
          prisma.produto.count(),
          prisma.divergencia.count({ where: { status: { in: ['PENDENTE', 'REINCIDENTE'] } } }),
          prisma.sessaoUsuario.count({ where: { ativo: true, entradaEm: { gte: new Date(Date.now() - 30 * 60 * 1000) } } }).catch(() => 0),
        ]);
        return { totalUsuarios: tu, totalProdutos: tp, divergenciasAtivas: td, usuariosOnline: to };
      }
      default: return { erro: `Função "${name}" não implementada.` };
    }
  } catch (e) { return { erro: `Erro em ${name}: ${e.message}` }; }
}

// ─── System Instruction para RESPOSTA FINAL ───────────────────────────────────
function buildResponseSystemInstruction(ctx) {
  const {
    totalProdutos  = 0,
    totalDivergencias = 0,
    userRole       = 'USUARIO',
    usuarioAtual   = null,
    dataBlock      = null,
    fileContexts   = [],
    pageBaseUrl    = null,
  } = ctx;

  const caps = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];

  const fileBlock = fileContexts.length > 0
    ? `\n=== ARQUIVOS LIDOS NESTA MENSAGEM ===\n${fileContexts.map(f => `[${f.name}]:\n${(f.context || '').substring(0, 8000)}`).join('\n\n')}\n`
    : '';

  const sessionBlock = `=== CONTEXTO DA SESSÃO ===
Usuário: ${usuarioAtual?.nome || 'Desconhecido'} | Role: ${userRole}
Permissões: ${caps.desc}
Ações permitidas: ${caps.acoesPermitidas.join(', ') || 'nenhuma'}
Restrições: ${caps.restricoes.join(', ') || 'nenhuma'}
Dados: ${dataBlock || `Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`}
${fileBlock}=== FIM DO CONTEXTO ===`;

  const parts = [];
  if (SKILL_CONTENT) parts.push(SKILL_CONTENT);
  parts.push(RESPONSE_SYSTEM_PROMPT + `\nRole do usuário: ${userRole}\n${caps.desc}`);
  parts.push(sessionBlock);
  return parts.join('\n\n');
}

// ─── Modo Autônomo Local ──────────────────────────────────────────────────────
async function generateLocalStreamingResponse(message, onStep) {
  const best       = await queryKnowledge(message, 3);
  const content    = best.length > 0 ? best.map(m => m.content).join(' ') : 'Não encontrei dados locais suficientes.';
  const confidence = best.length > 0 ? Math.round(best[0].confidence * 100) : 10;

  const reasoning = `**Modo Autônomo**\n\nAPI Gemini desativada. Acessando banco vetorial local.\n\n**Resultado**\n\nEncontrei ${best.length} resultado(s) com ${confidence}% de confiança.`;

  await emitReasoningStreamed(onStep, reasoning);

  return {
    reply:           `<b>[Analyiz — Modo Autônomo]</b><br><br>${content}<br><br><i>Confiança local: ${confidence}%</i>`,
    sources:         [],
    reasoning,
    toolsExecutadas: [],
  };
}

async function processarLivroEAprender(fileContexts, onStep) {
  const reasoning = `**Processando Aprendizagem**\n\nIniciando fragmentação dos ${fileContexts.length} arquivo(s) em blocos de 2000 caracteres para indexação no banco vetorial.`;
  await emitReasoningStreamed(onStep, reasoning);

  let total = 0;
  for (const file of fileContexts) {
    if (!file.context) continue;
    for (let i = 0; i < file.context.length; i += 2000) {
      await saveKnowledge(`livro_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_p${Math.floor(i / 2000)}`, file.context.substring(i, i + 2000), 'upload_owner', 0.95);
      total++;
      if (onStep) await emitStep(onStep, `Memorizando bloco ${Math.floor(i / 2000) + 1} de "${file.name}"…`, null, 150);
    }
  }

  return {
    reply:           `<b>🧠 Aprendizagem concluída!</b><br><br>• Fragmentos absorvidos: <b>${total}</b><br>• Disponível no Modo Autônomo.`,
    sources:         [],
    reasoning,
    toolsExecutadas: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOVO FLUXO PRINCIPAL — buildAnswerStream
//
// ETAPA 1: Processa arquivos (se houver) → emite steps
// ETAPA 2: Gemini gera PENSAMENTO curto → emite reasoning em chunks
// ETAPA 3: Gemini executa function calling (se necessário) → emite tool steps
// ETAPA 4: Gemini gera RESPOSTA FINAL com todo o contexto
// ETAPA 5: Emite evento 'done' → frontend exibe a resposta
//
// O frontend NUNCA mostra a resposta antes do reasoning terminar.
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildAnswerStream(message, history = [], context = {}, onStep, attempt = 1) {
  const userId = context.usuarioAtual?.id || 0;
  const user   = await prisma.usuario.findUnique({
    where:  { id: parseInt(userId) },
    select: { geminiAtivo: true, role: true },
  });
  const geminiAtivo = user?.geminiAtivo ?? true;
  const isOwner     = user?.role === 'OWNER';

  // Toggle Gemini (OWNER only)
  if (isOwner && message) {
    const ml = message.toLowerCase();
    if (ml.match(/desativar(\s+o|\s+a)?\s+gemini/)) {
      await prisma.usuario.update({ where: { id: parseInt(userId) }, data: { geminiAtivo: false } });
      return { reply: '<b>Gemini desativado.</b><br>Operando no Modo Autônomo Local.', sources: [], reasoning: '', toolsExecutadas: [] };
    }
    if (ml.match(/ativar(\s+o|\s+a)?\s+gemini/)) {
      await prisma.usuario.update({ where: { id: parseInt(userId) }, data: { geminiAtivo: true } });
      return { reply: '<b>Gemini reativado.</b><br>Capacidade total restaurada.', sources: [], reasoning: '', toolsExecutadas: [] };
    }
  }

  if (!geminiAtivo) return generateLocalStreamingResponse(message, onStep);

  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;

  try {
    const ai            = getClient();
    const pageBaseUrl   = context.pageBaseUrl || 'http://localhost:5173';
    const incomingFiles = (context.files || []).slice(0, MAX_FILES);
    const fileContexts  = [];
    let globalStepKey   = 0;

    // ── ETAPA 1: Processa imagem principal ────────────────────────────────────
    if (context.imageContext) {
      fileContexts.push({
        label:   'imagem',
        name:    context.imageName || 'imagem enviada',
        group:   'image',
        context: context.imageContext,
      });
    }

    // ── ETAPA 1b: Processa arquivos extras ────────────────────────────────────
    if (incomingFiles.length > 0) {
      if (incomingFiles.length > 1 && onStep) {
        await emitStep(onStep, `Processando ${incomingFiles.length} arquivos…`, null, 300);
        await emitDone(onStep, globalStepKey++, 400);
      }
      for (const file of incomingFiles) {
        const r = await processFileToContext(
          file, message,
          evt => { if (evt.type === 'step' && onStep) onStep(evt); },
          globalStepKey, context.sessionId
        );
        globalStepKey += r.stepsUsed || 0;
        if (r.context) fileContexts.push(r);
      }
    }

    // Comando "leia isso e aprenda" (OWNER)
    if (isOwner && message?.toLowerCase().match(/leia (isto|isso|esse) e aprenda/) && fileContexts.length > 0) {
      return processarLivroEAprender(fileContexts, onStep);
    }

    // ── ETAPA 2: Gemini gera PENSAMENTO curto ─────────────────────────────────
    // Constrói contexto resumido para o pensamento (sem dados pesados)
    const caps = ROLE_CAPABILITIES[context.userRole] || ROLE_CAPABILITIES['USUARIO'];
    const thinkingContext = [
      `Usuário: ${context.usuarioAtual?.nome || 'Usuário'} | Role: ${context.userRole || 'USUARIO'}`,
      `Permissões: ${caps.desc}`,
      context.dataBlock ? `Dados disponíveis: ${context.dataBlock.substring(0, 500)}...` : '',
      fileContexts.length > 0 ? `Arquivos processados: ${fileContexts.map(f => f.name).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    let reasoningText = '';
    try {
      const thinkingResponse = await ai.models.generateContent({
        model,
        config: {
          systemInstruction: THINKING_SYSTEM_PROMPT,
          temperature:       0.3,
          maxOutputTokens:   400,
        },
        contents: [{
          role: 'user',
          parts: [{ text: `CONTEXTO DO SISTEMA:\n${thinkingContext}\n\nMENSAGEM DO USUÁRIO:\n${message || '[arquivo enviado]'}` }]
        }],
      });
      reasoningText = (thinkingResponse.text || '').trim();
    } catch (thinkErr) {
      console.warn('[Thinking] Falha ao gerar pensamento:', thinkErr.message);
      // Fallback: gera pensamento mínimo local
      reasoningText = `**Analisando a Solicitação**\n\nProcessando a mensagem do usuário e preparando a resposta.\n\n**Verificando Contexto**\n\nAcessando dados disponíveis do sistema para formular uma resposta precisa.`;
    }

    // Emite o reasoning em streaming
    await emitReasoningStreamed(onStep, reasoningText);

    // ── ETAPA 3: Monta prompt completo para RESPOSTA FINAL ────────────────────
    let injectPrompt = message || '[arquivo enviado sem texto]';
    if (fileContexts.length > 0) {
      injectPrompt += `\n\n[ARQUIVOS LIDOS]:\n${fileContexts.map(f => `[${f.name}]:\n${(f.context || '').substring(0, 6000)}`).join('\n\n')}`;
    }
    // Injeta o pensamento gerado como contexto adicional
    injectPrompt += `\n\n[MEU RACIOCÍNIO INTERNO JÁ FEITO]:\n${reasoningText}\n\nAgora gere a resposta final coerente baseada nesse raciocínio.`;

    const responseConfig = {
      systemInstruction: buildResponseSystemInstruction({ ...context, fileContexts, pageBaseUrl }),
      temperature:       0.25,
      maxOutputTokens:   2000,
    };
    responseConfig.tools = needsWebSearch(message) ? [{ googleSearch: {} }] : buildTools(context.userRole);

    const geminiHistory = buildGeminiHistory(history);
    let contents = [...geminiHistory, { role: 'user', parts: [{ text: injectPrompt }] }];
    let response = await ai.models.generateContent({ model, config: responseConfig, contents });

    // ── ETAPA 4: Function Calling loop ────────────────────────────────────────
    const toolsExecutadas = [];
    let callCount = 0;
    while (response.functionCalls?.length > 0 && callCount < 5) {
      callCount++;
      const call    = response.functionCalls[0];
      const toolKey = globalStepKey++;
      toolsExecutadas.push(call.name);

      await emitStep(onStep, `Consultando sistema: ${call.name}…`, call.name, 300);
      contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] });

      const apiResult = await executeTool(call.name, call.args, userId, context.userRole, pageBaseUrl);
      const ok        = !apiResult?.erro;
      await emitDone(onStep, toolKey, 200);
      if (onStep) onStep({ type: 'tool_result', tool: call.name, ok, msg: ok ? 'Concluído' : `Erro: ${apiResult?.erro}` });

      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: apiResult } }] });
      response = await ai.models.generateContent({ model, config: responseConfig, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply: '⚠️ Resposta vazia. Tente novamente.', sources: [], reasoning: reasoningText, toolsExecutadas };

    await extractCodeBlocksAndSave(context.sessionId, raw, message || '');

    const reply  = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .filter(c => c.web?.uri)
      .map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri }))
      .slice(0, 3);

    return { reply, sources, reasoning: reasoningText, toolsExecutadas };

  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1)
      return buildAnswerStream(message, history, context, onStep, 2);
    console.error('[buildAnswerStream]', error.message);
    return { reply: '⚠️ Erro no processamento. Tente novamente.', sources: [], reasoning: null, toolsExecutadas: [] };
  }
}

export const sendChatMessage = buildAnswerStream;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/(```[\s\S]*?```)/g, m => m.replace(/\n/g, '___LB___'))
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/___LB___/g, '\n')
    .trim();
}

function cleanMetaText(t) {
  return t
    .replace(/^(Claro[,!]\s*)/i, '')
    .replace(/^(Com certeza[,!]\s*)/i, '')
    .replace(/^(Ótima pergunta[,!]\s*)/i, '')
    .replace(/^\[MEU RACIOCÍNIO.*?\].*?\n/s, '')
    .trim();
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