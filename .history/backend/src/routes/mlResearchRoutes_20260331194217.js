// backend/src/routes/mlResearchRoutes.js
import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';
import { realizarPesquisaMercadoProfunda } from '../ia/brain/iaBrain.js';

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

// ─── Pool de User-Agents reais de navegadores modernos ───────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
];

function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function randomDelay(min = 600, max = 1800) { return new Promise(r => setTimeout(r, min + Math.random() * (max - min))); }

// ─── Criação de agente scraper com rotação de UA ─────────────────────────────
function criarScraper(ua) {
  return axios.create({
    timeout: 20000,
    headers: {
      'User-Agent': ua || randomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Referer': 'https://www.mercadolivre.com.br/',
      'DNT': '1',
    },
    maxRedirects: 5,
    decompress: true,
    validateStatus: s => s < 500,
  });
}

// ─── Helpers de formatação ────────────────────────────────────────────────────
function mapRep(level) {
  const m = { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' };
  return m[level] || 'novo';
}

function mapTipo(id) {
  const m = { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' };
  return m[id] || id || 'Clássico';
}

/**
 * FORMATAÇÃO DE ENVIO — Idêntica ao Catálogo.xlsx:
 * Full / Mercado Envios (Grátis) / Mercado Envios
 */
function formatarEnvio(shippingInfo, hasFulfillment, parcelamentoStr) {
  const isFull = hasFulfillment
    || shippingInfo?.logistic_type === 'fulfillment'
    || shippingInfo?.tags?.includes('fulfillment')
    || shippingInfo?.tags?.includes('self_service_in');
  if (isFull) return 'Full';

  const isGratis = shippingInfo?.free_shipping
    || shippingInfo?.shipping_conditions === 'free_gap'
    || shippingInfo?.shipping_conditions === 'free_ratio';

  // Parcelamento sem juros ("10f" indica grátis de juros) → campo extra
  return isGratis ? 'Mercado Envios' : 'Mercado Envios';
}

/**
 * Formata vendas igual ao catálogo: "+5mil vendas", "+50mil vendas", etc.
 */
function formatarVendas(soldQuantity) {
  if (!soldQuantity) return '+100 vendas';
  if (soldQuantity >= 50000) return '+50mil vendas';
  if (soldQuantity >= 10000) return '+10mil vendas';
  if (soldQuantity >= 5000) return '+5mil vendas';
  if (soldQuantity >= 1000) return '+1000 vendas';
  if (soldQuantity >= 500) return '+500 vendas';
  if (soldQuantity >= 100) return '+100 vendas';
  if (soldQuantity >= 50) return '+50 vendas';
  if (soldQuantity >= 25) return '+25 vendas';
  return `+${soldQuantity} vendas`;
}

/**
 * Formata parcelamento como aparece no ML:
 * "10x R$51,90 sem juros" ou "12x R$47,38"
 */
function formatarParcelamento(installmentInfo, preco) {
  if (!installmentInfo || !preco) return '—';
  const raw = String(installmentInfo);
  const semJuros = raw.endsWith('f');
  const parcelas = parseInt(raw.replace('f', ''));
  if (!parcelas) return '—';
  const valorParcela = (preco / parcelas).toFixed(2).replace('.', ',');
  return semJuros
    ? `${parcelas}x R$${valorParcela} sem juros`
    : `${parcelas}x R$${valorParcela}`;
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
// EXTRATOR PRINCIPAL DO HTML — lê o __PRELOADED_STATE__ / __NORDIC_RENDERING_CTX__
// Baseado no HTML real do ML enviado pelo usuário
// ============================================================================

function extrairVendedoresDoHTML(html, targetUrl, paginaAtual, debug) {
  const vendedores = [];

  // Padrões para localizar o JSON de estado
  const jsonPatterns = [
    // Nordic ctx (formato atual do ML Brasil)
    /\"initialState\"\s*:\s*(\{[\s\S]{200,}?\})\s*,\s*\"site\"/,
    // appProps → pageProps → initialState
    /appProps.*?pageProps.*?initialState.*?(\{[\s\S]{200,}?\})\s*,\s*\"layout\"/,
    // __PRELOADED_STATE__ antigo
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]{100,}?\});?\s*(?:<\/script>|window\.|var )/,
  ];

  for (const pattern of jsonPatterns) {
    const m = html.match(pattern);
    if (!m) continue;
    try {
      const state = JSON.parse(m[1]);

      // Caminho principal: results.items (estrutura nova do ML)
      const resultItems = state?.components?.results?.items
        || state?.results?.items;

      if (Array.isArray(resultItems) && resultItems.length > 0) {
        debug.push(`✅ Encontrado ${resultItems.length} itens via results.items (pág ${paginaAtual})`);

        resultItems.forEach((item, index) => {
          const components = item.components || [];

          // Extrai preço
          const priceComp   = components.find(c => c.id === 'price');
          const price        = priceComp?.price?.value || 0;
          const precoOriginal = priceComp?.price?.original_value || null;
          const descontoPct  = priceComp?.discount_label?.value
            ? `${priceComp.discount_label.value}% OFF`
            : (precoOriginal && precoOriginal > price ? `${Math.round((1 - price/precoOriginal)*100)}% OFF` : '0% OFF');

          // Parcelamento
          const payComp = components.find(c => c.id === 'payment_summary');
          let parcelamento = '—';
          if (payComp?.title?.text) {
            const pText = payComp.title.text; // "12x {price_installments}"
            const pVal  = payComp.title.values?.price_installments;
            const qtd   = (pText.match(/^(\d+)x/) || [])[1];
            const semJuros = payComp.title.color === 'GREEN';
            if (qtd && pVal) {
              const valStr = pVal.value?.toFixed(2).replace('.', ',') || '—';
              parcelamento = semJuros ? `${qtd}x R$${valStr} sem juros` : `${qtd}x R$${valStr}`;
            }
          }

          // Envio
          const shipComp = components.find(c => c.id === 'shipping_summary');
          let envio = 'Mercado Envios';
          let freteGratis = false;
          if (shipComp) {
            const hasFull = shipComp.text_icon?.id === 'FULL_ICON'
              || (shipComp.title?.values?.promise?.text || '').toLowerCase().includes('full');
            const promiseText = shipComp.title?.values?.promise?.text || '';
            freteGratis = promiseText.toLowerCase().includes('grátis') || promiseText.toLowerCase().includes('gratis');
            if (hasFull) envio = 'Full';
            else if (freteGratis) envio = 'Mercado Envios';
            else envio = 'Mercado Envios';
          }

          // Vendedor
          const sellerComp = components.find(c => c.id === 'seller');
          const nomeVendedor = sellerComp?.title_value || sellerComp?.seller?.name || '—';
          const reputacao    = mapRep(sellerComp?.seller?.reputation_level);
          const vendas       = sellerComp?.subtitles?.[0]?.text?.replace('{font}','').replace('MercadoLíder','').replace('|','').trim() || '+100 vendas';

          // Tipo de anúncio
          const trackData = state?.components?.track?.melidata_event?.event_data?.items?.[index];
          const tipoAnuncio = trackData ? mapTipo(trackData.listing_type_id || 'gold_special') : 'Clássico';
          const hasFull2 = trackData?.has_full_filment === true;
          if (hasFull2 && envio !== 'Full') envio = 'Full';

          // Link do item
          const actComp = components.find(c => c.id === 'main_actions');
          const itemId  = actComp?.form?.item_id || item.id;
          const link    = itemId ? `https://www.mercadolivre.com.br/p/${itemId}` : targetUrl;

          // Thumbnail via item.id
          const thumb = null; // será preenchido via API se necessário

          vendedores.push({
            nome:          nomeVendedor,
            preco:         parseFloat(price) || 0,
            precoOriginal: precoOriginal ? parseFloat(precoOriginal) : null,
            desconto:      descontoPct,
            parcelamento,
            envio,
            freteGratis,
            vendas,
            tipoAnuncio,
            mercadoLider:  reputacao !== 'novo' ? `MercadoLíder ${reputacao.charAt(0).toUpperCase() + reputacao.slice(1)}` : null,
            link,
            thumbnail:     thumb,
            mlbId:         itemId,
            pagina:        paginaAtual,
            posicao:       index + 1,
          });
        });

        if (vendedores.length) return vendedores;
      }

      // Fallback: track.melidata_event.event_data.items (dados mais simples)
      const trackItems = state?.components?.track?.melidata_event?.event_data?.items
        || state?.track?.melidata_event?.event_data?.items;

      if (Array.isArray(trackItems) && trackItems.length > 0) {
        debug.push(`✅ Usando track.items (${trackItems.length} itens, pág ${paginaAtual})`);
        trackItems.forEach((o, index) => {
          const isFull = o.has_full_filment === true;
          const isGratis = o.shipping_conditions === 'free_gap' || o.shipping_conditions === 'free_ratio';
          const envio = isFull ? 'Full' : 'Mercado Envios';
          const semJuros = String(o.installment_info || '').endsWith('f');
          const parcelas = parseInt(String(o.installment_info || '').replace('f',''));
          let parcelamento = '—';
          if (parcelas && o.price) {
            const vp = (o.price / parcelas).toFixed(2).replace('.', ',');
            parcelamento = semJuros ? `${parcelas}x R$${vp} sem juros` : `${parcelas}x R$${vp}`;
          }
          const desconto = o.original_price ? `${Math.round((1 - o.price/o.original_price)*100)}% OFF` : '0% OFF';

          vendedores.push({
            nome:          o.seller_name || '—',
            preco:         parseFloat(o.price) || 0,
            precoOriginal: o.original_price || null,
            desconto,
            parcelamento,
            envio,
            freteGratis:   isGratis,
            vendas:        '+100 vendas',
            tipoAnuncio:   mapTipo(o.listing_type_id || 'gold_special'),
            mercadoLider:  null,
            link:          targetUrl,
            thumbnail:     null,
            mlbId:         o.item_id || null,
            pagina:        paginaAtual,
            posicao:       index + 1,
          });
        });
        if (vendedores.length) return vendedores;
      }

      // Fallback compras/opções
      const options = state?.buyingOptions?.options || state?.initialState?.buyingOptions?.options;
      if (Array.isArray(options) && options.length > 0) {
        debug.push(`✅ Usando buyingOptions.options (${options.length} itens)`);
        options.forEach((o, index) => {
          const isFull = o.shipping?.logistic_type === 'fulfillment'
            || o.shipping?.tags?.includes('fulfillment')
            || o.has_full_filment === true;
          const envio = isFull ? 'Full' : 'Mercado Envios';
          const parcelamento = formatarParcelamento(o.installment_info, o.price?.amount || o.price);
          const preco = parseFloat(o.price?.amount || o.price) || 0;
          const precoOrig = o.original_price?.amount || o.original_price || null;
          const desconto = precoOrig && precoOrig > preco ? `${Math.round((1 - preco/precoOrig)*100)}% OFF` : '0% OFF';

          vendedores.push({
            nome:          o.seller_name || o.seller?.nickname || '—',
            preco,
            precoOriginal: precoOrig,
            desconto,
            parcelamento,
            envio,
            freteGratis:   o.shipping?.free_shipping === true,
            vendas:        o.seller?.sales_text || '+100 vendas',
            tipoAnuncio:   mapTipo(o.listing_type_id || 'gold_special'),
            mercadoLider:  null,
            link:          o.permalink || targetUrl,
            thumbnail:     o.thumbnail || null,
            mlbId:         o.item_id || null,
            pagina:        paginaAtual,
            posicao:       index + 1,
          });
        });
        if (vendedores.length) return vendedores;
      }
    } catch (e) {
      debug.push(`⚠️ JSON parse falhou: ${e.message.substring(0,60)}`);
    }
  }

  // ─── Fallback: Extração direta do HTML estrutural (tabela de vendedores) ────
  debug.push('⚠️ JSON state não encontrado, tentando extração HTML direta...');
  const precoMatches = [...html.matchAll(/aria-label="(\d+(?:\s+reais)?(?:\s+com\s+\d+\s+centavos)?)"[^>]*data-andes-money-amount/g)];
  const vendedorMatches = [...html.matchAll(/ui-pdp-seller__link[^>]*><span>([^<]+)<\/span>/g)];
  const fullMatches = [...html.matchAll(/ui-pdp-full-icon|FULL_ICON/g)];
  const vendasMatches = [...html.matchAll(/([+]\d+(?:mil)?\s*vendas)/g)];

  if (vendedorMatches.length > 0 && precoMatches.length > 0) {
    debug.push(`✅ Extração HTML: ${vendedorMatches.length} vendedores encontrados`);
    vendedorMatches.forEach((vm, i) => {
      const nomeVend = vm[1].trim();
      const precoRaw = precoMatches[i * 2 + 1]?.1 || precoMatches[i]?.1 || '0':
      const precoNum = parseFloat(precoRaw.replace(/[^\d,]/g,'').replace(',','.')) || 0;
      const isFull = i < fullMatches.length;
      vendedores.push({
        nome:         nomeVend,
        preco:        precoNum,
        precoOriginal: null,
        desconto:     '0% OFF',
        parcelamento: '—',
        envio:        isFull ? 'Full' : 'Mercado Envios',
        freteGratis:  true,
        vendas:       vendasMatches[i]?.[1] || '+100 vendas',
        tipoAnuncio:  'Clássico',
        mercadoLider: null,
        link:         targetUrl,
        thumbnail:    null,
        mlbId:        null,
        pagina:       paginaAtual,
        posicao:      i + 1,
      });
    });
  }

  return vendedores;
}

