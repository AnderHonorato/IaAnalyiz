// backend/src/routes/mlResearchRoutes.js
// Atualizado: Extração profunda de URLs de Loja Oficial/Página e Vendas Gerais em String. Logs humanizados para o terminal.

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';

const prisma = new PrismaClient();
const router = express.Router();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PAGE_SIZE = 10; 

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

const scraperAgent = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
  },
  maxRedirects: 5,
  decompress: true,
});

async function fetchWithPuppeteer(url, debug) {
  debug.push(`🤖 Acionando Motor Puppeteer (Navegador Real Invisível)...`);
  let browser = null;
  try {
    debug.push(`   → Inicializando Chromium com perfil Stealth Anti-Bot...`);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    debug.push(`   → Acessando URL alvo e gerando impressões digitais (cookies)...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    debug.push(`   → Simulando navegação humana: injetando movimentos de mouse...`);
    await page.mouse.move(Math.random() * 500, Math.random() * 500, { steps: 5 });
    
    debug.push(`   → Analisando tela em busca de firewalls (Cloudflare/WAF)...`);
    const tempoEspera = Math.floor(Math.random() * (2500 - 1200 + 1) + 1200);
    await sleep(tempoEspera);

    debug.push(`   → Bypass concluído. Aguardando a árvore DOM do React renderizar...`);
    await sleep(1000);

    const html = await page.content();
    debug.push(`   → 🌐 HTML renderizado capturado com sucesso: ${(html.length/1024).toFixed(0)}KB.`);
    return html;
  } catch (error) {
    debug.push(`❌ Falha crítica no Puppeteer: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

function mapRep(level) {
  const m = { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' };
  return m[level] || 'novo';
}

function mapTipo(id) {
  const m = { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' };
  return m[id] || id || '—';
}

function extrairAtributos(attrs = []) {
  return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name }));
}

function buildItemLink(id) {
  if (!id) return null;
  const num = String(id).replace(/^MLB/i, '');
  return `http://www.mercadolivre.com.br/p/MLB${num}/s`; 
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
async function getSellerFullCached(sellerId, api) {
  if (!sellerId) return null;
  if (sellerCache.has(sellerId)) return sellerCache.get(sellerId);
  try {
    const sv = await api.get(`/users/${sellerId}`, { timeout: 5000 });
    const s  = sv.data;
    
    // Tratativa para link da Loja/Página
    let permalink = s.permalink;
    if (!permalink && s.nickname) {
       const slug = s.nickname.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
       permalink = `https://www.mercadolivre.com.br/loja/${slug}`;
    }

    const res = {
      nome:      s.nickname || s.first_name || String(sellerId),
      reputacao: mapRep(s.seller_reputation?.level_id),
      vendasNum: s.seller_reputation?.transactions?.completed || 0,
      vendasStr: s.seller_reputation?.transactions?.completed ? `+${s.seller_reputation.transactions.completed} vendas` : '0 vendas',
      permalink: permalink || '#'
    };
    sellerCache.set(sellerId, res);
    return res;
  } catch {
    const fallback = { nome: String(sellerId), reputacao: null, vendasNum: 0, vendasStr: '0 vendas', permalink: '#' };
    sellerCache.set(sellerId, fallback);
    return fallback;
  }
}

async function buscarVendedoresCatalogo(catalogId, api, debug) {
  debug.push(`🏷️  Iniciando extração do Catálogo ID: ${catalogId}`);
  let allVendedores = [];
  const paginasColetadas = [];

  try {
    let offset = 0;
    const limit = 50; 
    let hasMore = true;

    while (hasMore && offset < 1000) {
      debug.push(`📡 API Req (Lote ${Math.floor(offset/50) + 1}): GET /products/${catalogId}/items?limit=${limit}&offset=${offset}`);
      
      const res = await api.get(`/products/${catalogId}/items`, {
        params: { limit, offset, fields: 'id,title,price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,original_price,catalog_product_id' },
        timeout: 12000,
      });
      const results = res.data?.results || [];
      
      if (results.length === 0) {
        hasMore = false;
        break;
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const id   = r.item_id || r.id;
        const sellerData = await getSellerFullCached(r.seller_id, api);
        const descPct = r.original_price && r.price < r.original_price
          ? Math.round((1 - r.price / r.original_price) * 100) : null;
        
        let envioDesc = r.shipping?.logistic_type === 'fulfillment' ? 'Full' : (r.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios');

        const absoluteIndex = offset + i;
        const currPage = Math.floor(absoluteIndex / PAGE_SIZE) + 1;
        const pos = absoluteIndex + 1;

        if (!paginasColetadas.includes(currPage)) paginasColetadas.push(currPage);

        allVendedores.push({
          mlbId: id,
          nome: sellerData?.nome || String(r.seller_id),
          vendasStr: sellerData?.vendasStr,
          vendasNum: sellerData?.vendasNum,
          perfilLoja: sellerData?.permalink,
          preco: r.price || 0,
          precoOriginal: r.original_price || r.price,
          desconto: descPct ? `${descPct}% OFF` : '0% OFF',
          link: buildItemLink(id), // Força padronização
          thumbnail: r.thumbnail,
          titulo: r.title,
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
          freteGratis: r.shipping?.free_shipping === true,
          envio: envioDesc,
          estoque: r.available_quantity,
          vendidos: r.sold_quantity,
          tipoAnuncio: mapTipo(r.listing_type_id),
          pagina: currPage,
          posicao: pos
        });
      }

      if (results.length < limit) hasMore = false;
      else { offset += limit; await sleep(500); }
    }

    if (allVendedores.length > 0) {
      allVendedores.sort((a, b) => a.preco - b.preco);
      debug.push(`✅ ${allVendedores.length} vendedor(es) integrados do Catálogo em ${Math.max(...paginasColetadas)} página(s).`);
      return { vendedores: allVendedores, paginas: paginasColetadas };
    }
  } catch (e) {
    debug.push(`❌ Fallback API /products/items: ${e.message?.substring(0,60)}`);
  }

  // API Search fallback
  try {
    let offset = 0; const limit = 50; let hasMore = true;
    while (hasMore && offset < 1000) {
      const searchRes = await api.get('/sites/MLB/search', { params: { catalog_product_id: catalogId, limit, offset, sort: 'price_asc' }, timeout: 12000 });
      const results = searchRes.data?.results || [];
      if (results.length === 0) break;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const sellerData = await getSellerFullCached(r.seller?.id || r.seller_id, api);
        const descPct = r.original_price && r.price < r.original_price ? Math.round((1 - r.price / r.original_price) * 100) : null;
        let envioDesc = r.shipping?.logistic_type === 'fulfillment' ? 'Full' : (r.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios');
        const absoluteIndex = offset + i; const currPage = Math.floor(absoluteIndex / PAGE_SIZE) + 1; const pos = absoluteIndex + 1;
        if (!paginasColetadas.includes(currPage)) paginasColetadas.push(currPage);

        allVendedores.push({
          mlbId: r.id, nome: sellerData?.nome || String(r.seller?.id || r.seller_id), vendasStr: sellerData?.vendasStr, vendasNum: sellerData?.vendasNum, perfilLoja: sellerData?.permalink,
          preco: r.price || 0, precoOriginal: r.original_price || r.price, desconto: descPct ? `${descPct}% OFF` : '0% OFF',
          link: buildItemLink(r.id), thumbnail: r.thumbnail, titulo: r.title, frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
          freteGratis: r.shipping?.free_shipping === true, envio: envioDesc, estoque: r.available_quantity, vendidos: r.sold_quantity,
          tipoAnuncio: mapTipo(r.listing_type_id), pagina: currPage, posicao: pos
        });
      }
      if (results.length < limit) hasMore = false; else { offset += limit; await sleep(500); }
    }
    if (allVendedores.length > 0) {
      allVendedores.sort((a, b) => a.preco - b.preco);
      debug.push(`✅ ${allVendedores.length} vendedor(es) via Search Geral (${Math.max(...paginasColetadas)} pág).`);
      return { vendedores: allVendedores, paginas: paginasColetadas };
    }
  } catch (e) { debug.push(`❌ Fallback API Search: ${e.message?.substring(0,60)}`); }

  // Scraping Robusto HTTP
  const cleanId = catalogId.replace(/^MLB/i, '');
  const urls = [`https://www.mercadolivre.com.br/noindex/catalog/buybox/MLB${cleanId}`, `https://www.mercadolivre.com.br/p/MLB${cleanId}`];
  
  for (const url of urls) {
    try {
      debug.push(`🌐 Tentando leitura de rede via Axios: ${url}`);
      const res  = await scraperAgent.get(url);
      let html = res.data || '';

      if (html.includes('captcha') || html.includes('Verifica que eres un ser humano') || html.length < 10000) {
          debug.push(`⚠️ Cloudflare WAF bloqueou Axios. Subindo Puppeteer...`);
          html = await fetchWithPuppeteer(url, debug);
      }
      const vendedores = extrairVendedoresDoHTML(html, debug);
      if (vendedores.length) {
        debug.push(`✅ Inteligência localizou ${vendedores.length} vendedor(es) na DOM.`);
        const maxPagina = Math.max(...vendedores.map(v => v.pagina));
        return { vendedores, paginas: Array.from({length: maxPagina}, (_, i) => i + 1) };
      }
    } catch (e) {
      debug.push(`⚠️ Axios bloqueado violentamente (${e.message?.substring(0,40)}).`);
      try {
        const html = await fetchWithPuppeteer(url, debug);
        const vendedores = extrairVendedoresDoHTML(html, debug);
        if (vendedores.length) {
          debug.push(`✅ Extração Puppeteer Finalizou: ${vendedores.length} encontrados.`);
          const maxPagina = Math.max(...vendedores.map(v => v.pagina));
          return { vendedores, paginas: Array.from({length: maxPagina}, (_, i) => i + 1) };
        }
      } catch (errPup) { debug.push(`❌ Puppeteer engine quebrou: ${errPup.message?.substring(0,60)}`); }
    }
  }
  debug.push(`⚠️ Produto ${catalogId} está SEM vendedores (Inativo/Pausado/Sem Estoque).`);
  return { vendedores: [], paginas: [] };
}

function extrairVendedoresDoHTML(html, debug) {
  const vendedores = [];
  
  // Usar JSON pre-loaded do ML prioritariamente
  const jsonMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]{100,}?\});?\s*(?:<\/script>|window\.|var )/);
  if (jsonMatch) {
    try {
      const state = JSON.parse(jsonMatch[1]);
      const options = state?.initialState?.buyingOptions?.options || state?.buyingOptions?.options || [];
      
      if (options.length > 0) {
        options.forEach((o, i) => {
          const nome  = o.seller?.nickname || o.sellerInfo?.nickname || o.sellerNickname || '—';
          const preco = o.price?.amount || o.price?.value || o.salePrice || o.price || 0;
          const original = o.originalPrice || preco;
          const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || '0% OFF');
          
          let vendasStr = '0 vendas';
          let permalink = `https://www.mercadolivre.com.br/loja/${nome.toLowerCase().replace(/ /g, '-')}`;
          
          if (o.sellerInfo?.subtitle) vendasStr = o.sellerInfo.subtitle.replace(/.*\|\s*/i, '').trim();
          if (o.sellerInfo?.permalink) permalink = o.sellerInfo.permalink;
          
          const itemIdMatch = (o.permalink || o.item?.permalink || '').match(/MLB-?(\d+)/i);
          const theId = itemIdMatch ? `MLB${itemIdMatch[1]}` : null;

          if (parseFloat(preco) > 0 || nome !== '—') {
            vendedores.push({
              nome, vendasStr, vendasNum: 0, perfilLoja: permalink,
              preco: parseFloat(preco) || 0, precoOriginal: parseFloat(original),
              link: buildItemLink(theId), desconto: descPct, thumbnail: o.thumbnail || o.item?.thumbnail || null,
              titulo: o.title || o.item?.title || null, freteGratis: o.shipping?.free_shipping === true || o.freeShipping === true,
              frete: o.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: o.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
              pagina: Math.floor(i / PAGE_SIZE) + 1, posicao: i + 1,
              mlbId: theId
            });
          }
        });
        return vendedores;
      }
    } catch (err) {}
  }

  // Fallback para Regex direta no HTML 
  const blocks = html.split(/<form class="ui-pdp-buybox/i);
  if (blocks.length > 1) {
     for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        
        let nome = '—'; let linkLoja = ''; let vendasStr = '0 vendas';
        const sellerMatch = b.match(/href="([^"]+(?:loja|pagina|perfil)[^"]+)"[^>]*><span>([^<]+)<\/span><\/a>/i);
        if (sellerMatch) { linkLoja = sellerMatch[1]; nome = sellerMatch[2].trim(); }
        
        const vendasMatch = b.match(/ui-pdp-seller__header__subtitle[^>]*>.*?((?:\+[\d.,mk]+|[\d.,mk]+)\s*vendas)<\/span>/i);
        if (vendasMatch) vendasStr = vendasMatch[1].trim();

        let preco = 0; let precoOrig = 0;
        const priceMatch = b.match(/<span class="andes-money-amount__fraction"[^>]*>([\d.,]+)<\/span>/g);
        if (priceMatch && priceMatch.length > 0) {
           const cleanP = val => parseFloat(val.replace(/[^\d.,]/g,'').replace('.','').replace(',','.'));
           if (priceMatch.length > 1) { precoOrig = cleanP(priceMatch[0]); preco = cleanP(priceMatch[1]); }
           else { preco = cleanP(priceMatch[0]); precoOrig = preco; }
        }

        let linkAnuncio = '';
        const inputItem = b.match(/<input type="hidden" name="item_id" value="([^"]+)"/i);
        if (inputItem) linkAnuncio = buildItemLink(inputItem[1]);

        if (preco > 0 || nome !== '—') {
            vendedores.push({
               nome, vendasStr, vendasNum: 0, perfilLoja: linkLoja || `https://www.mercadolivre.com.br/loja/${nome.toLowerCase().replace(/ /g, '-')}`,
               preco, precoOriginal: precoOrig, link: linkAnuncio,
               desconto: (precoOrig > preco) ? `${Math.round((1 - preco/precoOrig)*100)}% OFF` : '0% OFF',
               freteGratis: b.includes('grátis'), frete: b.includes('grátis') ? 'Grátis' : 'Pago', envio: b.includes('grátis') ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
               pagina: Math.floor((i-1) / PAGE_SIZE) + 1, posicao: i, mlbId: inputItem ? inputItem[1] : null
            });
        }
     }
     return vendedores;
  }
  return [];
}

