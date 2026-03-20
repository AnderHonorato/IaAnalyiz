import axios from 'axios';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runBot, addSseClient } from './botRunner.js';
import { sendChatMessage, analyzeImage } from './iaService.js';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const app    = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

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
  } catch { res.status(500).json({ error: 'Erro ao registrar usuário.' }); }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, codigo } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user)                             return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.codigoVerificacao !== codigo) return res.status(400).json({ error: 'Código inválido.' });
    await prisma.usuario.update({ where: { email }, data: { verificado: true, codigoVerificacao: null } });
    res.json({ message: 'E-mail verificado com sucesso!' });
  } catch { res.status(500).json({ error: 'Erro ao verificar código.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user)            return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!user.verificado) return res.status(403).json({ error: 'E-mail não verificado.' });
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(400).json({ error: 'Senha incorreta.' });
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({
      token,
      user: {
        id: user.id, nome: user.nome, role: user.role,
        avatar: user.avatar, tema: user.tema || 'dark',
        solicitouDesbloqueio: user.solicitouDesbloqueio,
        exclusaoPendente: user.exclusaoPendente || false,
        exclusaoSolicitadaEm: user.exclusaoSolicitadaEm || null,
      }
    });
  } catch { res.status(500).json({ error: 'Erro ao fazer login.' }); }
});

app.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, nome, avatar, tema } = req.body;
    const u = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data:  { nome, avatar, ...(tema ? { tema } : {}) }
    });
    res.json({
      message: 'Perfil atualizado!',
      user: {
        id: u.id, nome: u.nome, role: u.role,
        avatar: u.avatar, tema: u.tema,
        solicitouDesbloqueio: u.solicitouDesbloqueio,
        exclusaoPendente: u.exclusaoPendente,
        exclusaoSolicitadaEm: u.exclusaoSolicitadaEm,
      }
    });
  } catch { res.status(500).json({ error: 'Erro ao atualizar perfil.' }); }
});

// ==========================================
// EXCLUSÃO DE CONTA
// ==========================================

// Passo 1: Solicitar — gera código de confirmação
app.post('/api/auth/delete-account/request', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const user = await prisma.usuario.findUnique({ where: { id: parseInt(userId) } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.role === 'OWNER') return res.status(403).json({ error: 'A conta Owner não pode ser excluída automaticamente.' });

    const codigo     = Math.floor(100000 + Math.random() * 900000).toString();
    const codigoHash = await bcrypt.hash(codigo, 10);

    await prisma.usuario.update({
      where: { id: parseInt(userId) },
      data:  { exclusaoCodigoHash: codigoHash, exclusaoPendente: false, exclusaoSolicitadaEm: null }
    });

    // Exibe no terminal (integrar com SMTP depois)
    console.log(`🗑️ [EXCLUSÃO] Código para ${user.email}: [${codigo}]`);
    res.json({ message: 'Código enviado. Verifique o terminal do servidor (e-mail será integrado em breve).' });
  } catch (e) {
    console.error('Erro ao solicitar exclusão:', e);
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
});

// Passo 2: Confirmar com código — agenda exclusão em 3 dias úteis
app.post('/api/auth/delete-account/confirm', async (req, res) => {
  try {
    const { userId, codigo } = req.body;
    if (!userId || !codigo) return res.status(400).json({ error: 'Dados incompletos.' });
    const user = await prisma.usuario.findUnique({ where: { id: parseInt(userId) } });
    if (!user)                    return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!user.exclusaoCodigoHash) return res.status(400).json({ error: 'Nenhum código de exclusão pendente.' });

    const codigoValido = await bcrypt.compare(codigo, user.exclusaoCodigoHash);
    if (!codigoValido) return res.status(400).json({ error: 'Código inválido. Verifique e tente novamente.' });

    const exclusaoEm = calcularDiasUteis(new Date(), 3);
    await prisma.usuario.update({
      where: { id: parseInt(userId) },
      data:  { exclusaoPendente: true, exclusaoCodigoHash: null, exclusaoSolicitadaEm: exclusaoEm }
    });

    console.log(`⚠️ Exclusão agendada para usuário ${userId} em: ${exclusaoEm.toLocaleDateString('pt-BR')}`);
    res.json({ message: 'Exclusão confirmada.', exclusaoEm });
  } catch (e) {
    console.error('Erro ao confirmar exclusão:', e);
    res.status(500).json({ error: 'Erro ao confirmar exclusão.' });
  }
});

