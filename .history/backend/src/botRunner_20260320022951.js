/**
 * botRunner.js
 * Robô IA de Auditoria Mercado Livre.
 * Traz logs humanizados e resiliência (Auto-Retry) para quedas/timeout da API.
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
  if (pesoMl === 0 && pesoLocal > 0) return { isDiv: true, texto: `Peso não informado no ML (0g). O seu sistema diz que pesa ${pesoLocal}g.` };
  
  const diff = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  if (diff > 50 || diffPct > 0.15) {
    return { isDiv: true, texto: `Inconsistência de frete! ML cobra por ${pesoMl}g, mas o real é ${pesoLocal}g (Dif: ${diff}g).` };
  }
  return { isDiv: false };
}

export async function runBot(userId) {
  if (!userId) { broadcast({ type: 'done' }); return; }

  try {
    log('🧠 Iniciando protocolo de mapeamento neural. Verificando credenciais...', 'info');
    let mlUser;
    try { mlUser = await fetchMlUser(userId); } 
    catch (e) { log(`❌ Erro crítico: A conexão com o Mercado Livre expirou. Por favor, reautorize o acesso no painel.`, 'warn'); broadcast({ type: 'done' }); return; }
    
    log(`✨ Identidade confirmada: Operando na conta da loja "${mlUser.nickname}".`, 'success');
    log('🔍 Varrendo catálogo do Mercado Livre em busca de anúncios ativos...', 'info');
    
    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(userId, (fetched, total) => {
        const pct = total > 0 ? Math.round((fetched / total) * 15) : 0;
        broadcast({ type: 'progress', percent: pct, msg: `Extraindo matriz de anúncios do ML: ${fetched}/${total}` });
      });
    } catch (e) { log(`❌ Falha de comunicação com a rede do ML: ${e.message}`, 'warn'); broadcast({ type: 'done' }); return; }

    if (allIds.length === 0) { log('ℹ️ A varredura não encontrou nenhum anúncio ativo.', 'info'); broadcast({ type: 'done' }); return; }

    log(`📦 Localizei ${allIds.length} anúncios ativos no ML. Analisando o banco de dados local...`, 'info');
    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
      include: { itensDoKit: { include: { produto: true } } }
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    const BATCH = 20;
    let processados = 0, pendentesCriados = 0, divergentes = 0;

    log('⚙️ Iniciando cruzamento de pesos (ML vs Sistema Local)...', 'info');

    for (let i = 0; i < allIds.length; i += BATCH) {
      const lote = allIds.slice(i, i + BATCH);
      
      // ── SISTEMA DE RESILIÊNCIA E RETRY ──
      let detalhes = [];
      let tentativas = 3;
      let loteCarregado = false;

      while (tentativas > 0 && !loteCarregado) {
        try {
          detalhes = await fetchMlItemsBatch(userId, lote);
          loteCarregado = true;
        } catch (e) {
          tentativas--;
          log(`⏳ O Mercado Livre demorou a responder ou recusou os dados. Entrando em modo Standby (Pausa de segurança)...`, 'warn');
          log(`🔄 Tentando novamente em 5 segundos. (Restam ${tentativas} tentativas)`, 'info');
          await sleep(5000); // Espera 5 segundos antes de tentar de novo
        }
      }

      if (!loteCarregado) {
        log(`⚠️ Tive que pular um lote de ${lote.length} anúncios pois o Mercado Livre não estabilizou a resposta.`, 'warn');
        continue;
      }
      // ─────────────────────────────────────

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
            log(`👀 Identifiquei um anúncio fantasma (não vinculado): "${titulo}".`, 'info');
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
            log(`🚨 Cuidado! Divergência detectada no item "${titulo}". ${check.texto}`, 'warn');
          } else {
            const novoStatus = existing.status === 'CORRIGIDO' ? 'REINCIDENTE' : existing.status;
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo: check.texto, pesoMl, pesoLocal, titulo, link, status: novoStatus },
            });
            if (novoStatus === 'REINCIDENTE') log(`🚨 REINCIDÊNCIA: Você já havia corrigido o "${titulo}", mas o ML bagunçou o peso de novo!`, 'warn');
          }
        } else {
          const pendente = await prisma.divergencia.findFirst({ where: { usuarioId: parseInt(userId), mlItemId: itemId, status: { in: ['PENDENTE', 'REINCIDENTE'] } } });
          if (pendente) {
            await prisma.divergencia.update({ where: { id: pendente.id }, data: { status: 'CORRIGIDO', resolvido: true } });
            log(`✅ Análise finalizada: O erro no item "${titulo}" já consta como corrigido no ML!`, 'success');
          }
        }
      }

      const pct = 15 + Math.round(((i + lote.length) / allIds.length) * 85);
      broadcast({ type: 'progress', percent: Math.min(pct, 99) });
    }

    log(`✅ Protocolo de varredura 100% concluído.`, 'success');
    if (pendentesCriados > 0) log(`💡 Achei ${pendentesCriados} anúncios novos na sua conta. Vá na aba "Não Vinculados" para a gente arrumar.`, 'info');
    log(`📊 Relatório final: Auditei ${processados} anúncios vinculados e achei ${divergentes} pendências.`, 'success');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done' });
  } catch (error) {
    log(`❌ Pane no sistema neural: ${error.message}`, 'warn');
    broadcast({ type: 'done' });
  }
}