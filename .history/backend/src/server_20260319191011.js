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

app.use(cors());
// AUMENTO DO LIMITE PARA PERMITIR FOTOS EM BASE64
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailtrap.io",
  port: process.env.SMTP_PORT || 2525,
  auth: { user: process.env.SMTP_USER || "user", pass: process.env.SMTP_PASS || "pass" }
});

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
    const novoUser = await prisma.usuario.create({ data: { nome, email, senha: senhaHash, codigoVerificacao } });
    console.log(`✉️ E-mail de Verificação para ${email}: CÓDIGO [${codigoVerificacao}]`);
    res.status(201).json({ message: 'Usuário criado. Verifique seu e-mail.', userId: novoUser.id });
  } catch (error) { res.status(500).json({ error: 'Erro ao registrar.' }); }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.codigoVerificacao !== codigo) return res.status(400).json({ error: 'Código inválido.' });
    await prisma.usuario.update({ where: { email }, data: { verificado: true, codigoVerificacao: null } });
    res.json({ message: 'E-mail verificado com sucesso!' });
  } catch (error) { res.status(500).json({ error: 'Erro ao verificar código.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!user.verificado) return res.status(403).json({ error: 'E-mail não verificado.' });
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(400).json({ error: 'Senha incorreta.' });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, avatar: user.avatar } });
  } catch (error) { res.status(500).json({ error: 'Erro ao fazer login.' }); }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const codigoRecuperacao = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.usuario.update({ where: { email }, data: { codigoRecuperacao } });
    console.log(`✉️ E-mail de Recuperação para ${email}: CÓDIGO [${codigoRecuperacao}]`);
    res.json({ message: 'Código de recuperação enviado.' });
  } catch (error) { res.status(500).json({ error: 'Erro ao solicitar recuperação.' }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, codigo, novaSenha } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user || user.codigoRecuperacao !== codigo) return res.status(400).json({ error: 'Código inválido.' });
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(novaSenha, salt);
    await prisma.usuario.update({ where: { email }, data: { senha: senhaHash, codigoRecuperacao: null } });
    res.json({ message: 'Senha redefinida com sucesso!' });
  } catch (error) { res.status(500).json({ error: 'Erro ao redefinir senha.' }); }
});

// === ROTA DE ATUALIZAÇÃO DE PERFIL ===
app.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, nome, avatar } = req.body;
    const updatedUser = await prisma.usuario.update({
      where: { id },
      data: { nome, avatar }
    });
    res.json({ message: 'Perfil atualizado com sucesso!', user: { id: updatedUser.id, nome: updatedUser.nome, email: updatedUser.email, avatar: updatedUser.avatar } });
  } catch (error) { res.status(500).json({ error: 'Erro ao atualizar perfil.' }); }
});

// ==========================================
// ROTA SSE E DADOS DO BOT
// ==========================================
app.get('/api/bot/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
  addSseClient(res);
  runBot().catch(err => { res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Erro: ' + err.message })}\n\n`); });
});

app.get('/api/divergencias', async (req, res) => {
  const div = await prisma.divergencia.findMany({ where: { resolvido: false }, orderBy: { createdAt: 'desc' } });
  res.json(div);
});

// ==========================================
// IA ANALYIZ (AGORA LÊ TODAS AS PLATAFORMAS)
// ==========================================
app.post('/api/ia/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  try {
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: '⚠️ Chave da API do Gemini ausente.' });
    await new Promise(resolve => setTimeout(resolve, 2500));

    const divergencias = await prisma.divergencia.findMany({ where: { resolvido: false } });
    const produtos = await prisma.produto.findMany();

    const detalhesDivergencias = divergencias.length > 0 
      ? divergencias.map(d => `- [${d.plataforma}] ID ML: ${d.mlItemId} | Motivo: "${d.motivo}" | Link: ${d.link}`).join('\n')
      : "Scan limpo em todas as plataformas. Nenhuma divergência.";

    const systemInstruction = `
      Você é a "IA Analyiz", inteligência artificial corporativa de e-commerce e logística. Trabalha para o Admin "Ander".
      Você possui acesso global a todas as lojas vinculadas (Mercado Livre, Shopee, Amazon).
      
      TOM: Profissional, analítica. Use Markdown (evite asterisco duplo colado).
      
      DADOS GLOBAIS (TEMPO REAL):
      - Total Produtos na base: ${produtos.length}
      - Total Divergências Globais: ${divergencias.length}
      
      LISTA DE DIVERGÊNCIAS ATIVAS (COM ORIGEM DA PLATAFORMA):
      ${detalhesDivergencias}
    `;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const historyFormatted = history.map(h => ({ role: h.role === 'ia' ? 'model' : 'user', parts: [{ text: h.content }] }));
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: systemInstruction, temperature: 0.4, maxOutputTokens: 1500 },
      contents: [...historyFormatted, { role: 'user', parts: [{ text: message }] }]
    });

    res.json({ reply: response.text?.trim() });
  } catch (error) { res.status(500).json({ reply: '⚠️ Erro Crítico: Falha na comunicação.' }); }
});

// ==========================================
// CADASTRO DE PRODUTOS
// ==========================================
app.get('/api/produtos', async (req, res) => {
  try { res.json(await prisma.produto.findMany({ include: { itensDoKit: { include: { produto: true } } }, orderBy: { id: 'desc' } })); } 
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/produtos', async (req, res) => {
  try {
    const { sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma } = req.body;
    const produto = await prisma.produto.create({
      data: { sku, nome, mlItemId, eKit, plataforma, preco: parseFloat(preco), pesoGramas: parseInt(pesoGramas, 10) }
    });
    res.status(201).json(produto);
  } catch (error) { res.status(400).json({ error: 'Erro ao criar produto.' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`🚀 API do Backend rodando na porta ${PORT}`); });