async function buscarItem(mlbId, url, api, debug) {
  debug.push(`🔍 Lendo dados mestre do ID Origem: /items/${mlbId}...`);
  const itemRes = await api.get(`/items/${mlbId}`, {
    params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,catalog_listing,catalog_product_id,condition,status,warranty,attributes,pictures,reviews' },
    timeout: 12000,
  });
  const it = itemRes.data;
  debug.push(`   → Título Encontrado: ${it.title?.substring(0,60)}`);
  
  const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);
  const seller = await getSellerFullCached(it.seller_id, api);
  let concorrentes = [];
  let paginasColetadas = [1];

  if (ehCatalogo) {
    const catalogId = it.catalog_product_id || mlbId;
    debug.push(`📦 [Produto de Catálogo] Mapeando todas as opções do mercado...`);
    const catalogoData = await buscarVendedoresCatalogo(catalogId, api, debug);
    concorrentes = catalogoData.vendedores;
    paginasColetadas = catalogoData.paginas;

    if (concorrentes.length === 0) debug.push(`⚠️ Nenhum concorrente ativo no Catálogo (Anúncio fantasma).`);
  } else {
    debug.push(`🏪 [Anúncio Clássico] Rodando IA para encontrar similares via Search...`);
    try {
      const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
      let offset = 0; const limit = 50; let hasMore = true;

      while (hasMore && offset < 150) {
        const searchRes = await api.get('/sites/MLB/search', { params: { category: it.category_id, q: titulo, limit, offset, sort: 'price_asc' }, timeout: 10000 });
        const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId);
        
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const sellerData = await getSellerFullCached(r.seller?.id || r.seller_id, api);
          const absoluteIndex = offset + i; const currPage = Math.floor(absoluteIndex / PAGE_SIZE) + 1; const pos = absoluteIndex + 1;
          if (!paginasColetadas.includes(currPage)) paginasColetadas.push(currPage);

          concorrentes.push({
            mlbId: r.id, nome: sellerData.nome, vendasStr: sellerData.vendasStr, vendasNum: sellerData.vendasNum, perfilLoja: sellerData.permalink,
            preco: r.price || 0, precoOriginal: r.original_price || r.price, desconto: '0% OFF', link: buildItemLink(r.id),
            thumbnail: r.thumbnail, titulo: r.title, frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
            freteGratis: r.shipping?.free_shipping === true, envio: r.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
            estoque: r.available_quantity, vendidos: r.sold_quantity, tipoAnuncio: mapTipo(r.listing_type_id),
            pagina: currPage, posicao: pos
          });
        }
        if (results.length < limit) hasMore = false; else { offset += limit; await sleep(600); }
      }
    } catch (e) { debug.push(`❌ Erro no algoritmo de similares: ${e.message}`); }
  }

  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a,b)=>a-b);
  const precoMin  = allPrecos[0] ?? it.price;
  const precoMax  = allPrecos[allPrecos.length-1] ?? it.price;
  const precoMed  = allPrecos.length ? Math.round(allPrecos.reduce((s,v)=>s+v,0)/allPrecos.length*100)/100 : it.price;

  // Extrair Variações
  const variacoes = (it.attributes || []).filter(a => ['COLOR', 'VOLTAGE', 'FREQUENCY', 'POWER', 'SIZE', 'GEAR_SIZE'].includes(a.id)).map(a => ({ nome: a.name, valor: a.value_name }));

  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || it.price,
    status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
    vendasStr: seller?.vendasStr || '0 vendas', vendasNum: seller?.vendasNum || 0,
    condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: buildItemLink(mlbId), freteGratis: it.shipping?.free_shipping === true,
    frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: it.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
    avaliacoes: it.reviews?.rating_average ? it.reviews.rating_average.toFixed(1) : null,
    atributos: extrairAtributos(it.attributes || []), variacoes, pictures: (it.pictures || []).map(p => p.secure_url || p.url),
    seller, concorrentes, totalVendedores: ehCatalogo ? concorrentes.length : concorrentes.length + (seller ? 1 : 0), 
    precoMin, precoMax, precoMedio: precoMed, ehCatalogo, catalogProductId: it.catalog_product_id || null, 
    fonte: 'items', paginasColetadas, analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1
  };
}

