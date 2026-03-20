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
app.use(express.json({ limit: '20mb' }));  // maior para suportar imagens base64
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
// CHAT SESSIONS (múltiplas conversas por usuário)
// ==========================================

// Lista todas as sessões do usuário
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

// Cria nova sessão
app.post('/api/chat/sessions', async (req, res) => {
  try {
    const { userId, titulo } = req.body;
    const session = await prisma.chatSession.create({
      data: { usuarioId: parseInt(userId), titulo: titulo || 'Nova conversa' }
    });
    res.status(201).json(session);
  } catch { res.status(500).json({ error: 'Erro ao criar sessão.' }); }
});

// Renomeia sessão (auto-título baseado na primeira mensagem)
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

// Deleta sessão (cascade deleta mensagens)
app.delete('/api/chat/sessions/:id', async (req, res) => {
  try {
    await prisma.chatSession.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro ao deletar sessão.' }); }
});

// Carrega mensagens de uma sessão
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
// BOT E DADOS LOGÍSTICOS
// ==========================================

app.get('/api/bot/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  addSseClient(res);
  runBot().catch(err => res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Erro: ' + err.message })}\n\n`));
});

app.get('/api/divergencias', async (req, res) => {
  try {
    const div = await prisma.divergencia.findMany({ where: { resolvido: false }, orderBy: { createdAt: 'desc' } });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao buscar divergências.' }); }
});

// ==========================================
// IA ANALYIZ — endpoint principal com sessões
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

    // ── Garante/cria sessão ──
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } });
    }
    if (!session && userId) {
      session = await prisma.chatSession.create({
        data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' }
      });
    }

    // ── Analisa imagem se houver ──
    let imageDesc = null;
    if (imageBase64) {
      const mime = imageMimeType || 'image/jpeg';
      imageDesc  = await analyzeImage(imageBase64, mime, message);
    }

    // ── Salva mensagem do usuário no banco ──
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

    // ── Carrega histórico completo da sessão (até 50 msgs = 25 pares) ──
    const dbMessages = session
      ? await prisma.chatMessage.findMany({
          where:   { sessionId: session.id },
          orderBy: { createdAt: 'asc' },
          take:    52, // um pouco mais para ter pares completos
          select:  { role: true, content: true, imageDesc: true }
        })
      : [];

    // Converte para formato interno — injeta descrição da imagem no content
    const history = dbMessages.map(m => ({
      role:    m.role,
      content: m.imageDesc
        ? `[Imagem enviada — descrição: ${m.imageDesc}] ${m.content}`.trim()
        : m.content,
    }));

    // ── Contexto do banco ──
    const intent = detectIntent(message || '');

    const usuarioAtual = userId
      ? await prisma.usuario.findUnique({ where: { id: parseInt(userId) }, select: { id: true, nome: true, email: true, role: true } })
      : null;

    // SEMPRE busca todos os dados — a IA precisa do contexto completo para ser consistente
    // Sem isso ela responde "não há usuários" porque o array chega vazio
    const isOwner = userRole === 'OWNER';
    const uid     = usuarioAtual?.id;

    const [totalProdutos, totalDivergencias, totalUsuarios, usuariosBlockeados, produtos, divergencias, usuarios] = await Promise.all([
      prisma.produto.count(),
      prisma.divergencia.count({ where: { resolvido: false } }),
      prisma.usuario.count(),
      prisma.usuario.count({ where: { role: 'BLOQUEADO', ...(uid ? { id: { not: uid } } : {}) } }),
      // Produtos: sempre busca (contexto essencial)
      prisma.produto.findMany({
        select: { id: true, sku: true, nome: true, preco: true, pesoGramas: true, plataforma: true, eKit: true, mlItemId: true },
        orderBy: { id: 'desc' }, take: 20
      }),
      // Divergências: sempre busca
      prisma.divergencia.findMany({
        where: { resolvido: false },
        select: { id: true, mlItemId: true, motivo: true, plataforma: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 10
      }),
      // Usuários: OWNER vê todos, outros veem apenas dados básicos sem info sensível
      isOwner
        ? prisma.usuario.findMany({
            select: { id: true, nome: true, role: true, solicitouDesbloqueio: true },
            orderBy: { createdAt: 'desc' }
          })
        : prisma.usuario.findMany({
            where: { id: uid || -1 },
            select: { id: true, nome: true, role: true, solicitouDesbloqueio: true }
          }),
    ]);

    const usuariosPendentes = usuarios.filter(u => u.role === 'BLOQUEADO' && u.solicitouDesbloqueio && u.id !== usuarioAtual?.id).length;

    // ── Monta mensagem para IA (inclui contexto de imagem se houver) ──
    let messageForAI = message || '';
    if (imageDesc && !message) {
      messageForAI = '[usuário enviou uma imagem sem texto]';
    } else if (imageDesc && message) {
      messageForAI = message; // imagem já está no contexto via imageContext
    }

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

    // ── Salva resposta da IA no banco ──
    if (session) {
      await prisma.chatMessage.create({
        data: { sessionId: session.id, role: 'ia', content: reply }
      });

      // Auto-título: usa as primeiras palavras da primeira mensagem do usuário
      const msgCount = await prisma.chatMessage.count({ where: { sessionId: session.id, role: 'user' } });
      if (msgCount === 1 && message) {
        const titulo = message.substring(0, 40) + (message.length > 40 ? '…' : '');
        await prisma.chatSession.update({ where: { id: session.id }, data: { titulo } });
      } else {
        await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
      }
    }

    // ── Monta sources: extrai href + label de tags <a> geradas pela IA ──
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
// PRODUTOS
// ==========================================

app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({ include: { itensDoKit: { include: { produto: true } } }, orderBy: { id: 'desc' } });
    res.json(produtos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/produtos', async (req, res) => {
  try {
    const { sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma } = req.body;
    const produto = await prisma.produto.create({
      data: { sku, nome, mlItemId, eKit, plataforma: plataforma || 'Mercado Livre', preco: parseFloat(preco), pesoGramas: parseInt(pesoGramas, 10) }
    });
    res.status(201).json(produto);
  } catch { res.status(400).json({ error: 'Erro ao criar produto.' }); }
});

