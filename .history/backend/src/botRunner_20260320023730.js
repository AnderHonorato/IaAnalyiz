/**
 * botRunner.js
 * Robô IA de Auditoria Mercado Livre.
 * Lógica anti-bloqueio (Rate Limit) e contagem inteligente de pendências.
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
  console.log(`[IA Analyiz] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkDivergencia(pesoMl, pesoLocal) {
  if (pesoLocal === 0) return { isDiv: false }; 
  if (pesoMl === 0 && pesoLocal > 0) return { isDiv: true, texto: `Peso nulo no ML (0g) | Sist: ${pesoLocal}g` };
  
  const diff = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  if (diff > 50 || diffPct > 0.15) {
    return { isDiv: true, texto: `Diferença de frete: ML cobra ${pesoMl}g vs Real ${pesoLocal}g` };
  }
  return { isDiv: false };
}

export async function runBot(userId) {
  if (!userId) { broadcast({ type: 'done' }); return; }

  try {
    log('Iniciando protocolo de auditoria...', 'info');
    let mlUser;
    try { mlUser = await fetchMlUser(userId); } 
    catch (e) { log(`❌ Erro: Conexão com o ML expirou.`, 'warn'); broadcast({ type: 'done' }); return; }
    
    log(`Conectado à loja de ${mlUser.nickname}. Mapeando catálogo...`, 'success');
    
    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(userId, (fetched, total) => {
        const pct = total > 0 ? Math.round((fetched / total) * 15) : 0;
        broadcast({ type: 'progress', percent: pct, msg: `Extraindo matriz ML: ${fetched}/${total}` });
      });
    } catch (e) { log(`❌ Falha na extração (Timeout ML): ${e.message}`, 'warn'); broadcast({ type: 'done' }); return; }

    if (allIds.length === 0) { log('Nenhum anúncio ativo localizado.', 'info'); broadcast({ type: 'done' }); return; }

    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
      include: { itensDoKit: { include: { produto: true } } }
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    const BATCH = 20;
    let processados = 0, pendentesCriados = 0;
    let novasDiv = 0, divExistentes = 0, resolvidas = 0, reincidentes = 0;

    log(`Iniciando análise de peso de ${allIds.length} anúncios...`, 'info');

    for (let i = 0; i < allIds.length; i += BATCH) {
      const lote = allIds.slice(i, i + BATCH);
      
      // ── SISTEMA ANTI-BLOQUEIO ML (STANDBY E RETRY) ──
      let detalhes = [];
      let tentativas = 3;
      let loteCarregado = false;

      while (tentativas > 0 && !loteCarregado) {
        try {
          detalhes = await fetchMlItemsBatch(userId, lote);
          loteCarregado = true;
          await sleep(1500); // Pausa de 1.5s entre lotes para esfriar a API
        } catch (e) {
          tentativas--;
          log(`⏳ Timeout do ML. Esfriando API por 8s... (Tentativas: ${tentativas})`, 'warn');
          await sleep(8000); 
        }
      }

      if (!loteCarregado) {
        log(`Pulando lote após 3 falhas de conexão com o ML.`, 'warn');
        continue;
      }
      // ────────────────────────────────────────────────

      for (const entry of detalhes) {
        if (entry.code !== 200 || !entry.body) continue;

        const item = entry.body;
        const itemId = (item.id || '').trim().toUpperCase();
        const titulo = item.title || itemId;
        const pesoMl = extractWeightGrams(item);
        const link = item.permalink || `https://www.mercadolivre.com.br/p/${itemId}`;
        const dims = extractDimensionsCm(item);

        let local = mapaLocal.get(itemId);

        if (!local) {
          try {
            local = await prisma.produto.create({
              data: {
                usuarioId: parseInt(userId), sku: itemId, nome: titulo, mlItemId: itemId, preco: item.price || 0, pesoGramas: 0, eKit: false,
                alturaCm: dims.alturaCm, larguraCm: dims.larguraCm, comprimentoCm: dims.comprimentoCm,
                categoria: item.category_id || null, plataforma: 'ML_PENDENTE', status: item.status || 'active', thumbnail: item.thumbnail || null,
              }
            });
            pendentesCriados++; mapaLocal.set(itemId, local);
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
          const existing = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId },
            orderBy: { createdAt: 'desc' }
          });

          if (!existing) {
            await prisma.divergencia.create({
              data: { usuarioId: parseInt(userId), mlItemId: itemId, link, motivo: check.texto, pesoMl, pesoLocal, titulo, status: 'PENDENTE', plataforma: 'Mercado Livre' },
            });
            novasDiv++;
            log(`⚠️ Nova anomalia: ${titulo}`, 'warn');
          } else {
            const novoStatus = existing.status === 'CORRIGIDO' ? 'REINCIDENTE' : existing.status;
            if (novoStatus === 'REINCIDENTE') {
              reincidentes++;
              log(`🚨 Reincidente: ML alterou o peso de "${titulo}" novamente.`, 'warn');
            } else if (novoStatus === 'PENDENTE') {
              divExistentes++; // Já estava pendente, não vamos flodar o terminal.
            }
            
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo: check.texto, pesoMl, pesoLocal, titulo, link, status: novoStatus },
            });
          }
        } else {
          const pendente = await prisma.divergencia.findFirst({ where: { usuarioId: parseInt(userId), mlItemId: itemId, status: { in: ['PENDENTE', 'REINCIDENTE'] } } });
          if (pendente) {
            await prisma.divergencia.update({ where: { id: pendente.id }, data: { status: 'CORRIGIDO', resolvido: true } });
            resolvidas++;
          }
        }
      }

      const pct = 15 + Math.round(((i + lote.length) / allIds.length) * 85);
      broadcast({ type: 'progress', percent: Math.min(pct, 99) });
    }

    log(`Varredura finalizada com sucesso.`, 'success');
    if (pendentesCriados > 0) log(`💡 Encontrei ${pendentesCriados} anúncios não vinculados.`, 'info');
    if (resolvidas > 0) log(`✅ Fechei ${resolvidas} divergências que foram arrumadas no ML.`, 'success');
    
    log(`Resumo: Analisei ${processados} itens. ${novasDiv} novas divergências. ${divExistentes} já estavam pendentes.`, 'info');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done' });
  } catch (error) {
    log(`❌ Erro interno: ${error.message}`, 'warn');
    broadcast({ type: 'done' });
  }
}