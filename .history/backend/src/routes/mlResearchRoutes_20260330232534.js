// backend/src/routes/mlResearchRoutes.js — v6
// Adicionado: GET /market-analyses, DELETE /market-analyses/:id
// Agente de pesquisa com logs SSE no terminal
// ATUALIZADO: Paginação contínua (API e Web) varrendo página por página até acabar.
// ATUALIZADO: Extração exata de Posição Contínua, Formatação de Vendas e Envio Full/Envios.

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * Cria uma instância do Axios autenticada para a API oficial do Mercado Livre.
 */
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

/**
 * Agente de scraping simulando navegador real.
 */
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
  if (hasFulfillment || (shippingInfo?.tags && shippingInfo.tags.includes('fulfillment'))) return 'Full';
  if (shippingInfo?.free_shipping) return 'Mercado Envios (Grátis)';
  return 'Mercado Envios';
}

function formatarVendas(soldQuantity) {
  if (!soldQuantity) return 'Novo';
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

// ============================================================================
// DADOS DO VENDEDOR (CACHE)
// ============================================================================

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
// MOTOR DE SCRAPING DE HTML DA BUYBOX (CATÁLOGO)
// ============================================================================

function extrairVendedoresDoHTML(html, targetUrl, debug) {
  const vendedores = [];
  
  const pageMatch = (targetUrl||'').match(/page=(\d+)/i);
  const paginaAtual = pageMatch ? parseInt(pageMatch[1]) : 1;

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
        
        arr.forEach((o, index) => {
          const nome  = o.seller?.nickname || o.sellerInfo?.nickname || o.seller_name || o.seller?.name || o.sellerNickname || '—';
          const preco = o.price?.amount || o.price?.value || o.salePrice || o.price || 0;
          const precoOriginal = o.original_price?.amount || o.originalPrice || null;
          const link  = o.permalink || o.item?.permalink || o.url || '';
          
          const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || null);
          const isFull = o.shipping?.fulfillment || o.has_full_filment || false;
          const parcelamento = o.installment_info || (o.installments ? `${o.installments.quantity}x` : '—');
          
          let vendasStr = o.seller?.sales_text || o.sellerInfo?.sales_text || null;
          if (!vendasStr && o.seller?.transactions?.completed) vendasStr = formatarVendas(o.seller.transactions.completed);
          if (!vendasStr) vendasStr = '+100 vendas';

          if (parseFloat(preco) > 0 || nome !== '—') {
            vendedores.push({ 
              nome, preco: parseFloat(preco) || 0, precoOriginal: precoOriginal || null,
              link, desconto: descPct,
              thumbnail: o.thumbnail || o.item?.thumbnail || null, titulo: o.title || o.item?.title || 'Anúncio Catálogo',
              freteGratis: o.shipping?.free_shipping === true || o.freeShipping === true,
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

  // Fallbacks de segurança para Scraping
  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    try {
      const ld = JSON.parse(m[1]);
      const offers = ld.offers?.offers || (Array.isArray(ld.offers) ? ld.offers : (ld.offers ? [ld.offers] : []));
      for (const o of offers) {
        const nome  = o.seller?.name || o.seller?.nickname || '—';
        const preco = parseFloat(o.price || 0);
        if (preco > 0 || nome !== '—') {
          vendedores.push({ nome, preco, link: o.url || '', desconto: null, thumbnail: null, titulo: ld.name || null, freteGratis: false, frete: '—', envio:'—', vendas:'—', pagina: paginaAtual, posicao: '-' });
        }
      }
      if (vendedores.length) return vendedores;
    } catch {}
  }

  return [];
}

// ============================================================================
// BUSCA ITERATIVA COM PAGINAÇÃO CONTÍNUA
// ============================================================================

async function buscarVendedoresCatalogo(catalogId, api, debug) {
  debug.push(`🏷️  Catálogo ID: ${catalogId}`);
  
  // TENTATIVA 1: API Oficial do ML varrendo TODAS as páginas através do Offset
  try {
    let todosVendedoresAPI = [];
    let offset = 0;
    const limit = 50;
    let pagina = 1;
    let continuar = true;
    
    // Limite de 15 páginas = Max 750 vendedores (Evita Timeout do Servidor Node)
    while (continuar && pagina <= 15) {
      debug.push(`📡 API GET: /products/${catalogId}/items?limit=${limit}&offset=${offset} (Pág ${pagina})`);
      const res = await api.get(`/products/${catalogId}/items`, {
        params: { limit, offset, fields: 'id,title,price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,original_price,catalog_product_id' },
        timeout: 10000,
      });
      
      const results = res.data?.results || [];
      if (results.length === 0) break;
      
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const id   = r.item_id || r.id;
        const nome = await getSellerName(r.seller_id, api);
        const descPct = r.original_price && r.price < r.original_price ? Math.round((1 - r.price / r.original_price) * 100) : null;
        
        todosVendedoresAPI.push({
          mlbId: id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
          desconto: descPct ? `${descPct}% OFF` : null, link: buildItemLink(id, r.permalink),
          thumbnail: r.thumbnail, titulo: r.title, 
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
          envio: formatarEnvio(r.shipping, false),
          freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
          vendidos: r.sold_quantity, vendas: formatarVendas(r.sold_quantity),
          tipoAnuncio: mapTipo(r.listing_type_id),
          pagina: pagina, posicao: offset + i + 1 // Posição contínua ao longo das páginas
        });
      }
      
      // Checa se ainda tem páginas para buscar
      if (res.data?.paging?.total <= offset + limit) {
        continuar = false;
      } else {
        offset += limit;
        pagina++;
      }
    }
    
    if (todosVendedoresAPI.length > 0) {
      todosVendedoresAPI.sort((a, b) => a.preco - b.preco);
      debug.push(`✅ ${todosVendedoresAPI.length} vendedor(es) carregado(s) em ${pagina} páginas via /products`);
      return todosVendedoresAPI;
    }
  } catch (e) {
    debug.push(`❌ Erro na API Oficial Paginada: ${e.response?.status || e.message?.substring(0,60)}`);
  }

  // TENTATIVA 2: Scraping Paginado (O comportamento exato que você pediu de ler page=2, page=3 até dar erro)
  const cleanId = catalogId.replace(/^MLB/i, '');
  const urlBaseScraping = `https://www.mercadolivre.com.br/p/MLB${cleanId}/s`;
  
  let todosVendedoresScrap = [];
  let paginaScrap = 1;
  let continuarScrap = true;
  let offsetScrap = 0; // Controla a numeração global das posições

  while(continuarScrap && paginaScrap <= 15) {
    const urlPage = `${urlBaseScraping}?quantity=1&page=${paginaScrap}`;
    try {
      debug.push(`🌐 Scraping Pág ${paginaScrap}: ${urlPage}`);
      const res  = await scraperAgent.get(urlPage);
      const html = res.data || '';
      
      const vendedoresPagina = extrairVendedoresDoHTML(html, urlPage, debug);
      
      if (vendedoresPagina.length > 0) {
        // Formata os dados para garantir que a "posição" siga a contagem de páginas anteriores
        const formatados = vendedoresPagina.map((v, idx) => ({
           ...v,
           posicao: offsetScrap + idx + 1
        }));
        
        todosVendedoresScrap.push(...formatados);
        offsetScrap += vendedoresPagina.length;
        paginaScrap++;
        
        // Pausa para não tomar Block da Cloudflare
        await new Promise(r => setTimeout(r, 1000));
      } else {
        continuarScrap = false; // Bateu numa página vazia, erro ou 404
      }
    } catch (e) {
      debug.push(`⚠️ Scraping parou na pág ${paginaScrap}: ${e.message?.substring(0,60)}`);
      continuarScrap = false;
    }
  }
  
  if (todosVendedoresScrap.length > 0) {
    debug.push(`✅ ${todosVendedoresScrap.length} vendedor(es) carregado(s) em ${paginaScrap-1} página(s) via SCRAPING`);
    return todosVendedoresScrap;
  }

  debug.push(`⚠️  Nenhuma opção de compra encontrada para ${catalogId}`);
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
  debug.push(`   → Preço: R$ ${it.price} | Status: ${it.status}`);
  debug.push(`   → catalog_listing: ${it.catalog_listing} | catalog_product_id: ${it.catalog_product_id || 'N/A'}`);
  debug.push(`   → seller_id: ${it.seller_id}`);
  
  const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);
  debug.push(`👤 Buscando dados do vendedor principal...`);
  const seller = await getSellerFull(it.seller_id, api);
  debug.push(`   → Vendedor: ${seller?.nome || '—'}`);
  
  let concorrentes = [];
  if (ehCatalogo) {
    const catalogId = it.catalog_product_id || mlbId;
    debug.push(`📦 Produto de CATÁLOGO detectado. Iniciando busca paginada global...`);
    concorrentes = await buscarVendedoresCatalogo(catalogId, api, debug);
    
    // Fallback: se catálogo for inválido, busca por título semelhante
    if (concorrentes.length === 0) {
      debug.push(`🔄 Fallback: busca por título na categoria ${it.category_id}...`);
      try {
        const titulo = (it.title || '').split(' ').slice(0, 5).join(' ');
        const searchRes = await api.get('/sites/MLB/search', {
          params: { category: it.category_id, q: titulo, limit: 20, sort: 'price_asc' },
          timeout: 10000,
        });
        const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 10);
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const nome = await getSellerName(r.seller?.id || r.seller_id, api);
          concorrentes.push({
            mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
            desconto: null, link: buildItemLink(r.id, r.permalink), thumbnail: r.thumbnail, titulo: r.title,
            frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: formatarEnvio(r.shipping, false),
            freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
            vendidos: r.sold_quantity, vendas: formatarVendas(r.sold_quantity), tipoAnuncio: mapTipo(r.listing_type_id),
            pagina: 1, posicao: i + 1
          });
        }
        concorrentes.sort((a, b) => a.preco - b.preco);
      } catch (e) { debug.push(`❌ Busca por título falhou: ${e.message?.substring(0,50)}`); }
    }
  } else {
    debug.push(`🏪 Anúncio normal. Buscando concorrentes relacionados...`);
    try {
      const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
      const searchRes = await api.get('/sites/MLB/search', {
        params: { category: it.category_id, q: titulo, limit: 15, sort: 'price_asc' },
        timeout: 10000,
      });
      const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 10);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const nome = await getSellerName(r.seller?.id || r.seller_id, api);
        concorrentes.push({
          mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
          desconto: null, link: buildItemLink(r.id, r.permalink), thumbnail: r.thumbnail, titulo: r.title,
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: formatarEnvio(r.shipping, false),
          freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
          vendidos: r.sold_quantity, vendas: formatarVendas(r.sold_quantity), tipoAnuncio: mapTipo(r.listing_type_id),
          pagina: 1, posicao: i + 1
        });
      }
      concorrentes.sort((a, b) => a.preco - b.preco);
    } catch (e) { debug.push(`❌ Busca concorrentes falhou: ${e.message?.substring(0,50)}`); }
  }
  
  debug.push(`📊 Total de opções/concorrentes extraídas em todas as páginas: ${concorrentes.length}`);
  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a,b)=>a-b);
  const precoMin  = allPrecos[0] ?? it.price;
  const precoMax  = allPrecos[allPrecos.length-1] ?? it.price;
  const precoMed  = allPrecos.length ? Math.round(allPrecos.reduce((s,v)=>s+v,0)/allPrecos.length*100)/100 : it.price;
  
  const pageMatch = (url||'').match(/page=(\d+)/i);
  const paginaAtual = pageMatch ? parseInt(pageMatch[1]) : 1;

  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null,
    status: it.status, estoque: it.available_quantity, vendidos: it.sold_quantity,
    vendas: formatarVendas(it.sold_quantity),
    condicao: it.condition === 'new' ? 'Novo' : 'Usado', tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: it.permalink, freteGratis: it.shipping?.free_shipping === true,
    frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago', envio: formatarEnvio(it.shipping, false),
    avaliacoes: it.reviews?.rating_average ? it.reviews.rating_average.toFixed(1) : null,
    atributos: extrairAtributos(it.attributes || []), seller, concorrentes,
    totalVendedores: concorrentes.length + (seller ? 1 : 0), precoMin, precoMax, precoMedio: precoMed,
    ehCatalogo, catalogProductId: it.catalog_product_id || null, fonte: 'items',
    analisadoEm: new Date().toISOString(), pagina: paginaAtual, posicao: 1
  };
}

