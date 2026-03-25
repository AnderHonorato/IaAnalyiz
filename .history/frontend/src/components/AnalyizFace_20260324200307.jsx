// AnalyizFace.jsx — v4 — Estilo inspirado Mercado Livre
// Rosto redondo azul vibrante, olhos brancos grandes sempre visíveis
// SEM bug de olhos da cor do fundo
// SEM piscada que some os olhos (scaleY nunca vai a 0)
// Estados: idle | thinking | upload | done | text | photo | code | book | audio | happy | error | alert

import React, { useEffect } from 'react';

const FACE_CSS = `
  @keyframes af4-blink {
    0%, 88%, 100% { transform: scaleY(1); }
    93% { transform: scaleY(0.12); }
  }
  @keyframes af4-look-left {
    0%, 35%, 100% { transform: translateX(0); }
    50%, 85% { transform: translateX(-3px); }
  }
  @keyframes af4-look-right {
    0%, 35%, 100% { transform: translateX(0); }
    50%, 85% { transform: translateX(3px); }
  }
  @keyframes af4-look-up {
    0%, 35%, 100% { transform: translateY(0); }
    50%, 80% { transform: translateY(-2.5px); }
  }
  @keyframes af4-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.03); }
  }
  @keyframes af4-bounce {
    0%, 100% { transform: translateY(0) scale(1); }
    35% { transform: translateY(-6px) scale(1.04); }
    65% { transform: translateY(-1px) scale(1.01); }
  }
  @keyframes af4-wiggle {
    0%, 100% { transform: rotate(0deg) scale(1); }
    25% { transform: rotate(-6deg) scale(1.02); }
    75% { transform: rotate(6deg) scale(1.02); }
  }
  @keyframes af4-nod {
    0%, 100% { transform: translateY(0) rotate(0); }
    30% { transform: translateY(-3px) rotate(-2deg); }
    70% { transform: translateY(2px) rotate(1.5deg); }
  }
  @keyframes af4-pop {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.07); }
  }
  @keyframes af4-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-4px); }
    40% { transform: translateX(4px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
  }
  @keyframes af4-dot-bounce {
    0%, 100% { transform: translateY(0); opacity: 0.45; }
    50% { transform: translateY(-4px); opacity: 1; }
  }
  @keyframes af4-orbit-cw {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes af4-orbit-ccw {
    from { transform: rotate(0deg); }
    to { transform: rotate(-360deg); }
  }
  @keyframes af4-spark {
    0%, 100% { opacity: 0; transform: scale(0.2); }
    45%, 55% { opacity: 1; transform: scale(1); }
  }

  .af4-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .af4-wrap.s-breathe { animation: af4-breathe 3.2s ease-in-out infinite; }
  .af4-wrap.s-bounce  { animation: af4-bounce  0.6s ease-out infinite; }
  .af4-wrap.s-wiggle  { animation: af4-wiggle  0.75s ease-in-out infinite; }
  .af4-wrap.s-nod     { animation: af4-nod     1.3s ease-in-out infinite; }
  .af4-wrap.s-pop     { animation: af4-pop     0.7s ease-in-out infinite; }
  .af4-wrap.s-shake   { animation: af4-shake   0.5s ease-in-out infinite; }

  .af4-orbit-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
  }
  .af4-orbit-ring.cw  { animation: af4-orbit-cw  var(--dur, 3s) linear var(--delay, 0s) infinite; }
  .af4-orbit-ring.ccw { animation: af4-orbit-ccw var(--dur, 4s) linear var(--delay, 0s) infinite; }

  .af4-spark-dot {
    position: absolute;
    top: 0; left: 50%;
    transform: translateX(-50%);
    animation: af4-spark var(--dur, 2s) ease-in-out var(--delay, 0s) infinite;
    pointer-events: none;
  }
`;

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = FACE_CSS;
  document.head.appendChild(s);
}

