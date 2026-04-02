// backend/src/routes/mlResearchRoutes.js — v5
// Adicionado: GET /market-analyses, DELETE /market-analyses/:id
// Agente de pesquisa com logs SSE no terminal
// Atualizado: Extração de Página, Posição, Formatação de Vendas e Envio Full/Envios

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * Cria uma instância do Axios autenticada para a API oficial do Mercado Livre.
 * Verifica no banco de dados se o usuário possui um token válido e não expirado.
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
 * Agente de scraping para realizar chamadas em páginas HTML públicas do ML.
 * Utiliza headers que simulam um navegador real para evitar bloqueios (Cloudflare/Captchas).
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
// FUNÇÕES UTILITÁRIAS E DE TRANSFORMAÇÃO DE DADOS
// ============================================================================

// Converte os níveis de reputação da API do ML para labels mais legíveis
function mapRep(level) {
  const m = { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' };
  return m[level] || 'novo';
}

// Converte os IDs de tipo de anúncio para os nomes comerciais exibidos no site
function mapTipo(id) {
  const m = { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' };
  return m[id] || id || 'Clássico';
}

// Identifica se o envio é Full, Mercado Envios Grátis ou apenas Mercado Envios
function formatarEnvio(shippingInfo, hasFulfillment) {
  if (hasFulfillment || (shippingInfo?.tags && shippingInfo.tags.includes('fulfillment'))) return 'Full';
  if (shippingInfo?.free_shipping) return 'Mercado Envios (Grátis)';
  return 'Mercado Envios';
}

// Transforma o número absoluto de vendas em faixas de texto iguais às do front-end do ML
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

// Limpa e extrai apenas os atributos essenciais para a Ficha Técnica
function extrairAtributos(attrs = []) {
  return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 14).map(a => ({ nome: a.name, valor: a.value_name }));
}

// Reconstrói o link oficial do produto com base no MLB
function buildItemLink(id, permalink) {
  if (permalink) return permalink;
  if (!id) return null;
  const num = String(id).replace(/^MLB/i, '');
  return `https://produto.mercadolivre.com.br/MLB${num}-_JM`;
}

// Usa Regex para varrer URLs coladas pelo usuário e extrair todos os códigos MLB válidos
function extrairTodosMLBs(url) {
  const ids = new Set();
  for (const m of url.matchAll(/\/p\/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  const limpa = url.split('?')[0].split('#')[0];
  for (const m of limpa.matchAll(/\/[^/]+-MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  for (const m of url.matchAll(/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  return [...ids];
}

// ============================================================================
// BUSCADORES DE VENDEDORES (APIs)
// ============================================================================

const sellerCache = new Map(); // Cache em memória para evitar chamadas redundantes ao mesmo vendedor

// Busca apenas o nome (nickname) do vendedor
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

// Busca perfil completo do vendedor (Reputação e Vendas Globais)
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

/**
 * Função Core de Extração via Scraping
 * Varre o HTML bruto e captura os JSONs hidratados pelo React do Mercado Livre.
 * É essencial para pegar dados da "Buy Box" que não estão disponíveis nas rotas públicas da API.
 */
function extrairVendedoresDoHTML(html, targetUrl, debug) {
  const vendedores = [];
  
  // Extrai a página diretamente da query string da URL (se existir)
  const pageMatch = (targetUrl||'').match(/page=(\d+)/i);
  const paginaAtual = pageMatch ? parseInt(pageMatch[1]) : 1;

  // Padrões de onde o ML guarda os estados iniciais das páginas
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
      // Busca em múltiplos caminhos onde a lista de vendedores (opções de compra) pode estar no JSON
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
          const link  = o.permalink || o.item?.permalink || o.url || targetUrl || '';
          
          const descPct = o.discount?.rate ? `${Math.round(o.discount.rate * 100)}% OFF` : (o.discountLabel || '0% OFF');
          const isFull = o.shipping?.fulfillment || o.has_full_filment || false;
          const parcelamento = o.installment_info || (o.installments ? `${o.installments.quantity}x` : '—');
          
          // Formata as vendas usando a nova lógica solicitada
          let vendasStr = o.seller?.sales_text || o.sellerInfo?.sales_text || null;
          if (!vendasStr && o.seller?.transactions?.completed) vendasStr = formatarVendas(o.seller.transactions.completed);
          if (!vendasStr) vendasStr = '+100 vendas'; // Fallback padrão da UI do ML

          if (parseFloat(preco) > 0 || nome !== '—') {
            vendedores.push({ 
              nome, 
              preco: parseFloat(preco) || 0, 
              precoOriginal: precoOriginal ? parseFloat(precoOriginal) : '—',
              link, 
              desconto: descPct,
              thumbnail: o.thumbnail || o.item?.thumbnail || null, 
              titulo: o.title || o.item?.title || 'Anúncio de Catálogo', 
              freteGratis: o.shipping?.free_shipping === true || o.freeShipping === true || o.shipping_conditions === 'free_gap',
              envio: formatarEnvio(o.shipping || { free_shipping: o.shipping_conditions === 'free_gap' }, isFull),
              tipoAnuncio: mapTipo(o.listing_type_id || (o.item_condition === 'new' ? 'gold_special' : 'free')),
              vendas: vendasStr,
              parcelamento: parcelamento,
              pagina: paginaAtual,
              posicao: index + 1 // Grava a posição do elemento na tela
            });
          }
        });
        if (vendedores.length) return vendedores;
      }
    } catch {}
  }

  // Fallback 1: Buscar pelos metadados de SEO (Linked Data JSON)
  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    try {
      const ld = JSON.parse(m[1]);
      const offers = ld.offers?.offers || (Array.isArray(ld.offers) ? ld.offers : (ld.offers ? [ld.offers] : []));
      for (const o of offers) {
        const nome  = o.seller?.name || o.seller?.nickname || '—';
        const preco = parseFloat(o.price || 0);
        if (preco > 0 || nome !== '—') {
          vendedores.push({ nome, preco, link: o.url || '', desconto: null, thumbnail: null, titulo: ld.name || null, freteGratis: false, frete: '—', pagina: paginaAtual, posicao: '-' });
        }
      }
      if (vendedores.length) return vendedores;
    } catch {}
  }

  // Fallback 2: Regex bruto direto no HTML
  const sellerRegex = /"nickname"\s*:\s*"([^"]{2,50})"/g;
  const priceRegex  = /"amount"\s*:\s*([\d.]+)/g;
  const names  = [...new Set([...html.matchAll(sellerRegex)].map(m => m[1]))].slice(0, 15);
  const prices = [...html.matchAll(priceRegex)].map(m => parseFloat(m[1])).filter(v => v > 0).slice(0, 15);
  if (names.length) {
    names.forEach((nome, i) => vendedores.push({ nome, preco: prices[i] || 0, link: '', desconto: null, thumbnail: null, titulo: null, freteGratis: false, frete: '—', pagina: paginaAtual, posicao: i + 1 }));
    return vendedores;
  }
  return [];
}

