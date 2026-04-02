/**
 * backend/src/routes/sessaoRoutes.js
 * 
 * Propósito:
 * Gerenciar sessões de utilizadores para rastreamento de acesso e métricas.
 * Registra entradas/saídas e fornece estatísticas de utilizadores online.
 * 
 * Responsabilidades:
 * - POST /api/sessao/entrar - Registar entrada do utilizador
 * - POST /api/sessao/sair - Registar saída do utilizador
 * - GET /api/sessao/stats - Estatísticas de sessões ativas
 * - GET /api/sessao/historico - Histórico de sessões do utilizador
 * 
 * Modelo de Sessão:
 * - sessaoUsuario: Registo de cada login/logout
 * - Campos: id, usuarioId, entradaEm, saidaEm, ativo, userAgent, ip
 * - Permite rastrear múltiplas sessões simultâneas por utilizador
 * 
 * Lógica de Estados:
 * - entradaEm: timestamp automático da criação
 * - ativo: boolean indicando sessão ativa
 * - saidaEm: timestamp quando utilizador sai
 * - Cleanup: ao entrar, encerra sessões ativas anteriores
 * 
 * Estatísticas:
 * - ativos: Utilizadores únicos online (últimos 30 min)
 * - totalSessoes: Count histórico de todas as sessões
 * - utilizadoresUnicos: Total de utilizadores distintos ever
 * - sessionList: Lista de sessões ativas com detalhes
 * 
 * Casos de Uso:
 * - Dashboard: \"Utilizadores online agora\"
 * - Relatórios: Picos de acesso, padrões de uso
 * - Segurança: Rastra IP e userAgent para detecção de anomalias
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 * @requires express, @prisma/client
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma  = new PrismaClient();
const router  = express.Router();

// ╪═══════════════════════════════════════════════════════════════════════════
// POST /api/sessao/entrar — Registra a entrada do usuário
// ╪═══════════════════════════════════════════════════════════════════════════
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