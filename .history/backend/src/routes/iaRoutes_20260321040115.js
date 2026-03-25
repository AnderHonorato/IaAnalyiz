// src/routes/iaRoutes.js — sistema de aprendizado autônomo integrado

import express from 'express';
import { prisma } from '../prisma.js';
import { buildAnswer, analyzeImage, buildResumoPrompt } from '../iaService.js';
import { smartChat, generateProactiveInsight } from '../ia-engine/chatEngine.js';
import { getKnowledgeStats, getRecentLogs, queryKnowledge } from '../ia-engine/knowledge.js';
import { getLearnerStatus } from '../ia-engine/learner.js';

const router = express.Router();

const DATA_CATALOG = {
  produtos:              { label:'Catálogo de Produtos',         desc:'Produtos com SKU, nome, peso, preço, kit, ID ML.', colunas:['id','sku','nome','preco','pesoGramas','eKit','mlItemId','plataforma','categoria','status'] },
  divergencias:          { label:'Divergências de Peso/Frete',    desc:'Anúncios ML com peso divergente. Status: PENDENTE, REINCIDENTE, CORRIGIDO, IGNORADO.', colunas:['id','mlItemId','titulo','motivo','pesoMl','pesoLocal','status','plataforma','createdAt'] },
  divergencias_stats:    { label:'Estatísticas de Divergências',  desc:'Totais agrupados por status.', colunas:['pendente','reincidente','corrigido','ignorado','total'] },
  usuarios:              { label:'Usuários do Sistema',           desc:'Usuários com nome, email, cargo e status.', colunas:['id','nome','email','role','solicitouDesbloqueio','verificado','createdAt'], privileged:true },
  precificacao_historico:{ label:'Histórico de Preços',          desc:'Alterações de preço em anúncios ML.', colunas:['mlItemId','titulo','preco','quantidade','categoriaId','criadoEm'] },
  categorias_ml:         { label:'Categorias ML',                desc:'Categorias dos anúncios.', colunas:['categoriaId','nome'] },
  agendador:             { label:'Agendador de Varredura',        desc:'Config da varredura automática.', colunas:['ativo','intervalo','ultimaExecucao','proximaExecucao'] },
  ml_token:              { label:'Status da Conexão ML',          desc:'Status OAuth: nickname, validade.', colunas:['nickname','expiresAt','mlUserId'] },
  sessoes:               { label:'Sessões de Usuários',          desc:'Atividade de sessões no site.', colunas:['ativosSessao','totalSessoes','totalUsuariosUnicos'] },
};

function keywordRoute(msg) {
  const tabelas = [];
  if (/divergen|peso|frete|anúncio|anuncio|auditoria|reincidente|pendente|corrigido/i.test(msg)) tabelas.push('divergencias','divergencias_stats');
  if (/produto|sku|catálogo|catalogo|kit/i.test(msg)) tabelas.push('produtos');
  if (/usuário|usuario|acesso|bloqueio/i.test(msg)) tabelas.push('usuarios');
  if (/preço|preco|precific|histórico de preço/i.test(msg)) tabelas.push('precificacao_historico');
  if (/agendador|varredura|automático/i.test(msg)) tabelas.push('agendador');
  if (/categoria/i.test(msg)) tabelas.push('categorias_ml');
  if (/conectado|conexão|token ml|conta ml|nickname/i.test(msg)) tabelas.push('ml_token');
  if (/sessão|sessao|usuário.*ativo|ativo.*agora|quantos.*acessaram/i.test(msg)) tabelas.push('sessoes');
  return { relevante: tabelas.length > 0, tabelas: [...new Set(tabelas)].slice(0,4), raciocinio:'keyword fallback' };
}

async function geminiRouter(catalogoStr, userMessage) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai      = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelId = 'gemini-2.5-flash-lite-preview-06-17';
  const systemInstruction = 'Você é um classificador de intenção. Analise a mensagem e decida quais tabelas são necessárias.\nResponda EXCLUSIVAMENTE com JSON puro.\nFormato: {"relevante":true,"tabelas":["nome_tabela"],"raciocinio":"uma frase"}\nSe nenhuma tabela: {"relevante":false,"tabelas":[],"raciocinio":"uma frase"}';
  const userPrompt = `TABELAS:\n${catalogoStr}\n\nMENSAGEM: ${userMessage}\n\nJSON puro:`;
  try {
    const r = await ai.models.generateContent({ model: modelId, config:{ temperature:0, maxOutputTokens:200, thinkingConfig:{thinkingBudget:0}, systemInstruction }, contents:[{ role:'user', parts:[{ text:userPrompt }] }] });
    return (r.text||'').trim();
  } catch {
    const r = await ai.models.generateContent({ model:'gemini-2.5-flash', config:{ temperature:0, maxOutputTokens:200, thinkingConfig:{thinkingBudget:0}, systemInstruction }, contents:[{ role:'user', parts:[{ text:userPrompt }] }] });
    return (r.text||'').trim();
  }
}