// ── Paleta por estado — SEMPRE fundo azul vibrante estilo ML ─────────────────
const STATE_CONFIG = {
  idle:     { bg: '#1273EA', bgGrad: '#1A82FF', cheek: 'rgba(255,255,255,0.12)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.6)' },
  thinking: { bg: '#1273EA', bgGrad: '#1A82FF', cheek: 'rgba(255,255,255,0.10)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.5)' },
  upload:   { bg: '#0A5DC2', bgGrad: '#1273EA', cheek: 'rgba(255,255,255,0.14)', eyeWhite: '#FFFFFF', pupil: '#063A80', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.7)' },
  done:     { bg: '#00A650', bgGrad: '#00C060', cheek: 'rgba(255,255,255,0.12)', eyeWhite: '#FFFFFF', pupil: '#005A2B', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.6)' },
  text:     { bg: '#1273EA', bgGrad: '#2E8BFF', cheek: 'rgba(255,255,255,0.10)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.5)' },
  photo:    { bg: '#FF6B00', bgGrad: '#FF8C2A', cheek: 'rgba(255,255,255,0.12)', eyeWhite: '#FFFFFF', pupil: '#8B3500', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.6)' },
  code:     { bg: '#0D47A1', bgGrad: '#1565C0', cheek: 'rgba(255,255,255,0.10)', eyeWhite: '#FFFFFF', pupil: '#071F5E', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.5)' },
  book:     { bg: '#00695C', bgGrad: '#00897B', cheek: 'rgba(255,255,255,0.10)', eyeWhite: '#FFFFFF', pupil: '#003D33', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.5)' },
  audio:    { bg: '#6A1B9A', bgGrad: '#8E24AA', cheek: 'rgba(255,255,255,0.12)', eyeWhite: '#FFFFFF', pupil: '#3A0050', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.6)' },
  happy:    { bg: '#1273EA', bgGrad: '#2E8BFF', cheek: 'rgba(255,255,255,0.14)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.7)' },
  error:    { bg: '#D32F2F', bgGrad: '#E53935', cheek: 'rgba(255,255,255,0.10)', eyeWhite: '#FFFFFF', pupil: '#7A0000', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.5)' },
  alert:    { bg: '#F57C00', bgGrad: '#FB8C00', cheek: 'rgba(255,255,255,0.12)', eyeWhite: '#FFFFFF', pupil: '#7A3C00', shine: '#FFFFFF', mouthColor: '#FFFFFF', orbitColor: 'rgba(255,255,255,0.6)' },
};

// ── Eye configs — scaleY nunca abaixo de 0.10 para olhos sempre visíveis ─────
const EYE_CONFIG = {
  idle:     { scaleY: 1.0,  tx: 'sides',  pupilDx: 0,   pupilDy: 0,   shape: 'round',    blink: true  },
  thinking: { scaleY: 0.65, tx: 'up',     pupilDx: 0,   pupilDy: -1.5,shape: 'round',    blink: false },
  upload:   { scaleY: 1.25, tx: 'center', pupilDx: 0,   pupilDy: 0,   shape: 'wide',     blink: false },
  done:     { scaleY: 0.45, tx: 'center', pupilDx: 0,   pupilDy: 2,   shape: 'happy',    blink: false },
  text:     { scaleY: 1.0,  tx: 'center', pupilDx: 0,   pupilDy: 0,   shape: 'round',    blink: true  },
  photo:    { scaleY: 1.3,  tx: 'center', pupilDx: 0,   pupilDy: 0,   shape: 'wide',     blink: false },
  code:     { scaleY: 0.80, tx: 'left',   pupilDx: -2,  pupilDy: 0,   shape: 'round',    blink: true  },
  book:     { scaleY: 0.55, tx: 'up',     pupilDx: 0,   pupilDy: -2,  shape: 'round',    blink: false },
  audio:    { scaleY: 0.85, tx: 'center', pupilDx: 0,   pupilDy: 0,   shape: 'round',    blink: true  },
  happy:    { scaleY: 0.42, tx: 'center', pupilDx: 0,   pupilDy: 2,   shape: 'happy',    blink: false },
  error:    { scaleY: 0.75, tx: 'center', pupilDx: 0,   pupilDy: 0,   shape: 'sad',      blink: false },
  alert:    { scaleY: 1.2,  tx: 'center', pupilDx: 0,   pupilDy: 0,   shape: 'wide',     blink: false },
};

