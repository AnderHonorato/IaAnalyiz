// backend/src/routes/iaRoutes.js
// ═══════════════════════════════════════════════════════════════════════════════
// Rotas da IA — Chat, Proactive, Summary, Brain APIs
// Integra o sistema de aprendizado autônomo em cada interação
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import { prisma } from '../prisma.js';
import { buildAnswer, analyzeImage, buildResumoPrompt } from '../iaService.js';
import {
  processarMensagemComAprendizado,
  analisarSistemaAutonomamente,
  buscarEstudosRecentes,
  getEstatisticasAprendizado,
  buscarConhecimento,
  buscarTodoConhecimento,
  salvarConhecimento,
  gerarInsightCurto,
  registrarEstudo,
  validarRespostaComGemini,
} from '../ia/brain/iaBrain.js';

const router = express.Router();

// ─── Catálogo de tabelas disponíveis para o roteador de dados ─────────────────
const DATA_CATALOG = {
  produtos: {
    label: 'Catálogo de Produtos',
    desc:  'Produtos com SKU, nome, peso, preço, kit, ID ML.',
    colunas: ['id','sku','nome','preco','pesoGramas','eKit','mlItemId','plataforma','categoria','status'],
  },
  divergencias: {
    label: 'Divergências de Peso/Frete',
    desc:  'Anúncios ML com peso divergente. Status: PENDENTE, REINCIDENTE, CORRIGIDO, IGNORADO, PENDENTE_ENVIO.',
    colunas: ['id','mlItemId','titulo','motivo','pesoMl','pesoLocal','status','plataforma','createdAt'],
  },
  divergencias_stats: {
    label: 'Estatísticas de Divergências',
    desc:  'Totais agrupados por status.',
    colunas: ['pendente','reincidente','corrigido','ignorado','pendenteEnvio','total'],
  },
  usuarios: {
    label: 'Usuários do Sistema',
    desc:  'Usuários com nome, email, cargo e status.',
    colunas: ['id','nome','email','role','solicitouDesbloqueio','verificado','createdAt'],
    privileged: true,
  },
  precificacao_historico: {
    label: 'Histórico de Preços',
    desc:  'Alterações de preço em anúncios ML.',
    colunas: ['mlItemId','titulo','preco','quantidade','categoriaId','criadoEm'],
  },
  categorias_ml: {
    label: 'Categorias ML',
    desc:  'Categorias dos anúncios.',
    colunas: ['categoriaId','nome'],
  },
  agendador: {
    label: 'Agendador de Varredura',
    desc:  'Config da varredura automática.',
    colunas: ['ativo','intervalo','ultimaExecucao','proximaExecucao'],
  },
  ml_token: {
    label: 'Status da Conexão ML',
    desc:  'Status OAuth: nickname, validade.',
    colunas: ['nickname','expiresAt','mlUserId'],
  },
  sessao_stats: {
    label: 'Sessões de Usuários',
    desc:  'Usuários online agora e total histórico.',
    colunas: ['ativos','totalSessoes','totalUsuariosUnicos'],
  },
  ia_brain: {
    label: 'Conhecimento da IA',
    desc:  'Fatos aprendidos autonomamente pela IA sobre o sistema.',
    colunas: ['categoria','chave','valor','confianca','fonte'],
  },
};

