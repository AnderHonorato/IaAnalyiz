/**
 * botRunner.js
 * Robô de auditoria Mercado Livre.
 * Fluxo: Encontra anúncios não vinculados e gera alertas de divergência.
 */

import { PrismaClient }     from '@prisma/client';
import {
  fetchMlUser,
  fetchAllSellerItems,
  fetchMlItemsBatch,
  extractWeightGrams,
  extractDimensionsCm
} from './mlService.js';

const prisma    = new PrismaClient();
let sseClients  = [];

export function addSseClient(res) {
  sseClients.push(res);
  res.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
}

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => { try { client.write(data); } catch (_) {} });
}

function log(msg, type = 'info') {
  broadcast({ type, msg });
  console.log(`[BOT] ${msg}`);
}

function isDivergente(pesoMl, pesoLocal) {
  if (pesoLocal === 0) return false; 
  if (pesoMl   === 0) return false;
  const diff    = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  return diff > 50 || diffPct > 0.15;
}

export async function runBot(userId) {
  if (!userId) {
    log('❌ ID do usuário não fornecido para o bot.', 'warn');
    broadcast({ type: 'done' });
    return;
  }

  try {
    log('🔐 Autenticando na API do Mercado Livre...', 'info');
    let mlUser;
    try {
      mlUser = await fetchMlUser(userId);
    } catch (e) {
      log(`❌ Token inválido ou expirado. Renove a conexão no painel.`, 'warn');
      broadcast({ type: 'done' });
      return;
    }
    log(`✅ Vendedor conectado: ${mlUser.nickname}`, 'success');

    log('🔍 Buscando todos os anúncios ativos no ML...', 'info');
    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(userId, (fetched, total) => {
        const pct = total > 0 ? Math.round((fetched / total) * 20) : 0;
        broadcast({ type: 'progress', percent: pct, msg: `Lendo anúncios ML: ${fetched}/${total}` });
      });
    } catch (e) {
      log(`❌ Erro ao listar anúncios do ML: ${e.message}`, 'warn');
      broadcast({ type: 'done' });
      return;
    }

    if (allIds.length === 0) {
      log('ℹ️ Você não possui nenhum anúncio ativo no Mercado Livre.', 'info');
      broadcast({ type: 'done' });
      return;
    }

    // Carrega TODOS os produtos que tenham mlItemId, não importa o status
    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    const BATCH = 20;
    let processados = 0;
    let pendentesCriados = 0;
    let divergentes = 0;

    for (let i = 0; i < allIds.length; i += BATCH) {
      const lote     = allIds.slice(i, i + BATCH);
      const detalhes = await fetchMlItemsBatch(userId, lote);

      for (const entry of detalhes) {
        if (entry.code !== 200 || !entry.body) continue;

        const item   = entry.body;
        const itemId = (item.id || '').trim().toUpperCase();
        const titulo = item.title || itemId;
        const pesoMl = extractWeightGrams(item);
        const link   = item.permalink || `https://www.mercadolivre.com.br/p/${itemId}`;
        const dims   = extractDimensionsCm(item);

        let local = mapaLocal.get(itemId);

        // Se o anúncio não existe no banco, cria na sala de espera (ML_PENDENTE)
        if (!local) {
          try {
            local = await prisma.produto.create({
              data: {
                usuarioId:     parseInt(userId),
                sku:           itemId,
                nome:          titulo,
                mlItemId:      itemId,
                preco:         item.price || 0,
                pesoGramas:    0,
                alturaCm:      dims.alturaCm,
                larguraCm:     dims.larguraCm,
                comprimentoCm: dims.comprimentoCm,
                categoria:     item.category_id || null,
                plataforma:    'ML_PENDENTE', // <- SALA DE ESPERA
                status:        item.status || 'active',
                thumbnail:     item.thumbnail || null,
              }
            });
            pendentesCriados++;
            mapaLocal.set(itemId, local);
            log(`👀 Encontrado anúncio não vinculado: ${titulo}`, 'warn');
          } catch (err) {}
          continue; // Pula a verificação de divergência por enquanto
        }

        // Se o usuário mandou ignorar esse anúncio, não faz nada
        if (local.plataforma === 'ML_IGNORADO') continue;
        
        // Se ainda está aguardando o usuário decidir, também pula a divergência
        if (local.plataforma === 'ML_PENDENTE') continue;

        processados++;
        const pesoLocal = local.pesoGramas || 0;

        // Verifica Divergência (apenas para os que já estão no Catálogo)
        if (isDivergente(pesoMl, pesoLocal)) {
          divergentes++;
          const motivo = `Peso ML: ${pesoMl}g | Peso local: ${pesoLocal}g | Diferença: ${Math.abs(pesoMl - pesoLocal)}g`;

          const existing = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId, status: 'PENDENTE' },
          });

          if (!existing) {
            await prisma.divergencia.create({
              data: {
                usuarioId: parseInt(userId), mlItemId: itemId, link, motivo, pesoMl, pesoLocal,
                titulo: titulo, status: 'PENDENTE', plataforma: 'Mercado Livre',
              },
            });
            log(`⚠️ Divergência: ${titulo} — ${motivo}`, 'warn');
          } else {
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo, pesoMl, pesoLocal, titulo, link },
            });
          }
        }
      }

      const pct = 20 + Math.round(((i + lote.length) / allIds.length) * 80);
      broadcast({ type: 'progress', percent: Math.min(pct, 99) });
    }

    log(`✅ Varredura finalizada!`, 'success');
    if (pendentesCriados > 0) log(`💡 ${pendentesCriados} anúncios novos encontrados. Vá na aba "Não Vinculados" para agir.`, 'success');
    log(`📊 Resumo: ${processados} validados | ${divergentes} divergentes.`, 'info');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done' });

  } catch (error) {
    log(`❌ Erro no robô: ${error.message}`, 'warn');
    broadcast({ type: 'done' });
  }
}