/**
 * backend/src/routes/iaProativaRoutes.js
 * 
 * Sistema de Notificações Proativas da IA
 * 
 * Responsabilidades:
 * - Gerar alertas inteligentes baseados no estado do sistema
 * - Detectar mudanças de contexto (divergências, avisos ML, usuários pendentes)
 * - Implementar cooldown para evitar notificação em excesso
 * - Normalizar notificações em dois níveis: resumo curto + insight completo
 * - Persistir notificações e rastrear visualização
 * - Limpeza automática de dados antigos
 * 
 * Arquitetura de Guarda:
 *   1. Valida usuário (não BLOQUEADO, tem API key)
 *   2. Verifica cooldown de 6 horas
 *   3. Limita máx 2 notificações não vistas (fila)
 *   4. Compara contexto atual com última notif (evita repetição)
 *   5. Coleta dados e gera notif ia faltarem dados relevantes
 *   6. Persiste com hash para deduplicar
 * 
 * Contexto de Notificação:
 * - Divergências de peso/frete ativas
 * - Itens reincidentes (voltaram a divergir)
 * - Avisos do Mercado Livre não resolvidos
 * - Usuários aguardando aprovação (OWNER/ADMIN)
 * 
 * Fluxo de Visão:
 *   Front → POST /api/ia/proactive (verifica se há notif)
 *   ├→ Dentro cooldown: retorna cache (se houver não vista)
 *   ├→ Fora cooldown + dados: gera nova notif + persiste
 *   └→ Front marca como vistaNoChat e exibidaBotao
 * 
 * Resets:
 * - Marcar como "vista" no chat
 * - Marcar como "exibida" no balão (tooltip)
 * - Limpeza de 7 dias no banco
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 */

// backend/src/routes/iaProativaRoutes.js
// ═══════════════════════════════════════════════════════════════════════════════
// Sistema de Notificações Proativas da IA
// Regras:
//  - Cooldown de 6h entre verificações por usuário
//  - Máx 2 notificações não vistas na fila — se já tem 2, ignora até próximo período
//  - Persiste no banco (ProativaNotificacao)
//  - resumoBotao = texto curto para o balão (teaser)
//  - fullInsight = texto completo para o chat
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { hashContexto } from '../iaService.js';

const prisma  = new PrismaClient();
const router  = express.Router();

const COOLDOWN_MS     = 6 * 60 * 60 * 1000;  // 6 horas
const MAX_NAO_VISTAS  = 2;                     // máx notificações sem ver

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS de Renderização — Gera Notificações com Gemini
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper: gerarResumoBotao(linhas)
 * 
 * Gera um resumo ULTRAccurto (máx 70 chars) para exibir no balão (tooltip)
 * - Menciona tipo e quantidade do problema
 * - Convida a agir com linguagem simples
 * - Inclui emoji no início para énfase
 * - Tom direto, sem formalidade
 * 
 * Exemplos:
 *   "⚠️ 3 divergências de peso ativas, quer corrigir?"
 *   "🔔 1 usuário aguardando aprovação de acesso."
 *   "🚨 2 anúncios com aviso do ML, veja agora."
 * 
 * @param {Array<string>} linhas - Contexto em formato de linhas
 * @returns {Promise<string|null>} - Texto curto ou null se erro/vazio
 */──────