// ─── Roteador de dados por keyword (fallback) ─────────────────────────────────
function keywordRoute(msg) {
  const tabelas = [];
  if (/divergen|peso|frete|anúncio|anuncio|auditoria|reincidente|pendente|corrigido/i.test(msg))
    tabelas.push('divergencias', 'divergencias_stats');
  if (/produto|sku|catálogo|catalogo|kit|ficha/i.test(msg))
    tabelas.push('produtos');
  if (/usuário|usuario|acesso|bloqueio|role/i.test(msg))
    tabelas.push('usuarios');
  if (/preço|preco|precific|histórico/i.test(msg))
    tabelas.push('precificacao_historico');
  if (/agendador|varredura|automático|schedule/i.test(msg))
    tabelas.push('agendador');
  if (/categoria/i.test(msg))
    tabelas.push('categorias_ml');
  if (/conectado|conexão|token\s*ml|conta\s*ml|nickname/i.test(msg))
    tabelas.push('ml_token');
  if (/online|ativo|sessão|usuário.*agora|quantos/i.test(msg))
    tabelas.push('sessao_stats');
  if (/aprend|conhec|estud|ia\s*aprend|memória/i.test(msg))
    tabelas.push('ia_brain');
  return {
    relevante:   tabelas.length > 0,
    tabelas:     [...new Set(tabelas)].slice(0, 5),
    raciocinio:  'keyword_fallback',
  };
}

// ─── Roteador Gemini Lite ─────────────────────────────────────────────────────
async function geminiRouter(catalogoStr, userMessage) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai      = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelId = 'gemini-2.5-flash-lite-preview-06-17';

  const systemInstruction = [
    'Você é um classificador de intenção. Analise a mensagem e decida quais tabelas são necessárias.',
    'Responda EXCLUSIVAMENTE com JSON puro. Nenhum texto antes ou depois.',
    'Formato: {"relevante":true,"tabelas":["nome_tabela"],"raciocinio":"uma frase"}',
    'Se nenhuma tabela: {"relevante":false,"tabelas":[],"raciocinio":"uma frase"}',
  ].join('\n');

  const userPrompt = `TABELAS:\n${catalogoStr}\n\nMENSAGEM: ${userMessage}\n\nJSON:`;

  try {
    const r = await ai.models.generateContent({
      model:    modelId,
      config:   { temperature: 0, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 }, systemInstruction },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });
    return (r.text || '').trim();
  } catch {
    const r = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 }, systemInstruction },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });
    return (r.text || '').trim();
  }
}

function parseRouterJson(raw) {
  if (!raw) throw new Error('Resposta vazia');
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('Sem {}');
  const parsed = JSON.parse(
    raw.slice(s, e + 1)
      .replace(/,\s*([\}\]])/g, '$1')
      .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?:/g, '"$2":')
      .replace(/:\s*'([^']*)'/g, ':"$1"')
  );
  return {
    relevante:   Boolean(parsed.relevante),
    tabelas:     Array.isArray(parsed.tabelas) ? parsed.tabelas.slice(0, 5) : [],
    raciocinio:  String(parsed.raciocinio || ''),
  };
}

async function routeDataNeeded(userMessage, userRole) {
  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
  const catalogoStr  = Object.entries(DATA_CATALOG)
    .filter(([, v]) => !v.privileged || isPrivileged)
    .map(([key, v]) => `- ${key}: ${v.label}. ${v.desc}`)
    .join('\n');
  try {
    const raw    = await geminiRouter(catalogoStr, userMessage);
    const result = parseRouterJson(raw);
    console.log(`[Router] relevante=${result.relevante} | tabelas=[${result.tabelas.join(',')}] | ${result.raciocinio}`);
    return result;
  } catch (parseErr) {
    console.warn('[Router] Parse falhou, keyword fallback:', parseErr.message);
    return keywordRoute(userMessage);
  }
}

