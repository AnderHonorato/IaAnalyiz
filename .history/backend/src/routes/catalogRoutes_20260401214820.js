/**
 * backend/src/routes/catalogRoutes.js
 * 
 * Rotas de Catálogo — Gerenciamento de Divergências e Produtos
 * 
 * Responsabilidades:
 * - Gerenciar divergências de produtos (discrepâncias entre listagem ML e sistema local)
 * - CRUD completo de produtos (criar, ler, atualizar, deletar)
 * - Gestão de kits (composição de múltiplos itens em um único SKU)
 * - Importação em lote de produtos
 * - Vinculação/desvinculação de produtos em kits
 * 
 * Estrutura:
 * - Divergências: Rastreamento de problemas com produtos listados no ML
 *   - Status: PENDENTE, CORRIGIDO, IGNORADO, REINCIDENTE
 *   - Plataformas: Mercado Livre, B2Brasil, Shopee, etc.
 *   - Estatísticas em tempo real
 * 
 * - Produtos: Catálogo local do vendedor
 *   - Filtros: usuário, categoria, status, plataforma, busca por nome/SKU
 *   - Importação em lote com upsert automático
 *   - Suporte a kits multi-item com cálculo de peso
 * 
 * Fluxo típico:
 * 1. Usuário cria/importa produtos
 * 2. Sistema vincula com IDs do ML
 * 3. Divergências surgem quando há discrepâncias
 * 4. Usuário resolve e marca como corrigido
 * 5. Produtos podem ser agrupados em kits
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 */

import express from 'express';
import { prisma } from '../prisma.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// DIVERGÊNCIAS — Rastreamento de Problemas com Produtos
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/divergencias
 * 
 * Lista todas as divergências do usuário com filtros opcionais
 * 
 * Query Parameters:
 *   - userId (obrigatório): ID do usuário
 *   - status (opcional): PENDENTE, CORRIGIDO, IGNORADO, REINCIDENTE. Default: PENDENTE
 *   - plataforma (opcional): Filtra por plataforma específica
 * 
 * Retorna: Array de divergências ordenadas por data decrescente
 * 
 * Exemplo:
 *   GET /api/divergencias?userId=1&status=PENDENTE&plataforma=Mercado%20Livre
 *   Response: [{ id, usuarioId, status, plataforma, descricao, ... }]
 */
router.get('/api/divergencias', async (req, res) => {
  try {
    const { status, plataforma, userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const where = { usuarioId: parseInt(userId) };
    if (plataforma) where.plataforma = plataforma;
    if (status && status !== 'TODOS') where.status = status;
    else if (!status) where.status = 'PENDENTE';
    const div = await prisma.divergencia.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(div);
  } catch { res.status(500).json({ error: 'Erro ao buscar divergências.' }); }
});

router.get('/api/divergencias/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    const uid = parseInt(userId);
    const [pendente, corrigido, ignorado, reincidente] = await Promise.all([
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'PENDENTE' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'CORRIGIDO' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'IGNORADO' } }),
      prisma.divergencia.count({ where: { usuarioId: uid, status: 'REINCIDENTE' } }),
    ]);
    res.json({ pendente, corrigido, ignorado, reincidente, total: pendente + corrigido + ignorado + reincidente });
  } catch { res.status(500).json({ error: 'Erro ao buscar stats.' }); }
});

router.put('/api/divergencias/:id/corrigido', async (req, res) => { try { res.json(await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'CORRIGIDO', resolvido: true } })); } catch { res.status(500).json({ error: 'Erro' }); } });
router.put('/api/divergencias/:id/pendente', async (req, res) => { try { res.json(await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'PENDENTE', resolvido: false } })); } catch { res.status(500).json({ error: 'Erro' }); } });
router.put('/api/divergencias/:id/ignorado', async (req, res) => { try { res.json(await prisma.divergencia.update({ where: { id: parseInt(req.params.id) }, data: { status: 'IGNORADO', resolvido: false } })); } catch { res.status(500).json({ error: 'Erro' }); } });
router.delete('/api/divergencias/:id', async (req, res) => { try { await prisma.divergencia.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); } catch { res.status(500).json({ error: 'Erro' }); } });
router.delete('/api/divergencias/limpar/corrigidas', async (req, res) => { try { const where = { status: 'CORRIGIDO', ...(req.query.userId ? { usuarioId: parseInt(req.query.userId) } : {}) }; const { count } = await prisma.divergencia.deleteMany({ where }); res.json({ ok: true, removidas: count }); } catch { res.status(500).json({ error: 'Erro' }); } });

