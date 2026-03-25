// src/ia-engine/learner.js
// Sistema de aprendizado autônomo — estuda o site silenciosamente e exibe no terminal

import { PrismaClient } from '@prisma/client';
import { saveKnowledge, logLearning, getKnowledgeStats, cleanOldLogs } from './knowledge.js';

const prisma = new PrismaClient();

let learnerInterval  = null;
let geminiInterval   = null;
let isRunning        = false;
let cycleCount       = 0;
let geminiChatCount  = 0;
const GEMINI_MODEL   = 'gemini-2.5-flash-lite-preview-06-17';

// ─── Terminal colorido ─────────────────────────────────────────────────────────
function log(msg, type = 'info') {
  const t = new Date().toLocaleTimeString('pt-BR');
  const colors = {
    info:    '\x1b[36m',   // cyan
    success: '\x1b[32m',   // green
    warn:    '\x1b[33m',   // yellow
    error:   '\x1b[31m',   // red
    study:   '\x1b[35m',   // magenta
    gemini:  '\x1b[34m',   // blue
    reset:   '\x1b[0m',
  };
  const c = colors[type] || colors.info;
  console.log(`${c}[IA-LEARNER] [${t}]${colors.reset} ${msg}`);
}

function banner() {
  console.log('\x1b[34m');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     IA ANALYIZ — SISTEMA DE APRENDIZADO      ║');
  console.log('║     Aprendizado autônomo e contínuo ativo    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\x1b[0m');
}

