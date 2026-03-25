// backend/src/routes/mlResearchRoutes.js
// Rota: GET /api/ml/research/:mlbId
// Busca dados completos de um anúncio + concorrentes + análise de preço

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// ── Helper: cria instância axios autenticada para o usuário ──────────────────
async function getMlApi(userId) {
  const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!token) throw new Error('Conta ML não conectada');
  if (new Date() >= new Date(token.expiresAt)) throw new Error('Token ML expirado — reconecte');
  return {
    api: axios.create({
      baseURL: 'https://api.mercadolibre.com',
      headers: { Authorization: `Bearer ${token.accessToken}` },
      timeout: 18000,
    }),
    token,
  };
}

// ── Helper: extrai atributos de um item ─────────────────────────────────────
function extrairAtributos(item) {
  if (!item?.attributes) return [];
  const relevantes = [
    'BRAND', 'MODEL', 'GTIN', 'PACKAGE_WEIGHT', 'PACKAGE_HEIGHT',
    'PACKAGE_WIDTH', 'PACKAGE_LENGTH', 'SELLER_SKU', 'COLOR', 'SIZE',
    'MATERIAL', 'VOLTAGE', 'WARRANTY_TIME',
  ];
  return item.attributes
    .filter(a => a.value_name && (relevantes.includes(a.id) || a.value_name.length < 50))
    .slice(0, 15)
    .map(a => ({ nome: a.name, valor: a.value_name }));
}

// ── Helper: reputação do vendedor ──────────────────────────────────────────
function mapearReputacao(level) {
  const mapa = { '1_red': 'bronze', '2_yellow': 'silver', '3_green': 'gold', '4_light_green': 'platinum', '5_green': 'platinum' };
  return mapa[level] || 'novo';
}

// ── Helper: tipo de anúncio ────────────────────────────────────────────────
function mapearTipoAnuncio(listingTypeId) {
  const mapa = { gold_pro: 'Premium', gold_special: 'Clássico', gold: 'Ouro', silver: 'Prata', bronze: 'Bronze', free: 'Grátis' };
  return mapa[listingTypeId] || listingTypeId || '—';
}