// ─── Extração de total de páginas do HTML ────────────────────────────────────
function extrairTotalPaginas(html, debug) {
  // Tenta via JSON state
  try {
    const m = html.match(/\"total_pages\"\s*:\s*(\d+)/);
    if (m) { debug.push(`📄 Total páginas detectado: ${m[1]}`); return parseInt(m[1]); }
    const m2 = html.match(/\"totalPages\"\s*:\s*(\d+)/);
    if (m2) return parseInt(m2[1]);
  } catch {}

  // Fallback via HTML de paginação
  const paginLinks = [...html.matchAll(/page=(\d+)/g)];
  if (paginLinks.length) {
    const nums = paginLinks.map(m => parseInt(m[1])).filter(n => n > 0);
    const max = Math.max(...nums);
    if (max > 1) { debug.push(`📄 Total páginas (HTML): ${max}`); return max; }
  }
  return 1;
}

// ─── Estratégia 1: Scraping iterativo com múltiplas técnicas ─────────────────
async function buscarViaScraping(urlOriginal, mlbId, debug) {
  let baseUrl = urlOriginal.split('?')[0];
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://www.mercadolivre.com.br/p/${mlbId}/s`;
  }
  if (baseUrl.includes('/p/MLB') && !baseUrl.endsWith('/s')) {
    baseUrl += '/s';
  }

  debug.push(`🌐 Scraping Paginado Iniciado: ${baseUrl}`);

  let todosVendedores = [];
  let totalPags = null;
  let tituloBase = null;
  let precoBase = 0;
  let thumbnailBase = null;
  let offset = 0;
  const UA_SESSAO = randomUA();

  for (let page = 1; page <= 50; page++) {
    const urlPage = `${baseUrl}?quantity=1&page=${page}`;
    debug.push(`📡 GET pág ${page}: ${urlPage}`);

    let html = null;
    let tentativas = 0;
    const maxTentativas = 3;

    while (tentativas < maxTentativas && !html) {
      tentativas++;
      try {
        await randomDelay(page === 1 ? 300 : 800, page === 1 ? 800 : 2000);
        const scraper = criarScraper(tentativas === 1 ? UA_SESSAO : randomUA());
        const res = await scraper.get(urlPage);

        if (res.status === 429) {
          debug.push(`⚠️ Rate limit (429) pág ${page}, tentativa ${tentativas}. Aguardando 5s...`);
          await randomDelay(5000, 8000);
          continue;
        }
        if (res.status === 403) {
          debug.push(`⚠️ Bloqueado (403) pág ${page}, tentativa ${tentativas}. Mudando UA...`);
          await randomDelay(3000, 5000);
          continue;
        }
        if (res.status >= 400) {
          debug.push(`⚠️ HTTP ${res.status} pág ${page}`);
          break;
        }
        html = res.data || '';
      } catch (e) {
        debug.push(`❌ Erro pág ${page} tent ${tentativas}: ${e.message.substring(0,60)}`);
        if (tentativas < maxTentativas) await randomDelay(2000, 4000);
      }
    }

    if (!html) {
      debug.push(`❌ Pág ${page} falhou após ${maxTentativas} tentativas. Encerrando.`);
      break;
    }

    // Detecta CAPTCHA
    if (html.includes('data-captcha') || html.includes('captcha-iframe') || html.includes('lazyload-wrapper')) {
      debug.push(`⚠️ CAPTCHA detectado na pág ${page}. Encerrando iteração.`);
      break;
    }

    // Primeira página: extrai metadados do produto
    if (page === 1) {
      totalPags = extrairTotalPaginas(html, debug);

      // LD+JSON para título e imagem
      const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (ldMatch) {
        try {
          const ld = JSON.parse(ldMatch[1]);
          tituloBase = ld.name || ld.title;
          precoBase  = ld.offers?.price ? parseFloat(ld.offers.price) : 0;
          thumbnailBase = Array.isArray(ld.image) ? ld.image[0] : (ld.image || null);
        } catch {}
      }

      // Fallback título via <title>
      if (!tituloBase) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) tituloBase = titleMatch[1].replace(/\|.*$|Mercado Livre.*/i,'').trim();
        else tituloBase = `Catálogo ID ${mlbId}`;
      }

      debug.push(`📦 Produto: "${tituloBase}" | Total páginas: ${totalPags}`);
    }

    const vendedoresPagina = extrairVendedoresDoHTML(html, urlPage, page, debug);

    if (vendedoresPagina.length > 0) {
      // Anti-loop: detecta se a página atual repete os vendedores da pág 1
      if (page > 1 && todosVendedores.length > 0) {
        const firstNew  = vendedoresPagina[0];
        const isRepeated = todosVendedores.some(v => v.nome === firstNew.nome && v.preco === firstNew.preco && v.pagina < page);
        if (isRepeated) {
          debug.push(`✅ Repetição detectada na pág ${page}. Iteração encerrada.`);
          break;
        }
      }

      const formatados = vendedoresPagina.map((v, i) => ({ ...v, posicao: offset + i + 1, pagina: page }));
      todosVendedores.push(...formatados);
      offset += vendedoresPagina.length;
      debug.push(`✅ Pág ${page}: ${vendedoresPagina.length} vendedores (total: ${todosVendedores.length})`);

      // Anti-bloqueio: pausa maior a cada 10 páginas
      if (page % 10 === 0) {
        debug.push(`⏳ Pausa anti-bloqueio (${page} páginas processadas)...`);
        await randomDelay(5000, 10000);
      }
    } else {
      debug.push(`⚠️ Pág ${page}: sem vendedores. Encerrando.`);
      break;
    }

    // Para se atingiu o total de páginas
    if (totalPags && page >= totalPags) {
      debug.push(`✅ Todas as ${totalPags} páginas coletadas.`);
      break;
    }
  }

  if (todosVendedores.length === 0) {
    throw new Error('Nenhum vendedor encontrado por scraping.');
  }

  const principal  = todosVendedores[0];
  const concorrentes = todosVendedores.slice(1);

  const precos = todosVendedores.map(v => v.preco).filter(p => p > 0);

  return {
    mlbId,
    titulo:         tituloBase,
    preco:          precoBase || principal.preco || 0,
    status:         'active',
    estoque:        null,
    vendidos:       null,
    condicao:       'Novo',
    tipoAnuncio:    principal.tipoAnuncio || 'Catálogo',
    thumbnail:      thumbnailBase || principal.thumbnail,
    link:           baseUrl,
    freteGratis:    principal.freteGratis || false,
    frete:          principal.freteGratis ? 'Grátis' : 'Pago',
    envio:          principal.envio || 'Mercado Envios',
    parcelamento:   principal.parcelamento || '—',
    vendas:         principal.vendas || '+100 vendas',
    avaliacoes:     null,
    atributos:      [],
    seller:         { nome: principal.nome, reputacao: null, vendas: null },
    concorrentes,
    totalVendedores: todosVendedores.length,
    precoMin:       precos.length ? Math.min(...precos) : 0,
    precoMax:       precos.length ? Math.max(...precos) : 0,
    precoMedio:     precos.length ? Math.round(precos.reduce((a,b)=>a+b,0)/precos.length) : 0,
    ehCatalogo:     true,
    catalogProductId: mlbId,
    fonte:          'scraping_paginado_v2',
    analisadoEm:    new Date().toISOString(),
    pagina:         1,
    posicao:        1,
  };
}