// Cancelar exclusão antes do prazo
app.post('/api/auth/delete-account/cancel', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    await prisma.usuario.update({
      where: { id: parseInt(userId) },
      data:  { exclusaoPendente: false, exclusaoCodigoHash: null, exclusaoSolicitadaEm: null }
    });
    res.json({ message: 'Exclusão cancelada com sucesso.' });
  } catch { res.status(500).json({ error: 'Erro ao cancelar exclusão.' }); }
});

// Helper: calcula N dias úteis
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

// Job que verifica e executa exclusões agendadas (roda a cada hora)
async function verificarExclusoesAgendadas() {
  try {
    const agora = new Date();
    const contas = await prisma.usuario.findMany({
      where: { exclusaoPendente: true, exclusaoSolicitadaEm: { lte: agora }, role: { not: 'OWNER' } },
      select: { id: true, email: true }
    });
    for (const user of contas) {
      console.log(`🗑️ Executando exclusão da conta ${user.email} (id: ${user.id})`);
      try {
        // Deleta em cascata respeitando FK
        const sessions = await prisma.chatSession.findMany({ where: { usuarioId: user.id }, select: { id: true } });
        for (const s of sessions) await prisma.chatMessage.deleteMany({ where: { sessionId: s.id } });
        await prisma.chatSession.deleteMany({ where: { usuarioId: user.id } });
        await prisma.divergencia.deleteMany({ where: { usuarioId: user.id } });
        const prods = await prisma.produto.findMany({ where: { usuarioId: user.id }, select: { id: true } });
        const prodIds = prods.map(p => p.id);
        if (prodIds.length > 0) {
          await prisma.kitItem.deleteMany({ where: { OR: [{ kitId: { in: prodIds } }, { produtoId: { in: prodIds } }] } });
        }
        await prisma.produto.deleteMany({ where: { usuarioId: user.id } });
        await prisma.mlToken.deleteMany({ where: { usuarioId: user.id } });
        await prisma.agendadorConfig.deleteMany({ where: { usuarioId: user.id } });
        await prisma.usuario.delete({ where: { id: user.id } });
        console.log(`✅ Conta ${user.email} excluída com sucesso.`);
      } catch (err) { console.error(`❌ Erro ao excluir conta ${user.email}:`, err.message); }
    }
  } catch (e) { console.error('Erro no job de exclusão:', e.message); }
}

// ==========================================
// GESTÃO DE USUÁRIOS
// ==========================================

app.post('/api/usuarios/request-unblock', async (req, res) => {
  try {
    const { id } = req.body;
    await prisma.usuario.update({ where: { id: parseInt(id) }, data: { solicitouDesbloqueio: true } });
    res.json({ message: 'Solicitação enviada.', solicitouDesbloqueio: true });
  } catch { res.status(500).json({ error: 'Erro ao solicitar desbloqueio.' }); }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, nome: true, role: true, solicitouDesbloqueio: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(usuarios);
  } catch { res.status(500).json({ error: 'Erro ao buscar usuários.' }); }
});

app.put('/api/usuarios/:id/role', async (req, res) => {
  try {
    const { id } = req.params; const { role } = req.body;
    const u = await prisma.usuario.update({ where: { id: parseInt(id) }, data: { role, solicitouDesbloqueio: false } });
    res.json({ id: u.id, nome: u.nome, role: u.role });
  } catch { res.status(500).json({ error: 'Erro ao atualizar cargo.' }); }
});

app.get('/api/usuarios/pendentes', async (req, res) => {
  try {
    const count = await prisma.usuario.count({ where: { role: 'BLOQUEADO', solicitouDesbloqueio: true } });
    res.json({ count });
  } catch { res.status(500).json({ error: 'Erro ao buscar pendentes.' }); }
});

// ==========================================
// CHAT SESSIONS
// ==========================================

app.get('/api/chat/sessions/:userId', async (req, res) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { usuarioId: parseInt(req.params.userId) },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, titulo: true, createdAt: true, updatedAt: true }
    });
    res.json(sessions);
  } catch { res.status(500).json({ error: 'Erro ao buscar sessões.' }); }
});

