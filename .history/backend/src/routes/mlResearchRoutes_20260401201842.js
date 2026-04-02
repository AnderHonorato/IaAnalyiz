// backend/src/routes/mlResearchRoutes.js
// Corrigido:
//   1. Vendas: usa transactions.total (não .completed) — é o número que o ML exibe no site
//   2. Permalink: prioridade eshop.permalink (já vem pronto da API) → /users/{id}/brands → /pagina/slug
//      O slug do nickname NUNCA é igual ao slug da loja — só a API sabe o slug correto

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';

const prisma = new PrismaClient();
const router = express.Router();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PAGE_SIZE = 10;

// =============================================================================
// FORMATACAO DE VENDAS
// Replica exatamente o que aparece no site ML
// =============================================================================

function formatarVendasApi(total) {
  if (!total || total <= 0) return '0 vendas';
  if (total >= 50000) return '+50mil vendas';
  if (total >= 10000) return '+10mil vendas';
  if (total >= 5000)  return '+5mil vendas';
  if (total >= 1000)  return '+1000 vendas';
  if (total >= 500)   return '+500 vendas';
  if (total >= 100)   return '+100 vendas';
  if (total >= 50)    return '+50 vendas';
  return String(total) + ' vendas';
}

function formatarMercadoLider(powerSellerStatus) {
  if (!powerSellerStatus) return null;
  const mapa = { platinum: 'MercadoLider Platinum', gold: 'MercadoLider Gold', silver: 'MercadoLider' };
  return mapa[powerSellerStatus] || null;
}

// =============================================================================
// LINKS — construcao correta de URLs de anuncio e perfil de vendedor
// =============================================================================

/**
 * Link do ANUNCIO — sempre aponta para a pagina de catalogo pai.
 * CORRETO:   http://www.mercadolivre.com.br/p/MLB16061588/s
 * ERRADO:    https://produto.mercadolivre.com.br/MLB4069811147-_JM
 */
function buildItemLink(itemId, catalogId) {
  const alvo = catalogId || itemId;
  if (!alvo) return null;
  const num = String(alvo).replace(/^MLB/i, '');
  return 'http://www.mercadolivre.com.br/p/MLB' + num + '/s';
}

/**
 * Link do PERFIL do vendedor — lógica em cascata:
 *
 * 1. eshop.permalink  → já vem pronto da API, ex: "https://www.mercadolivre.com.br/loja/netalarme"
 *                       ou "https://www.mercadolivre.com.br/pagina/garciajundiaid"
 *                       É a fonte mais confiável — o ML monta internamente com o slug real.
 *
 * 2. user_type=brand  → chamar GET /users/{id}/brands para pegar landing_permalink real
 *                       (slug da loja ≠ slug do nickname, só a API sabe)
 *
 * 3. Fallback         → /pagina/slug-do-nickname para vendedores comuns sem eshop
 *
 * NUNCA construir /loja/ a partir do nickname — o slug é independente.
 *
 * @param {string} nickname
 * @param {string} userType  - s.user_type do GET /users/{id}
 * @param {object|null} eshop - s.eshop do GET /users/{id}
 * @returns {string|null} - null indica que precisa buscar /brands (tratado em getSellerFullCached)
 */
function buildPerfilVendedor(nickname, userType, eshop) {
  if (!nickname) return '#';

  // 1. eshop.permalink já vem com a URL correta — usar diretamente
  if (eshop && eshop.permalink) {
    return eshop.permalink;
  }

  // 2. user_type=brand → sinaliza que precisa buscar /brands
  //    retornamos null para que getSellerFullCached faça a chamada extra
  if (userType === 'brand') {
    return null;
  }

  // 3. Fallback: vendedor comum sem Minha Página — /pagina/nickname-slug
  const slug = nickname
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return 'https://www.mercadolivre.com.br/pagina/' + slug;
}

// =============================================================================
// HELPERS
// =============================================================================

function mapRep(level) {
  const m = { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' };
  return m[level] || 'novo';
}

function mapTipo(id) {
  const m = { gold_pro:'Premium',gold_special:'Classico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Gratis' };
  return m[id] || id || '—';
}

function extrairAtributos(attrs) {
  if (!Array.isArray(attrs)) return [];
  return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name }));
}

function extrairTodosMLBs(url) {
  const ids = new Set();
  for (const m of url.matchAll(/\/p\/MLB[-]?(\d+)/gi))       ids.add('MLB' + m[1]);
  const limpa = url.split('?')[0].split('#')[0];
  for (const m of limpa.matchAll(/\/[^/]+-MLB[-]?(\d+)/gi)) ids.add('MLB' + m[1]);
  for (const m of url.matchAll(/MLB[-]?(\d+)/gi))            ids.add('MLB' + m[1]);
  return [...ids];
}

// =============================================================================
// CLIENTE ML API
// =============================================================================

