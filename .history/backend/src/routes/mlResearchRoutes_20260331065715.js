// backend/src/routes/mlResearchRoutes.js
// ============================================================
// VERSÃO REESCRITA — Março 2026
//
// MUDANÇAS CRÍTICAS vs versão anterior:
//   1. /products/$ID/items foi DESLIGADO pelo ML em 01/10/2025.
//      Removido completamente.
//   2. O scraping HTML agora usa extratores em cascata para os
//      padrões reais da página de catálogo (/p/MLB.../s):
//        a) _n.ctx.r  (padrão 2025 — Nordic rendering)
//        b) window.__NORDIC_RENDERING_CTX__
//        c) window.__PRELOADED_STATE__  (legado)
//        d) polycard JSON embutido nos <script type="application/json">
//        e) JSON-LD  (fallback)
//        f) Regex de preços  (último recurso)
//   3. Corrigido bug de encode duplo na URL (URLSearchParams já
//      encode; remover encodeURIComponent manual na chamada).
//   4. Endpoint ML público: GET /sites/MLB/search?catalog_product_id
//      (ainda funciona em 2025, sem token).
//   5. Estratégia F (Puppeteer) movida para DEPOIS de todas as
//      tentativas HTTP — evita overhead desnecessário.
//   6. Adicionado delay e backoff exponencial por estratégia.
// ============================================================

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const prisma  = new PrismaClient();
const router  = express.Router();

// ─────────────────────────────────────────────────────────────
// TOKEN ML
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// POOL DE USER-AGENTS + HELPERS ANTI-BLOQUEIO
// ─────────────────────────────────────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
];

const ACCEPT_LANGS = [
  'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'pt-BR,pt;q=0.95,en;q=0.5',
  'pt,pt-BR;q=0.9,en-US;q=0.8,en;q=0.6',
];

let uaIdx = 0;
function nextUA() { return UA_POOL[uaIdx++ % UA_POOL.length]; }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const humanDelay  = (min = 600, max = 1800) => sleep(min + Math.random() * (max - min));
const backoffDelay = (attempt, base = 3000) => sleep(Math.min(base * Math.pow(2, attempt) + Math.random() * 1000, 30000));

