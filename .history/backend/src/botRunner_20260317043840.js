import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let sseClients = [];

// Função auxiliar para criar atrasos (delays) e simular processamento de IA
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Gerencia conexões SSE para o terminal do Frontend
export function addSseClient(res) {
  sseClients.push(res);
  res.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
}

// Envia logs em tempo real para o navegador
function sendToClients(data) {
  sseClients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

/**
 * CORE ENGINE: Protocolo de Varredura Heurística
 */
export async function runBot() {
  try {
    const produtos = await prisma.produto.findMany({
      include: {
        itensDoKit: {
          include: { produto: true }
        }
      }
    });

    if (produtos.length === 0) {
      sendToClients({ type: 'warn', msg: 'DATABASE_EMPTY: Nenhum produto encontrado para análise.' });
      sendToClients({ type: 'done', percent: 100, timeLeft: '0s' });
      return;
    }

    sendToClients({ type: 'info', msg: `INIT_PROTOCOL: Iniciando varredura em ${produtos.length} registros...` });
    await delay(1500);

    for (let i = 0; i < produtos.length; i++) {
      const p = produtos[i];
      
      // STEP 1: Conexão e Handshake
      sendToClients({ type: 'info', msg: `[${p.sku}] 📡 Estabelecendo túnel com Mercado Livre API...` });
      await delay(1200);

      // STEP 2: Busca de Metadados do Anúncio
      sendToClients({ type: 'info', msg: `[${p.sku}] 🔍 Recuperando metadados do anúncio ${p.mlItemId || 'N/A'}...` });
      await delay(1000);

      // LÓGICA DE CÁLCULO DE PESO (Real vs Composto)
      let pesoEsperado = p.pesoGramas;
      let diagnostico = "";

      if (p.eKit) {
        sendToClients({ type: 'info', msg: `[${p.sku}] 🧬 Identificado como Objeto Composto. Calculando soma de componentes...` });
        await delay(800);
        
        pesoEsperado = p.itensDoKit.reduce((acc, item) => {
          return acc + (item.produto.pesoGramas * item.quantidade);
        }, 0);
        
        diagnostico = `Peso Composto Calculado: ${pesoEsperado}g`;
      } else {
        diagnostico = `Peso Simples Registrado: ${pesoEsperado}g`;
      }

      // SIMULAÇÃO DE VALIDAÇÃO (Substituir pela chamada real da API ML no futuro)
      // Aqui simulamos uma divergência se o peso for par ou ímpar para teste visual
      const pesoNoMercadoLivre = i % 3 === 0 ? pesoEsperado + 200 : pesoEsperado; 

      sendToClients({ type: 'info', msg: `[${p.sku}] 📊 Comparando: Interno (${pesoEsperado}g) vs ML (${pesoNoMercadoLivre}g)...` });
      await delay(1000);

      if (pesoEsperado !== pesoNoMercadoLivre) {
        const motivo = `DIVERGÊNCIA: ${diagnostico} diverge dos ${pesoNoMercadoLivre}g detectados no ML.`;
        
        // Registrar no banco de dados
        await prisma.divergencia.create({
          data: {
            mlItemId: p.mlItemId || "N/A",
            motivo: motivo,
            link: `https://anuncio.mercadolivre.com.br/${p.mlItemId}`,
            resolvido: false
          }
        });

        sendToClients({ type: 'warn', msg: `⚠️ ANOMALIA DETECTADA no SKU ${p.sku}. Registro de divergência criado.` });
      } else {
        sendToClients({ type: 'success', msg: `✅ SKU ${p.sku}: Integridade de dados confirmada.` });
      }

      // Atualização de Telemetria (Progresso)
      const percent = Math.round(((i + 1) / produtos.length) * 100);
      const remaining = produtos.length - (i + 1);
      const eta = remaining * 4; // Estimativa de 4 segundos por item
      
      sendToClients({ 
        type: 'progress', 
        percent, 
        timeLeft: remaining > 0 ? `${eta}s` : 'FINALIZANDO' 
      });

      await delay(600); // Resfriamento de Kernel para evitar Rate Limit
    }

    sendToClients({ type: 'done', msg: '🏁 PROTOCOLO CONCLUÍDO: Base de dados sincronizada com sucesso.' });

  } catch (error) {
    console.error(error);
    sendToClients({ type: 'error', msg: `CRITICAL_FAILURE: ${error.message}` });
  }
}