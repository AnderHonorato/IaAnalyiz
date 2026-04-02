// backend/src/ia/agents/validationAgent.js 
//  - Adicionado callback `onLog` para emitir eventos SSE narrativos em tempo real
//  - Logs narrativos em primeira pessoa descrevendo o processo de validação
//  - Forçado responseMimeType: "application/json" para saída estruturada confiável
//  - Fallback robusto caso parse falhe
//  - FIX v2: Prompt blindado para forçar a devolução do HTML INTEGRAL em caso de correção, proibindo modo "revisor/comentarista".

import { GoogleGenAI } from '@google/genai';

// ─── Logger ───────────────────────────────────────────────────────────────────
function logAgent(msg, type = 'info') {
  const t   = new Date().toLocaleTimeString('pt-BR');
  const level = { info: 'INFO', success: 'OK', warn: 'WARN', error: 'ERROR' }[type] || 'INFO';
  console.log(`[validationAgent.js] [${t}] [${level}] ${msg}`);
}

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada no .env');
  return new GoogleGenAI({ apiKey: key });
}

function extrairJSON(texto) {
  if (!texto) throw new Error('Resposta vazia do validador');
  const s = texto.indexOf('{'), e = texto.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('JSON não encontrado na resposta');
  let json = texto.slice(s, e + 1).replace(/,\s*([\}\]])/g, '$1');
  return JSON.parse(json);
}

/**
 * Agente Validador de Qualidade
 * Analisa a resposta proposta antes de ser enviada ao usuário.
 *
 * @param {string}   perguntaOriginal  - Pergunta feita pelo usuário
 * @param {string}   respostaProposta  - Resposta gerada pela IA principal
 * @param {string}   dadosPesquisaWeb  - Resultado do agente de pesquisa (se houve)
 * @param {string}   contextoInterno   - Dados do banco / contexto do sistema
 * @param {Function} onLog             - Callback(msg: string, tipo: string) para emitir SSE
 */
export async function agenteValidador(
  perguntaOriginal,
  respostaProposta,
  dadosPesquisaWeb = '',
  contextoInterno  = '',
  onLog            = null
) {
  const emit = (msg, tipo = 'info') => {
    logAgent(msg, tipo);
    if (onLog) onLog(msg, tipo);
  };

  emit('IA Analyiz retomou o controle. Analisando os dados recebidos...', 'info');
  emit('Verificando a precisão factual e coerência da resposta...', 'info');

  // Respostas muito curtas não precisam de validação pesada
  // Mantemos o texto puro APENAS para a checagem de tamanho (performance)
  const textoPuro = respostaProposta.replace(/<[^>]+>/g, '').trim();
  if (textoPuro.length < 30) {
    emit('Resposta simples — validação expressa aprovada.', 'success');
    emit('Tudo certo. Formatando a resposta final para o usuário...', 'success');
    return {
      aprovada:      true,
      motivo:        'Resposta curta — sem risco factual.',
      respostaFinal: respostaProposta,
    };
  }

  try {
    const ai    = getClient();
    const model = 'gemini-2.5-flash';

    // FIX: Prompt blindado. Regras estritas para impedir que a IA apenas comente os erros.
    // Ela agora é obrigada a agir como um compilador/editor silencioso.
    const prompt = `
Você é o Agente Validador de Qualidade e Fatos da IA Analyiz.
Sua única função é atuar como um filtro invisível no backend, corrigindo dados antes de chegarem ao frontend.

[ORDEM RESTRITA MÁXIMA - RISCO DE QUEBRA DE SISTEMA]:
Se você encontrar erros de cálculo, alucinações ou inconsistências na "RESPOSTA PROPOSTA", você NÃO DEVE explicar o erro. Você NÃO DEVE agir como um revisor fazendo comentários (ex: "O preço médio está errado").
Você DEVE agir como um editor silencioso: pegue o código HTML original, conserte os números e textos errados internamente, e devolva TODO O RELATÓRIO HTML COMPLETO, do início ao fim, na chave "respostaCorrigida".
O frontend espera receber código HTML puro e renderizável. Nunca entregue trechos parciais ou notas textuais.

PERGUNTA DO USUÁRIO: "${(perguntaOriginal || '').substring(0, 1000)}"
DADOS REAIS DA PESQUISA WEB (Fonte da Verdade): "${(dadosPesquisaWeb || '').substring(0, 3000)}"
CONTEXTO DO SISTEMA: "${(contextoInterno || '').substring(0, 3000)}"

RESPOSTA PROPOSTA (O código HTML que você deve analisar e, se necessário, consertar e devolver inteiro):
\`\`\`html
${respostaProposta}
\`\`\`

CRITÉRIOS DE ANÁLISE:
1. Os números (preços, médias, posições) batem EXATAMENTE com os "DADOS REAIS DA PESQUISA WEB"?
2. Há alucinações (nomes de vendedores inventados)?

Retorne APENAS um JSON válido seguindo ESTRITAMENTE esta estrutura:
{
  "aprovada": boolean,
  "nivelConfianca": number,
  "motivo": "string (Descreva o erro ou sucesso aqui, apenas para log interno do desenvolvedor)",
  "respostaCorrigida": "string (SE aprovada for false, coloque AQUI O CÓDIGO HTML COMPLETO E CORRIGIDO. Se aprovada for true, retorne null)"
}
    `.trim();

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature:      0.0, // Temperatura zero para forçar determinismo e obediência ao JSON
        responseMimeType: 'application/json',
      },
    });

    let resultado;
    try {
      resultado = JSON.parse(response.text);
    } catch {
      resultado = extrairJSON(response.text);
    }

    const aprovada  = resultado.aprovada !== false;
    const confianca = Math.round((resultado.nivelConfianca || 0.9) * 100);

    if (aprovada) {
      emit(`Verificação concluída — resposta aprovada. Confiança: ${confianca}%`, 'success');
    } else {
      emit(`Inconsistência detectada — aplicando correção invisível no HTML. Motivo: ${resultado.motivo}`, 'warn');
    }

    emit('Tudo certo. Formatando a resposta final para o usuário...', 'success');

    // Garante que, se a IA reprovou mas não mandou o HTML corrigido (falha na obediência), o sistema não quebre retornando vazio
    const respostaFinalSegura = (!aprovada && resultado.respostaCorrigida && resultado.respostaCorrigida.length > 50) 
      ? resultado.respostaCorrigida 
      : respostaProposta;

    return {
      aprovada,
      motivo:        resultado.motivo || '',
      respostaFinal: respostaFinalSegura,
    };

  } catch (error) {
    emit(`Validador encontrou um erro técnico — liberando resposta original.`, 'warn');
    logAgent(`Erro no validador: ${error.message}`, 'error');
    // Fallback seguro: libera a resposta original para não bloquear o usuário caso a API do Gemini falhe
    return {
      aprovada:      true,
      motivo:        `Erro no validador (fallback): ${error.message}`,
      respostaFinal: respostaProposta,
    };
  }
}