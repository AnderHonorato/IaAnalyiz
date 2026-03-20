import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Rota SSE para o Terminal
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

app.get('/api/divergencias', async (req, res) => {
  const div = await prisma.divergencia.findMany({ where: { resolvido: false }, orderBy: { createdAt: 'desc' } });
  res.json(div);
});

// ==========================================
// NOVAS ROTAS: CADASTRO DE PRODUTOS E KITS
// ==========================================

// 1. Listar todos os produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({
      include: { itensDoKit: { include: { produto: true } } },
      orderBy: { id: 'desc' }
    });
    res.json(produtos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Criar um novo produto ou Kit (Pai)
app.post('/api/produtos', async (req, res) => {
  try {
    const { sku, nome, preco, pesoGramas, mlItemId, eKit } = req.body;
    const produto = await prisma.produto.create({
      data: {
        sku, nome, mlItemId, eKit,
        preco: parseFloat(preco),
        pesoGramas: parseInt(pesoGramas, 10),
      }
    });
    res.status(201).json(produto);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar produto. Verifique se o SKU já existe.' });
  }
});

// 3. Adicionar itens dentro de um Kit
app.post('/api/kits', async (req, res) => {
  try {
    const { kitId, produtoId, quantidade } = req.body;
    const kitItem = await prisma.kitItem.create({
      data: {
        kitId: parseInt(kitId, 10),
        produtoId: parseInt(produtoId, 10),
        quantidade: parseInt(quantidade, 10)
      }
    });
    res.status(201).json(kitItem);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao vincular item ao kit.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API do Backend rodando em http://localhost:${PORT}`);
});