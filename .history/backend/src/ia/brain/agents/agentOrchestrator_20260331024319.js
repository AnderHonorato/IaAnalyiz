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

    try {
        // PROMPT RENOVADO PARA GERAR O PENSAMENTO ORGÂNICO REAL EM VEZ DAS FRASES FIXAS
        const promptIntent = `Você é a Mente Orquestradora da IA Analyiz.
Mensagem do usuário: "${mensagem}"
Contexto atual do sistema: ${contextoSistema?.totalDivergencias || 0} divergências, ${contextoSistema?.totalProdutos || 0} produtos.

TAREFAS OBRIGATÓRIAS:
1. PENSE internamente de forma única, orgânica e humanizada (em 1ª pessoa) sobre como resolver o pedido do utilizador. Pareça um detetive ou especialista a raciocinar em voz alta.
   - FUJA COMPLETAMENTE de frases genéricas e robóticas como "Mensagem recebida", "Classifico como", "Intenção identificada".
   - Exemplo bom: "O utilizador enviou um PDF enorme de lucros. Vou acionar o Analista para dissecar os números e aplicar formatação de cor vermelha se detetar prejuízos."
2. Escolha os agentes estritamente necessários para cumprir o que pensou.

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
- "sac": formular respostas para perguntas ou reclamações de clientes.
- "revisor": revisar gramática, ortografia e tom de voz de textos.
- "concorrencia": monitorar e comparar lojas concorrentes.
- "padrao": conversa normal, sem ferramentas.

Retorne APENAS um JSON PURO com este formato exato:
{
  "pensamento": "o seu raciocínio natural e inteligente aqui (máx 4 linhas)",
  "agentes": [ {"agente": "nome_da_lista_acima", "motivo": "porquê escolheu"} ]
}`;

        const resIntent = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptIntent,
            config: { responseMimeType: "application/json", temperature: 0.7 } // Temperature 0.7 para pensamentos mais criativos
        });
        
        const intentData = JSON.parse(resIntent.text);
        pensamentoOrganico = intentData.pensamento || 'A analisar contexto...';
        agentesEscolhidos = Array.isArray(intentData.agentes) ? intentData.agentes : [];
        
        // Simular o efeito máquina de escrever (Typewriter) para o pensamento natural
        onEvent({ type: 'reasoning_start', action: 'reasoning_start' });
        for (let i = 0; i < pensamentoOrganico.length; i += 5) {
            onEvent({ type: 'reasoning_chunk', text: pensamentoOrganico.slice(i, i + 5) });
            await new Promise(r => setTimeout(r, 8)); // Pequeno delay
        }
        onEvent({ type: 'reasoning_chunk', text: '\n\n' });

    } catch (e) {
        // Fallback rápido se o JSON falhar
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
            dadosAcumulados += `\n[COPYWRITER]: Aplique técnicas de copywriting (AIDA, PAS) na resposta para maximizar conversões.`;
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
        onEvent({ type: 'reasoning_chunk', text: '⚖️ A passar pelo crivo final do Validador...\n' });
        
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
        reasoning: pensamentoOrganico, // Devolvemos o pensamento gerado para guardar no DB
        toolsExecutadas: todasTools 
    };
}