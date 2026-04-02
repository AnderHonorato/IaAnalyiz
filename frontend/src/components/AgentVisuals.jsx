/**
 * frontend/src/components/AgentVisuals.jsx
 * 
 * ╪═════════════════════════════════════════════════════════════════════════════════
 * Propósito: Sistema de visualização para agentes do enxame inteligente com catálogo
 * de identidades visuais (ícones, cores, rótulos) e componente de conexão visual com
 * fios de transferência de contexto animados.
 * 
 * Responsabilidades:
 * - Exportar AGENT_CATALOG com 5 tipos de agentes: pesquisa, validação, banco, segurança, padrão
 * - Implementar AgentConnectionVisual para mostrar cadeia de comunicação entre IA mãe (Analyiz) e agentes
 * - Renderizar fios de transmissão com animação de energia (stroke-dash flow)
 * - Gerenciar pulso/glow dos agentes ativos com animações CSS customizadas
 * - Exibir status, tempo decorrido, logs e sites visitados de cada agente
 * 
 * AGENT_CATALOG Estrutura:
 * - pesquisa: Globe icon, azul claro (#38bdf8), coleta dados em tempo real
 * - validacao: Scale icon, roxo (#a78bfa), verifica precisão e coerência
 * - banco: Database icon, verde (#10b981), consulta banco interno
 * - seguranca: ShieldCheck icon, laranja (#f59e0b), audita permissões
 * - padrao: Zap icon, índigo (#6366f1), fallback para tipos desconhecidos
 * 
 * AgentConnectionVisual Props:
 * - agentTipo: Tipo do agente (chave de AGENT_CATALOG)
 * - agentAtivo: Boolean indicando se agente está em processamento
 * - showConnector: Boolean para mostrar/esconder componente
 * - elapsedMs: Tempo decorrido em milissegundos desde início
 * - sitesVisitados: Array de URLs visitadas pelo agente
 * - agentLogs: Array de mensagens de log do agente
 * - th: Paleta de temas (chatAreaBg, border, textMuted)
 * - starComponent: JSX do AnalyizStar renderizado
 * 
 * Animações:
 * - agentPulse: Pulso com box-shadow expansivo (2s loop)
 * - wireFlow: Animação de fluxo nos fios (stroke-dash, 1s linear)
 * - agentFadeIn: Entrada suave (0.4s cubic-bezier)
 * 
 * Dependências:
 * - React (componente funcional)
 * - lucide-react icons (Globe, Scale, Database, ShieldCheck, Zap)
 * - CSS3 Animations (keyframes injetados via AGENT_STYLES)
 * 
 * @author Anderson Honorato
 * @version 2.1.0
 * @since 2025-03-23
 * @integrates IaAnalyizChat.jsx (renderiza este componente para cadeia de agentes)
 * @integrates Analyizstar.jsx (componente starComponent passado como prop)
 */

import React from 'react';
import { Globe, Scale, Zap, Database, Search, ShieldCheck } from 'lucide-react';