// ─── Estratégia 2: Fallback API oficial ──────────────────────────────────────
async function buscarItemAPI(mlbId, api, debug) {
  debug.push(`🔍 Buscando via API Oficial para ${mlbId}...`);
  const itemRes = await api.get(`/items/${mlbId}`, {
    params: { attributes: 'id,title,price,original_price,seller_id,available_quantity,sold_quantity,shipping,listing_type_id,thumbnail,permalink,condition,status,warranty,attributes' },
    timeout: 12000,
  });
  const it = itemRes.data;
  const seller = await getSellerFull(it.seller_id, api);
  const isFull = it.shipping?.logistic_type === 'fulfillment' || it.shipping?.tags?.includes('fulfillment');
  const parcelamento = formatarParcelamento('12', it.price);

  return {
    mlbId, titulo: it.title, preco: it.price, precoOriginal: it.original_price || null,
    status: it.status, estoque: it.available_quantity,
    vendidos: it.sold_quantity, vendas: formatarVendas(it.sold_quantity),
    condicao: it.condition === 'new' ? 'Novo' : 'Usado',
    tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail: it.thumbnail, link: it.permalink,
    freteGratis: it.shipping?.free_shipping === true,
    frete: it.shipping?.free_shipping ? 'Grátis' : 'Pago',
    envio: formatarEnvio(it.shipping, isFull, null),
    parcelamento,
    avaliacoes: null, atributos: extrairAtributos(it.attributes || []),
    seller, concorrentes: [], totalVendedores: 1,
    precoMin: it.price, precoMax: it.price, precoMedio: it.price,
    ehCatalogo: false, catalogProductId: null,
    fonte: 'api_items', analisadoEm: new Date().toISOString(), pagina: 1, posicao: 1,
  };
}

