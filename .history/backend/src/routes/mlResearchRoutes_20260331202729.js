// backend/src/routes/mlResearchRoutes.js
import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAPTURES_DIR = path.join(__dirname, '../../capturas');

if (!fs.existsSync(CAPTURES_DIR)){
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

function salvarCaptura(mlbId, pagina, conteudo, debug) {
    try {
        const filepath = path.join(CAPTURES_DIR, `${mlbId}_pag_${pagina}.html`);
        fs.writeFileSync(filepath, conteudo, 'utf8');
        debug.push(`  💾 HTML de erro capturado para auditoria`);
    } catch (e) {}
}

const createLogger = (res) => {
    const logs = [];
    return {
        push: (msg) => {
            logs.push(msg);
            res.write(`data: ${JSON.stringify({msg})}\n\n`);
        },
        getAll: () => logs
    };
};

puppeteer.use(StealthPlugin());

const prisma = new PrismaClient();
const router = express.Router();

async function getMlApi(userId) {
  const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!token) throw new Error('Conta ML não conectada');
  if (new Date() >= new Date(token.expiresAt)) throw new Error('Token ML expirado — reconecte');
  return axios.create({
    baseURL: 'https://api.mercadolibre.com',
    headers: { Authorization: `Bearer ${token.accessToken}` },
    timeout: 15000,
  });
}

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

function getNextUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]; }
function humanDelay(minMs = 800, maxMs = 2500) { return new Promise(r => setTimeout(r, minMs + Math.random() * (maxMs - minMs))); }

function mapRep(level) {
  const m = { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' };
  return m[level] || 'novo';
}
function mapTipo(id) {
  const m = { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' };
  return m[id] || id || 'Clássico';
}
function formatarVendas(soldQuantity) {
  if (!soldQuantity) return '+100 vendas';
  if (soldQuantity >= 50000) return '+50mil vendas';
  if (soldQuantity >= 10000) return '+10mil vendas';
  if (soldQuantity >= 5000)  return '+5mil vendas';
  if (soldQuantity >= 1000)  return '+1000 vendas';
  if (soldQuantity >= 500)   return '+500 vendas';
  if (soldQuantity >= 100)   return '+100 vendas';
  if (soldQuantity >= 50)    return '+50 vendas';
  return `+${soldQuantity} vendas`;
}
function extrairAtributos(attrs = []) { return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name })); }
function buildItemLink(id, permalink) {
  if (permalink) return permalink;
  if (!id) return null;
  return `https://produto.mercadolivre.com.br/MLB-${String(id).replace(/^MLB/i, '')}-_JM`;
}

const sellerCache = new Map();
async function getSellerName(sellerId, api) {
  if (!sellerId) return '—';
  if (sellerCache.has(sellerId)) return sellerCache.get(sellerId);
  try {
    const sv = await api.get(`/users/${sellerId}`, { timeout: 5000 });
    const nome = sv.data.nickname || sv.data.first_name || String(sellerId);
    sellerCache.set(sellerId, nome);
    return nome;
  } catch { return String(sellerId); }
}
async function getSellerFull(sellerId, api) {
  if (!sellerId) return null;
  try {
    const sv = await api.get(`/users/${sellerId}`, { timeout: 5000 });
    const s  = sv.data;
    return { nome: s.nickname || s.first_name || String(sellerId), reputacao: mapRep(s.seller_reputation?.level_id), vendas: s.seller_reputation?.transactions?.completed || 0 };
  } catch { return { nome: String(sellerId), reputacao: null, vendas: null }; }
}