/**
 * Busca a lista de vendedores concorrentes dentro de uma página de "Catálogo" (Buy Box) do ML.
 * Tenta usar a API oficial primeiro, e faz fallback para scraping se necessário.
 */
async function buscarVendedoresCatalogo(catalogId, api, debug) {
  debug.push(`🏷️  Catálogo ID: ${catalogId}`);
  
  // Tentativa 1: Rota de itens de produto (API Oficial)
  try {
    debug.push(`📡 API: GET /products/${catalogId}/items?limit=50`);
    const res = await api.get(`/products/${catalogId}/items`, {
      params: { limit: 50, fields: 'id,title,price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,original_price,catalog_product_id' },
      timeout: 12000,
    });
    const results = res.data?.results || [];
    debug.push(`   → ${results.length} item(s) retornado(s) pelo /products/items`);
    if (results.length > 0) {
      const vendedores = [];
      const lote = results.slice(0, 20); // Limita aos top 20 para evitar excesso de requisições de sellers
      for (let i = 0; i < lote.length; i++) {
        const r = lote[i];
        const id   = r.item_id || r.id;
        const nome = await getSellerName(r.seller_id, api);
        const descPct = r.original_price && r.price < r.original_price
          ? Math.round((1 - r.price / r.original_price) * 100) : null;
        vendedores.push({
          mlbId: id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
          desconto: descPct ? `${descPct}% OFF` : null, link: buildItemLink(id, r.permalink),
          thumbnail: r.thumbnail, titulo: r.title, 
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
          envio: formatarEnvio(r.shipping, false), // Implementação do Envio Solicitado
          freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
          vendidos: r.sold_quantity, vendas: formatarVendas(r.sold_quantity),
          tipoAnuncio: mapTipo(r.listing_type_id),
          pagina: 1, posicao: i + 1
        });
      }
      vendedores.sort((a, b) => a.preco - b.preco);
      debug.push(`✅ ${vendedores.length} vendedor(es) encontrado(s) via /products/items`);
      return vendedores;
    }
  } catch (e) {
    debug.push(`❌ /products/items falhou: ${e.response?.status || e.message?.substring(0,60)}`);
  }

  // Tentativa 2: Busca genérica pela categoria atrelada ao produto
  try {
    debug.push(`📡 API: GET /sites/MLB/search?catalog_product_id=${catalogId}&limit=50`);
    const searchRes = await api.get('/sites/MLB/search', {
      params: { catalog_product_id: catalogId, limit: 50, sort: 'price_asc' },
      timeout: 12000,
    });
    const results = searchRes.data?.results || [];
    debug.push(`   → ${results.length} resultado(s) na busca por catálogo`);
    if (results.length > 0) {
      const vendedores = [];
      const lote = results.slice(0, 20);
      for (let i = 0; i < lote.length; i++) {
        const r = lote[i];
        const nome = await getSellerName(r.seller?.id || r.seller_id, api);
        const descPct = r.original_price && r.price < r.original_price
          ? Math.round((1 - r.price / r.original_price) * 100) : null;
        vendedores.push({
          mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
          desconto: descPct ? `${descPct}% OFF` : null, link: buildItemLink(r.id, r.permalink),
          thumbnail: r.thumbnail, titulo: r.title, 
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago',
          envio: formatarEnvio(r.shipping, false),
          freteGratis: r.shipping?.free_shipping === true, estoque: r.available_quantity,
          vendidos: r.sold_quantity, vendas: formatarVendas(r.sold_quantity),
          tipoAnuncio: mapTipo(r.listing_type_id),
          pagina: 1, posicao: i + 1
        });
      }
      vendedores.sort((a, b) => a.preco - b.preco);
      debug.push(`✅ ${vendedores.length} vendedor(es) via search por catalog_product_id`);
      return vendedores;
    }
  } catch (e) {
    debug.push(`❌ search catalog_product_id falhou: ${e.response?.status || e.message?.substring(0,60)}`);
  }

  // Tentativa 3 (Final): Scraping agressivo das rotas Web do ML
  const cleanId = catalogId.replace(/^MLB/i, '');
  const urls = [
    `https://www.mercadolivre.com.br/noindex/catalog/buybox/MLB${cleanId}`,
    `https://www.mercadolivre.com.br/p/MLB${cleanId}`,
  ];
  for (const url of urls) {
    try {
      debug.push(`🌐 Scraping: ${url}`);
      const res  = await scraperAgent.get(url);
      const html = res.data || '';
      debug.push(`   → HTML recebido: ${(html.length/1024).toFixed(0)}KB`);
      const vendedores = extrairVendedoresDoHTML(html, url, debug);
      if (vendedores.length) {
        debug.push(`✅ ${vendedores.length} vendedor(es) extraído(s) via scraping`);
        return vendedores;
      }
    } catch (e) {
      debug.push(`❌ Scraping ${url}: ${e.message?.substring(0,60)}`);
    }
  }
  debug.push(`⚠️  Nenhuma opção de compra encontrada para ${catalogId}`);
  return [];
}

