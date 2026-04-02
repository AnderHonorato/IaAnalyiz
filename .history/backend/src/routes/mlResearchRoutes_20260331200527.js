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

// ----------------------------------------------------------------------------
// SISTEMA DE CAPTURA LOCAL (CACHE DE HTML)
// ----------------------------------------------------------------------------
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
        debug.push(`  💾 HTML salvo em: ${filepath}`);
    } catch (e) {
        debug.push(`  ⚠️ Erro ao salvar captura: ${e.message}`);
    }
}

function lerCaptura(mlbId, pagina, debug) {
    try {
        const filepath = path.join(CAPTURES_DIR, `${mlbId}_pag_${pagina}.html`);
        if (fs.existsSync(filepath)) {
            const html = fs.readFileSync(filepath, 'utf8');
            // Só lê do cache se não for página de bloqueio
            if (!html.includes('auth-login-frontend') && !html.includes('suspicious') && !html.includes('Verifique se você é humano')) {
                debug.push(`  📂 Lendo captura local da página ${pagina} (Bypass de Rede)...`);
                return html;
            }
        }
    } catch (e) {}
    return null;
}

// Ativa o plugin Stealth
puppeteer.use(StealthPlugin());

const prisma = new PrismaClient();
const router = express.Router();

// Busca as credenciais do Usuário Logado
async function getMlApi(userId) {
  const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!token) throw new Error('Conta ML não conectada');
  if (new Date() >= new Date(token.expiresAt)) throw new Error('Token ML expirado — reconecte');
  return {
      api: axios.create({
        baseURL: 'https://api.mercadolibre.com',
        headers: { Authorization: `Bearer ${token.accessToken}` },
        timeout: 18000,
      }),
      rawToken: token.accessToken,
      mlUserId: token.mlUserId
  };
}

// ============================================================================
// POOL DE USER-AGENTS REAIS E RESOLUÇÕES
// ============================================================================
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

const VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 }
];

let uaIndex = 0;
function getNextUA() {
  const ua = UA_POOL[uaIndex % UA_POOL.length];
  uaIndex++;
  return ua;
}

function humanDelay(minMs = 800, maxMs = 2000) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise(r => setTimeout(r, ms));
}

function backoffDelay(attempt, baseMs = 3000) {
  const ms = baseMs * Math.pow(2, attempt) + Math.random() * 1000;
  return new Promise(r => setTimeout(r, Math.min(ms, 30000)));
}

// ----------------------------------------------------------------------------
// SIMULAÇÃO HUMANA AVANÇADA (PUPPETEER)
// ----------------------------------------------------------------------------
async function simularHumano(page, debug) {
    try {
        debug.push(`   🕺 Simulando comportamento de usuário...`);
        const width = page.viewport().width;
        const height = page.viewport().height;
        await page.mouse.move(100 + Math.random() * (width - 200), 100 + Math.random() * (height - 200), { steps: 10 });
        await humanDelay(300, 800);
        await page.evaluate(() => { window.scrollBy({ top: Math.random() * 600 + 200, behavior: 'smooth' }); });
        await humanDelay(500, 1200);
        await page.mouse.click(50 + Math.random() * 100, 50 + Math.random() * 100);
        await humanDelay(300, 800);
    } catch (e) {}
}

