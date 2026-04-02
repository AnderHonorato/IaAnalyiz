import fs from 'fs';
import axios from 'axios';

async function gerarLista() {
    let mlbs = new Set();
    let offset = 0;
    let pagina = 1;
    const query = 'celular'; 

    console.log(`🕵️‍♂️ Raspando 1000 anúncios reais do ML para a palavra "${query}" via HTML...`);

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
            
            // Pega apenas URLs de produtos (ex: href="https://produto.mercadolivre.../MLB-1234")
            const linkRegex = /href="https:\/\/(?:produto|www)\.mercadolivre\.com\.br\/(?:p\/)?MLB-?(\d+)/gi;
            let m;
            let adicionadosNestaPagina = 0;
            
            while ((m = linkRegex.exec(html)) !== null) {
                const idLimpo = `MLB${m[1]}`;
                if (!mlbs.has(idLimpo)) {
                    mlbs.add(idLimpo);
                    adicionadosNestaPagina++;
                }
                if (mlbs.size >= 1000) break;
            }

            console.log(`Página ${pagina} processada. Total coletado: ${mlbs.size} / 1000...`);

            if (adicionadosNestaPagina === 0) {
                console.log('⚠️ Nenhum anúncio novo encontrado. O Mercado Livre pode ter limitado a busca.');
                break;
            }

            offset += 50;
            pagina++;
            
            await new Promise(r => setTimeout(r, 1500));
            
        } catch (error) {
            console.error(`❌ Erro ao raspar página ${pagina}:`, error.message);
            break;
        }
    }

    const listaFinal = Array.from(mlbs).slice(0, 1000).join('\n');
    fs.writeFileSync('teste_1000_mlbs.txt', listaFinal);
    console.log(`\n✅ Sucesso! Arquivo "teste_1000_mlbs.txt" gerado com IDs limpos e validados.`);
}

gerarLista();