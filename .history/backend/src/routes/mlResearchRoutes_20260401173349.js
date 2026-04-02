// backend/src/routes/mlResearchRoutes.js — v9
// Correção: Retorno exato de 0 vendedores quando o anúncio está inativo/sem estoque (removido fallback forçado de 1 vendedor).

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';

const prisma = new PrismaClient();
const router = express.Router();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PAGE_SIZE = 10; // Agrupamento visual fixo do ML para simular as páginas corretamente

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
  debug.push(`🤖 Acionando Puppeteer (Navegador Real) para contornar bloqueio...`);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    const tempoEspera = Math.floor(Math.random() * (3500 - 1500 + 1) + 1500);
    debug.push(`   → Aguardando ${tempoEspera}ms (simulação humana)...`);
    await sleep(tempoEspera);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    debug.push(`   → HTML capturado via Puppeteer: ${(html.length/1024).toFixed(0)}KB`);
    return html;
  } catch (error) {
    debug.push(`❌ Erro no Puppeteer: ${error.message}`);
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
async function getSellerFullCached(sellerId, api) {
  if (!sellerId) return null;
  if (sellerCache.has(sellerId)) return sellerCache.get(sellerId);
  try {
    const sv = await api.get(`/users/${sellerId}`, { timeout: 5000 });
    const s  = sv.data;
    const res = {
      nome:      s.nickname || s.first_name || String(sellerId),
      reputacao: mapRep(s.seller_reputation?.level_id),
      vendas:    s.seller_reputation?.transactions?.completed || 0,
    };
    sellerCache.set(sellerId, res);
    return res;
  } catch {
    const fallback = { nome: String(sellerId), reputacao: null, vendas: 0 };
    sellerCache.set(sellerId, fallback);
    return fallback;
  }
}

async function buscarVendedoresCatalogo(catalogId, api, debug) {
  debug.push(`🏷️  Catálogo ID: ${catalogId}`);
  let allVendedores = [];
  const paginasColetadas = [];

  try {
    let offset = 0;
    const limit = 50; 
    let hasMore = true;

    while (hasMore && offset < 1000) {
      debug.push(`📡 API (Lote ${offset/50 + 1}): GET /products/${catalogId}/items?limit=${limit}&offset=${offset}`);
      
      const res = await api.get(`/products/${catalogId}/items`, {
        params: { limit, offset, fields: 'id,title,price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,original_price,catalog_product_id' },
        timeout: 12000,
      });
      const results = res.data?.results || [];
      
      debug.push(`   → ${results.length} vendedor(es) retornado(s) na requisição.`);
      
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

        if (!paginasColetadas.includes(currPage)) {
          paginasColetadas.push(currPage);
        }

        allVendedores.push({
          mlbId: id,
          nome: sellerData?.nome || String(r.seller_id),
          vendas: sellerData?.vendas || 0,
          preco: r.price || 0,
          precoOriginal: r.original_price || r.price,
          desconto: descPct ? `${descPct}% OFF` : '0% OFF',
          link: buildItemLink(id, r.permalink),
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

      if (results.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        await sleep(500); 
      }
    }

    if (allVendedores.length > 0) {
      allVendedores.sort((a, b) => a.preco - b.preco);
      debug.push(`✅ ${allVendedores.length} vendedor(es) catalogado(s) totalizando ${Math.max(...paginasColetadas)} página(s) de 10 itens.`);
      return { vendedores: allVendedores, paginas: paginasColetadas };
    }
  } catch (e) {
    debug.push(`❌ /products/items falhou: ${e.response?.status || e.message?.substring(0,60)}`);
  }

  try {
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore && offset < 1000) {
      debug.push(`📡 API (Lote ${offset/50 + 1}): GET /sites/MLB/search?catalog_product_id=${catalogId}&limit=${limit}&offset=${offset}`);
      
      const searchRes = await api.get('/sites/MLB/search', {
        params: { catalog_product_id: catalogId, limit, offset, sort: 'price_asc' },
        timeout: 12000,
      });
      const results = searchRes.data?.results || [];
      
      if (results.length === 0) {
        hasMore = false;
        break;
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const sellerData = await getSellerFullCached(r.seller?.id || r.seller_id, api);
        const descPct = r.original_price && r.price < r.original_price
          ? Math.round((1 - r.price / r.original_price) * 100) : null;
        
        let envioDesc = r.shipping?.logistic_type === 'fulfillment' ? 'Full' : (r.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios');

        const absoluteIndex = offset + i;
        const currPage = Math.floor(absoluteIndex / PAGE_SIZE) + 1;
        const pos = absoluteIndex + 1;

        if (!paginasColetadas.includes(currPage)) {
          paginasColetadas.push(currPage);
        }

        allVendedores.push({
          mlbId: r.id,
          nome: sellerData?.nome || String(r.seller?.id || r.seller_id),
          vendas: sellerData?.vendas || 0,
          preco: r.price || 0,
          precoOriginal: r.original_price || r.price,
          desconto: descPct ? `${descPct}% OFF` : '0% OFF',
          link: buildItemLink(r.id, r.permalink),
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

      if (results.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        await sleep(500);
      }
    }

    if (allVendedores.length > 0) {
      allVendedores.sort((a, b) => a.preco - b.preco);
      debug.push(`✅ ${allVendedores.length} vendedor(es) mapeados via search. Resultando em ${Math.max(...paginasColetadas)} página(s).`);
      return { vendedores: allVendedores, paginas: paginasColetadas };
    }
  } catch (e) {
    debug.push(`❌ search catalog_product_id falhou: ${e.response?.status || e.message?.substring(0,60)}`);
  }

  const cleanId = catalogId.replace(/^MLB/i, '');
  const urls = [
    `https://www.mercadolivre.com.br/noindex/catalog/buybox/MLB${cleanId}`,
    `https://www.mercadolivre.com.br/p/MLB${cleanId}`,
  ];
  for (const url of urls) {
    try {
      debug.push(`🌐 Scraping Axios: ${url}`);
      const res  = await scraperAgent.get(url);
      let html = res.data || '';

      if (html.includes('captcha') || html.includes('Verifica que eres un ser humano') || html.length < 10000) {
          debug.push(`⚠️ WAF/Captcha detectado no Axios. Alternando para navegador real...`);
          html = await fetchWithPuppeteer(url, debug);
      }

      debug.push(`   → HTML processado: ${(html.length/1024).toFixed(0)}KB`);
      const vendedores = extrairVendedoresDoHTML(html, debug);
      if (vendedores.length) {
        debug.push(`✅ ${vendedores.length} vendedor(es) extraído(s) via scraping`);
        const maxPagina = Math.max(...vendedores.map(v => v.pagina));
        const tags = Array.from({length: maxPagina}, (_, i) => i + 1);
        return { vendedores, paginas: tags };
      }
    } catch (e) {
      debug.push(`⚠️ Scraping Axios falhou (${e.message?.substring(0,40)}). Alternando para navegador real...`);
      try {
        const html = await fetchWithPuppeteer(url, debug);
        const vendedores = extrairVendedoresDoHTML(html, debug);
        if (vendedores.length) {
          debug.push(`✅ ${vendedores.length} vendedor(es) extraído(s) via Puppeteer`);
          const maxPagina = Math.max(...vendedores.map(v => v.pagina));
          const tags = Array.from({length: maxPagina}, (_, i) => i + 1);
          return { vendedores, paginas: tags };
        }
      } catch (errPup) {
          debug.push(`❌ Scraping Puppeteer também falhou: ${errPup.message?.substring(0,60)}`);
      }
    }
  }
  debug.push(`⚠️  Nenhuma opção de compra encontrada para ${catalogId}`);
  return { vendedores: [], paginas: [] };
}

function extrairVendedoresDoHTML(html, debug) {
  const vendedores = [];
  const jsonPatterns = [
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]{100,}?\});?\s*(?:<\/script>|window\.|var )/,
    /"initialState"\s*:\s*(\{[\s\S]{100,}?\})\s*,\s*"components"/,
    /window\.ML_PRELOADED_STATE\s*=\s*(\{[\s\S]{100,}?\});/,
  ];
  for (const pattern of jsonPatterns) {
    const m = html.match(pattern);
    if (!m) continue;
    try {
      const state = JSON.parse(m[1]);
      const paths = [
        state?.buyingOptions?.options, state?.initialState?.buyingOptions?.options,
        state?.component?.state?.buyingOptions?.options, state?.buyingOptions?.offers,
        state?.catalogProductResults?.items, state?.pageState?.catalogBuyBox?.items,
      ];
      for (const arr of paths) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        for (let i = 0; i < arr.length; i++) {
          const o = arr[i];
          const nome  = o.seller?.nickname || o.sellerInfo?.nickname || o.seller?.name || o.sellerNickname || '—';
          const preco = o.price?.amount || o.price?.value || o.salePrice || o.price || 0;
          const link  = o.permalink || o.item?.permalink || o.url || '';
          const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || null);
          
          if (parseFloat(preco) > 0 || nome !== '—') {
            const absoluteIndex = i;
            const currPage = Math.floor(absoluteIndex / PAGE_SIZE) + 1;

            vendedores.push({
              nome, preco: parseFloat(preco) || 0, precoOriginal: o.originalPrice || parseFloat(preco) || 0,
              link, desconto: descPct || '0% OFF', thumbnail: o.thumbnail || o.item?.thumbnail || null,
              titulo: o.title || o.item?.title || null, freteGratis: o.shipping?.free_shipping === true || o.freeShipping === true,
              frete: o.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: o.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
              pagina: currPage, posicao: absoluteIndex + 1, vendas: 0
            });
          }
        }
        if (vendedores.length) return vendedores;
      }
    } catch {}
  }
  return [];
}

async function buscarItem(mlbId, url, api, debug) {
  debug.push(`🔍 Buscando /items/${mlbId}...`);
  const itemRes = await api.get(`/items/${mlbId}`, {
    params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,catalog_listing,catalog_product_id,condition,status,warranty,attributes,pictures,reviews' },
    timeout: 12000,
  });
  const it = itemRes.data;
  debug.push(`   → Título: ${it.title?.substring(0,50)}`);
  const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);
  const seller = await getSellerFullCached(it.seller_id, api);
  let concorrentes = [];
  let paginasColetadas = [1];

  if (ehCatalogo) {
    const catalogId = it.catalog_product_id || mlbId;
    debug.push(`📦 Produto de CATÁLOGO detectado. Buscando opções de compra com matemática de 10 por página...`);
    const catalogoData = await buscarVendedoresCatalogo(catalogId, api, debug);
    concorrentes = catalogoData.vendedores;
    paginasColetadas = catalogoData.paginas;

    if (concorrentes.length === 0) {
      debug.push(`🔄 Fallback: busca por título na categoria ${it.category_id}...`);
      try {
        const titulo = (it.title || '').split(' ').slice(0, 5).join(' ');
        const searchRes = await api.get('/sites/MLB/search', {
          params: { category: it.category_id, q: titulo, limit: 20, sort: 'price_asc' },
          timeout: 10000,
        });
        const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 15);
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const sellerData = await getSellerFullCached(r.seller?.id || r.seller_id, api);
          concorrentes.push({
            mlbId: r.id, nome: sellerData.nome, vendas: sellerData.vendas, preco: r.price || 0,
            precoOriginal: r.original_price || r.price, desconto: '0% OFF', link: buildItemLink(r.id, r.permalink),
            thumbnail: r.thumbnail, titulo: r.title, frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
            freteGratis: r.shipping?.free_shipping === true, envio: r.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
            estoque: r.available_quantity, vendidos: r.sold_quantity, tipoAnuncio: mapTipo(r.listing_type_id),
            pagina: Math.floor(i / PAGE_SIZE) + 1, posicao: i + 1
          });
        }
      } catch (e) {}
    }
  } else {
    debug.push(`🏪 Anúncio normal. Buscando concorrentes (Limit 50 na API, Agrupado de 10 na Interface)...`);
    try {
      const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
      let offset = 0;
      const limit = 50; 
      let hasMore = true;

      while (hasMore && offset < 150) {
        const searchRes = await api.get('/sites/MLB/search', {
          params: { category: it.category_id, q: titulo, limit, offset, sort: 'price_asc' },
          timeout: 10000,
        });
        const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId);
        
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const sellerData = await getSellerFullCached(r.seller?.id || r.seller_id, api);
          
          const absoluteIndex = offset + i;
          const currPage = Math.floor(absoluteIndex / PAGE_SIZE) + 1;
          const pos = absoluteIndex + 1;

          if (!paginasColetadas.includes(currPage)) paginasColetadas.push(currPage);

          concorrentes.push({
            mlbId: r.id, nome: sellerData.nome, vendas: sellerData.vendas, preco: r.price || 0,
            precoOriginal: r.original_price || r.price, desconto: '0% OFF', link: buildItemLink(r.id, r.permalink),
            thumbnail: r.thumbnail, titulo: r.title, frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
            freteGratis: r.shipping?.free_shipping === true, envio: r.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
            estoque: r.available_quantity, vendidos: r.sold_quantity, tipoAnuncio: mapTipo(r.listing_type_id),
            pagina: currPage, posicao: pos
          });
        }
        if (results.length < limit) hasMore = false;
        else { offset += limit; await sleep(600); }
      }
    } catch (e) {}
  }

  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a,b)=>a-b);
  const precoMin  = allPrecos[0] ?? it.price;
  const precoMax  = allPrecos[allPrecos.length-1] ?? it.price;
  const precoMed  = allPrecos.length ? Math.round(allPrecos.reduce((s,v)=>s+v,0)/allPrecos.length*100)/100 : it.price;

  const totalVendedores = ehCatalogo ? concorrentes.length : concorrentes.length + (seller ? 1 : 0);

  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || it.price,
    status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
    vendas: seller?.vendas || it.sold_quantity || 0,
    condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: it.permalink, freteGratis: it.shipping?.free_shipping === true,
    frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: it.shipping?.free_shipping ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
    avaliacoes: it.reviews?.rating_average ? it.reviews.rating_average.toFixed(1) : null,
    atributos: extrairAtributos(it.attributes || []), seller, concorrentes,
    totalVendedores, precoMin, precoMax, precoMedio: precoMed,
    ehCatalogo, catalogProductId: it.catalog_product_id || null, fonte: 'items',
    paginasColetadas, analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1
  };
}