function criarScraperHumano(referer, rawToken, mlUserId) {
  const ua = getNextUA();
  return axios.create({
    timeout: 20000,
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': referer,
      'Authorization': `Bearer ${rawToken}`, // INJETA A AUTENTICAÇÃO
      'Cookie': `orguseridp=${mlUserId}; _d2id=mlbr_${Date.now()}`, // INJETA O COOKIE DE SESSÃO
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Upgrade-Insecure-Requests': '1',
    },
    maxRedirects: 5,
    decompress: true,
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
  if (hasFulfillment || shippingInfo?.logistic_type === 'fulfillment' || shippingInfo?.tags?.includes('fulfillment') || shippingInfo?.shipping_conditions === 'fulfillment') return 'Full';
  const gratis = freeShipping || shippingInfo?.free_shipping || shippingInfo?.shipping_conditions === 'free_gap' || shippingInfo?.shipping_conditions === 'free_ratio';
  return gratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios';
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

function buildItemLink(id, permalink) {
  if (permalink) return permalink;
  if (!id) return null;
  const num = String(id).replace(/^MLB/i, '');
  return `https://produto.mercadolivre.com.br/MLB-${num}-_JM`;
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
async function getSellerName(sellerId, api) {
  if (!sellerId) return '—';
  if (sellerCache.has(sellerId)) return sellerCache.get(sellerId);
  try {
    const sv   = await api.get(`/users/${sellerId}`, { timeout: 5000 });
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
    return {
      nome:      s.nickname || s.first_name || String(sellerId),
      reputacao: mapRep(s.seller_reputation?.level_id),
      vendas:    s.seller_reputation?.transactions?.completed || 0,
    };
  } catch { return { nome: String(sellerId), reputacao: null, vendas: null }; }
}

// ============================================================================
// EXTRATOR NATIVO CIRÚRGICO (MESCLANDO O SEU CÓDIGO v5 COM O NOVO)
// ============================================================================

function extrairJSON(html, target) {
  let idx = html.indexOf(target);
  if (idx === -1) return null;
  
  let startObj = html.indexOf('{', idx);
  let startArr = html.indexOf('[', idx);
  let start = -1;
  
  if (startObj !== -1 && startArr !== -1) start = Math.min(startObj, startArr);
  else if (startObj !== -1) start = startObj;
  else if (startArr !== -1) start = startArr;
  
  if (start === -1) return null;

  const openChar = html[start];
  const closeChar = openChar === '{' ? '}' : ']';
  
  let open = 0, inStr = false, escape = false;
  for (let i = start; i < html.length; i++) {
      let char = html[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inStr = !inStr; continue; }
      if (!inStr) {
          if (char === openChar) open++;
          else if (char === closeChar) {
              open--;
              if (open === 0) return html.substring(start, i + 1);
          }
      }
  }
  return null;
}

function extrairVendedoresDoHTML(html, targetUrl, paginaAtual, debug) {
  const vendedores = [];
  
  if (html.includes('auth-login-frontend') || html.includes('suspicious-traffic') || html.includes('Verifique se você é humano')) {
      debug.push(`  ❌ HTML bloqueado pela tela de Login/Captcha do ML.`);
      return vendedores; 
  }

  // 1. TENTA ESTRUTURA NOVA (NORDIC / COMPONENTS)
  let jsonStr = extrairJSON(html, '_n.ctx.r') || extrairJSON(html, '__NORDIC_RENDERING_CTX__');
  let state = null;
  if (jsonStr) {
      try {
          state = JSON.parse(jsonStr);
          const itemsComp = state?.appProps?.pageProps?.initialState?.results?.items || state?.results?.items;
          if (itemsComp && itemsComp.length > 0 && itemsComp[0].components) {
              debug.push(`  🎯 Extraindo via Components Array (Novo ML)`);
              itemsComp.forEach((item, index) => {
                  let nome = item.seller_name || '—', preco = item.price || 0, original = null, desconto = '0% OFF';
                  let freteGratis = false, full = false, parcelas = '—', envio = 'Mercado Envios', rep = null, thumb = null;
                  let vendasStr = '+100 vendas';
                  let tipo = item.listing_type_id ? mapTipo(item.listing_type_id) : 'Clássico';
                  let link = targetUrl;

                  item.components.forEach(c => {
                      if ((c.id === 'price' || c.type === 'price') && c.price) {
                          preco = c.price.value || c.price.amount || preco;
                          original = c.price.original_value || c.price.original_amount || original;
                          if (c.discount_label?.value) desconto = `${c.discount_label.value}% OFF`;
                      }
                      if (c.id === 'seller' || c.type === 'seller') {
                          nome = c.seller?.name || c.title_value || c.seller_info?.title || c.seller_name || nome;
                          if (c.seller_info?.power_seller_status?.title) rep = c.seller_info.power_seller_status.title;
                          if (c.subtitles && Array.isArray(c.subtitles)) {
                              const subSales = c.subtitles.find(s => s.text && (s.text.includes('vendas') || s.text.includes('vendidos')));
                              if (subSales) vendasStr = extrairVendasTexto(subSales.text) || vendasStr;
                          }
                          if (c.seller_link?.target) link = c.seller_link.target;
                      }
                      if (c.id === 'shipping_summary' || c.id === 'pick_up_summary' || c.type === 'generic_summary') {
                          const txt = c.title?.values?.promise?.text?.toLowerCase() || c.title?.text?.toLowerCase() || '';
                          if (txt.includes('grátis') || txt.includes('gratis')) freteGratis = true;
                          if (txt.includes('full')) full = true;
                      }
                      if (c.id === 'payment_summary') {
                          if (c.title?.values?.price_installments?.value) parcelas = c.title.text.replace('{price_installments}', `R$ ${c.title.values.price_installments.value}`);
                          else if (c.title?.text) parcelas = c.title.text;
                      }
                  });

                  if (full) envio = 'Full'; else if (freteGratis) envio = 'Mercado Envios (Grátis)';
                  if (original && original > preco && desconto === '0% OFF') desconto = `${Math.round((1 - preco/original)*100)}% OFF`;

                  if (preco > 0 || nome !== '—') vendedores.push({
                      nome, preco: parseFloat(preco), precoOriginal: original ? parseFloat(original) : null,
                      link, desconto, thumbnail: thumb, titulo: 'Anúncio Catálogo', freteGratis, envio,
                      tipoAnuncio: tipo, vendas: vendasStr, parcelamento: parcelas, mercadoLider: rep,
                      pagina: paginaAtual, posicao: index + 1
                  });
              });
              if (vendedores.length > 0) return vendedores;
          }
      } catch (e) {}
  }

  // 2. O SEU CÓDIGO V5 ORIGINAL PARA ESTRUTURAS FLAT E LEGADAS
  const jsonPatterns = [
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]{100,}?\});?\s*(?:<\/script>|window\.|var )/,
    /"initialState"\s*:\s*(\{[\s\S]{100,}?\})\s*,\s*"components"/,
    /window\.ML_PRELOADED_STATE\s*=\s*(\{[\s\S]{100,}?\});/,
  ];
  
  for (const pattern of jsonPatterns) {
    const m = html.match(pattern);
    if (!m) continue;
    try {
      const state2 = JSON.parse(m[1]);
      const paths = [
        state2?.buyingOptions?.options, state2?.initialState?.buyingOptions?.options,
        state2?.component?.state?.buyingOptions?.options, state2?.buyingOptions?.offers,
        state2?.catalogProductResults?.items, state2?.pageState?.catalogBuyBox?.items,
        state2?.appProps?.pageProps?.initialState?.components?.track?.melidata_event?.event_data?.items,
        state2?.components?.track?.melidata_event?.event_data?.items
      ];
      for (const arr of paths) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        debug.push(`  🎯 Extraindo via Flat Array (Seu Código v5) - ${arr.length} itens`);
        for (const o of arr) {
          const nome  = o.seller_name || o.seller?.nickname || o.sellerInfo?.nickname || o.seller?.name || o.sellerNickname || '—';
          let p = o.price?.amount || o.price?.value || o.salePrice || o.price;
          const preco = typeof p === 'object' ? (p.fraction || p.value) : p;
          let pOrig = o.original_price?.amount || o.original_price || o.originalPrice;
          let precoOriginal = typeof pOrig === 'object' ? (pOrig.fraction || pOrig.value) : pOrig;

          if (!preco || isNaN(parseFloat(preco))) continue;

          const link  = o.permalink || o.item?.permalink || o.url || targetUrl;
          const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || (precoOriginal && precoOriginal > preco ? `${Math.round((1 - preco/precoOriginal) * 100)}% OFF` : '0% OFF'));
          const full = o.shipping?.logistic_type === 'fulfillment' || o.shipping?.tags?.includes('fulfillment') || o.has_full_filment === true || o.fulfillment === true || o.shipping_conditions === 'fulfillment';
          const freteGratis = o.shipping?.free_shipping === true || o.freeShipping === true || o.shipping_conditions === 'free_gap';
          const envio = full ? 'Full' : (freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios');
          const tipo = mapTipo(o.listing_type_id);
          
          let parcelas = '—';
          if (typeof o.installment_info === 'string') parcelas = `${o.installment_info.replace('f','')}x`;
          else if (o.installments?.quantity) parcelas = `${o.installments.quantity}x`;

          let vendasStr = '+100 vendas';
          if (o.seller?.sales_text) vendasStr = extrairVendasTexto(o.seller.sales_text) || vendasStr;
          else if (o.sellerInfo?.sales_text) vendasStr = extrairVendasTexto(o.sellerInfo.sales_text) || vendasStr;
          else if (o.seller?.reputation?.metrics?.sales?.completed) vendasStr = formatarVendas(o.seller.reputation.metrics.sales.completed);
          else if (o.sold_quantity) vendasStr = formatarVendas(o.sold_quantity);

          vendedores.push({ 
            nome, preco: parseFloat(preco), precoOriginal: precoOriginal ? parseFloat(precoOriginal) : null, link, 
            desconto: descPct, thumbnail: o.thumbnail || o.item?.thumbnail || null, titulo: o.title || o.item?.title || 'Catálogo', 
            freteGratis, envio, tipoAnuncio: tipo, vendas: vendasStr, parcelamento: parcelas, 
            pagina: paginaAtual, posicao: vendedores.length + 1 
          });
        }
        if (vendedores.length) return vendedores;
      }
    } catch {}
  }

  // 3. Fallback de Segurança - JSON-LD Schema
  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
      try {
          const ld = JSON.parse(m[1]);
          const offers = ld.offers?.offers || (Array.isArray(ld.offers) ? ld.offers : (ld.offers ? [ld.offers] : []));
          for (const o of offers) {
              const nome = o.seller?.name || o.seller?.nickname || '—';
              const preco = parseFloat(o.price || 0);
              if (preco > 0 || nome !== '—') vendedores.push({
                  nome, preco, link: o.url || targetUrl, desconto: '0% OFF', thumbnail: null, titulo: ld.name || 'Anúncio', freteGratis: false, frete: '—', envio: 'Mercado Envios',
                  tipoAnuncio: 'Clássico', vendas: '+100 vendas', parcelamento: '—', pagina: paginaAtual, posicao: vendedores.length + 1
              });
          }
          if (vendedores.length > 0) { debug.push(`  📦 JSON-LD fallback: ${vendedores.length} ofertas extraídas`); return vendedores; }
      } catch (e) {}
  }

  // 4. Seu Regex Agressivo v5
  const sellerRegex = /"nickname"\s*:\s*"([^"]{2,50})"/g;
  const priceRegex  = /"amount"\s*:\s*([\d.]+)/g;
  const names  = [...new Set([...html.matchAll(sellerRegex)].map(m => m[1]))].slice(0, 15);
  const prices = [...html.matchAll(priceRegex)].map(m => parseFloat(m[1])).filter(v => v > 0).slice(0, 15);
  if (names.length) {
    names.forEach((nome, i) => vendedores.push({ 
        nome, preco: prices[i] || 0, link: targetUrl, desconto: '0% OFF', thumbnail: null, titulo: 'Catálogo', freteGratis: false, envio: 'Mercado Envios',
        tipoAnuncio: 'Clássico', vendas: '+100 vendas', parcelamento: '—', pagina: paginaAtual, posicao: i + 1 
    }));
    debug.push(`  🔍 REGEX AGRESSIVO v5: ${vendedores.length} vendedores.`);
    return vendedores;
  }

  return vendedores;
}