function parseRouterJson(raw) {
  if (!raw) throw new Error('Resposta vazia');
  const firstBrace = raw.indexOf('{'), lastBrace = raw.lastIndexOf('}');
  if (firstBrace===-1||lastBrace===-1) throw new Error('Nenhum {} encontrado');
  let jsonStr = raw.slice(firstBrace,lastBrace+1)
    .replace(/,\s*([\}\]])/g,'$1').replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'')
    .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?:/g,'"$2":').replace(/:\s*'([^']*)'/g,':"$1"');
  const parsed = JSON.parse(jsonStr);
  return { relevante:Boolean(parsed.relevante), tabelas:Array.isArray(parsed.tabelas)?parsed.tabelas.slice(0,4):[], raciocinio:String(parsed.raciocinio||'') };
}

async function routeDataNeeded(userMessage, userRole) {
  const isPrivileged = userRole==='OWNER'||userRole==='ADMIN';
  const catalogoStr  = Object.entries(DATA_CATALOG).filter(([,v])=>!v.privileged||isPrivileged).map(([key,v])=>`- ${key}: ${v.label}. ${v.desc}`).join('\n');
  try {
    const raw    = await geminiRouter(catalogoStr, userMessage);
    const result = parseRouterJson(raw);
    console.log(`[Router] relevante=${result.relevante} | tabelas=[${result.tabelas.join(',')}]`);
    return result;
  } catch (parseErr) {
    console.warn('[Router] Parse falhou, keyword fallback:', parseErr.message);
    return keywordRoute(userMessage);
  }
}

async function fetchSelectedData(tabelas, userId, userRole) {
  const uid  = parseInt(userId);
  const data = {};
  await Promise.all(tabelas.map(async (tabela) => {
    try {
      switch (tabela) {
        case 'produtos':
          data.produtos = await prisma.produto.findMany({ where:{ usuarioId:uid }, orderBy:{ id:'desc' } }); break;
        case 'divergencias':
          data.divergencias = await prisma.divergencia.findMany({ where:{ usuarioId:uid }, orderBy:{ createdAt:'desc' } }); break;
        case 'divergencias_stats': {
          const [pendente,reincidente,corrigido,ignorado,pendenteEnvio] = await Promise.all([
            prisma.divergencia.count({ where:{ usuarioId:uid, status:'PENDENTE' } }),
            prisma.divergencia.count({ where:{ usuarioId:uid, status:'REINCIDENTE' } }),
            prisma.divergencia.count({ where:{ usuarioId:uid, status:'CORRIGIDO' } }),
            prisma.divergencia.count({ where:{ usuarioId:uid, status:'IGNORADO' } }),
            prisma.divergencia.count({ where:{ usuarioId:uid, status:'PENDENTE_ENVIO' } }),
          ]);
          data.divergencias_stats = { pendente,reincidente,corrigido,ignorado,pendenteEnvio,total:pendente+reincidente+corrigido+ignorado+pendenteEnvio };
          break;
        }
        case 'usuarios':
          if (userRole==='OWNER'||userRole==='ADMIN')
            data.usuarios = await prisma.usuario.findMany({ orderBy:{ createdAt:'desc' }, select:{ id:true,nome:true,email:true,role:true,solicitouDesbloqueio:true,verificado:true,createdAt:true } });
          break;
        case 'precificacao_historico':
          data.precificacao_historico = await prisma.precificacaoHistorico.findMany({ where:{ usuarioId:uid }, orderBy:{ criadoEm:'desc' }, take:50 }).catch(()=>[]); break;
        case 'categorias_ml':
          data.categorias_ml = await prisma.mlCategoria.findMany({ where:{ usuarioId:uid }, orderBy:{ nome:'asc' } }).catch(()=>[]); break;
        case 'agendador':
          data.agendador = await prisma.agendadorConfig.findUnique({ where:{ usuarioId:uid } }); break;
        case 'ml_token':
          data.ml_token = await prisma.mlToken.findUnique({ where:{ usuarioId:uid }, select:{ nickname:true,expiresAt:true,mlUserId:true } }); break;
        case 'sessoes': {
          const trintaMin = new Date(Date.now()-30*60*1000);
          const [ativos,total,unicos] = await Promise.all([
            prisma.sessaoUsuario.count({ where:{ ativo:true,entradaEm:{ gte:trintaMin } } }).catch(()=>0),
            prisma.sessaoUsuario.count().catch(()=>0),
            prisma.sessaoUsuario.groupBy({ by:['usuarioId'],_count:true }).catch(()=>[]),
          ]);
          data.sessoes = { ativosSessao:ativos,totalSessoes:total,totalUsuariosUnicos:unicos.length };
          break;
        }
      }
    } catch (e) { console.warn(`[Fetch] Erro em "${tabela}":`, e.message); }
  }));
  return data;
}

