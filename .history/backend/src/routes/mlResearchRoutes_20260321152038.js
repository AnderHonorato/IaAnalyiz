// backend/src/routes/mlResearchRoutes.js — v2
// Estratégia multi-tentativa + scraping de vendedores para catálogo/full
// Para produtos de catálogo: acessa a página de "Outras opções de compra"
// e extrai todos os vendedores, preços e descontos

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// ── Axios autenticado ─────────────────────────────────────────────────────────
async function getMlApi(userId) {
  const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(userId) } });
  if (!token) throw new Error('Conta ML não conectada');
  if (new Date() >= new Date(token.expiresAt)) throw new Error('Token ML expirado — reconecte');
  return axios.create({
    baseURL: 'https://api.mercadolibre.com',
    headers: { Authorization: `Bearer ${token.accessToken}` },
    timeout: 15000,
  });
}

// ── Axios para scraping público ───────────────────────────────────────────────
const scraperAgent = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  },
  maxRedirects: 5,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function extrairTodosMLBs(url) {
  const ids = new Set();
  for (const m of url.matchAll(/\/p\/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  const limpa = url.split('?')[0].split('#')[0];
  for (const m of limpa.matchAll(/\/[^/]+-MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  for (const m of url.matchAll(/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  return [...ids];
}
function mapRep(level) {
  return { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' }[level] || 'novo';
}
function mapTipo(id) {
  return { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' }[id] || id || '—';
}
function extrairAtributos(attrs = []) {
  return attrs.filter(a => a.value_name && a.value_name.length < 60).slice(0, 12).map(a => ({ nome: a.name, valor: a.value_name }));
}

// ── SCRAPING: extrai vendedores da página pública do ML ──────────────────────
async function scraparVendedoresDaPagina(url) {
  try {
    const res  = await scraperAgent.get(url);
    const html = res.data || '';
    const vendedores = [];

    // 1. Tenta extrair o JSON de estado embutido na página (__PRELOADED_STATE__)
    const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{.+?\});\s*<\/script>/s)
      || html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]+?\});\s*(?:window|var|\n)/);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const offers = state?.initialState?.buyingOptions?.offers
          || state?.offers
          || state?.component?.state?.buyingOptions?.offers
          || [];
        for (const o of (Array.isArray(offers) ? offers : [])) {
          const seller = o.seller || o.sellerInfo || {};
          const price  = o.price?.amount || o.salePrice || o.price || 0;
          const name   = seller.nickname || seller.name || seller.id || '—';
          const link   = o.permalink || o.item?.permalink || '';
          const desconto = o.discount ? `${o.discount}% OFF` : null;
          if (name !== '—' || price) {
            vendedores.push({ nome: name, preco: parseFloat(price) || 0, link, desconto, reputacao: seller.reputationLevelId || null });
          }
        }
        if (vendedores.length) return vendedores;
      } catch {}
    }

    // 2. Tenta extrair de scripts JSON-LD
    const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldMatches) {
      try {
        const ld = JSON.parse(m[1]);
        const offers = ld.offers?.offers || (Array.isArray(ld.offers) ? ld.offers : ld.offers ? [ld.offers] : []);
        for (const o of offers) {
          const name  = o.seller?.name || o.offeredBy?.name || '—';
          const price = parseFloat(o.price || 0);
          const link  = o.url || '';
          if (price > 0 || name !== '—') vendedores.push({ nome: name, preco: price, link, desconto: null });
        }
        if (vendedores.length) return vendedores;
      } catch {}
    }

    // 3. Regex fallback para extrair vendedores do HTML
    const sellerMatches = html.matchAll(/seller[_-]?nickname["\s:=]+["']([^"']{2,50})["']/gi);
    const priceMatches  = [...html.matchAll(/["']amount["']\s*:\s*([\d.]+)/g)];
    const sellerNames   = [...new Set([...sellerMatches].map(m => m[1]))].slice(0, 10);
    if (sellerNames.length) {
      sellerNames.forEach((nome, i) => {
        vendedores.push({ nome, preco: parseFloat(priceMatches[i]?.[1] || 0), link: '', desconto: null });
      });
      return vendedores;
    }
  } catch (e) {
    console.warn('[Scraper/Vendedores]', e.message?.substring(0, 100));
  }
  return [];
}

// ── SCRAPING: acessa página de "Outras opções de compra" do catálogo ─────────
// URL padrão: https://www.mercadolivre.com.br/noindex/catalog/buybox/...
// Ou: https://www.mercadolivre.com.br/p/MLB...#offers
async function scraparOutrasOpcoesCatalogo(mlbId, api) {
  const cleanId = mlbId.replace(/^MLB/i, '');
  const urlsParaTentar = [
    `https://www.mercadolivre.com.br/p/MLB${cleanId}#offers`,
    `https://www.mercadolivre.com.br/p/MLB${cleanId}`,
  ];

  // Primeiro tenta via API: /products/:id/items (lista todos os itens do catálogo)
  try {
    const itemsRes = await api.get(`/products/${mlbId}/items`, { params: { limit: 20 }, timeout: 10000 });
    const results  = itemsRes.data?.results || [];
    if (results.length > 0) {
      const idsLote = results.map(r => r.item_id || r.id).filter(Boolean).slice(0, 15);
      if (idsLote.length) {
        const batchRes = await api.get(`/items?ids=${idsLote.join(',')}`);
        const vendedores = [];
        for (const entry of (batchRes.data || [])) {
          if (entry.code !== 200 || !entry.body) continue;
          const c = entry.body;
          let vendNome = '—';
          try { const sv = await api.get(`/users/${c.seller_id}`); vendNome = sv.data.nickname || '—'; } catch {}
          const descPct = c.original_price && c.price < c.original_price
            ? Math.round((1 - c.price / c.original_price) * 100)
            : null;
          vendedores.push({
            mlbId:    c.id,
            nome:     vendNome,
            preco:    c.price || 0,
            precoOriginal: c.original_price || null,
            desconto: descPct ? `${descPct}% OFF` : null,
            link:     c.permalink,
            thumbnail:c.thumbnail,
            titulo:   c.title,
            frete:    c.shipping?.free_shipping ? 'Grátis' : 'Pago',
            freteGratis: c.shipping?.free_shipping === true,
            estoque:  c.available_quantity,
            vendidos: c.sold_quantity,
            tipoAnuncio: mapTipo(c.listing_type_id),
          });
        }
        if (vendedores.length) {
          vendedores.sort((a, b) => a.preco - b.preco);
          return vendedores;
        }
      }
    }
  } catch (e) {
    console.warn('[CatálogoAPI/Items]', e.message?.substring(0, 80));
  }

  // Fallback: scraping da página pública
  for (const url of urlsParaTentar) {
    const vendedores = await scraparVendedoresDaPagina(url);
    if (vendedores.length) return vendedores;
  }
  return [];
}

// ── ESTRATÉGIA 1: /products/:id ───────────────────────────────────────────────
async function buscarViaProducts(mlbId, api) {
  const res = await api.get(`/products/${mlbId}`, { timeout: 12000 });
  const p   = res.data;

  // Busca todas as opções de compra (vendedores do catálogo)
  const concorrentes = await scraparOutrasOpcoesCatalogo(mlbId, api);

  const precos = concorrentes.map(c => c.preco).filter(v => v > 0);
  const preco  = p.buy_box_winner?.price || p.price || (precos[0] ?? 0);
  if (!precos.includes(preco) && preco > 0) precos.unshift(preco);
  precos.sort((a, b) => a - b);

  const precoMin   = precos.length ? precos[0] : preco;
  const precoMax   = precos.length ? precos[precos.length - 1] : preco;
  const precoMedio = precos.length ? Math.round(precos.reduce((s, v) => s + v, 0) / precos.length * 100) / 100 : preco;

  // Vendedor principal (buy_box)
  let seller = null;
  const bbWinner = p.buy_box_winner;
  if (bbWinner?.seller_id) {
    try {
      const sv = await api.get(`/users/${bbWinner.seller_id}`);
      seller = { nome: sv.data.nickname || '—', reputacao: mapRep(sv.data.seller_reputation?.level_id), vendas: sv.data.seller_reputation?.transactions?.completed || 0 };
    } catch {}
  }
  if (!seller && concorrentes.length) {
    seller = { nome: concorrentes[0].nome, reputacao: null, vendas: null };
  }

  return {
    mlbId,
    titulo:      p.name || p.title,
    preco,
    status:      'active',
    estoque:     null,
    vendidos:    null,
    condicao:    'Novo',
    tipoAnuncio: 'Catálogo',
    thumbnail:   p.pictures?.[0]?.url || concorrentes[0]?.thumbnail || null,
    link:        `https://www.mercadolivre.com.br/p/${mlbId}`,
    freteGratis: concorrentes[0]?.freteGratis ?? false,
    frete:       concorrentes[0]?.frete || '—',
    avaliacoes:  p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
    atributos:   (p.attributes || []).filter(a => a.value_name).slice(0, 12).map(a => ({ nome: a.name, valor: a.value_name })),
    seller,
    concorrentes,
    totalVendedores: concorrentes.length || 1,
    precoMin,
    precoMax,
    precoMedio,
    ehCatalogo:  true,
    fonte:       'products+catalog',
    analisadoEm: new Date().toISOString(),
  };
}

// ── ESTRATÉGIA 2: /items/:id ──────────────────────────────────────────────────
async function buscarViaItems(mlbId, api) {
  const itemRes = await api.get(`/items/${mlbId}`, { timeout: 12000 });
  const it = itemRes.data;

  // Seller
  let seller = null;
  try {
    const sv = await api.get(`/users/${it.seller_id}`);
    const s  = sv.data;
    seller = { id: s.id, nome: s.nickname, reputacao: mapRep(s.seller_reputation?.level_id), vendas: s.seller_reputation?.transactions?.completed || 0 };
  } catch {}

  // Se não achou seller, tenta scraping da página
  if (!seller || seller.nome === '—') {
    const urlItem = it.permalink || `https://produto.mercadolivre.com.br/${mlbId.toLowerCase()}`;
    try {
      const vendedoresScraped = await scraparVendedoresDaPagina(urlItem);
      if (vendedoresScraped.length) {
        seller = { nome: vendedoresScraped[0].nome, reputacao: null, vendas: null };
      }
    } catch {}
  }

  // Verifica se tem product_id (é catálogo) → busca outras opções
  let concorrentes = [];
  const ehCatalogo = !!(it.catalog_listing || it.catalog_product_id);

  if (ehCatalogo && it.catalog_product_id) {
    concorrentes = await scraparOutrasOpcoesCatalogo(it.catalog_product_id, api);
  } else {
    // Busca concorrentes via search por título/categoria
    try {
      const titulo = (it.title || '').split(' ').slice(0, 4).join(' ');
      const busca  = await api.get('/sites/MLB/search', {
        params: { category: it.category_id, q: titulo, limit: 12, sort: 'price_asc' },
        timeout: 8000,
      });
      const ids = (busca.data?.results || []).map(r => r.id).filter(id => id !== mlbId).slice(0, 8);
      if (ids.length) {
        const batch = await api.get(`/items?ids=${ids.join(',')}`);
        for (const e of (batch.data || [])) {
          if (e.code !== 200 || !e.body) continue;
          const c = e.body; const pr = c.price || 0;
          let vNome = '—';
          try { const sv2 = await api.get(`/users/${c.seller_id}`); vNome = sv2.data.nickname || '—'; } catch {}
          concorrentes.push({ mlbId: c.id, nome: vNome, preco: pr, link: c.permalink, thumbnail: c.thumbnail, titulo: c.title, freteGratis: c.shipping?.free_shipping, desconto: null });
        }
        concorrentes.sort((a, b) => a.preco - b.preco);
      }
    } catch {}
  }

  const allPrecos = [it.price, ...concorrentes.map(c => c.preco)].filter(v => v > 0).sort((a, b) => a - b);
  const precoMin   = allPrecos[0] ?? it.price;
  const precoMax   = allPrecos[allPrecos.length - 1] ?? it.price;
  const precoMedio = allPrecos.length ? Math.round(allPrecos.reduce((s, v) => s + v, 0) / allPrecos.length * 100) / 100 : it.price;

  return {
    mlbId,
    titulo:      it.title,
    preco:       it.price,
    status:      it.status,
    estoque:     it.available_quantity,
    vendidos:    it.sold_quantity,
    condicao:    it.condition === 'new' ? 'Novo' : 'Usado',
    tipoAnuncio: mapTipo(it.listing_type_id),
    thumbnail:   it.thumbnail,
    link:        it.permalink,
    freteGratis: it.shipping?.free_shipping === true,
    frete:       it.shipping?.free_shipping ? 'Grátis' : 'Pago',
    avaliacoes:  it.reviews?.rating_average ? it.reviews.rating_average.toFixed(1) : null,
    atributos:   extrairAtributos(it.attributes),
    seller,
    concorrentes,
    totalVendedores: concorrentes.length + 1,
    precoMin,
    precoMax,
    precoMedio,
    ehCatalogo,
    fonte:       'items',
    analisadoEm: new Date().toISOString(),
  };
}

// ── ESTRATÉGIA 3: scraping direto ─────────────────────────────────────────────
async function buscarViaScraping(url, mlbId) {
  const targetUrl = url.startsWith('http') ? url : `https://www.mercadolivre.com.br/p/${mlbId}`;
  const res  = await scraperAgent.get(targetUrl);
  const html = res.data || '';

  let titulo = null, preco = null, thumbnail = null;
  const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const ld  = JSON.parse(ldMatch[1]);
      titulo    = ld.name || ld.title || null;
      preco     = ld.offers?.price ? parseFloat(ld.offers.price) : null;
      thumbnail = ld.image?.[0] || ld.image || null;
    } catch {}
  }
  if (!titulo) { const og = html.match(/<meta property="og:title" content="([^"]+)"/i); if (og) titulo = og[1]; }
  if (!thumbnail) { const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i); if (ogImg) thumbnail = ogImg[1]; }
  if (!preco) { const pm = html.match(/"price"\s*:\s*([\d.]+)/); if (pm) preco = parseFloat(pm[1]); }
  if (!titulo) throw new Error('Não foi possível extrair dados da página');

  // Tenta extrair vendedores mesmo no scraping
  const vendedores = await scraparVendedoresDaPagina(targetUrl);

  return {
    mlbId,
    titulo,
    preco:        preco || 0,
    status:       'active',
    estoque:      null,
    vendidos:     null,
    condicao:     'Novo',
    tipoAnuncio:  'Catálogo',
    thumbnail,
    link:         targetUrl,
    freteGratis:  false,
    frete:        '—',
    avaliacoes:   null,
    atributos:    [],
    seller:       vendedores.length ? { nome: vendedores[0].nome, reputacao: null, vendas: null } : null,
    concorrentes: vendedores.slice(1),
    totalVendedores: vendedores.length || 1,
    precoMin:     vendedores.length ? Math.min(preco||0, ...vendedores.map(v=>v.preco)) : (preco||0),
    precoMax:     vendedores.length ? Math.max(preco||0, ...vendedores.map(v=>v.preco)) : (preco||0),
    precoMedio:   preco || 0,
    ehCatalogo:   true,
    fonte:        'scraping',
    analisadoEm:  new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ROTA PRINCIPAL — GET /api/ml/research/:mlbId
// ══════════════════════════════════════════════════════════════════════════════
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId }    = req.params;
  const { userId, urlOriginal } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

  let api;
  try { api = await getMlApi(userId); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const todosIds = [mlbId];
  if (urlOriginal) {
    for (const id of extrairTodosMLBs(decodeURIComponent(urlOriginal))) {
      if (!todosIds.includes(id)) todosIds.push(id);
    }
  }

  const erros = [];

  for (const id of todosIds) {
    // Estratégia 1: /products
    try {
      const dados = await buscarViaProducts(id, api);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json(dados);
    } catch (e1) {
      erros.push(`products/${id}: ${e1.response?.status || e1.message?.substring(0,50)}`);
    }

    // Estratégia 2: /items
    try {
      const dados = await buscarViaItems(id, api);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json(dados);
    } catch (e2) {
      erros.push(`items/${id}: ${e2.response?.status || e2.message?.substring(0,50)}`);
    }
  }

  // Estratégia 3: scraping
  if (urlOriginal) {
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json(dados);
    } catch (e3) {
      erros.push(`scraping: ${e3.message?.substring(0,50)}`);
    }
  }

  const msg = `IDs tentados: ${todosIds.join(', ')}. Erros: ${erros.slice(0, 4).join(' | ')}`;
  await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
  res.status(404).json({ error: `Anúncio não encontrado. ${msg}` });
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTÓRICO
// ══════════════════════════════════════════════════════════════════════════════
async function salvarHistorico(userId, mlbId, urlOriginal, dados, erro) {
  try {
    await prisma.pesquisaHistorico.upsert({
      where: { usuarioId_mlbId: { usuarioId: parseInt(userId), mlbId } },
      update: { urlOriginal: urlOriginal || mlbId, titulo: dados?.titulo || null, thumbnail: dados?.thumbnail || null, preco: dados?.preco || null, dadosJson: dados ? JSON.stringify(dados) : null, erro: erro || null, status: erro ? 'erro' : 'concluido', updatedAt: new Date(), arquivado: false },
      create: { usuarioId: parseInt(userId), mlbId, urlOriginal: urlOriginal || mlbId, titulo: dados?.titulo || null, thumbnail: dados?.thumbnail || null, preco: dados?.preco || null, dadosJson: dados ? JSON.stringify(dados) : null, erro: erro || null, status: erro ? 'erro' : 'concluido', arquivado: false, excluido: false },
    });
  } catch (e) { console.warn('[Research] Histórico não salvo:', e.message?.substring(0,50)); }
}

router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const itens = await prisma.pesquisaHistorico.findMany({ where: { usuarioId: parseInt(userId), excluido: false, arquivado: arquivado === 'true' }, orderBy: { updatedAt: 'desc' }, take: 200 });
    res.json(itens.map(i => ({ ...i, dadosJson: i.dadosJson ? JSON.parse(i.dadosJson) : null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/ml/research/historico/:id/arquivar',  async (req, res) => { try { await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) }, data: { arquivado: true } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/api/ml/research/historico/:id/restaurar', async (req, res) => { try { await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) }, data: { arquivado: false } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/api/ml/research/historico/:id',        async (req, res) => { try { await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) }, data: { excluido: true, excluidoEm: new Date() } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => { try { await prisma.pesquisaHistorico.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/api/ml/research/historico/lote',       async (req, res) => { const { ids } = req.body; if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids obrigatório' }); try { await prisma.pesquisaHistorico.updateMany({ where: { id: { in: ids.map(Number) } }, data: { excluido: true, excluidoEm: new Date() } }); res.json({ ok: true, count: ids.length }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/api/ml/research/historico/lote/arquivar', async (req, res) => { const { ids } = req.body; if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids obrigatório' }); try { await prisma.pesquisaHistorico.updateMany({ where: { id: { in: ids.map(Number) } }, data: { arquivado: true } }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

export default router;