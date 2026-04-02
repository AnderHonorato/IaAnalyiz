// ═══════════════════════════════════════════════════════════════════════════════
//  DIVERGÊNCIAS E AVISOS ML — Rotas de Gestão de Discrepâncias de Peso/Frete
// ═══════════════════════════════════════════════════════════════════════════════
//
// Este módulo exporta todas as rotas relacionadas a divergências (discrepâncias
// de peso/frete/dimensões entre o sistema local e o Mercado Livre), avisos de
// saúde de anúncios (health issues) e gestão de produtos com composição em kits.
//
// Funcionalidades principais:
// • Listar, filtrar e atualizar status de divergências (PENDENTE, CORRIGIDO, etc)
// • Registrar histórico de ações em cada divergência para auditoria
// • Envio em massa de correções de peso/dimensão via API ML
// • Sincronização de avisos de saúde de anúncios com o Mercado Livre
// • CRUD de produtos com suporte a kits (produtos que contêm outros produtos)
//
// Fluxo típico de divergência:
// 1. IA Analyiz detecta discrepância entre peso local vs. ML
// 2. Usuário vê divergência com status PENDENTE
// 3. Usuário: a) marca como PENDENTE_ENVIO, b) marca ignorado, ou c) corrige manual
// 4. Se PENDENTE_ENVIO → envio em massa atualiza peso no ML automaticamente
// 5. Histórico completo registrado em divergenciaHistorico para rastreabilidade
//
// Dependências:
// • Express: framework de roteamento
// • Axios: chamadas HTTP para API do Mercado Livre
// • Prisma: queries de banco de dados (usuário, divergência, produto, etc)

import express from 'express';
import axios   from 'axios';
import { prisma } from '../prisma.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Buscar token OAuth do Mercado Livre com validação de expiração
// ─────────────────────────────────────────────────────────────────────────────
// Recupera o token armazenado para um usuário específico e valida se ainda é
// válido (não expirou). Lança erro se token não existe ou expirou.
//
// Params:
//   @userId (number|string) - ID do usuário proprietário do token
//
// Returns:
//   @token (object) - Objeto MlToken com accessToken, refreshToken, expiresAt
//
// Erros:
//   • "Token ML não encontrado." - usuário nunca conectou com ML
//   • "Token ML expirado. Reconecte..." - token foi expirado
async function getTokenML(userId) {
  const t = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!t) throw new Error('Token ML não encontrado.');
  if (new Date() >= new Date(t.expiresAt)) throw new Error('Token ML expirado. Reconecte nas configurações.');
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Registrar ação no histórico de divergência (auditoria)
// ─────────────────────────────────────────────────────────────────────────────
// Cria um registro permanente de cada ação executada em uma divergência, para
// que administrador possa rastrear toda a jornada: criação → análise → correção →
// resolução. Essencial para conformidade e debugging.
//
// Params:
//   @divergenciaId (number) - ID da divergência alvo
//   @usuarioId (number) - ID do usuário que executou a ação
//   @acao (string) - Tipo de ação: CORRIGIDO_MANUAL, CORRIGIDO_API, REABERTO, etc
//   @descricao (string) - Descrição legível da ação (e.g., "Usuário confirmou...")
//   @detalhes (object, opcional) - Contexto adicional (antes/depois, erros) - será JSON
//
// Retorno: void (silencioso) - erros são apenas logados, nunca propagados
async function registrarHistorico(divergenciaId, usuarioId, acao, descricao, detalhes = null) {
  try {
    await prisma.divergenciaHistorico.create({
      data: { divergenciaId: parseInt(divergenciaId), usuarioId: parseInt(usuarioId), acao, descricao, detalhes: detalhes ? JSON.stringify(detalhes) : null },
    });
  } catch (e) { console.warn('[DivHistorico] Falha:', e.message); }
}


// ═════════════════════════════════════════════════════════════════════════════════
// 🔍 LEITURA DE DIVERGÊNCIAS — Queries para buscar e filtrar
// ═════════════════════════════════════════════════════════════════════════════════

