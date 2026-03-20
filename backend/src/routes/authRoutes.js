import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'chave_super_secreta_provisoria';

function calcularDiasUteis(dataInicio, dias) {
  const data = new Date(dataInicio);
  let contagem = 0;
  while (contagem < dias) {
    data.setDate(data.getDate() + 1);
    const dia = data.getDay();
    if (dia !== 0 && dia !== 6) contagem++;
  }
  return data;
}

router.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    const userExists = await prisma.usuario.findUnique({ where: { email } });
    if (userExists) return res.status(400).json({ error: 'E-mail já cadastrado.' });
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString();
    const novoUser = await prisma.usuario.create({ data: { nome, email, senha: senhaHash, codigoVerificacao, role: 'BLOQUEADO' } });
    console.log(`✉️ Verificação para ${email}: [${codigoVerificacao}]`);
    res.status(201).json({ message: 'Usuário criado.', userId: novoUser.id });
  } catch { res.status(500).json({ error: 'Erro ao registrar usuário.' }); }
});

router.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.codigoVerificacao !== codigo) return res.status(400).json({ error: 'Código inválido.' });
    await prisma.usuario.update({ where: { email }, data: { verificado: true, codigoVerificacao: null } });
    res.json({ message: 'E-mail verificado com sucesso!' });
  } catch { res.status(500).json({ error: 'Erro ao verificar código.' }); }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!user.verificado) return res.status(403).json({ error: 'E-mail não verificado.' });
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(400).json({ error: 'Senha incorreta.' });
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, nome: user.nome, role: user.role, avatar: user.avatar, tema: user.tema || 'dark', solicitouDesbloqueio: user.solicitouDesbloqueio, exclusaoPendente: user.exclusaoPendente, exclusaoSolicitadaEm: user.exclusaoSolicitadaEm } });
  } catch { res.status(500).json({ error: 'Erro ao fazer login.' }); }
});

router.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, nome, avatar, tema } = req.body;
    const u = await prisma.usuario.update({ where: { id: parseInt(id) }, data: { nome, avatar, ...(tema ? { tema } : {}) } });
    res.json({ message: 'Perfil atualizado!', user: { id: u.id, nome: u.nome, role: u.role, avatar: u.avatar, tema: u.tema, solicitouDesbloqueio: u.solicitouDesbloqueio, exclusaoPendente: u.exclusaoPendente, exclusaoSolicitadaEm: u.exclusaoSolicitadaEm } });
  } catch { res.status(500).json({ error: 'Erro ao atualizar perfil.' }); }
});

router.post('/api/auth/delete-account/request', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await prisma.usuario.findUnique({ where: { id: parseInt(userId) } });
    if (user.role === 'OWNER') return res.status(403).json({ error: 'Owner não pode excluir.' });
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const codigoHash = await bcrypt.hash(codigo, 10);
    await prisma.usuario.update({ where: { id: parseInt(userId) }, data: { exclusaoCodigoHash: codigoHash, exclusaoPendente: false, exclusaoSolicitadaEm: null } });
    console.log(`🗑️ Código para ${user.email}: [${codigo}]`);
    res.json({ message: 'Código enviado.' });
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/auth/delete-account/confirm', async (req, res) => {
  try {
    const { userId, codigo } = req.body;
    const user = await prisma.usuario.findUnique({ where: { id: parseInt(userId) } });
    const codigoValido = await bcrypt.compare(codigo, user.exclusaoCodigoHash);
    if (!codigoValido) return res.status(400).json({ error: 'Código inválido.' });
    const exclusaoEm = calcularDiasUteis(new Date(), 3);
    await prisma.usuario.update({ where: { id: parseInt(userId) }, data: { exclusaoPendente: true, exclusaoCodigoHash: null, exclusaoSolicitadaEm: exclusaoEm } });
    res.json({ message: 'Confirmada.', exclusaoEm });
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/auth/delete-account/cancel', async (req, res) => {
  try { await prisma.usuario.update({ where: { id: parseInt(req.body.userId) }, data: { exclusaoPendente: false, exclusaoCodigoHash: null, exclusaoSolicitadaEm: null } }); res.json({ message: 'Cancelado.' }); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/usuarios/request-unblock', async (req, res) => {
  try { await prisma.usuario.update({ where: { id: parseInt(req.body.id) }, data: { solicitouDesbloqueio: true } }); res.json({ message: 'Solicitação enviada.', solicitouDesbloqueio: true }); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/api/usuarios', async (req, res) => {
  try { res.json(await prisma.usuario.findMany({ select: { id: true, nome: true, role: true, solicitouDesbloqueio: true, createdAt: true }, orderBy: { createdAt: 'desc' } })); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.put('/api/usuarios/:id/role', async (req, res) => {
  try { const u = await prisma.usuario.update({ where: { id: parseInt(req.params.id) }, data: { role: req.body.role, solicitouDesbloqueio: false } }); res.json(u); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/api/usuarios/pendentes', async (req, res) => {
  try { res.json({ count: await prisma.usuario.count({ where: { role: 'BLOQUEADO', solicitouDesbloqueio: true } }) }); } catch { res.status(500).json({ error: 'Erro.' }); }
});

export default router;