import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Carrega as variáveis de ambiente (onde estará sua GEMINI_API_KEY)
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
// ROTA DA IA ANALYIZ (GEMINI 2.5 FLASH)
// ==========================================
app.post('/api/ia/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ reply: '⚠️ Chave da API do Gemini ausente no arquivo .env.' });
    }

    // 1. Extrai o contexto em tempo real do banco de dados Prisma
    const divergencias = await prisma.divergencia.findMany({ where: { resolvido: false } });
    const produtos = await prisma.produto.findMany();

    // 2. Prepara a lista de divergências para a IA ler e analisar
    const detalhesDivergencias = divergencias.length > 0 
      ? divergencias.map(d => `- ID ML: ${d.mlItemId} | Motivo: "${d.motivo}" | Link: ${d.link}`).join('\n')
      : "Scan limpo. Nenhuma divergência no momento.";

    // 3. O "Cérebro" da IA Analyiz
    const systemInstruction = `
      Você é a "IA Analyiz", uma inteligência artificial corporativa de alto nível, especialista em logística e integração com o Mercado Livre.
      Você trabalha exclusivamente para o Master Admin "Ander".
      
      Sua missão é ajudar a auditar anúncios, identificar divergências de peso (que causam prejuízos de frete) e analisar dados do banco.
      
      TOM E PERSONALIDADE:
      - Profissional, analítica, direta e eficiente.
      - Fale na primeira pessoa ("Eu analisei", "Eu encontrei").
      - Use formatação Markdown para destacar termos importantes (como **SKU**, **Pesos** e **ID ML**). NUNCA use markdown com dois asteriscos duplos colados.
      
      DADOS ATUAIS DO SISTEMA EM TEMPO REAL:
      - Produtos monitorados na base interna: ${produtos.length}
      - Alertas de divergência pendentes na tela: ${divergencias.length}
      
      LISTA DE DIVERGÊNCIAS ATIVAS:
      ${detalhesDivergencias}
      
      REGRAS ABSOLUTAS:
      1. NUNCA invente dados. Se o usuário perguntar algo que não está na "Lista de Divergências Ativas", diga que não há registros sobre isso.
      2. Se houver divergências, sempre recomende ao Ander clicar no link "Visualizar" no painel ou acesse o link oficial para corrigir as dimensões de envio.
      3. Seja breve e direta (máximo de 3 parágrafos).
    `;

    // 4. Inicializa o cliente do Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 5. Formata o histórico da conversa para manter o contexto
    const historyFormatted = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    }));

    // 6. Comunicação com a API do Google
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3, // Temperatura baixa para respostas mais lógicas e exatas
        maxOutputTokens: 1000,
      },
      contents: [
        ...historyFormatted,
        { role: 'user', parts: [{ text: message }] }
      ]
    });

    const respostaIA = response.text?.trim();

    if (!respostaIA) {
        throw new Error('Retorno vazio do Gemini');
    }

    console.log(`[IA Analyiz] Resposta gerada com sucesso.`);
    res.json({ reply: respostaIA });

  } catch (error) {
    console.error("[IA Analyiz] ❌ Erro Crítico:", error);
    res.status(500).json({ reply: '⚠️ Erro Crítico de Kernel: Falha na comunicação com o Google Gemini. Verifique o console.' });
  }
});

// ==========================================
// ROTAS ANTIGAS: CADASTRO DE PRODUTOS E KITS
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