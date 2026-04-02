import { GoogleGenAI } from '@google/genai';

export async function agenteProgramador(mensagem, contexto, onLog) {
  onLog('Analisando requisitos do código...', 'info');
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Atue como um Engenheiro de Software Sênior. 
Gere APENAS o código requisitado pelo usuário dentro de blocos de código formatados (ex: \`\`\`javascript).
NUNCA trunque o código.
MENSAGEM: ${mensagem}`;
    
    onLog('Escrevendo blocos de código...', 'info');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    onLog('Código gerado.', 'success');
    return { sucesso: true, dadosEncontrados: response.text };
  } catch (e) {
    onLog('Erro ao gerar código', 'error');
    return { sucesso: false, dadosEncontrados: '' };
  }
}