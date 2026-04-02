# Bot ML - Documentação Consolidada do Projeto

**Status:** ✅ Backend 80% + Frontend 100% Documentados  
**Data:** 2024  
**Autor:** Anderson Honorato

---

## 1. Visão Geral do Projeto

### O que é o Bot ML?
Plataforma integrada de IA para gerenciamento de vendas em Mercado Livre, Shopee e Amazon.
- **Backend**: Node.js/Express com Prisma ORM
- **Frontend**: React com Vite
- **IA**: Sistema multi-agentes com Gemini API
- **Autenticação**: OAuth Mercado Livre

### Principais Features
- ✅ Chat com IA Analyiz (multi-agentes)
- ✅ Auditoria de fretes (Radar de Fretes)
- ✅ Precificação automática
- ✅ Pesquisa competitiva
- ✅ Gerencimento de utilizadores (OWNER/ADMIN)
- 🔄 Integração Shopee (em desenvolvimento)
- 🔄 Integração Amazon (em desenvolvimento)

---

## 2. Estrutura Geral do Projeto

```
projeto-bot-ml/
├── backend/
│   ├── src/
│   │   ├── server.js          # Servidor Express
│   │   ├── iaService.js       # Serviço de IA
│   │   ├── mlService.js       # Serviço Mercado Livre
│   │   ├── ia-engine/         # Motor de IA
│   │   │   ├── chatEngine.js
│   │   │   ├── knowledge.js
│   │   │   ├── learner.js
│   │   │   └── ...
│   │   ├── routes/            # Rotas API
│   │   └── services/          # Serviços
│   ├── prisma/
│   │   ├── schema.prisma      # Modelo de dados
│   │   └── migrations/        # Migrações
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Routing principal
│   │   ├── pages/             # Páginas da aplicação
│   │   │   ├── Login.jsx
│   │   │   ├── Home.jsx
│   │   │   ├── MLDashboard.jsx
│   │   │   └── ...
│   │   ├── components/        # Componentes React
│   │   │   ├── IaAnalyizChat.jsx
│   │   │   ├── Modal.jsx
│   │   │   └── ...
│   │   └── layouts/           # Layouts
│   ├── package.json
│   └── tailwind.config.js
│
├── DOCUMENTACAO_PROGRESS.md           # Backend progress
├── FRONTEND_DOCUMENTATION_COMPLETE.md # Frontend reference
└── README.md
```

---

## 3. Backend - Status de Documentação

### ✅ Rotas Documentadas (7/12)
1. **schema.prisma** - Todas as 15+ entidades documentadas
2. **divergenciasRoutes.js** - 5 seções, 15+ endpoints
3. **authRoutes.js** - Autenticação e perfil
4. **mlRoutes.js** - Integração Mercado Livre
5. **catalogRoutes.js** - Catálogo e produtos
6. **iaFeedbackRoutes.js** - Feedback de IA
7. **iaProativaRoutes.js** - Notificações proativas

### ⏳ Rotas com Documentação Pendente (5/12)
- iaRoutes.js (625 linhas) - Chat SSE principal
- mlPrecosRoutes.js - Precificação
- mlResearchRoutes.js - Pesquisa
- sessaoRoutes.js - Gerencimento de sessão
- Mlanunciosroutes.js - Anúncios

### ✅ Logging Refatorado (9/9 arquivos)
- Removido: Emojis, ANSI codes
- Adicionado: [filename.js] [timestamp] [LEVEL]
- Aplicado a: chatEngine, server, jobs, validator, learner, iaBrain, iaService, etc.

### 📊 Estatísticas Backend
- **Comentários JSDoc**: 200+ linhas
- **Rotas documentadas**: 7/12 (58%)
- **Logging production-ready**: 9/9 (100%)
- **Formato**: Portuguese JSDoc + inline

---

## 4. Frontend - Status de Documentação

### ✅ Páginas Documentadas (13/13 - 100%)
**Autenticação**: Login, Register, Recovery  
**Dashboard**: Home, MLDashboard  
**Mercado Livre**: MercadoLivre, Mlprecos, MlResearch, MeusAnuncios  
**Plataformas**: Shopee, Amazon (placeholders)  
**Administração**: Usuarios, FeedbacksIA  

### ✅ Componentes Documentados (8/11+)
**Chat/IA**: IaAnalyizChat, IaBrainPanel, IaThinkingPanel  
**Utilidade**: Modal, ErrorBoundary, ProfileModal  
**Visuais**: AgentConnectionVisual  

