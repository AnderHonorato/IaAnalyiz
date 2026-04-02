import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Criar ou atualizar feedback de uma mensagem
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

// Listar feedbacks (Apenas para dashboard OWNER)
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