import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const api = axios.create({
  baseURL: 'https://api.mercadolibre.com',
  headers: {
    Authorization: `Bearer ${process.env.ML_ACCESS_TOKEN}`,
  },
});

/**
 * Busca múltiplos itens de uma vez no Mercado Livre (Multiget)
 * Limite da API: 20 IDs por requisição.
 * @param {Array<String>} itemIds - Array de strings com os IDs (Ex: ['MLB123', 'MLB456'])
 */
export async function fetchMlItemsBatch(itemIds) {
  if (!itemIds || itemIds.length === 0) return [];
  
  // Junta os IDs com vírgula conforme a documentação do ML exige
  const idsString = itemIds.join(',');
  
  try {
    const response = await api.get(`/items?ids=${idsString}`);
    
    // Opcional: Você pode logar os headers de rate limit para monitoramento interno
    // console.log('Requisições restantes:', response.headers['x-ratelimit-remaining']);
    
    // O retorno do multiget é um array de objetos { code, body: { ...detalhes do item } }
    return response.data; 
  } catch (error) {
    if (error.response && error.response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    throw new Error(`Erro no lote de itens: ${error.message}`);
  }
}

/**
 * Extrai o peso em gramas das dimensões de envio do ML
 */
export function extractWeightFromDimensions(dimensionsStr) {
  if (!dimensionsStr) return 0;
  const parts = dimensionsStr.split(',');
  return parts.length > 1 ? parseInt(parts[1], 10) : 0;
}