/**
 * Rota principal de processamento de um Anúncio Simples.
 * Orquestra as buscas e acopla a inteligência de concorrência.
 */
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
  debug.push(`👤 Buscando dados do vendedor ${it.seller_id}...`);
  const seller = await getSellerFull(it.seller_id, api);
  debug.push(`   → Vendedor: ${seller?.nome || '—'}`);
  
  let concorrentes = [];
  
  if (ehCatalogo) {
    // É Catálogo: Procura as outras lojas ofertando o mesmo produto
    const catalogId = it.catalog_product_id || mlbId;
    debug.push(`📦 Produto de CATÁLOGO detectado. Buscando todas as opções de compra...`);
    concorrentes = await buscarVendedoresCatalogo(catalogId, api, debug);
    
    // Fallback: se catálogo falhar, procura anúncios soltos na mesma categoria com mesmo nome
    if (concorrentes.length === 0) {
      debug.push(`🔄 Fallback: busca por título na categoria ${it.category_id}...`);
      try {
        const titulo = (it.title || '').split(' ').slice(0, 5).join(' ');
        const searchRes = await api.get('/sites/MLB/search', {
          params: { category: it.category_id, q: titulo, limit: 20, sort: 'price_asc' },
          timeout: 10000,
        });
        const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 10);
        debug.push(`   → ${results.length} resultado(s) na busca por título`);
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const nome = await getSellerName(r.seller?.id || r.seller_id, api);
          concorrentes.push({
            mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
            desconto: null, link: buildItemLink(r.id, r.permalink), thumbnail: r.thumbnail, titulo: r.title,
            frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago', 
            envio: formatarEnvio(r.shipping, false),
            freteGratis: r.shipping?.free_shipping === true,
            estoque: r.available_quantity, vendidos: r.sold_quantity, 
            vendas: formatarVendas(r.sold_quantity),
            tipoAnuncio: mapTipo(r.listing_type_id),
            pagina: 1, posicao: i + 1
          });
        }
        concorrentes.sort((a, b) => a.preco - b.preco);
      } catch (e) { debug.push(`❌ Busca por título falhou: ${e.message?.substring(0,50)}`); }
    }
  } else {
    // Não é catálogo: busca produtos semelhantes por título
    debug.push(`🏪 Anúncio normal. Buscando concorrentes...`);
    try {
      const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
      const searchRes = await api.get('/sites/MLB/search', {
        params: { category: it.category_id, q: titulo, limit: 15, sort: 'price_asc' },
        timeout: 10000,
      });
      const results = (searchRes.data?.results || []).filter(r => r.id !== mlbId).slice(0, 10);
      debug.push(`   → ${results.length} concorrente(s) encontrado(s)`);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const nome = await getSellerName(r.seller?.id || r.seller_id, api);
        concorrentes.push({
          mlbId: r.id, nome, preco: r.price || 0, precoOriginal: r.original_price || null,
          desconto: null, link: buildItemLink(r.id, r.permalink), thumbnail: r.thumbnail, titulo: r.title,
          frete: r.shipping?.free_shipping ? 'Grátis' : 'Pago', 
          envio: formatarEnvio(r.shipping, false),
          freteGratis: r.shipping?.free_shipping === true,
          estoque: r.available_quantity, vendidos: r.sold_quantity, 
          vendas: formatarVendas(r.sold_quantity),
          tipoAnuncio: mapTipo(r.listing_type_id),
          pagina: 1, posicao: i + 1
        });
      }
      concorrentes.sort((a, b) => a.preco - b.preco);
    } catch (e) { debug.push(`❌ Busca concorrentes falhou: ${e.message?.substring(0,50)}`); }
  }
  
  debug.push(`📊 Total de opções/concorrentes: ${concorrentes.length}`);
  
  // Extrai métricas gerais de preço
  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a,b)=>a-b);
  const precoMin  = allPrecos[0] ?? it.price;
  const precoMax  = allPrecos[allPrecos.length-1] ?? it.price;
  const precoMed  = allPrecos.length ? Math.round(allPrecos.reduce((s,v)=>s+v,0)/allPrecos.length*100)/100 : it.price;
  
  const pageMatch = (url||'').match(/page=(\d+)/i);
  const paginaAtual = pageMatch ? parseInt(pageMatch[1]) : 1;

  // Monta e devolve a resposta tratada
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