// Estilos de animação injetados diretamente para garantir o funcionamento
const AGENT_STYLES = `
  @keyframes agentPulse {
    0% { box-shadow: 0 0 0 0 var(--agent-color-alpha); transform: scale(1); }
    50% { box-shadow: 0 0 0 10px rgba(0,0,0,0); transform: scale(1.05); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); transform: scale(1); }
  }
  @keyframes wireFlow {
    0% { stroke-dashoffset: 24; }
    100% { stroke-dashoffset: 0; }
  }
  @keyframes agentFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// Identidade visual única para cada tipo de agente
export const AGENT_CATALOG = {
  pesquisa: { 
    icon: <Globe size={22} />, 
    label: 'Agente de Pesquisa', 
    color: '#38bdf8', // Azul claro
    bg: 'rgba(56, 189, 248, 0.15)',
    desc: 'Buscando informações em tempo real'
  },
  validacao: { 
    icon: <Scale size={22} />, 
    label: 'Agente Validador', 
    color: '#a78bfa', // Roxo
    bg: 'rgba(167, 139, 250, 0.15)',
    desc: 'Verificando precisão e coerência'
  },
  banco: { 
    icon: <Database size={22} />, 
    label: 'Agente de Dados', 
    color: '#10b981', // Verde
    bg: 'rgba(16, 185, 129, 0.15)',
    desc: 'Consultando o banco interno'
  },
  seguranca: {
    icon: <ShieldCheck size={22} />,
    label: 'Agente de Segurança',
    color: '#f59e0b', // Laranja
    bg: 'rgba(245, 158, 11, 0.15)',
    desc: 'Auditando permissões e acessos'
  },
  padrao: { 
    icon: <Zap size={22} />, 
    label: 'Agente Auxiliar', 
    color: '#6366f1', // Indigo
    bg: 'rgba(99, 102, 241, 0.15)',
    desc: 'Processando requisição'
  }
};

export function AgentConnectionVisual({ agentTipo, agentAtivo, showConnector, elapsedMs, sitesVisitados, agentLogs, th, starComponent }) {
  if (!showConnector) return null;

  const agent = AGENT_CATALOG[agentTipo] || AGENT_CATALOG.padrao;
  const segundos = Math.floor(elapsedMs / 1000);
  const ultimoLog = agentLogs.length > 0 ? agentLogs[agentLogs.length - 1] : null;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '12px', 
      marginBottom: '16px', 
      animation: 'agentFadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      padding: '16px',
      background: th.chatAreaBg === '#ffffff' ? '#f8fafc' : '#1a1b1e',
      borderRadius: '16px',
      border: `1px solid ${th.border}`
    }}>
      <style>{AGENT_STYLES}</style>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', position: 'relative' }}>
        
        {/* IA Mãe (Analyiz) */}
        <div style={{ zIndex: 2 }}>
          {starComponent}
        </div>

        {/* Fios de Conexão (Animação de dados passando) */}
        <div style={{ flex: 1, height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <svg width="100%" height="40" style={{ position: 'absolute' }}>
            {/* Fio base */}
            <path d="M 0 20 C 30 20, calc(100% - 30px) 20, 100% 20" fill="none" stroke={th.border} strokeWidth="2" />
            {/* Fio de energia animado */}
            {agentAtivo && (
              <path 
                d="M 0 20 C 30 20, calc(100% - 30px) 20, 100% 20" 
                fill="none" 
                stroke={agent.color} 
                strokeWidth="3" 
                strokeDasharray="8 8" 
                style={{ animation: 'wireFlow 1s linear infinite' }} 
              />
            )}
          </svg>
          {agentAtivo && (
            <div style={{
              background: th.chatAreaBg,
              padding: '2px 8px',
              borderRadius: '12px',
              border: `1px solid ${agent.color}50`,
              fontSize: '10px',
              color: agent.color,
              fontWeight: 600,
              zIndex: 3,
              fontFamily: "'Google Sans', sans-serif",
              boxShadow: `0 0 10px ${agent.color}30`
            }}>
              Transferindo Contexto
            </div>
          )}
        </div>

        {/* Agente Secundário */}
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: agent.bg,
          border: `2px solid ${agent.color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: agent.color,
          zIndex: 2,
          '--agent-color-alpha': `${agent.color}60`,
          animation: agentAtivo ? 'agentPulse 2s infinite' : 'none',
          transition: 'all 0.3s ease'
        }}>
          {agent.icon}
        </div>
      </div>

      {/* Status e Logs do Agente */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: agent.color, fontFamily: "'Google Sans', sans-serif" }}>
          {agent.label} <span style={{ fontSize: '12px', color: th.textMuted, fontWeight: 'normal' }}>({agentAtivo ? `${segundos}s` : 'Concluído'})</span>
        </h4>
        
        {ultimoLog && (
          <p style={{ 
            margin: 0, 
            fontSize: '13px', 
            color: th.text, 
            fontFamily: "'Google Sans', sans-serif",
            animation: 'agentFadeIn 0.3s ease'
          }}>
            {ultimoLog.msg}
          </p>
        )}

        {sitesVisitados.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '12px' }}>
            {sitesVisitados.slice(0, 4).map((site, i) => (
              <span key={i} style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                padding: '4px 8px', 
                borderRadius: '8px', 
                background: th.surface, 
                color: agent.color, 
                border: `1px solid ${th.border}`, 
                fontSize: '11px', 
                fontFamily: "'Google Sans Mono', monospace" 
              }}>
                🌐 {site}
              </span>
            ))}
            {sitesVisitados.length > 4 && <span style={{ fontSize: '11px', color: th.textMuted }}>+{sitesVisitados.length - 4}</span>}
          </div>
        )}
      </div>
    </div>
  );
}