async function buscarViaProducts(mlbId, api, debug) {
  debug.push(`🔍 Tentando /products/${mlbId}...`);
  const res = await api.get(`/products/${mlbId}`, { timeout: 12000 });
  const p   = res.data;
  debug.push(`   → Nome do produto: ${p.name?.substring(0,50) || 'N/A'}`);
  const concorrentes = await buscarVendedoresCatalogo(mlbId, api, debug);
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
    envio: concorrentes[0]?.envio || '—', vendas: formatarVendas(null),
    avaliacoes: p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
    atributos: (p.attributes || []).filter(a=>a.value_name).slice(0,14).map(a=>({nome:a.name,valor:a.value_name})),
    seller, concorrentes, totalVendedores: concorrentes.length || 1,
    precoMin: precos[0] ?? preco, precoMax: precos[precos.length-1] ?? preco,
    precoMedio: precos.length ? Math.round(precos.reduce((s,v)=>s+v,0)/precos.length*100)/100 : preco,
    ehCatalogo: true, catalogProductId: mlbId, fonte: 'products', analisadoEm: new Date().toISOString(),
    pagina: 1, posicao: 1
  };
}

async function buscarViaScraping(url, mlbId, debug) {
  let targetUrlBase = url.startsWith('http') ? url.split('?')[0] : `https://www.mercadolivre.com.br/p/${mlbId}`;
  
  // Confirma se é Catálogo para forçar a Paginação
  const isCatalogo = targetUrlBase.endsWith('/s') || targetUrlBase.includes('/p/MLB');
  if (isCatalogo && !targetUrlBase.endsWith('/s')) targetUrlBase += '/s';

  debug.push(`🌐 Scraping Direto (Rota Protegida): ${targetUrlBase}`);
  
  let todosVendedoresScrap = [];
  let paginaScrap = 1;
  let continuarScrap = true;
  let offsetScrap = 0;
  
  let tituloBase = null;
  let precoBase = 0;
  let thumbnailBase = null;

  while(continuarScrap && paginaScrap <= 15) {
    const urlPage = isCatalogo ? `${targetUrlBase}?quantity=1&page=${paginaScrap}` : targetUrlBase;
    
    try {
      debug.push(`🌐 Extraindo HTML Pág ${paginaScrap}...`);
      const res  = await scraperAgent.get(urlPage);
      const html = res.data || '';
      
      // Pegamos o esqueleto do anúncio apenas na página 1
      if (paginaScrap === 1) {
        const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
        if (ldMatch) {
          try {
            const ld  = JSON.parse(ldMatch[1]);
            tituloBase    = ld.name || ld.title || null;
            precoBase     = ld.offers?.price ? parseFloat(ld.offers.price) : null;
            thumbnailBase = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
          } catch {}
        }
        if (!tituloBase) { const og = html.match(/<meta property="og:title" content="([^"]+)"/i); if (og) tituloBase = og[1]; }
        if (!thumbnailBase) { const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i); if (ogImg) thumbnailBase = ogImg[1]; }
        if (!precoBase) { const pm = html.match(/"price"\s*:\s*([\d.]+)/); if (pm) precoBase = parseFloat(pm[1]); }
        if (!tituloBase) throw new Error('Não foi possível extrair dados da página principal');
      }
      
      const vendedoresPagina = extrairVendedoresDoHTML(html, urlPage, debug);
      
      if (vendedoresPagina.length > 0) {
        const formatados = vendedoresPagina.map((v, i) => ({ ...v, posicao: offsetScrap + i + 1 }));
        todosVendedoresScrap.push(...formatados);
        offsetScrap += vendedoresPagina.length;
        paginaScrap++;
        
        if (!isCatalogo) continuarScrap = false; // Se não for catálogo, para na página 1
        else await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        continuarScrap = false; // Acabaram as páginas
      }
      
    } catch (e) {
       debug.push(`⚠️ Parando Scraping na pág ${paginaScrap}: HTTP Block ou Fim das Páginas`);
       continuarScrap = false;
    }
  }
  
  if (todosVendedoresScrap.length === 0) throw new Error('Falha completa ao tentar extrair dados por Scraping');

  const sellerPrincipal = todosVendedoresScrap[0];
  const concorrentesLista = todosVendedoresScrap.slice(1);
  const precoOficial = precoBase || sellerPrincipal?.preco || 0;

  return {
    mlbId, titulo: tituloBase, preco: precoOficial, precoOriginal: null,
    status: 'active', estoque: null, vendidos: null, condicao: 'Novo', tipoAnuncio: 'Catálogo',
    thumbnail: thumbnailBase, link: targetUrlBase,
    freteGratis: sellerPrincipal?.freteGratis || false, frete: sellerPrincipal?.frete || '—', envio: sellerPrincipal?.envio || '—',
    vendas: formatarVendas(null), avaliacoes: null, atributos: [],
    seller: sellerPrincipal ? { nome: sellerPrincipal.nome, reputacao: null, vendas: null } : null,
    concorrentes: concorrentesLista, totalVendedores: todosVendedoresScrap.length,
    precoMin: precoOficial, precoMax: precoOficial, precoMedio: precoOficial,
    ehCatalogo: isCatalogo, fonte: 'scraping_paginado', analisadoEm: new Date().toISOString(),
    pagina: 1, posicao: 1
  };
}

