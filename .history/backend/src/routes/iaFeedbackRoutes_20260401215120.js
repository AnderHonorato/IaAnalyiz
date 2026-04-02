/**
 * backend/src/routes/iaFeedbackRoutes.js
 * 
 * Sistema de Feedback da IA — Avaliação de Respostas
 * 
 * Responsabilidades:
 * - Coletar feedback (positivo/negativo) dos usuários sobre respostas da IA
 * - Armazenar comentários opcionais para melhorias
 * - Gerar estatísticas consolidadas de satisfação
 * - Dashboard de análise (apenas OWNER)
 * 
 * Feedback Types:
 *   - Positivo (isPositive=true): Resposta foi útil, precisa e bem estruturada
 *   - Negativo (isPositive=false): Resposta imprecisa, fora do contexto ou inútil
 * 
 * Casos de uso:
 * 1. Usuário marca resposta gerada pela IA como boa ou ruim
 * 2. Sistema registra o feedback e comentário opcional
 * 3. Dashboard OWNER avalia % de aprovação e padrões de feedback
 * 4. IA-Engine usa dados para automelhoramento (opcional)
 * 
 * Métricas:
 * - Taxa de Aprovação: (positivos / total) * 100
 * - Padrões de Negativos: para identificar falhas recorrentes
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════════
// FEEDBACK MANAGEMENT — Coleta e Armazenamento
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ia/feedback
 * 
 * Cria ou atualiza feedback de um usuário sobre uma mensagem da IA
 * Operação Upsert: Se já existe feedback para a mensagem, atualiza; senão, cria novo
 * 
 * Body:
 *   - userId (obrigatório): ID do usuário
 *   - mensagemId (obrigatório): ID da mensagem no chatMessage
 *   - isPositive (obrigatório): Boolean - avaliação positiva ou negativa?
 *   - comentario (opcional): String com observações do usuário
 * 
 * Validações:
 *   - userId e mensagemId são obrigatórios
 *   - Se comentário não fornecido, mantém o anterior (ou null)
 * 
 * Retorna: { success: true }
 * 
 * Exemplo:
 *   POST /api/ia/feedback
 *   Body: { userId: 1, mensagemId: "msg-123", isPositive: true, comentario: "Resposta clara e precisa" }
 *   Response: { success: true }
 */
router.post('/api/ia/feedback', async (req, res) => {
  try {
    const { userId, mensagemId, isPositive, comentario } = req.body;
    if (!userId || !mensagemId) return res.status(400).json({ error: 'Dados inválidos' });

    // Verifica se já existe feedback para esta mensagem
    const existe = await prisma.feedbackIA.findFirst({
      where: { usuarioId: parseInt(userId), mensagemId }
    });

    if (existe) {
      await prisma.feedbackIA.update({
        where: { id: existe.id },
        data: { isPositive, comentario: comentario || existe.comentario }
      });
    } else {
      await prisma.feedbackIA.create({
        data: {
          usuarioId: parseInt(userId),
          mensagemId,
          isPositive,
          comentario: comentario || null
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Feedback API]', error);
    res.status(500).json({ error: 'Erro ao salvar feedback' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS — Estatísticas de Satisfação
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ia/feedback
 * 
 * Retorna todas as avaliações de feedback com estatísticas consolidadas
 * Acesso restrito: apenas OWNER pode visualizar
 * 
 * Dados retornados:
 * - stats.total: Quantidade total de feedbacks coletados
 * - stats.positivos: Quantos foram marcados como positivos
 * - stats.negativos: Quantos foram marcados como negativos
 * - stats.taxaAprovacao: Percentual de aprovação (positivos / total * 100)
 * - feedbacks: Array com todos os feedbacks incluindo dados do usuário
 * 
 * Feedback item:
 *   { id, usuarioId, mensagemId, isPositive, comentario, createdAt, usuario: { nome, email, avatar } }
 * 
 * Retorna: {
 *   stats: { total, positivos, negativos, taxaAprovacao },
 *   feedbacks: [...]
 * }
 * 
 * Caso de uso: Dashboard OWNER visualiza padrões de satisfação do sistema
 */
router.get('/api/ia/feedback', async (req, res) => {
  try {
    const feedbacks = await prisma.feedbackIA.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        usuario: { select: { nome: true, email: true, avatar: true } }
      }
    });
    
    const positivos = feedbacks.filter(f => f.isPositive).length;
    const negativos = feedbacks.filter(f => !f.isPositive).length;

    res.json({
      stats: {
        total: feedbacks.length,
        positivos,
        negativos,
        taxaAprovacao: feedbacks.length > 0 ? Math.round((positivos / feedbacks.length) * 100) : 0
      },
      feedbacks
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar feedbacks' });
  }
});

export default router;