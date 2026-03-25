// backend/src/iaService.js — v3: Processamento de Arquivos + Raciocínio Streaming

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;

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
  tema:       { titulo:'Seletor de Tema',     onde:'Barra superior — ícone de paleta no canto direito', comoUsar:'Clique no ícone de paleta para abrir o seletor de temas (20 temas disponíveis).', temFerram:false },
  zoom:       { titulo:'Zoom da Interface',   onde:'Barra superior — botões +/- ao lado do tema', comoUsar:'Use os botões de zoom na barra do topo para ajustar a escala (75% a 125%).', temFerram:false },
  perfil:     { titulo:'Perfil do Usuário',   onde:'Menu no canto superior direito — avatar', comoUsar:'Clique no avatar/nome para acessar configurações de perfil.', temFerram:false },
  ml_conectar:{ titulo:'Conectar ML',         onde:'Página /ml — botão "Conectar ML"', comoUsar:'Acesse /ml e clique em "Conectar Mercado Livre".', temFerram:false },
};

const ROLE_CAPABILITIES = {
  BLOQUEADO: { desc:'Sem acesso.', paginasAcesso:[], acoesPermitidas:[], restricoes:[] },
  USUARIO:   { desc:'Acesso às ferramentas do próprio catálogo.', paginasAcesso:['/','/ml','/ml/auditoria','/ml/precos','/ml/pesquisa','/ml/anuncios','/shopee','/amazon'], acoesPermitidas:['ver próprios produtos','ver próprias divergências'], restricoes:['NÃO pode ver dados de outros usuários','NÃO pode aprovar/bloquear usuários'] },
  ADMIN:     { desc:'Acesso ampliado.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['tudo do USUARIO','ver dados de todos os usuários'], restricoes:['NÃO pode excluir usuários permanentemente'] },
  OWNER:     { desc:'Acesso total.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['acesso total a tudo'], restricoes:[] },
};

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
      pairs.push({ user: stripHTML(cur.content).substring(0, 800), model: stripHTML(next.content).substring(0, 800) });
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
// Converte cada tipo de arquivo em texto/contexto para o Gemini
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extrai texto de PDF via Gemini (visão)
 */
async function extractPDF(base64, fileName) {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0, maxOutputTokens: 4000 },
      contents: [{
        role: 'user',
        parts: [
          { text: `Você é um extrator de texto. Extraia TODO o conteúdo textual deste PDF de forma estruturada, preservando tabelas, listas e formatação. Arquivo: ${fileName}` },
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
        ],
      }],
    });
    return response.text?.trim() || null;
  } catch (e) {
    console.warn('[PDF Extract]', e.message);
    return null;
  }
}

/**
 * Extrai texto de Excel/CSV via Gemini (visão para xlsx, texto para csv)
 */
async function extractExcel(base64, mimeType, fileName) {
  try {
    const ai = getClient();
    // Para CSV: decodifica base64 e envia como texto direto
    if (mimeType === 'text/csv') {
      const text = Buffer.from(base64, 'base64').toString('utf-8').substring(0, 8000);
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        config: { temperature: 0, maxOutputTokens: 2000 },
        contents: [{ role:'user', parts:[{ text:`Analise este CSV e descreva sua estrutura e dados. Arquivo: ${fileName}\n\nConteúdo:\n${text}` }] }],
      });
      return response.text?.trim() || null;
    }
    // Para xlsx/xls: envia como documento
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0, maxOutputTokens: 4000 },
      contents: [{
        role: 'user',
        parts: [
          { text: `Extraia e organize os dados desta planilha. Mostre: abas existentes, cabeçalhos de colunas, dados principais, totais se houver. Arquivo: ${fileName}` },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
    });
    return response.text?.trim() || null;
  } catch (e) {
    console.warn('[Excel Extract]', e.message);
    // Fallback: tenta decodificar como texto
    try {
      const text = Buffer.from(base64, 'base64').toString('utf-8').substring(0, 5000);
      return `Conteúdo bruto do arquivo ${fileName}:\n${text}`;
    } catch { return null; }
  }
}

/**
 * Extrai texto de arquivo TXT puro
 */
function extractTXT(base64, fileName) {
  try {
    const text = Buffer.from(base64, 'base64').toString('utf-8');
    return `Conteúdo do arquivo ${fileName}:\n${text.substring(0, 10000)}`;
  } catch (e) {
    console.warn('[TXT Extract]', e.message);
    return null;
  }
}

