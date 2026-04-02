// backend/src/routes/mlResearchRoutes.js
import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Ativa o plugin Stealth para mascarar o navegador e evitar o Captcha (DataDome)
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
    timeout: 18000,
  });
}

// ============================================================================
// POOL DE USER-AGENTS REAIS (rotação anti-bloqueio)
// ============================================================================
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
];

const ACCEPT_LANGS = [
  'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'pt-BR,pt;q=0.95,en;q=0.5',
  'pt,pt-BR;q=0.9,en-US;q=0.8,en;q=0.6',
];

let uaIndex = 0;
function getNextUA() {
  const ua = UA_POOL[uaIndex % UA_POOL.length];
  uaIndex++;
  return ua;
}

function humanDelay(minMs = 600, maxMs = 1800) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise(r => setTimeout(r, ms));
}

function backoffDelay(attempt, baseMs = 3000) {
  const ms = baseMs * Math.pow(2, attempt) + Math.random() * 1000;
  return new Promise(r => setTimeout(r, Math.min(ms, 30000)));
}

function criarScraperHumano(referer = 'https://www.mercadolivre.com.br/') {
  const ua = getNextUA();
  const lang = ACCEPT_LANGS[Math.floor(Math.random() * ACCEPT_LANGS.length)];
  const isMobile = ua.includes('iPhone') || ua.includes('Android');
  
  return axios.create({
    timeout: 20000,
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': lang,
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': referer,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'sec-ch-ua': isMobile ? undefined : '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
      'sec-ch-ua-platform': isMobile ? '"iOS"' : '"Windows"',
    },
    maxRedirects: 5,
    decompress: true,
    withCredentials: false,
  });
}

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

