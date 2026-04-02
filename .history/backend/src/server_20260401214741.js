// ═══════════════════════════════════════════════════════════════════════════════
// SERVER.JS — Bot ML Backend + IA Analyiz (Anderson Honorato)
// ═══════════════════════════════════════════════════════════════════════════════
// Arquivo principal do servidor Express que orquestra todas as rotas, middlewares
// e sistemas do bot. Inclui proteção contra vazamento de dados, validação de env
// e integração com sistema de aprendizado autônomo da IA.
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';

// Carrega variáveis de ambiente do arquivo .env
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAÇÃO DE ROTAS
// ─────────────────────────────────────────────────────────────────────────────
// Cada módulo de rota agrupa endpoints por funcionalidade/domínio.
import authRoutes            from './routes/authRoutes.js';            // Autenticação e gerenciamento de usuários
import mlRoutes              from './routes/mlRoutes.js';              // Integração com API do Mercado Livre
import divergenciasRoutes    from './routes/divergenciasRoutes.js';    // Detecção e correção de divergências
import iaProativaRoutes, { limparNotificacoesAntigas } from './routes/iaProativaRoutes.js'; // Sugestões automáticas da IA
import iaRoutes              from './routes/iaRoutes.js';              // Chat com a IA e respostas inteligentes
import iaFeedbackRoutes      from './routes/iaFeedbackRoutes.js';      // Feedback do usuário sobre respostas da IA
import mlPrecosRoutes        from './routes/mlPrecosRoutes.js';        // Gestão e histórico de preços
import sessaoRoutes, { limparSessoesAntigas } from './routes/sessaoRoutes.js'; // Rastreamento de sessões de usuário
import mlResearchRoutes      from './routes/mlResearchRoutes.js';      // Pesquisa e análise de mercado
import mlAnunciosRoutes      from './routes/Mlanunciosroutes.js';      // Gestão de anúncios sincronizados com ML

// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE APRENDIZADO AUTÔNOMO DA IA
// ─────────────────────────────────────────────────────────────────────────────
// Loop contínuo que faz a IA aprender de forma autônoma e validar seus conhecimentos.
import { iniciarLoopAprendizado } from './ia/brain/iaBrain.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PROTEÇÃO CONTRA VAZAMENTO DE DADOS SENSÍVEIS
// ═══════════════════════════════════════════════════════════════════════════════
// Middleware crítico que sanitiza todos os logs e responses para evitar
// exposição de tokens, chaves e credenciais em mensagens de erro.

const SENSITIVE_KEYS = [
  'DATABASE_URL',        // URL de conexão com banco de dados
  'ML_SECRET_KEY',       // Chave secreta do Mercado Livre
  'GEMINI_API_KEY',      // Chave de API (substituída após mudança)
  'JWT_SECRET',          // Chave para assinatura de JWTs
  'ML_REDIRECT_URI',     // URI sensível de OAuth
];

// Extrai valores reais das variáveis de ambiente que precisam ser sanitizados
const SENSITIVE_VALUES = SENSITIVE_KEYS
  .map(k => process.env[k])
  .filter(v => v && v.length > 4);

/**
 * Sanitiza um texto simples ao remover todos os valores sensíveis.
 * Substitui credenciais por "[REDACTED]" em logs e responses.
 * @param {string} text - Texto potencialmente contendo dados sensíveis
 * @returns {string} Texto sanitizado
 */
function sanitize(text) {
  if (typeof text !== 'string') return text;
  let safe = text;
  for (const val of SENSITIVE_VALUES) {
    const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    safe = safe.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
  return safe;
}

/**
 * Sanitiza objetos complexos recursivamente (arrays, objetos aninhados, etc).
 * Garante que nenhum valor sensível vaze em responses JSON.
 * @param {*} obj - Objeto potencialmente contendo dados sensíveis
 * @returns {*} Objeto sanitizado
 */
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

/**
 * Middleware Express que intercepta res.json() e res.send() para sanitizar automaticamente.
 * Executado em TODAS as responses: protege contra vazamentos acidentais.
 * @param {Object} req - Objeto request Express
 * @param {Object} res - Objeto response Express
 * @param {Function} next - Próximo middleware
 */
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
// VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
// ═══════════════════════════════════════════════════════════════════════════════
// Verifica se os valores obrigatórios foram configurados no arquivo .env
// Avisa o desenvolvedor se algo importante está faltando.

const REQUIRED_ENV = ['ML_APP_ID', 'ML_SECRET_KEY', 'ML_REDIRECT_URI', 'DATABASE_URL'];
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.warn(`⚠️  Variáveis de ambiente ausentes: ${missingEnv.join(', ')}`);
  console.warn('   Algumas funcionalidades podem não funcionar corretamente.');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO DO APP EXPRESS
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();

// Middlewares de configuração global
app.use(cors());                                                  // Permite requisições de qualquer origem
app.use(express.json({ limit: '50mb' }));                       // Parser JSON com limite de 50MB (para uploads de imagens)
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parser de URLencoded com mesmo limite
app.use(antiLeakMiddleware);                                     // Sanitiza automaticamente TODAS as responses

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint simples para monitoramento e teste de conectividade do backend.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DE ROTAS
// ─────────────────────────────────────────────────────────────────────────────
// Cada app.use() "monta" um grupo de rotas do módulo especificado.
// A ordem importa: rotas mais específicas devem vir após as genéricas.

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
  console.log('[server.js] Backend started on port ' + PORT);
  console.log('[server.js] Routers: auth ml divergencias ia-proativa ia feedbacks ml-precos sessao ml-research ml-anuncios');

  iniciarLoopAprendizado().catch(e => {
    console.error('[IA-Brain] Failed to start learning loop:', e.message);
  });

  console.log('[server.js] IA learning loop starting in 30s');
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