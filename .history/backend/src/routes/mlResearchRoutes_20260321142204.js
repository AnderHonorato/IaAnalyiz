// backend/src/routes/mlResearchRoutes.js
// Estratégia multi-tentativa para buscar qualquer anúncio ML
// Ordem: /products/:id → /items/:id (com auth) → scraping via fetch da URL pública
// + Histórico de pesquisas salvo no banco por usuário

import express from 'express';
import axios   from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// ── Pega instância axios autenticada ────────────────────────────────────────
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

// ── Extrai todos os MLBs de uma URL para tentar cada um ─────────────────────
function extrairTodosMLBs(url) {
  const ids = new Set();
  // /p/MLB...
  for (const m of url.matchAll(/\/p\/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  // slug -MLB...
  const limpa = url.split('?')[0].split('#')[0];
  for (const m of limpa.matchAll(/\/[^/]+-MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  // item_id:MLB...
  for (const m of url.matchAll(/item[_-]?id[=:]MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  // qualquer MLB no texto
  for (const m of url.matchAll(/MLB[-]?(\d+)/gi)) ids.add(`MLB${m[1]}`);
  return [...ids];
}

// ── Reputação do vendedor ──────────────────────────────────────────────────
function mapRep(level) {
  return { '1_red':'bronze','2_yellow':'silver','3_green':'gold','4_light_green':'platinum','5_green':'platinum' }[level] || 'novo';
}

// ── Tipo de anúncio ──────────────────────────────────────────────────────
function mapTipo(id) {
  return { gold_pro:'Premium',gold_special:'Clássico',gold:'Ouro',silver:'Prata',bronze:'Bronze',free:'Grátis' }[id] || id || '—';
}

// ── Atributos relevantes ─────────────────────────────────────────────────
function extrairAtributos(attrs = []) {
  return attrs
    .filter(a => a.value_name && a.value_name.length < 60)
    .slice(0, 12)
    .map(a => ({ nome: a.name, valor: a.value_name }));
}

// ── ESTRATÉGIA 1: /products/:id  (produto de catálogo público) ────────────
async function buscarViaProducts(mlbId, api) {
  const res = await api.get(`/products/${mlbId}`, { timeout: 12000 });
  const p   = res.data;
  // Busca itens do catálogo (concorrentes)
  let concorrentes = [];
  let precoMin = null, precoMax = null, somaPreco = 0, totalV = 0;
  try {
    const itensRes = await api.get(`/products/${mlbId}/items`, {
      params: { limit: 15 }, timeout: 10000,
    });
    const idsConc = (itensRes.data?.results || []).map(r => r.item_id).slice(0, 10);
    if (idsConc.length) {
      const batch = await api.get(`/items?ids=${idsConc.join(',')}`);
      for (const e of (batch.data || [])) {
        if (e.code !== 200 || !e.body) continue;
        const c = e.body;
        const pr = c.price || 0;
        if (pr > 0) {
          if (precoMin === null || pr < precoMin) precoMin = pr;
          if (precoMax === null || pr > precoMax) precoMax = pr;
          somaPreco += pr;
          totalV++;
        }
        let vendNome = '—';
        try { const sv = await api.get(`/users/${c.seller_id}`); vendNome = sv.data.nickname || '—'; } catch {}
        concorrentes.push({
          mlbId: c.id, nome: vendNome, preco: pr,
          link: c.permalink, thumbnail: c.thumbnail, titulo: c.title,
        });
      }
    }
  } catch {}
  concorrentes.sort((a, b) => a.preco - b.preco);

  // Preço do produto catálogo (buy_box)
  const preco = p.buy_box_winner?.price || p.price || (precoMin ?? 0);
  if (precoMin === null) precoMin = preco;
  if (precoMax === null) precoMax = preco;

  return {
    mlbId,
    titulo:      p.name || p.title,
    preco,
    status:      'active',
    estoque:     null,
    vendidos:    null,
    condicao:    'Novo',
    tipoAnuncio: 'Catálogo',
    thumbnail:   p.pictures?.[0]?.url || null,
    link:        `https://www.mercadolivre.com.br/p/${mlbId}`,
    freteGratis: false,
    frete:       '—',
    avaliacoes:  p.reviews?.rating_average ? p.reviews.rating_average.toFixed(1) : null,
    atributos:   (p.attributes || []).filter(a => a.value_name).slice(0, 12).map(a => ({ nome: a.name, valor: a.value_name })),
    seller:       p.buy_box_winner ? { nome: '—', reputacao: null, vendas: null } : null,
    concorrentes,
    totalVendedores: totalV || concorrentes.length,
    precoMin:    precoMin ?? preco,
    precoMax:    precoMax ?? preco,
    precoMedio:  totalV > 0 ? Math.round(somaPreco / totalV * 100) / 100 : preco,
    fonte:       'products',
    analisadoEm: new Date().toISOString(),
  };
}

// ── ESTRATÉGIA 2: /items/:id (com token do usuário) ──────────────────────
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

  // Concorrentes via categoria + título
  let concorrentes = [];
  let precoMin = it.price, precoMax = it.price, somaPreco = it.price, totalV = 1;
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
        const c = e.body;
        const pr = c.price || 0;
        if (pr > 0) {
          if (pr < precoMin) precoMin = pr;
          if (pr > precoMax) precoMax = pr;
          somaPreco += pr; totalV++;
        }
        let vNome = '—';
        try { const sv2 = await api.get(`/users/${c.seller_id}`); vNome = sv2.data.nickname || '—'; } catch {}
        concorrentes.push({ mlbId: c.id, nome: vNome, preco: pr, link: c.permalink, thumbnail: c.thumbnail, titulo: c.title });
      }
    }
  } catch {}
  concorrentes.sort((a, b) => a.preco - b.preco);

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
    totalVendedores: totalV,
    precoMin,
    precoMax,
    precoMedio: Math.round(somaPreco / totalV * 100) / 100,
    fonte:      'items',
    analisadoEm: new Date().toISOString(),
  };
}

// ── ESTRATÉGIA 3: scraping leve da URL pública (sem auth) ─────────────────
// Usa fetch para pegar o JSON-LD ou meta og da página pública do ML
async function buscarViaScraping(url, mlbId) {
  const targetUrl = url.startsWith('http')
    ? url
    : `https://www.mercadolivre.com.br/p/${mlbId}`;

  const res = await axios.get(targetUrl, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AnalyizBot/1.0)',
      'Accept': 'text/html',
    },
    maxRedirects: 5,
  });

  const html  = res.data || '';
  // Tenta extrair JSON-LD
  const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  let titulo = null, preco = null, thumbnail = null;
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      titulo    = ld.name || ld.title || null;
      preco     = ld.offers?.price ? parseFloat(ld.offers.price) : null;
      thumbnail = ld.image?.[0] || ld.image || null;
    } catch {}
  }

  // Fallback: og tags
  if (!titulo) {
    const og = html.match(/<meta property="og:title" content="([^"]+)"/i);
    if (og) titulo = og[1];
  }
  if (!thumbnail) {
    const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i);
    if (ogImg) thumbnail = ogImg[1];
  }
  if (!preco) {
    // Tenta pegar preço do JSON embutido no window.__PRELOADED_STATE__
    const precoMatch = html.match(/"price"\s*:\s*([\d.]+)/);
    if (precoMatch) preco = parseFloat(precoMatch[1]);
  }

  if (!titulo) throw new Error('Não foi possível extrair dados da página');

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
    seller:       null,
    concorrentes: [],
    totalVendedores: 1,
    precoMin:    preco || 0,
    precoMax:    preco || 0,
    precoMedio:  preco || 0,
    fonte:       'scraping',
    analisadoEm: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ROTA PRINCIPAL — GET /api/ml/research/:mlbId