function getGeminiClient() {
  try {
    if (!process.env.GEMINI_API_KEY) return null;
    const { GoogleGenAI } = require('@google/genai');
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch { return null; }
}

// ─── START / STOP ─────────────────────────────────────────────────────────────

export function startLearner({ studyIntervalMin = 5, geminiIntervalMin = 15 } = {}) {
  if (learnerInterval) {
    log('Learner já em execução.', 'warn');
    return;
  }

  banner();
  log(`🧠 Aprendizado autônomo ativado! Ciclos a cada ${studyIntervalMin}min`, 'success');
  log(`🤖 Conversas com Gemini a cada ${geminiIntervalMin}min`, 'info');

  // Primeiro ciclo após 20s (servidor quente)
  setTimeout(runStudyCycle, 20000);
  // Ciclos recorrentes
  learnerInterval = setInterval(runStudyCycle, studyIntervalMin * 60 * 1000);

  // Conversa com Gemini separada
  setTimeout(chatWithGemini, 60000); // Primeiro em 1min
  geminiInterval = setInterval(chatWithGemini, geminiIntervalMin * 60 * 1000);
}

export function stopLearner() {
  if (learnerInterval) { clearInterval(learnerInterval); learnerInterval = null; }
  if (geminiInterval)  { clearInterval(geminiInterval);  geminiInterval  = null; }
  log('Sistema de aprendizado pausado.', 'warn');
}

export function getLearnerStatus() {
  return { running: !!learnerInterval, isCurrentlyLearning: isRunning, cycleCount, geminiChatCount };
}

// ─── CICLO PRINCIPAL DE ESTUDO ─────────────────────────────────────────────────

async function runStudyCycle() {
  if (isRunning) { log('Ciclo anterior em execução, aguardando...', 'warn'); return; }

  isRunning = true;
  cycleCount++;
  const start = Date.now();
  log(`🔄 ═══ CICLO #${cycleCount} ═══ Iniciando varredura do sistema...`, 'study');

  try {
    await studyDivergencias();
    await studyProdutos();
    await studyAvisosML();
    await studyAgendador();
    await studyUsagePatterns();
    await analyzeRisks();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const stats   = await getKnowledgeStats();

    log(`✅ Ciclo #${cycleCount} concluído em ${elapsed}s`, 'success');
    log(`📚 Base: ${stats.knowledgeEntries} entradas | Respostas: ${stats.correctAnswers}/${stats.totalQAPairs} (${stats.accuracy}% precisão)`, 'info');

    await logLearning('cycle_complete', `Ciclo #${cycleCount} OK em ${elapsed}s`, JSON.stringify(stats));
    await cleanOldLogs();

  } catch (e) {
    log(`❌ Erro no ciclo #${cycleCount}: ${e.message}`, 'error');
    await logLearning('cycle_error', `Ciclo #${cycleCount} falhou`, e.message);
  } finally {
    isRunning = false;
  }
}

// ─── ESTUDOS INDIVIDUAIS ──────────────────────────────────────────────────────

async function studyDivergencias() {
  log('📊 Estudando divergências de peso/frete...', 'study');
  try {
    const [pendente, reincidente, corrigido, ignorado, pendenteEnvio] = await Promise.all([
      prisma.divergencia.count({ where: { status: 'PENDENTE' } }),
      prisma.divergencia.count({ where: { status: 'REINCIDENTE' } }),
      prisma.divergencia.count({ where: { status: 'CORRIGIDO' } }),
      prisma.divergencia.count({ where: { status: 'IGNORADO' } }),
      prisma.divergencia.count({ where: { status: 'PENDENTE_ENVIO' } }),
    ]);

    const total = pendente + reincidente + corrigido + ignorado + pendenteEnvio;
    const taxa  = total > 0 ? Math.round((corrigido / total) * 100) : 0;

    const topDivs = await prisma.divergencia.findMany({
      where:   { status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select:  { mlItemId: true, titulo: true, pesoMl: true, pesoLocal: true, status: true, motivo: true },
    });

    const impactoEstimado = (pendente + reincidente) * 4.5; // R$ médio por divergência

    const content = [
      `DIVERGÊNCIAS — Atualizado em ${new Date().toLocaleString('pt-BR')}`,
      `Total registrado: ${total}`,
      `Pendentes (aguardando ação): ${pendente}`,
      `Reincidentes (voltaram a divergir): ${reincidente}`,
      `Corrigidos: ${corrigido} (taxa: ${taxa}%)`,
      `Ignorados: ${ignorado}`,
      `Fila de envio via API: ${pendenteEnvio}`,
      `Impacto financeiro estimado (pendentes): ~R$${impactoEstimado.toFixed(2)} por período`,
      reincidente > 0 ? `⚠️ ALERTA: ${reincidente} reincidente(s) — anúncios que foram "corrigidos" mas divergiram novamente` : '',
      topDivs.length > 0 ? `TOP DIVERGÊNCIAS:\n${topDivs.slice(0,5).map(d => `  - ${d.mlItemId}: ML=${d.pesoMl}g vs Real=${d.pesoLocal}g (${d.status})`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    await saveKnowledge('divergencias_estado_atual', content, 'learner_study', 0.95);
    log(`  ✓ Divergências: ${total} total (${pendente + reincidente} ativas, R$${impactoEstimado.toFixed(0)} em risco)`, 'success');
  } catch (e) {
    log(`  ✗ Erro ao estudar divergências: ${e.message}`, 'error');
  }
}

async function studyProdutos() {
  log('📦 Estudando catálogo de produtos...', 'study');
  try {
    const [total, vinculados, pendentes, ignorados, semPeso, comFicha, kits] = await Promise.all([
      prisma.produto.count(),
      prisma.produto.count({ where: { mlItemId: { not: null }, plataforma: { notIn: ['ML_PENDENTE','ML_IGNORADO'] } } }),
      prisma.produto.count({ where: { plataforma: 'ML_PENDENTE' } }),
      prisma.produto.count({ where: { plataforma: 'ML_IGNORADO' } }),
      prisma.produto.count({ where: { pesoGramas: 0, mlItemId: { not: null } } }),
      prisma.produto.count({ where: { OR: [{ ean: { not: null } }, { marca: { not: null } }, { modelo: { not: null } }] } }),
      prisma.produto.count({ where: { eKit: true } }),
    ]);

    const content = [
      `CATÁLOGO DE PRODUTOS — Atualizado em ${new Date().toLocaleString('pt-BR')}`,
      `Total no catálogo: ${total}`,
      `Vinculados ao ML: ${vinculados}`,
      `Não vinculados (pendentes de mapeamento): ${pendentes}`,
      `Ignorados: ${ignorados}`,
      `Sem peso cadastrado (risco de divergência): ${semPeso}`,
      `Com ficha técnica preenchida (EAN/marca/modelo): ${comFicha}`,
      `Kits (compostos de múltiplos produtos): ${kits}`,
      pendentes > 0 ? `⚠️ ${pendentes} anúncio(s) sem peso — aparecerão como divergência na próxima varredura` : '',
      semPeso > 0 ? `⚠️ ${semPeso} produto(s) vinculado(s) sem peso declarado — não serão auditados corretamente` : '',
    ].filter(Boolean).join('\n');

    await saveKnowledge('catalogo_produtos_estado', content, 'learner_study', 0.95);
    log(`  ✓ Catálogo: ${total} produtos (${vinculados} vinculados, ${pendentes} pendentes, ${semPeso} sem peso)`, 'success');
  } catch (e) {
    log(`  ✗ Erro ao estudar produtos: ${e.message}`, 'error');
  }
}

async function studyAvisosML() {
  log('🚨 Verificando avisos do Mercado Livre...', 'study');
  try {
    const [ativos, alto, resolvidos] = await Promise.all([
      prisma.avisoML.count({ where: { resolvido: false } }).catch(() => 0),
      prisma.avisoML.count({ where: { resolvido: false, severidade: 'ALTO' } }).catch(() => 0),
      prisma.avisoML.count({ where: { resolvido: true } }).catch(() => 0),
    ]);

    const recentes = await prisma.avisoML.findMany({
      where:   { resolvido: false },
      orderBy: { createdAt: 'desc' },
      take:    5,
      select:  { mlItemId: true, titulo: true, tipoAviso: true, mensagem: true },
    }).catch(() => []);

    const content = [
      `AVISOS DO ML — Atualizado em ${new Date().toLocaleString('pt-BR')}`,
      `Avisos ativos: ${ativos}`,
      `Severidade ALTO: ${alto}`,
      `Resolvidos: ${resolvidos}`,
      ativos > 0 ? `🚨 CRÍTICO: ${ativos} anúncio(s) com aviso do ML — podem estar PAUSADOS` : 'Nenhum aviso ativo ✅',
      recentes.length > 0 ? `Anúncios afetados:\n${recentes.map(a => `  - ${a.mlItemId}: ${a.tipoAviso}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    await saveKnowledge('avisos_ml_estado', content, 'learner_study', 0.95);
    log(`  ✓ Avisos ML: ${ativos} ativos (${alto} ALTO)`, ativos > 0 ? 'warn' : 'success');
  } catch (e) {
    log(`  ✗ Erro ao verificar avisos: ${e.message}`, 'error');
  }
}

async function studyAgendador() {
  log('⏱️ Verificando agendador...', 'study');
  try {
    const configs = await prisma.agendadorConfig.findMany({
      take: 5,
    }).catch(() => []);

    const ativo  = configs.find(c => c.ativo);
    const ultima = configs.reduce((best, c) => {
      if (!c.ultimaExecucao) return best;
      if (!best) return c;
      return new Date(c.ultimaExecucao) > new Date(best.ultimaExecucao) ? c : best;
    }, null);

    const content = [
      `AGENDADOR — Atualizado em ${new Date().toLocaleString('pt-BR')}`,
      ativo ? `Varredura automática: ATIVA (a cada ${ativo.intervalo}min)` : '⚠️ Nenhum agendador ativo — varredura apenas manual',
      ultima?.ultimaExecucao ? `Última varredura: ${new Date(ultima.ultimaExecucao).toLocaleString('pt-BR')}` : 'Última varredura: nunca executada',
      ativo?.proximaExecucao ? `Próxima varredura: ${new Date(ativo.proximaExecucao).toLocaleString('pt-BR')}` : '',
    ].filter(Boolean).join('\n');

    await saveKnowledge('agendador_estado', content, 'learner_study', 0.9);
    log(`  ✓ Agendador: ${ativo ? `ativo (${ativo.intervalo}min)` : 'inativo'}`, 'success');
  } catch (e) {
    log(`  ✗ Erro ao verificar agendador: ${e.message}`, 'error');
  }
}

async function studyUsagePatterns() {
  log('👥 Analisando padrões de uso...', 'study');
  try {
    const hoje   = new Date(); hoje.setHours(0,0,0,0);
    const agora  = new Date();
    const trinta = new Date(agora.getTime() - 30 * 60 * 1000);

    const [ativosSessao, totalSessoes, msgHoje, msgTotal, resumos] = await Promise.all([
      prisma.sessaoUsuario.count({ where: { ativo: true, entradaEm: { gte: trinta } } }).catch(() => 0),
      prisma.sessaoUsuario.count().catch(() => 0),
      prisma.chatMessage.count({ where: { createdAt: { gte: hoje } } }).catch(() => 0),
      prisma.chatMessage.count().catch(() => 0),
      prisma.resumoIA.count().catch(() => 0),
    ]);

    const content = [
      `PADRÕES DE USO — Atualizado em ${new Date().toLocaleString('pt-BR')}`,
      `Usuários online agora: ${ativosSessao}`,
      `Total de sessões históricas: ${totalSessoes}`,
      `Mensagens ao assistente hoje: ${msgHoje}`,
      `Total de mensagens histórico: ${msgTotal}`,
      `Resumos executivos gerados: ${resumos}`,
    ].join('\n');

    await saveKnowledge('padroes_uso_sistema', content, 'learner_study', 0.85);
    log(`  ✓ Padrões: ${ativosSessao} online, ${msgHoje} msgs hoje`, 'success');
  } catch (e) {
    log(`  ✗ Erro ao analisar padrões: ${e.message}`, 'error');
  }
}

async function analyzeRisks() {
  log('⚠️ Calculando riscos operacionais...', 'study');
  try {
    const [divPendentes, avisosAlto, semPeso, naoVinculados] = await Promise.all([
      prisma.divergencia.count({ where: { status: { in: ['PENDENTE','REINCIDENTE'] } } }),
      prisma.avisoML.count({ where: { resolvido: false, severidade: 'ALTO' } }).catch(() => 0),
      prisma.produto.count({ where: { pesoGramas: 0, mlItemId: { not: null }, plataforma: { notIn: ['ML_PENDENTE','ML_IGNORADO'] } } }),
      prisma.produto.count({ where: { plataforma: 'ML_PENDENTE' } }),
    ]);

    const riscoTotal    = divPendentes * 4.5 + avisosAlto * 15 + semPeso * 2;
    const nivelRisco    = riscoTotal > 100 ? 'CRÍTICO' : riscoTotal > 50 ? 'ALTO' : riscoTotal > 20 ? 'MÉDIO' : 'BAIXO';

    const content = [
      `ANÁLISE DE RISCOS — Atualizado em ${new Date().toLocaleString('pt-BR')}`,
      `Nível de risco atual: ${nivelRisco}`,
      `Score de risco: ${riscoTotal.toFixed(0)} pontos`,
      `Fatores de risco:`,
      `  - Divergências pendentes: ${divPendentes} (${divPendentes * 4.5}pts)`,
      `  - Avisos ML críticos: ${avisosAlto} (${avisosAlto * 15}pts)`,
      `  - Produtos sem peso: ${semPeso} (${semPeso * 2}pts)`,
      `  - Anúncios não vinculados: ${naoVinculados}`,
      nivelRisco === 'CRÍTICO' ? '🚨 Ação imediata necessária!' : '',
      nivelRisco === 'ALTO'    ? '⚠️ Atenção recomendada nos próximos dias.' : '',
    ].filter(Boolean).join('\n');

    await saveKnowledge('analise_riscos_atual', content, 'learner_analysis', 0.9);
    log(`  ✓ Riscos: ${nivelRisco} (score: ${riscoTotal.toFixed(0)})`, nivelRisco === 'CRÍTICO' || nivelRisco === 'ALTO' ? 'warn' : 'success');
  } catch (e) {
    log(`  ✗ Erro na análise de riscos: ${e.message}`, 'error');
  }
}

// ─── CONVERSA COM GEMINI ──────────────────────────────────────────────────────

async function chatWithGemini() {
  const ai = getGeminiClient();
  if (!ai) { log('Gemini não configurado — chat de insights ignorado', 'warn'); return; }

  geminiChatCount++;
  log(`🤖 Iniciando conversa com Gemini (#${geminiChatCount})...`, 'gemini');

  try {
    // Coleta estado atual
    const [divStats, prodCount, avisos, usage] = await Promise.all([
      prisma.divergencia.groupBy({ by: ['status'], _count: true }),
      prisma.produto.count(),
      prisma.avisoML.count({ where: { resolvido: false } }).catch(() => 0),
      prisma.chatMessage.count({ where: { createdAt: { gte: new Date(Date.now() - 24*60*60*1000) } } }).catch(() => 0),
    ]);

    const divMap = Object.fromEntries(divStats.map(s => [s.status, s._count]));
    const estado = `
Sistema IA Analyiz (${new Date().toLocaleString('pt-BR')}):
- Divergências pendentes: ${divMap['PENDENTE'] || 0}
- Reincidentes: ${divMap['REINCIDENTE'] || 0}
- Corrigidos: ${divMap['CORRIGIDO'] || 0}
- Produtos no catálogo: ${prodCount}
- Avisos ML ativos: ${avisos}
- Msgs usuários últimas 24h: ${usage}
    `.trim();

    const prompt = `Você é um sistema de IA especialista em e-commerce e logística, conversando consigo mesmo para aprender.

Estado atual do sistema:
${estado}

Como consultor autônomo, responda em JSON puro (sem markdown):
{
  "insight_curto": "alerta em UMA frase, máx 70 chars, sem HTML nem emoji",
  "insight_completo": "análise detalhada para o gestor, 2-3 parágrafos",
  "aprendizado": "o que você aprendeu com esses dados, 1 frase",
  "proxima_verificacao": "o que verificar na próxima análise, 1 frase",
  "sugestao_codigo": null
}
Seja específico com números. Máximo 200 chars no insight_completo.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.3, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const raw = (response.text || '').trim();
    const firstBrace = raw.indexOf('{');
    const lastBrace  = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON from Gemini');

    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));

    if (parsed.insight_curto) {
      await saveKnowledge('gemini_insight_curto', parsed.insight_curto, 'gemini_chat', 0.85);
      log(`  💡 Insight curto: "${parsed.insight_curto}"`, 'gemini');
    }
    if (parsed.insight_completo) {
      await saveKnowledge('gemini_insight_completo', parsed.insight_completo, 'gemini_chat', 0.85);
      log(`  📝 Insight completo salvo`, 'gemini');
    }
    if (parsed.aprendizado) {
      await saveKnowledge(`aprendizado_${Date.now()}`, parsed.aprendizado, 'gemini_learning', 0.75);
      log(`  🧠 Aprendizado: "${parsed.aprendizado}"`, 'gemini');
    }

    await logLearning('gemini_chat', estado, JSON.stringify(parsed));
    log(`  ✅ Conversa com Gemini #${geminiChatCount} concluída`, 'success');

  } catch (e) {
    log(`  ❌ Erro na conversa com Gemini: ${e.message}`, 'error');
    await logLearning('gemini_error', `Chat #${geminiChatCount} falhou`, e.message);
  }
}

/**
 * Retorna o insight mais recente gerado pelo Gemini (curto, para balão)
 */
export async function getLatestShortInsight() {
  try {
    const k = await prisma.iAKnowledge.findFirst({
      where:   { topic: 'gemini_insight_curto' },
      orderBy: { updatedAt: 'desc' },
    });
    return k?.content || null;
  } catch { return null; }
}

export async function getLatestFullInsight() {
  try {
    const k = await prisma.iAKnowledge.findFirst({
      where:   { topic: 'gemini_insight_completo' },
      orderBy: { updatedAt: 'desc' },
    });
    return k?.content || null;
  } catch { return null; }
}