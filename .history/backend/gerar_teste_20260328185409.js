import fs from 'fs';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function gerarLista() {
    // Pega o primeiro token válido logado no seu banco de dados
    const token = await prisma.mlToken.findFirst();
    
    if (!token) {
        console.log('❌ Erro: Nenhum token do Mercado Livre encontrado no banco. Faça login no painel primeiro.');
        return;
    }

    let mlbs = new Set();
    let offset = 0;
    const query = 'celular'; 

    console.log(`Buscando 1000 anúncios reais do ML para a palavra "${query}"...`);
    console.log(`🔑 Usando Token de Autenticação do banco de dados...`);

    while (mlbs.size < 1000) {
        try {
            const res = await axios.get(`https://api.mercadolibre.com/sites/MLB/search?q=${query}&limit=50&offset=${offset}`, {
                headers: {
                    Authorization: `Bearer ${token.accessToken}`
                }
            });
            const results = res.data.results;
            
            if (!results || results.length === 0) {
                console.log('Não há mais resultados disponíveis.');
                break;
            }

            results.forEach(item => mlbs.add(item.id));
            offset += 50;
            console.log(`Coletados: ${mlbs.size} / 1000...`);
            
            // Pausa de 200ms para respeitar a API
            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error('❌ Erro ao buscar:', error.response ? error.response.data : error.message);
            break;
        }
    }

    // Corta exatamente em 1000 itens
    const listaFinal = Array.from(mlbs).slice(0, 1000).join('\n');
    fs.writeFileSync('teste_1000_mlbs.txt', listaFinal);
    console.log('✅ Sucesso! Arquivo "teste_1000_mlbs.txt" salvo na pasta com sucesso.');
    
    // Desconecta o Prisma
    await prisma.$disconnect();
}

gerarLista();