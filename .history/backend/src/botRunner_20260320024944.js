/**
 * botRunner.js
 * Inteligência de Varredura e Conexão ML.
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
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit', second:'2-digit' });
  broadcast({ type, msg: `[${time}] ${msg}` });
  console.log(`[BOT] [${time}] ${msg}`);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function checkDivergencia(pesoMl, pesoLocal) {
  if (pesoLocal === 0) return { isDiv: false }; 
  if (pesoMl === 0 && pesoLocal > 0) return { isDiv: true, texto: `Peso não preenchido no anúncio do ML (0g). O seu sistema indica ${pesoLocal}g.` };
  
  const diff = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  if (diff > 50 || diffPct > 0.15) {
    return { isDiv: true, texto: `Diferença crítica de Frete! ML cobra ${pesoMl}g, mas o real da caixa é ${pesoLocal}g (Erro de ${diff}g).` };
  }
  return { isDiv: false };
}

export async function runBot(userId, modoLento = false) {
  if (!userId) { broadcast({ type: 'done' }); return; }

  try {
    log('Autenticando credenciais criptografadas no servidor do Mercado Livre...', 'info');
    let mlUser;
    try { mlUser = await fetchMlUser(userId); } 
    catch (e) { log(`❌ Conexão recusada: O token da sua loja expirou. Renove o acesso no painel.`, 'warn'); broadcast({ type: 'done' }); return; }
    
    log(`Acesso liberado. Operando nos dados do vendedor: ${mlUser.nickname}.`, 'success');
    log('Extraindo matriz completa de anúncios ativos...', 'info');
    
    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(userId, (fetched, total) => {
        const pct = total > 0 ? Math.round((fetched / total) * 15) : 0;
        broadcast({ type: 'progress', percent: pct });
      });
    } catch (e) { log(`❌ Interrupção de rede (ML API): ${e.message}`, 'warn'); broadcast({ type: 'done' }); return; }

    if (allIds.length === 0) { log('Varredura não encontrou nenhum anúncio ativo.', 'info'); broadcast({ type: 'done' }); return; }

    log(`Localizados ${allIds.length} anúncios. Iniciando cruzamento volumétrico...`, 'info');

    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
      include: { itensDoKit: { include: { produto: true } } }
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    const BATCH = 20;
    let processados = 0, pendentesCriados = 0;
    let novasDiv = 0, divExistentes = 0, resolvidas = 0, reincidentes = 0, ignorados = 0;

    for (let i = 0; i < allIds.length; i += BATCH) {
      const lote = allIds.slice(i, i + BATCH);
      
      let detalhes = [];
      let tentativas = 3;
      let loteCarregado = false;

      while (tentativas > 0 && !loteCarregado) {
        try {
          detalhes = await fetchMlItemsBatch(userId, lote);
          loteCarregado = true;
          await sleep(modoLento ? 2000 : 800); // Pausa estratégica anti-block
        } catch (e) {
          tentativas--;
          log(`⏳ Alerta de Rate Limit no Mercado Livre. Entrando em Standby de 10s... (Restam ${tentativas} tentativas)`, 'warn');
          await sleep(10000); 
        }
      }

      if (!loteCarregado) {
        log(`⚠️ Salto forçado: Lote de ${lote.length} anúncios ignorado após 3 falhas de timeout.`, 'warn');
        continue;
      }

      for (const entry of detalhes) {
        if (entry.code !== 200 || !entry.body) continue;

        const item = entry.body;
        const itemId = (item.id || '').trim().toUpperCase();
        const titulo = item.title || itemId;
        const pesoMl = extractWeightGrams(item);
        const link = item.permalink || `https://www.mercadolivre.com.br/p/${itemId}`;
        const dims = extractDimensionsCm(item);

        let local = mapaLocal.get(itemId);

        // Encontrou um Fantasma
        if (!local) {
          try {
            local = await prisma.produto.create({
              data: { usuarioId: parseInt(userId), sku: itemId, nome: titulo, mlItemId: itemId, preco: item.price || 0, pesoGramas: 0, eKit: false, alturaCm: dims.alturaCm, larguraCm: dims.larguraCm, comprimentoCm: dims.comprimentoCm, categoria: item.category_id || null, plataforma: 'ML_PENDENTE', status: item.status || 'active', thumbnail: item.thumbnail || null }
            });
            pendentesCriados++; mapaLocal.set(itemId, local);
          } catch (err) {}
          continue; 
        }

        // Filtro de Ignorados
        if (local.plataforma === 'ML_IGNORADO') { ignorados++; continue; }
        if (local.plataforma === 'ML_PENDENTE') continue;

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
            log(`🚨 Nova Divergência Adicionada: O anúncio "${titulo}" apresenta falha de peso.`, 'warn');
          } else {
            const novoStatus = existing.status === 'CORRIGIDO' ? 'REINCIDENTE' : existing.status;
            if (novoStatus === 'REINCIDENTE') {
              reincidentes++;
              log(`⚠️ REINCIDENTE! Você já havia arrumado, mas o ML mudou o peso de "${titulo}" novamente.`, 'warn');
            } else if (novoStatus === 'PENDENTE') {
              divExistentes++; 
            }
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo: check.texto, pesoMl, pesoLocal, titulo, link, status: novoStatus },
            });
          }
        } else {
          // Peso bateu. Verifica se antes estava pendente pra fechar automático
          const pendente = await prisma.divergencia.findFirst({ where: { usuarioId: parseInt(userId), mlItemId: itemId, status: { in: ['PENDENTE', 'REINCIDENTE'] } } });
          if (pendente) {
            await prisma.divergencia.update({ where: { id: pendente.id }, data: { status: 'CORRIGIDO', resolvido: true } });
            resolvidas++;
            log(`✅ Corrigido no sistema ML: "${titulo}".`, 'success');
          }
        }
      }

      const pct = 15 + Math.round(((i + lote.length) / allIds.length) * 85);
      broadcast({ type: 'progress', percent: Math.min(pct, 99) });
    }

    log(`Varredura e auditoria 100% finalizadas.`, 'success');
    
    // Relatório Inteligente
    if (pendentesCriados > 0) log(`💡 Encontrei ${pendentesCriados} anúncios novos na conta. Eles foram para a aba Não Vinculados.`, 'info');
    if (ignorados > 0) log(`👁️ ${ignorados} anúncios foram pulados porque estão na sua lista de ignorados.`, 'info');
    if (resolvidas > 0) log(`✅ Fechei ${resolvidas} divergências que constam como corretas no ML.`, 'success');
    
    log(`📊 Diagnóstico Final: ${novasDiv} novas divergências localizadas. ${divExistentes > 0 ? `(${divExistentes} pendências antigas continuam abertas).` : 'O restante está ok.'}`, 'info');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done' });
  } catch (error) {
    log(`❌ Pane de execução: ${error.message}`, 'warn');
    broadcast({ type: 'done' });
  }
}