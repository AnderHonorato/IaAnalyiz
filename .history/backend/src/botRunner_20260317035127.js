import { PrismaClient } from '@prisma/client';
import { fetchMlItemsBatch, extractWeightFromDimensions } from './mlService.js';

const prisma = new PrismaClient();
let clients = [];

export function addSseClient(res) {
  clients.push(res);
}

function sendLog(data) {
  clients.forEach(client => client.write(`data: ${JSON.stringify(data)}\n\n`));
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function runBot() {
  sendLog({ type: 'info', msg: 'Iniciando varredura em LOTE (Multiget)...' });

  const produtos = await prisma.produto.findMany({
    where: { mlItemId: { not: null } },
    include: { itensDoKit: { include: { produto: true } } }
  });

  if (produtos.length === 0) {
    sendLog({ type: 'info', msg: 'Nenhum produto com ML ID encontrado no banco.' });
    sendLog({ type: 'done', progress: 100 });
    return;
  }

  let total = produtos.length;
  let processed = 0;
  let retryQueue = []; 

  // Divide em lotes de 20 (limite da API do ML)
  const batches = chunkArray(produtos, 20);

  const processBatches = async (currentBatches, isRetry = false) => {
    for (const batch of currentBatches) {
      const mlItemIds = batch.map(p => p.mlItemId);
      sendLog({ type: 'info', msg: `Buscando lote de ${batch.length} itens na API...` });

      try {
        const mlResponses = await fetchMlItemsBatch(mlItemIds);
        
        for (const mlRes of mlResponses) {
          if (mlRes.code !== 200) {
            sendLog({ type: 'warn', msg: `Erro no item HTTP ${mlRes.code}` });
            processed++;
            continue;
          }

          const mlData = mlRes.body;
          const p = batch.find(prod => prod.mlItemId === mlData.id);
          if (!p) continue; 

          let expectedPrice = p.preco;
          let expectedWeight = p.pesoGramas;

          if (p.eKit) {
            expectedPrice = 0;
            expectedWeight = 0;
            for (const item of p.itensDoKit) {
              expectedPrice += item.produto.preco * item.quantidade;
              expectedWeight += item.produto.pesoGramas * item.quantidade;
            }
          }

          const mlPrice = mlData.price;
          const mlWeight = extractWeightFromDimensions(mlData.shipping?.dimensions);
          
          let divergencias = [];
          if (mlPrice !== expectedPrice) divergencias.push(`Preço: Esp. ${expectedPrice}, ML ${mlPrice}`);
          if (mlWeight !== expectedWeight) divergencias.push(`Peso: Esp. ${expectedWeight}g, ML ${mlWeight}g`);

          if (divergencias.length > 0) {
            await prisma.divergencia.create({
              data: {
                mlItemId: p.mlItemId,
                link: mlData.permalink,
                motivo: divergencias.join(' | ')
              }
            });
            sendLog({ type: 'warn', msg: `Divergência: ${p.mlItemId}` });
          } else {
            sendLog({ type: 'success', msg: `Validado: ${p.mlItemId}` });
          }
          processed++;
        }

        const percent = Math.floor((processed / total) * 100);
        const timeLeftSec = (batches.length - (processed / 20)) * 1; 
        sendLog({ type: 'progress', percent, timeLeft: `~${Math.ceil(timeLeftSec)}s` });

        await delay(1000); // 1 segundo entre lotes

      } catch (error) {
        if (error.message === 'RATE_LIMIT') {
          sendLog({ type: 'error', msg: `Rate Limit. Movendo ${batch.length} itens para espera.` });
          retryQueue.push(batch);
          await delay(10000); // Aguarda 10s se for bloqueado
        } else {
          sendLog({ type: 'error', msg: error.message });
          processed += batch.length; 
        }
      }
    }
  };

  await processBatches(batches);

  if (retryQueue.length > 0) {
    sendLog({ type: 'info', msg: `Retentando lotes que sofreram Rate Limit...` });
    await delay(15000); 
    await processBatches(retryQueue, true);
  }

  sendLog({ type: 'done', progress: 100, msg: 'Varredura finalizada!' });
}