function formatDataBlock(data) {
  if (!data||Object.keys(data).length===0) return null;
  const lines = ['=== DADOS DO BANCO (use para responder) ===',''];
  for (const [key,value] of Object.entries(data)) {
    const schema = DATA_CATALOG[key];
    lines.push(`--- ${schema?.label||key} ---`);
    if (Array.isArray(value)) { lines.push(`(${value.length} registros)`); value.forEach((row,i)=>lines.push(`[${i+1}] ${JSON.stringify(row)}`)); }
    else if (value&&typeof value==='object') lines.push(JSON.stringify(value,null,2));
    else lines.push(String(value??'sem dados'));
    lines.push('');
  }
  lines.push('=== FIM DOS DADOS ===');
  return lines.join('\n');
}

// ── SESSÕES ──────────────────────────────────────────────────────────────────

router.get('/api/chat/sessions/:userId', async (req, res) => {
  try { res.json(await prisma.chatSession.findMany({ where:{ usuarioId:parseInt(req.params.userId) }, orderBy:{ updatedAt:'desc' }, select:{ id:true,titulo:true,createdAt:true,updatedAt:true } })); }
  catch { res.status(500).json({ error:'Erro.' }); }
});

router.post('/api/chat/sessions', async (req, res) => {
  try { res.status(201).json(await prisma.chatSession.create({ data:{ usuarioId:parseInt(req.body.userId), titulo:req.body.titulo||'Nova conversa' } })); }
  catch { res.status(500).json({ error:'Erro.' }); }
});

router.delete('/api/chat/sessions/:id', async (req, res) => {
  try { await prisma.chatSession.delete({ where:{ id:parseInt(req.params.id) } }); res.json({ ok:true }); }
  catch { res.status(500).json({ error:'Erro' }); }
});

router.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try { res.json(await prisma.chatMessage.findMany({ where:{ sessionId:parseInt(req.params.id) }, orderBy:{ createdAt:'asc' }, select:{ id:true,role:true,content:true,imageDesc:true,createdAt:true } })); }
  catch { res.status(500).json({ error:'Erro.' }); }
});

// ── CHAT PRINCIPAL (com aprendizado integrado) ────────────────────────────────

