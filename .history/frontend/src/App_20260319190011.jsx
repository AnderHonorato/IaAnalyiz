import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Recovery from './pages/Recovery';
import Home from './pages/Home';

// Componente para proteger a Home (só acessa quem tem o Token)
const PrivateRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('analyiz_token');
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Componente para evitar que quem está logado acesse a tela de login de novo
const AuthRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('analyiz_token');
  return isAuthenticated ? <Navigate to="/" replace /> : children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rotas Públicas (Autenticação) */}
        <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
        <Route path="/cadastro" element={<AuthRoute><Register /></AuthRoute>} />
        <Route path="/recuperacao" element={<AuthRoute><Recovery /></AuthRoute>} />
        
        {/* Rota Privada (Painel) */}
        <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
        
        {/* Fallback (Qualquer URL não mapeada vai para o Login) */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}