import express from 'express';
import { prisma } from '../prisma.js';
import { sendChatMessage, analyzeImage } from '../iaService.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE DE ROTEAMENTO INTELIGENTE — Gemini 2.5 Flash
//
// Gemini 2.5 Flash suporta:
//   - Input:  até 1.000.000 tokens
//   - Output: até 64.000 tokens
//
// Estratégia: carregar TUDO que for relevante. Com 1M de contexto não há
// razão para limitar. O roteador apenas decide QUAIS tabelas buscar,
// não impõe limite de registros. Dados reais → IA mais precisa.
// ═══════════════════════════════════════════════════════════════════════════

const DATA_CATALOG = {
  produtos: {
    label:   'Catálogo de Produtos',
    desc:    'Todos os produtos cadastrados: SKU, nome, peso, preço, kit, plataforma, mlItemId vinculado.',
    colunas: ['id','sku','nome','preco','pesoGramas','eKit','mlItemId','plataforma','categoria','status','thumbnail'],
  },
  divergencias: {
    label:   'Divergências de Peso / Frete',
    desc:    'Anúncios ML com peso declarado diferente do cadastro local. Status: PENDENTE, REINCIDENTE, CORRIGIDO, IGNORADO.',
    colunas: ['id','mlItemId','titulo','motivo','pesoMl','pesoLocal','status','plataforma','createdAt'],
  },
  divergencias_stats: {
    label:   'Estatísticas de Divergências',
    desc:    'Contagem por status: pendente, reincidente, corrigido, ignorado e total.',
    colunas: ['pendente','reincidente','corrigido','ignorado','total'],
  },
  usuarios: {
    label:      'Usuários do Sistema',
    desc:       'Usuários, cargos, status de bloqueio, solicitações de acesso pendentes.',
    colunas:    ['id','nome','email','role','solicitouDesbloqueio','verificado','createdAt'],
    privileged: true,
  },
  precificacao_historico: {
    label:   'Histórico de Alterações de Preço',
    desc:    'Todas as atualizações de preço em anúncios ML com data, valor e quantidade.',
    colunas: ['mlItemId','titulo','preco','quantidade','categoriaId','criadoEm'],
  },
  categorias_ml: {
    label:   'Categorias de Anúncios ML',
    desc:    'Categorias dos anúncios vinculados à conta do usuário no Mercado Livre.',
    colunas: ['categoriaId','nome'],
  },
  resumos_ia: {
    label:   'Relatórios Executivos Gerados pela IA',
    desc:    'Histórico de relatórios logísticos gerados, com conteúdo e data.',
    colunas: ['conteudo','createdAt'],
  },
  ml_token: {
    label:      'Status da Conexão ML',
    desc:       'Status do token OAuth do Mercado Livre: conectado, nickname, validade.',
    colunas:    ['nickname','expiresAt','mlUserId'],
    privileged: false,
  },
  agendador: {
    label:   'Configuração do Agendador de Varredura',
    desc:    'Varredura automática: ativo, intervalo em minutos, última e próxima execução.',
    colunas: ['ativo','intervalo','ultimaExecucao','proximaExecucao'],
  },
};

// ── Router Gemini helper — só JSON, zero histórico ────────────────────────────
async function geminiQuick(prompt, maxTokens = 500) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model:    'gemini-2.5-flash',
    config:   { temperature: 0.0, maxOutputTokens: maxTokens },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return (response.text || '').trim();
}

