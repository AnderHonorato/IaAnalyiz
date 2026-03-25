// backend/src/iaService.js — v3 FIXED
// Fixes aplicados v3:
//  1. extractCodeBlocksAndSave: nomes de arquivo gerados com base no assunto da mensagem do usuário
//  2. Regex de bloco de código: aceita ```css sem newline obrigatória (fix CSS renderizando como texto)
//  3. Skills dinâmicas no Chain of Thought: cada etapa tem explicação específica no raciocínio interno

import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryKnowledge, saveKnowledge } from './ia-engine/knowledge.js';

const prisma    = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Carrega SKILL.md ──────────────────────────────────────────────────────────
let SKILL_CONTENT = '';
try {
  SKILL_CONTENT = fs.readFileSync(path.join(__dirname, 'skills', 'SKILL.md'), 'utf-8');
  console.log('\x1b[35m[IA-Skill] SKILL.md carregado ✓\x1b[0m');
} catch {
  console.warn('[IA-Skill] SKILL.md não encontrado — usando instruções padrão.');
}

// ─── Constantes ────────────────────────────────────────────────────────────────
const GEMINI_MODEL          = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const MAX_PAIRS             = 20;
const MAX_FILES             = 10;

const REASONING_CHUNK_SIZE  = 5;
const REASONING_CHUNK_DELAY = 16;

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN OF THOUGHT — System Prompt Principal
// ═══════════════════════════════════════════════════════════════════════════════
const CHAIN_OF_THOUGHT_PROMPT = `
=== DIRETRIZ DE RACIOCÍNIO EM CADEIA (CHAIN OF THOUGHT) ===

Antes de formular qualquer resposta final, você DEVE exibir seu raciocínio interno 
completo. Este processo de pensamento é exposto ao usuário de forma visual e estruturada.

FORMATO DO RACIOCÍNIO (siga exatamente):
- Cada bloco de pensamento começa com um TÍTULO em negrito (ex: **Analisando a Intenção**)
- Seguido de um parágrafo em texto simples descrevendo o raciocínio daquele estágio
- Múltiplos blocos se necessário, cobrindo diferentes ângulos do problema
- Tom: primeira pessoa, monólogo interno, pensamento fluido e analítico

ESTÁGIOS OBRIGATÓRIOS DE RACIOCÍNIO:

1. DETECÇÃO DE CONTEXTO E EMOÇÃO
   Identifique: O que o usuário realmente quer? Qual é o tom emocional?
   Se detectar emoção forte, NOMEIE e ajuste o tom da resposta.

2. CLASSIFICAÇÃO DO TIPO DE ENTRADA E SKILL SELECIONADA
   - CÓDIGO/WEBSITE: análise técnica → sintaxe → lógica → segurança
   - IMAGEM: detecção visual → contexto → insights
   - DOCUMENTO/DADOS: extração → correlação → síntese
   - LOGÍSTICA: divergências → frete → anúncios ML
   - CATÁLOGO: produtos → SKUs → kits
   - USUÁRIOS: permissões → gestão de acesso
   - PRECIFICAÇÃO: histórico → estratégia
   - DASHBOARD: métricas → indicadores de saúde
   - TEXTO/PERGUNTA: intenção → contexto → resposta

3. PLANEJAMENTO DA RESPOSTA
   O que vou consultar? Quais ferramentas usar? Qual estrutura de resposta?
   IMPORTANTE: Ao gerar código, os arquivos devem ter nomes descritivos baseados
   no assunto do cliente (ex: petshop.html, relatorio_vendas.py), nunca genéricos.

4. VERIFICAÇÃO FINAL
   A resposta resolve o problema? Está dentro das permissões do usuário?

REGRAS DE OURO:
- Nunca pule o raciocínio mesmo para perguntas simples
- Se o usuário estiver frustrado ou bravo, reconheça isso explicitamente no pensamento
- Nunca altere nomes de variáveis, funções ou classes em código do usuário
- Sempre forneça código completo, sem elipses ou cortes
- Responda sempre em Português do Brasil
- Nomes de arquivos gerados SEMPRE baseados no contexto/assunto do cliente

=== FIM DA DIRETRIZ DE RACIOCÍNIO ===
`;

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTOR DE EMOÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function detectEmotionFromMessage(message) {
  if (!message) return null;

  if (/\b(brav[ao]|irritad[ao]|furioso|raiva|ódio|que merda|droga|porra|que absurdo|ridículo)\b/i.test(message))
    return { type: 'raiva', label: 'Detectando Frustração', desc: 'O usuário está claramente irritado ou frustrado.' };
  if (/\b(triste|chateado|deprimid[ao]|arrasado|mal|péssimo|horrível|chorando)\b/i.test(message))
    return { type: 'tristeza', label: 'Detectando Sentimento Negativo', desc: 'O usuário parece estar desmotivado ou triste.' };
  if (/\b(ansios[ao]|preocupad[ao]|nervos[ao]|assustado|medo|tenso|não sei o que fazer)\b/i.test(message))
    return { type: 'ansiedade', label: 'Detectando Ansiedade', desc: 'O usuário parece ansioso ou preocupado com a situação.' };
  if (/\b(urgente|rápido|agora|imediato|preciso já|socorro|help|corre)\b/i.test(message))
    return { type: 'urgência', label: 'Detectando Urgência', desc: 'O usuário demonstra urgência — precisarei priorizar velocidade e clareza.' };
  if (/\b(feliz|ótimo|excelente|incrível|perfeito|amei|adorei|massa|show|demais)\b/i.test(message))
    return { type: 'alegria', label: 'Detectando Entusiasmo', desc: 'O usuário está animado e satisfeito.' };
  if (/(!{2,}|\?{2,})/i.test(message))
    return { type: 'ênfase', label: 'Detectando Ênfase Forte', desc: 'O usuário está usando pontuação enfática, indicando intensidade emocional.' };

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICAÇÃO DE INPUT COM SKILL SELECIONADA
// ═══════════════════════════════════════════════════════════════════════════════
function classifyInput(message, fileContexts) {
  if (fileContexts.length > 0) {
    const hasPdf   = fileContexts.some(f => f.group === 'pdf');
    const hasImg   = fileContexts.some(f => f.group === 'image');
    const hasExcel = fileContexts.some(f => f.group === 'excel');
    const hasAudio = fileContexts.some(f => f.group === 'audio');

    if (hasImg)   return { type: 'IMAGEM',    label: 'Skill Visão Computacional Ativada' };
    if (hasPdf)   return { type: 'DOCUMENTO', label: 'Skill Análise de Documento PDF Ativada' };
    if (hasExcel) return { type: 'DADOS',     label: 'Skill Análise de Dados Estruturados Ativada' };
    if (hasAudio) return { type: 'ÁUDIO',     label: 'Skill Transcrição de Áudio Ativada' };
    const types = [...new Set(fileContexts.map(f => f.label || f.group))];
    return { type: 'ARQUIVO', label: `Skill Processamento: ${types.join(', ')}` };
  }

  const m = (message || '').toLowerCase();
  if (/site|website|landing page|página web|html.*css|criar.*página|desenvolver.*site/i.test(message))
    return { type: 'WEBSITE',    label: 'Skill Desenvolvimento Web Ativada' };
  if (/```|function|const |let |var |import |class |def |<div|<button|\btsx\b|\bjsx\b|\bcomponent\b/i.test(message))
    return { type: 'CÓDIGO',    label: 'Skill Análise de Código Ativada' };
  if (/divergen|peso|frete|auditoria|varredura|anúncio/i.test(m))
    return { type: 'LOGÍSTICA', label: 'Skill Logística ML Ativada' };
  if (/produto|sku|catálogo|estoque|kit/i.test(m))
    return { type: 'CATÁLOGO',  label: 'Skill Gestão de Catálogo Ativada' };
  if (/usuário|acesso|aprovar|bloquear|permissão/i.test(m))
    return { type: 'USUÁRIO',   label: 'Skill Gestão de Usuários Ativada' };
  if (/preço|precific|valor|custo|faturamento/i.test(m))
    return { type: 'PREÇO',     label: 'Skill Análise de Precificação Ativada' };
  if (/resumo|relatório|métricas|dashboard|visão geral/i.test(m))
    return { type: 'RESUMO',    label: 'Skill Dashboard e Métricas Ativada' };

  return { type: 'TEXTO', label: 'Skill Análise de Intenção Ativada' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GERADOR DE NOME DE ARQUIVO INTELIGENTE
// Gera nome baseado no assunto da mensagem do usuário — não genérico
// ═══════════════════════════════════════════════════════════════════════════════
function gerarNomeArquivoInteligente(lang, userMessage) {
  const msg = (userMessage || '').toLowerCase();
  const l   = (lang || '').toLowerCase().trim();

  const EXT = {
    html:'html', css:'css', js:'js', jsx:'jsx', ts:'ts', tsx:'tsx',
    py:'py', sql:'sql', json:'json', sh:'sh', bash:'sh', md:'md',
    yaml:'yaml', yml:'yaml', xml:'xml', java:'java', cs:'cs', cpp:'cpp',
    go:'go', rs:'rs', rb:'rb', php:'php', swift:'swift', kt:'kt',
    txt:'txt', env:'env', dockerfile:'dockerfile', toml:'toml',
  };
  const ext = EXT[l] || l || 'txt';

  // Detecta assunto específico da mensagem para nomear o arquivo
  const patterns = [
    { regex: /petshop|pet shop|loja.*pet/i,          name: 'petshop' },
    { regex: /landing page|página.*vendas|sales/i,   name: 'landing_page' },
    { regex: /portfolio|portfólio/i,                  name: 'portfolio' },
    { regex: /login|autenticação|auth/i,              name: 'login' },
    { regex: /dashboard|painel|admin/i,               name: 'dashboard' },
    { regex: /restaurante|cardápio|delivery/i,        name: 'restaurante' },
    { regex: /e-?commerce|loja.*online|store/i,       name: 'ecommerce' },
    { regex: /blog|artigo|post/i,                     name: 'blog' },
    { regex: /agenda|calendário|schedule/i,           name: 'agenda' },
    { regex: /calculadora|calculator/i,               name: 'calculadora' },
    { regex: /formulário|form|contato/i,              name: 'formulario' },
    { regex: /relatório|report|métricas/i,             name: 'relatorio' },
    { regex: /produto|catalog|catálogo/i,             name: 'catalogo' },
    { regex: /divergenc|frete|peso/i,                  name: 'divergencias' },
    { regex: /usuari|user|perfil|profile/i,           name: 'usuarios' },
    { regex: /clinica|consultório|médico/i,            name: 'clinica' },
    { regex: /escola|educação|curso/i,                name: 'educacao' },
    { regex: /hotél|hotel|hospedagem|pousada/i,       name: 'hotel' },
    { regex: /academia|fitness|gym/i,                 name: 'academia' },
    { regex: /imobiliária|imoveis|apartamento/i,      name: 'imobiliaria' },
  ];

  let base = '';
  for (const p of patterns) {
    if (p.regex.test(msg)) { base = p.name; break; }
  }

  // Sufixo por tipo quando não há assunto específico
  if (!base) {
    const defaultNames = {
      html:'pagina', css:'estilo', js:'script', jsx:'componente',
      tsx:'componente', ts:'codigo', py:'script', sql:'query',
      json:'dados', sh:'script', bash:'script', yaml:'config',
      yml:'config', xml:'dados', java:'codigo', cs:'codigo',
      cpp:'codigo', go:'codigo', rs:'codigo', rb:'script',
      php:'script', swift:'codigo', kt:'codigo', md:'documento',
    };
    base = defaultNames[l] || 'arquivo';
  }

  // Sufixo por tipo de arquivo (css do mesmo projeto recebe _estilo, etc.)
  const typeSuffix = {
    html:'', css:'_estilo', js:'_script', jsx:'_componente',
    tsx:'_componente', py:'_script', sql:'_query',
  };
  const suffix = typeSuffix[l] !== undefined ? typeSuffix[l] : '';

  return `${base}${suffix}.${ext}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN OF THOUGHT — Builder com Skills Dinâmicas
// ═══════════════════════════════════════════════════════════════════════════════
function buildChainOfThoughtText(message, fileContexts, context, hasFiles) {
  const blocks = [];
  const role   = context.userRole || 'USUARIO';
  const msg    = message || '';

  // Bloco 1: Emoção
  const emotion = detectEmotionFromMessage(msg);
  if (emotion) {
    blocks.push({
      title: emotion.label,
      text:  `${emotion.desc} Isso muda como vou estruturar a resposta — preciso equilibrar empatia com a solução técnica, sem ignorar o estado emocional presente na mensagem.`,
    });
  }

  // Bloco 2: Classificação + Skill selecionada
  const classification = classifyInput(msg, fileContexts);
  let classText = '';
  switch (classification.type) {
    case 'WEBSITE':
      classText = `Identifiquei uma solicitação de desenvolvimento web. Skill selecionada: Desenvolvimento Web. Protocolo: Etapa A (Planejamento) — definir estrutura semântica HTML e arquitetura CSS; Etapa B (Geração) — criar código completo com HTML semântico, CSS moderno (variáveis, flex/grid, responsivo) e JavaScript quando necessário; Etapa C (Nomenclatura) — os arquivos serão nomeados com base no assunto do cliente (ex: petshop.html, petshop_estilo.css).`;
      break;
    case 'CÓDIGO':
      classText = `Identifiquei que a entrada contém código-fonte. Skill selecionada: Análise de Código. Etapa A (Sintaxe) — verificar erros de escrita e compatibilidade; Etapa B (Lógica) — mapear o fluxo de dados e identificar gargalos; Etapa C (Segurança) — verificar vulnerabilidades. Manterei exatamente os nomes de variáveis e funções fornecidos pelo usuário.`;
      break;
    case 'IMAGEM':
      classText = `Entrada contém imagem(ns). Skill selecionada: Visão Computacional. Etapa A (Detecção) — identificar todos os elementos visuais, textos e contexto; Etapa B (Interpretação) — analisar a relação entre os elementos e o que representam no sistema; Etapa C (Insights) — produzir descrição analítica com achados relevantes.`;
      break;
    case 'DOCUMENTO':
    case 'DADOS':
      classText = `Há um documento ou planilha para processar. Skill selecionada: Análise de Dados Estruturados. Etapa A (Extração) — identificar métricas-chave e informações principais; Etapa B (Correlação) — cruzar os dados com o contexto do projeto; Etapa C (Síntese) — produzir resumo executivo com as descobertas mais relevantes.`;
      break;
    case 'ÁUDIO':
      classText = `Entrada é arquivo de áudio. Skill selecionada: Transcrição de Áudio. Vou transcrever fielmente e depois aplicar análise de sentimento e intenção ao conteúdo transcrito para fornecer resposta contextualizada.`;
      break;
    case 'LOGÍSTICA':
      classText = `Solicitação relacionada a divergências de peso, frete ou auditoria. Skill selecionada: Logística ML. Vou consultar o estado atual das divergências no banco de dados, verificar os anúncios afetados e determinar o plano de ação mais eficiente — correção automática via API, ignorar ou corrigir manualmente.`;
      break;
    case 'CATÁLOGO':
      classText = `Intenção envolve o catálogo de produtos — SKUs, estoque, kits ou vínculos ML. Skill selecionada: Gestão de Catálogo. Preciso acessar os dados do catálogo para fornecer informações precisas sobre o estado atual dos produtos.`;
      break;
    case 'USUÁRIO':
      if (role === 'OWNER' || role === 'ADMIN') {
        classText = `Solicitação de gerenciamento de usuários. Skill selecionada: Gestão de Usuários. O usuário possui permissão de nível ${role}, então posso executar ações administrativas como aprovação, bloqueio e alteração de roles.`;
      } else {
        classText = `A pergunta envolve gerenciamento de usuários, mas o nível de acesso atual (${role}) não permite essas operações. Vou explicar a limitação e sugerir quem pode executar a ação.`;
      }
      break;
    case 'RESUMO':
      classText = `Pedido de visão geral ou dashboard. Skill selecionada: Dashboard e Métricas. Compilarei as principais métricas do sistema: produtos, divergências por status, avisos ML, agendador e conexão OAuth. Apresentarei de forma estruturada com indicadores de saúde do sistema.`;
      break;
    default:
      classText = `Processando: "${msg.substring(0, 100)}${msg.length > 100 ? '…' : ''}". Skill selecionada: Análise de Intenção. Vou determinar se é necessário consultar o banco de dados, executar alguma ferramenta do sistema ou responder com base no conhecimento disponível.`;
  }
  blocks.push({ title: classification.label, text: classText });

  // Bloco 3: Ferramentas
  let toolText = '';
  if (context.dataBlock) {
    toolText = `Os dados relevantes do banco de dados já foram carregados e estão disponíveis como contexto primário. Vou usá-los para embasar a resposta com informações reais em vez de estimativas.`;
  } else if (/divergen|produto|usuário|preço|agendador/i.test(msg)) {
    toolText = `Precisarei consultar o banco de dados via ferramentas do sistema para obter dados precisos antes de formular a resposta. As ferramentas disponíveis serão invocadas conforme necessário.`;
  } else {
    toolText = `Verificando se há necessidade de consultar ferramentas externas ou o banco de dados. Para esta solicitação, a resposta pode ser formulada com base no contexto disponível.`;
  }
  blocks.push({ title: 'Verificando Dados e Ferramentas Disponíveis', text: toolText });

  // Bloco 4: Arquivos
  if (hasFiles && fileContexts.length > 0) {
    const nomes      = fileContexts.map(f => `"${f.name}"`).join(', ');
    const totalChars = fileContexts.reduce((s, f) => s + (f.context?.length || 0), 0);
    blocks.push({
      title: 'Processando Conteúdo dos Arquivos',
      text:  `Os arquivos ${nomes} foram lidos com sucesso — ${totalChars.toLocaleString()} caracteres disponíveis para análise. O conteúdo extraído será o contexto principal da minha resposta.`,
    });
  }

  // Bloco 5: Estratégia + Nomenclatura de arquivos
  let strategyText = '';
  const hasCode = /```/.test(msg) || classification.type === 'CÓDIGO' || classification.type === 'WEBSITE';
  if (classification.type === 'WEBSITE') {
    const assunto = msg.match(/petshop|pet shop|restaurante|loja|portfolio|clinica|blog|hotel|academia/i)?.[0] || 'projeto';
    strategyText = `Vou criar o site completo com código funcional. Os arquivos serão nomeados de acordo com o assunto: "${assunto.toLowerCase()}.html" para a estrutura e "${assunto.toLowerCase()}_estilo.css" para o visual. Se necessário JS, será "${assunto.toLowerCase()}_script.js". Nenhum arquivo com nome genérico como "pagina.html" ou "estilo.css".`;
  } else if (hasCode) {
    strategyText = `Vou entregar o código corrigido e otimizado de forma completa, sem elipses ou cortes. O arquivo gerado terá nome descritivo baseado no assunto do cliente. Manterei exatamente os nomes originais das funções, variáveis e classes.`;
  } else if (emotion?.type === 'raiva' || emotion?.type === 'urgência') {
    strategyText = `Dado o tom da mensagem, vou ser direto e objetivo. Primeiro reconhecerei a situação, depois apresentarei a solução de forma concisa e acionável. Evitarei explicações excessivas.`;
  } else {
    strategyText = `Formularei a resposta de forma clara e estruturada, usando HTML para formatação quando necessário. Se houver dados numéricos, apresentarei de forma visual. Se houver ações possíveis, listá-las-ei com instruções diretas.`;
  }
  blocks.push({ title: 'Definindo Estratégia de Resposta', text: strategyText });

  return blocks.map(b => `**${b.title}**\n\n${b.text}`).join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMISSÃO DO REASONING EM CHUNKS
// ═══════════════════════════════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function emitReasoningStreamed(onStep, text) {
  if (!onStep || !text) return;
  onStep({ type: 'reasoning_start' });
  for (let i = 0; i < text.length; i += REASONING_CHUNK_SIZE) {
    const chunk = text.slice(i, i + REASONING_CHUNK_SIZE);
    onStep({ type: 'reasoning_chunk', text: chunk });
    await sleep(REASONING_CHUNK_DELAY);
  }
  onStep({ type: 'reasoning_end', fullText: text });
}

async function emitStep(onStep, msg, tool, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type: 'step', msg, tool });
}

async function emitDone(onStep, stepKey, delayMs = 0) {
  if (delayMs > 0) await sleep(delayMs);
  if (onStep) onStep({ type: 'step_done', stepIndex: stepKey });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE CATALOG / ROLES
// ═══════════════════════════════════════════════════════════════════════════════
export const PAGE_CATALOG = {
  '/':             { titulo:'Home / Dashboard',          desc:'Visão geral do sistema, métricas principais' },
  '/ml':           { titulo:'Mercado Livre — Dashboard', desc:'Ferramentas ML: Radar de Fretes, Precificação, Pesquisa, Anúncios' },
  '/ml/auditoria': { titulo:'Radar de Fretes',           desc:'Scanner de divergências de peso/frete nos anúncios ML' },
  '/ml/precos':    { titulo:'Precificação ML',            desc:'Gerenciamento de preços. Histórico, atualização em lote' },
  '/ml/pesquisa':  { titulo:'Pesquisa de Anúncios',      desc:'Pesquisa por link ou ID. Preços, vendedores, concorrentes' },
  '/ml/anuncios':  { titulo:'Meus Anúncios ML',          desc:'Lista anúncios do usuário. Filtros por status, exportação CSV' },
  '/shopee':       { titulo:'Shopee',                    desc:'Integração com Shopee (em desenvolvimento)' },
  '/amazon':       { titulo:'Amazon',                    desc:'Integração com Amazon (em desenvolvimento)' },
  '/usuarios':     { titulo:'Gerenciamento de Usuários', desc:'Lista e gerencia usuários. Aprovar/bloquear. Alterar roles' },
};

const ROLE_CAPABILITIES = {
  BLOQUEADO: { desc:'Sem acesso.', paginasAcesso:[], acoesPermitidas:[], restricoes:[] },
  USUARIO:   { desc:'Acesso ao próprio catálogo.', paginasAcesso:['/','/ml','/ml/auditoria','/ml/precos','/ml/pesquisa','/ml/anuncios','/shopee','/amazon'], acoesPermitidas:['ver próprios produtos','ver próprias divergências','corrigir divergências','configurar agendador'], restricoes:['NÃO pode ver dados de outros usuários','NÃO pode aprovar/bloquear usuários'] },
  ADMIN:     { desc:'Acesso ampliado.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['tudo do USUARIO','ver dados de todos','gerenciar usuários'], restricoes:['NÃO pode excluir usuários permanentemente'] },
  OWNER:     { desc:'Acesso total.', paginasAcesso:Object.keys(PAGE_CATALOG), acoesPermitidas:['acesso total a tudo'], restricoes:[] },
};

const STEP_DELAYS = {
  pdf_extracting:1200, pdf_done:400, excel_analyzing:1000, excel_done:300,
  txt_reading:300,     txt_done:200, audio_transcribing:2000, audio_done:400,
  image_analyzing:700, image_done:300, db_done:250,
};

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function stripHTML(text) {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function buildGeminiHistory(history) {
  if (!history?.length) return [];
  const msgs  = history.slice(0, -1);
  const pairs = [];
  let i = 0;
  while (i < msgs.length) {
    const cur = msgs[i], next = msgs[i + 1];
    if (cur.role === 'user' && next?.role === 'ia') {
      pairs.push({
        user:  stripHTML(cur.content).substring(0, 800),
        model: stripHTML(next.content).substring(0, 800),
      });
      i += 2;
    } else {
      i++;
    }
  }
  const result = [];
  for (const p of pairs.slice(-MAX_PAIRS)) {
    result.push({ role: 'user',  parts: [{ text: p.user  }] });
    result.push({ role: 'model', parts: [{ text: p.model }] });
  }
  return result;
}

export function needsWebSearch(message) {
  if (!message) return false;
  return /mercado\s*livre|ml\s*api|taxa|tarifa|comiss[ãa]o|frete|clima|dólar|notícia/i.test(message);
}

// ─── Salvar documentos ─────────────────────────────────────────────────────────
async function saveChatDocument(sessionId, filename, tipo, content, language = null) {
  if (!sessionId) return;
  try {
    const ultimo = await prisma.chatDocument.findFirst({ where: { sessionId, filename }, orderBy: { versao: 'desc' } });
    const versao = ultimo ? ultimo.versao + 1 : 1;
    await prisma.chatDocument.create({ data: { sessionId, filename, tipo, language, content, versao } });
  } catch (e) { console.error('[SaveDoc]', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX CRÍTICO: extractCodeBlocksAndSave
// 1. Regex aceita ```css sem newline obrigatória
// 2. Nomes de arquivo gerados com base no assunto da mensagem do usuário
// ═══════════════════════════════════════════════════════════════════════════════
async function extractCodeBlocksAndSave(sessionId, replyText, userMessage) {
  if (!sessionId || !replyText) return;

  // FIX: regex mais robusta — aceita qualquer whitespace após o lang (incluindo sem newline)
  const regex = /```([a-zA-Z0-9_+#.\-]*)[^\S\r\n]*\r?\n?([\s\S]*?)```/g;
  let match;
  const usedNames = new Set();

  while ((match = regex.exec(replyText)) !== null) {
    const lang = (match[1] || '').trim().toLowerCase() || 'txt';
    const code = match[2] || '';
    if (!code.trim()) continue;

    // FIX: nome inteligente baseado no assunto da mensagem do usuário
    let filename = gerarNomeArquivoInteligente(lang, userMessage);

    // Garante unicidade
    let attempt = 1;
    const originalFilename = filename;
    while (usedNames.has(filename)) {
      attempt++;
      const dotIdx = originalFilename.lastIndexOf('.');
      filename = dotIdx > -1
        ? `${originalFilename.slice(0, dotIdx)}_${attempt}.${originalFilename.slice(dotIdx + 1)}`
        : `${originalFilename}_${attempt}`;
    }
    usedNames.add(filename);

    await saveChatDocument(sessionId, filename, 'gerado', code, lang || null);
  }
}

// ─── Extração de arquivos ──────────────────────────────────────────────────────
async function extractPDF(base64, fileName) {
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0, maxOutputTokens: 8000 },
      contents: [{ role: 'user', parts: [
        { text: `Extraia TODO o texto deste PDF. Arquivo: ${fileName}` },
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
      ]}],
    });
    return r.text?.trim() || null;
  } catch { return null; }
}