// ============================================================================
// MOTOR DE PAGINAÇÃO — com INJEÇÃO DE AUTENTICAÇÃO
// ============================================================================
async function buscarVendedoresCatalogo(catalogId, urlBase, api, rawToken, mlUserId, debug) {
  debug.push(`🏷️  Catálogo ID: ${catalogId}`);
  
  let url = urlBase;
  if (!url || !url.includes('/p/MLB')) {
      const cleanId = catalogId.replace(/^MLB/i, '');
      url = `https://www.mercadolivre.com.br/p/MLB${cleanId}/s`;
  }
  
  // Limpa parâmetros duplicados da URL
  url = url.replace(/([?&])page=\d+/g, '$1').replace(/([?&])quantity=\d+/g, '$1').replace(/&&/g, '&').replace(/[?&]$/, '');
  
  let todosVendedores = [];
  let page = 1;
  let errorsConsecutivos = 0;
  const MAX_ERRORS_CONSECUTIVOS = 3;

  while (page <= 40 && errorsConsecutivos < MAX_ERRORS_CONSECUTIVOS) {
      const separador = url.includes('?') ? '&' : '?';
      const urlPage = `${url}${separador}page=${page}`;
      debug.push(`📡 Pág ${page}: ${urlPage}`);

      let html = '';
      
      const cache = lerCaptura(catalogId, page, debug);
      if (cache) {
          html = cache;
      } else {
          try {
              let referer = page > 1 ? `${url}${separador}page=${page - 1}` : 'https://www.mercadolivre.com.br/';
              const scraper = criarScraperHumano(referer, rawToken, mlUserId);
              
              // TENTA INJETAR A AUTENTICAÇÃO NO AXIOS
              scraper.defaults.headers.common['Authorization'] = `Bearer ${rawToken}`;
              scraper.defaults.headers.common['Cookie'] = `orguseridp=${mlUserId}; _d2id=mlbr_${Date.now()};`;

              let res = await scraper.get(urlPage);
              html = res.data || '';
              debug.push(`   → HTML via Axios: ${(html.length/1024).toFixed(0)}KB`);
          } catch (e) {
              debug.push(`   ⚠️ Axios falhou: ${e.message}`);
          }
      }
      
      // SE CAIR NA TELA DE LOGIN, ACIONA O PUPPETEER COM AUTENTICAÇÃO
      if (!html || html.includes('auth-login-frontend') || html.includes('suspicious') || html.includes('Verifique se você é humano')) {
          debug.push(`   ⚠️ Bloqueio/Login detectado. Acionando Navegação Autenticada (Puppeteer)...`);
          let browser;
          try {
              const randomViewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];

              browser = await puppeteer.launch({
                  headless: true,
                  args: [
                    '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--no-zygote', 
                    '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled',
                    `--window-size=${randomViewport.width},${randomViewport.height}`
                  ]
              });
              const pageObj = await browser.newPage();
              
              await pageObj.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
              await pageObj.setUserAgent(getNextUA());
              await pageObj.setViewport(randomViewport);
              
              // INJEÇÃO DA AUTENTICAÇÃO DO USUÁRIO LOGADO PARA PULAR A TELA DE LOGIN
              debug.push(`   🔑 Injetando Token de Sessão no navegador...`);
              await pageObj.setCookie({ name: 'orguseridp', value: String(mlUserId), domain: '.mercadolivre.com.br', path: '/' });
              await pageObj.setExtraHTTPHeaders({ 'Authorization': `Bearer ${rawToken}` });
              
              debug.push(`   🔥 Aquecendo sessão na home page...`);
              await pageObj.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 30000 });
              await simularHumano(pageObj, debug);

              debug.push(`   🚀 Navegando para o catálogo...`);
              await pageObj.goto(urlPage, { waitUntil: 'domcontentloaded', timeout: 45000 });
              await simularHumano(pageObj, debug);

              html = await pageObj.content();
              await browser.close();
              
              debug.push(`   ✅ HTML obtido via Navegação Real: ${(html.length/1024).toFixed(0)}KB`);
          } catch (err) {
              if (browser) await browser.close();
              debug.push(`   ❌ Falha na Navegação Real: ${err.message.substring(0,60)}`);
          }
      }

      if (html && !html.includes('auth-login-frontend') && !html.includes('suspicious-traffic')) {
          salvarCaptura(catalogId, page, html, debug);
          let vendedoresPagina = extrairVendedoresDoHTML(html, urlPage, page, debug);
          
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
              
              vendedoresPagina.forEach(v => {
                  v.mlbId = catalogId;
                  v.link = v.link || buildItemLink(catalogId, v.link);
              });

              todosVendedores.push(...vendedoresPagina);
              debug.push(`  📊 Pág ${page}: +${vendedoresPagina.length} opções (Total: ${todosVendedores.length})`);
              errorsConsecutivos = 0;
              page++;
              await humanDelay(1500, 3000); 
          } else {
              debug.push(`⚠️ Pág ${page}: HTML extraído mas sem vendedores novos. Fim da paginação.`);
              break;
          }
      } else {
          errorsConsecutivos++;
          debug.push(`❌ Erro pág ${page} (${errorsConsecutivos}/${MAX_ERRORS_CONSECUTIVOS}) - Tela de Login Detectada`);
          if (errorsConsecutivos < MAX_ERRORS_CONSECUTIVOS) await backoffDelay(errorsConsecutivos, 5000);
      }
  }

  if (todosVendedores.length > 0) {
      return todosVendedores;
  }

  // 4. FALLBACK FINAL: API SEARCH
  try {
      debug.push(`📡 Buscando dados via API Interna (Search)...`);
      let buscaTermo = catalogId;
      
      // Se tiver variação na URL (ex: &attributes=VOLTAGE...), joga tudo na busca pra afunilar
      if (url.includes('attributes=')) {
          const params = new URLSearchParams(url.substring(url.indexOf('?')));
          buscaTermo = `${catalogId} ${params.get('attributes') || ''}`.replace(/[:_+]/g, ' ').trim();
      }

      const searchRes = await api.get('/sites/MLB/search', {
          params: { catalog_product_id: catalogId, q: buscaTermo, limit: 50, sort: 'price_asc' },
          timeout: 10000,
      });
      const results = searchRes.data?.results || [];
      if (results.length > 0) {
          const vendedores = [];
          for (const r of results.slice(0, 20)) {
              const nome = await getSellerName(r.seller?.id || r.seller_id, api);
              const descPct = r.original_price && r.price < r.original_price ? Math.round((1 - r.price / r.original_price) * 100) : null;
              vendedores.push({
                  mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
                  desconto: descPct ? `${descPct}% OFF` : null, link: buildItemLink(r.id, r.permalink),
                  thumbnail: r.thumbnail, titulo: r.title, frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
                  freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
                  vendidos: r.sold_quantity, tipoAnuncio: mapTipo(r.listing_type_id),
              });
          }
          vendedores.sort((a, b) => a.preco - b.preco);
          debug.push(`✅ ${vendedores.length} opções encontradas via API Interna.`);
          return vendedores;
      }
  } catch (e) {
      debug.push(`❌ API Search falhou: ${e.message}`);
  }

  debug.push(`⚠️  Nenhuma opção de compra encontrada para ${catalogId}`);
  return [];
}

