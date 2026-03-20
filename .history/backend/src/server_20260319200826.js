import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';
import { sendChatMessage } from './iaService.js'; // ← IA em arquivo próprio
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const app    = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'chave_super_secreta_provisoria';

// ==========================================
// AUTENTICAÇÃO E PERFIL
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    const userExists = await prisma.usuario.findUnique({ where: { email } });
    if (userExists) return res.status(400).json({ error: 'E-mail já cadastrado.' });

    const salt              = await bcrypt.genSalt(10);
    const senhaHash         = await bcrypt.hash(senha, salt);
    const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString();

    const novoUser = await prisma.usuario.create({
      data: { nome, email, senha: senhaHash, codigoVerificacao, role: 'BLOQUEADO' }
    });

    console.log(`✉️ Verificação para ${email}: [${codigoVerificacao}]`);
    res.status(201).json({ message: 'Usuário criado. Verifique seu e-mail.', userId: novoUser.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar usuário.' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user)                          return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.codigoVerificacao !== codigo) return res.status(400).json({ error: 'Código inválido.' });

    await prisma.usuario.update({
      where: { email },
      data:  { verificado: true, codigoVerificacao: null }
    });

    res.json({ message: 'E-mail verificado com sucesso!' });
  } catch {
    res.status(500).json({ error: 'Erro ao verificar código.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });

    if (!user)          return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!user.verificado) return res.status(403).json({ error: 'E-mail não verificado.' });

    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(400).json({ error: 'Senha incorreta.' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

    res.json({
      token,
      user: {
        id:                   user.id,
        nome:                 user.nome,
        email:                user.email,
        avatar:               user.avatar,
        role:                 user.role,
        solicitouDesbloqueio: user.solicitouDesbloqueio
      }
    });
  } catch {
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

app.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, nome, avatar } = req.body;
    const updatedUser = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data:  { nome, avatar }
    });

    res.json({
      message: 'Perfil atualizado com sucesso!',
      user: {
        id:                   updatedUser.id,
        nome:                 updatedUser.nome,
        email:                updatedUser.email,
        avatar:               updatedUser.avatar,
        role:                 updatedUser.role,
        solicitouDesbloqueio: updatedUser.solicitouDesbloqueio
      }
    });
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

// ==========================================
// GESTÃO DE USUÁRIOS
// ==========================================

app.post('/api/usuarios/request-unblock', async (req, res) => {
  try {
    const { id } = req.body;
    await prisma.usuario.update({
      where: { id: parseInt(id) },
      data:  { solicitouDesbloqueio: true }
    });
    res.json({ message: 'Solicitação enviada.', solicitouDesbloqueio: true });
  } catch {
    res.status(500).json({ error: 'Erro ao solicitar desbloqueio.' });
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select:  { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(usuarios);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuários.' });
  }
});

app.put('/api/usuarios/:id/role', async (req, res) => {
  try {
    const { id }   = req.params;
    const { role } = req.body;
    const updated  = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data:  { role, solicitouDesbloqueio: false }
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar cargo.' });
  }
});

app.get('/api/usuarios/pendentes', async (req, res) => {
  try {
    const count = await prisma.usuario.count({
      where: { role: 'BLOQUEADO', solicitouDesbloqueio: true }
    });
    res.json({ count });
  } catch {
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
    const div = await prisma.divergencia.findMany({
      where:   { resolvido: false },
      orderBy: { createdAt: 'desc' }
    });
    res.json(div);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar divergências.' });
  }
});

// ==========================================
// IA ANALYIZ
// ==========================================
// A lógica de IA está em ./iaService.js
// Aqui apenas:
//   1. Valida role do usuário
//   2. Busca contexto do banco (totais)
//   3. Delega para sendChatMessage()
// ==========================================

app.post('/api/ia/chat', async (req, res) => {
  const { message, history = [], userRole } = req.body;

  try {
    // Usuários bloqueados não têm acesso à IA
    if (userRole === 'BLOQUEADO') {
      return res.json({
        reply: '🔒 *Acesso Restrito.* Seu perfil está sob análise. Solicite acesso no menu de perfil.'
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ reply: '⚠️ Chave da API ausente no servidor.' });
    }

    // Busca contexto do banco para enriquecer o system prompt
    const [totalProdutos, totalDivergencias] = await Promise.all([
      prisma.produto.count(),
      prisma.divergencia.count({ where: { resolvido: false } }),
    ]);

    // Delega para iaService.js (mesmo padrão de SDK do ContentCreatorBot)
    const reply = await sendChatMessage(
      message,
      history,
      { totalProdutos, totalDivergencias, userRole }
    );

    res.json({ reply });

  } catch (error) {
    console.error('ERRO IA:', error);
    res.status(500).json({ reply: '⚠️ Erro no Kernel Neural. Tente novamente.' });
  }
});

// ==========================================
// PRODUTOS
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
        plataforma:  plataforma || 'Mercado Livre',
        preco:       parseFloat(preco),
        pesoGramas:  parseInt(pesoGramas, 10)
      }
    });
    res.status(201).json(produto);
  } catch {
    res.status(400).json({ error: 'Erro ao criar produto.' });
  }
});

// ==========================================
// START
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});