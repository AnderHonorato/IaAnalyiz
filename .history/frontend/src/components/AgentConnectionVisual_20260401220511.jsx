/**
 * frontend/src/components/AgentConnectionVisual.jsx
 * 
 * Propósito:
 * Visualização gráfica de agentes especializados do enxame da IA.
 * Exibe conexões, status e atividade dos agentes em tempo real.
 * 
 * Responsabilidades:
 * - Renderizar ícones de agentes
 * - Exibir status visual com animações
 * - Mostrar conexões entre agentes
 * - Indicar atividade/carregamento
 * - Fornecer tooltips com informações
 * 
 * Catálogo de Agentes Suportados:
 *   - pesquisa: Busca web global
 *   - validacao: Validação de dados
 *   - banco: Operações de base de dados
 *   - seguranca: Conformidade e segurança
 *   - programador: Desenvolvimento código
 *   - imagem: Design/processamento imagem
 *   - video: Produção vídeo
 *   - audio: Processamento áudio
 *   - padrao: Agente auxiliar genérico
 * 
 * Animações:
 *   - agentPulseRing: Pulso ao redor de agente ativo
 *   - agentLogFade: Fade-in de logs/atividade
 * 
 * Props:
 *   - agentes: Array de IDs de agentes ativos
 *   - ativo: Boolean indicando se há atividade
 *   - size: Tamanho do ícone (padrão: 24px)
 *   - onClick: Callback ao clicar em agente
 * 
 * Estilos CSS:
 *   - Cores customizadas por agente
 *   - Animações keyframe globais
 *   - Responsive sizing
 * 
 * Exports:
 *   - AgentConnectionVisual: Componente principal
 *   - AGENT_CATALOG: Configuração de agentes
 *   - AGENT_STYLES: CSS de animações
 * 
 * @author Anderson Honorato
 * @version 1.1.0
 */

// frontend/src/components/AgentConnectionVisual.jsx
// Visual do agente agora é independente do ícone estrela para não bugar no grid de pré-renderização

import React from 'react';
import { Globe, Scale, Zap, Database, ShieldCheck, Terminal, Image as ImgIcon, Video, Music } from 'lucide-react';

const AGENT_STYLES = `
  @keyframes agentPulseRing {
    0%   { box-shadow: 0 0 0 0px var(--ag-color-a); }
    70%  { box-shadow: 0 0 0 8px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0px rgba(0,0,0,0); }
  }
  @keyframes agentLogFade {
    from { opacity: 0; transform: translateX(-6px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;

export const AGENT_CATALOG = {
  pesquisa:    { icon: Globe,      label: 'Pesquisa Web',          color: '#38bdf8' },
  validacao:   { icon: Scale,      label: 'Validador',              color: '#a78bfa' },
  banco:       { icon: Database,   label: 'Dados Internos',         color: '#10b981' },
  seguranca:   { icon: ShieldCheck,label: 'Segurança',              color: '#f59e0b' },
  programador: { icon: Terminal,   label: 'Agente Programador',     color: '#ef4444' },
  imagem:      { icon: ImgIcon,    label: 'Design de Imagem',       color: '#ec4899' },
  video:       { icon: Video,      label: 'Produção de Vídeo',      color: '#8b5cf6' },
  audio:       { icon: Music,      label: 'Processamento de Áudio', color: '#14b8a6' },
  padrao:      { icon: Zap,        label: 'Agente Auxiliar',        color: '#6366f1' },
};

export function AgentConnectionVisual({ agentTipo, agentLogs, th }) {
  const agent   = AGENT_CATALOG[agentTipo] || AGENT_CATALOG.padrao;
  const AgIcon  = agent.icon;
  const ultimoLog = agentLogs.length > 0 ? agentLogs[agentLogs.length - 1] : null;

  return (
    <>
      <style>{AGENT_STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        
        {/* Ícone principal do agente, independente da estrela */}
        <div
          style={{
            width:           '26px',
            height:          '26px',
            borderRadius:    '50%',
            background:      `${agent.color}22`,
            border:          `2px solid ${agent.color}`,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            color:           agent.color,
            '--ag-color-a':  `${agent.color}60`,
            animation:       'agentPulseRing 1.8s ease-out infinite',
            boxShadow:       `0 0 8px ${agent.color}50`,
          }}
        >
          <AgIcon size={13} />
        </div>

        {/* Informação visual extra pequena abaixo do ícone (apenas para não poluir o layout) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <span style={{
            fontSize:    '10px',
            fontWeight:  700,
            color:       agent.color,
            fontFamily:  "'Google Sans', sans-serif",
            whiteSpace:  'nowrap'
          }}>
            {agent.label}
          </span>
          {ultimoLog && (
            <span
              key={ultimoLog.ts}
              style={{
                fontSize:   '9px',
                color:      th.textMuted,
                fontFamily: "'Google Sans', sans-serif",
                whiteSpace: 'nowrap',
                maxWidth:   '80px',
                overflow:   'hidden',
                textOverflow:'ellipsis',
                animation:  'agentLogFade 0.25s ease',
              }}
            >
              {ultimoLog.msg}
            </span>
          )}
        </div>

      </div>
    </>
  );
}