async function gerarResumoBotao(linhas) {
  if (!process.env.GEMINI_API_KEY || !linhas.length) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const dados = linhas.join(' | ').substring(0, 250);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        temperature: 0.2,
        maxOutputTokens: 40,
        thinkingConfig: { thinkingBudget: 0 },
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Dados do sistema do usuário: ${dados}\n\nEscreva UMA notificação curta (máx 65 chars) que:\n- Mencione o tipo e quantidade do problema (ex: "3 divergências de peso")\n- Convide a agir (ex: "quer resolver?")\n- Tom direto, sem formalidade, com emoji no início\nExemplos corretos:\n"⚠️ 3 divergências de peso ativas, quer corrigir?"\n"🔔 1 usuário aguardando aprovação de acesso."\n"🚨 2 anúncios com aviso do ML, veja agora."\nResponda APENAS a frase, sem aspas:` }],
      }],
    });

    const text = (response.text || '').trim().replace(/^["']|["']$/g, '');
    return text.substring(0, 70) || null;
  } catch { return null; }
}

/**
 * Helper: gerarFullInsight(linhas, divs, avisos, uid, pendentesAprovacao)
 * 
 * Gera um insight EXECUTIVO completo (máx 450 tokens) com:
 * - HTML formatado (<b>, <br>)
 * - 4 linhas máximo
 * - Emoji de gravidade: 🚨 crítico, ⚠️ atenção, 🔔 informativo
 * - Números EXATOS dos problemas
 * - Oferta de ação concreta (IA EXECUTA pelo chat, não apenas informa)
 * 
 * Ações oferecidas:
 *   - Usuário aguardando: "Posso <b>aprovar o acesso agora</b>"
 *   - Divergências: "Posso <b>enviar tudo para correção agora</b>"
 *   - Avisos ML: "Quer que eu verifique os detalhes?"
 * 
 * @param {Array<string>} linhas - Contexto em linhas
 * @param {Array} divs - Divergências encontradas
 * @param {number} avisos - Quantidade de avisos ML
 * @param {number} uid - UserID
 * @param {number} pendentesAprovacao - Usuários pendentes (OWNER/ADMIN)
 * @returns {Promise<string>} - HTML formatado ou fallback
 */───────────────
async function gerarFullInsight(linhas, divs, avisos, uid, pendentesAprovacao = 0) {
  if (!process.env.GEMINI_API_KEY) return linhas.join('<br>');
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const topDivs = divs.slice(0, 3).map(d =>
      `${d.mlItemId}: ML=${d.pesoMl}g vs real=${d.pesoLocal}g (${d.status})`
    ).join(', ');

    const pendentesCtx = pendentesAprovacao > 0
      ? `${pendentesAprovacao} usuário(s) aguardando aprovação — você pode aprovar diretamente pelo chat`
      : '';
    const contexto = [...linhas, topDivs ? `Exemplos de divergências: ${topDivs}` : '', pendentesCtx].filter(Boolean).join(' | ');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        temperature: 0.3,
        maxOutputTokens: 450,
        systemInstruction: [
          'Você é a IA Analyiz, assistente agêntico de logística e e-commerce.',
          'Gere um alerta executivo RICO E ACIONÁVEL sobre os dados do sistema.',
          'Use HTML básico (<b>, <br>). Máximo 4 linhas.',
          'Comece com emoji de gravidade: 🚨 crítico, ⚠️ atenção, 🔔 informativo.',
          'Cite números EXATOS.',
          'SEMPRE termine com uma oferta de ação concreta dizendo que você EXECUTA pelo chat:',
          'Para usuário aguardando: termine com "Posso <b>aprovar o acesso agora</b> — é só dizer "aprova."',
          'Para divergências: termine com "Posso <b>enviar tudo para correção agora</b> — é só dizer "corrige."',
          'Para avisos ML: termine com "Quer que eu verifique os detalhes?"',
          'Use linguagem direta e de ação — não use "você pode ir até a tela X", você é quem executa.',
        ].join(' '),
      },
      contents: [{ role: 'user', parts: [{ text: `Dados: ${contexto}` }] }],
    });

    return (response.text || '').trim()
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')
      .trim() || linhas.join('<br>');
  } catch { return linhas.join('<br>'); }
}


// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/ia/proactive — Verifica e Gera Notificação
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ia/proactive
 * 
 * Endpoint principal: verifica se há notificação para exibir
 * Implementa os 4 Guardas de segurança antes de gerar nova notif
 * 
 * Body:
 *   - userId (obrigatório): ID do usuário
 *   - userRole: 'USER', 'ADMIN', 'OWNER', 'BLOQUEADO'
 * 
 * Lógica dos Guardas:
 *   1. Valida usuário (não BLOQUEADO, existe API key)
 *   2. Verifica cooldown de 6 horas
 *   3. Limita fila: máx 2 notificadas não vistas
 *   4. Dedup por hash: se estado não mudou, não repete
 * 
 * Dados coletados:
 *   - Divergências: PENDENTE ou REINCIDENTE
 *   - Avisos ML: resolvido=false
 *   - Usuários pendentes: solicitouDesbloqueio=true (OWNER/ADMIN)
 * 
 * Retorna:
 *   { 
 *     insight: string (resumo curto para balão),
 *     fullInsight: string (HTML completo para chat),
 *     notifId: number (se nova),
 *     hasRelevantData: boolean,
 *     fromCache: boolean (true se retornou do cooldown)
 *   }
 */

router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole } = req.body;

  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) {
      return res.json({ insight: null, hasRelevantData: false });
    }

    const uid          = parseInt(userId);
    const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

    // ── GUARDA 1: Verifica cooldown de 6h ─────────────────────────────────
    const ultimaNotif = await prisma.proativaNotificacao.findFirst({
      where: { usuarioId: uid },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    if (ultimaNotif) {
      const elapsed = Date.now() - new Date(ultimaNotif.createdAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        // Dentro do cooldown — apenas retorna notificação pendente se houver
        const pendente = await prisma.proativaNotificacao.findFirst({
          where: { usuarioId: uid, vistaNoChat: false },
          orderBy: { createdAt: 'desc' },
        }).catch(() => null);

        if (pendente) {
          return res.json({
            insight:         pendente.resumoBotao,
            fullInsight:     pendente.fullInsight,
            notifId:         pendente.id,
            hasRelevantData: true,
            fromCache:       true,
          });
        }
        return res.json({ insight: null, hasRelevantData: false });
      }
    }

    // ── GUARDA 2: Máx 2 notificações não vistas ────────────────────────────
    const naoVistas = await prisma.proativaNotificacao.count({
      where: { usuarioId: uid, vistaNoChat: false },
    }).catch(() => 0);

    if (naoVistas >= MAX_NAO_VISTAS) {
      // Já tem 2 esperando — não gera mais, silêncio até serem vistas
      return res.json({ insight: null, hasRelevantData: false, silencioso: true });
    }

    // ── Coleta dados reais do banco ─────────────────────────────────────────
    const divs = await prisma.divergencia.findMany({
      where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const avisos = await prisma.avisoML.count({
      where: { usuarioId: uid, resolvido: false },
    }).catch(() => 0);

    let pendentesAprovacao = 0;
    if (isPrivileged) {
      pendentesAprovacao = await prisma.usuario.count({
        where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
      }).catch(() => 0);
    }

    const temDados = divs.length > 0 || avisos > 0 || pendentesAprovacao > 0;
    if (!temDados) {
      return res.json({ insight: null, hasRelevantData: false });
    }

    // ── GUARDA 3: Verifica se o estado mudou desde a última notificação ─────
    const contextoAtual = {
      divsPendentes:   divs.filter(d => d.status === 'PENDENTE').length,
      divsReincid:     divs.filter(d => d.status === 'REINCIDENTE').length,
      avisos,
      pendentesAprov:  pendentesAprovacao,
    };
    const novoHash = hashContexto(contextoAtual);

    // Se o hash é igual ao da última notif → estado não mudou → não repete
    if (ultimaNotif && ultimaNotif.contextoHash === novoHash) {
      // Retorna a existente (se não foi vista)
      const existente = await prisma.proativaNotificacao.findFirst({
        where: { usuarioId: uid, vistaNoChat: false },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null);

      if (existente) {
        return res.json({
          insight:         existente.resumoBotao,
          fullInsight:     existente.fullInsight,
          notifId:         existente.id,
          hasRelevantData: true,
          fromCache:       true,
        });
      }
      return res.json({ insight: null, hasRelevantData: false });
    }

    // ── Monta linhas de contexto ────────────────────────────────────────────
    const linhas = [];

    if (divs.length > 0) {
      const reincid   = divs.filter(d => d.status === 'REINCIDENTE').length;
      const pendEnvio = await prisma.divergencia.count({
        where: { usuarioId: uid, status: 'PENDENTE_ENVIO' },
      }).catch(() => 0);
      const maxErro = divs.reduce((m, d) => Math.max(m, Math.abs(d.pesoMl - d.pesoLocal)), 0);

      linhas.push(`${divs.length} divergência${divs.length > 1 ? 's' : ''} de peso/frete ativa${divs.length > 1 ? 's' : ''}`);
      if (reincid > 0) linhas.push(`${reincid} reincidente${reincid > 1 ? 's' : ''} (voltaram a divergir)`);
      if (pendEnvio > 0) linhas.push(`${pendEnvio} na fila de correção via API`);
      if (maxErro > 0) linhas.push(`maior erro: ${maxErro}g`);
    }
    if (avisos > 0) linhas.push(`${avisos} aviso${avisos > 1 ? 's' : ''} ativo${avisos > 1 ? 's' : ''} do Mercado Livre`);
    if (pendentesAprovacao > 0) linhas.push(`${pendentesAprovacao} usuário${pendentesAprovacao > 1 ? 's' : ''} aguardando aprovação`);

    // ── Gera textos com Gemini ──────────────────────────────────────────────
    const [resumoBotao, fullInsight] = await Promise.all([
      gerarResumoBotao(linhas),
      gerarFullInsight(linhas, divs, avisos, uid, pendentesAprovacao),
    ]);

    if (!resumoBotao || resumoBotao.length < 10) {
      return res.json({ insight: null, hasRelevantData: false });
    }

    // ── Persiste no banco ───────────────────────────────────────────────────
    const notif = await prisma.proativaNotificacao.create({
      data: {
        usuarioId:   uid,
        resumoBotao: resumoBotao.substring(0, 70),
        fullInsight: fullInsight || linhas.join('<br>'),
        contextoHash: novoHash,
        exibidaBotao: false,
        vistaNoChat:  false,
      },
    });

    return res.json({
      insight:         notif.resumoBotao,
      fullInsight:     notif.fullInsight,
      notifId:         notif.id,
      hasRelevantData: true,
      fromCache:       false,
    });

  } catch (e) {
    console.error('[Proactive]', e);
    return res.json({ insight: null, hasRelevantData: false });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/ia/proactive/seen — Marca Notificação como Vista
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ia/proactive/seen
 * 
 * Marca uma (ou todas) notificação(oes) como vista no chat
 * Remove da fila de "não vistas", permitindo gerar nova notif no ciclo
 * 
 * Body:
 *   - userId (obrigatório): ID do usuário
 *   - notifId (opcional): ID específula notificão. Se omitido, marca TODAS
 * 
 * Lógica:
 *   - Se notifId: marca apenas essa notif como vistaNoChat=true
 *   - Se sem notifId: marca todas as notificadas do usuário
 *   - Registra timestamp em vistaEm
 * 
 * Retorna: { ok: true } ou { ok: false }
 */

router.post('/api/ia/proactive/seen', async (req, res) => {
  const { userId, notifId } = req.body;
  if (!userId) return res.json({ ok: false });
  try {
    const uid = parseInt(userId);
    if (notifId) {
      await prisma.proativaNotificacao.update({
        where: { id: parseInt(notifId), usuarioId: uid },
        data:  { vistaNoChat: true, vistaEm: new Date() },
      }).catch(() => {});
    } else {
      // Marca TODAS não vistas deste usuário
      await prisma.proativaNotificacao.updateMany({
        where: { usuarioId: uid, vistaNoChat: false },
        data:  { vistaNoChat: true, vistaEm: new Date() },
      }).catch(() => {});
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: false });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/ia/proactive/exibida — Marca Notificação como Exibida no Balão
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ia/proactive/exibida
 * 
 * Marca que uma notif foi exibida no balão (tooltip) do frontend
 * Rastreamento para analytics: que notif foram realmente mostradas ao usuário
 * 
 * Body:
 *   - userId (obrigatório): ID do usuário
 *   - notifId (obrigatório): ID da notificação
 * 
 * Efeito:
 *   - exibidaBotao: true
 * 
 * Retorna: { ok: true } ou { ok: false }
 */

router.post('/api/ia/proactive/exibida', async (req, res) => {
  const { userId, notifId } = req.body;
  if (!userId || !notifId) return res.json({ ok: false });
  try {
    await prisma.proativaNotificacao.update({
      where: { id: parseInt(notifId), usuarioId: parseInt(userId) },
      data:  { exibidaBotao: true },
    }).catch(() => {});
    return res.json({ ok: true });
  } catch { return res.json({ ok: false }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAINTENANCE — Limpeza Automática
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * limparNotificacoesAntigas()
 * 
 * Função de limpeza executada periodicamente (vide server.js)
 * Remove notificações com mais de 7 dias
 * 
 * Ligado em: setInterval do server.js (24h)
 * 
 * Efeito:
 *   - DELETE FROM ProativaNotificacao WHERE createdAt < (agora - 7 dias)
 * 
 * Ex: Uma notif criada 8 dias atrás será removida na próxima execução
 */────────
export async function limparNotificacoesAntigas() {
  const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.proativaNotificacao.deleteMany({
    where: { createdAt: { lt: limite } },
  }).catch(() => {});
}

export default router;