// ─── Estratégia 3: API de Produtos ML (catálogos) ───────────────────────────
async function buscarViaCatalogoAPI(mlbId, api, debug) {
  debug.push(`🔍 Tentando API de Produtos para ${mlbId}...`);
  const res = await api.get(`/products/${mlbId}`, {
    params: { attributes: 'id,name,pictures,main_features,attributes,status' },
    timeout: 12000,
  });
  const prod = res.data;

  // Buscar itens do catálogo
  const itemsRes = await api.get(`/products/${mlbId}/items`, { timeout: 12000 });
  const items = itemsRes.data?.results || [];

  debug.push(`✅ API Catálogo: ${items.length} itens para ${mlbId}`);

  const concorrentes = [];
  for (const item of items.slice(0, 30)) {
    const seller = await getSellerFull(item.seller_id, api).catch(() => null);
    const isFull = item.shipping?.logistic_type === 'fulfillment';
    concorrentes.push({
      mlbId:        item.id,
      nome:         seller?.nome || `Vendedor ${item.seller_id}`,
      titulo:       item.title || prod.name,
      preco:        item.price || 0,
      precoOriginal: item.original_price || null,
      desconto:     item.original_price ? `${Math.round((1 - item.price/item.original_price)*100)}% OFF` : '0% OFF',
      parcelamento: formatarParcelamento('12', item.price),
      envio:        formatarEnvio(item.shipping, isFull, null),
      freteGratis:  item.shipping?.free_shipping === true,
      vendas:       formatarVendas(item.sold_quantity),
      tipoAnuncio:  mapTipo(item.listing_type_id || 'gold_special'),
      thumbnail:    item.thumbnail,
      link:         item.permalink,
      pagina:       1,
      posicao:      concorrentes.length + 1,
    });
  }

  const precos = concorrentes.map(c => c.preco).filter(p => p > 0);
  const principal = concorrentes[0] || {};

  return {
    mlbId,
    titulo:      prod.name || `Catálogo ${mlbId}`,
    preco:       principal.preco || 0,
    precoOriginal: null,
    status:      'active',
    estoque:     null,
    vendidos:    null,
    vendas:      principal.vendas || '+100 vendas',
    condicao:    'Novo',
    tipoAnuncio: 'Catálogo',
    thumbnail:   prod.pictures?.[0]?.url || null,
    link:        `https://www.mercadolivre.com.br/p/${mlbId}`,
    freteGratis: principal.freteGratis || false,
    frete:       'Grátis',
    envio:       principal.envio || 'Mercado Envios',
    parcelamento: principal.parcelamento || '—',
    avaliacoes:  null,
    atributos:   (prod.attributes || []).slice(0,14).map(a => ({ nome: a.name, valor: a.value_name })),
    seller:      { nome: principal.nome || '—', reputacao: null, vendas: null },
    concorrentes: concorrentes.slice(1),
    totalVendedores: concorrentes.length,
    precoMin:    precos.length ? Math.min(...precos) : 0,
    precoMax:    precos.length ? Math.max(...precos) : 0,
    precoMedio:  precos.length ? Math.round(precos.reduce((a,b)=>a+b,0)/precos.length) : 0,
    ehCatalogo:  true,
    catalogProductId: mlbId,
    fonte:       'api_produtos',
    analisadoEm: new Date().toISOString(),
    pagina:      1,
    posicao:     1,
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
 * ── Rota principal — Orquestra múltiplas estratégias com fallback inteligente
 */
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  const { userId, urlOriginal } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  const debug = [`🚀 Iniciando análise de ${mlbId}`];

  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message, debug }); }

  // ── ESTRATÉGIA 1: Scraping Paginado (prioridade se URL fornecida) ──────────
  if (urlOriginal) {
    debug.push(`📍 URL detectada → Scraping paginado...`);
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId, debug);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json({ ...dados, debug });
    } catch (e) {
      debug.push(`❌ Scraping falhou: ${e.message}. Tentando API de catálogo...`);
    }
  }

  // ── ESTRATÉGIA 2: API de Produtos (catálogos /p/MLB) ──────────────────────
  try {
    const dados = await buscarViaCatalogoAPI(mlbId, api, debug);
    await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
    return res.json({ ...dados, debug });
  } catch (eC) {
    debug.push(`⚠️ API Catálogo falhou: ${eC.message?.substring(0,60)}`);
  }

  // ── ESTRATÉGIA 3: API de Items (anúncios diretos) ─────────────────────────
  try {
    const dados = await buscarItemAPI(mlbId, api, debug);
    await salvarHistorico(userId, mlbId, urlOriginal || mlbId, dados, null);
    return res.json({ ...dados, debug });
  } catch (eA) {
    debug.push(`⚠️ API Items falhou: ${eA.response?.status || eA.message?.substring(0,60)}`);
  }

  // ── ESTRATÉGIA 4: Scraping sem URL (tentativa URL genérica) ───────────────
  try {
    const urlGenerica = `https://www.mercadolivre.com.br/p/${mlbId}/s`;
    debug.push(`🔄 Tentando scraping com URL genérica: ${urlGenerica}`);
    const dados = await buscarViaScraping(urlGenerica, mlbId, debug);
    await salvarHistorico(userId, mlbId, urlGenerica, dados, null);
    return res.json({ ...dados, debug });
  } catch (eS) {
    debug.push(`❌ Scraping genérico falhou: ${eS.message}`);
  }

  debug.push(`❌ Todas as ${4} estratégias falharam para ${mlbId}`);
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
    if (perguntaFollowUp && contextoAnterior) send('log', { msg: `❓ Processando pergunta de follow-up...`, tipo: 'info' });
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