function formatarEnvio(shippingInfo, hasFulfillment, freeShipping) {
  if (hasFulfillment 
    || shippingInfo?.logistic_type === 'fulfillment'
    || shippingInfo?.tags?.includes('fulfillment')
    || shippingInfo?.tags?.includes('self_service_in')
  ) return 'Full';
  
  const gratis = freeShipping 
    || shippingInfo?.free_shipping 
    || shippingInfo?.shipping_conditions === 'free_gap'
    || shippingInfo?.shipping_conditions === 'free_ratio';
  
  if (gratis) return 'Mercado Envios (Grátis)';
  return 'Mercado Envios';
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

function extrairVendasTexto(rawText) {
  if (!rawText) return null;
  const s = String(rawText).trim();
  if (s.startsWith('+') && s.includes('vendas')) return s;
  const m = s.match(/(\d+)\s*mil/i);
  if (m) return `+${m[1]}mil vendas`;
  const m2 = s.match(/(\d+)\s*vendas?/i);
  if (m2) return formatarVendas(parseInt(m2[1]));
  const num = parseInt(s.replace(/\D/g,''));
  if (!isNaN(num) && num > 0) return formatarVendas(num);
  return null;
}

function extrairAtributos(attrs = []) {
  return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name }));
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
// NOVO EXTRATOR NATIVO (COMPATÍVEL COM __NORDIC_RENDERING_CTX__)
// ============================================================================
function extrairVendedoresDoHTML(html, targetUrl, paginaAtual, debug) {
  const vendedores = [];
  let state = null;
  let jsonStr = null;

  // 1. Tentar _n.ctx.r (Novo Padrão ML Catálogo)
  const marker1 = '_n.ctx.r=';
  let idx = html.indexOf(marker1);
  if (idx !== -1) {
    const endIdx = html.indexOf(';</script>', idx);
    if (endIdx !== -1) {
       jsonStr = html.substring(idx + marker1.length, endIdx).trim();
    }
  }

  // 2. Tentar window.__NORDIC_RENDERING_CTX__
  if (!jsonStr) {
    const marker2 = 'window.__NORDIC_RENDERING_CTX__ = ';
    idx = html.indexOf(marker2);
    if (idx !== -1) {
      const endIdx = html.indexOf(';</script>', idx);
      if (endIdx !== -1) {
        jsonStr = html.substring(idx + marker2.length, endIdx).trim();
      }
    }
  }
  
  // 3. Tentar window.__PRELOADED_STATE__ = JSON.parse(
  if (!jsonStr) {
    const marker3 = 'window.__PRELOADED_STATE__ = JSON.parse(';
    idx = html.indexOf(marker3);
    if (idx !== -1) {
      const endIdx = html.indexOf(');', idx);
      if (endIdx !== -1) {
         let raw = html.substring(idx + marker3.length, endIdx).trim();
         if (raw.startsWith('"') || raw.startsWith("'")) {
           raw = raw.substring(1, raw.length - 1);
           raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\'/g, "'");
         }
         jsonStr = raw;
      }
    }
  }
  
  // 4. Tentar window.__PRELOADED_STATE__ literal
  if (!jsonStr) {
    const marker4 = 'window.__PRELOADED_STATE__ = ';
    idx = html.indexOf(marker4);
    if (idx !== -1) {
      const endIdx = html.indexOf(';</script>', idx);
      if (endIdx !== -1) {
        jsonStr = html.substring(idx + marker4.length, endIdx).trim();
      }
    }
  }

  if (jsonStr) {
    try {
      state = JSON.parse(jsonStr);
      debug.push(`  🧠 Estado JSON extraído com sucesso (${jsonStr.length} chars)`);
    } catch (e) {
      debug.push(`  ⚠️ Falha ao fazer parse do JSON: ${e.message}`);
    }
  }

  if (state) {
    let itemsExtracted = false;

    // TIPO 1: Padrão components array (Novo Catálogo - O que você mandou na issue)
    const componentsPaths = [
      state?.appProps?.pageProps?.initialState?.results?.items,
      state?.initialState?.results?.items,
      state?.results?.items
    ];

    for (const arr of componentsPaths) {
      if (Array.isArray(arr) && arr.length > 0 && arr[0].components) {
        debug.push(`  🎯 Extraindo ${arr.length} opções (Formato Components Array)`);
        arr.forEach((item, index) => {
          let nome = '—';
          let preco = 0;
          let precoOriginal = null;
          let freteGratis = false;
          let isFull = false;
          let envio = 'Mercado Envios';
          let vendasStr = '+100 vendas';
          let parcelamento = '—';
          let desconto = '0% OFF';
          let mercadoLider = null;
          let link = targetUrl;
          let thumbnail = null;

          item.components.forEach(comp => {
            if (comp.id === 'price' && comp.price) {
              preco = comp.price.value;
              precoOriginal = comp.price.original_value || null;
              if (comp.discount_label?.value) desconto = `${comp.discount_label.value}% OFF`;
            }
            if (comp.id === 'seller') {
              nome = comp.seller?.name || comp.title_value || comp.seller_info?.title || '—';
              if (comp.subtitles) {
                const subSales = comp.subtitles.find(s => s.text && s.text.includes('vendas'));
                if (subSales) vendasStr = extrairVendasTexto(subSales.text);
              }
              if (comp.seller_info?.power_seller_status?.title) {
                mercadoLider = comp.seller_info.power_seller_status.title;
              }
            }
            if (comp.id === 'shipping_summary') {
              const promiseText = comp.title?.values?.promise?.text?.toLowerCase() || '';
              if (promiseText.includes('grátis') || promiseText.includes('gratis')) freteGratis = true;
              if (promiseText.includes('full') || comp.title?.text?.toLowerCase().includes('full')) isFull = true;
            }
            if (comp.id === 'payment_summary') {
              if (comp.title?.values?.price_installments?.value) {
                parcelamento = comp.title.text.replace('{price_installments}', `R$ ${comp.title.values.price_installments.value}`);
              } else if (comp.title?.text) {
                parcelamento = comp.title.text;
              }
            }
          });

          if (isFull) envio = 'Full';
          else if (freteGratis) envio = 'Mercado Envios (Grátis)';

          if (precoOriginal && precoOriginal > preco && desconto === '0% OFF') {
            desconto = `${Math.round((1 - preco/precoOriginal) * 100)}% OFF`;
          }

          if (preco > 0 || nome !== '—') {
            vendedores.push({
              nome, preco: parseFloat(preco), precoOriginal: precoOriginal ? parseFloat(precoOriginal) : null,
              link, desconto, thumbnail, titulo: 'Anúncio Catálogo', freteGratis, envio, tipoAnuncio: 'Clássico',
              vendas: vendasStr || '+100 vendas', parcelamento, pagina: paginaAtual, posicao: index + 1, mercadoLider
            });
          }
        });
        itemsExtracted = true;
        break;
      }
    }

    // TIPO 2: Padrão Flat object (Listas tradicionais)
    if (!itemsExtracted) {
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
        state?.ui?.components?.buyBox?.state?.buyingOptions
      ];

      for (const arr of flatPaths) {
        if (Array.isArray(arr) && arr.length > 0) {
          debug.push(`  🎯 Extraindo ${arr.length} opções (Formato Flat Array)`);
          arr.forEach((o, index) => {
            const nome  = o.seller_name || o.seller?.nickname || o.sellerInfo?.nickname || o.seller?.name || o.sellerNickname || '—';
            
            let p = o.price?.amount || o.price?.value || o.salePrice || o.price;
            let preco = typeof p === 'object' ? (p.fraction || p.value) : p;
            
            let pOrig = o.original_price?.amount || o.original_price || o.originalPrice;
            let precoOriginal = typeof pOrig === 'object' ? (pOrig.fraction || pOrig.value) : pOrig;

            if (preco === undefined || isNaN(parseFloat(preco))) return;

            const link  = o.permalink || o.item?.permalink || o.url || targetUrl || '';
            const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || (precoOriginal && precoOriginal > preco ? `${Math.round((1 - preco/precoOriginal) * 100)}% OFF` : '0% OFF'));
            const isFull = o.shipping?.logistic_type === 'fulfillment' || o.shipping?.tags?.includes('fulfillment') || o.has_full_filment === true || o.fulfillment === true;
            const tipoAnuncio = mapTipo(o.listing_type_id);

            let vendasStr = '+100 vendas';
            if (o.seller?.sales_text) vendasStr = extrairVendasTexto(o.seller.sales_text);
            else if (o.sellerInfo?.sales_text) vendasStr = extrairVendasTexto(o.sellerInfo.sales_text);
            else if (o.seller?.reputation?.metrics?.sales?.completed) vendasStr = formatarVendas(o.seller.reputation.metrics.sales.completed);
            else if (o.seller?.transactions?.completed) vendasStr = formatarVendas(o.seller.transactions.completed);

            const freteGratis = o.shipping?.free_shipping === true || o.freeShipping === true || o.shipping_conditions === 'free_gap';
            const envio = formatarEnvio(o.shipping || {}, isFull, freteGratis);
            let parcelamento = '—';
            if (typeof o.installment_info === 'string') parcelamento = `${o.installment_info.replace('f','')}x`;
            else if (o.installments?.quantity) parcelamento = `${o.installments.quantity}x`;

            if (parseFloat(preco) > 0 || nome !== '—') {
              vendedores.push({ 
                nome, preco: parseFloat(preco) || 0, precoOriginal: precoOriginal ? parseFloat(precoOriginal) : null,
                link, desconto: descPct, thumbnail: o.thumbnail || o.item?.thumbnail || null, titulo: o.title || o.item?.title || 'Anúncio Catálogo',
                freteGratis, envio, tipoAnuncio, vendas: vendasStr, parcelamento, pagina: paginaAtual, posicao: index + 1
              });
            }
          });
          break;
        }
      }
    }
  }
  
  // JSON-LD schema fallback
  if (vendedores.length === 0) {
    const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const ldMatch of ldMatches) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        const offers = ld.offers ? (Array.isArray(ld.offers) ? ld.offers : [ld.offers]) : [];
        offers.forEach((offer, idx) => {
          if (offer.price && parseFloat(offer.price) > 0) {
            vendedores.push({
              nome: offer.seller?.name || offer.offeredBy?.name || '—',
              preco: parseFloat(offer.price), precoOriginal: null, link: offer.url || targetUrl, desconto: '0% OFF',
              thumbnail: null, titulo: ld.name || 'Anúncio', freteGratis: false, envio: 'Mercado Envios',
              tipoAnuncio: 'Clássico', vendas: '+100 vendas', parcelamento: '—', pagina: paginaAtual, posicao: idx + 1
            });
          }
        });
        if (vendedores.length > 0) { debug.push(`📦 JSON-LD fallback: ${vendedores.length} ofertas extraídas`); break; }
      } catch {}
    }
  }

  // Regex agressivo fallback
  if (vendedores.length === 0) {
    const precoRx = /R\$\s*([\d.,]+)/g;
    const precos = [...html.matchAll(precoRx)].map(m => parseFloat(m[1].replace(/\./g,'').replace(',','.'))).filter(v => v > 0 && v < 100000);
    if (precos.length > 0) {
      debug.push(`🔍 Regex fallback: ${precos.length} preços encontrados`);
      precos.slice(0, 10).forEach((preco, idx) => {
        vendedores.push({
          nome: '—', preco, precoOriginal: null, link: targetUrl, desconto: '0% OFF', thumbnail: null, titulo: 'Anúncio Catálogo',
          freteGratis: false, envio: 'Mercado Envios', tipoAnuncio: 'Clássico', vendas: '+100 vendas', parcelamento: '—',
          pagina: paginaAtual, posicao: idx + 1
        });
      });
    }
  }

  return vendedores;
}