async function getMlApi(userId) {
  const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!token) throw new Error('Conta ML nao conectada');
  if (new Date() >= new Date(token.expiresAt)) throw new Error('Token ML expirado — reconecte');
  return axios.create({
    baseURL: 'https://api.mercadolibre.com',
    headers: { Authorization: 'Bearer ' + token.accessToken },
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

// =============================================================================
// PUPPETEER — ultimo recurso anti-bot
// =============================================================================

async function fetchWithPuppeteer(url, debug) {
  debug.push('🤖 Acionando Motor Puppeteer (Navegador Real Invisivel)...');
  let browser = null;
  try {
    debug.push('   → Inicializando Chromium com perfil Stealth Anti-Bot...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    debug.push('   → Acessando URL alvo e gerando impressoes digitais (cookies)...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    debug.push('   → Simulando navegacao humana: injetando movimentos de mouse...');
    await page.mouse.move(Math.random() * 500, Math.random() * 500, { steps: 5 });
    debug.push('   → Analisando tela em busca de firewalls (Cloudflare/WAF)...');
    await sleep(Math.floor(Math.random() * (2500 - 1200 + 1) + 1200));
    debug.push('   → Bypass concluido. Aguardando a arvore DOM do React renderizar...');
    await sleep(1000);
    const html = await page.content();
    debug.push('   → 🌐 HTML renderizado capturado: ' + (html.length / 1024).toFixed(0) + 'KB.');
    return html;
  } catch (error) {
    debug.push('❌ Falha critica no Puppeteer: ' + error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// =============================================================================
// CACHE DE SELLERS — GET /users/{sellerId}
//
// CORREÇÕES aplicadas:
//   • vendas: transactions.total (não .completed) — é o número exibido no site
//   • permalink: eshop.permalink → /brands → /pagina/slug (nunca reconstrói /loja/ pelo nickname)
// =============================================================================

const sellerCache = new Map();

async function getSellerFullCached(sellerId, api) {
  if (!sellerId) return null;
  if (sellerCache.has(sellerId)) return sellerCache.get(sellerId);

  try {
    const sv = await api.get('/users/' + sellerId, { timeout: 8000 });
    const s  = sv.data;

    // ── VENDAS ──────────────────────────────────────────────────────────────
    // transactions.total  = todas as transações históricas → é o que o ML exibe
    //   ex: total=12500 → "+10mil vendas"
    // transactions.completed = apenas concluídas (exclui canceladas) → menor, NÃO é o exibido
    const vendasTotal = (s.seller_reputation && s.seller_reputation.transactions)
      ? (s.seller_reputation.transactions.total || 0)
      : 0;
    const vendasNum = vendasTotal;
    const vendasStr = formatarVendasApi(vendasTotal);

    // ── MERCADO LÍDER ────────────────────────────────────────────────────────
    const powerStatus  = s.seller_reputation ? (s.seller_reputation.power_seller_status || null) : null;
    const mercadoLider = formatarMercadoLider(powerStatus);

    // ── PERMALINK ────────────────────────────────────────────────────────────
    const nome = s.nickname || s.first_name || String(sellerId);

    // Tentativa 1: eshop.permalink (já vem com a URL real da loja/pagina)
    let permalink = buildPerfilVendedor(nome, s.user_type, s.eshop);

    // Tentativa 2: user_type=brand sem eshop → buscar /users/{id}/brands
    // landing_permalink da brand tem o slug real da loja oficial
    if (permalink === null) {
      try {
        const brandsRes = await api.get('/users/' + sellerId + '/brands', { timeout: 6000 });
        const brands = (brandsRes.data && brandsRes.data.brands)
          ? brandsRes.data.brands
          : (Array.isArray(brandsRes.data) ? brandsRes.data : []);

        if (brands.length > 0 && brands[0].landing_permalink) {
          permalink = brands[0].landing_permalink;
        }
      } catch (_) {
        // silencioso — cai no fallback abaixo
      }

      // Fallback se /brands também falhou: /pagina/slug (melhor que '#')
      if (!permalink) {
        const slug = nome
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        permalink = 'https://www.mercadolivre.com.br/pagina/' + slug;
      }
    }

    const res = {
      nome,
      reputacao:     mapRep(s.seller_reputation ? s.seller_reputation.level_id : null),
      levelId:       s.seller_reputation ? (s.seller_reputation.level_id || null) : null,
      vendasNum,
      vendasStr,
      mercadoLider,
      permalink,
      cancelamentos: s.seller_reputation && s.seller_reputation.transactions
        ? (s.seller_reputation.transactions.canceled || 0) : 0,
      avaliacaoPos:  s.seller_reputation && s.seller_reputation.transactions && s.seller_reputation.transactions.ratings
        ? (s.seller_reputation.transactions.ratings.positive || 0) : 0,
      avaliacaoNeg:  s.seller_reputation && s.seller_reputation.transactions && s.seller_reputation.transactions.ratings
        ? (s.seller_reputation.transactions.ratings.negative || 0) : 0,
    };

    sellerCache.set(sellerId, res);
    return res;
  } catch (_) {
    const fallback = {
      nome: String(sellerId), reputacao: null, levelId: null,
      vendasNum: 0, vendasStr: '0 vendas', mercadoLider: null,
      permalink: '#', cancelamentos: 0, avaliacaoPos: 0, avaliacaoNeg: 0,
    };
    sellerCache.set(sellerId, fallback);
    return fallback;
  }
}

// =============================================================================
// MONTAGEM DO OBJETO CONCORRENTE
// Centraliza a criacao para garantir campos consistentes em todos os fluxos
// =============================================================================

function montarConcorrente(opts) {
  const {
    mlbId, catalogId, sellerId, sellerData,
    preco, precoOriginal, thumbnail, titulo,
    shipping, listingTypeId, absoluteIndex,
    estoque, vendidos,
  } = opts;

  const descPct = precoOriginal && preco < precoOriginal
    ? Math.round((1 - preco / precoOriginal) * 100) : null;
  const envioDesc = shipping && shipping.logistic_type === 'fulfillment'
    ? 'Full' : (shipping && shipping.free_shipping ? 'Mercado Envios (Gratis)' : 'Mercado Envios');
  const currPage = Math.floor(absoluteIndex / PAGE_SIZE) + 1;
  const pos      = absoluteIndex + 1;

  return {
    mlbId,
    nome:          sellerData ? sellerData.nome      : String(sellerId || '—'),
    vendasNum:     sellerData ? sellerData.vendasNum  : 0,
    vendasStr:     sellerData ? sellerData.vendasStr  : '0 vendas',
    mercadoLider:  sellerData ? sellerData.mercadoLider : null,
    perfilLoja:    sellerData ? sellerData.permalink   : '#',
    preco:         preco || 0,
    precoOriginal: precoOriginal || preco || 0,
    desconto:      descPct ? (descPct + '% OFF') : '0% OFF',
    link:          buildItemLink(mlbId, catalogId),
    thumbnail:     thumbnail || null,
    titulo:        titulo || null,
    frete:         shipping && shipping.free_shipping ? 'Gratis' : 'Pago',
    freteGratis:   shipping ? (shipping.free_shipping === true) : false,
    envio:         envioDesc,
    estoque:       estoque || null,
    vendidos:      vendidos || null,
    tipoAnuncio:   mapTipo(listingTypeId),
    pagina:        currPage,
    posicao:       pos,
  };
}

// =============================================================================
// ESTRATEGIA 1: GET /products/{catalogId}/items
// =============================================================================

async function buscarVendedoresCatalogoViaProductsItems(catalogId, api, debug) {
  debug.push('[Estrategia 1] GET /products/' + catalogId + '/items...');
  const allVendedores = [];
  const paginasColetadas = [];
  let offset = 0; const limit = 50; let hasMore = true;

  while (hasMore && offset < 1000) {
    debug.push('   → offset=' + offset);
    const res = await api.get('/products/' + catalogId + '/items', {
      params: { limit, offset, fields: 'id,title,price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,original_price' },
      timeout: 12000,
    });
    const results = (res.data && res.data.results) ? res.data.results : [];
    if (results.length === 0) { hasMore = false; break; }

    for (let i = 0; i < results.length; i++) {
      const r          = results[i];
      const id         = r.item_id || r.id;
      const sellerData = await getSellerFullCached(r.seller_id, api);
      const absIdx     = offset + i;
      const currPage   = Math.floor(absIdx / PAGE_SIZE) + 1;
      if (!paginasColetadas.includes(currPage)) paginasColetadas.push(currPage);

      allVendedores.push(montarConcorrente({
        mlbId: id, catalogId, sellerId: r.seller_id, sellerData,
        preco: r.price, precoOriginal: r.original_price,
        thumbnail: r.thumbnail, titulo: r.title,
        shipping: r.shipping, listingTypeId: r.listing_type_id,
        absoluteIndex: absIdx, estoque: r.available_quantity, vendidos: r.sold_quantity,
      }));
    }

    if (results.length < limit) hasMore = false;
    else { offset += limit; await sleep(500); }
  }

  if (allVendedores.length > 0) {
    allVendedores.sort((a, b) => a.preco - b.preco);
    debug.push('[Estrategia 1] OK: ' + allVendedores.length + ' vendedor(es).');
    return { vendedores: allVendedores, paginas: paginasColetadas };
  }
  return null;
}

// =============================================================================
// ESTRATEGIA 2: GET /sites/MLB/search?catalog_product_id=
// =============================================================================

async function buscarVendedoresCatalogoViaSearch(catalogId, api, debug) {
  debug.push('[Estrategia 2] GET /sites/MLB/search?catalog_product_id=' + catalogId + '...');
  const allVendedores = [];
  const paginasColetadas = [];
  let offset = 0; const limit = 50; let hasMore = true;

  while (hasMore && offset < 1000) {
    const searchRes = await api.get('/sites/MLB/search', {
      params: { catalog_product_id: catalogId, limit, offset, sort: 'price_asc' },
      timeout: 12000,
    });
    const results = (searchRes.data && searchRes.data.results) ? searchRes.data.results : [];
    if (results.length === 0) break;

    for (let i = 0; i < results.length; i++) {
      const r          = results[i];
      const sellerId   = (r.seller && r.seller.id) ? r.seller.id : r.seller_id;
      const sellerData = await getSellerFullCached(sellerId, api);
      const absIdx     = offset + i;
      const currPage   = Math.floor(absIdx / PAGE_SIZE) + 1;
      if (!paginasColetadas.includes(currPage)) paginasColetadas.push(currPage);

      allVendedores.push(montarConcorrente({
        mlbId: r.id, catalogId, sellerId, sellerData,
        preco: r.price, precoOriginal: r.original_price,
        thumbnail: r.thumbnail, titulo: r.title,
        shipping: r.shipping, listingTypeId: r.listing_type_id,
        absoluteIndex: absIdx, estoque: r.available_quantity, vendidos: r.sold_quantity,
      }));
    }

    if (results.length < limit) hasMore = false;
    else { offset += limit; await sleep(500); }
  }

  if (allVendedores.length > 0) {
    allVendedores.sort((a, b) => a.preco - b.preco);
    debug.push('[Estrategia 2] OK: ' + allVendedores.length + ' vendedor(es) via Search.');
    return { vendedores: allVendedores, paginas: paginasColetadas };
  }
  return null;
}

// =============================================================================
// ESTRATEGIA 3: Scraping HTTP + Puppeteer
// =============================================================================

async function buscarVendedoresCatalogoViaScraping(catalogId, debug) {
  const cleanId = catalogId.replace(/^MLB/i, '');
  const urls = [
    'https://www.mercadolivre.com.br/noindex/catalog/buybox/MLB' + cleanId,
    'https://www.mercadolivre.com.br/p/MLB' + cleanId,
  ];

  for (const url of urls) {
    try {
      debug.push('[Estrategia 3] Scraping: ' + url);
      let html = '';
      try {
        const res = await scraperAgent.get(url);
        html = res.data || '';
        if (html.includes('captcha') || html.includes('Verifica que eres un ser humano') || html.length < 10000) {
          debug.push('⚠️ Cloudflare bloqueou Axios. Subindo Puppeteer...');
          html = await fetchWithPuppeteer(url, debug);
        }
      } catch (e) {
        debug.push('⚠️ Axios bloqueado (' + (e.message || '').substring(0, 40) + '). Subindo Puppeteer...');
        html = await fetchWithPuppeteer(url, debug);
      }

      const vendedores = extrairVendedoresDoHTML(html, debug, catalogId);
      if (vendedores.length) {
        debug.push('[Estrategia 3] OK: ' + vendedores.length + ' vendedor(es) via Scraping.');
        const maxPagina = Math.max(...vendedores.map(v => v.pagina));
        return { vendedores, paginas: Array.from({ length: maxPagina }, (_, i) => i + 1) };
      }
    } catch (e) {
      debug.push('❌ [Estrategia 3] Falha em ' + url + ': ' + (e.message || '').substring(0, 60));
    }
  }
  return null;
}

// =============================================================================
// ORQUESTRADOR DE CATALOGO — cascata: 1 → 2 → 3
// =============================================================================

async function buscarVendedoresCatalogo(catalogId, api, debug) {
  debug.push('🏷️  Iniciando extracao do Catalogo: ' + catalogId);

  try {
    const r = await buscarVendedoresCatalogoViaProductsItems(catalogId, api, debug);
    if (r && r.vendedores.length > 0) return r;
    debug.push('⚠️ Estrategia 1 vazia, tentando Estrategia 2...');
  } catch (e) {
    debug.push('❌ Estrategia 1 falhou: ' + (e.message || '').substring(0, 60) + ' — tentando Estrategia 2...');
  }

  try {
    const r = await buscarVendedoresCatalogoViaSearch(catalogId, api, debug);
    if (r && r.vendedores.length > 0) return r;
    debug.push('⚠️ Estrategia 2 vazia, tentando Scraping...');
  } catch (e) {
    debug.push('❌ Estrategia 2 falhou: ' + (e.message || '').substring(0, 60) + ' — tentando Scraping...');
  }

  try {
    const r = await buscarVendedoresCatalogoViaScraping(catalogId, debug);
    if (r && r.vendedores.length > 0) return r;
  } catch (e) {
    debug.push('❌ Estrategia 3 falhou: ' + (e.message || '').substring(0, 60));
  }

  debug.push('⚠️ Produto ' + catalogId + ' sem vendedores ativos (Inativo/Pausado/Sem Estoque).');
  return { vendedores: [], paginas: [] };
}

// =============================================================================
// EXTRACAO DE VENDEDORES DO HTML (scraping)
// Quando vier do scraping, o permalink já está no HTML — usar diretamente se não for "perfil."
// =============================================================================

function extrairVendedoresDoHTML(html, debug, catalogId) {
  const vendedores = [];
  const catId = catalogId || null;

  // Tenta JSON __PRELOADED_STATE__ do ML
  const jsonMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]{100,}?\});?\s*(?:<\/script>|window\.|var )/);
  if (jsonMatch) {
    try {
      const state   = JSON.parse(jsonMatch[1]);
      const options = (state && state.initialState && state.initialState.buyingOptions && state.initialState.buyingOptions.options)
        ? state.initialState.buyingOptions.options
        : ((state && state.buyingOptions && state.buyingOptions.options) ? state.buyingOptions.options : []);

      if (options.length > 0) {
        options.forEach((o, i) => {
          const nome  = (o.seller && o.seller.nickname)
            ? o.seller.nickname
            : ((o.sellerInfo && o.sellerInfo.nickname) ? o.sellerInfo.nickname : (o.sellerNickname || '—'));

          const preco    = (o.price && o.price.amount) ? o.price.amount
            : ((o.price && o.price.value) ? o.price.value : (o.salePrice || o.price || 0));
          const original = o.originalPrice || preco;
          const descPct  = (o.discount && o.discount.rate)
            ? (Math.round(o.discount.rate * 100) + '% OFF')
            : (o.discountLabel || '0% OFF');

          // Vendas: tenta extrair do subtitulo exibido na pagina
          let vendasStr = '0 vendas';
          let vendasNum = 0;
          if (o.sellerInfo && o.sellerInfo.subtitle) {
            const m = o.sellerInfo.subtitle.match(/((?:\+[\d.,mk]+|[\d.,mk]+)\s*vendas)/i);
            if (m) vendasStr = m[1].trim();
          }

          // Mercado Lider: tenta extrair do badge
          let mercadoLider = null;
          const badge = (o.sellerInfo && o.sellerInfo.badge) ? o.sellerInfo.badge : (o.sellerBadge || '');
          if (badge.toLowerCase().includes('platinum'))      mercadoLider = 'MercadoLider Platinum';
          else if (badge.toLowerCase().includes('gold'))     mercadoLider = 'MercadoLider Gold';
          else if (badge.toLowerCase().includes('lider'))    mercadoLider = 'MercadoLider';

          // Permalink: usar o que vem do HTML se não for "perfil.mercadolivre"
          // O HTML do ML já traz o link correto (/loja/ ou /pagina/)
          let permalink = '';
          if (o.sellerInfo && o.sellerInfo.permalink) {
            permalink = o.sellerInfo.permalink;
          } else if (o.seller && o.seller.permalink) {
            permalink = o.seller.permalink;
          }
          // Descartar links "perfil.mercadolivre.com.br" — são inválidos no site
          if (!permalink || permalink.includes('perfil.mercadolivre')) {
            // Sem eshop disponível no scraping — fallback /pagina/
            const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            permalink = 'https://www.mercadolivre.com.br/pagina/' + slug;
          }

          const itemIdMatch = ((o.permalink || (o.item && o.item.permalink) || '')).match(/MLB-?(\d+)/i);
          const theItemId   = itemIdMatch ? ('MLB' + itemIdMatch[1]) : null;

          if (parseFloat(preco) > 0 || nome !== '—') {
            vendedores.push({
              nome, vendasStr, vendasNum, mercadoLider, perfilLoja: permalink,
              preco: parseFloat(preco) || 0, precoOriginal: parseFloat(original),
              link: buildItemLink(theItemId, catId),
              desconto: descPct,
              thumbnail: (o.thumbnail) ? o.thumbnail : ((o.item && o.item.thumbnail) ? o.item.thumbnail : null),
              titulo:    (o.title)     ? o.title     : ((o.item && o.item.title)     ? o.item.title     : null),
              freteGratis: (o.shipping && o.shipping.free_shipping === true) || o.freeShipping === true,
              frete:  (o.shipping && o.shipping.free_shipping) ? 'Gratis' : 'Pago',
              envio:  (o.shipping && o.shipping.free_shipping) ? 'Mercado Envios (Gratis)' : 'Mercado Envios',
              pagina: Math.floor(i / PAGE_SIZE) + 1, posicao: i + 1,
              mlbId: theItemId,
            });
          }
        });
        return vendedores;
      }
    } catch (_) {}
  }

  // Fallback Regex no HTML bruto
  const blocks = html.split(/<form class="ui-pdp-buybox/i);
  if (blocks.length > 1) {
    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i];

      let nome = '—'; let linkLoja = ''; let vendasStr = '0 vendas';
      const sellerMatch = b.match(/href="([^"]+(?:loja|pagina|perfil)[^"]+)"[^>]*><span>([^<]+)<\/span><\/a>/i);
      if (sellerMatch) {
        nome = sellerMatch[2].trim();
        const rawLink = sellerMatch[1];
        // Usar o link diretamente se já tiver /loja/ ou /pagina/ — é o slug real
        if (rawLink.includes('/loja/') || rawLink.includes('/pagina/')) {
          linkLoja = rawLink;
        } else {
          // Era "perfil.mercadolivre" ou outro domínio inválido — fallback /pagina/
          const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          linkLoja = 'https://www.mercadolivre.com.br/pagina/' + slug;
        }
      }

      const vendasMatch = b.match(/ui-pdp-seller__header__subtitle[^>]*>.*?((?:\+[\d.,mk]+|[\d.,mk]+)\s*vendas)<\/span>/i);
      if (vendasMatch) vendasStr = vendasMatch[1].trim();

      let preco = 0; let precoOrig = 0;
      const priceMatch = b.match(/<span class="andes-money-amount__fraction"[^>]*>([\d.,]+)<\/span>/g);
      if (priceMatch && priceMatch.length > 0) {
        const cleanP = val => parseFloat(val.replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.'));
        if (priceMatch.length > 1) { precoOrig = cleanP(priceMatch[0]); preco = cleanP(priceMatch[1]); }
        else { preco = cleanP(priceMatch[0]); precoOrig = preco; }
      }

      const inputItem = b.match(/<input type="hidden" name="item_id" value="([^"]+)"/i);
      const theItemId = inputItem ? inputItem[1] : null;

      if (preco > 0 || nome !== '—') {
        vendedores.push({
          nome, vendasStr, vendasNum: 0, mercadoLider: null,
          perfilLoja: linkLoja,
          preco, precoOriginal: precoOrig,
          link: buildItemLink(theItemId, catId),
          desconto: (precoOrig > preco) ? (Math.round((1 - preco / precoOrig) * 100) + '% OFF') : '0% OFF',
          freteGratis: b.includes('gratis'), frete: b.includes('gratis') ? 'Gratis' : 'Pago',
          envio: b.includes('gratis') ? 'Mercado Envios (Gratis)' : 'Mercado Envios',
          pagina: Math.floor((i - 1) / PAGE_SIZE) + 1, posicao: i,
          mlbId: theItemId,
        });
      }
    }
  }
  return vendedores;
}

// =============================================================================
// BUSCA VIA /items/{mlbId} — rota principal
// =============================================================================

async function buscarItem(mlbId, url, api, debug) {
  debug.push('🔍 Lendo dados mestre: /items/' + mlbId + '...');
  const itemRes = await api.get('/items/' + mlbId, {
    params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,catalog_listing,catalog_product_id,condition,status,warranty,attributes,pictures,reviews' },
    timeout: 12000,
  });
  const it = itemRes.data;
  debug.push('   → Titulo: ' + (it.title || '').substring(0, 60));

  const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);
  const catalogId  = it.catalog_product_id || (ehCatalogo ? mlbId : null);

  // Dados do vendedor principal via /users/{seller_id}
  const seller = await getSellerFullCached(it.seller_id, api);
  if (seller) {
    debug.push('   → Vendedor: ' + seller.nome + ' | ' + seller.vendasStr + (seller.mercadoLider ? ' | ' + seller.mercadoLider : ''));
  }

  let concorrentes = [];
  let paginasColetadas = [1];

  if (ehCatalogo) {
    debug.push('📦 [Catalogo] Mapeando todas as opcoes de compra...');
    const catalogoData = await buscarVendedoresCatalogo(catalogId, api, debug);
    concorrentes       = catalogoData.vendedores;
    paginasColetadas   = catalogoData.paginas;
    if (concorrentes.length === 0) debug.push('⚠️ Nenhum concorrente ativo.');
  } else {
    debug.push('🏪 [Classico] Buscando similares via Search...');
    try {
      const titulo  = (it.title || '').split(' ').slice(0, 4).join(' ');
      let offset = 0; const limit = 50; let hasMore = true;

      while (hasMore && offset < 150) {
        const searchRes = await api.get('/sites/MLB/search', {
          params: { category: it.category_id, q: titulo, limit, offset, sort: 'price_asc' },
          timeout: 10000,
        });
        const results = ((searchRes.data && searchRes.data.results) ? searchRes.data.results : []).filter(r => r.id !== mlbId);

        for (let i = 0; i < results.length; i++) {
          const r          = results[i];
          const sellerId   = (r.seller && r.seller.id) ? r.seller.id : r.seller_id;
          const sellerData = await getSellerFullCached(sellerId, api);
          const absIdx     = offset + i;
          const currPage   = Math.floor(absIdx / PAGE_SIZE) + 1;
          if (!paginasColetadas.includes(currPage)) paginasColetadas.push(currPage);

          concorrentes.push(montarConcorrente({
            mlbId: r.id, catalogId: null, sellerId, sellerData,
            preco: r.price, precoOriginal: r.original_price,
            thumbnail: r.thumbnail, titulo: r.title,
            shipping: r.shipping, listingTypeId: r.listing_type_id,
            absoluteIndex: absIdx, estoque: r.available_quantity, vendidos: r.sold_quantity,
          }));
        }
        if (results.length < limit) hasMore = false;
        else { offset += limit; await sleep(600); }
      }
    } catch (e) { debug.push('❌ Erro na busca de similares: ' + e.message); }
  }

  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a, b) => a - b);

  const variacoes = (it.attributes || [])
    .filter(a => ['COLOR', 'VOLTAGE', 'FREQUENCY', 'POWER', 'SIZE', 'GEAR_SIZE'].includes(a.id))
    .map(a => ({ nome: a.name, valor: a.value_name }));

  return {
    mlbId,
    titulo:          it.title,
    preco:           it.price,
    precoOriginal:   it.original_price || it.price,
    status:          it.status,
    estoque:         it.available_quantity,
    vendidos:        it.sold_quantity,
    vendas:          seller ? seller.vendasNum : 0,
    vendasStr:       seller ? seller.vendasStr : '0 vendas',
    vendasNum:       seller ? seller.vendasNum : 0,
    mercadoLider:    seller ? seller.mercadoLider : null,
    condicao:        it.condition === 'new' ? 'Novo' : 'Usado',
    tipoAnuncio:     mapTipo(it.listing_type_id),
    thumbnail:       it.thumbnail,
    link:            buildItemLink(mlbId, catalogId),
    freteGratis:     it.shipping ? (it.shipping.free_shipping === true) : false,
    frete:           (it.shipping && it.shipping.free_shipping) ? 'Gratis' : 'Pago',
    envio:           (it.shipping && it.shipping.free_shipping) ? 'Mercado Envios (Gratis)' : 'Mercado Envios',
    avaliacoes:      (it.reviews && it.reviews.rating_average) ? it.reviews.rating_average.toFixed(1) : null,
    atributos:       extrairAtributos(it.attributes || []),
    variacoes,
    pictures:        (it.pictures || []).map(p => p.secure_url || p.url),
    seller,
    concorrentes,
    totalVendedores: ehCatalogo ? concorrentes.length : concorrentes.length + (seller ? 1 : 0),
    precoMin:        allPrecos[0] || it.price,
    precoMax:        allPrecos[allPrecos.length - 1] || it.price,
    precoMedio:      allPrecos.length ? Math.round(allPrecos.reduce((s, v) => s + v, 0) / allPrecos.length * 100) / 100 : it.price,
    ehCatalogo,
    catalogProductId: catalogId,
    fonte:            'items',
    paginasColetadas,
    analisadoEm:      new Date().toISOString(),
    pagina: 1, posicao: 1,
  };
}

