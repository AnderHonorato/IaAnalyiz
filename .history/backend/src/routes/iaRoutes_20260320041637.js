import express from 'express';
import { prisma } from '../prisma.js';
import { sendChatMessage, analyzeImage } from '../iaService.js';

const router = express.Router();
const lastInsightByUser = {};

function detectIntent(message) {
  const l = (message || '').toLowerCase();
  return {
    needsProdutos:    /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l),
    needsDivergencias:/divergên|divergen|anomalia|erro|peso|auditoria|varredura|inconsistên/i.test(l),
    needsUsuarios:    /usuário|usuario|acesso|desbloqueio|bloqueado|membro/i.test(l),
  };
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
router.get('/api/chat/sessions/:userId', async (req, res) => {
  try {
    res.json(await prisma.chatSession.findMany({
      where: { usuarioId: parseInt(req.params.userId) },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, titulo: true, createdAt: true, updatedAt: true }
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/chat/sessions', async (req, res) => {
  try {
    res.status(201).json(await prisma.chatSession.create({
      data: { usuarioId: parseInt(req.body.userId), titulo: req.body.titulo || 'Nova conversa' }
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.delete('/api/chat/sessions/:id', async (req, res) => {
  try { await prisma.chatSession.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Erro' }); }
});

router.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    res.json(await prisma.chatMessage.findMany({
      where: { sessionId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' },
      // Inclui imageBase64 para que o frontend possa exibir imagens recarregadas
      select: { id: true, role: true, content: true, imageBase64: true, imageDesc: true, createdAt: true }
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// ─── Chat principal ────────────────────────────────────────────────────────────
router.post('/api/ia/chat', async (req, res) => {
  // pageUrl é separado da mensagem para não aparecer no histórico do usuário
  const { message, pageUrl, sessionId, userRole, userId, imageBase64, imageMimeType } = req.body;

  try {
    if (userRole === 'BLOQUEADO') return res.json({ reply: 'Seu perfil está bloqueado. 🔒', sources: [] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: 'Chave API ausente.', sources: [] });

    let session = sessionId
      ? await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } })
      : await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' } });

    // Analisa imagem se enviada
    let imageDesc = imageBase64 ? await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', message) : null;

    // Salva APENAS a mensagem limpa do usuário (sem o contexto de URL)
    // Isso garante que o histórico visível não mostre a URL interna
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: message || '',
        imageBase64: imageBase64 || null,
        imageDesc: imageDesc || null
      }
    });

    // Busca histórico para contexto da IA
    const dbMessages = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 52,
      select: { role: true, content: true, imageDesc: true }
    });
    const history = dbMessages.map(m => ({
      role: m.role,
      content: m.imageDesc ? `[Imagem: ${m.imageDesc}] ${m.content}`.trim() : m.content
    }));

    const uid = parseInt(userId);
    const intent = detectIntent(message || '');

    // Busca dados do sistema conforme intent
    const [totalProdutos, totalDivergencias, produtos, divergencias, usuarioAtual, usuarios] = await Promise.all([
      prisma.produto.count({ where: { usuarioId: uid } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } } }),
      intent.needsProdutos
        ? prisma.produto.findMany({ where: { usuarioId: uid }, orderBy: { id: 'desc' }, take: 20 })
        : [],
      intent.needsDivergencias
        ? prisma.divergencia.findMany({ where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } }, orderBy: { createdAt: 'desc' }, take: 10 })
        : [],
      prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }),
      // Busca usuários bloqueados SOMENTE se for OWNER/ADMIN e a intent precisar
      (intent.needsUsuarios || userRole === 'OWNER' || userRole === 'ADMIN')
        ? prisma.usuario.findMany({ where: { role: 'BLOQUEADO', solicitouDesbloqueio: true }, select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true } })
        : []
    ]);

    // A IA recebe o contexto de página via pageUrl, não como parte da mensagem visível
    const contextualMessage = message || (imageDesc ? '[imagem enviada]' : '');

    const { reply, sources } = await sendChatMessage(contextualMessage, history, {
      totalProdutos,
      totalDivergencias,
      userRole,
      produtos,
      divergencias,
      usuarios,
      usuarioAtual,
      imageContext: imageDesc,
      pageUrl, // Passa a URL como contexto separado para o system instruction
    });

    // Salva resposta da IA
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'ia', content: reply }
    });

    // Atualiza título da sessão com a primeira mensagem se for nova
    if (!sessionId && message) {
      const titulo = message.substring(0, 60) + (message.length > 60 ? '...' : '');
      await prisma.chatSession.update({ where: { id: session.id }, data: { titulo } });
    }

    res.json({ reply, sessionId: session.id, sources });

  } catch (error) {
    console.error('[IA Chat Error]', error);
    res.status(500).json({ reply: 'Erro IA. ⚠️', sources: [] });
  }
});