// ── Rota principal ──────────────────────────────────────────────────────────
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId } = req.params;
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  if (!mlbId || !/^MLB\d+$/i.test(mlbId)) {
    return res.status(400).json({ error: `ID inválido: ${mlbId}` });
  }

  try {
    const { api } = await getMlApi(userId);
    const mlbIdUpper = mlbId.toUpperCase();

    // ── 1. Dados do item principal ──────────────────────────────────────
    let itemData;
    try {
      const itemRes = await api.get(`/items/${mlbIdUpper}`);
      itemData = itemRes.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) return res.status(404).json({ error: `Anúncio ${mlbIdUpper} não encontrado` });
      if (status === 403) return res.status(403).json({ error: 'Sem permissão para acessar este anúncio' });
      throw e;
    }

    // ── 2. Dados do vendedor principal ─────────────────────────────────
    let vendedorPrincipal = null;
    try {
      const sellerRes = await api.get(`/users/${itemData.seller_id}`);
      const s = sellerRes.data;
      vendedorPrincipal = {
        id:         s.id,
        nome:       s.nickname || '—',
        reputacao:  mapearReputacao(s.seller_reputation?.level_id),
        vendas:     s.seller_reputation?.transactions?.completed || 0,
        pontuacao:  s.seller_reputation?.transactions?.ratings?.positive || null,
        link:       `https://www.mercadolivre.com.br/perfil/${s.nickname}`,
      };
    } catch {}

    // ── 3. Busca concorrentes pelo catalog_product_id ─────────────────
    const concorrentes = [];
    let precoMin  = itemData.price;
    let precoMax  = itemData.price;
    let somaPreco = itemData.price;
    let totalVendedores = 1;

    try {
      // Tenta pelo catalog_product_id (mais preciso)
      const catalogId = itemData.catalog_product_id;
      let concorrentesIds = [];

      if (catalogId) {
        const searchRes = await api.get(`/products/${catalogId}/items`, {
          params: { limit: 20 },
        }).catch(() => null);

        if (searchRes?.data?.results) {
          concorrentesIds = searchRes.data.results
            .map(r => r.item_id)
            .filter(id => id !== mlbIdUpper)
            .slice(0, 10);
        }
      }

      // Fallback: busca por categoria + título
      if (concorrentesIds.length === 0 && itemData.category_id) {
        const titulo   = (itemData.title || '').split(' ').slice(0, 4).join(' ');
        const busca    = await api.get('/sites/MLB/search', {
          params: {
            category:  itemData.category_id,
            q:         titulo,
            limit:     15,
            sort:      'price_asc',
          },
        }).catch(() => null);

        if (busca?.data?.results) {
          concorrentesIds = busca.data.results
            .map(r => r.id)
            .filter(id => id !== mlbIdUpper)
            .slice(0, 10);
        }
      }

      // Busca detalhes dos concorrentes em lote (multiget ML)
      if (concorrentesIds.length > 0) {
        const batchRes = await api.get(`/items?ids=${concorrentesIds.join(',')}`)
          .catch(() => null);

        if (batchRes?.data) {
          const sellerIds = new Set();

          for (const entry of batchRes.data) {
            if (entry.code !== 200 || !entry.body) continue;
            const c = entry.body;

            // Busca dados do vendedor (só se não buscamos ainda)
            let vendedorC = null;
            if (c.seller_id && !sellerIds.has(c.seller_id)) {
              sellerIds.add(c.seller_id);
              try {
                const sv = await api.get(`/users/${c.seller_id}`);
                const s  = sv.data;
                vendedorC = {
                  id:        s.id,
                  nome:      s.nickname || '—',
                  reputacao: mapearReputacao(s.seller_reputation?.level_id),
                  vendas:    s.seller_reputation?.transactions?.completed || 0,
                };
              } catch {}
            }

            const preco = c.price || 0;
            if (preco > 0) {
              if (preco < precoMin) precoMin = preco;
              if (preco > precoMax) precoMax = preco;
              somaPreco += preco;
              totalVendedores++;
            }

            concorrentes.push({
              mlbId:     c.id,
              nome:      vendedorC?.nome || '—',
              reputacao: vendedorC?.reputacao || null,
              vendas:    vendedorC?.vendas || 0,
              preco,
              estoque:   c.available_quantity || 0,
              link:      c.permalink || `https://produto.mercadolivre.com.br/MLB-${c.id.replace('MLB','')}`,
              thumbnail: c.thumbnail || null,
              titulo:    c.title || '',
            });
          }
        }
      }
    } catch (e) {
      console.warn('[Research] Erro ao buscar concorrentes:', e.message);
    }

    // Ordena concorrentes por preço
    concorrentes.sort((a, b) => a.preco - b.preco);

    const precoMedio = totalVendedores > 0 ? somaPreco / totalVendedores : itemData.price;

    // ── 4. Monta resposta final ────────────────────────────────────────
    const freteGratis = itemData.shipping?.free_shipping === true;

    const resposta = {
      // Dados do anúncio
      mlbId:         mlbIdUpper,
      titulo:        itemData.title,
      preco:         itemData.price,
      status:        itemData.status,
      estoque:       itemData.available_quantity,
      vendidos:      itemData.sold_quantity,
      condicao:      itemData.condition === 'new' ? 'Novo' : itemData.condition === 'used' ? 'Usado' : itemData.condition,
      tipoAnuncio:   mapearTipoAnuncio(itemData.listing_type_id),
      thumbnail:     itemData.thumbnail,
      link:          itemData.permalink,
      categoriaId:   itemData.category_id,
      freteGratis,
      frete:         freteGratis ? 'Grátis' : 'Pago',
      avaliacoes:    itemData.reviews?.rating_average ? itemData.reviews.rating_average.toFixed(1) : null,
      atributos:     extrairAtributos(itemData),

      // Análise de mercado
      seller:         vendedorPrincipal,
      concorrentes,
      totalVendedores,
      precoMin,
      precoMax,
      precoMedio:     Math.round(precoMedio * 100) / 100,

      // Meta
      analisadoEm: new Date().toISOString(),
    };

    res.json(resposta);

  } catch (e) {
    const msg = e.response?.data?.message || e.message || 'Erro desconhecido';
    console.error(`[Research] ${mlbId}:`, msg);

    if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || e.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Timeout na API do ML — tente novamente' });
    }
    res.status(500).json({ error: msg });
  }
});

export default router;