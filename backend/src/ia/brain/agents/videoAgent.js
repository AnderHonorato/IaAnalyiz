// backend/src/ia/agents/videoAgent.js
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import ytSearch from 'yt-search';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '../../../../temp');

export async function agenteVideo(mensagem, onLog) {
    onLog('Analisando solicitação de vídeo...', 'info');
    try {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
        
        const query = mensagem.replace(/baixar vídeo|tocar vídeo|crie um vídeo de/i, '').trim();
        onLog(`Buscando vídeo: ${query}`, 'info');
        
        const searchResults = await ytSearch(query);
        if (!searchResults || !searchResults.videos.length) {
            onLog('Vídeo não encontrado.', 'warn');
            return { sucesso: false, dadosEncontrados: '❌ Não encontrei nenhum vídeo com essa busca.' };
        }
        
        const videoInfo = searchResults.videos[0];
        onLog(`Encontrado: ${videoInfo.title} (${videoInfo.timestamp})`, 'info');
        onLog('Baixando o vídeo na melhor qualidade suportada...', 'info');
        
        const safeTitle = videoInfo.title.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 30);
        const outputFileName = `video-${Date.now()}-${safeTitle}.mp4`;
        const videoPath = path.join(TEMP_DIR, outputFileName);
        
        return new Promise((resolve) => {
            const ytDlpProcess = spawn('yt-dlp', [
                '--format', 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
                '--merge-output-format', 'mp4',
                '-o', videoPath, videoInfo.url
            ]);
            
            ytDlpProcess.on('close', (code) => {
                if (code === 0) {
                    onLog('Vídeo baixado com sucesso.', 'success');
                    const html = `🎥 <b>Vídeo Baixado:</b> ${videoInfo.title}<br>👤 <b>Canal:</b> ${videoInfo.author.name}<br>⏱️ <b>Duração:</b> ${videoInfo.timestamp}<br><br><video controls src="/temp/${outputFileName}" style="width:100%; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></video><br><br><a href="/temp/${outputFileName}" download style="color:#10b981; font-weight:600;">⬇️ Fazer Download MP4</a>`;
                    resolve({ sucesso: true, dadosEncontrados: html });
                } else {
                    onLog('Erro no processo do yt-dlp', 'error');
                    resolve({ sucesso: false, dadosEncontrados: '❌ Erro ao baixar o vídeo.' });
                }
            });
        });
    } catch(e) {
        onLog(`Erro geral: ${e.message}`, 'error');
        return { sucesso: false, dadosEncontrados: '❌ Erro interno ao processar o vídeo.' };
    }
}