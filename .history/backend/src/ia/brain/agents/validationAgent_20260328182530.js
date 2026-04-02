// backend/src/ia/agents/validationAgent.js 
//  - Adicionado callback `onLog` para emitir eventos SSE narrativos em tempo real
//  - Logs narrativos em primeira pessoa descrevendo o processo de validação
//  - Forçado responseMimeType: "application/json" para saída estruturada confiável
//  - Fallback robusto caso parse falhe
//  - FIX: Hard Override para evitar comentários em texto e forçar retorno do HTML integral corrigido

import { GoogleGenAI } from '@google/genai';

// ─── Logger de terminal ───────────────────────────────────────────────────────
function logAgent(msg, type = 'info') {
  const t   = new Date().toLocaleTimeString('pt-BR');
  const ico = { info: '⚖️', success: '✅', warn: '⚠️', error: '❌' }[type] || '⚖️';
  console.log(`\x1b[35m[Agent-Validator]\x1b[0m [${t}] ${ico}  ${msg}`);
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

    // O prompt agora recebe o HTML original completo para poder consertá-lo e devolvê-lo!
    const prompt = `
Você é o Agente Validador de Qualidade e Fatos da IA Analyiz.
Sua única função é atuar como barreira de segurança antes da resposta chegar ao usuário.

[ORDEM RESTRITA]: Se você encontrar erros de cálculo, inconsistências ou alucinações no texto original, você NUNCA deve responder com notas explicativas ou comentários (ex: "Foi identificada uma inconsistência..."). 
O seu trabalho é agir de forma INVISÍVEL. Você DEVE reescrever e me devolver TODO O RELATÓRIO ORIGINAL EM HTML, aplicando as correções matemáticas diretamente dentro do texto e das tabelas. A sua saída "respostaCorrigida" deve conter APENAS o código HTML final e perfeito, pronto para ser exibido na tela, sem nenhum aviso adicional.

PERGUNTA DO USUÁRIO: "${(perguntaOriginal || '').substring(0, 1000)}"
DADOS DA PESQUISA WEB: "${(dadosPesquisaWeb || '').substring(0, 3000)}"
CONTEXTO DO SISTEMA: "${(contextoInterno || '').substring(0, 3000)}"

RESPOSTA PROPOSTA (EM HTML):
"${respostaProposta}"

CRITÉRIOS:
1. A resposta contém afirmações falsas ou alucinações em relação aos dados fornecidos?
2. Os números, nomes e fatos são coerentes com a pesquisa web e o contexto interno?
3. A resposta é útil e diretamente relacionada à pergunta?

Retorne APENAS este JSON (sem markdown, sem texto extra fora do JSON):
{
  "aprovada": true,
  "nivelConfianca": 0.95,
  "motivo": "Resposta coerente e factual.",
  "respostaCorrigida": null
}
Se "aprovada" for false, preencha obrigatoriamente "respostaCorrigida" com a VERSÃO COMPLETA E CORRIGIDA EM HTML DO RELATÓRIO.
    `.trim();

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature:      0.0,
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

    return {
      aprovada,
      motivo:        resultado.motivo || '',
      respostaFinal: aprovada
        ? respostaProposta
        : (resultado.respostaCorrigida || respostaProposta),
    };

  } catch (error) {
    emit(`Validador encontrou um erro técnico — liberando resposta original.`, 'warn');
    logAgent(`Erro no validador: ${error.message}`, 'error');
    // Fallback seguro: libera a resposta original para não bloquear o usuário
    return {
      aprovada:      true,
      motivo:        `Erro no validador (fallback): ${error.message}`,
      respostaFinal: respostaProposta,
    };
  }
}