async function buscarItem(mlbId, rawToken, mlUserId, url, api, debug) {
  debug.push(`🔍 Buscando /items/${mlbId}...`);
  const itemRes = await api.get(`/items/${mlbId}`, {
    params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,catalog_listing,catalog_product_id,condition,status,warranty,attributes,pictures,reviews' },
    timeout: 12000,
  });
  const it = itemRes.data;
  debug.push(`   → Título: ${it.title?.substring(0,50)}`);
  debug.push(`   → Preço: R$ ${it.price} | Status: ${it.status}`);
  const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);
  const seller = await getSellerFull(it.seller_id, api);
  
  let concorrentes = [];
  if (ehCatalogo) {
    const catalogId = it.catalog_product_id || mlbId;
    debug.push(`📦 Produto de CATÁLOGO detectado. Puxando opções...`);
    concorrentes = await buscarVendedoresCatalogo(catalogId, url, api, rawToken, mlUserId, debug);
  } else {
    debug.push(`🏪 Anúncio normal. Buscando concorrentes por título na API...`);
    try {
      const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
      const searchRes = await api.get('/sites/MLB/search', {
        params: { category: it.category_id, q: titulo, limit: 15, sort: 'price_asc' },
        timeout: 10000,
      });
      const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 10);
      for (const r of results) {
        const nome = await getSellerName(r.seller?.id || r.seller_id, api);
        concorrentes.push({
          mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
          desconto: null, link: buildItemLink(r.id, r.permalink), thumbnail: r.thumbnail, titulo: r.title,
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago', freteGratis: r.shipping?.free_shipping === true,
          estoque: r.available_quantity, vendidos: r.sold_quantity, tipoAnuncio: mapTipo(r.listing_type_id),
        });
      }
      concorrentes.sort((a, b) => a.preco - b.preco);
    } catch (e) { }
  }
  
  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a,b)=>a-b);
  const precoMin  = allPrecos[0] ?? it.price;
  const precoMax  = allPrecos[allPrecos.length-1] ?? it.price;
  const precoMed  = allPrecos.length ? Math.round(allPrecos.reduce((s,v)=>s+v,0)/allPrecos.length*100)/100 : it.price;
  
  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null,
    status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
    condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: it.permalink, freteGratis: it.shipping?.free_shipping === true,
    frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago',
    avaliacoes: it.reviews?.rating_average ? it.reviews.rating_average.toFixed(1) : null,
    atributos: extrairAtributos(it.attributes || []), seller, concorrentes,
    totalVendedores: concorrentes.length + (seller ? 1 : 0), precoMin, precoMax, precoMedio: precoMed,
    ehCatalogo, catalogProductId: it.catalog_product_id || null, fonte: 'items',
    analisadoEm: new Date().toISOString(),
  };
}