async function buscarViaProducts(mlbId, api, debug) {
  debug.push(`🔍 Analisando produto isolado via /products/${mlbId}...`);
  const res = await api.get(`/products/${mlbId}`, { timeout: 12000 });
  const p   = res.data;
  const catalogoData = await buscarVendedoresCatalogo(mlbId, api, debug);
  const concorrentes = catalogoData.vendedores;
  const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
  const preco  = p.buy_box_winner?.price || p.price || (precos[0] ?? 0);
  if (!precos.includes(preco) && preco > 0) precos.unshift(preco);
  precos.sort((a,b)=>a-b);
  
  let seller = null;
  if (p.buy_box_winner?.seller_id) seller = await getSellerFullCached(p.buy_box_winner.seller_id, api);
  else if (concorrentes.length) seller = { nome: concorrentes[0].nome, reputacao: null, vendasStr: concorrentes[0].vendasStr, vendasNum: concorrentes[0].vendasNum, permalink: concorrentes[0].perfilLoja };

  const variacoes = (p.attributes || []).filter(a => ['COLOR', 'VOLTAGE', 'FREQUENCY', 'POWER'].includes(a.id)).map(a => ({ nome: a.name, valor: a.value_name }));

  return {
    mlbId, titulo: p.name || p.title, preco, precoOriginal: preco, status: 'active', estoque: null, vendidos: null,
    vendasStr: seller?.vendasStr || '0 vendas', vendasNum: seller?.vendasNum || 0, condicao: 'Novo', tipoAnuncio: 'Catálogo', thumbnail: p.pictures?.[0]?.url || concorrentes[0]?.thumbnail || null,
    link: buildItemLink(mlbId), freteGratis: concorrentes[0]?.freteGratis ?? false, frete: concorrentes[0]?.frete || '—', envio: concorrentes[0]?.envio || 'Mercado Envios',
    avaliacoes: p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
    atributos: (p.attributes || []).filter(a=>a.value_name).slice(0,14).map(a=>({nome:a.name,valor:a.value_name})),
    variacoes, pictures: (p.pictures || []).map(pic => pic.secure_url || pic.url),
    seller, concorrentes, totalVendedores: concorrentes.length,
    precoMin: precos[0] ?? preco, precoMax: precos[precos.length-1] ?? preco, precoMedio: precos.length ? Math.round(precos.reduce((s,v)=>s+v,0)/precos.length*100)/100 : preco,
    ehCatalogo: true, catalogProductId: mlbId, fonte: 'products', paginasColetadas: catalogoData.paginas, 
    analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1
  };
}

