/**
 * frontend/src/App.jsx
 * 
 * Componente raiz da aplicação — Orquestração de Rotas e Autenticação
 * 
 * Responsabilidades:
 * - Definir estrutura de rotas (React Router)
 * - Gerenciar guards de autenticação (PrivateRoute, AuthRoute, OwnerRoute)
 * - Integrar providers (ModalProvider, ErrorBoundary)
 * - Definir layout principal (MainLayout)
 * 
 * Estrutura de Rotas:
 * 
 * 🔒 PÚBLICAS (AuthRoute - sem token):
 *   /login         → Login
 *   /cadastro      → Register
 *   /recuperacao   → Recovery
 * 
 * 🔐 PRIVADAS (PrivateRoute - com token):
 *   /              → Home (dashboard principal)
 *   /ml            → ML Dashboard
 *   /ml/auditoria  → Divergências & Auditoria
 *   /ml/precos     → Gerenciamento de Preços
 *   /ml/pesquisa   → Pesquisa de Mercado
 *   /ml/anuncios   → Meus Anúncios
 *   /shopee        → Integração Shopee
 *   /amazon        → Integração Amazon
 * 
 * 👑 OWNER ONLY (OwnerRoute):
 *   /usuarios      → Gerenciamento de Usuários
 *   /feedbacks     → Analytics de Feedback da IA
 * 
 * Guards Implementados:
 * - PrivateRoute: Redireciona não autenticados para /login
 * - AuthRoute: Redireciona autenticados para /
 * - OwnerRoute: Redireciona não-OWNER para /
 * 
 * Recuperação de Falhas:
 * - ErrorBoundary: Captura erros de renderização
 * - Navigate: Fallback para / em rotas inválidas
 * 
 * @author Anderson Honorato
 * @version 1.0.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// ... resto do código
