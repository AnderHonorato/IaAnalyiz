// backend/server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js'; // ← deve estar aqui

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// PROTEÇÃO ANTI-VAZAMENTO DE DADOS SENSÍVEIS
// Intercepta qualquer resposta que contenha variáveis de ambiente sensíveis
// e substitui por um placeholder antes de enviar ao cliente.
// ═══════════════════════════════════════════════════════════════════════════

// Lista de chaves sensíveis do .env que NUNCA devem aparecer em respostas
const SENSITIVE_KEYS = [
  'DATABASE_URL',
  'ML_APP_ID',
  'ML_SECRET_KEY',
  'GEMINI_API_KEY',
  'JWT_SECRET',
  'ML_REDIRECT_URI',
  'PORT',
];

// Coleta os valores reais das variáveis sensíveis (ignora undefined/vazios)
const SENSITIVE_VALUES = SENSITIVE_KEYS
  .map(k => process.env[k])
  .filter(v => v && v.length > 4); // ignora valores muito curtos para não falsear positivos

/**
 * Sanitiza qualquer string removendo valores sensíveis do .env.
 * Substitui o valor encontrado por [REDACTED].
 */
function sanitize(text) {
  if (typeof text !== 'string') return text;
  let safe = text;
  for (const val of SENSITIVE_VALUES) {
    // Escapa caracteres especiais de regex
    const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    safe = safe.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
  return safe;
}

/**
 * Sanitiza recursivamente um objeto/array/string.
 */
function sanitizeDeep(obj) {
  if (typeof obj === 'string') return sanitize(obj);
  if (Array.isArray(obj))  return obj.map(sanitizeDeep);
  if (obj && typeof obj === 'object') {
    const safe = {};
    for (const [k, v] of Object.entries(obj)) {
      safe[k] = sanitizeDeep(v);
    }
    return safe;
  }
  return obj;
}

/**
 * Middleware de proteção — envolve res.json para sanitizar antes de enviar.
 * Aplicado globalmente em TODAS as rotas.
 */
function antiLeakMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    const safe = sanitizeDeep(data);
    return originalJson(safe);
  };

  // Também protege res.send para respostas de texto/HTML
  const originalSend = res.send.bind(res);
  res.send = function (data) {
    if (typeof data === 'string') {
      return originalSend(sanitize(data));
    }
    return originalSend(data);
  };

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE AMBIENTE NA INICIALIZAÇÃO
// Alerta no terminal se variáveis críticas estiverem ausentes.
// ═══════════════════════════════════════════════════════════════════════════
const REQUIRED_ENV = ['ML_APP_ID', 'ML_SECRET_KEY', 'ML_REDIRECT_URI'];
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.warn(`⚠️  Variáveis de ambiente ausentes: ${missingEnv.join(', ')}`);
  console.warn('   Algumas funcionalidades podem não funcionar corretamente.');
}

// ═══════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
app.use(cors());
app.use(express.json());

// Aplica proteção anti-vazamento em TODAS as rotas
app.use(antiLeakMiddleware);

const ML_API = 'https://api.mercadolibre.com';

let sessoes = { accessToken: null, nickname: null };

