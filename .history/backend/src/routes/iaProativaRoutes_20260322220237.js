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

// ── Helper: gera resumo curto (teaser para o balão) ───────────────────────────
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
        parts: [{ text: `Dados: ${dados}\n\nEscreva UMA frase curta (máx 65 chars) no estilo de notificação mobile, convidando o usuário a ver. Tom: direto, com número, sem formal.\nExemplos: "Achei 3 divergências ativas, quer resolver?" / "2 anúncios com aviso no ML, veja agora." / "Tudo certo! Nenhum problema encontrado."\nResponda APENAS a frase, sem aspas:` }],
      }],
    });

    const text = (response.text || '').trim().replace(/^["']|["']$/g, '');
    return text.substring(0, 70) || null;
  } catch { return null; }
}

// ── Helper: gera insight completo para o chat ─────────────────────────────────
async function gerarFullInsight(linhas, divs, avisos, uid) {
  if (!process.env.GEMINI_API_KEY) return linhas.join('<br>');
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const topDivs = divs.slice(0, 3).map(d =>
      `${d.mlItemId}: ML=${d.pesoMl}g vs real=${d.pesoLocal}g (${d.status})`
    ).join(', ');

    const contexto = [...linhas, topDivs ? `Exemplos: ${topDivs}` : ''].filter(Boolean).join(' | ');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        temperature: 0.3,
        maxOutputTokens: 300,
        systemInstruction: [
          'Você é a IA Analyiz, assistente de logística.',
          'Gere um alerta executivo CONCISO sobre os dados do sistema.',
          'Use HTML básico (<b>, <br>). Máximo 3 linhas.',
          'Comece com um emoji contextual.',
          'Seja específico com números.',
          'NÃO pergunte contexto. NÃO faça perguntas abertas. Apresente os dados e ofereça ajuda.',
          'Finalize com UMA pergunta direta: "Quer que eu resolva agora?"',
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
// POST /api/ia/proactive — Verifica se deve gerar nova notificação
// ═══════════════════════════════════════════════════════════════════════════════

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
      gerarFullInsight(linhas, divs, avisos, uid),
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
// POST /api/ia/proactive/seen — Marca notificação como vista
// ═══════════════════════════════════════════════════════════════════════════════

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
// POST /api/ia/proactive/exibida — Marca que foi exibida no balão
// ═══════════════════════════════════════════════════════════════════════════════

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

// ── Limpeza automática de notificações antigas (> 7 dias) ────────────────────
export async function limparNotificacoesAntigas() {
  const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.proativaNotificacao.deleteMany({
    where: { createdAt: { lt: limite } },
  }).catch(() => {});
}

export default router;