router.post('/api/ia/chat', async (req, res) => {
  const { message, sessionId, userRole, userId, imageBase64, imageMimeType, imageOnly } = req.body;
  try {
    if (userRole==='BLOQUEADO') return res.json({ reply:'Seu perfil está bloqueado. 🔒', sources:[] });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ reply:'Chave API ausente.', sources:[] });

    let session = sessionId ? await prisma.chatSession.findUnique({ where:{ id:parseInt(sessionId) } }) : null;
    if (!session) session = await prisma.chatSession.create({ data:{ usuarioId:parseInt(userId), titulo:'Nova conversa' } });

    const imageDesc = imageBase64 ? await analyzeImage(imageBase64, imageMimeType||'image/jpeg', imageOnly?'':message) : null;

    await prisma.chatMessage.create({ data:{ sessionId:session.id, role:'user', content:message||'', imageBase64:imageBase64||null, imageDesc:imageDesc||null } });

    if (message&&message.length>3) {
      const count = await prisma.chatMessage.count({ where:{ sessionId:session.id } });
      if (count<=2) await prisma.chatSession.update({ where:{ id:session.id }, data:{ titulo:message.substring(0,50)+(message.length>50?'...':'') } });
    }

    const dbMsgs  = await prisma.chatMessage.findMany({ where:{ sessionId:session.id }, orderBy:{ createdAt:'asc' }, take:40, select:{ role:true,content:true,imageDesc:true } });
    const history = dbMsgs.map(m=>({ role:m.role, content:m.content||(m.imageDesc?'[imagem]':'') }));
    const msgEfetiva = imageOnly ? (imageDesc?`Usuário enviou imagem. Conteúdo: ${imageDesc}`:'Usuário enviou imagem') : (message||'[imagem]');

    // Busca dados do banco se necessário
    let dataBlock = null;
    if (!imageOnly&&message&&message.trim().length>2) {
      const roteamento = await routeDataNeeded(message, userRole);
      if (roteamento.relevante&&roteamento.tabelas.length>0) {
        const dados = await fetchSelectedData(roteamento.tabelas, userId, userRole);
        dataBlock = formatDataBlock(dados);
      }
    }

    const uid = parseInt(userId);
    const [totalProdutos,totalDivergencias,usuarioAtual,pendentes] = await Promise.all([
      prisma.produto.count({ where:{ usuarioId:uid } }),
      prisma.divergencia.count({ where:{ usuarioId:uid, status:{ in:['PENDENTE','REINCIDENTE'] } } }),
      prisma.usuario.findUnique({ where:{ id:uid }, select:{ id:true,nome:true,role:true } }),
      (userRole==='OWNER'||userRole==='ADMIN')
        ? prisma.usuario.findMany({ where:{ solicitouDesbloqueio:true,role:'BLOQUEADO' }, select:{ id:true,nome:true,email:true,role:true,solicitouDesbloqueio:true } })
        : Promise.resolve([]),
    ]);

    const baseContext = { totalProdutos,totalDivergencias,userRole,usuarioAtual,pendentes,imageContext:imageDesc,imageOnly:!!imageOnly,dataBlock };

    // ── SMART CHAT: usa conhecimento local + Gemini + validação em background ─
    const { reply, sources } = await smartChat(msgEfetiva, history, baseContext);

    await prisma.chatMessage.create({ data:{ sessionId:session.id, role:'ia', content:reply } });
    res.json({ reply, sessionId:session.id, sources });

  } catch (error) {
    console.error('[IA Chat]', error);
    res.status(500).json({ reply:'⚠️ Erro interno. Tente novamente!', sources:[] });
  }
});

// ── INSIGHTS PROATIVOS ────────────────────────────────────────────────────────

router.post('/api/ia/proactive', async (req, res) => {
  const { userId, userRole, pageKey } = req.body;
  try {
    if (!userId||userRole==='BLOQUEADO'||!process.env.GEMINI_API_KEY) return res.json({ insight:null,shortInsight:null });
    const uid = parseInt(userId);
    const isPrivileged = userRole==='OWNER'||userRole==='ADMIN';
    const lines = [];

    const divs = await prisma.divergencia.findMany({ where:{ usuarioId:uid,status:{ in:['PENDENTE','REINCIDENTE'] } }, orderBy:{ createdAt:'desc' }, take:10 });
    if (divs.length>0) {
      lines.push(`${divs.length} divergências ativas de peso/frete.`);
      divs.slice(0,4).forEach(d=>lines.push(`- ${d.mlItemId}: ${d.motivo} (${d.status})`));
    } else { lines.push('Sem divergências ativas.'); }

    const avisos = await prisma.avisoML.count({ where:{ usuarioId:uid,resolvido:false } }).catch(()=>0);
    if (avisos>0) lines.push(`${avisos} aviso(s) do ML ativo(s) — anúncios podem estar pausados.`);

    if (isPrivileged) {
      const pendentes = await prisma.usuario.count({ where:{ solicitouDesbloqueio:true,role:'BLOQUEADO' } });
      if (pendentes>0) lines.push(`${pendentes} usuário(s) aguardando aprovação.`);
    }

    if (lines.length===0) return res.json({ insight:null,shortInsight:null });

    const { shortInsight, fullInsight } = await generateProactiveInsight(lines, userId);

    res.json({
      insight:      fullInsight  || null,  // HTML para o chat
      shortInsight: shortInsight || null,  // texto puro ≤75 chars para o balão
    });
  } catch (e) {
    console.error('[Proactive]', e);
    res.json({ insight:null,shortInsight:null });
  }
});

router.get('/api/ia/proactive', async (req, res) => {
  const { userId, userRole } = req.query;
  try {
    if (!userId||userRole==='BLOQUEADO'||!process.env.GEMINI_API_KEY) return res.json({ insight:null });
    const uid  = parseInt(userId);
    const divs = await prisma.divergencia.findMany({ where:{ usuarioId:uid,status:{ in:['PENDENTE','REINCIDENTE'] } }, orderBy:{ createdAt:'desc' }, take:10 });
    if (divs.length===0) return res.json({ insight:null });
    const lines = [`${divs.length} divergências ativas.`];
    divs.slice(0,3).forEach(d=>lines.push(`- ${d.mlItemId}: ${d.motivo}`));
    const { fullInsight } = await generateProactiveInsight(lines, userId);
    res.json({ insight:fullInsight||null });
  } catch { res.json({ insight:null }); }
});

