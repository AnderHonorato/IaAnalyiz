/**
 * botRunner.js
 * Robô de auditoria Mercado Livre com detecção de Reincidências e Falsos Positivos.
 */

import { PrismaClient }     from '@prisma/client';
import { fetchMlUser, fetchAllSellerItems, fetchMlItemsBatch, extractWeightGrams, extractDimensionsCm } from './mlService.js';

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

// Nova lógica de divergência (pega itens com 0g no ML)
function checkDivergencia(pesoMl, pesoLocal) {
  if (pesoLocal === 0) return { isDiv: false }; 
  if (pesoMl === 0 && pesoLocal > 0) return { isDiv: true, texto: `ML sem peso (0g) | Local: ${pesoLocal}g` };
  
  const diff = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  if (diff > 50 || diffPct > 0.15) {
    return { isDiv: true, texto: `Peso ML: ${pesoMl}g | Peso local: ${pesoLocal}g | Diferença: ${diff}g` };
  }
  return { isDiv: false };
}

export async function runBot(userId) {
  if (!userId) { broadcast({ type: 'done' }); return; }

  try {
    log('🔐 Autenticando na API do Mercado Livre...', 'info');
    let mlUser;
    try { mlUser = await fetchMlUser(userId); } 
    catch (e) { log(`❌ Token expirado. Renove a conexão no painel.`, 'warn'); broadcast({ type: 'done' }); return; }
    
    log(`✅ Vendedor conectado: ${mlUser.nickname}`, 'success');
    log('🔍 Buscando todos os anúncios ativos no ML...', 'info');
    
    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(userId, (fetched, total) => {
        const pct = total > 0 ? Math.round((fetched / total) * 20) : 0;
        broadcast({ type: 'progress', percent: pct, msg: `Lendo anúncios ML: ${fetched}/${total}` });
      });
    } catch (e) { log(`❌ Erro ML: ${e.message}`, 'warn'); broadcast({ type: 'done' }); return; }

    if (allIds.length === 0) { log('ℹ️ Nenhum anúncio ativo no ML.', 'info'); broadcast({ type: 'done' }); return; }

    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
      include: { itensDoKit: { include: { produto: true } } }
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    const BATCH = 20;
    let processados = 0, pendentesCriados = 0, divergentes = 0;

    for (let i = 0; i < allIds.length; i += BATCH) {
      const lote = allIds.slice(i, i + BATCH);
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

        if (!local) {
          try {
            local = await prisma.produto.create({
              data: {
                usuarioId: parseInt(userId), sku: itemId, nome: titulo, mlItemId: itemId,
                preco: item.price || 0, pesoGramas: 0, eKit: false,
                alturaCm: dims.alturaCm, larguraCm: dims.larguraCm, comprimentoCm: dims.comprimentoCm,
                categoria: item.category_id || null, plataforma: 'ML_PENDENTE', status: item.status || 'active', thumbnail: item.thumbnail || null,
              }
            });
            pendentesCriados++; mapaLocal.set(itemId, local);
            log(`👀 Novo anúncio aguardando vínculo: ${titulo}`, 'warn');
          } catch (err) {}
          continue; 
        }

        if (local.plataforma === 'ML_IGNORADO' || local.plataforma === 'ML_PENDENTE') continue;

        processados++;
        let pesoLocal = local.eKit && local.itensDoKit?.length > 0 
          ? local.itensDoKit.reduce((soma, r) => soma + (r.quantidade * (r.produto.pesoGramas || 0)), 0)
          : (local.pesoGramas || 0);

        const check = checkDivergencia(pesoMl, pesoLocal);

        if (check.isDiv) {
          divergentes++;
          const existing = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId },
            orderBy: { createdAt: 'desc' }
          });

          if (!existing) {
            await prisma.divergencia.create({
              data: { usuarioId: parseInt(userId), mlItemId: itemId, link, motivo: check.texto, pesoMl, pesoLocal, titulo, status: 'PENDENTE', plataforma: 'Mercado Livre' },
            });
            log(`⚠️ Divergência: ${titulo} — ${check.texto}`, 'warn');
          } else {
            // Se já estava corrigido, vira REINCIDENTE!
            const novoStatus = existing.status === 'CORRIGIDO' ? 'REINCIDENTE' : existing.status;
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo: check.texto, pesoMl, pesoLocal, titulo, link, status: novoStatus },
            });
            if (novoStatus === 'REINCIDENTE') log(`🚨 Reincidência detectada (ML mudou o peso): ${titulo}`, 'warn');
          }
        } else {
          // Se FOU resolvido no ML, fecha automaticamente a pendência local
          const pendente = await prisma.divergencia.findFirst({ where: { usuarioId: parseInt(userId), mlItemId: itemId, status: { in: ['PENDENTE', 'REINCIDENTE'] } } });
          if (pendente) {
            await prisma.divergencia.update({ where: { id: pendente.id }, data: { status: 'CORRIGIDO', resolvido: true } });
            log(`✅ Resolvido no ML: ${titulo}`, 'success');
          }
        }
      }

      const pct = 20 + Math.round(((i + lote.length) / allIds.length) * 80);
      broadcast({ type: 'progress', percent: Math.min(pct, 99) });
    }

    log(`✅ Varredura finalizada!`, 'success');
    if (pendentesCriados > 0) log(`💡 ${pendentesCriados} anúncios novos em "Não Vinculados".`, 'success');
    log(`📊 Resumo: ${processados} validados | ${divergentes} divergentes.`, 'info');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done' });
  } catch (error) {
    log(`❌ Erro no robô: ${error.message}`, 'warn');
    broadcast({ type: 'done' });
  }
}