// ============================================================================
// ESTRATÉGIA 1: API OFICIAL (Bypass garantido, Rápido e Paginado)
// ============================================================================
async function buscarVendedoresCatalogoAPI(catalogId, api, debug) {
  debug.push(`🏷️ Catálogo ID: ${catalogId}`);
  let todosVendedores = [];
  
  // TENTATIVA 1: Rota /products/items (Traz variações específicas)
  let offset = 0;
  let temMais = true;
  let usouRotaItems = false;
  
  while (temMais && offset <= 250) {
      try {
          debug.push(`📡 API: GET /products/${catalogId}/items?offset=${offset}`);
          const res = await api.get(`/products/${catalogId}/items`, {
              params: { limit: 50, offset, fields: 'id,title,price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,original_price,catalog_product_id' }
          });
          const results = res.data?.results || [];
          if (results.length > 0) {
              usouRotaItems = true;
              for (const r of results) {
                  const nome = await getSellerName(r.seller_id, api);
                  const descPct = r.original_price && r.price < r.original_price ? Math.round((1 - r.price / r.original_price) * 100) : null;
                  todosVendedores.push({
                      mlbId: r.item_id || r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
                      desconto: descPct ? `${descPct}% OFF` : null, link: buildItemLink(r.item_id || r.id, r.permalink),
                      thumbnail: r.thumbnail, titulo: r.title, frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
                      freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
                      vendidos: r.sold_quantity, vendas: formatarVendas(r.sold_quantity), tipoAnuncio: mapTipo(r.listing_type_id),
                      pagina: Math.floor(offset / 50) + 1
                  });
              }
              offset += 50;
              if (results.length < 50) temMais = false;
          } else { temMais = false; }
      } catch (e) { temMais = false; }
  }

  if (todosVendedores.length > 0) {
      todosVendedores.sort((a,b) => a.preco - b.preco);
      todosVendedores.forEach((v, i) => v.posicao = i + 1);
      debug.push(`✅ ${todosVendedores.length} opções mapeadas via API Oficial do ML!`);
      return todosVendedores;
  }

  // TENTATIVA 2: Rota Search com catalog_product_id
  offset = 0;
  temMais = true;
  while (temMais && offset <= 250) {
      try {
          debug.push(`📡 API Search: catalog_product_id=${catalogId} (offset ${offset})`);
          const res = await api.get('/sites/MLB/search', {
              params: { catalog_product_id: catalogId, limit: 50, offset, sort: 'price_asc' }
          });
          const results = res.data?.results || [];
          if (results.length > 0) {
              for (const r of results) {
                  const nome = await getSellerName(r.seller?.id || r.seller_id, api);
                  const descPct = r.original_price && r.price < r.original_price ? Math.round((1 - r.price / r.original_price) * 100) : null;
                  todosVendedores.push({
                      mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
                      desconto: descPct ? `${descPct}% OFF` : null, link: buildItemLink(r.id, r.permalink),
                      thumbnail: r.thumbnail, titulo: r.title, frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
                      freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
                      vendidos: r.sold_quantity, vendas: formatarVendas(r.sold_quantity), tipoAnuncio: mapTipo(r.listing_type_id),
                      pagina: Math.floor(offset / 50) + 1
                  });
              }
              offset += 50;
              if (results.length < 50) temMais = false;
          } else { temMais = false; }
      } catch (e) { temMais = false; }
  }

  if (todosVendedores.length > 0) {
      todosVendedores.sort((a,b) => a.preco - b.preco);
      todosVendedores.forEach((v, i) => v.posicao = i + 1);
      debug.push(`✅ ${todosVendedores.length} opções mapeadas via API Search!`);
      return todosVendedores;
  }

  return [];
}

// ============================================================================
// RESOLVEDORES DE PRODUTOS E ITEMS
// ============================================================================

