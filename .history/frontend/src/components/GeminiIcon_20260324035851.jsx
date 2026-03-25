// GeminiIcon.jsx — substitui o GeminiIcon do IaAnalyizChat.jsx
// ✅ Ícone quadrado, mesmo tamanho em todos os lados
// ✅ Estrelinhas piscando de forma assíncrona ao redor
// ✅ Anel orbital girando ao redor (estilo Gemini) — só quando animating={true}
// ✅ Sem rotação do ícone principal

import React, { useRef } from 'react';

// ── CSS injetado uma única vez ──────────────────────────────────────────────────
const ICON_CSS = `
@keyframes gem-orbit       { to { transform: rotate(360deg); } }
@keyframes gem-breathe     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
@keyframes gem-spark-pulse { 0%,100%{opacity:0;transform:scale(0.3)} 50%{opacity:1;transform:scale(1)} }

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

/* Anel orbital — só visível quando .is-animating */
.gem-icon-wrap .gem-orbit {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.gem-icon-wrap.is-animating .gem-orbit {
  opacity: 1;
  animation: gem-orbit 1.4s linear infinite;
}

/* Estrela Gemini */
.gem-icon-wrap .gem-star {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: gem-breathe 3s ease-in-out infinite;
  transform-origin: center;
}

/* Estrelinhas */
.gem-icon-wrap .gem-sparkle {
  position: absolute;
  z-index: 3;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gem-icon-wrap .gem-sparkle.sp0 { animation: gem-spark-pulse 2.2s ease-in-out infinite 0.0s; }
.gem-icon-wrap .gem-sparkle.sp1 { animation: gem-spark-pulse 2.2s ease-in-out infinite 0.6s; }
.gem-icon-wrap .gem-sparkle.sp2 { animation: gem-spark-pulse 2.2s ease-in-out infinite 1.1s; }
.gem-icon-wrap .gem-sparkle.sp3 { animation: gem-spark-pulse 2.2s ease-in-out infinite 1.7s; }
`;

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = ICON_CSS;
  document.head.appendChild(s);
}

// ── Subcomponentes SVG ────────────────────────────────────────────────────────

// Estrela de 4 pontas estilo Gemini (proporcional, sem rotação)
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
      {/* Estrela de 4 pontas — eixos X e Y idênticos para ser quadrada */}
      <path
        d="M0,-9 C1,-4 4,-1 9,0 C4,1 1,4 0,9 C-1,4 -4,1 -9,0 C-4,-1 -1,-4 0,-9Z"
        fill={`url(#${id})`}
      />
      {/* Miolo branco — dá a ilusão de brilho */}
      <path
        d="M0,-5 C0.6,-2.4 2.4,-0.6 5,0 C2.4,0.6 0.6,2.4 0,5 C-0.6,2.4 -2.4,0.6 -5,0 C-2.4,-0.6 -0.6,-2.4 0,-5Z"
        fill="white"
        opacity="0.92"
      />
    </svg>
  );
}

// Anel orbital com arco de gradiente e ponto brilhante
function OrbitRingSVG({ size }) {
  const r    = (size / 2) - 2.5;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75;
  const gap  = circ * 0.25;
  const sw   = Math.max(2, size * 0.05);    // stroke-width do arco
  const dot  = Math.max(2, size * 0.055);   // raio do ponto
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
      <circle cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={Math.max(1.5, size * 0.038)}
      />
      {/* Arco principal com gradiente */}
      <circle cx={cx} cy={cy} r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={circ * 0.1}
      />
      {/* Ponto brilhante na ponta do arco */}
      <circle cx={cx + r} cy={cy} r={dot} fill="#D96570"/>
    </svg>
  );
}

// Estrelinhas piscando (cruz de 4 pontas minúsculas)
function SparkleSVG({ sz }) {
  return (
    <svg width={sz} height={sz} viewBox="-5 -5 10 10" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0,-4 C0.3,-1.5 1.5,-0.3 4,0 C1.5,0.3 0.3,1.5 0,4 C-0.3,1.5 -1.5,0.3 -4,0 C-1.5,-0.3 -0.3,-1.5 0,-4Z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function GeminiIcon({ size = 32, animating = false }) {
  injectCSS();

  const half         = size / 2;
  const starSize     = size * 0.56;   // estrela ocupa 56% do círculo
  const sparkleSize  = Math.max(5, size * 0.18);
  const spDist       = size * 0.52;   // distância do centro às estrelinhas

  // Posições das 4 estrelinhas ao redor (distribuídas de forma natural)
  const sparkles = [
    { cls: 'sp0', x: half - spDist * 0.62, y: half - spDist * 0.62 }, // topo-esq
    { cls: 'sp1', x: half + spDist * 0.55, y: half - spDist * 0.58 }, // topo-dir
    { cls: 'sp2', x: half + spDist * 0.50, y: half + spDist * 0.65 }, // baixo-dir
    { cls: 'sp3', x: half - spDist * 0.58, y: half + spDist * 0.60 }, // baixo-esq
  ];

  return (
    <div
      className={`gem-icon-wrap${animating ? ' is-animating' : ''}`}
      style={{ width: size, height: size }}
    >
      {/* Fundo escuro */}
      <div className="gem-bg" />

      {/* Anel orbital */}
      <div className="gem-orbit">
        <OrbitRingSVG size={size} />
      </div>

      {/* Estrela Gemini */}
      <div className="gem-star">
        <StarSVG size={starSize} />
      </div>

      {/* Estrelinhas piscando */}
      {sparkles.map((sp) => (
        <div
          key={sp.cls}
          className={`gem-sparkle ${sp.cls}`}
          style={{
            left:   sp.x - sparkleSize / 2,
            top:    sp.y - sparkleSize / 2,
            width:  sparkleSize,
            height: sparkleSize,
          }}
        >
          <SparkleSVG sz={sparkleSize} />
        </div>
      ))}
    </div>
  );
}