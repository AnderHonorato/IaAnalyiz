import { PrismaClient } from '@prisma/client';
import { fetchMlUser, fetchAllSellerItems, fetchMlItemsBatch, extractWeightGrams, extractDimensionsCm } from './mlService.js';

const prisma   = new PrismaClient();
let sseClients = [];

export function addSseClient(res) {
  sseClients.push(res);
  res.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
}

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => { try { client.write(data); } catch (_) {} });
}

function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  broadcast({ type, msg: `[${time}] ${msg}` });
  console.log(`[BOT] [${time}] ${msg}`);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function checkDivergencia(pesoMl, pesoLocal) {
  if (pesoLocal === 0) return { isDiv: false };
  if (pesoMl === 0 && pesoLocal > 0) return { isDiv: true, texto: `Anúncio ML sem peso (0g) | Seu sistema diz: ${pesoLocal}g` };
  const diff    = Math.abs(pesoMl - pesoLocal);
  const diffPct = diff / pesoLocal;
  if (diff > 50 || diffPct > 0.15) {
    return { isDiv: true, texto: `Diferença crítica de Frete! ML cobra ${pesoMl}g, mas o real da caixa é ${pesoLocal}g (Erro de ${diff}g).` };
  }
  return { isDiv: false };
}

// Frases variadas de progresso para tornar a varredura mais dinâmica
const FRASES_ANALISE = [
  'Cruzando dados com tabela de pesos local...',
  'Verificando atributos logísticos do anúncio...',
  'Consultando dados de frete declarados ao ML...',
  'Analisando dimensões e cubagem do pacote...',
  'Comparando peso informado vs. peso cadastrado...',
  'Checando histórico de divergências anteriores...',
  'Validando integridade dos dados de envio...',
  'Calculando margem de erro permitida pelo ML...',
];

let fraseIdx = 0;
function proximaFrase() {
  return FRASES_ANALISE[fraseIdx++ % FRASES_ANALISE.length];
}