### 📊 Estatísticas Frontend
- **Páginas documentadas**: 13/13 (100%)
- **Componentes documentados**: 8/11 (75%)
- **Comentários JSDoc**: ~1,000+ linhas
- **Formato**: Portuguese JSDoc + inline + dividers

---

## 5. Sistema de Autenticação

### Fluxo de Login
1. Utilizador insere email/senha na página `/login`
2. Backend valida no `/api/auth/login`
3. Retorna JWT token + dados do utilizador
4. Token armazenado em `localStorage.analyiz_token`
5. Redireciona para Home `/`

### Guards de Rota (React Router)
```javascript
// PrivateRoute: Requer token válido
// AuthRoute: Redireciona utilizadores já autenticados
// OwnerRoute: Requer role === 'OWNER'
const { token } = localStorage.analyiz_token;
```

### Papéis (Roles)
- **OWNER**: Administrador completo
- **ADMIN**: Administrador limitado
- **USER**: Utilizador padrão
- **BLOCKED**: Bloqueado (sem acesso)

---

## 6. Sistema de IA Multi-Agentes

### Catálogo de 17 Agentes
1. **pesquisa** (🔍) - Busca web global - Azul
2. **validacao** (⚖️) - Validação de dados - Roxo
3. **banco** (🗄️) - BD interna - Verde
4. **seguranca** (🛡️) - Conformidade - Laranja
5. **programador** (📟) - Código - Vermelho
6. **imagem** (🖼️) - Design - Rosa
7. **video** (🎬) - Vídeos - Roxo scuro
8. **audio** (🎵) - Áudio - Turquesa
9. **estrategista** (📈) - Estratégia - Rosa claro
10. **seo** (🔎) - SEO - Amarelo
11. **logistica** (🚚) - ML Logística - Azul claro
12. **copywriter** (📣) - Marketing - Laranja
13. **analista** (📊) - Dados - Roxo
14. **sac** (🎧) - Suporte - Turquesa
15. **revisor** (📚) - Revisão - Verde claro
16. **concorrencia** (👁️) - Inteligência - Rosa
17. **padrao** (⚡) - Auxiliar - Índigo

### Fluxo de Chat
1. Utilizador envia mensagem no IaAnalyizChat
2. POST `/api/ia/chat` com mensagem
3. Backend seleciona agentes relevantes
4. Agentes processam em paralelo
5. Respostas chegam via SSE (streaming)
6. Frontend renderiza com typewriter effect

### Painéis de Visualização
- **IaThinkingPanel**: Mostra etapas do raciocínio
- **IaBrainPanel**: Métricas e conhecimento armazenado
- **AgentConnectionVisual**: Estado dos agentes ativos

---

## 7. Integração Mercado Livre

### OAuth Flow
1. Utilizador clica "Conectar ML"
2. Redireciona para `/api/ml/auth-url`
3. Mercado Livre authorization page
4. Callback retorna código
5. Backend troca por token OAuth
6. Token armazenado em BD

### Ferramentas Principais
| Ferramenta | Rota | Descrição |
|-----------|------|----------|
| Radar de Fretes | `/ml/auditoria` | Detecta divergências de peso |
| Precificação | `/ml/precos` | Altera preços via API |
| Meus Anúncios | `/ml/anuncios` | Lista próprios anúncios |
| Pesquisa | `/ml/pesquisa` | Analisa concorrentes |

### APIs Utilizadas
- `/api/ml/status` - Status de conexão OAuth
- `/api/ml/listings` - Listar anúncios
- `/api/ml/divergencias` - Divergências de peso
- `/api/ml/price-history` - Histórico de preços

---

## 8. Diagrama de Fluxo Principal

```
┌─────────────────────────────────────────────────────────────┐
│                    UTILIZADOR NO FRONTEND                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├─ Autentica em /login
                  │  └─ [Login.jsx] → /api/auth/login
                  │
                  ├─ Acede Home Dashboard
                  │  └─ [Home.jsx] → Escolhe plataforma
                  │
                  ├─ Usa Chat de IA
                  │  └─ [IaAnalyizChat] → /api/ia/chat (SSE)
                  │     ├─ IaThinkingPanel (mostra pensamento)
                  │     └─ IaBrainPanel (métricas)
                  │
                  └─ Acede Mercado Livre
                     ├─ [MLDashboard] → Conecta OAuth
                     ├─ [MercadoLivre] → Radar de Fretes
                     ├─ [Mlprecos] → Precificação
                     ├─ [MlResearch] → Pesquisa competitiva
                     └─ [MeusAnuncios] → Anúncios
```