app.post('/api/chat/sessions', async (req, res) => {
  try {
    const { userId, titulo } = req.body;
    const session = await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: titulo || 'Nova conversa' } });
    res.status(201).json(session);
  } catch { res.status(500).json({ error: 'Erro ao criar sessão.' }); }
});

app.put('/api/chat/sessions/:id', async (req, res) => {
  try {
    const session = await prisma.chatSession.update({ where: { id: parseInt(req.params.id) }, data: { titulo: req.body.titulo } });
    res.json(session);
  } catch { res.status(500).json({ error: 'Erro ao atualizar sessão.' }); }
});

app.delete('/api/chat/sessions/:id', async (req, res) => {
  try {
    await prisma.chatSession.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro ao deletar sessão.' }); }
});

app.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: parseInt(req.params.id) }, orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, imageBase64: true, imageDesc: true, createdAt: true }
    });
    res.json(messages);
  } catch { res.status(500).json({ error: 'Erro ao buscar mensagens.' }); }
});

// ==========================================
// BOT E SSE
// ==========================================

app.get('/api/bot/stream', (req, res) => {
  const userId = parseInt(req.query.userId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  addSseClient(res);
  runBot(userId).catch(err => res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Erro: ' + err.message })}\n\n`));
});

// ==========================================
// DIVERGÊNCIAS — CRUD MULTI-TENANT
// ==========================================

app.get('/api/divergencias', async (req, res) => {
  try {
    const { status, plataforma, userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const where = { usuarioId: parseInt(userId) };
    if (plataforma) where.plataforma = plataforma;
    if (status && status !== 'TODOS') where.status = status;
    else if (!status) where.status = 'PENDENTE';
    const div = await prisma.divergencia.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao buscar divergências.' }); }
});

app.get('/api/divergencias/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const uid = parseInt(userId);
    const [pendente, corrigido, ignorado] = await Promise.all([
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
    ]);
    res.json({ pendente, corrigido, ignorado, total: pendente + corrigido + ignorado });
  } catch { res.status(500).json({ error: 'Erro ao buscar stats.' }); }
});

app.put('/api/divergencias/:id/corrigido', async (req, res) => {
  try { res.json(await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'CORRIGIDO', resolvido: true } })); }
  catch { res.status(500).json({ error: 'Erro ao atualizar divergência.' }); }
});

app.put('/api/divergencias/:id/pendente', async (req, res) => {
  try { res.json(await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'PENDENTE', resolvido: false } })); }
  catch { res.status(500).json({ error: 'Erro ao atualizar divergência.' }); }
});

app.put('/api/divergencias/:id/ignorado', async (req, res) => {
  try { res.json(await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'IGNORADO', resolvido: false } })); }
  catch { res.status(500).json({ error: 'Erro ao atualizar divergência.' }); }
});