// ============================================================================
// MOTOR DE PAGINAÇÃO — igual ao catálogo: /p/MLB.../s?page=N
// ============================================================================
async function buscarViaScraping(urlOriginal, mlbId, debug) {
  let baseUrl = urlOriginal.split('?')[0];
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://www.mercadolivre.com.br/p/${mlbId}/s`;
  }
  if (baseUrl.includes('/p/MLB') && !baseUrl.endsWith('/s')) {
    baseUrl += '/s';
  }

  debug.push(`🌐 Scraping Iterativo Iniciado: ${baseUrl}`);
  
  let todosVendedores = [];
  let page = 1;
  let offset = 0;
  let tituloBase = null;
  let precoBase = 0;
  let thumbnailBase = null;
  let errorsConsecutivos = 0;
  const MAX_ERRORS_CONSECUTIVOS = 3;

  while (page <= 40 && errorsConsecutivos < MAX_ERRORS_CONSECUTIVOS) {
    const urlPage = `${baseUrl}?page=${page}`;
    debug.push(`📡 Pág ${page}: ${urlPage}`);

    let html = null;
    let estrategiaUsada = null;

    // ESTRATÉGIA A: Axios Humanizado
    for (let tentativa = 0; tentativa < 3 && !html; tentativa++) {
      try {
        if (tentativa > 0) {
          await backoffDelay(tentativa - 1, 2000);
          debug.push(`  🔄 Re-tentativa A${tentativa} para pág ${page}...`);
        }
        const referer = page > 1 
          ? `${baseUrl}?page=${page - 1}` 
          : 'https://www.mercadolivre.com.br/';
        const scraper = criarScraperHumano(referer);
        const res = await scraper.get(urlPage);
        if (res.data && typeof res.data === 'string' && res.data.length > 500) {
          html = res.data;
          estrategiaUsada = `scraper_humano_UA${uaIndex % UA_POOL.length}`;
        }
      } catch (e) {
        debug.push(`  ⚠️ Estratégia A(${tentativa}): ${e.message?.substring(0, 50)}`);
      }
    }

    // ESTRATÉGIA B: Formato Legado ML
    if (!html) {
      try {
        await humanDelay(1000, 2500);
        const urlLegacy = `${baseUrl}?quantity=1&page=${page}`;
        const scraper = criarScraperHumano(urlPage);
        const res = await scraper.get(urlLegacy);
        if (res.data && typeof res.data === 'string' && res.data.length > 500) {
          html = res.data;
          estrategiaUsada = 'legado_quantity1';
          debug.push(`  📦 Estratégia B (quantity=1) funcionou`);
        }
      } catch (e) {
        debug.push(`  ⚠️ Estratégia B: ${e.message?.substring(0, 40)}`);
      }
    }

    // ESTRATÉGIA C: Mobile Android
    if (!html) {
      try {
        await humanDelay(1500, 3000);
        const mobileUA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
        const scraperMobile = axios.create({
          timeout: 18000,
          headers: {
            'User-Agent': mobileUA,
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Referer': 'https://www.mercadolivre.com.br/',
            'sec-ch-ua-mobile': '?1',
          },
          decompress: true,
        });
        const res = await scraperMobile.get(urlPage);
        if (res.data && typeof res.data === 'string' && res.data.length > 300) {
          html = res.data;
          estrategiaUsada = 'mobile_android';
          debug.push(`  📱 Estratégia C (mobile) funcionou`);
        }
      } catch (e) {
        debug.push(`  ⚠️ Estratégia C: ${e.message?.substring(0, 40)}`);
      }
    }

    // ESTRATÉGIA D: API Pública do ML
    if (!html) {
      try {
        await humanDelay(2000, 4000);
        const catalogApiUrl = `https://api.mercadolibre.com/products/${mlbId}/items?limit=10&offset=${(page-1)*10}`;
        const res = await axios.get(catalogApiUrl, { timeout: 12000 });
        if (res.data && res.data.results) {
          const items = res.data.results;
          items.forEach((item, idx) => {
            todosVendedores.push({
              nome: item.seller_id ? String(item.seller_id) : '—',
              preco: item.price || 0,
              precoOriginal: item.original_price || null,
              link: item.permalink || '',
              desconto: item.original_price && item.original_price > item.price
                ? `${Math.round((1 - item.price/item.original_price)*100)}% OFF`
                : '0% OFF',
              thumbnail: item.thumbnail || null,
              titulo: item.title || 'Anúncio Catálogo',
              freteGratis: item.shipping?.free_shipping || false,
              envio: formatarEnvio(item.shipping || {}, false, item.shipping?.free_shipping),
              tipoAnuncio: mapTipo(item.listing_type_id),
              vendas: formatarVendas(item.sold_quantity),
              parcelamento: '—',
              pagina: page,
              posicao: offset + idx + 1,
            });
          });
          if (items.length > 0) {
            offset += items.length;
            page++;
            errorsConsecutivos = 0;
            debug.push(`  🔌 Estratégia D (API pública): ${items.length} itens`);
            if (!tituloBase && res.data.catalog_product_id) tituloBase = res.data.name;
            if (page > 1 && items.length < 10) {
              debug.push(`✅ API pública sem mais páginas`);
              break;
            }
            await humanDelay(800, 1500);
            continue;
          }
        }
      } catch (e) {
        debug.push(`  ⚠️ Estratégia D (API pública): ${e.message?.substring(0, 40)}`);
      }
    }

    // ESTRATÉGIA E: Cookie Simulado
    if (!html) {
      try {
        await humanDelay(2500, 5000);
        const urlAlt = `https://www.mercadolivre.com.br/p/${mlbId}/s?page=${page}`;
        const scraper = criarScraperHumano('https://www.mercadolivre.com.br/');
        scraper.defaults.headers['Cookie'] = `_d2id=mlbr_${Date.now()}_${Math.random().toString(36).substr(2)}; _ml_ci=anonymous`;
        const res = await scraper.get(urlAlt);
        if (res.data && typeof res.data === 'string' && res.data.length > 500) {
          html = res.data;
          estrategiaUsada = 'url_alternativa_cookie';
          debug.push(`  🍪 Estratégia E (URL alt + cookie) funcionou`);
        }
      } catch (e) {
        debug.push(`  ⚠️ Estratégia E: ${e.message?.substring(0, 40)}`);
      }
    }

    // ESTRATÉGIA F: Puppeteer Stealth (Blindagem com simulação humana real)
    if (!html || html.includes('Verifique se você é humano') || html.includes('Captcha')) {
      let browser;
      try {
        await humanDelay(1500, 3000);
        debug.push(`  🤖 Estratégia F (Puppeteer Stealth) acionada para pág ${page}...`);
        browser = await puppeteer.launch({
            headless: true,
            args: [
              '--no-sandbox', 
              '--disable-setuid-sandbox', 
              '--disable-gpu', 
              '--no-zygote', 
              '--disable-dev-shm-usage',
              '--disable-blink-features=AutomationControlled'
            ]
        });
        const pageObj = await browser.newPage();
        await pageObj.setUserAgent(getNextUA());
        await pageObj.setViewport({ width: 1366, height: 768 });

        debug.push(`  ⏳ Aguardando carregamento e simulando humano...`);
        await pageObj.goto(urlPage, { waitUntil: 'domcontentloaded', timeout: 35000 });
        
        // Simulação de movimento de mouse e scroll para pontuar no DataDome
        try {
          await pageObj.mouse.move(100, 100);
          await pageObj.mouse.down();
          await pageObj.mouse.up();
          await pageObj.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
          await new Promise(r => setTimeout(r, 1000));
          await pageObj.mouse.move(300, 300);
        } catch(e) {}
        
        const isCaptcha = await pageObj.evaluate(() => {
            return document.title.includes('Captcha') || document.body.innerHTML.includes('Verifique se você é humano');
        });
        
        if (!isCaptcha) {
            html = await pageObj.content();
            estrategiaUsada = 'puppeteer_stealth';
            debug.push(`  ✅ HTML obtido via Puppeteer Stealth (${html.length} chars)`);
        } else {
            debug.push(`  ❌ Puppeteer também caiu no Captcha nesta página.`);
            html = null; 
        }
        await browser.close();
      } catch (e) {
        if (browser) try { await browser.close(); } catch(err){}
        debug.push(`  ⚠️ Estratégia F (Puppeteer): ${e.message?.substring(0, 40)}`);
      }
    }

    if (html) {
      errorsConsecutivos = 0;
      debug.push(`  ✅ HTML obtido via: ${estrategiaUsada} (${html.length} chars)`);

      if (page === 1) {
        const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
        if (ldMatch) {
          try {
            const ld = JSON.parse(ldMatch[1]);
            tituloBase = ld.name || ld.title;
            precoBase = ld.offers?.price ? parseFloat(ld.offers.price) : 0;
            thumbnailBase = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
          } catch {}
        }
        if (!tituloBase) {
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch) tituloBase = titleMatch[1].replace(/Mercado\s*Livre/i, '').trim().replace(/^\s*[-|:]\s*/, '');
          else tituloBase = `Catálogo ID ${mlbId}`;
        }
      }

      const vendedoresPagina = extrairVendedoresDoHTML(html, urlPage, page, debug);

      if (vendedoresPagina.length > 0) {
        if (page > 1 && todosVendedores.length > 0) {
          const firstNew = vendedoresPagina[0];
          const isRepeated = todosVendedores.slice(-vendedoresPagina.length).some(
            v => v.nome === firstNew.nome && Math.abs(v.preco - firstNew.preco) < 0.01
          );
          if (isRepeated) {
            debug.push(`✅ Fim da paginação (repetição detectada na pág ${page})`);
            break;
          }
        }

        const formatados = vendedoresPagina.map((v, i) => ({
          ...v,
          posicao: offset + i + 1,
        }));
        todosVendedores.push(...formatados);
        offset += vendedoresPagina.length;
        debug.push(`  📊 Pág ${page}: ${vendedoresPagina.length} vendedores (total: ${todosVendedores.length})`);
        page++;
        await humanDelay(800, 1600);
      } else {
        debug.push(`⚠️ Pág ${page}: HTML decodificado mas sem vendedores novos. Encerrando.`);
        break;
      }
    } else {
      errorsConsecutivos++;
      debug.push(`❌ Todas as estratégias falharam para pág ${page} (${errorsConsecutivos}/${MAX_ERRORS_CONSECUTIVOS})`);
      if (errorsConsecutivos < MAX_ERRORS_CONSECUTIVOS) {
        await backoffDelay(errorsConsecutivos, 5000);
      }
    }
  }

  if (todosVendedores.length === 0) {
    throw new Error('Nenhum vendedor encontrado por nenhuma das estratégias de scraping.');
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
    frete: sellerPrincipal.freteGratis ? 'Grátis' : 'Pago',
    envio: sellerPrincipal.envio || 'Mercado Envios',
    vendas: sellerPrincipal.vendas || formatarVendas(null),
    avaliacoes: null,
    atributos: [],
    seller: { nome: sellerPrincipal.nome, reputacao: null, vendas: null },
    concorrentes,
    totalVendedores: todosVendedores.length,
    precoMin: Math.min(...todosVendedores.map(v => v.preco).filter(p => p > 0)),
    precoMax: Math.max(...todosVendedores.map(v => v.preco)),
    precoMedio: Math.round(todosVendedores.reduce((a, b) => a + b.preco, 0) / todosVendedores.length),
    ehCatalogo: true,
    fonte: 'scraping_direto_paginado',
    analisadoEm: new Date().toISOString(),
    pagina: sellerPrincipal.pagina || 1,
    posicao: sellerPrincipal.posicao || 1,
    paginasColetadas: [...new Set(todosVendedores.map(v => v.pagina))].sort((a,b) => a-b),
  };
}

