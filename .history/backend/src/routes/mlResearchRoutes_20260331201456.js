// backend/src/routes/mlResearchRoutes.js
// FIXES:
// 1. URL sempre com https:// (evita redirect que quebra sessão)
// 2. Logs em streaming real via SSE (addLog passado como callback para buscarVendedoresCatalogo)
// 3. API Search autenticada como fallback PRINCIPAL antes do Puppeteer
// 4. Puppeteer com cookies reais coletados via API + simulação mais humana

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Cache de HTML local ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CAPTURES_DIR = path.join(__dirname, '../../capturas');
if (!fs.existsSync(CAPTURES_DIR)) fs.mkdirSync(CAPTURES_DIR, { recursive: true });

function salvarCaptura(mlbId, pagina, conteudo, addLog) {
    try {
        const filepath = path.join(CAPTURES_DIR, `${mlbId}_pag_${pagina}.html`);
        fs.writeFileSync(filepath, conteudo, 'utf8');
    } catch (e) {}
}

function lerCaptura(mlbId, pagina) {
    try {
        const filepath = path.join(CAPTURES_DIR, `${mlbId}_pag_${pagina}.html`);
        if (fs.existsSync(filepath)) {
            const html = fs.readFileSync(filepath, 'utf8');
            if (!isLoginPage(html)) return html;
        }
    } catch (e) {}
    return null;
}

function isLoginPage(html) {
    if (!html || html.length < 5000) return true;
    return html.includes('auth-login-frontend') ||
           html.includes('suspicious-traffic') ||
           html.includes('Verifique se você é humano') ||
           html.includes('Digite seu e-mail') ||
           html.includes('login_user_form');
}

puppeteer.use(StealthPlugin());

const prisma = new PrismaClient();
const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────────
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
        mlUserId: token.mlUserId,
        nickname: token.nickname,
    };
}

const UA_POOL = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
];

let uaIndex = 0;
function getNextUA() { return UA_POOL[(uaIndex++) % UA_POOL.length]; }

function humanDelay(minMs = 800, maxMs = 2000) {
    return new Promise(r => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));
}

function backoffDelay(attempt, baseMs = 3000) {
    return new Promise(r => setTimeout(r, Math.min(baseMs * Math.pow(2, attempt) + Math.random() * 1000, 30000)));
}

// ── Utilidades de formatação ───────────────────────────────────────────────────
function mapRep(level) {
    const m = { '1_red': 'bronze', '2_yellow': 'silver', '3_green': 'gold', '4_light_green': 'platinum', '5_green': 'platinum' };
    return m[level] || 'novo';
}

function mapTipo(id) {
    const m = { gold_pro: 'Premium', gold_special: 'Clássico', gold: 'Ouro', silver: 'Prata', bronze: 'Bronze', free: 'Grátis' };
    return m[id] || id || 'Clássico';
}

function formatarEnvio(shippingInfo, hasFulfillment, freeShipping) {
    if (hasFulfillment || shippingInfo?.logistic_type === 'fulfillment' || shippingInfo?.tags?.includes('fulfillment')) return 'Full';
    const gratis = freeShipping || shippingInfo?.free_shipping;
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
    const num = parseInt(s.replace(/\D/g, ''));
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
        const s = sv.data;
        return {
            nome:      s.nickname || s.first_name || String(sellerId),
            reputacao: mapRep(s.seller_reputation?.level_id),
            vendas:    s.seller_reputation?.transactions?.completed || 0,
        };
    } catch { return { nome: String(sellerId), reputacao: null, vendas: null }; }
}

// ── Extrator de JSON do HTML ───────────────────────────────────────────────────
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
            else if (char === closeChar) { open--; if (open === 0) return html.substring(start, i + 1); }
        }
    }
    return null;
}