// Testa múltiplos IDs extraídos da URL com cascata de estratégias
// ══════════════════════════════════════════════════════════════════════════════
router.get('/api/ml/research/:mlbId', async (req, res) => {
  const { mlbId } = req.params;
  const { userId, urlOriginal } = req.query;

  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

  let api;
  try { api = await getMlApi(userId); } catch (e) {
    return res.status(401).json({ error: e.message });
  }

  // Constrói lista de IDs para tentar (começa pelo informado, depois extras da URL)
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
      erros.push(`products/${id}: ${e1.response?.status || e1.message}`);
    }

    // Estratégia 2: /items
    try {
      const dados = await buscarViaItems(id, api);
      await salvarHistorico(userId, id, urlOriginal || id, dados, null);
      return res.json(dados);
    } catch (e2) {
      erros.push(`items/${id}: ${e2.response?.status || e2.message}`);
    }
  }

  // Estratégia 3: scraping da URL original
  if (urlOriginal) {
    try {
      const dados = await buscarViaScraping(decodeURIComponent(urlOriginal), mlbId);
      await salvarHistorico(userId, mlbId, urlOriginal, dados, null);
      return res.json(dados);
    } catch (e3) {
      erros.push(`scraping: ${e3.message}`);
    }
  }

  // Tudo falhou
  const msg = `IDs tentados: ${todosIds.join(', ')}. Erros: ${erros.slice(0, 4).join(' | ')}`;
  await salvarHistorico(userId, mlbId, urlOriginal || mlbId, null, msg);
  console.error('[Research] Todas estratégias falharam:', msg);
  res.status(404).json({ error: `Anúncio não encontrado. ${msg}` });
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTÓRICO DE PESQUISAS
// ══════════════════════════════════════════════════════════════════════════════

