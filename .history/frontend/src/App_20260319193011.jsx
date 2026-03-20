import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Recovery from './pages/Recovery';
import Home from './pages/Home';
import MercadoLivre from './pages/MercadoLivre';
import Shopee from './pages/Shopee';
import Amazon from './pages/Amazon';
import Usuarios from './pages/Usuarios';
import MainLayout from './layouts/MainLayout';

const PrivateRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('analyiz_token');
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AuthRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('analyiz_token');
  return isAuthenticated ? <Navigate to="/" replace /> : children;
};

// Rota exclusiva para o Criador (Owner)
const OwnerRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('analyiz_user') || '{}');
  return user.role === 'OWNER' ? children : <Navigate to="/" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
        <Route path="/cadastro" element={<AuthRoute><Register /></AuthRoute>} />
        <Route path="/recuperacao" element={<AuthRoute><Recovery /></AuthRoute>} />
        
        <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route index element={<Home />} />
          <Route path="ml" element={<MercadoLivre />} />
          <Route path="shopee" element={<Shopee />} />
          <Route path="amazon" element={<Amazon />} />
          <Route path="usuarios" element={<OwnerRoute><Usuarios /></OwnerRoute>} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}