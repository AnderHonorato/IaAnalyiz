// ═══════════════════════════════════════════════════════════════════════════════
//  AUTENTICAÇÃO E GESTÃO DE USUÁRIOS — Registro, Login, Autorização
// ═══════════════════════════════════════════════════════════════════════════════
//
// Este módulo implementa todo fluxo de autenticação e autorização do sistema:
//
// Funcionalidades principais:
// • Registro de novos usuários (começam BLOQUEADOs por padrão)
// • Login com JWT token (válido por 7 dias)
// • Gestão de usuários: listar, alterar role, solicitar desbloqueio
// • Atualização de perfil: nome, avatar, tema visual
//
// Fluxo segurança:
// 1. Senhas armazenadas com bcrypt (salt=10)
// 2. JWT assinado com JWT_SECRET (variável de ambiente)
// 3. Novos usuários começam com role BLOQUEADO até admin aprova
// 4. Admin pode alterar role: BLOQUEADO, USUARIO, ADMIN_EMPRESA, OWNER
//
// Dependências:
// • Express: framework de roteamento HTTP
// • PrismaClient: queries de banco de dados
// • bcrypt: hash seguro de senhas
// • jsonwebtoken: geração e validação de JWT tokens

import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_padrao_aqui';

// ═════════════════════════════════════════════════════════════════════════════════
// 📝 REGISTRO E LOGIN
// ═════════════════════════════════════════════════════════════════════════════════

// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
// Cria nova conta de usuário. Valida campos obrigatórios, verifica duplicação,
// criptografa senha com bcrypt, e salva no banco com role=BLOQUEADO (padrão).
//
// Estratégia de bloqueio por padrão:
// • Novo usuário não pode acessar sistema até admin aprovar (solicitouDesbloqueio=false)
// • Admin vê em dashboard e muda role para USUARIO, ADMIN_EMPRESA, ou OWNER
// • Previne abuse e garante onboarding controlado
//
// Body:
//   @nome (string, required) - Nome completo ou comercial
//   @email (string, required) - E-mail único (validação de unicidade)
//   @senha (string, required) - Mínimo 8 caracteres (validar no frontend)
//
// Response (success):
//   {
//     success: true,
//     user: { id, nome, email }
//   }
//
// Response (error):
//   400: "Preencha todos os campos." - campos faltando
//   400: "E-mail já cadastrado." - email duplicado
//   500: "Erro interno ao criar conta." - erro DB
//
// Nota segurança: Senha é hasheada com bcrypt antes de sair do handler
router.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }

    // ─ Verificar se email já existe
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }

    // ─ Criptografar senha com bcrypt (salt factor=10, balance entre segurança e performance)
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    // ─ Criar usuário com status padrão: BLOQUEADo
    const novoUser = await prisma.usuario.create({
      data: { 
        nome, 
        email, 
        senha: senhaHash,
        role: 'BLOQUEADO' // Todo usuário novo começa bloqueado por padrão
      }
    });

    // ─ Retornar dados públicos (sem senha hash)
    res.json({ success: true, user: { id: novoUser.id, nome: novoUser.nome, email: novoUser.email } });
  } catch (error) {
    console.error('[Register Error]', error);
    res.status(500).json({ error: 'Erro interno ao criar conta.' });
  }
});

// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
// Autentica usuário existente, verifica senha com bcrypt, emite JWT token válido
// por 7 dias. Token é assinado com JWT_SECRET e inclui userId + role para
// autorização de endpoints.
//
// Fluxo:
// 1. Busca usuário por email
// 2. Valida senha com bcrypt.compare (timing-safe)
// 3. Gera JWT assinado com role para ACL em endpoints
// 4. Retorna token + userData
//
// Body:
//   @email (string, required) - E-mail do usuário
//   @senha (string, required) - Senha em plaintext (comparada com hash)
//
// Response (success):
//   {
//     token: "eyJhbGc...", (JWT válido por 7 dias)
//     user: { id, nome, email, role, avatar, tema, solicitouDesbloqueio }
//   }
//
// Response (error):
//   400: "Usuário não encontrado." - email não existe
//   400: "Senha incorreta." - senha não confere
//   500: "Erro ao fazer login." - erro DB
//
// Nota: Retorna role no JWT para usar em isAuthorized checks no servidor
router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    // ─ Buscar usuário por email
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Usuário não encontrado.' });
    }
    
    // ─ Comparar senha entrada com hash armazenado (timing-safe com bcrypt)
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      return res.status(400).json({ error: 'Senha incorreta.' });
    }

    // ─ Gerar JWT token válido por 7 dias
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    // ─ Retornar token + dados públicos de usuário
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