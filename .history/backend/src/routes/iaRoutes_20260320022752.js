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
        parts: [{ text: `Você é o Analista Logístico Sênior do sistema.
DADOS REAIS DA OPERAÇÃO AGORA:
${context}

SUA TAREFA:
Gere UM único parágrafo muito curto (máximo de 20 palavras) alertando o dono do e-commerce sobre o que exige mais atenção imediata nos dados acima.
Foque na ação e no risco financeiro (cobranças do ML). Seja altamente profissional e direto.

REGRAS ABSOLUTAS:
1. NUNCA use "Olá", "Temos" ou saudações genéricas. Vá direto ao ponto.
2. Não divida em tópicos nem use quebras de linha.
3. Comece a frase com UM único emoji que represente o status (ex: ⚠️, 🚨, ✅, 📉).
4. Exemplo correto: "⚠️ 3 anúncios estão com divergência de peso; corrija imediatamente para evitar cobranças indevidas de frete do Mercado Livre."` 
        }] 
      }] 
    });
    
    // Remove as tags de negrito e qualquer "Olá" que a IA insistir em colocar
    let insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    
    res.json({ insight });
  } catch (error) { 
    console.error('ERRO IA proativa:', error.message); 
    res.json({ insight: null }); 
  }
});

export default router;