// GET /api/divergencias
// ─────────────────────────────────────────────────────────────────────────────
// Lista todas as divergências do usuário com filtros opcionais por status,
// plataforma, etc. Retorna ordenado por data de criação (mais recente primeiro).
//
// Query params:
//   @userId (required) - ID do usuário autenticado
//   @status (optional) - Filtrar por status: PENDENTE, CORRIGIDO, IGNORADO, REINCIDENTE, PENDENTE_ENVIO
//                        Padrão: PENDENTE se não informado
//   @plataforma (optional) - Filtrar por plataforma (e.g., "Mercado Livre")
//
// Response:
//   Array de objetos Divergencia com campos: id, titulo, pesoLocal, pesoMl, status, etc
//   Status 400 se userId não informado, 500 se erro de DB
router.get('/api/divergencias', async (req, res) => {
  try {
    const { status, plataforma, userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const where = { usuarioId: parseInt(userId) };
    if (plataforma) where.plataforma = plataforma;
    if (status && status !== 'TODOS') where.status = status;
    else if (!status) where.status = 'PENDENTE';
    res.json(await prisma.divergencia.findMany({ where, orderBy: { createdAt: 'desc' } }));
  } catch { res.status(500).json({ error: 'Erro ao buscar divergências.' }); }
});

// GET /api/divergencias/todas
// ─────────────────────────────────────────────────────────────────────────────
// Rota especial que busca TODAS as divergências do usuário SEM filtro de status.
// Usada pelo modal de "envio em massa" donde usuário quer visualizar todos os
// casos, independente de já terem sido resolvidos ou não.
//
// Query params:
//   @userId (required) - ID do usuário autenticado
//
// Response:
//   Array de TODAS as divergências ordenadas por recência
router.get('/api/divergencias/todas', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    res.json(await prisma.divergencia.findMany({ where: { usuarioId: parseInt(userId) }, orderBy: { createdAt: 'desc' } }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// GET /api/divergencias/stats
// ─────────────────────────────────────────────────────────────────────────────
// Retorna contagem de divergências por status: PENDENTE, CORRIGIDO, IGNORADO,
// REINCIDENTE, PENDENTE_ENVIO. Usado para exibir dashboard com métricas.
// Faz 5 queries em paralelo (Promise.all) para performance.
//
// Query params:
//   @userId (required) - ID do usuário autenticado
//
// Response:
//   { pendente: 5, corrigido: 12, ignorado: 3, reincidente: 1, pendenteEnvio: 2, total: 23 }
router.get('/api/divergencias/stats', async (req, res) => {
  try {
    const uid = parseInt(req.query.userId);
    const [pendente, corrigido, ignorado, reincidente, pendenteEnvio] = await Promise.all([
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE_ENVIO' } }),
    ]);
    res.json({ pendente, corrigido, ignorado, reincidente, pendenteEnvio, total: pendente + corrigido + ignorado + reincidente + pendenteEnvio });
  } catch { res.status(500).json({ error: 'Erro ao buscar stats.' }); }
});


// ═════════════════════════════════════════════════════════════════════════════════
// ✏️  ATUALIZAÇÃO DE STATUS — Mudanças de estado da divergência
// ═════════════════════════════════════════════════════════════════════════════════

// PUT /api/divergencias/:id/corrigido-manual
// ─────────────────────────────────────────────────────────────────────────────
// Marca divergência como CORRIGIDO após usuário ter ajustado manualmente no 
// Mercado Livre (sem usar API). Registra a ação no histórico.
//
// Body:
//   @userId - ID do usuário que realizou a ação
//
// Response:
//   Objeto Divergencia atualizado com status=CORRIGIDO, resolvido=true
router.put('/api/divergencias/:id/corrigido-manual', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'CORRIGIDO', resolvido: true, corrigidoManual: true, corrigidoViaApi: false } });
    await registrarHistorico(req.params.id, userId, 'CORRIGIDO_MANUAL', 'Usuário confirmou correção manual no ML.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/divergencias/:id/corrigido-api
// ─────────────────────────────────────────────────────────────────────────────
// Marca como CORRIGIDO após a IA ter enviado correção automaticamente via API ML.
// Atualiza flags para evidenciar que a correção foi via automatização.
//
// Body:
//   @userId - ID do usuário
//
// Response:
//   Objeto Divergencia atualizado com status=CORRIGIDO, corrigidoViaApi=true
router.put('/api/divergencias/:id/corrigido-api', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'CORRIGIDO', resolvido: true, corrigidoViaApi: true, corrigidoManual: false } });
    await registrarHistorico(req.params.id, userId, 'CORRIGIDO_API', 'Correção enviada automaticamente via API.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/divergencias/:id/pendente-envio
// ─────────────────────────────────────────────────────────────────────────────
// Marca divergência como PENDENTE_ENVIO: fila aguardando processamento pelo
// endpoint de envio em massa. Usuário está dizendo "quer sim enviar correção
// via API". Esses itens são processados no POST /envio-massa.
//
// Body:
//   @userId - ID do usuário
//
// Response:
//   Objeto Divergencia com status=PENDENTE_ENVIO
router.put('/api/divergencias/:id/pendente-envio', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'PENDENTE_ENVIO' } });
    await registrarHistorico(req.params.id, userId, 'PENDENTE_ENVIO', 'Adicionado à fila de envio em massa via API.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/divergencias/:id/pendente
// ─────────────────────────────────────────────────────────────────────────────
// Reabre uma divergência marcando-a como PENDENTE (estado inicial). Desfaz
// qualquer status anterior (CORRIGIDO, IGNORADO, etc). Útil se usuário quer
// conferir novamente.
//
// Body:
//   @userId - ID do usuário
//
// Response:
//   Objeto Divergencia com status=PENDENTE, resolvido=false
router.put('/api/divergencias/:id/pendente', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'PENDENTE', resolvido: false, corrigidoViaApi: false, corrigidoManual: false } });
    await registrarHistorico(req.params.id, userId || 0, 'REABERTO', 'Divergência reaberta como pendente.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// PUT /api/divergencias/:id/ignorado
// ─────────────────────────────────────────────────────────────────────────────
// Marca divergência como IGNORADO: usuário não quer corrigir essa discrepância.
// Pode ser por falso positivo, item descontinuado, ou decisão de negócio.
// Resolvido fica false porque não foi efetivamente corrigido.
//
// Body:
//   @userId - ID do usuário
//
// Response:
//   Objeto Divergencia com status=IGNORADO
router.put('/api/divergencias/:id/ignorado', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'IGNORADO', resolvido: false } });
    await registrarHistorico(req.params.id, userId || 0, 'IGNORADO', 'Divergência marcada como ignorada.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});


// ═════════════════════════════════════════════════════════════════════════════════
// 🗑️  DELEÇÃO E AUDITORIA
// ═════════════════════════════════════════════════════════════════════════════════

// DELETE /api/divergencias/:id
// ─────────────────────────────────────────────────────────────────────────────
// Remove uma divergência específica do banco. Operação crítica — histórico
// fica orfão se apenas se não conectado por foreign key.
//
// Response:
//   { ok: true } em caso de sucesso
//   Status 500 em caso de erro
router.delete('/api/divergencias/:id', async (req, res) => {
  try { await prisma.divergencia.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Erro' }); }
});

// DELETE /api/divergencias/limpar/corrigidas
// ─────────────────────────────────────────────────────────────────────────────
// Remove TODAS as divergências com status=CORRIGIDO, opcionalmente filtrado por
// usuário. Endpoint de limpeza/manutenção para não sobrecarregar histórico.
// Geralmente chamado por rotina de limpeza ou por admin.
//
// Query params:
//   @userId (optional) - Se informado, limpa apenas as de um usuário específico
//
// Response:
//   { ok: true, removidas: 42 } - quantidade deletada
router.delete('/api/divergencias/limpar/corrigidas', async (req, res) => {
  try {
    const where = { status: 'CORRIGIDO', ...(req.query.userId ? { usuarioId: parseInt(req.query.userId) } : {}) };
    const { count } = await prisma.divergencia.deleteMany({ where });
    res.json({ ok: true, removidas: count });
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/divergencias/:id/historico
// ─────────────────────────────────────────────────────────────────────────────
// Retorna o histórico completo de ações realizadas em uma divergência específica.
// Cada registro inclui: ação (CORRIGIDO_MANUAL, CORRIGIDO_API, etc), descrição,
// timestamp, usuário que fez a ação, e detalhes contextuais (quando existem).
//
// Response:
//   Array de objetos DivergenciaHistorico, ordenados por recência (DESC)
//   Cada objeto inclui `usuario` com dados: nome, avatar, role
router.get('/api/divergencias/:id/historico', async (req, res) => {
  try {
    res.json(await prisma.divergenciaHistorico.findMany({
      where: { divergenciaId: parseInt(req.params.id) }, orderBy: { createdAt: 'desc' },
      include: { usuario: { select: { id: true, nome: true, avatar: true, role: true } } },
    }));
  } catch { res.status(500).json({ error: 'Erro ao buscar histórico.' }); }
});

// ── ENVIO EM MASSA ────────────────────────────────────────────────────────────
router.post('/api/divergencias/envio-massa', async (req, res) => {
  const { userId, ids } = req.body;
  try {
    const uid   = parseInt(userId);
    const token = await getTokenML(uid);
    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' }, timeout: 20000 });

    const where = { usuarioId: uid, status: 'PENDENTE_ENVIO' };
    if (ids && ids.length > 0) where.id = { in: ids.map(Number) };

    const divergencias = await prisma.divergencia.findMany({ where, orderBy: { createdAt: 'asc' } });
    if (divergencias.length === 0) return res.json({ ok: true, total: 0, sucesso: 0, erros: 0, resultados: [] });

    const resultados = [];
    for (const div of divergencias) {
      const mlItemId = div.mlItemId;
      try {
        const produto = await prisma.produto.findFirst({ where: { usuarioId: uid, mlItemId }, include: { itensDoKit: { include: { produto: true } } } });
        const pesoCorreto = produto?.eKit && produto?.itensDoKit?.length > 0
          ? produto.itensDoKit.reduce((s, k) => s + k.quantidade * (k.produto.pesoGramas || 0), 0)
          : produto?.pesoGramas || div.pesoLocal;

        if (!pesoCorreto || pesoCorreto <= 0) { resultados.push({ id: div.id, mlItemId, status: 'erro', msg: 'Peso local não encontrado' }); continue; }

        const itemRes = await mlApi.get(`/items/${mlItemId}`);
        const qtd    = itemRes.data.available_quantity ?? 1;

        const attributes = [{ id: 'PACKAGE_WEIGHT', value_name: `${pesoCorreto} g` }];
        if (produto?.alturaCm)      attributes.push({ id: 'PACKAGE_HEIGHT', value_name: `${produto.alturaCm} cm` });
        if (produto?.larguraCm)     attributes.push({ id: 'PACKAGE_WIDTH',  value_name: `${produto.larguraCm} cm` });
        if (produto?.comprimentoCm) attributes.push({ id: 'PACKAGE_LENGTH', value_name: `${produto.comprimentoCm} cm` });
        if (produto?.ean)           attributes.push({ id: 'GTIN',  value_name: String(produto.ean) });
        if (produto?.marca)         attributes.push({ id: 'BRAND', value_name: String(produto.marca) });
        if (produto?.modelo)        attributes.push({ id: 'MODEL', value_name: String(produto.modelo) });

        await mlApi.put(`/items/${mlItemId}`, { attributes, available_quantity: qtd });

        await prisma.divergencia.update({ where: { id: div.id }, data: { status: 'CORRIGIDO', resolvido: true, corrigidoViaApi: true, corrigidoManual: false } });
        await registrarHistorico(div.id, uid, 'CORRIGIDO_API', `Correção enviada via envio em massa. Peso: ${pesoCorreto}g.`, { pesoAntes: div.pesoMl, pesoDepois: pesoCorreto });
        await prisma.avisoML.updateMany({ where: { usuarioId: uid, mlItemId, resolvido: false }, data: { resolvido: true, resolvidoEm: new Date() } }).catch(() => {});

        resultados.push({ id: div.id, mlItemId, titulo: div.titulo, status: 'ok', pesoEnviado: pesoCorreto });
      } catch (err) {
        const msgErr = err.response?.data?.message || err.message || 'Erro desconhecido';
        resultados.push({ id: div.id, mlItemId, titulo: div.titulo, status: 'erro', msg: msgErr });
        await registrarHistorico(div.id, uid, 'ERRO_API', `Falha: ${msgErr}`);
      }
      await new Promise(r => setTimeout(r, 600));
    }

    const sucesso = resultados.filter(r => r.status === 'ok').length;
    const erros   = resultados.filter(r => r.status === 'erro').length;
    res.json({ ok: true, total: divergencias.length, sucesso, erros, resultados });
  } catch (err) { console.error('[EnvioMassa]', err.message); res.status(500).json({ error: err.message }); }
});

// ── AVISOS ML ─────────────────────────────────────────────────────────────────
router.get('/api/ml/avisos', async (req, res) => {
  const { userId, resolvido } = req.query;
  try {
    const where = { usuarioId: parseInt(userId) };
    if (resolvido !== undefined) where.resolvido = resolvido === 'true';
    res.json(await prisma.avisoML.findMany({ where, orderBy: { createdAt: 'desc' } }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/ml/avisos/sincronizar', async (req, res) => {
  const { userId } = req.body;
  try {
    const uid   = parseInt(userId);
    const token = await getTokenML(uid);
    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` }, timeout: 20000 });
    const meRes = await mlApi.get('/users/me'); const sellerId = meRes.data.id;
    const searchRes = await mlApi.get(`/users/${sellerId}/items/search?limit=100&status=active`);
    const ids = searchRes.data.results || [];
    const pausedRes = await mlApi.get(`/users/${sellerId}/items/search?limit=100&status=paused`).catch(() => ({ data: { results: [] } }));
    const todosIds = [...new Set([...ids, ...(pausedRes.data.results || [])])];
    if (todosIds.length === 0) return res.json({ ok: true, novos: 0, total: 0 });
    let novosAvisos = 0;
    for (let i = 0; i < todosIds.length; i += 20) {
      const lote = todosIds.slice(i, i + 20);
      try {
        const detRes = await mlApi.get(`/items?ids=${lote.join(',')}&attributes=id,title,thumbnail,status,health,shipping`);
        for (const entry of (detRes.data || [])) {
          const item = entry.body || entry; if (!item?.id) continue;
          const itemId = item.id, titulo = item.title || itemId, thumb = item.thumbnail || null, statusML = item.status || 'unknown';
          const healthIssues = item.health?.issues || [];
          for (const issue of healthIssues) {
            const codigo = issue.code || 'UNKNOWN', msg = issue.cause?.join('. ') || issue.message || JSON.stringify(issue);
            if (!/peso|weight|dimens|package|logist|frete|shipping/i.test(msg + codigo)) continue;
            const tipo = /peso|weight/i.test(msg + codigo) ? 'PESO_INCORRETO' : 'DIMENSOES_INCORRETAS';
            const sev  = /critical|severe|bloqueado|desativado/i.test(msg) ? 'ALTO' : 'MEDIO';
            await prisma.avisoML.upsert({ where: { usuarioId_mlItemId_tipoAviso: { usuarioId: uid, mlItemId: itemId, tipoAviso: tipo } }, update: { mensagem: msg, severidade: sev, titulo, thumbnail: thumb, ativo: true, resolvido: false, updatedAt: new Date() }, create: { usuarioId: uid, mlItemId: itemId, titulo, thumbnail: thumb, tipoAviso: tipo, mensagem: msg, severidade: sev } });
            novosAvisos++;
          }
          if (statusML === 'active' && healthIssues.length === 0) await prisma.avisoML.updateMany({ where: { usuarioId: uid, mlItemId: itemId, resolvido: false }, data: { resolvido: true, resolvidoEm: new Date() } });
        }
      } catch (e) { console.warn(`[AvisosML] Erro lote ${i}:`, e.message); }
      await new Promise(r => setTimeout(r, 400));
    }
    const totalAtivos = await prisma.avisoML.count({ where: { usuarioId: uid, resolvido: false } });
    res.json({ ok: true, novos: novosAvisos, total: totalAtivos });
  } catch (err) { console.error('[AvisosML]', err.message); res.status(500).json({ error: err.message }); }
});

router.put('/api/ml/avisos/:id/resolver', async (req, res) => {
  try { res.json(await prisma.avisoML.update({ where: { id: parseInt(req.params.id) }, data: { resolvido: true, resolvidoEm: new Date() } })); }
  catch { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/api/ml/avisos/count', async (req, res) => {
  try { res.json({ count: await prisma.avisoML.count({ where: { usuarioId: parseInt(req.query.userId), resolvido: false } }) }); }
  catch { res.status(500).json({ count: 0 }); }
});

// ── PRODUTOS — com descrição ──────────────────────────────────────────────────
router.get('/api/produtos', async (req, res) => {
  try {
    const { userId, categoria, status, search, plataforma } = req.query;
    const where = { usuarioId: parseInt(userId) };
    if (categoria)  where.categoria  = categoria;
    if (status)     where.status     = status;
    if (plataforma) where.plataforma = plataforma;
    if (search) where.OR = [{ nome: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }, { mlItemId: { contains: search, mode: 'insensitive' } }];
    res.json(await prisma.produto.findMany({ where, include: { itensDoKit: { include: { produto: true } } }, orderBy: { id: 'desc' } }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/produtos/categorias', async (req, res) => {
  try {
    const cats = await prisma.produto.findMany({ where: { usuarioId: parseInt(req.query.userId), categoria: { not: null } }, select: { categoria: true }, distinct: ['categoria'] });
    res.json(cats.map(c => c.categoria).filter(Boolean).sort());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper para extrair campos comuns do body do produto
function parseProdutoBody(body) {
  const { sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma, alturaCm, larguraCm, comprimentoCm, categoria, status, thumbnail, ean, marca, modelo, condicao, descricao } = body;
  return {
    sku, nome,
    mlItemId:      mlItemId || null,
    eKit:          !!eKit,
    plataforma:    plataforma || 'Mercado Livre',
    preco:         parseFloat(preco)         || 0,
    pesoGramas:    parseInt(pesoGramas)      || 0,
    alturaCm:      parseFloat(alturaCm)      || 0,
    larguraCm:     parseFloat(larguraCm)     || 0,
    comprimentoCm: parseFloat(comprimentoCm) || 0,
    categoria:     categoria  || null,
    status:        status     || 'active',
    thumbnail:     thumbnail  || null,
    ean:           ean        || null,
    marca:         marca      || null,
    modelo:        modelo     || null,
    condicao:      condicao   || 'Novo',
    descricao:     descricao  || null, // ← campo novo
  };
}

router.post('/api/produtos', async (req, res) => {
  try {
    const data = parseProdutoBody(req.body);
    res.status(201).json(await prisma.produto.create({ data: { usuarioId: parseInt(req.body.userId), ...data } }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/api/produtos/:id', async (req, res) => {
  try {
    res.json(await prisma.produto.update({ where: { id: parseInt(req.params.id) }, data: parseProdutoBody(req.body) }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/api/produtos/:id', async (req, res) => {
  try { await prisma.produto.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/api/produtos/import-batch', async (req, res) => {
  try {
    const { userId, produtos } = req.body;
    const uid = parseInt(userId);
    let criados = 0, atualizados = 0;
    for (const p of produtos) {
      const existing = await prisma.produto.findFirst({ where: { usuarioId: uid, mlItemId: p.mlItemId } });
      if (existing) { await prisma.produto.update({ where: { id: existing.id }, data: { nome: p.nome, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null } }); atualizados++; }
      else { await prisma.produto.create({ data: { usuarioId: uid, sku: p.sku || `ML-${Date.now()}`, nome: p.nome, mlItemId: p.mlItemId, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null, plataforma: 'Mercado Livre', eKit: false } }); criados++; }
    }
    res.json({ ok: true, criados, atualizados });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/api/produtos/:id/vincular', async (req, res) => {
  try {
    const { composicao, pesoManual } = req.body;
    const id = parseInt(req.params.id);
    let pesoTotal = 0, eKit = false;
    await prisma.kitItem.deleteMany({ where: { kitId: id } });
    if (composicao && composicao.length > 0) {
      eKit = true;
      for (const item of composicao) {
        const pBase = await prisma.produto.findUnique({ where: { id: parseInt(item.produtoId) } });
        if (pBase) { pesoTotal += pBase.pesoGramas * parseInt(item.quantidade); await prisma.kitItem.create({ data: { kitId: id, produtoId: pBase.id, quantidade: parseInt(item.quantidade) } }); }
      }
    } else { pesoTotal = parseInt(pesoManual) || 0; }
    res.json(await prisma.produto.update({ where: { id }, data: { plataforma: 'Mercado Livre', eKit, pesoGramas: pesoTotal } }));
  } catch { res.status(500).json({ error: 'Erro ao vincular.' }); }
});

router.put('/api/produtos/:id/desvincular', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.kitItem.deleteMany({ where: { kitId: id } });
    res.json(await prisma.produto.update({ where: { id }, data: { plataforma: 'ML_PENDENTE', eKit: false, pesoGramas: 0 } }));
  } catch { res.status(500).json({ error: 'Erro ao desvincular.' }); }
});

export default router;