import express from 'express';
import { prisma } from '../prisma.js';
import { sendChatMessage, analyzeImage } from '../iaService.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE DE ROTEAMENTO INTELIGENTE DE DADOS
//
// Fluxo:
//   Fase 1 — Router: manda a pergunta + schema (só títulos/colunas) ao Gemini.
//            Gemini decide quais tabelas são relevantes (ou nenhuma).
//   Fase 2 — Fetch: busca APENAS as tabelas indicadas no banco.
//   Fase 3 — Answer: manda tudo ao Gemini para elaborar a resposta final.
//
// Isso evita carregar dados irrelevantes, reduz tokens e torna a IA mais precisa.
// ═══════════════════════════════════════════════════════════════════════════

// ── Schema de catálogo de dados disponíveis ──────────────────────────────────
// Apenas nomes e descrições — SEM conteúdo real do banco
const DATA_CATALOG = {
  produtos: {
    label:   'Catálogo de Produtos',
    desc:    'Lista de produtos cadastrados com SKU, nome, peso, preço, kit, plataforma, ID ML vinculado.',
    colunas: ['id', 'sku', 'nome', 'preco', 'pesoGramas', 'eKit', 'mlItemId', 'plataforma', 'categoria', 'status'],
  },
  divergencias: {
    label:   'Divergências de Peso / Frete',
    desc:    'Anúncios com peso declarado no ML diferente do cadastro local. Tem status: PENDENTE, REINCIDENTE, CORRIGIDO, IGNORADO.',
    colunas: ['id', 'mlItemId', 'titulo', 'motivo', 'pesoMl', 'pesoLocal', 'status', 'plataforma', 'createdAt'],
  },
  divergencias_stats: {
    label:   'Estatísticas de Divergências',
    desc:    'Totais agrupados por status (pendente, reincidente, corrigido, ignorado) e total geral.',
    colunas: ['pendente', 'reincidente', 'corrigido', 'ignorado', 'total'],
  },
  usuarios: {
    label:   'Usuários do Sistema',
    desc:    'Usuários cadastrados, seus cargos (role), status de bloqueio e solicitações de acesso pendentes.',
    colunas: ['id', 'nome', 'email', 'role', 'solicitouDesbloqueio', 'createdAt'],
    privileged: true, // Só OWNER/ADMIN
  },
  precificacao_historico: {
    label:   'Histórico de Alterações de Preço',
    desc:    'Registro de todas as atualizações de preço feitas em anúncios ML, com data e valor anterior/novo.',
    colunas: ['mlItemId', 'titulo', 'preco', 'quantidade', 'categoriaId', 'criadoEm'],
  },
  categorias_ml: {
    label:   'Categorias de Anúncios ML',
    desc:    'Categorias dos anúncios do Mercado Livre vinculados à conta do usuário.',
    colunas: ['categoriaId', 'nome'],
  },
  resumos_ia: {
    label:   'Histórico de Relatórios Executivos',
    desc:    'Relatórios gerados pela IA sobre a operação logística do usuário.',
    colunas: ['conteudo', 'createdAt'],
  },
};

// ── Gemini helper (leve, só texto, sem histórico) ─────────────────────────────
async function geminiQuick(prompt, maxTokens = 200) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model:    'gemini-2.5-flash',
    config:   { temperature: 0.1, maxOutputTokens: maxTokens },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return (response.text || '').trim();
}