app.delete('/api/divergencias/:id', async (req, res) => {
  try { await prisma.divergencia.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Erro ao excluir divergência.' }); }
});

app.delete('/api/divergencias/limpar/corrigidas', async (req, res) => {
  try {
    const { userId } = req.query;
    const where = { status: 'CORRIGIDO', ...(userId ? { usuarioId: parseInt(userId) } : {}) };
    const { count } = await prisma.divergencia.deleteMany({ where });
    res.json({ ok: true, removidas: count });
  } catch { res.status(500).json({ error: 'Erro ao limpar divergências.' }); }
});

// ==========================================
// PRODUTOS — MULTI-TENANT + categorias
// ==========================================

app.get('/api/produtos', async (req, res) => {
  try {
    const { userId, categoria, status, search, plataforma } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const where = { usuarioId: parseInt(userId) };
    if (categoria)  where.categoria  = categoria;
    if (status)     where.status     = status;
    if (plataforma) where.plataforma = plataforma;
    if (search) {
      where.OR = [
        { nome:     { contains: search, mode: 'insensitive' } },
        { sku:      { contains: search, mode: 'insensitive' } },
        { mlItemId: { contains: search, mode: 'insensitive' } },
      ];
    }
    const produtos = await prisma.produto.findMany({
      where, include: { itensDoKit: { include: { produto: true } } }, orderBy: { id: 'desc' }
    });
    res.json(produtos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/produtos/:id/vincular', async (req, res) => {
  try {
    const { composicao, pesoManual } = req.body; // composicao = [{ produtoId, quantidade }]
    const id = parseInt(req.params.id);

    // Busca o produto (anúncio pendente)
    const anuncio = await prisma.produto.findUnique({ where: { id } });
    if (!anuncio) return res.status(404).json({ error: 'Anúncio não encontrado' });

    let pesoTotal = 0;
    let eKit = false;

    // Limpa composições antigas, se houver, para garantir consistência
    await prisma.kitItem.deleteMany({ where: { kitId: id } });

    if (composicao && composicao.length > 0) {
      eKit = true;
      // Calcula o peso total baseado nos itens base
      for (const item of composicao) {
        const pBase = await prisma.produto.findUnique({ where: { id: parseInt(item.produtoId) } });
        if (pBase) {
          pesoTotal += (pBase.pesoGramas * parseInt(item.quantidade));
          // Cria o relacionamento no banco (Tabela KitItem)
          await prisma.kitItem.create({
            data: { kitId: id, produtoId: pBase.id, quantidade: parseInt(item.quantidade) }
          });
        }
      }
    } else {
      // Se não enviou composição, é um item simples, usa o peso manual digitado
      pesoTotal = parseInt(pesoManual) || 0;
    }

    // Atualiza o anúncio para ser um item oficial do catálogo
    const atualizado = await prisma.produto.update({
      where: { id },
      data: {
        plataforma: 'Mercado Livre', // Tira da aba "Não Vinculados" e manda pro Catálogo
        eKit: eKit,
        pesoGramas: pesoTotal
      }
    });

    res.json(atualizado);
  } catch (e) {
    console.error('Erro ao vincular:', e);
    res.status(500).json({ error: 'Erro ao vincular anúncio.' });
  }
});

app.get('/api/produtos/categorias', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const cats = await prisma.produto.findMany({
      where: { usuarioId: parseInt(userId), categoria: { not: null } },
      select: { categoria: true }, distinct: ['categoria'],
    });
    res.json(cats.map(c => c.categoria).filter(Boolean).sort());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/produtos', async (req, res) => {
  try {
    const { userId, sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma, alturaCm, larguraCm, comprimentoCm, categoria, status, thumbnail } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const produto = await prisma.produto.create({
      data: {
        usuarioId: parseInt(userId), sku, nome, mlItemId: mlItemId || null, eKit: !!eKit,
        plataforma: plataforma || 'Mercado Livre', preco: parseFloat(preco) || 0,
        pesoGramas: parseInt(pesoGramas, 10) || 0, alturaCm: parseFloat(alturaCm) || 0,
        larguraCm: parseFloat(larguraCm) || 0, comprimentoCm: parseFloat(comprimentoCm) || 0,
        categoria: categoria || null, status: status || 'active', thumbnail: thumbnail || null,
      }
    });
    res.status(201).json(produto);
  } catch (e) { res.status(400).json({ error: e.message || 'Erro ao criar produto.' }); }
});

app.put('/api/produtos/:id', async (req, res) => {
  try {
    const { sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma, alturaCm, larguraCm, comprimentoCm, categoria, status, thumbnail } = req.body;
    const produto = await prisma.produto.update({
      where: { id: parseInt(req.params.id) },
      data: {
        sku, nome, mlItemId: mlItemId || null, eKit: !!eKit, plataforma: plataforma || 'Mercado Livre',
        preco: parseFloat(preco) || 0, pesoGramas: parseInt(pesoGramas, 10) || 0,
        alturaCm: parseFloat(alturaCm) || 0, larguraCm: parseFloat(larguraCm) || 0,
        comprimentoCm: parseFloat(comprimentoCm) || 0, categoria: categoria || null,
        status: status || 'active', thumbnail: thumbnail || null,
      }
    });
    res.json(produto);
  } catch (e) { res.status(400).json({ error: e.message || 'Erro ao atualizar produto.' }); }
});

app.delete('/api/produtos/:id', async (req, res) => {
  try { await prisma.produto.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/produtos/import-batch', async (req, res) => {
  try {
    const { userId, produtos } = req.body;
    if (!userId || !Array.isArray(produtos)) return res.status(400).json({ error: 'Dados inválidos' });
    const uid = parseInt(userId);
    let criados = 0; let atualizados = 0;
    for (const p of produtos) {
      const existing = await prisma.produto.findFirst({ where: { usuarioId: uid, mlItemId: p.mlItemId } });
      if (existing) {
        await prisma.produto.update({ where: { id: existing.id }, data: { nome: p.nome, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null, alturaCm: p.alturaCm || 0, larguraCm: p.larguraCm || 0, comprimentoCm: p.comprimentoCm || 0 } });
        atualizados++;
      } else {
        await prisma.produto.create({
          data: { usuarioId: uid, sku: p.mlItemId || `ML-${Date.now()}-${Math.random()}`, nome: p.nome, mlItemId: p.mlItemId, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, alturaCm: p.alturaCm || 0, larguraCm: p.larguraCm || 0, comprimentoCm: p.comprimentoCm || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null, plataforma: 'Mercado Livre', eKit: false }
        });
        criados++;
      }
    }
    res.json({ ok: true, criados, atualizados });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ==========================================
// MERCADO LIVRE — Anúncios + Categorias
// ==========================================

app.get('/api/ml/anuncios', async (req, res) => {
  try {
    const { userId, status = 'active', q, offset = 0, limit = 50 } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
    if (!token) return res.status(401).json({ error: 'Conta ML não conectada' });
    const mlApi   = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` } });
    const params  = { limit: parseInt(limit), offset: parseInt(offset), status };
    const srchRes = await mlApi.get(`/users/${token.mlUserId}/items/search`, { params });
    const { results: ids, paging } = srchRes.data;
    if (!ids || ids.length === 0) return res.json({ items: [], paging: paging || { total: 0 } });
    const batchRes = await mlApi.get(`/items?ids=${ids.join(',')}`);
    const items = (batchRes.data || []).filter(i => i.code === 200).map(i => {
      const item = i.body;
      const dim = item?.shipping?.dimensions || '';
      const parts = dim.split('x');
      return {
        mlItemId: item.id, nome: item.title, preco: item.price, status: item.status,
        thumbnail: item.thumbnail, categoria: item.category_id,
        pesoGramas: parts.length >= 4 ? parseInt(parts[3]) : 0,
        alturaCm: parseFloat(parts[0]) || 0, larguraCm: parseFloat(parts[1]) || 0, comprimentoCm: parseFloat(parts[2]) || 0,
        permalink: item.permalink,
      };
    });
    res.json({ items, paging: paging || { total: 0 } });
  } catch (e) { console.error('Erro ML anúncios:', e.response?.data || e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/ml/categorias', async (req, res) => {
  try {
    const { userId, siteId = 'MLB' } = req.query;
    const token   = userId ? await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } }) : null;
    const headers = token ? { Authorization: `Bearer ${token.accessToken}` } : {};
    const catRes  = await axios.get(`https://api.mercadolibre.com/sites/${siteId}/categories`, { headers });
    res.json(catRes.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// ML OAuth — MULTI-TENANT
// ==========================================

app.get('/api/ml/auth-url', (req, res) => {
  const { userId } = req.query;
  const appId       = process.env.ML_APP_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;
  if (!appId)       return res.status(400).json({ error: 'ML_APP_ID não configurado no .env' });
  if (!redirectUri) return res.status(400).json({ error: 'ML_REDIRECT_URI não configurado no .env' });
  const state = userId ? Buffer.from(String(userId)).toString('base64') : '';
  res.json({ url: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` });
});

app.get('/api/ml/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Código não recebido.');
  let userId = null;
  try { userId = parseInt(Buffer.from(state, 'base64').toString('utf-8')); } catch (_) {}
  try {
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
      params: { grant_type: 'authorization_code', client_id: process.env.ML_APP_ID, client_secret: process.env.ML_SECRET_KEY, code, redirect_uri: process.env.ML_REDIRECT_URI },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const { access_token, refresh_token, expires_in, user_id } = response.data;
    const expiresAt = new Date(Date.now() + (expires_in - 300) * 1000);
    let nickname = '';
    try { const me = await axios.get('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${access_token}` } }); nickname = me.data.nickname || ''; } catch (_) {}
    const tokenData = { accessToken: access_token, refreshToken: refresh_token, expiresAt, mlUserId: String(user_id), nickname };
    if (userId) await prisma.mlToken.upsert({ where: { usuarioId: userId }, update: tokenData, create: { usuarioId: userId, ...tokenData } });
    console.log(`✅ Token ML salvo para usuário ${userId}: ${nickname}`);
    res.redirect(`http://localhost:5173/ml?auth=success&nickname=${encodeURIComponent(nickname)}`);
  } catch (error) {
    console.error('❌ Erro callback ML:', error.response?.data || error.message);
    res.redirect('http://localhost:5173/ml?auth=error');
  }
});

app.get('/api/ml/status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.json({ connected: false });
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
    if (!token) return res.json({ connected: false });
    const expired = new Date() >= new Date(token.expiresAt);
    res.json({ connected: true, expired, nickname: token.nickname, mlUserId: token.mlUserId, expiresAt: token.expiresAt });
  } catch { res.json({ connected: false }); }
});

app.delete('/api/ml/disconnect', async (req, res) => {
  try {
    const { userId } = req.query;
    if (userId) await prisma.mlToken.deleteMany({ where: { usuarioId: parseInt(userId) } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro ao desconectar.' }); }
});

// ==========================================
// REFRESH TOKEN ML
// ==========================================

async function refreshMlTokenIfNeeded(userId) {
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

// ==========================================
// AGENDADOR — MULTI-TENANT
// ==========================================

const agendadorTimers = new Map();

async function iniciarAgendadorUsuario(userId) {
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

app.get('/api/agendador', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const config = await prisma.agendadorConfig.findUnique({ where: { usuarioId: parseInt(userId) } });
    res.json(config || { ativo: false, intervalo: 360, ultimaExecucao: null, proximaExecucao: null });
  } catch { res.status(500).json({ error: 'Erro ao buscar agendador.' }); }
});

app.put('/api/agendador', async (req, res) => {
  try {
    const { userId, ativo, intervalo } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const uid = parseInt(userId);
    const intervaloMin = Math.max(30, parseInt(intervalo, 10) || 360);
    const proximaExecucao = ativo ? new Date(Date.now() + intervaloMin * 60 * 1000) : null;
    const config = await prisma.agendadorConfig.upsert({
      where: { usuarioId: uid },
      update: { ativo, intervalo: intervaloMin, proximaExecucao },
      create: { usuarioId: uid, ativo, intervalo: intervaloMin, proximaExecucao },
    });
    await iniciarAgendadorUsuario(uid);
    res.json(config);
  } catch { res.status(500).json({ error: 'Erro ao salvar agendador.' }); }
});

// ==========================================
// IA ANALYIZ — ISOLADA POR USUÁRIO
// ==========================================

function detectIntent(message) {
  const l = message.toLowerCase();
  return {
    needsProdutos:     /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l),
    needsDivergencias: /divergên|divergen|anomalia|erro|peso|auditoria|varredura|inconsistên/i.test(l),
  };
}

app.post('/api/ia/chat', async (req, res) => {
  const { message, sessionId, userRole, userId, imageBase64, imageMimeType } = req.body;
  try {
    if (userRole === 'BLOQUEADO') return res.json({ reply: 'Seu perfil está bloqueado. Solicite acesso no menu de perfil. 🔒', sources: [] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: 'Chave da API ausente.', sources: [] });
    let session;
    if (sessionId) session = await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } });
    if (!session && userId) session = await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' } });
    let imageDesc = null;
    if (imageBase64) imageDesc = await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', message);
    if (session) await prisma.chatMessage.create({ data: { sessionId: session.id, role: 'user', content: message || '', imageBase64: imageBase64 || null, imageDesc: imageDesc || null } });
    const dbMessages = session ? await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' }, take: 52, select: { role: true, content: true, imageDesc: true } }) : [];
    const history = dbMessages.map(m => ({ role: m.role, content: m.imageDesc ? `[Imagem: ${m.imageDesc}] ${m.content}`.trim() : m.content }));
    const intent  = detectIntent(message || '');
    const uid     = userId ? parseInt(userId) : null;
    const [totalProdutos, totalDivergencias, produtos, divergencias] = await Promise.all([
      uid ? prisma.produto.count({ where: { usuarioId: uid } }) : Promise.resolve(0),
      uid ? prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }) : Promise.resolve(0),
      uid && intent.needsProdutos     ? prisma.produto.findMany({ where: { usuarioId: uid }, orderBy: { id: 'desc' }, take: 20 }) : Promise.resolve([]),
      uid && intent.needsDivergencias ? prisma.divergencia.findMany({ where: { usuarioId: uid, status: 'PENDENTE' }, orderBy: { createdAt: 'desc' }, take: 10 }) : Promise.resolve([]),
    ]);
    const usuarioAtual = uid ? await prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }) : null;
    const reply = await sendChatMessage(message || (imageDesc ? '[imagem]' : ''), history, { totalProdutos, totalDivergencias, userRole, produtos, divergencias, usuarioAtual, imageContext: imageDesc });
    if (session) {
      await prisma.chatMessage.create({ data: { sessionId: session.id, role: 'ia', content: reply } });
      const msgCount = await prisma.chatMessage.count({ where: { sessionId: session.id, role: 'user' } });
      if (msgCount === 1 && message) await prisma.chatSession.update({ where: { id: session.id }, data: { titulo: message.substring(0, 40) + (message.length > 40 ? '…' : '') } });
      else await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
    }
    const hrefRegex = /<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    const sources = []; const seenUrls = new Set(); let match;
    while ((match = hrefRegex.exec(reply)) !== null) { const url = match[1]; if (!seenUrls.has(url)) { seenUrls.add(url); sources.push({ label: match[2].trim() || url, url }); } }
    res.json({ reply, sessionId: session?.id || null, sources });
  } catch (error) { console.error('ERRO IA:', error); res.status(500).json({ reply: 'Erro no Kernel Neural. Tente novamente. ⚠️', sources: [] }); }
});

