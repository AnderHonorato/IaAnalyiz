// ═══════════════════════════════════════════════════════════════════════════════
//  MERCADO LIVRE — Autenticação OAuth, Sincronização e Gestão de Anúncios
// ═══════════════════════════════════════════════════════════════════════════════
//
// Este módulo implementa a integração com Mercado Livre. Fluxo:
//
// 1. OAuth 2.0: Usuário clica "Conectar ML" → redireciona para auth.mercadolivre.com
//    → retorna com código → backend troca por access_token + refresh_token
// 2. Sincronização: Busca anúncios do vendedor ML + extrai ficha técnica
// 3. Gerenciamento: Atualiza preço, estoque, atributos de anúncios
// 4. Monitoramento: Bot corre continuamente analisando divergências
//
// Multi-tenant: Cada usuário tem seus próprios tokens ML armazenados de forma isolada
//
// Dependências:
// • Express: framework de roteamento
// • Axios: cliente HTTP para API Mercado Livre
// • Prisma: queries de banco de dados (mlToken, agendadorConfig, etc)
// • botRunner.js: SSE para streaming de eventos do bot para frontend

import express from 'express';
import axios from 'axios';
import { prisma } from '../prisma.js';
import { addSseClient, runBot } from '../botRunner.js';

const router = express.Router();

router.get('/api/ml/auth-url', (req, res) => {
  const state = req.query.userId ? Buffer.from(String(req.query.userId)).toString('base64') : '';
  res.json({ url: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_APP_ID}&redirect_uri=${encodeURIComponent(process.env.ML_REDIRECT_URI)}&state=${state}` });
});

router.get('/api/ml/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const userId = parseInt(Buffer.from(state, 'base64').toString('utf-8'));
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, { params: { grant_type: 'authorization_code', client_id: process.env.ML_APP_ID, client_secret: process.env.ML_SECRET_KEY, code, redirect_uri: process.env.ML_REDIRECT_URI }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const { access_token, refresh_token, expires_in, user_id } = response.data;
    let nickname = '';
    try { const me = await axios.get('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${access_token}` } }); nickname = me.data.nickname || ''; } catch (_) {}
    await prisma.mlToken.upsert({ where: { usuarioId: userId }, update: { accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + (expires_in - 300) * 1000), mlUserId: String(user_id), nickname }, create: { usuarioId: userId, accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + (expires_in - 300) * 1000), mlUserId: String(user_id), nickname } });
    res.redirect(`http://localhost:5173/ml?auth=success&nickname=${encodeURIComponent(nickname)}`);
  } catch (e) { res.redirect('http://localhost:5173/ml?auth=error'); }
});

router.get('/api/ml/status', async (req, res) => {
  try {
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(req.query.userId) } });
    if (!token) return res.json({ connected: false });
    res.json({ connected: true, expired: new Date() >= new Date(token.expiresAt), nickname: token.nickname, mlUserId: token.mlUserId, expiresAt: token.expiresAt });
  } catch { res.json({ connected: false }); }
});

router.delete('/api/ml/disconnect', async (req, res) => {
  try { await prisma.mlToken.deleteMany({ where: { usuarioId: parseInt(req.query.userId) } }); res.json({ ok: true }); } catch { res.status(500).json({ error: 'Erro.' }); }
});


// ═════════════════════════════════════════════════════════════════════════════════
// 📄 DETALHES DE ANÚNCIOS — Buscar dados completos de um item
// ═════════════════════════════════════════════════════════════════════════════════

