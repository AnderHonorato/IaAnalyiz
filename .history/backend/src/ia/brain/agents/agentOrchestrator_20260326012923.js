// backend/src/ia/agents/agentOrchestrator.js
import { GoogleGenAI } from '@google/genai';
import { agentePesquisaProfunda } from './searchAgent.js';
import { agenteValidador } from './validationAgent.js';

export async function runOrchestrator(mensagem, historyRaw, contextoSistema, onEvent, buildAnswerFn) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Inicia o pensamento na interface
    onEvent({ type: 'reasoning_chunk', text: '🧠 Analisando a intenção da sua mensagem...\n' });
    
    // ── 1. AGENTE ANALISADOR DE INTENÇÕES ──
    let agenteEscolhido = 'nenhum';
    try {
        const promptIntent = `Você é o Analisador de Intenções da IA Analyiz.
Avalie a mensagem do usuário e decida se precisamos acionar algum agente especialista.
Mensagem: "${mensagem}"

AGENTES DISPONÍVEIS:
- "pesquisa": Se o usuário pedir explicitamente para pesquisar na web, buscar preços atuais, mercado, produtos (ex: "pesquisar notebook", "preço mediano", "busca na internet").
- "nenhum": Se for uma conversa normal, ou se a resposta puder ser dada com o conhecimento base.

Retorne APENAS UM JSON válido: {"agente": "pesquisa" | "nenhum", "motivo": "breve explicacao"}`;
        
        const resIntent = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptIntent,
            config: { responseMimeType: "application/json", temperature: 0 }
        });
        
        const intentData = JSON.parse(resIntent.text);
        agenteEscolhido = intentData.agente;
        onEvent({ type: 'reasoning_chunk', text: `🎯 Intenção detectada: Acionar agente '${agenteEscolhido}' (${intentData.motivo}).\n\n` });
    } catch (e) {
        // Fallback caso a IA do roteador falhe
        if (/pesquisar|web|internet|preço mediano|notebook/i.test(mensagem)) agenteEscolhido = 'pesquisa';
    }

    let dadosWeb = "";
    let fontesEncontradas = [];

    // ── 2. EXECUÇÃO DO AGENTE DE PESQUISA ──
    if (agenteEscolhido === 'pesquisa') {
        // AQUI ESTÁ O SEGREDO: Emitir agent_start para a UI mostrar o ícone na hora!
        onEvent({ type: 'agent_start', agente: 'pesquisa' });
        onEvent({ type: 'reasoning_chunk', text: '🌐 Agente de Pesquisa iniciado. Buscando dados atualizados na internet...\n' });
        
        const result = await agentePesquisaProfunda(mensagem, contextoSistema?.dataBlock || "", (msg, tipo) => {
            onEvent({ type: 'agent_log', msg, tipo });
        });

        if (result.sucesso) {
            dadosWeb = result.dadosEncontrados;
            fontesEncontradas = result.fontes || [];
            if (fontesEncontradas.length > 0) {
                onEvent({ type: 'fontes', fontes: fontesEncontradas });
            }
        }
        
        // Desliga o ícone do agente de pesquisa
        onEvent({ type: 'agent_end', agente: 'pesquisa' });
        onEvent({ type: 'reasoning_chunk', text: '✅ Pesquisa concluída. Integrando os dados encontrados ao meu contexto...\n\n' });
    }

    // ── 3. GERAÇÃO DA RESPOSTA FINAL (IA MÃE) ──
    onEvent({ type: 'reasoning_chunk', text: '🧠 Formulando a resposta final...\n' });
    
    const dataBlockEnriquecido = [
        contextoSistema?.dataBlock || "",
        dadosWeb ? `\n=== DADOS DA PESQUISA WEB ===\n${dadosWeb}` : ''
    ].filter(Boolean).join('\n');

    // Executa a função principal de resposta (enviada pelo iaService)
    const { reply, sources } = await buildAnswerFn(mensagem, historyRaw, {
        ...contextoSistema,
        dataBlock: dataBlockEnriquecido
    });

    // ── 4. AGENTE VALIDADOR ──
    onEvent({ type: 'agent_start', agente: 'validacao' });
    onEvent({ type: 'reasoning_chunk', text: '⚖️ Agente Validador verificando a precisão da resposta...\n' });
    
    let respostaFinal = reply;
    // Assume que a função agenteValidador retorna { aprovada, correcao, motivo }
    const valResult = await agenteValidador(reply, dataBlockEnriquecido);
    
    if (!valResult.aprovada && valResult.correcao) {
        onEvent({ type: 'agent_log', msg: `Correção aplicada: ${valResult.motivo}`, tipo: 'warn' });
        onEvent({ type: 'reasoning_chunk', text: `⚠️ Correção aplicada pelo Validador: ${valResult.motivo}\n` });
        respostaFinal = valResult.correcao;
    } else {
        onEvent({ type: 'agent_log', msg: 'Resposta aprovada. Confiança alta.', tipo: 'success' });
        onEvent({ type: 'reasoning_chunk', text: '✅ Resposta validada com sucesso. Entregando ao usuário.\n' });
    }
    
    // Desliga ícone do validador
    onEvent({ type: 'agent_end', agente: 'validacao' });

    // Retorna a resposta limpa para o Chat
    return { reply: respostaFinal, sources, fontes: fontesEncontradas, reasoning: "" };
}