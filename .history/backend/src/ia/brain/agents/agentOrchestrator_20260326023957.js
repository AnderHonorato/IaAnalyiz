// Caminho correto: src/ia/agents/agentOrchestrator.js
// (iaService.js importa de './ia/agents/agentOrchestrator.js')

import { GoogleGenAI } from '@google/genai';
import { agentePesquisaProfunda } from './searchAgent.js';
import { agenteValidador }        from './validationAgent.js';
import { agenteImagem }           from './imageAgent.js';
import { agenteVideo }            from './videoAgent.js';
import { agenteAudio }            from './audioAgent.js';
import { agenteProgramador }      from './programmerAgent.js';

export async function runOrchestrator(mensagem, historyRaw, contextoSistema, onEvent, buildAnswerFn) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    onEvent({ type: 'reasoning_chunk', text: '🧠 Analisando a intenção da sua mensagem...\n' });

    let agenteEscolhido = 'nenhum';
    try {
        const promptIntent = `Você é o Analisador de Intenções.
Mensagem: "${mensagem}"
AGENTES:
- "pesquisa": buscar na web, preços, concorrentes.
- "programador": criar código, scripts, html.
- "imagem": gerar, criar imagem/arte.
- "video": baixar, criar video mp4.
- "audio": baixar musica, audio mp3.
- "nenhum": conversa normal.
Retorne JSON PURO: {"agente": "nome", "motivo": "explicacao"}`;

        const resIntent = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptIntent,
            config: { responseMimeType: "application/json", temperature: 0 }
        });
        const intentData = JSON.parse(resIntent.text);
        agenteEscolhido = intentData.agente;
        onEvent({ type: 'reasoning_chunk', text: `🎯 Intenção detectada: Direcionando para o Agente '${agenteEscolhido}' (${intentData.motivo}).\n\n` });
    } catch (e) {
        // Fallback rápido por palavras-chave
        if (/imagem|arte|desenhe/i.test(mensagem))           agenteEscolhido = 'imagem';
        else if (/vídeo|video|mp4/i.test(mensagem))          agenteEscolhido = 'video';
        else if (/música|musica|áudio|audio|mp3/i.test(mensagem)) agenteEscolhido = 'audio';
        else if (/código|script|html/i.test(mensagem))       agenteEscolhido = 'programador';
        else if (/pesquisar|internet|web/i.test(mensagem))   agenteEscolhido = 'pesquisa';
    }

    let dadosAgente      = "";
    let fontesEncontradas = [];

    const handleLog = (msg, tipo) => {
        onEvent({ type: 'agent_log', msg, tipo });
        onEvent({ type: 'reasoning_chunk', text: `[${tipo === 'error' ? '❌' : '🤖'}] ${msg}\n` });
    };

    // ── Roteamento para os agentes ──────────────────────────────────────────
    if (agenteEscolhido === 'pesquisa') {
        onEvent({ type: 'agent_start', agente: 'pesquisa' });
        const res = await agentePesquisaProfunda(mensagem, contextoSistema?.dataBlock || "", handleLog);
        if (res.sucesso) { dadosAgente = res.dadosEncontrados; fontesEncontradas = res.fontes || []; }
        onEvent({ type: 'agent_end', agente: 'pesquisa' });

    } else if (agenteEscolhido === 'imagem') {
        onEvent({ type: 'agent_start', agente: 'imagem' });
        const res = await agenteImagem(mensagem, handleLog);
        if (res.sucesso) dadosAgente = res.dadosEncontrados;
        onEvent({ type: 'agent_end', agente: 'imagem' });

    } else if (agenteEscolhido === 'video') {
        onEvent({ type: 'agent_start', agente: 'video' });
        const res = await agenteVideo(mensagem, handleLog);
        if (res.sucesso) dadosAgente = res.dadosEncontrados;
        onEvent({ type: 'agent_end', agente: 'video' });

    } else if (agenteEscolhido === 'audio') {
        onEvent({ type: 'agent_start', agente: 'audio' });
        const res = await agenteAudio(mensagem, handleLog);
        if (res.sucesso) dadosAgente = res.dadosEncontrados;
        onEvent({ type: 'agent_end', agente: 'audio' });

    } else if (agenteEscolhido === 'programador') {
        onEvent({ type: 'agent_start', agente: 'programador' });
        const res = await agenteProgramador(mensagem, handleLog);
        if (res.sucesso) dadosAgente = res.dadosEncontrados;
        onEvent({ type: 'agent_end', agente: 'programador' });
    }

    // ── IA Mãe sintetiza e responde ─────────────────────────────────────────
    onEvent({ type: 'reasoning_chunk', text: '\n🧠 Finalizando processo e entregando ao usuário...\n' });
    const ctxEnriquecido = [
        contextoSistema?.dataBlock || "",
        dadosAgente ? `\n=== DADOS GERADOS PELO AGENTE (${agenteEscolhido}) ===\n${dadosAgente}` : ''
    ].filter(Boolean).join('\n');

    const { reply, sources, toolsExecutadas } = await buildAnswerFn(mensagem, historyRaw, {
        ...contextoSistema,
        dataBlock: ctxEnriquecido
    });

    let respostaFinal = reply;
    if (['nenhum', 'pesquisa'].includes(agenteEscolhido) && reply.length > 150) {
        onEvent({ type: 'agent_start', agente: 'validacao' });
        onEvent({ type: 'reasoning_chunk', text: '⚖️ Verificando a precisão final da resposta...\n' });
        const val = await agenteValidador(reply, ctxEnriquecido);
        if (!val.aprovada && val.correcao) {
            handleLog(`Correção aplicada: ${val.motivo}`, 'warn');
            respostaFinal = val.correcao;
        }
        onEvent({ type: 'agent_end', agente: 'validacao' });
    }

    return { reply: respostaFinal, sources, fontes: fontesEncontradas, reasoning: "", toolsExecutadas };
}