router.get('/api/produtos', async (req, res) => {
  try {
    const { userId, categoria, status, search, plataforma } = req.query;
    const where = { usuarioId: parseInt(userId) };
    if (categoria)  where.categoria  = categoria;
    if (status)     where.status     = status;
    if (plataforma) where.plataforma = plataforma;
    if (search) where.OR = [{ nome: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }, { mlItemId: { contains: search, mode: 'insensitive' } }];
    res.json(await prisma.produto.findMany({ where, include: { itensDoKit: { include: { produto: true } } }, orderBy: { id: 'desc' } }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/produtos/categorias', async (req, res) => {
  try {
    const cats = await prisma.produto.findMany({ where: { usuarioId: parseInt(req.query.userId), categoria: { not: null } }, select: { categoria: true }, distinct: ['categoria'] });
    res.json(cats.map(c => c.categoria).filter(Boolean).sort());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/produtos', async (req, res) => {
  try {
    const { userId, sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma, alturaCm, larguraCm, comprimentoCm, categoria, status, thumbnail } = req.body;
    res.status(201).json(await prisma.produto.create({ data: { usuarioId: parseInt(userId), sku, nome, mlItemId: mlItemId || null, eKit: !!eKit, plataforma: plataforma || 'Mercado Livre', preco: parseFloat(preco) || 0, pesoGramas: parseInt(pesoGramas, 10) || 0, alturaCm: parseFloat(alturaCm) || 0, larguraCm: parseFloat(larguraCm) || 0, comprimentoCm: parseFloat(comprimentoCm) || 0, categoria: categoria || null, status: status || 'active', thumbnail: thumbnail || null } }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/api/produtos/:id', async (req, res) => {
  try {
    const { sku, nome, preco, pesoGramas, mlItemId, eKit, plataforma, alturaCm, larguraCm, comprimentoCm, categoria, status, thumbnail } = req.body;
    res.json(await prisma.produto.update({ where: { id: parseInt(req.params.id) }, data: { sku, nome, mlItemId: mlItemId || null, eKit: !!eKit, plataforma: plataforma || 'Mercado Livre', preco: parseFloat(preco) || 0, pesoGramas: parseInt(pesoGramas, 10) || 0, alturaCm: parseFloat(alturaCm) || 0, larguraCm: parseFloat(larguraCm) || 0, comprimentoCm: parseFloat(comprimentoCm) || 0, categoria: categoria || null, status: status || 'active', thumbnail: thumbnail || null } }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/api/produtos/:id', async (req, res) => { try { await prisma.produto.delete({ where: { id: parseInt(req.params.id) } }); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); } });

router.post('/api/produtos/import-batch', async (req, res) => {
  try {
    const { userId, produtos } = req.body;
    const uid = parseInt(userId);
    let criados = 0, atualizados = 0;
    for (const p of produtos) {
      const existing = await prisma.produto.findFirst({ where: { usuarioId: uid, mlItemId: p.mlItemId } });
      if (existing) { await prisma.produto.update({ where: { id: existing.id }, data: { nome: p.nome, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null } }); atualizados++; } 
      else { await prisma.produto.create({ data: { usuarioId: uid, sku: p.sku || `ML-${Date.now()}`, nome: p.nome, mlItemId: p.mlItemId, preco: p.preco || 0, pesoGramas: p.pesoGramas || 0, categoria: p.categoria || null, status: p.status || 'active', thumbnail: p.thumbnail || null, plataforma: 'Mercado Livre', eKit: false } }); criados++; }
    }
    res.json({ ok: true, criados, atualizados });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/api/produtos/:id/vincular', async (req, res) => {
  try {
    const { composicao, pesoManual } = req.body;
    const id = parseInt(req.params.id);
    let pesoTotal = 0;
    let eKit = false;
    await prisma.kitItem.deleteMany({ where: { kitId: id } });
    if (composicao && composicao.length > 0) {
      eKit = true;
      for (const item of composicao) {
        const pBase = await prisma.produto.findUnique({ where: { id: parseInt(item.produtoId) } });
        if (pBase) {
          pesoTotal += (pBase.pesoGramas * parseInt(item.quantidade));
          await prisma.kitItem.create({ data: { kitId: id, produtoId: pBase.id, quantidade: parseInt(item.quantidade) } });
        }
      }
    } else { pesoTotal = parseInt(pesoManual) || 0; }
    res.json(await prisma.produto.update({ where: { id }, data: { plataforma: 'Mercado Livre', eKit, pesoGramas: pesoTotal } }));
  } catch (e) { res.status(500).json({ error: 'Erro ao vincular.' }); }
});

router.put('/api/produtos/:id/desvincular', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.kitItem.deleteMany({ where: { kitId: id } });
    res.json(await prisma.produto.update({ where: { id }, data: { plataforma: 'ML_PENDENTE', eKit: false, pesoGramas: 0 } }));
  } catch (e) { res.status(500).json({ error: 'Erro ao desvincular.' }); }
});

export default router;