async function buscarItem(mlbId, api, debug) {
  debug.push(`🔍 Lendo /items/${mlbId}...`);
  const itemRes = await api.get(`/items/${mlbId}`, {
    params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,catalog_listing,catalog_product_id,condition,status,warranty,attributes' }
  });
  const it = itemRes.data;
  debug.push(`   → Título: ${it.title?.substring(0,50)}`);
  
  const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);
  const seller = await getSellerFull(it.seller_id, api);
  let concorrentes = [];
  
  if (ehCatalogo) {
    const catalogId = it.catalog_product_id || mlbId;
    debug.push(`📦 Catálogo detectado. Direcionando para paginação de opções...`);
    concorrentes = await buscarVendedoresCatalogoAPI(catalogId, api, debug);
  } else {
    try {
      const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
      const searchRes = await api.get('/sites/MLB/search', { params: { category: it.category_id, q: titulo, limit: 15, sort: 'price_asc' }});
      const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 10);
      for (const r of results) {
        const nome = await getSellerName(r.seller?.id || r.seller_id, api);
        concorrentes.push({
          mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
          link: buildItemLink(r.id, r.permalink), thumbnail: r.thumbnail, titulo: r.title,
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago', freteGratis: r.shipping?.free_shipping === true,
          estoque: r.available_quantity, vendas: formatarVendas(r.sold_quantity), tipoAnuncio: mapTipo(r.listing_type_id),
        });
      }
      concorrentes.sort((a, b) => a.preco - b.preco);
    } catch (e) {}
  }
  
  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a,b)=>a-b);
  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null, status: it.status, estoque: it.available_quantity,
    condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id), thumbnail: it.thumbnail, link: it.permalink, 
    freteGratis: it.shipping?.free_shipping === true, frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago',
    atributos: extrairAtributos(it.attributes || []), seller, concorrentes, totalVendedores: concorrentes.length + (seller ? 1 : 0), 
    precoMin: allPrecos[0] ?? it.price, precoMax: allPrecos[allPrecos.length-1] ?? it.price, precoMedio: allPrecos.length ? Math.round(allPrecos.reduce((s,v)=>s+v,0)/allPrecos.length*100)/100 : it.price,
    ehCatalogo, catalogProductId: it.catalog_product_id || null, fonte: 'api_items', analisadoEm: new Date().toISOString()
  };
}

async function buscarViaProducts(mlbId, api, debug) {
  debug.push(`🔍 Tentando /products/${mlbId}...`);
  const res = await api.get(`/products/${mlbId}`);
  const p   = res.data;
  const concorrentes = await buscarVendedoresCatalogoAPI(mlbId, api, debug);
  const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
  const preco  = p.buy_box_winner?.price || p.price || (precos[0] ?? 0);
  if (!precos.includes(preco) && preco > 0) precos.unshift(preco);
  precos.sort((a,b)=>a-b);
  let seller = p.buy_box_winner?.seller_id ? await getSellerFull(p.buy_box_winner.seller_id, api) : (concorrentes.length ? { nome: concorrentes[0].nome, reputacao: null, vendas: null } : null);
  
  return {
    mlbId, titulo: p.name || p.title, preco, status: 'active', estoque: null, condicao: 'Novo', tipoAnuncio: 'Catálogo', 
    thumbnail: p.pictures?.[0]?.url || concorrentes[0]?.thumbnail || null, link: `https://www.mercadolivre.com.br/p/${mlbId}`,
    freteGratis: concorrentes[0]?.freteGratis ?? false, frete: concorrentes[0]?.frete || '—',
    atributos: (p.attributes || []).filter(a=>a.value_name).slice(0,14).map(a=>({nome:a.name,valor:a.value_name})),
    seller, concorrentes, totalVendedores: concorrentes.length || 1, precoMin: precos[0] ?? preco, precoMax: precos[precos.length-1] ?? preco,
    precoMedio: precos.length ? Math.round(precos.reduce((s,v)=>s+v,0)/precos.length*100)/100 : preco,
    ehCatalogo: true, catalogProductId: mlbId, fonte: 'api_products', analisadoEm: new Date().toISOString()
  };
}

