import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Configurações de limite para suportar o tráfego de fotos de perfil em Base64
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || "chave_super_secreta_provisoria_do_ander";

// ==========================================
// ROTAS DE AUTENTICAÇÃO E PERFIL
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    const userExists = await prisma.usuario.findUnique({ where: { email } });
    if (userExists) return res.status(400).json({ error: 'E-mail já cadastrado.' });
    
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString();
    
    const novoUser = await prisma.usuario.create({ 
      data: { nome, email, senha: senhaHash, codigoVerificacao, role: 'BLOQUEADO' } 
    });
    
    console.log(`✉️ E-mail de Verificação para ${email}: CÓDIGO [${codigoVerificacao}]`);
    res.status(201).json({ message: 'Usuário criado. Verifique seu e-mail.', userId: novoUser.id });
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao registrar usuário.' }); 
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.codigoVerificacao !== codigo) return res.status(400).json({ error: 'Código inválido.' });
    
    await prisma.usuario.update({ 
      where: { email }, 
      data: { verificado: true, codigoVerificacao: null } 
    });
    
    res.json({ message: 'E-mail verificado com sucesso!' });
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao verificar código.' }); 
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!user.verificado) return res.status(403).json({ error: 'E-mail não verificado.' });
    
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(400).json({ error: 'Senha incorreta.' });
    
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        nome: user.nome, 
        email: user.email, 
        avatar: user.avatar, 
        role: user.role, 
        solicitouDesbloqueio: user.solicitouDesbloqueio 
      } 
    });
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao fazer login.' }); 
  }
});

app.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, nome, avatar } = req.body;
    const updatedUser = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: { nome, avatar }
    });
    
    res.json({ 
      message: 'Perfil atualizado com sucesso!', 
      user: { 
        id: updatedUser.id, 
        nome: updatedUser.nome, 
        email: updatedUser.email, 
        avatar: updatedUser.avatar, 
        role: updatedUser.role, 
        solicitouDesbloqueio: updatedUser.solicitouDesbloqueio 
      } 
    });
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao atualizar perfil.' }); 
  }
});

// ==========================================
// GESTÃO DE USUÁRIOS (ROLES E DESBLOQUEIOS)
// ==========================================

app.post('/api/usuarios/request-unblock', async (req, res) => {
  try {
    const { id } = req.body;
    await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: { solicitouDesbloqueio: true }
    });
    res.json({ message: 'Solicitação enviada com sucesso.', solicitouDesbloqueio: true });
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao solicitar desbloqueio.' }); 
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(usuarios);
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao buscar usuários.' }); 
  }
});

app.put('/api/usuarios/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const updatedUser = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: { role, solicitouDesbloqueio: false }
    });
    res.json(updatedUser);
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao atualizar cargo.' }); 
  }
});

app.get('/api/usuarios/pendentes', async (req, res) => {
  try {
    const count = await prisma.usuario.count({
      where: { role: 'BLOQUEADO', solicitouDesbloqueio: true }
    });
    res.json({ count });
  } catch (error) { 
    res.status(500).json({ error: 'Erro ao buscar pendentes.' }); 
  }
});

// ==========================================
// BOT E DADOS LOGÍSTICOS
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
  try {
    const div = await prisma.divergencia.findMany({ where: { resolvido: false }, orderBy: { createdAt: 'desc' } });
    res.json(div);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar divergências.' });
  }
});

// ==========================================
// IA ANALYIZ BLINDADA (COM LÓGICA DE ROLES)
// ==========================================

app.post('/api/ia/chat', async (req, res) => {
  const { message, history = [], userRole } = req.body;
  
  try {
    // 1. Verificação de Bloqueio (IA informa que o usuário está restrito)
    if (userRole === 'BLOQUEADO') {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simula "pensando"
      return res.json({ 
        reply: '🔒 **Acesso Restrito.** Atualmente seu perfil está sob análise do Criador. Por favor, utilize o botão **"Solicitar Acesso"** no menu superior para que eu possa liberar minhas funções de auditoria logística para você.' 
      });
    }

    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: '⚠️ Chave da API do Gemini ausente.' });
    
    // 2. Coleta de dados reais para alimentar o contexto da IA
    const divergencias = await prisma.divergencia.findMany({ where: { resolvido: false } });
    const produtos = await prisma.produto.findMany();

    const detalhesDivergencias = divergencias.length > 0 
      ? divergencias.map(d => `- [${d.plataforma}] ID: ${d.mlItemId} | Motivo: "${d.motivo}" | Link: ${d.link}`).join('\n')
      : "Scan limpo. Nenhuma divergência encontrada.";

    const systemInstruction = `
      Você é a "IA Analyiz", inteligência artificial corporativa de alto nível para e-commerce.
      Você trabalha para o Criador "Ander" e seus parceiros empresários.
      Você está diretamente conectada ao banco de dados PostgreSQL.
      
      CONTEXTO ATUAL:
      - Total de Produtos Registrados: ${produtos.length}
      - Total de Divergências de Frete Ativas: ${divergencias.length}
      
      DIVERGÊNCIAS DETALHADAS:
      ${detalhesDivergencias}
      
      REGRAS:
      - Seja profissional, direta e analítica.
      - Use formatação Markdown (negrito, listas).
      - Se o usuário for um EMPRESARIO, ajude-o a focar na redução de custos.
      - NUNCA mencione que você é um modelo de linguagem genérico.
    `;

    // 3. Comunicação com o Google Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const historyFormatted = history.map(h => ({ 
      role: h.role === 'ia' ? 'model' : 'user', 
      parts: [{ text: h.content }] 
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Recomendado pela velocidade e análise de dados
      config: { 
        systemInstruction: systemInstruction, 
        temperature: 0.4, 
        maxOutputTokens: 1500 
      },
      contents: [
        ...historyFormatted, 
        { role: 'user', parts: [{ text: message }] }
      ]
    });

    const replyText = response.text?.trim();
    if (!replyText) throw new Error("IA retornou vazio.");

    res.json({ reply: replyText });

  } catch (error) {
    console.error("ERRO IA:", error);
    res.status(500).json({ reply: '⚠️ Erro Crítico: Falha na comunicação com o Kernel Neural.' });
  }
});

// ==========================================
// CADASTRO DE PRODUTOS
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
    const { sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma } = req.body;
    const produto = await prisma.produto.create({
      data: { 
        sku, 
        nome, 
        mlItemId, 
        eKit, 
        plataforma: plataforma || "Mercado Livre", 
        preco: parseFloat(preco), 
        pesoGramas: parseInt(pesoGramas, 10) 
      }
    });
    res.status(201).json(produto);
  } catch (error) { 
    res.status(400).json({ error: 'Erro ao criar produto.' }); 
  }
});

// ==========================================
// RECUPERAÇÃO DE SENHA (SIMULADO)
// ==========================================

app.post('/api/auth/forgot-password', async (req, res) => {
  // Aqui entraria a lógica de enviar e-mail real com Nodemailer
  res.json({ message: 'Código de recuperação gerado nos logs do sistema.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  res.json({ message: 'Senha redefinida com sucesso!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { 
  console.log(`🚀 IA Analyiz API rodando na porta ${PORT}`); 
});