// backend/src/iaService.js — v4: Steps com timing realista, múltiplos arquivos (até 10), raciocínio de limitações

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;
const MAX_FILES             = 10; // máximo de arquivos simultâneos

export const PAGE_CATALOG = {
  '/':             { titulo:'Home / Dashboard',          desc:'Visão geral do sistema, métricas principais, cards de acesso rápido', roles:['USUARIO','ADMIN','OWNER'] },
  '/ml':           { titulo:'Mercado Livre — Dashboard', desc:'Cards de acesso para as ferramentas do ML: Radar de Fretes, Precificação, Pesquisa, Meus Anúncios, SAC', roles:['USUARIO','ADMIN','OWNER'] },
  '/ml/auditoria': { titulo:'Radar de Fretes',          desc:'Scanner de divergências de peso/frete nos anúncios ML', roles:['USUARIO','ADMIN','OWNER'] },
  '/ml/precos':    { titulo:'Precificação ML',           desc:'Gerenciamento de preços dos anúncios ML. Histórico de preços, atualização em lote', roles:['USUARIO','ADMIN','OWNER'] },
  '/ml/pesquisa':  { titulo:'Pesquisa de Anúncios',     desc:'Pesquisa de anúncios do ML por link ou ID. Mostra preços, vendedores, concorrentes', roles:['USUARIO','ADMIN','OWNER'] },
  '/ml/anuncios':  { titulo:'Meus Anúncios ML',         desc:'Lista os anúncios do próprio usuário no ML. Filtros por status, exportação CSV', roles:['USUARIO','ADMIN','OWNER'] },
  '/shopee':       { titulo:'Shopee',                   desc:'Integração com Shopee (em desenvolvimento)', roles:['USUARIO','ADMIN','OWNER'] },
  '/amazon':       { titulo:'Amazon',                   desc:'Integração com Amazon (em desenvolvimento)', roles:['USUARIO','ADMIN','OWNER'] },
  '/usuarios':     { titulo:'Gerenciamento de Usuários',desc:'Lista e gerencia usuários da plataforma. Aprovar/bloquear acesso. Alterar roles', roles:['OWNER'] },
};

export const UI_FEATURES = {
  tema:       { titulo:'Seletor de Tema',     onde:'Barra superior — ícone de paleta no canto direito', comoUsar:'Clique no ícone de paleta para abrir o seletor de temas (20 temas disponíveis).' },
  zoom:       { titulo:'Zoom da Interface',   onde:'Barra superior — botões +/- ao lado do tema', comoUsar:'Use os botões de zoom na barra do topo para ajustar a escala (75% a 125%).' },
  perfil:     { titulo:'Perfil do Usuário',   onde:'Menu no canto superior direito — avatar', comoUsar:'Clique no avatar/nome para acessar configurações de perfil.' },
  ml_conectar:{ titulo:'Conectar ML',         onde:'Página /ml — botão "Conectar ML"', comoUsar:'Acesse /ml e clique em "Conectar Mercado Livre".' },
};

const ROLE_CAPABILITIES = {
  BLOQUEADO: { desc:'Sem acesso.', paginasAcesso:[], acoesPermitidas:[], restricoes:[] },
  USUARIO:   { desc:'Acesso às ferramentas do próprio catálogo.', paginasAcesso:['/','/ml','/ml/auditoria','/ml/precos','/ml/pesquisa','/ml/anuncios','/shopee','/amazon'], acoesPermitidas:['ver próprios produtos','ver próprias divergências','corrigir divergências','configurar agendador'], restricoes:['NÃO pode ver dados de outros usuários','NÃO pode aprovar/bloquear usuários','NÃO pode ver métricas globais'] },
  ADMIN:     { desc:'Acesso ampliado.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['tudo do USUARIO','ver dados de todos os usuários','gerenciar usuários'], restricoes:['NÃO pode excluir usuários permanentemente'] },
  OWNER:     { desc:'Acesso total.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['acesso total a tudo'], restricoes:[] },
};

// ─── Ferramentas disponíveis por role (para raciocínio de limitações) ─────────
const TOOLS_BY_ROLE = {
  USUARIO:   ['listarDivergenciasAtivas','enviarParaFilaDeCorrecao','ignorarDivergencia','marcarDivergenciaCorrigida','enviarLoteDivergencias','consultarAgendador','ativarAgendador','desativarAgendador','listarProdutos','listarAvisosML','consultarStatusConexaoML','listarHistoricoPrecos','resumoGeral','listarPaginasDisponiveis'],
  ADMIN:     ['listarDivergenciasAtivas','enviarParaFilaDeCorrecao','ignorarDivergencia','marcarDivergenciaCorrigida','enviarLoteDivergencias','consultarAgendador','ativarAgendador','desativarAgendador','listarProdutos','listarAvisosML','consultarStatusConexaoML','listarHistoricoPrecos','resumoGeral','listarPaginasDisponiveis','listarUsuariosPendentes','aprovarUsuario','bloquearUsuario','resumoGlobalPlataforma'],
  OWNER:     ['listarDivergenciasAtivas','enviarParaFilaDeCorrecao','ignorarDivergencia','marcarDivergenciaCorrigida','enviarLoteDivergencias','consultarAgendador','ativarAgendador','desativarAgendador','listarProdutos','listarAvisosML','consultarStatusConexaoML','listarHistoricoPrecos','resumoGeral','listarPaginasDisponiveis','listarUsuariosPendentes','aprovarUsuario','bloquearUsuario','resumoGlobalPlataforma'],
  BLOQUEADO: [],
};

// ─── Timing realista por tipo de step (ms de delay no backend antes de emitir) ─
// Simula o tempo real que cada operação levaria
const STEP_DELAYS = {
  // Processamento de arquivos
  pdf_opening:        800,
  pdf_extracting:     1200,
  pdf_done:           400,
  excel_opening:      600,
  excel_analyzing:    1000,
  excel_done:         300,
  txt_reading:        300,
  txt_done:           200,
  audio_receiving:    500,
  audio_transcribing: 2000,
  audio_done:         400,
  image_analyzing:    700,
  image_done:         300,
  // Tools (banco de dados)
  db_query_fast:      400,   // consultas simples
  db_query_medium:    700,   // consultas com joins
  db_query_slow:      1100,  // atualizações em lote
  db_update:          600,
  db_done:            250,
  // Preparação de resposta
  prep_response:      500,
};

// Delay com timing realista
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Emit step com delay ANTES de emitir (simula processamento)
async function emitStep(onStep, msg, tool, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type:'step', msg, tool });
}