// ─── Buscador de dados das tabelas ───────────────────────────────────────────
async function fetchSelectedData(tabelas, userId, userRole) {
  const uid  = parseInt(userId);
  const data = {};

  await Promise.all(tabelas.map(async (tabela) => {
    try {
      switch (tabela) {
        case 'produtos':
          data.produtos = await prisma.produto.findMany({
            where:   { usuarioId: uid },
            orderBy: { id: 'desc' },
          });
          break;

        case 'divergencias':
          data.divergencias = await prisma.divergencia.findMany({
            where:   { usuarioId: uid },
            orderBy: { createdAt: 'desc' },
          });
          break;

        case 'divergencias_stats': {
          const [pendente, reincidente, corrigido, ignorado, pendenteEnvio] = await Promise.all([
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
            prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE_ENVIO' } }),
          ]);
          data.divergencias_stats = {
            pendente, reincidente, corrigido, ignorado, pendenteEnvio,
            total: pendente + reincidente + corrigido + ignorado + pendenteEnvio,
          };
          break;
        }

        case 'usuarios':
          if (userRole === 'OWNER' || userRole === 'ADMIN') {
            data.usuarios = await prisma.usuario.findMany({
              orderBy: { createdAt: 'desc' },
              select: {
                id: true, nome: true, email: true, role: true,
                solicitouDesbloqueio: true, verificado: true, createdAt: true,
              },
            });
          }
          break;

        case 'precificacao_historico':
          data.precificacao_historico = await prisma.precificacaoHistorico.findMany({
            where: { usuarioId: uid }, orderBy: { criadoEm: 'desc' }, take: 50,
          }).catch(() => []);
          break;

        case 'categorias_ml':
          data.categorias_ml = await prisma.mlCategoria.findMany({
            where: { usuarioId: uid }, orderBy: { nome: 'asc' },
          }).catch(() => []);
          break;

        case 'agendador':
          data.agendador = await prisma.agendadorConfig.findUnique({
            where: { usuarioId: uid },
          });
          break;

        case 'ml_token':
          data.ml_token = await prisma.mlToken.findUnique({
            where:  { usuarioId: uid },
            select: { nickname: true, expiresAt: true, mlUserId: true },
          });
          break;

        case 'sessao_stats': {
          const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000);
          const [ativos, total, unicos] = await Promise.all([
            prisma.sessaoUsuario.count({
              where: { ativo: true, entradaEm: { gte: trintaMinAtras } },
            }).catch(() => 0),
            prisma.sessaoUsuario.count().catch(() => 0),
            prisma.sessaoUsuario.groupBy({ by: ['usuarioId'], _count: true }).catch(() => []),
          ]);
          data.sessao_stats = {
            ativos,
            totalSessoes: total,
            totalUsuariosUnicos: unicos.length,
          };
          break;
        }

        case 'ia_brain': {
          const conhecimentos = await buscarTodoConhecimento(25);
          data.ia_brain = conhecimentos;
          break;
        }
      }
    } catch (e) {
      console.warn(`[Fetch] Erro em "${tabela}":`, e.message);
    }
  }));

  return data;
}

function formatDataBlock(data) {
  if (!data || !Object.keys(data).length) return null;
  const lines = ['=== DADOS DO BANCO (use para responder) ===', ''];
  for (const [key, value] of Object.entries(data)) {
    const schema = DATA_CATALOG[key];
    lines.push(`--- ${schema?.label || key} ---`);
    if (Array.isArray(value)) {
      lines.push(`(${value.length} registros)`);
      value.forEach((row, i) => lines.push(`[${i + 1}] ${JSON.stringify(row)}`));
    } else if (value && typeof value === 'object') {
      lines.push(JSON.stringify(value, null, 2));
    } else {
      lines.push(String(value ?? 'sem dados'));
    }
    lines.push('');
  }
  lines.push('=== FIM DOS DADOS ===');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSÕES DE CHAT
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/chat/sessions/:userId', async (req, res) => {
  try {
    res.json(await prisma.chatSession.findMany({
      where:   { usuarioId: parseInt(req.params.userId) },
      orderBy: { updatedAt: 'desc' },
      select:  { id: true, titulo: true, createdAt: true, updatedAt: true },
    }));
  } catch { res.status(500).json({ error: 'Erro ao listar sessões.' }); }
});

router.post('/api/chat/sessions', async (req, res) => {
  try {
    res.status(201).json(await prisma.chatSession.create({
      data: { usuarioId: parseInt(req.body.userId), titulo: req.body.titulo || 'Nova conversa' },
    }));
  } catch { res.status(500).json({ error: 'Erro ao criar sessão.' }); }
});

