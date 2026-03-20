/**
 * mlService.js
 * Integração real com a API oficial do Mercado Livre.
 * Adaptado para arquitetura Multi-tenant (buscando token dinâmico no Prisma).
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractWeightGrams(item) {
  const dimStr = item?.shipping?.dimensions;
  if (dimStr && typeof dimStr === 'string') {
    const partsX = dimStr.split('x');
    if (partsX.length >= 4) {
      const w = parseInt(partsX[3], 10);
      if (!isNaN(w) && w > 0) return w;
    }
    const partsC = dimStr.split(',');
    if (partsC.length >= 2) {
      const w = parseInt(partsC[1], 10);
      if (!isNaN(w) && w > 0) return w;
    }
  }

  const attrs = item?.attributes || [];
  for (const attr of attrs) {
    if (['SELLER_PACKAGE_WEIGHT', 'PACKAGE_WEIGHT'].includes(attr.id)) {
      const val = attr?.value_struct?.number;
      const unit = attr?.value_struct?.unit?.toLowerCase() || 'g';
      if (val) {
        if (unit === 'kg') return Math.round(val * 1000);
        if (unit === 'lb') return Math.round(val * 453.592);
        return Math.round(val);
      }
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
  return 0;
}

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

// ─── Gerenciador de Instância API ───────────────────────────────────────────

/**
 * Cria uma instância do Axios configurada dinamicamente para um usuário específico.
 * @param {number} userId - O ID interno do usuário no banco de dados.
 */
async function getApiClient(userId) {
  if (!userId) throw new Error('userId é obrigatório para autenticar na API do ML.');

  const tokenData = await prisma.mlToken.findUnique({
    where: { usuarioId: parseInt(userId) }
  });

  if (!tokenData || !tokenData.accessToken) {
    throw new Error(`Usuário ${userId} não possui conexão ativa com o Mercado Livre.`);
  }

  // Se o token estiver expirado, a renovação deve ser feita antes de chamar este service
  // (ex: na sua função refreshMlTokenIfNeeded do server.js)
  
  return axios.create({
    baseURL: 'https://api.mercadolibre.com',
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

// ─── Endpoints ML ────────────────────────────────────────────────────────────

/**
 * Retorna os dados do usuário dono do token (/users/me).
 * @param {number} userId - ID interno do sistema.
 */
export async function fetchMlUser(userId) {
  const api = await getApiClient(userId);
  const res = await api.get('/users/me');
  return res.data;
}

/**
 * Lista TODOS os IDs de anúncios ativos do vendedor.
 * Fazemos paginação automática até buscar todos os itens.
 * * @param {number} userId - ID interno do sistema.
 * @param {Function} onProgress callback(fetched, total)
 * @returns {string[]} array de mlItemId (ex: ["MLB123", "MLB456"])
 */
export async function fetchAllSellerItems(userId, onProgress) {
  const api = await getApiClient(userId);
  
  // Pegamos o ID do vendedor no Mercado Livre direto do banco
  const tokenData = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  const mlUserId = tokenData.mlUserId;

  const allIds = [];
  const LIMIT  = 100; // O ML limita o /search a 100 itens por página
  let offset   = 0;
  let total    = null;

  do {
    const res = await api.get(`/users/${mlUserId}/items/search`, {
      params: { limit: LIMIT, offset, status: 'active' },
    });

    const data = res.data;
    if (total === null) total = data?.paging?.total || 0;

    const ids = data?.results || [];
    allIds.push(...ids);
    offset += ids.length;

    if (onProgress) onProgress(allIds.length, total);

    if (ids.length < LIMIT) break; // Chegou na última página
    
    // Pequena pausa para evitar estourar o Rate Limit (Código 429) do Mercado Livre
    await sleep(300); 
  } while (offset < total);

  return allIds;
}

/**
 * Busca detalhes de múltiplos itens em lote (Multiget — máx 20 por requisição).
 * * @param {number} userId - ID interno do sistema.
 * @param {string[]} itemIds - Array de IDs do Mercado Livre.
 */
export async function fetchMlItemsBatch(userId, itemIds) {
  if (!itemIds || itemIds.length === 0) return [];

  const api = await getApiClient(userId);
  const BATCH_SIZE = 20; // Limite rigoroso do Multiget do ML
  const results    = [];

  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    const ids   = batch.join(',');

    try {
      const res = await api.get(`/items?ids=${ids}`);
      results.push(...(res.data || []));
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limit atingido: o ML pune abusos. Esperamos 1s e tentamos de novo.
        console.warn('⚠️ Rate limit do ML atingido. Pausando por 1s...');
        await sleep(1000);
        const res = await api.get(`/items?ids=${ids}`);
        results.push(...(res.data || []));
      } else {
        throw new Error(`Erro no lote [${ids}]: ${error.message}`);
      }
    }

    if (i + BATCH_SIZE < itemIds.length) {
      await sleep(200); // Intervalo seguro entre requisições em lote
    }
  }

  return results;
}

/**
 * Busca um único item pelo ID.
 * @param {number} userId - ID interno do sistema.
 * @param {string} itemId - ID do item no ML (ex: MLB123456)
 */
export async function fetchMlItem(userId, itemId) {
  const api = await getApiClient(userId);
  const res = await api.get(`/items/${itemId}`);
  return res.data;
}