const WRAP_ANIM = {
  idle: 's-breathe', thinking: 's-breathe', upload: 's-wiggle',
  done: 's-bounce', text: 's-nod', photo: 's-pop',
  code: 's-breathe', book: 's-nod', audio: 's-breathe',
  happy: 's-pop', error: 's-shake', alert: 's-wiggle',
};

// ── SVG principal ─────────────────────────────────────────────────────────────
function FaceSVG({ size, state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.idle;
  const ec  = EYE_CONFIG[state]   || EYE_CONFIG.idle;
  const cx  = size / 2;
  const cy  = size / 2;
  const r   = size * 0.46;

  // Posição dos olhos — estilo ML: bem centrados, levemente na metade superior
  const eyeY  = cy * 0.90;
  const eyeGap = r * 0.50;
  const eyeLx = cx - eyeGap;
  const eyeRx = cx + eyeGap;

  // Tamanho dos olhos — bem grandes, oval horizontal
  const erxBase = r * 0.285;
  const eryBase = r * 0.300;
  const erx = erxBase;
  const ery = eryBase * Math.max(0.15, ec.scaleY); // nunca some completamente

  // Pupila
  const prx = erxBase * 0.50;
  const pry = erxBase * 0.52;
  const glr = erxBase * 0.22; // brilho

  // Animações dos olhos
  let blinkCls = '';
  let moveCls  = '';
  if (ec.blink) blinkCls = 'af4-blink';
  if (ec.tx === 'sides') moveCls = 'af4-sides';
  else if (ec.tx === 'left') moveCls = 'af4-look-left';
  else if (ec.tx === 'up')   moveCls = 'af4-look-up';

  const gradId   = `af4g-${state}-${Math.round(size)}`;
  const shadowId = `af4s-${state}-${Math.round(size)}`;

  // Renderiza um olho individual
  function Eye({ x, mirror }) {
    const pupilX = x + ec.pupilDx * (mirror ? -1 : 1);
    const pupilY = eyeY + ec.pupilDy;

    if (ec.shape === 'happy') {
      // Olho em forma de "^" sorridente — como o ML
      const arcH = ery * 0.9;
      return (
        <g>
          {/* Base branca */}
          <ellipse cx={x} cy={eyeY + ery * 0.15} rx={erx} ry={ery * 0.60} fill={cfg.eyeWhite} />
          {/* Arco escuro preenchendo metade superior */}
          <path
            d={`M${x - erx * 0.88} ${eyeY + ery * 0.15}
                Q${x} ${eyeY - arcH}
                ${x + erx * 0.88} ${eyeY + ery * 0.15}
                L${x + erx * 0.88} ${eyeY + ery * 0.60}
                Q${x} ${eyeY + ery * 0.3}
                ${x - erx * 0.88} ${eyeY + ery * 0.60}Z`}
            fill={cfg.pupil}
          />
          {/* Brilho */}
          <ellipse cx={x - erx * 0.28} cy={eyeY - ery * 0.08} rx={glr * 0.85} ry={glr * 0.85} fill={cfg.shine} opacity="0.9" />
        </g>
      );
    }

    if (ec.shape === 'sad') {
      // Olho levemente virado — triste
      return (
        <g>
          <ellipse cx={x} cy={eyeY} rx={erx} ry={ery} fill={cfg.eyeWhite} />
          <ellipse cx={pupilX} cy={pupilY} rx={prx * 1.05} ry={pry * 1.05} fill={cfg.pupil} />
          <ellipse cx={pupilX} cy={pupilY} rx={prx * 0.55} ry={pry * 0.55} fill="rgba(0,0,0,0.55)" />
          <ellipse cx={pupilX - erx * 0.18} cy={pupilY - ery * 0.25} rx={glr * 0.9} ry={glr * 0.9} fill={cfg.shine} opacity="0.9" />
        </g>
      );
    }

    // Olho padrão / wide / round
    const extraScale = ec.shape === 'wide' ? 1.08 : 1.0;
    return (
      <g>
        {/* Sombra sutil */}
        <ellipse cx={x} cy={eyeY + 1.5} rx={erx * extraScale + 1} ry={ery * extraScale + 0.5} fill="rgba(0,0,0,0.18)" />
        {/* Branco do olho */}
        <ellipse cx={x} cy={eyeY} rx={erx * extraScale} ry={ery * extraScale} fill={cfg.eyeWhite} />
        {/* Íris */}
        <ellipse
          cx={pupilX} cy={pupilY}
          rx={prx * 1.05} ry={pry * 1.05}
          fill={cfg.pupil}
          style={ec.tx === 'sides' ? { animation: mirror ? 'af4-look-right 3.5s ease-in-out infinite' : 'af4-look-left 3.5s ease-in-out infinite' } :
                 ec.tx === 'left'  ? { animation: 'af4-look-left 2.5s ease-in-out infinite' } :
                 ec.tx === 'up'    ? { animation: 'af4-look-up 2.8s ease-in-out infinite' } : {}}
        />
        {/* Pupila central */}
        <ellipse
          cx={pupilX} cy={pupilY}
          rx={prx * 0.55} ry={pry * 0.55}
          fill="rgba(0,0,0,0.60)"
          style={ec.tx === 'sides' ? { animation: mirror ? 'af4-look-right 3.5s ease-in-out infinite' : 'af4-look-left 3.5s ease-in-out infinite' } :
                 ec.tx === 'left'  ? { animation: 'af4-look-left 2.5s ease-in-out infinite' } :
                 ec.tx === 'up'    ? { animation: 'af4-look-up 2.8s ease-in-out infinite' } : {}}
        />
        {/* Brilho principal */}
        <ellipse cx={x - erx * 0.22} cy={eyeY - ery * 0.28} rx={glr} ry={glr} fill={cfg.shine} opacity="0.95" />
        {/* Brilho secundário */}
        <ellipse cx={x + erx * 0.16} cy={eyeY + ery * 0.18} rx={glr * 0.38} ry={glr * 0.38} fill={cfg.shine} opacity="0.50" />
      </g>
    );
  }

  // Boca
  function Mouth() {
    const my = cy * 1.22;
    const mw = r * 0.36;
    const sw = size * 0.030;

    if (state === 'done' || state === 'happy') {
      // Sorriso grande amplo
      return <path d={`M${cx - mw * 1.0} ${my - r * 0.02} Q${cx} ${my + r * 0.22} ${cx + mw * 1.0} ${my - r * 0.02}`}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw} strokeLinecap="round" opacity="0.95" />;
    }
    if (state === 'upload' || state === 'photo' || state === 'alert') {
      // "O" surpresa
      return <ellipse cx={cx} cy={my} rx={mw * 0.38} ry={mw * 0.33}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw * 0.85} opacity="0.85" />;
    }
    if (state === 'thinking' || state === 'book') {
      // Boca reta pensativa
      return <path d={`M${cx - mw * 0.50} ${my} L${cx + mw * 0.50} ${my}`}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw * 0.80} strokeLinecap="round" opacity="0.50" />;
    }
    if (state === 'error') {
      // Boca curvada para baixo
      return <path d={`M${cx - mw * 0.70} ${my + r * 0.06} Q${cx} ${my - r * 0.10} ${cx + mw * 0.70} ${my + r * 0.06}`}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw} strokeLinecap="round" opacity="0.85" />;
    }
    // Sorriso suave padrão
    return <path d={`M${cx - mw * 0.62} ${my} Q${cx} ${my + r * 0.12} ${cx + mw * 0.62} ${my}`}
      fill="none" stroke={cfg.mouthColor} strokeWidth={sw * 0.85} strokeLinecap="round" opacity="0.75" />;
  }

  // Sobrancelhas (thinking, book, error)
  function Eyebrows() {
    if (state !== 'thinking' && state !== 'book' && state !== 'error') return null;
    const byL = eyeY - ery - size * 0.050;
    const byR = byL;
    const sw  = size * 0.024;
    if (state === 'error') {
      return (
        <>
          <path d={`M${eyeLx - erx * 0.65} ${byL + size * 0.018} L${eyeLx + erx * 0.55} ${byL}`}
            fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" opacity="0.85" />
          <path d={`M${eyeRx + erx * 0.65} ${byR + size * 0.018} L${eyeRx - erx * 0.55} ${byR}`}
            fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" opacity="0.85" />
        </>
      );
    }
    return (
      <>
        <path d={`M${eyeLx - erx * 0.65} ${byL} L${eyeLx + erx * 0.50} ${byL + size * 0.012}`}
          fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" opacity="0.65" />
        <path d={`M${eyeRx + erx * 0.65} ${byR} L${eyeRx - erx * 0.50} ${byR + size * 0.012}`}
          fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" opacity="0.65" />
      </>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <radialGradient id={gradId} cx="45%" cy="32%" r="65%">
          <stop offset="0%" stopColor={cfg.bgGrad} />
          <stop offset="100%" stopColor={cfg.bg} />
        </radialGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.28)" />
        </filter>
        <clipPath id={`af4-clip-${Math.round(size)}`}>
          <circle cx={cx} cy={cy} r={r * 0.99} />
        </clipPath>
      </defs>

      {/* Sombra externa */}
      <circle cx={cx} cy={cy + size * 0.022} r={r} fill="rgba(0,0,0,0.20)" />

      {/* Face */}
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gradId})`} filter={`url(#${shadowId})`} />

      {/* Highlight superior suave */}
      <ellipse cx={cx} cy={cy - r * 0.35} rx={r * 0.58} ry={r * 0.28} fill="rgba(255,255,255,0.10)" />

      {/* Borda */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={size * 0.010} />

      {/* Bochechas sutis */}
      <ellipse cx={cx * 0.46} cy={cy * 1.12} rx={r * 0.26} ry={r * 0.14} fill={cfg.cheek} />
      <ellipse cx={cx * 1.54} cy={cy * 1.12} rx={r * 0.26} ry={r * 0.14} fill={cfg.cheek} />

      {/* Grupo de olhos com clip e animação de piscada */}
      <g clipPath={`url(#af4-clip-${Math.round(size)})`}>
        <Eyebrows />
        {/* Olho esquerdo — grupo com piscada via scaleY */}
        <g
          style={ec.blink ? {
            transformOrigin: `${eyeLx}px ${eyeY}px`,
            animation: 'af4-blink 4.5s ease-in-out infinite',
          } : {}}
        >
          <Eye x={eyeLx} mirror={false} />
        </g>
        {/* Olho direito */}
        <g
          style={ec.blink ? {
            transformOrigin: `${eyeRx}px ${eyeY}px`,
            animation: 'af4-blink 4.5s ease-in-out 0.08s infinite',
          } : {}}
        >
          <Eye x={eyeRx} mirror={true} />
        </g>
      </g>

      {/* Boca */}
      <Mouth />

      {/* Nariz mini */}
      <ellipse cx={cx} cy={cy * 1.06} rx={size * 0.018} ry={size * 0.013} fill="rgba(255,255,255,0.15)" />
    </svg>
  );
}

