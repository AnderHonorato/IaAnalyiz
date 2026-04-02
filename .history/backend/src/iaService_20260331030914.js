// backend/src/iaService.js 

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryKnowledge, saveKnowledge } from './ia-engine/knowledge.js';
import { runOrchestrator } from './ia/brain/agents/agentOrchestrator.js';

const prisma    = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let SKILL_CONTENT = '';
try {
  SKILL_CONTENT = fs.readFileSync(path.join(__dirname, 'skills', 'SKILL.md'), 'utf-8');
  console.log('\x1b[35m[IA-Skill] SKILL.md carregado ✓\x1b[0m');
} catch {
  console.warn('[IA-Skill] SKILL.md não encontrado — usando instruções padrão.');
}

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;
const MAX_FILES             = 10;
const REASONING_CHUNK_SIZE  = 5;
const REASONING_CHUNK_DELAY = 2;

const CHAIN_OF_THOUGHT_PROMPT = `
=== INSTRUÇÕES INTERNAS DE RACIOCÍNIO (NUNCA EXIBA PARA O USUÁRIO) ===

Você DEVE pensar passo a passo internamente ANTES de gerar a resposta final.
Faça todo o raciocínio completo na sua cabeça, mas NUNCA inclua nenhum bloco de pensamento,
skill, classificação, "Chain of Thought", "Analisando intenção" ou qualquer texto de raciocínio
na mensagem enviada ao usuário.

Regras obrigatórias:
- O raciocínio é 100% interno.
- A resposta final deve ser APENAS a mensagem útil e clara.
- Para DESTACAR informações cruciais, lucros, erros ou alertas, VOCÊ PODE E DEVE colorir o texto usando tags HTML in-line.
  * Exemplos válidos de cores: <span style="color: #ef4444; font-weight: bold;">texto em vermelho</span> ou <span style="color: #10b981;">verde de sucesso</span>.
  * Exemplos de marca-texto: <mark style="background-color: #fef08a; color: #1e293b; padding: 0 4px; border-radius: 4px;">texto com fundo amarelo</mark>.
- Nunca use o formato de blocos de pensamento na saída final.

Após o raciocínio interno, entregue diretamente a resposta estilizada para o usuário.
`;

let isAutonomousLearningActive = false;
let autonomousLearningInterval = null;

async function loopAprendizadoAutonomo() {
  if (!isAutonomousLearningActive) return;
  try {
    const ai = getClient();
    const promptTopic = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{role: 'user', parts: [{text: 'Gere uma pergunta complexa e inédita ou um desafio sobre engenharia de software, machine learning ou mercado financeiro, focado em prever lógicas e contextos. Máximo de 40 palavras.'}]}]
    });
    const pergunta = promptTopic.text;

    const localDocs = await queryKnowledge(pergunta, 3);
    const answerContext = localDocs.map(d => d.content).join('\n');

    const promptAnswer = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{role: 'user', parts: [{text: `Aja como um modelo local aprendendo a deduzir respostas (prever o próximo token/contexto). Responda a esta pergunta baseando-se APENAS neste contexto local (se vazio, deduza logicamente):\n\nContexto: ${answerContext}\n\nPergunta: ${pergunta}`}]}]
    });
    const respostaLocal = promptAnswer.text;

    const promptValidation = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{role: 'user', parts: [{text: `Avalie esta dedução. Se estiver errada ou alucinada, corrija. Se estiver boa, aperfeiçoe.\nPergunta: ${pergunta}\nResposta proposta: ${respostaLocal}\n\nDê uma nota de 0 a 100 baseada na precisão e utilidade.\nFormato estrito:\nNOTA: [valor]\nCONHECIMENTO_CONSOLIDADO: [texto a ser salvo no banco]`}]}]
    });

    const avaliacao = promptValidation.text;
    const notaMatch = avaliacao.match(/NOTA:\s*(\d+)/);
    const nota = notaMatch ? parseInt(notaMatch[1]) : 0;

    if (nota >= 65) {
      const conteudoFinalMatch = avaliacao.match(/CONHECIMENTO_CONSOLIDADO:([\s\S]*)/);
      const conteudoFinal = conteudoFinalMatch ? conteudoFinalMatch[1].trim() : respostaLocal;
      await saveKnowledge(`auto_learn_${Date.now()}`, `Q: ${pergunta}\nA: ${conteudoFinal}`, 'autonomous', nota / 100);
    }
  } catch (error) {}

  if (isAutonomousLearningActive) {
    autonomousLearningInterval = setTimeout(loopAprendizadoAutonomo, 45000); 
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function emitReasoningStreamed(onStep, text) {
  if (!onStep || !text) return;
  onStep({ type: 'reasoning_start', action: 'reasoning_start' });
  for (let i = 0; i < text.length; i += REASONING_CHUNK_SIZE) {
    onStep({ type: 'reasoning_chunk', action: 'reasoning_chunk', text: text.slice(i, i + REASONING_CHUNK_SIZE) });
    await sleep(REASONING_CHUNK_DELAY);
  }
  onStep({ type: 'reasoning_end', action: 'reasoning_end', fullText: text });
}

async function emitStep(onStep, msg, tool, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type: 'step', action: 'step', msg, tool });
}

