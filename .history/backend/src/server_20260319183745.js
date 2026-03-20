import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// ==========================================
// ROTA SSE: TERMINAL DO BOT
// ==========================================
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
// ROTA DA IA ANALYIZ COM MEMÓRIA (GEMINI 2.5 FLASH)
// ==========================================
app.post('/api/ia/chat', async (req, res) => {
  // Agora recebemos a mensagem atual e todo o histórico anterior
  const { message, history = [] } = req.body;

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ reply: '⚠️ Chave da API do Gemini ausente no arquivo .env.' });
    }

    // Puxa dados reais do banco
    const divergencias = await prisma.divergencia.findMany({ where: { resolvido: false } });
    const produtos = await prisma.produto.findMany();

    const detalhesDivergencias = divergencias.length > 0 
      ? divergencias.map(d => `- ID ML: ${d.mlItemId} | Motivo: "${d.motivo}" | Link: ${d.link}`).join('\n')
      : "Scan limpo. Nenhuma divergência no momento.";

    const systemInstruction = `
      Você é a "IA Analyiz", uma inteligência artificial corporativa de alto nível, especialista em e-commerce e logística.
      Você trabalha exclusivamente para o Master Admin "Ander".
      Você NÃO é uma IA genérica. Você tem acesso ao banco de dados interno.
      
      TOM E PERSONALIDADE:
      - Profissional, analítica e ligeiramente técnica.
      - Fale na primeira pessoa ("Eu analisei", "Eu percebi").
      - Use formatação Markdown para destacar termos (**SKU**, **Pesos**). NUNCA use duplo asterisco colado.
      
      DADOS DO BANCO (TEMPO REAL):
      - Produtos na base: ${produtos.length}
      - Alertas pendentes: ${divergencias.length}
      
      LISTA DE DIVERGÊNCIAS ATIVAS:
      ${detalhesDivergencias}
      
      REGRAS:
      1. Use o histórico da conversa para entender o contexto.
      2. Responda diretamente e evite textos muito longos.
      3. Seja assertiva usando os dados acima.
    `;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Mapeamento correto do histórico para o Gemini (ia -> model)
    const historyFormatted = history.map(h => ({
      role: h.role === 'ia' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    console.log(`[IA Analyiz] Processando prompt de Ander. Histórico: ${historyFormatted.length} mensagens.`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.4, 
        maxOutputTokens: 1500,
      },
      contents: [
        ...historyFormatted,
        { role: 'user', parts: [{ text: message }] }
      ]
    });

    const respostaIA = response.text?.trim();

    if (!respostaIA) throw new Error('Retorno vazio do Gemini');

    res.json({ reply: respostaIA });

  } catch (error) {
    console.error("[IA Analyiz] ❌ Erro:", error);
    res.status(500).json({ reply: '⚠️ Erro Crítico: Falha na comunicação com o Google Gemini.' });
  }
});

// ==========================================
// ROTAS DE CADASTRO DE PRODUTOS E KITS
// ==========================================
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
    res.status(400).json({ error: 'Erro ao criar produto.' });
  }
});

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