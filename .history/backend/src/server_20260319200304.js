import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';
// Importação ajustada para máxima compatibilidade com ES Modules
import pkg from '@google/genai';
const { GoogleGenAI } = pkg; 

import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || "chave_super_secreta_provisoria_do_ander";

// ... (Mantenha as rotas de auth, perfil e usuários que você já tem enviadas acima)

// ==========================================
// IA ANALYIZ (SOLUÇÃO DEFINITIVA DO TYPEERROR)
// ==========================================

app.post('/api/ia/chat', async (req, res) => {
  const { message, history = [], userRole } = req.body;
  
  try {
    if (userRole === 'BLOQUEADO') {
      return res.json({ reply: '🔒 **Acesso Restrito.** Perfil sob análise. Solicite acesso no menu.' });
    }

    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: '⚠️ Chave ausente.' });
    
    const divergencias = await prisma.divergencia.findMany({ where: { resolvido: false } });
    const produtos = await prisma.produto.findMany();

    const sysMsg = `Você é a IA Analyiz do ecossistema do Ander. Auditora de logística. Dados: ${produtos.length} produtos e ${divergencias.length} divergências.`;

    // Garante que a classe existe antes de instanciar
    if (!GoogleGenAI) {
      throw new Error("Não foi possível carregar a classe GoogleGenAI do pacote.");
    }

    const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    // Usando gemini-1.5-flash conforme sua versão estável do ContentCreatorBot
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

    const chatHistory = history.map(h => ({
      role: h.role === 'ia' ? 'model' : 'user',
      parts: [{ text: h.content }],
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
    });

    const result = await chat.sendMessage(`INSTRUÇÃO DO CRIADOR: ${sysMsg}\n\nCLIENTE: ${message}`);
    
    res.json({ reply: result.response.text().trim() });

  } catch (error) {
    console.error("ERRO IA:", error);
    res.status(500).json({ reply: '⚠️ Falha no Kernel Neural: ' + error.message });
  }
});

// ... (Mantenha o restante do código de produtos e a inicialização da porta 3000)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`🚀 API rodando na porta ${PORT}`); });