/**
 * mlService.js
 * Integração real com a API oficial do Mercado Livre.
 *
 * Fluxo principal do bot:
 *  1. fetchMlUser()           — descobre o USER_ID do token atual (/users/me)
 *  2. fetchAllSellerItems()   — lista TODOS os IDs de anúncios do vendedor (/users/{id}/items/search)
 *  3. fetchMlItemsBatch()     — busca detalhes de até 20 itens de uma vez (/items?ids=...)
 *  4. extractWeightGrams()    — extrai o peso em gramas do campo shipping.dimensions
 *
 * Dimensões no ML são salvas no campo shipping.dimensions como string "HxWxLxPeso"
 * onde peso é em gramas (ex: "10x15x20x500").
 * Também verificamos atributos SELLER_PACKAGE_WEIGHT / PACKAGE_WEIGHT quando disponíveis.
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const api = axios.create({
  baseURL: 'https://api.mercadolibre.com',
  headers: {
    Authorization: `Bearer ${process.env.ML_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extrai peso em gramas do campo shipping.dimensions do ML.
 * Formato da string: "altura_cm x largura_cm x comprimento_cm x peso_gramas"
 * Exemplo: "10x15x20x500" → 500
 * Também aceita o formato antigo "10,500" (altura, peso).
 */
export function extractWeightGrams(item) {
  // 1ª tentativa: shipping.dimensions (string "HxWxLxPeso")
  const dimStr = item?.shipping?.dimensions;
  if (dimStr && typeof dimStr === 'string') {
    // Novo formato: "10x15x20x500"
    const partsX = dimStr.split('x');
    if (partsX.length >= 4) {
      const w = parseInt(partsX[3], 10);
      if (!isNaN(w) && w > 0) return w;
    }
    // Formato antigo com vírgula: "10,500"
    const partsC = dimStr.split(',');
    if (partsC.length >= 2) {
      const w = parseInt(partsC[1], 10);
      if (!isNaN(w) && w > 0) return w;
    }
  }

  // 2ª tentativa: atributos SELLER_PACKAGE_WEIGHT / PACKAGE_WEIGHT
  const attrs = item?.attributes || [];
  for (const attr of attrs) {
    if (['SELLER_PACKAGE_WEIGHT', 'PACKAGE_WEIGHT'].includes(attr.id)) {
      const val = attr?.value_struct?.number;
      const unit = attr?.value_struct?.unit?.toLowerCase() || 'g';
      if (val) {
        if (unit === 'kg') return Math.round(val * 1000);
        if (unit === 'lb') return Math.round(val * 453.592);
        return Math.round(val); // assume gramas
      }
      // fallback: extrair número do value_name "500 g" / "0.5 kg"
      const match = attr?.value_name?.match(/([0-9.]+)\s*(kg|lb|g)?/i);
      if (match) {
        const num = parseFloat(match[1]);
        const u = (match[2] || 'g').toLowerCase();
        if (u === 'kg') return Math.round(num * 1000);
        if (u === 'lb') return Math.round(num * 453.592);
        return Math.round(num);
      }
    }
  }

  return 0; // não encontrado
}

/**
 * Extrai dimensões (altura, largura, comprimento em cm) do item ML.
 */
export function extractDimensionsCm(item) {
  const dimStr = item?.shipping?.dimensions;
  if (dimStr && typeof dimStr === 'string') {
    const parts = dimStr.split('x');
    if (parts.length >= 3) {
      return {
        alturaCm:      parseFloat(parts[0]) || 0,
        larguraCm:     parseFloat(parts[1]) || 0,
        comprimentoCm: parseFloat(parts[2]) || 0,
      };
    }
  }
  return { alturaCm: 0, larguraCm: 0, comprimentoCm: 0 };
}

// ─── Endpoints ML ────────────────────────────────────────────────────────────

/**
 * Retorna os dados do usuário dono do token (/users/me).
 * Usado para obter o USER_ID sem precisar configurar manualmente.
 */
export async function fetchMlUser() {
  const res = await api.get('/users/me');
  return res.data; // { id, nickname, email, ... }
}

/**
 * Lista TODOS os IDs de anúncios do vendedor.
 * O endpoint /users/{id}/items/search retorna até 100 IDs por página.
 * Fazemos paginação automática até buscar todos.
 *
 * @param {number|string} userId
 * @param {Function}      onProgress  callback(fetched, total)
 * @returns {string[]}  array de mlItemId (ex: ["MLB123", "MLB456"])
 */
export async function fetchAllSellerItems(userId, onProgress) {
  const allIds = [];
  const LIMIT  = 100;
  let offset   = 0;
  let total    = null;

  do {
    const res = await api.get(`/users/${userId}/items/search`, {
      params: { limit: LIMIT, offset, status: 'active' },
    });

    const data = res.data;
    if (total === null) total = data?.paging?.total || 0;

    const ids = data?.results || [];
    allIds.push(...ids);
    offset += ids.length;

    if (onProgress) onProgress(allIds.length, total);

    if (ids.length < LIMIT) break; // última página
    await sleep(300); // respeita rate limit
  } while (offset < total);

  return allIds;
}

/**
 * Busca detalhes de múltiplos itens em lote (Multiget — máx 20 por requisição).
 * Retorna array de { code, body } onde body é o objeto item completo.
 *
 * @param {string[]} itemIds
 */
export async function fetchMlItemsBatch(itemIds) {
  if (!itemIds || itemIds.length === 0) return [];

  const BATCH_SIZE = 20;
  const results    = [];

  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    const ids   = batch.join(',');

    try {
      const res = await api.get(`/items?ids=${ids}`);
      results.push(...(res.data || []));
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limit: espera 1s e tenta de novo
        await sleep(1000);
        const res = await api.get(`/items?ids=${ids}`);
        results.push(...(res.data || []));
      } else {
        throw new Error(`Erro no lote [${ids}]: ${error.message}`);
      }
    }

    if (i + BATCH_SIZE < itemIds.length) {
      await sleep(200); // intervalo entre lotes para não estourar rate limit
    }
  }

  return results;
}

/**
 * Busca um único item pelo ID.
 * Usado para verificar dados após correção.
 */
export async function fetchMlItem(itemId) {
  const res = await api.get(`/items/${itemId}`);
  return res.data;
}