import fs from 'fs';
import axios from 'axios';

async function gerarLista() {
    let mlbs = new Set();
    let offset = 0;
    let pagina = 1;
    const query = 'celular'; 

    console.log(`🕵️‍♂️ Raspando 1000 anúncios reais do ML para a palavra "${query}" via HTML...`);

    // Simulando um navegador real (Google Chrome)
    const scraper = axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 10000
    });

    while (mlbs.size < 1000) {
        try {
            // Paginação do ML: a primeira página não tem offset, as próximas são _Desde_51, _Desde_101...
            const url = offset === 0 
              ? `https://lista.mercadolivre.com.br/${query}`
              : `https://lista.mercadolivre.com.br/${query}_Desde_${offset + 1}_NoIndex_True`;
            
            const res = await scraper.get(url);
            const html = res.data;
            
            // Procura qualquer padrão que pareça um ID do Mercado Livre (MLB123456789)
            const matches = html.match(/MLB-?\d+/gi) || [];
            
            let adicionadosNestaPagina = 0;
            for (const m of matches) {
                const clean = m.toUpperCase().replace('-', '');
                if (!mlbs.has(clean)) {
                    mlbs.add(clean);
                    adicionadosNestaPagina++;
                }
                if (mlbs.size >= 1000) break; // Para na hora que bater 1000
            }

            console.log(`Página ${pagina} processada. Total coletado: ${mlbs.size} / 1000...`);

            if (adicionadosNestaPagina === 0) {
                console.log('⚠️ Nenhum anúncio novo encontrado nesta página. O Mercado Livre pode ter limitado a busca.');
                break;
            }

            offset += 50;
            pagina++;
            
            // Pausa de 1.5 segundos para o Mercado Livre não bloquear nosso IP por excesso de velocidade
            await new Promise(r => setTimeout(r, 1500));
            
        } catch (error) {
            console.error(`❌ Erro ao raspar página ${pagina}:`, error.message);
            break;
        }
    }

    // Pega exatamente o que coletou e junta com quebra de linha
    const listaFinal = Array.from(mlbs).slice(0, 1000).join('\n');
    fs.writeFileSync('teste_1000_mlbs.txt', listaFinal);
    console.log(`\n✅ Sucesso! Arquivo "teste_1000_mlbs.txt" gerado com ${Array.from(mlbs).slice(0, 1000).length} IDs.`);
}

gerarLista();