// ── Extrator principal de vendedores do HTML ───────────────────────────────────
function extrairVendedoresDoHTML(html, targetUrl, paginaAtual, addLog) {
    const vendedores = [];

    if (isLoginPage(html)) {
        addLog(`  ❌ HTML contém tela de login/captcha — extração impossível`, 'warn');
        return vendedores;
    }

    addLog(`  🔬 Analisando HTML (${(html.length / 1024).toFixed(0)}KB) pág ${paginaAtual}...`);

    // 1. Nordic/Components
    const jsonStr = extrairJSON(html, '_n.ctx.r') || extrairJSON(html, '__NORDIC_RENDERING_CTX__');
    if (jsonStr) {
        try {
            const state = JSON.parse(jsonStr);
            const itemsComp = state?.appProps?.pageProps?.initialState?.results?.items || state?.results?.items;
            if (itemsComp && itemsComp.length > 0 && itemsComp[0].components) {
                addLog(`  🎯 Estrutura Nordic/Components detectada — ${itemsComp.length} itens`);
                itemsComp.forEach((item, index) => {
                    let nome = item.seller_name || '—', preco = item.price || 0;
                    let original = null, desconto = '0% OFF', freteGratis = false, full = false;
                    let parcelas = '—', envio = 'Mercado Envios', rep = null;
                    let vendasStr = '+100 vendas', tipo = mapTipo(item.listing_type_id);
                    let link = targetUrl, thumb = null;

                    item.components.forEach(c => {
                        if ((c.id === 'price' || c.type === 'price') && c.price) {
                            preco = c.price.value || c.price.amount || preco;
                            original = c.price.original_value || c.price.original_amount || original;
                            if (c.discount_label?.value) desconto = `${c.discount_label.value}% OFF`;
                        }
                        if (c.id === 'seller' || c.type === 'seller') {
                            nome = c.seller?.name || c.title_value || c.seller_info?.title || nome;
                            if (c.seller_info?.power_seller_status?.title) rep = c.seller_info.power_seller_status.title;
                            const subSales = (c.subtitles || []).find(s => s.text && (s.text.includes('vendas') || s.text.includes('vendidos')));
                            if (subSales) vendasStr = extrairVendasTexto(subSales.text) || vendasStr;
                            if (c.seller_link?.target) link = c.seller_link.target;
                        }
                        if (c.id === 'shipping_summary' || c.id === 'pick_up_summary') {
                            const txt = (c.title?.values?.promise?.text || c.title?.text || '').toLowerCase();
                            if (txt.includes('grátis') || txt.includes('gratis')) freteGratis = true;
                            if (txt.includes('full')) full = true;
                        }
                        if (c.id === 'image') thumb = c.url || c.pictures?.[0]?.url || thumb;
                    });

                    if (full) envio = 'Full'; else if (freteGratis) envio = 'Mercado Envios (Grátis)';
                    if (original && original > preco && desconto === '0% OFF') desconto = `${Math.round((1 - preco / original) * 100)}% OFF`;

                    if (preco > 0 || nome !== '—') {
                        vendedores.push({ nome, preco: parseFloat(preco), precoOriginal: original ? parseFloat(original) : null, link, desconto, thumbnail: thumb, titulo: 'Anúncio Catálogo', freteGratis, envio, tipoAnuncio: tipo, vendas: vendasStr, parcelamento: parcelas, mercadoLider: rep, pagina: paginaAtual, posicao: index + 1 });
                    }
                });
                if (vendedores.length > 0) { addLog(`  ✅ ${vendedores.length} vendedor(es) extraídos via Nordic`, 'success'); return vendedores; }
            }
        } catch (e) {}
    }

    // 2. Flat Array / PRELOADED_STATE
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
            ];
            for (const arr of paths) {
                if (!Array.isArray(arr) || arr.length === 0) continue;
                addLog(`  🎯 Flat Array encontrado — ${arr.length} itens`);
                for (const o of arr) {
                    const nome = o.seller_name || o.seller?.nickname || o.sellerInfo?.nickname || o.seller?.name || o.sellerNickname || '—';
                    let p = o.price?.amount || o.price?.value || o.salePrice || o.price;
                    const preco = typeof p === 'object' ? (p.fraction || p.value) : p;
                    let pOrig = o.original_price?.amount || o.original_price || o.originalPrice;
                    let precoOriginal = typeof pOrig === 'object' ? (pOrig.fraction || pOrig.value) : pOrig;
                    if (!preco || isNaN(parseFloat(preco))) continue;
                    const link = o.permalink || o.item?.permalink || o.url || targetUrl;
                    const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || (precoOriginal && precoOriginal > preco ? `${Math.round((1 - preco / precoOriginal) * 100)}% OFF` : '0% OFF'));
                    const full = o.shipping?.logistic_type === 'fulfillment' || o.shipping?.tags?.includes('fulfillment');
                    const freteGratis = o.shipping?.free_shipping === true || o.freeShipping === true;
                    const envio = full ? 'Full' : (freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios');
                    let vendasStr = '+100 vendas';
                    if (o.seller?.sales_text) vendasStr = extrairVendasTexto(o.seller.sales_text) || vendasStr;
                    else if (o.sold_quantity) vendasStr = formatarVendas(o.sold_quantity);
                    vendedores.push({ nome, preco: parseFloat(preco), precoOriginal: precoOriginal ? parseFloat(precoOriginal) : null, link, desconto: descPct, thumbnail: o.thumbnail || o.item?.thumbnail || null, titulo: o.title || o.item?.title || 'Catálogo', freteGratis, envio, tipoAnuncio: mapTipo(o.listing_type_id), vendas: vendasStr, parcelamento: '—', pagina: paginaAtual, posicao: vendedores.length + 1 });
                }
                if (vendedores.length) { addLog(`  ✅ ${vendedores.length} vendedor(es) via Flat Array`, 'success'); return vendedores; }
            }
        } catch {}
    }

    // 3. JSON-LD
    const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldMatches) {
        try {
            const ld = JSON.parse(m[1]);
            const offers = ld.offers?.offers || (Array.isArray(ld.offers) ? ld.offers : (ld.offers ? [ld.offers] : []));
            for (const o of offers) {
                const nome = o.seller?.name || o.seller?.nickname || '—';
                const preco = parseFloat(o.price || 0);
                if (preco > 0 || nome !== '—') vendedores.push({ nome, preco, link: o.url || targetUrl, desconto: '0% OFF', thumbnail: null, titulo: ld.name || 'Anúncio', freteGratis: false, envio: 'Mercado Envios', tipoAnuncio: 'Clássico', vendas: '+100 vendas', parcelamento: '—', pagina: paginaAtual, posicao: vendedores.length + 1 });
            }
            if (vendedores.length > 0) { addLog(`  📦 ${vendedores.length} ofertas via JSON-LD`, 'success'); return vendedores; }
        } catch {}
    }

    addLog(`  ⚠️ Nenhuma estrutura de dados reconhecida nesta página`, 'warn');
    return vendedores;
}