async function extractExcel(base64, mimeType, fileName) {
  // ── CSV: processamento direto ──────────────────────────────────────────────
  if (mimeType === 'text/csv') {
    try {
      const text  = Buffer.from(base64, 'base64').toString('utf-8');
      const lines = text.split('\n').slice(0, 300);
      const formatted = lines.map((line, idx) => {
        const cols = [];
        let cur = '', inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; }
          else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        cols.push(cur.trim());
        return `${idx === 0 ? '## ' : ''}${cols.join(' | ')}`;
      }).join('\n');
      return `=== CSV: ${fileName} (${lines.length} linhas) ===\n${formatted}`.substring(0, 15000);
    } catch (e) {
      console.warn('[extractExcel CSV]', e.message);
    }
  }

  // ── XLSX/XLS: tenta SheetJS ────────────────────────────────────────────────
  try {
    const XLSX = await import('xlsx').catch(() => null);
    if (XLSX) {
      const buffer   = Buffer.from(base64, 'base64');
      const workbook = XLSX.read(buffer, { type:'buffer', cellText:true, cellDates:true, raw:false });
      const sheetNames = workbook.SheetNames;
      if (!sheetNames || sheetNames.length === 0) throw new Error('Workbook sem abas');

      const allSheets = [];
      for (const sheetName of sheetNames.slice(0, 8)) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const data = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', blankrows:false });
        if (!data || data.length === 0) continue;
        const maxCols = Math.max(...data.slice(0, 5).map(r => (Array.isArray(r) ? r.length : 0)));
        const rows = data.slice(0, 200).map((row, idx) => {
          const cells = Array.isArray(row) ? row : [];
          const normalized = Array.from({ length: maxCols }, (_, c) =>
            String(cells[c] ?? '').trim().replace(/\s+/g, ' ').substring(0, 100)
          );
          return `${idx === 0 ? '## ' : ''}${normalized.join(' | ')}`;
        });
        allSheets.push(`=== Aba: "${sheetName}" (${data.length} linhas × ${maxCols} colunas) ===\n${rows.join('\n')}`);
      }

      if (allSheets.length > 0) {
        const header = `=== Planilha: ${fileName} (${sheetNames.length} aba${sheetNames.length !== 1 ? 's' : ''}: ${sheetNames.slice(0, 8).join(', ')}) ===\n\n`;
        return (header + allSheets.join('\n\n')).substring(0, 20000);
      }
    }
  } catch (e) {
    console.warn('[extractExcel SheetJS]', e.message, '— tentando Gemini como fallback');
  }

  // ── Fallback: Gemini ────────────────────────────────────────────────────────
  try {
    const ai = getClient();
    const geminiMime = mimeType.includes('openxmlformats')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.ms-excel';
    const r = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0, maxOutputTokens: 8000 },
      contents: [{ role: 'user', parts: [
        { text: `Extraia TODOS os dados desta planilha Excel "${fileName}". Liste cada linha no formato: COLUNA1 | COLUNA2 | COLUNA3.` },
        { inlineData: { mimeType: geminiMime, data: base64 } },
      ]}],
    });
    const result = r.text?.trim();
    if (result && result.length > 20) return result;
  } catch (e2) {
    console.warn('[extractExcel Gemini fallback]', e2.message);
  }

  return `Não foi possível extrair os dados de "${fileName}". Dica: salve o arquivo como CSV (UTF-8) para melhor compatibilidade.`;
}

