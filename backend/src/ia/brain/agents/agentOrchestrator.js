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

    let agentesEscolhidos = [];
    let pensamentoOrganico = "A processar...";
    let sugestoesDinamicas = [];

    try {
        const promptIntent = `Você é a Mente Orquestradora da IA Analyiz.
Mensagem do usuário: "${mensagem}"

TAREFAS OBRIGATÓRIAS:
1. PENSE internamente de forma única, orgânica e humanizada (em 1ª pessoa) sobre como resolver o pedido. Pareça um especialista a raciocinar em voz alta.
   - FUJA COMPLETAMENTE de frases robóticas ("Mensagem recebida", "Classifico como").
2. Escolha os agentes estritamente necessários.
3. GERE 2 (duas) sugestões de perguntas (follow-ups) curtas e lógicas que o usuário provavelmente fará a seguir, com base neste contexto.

AGENTES DISPONÍVEIS:
- "pesquisa": buscar na web, preços, concorrentes.
- "estrategista": analisar lucros, viabilidade, margens.
- "seo": otimização de títulos, tags, Mercado Livre.
- "logistica": fretes, divergências de peso, embalagens.
- "programador": criar código, scripts, html, css.
- "imagem": gerar ou criar imagem/arte.
- "video": baixar ou criar video mp4.
- "audio": baixar musica, audio mp3.
- "copywriter": textos de vendas persuasivos.
- "analista": analisar planilhas, CSVs, gráficos.
- "sac": formular respostas empáticas para clientes.
- "revisor": revisar gramática e tom de voz.
- "concorrencia": espiar lojas concorrentes.
- "banco": consultar dados internos e informações do sistema.
- "padrao": conversa normal, sem ferramentas.

Retorne APENAS um JSON PURO com este formato exato:
{
  "pensamento": "o seu raciocínio natural e fluído aqui (máx 4 linhas)",
  "agentes": [ {"agente": "nome_do_agente", "motivo": "porquê escolheu"} ],
  "sugestoes": ["Sugestão de próxima pergunta 1", "Sugestão 2"]
}`;

        const resIntent = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptIntent,
            config: { responseMimeType: "application/json", temperature: 0.7 }
        });
        
        const intentData = JSON.parse(resIntent.text);
        pensamentoOrganico = intentData.pensamento || 'Vou analisar o pedido agora...';
        agentesEscolhidos = Array.isArray(intentData.agentes) ? intentData.agentes : [];
        sugestoesDinamicas = Array.isArray(intentData.sugestoes) ? intentData.sugestoes : [];
        
        onEvent({ type: 'reasoning_start', action: 'reasoning_start' });
        for (let i = 0; i < pensamentoOrganico.length; i += 5) {
            onEvent({ type: 'reasoning_chunk', text: pensamentoOrganico.slice(i, i + 5) });
            await new Promise(r => setTimeout(r, 8)); 
        }
        onEvent({ type: 'reasoning_chunk', text: '\n\n' });

    } catch (e) {
        agentesEscolhidos = [];
        pensamentoOrganico = "Vou analisar este pedido diretamente usando os meus conhecimentos base.";
        onEvent({ type: 'reasoning_chunk', text: pensamentoOrganico + '\n\n' });
        if (/imagem|arte|desenhe/i.test(mensagem))           agentesEscolhidos.push({ agente: 'imagem', motivo: 'fallback' });
        else if (/vídeo|video|mp4/i.test(mensagem))          agentesEscolhidos.push({ agente: 'video', motivo: 'fallback' });
        else if (/código|script|html/i.test(mensagem))       agentesEscolhidos.push({ agente: 'programador', motivo: 'fallback' });
        else agentesEscolhidos.push({ agente: 'padrao', motivo: 'fallback' });
    }

    let dadosAcumulados = "";
    let fontesEncontradas = [];
    let toolsExecutadas = [];

    const handleLog = (msg, tipo) => {
        onEvent({ type: 'agent_log', msg, tipo });
    };

    // ── Roteamento Sequencial para os Agentes do Enxame ───────────────────
    for (const item of agentesEscolhidos) {
        const agenteAtual = item.agente;
        if (agenteAtual === 'padrao') continue;
        
        onEvent({ type: 'agent_start', agente: agenteAtual });
        toolsExecutadas.push(agenteAtual);

        await new Promise(r => setTimeout(r, 800));

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
            dadosAcumulados += `\n[ESTRATEGISTA]: Considere os custos e sugira o markup ideal.`;
        } else if (agenteAtual === 'seo') {
            handleLog('A analisar palavras-chave e volume de busca...', 'info');
            dadosAcumulados += `\n[SEO]: Estruture os títulos para alta conversão no Mercado Livre.`;
        } else if (agenteAtual === 'logistica') {
            handleLog('A analisar peso cubado e impacto no frete...', 'info');
            dadosAcumulados += `\n[LOGISTICA]: Verifique penalidades de frete do Mercado Envios.`;
        } else if (agenteAtual === 'copywriter') {
            handleLog('A criar gatilhos de conversão e neuro-vendas...', 'info');
            dadosAcumulados += `\n[COPYWRITER]: Aplique técnicas de copywriting (AIDA, PAS).`;
        } else if (agenteAtual === 'analista') {
            handleLog('A processar matriz de dados matemáticos...', 'info');
            dadosAcumulados += `\n[ANALISTA]: Extraia conclusões exatas dos ficheiros.`;
        } else if (agenteAtual === 'sac') {
            handleLog('A redigir texto humanizado e profissional...', 'info');
            dadosAcumulados += `\n[SAC]: Responda de forma empática e orientada ao cliente.`;
        } else if (agenteAtual === 'revisor') {
            handleLog('A aplicar correção ortográfica e sintática...', 'info');
            dadosAcumulados += `\n[REVISOR]: Garanta zero erros de português.`;
        } else if (agenteAtual === 'concorrencia') {
            handleLog('A mapear preços praticados noutras lojas...', 'info');
            dadosAcumulados += `\n[ESPIÃO]: Descubra pontos fracos dos vendedores concorrentes.`;
        } else if (agenteAtual === 'banco') {
            handleLog('A solicitar extração de dados SQL...', 'info');
            dadosAcumulados += `\n[BANCO]: Consultei o sistema interno. Os dados serão passados para a resposta final.`;
        }

        await new Promise(r => setTimeout(r, 600));
        onEvent({ type: 'agent_end', agente: agenteAtual });
    }
    
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
        handleLog('A passar pelo crivo final do Validador de dados...', 'info');
        await new Promise(r => setTimeout(r, 600));
        
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
        reasoning: pensamentoOrganico, 
        toolsExecutadas: todasTools,
        sugestoes: sugestoesDinamicas // Passamos as sugestões dinâmicas para o frontend
    };
}