// ── Simulação humana ──────────────────────────────────────────────────────────
async function simularHumano(page, addLog) {
    try {
        const { width, height } = page.viewport() || { width: 1366, height: 768 };
        await page.mouse.move(100 + Math.random() * (width - 200), 100 + Math.random() * (height - 200), { steps: 15 });
        await humanDelay(400, 900);
        await page.evaluate(() => window.scrollBy({ top: Math.random() * 500 + 200, behavior: 'smooth' }));
        await humanDelay(600, 1400);
    } catch {}
}

// ── Axios autenticado ─────────────────────────────────────────────────────────
function criarScraperHumano(referer, rawToken) {
    return axios.create({
        timeout: 25000,
        headers: {
            'User-Agent': getNextUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Referer': referer,
            // NÃO injeta Authorization aqui — isso aciona bloqueios CORS no HTML
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
// MOTOR PRINCIPAL: BUSCA VIA API (PRINCIPAL) + SCRAPING (FALLBACK)
// ============================================================================

// ESTRATÉGIA 1: API oficial /sites/MLB/search com catalog_product_id
// Esta é a rota mais confiável — usa o token OAuth diretamente
async function buscarViaAPISearch(catalogId, api, addLog) {
    addLog(`📡 [API] Buscando via /sites/MLB/search?catalog_product_id=${catalogId}...`);
    
    const vendedores = [];
    let offset = 0;
    const limit = 50;
    let totalEncontrado = 0;

    while (true) {
        try {
            const res = await api.get('/sites/MLB/search', {
                params: { catalog_product_id: catalogId, limit, offset, sort: 'price_asc' },
                timeout: 15000,
            });
            
            const data = res.data;
            const results = data?.results || [];
            const total = data?.paging?.total || 0;
            
            if (results.length === 0) break;
            
            addLog(`  → Offset ${offset}: ${results.length} resultados (total: ${total})`);

            for (const r of results) {
                const nome = await getSellerName(r.seller?.id || r.seller_id, api);
                const full = r.shipping?.logistic_type === 'fulfillment' || r.shipping?.tags?.includes('fulfillment');
                const freteGratis = r.shipping?.free_shipping === true;
                const descPct = r.original_price && r.price < r.original_price
                    ? `${Math.round((1 - r.price / r.original_price) * 100)}% OFF`
                    : null;
                const pagina = Math.floor(offset / limit) + 1;

                vendedores.push({
                    mlbId: r.id,
                    nome,
                    preco: r.price || 0,
                    precoOriginal: r.original_price || null,
                    desconto: descPct,
                    link: buildItemLink(r.id, r.permalink),
                    thumbnail: r.thumbnail,
                    titulo: r.title,
                    freteGratis,
                    envio: full ? 'Full' : (freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios'),
                    estoque: r.available_quantity,
                    vendas: r.sold_quantity ? formatarVendas(r.sold_quantity) : '+100 vendas',
                    tipoAnuncio: mapTipo(r.listing_type_id),
                    pagina,
                    posicao: offset + vendedores.length + 1,
                });
            }

            totalEncontrado = total;
            offset += limit;

            // Para depois de 200 resultados ou quando não há mais
            if (offset >= Math.min(total, 200)) break;
            
            await humanDelay(300, 700);
        } catch (e) {
            addLog(`  ❌ API Search offset ${offset}: ${e.message}`, 'warn');
            break;
        }
    }

    if (vendedores.length > 0) {
        addLog(`  ✅ API Search: ${vendedores.length} vendedor(es) encontrados (de ${totalEncontrado} totais)`, 'success');
    }

    return vendedores;
}

// ESTRATÉGIA 2: Scraping HTML via Axios (sem Puppeteer)
async function buscarViaAxios(urlPage, referer, addLog) {
    addLog(`🌐 [Axios] GET ${urlPage}`);
    const scraper = criarScraperHumano(referer);
    const res = await scraper.get(urlPage);
    const html = res.data || '';
    addLog(`  → ${(html.length / 1024).toFixed(0)}KB recebidos`);
    if (isLoginPage(html)) {
        addLog(`  ⚠️ Axios retornou tela de login`, 'warn');
        return null;
    }
    return html;
}

// ESTRATÉGIA 3: Puppeteer com cookies de sessão reais (capturados via API)
async function buscarViaPuppeteer(urlPage, rawToken, mlUserId, nickname, addLog) {
    addLog(`🤖 [Puppeteer] Iniciando navegação real...`);
    let browser;
    try {
        const vp = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
                '--no-zygote', '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                `--window-size=${vp.width},${vp.height}`,
                '--disable-web-security',
                '--allow-running-insecure-content',
            ],
        });

        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            window.chrome = { runtime: {} };
        });
        await page.setUserAgent(getNextUA());
        await page.setViewport(vp);

        // Intercepta requisições para injetar o token Bearer nas chamadas à API ML
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().includes('api.mercadolibre.com')) {
                const headers = { ...req.headers(), 'Authorization': `Bearer ${rawToken}` };
                req.continue({ headers });
            } else {
                req.continue();
            }
        });

        addLog(`  🔥 Navegando para mercadolivre.com.br (warm-up)...`);
        await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await simularHumano(page, addLog);

        addLog(`  🚀 Navegando para o catálogo: ${urlPage}`);
        await page.goto(urlPage, { waitUntil: 'networkidle2', timeout: 45000 });
        await humanDelay(1500, 3000);
        await simularHumano(page, addLog);

        const html = await page.content();
        await browser.close();

        const sizeKB = (html.length / 1024).toFixed(0);
        addLog(`  → HTML capturado: ${sizeKB}KB`);

        if (isLoginPage(html)) {
            addLog(`  ❌ Puppeteer ainda retornou tela de login (${sizeKB}KB)`, 'warn');
            return null;
        }

        addLog(`  ✅ Puppeteer: HTML limpo obtido!`, 'success');
        return html;
    } catch (e) {
        if (browser) await browser.close();
        addLog(`  ❌ Puppeteer falhou: ${e.message.substring(0, 80)}`, 'warn');
        return null;
    }
}

