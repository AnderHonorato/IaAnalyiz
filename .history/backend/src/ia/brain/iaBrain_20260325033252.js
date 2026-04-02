// backend/src/ia/brain/iaBrain.js
// ═══════════════════════════════════════════════════════════════════════════════
// CÉREBRO DA IA ANALYIZ — Fase 2: Memória Vetorial (Embeddings & Semantic Search)
// ═══════════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { GoogleGenAI }  from '@google/genai';
import dotenv from 'dotenv'; // Garante que as vars sejam lidas

dotenv.config();
const prisma = new PrismaClient();

// ─── Configurações ────────────────────────────────────────────────────────────
const GEMINI_FLASH     = 'gemini-2.5-flash-preview-05-20';
const GEMINI_LITE      = 'gemini-2.5-flash-preview-05-20';
// ATUALIZAÇÃO IMPORTANTE: Modelo de embedding mais recente e estável do Google
const GEMINI_EMBEDDING  = 'text-embedding-004'; 
const CONFIANCA_MINIMA  = 0.68;
const MAX_CHARS_VALOR   = 2000;
const CICLO_ANALISE_MS  = 1 * 60 * 1000;   // 1 min
const CICLO_MENTORIA_MS = 5 * 60 * 1000;   // 5 min
const BALAO_MAX_CHARS   = 88;              // cabe no balão flutuante

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no .env');
  return new GoogleGenAI({ 
    apiKey: apiKey,
    apiVersion: 'v1'  // ← força v1 em vez de v1beta
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTES ESPECIALISTAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agente de Pesquisa Profunda
 * Vasculha a web para entender o mercado além dos dados da API do ML
 */
export async function agentePesquisaProfunda(pergunta, contextoAdicional = "") {
  try {
    const ai = geminiClient();

    const prompt = `Você é o Agente de Pesquisa Profunda da Analyiz.
Sua missão é realizar uma varredura completa na internet sobre: ${pergunta}
Contexto atual do sistema: ${contextoAdicional}

Traga tendências de preço, opiniões de consumidores em fóruns/vídeos, lançamentos recentes e estratégias de concorrentes fora do ML.
Seja técnico e direto.`;

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
      }
    });

    return response.text || 'Sem resultado da pesquisa.';
  } catch (e) {
    console.error('[Agente Pesquisa] Erro:', e.message);
    return "Falha na pesquisa externa.";
  }
}

/**
 * Agente Validador de Informações
 * Atua como Gatekeeper para evitar alucinações
 */