// ── Partículas orbitais ───────────────────────────────────────────────────────
function OrbitParticles({ size, state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.idle;
  const orbits = [
    { r: size * 0.535, dur: '3.4s', delay: '0s',   dir: 'cw',  sz: Math.max(5, size * 0.10), sparkDur: '3.0s', sparkDelay: '0s'   },
    { r: size * 0.560, dur: '5.2s', delay: '1.0s', dir: 'ccw', sz: Math.max(4, size * 0.08), sparkDur: '4.8s', sparkDelay: '0.8s' },
    { r: size * 0.510, dur: '4.1s', delay: '1.8s', dir: 'cw',  sz: Math.max(4, size * 0.07), sparkDur: '3.8s', sparkDelay: '1.4s' },
  ];

  return (
    <>
      {orbits.map((o, i) => {
        const diam   = o.r * 2;
        const offset = (size - diam) / 2;
        return (
          <div key={i}
            className={`af4-orbit-ring ${o.dir}`}
            style={{ left: offset, top: offset, width: diam, height: diam, '--dur': o.dur, '--delay': o.delay }}
          >
            <div className="af4-spark-dot" style={{ '--dur': o.sparkDur, '--delay': o.sparkDelay, marginLeft: `-${o.sz / 2}px` }}>
              <svg width={o.sz} height={o.sz} viewBox="-5 -5 10 10">
                <path d="M0,-4 C0.4,-1.6 1.6,-0.4 4,0 C1.6,0.4 0.4,1.6 0,4 C-0.4,1.6 -1.6,0.4 -4,0 C-1.6,-0.4 -0.4,-1.6 0,-4Z"
                  fill={cfg.orbitColor} />
              </svg>
            </div>
          </div>
        );
      })}

      {/* Estrelinhas fixas */}
      {[
        { x: size * 0.10, y: size * 0.12, sz: size * 0.085, delay: '0s',   dur: '2.2s' },
        { x: size * 0.84, y: size * 0.09, sz: size * 0.070, delay: '0.9s', dur: '3.0s' },
        { x: size * 0.88, y: size * 0.76, sz: size * 0.075, delay: '1.5s', dur: '2.5s' },
        { x: size * 0.07, y: size * 0.74, sz: size * 0.065, delay: '0.4s', dur: '3.3s' },
      ].map((p, i) => (
        <div key={`st-${i}`}
          style={{ position: 'absolute', left: p.x - p.sz/2, top: p.y - p.sz/2, animation: `af4-spark ${p.dur} ease-in-out ${p.delay} infinite`, pointerEvents: 'none' }}
        >
          <svg width={p.sz} height={p.sz} viewBox="-6 -6 12 12">
            <path d="M0,-5 L1.2,-1.6 L4.8,-1.6 L1.9,0.6 L3,4 L0,1.8 L-3,4 L-1.9,0.6 L-4.8,-1.6 L-1.2,-1.6Z"
              fill={cfg.orbitColor} />
          </svg>
        </div>
      ))}
    </>
  );
}

// ── Dots "pensando" ───────────────────────────────────────────────────────────
function ThinkingDots({ size }) {
  return (
    <div style={{ position: 'absolute', bottom: size * 0.03, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: size * 0.05, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width:  size * 0.060,
          height: size * 0.060,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.85)',
          animation: `af4-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyizFace({ size = 62, state = 'idle' }) {
  injectCSS();
  const resolvedState = STATE_CONFIG[state] ? state : 'idle';
  const wc = WRAP_ANIM[resolvedState] || 's-breathe';

  return (
    <div className={`af4-wrap ${wc}`} style={{ width: size, height: size, position: 'relative' }}>
      <OrbitParticles size={size} state={resolvedState} />

      <div style={{ position: 'relative', zIndex: 2, width: size, height: size }}>
        <FaceSVG size={size} state={resolvedState} />
      </div>

      {resolvedState === 'thinking' && (
        <ThinkingDots size={size} />
      )}
    </div>
  );
}

// ── Hook utilitário ───────────────────────────────────────────────────────────
export function useAnalyizFaceState({
  isLoading    = false,
  isUploading  = false,
  justDone     = false,
  isTyping     = false,
  isError      = false,
  fileType     = null,
} = {}) {
  if (isError)     return 'error';
  if (justDone)    return 'done';
  if (isUploading) return 'upload';
  if (isLoading)   return 'thinking';
  if (isTyping)    return 'text';
  if (!fileType)   return 'idle';
  const map = {
    pdf: 'book', xlsx: 'book', xls: 'book', csv: 'book', md: 'book',
    mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', webm: 'audio',
    jpg: 'photo', jpeg: 'photo', png: 'photo', gif: 'photo', webp: 'photo',
    js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code',
    html: 'code', css: 'code',
    txt: 'text',
  };
  return map[fileType.toLowerCase()] || 'text';
}