async function buscarViaProducts(mlbId, rawToken, mlUserId, url, api, debug) {
  debug.push(`🔍 Tentando /products/${mlbId}...`);
  const res = await api.get(`/products/${mlbId}`, { timeout: 12000 });
  const p   = res.data;
  
  const concorrentes = await buscarVendedoresCatalogo(mlbId, url, api, rawToken, mlUserId, debug);
  
  const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
  const preco  = p.buy_box_winner?.price || p.price || (precos[0] ?? 0);
  if (!precos.includes(preco) && preco > 0) precos.unshift(preco);
  precos.sort((a,b)=>a-b);
  
  let seller = null;
  if (p.buy_box_winner?.seller_id) {
    seller = await getSellerFull(p.buy_box_winner.seller_id, api);
  } else if (concorrentes.length) {
    seller = { nome: concorrentes[0].nome, reputacao: null, vendas: null };
  }
  
  return {
    mlbId, titulo: p.name || p.title, preco, status: 'active', estoque: null, vendidos: null,
    condicao: 'Novo', tipoAnuncio: 'Catálogo', thumbnail: p.pictures?.[0]?.url || concorrentes[0]?.thumbnail || null,
    link: `https://www.mercadolivre.com.br/p/${mlbId}`,
    freteGratis: concorrentes[0]?.freteGratis ?? false, frete: concorrentes[0]?.frete || '—',
    avaliacoes: p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
    atributos: (p.attributes || []).filter(a=>a.value_name).slice(0,14).map(a=>({nome:a.name,valor:a.value_name})),
    seller, concorrentes, totalVendedores: concorrentes.length || 1,
    precoMin: precos[0] ?? preco, precoMax: precos[precos.length-1] ?? preco,
    precoMedio: precos.length ? Math.round(precos.reduce((s,v)=>s+v,0)/precos.length*100)/100 : preco,
    ehCatalogo: true, catalogProductId: mlbId, fonte: 'products', analisadoEm: new Date().toISOString(),
  };
}

