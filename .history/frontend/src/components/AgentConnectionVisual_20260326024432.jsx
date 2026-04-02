// frontend/src/components/AgentConnectionVisual.jsx
// Visual do agente: ícone do agente sobrepõe parcialmente o ícone mãe
// Sugestões: extraídas dinamicamente da resposta, sem repetir o conteúdo literal

import React from 'react';
import { Globe, Scale, Zap, Database, ShieldCheck, Terminal, Image as ImgIcon, Video, Music } from 'lucide-react';

const AGENT_STYLES = `
  @keyframes agentPulseRing {
    0%   { box-shadow: 0 0 0 0px var(--ag-color-a); }
    70%  { box-shadow: 0 0 0 8px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0px rgba(0,0,0,0); }
  }
  @keyframes agentBadgeBounce {
    0%,100% { transform: translate(50%, 50%) scale(1); }
    50%      { transform: translate(50%, 50%) scale(1.18); }
  }
  @keyframes agentFadeSlide {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes agentLogFade {
    from { opacity: 0; transform: translateX(-6px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes agentDotBlink {
    0%,80%,100% { opacity: 0.2; transform: scale(0.7); }
    40%         { opacity: 1;   transform: scale(1); }
  }
`;

export const AGENT_CATALOG = {
  pesquisa:    { icon: Globe,      label: 'Pesquisa Web',           color: '#38bdf8' },
  validacao:   { icon: Scale,      label: 'Validador',              color: '#a78bfa' },
  banco:       { icon: Database,   label: 'Dados Internos',         color: '#10b981' },
  seguranca:   { icon: ShieldCheck,label: 'Segurança',              color: '#f59e0b' },
  programador: { icon: Terminal,   label: 'Agente Programador',     color: '#ef4444' },
  imagem:      { icon: ImgIcon,    label: 'Design de Imagem',       color: '#ec4899' },
  video:       { icon: Video,      label: 'Produção de Vídeo',      color: '#8b5cf6' },
  audio:       { icon: Music,      label: 'Processamento de Áudio', color: '#14b8a6' },
  padrao:      { icon: Zap,        label: 'Agente Auxiliar',        color: '#6366f1' },
};

/**
 * Props:
 *   agentTipo   — string chave do AGENT_CATALOG
 *   agentLogs   — array { msg, tipo, ts }
 *   th          — objeto de tema
 *   starComponent — o <AnalyizStar> renderizado externamente
 */
export function AgentConnectionVisual({ agentTipo, agentLogs, th, starComponent }) {
  const agent   = AGENT_CATALOG[agentTipo] || AGENT_CATALOG.padrao;
  const AgIcon  = agent.icon;
  const ultimoLog = agentLogs.length > 0 ? agentLogs[agentLogs.length - 1] : null;

  return (
    <>
      <style>{AGENT_STYLES}</style>

      <div style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           '10px',
        animation:     'agentFadeSlide 0.35s cubic-bezier(0.2,0.8,0.2,1) both',
      }}>

        {/* ── Linha principal: ícone-mãe + badge sobreposto + texto ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

          {/* Ícone mãe com badge do agente sobrepondo o canto inferior direito */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {/* AnalyizStar passado de fora */}
            {starComponent}

            {/* Badge do agente — sobrepõe parcialmente o ícone mãe */}
            <div
              style={{
                position:        'absolute',
                bottom:          0,
                right:           0,
                transform:       'translate(35%, 35%)',
                width:           '26px',
                height:          '26px',
                borderRadius:    '50%',
                background:      `${agent.color}22`,
                border:          `2px solid ${agent.color}`,
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                color:           agent.color,
                zIndex:          10,
                '--ag-color-a':  `${agent.color}60`,
                animation:       'agentPulseRing 1.8s ease-out infinite, agentBadgeBounce 2.4s ease-in-out infinite',
                boxShadow:       `0 0 8px ${agent.color}50`,
                backdropFilter:  'blur(4px)',
              }}
            >
              <AgIcon size={13} />
            </div>
          </div>

          {/* Texto de status */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '3px' }}>
            <span style={{
              fontSize:    '13px',
              fontWeight:  700,
              color:       agent.color,
              fontFamily:  "'Google Sans', sans-serif",
              letterSpacing: '0.2px',
            }}>
              {agent.label}
            </span>

            {ultimoLog ? (
              <span
                key={ultimoLog.ts}
                style={{
                  fontSize:   '12px',
                  color:      th.textMuted,
                  fontFamily: "'Google Sans', sans-serif",
                  whiteSpace: 'nowrap',
                  overflow:   'hidden',
                  textOverflow:'ellipsis',
                  animation:  'agentLogFade 0.25s ease',
                }}
              >
                {ultimoLog.msg}
              </span>
            ) : (
              /* Pontos piscantes enquanto sem log */
              <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width:      '5px',
                    height:     '5px',
                    borderRadius:'50%',
                    background: agent.color,
                    display:    'inline-block',
                    animation:  `agentDotBlink 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}/>
                ))}
              </span>
            )}
          </div>
        </div>

      </div>
    </>
  );
}