// Emit step_done (marca etapa como concluída — aparece badge "Concluído")
async function emitDone(onStep, stepIndex, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type:'step_done', stepIndex });
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
  const msgs  = history.slice(0, -1);
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
// PROCESSAMENTO DE ARQUIVOS — com steps animados e timing realista
// ═══════════════════════════════════════════════════════════════════════════════

async function extractPDF(base64, fileName) {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature:0, maxOutputTokens:4000 },
      contents: [{ role:'user', parts:[
        { text:`Você é um extrator de texto. Extraia TODO o conteúdo textual deste PDF de forma estruturada, preservando tabelas, listas e formatação. Arquivo: ${fileName}` },
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
        model: GEMINI_MODEL, config:{ temperature:0, maxOutputTokens:2000 },
        contents:[{ role:'user', parts:[{ text:`Analise este CSV e descreva estrutura e dados. Arquivo: ${fileName}\n\nConteúdo:\n${text}` }] }],
      });
      return response.text?.trim() || null;
    }
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL, config:{ temperature:0, maxOutputTokens:4000 },
      contents:[{ role:'user', parts:[
        { text:`Extraia e organize os dados desta planilha. Mostre: abas, cabeçalhos, dados principais, totais. Arquivo: ${fileName}` },
        { inlineData:{ mimeType, data:base64 } },
      ]}],
    });
    return response.text?.trim() || null;
  } catch (e) {
    console.warn('[Excel Extract]', e.message);
    try { return `Conteúdo bruto de ${fileName}:\n${Buffer.from(base64,'base64').toString('utf-8').substring(0,5000)}`; } catch { return null; }
  }
}

function extractTXT(base64, fileName) {
  try {
    const text = Buffer.from(base64, 'base64').toString('utf-8');
    return `Conteúdo do arquivo ${fileName}:\n${text.substring(0, 10000)}`;
  } catch (e) { console.warn('[TXT Extract]', e.message); return null; }
}

async function transcribeAudio(base64, mimeType, fileName) {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL, config:{ temperature:0, maxOutputTokens:3000 },
      contents:[{ role:'user', parts:[
        { text:`Transcreva este áudio em português. Seja fiel ao que foi dito. Arquivo: ${fileName}` },
        { inlineData:{ mimeType, data:base64 } },
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
      model: GEMINI_MODEL, config:{ temperature:0.2, maxOutputTokens:600 },
      contents:[{ role:'user', parts:[
        { text: userQuestion || 'Descreva esta imagem detalhadamente.' },
        { inlineData:{ mimeType, data:base64 } },
      ]}],
    });
    return response.text?.trim() || null;
  } catch { return null; }
}

/**
 * Processa UM arquivo com steps animados e timing realista.
 * Cada step é emitido com delay, depois um step_done marca como concluído.
 * stepIndexOffset: índice base para os steps (para múltiplos arquivos)
 */