async function buscarViaScraping(url, mlbId, debug) {
  const targetUrl = url.startsWith('http') ? url : buildItemLink(mlbId);
  debug.push(`🌐 Modo Extremo (Scraping): ${targetUrl}`);
  let html = '';
  try {
    const res  = await scraperAgent.get(targetUrl);
    html = res.data || '';
    if (html.includes('captcha') || html.includes('Verifica que eres un ser humano') || html.length < 10000) {
        html = await fetchWithPuppeteer(targetUrl, debug);
    }
  } catch(e) { html = await fetchWithPuppeteer(targetUrl, debug); }

  let titulo = null, preco = null, thumbnail = null;
  const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const ld  = JSON.parse(ldMatch[1]);
      titulo    = ld.name || ld.title || null;
      preco     = ld.offers?.price ? parseFloat(ld.offers.price) : null;
      thumbnail = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
    } catch {}
  }
  if (!titulo) { const og = html.match(/<meta property="og:title" content="([^"]+)"/i); if (og) titulo = og[1]; }
  if (!preco) { const pm = html.match(/"price"\s*:\s*([\d.]+)/); if (pm) preco = parseFloat(pm[1]); }
  if (!titulo) throw new Error('Falha total na captura de dados da página');

  const vendedores = extrairVendedoresDoHTML(html, debug);
  const maxPagina = vendedores.length > 0 ? Math.max(...vendedores.map(v => v.pagina)) : 1;
  const tags = Array.from({length: maxPagina}, (_, i) => i + 1);

  return {
    mlbId, titulo, preco: preco || 0, precoOriginal: preco || 0, status: 'active', estoque: null, vendidos: null, 
    vendasStr: vendedores[0]?.vendasStr || '0 vendas', vendasNum: vendedores[0]?.vendasNum || 0,
    condicao: 'Novo', tipoAnuncio: 'Catálogo', thumbnail, link: buildItemLink(mlbId), freteGratis: false, frete: '—', envio: 'Mercado Envios', avaliacoes: null, atributos: [], variacoes: [], pictures: [thumbnail].filter(Boolean),
    seller: vendedores.length ? { nome: vendedores[0].nome, reputacao: null, vendasStr: vendedores[0].vendasStr, vendasNum: vendedores[0].vendasNum, permalink: vendedores[0].perfilLoja } : null,
    concorrentes: vendedores.slice(1), totalVendedores: vendedores.length,
    precoMin: preco || 0, precoMax: preco || 0, precoMedio: preco || 0,
    ehCatalogo: true, fonte: 'scraping', paginasColetadas: tags, analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1
  };
}