function extractTXT(base64) {
  return Buffer.from(base64, 'base64').toString('utf-8').substring(0, 20000);
}

async function transcribeAudio(base64, mimeType) {
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0 },
      contents: [{ role: 'user', parts: [
        { text: 'Transcreva este áudio fielmente.' },
        { inlineData: { mimeType, data: base64 } },
      ]}],
    });
    return r.text?.trim() || null;
  } catch { return null; }
}

export async function analyzeImage(base64, mimeType = 'image/jpeg', userQuestion = '') {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = getClient();
    const r  = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: { temperature: 0.2 },
      contents: [{ role: 'user', parts: [
        { text: userQuestion || 'Descreva esta imagem detalhadamente.' },
        { inlineData: { mimeType, data: base64 } },
      ]}],
    });
    return r.text?.trim() || null;
  } catch { return null; }
}

async function fetchPageContent(url) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'AnalyizBot/1.0', 'Accept': 'text/html' },
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const html = await resp.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 8000) || null;
  } catch { return null; }
}

export async function processFileToContext(file, userMessage, onStep, baseStepKey = 0, sessionId = null) {
  const { base64, mimeType, name, group } = file;
  let context = null, fileTypeLabel = '', stepKeyLocal = baseStepKey;

  const step = async (msg, delay = 0) => { await emitStep(onStep, msg, null, delay); return stepKeyLocal++; };
  const done = async (key, delay = STEP_DELAYS.db_done) => { await emitDone(onStep, key, delay); };

  switch (group) {
    case 'image': {
      const k = await step(`Analisando imagem "${name}"…`, STEP_DELAYS.image_analyzing);
      context = await analyzeImage(base64, mimeType, userMessage || '');
      await done(k, STEP_DELAYS.image_done);
      fileTypeLabel = 'imagem';
      break;
    }
    case 'pdf': {
      const k = await step(`Lendo PDF "${name}"…`, STEP_DELAYS.pdf_extracting);
      context = await extractPDF(base64, name);
      await done(k, STEP_DELAYS.pdf_done);
      fileTypeLabel = 'PDF';
      break;
    }
    case 'excel': {
      const label = mimeType === 'text/csv' ? 'CSV' : 'planilha Excel';
      const k     = await step(`Lendo ${label} "${name}"…`, STEP_DELAYS.excel_analyzing);
      context     = await extractExcel(base64, mimeType, name);
      await done(k, STEP_DELAYS.excel_done);
      fileTypeLabel = label;
      break;
    }
    case 'txt': {
      const k = await step(`Lendo TXT "${name}"…`, STEP_DELAYS.txt_reading);
      context = extractTXT(base64);
      await done(k, STEP_DELAYS.txt_done);
      fileTypeLabel = 'texto';
      break;
    }
    case 'audio': {
      const k = await step(`Transcrevendo áudio "${name}"…`, STEP_DELAYS.audio_transcribing);
      context = await transcribeAudio(base64, mimeType);
      await done(k, STEP_DELAYS.audio_done);
      fileTypeLabel = 'áudio';
      break;
    }
  }

  if (context && sessionId) await saveChatDocument(sessionId, name, 'upload', context);
  return { context, label: fileTypeLabel, name, group, stepsUsed: stepKeyLocal - baseStepKey };
}

