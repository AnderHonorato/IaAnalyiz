// backend/src/server.js
import express    from 'express';
import cors       from 'cors';
import dotenv     from 'dotenv';

dotenv.config();

// ── Routers ──────────────────────────────────────────────────────────────────
import authRoutes        from './routes/authRoutes.js';
import mlRoutes          from './routes/mlRoutes.js';
import divergenciasRoutes from './routes/divergenciasRoutes.js';
import iaRoutes          from './routes/iaRoutes.js';
import mlPrecosRoutes    from './routes/mlPrecosRoutes.js';
  import sessaoRoutes from './authRoutes.js';
// ═══════════════════════════════════════════════════════════════════════════
// PROTEÇÃO ANTI-VAZAMENTO DE DADOS SENSÍVEIS
// Intercepta qualquer resposta que contenha variáveis de ambiente sensíveis
// e substitui por um placeholder antes de enviar ao cliente.
// ══════════════════════════════════

const SENSITIVE_KEYS = [
  'DATABASE_URL',
  // 'ML_APP_ID' — NÃO inclua: é o client_id público do OAuth, precisa trafegar na URL
  'ML_SECRET_KEY',
  'GEMINI_API_KEY',
  'JWT_SECRET',
  'ML_REDIRECT_URI',
];

const SENSITIVE_VALUES = SENSITIVE_KEYS
  .map(k => process.env[k])
  .filter(v => v && v.length > 4);

function sanitize(text) {
  if (typeof text !== 'string') return text;
  let safe = text;
  for (const val of SENSITIVE_VALUES) {
    const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    safe = safe.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
  return safe;
}

function sanitizeDeep(obj) {
  if (typeof obj === 'string')  return sanitize(obj);
  if (Array.isArray(obj))       return obj.map(sanitizeDeep);
  if (obj && typeof obj === 'object') {
    const safe = {};
    for (const [k, v] of Object.entries(obj)) safe[k] = sanitizeDeep(v);
    return safe;
  }
  return obj;
}

function antiLeakMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    return originalJson(sanitizeDeep(data));
  };

  const originalSend = res.send.bind(res);
  res.send = function (data) {
    if (typeof data === 'string') return originalSend(sanitize(data));
    return originalSend(data);
  };

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE AMBIENTE NA INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════
const REQUIRED_ENV = ['ML_APP_ID', 'ML_SECRET_KEY', 'ML_REDIRECT_URI', 'DATABASE_URL'];
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Proteção anti-vazamento em TODAS as rotas
app.use(antiLeakMiddleware);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Routers registrados ───────────────────────────────────────────────────────
app.use(authRoutes);                          // /api/auth/* e /api/usuarios/*
app.use(mlRoutes);                            // /api/ml/*, /api/bot/*, /api/agendador, /api/anuncios
app.use(divergenciasRoutes);                  // /api/divergencias/*, /api/produtos/*, /api/ml/avisos/*
app.use(iaRoutes);                            // /api/ia/*, /api/chat/*
app.use('/api/ml/precos', mlPrecosRoutes);    // /api/ml/precos/*

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER GLOBAL DE ERROS
// Captura qualquer erro não tratado nas rotas e retorna JSON seguro.
// ═══════════════════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  // PayloadTooLarge
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload muito grande. Reduza o tamanho da requisição.' });
  }

  // SyntaxError no body JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }

  // Erro genérico — sanitiza antes de expor
  console.error('[GlobalErrorHandler]', err.message);
  res.status(err.status || 500).json({ error: sanitize(err.message || 'Erro interno do servidor.') });
});

// ── 404 para rotas não mapeadas ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// ═══════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  console.log(`   Routers: auth | ml | divergencias | ia | ml/precos`);
});

// Evita crash por erros não capturados
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});