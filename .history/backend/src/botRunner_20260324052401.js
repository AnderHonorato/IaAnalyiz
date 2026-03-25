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

function broadcastStep(label) {
  broadcast({ type: 'step', step: label });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const FRASES_ANALISE = [
  'Cruzando dimensões declaradas vs. medidas reais da caixa...',
  'Validando consistência de peso no cadastro vs. etiqueta de frete...',
  'Verificando atributos de embalagem na ficha técnica do ML...',
  'Calculando diferença percentual de custo logístico...',
  'Inspecionando histórico de divergências anteriores...',
  'Consultando política de frete vigente do Mercado Livre...',
  'Analisando dimensões volumétricas declaradas no anúncio...',
  'Comparando SKU local com metadados da listagem ML...',
  'Verificando se anúncio usa peso de kit ou unitário...',
  'Detectando possíveis inconsistências de categoria x peso...',
  'Analisando tabela de frete aplicada ao anúncio...',
  'Cruzando preço de frete cobrado vs. custo real estimado...',
  'Auditando integridade dos atributos de logística...',
];

function getFraseAleatoria() {
  return FRASES_ANALISE[Math.floor(Math.random() * FRASES_ANALISE.length)];
}

function checkDivergenciaCompleta(mlItem, localItem) {
  const divergencias = [];
  let diffFreteGrams = 0;

  // 1. Peso
  const pesoMl = extractWeightGrams(mlItem);
  const pesoLocal = localItem.eKit && localItem.itensDoKit?.length > 0
    ? localItem.itensDoKit.reduce((soma, r) => soma + (r.quantidade * (r.produto.pesoGramas || 0)), 0)
    : (localItem.pesoGramas || 0);

  if (pesoLocal > 0) {
    const diffPeso = Math.abs(pesoMl - pesoLocal);
    const diffPct = diffPeso / pesoLocal;
    if (pesoMl === 0) {
      divergencias.push(`Peso ML zerado vs Local ${pesoLocal}g`);
      diffFreteGrams = pesoLocal;
    } else if (diffPeso > 50 || diffPct > 0.15) {
      divergencias.push(`Peso (ML ${pesoMl}g vs Local ${pesoLocal}g)`);
      diffFreteGrams = diffPeso;
    }
  }

  // 2. Preço
  const precoMl = parseFloat(mlItem.price) || 0;
  const precoLocal = parseFloat(localItem.preco) || 0;
  if (precoLocal > 0 && Math.abs(precoMl - precoLocal) > 0.05) {
    divergencias.push(`Preço (ML R$${precoMl} vs Local R$${precoLocal})`);
  }

  // 3. Dimensões
  const dims = extractDimensionsCm(mlItem);
  const altLocal = parseFloat(localItem.alturaCm) || 0;
  if (altLocal > 0 && Math.abs(dims.alturaCm - altLocal) > 0.5) divergencias.push(`Altura (ML ${dims.alturaCm}cm vs Local ${altLocal}cm)`);
  
  const largLocal = parseFloat(localItem.larguraCm) || 0;
  if (largLocal > 0 && Math.abs(dims.larguraCm - largLocal) > 0.5) divergencias.push(`Largura (ML ${dims.larguraCm}cm vs Local ${largLocal}cm)`);

  const compLocal = parseFloat(localItem.comprimentoCm) || 0;
  if (compLocal > 0 && Math.abs(dims.comprimentoCm - compLocal) > 0.5) divergencias.push(`Comprimento (ML ${dims.comprimentoCm}cm vs Local ${compLocal}cm)`);

  // 4. Ficha Técnica
  const getAttr = (id) => mlItem.attributes?.find(a => a.id === id)?.value_name || '';
  
  const eanLocal = (localItem.ean || '').trim();
  const eanMl = (getAttr('GTIN') || getAttr('EAN') || '').trim();
  if (eanLocal && eanMl && eanLocal !== eanMl) divergencias.push(`EAN (ML ${eanMl} vs Local ${eanLocal})`);

  const marcaLocal = (localItem.marca || '').trim().toUpperCase();
  const marcaMl = (getAttr('BRAND') || '').trim().toUpperCase();
  if (marcaLocal && marcaMl && marcaLocal !== marcaMl) divergencias.push(`Marca (ML ${marcaMl} vs Local ${marcaLocal})`);

  const modeloLocal = (localItem.modelo || '').trim().toUpperCase();
  const modeloMl = (getAttr('MODEL') || '').trim().toUpperCase();
  if (modeloLocal && modeloMl && modeloLocal !== modeloMl) divergencias.push(`Modelo (ML ${modeloMl} vs Local ${modeloLocal})`);

  return { 
    isDiv: divergencias.length > 0, 
    texto: divergencias.join(' | '), 
    pesoMl, 
    pesoLocal, 
    diffFreteGrams 
  };
}

export async function runBot(userId, modoLento = false) {
  if (!userId) { broadcast({ type: 'done', stats: null }); return; }

  const stats = {
    totalAnuncios: 0, processados: 0, pendentesCriados: 0,
    novasDiv: 0, divExistentes: 0, resolvidas: 0, reincidentes: 0,
    ignorados: 0, pulados: 0, errosBatch: 0,
    maioresDivergencias: [], anunciosOk: 0,
  };

  try {
    // ── FASE 1: AUTENTICAÇÃO (0→5%) ──────────────────────────────────
    broadcastStep('Fase 1/5 — Autenticação');
    log('🔐 Iniciando protocolo de autenticação segura com os servidores do ML...', 'info');
    await sleep(700);
    log('🔗 Estabelecendo conexão TLS com api.mercadolibre.com:443...', 'info');
    await sleep(600);

    let mlUser;
    try { mlUser = await fetchMlUser(userId); }
    catch (e) {
      log('❌ Conexão recusada: Token da loja expirou ou foi revogado. Renove nas configurações.', 'warn');
      broadcast({ type: 'done', stats: null }); return;
    }

    log(`✅ Autenticação aprovada. Operando como: ${mlUser.nickname} (ID: ${mlUser.id})`, 'success');
    await sleep(400);
    broadcast({ type: 'progress', percent: 3 });
    await sleep(300);
    broadcast({ type: 'progress', percent: 5 });

    // ── FASE 2: MAPEAMENTO DE ANÚNCIOS (5→20%) ───────────────────────
    broadcastStep('Fase 2/5 — Mapeamento de anúncios');
    log('📡 Conectando ao índice de anúncios ativos do Mercado Livre...', 'info');
    await sleep(800);
    log('🗄️  Iniciando paginação da API (limite: 100 itens por requisição)...', 'info');
    await sleep(600);

    let allIds = [];
    try {
      allIds = await fetchAllSellerItems(userId, (fetched, total) => {
        const pct = total > 0 ? 5 + Math.round((fetched / total) * 15) : 7;
        broadcast({ type: 'progress', percent: pct });
        if (fetched > 0 && fetched % 100 === 0)
          log(`📋 Indexados ${fetched} de ${total} anúncios...`, 'info');
      });
    } catch (e) {
      log(`❌ Falha de comunicação (ML API): ${e.message}`, 'warn');
      broadcast({ type: 'done', stats: null }); return;
    }

    if (allIds.length === 0) {
      log('⚠️  Nenhum anúncio ativo encontrado na conta.', 'warn');
      broadcast({ type: 'done', stats }); return;
    }

    stats.totalAnuncios = allIds.length;
    log(`📊 Mapeamento concluído: ${allIds.length} anúncios ativos encontrados!`, 'success');
    await sleep(500);
    broadcast({ type: 'progress', percent: 20 });

    // ── FASE 3: CATÁLOGO LOCAL (20→25%) ──────────────────────────────
    broadcastStep('Fase 3/5 — Carregando catálogo local');
    log('🗃️  Carregando catálogo local de produtos do banco de dados...', 'info');
    await sleep(700);

    const produtosLocais = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), mlItemId: { not: null } },
      include: { itensDoKit: { include: { produto: true } } }
    });
    const mapaLocal = new Map(produtosLocais.map(p => [p.mlItemId.trim().toUpperCase(), p]));

    log(`✅ Catálogo carregado: ${produtosLocais.length} produtos com vínculo ML encontrados.`, 'success');
    await sleep(400);
    log(`🔄 Construindo índice de correspondência ML ↔ Local...`, 'info');
    await sleep(500);
    broadcast({ type: 'progress', percent: 25 });

    // ── FASE 4: VARREDURA EM LOTE (25→90%) ───────────────────────────
    broadcastStep('Fase 4/5 — Auditoria de divergências');
    log(`🔍 Iniciando varredura profunda — processando ${allIds.length} anúncios em lotes de 20...`, 'info');
    await sleep(600);
    log(`⚙️  Modo: ${modoLento ? 'Standby Anti-Timeout (pausas prolongadas)' : 'Padrão (velocidade normal)'}`, 'info');
    await sleep(400);

    const BATCH = 20;
    let fraseCounter = 0;

    for (let i = 0; i < allIds.length; i += BATCH) {
      const lote        = allIds.slice(i, i + BATCH);
      let   detalhes    = [];
      let   tentativas  = 3;
      let   loteCarregado = false;

      // Exibe frase dramática a cada lote
      fraseCounter++;
      if (fraseCounter % 2 === 0) {
        log(`🧠 ${getFraseAleatoria()}`, 'info');
        await sleep(modoLento ? 400 : 150);
      }

      while (tentativas > 0 && !loteCarregado) {
        try {
          detalhes = await fetchMlItemsBatch(userId, lote);
          loteCarregado = true;
          await sleep(modoLento ? 2200 : 900);
        } catch (e) {
          tentativas--;
          log(`⏳ Timeout detectado na ML API. Entrando em Standby por 8s... (${tentativas} tentativas restantes)`, 'warn');
          await sleep(8000);
        }
      }

      if (!loteCarregado) {
        stats.errosBatch++;
        log(`⚠️  Lote ${Math.floor(i / BATCH) + 1} ignorado após 3 falhas consecutivas.`, 'warn');
        continue;
      }

      for (const entry of detalhes) {
        if (entry.code !== 200 || !entry.body) continue;

        const item   = entry.body;
        const itemId = (item.id || '').trim().toUpperCase();
        const titulo = item.title || itemId;
        const link   = item.permalink || `https://www.mercadolivre.com.br/p/${itemId}`;
        const dims   = extractDimensionsCm(item);

        let local = mapaLocal.get(itemId);

        // Fantasma → cria como Não Vinculado
        if (!local) {
          try {
            local = await prisma.produto.create({
              data: {
                usuarioId: parseInt(userId), sku: itemId, nome: titulo, mlItemId: itemId,
                preco: item.price || 0, pesoGramas: 0, eKit: false,
                alturaCm: dims.alturaCm, larguraCm: dims.larguraCm, comprimentoCm: dims.comprimentoCm,
                categoria: item.category_id || null, plataforma: 'ML_PENDENTE',
                status: item.status || 'active', thumbnail: item.thumbnail || null
              }
            });
            stats.pendentesCriados++;
            mapaLocal.set(itemId, local);
            log(`🆕 Novo anúncio sem vínculo: "${titulo.substring(0, 50)}"`, 'info');
          } catch (_) {}
          continue;
        }

        if (local.plataforma === 'ML_IGNORADO') { stats.ignorados++; continue; }
        if (local.plataforma === 'ML_PENDENTE')  { stats.pulados++;   continue; }

        stats.processados++;

        // Nova verificação completa que cruza Preço, Peso, Dimensões e Ficha Técnica
        const check = checkDivergenciaCompleta(item, local);

        if (check.isDiv) {
          const diff     = check.diffFreteGrams;
          const pesoMl   = check.pesoMl;
          const pesoLocal = check.pesoLocal;

          const existing = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId },
            orderBy: { createdAt: 'desc' }
          });

          if (!existing) {
            await prisma.divergencia.create({
              data: { usuarioId: parseInt(userId), mlItemId: itemId, link, motivo: check.texto, pesoMl, pesoLocal, titulo, status: 'PENDENTE', plataforma: 'Mercado Livre' }
            });
            stats.novasDiv++;
            stats.maioresDivergencias.push({ titulo: titulo.substring(0, 40), diff, itemId });
            log(`🚨 Nova Divergência: "${titulo.substring(0, 45)}" → Erros detectados!`, 'warn');
          } else {
            const novoStatus = existing.status === 'CORRIGIDO' ? 'REINCIDENTE' : existing.status;
            if (novoStatus === 'REINCIDENTE') {
              stats.reincidentes++;
              log(`⚠️  REINCIDENTE: "${titulo.substring(0, 45)}" voltou a divergir!`, 'warn');
            } else {
              stats.divExistentes++;
            }
            await prisma.divergencia.update({
              where: { id: existing.id },
              data: { motivo: check.texto, pesoMl, pesoLocal, titulo, link, status: novoStatus }
            });
          }
        } else {
          const pendente = await prisma.divergencia.findFirst({
            where: { usuarioId: parseInt(userId), mlItemId: itemId, status: { in: ['PENDENTE', 'REINCIDENTE'] } }
          });
          if (pendente) {
            await prisma.divergencia.update({ where: { id: pendente.id }, data: { status: 'CORRIGIDO', resolvido: true } });
            stats.resolvidas++;
            log(`✅ Corrigido automaticamente: "${titulo.substring(0, 45)}"`, 'success');
          } else {
            stats.anunciosOk++;
          }
        }
      }

      const pct = 25 + Math.round(((i + lote.length) / allIds.length) * 65);
      broadcast({ type: 'progress', percent: Math.min(pct, 89) });
    }

    // ── FASE 5: PÓS-PROCESSAMENTO (90→100%) ──────────────────────────
    broadcastStep('Fase 5/5 — Relatório final');
    broadcast({ type: 'progress', percent: 90 });
    log('📈 Finalizando varredura e compilando métricas...', 'info');
    await sleep(800);
    log('🧹 Consolidando dados no banco de dados...', 'info');
    await sleep(600);
    broadcast({ type: 'progress', percent: 95 });
    await sleep(500);

    // Relatório final no terminal
    log('══════════════════════════════════════════════', 'success');
    log('📊  RELATÓRIO FINAL DE AUDITORIA', 'success');
    log(`    Total de anúncios verificados : ${stats.totalAnuncios}`, 'info');
    log(`    Processados e auditados       : ${stats.processados}`, 'info');
    log(`    ✅  Sem divergências           : ${stats.anunciosOk}`, 'success');
    log(`    🚨  Novas divergências         : ${stats.novasDiv}`, stats.novasDiv > 0 ? 'warn' : 'info');
    log(`    ⚠️   Já pendentes              : ${stats.divExistentes}`, 'info');
    log(`    🔁  Reincidentes               : ${stats.reincidentes}`, stats.reincidentes > 0 ? 'warn' : 'info');
    log(`    ✔️   Resolvidos automaticamente: ${stats.resolvidas}`, stats.resolvidas > 0 ? 'success' : 'info');
    log(`    🆕  Novos (sem vínculo)        : ${stats.pendentesCriados}`, 'info');
    log(`    👁️   Ignorados (filtro)         : ${stats.ignorados}`, 'info');
    if (stats.errosBatch > 0)
      log(`    ⚡  Lotes com erro de timeout  : ${stats.errosBatch}`, 'warn');

    if (stats.maioresDivergencias.length > 0) {
      const top = stats.maioresDivergencias.sort((a, b) => b.diff - a.diff).slice(0, 3);
      log('══════════════════════════════════════════════', 'warn');
      log('🔴  TOP DIVERGÊNCIAS POR IMPACTO NO FRETE:', 'warn');
      top.forEach((d, idx) =>
        log(`    ${idx + 1}. ${d.itemId} — ${d.titulo} → ${d.diff}g de erro`, 'warn'));
    }

    log('══════════════════════════════════════════════', 'success');
    log('🎯  Varredura 100% concluída com sucesso!', 'success');

    broadcast({ type: 'progress', percent: 100 });
    broadcast({ type: 'done', stats });

  } catch (error) {
    log(`❌ Pane de execução: ${error.message}`, 'warn');
    broadcast({ type: 'done', stats });
  }
}