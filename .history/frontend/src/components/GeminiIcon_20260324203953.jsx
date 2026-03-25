import React from 'react';

const ICON_CSS = `
  @keyframes gem-orbit { to { transform: rotate(360deg); } }
  @keyframes gem-orbit-ccw { to { transform: rotate(-360deg); } }
  
  /* Pulsação suave do container quando processando */
  @keyframes gem-container-pulse {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(66, 133, 244, 0)); }
    50% { transform: scale(1.15); filter: drop-shadow(0 0 15px rgba(66, 133, 244, 0.4)); }
  }

  /* Respiração da estrela central */
  @keyframes gem-star-breathe {
    0%, 100% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.1); opacity: 1; }
  }

  /* Pulsação de brilho das orbes */
  @keyframes gem-orb-glow {
    0%, 100% { opacity: 0.5; filter: blur(1px); }
    50% { opacity: 1; filter: blur(0px) drop-shadow(0 0 5px var(--orb-color)); }
  }

  .gem-icon-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent; /* Fundo transparente como solicitado */
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .gem-icon-container.is-processing {
    animation: gem-container-pulse 2s ease-in-out infinite;
  }

  /* Estrela fixa central */
  .gem-star-center {
    position: absolute;
    z-index: 10;
    pointer-events: none;
    animation: gem-star-breathe 3s ease-in-out infinite;
  }

  /* Órbitas das Orbes (Prótons) */
  .gem-orb-path {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.05);
    pointer-events: none;
  }

  /* Velocidade dinâmica: mais rápido se estiver animando */
  .gem-orb-path.cw { animation: gem-orbit var(--speed) linear infinite; }
  .gem-orb-path.ccw { animation: gem-orbit-ccw var(--speed) linear infinite; }

  .gem-orb-dot {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    animation: gem-orb-glow 1.5s ease-in-out infinite;
  }
`;

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = ICON_CSS;
  document.head.appendChild(s);
}

// Estrela Gemini idêntica ao logo
function StarSVG({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C12.8 5.6 18.4 11.2 24 12C18.4 12.8 12.8 18.4 12 24C11.2 18.4 5.6 12.8 0 12C5.6 11.2 11.2 5.6 12 0Z" 
        fill="url(#gemini-gradient)" />
      <defs>
        <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function GeminiIcon({ size = 64, animating = false }) {
  injectCSS();

  // Configuração das orbes (prótons)
  // Se animating=true, a velocidade diminui numericamente (fica mais rápido)
  const speedScale = animating ? '1.5s' : '4s';
  const orbits = [
    { size: 0.9, color: '#4285F4', dir: 'cw', delay: '0s', speed: animating ? '1.2s' : '5s' },
    { size: 0.75, color: '#9B72CB', dir: 'ccw', delay: '-0.5s', speed: animating ? '1.8s' : '6s' },
    { size: 0.6, color: '#D96570', dir: 'cw', delay: '-1.2s', speed: animating ? '1.4s' : '4s' },
    { size: 0.45, color: '#A78BFA', dir: 'ccw', delay: '-2s', speed: animating ? '2.2s' : '7s' },
  ];

  return (
    <div 
      className={`gem-icon-container ${animating ? 'is-processing' : ''}`} 
      style={{ width: size, height: size }}
    >
      {/* Estrela Gemini Fixa */}
      <div className="gem-star-center">
        <StarSVG size={size * 0.4} />
      </div>

      {/* Orbes Orbitais */}
      {orbits.map((orb, i) => (
        <div
          key={i}
          className={`gem-orb-path ${orb.dir}`}
          style={{
            width: size * orb.size,
            height: size * orb.size,
            '--speed': orb.speed,
            animationDelay: orb.delay
          }}
        >
          <div 
            className="gem-orb-dot"
            style={{
              width: size * 0.08,
              height: size * 0.08,
              backgroundColor: orb.color,
              boxShadow: `0 0 8px ${orb.color}`,
              '--orb-color': orb.color
            }}
          />
        </div>
      ))}
    </div>
  );
}