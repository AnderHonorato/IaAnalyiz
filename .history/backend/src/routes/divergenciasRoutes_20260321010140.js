// src/routes/divergenciasRoutes.js
//
// Rotas para o sistema de divergências com:
//  - Histórico por divergência (quem fez, quando, o que fez)
//  - Avisos do ML (health issues / anúncios desativados)
//  - PENDENTE_ENVIO: envio em massa de correções via API
//  - Lógica de corrigido: manual vs via API
//  - Rotas de produto com campos ficha técnica (ean, marca, modelo, condicao)

import express from 'express';
import axios   from 'axios';
import { prisma } from '../prisma.js';

const router = express.Router();

// ── Helper: buscar token ML ────────────────────────────────────────────────
async function getTokenML(userId) {
  const t = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!t) throw new Error('Token ML não encontrado.');
  if (new Date() >= new Date(t.expiresAt)) throw new Error('Token ML expirado. Reconecte nas configurações.');
  return t;
}

// ── Helper: registrar histórico ────────────────────────────────────────────
async function registrarHistorico(divergenciaId, usuarioId, acao, descricao, detalhes = null) {
  try {
    await prisma.divergenciaHistorico.create({
      data: {
        divergenciaId: parseInt(divergenciaId),
        usuarioId:     parseInt(usuarioId),
        acao,
        descricao,
        detalhes: detalhes ? JSON.stringify(detalhes) : null,
      },
    });
  } catch (e) {
    console.warn('[DivHistorico] Falha ao registrar:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DIVERGÊNCIAS — CRUD + STATUS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/api/divergencias', async (req, res) => {
  try {
    const { status, plataforma, userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const where = { usuarioId: parseInt(userId) };
    if (plataforma) where.plataforma = plataforma;
    if (status && status !== 'TODOS') where.status = status;
    else if (!status) where.status = 'PENDENTE';
    const div = await prisma.divergencia.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao buscar divergências.' }); }
});

router.get('/api/divergencias/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    const uid = parseInt(userId);
    const [pendente, corrigido, ignorado, reincidente, pendenteEnvio] = await Promise.all([
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE_ENVIO' } }),
    ]);
    res.json({
      pendente, corrigido, ignorado, reincidente, pendenteEnvio,
      total: pendente + corrigido + ignorado + reincidente + pendenteEnvio,
    });
  } catch { res.status(500).json({ error: 'Erro ao buscar stats.' }); }
});

// ── Marcar como CORRIGIDO MANUAL (usuário confirmou que corrigiu no ML) ────
router.put('/api/divergencias/:id/corrigido-manual', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'CORRIGIDO', resolvido: true, corrigidoManual: true, corrigidoViaApi: false },
    });
    await registrarHistorico(req.params.id, userId, 'CORRIGIDO_MANUAL',
      'Usuário confirmou que corrigiu manualmente no Mercado Livre.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// ── Marcar como CORRIGIDO VIA API (sistema enviou a correção) ──────────────
router.put('/api/divergencias/:id/corrigido-api', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'CORRIGIDO', resolvido: true, corrigidoViaApi: true, corrigidoManual: false },
    });
    await registrarHistorico(req.params.id, userId, 'CORRIGIDO_API',
      'Correção enviada automaticamente via API do Mercado Livre pelo sistema.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// ── Marcar como PENDENTE_ENVIO (fila de envio em massa) ────────────────────
router.put('/api/divergencias/:id/pendente-envio', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'PENDENTE_ENVIO' },
    });
    await registrarHistorico(req.params.id, userId, 'PENDENTE_ENVIO',
      'Adicionado à fila de envio em massa para correção via API.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// ── Marcar como PENDENTE (reverter) ────────────────────────────────────────
router.put('/api/divergencias/:id/pendente', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'PENDENTE', resolvido: false, corrigidoViaApi: false, corrigidoManual: false },
    });
    await registrarHistorico(req.params.id, userId || 0, 'REABERTO', 'Divergência reaberta como pendente.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// ── Marcar como IGNORADO ───────────────────────────────────────────────────
router.put('/api/divergencias/:id/ignorado', async (req, res) => {
  const { userId } = req.body;
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'IGNORADO', resolvido: false },
    });
    await registrarHistorico(req.params.id, userId || 0, 'IGNORADO', 'Divergência marcada como ignorada.');
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// ── Excluir ────────────────────────────────────────────────────────────────
router.delete('/api/divergencias/:id', async (req, res) => {
  try { await prisma.divergencia.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/api/divergencias/limpar/corrigidas', async (req, res) => {
  try {
    const where = { status: 'CORRIGIDO', ...(req.query.userId ? { usuarioId: parseInt(req.query.userId) } : {}) };
    const { count } = await prisma.divergencia.deleteMany({ where });
    res.json({ ok: true, removidas: count });
  } catch { res.status(500).json({ error: 'Erro' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// HISTÓRICO DE DIVERGÊNCIA (por item)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/api/divergencias/:id/historico', async (req, res) => {
  try {
    const historico = await prisma.divergenciaHistorico.findMany({
      where: { divergenciaId: parseInt(req.params.id) },
      orderBy: { createdAt: 'desc' },
      include: {
        usuario: { select: { id: true, nome: true, avatar: true, role: true } },
      },
    });
    res.json(historico);
  } catch { res.status(500).json({ error: 'Erro ao buscar histórico.' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENVIO EM MASSA — corrige via API do ML todos os PENDENTE_ENVIO
// ═══════════════════════════════════════════════════════════════════════════

router.post('/api/divergencias/envio-massa', async (req, res) => {
  const { userId, ids } = req.body; // ids: array de divergenciaId para enviar (ou vazio = todos PENDENTE_ENVIO)

  try {
    const uid = parseInt(userId);
    const token = await getTokenML(uid);
    const mlApi = axios.create({
      baseURL: 'https://api.mercadolibre.com',
      headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    // Busca divergências para enviar
    const where = { usuarioId: uid, status: 'PENDENTE_ENVIO' };
    if (ids && ids.length > 0) where.id = { in: ids.map(Number) };

    const divergencias = await prisma.divergencia.findMany({ where, orderBy: { createdAt: 'asc' } });

    if (divergencias.length === 0) {
      return res.json({ ok: true, total: 0, sucesso: 0, erros: 0, resultados: [] });
    }

    // Para cada divergência, busca o produto local vinculado para obter o peso correto
    const resultados = [];

    for (const div of divergencias) {
      const mlItemId = div.mlItemId;

      try {
        // Busca produto local vinculado
        const produto = await prisma.produto.findFirst({
          where: { usuarioId: uid, mlItemId },
          include: { itensDoKit: { include: { produto: true } } },
        });

        const pesoCorreto = produto?.eKit && produto?.itensDoKit?.length > 0
          ? produto.itensDoKit.reduce((s, k) => s + k.quantidade * (k.produto.pesoGramas || 0), 0)
          : produto?.pesoGramas || div.pesoLocal;

        if (!pesoCorreto || pesoCorreto <= 0) {
          resultados.push({ id: div.id, mlItemId, status: 'erro', msg: 'Peso local não encontrado' });
          continue;
        }

        // Busca dados atuais do item para obter available_quantity (obrigatório desde 18/03/2026)
        const itemRes = await mlApi.get(`/items/${mlItemId}`);
        const itemData = itemRes.data;
        const qtd = itemData.available_quantity ?? 1;

        // Monta atributosFicha com peso + dimensões (se disponíveis no produto)
        const atributosFicha = { peso: pesoCorreto };
        if (produto?.alturaCm)      atributosFicha.altura     = produto.alturaCm;
        if (produto?.larguraCm)     atributosFicha.largura    = produto.larguraCm;
        if (produto?.comprimentoCm) atributosFicha.comprimento = produto.comprimentoCm;
        if (produto?.ean)           atributosFicha.ean        = produto.ean;
        if (produto?.marca)         atributosFicha.marca      = produto.marca;
        if (produto?.modelo)        atributosFicha.modelo     = produto.modelo;

        // Monta payload de atributos ML
        const attributes = [];
        if (atributosFicha.peso)         attributes.push({ id: 'PACKAGE_WEIGHT',  value_name: `${atributosFicha.peso} g` });
        if (atributosFicha.altura)       attributes.push({ id: 'PACKAGE_HEIGHT',  value_name: `${atributosFicha.altura} cm` });
        if (atributosFicha.largura)      attributes.push({ id: 'PACKAGE_WIDTH',   value_name: `${atributosFicha.largura} cm` });
        if (atributosFicha.comprimento)  attributes.push({ id: 'PACKAGE_LENGTH',  value_name: `${atributosFicha.comprimento} cm` });
        if (atributosFicha.ean)          attributes.push({ id: 'GTIN',            value_name: String(atributosFicha.ean) });
        if (atributosFicha.marca)        attributes.push({ id: 'BRAND',           value_name: String(atributosFicha.marca) });
        if (atributosFicha.modelo)       attributes.push({ id: 'MODEL',           value_name: String(atributosFicha.modelo) });

        const updatePayload = { attributes, available_quantity: qtd };

        // Envia para o ML
        await mlApi.put(`/items/${mlItemId}`, updatePayload);

        // Atualiza status no banco
        await prisma.divergencia.update({
          where: { id: div.id },
          data: { status: 'CORRIGIDO', resolvido: true, corrigidoViaApi: true, corrigidoManual: false },
        });

        await registrarHistorico(div.id, uid, 'CORRIGIDO_API',
          `Correção enviada via envio em massa. Peso: ${pesoCorreto}g.`,
          { pesoAntes: div.pesoMl, pesoDepois: pesoCorreto, atributos: atributosFicha }
        );

        // Resolve aviso ML relacionado se existir
        await prisma.avisoML.updateMany({
          where: { usuarioId: uid, mlItemId, resolvido: false },
          data: { resolvido: true, resolvidoEm: new Date() },
        }).catch(() => {});

        resultados.push({ id: div.id, mlItemId, titulo: div.titulo, status: 'ok', pesoEnviado: pesoCorreto });

      } catch (err) {
        const msgErr = err.response?.data?.message || err.message || 'Erro desconhecido';
        resultados.push({ id: div.id, mlItemId, titulo: div.titulo, status: 'erro', msg: msgErr });

        await registrarHistorico(div.id, uid, 'ERRO_API',
          `Falha ao enviar via API: ${msgErr}`
        );
      }

      // Pausa anti-rate-limit entre itens
      await new Promise(r => setTimeout(r, 600));
    }

    const sucesso = resultados.filter(r => r.status === 'ok').length;
    const erros   = resultados.filter(r => r.status === 'erro').length;

    res.json({ ok: true, total: divergencias.length, sucesso, erros, resultados });

  } catch (err) {
    console.error('[EnvioMassa]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AVISOS DO ML — health issues / anúncios desativados
// ═══════════════════════════════════════════════════════════════════════════

// GET — busca avisos do banco
router.get('/api/ml/avisos', async (req, res) => {
  const { userId, resolvido } = req.query;
  try {
    const where = { usuarioId: parseInt(userId) };
    if (resolvido !== undefined) where.resolvido = resolvido === 'true';
    const avisos = await prisma.avisoML.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(avisos);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// POST — sincroniza avisos do ML (health issues da API)
// Chame esta rota depois de cada varredura do bot para capturar avisos novos
router.post('/api/ml/avisos/sincronizar', async (req, res) => {
  const { userId } = req.body;
  try {
    const uid   = parseInt(userId);
    const token = await getTokenML(uid);
    const mlApi = axios.create({
      baseURL: 'https://api.mercadolibre.com',
      headers: { Authorization: `Bearer ${token.accessToken}` },
      timeout: 20000,
    });

    // Busca todos os anúncios do usuário
    const meRes   = await mlApi.get('/users/me');
    const sellerId = meRes.data.id;

    const searchRes = await mlApi.get(`/users/${sellerId}/items/search?limit=100&status=active`);
    const ids = searchRes.data.results || [];

    // Busca também anúncios pausados (que podem ter sido desativados pelo ML)
    const pausedRes = await mlApi.get(`/users/${sellerId}/items/search?limit=100&status=paused`).catch(() => ({ data: { results: [] } }));
    const pausedIds = pausedRes.data.results || [];

    const todosIds = [...new Set([...ids, ...pausedIds])];
    if (todosIds.length === 0) return res.json({ ok: true, novos: 0, total: 0 });

    let novosAvisos = 0;
    const BATCH = 20;

    for (let i = 0; i < todosIds.length; i += BATCH) {
      const lote = todosIds.slice(i, i + BATCH);
      try {
        // Busca detalhes do lote
        const detRes = await mlApi.get(`/items?ids=${lote.join(',')}&attributes=id,title,thumbnail,status,health,shipping`);
        const items  = detRes.data || [];

        for (const entry of items) {
          const item = entry.body || entry;
          if (!item?.id) continue;

          const itemId  = item.id;
          const titulo  = item.title || itemId;
          const thumb   = item.thumbnail || null;
          const statusML = item.status || 'unknown';

          // Verifica health issues (avisos de dimensão/peso incorretos)
          const healthIssues = item.health?.issues || [];

          // Também detecta por status "paused" + shipping dimensions flag
          const isPaused     = statusML === 'paused' || statusML === 'under_review';
          const hasDimIssue  = isPaused && (
            JSON.stringify(item.shipping || {}).toLowerCase().includes('dimension') ||
            JSON.stringify(item.shipping || {}).toLowerCase().includes('weight')
          );

          // Processa health issues da API
          for (const issue of healthIssues) {
            const codigo    = issue.code || 'UNKNOWN';
            const msg       = issue.cause?.join('. ') || issue.message || issue.reference_value || JSON.stringify(issue);
            const isFrete   = /peso|weight|dimens|package|logist|frete|shipping/i.test(msg + codigo);

            if (!isFrete) continue; // só nos interessa avisos logísticos

            const tipo = /peso|weight/i.test(msg + codigo) ? 'PESO_INCORRETO' : 'DIMENSOES_INCORRETAS';
            const sev  = /critical|severe|bloqueado|desativado/i.test(msg) ? 'ALTO' : 'MEDIO';

            await prisma.avisoML.upsert({
              where: { usuarioId_mlItemId_tipoAviso: { usuarioId: uid, mlItemId: itemId, tipoAviso: tipo } },
              update: { mensagem: msg, severidade: sev, titulo, thumbnail: thumb, ativo: true, resolvido: false, updatedAt: new Date() },
              create: { usuarioId: uid, mlItemId: itemId, titulo, thumbnail: thumb, tipoAviso: tipo, mensagem: msg, severidade: sev },
            });
            novosAvisos++;
          }

          // Detecta anúncio pausado por problema de frete (fallback quando não há health issues)
          if (isPaused && hasDimIssue) {
            const msg = `Anúncio pausado pelo ML. Possível divergência de peso ou dimensões detectada.`;
            await prisma.avisoML.upsert({
              where: { usuarioId_mlItemId_tipoAviso: { usuarioId: uid, mlItemId: itemId, tipoAviso: 'ANUNCIO_PAUSADO' } },
              update: { mensagem: msg, titulo, thumbnail: thumb, ativo: true, resolvido: false, updatedAt: new Date() },
              create: { usuarioId: uid, mlItemId: itemId, titulo, thumbnail: thumb, tipoAviso: 'ANUNCIO_PAUSADO', mensagem: msg, severidade: 'ALTO' },
            });
            novosAvisos++;
          }

          // Se o item voltou a ficar ativo, marca avisos como resolvidos
          if (statusML === 'active' && healthIssues.length === 0) {
            await prisma.avisoML.updateMany({
              where: { usuarioId: uid, mlItemId: itemId, resolvido: false },
              data: { resolvido: true, resolvidoEm: new Date() },
            });
          }
        }
      } catch (e) {
        console.warn(`[AvisosML] Erro no lote ${i}:`, e.message);
      }

      await new Promise(r => setTimeout(r, 400));
    }

    const totalAtivos = await prisma.avisoML.count({ where: { usuarioId: uid, resolvido: false } });
    res.json({ ok: true, novos: novosAvisos, total: totalAtivos });

  } catch (err) {
    console.error('[AvisosML]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Marcar aviso como resolvido manualmente
router.put('/api/ml/avisos/:id/resolver', async (req, res) => {
  try {
    const aviso = await prisma.avisoML.update({
      where: { id: parseInt(req.params.id) },
      data: { resolvido: true, resolvidoEm: new Date() },
    });
    res.json(aviso);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// Contar avisos ativos (para badge no header)
router.get('/api/ml/avisos/count', async (req, res) => {
  try {
    const count = await prisma.avisoML.count({
      where: { usuarioId: parseInt(req.query.userId), resolvido: false },
    });
    res.json({ count });
  } catch { res.status(500).json({ count: 0 }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRODUTOS — com campos de ficha técnica
// ═══════════════════════════════════════════════════════════════════════════

router.get('/api/produtos', async (req, res) => {
  try {
    const { userId, categoria, status, search, plataforma } = req.query;
    const where = { usuarioId: parseInt(userId) };
    if (categoria)  where.categoria  = categoria;
    if (status)     where.status     = status;
    if (plataforma) where.plataforma = plataforma;
    if (search) where.OR = [
      { nome:     { contains: search, mode: 'insensitive' } },
      { sku:      { contains: search, mode: 'insensitive' } },
      { mlItemId: { contains: search, mode: 'insensitive' } },
    ];
    res.json(await prisma.produto.findMany({ where, include: { itensDoKit: { include: { produto: true } } }, orderBy: { id: 'desc' } }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/produtos/categorias', async (req, res) => {
  try {
    const cats = await prisma.produto.findMany({
      where: { usuarioId: parseInt(req.query.userId), categoria: { not: null } },
      select: { categoria: true }, distinct: ['categoria'],
    });
    res.json(cats.map(c => c.categoria).filter(Boolean).sort());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/produtos', async (req, res) => {
  try {
    const {
      userId, sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma,
      alturaCm, larguraCm, comprimentoCm, categoria, status, thumbnail,
      ean, marca, modelo, condicao,
    } = req.body;

    res.status(201).json(await prisma.produto.create({
      data: {
        usuarioId:     parseInt(userId),
        sku, nome,
        mlItemId:      mlItemId || null,
        eKit:          !!eKit,
        plataforma:    plataforma || 'Mercado Livre',
        preco:         parseFloat(preco)    || 0,
        pesoGramas:    parseInt(pesoGramas) || 0,
        alturaCm:      parseFloat(alturaCm)      || 0,
        larguraCm:     parseFloat(larguraCm)     || 0,
        comprimentoCm: parseFloat(comprimentoCm) || 0,
        categoria:     categoria  || null,
        status:        status     || 'active',
        thumbnail:     thumbnail  || null,
        // Ficha técnica
        ean:      ean      || null,
        marca:    marca    || null,
        modelo:   modelo   || null,
        condicao: condicao || 'Novo',
      },
    }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/api/produtos/:id', async (req, res) => {
  try {
    const {
      sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma,
      alturaCm, larguraCm, comprimentoCm, categoria, status, thumbnail,
      ean, marca, modelo, condicao,
    } = req.body;

    res.json(await prisma.produto.update({
      where: { id: parseInt(req.params.id) },
      data: {
        sku, nome,
        mlItemId:      mlItemId || null,
        eKit:          !!eKit,
        plataforma:    plataforma || 'Mercado Livre',
        preco:         parseFloat(preco)    || 0,
        pesoGramas:    parseInt(pesoGramas) || 0,
        alturaCm:      parseFloat(alturaCm)      || 0,
        larguraCm:     parseFloat(larguraCm)     || 0,
        comprimentoCm: parseFloat(comprimentoCm) || 0,
        categoria:     categoria  || null,
        status:        status     || 'active',
        thumbnail:     thumbnail  || null,
        // Ficha técnica
        ean:      ean      || null,
        marca:    marca    || null,
        modelo:   modelo   || null,
        condicao: condicao || 'Novo',
      },
    }));
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
      if (existing) {
        await prisma.produto.update({ where: { id: existing.id }, data: { nome: p.nome, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null } });
        atualizados++;
      } else {
        await prisma.produto.create({ data: { usuarioId: uid, sku: p.sku || `ML-${Date.now()}`, nome: p.nome, mlItemId: p.mlItemId, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null, plataforma: 'Mercado Livre', eKit: false } });
        criados++;
      }
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
        if (pBase) {
          pesoTotal += pBase.pesoGramas * parseInt(item.quantidade);
          await prisma.kitItem.create({ data: { kitId: id, produtoId: pBase.id, quantidade: parseInt(item.quantidade) } });
        }
      }
    } else { pesoTotal = parseInt(pesoManual) || 0; }
    res.json(await prisma.produto.update({ where: { id }, data: { plataforma: 'Mercado Livre', eKit, pesoGramas: pesoTotal } }));
  } catch (e) { res.status(500).json({ error: 'Erro ao vincular.' }); }
});

router.put('/api/produtos/:id/desvincular', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.kitItem.deleteMany({ where: { kitId: id } });
    res.json(await prisma.produto.update({ where: { id }, data: { plataforma: 'ML_PENDENTE', eKit: false, pesoGramas: 0 } }));
  } catch (e) { res.status(500).json({ error: 'Erro ao desvincular.' }); }
});

export default router;