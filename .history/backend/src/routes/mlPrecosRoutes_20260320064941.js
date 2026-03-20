// src/routes/mlPrecosRoutes.js
// Rotas para a página de Precificação do Mercado Livre
//
// IMPORTANTE (API ML desde 18/03/2026):
//   PUT /items/{item_id} com apenas "price" retorna 400.
//   É obrigatório enviar pelo menos outro campo junto, como "available_quantity".
//
// FUNCIONALIDADES:
//   - Buscar anúncios com paginação + filtro por categoria
//   - Atualizar preço individual (reflete no ML + salva no DB)
//   - Atualização em lote por array de IDs ou por SKU/MLB
//   - Histórico de preços por item
//   - Categorias salvas por usuário no DB

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const ML_API = 'https://api.mercadolibre.com';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(userId) {
  const token = await prisma.mlToken.findFirst({ where: { userId: parseInt(userId) } });
  if (!token) throw new Error('Token ML não encontrado para este usuário.');
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    throw new Error('Token ML expirado. Reconecte a conta.');
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `ML API error ${res.status}`);
  return data;
}

// Salva o preço no histórico local do DB
async function salvarHistoricoPreco(userId, mlItemId, preco, quantidade, titulo, categoriaId) {
  try {
    // Upsert no banco: atualiza o produto ML ou cria registro de histórico
    // Usa tabela PrecificacaoHistorico (ver schema abaixo)
    await prisma.precificacaoHistorico.create({
      data: {
        usuarioId: parseInt(userId),
        mlItemId,
        preco: parseFloat(preco),
        quantidade: parseInt(quantidade) || 1,
        titulo: titulo || '',
        categoriaId: categoriaId || '',
        criadoEm: new Date(),
      },
    });
  } catch (e) {
    // Silencia erros de histórico para não travar o fluxo principal
    console.warn('[MLPrecos] Falha ao salvar histórico:', e.message);
  }
}

