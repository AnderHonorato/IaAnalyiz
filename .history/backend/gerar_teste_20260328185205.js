import fs from 'fs';
import axios from 'axios';

async function gerarLista() {
    let mlbs = new Set();
    let offset = 0;
    // Você pode mudar a palavra-chave para testar categorias diferentes
    const query = 'celular'; 

    console.log(`Buscando 1000 anúncios reais do ML para a palavra "${query}"...`);

    while (mlbs.size < 1000) {
        try {
            const res = await axios.get(`https://api.mercadolibre.com/sites/MLB/search?q=${query}&limit=50&offset=${offset}`);
            const results = res.data.results;
            
            if (!results || results.length === 0) {
                console.log('Não há mais resultados disponíveis.');
                break;
            }

            results.forEach(item => mlbs.add(item.id));
            offset += 50;
            console.log(`Coletados: ${mlbs.size} / 1000...`);
            
            // Pausa de 200ms para a API pública não chiar
            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error('Erro ao buscar:', error.message);
            break;
        }
    }

    // Pega exatamente 1000 e junta com quebra de linha
    const listaFinal = Array.from(mlbs).slice(0, 1000).join('\n');
    fs.writeFileSync('teste_1000_mlbs.txt', listaFinal);
    console.log('✅ Sucesso! Arquivo "teste_1000_mlbs.txt" salvo na pasta.');
}

gerarLista();