// =============================================================================
// BUSCA VIA /products/{mlbId} — fallback
// =============================================================================

async function buscarViaProducts(mlbId, api, debug) {
  debug.push('🔍 Analisando via /products/' + mlbId + '...');
  const res = await api.get('/products/' + mlbId, { timeout: 12000 });
  const p   = res.data;

  const catalogoData = await buscarVendedoresCatalogo(mlbId, api, debug);
  const concorrentes = catalogoData.vendedores;
  const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
  const preco  = (p.buy_box_winner && p.buy_box_winner.price) ? p.buy_box_winner.price : (p.price || (precos[0] || 0));
  if (!precos.includes(preco) && preco > 0) precos.unshift(preco);
  precos.sort((a, b) => a - b);

  let seller = null;
  if (p.buy_box_winner && p.buy_box_winner.seller_id) {
    seller = await getSellerFullCached(p.buy_box_winner.seller_id, api);
    if (seller) debug.push('   → BuyBox: ' + seller.nome + ' | ' + seller.vendasStr);
  } else if (concorrentes.length) {
    seller = {
      nome: concorrentes[0].nome, reputacao: null,
      vendasStr: concorrentes[0].vendasStr, vendasNum: concorrentes[0].vendasNum,
      mercadoLider: concorrentes[0].mercadoLider, permalink: concorrentes[0].perfilLoja,
    };
  }

  const variacoes = (p.attributes || [])
    .filter(a => ['COLOR', 'VOLTAGE', 'FREQUENCY', 'POWER'].includes(a.id))
    .map(a => ({ nome: a.name, valor: a.value_name }));

  return {
    mlbId, titulo: p.name || p.title, preco, precoOriginal: preco,
    status: 'active', estoque: null, vendidos: null,
    vendas:       seller ? seller.vendasNum : 0,
    vendasStr:    seller ? seller.vendasStr : '0 vendas',
    vendasNum:    seller ? seller.vendasNum : 0,
    mercadoLider: seller ? seller.mercadoLider : null,
    condicao: 'Novo', tipoAnuncio: 'Catalogo',
    thumbnail: (p.pictures && p.pictures[0]) ? (p.pictures[0].url) : (concorrentes[0] ? concorrentes[0].thumbnail : null),
    link: buildItemLink(mlbId, mlbId),
    freteGratis: concorrentes[0] ? (concorrentes[0].freteGratis || false) : false,
    frete:  concorrentes[0] ? (concorrentes[0].frete || '—') : '—',
    envio:  concorrentes[0] ? (concorrentes[0].envio || 'Mercado Envios') : 'Mercado Envios',
    avaliacoes: (p.reviews && p.reviews.rating_average) ? p.reviews.rating_average.toFixed(1) : null,
    atributos: (p.attributes || []).filter(a => a.value_name).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name })),
    variacoes,
    pictures: (p.pictures || []).map(pic => pic.secure_url || pic.url),
    seller, concorrentes, totalVendedores: concorrentes.length,
    precoMin:  precos[0] || preco,
    precoMax:  precos[precos.length - 1] || preco,
    precoMedio: precos.length ? Math.round(precos.reduce((s, v) => s + v, 0) / precos.length * 100) / 100 : preco,
    ehCatalogo: true, catalogProductId: mlbId,
    fonte: 'products', paginasColetadas: catalogoData.paginas,
    analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1,
  };
}

