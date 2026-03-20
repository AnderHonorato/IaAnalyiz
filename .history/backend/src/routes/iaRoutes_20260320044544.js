import express from 'express';
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
      // NÃO retorna imageBase64 (muito pesado) — só metadados
      select: { id: true, role: true, content: true, imageDesc: true, createdAt: true }
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// ── Chat principal ───────────────────────────────────────────────────────────
router.post('/api/ia/chat', async (req, res) => {
  // pageUrl vem separado — é usado como contexto interno, NUNCA aparece na mensagem exibida ao usuário
  const { message, pageUrl, sessionId, userRole, userId, imageBase64, imageMimeType, imageOnly } = req.body;

  try {
    if (userRole === 'BLOQUEADO') return res.json({ reply: 'Seu perfil está bloqueado. 🔒', sources: [] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: 'Chave API ausente.', sources: [] });

    let session = sessionId
      ? await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } })
      : await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' } });

    if (!session) {
      session = await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' } });
    }

    // Analisa imagem se enviada — pede descrição completa para dar contexto à IA
    let imageDesc = imageBase64
      ? await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', imageOnly ? '' : message)
      : null;

    // Salva mensagem LIMPA no banco — sem nenhuma referência de URL ou caminho
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role:      'user',
        content:   message || '',
        imageBase64: imageBase64 || null,
        imageDesc:   imageDesc  || null,
      }
    });

    // Atualiza título da sessão
    if (message && message.length > 3) {
      const msgCount = await prisma.chatMessage.count({ where: { sessionId: session.id } });
      if (msgCount <= 2) {
        const titulo = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        await prisma.chatSession.update({ where: { id: session.id }, data: { titulo } });
      }
    }

    // Busca histórico (sem imageBase64 para não estourar contexto)
    const dbMessages = await prisma.chatMessage.findMany({
      where:   { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take:    52,
      select:  { role: true, content: true, imageDesc: true }
    });

    const history = dbMessages.map(m => ({
      role:    m.role,
      // Não expõe o imageDesc como "recebi uma descrição" — usa ele apenas como contexto interno
      content: m.content || (m.imageDesc ? '[imagem]' : '')
    }));

    const uid    = parseInt(userId);
    const intent = detectIntent(message || (imageDesc ? 'imagem produto' : ''));
    const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

    // Busca dados do sistema para contexto da IA
    const [totalProdutos, totalDivergencias, produtos, divergencias, usuarioAtual, usuarios] = await Promise.all([
      prisma.produto.count({ where: { usuarioId: uid } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } } }),
      intent.needsProdutos
        ? prisma.produto.findMany({ where: { usuarioId: uid }, orderBy: { id: 'desc' }, take: 20 })
        : [],
      // Sempre busca divergências para ter contexto da página
      prisma.divergencia.findMany({ where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }),
      // Usuários pendentes SOMENTE para OWNER/ADMIN
      (isPrivileged && intent.needsUsuarios)
        ? prisma.usuario.findMany({ where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }, select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true } })
        : Promise.resolve([]),
    ]);

    // Busca pendentes para OWNER/ADMIN mesmo sem pedir explicitamente (para alertar)
    let pendentesGerais = [];
    if (isPrivileged) {
      pendentesGerais = await prisma.usuario.findMany({
        where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
        select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true }
      });
    }

    const { reply, sources } = await sendChatMessage(
      // Se for só imagem, passa instrução especial que não fica visível ao usuário
      imageOnly ? '[imagem_enviada_sem_texto]' : (message || '[imagem]'),
      history,
      {
        totalProdutos,
        totalDivergencias,
        userRole,
        produtos,
        divergencias,
        usuarios: pendentesGerais.length > 0 ? pendentesGerais : usuarios,
        usuarioAtual,
        imageContext: imageDesc,
        pageUrl: pageUrl || null,  // Passado para contexto interno da IA, nunca exposto ao usuário
        imageOnly: !!imageOnly,
      }
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
      config: { temperature: 0.3, maxOutputTokens: 150 },
      contents: [{
        role: 'user',
        parts: [{ text: `DADOS: ${context}\n\nGere 1 frase curta alertando o gestor sobre o que exige mais atenção. Foque na ação e no risco financeiro ou operacional. Seja direto, sem markdown, sem citar nome do sistema. Comece com 1 emoji relevante.` }]
      }]
    });

    const insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') || null;

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

    const prompt = `Você é um Consultor Logístico. Analise os dados e produza um relatório executivo objetivo.

DADOS: ${typeof dados === 'string' ? dados : JSON.stringify(dados)}

Produza em HTML limpo (apenas <b>, <ul>, <li>, <br>, <i>), em 3 seções curtas:
<b>Diagnóstico Geral</b>
<b>Pontos de Atenção</b>
<b>Recomendações</b>

IMPORTANTE: Comece DIRETAMENTE com o conteúdo. Sem frases introdutórias, sem "conforme solicitado", sem "aqui está", sem meta-comentários de formato.`;

    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.3, maxOutputTokens: 800 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    let conteudo = response.text?.trim() || '';

    // Remove qualquer meta-texto residual
    conteudo = conteudo
      .replace(/^(conforme\s+solicitado[^\n<]*[\n<])/im, '')
      .replace(/^(formatado\s+conforme[^\n<]*[\n<])/im, '')
      .replace(/^(aqui\s+está\s+o\s+relat[^\n<]*[\n<])/im, '')
      .replace(/^(segue\s+o\s+relat[^\n<]*[\n<])/im, '')
      .replace(/^(claro[,!][^\n<]*[\n<])/im, '')
      .replace(/^(com\s+base\s+nos\s+dados[^\n<]*[\n<])/im, '')
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