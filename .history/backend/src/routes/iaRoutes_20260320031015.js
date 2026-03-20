import express from 'express';
import { prisma } from '../prisma.js';
import { sendChatMessage, analyzeImage } from '../iaService.js';

const router = express.Router();
const lastInsightByUser = {};

function detectIntent(message) {
  const l = message.toLowerCase();
  return { needsProdutos: /produto|sku|peso|kit|estoque|catálog|ml|mercado livre|anúncio|preço/i.test(l), needsDivergencias: /divergên|divergen|anomalia|erro|peso|auditoria|varredura|inconsistên/i.test(l) };
}

router.get('/api/chat/sessions/:userId', async (req, res) => {
  try { res.json(await prisma.chatSession.findMany({ where: { usuarioId: parseInt(req.params.userId) }, orderBy: { updatedAt: 'desc' }, select: { id: true, titulo: true, createdAt: true, updatedAt: true } })); } catch { res.status(500).json({ error: 'Erro.' }); }
});
router.post('/api/chat/sessions', async (req, res) => {
  try { res.status(201).json(await prisma.chatSession.create({ data: { usuarioId: parseInt(req.body.userId), titulo: req.body.titulo || 'Nova conversa' } })); } catch { res.status(500).json({ error: 'Erro.' }); }
});
router.delete('/api/chat/sessions/:id', async (req, res) => { try { await prisma.chatSession.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); } catch { res.status(500).json({ error: 'Erro' }); } });
router.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try { res.json(await prisma.chatMessage.findMany({ where: { sessionId: parseInt(req.params.id) }, orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, imageBase64: true, imageDesc: true, createdAt: true } })); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/ia/chat', async (req, res) => {
  const { message, sessionId, userRole, userId, imageBase64, imageMimeType } = req.body;
  try {
    if (userRole === 'BLOQUEADO') return res.json({ reply: 'Seu perfil está bloqueado. 🔒', sources: [] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: 'Chave API ausente.', sources: [] });
    let session = sessionId ? await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } }) : await prisma.chatSession.create({ data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' } });
    let imageDesc = imageBase64 ? await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', message) : null;
    await prisma.chatMessage.create({ data: { sessionId: session.id, role: 'user', content: message || '', imageBase64: imageBase64 || null, imageDesc: imageDesc || null } });
    const dbMessages = await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' }, take: 52, select: { role: true, content: true, imageDesc: true } });
    const history = dbMessages.map(m => ({ role: m.role, content: m.imageDesc ? `[Imagem: ${m.imageDesc}] ${m.content}`.trim() : m.content }));
    const uid = parseInt(userId); const intent = detectIntent(message || '');
    const [totalProdutos, totalDivergencias, produtos, divergencias, usuarioAtual] = await Promise.all([ prisma.produto.count({ where: { usuarioId: uid } }), prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }), intent.needsProdutos ? prisma.produto.findMany({ where: { usuarioId: uid }, orderBy: { id: 'desc' }, take: 20 }) : [], intent.needsDivergencias ? prisma.divergencia.findMany({ where: { usuarioId: uid, status: 'PENDENTE' }, orderBy: { createdAt: 'desc' }, take: 10 }) : [], prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }) ]);
    const reply = await sendChatMessage(message || (imageDesc ? '[imagem]' : ''), history, { totalProdutos, totalDivergencias, userRole, produtos, divergencias, usuarioAtual, imageContext: imageDesc });
    await prisma.chatMessage.create({ data: { sessionId: session.id, role: 'ia', content: reply } });
    res.json({ reply, sessionId: session.id, sources: [] });
  } catch (error) { res.status(500).json({ reply: 'Erro IA. ⚠️', sources: [] }); }
});

// AVISOS PROATIVOS EM TEMPO REAL
router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) return res.json({ insight: null });
    const uid = parseInt(userId); let contextLines = [];
    
    if (pageKey === 'divergencias' || pageKey === 'dashboard') {
      const divs = await prisma.divergencia.findMany({ where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } }, orderBy: { createdAt: 'desc' }, take: 10 });
      if (divs.length > 0) {
        contextLines.push(`Problemas Críticos: ${divs.length} divergências.`);
        divs.forEach(d => contextLines.push(`- Anúncio ${d.mlItemId}: ${d.motivo} (Status atual: ${d.status})`));
      } else {
        contextLines.push('Logística operando com 100% de eficiência. Sem divergências.');
      }
    }
    
    if (contextLines.length === 0) return res.json({ insight: null });
    const context = contextLines.join('\n');
    
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({ 
      model: 'gemini-2.5-flash', 
      config: { temperature: 0.3, maxOutputTokens: 300 }, 
      contents: [{ 
        role: 'user', 
        parts: [{ text: `DADOS: ${context}\n\nGere 1 frase curta alertando o dono sobre o que exige mais atenção acima. Foque na ação e no risco financeiro. Seja direto. Comece com 1 emoji.` }] 
      }] 
    });
    
    let insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    res.json({ insight });
  } catch (error) { res.json({ insight: null }); }
});

// GERAR RESUMO DETALHADO (NOVO BOTÃO "RESUMIR")
router.post('/api/ia/summary', async (req, res) => {
  const { userId, dados } = req.body;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `Atue como um Consultor Logístico. Faça um resumo estratégico dos dados da tela atual do sistema:
    ${JSON.stringify(dados)}
    Formate o texto de forma profissional, em HTML limpo (apenas <b>, <ul>, <li>, <br>), organizando em: 
    1. Diagnóstico Geral
    2. Pontos de Atenção (Divergências)
    3. Recomendações de Ação.`;

    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const conteudo = response.text?.trim();

    // Salva no banco de dados o histórico
    await prisma.resumoIA.create({ data: { usuarioId: parseInt(userId), conteudo } });
    
    res.json({ conteudo });
  } catch (error) { res.status(500).json({ error: 'Erro ao gerar resumo.' }); }
});

// BUSCAR HISTÓRICO DE RESUMOS
router.get('/api/ia/summary/history', async (req, res) => {
  try {
    const historico = await prisma.resumoIA.findMany({ where: { usuarioId: parseInt(req.query.userId) }, orderBy: { createdAt: 'desc' }, take: 10 });
    res.json(historico);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar histórico.' }); }
});

export default router;