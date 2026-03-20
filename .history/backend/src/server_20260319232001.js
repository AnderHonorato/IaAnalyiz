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
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, avatar: user.avatar, role: user.role, solicitouDesbloqueio: user.solicitouDesbloqueio } });
  } catch { res.status(500).json({ error: 'Erro ao fazer login.' }); }
});

app.put('/api/auth/profile', async (req, res) => {
  try {
    const { id, nome, avatar } = req.body;
    const u = await prisma.usuario.update({ where: { id: parseInt(id) }, data: { nome, avatar } });
    res.json({ message: 'Perfil atualizado!', user: { id: u.id, nome: u.nome, email: u.email, avatar: u.avatar, role: u.role, solicitouDesbloqueio: u.solicitouDesbloqueio } });
  } catch { res.status(500).json({ error: 'Erro ao atualizar perfil.' }); }
});

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
    const usuarios = await prisma.usuario.findMany({ select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    res.json(usuarios);
  } catch { res.status(500).json({ error: 'Erro ao buscar usuários.' }); }
});

app.put('/api/usuarios/:id/role', async (req, res) => {
  try {
    const { id } = req.params; const { role } = req.body;
    const u = await prisma.usuario.update({ where: { id: parseInt(id) }, data: { role, solicitouDesbloqueio: false } });
    res.json(u);
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
    const session = await prisma.chatSession.create({
      data: { usuarioId: parseInt(userId), titulo: titulo || 'Nova conversa' }
    });
    res.status(201).json(session);
  } catch { res.status(500).json({ error: 'Erro ao criar sessão.' }); }
});

app.put('/api/chat/sessions/:id', async (req, res) => {
  try {
    const { titulo } = req.body;
    const session = await prisma.chatSession.update({
      where: { id: parseInt(req.params.id) },
      data:  { titulo }
    });
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
      where:   { sessionId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, role: true, content: true, imageBase64: true, imageDesc: true, createdAt: true }
    });
    res.json(messages);
  } catch { res.status(500).json({ error: 'Erro ao buscar mensagens.' }); }
});

// ==========================================
// BOT E SSE
// ==========================================

app.get('/api/bot/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  addSseClient(res);
  runBot().catch(err => res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Erro: ' + err.message })}\n\n`));
});

// ==========================================
// DIVERGÊNCIAS — CRUD COMPLETO
// ==========================================

// Busca todas (por padrão não resolvidas, mas aceita ?status=TODOS|PENDENTE|CORRIGIDO|IGNORADO)
app.get('/api/divergencias', async (req, res) => {
  try {
    const { status, plataforma } = req.query;
    const where = {};
    if (plataforma) where.plataforma = plataforma;

    if (status && status !== 'TODOS') {
      where.status = status;
    } else if (!status) {
      // default: apenas pendentes
      where.status = 'PENDENTE';
    }

    const div = await prisma.divergencia.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao buscar divergências.' }); }
});

// Contagem por status
app.get('/api/divergencias/stats', async (req, res) => {
  try {
    const [pendente, corrigido, ignorado] = await Promise.all([
      prisma.divergencia.count({ where: { status: 'PENDENTE' } }),
      prisma.divergencia.count({ where: { status: 'CORRIGIDO' } }),
      prisma.divergencia.count({ where: { status: 'IGNORADO' } }),
    ]);
    res.json({ pendente, corrigido, ignorado, total: pendente + corrigido + ignorado });
  } catch { res.status(500).json({ error: 'Erro ao buscar stats.' }); }
});

// Marcar como CORRIGIDO
app.put('/api/divergencias/:id/corrigido', async (req, res) => {
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data:  { status: 'CORRIGIDO', resolvido: true }
    });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao atualizar divergência.' }); }
});

// Marcar como PENDENTE (desfazer correção)
app.put('/api/divergencias/:id/pendente', async (req, res) => {
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data:  { status: 'PENDENTE', resolvido: false }
    });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao atualizar divergência.' }); }
});

