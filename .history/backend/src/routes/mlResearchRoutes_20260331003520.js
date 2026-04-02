// backend/src/routes/mlResearchRoutes.js
import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';

const prisma = new PrismaClient();
const router = express.Router();

async function getMlApi(userId) {
  const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!token) throw new Error('Conta ML não conectada');
  if (new Date() >= new Date(token.expiresAt)) throw new Error('Token ML expirado — reconecte');
  return axios.create({
    baseURL: 'https://api.mercadolibre.com',
    headers: { Authorization: `Bearer ${token.accessToken}` },
    timeout: 18000,
  });
}

// Agente de scraping simulando navegador real
const scraperAgent = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Upgrade-Insecure-Requests': '1'
  },
  maxRedirects: 5,
  decompress: true,
});

// ============================================================================
// FUNÇÕES UTILITÁRIAS E FORMATAÇÃO DE DADOS
// ============================================================================

function mapRep(level) {
  const m = { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' };
  return m[level] || 'novo';
}

function mapTipo(id) {
  const m = { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' };
  return m[id] || id || 'Clássico';
}

function formatarEnvio(shippingInfo, hasFulfillment) {
  if (hasFulfillment || (shippingInfo?.tags && shippingInfo.tags.includes('fulfillment')) || shippingInfo?.logistic_type === 'fulfillment') return 'Full';
  if (shippingInfo?.free_shipping || shippingInfo?.shipping_conditions === 'free_gap' || shippingInfo?.shipping_conditions === 'free_ratio') return 'Mercado Envios (Grátis)';
  return 'Mercado Envios';
}

function formatarVendas(soldQuantity) {
  if (!soldQuantity) return '+100 vendas';
  if (soldQuantity >= 50000) return '+50mil vendas';
  if (soldQuantity >= 10000) return '+10mil vendas';
  if (soldQuantity >= 5000) return '+5mil vendas';
  if (soldQuantity >= 1000) return '+1000 vendas';
  if (soldQuantity >= 500) return '+500 vendas';
  if (soldQuantity >= 100) return '+100 vendas';
  if (soldQuantity >= 50) return '+50 vendas';
  return `+${soldQuantity} vendas`;
}

function extrairAtributos(attrs = []) {
  return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name }));
}

function buildItemLink(id, permalink) {
  if (permalink) return permalink;
  if (!id) return null;
  const num = String(id).replace(/^MLB/i, '');
  return `https://produto.mercadolivre.com.br/MLB${num}-_JM`;
}

