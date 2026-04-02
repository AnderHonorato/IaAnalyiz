import { prisma } from '../prisma.js';
import axios from 'axios';
import { runBot } from '../botRunner.js';

export const agendadorTimers = new Map();

export async function refreshMlTokenIfNeeded(userId) {
  try {
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: userId } });
    if (!token) return false;
    if (new Date() < new Date(token.expiresAt)) return true;
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
      params: { grant_type: 'refresh_token', client_id: process.env.ML_APP_ID, client_secret: process.env.ML_SECRET_KEY, refresh_token: token.refreshToken },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const { access_token, refresh_token, expires_in } = response.data;
    await prisma.mlToken.update({ where: { usuarioId: userId }, data: { accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + (expires_in - 300) * 1000) } });
    console.log(`✅ Token ML renovado para usuário ${userId}`);
    return true;
  } catch (e) { console.error(`❌ Erro ao renovar token ML usuário ${userId}:`, e.response?.data || e.message); return false; }
}

export async function iniciarAgendadorUsuario(userId) {
  if (agendadorTimers.has(userId)) { clearTimeout(agendadorTimers.get(userId)); agendadorTimers.delete(userId); }
  try {
    const config = await prisma.agendadorConfig.findUnique({ where: { usuarioId: userId } });
    if (!config?.ativo) return;
    const intervaloMs = config.intervalo * 60 * 1000;
    const delay = Math.max(0, (config.proximaExecucao ? new Date(config.proximaExecucao).getTime() : Date.now()) - Date.now());
    console.log(`⏰ Agendador usuário ${userId} — próxima em ${Math.round(delay / 60000)} min`);
    agendadorTimers.set(userId, setTimeout(async () => {
      await refreshMlTokenIfNeeded(userId);
      await runBot(userId);
      const now = new Date();
      await prisma.agendadorConfig.update({ where: { usuarioId: userId }, data: { ultimaExecucao: now, proximaExecucao: new Date(now.getTime() + intervaloMs) } });
      iniciarAgendadorUsuario(userId);
    }, delay));
  } catch (e) { console.error('Erro no agendador:', e.message); }
}

export async function iniciarTodosAgendadores() {
  try {
    const agendadores = await prisma.agendadorConfig.findMany({ where: { ativo: true } });
    for (const ag of agendadores) await iniciarAgendadorUsuario(ag.usuarioId);
    console.log(`⏰ ${agendadores.length} agendador(es) restaurado(s)`);
  } catch (_) {}
}

export async function verificarExclusoesAgendadas() {
  try {
    const agora = new Date();
    const contas = await prisma.usuario.findMany({
      where: { exclusaoPendente: true, exclusaoSolicitadaEm: { lte: agora }, role: { not: 'OWNER' } },
      select: { id: true, email: true }
    });
    for (const user of contas) {
      console.log(`🗑️ Executando exclusão da conta ${user.email} (id: ${user.id})`);
      try {
        const sessions = await prisma.chatSession.findMany({ where: { usuarioId: user.id }, select: { id: true } });
        for (const s of sessions) await prisma.chatMessage.deleteMany({ where: { sessionId: s.id } });
        await prisma.chatSession.deleteMany({ where: { usuarioId: user.id } });
        await prisma.divergencia.deleteMany({ where: { usuarioId: user.id } });
        const prods = await prisma.produto.findMany({ where: { usuarioId: user.id }, select: { id: true } });
        const prodIds = prods.map(p => p.id);
        if (prodIds.length > 0) await prisma.kitItem.deleteMany({ where: { OR: [{ kitId: { in: prodIds } }, { produtoId: { in: prodIds } }] } });
        await prisma.produto.deleteMany({ where: { usuarioId: user.id } });
        await prisma.mlToken.deleteMany({ where: { usuarioId: user.id } });
        await prisma.agendadorConfig.deleteMany({ where: { usuarioId: user.id } });
        await prisma.usuario.delete({ where: { id: user.id } });
        console.log(`✅ Conta ${user.email} excluída com sucesso.`);
      } catch (err) { console.error(`❌ Erro ao excluir conta ${user.email}:`, err.message); }
    }
  } catch (e) { console.error('Erro no job de exclusão:', e.message); }
}