// ----------------------------------------------------------------------------
// ESTRATÉGIA 3: SCRAPING HTML & PUPPETEER (Último Recurso)
// ----------------------------------------------------------------------------
async function buscarViaScraping(url, mlbId, debug) {
  const targetUrl = url.startsWith('http') ? url : `https://www.mercadolivre.com.br/p/${mlbId}`;
  let html = '';
  
  debug.push(`🌐 Tentando Extração Direta (Sem Login)...`);
  const scraper = axios.create({ timeout: 15000, headers: { 'User-Agent': getNextUA(), 'Accept-Language': 'pt-BR,pt;q=0.9', 'Cache-Control': 'no-cache' } });
  try { html = (await scraper.get(targetUrl)).data || ''; } catch(e) {}

  if (!html || html.includes('auth-login-frontend') || html.includes('suspicious')) {
    debug.push(`🤖 HTML Bloqueado. Iniciando Aquecimento Puppeteer...`);
    let browser;
    try {
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1366,768'] });
      const page = await browser.newPage();
      await page.setUserAgent(getNextUA());
      
      // Warm-up na home
      await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await simularHumano(page, debug);
      
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await simularHumano(page, debug);
      html = await page.content();
      await browser.close();
    } catch(e) { if(browser) await browser.close(); }
  }

  if (html.includes('auth-login-frontend')) salvarCaptura(mlbId, 'erro_html', html, debug);

  // Extrai Título e Preço Base
  let titulo = null, preco = null, thumbnail = null;
  const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) { try { const ld = JSON.parse(ldMatch[1]); titulo = ld.name || ld.title; preco = ld.offers?.price ? parseFloat(ld.offers.price) : null; thumbnail = Array.isArray(ld.image) ? ld.image[0] : ld.image; } catch {} }
  if (!titulo) { const og = html.match(/<meta property="og:title" content="([^"]+)"/i); if(og) titulo = og[1]; }
  if (!preco) { const pm = html.match(/"price"\s*:\s*([\d.]+)/); if(pm) preco = parseFloat(pm[1]); }
  if (!titulo) throw new Error('Falha total na extração. Anúncio não localizado ou bloqueio severo.');

  // Extrai o Array V5 Agressivo
  const vendedores = [];
  const sellerRegex = /"nickname"\s*:\s*"([^"]{2,50})"/g;
  const priceRegex  = /"amount"\s*:\s*([\d.]+)/g;
  const names  = [...new Set([...html.matchAll(sellerRegex)].map(m => m[1]))].slice(0, 15);
  const prices = [...html.matchAll(priceRegex)].map(m => parseFloat(m[1])).filter(v => v > 0).slice(0, 15);
  
  if (names.length) {
    names.forEach((nome, i) => vendedores.push({ nome, preco: prices[i] || 0, link: targetUrl, frete: 'Mercado Envios', tipoAnuncio: 'Clássico', vendas: '+100 vendas', pagina: 1, posicao: i + 1 }));
    debug.push(`  🔍 REGEX v5: ${vendedores.length} vendedores salvos.`);
  }

  return {
    mlbId, titulo, preco: preco || 0, status: 'active', tipoAnuncio: 'Catálogo', thumbnail, link: targetUrl, frete: 'Pago',
    seller: vendedores.length ? { nome: vendedores[0].nome } : null,
    concorrentes: vendedores.slice(1), totalVendedores: vendedores.length || 1,
    precoMin: preco || 0, precoMax: preco || 0, precoMedio: preco || 0,
    ehCatalogo: true, fonte: 'scraping_fallback', analisadoEm: new Date().toISOString(),
  };
}


// ============================================================================
// ROTAS REST COM SERVER-SENT EVENTS (SSE) PARA LOGS AO VIVO
// ============================================================================

router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  try {
    const itens = await prisma.pesquisaHistorico.findMany({ where: { usuarioId: parseInt(userId), excluido: false, arquivado: arquivado === 'true' }, orderBy: { updatedAt: 'desc' }, take: 200 });
    res.json(itens.map(i => ({ ...i, dadosJson: i.dadosJson ? JSON.parse(i.dadosJson) : null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/ml/research/market-analyses', async (req, res) => {
  const { userId } = req.query;
  try {
    res.json(await prisma.pesquisaMercadoIA.findMany({ where: { usuarioId: parseInt(userId) }, orderBy: { createdAt: 'desc' }, take: 50 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/ml/research/market-analyses/:id', async (req, res) => {
  await prisma.pesquisaMercadoIA.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true });
});

// A ROTA MÁGICA: Retorna Logs em Tempo Real
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId } = req.params;
  let { userId, urlOriginal } = req.query;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const logger = createLogger(res);
  
  if (urlOriginal) {
      try { 
        urlOriginal = decodeURIComponent(urlOriginal);
        if (urlOriginal.includes('%')) urlOriginal = decodeURIComponent(urlOriginal); 
      } catch (e) {}
  }

  logger.push(`🚀 Iniciando análise de ${mlbId}`);
  let api;
  try { api = (await getMlApi(userId)).api; }
  catch (e) { 
      res.write(`data: ${JSON.stringify({error: e.message})}\n\n`); 
      return res.end(); 
  }
  
  let dadosFinais = null;

  try { dadosFinais = await buscarItem(mlbId, api, logger); } 
  catch (eA) { logger.push(`⚠️ /items/${mlbId}: ${eA.response?.status || eA.message}`); }

  if (!dadosFinais || !dadosFinais.titulo) {
      try { dadosFinais = await buscarViaProducts(mlbId, api, logger); } 
      catch (eB) { logger.push(`⚠️ /products/${mlbId}: ${eB.response?.status || eB.message}`); }
  }

  if ((!dadosFinais || !dadosFinais.titulo) && urlOriginal) {
      try { dadosFinais = await buscarViaScraping(urlOriginal, mlbId, logger); } 
      catch (eC) { logger.push(`❌ Scraping: ${eC.message}`); }
  }

  if (dadosFinais && dadosFinais.titulo) {
      dadosFinais.debug = logger.getAll();
      await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dadosFinais, null);
      res.write(`data: ${JSON.stringify({done: true, data: dadosFinais})}\n\n`);
  } else {
      logger.push(`❌ Todas as estratégias falharam para ${mlbId}`);
      await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, logger.getAll().join(' | '));
      res.write(`data: ${JSON.stringify({error: 'Anúncio não encontrado'})}\n\n`);
  }
  res.end();
});