// ── Fase 1: Router ────────────────────────────────────────────────────────────
async function routeDataNeeded(userMessage, userRole) {
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  const catalogoFiltrado = Object.entries(DATA_CATALOG)
    .filter(([, v]) => !v.privileged || isPrivileged)
    .map(([key, v]) => `${key}: ${v.label} — ${v.desc}`)
    .join('\n');

  const promptParts = [
    'Você é um roteador de dados de um sistema de gestão logística de e-commerce.',
    'Analise a mensagem do usuário e decida quais tabelas de dados são necessárias para responder.',
    '',
    'MENSAGEM: ' + userMessage,
    '',
    'TABELAS DISPONÍVEIS:',
    catalogoFiltrado,
    '',
    'Responda SOMENTE com JSON puro, sem texto extra, sem markdown, sem backticks.',
    'Com dados: {"relevante":true,"tabelas":["chave1","chave2"],"raciocinio":"motivo em 1 frase"}',
    'Sem dados: {"relevante":false,"tabelas":[],"raciocinio":"motivo em 1 frase"}',
    'Use no máximo 4 tabelas. Use exatamente as chaves listadas.',
  ];

  try {
    const raw     = await geminiQuick(promptParts.join('\n'), 500);
    const cleaned = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Sem JSON na resposta');

    let jsonStr = match[0]
      .replace(/,\s*([\}\]])/g, '$1')   // trailing commas
      .replace(/\/\/[^\n]*/g, '');       // comentários

    const parsed = JSON.parse(jsonStr);
    return {
      relevante:  Boolean(parsed.relevante),
      tabelas:    Array.isArray(parsed.tabelas) ? parsed.tabelas.slice(0, 4) : [],
      raciocinio: String(parsed.raciocinio || 'OK'),
    };
  } catch (e) {
    console.warn('[Router] Parse falhou:', e.message);
    return { relevante: false, tabelas: [], raciocinio: 'Fallback' };
  }
}

// ── Fase 2: Fetch completo — sem limite artificial de registros ───────────────
async function fetchSelectedData(tabelas, userId, userRole) {
  const uid  = parseInt(userId);
  const data = {};

  await Promise.all(tabelas.map(async (tabela) => {
    try {
      switch (tabela) {

        case 'produtos':
          // Busca TODOS os produtos — Gemini 2.5 aguenta tranquilamente milhares de registros
          data.produtos = await prisma.produto.findMany({
            where:   { usuarioId: uid },
            orderBy: { id: 'desc' },
            include: { itensDoKit: { include: { produto: { select: { sku: true, nome: true, pesoGramas: true } } } } },
          });
          break;

        case 'divergencias':
          data.divergencias = await prisma.divergencia.findMany({
            where:   { usuarioId: uid },
            orderBy: { createdAt: 'desc' },
          });
          break;

        case 'divergencias_stats': {
          const [pendente, reincidente, corrigido, ignorado] = await Promise.all([
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
          ]);
          data.divergencias_stats = {
            pendente, reincidente, corrigido, ignorado,
            total: pendente + reincidente + corrigido + ignorado,
          };
          break;
        }

        case 'usuarios':
          if (userRole === 'OWNER' || userRole === 'ADMIN') {
            data.usuarios = await prisma.usuario.findMany({
              orderBy: { createdAt: 'desc' },
              select:  { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true, verificado: true, createdAt: true },
            });
          }
          break;

        case 'precificacao_historico':
          data.precificacao_historico = await prisma.precificacaoHistorico.findMany({
            where:   { usuarioId: uid },
            orderBy: { criadoEm: 'desc' },
          }).catch(() => []);
          break;

        case 'categorias_ml':
          data.categorias_ml = await prisma.mlCategoria.findMany({
            where:   { usuarioId: uid },
            orderBy: { nome: 'asc' },
          }).catch(() => []);
          break;

        case 'resumos_ia':
          data.resumos_ia = await prisma.resumoIA.findMany({
            where:   { usuarioId: uid },
            orderBy: { createdAt: 'desc' },
            take:    10, // Resumos são longos, 10 é suficiente
            select:  { conteudo: true, createdAt: true },
          });
          break;

        case 'ml_token':
          data.ml_token = await prisma.mlToken.findUnique({
            where:  { usuarioId: uid },
            select: { nickname: true, expiresAt: true, mlUserId: true },
          });
          break;

        case 'agendador':
          data.agendador = await prisma.agendadorConfig.findUnique({
            where:  { usuarioId: uid },
          });
          break;

        default:
          console.warn('[Fetch] Tabela desconhecida:', tabela);
      }
    } catch (e) {
      console.warn(`[Fetch] Erro ao buscar "${tabela}":`, e.message);
    }
  }));

  return data;
}