// GET /api/ml/item-details/:mlItemId
// ─────────────────────────────────────────────────────────────────────────────
// Busca informações completas de um anúncio específico do ML:
// • Ficha técnica (attributes: GTIN, BRAND, MODEL, peso, dimensões, etc)
// • Descrição em plain text
// • Informações gerais (preço, estoque, status)
//
// Fluxo:
// 1. Valida token ML do usuário
// 2. Chama /items/{mlItemId} para dados básicos
// 3. Chama /items/{mlItemId}/description para descrição em texto
// 4. Merge ambas respostas
//
// Params:
//   @mlItemId - ID do item no Mercado Livre (e.g., MLB123456789)
//
// Query params:
//   @userId (required) - ID do usuário autenticado
//
// Response:
//   Objeto item completo com campo adicional description_text (descrição em plain text)
//
// Erros:
//   401: Token não encontrado ou expirado
//   500: Erro ao buscar do ML
router.get('/api/ml/item-details/:mlItemId', async (req, res) => {
  try {
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: parseInt(req.query.userId) } });
    if (!token) return res.status(401).json({ error: 'Não autorizado' });
    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` } });
    const [itemRes, descRes] = await Promise.all([ mlApi.get(`/items/${req.params.mlItemId}`), mlApi.get(`/items/${req.params.mlItemId}/description`).catch(() => ({ data: { plain_text: 'Descrição não disponível.' } })) ]);
    res.json({ ...itemRes.data, description_text: descRes.data.plain_text });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar detalhes.' }); }
});



// ═════════════════════════════════════════════════════════════════════════════════
// 🤖 BOT E MONITORAMENTO CONTÍNUO — Streaming de eventos SSE
// ═════════════════════════════════════════════════════════════════════════════════

// GET /api/bot/stream
// ─────────────────────────────────────────────────────────────────────────────
// WebSocket-like streaming (Server-Sent Events) que envia atualizações do bot
// em tempo real. Frontend conecta aqui e recebe eventos: processando, erro,
// divergência encontrada, etc.
//
// Fluxo:
// 1. Frontend abre conexão GET /api/bot/stream?userId={id}
// 2. Este endpoint seta headers SSE (text/event-stream)
// 3. Chama runBot({userId}, {modoLento}) que executa a IA
// 4. Enquanto corre, envia eventos: { type, msg, dados... }
// 5. Quando termina, fecha conexão ou envia type=complete
//
// Query params:
//   @userId (required) - ID do usuário
//   @modoLento (optional) - 'true' para modo análise profunda (mais tempo/recursos)
//
// Headers SSE:
//   • Content-Type: text/event-stream
//   • Cache-Control: no-cache
//   • Connection: keep-alive
//
// Eventos possíveis:
//   {type: 'info', msg: 'Iniciando análise...'}
//   {type: 'divergencia', titulo: 'Item X', pesoLocal: 500, pesoMl: 1000, etc}
//   {type: 'erro', msg: 'Erro ao processar'}
//   {type: 'complete', msg: 'Análise concluída'}
//
// Nota: Cada cliente SSE cria sua própria conexão. Múltiplos usuários rodando
// bot simultâneamente = múltiplas instâncias do runBot()
router.get('/api/bot/stream', (req, res) => {
  // ─ Configurar headers SSE
  res.setHeader('Content-Type', 'text/event-stream'); 
  res.setHeader('Cache-Control', 'no-cache'); 
  res.setHeader('Connection', 'keep-alive'); 
  res.flushHeaders();
  
  // ─ Registrar cliente para receber eventos
  addSseClient(res); 
  
  // ─ Iniciar bot com modo lento opcional
  runBot(parseInt(req.query.userId), req.query.modoLento === 'true')
    .catch(err => res.write(`data: ${JSON.stringify({ type: 'error', msg: 'Erro: ' + err.message })}\n\n`));
});

router.get('/api/agendador', async (req, res) => {
  try { res.json(await prisma.agendadorConfig.findUnique({ where: { usuarioId: parseInt(req.query.userId) } }) || { ativo: false, intervalo: 360, ultimaExecucao: null, proximaExecucao: null }); } catch { res.status(500).json({ error: 'Erro.' }); }
});

router.put('/api/agendador', async (req, res) => {
  try {
    const { userId, ativo, intervalo } = req.body;
    const uid = parseInt(userId); const intMin = Math.max(30, parseInt(intervalo) || 360);
    const config = await prisma.agendadorConfig.upsert({ where: { usuarioId: uid }, update: { ativo, intervalo: intMin, proximaExecucao: ativo ? new Date(Date.now() + intMin * 60000) : null }, create: { usuarioId: uid, ativo, intervalo: intMin, proximaExecucao: ativo ? new Date(Date.now() + intMin * 60000) : null } });
    await iniciarAgendadorUsuario(uid); res.json(config);
  } catch { res.status(500).json({ error: 'Erro.' }); }
});


router.get('/api/anuncios', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: userId } });
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    if (new Date() >= new Date(token.expiresAt)) return res.status(401).json({ error: 'Sessão expirada.' });

    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` } });
    
    const searchRes = await mlApi.get(`/users/${token.mlUserId}/items/search?limit=50`);
    const ids = searchRes.data.results || [];

    if (ids.length === 0) return res.json([]);

    const itemsRes = await mlApi.get(`/items?ids=${ids.join(',')}`);
    const itemsData = itemsRes.data;

    const anunciosTratados = itemsData.map(item => {
      const b = item.body;
      const getAttr = (id) => b.attributes?.find(a => a.id === id)?.value_name || null;

      let peso = getAttr('PACKAGE_WEIGHT');
      let comprimento = getAttr('PACKAGE_LENGTH');
      let altura = getAttr('PACKAGE_HEIGHT');
      let largura = getAttr('PACKAGE_WIDTH');

      if (b.shipping?.dimensions) {
        const parts = b.shipping.dimensions.split(',');
        if (parts.length === 2) {
          const dimParts = parts[0].split('x');
          if (dimParts.length === 3) {
            if(!altura) altura = dimParts[0] + ' cm';
            if(!largura) largura = dimParts[1] + ' cm';
            if(!comprimento) comprimento = dimParts[2] + ' cm';
          }
          if(!peso) peso = parts[1] + ' g';
        }
      }

      let tipoNome = b.listing_type_id === 'gold_pro' ? 'Premium' : (b.listing_type_id === 'gold_special' ? 'Clássico' : 'Grátis');

      return {
        id: b.id,
        titulo: b.title,
        sku: b.seller_custom_field || '',
        status: b.status,
        preco: b.price,
        estoque: b.available_quantity,
        ean: getAttr('GTIN') || getAttr('EAN') || null,
        marca: getAttr('BRAND') || null, 
        modelo: getAttr('MODEL') || null, 
        peso: peso ? parseInt(peso.replace(/\D/g, '')) : 0,
        dimensoes: { altura, largura, comprimento },
        thumbnail: b.thumbnail || null, 
        link: b.permalink,
        tipoAnuncio: tipoNome,
        catalogo: b.catalog_listing || false
      };
    });

    res.json(anunciosTratados);
  } catch (error) {
    console.error("Erro /api/anuncios:", error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/anuncios/:id', async (req, res) => {
  try {
    const userId = parseInt(req.body.userId || req.query.userId); // Pega do body ou query
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: userId } });
    if (!token) return res.status(401).json({ error: 'Sessão expirada.' });
    if (new Date() >= new Date(token.expiresAt)) return res.status(401).json({ error: 'Sessão expirada no ML.' });

    const { id } = req.params;
    const { preco, estoque, atributosFicha } = req.body;

    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` } });

    const itemRes = await mlApi.get(`/items/${id}`);
    const itemData = itemRes.data;

    const updateData = {};
    
    if (atributosFicha && Object.keys(atributosFicha).length > 0) {
      let attributes = [];
      if (atributosFicha.ean !== undefined) attributes.push({ id: 'GTIN', value_name: String(atributosFicha.ean) });
      if (atributosFicha.marca !== undefined) attributes.push({ id: 'BRAND', value_name: String(atributosFicha.marca) });
      if (atributosFicha.modelo !== undefined) attributes.push({ id: 'MODEL', value_name: String(atributosFicha.modelo) });
      if (atributosFicha.peso !== undefined) attributes.push({ id: 'PACKAGE_WEIGHT', value_name: `${atributosFicha.peso} g` });
      if (atributosFicha.altura !== undefined) attributes.push({ id: 'PACKAGE_HEIGHT', value_name: `${atributosFicha.altura} cm` });
      if (atributosFicha.largura !== undefined) attributes.push({ id: 'PACKAGE_WIDTH', value_name: `${atributosFicha.largura} cm` });
      if (atributosFicha.comprimento !== undefined) attributes.push({ id: 'PACKAGE_LENGTH', value_name: `${atributosFicha.comprimento} cm` });
      
      updateData.attributes = attributes;
    }

    if (itemData.variations && itemData.variations.length > 0) {
      updateData.variations = itemData.variations.map(vari => {
        const varUpdate = { id: vari.id };
        if (preco !== undefined && preco !== '') varUpdate.price = Number(preco);
        if (estoque !== undefined && estoque !== '') varUpdate.available_quantity = Number(estoque);
        return varUpdate;
      });
    } else {
      if (preco !== undefined && preco !== '') updateData.price = Number(preco);
      if (estoque !== undefined && estoque !== '') updateData.available_quantity = Number(estoque);
    }

    const response = await mlApi.put(`/items/${id}`, updateData);
    res.json({ success: true, message: 'Atualizado com sucesso!' });
  } catch (error) {
    let msgErro = error.response?.data?.message || error.message;
    if (error.response?.data?.cause && error.response.data.cause.length > 0) {
        msgErro = error.response.data.cause.map(c => c.message).join(' | ');
    }
    console.error(`Erro /api/anuncios/${req.params.id}:`, msgErro);
    res.status(500).json({ error: msgErro });
  }
});

// Adicione esta rota se não tiver para simular o logout do MVP
router.post('/api/ml/logout', async (req, res) => {
    try {
      const userId = parseInt(req.body.userId || req.query.userId);
      await prisma.mlToken.deleteMany({ where: { usuarioId: userId } });
      res.json({ success: true, message: 'Desconectado com sucesso.' });
    } catch {
      res.status(500).json({ error: 'Erro ao desconectar' });
    }
});


// ============================================================================
// ROTAS DE AUDITORIA E ATUALIZAÇÃO (HUB MERCADO LIVRE)
// ============================================================================

// 1. Desconectar conta do ML
router.post('/api/ml/logout', async (req, res) => {
  try {
    const userId = parseInt(req.body.userId || req.query.userId);
    await prisma.mlToken.deleteMany({ where: { usuarioId: userId } });
    res.json({ success: true, message: 'Desconectado com sucesso.' });
  } catch {
    res.status(500).json({ error: 'Erro ao desconectar' });
  }
});

// 2. Buscar Anúncios com Ficha Técnica Completa e Dimensões Logísticas
router.get('/api/anuncios', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: userId } });
    
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    if (new Date() >= new Date(token.expiresAt)) return res.status(401).json({ error: 'Sessão expirada.' });

    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` } });
    
    const searchRes = await mlApi.get(`/users/${token.mlUserId}/items/search?limit=50`);
    const ids = searchRes.data.results || [];

    if (ids.length === 0) return res.json([]);

    // Usa o Multiget do ML para buscar os detalhes de todos os IDs de uma vez
    const itemsRes = await mlApi.get(`/items?ids=${ids.join(',')}`);
    const itemsData = itemsRes.data;

    const anunciosTratados = itemsData.map(item => {
      const b = item.body;
      const getAttr = (id) => b.attributes?.find(a => a.id === id)?.value_name || null;

      let peso = getAttr('PACKAGE_WEIGHT');
      let comprimento = getAttr('PACKAGE_LENGTH');
      let altura = getAttr('PACKAGE_HEIGHT');
      let largura = getAttr('PACKAGE_WIDTH');

      // Tenta extrair das dimensões de envio caso não existam nos atributos
      if (b.shipping?.dimensions) {
        const parts = b.shipping.dimensions.split(',');
        if (parts.length === 2) {
          const dimParts = parts[0].split('x');
          if (dimParts.length === 3) {
            if(!altura) altura = dimParts[0] + ' cm';
            if(!largura) largura = dimParts[1] + ' cm';
            if(!comprimento) comprimento = dimParts[2] + ' cm';
          }
          if(!peso) peso = parts[1] + ' g';
        }
      }

      let tipoNome = b.listing_type_id === 'gold_pro' ? 'Premium' : (b.listing_type_id === 'gold_special' ? 'Clássico' : 'Grátis');

      return {
        id: b.id,
        titulo: b.title,
        sku: b.seller_custom_field || '',
        status: b.status,
        preco: b.price,
        estoque: b.available_quantity,
        ean: getAttr('GTIN') || getAttr('EAN') || null,
        marca: getAttr('BRAND') || null, 
        modelo: getAttr('MODEL') || null, 
        peso: peso ? parseInt(peso.replace(/\D/g, '')) : 0,
        dimensoes: { altura, largura, comprimento },
        thumbnail: b.thumbnail || null, 
        link: b.permalink,
        tipoAnuncio: tipoNome,
        catalogo: b.catalog_listing || false
      };
    });

    res.json(anunciosTratados);
  } catch (error) {
    console.error("Erro em GET /api/anuncios:", error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// 3. Atualizar Preço, Estoque e Atributos da Ficha Técnica (Com proteção Anti-Erro 500)
router.put('/api/anuncios/:id', async (req, res) => {
  try {
    const userId = parseInt(req.body.userId || req.query.userId);
    const token = await prisma.mlToken.findUnique({ where: { usuarioId: userId } });
    
    if (!token) return res.status(401).json({ error: 'Sessão expirada.' });
    if (new Date() >= new Date(token.expiresAt)) return res.status(401).json({ error: 'Sessão expirada no ML.' });

    const { id } = req.params;
    const { preco, estoque, atributosFicha } = req.body;

    const mlApi = axios.create({ baseURL: 'https://api.mercadolibre.com', headers: { Authorization: `Bearer ${token.accessToken}` } });

    // Primeiro busca o anúncio para verificar variações
    const itemRes = await mlApi.get(`/items/${id}`);
    const itemData = itemRes.data;

    const updateData = {};
    
    // Tratamento dos Atributos Logísticos e Ficha Técnica
    if (atributosFicha && Object.keys(atributosFicha).length > 0) {
      let attributes = [];
      if (atributosFicha.ean !== undefined) attributes.push({ id: 'GTIN', value_name: String(atributosFicha.ean) });
      if (atributosFicha.marca !== undefined) attributes.push({ id: 'BRAND', value_name: String(atributosFicha.marca) });
      if (atributosFicha.modelo !== undefined) attributes.push({ id: 'MODEL', value_name: String(atributosFicha.modelo) });
      if (atributosFicha.peso !== undefined) attributes.push({ id: 'PACKAGE_WEIGHT', value_name: `${atributosFicha.peso} g` });
      if (atributosFicha.altura !== undefined) attributes.push({ id: 'PACKAGE_HEIGHT', value_name: `${atributosFicha.altura} cm` });
      if (atributosFicha.largura !== undefined) attributes.push({ id: 'PACKAGE_WIDTH', value_name: `${atributosFicha.largura} cm` });
      if (atributosFicha.comprimento !== undefined) attributes.push({ id: 'PACKAGE_LENGTH', value_name: `${atributosFicha.comprimento} cm` });
      
      updateData.attributes = attributes;
    }

    // Tratamento de Preço e Estoque (Respeitando variações)
    if (itemData.variations && itemData.variations.length > 0) {
      updateData.variations = itemData.variations.map(vari => {
        const varUpdate = { id: vari.id };
        if (preco !== undefined && preco !== '') varUpdate.price = Number(preco);
        if (estoque !== undefined && estoque !== '') varUpdate.available_quantity = Number(estoque);
        return varUpdate;
      });
    } else {
      if (preco !== undefined && preco !== '') updateData.price = Number(preco);
      if (estoque !== undefined && estoque !== '') updateData.available_quantity = Number(estoque);
    }

    // Dispara a atualização
    await mlApi.put(`/items/${id}`, updateData);
    res.json({ success: true, message: 'Atualizado com sucesso!' });

  } catch (error) {
    // Capturador avançado que extrai o motivo exato de bloqueio do Mercado Livre (o "cause")
    let msgErro = error.response?.data?.message || error.message;
    if (error.response?.data?.cause && error.response.data.cause.length > 0) {
        msgErro = error.response.data.cause.map(c => c.message).join(' | ');
    }
    console.error(`Erro PUT /api/anuncios/${req.params.id}:`, msgErro);
    res.status(500).json({ error: msgErro });
  }
});

export default router;