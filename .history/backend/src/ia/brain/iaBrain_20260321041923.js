// backend/src/ia/brain/iaBrain.js
// ═══════════════════════════════════════════════════════════════════════════════
// CÉREBRO DA IA ANALYIZ — Sistema de Aprendizado de Máquina Autônomo
// ─── Funcionalidades ───────────────────────────────────────────────────────────
// 1. Memória de longo prazo: aprende e salva conhecimentos no banco
// 2. Análise autônoma: estuda o site silenciosamente a cada 15min
// 3. Validação com Gemini: 1 em 3 respostas são checadas pelo Gemini
// 4. Loop contínuo: conversa com Gemini a cada 1h para evoluir
// 5. Insights curtos: balão de notificação com máx 90 chars
// 6. Terminal de estudos: exibe no console o que a IA está pensando
// ═══════════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { GoogleGenAI }  from '@google/genai';

const prisma = new PrismaClient();

// ─── Configurações ────────────────────────────────────────────────────────────
const GEMINI_FLASH      = 'gemini-2.5-flash';
const GEMINI_LITE       = 'gemini-2.5-flash';
const CONFIANCA_MINIMA  = 0.68;
const MAX_CHARS_VALOR   = 2000;
const CICLO_ANALISE_MS  = 15 * 60 * 1000;   // 15 min
const CICLO_MENTORIA_MS = 60 * 60 * 1000;   // 1h
const BALAO_MAX_CHARS   = 88;               // cabe no balão flutuante

// ─── Logger colorido no terminal ──────────────────────────────────────────────
const ICONS = {
  info:    '🧠', warn: '⚠️ ', success: '✅', error: '❌',
  learn:   '📚', think: '💭', mentor: '🎓', analyze: '🔬',
};
function logBrain(msg, type = 'info') {
  const t   = new Date().toLocaleTimeString('pt-BR');
  const ico = ICONS[type] || '•';
  console.log(`\x1b[36m[IA-Brain]\x1b[0m [${t}] ${ico}  ${msg}`);
}

// ─── Helper: cliente Gemini ───────────────────────────────────────────────────
function geminiClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 1 — MEMÓRIA DE LONGO PRAZO
// Salva e recupera fatos aprendidos com nível de confiança
// ═══════════════════════════════════════════════════════════════════════════════

export async function salvarConhecimento({
  categoria, chave, valor, confianca = 0.7, fonte = 'sistema',
}) {
  try {
    const existente = await prisma.iaConhecimento.findFirst({
      where: { categoria, chave },
    });
    if (existente) {
      // Reforça a confiança progressivamente (efeito de repetição)
      const novaConfianca = Math.min(1.0, existente.confianca * 0.85 + confianca * 0.15 + 0.02);
      await prisma.iaConhecimento.update({
        where: { id: existente.id },
        data: {
          valor:       valor.substring(0, MAX_CHARS_VALOR),
          confianca:   novaConfianca,
          fonte,
          atualizadoEm: new Date(),
          usos:        { increment: 1 },
        },
      });
    } else {
      await prisma.iaConhecimento.create({
        data: {
          categoria,
          chave:    chave.substring(0, 120),
          valor:    valor.substring(0, MAX_CHARS_VALOR),
          confianca,
          fonte,
        },
      });
    }
    logBrain(`Conhecimento salvo: [${categoria}] ${chave.substring(0, 60)}`, 'learn');
  } catch (e) {
    logBrain(`Erro ao salvar conhecimento: ${e.message}`, 'error');
  }
}

export async function buscarConhecimento(categoria, limite = 20) {
  try {
    return await prisma.iaConhecimento.findMany({
      where:   { categoria, confianca: { gte: CONFIANCA_MINIMA } },
      orderBy: [{ confianca: 'desc' }, { usos: 'desc' }],
      take:    limite,
    });
  } catch { return []; }
}

export async function buscarConhecimentoSemantico(palavras = [], limite = 12) {
  if (!palavras.length) return [];
  try {
    // Busca por múltiplas palavras em chave ou valor
    const condicoes = palavras.slice(0, 5).map(p => [
      { chave: { contains: p, mode: 'insensitive' } },
      { valor: { contains: p, mode: 'insensitive' } },
    ]).flat();

    const items = await prisma.iaConhecimento.findMany({
      where:   { OR: condicoes, confianca: { gte: CONFIANCA_MINIMA - 0.1 } },
      orderBy: [{ confianca: 'desc' }, { usos: 'desc' }],
      take:    limite,
    });
    // Deduplica por id
    return [...new Map(items.map(k => [k.id, k])).values()];
  } catch { return []; }
}