// ==========================================
// IA ANALYIZ — ANÁLISE PROATIVA DE PÁGINA
// Cache por userId+pageKey+hash dos dados reais
// ==========================================

// Armazena último hash de dados por userId:pageKey para detectar mudanças reais
const proactiveDataCache = {};

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return String(h);
}

app.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;

  console.log(`\n[IA Proativa] ===== Requisição recebida =====`);
  console.log(`[IA Proativa] userId: ${userId} | role: ${userRole} | page: ${pageKey}`);

  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) {
      console.log(`[IA Proativa] ❌ Requisição rejeitada (bloqueado ou sem chave)`);
      return res.json({ insight: null });
    }

    const isOwner = userRole === 'OWNER';
    const uid     = parseInt(userId);

    // ── Busca TODOS os dados relevantes do banco ──────────────────────────
    console.log(`[IA Proativa] 🔍 Buscando dados do banco para página: ${pageKey}`);

    const dataChunks = [];

    // 1. DIVERGÊNCIAS — todas as páginas
    {
      const total    = await prisma.divergencia.count({ where: { resolvido: false } });
      const recentes = await prisma.divergencia.findMany({
        where: { resolvido: false }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { mlItemId: true, motivo: true, plataforma: true, createdAt: true }
      });
      console.log(`[IA Proativa]   📊 Divergências abertas: ${total}`);
      if (total > 0) {
        dataChunks.push(`DIVERGÊNCIAS ABERTAS: ${total} total`);
        recentes.forEach(d => {
          dataChunks.push(`  • [${d.plataforma}] ${d.mlItemId}: ${d.motivo} (${new Date(d.createdAt).toLocaleDateString('pt-BR')})`);
        });
      } else {
        dataChunks.push('DIVERGÊNCIAS: Nenhuma aberta');
      }
    }

    // 2. PRODUTOS — com análise de integridade
    {
      const totalProd  = await prisma.produto.count();
      const kits       = await prisma.produto.count({ where: { eKit: true } });
      const semML      = await prisma.produto.count({ where: { mlItemId: null } });
      const semPeso    = await prisma.produto.count({ where: { pesoGramas: 0 } });
      console.log(`[IA Proativa]   📦 Produtos: ${totalProd} (${kits} kits, ${semML} sem ID ML, ${semPeso} peso=0)`);
      dataChunks.push(`PRODUTOS: ${totalProd} cadastrados | ${kits} kits | ${semML} sem ID do Mercado Livre | ${semPeso} com peso zero`);

      if (semML > 0 || semPeso > 0) {
        const problemáticos = await prisma.produto.findMany({
          where: { OR: [{ mlItemId: null }, { pesoGramas: 0 }] },
          select: { sku: true, nome: true, mlItemId: true, pesoGramas: true },
          take: 5
        });
        problemáticos.forEach(p => {
          const issues = [];
          if (!p.mlItemId)      issues.push('sem ID ML');
          if (p.pesoGramas === 0) issues.push('peso zero');
          dataChunks.push(`  ⚠️ [${p.sku}] ${p.nome}: ${issues.join(', ')}`);
        });
      }
    }

    // 3. USUÁRIOS — OWNER vê tudo, outros veem apenas seus próprios dados
    if (isOwner) {
      const totalUsers  = await prisma.usuario.count();
      const bloqueados  = await prisma.usuario.count({ where: { role: 'BLOQUEADO', id: { not: uid } } });
      const pendentes   = await prisma.usuario.findMany({
        where: { role: 'BLOQUEADO', solicitouDesbloqueio: true, id: { not: uid } },
        select: { nome: true, createdAt: true }, orderBy: { createdAt: 'desc' }
      });
      console.log(`[IA Proativa]   👥 Usuários: ${totalUsers} total | ${bloqueados} bloqueados | ${pendentes.length} aguardando desbloqueio`);
      dataChunks.push(`USUÁRIOS: ${totalUsers} cadastrados | ${bloqueados} bloqueados | ${pendentes.length} aguardando desbloqueio`);
      if (pendentes.length > 0) {
        pendentes.forEach(u => dataChunks.push(`  • ${u.nome} (solicitou em ${new Date(u.createdAt).toLocaleDateString('pt-BR')})`));
      }
    } else {
      // Usuário comum — só vê dados próprios
      const usuario = await prisma.usuario.findUnique({
        where: { id: uid },
        select: { nome: true, role: true, solicitouDesbloqueio: true }
      });
      if (usuario) {
        dataChunks.push(`SEUS DADOS: ${usuario.nome} | cargo: ${usuario.role}${usuario.solicitouDesbloqueio ? ' | desbloqueio solicitado' : ''}`);
      }
    }

    const fullContext = dataChunks.join('\n');
    console.log(`[IA Proativa] 📋 Contexto montado (${fullContext.length} chars)`);

    // ── Verifica se os dados mudaram desde o último insight ──────────────
    const cacheKey  = `${userId}:${pageKey}`;
    const dataHash  = simpleHash(fullContext);
    const lastHash  = proactiveDataCache[cacheKey]?.hash;
    const lastTime  = proactiveDataCache[cacheKey]?.time || 0;
    const elapsed   = Date.now() - lastTime;
    const minInterval = 5 * 60 * 1000; // 5 minutos entre insights da mesma página

    console.log(`[IA Proativa] 🔑 Hash atual: ${dataHash} | Anterior: ${lastHash || 'nenhum'} | Elapsed: ${Math.round(elapsed/1000)}s`);

    if (dataHash === lastHash && elapsed < minInterval) {
      console.log(`[IA Proativa] ⏭️  Dados iguais ao último insight — pulando`);
      return res.json({ insight: null });
    }

    // ── Gera insight com Gemini ──────────────────────────────────────────
    console.log(`[IA Proativa] 🤖 Gerando insight com Gemini...`);

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Você é a IA Analyiz. O usuário (${isOwner ? 'OWNER — vê tudo' : 'usuário comum'}) está na página "${pageKey}".

