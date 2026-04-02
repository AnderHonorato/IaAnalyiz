/**
 * backend/src/routes/mlPrecosRoutes.js
 * 
 * Propósito:
 * Gerenciar precificação dinâmica de anúncios no Mercado Livre via API.
 * Permite atualizar preços e estoque em tempo real com histórico persistido.
 * 
 * Responsabilidades:
 * - GET /api/ml/precos/anuncios - Listar anúncios com preços atuais
 * - GET /api/ml/precos/:itemId - Detalhe de preço e histórico
 * - PUT /api/ml/precos/:itemId - Atualizar preço/estoque
 * - GET /api/ml/precos/historico - Histórico de alterações
 * - POST /api/ml/precos/atualizar-lote - Atualizar múltiplos anúncios
 * 
 * Integração Mercado Livre:
 * - Utiliza OAuth token armazenado em mlToken
 * - Comunica com ML API: https://api.mercadolibre.com
 * - PUT /items/:id para atualizar preço/estoque
 * - GET /users/me e GET /users/{sellerId}/items/search para listar
 * 
 * Persistência de Histórico:
 * - Cada alteração é registada em precificacaoHistorico
 * - Rastreia: usuário, itemId, preço, quantidade, timestamp
 * - Permite análise de variações de preço ao longo do tempo
 * 
 * Validações:
 * - Verifica token ML válido e não expirado
 * - Valida userId obrigatório
 * - Tratamento de erros da API do Mercado Livre
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 * @requires express, @prisma/client, axios
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma  = new PrismaClient();
const ML_API  = 'https://api.mercadolibre.com';

// ── Helpers ───────────────────────────────────────────────────────────────────

// BUG FIX: era `userId` — campo correto no schema é `usuarioId`
async function getToken(userId) {
  const token = await prisma.mlToken.findFirst({ where: { usuarioId: parseInt(userId) } });
  if (!token) throw new Error('Token ML não encontrado. Conecte o Mercado Livre.');
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    throw new Error('Token ML expirado. Reconecte a conta nas configurações.');
  }
  return token.accessToken;
}

async function mlGet(path, accessToken) {
  const res = await fetch(`${ML_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `ML API error ${res.status}`);
  }
  return res.json();
}

async function mlPut(path, body, accessToken) {
  const res = await fetch(`${ML_API}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `ML API error ${res.status}`);
  return data;
}

async function salvarHistoricoPreco(userId, mlItemId, preco, quantidade, titulo, categoriaId) {
  try {
    await prisma.precificacaoHistorico.create({
      data: {
        usuarioId:   parseInt(userId),
        mlItemId,
        preco:       parseFloat(preco),
        quantidade:  parseInt(quantidade) || 1,
        titulo:      titulo      || '',
        categoriaId: categoriaId || '',
        criadoEm:    new Date(),
      },
    });
  } catch (e) {
    console.warn('[MLPrecos] Falha ao salvar histórico:', e.message);
  }
}

// ── GET /api/ml/precos/anuncios ───────────────────────────────────────────────
router.get('/anuncios', async (req, res) => {
  const { userId, status = 'active', category } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

  try {
    const token    = await getToken(userId);
    const me       = await mlGet('/users/me', token);
    const sellerId = me.id;

    let offset = 0;
    const limit = 50;
    let allIds  = [];

    while (true) {
      const params = new URLSearchParams({ status, limit, offset });
      if (category) params.set('category', category);
      const data = await mlGet(`/users/${sellerId}/items/search?${params}`, token);
      const ids  = data.results || [];
      allIds = allIds.concat(ids);
      if (ids.length < limit || allIds.length >= 200) break;
      offset += limit;
    }

    if (allIds.length === 0) return res.json({ anuncios: [], total: 0 });

    const anuncios       = [];
    const loteSize       = 20;
    const produtosLocais = await prisma.produto.findMany({
      where:  { usuarioId: parseInt(userId), mlItemId: { not: null } },
      select: { mlItemId: true, sku: true, nome: true },
    });
    const mapaSkuLocal = new Map(produtosLocais.map(p => [(p.mlItemId || '').toUpperCase(), p.sku]));

    const categoriasDb = await prisma.mlCategoria.findMany({ where: { usuarioId: parseInt(userId) } }).catch(() => []);
    const mapaCategoria = new Map(categoriasDb.map(c => [c.categoriaId, c.nome]));

    for (let i = 0; i < allIds.length; i += loteSize) {
      const lote       = allIds.slice(i, i + loteSize);
      const detalheRes = await fetch(
        `${ML_API}/items?ids=${lote.join(',')}&attributes=id,title,price,available_quantity,thumbnail,status,permalink,category_id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const detalheData = await detalheRes.json();

      for (const item of detalheData) {
        if (item.code === 200 && item.body) {
          const b     = item.body;
          const catId = b.category_id || '';

          if (catId && !mapaCategoria.has(catId)) {
            try {
              const catData = await mlGet(`/categories/${catId}`, token);
              const catNome = catData.name || catId;
              mapaCategoria.set(catId, catNome);
              await prisma.mlCategoria.upsert({
                where:  { usuarioId_categoriaId: { usuarioId: parseInt(userId), categoriaId: catId } },
                update: { nome: catNome },
                create: { usuarioId: parseInt(userId), categoriaId: catId, nome: catNome },
              }).catch(() => {});
            } catch (_) { mapaCategoria.set(catId, catId); }
          }

          anuncios.push({
            id:                 b.id,
            title:              b.title,
            price:              b.price,
            available_quantity: b.available_quantity,
            thumbnail:          b.thumbnail,
            status:             b.status,
            permalink:          b.permalink,
            category_id:        catId,
            category_name:      mapaCategoria.get(catId) || catId,
            sku:                mapaSkuLocal.get((b.id || '').toUpperCase()) || null,
          });
        }
      }
    }

    res.json({ anuncios, total: anuncios.length });
  } catch (err) {
    console.error('[MLPrecos] buscarAnuncios:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ml/precos/categorias ─────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    res.json(await prisma.mlCategoria.findMany({
      where:   { usuarioId: parseInt(userId) },
      orderBy: { nome: 'asc' },
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/ml/precos/historico/:mlItemId ────────────────────────────────────
router.get('/historico/:mlItemId', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    res.json(await prisma.precificacaoHistorico.findMany({
      where:   { usuarioId: parseInt(userId), mlItemId: req.params.mlItemId },
      orderBy: { criadoEm: 'desc' },
      take:    30,
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/ml/precos/atualizar ──────────────────────────────────────────────
router.put('/atualizar', async (req, res) => {
  const { userId, mlItemId, price, available_quantity, titulo, categoriaId } = req.body;

  if (!userId || !mlItemId || price == null)
    return res.status(400).json({ error: 'userId, mlItemId e price são obrigatórios' });

  const preco = parseFloat(price);
  if (isNaN(preco) || preco <= 0) return res.status(400).json({ error: 'Preço inválido' });

  const qtd = parseInt(available_quantity);
  if (isNaN(qtd) || qtd < 0) return res.status(400).json({ error: 'available_quantity inválido' });

  try {
    const token = await getToken(userId);
    const data  = await mlPut(`/items/${mlItemId}`, { price: preco, available_quantity: qtd }, token);

    await salvarHistoricoPreco(userId, mlItemId, preco, qtd, titulo, categoriaId);
    await prisma.produto.updateMany({
      where: { usuarioId: parseInt(userId), mlItemId },
      data:  { preco },
    }).catch(() => {});

    res.json({ ok: true, id: data.id, price: data.price, available_quantity: data.available_quantity });
  } catch (err) {
    console.error(`[MLPrecos] atualizar ${mlItemId}:`, err.message);
    res.json({ error: true, message: err.message });
  }
});

// ── PUT /api/ml/precos/atualizar-lote ─────────────────────────────────────────
router.put('/atualizar-lote', async (req, res) => {
  const { userId, itens } = req.body;
  if (!userId || !Array.isArray(itens) || itens.length === 0)
    return res.status(400).json({ error: 'userId e itens[] são obrigatórios' });

  let token;
  try { token = await getToken(userId); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const resultados = [];

  for (const item of itens) {
    let mlItemId = item.mlItemId;
    if (!mlItemId && item.sku) {
      const prod = await prisma.produto.findFirst({
        where:  { usuarioId: parseInt(userId), sku: item.sku },
        select: { mlItemId: true },
      });
      mlItemId = prod?.mlItemId || null;
    }

    if (!mlItemId) { resultados.push({ sku: item.sku, status: 'erro', msg: 'Anúncio ML não encontrado' }); continue; }

    const preco = parseFloat(item.price);
    const qtd   = parseInt(item.available_quantity) || 1;

    if (isNaN(preco) || preco <= 0) { resultados.push({ mlItemId, status: 'erro', msg: 'Preço inválido' }); continue; }

    try {
      const data = await mlPut(`/items/${mlItemId}`, { price: preco, available_quantity: qtd }, token);
      await salvarHistoricoPreco(userId, mlItemId, preco, qtd, item.titulo, item.categoriaId);
      await prisma.produto.updateMany({ where: { usuarioId: parseInt(userId), mlItemId }, data: { preco } }).catch(() => {});
      resultados.push({ mlItemId, status: 'ok', price: data.price, available_quantity: data.available_quantity });
    } catch (err) {
      resultados.push({ mlItemId, status: 'erro', msg: err.message });
    }

    await new Promise(r => setTimeout(r, 350));
  }

  const okCount  = resultados.filter(r => r.status === 'ok').length;
  const errCount = resultados.filter(r => r.status === 'erro').length;
  res.json({ ok: true, total: itens.length, sucesso: okCount, erros: errCount, resultados });
});

export default router;