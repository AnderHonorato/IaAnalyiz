// AnalyizFace.jsx — Estilo "Gato Espacial" com Cometas Dinâmicos
import React, { useEffect } from 'react';

const CSS = `
  @keyframes af-breathe { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.03) } }
  @keyframes af-orbit { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes af-comet { 
    0% { transform: rotate(0deg) translateX(var(--dist)) rotate(0deg); opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { transform: rotate(360deg) translateX(var(--dist)) rotate(-360deg); opacity: 0; }
  }
  @keyframes af-blink { 0%, 90%, 100% { transform: scaleY(1) } 95% { transform: scaleY(0.1) } }
  @keyframes af-float-item { 0% { transform: translateY(0) opacity: 0; } 50% { opacity: 1; } 100% { transform: translateY(-20px) opacity: 0; } }
  
  .af-container { position: relative; display: inline-flex; align-items: center; justify-content: center; transition: all 0.3s; }
  .af-face-bg { fill: #1e2230; stroke: #3d4060; }
  .af-eye-group { animation: af-blink 4s infinite; transform-origin: center; transform-box: fill-box; }
  .af-comet-layer { position: absolute; inset: 0; pointer-events: none; }
  .af-comet { 
    position: absolute; top: 50%; left: 50%; 
    width: 8px; height: 8px; border-radius: 50%;
    background: white; box-shadow: 0 0 10px #4285F4, 0 0 20px #9B72CB;
    animation: af-comet var(--speed) linear infinite;
    opacity: 0;
  }
`;

// Injeção de CSS
let _cssInjected = false;
const injectCSS = () => {
  if (_cssInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  _cssInjected = true;
};

export const AnalyizFace = ({ size = 100, state = 'idle' }) => {
  useEffect(() => injectCSS(), []);

  const s = size;
  const cx = s / 2;
  const rFace = s * 0.4;

  // Lógica de Cometas baseada no estado
  const renderComets = () => {
    const cometConfigs = {
      thinking: { count: 3, speed: '2s', dist: rFace + 10 },
      book: { count: 1, speed: '5s', dist: rFace + 5 },
      done: { count: 6, speed: '1s', dist: rFace + 15 },
      idle: { count: 2, speed: '4s', dist: rFace + 8 }
    };
    const config = cometConfigs[state] || cometConfigs.idle;
    
    return Array.from({ length: config.count }).map((_, i) => (
      <div 
        key={i} 
        className="af-comet" 
        style={{ 
          '--speed': config.speed, 
          '--dist': `${config.dist}px`,
          animationDelay: `${i * (parseFloat(config.speed) / config.count)}s`
        }} 
      />
    ));
  };

  // Lógica de transformação dos olhos (Style Gato)
  const getEyeTransform = () => {
    switch(state) {
      case 'thinking': return { transform: 'scaleY(0.8) translateY(2px)' };
      case 'book': return { transform: 'translateY(4px) scale(0.9)' };
      case 'done': return { transform: 'scale(1.1)', filter: 'drop-shadow(0 0 5px gold)' };
      case 'audio': return { transform: 'scaleY(0.2) translateY(5px)' };
      default: return {};
    }
  };

  return (
    <div className={`af-container`} style={{ width: s, height: s }}>
      {/* Camada de Cometas */}
      <div className="af-comet-layer">{renderComets()}</div>

      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        <defs>
          <radialGradient id="irisGrad">
            <stop offset="0%" stopColor="#87CEEB" />
            <stop offset="100%" stopColor="#4285F4" />
          </radialGradient>
        </defs>

        {/* Rosto Principal */}
        <circle cx={cx} cy={cx} r={rFace} className="af-face-bg" />

        {/* Bochechas (Blush) */}
        <ellipse cx={cx - rFace*0.5} cy={cx + 10} rx={rFace*0.2} ry={rFace*0.1} fill="#e87a8a" opacity="0.3" />
        <ellipse cx={cx + rFace*0.5} cy={cx + 10} rx={rFace*0.2} ry={rFace*0.1} fill="#e87a8a" opacity="0.3" />

        {/* Grupo dos Olhos */}
        <g style={getEyeTransform()} className="af-eye-group">
          {/* Olho Esquerdo */}
          <circle cx={cx - 18} cy={cx - 5} r="12" fill="white" />
          <circle cx={cx - 18} cy={cx - 5} r="9" fill="url(#irisGrad)" />
          <circle cx={cx - 18} cy={cx - 5} r="5" fill="#080d1e" /> {/* Pupila Gato */}
          <circle cx={cx - 21} cy={cx - 8} r="3" fill="white" opacity="0.8" /> {/* Brilho */}

          {/* Olho Direito */}
          <circle cx={cx + 18} cy={cx - 5} r="12" fill="white" />
          <circle cx={cx + 18} cy={cx - 5} r="9" fill="url(#irisGrad)" />
          <circle cx={cx + 18} cy={cx - 5} r="5" fill="#080d1e" />
          <circle cx={cx + 15} cy={cx - 8} r="3" fill="white" opacity="0.8" />
        </g>

        {/* Elementos flutuantes por contexto */}
        {state === 'book' && <text x={cx} y={cx + 25} fontSize="12" textAnchor="middle">📖</text>}
        {state === 'audio' && <text x={cx} y={cx + 25} fontSize="12" textAnchor="middle">🎵</text>}
      </svg>
    </div>
  );
};