function extrairTodosMLBs(url) {
  const ids = new Set();
  for (const m of url.matchAll(/\/p\/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  const limpa = url.split('?')[0].split('#')[0];
  for (const m of limpa.matchAll(/\/[^/]+-MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  for (const m of url.matchAll(/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  return [...ids];
}

const sellerCache = new Map();
async function getSellerFull(sellerId, api) {
  if (!sellerId) return null;
  if (sellerCache.has(sellerId)) return sellerCache.get(sellerId);
  try {
    const sv = await api.get(`/users/${sellerId}`, { timeout: 5000 });
    const s  = sv.data;
    const info = {
      nome:      s.nickname || s.first_name || String(sellerId),
      reputacao: mapRep(s.seller_reputation?.level_id),
      vendas:    s.seller_reputation?.transactions?.completed || 0,
    };
    sellerCache.set(sellerId, info);
    return info;
  } catch { return { nome: String(sellerId), reputacao: null, vendas: null }; }
}

// ============================================================================
// EXTRATOR DO HTML E MOTOR DE PAGINAÇÃO (O QUE VOCÊ SOLICITOU)
// ============================================================================

function extrairVendedoresDoHTML(html, targetUrl, paginaAtual, debug) {
  const vendedores = [];

  const jsonPatterns = [
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]{100,}?\});?\s*(?:<\/script>|window\.|var )/,
    /"initialState"\s*:\s*(\{[\s\S]{100,}?\})\s*,\s*"components"/,
  ];

  for (const pattern of jsonPatterns) {
    const m = html.match(pattern);
    if (!m) continue;
    try {
      const state = JSON.parse(m[1]);
      
      const paths = [
        state?.appProps?.pageProps?.initialState?.components?.track?.melidata_event?.event_data?.items,
        state?.components?.track?.melidata_event?.event_data?.items,
        state?.buyingOptions?.options, 
        state?.initialState?.buyingOptions?.options,
        state?.component?.state?.buyingOptions?.options, 
        state?.catalogProductResults?.items,
        state?.pageState?.catalogBuyBox?.items,
        state?.buyingOptions?.offers,
      ];
      
      for (const arr of paths) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        
        arr.forEach((o, index) => {
          const nome  = o.seller_name || o.seller?.nickname || o.sellerInfo?.nickname || o.seller?.name || o.sellerNickname || '—';
          const preco = o.price?.amount || o.price?.value || o.salePrice || o.price || 0;
          const precoOriginal = o.original_price?.amount || o.original_price || o.originalPrice || null;
          const link  = o.permalink || o.item?.permalink || o.url || targetUrl || '';
          
          const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || null);
          const isFull = o.has_full_filment || o.shipping?.fulfillment || false;
          
          let parcelamento = '—';
          if (typeof o.installment_info === 'string') parcelamento = `${o.installment_info.replace('f','')}x`;
          else if (o.installments?.quantity) parcelamento = `${o.installments.quantity}x`;
          
          let vendasStr = o.seller?.sales_text || o.sellerInfo?.sales_text || null;
          if (!vendasStr && o.seller?.transactions?.completed) vendasStr = formatarVendas(o.seller.transactions.completed);
          if (!vendasStr) vendasStr = '+100 vendas';

          if (parseFloat(preco) > 0 || nome !== '—') {
            vendedores.push({ 
              nome, preco: parseFloat(preco) || 0, precoOriginal: precoOriginal || null,
              link, desconto: descPct,
              thumbnail: o.thumbnail || o.item?.thumbnail || null, titulo: o.title || o.item?.title || 'Anúncio Catálogo',
              freteGratis: o.shipping?.free_shipping === true || o.freeShipping === true || o.shipping_conditions === 'free_gap',
              envio: formatarEnvio(o.shipping || { free_shipping: o.shipping_conditions === 'free_gap' }, isFull),
              tipoAnuncio: mapTipo(o.listing_type_id || (o.item_condition === 'new' ? 'gold_special' : 'free')),
              vendas: vendasStr, parcelamento, pagina: paginaAtual, posicao: index + 1
            });
          }
        });
        if (vendedores.length) return vendedores;
      }
    } catch {}
  }

  return [];
}

/**
 * Busca principal via Scraping iterativo.
 * Recebe a URL, ignora os parâmetros de página antigos e reconstrói:
 * ?quantity=1&page=1, ?quantity=1&page=2, etc.
 */
async function buscarViaScraping(urlOriginal, mlbId, debug) {
  // Limpa a URL original para ter só a base do produto
  let baseUrl = urlOriginal.split('?')[0];
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://www.mercadolivre.com.br/p/${mlbId}/s`;
  }
  // Garante que catálogos terminem com /s
  if (baseUrl.includes('/p/MLB') && !baseUrl.endsWith('/s')) {
    baseUrl += '/s';
  }

  debug.push(`🌐 Scraping Iterativo Iniciado: ${baseUrl}`);
  
  let todosVendedores = [];
  let page = 1;
  let hasNext = true;
  let offset = 0;
  
  let tituloBase = null;
  let precoBase = 0;
  let thumbnailBase = null;

  while(hasNext && page <= 40) {
    const urlPage = `${baseUrl}?quantity=1&page=${page}`;
    debug.push(`📡 Acessando: ${urlPage}`);
    
    try {
      const res = await scraperAgent.get(urlPage);
      const html = res.data || '';
      
      // Na primeira página extrai dados visuais do produto
      if (page === 1) {
        const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
        if (ldMatch) {
          try {
            const ld = JSON.parse(ldMatch[1]);
            tituloBase = ld.name || ld.title;
            precoBase = ld.offers?.price ? parseFloat(ld.offers.price) : 0;
            thumbnailBase = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
          } catch(e){}
        }
        if (!tituloBase) {
           const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
           if (titleMatch) tituloBase = titleMatch[1].replace('Mercado Livre', '').trim();
           else tituloBase = `Catálogo ID ${mlbId}`;
        }
      }
      
      const vendedoresPagina = extrairVendedoresDoHTML(html, urlPage, page, debug);
      
      if (vendedoresPagina.length > 0) {
         // Trava anti-loop: Detecta se a página atual retornou os mesmos itens da página 1
         if (page > 1 && todosVendedores.length > 0) {
            const firstNew = vendedoresPagina[0];
            const isRepeated = todosVendedores.some(v => v.nome === firstNew.nome && v.preco === firstNew.preco);
            if (isRepeated) {
               debug.push(`✅ Fim da lista (repetição detectada na pág ${page}).`);
               break;
            }
         }
         
         const formatados = vendedoresPagina.map((v, i) => ({ 
           ...v, 
           posicao: offset + i + 1 
         }));

         todosVendedores.push(...formatados);
         offset += vendedoresPagina.length;
         page++;
         
         // Pausa para não bloquear IP (Cloudflare)
         await new Promise(r => setTimeout(r, 800));
      } else {
         debug.push(`⚠️ Página ${page} sem vendedores. Encerrando iteração.`);
         break;
      }
    } catch (e) {
      debug.push(`❌ Scraping interrompido na pág ${page}: ${e.message}`);
      break; 
    }
  }
  
  if (todosVendedores.length === 0) {
    throw new Error("Nenhum vendedor encontrado por scraping na URL fornecida.");
  }
  
  const sellerPrincipal = todosVendedores[0];
  const concorrentes = todosVendedores.slice(1);
  
  return {
    mlbId,
    titulo: tituloBase,
    preco: precoBase || sellerPrincipal.preco || 0,
    status: 'active',
    estoque: null,
    vendidos: null,
    condicao: 'Novo',
    tipoAnuncio: 'Catálogo',
    thumbnail: thumbnailBase,
    link: baseUrl,
    freteGratis: sellerPrincipal.freteGratis || false,
    frete: sellerPrincipal.frete || '—',
    envio: sellerPrincipal.envio || '—',
    vendas: sellerPrincipal.vendas || formatarVendas(null),
    avaliacoes: null,
    atributos: [],
    seller: { nome: sellerPrincipal.nome, reputacao: null, vendas: null },
    concorrentes,
    totalVendedores: todosVendedores.length,
    precoMin: Math.min(...todosVendedores.map(v => v.preco)),
    precoMax: Math.max(...todosVendedores.map(v => v.preco)),
    precoMedio: Math.round(todosVendedores.reduce((a,b)=>a+b.preco,0)/todosVendedores.length),
    ehCatalogo: true,
    fonte: 'scraping_direto_paginado',
    analisadoEm: new Date().toISOString(),
    pagina: 1,
    posicao: 1
  };
}

