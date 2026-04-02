// backend/src/ia/agents/audioAgent.js
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import ytSearch from 'yt-search';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ajuste para o caminho exato da sua pasta temp na raiz do projeto
const TEMP_DIR = path.join(__dirname, '../../../../temp'); 

export async function agenteAudio(mensagem, onLog) {
    onLog('Analisando solicitação de áudio/música...', 'info');
    try {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
        
        const query = mensagem.replace(/baixar música|tocar música|áudio de|baixe o/i, '').trim();
        onLog(`Buscando no YouTube: ${query}`, 'info');
        
        const searchResults = await ytSearch(query);
        if (!searchResults || !searchResults.videos.length) {
            onLog('Música não encontrada.', 'warn');
            return { sucesso: false, dadosEncontrados: '❌ Não encontrei nenhuma música com essa busca.' };
        }
        
        const videoInfo = searchResults.videos[0];
        onLog(`Encontrado: ${videoInfo.title} (${videoInfo.timestamp})`, 'info');
        onLog('Iniciando download e conversão de áudio para mp3...', 'info');
        
        const safeTitle = videoInfo.title.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 30);
        const outputFileName = `audio-${Date.now()}-${safeTitle}.mp3`;
        const audioPath = path.join(TEMP_DIR, outputFileName);
        
        return new Promise((resolve) => {
            const ytDlpProcess = spawn('yt-dlp', [
                '-x', '--audio-format', 'mp3', '--audio-quality', '192k',
                '-o', audioPath, videoInfo.url
            ]);
            
            ytDlpProcess.on('close', (code) => {
                if (code === 0) {
                    onLog('Áudio baixado e convertido com sucesso.', 'success');
                    // Retorna a tag de áudio HTML apontando para a rota estática /temp do seu backend
                    const html = `🎵 <b>Música Baixada:</b> ${videoInfo.title}<br>👤 <b>Canal:</b> ${videoInfo.author.name}<br>⏱️ <b>Duração:</b> ${videoInfo.timestamp}<br><br><audio controls src="/temp/${outputFileName}" style="width:100%; outline:none; border-radius:8px;"></audio><br><br><a href="/temp/${outputFileName}" download style="color:#10b981; font-weight:600;">⬇️ Fazer Download MP3</a>`;
                    resolve({ sucesso: true, dadosEncontrados: html });
                } else {
                    onLog('Erro no processo do yt-dlp', 'error');
                    resolve({ sucesso: false, dadosEncontrados: '❌ Erro ao baixar ou converter a música.' });
                }
            });
        });
    } catch(e) {
        onLog(`Erro geral: ${e.message}`, 'error');
        return { sucesso: false, dadosEncontrados: '❌ Erro interno do servidor ao processar o áudio.' };
    }
}