// ============================================================================
// ROTAS REST API
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
      orderBy: { createdAt: 'desc' },
      take: 50,
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

router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  const { userId, urlOriginal } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  const debug = [`🚀 Iniciando análise profunda (Multi-páginas) de ${mlbId}`];
  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message, debug }); }
  const todosIds = [mlbId];
  if (urlOriginal) {
    for (const id of extrairTodosMLBs(decodeURIComponent(urlOriginal))) {
      if (!todosIds.includes(id)) todosIds.push(id);
    }
    if (todosIds.length > 1) debug.push(`🔗 IDs extraídos da URL: ${todosIds.join(', ')}`);
  }
  for (const id of todosIds) {
    try {
      const dados = await buscarItem(id, urlOriginal, api, debug);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json({ ...dados, debug });
    } catch (eA) { debug.push(`⚠️  /items/${id}: ${eA.response?.status || eA.message?.substring(0,60)}`); }
    try {
      const dados = await buscarViaProducts(id, api, debug);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json({ ...dados, debug });
    } catch (eB) { debug.push(`⚠️  /products/${id}: ${eB.response?.status || eB.message?.substring(0,60)}`); }
  }
  if (urlOriginal) {
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId, debug);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json({ ...dados, debug });
    } catch (eC) { debug.push(`❌ Scraping Final: ${eC.message?.substring(0,60)}`); }
  }
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