// ─── Ferramentas (Function Calling) ───────────────────────────────────────────
function buildTools(userRole) {
  const isPriv = userRole === 'OWNER' || userRole === 'ADMIN';
  const tools  = [
    { name:'listarDivergenciasAtivas',   description:'Lista divergências de frete/peso ativas.',           parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, status:{ type:'STRING' } } } },
    { name:'enviarParaFilaDeCorrecao',   description:'Envia divergência para correção automática.',         parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'ignorarDivergencia',         description:'Marca divergência como IGNORADA.',                    parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'marcarDivergenciaCorrigida', description:'Marca divergência como CORRIGIDO manualmente.',       parameters:{ type:'OBJECT', properties:{ divergenciaId:{ type:'INTEGER' } }, required:['divergenciaId'] } },
    { name:'enviarLoteDivergencias',     description:'Envia TODAS as divergências PENDENTES para correção.',parameters:{ type:'OBJECT', properties:{} } },
    { name:'consultarAgendador',         description:'Verifica estado do agendador automático.',            parameters:{ type:'OBJECT', properties:{} } },
    { name:'ativarAgendador',            description:'Ativa varredura automática no intervalo informado.',  parameters:{ type:'OBJECT', properties:{ intervaloMinutos:{ type:'INTEGER' } }, required:['intervaloMinutos'] } },
    { name:'desativarAgendador',         description:'Desativa varredura automática.',                      parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarProdutos',             description:'Lista produtos do catálogo.',                         parameters:{ type:'OBJECT', properties:{ busca:{ type:'STRING' }, limite:{ type:'INTEGER' }, semPeso:{ type:'BOOLEAN' }, semVinculo:{ type:'BOOLEAN' } } } },
    { name:'listarAvisosML',             description:'Lista avisos ativos do Mercado Livre.',               parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' } } } },
    { name:'consultarStatusConexaoML',   description:'Verifica se a conta ML está conectada.',              parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarHistoricoPrecos',      description:'Lista histórico de preços dos anúncios.',             parameters:{ type:'OBJECT', properties:{ limite:{ type:'INTEGER' }, mlItemId:{ type:'STRING' } } } },
    { name:'resumoGeral',                description:'Retorna métricas gerais do sistema.',                 parameters:{ type:'OBJECT', properties:{} } },
    { name:'listarPaginasDisponiveis',   description:'Lista páginas acessíveis pelo usuário.',              parameters:{ type:'OBJECT', properties:{} } },
    { name:'lerPagina',                  description:'Lê conteúdo de página local ou remota.',              parameters:{ type:'OBJECT', properties:{ caminho:{ type:'STRING' } }, required:['caminho'] } },
  ];
  if (isPriv) {
    tools.push(
      { name:'listarUsuariosPendentes',  description:'Lista usuários aguardando aprovação.',               parameters:{ type:'OBJECT', properties:{} } },
      { name:'aprovarUsuario',           description:'Aprova acesso de um usuário.',                       parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'bloquearUsuario',          description:'Bloqueia acesso de um usuário.',                     parameters:{ type:'OBJECT', properties:{ usuarioId:{ type:'INTEGER' } }, required:['usuarioId'] } },
      { name:'resumoGlobalPlataforma',   description:'Métricas globais (apenas ADMIN/OWNER).',             parameters:{ type:'OBJECT', properties:{} } },
    );
  }
  return [{ functionDeclarations: tools }];
}

async function executeTool(name, args, userId, userRole, pageBaseUrl) {
  const uid    = parseInt(userId);
  const isPriv = userRole === 'OWNER' || userRole === 'ADMIN';
  if (!uid && name !== 'lerPagina') return { erro: 'Usuário não identificado' };
  try {
    switch (name) {
      case 'listarDivergenciasAtivas': {
        const where = { usuarioId: uid, status: args.status ? args.status : { in: ['PENDENTE', 'REINCIDENTE', 'PENDENTE_ENVIO'] } };
        const divs  = await prisma.divergencia.findMany({ where, take: Math.min(args.limite || 5, 20), orderBy: { createdAt: 'desc' }, select: { id: true, mlItemId: true, titulo: true, pesoMl: true, pesoLocal: true, status: true, motivo: true } });
        return divs.length ? { divergenciasEncontradas: divs, total: divs.length } : { mensagem: 'Nenhuma divergência ativa.' };
      }
      case 'enviarParaFilaDeCorrecao': {
        const d = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!d) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: d.id }, data: { status: 'PENDENTE_ENVIO' } });
        return { sucesso: true, mensagem: `${d.mlItemId} enviada para fila.` };
      }
      case 'ignorarDivergencia': {
        const d = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!d) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: d.id }, data: { status: 'IGNORADO', resolvido: true } });
        return { sucesso: true, mensagem: `${d.mlItemId} ignorada.` };
      }
      case 'marcarDivergenciaCorrigida': {
        const d = await prisma.divergencia.findFirst({ where: { id: parseInt(args.divergenciaId), usuarioId: uid } });
        if (!d) return { erro: 'Divergência não encontrada.' };
        await prisma.divergencia.update({ where: { id: d.id }, data: { status: 'CORRIGIDO', resolvido: true, corrigidoManual: true } });
        await prisma.divergenciaHistorico.create({ data: { divergenciaId: d.id, usuarioId: uid, acao: 'CORRIGIDO_MANUAL', descricao: 'Corrigido via chat' } }).catch(() => {});
        return { sucesso: true, mensagem: `${d.mlItemId} corrigida.` };
      }
      case 'enviarLoteDivergencias': {
        const r = await prisma.divergencia.updateMany({ where: { usuarioId: uid, status: 'PENDENTE' }, data: { status: 'PENDENTE_ENVIO' } });
        return { sucesso: true, mensagem: `${r.count} divergência(s) enviada(s) para fila.` };
      }
      case 'consultarAgendador': {
        const ag = await prisma.agendadorConfig.findUnique({ where: { usuarioId: uid } });
        if (!ag) return { mensagem: 'Nenhum agendador configurado.' };
        return { status: ag.ativo ? 'Ativo' : 'Inativo', intervaloMinutos: ag.intervalo, ultimaExecucao: ag.ultimaExecucao, proximaExecucao: ag.proximaExecucao };
      }
      case 'ativarAgendador': {
        const min = parseInt(args.intervaloMinutos) || 360;
        await prisma.agendadorConfig.upsert({ where: { usuarioId: uid }, update: { ativo: true, intervalo: min }, create: { usuarioId: uid, ativo: true, intervalo: min } });
        return { sucesso: true, mensagem: `Agendador ativado (a cada ${min}min).` };
      }
      case 'desativarAgendador': {
        await prisma.agendadorConfig.upsert({ where: { usuarioId: uid }, update: { ativo: false }, create: { usuarioId: uid, ativo: false, intervalo: 360 } });
        return { sucesso: true, mensagem: 'Agendador desativado.' };
      }
      case 'listarProdutos': {
        const where = { usuarioId: uid };
        if (args.semPeso)    where.pesoGramas = 0;
        if (args.semVinculo) where.mlItemId   = null;
        if (args.busca)      where.OR = [{ nome: { contains: args.busca, mode: 'insensitive' } }, { sku: { contains: args.busca, mode: 'insensitive' } }];
        const produtos = await prisma.produto.findMany({ where, take: Math.min(args.limite || 10, 30), orderBy: { id: 'desc' }, select: { id: true, sku: true, nome: true, preco: true, pesoGramas: true, mlItemId: true, status: true, eKit: true } });
        return { produtos, totalNoCatalogo: await prisma.produto.count({ where: { usuarioId: uid } }), exibindo: produtos.length };
      }
      case 'listarAvisosML': {
        const avisos = await prisma.avisoML.findMany({ where: { usuarioId: uid, resolvido: false }, take: Math.min(args.limite || 5, 20), orderBy: { createdAt: 'desc' }, select: { id: true, mlItemId: true, titulo: true, tipoAviso: true, mensagem: true, severidade: true } }).catch(() => []);
        return avisos.length ? { avisos, total: avisos.length } : { mensagem: 'Nenhum aviso ativo.' };
      }
      case 'consultarStatusConexaoML': {
        const token = await prisma.mlToken.findUnique({ where: { usuarioId: uid }, select: { nickname: true, expiresAt: true, mlUserId: true } });
        if (!token) return { conectado: false, mensagem: 'Conta ML não conectada.' };
        return { conectado: new Date() < new Date(token.expiresAt), nickname: token.nickname, status: new Date() < new Date(token.expiresAt) ? 'Conectado e válido' : 'Token expirado' };
      }
      case 'listarHistoricoPrecos': {
        const where = { usuarioId: uid };
        if (args.mlItemId) where.mlItemId = args.mlItemId;
        const h = await prisma.precificacaoHistorico.findMany({ where, take: Math.min(args.limite || 5, 20), orderBy: { criadoEm: 'desc' }, select: { mlItemId: true, titulo: true, preco: true, quantidade: true, criadoEm: true } }).catch(() => []);
        return h.length ? { historico: h, total: h.length } : { mensagem: 'Nenhum histórico.' };
      }
      case 'resumoGeral': {
        const [totalProd, pend, reinc, corr, ign, penEnvio, avisos, ag, token] = await Promise.all([
          prisma.produto.count({ where: { usuarioId: uid } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
          prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE_ENVIO' } }),
          prisma.avisoML.count({ where: { usuarioId: uid, resolvido: false } }).catch(() => 0),
          prisma.agendadorConfig.findUnique({ where: { usuarioId: uid } }),
          prisma.mlToken.findUnique({ where: { usuarioId: uid }, select: { nickname: true, expiresAt: true } }),
        ]);
        return {
          produtos:     { total: totalProd },
          divergencias: { pendente: pend, reincidente: reinc, corrigido: corr, ignorado: ign, pendenteEnvio: penEnvio, totalAtivas: pend + reinc },
          avisosML:     avisos,
          agendador:    ag ? { ativo: ag.ativo, intervalo: ag.intervalo } : { ativo: false },
          conexaoML:    token ? { nickname: token.nickname, valida: new Date() < new Date(token.expiresAt) } : { conectado: false },
        };
      }
      case 'listarPaginasDisponiveis': {
        const caps    = ROLE_CAPABILITIES[userRole] || ROLE_CAPABILITIES['USUARIO'];
        const paginas = (caps.paginasAcesso || []).map(p => ({ caminho: p, ...PAGE_CATALOG[p] }));
        return { paginas, totalAcesso: paginas.length };
      }
      case 'lerPagina': {
        let url = args.caminho || '/';
        if (!url.startsWith('http')) url = `${(pageBaseUrl || 'http://localhost:5173').replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
        const content = await fetchPageContent(url);
        return content ? { url, conteudo: content, resumo: `${content.length} chars extraídos.` } : { erro: `Não foi possível acessar: ${url}` };
      }
      case 'listarUsuariosPendentes': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const p = await prisma.usuario.findMany({ where: { solicitouDesbloqueio: true, role: 'BLOQUEADO' }, select: { id: true, nome: true, email: true, createdAt: true } });
        return p.length ? { usuariosPendentes: p, total: p.length } : { mensagem: 'Nenhum usuário aguardando.' };
      }
      case 'aprovarUsuario': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where: { id: parseInt(args.usuarioId) } });
        if (!u) return { erro: 'Usuário não encontrado.' };
        await prisma.usuario.update({ where: { id: u.id }, data: { role: 'USUARIO', solicitouDesbloqueio: false } });
        return { sucesso: true, mensagem: `${u.nome} aprovado.` };
      }
      case 'bloquearUsuario': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const u = await prisma.usuario.findUnique({ where: { id: parseInt(args.usuarioId) } });
        if (!u) return { erro: 'Usuário não encontrado.' };
        if (u.role === 'OWNER') return { erro: 'Não é possível bloquear um OWNER.' };
        await prisma.usuario.update({ where: { id: u.id }, data: { role: 'BLOQUEADO' } });
        return { sucesso: true, mensagem: `${u.nome} bloqueado.` };
      }
      case 'resumoGlobalPlataforma': {
        if (!isPriv) return { erro: 'Sem permissão.' };
        const [tu, tp, td, to] = await Promise.all([
          prisma.usuario.count(),
          prisma.produto.count(),
          prisma.divergencia.count({ where: { status: { in: ['PENDENTE', 'REINCIDENTE'] } } }),
          prisma.sessaoUsuario.count({ where: { ativo: true, entradaEm: { gte: new Date(Date.now() - 30 * 60 * 1000) } } }).catch(() => 0),
        ]);
        return { totalUsuarios: tu, totalProdutos: tp, divergenciasAtivas: td, usuariosOnline: to };
      }
      default: return { erro: `Função "${name}" não implementada.` };
    }
  } catch (e) { return { erro: `Erro em ${name}: ${e.message}` }; }
}

// ─── System Instruction ────────────────────────────────────────────────────────
function buildSystemInstruction(ctx) {
  const {
    totalProdutos  = 0,
    totalDivergencias = 0,
    userRole       = 'USUARIO',
    usuarioAtual   = null,
    dataBlock      = null,
    fileContexts   = [],
    pageBaseUrl    = null,
  } = ctx;

  const fileBlock = fileContexts.length > 0
    ? `\n=== ARQUIVOS LIDOS NESTA MENSAGEM ===\n${fileContexts.map(f => `[${f.name}]:\n${(f.context || '').substring(0, 8000)}`).join('\n\n')}\n`
    : '';

  const sessionBlock = `=== CONTEXTO DA SESSÃO ATUAL ===
Usuário: ${usuarioAtual?.nome || 'Desconhecido'} | Role: ${userRole}
Dados: ${dataBlock || `Produtos: ${totalProdutos} | Divergências ativas: ${totalDivergencias}`}
${fileBlock}=== FIM DO CONTEXTO ===`;

  const parts = [];
  if (SKILL_CONTENT) parts.push(SKILL_CONTENT);
  parts.push(CHAIN_OF_THOUGHT_PROMPT);
  parts.push(sessionBlock);
  return parts.join('\n\n');
}

// ─── Modo Autônomo Local ──────────────────────────────────────────────────────
async function generateLocalStreamingResponse(message, onStep) {
  const best       = await queryKnowledge(message, 3);
  const content    = best.length > 0 ? best.map(m => m.content).join(' ') : 'Não encontrei dados locais suficientes.';
  const confidence = best.length > 0 ? Math.round(best[0].confidence * 100) : 10;

  const reasoning = buildChainOfThoughtText(message, [], { userRole: 'USUARIO', usuarioAtual: { nome: 'Usuário' } }, false)
    + `\n\n**Modo Autônomo Ativo**\n\nAPI Gemini desativada. Acessando banco vetorial local. Encontrei ${best.length} resultado(s) com ${confidence}% de confiança.`;

  await emitReasoningStreamed(onStep, reasoning);

  return {
    reply:           `<b>[Analyiz — Modo Autônomo]</b><br><br>${content}<br><br><i>Confiança local: ${confidence}%</i>`,
    sources:         [],
    reasoning,
    toolsExecutadas: [],
  };
}

// ─── Aprendizado de livros ─────────────────────────────────────────────────────
async function processarLivroEAprender(fileContexts, onStep) {
  const reasoning = `**Processando Comando de Aprendizagem**\n\nDetectei o comando de ingestão profunda. Iniciando fragmentação do conteúdo dos ${fileContexts.length} arquivo(s) em blocos de 2000 caracteres cada um, que serão indexados no banco vetorial PostgreSQL para uso futuro no Modo Autônomo.`;
  await emitReasoningStreamed(onStep, reasoning);

  let total = 0;
  for (const file of fileContexts) {
    if (!file.context) continue;
    for (let i = 0; i < file.context.length; i += 2000) {
      await saveKnowledge(`livro_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_p${Math.floor(i / 2000)}`, file.context.substring(i, i + 2000), 'upload_owner', 0.95);
      total++;
      if (onStep) await emitStep(onStep, `Memorizando bloco ${Math.floor(i / 2000) + 1} de "${file.name}"…`, null, 150);
    }
  }

  return {
    reply:           `<b>🧠 Aprendizagem concluída!</b><br><br>• Fragmentos absorvidos: <b>${total}</b><br>• Disponível no Modo Autônomo.`,
    sources:         [],
    reasoning,
    toolsExecutadas: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN — buildAnswerStream
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildAnswerStream(message, history = [], context = {}, onStep, attempt = 1) {
  const userId = context.usuarioAtual?.id || 0;
  const user   = await prisma.usuario.findUnique({
    where:  { id: parseInt(userId) },
    select: { geminiAtivo: true, role: true },
  });
  const geminiAtivo = user?.geminiAtivo ?? true;
  const isOwner     = user?.role === 'OWNER';

  // Toggle Gemini (OWNER only)
  if (isOwner && message) {
    const ml = message.toLowerCase();
    if (ml.match(/desativar(\s+o|\s+a)?\s+gemini/)) {
      await prisma.usuario.update({ where: { id: parseInt(userId) }, data: { geminiAtivo: false } });
      return { reply: '<b>Gemini desativado.</b><br>Operando no Modo Autônomo Local.', sources: [], reasoning: '', toolsExecutadas: [] };
    }
    if (ml.match(/ativar(\s+o|\s+a)?\s+gemini/)) {
      await prisma.usuario.update({ where: { id: parseInt(userId) }, data: { geminiAtivo: true } });
      return { reply: '<b>Gemini reativado.</b><br>Capacidade total restaurada.', sources: [], reasoning: '', toolsExecutadas: [] };
    }
  }

  if (!geminiAtivo) return generateLocalStreamingResponse(message, onStep);

  const model = attempt > 1 ? GEMINI_MODEL_FALLBACK : GEMINI_MODEL;

  try {
    const ai            = getClient();
    const pageBaseUrl   = context.pageBaseUrl || 'http://localhost:5173';
    const incomingFiles = (context.files || []).slice(0, MAX_FILES);
    const fileContexts  = [];
    let globalStepKey   = 0;

    if (context.imageContext) {
      fileContexts.push({
        label:   'imagem',
        name:    context.imageName || 'imagem enviada',
        group:   'image',
        context: context.imageContext,
      });
    }

    if (incomingFiles.length > 0) {
      if (incomingFiles.length > 1 && onStep) {
        await emitStep(onStep, `Processando ${incomingFiles.length} arquivos…`, null, 300);
        await emitDone(onStep, globalStepKey++, 400);
      }
      for (const file of incomingFiles) {
        const r = await processFileToContext(
          file, message,
          evt => { if (evt.type === 'step' && onStep) onStep(evt); },
          globalStepKey, context.sessionId
        );
        globalStepKey += r.stepsUsed || 0;
        if (r.context) fileContexts.push(r);
      }
    }

    // Comando "leia isso e aprenda" (OWNER)
    if (isOwner && message?.toLowerCase().match(/leia (isto|isso|esse) e aprenda/) && fileContexts.length > 0) {
      return processarLivroEAprender(fileContexts, onStep);
    }

    // Gera e emite o Chain of Thought
    const hasFiles      = fileContexts.length > 0;
    const reasoningText = buildChainOfThoughtText(message, fileContexts, context, hasFiles);
    await emitReasoningStreamed(onStep, reasoningText);

    // Prompt com arquivos injetados
    let injectPrompt = message || '[arquivo enviado sem texto]';
    if (fileContexts.length > 0) {
      injectPrompt += `\n\n[ARQUIVOS LIDOS]:\n${fileContexts.map(f => `[${f.name}]:\n${(f.context || '').substring(0, 6000)}`).join('\n\n')}`;
    }

    const config = {
      systemInstruction: buildSystemInstruction({ ...context, fileContexts, pageBaseUrl }),
      temperature:       0.25,
      maxOutputTokens:   2000,
    };
    config.tools = needsWebSearch(message) ? [{ googleSearch: {} }] : buildTools(context.userRole);

    const geminiHistory = buildGeminiHistory(history);
    let contents = [...geminiHistory, { role: 'user', parts: [{ text: injectPrompt }] }];
    let response = await ai.models.generateContent({ model, config, contents });

    // Function Calling loop
    const toolsExecutadas = [];
    let callCount = 0;
    while (response.functionCalls?.length > 0 && callCount < 5) {
      callCount++;
      const call    = response.functionCalls[0];
      const toolKey = globalStepKey++;
      toolsExecutadas.push(call.name);

      await emitStep(onStep, `Consultando sistema: ${call.name}…`, call.name, 300);
      contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] });

      const apiResult = await executeTool(call.name, call.args, userId, context.userRole, pageBaseUrl);
      const ok        = !apiResult?.erro;
      await emitDone(onStep, toolKey, 200);
      if (onStep) onStep({ type: 'tool_result', tool: call.name, ok, msg: ok ? 'Concluído' : `Erro: ${apiResult?.erro}` });

      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: apiResult } }] });
      response = await ai.models.generateContent({ model, config, contents });
    }

    const raw = response.text?.trim();
    if (!raw) return { reply: '⚠️ Resposta vazia. Tente novamente.', sources: [], reasoning: reasoningText, toolsExecutadas };

    // FIX: passa a mensagem do usuário para nomear arquivos corretamente
    await extractCodeBlocksAndSave(context.sessionId, raw, message || '');

    const reply  = cleanMetaText(ensureHTML(raw));
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .filter(c => c.web?.uri)
      .map(c => ({ label: c.web.title || c.web.uri, url: c.web.uri }))
      .slice(0, 3);

    return { reply, sources, reasoning: reasoningText, toolsExecutadas };

  } catch (error) {
    if ((error?.status === 429 || String(error).includes('429')) && attempt === 1)
      return buildAnswerStream(message, history, context, onStep, 2);
    console.error('[buildAnswerStream]', error.message);
    return { reply: '⚠️ Erro no processamento. Tente novamente.', sources: [], reasoning: null, toolsExecutadas: [] };
  }
}

export const sendChatMessage = buildAnswerStream;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureHTML(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n<]+)\*/g, '<b>$1</b>')
    .replace(/(```[\s\S]*?```)/g, m => m.replace(/\n/g, '___LB___'))
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/___LB___/g, '\n')
    .trim();
}

function cleanMetaText(t) {
  return t
    .replace(/^(Claro[,!]\s*)/i, '')
    .replace(/^(Com certeza[,!]\s*)/i, '')
    .replace(/^(Ótima pergunta[,!]\s*)/i, '')
    .trim();
}

export async function buildAnswer(message, history = [], context = {}) {
  return buildAnswerStream(message, history, context, null);
}

export function buildResumoPrompt(dadosStr) {
  return `Faça um resumo executivo em HTML (<b>, <br>) dos seguintes dados:\n\n${dadosStr}`;
}

export function hashContexto(obj) {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex').substring(0, 12);
}