// ── RESUMO EXECUTIVO ──────────────────────────────────────────────────────────

router.post('/api/ia/summary', async (req, res) => {
  const { userId, dados } = req.body;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai  = new GoogleGenAI({ apiKey:process.env.GEMINI_API_KEY });
    const uid = parseInt(userId);

    const [statsDiv,totalProd,totalAvisos,agendador] = await Promise.all([
      prisma.divergencia.groupBy({ by:['status'],where:{ usuarioId:uid },_count:true }),
      prisma.produto.count({ where:{ usuarioId:uid } }),
      prisma.avisoML.count({ where:{ usuarioId:uid,resolvido:false } }).catch(()=>0),
      prisma.agendadorConfig.findUnique({ where:{ usuarioId:uid } }).catch(()=>null),
    ]);

    const statsMap = Object.fromEntries(statsDiv.map(s=>[s.status,s._count]));
    const dadosEnriquecidos = `${typeof dados==='string'?dados:JSON.stringify(dados)}

DADOS ADICIONAIS:
- Total de produtos: ${totalProd}
- Divergências PENDENTE: ${statsMap['PENDENTE']||0}
- Divergências REINCIDENTE: ${statsMap['REINCIDENTE']||0}
- Divergências CORRIGIDO: ${statsMap['CORRIGIDO']||0}
- Divergências IGNORADO: ${statsMap['IGNORADO']||0}
- Divergências PENDENTE_ENVIO: ${statsMap['PENDENTE_ENVIO']||0}
- Avisos ML ativos: ${totalAvisos}
- Agendador: ${agendador?.ativo?`ATIVO (${agendador.intervalo}min)`:'INATIVO'}
- Última varredura: ${agendador?.ultimaExecucao?new Date(agendador.ultimaExecucao).toLocaleString('pt-BR'):'Nunca'}`;

    const { buildResumoPrompt } = await import('../iaService.js');
    const response = await ai.models.generateContent({
      model:'gemini-2.5-flash',
      config:{ temperature:0.4,maxOutputTokens:2500 },
      contents:[{ role:'user', parts:[{ text:buildResumoPrompt(dadosEnriquecidos) }] }],
    });

    const conteudo = (response.text||'').trim()
      .replace(/^(conforme solicitado|aqui está|claro[,!]|segue|com base nos dados)[^\n<]*[\n<]/im,'')
      .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*([^*\n<]+)\*/g,'<b>$1</b>')
      .replace(/^#{1,6}\s+/gm,'').replace(/^-\s+/gm,'• ').trim();

    await prisma.resumoIA.create({ data:{ usuarioId:uid,conteudo } });
    res.json({ conteudo });
  } catch (e) {
    console.error('[Summary]',e);
    res.status(500).json({ error:'Erro ao gerar resumo.' });
  }
});

router.get('/api/ia/summary/history', async (req, res) => {
  try { res.json(await prisma.resumoIA.findMany({ where:{ usuarioId:parseInt(req.query.userId) }, orderBy:{ createdAt:'desc' }, take:10 })); }
  catch { res.status(500).json({ error:'Erro.' }); }
});

// ── ROTAS DO SISTEMA DE APRENDIZADO ──────────────────────────────────────────

// GET /api/ia/knowledge/stats — estatísticas do cérebro da IA
router.get('/api/ia/knowledge/stats', async (req, res) => {
  try {
    const [stats, learnerStatus, recentLogs] = await Promise.all([
      getKnowledgeStats(),
      Promise.resolve(getLearnerStatus()),
      getRecentLogs(15),
    ]);
    res.json({ stats, learner:learnerStatus, recentLogs });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// GET /api/ia/knowledge/search — busca no conhecimento acumulado
router.get('/api/ia/knowledge/search', async (req, res) => {
  try {
    const { q, limit=5 } = req.query;
    if (!q) return res.json([]);
    res.json(await queryKnowledge(q, parseInt(limit)));
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// GET /api/ia/knowledge/logs — logs de aprendizado recentes
router.get('/api/ia/knowledge/logs', async (req, res) => {
  try {
    const { limit=20 } = req.query;
    res.json(await getRecentLogs(parseInt(limit)));
  } catch (e) { res.status(500).json({ error:e.message }); }
});

export default router;