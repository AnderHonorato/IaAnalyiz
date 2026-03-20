import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';

const app = express();
const prisma = new PrismaClient();

// CORS habilitado para permitir requisições do Frontend separado
app.use(cors());
app.use(express.json());

// Rota para o Terminal em Tempo Real (SSE)
app.get('/api/bot/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addSseClient(res);

  runBot().catch(err => {
    res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Erro: ' + err.message })}\n\n`);
  });
});

// Busca as divergências salvas
app.get('/api/divergencias', async (req, res) => {
  const div = await prisma.divergencia.findMany({
    where: { resolvido: false },
    orderBy: { createdAt: 'desc' }
  });
  res.json(div);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API do Backend rodando em http://localhost:${PORT}`);
});