// Fallback caso usuário passe apenas um ID sem URL
async function buscarItemAPI(mlbId, api, debug) {
  debug.push(`🔍 Buscando API Oficial (Sem URL) para ${mlbId}...`);
  const itemRes = await api.get(`/items/${mlbId}`, {
    params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,condition,status,warranty,attributes' },
    timeout: 12000,
  });
  const it = itemRes.data;
  const seller = await getSellerFull(it.seller_id, api);
  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null, status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
    vendas: formatarVendas(it.sold_quantity), condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: it.permalink, freteGratis: it.shipping?.free_shipping === true, frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: formatarEnvio(it.shipping, false),
    avaliacoes: null, atributos: extrairAtributos(it.attributes || []), seller, concorrentes: [], totalVendedores: 1, precoMin: it.price, precoMax: it.price, precoMedio: it.price,
    ehCatalogo: false, catalogProductId: null, fonte: 'api_items', analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1
  };
}


// ============================================================================
// ROTAS REST
// ============================================================================

router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const itens = await prisma.pesquisaHistorico.findMany({
      where: { usuarioId: parseInt(userId), excluido: false, arquivado: arquivado === 'true' },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
    res.json(itens.map(i => ({ ...i, dadosJson: i.dadosJson ? JSON.parse(i.dadosJson) : null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/ml/research/market-analyses', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const analises = await prisma.pesquisaMercadoIA.findMany({
      where: { usuarioId: parseInt(userId) },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    res.json(analises);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/ml/research/market-analyses/:id', async (req, res) => {
  try {
    await prisma.pesquisaMercadoIA.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * ── Rota principal de processamento de um Anúncio
 * PRIORIZA EXATAMENTE O SCRAPING ITERATIVO CONFORME SOLICITADO
 */
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  const { userId, urlOriginal } = req.query;
  
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  const debug = [`🚀 Iniciando análise orquestrada de ${mlbId}`];
  
  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message, debug }); }
  
  // PRIORIDADE ABSOLUTA: Se você mandou uma URL, o sistema vai direto para o Scraping Paginado.
  if (urlOriginal) {
    debug.push(`📍 URL detectada. Forçando o Scraping iterativo web page a page...`);
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId, debug);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json({ ...dados, debug });
    } catch (e) {
      debug.push(`❌ Scraping falhou ou bloqueado: ${e.message}.`);
      // Só continua para API se o scraping falhar totalmente
    }
  }

  // FALLBACK: Se você mandou apenas o ID, tenta bater na API.
  try {
    const dados = await buscarItemAPI(mlbId, api, debug);
    await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
    return res.json({ ...dados, debug });
  } catch (eA) { debug.push(`⚠️  API Oficial (/items): ${eA.response?.status || eA.message?.substring(0,60)}`); }

  debug.push(`❌ Todas as estratégias falharam para ${mlbId}`);
  const msg = debug.filter(l => l.startsWith('❌') || l.startsWith('⚠️')).join(' | ');
  await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
  res.status(404).json({ error: `Anúncio não encontrado`, debug });
});

