// backend/src/iaService.js — v5: Fix result bug, todos tipos de arquivo, navegação de página, Raciocínio Corrigido e Skills

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;
const MAX_FILES             = 10;

export const PAGE_CATALOG = {
  '/':             { titulo:'Home / Dashboard',          desc:'Visão geral do sistema, métricas principais, cards de acesso rápido' },
  '/ml':           { titulo:'Mercado Livre — Dashboard', desc:'Cards de acesso para ferramentas ML: Radar de Fretes, Precificação, Pesquisa, Meus Anúncios' },
  '/ml/auditoria': { titulo:'Radar de Fretes',          desc:'Scanner de divergências de peso/frete nos anúncios ML' },
  '/ml/precos':    { titulo:'Precificação ML',           desc:'Gerenciamento de preços dos anúncios ML. Histórico de preços, atualização em lote' },
  '/ml/pesquisa':  { titulo:'Pesquisa de Anúncios',     desc:'Pesquisa de anúncios do ML por link ou ID. Mostra preços, vendedores, concorrentes' },
  '/ml/anuncios':  { titulo:'Meus Anúncios ML',         desc:'Lista anúncios do próprio usuário no ML. Filtros por status, exportação CSV' },
  '/shopee':       { titulo:'Shopee',                   desc:'Integração com Shopee (em desenvolvimento)' },
  '/amazon':       { titulo:'Amazon',                   desc:'Integração com Amazon (em desenvolvimento)' },
  '/usuarios':     { titulo:'Gerenciamento de Usuários',desc:'Lista e gerencia usuários. Aprovar/bloquear acesso. Alterar roles' },
};

const ROLE_CAPABILITIES = {
  BLOQUEADO: { desc:'Sem acesso.', paginasAcesso:[], acoesPermitidas:[], restricoes:[] },
  USUARIO:   { desc:'Acesso às ferramentas do próprio catálogo.', paginasAcesso:['/','/ml','/ml/auditoria','/ml/precos','/ml/pesquisa','/ml/anuncios','/shopee','/amazon'], acoesPermitidas:['ver próprios produtos','ver próprias divergências','corrigir divergências','configurar agendador'], restricoes:['NÃO pode ver dados de outros usuários','NÃO pode aprovar/bloquear usuários'] },
  ADMIN:     { desc:'Acesso ampliado.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['tudo do USUARIO','ver dados de todos os usuários','gerenciar usuários'], restricoes:['NÃO pode excluir usuários permanentemente'] },
  OWNER:     { desc:'Acesso total.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['acesso total a tudo'], restricoes:[] },
};

const TOOLS_BY_ROLE = {
  USUARIO:   ['listarDivergenciasAtivas','enviarParaFilaDeCorrecao','ignorarDivergencia','marcarDivergenciaCorrigida','enviarLoteDivergencias','consultarAgendador','ativarAgendador','desativarAgendador','listarProdutos','listarAvisosML','consultarStatusConexaoML','listarHistoricoPrecos','resumoGeral','listarPaginasDisponiveis','lerPagina'],
  ADMIN:     ['listarDivergenciasAtivas','enviarParaFilaDeCorrecao','ignorarDivergencia','marcarDivergenciaCorrigida','enviarLoteDivergencias','consultarAgendador','ativarAgendador','desativarAgendador','listarProdutos','listarAvisosML','consultarStatusConexaoML','listarHistoricoPrecos','resumoGeral','listarPaginasDisponiveis','lerPagina','listarUsuariosPendentes','aprovarUsuario','bloquearUsuario','resumoGlobalPlataforma'],
  OWNER:     ['listarDivergenciasAtivas','enviarParaFilaDeCorrecao','ignorarDivergencia','marcarDivergenciaCorrigida','enviarLoteDivergencias','consultarAgendador','ativarAgendador','desativarAgendador','listarProdutos','listarAvisosML','consultarStatusConexaoML','listarHistoricoPrecos','resumoGeral','listarPaginasDisponiveis','lerPagina','listarUsuariosPendentes','aprovarUsuario','bloquearUsuario','resumoGlobalPlataforma'],
  BLOQUEADO: [],
};

// ─── Timing por tipo de step ──────────────────────────────────────────────────
const STEP_DELAYS = {
  pdf_opening:800, pdf_extracting:1200, pdf_done:400,
  excel_opening:600, excel_analyzing:1000, excel_done:300,
  txt_reading:300, txt_done:200,
  audio_receiving:500, audio_transcribing:2000, audio_done:400,
  image_analyzing:700, image_done:300,
  db_query_fast:400, db_query_medium:700, db_query_slow:1100,
  db_update:600, db_done:250,
  prep_response:500,
  page_browsing:800, page_reading:1200, page_done:300,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function emitStep(onStep, msg, tool, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type:'step', msg, tool });
}

async function emitDone(onStep, stepKey, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type:'step_done', stepIndex: stepKey });
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function buildGeminiHistory(history) {
  if (!history || !history.length) return [];
  const msgs = history.slice(0, -1);
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur = msgs[i], next = msgs[i+1];
    if (cur.role === 'user' && next?.role === 'ia') {
      pairs.push({ user:stripHTML(cur.content).substring(0,800), model:stripHTML(next.content).substring(0,800) });
      i += 2;
    } else { i++; }
  }
  const result = [];
  for (const p of pairs.slice(-MAX_PAIRS)) {
    result.push({ role:'user',  parts:[{ text:p.user }] });
    result.push({ role:'model', parts:[{ text:p.model }] });
  }
  return result;
}

export function needsWebSearch(message) {
  if (!message) return false;
  return /mercado\s*livre|ml\s*api|taxa|tarifa|comiss[ãa]o|frete|envio|correios|transportadora|tabela|política|regras?\s*do\s*ml|como\s+(vender|anunciar|calcular)|o\s+que\s+(é|são)\s+(o\s+)?ml|novidades?\s*(do|no)\s*ml|hora|horas|hoje|agora|clima|câmbio|dólar|notícia|busca|pesquis/i.test(message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESSAMENTO DE ARQUIVOS
// ═══════════════════════════════════════════════════════════════════════════════

async function extractPDF(base64, fileName) {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature:0, maxOutputTokens:4000 },
      contents: [{ role:'user', parts:[
        { text:`Extraia TODO o conteúdo textual deste PDF. Preserve tabelas, listas e estrutura. Arquivo: ${fileName}` },
        { inlineData:{ mimeType:'application/pdf', data:base64 } },
      ]}],
    });
    return response.text?.trim() || null;
  } catch (e) { console.warn('[PDF Extract]', e.message); return null; }
}

