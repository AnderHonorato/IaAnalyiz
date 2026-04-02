/**
 * backend/src/routes/mlAnunciosRoutes.js
 * 
 * Propósito:
 * Listar, gerenciar e sincronizar anúncios PRÓPRIOS do utilizador no Mercado Livre.
 * Fornece visualização completa com dados enriquecidos (preço, estoque, vendados, fotos).
 * 
 * Responsabilidades:
 * - GET /api/ml/meus-anuncios - Listar anúncios do seller com paginação
 * - GET /api/ml/meus-anuncios/:itemId - Detalhe completo do anúncio
 * - GET /api/ml/meus-anuncios/:itemId/descricao - Descrição HTML completa
 * - PUT /api/ml/meus-anuncios/:itemId - Atualizar anúncio (titulo, desc, fotos)
 * - GET /api/ml/meus-anuncios/categorias/trending - Categorias trending
 * 
 * Integração Mercado Livre:
 * - Utiliza OAuth token do mlToken
 * - Busca via GET /users/{sellerId}/items/search (paginado, max 50 por chamada)
 * - Detalhe via GET /items?ids=MLB1,MLB2,MLB3 (batch até 20 IDs)
 * - Descrição via GET /items/{id}/description (separada, lazy loaded)
 * 
 * Modelo de Dados:
 * - Cada anúncio traz: id, title, price, available_quantity, sold_quantity
 * - Shipping, pictures, attributes, condition, listing_type_id
 * - Permalink direto para o anúncio na ML
 * 
 * Paginação:
 * - limit: 200 (padrão) - quantidade de anúncios a retornar
 * - offset: 0 (padrão) - posição de início
 * - status: 'active', 'paused', 'closed' (filtra por status)
 * - Respeita a paginação interna da API (max 50 por chamada, faz múltiplas)
 * 
 * Cache e Performance:
 * - Batch GET /items/ids para economizar chamadas
 * - Descrição lazy-loaded (só carrega se solicitada explicitamente)
 * - Tratamento de throttling: 300ms entre batch calls
 * 
 * Casos de Uso:
 * - Página \"Meus Anúncios\" no frontend
 * - Sincronização com base local de produtos
 * - Auditoria de catálogo (compara local vs ML)
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 * @requires express, axios, @prisma/client
 */

// backend/src/routes/mlAnunciosRoutes.js
// Busca os anúncios PRÓPRIOS do usuário autenticado no ML
// GET /api/ml/meus-anuncios?userId=&limit=&offset=&status=

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

async function getMlApi(userId) {
  const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!token)                           throw new Error('Conta ML não conectada');
  if (new Date() >= new Date(token.expiresAt)) throw new Error('Token ML expirado — reconecte');
  return {
    api: axios.create({
      baseURL: 'https://api.mercadolibre.com',
      headers: { Authorization: `Bearer ${token.accessToken}` },
      timeout: 20000,
    }),
    mlUserId: token.mlUserId,
  };
}

// ── GET /api/ml/meus-anuncios ──────────────────────────────────────────────────
// Retorna todos os anúncios do seller com dados enriquecidos (preço, estoque, vendidos, etc.)
router.get('/api/ml/meus-anuncios', async (req, res) => {
  const { userId, limit = 200, offset = 0, status } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

  try {
    const { api, mlUserId } = await getMlApi(userId);

    // 1) Busca IDs dos anúncios do seller (max 50 por chamada; paginamos até o limite)
    const statusParam = status ? `&status=${status}` : '';
    const allIds      = [];
    let   scroll      = parseInt(offset);
    const maxPorPagina = 50;

    while (allIds.length < parseInt(limit)) {
      const searchRes = await api.get(
        `/users/${mlUserId}/items/search?limit=${maxPorPagina}&offset=${scroll}${statusParam}`
      );
      const { results = [], paging } = searchRes.data;
      allIds.push(...results);
      scroll += results.length;
      if (results.length < maxPorPagina || allIds.length >= parseInt(limit)) break;
      if (paging && scroll >= paging.total) break;
      await new Promise(r => setTimeout(r, 300)); // pausa suave
    }

    if (allIds.length === 0) return res.json([]);

    // 2) Busca detalhes em lotes de 20 (limite da API batch)
    const itensCompletos = [];
    for (let i = 0; i < allIds.length; i += 20) {
      const lote   = allIds.slice(i, i + 20);
      const batch  = await api.get(`/items?ids=${lote.join(',')}`);

      for (const entry of (batch.data || [])) {
        if (entry.code !== 200 || !entry.body) continue;
        const it = entry.body;

        // Busca descrição separada (lazy — apenas se precisar de desc)
        // Para página de listagem não precisamos — economiza chamadas
        itensCompletos.push({
          id:                  it.id,
          title:               it.title,
          status:              it.status,
          price:               it.price,
          available_quantity:  it.available_quantity,
          sold_quantity:       it.sold_quantity,
          listing_type_id:     it.listing_type_id,
          condition:           it.condition,
          permalink:           it.permalink,
          thumbnail:           it.thumbnail,
          pictures:            it.pictures || [],
          attributes:          it.attributes || [],
          shipping:            it.shipping,
          category_id:         it.category_id,
          currency_id:         it.currency_id,
          buying_mode:         it.buying_mode,
          warranty:            it.warranty,
          seller_custom_field: it.seller_custom_field,
          date_created:        it.date_created,
          last_updated:        it.last_updated,
          variations:          it.variations || [],
          reviews:             it.reviews || null,
        });
      }

      if (i + 20 < allIds.length) await new Promise(r => setTimeout(r, 250));
    }

    res.json(itensCompletos);

  } catch (err) {
    console.error('[MeusAnuncios]', err.message);
    res.status(err.message.includes('Token') ? 401 : 500).json({ error: err.message });
  }
});

// ── GET /api/ml/meus-anuncios/:id ─────────────────────────────────────────────
// Retorna um anúncio com todos os detalhes incluindo descrição
router.get('/api/ml/meus-anuncios/:itemId', async (req, res) => {
  const { userId } = req.query;
  const { itemId } = req.params;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

  try {
    const { api } = await getMlApi(userId);

    const [itemRes, descRes] = await Promise.allSettled([
      api.get(`/items/${itemId}`),
      api.get(`/items/${itemId}/description`),
    ]);

    const it   = itemRes.status === 'fulfilled' ? itemRes.value.data : null;
    const desc = descRes.status === 'fulfilled' ? descRes.value.data.plain_text : null;

    if (!it) return res.status(404).json({ error: 'Anúncio não encontrado' });

    res.json({ ...it, description_text: desc });

  } catch (err) {
    console.error('[MeusAnuncios/detalhe]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;