async function buscarViaProducts(mlbId, api, debug) {
  debug.push(`🔍 Tentando /products/${mlbId}...`);
  const res = await api.get(`/products/${mlbId}`, { timeout: 12000 });
  const p   = res.data;
  debug.push(`   → Nome do produto: ${p.name?.substring(0,50) || 'N/A'}`);
  const catalogoData = await buscarVendedoresCatalogo(mlbId, api, debug);
  const concorrentes = catalogoData.vendedores;
  
  const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
  const preco  = p.buy_box_winner?.price || p.price || (precos[0] ?? 0);
  if (!precos.includes(preco) && preco > 0) precos.unshift(preco);
  precos.sort((a,b)=>a-b);
  
  let seller = null;
  if (p.buy_box_winner?.seller_id) {
    seller = await getSellerFullCached(p.buy_box_winner.seller_id, api);
  } else if (concorrentes.length) {
    seller = { nome: concorrentes[0].nome, reputacao: null, vendas: concorrentes[0].vendas };
  }

  return {
    mlbId, titulo: p.name || p.title, preco, precoOriginal: preco, status: 'active', estoque: null, vendidos: null,
    vendas: seller?.vendas || 0, condicao: 'Novo', tipoAnuncio: 'Catálogo', thumbnail: p.pictures?.[0]?.url || concorrentes[0]?.thumbnail || null,
    link: `https://www.mercadolivre.com.br/p/${mlbId}`,
    freteGratis: concorrentes[0]?.freteGratis ?? false, frete: concorrentes[0]?.frete || '—', envio: concorrentes[0]?.envio || 'Mercado Envios',
    avaliacoes: p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
    atributos: (p.attributes || []).filter(a=>a.value_name).slice(0,14).map(a=>({nome:a.name,valor:a.value_name})),
    seller, concorrentes, totalVendedores: concorrentes.length,
    precoMin: precos[0] ?? preco, precoMax: precos[precos.length-1] ?? preco,
    precoMedio: precos.length ? Math.round(precos.reduce((s,v)=>s+v,0)/precos.length*100)/100 : preco,
    ehCatalogo: true, catalogProductId: mlbId, fonte: 'products', paginasColetadas: catalogoData.paginas, 
    analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1
  };
}

