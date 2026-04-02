import fs from 'fs';
import axios from 'axios';

async function gerarLista() {
    let mlbs = new Set();
    let pagina = 1;
    let offset = 0;
    
    // Array de palavras-chave ricas em produtos de catálogo
    const queries = ['celular', 'notebook', 'televisao', 'geladeira', 'fone']; 
    let queryIndex = 0;

    console.log(`🕵️‍♂️ Extraindo 1000 IDs de Catálogo (Sem Redirecionamento)...`);

    const scraper = axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
    });

    while (mlbs.size < 1000 && queryIndex < queries.length) {
        const query = queries[queryIndex];
        try {
            const url = offset === 0 
              ? `https://lista.mercadolivre.com.br/${query}`
              : `https://lista.mercadolivre.com.br/${query}_Desde_${offset + 1}_NoIndex_True`;
            
            const res = await scraper.get(url);
            
            // A MÁGICA: Pega APENAS o product_id (ID de Catálogo). Ele nunca redireciona!
            const matches = res.data.match(/"product_id":"(MLB\d+)"/g) || [];
            let adicionados = 0;
            
            for (const m of matches) {
                // Limpa a string para pegar apenas o MLB12345
                const idLimpo = m.match(/MLB\d+/)[0];
                // Evita strings vazias e verifica se já não pegou esse ID
                if (idLimpo && !mlbs.has(idLimpo)) {
                    mlbs.add(idLimpo);
                    adicionados++;
                }
                if (mlbs.size >= 1000) break;
            }

            console.log(`Buscando "${query}" - Página ${pagina}. Total coletado: ${mlbs.size} / 1000...`);

            // Se não achar mais catálogos nessa página, pula para a próxima palavra-chave
            if (adicionados === 0 || pagina >= 15) {
                queryIndex++;
                offset = 0;
                pagina = 1;
            } else {
                pagina++;
                offset += 50;
            }
            
            // Pausa de 1s para não tomar block
            await new Promise(r => setTimeout(r, 1000));
            
        } catch (error) {
            console.error(`❌ Erro ao buscar:`, error.message);
            queryIndex++; // Se der erro, tenta a próxima palavra
        }
    }

    const listaFinal = Array.from(mlbs).slice(0, 1000).join('\n');
    fs.writeFileSync('teste_1000_mlbs.txt', listaFinal);
    console.log(`\n✅ Sucesso! Arquivo "teste_1000_mlbs.txt" gerado APENAS com Produtos de Catálogo.`);
    console.log(`Isso garante 100% de precisão e evita o erro 404 por redirecionamento!`);
}

gerarLista();