DADOS REAIS DO SISTEMA AGORA:
${fullContext}

TAREFA: Gere UMA mensagem proativa curta e direta (máx 3 linhas) que:
1. Comece EXATAMENTE com: "Tenho novos dados para você:"
2. Destaque o dado mais RELEVANTE e URGENTE (priorize problemas: divergências, produtos sem ML, usuários pendentes)
3. Cite números específicos dos dados acima
4. Termine com UMA pergunta curta "Quer ver os detalhes?"
5. Use emojis (📦⚠️👤✅🔍) quando couber
6. SOMENTE HTML: <b>negrito</b>, <br> — NUNCA asteriscos ou markdown
7. Se não há nada relevante para destacar, responda apenas: NULL`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.3, maxOutputTokens: 250 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const raw = response.text?.trim();
    console.log(`[IA Proativa] 💬 Resposta Gemini: ${raw?.substring(0, 80)}...`);

    if (!raw || raw === 'NULL' || raw.toUpperCase().includes('NULL')) {
      console.log(`[IA Proativa] ℹ️  Gemini indicou sem dados relevantes`);
      proactiveDataCache[cacheKey] = { hash: dataHash, time: Date.now() };
      return res.json({ insight: null });
    }

    const insight = raw
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')
      .trim();

    // Atualiza cache com hash atual
    proactiveDataCache[cacheKey] = { hash: dataHash, time: Date.now() };

    // Limpa entradas antigas (> 30 min)
    const now = Date.now();
    Object.keys(proactiveDataCache).forEach(k => {
      if (now - (proactiveDataCache[k]?.time || 0) > 30 * 60 * 1000) delete proactiveDataCache[k];
    });

    console.log(`[IA Proativa] ✅ Insight gerado e enviado para ${userId}`);
    res.json({ insight, pageKey });

  } catch (error) {
    console.error(`[IA Proativa] ❌ Erro:`, error.message);
    res.json({ insight: null });
  }
});

// ==========================================
// START
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API rodando na porta ${PORT}`));