const lastInsightByUser = {};

app.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) return res.json({ insight: null });
    const uid = parseInt(userId); let contextLines = [];
    if (pageKey === 'divergencias' || pageKey === 'dashboard') {
      const divs = await prisma.divergencia.findMany({ where: { usuarioId: uid, status: 'PENDENTE' }, orderBy: { createdAt: 'desc' }, take: 5 });
      if (divs.length > 0) { contextLines.push(`Divergências pendentes: ${divs.length}`); divs.forEach(d => contextLines.push(`  • ${d.mlItemId}: ${d.motivo}`)); }
      else contextLines.push('Nenhuma divergência pendente.');
    }
    if (pageKey === 'produtos' || pageKey === 'dashboard') {
      const [total, kits, semML] = await Promise.all([prisma.produto.count({ where: { usuarioId: uid } }), prisma.produto.count({ where: { usuarioId: uid, eKit: true } }), prisma.produto.count({ where: { usuarioId: uid, mlItemId: null } })]);
      contextLines.push(`Seus produtos: ${total} total, ${kits} kits, ${semML} sem ID do ML`);
    }
    if (contextLines.length === 0) return res.json({ insight: null });
    const context = contextLines.join('\n'); const cacheKey = `${userId}:${pageKey}:${context}`;
    if (lastInsightByUser[cacheKey]) return res.json({ insight: null });
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', config: { temperature: 0.4, maxOutputTokens: 200 }, contents: [{ role: 'user', parts: [{ text: `Você é a IA Analyiz. Página: "${pageKey}".\n\nDADOS:\n${context}\n\nGere UMA mensagem proativa curta (máx 3 linhas):\n1. Comece com "Tenho novos dados para você:"\n2. Informe o dado mais relevante\n3. Termine com UMA pergunta\n4. Use emojis (📦⚠️✅)\n5. HTML: <b>negrito</b>, <br> — NUNCA asteriscos\n6. Seja específico com números` }] }] });
    const raw = response.text?.trim();
    if (!raw) return res.json({ insight: null });
    const insight = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>').trim();
    lastInsightByUser[cacheKey] = Date.now();
    Object.keys(lastInsightByUser).forEach(k => { if (Date.now() - lastInsightByUser[k] > 10 * 60 * 1000) delete lastInsightByUser[k]; });
    res.json({ insight, pageKey });
  } catch (error) { console.error('ERRO IA proativa:', error.message); res.json({ insight: null }); }
});

// ==========================================
// START
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
  try {
    const agendadores = await prisma.agendadorConfig.findMany({ where: { ativo: true } });
    for (const ag of agendadores) await iniciarAgendadorUsuario(ag.usuarioId);
    console.log(`⏰ ${agendadores.length} agendador(es) restaurado(s)`);
  } catch (_) {}

  // Job de exclusão de contas — roda a cada hora
  verificarExclusoesAgendadas();
  setInterval(verificarExclusoesAgendadas, 60 * 60 * 1000);
});