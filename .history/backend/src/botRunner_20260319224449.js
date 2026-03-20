/**
 * botRunner.js
 * Robô de auditoria de divergências Mercado Livre.
 *
 * Fluxo:
 *  1. Autentica na API ML e descobre o USER_ID do token
 *  2. Lista TODOS os anúncios ativos do vendedor (apenas os dele)
 *  3. Para cada anúncio, busca detalhes em lote (20 por vez)
 *  4. Compara o peso/dimensões do ML com o cadastrado no banco local
 *  5. Se houver divergência de peso (diferença > tolerância), salva no banco
 *  6. Transmite progresso via SSE para o frontend
 */

import { PrismaClient }     from '@prisma/client';
import {
  fetchMlUser,
  fetchAllSellerItems,
  fetchMlItemsBatch,
  extractWeightGrams,
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

/**
 * Considera divergente se a diferença absoluta for > 50g
 * OU se a diferença percentual for > 15%.
 */
function isDivergente(pesoMl, pesoLocal) {
  if (pesoLocal === 0) return false; // sem cadastro local, ignora
  if (pesoMl   === 0) return false; // ML sem dado de peso, ignora
  const diff    = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  return diff > 50 || diffPct > 0.15;
}

// ─── Runner principal ─────────────────────────────────────────────────────────

export async function runBot() {
  if (!process.env.ML_ACCESS_TOKEN) {
    log('❌ ML_ACCESS_TOKEN não configurado no .env', 'warn');
    broadcast({ type: 'done' });
    return;
  }

  try {
    // ── 1. Identificar o usuário dono do token ──────────────────────────────
    log('🔐 Autenticando na API do Mercado Livre...', 'info');
    let mlUser;
    try {
      mlUser = await fetchMlUser();
    } catch (e) {
      log(`❌ Token inválido ou expirado: ${e.message}`, 'warn');
      broadcast({ type: 'done' });
      return;
    }

    log(`✅ Vendedor identificado: ${mlUser.nickname} (ID: ${mlUser.id})`, 'success');

    // ── 2. Carregar produtos cadastrados localmente ────────────────────────
    const produtosLocais = await prisma.produto.findMany({
      where: { plataforma: 'Mercado Livre', mlItemId: { not: null } },
      select: { mlItemId: true, pesoGramas: true, nome: true },
    });

    const mapaLocal = new Map(
      produtosLocais
        .filter(p => p.mlItemId)
        .map(p => [p.mlItemId.trim().toUpperCase(), p])
    );

    if (mapaLocal.size === 0) {
      log('⚠️ Nenhum produto com ID ML cadastrado no banco. Cadastre produtos primeiro.', 'warn');
      broadcast({ type: 'done' });
      return;
    }

    log(`📦 ${mapaLocal.size} produto(s) com ID ML encontrado(s) no banco.`, 'info');

    // ── 3. Listar todos os anúncios ativos do vendedor ──────────────────────
    log('🔍 Buscando anúncios ativos do vendedor no ML...', 'info');

    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(mlUser.id, (fetched, total) => {
        const pct = total > 0 ? Math.round((fetched / total) * 30) : 0;
        broadcast({ type: 'progress', percent: pct, msg: `Listando anúncios: ${fetched}/${total}` });
      });
    } catch (e) {
      log(`❌ Erro ao listar anúncios: ${e.message}`, 'warn');
      broadcast({ type: 'done' });
      return;
    }

    log(`📋 Total de anúncios ativos: ${allIds.length}`, 'info');

    // Filtra apenas os IDs que temos cadastrados localmente
    const idsParaAudioria = allIds.filter(id =>
      mapaLocal.has(id.trim().toUpperCase())
    );

    if (idsParaAudioria.length === 0) {
      log('ℹ️ Nenhum anúncio do ML corresponde aos IDs cadastrados no banco.', 'info');
      log('💡 Dica: verifique se os IDs ML estão corretos no cadastro de produtos.', 'info');
      broadcast({ type: 'done' });
      return;
    }

    log(`🎯 ${idsParaAudioria.length} anúncio(s) serão auditados.`, 'info');

    // ── 4. Buscar detalhes em lote e comparar pesos ─────────────────────────
    const BATCH = 20;
    let processados  = 0;
    let divergentes  = 0;
    let salvos       = 0;

    for (let i = 0; i < idsParaAudioria.length; i += BATCH) {
      const lote     = idsParaAudioria.slice(i, i + BATCH);
      const detalhes = await fetchMlItemsBatch(lote);

      for (const entry of detalhes) {
        // Multiget retorna { code: 200, body: {...} } ou { code: 404, ... }
        if (entry.code !== 200 || !entry.body) continue;

        const item     = entry.body;
        const itemId   = (item.id || '').trim().toUpperCase();
        const local    = mapaLocal.get(itemId);
        if (!local) continue;

        const pesoMl    = extractWeightGrams(item);
        const pesoLocal = local.pesoGramas || 0;
        const titulo    = item.title || local.nome || itemId;
        const link      = item.permalink || `https://www.mercadolivre.com.br/p/${itemId}`;

        processados++;

        if (isDivergente(pesoMl, pesoLocal)) {
          divergentes++;
          const motivo = `Peso ML: ${pesoMl}g | Peso local: ${pesoLocal}g | Diferença: ${Math.abs(pesoMl - pesoLocal)}g`;

          // Verifica se divergência já existe para não duplicar
          const existing = await prisma.divergencia.findFirst({
            where: { mlItemId: item.id, status: 'PENDENTE' },
          });

          if (!existing) {
            await prisma.divergencia.create({
              data: {
                mlItemId:  item.id,
                link,
                motivo,
                pesoMl,
                pesoLocal,
                titulo:    titulo || null,
                status:    'PENDENTE',
                resolvido: false,
                plataforma:'Mercado Livre',
              },
            });
            salvos++;
            log(`⚠️ Divergência: ${titulo} — ${motivo}`, 'warn');
          } else {
            // Atualiza dados caso tenham mudado
            await prisma.divergencia.update({
              where: { id: existing.id },
              data:  { motivo, pesoMl, pesoLocal, titulo, link },
            });
            log(`🔄 Divergência atualizada: ${titulo}`, 'info');
          }
        }
      }

      // Progresso: 30–100%
      const pct = 30 + Math.round(((i + lote.length) / idsParaAudioria.length) * 70);
      broadcast({ type: 'progress', percent: Math.min(pct, 99) });
    }

    // ── 5. Relatório final ──────────────────────────────────────────────────
    log(`✅ Auditoria concluída!`, 'success');
    log(`📊 Processados: ${processados} | Divergentes: ${divergentes} | Novos: ${salvos}`, 'success');

    if (divergentes === 0) {
      log('🎉 Nenhuma divergência de peso encontrada. Tudo certo!', 'success');
    }

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done' });

  } catch (error) {
    log(`❌ Erro inesperado no bot: ${error.message}`, 'warn');
    console.error(error);
    broadcast({ type: 'done' });
  }
}