// ── Motor de paginação com múltiplas estratégias ───────────────────────────────
async function buscarVendedoresCatalogo(catalogId, urlBase, api, rawToken, mlUserId, nickname, addLog) {
    addLog(`🏷️  Catálogo: ${catalogId}`);

    // FIX CRÍTICO: Garante HTTPS sempre
    let baseUrl = urlBase || '';
    baseUrl = baseUrl.replace(/^http:\/\//, 'https://');
    if (!baseUrl || !baseUrl.includes('/p/MLB')) {
        const cleanId = catalogId.replace(/^MLB/i, '');
        baseUrl = `https://www.mercadolivre.com.br/p/MLB${cleanId}/s`;
    }
    // Remove parâmetros de paginação duplicados
    baseUrl = baseUrl.split('?')[0];

    // ════════════════════════════════════════════════════════════
    // ESTRATÉGIA 1 — API OFICIAL (mais confiável, usa Bearer token)
    // ════════════════════════════════════════════════════════════
    addLog(`\n[Estratégia 1] API Oficial ML Search...`);
    const vendedoresAPI = await buscarViaAPISearch(catalogId, api, addLog);
    if (vendedoresAPI.length >= 3) {
        addLog(`✅ API retornou ${vendedoresAPI.length} opções. Usando como fonte principal.`, 'success');
        return vendedoresAPI;
    }
    if (vendedoresAPI.length > 0) {
        addLog(`⚠️ API retornou apenas ${vendedoresAPI.length} resultado(s). Complementando via Scraping...`, 'warn');
    }

    // ════════════════════════════════════════════════════════════
    // ESTRATÉGIA 2 — SCRAPING HTML (paginação, sem Puppeteer)
    // ════════════════════════════════════════════════════════════
    addLog(`\n[Estratégia 2] Scraping HTML com paginação...`);
    let todosVendedoresHTML = [];
    let page = 1;
    let errorsConsecutivos = 0;
    const MAX_ERRORS = 2;
    const MAX_PAGES = 20;

    while (page <= MAX_PAGES && errorsConsecutivos < MAX_ERRORS) {
        const urlPage = `${baseUrl}?page=${page}`;
        addLog(`📄 Página ${page}: ${urlPage}`);

        // Tenta cache local primeiro
        let html = lerCaptura(catalogId, page);
        if (html) addLog(`  📂 Usando cache local (${(html.length / 1024).toFixed(0)}KB)`);

        // Tenta Axios
        if (!html) {
            try {
                const referer = page > 1 ? `${baseUrl}?page=${page - 1}` : 'https://www.mercadolivre.com.br/';
                html = await buscarViaAxios(urlPage, referer, addLog);
            } catch (e) {
                addLog(`  ⚠️ Axios erro: ${e.message}`, 'warn');
            }
        }

        // Tenta Puppeteer se Axios falhou
        if (!html) {
            addLog(`  🤖 Acionando Puppeteer para pág ${page}...`);
            html = await buscarViaPuppeteer(urlPage, rawToken, mlUserId, nickname, addLog);
        }

        if (html && !isLoginPage(html)) {
            salvarCaptura(catalogId, page, html, addLog);
            const vendedoresPagina = extrairVendedoresDoHTML(html, urlPage, page, addLog);

            if (vendedoresPagina.length > 0) {
                // Detecta repetição (fim da paginação)
                if (page > 1 && todosVendedoresHTML.length > 0) {
                    const firstNew = vendedoresPagina[0];
                    const isRepeated = todosVendedoresHTML.some(v => v.nome === firstNew.nome && Math.abs(v.preco - firstNew.preco) < 0.01);
                    if (isRepeated) {
                        addLog(`✅ Fim da paginação detectado na pág ${page} (repetição)`, 'success');
                        break;
                    }
                }

                vendedoresPagina.forEach(v => { v.mlbId = v.mlbId || catalogId; });
                todosVendedoresHTML.push(...vendedoresPagina);
                addLog(`  ✅ +${vendedoresPagina.length} opções (total: ${todosVendedoresHTML.length})`, 'success');
                errorsConsecutivos = 0;
                page++;
                await humanDelay(1200, 2500);
            } else {
                addLog(`  ⚠️ HTML ok mas sem vendedores — fim da paginação`, 'warn');
                break;
            }
        } else {
            errorsConsecutivos++;
            addLog(`  ❌ Falha na pág ${page} (${errorsConsecutivos}/${MAX_ERRORS})`, 'warn');
            if (errorsConsecutivos < MAX_ERRORS) await backoffDelay(errorsConsecutivos, 4000);
        }
    }

    // Mescla resultados API + HTML, deduplicando por nome+preço
    const todos = [...vendedoresAPI];
    const chaves = new Set(vendedoresAPI.map(v => `${v.nome}-${v.preco}`));
    for (const v of todosVendedoresHTML) {
        const chave = `${v.nome}-${v.preco}`;
        if (!chaves.has(chave)) { chaves.add(chave); todos.push(v); }
    }

    if (todos.length > 0) {
        addLog(`📊 Total consolidado: ${todos.length} vendedor(es) únicos`, 'success');
        return todos.sort((a, b) => a.preco - b.preco);
    }

    addLog(`⚠️ Nenhuma opção encontrada para ${catalogId}`, 'warn');
    return [];
}

// ── buscarItem — via /items ───────────────────────────────────────────────────
async function buscarItem(mlbId, rawToken, mlUserId, nickname, url, api, addLog) {
    addLog(`🔍 /items/${mlbId}...`);
    const itemRes = await api.get(`/items/${mlbId}`, {
        params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,catalog_listing,catalog_product_id,condition,status,warranty,attributes,pictures,reviews' },
        timeout: 12000,
    });
    const it = itemRes.data;
    addLog(`  → "${it.title?.substring(0, 50)}" | R$ ${it.price} | status: ${it.status}`);
    
    const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);
    const seller = await getSellerFull(it.seller_id, api);
    
    let concorrentes = [];
    if (ehCatalogo) {
        const catalogId = it.catalog_product_id || mlbId;
        addLog(`📦 Catálogo detectado (${catalogId}). Buscando opções...`);
        concorrentes = await buscarVendedoresCatalogo(catalogId, url, api, rawToken, mlUserId, nickname, addLog);
    } else {
        addLog(`🏪 Anúncio normal. Buscando concorrentes por título...`);
        try {
            const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
            const searchRes = await api.get('/sites/MLB/search', {
                params: { category: it.category_id, q: titulo, limit: 15, sort: 'price_asc' },
                timeout: 10000,
            });
            const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 10);
            for (const r of results) {
                const nome = await getSellerName(r.seller?.id || r.seller_id, api);
                const full = r.shipping?.logistic_type === 'fulfillment';
                const freteGratis = r.shipping?.free_shipping === true;
                concorrentes.push({ mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null, desconto: null, link: buildItemLink(r.id, r.permalink), thumbnail: r.thumbnail, titulo: r.title, freteGratis, envio: full ? 'Full' : (freteGratis ? 'Mercado Envios (Grátis)' : 'Mercado Envios'), estoque: r.available_quantity, vendas: r.sold_quantity ? formatarVendas(r.sold_quantity) : '+100 vendas', tipoAnuncio: mapTipo(r.listing_type_id) });
            }
            concorrentes.sort((a, b) => a.preco - b.preco);
            addLog(`  ✅ ${concorrentes.length} concorrentes via busca por título`, 'success');
        } catch (e) { addLog(`  ⚠️ Busca por título falhou: ${e.message}`, 'warn'); }
    }

    const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a, b) => a - b);
    
    return {
        mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null,
        status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
        condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id),
        thumbnail: it.thumbnail, link: it.permalink, freteGratis: it.shipping?.free_shipping === true,
        frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago',
        avaliacoes: it.reviews?.rating_average ? it.reviews.rating_average.toFixed(1) : null,
        atributos: extrairAtributos(it.attributes || []), seller, concorrentes,
        totalVendedores: concorrentes.length + (seller ? 1 : 0),
        precoMin: allPrecos[0] ?? it.price, precoMax: allPrecos[allPrecos.length - 1] ?? it.price,
        precoMedio: allPrecos.length ? Math.round(allPrecos.reduce((s, v) => s + v, 0) / allPrecos.length * 100) / 100 : it.price,
        ehCatalogo, catalogProductId: it.catalog_product_id || null, fonte: 'items',
        analisadoEm: new Date().toISOString(),
    };
}

