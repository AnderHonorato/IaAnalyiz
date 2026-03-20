import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Recovery from './pages/Recovery';
import Home from './pages/Home';
import MercadoLivre from './pages/MercadoLivre';
import Shopee from './pages/Shopee';
import Amazon from './pages/Amazon';
import MainLayout from './layouts/MainLayout';

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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
        <Route path="/cadastro" element={<AuthRoute><Register /></AuthRoute>} />
        <Route path="/recuperacao" element={<AuthRoute><Recovery /></AuthRoute>} />
        
        {/* ROTAS PROTEGIDAS PELO LAYOUT PRINCIPAL (ONDE FICA O CHAT) */}
        <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route index element={<Home />} />
          <Route path="ml" element={<MercadoLivre />} />
          <Route path="shopee" element={<Shopee />} />
          <Route path="amazon" element={<Amazon />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}