/**
 * Transcreve áudio via Gemini
 */
async function transcribeAudio(base64, mimeType, fileName) {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0, maxOutputTokens: 3000 },
      contents: [{
        role: 'user',
        parts: [
          { text: `Transcreva este áudio em português. Seja fiel ao que foi dito. Arquivo: ${fileName}` },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
    });
    return response.text?.trim() || null;
  } catch (e) {
    console.warn('[Audio Transcribe]', e.message);
    return null;
  }
}

/**
 * Analisa imagem via Gemini
 */
export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.2, maxOutputTokens: 600 },
      contents: [{ role:'user', parts:[
        { text: userQuestion || 'Descreva esta imagem detalhadamente.' },
        { inlineData: { mimeType, data: base64 } },
      ]}],
    });
    return response.text?.trim() || null;
  } catch { return null; }
}

/**
 * Processa um arquivo de qualquer tipo → retorna contexto textual
 * Chamado pelo buildAnswerStream com callbacks SSE em tempo real
 */
export async function processFileToContext(file, userMessage, onStep) {
  const { base64, mimeType, name, group } = file;

  const step = (msg) => { if (onStep) onStep({ type:'step', msg }); };

  let context = null;
  let fileTypeLabel = '';

  switch (group) {
    case 'image': {
      fileTypeLabel = 'imagem';
      step(`Analisando imagem "${name}"...`);
      context = await analyzeImage(base64, mimeType, userMessage || '');
      if (context) step(`Imagem "${name}" analisada com sucesso.`);
      else step(`Não foi possível extrair conteúdo da imagem "${name}".`);
      break;
    }

    case 'pdf': {
      fileTypeLabel = 'PDF';
      step(`Lendo arquivo PDF "${name}"...`);
      step(`Extraindo texto e estrutura do documento...`);
      context = await extractPDF(base64, name);
      if (context) {
        const words = context.split(/\s+/).length;
        step(`PDF "${name}" processado — ${words} palavras extraídas.`);
      } else {
        step(`Não foi possível extrair texto do PDF "${name}".`);
      }
      break;
    }

    case 'excel': {
      fileTypeLabel = mimeType === 'text/csv' ? 'CSV' : 'planilha Excel';
      step(`Abrindo ${fileTypeLabel} "${name}"...`);
      step(`Identificando abas, colunas e dados...`);
      context = await extractExcel(base64, mimeType, name);
      if (context) step(`${fileTypeLabel} "${name}" processada com sucesso.`);
      else step(`Não foi possível processar o arquivo "${name}".`);
      break;
    }

    case 'txt': {
      fileTypeLabel = 'arquivo de texto';
      step(`Lendo conteúdo do arquivo "${name}"...`);
      context = extractTXT(base64, name);
      if (context) {
        const lines = context.split('\n').length;
        step(`Arquivo "${name}" lido — ${lines} linhas de texto.`);
      }
      break;
    }

    case 'audio': {
      fileTypeLabel = 'áudio';
      step(`Recebendo arquivo de áudio "${name}"...`);
      step(`Iniciando transcrição automática do áudio...`);
      context = await transcribeAudio(base64, mimeType, name);
      if (context) {
        const words = context.split(/\s+/).length;
        step(`Áudio "${name}" transcrito — ${words} palavras.`);
      } else {
        step(`Não foi possível transcrever o áudio "${name}".`);
      }
      break;
    }

    default: {
      step(`Tipo de arquivo não reconhecido: "${name}".`);
      break;
    }
  }

  return { context, label: fileTypeLabel, name };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION CALLING (TOOLS)
// ═══════════════════════════════════════════════════════════════════════════════

function buildTools(userRole) {
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
  const tools = [
    { name:'listarDivergenciasAtivas', description:'Lista as divergências de frete/peso que precisam de correção.',
      parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER', description:'Máx de itens (padrão 5)' }, status:{ type:'STRING', description:'Filtro de status' } } } },
    { name:'enviarParaFilaDeCorrecao', description:'Marca uma divergência como PENDENTE_ENVIO.',
      parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER', description:'ID da divergência' } }, required:['divergenciaId'] } },
    { name:'ignorarDivergencia', description:'Marca uma divergência como IGNORADA.',
      parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER', description:'ID da divergência' } }, required:['divergenciaId'] } },
    { name:'marcarDivergenciaCorrigida', description:'Marca uma divergência como CORRIGIDO manualmente.',
      parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER', description:'ID da divergência' } }, required:['divergenciaId'] } },
    { name:'enviarLoteDivergencias', description:'Envia TODAS as divergências PENDENTE para a fila de correção.',
      parameters:{ type:'OBJECT', properties:{} } },
    { name:'consultarAgendador', description:'Verifica se a varredura automática está ativa.',
      parameters:{ type:'OBJECT', properties:{} } },
    { name:'ativarAgendador', description:'Liga a varredura automática.',
      parameters:{ type:'OBJECT', properties:{ intervaloMinutos:{ type:'INTEGER', description:'Intervalo em minutos' } }, required:['intervaloMinutos'] } },
    { name:'desativarAgendador', description:'Desliga a varredura automática.',
      parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarProdutos', description:'Lista produtos do catálogo com filtros.',
      parameters:{ type:'OBJECT', properties:{ busca:{ type:'STRING' }, limite:{ type:'INTEGER' }, semPeso:{ type:'BOOLEAN' }, semVinculo:{ type:'BOOLEAN' } } } },
    { name:'listarAvisosML', description:'Lista avisos ativos do Mercado Livre.',
      parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' } } } },
    { name:'consultarStatusConexaoML', description:'Verifica se a conta ML está conectada.',
      parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarHistoricoPrecos', description:'Lista histórico de alterações de preço.',
      parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, mlItemId:{ type:'STRING' } } } },
    { name:'resumoGeral', description:'Retorna resumo geral do sistema.',
      parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarPaginasDisponiveis', description:'Lista páginas disponíveis para o usuário.',
      parameters:{ type:'OBJECT', properties:{} } },
  ];

  if (isPrivileged) {
    tools.push(
      { name:'listarUsuariosPendentes', description:'Lista usuários aguardando aprovação.', parameters:{ type:'OBJECT', properties:{} } },
      { name:'aprovarUsuario', description:'Aprova o acesso de um usuário bloqueado.',
        parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'bloquearUsuario', description:'Bloqueia o acesso de um usuário.',
        parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'resumoGlobalPlataforma', description:'Retorna métricas globais. Apenas ADMIN/OWNER.',
        parameters:{ type:'OBJECT', properties:{} } },
    );
  }
  return [{ functionDeclarations: tools }];
}

async function executeTool(name, args, userId, userRole) {
  const uid = parseInt(userId);
  if (!uid) return { erro:'Usuário não identificado' };
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  try {
    switch (name) {
      case 'listarDivergenciasAtivas': {
        const limite = Math.min(args.limite || 5, 20);
        const where  = { usuarioId: uid };
        if (args.status) where.status = args.status;
        else where.status = { in:['PENDENTE','REINCIDENTE','PENDENTE_ENVIO'] };
        const divs = await prisma.divergencia.findMany({ where, take:limite, orderBy:{createdAt:'desc'},
          select:{id:true,mlItemId:true,titulo:true,pesoMl:true,pesoLocal:true,status:true,motivo:true} });
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
        const min = parseInt(args.intervaloMinutos) || 360;
        await prisma.agendadorConfig.upsert({ where:{usuarioId:uid}, update:{ativo:true,intervalo:min}, create:{usuarioId:uid,ativo:true,intervalo:min} });
        return { sucesso:true, mensagem:`Agendador ativado. Varredura a cada ${min} minutos.` };
      }
      case 'desativarAgendador': {
        await prisma.agendadorConfig.upsert({ where:{usuarioId:uid}, update:{ativo:false}, create:{usuarioId:uid,ativo:false,intervalo:360} });
        return { sucesso:true, mensagem:'Agendador desativado.' };
      }
      case 'listarProdutos': {
        const limite = Math.min(args.limite || 10, 30);
        const where  = { usuarioId:uid };
        if (args.semPeso)    where.pesoGramas = 0;
        if (args.semVinculo) where.mlItemId   = null;
        if (args.busca) where.OR = [{ nome:{contains:args.busca,mode:'insensitive'} }, { sku:{contains:args.busca,mode:'insensitive'} }];
        const produtos = await prisma.produto.findMany({ where, take:limite, orderBy:{id:'desc'},
          select:{id:true,sku:true,nome:true,preco:true,pesoGramas:true,mlItemId:true,status:true,eKit:true} });
        const total = await prisma.produto.count({ where:{usuarioId:uid} });
        return { produtos, totalNoCatalogo:total, exibindo:produtos.length };
      }
      case 'listarAvisosML': {
        const avisos = await prisma.avisoML.findMany({ where:{usuarioId:uid,resolvido:false}, take:Math.min(args.limite||5,20), orderBy:{createdAt:'desc'},
          select:{id:true,mlItemId:true,titulo:true,tipoAviso:true,mensagem:true,severidade:true} }).catch(()=>[]);
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
        const historico = await prisma.precificacaoHistorico.findMany({ where, take:Math.min(args.limite||5,20), orderBy:{criadoEm:'desc'},
          select:{mlItemId:true,titulo:true,preco:true,quantidade:true,criadoEm:true} }).catch(()=>[]);
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
        return { produtos:{total:totalProd}, divergencias:{pendente,reincidente,corrigido,ignorado,pendenteEnvio:penEnvio,totalAtivas:pendente+reincidente}, avisosML:avisos,
          agendador:agendador?{ativo:agendador.ativo,intervalo:agendador.intervalo}:{ativo:false},
          conexaoML:token?{nickname:token.nickname,valida:new Date()<new Date(token.expiresAt)}:{conectado:false} };
      }
      case 'listarPaginasDisponiveis': {
        const caps   = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
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
  } catch (e) {
    return { erro:`Falha ao executar ${name}: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemInstruction(ctx) {
  const { totalProdutos=0, totalDivergencias=0, userRole='USUARIO', usuarioAtual=null, isFirstMessage=false, dataBlock=null, fileContexts=[] } = ctx;
  const caps   = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
  const paginas = caps.paginasAcesso.map(p => `  • ${p} — ${PAGE_CATALOG[p]?.titulo || p}: ${PAGE_CATALOG[p]?.desc || ''}`).join('\n');
  const restrict = caps.restricoes.length ? caps.restricoes.map(r => `  ${r}`).join('\n') : '  (sem restrições)';
  const contextoDados = dataBlock || `Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`;
  const saudacao = isFirstMessage ? `Cumprimente ${usuarioAtual?.nome || 'o usuário'} rapidamente com emoji.` : 'Sem saudações. Direto ao ponto.';

  // Contexto de arquivos processados
  const fileBlock = fileContexts.length > 0
    ? `\n=== ARQUIVOS ENVIADOS PELO USUÁRIO ===\n${fileContexts.map(f => `[${f.label.toUpperCase()}] ${f.name}:\n${f.context}`).join('\n\n')}\n=== FIM DOS ARQUIVOS ===\n`
    : '';

  return `Você é a IA Analyiz — assistente agêntico especialista em e-commerce e logística.
Usuário: ${usuarioAtual?.nome || '?'} | Cargo: ${userRole} (${caps.desc})

=== PÁGINAS ACESSÍVEIS ===
${paginas}

=== RESTRIÇÕES ===
${restrict}

=== DADOS DO SISTEMA ===
${contextoDados}
${fileBlock}
=== FUNCIONALIDADES DE INTERFACE ===
• Alterar TEMA → ícone de paleta na barra do topo.
• Ajustar ZOOM → botões +/- na barra do topo.
• Editar PERFIL → avatar/nome no canto superior direito.
• Conectar ML → página /ml → "Conectar Mercado Livre".

=== FERRAMENTAS DISPONÍVEIS ===
EXECUTE imediatamente quando a intenção for clara:
• "aprova/libera/acesso" → listarUsuariosPendentes() + aprovarUsuario(id)
• "corrige/manda pra fila/resolver" → listarDivergenciasAtivas() + enviarParaFilaDeCorrecao(id)
• "ignora" → ignorarDivergencia(id)
• "liga agendador" → ativarAgendador(intervalo)
• "desliga agendador" → desativarAgendador()
• "já corrigi" → marcarDivergenciaCorrigida(id)
• "corrige tudo" → enviarLoteDivergencias()
• "minhas divergências" → listarDivergenciasAtivas()
• "resumo/como está" → resumoGeral()

REGRAS:
1. CONCISA E DIRETA — máx 2-3 parágrafos.
2. Use emojis contextualmente.
3. Confirme ações executadas com entusiasmo!
4. Use HTML básico (<b>, <i>, <br>). Sem Markdown.
5. ${saudacao}
6. Se há arquivos processados acima, analise-os conforme o pedido do usuário.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REASONING INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildReasoningInstruction(ctx) {
  const { userRole='USUARIO', usuarioAtual=null, dataBlock=null, hasFiles=false, fileTypes=[] } = ctx;
  const caps = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
  return `Você é o módulo de raciocínio interno da IA Analyiz.
Usuário: ${usuarioAtual?.nome || '?'} | Cargo: ${userRole} — ${caps.desc}
Dados do sistema: ${dataBlock ? 'disponíveis' : 'contexto básico'}
${hasFiles ? `Arquivos enviados: ${fileTypes.join(', ')}` : ''}

Produza um raciocínio técnico detalhado em português, SEM emojis, SEM markdown.
Cubra em 100-200 palavras:
1. Interpretação da intenção do usuário
2. ${hasFiles ? 'O que foi enviado e como será processado cada arquivo' : 'Se dados do banco serão consultados'}
3. Quais ferramentas ou ações serão executadas
4. Possíveis ambiguidades ou pontos de atenção
5. Como a resposta será estruturada

Escreva como engenheiro pensando em voz alta. Sem introduções ou conclusões formais.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GERA RACIOCÍNIO REAL EM STREAMING
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateReasoningStream(message, context, onChunk) {
  if (!process.env.GEMINI_API_KEY) return '';
  try {
    const ai = getClient();
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
      config: { systemInstruction: buildReasoningInstruction(context), temperature: 0.3, maxOutputTokens: 500, thinkingConfig:{ thinkingBudget:0 } },
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
  const { userRole='USUARIO', totalDivergencias=0, totalProdutos=0, hasFiles=false, fileTypes=[] } = context;
  const parts = [`Analisando solicitação do usuário com cargo ${userRole}.`];
  if (hasFiles) parts.push(`O usuário enviou arquivo(s): ${fileTypes.join(', ')}. Vou processar cada um antes de responder.`);
  if (/divergen|peso|frete|corrig/i.test(message || '')) parts.push(`Mensagem envolve divergências. ${totalDivergencias} ativas. Consultarei listarDivergenciasAtivas.`);
  else if (/produto|sku|catálogo/i.test(message || '')) parts.push(`Pergunta sobre catálogo de produtos. ${totalProdutos} itens. Usarei listarProdutos.`);
  else if (/resumo|status|como está/i.test(message || '')) parts.push(`Usuário quer panorama geral. Chamarei resumoGeral.`);
  else parts.push('Resposta informativa baseada no contexto disponível. Sem consulta ao banco necessária.');
  parts.push('Estruturarei resposta de forma concisa confirmando ações quando aplicável.');
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
// buildAnswer (sem stream, usado como fallback)
// ═══════════════════════════════════════════════════════════════════════════════

export async function buildAnswer(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai = getClient();
    const geminiHistory  = buildGeminiHistory(history);
    const useSearch      = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;
    const userId         = context.usuarioAtual?.id || 0;
    const userRole       = context.userRole || 'USUARIO';

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage }),
      temperature: 0.25, maxOutputTokens: 1000, topP: 0.9,
    };
    config.tools = useSearch ? [{ googleSearch:{} }] : buildTools(userRole);

    let contents = [...geminiHistory, { role:'user', parts:[{ text: message || '[imagem enviada]' }] }];
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

// ── Step messages ─────────────────────────────────────────────────────────────
export const TOOL_STEP_MESSAGES = {
  listarDivergenciasAtivas:   'Buscando divergências ativas no banco de dados...',
  enviarParaFilaDeCorrecao:   'Enviando divergência para a fila de correção via API...',
  enviarLoteDivergencias:     'Enviando todas as divergências pendentes para correção automática...',
  marcarDivergenciaCorrigida: 'Marcando divergência como corrigida manualmente...',
  ignorarDivergencia:         'Marcando divergência como ignorada...',
  listarUsuariosPendentes:    'Verificando usuários aguardando aprovação...',
  aprovarUsuario:             'Aprovando acesso do usuário...',
  bloquearUsuario:            'Bloqueando acesso do usuário...',
  consultarAgendador:         'Consultando configurações do agendador...',
  ativarAgendador:            'Ativando varredura automática...',
  desativarAgendador:         'Desativando agendador...',
  listarProdutos:             'Abrindo catálogo de produtos...',
  listarAvisosML:             'Verificando avisos do Mercado Livre...',
  consultarStatusConexaoML:   'Verificando status da conexão com o Mercado Livre...',
  listarHistoricoPrecos:      'Buscando histórico de preços dos anúncios...',
  resumoGeral:                'Compilando resumo geral do sistema...',
  listarPaginasDisponiveis:   'Listando páginas e recursos disponíveis...',
  resumoGlobalPlataforma:     'Coletando métricas globais da plataforma...',
};

// ═══════════════════════════════════════════════════════════════════════════════
// buildAnswerStream — pipeline principal com raciocínio + arquivos + tools
// ─────────────────────────────────────────────────────────────────────────────
// Fluxo SSE:
//   1. reasoning_start → reasoning_chunk (N) → reasoning_end
//   2. Para cada arquivo: step (processando) + step (concluído)
//   3. Para cada tool: step (executando) + tool_result
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
    const incomingFiles  = context.files || []; // { base64, mimeType, name, group }

    // ── FASE 1: Raciocínio em streaming ──────────────────────────────────────
    const hasFiles = incomingFiles.length > 0 || !!context.imageContext;
    const fileTypes = incomingFiles.map(f => f.group);
    if (context.imageBase64 || context.imageContext) fileTypes.unshift('image');

    if (onStep) onStep({ type:'reasoning_start' });

    let fullReasoning = '';
    try {
      fullReasoning = await generateReasoningStream(
        message,
        { ...context, isFirstMessage, hasFiles, fileTypes },
        (chunk) => { if (onStep) onStep({ type:'reasoning_chunk', text:chunk }); }
      );
    } catch (e) {
      fullReasoning = buildFallbackReasoning(message, { ...context, hasFiles, fileTypes });
      if (onStep) onStep({ type:'reasoning_chunk', text:fullReasoning });
    }
    if (onStep) onStep({ type:'reasoning_end', fullText:fullReasoning });

    // ── FASE 2: Processa cada arquivo ─────────────────────────────────────────
    const fileContexts = [];

    // Imagem principal (campo legado)
    if (context.imageContext) {
      fileContexts.push({ label:'imagem', name:'imagem enviada', context:context.imageContext });
    }

    // Arquivos adicionais (PDF, Excel, TXT, áudio, imagens extras)
    for (const file of incomingFiles) {
      const result = await processFileToContext(file, message, onStep);
      if (result.context) fileContexts.push(result);
    }

    // ── FASE 3: Pipeline principal com tools ──────────────────────────────────
    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage, fileContexts }),
      temperature: 0.25, maxOutputTokens: 1200, topP: 0.9,
    };
    config.tools = useSearch ? [{ googleSearch:{} }] : buildTools(userRole);

    if (onStep && incomingFiles.length > 0) {
      onStep({ type:'step', msg:'Preparando resposta com base nos arquivos processados...' });
    }

    let contents = [...geminiHistory, { role:'user', parts:[{ text: message || '[arquivo enviado]' }] }];
    let response = await ai.models.generateContent({ model, config, contents });

    if (response.candidates?.[0]?.finishReason === 'SAFETY')
      return { reply:'Mensagem bloqueada por segurança.', sources:[], reasoning:fullReasoning, toolsExecutadas:[] };

    // Loop de tools
    const toolsExecutadas = [];
    let callCount = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && callCount < 5) {
      callCount++;
      const call = response.functionCalls[0];
      toolsExecutadas.push(call.name);
      const stepMsg = TOOL_STEP_MESSAGES[call.name] || `Executando ${call.name}...`;
      if (onStep) onStep({ type:'step', msg:stepMsg, tool:call.name, args:call.args });
      contents.push({ role:'model', parts:[{ functionCall:{ name:call.name, args:call.args } }] });
      const apiResult = await executeTool(call.name, call.args, userId, userRole);
      const ok = !apiResult?.erro;
      if (onStep) onStep({ type:'tool_result', tool:call.name, ok, msg: ok ? `${call.name} concluído` : `Erro: ${apiResult?.erro}` });
      contents.push({ role:'user', parts:[{ functionResponse:{ name:call.name, response:apiResult } }] });
      response = await ai.models.generateContent({ model, config, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply:getFallback(), sources:[], reasoning:fullReasoning, toolsExecutadas:[] };

    const reply  = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter(c => c.web?.uri).map(c => ({ label:c.web.title||c.web.uri, url:c.web.uri })).slice(0,3);

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