export async function buscarTodoConhecimento(limiteAlta = 60) {
  try {
    return await prisma.iaConhecimento.findMany({
      where:   { confianca: { gte: 0.45 } },
      orderBy: [{ confianca: 'desc' }, { usos: 'desc' }],
      take:    limiteAlta,
    });
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 2 — REGISTRO DE APRENDIZADOS (histórico de acertos/erros)
// ═══════════════════════════════════════════════════════════════════════════════

export async function salvarAprendizado({
  pergunta, respostaTentativa, respostaFinal,
  aprovada, confianca = 0.5, motivo = '', userId = null,
}) {
  try {
    await prisma.iaAprendizado.create({
      data: {
        pergunta:          pergunta.substring(0, 500),
        respostaTentativa: respostaTentativa.substring(0, 2000),
        respostaFinal:     respostaFinal.substring(0, 2000),
        aprovada,
        confianca,
        motivo:            motivo.substring(0, 200),
        usuarioId:         userId ? parseInt(userId) : null,
      },
    });
  } catch (e) {
    logBrain(`Erro ao salvar aprendizado: ${e.message}`, 'error');
  }
}

export async function buscarAprendizadosSimilares(pergunta, limite = 4) {
  try {
    const palavras = pergunta.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 4);
    if (!palavras.length) return [];
    const condicoes = palavras.map(p => ({
      pergunta: { contains: p, mode: 'insensitive' },
    }));
    return await prisma.iaAprendizado.findMany({
      where:   { OR: condicoes, aprovada: true, confianca: { gte: 0.6 } },
      orderBy: [{ confianca: 'desc' }, { createdAt: 'desc' }],
      take:    limite,
    });
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 3 — TERMINAL DE ESTUDOS (log estruturado)
// ═══════════════════════════════════════════════════════════════════════════════

export async function registrarEstudo({ tipo, resumo, detalhes = null }) {
  try {
    await prisma.iaEstudoTerminal.create({
      data: {
        tipo:     tipo.substring(0, 60),
        resumo:   resumo.substring(0, 500),
        detalhes: detalhes ? JSON.stringify(detalhes).substring(0, 3000) : null,
      },
    });
    logBrain(`[ESTUDO] ${tipo.toUpperCase()} — ${resumo.substring(0, 90)}`, 'think');
  } catch {}
}

export async function buscarEstudosRecentes(limite = 40) {
  try {
    return await prisma.iaEstudoTerminal.findMany({
      orderBy: { createdAt: 'desc' },
      take:    limite,
    });
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 4 — ANÁLISE AUTÔNOMA DO SISTEMA
// Coleta dados do banco e gera conhecimentos sem precisar do Gemini
// ═══════════════════════════════════════════════════════════════════════════════

export async function analisarSistemaAutonomamente(userId = null) {
  logBrain('Iniciando análise autônoma do sistema...', 'analyze');

  try {
    const uid          = userId ? parseInt(userId) : null;
    const whereClause  = uid ? { usuarioId: uid } : {};

    // Coleta tudo em paralelo
    const [
      totalProdutos,
      totalDivs,
      divsPorStatus,
      produtosComFicha,
      totalAvisos,
      ultimasDivs,
      agendadores,
      totalUsuarios,
      sessaoStats,
    ] = await Promise.all([
      prisma.produto.count({ where: whereClause }),
      prisma.divergencia.count({ where: whereClause }),
      prisma.divergencia.groupBy({ by: ['status'], where: whereClause, _count: true }),
      prisma.produto.count({
        where: { ...whereClause, OR: [{ ean: { not: null } }, { marca: { not: null } }] },
      }),
      prisma.avisoML.count({ where: { ...whereClause, resolvido: false } }).catch(() => 0),
      prisma.divergencia.findMany({
        where:   { ...whereClause, status: { in: ['PENDENTE', 'REINCIDENTE'] } },
        orderBy: { createdAt: 'desc' },
        take:    10,
      }),
      prisma.agendadorConfig.findMany({
        where: uid ? { usuarioId: uid } : {},
        take:  5,
      }),
      prisma.usuario.count().catch(() => 0),
      prisma.sessaoUsuario.count({ where: { ativo: true } }).catch(() => 0),
    ]);

    const statusMap = Object.fromEntries(divsPorStatus.map(s => [s.status, s._count]));
    const pendentes = (statusMap.PENDENTE || 0) + (statusMap.REINCIDENTE || 0);
    const taxaCorr  = totalDivs > 0
      ? Math.round(((statusMap.CORRIGIDO || 0) / totalDivs) * 100) : 0;

    // ── Gera conhecimentos estruturados ────────────────────────────────────
    const conhecimentos = [];

    if (totalProdutos > 0) {
      const pctFicha = Math.round((produtosComFicha / totalProdutos) * 100);
      conhecimentos.push({
        categoria: 'metricas_produtos',
        chave:     'resumo_catalogo',
        valor:     `Catálogo: ${totalProdutos} produtos cadastrados. ${produtosComFicha} (${pctFicha}%) possuem ficha técnica (EAN/marca). Produtos sem ficha técnica não passam pela auditoria de conciliação ML.`,
        confianca: 1.0,
      });
    }

    if (totalDivs > 0) {
      conhecimentos.push({
        categoria: 'metricas_divergencias',
        chave:     'estado_atual_divergencias',
        valor:     `Divergências: ${totalDivs} total. ${pendentes} ativas (pendente + reincidente). Corrigidas: ${statusMap.CORRIGIDO || 0}. Reincidentes: ${statusMap.REINCIDENTE || 0}. Ignoradas: ${statusMap.IGNORADO || 0}. Fila API: ${statusMap.PENDENTE_ENVIO || 0}. Taxa de correção: ${taxaCorr}%.`,
        confianca: 1.0,
      });
    }

    if (pendentes === 0 && totalDivs > 0) {
      conhecimentos.push({
        categoria: 'saude_logistica',
        chave:     'sem_pendencias',
        valor:     `Logística 100% saudável: nenhuma divergência pendente. Todas as ${totalDivs} divergências detectadas foram resolvidas ou ignoradas.`,
        confianca: 0.95,
      });
    }

    if (ultimasDivs.length > 0) {
      const topMotivo = ultimasDivs[0];
      const diffMedia = ultimasDivs.reduce((s, d) => s + Math.abs(d.pesoMl - d.pesoLocal), 0) / ultimasDivs.length;
      conhecimentos.push({
        categoria: 'divergencias_recentes',
        chave:     'top_divergencias',
        valor:     `Divergências recentes (${ultimasDivs.length}): maior erro médio de ${Math.round(diffMedia)}g. Exemplo: ${topMotivo.mlItemId} — ${(topMotivo.motivo || '').substring(0, 100)}.`,
        confianca: 0.92,
      });
    }

    if (totalAvisos > 0) {
      conhecimentos.push({
        categoria: 'avisos_ml',
        chave:     'avisos_ativos',
        valor:     `⚠️ ${totalAvisos} aviso(s) ativo(s) do Mercado Livre sobre anúncios com peso ou dimensões incorretos. Esses anúncios podem estar pausados pelo próprio ML.`,
        confianca: 1.0,
      });
    }

    agendadores.forEach(ag => {
      conhecimentos.push({
        categoria: 'configuracao_agendador',
        chave:     `agendador_user_${ag.usuarioId}`,
        valor:     `Agendador usuário ${ag.usuarioId}: ${ag.ativo ? `ATIVO (a cada ${ag.intervalo}min)` : 'INATIVO'}. Última varredura: ${ag.ultimaExecucao ? new Date(ag.ultimaExecucao).toLocaleString('pt-BR') : 'nunca'}.`,
        confianca: 0.98,
      });
    });

    if (totalUsuarios > 0) {
      conhecimentos.push({
        categoria: 'metricas_usuarios',
        chave:     'usuarios_plataforma',
        valor:     `Plataforma tem ${totalUsuarios} usuário(s) cadastrados. ${sessaoStats} usuário(s) ativos agora.`,
        confianca: 0.9,
      });
    }

    // ── Salva todos os conhecimentos gerados ───────────────────────────────
    for (const c of conhecimentos) {
      await salvarConhecimento({ ...c, fonte: 'analise_autonoma' });
    }

    // ── Registra no terminal de estudos ────────────────────────────────────
    await registrarEstudo({
      tipo:    'analise_sistema',
      resumo:  `Analisei ${totalProdutos} produtos, ${totalDivs} divergências (${pendentes} ativas), ${totalAvisos} avisos ML. ${conhecimentos.length} conhecimentos atualizados.`,
      detalhes: { totalProdutos, totalDivs, statusMap, totalAvisos, sessaoStats },
    });

    logBrain(`Análise concluída: ${conhecimentos.length} conhecimentos gerados`, 'success');
    return { sucesso: true, conhecimentos: conhecimentos.length };

  } catch (e) {
    logBrain(`Erro na análise autônoma: ${e.message}`, 'error');
    return { sucesso: false, erro: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 5 — VALIDAÇÃO COM GEMINI (loop de aprovação/reprovação)
// Fluxo: resposta local → Gemini valida → aprende com o resultado
// ═══════════════════════════════════════════════════════════════════════════════

export async function validarRespostaComGemini({
  pergunta, respostaTentativa, contexto = '', userId,
}) {
  if (!process.env.GEMINI_API_KEY) {
    return { aprovada: true, respostaFinal: respostaTentativa, confianca: 0.5, motivo: 'sem_api' };
  }

  try {
    const ai = geminiClient();

    const prompt = `Você é um avaliador de qualidade de respostas de IA para o sistema "IA Analyiz" — gestão logística e e-commerce.

PERGUNTA DO USUÁRIO:
"${pergunta.substring(0, 400)}"

RESPOSTA TENTATIVA DA IA:
"${respostaTentativa.replace(/<[^>]+>/g, '').substring(0, 600)}"

CONTEXTO DO SISTEMA:
${contexto.substring(0, 400)}

Avalie e responda SOMENTE com JSON puro (sem markdown, sem backticks):
{
  "aprovada": true,
  "confianca": 0.85,
  "motivo": "explicação curta (1 frase)",
  "respostaCorreta": null,
  "aprendizados": ["fato 1 importante aprendido", "fato 2"]
}

Regras:
- aprovada=true se correta, útil, baseada em dados reais
- aprovada=false se inventou dados, está incompleta ou errada
- respostaCorreta: preencha APENAS se aprovada=false, com a resposta ideal em HTML
- aprendizados: 1-3 fatos concretos extraídos da conversa para guardar na memória`;

    const response = await ai.models.generateContent({
      model:    GEMINI_LITE,
      config:   { temperature: 0.05, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const raw   = (response.text || '').trim();
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON não encontrado na resposta Gemini');

    const resultado = JSON.parse(
      raw.slice(start, end + 1)
        .replace(/,\s*([\}\]])/g, '$1')
        .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?:/g, '"$2":')
    );

    // ── Salva aprendizados extraídos ──────────────────────────────────────
    if (Array.isArray(resultado.aprendizados)) {
      for (const ap of resultado.aprendizados) {
        if (typeof ap === 'string' && ap.length > 10) {
          await salvarConhecimento({
            categoria: 'aprendizado_validacao',
            chave:     ap.substring(0, 100),
            valor:     ap,
            confianca: resultado.aprovada ? 0.82 : 0.55,
            fonte:     'gemini_validacao',
          });
        }
      }
    }

    // ── Salva o resultado do aprendizado ──────────────────────────────────
    await salvarAprendizado({
      pergunta,
      respostaTentativa,
      respostaFinal: resultado.aprovada
        ? respostaTentativa
        : (resultado.respostaCorreta || respostaTentativa),
      aprovada:  resultado.aprovada,
      confianca: resultado.confianca || (resultado.aprovada ? 0.85 : 0.3),
      motivo:    resultado.motivo || '',
      userId,
    });

    logBrain(
      `Validação: ${resultado.aprovada ? '✓ aprovada' : '✗ reprovada'} | conf=${resultado.confianca} | ${resultado.motivo}`,
      resultado.aprovada ? 'success' : 'warn',
    );

    // ── Registra no terminal ──────────────────────────────────────────────
    await registrarEstudo({
      tipo:    'validacao_resposta',
      resumo:  `Pergunta: "${pergunta.substring(0, 60)}" → ${resultado.aprovada ? 'APROVADA' : 'REPROVADA'} (${resultado.motivo})`,
      detalhes: { aprovada: resultado.aprovada, confianca: resultado.confianca, aprendizados: resultado.aprendizados },
    });

    return {
      aprovada:      resultado.aprovada,
      respostaFinal: resultado.aprovada
        ? respostaTentativa
        : (resultado.respostaCorreta || respostaTentativa),
      confianca:     resultado.confianca || 0.7,
      motivo:        resultado.motivo || '',
    };

  } catch (e) {
    logBrain(`Erro na validação Gemini: ${e.message}`, 'error');
    // Em caso de erro, aprova por padrão para não travar o usuário
    return { aprovada: true, respostaFinal: respostaTentativa, confianca: 0.5, motivo: 'erro_validacao' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 6 — MENTORIA AUTÔNOMA COM GEMINI
// A IA pergunta ao Gemini como melhorar, recebe conhecimentos novos
// ═══════════════════════════════════════════════════════════════════════════════

export async function conversarComGeminiAutonomamente() {
  if (!process.env.GEMINI_API_KEY) return null;
  logBrain('Sessão de mentoria com Gemini iniciada...', 'mentor');

  try {
    const ai = geminiClient();

    // Resume o estado atual da IA
    const [conhecimentos, estudos, statsAprendizado] = await Promise.all([
      buscarTodoConhecimento(30),
      buscarEstudosRecentes(8),
      getEstatisticasAprendizado(),
    ]);

    const resumoConhecimento = conhecimentos.slice(0, 20)
      .map(k => `[${k.categoria}] ${k.chave}: ${k.valor.substring(0, 100)}`)
      .join('\n');

    const resumoEstudos = estudos.slice(0, 5)
      .map(e => `${e.tipo}: ${e.resumo.substring(0, 80)}`)
      .join('\n');

    const prompt = `Você é mentor de uma IA chamada "IA Analyiz" — assistente de gestão logística para e-commerce (Mercado Livre, Shopee, Amazon).

ESTADO ATUAL DA IA:
- Conhecimentos armazenados: ${conhecimentos.length}
- Total de interações: ${statsAprendizado.totalAprendizados}
- Taxa de acerto: ${statsAprendizado.taxaAcerto}%
- Aprovadas: ${statsAprendizado.aprovados} | Reprovadas: ${statsAprendizado.reprovados}

ALGUNS CONHECIMENTOS:
${resumoConhecimento}

ÚLTIMOS ESTUDOS:
${resumoEstudos}

Como mentor, oriente a IA sobre como melhorar. Responda APENAS com JSON puro (sem markdown, sem backticks):
{
  "avaliacao": "análise curta do estado atual",
  "pontosMelhorar": ["ponto 1", "ponto 2", "ponto 3"],
  "novosConhecimentos": [
    {"chave": "sobre divergências de frete ML", "valor": "explicação detalhada útil"},
    {"chave": "dica sobre logística e-commerce", "valor": "explicação detalhada"}
  ],
  "perguntaReflexao": "pergunta profunda para a IA pensar",
  "acaoImediata": "ação concreta que a IA deve executar agora"
}`;

    const response = await ai.models.generateContent({
      model:    GEMINI_LITE,
      config:   { temperature: 0.35, maxOutputTokens: 1200 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const raw   = (response.text || '').trim();
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON inválido da mentoria');

    const mentoria = JSON.parse(raw.slice(start, end + 1));

    // Salva novos conhecimentos recebidos do Gemini mentor
    if (Array.isArray(mentoria.novosConhecimentos)) {
      for (const nc of mentoria.novosConhecimentos) {
        if (nc.chave && nc.valor) {
          await salvarConhecimento({
            categoria: 'mentoria_gemini',
            chave:     nc.chave.substring(0, 100),
            valor:     nc.valor,
            confianca: 0.88,
            fonte:     'gemini_mentoria',
          });
        }
      }
    }

    await registrarEstudo({
      tipo:    'mentoria_gemini',
      resumo:  mentoria.avaliacao || 'Sessão de mentoria concluída',
      detalhes: {
        pontosMelhorar:    mentoria.pontosMelhorar,
        perguntaReflexao:  mentoria.perguntaReflexao,
        acaoImediata:      mentoria.acaoImediata,
        novosConhecimentos: (mentoria.novosConhecimentos || []).length,
      },
    });

    logBrain(`Mentoria concluída: ${(mentoria.novosConhecimentos || []).length} novos conhecimentos`, 'success');
    logBrain(`Reflexão: ${mentoria.perguntaReflexao}`, 'think');
    logBrain(`Ação: ${mentoria.acaoImediata}`, 'info');

    return mentoria;

  } catch (e) {
    logBrain(`Erro na mentoria: ${e.message}`, 'error');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 7 — GERADOR DE INSIGHT CURTO PARA O BALÃO
// Máx 88 chars — garante que não corta no balão flutuante
// ═══════════════════════════════════════════════════════════════════════════════

export async function gerarInsightCurto(linhas = []) {
  if (!process.env.GEMINI_API_KEY || !linhas.length) return null;

  try {
    const ai = geminiClient();

    const dados = linhas.join(' | ').substring(0, 300);

    const response = await ai.models.generateContent({
      model: GEMINI_LITE,
      config: {
        temperature:    0.2,
        maxOutputTokens: 40, // Forçadamente curto
        thinkingConfig:  { thinkingBudget: 0 },
      },
      contents: [{
        role:  'user',
        parts: [{
          text: `Dados: ${dados}

Crie 1 alerta de NO MÁXIMO 85 caracteres para gestor de e-commerce.
REGRAS ABSOLUTAS:
- Máx 85 caracteres CONTANDO com o emoji
- Comece com 1 emoji (🚨 ⚠️ 📦 ✅ 💡 🔴)
- SEM ponto final
- SEM explicações longas
- Seja direto e objetivo

Exemplos bons:
"🚨 3 anúncios com peso errado, 1 reincidente"
"⚠️ 2 divergências ativas — frete cobrado errado"
"📦 5 anúncios sem vínculo aguardando cadastro"

Apenas o texto do alerta, nada mais:`,
        }],
      }],
    });

    const texto = (response.text || '')
      .trim()
      .replace(/^["']|["']$/g, '')  // remove aspas
      .replace(/\.$/, '')            // remove ponto final
      .substring(0, BALAO_MAX_CHARS);

    return texto || null;

  } catch (e) {
    logBrain(`Erro no insight curto: ${e.message}`, 'error');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 8 — PIPELINE COMPLETO DE RESPOSTA COM APRENDIZADO
// Fluxo: contexto local → Gemini → validação → aprendizado
// ═══════════════════════════════════════════════════════════════════════════════

export async function processarMensagemComAprendizado({
  mensagem,
  userRole,
  userId,
  imageBase64   = null,
  imageMimeType = null,
  imageOnly     = false,
  historyRaw    = [],
  dataBlock     = null,
}) {
  logBrain(`Processando: "${(mensagem || '').substring(0, 55)}..."`, 'think');

  // 1. Busca conhecimento local relevante
  const palavrasChave = (mensagem || '').toLowerCase()
    .split(/\s+/).filter(w => w.length > 3).slice(0, 6);

  const [conhecimentos, aprendizadosAnteriores] = await Promise.all([
    buscarConhecimentoSemantico(palavrasChave, 12),
    buscarAprendizadosSimilares(mensagem || '', 3),
  ]);

  // 2. Monta bloco de contexto enriquecido com memória local
  const blocoMemoria = conhecimentos.length > 0
    ? `\n\n=== MEMÓRIA INTERNA DA IA (aprendido autonomamente) ===\n${
        conhecimentos.map(k => `• [${k.categoria}] ${k.valor.substring(0, 180)}`).join('\n')
      }\n=== FIM DA MEMÓRIA ===\n`
    : '';

  const blocoHistoricoAprendizado = aprendizadosAnteriores.length > 0
    ? `\n\n=== RESPOSTAS ANTERIORES VALIDADAS (use como referência) ===\n${
        aprendizadosAnteriores.map(a =>
          `P: ${a.pergunta.substring(0, 120)}\nR: ${a.respostaFinal.replace(/<[^>]+>/g, '').substring(0, 200)}`
        ).join('\n---\n')
      }\n=== FIM ===\n`
    : '';

  const dataBlockFinal = [
    dataBlock || '',
    blocoMemoria,
    blocoHistoricoAprendizado,
  ].filter(Boolean).join('');

  // 3. Chama Gemini com contexto enriquecido
  const { buildAnswer, analyzeImage } = await import('../../iaService.js');

  let imageDesc = null;
  if (imageBase64) {
    imageDesc = await analyzeImage(
      imageBase64, imageMimeType || 'image/jpeg', imageOnly ? '' : mensagem
    );
  }

  const uid = userId ? parseInt(userId) : 0;
  let totalProdutos = 0, totalDivergencias = 0, usuarioAtual = null, pendentes = [];
  try {
    [totalProdutos, totalDivergencias, usuarioAtual, pendentes] = await Promise.all([
      prisma.produto.count({ where: { usuarioId: uid } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: { in: ['PENDENTE','REINCIDENTE'] } } }),
      prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }).catch(() => null),
      (userRole === 'OWNER' || userRole === 'ADMIN')
        ? prisma.usuario.findMany({ where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }, select: { id: true, nome: true, email: true } })
        : Promise.resolve([]),
    ]);
  } catch {}

  const msgEfetiva = imageOnly
    ? (imageDesc ? `Usuário enviou imagem. Conteúdo detectado: ${imageDesc}` : 'Usuário enviou uma imagem')
    : (mensagem || '[imagem]');

  const { reply, sources } = await buildAnswer(
    msgEfetiva,
    historyRaw,
    {
      totalProdutos,
      totalDivergencias,
      userRole,
      usuarioAtual,
      pendentes,
      imageContext: imageDesc,
      imageOnly:    !!imageOnly,
      dataBlock:    dataBlockFinal || null,
    }
  );

  // 4. Validação com Gemini (amostra: 1 em 3 msgs não-imagem)
  const deveValidar = !imageOnly
    && mensagem
    && mensagem.length > 8
    && Math.random() < 0.33;

  let respostaFinal = reply;

  if (deveValidar) {
    logBrain('Enviando para validação Gemini...', 'think');
    const validacao = await validarRespostaComGemini({
      pergunta:          mensagem,
      respostaTentativa: reply,
      contexto:          dataBlockFinal.substring(0, 400),
      userId,
    });
    respostaFinal = validacao.respostaFinal || reply;
  } else {
    // Salva sem validação formal com confiança moderada
    if (mensagem && mensagem.length > 5) {
      const confLocal = Math.min(0.8, 0.45 + conhecimentos.length * 0.06);
      await salvarAprendizado({
        pergunta:          mensagem,
        respostaTentativa: reply,
        respostaFinal:     reply,
        aprovada:          true,
        confianca:         confLocal,
        motivo:            'auto_sem_validacao',
        userId,
      });
    }
  }

  // 5. Extrai conhecimentos da conversa automaticamente
  if (mensagem && reply) {
    await extrairConhecimentosDaConversa(mensagem, reply);
  }

  logBrain(
    `Respondido (validado: ${deveValidar}, mem_local: ${conhecimentos.length} itens)`,
    'success',
  );

  return { reply: respostaFinal, sources };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 9 — EXTRAÇÃO AUTOMÁTICA DE CONHECIMENTO DAS CONVERSAS
// Aprende padrões de cada interação sem precisar do Gemini
// ═══════════════════════════════════════════════════════════════════════════════

async function extrairConhecimentosDaConversa(pergunta, resposta) {
  if (!pergunta || !resposta || pergunta.length < 8) return;

  try {
    const respostaSemHTML = resposta.replace(/<[^>]+>/g, '').substring(0, 400);
    const padroes = [
      { regex: /divergên|peso|frete|anúncio|auditoria|reincidente/i, cat: 'logistica_conversas' },
      { regex: /produto|sku|kit|catálogo|vincul/i,                   cat: 'produtos_conversas' },
      { regex: /usuário|acesso|bloqueio|role|owner/i,                 cat: 'usuarios_conversas' },
      { regex: /configuração|agendador|varredura|automático/i,        cat: 'config_conversas' },
      { regex: /mercado livre|ml|mlb|shopee|amazon/i,                 cat: 'plataformas_conversas' },
      { regex: /preço|preco|precific|custo|faturamento/i,             cat: 'financeiro_conversas' },
    ];

    for (const p of padroes) {
      if (p.regex.test(pergunta) || p.regex.test(respostaSemHTML)) {
        const chaveNorm = pergunta.substring(0, 90)
          .toLowerCase()
          .replace(/[^a-zA-ZáéíóúãõâêîôûçÁÉÍÓÚÃÕ\s]/g, '')
          .trim();

        if (chaveNorm.length > 5) {
          await salvarConhecimento({
            categoria: p.cat,
            chave:     chaveNorm,
            valor:     `Q: ${pergunta.substring(0, 180)} | A: ${respostaSemHTML.substring(0, 260)}`,
            confianca: 0.60,
            fonte:     'extracao_conversa',
          });
        }
        break; // Apenas a primeira categoria que bater
      }
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 10 — LOOP DE APRENDIZADO CONTÍNUO (background)
// Roda para sempre: analisa → aprende → conversa com Gemini
// ═══════════════════════════════════════════════════════════════════════════════

let _loopAtivo      = false;
let _ultimaMentoria = 0;
let _cicloContador  = 0;

export async function iniciarLoopAprendizado() {
  if (_loopAtivo) {
    logBrain('Loop já está ativo, ignorando segunda chamada', 'warn');
    return;
  }
  _loopAtivo = true;
  logBrain('🚀 Loop de aprendizado contínuo iniciado!', 'success');
  logBrain(`   Ciclos: análise a cada 15min | Mentoria a cada 1h`, 'info');

  const ciclo = async () => {
    if (!_loopAtivo) return;
    _cicloContador++;

    try {
      logBrain(`─── Ciclo #${_cicloContador} ───────────────────────────────`, 'info');

      // Análise autônoma do sistema (sem Gemini)
      await analisarSistemaAutonomamente();

      // Limpa aprendizados antigos e ruins
      await limparAprendizadosAntigos();

      // Mentoria com Gemini a cada 1h
      const agora = Date.now();
      if (agora - _ultimaMentoria > CICLO_MENTORIA_MS) {
        _ultimaMentoria = agora;
        await conversarComGeminiAutonomamente();
      }

    } catch (e) {
      logBrain(`Erro no ciclo #${_cicloContador}: ${e.message}`, 'error');
    }

    // Agenda o próximo ciclo
    setTimeout(ciclo, CICLO_ANALISE_MS);
  };

  // Primeiro ciclo após 30s (deixa o servidor subir completamente)
  setTimeout(ciclo, 30_000);
}

export function pararLoopAprendizado() {
  _loopAtivo = false;
  logBrain('Loop de aprendizado parado', 'warn');
}

async function limparAprendizadosAntigos() {
  try {
    const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 dias
    const removidos = await prisma.iaAprendizado.deleteMany({
      where: { aprovada: false, confianca: { lt: 0.25 }, createdAt: { lt: limite } },
    });
    if (removidos.count > 0) {
      logBrain(`Limpeza: ${removidos.count} aprendizados ruins removidos`, 'info');
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 11 — ESTATÍSTICAS DO SISTEMA DE APRENDIZADO
// ═══════════════════════════════════════════════════════════════════════════════

export async function getEstatisticasAprendizado() {
  try {
    const [
      totalConhecimentos,
      totalAprendizados,
      aprovados,
      reprovados,
      ultimoEstudo,
      categorias,
    ] = await Promise.all([
      prisma.iaConhecimento.count(),
      prisma.iaAprendizado.count(),
      prisma.iaAprendizado.count({ where: { aprovada: true } }),
      prisma.iaAprendizado.count({ where: { aprovada: false } }),
      prisma.iaEstudoTerminal.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.iaConhecimento.groupBy({ by: ['categoria'], _count: true }).catch(() => []),
    ]);

    return {
      totalConhecimentos,
      totalAprendizados,
      taxaAcerto:       totalAprendizados > 0 ? Math.round((aprovados / totalAprendizados) * 100) : 0,
      aprovados,
      reprovados,
      ultimoEstudo:     ultimoEstudo?.createdAt || null,
      ultimoEstudoTipo: ultimoEstudo?.tipo || null,
      loopAtivo:        _loopAtivo,
      cicloAtual:       _cicloContador,
      categorias:       categorias.map(c => ({ categoria: c.categoria, total: c._count })),
    };
  } catch {
    return {
      totalConhecimentos: 0, totalAprendizados: 0, taxaAcerto: 0,
      aprovados: 0, reprovados: 0, loopAtivo: _loopAtivo, cicloAtual: _cicloContador,
      categorias: [],
    };
  }
}