// ─── Avisos proativos ──────────────────────────────────────────────────────────
router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;

  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) {
      return res.json({ insight: null });
    }

    const uid = parseInt(userId);
    let contextLines = [];

    // Divergências (todos os roles podem ver as próprias)
    if (pageKey === 'divergencias' || pageKey === 'dashboard') {
      const divs = await prisma.divergencia.findMany({
        where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      if (divs.length > 0) {
        contextLines.push(`Problemas de frete: ${divs.length} divergências ativas (${divs.filter(d => d.status === 'REINCIDENTE').length} reincidentes).`);
        divs.slice(0, 3).forEach(d => contextLines.push(`- Anúncio ${d.mlItemId}: ${d.motivo}`));
      } else {
        contextLines.push('Logística operando com 100% de eficiência. Sem divergências.');
      }
    }

    // Pendentes de desbloqueio SOMENTE para OWNER/ADMIN
    if ((userRole === 'OWNER' || userRole === 'ADMIN') && pageKey !== 'ml') {
      const pendentes = await prisma.usuario.count({
        where: { role: 'BLOQUEADO', solicitouDesbloqueio: true }
      });
      if (pendentes > 0) {
        contextLines.push(`${pendentes} usuário(s) aguardando desbloqueio de acesso.`);
      }
    }

    if (contextLines.length === 0) return res.json({ insight: null });

    const context = contextLines.join('\n');

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.3, maxOutputTokens: 200 },
      contents: [{
        role: 'user',
        parts: [{ text: `DADOS: ${context}\n\nGere 1 frase curta alertando o usuário sobre o que exige mais atenção. Foque na ação e no risco financeiro se aplicável. Seja direto. Comece com 1 emoji. Responda em português.` }]
      }]
    });

    let insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    res.json({ insight });

  } catch (error) {
    console.error('[Proactive IA Error]', error);
    res.json({ insight: null });
  }
});

