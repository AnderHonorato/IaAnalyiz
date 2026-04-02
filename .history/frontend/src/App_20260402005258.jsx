import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MlResearch from './pages/MlResearch';
import Login from './pages/Login';
import Register from './pages/Register';
import Recuperacao from './pages/Recovery';
import Home from './pages/Home';
import MercadoLivre from './pages/MercadoLivre';
import MLDashboard from './pages/MLDashboard';
import Usuarios from './pages/Usuarios';
import MainLayout from './layouts/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import { ModalProvider } from './components/Modal';

const PaginaBloqueada = () => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100vh", gap: "12px", color: "#888"
  }}>
    <span style={{ fontSize: "48px" }}>🔒</span>
    <h2 style={{ margin: 0 }}>Página não disponível</h2>
    <p style={{ margin: 0 }}>Esta página existe mas não está disponível na sua conta.</p>
  </div>
);

const PrivateRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('analyiz_token');
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AuthRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('analyiz_token');
  return isAuthenticated ? <Navigate to="/" replace /> : children;
};

export default function App() {
  return (
    <ErrorBoundary>
      <ModalProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"       element={<AuthRoute><Login /></AuthRoute>} />
            <Route path="/cadastro"    element={<AuthRoute><Register /></AuthRoute>} />
            <Route path="/recuperacao" element={<AuthRoute><Recuperacao /></AuthRoute>} />

            <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
              <Route index element={<Home />} />

              <Route path="ml"           element={<MLDashboard />} />
              <Route path="ml/auditoria" element={<MercadoLivre />} />
              <Route path="ml/precos"    element={<PaginaBloqueada />} />
              <Route path="ml/pesquisa"  element={<MlResearch />} />
              <Route path="ml/anuncios"  element={<PaginaBloqueada />} />

              <Route path="shopee"    element={<PaginaBloqueada />} />
              <Route path="amazon"    element={<PaginaBloqueada />} />
              <Route path="usuarios"  element={<Usuarios />} />
              <Route path="feedbacks" element={<PaginaBloqueada />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ModalProvider>
    </ErrorBoundary>
  );
}