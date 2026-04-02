// backend/src/ia/agents/imageAgent.js
import axios from 'axios';

export async function agenteImagem(mensagem, onLog) {
  onLog('Analisando prompt de imagem...', 'info');
  try {
    // Remove palavras-chave do comando para pegar apenas o descritivo
    const prompt = mensagem.replace(/criar imagem|gerar imagem|desenhe|crie uma arte/i, '').trim();
    
    // Substitua pela forma como você chama as variáveis do seu projeto
    const API_KEY = process.env.SPIDER_API_TOKEN || "StLPhhtU4RHeD9KVX0aT";
    const url = `https://api.spiderx.com.br/api/ai/flux?text=${encodeURIComponent(prompt)}&api_key=${API_KEY}`;
    
    onLog('Processando parâmetros visuais e gerando arte...', 'info');
    const response = await axios.get(url, { timeout: 90000 });
    
    if (response.data && response.data.success && response.data.image) {
        onLog('Imagem gerada com sucesso.', 'success');
        const imgUrl = response.data.image;
        
        // Retorna o HTML estruturado para o frontend exibir
        const html = `🎨 <b>Imagem gerada:</b><br><br>
<img src="${imgUrl}" alt="${prompt}" style="max-width:100%; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
<br><br><a href="${imgUrl}" target="_blank" style="color:#8ab4f8; text-decoration:underline;">🔗 Abrir imagem em alta resolução</a>`;

        return { sucesso: true, dadosEncontrados: html };
    }
    throw new Error('Falha no retorno da API SpiderX');
  } catch (error) {
    onLog(`Erro na geração: ${error.message}`, 'error');
    return { sucesso: false, dadosEncontrados: '❌ Ocorreu um erro técnico ao gerar a imagem no servidor.' };
  }
}