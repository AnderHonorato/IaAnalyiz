// backend/src/ia/agents/agentOrchestrator.js
import { GoogleGenAI } from '@google/genai';

// Importa os agentes específicos
import { agentePesquisaProfunda } from './searchAgent.js';
import { agenteValidador } from './validationAgent.js';
import { agenteProgramador } from './programmerAgent.js';
import { agenteImagem } from './imageAgent.js';
import { agenteVideo } from './videoAgent.js';
import { agenteAudio } from './audioAgent.js';

export async function runOrchestrator(mensagem, historyRaw, contextoSistema, onEvent, buildAnswerFn) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Inicia o pensamento na interface
    onEvent({ type: 'reasoning_chunk', text: '🧠 Analisando a intenção da sua mensagem...\n' });
    
    // ── 1. AGENTE ANALISADOR DE INTENÇÕES (ROTEADOR) ──
    let agenteEscolhido = 'nenhum';
    try {
        const promptIntent = `Você é o Analisador de Intenções da IA Analyiz.
Avalie a mensagem do usuário e decida se precisamos acionar algum agente especialista.
Mensagem: "${mensagem}"

AGENTES DISPONÍVEIS:
- "pesquisa": Se o usuário pedir explícitamente para pesquisar na web, buscar preços, concorrentes.
- "programador": Se pedir para criar código, scripts, componentes, corrigir bugs.
- "imagem": Se pedir para gerar ou criar uma imagem/arte.
- "video": Se pedir para baixar ou criar um vídeo.
- "audio": Se pedir para baixar ou processar áudios/músicas.
- "nenhum": Se for uma conversa normal ou análise interna de dados.

Retorne APENAS UM JSON válido: {"agente": "nome_do_agente", "motivo": "breve explicacao"}`;
        
        const resIntent = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptIntent,
            config: { responseMimeType: "application/json", temperature: 0 }
        });
        
        const intentData = JSON.parse(resIntent.text);
        agenteEscolhido = intentData.agente;
        onEvent({ type: 'reasoning_chunk', text: `🎯 Intenção detectada: Roteando para o agente '${agenteEscolhido}' (${intentData.motivo}).\n\n` });
    } catch (e) {
        if (/pesquisar|web|internet/i.test(mensagem)) agenteEscolhido = 'pesquisa';
        if (/código|script|função/i.test(mensagem)) agenteEscolhido = 'programador';
    }

    let dadosWeb = "";
    let fontesEncontradas = [];

    // ── 2. EXECUÇÃO DO AGENTE ESPECÍFICO ──
    if (agenteEscolhido === 'pesquisa') {
        onEvent({ type: 'agent_start', agente: 'pesquisa' });
        onEvent({ type: 'reasoning_chunk', text: '🌐 Agente de Pesquisa iniciado. Buscando dados...\n' });
        
        const result = await agentePesquisaProfunda(mensagem, contextoSistema?.dataBlock || "", (msg, tipo) => {
            onEvent({ type: 'agent_log', msg, tipo });
        });

        if (result.sucesso) {
            dadosWeb = result.dadosEncontrados;
            fontesEncontradas = result.fontes || [];
            if (fontesEncontradas.length > 0) onEvent({ type: 'fontes', fontes: fontesEncontradas });
        }
        onEvent({ type: 'agent_end', agente: 'pesquisa' });
    } 
    else if (agenteEscolhido === 'programador') {
        onEvent({ type: 'agent_start', agente: 'programador' });
        onEvent({ type: 'reasoning_chunk', text: '💻 Agente Programador ativado. Estruturando lógica...\n' });
        
        const result = await agenteProgramador(mensagem, contextoSistema?.dataBlock || "", (msg, tipo) => {
            onEvent({ type: 'agent_log', msg, tipo });
        });
        dadosWeb = result.dadosEncontrados; // Aproveitamos a variável para injetar o código no prompt principal
        onEvent({ type: 'agent_end', agente: 'programador' });
    }
    else if (agenteEscolhido === 'imagem') {
        onEvent({ type: 'agent_start', agente: 'imagem' });
        const result = await agenteImagem(mensagem, (msg, tipo) => onEvent({ type: 'agent_log', msg, tipo }));
        dadosWeb = result.dadosEncontrados; 
        onEvent({ type: 'agent_end', agente: 'imagem' });
    }
    else if (agenteEscolhido === 'video') {
        onEvent({ type: 'agent_start', agente: 'video' });
        const result = await agenteVideo(mensagem, (msg, tipo) => onEvent({ type: 'agent_log', msg, tipo }));
        dadosWeb = result.dadosEncontrados; 
        onEvent({ type: 'agent_end', agente: 'video' });
    }
    else if (agenteEscolhido === 'audio') {
        onEvent({ type: 'agent_start', agente: 'audio' });
        const result = await agenteAudio(mensagem, (msg, tipo) => onEvent({ type: 'agent_log', msg, tipo }));
        dadosWeb = result.dadosEncontrados; 
        onEvent({ type: 'agent_end', agente: 'audio' });
    }

    // ── 3. GERAÇÃO DA RESPOSTA FINAL (IA MÃE) ──
    onEvent({ type: 'reasoning_chunk', text: '🧠 Sintetizando a resposta final...\n' });
    
    const dataBlockEnriquecido = [
        contextoSistema?.dataBlock || "",
        dadosWeb ? `\n=== DADOS / RETORNO DO AGENTE ===\n${dadosWeb}` : ''
    ].filter(Boolean).join('\n');

    // Executa a função principal de resposta
    const { reply, sources } = await buildAnswerFn(mensagem, historyRaw, {
        ...contextoSistema,
        dataBlock: dataBlockEnriquecido
    });

    // ── 4. AGENTE VALIDADOR ──
    if (agenteEscolhido !== 'programador') { // Exemplo: não valida código estruturado
        onEvent({ type: 'agent_start', agente: 'validacao' });
        const valResult = await agenteValidador(reply, dataBlockEnriquecido);
        
        let respostaFinal = reply;
        if (!valResult.aprovada && valResult.correcao) {
            onEvent({ type: 'agent_log', msg: `Correção aplicada: ${valResult.motivo}`, tipo: 'warn' });
            respostaFinal = valResult.correcao;
        } else {
            onEvent({ type: 'agent_log', msg: 'Resposta aprovada.', tipo: 'success' });
        }
        onEvent({ type: 'agent_end', agente: 'validacao' });
        return { reply: respostaFinal, sources, fontes: fontesEncontradas, reasoning: "" };
    }

    return { reply, sources, fontes: fontesEncontradas, reasoning: "" };
}