function criarScraperHumano(referer = 'https://www.mercadolivre.com.br/') {
  const ua   = nextUA();
  const lang = ACCEPT_LANGS[Math.floor(Math.random() * ACCEPT_LANGS.length)];
  const mob  = ua.includes('iPhone') || ua.includes('Android');
  return axios.create({
    timeout: 22000,
    headers: {
      'User-Agent'             : ua,
      'Accept'                 : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language'        : lang,
      'Accept-Encoding'        : 'gzip, deflate, br',
      'Cache-Control'          : 'no-cache',
      'Pragma'                 : 'no-cache',
      'Referer'                : referer,
      'Sec-Fetch-Dest'         : 'document',
      'Sec-Fetch-Mode'         : 'navigate',
      'Sec-Fetch-Site'         : 'same-origin',
      'Sec-Fetch-User'         : '?1',
      'Upgrade-Insecure-Requests': '1',
      'sec-ch-ua'              : mob ? undefined : '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile'       : mob ? '?1' : '?0',
      'sec-ch-ua-platform'     : mob ? '"iOS"' : '"Windows"',
    },
    maxRedirects: 5,
    decompress  : true,
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE FORMATAÇÃO
// ─────────────────────────────────────────────────────────────
function mapRep(level) {
  const m = { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' };
  return m[level] || 'novo';
}
function mapTipo(id) {
  const m = { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' };
  return m[id] || id || 'Clássico';
}
function formatarEnvio(shipping, hasFull, free) {
  if (hasFull
    || shipping?.logistic_type === 'fulfillment'
    || shipping?.tags?.includes('fulfillment')
    || shipping?.tags?.includes('self_service_in')
  ) return 'Full';
  const gratis = free
    || shipping?.free_shipping
    || shipping?.shipping_conditions === 'free_gap'
    || shipping?.shipping_conditions === 'free_ratio';
  return gratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios';
}
function formatarVendas(n) {
  if (!n) return '+100 vendas';
  if (n >= 50000) return '+50mil vendas';
  if (n >= 10000) return '+10mil vendas';
  if (n >= 5000)  return '+5mil vendas';
  if (n >= 1000)  return '+1000 vendas';
  if (n >= 500)   return '+500 vendas';
  if (n >= 100)   return '+100 vendas';
  if (n >= 50)    return '+50 vendas';
  return `+${n} vendas`;
}
function extrairVendasTexto(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('+') && s.includes('vendas')) return s;
  const m1 = s.match(/(\d+)\s*mil/i);
  if (m1) return `+${m1[1]}mil vendas`;
  const m2 = s.match(/(\d+)\s*vendas?/i);
  if (m2) return formatarVendas(parseInt(m2[1]));
  const n = parseInt(s.replace(/\D/g, ''));
  if (!isNaN(n) && n > 0) return formatarVendas(n);
  return null;
}
function extrairAtributos(attrs = []) {
  return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 14)
    .map(a => ({ nome: a.name, valor: a.value_name }));
}

// ─────────────────────────────────────────────────────────────
// CACHE DE SELLERS
// ─────────────────────────────────────────────────────────────
const sellerCache = new Map();
async function getSellerFull(sellerId, api) {
  if (!sellerId) return null;
  if (sellerCache.has(sellerId)) return sellerCache.get(sellerId);
  try {
    const sv = await api.get(`/users/${sellerId}`, { timeout: 6000 });
    const s  = sv.data;
    const info = {
      nome     : s.nickname || s.first_name || String(sellerId),
      reputacao: mapRep(s.seller_reputation?.level_id),
      vendas   : s.seller_reputation?.transactions?.completed || 0,
    };
    sellerCache.set(sellerId, info);
    return info;
  } catch { return { nome: String(sellerId), reputacao: null, vendas: null }; }
}

// ─────────────────────────────────────────────────────────────
// EXTRATOR CENTRAL DE VENDEDORES DO HTML
// Compatível com os múltiplos padrões que o ML usa em 2025:
//   1. _n.ctx.r  (Nordic Rendering — padrão atual)
//   2. window.__NORDIC_RENDERING_CTX__
//   3. window.__PRELOADED_STATE__  (legado)
//   4. <script type="application/json">  (polycard)
//   5. JSON-LD
//   6. Regex de fallback
// ─────────────────────────────────────────────────────────────
function extrairVendedoresDoHTML(html, targetUrl, pagina, debug) {
  const vendedores = [];

  // ── helpers ──────────────────────────────────────────────
  function tentarParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function extrairJsonPorMarcador(marcador, terminator = ';</script>') {
    const idx = html.indexOf(marcador);
    if (idx === -1) return null;
    const end = html.indexOf(terminator, idx);
    if (end === -1) return null;
    return html.substring(idx + marcador.length, end).trim();
  }

  // ── 1. _n.ctx.r  ─────────────────────────────────────────
  let state = null;
  let jsonStr = extrairJsonPorMarcador('_n.ctx.r=');
  if (jsonStr) state = tentarParse(jsonStr);

  // ── 2. __NORDIC_RENDERING_CTX__  ─────────────────────────
  if (!state) {
    jsonStr = extrairJsonPorMarcador('window.__NORDIC_RENDERING_CTX__ = ');
    if (jsonStr) state = tentarParse(jsonStr);
  }

  // ── 3. __PRELOADED_STATE__ = JSON.parse(  ────────────────
  if (!state) {
    const m3 = 'window.__PRELOADED_STATE__ = JSON.parse(';
    const i3 = html.indexOf(m3);
    if (i3 !== -1) {
      const e3 = html.indexOf(');', i3);
      if (e3 !== -1) {
        let raw = html.substring(i3 + m3.length, e3).trim();
        if (raw.startsWith('"') || raw.startsWith("'")) {
          raw = raw.slice(1, -1)
            .replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\'/g, "'")
            .replace(/\\n/g, '').replace(/\\r/g, '');
        }
        state = tentarParse(raw);
      }
    }
  }

  // ── 4. __PRELOADED_STATE__ literal  ──────────────────────
  if (!state) {
    jsonStr = extrairJsonPorMarcador('window.__PRELOADED_STATE__ = ');
    if (jsonStr) state = tentarParse(jsonStr);
  }

  // ── 5. Polycard: <script type="application/json">  ───────
  // O ML 2025 usa polycards que embutem os dados de cada
  // vendedor em tags <script type="application/json"> inline
  if (!state && html.includes('"type":"seller"')) {
    const matches = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of matches) {
      const d = tentarParse(m[1]);
      if (!d) continue;
      // Polycards de catálogo têm seller + price embutidos
      if (d?.components || d?.type === 'seller' || d?.seller || d?.price?.amount) {
        const nome  = d?.seller?.name || d?.seller?.nickname || d?.sellerName || '—';
        const preco = d?.price?.amount || d?.price?.value || d?.salePrice || 0;
        if (parseFloat(preco) > 0 || nome !== '—') {
          vendedores.push(montarVendedorFlat(d, nome, parseFloat(preco) || 0, targetUrl, pagina, vendedores.length + 1));
        }
      }
    }
    if (vendedores.length > 0) {
      debug.push(`  🃏 Polycard inline: ${vendedores.length} vendedores`);
      return vendedores;
    }
  }

  // ── Processar state se extraído  ─────────────────────────
  if (state) {
    debug.push(`  🧠 Estado JSON extraído (${JSON.stringify(state).length} chars)`);

    // Padrão A: components array (Nordic, padrão 2025)
    const componentsPaths = [
      state?.appProps?.pageProps?.initialState?.results?.items,
      state?.initialState?.results?.items,
      state?.results?.items,
      state?.pageProps?.initialState?.results?.items,
    ];
    for (const arr of componentsPaths) {
      if (!Array.isArray(arr) || !arr.length || !arr[0]?.components) continue;
      debug.push(`  🎯 Nordic components array: ${arr.length} itens`);
      arr.forEach((item, idx) => {
        const v = extrairDeComponentsArray(item.components, targetUrl, pagina, idx + 1);
        if (v) vendedores.push(v);
      });
      if (vendedores.length > 0) return vendedores;
    }

    // Padrão B: flat arrays (legado)
    const flatPaths = [
      state?.appProps?.pageProps?.initialState?.components?.track?.melidata_event?.event_data?.items,
      state?.components?.track?.melidata_event?.event_data?.items,
      state?.initialState?.components?.buyBox?.state?.buyingOptions,
      state?.components?.buyBox?.state?.buyingOptions,
      state?.appProps?.initialState?.components?.catalogBuyBox?.state?.items,
      state?.catalogProductResults?.items,
      state?.pageState?.catalogBuyBox?.items,
      state?.buyingOptions?.offers,
      state?.initialState?.catalogBuyBox?.items,
      state?.ui?.components?.buyBox?.state?.buyingOptions,
      // Novos caminhos 2025
      state?.pdpComponents?.buyBox?.buyingOptions,
      state?.pdpComponents?.buyBox?.state?.buyingOptions,
      state?.initialState?.pdpComponents?.buyBox?.state?.items,
      state?.catalogBuyBox?.state?.items,
    ];
    for (const arr of flatPaths) {
      if (!Array.isArray(arr) || !arr.length) continue;
      debug.push(`  🎯 Flat array: ${arr.length} itens`);
      arr.forEach((o, idx) => {
        const v = extrairDeFlat(o, targetUrl, pagina, idx + 1);
        if (v) vendedores.push(v);
      });
      if (vendedores.length > 0) return vendedores;
    }
  }

  // ── 6. JSON-LD fallback  ──────────────────────────────────
  if (vendedores.length === 0) {
    const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const ldm of ldMatches) {
      const ld = tentarParse(ldm[1]);
      if (!ld) continue;
      const offers = ld.offers ? (Array.isArray(ld.offers) ? ld.offers : [ld.offers]) : [];
      offers.forEach((o, idx) => {
        if (o.price && parseFloat(o.price) > 0) {
          vendedores.push({
            nome: o.seller?.name || '—', preco: parseFloat(o.price), precoOriginal: null,
            link: o.url || targetUrl, desconto: '0% OFF', thumbnail: null,
            titulo: ld.name || 'Anúncio Catálogo', freteGratis: false,
            envio: 'Mercado Envios', tipoAnuncio: 'Clássico',
            vendas: '+100 vendas', parcelamento: '—', pagina, posicao: idx + 1,
          });
        }
      });
      if (vendedores.length > 0) { debug.push(`  📦 JSON-LD: ${vendedores.length} ofertas`); break; }
    }
  }

  // ── 7. Regex agressivo de último recurso  ────────────────
  if (vendedores.length === 0) {
    const precoRx = /R\$\s*([\d.,]+)/g;
    const precos  = [...html.matchAll(precoRx)]
      .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
      .filter(v => v > 10 && v < 100000);
    if (precos.length > 0) {
      debug.push(`  🔍 Regex fallback: ${precos.length} preços`);
      [...new Set(precos)].slice(0, 10).forEach((preco, idx) => {
        vendedores.push({
          nome: '—', preco, precoOriginal: null, link: targetUrl, desconto: '0% OFF',
          thumbnail: null, titulo: 'Anúncio Catálogo', freteGratis: false,
          envio: 'Mercado Envios', tipoAnuncio: 'Clássico',
          vendas: '+100 vendas', parcelamento: '—', pagina, posicao: idx + 1,
        });
      });
    }
  }

  return vendedores;
}

// Helper: monta objeto vendedor a partir do formato components[]
function extrairDeComponentsArray(comps, link, pagina, posicao) {
  let nome = '—', preco = 0, precoOriginal = null, freteGratis = false;
  let isFull = false, vendasStr = '+100 vendas', parcelamento = '—';
  let desconto = '0% OFF', mercadoLider = null, thumbnail = null, titulo = 'Anúncio Catálogo';

  comps.forEach(comp => {
    if (comp.id === 'price' && comp.price) {
      preco = parseFloat(comp.price.value || comp.price.amount || 0);
      precoOriginal = comp.price.original_value || comp.price.original_amount || null;
      if (comp.discount_label?.value) desconto = `${comp.discount_label.value}% OFF`;
    }
    if (comp.id === 'seller') {
      nome = comp.seller?.name || comp.seller?.nickname || comp.title_value || comp.seller_info?.title || '—';
      (comp.subtitles || []).forEach(s => {
        if (s.text?.includes('vendas')) vendasStr = extrairVendasTexto(s.text) || vendasStr;
      });
      if (comp.seller_info?.power_seller_status?.title) mercadoLider = comp.seller_info.power_seller_status.title;
    }
    if (comp.id === 'shipping_summary') {
      const pt = (comp.title?.values?.promise?.text || comp.title?.text || '').toLowerCase();
      if (pt.includes('grátis') || pt.includes('gratis')) freteGratis = true;
      if (pt.includes('full')) isFull = true;
    }
    if (comp.id === 'payment_summary' && comp.title?.text) {
      parcelamento = comp.title.text;
    }
    if (comp.id === 'thumbnail' && comp.image) thumbnail = comp.image;
    if (comp.id === 'title' && comp.value) titulo = comp.value;
  });

  if (isFull) freteGratis = true;
  if (precoOriginal && parseFloat(precoOriginal) > preco && desconto === '0% OFF') {
    desconto = `${Math.round((1 - preco / parseFloat(precoOriginal)) * 100)}% OFF`;
  }

  if (preco <= 0 && nome === '—') return null;
  return {
    nome, preco: parseFloat(preco), precoOriginal: precoOriginal ? parseFloat(precoOriginal) : null,
    link, desconto, thumbnail, titulo, freteGratis,
    envio: isFull ? 'Full' : freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios',
    tipoAnuncio: 'Clássico', vendas: vendasStr, parcelamento, pagina, posicao, mercadoLider,
  };
}

// Helper: monta objeto vendedor a partir do formato flat (legado)
function extrairDeFlat(o, link, pagina, posicao) {
  const nome   = o.seller_name || o.seller?.nickname || o.seller?.name || o.sellerInfo?.nickname || o.sellerNickname || '—';
  const pRaw   = o.price?.amount || o.price?.value || o.salePrice || o.price;
  const preco  = typeof pRaw === 'object' ? (pRaw?.fraction || pRaw?.value || 0) : parseFloat(pRaw || 0);
  const pOrig  = o.original_price?.amount || o.original_price || o.originalPrice;
  const precoOriginal = pOrig ? (typeof pOrig === 'object' ? (pOrig?.fraction || pOrig?.value) : parseFloat(pOrig)) : null;

  if (isNaN(preco) && nome === '—') return null;

  const isFull = o.shipping?.logistic_type === 'fulfillment'
    || o.shipping?.tags?.includes('fulfillment')
    || o.has_full_filment === true
    || o.fulfillment === true;
  const freteGratis = o.shipping?.free_shipping === true || o.freeShipping === true;
  const descPct = o.discount?.rate
    ? `${Math.round(o.discount.rate * 100)}% OFF`
    : (precoOriginal && parseFloat(precoOriginal) > preco
      ? `${Math.round((1 - preco / parseFloat(precoOriginal)) * 100)}% OFF`
      : '0% OFF');

  let vendasStr = '+100 vendas';
  if (o.seller?.sales_text) vendasStr = extrairVendasTexto(o.seller.sales_text) || vendasStr;
  else if (o.sellerInfo?.sales_text) vendasStr = extrairVendasTexto(o.sellerInfo.sales_text) || vendasStr;
  else if (o.seller?.reputation?.metrics?.sales?.completed) vendasStr = formatarVendas(o.seller.reputation.metrics.sales.completed);

  return {
    nome, preco: parseFloat(preco) || 0,
    precoOriginal: precoOriginal ? parseFloat(precoOriginal) : null,
    link: o.permalink || o.item?.permalink || o.url || link,
    desconto: descPct,
    thumbnail: o.thumbnail || o.item?.thumbnail || null,
    titulo: o.title || o.item?.title || 'Anúncio Catálogo',
    freteGratis: freteGratis || isFull,
    envio: formatarEnvio(o.shipping || {}, isFull, freteGratis),
    tipoAnuncio: mapTipo(o.listing_type_id),
    vendas: vendasStr,
    parcelamento: o.installments?.quantity ? `${o.installments.quantity}x` : '—',
    pagina, posicao,
  };
}

function montarVendedorFlat(d, nome, preco, link, pagina, posicao) {
  return {
    nome, preco, precoOriginal: null,
    link: d?.permalink || d?.url || link,
    desconto: '0% OFF', thumbnail: d?.thumbnail || null,
    titulo: d?.title || 'Anúncio Catálogo',
    freteGratis: d?.shipping?.free_shipping === true,
    envio: 'Mercado Envios', tipoAnuncio: 'Clássico',
    vendas: '+100 vendas', parcelamento: '—', pagina, posicao,
  };
}

// ─────────────────────────────────────────────────────────────
// MOTOR DE SCRAPING PAGINADO COM MÚLTIPLAS ESTRATÉGIAS
// Cada página tenta: HTTP humano → Mobile → API pública ML →
//                   Cookie simulado → Puppeteer Stealth
// ─────────────────────────────────────────────────────────────
async function buscarViaScraping(urlOriginal, mlbId, debug) {
  // Normalizar a URL base: sempre /p/MLB.../s
  let baseUrl = urlOriginal.split('?')[0].split('#')[0];
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://www.mercadolivre.com.br/p/${mlbId}/s`;
  }
  if (/\/p\/MLB\d+$/.test(baseUrl)) baseUrl += '/s';
  if (!baseUrl.includes('/p/MLB')) {
    baseUrl = `https://www.mercadolivre.com.br/p/${mlbId}/s`;
  }

  debug.push(`🌐 Scraping iniciado: ${baseUrl}`);

  let todosVendedores = [];
  let page = 1, offset = 0;
  let tituloBase = null, precoBase = 0, thumbnailBase = null;
  let errorsConsec = 0;
  const MAX_ERROS = 3;

  while (page <= 40 && errorsConsec < MAX_ERROS) {
    // CORREÇÃO CRÍTICA: URL sem encode duplo
    const urlPage = `${baseUrl}?page=${page}`;
    debug.push(`📡 Pág ${page}: ${urlPage}`);

    let html = null, estrategia = null;

    // ── ESTRATÉGIA A: Axios humano com UA rotativo  ────────
    for (let t = 0; t < 3 && !html; t++) {
      try {
        if (t > 0) { await backoffDelay(t - 1, 2000); debug.push(`  🔄 Re-tentativa A${t}`); }
        const referer = page > 1 ? `${baseUrl}?page=${page - 1}` : 'https://www.mercadolivre.com.br/';
        const scraper = criarScraperHumano(referer);
        const res = await scraper.get(urlPage);
        if (res.data && typeof res.data === 'string' && res.data.length > 2000) {
          // Verificar se não é captcha
          if (!res.data.includes('Verifique se você é humano') && !res.data.includes('datadome')) {
            html = res.data;
            estrategia = `axios_ua${uaIdx % UA_POOL.length}`;
          } else {
            debug.push(`  ⚠️ A${t}: DataDome detectado`);
          }
        }
      } catch (e) { debug.push(`  ⚠️ A${t}: ${e.message?.substring(0, 50)}`); }
    }

    // ── ESTRATÉGIA B: Mobile Android UA  ──────────────────
    if (!html) {
      try {
        await humanDelay(1000, 2500);
        const mobileUA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
        const sc = axios.create({
          timeout: 18000,
          headers: {
            'User-Agent'   : mobileUA,
            'Accept'       : 'text/html,application/xhtml+xml,*/*;q=0.9',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Referer'      : 'https://www.mercadolivre.com.br/',
            'sec-ch-ua-mobile': '?1',
          },
          decompress: true,
        });
        const res = await sc.get(urlPage);
        if (res.data && typeof res.data === 'string' && res.data.length > 1000
            && !res.data.includes('Verifique se você é humano')) {
          html = res.data; estrategia = 'mobile_android';
          debug.push(`  📱 Estratégia B (mobile) OK`);
        }
      } catch (e) { debug.push(`  ⚠️ B: ${e.message?.substring(0, 40)}`); }
    }

    // ── ESTRATÉGIA C: API pública ML /sites/MLB/search  ────
    // (Funciona sem token — busca por catalog_product_id)
    if (!html) {
      try {
        await humanDelay(1500, 3000);
        const limit = 20;
        const off   = (page - 1) * limit;
        const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${mlbId}&limit=${limit}&offset=${off}&sort=price_asc`;
        const res = await axios.get(apiUrl, {
          timeout: 12000,
          headers: { 'Accept': 'application/json', 'Accept-Language': 'pt-BR' },
        });
        if (res.data?.results?.length > 0) {
          const items = res.data.results;
          debug.push(`  🔌 Estratégia C (API pública MLB): ${items.length} itens`);
          items.forEach((item, idx) => {
            const isFull = item.shipping?.logistic_type === 'fulfillment'
              || item.shipping?.tags?.includes('fulfillment');
            const free   = item.shipping?.free_shipping === true;
            todosVendedores.push({
              nome       : item.seller?.nickname || String(item.seller_id || '—'),
              preco      : item.price || 0,
              precoOriginal: item.original_price || null,
              link       : item.permalink || '',
              desconto   : item.original_price && item.original_price > item.price
                ? `${Math.round((1 - item.price / item.original_price) * 100)}% OFF`
                : '0% OFF',
              thumbnail  : item.thumbnail || null,
              titulo     : item.title || 'Anúncio Catálogo',
              freteGratis: free || isFull,
              envio      : formatarEnvio(item.shipping || {}, isFull, free),
              tipoAnuncio: mapTipo(item.listing_type_id),
              vendas     : formatarVendas(item.sold_quantity),
              parcelamento: '—',
              pagina     : page,
              posicao    : offset + idx + 1,
            });
          });
          offset += items.length;
          errorsConsec = 0;

          // Buscar título/thumbnail do produto
          if (page === 1 && !tituloBase && res.data.results[0]?.title) {
            tituloBase    = res.data.results[0].title;
            precoBase     = res.data.results[0].price || 0;
            thumbnailBase = res.data.results[0].thumbnail || null;
          }

          page++;
          if (items.length < limit || !res.data.paging?.total || off + limit >= res.data.paging.total) {
            debug.push(`✅ API pública: sem mais páginas`);
            break;
          }
          await humanDelay(800, 1500);
          continue; // pula o bloco HTML abaixo
        }
      } catch (e) { debug.push(`  ⚠️ C (API pública): ${e.message?.substring(0, 50)}`); }
    }

    // ── ESTRATÉGIA D: URL alternativa /noindex/catalog/  ──
    if (!html) {
      try {
        await humanDelay(1200, 2500);
        const cleanId = mlbId.replace(/^MLB/i, '');
        const altUrl  = `https://www.mercadolivre.com.br/noindex/catalog/buybox/MLB${cleanId}?page=${page}`;
        const sc = criarScraperHumano(`https://www.mercadolivre.com.br/p/MLB${cleanId}`);
        const res = await sc.get(altUrl);
        if (res.data && typeof res.data === 'string' && res.data.length > 500
            && !res.data.includes('Verifique se você é humano')) {
          html = res.data; estrategia = 'noindex_buybox';
          debug.push(`  🏪 Estratégia D (noindex buybox) OK`);
        }
      } catch (e) { debug.push(`  ⚠️ D: ${e.message?.substring(0, 40)}`); }
    }

    // ── ESTRATÉGIA E: Cookie simulado  ────────────────────
    if (!html) {
      try {
        await humanDelay(2000, 4000);
        const sc = criarScraperHumano('https://www.mercadolivre.com.br/');
        sc.defaults.headers['Cookie'] = `_d2id=mlbr_${Date.now()}_${Math.random().toString(36).substring(2)}; _ml_ci=anonymous; MLBR_SESSION=1`;
        sc.defaults.headers['X-Forwarded-For'] = `177.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
        const res = await sc.get(urlPage);
        if (res.data && typeof res.data === 'string' && res.data.length > 500
            && !res.data.includes('Verifique se você é humano')) {
          html = res.data; estrategia = 'cookie_simulado';
          debug.push(`  🍪 Estratégia E (cookie) OK`);
        }
      } catch (e) { debug.push(`  ⚠️ E: ${e.message?.substring(0, 40)}`); }
    }

    // ── ESTRATÉGIA F: Puppeteer Stealth  ──────────────────
    // Só acionado se todas as estratégias HTTP falharam
    if (!html) {
      let browser;
      try {
        await humanDelay(1500, 3000);
        debug.push(`  🤖 Estratégia F (Puppeteer Stealth) para pág ${page}...`);
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
            '--no-zygote', '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1366,768',
          ],
        });
        const pg = await browser.newPage();
        await pg.setUserAgent(nextUA());
        await pg.setViewport({ width: 1366, height: 768 });
        await pg.setExtraHTTPHeaders({
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        });

        // Simular navegação humana real: ir à home primeiro
        await pg.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await sleep(1200 + Math.random() * 800);

        await pg.goto(urlPage, { waitUntil: 'networkidle2', timeout: 40000 });

        // Simular scroll e movimentos
        await pg.evaluate(() => window.scrollBy(0, 300)).catch(() => {});
        await sleep(800);
        await pg.mouse.move(200 + Math.random() * 400, 200 + Math.random() * 300);
        await sleep(600);
        await pg.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
        await sleep(1000);

        const isCaptcha = await pg.evaluate(() =>
          document.title.toLowerCase().includes('captcha') ||
          document.body?.innerHTML?.includes('Verifique se você é humano') ||
          document.body?.innerHTML?.includes('datadome')
        ).catch(() => false);

        if (!isCaptcha) {
          html = await pg.content();
          estrategia = 'puppeteer_stealth';
          debug.push(`  ✅ Puppeteer OK (${html.length} chars)`);
        } else {
          debug.push(`  ❌ Puppeteer: captcha na pág ${page}`);
        }
        await browser.close().catch(() => {});
      } catch (e) {
        if (browser) await browser.close().catch(() => {});
        debug.push(`  ⚠️ F (Puppeteer): ${e.message?.substring(0, 50)}`);
      }
    }

    // ── Processar HTML obtido  ─────────────────────────────
    if (html) {
      errorsConsec = 0;
      debug.push(`  ✅ HTML via ${estrategia} (${html.length} chars)`);

      // Extrair título/thumbnail da pág 1
      if (page === 1 && !tituloBase) {
        const ldm = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
        if (ldm) {
          try {
            const ld  = JSON.parse(ldm[1]);
            tituloBase    = ld.name || ld.title || null;
            precoBase     = ld.offers?.price ? parseFloat(ld.offers.price) : 0;
            thumbnailBase = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
          } catch {}
        }
        if (!tituloBase) {
          const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (tm) tituloBase = tm[1].replace(/\s*[-|]\s*Mercado Livre.*/i, '').trim();
          else tituloBase = `Catálogo ${mlbId}`;
        }
        if (!thumbnailBase) {
          const og = html.match(/<meta property="og:image" content="([^"]+)"/i);
          if (og) thumbnailBase = og[1];
        }
      }

      const vPag = extrairVendedoresDoHTML(html, urlPage, page, debug);

      if (vPag.length > 0) {
        // Detectar repetição (paginação chegou ao fim)
        if (page > 1 && todosVendedores.length > 0) {
          const ultimos = todosVendedores.slice(-vPag.length);
          const repetido = vPag[0] && ultimos.some(v =>
            v.nome === vPag[0].nome && Math.abs(v.preco - vPag[0].preco) < 0.01
          );
          if (repetido) { debug.push(`✅ Paginação encerrada (repetição pág ${page})`); break; }
        }

        const formatados = vPag.map((v, i) => ({ ...v, posicao: offset + i + 1 }));
        todosVendedores.push(...formatados);
        offset += vPag.length;
        debug.push(`  📊 Pág ${page}: ${vPag.length} vendedores (total: ${todosVendedores.length})`);
        page++;
        await humanDelay(800, 1800);
      } else {
        debug.push(`⚠️ Pág ${page}: HTML ok mas sem vendedores. Encerrando.`);
        break;
      }
    } else {
      errorsConsec++;
      debug.push(`❌ Todas estratégias falharam pág ${page} (${errorsConsec}/${MAX_ERROS})`);
      if (errorsConsec < MAX_ERROS) await backoffDelay(errorsConsec, 5000);
    }
  }

  if (todosVendedores.length === 0) {
    throw new Error('Nenhum vendedor encontrado por nenhuma estratégia de scraping.');
  }

  const principal   = todosVendedores[0];
  const concorrentes = todosVendedores.slice(1);
  const precos      = todosVendedores.map(v => v.preco).filter(p => p > 0);

  return {
    mlbId,
    titulo     : tituloBase || principal.titulo || `Catálogo ${mlbId}`,
    preco      : precoBase || principal.preco || 0,
    status     : 'active',
    estoque    : null, vendidos: null,
    vendas     : principal.vendas || formatarVendas(null),
    condicao   : 'Novo',
    tipoAnuncio: 'Catálogo',
    thumbnail  : thumbnailBase || principal.thumbnail || null,
    link       : baseUrl,
    freteGratis: principal.freteGratis || false,
    frete      : principal.freteGratis ? 'Grátis' : 'Pago',
    envio      : principal.envio || 'Mercado Envios',
    avaliacoes : null,
    atributos  : [],
    seller     : { nome: principal.nome, reputacao: null, vendas: null },
    concorrentes,
    totalVendedores: todosVendedores.length,
    precoMin   : precos.length ? Math.min(...precos) : 0,
    precoMax   : precos.length ? Math.max(...precos) : 0,
    precoMedio : precos.length ? Math.round(precos.reduce((a, b) => a + b, 0) / precos.length) : 0,
    ehCatalogo : true,
    fonte      : 'scraping_multi_estrategia',
    analisadoEm: new Date().toISOString(),
    pagina     : principal.pagina || 1,
    posicao    : principal.posicao || 1,
    paginasColetadas: [...new Set(todosVendedores.map(v => v.pagina))].sort((a, b) => a - b),
  };
}

// ─────────────────────────────────────────────────────────────
// FALLBACK: API OFICIAL (com token)
// Tenta /items/$ID primeiro; se 404, tenta /products/$ID
// NOTA: /products/$ID/items foi DESLIGADO em 01/10/2025.
//       Usar /sites/MLB/search?catalog_product_id no lugar.
// ─────────────────────────────────────────────────────────────
async function buscarItemAPI(mlbId, api, debug) {
  debug.push(`🔍 API oficial: /items/${mlbId}`);

  let it;
  try {
    const res = await api.get(`/items/${mlbId}`, {
      params: {
        attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,condition,status,warranty,attributes,catalog_product_id,catalog_listing',
      },
      timeout: 12000,
    });
    it = res.data;
  } catch (err) {
    if (err.response?.status === 404) {
      debug.push(`⚠️ Não é item — tentando /products/${mlbId}`);
      try {
        const pRes = await api.get(`/products/${mlbId}`, { timeout: 12000 });
        const p = pRes.data;

        // Buscar concorrentes via search (substitui /products/$ID/items)
        let concorrentes = [];
        try {
          const sRes = await api.get('/sites/MLB/search', {
            params: { catalog_product_id: mlbId, limit: 40, sort: 'price_asc' },
            timeout: 10000,
          });
          for (const r of (sRes.data?.results || []).slice(0, 30)) {
            const snome = r.seller?.nickname || String(r.seller_id || '—');
            const free  = r.shipping?.free_shipping === true;
            const full  = r.shipping?.logistic_type === 'fulfillment';
            concorrentes.push({
              nome: snome, preco: r.price || 0, precoOriginal: r.original_price || null,
              link: r.permalink || '', desconto: r.original_price && r.original_price > r.price
                ? `${Math.round((1 - r.price / r.original_price) * 100)}% OFF` : '0% OFF',
              thumbnail: r.thumbnail || null, titulo: r.title || '',
              freteGratis: free || full, envio: formatarEnvio(r.shipping || {}, full, free),
              tipoAnuncio: mapTipo(r.listing_type_id),
              vendas: formatarVendas(r.sold_quantity),
              parcelamento: '—', pagina: 1, posicao: concorrentes.length + 1,
            });
          }
        } catch (se) { debug.push(`  ⚠️ search concorrentes: ${se.message?.substring(0, 50)}`); }

        const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
        return {
          mlbId, titulo: p.name || p.title, preco: concorrentes[0]?.preco || 0,
          status: 'active', estoque: null, vendidos: null, vendas: '—',
          condicao: 'Novo', tipoAnuncio: 'Catálogo',
          thumbnail: p.pictures?.[0]?.url || concorrentes[0]?.thumbnail || null,
          link: `https://www.mercadolivre.com.br/p/${mlbId}`,
          freteGratis: concorrentes[0]?.freteGratis ?? false,
          frete: concorrentes[0]?.freteGratis ? 'Grátis' : 'Pago',
          envio: concorrentes[0]?.envio || '—',
          avaliacoes: p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
          atributos: (p.attributes || []).filter(a => a.value_name).slice(0, 14)
            .map(a => ({ nome: a.name, valor: a.value_name })),
          seller: concorrentes.length ? { nome: concorrentes[0].nome, reputacao: null, vendas: null } : null,
          concorrentes, totalVendedores: concorrentes.length,
          precoMin: precos.length ? Math.min(...precos) : 0,
          precoMax: precos.length ? Math.max(...precos) : 0,
          precoMedio: precos.length ? Math.round(precos.reduce((a, b) => a + b, 0) / precos.length) : 0,
          ehCatalogo: true, catalogProductId: mlbId,
          fonte: 'api_products_search', analisadoEm: new Date().toISOString(),
          pagina: 1, posicao: 1, paginasColetadas: [1],
        };
      } catch (pe) {
        throw new Error(`/items 404, /products falhou: ${pe.message}`);
      }
    }
    throw err;
  }

  const seller = await getSellerFull(it.seller_id, api);
  debug.push(`   → ${it.title?.substring(0, 50)} | R$ ${it.price}`);

  // Concorrentes via search
  let concorrentes = [];
  const catalogId = it.catalog_product_id;
  if (it.catalog_listing && catalogId) {
    try {
      const sRes = await api.get('/sites/MLB/search', {
        params: { catalog_product_id: catalogId, limit: 40, sort: 'price_asc' },
        timeout: 10000,
      });
      for (const r of (sRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 30)) {
        const snome = r.seller?.nickname || String(r.seller_id || '—');
        const free  = r.shipping?.free_shipping === true;
        const full  = r.shipping?.logistic_type === 'fulfillment';
        concorrentes.push({
          nome: snome, preco: r.price || 0, precoOriginal: r.original_price || null,
          link: r.permalink || '', desconto: r.original_price && r.original_price > r.price
            ? `${Math.round((1 - r.price / r.original_price) * 100)}% OFF` : '0% OFF',
          thumbnail: r.thumbnail || null, titulo: r.title || '',
          freteGratis: free || full, envio: formatarEnvio(r.shipping || {}, full, free),
          tipoAnuncio: mapTipo(r.listing_type_id),
          vendas: formatarVendas(r.sold_quantity),
          parcelamento: '—', pagina: 1, posicao: concorrentes.length + 1,
        });
      }
      concorrentes.sort((a, b) => a.preco - b.preco);
    } catch (se) { debug.push(`  ⚠️ search catálogo: ${se.message?.substring(0, 50)}`); }
  }

  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a, b) => a - b);
  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null,
    status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
    vendas: formatarVendas(it.sold_quantity),
    condicao: it.condition === 'new' ? 'Novo' : 'Usado',
    tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: it.permalink,
    freteGratis: it.shipping?.free_shipping === true,
    frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago',
    envio: formatarEnvio(it.shipping, false, it.shipping?.free_shipping),
    avaliacoes: null,
    atributos: extrairAtributos(it.attributes || []),
    seller, concorrentes,
    totalVendedores: concorrentes.length + 1,
    precoMin: allPrecos[0] ?? it.price,
    precoMax: allPrecos[allPrecos.length - 1] ?? it.price,
    precoMedio: allPrecos.length ? Math.round(allPrecos.reduce((s, v) => s + v, 0) / allPrecos.length * 100) / 100 : it.price,
    ehCatalogo: !!(it.catalog_listing || it.catalog_product_id),
    catalogProductId: it.catalog_product_id || null,
    fonte: 'api_items', analisadoEm: new Date().toISOString(),
    pagina: 1, posicao: 1, paginasColetadas: [1],
  };
}