// Marcar como IGNORADO (não vai corrigir)
app.put('/api/divergencias/:id/ignorado', async (req, res) => {
  try {
    const div = await prisma.divergencia.update({
      where: { id: parseInt(req.params.id) },
      data:  { status: 'IGNORADO', resolvido: false }
    });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao atualizar divergência.' }); }
});

// Excluir divergência
app.delete('/api/divergencias/:id', async (req, res) => {
  try {
    await prisma.divergencia.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro ao excluir divergência.' }); }
});

// Excluir TODAS as divergências corrigidas (limpeza)
app.delete('/api/divergencias/limpar/corrigidas', async (req, res) => {
  try {
    const { count } = await prisma.divergencia.deleteMany({ where: { status: 'CORRIGIDO' } });
    res.json({ ok: true, removidas: count });
  } catch { res.status(500).json({ error: 'Erro ao limpar divergências.' }); }
});

// ==========================================
// PRODUTOS — com dimensões
// ==========================================

app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({
      include: { itensDoKit: { include: { produto: true } } },
      orderBy: { id: 'desc' }
    });
    res.json(produtos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/produtos', async (req, res) => {
  try {
    const {
      sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma,
      alturaCm, larguraCm, comprimentoCm
    } = req.body;

    const produto = await prisma.produto.create({
      data: {
        sku,
        nome,
        mlItemId:      mlItemId || null,
        eKit:          !!eKit,
        plataforma:    plataforma || 'Mercado Livre',
        preco:         parseFloat(preco),
        pesoGramas:    parseInt(pesoGramas, 10),
        alturaCm:      parseFloat(alturaCm)      || 0,
        larguraCm:     parseFloat(larguraCm)     || 0,
        comprimentoCm: parseFloat(comprimentoCm) || 0,
      }
    });
    res.status(201).json(produto);
  } catch (e) { res.status(400).json({ error: e.message || 'Erro ao criar produto.' }); }
});

app.put('/api/produtos/:id', async (req, res) => {
  try {
    const {
      sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma,
      alturaCm, larguraCm, comprimentoCm
    } = req.body;

    const produto = await prisma.produto.update({
      where: { id: parseInt(req.params.id) },
      data: {
        sku,
        nome,
        mlItemId:      mlItemId || null,
        eKit:          !!eKit,
        plataforma:    plataforma || 'Mercado Livre',
        preco:         parseFloat(preco),
        pesoGramas:    parseInt(pesoGramas, 10),
        alturaCm:      parseFloat(alturaCm)      || 0,
        larguraCm:     parseFloat(larguraCm)     || 0,
        comprimentoCm: parseFloat(comprimentoCm) || 0,
      }
    });
    res.json(produto);
  } catch (e) { res.status(400).json({ error: e.message || 'Erro ao atualizar produto.' }); }
});

app.delete('/api/produtos/:id', async (req, res) => {
  try {
    await prisma.produto.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ==========================================
// IA ANALYIZ — chat com sessões
// ==========================================

function detectIntent(message) {
  const l = message.toLowerCase();
  return {
    needsProdutos:     /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l),
    needsDivergencias: /divergên|divergen|anomalia|erro|peso|auditoria|varredura|inconsistên/i.test(l),
    needsUsuarios:     /usuário|usuario|acesso|desbloqueio|bloqueado|pendente|role|cargo|equipe|quem/i.test(l),
    needsHistorico:    /conversamos|disse antes|lembra|anterior|histórico|falei|perguntei|resuma|o que falamos/i.test(l),
  };
}

app.post('/api/ia/chat', async (req, res) => {
  const { message, sessionId, userRole, userId, imageBase64, imageMimeType } = req.body;

  try {
    if (userRole === 'BLOQUEADO') {
      return res.json({ reply: 'Seu perfil está bloqueado. Solicite acesso no menu de perfil. 🔒', sources: [] });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ reply: 'Chave da API ausente no servidor.', sources: [] });
    }

    let session;
    if (sessionId) {
      session = await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } });
    }
    if (!session && userId) {
      session = await prisma.chatSession.create({
        data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' }
      });
    }

    let imageDesc = null;
    if (imageBase64) {
      const mime = imageMimeType || 'image/jpeg';
      imageDesc  = await analyzeImage(imageBase64, mime, message);
    }

    if (session) {
      await prisma.chatMessage.create({
        data: {
          sessionId:   session.id,
          role:        'user',
          content:     message || '',
          imageBase64: imageBase64 || null,
          imageDesc:   imageDesc  || null,
        }
      });
    }

    const dbMessages = session
      ? await prisma.chatMessage.findMany({
          where:   { sessionId: session.id },
          orderBy: { createdAt: 'asc' },
          take:    52,
          select:  { role: true, content: true, imageDesc: true }
        })
      : [];

    const history = dbMessages.map(m => ({
      role:    m.role,
      content: m.imageDesc
        ? `[Imagem enviada — descrição: ${m.imageDesc}] ${m.content}`.trim()
        : m.content,
    }));

    const intent = detectIntent(message || '');

    const usuarioAtual = userId
      ? await prisma.usuario.findUnique({ where: { id: parseInt(userId) }, select: { id: true, nome: true, email: true, role: true } })
      : null;

    const [totalProdutos, totalDivergencias, totalUsuarios, usuariosBlockeados, produtos, divergencias, usuarios] = await Promise.all([
      prisma.produto.count(),
      prisma.divergencia.count({ where: { status: 'PENDENTE' } }),
      prisma.usuario.count(),
      prisma.usuario.count({ where: { role: 'BLOQUEADO', ...(usuarioAtual ? { id: { not: usuarioAtual.id } } : {}) } }),
      intent.needsProdutos
        ? prisma.produto.findMany({ include: { itensDoKit: { include: { produto: true } } }, orderBy: { id: 'desc' }, take: 20 })
        : Promise.resolve([]),
      intent.needsDivergencias
        ? prisma.divergencia.findMany({ where: { status: 'PENDENTE' }, orderBy: { createdAt: 'desc' }, take: 10 })
        : Promise.resolve([]),
      (intent.needsUsuarios || intent.needsDivergencias || intent.needsProdutos)
        ? prisma.usuario.findMany({ select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true }, orderBy: { createdAt: 'desc' } })
        : Promise.resolve([]),
    ]);

    const usuariosPendentes = usuarios.filter(u => u.role === 'BLOQUEADO' && u.solicitouDesbloqueio && u.id !== usuarioAtual?.id).length;

    let messageForAI = message || '';
    if (imageDesc && !message) messageForAI = '[usuário enviou uma imagem sem texto]';

    const reply = await sendChatMessage(
      messageForAI,
      history,
      {
        totalProdutos, totalDivergencias, userRole,
        usuariosPendentes, totalUsuarios,
        usuariosBlockeados, usuariosAtivos: totalUsuarios - usuariosBlockeados,
        produtos, divergencias, usuarios, usuarioAtual,
        imageContext: imageDesc,
      }
    );

    if (session) {
      await prisma.chatMessage.create({
        data: { sessionId: session.id, role: 'ia', content: reply }
      });

      const msgCount = await prisma.chatMessage.count({ where: { sessionId: session.id, role: 'user' } });
      if (msgCount === 1 && message) {
        const titulo = message.substring(0, 40) + (message.length > 40 ? '…' : '');
        await prisma.chatSession.update({ where: { id: session.id }, data: { titulo } });
      } else {
        await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
      }
    }

    const hrefRegex = /<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    const sources = [];
    const seenUrls = new Set();
    let match;
    while ((match = hrefRegex.exec(reply)) !== null) {
      const url   = match[1];
      const label = match[2].trim() || url;
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        sources.push({ label, url });
      }
    }

    res.json({ reply, sessionId: session?.id || null, sources });

  } catch (error) {
    console.error('ERRO IA:', error);
    res.status(500).json({ reply: 'Erro no Kernel Neural. Tente novamente. ⚠️', sources: [] });
  }
});

