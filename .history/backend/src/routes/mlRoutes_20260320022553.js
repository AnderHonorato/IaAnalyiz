import express from 'express';
import axios from 'axios';
import { prisma } from '../prisma.js';
import { addSseClient, runBot } from '../botRunner.js';
import { iniciarAgendadorUsuario } from '../services/jobs.js';

const router = express.Router();

router.get('/api/ml/auth-url', (req, res) => {
  const state = req.query.userId ? Buffer.from(String(req.query.userId)).toString('base64') : '';
  res.json({ url: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_APP_ID}&redirect_uri=${encodeURIComponent(process.env.ML_REDIRECT_URI)}&state=${state}` });
});

router.get('/api/ml/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const userId = parseInt(Buffer.from(state, 'base64').toString('utf-8'));
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, { params: { grant_type: 'authorization_code', client_id: process.env.ML_APP_ID, client_secret: process.env.ML_SECRET_KEY, code, redirect_uri: process.env.ML_REDIRECT_URI }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const { access_token, refresh_token, expires_in, user_id } = response.data;
    let nickname = '';
    try { const me = await axios.get('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${access_token}` } }); nickname = me.data.nickname || ''; } catch (_) {}
    await prisma.mlToken.upsert({ where: { usuarioId: userId }, update: { accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + (expires_in - 300) * 1000), mlUserId: String(user_id), nickname }, create: { usuarioId: userId, accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + (expires_in - 300) * 1000), mlUserId: String(user_id), nickname } });
    res.redirect(`http://localhost:5173/ml?auth=success&nickname=${encodeURIComponent(nickname)}`);
  } catch (e) { res.redirect('http://localhost:5173/ml?auth=error'); }
});

router.get('/api/ml/status', async (req, res) => {
  try {
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(req.query.userId) } });
    if (!token) return res.json({ connected: false });
    res.json({ connected: true, expired: new Date() >= new Date(token.expiresAt), nickname: token.nickname, mlUserId: token.mlUserId, expiresAt: token.expiresAt });
  } catch { res.json({ connected: false }); }
});

router.delete('/api/ml/disconnect', async (req, res) => {
  try { await prisma.mlToken.deleteMany({ where: { usuarioId: parseInt(req.query.userId) } }); res.json({ ok: true }); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.get('/api/ml/item-details/:mlItemId', async (req, res) => {
  try {
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(req.query.userId) } });
    if (!token) return res.status(401).json({ error: 'Não autorizado' });
    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` } });
    const [itemRes, descRes] = await Promise.all([ mlApi.get(`/items/${req.params.mlItemId}`), mlApi.get(`/items/${req.params.mlItemId}/description`).catch(() => ({ data: { plain_text: 'Descrição não disponível.' } })) ]);
    res.json({ ...itemRes.data, description_text: descRes.data.plain_text });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar detalhes.' }); }
});

router.get('/api/bot/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
  addSseClient(res); runBot(parseInt(req.query.userId)).catch(err => res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Erro: ' + err.message })}\n\n`));
});

router.get('/api/agendador', async (req, res) => {
  try { res.json(await prisma.agendadorConfig.findUnique({ where: { usuarioId: parseInt(req.query.userId) } }) || { ativo: false, intervalo: 360, ultimaExecucao: null, proximaExecucao: null }); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.put('/api/agendador', async (req, res) => {
  try {
    const { userId, ativo, intervalo } = req.body;
    const uid = parseInt(userId); const intMin = Math.max(30, parseInt(intervalo) || 360);
    const config = await prisma.agendadorConfig.upsert({ where: { usuarioId: uid }, update: { ativo, intervalo: intMin, proximaExecucao: ativo ? new Date(Date.now() + intMin * 60000) : null }, create: { usuarioId: uid, ativo, intervalo: intMin, proximaExecucao: ativo ? new Date(Date.now() + intMin * 60000) : null } });
    await iniciarAgendadorUsuario(uid); res.json(config);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

export default router;