/**
 * Estratégia Alternativa: Buscar via /products se o ID inicial for um P-MLB (produto, e não anúncio solto)
 */
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
    debug.push(`   → Buy-box seller: ${seller?.nome}`);
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

/**
 * Estratégia de Defesa (Último Caso): Mapear HTML público quando todas as APIs bloqueiam o acesso.
 */
async function buscarViaScraping(url, mlbId, debug) {
  const targetUrl = url.startsWith('http') ? url : `https://www.mercadolivre.com.br/p/${mlbId}`;
  debug.push(`🌐 Scraping direto: ${targetUrl}`);
  const res  = await scraperAgent.get(targetUrl);
  const html = res.data || '';
  debug.push(`   → HTML: ${(html.length/1024).toFixed(0)}KB`);
  
  let titulo = null, preco = null, thumbnail = null;
  // Extrai informações base do JSON Linked Data de SEO injetado no DOM
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
  
  if (!titulo) throw new Error('Não foi possível extrair dados da página');
  debug.push(`   → Título: ${titulo?.substring(0,50)}`);
  debug.push(`   → Preço extraído: R$ ${preco || 0}`);
  
  const pageMatch = targetUrl.match(/page=(\d+)/i);
  const paginaAtual = pageMatch ? parseInt(pageMatch[1]) : 1;
  
  const vendedores = extrairVendedoresDoHTML(html, targetUrl, debug);
  debug.push(`   → Vendedores no scraping: ${vendedores.length}`);
  
  return {
    mlbId, titulo, preco: preco || 0, status: 'active', estoque: null, vendidos: null,
    condicao: 'Novo', tipoAnuncio: 'Catálogo', thumbnail, link: targetUrl,
    freteGratis: false, frete: '—', avaliacoes: null, atributos: [],
    seller: vendedores.length ? { nome: vendedores[0].nome, reputacao: null, vendas: null } : null,
    concorrentes: vendedores.slice(1), totalVendedores: vendedores.length || 1,
    precoMin: preco || 0, precoMax: preco || 0, precoMedio: preco || 0,
    envio: vendedores[0]?.envio || '—', vendas: formatarVendas(null),
    ehCatalogo: true, fonte: 'scraping', analisadoEm: new Date().toISOString(),
    pagina: paginaAtual, posicao: 1
  };
}