// ─────────────────────────────────────────────────────────────
// PERSISTÊNCIA NO HISTÓRICO
// ─────────────────────────────────────────────────────────────
async function salvarHistorico(userId, mlbId, urlOriginal, dados, erro) {
  try {
    await prisma.pesquisaHistorico.upsert({
      where  : { usuarioId_mlbId: { usuarioId: parseInt(userId), mlbId } },
      update : {
        urlOriginal: urlOriginal || mlbId,
        titulo     : dados?.titulo    || null,
        thumbnail  : dados?.thumbnail || null,
        preco      : dados?.preco     || null,
        dadosJson  : dados ? JSON.stringify(dados) : null,
        erro       : erro  || null,
        status     : erro  ? 'erro' : 'concluido',
        updatedAt  : new Date(),
        arquivado  : false,
      },
      create : {
        usuarioId  : parseInt(userId),
        mlbId, urlOriginal: urlOriginal || mlbId,
        titulo     : dados?.titulo    || null,
        thumbnail  : dados?.thumbnail || null,
        preco      : dados?.preco     || null,
        dadosJson  : dados ? JSON.stringify(dados) : null,
        erro       : erro  || null,
        status     : erro  ? 'erro' : 'concluido',
        arquivado  : false,
        excluido   : false,
      },
    });
  } catch (e) { console.warn('[Research] Histórico:', e.message?.substring(0, 60)); }
}

