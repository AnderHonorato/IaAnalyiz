/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ML SERVICE — Integração com API Mercado Livre
 * ═══════════════════════════════════════════════════════════════════════════════
 * Módulo responsável por toda comunicação com a API oficial do Mercado Livre.
 * 
 * Funcionalidades principais:
 * - Autenticação OAuth 2.0 com tokens dinâmicos por usuário
 * - Extração de dados de produtos (peso, dimensões, preço)
 * - Sincronização de anúncios e catálogo
 * - Atualização de preços e status
 * - Gerenciamento multi-tenant (cada usuário com seu próprio token)
 * 
 * Versão: 2.0 IA Analyiz (Anderson Honorato)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Extrai o peso de um item do Mercado Livre em gramas
 * Utiliza múltiplas estratégias de busca nos atributos
 * 
 * Estratégias:
 * 1. Tenta campo dimensions (formato "altura x largura x comprimento x peso")
 * 2. Busca atributos específicos: SELLER_PACKAGE_WEIGHT ou PACKAGE_WEIGHT
 * 3. Converte de kg/lb para gramas automaticamente
 * 4. Retorna 0 se nenhum peso encontrado
 * 
 * @param {Object} item - Objeto do item vindadaAPI do ML
 * @returns {number} Peso em gramas (pode ser 0 se não encontrado)
 */


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