export async function agenteValidador(respostaGerada, contextoFactual) {
  try {
    const ai = geminiClient();

    const prompt = `Você é o Agente Validador. Compare a RESPOSTA DA IA com os DADOS DO SISTEMA.
DADOS DO SISTEMA: ${JSON.stringify(contextoFactual)}
RESPOSTA DA IA: ${respostaGerada}

Verifique se há erros numéricos ou alucinações.
Retorne JSON: { "aprovada": boolean, "correcao": "texto corrigido ou null", "motivo": "string" }`;

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    return JSON.parse(response.text);
  } catch (e) {
    return { aprovada: true, correcao: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PESQUISA DE MERCADO (LOGICA DE NEGÓCIO)
// ═══════════════════════════════════════════════════════════════════════════════

export async function realizarPesquisaMercadoProfunda(userId, itensParaAnalisar) {
  const titulos = itensParaAnalisar.map(i => i.titulo).join(', ');
  
  // 1. Pesquisa Externa (Internet)
  const insightsWeb = await agentePesquisaProfunda(`Tendências de mercado e preços para os produtos: ${titulos}`);
  
  // 2. Análise Comparativa (Dados Internos)
  const ai = geminiClient();
  const model = ai.getGenerativeModel({ model: GEMINI_FLASH });

  const prompt = `Faça um Relatório de Inteligência de Mercado (HTML).
PRODUTOS ANALISADOS: ${JSON.stringify(itensParaAnalisar)}
INSIGHTS DA WEB: ${insightsWeb}

ESTRUTURA DO RELATÓRIO:
1. <b>Panorama Competitivo</b>: Como esses preços se comparam com o resto da web?
2. <b>Oportunidades de Precificação</b>: Posso subir o preço? Devo baixar?
3. <b>Sugestões de Anúncio</b>: O que os vídeos e reviews dizem que falta nesses anúncios?
4. <b>Veredito Final</b>: Ação imediata recomendada.

Use tags <b>, <br>, <ul>, <li>.`;

  const result = await model.generateContent(prompt);
  let relatorio = result.response.text();

  // 3. Validação
  const validacao = await agenteValidador(relatorio, itensParaAnalisar);
  if (!validacao.aprovada) relatorio = validacao.correcao;

  return {
    titulo: `Análise de Mercado: ${itensParaAnalisar[0].titulo.substring(0, 30)}...`,
    conteudoHtml: relatorio,
    mlbIds: itensParaAnalisar.map(i => i.mlbId).join(','),
    precoMedio: itensParaAnalisar.reduce((acc, i) => acc + i.preco, 0) / itensParaAnalisar.length
  };
}

// ─── Helper: Extração Segura de JSON blindada ─────────────────────────────────
function extrairJSONSeguro(texto) {
  if (!texto) throw new Error('A IA retornou uma resposta vazia.');
  const start = texto.indexOf('{');
  let end   = texto.lastIndexOf('}');
  if (start === -1) throw new Error(`JSON não encontrado. Retorno: ${texto.substring(0, 150)}...`);
  let jsonStr = (end === -1 || end < start) ? texto.slice(start) + '}' : texto.slice(start, end + 1);
  jsonStr = jsonStr.replace(/,\s*([\}\]])/g, '$1');
  try { return JSON.parse(jsonStr); } catch (e) {
    if (e.message.includes('Unexpected end')) {
       try { return JSON.parse(jsonStr + '}'); } catch(e2){}
       try { return JSON.parse(jsonStr + '"}'); } catch(e3){}
       try { return JSON.parse(jsonStr + ']}'); } catch(e4){}
    }
    throw new Error(`Erro de Sintaxe no JSON. Retorno: ${jsonStr.substring(0, 100)}...`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR VETORIAL (EMBEDDINGS)
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarEmbedding(texto) {
  if (!process.env.GEMINI_API_KEY || !texto) return [];
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: texto.substring(0, 2048) }] }
        })
      }
    );
    if (!response.ok) {
      const err = await response.json();
      console.error('[Embedding Error]', JSON.stringify(err.error));
      return [];
    }
    const data = await response.json();
    return data.embedding?.values || [];
  } catch (e) {
    console.error('[Embedding Error]', e.message);
    return [];
  }
}