// ── CRUD ROUTES ───────────────────────────────────────────────────────────────
router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const itens = await prisma.pesquisaHistorico.findMany({ where: { usuarioId: parseInt(userId), excluido: false, arquivado: arquivado === 'true' }, orderBy: { updatedAt: 'desc' }, take: 200 });
    res.json(itens.map(i => ({ ...i, dadosJson: i.dadosJson ? JSON.parse(i.dadosJson) : null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/ml/research/market-analyses', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const analises = await prisma.pesquisaMercadoIA.findMany({ where: { usuarioId: parseInt(userId) }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(analises);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/ml/research/market-analyses/:id', async (req, res) => {
  try { await prisma.pesquisaMercadoIA.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  const { userId, urlOriginal } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  const debug = [`🚀 Motor IA conectando-se ao ID: ${mlbId}`];
  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message, debug }); }
  const todosIds = [mlbId];
  if (urlOriginal) {
    for (const id of extrairTodosMLBs(decodeURIComponent(urlOriginal))) {
      if (!todosIds.includes(id)) todosIds.push(id);
    }
  }
  for (const id of todosIds) {
    try {
      const dados = await buscarItem(id, urlOriginal, api, debug);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json({ ...dados, debug });
    } catch (eA) { debug.push(`⚠️  Falha /items: ${eA.message?.substring(0,60)}`); }
    try {
      const dados = await buscarViaProducts(id, api, debug);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json({ ...dados, debug });
    } catch (eB) { debug.push(`⚠️  Falha /products: ${eB.message?.substring(0,60)}`); }
  }
  if (urlOriginal) {
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId, debug);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json({ ...dados, debug });
    } catch (eC) { debug.push(`❌ Engine Scraping Crash: ${eC.message?.substring(0,60)}`); }
  }
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

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    send('log', { msg: '🚀 Iniciando Pesquisa de Inteligência de Mercado...', tipo: 'info' });
    const analise = await realizarPesquisaMercadoProfunda(userId, itens, { onLog: (msg, tipo) => send('log', { msg, tipo }), perguntaFollowUp, contextoAnterior });
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
    const saved = await prisma.pesquisaMercadoIA.create({ data: { usuarioId: parseInt(userId), mlbIds, titulo, conteudoHtml, precoMedio } });
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
  } catch (e) {}
}

router.put('/api/ml/research/historico/:id/arquivar',      async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:true} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/:id/restaurar',     async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:false} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id',            async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{excluido:true,excluidoEm:new Date()} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => { try { await prisma.pesquisaHistorico.delete({ where:{id:parseInt(req.params.id)} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/lote',           async (req, res) => { const{ids}=req.body; try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{excluido:true,excluidoEm:new Date()}}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/lote/arquivar',     async (req, res) => { const{ids}=req.body; try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{arquivado:true}}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });

export default router;