router.delete('/api/chat/sessions/:id', async (req, res) => {
  try {
    await prisma.chatSession.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro ao excluir sessão.' }); }
});

router.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    res.json(await prisma.chatMessage.findMany({
      where:   { sessionId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, role: true, content: true, imageDesc: true, createdAt: true },
    }));
  } catch { res.status(500).json({ error: 'Erro ao buscar mensagens.' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT PRINCIPAL — com aprendizado integrado
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/ia/chat', async (req, res) => {
  const { message, sessionId, userRole, userId, imageBase64, imageMimeType, imageOnly } = req.body;

  try {
    if (userRole === 'BLOQUEADO') {
      return res.json({ reply: '🔒 Seu perfil está bloqueado. Solicite acesso ao administrador.', sources: [] });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ reply: '⚠️ Chave de API ausente.', sources: [] });
    }

    // Garante sessão
    let session = sessionId
      ? await prisma.chatSession.findUnique({ where: { id: parseInt(sessionId) } })
      : null;
    if (!session) {
      session = await prisma.chatSession.create({
        data: { usuarioId: parseInt(userId), titulo: 'Nova conversa' },
      });
    }

    // Salva mensagem do usuário
    await prisma.chatMessage.create({
      data: {
        sessionId:   session.id,
        role:        'user',
        content:     message || '',
        imageBase64: imageBase64 || null,
        imageDesc:   null,
      },
    });

    // Atualiza título da sessão
    if (message && message.length > 3) {
      const count = await prisma.chatMessage.count({ where: { sessionId: session.id } });
      if (count <= 2) {
        await prisma.chatSession.update({
          where: { id: session.id },
          data:  { titulo: message.substring(0, 50) + (message.length > 50 ? '...' : '') },
        });
      }
    }

    // Busca histórico para contexto
    const dbMsgs = await prisma.chatMessage.findMany({
      where:   { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take:    40,
      select:  { role: true, content: true, imageDesc: true },
    });
    const historyRaw = dbMsgs.map(m => ({
      role:    m.role,
      content: m.content || (m.imageDesc ? '[imagem]' : ''),
    }));

    // Busca dados relevantes do banco
    let dataBlock = null;
    if (!imageOnly && message && message.trim().length > 2) {
      const roteamento = await routeDataNeeded(message, userRole);
      if (roteamento.relevante && roteamento.tabelas.length > 0) {
        const dados = await fetchSelectedData(roteamento.tabelas, userId, userRole);
        dataBlock = formatDataBlock(dados);
      }
    }

    // ── PIPELINE COM APRENDIZADO ──────────────────────────────────────────
    const { reply, sources } = await processarMensagemComAprendizado({
      mensagem:     message,
      userRole,
      userId,
      imageBase64,
      imageMimeType,
      imageOnly:    !!imageOnly,
      historyRaw,
      dataBlock,
    });

    // Salva resposta da IA
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'ia', content: reply },
    });

    res.json({ reply, sessionId: session.id, sources });

  } catch (error) {
    console.error('[IA Chat]', error);
    res.status(500).json({ reply: '⚠️ Erro interno. Tente novamente!', sources: [] });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHTS PROATIVOS — curtos para o balão (máx 88 chars)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) {
      return res.json({ insight: null });
    }

    const uid          = parseInt(userId);
    const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
    const linhas       = [];

    // Coleta dados para o insight
    const divs = await prisma.divergencia.findMany({
      where:   { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      orderBy: { createdAt: 'desc' },
      take:    15,
    });

    if (divs.length > 0) {
      const reincidentes = divs.filter(d => d.status === 'REINCIDENTE').length;
      const pendenteEnvio = await prisma.divergencia.count({
        where: { usuarioId: uid, status: 'PENDENTE_ENVIO' },
      });
      linhas.push(`${divs.length} divergências peso/frete ativas`);
      if (reincidentes > 0) linhas.push(`${reincidentes} reincidentes`);
      if (pendenteEnvio > 0) linhas.push(`${pendenteEnvio} na fila de envio API`);
      // Adiciona o maior erro em gramas
      const maxErro = divs.reduce((m, d) => Math.max(m, Math.abs(d.pesoMl - d.pesoLocal)), 0);
      if (maxErro > 0) linhas.push(`maior erro: ${maxErro}g`);
    } else {
      linhas.push('logística sem divergências ativas');
    }

    const avisos = await prisma.avisoML.count({
      where: { usuarioId: uid, resolvido: false },
    }).catch(() => 0);
    if (avisos > 0) linhas.push(`${avisos} aviso(s) ML ativo(s)`);

    if (isPrivileged) {
      const pendentes = await prisma.usuario.count({
        where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' },
      });
      if (pendentes > 0) linhas.push(`${pendentes} usuário(s) aguardando aprovação`);
    }

    // Usa o gerador de insight curto garantindo que cabe no balão
    const insight = await gerarInsightCurto(linhas);
    res.json({ insight });

  } catch (e) {
    console.error('[Proactive]', e);
    res.json({ insight: null });
  }
});