async function extractExcel(base64, mimeType, fileName) {
  try {
    const ai = getClient();
    if (mimeType === 'text/csv') {
      const text = Buffer.from(base64, 'base64').toString('utf-8').substring(0, 8000);
      const response = await ai.models.generateContent({
        model:GEMINI_MODEL, config:{temperature:0,maxOutputTokens:2000},
        contents:[{role:'user',parts:[{text:`Analise este CSV: estrutura e dados principais. Arquivo: ${fileName}\n\n${text}`}]}],
      });
      return response.text?.trim() || null;
    }
    const response = await ai.models.generateContent({
      model:GEMINI_MODEL, config:{temperature:0,maxOutputTokens:4000},
      contents:[{role:'user',parts:[
        {text:`Extraia e organize os dados desta planilha: abas, cabeçalhos, dados principais, totais. Arquivo: ${fileName}`},
        {inlineData:{mimeType,data:base64}},
      ]}],
    });
    return response.text?.trim() || null;
  } catch (e) {
    console.warn('[Excel Extract]', e.message);
    try { return Buffer.from(base64,'base64').toString('utf-8').substring(0,5000); } catch { return null; }
  }
}

function extractTXT(base64, fileName) {
  try {
    return `Conteúdo de ${fileName}:\n${Buffer.from(base64,'base64').toString('utf-8').substring(0,10000)}`;
  } catch (e) { console.warn('[TXT Extract]', e.message); return null; }
}

async function transcribeAudio(base64, mimeType, fileName) {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model:GEMINI_MODEL, config:{temperature:0,maxOutputTokens:3000},
      contents:[{role:'user',parts:[
        {text:`Transcreva este áudio em português. Seja fiel. Arquivo: ${fileName}`},
        {inlineData:{mimeType,data:base64}},
      ]}],
    });
    return response.text?.trim() || null;
  } catch (e) { console.warn('[Audio Transcribe]', e.message); return null; }
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model:GEMINI_MODEL, config:{temperature:0.2,maxOutputTokens:600},
      contents:[{role:'user',parts:[
        {text:userQuestion||'Descreva esta imagem detalhadamente.'},
        {inlineData:{mimeType,data:base64}},
      ]}],
    });
    return response.text?.trim() || null;
  } catch { return null; }
}

// ── Navegação de página (lê HTML do site) ─────────────────────────────────────
async function fetchPageContent(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AnalyizBot/1.0)', 'Accept': 'text/html' },
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const clean = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
      .substring(0, 8000);
    return clean || null;
  } catch (e) {
    console.warn('[PageFetch]', e.message);
    return null;
  }
}

