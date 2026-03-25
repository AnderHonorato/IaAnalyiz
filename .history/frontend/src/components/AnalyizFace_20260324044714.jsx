// GeminiIcon.jsx — ícone de processamento da IA
// ✅ Estrela Gemini FIXA no centro (não gira, não some)
// ✅ 4 sparkles em anéis menores ao redor da estrela, cada um com órbita própria
// ✅ Anel principal girando ao redor (estilo Gemini) — só quando animating={true}
// ✅ Fontes Claude: system-ui para texto, JetBrains Mono para código

import React from 'react';

const ICON_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

  @keyframes gem-orbit        { to { transform: rotate(360deg); } }
  @keyframes gem-orbit-ccw    { to { transform: rotate(-360deg); } }
  @keyframes gem-breathe      { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
  @keyframes gem-spark-pulse  { 0%,100%{opacity:0;transform:scale(0.3)} 50%{opacity:1;transform:scale(1)} }

  /* fonte padrão Claude */
  .gem-icon-wrap, .gem-icon-wrap * {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .gem-icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Círculo de fundo */
  .gem-icon-wrap .gem-bg {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: #1e293b;
  }

  /* Anel orbital principal — só visível quando .is-animating */
  .gem-icon-wrap .gem-orbit-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }
  .gem-icon-wrap.is-animating .gem-orbit-ring {
    opacity: 1;
    animation: gem-orbit 1.4s linear infinite;
  }

  /* Estrela Gemini — sempre visível, nunca gira */
  .gem-icon-wrap .gem-star {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: gem-breathe 3s ease-in-out infinite;
    transform-origin: center;
    /* garante que o breathe não interfere com outras transforms */
    will-change: transform;
  }

  /* Anéis orbitais menores para os sparkles */
  .gem-spark-orbit {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    z-index: 3;
  }
  .gem-spark-orbit.cw  { animation: gem-orbit 2.6s linear var(--delay, 0s) infinite; }
  .gem-spark-orbit.ccw { animation: gem-orbit-ccw 3.2s linear var(--delay, 0s) infinite; }

  /* Ponto sparkle no topo de cada anel */
  .gem-spark-dot {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 50%;
    animation: gem-spark-pulse var(--dur, 2.2s) ease-in-out var(--delay, 0s) infinite;
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

// ── Estrela de 4 pontas estilo Gemini (fixa, não gira) ──────────────────────
function StarSVG({ size }) {
  const id = `gem-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#4285F4"/>
          <stop offset="40%"  stopColor="#9B72CB"/>
          <stop offset="75%"  stopColor="#D96570"/>
          <stop offset="100%" stopColor="#D96570"/>
        </linearGradient>
      </defs>
      {/* Estrela de 4 pontas — eixos X e Y idênticos */}
      <path
        d="M0,-9 C1,-4 4,-1 9,0 C4,1 1,4 0,9 C-1,4 -4,1 -9,0 C-4,-1 -1,-4 0,-9Z"
        fill={`url(#${id})`}
      />
      {/* Miolo branco — brilho */}
      <path
        d="M0,-5 C0.6,-2.4 2.4,-0.6 5,0 C2.4,0.6 0.6,2.4 0,5 C-0.6,2.4 -2.4,0.6 -5,0 C-2.4,-0.6 -0.6,-2.4 0,-5Z"
        fill="white"
        opacity="0.92"
      />
    </svg>
  );
}

// ── Anel orbital com arco de gradiente ──────────────────────────────────────
function OrbitRingSVG({ size }) {
  const r    = (size / 2) - 2.5;
  const cx   = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75;
  const gap  = circ * 0.25;
  const sw   = Math.max(2, size * 0.05);
  const dot  = Math.max(2, size * 0.055);
  const id   = `orbit-g-${size}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#4285F4" stopOpacity="0"/>
          <stop offset="30%"  stopColor="#9B72CB" stopOpacity="0.7"/>
          <stop offset="70%"  stopColor="#D96570" stopOpacity="1"/>
          <stop offset="100%" stopColor="#4285F4" stopOpacity="0.9"/>
        </linearGradient>
      </defs>
      {/* Trilha fantasma */}
      <circle cx={cx} cy={cx} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={Math.max(1.5, size * 0.038)}
      />
      {/* Arco com gradiente */}
      <circle cx={cx} cy={cx} r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={circ * 0.1}
      />
      {/* Ponto brilhante */}
      <circle cx={cx + r} cy={cx} r={dot} fill="#D96570"/>
    </svg>
  );
}

// ── Sparkle SVG (estrela de 4 pontas pequena) ────────────────────────────────
function SparkSVG({ sz, color }) {
  return (
    <svg width={sz} height={sz} viewBox="-5 -5 10 10" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0,-4 C0.3,-1.5 1.5,-0.3 4,0 C1.5,0.3 0.3,1.5 0,4 C-0.3,1.5 -1.5,0.3 -4,0 C-1.5,-0.3 -0.3,-1.5 0,-4Z"
        fill={color}
        opacity="0.9"
      />
    </svg>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function GeminiIcon({ size = 32, animating = false }) {
  injectCSS();

  const starSize = size * 0.56;

  // 4 sparkles, cada um num anel orbital menor independente
  // dist = raio do anel orbital do sparkle (menor que o anel principal)
  const sparkOrbits = [
    { dist: size * 0.50, dir: 'cw',  delay: '0s',    dur: '2.6s', color: '#4285F4', sz: Math.max(4, size * 0.13) },
    { dist: size * 0.54, dir: 'ccw', delay: '0.55s', dur: '3.2s', color: '#9B72CB', sz: Math.max(3, size * 0.11) },
    { dist: size * 0.48, dir: 'cw',  delay: '1.1s',  dur: '3.8s', color: '#D96570', sz: Math.max(3, size * 0.12) },
    { dist: size * 0.56, dir: 'ccw', delay: '1.7s',  dur: '2.2s', color: '#A78BFA', sz: Math.max(3, size * 0.10) },
  ];

  return (
    <div
      className={`gem-icon-wrap${animating ? ' is-animating' : ''}`}
      style={{ width: size, height: size }}
    >
      {/* Fundo escuro */}
      <div className="gem-bg" />

      {/* Anel orbital principal (só quando animating) */}
      <div className="gem-orbit-ring">
        <OrbitRingSVG size={size} />
      </div>

      {/* ── Sparkles em anéis menores ao redor da estrela ── */}
      {sparkOrbits.map((o, i) => {
        const orbitDiam = o.dist * 2;
        const orbitOff  = (size - orbitDiam) / 2;
        return (
          <div
            key={i}
            className={`gem-spark-orbit ${o.dir}`}
            style={{
              left:   orbitOff,
              top:    orbitOff,
              width:  orbitDiam,
              height: orbitDiam,
              '--delay': o.delay,
            }}
          >
            <div
              className="gem-spark-dot"
              style={{
                width:     o.sz,
                height:    o.sz,
                '--dur':   o.dur,
                '--delay': o.delay,
                marginLeft: `-${o.sz / 2}px`,
              }}
            >
              <SparkSVG sz={o.sz} color={o.color} />
            </div>
          </div>
        );
      })}

      {/* Estrela Gemini — sempre no centro, nunca gira */}
      <div className="gem-star" style={{ position: 'absolute', zIndex: 4 }}>
        <StarSVG size={starSize} />
      </div>
    </div>
  );
}