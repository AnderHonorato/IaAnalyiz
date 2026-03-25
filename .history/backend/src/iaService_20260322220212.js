// backend/src/iaService.js — IA Agêntica v2 — Mais Ferramentas, Role Restrictions, Catálogo de Páginas

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;

// ── Catálogo completo de páginas do sistema ───────────────────────────────────
// Descoberto dinamicamente pelo backend — não hardcoded no front
export const PAGE_CATALOG = {
  '/':                { titulo: 'Home / Dashboard',           desc: 'Visão geral do sistema, métricas principais, cards de acesso rápido', roles: ['USUARIO','ADMIN','OWNER'] },
  '/ml':              { titulo: 'Mercado Livre — Dashboard',  desc: 'Cards de acesso para as ferramentas do ML: Radar de Fretes, Precificação, Pesquisa, Meus Anúncios, SAC', roles: ['USUARIO','ADMIN','OWNER'] },
  '/ml/auditoria':    { titulo: 'Radar de Fretes (Auditoria)', desc: 'Scanner de divergências de peso/frete nos anúncios ML. Bot SSE que varre anúncios em tempo real, detecta divergências e permite correção via API', roles: ['USUARIO','ADMIN','OWNER'] },
  '/ml/precos':       { titulo: 'Precificação ML',            desc: 'Gerenciamento de preços dos anúncios ML. Histórico de preços, atualização em lote', roles: ['USUARIO','ADMIN','OWNER'] },
  '/ml/pesquisa':     { titulo: 'Pesquisa de Anúncios',       desc: 'Pesquisa de anúncios do ML por link ou ID. Mostra preços, vendedores, concorrentes, opções de catálogo. Comparador de preços entre vendedores', roles: ['USUARIO','ADMIN','OWNER'] },
  '/ml/anuncios':     { titulo: 'Meus Anúncios ML',           desc: 'Lista os anúncios do próprio usuário no ML. Filtros por status (ativo/pausado/fechado), tags, exportação CSV', roles: ['USUARIO','ADMIN','OWNER'] },
  '/shopee':          { titulo: 'Shopee',                     desc: 'Integração com Shopee (em desenvolvimento)', roles: ['USUARIO','ADMIN','OWNER'] },
  '/amazon':          { titulo: 'Amazon',                     desc: 'Integração com Amazon (em desenvolvimento)', roles: ['USUARIO','ADMIN','OWNER'] },
  '/usuarios':        { titulo: 'Gerenciamento de Usuários',  desc: 'Lista e gerencia usuários da plataforma. Aprovar/bloquear acesso. Alterar roles', roles: ['OWNER'] },
};

// Mapa de capabilities por role — o que cada role pode fazer/ver
const ROLE_CAPABILITIES = {
  BLOQUEADO: { desc: 'Sem acesso. Apenas solicitar desbloqueio.', paginasAcesso: [], acoesPermitidas: [] },
  USUARIO: {
    desc: 'Acesso às ferramentas do próprio catálogo e anúncios.',
    paginasAcesso: ['/', '/ml', '/ml/auditoria', '/ml/precos', '/ml/pesquisa', '/ml/anuncios', '/shopee', '/amazon'],
    acoesPermitidas: ['ver próprios produtos', 'ver próprias divergências', 'ver próprios anúncios ML', 'corrigir divergências', 'pesquisar anúncios', 'configurar agendador', 'ver histórico de preços próprio'],
    restricoes: ['NÃO pode ver dados de outros usuários', 'NÃO pode ver lista de usuários', 'NÃO pode aprovar/bloquear usuários', 'NÃO pode ver métricas globais da plataforma'],
  },
  ADMIN: {
    desc: 'Acesso ampliado. Pode ver dados de todos os usuários.',
    paginasAcesso: Object.keys(PAGE_CATALOG),
    acoesPermitidas: ['tudo do USUARIO', 'ver dados de outros usuários', 'gerenciar usuários'],
    restricoes: ['NÃO pode excluir usuários permanentemente'],
  },
  OWNER: {
    desc: 'Acesso total ao sistema.',
    paginasAcesso: Object.keys(PAGE_CATALOG),
    acoesPermitidas: ['acesso total a tudo'],
    restricoes: [],
  },
};

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function buildGeminiHistory(history) {
  if (!history || history.length === 0) return [];
  const msgs = history.slice(0, -1);
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur = msgs[i], next = msgs[i + 1];
    if (cur.role === 'user' && next?.role === 'ia') {
      pairs.push({ user: stripHTML(cur.content).substring(0, 800), model: stripHTML(next.content).substring(0, 800) });
      i += 2;
    } else { i++; }
  }
  const result = [];
  for (const p of pairs.slice(-MAX_PAIRS)) {
    result.push({ role: 'user',  parts: [{ text: p.user }] });
    result.push({ role: 'model', parts: [{ text: p.model }] });
  }
  return result;
}

