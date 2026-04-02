# Headers de Documentação para Rotas Pendentes

## 1. iaRoutes.js

```javascript
/**
 * backend/src/routes/iaRoutes.js
 * 
 * Sistema de Chat com IA — Orquestração Completa (v6.3: reasoning + Invalid Date fix)
 * 
 * Responsabilidades:
 * - Gerenciamento de sessões de chat (criar, listar, deletar)
 * - Endpoint SSE streaming para respostas em tempo real COM reasoning persistido
 * - Classificação dinâmica de perguntas com roteamento de dados (geminiRouter + keywordRoute)
 * - Integração com Brain (IA Learning System)
 * - Histórico de mensagens com reasoning (Chain of Thought)
 * - Resumos automáticos de conversas
 * - Visualizador de código (ChatDocuments)
 * 
 * Fluxo Principal (POST /api/ia/chat/stream):
 * 1. Valida user + cria ou localiza session
 * 2. Persiste mensagem do USUÁRIO no DB
 * 3. Atualiza título da sessão com preview da mensagem
 * 4. Busca histórico de mensagens (últimas 40)
 * 5. ROTEADOR: Classifica intenção (Gemini ou keywords fallback)
 * 6. Busca dados relevantes do banco baseado em classificação
 * 7. Monta contexto base (stats, token ML, data block formatado)  
 * 8. Processa imagens (se enviadas)
 * 9. Chama buildAnswerStream com callback para streaming de thinking+reply
 * 10. Persiste resposta da IA COM reasoning no DB
 * 11. Aprendizado em background (não bloqueia SSE)
 * 12. Envia evento 'done' com reply, sources, reasoning, durationMs
 * 
 * Roteador de Dados (routeDataNeeded):
 * - DATA_CATALOG com 9 tabelas mapeadas
 * - Suporta privilégios (OWNER/ADMIN vê tabelas restritas)
 * - Fallback para regex simples se Gemini falha
 * 
 * @author Anderson Honorato
 * @version 6.3 (reasoning + Invalid Date fix)
 */
```

## 2. mlPrecosRoutes.js

```javascript
/**
 * backend/src/routes/mlPrecosRoutes.js
 * 
 * Gerenciamento de Preços no Mercado Livre
 * 
 * Responsabilidades:
 * - Buscar preço atual e histórico de anúncios do ML
 * - Atualizar preços em lote ou unitário via ML API
 * - Registrar histórico de alterações com timestamp
 * - Validar tokens ML e permissões
 * - Sincronizar com sistema local
 * 
 * Endpoints:
 * - GET /api/ml/precos/:mlItemId - Buscar preço atual
 * - PUT /api/ml/precos/:mlItemId - Atualizar preço
 * - GET /api/ml/precos/:mlItemId/historico - Histórico de preços
 * - POST /api/ml/precos/atualizar - Update em lote
 * 
 * Helpers:
 * - getToken(userId): Busca token ML válido
 * - mlGet(), mlPut(): Wrappers da ML API com error handling
 * - salvarHistoricoPreco(): Registra mudanças no banco
 * 
 * @author Anderson Honorato
 */
```

## 3. mlResearchRoutes.js

```javascript
/**
 * backend/src/routes/mlResearchRoutes.js
 * 
 * Pesquisa de Mercado e Análise de Concorrência
 * 
 * Responsabilidades:
 * - Analisar preços de concorrentes
 * - Buscar tendências de mercado
 * - Sugerir precificação otimizada
 * - Coletar dados de anúncios similares
 * 
 * Endpoints:
 * - POST /api/research/buscar - Busca concorrentes
 * - GET /api/research/tendencias - Análise de tendências
 * - POST /api/research/sugerir-preco - Recomendação de preço
 * 
 * @author Anderson Honorato
 */
```

## 4. sessaoRoutes.js

```javascript
/**
 * backend/src/routes/sessaoRoutes.js
 * 
 * Gerenciamento de Sessões de Usuários
 * 
 * Responsabilidades:
 * - Rastrear entrada/saída de usuários
 * - Manter estatísticas de sessão
 * - Limpeza automática de sessões antigas
 * _
 * Endpoints:
 * - POST /api/sessao/entrar - Registra entrada
 * - POST /api/sessao/sair - Registra saída
 * - GET /api/sessao/stats - Estatísticas gerais
 * 
 * @author Anderson Honorato
 */
```

## 5. Mlanunciosroutes.js

```javascript
/**
 * backend/src/routes/Mlanunciosroutes.js
 * 
 * Gerenciamento de Meus Anúncios do Mercado Livre
 * 
 * Responsabilidades:
 * - Listar anúncios publicados do usuário
 * - Buscar detalhes de anúncios específicos
 * - Atualizar informações de anúncios
 * - Sincronizar com ML API
 * 
 * Endpoints:
 * - GET /api/ml/anuncios - Listagem
 * - GET /api/ml/anuncios/:id - Detalhes
 * - PUT /api/ml/anuncios/:id - Atualizar
 * 
 * @author Anderson Honorato
 */
```

## Como Usar

1. Cada arquivo precisa ter seu header JSDoc adicionado no início (após imports)
2. Manter padrão de seções com `// ═════════════════...`
3. Adicionar comentários para helpers e funções principais
4. Exemplos de request/response quando aplicável

## Padrão Geral

```
1. Header JSDoc (40-50 linhas)
2. Imports
3. Router setup
4. Helpers (comentados)
5. Seções de endpoints com headers
6. Cada endpoint com /api/... comentado
7. Export
```