export async function processFileToContext(file, userMessage, onStep, stepIndexOffset = 0) {
  const { base64, mimeType, name, group } = file;
  let context = null;
  let fileTypeLabel = '';
  let stepIdx = stepIndexOffset;

  // Helper: emite step + espera + emite done
  const step = async (msg, delayBefore = 0, delayAfterDone = 250) => {
    await emitStep(onStep, msg, null, delayBefore);
    const idx = stepIdx++;
    // Executa o trabalho real (a função chamadora fará isso externamente)
    // O done é emitido pelo chamador após o trabalho concluir
    return idx; // retorna o índice para o chamador emitir o done
  };

  const done = async (idx, delayMs = STEP_DELAYS.db_done) => {
    await emitDone(onStep, idx, delayMs);
  };

  switch (group) {
    case 'image': {
      fileTypeLabel = 'imagem';
      const idx1 = await step(`Analisando imagem "${name}"...`, STEP_DELAYS.image_analyzing);
      context = await analyzeImage(base64, mimeType, userMessage || '');
      if (context) {
        await done(idx1, STEP_DELAYS.image_done);
        await emitStep(onStep, `Imagem "${name}" interpretada com sucesso`, null, 0);
        const idx2 = stepIdx++;
        await done(idx2, STEP_DELAYS.db_done);
      } else {
        await done(idx1, STEP_DELAYS.image_done);
        await emitStep(onStep, `Não foi possível extrair conteúdo visual de "${name}"`, null, 0);
        const idx2 = stepIdx++;
        await done(idx2, STEP_DELAYS.db_done);
      }
      break;
    }

    case 'pdf': {
      fileTypeLabel = 'PDF';
      const idx1 = await step(`Abrindo documento PDF "${name}"...`, STEP_DELAYS.pdf_opening);
      await done(idx1, STEP_DELAYS.db_done);
      const idx2 = await step(`Extraindo texto e estrutura do documento...`, STEP_DELAYS.pdf_extracting);
      context = await extractPDF(base64, name);
      if (context) {
        const words = context.split(/\s+/).length;
        await done(idx2, STEP_DELAYS.pdf_done);
        await emitStep(onStep, `PDF "${name}" processado — ${words.toLocaleString('pt-BR')} palavras extraídas`, null, 0);
        const idx3 = stepIdx++;
        await done(idx3, STEP_DELAYS.db_done);
      } else {
        await done(idx2, STEP_DELAYS.pdf_done);
        await emitStep(onStep, `Não foi possível extrair texto de "${name}" — PDF pode ser digitalizado`, null, 0);
        const idx3 = stepIdx++;
        await done(idx3, STEP_DELAYS.db_done);
      }
      break;
    }

    case 'excel': {
      fileTypeLabel = mimeType === 'text/csv' ? 'CSV' : 'planilha Excel';
      const idx1 = await step(`Abrindo ${fileTypeLabel} "${name}"...`, STEP_DELAYS.excel_opening);
      await done(idx1, STEP_DELAYS.db_done);
      const idx2 = await step(`Identificando abas, colunas e estrutura de dados...`, STEP_DELAYS.excel_analyzing);
      context = await extractExcel(base64, mimeType, name);
      if (context) {
        await done(idx2, STEP_DELAYS.excel_done);
        await emitStep(onStep, `${fileTypeLabel} "${name}" analisada com sucesso`, null, 0);
        const idx3 = stepIdx++;
        await done(idx3, STEP_DELAYS.db_done);
      } else {
        await done(idx2, STEP_DELAYS.excel_done);
        await emitStep(onStep, `Não foi possível processar o arquivo "${name}"`, null, 0);
        const idx3 = stepIdx++;
        await done(idx3, STEP_DELAYS.db_done);
      }
      break;
    }

    case 'txt': {
      fileTypeLabel = 'texto';
      const idx1 = await step(`Lendo conteúdo do arquivo "${name}"...`, STEP_DELAYS.txt_reading);
      context = extractTXT(base64, name);
      if (context) {
        const lines = context.split('\n').length;
        await done(idx1, STEP_DELAYS.txt_done);
        await emitStep(onStep, `"${name}" lido — ${lines} linhas de conteúdo`, null, 0);
        const idx2 = stepIdx++;
        await done(idx2, STEP_DELAYS.db_done);
      } else {
        await done(idx1, STEP_DELAYS.txt_done);
      }
      break;
    }

    case 'audio': {
      fileTypeLabel = 'áudio';
      const idx1 = await step(`Recebendo arquivo de áudio "${name}"...`, STEP_DELAYS.audio_receiving);
      await done(idx1, STEP_DELAYS.db_done);
      const idx2 = await step(`Transcrevendo áudio para texto...`, STEP_DELAYS.audio_transcribing);
      context = await transcribeAudio(base64, mimeType, name);
      if (context) {
        const words = context.split(/\s+/).length;
        await done(idx2, STEP_DELAYS.audio_done);
        await emitStep(onStep, `Áudio "${name}" transcrito — ${words} palavras detectadas`, null, 0);
        const idx3 = stepIdx++;
        await done(idx3, STEP_DELAYS.db_done);
      } else {
        await done(idx2, STEP_DELAYS.audio_done);
        await emitStep(onStep, `Não foi possível transcrever o áudio "${name}"`, null, 0);
        const idx3 = stepIdx++;
        await done(idx3, STEP_DELAYS.db_done);
      }
      break;
    }

    default: {
      await emitStep(onStep, `Tipo de arquivo não reconhecido: "${name}"`, null, 0);
      const idx = stepIdx++;
      await done(idx, STEP_DELAYS.db_done);
      break;
    }
  }

  return { context, label:fileTypeLabel, name, stepsUsed:stepIdx - stepIndexOffset };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION CALLING (TOOLS)
// ═══════════════════════════════════════════════════════════════════════════════

function buildTools(userRole) {
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
  const tools = [
    { name:'listarDivergenciasAtivas', description:'Lista as divergências de frete/peso que precisam de correção.', parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, status:{ type:'STRING' } } } },
    { name:'enviarParaFilaDeCorrecao', description:'Marca uma divergência como PENDENTE_ENVIO.', parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'ignorarDivergencia', description:'Marca uma divergência como IGNORADA.', parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'marcarDivergenciaCorrigida', description:'Marca uma divergência como CORRIGIDO manualmente.', parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'enviarLoteDivergencias', description:'Envia TODAS as divergências PENDENTE para a fila de correção.', parameters:{ type:'OBJECT', properties:{} } },
    { name:'consultarAgendador', description:'Verifica se a varredura automática está ativa.', parameters:{ type:'OBJECT', properties:{} } },
    { name:'ativarAgendador', description:'Liga a varredura automática.', parameters:{ type:'OBJECT', properties:{ intervaloMinutos:{ type:'INTEGER' } }, required:['intervaloMinutos'] } },
    { name:'desativarAgendador', description:'Desliga a varredura automática.', parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarProdutos', description:'Lista produtos do catálogo com filtros.', parameters:{ type:'OBJECT', properties:{ busca:{ type:'STRING' }, limite:{ type:'INTEGER' }, semPeso:{ type:'BOOLEAN' }, semVinculo:{ type:'BOOLEAN' } } } },
    { name:'listarAvisosML', description:'Lista avisos ativos do Mercado Livre.', parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' } } } },
    { name:'consultarStatusConexaoML', description:'Verifica se a conta ML está conectada.', parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarHistoricoPrecos', description:'Lista histórico de alterações de preço.', parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, mlItemId:{ type:'STRING' } } } },
    { name:'resumoGeral', description:'Retorna resumo geral do sistema.', parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarPaginasDisponiveis', description:'Lista páginas disponíveis para o usuário.', parameters:{ type:'OBJECT', properties:{} } },
  ];
  if (isPrivileged) {
    tools.push(
      { name:'listarUsuariosPendentes', description:'Lista usuários aguardando aprovação.', parameters:{ type:'OBJECT', properties:{} } },
      { name:'aprovarUsuario', description:'Aprova o acesso de um usuário bloqueado.', parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'bloquearUsuario', description:'Bloqueia o acesso de um usuário.', parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'resumoGlobalPlataforma', description:'Retorna métricas globais. Apenas ADMIN/OWNER.', parameters:{ type:'OBJECT', properties:{} } },
    );
  }
  return [{ functionDeclarations:tools }];
}

async function executeTool(name, args, userId, userRole) {
  const uid = parseInt(userId);
  if (!uid) return { erro:'Usuário não identificado' };
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  try {
    switch (name) {
      case 'listarDivergenciasAtivas': {
        const limite = Math.min(args.limite||5, 20);
        const where  = { usuarioId:uid };
        if (args.status) where.status = args.status;
        else where.status = { in:['PENDENTE','REINCIDENTE','PENDENTE_ENVIO'] };
        const divs = await prisma.divergencia.findMany({ where, take:limite, orderBy:{createdAt:'desc'}, select:{id:true,mlItemId:true,titulo:true,pesoMl:true,pesoLocal:true,status:true,motivo:true} });
        if (!divs.length) return { mensagem:'Nenhuma divergência ativa no momento.' };
        return { divergenciasEncontradas:divs, total:divs.length };
      }
      case 'enviarParaFilaDeCorrecao': {
        const div = await prisma.divergencia.findFirst({ where:{ id:parseInt(args.divergenciaId), usuarioId:uid } });
        if (!div) return { erro:'Divergência não encontrada.' };
        await prisma.divergencia.update({ where:{id:div.id}, data:{status:'PENDENTE_ENVIO'} });
        return { sucesso:true, mensagem:`Divergência ${div.mlItemId} enviada para fila de correção.` };
      }
      case 'ignorarDivergencia': {
        const div = await prisma.divergencia.findFirst({ where:{ id:parseInt(args.divergenciaId), usuarioId:uid } });
        if (!div) return { erro:'Divergência não encontrada.' };
        await prisma.divergencia.update({ where:{id:div.id}, data:{status:'IGNORADO',resolvido:true} });
        return { sucesso:true, mensagem:`Divergência ${div.mlItemId} marcada como ignorada.` };
      }
      case 'marcarDivergenciaCorrigida': {
        const div = await prisma.divergencia.findFirst({ where:{ id:parseInt(args.divergenciaId), usuarioId:uid } });
        if (!div) return { erro:'Divergência não encontrada.' };
        await prisma.divergencia.update({ where:{id:div.id}, data:{status:'CORRIGIDO',resolvido:true,corrigidoManual:true} });
        await prisma.divergenciaHistorico.create({ data:{divergenciaId:div.id,usuarioId:uid,acao:'CORRIGIDO_MANUAL',descricao:'Marcado como corrigido via chat'} }).catch(()=>{});
        return { sucesso:true, mensagem:`${div.mlItemId} marcado como corrigido.` };
      }
      case 'enviarLoteDivergencias': {
        const result = await prisma.divergencia.updateMany({ where:{usuarioId:uid,status:'PENDENTE'}, data:{status:'PENDENTE_ENVIO'} });
        return { sucesso:true, mensagem:`${result.count} divergência(s) enviada(s) para a fila.` };
      }
      case 'consultarAgendador': {
        const ag = await prisma.agendadorConfig.findUnique({ where:{usuarioId:uid} });
        if (!ag) return { mensagem:'Nenhum agendador configurado.' };
        return { status:ag.ativo?'Ativo':'Inativo', intervaloMinutos:ag.intervalo, ultimaExecucao:ag.ultimaExecucao, proximaExecucao:ag.proximaExecucao };
      }
      case 'ativarAgendador': {
        const min = parseInt(args.intervaloMinutos)||360;
        await prisma.agendadorConfig.upsert({ where:{usuarioId:uid}, update:{ativo:true,intervalo:min}, create:{usuarioId:uid,ativo:true,intervalo:min} });
        return { sucesso:true, mensagem:`Agendador ativado. Varredura a cada ${min} minutos.` };
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
        const total    = await prisma.produto.count({ where:{usuarioId:uid} });
        return { produtos, totalNoCatalogo:total, exibindo:produtos.length };
      }
      case 'listarAvisosML': {
        const avisos = await prisma.avisoML.findMany({ where:{usuarioId:uid,resolvido:false}, take:Math.min(args.limite||5,20), orderBy:{createdAt:'desc'}, select:{id:true,mlItemId:true,titulo:true,tipoAviso:true,mensagem:true,severidade:true} }).catch(()=>[]);
        if (!avisos.length) return { mensagem:'Nenhum aviso ativo do Mercado Livre.' };
        return { avisos, total:avisos.length };
      }
      case 'consultarStatusConexaoML': {
        const token = await prisma.mlToken.findUnique({ where:{usuarioId:uid}, select:{nickname:true,expiresAt:true,mlUserId:true} });
        if (!token) return { conectado:false, mensagem:'Conta ML não conectada.' };
        const expirou = new Date() >= new Date(token.expiresAt);
        return { conectado:!expirou, nickname:token.nickname, status:expirou?'Token expirado':'Conectado e válido', expiresAt:token.expiresAt };
      }
      case 'listarHistoricoPrecos': {
        const where = { usuarioId:uid };
        if (args.mlItemId) where.mlItemId = args.mlItemId;
        const historico = await prisma.precificacaoHistorico.findMany({ where, take:Math.min(args.limite||5,20), orderBy:{criadoEm:'desc'}, select:{mlItemId:true,titulo:true,preco:true,quantidade:true,criadoEm:true} }).catch(()=>[]);
        if (!historico.length) return { mensagem:'Nenhum histórico de preços.' };
        return { historico, total:historico.length };
      }
      case 'resumoGeral': {
        const [totalProd,pendente,reincidente,corrigido,ignorado,penEnvio,avisos,agendador,token] = await Promise.all([
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
        return { produtos:{total:totalProd}, divergencias:{pendente,reincidente,corrigido,ignorado,pendenteEnvio:penEnvio,totalAtivas:pendente+reincidente}, avisosML:avisos, agendador:agendador?{ativo:agendador.ativo,intervalo:agendador.intervalo}:{ativo:false}, conexaoML:token?{nickname:token.nickname,valida:new Date()<new Date(token.expiresAt)}:{conectado:false} };
      }
      case 'listarPaginasDisponiveis': {
        const caps    = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
        const paginas = caps.paginasAcesso.map(path => ({ caminho:path, ...PAGE_CATALOG[path] }));
        return { paginas, totalAcesso:paginas.length };
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
        return { sucesso:true, mensagem:`Usuário ${u.nome} aprovado.` };
      }
      case 'bloquearUsuario': {
        if (!isPrivileged) return { erro:'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where:{id:parseInt(args.usuarioId)} });
        if (!u) return { erro:'Usuário não encontrado.' };
        if (u.role === 'OWNER') return { erro:'Não é possível bloquear um OWNER.' };
        await prisma.usuario.update({ where:{id:u.id}, data:{role:'BLOQUEADO'} });
        return { sucesso:true, mensagem:`Usuário ${u.nome} bloqueado.` };
      }
      case 'resumoGlobalPlataforma': {
        if (!isPrivileged) return { erro:'Sem permissão.' };
        const [totalUsers,totalProd,totalDiv,sessOk] = await Promise.all([
          prisma.usuario.count(), prisma.produto.count(),
          prisma.divergencia.count({where:{status:{in:['PENDENTE','REINCIDENTE']}}}),
          prisma.sessaoUsuario.count({where:{ativo:true,entradaEm:{gte:new Date(Date.now()-30*60*1000)}}}).catch(()=>0),
        ]);
        return { totalUsuarios:totalUsers, totalProdutos:totalProd, divergenciasAtivas:totalDiv, usuariosOnline:sessOk };
      }
      default: return { erro:`Função "${name}" não existe.` };
    }
  } catch (e) { return { erro:`Falha ao executar ${name}: ${e.message}` }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemInstruction(ctx) {
  const { totalProdutos=0, totalDivergencias=0, userRole='USUARIO', usuarioAtual=null,
    isFirstMessage=false, dataBlock=null, fileContexts=[] } = ctx;
  const caps    = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
  const paginas = caps.paginasAcesso.map(p => `  • ${p} — ${PAGE_CATALOG[p]?.titulo||p}: ${PAGE_CATALOG[p]?.desc||''}`).join('\n');
  const restrict= caps.restricoes.length ? caps.restricoes.map(r => `  ${r}`).join('\n') : '  (sem restrições)';
  const saudacao= isFirstMessage ? `Cumprimente ${usuarioAtual?.nome||'o usuário'} rapidamente com emoji.` : 'Sem saudações. Direto ao ponto.';

  const fileBlock = fileContexts.length > 0
    ? `\n=== ARQUIVOS PROCESSADOS (${fileContexts.length} arquivo(s)) ===\n${fileContexts.map((f,i) => `[ARQUIVO ${i+1}] ${f.label.toUpperCase()} — "${f.name}":\n${(f.context||'').substring(0,2000)}`).join('\n\n')}\n=== FIM DOS ARQUIVOS ===\n`
    : '';

  return `Você é a IA Analyiz — assistente agêntico especialista em e-commerce e logística.
Usuário: ${usuarioAtual?.nome||'?'} | Cargo: ${userRole} (${caps.desc})

=== PÁGINAS ACESSÍVEIS ===
${paginas}

=== RESTRIÇÕES DO CARGO ===
${restrict}

=== DADOS DO SISTEMA ===
${dataBlock || `Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`}
${fileBlock}
=== FUNCIONALIDADES DE INTERFACE (NÃO TEM FERRAMENTA — oriente o usuário) ===
• Alterar TEMA → ícone de paleta na barra do topo.
• Ajustar ZOOM → botões +/- na barra do topo.
• Editar PERFIL → avatar/nome no canto superior direito.
• Conectar ML → página /ml → "Conectar Mercado Livre".

=== FERRAMENTAS DISPONÍVEIS ===
EXECUTE imediatamente quando a intenção for clara:
• "minhas divergências / quais divergências" → listarDivergenciasAtivas()
• "corrige / manda pra fila" → listarDivergenciasAtivas() + enviarParaFilaDeCorrecao(id)
• "corrige tudo" → enviarLoteDivergencias()
• "ignora" → ignorarDivergencia(id)
• "já corrigi" → marcarDivergenciaCorrigida(id)
• "liga/desliga agendador" → ativarAgendador(intervalo) / desativarAgendador()
• "aprova/bloqueia usuário" → listarUsuariosPendentes() + aprovarUsuario(id) [apenas ADMIN/OWNER]
• "resumo / como está" → resumoGeral()

SE o usuário pedir algo que NÃO tenho ferramenta/acesso: explique claramente o que não está disponível e como contornar.

REGRAS DE RESPOSTA:
1. CONCISA — máx 2-3 parágrafos.
2. Emojis contextualmente.
3. Confirme ações executadas com entusiasmo!
4. Use HTML básico (<b>, <i>, <br>). Sem Markdown.
5. ${saudacao}
6. Se há arquivos processados: analise-os conforme o pedido do usuário, sendo específico.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REASONING INSTRUCTION — inclui limitações e impossibilidades
// ═══════════════════════════════════════════════════════════════════════════════

function buildReasoningInstruction(ctx) {
  const { userRole='USUARIO', usuarioAtual=null, dataBlock=null, hasFiles=false, fileTypes=[], fileNames=[] } = ctx;
  const caps         = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
  const toolsAvail   = (TOOLS_BY_ROLE[userRole] || []).join(', ');
  const toolsUnavail = [...new Set(Object.values(TOOLS_BY_ROLE).flat())].filter(t => !(TOOLS_BY_ROLE[userRole]||[]).includes(t)).join(', ') || 'nenhuma';

  // Descrição detalhada de cada arquivo por nome e tipo
  const TIPO_LABELS = { image:'imagem', pdf:'PDF', excel:'planilha/CSV', txt:'arquivo de texto', audio:'áudio' };
  const fileDetails = hasFiles && fileNames.length > 0
    ? fileNames.map((name, i) => `- "${name}" (${TIPO_LABELS[fileTypes[i]] || fileTypes[i] || 'desconhecido'})`).join('\n')
    : '';

  const nomeUsuario = usuarioAtual?.nome || 'desconhecido';
  const processamentoArquivos = hasFiles
    ? `Arquivos enviados pelo usuário (${fileTypes.length}):\n${fileDetails}\nCada arquivo será processado individualmente antes de formular a resposta.`
    : '';

  return `Você é o módulo de raciocínio interno da IA Analyiz — o que você escrever será exibido ao usuário em tempo real.
Usuário: ${nomeUsuario} | Cargo: ${userRole} — ${caps.desc}
${processamentoArquivos}

Ferramentas disponíveis: ${toolsAvail || 'nenhuma'}
Ferramentas INDISPONÍVEIS para este cargo: ${toolsUnavail}

ESCREVA em português corrido, SEM emojis, SEM markdown, SEM listas. Fluxo natural de 150-220 palavras.
O usuário verá esse texto enquanto você pensa — seja claro e específico.

Cubra tudo em parágrafos fluidos:
- O usuário ${nomeUsuario} enviou [o quê] e quer [o quê] — mencione cada arquivo pelo nome exato
- Como cada arquivo será processado (imagem: análise visual/OCR; PDF: extração de texto; Excel/CSV: estrutura e dados; áudio: transcrição; texto: leitura direta)
- Quais ações do sistema serão executadas — OU se a ação não é possível: "O usuário ${nomeUsuario} pediu para realizar [ação] mas verifiquei que não tenho acesso a essa funcionalidade para o cargo ${userRole}"
- Pontos de atenção (qualidade do arquivo, ambiguidade da intenção, permissões)
- Como a resposta será estruturada`;
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
  const { userRole='USUARIO', usuarioAtual=null, totalDivergencias=0, totalProdutos=0, hasFiles=false, fileTypes=[], fileNames=[] } = context;
  const nome = usuarioAtual?.nome || 'o usuário';
  const parts = [];

  if (hasFiles) {
    parts.push(`Recebi ${fileTypes.length} arquivo(s) do usuário ${nome}: ${fileNames.join(', ')}.`);
    parts.push(`Vou processar cada arquivo sequencialmente e extrair o conteúdo relevante antes de responder.`);
  }

  if (/divergen|peso|frete|corrig/i.test(message||'')) {
    parts.push(`Mensagem envolve divergências de peso/frete. ${totalDivergencias} ativas no momento. Consultarei listarDivergenciasAtivas para obter os IDs necessários.`);
  } else if (/produto|sku|catálogo/i.test(message||'')) {
    parts.push(`Pergunta sobre catálogo de produtos. ${totalProdutos} itens cadastrados. Usarei listarProdutos.`);
  } else if (/resumo|status|como está/i.test(message||'')) {
    parts.push(`Usuário quer panorama geral. Chamarei resumoGeral para compilar métricas.`);
  } else if (/aprovar|bloquear|usuário.*acesso/i.test(message||'')) {
    if (userRole === 'USUARIO') {
      parts.push(`Usuário ${nome} pediu para gerenciar acessos de outros usuários, mas verifiquei que não tenho acesso a essa funcionalidade para o cargo USUARIO. Apenas ADMIN e OWNER podem aprovar ou bloquear usuários.`);
    } else {
      parts.push(`Ação de gerenciamento de usuários. Listarei pendentes e executarei a ação solicitada.`);
    }
  } else {
    parts.push(`Resposta informativa com base no contexto disponível. Verificando se consulta ao banco é necessária.`);
  }

  parts.push(`Estruturarei resposta de forma concisa, confirmando ações quando executadas.`);
  return parts.join(' ');
}

function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600" rel="noopener">$1</a>')
    .replace(/\b(MLB\d+)\b(?![^<]*>)/g, '<a href="https://produto.mercadolivre.com.br/MLB-$1" target="_blank" style="color:#1e40af;text-decoration:underline;font-weight:600">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .trim();
}

function cleanMetaText(text) {
  return text.replace(/^(Claro[,!]\s*)/i,'').replace(/^(Com certeza[,!]\s*)/i,'').replace(/^(Entendido[,!]\s*)/i,'').trim();
}

function getFallback() { return '⚠️ Conexão instável. Tente novamente em instantes!'; }

// ═══════════════════════════════════════════════════════════════════════════════
// buildAnswer (JSON, sem stream — fallback)
// ═══════════════════════════════════════════════════════════════════════════════

export async function buildAnswer(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai             = getClient();
    const geminiHistory  = buildGeminiHistory(history);
    const useSearch      = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;
    const userId         = context.usuarioAtual?.id || 0;
    const userRole       = context.userRole || 'USUARIO';
    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage }),
      temperature:0.25, maxOutputTokens:1000, topP:0.9,
    };
    config.tools = useSearch ? [{ googleSearch:{} }] : buildTools(userRole);
    let contents = [...geminiHistory, { role:'user', parts:[{ text:message||'[imagem enviada]' }] }];
    let response = await ai.models.generateContent({ model, config, contents });
    if (response.candidates?.[0]?.finishReason === 'SAFETY') return { reply:'Mensagem bloqueada por segurança.', sources:[] };
    let callCount = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && callCount < 5) {
      callCount++;
      const call = response.functionCalls[0];
      contents.push({ role:'model', parts:[{ functionCall:{ name:call.name, args:call.args } }] });
      const result = await executeTool(call.name, call.args, userId, userRole);
      contents.push({ role:'user', parts:[{ functionResponse:{ name:call.name, response:result } }] });
      response = await ai.models.generateContent({ model, config, contents });
    }
    const raw = response.text?.trim();
    if (!raw) return { reply:getFallback(), sources:[] };
    const reply  = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter(c => c.web?.uri).map(c => ({ label:c.web.title||c.web.uri, url:c.web.uri })).slice(0,3);
    return { reply, sources };
  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1) return buildAnswer(message, history, context, 2);
    console.error('[buildAnswer]', error.message);
    return { reply:getFallback(), sources:[] };
  }
}

// ─── Timing realista para cada ferramenta ─────────────────────────────────────
// (delayBefore: ms para esperar antes de emitir o step)
const TOOL_STEP_CONFIG = {
  listarDivergenciasAtivas:   { msg:'Consultando divergências ativas no banco de dados...', delay:STEP_DELAYS.db_query_medium },
  enviarParaFilaDeCorrecao:   { msg:'Atualizando status da divergência para fila de correção...', delay:STEP_DELAYS.db_update },
  enviarLoteDivergencias:     { msg:'Enviando todas as divergências pendentes para correção automática...', delay:STEP_DELAYS.db_query_slow },
  marcarDivergenciaCorrigida: { msg:'Registrando correção manual no histórico...', delay:STEP_DELAYS.db_update },
  ignorarDivergencia:         { msg:'Marcando divergência como ignorada...', delay:STEP_DELAYS.db_update },
  listarUsuariosPendentes:    { msg:'Verificando fila de usuários aguardando aprovação...', delay:STEP_DELAYS.db_query_medium },
  aprovarUsuario:             { msg:'Atualizando permissões do usuário no sistema...', delay:STEP_DELAYS.db_update },
  bloquearUsuario:            { msg:'Revogando acesso do usuário...', delay:STEP_DELAYS.db_update },
  consultarAgendador:         { msg:'Lendo configurações do agendador de varredura...', delay:STEP_DELAYS.db_query_fast },
  ativarAgendador:            { msg:'Salvando nova configuração de varredura automática...', delay:STEP_DELAYS.db_update },
  desativarAgendador:         { msg:'Desabilitando o agendador de varredura...', delay:STEP_DELAYS.db_update },
  listarProdutos:             { msg:'Buscando produtos no catálogo...', delay:STEP_DELAYS.db_query_medium },
  listarAvisosML:             { msg:'Verificando avisos ativos do Mercado Livre...', delay:STEP_DELAYS.db_query_fast },
  consultarStatusConexaoML:   { msg:'Verificando token de conexão com o Mercado Livre...', delay:STEP_DELAYS.db_query_fast },
  listarHistoricoPrecos:      { msg:'Consultando histórico de alterações de preço...', delay:STEP_DELAYS.db_query_medium },
  resumoGeral:                { msg:'Compilando métricas gerais do sistema...', delay:STEP_DELAYS.db_query_slow },
  listarPaginasDisponiveis:   { msg:'Listando páginas e funcionalidades do sistema...', delay:STEP_DELAYS.db_query_fast },
  resumoGlobalPlataforma:     { msg:'Coletando métricas globais de todos os usuários...', delay:STEP_DELAYS.db_query_slow },
};

// Mensagem de "concluído" para cada tool
const TOOL_DONE_MSG = {
  listarDivergenciasAtivas:   'Divergências carregadas do banco',
  enviarParaFilaDeCorrecao:   'Divergência enviada para fila de correção',
  enviarLoteDivergencias:     'Lote de correções enviado com sucesso',
  marcarDivergenciaCorrigida: 'Correção manual registrada',
  ignorarDivergencia:         'Divergência marcada como ignorada',
  listarUsuariosPendentes:    'Lista de pendentes obtida',
  aprovarUsuario:             'Acesso do usuário aprovado',
  bloquearUsuario:            'Acesso do usuário revogado',
  consultarAgendador:         'Configurações do agendador lidas',
  ativarAgendador:            'Agendador ativado com sucesso',
  desativarAgendador:         'Agendador desativado',
  listarProdutos:             'Catálogo de produtos carregado',
  listarAvisosML:             'Avisos do ML verificados',
  consultarStatusConexaoML:   'Status de conexão verificado',
  listarHistoricoPrecos:      'Histórico de preços carregado',
  resumoGeral:                'Resumo do sistema compilado',
  listarPaginasDisponiveis:   'Páginas do sistema listadas',
  resumoGlobalPlataforma:     'Métricas globais coletadas',
};

// Mensagens de resultado para cada tool
export const TOOL_STEP_MESSAGES = Object.fromEntries(
  Object.entries(TOOL_STEP_CONFIG).map(([k, v]) => [k, v.msg])
);

// ═══════════════════════════════════════════════════════════════════════════════
// buildAnswerStream — pipeline principal com raciocínio + arquivos + tools
// ─────────────────────────────────────────────────────────────────────────────
// Fluxo SSE:
//   1. reasoning_start → reasoning_chunk (N) → reasoning_end
//   2. Para cada arquivo: step (typewriter) → step_done
//   3. Para cada tool: step → step_done
//   4. done (resposta final)
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
    // Limita a 10 arquivos simultâneos
    const incomingFiles  = (context.files || []).slice(0, MAX_FILES);

    // ── FASE 1: Raciocínio em streaming ──────────────────────────────────────
    const hasFiles  = incomingFiles.length > 0 || !!context.imageContext;
    const fileTypes = incomingFiles.map(f => f.group);
    const fileNames = incomingFiles.map(f => f.name);
    if (context.imageBase64 || context.imageContext) { fileTypes.unshift('image'); fileNames.unshift('imagem principal'); }

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

    // ── FASE 2: Processa cada arquivo sequencialmente ──────────────────────
    const fileContexts = [];
    let globalStepIndex = 0;

    // Imagem principal (campo legado — já pré-analisada)
    if (context.imageContext) {
      fileContexts.push({ label:'imagem', name:'imagem enviada', context:context.imageContext });
    }

    // Múltiplos arquivos: processa um por um, em ordem
    if (incomingFiles.length > 0) {
      // Aviso inicial se múltiplos arquivos
      if (incomingFiles.length > 1) {
        await emitStep(onStep, `Processando ${incomingFiles.length} arquivo(s) em sequência...`, null, 300);
        const idxBanner = globalStepIndex++;
        await emitDone(onStep, idxBanner, 400);
      }

      for (let i = 0; i < incomingFiles.length; i++) {
        const file = incomingFiles[i];
        if (incomingFiles.length > 1) {
          // Header do arquivo atual
          await emitStep(onStep, `[${i+1}/${incomingFiles.length}] Iniciando: "${file.name}"`, null, 200);
          const idxHeader = globalStepIndex++;
          await emitDone(onStep, idxHeader, 300);
        }
        const result = await processFileToContext(
          file, message,
          (evt) => {
            // Reescreve stepIndex para ser global
            if (evt.type === 'step') {
              if (onStep) onStep({ ...evt, _stepGlobalIdx: globalStepIndex });
              globalStepIndex++;
            } else if (evt.type === 'step_done') {
              // Ajusta o idx para o índice global
              const adjustedIdx = evt.stepIndex + (globalStepIndex - (result?.stepsUsed || 0) - 1);
              if (onStep) onStep({ ...evt, stepIndex: evt._adjustedIdx || evt.stepIndex });
            } else {
              if (onStep) onStep(evt);
            }
          },
          globalStepIndex
        );
        globalStepIndex += (result.stepsUsed || 0);
        if (result.context) fileContexts.push(result);
      }

      // Step de preparação da resposta
      await emitStep(onStep, 'Analisando conteúdo extraído e preparando resposta...', null, STEP_DELAYS.prep_response);
      const idxPrep = globalStepIndex++;
      await emitDone(onStep, idxPrep, 400);
    }

    // ── FASE 3: Pipeline principal com tools ──────────────────────────────────
    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage, fileContexts }),
      temperature:0.25, maxOutputTokens:1200, topP:0.9,
    };
    config.tools = useSearch ? [{ googleSearch:{} }] : buildTools(userRole);

    let contents = [...geminiHistory, { role:'user', parts:[{ text:message||'[arquivo enviado]' }] }];
    let response  = await ai.models.generateContent({ model, config, contents });

    if (response.candidates?.[0]?.finishReason === 'SAFETY')
      return { reply:'Mensagem bloqueada por segurança.', sources:[], reasoning:fullReasoning, toolsExecutadas:[] };

    // Loop de tools com timing realista e step_done
    const toolsExecutadas = [];
    let callCount = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && callCount < 5) {
      callCount++;
      const call      = response.functionCalls[0];
      const toolConf  = TOOL_STEP_CONFIG[call.name] || { msg:`Executando ${call.name}...`, delay:400 };
      const doneLabel = TOOL_DONE_MSG[call.name] || `${call.name} concluído`;
      toolsExecutadas.push(call.name);

      // Emite step com delay realista antes de aparecer
      await emitStep(onStep, toolConf.msg, call.name, toolConf.delay);
      const toolStepIdx = globalStepIndex++;

      contents.push({ role:'model', parts:[{ functionCall:{ name:call.name, args:call.args } }] });

      // Executa a ferramenta real
      const apiResult = await executeTool(call.name, call.args, userId, userRole);
      const ok        = !apiResult?.erro;

      // Emite done com label de resultado
      await emitDone(onStep, toolStepIdx, STEP_DELAYS.db_done);

      // Emite resultado da tool (usado pelo frontend para o painel de steps)
      if (onStep) onStep({
        type:   'tool_result',
        tool:   call.name,
        ok,
        msg:    ok ? doneLabel : `Erro: ${apiResult?.erro || 'falha desconhecida'}`,
      });

      contents.push({ role:'user', parts:[{ functionResponse:{ name:call.name, response:apiResult } }] });
      response = await ai.models.generateContent({ model, config, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply:getFallback(), sources:[], reasoning:fullReasoning, toolsExecutadas:[] };

    const reply  = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources= chunks.filter(c => c.web?.uri).map(c => ({ label:c.web.title||c.web.uri, url:c.web.uri })).slice(0,3);

    return { reply, sources, reasoning:fullReasoning, toolsExecutadas };

  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1)
      return buildAnswerStream(message, history, context, onStep, 2);
    console.error('[buildAnswerStream]', error.message);
    return { reply:getFallback(), sources:[], reasoning:null, toolsExecutadas:[] };
  }
}

export const sendChatMessage = buildAnswer;

export function buildResumoPrompt(dadosStr) {
  return `Você é um Consultor Especialista em Logística.
Analise os dados abaixo e produza um RELATÓRIO EXECUTIVO em HTML (<b>, <i>, <br>).

DADOS:
${typeof dadosStr === 'string' ? dadosStr : JSON.stringify(dadosStr, null, 2)}

ESTRUTURA:
<b>Diagnóstico Geral</b><br>...
<b>Problemas Críticos</b><br>...
<b>Análise de Risco</b><br>...
<b>Plano de Ação Prioritário</b><br>...
<b>Oportunidades</b><br>...`;
}

export function hashContexto(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex').substring(0,12);
}