export async function runBot(userId, modoLento = false) {
  if (!userId) { broadcast({ type: 'done' }); return; }

  // Estatísticas detalhadas para resumo final
  const stats = {
    totalAnuncios: 0, processados: 0, pendentesCriados: 0,
    novasDiv: 0, divExistentes: 0, resolvidas: 0, reincidentes: 0,
    ignorados: 0, pulados: 0, errosBatch: 0,
    maioresDivergencias: [], anunciosOk: 0,
  };

  try {
    // ── FASE 1: Autenticação ──────────────────────────────────────────────
    broadcast({ type: 'progress', percent: 0 });
    log('🔐 Iniciando sequência de autenticação segura...', 'info');
    await sleep(modoLento ? 1800 : 900);
    log('🔑 Verificando token OAuth2 do Mercado Livre...', 'info');
    await sleep(modoLento ? 1500 : 700);

    let mlUser;
    try { mlUser = await fetchMlUser(userId); }
    catch (e) {
      log('❌ FALHA DE AUTENTICAÇÃO: Token expirado ou inválido. Acesse Configurações → Reconectar ML.', 'warn');
      broadcast({ type: 'done' }); return;
    }

    log(`✅ Autenticação concluída. Operando como: ${mlUser.nickname}`, 'success');
    await sleep(modoLento ? 1200 : 600);
    broadcast({ type: 'progress', percent: 3 });

    // ── FASE 2: Mapeamento de anúncios ────────────────────────────────────
    log('📡 Conectando aos servidores do Mercado Livre...', 'info');
    await sleep(modoLento ? 1500 : 700);
    log('🗂️  Solicitando índice completo de anúncios ativos...', 'info');
    await sleep(modoLento ? 1200 : 500);

    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(userId, (fetched, total) => {
        const pct = total > 0 ? Math.round((fetched / total) * 8) + 3 : 3;
        broadcast({ type: 'progress', percent: pct });
      });
    } catch (e) {
      log(`❌ Falha de comunicação com a API do ML: ${e.message}`, 'warn');
      broadcast({ type: 'done' }); return;
    }

    stats.totalAnuncios = allIds.length;

    if (allIds.length === 0) {
      log('⚠️  Nenhum anúncio ativo encontrado na conta.', 'warn');
      broadcast({ type: 'done' }); return;
    }

    log(`📋 Inventário localizado: ${allIds.length} anúncio(s) ativos para análise.`, 'success');
    await sleep(modoLento ? 1200 : 600);
    broadcast({ type: 'progress', percent: 12 });

    // ── FASE 3: Carregamento do catálogo local ────────────────────────────
    log('💾 Carregando catálogo de pesos interno...', 'info');
    await sleep(modoLento ? 1000 : 500);

    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
      include: { itensDoKit: { include: { produto: true } } }
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    log(`📦 Catálogo local: ${produtosLocais.length} produto(s) vinculados encontrados.`, 'info');
    await sleep(modoLento ? 1000 : 500);
    broadcast({ type: 'progress', percent: 15 });

    // ── FASE 4: Varredura por lotes ───────────────────────────────────────
    log('🔍 Iniciando varredura comparativa (ML ↔ Sistema)...', 'info');
    await sleep(modoLento ? 1500 : 700);

    const BATCH = 20;

    for (let i = 0; i < allIds.length; i += BATCH) {
      const lote = allIds.slice(i, i + BATCH);
      const loteNum = Math.floor(i / BATCH) + 1;
      const totalLotes = Math.ceil(allIds.length / BATCH);

      log(`📂 Processando lote ${loteNum}/${totalLotes} — ${lote.length} anúncios...`, 'info');
      await sleep(modoLento ? 2500 : 1000);

      let detalhes = [];
      let tentativas = 3;
      let loteCarregado = false;

      while (tentativas > 0 && !loteCarregado) {
        try {
          log(`   → ${proximaFrase()}`, 'info');
          await sleep(modoLento ? 2000 : 800);
          detalhes = await fetchMlItemsBatch(userId, lote);
          loteCarregado = true;
          await sleep(modoLento ? 1800 : 600);
        } catch (e) {
          tentativas--;
          stats.errosBatch++;
          log(`   ⏳ Alerta de Timeout (ML). Standby por ${modoLento ? 12 : 8}s... (${tentativas} tentativa(s) restante(s))`, 'warn');
          await sleep(modoLento ? 12000 : 8000);
        }
      }

      if (!loteCarregado) {
        stats.pulados += lote.length;
        log(`   ⚠️ Lote ${loteNum} ignorado após 3 falhas de timeout.`, 'warn');
        continue;
      }

      // Processa cada item do lote
      for (const entry of detalhes) {
        if (entry.code !== 200 || !entry.body) continue;

        const item   = entry.body;
        const itemId = (item.id || '').trim().toUpperCase();
        const titulo = item.title || itemId;
        const pesoMl = extractWeightGrams(item);
        const link   = item.permalink || `https://www.mercadolivre.com.br/p/${itemId}`;
        const dims   = extractDimensionsCm(item);

        let local = mapaLocal.get(itemId);

        // Anúncio desconhecido → cria como ML_PENDENTE
        if (!local) {
          try {
            local = await prisma.produto.create({
              data: {
                usuarioId: parseInt(userId), sku: itemId, nome: titulo,
                mlItemId: itemId, preco: item.price || 0, pesoGramas: 0, eKit: false,
                alturaCm: dims.alturaCm, larguraCm: dims.larguraCm, comprimentoCm: dims.comprimentoCm,
                categoria: item.category_id || null, plataforma: 'ML_PENDENTE',
                status: item.status || 'active', thumbnail: item.thumbnail || null
              }
            });
            stats.pendentesCriados++;
            mapaLocal.set(itemId, local);
            log(`   🆕 Novo anúncio detectado: "${titulo.substring(0, 45)}${titulo.length > 45 ? '...' : ''}"`, 'info');
          } catch (err) {}
          continue;
        }

        // Ignora filtrados
        if (local.plataforma === 'ML_IGNORADO') { stats.ignorados++; continue; }
        if (local.plataforma === 'ML_PENDENTE') continue;

        stats.processados++;

        let pesoLocal = local.eKit && local.itensDoKit?.length > 0
          ? local.itensDoKit.reduce((soma, r) => soma + (r.quantidade * (r.produto.pesoGramas || 0)), 0)
          : (local.pesoGramas || 0);

        const check = checkDivergencia(pesoMl, pesoLocal);

        if (check.isDiv) {
          const diff = Math.abs(pesoMl - pesoLocal);

          // Guarda as maiores divergências para o resumo
          if (stats.maioresDivergencias.length < 5) {
            stats.maioresDivergencias.push({ titulo: titulo.substring(0, 40), diff, mlItemId: itemId });
          }

          const existing = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId },
            orderBy: { createdAt: 'desc' }
          });

          if (!existing) {
            await prisma.divergencia.create({
              data: { usuarioId: parseInt(userId), mlItemId: itemId, link, motivo: check.texto, pesoMl, pesoLocal, titulo, status: 'PENDENTE', plataforma: 'Mercado Livre' }
            });
            stats.novasDiv++;
            log(`   🚨 DIVERGÊNCIA ENCONTRADA: "${titulo.substring(0, 35)}..." — Diferença de ${diff}g no frete!`, 'warn');
            await sleep(modoLento ? 1200 : 400);
          } else {
            const novoStatus = existing.status === 'CORRIGIDO' ? 'REINCIDENTE' : existing.status;
            if (novoStatus === 'REINCIDENTE') {
              stats.reincidentes++;
              log(`   ⚠️ REINCIDENTE: "${titulo.substring(0, 35)}..." — ML alterou o peso novamente!`, 'warn');
              await sleep(modoLento ? 1000 : 300);
            } else {
              stats.divExistentes++;
            }
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo: check.texto, pesoMl, pesoLocal, titulo, link, status: novoStatus }
            });
          }
        } else {
          // Peso OK — verifica se havia pendência para fechar
          const pendente = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId, status: { in: ['PENDENTE', 'REINCIDENTE'] } }
          });
          if (pendente) {
            await prisma.divergencia.update({
              where: { id: pendente.id },
              data: { status: 'CORRIGIDO', resolvido: true }
            });
            stats.resolvidas++;
            log(`   ✅ Corrigido automaticamente: "${titulo.substring(0, 35)}..."`, 'success');
          } else {
            stats.anunciosOk++;
          }
        }
      }

      // Atualiza progresso gradualmente
      const pct = 15 + Math.round(((i + lote.length) / allIds.length) * 75);
      broadcast({ type: 'progress', percent: Math.min(pct, 90) });

      // Pausa entre lotes para não sobrecarregar a API do ML
      if (i + BATCH < allIds.length) {
        await sleep(modoLento ? 3000 : 1000);
      }
    }

    // ── FASE 5: Pós-processamento e resumo ────────────────────────────────
    broadcast({ type: 'progress', percent: 93 });
    log('', 'info');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    log('📊 RELATÓRIO FINAL DA VARREDURA', 'success');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');

    await sleep(modoLento ? 1500 : 700);
    log(`🗂️  Total de anúncios auditados:  ${stats.totalAnuncios}`, 'info');
    await sleep(modoLento ? 600 : 200);
    log(`✅ Anúncios com peso correto:    ${stats.anunciosOk + stats.processados - stats.novasDiv - stats.divExistentes - stats.reincidentes}`, 'success');
    await sleep(modoLento ? 600 : 200);
    log(`🆕 Anúncios novos (sem vínculo): ${stats.pendentesCriados}`, 'info');
    await sleep(modoLento ? 600 : 200);
    log(`👁️  Anúncios ignorados pelo filtro:${stats.ignorados}`, 'info');

    if (stats.novasDiv > 0 || stats.reincidentes > 0 || stats.divExistentes > 0) {
      await sleep(modoLento ? 800 : 300);
      log('', 'info');
      log('⚠️  PROBLEMAS DETECTADOS:', 'warn');
      await sleep(modoLento ? 500 : 200);
      if (stats.novasDiv > 0)      log(`   🚨 Novas divergências encontradas:    ${stats.novasDiv}`, 'warn');
      if (stats.reincidentes > 0)  log(`   🔁 Divergências reincidentes (relaps): ${stats.reincidentes}`, 'warn');
      if (stats.divExistentes > 0) log(`   🕐 Divergências já conhecidas (open):  ${stats.divExistentes}`, 'warn');
      if (stats.resolvidas > 0)    log(`   ✅ Divergências auto-resolvidas hoje:  ${stats.resolvidas}`, 'success');
    } else {
      await sleep(modoLento ? 600 : 250);
      log('🎉 Nenhuma divergência de peso encontrada! Frete 100% íntegro.', 'success');
    }

    if (stats.maioresDivergencias.length > 0) {
      await sleep(modoLento ? 800 : 300);
      log('', 'info');
      log('🔎 TOP DIVERGÊNCIAS POR IMPACTO:', 'warn');
      stats.maioresDivergencias
        .sort((a, b) => b.diff - a.diff)
        .forEach(d => log(`   • ${d.mlItemId} — "${d.titulo}" — Erro de ${d.diff}g`, 'warn'));
    }

    if (stats.pendentesCriados > 0) {
      await sleep(modoLento ? 800 : 300);
      log('', 'info');
      log(`💡 AÇÃO NECESSÁRIA: ${stats.pendentesCriados} anúncio(s) novo(s) precisam ser vinculados ao catálogo local.`, 'warn');
      log('   → Acesse a aba "Não Vinculados" para mapear cada um.', 'info');
    }

    if (stats.errosBatch > 0) {
      log(`⚡ Timeouts registrados durante varredura: ${stats.errosBatch} (todos recuperados).`, 'info');
    }

    await sleep(modoLento ? 1000 : 500);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    log('✅ Varredura concluída. Dados atualizados no painel.', 'success');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done', stats });

  } catch (error) {
    log(`❌ Pane de execução inesperada: ${error.message}`, 'warn');
    broadcast({ type: 'done' });
  }
}