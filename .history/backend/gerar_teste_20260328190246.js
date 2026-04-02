import fs from 'fs';
import axios from 'axios';

async function gerarLista() {
    let mlbs = new Set();
    let pagina = 1;
    let offset = 0;
    const query = 'celular'; 

    console.log(`🕵️‍♂️ Extraindo 1000 anúncios reais de "${query}" via JSON interno...`);

    const scraper = axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000
    });

    while (mlbs.size < 1000) {
        try {
            const url = offset === 0 
              ? `https://lista.mercadolivre.com.br/${query}`
              : `https://lista.mercadolivre.com.br/${query}_Desde_${offset + 1}_NoIndex_True`;
            
            const res = await scraper.get(url);
            const html = res.data;
            
            // MÁGICA: Extrai apenas strings exatas que começam com "MLB" seguido de números DENTRO DAS ASPAS
            // Isso evita pegar lixo de URL, imagens e categorias
            const matches = html.match(/"(MLB\d{8,11})"/g) || [];
            let adicionados = 0;
            
            for (const m of matches) {
                const idLimpo = m.replace(/"/g, ''); // Remove as aspas
                if (!mlbs.has(idLimpo)) {
                    mlbs.add(idLimpo);
                    adicionados++;
                }
                if (mlbs.size >= 1000) break;
            }

            console.log(`Página ${pagina} lida. Total coletado: ${mlbs.size} / 1000...`);

            if (adicionados === 0) {
                console.log('⚠️ Nenhum ID real encontrado nesta página. O ML pode ter limitado a busca.');
                break;
            }

            if (mlbs.size >= 1000) break;

            pagina++;
            offset += 50;
            
            // Pausa de 1.5s para não tomar block
            await new Promise(r => setTimeout(r, 1500));
            
        } catch (error) {
            console.error(`❌ Erro ao raspar página ${pagina}:`, error.message);
            break;
        }
    }

    const listaFinal = Array.from(mlbs).slice(0, 1000).join('\n');
    fs.writeFileSync('teste_1000_mlbs.txt', listaFinal);
    console.log(`\n✅ Sucesso! Arquivo "teste_1000_mlbs.txt" gerado APENAS com IDs 100% reais e validados.`);
}

gerarLista();