// src/routes/mlPrecosRoutes.js
// Rotas para a página de Precificação do Mercado Livre
//
// IMPORTANTE (API ML desde 18/03/2026):
//   PUT /items/{item_id} com apenas "price" retorna 400.
//   É obrigatório enviar pelo menos outro campo junto, como "available_quantity".

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

// ── GET /api/ml/precos/anuncios?userId=&status= ───────────────────────────────
// Retorna anúncios com id, título, preço, estoque, thumbnail, status
router.get('/anuncios', async (req, res) => {
  const { userId, status = 'active' } = req.query;
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
      const data = await mlGet(
        `/users/${sellerId}/items/search?status=${status}&limit=${limit}&offset=${offset}`,
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
    for (let i = 0; i < allIds.length; i += loteSize) {
      const lote = allIds.slice(i, i + loteSize);
      const detalheRes = await fetch(
        `${ML_API}/items?ids=${lote.join(',')}&attributes=id,title,price,available_quantity,thumbnail,status,permalink`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const detalheData = await detalheRes.json();
      for (const item of detalheData) {
        if (item.code === 200 && item.body) {
          anuncios.push({
            id:                 item.body.id,
            title:              item.body.title,
            price:              item.body.price,
            available_quantity: item.body.available_quantity,
            thumbnail:          item.body.thumbnail,
            status:             item.body.status,
            permalink:          item.body.permalink,
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

// ── PUT /api/ml/precos/atualizar ──────────────────────────────────────────────
// Body: { userId, mlItemId, price, available_quantity }
//
// Desde 18/03/2026 a API ML rejeita requests com apenas "price".
// Enviamos sempre price + available_quantity juntos.
router.put('/atualizar', async (req, res) => {
  const { userId, mlItemId, price, available_quantity } = req.body;

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

    res.json({
      ok:                 true,
      id:                 data.id,
      price:              data.price,
      available_quantity: data.available_quantity,
    });
  } catch (err) {
    console.error(`[MLPrecos] atualizar ${mlItemId}:`, err.message);
    // Retorna 200 com error:true para o frontend tratar sem travar
    res.json({ error: true, message: err.message });
  }
});

export default router;