// ==========================================
// IA PROATIVA
// ==========================================

const lastInsightByUser = {};

app.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) {
      return res.json({ insight: null });
    }

    let contextLines = [];

    if (pageKey === 'divergencias' || pageKey === 'dashboard') {
      const divs = await prisma.divergencia.findMany({
        where: { status: 'PENDENTE' }, orderBy: { createdAt: 'desc' }, take: 5
      });
      if (divs.length > 0) {
        contextLines.push(`Divergências pendentes: ${divs.length}`);
        divs.forEach(d => contextLines.push(`  • ${d.mlItemId}: ${d.motivo}`));
      } else {
        contextLines.push('Nenhuma divergência pendente.');
      }
    }

    if (pageKey === 'produtos' || pageKey === 'dashboard') {
      const total = await prisma.produto.count();
      const kits  = await prisma.produto.count({ where: { eKit: true } });
      const semML = await prisma.produto.count({ where: { mlItemId: null } });
      contextLines.push(`Produtos: ${total} total, ${kits} kits, ${semML} sem ID do ML`);
    }

    if (pageKey === 'usuarios' || pageKey === 'dashboard') {
      const pendentes = await prisma.usuario.findMany({
        where: { role: 'BLOQUEADO', solicitouDesbloqueio: true, id: { not: parseInt(userId) } },
        select: { nome: true }
      });
      if (pendentes.length > 0) {
        contextLines.push(`Aguardando desbloqueio: ${pendentes.length} usuário(s)`);
        pendentes.forEach(u => contextLines.push(`  • ${u.nome}`));
      }
    }

    if (contextLines.length === 0) return res.json({ insight: null });

    const context  = contextLines.join('\n');
    const cacheKey = `${userId}:${pageKey}:${context}`;
    if (lastInsightByUser[cacheKey]) return res.json({ insight: null });

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Você é a IA Analyiz. O usuário abriu a página "${pageKey}".

DADOS REAIS ENCONTRADOS:
${context}

Gere UMA mensagem proativa curta (máx 3 linhas) que:
1. Comece EXATAMENTE com: "Tenho novos dados para você:"
2. Informe o dado mais relevante e específico
3. Termine com UMA pergunta curta se quer mais detalhes
4. Use emojis (📦⚠️👤✅) quando couber
5. Use HTML: <b>negrito</b>, <br> para quebra — NUNCA asteriscos ou markdown
6. Seja direto e específico com os números reais`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.4, maxOutputTokens: 200 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const raw = response.text?.trim();
    if (!raw) return res.json({ insight: null });

    const insight = raw
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')
      .trim();

    lastInsightByUser[cacheKey] = Date.now();
    const now = Date.now();
    Object.keys(lastInsightByUser).forEach(k => {
      if (now - lastInsightByUser[k] > 10 * 60 * 1000) delete lastInsightByUser[k];
    });

    res.json({ insight, pageKey });
  } catch (error) {
    console.error('ERRO IA proativa:', error.message);
    res.json({ insight: null });
  }
});

// ==========================================
// START
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API rodando na porta ${PORT}`));