// ============================================================================
// ROTAS E ENDPOINTS (API REST)
// ============================================================================

// ── Histórico de pesquisas da Engine
router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const itens = await prisma.pesquisaHistorico.findMany({
      where: { usuarioId: parseInt(userId), excluido: false, arquivado: arquivado === 'true' },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
    // Hidrata o json do BD para uso no React
    res.json(itens.map(i => ({ ...i, dadosJson: i.dadosJson ? JSON.parse(i.dadosJson) : null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Análises de Mercado IA Salvas
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

// Deletar um relatório de IA
router.delete('/api/ml/research/market-analyses/:id', async (req, res) => {
  try {
    await prisma.pesquisaMercadoIA.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * ── Rota principal de processamento de um Anúncio
 * Injeta inteligência para descobrir qual tipo de item o usuário forneceu,
 * executando o método apropriado (Itens Normais x Catálogos x Scrapers)
 */
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  const { userId, urlOriginal } = req.query;
  
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  const debug = [`🚀 Iniciando análise de ${mlbId}`];
  
  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message, debug }); }
  
  // Limpeza de IDs injetados na URL
  const todosIds = [mlbId];
  if (urlOriginal) {
    for (const id of extrairTodosMLBs(decodeURIComponent(urlOriginal))) {
      if (!todosIds.includes(id)) todosIds.push(id);
    }
    if (todosIds.length > 1) debug.push(`🔗 IDs extraídos da URL: ${todosIds.join(', ')}`);
  }
  
  // Tenta Processar em Cadeia: Falhou na rota A, tenta rota B
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
    } catch (eC) { debug.push(`❌ Scraping: ${eC.message?.substring(0,60)}`); }
  }
  
  debug.push(`❌ Todas as estratégias falharam para ${mlbId}`);
  const msg = debug.filter(l => l.startsWith('❌') || l.startsWith('⚠️')).join(' | ');
  await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
  res.status(404).json({ error: `Anúncio não encontrado`, debug });
});

/**
 * ── Rota de Comunicação SSE (Server-Sent Events) para a IA Analyiz.
 * Permite que o servidor faça stream contínuo de logs para o front-end enquanto 
 * a Inteligência Artificial navega, compara atributos e gera tabelas Markdown de relatório.
 */
router.post('/api/ml/research/deep-market', async (req, res) => {
  const { userId, itens, perguntaFollowUp, contextoAnterior } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ error: 'itens obrigatório' });

  // Configurar Cabeçalhos SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Helper para disparar mensagens no formato Server Sent Event
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('log', { msg: '🚀 Iniciando Pesquisa de Inteligência de Mercado...', tipo: 'info' });
    send('log', { msg: `📦 Analisando ${itens.length} produto(s)`, tipo: 'info' });

    if (perguntaFollowUp && contextoAnterior) {
      send('log', { msg: `❓ Processando pergunta de follow-up: "${perguntaFollowUp.substring(0,60)}..."`, tipo: 'info' });
    }

    send('log', { msg: '🌐 Iniciando pesquisa web em tempo real...', tipo: 'info' });
    
    // Dispara o cérebro principal da IA assíncrona, repassando o callback onLog 
    // que empurrará os eventos via rede (send('log',...)) para o componente no Frontend ver o progresso
    const analise = await realizarPesquisaMercadoProfunda(userId, itens, {
      onLog: (msg, tipo) => send('log', { msg, tipo }),
      perguntaFollowUp,
      contextoAnterior,
    });

    send('log', { msg: '✅ Análise concluída com sucesso!', tipo: 'success' });
    send('done', analise); // Finaliza o buffer e envia o Objeto da Análise formatado
  } catch (e) {
    send('log', { msg: `❌ Erro: ${e.message}`, tipo: 'error' });
    send('error', { error: e.message });
  } finally {
    res.end(); // Fecha a conexão
  }
});

// ── Salvar análise de mercado
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

// ============================================================================
// CRUD BÁSICO DE HISTÓRICO (ARQUIVAMENTO E LIMPEZA DO BD)
// ============================================================================

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