// ─── Resumo Executivo ──────────────────────────────────────────────────────────
router.post('/api/ia/summary', async (req, res) => {
  const { userId, dados } = req.body;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Você é um Consultor Logístico. Analise os dados e produza um relatório executivo direto.
    
DADOS: ${JSON.stringify(dados)}

FORMATO DE SAÍDA (apenas HTML limpo, sem prefixos, sem meta-texto):
- Use <b> para destaques, <ul><li> para listas, <br> para quebras
- Organize em 3 seções com seus títulos em <b>
- Seja direto e acionável
- Não inclua frases como "conforme solicitado", "formatado", "segue abaixo" etc.
- Comece diretamente com o conteúdo do relatório`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.2, maxOutputTokens: 800 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    let conteudo = response.text?.trim();

    // Remove qualquer meta-texto que o modelo possa ter gerado no início
    conteudo = conteudo
      .replace(/^(aqui está|segue|conforme solicitado|formatado conforme|veja abaixo|relatório:)[^<\n]*/gi, '')
      .replace(/^(claro|certo|ok)[,!.]?\s*/gi, '')
      .trim();

    // Converte markdown para HTML
    conteudo = conteudo
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');

    // Salva no histórico
    await prisma.resumoIA.create({ data: { usuarioId: parseInt(userId), conteudo } });

    res.json({ conteudo });
  } catch (error) {
    console.error('[Summary Error]', error);
    res.status(500).json({ error: 'Erro ao gerar resumo.' });
  }
});

// ─── Histórico de Resumos ──────────────────────────────────────────────────────
router.get('/api/ia/summary/history', async (req, res) => {
  try {
    const historico = await prisma.resumoIA.findMany({
      where: { usuarioId: parseInt(req.query.userId) },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json(historico);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
});

// ─── GET proativo (compatibilidade) ───────────────────────────────────────────
router.get('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.query;
  try {
    if (!userId || !process.env.GEMINI_API_KEY) return res.json({ insight: null });

    const uid = parseInt(userId);
    const data = await prisma.divergencia.findMany({
      where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      take: 5
    });

    if (!data || data.length === 0) return res.json({ insight: null });

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { temperature: 0.3, maxOutputTokens: 150 },
      contents: [{ role: 'user', parts: [{ text: `Dados: ${data.length} divergências de frete ativas. Crie 1 alerta curto com emoji para o usuário. Em português.` }] }]
    });

    let insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    res.json({ insight });
  } catch { res.json({ insight: null }); }
});

export default router;import express from 'express';
import { prisma } from '../prisma.js';
import { sendChatMessage, analyzeImage } from '../iaService.js';

const router = express.Router();

function detectIntent(message) {
  const l = (message || '').toLowerCase();
  return {
    needsProdutos:     /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l),
    needsDivergencias: /divergên|divergen|anomalia|erro|peso|auditoria|varredura|inconsistên/i.test(l),
    needsUsuarios:     /usuário|usuario|desbloqueio|acesso|pendente|bloqueado/i.test(l),
  };
}

// ── Sessões de chat ──────────────────────────────────────────────────────────
router.get('/api/chat/sessions/:userId', async (req, res) => {
  try {
    res.json(await prisma.chatSession.findMany({
      where: { usuarioId: parseInt(req.params.userId) },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, titulo: true, createdAt: true, updatedAt: true }
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/chat/sessions', async (req, res) => {
  try {
    res.status(201).json(await prisma.chatSession.create({
      data: { usuarioId: parseInt(req.body.userId), titulo: req.body.titulo || 'Nova conversa' }
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.delete('/api/chat/sessions/:id', async (req, res) => {
  try { await prisma.chatSession.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Erro' }); }
});

router.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    res.json(await prisma.chatMessage.findMany({
      where: { sessionId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, imageBase64: true, imageDesc: true, createdAt: true }
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// ── Chat principal ───────────────────────────────────────────────────────────
router.post('/api/ia/chat', async (req, res) => {
  // pageUrl vem separado da mensagem — NÃO é exibido para o usuário
  const { message, pageUrl, sessionId, userRole, userId, imageBase64, imageMimeType } = req.body;

  try {
    if (userRole === 'BLOQUEADO') return res.json({ reply: 'Seu perfil está bloqueado. 🔒', sources: [] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: 'Chave API ausente.', sources: [] });

    let session = sessionId
      ? await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } })
      : await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' } });

    if (!session) {
      session = await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' } });
    }

    // Analisa imagem se enviada
    let imageDesc = imageBase64
      ? await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', message)
      : null;

    // Salva mensagem LIMPA no banco (sem prefixo de URL)
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role:      'user',
        content:   message || '',
        imageBase64: imageBase64 || null,
        imageDesc:   imageDesc  || null,
      }
    });

    // Atualiza título da sessão com a primeira mensagem real
    if (message && message.length > 3) {
      const msgCount = await prisma.chatMessage.count({ where: { sessionId: session.id } });
      if (msgCount <= 2) {
        const titulo = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        await prisma.chatSession.update({ where: { id: session.id }, data: { titulo } });
      }
    }

    // Busca histórico
    const dbMessages = await prisma.chatMessage.findMany({
      where:   { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take:    52,
      select:  { role: true, content: true, imageDesc: true }
    });
    const history = dbMessages.map(m => ({
      role:    m.role,
      content: m.imageDesc ? `[Imagem: ${m.imageDesc}] ${m.content}`.trim() : m.content
    }));

    const uid    = parseInt(userId);
    const intent = detectIntent(message || '');
    const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

    const [totalProdutos, totalDivergencias, produtos, divergencias, usuarioAtual, usuarios] = await Promise.all([
      prisma.produto.count({ where: { usuarioId: uid } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
      intent.needsProdutos
        ? prisma.produto.findMany({ where: { usuarioId: uid }, orderBy: { id: 'desc' }, take: 20 })
        : [],
      intent.needsDivergencias
        ? prisma.divergencia.findMany({ where: { usuarioId: uid, status: 'PENDENTE' }, orderBy: { createdAt: 'desc' }, take: 10 })
        : [],
      prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }),
      // Busca usuários pendentes SOMENTE para OWNER/ADMIN
      (isPrivileged && intent.needsUsuarios)
        ? prisma.usuario.findMany({ where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }, select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true } })
        : Promise.resolve([]),
    ]);

    const { reply, sources } = await sendChatMessage(
      message || (imageDesc ? '[imagem]' : ''),
      history,
      { totalProdutos, totalDivergencias, userRole, produtos, divergencias, usuarios, usuarioAtual, imageContext: imageDesc, pageUrl: pageUrl || null }
    );

    // Salva resposta da IA
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'ia', content: reply }
    });

    res.json({ reply, sessionId: session.id, sources });

  } catch (error) {
    console.error('[IA Chat]', error);
    res.status(500).json({ reply: 'Erro IA. ⚠️', sources: [] });
  }
});

// ── Insights proativos ───────────────────────────────────────────────────────
router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY)
      return res.json({ insight: null });

    const uid          = parseInt(userId);
    const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
    let contextLines   = [];

    if (pageKey === 'divergencias' || pageKey === 'dashboard') {
      const divs = await prisma.divergencia.findMany({
        where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      if (divs.length > 0) {
        contextLines.push(`Problemas Críticos: ${divs.length} divergências ativas.`);
        divs.slice(0, 5).forEach(d =>
          contextLines.push(`- Anúncio ${d.mlItemId}: ${d.motivo} (Status: ${d.status})`));
      } else {
        contextLines.push('Logística operando com 100% de eficiência. Sem divergências ativas.');
      }
    }

    // Usuários pendentes SOMENTE para OWNER/ADMIN
    if (isPrivileged && (pageKey === 'usuarios' || pageKey === 'dashboard')) {
      const pendentes = await prisma.usuario.findMany({
        where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }
      });
      if (pendentes.length > 0) {
        contextLines.push(`${pendentes.length} usuário(s) aguardando aprovação de acesso.`);
      }
    }

    if (contextLines.length === 0) return res.json({ insight: null });

    const context = contextLines.join('\n');

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model:  'gemini-2.5-flash',
      config: { temperature: 0.3, maxOutputTokens: 200 },
      contents: [{
        role: 'user',
        parts: [{ text: `DADOS: ${context}\n\nGere 1 frase curta alertando o gestor sobre o que exige mais atenção. Foque na ação e no risco financeiro ou operacional. Seja direto, sem markdown. Comece com 1 emoji relevante.` }]
      }]
    });

    const insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') || null;

    // Deduplicação simples no servidor para não repetir o mesmo insight
    if (!insight) return res.json({ insight: null });

    res.json({ insight });

  } catch (error) {
    console.error('[Proactive]', error);
    res.json({ insight: null });
  }
});

// ── Resumo executivo ─────────────────────────────────────────────────────────
router.post('/api/ia/summary', async (req, res) => {
  const { userId, dados } = req.body;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Você é um Consultor Logístico Senior. Analise os dados abaixo e produza um relatório executivo.

DADOS: ${typeof dados === 'string' ? dados : JSON.stringify(dados)}

Produza o relatório em HTML limpo (apenas <b>, <ul>, <li>, <br>, <i>), organizado em 3 seções:
<b>Diagnóstico Geral</b>
<b>Pontos de Atenção</b>
<b>Recomendações</b>

IMPORTANTE: Não inclua frases como "conforme solicitado", "como pedido", "formatado como", nem qualquer comentário sobre o formato. Comece diretamente com o conteúdo do relatório.`;

    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.3, maxOutputTokens: 1000 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    let conteudo = response.text?.trim() || '';

    // Remove meta-texto que a IA possa ter gerado
    conteudo = conteudo
      .replace(/^(conforme\s+solicitado[^<\n]*[:\n])/im, '')
      .replace(/^(formatado\s+conforme[^<\n]*[:\n])/im, '')
      .replace(/^(aqui\s+está\s+o\s+relat[^<\n]*[:\n])/im, '')
      .replace(/^(segue\s+o\s+relat[^<\n]*[:\n])/im, '')
      .trim();

    await prisma.resumoIA.create({ data: { usuarioId: parseInt(userId), conteudo } });

    res.json({ conteudo });

  } catch (error) {
    console.error('[Summary]', error);
    res.status(500).json({ error: 'Erro ao gerar resumo.' });
  }
});

// ── Histórico de resumos ─────────────────────────────────────────────────────
router.get('/api/ia/summary/history', async (req, res) => {
  try {
    const historico = await prisma.resumoIA.findMany({
      where:   { usuarioId: parseInt(req.query.userId) },
      orderBy: { createdAt: 'desc' },
      take:    10
    });
    res.json(historico);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
});

export default router;