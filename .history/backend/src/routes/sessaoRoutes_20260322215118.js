import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma  = new PrismaClient();
const router  = express.Router();

// POST /api/sessao/entrar — Registra a entrada do usuário
router.post('/api/sessao/entrar', async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId obrigatório' });
  }
  
  try {
    // Marca sessões anteriores como inativas (caso tenham ficado presas/abertas)
    await prisma.sessaoUsuario.updateMany({
      where: { usuarioId: parseInt(userId), ativo: true },
      data:  { ativo: false, saidaEm: new Date() },
    });
    
    // Cria a nova sessão
    const sessao = await prisma.sessaoUsuario.create({
      data: {
        usuarioId: parseInt(userId),
        userAgent: req.headers['user-agent']?.substring(0, 200) || null,
        ip:        req.ip || null,
      },
    });
    
    res.json({ sessaoId: sessao.id });
  } catch (e) {
    console.error('[Sessao/entrar]', e.message);
    res.status(500).json({ error: 'Erro ao registrar sessão' });
  }
});

// POST /api/sessao/sair — Registra a saída do usuário
router.post('/api/sessao/sair', async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId obrigatório' });
  }
  
  try {
    await prisma.sessaoUsuario.updateMany({
      where: { usuarioId: parseInt(userId), ativo: true },
      data:  { ativo: false, saidaEm: new Date() },
    });
    
    res.json({ ok: true });
  } catch (e) {
    console.error('[Sessao/sair]', e.message);
    res.status(500).json({ error: 'Erro ao registrar saída' });
  }
});

// GET /api/sessao/stats — Retorna contagens (ex: para exibir em um header/dashboard)
router.get('/api/sessao/stats', async (req, res) => {
  try {
    // Considera "ativo" quem entrou nos últimos 30 min sem registrar saída
    const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000);

    // Usa groupBy para contar usuários únicos online (resolve o bug de mostrar 2 online sendo a mesma pessoa)
    const ativosUnicos = await prisma.sessaoUsuario.groupBy({
      by: ['usuarioId'],
      where: { ativo: true, entradaEm: { gte: trintaMinAtras } },
    });

    // Total histórico de sessões
    const totalSessoes = await prisma.sessaoUsuario.count();

    // Total de usuários únicos que já acessaram a plataforma na história
    const uniqueUsers = await prisma.sessaoUsuario.groupBy({
      by: ['usuarioId'],
    });

    res.json({
      ativos: ativosUnicos.length,
      totalSessoes: totalSessoes,
      totalUsuariosUnicos: uniqueUsers.length,
    });
  } catch (e) {
    console.error('[Sessao/stats]', e.message);
    res.status(500).json({ ativos: 0, totalSessoes: 0, totalUsuariosUnicos: 0 });
  }
});

// Função utilitária: Limpa sessões ativas antigas (> 2h sem heartbeat)
export async function limparSessoesAntigas() {
  const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await prisma.sessaoUsuario.updateMany({
    where: { ativo: true, entradaEm: { lt: duasHorasAtras } },
    data:  { ativo: false, saidaEm: new Date() },
  }).catch((e) => {
    console.error('[Cron/Limpeza de Sessões]', e.message);
  });
}

export default router;