async function salvarHistorico(userId, mlbId, urlOriginal, dados, erro) {
  try {
    await prisma.pesquisaHistorico.upsert({
      where: { usuarioId_mlbId: { usuarioId: parseInt(userId), mlbId } },
      update: {
        urlOriginal: urlOriginal || mlbId,
        titulo:      dados?.titulo || null,
        thumbnail:   dados?.thumbnail || null,
        preco:       dados?.preco || null,
        dadosJson:   dados ? JSON.stringify(dados) : null,
        erro:        erro || null,
        status:      erro ? 'erro' : 'concluido',
        updatedAt:   new Date(),
        arquivado:   false,
      },
      create: {
        usuarioId:   parseInt(userId),
        mlbId,
        urlOriginal: urlOriginal || mlbId,
        titulo:      dados?.titulo || null,
        thumbnail:   dados?.thumbnail || null,
        preco:       dados?.preco || null,
        dadosJson:   dados ? JSON.stringify(dados) : null,
        erro:        erro || null,
        status:      erro ? 'erro' : 'concluido',
        arquivado:   false,
        excluido:    false,
      },
    });
  } catch (e) {
    console.warn('[Research] Histórico não salvo:', e.message);
  }
}

// GET /api/ml/research/historico?userId=&arquivado=
router.get('/api/ml/research/historico', async (req, res) => {
  const { userId, arquivado } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
  try {
    const itens = await prisma.pesquisaHistorico.findMany({
      where: {
        usuarioId: parseInt(userId),
        excluido:  false,
        arquivado: arquivado === 'true',
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    res.json(itens.map(i => ({
      ...i,
      dadosJson: i.dadosJson ? JSON.parse(i.dadosJson) : null,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/ml/research/historico/:id/arquivar
router.put('/api/ml/research/historico/:id/arquivar', async (req, res) => {
  try {
    await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) }, data: { arquivado: true } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/ml/research/historico/:id/restaurar
router.put('/api/ml/research/historico/:id/restaurar', async (req, res) => {
  try {
    await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) }, data: { arquivado: false } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/ml/research/historico/:id  (soft delete)
router.delete('/api/ml/research/historico/:id', async (req, res) => {
  try {
    await prisma.pesquisaHistorico.update({ where: { id: parseInt(req.params.id) }, data: { excluido: true, excluidoEm: new Date() } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/ml/research/historico/lote  (soft delete em massa)
router.delete('/api/ml/research/historico/lote', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids obrigatório' });
  try {
    await prisma.pesquisaHistorico.updateMany({
      where: { id: { in: ids.map(Number) } },
      data:  { excluido: true, excluidoEm: new Date() },
    });
    res.json({ ok: true, count: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/ml/research/historico/:id/definitivo  (hard delete)
router.delete('/api/ml/research/historico/:id/definitivo', async (req, res) => {
  try {
    await prisma.pesquisaHistorico.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/ml/research/historico/lote/arquivar
router.put('/api/ml/research/historico/lote/arquivar', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids obrigatório' });
  try {
    await prisma.pesquisaHistorico.updateMany({ where: { id: { in: ids.map(Number) } }, data: { arquivado: true } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;