async function buscarViaScrapingGeral(url, rawToken, mlUserId, mlbId, debug) {
  const targetUrl = url.startsWith('http') ? url : `https://www.mercadolivre.com.br/p/${mlbId}`;
  
  let html = '';
  try {
    debug.push(`🌐 Scraping Direto: ${targetUrl}`);
    const scraper = criarScraperHumano('https://www.mercadolivre.com.br/', rawToken, mlUserId);
    const res  = await scraper.get(targetUrl);
    html = res.data || '';
  } catch(e) {}

  if (!html || html.includes('auth-login-frontend') || html.includes('suspicious')) {
    const cache = lerCaptura(mlbId, 1, debug);
    if (cache) html = cache;
  }

  if (!html || html.includes('auth-login-frontend') || html.includes('suspicious')) {
    debug.push(`🤖 Link direto bloqueado (Tela de Login). Iniciando Navegação Real...`);
    let browser;
    try {
      const randomViewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--no-zygote', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', `--window-size=${randomViewport.width},${randomViewport.height}`]
      });
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }) );
      await page.setViewport(randomViewport);
      
      await page.setCookie({ name: 'orguseridp', value: String(mlUserId), domain: '.mercadolivre.com.br', path: '/' });
      await page.setExtraHTTPHeaders({ 'Authorization': `Bearer ${rawToken}` });
      
      await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await simularHumano(page, debug);

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await simularHumano(page, debug);

      html = await page.content();
      await browser.close();
    } catch(e) {
      if (browser) await browser.close();
    }
  }

  if (html && !html.includes('auth-login-frontend')) salvarCaptura(mlbId, 1, html, debug);

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
  if (!thumbnail) { const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i); if (ogImg) thumbnail = ogImg[1]; }
  if (!preco) { const pm = html.match(/"price"\s*:\s*([\d.]+)/); if (pm) preco = parseFloat(pm[1]); }
  
  if (!titulo) throw new Error('Não foi possível extrair dados da página via web');
  
  const vendedores = extrairVendedoresDoHTML(html, targetUrl, 1, debug);
  
  return {
    mlbId, titulo, preco: preco || 0, status: 'active', estoque: null, vendidos: null,
    condicao: 'Novo', tipoAnuncio: 'Catálogo', thumbnail, link: targetUrl,
    freteGratis: false, frete: '—', avaliacoes: null, atributos: [],
    seller: vendedores.length ? { nome: vendedores[0].nome, reputacao: null, vendas: null } : null,
    concorrentes: vendedores.slice(1), totalVendedores: vendedores.length || 1,
    precoMin: preco || 0, precoMax: preco || 0, precoMedio: preco || 0,
    ehCatalogo: true, fonte: 'scraping_geral', analisadoEm: new Date().toISOString(),
  };
}

