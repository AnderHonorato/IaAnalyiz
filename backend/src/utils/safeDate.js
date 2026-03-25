// utils/safeDate.js
// Adicione este arquivo em src/utils/safeDate.js e importe onde precisar

/**
 * Formata qualquer valor de data com segurança.
 * Retorna '—' se a data for nula, undefined ou inválida.
 */
export function safeDate(val, options = {}) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...options,
  });
}

export function safeDateOnly(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// CAUSA DO "Invalid Date" NO SITE:
// ─────────────────────────────────────────────────────────────────────────────
// O campo `createdAt` do model `ResumoIA` no Prisma retorna DateTime.
// Quando serializado via JSON e exibido com `new Date(h.createdAt).toLocaleString()`
// sem validação, pode resultar em "Invalid Date" se o valor vier como string
// inesperada ou objeto Date não serializado corretamente.
//
// SOLUÇÃO: substitua todos os `new Date(x).toLocaleString('pt-BR')` no código
// por `safeDate(x)` importado deste arquivo.
//
// Locais a corrigir no MercadoLivre.jsx:
//   - formatarDataHora() → já usa `new Date(dt).toLocaleString()`, substituir por safeDate(dt)
//   - Histórico de Resumos: `new Date(h.createdAt).toLocaleString('pt-BR')`
//
// Locais a corrigir no MLDashboard.jsx:
//   - Token válido até: usar safeDate(data.expiresAt) — já corrigido no arquivo gerado
//
// PATCH RÁPIDO para MercadoLivre.jsx — substitua a função formatarDataHora:
//
// function formatarDataHora(dt) {
//   if (!dt) return '—';
//   const d = new Date(dt);
//   return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', {
//     day: '2-digit', month: '2-digit', year: 'numeric',
//     hour: '2-digit', minute: '2-digit'
//   });
// }
//
// E no histórico de resumos, substitua:
//   new Date(h.createdAt).toLocaleString('pt-BR')
// por:
//   formatarDataHora(h.createdAt)