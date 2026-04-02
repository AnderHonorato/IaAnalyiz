// backend/src/ia/agents/agentOrchestrator.js

import { GoogleGenAI } from '@google/genai';
import { agentePesquisaProfunda } from './searchAgent.js';
import { agenteValidador }        from './validationAgent.js';
import { agenteImagem }           from './imageAgent.js';
import { agenteVideo }            from './videoAgent.js';
import { agenteAudio }            from './audioAgent.js';
import { agenteProgramador }      from './programmerAgent.js';

export async function runOrchestrator(mensagem, historyRaw, contextoSistema, onEvent, buildAnswerFn) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    onEvent({ type: 'reasoning_chunk', text: '🧠 Analisando a intenção da sua mensagem para formar um enxame de especialistas...\n' });

    let agentesEscolhidos = [];
    try {
        const promptIntent = `Você é o Diretor de Agentes.
Mensagem: "${mensagem}"
AGENTES DISPONÍVEIS:
- "pesquisa": buscar na web, preços, concorrentes.
- "estrategista": analisar lucros, viabilidade, margens, markup.
- "seo": otimização de títulos, tags, descrições para Mercado Livre.
- "logistica": fretes, divergências de peso, embalagens.
- "programador": criar código, scripts, html, css.
- "imagem": gerar ou criar imagem/arte.
- "video": baixar ou criar video mp4.
- "audio": baixar musica, audio mp3.
- "copywriter": criar textos de vendas persuasivos e descrições para anúncios.
- "analista": analisar planilhas, CSVs, gráficos e métricas de vendas.
- "sac": formular respostas para perguntas ou reclamações de clientes no Mercado Livre.
- "revisor": revisar gramática, ortografia e tom de voz de textos.
- "concorrencia": monitorar e comparar especificamente lojas concorrentes.
- "padrao": conversa normal, sem ferramentas específicas.

Retorne APENAS um JSON PURO com um array de objetos, onde cada objeto tem o "agente" e o "motivo". Exemplo:
[{"agente": "pesquisa", "motivo": "buscar preços"}, {"agente": "estrategista", "motivo": "calcular lucro"}]
Se não precisar de especialistas, retorne [{"agente": "padrao", "motivo": "conversa direta"}]`;

        const resIntent = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptIntent,
            config: { responseMimeType: "application/json", temperature: 0 }
        });
        const intentData = JSON.parse(resIntent.text);
        agentesEscolhidos = Array.isArray(intentData) ? intentData : [intentData];
        
        const nomesAgentes = agentesEscolhidos.map(a => a.agente).join(', ');
        onEvent({ type: 'reasoning_chunk', text: `🎯 Enxame detectado: Direcionando para os agentes [${nomesAgentes}].\n\n` });
    } catch (e) {
        // Fallback rápido por palavras-chave se o JSON falhar
        agentesEscolhidos = [];
        if (/imagem|arte|desenhe/i.test(mensagem))           agentesEscolhidos.push({ agente: 'imagem', motivo: 'fallback' });
        else if (/vídeo|video|mp4/i.test(mensagem))          agentesEscolhidos.push({ agente: 'video', motivo: 'fallback' });
        else if (/música|musica|áudio|audio|mp3/i.test(mensagem)) agentesEscolhidos.push({ agente: 'audio', motivo: 'fallback' });
        else if (/código|script|html/i.test(mensagem))       agentesEscolhidos.push({ agente: 'programador', motivo: 'fallback' });
        else if (/pesquisar|internet|web/i.test(mensagem))   agentesEscolhidos.push({ agente: 'pesquisa', motivo: 'fallback' });
        else agentesEscolhidos.push({ agente: 'padrao', motivo: 'fallback' });
    }

    let dadosAcumulados = "";
    let fontesEncontradas = [];
    let toolsExecutadas = [];

    const handleLog = (msg, tipo) => {
        onEvent({ type: 'agent_log', msg, tipo });
        onEvent({ type: 'reasoning_chunk', text: `[${tipo === 'error' ? '❌' : '🤖'}] ${msg}\n` });
    };

    // ── Roteamento Sequencial para os Agentes do Enxame ───────────────────
    for (const item of agentesEscolhidos) {
        const agenteAtual = item.agente;
        if (agenteAtual === 'padrao') continue;
        
        onEvent({ type: 'agent_start', agente: agenteAtual });
        toolsExecutadas.push(agenteAtual);

        if (agenteAtual === 'pesquisa') {
            const res = await agentePesquisaProfunda(mensagem, contextoSistema?.dataBlock || "", handleLog);
            if (res.sucesso) { dadosAcumulados += `\n[PESQUISA]: ${res.dadosEncontrados}`; fontesEncontradas.push(...(res.fontes || [])); }
        } else if (agenteAtual === 'imagem') {
            const res = await agenteImagem(mensagem, handleLog);
            if (res.sucesso) dadosAcumulados += `\n[IMAGEM]: ${res.dadosEncontrados}`;
        } else if (agenteAtual === 'video') {
            const res = await agenteVideo(mensagem, handleLog);
            if (res.sucesso) dadosAcumulados += `\n[VÍDEO]: ${res.dadosEncontrados}`;
        } else if (agenteAtual === 'audio') {
            const res = await agenteAudio(mensagem, handleLog);
            if (res.sucesso) dadosAcumulados += `\n[ÁUDIO]: ${res.dadosEncontrados}`;
        } else if (agenteAtual === 'programador') {
            const res = await agenteProgramador(mensagem, handleLog);
            if (res.sucesso) dadosAcumulados += `\n[PROGRAMAÇÃO]: ${res.dadosEncontrados}`;
        } else if (agenteAtual === 'estrategista') {
            handleLog('A calcular viabilidade e margens de lucro...', 'info');
            dadosAcumulados += `\n[ESTRATEGISTA]: O utilizador quer maximizar o lucro. Considere os custos e sugira o markup ideal.`;
        } else if (agenteAtual === 'seo') {
            handleLog('A analisar palavras-chave e otimização de busca...', 'info');
            dadosAcumulados += `\n[SEO]: Estruture os títulos para ter alta conversão no Mercado Livre. Utilize gatilhos mentais.`;
        } else if (agenteAtual === 'logistica') {
            handleLog('A verificar impactos de peso cubado e frete...', 'info');
            dadosAcumulados += `\n[LOGISTICA]: Analise os dados considerando penalidades de frete do Mercado Envios. Sugira kits se necessário.`;
        } else if (agenteAtual === 'copywriter') {
            handleLog('A escrever texto de vendas persuasivo...', 'info');
            dadosAcumulados += `\n[COPYWRITER]: Aplique técnicas de copywriting (AIDA, PAS) na resposta para maximizar conversões. Escreva uma descrição atrativa.`;
        } else if (agenteAtual === 'analista') {
            handleLog('A processar métricas e analisar tabelas de dados...', 'info');
            dadosAcumulados += `\n[ANALISTA]: Extraia conclusões matemáticas e estatísticas precisas a partir dos ficheiros ou dados fornecidos.`;
        } else if (agenteAtual === 'sac') {
            handleLog('A formular resposta humanizada para o cliente...', 'info');
            dadosAcumulados += `\n[SAC]: Escreva uma resposta empática, clara e altamente profissional orientada para a satisfação do comprador.`;
        } else if (agenteAtual === 'revisor') {
            handleLog('A rever gramática e coerência do texto...', 'info');
            dadosAcumulados += `\n[REVISOR]: Garanta que o texto gerado não contém erros ortográficos, tem boa pontuação e é altamente legível.`;
        } else if (agenteAtual === 'concorrencia') {
            handleLog('A mapear estratégias de vendedores concorrentes...', 'info');
            dadosAcumulados += `\n[ESPIÃO]: Foque em descobrir pontos fracos, preços praticados e diferenciais de outros vendedores no mesmo nicho.`;
        }

        onEvent({ type: 'agent_end', agente: agenteAtual });
    }

    // ── IA Mãe sintetiza e responde ─────────────────────────────────────────
    onEvent({ type: 'reasoning_chunk', text: '\n🧠 A finalizar processo e consolidar inteligência do enxame na resposta final...\n' });
    
    const ctxEnriquecido = [
        contextoSistema?.dataBlock || "",
        dadosAcumulados ? `\n=== DADOS GERADOS PELO ENXAME DE AGENTES ===\n${dadosAcumulados}` : ''
    ].filter(Boolean).join('\n');

    const resultFinal = await buildAnswerFn(mensagem, historyRaw, {
        ...contextoSistema,
        dataBlock: ctxEnriquecido
    });

    let respostaFinal = resultFinal.reply;
    const needsValidation = toolsExecutadas.includes('pesquisa') || toolsExecutadas.includes('estrategista') || toolsExecutadas.includes('seo') || toolsExecutadas.includes('analista');
    
    if (needsValidation && respostaFinal.length > 150) {
        onEvent({ type: 'agent_start', agente: 'validacao' });
        toolsExecutadas.push('validacao');
        onEvent({ type: 'reasoning_chunk', text: '⚖️ Validador final a verificar a precisão da resposta...\n' });
        
        const val = await agenteValidador(respostaFinal, ctxEnriquecido, "", "", handleLog);
        if (!val.aprovada && val.correcao) {
            handleLog(`Correção aplicada no HTML final: ${val.motivo}`, 'warn');
            respostaFinal = val.correcao;
        }
        onEvent({ type: 'agent_end', agente: 'validacao' });
    }

    const todasTools = [...new Set([...(resultFinal.toolsExecutadas || []), ...toolsExecutadas])];

    return { 
        reply: respostaFinal, 
        sources: resultFinal.sources || [], 
        fontes: fontesEncontradas, 
        reasoning: "", 
        toolsExecutadas: todasTools 
    };
}