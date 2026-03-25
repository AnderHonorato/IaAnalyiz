// backend/src/ia/brain/iaBrain.js
// ═══════════════════════════════════════════════════════════════════
// CÉREBRO DA IA — Sistema de aprendizado de máquina autônomo
// Aprende com o tempo, valida respostas com Gemini, evolui sozinha
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { GoogleGenAI }  from '@google/genai';

const prisma = new PrismaClient();

// ── Constantes ────────────────────────────────────────────────────
const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_LITE     = 'gemini-2.5-flash-lite-preview-06-17';
const CONFIANCA_MINIMA      = 0.70;  // 70% — abaixo disso, pede validação ao Gemini
const MAX_CONHECIMENTO_ITEM = 2000;  // chars por item salvo
const APRENDIZADO_INTERVALO = 15 * 60 * 1000; // 15 min entre ciclos silenciosos
const CONVERSA_GEMINI_INTERVALO = 60 * 60 * 1000; // 1h entre conversas autônomas

// ── Logger interno ────────────────────────────────────────────────
function logBrain(msg, type = 'info') {
  const time = new Date().toLocaleTimeString('pt-BR');
  const prefix = { info: '🧠', warn: '⚠️ ', success: '✅', error: '❌', learn: '📚', think: '💭' }[type] || '•';
  console.log(`[IA-Brain] [${time}] ${prefix} ${msg}`);
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 1: MEMÓRIA DE LONGO PRAZO
// Salva conhecimentos, fatos e aprendizados no banco
// ─────────────────────────────────────────────────────────────────

export async function salvarConhecimento({ categoria, chave, valor, confianca = 1.0, fonte = 'sistema' }) {
  try {
    const existente = await prisma.iaConhecimento.findFirst({
      where: { categoria, chave },
    });
    if (existente) {
      // Atualiza e aumenta confiança gradualmente
      const novaConfianca = Math.min(1.0, (existente.confianca + confianca) / 2 + 0.05);
      await prisma.iaConhecimento.update({
        where: { id: existente.id },
        data: {
          valor: valor.substring(0, MAX_CONHECIMENTO_ITEM),
          confianca: novaConfianca,
          fonte,
          atualizadoEm: new Date(),
          usos: { increment: 1 },
        },
      });
    } else {
      await prisma.iaConhecimento.create({
        data: {
          categoria,
          chave,
          valor: valor.substring(0, MAX_CONHECIMENTO_ITEM),
          confianca,
          fonte,
        },
      });
    }
    logBrain(`Conhecimento salvo: [${categoria}] ${chave}`, 'learn');
  } catch (e) {
    logBrain(`Erro ao salvar conhecimento: ${e.message}`, 'error');
  }
}

export async function buscarConhecimento(categoria, limite = 20) {
  try {
    return await prisma.iaConhecimento.findMany({
      where: { categoria, confianca: { gte: CONFIANCA_MINIMA } },
      orderBy: [{ confianca: 'desc' }, { usos: 'desc' }],
      take: limite,
    });
  } catch { return []; }
}

export async function buscarConhecimentoPorChave(chave) {
  try {
    return await prisma.iaConhecimento.findFirst({
      where: { chave: { contains: chave, mode: 'insensitive' } },
      orderBy: { confianca: 'desc' },
    });
  } catch { return null; }
}

export async function buscarTodoConhecimento() {
  try {
    const items = await prisma.iaConhecimento.findMany({
      where: { confianca: { gte: 0.5 } },
      orderBy: [{ categoria: 'asc' }, { confianca: 'desc' }],
      take: 100,
    });
    return items;
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 2: VALIDAÇÃO DE RESPOSTAS COM GEMINI
// Loop: resposta local → Gemini valida → salva aprendizado
// ─────────────────────────────────────────────────────────────────

export async function validarRespostaComGemini({ pergunta, respostaTentativa, contexto = '', userId }) {
  if (!process.env.GEMINI_API_KEY) {
    return { aprovada: true, respostaFinal: respostaTentativa, motivo: 'sem_api' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Você é um avaliador de respostas de IA para um sistema de gestão logística e e-commerce chamado "IA Analyiz".

PERGUNTA DO USUÁRIO:
"${pergunta}"

RESPOSTA TENTATIVA DA IA LOCAL:
"${respostaTentativa}"

CONTEXTO DO SISTEMA:
${contexto}

AVALIE a resposta tentativa e responda APENAS em JSON puro, sem backticks, no seguinte formato:
{
  "aprovada": true/false,
  "confianca": 0.0 a 1.0,
  "motivo": "motivo curto",
  "respostaCorreta": "resposta ideal se não aprovada, null se aprovada",
  "aprendizados": ["fato 1 aprendido", "fato 2 aprendido"]
}

Critérios: aprovada=true se a resposta é correta, útil e relevante. aprovada=false se está errada, inventando dados ou incompleta.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_LITE,
      config: { temperature: 0.1, maxOutputTokens: 800 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const raw = (response.text || '').trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd   = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('JSON não encontrado');

    const resultado = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));

    // Salva o aprendizado do processo de validação
    await salvarAprendizado({
      pergunta,
      respostaTentativa,
      respostaFinal: resultado.aprovada ? respostaTentativa : (resultado.respostaCorreta || respostaTentativa),
      aprovada: resultado.aprovada,
      confianca: resultado.confianca || (resultado.aprovada ? 0.9 : 0.3),
      motivo: resultado.motivo,
      userId,
    });

    // Salva aprendizados específicos
    if (resultado.aprendizados?.length > 0) {
      for (const aprendizado of resultado.aprendizados) {
        await salvarConhecimento({
          categoria: 'aprendizado_gemini',
          chave: aprendizado.substring(0, 100),
          valor: aprendizado,
          confianca: 0.85,
          fonte: 'gemini_validacao',
        });
      }
    }

    logBrain(`Validação Gemini: ${resultado.aprovada ? '✓ aprovada' : '✗ reprovada'} (conf: ${resultado.confianca})`, resultado.aprovada ? 'success' : 'warn');

    return {
      aprovada: resultado.aprovada,
      respostaFinal: resultado.aprovada ? respostaTentativa : (resultado.respostaCorreta || respostaTentativa),
      confianca: resultado.confianca,
      motivo: resultado.motivo,
    };
  } catch (e) {
    logBrain(`Erro na validação: ${e.message}`, 'error');
    return { aprovada: true, respostaFinal: respostaTentativa, motivo: 'erro_validacao' };
  }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 3: REGISTRO DE APRENDIZADOS
// Salva cada interação com resultado bom/ruim
// ─────────────────────────────────────────────────────────────────

export async function salvarAprendizado({ pergunta, respostaTentativa, respostaFinal, aprovada, confianca, motivo, userId }) {
  try {
    await prisma.iaAprendizado.create({
      data: {
        pergunta:           pergunta.substring(0, 500),
        respostaTentativa:  respostaTentativa.substring(0, 2000),
        respostaFinal:      respostaFinal.substring(0, 2000),
        aprovada,
        confianca:          confianca || 0.5,
        motivo:             (motivo || '').substring(0, 200),
        usuarioId:          userId ? parseInt(userId) : null,
      },
    });
  } catch (e) {
    logBrain(`Erro ao salvar aprendizado: ${e.message}`, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 4: GERAÇÃO DE RESPOSTA LOCAL
// Tenta responder usando só o conhecimento salvo
// ─────────────────────────────────────────────────────────────────

export async function tentarResponderLocalmente(pergunta, userId) {
  try {
    // Busca conhecimentos relevantes
    const palavrasChave = pergunta.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const conhecimentos  = [];

    for (const palavra of palavrasChave.slice(0, 5)) {
      const items = await prisma.iaConhecimento.findMany({
        where: {
          OR: [
            { chave:  { contains: palavra, mode: 'insensitive' } },
            { valor:  { contains: palavra, mode: 'insensitive' } },
            { categoria: { contains: palavra, mode: 'insensitive' } },
          ],
          confianca: { gte: CONFIANCA_MINIMA },
        },
        orderBy: { confianca: 'desc' },
        take: 5,
      });
      conhecimentos.push(...items);
    }

    // Busca aprendizados anteriores similares
    const aprendizadosAnteriores = await prisma.iaAprendizado.findMany({
      where: {
        aprovada: true,
        pergunta: { contains: palavrasChave[0] || '', mode: 'insensitive' },
      },
      orderBy: [{ confianca: 'desc' }, { createdAt: 'desc' }],
      take: 3,
    });

    const temBase = conhecimentos.length > 0 || aprendizadosAnteriores.length > 0;
    const confiancaLocal = temBase ? Math.min(0.85, 0.5 + conhecimentos.length * 0.08) : 0.2;

    return {
      temBase,
      confiancaLocal,
      conhecimentos: [...new Map(conhecimentos.map(k => [k.id, k])).values()].slice(0, 10),
      aprendizadosAnteriores,
    };
  } catch (e) {
    logBrain(`Erro ao buscar resposta local: ${e.message}`, 'error');
    return { temBase: false, confiancaLocal: 0, conhecimentos: [], aprendizadosAnteriores: [] };
  }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 5: ANÁLISE AUTÔNOMA DO SISTEMA
// Fica estudando o site silenciosamente no terminal
// ─────────────────────────────────────────────────────────────────

export async function analisarSistemaAutonomamente(userId = null) {
  logBrain('Iniciando análise autônoma do sistema...', 'think');

  try {
    // Coleta dados atuais do sistema
    const uid = userId ? parseInt(userId) : null;
    const whereClause = uid ? { usuarioId: uid } : {};

    const [
      totalProdutos,
      totalDivergencias,
      divsPorStatus,
      produtosComFicha,
      totalAvisos,
      ultimasDiv,
      agendadores,
    ] = await Promise.all([
      prisma.produto.count({ where: whereClause }),
      prisma.divergencia.count({ where: whereClause }),
      prisma.divergencia.groupBy({ by: ['status'], where: whereClause, _count: true }),
      prisma.produto.count({ where: { ...whereClause, OR: [{ ean: { not: null } }, { marca: { not: null } }] } }),
      prisma.avisoML.count({ where: { ...whereClause, resolvido: false } }).catch(() => 0),
      prisma.divergencia.findMany({ where: { ...whereClause, status: { in: ['PENDENTE', 'REINCIDENTE'] } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.agendadorConfig.findMany({ where: uid ? { usuarioId: uid } : {}, take: 5 }),
    ]);

    const statusMap = Object.fromEntries(divsPorStatus.map(s => [s.status, s._count]));

    // Gera aprendizados a partir da análise
    const aprendizados = [];

    if (totalProdutos > 0) {
      aprendizados.push({
        categoria: 'metricas_sistema',
        chave: 'total_produtos',
        valor: `O sistema tem ${totalProdutos} produtos cadastrados. ${produtosComFicha} possuem ficha técnica completa (${Math.round(produtosComFicha/totalProdutos*100)}%).`,
        confianca: 1.0,
      });
    }

    if (totalDivergencias > 0) {
      const pendentes = (statusMap['PENDENTE'] || 0) + (statusMap['REINCIDENTE'] || 0);
      aprendizados.push({
        categoria: 'metricas_divergencias',
        chave: 'estado_divergencias',
        valor: `Divergências totais: ${totalDivergencias}. Pendentes: ${pendentes}. Corrigidas: ${statusMap['CORRIGIDO'] || 0}. Reincidentes: ${statusMap['REINCIDENTE'] || 0}. Ignoradas: ${statusMap['IGNORADO'] || 0}.`,
        confianca: 1.0,
      });
    }

    if (ultimasDiv.length > 0) {
      const topMotivos = ultimasDiv.slice(0, 3).map(d => `${d.mlItemId}: ${d.motivo}`).join(' | ');
      aprendizados.push({
        categoria: 'divergencias_recentes',
        chave: 'ultimas_divergencias',
        valor: `Divergências mais recentes: ${topMotivos}`,
        confianca: 0.9,
      });
    }

    if (totalAvisos > 0) {
      aprendizados.push({
        categoria: 'avisos_ml',
        chave: 'avisos_ativos',
        valor: `Há ${totalAvisos} aviso(s) ativo(s) do Mercado Livre sobre anúncios com peso ou dimensões incorretos.`,
        confianca: 1.0,
      });
    }

    agendadores.forEach(ag => {
      aprendizados.push({
        categoria: 'configuracao_sistema',
        chave: `agendador_usuario_${ag.usuarioId}`,
        valor: `Agendador de varredura: ${ag.ativo ? `ATIVO a cada ${ag.intervalo} min` : 'INATIVO'}. Última execução: ${ag.ultimaExecucao ? new Date(ag.ultimaExecucao).toLocaleString('pt-BR') : 'nunca'}.`,
        confianca: 0.95,
      });
    });

    // Salva todos os aprendizados
    for (const ap of aprendizados) {
      await salvarConhecimento({ ...ap, fonte: 'analise_autonoma' });
    }

    // Registra a análise no terminal de estudos
    await registrarEstudoTerminal({
      tipo: 'analise_sistema',
      resumo: `Analisei ${totalProdutos} produtos, ${totalDivergencias} divergências, ${totalAvisos} avisos ML. ${aprendizados.length} conhecimentos atualizados.`,
      detalhes: JSON.stringify({ totalProdutos, totalDivergencias, statusMap, totalAvisos }),
    });

    logBrain(`Análise concluída: ${aprendizados.length} aprendizados gerados`, 'success');
    return { sucesso: true, aprendizados: aprendizados.length };
  } catch (e) {
    logBrain(`Erro na análise autônoma: ${e.message}`, 'error');
    return { sucesso: false, erro: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 6: TERMINAL DE ESTUDOS
// Registra tudo que a IA aprende/pensa (visível no console)
// ─────────────────────────────────────────────────────────────────

export async function registrarEstudoTerminal({ tipo, resumo, detalhes = null }) {
  try {
    await prisma.iaEstudoTerminal.create({
      data: {
        tipo:     tipo.substring(0, 50),
        resumo:   resumo.substring(0, 500),
        detalhes: detalhes ? detalhes.substring(0, 2000) : null,
      },
    });
    logBrain(`[ESTUDO] ${tipo}: ${resumo.substring(0, 80)}`, 'learn');
  } catch {}
}

export async function buscarHistoricoEstudos(limite = 20) {
  try {
    return await prisma.iaEstudoTerminal.findMany({
      orderBy: { createdAt: 'desc' },
      take: limite,
    });
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 7: CONVERSA AUTÔNOMA COM GEMINI
// A IA conversa periodicamente com Gemini para evoluir
// ─────────────────────────────────────────────────────────────────

export async function conversarComGeminiAutonomamente() {
  if (!process.env.GEMINI_API_KEY) return;

  logBrain('Iniciando conversa autônoma com Gemini...', 'think');

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Busca o estado atual do conhecimento
    const conhecimentos = await buscarTodoConhecimento();
    const estudos       = await buscarHistoricoEstudos(5);

    const contextoBrain = conhecimentos.slice(0, 20).map(k =>
      `[${k.categoria}] ${k.chave}: ${k.valor.substring(0, 150)}`
    ).join('\n');

    const ultimosEstudos = estudos.map(e =>
      `${e.tipo}: ${e.resumo}`
    ).join('\n');

    const prompt = `Você é um mentor de IA para um sistema chamado "IA Analyiz" — assistente de gestão logística e e-commerce.

O sistema está aprendendo autonomamente. Aqui está o que ele já sabe:

CONHECIMENTOS ATUAIS (${conhecimentos.length} itens):
${contextoBrain}

ÚLTIMOS ESTUDOS:
${ultimosEstudos}

Como mentor, responda em JSON puro (sem backticks):
{
  "avaliacao": "Como está o aprendizado do sistema (curta análise)",
  "pontosMelhorar": ["ponto 1", "ponto 2", "ponto 3"],
  "novosConhecimentos": [
    {"chave": "algo importante sobre logística", "valor": "explicação detalhada"},
    {"chave": "dica sobre ML e fretes", "valor": "explicação detalhada"}
  ],
  "perguntaParaRefletir": "Uma pergunta profunda para o sistema pensar",
  "acaoSugerida": "Uma ação concreta que o sistema deveria tomar agora"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_LITE,
      config: { temperature: 0.4, maxOutputTokens: 1000 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const raw = (response.text || '').trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd   = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('JSON inválido');

    const mentoria = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));

    // Salva os novos conhecimentos recebidos do Gemini
    if (mentoria.novosConhecimentos?.length > 0) {
      for (const nc of mentoria.novosConhecimentos) {
        await salvarConhecimento({
          categoria: 'mentoria_gemini',
          chave: nc.chave.substring(0, 100),
          valor: nc.valor,
          confianca: 0.88,
          fonte: 'gemini_mentoria',
        });
      }
    }

    // Registra a conversa no terminal
    await registrarEstudoTerminal({
      tipo: 'mentoria_gemini',
      resumo: mentoria.avaliacao || 'Sessão de mentoria concluída',
      detalhes: JSON.stringify({
        pontosMelhorar: mentoria.pontosMelhorar,
        pergunta:       mentoria.perguntaParaRefletir,
        acao:           mentoria.acaoSugerida,
        novosConhecimentos: mentoria.novosConhecimentos?.length || 0,
      }),
    });

    logBrain(`Mentoria Gemini concluída: ${mentoria.novosConhecimentos?.length || 0} novos conhecimentos`, 'success');
    logBrain(`Reflexão: ${mentoria.perguntaParaRefletir}`, 'think');
    logBrain(`Ação sugerida: ${mentoria.acaoSugerida}`, 'info');

    return mentoria;
  } catch (e) {
    logBrain(`Erro na conversa autônoma: ${e.message}`, 'error');
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 8: PIPELINE COMPLETO DE RESPOSTA
// Fluxo: local → valida → Gemini se necessário → aprende
// ─────────────────────────────────────────────────────────────────

export async function processarMensagemComAprendizado({
  mensagem, sessionId, userRole, userId,
  imageBase64 = null, imageMimeType = null, imageOnly = false,
  historyRaw = [], dataBlock = null,
}) {
  logBrain(`Processando mensagem: "${mensagem?.substring(0, 60)}"`, 'think');

  // 1. Tenta resposta local
  const { temBase, confiancaLocal, conhecimentos, aprendizadosAnteriores } = await tentarResponderLocalmente(mensagem, userId);

  // 2. Monta contexto com conhecimento local
  const contextoBrain = conhecimentos.length > 0
    ? `\nCONHECIMENTO INTERNO DA IA (aprendido autonomamente):\n${conhecimentos.map(k => `• [${k.categoria}] ${k.valor}`).join('\n')}\n`
    : '';

  const contextoAprendizados = aprendizadosAnteriores.length > 0
    ? `\nRESPOSTAS ANTERIORES VALIDADAS:\n${aprendizadosAnteriores.map(a => `P: ${a.pergunta}\nR: ${a.respostaFinal}`).join('\n\n')}\n`
    : '';

  // 3. Envia para Gemini com todo o contexto
  const { buildAnswer, analyzeImage } = await import('../iaService.js');

  let imageDesc = null;
  if (imageBase64) {
    imageDesc = await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', imageOnly ? '' : mensagem);
  }

  const uid = userId ? parseInt(userId) : 0;
  const [totalProdutos, totalDivergencias, usuarioAtual, pendentes] = await Promise.all([
    prisma.produto.count({ where: { usuarioId: uid } }),
    prisma.divergencia.count({ where: { usuarioId: uid, status: { in: ['PENDENTE','REINCIDENTE'] } } }),
    prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }).catch(() => null),
    (userRole === 'OWNER' || userRole === 'ADMIN')
      ? prisma.usuario.findMany({ where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }, select: { id: true, nome: true, email: true } })
      : Promise.resolve([]),
  ]).catch(() => [0, 0, null, []]);

  const msgEfetiva = imageOnly
    ? (imageDesc ? `Usuário enviou imagem. Conteúdo: ${imageDesc}` : 'Usuário enviou imagem')
    : (mensagem || '[imagem]');

  // DataBlock enriquecido com conhecimento local
  const dataBlockEnriquecido = [
    dataBlock || '',
    contextoBrain,
    contextoAprendizados,
  ].filter(Boolean).join('\n');

  const { reply, sources } = await buildAnswer(
    msgEfetiva,
    historyRaw,
    {
      totalProdutos:     typeof totalProdutos === 'number' ? totalProdutos : 0,
      totalDivergencias: typeof totalDivergencias === 'number' ? totalDivergencias : 0,
      userRole,
      usuarioAtual:      Array.isArray(usuarioAtual) ? null : usuarioAtual,
      pendentes:         Array.isArray(pendentes) ? pendentes : [],
      imageContext:      imageDesc,
      imageOnly:         !!imageOnly,
      dataBlock:         dataBlockEnriquecido || null,
    }
  );

  // 4. Valida a resposta com Gemini (amostragem: 1 em cada 3 mensagens)
  const deveValidar = Math.random() < 0.33 && !imageOnly;
  let respostaFinal = reply;

  if (deveValidar && mensagem && mensagem.length > 10) {
    const validacao = await validarRespostaComGemini({
      pergunta:          mensagem,
      respostaTentativa: reply,
      contexto:          dataBlockEnriquecido.substring(0, 500),
      userId,
    });
    respostaFinal = validacao.respostaFinal || reply;

    // Aprende com o resultado
    await salvarAprendizado({
      pergunta:          mensagem,
      respostaTentativa: reply,
      respostaFinal,
      aprovada:          validacao.aprovada,
      confianca:         validacao.confianca || 0.7,
      motivo:            validacao.motivo,
      userId,
    });
  } else {
    // Salva sem validação com confiança moderada
    if (mensagem && mensagem.length > 5) {
      await salvarAprendizado({
        pergunta:          mensagem,
        respostaTentativa: reply,
        respostaFinal:     reply,
        aprovada:          true,
        confianca:         confiancaLocal,
        motivo:            'sem_validacao',
        userId,
      });
    }
  }

  // 5. Extrai e salva conhecimentos da conversa
  await extrairConhecimentosDaConversa(mensagem, respostaFinal);

  logBrain(`Resposta processada (validada: ${deveValidar}, conf local: ${confiancaLocal.toFixed(2)})`, 'success');

  return { reply: respostaFinal, sources };
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 9: EXTRAÇÃO AUTOMÁTICA DE CONHECIMENTO
// Aprende automaticamente de cada conversa
// ─────────────────────────────────────────────────────────────────

async function extrairConhecimentosDaConversa(pergunta, resposta) {
  if (!pergunta || !resposta || pergunta.length < 10) return;

  try {
    // Padrões para aprender automaticamente
    const padroes = [
      { regex: /divergên|peso|frete|ml|anúncio/i, categoria: 'logistica' },
      { regex: /produto|sku|kit|catálogo/i,        categoria: 'produtos' },
      { regex: /usuário|acesso|bloqueio/i,          categoria: 'usuarios' },
      { regex: /configuração|agendador|varredura/i,  categoria: 'configuracao' },
    ];

    for (const p of padroes) {
      if (p.regex.test(pergunta) || p.regex.test(resposta)) {
        const chave = pergunta.substring(0, 80).replace(/[^a-zA-Z0-9áéíóúãõ\s]/g, '').trim();
        if (chave.length > 5) {
          await salvarConhecimento({
            categoria: `conversa_${p.categoria}`,
            chave,
            valor: `P: ${pergunta.substring(0, 200)} | R: ${resposta.replace(/<[^>]+>/g, '').substring(0, 300)}`,
            confianca: 0.65,
            fonte: 'conversa_usuario',
          });
        }
        break;
      }
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 10: GERADOR DE INSIGHT CURTO PARA BALÃO
// Garante que o insight cabe no balão flutuante
// ─────────────────────────────────────────────────────────────────

export async function gerarInsightCurto(linhas) {
  if (!process.env.GEMINI_API_KEY || !linhas?.length) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_LITE,
      config: {
        temperature: 0.3,
        maxOutputTokens: 60, // Muito curto — cabe no balão
        thinkingConfig: { thinkingBudget: 0 },
      },
      contents: [{
        role: 'user',
        parts: [{
          text: `Dados: ${linhas.join(' | ')}\n\nGere 1 alerta CURTÍSSIMO (máx 90 chars) para gestor e-commerce. SEM ponto final. Comece com emoji. Exemplos: "🚨 3 anúncios divergentes no frete, 1 reincidente" ou "⚠️ 2 anúncios pausados pelo ML detectados"`,
        }],
      }],
    });

    const texto = (response.text || '').trim().replace(/\.$/, '').substring(0, 90);
    return texto || null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────
// SEÇÃO 11: LOOP DE APRENDIZADO CONTÍNUO
// Roda em background, analisa e aprende periodicamente
// ─────────────────────────────────────────────────────────────────

let _loopAtivo = false;
let _ultimaConversa = 0;

export async function iniciarLoopAprendizado() {
  if (_loopAtivo) return;
  _loopAtivo = true;

  logBrain('🚀 Loop de aprendizado contínuo iniciado!', 'info');

  const ciclo = async () => {
    if (!_loopAtivo) return;

    try {
      // 1. Analisa o sistema
      await analisarSistemaAutonomamente();

      // 2. Conversa com Gemini a cada hora
      const agora = Date.now();
      if (agora - _ultimaConversa > CONVERSA_GEMINI_INTERVALO) {
        _ultimaConversa = agora;
        await conversarComGeminiAutonomamente();
      }

      // 3. Limpa aprendizados muito antigos com baixa confiança
      await limparAprendizadosAntigos();

    } catch (e) {
      logBrain(`Erro no ciclo: ${e.message}`, 'error');
    }

    // Agenda próximo ciclo
    setTimeout(ciclo, APRENDIZADO_INTERVALO);
  };

  // Primeiro ciclo após 30s
  setTimeout(ciclo, 30000);
}

export function pararLoopAprendizado() {
  _loopAtivo = false;
  logBrain('Loop de aprendizado parado', 'warn');
}

async function limparAprendizadosAntigos() {
  try {
    const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.iaAprendizado.deleteMany({
      where: {
        aprovada:  false,
        confianca: { lt: 0.3 },
        createdAt: { lt: trintaDiasAtras },
      },
    });
  } catch {}
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS ADICIONAIS
// ─────────────────────────────────────────────────────────────────

export async function getEstatisticasAprendizado() {
  try {
    const [totalConhecimentos, totalAprendizados, aprovados, reprovados, ultimoEstudo] = await Promise.all([
      prisma.iaConhecimento.count(),
      prisma.iaAprendizado.count(),
      prisma.iaAprendizado.count({ where: { aprovada: true } }),
      prisma.iaAprendizado.count({ where: { aprovada: false } }),
      prisma.iaEstudoTerminal.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);

    return {
      totalConhecimentos,
      totalAprendizados,
      taxaAcerto: totalAprendizados > 0 ? Math.round((aprovados / totalAprendizados) * 100) : 0,
      aprovados,
      reprovados,
      ultimoEstudo: ultimoEstudo?.createdAt || null,
      loopAtivo: _loopAtivo,
    };
  } catch {
    return { totalConhecimentos: 0, totalAprendizados: 0, taxaAcerto: 0, loopAtivo: _loopAtivo };
  }
}