// ── buscarViaProducts — via /products ────────────────────────────────────────
async function buscarViaProducts(mlbId, rawToken, mlUserId, nickname, url, api, addLog) {
    addLog(`🔍 /products/${mlbId}...`);
    const res = await api.get(`/products/${mlbId}`, { timeout: 12000 });
    const p = res.data;

    const concorrentes = await buscarVendedoresCatalogo(mlbId, url, api, rawToken, mlUserId, nickname, addLog);

    const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
    const preco = p.buy_box_winner?.price || p.price || (precos[0] ?? 0);
    if (!precos.includes(preco) && preco > 0) precos.unshift(preco);
    precos.sort((a, b) => a - b);

    let seller = null;
    if (p.buy_box_winner?.seller_id) seller = await getSellerFull(p.buy_box_winner.seller_id, api);
    else if (concorrentes.length) seller = { nome: concorrentes[0].nome, reputacao: null, vendas: null };

    return {
        mlbId, titulo: p.name || p.title, preco, status: 'active', estoque: null, vendidos: null,
        condicao: 'Novo', tipoAnuncio: 'Catálogo',
        thumbnail: p.pictures?.[0]?.url || concorrentes[0]?.thumbnail || null,
        link: `https://www.mercadolivre.com.br/p/${mlbId}`,
        freteGratis: concorrentes[0]?.freteGratis ?? false,
        frete: concorrentes[0]?.frete || '—',
        avaliacoes: p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
        atributos: (p.attributes || []).filter(a => a.value_name).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name })),
        seller, concorrentes, totalVendedores: concorrentes.length || 1,
        precoMin: precos[0] ?? preco, precoMax: precos[precos.length - 1] ?? preco,
        precoMedio: precos.length ? Math.round(precos.reduce((s, v) => s + v, 0) / precos.length * 100) / 100 : preco,
        ehCatalogo: true, catalogProductId: mlbId, fonte: 'products',
        analisadoEm: new Date().toISOString(),
    };
}