router.post('/api/ml/research/deep-market', async (req, res) => {
  const { userId, itens, perguntaFollowUp, contextoAnterior } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ error: 'itens obrigatório' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

  try {
    send('log', { msg: '🚀 Iniciando Pesquisa de Inteligência de Mercado...', tipo: 'info' });
    send('log', { msg: `📦 Analisando ${itens.length} produto(s)`, tipo: 'info' });
    if (perguntaFollowUp && contextoAnterior) send('log', { msg: `❓ Processando pergunta de follow-up: "${perguntaFollowUp.substring(0,60)}..."`, tipo: 'info' });
    send('log', { msg: '🌐 Iniciando pesquisa web em tempo real...', tipo: 'info' });
    const analise = await realizarPesquisaMercadoProfunda(userId, itens, {
      onLog: (msg, tipo) => send('log', { msg, tipo }),
      perguntaFollowUp, contextoAnterior,
    });
    send('log', { msg: '✅ Análise concluída com sucesso!', tipo: 'success' });
    send('done', analise);
  } catch (e) {
    send('log', { msg: `❌ Erro: ${e.message}`, tipo: 'error' });
    send('error', { error: e.message });
  } finally { res.end(); }
});

router.post('/api/ml/research/market-save', async (req, res) => {
  const { userId, mlbIds, titulo, conteudoHtml, precoMedio } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const saved = await prisma.pesquisaMercadoIA.create({
      data: { usuarioId: parseInt(userId), mlbIds, titulo, conteudoHtml, precoMedio },
    });
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function salvarHistorico(userId, mlbId, urlOriginal, dados, erro) {
  try {
    await prisma.pesquisaHistorico.upsert({
      where: { usuarioId_mlbId: { usuarioId: parseInt(userId), mlbId } },
      update: { urlOriginal: urlOriginal||mlbId, titulo: dados?.titulo||null, thumbnail: dados?.thumbnail||null, preco: dados?.preco||null, dadosJson: dados?JSON.stringify(dados):null, erro: erro||null, status: erro?'erro':'concluido', updatedAt: new Date(), arquivado: false },
      create: { usuarioId: parseInt(userId), mlbId, urlOriginal: urlOriginal||mlbId, titulo: dados?.titulo||null, thumbnail: dados?.thumbnail||null, preco: dados?.preco||null, dadosJson: dados?JSON.stringify(dados):null, erro: erro||null, status: erro?'erro':'concluido', arquivado: false, excluido: false },
    });
  } catch (e) { console.warn('[Research] Histórico:', e.message?.substring(0,50)); }
}

router.put('/api/ml/research/historico/:id/arquivar',      async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:true} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/:id/restaurar',     async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:false} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id',            async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{excluido:true,excluidoEm:new Date()} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => { try { await prisma.pesquisaHistorico.delete({ where:{id:parseInt(req.params.id)} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/lote',           async (req, res) => { const{ids}=req.body; if(!Array.isArray(ids)) return res.status(400).json({error:'ids obrigatório'}); try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{excluido:true,excluidoEm:new Date()}}); res.json({ok:true,count:ids.length}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/lote/arquivar',     async (req, res) => { const{ids}=req.body; if(!Array.isArray(ids)) return res.status(400).json({error:'ids obrigatório'}); try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{arquivado:true}}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });

export default router;