router.get('/api/ia/proactive', async (req, res) => {
  const { userId, userRole } = req.query;
  try {
    if (!userId || userRole === 'BLOQUEADO' || !process.env.GEMINI_API_KEY) {
      return res.json({ insight: null });
    }
    const uid  = parseInt(userId);
    const divs = await prisma.divergencia.findMany({
      where:   { usuarioId: uid, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
      orderBy: { createdAt: 'desc' },
      take:    10,
    });
    if (!divs.length) return res.json({ insight: null });

    const linhas = [`${divs.length} divergências ativas`];
    divs.slice(0, 3).forEach(d =>
      linhas.push(`${d.mlItemId}: erro de ${Math.abs(d.pesoMl - d.pesoLocal)}g`)
    );
    const insight = await gerarInsightCurto(linhas);
    res.json({ insight });
  } catch {
    res.json({ insight: null });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMO EXECUTIVO DETALHADO
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/ia/summary', async (req, res) => {
  const { userId, dados } = req.body;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai  = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const uid = parseInt(userId);

    const [statsDiv, totalProd, totalAvisos, agendador] = await Promise.all([
      prisma.divergencia.groupBy({ by: ['status'], where: { usuarioId: uid }, _count: true }),
      prisma.produto.count({ where: { usuarioId: uid } }),
      prisma.avisoML.count({ where: { usuarioId: uid, resolvido: false } }).catch(() => 0),
      prisma.agendadorConfig.findUnique({ where: { usuarioId: uid } }).catch(() => null),
    ]);

    const statsMap = Object.fromEntries(statsDiv.map(s => [s.status, s._count]));

    // Inclui conhecimento autônomo no resumo
    const conhecimentosIA = await buscarConhecimento('metricas_divergencias', 5);
    const brainContext     = conhecimentosIA.map(k => k.valor).join('\n');

    const dadosEnriquecidos = `${typeof dados === 'string' ? dados : JSON.stringify(dados)}

DADOS DO BANCO:
- Total de produtos: ${totalProd}
- Divergências PENDENTE: ${statsMap.PENDENTE || 0}
- Divergências REINCIDENTE: ${statsMap.REINCIDENTE || 0}
- Divergências CORRIGIDO: ${statsMap.CORRIGIDO || 0}
- Divergências IGNORADO: ${statsMap.IGNORADO || 0}
- Divergências PENDENTE_ENVIO: ${statsMap.PENDENTE_ENVIO || 0}
- Avisos ML ativos: ${totalAvisos}
- Agendador: ${agendador?.ativo ? `ATIVO a cada ${agendador.intervalo}min` : 'INATIVO'}
- Última varredura: ${agendador?.ultimaExecucao
    ? new Date(agendador.ultimaExecucao).toLocaleString('pt-BR') : 'Nunca'}

ANÁLISE AUTÔNOMA DA IA:
${brainContext || '(primeira análise em andamento...)'}`;

    const { buildResumoPrompt } = await import('../iaService.js');
    const prompt = buildResumoPrompt(dadosEnriquecidos);

    const response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      config:   { temperature: 0.4, maxOutputTokens: 2500 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const conteudo = (response.text || '').trim()
      .replace(/^(conforme solicitado|aqui está|claro[,!]|segue|com base)[^\n<]*[\n<]/im, '')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^-\s+/gm, '• ')
      .trim();

    await prisma.resumoIA.create({ data: { usuarioId: uid, conteudo } });

    // Salva o resumo como conhecimento
    await salvarConhecimento({
      categoria: 'resumo_executivo',
      chave:     `resumo_${new Date().toISOString().slice(0, 10)}`,
      valor:     conteudo.replace(/<[^>]+>/g, '').substring(0, 600),
      confianca: 0.88,
      fonte:     'resumo_gerado',
    });

    res.json({ conteudo });
  } catch (e) {
    console.error('[Summary]', e);
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
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DO SISTEMA DE APRENDIZADO (Brain API)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/ia/brain/stats
router.get('/api/ia/brain/stats', async (req, res) => {
  try { res.json(await getEstatisticasAprendizado()); }
  catch { res.status(500).json({ error: 'Erro.' }); }
});

// GET /api/ia/brain/estudos
router.get('/api/ia/brain/estudos', async (req, res) => {
  try {
    const limite  = parseInt(req.query.limite || '50');
    const estudos = await buscarEstudosRecentes(Math.min(limite, 100));
    res.json(estudos);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// GET /api/ia/brain/conhecimentos
router.get('/api/ia/brain/conhecimentos', async (req, res) => {
  try {
    const items = await prisma.iaConhecimento.findMany({
      where:   { confianca: { gte: 0.4 } },
      orderBy: [{ confianca: 'desc' }, { usos: 'desc' }],
      take:    80,
    });
    res.json(items);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// GET /api/ia/brain/aprendizados
router.get('/api/ia/brain/aprendizados', async (req, res) => {
  try {
    const items = await prisma.iaAprendizado.findMany({
      orderBy: { createdAt: 'desc' },
      take:    50,
      select: {
        id: true, pergunta: true, aprovada: true,
        confianca: true, motivo: true, createdAt: true,
      },
    });
    res.json(items);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// POST /api/ia/brain/analisar — força análise agora
router.post('/api/ia/brain/analisar', async (req, res) => {
  try {
    const resultado = await analisarSistemaAutonomamente(req.body.userId || null);
    res.json(resultado);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// POST /api/ia/brain/conhecimento — salva conhecimento manual
router.post('/api/ia/brain/conhecimento', async (req, res) => {
  try {
    const { categoria, chave, valor, confianca = 0.9 } = req.body;
    if (!categoria || !chave || !valor) {
      return res.status(400).json({ error: 'categoria, chave e valor são obrigatórios' });
    }
    await salvarConhecimento({ categoria, chave, valor, confianca, fonte: 'manual_admin' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// DELETE /api/ia/brain/conhecimento/:id
router.delete('/api/ia/brain/conhecimento/:id', async (req, res) => {
  try {
    await prisma.iaConhecimento.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

// POST /api/ia/brain/validar — valida uma resposta manualmente
router.post('/api/ia/brain/validar', async (req, res) => {
  try {
    const { pergunta, respostaTentativa, contexto, userId } = req.body;
    const resultado = await validarRespostaComGemini({
      pergunta, respostaTentativa, contexto: contexto || '', userId,
    });
    res.json(resultado);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});

export default router;