// =============================================================================
// BUSCA VIA SCRAPING — ultimo recurso absoluto
// =============================================================================

async function buscarViaScraping(url, mlbId, debug) {
  const targetUrl = url.startsWith('http') ? url : buildItemLink(mlbId, mlbId);
  debug.push('🌐 Modo Extremo (Scraping): ' + targetUrl);
  let html = '';
  try {
    const res = await scraperAgent.get(targetUrl);
    html = res.data || '';
    if (html.includes('captcha') || html.includes('Verifica que eres un ser humano') || html.length < 10000) {
      html = await fetchWithPuppeteer(targetUrl, debug);
    }
  } catch (_) { html = await fetchWithPuppeteer(targetUrl, debug); }

  let titulo = null, preco = null, thumbnail = null;
  const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const ld  = JSON.parse(ldMatch[1]);
      titulo    = ld.name || ld.title || null;
      preco     = (ld.offers && ld.offers.price) ? parseFloat(ld.offers.price) : null;
      thumbnail = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
    } catch (_) {}
  }
  if (!titulo) { const og = html.match(/<meta property="og:title" content="([^"]+)"/i); if (og) titulo = og[1]; }
  if (!preco)  { const pm = html.match(/"price"\s*:\s*([\d.]+)/); if (pm) preco = parseFloat(pm[1]); }
  if (!titulo) throw new Error('Falha total na captura de dados da pagina');

  const vendedores = extrairVendedoresDoHTML(html, debug, mlbId);
  const maxPagina  = vendedores.length > 0 ? Math.max(...vendedores.map(v => v.pagina)) : 1;

  return {
    mlbId, titulo, preco: preco || 0, precoOriginal: preco || 0,
    status: 'active', estoque: null, vendidos: null,
    vendas:       (vendedores[0] ? vendedores[0].vendasNum : 0),
    vendasStr:    (vendedores[0] ? vendedores[0].vendasStr : '0 vendas'),
    vendasNum:    (vendedores[0] ? vendedores[0].vendasNum : 0),
    mercadoLider: (vendedores[0] ? vendedores[0].mercadoLider : null),
    condicao: 'Novo', tipoAnuncio: 'Catalogo',
    thumbnail, link: buildItemLink(mlbId, mlbId),
    freteGratis: false, frete: '—', envio: 'Mercado Envios',
    avaliacoes: null, atributos: [], variacoes: [],
    pictures: thumbnail ? [thumbnail] : [],
    seller: vendedores.length ? {
      nome: vendedores[0].nome, reputacao: null,
      vendasStr: vendedores[0].vendasStr, vendasNum: vendedores[0].vendasNum,
      mercadoLider: vendedores[0].mercadoLider, permalink: vendedores[0].perfilLoja,
    } : null,
    concorrentes: vendedores.slice(1), totalVendedores: vendedores.length,
    precoMin: preco || 0, precoMax: preco || 0, precoMedio: preco || 0,
    ehCatalogo: true, fonte: 'scraping',
    paginasColetadas: Array.from({ length: maxPagina }, (_, i) => i + 1),
    analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1,
  };
}