// Fallback da API Oficial (Com proteção de Catálogo /products/)
async function buscarItemAPI(mlbId, api, debug) {
  debug.push(`🔍 Buscando API Oficial (Sem URL) para ${mlbId}...`);
  
  let it;
  try {
      const itemRes = await api.get(`/items/${mlbId}`, {
        params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,condition,status,warranty,attributes' },
        timeout: 12000,
      });
      it = itemRes.data;
  } catch (error) {
      if (error.response && error.response.status === 404) {
          debug.push(`⚠️ ID ${mlbId} não é Anúncio. Tentando como Catálogo (/products/)...`);
          const catalogRes = await api.get(`/products/${mlbId}`, { timeout: 12000 });
          it = catalogRes.data;
          return {
            mlbId, titulo: it.name, preco: 0, precoOriginal: null, status: it.status, estoque: null, vendidos: null,
            vendas: '—', condicao: 'Novo', tipoAnuncio: 'Catálogo',
            thumbnail: it.pictures?.[0]?.url || null, link: it.permalink, freteGratis: false, frete: '—', envio: '—',
            avaliacoes: null, atributos: extrairAtributos(it.attributes || []), seller: { nome: 'Catálogo Oficial', reputacao: null, vendas: null }, concorrentes: [], totalVendedores: 1, precoMin: 0, precoMax: 0, precoMedio: 0,
            ehCatalogo: true, catalogProductId: it.id, fonte: 'api_products', analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1,
            paginasColetadas: [1],
          };
      }
      throw error;
  }

  const seller = await getSellerFull(it.seller_id, api);
  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null, status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
    vendas: formatarVendas(it.sold_quantity), condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: it.permalink, freteGratis: it.shipping?.free_shipping === true, frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: formatarEnvio(it.shipping, false, it.shipping?.free_shipping),
    avaliacoes: null, atributos: extrairAtributos(it.attributes || []), seller, concorrentes: [], totalVendedores: 1, precoMin: it.price, precoMax: it.price, precoMedio: it.price,
    ehCatalogo: false, catalogProductId: null, fonte: 'api_items', analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1,
    paginasColetadas: [1],
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
 * PRIORIZA SCRAPING ITERATIVO COM MÚLTIPLAS ESTRATÉGIAS ANTI-BLOQUEIO
 */
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  const { userId, urlOriginal } = req.query;
  
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  const debug = [`🚀 Iniciando análise orquestrada de ${mlbId}`];
  
  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message, debug }); }
  
  if (urlOriginal) {
    debug.push(`📍 URL detectada. Iniciando scraping multi-estratégia (paginação /s?page=N)...`);
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId, debug);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json({ ...dados, debug });
    } catch (e) {
      debug.push(`❌ Scraping falhou em todas as estratégias: ${e.message}`);
    }
  }

  // FALLBACK: Apenas ID → API oficial
  try {
    const dados = await buscarItemAPI(mlbId, api, debug);
    await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
    return res.json({ ...dados, debug });
  } catch (eA) { debug.push(`⚠️  API Oficial falhou: ${eA.response?.status || eA.message?.substring(0, 60)}`); }

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