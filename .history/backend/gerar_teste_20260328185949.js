import fs from 'fs';
import axios from 'axios';

async function gerarLista() {
    let mlbs = new Set();
    let pagina = 1;
    let url = 'https://lista.mercadolivre.com.br/celular'; // Começamos aqui

    console.log(`🕵️‍♂️ Coletando 1000 IDs reais e ativos do Mercado Livre...`);

    const scraper = axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000
    });

    while (mlbs.size < 1000) {
        try {
            const res = await scraper.get(url);
            const html = res.data;
            
            // Pega QUALQUER coisa que seja "MLB" ou "MLB-" seguido de 8 a 10 números no site inteiro
            const matches = html.match(/MLB-?\d{8,10}/gi) || [];
            let adicionados = 0;
            
            for (const m of matches) {
                const idLimpo = m.toUpperCase().replace('-', '');
                if (!mlbs.has(idLimpo)) {
                    mlbs.add(idLimpo);
                    adicionados++;
                }
                if (mlbs.size >= 1000) break;
            }

            console.log(`Página ${pagina} lida. Total coletado: ${mlbs.size} / 1000...`);

            if (mlbs.size >= 1000) break;

            pagina++;
            // Pula para a próxima página do Mercado Livre
            url = `https://lista.mercadolivre.com.br/celular_Desde_${(pagina-1)*50 + 1}_NoIndex_True`;
            
            // Pausa pra não tomar block
            await new Promise(r => setTimeout(r, 1000));
            
        } catch (error) {
            console.error(`❌ Erro ao raspar página ${pagina}:`, error.message);
            break;
        }
    }

    const listaFinal = Array.from(mlbs).slice(0, 1000).join('\n');
    fs.writeFileSync('teste_1000_mlbs.txt', listaFinal);
    console.log(`\n✅ Sucesso! Arquivo "teste_1000_mlbs.txt" gerado com ${Array.from(mlbs).slice(0, 1000).length} IDs limpos.`);
}

gerarLista();