// ── Histórico de pesquisas ────────────────────────────────────────────────────
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

// ── Rota principal de pesquisa ────────────────────────────────────────────────
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  let { userId, urlOriginal } = req.query;
  
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  
  // Limpeza de URL com parâmetros de variação para não perdê-los no encode
  if (urlOriginal) {
      try { 
        urlOriginal = decodeURIComponent(urlOriginal);
        if (urlOriginal.includes('%')) urlOriginal = decodeURIComponent(urlOriginal); 
        urlOriginal = urlOriginal.trim();
      } catch (e) {}
  }

  const debug = [`🚀 Iniciando análise de ${mlbId}`];
  let mlInstance;
  
  try { 
      mlInstance = await getMlApi(userId); 
  } catch (e) { return res.status(401).json({ error: e.message, debug }); }
  
  const api = mlInstance.api;
  const rawToken = mlInstance.rawToken;
  const mlUserId = mlInstance.mlUserId;

  // TENTATIVA 1: API OFICIAL DO ML
  try {
      const dados = await buscarItem(mlbId, rawToken, mlUserId, urlOriginal, api, debug);
      await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
      return res.json({ ...dados, debug });
  } catch (eA) {
      debug.push(`⚠️  /items/${mlbId}: ${eA.response?.status || eA.message?.substring(0,60)}`);
  }

  // TENTATIVA 2: API DE CATÁLOGOS
  try {
      const dados = await buscarViaProducts(mlbId, rawToken, mlUserId, urlOriginal, api, debug);
      await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
      return res.json({ ...dados, debug });
  } catch (eB) {
      debug.push(`⚠️  /products/${mlbId}: ${eB.response?.status || eB.message?.substring(0,60)}`);
  }

  // TENTATIVA 3: SCRAPING GERAL (Paginação)
  if (urlOriginal) {
      try {
          const dados = await buscarViaScrapingGeral(urlOriginal, rawToken, mlUserId, mlbId, debug);
          await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
          return res.json({ ...dados, debug });
      } catch (eC) {
          debug.push(`❌ Scraping: ${eC.message?.substring(0,60)}`);
      }
  }

  debug.push(`❌ Todas as estratégias falharam para ${mlbId}`);
  const msg = debug.filter(l => l.startsWith('❌') || l.startsWith('⚠️')).join(' | ');
  await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
  res.status(404).json({ error: `Anúncio não encontrado`, debug });
});

// ── Pesquisa de Mercado Profunda (SSE com logs em tempo real) ─────────────────
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
  } catch (e) {}
}

router.put('/api/ml/research/historico/:id/arquivar',      async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:true} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/:id/restaurar',     async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{arquivado:false} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id',            async (req, res) => { try { await prisma.pesquisaHistorico.update({ where:{id:parseInt(req.params.id)}, data:{excluido:true,excluidoEm:new Date()} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => { try { await prisma.pesquisaHistorico.delete({ where:{id:parseInt(req.params.id)} }); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });
router.delete('/api/ml/research/historico/lote',           async (req, res) => { const{ids}=req.body; if(!Array.isArray(ids)) return res.status(400).json({error:'ids obrigatório'}); try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{excluido:true,excluidoEm:new Date()}}); res.json({ok:true,count:ids.length}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/api/ml/research/historico/lote/arquivar',     async (req, res) => { const{ids}=req.body; if(!Array.isArray(ids)) return res.status(400).json({error:'ids obrigatório'}); try { await prisma.pesquisaHistorico.updateMany({where:{id:{in:ids.map(Number)}},data:{arquivado:true}}); res.json({ok:true}); } catch(e){res.status(500).json({error:e.message});} });

export default router;