async function buscarViaScraping(url, mlbId, debug) {
  const targetUrl = url.startsWith('http') ? url : `https://www.mercadolivre.com.br/p/${mlbId}`;
  debug.push(`🌐 Scraping direto: ${targetUrl}`);
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
  if (!titulo) throw new Error('Não foi possível extrair dados da página');

  const vendedores = extrairVendedoresDoHTML(html, debug);
  const maxPagina = vendedores.length > 0 ? Math.max(...vendedores.map(v => v.pagina)) : 1;
  const tags = Array.from({length: maxPagina}, (_, i) => i + 1);

  return {
    mlbId, titulo, preco: preco || 0, precoOriginal: preco || 0, status: 'active', estoque: null, vendidos: null, vendas: vendedores[0]?.vendas || 0,
    condicao: 'Novo', tipoAnuncio: 'Catálogo', thumbnail, link: targetUrl,
    freteGratis: false, frete: '—', envio: 'Mercado Envios', avaliacoes: null, atributos: [],
    seller: vendedores.length ? { nome: vendedores[0].nome, reputacao: null, vendas: vendedores[0].vendas || 0 } : null,
    concorrentes: vendedores.slice(1), totalVendedores: vendedores.length,
    precoMin: preco || 0, precoMax: preco || 0, precoMedio: preco || 0,
    ehCatalogo: true, fonte: 'scraping', paginasColetadas: tags, analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1
  };
}

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
  const debug = [`🚀 Iniciando análise profunda de ${mlbId}`];
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
    } catch (eA) { debug.push(`⚠️  /items/${id}: ${eA.message?.substring(0,60)}`); }
    try {
      const dados = await buscarViaProducts(id, api, debug);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json({ ...dados, debug });
    } catch (eB) { debug.push(`⚠️  /products/${id}: ${eB.message?.substring(0,60)}`); }
  }
  if (urlOriginal) {
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId, debug);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json({ ...dados, debug });
    } catch (eC) { debug.push(`❌ Scraping: ${eC.message?.substring(0,60)}`); }
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