async function emitDone(onStep, stepKey, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type: 'step_done', action: 'step_done', stepIndex: stepKey });
}

function emitAgentStart(onStep, agente, mensagem) {
  if (onStep) onStep({ type: 'agent_start', action: 'agent_start', agente, mensagem });
}

function emitAgentEnd(onStep) {
  if (onStep) onStep({ type: 'agent_end', action: 'agent_end' });
}

export const PAGE_CATALOG = {
  '/':             { titulo:'Home / Dashboard',         desc:'Visão geral do sistema, métricas principais' },
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

function buildTools(userRole) {
  const isPriv = userRole === 'OWNER' || userRole === 'ADMIN';
  const tools  = [
    { name:'listarDivergenciasAtivas',   description:'Lista divergências ativas.',             parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, status:{ type:'STRING' } } } },
    { name:'enviarParaFilaDeCorrecao',   description:'Envia divergência para correção.',       parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'ignorarDivergencia',         description:'Marca divergência como IGNORADA.',       parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'marcarDivergenciaCorrigida', description:'Marca como CORRIGIDO manualmente.',      parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'enviarLoteDivergencias',     description:'Envia TODAS as pendentes.',              parameters:{ type:'OBJECT', properties:{} } },
    { name:'consultarAgendador',         description:'Verifica agendador automático.',         parameters:{ type:'OBJECT', properties:{} } },
    { name:'ativarAgendador',            description:'Ativa varredura automática.',            parameters:{ type:'OBJECT', properties:{ intervaloMinutos:{ type:'INTEGER' } }, required:['intervaloMinutos'] } },
    { name:'desativarAgendador',         description:'Desativa varredura automática.',         parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarProdutos',             description:'Lista produtos do catálogo.',            parameters:{ type:'OBJECT', properties:{ busca:{ type:'STRING' }, limite:{ type:'INTEGER' }, semPeso:{ type:'BOOLEAN' }, semVinculo:{ type:'BOOLEAN' } } } },
    { name:'listarAvisosML',             description:'Lista avisos ativos do ML.',             parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' } } } },
    { name:'consultarStatusConexaoML',   description:'Verifica conexão ML.',                   parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarHistoricoPrecos',      description:'Lista histórico de preços.',             parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, mlItemId:{ type:'STRING' } } } },
    { name:'resumoGeral',                description:'Retorna métricas gerais.',               parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarPaginasDisponiveis',   description:'Lista páginas acessíveis.',              parameters:{ type:'OBJECT', properties:{} } },
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

async function generateLocalStreamingResponse(message, onStep) {
  const best       = await queryKnowledge(message, 3);
  const content    = best.length > 0 ? best.map(m=>m.content).join(' ') : 'Não encontrei dados locais suficientes.';
  const confidence = best.length > 0 ? Math.round(best[0].confidence*100) : 10;
  
  const reasoning  = `Estou operando no Modo Autônomo. Busquei no banco vetorial local e encontrei ${best.length} resultado(s) correspondentes com ${confidence}% de confiança.`;
  await emitReasoningStreamed(onStep, reasoning);
  
  return { reply:`<b>[Analyiz — Modo Autônomo]</b><br><br>${content}<br><br><i>Confiança local: ${confidence}%</i>`, sources:[], reasoning, toolsExecutadas:[] };
}

async function processarLivroEAprender(fileContexts, onStep) {
  const reasoning = `Detectei o comando de ingestão profunda. Vou dividir os ${fileContexts.length} arquivo(s) em pequenos blocos de memória e inseri-los no banco vetorial local para indexação permanente.`;
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

export async function buildAnswerStream(message, history = [], context = {}, onStep, attempt = 1) {
  const userId = context.usuarioAtual?.id || 0;
  const user   = await prisma.usuario.findUnique({ where:{ id:parseInt(userId) }, select:{ geminiAtivo:true, role:true } }).catch(()=>null);
  const geminiAtivo = user?.geminiAtivo ?? true;
  const isOwner     = user?.role === 'OWNER';

  if (isOwner && message) {
    const ml = message.toLowerCase();
    if (ml.match(/iniciar aprendizado/)) {
      isAutonomousLearningActive = true;
      loopAprendizadoAutonomo(); 
      return { reply:'<b>🧠 Aprendizado Autônomo Iniciado.</b>', sources:[], reasoning:'', toolsExecutadas:[] };
    }
    if (ml.match(/parar aprendizado/)) {
      isAutonomousLearningActive = false;
      clearTimeout(autonomousLearningInterval);
      return { reply:'<b>🛑 Aprendizado Autônomo Interrompido.</b>', sources:[], reasoning:'', toolsExecutadas:[] };
    }
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

    if (context.signal?.aborted) throw new Error('AbortError');

    // Removemos a chamada antiga ao buildDynamicReasoning e deixamos o orquestrador fazer a magia.
    const runResult = await runOrchestrator(message, history, context, onStep, async (msgToBuild, histRaw, ctxEnriquecido) => {
        let injectPrompt = msgToBuild || '[arquivo enviado sem texto]';
        if (fileContexts.length > 0) {
          injectPrompt += `\n\n[ARQUIVOS LIDOS]:\n${fileContexts.map(f=>`[${f.name}]:\n${(f.context||'').substring(0,6000)}`).join('\n\n')}`;
        }
        
        const config = {
          systemInstruction: buildSystemInstruction({ ...ctxEnriquecido, fileContexts, pageBaseUrl }),
          temperature:       0.25,
          maxOutputTokens:   2000,
          tools:             buildTools(ctxEnriquecido.userRole),
        };

        const geminiHistory = buildGeminiHistory(histRaw);
        let contents  = [...geminiHistory, { role:'user', parts:[{ text:injectPrompt }] }];
        
        let response = await ai.models.generateContent({ model: attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL, config, contents });

        const toolsExecutadasMãe = [];
        let callCount = 0;
        while (response.functionCalls?.length > 0 && callCount < 5) {
          if (ctxEnriquecido.signal?.aborted) throw new Error('AbortError');
          callCount++;
          const call    = response.functionCalls[0];
          const toolKey = globalStepKey++;
          toolsExecutadasMãe.push(call.name);
          
          emitAgentStart(onStep, 'banco', `Consultando sistema: ${call.name}...`);
          await emitStep(onStep, `Consultando sistema: ${call.name}…`, call.name, 300);
          
          contents.push({ role:'model', parts:[{ functionCall:{ name:call.name, args:call.args } }] });
          const apiResult = await executeTool(call.name, call.args, userId, ctxEnriquecido.userRole, pageBaseUrl);
          const ok        = !apiResult?.erro;
          
          await emitDone(onStep, toolKey, 200);
          if (onStep) onStep({ type:'tool_result', action: 'tool_result', tool:call.name, ok, msg:ok?'Concluído':`Erro: ${apiResult?.erro}` });
          emitAgentEnd(onStep);

          contents.push({ role:'user', parts:[{ functionResponse:{ name:call.name, response:apiResult } }] });
          response = await ai.models.generateContent({ model: attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL, config, contents });
        }

        const raw = response.text?.trim();
        if (!raw) return { reply:'⚠️ Resposta vazia. Tente novamente.', sources:[], toolsExecutadas: toolsExecutadasMãe };

        await extractCodeBlocksAndSave(ctxEnriquecido.sessionId, raw, msgToBuild||'');

        let replyGerado = cleanMetaText(ensureHTML(raw));

        const localChunks  = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const localSources = localChunks.filter(c=>c.web?.uri).map(c=>({ uri:c.web.uri, title:c.web.title||c.web.uri }));

        return { reply: replyGerado, sources: localSources, toolsExecutadas: toolsExecutadasMãe };
    });

    const finalSources = [...(runResult.fontes || []), ...(runResult.sources || [])].slice(0, 5);

    if (context.sessionId) {
        try {
            await prisma.chatDocument.create({ 
                data: {
                    sessionId: context.sessionId,
                    filename: 'swarm_log_' + Date.now(),
                    tipo: 'system',
                    content: JSON.stringify(runResult.toolsExecutadas)
                }
            });
        } catch(e) {}
    }

    return { 
        reply: runResult.reply, 
        sources: finalSources, 
        fontes: finalSources, 
        reasoning: runResult.reasoning,
        toolsExecutadas: runResult.toolsExecutadas 
    };

  } catch (error) {
    if (error.message === 'AbortError') return { reply:'⚠️ Geração interrompida pelo usuário.', sources:[], reasoning:null, toolsExecutadas:[] };
    if ((error?.status===429||String(error).includes('429'))&&attempt===1) return buildAnswerStream(message, history, context, onStep, 2);
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