// ─────────────────────────────────────────────────────────────
// ROTAS REST
// ─────────────────────────────────────────────────────────────

// ── Histórico  ────────────────────────────────────────────────
router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const itens = await prisma.pesquisaHistorico.findMany({
      where    : { usuarioId: parseInt(userId), excluido: false, arquivado: arquivado === 'true' },
      orderBy  : { updatedAt: 'desc' },
      take     : 200,
    });
    res.json(itens.map(i => ({ ...i, dadosJson: i.dadosJson ? JSON.parse(i.dadosJson) : null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Análises de Mercado IA  ───────────────────────────────────
router.get('/api/ml/research/market-analyses', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const analises = await prisma.pesquisaMercadoIA.findMany({
      where  : { usuarioId: parseInt(userId) },
      orderBy: { createdAt: 'desc' },
      take   : 50,
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

// ── ROTA PRINCIPAL DE PESQUISA  ───────────────────────────────
// Ordem de tentativa:
//   1. Scraping multi-estratégia (se urlOriginal fornecida)
//   2. API oficial com token  → /items/$ID  → /products/$ID
//   3. Erro
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId } = req.params;
  const { userId, urlOriginal } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

  const debug = [`🚀 Análise: ${mlbId}`];
  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message, debug }); }

  // ── 1. Scraping (prioridade se tiver URL)  ─────────────────
  if (urlOriginal) {
    debug.push(`📍 URL detectada → scraping multi-estratégia`);
    try {
      // CORREÇÃO: não usar encodeURIComponent aqui — a URL já vem decoded pelo Express
      const urlDecoded = decodeURIComponent(urlOriginal);
      const dados = await buscarViaScraping(urlDecoded, mlbId, debug);
      await salvarHistorico(userId, mlbId, urlDecoded, dados, null);
      return res.json({ ...dados, debug });
    } catch (e) {
      debug.push(`❌ Scraping falhou: ${e.message}`);
    }
  }

  // ── 2. API oficial com token  ──────────────────────────────
  try {
    const dados = await buscarItemAPI(mlbId, api, debug);
    await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
    return res.json({ ...dados, debug });
  } catch (eA) {
    debug.push(`⚠️ API falhou: ${eA.response?.status || eA.message?.substring(0, 60)}`);
  }

  // ── 3. Scraping sem URL (só com MLB ID)  ───────────────────
  if (!urlOriginal) {
    debug.push(`🌐 Tentando scraping sem URL (gerada automaticamente)`);
    try {
      const autoUrl = `https://www.mercadolivre.com.br/p/${mlbId}/s`;
      const dados   = await buscarViaScraping(autoUrl, mlbId, debug);
      await salvarHistorico(userId, mlbId, autoUrl, dados, null);
      return res.json({ ...dados, debug });
    } catch (eS) {
      debug.push(`❌ Scraping auto falhou: ${eS.message}`);
    }
  }

  const msg = debug.filter(l => l.startsWith('❌') || l.startsWith('⚠️')).join(' | ');
  await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
  res.status(404).json({ error: 'Anúncio não encontrado', debug });
});

// ── Pesquisa de Mercado Profunda (SSE)  ──────────────────────
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
    send('log', { msg: `📦 Analisando ${itens.length} produto(s)`, tipo: 'info' });
    if (perguntaFollowUp && contextoAnterior) {
      send('log', { msg: `❓ Follow-up: "${perguntaFollowUp.substring(0, 60)}..."`, tipo: 'info' });
    }
    send('log', { msg: '🌐 Pesquisa web em tempo real...', tipo: 'info' });
    const analise = await realizarPesquisaMercadoProfunda(userId, itens, {
      onLog: (msg, tipo) => send('log', { msg, tipo }),
      perguntaFollowUp, contextoAnterior,
    });
    send('log', { msg: '✅ Análise concluída!', tipo: 'success' });
    send('done', analise);
  } catch (e) {
    send('log', { msg: `❌ Erro: ${e.message}`, tipo: 'error' });
    send('error', { error: e.message });
  } finally { res.end(); }
});

// ── Salvar análise de mercado  ────────────────────────────────
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

// ── CRUD histórico  ───────────────────────────────────────────
router.put   ('/api/ml/research/historico/:id/arquivar',      async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:true}  }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put   ('/api/ml/research/historico/:id/restaurar',     async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:false} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id',               async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{excluido:true,excluidoEm:new Date()} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id/definitivo',    async (req, res) => { try { await prisma.pesquisaHistorico.delete({ where:{id:parseInt(req.params.id)} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/lote',              async (req, res) => { const{ids}=req.body; if(!Array.isArray(ids)) return res.status(400).json({error:'ids obrigatório'}); try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{excluido:true,excluidoEm:new Date()}}); res.json({ok:true,count:ids.length}); } catch(e){res.status(500).json({error:e.message});} });
router.put   ('/api/ml/research/historico/lote/arquivar',     async (req, res) => { const{ids}=req.body; if(!Array.isArray(ids)) return res.status(400).json({error:'ids obrigatório'}); try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{arquivado:true}}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });

export default router;