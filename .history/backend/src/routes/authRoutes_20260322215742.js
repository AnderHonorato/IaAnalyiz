import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_padrao_aqui';

// 1. REGISTRAR NOVO USUÁRIO
router.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }

    // Criptografa a senha antes de salvar no banco
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    const novoUser = await prisma.usuario.create({
      data: { 
        nome, 
        email, 
        senha: senhaHash,
        role: 'BLOQUEADO' // Todo usuário novo começa bloqueado por padrão
      }
    });

    res.json({ success: true, user: { id: novoUser.id, nome: novoUser.nome, email: novoUser.email } });
  } catch (error) {
    console.error('[Register Error]', error);
    res.status(500).json({ error: 'Erro interno ao criar conta.' });
  }
});

// 2. LOGIN DO USUÁRIO
router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    
    if (!user) {
      return res.status(400).json({ error: 'Usuário não encontrado.' });
    }
    
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      return res.status(400).json({ error: 'Senha incorreta.' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        tema: user.tema,
        solicitouDesbloqueio: user.solicitouDesbloqueio
      }
    });
  } catch (error) {
    console.error('[Login Error]', error);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

// 3. BUSCAR TODOS OS USUÁRIOS (Para a tela de Gestão)
router.get('/api/usuarios', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { 
        id: true, 
        nome: true, 
        email: true, 
        role: true, 
        solicitouDesbloqueio: true 
      },
      orderBy: { id: 'desc' }
    });
    res.json(usuarios);
  } catch (error) {
    console.error('[Get Usuarios Error]', error);
    res.status(500).json({ error: 'Erro ao buscar usuários.' });
  }
});

// 4. ALTERAR CARGO DO USUÁRIO
router.put('/api/usuarios/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    const user = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: { 
        role, 
        solicitouDesbloqueio: false // Se aprovou ou bloqueou, reseta a solicitação
      } 
    });
    res.json(user);
  } catch (error) {
    console.error('[Update Role Error]', error);
    res.status(500).json({ error: 'Erro ao atualizar cargo.' });
  }
});

// 5. SOLICITAR DESBLOQUEIO
router.post('/api/usuarios/request-unblock', async (req, res) => {
  try {
    const { id } = req.body;
    const user = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: { solicitouDesbloqueio: true }
    });
    res.json(user);
  } catch (error) {
    console.error('[Request Unblock Error]', error);
    res.status(500).json({ error: 'Erro ao solicitar desbloqueio.' });
  }
});

// 6. CONTAR USUÁRIOS PENDENTES (Para o botão de notificação no MainLayout)
router.get('/api/usuarios/pendentes', async (req, res) => {
  try {
    const count = await prisma.usuario.count({
      where: { role: 'BLOQUEADO', solicitouDesbloqueio: true }
    });
    res.json({ count });
  } catch (error) {
    console.error('[Pendentes Error]', error);
    res.status(500).json({ count: 0 });
  }
});

// 7. ATUALIZAR PERFIL (Tema, Avatar, Nome)
router.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, nome, avatar, tema } = req.body;
    const user = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: { nome, avatar, tema }
    });
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        nome: user.nome, 
        email: user.email, 
        role: user.role, 
        avatar: user.avatar, 
        tema: user.tema, 
        solicitouDesbloqueio: user.solicitouDesbloqueio 
      } 
    });
  } catch (error) {
    console.error('[Profile Error]', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

export default router;