// ── Formata dados para injeção no system prompt ───────────────────────────────
function formatDataContext(data, roteamento) {
  if (!data || Object.keys(data).length === 0) return null;

  const lines = [`DADOS CARREGADOS PELO SISTEMA (${roteamento.raciocinio}):`, ''];

  for (const [key, value] of Object.entries(data)) {
    const schema = DATA_CATALOG[key];
    lines.push(`━━━ ${schema?.label || key} ━━━`);

    if (Array.isArray(value)) {
      lines.push(`Total de registros: ${value.length}`);
      // Serializa compacto — Gemini lida bem com JSON denso
      value.forEach((row, i) => lines.push(`[${i + 1}] ${JSON.stringify(row)}`));
    } else if (value && typeof value === 'object') {
      lines.push(JSON.stringify(value, null, 2));
    } else {
      lines.push(String(value ?? 'sem dados'));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSÕES DE CHAT
// ═══════════════════════════════════════════════════════════════════════════

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
  catch { res.status(500).json({ error: 'Erro.' }); }
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

// ═══════════════════════════════════════════════════════════════════════════
// CHAT PRINCIPAL — Pipeline 3 fases
// ═══════════════════════════════════════════════════════════════════════════

router.post('/api/ia/chat', async (req, res) => {
  const { message, pageUrl, sessionId, userRole, userId, imageBase64, imageMimeType, imageOnly } = req.body;

  try {
    if (userRole === 'BLOQUEADO') return res.json({ reply: 'Seu perfil está bloqueado. 🔒', sources: [] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply: 'Chave API ausente.', sources: [] });

    const uid = parseInt(userId);

    // ── Garante sessão ──────────────────────────────────────────────────────
    let session = sessionId
      ? await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } })
      : null;
    if (!session) {
      session = await prisma.chatSession.create({ data: { usuarioId: uid, titulo: 'Nova conversa' } });
    }

    // ── Análise de imagem ───────────────────────────────────────────────────
    const imageDesc = imageBase64
      ? await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', imageOnly ? '' : message)
      : null;

    // ── Salva mensagem do usuário ───────────────────────────────────────────
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: message || '', imageBase64: imageBase64 || null, imageDesc: imageDesc || null },
    });

    // ── Atualiza título da sessão nas primeiras mensagens ───────────────────
    if (message && message.length > 3) {
      const msgCount = await prisma.chatMessage.count({ where: { sessionId: session.id } });
      if (msgCount <= 2) {
        await prisma.chatSession.update({
          where: { id: session.id },
          data:  { titulo: message.substring(0, 60) + (message.length > 60 ? '...' : '') },
        });
      }
    }

    // ── Histórico completo da conversa (sem imageBase64 pesado) ────────────
    // Com 1M de tokens podemos carregar conversas muito longas
    const dbMessages = await prisma.chatMessage.findMany({
      where:   { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      select:  { role: true, content: true, imageDesc: true },
      // Sem limite de take — aproveitamos o contexto todo
    });

    const history = dbMessages.map(m => ({
      role:    m.role,
      content: m.content || (m.imageDesc ? `[imagem: ${m.imageDesc.substring(0, 200)}]` : '[imagem]'),
    }));

    // ── Mensagem efetiva para o pipeline ────────────────────────────────────
    const mensagemEfetiva = imageOnly
      ? (imageDesc ? `[Imagem enviada. Conteúdo: ${imageDesc}]` : '[Imagem enviada sem texto]')
      : (message || '[imagem]');

    // ── FASE 1: Roteamento ──────────────────────────────────────────────────
    let roteamento = { relevante: false, tabelas: [], raciocinio: 'Pergunta geral' };
    if (!imageOnly && mensagemEfetiva) {
      roteamento = await routeDataNeeded(mensagemEfetiva, userRole).catch(e => {
        console.warn('[Router] Falhou:', e.message);
        return { relevante: false, tabelas: [], raciocinio: 'Fallback' };
      });
      console.log(`[Router] relevante=${roteamento.relevante} | tabelas=[${roteamento.tabelas.join(',')}] | ${roteamento.raciocinio}`);
    }

    // ── FASE 2: Fetch completo das tabelas indicadas ────────────────────────
    let dataContext = null;
    if (roteamento.relevante && roteamento.tabelas.length > 0) {
      const dadosBrutos = await fetchSelectedData(roteamento.tabelas, userId, userRole);
      dataContext = formatDataContext(dadosBrutos, roteamento);
    }

    // ── Dados de contexto mínimo (sempre presentes) ─────────────────────────
    const [totalProdutos, totalDivergencias, usuarioAtual] = await Promise.all([
      prisma.produto.count({ where: { usuarioId: uid } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } } }),
      prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }),
    ]);

    let pendentesGerais = [];
    if (userRole === 'OWNER' || userRole === 'ADMIN') {
      pendentesGerais = await prisma.usuario.findMany({
        where:  { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
        select: { id: true, nome: true, email: true, role: true, solicitouDesbloqueio: true },
      });
    }

    // ── FASE 3: Resposta final com contexto completo ────────────────────────
    const { reply, sources } = await sendChatMessage(
      mensagemEfetiva,
      history,
      {
        totalProdutos,
        totalDivergencias,
        userRole,
        produtos:      [],
        divergencias:  [],
        usuarios:      pendentesGerais,
        usuarioAtual,
        imageContext:  imageDesc,
        pageUrl:       pageUrl || null,
        imageOnly:     !!imageOnly,
        dataContext,
        roteamentoInfo: roteamento.relevante
          ? `${roteamento.tabelas.join(', ')} — ${roteamento.raciocinio}`
          : null,
      }
    );

    // ── Salva resposta ──────────────────────────────────────────────────────
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

// POST (chamado pelo IaAnalyizChat.jsx via loop)
router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY)
      return res.json({ insight: null });

    const uid          = parseInt(userId);
    const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
    const contextLines = [];

    // Divergências sempre relevantes
    const divs = await prisma.divergencia.findMany({
      where:   { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (divs.length > 0) {
      const totalDifGramas = divs.reduce((s, d) => s + Math.abs((d.pesoMl || 0) - (d.pesoLocal || 0)), 0);
      contextLines.push(`${divs.length} divergências ativas de peso/frete. Diferença total acumulada: ${totalDifGramas}g.`);
      divs.slice(0, 8).forEach(d =>
        contextLines.push(`- ${d.mlItemId}: ${d.motivo} (${d.status})`));
    } else {
      contextLines.push('Logística operando com 100% de eficiência — sem divergências.');
    }

    // Produtos sem peso cadastrado
    const semPeso = await prisma.produto.count({
      where: { usuarioId: uid, pesoGramas: 0, plataforma: 'Mercado Livre' },
    });
    if (semPeso > 0) contextLines.push(`${semPeso} produto(s) com peso zerado no catálogo.`);

    // Pendentes de acesso (OWNER/ADMIN)
    if (isPrivileged) {
      const pendentes = await prisma.usuario.findMany({
        where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
      });
      if (pendentes.length > 0)
        contextLines.push(`${pendentes.length} usuário(s) aguardando aprovação de acesso.`);
    }

    if (contextLines.length === 0) return res.json({ insight: null });

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.4, maxOutputTokens: 800 },
      contents: [{ role: 'user', parts: [{ text: `DADOS DO SISTEMA:\n${contextLines.join('\n')}\n\nGere 1 alerta executivo curto (máx 2 frases) para o gestor. Foque no maior risco financeiro ou operacional. Sem markdown, sem nome do sistema. Comece com 1 emoji relevante.` }] }],
    });
    const insight = response.text?.trim().replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') || null;
    res.json({ insight });

  } catch (error) {
    console.error('[Proactive POST]', error);
    res.json({ insight: null });
  }
});