---

## 9. Variáveis Importantes

### Backend
```javascript
// server.js
const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DATABASE_URL;
const API_KEY_GEMINI = process.env.GEMINI_API_KEY;
const MERCADO_LIVRE_CLIENT_ID = process.env.ML_CLIENT_ID;
```

### Frontend
```javascript
// Componentes usam:
const API_BASE_URL = 'http://localhost:3000';
const SESSION_KEY = 'analyiz_last_session_id';
const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutos
```

### LocalStorage Keys
- `analyiz_token` - JWT token
- `analyiz_user` - Dados do utilizador
- `analyiz_last_session_id` - Última sessão de chat
- `ml_precos_api_notice_count` - Avisos API

---

## 10. Padrões de Código

### Backend - Resposta Padrão
```javascript
// Sucesso
res.json({ success: true, data: {...}, message: 'OK' });

// Erro
res.status(400).json({ error: 'Mensagem de erro', code: 'ERROR_CODE' });
```

### Frontend - Fetch Padrão
```javascript
try {
  const res = await fetch(`${API_BASE_URL}/api/endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  // sucesso
} catch (err) {
  alert('Erro: ' + err.message);
}
```

### Logging Padrão
```javascript
// Novo padrão
console.log(`[filename.js] [${time}] [INFO] Mensagem aqui`);

// Tipos de log
console.log(`[chatEngine.js] [HH:MM:SS] [INFO] Mensagem`);
console.error(`[server.js] [HH:MM:SS] [ERROR] Erro crítico`);
```

---

## 11. Quick Reference

### Arquivos Chave Modificados

**Backend**
- ✅ schema.prisma - Documentado
- ✅ server.js - Logging atualizado
- ✅ chatEngine.js - Logging atualizado
- ✅ 7 route files - Documentados
- 🔄 5 route files - Pendentes

**Frontend**
- ✅ 13 páginas - Documentadas
- ✅ 8 componentes - Documentados
- 🔄 3 componentes - Pendentes
- ✅ App.jsx - Estrutura documentada

### Comandos Úteis (Backend)

```bash
# Iniciar servidor
npm start

# Ver logs
tail -f logs/*.log

# Prisma
npx prisma migrate dev --name "nome_migracao"
npx prisma studio
```

### Comandos Úteis (Frontend)

```bash
# Iniciar dev
npm run dev

# Build
npm run build

# Preview
npm run preview
```

---

## 12. Documentos de Referência

### Documentação Completa
- [FRONTEND_DOCUMENTATION_COMPLETE.md](FRONTEND_DOCUMENTATION_COMPLETE.md) - Frontend 100%
- [DOCUMENTACAO_HEADERS.md](backend/DOCUMENTACAO_HEADERS.md) - Backend templates
- [RELATORIO_DOCUMENTACAO.md](backend/RELATORIO_DOCUMENTACAO.md) - Backend relatório
- [DOCUMENTACAO_PROGRESS.md](backend/DOCUMENTACAO_PROGRESS.md) - Backend progress

### Arquivos-Chave (Referência)
- [Backend Schema](backend/prisma/schema.prisma) - Banco de dados
- [Frontend App.jsx](frontend/src/App.jsx) - Routing
- [IA Brain](backend/src/ia-engine/chatEngine.js) - Motor IA

---

## 13. Próximas Etapas

### Curto Prazo (Próximas Horas)
- [ ] Documentar componentes restantes do frontend
- [ ] Criar guia de contribuição
- [ ] Consolidar wiki do projeto

### Médio Prazo (Próximas Semanas)
- [ ] Completar documentação das 5 rotas backend
- [ ] Desenhar diagramas de arquitetura
- [ ] Criar testes unitários

### Longo Prazo
- [ ] Integração Shopee completa
- [ ] Integração Amazon completa
- [ ] Sistema de notificações push

---

## 14. Contato e Suporte

**Desenvolvedor Principal:** Anderson Honorato  
**Último Update:** 2024  
**Versão Projeto:** 1.0.0  
**Status:** Em Desenvolvimento

---

**Nota:** Esta documentação está em contínuo update conforme o projeto evolui.
Todos os ficheiros possuem comentários em Português (PT-BR).