function calcularSimilaridade(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 1 — MEMÓRIA DE LONGO PRAZO COM VETORES
// ═══════════════════════════════════════════════════════════════════════════════

export async function salvarConhecimento({ categoria, chave, valor, confianca = 0.7, fonte = 'sistema' }) {
  try {
    const textoParaVetorizar = `${categoria} ${chave} ${valor}`.substring(0, 1000);
    const vetor = await gerarEmbedding(textoParaVetorizar);

    const existente = await prisma.iaConhecimento.findFirst({ where: { categoria, chave } });
    if (existente) {
      const novaConfianca = Math.min(1.0, existente.confianca * 0.85 + confianca * 0.15 + 0.02);
      await prisma.iaConhecimento.update({
        where: { id: existente.id },
        data: { valor: valor.substring(0, MAX_CHARS_VALOR), confianca: novaConfianca, fonte, atualizadoEm: new Date(), usos: { increment: 1 }, embedding: vetor },
      });
    } else {
      await prisma.iaConhecimento.create({
        data: { categoria, chave: chave.substring(0, 120), valor: valor.substring(0, MAX_CHARS_VALOR), confianca, fonte, embedding: vetor },
      });
    }
    logBrain(`Conhecimento vetorial salvo: [${categoria}] ${chave.substring(0, 60)}`, 'learn');
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

export async function buscarConhecimentoSemantico(pergunta = '', limite = 12) {
  if (!pergunta) return [];
  try {
    const vetorPergunta = await gerarEmbedding(pergunta);
    if (!vetorPergunta.length) return [];

    const todos = await prisma.iaConhecimento.findMany({
      where: { confianca: { gte: CONFIANCA_MINIMA - 0.1 } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200, 
    });

    const pontuados = todos.map(k => ({ ...k, score: calcularSimilaridade(vetorPergunta, k.embedding) }));

    return pontuados
      .filter(k => k.score > 0.65)
      .sort((a, b) => b.score - a.score)
      .slice(0, limite);
  } catch { return []; }
}

export async function buscarTodoConhecimento(limiteAlta = 60) {
  try {
    return await prisma.iaConhecimento.findMany({ where: { confianca: { gte: 0.45 } }, orderBy: [{ confianca: 'desc' }, { usos: 'desc' }], take: limiteAlta });
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 2 E 3 — APRENDIZADOS E TERMINAL VETORIAIS
// ═══════════════════════════════════════════════════════════════════════════════

export async function salvarAprendizado({ pergunta, respostaTentativa, respostaFinal, aprovada, confianca = 0.5, motivo = '', userId = null }) {
  try {
    const vetor = await gerarEmbedding(pergunta);
    await prisma.iaAprendizado.create({
      data: { pergunta: pergunta.substring(0, 500), respostaTentativa: respostaTentativa.substring(0, 2000), respostaFinal: respostaFinal.substring(0, 2000), aprovada, confianca, motivo: motivo.substring(0, 200), usuarioId: userId ? parseInt(userId) : null, embedding: vetor },
    });
  } catch (e) {
    logBrain(`Erro ao salvar aprendizado: ${e.message}`, 'error');
  }
}

export async function buscarAprendizadosSimilares(pergunta, limite = 4) {
  try {
    const vetorPergunta = await gerarEmbedding(pergunta);
    if (!vetorPergunta.length) return [];

    const todos = await prisma.iaAprendizado.findMany({
      where: { aprovada: true, confianca: { gte: 0.6 } },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });

    const pontuados = todos.map(a => ({ ...a, score: calcularSimilaridade(vetorPergunta, a.embedding) }));

    return pontuados.filter(a => a.score > 0.70).sort((a, b) => b.score - a.score).slice(0, limite);
  } catch { return []; }
}

export async function registrarEstudo({ tipo, resumo, detalhes = null }) {
  try {
    await prisma.iaEstudoTerminal.create({ data: { tipo: tipo.substring(0, 60), resumo: resumo.substring(0, 500), detalhes: detalhes ? JSON.stringify(detalhes).substring(0, 3000) : null } });
    logBrain(`[ESTUDO] ${tipo.toUpperCase()} — ${resumo.substring(0, 90)}`, 'think');
  } catch {}
}

export async function buscarEstudosRecentes(limite = 40) {
  try { return await prisma.iaEstudoTerminal.findMany({ orderBy: { createdAt: 'desc' }, take: limite }); } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 4 — ANÁLISE AUTÔNOMA DO SISTEMA
// ═══════════════════════════════════════════════════════════════════════════════

export async function analisarSistemaAutonomamente(userId = null) {
  logBrain('Iniciando análise autônoma do sistema...', 'analyze');

  try {
    const uid          = userId ? parseInt(userId) : null;
    const whereClause  = uid ? { usuarioId: uid } : {};

    const [totalProdutos, totalDivs, divsPorStatus, produtosComFicha, totalAvisos, ultimasDivs, agendadores, totalUsuarios, sessaoStats] = await Promise.all([
      prisma.produto.count({ where: whereClause }),
      prisma.divergencia.count({ where: whereClause }),
      prisma.divergencia.groupBy({ by: ['status'], where: whereClause, _count: true }),
      prisma.produto.count({ where: { ...whereClause, OR: [{ ean: { not: null } }, { marca: { not: null } }] } }),
      prisma.avisoML.count({ where: { ...whereClause, resolvido: false } }).catch(() => 0),
      prisma.divergencia.findMany({ where: { ...whereClause, status: { in: ['PENDENTE', 'REINCIDENTE'] } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.agendadorConfig.findMany({ where: uid ? { usuarioId: uid } : {}, take: 5 }),
      prisma.usuario.count().catch(() => 0),
      prisma.sessaoUsuario.count({ where: { ativo: true } }).catch(() => 0),
    ]);

    const statusMap = Object.fromEntries(divsPorStatus.map(s => [s.status, s._count]));
    const pendentes = (statusMap.PENDENTE || 0) + (statusMap.REINCIDENTE || 0);
    const taxaCorr  = totalDivs > 0 ? Math.round(((statusMap.CORRIGIDO || 0) / totalDivs) * 100) : 0;

    const conhecimentos = [];

    if (totalProdutos > 0) {
      const pctFicha = Math.round((produtosComFicha / totalProdutos) * 100);
      conhecimentos.push({ categoria: 'metricas_produtos', chave: 'resumo_catalogo', valor: `Catálogo: ${totalProdutos} produtos cadastrados. ${produtosComFicha} (${pctFicha}%) possuem ficha técnica.`, confianca: 1.0 });
    }

    if (totalDivs > 0) {
      conhecimentos.push({ categoria: 'metricas_divergencias', chave: 'estado_atual_divergencias', valor: `Divergências: ${totalDivs} total. ${pendentes} ativas. Corrigidas: ${statusMap.CORRIGIDO || 0}. Reincidentes: ${statusMap.REINCIDENTE || 0}. Fila API: ${statusMap.PENDENTE_ENVIO || 0}. Taxa de correção: ${taxaCorr}%.`, confianca: 1.0 });
    }

    if (pendentes === 0 && totalDivs > 0) conhecimentos.push({ categoria: 'saude_logistica', chave: 'sem_pendencias', valor: `Logística 100% saudável: nenhuma divergência pendente. Todas as ${totalDivs} resolvidas ou ignoradas.`, confianca: 0.95 });

    if (ultimasDivs.length > 0) {
      const topMotivo = ultimasDivs[0];
      const diffMedia = ultimasDivs.reduce((s, d) => s + Math.abs(d.pesoMl - d.pesoLocal), 0) / ultimasDivs.length;
      conhecimentos.push({ categoria: 'divergencias_recentes', chave: 'top_divergencias', valor: `Divergências recentes: maior erro médio de ${Math.round(diffMedia)}g. Ex: ${topMotivo.mlItemId} — ${(topMotivo.motivo || '').substring(0, 100)}.`, confianca: 0.92 });
    }

    if (totalAvisos > 0) conhecimentos.push({ categoria: 'avisos_ml', chave: 'avisos_ativos', valor: `⚠️ ${totalAvisos} aviso(s) ativo(s) do Mercado Livre sobre anúncios com peso ou dimensões incorretos.`, confianca: 1.0 });

    agendadores.forEach(ag => { conhecimentos.push({ categoria: 'configuracao_agendador', chave: `agendador_user_${ag.usuarioId}`, valor: `Agendador usuário ${ag.usuarioId}: ${ag.ativo ? 'ATIVO' : 'INATIVO'}.`, confianca: 0.98 }); });

    if (totalUsuarios > 0) conhecimentos.push({ categoria: 'metricas_usuarios', chave: 'usuarios_plataforma', valor: `Plataforma tem ${totalUsuarios} usuário(s) cadastrados. ${sessaoStats} ativos agora.`, confianca: 0.9 });

    for (const c of conhecimentos) await salvarConhecimento({ ...c, fonte: 'analise_autonoma' });

    await registrarEstudo({
      tipo: 'analise_sistema',
      resumo: `Analisei ${totalProdutos} produtos, ${totalDivs} divergências, ${totalAvisos} avisos ML.`,
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
// SEÇÃO 5 — VALIDAÇÃO COM GEMINI 
// ═══════════════════════════════════════════════════════════════════════════════

export async function validarRespostaComGemini({ pergunta, respostaTentativa, contexto = '', userId }) {
  if (!process.env.GEMINI_API_KEY) return { aprovada: true, respostaFinal: respostaTentativa, confianca: 0.5, motivo: 'sem_api' };

  try {
    const ai = geminiClient();

    const prompt = `Você é avaliador de qualidade de respostas da IA "IA Analyiz".
PERGUNTA: "${pergunta.substring(0, 400)}"
TENTATIVA: "${respostaTentativa.replace(/<[^>]+>/g, '').substring(0, 600)}"
CONTEXTO: ${contexto.substring(0, 400)}

Avalie e responda com JSON PURO:
{
  "aprovada": true/false,
  "confianca": 0.85,
  "motivo": "explicação",
  "respostaCorreta": "SE aprovada=false, coloque a resposta ideal aqui",
  "aprendizados": ["fato 1 aprendido"]
}`;

    const response = await ai.models.generateContent({
        model:    GEMINI_LITE,
        config:   { 
            temperature: 0.1, 
            maxOutputTokens: 3000, 
            responseMimeType: "application/json"
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const resultado = extrairJSONSeguro(response.text);

    if (Array.isArray(resultado.aprendizados)) {
      for (const ap of resultado.aprendizados) {
        if (typeof ap === 'string' && ap.length > 10) {
          await salvarConhecimento({ categoria: 'aprendizado_validacao', chave: ap.substring(0, 100), valor: ap, confianca: resultado.aprovada ? 0.82 : 0.55, fonte: 'gemini_validacao' });
        }
      }
    }

    await salvarAprendizado({
      pergunta, respostaTentativa,
      respostaFinal: resultado.aprovada ? respostaTentativa : (resultado.respostaCorreta || respostaTentativa),
      aprovada: resultado.aprovada, confianca: resultado.confianca || 0.8, motivo: resultado.motivo || '', userId,
    });

    logBrain(`Validação: ${resultado.aprovada ? '✓' : '✗'} | conf=${resultado.confianca} | ${resultado.motivo}`, resultado.aprovada ? 'success' : 'warn');

    await registrarEstudo({
      tipo: 'validacao_resposta',
      resumo: `Validação: ${resultado.aprovada ? 'APROVADA' : 'REPROVADA'} (${resultado.motivo})`,
      detalhes: { aprovada: resultado.aprovada },
    });

    return {
      aprovada: resultado.aprovada,
      respostaFinal: resultado.aprovada ? respostaTentativa : (resultado.respostaCorreta || respostaTentativa),
      confianca: resultado.confianca || 0.7,
      motivo: resultado.motivo || '',
    };

  } catch (e) {
    logBrain(`Erro validação: ${e.message}`, 'error');
    return { aprovada: true, respostaFinal: respostaTentativa, confianca: 0.5, motivo: 'erro_validacao' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 6 — MENTORIA AUTÔNOMA COM GEMINI
// ═══════════════════════════════════════════════════════════════════════════════

export async function conversarComGeminiAutonomamente() {
  if (!process.env.GEMINI_API_KEY) return null;
  logBrain('Sessão de mentoria com Gemini iniciada...', 'mentor');

  try {
    const ai = geminiClient();

    const [conhecimentos, estudos, statsAprendizado] = await Promise.all([
      buscarTodoConhecimento(30), buscarEstudosRecentes(8), getEstatisticasAprendizado(),
    ]);

    const resumoConhecimento = conhecimentos.slice(0, 20).map(k => `[${k.categoria}] ${k.chave}: ${k.valor.substring(0, 100)}`).join('\n');
    const resumoEstudos = estudos.slice(0, 5).map(e => `${e.tipo}: ${e.resumo.substring(0, 80)}`).join('\n');

    const prompt = `Você é mentor da IA Analyiz — assistente de logística.
ESTADO:
- Conhecimentos: ${conhecimentos.length}
- Acerto: ${statsAprendizado.taxaAcerto}%
- Aprovadas/Reprovadas: ${statsAprendizado.aprovados}/${statsAprendizado.reprovados}
DADOS: ${resumoConhecimento}
ESTUDOS: ${resumoEstudos}

Oriente a IA com JSON PURO:
{
  "avaliacao": "análise do estado",
  "pontosMelhorar": ["ponto 1"],
  "novosConhecimentos": [{"chave": "tema", "valor": "explicação"}],
  "perguntaReflexao": "pergunta?",
  "acaoImediata": "acao"
}`;

    const response = await ai.models.generateContent({
      model:    GEMINI_LITE,
      config:   { 
        temperature: 0.35, 
        maxOutputTokens: 4000, 
        responseMimeType: "application/json"
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const mentoria = extrairJSONSeguro(response.text);

    if (Array.isArray(mentoria.novosConhecimentos)) {
      for (const nc of mentoria.novosConhecimentos) {
        if (nc.chave && nc.valor) await salvarConhecimento({ categoria: 'mentoria_gemini', chave: nc.chave.substring(0, 100), valor: nc.valor, confianca: 0.88, fonte: 'gemini_mentoria' });
      }
    }

    await registrarEstudo({
      tipo: 'mentoria_gemini',
      resumo: mentoria.avaliacao || 'Sessão concluída',
      detalhes: { reflexao: mentoria.perguntaReflexao, acao: mentoria.acaoImediata },
    });

    logBrain(`Mentoria concluída. Ação sugerida: ${mentoria.acaoImediata}`, 'success');
    return mentoria;

  } catch (e) {
    logBrain(`Erro na mentoria: ${e.message}`, 'error');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 7 — GERADOR DE INSIGHT CURTO PARA O BALÃO
// ═══════════════════════════════════════════════════════════════════════════════

export async function gerarInsightCurto(linhas = []) {
  if (!process.env.GEMINI_API_KEY || !linhas.length) return null;
  try {
    const ai = geminiClient();
    const dados = linhas.join(' | ').substring(0, 300);

    const response = await ai.models.generateContent({
      model: GEMINI_LITE,
      config: { temperature: 0.2, maxOutputTokens: 40 },
      contents: [{ role: 'user', parts: [{ text: `Dados: ${dados}\nCrie 1 alerta de NO MÁX 85 chars com emoji inicial. Direto. Sem ponto final:` }] }],
    });

    return (response.text || '').trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').substring(0, BALAO_MAX_CHARS) || null;
  } catch (e) {
    logBrain(`Erro insight: ${e.message}`, 'error');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 8 — PIPELINE COMPLETO DE RESPOSTA COM APRENDIZADO
// ═══════════════════════════════════════════════════════════════════════════════

export async function processarMensagemComAprendizado({ mensagem, userRole, userId, imageBase64 = null, imageMimeType = null, imageOnly = false, historyRaw = [], dataBlock = null }) {
  logBrain(`Processando: "${(mensagem || '').substring(0, 55)}..."`, 'think');

  const [conhecimentos, aprendizadosAnteriores] = await Promise.all([ 
    buscarConhecimentoSemantico(mensagem, 12), 
    buscarAprendizadosSimilares(mensagem || '', 3) 
  ]);

  const blocoMemoria = conhecimentos.length > 0 ? `\n=== MEMÓRIA INTERNA (VETORIAL) ===\n${conhecimentos.map(k => `• [${k.categoria}] (score: ${Math.round(k.score*100)}%) ${k.valor.substring(0, 180)}`).join('\n')}\n` : '';
  const blocoHistorico = aprendizadosAnteriores.length > 0 ? `\n=== RESPOSTAS ANTERIORES ===\n${aprendizadosAnteriores.map(a => `P: ${a.pergunta.substring(0, 120)}\nR: ${a.respostaFinal.replace(/<[^>]+>/g, '').substring(0, 200)}`).join('\n---\n')}\n` : '';

  const dataBlockFinal = [dataBlock || '', blocoMemoria, blocoHistorico].filter(Boolean).join('');

  const { buildAnswer, analyzeImage } = await import('../../iaService.js');

  let imageDesc = null;
  if (imageBase64) imageDesc = await analyzeImage(imageBase64, imageMimeType || 'image/jpeg', imageOnly ? '' : mensagem);

  const uid = userId ? parseInt(userId) : 0;
  let totalProdutos = 0, totalDivergencias = 0, usuarioAtual = null, pendentes = [];
  try {
    [totalProdutos, totalDivergencias, usuarioAtual, pendentes] = await Promise.all([
      prisma.produto.count({ where: { usuarioId: uid } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: { in: ['PENDENTE','REINCIDENTE'] } } }),
      prisma.usuario.findUnique({ where: { id: uid }, select: { id: true, nome: true, role: true } }).catch(() => null),
      (userRole === 'OWNER' || userRole === 'ADMIN') ? prisma.usuario.findMany({ where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }, select: { id: true, nome: true, email: true } }) : Promise.resolve([]),
    ]);
  } catch {}

  const msgEfetiva = imageOnly ? (imageDesc ? `Usuário enviou imagem. Conteúdo: ${imageDesc}` : 'Usuário enviou imagem') : (mensagem || '[imagem]');

  const { reply, sources } = await buildAnswer(msgEfetiva, historyRaw, { totalProdutos, totalDivergencias, userRole, usuarioAtual, pendentes, imageContext: imageDesc, imageOnly: !!imageOnly, dataBlock: dataBlockFinal || null });

  const deveValidar = !imageOnly && mensagem && mensagem.length > 8 && Math.random() < 0.33;
  let respostaFinal = reply;

  if (deveValidar) {
    logBrain('Enviando para validação Gemini...', 'think');
    const validacao = await validarRespostaComGemini({ pergunta: mensagem, respostaTentativa: reply, contexto: dataBlockFinal.substring(0, 400), userId });
    respostaFinal = validacao.respostaFinal || reply;
  } else {
    if (mensagem && mensagem.length > 5) {
      await salvarAprendizado({ pergunta: mensagem, respostaTentativa: reply, respostaFinal: reply, aprovada: true, confianca: Math.min(0.8, 0.45 + conhecimentos.length * 0.06), motivo: 'auto_sem_validacao', userId });
    }
  }

  if (mensagem && reply) await extrairConhecimentosDaConversa(mensagem, reply);

  logBrain(`Respondido (validado: ${deveValidar}, mem_local: ${conhecimentos.length} itens)`, 'success');
  return { reply: respostaFinal, sources };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 9 — EXTRAÇÃO AUTOMÁTICA DE CONHECIMENTO DAS CONVERSAS
// ═══════════════════════════════════════════════════════════════════════════════

async function extrairConhecimentosDaConversa(pergunta, resposta) {
  if (!pergunta || !resposta || pergunta.length < 8) return;
  try {
    const respLimpa = resposta.replace(/<[^>]+>/g, '').substring(0, 400);
    const padroes = [
      { regex: /divergên|peso|frete|anúncio|auditoria|reincidente/i, cat: 'logistica_conversas' },
      { regex: /produto|sku|kit|catálogo|vincul/i,                   cat: 'produtos_conversas' },
      { regex: /usuário|acesso|bloqueio|role|owner/i,                 cat: 'usuarios_conversas' },
      { regex: /configuração|agendador|varredura|automático/i,        cat: 'config_conversas' },
      { regex: /mercado livre|ml|mlb|shopee|amazon/i,                 cat: 'plataformas_conversas' },
      { regex: /preço|preco|precific|custo|faturamento/i,             cat: 'financeiro_conversas' },
    ];
    for (const p of padroes) {
      if (p.regex.test(pergunta) || p.regex.test(respLimpa)) {
        const chaveNorm = pergunta.substring(0, 90).toLowerCase().replace(/[^a-záéíóúãõâêîôûç\s]/g, '').trim();
        if (chaveNorm.length > 5) await salvarConhecimento({ categoria: p.cat, chave: chaveNorm, valor: `Q: ${pergunta.substring(0, 180)} | A: ${respLimpa.substring(0, 260)}`, confianca: 0.60, fonte: 'extracao_conversa' });
        break;
      }
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 10 E 11 — LOOP DE APRENDIZADO E STATUS
// ═══════════════════════════════════════════════════════════════════════════════

let _loopAtivo      = false;
let _ultimaMentoria = 0;
let _cicloContador  = 0;

export async function iniciarLoopAprendizado() {
  if (_loopAtivo) return;
  _loopAtivo = true;
  logBrain('🚀 Loop de aprendizado contínuo iniciado!', 'success');

  const ciclo = async () => {
    if (!_loopAtivo) return;
    _cicloContador++;
    try {
      logBrain(`─── Ciclo #${_cicloContador} ───────────────────────────────`, 'info');
      await analisarSistemaAutonomamente();
      await limparAprendizadosAntigos();
      const agora = Date.now();
      if (agora - _ultimaMentoria > CICLO_MENTORIA_MS) {
        _ultimaMentoria = agora;
        await conversarComGeminiAutonomamente();
      }
    } catch (e) { logBrain(`Erro ciclo #${_cicloContador}: ${e.message}`, 'error'); }
    setTimeout(ciclo, CICLO_ANALISE_MS);
  };
  setTimeout(ciclo, 10_000);
}

export function pararLoopAprendizado() { _loopAtivo = false; logBrain('Loop parado', 'warn'); }

async function limparAprendizadosAntigos() {
  try {
    const lim = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rem = await prisma.iaAprendizado.deleteMany({ where: { aprovada: false, confianca: { lt: 0.25 }, createdAt: { lt: lim } } });
    if (rem.count > 0) logBrain(`${rem.count} aprendizados ruins removidos`, 'info');
  } catch {}
}

export async function getEstatisticasAprendizado() {
  try {
    const [totC, totA, ap, rp, ultE, cats] = await Promise.all([
      prisma.iaConhecimento.count(), prisma.iaAprendizado.count(),
      prisma.iaAprendizado.count({ where: { aprovada: true } }),
      prisma.iaAprendizado.count({ where: { aprovada: false } }),
      prisma.iaEstudoTerminal.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.iaConhecimento.groupBy({ by: ['categoria'], _count: true }).catch(() => []),
    ]);
    return { totalConhecimentos: totC, totalAprendizados: totA, taxaAcerto: totA > 0 ? Math.round((ap/totA)*100) : 0, aprovados: ap, reprovados: rp, ultimoEstudo: ultE?.createdAt || null, loopAtivo: _loopAtivo, cicloAtual: _cicloContador, categorias: cats.map(c => ({ categoria: c.categoria, total: c._count })) };
  } catch { return { totalConhecimentos: 0, totalAprendizados: 0, taxaAcerto: 0, aprovados: 0, reprovados: 0, loopAtivo: _loopAtivo, cicloAtual: _cicloContador, categorias: [] }; }
}