// ── Fase 1: Router — quais tabelas são necessárias? ───────────────────────────
async function routeDataNeeded(userMessage, userId, userRole) {
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  // Filtra catálogo por permissão
  const catalogoFiltrado = Object.entries(DATA_CATALOG)
    .filter(([, v]) => !v.privileged || isPrivileged)
    .map(([key, v]) => `- ${key}: ${v.label} — ${v.desc} | Colunas: ${v.colunas.join(', ')}`)
    .join('\n');

  const prompt = `Você é um roteador de dados para um sistema de gestão logística de e-commerce.

O usuário enviou a seguinte mensagem:
"""
${userMessage}
"""

Abaixo estão as tabelas de dados disponíveis no sistema (apenas metadados, sem conteúdo real):
${catalogoFiltrado}

Tarefa:
1. A mensagem do usuário tem relação com alguma(s) dessas tabelas? Responda APENAS com JSON válido, sem markdown, sem explicação.
2. Se SIM, liste as chaves das tabelas necessárias (máximo 3 mais relevantes).
3. Se NÃO, responda indicando que não há dados relevantes.

Formato de resposta obrigatório (JSON puro):
{
  "relevante": true ou false,
  "tabelas": ["chave1", "chave2"],
  "raciocinio": "frase curta explicando por que essas tabelas"
}

Se não for relevante:
{
  "relevante": false,
  "tabelas": [],
  "raciocinio": "frase curta do que a pergunta é sobre"
}`;

  try {
    const raw  = await geminiQuick(prompt, 250);
    // Remove possíveis backticks de markdown se o modelo errar
    const json = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch (e) {
    console.warn('[Router] Falha ao parsear JSON do router:', e.message);
    // Fallback conservador: não carrega nada
    return { relevante: false, tabelas: [], raciocinio: 'Falha no roteamento' };
  }
}

// ── Fase 2: Fetch — busca seletiva no banco ───────────────────────────────────
async function fetchSelectedData(tabelas, userId, userRole) {
  const uid  = parseInt(userId);
  const data = {};

  for (const tabela of tabelas) {
    try {
      switch (tabela) {

        case 'produtos':
          data.produtos = await prisma.produto.findMany({
            where:   { usuarioId: uid },
            orderBy: { id: 'desc' },
            take:    30,
            select:  { id: true, sku: true, nome: true, preco: true, pesoGramas: true, eKit: true, mlItemId: true, plataforma: true, categoria: true, status: true },
          });
          break;

        case 'divergencias':
          data.divergencias = await prisma.divergencia.findMany({
            where:   { usuarioId: uid },
            orderBy: { createdAt: 'desc' },
            take:    20,
            select:  { id: true, mlItemId: true, titulo: true, motivo: true, pesoMl: true, pesoLocal: true, status: true, plataforma: true, createdAt: true },
          });
          break;

        case 'divergencias_stats': {
          const [pendente, reincidente, corrigido, ignorado] = await Promise.all([
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
          ]);
          data.divergencias_stats = { pendente, reincidente, corrigido, ignorado, total: pendente + reincidente + corrigido + ignorado };
          break;
        }

        case 'usuarios':
          if (userRole === 'OWNER' || userRole === 'ADMIN') {
            data.usuarios = await prisma.usuario.findMany({
              orderBy: { createdAt: 'desc' },
              take:    30,
              select:  { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true, createdAt: true },
            });
          }
          break;

        case 'precificacao_historico':
          data.precificacao_historico = await prisma.precificacaoHistorico.findMany({
            where:   { usuarioId: uid },
            orderBy: { criadoEm: 'desc' },
            take:    20,
          }).catch(() => []); // Tabela pode não existir ainda
          break;

        case 'categorias_ml':
          data.categorias_ml = await prisma.mlCategoria.findMany({
            where: { usuarioId: uid },
            orderBy: { nome: 'asc' },
          }).catch(() => []);
          break;

        case 'resumos_ia':
          data.resumos_ia = await prisma.resumoIA.findMany({
            where:   { usuarioId: uid },
            orderBy: { createdAt: 'desc' },
            take:    5,
            select:  { conteudo: true, createdAt: true },
          });
          break;

        default:
          console.warn('[Fetch] Tabela desconhecida solicitada:', tabela);
      }
    } catch (e) {
      console.warn(`[Fetch] Erro ao buscar tabela "${tabela}":`, e.message);
    }
  }

  return data;
}

// ── Auxiliar: monta bloco de contexto legível para o Gemini ──────────────────
function formatDataContext(data, roteamento) {
  if (!data || Object.keys(data).length === 0) return null;

  const lines = [];
  lines.push(`[Raciocínio do sistema: ${roteamento.raciocinio}]`);
  lines.push('');

  for (const [key, value] of Object.entries(data)) {
    const schema = DATA_CATALOG[key];
    lines.push(`=== ${schema?.label || key} ===`);
    if (Array.isArray(value)) {
      lines.push(`Total: ${value.length} registros`);
      // Serializa de forma compacta
      value.forEach((row, i) => {
        lines.push(`${i + 1}. ${JSON.stringify(row)}`);
      });
    } else {
      lines.push(JSON.stringify(value, null, 2));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTAS DE CHAT
// ═══════════════════════════════════════════════════════════════════════════

// ── Sessões de chat ──────────────────────────────────────────────────────────
router.get('/api/chat/sessions/:userId', async (req, res) => {
  try {
    res.json(await prisma.chatSession.findMany({
      where:   { usuarioId: parseInt(req.params.userId) },
      orderBy: { updatedAt: 'desc' },
      select:  { id: true, titulo: true, createdAt: true, updatedAt: true },
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.post('/api/chat/sessions', async (req, res) => {
  try {
    res.status(201).json(await prisma.chatSession.create({
      data: { usuarioId: parseInt(req.body.userId), titulo: req.body.titulo || 'Nova conversa' },
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
      where:   { sessionId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, role: true, content: true, imageDesc: true, createdAt: true },
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// ── Chat principal com pipeline de 2 fases ───────────────────────────────────
router.post('/api/ia/chat', async (req, res) => {
  const { message, pageUrl, sessionId, userRole, userId, imageBase64, imageMimeType, imageOnly } = req.body;

  try {
    if (userRole === 'BLOQUEADO') return res.json({ reply: 'Seu perfil está bloqueado. 🔒', sources: [] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: 'Chave API ausente.', sources: [] });

    // ── Garante sessão ────────────────────────────────────────────────────
    let session = sessionId
      ? await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } })
      : null;

    if (!session) {
      session = await prisma.chatSession.create({
        data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' },
      });
    }

    // ── Analisa imagem se enviada ─────────────────────────────────────────
    const imageDesc = imageBase64
      ? await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', imageOnly ? '' : message)
      : null;

    // ── Salva mensagem do usuário no banco ────────────────────────────────
    await prisma.chatMessage.create({
      data: {
        sessionId:   session.id,
        role:        'user',
        content:     message || '',
        imageBase64: imageBase64 || null,
        imageDesc:   imageDesc  || null,
      },
    });

    // ── Atualiza título da sessão (nas primeiras mensagens) ───────────────
    if (message && message.length > 3) {
      const msgCount = await prisma.chatMessage.count({ where: { sessionId: session.id } });
      if (msgCount <= 2) {
        await prisma.chatSession.update({
          where: { id: session.id },
          data:  { titulo: message.substring(0, 50) + (message.length > 50 ? '...' : '') },
        });
      }
    }

    // ── Busca histórico da conversa (sem imageBase64 para não explodir tokens) ──
    const dbMessages = await prisma.chatMessage.findMany({
      where:   { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take:    52,
      select:  { role: true, content: true, imageDesc: true },
    });

    const history = dbMessages.map(m => ({
      role:    m.role,
      content: m.content || (m.imageDesc ? '[imagem]' : ''),
    }));

    // ── FASE 1: Roteamento — quais dados são necessários? ─────────────────
    const mensagemEfetiva = imageOnly
      ? (imageDesc ? `[Usuário enviou uma imagem. Conteúdo detectado: ${imageDesc}]` : '[Usuário enviou uma imagem sem texto]')
      : (message || '[imagem]');

    let roteamento = { relevante: false, tabelas: [], raciocinio: 'Sem dados necessários' };
    let dataContext = null;

    // Só executa o roteamento se tiver uma mensagem real para analisar
    if (mensagemEfetiva && !imageOnly) {
      try {
        roteamento = await routeDataNeeded(mensagemEfetiva, userId, userRole);
        console.log(`[Router] relevante=${roteamento.relevante} | tabelas=${roteamento.tabelas.join(',')} | ${roteamento.raciocinio}`);
      } catch (e) {
        console.warn('[Router] Fase 1 falhou, continua sem dados:', e.message);
      }
    }

    // ── FASE 2: Fetch seletivo ────────────────────────────────────────────
    if (roteamento.relevante && roteamento.tabelas.length > 0) {
      const dadosBrutos = await fetchSelectedData(roteamento.tabelas, userId, userRole);
      dataContext = formatDataContext(dadosBrutos, roteamento);
    }

    // ── Dados mínimos sempre presentes (counts para o system prompt) ──────
    const [totalProdutos, totalDivergencias, usuarioAtual] = await Promise.all([
      prisma.produto.count({ where: { usuarioId: parseInt(userId) } }),
      prisma.divergencia.count({ where: { usuarioId: parseInt(userId), status: { in: ['PENDENTE', 'REINCIDENTE'] } } }),
      prisma.usuario.findUnique({ where: { id: parseInt(userId) }, select: { id: true, nome: true, role: true } }),
    ]);

    // Pendentes para OWNER/ADMIN (alerta proativo, sempre presente)
    let pendentesGerais = [];
    if (userRole === 'OWNER' || userRole === 'ADMIN') {
      pendentesGerais = await prisma.usuario.findMany({
        where:  { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
        select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true },
      });
    }

    // ── FASE 3: Resposta final ────────────────────────────────────────────
    const { reply, sources } = await sendChatMessage(
      mensagemEfetiva,
      history,
      {
        totalProdutos,
        totalDivergencias,
        userRole,
        // Passa dados reais apenas se o roteador indicou relevância
        // Caso contrário, arrays vazios → IA responde sem contexto de banco
        produtos:      [],
        divergencias:  [],
        usuarios:      pendentesGerais,
        usuarioAtual,
        imageContext:  imageDesc,
        pageUrl:       pageUrl || null,
        imageOnly:     !!imageOnly,
        // Bloco de dados selecionados — injetado no system prompt via campo extra
        dataContext,
        roteamentoInfo: roteamento.relevante
          ? `Dados carregados: ${roteamento.tabelas.join(', ')} — ${roteamento.raciocinio}`
          : null,
      }
    );

    // ── Salva resposta da IA ──────────────────────────────────────────────
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'ia', content: reply },
    });

    res.json({ reply, sessionId: session.id, sources });

  } catch (error) {
    console.error('[IA Chat]', error);
    res.status(500).json({ reply: 'Erro IA. ⚠️', sources: [] });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHTS PROATIVOS
// ═══════════════════════════════════════════════════════════════════════════

router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY)
      return res.json({ insight: null });

    const uid          = parseInt(userId);
    const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
    const contextLines = [];

    if (pageKey === 'divergencias' || pageKey === 'dashboard') {
      const divs = await prisma.divergencia.findMany({
        where:   { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
        orderBy: { createdAt: 'desc' },
        take:    10,
      });
      if (divs.length > 0) {
        contextLines.push(`Problemas Críticos: ${divs.length} divergências ativas.`);
        divs.slice(0, 5).forEach(d =>
          contextLines.push(`- Anúncio ${d.mlItemId}: ${d.motivo} (Status: ${d.status})`));
      } else {
        contextLines.push('Logística operando com 100% de eficiência. Sem divergências ativas.');
      }
    }

    if (isPrivileged && (pageKey === 'usuarios' || pageKey === 'dashboard')) {
      const pendentes = await prisma.usuario.findMany({
        where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
      });
      if (pendentes.length > 0) {
        contextLines.push(`${pendentes.length} usuário(s) aguardando aprovação de acesso.`);
      }
    }

    if (contextLines.length === 0) return res.json({ insight: null });

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.3, maxOutputTokens: 150 },
      contents: [{ role: 'user', parts: [{ text: `DADOS: ${contextLines.join('\n')}\n\nGere 1 frase curta alertando o gestor sobre o que exige mais atenção. Foque na ação e no risco financeiro ou operacional. Seja direto, sem markdown, sem citar nome do sistema. Comece com 1 emoji relevante.` }] }],
    });

    const insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') || null;
    res.json({ insight: insight || null });

  } catch (error) {
    console.error('[Proactive]', error);
    res.json({ insight: null });
  }
});

// ── GET proativo (compatibilidade com chamadas GET do MercadoLivre.jsx) ──────
router.get('/api/ia/proactive', async (req, res) => {
  req.body = { userId: req.query.userId, userRole: req.query.userRole, pageKey: req.query.pageKey };
  // Redireciona internamente para o handler POST
  const { userId, userRole, pageKey } = req.query;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY)
      return res.json({ insight: null });

    const uid = parseInt(userId);
    const contextLines = [];

    const divs = await prisma.divergencia.findMany({
      where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      orderBy: { createdAt: 'desc' }, take: 10,
    });

    if (divs.length > 0) {
      contextLines.push(`${divs.length} divergências ativas de peso/frete.`);
      divs.slice(0, 3).forEach(d => contextLines.push(`- ${d.mlItemId}: ${d.motivo}`));
    }

    if (contextLines.length === 0) return res.json({ insight: null });

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.3, maxOutputTokens: 100 },
      contents: [{ role: 'user', parts: [{ text: `DADOS: ${contextLines.join('\n')}\nGere 1 alerta curto para o gestor. Sem markdown. 1 emoji.` }] }],
    });

    res.json({ insight: response.text?.trim() || null });
  } catch { res.json({ insight: null }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// RESUMO EXECUTIVO
// ═══════════════════════════════════════════════════════════════════════════

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

IMPORTANTE: Comece DIRETAMENTE com o conteúdo. Sem frases introdutórias.`;

    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.3, maxOutputTokens: 800 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    let conteudo = (response.text || '').trim()
      .replace(/^(conforme\s+solicitado[^\n<]*[\n<])/im, '')
      .replace(/^(aqui\s+está\s+o\s+relat[^\n<]*[\n<])/im, '')
      .replace(/^(claro[,!][^\n<]*[\n<])/im, '')
      .trim();

    await prisma.resumoIA.create({ data: { usuarioId: parseInt(userId), conteudo } });
    res.json({ conteudo });

  } catch (error) {
    console.error('[Summary]', error);
    res.status(500).json({ error: 'Erro ao gerar resumo.' });
  }
});

router.get('/api/ia/summary/history', async (req, res) => {
  try {
    res.json(await prisma.resumoIA.findMany({
      where:   { usuarioId: parseInt(req.query.userId) },
      orderBy: { createdAt: 'desc' },
      take:    10,
    }));
  } catch { res.status(500).json({ error: 'Erro ao buscar histórico.' }); }
});

export default router;