export function needsWebSearch(message) {
  if (!message) return false;
  const regex = /mercado\s*livre|ml\s*api|taxa|tarifa|comiss[ãa]o|frete|envio|correios|transportadora|tabela|política|regras?\s*do\s*ml|como\s+(vender|anunciar|calcular)|o\s+que\s+(é|são)\s+(o\s+)?ml|novidades?\s*(do|no)\s*ml|hora|horas|hoje|agora|clima|câmbio|dólar|notícia|busca|pesquis/i;
  return regex.test(message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FERRAMENTAS (FUNCTION CALLING) — v2
// ═══════════════════════════════════════════════════════════════════════════════

function buildTools(userRole) {
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  const tools = [
    // ── Divergências ─────────────────────────────────────────────────────────
    {
      name: 'listarDivergenciasAtivas',
      description: 'Lista as divergências de frete/peso que precisam de correção. Retorna ID interno necessário para ações.',
      parameters: {
        type: 'OBJECT',
        properties: {
          limite: { type: 'INTEGER', description: 'Máx de itens (padrão 5)' },
          status: { type: 'STRING', description: 'Filtro: PENDENTE, REINCIDENTE, PENDENTE_ENVIO, CORRIGIDO, IGNORADO. Omita para todos os ativos.' },
        },
      },
    },
    {
      name: 'enviarParaFilaDeCorrecao',
      description: 'Marca uma divergência como PENDENTE_ENVIO para ser corrigida via API do ML.',
      parameters: {
        type: 'OBJECT',
        properties: {
          divergenciaId: { type: 'INTEGER', description: 'ID numérico interno da divergência no banco' },
        },
        required: ['divergenciaId'],
      },
    },
    {
      name: 'ignorarDivergencia',
      description: 'Marca uma divergência como IGNORADA para parar de alertar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          divergenciaId: { type: 'INTEGER', description: 'ID numérico interno da divergência' },
        },
        required: ['divergenciaId'],
      },
    },
    {
      name: 'marcarDivergenciaCorrigida',
      description: 'Marca uma divergência como CORRIGIDO manualmente (usuário já corrigiu no ML).',
      parameters: {
        type: 'OBJECT',
        properties: {
          divergenciaId: { type: 'INTEGER', description: 'ID numérico interno da divergência' },
        },
        required: ['divergenciaId'],
      },
    },
    {
      name: 'enviarLoteDivergencias',
      description: 'Envia TODAS as divergências PENDENTE ativas para a fila de correção de uma vez. Ideal quando o usuário pede "corrija tudo".',
      parameters: { type: 'OBJECT', properties: {} },
    },

    // ── Agendador ─────────────────────────────────────────────────────────────
    {
      name: 'consultarAgendador',
      description: 'Verifica se a varredura automática está ativa e quando rodará.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'ativarAgendador',
      description: 'Liga a varredura automática de divergências.',
      parameters: {
        type: 'OBJECT',
        properties: {
          intervaloMinutos: { type: 'INTEGER', description: 'Intervalo em minutos (30, 60, 120, 240, 360)' },
        },
        required: ['intervaloMinutos'],
      },
    },
    {
      name: 'desativarAgendador',
      description: 'Desliga a varredura automática.',
      parameters: { type: 'OBJECT', properties: {} },
    },

    // ── Produtos ──────────────────────────────────────────────────────────────
    {
      name: 'listarProdutos',
      description: 'Lista produtos do catálogo do usuário com filtros.',
      parameters: {
        type: 'OBJECT',
        properties: {
          busca:  { type: 'STRING', description: 'Busca por nome ou SKU (opcional)' },
          limite: { type: 'INTEGER', description: 'Máx de resultados (padrão 10)' },
          semPeso: { type: 'BOOLEAN', description: 'Se true, retorna apenas produtos sem peso cadastrado' },
          semVinculo: { type: 'BOOLEAN', description: 'Se true, retorna produtos sem ID ML vinculado' },
        },
      },
    },

    // ── Anúncios ML ───────────────────────────────────────────────────────────
    {
      name: 'listarAvisosML',
      description: 'Lista avisos ativos do Mercado Livre sobre anúncios com problema (peso/dimensões incorretos, anúncios pausados etc).',
      parameters: {
        type: 'OBJECT',
        properties: {
          limite: { type: 'INTEGER', description: 'Máx de avisos (padrão 5)' },
        },
      },
    },
    {
      name: 'consultarStatusConexaoML',
      description: 'Verifica se a conta do Mercado Livre está conectada e válida.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'listarHistoricoPrecos',
      description: 'Lista o histórico recente de alterações de preço nos anúncios ML do usuário.',
      parameters: {
        type: 'OBJECT',
        properties: {
          limite: { type: 'INTEGER', description: 'Quantos registros (padrão 5)' },
          mlItemId: { type: 'STRING', description: 'ID do anúncio específico (opcional)' },
        },
      },
    },
    {
      name: 'resumoGeral',
      description: 'Retorna um resumo geral do estado do sistema do usuário: produtos, divergências, avisos, agendador.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'listarPaginasDisponiveis',
      description: 'Lista todas as páginas/seções disponíveis no sistema para o usuário, com descrição de cada uma.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ];

  // ── Ferramentas exclusivas de ADMIN/OWNER ────────────────────────────────
  if (isPrivileged) {
    tools.push(
      {
        name: 'listarUsuariosPendentes',
        description: 'Lista usuários aguardando aprovação de acesso ao sistema.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'aprovarUsuario',
        description: 'Aprova o acesso de um usuário bloqueado, alterando seu role para USUARIO.',
        parameters: {
          type: 'OBJECT',
          properties: {
            usuarioId: { type: 'INTEGER', description: 'ID do usuário a aprovar' },
          },
          required: ['usuarioId'],
        },
      },
      {
        name: 'bloquearUsuario',
        description: 'Bloqueia o acesso de um usuário.',
        parameters: {
          type: 'OBJECT',
          properties: {
            usuarioId: { type: 'INTEGER', description: 'ID do usuário a bloquear' },
          },
          required: ['usuarioId'],
        },
      },
      {
        name: 'resumoGlobalPlataforma',
        description: 'Retorna métricas globais de todos os usuários da plataforma (total produtos, divergências, sessões ativas etc). Apenas ADMIN/OWNER.',
        parameters: { type: 'OBJECT', properties: {} },
      }
    );
  }

  return [{ functionDeclarations: tools }];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTOR DAS FERRAMENTAS
// ═══════════════════════════════════════════════════════════════════════════════

async function executeTool(name, args, userId, userRole) {
  const uid = parseInt(userId);
  if (!uid) return { erro: 'Usuário não identificado' };
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  try {
    switch (name) {

      // ── Divergências ───────────────────────────────────────────────────────
      case 'listarDivergenciasAtivas': {
        const limite = Math.min(args.limite || 5, 20);
        const where = { usuarioId: uid };
        if (args.status) {
          where.status = args.status;
        } else {
          where.status = { in: ['PENDENTE', 'REINCIDENTE', 'PENDENTE_ENVIO'] };
        }
        const divs = await prisma.divergencia.findMany({
          where, take: limite, orderBy: { createdAt: 'desc' },
          select: { id: true, mlItemId: true, titulo: true, pesoMl: true, pesoLocal: true, status: true, motivo: true },
        });
        if (!divs.length) return { mensagem: '✅ Logística saudável! Nenhuma divergência ativa no momento.' };
        return { divergenciasEncontradas: divs, total: divs.length };
      }

      case 'enviarParaFilaDeCorrecao': {
        const div = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!div) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: div.id }, data: { status: 'PENDENTE_ENVIO' } });
        return { sucesso: true, mensagem: `✅ Divergência ${div.mlItemId} enviada para fila de correção via API!` };
      }

      case 'ignorarDivergencia': {
        const div = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!div) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: div.id }, data: { status: 'IGNORADO', resolvido: true } });
        return { sucesso: true, mensagem: `Divergência ${div.mlItemId} marcada como ignorada.` };
      }

      case 'marcarDivergenciaCorrigida': {
        const div = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!div) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: div.id }, data: { status: 'CORRIGIDO', resolvido: true, corrigidoManual: true } });
        await prisma.divergenciaHistorico.create({
          data: { divergenciaId: div.id, usuarioId: uid, acao: 'CORRIGIDO_MANUAL', descricao: 'Marcado como corrigido via chat com a IA' },
        }).catch(() => {});
        return { sucesso: true, mensagem: `✅ ${div.mlItemId} marcado como corrigido manualmente!` };
      }

      case 'enviarLoteDivergencias': {
        const result = await prisma.divergencia.updateMany({
          where: { usuarioId: uid, status: 'PENDENTE' },
          data: { status: 'PENDENTE_ENVIO' },
        });
        return { sucesso: true, mensagem: `✅ ${result.count} divergência(s) enviada(s) para a fila de correção via API!` };
      }

      // ── Agendador ─────────────────────────────────────────────────────────
      case 'consultarAgendador': {
        const ag = await prisma.agendadorConfig.findUnique({ where: { usuarioId: uid } });
        if (!ag) return { mensagem: 'Nenhum agendador configurado ainda.' };
        return {
          status: ag.ativo ? '🟢 Ativo' : '🔴 Inativo',
          intervaloMinutos: ag.intervalo,
          ultimaExecucao: ag.ultimaExecucao,
          proximaExecucao: ag.proximaExecucao,
        };
      }

      case 'ativarAgendador': {
        const min = parseInt(args.intervaloMinutos) || 360;
        await prisma.agendadorConfig.upsert({
          where: { usuarioId: uid },
          update: { ativo: true, intervalo: min },
          create: { usuarioId: uid, ativo: true, intervalo: min },
        });
        return { sucesso: true, mensagem: `✅ Agendador ativado! Varredura a cada ${min} minutos.` };
      }

      case 'desativarAgendador': {
        await prisma.agendadorConfig.upsert({
          where: { usuarioId: uid },
          update: { ativo: false },
          create: { usuarioId: uid, ativo: false, intervalo: 360 },
        });
        return { sucesso: true, mensagem: 'Agendador desativado. Varredura apenas manual.' };
      }

      // ── Produtos ──────────────────────────────────────────────────────────
      case 'listarProdutos': {
        const limite = Math.min(args.limite || 10, 30);
        const where = { usuarioId: uid };
        if (args.semPeso) where.pesoGramas = 0;
        if (args.semVinculo) where.mlItemId = null;
        if (args.busca) {
          where.OR = [
            { nome: { contains: args.busca, mode: 'insensitive' } },
            { sku: { contains: args.busca, mode: 'insensitive' } },
          ];
        }
        const produtos = await prisma.produto.findMany({
          where, take: limite, orderBy: { id: 'desc' },
          select: { id: true, sku: true, nome: true, preco: true, pesoGramas: true, mlItemId: true, status: true, eKit: true },
        });
        const total = await prisma.produto.count({ where: { usuarioId: uid } });
        return { produtos, totalNoCatalogo: total, exibindo: produtos.length };
      }

      // ── Avisos ML ─────────────────────────────────────────────────────────
      case 'listarAvisosML': {
        const avisos = await prisma.avisoML.findMany({
          where: { usuarioId: uid, resolvido: false },
          take: Math.min(args.limite || 5, 20),
          orderBy: { createdAt: 'desc' },
          select: { id: true, mlItemId: true, titulo: true, tipoAviso: true, mensagem: true, severidade: true },
        }).catch(() => []);
        if (!avisos.length) return { mensagem: '✅ Nenhum aviso ativo do Mercado Livre.' };
        return { avisos, total: avisos.length };
      }

      case 'consultarStatusConexaoML': {
        const token = await prisma.mlToken.findUnique({
          where: { usuarioId: uid },
          select: { nickname: true, expiresAt: true, mlUserId: true },
        });
        if (!token) return { conectado: false, mensagem: 'Conta ML não conectada. Acesse Configurações para conectar.' };
        const expirou = new Date() >= new Date(token.expiresAt);
        return {
          conectado: !expirou,
          nickname: token.nickname,
          mlUserId: token.mlUserId,
          status: expirou ? '🔴 Token expirado — reconecte nas configurações' : '🟢 Conectado e válido',
          expiresAt: token.expiresAt,
        };
      }

      case 'listarHistoricoPrecos': {
        const where = { usuarioId: uid };
        if (args.mlItemId) where.mlItemId = args.mlItemId;
        const historico = await prisma.precificacaoHistorico.findMany({
          where, take: Math.min(args.limite || 5, 20), orderBy: { criadoEm: 'desc' },
          select: { mlItemId: true, titulo: true, preco: true, quantidade: true, criadoEm: true, atualizadoPor: true },
        }).catch(() => []);
        if (!historico.length) return { mensagem: 'Nenhum histórico de preços encontrado.' };
        return { historico, total: historico.length };
      }

      case 'resumoGeral': {
        const [totalProd, pendente, reincidente, corrigido, ignorado, penEnvio, avisos, agendador, token] = await Promise.all([
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
          produtos: { total: totalProd },
          divergencias: { pendente, reincidente, corrigido, ignorado, pendenteEnvio: penEnvio, totalAtivas: pendente + reincidente },
          avisosML: avisos,
          agendador: agendador ? { ativo: agendador.ativo, intervalo: agendador.intervalo } : { ativo: false },
          conexaoML: token ? { nickname: token.nickname, valida: new Date() < new Date(token.expiresAt) } : { conectado: false },
        };
      }

      case 'listarPaginasDisponiveis': {
        const caps = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
        const paginas = caps.paginasAcesso.map(path => ({
          caminho: path,
          ...PAGE_CATALOG[path],
        }));
        return { paginas, totalAcesso: paginas.length };
      }

      // ── Admin/Owner exclusivos ─────────────────────────────────────────────
      case 'listarUsuariosPendentes': {
        if (!isPrivileged) return { erro: 'Sem permissão para esta ação.' };
        const pendentes = await prisma.usuario.findMany({
          where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
          select: { id: true, nome: true, email: true, createdAt: true },
        });
        if (!pendentes.length) return { mensagem: 'Nenhum usuário aguardando aprovação.' };
        return { usuariosPendentes: pendentes, total: pendentes.length };
      }

      case 'aprovarUsuario': {
        if (!isPrivileged) return { erro: 'Sem permissão para esta ação.' };
        const u = await prisma.usuario.findUnique({ where: { id: parseInt(args.usuarioId) } });
        if (!u) return { erro: 'Usuário não encontrado.' };
        await prisma.usuario.update({
          where: { id: u.id },
          data: { role: 'USUARIO', solicitouDesbloqueio: false },
        });
        return { sucesso: true, mensagem: `✅ Usuário ${u.nome} (${u.email}) aprovado com acesso USUARIO!` };
      }

      case 'bloquearUsuario': {
        if (!isPrivileged) return { erro: 'Sem permissão para esta ação.' };
        const u = await prisma.usuario.findUnique({ where: { id: parseInt(args.usuarioId) } });
        if (!u) return { erro: 'Usuário não encontrado.' };
        if (u.role === 'OWNER') return { erro: 'Não é possível bloquear um OWNER.' };
        await prisma.usuario.update({ where: { id: u.id }, data: { role: 'BLOQUEADO' } });
        return { sucesso: true, mensagem: `Usuário ${u.nome} bloqueado.` };
      }

      case 'resumoGlobalPlataforma': {
        if (!isPrivileged) return { erro: 'Sem permissão para esta ação.' };
        const [totalUsers, totalProd, totalDiv, sessOk] = await Promise.all([
          prisma.usuario.count(),
          prisma.produto.count(),
          prisma.divergencia.count({ where: { status: { in: ['PENDENTE','REINCIDENTE'] } } }),
          prisma.sessaoUsuario.count({ where: { ativo: true, entradaEm: { gte: new Date(Date.now() - 30*60*1000) } } }).catch(() => 0),
        ]);
        return { totalUsuarios: totalUsers, totalProdutos: totalProd, divergenciasAtivas: totalDiv, usuariosOnline: sessOk };
      }

      default:
        return { erro: `Função "${name}" não existe.` };
    }
  } catch (e) {
    return { erro: `Falha ao executar ${name}: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemInstruction(ctx) {
  const {
    totalProdutos = 0, totalDivergencias = 0, userRole = 'USUARIO',
    usuarioAtual = null, isFirstMessage = false, dataBlock = null,
  } = ctx;

  const caps     = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
  const paginasDoRole = caps.paginasAcesso
    .map(p => `  • ${p} — ${PAGE_CATALOG[p]?.titulo || p}: ${PAGE_CATALOG[p]?.desc || ''}`)
    .join('\n');
  const restricoes = caps.restricoes.length ? caps.restricoes.map(r => `  ⚠️ ${r}`).join('\n') : '  (sem restrições específicas)';

  const contextoDados = dataBlock || `Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`;
  const saudacao = isFirstMessage
    ? `Cumprimente ${usuarioAtual?.nome || 'o usuário'} rapidamente com emoji.`
    : 'Sem saudações. Direto ao ponto.';

  return `Você é a IA Analyiz — assistente agêntico especialista em e-commerce e logística.
Usuário: ${usuarioAtual?.nome || '?'} | Cargo: ${userRole} (${caps.desc})

=== PÁGINAS QUE O USUÁRIO PODE ACESSAR ===
${paginasDoRole}

=== RESTRIÇÕES DE DADOS PARA ESTE CARGO ===
${restricoes}
IMPORTANTE: Só informe dados que o próprio usuário pode ver na interface. Nunca revele dados de outros usuários para USUARIO padrão.

=== CONTEXTO DO SISTEMA (dados reais) ===
${contextoDados}

=== SUAS FERRAMENTAS (FUNCTION CALLING) ===
Você tem acesso a ferramentas reais do sistema. USE-AS ativamente:
• Para listar/corrigir divergências → use as funções de divergência
• Para verificar/ligar agendador → use as funções de agendador
• Para consultar produtos/avisos → use as funções respectivas
• Para ver estado geral → chame resumoGeral()
• Para saber quais páginas existem → chame listarPaginasDisponiveis()
NÃO mande o usuário clicar em botões se VOCÊ pode executar a ação por ele!

REGRAS DE RESPOSTA:
1. CONCISA E DIRETA — máx 2-3 parágrafos. Chat é pequeno.
2. Use emojis contextualmente.
3. Se executou ação via Tool → confirme o resultado de forma animada!
4. Use HTML básico (<b>, <i>, <br>). Sem Markdown.
5. ${saudacao}
6. Para USUARIO padrão: nunca mencione dados globais da plataforma, outros usuários ou funcionalidades restritas.`;
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
  return text
    .replace(/^(Claro[,!]\s*)/i, '')
    .replace(/^(Com certeza[,!]\s*)/i, '')
    .replace(/^(Entendido[,!]\s*)/i, '')
    .trim();
}

function getFallback() { return '⚠️ Conexão instável. Tente novamente em instantes!'; }

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL, config: { temperature: 0.2, maxOutputTokens: 600 },
      contents: [{ role: 'user', parts: [{ text: userQuestion || 'Descreva esta imagem.' }, { inlineData: { mimeType, data: base64 } }] }],
    });
    return response.text?.trim() || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE PRINCIPAL — buildAnswer com Function Calling
// ═══════════════════════════════════════════════════════════════════════════════

export async function buildAnswer(message, history = [], context = {}, attempt = 1) {
  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;
  try {
    const ai = getClient();
    const geminiHistory = buildGeminiHistory(history);
    const useSearch     = needsWebSearch(message);
    const isFirstMessage = history.length <= 1;
    const userId   = context.usuarioAtual?.id || 0;
    const userRole = context.userRole || 'USUARIO';

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, isFirstMessage }),
      temperature: 0.25,
      maxOutputTokens: 1000,
      topP: 0.9,
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    } else {
      config.tools = buildTools(userRole);
    }

    let contents = [...geminiHistory, { role: 'user', parts: [{ text: message || '[imagem enviada]' }] }];
    let response = await ai.models.generateContent({ model, config, contents });

    if (response.candidates?.[0]?.finishReason === 'SAFETY')
      return { reply: '🙏 Mensagem bloqueada por questões de segurança.', sources: [] };

    // Loop de Function Calling
    let callCount = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && callCount < 5) {
      callCount++;
      const call = response.functionCalls[0];

      console.log(`\x1b[35m[IA-Tools]\x1b[0m 🤖 Executando: ${call.name}`, call.args);

      contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] });
      const apiResult = await executeTool(call.name, call.args, userId, userRole);
      console.log(`\x1b[35m[IA-Tools]\x1b[0m ✅ Resultado devolvido à IA`);
      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: apiResult } }] });
      response = await ai.models.generateContent({ model, config, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply: getFallback(), sources: [] };

    const reply = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter(c => c.web?.uri).map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri })).slice(0, 3);

    return { reply, sources };

  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1)
      return buildAnswer(message, history, context, 2);
    console.error('[buildAnswer]', error.message);
    return { reply: getFallback(), sources: [] };
  }
}

export const sendChatMessage = buildAnswer;

export function buildResumoPrompt(dadosStr) {
  return `Você é um Consultor Especialista em Logística.
Analise os dados abaixo e produza um RELATÓRIO EXECUTIVO.

DADOS:
${typeof dadosStr === 'string' ? dadosStr : JSON.stringify(dadosStr, null, 2)}

ESTRUTURA (HTML limpo: <b>, <i>, <br>):
<b>📊 Diagnóstico Geral</b><br>...
<b>⚠️ Problemas Críticos</b><br>...
<b>📉 Análise de Risco</b><br>...
<b>✅ Plano de Ação Prioritário</b><br>...
<b>💡 Oportunidades</b><br>...`;
}

// ── Hash de contexto para deduplicação ────────────────────────────────────────
export function hashContexto(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex').substring(0, 12);
}