// ── GET /api/ml/precos/anuncios ───────────────────────────────────────────────
// Query: userId, status (active|paused|closed), category (opcional)
router.get('/anuncios', async (req, res) => {
  const { userId, status = 'active', category } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

  try {
    const token = await getToken(userId);

    // 1. Dados do vendedor
    const me = await mlGet('/users/me', token);
    const sellerId = me.id;

    // 2. Busca IDs com paginação (máx 200)
    let offset = 0;
    const limit = 50;
    let allIds = [];
    while (true) {
      const params = new URLSearchParams({ status, limit, offset });
      if (category) params.set('category', category);
      const data = await mlGet(
        `/users/${sellerId}/items/search?${params.toString()}`,
        token
      );
      const ids = data.results || [];
      allIds = allIds.concat(ids);
      if (ids.length < limit || allIds.length >= 200) break;
      offset += limit;
    }

    if (allIds.length === 0) return res.json({ anuncios: [], total: 0 });

    // 3. Detalhes em lotes de 20
    const anuncios = [];
    const loteSize = 20;

    // Buscar produtos locais para cruzar SKU
    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
      select: { mlItemId: true, sku: true, nome: true },
    });
    const mapaSkuLocal = new Map(produtosLocais.map(p => [
      (p.mlItemId || '').toUpperCase(),
      p.sku,
    ]));

    // Buscar categorias salvas no DB para enriquecer nomes
    const categoriasDb = await prisma.mlCategoria.findMany({
      where: { usuarioId: parseInt(userId) },
    }).catch(() => []);
    const mapaCategoria = new Map(categoriasDb.map(c => [c.categoriaId, c.nome]));

    for (let i = 0; i < allIds.length; i += loteSize) {
      const lote = allIds.slice(i, i + loteSize);
      const detalheRes = await fetch(
        `${ML_API}/items?ids=${lote.join(',')}&attributes=id,title,price,available_quantity,thumbnail,status,permalink,category_id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const detalheData = await detalheRes.json();

      for (const item of detalheData) {
        if (item.code === 200 && item.body) {
          const b = item.body;
          const catId = b.category_id || '';

          // Se a categoria não está no cache local, busca na ML e salva
          if (catId && !mapaCategoria.has(catId)) {
            try {
              const catData = await mlGet(`/categories/${catId}`, token);
              const catNome = catData.name || catId;
              mapaCategoria.set(catId, catNome);

              // Persiste no DB para evitar re-busca
              await prisma.mlCategoria.upsert({
                where: {
                  usuarioId_categoriaId: {
                    usuarioId: parseInt(userId),
                    categoriaId: catId,
                  }
                },
                update: { nome: catNome },
                create: {
                  usuarioId: parseInt(userId),
                  categoriaId: catId,
                  nome: catNome,
                },
              }).catch(() => {});
            } catch (_) {
              mapaCategoria.set(catId, catId);
            }
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
// Retorna categorias salvas no DB para o usuário
router.get('/categorias', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const cats = await prisma.mlCategoria.findMany({
      where: { usuarioId: parseInt(userId) },
      orderBy: { nome: 'asc' },
    });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ml/precos/historico/:mlItemId ────────────────────────────────────
// Retorna histórico de preços de um anúncio
router.get('/historico/:mlItemId', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const historico = await prisma.precificacaoHistorico.findMany({
      where: {
        usuarioId: parseInt(userId),
        mlItemId: req.params.mlItemId,
      },
      orderBy: { criadoEm: 'desc' },
      take: 30,
    });
    res.json(historico);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/ml/precos/atualizar ──────────────────────────────────────────────
// Body: { userId, mlItemId, price, available_quantity }
// Atualiza no ML e persiste histórico no DB
router.put('/atualizar', async (req, res) => {
  const { userId, mlItemId, price, available_quantity, titulo, categoriaId } = req.body;

  if (!userId || !mlItemId || price == null) {
    return res.status(400).json({ error: 'userId, mlItemId e price são obrigatórios' });
  }

  const preco = parseFloat(price);
  if (isNaN(preco) || preco <= 0) {
    return res.status(400).json({ error: 'Preço inválido' });
  }

  const qtd = parseInt(available_quantity);
  if (isNaN(qtd) || qtd < 0) {
    return res.status(400).json({ error: 'available_quantity inválido' });
  }

  try {
    const token = await getToken(userId);

    // Envia os dois campos juntos — obrigatório desde 18/03/2026
    const data = await mlPut(`/items/${mlItemId}`, {
      price:              preco,
      available_quantity: qtd,
    }, token);

    // Persiste histórico no banco
    await salvarHistoricoPreco(userId, mlItemId, preco, qtd, titulo, categoriaId);

    // Atualiza tabela Produto local se existir vínculo
    await prisma.produto.updateMany({
      where: { usuarioId: parseInt(userId), mlItemId },
      data:  { preco },
    }).catch(() => {});

    res.json({
      ok:                 true,
      id:                 data.id,
      price:              data.price,
      available_quantity: data.available_quantity,
    });
  } catch (err) {
    console.error(`[MLPrecos] atualizar ${mlItemId}:`, err.message);
    res.json({ error: true, message: err.message });
  }
});

// ── PUT /api/ml/precos/atualizar-lote ─────────────────────────────────────────
// Body: { userId, itens: [{ mlItemId, price, available_quantity, sku? }] }
// Alternativa server-side ao loop do frontend, com melhor controle de rate limit
router.put('/atualizar-lote', async (req, res) => {
  const { userId, itens } = req.body;
  if (!userId || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'userId e itens[] são obrigatórios' });
  }

  const token = await getToken(userId).catch(e => { throw e; });
  const resultados = [];

  for (const item of itens) {
    // Resolve mlItemId via SKU caso necessário
    let mlItemId = item.mlItemId;
    if (!mlItemId && item.sku) {
      const prod = await prisma.produto.findFirst({
        where: { usuarioId: parseInt(userId), sku: item.sku },
        select: { mlItemId: true },
      });
      mlItemId = prod?.mlItemId || null;
    }

    if (!mlItemId) {
      resultados.push({ sku: item.sku, status: 'erro', msg: 'Anúncio ML não encontrado para este SKU' });
      continue;
    }

    const preco = parseFloat(item.price);
    const qtd   = parseInt(item.available_quantity) || 1;

    if (isNaN(preco) || preco <= 0) {
      resultados.push({ mlItemId, status: 'erro', msg: 'Preço inválido' });
      continue;
    }

    try {
      const data = await mlPut(`/items/${mlItemId}`, {
        price:              preco,
        available_quantity: qtd,
      }, token);

      await salvarHistoricoPreco(userId, mlItemId, preco, qtd, item.titulo, item.categoriaId);

      await prisma.produto.updateMany({
        where: { usuarioId: parseInt(userId), mlItemId },
        data:  { preco },
      }).catch(() => {});

      resultados.push({
        mlItemId,
        status:             'ok',
        price:              data.price,
        available_quantity: data.available_quantity,
      });
    } catch (err) {
      resultados.push({ mlItemId, status: 'erro', msg: err.message });
    }

    // Pausa entre requisições para respeitar rate limit do ML
    await new Promise(r => setTimeout(r, 350));
  }

  const okCount  = resultados.filter(r => r.status === 'ok').length;
  const errCount = resultados.filter(r => r.status === 'erro').length;

  res.json({ ok: true, total: itens.length, sucesso: okCount, erros: errCount, resultados });
});

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA PRISMA — adicione ao seu schema.prisma:
// ═══════════════════════════════════════════════════════════════════════════
//
// model PrecificacaoHistorico {
//   id          Int      @id @default(autoincrement())
//   usuarioId   Int
//   usuario     Usuario  @relation(fields: [usuarioId], references: [id])
//   mlItemId    String
//   preco       Float
//   quantidade  Int      @default(1)
//   titulo      String   @default("")
//   categoriaId String   @default("")
//   atualizadoPor String? // futuramente: nome do user
//   criadoEm   DateTime  @default(now())
// }
//
// model MlCategoria {
//   id          Int     @id @default(autoincrement())
//   usuarioId   Int
//   usuario     Usuario @relation(fields: [usuarioId], references: [id])
//   categoriaId String
//   nome        String
//
//   @@unique([usuarioId, categoriaId])
// }
//
// Adicione também em Usuario:
//   precificacaoHistorico PrecificacaoHistorico[]
//   mlCategorias          MlCategoria[]
//
// Depois rode: npx prisma migrate dev --name add_precificacao
// ═══════════════════════════════════════════════════════════════════════════