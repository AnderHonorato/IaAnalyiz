// AnalyizStar.jsx — v1
// Substitui GeminiIcon completamente.
// ✅ Sem fundo (círculo removido) — estrela flutua sobre qualquer background
// ✅ Estrela central grande, muda de cor conforme tema (prop: dark)
// ✅ Cometas/orbes maiores orbitando ao redor
// ✅ Quando active=true: estrela pulsa mais forte e orbes giram mais rápido
// Props: size, active (bool), dark (bool) — dark=true usa cores para fundo escuro

import React from 'react';

const STAR_CSS = `
  @keyframes as-breathe       { 0%,100%{transform:scale(1)}   50%{transform:scale(1.08)} }
  @keyframes as-pulse         { 0%,100%{transform:scale(1)}   40%{transform:scale(1.18)} 70%{transform:scale(1.05)} }
  @keyframes as-orbit-cw      { to { transform: rotate(360deg);  } }
  @keyframes as-orbit-ccw     { to { transform: rotate(-360deg); } }
  @keyframes as-comet-glow    { 0%,100%{opacity:0.3;transform:scale(0.5)} 50%{opacity:1;transform:scale(1)} }
  @keyframes as-comet-glow-fast { 0%,100%{opacity:0.5;transform:scale(0.6)} 50%{opacity:1;transform:scale(1.15)} }

  .as-wrap { position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
  .as-star  { position:absolute; z-index:4; display:flex; align-items:center; justify-content:center; }
  .as-star.idle   { animation: as-breathe 3.2s ease-in-out infinite; }
  .as-star.active { animation: as-pulse   1.1s ease-in-out infinite; }

  .as-orbit { position:absolute; border-radius:50%; pointer-events:none; z-index:3; }
  .as-orbit.cw-idle  { animation: as-orbit-cw  3.0s linear var(--delay,0s) infinite; }
  .as-orbit.ccw-idle { animation: as-orbit-ccw 3.8s linear var(--delay,0s) infinite; }
  .as-orbit.cw-fast  { animation: as-orbit-cw  1.1s linear var(--delay,0s) infinite; }
  .as-orbit.ccw-fast { animation: as-orbit-ccw 1.4s linear var(--delay,0s) infinite; }

  .as-comet { position:absolute; top:0; left:50%; border-radius:50%; }
  .as-comet.idle { animation: as-comet-glow      2.4s ease-in-out var(--delay,0s) infinite; }
  .as-comet.fast { animation: as-comet-glow-fast 0.9s ease-in-out var(--delay,0s) infinite; }
`;

let _injected = false;
function injectCSS() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.textContent = STAR_CSS;
  document.head.appendChild(s);
}

// Estrela de 4 pontas estilo Gemini
function StarSVG({ size, dark }) {
  const id = `as-grad-${size}-${dark ? 'd' : 'l'}`;
  // Tema escuro: gradiente vibrante azul→violeta→rosa
  // Tema claro: gradiente mais escuro para destacar no branco
  const c0 = dark ? '#60A5FA' : '#1D4ED8';
  const c1 = dark ? '#A78BFA' : '#7C3AED';
  const c2 = dark ? '#F472B6' : '#DB2777';
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={c0}/>
          <stop offset="50%"  stopColor={c1}/>
          <stop offset="100%" stopColor={c2}/>
        </linearGradient>
      </defs>
      {/* Ponta externa da estrela */}
      <path
        d="M0,-9 C1.2,-4 4,-1.2 9,0 C4,1.2 1.2,4 0,9 C-1.2,4 -4,1.2 -9,0 C-4,-1.2 -1.2,-4 0,-9Z"
        fill={`url(#${id})`}
      />
      {/* Miolo branco brilhante */}
      <path
        d="M0,-5 C0.6,-2.2 2.2,-0.6 5,0 C2.2,0.6 0.6,2.2 0,5 C-0.6,2.2 -2.2,0.6 -5,0 C-2.2,-0.6 -0.6,-2.2 0,-5Z"
        fill="white"
        opacity="0.95"
      />
    </svg>
  );
}

// Mini estrela de 4 pontas para os cometas
function CometSVG({ sz, color }) {
  return (
    <svg width={sz} height={sz} viewBox="-5 -5 10 10" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0,-4.5 C0.4,-2 2,-0.4 4.5,0 C2,0.4 0.4,2 0,4.5 C-0.4,2 -2,0.4 -4.5,0 C-2,-0.4 -0.4,-2 0,-4.5Z"
        fill={color} opacity="0.95"
      />
    </svg>
  );
}

export default function AnalyizStar({ size = 32, active = false, dark = true }) {
  injectCSS();

  const starSize = size * 0.70; // estrela central bem maior, sem fundo para desperdiçar espaço

  // 4 cometas orbitais ao redor — raio maior, tamanho maior
  const comets = [
    { dist: size * 0.52, dir: 'cw',  delay: '0s',    color: '#60A5FA', sz: Math.max(5, size * 0.18) },
    { dist: size * 0.56, dir: 'ccw', delay: '0.5s',  color: '#A78BFA', sz: Math.max(5, size * 0.16) },
    { dist: size * 0.50, dir: 'cw',  delay: '1.0s',  color: '#F472B6', sz: Math.max(5, size * 0.17) },
    { dist: size * 0.58, dir: 'ccw', delay: '1.6s',  color: '#34D399', sz: Math.max(4, size * 0.14) },
  ];

  const speed = active ? 'fast' : 'idle';

  return (
    <div className="as-wrap" style={{ width: size, height: size }}>
      {/* Cometas orbitais */}
      {comets.map((c, i) => {
        const orbitDiam = c.dist * 2;
        const off       = (size - orbitDiam) / 2;
        const dirClass  = c.dir === 'cw' ? `cw-${speed}` : `ccw-${speed}`;
        return (
          <div
            key={i}
            className={`as-orbit ${dirClass}`}
            style={{
              left:   off,
              top:    off,
              width:  orbitDiam,
              height: orbitDiam,
              '--delay': c.delay,
            }}
          >
            <div
              className={`as-comet ${speed}`}
              style={{
                width:      c.sz,
                height:     c.sz,
                marginLeft: `-${c.sz / 2}px`,
                marginTop:  `-${c.sz / 2}px`,
                '--delay':  c.delay,
              }}
            >
              <CometSVG sz={c.sz} color={c.color}/>
            </div>
          </div>
        );
      })}

      {/* Estrela central — pulso lento (idle) ou rápido (active) */}
      <div
        className={`as-star ${active ? 'active' : 'idle'}`}
        style={{ width: starSize, height: starSize }}
      >
        <StarSVG size={starSize} dark={dark}/>
      </div>
    </div>
  );
}