// =============================================================================
// CRUD ROUTES
// =============================================================================

router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });
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
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });
  try {
    const analises = await prisma.pesquisaMercadoIA.findMany({
      where: { usuarioId: parseInt(userId) }, orderBy: { createdAt: 'desc' }, take: 50,
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

// =============================================================================
// ROTA PRINCIPAL: GET /api/ml/research/:mlbId
// Cascata: /items → /products → Scraping
// =============================================================================

router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId } = req.params;
  const { userId, urlOriginal } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });

  const debug = ['🚀 Motor IA conectando ao ID: ' + mlbId];
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
    } catch (eA) { debug.push('⚠️  Falha /items/' + id + ': ' + (eA.message || '').substring(0, 60)); }
  }

  for (const id of todosIds) {
    try {
      const dados = await buscarViaProducts(id, api, debug);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json({ ...dados, debug });
    } catch (eB) { debug.push('⚠️  Falha /products/' + id + ': ' + (eB.message || '').substring(0, 60)); }
  }

  if (urlOriginal) {
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId, debug);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json({ ...dados, debug });
    } catch (eC) { debug.push('❌ Scraping falhou: ' + (eC.message || '').substring(0, 60)); }
  }

  const msg = debug.filter(l => l.startsWith('❌') || l.startsWith('⚠️')).join(' | ');
  await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
  res.status(404).json({ error: 'Anuncio nao encontrado', debug });
});