export async function processFileToContext(file, userMessage, onStep, baseStepKey = 0) {
  const { base64, mimeType, name, group } = file;
  let context = null;
  let fileTypeLabel = '';
  let stepKeyLocal = baseStepKey;

  const step = async (msg, delayBefore = 0) => {
    await emitStep(onStep, msg, null, delayBefore);
    return stepKeyLocal++;
  };

  const done = async (key, delayMs = STEP_DELAYS.db_done) => {
    await emitDone(onStep, key, delayMs);
  };

  switch (group) {
    case 'image': {
      fileTypeLabel = 'imagem';
      const k1 = await step(`Analisando imagem "${name}"...`, STEP_DELAYS.image_analyzing);
      context = await analyzeImage(base64, mimeType, userMessage || '');
      await done(k1, STEP_DELAYS.image_done);
      const k2 = await step(context ? `Imagem "${name}" interpretada` : `Não foi possível extrair conteúdo de "${name}"`, 0);
      await done(k2, STEP_DELAYS.db_done);
      break;
    }

    case 'pdf': {
      fileTypeLabel = 'PDF';
      const k1 = await step(`Abrindo documento PDF "${name}"...`, STEP_DELAYS.pdf_opening);
      await done(k1, STEP_DELAYS.db_done);
      const k2 = await step(`Extraindo texto e estrutura do documento...`, STEP_DELAYS.pdf_extracting);
      context = await extractPDF(base64, name);
      await done(k2, STEP_DELAYS.pdf_done);
      const words = context ? context.split(/\s+/).length : 0;
      const k3 = await step(context ? `PDF "${name}" processado — ${words.toLocaleString('pt-BR')} palavras` : `Não foi possível extrair texto de "${name}"`, 0);
      await done(k3, STEP_DELAYS.db_done);
      break;
    }

    case 'excel': {
      fileTypeLabel = mimeType === 'text/csv' ? 'CSV' : 'planilha Excel';
      const k1 = await step(`Abrindo ${fileTypeLabel} "${name}"...`, STEP_DELAYS.excel_opening);
      await done(k1, STEP_DELAYS.db_done);
      const k2 = await step(`Identificando abas, colunas e estrutura de dados...`, STEP_DELAYS.excel_analyzing);
      context = await extractExcel(base64, mimeType, name);
      await done(k2, STEP_DELAYS.excel_done);
      const k3 = await step(context ? `${fileTypeLabel} "${name}" analisada com sucesso` : `Não foi possível processar "${name}"`, 0);
      await done(k3, STEP_DELAYS.db_done);
      break;
    }

    case 'txt': {
      fileTypeLabel = 'texto';
      const k1 = await step(`Lendo conteúdo do arquivo "${name}"...`, STEP_DELAYS.txt_reading);
      context = extractTXT(base64, name);
      await done(k1, STEP_DELAYS.txt_done);
      if (context) {
        const lines = context.split('\n').length;
        const k2 = await step(`"${name}" lido — ${lines} linhas`, 0);
        await done(k2, STEP_DELAYS.db_done);
      }
      break;
    }

    case 'audio': {
      fileTypeLabel = 'áudio';
      const k1 = await step(`Recebendo arquivo de áudio "${name}"...`, STEP_DELAYS.audio_receiving);
      await done(k1, STEP_DELAYS.db_done);
      const k2 = await step(`Transcrevendo áudio para texto...`, STEP_DELAYS.audio_transcribing);
      context = await transcribeAudio(base64, mimeType, name);
      await done(k2, STEP_DELAYS.audio_done);
      const words = context ? context.split(/\s+/).length : 0;
      const k3 = await step(context ? `Áudio "${name}" transcrito — ${words} palavras` : `Não foi possível transcrever "${name}"`, 0);
      await done(k3, STEP_DELAYS.db_done);
      break;
    }

    default: {
      const k1 = await step(`Tipo não reconhecido: "${name}"`, 0);
      await done(k1, STEP_DELAYS.db_done);
      break;
    }
  }

  const stepsUsed = stepKeyLocal - baseStepKey;
  return { context, label:fileTypeLabel, name, stepsUsed };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION CALLING (TOOLS)
// ═══════════════════════════════════════════════════════════════════════════════

function buildTools(userRole) {
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
  const tools = [
    { name:'listarDivergenciasAtivas', description:'Lista divergências de frete/peso que precisam de correção.', parameters:{type:'OBJECT',properties:{limite:{type:'INTEGER'},status:{type:'STRING'}}} },
    { name:'enviarParaFilaDeCorrecao', description:'Marca uma divergência como PENDENTE_ENVIO.', parameters:{type:'OBJECT',properties:{divergenciaId:{type:'INTEGER'}},required:['divergenciaId']} },
    { name:'ignorarDivergencia', description:'Marca uma divergência como IGNORADA.', parameters:{type:'OBJECT',properties:{divergenciaId:{type:'INTEGER'}},required:['divergenciaId']} },
    { name:'marcarDivergenciaCorrigida', description:'Marca uma divergência como CORRIGIDO manualmente.', parameters:{type:'OBJECT',properties:{divergenciaId:{type:'INTEGER'}},required:['divergenciaId']} },
    { name:'enviarLoteDivergencias', description:'Envia TODAS as divergências PENDENTE para a fila de correção.', parameters:{type:'OBJECT',properties:{}} },
    { name:'consultarAgendador', description:'Verifica se varredura automática está ativa.', parameters:{type:'OBJECT',properties:{}} },
    { name:'ativarAgendador', description:'Liga a varredura automática.', parameters:{type:'OBJECT',properties:{intervaloMinutos:{type:'INTEGER'}},required:['intervaloMinutos']} },
    { name:'desativarAgendador', description:'Desliga a varredura automática.', parameters:{type:'OBJECT',properties:{}} },
    { name:'listarProdutos', description:'Lista produtos do catálogo.', parameters:{type:'OBJECT',properties:{busca:{type:'STRING'},limite:{type:'INTEGER'},semPeso:{type:'BOOLEAN'},semVinculo:{type:'BOOLEAN'}}} },
    { name:'listarAvisosML', description:'Lista avisos ativos do Mercado Livre.', parameters:{type:'OBJECT',properties:{limite:{type:'INTEGER'}}} },
    { name:'consultarStatusConexaoML', description:'Verifica se conta ML está conectada.', parameters:{type:'OBJECT',properties:{}} },
    { name:'listarHistoricoPrecos', description:'Lista histórico de preços.', parameters:{type:'OBJECT',properties:{limite:{type:'INTEGER'},mlItemId:{type:'STRING'}}} },
    { name:'resumoGeral', description:'Retorna resumo geral do sistema.', parameters:{type:'OBJECT',properties:{}} },
    { name:'listarPaginasDisponiveis', description:'Lista páginas disponíveis para o usuário.', parameters:{type:'OBJECT',properties:{}} },
    {
      name:'lerPagina',
      description:'Acessa e lê o conteúdo de uma página do sistema (local ou online). Use quando o usuário perguntar sobre o conteúdo de uma página, quiser saber o que há em determinada URL, ou precisar de informações visíveis na tela.',
      parameters:{
        type:'OBJECT',
        properties:{
          caminho:{type:'STRING', description:'Caminho da página (ex: "/ml/auditoria") ou URL completa (ex: "http://localhost:5173/ml")'},
          descricaoContexto:{type:'STRING', description:'O que o usuário quer saber sobre a página'},
        },
        required:['caminho'],
      },
    },
  ];
  if (isPrivileged) {
    tools.push(
      { name:'listarUsuariosPendentes', description:'Lista usuários aguardando aprovação.', parameters:{type:'OBJECT',properties:{}} },
      { name:'aprovarUsuario', description:'Aprova o acesso de um usuário bloqueado.', parameters:{type:'OBJECT',properties:{usuarioId:{type:'INTEGER'}},required:['usuarioId']} },
      { name:'bloquearUsuario', description:'Bloqueia o acesso de um usuário.', parameters:{type:'OBJECT',properties:{usuarioId:{type:'INTEGER'}},required:['usuarioId']} },
      { name:'resumoGlobalPlataforma', description:'Retorna métricas globais. Apenas ADMIN/OWNER.', parameters:{type:'OBJECT',properties:{}} },
    );
  }
  return [{ functionDeclarations:tools }];
}

async function executeTool(name, args, userId, userRole, pageBaseUrl) {
  const uid = parseInt(userId);
  if (!uid && name !== 'lerPagina') return { erro:'Usuário não identificado' };
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  try {
    switch (name) {
      case 'listarDivergenciasAtivas': {
        const limite = Math.min(args.limite||5,20);
        const where  = { usuarioId:uid };
        if (args.status) where.status = args.status;
        else where.status = { in:['PENDENTE','REINCIDENTE','PENDENTE_ENVIO'] };
        const divs = await prisma.divergencia.findMany({ where, take:limite, orderBy:{createdAt:'desc'}, select:{id:true,mlItemId:true,titulo:true,pesoMl:true,pesoLocal:true,status:true,motivo:true} });
        if (!divs.length) return { mensagem:'Nenhuma divergência ativa.' };
        return { divergenciasEncontradas:divs, total:divs.length };
      }
      case 'enviarParaFilaDeCorrecao': {
        const div = await prisma.divergencia.findFirst({ where:{id:parseInt(args.divergenciaId),usuarioId:uid} });
        if (!div) return { erro:'Divergência não encontrada.' };
        await prisma.divergencia.update({ where:{id:div.id}, data:{status:'PENDENTE_ENVIO'} });
        return { sucesso:true, mensagem:`${div.mlItemId} enviada para fila.` };
      }
      case 'ignorarDivergencia': {
        const div = await prisma.divergencia.findFirst({ where:{id:parseInt(args.divergenciaId),usuarioId:uid} });
        if (!div) return { erro:'Divergência não encontrada.' };
        await prisma.divergencia.update({ where:{id:div.id}, data:{status:'IGNORADO',resolvido:true} });
        return { sucesso:true, mensagem:`${div.mlItemId} marcada como ignorada.` };
      }
      case 'marcarDivergenciaCorrigida': {
        const div = await prisma.divergencia.findFirst({ where:{id:parseInt(args.divergenciaId),usuarioId:uid} });
        if (!div) return { erro:'Divergência não encontrada.' };
        await prisma.divergencia.update({ where:{id:div.id}, data:{status:'CORRIGIDO',resolvido:true,corrigidoManual:true} });
        await prisma.divergenciaHistorico.create({ data:{divergenciaId:div.id,usuarioId:uid,acao:'CORRIGIDO_MANUAL',descricao:'Corrigido via chat'} }).catch(()=>{});
        return { sucesso:true, mensagem:`${div.mlItemId} marcado como corrigido.` };
      }
      case 'enviarLoteDivergencias': {
        const res = await prisma.divergencia.updateMany({ where:{usuarioId:uid,status:'PENDENTE'}, data:{status:'PENDENTE_ENVIO'} });
        return { sucesso:true, mensagem:`${res.count} divergência(s) enviada(s) para fila.` };
      }
      case 'consultarAgendador': {
        const ag = await prisma.agendadorConfig.findUnique({ where:{usuarioId:uid} });
        if (!ag) return { mensagem:'Nenhum agendador configurado.' };
        return { status:ag.ativo?'Ativo':'Inativo', intervaloMinutos:ag.intervalo, ultimaExecucao:ag.ultimaExecucao, proximaExecucao:ag.proximaExecucao };
      }
      case 'ativarAgendador': {
        const min = parseInt(args.intervaloMinutos)||360;
        await prisma.agendadorConfig.upsert({ where:{usuarioId:uid}, update:{ativo:true,intervalo:min}, create:{usuarioId:uid,ativo:true,intervalo:min} });
        return { sucesso:true, mensagem:`Agendador ativado (a cada ${min}min).` };
      }
      case 'desativarAgendador': {
        await prisma.agendadorConfig.upsert({ where:{usuarioId:uid}, update:{ativo:false}, create:{usuarioId:uid,ativo:false,intervalo:360} });
        return { sucesso:true, mensagem:'Agendador desativado.' };
      }
      case 'listarProdutos': {
        const limite = Math.min(args.limite||10,30);
        const where  = { usuarioId:uid };
        if (args.semPeso)    where.pesoGramas = 0;
        if (args.semVinculo) where.mlItemId   = null;
        if (args.busca) where.OR = [{ nome:{contains:args.busca,mode:'insensitive'} },{ sku:{contains:args.busca,mode:'insensitive'} }];
        const produtos = await prisma.produto.findMany({ where, take:limite, orderBy:{id:'desc'}, select:{id:true,sku:true,nome:true,preco:true,pesoGramas:true,mlItemId:true,status:true,eKit:true} });
        return { produtos, totalNoCatalogo:await prisma.produto.count({where:{usuarioId:uid}}), exibindo:produtos.length };
      }
      case 'listarAvisosML': {
        const avisos = await prisma.avisoML.findMany({ where:{usuarioId:uid,resolvido:false}, take:Math.min(args.limite||5,20), orderBy:{createdAt:'desc'}, select:{id:true,mlItemId:true,titulo:true,tipoAviso:true,mensagem:true,severidade:true} }).catch(()=>[]);
        if (!avisos.length) return { mensagem:'Nenhum aviso ativo.' };
        return { avisos, total:avisos.length };
      }
      case 'consultarStatusConexaoML': {
        const token = await prisma.mlToken.findUnique({ where:{usuarioId:uid}, select:{nickname:true,expiresAt:true,mlUserId:true} });
        if (!token) return { conectado:false, mensagem:'Conta ML não conectada.' };
        const expirou = new Date() >= new Date(token.expiresAt);
        return { conectado:!expirou, nickname:token.nickname, status:expirou?'Token expirado':'Conectado e válido' };
      }
      case 'listarHistoricoPrecos': {
        const where = { usuarioId:uid };
        if (args.mlItemId) where.mlItemId = args.mlItemId;
        const historico = await prisma.precificacaoHistorico.findMany({ where, take:Math.min(args.limite||5,20), orderBy:{criadoEm:'desc'}, select:{mlItemId:true,titulo:true,preco:true,quantidade:true,criadoEm:true} }).catch(()=>[]);
        if (!historico.length) return { mensagem:'Nenhum histórico de preços.' };
        return { historico, total:historico.length };
      }
      case 'resumoGeral': {
        const [totalProd,pend,reinc,corr,ign,penEnvio,avisos,ag,token] = await Promise.all([
          prisma.produto.count({where:{usuarioId:uid}}),
          prisma.divergencia.count({where:{usuarioId:uid,status:'PENDENTE'}}),
          prisma.divergencia.count({where:{usuarioId:uid,status:'REINCIDENTE'}}),
          prisma.divergencia.count({where:{usuarioId:uid,status:'CORRIGIDO'}}),
          prisma.divergencia.count({where:{usuarioId:uid,status:'IGNORADO'}}),
          prisma.divergencia.count({where:{usuarioId:uid,status:'PENDENTE_ENVIO'}}),
          prisma.avisoML.count({where:{usuarioId:uid,resolvido:false}}).catch(()=>0),
          prisma.agendadorConfig.findUnique({where:{usuarioId:uid}}),
          prisma.mlToken.findUnique({where:{usuarioId:uid},select:{nickname:true,expiresAt:true}}),
        ]);
        return { produtos:{total:totalProd}, divergencias:{pendente:pend,reincidente:reinc,corrigido:corr,ignorado:ign,pendenteEnvio:penEnvio,totalAtivas:pend+reinc}, avisosML:avisos, agendador:ag?{ativo:ag.ativo,intervalo:ag.intervalo}:{ativo:false}, conexaoML:token?{nickname:token.nickname,valida:new Date()<new Date(token.expiresAt)}:{conectado:false} };
      }
      case 'listarPaginasDisponiveis': {
        const caps    = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
        const paginas = (caps.paginasAcesso||[]).map(path => ({ caminho:path, ...PAGE_CATALOG[path] }));
        return { paginas, totalAcesso:paginas.length };
      }
      case 'lerPagina': {
        let url = args.caminho || '/';
        if (!url.startsWith('http')) {
          const base = pageBaseUrl || 'http://localhost:5173';
          url = `${base.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
        }
        const content = await fetchPageContent(url);
        if (!content) return { erro:`Não foi possível acessar a página: ${url}` };
        return {
          url,
          conteudo: content,
          resumo: `Página acessada: ${url}. Conteúdo extraído (${content.length} chars).`,
        };
      }
      case 'listarUsuariosPendentes': {
        if (!isPrivileged) return { erro:'Sem permissão.' };
        const pendentes = await prisma.usuario.findMany({ where:{solicitouDesbloqueio:true,role:'BLOQUEADO'}, select:{id:true,nome:true,email:true,createdAt:true} });
        if (!pendentes.length) return { mensagem:'Nenhum usuário aguardando aprovação.' };
        return { usuariosPendentes:pendentes, total:pendentes.length };
      }
      case 'aprovarUsuario': {
        if (!isPrivileged) return { erro:'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where:{id:parseInt(args.usuarioId)} });
        if (!u) return { erro:'Usuário não encontrado.' };
        await prisma.usuario.update({ where:{id:u.id}, data:{role:'USUARIO',solicitouDesbloqueio:false} });
        return { sucesso:true, mensagem:`${u.nome} aprovado.` };
      }
      case 'bloquearUsuario': {
        if (!isPrivileged) return { erro:'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where:{id:parseInt(args.usuarioId)} });
        if (!u) return { erro:'Usuário não encontrado.' };
        if (u.role === 'OWNER') return { erro:'Não é possível bloquear um OWNER.' };
        await prisma.usuario.update({ where:{id:u.id}, data:{role:'BLOQUEADO'} });
        return { sucesso:true, mensagem:`${u.nome} bloqueado.` };
      }
      case 'resumoGlobalPlataforma': {
        if (!isPrivileged) return { erro:'Sem permissão.' };
        const [tu,tp,td,to] = await Promise.all([
          prisma.usuario.count(), prisma.produto.count(),
          prisma.divergencia.count({where:{status:{in:['PENDENTE','REINCIDENTE']}}}),
          prisma.sessaoUsuario.count({where:{ativo:true,entradaEm:{gte:new Date(Date.now()-30*60*1000)}}}).catch(()=>0),
        ]);
        return { totalUsuarios:tu, totalProdutos:tp, divergenciasAtivas:td, usuariosOnline:to };
      }
      default: return { erro:`Função "${name}" não implementada.` };
    }
  } catch (e) { return { erro:`Erro em ${name}: ${e.message}` }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemInstruction(ctx) {
  const { totalProdutos=0, totalDivergencias=0, userRole='USUARIO', usuarioAtual=null,
    isFirstMessage=false, dataBlock=null, fileContexts=[], pageBaseUrl=null } = ctx;
  const caps    = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
  const paginas = (caps.paginasAcesso||[]).map(p => `  • ${p} — ${PAGE_CATALOG[p]?.titulo||p}: ${PAGE_CATALOG[p]?.desc||''}`).join('\n');
  const saudacao = isFirstMessage ? `Cumprimente ${usuarioAtual?.nome||'o usuário'} rapidamente com emoji.` : 'Sem saudações. Direto ao ponto.';
  const baseUrl  = pageBaseUrl || 'http://localhost:5173';

  const fileBlock = fileContexts.length > 0
    ? `\n=== ARQUIVOS PROCESSADOS (${fileContexts.length}) ===\n${fileContexts.map((f,i) => `[${i+1}] ${f.label.toUpperCase()} — "${f.name}":\n${(f.context||'').substring(0,2000)}`).join('\n\n')}\n=== FIM DOS ARQUIVOS ===\n`
    : '';

  return `Você é a IA Analyiz — assistente agêntico especialista em e-commerce e logística.
Usuário: ${usuarioAtual?.nome||'?'} | Cargo: ${userRole} (${caps.desc})

=== SKILLS (HABILIDADES) DA IA ===
Você possui skills específicas baseadas no contexto e nas permissões:
1. Skill Logística: Analisar divergências de peso, fretes do Mercado Livre, usar 'listarDivergenciasAtivas' e 'enviarParaFilaDeCorrecao'.
2. Skill Precificação: Analisar e listar 'listarHistoricoPrecos', comparar custos.
3. Skill Suporte e Gestão: 'lerPagina' para buscar dados da tela atual, ajudar na navegação. Se você for OWNER/ADMIN, usar as ferramentas para gerenciar 'listarUsuariosPendentes'.
Identifique qual skill é necessária baseada na pergunta do usuário e ative a funcionalidade correta de forma restrita ao site. Se for pedido para criar códigos de programação (scripts, JSON, relatórios), envolva-os em blocos de markdown.

=== PÁGINAS ACESSÍVEIS ===
${paginas}

=== DADOS DO SISTEMA ===
${dataBlock || `Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`}
${fileBlock}
=== FERRAMENTA lerPagina ===
Quando o usuário perguntar sobre o conteúdo de uma página do sistema, use lerPagina().
URL base do sistema: ${baseUrl}

=== REGRAS ===
1. CONCISA — máx 2-3 parágrafos. 2. Emojis contextualmente. 3. HTML (<b>,<i>,<br>). 4. ${saudacao}.
5. Se há arquivos processados: analise-os conforme pedido, sendo específico.
6. Sempre que gerar ou criar código-fonte (js, python, html, etc) ou documentos textuais para o usuário exportar, use os blocos delimitadores do markdown \`\`\`linguagem ... \`\`\`. O front-end interceptará esse bloco para exibi-lo num painel lateral especial.
7. Para ações impossíveis no cargo atual: explique claramente a limitação.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REASONING INSTRUCTION (MONÓLOGO INTERIOR)
// ═══════════════════════════════════════════════════════════════════════════════

function buildReasoningInstruction(ctx) {
  const { userRole='USUARIO', usuarioAtual=null, hasFiles=false, fileTypes=[], fileNames=[] } = ctx;
  const caps         = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
  const toolsAvail   = (TOOLS_BY_ROLE[userRole] || []).join(', ');
  const toolsUnavail = [...new Set(Object.values(TOOLS_BY_ROLE).flat())].filter(t => !(TOOLS_BY_ROLE[userRole]||[]).includes(t)).join(', ') || 'nenhuma';

  const TIPO_LABELS = { image:'imagem', pdf:'PDF', excel:'planilha/CSV', txt:'arquivo de texto', audio:'áudio' };
  const fileDetails = hasFiles && fileNames.length > 0
    ? fileNames.map((name, i) => `- "${name}" (${TIPO_LABELS[fileTypes[i]] || fileTypes[i] || 'desconhecido'})`).join('\n')
    : '';

  const nomeUsuario = usuarioAtual?.nome || 'desconhecido';

  return `Você é o MONÓLOGO INTERIOR da IA. Você está PENSANDO, não conversando.
REGRA ABSOLUTA: NUNCA se dirija ao usuário. NUNCA use "Olá", "Você", "Te ajudo", "Obrigado".
Pense como uma máquina ou humano resolvendo um problema silenciosamente antes de agir.
Usuário que enviou o prompt: ${nomeUsuario} | Permissão dele: ${userRole}.
${hasFiles ? `Arquivos detectados na memória:\n${fileDetails}` : ''}
Ferramentas ativas disponíveis: ${toolsAvail || 'nenhuma'}

DIRETRIZES DE PENSAMENTO:
- "O usuário enviou a mensagem X. Preciso verificar qual skill aplicar."
- "Como há arquivos do tipo Y, vou extrair o conteúdo via processador interno."
- "Vou invocar a ferramenta X para buscar a informação solicitada."
- "Não tenho acesso à ferramenta X porque o usuário tem role ${userRole}. Vou precisar negar a ação de forma justificada na resposta final."
- "Pronto, dados coletados. Vou agora formular a resposta final com os resultados estruturados e, se necessário, gerar o código no bloco markdown."

Escreva seu fluxo de pensamento (stream of consciousness) em um único parágrafo fluido, sem títulos, sem emojis, sem formatações markdown. Apenas a linha de raciocínio de processamento crua do sistema.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RACIOCÍNIO EM STREAMING
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateReasoningStream(message, context, onChunk) {
  if (!process.env.GEMINI_API_KEY) return '';
  try {
    const ai = getClient();
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
      config: { systemInstruction:buildReasoningInstruction(context), temperature:0.3, maxOutputTokens:600, thinkingConfig:{thinkingBudget:0} },
      contents: [{ role:'user', parts:[{ text: message || '[mensagem sem texto]' }] }],
    });
    let full = '';
    for await (const chunk of stream) {
      const text = chunk.text || '';
      if (text) { full += text; if (onChunk) onChunk(text); }
    }
    return full.trim();
  } catch (err) {
    console.warn('[Reasoning]', err.message);
    return buildFallbackReasoning(message, context);
  }
}

function buildFallbackReasoning(message, context) {
  const { userRole='USUARIO', totalDivergencias=0, totalProdutos=0, hasFiles=false, fileTypes=[], fileNames=[] } = context;
  const parts = [];

  if (hasFiles && fileNames.length > 0) {
    parts.push(`Arquivos recebidos detectados. Necessário extrair os dados sequencialmente antes da formulação da resposta.`);
  }

  if (/divergen|peso|frete|corrig/i.test(message||'')) {
    parts.push(`Contexto logístico identificado. Total de ${totalDivergencias} divergências. Carregando chamadas de banco de dados para listarDivergenciasAtivas.`);
  } else if (/produto|sku|catálogo/i.test(message||'')) {
    parts.push(`Pesquisa no catálogo identificada. Preparando consulta na base de ${totalProdutos} itens.`);
  } else if (/página|pagina|url|site|acessa/i.test(message||'')) {
    parts.push(`O input requisita inspeção visual de tela. Preparando skill de navegação local com a ferramenta lerPagina.`);
  } else if (/aprovar|bloquear|usuário.*acesso/i.test(message||'')) {
    if (userRole === 'USUARIO') {
      parts.push(`Tentativa de modificação de acessos detectada. O solicitante não possui privilégios de OWNER/ADMIN. Ação será abortada na resposta.`);
    } else {
      parts.push(`Privilégios administrativos confirmados. Invocando listagem de pendentes para resolução.`);
    }
  } else if (!hasFiles) {
    parts.push(`Mapeando intenção do texto fornecido para geração de contexto sem uso de ferramentas complexas.`);
  }

  parts.push(`Finalizando compilação do contexto para o motor principal estruturar a resposta.`);
  return parts.join(' ');
}

function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600" rel="noopener">$1</a>')
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="[https://produto.mercadolivre.com.br/MLB-$1](https://produto.mercadolivre.com.br/MLB-$1)" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/^#{1,6}\s+/gm, '').replace(/^---+$/gm, '')
    // Mantém as quebras de linha dos blocos de código ilesas
    .replace(/(```[\s\S]*?```)/g, (match) => { return match.replace(/\n/g, '___LINEBREAK___'); })
    .replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
    .replace(/___LINEBREAK___/g, '\n')
    .trim();
}
function cleanMetaText(t) { return t.replace(/^(Claro[,!]\s*)/i,'').replace(/^(Com certeza[,!]\s*)/i,'').replace(/^(Entendido[,!]\s*)/i,'').trim(); }
function getFallback() { return '⚠️ Conexão instável. Tente novamente em instantes!'; }

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL STEP CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

const TOOL_STEP_CONFIG = {
  listarDivergenciasAtivas:   { msg:'Consultando divergências ativas no banco de dados...', delay:STEP_DELAYS.db_query_medium },
  enviarParaFilaDeCorrecao:   { msg:'Atualizando status da divergência...', delay:STEP_DELAYS.db_update },
  enviarLoteDivergencias:     { msg:'Enviando todas as divergências para correção automática...', delay:STEP_DELAYS.db_query_slow },
  marcarDivergenciaCorrigida: { msg:'Registrando correção manual no histórico...', delay:STEP_DELAYS.db_update },
  ignorarDivergencia:         { msg:'Marcando divergência como ignorada...', delay:STEP_DELAYS.db_update },
  listarUsuariosPendentes:    { msg:'Verificando usuários aguardando aprovação...', delay:STEP_DELAYS.db_query_medium },
  aprovarUsuario:             { msg:'Atualizando permissões do usuário...', delay:STEP_DELAYS.db_update },
  bloquearUsuario:            { msg:'Revogando acesso do usuário...', delay:STEP_DELAYS.db_update },
  consultarAgendador:         { msg:'Lendo configurações do agendador...', delay:STEP_DELAYS.db_query_fast },
  ativarAgendador:            { msg:'Salvando configuração de varredura automática...', delay:STEP_DELAYS.db_update },
  desativarAgendador:         { msg:'Desabilitando o agendador...', delay:STEP_DELAYS.db_update },
  listarProdutos:             { msg:'Buscando produtos no catálogo...', delay:STEP_DELAYS.db_query_medium },
  listarAvisosML:             { msg:'Verificando avisos ativos do Mercado Livre...', delay:STEP_DELAYS.db_query_fast },
  consultarStatusConexaoML:   { msg:'Verificando token de conexão com ML...', delay:STEP_DELAYS.db_query_fast },
  listarHistoricoPrecos:      { msg:'Consultando histórico de preços...', delay:STEP_DELAYS.db_query_medium },
  resumoGeral:                { msg:'Compilando métricas gerais do sistema...', delay:STEP_DELAYS.db_query_slow },
  listarPaginasDisponiveis:   { msg:'Listando páginas e funcionalidades...', delay:STEP_DELAYS.db_query_fast },
  resumoGlobalPlataforma:     { msg:'Coletando métricas globais da plataforma...', delay:STEP_DELAYS.db_query_slow },
  lerPagina:                  { msg:'Acessando e lendo o conteúdo da página...', delay:STEP_DELAYS.page_browsing },
};

const TOOL_DONE_MSG = {
  listarDivergenciasAtivas:'Divergências carregadas', enviarParaFilaDeCorrecao:'Enviada para fila',
  enviarLoteDivergencias:'Lote enviado', marcarDivergenciaCorrigida:'Correção registrada',
  ignorarDivergencia:'Marcada como ignorada', listarUsuariosPendentes:'Lista de pendentes obtida',
  aprovarUsuario:'Acesso aprovado', bloquearUsuario:'Acesso revogado',
  consultarAgendador:'Agendador verificado', ativarAgendador:'Agendador ativado',
  desativarAgendador:'Agendador desativado', listarProdutos:'Catálogo carregado',
  listarAvisosML:'Avisos verificados', consultarStatusConexaoML:'Status verificado',
  listarHistoricoPrecos:'Histórico carregado', resumoGeral:'Resumo compilado',
  listarPaginasDisponiveis:'Páginas listadas', resumoGlobalPlataforma:'Métricas coletadas',
  lerPagina:'Página lida com sucesso',
};

export const TOOL_STEP_MESSAGES = Object.fromEntries(Object.entries(TOOL_STEP_CONFIG).map(([k,v]) => [k,v.msg]));

// ═══════════════════════════════════════════════════════════════════════════════
// buildAnswer (fallback JSON)
// ═══════════════════════════════════════════════════════════════════════════════

export async function buildAnswer(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai = getClient();
    const geminiHistory  = buildGeminiHistory(history);
    const useSearch      = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;
    const userId = context.usuarioAtual?.id || 0;
    const userRole = context.userRole || 'USUARIO';
    const pageBaseUrl = context.pageBaseUrl || null;
    const config = { systemInstruction:buildSystemInstruction({...context,isFirstMessage}), temperature:0.25, maxOutputTokens:1000, topP:0.9 };
    config.tools = useSearch ? [{googleSearch:{}}] : buildTools(userRole);
    let contents = [...geminiHistory, { role:'user', parts:[{text:message||'[arquivo enviado]'}] }];
    let response = await ai.models.generateContent({ model, config, contents });
    if (response.candidates?.[0]?.finishReason === 'SAFETY') return { reply:'Mensagem bloqueada.', sources:[] };
    let callCount = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && callCount < 5) {
      callCount++;
      const call = response.functionCalls[0];
      contents.push({ role:'model', parts:[{functionCall:{name:call.name,args:call.args}}] });
      const res = await executeTool(call.name, call.args, userId, userRole, pageBaseUrl);
      contents.push({ role:'user', parts:[{functionResponse:{name:call.name,response:res}}] });
      response = await ai.models.generateContent({ model, config, contents });
    }
    const raw = response.text?.trim();
    if (!raw) return { reply:getFallback(), sources:[] };
    const reply  = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter(c=>c.web?.uri).map(c=>({label:c.web.title||c.web.uri,url:c.web.uri})).slice(0,3);
    return { reply, sources };
  } catch (error) {
    if ((error?.status===429||String(error).includes('429'))&&attempt===1) return buildAnswer(message,history,context,2);
    console.error('[buildAnswer]', error.message);
    return { reply:getFallback(), sources:[] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// buildAnswerStream
// ═══════════════════════════════════════════════════════════════════════════════

export async function buildAnswerStream(message, history = [], context = {}, onStep, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai             = getClient();
    const geminiHistory  = buildGeminiHistory(history);
    const useSearch      = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;
    const userId         = context.usuarioAtual?.id || 0;
    const userRole       = context.userRole || 'USUARIO';
    const pageBaseUrl    = context.pageBaseUrl || 'http://localhost:5173';
    const incomingFiles  = (context.files || []).slice(0, MAX_FILES);

    // ── FASE 1: Raciocínio streaming ──────────────────────────────────────────
    const hasFiles  = incomingFiles.length > 0 || !!context.imageContext;
    const fileTypes = incomingFiles.map(f => f.group);
    const fileNames = incomingFiles.map(f => f.name);
    if (context.imageContext) { fileTypes.unshift('image'); fileNames.unshift('imagem principal'); }

    if (onStep) onStep({ type:'reasoning_start' });

    let fullReasoning = '';
    try {
      fullReasoning = await generateReasoningStream(
        message,
        { ...context, isFirstMessage, hasFiles, fileTypes, fileNames },
        (chunk) => { if (onStep) onStep({ type:'reasoning_chunk', text:chunk }); }
      );
    } catch (e) {
      fullReasoning = buildFallbackReasoning(message, { ...context, hasFiles, fileTypes, fileNames });
      if (onStep) onStep({ type:'reasoning_chunk', text:fullReasoning });
    }
    if (onStep) onStep({ type:'reasoning_end', fullText:fullReasoning });

    // ── FASE 2: Processa cada arquivo ─────────────
    const fileContexts = [];
    let globalStepKey  = 0;

    if (context.imageContext) {
      fileContexts.push({ label:'imagem', name:'imagem enviada', context:context.imageContext });
    }

    if (incomingFiles.length > 0) {
      if (incomingFiles.length > 1) {
        await emitStep(onStep, `Processando ${incomingFiles.length} arquivo(s) em sequência...`, null, 300);
        await emitDone(onStep, globalStepKey++, 400);
      }

      for (let i = 0; i < incomingFiles.length; i++) {
        const file = incomingFiles[i];
        if (incomingFiles.length > 1) {
          await emitStep(onStep, `[${i+1}/${incomingFiles.length}] Iniciando: "${file.name}"`, null, 200);
          await emitDone(onStep, globalStepKey++, 300);
        }

        const fileBaseKey = globalStepKey;

        const fileOnStep = (evt) => {
          if (evt.type === 'step') {
            if (onStep) onStep({ type:'step', msg:evt.msg, tool:evt.tool });
          } else if (evt.type === 'step_done') {
            if (onStep) onStep({ type:'step_done', stepIndex:evt.stepIndex });
          } else {
            if (onStep) onStep(evt);
          }
        };

        const fileResult = await processFileToContext(file, message, fileOnStep, globalStepKey);
        globalStepKey += fileResult.stepsUsed || 0;
        if (fileResult.context) fileContexts.push(fileResult);
      }

      await emitStep(onStep, 'Analisando conteúdo extraído e preparando resposta...', null, STEP_DELAYS.prep_response);
      await emitDone(onStep, globalStepKey++, 400);
    }

    // ── FASE 3: Pipeline com tools ────────────────────────────────────────────
    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage, fileContexts, pageBaseUrl }),
      temperature:0.25, maxOutputTokens:1200, topP:0.9,
    };
    config.tools = useSearch ? [{googleSearch:{}}] : buildTools(userRole);

    let contents = [...geminiHistory, { role:'user', parts:[{text:message||'[arquivo enviado]'}] }];
    let response  = await ai.models.generateContent({ model, config, contents });

    if (response.candidates?.[0]?.finishReason === 'SAFETY')
      return { reply:'Mensagem bloqueada.', sources:[], reasoning:fullReasoning, toolsExecutadas:[] };

    const toolsExecutadas = [];
    let callCount = 0;

    while (response.functionCalls && response.functionCalls.length > 0 && callCount < 5) {
      callCount++;
      const call     = response.functionCalls[0];
      const toolConf = TOOL_STEP_CONFIG[call.name] || { msg:`Executando ${call.name}...`, delay:400 };
      const doneMsg  = TOOL_DONE_MSG[call.name] || `${call.name} concluído`;
      toolsExecutadas.push(call.name);

      let stepMsg = toolConf.msg;
      if (call.name === 'lerPagina' && call.args?.caminho) {
        stepMsg = `Acessando página "${call.args.caminho}"...`;
      }

      await emitStep(onStep, stepMsg, call.name, toolConf.delay);
      const toolKey = globalStepKey++;

      contents.push({ role:'model', parts:[{functionCall:{name:call.name,args:call.args}}] });
      const apiResult = await executeTool(call.name, call.args, userId, userRole, pageBaseUrl);
      const ok = !apiResult?.erro;

      await emitDone(onStep, toolKey, STEP_DELAYS.db_done);
      if (onStep) onStep({ type:'tool_result', tool:call.name, ok, msg:ok?doneMsg:`Erro: ${apiResult?.erro}` });

      contents.push({ role:'user', parts:[{functionResponse:{name:call.name,response:apiResult}}] });
      response = await ai.models.generateContent({ model, config, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply:getFallback(), sources:[], reasoning:fullReasoning, toolsExecutadas:[] };

    const reply  = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter(c=>c.web?.uri).map(c=>({label:c.web.title||c.web.uri,url:c.web.uri})).slice(0,3);

    return { reply, sources, reasoning:fullReasoning, toolsExecutadas };

  } catch (error) {
    if ((error?.status===429||String(error).includes('429'))&&attempt===1)
      return buildAnswerStream(message,history,context,onStep,2);
    console.error('[buildAnswerStream]', error.message);
    return { reply:getFallback(), sources:[], reasoning:null, toolsExecutadas:[] };
  }
}

export const sendChatMessage = buildAnswer;

export function buildResumoPrompt(dadosStr) {
  return `Você é um Consultor Especialista em Logística. Produza RELATÓRIO EXECUTIVO em HTML (<b>,<i>,<br>).
DADOS: ${typeof dadosStr==='string'?dadosStr:JSON.stringify(dadosStr,null,2)}
ESTRUTURA: <b>Diagnóstico Geral</b><br>...<b>Problemas Críticos</b><br>...<b>Análise de Risco</b><br>...<b>Plano de Ação</b><br>...<b>Oportunidades</b><br>...`;
}

export function hashContexto(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex').substring(0,12);
}