app.get('/api/ml/auth-url', (req, res) => {
  const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_APP_ID}&redirect_uri=${encodeURIComponent(process.env.ML_REDIRECT_URI)}`;
  res.json({ url });
});

app.get('/api/ml/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokenRes = await fetch(`${ML_API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: process.env.ML_APP_ID,
        client_secret: process.env.ML_SECRET_KEY, code: code, redirect_uri: process.env.ML_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.message);

    sessoes.accessToken = tokenData.access_token;
    const meRes = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${sessoes.accessToken}` } });
    const me = await meRes.json();
    sessoes.nickname = me.nickname;

    res.redirect('http://localhost:5173/?auth=success');
  } catch (error) {
    // Nunca expõe o erro bruto — pode conter client_secret
    console.error('[callback] Erro interno:', error.message);
    res.redirect('http://localhost:5173/?auth=error');
  }
});

app.get('/api/status', (req, res) => {
  res.json({ connected: !!sessoes.accessToken, nickname: sessoes.nickname });
});

app.post('/api/ml/logout', (req, res) => {
  sessoes.accessToken = null;
  sessoes.nickname = null;
  res.json({ success: true, message: 'Desconectado com sucesso.' });
});

app.get('/api/anuncios', async (req, res) => {
  if (!sessoes.accessToken) return res.status(401).json({ error: 'Não autenticado.' });

  try {
    const headers = { Authorization: `Bearer ${sessoes.accessToken}` };
    const meRes = await fetch(`${ML_API}/users/me`, { headers });
    if (meRes.status === 401) throw new Error('Sessão expirada no ML.');
    const me = await meRes.json();
    
    const searchRes = await fetch(`${ML_API}/users/${me.id}/items/search?limit=50`, { headers });
    const search = await searchRes.json();
    const ids = search.results || [];

    if (ids.length === 0) return res.json([]);

    const itemsRes = await fetch(`${ML_API}/items?ids=${ids.join(',')}`, { headers });
    const itemsData = await itemsRes.json();

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
            if (!altura) altura = dimParts[0] + ' cm';
            if (!largura) largura = dimParts[1] + ' cm';
            if (!comprimento) comprimento = dimParts[2] + ' cm';
          }
          if (!peso) peso = parts[1] + ' g';
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
    console.error('[GET /api/anuncios]', error.message);
    // Nunca expõe error.message bruto ao cliente — pode conter tokens
    res.status(500).json({ error: 'Erro ao buscar anúncios. Verifique a conexão com o ML.' });
  }
});

app.put('/api/anuncios/:id', async (req, res) => {
  if (!sessoes.accessToken) return res.status(401).json({ error: 'Sessão expirada.' });
  const { id } = req.params;
  const { preco, estoque, atributosFicha } = req.body;

  try {
    const headers = { 'Authorization': `Bearer ${sessoes.accessToken}`, 'Content-Type': 'application/json' };
    const itemRes = await fetch(`${ML_API}/items/${id}`, { headers });
    
    if (itemRes.status === 401) throw new Error('Sessão expirada no ML.');
    const itemData = await itemRes.json();

    if (itemData.error) throw new Error(itemData.message);

    const updateData = {};
    
    if (atributosFicha && Object.keys(atributosFicha).length > 0) {
      let attributes = [];
      if (atributosFicha.ean !== undefined)         attributes.push({ id: 'GTIN',           value_name: String(atributosFicha.ean) });
      if (atributosFicha.marca !== undefined)       attributes.push({ id: 'BRAND',          value_name: String(atributosFicha.marca) });
      if (atributosFicha.modelo !== undefined)      attributes.push({ id: 'MODEL',          value_name: String(atributosFicha.modelo) });
      if (atributosFicha.peso !== undefined)        attributes.push({ id: 'PACKAGE_WEIGHT', value_name: `${atributosFicha.peso} g` });
      if (atributosFicha.altura !== undefined)      attributes.push({ id: 'PACKAGE_HEIGHT', value_name: `${atributosFicha.altura} cm` });
      if (atributosFicha.largura !== undefined)     attributes.push({ id: 'PACKAGE_WIDTH',  value_name: `${atributosFicha.largura} cm` });
      if (atributosFicha.comprimento !== undefined) attributes.push({ id: 'PACKAGE_LENGTH', value_name: `${atributosFicha.comprimento} cm` });
      
      updateData.attributes = attributes;
    }

    if (itemData.variations && itemData.variations.length > 0) {
      updateData.variations = itemData.variations.map(vari => {
        const varUpdate = { id: vari.id };
        if (preco !== undefined && preco !== '')   varUpdate.price = Number(preco);
        if (estoque !== undefined && estoque !== '') varUpdate.available_quantity = Number(estoque);
        return varUpdate;
      });
    } else {
      if (preco !== undefined && preco !== '')   updateData.price = Number(preco);
      if (estoque !== undefined && estoque !== '') updateData.available_quantity = Number(estoque);
    }

    const response = await fetch(`${ML_API}/items/${id}`, { method: 'PUT', headers, body: JSON.stringify(updateData) });
    const data = await response.json();
    
    if (data.error) {
      let msgErro = data.message;
      if (data.cause && data.cause.length > 0) msgErro = data.cause.map(c => c.message).join(' | '); 
      throw new Error(msgErro);
    }

    res.json({ success: true, message: 'Atualizado com sucesso!' });
  } catch (error) {
    console.error(`[PUT /api/anuncios/${id}]`, error.message);
    // Sanitiza antes de enviar: remove qualquer token/secret que possa ter vazado no erro
    res.status(500).json({ error: sanitize(error.message) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));