router.post('/api/ml/research/deep-market', async (req, res) => {
  const { userId, itens, perguntaFollowUp, contextoAnterior } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    send('log', { msg: '🚀 Iniciando Pesquisa de Mercado...', tipo: 'info' });
    const analise = await realizarPesquisaMercadoProfunda(userId, itens, { onLog: (msg, tipo) => send('log', { msg, tipo }), perguntaFollowUp, contextoAnterior });
    send('done', analise);
  } catch (e) {
    send('error', { error: e.message });
  } finally { res.end(); }
});

router.post('/api/ml/research/market-save', async (req, res) => {
  const { userId, mlbIds, titulo, conteudoHtml, precoMedio } = req.body;
  res.json(await prisma.pesquisaMercadoIA.create({ data: { usuarioId: parseInt(userId), mlbIds, titulo, conteudoHtml, precoMedio } }));
});

async function salvarHistorico(userId, mlbId, urlOriginal, dados, erro) {
  try { await prisma.pesquisaHistorico.upsert({ where: { usuarioId_mlbId: { usuarioId: parseInt(userId), mlbId } }, update: { urlOriginal: urlOriginal||mlbId, titulo: dados?.titulo||null, thumbnail: dados?.thumbnail||null, preco: dados?.preco||null, dadosJson: dados?JSON.stringify(dados):null, erro: erro||null, status: erro?'erro':'concluido', updatedAt: new Date(), arquivado: false }, create: { usuarioId: parseInt(userId), mlbId, urlOriginal: urlOriginal||mlbId, titulo: dados?.titulo||null, thumbnail: dados?.thumbnail||null, preco: dados?.preco||null, dadosJson: dados?JSON.stringify(dados):null, erro: erro||null, status: erro?'erro':'concluido', arquivado: false, excluido: false } }); } catch (e) {}
}

router.put('/api/ml/research/historico/:id/arquivar', async (req, res) => { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:true} }); res.json({ok:true}); });
router.put('/api/ml/research/historico/:id/restaurar', async (req, res) => { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:false} }); res.json({ok:true}); });
router.delete('/api/ml/research/historico/:id', async (req, res) => { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{excluido:true,excluidoEm:new Date()} }); res.json({ok:true}); });
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => { await prisma.pesquisaHistorico.delete({ where:{id:parseInt(req.params.id)} }); res.json({ok:true}); });
router.delete('/api/ml/research/historico/lote', async (req, res) => { await prisma.pesquisaHistorico.updateMany({where:{id:{in:req.body.ids.map(Number)}},data:{excluido:true,excluidoEm:new Date()}}); res.json({ok:true}); });
router.put('/api/ml/research/historico/lote/arquivar', async (req, res) => { await prisma.pesquisaHistorico.updateMany({where:{id:{in:req.body.ids.map(Number)}},data:{arquivado:true}}); res.json({ok:true}); });

export default router;