// =============================================================================
// POST /api/ml/research/deep-market — Analise IA (SSE streaming)
// =============================================================================

router.post('/api/ml/research/deep-market', async (req, res) => {
  const { userId, itens, perguntaFollowUp, contextoAnterior } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });
  if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ error: 'itens obrigatorio' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');

  try {
    send('log', { msg: '🚀 Iniciando Pesquisa de Inteligencia de Mercado...', tipo: 'info' });
    const analise = await realizarPesquisaMercadoProfunda(userId, itens, {
      onLog: (msg, tipo) => send('log', { msg, tipo }),
      perguntaFollowUp, contextoAnterior,
    });
    send('log', { msg: '✅ Analise concluida com sucesso!', tipo: 'success' });
    send('done', analise);
  } catch (e) {
    send('log', { msg: '❌ Erro: ' + e.message, tipo: 'error' });
    send('error', { error: e.message });
  } finally { res.end(); }
});

// =============================================================================
// POST /api/ml/research/market-save
// =============================================================================

router.post('/api/ml/research/market-save', async (req, res) => {
  const { userId, mlbIds, titulo, conteudoHtml, precoMedio } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' });
  try {
    const saved = await prisma.pesquisaMercadoIA.create({
      data: { usuarioId: parseInt(userId), mlbIds, titulo, conteudoHtml, precoMedio },
    });
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================================================
// HELPER: salvarHistorico
// =============================================================================

async function salvarHistorico(userId, mlbId, urlOriginal, dados, erro) {
  try {
    await prisma.pesquisaHistorico.upsert({
      where: { usuarioId_mlbId: { usuarioId: parseInt(userId), mlbId } },
      update: {
        urlOriginal: urlOriginal || mlbId,
        titulo: (dados && dados.titulo) ? dados.titulo : null,
        thumbnail: (dados && dados.thumbnail) ? dados.thumbnail : null,
        preco: (dados && dados.preco) ? dados.preco : null,
        dadosJson: dados ? JSON.stringify(dados) : null,
        erro: erro || null, status: erro ? 'erro' : 'concluido',
        updatedAt: new Date(), arquivado: false,
      },
      create: {
        usuarioId: parseInt(userId), mlbId, urlOriginal: urlOriginal || mlbId,
        titulo: (dados && dados.titulo) ? dados.titulo : null,
        thumbnail: (dados && dados.thumbnail) ? dados.thumbnail : null,
        preco: (dados && dados.preco) ? dados.preco : null,
        dadosJson: dados ? JSON.stringify(dados) : null,
        erro: erro || null, status: erro ? 'erro' : 'concluido',
        arquivado: false, excluido: false,
      },
    });
  } catch (_) {}
}

// =============================================================================
// ROTAS DE GERENCIAMENTO DE HISTORICO
// =============================================================================

router.put('/api/ml/research/historico/:id/arquivar',      async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:true} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/:id/restaurar',     async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:false} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id',            async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{excluido:true,excluidoEm:new Date()} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => { try { await prisma.pesquisaHistorico.delete({ where:{id:parseInt(req.params.id)} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/lote',           async (req, res) => { const{ids}=req.body; try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{excluido:true,excluidoEm:new Date()}}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/lote/arquivar',     async (req, res) => { const{ids}=req.body; try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{arquivado:true}}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });

export default router;