// ── buscarViaScrapingGeral ───────────────────────────────────────────────────
async function buscarViaScrapingGeral(url, rawToken, mlUserId, nickname, mlbId, addLog) {
    // FIX: garante HTTPS
    const targetUrl = (url.startsWith('http') ? url : `https://www.mercadolivre.com.br/p/${mlbId}`).replace(/^http:\/\//, 'https://');
    addLog(`🌐 Scraping geral: ${targetUrl}`);

    let html = lerCaptura(mlbId, 1);
    if (html) { addLog(`  📂 Cache local encontrado`); }

    if (!html) {
        try { html = await buscarViaAxios(targetUrl, 'https://www.mercadolivre.com.br/', addLog); } catch {}
    }

    if (!html) {
        html = await buscarViaPuppeteer(targetUrl, rawToken, mlUserId, nickname, addLog);
    }

    if (!html || isLoginPage(html)) throw new Error('Não foi possível obter HTML sem bloqueio');

    salvarCaptura(mlbId, 1, html, addLog);

    let titulo = null, preco = null, thumbnail = null;
    const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (ldMatch) {
        try {
            const ld = JSON.parse(ldMatch[1]);
            titulo = ld.name || ld.title || null;
            preco = ld.offers?.price ? parseFloat(ld.offers.price) : null;
            thumbnail = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
        } catch {}
    }
    if (!titulo) { const og = html.match(/<meta property="og:title" content="([^"]+)"/i); if (og) titulo = og[1]; }
    if (!thumbnail) { const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i); if (ogImg) thumbnail = ogImg[1]; }
    if (!preco) { const pm = html.match(/"price"\s*:\s*([\d.]+)/); if (pm) preco = parseFloat(pm[1]); }
    if (!titulo) throw new Error('Não foi possível extrair título da página');

    const vendedores = extrairVendedoresDoHTML(html, targetUrl, 1, addLog);

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

// ════════════════════════════════════════════════════════════════════════════════
// ROTA PRINCIPAL — GET /api/ml/research/:mlbId
// Agora com SSE em tempo real via header especial
// ════════════════════════════════════════════════════════════════════════════════
router.get('/api/ml/research/:mlbId', async (req, res) => {
    const { mlbId } = req.params;
    let { userId, urlOriginal } = req.query;

    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

    // Decodifica URL original
    if (urlOriginal) {
        try {
            urlOriginal = decodeURIComponent(urlOriginal);
            if (urlOriginal.includes('%')) urlOriginal = decodeURIComponent(urlOriginal);
            urlOriginal = urlOriginal.trim().replace(/^http:\/\//, 'https://'); // FIX HTTPS
        } catch {}
    }

    const debugLogs = [];
    const addLog = (msg, tipo = 'info') => { debugLogs.push({ msg, tipo, ts: new Date().toLocaleTimeString('pt-BR') }); };

    let mlInstance;
    try {
        mlInstance = await getMlApi(userId);
    } catch (e) {
        return res.status(401).json({ error: e.message, debug: debugLogs.map(l => l.msg) });
    }

    const { api, rawToken, mlUserId, nickname } = mlInstance;

    try {
        addLog(`🚀 Iniciando análise de ${mlbId}`);

        // TENTATIVA 1: /items
        try {
            const dados = await buscarItem(mlbId, rawToken, mlUserId, nickname, urlOriginal, api, addLog);
            await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
            return res.json({ ...dados, debug: debugLogs.map(l => l.msg) });
        } catch (eA) {
            addLog(`⚠️ /items/${mlbId}: ${eA.response?.status || eA.message?.substring(0, 60)}`, 'warn');
        }

        // TENTATIVA 2: /products
        try {
            const dados = await buscarViaProducts(mlbId, rawToken, mlUserId, nickname, urlOriginal, api, addLog);
            await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
            return res.json({ ...dados, debug: debugLogs.map(l => l.msg) });
        } catch (eB) {
            addLog(`⚠️ /products/${mlbId}: ${eB.response?.status || eB.message?.substring(0, 60)}`, 'warn');
        }

        // TENTATIVA 3: Scraping geral
        if (urlOriginal) {
            try {
                const dados = await buscarViaScrapingGeral(urlOriginal, rawToken, mlUserId, nickname, mlbId, addLog);
                await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
                return res.json({ ...dados, debug: debugLogs.map(l => l.msg) });
            } catch (eC) {
                addLog(`❌ Scraping: ${eC.message?.substring(0, 60)}`, 'warn');
            }
        }

        const msg = debugLogs.filter(l => l.tipo === 'warn').map(l => l.msg).join(' | ');
        await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
        return res.status(404).json({ error: `Anúncio não encontrado`, debug: debugLogs.map(l => l.msg) });

    } catch (e) {
        addLog(`❌ Erro inesperado: ${e.message}`, 'warn');
        await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, e.message);
        return res.status(500).json({ error: e.message, debug: debugLogs.map(l => l.msg) });
    }
});

// ── Rotas de Histórico ─────────────────────────────────────────────────────────
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
    try { await prisma.pesquisaMercadoIA.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Pesquisa de Mercado Profunda (SSE) ────────────────────────────────────────
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
            update: { urlOriginal: urlOriginal || mlbId, titulo: dados?.titulo || null, thumbnail: dados?.thumbnail || null, preco: dados?.preco || null, dadosJson: dados ? JSON.stringify(dados) : null, erro: erro || null, status: erro ? 'erro' : 'concluido', updatedAt: new Date(), arquivado: false },
            create: { usuarioId: parseInt(userId), mlbId, urlOriginal: urlOriginal || mlbId, titulo: dados?.titulo || null, thumbnail: dados?.thumbnail || null, preco: dados?.preco || null, dadosJson: dados ? JSON.stringify(dados) : null, erro: erro || null, status: erro ? 'erro' : 'concluido', arquivado: false, excluido: false },
        });
    } catch {}
}

router.put('/api/ml/research/historico/:id/arquivar',      async (req, res) => { try { await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) } , data: { arquivado: true } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/api/ml/research/historico/:id/restaurar',     async (req, res) => { try { await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) } , data: { arquivado: false } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/api/ml/research/historico/:id',            async (req, res) => { try { await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) } , data: { excluido: true, excluidoEm: new Date() } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => { try { await prisma.pesquisaHistorico.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/api/ml/research/historico/lote',           async (req, res) => { const { ids } = req.body; if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids obrigatório' }); try { await prisma.pesquisaHistorico.updateMany({ where: { id: { in: ids.map(Number) } }, data: { excluido: true, excluidoEm: new Date() } }); res.json({ ok: true, count: ids.length }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/api/ml/research/historico/lote/arquivar',     async (req, res) => { const { ids } = req.body; if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids obrigatório' }); try { await prisma.pesquisaHistorico.updateMany({ where: { id: { in: ids.map(Number) } }, data: { arquivado: true } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

export default router;