// GET (chamado pelos módulos ML: MercadoLivre.jsx, Mlprecos.jsx etc.)
router.get('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.query;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY)
      return res.json({ insight: null });

    const uid = parseInt(userId);
    const contextLines = [];

    const divs = await prisma.divergencia.findMany({
      where:   { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (divs.length > 0) {
      const totalDif = divs.reduce((s, d) => s + Math.abs((d.pesoMl || 0) - (d.pesoLocal || 0)), 0);
      contextLines.push(`${divs.length} divergências ativas. Erro total acumulado: ${totalDif}g.`);
      divs.slice(0, 5).forEach(d => contextLines.push(`- ${d.mlItemId}: ${d.motivo}`));
    }

    const naoVinculados = await prisma.produto.count({
      where: { usuarioId: uid, plataforma: 'ML_PENDENTE' },
    });
    if (naoVinculados > 0) contextLines.push(`${naoVinculados} anúncio(s) ainda sem vínculo no catálogo.`);

    if (contextLines.length === 0) return res.json({ insight: null });

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.4, maxOutputTokens: 800 },
      contents: [{ role: 'user', parts: [{ text: `DADOS:\n${contextLines.join('\n')}\n\nGere 1 alerta curto (máx 2 frases) para um gestor de e-commerce. Foco no risco operacional/financeiro. Sem markdown, sem nome do sistema. 1 emoji relevante no início.` }] }],
    });
    res.json({ insight: response.text?.trim() || null });

  } catch (error) {
    console.error('[Proactive GET]', error);
    res.json({ insight: null });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RESUMO EXECUTIVO
// ═══════════════════════════════════════════════════════════════════════════

router.post('/api/ia/summary', async (req, res) => {
  const { userId, dados } = req.body;
  try {
    const uid = parseInt(userId);

    // Carrega contexto completo para o resumo — sem limites artificiais
    const [produtos, divergencias, stats, precHist] = await Promise.all([
      prisma.produto.findMany({ where: { usuarioId: uid }, orderBy: { id: 'desc' } }),
      prisma.divergencia.findMany({ where: { usuarioId: uid }, orderBy: { createdAt: 'desc' } }),
      Promise.all([
        prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
        prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
        prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
        prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
      ]),
      prisma.precificacaoHistorico.findMany({ where: { usuarioId: uid }, orderBy: { criadoEm: 'desc' }, take: 50 }).catch(() => []),
    ]);

    const [pendente, reincidente, corrigido, ignorado] = stats;
    const totalDiv = pendente + reincidente + corrigido + ignorado;
    const taxaCorrecao = totalDiv > 0 ? ((corrigido / totalDiv) * 100).toFixed(1) : 0;
    const produtosVinculados = produtos.filter(p => p.mlItemId && p.plataforma !== 'ML_PENDENTE').length;
    const semPeso = produtos.filter(p => p.pesoGramas === 0 && p.mlItemId).length;
    const kits = produtos.filter(p => p.eKit).length;

    const dadosEnriquecidos = {
      ...(typeof dados === 'string' ? { resumo: dados } : dados),
      catalogo: {
        total: produtos.length,
        vinculados: produtosVinculados,
        semPeso,
        kits,
        categorias: [...new Set(produtos.map(p => p.categoria).filter(Boolean))],
      },
      divergencias: {
        pendente, reincidente, corrigido, ignorado,
        total: totalDiv,
        taxaCorrecao: `${taxaCorrecao}%`,
        maioresDivergencias: divergencias
          .filter(d => d.status === 'PENDENTE' || d.status === 'REINCIDENTE')
          .sort((a, b) => Math.abs((b.pesoMl - b.pesoLocal)) - Math.abs((a.pesoMl - a.pesoLocal)))
          .slice(0, 10)
          .map(d => ({ id: d.mlItemId, titulo: d.titulo, diff: Math.abs(d.pesoMl - d.pesoLocal), status: d.status })),
      },
      precificacao: {
        totalAtualizacoes: precHist.length,
        ultimasAlteracoes: precHist.slice(0, 10),
      },
    };

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = [
      'Você é um Consultor Logístico Senior especialista em e-commerce e Mercado Livre.',
      'Analise os dados completos da operação e produza um relatório executivo rico e detalhado.',
      '',
      'DADOS DA OPERAÇÃO:',
      JSON.stringify(dadosEnriquecidos, null, 2),
      '',
      'Produza o relatório em HTML limpo (use: <b>, <i>, <ul>, <li>, <br>).',
      'Estrutura OBRIGATÓRIA:',
      '<b>📊 Diagnóstico Geral</b> — Visão geral do estado da operação com números reais.',
      '<b>⚠️ Pontos Críticos</b> — O que precisa de atenção imediata. Cite anúncios/SKUs específicos se houver.',
      '<b>💰 Impacto Financeiro</b> — Estimativa de custo das divergências de frete e erros de peso.',
      '<b>✅ Conquistas</b> — O que está funcionando bem.',
      '<b>🚀 Plano de Ação</b> — 3 a 5 ações concretas e priorizadas.',
      '',
      'IMPORTANTE: Comece DIRETAMENTE com o conteúdo. Use dados reais dos registros fornecidos.',
      'Seja específico, cite números, percentuais e nomes quando disponíveis.',
    ].join('\n');

    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.3, maxOutputTokens: 8000 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    let conteudo = (response.text || '').trim()
      .replace(/^(conforme\s+solicitado[^\n<]*[\n<])/im, '')
      .replace(/^(aqui\s+está[^\n<]*[\n<])/im, '')
      .replace(/^(claro[,!][^\n<]*[\n<])/im, '')
      .trim();

    await prisma.resumoIA.create({ data: { usuarioId: uid, conteudo } });
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
      take:    20,
    }));
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

export default router;