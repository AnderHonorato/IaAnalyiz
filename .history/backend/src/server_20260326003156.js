// backend/src/server.js — COMPLETO
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';

dotenv.config();

// ── Routers ───────────────────────────────────────────────────────────────────
import authRoutes            from './routes/authRoutes.js';
import mlRoutes              from './routes/mlRoutes.js';
import divergenciasRoutes    from './routes/divergenciasRoutes.js';
import iaProativaRoutes, { limparNotificacoesAntigas } from './routes/iaProativaRoutes.js'; 
import iaRoutes              from './routes/iaRoutes.js';
import iaFeedbackRoutes      from './routes/iaFeedbackRoutes.js'; // ← NOVA ROTA
import mlPrecosRoutes        from './routes/mlPrecosRoutes.js';
import sessaoRoutes, { limparSessoesAntigas } from './routes/sessaoRoutes.js';
import mlResearchRoutes      from './routes/mlResearchRoutes.js';
import mlAnunciosRoutes      from './routes/Mlanunciosroutes.js';

// ── Sistema de aprendizado da IA ──────────────────────────────────────────────
import { iniciarLoopAprendizado } from './ia/brain/iaBrain.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PROTEÇÃO ANTI-VAZAMENTO DE DADOS SENSÍVEIS
// ═══════════════════════════════════════════════════════════════════════════════

const SENSITIVE_KEYS = [
  'DATABASE_URL',
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
  if (typeof obj === 'string')        return sanitize(obj);
  if (Array.isArray(obj))             return obj.map(sanitizeDeep);
  if (obj && typeof obj === 'object') {
    const safe = {};
    for (const [k, v] of Object.entries(obj)) safe[k] = sanitizeDeep(v);
    return safe;
  }
  return obj;
}

function antiLeakMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (data) { return originalJson(sanitizeDeep(data)); };
  const originalSend = res.send.bind(res);
  res.send = function (data) {
    if (typeof data === 'string') return originalSend(sanitize(data));
    return originalSend(data);
  };
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE AMBIENTE
// ═══════════════════════════════════════════════════════════════════════════════

const REQUIRED_ENV = ['ML_APP_ID', 'ML_SECRET_KEY', 'ML_REDIRECT_URI', 'DATABASE_URL'];
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.warn(`⚠️  Variáveis de ambiente ausentes: ${missingEnv.join(', ')}`);
  console.warn('   Algumas funcionalidades podem não funcionar corretamente.');
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP EXPRESS
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(antiLeakMiddleware);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Routers ───────────────────────────────────────────────────────────────────

app.use(authRoutes);                        
app.use(mlRoutes);                          
app.use(divergenciasRoutes);                
app.use(iaProativaRoutes);                  
app.use(iaRoutes);                          
app.use(iaFeedbackRoutes); // ← ROTA INJETADA AQUI               
app.use('/api/ml/precos', mlPrecosRoutes);  
app.use(sessaoRoutes);                      
app.use(mlResearchRoutes);                  
app.use(mlAnunciosRoutes);                  

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER GLOBAL DE ERROS
// ═══════════════════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload muito grande.' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON inválido.' });
  }
  console.error('[GlobalErrorHandler]', err.message);
  res.status(err.status || 500).json({ error: sanitize(err.message || 'Erro interno.') });
});

app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// ═══════════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log('');
  console.log(`\x1b[32m🚀 Backend rodando na porta ${PORT}\x1b[0m`);
  console.log(`   Routers: auth | ml | divergencias | ia-proativa | ia | feedbacks | ml/precos | sessao | ml/research | ml/anuncios`);
  console.log('');

  iniciarLoopAprendizado().catch(e => {
    console.error('\x1b[31m[IA-Brain] Falha ao iniciar loop:', e.message, '\x1b[0m');
  });

  console.log(`\x1b[36m🧠 IA Learning Loop: primeiro ciclo em 30s...\x1b[0m`);
  console.log('');
});

// ── Jobs periódicos ───────────────────────────────────────────────────────────

setInterval(() => {
  limparSessoesAntigas().catch(() => {});
}, 60 * 60 * 1000);

setInterval(() => {
  limparNotificacoesAntigas().catch(() => {});
}, 24 * 60 * 60 * 1000);

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});