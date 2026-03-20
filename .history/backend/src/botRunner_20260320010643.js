/**
 * botRunner.js
 * Robô de auditoria Mercado Livre.
 * Modificado para IMPORTAÇÃO AUTOMÁTICA e cruzamento de dados inteligente.
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

// ─── SSE ─────────────────────────────────────────────────────────────────────

export function addSseClient(res) {
  sseClients.push(res);
  res.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
}

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(data); } catch (_) {}
  });
}

function log(msg, type = 'info') {
  broadcast({ type, msg });
  console.log(`[BOT] ${msg}`);
}

// ─── Tolerância de peso ───────────────────────────────────────────────────────

function isDivergente(pesoMl, pesoLocal) {
  if (pesoLocal === 0) return false; // Sem peso local = não tem como comparar
  if (pesoMl   === 0) return false;
  const diff    = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  return diff > 50 || diffPct > 0.15;
}

// ─── Runner principal ─────────────────────────────────────────────────────────

export async function runBot(userId) {
  if (!userId) {
    log('❌ ID do usuário não fornecido para o bot.', 'warn');
    broadcast({ type: 'done' });
    return;
  }

  try {
    // ── 1. Autenticação ─────────────────────────────────────────────────────
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

    // ── 2. Busca IDs ativos no ML ───────────────────────────────────────────
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
    log(`📋 Encontrados ${allIds.length} anúncio(s) no ML. Iniciando varredura...`, 'info');

    // ── 3. Carrega produtos locais para saber o que já temos ────────────────
    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), plataforma: 'Mercado Livre', mlItemId: { not: null } },
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    // ── 4. Processamento em Lotes (Importação Automática + Auditoria) ───────
    const BATCH = 20;
    let processados  = 0;
    let importados   = 0;
    let divergentes  = 0;
    let semPesoLocal = 0;

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

        // 🔥 AUTO-IMPORTAÇÃO: Se não existir no painel, cria automaticamente!
        if (!local) {
          try {
            local = await prisma.produto.create({
              data: {
                usuarioId:     parseInt(userId),
                sku:           itemId, // Usa o ML ID como SKU provisório
                nome:          titulo,
                mlItemId:      itemId,
                preco:         item.price || 0,
                pesoGramas:    0, // Criado com zero, precisa que você preencha depois
                alturaCm:      dims.alturaCm,
                larguraCm:     dims.larguraCm,
                comprimentoCm: dims.comprimentoCm,
                categoria:     item.category_id || null,
                plataforma:    'Mercado Livre',
                status:        item.status || 'active',
                thumbnail:     item.thumbnail || null,
              }
            });
            importados++;
            mapaLocal.set(itemId, local);
            log(`📥 Sincronizado automaticamente: ${titulo}`, 'success');
          } catch (err) {
            console.error(`Erro ao auto-importar ${itemId}:`, err.message);
            continue;
          }
        }

        processados++;
        const pesoLocal = local.pesoGramas || 0;

        // 🔥 VERIFICAÇÃO DE DIVERGÊNCIA
        if (pesoLocal === 0) {
          semPesoLocal++;
        } else if (isDivergente(pesoMl, pesoLocal)) {
          divergentes++;
          const motivo = `Peso ML: ${pesoMl}g | Peso local: ${pesoLocal}g | Diferença: ${Math.abs(pesoMl - pesoLocal)}g`;

          const existing = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId, status: 'PENDENTE' },
          });

          if (!existing) {
            await prisma.divergencia.create({
              data: {
                usuarioId:  parseInt(userId),
                mlItemId:   itemId,
                link,
                motivo,
                pesoMl,
                pesoLocal,
                titulo:     titulo,
                status:     'PENDENTE',
                plataforma: 'Mercado Livre',
              },
            });
            log(`⚠️ Divergência encontrada: ${titulo} — ${motivo}`, 'warn');
          } else {
            // Atualiza os dados da divergência se já existir
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo, pesoMl, pesoLocal, titulo, link },
            });
          }
        } else {
           // 🔥 BÔNUS: Se estava pendente antes, mas os pesos agora estão iguais, resolve automático!
           const divPendente = await prisma.divergencia.findFirst({
             where: { usuarioId: parseInt(userId), mlItemId: itemId, status: 'PENDENTE' }
           });
           if (divPendente) {
             await prisma.divergencia.update({
               where: { id: divPendente.id },
               data: { status: 'CORRIGIDO', resolvido: true }
             });
             log(`✅ Divergência resolvida automaticamente: ${titulo}`, 'success');
           }
        }
      }

      // Progresso Visual (20% a 100%)
      const pct = 20 + Math.round(((i + lote.length) / allIds.length) * 80);
      broadcast({ type: 'progress', percent: Math.min(pct, 99) });
    }

    // ── 5. Resumo ───────────────────────────────────────────────────────────
    log(`✅ Auditoria finalizada!`, 'success');
    if (importados > 0) {
      log(`📥 ${importados} anúncios foram importados sozinhos para o seu Catálogo!`, 'info');
    }
    if (semPesoLocal > 0) {
      log(`💡 DICA: ${semPesoLocal} produtos no catálogo estão sem peso. Vá lá e preencha para o robô poder auditar na próxima vez!`, 'warn');
    }
    log(`📊 Resumo: ${processados} processados | ${divergentes} divergências pendentes.`, 'info');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done' });

  } catch (error) {
    log(`❌ Erro no robô: ${error.message}`, 'warn');
    console.error(error);
    broadcast({ type: 'done' });
  }
}