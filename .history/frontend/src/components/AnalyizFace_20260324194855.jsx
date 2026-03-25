// AnalyizFace.jsx — v3 — Rosto 2D fofo com olhos enormes expressivos
// Bolinha com olhos que piscam, olham pros lados, brilhos de cometas e estrelas orbitando
// SEM 3D — SVG puro, flat design expressivo
//
// States: idle | thinking | upload | done | text | photo | code | book | audio | happy

import React, { useEffect, useRef, useState } from 'react';

// ── CSS Animations ────────────────────────────────────────────────────────────
const FACE_CSS = `
  @keyframes af3-blink     { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(0.06)} }
  @keyframes af3-look-left { 0%,40%,100%{transform:translateX(0)} 50%,90%{transform:translateX(-3.5px)} }
  @keyframes af3-look-right{ 0%,40%,100%{transform:translateX(0)} 50%,90%{transform:translateX(3.5px)} }
  @keyframes af3-look-up   { 0%,40%,100%{transform:translateY(0)} 50%,85%{transform:translateY(-3px)} }
  @keyframes af3-breathe   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.035)} }
  @keyframes af3-bounce    { 0%,100%{transform:translateY(0) scale(1)} 30%{transform:translateY(-5px) scale(1.04)} 60%{transform:translateY(-1px) scale(1.01)} }
  @keyframes af3-wiggle    { 0%,100%{transform:rotate(0deg)} 25%{transform:rotate(-5deg)} 75%{transform:rotate(5deg)} }
  @keyframes af3-nod       { 0%,100%{transform:translateY(0) rotate(0)} 30%{transform:translateY(-3px) rotate(-2deg)} 70%{transform:translateY(2px) rotate(2deg)} }
  @keyframes af3-pop       { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }

  /* Cometas / estrelas orbitando */
  @keyframes af3-orbit-cw  { from{transform:rotate(0deg)}   to{transform:rotate(360deg)} }
  @keyframes af3-orbit-ccw { from{transform:rotate(0deg)}   to{transform:rotate(-360deg)} }
  @keyframes af3-comet-pulse{ 0%,100%{opacity:0;transform:scale(0.3)} 40%,60%{opacity:1;transform:scale(1)} }
  @keyframes af3-star-twinkle{ 0%,100%{opacity:0.2;transform:scale(0.5)} 50%{opacity:1;transform:scale(1.2)} }

  /* Partículas flutuando */
  @keyframes af3-float-up  { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-22px) scale(0.2)} }

  /* Dots thinking */
  @keyframes af3-dot-bounce{ 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-4px);opacity:1} }

  .af3-wrap { position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
  .af3-wrap.s-breathe { animation: af3-breathe 3s ease-in-out infinite; }
  .af3-wrap.s-bounce  { animation: af3-bounce  0.55s ease-out infinite; }
  .af3-wrap.s-wiggle  { animation: af3-wiggle  0.7s ease-in-out infinite; }
  .af3-wrap.s-nod     { animation: af3-nod     1.2s ease-in-out infinite; }
  .af3-wrap.s-pop     { animation: af3-pop     0.65s ease-in-out infinite; }

  .af3-orbit-ring { position:absolute; inset:0; border-radius:50%; pointer-events:none; }
  .af3-orbit-ring.cw  { animation: af3-orbit-cw  var(--dur,3s) linear var(--delay,0s) infinite; }
  .af3-orbit-ring.ccw { animation: af3-orbit-ccw var(--dur,4s) linear var(--delay,0s) infinite; }

  .af3-particle { position:absolute; pointer-events:none; }
  .af3-particle.float { animation: af3-float-up 2s ease-out var(--delay,0s) infinite; }
  .af3-particle.twinkle { animation: af3-star-twinkle var(--dur,1.8s) ease-in-out var(--delay,0s) infinite; }
  .af3-particle.comet-p { animation: af3-comet-pulse var(--dur,2.2s) ease-in-out var(--delay,0s) infinite; }
`;

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = FACE_CSS;
  document.head.appendChild(s);
}

// ── Cores por estado ──────────────────────────────────────────────────────────
const STATE_COLORS = {
  idle:     { face:'#1e293b', cheek:'#e87a8a', orbit1:'#4285F4', orbit2:'#9B72CB', eye:'#fff', mouth:'#D96570' },
  thinking: { face:'#1e293b', cheek:'#9B72CB', orbit1:'#9B72CB', orbit2:'#4285F4', eye:'#fff', mouth:'#9B72CB' },
  upload:   { face:'#1a2d5a', cheek:'#4285F4', orbit1:'#4285F4', orbit2:'#60a5fa', eye:'#fff', mouth:'#4285F4' },
  done:     { face:'#0d3320', cheek:'#10b981', orbit1:'#10b981', orbit2:'#34d399', eye:'#fff', mouth:'#10b981' },
  text:     { face:'#1e293b', cheek:'#e87a8a', orbit1:'#D96570', orbit2:'#9B72CB', eye:'#fff', mouth:'#D96570' },
  photo:    { face:'#2d1a00', cheek:'#EF9F27', orbit1:'#EF9F27', orbit2:'#fbbf24', eye:'#fff', mouth:'#EF9F27' },
  code:     { face:'#0d1f3c', cheek:'#4285F4', orbit1:'#4285F4', orbit2:'#60a5fa', eye:'#fff', mouth:'#4285F4' },
  book:     { face:'#1a2d1a', cheek:'#1D9E75', orbit1:'#1D9E75', orbit2:'#34d399', eye:'#fff', mouth:'#1D9E75' },
  audio:    { face:'#2d0a1a', cheek:'#D96570', orbit1:'#D96570', orbit2:'#f87171', eye:'#fff', mouth:'#D96570' },
  happy:    { face:'#1e293b', cheek:'#e87a8a', orbit1:'#EF9F27', orbit2:'#D96570', eye:'#fff', mouth:'#EF9F27' },
};

// ── Configuração de olhos por estado ──────────────────────────────────────────
const EYE_CONFIGS = {
  idle:     { scaleY:1,    tx:'look-sides', pupilY:0,  pupilX:0,  shape:'normal',   blinkCls:'af3-blink' },
  thinking: { scaleY:0.52, tx:'look-up',   pupilY:-2, pupilX:0,  shape:'normal',   blinkCls:'' },
  upload:   { scaleY:1.3,  tx:'center',    pupilY:0,  pupilX:0,  shape:'surprised', blinkCls:'' },
  done:     { scaleY:0.38, tx:'center',    pupilY:3,  pupilX:0,  shape:'happy',     blinkCls:'' },
  text:     { scaleY:1.05, tx:'center',    pupilY:0,  pupilX:0,  shape:'normal',    blinkCls:'af3-blink' },
  photo:    { scaleY:1.35, tx:'center',    pupilY:0,  pupilX:0,  shape:'surprised', blinkCls:'' },
  code:     { scaleY:0.85, tx:'look-left', pupilY:0,  pupilX:-2, shape:'normal',    blinkCls:'af3-blink' },
  book:     { scaleY:0.60, tx:'look-up',   pupilY:-3, pupilX:0,  shape:'normal',    blinkCls:'' },
  audio:    { scaleY:0.75, tx:'center',    pupilY:0,  pupilX:0,  shape:'normal',    blinkCls:'af3-blink' },
  happy:    { scaleY:0.40, tx:'center',    pupilY:3,  pupilX:0,  shape:'happy',     blinkCls:'' },
};

// ── SVG Face Principal ────────────────────────────────────────────────────────
function FaceSVG({ size, state = 'idle' }) {
  const s  = size;
  const cx = s / 2;
  const cy = s / 2;
  const r  = s * 0.448;
  const col = STATE_COLORS[state] || STATE_COLORS.idle;
  const ec  = EYE_CONFIGS[state] || EYE_CONFIGS.idle;

  // Posições dos olhos — bem grandes e centrados
  const eyeLx = cx * 0.62;
  const eyeRx = cx * 1.38;
  const eyeY  = cy * 0.91;

  // Olho: raios bem grandes
  const erxBase = r * 0.295;
  const eryBase = r * 0.33;
  const erx = erxBase;
  const ery = eryBase * ec.scaleY;

  // Pupila
  const prx = erxBase * 0.55;
  const pry = erxBase * 0.56;
  // Brilho principal
  const glr = erxBase * 0.26;

  // Animação horizontal dos olhos
  let eyeLClass = '', eyeRClass = '';
  if (ec.tx === 'look-sides') { eyeLClass = 'af3-look-left'; eyeRClass = 'af3-look-right'; }
  else if (ec.tx === 'look-left')  { eyeLClass = 'af3-look-left'; eyeRClass = 'af3-look-left'; }
  else if (ec.tx === 'look-up')    { eyeLClass = 'af3-look-up';   eyeRClass = 'af3-look-up'; }

  const gradId = `af3-face-${s}-${state}`;
  const cheekId = `af3-cheek-${s}-${state}`;

  function NormalEye({ x, animClass }) {
    return (
      <g>
        {/* Sombra suave atrás do olho */}
        <ellipse cx={x} cy={eyeY + 1} rx={erx + 2} ry={ery + 1} fill="rgba(0,0,0,0.25)" />
        {/* Branco do olho */}
        <ellipse cx={x} cy={eyeY} rx={erx} ry={ery} fill="white" />
        {/* Íris */}
        <ellipse
          cx={x + ec.pupilX} cy={eyeY + ec.pupilY}
          rx={prx * 1.05} ry={pry * 1.05}
          fill="#1a2550"
          className={animClass}
          style={{ animationDuration: animClass === 'af3-look-sides' ? '3s' : '2.5s' }}
        />
        {/* Pupila */}
        <ellipse
          cx={x + ec.pupilX} cy={eyeY + ec.pupilY}
          rx={prx * 0.6} ry={pry * 0.6}
          fill="#060c20"
          className={animClass}
        />
        {/* Brilho 1 */}
        <ellipse
          cx={x + ec.pupilX - erx * 0.22}
          cy={eyeY + ec.pupilY - ery * 0.28}
          rx={glr} ry={glr}
          fill="white" opacity="0.95"
        />
        {/* Brilho 2 pequeno */}
        <ellipse
          cx={x + ec.pupilX + erx * 0.18}
          cy={eyeY + ec.pupilY + ery * 0.20}
          rx={glr * 0.42} ry={glr * 0.42}
          fill="white" opacity="0.55"
        />
        {/* Cílios — linha superior */}
        <path
          d={`M${x - erx * 0.92} ${eyeY - ery} Q${x} ${eyeY - ery * 1.18} ${x + erx * 0.92} ${eyeY - ery}`}
          fill="none" stroke="#1a1a2e" strokeWidth={s * 0.018} strokeLinecap="round" opacity="0.7"
        />
      </g>
    );
  }

  function HappyEye({ x }) {
    // Olho em formato de "^" — sorrindo
    return (
      <g>
        <ellipse cx={x} cy={eyeY + ery * 0.2} rx={erx} ry={ery * 0.5} fill="white" />
        <path
          d={`M${x - erx * 0.85} ${eyeY + ery * 0.1} Q${x} ${eyeY - ery * 0.85} ${x + erx * 0.85} ${eyeY + ery * 0.1}`}
          fill="#1a2550"
          clipPath={`inset(0 0 50% 0)`}
        />
        {/* Versão simples: arco cheio */}
        <path
          d={`M${x - erx * 0.85} ${eyeY + ery * 0.12}
              Q${x} ${eyeY - ery * 1.0} ${x + erx * 0.85} ${eyeY + ery * 0.12}
              L${x + erx * 0.85} ${eyeY + ery * 0.5}
              Q${x} ${eyeY + ery * 0.3} ${x - erx * 0.85} ${eyeY + ery * 0.5}Z`}
          fill="#1a2550"
        />
        <ellipse cx={x - erx * 0.22} cy={eyeY - ery * 0.06} rx={glr * 0.95} ry={glr * 0.95} fill="white" opacity="0.9" />
      </g>
    );
  }

  function SurprisedEye({ x }) {
    return (
      <g>
        <ellipse cx={x} cy={eyeY} rx={erx * 1.12} ry={ery * 1.12} fill="white" />
        <ellipse cx={x} cy={eyeY} rx={prx * 1.1} ry={pry * 1.1} fill="#1a2550" />
        <ellipse cx={x} cy={eyeY} rx={prx * 0.6} ry={pry * 0.6} fill="#060c20" />
        <ellipse cx={x - erx * 0.28} cy={eyeY - ery * 0.32} rx={glr * 1.1} ry={glr * 1.1} fill="white" opacity="0.95" />
        <ellipse cx={x + erx * 0.20} cy={eyeY + ery * 0.22} rx={glr * 0.44} ry={glr * 0.44} fill="white" opacity="0.55" />
      </g>
    );
  }

  // Boca
  function Mouth() {
    const my = cy * 1.25;
    const mw = r * 0.38;
    if (state === 'done' || state === 'happy' || state === 'text') {
      // Sorriso grande
      return <path d={`M${cx - mw} ${my} Q${cx} ${my + r * 0.18} ${cx + mw} ${my}`}
        fill="none" stroke={col.mouth} strokeWidth={s * 0.030} strokeLinecap="round" opacity="0.9" />;
    }
    if (state === 'upload' || state === 'photo') {
      // Boca "O" surpresa
      return <ellipse cx={cx} cy={my + r * 0.02} rx={mw * 0.45} ry={mw * 0.38}
        fill="none" stroke={col.mouth} strokeWidth={s * 0.025} opacity="0.85" />;
    }
    if (state === 'thinking' || state === 'book') {
      // Boca reta pensativa
      return <path d={`M${cx - mw * 0.55} ${my} L${cx + mw * 0.55} ${my}`}
        fill="none" stroke={col.mouth} strokeWidth={s * 0.022} strokeLinecap="round" opacity="0.5" />;
    }
    // Default: sorrisinho leve
    return <path d={`M${cx - mw * 0.65} ${my} Q${cx} ${my + r * 0.10} ${cx + mw * 0.65} ${my}`}
      fill="none" stroke={col.mouth} strokeWidth={s * 0.024} strokeLinecap="round" opacity="0.65" />;
  }

  const eyeL = ec.shape === 'happy' ? <HappyEye x={eyeLx} /> :
               ec.shape === 'surprised' ? <SurprisedEye x={eyeLx} /> :
               <NormalEye x={eyeLx} animClass={ec.blinkCls || (ec.tx === 'look-sides' ? '' : '')} />;
  const eyeR = ec.shape === 'happy' ? <HappyEye x={eyeRx} /> :
               ec.shape === 'surprised' ? <SurprisedEye x={eyeRx} /> :
               <NormalEye x={eyeRx} animClass={ec.blinkCls} />;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg" style={{ display:'block', flexShrink:0 }}>
      <defs>
        <radialGradient id={gradId} cx="50%" cy="38%" r="58%">
          <stop offset="0%" stopColor={lighten(col.face, 18)} />
          <stop offset="100%" stopColor={col.face} />
        </radialGradient>
        <radialGradient id={cheekId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={col.cheek} stopOpacity="0.55" />
          <stop offset="100%" stopColor={col.cheek} stopOpacity="0" />
        </radialGradient>
        {/* Recorte para olhos dentro da face */}
        <clipPath id={`af3-face-clip-${s}`}>
          <circle cx={cx} cy={cy} r={r * 0.98} />
        </clipPath>
      </defs>

      {/* Sombra da face */}
      <circle cx={cx} cy={cy + s * 0.025} r={r * 0.97} fill="rgba(0,0,0,0.22)" />

      {/* Face principal */}
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gradId})`} />

      {/* Borda sutil */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={s * 0.012} />

      {/* Bochechas */}
      <ellipse cx={cx * 0.44} cy={cy * 1.15} rx={r * 0.28} ry={r * 0.17} fill={`url(#${cheekId})`} />
      <ellipse cx={cx * 1.56} cy={cy * 1.15} rx={r * 0.28} ry={r * 0.17} fill={`url(#${cheekId})`} />

      {/* Olhos */}
      <g clipPath={`url(#af3-face-clip-${s})`}>
        {/* Sobrancelhas */}
        {(state === 'thinking' || state === 'book') && (
          <>
            <path d={`M${eyeLx - erx * 0.7} ${eyeY - ery - s * 0.04} L${eyeLx + erx * 0.5} ${eyeY - ery - s * 0.02}`}
              fill="none" stroke={col.cheek} strokeWidth={s * 0.022} strokeLinecap="round" opacity="0.7" />
            <path d={`M${eyeRx + erx * 0.7} ${eyeY - ery - s * 0.04} L${eyeRx - erx * 0.5} ${eyeY - ery - s * 0.02}`}
              fill="none" stroke={col.cheek} strokeWidth={s * 0.022} strokeLinecap="round" opacity="0.7" />
          </>
        )}
        {eyeL}
        {eyeR}
      </g>

      {/* Boca */}
      <Mouth />

      {/* Nariz pontinho */}
      <ellipse cx={cx} cy={cy * 1.08} rx={s * 0.022} ry={s * 0.016} fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}

// helper para clarear uma cor hex
function lighten(hex, pct) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, (n >> 16) + pct);
  const g = Math.min(255, ((n >> 8) & 0xff) + pct);
  const b = Math.min(255, (n & 0xff) + pct);
  return `rgb(${r},${g},${b})`;
}

// ── Cometas / estrelas orbitando ─────────────────────────────────────────────
function OrbitParticles({ size, state }) {
  const col = STATE_COLORS[state] || STATE_COLORS.idle;
  const cx  = size / 2;

  // 3 anéis orbitais com cometas/estrelas
  const orbits = [
    { r: size * 0.54, dur: '3.2s', delay: '0s',    dir: 'cw',  color: col.orbit1, dotSz: Math.max(4, size * 0.10), shape: 'comet' },
    { r: size * 0.56, dur: '5.0s', delay: '0.8s',  dir: 'ccw', color: col.orbit2, dotSz: Math.max(3, size * 0.08), shape: 'star'  },
    { r: size * 0.51, dur: '4.0s', delay: '1.6s',  dir: 'cw',  color: col.orbit1, dotSz: Math.max(3, size * 0.07), shape: 'comet' },
  ];

  return (
    <>
      {orbits.map((o, i) => {
        const diam   = o.r * 2;
        const offset = (size - diam) / 2;
        return (
          <div key={i}
            className={`af3-orbit-ring ${o.dir}`}
            style={{
              left: offset, top: offset,
              width: diam, height: diam,
              '--dur': o.dur, '--delay': o.delay,
            }}
          >
            {/* Partícula no topo do anel */}
            <div
              className="af3-particle comet-p"
              style={{
                position: 'absolute',
                top: -o.dotSz / 2,
                left: '50%',
                marginLeft: -o.dotSz / 2,
                '--dur': o.dur,
                '--delay': o.delay,
              }}
            >
              {o.shape === 'comet'
                ? <CometSVG size={o.dotSz} color={o.color} />
                : <StarSVG  size={o.dotSz} color={o.color} />
              }
            </div>
            {/* Segunda partícula na posição oposta (180°) */}
            <div
              className="af3-particle comet-p"
              style={{
                position: 'absolute',
                bottom: -o.dotSz / 2,
                left: '50%',
                marginLeft: -o.dotSz / 2,
                '--dur': o.dur,
                '--delay': `calc(${o.dur} * 0.5 + ${o.delay})`,
              }}
            >
              {o.shape === 'star'
                ? <CometSVG size={o.dotSz * 0.75} color={o.color} />
                : <StarSVG  size={o.dotSz * 0.75} color={o.color} />
              }
            </div>
          </div>
        );
      })}

      {/* Estrelinhas fixas piscando ao redor */}
      {[
        { x: size * 0.08, y: size * 0.12, sz: size * 0.09, color: col.orbit1, delay: '0s',    dur: '2.1s' },
        { x: size * 0.82, y: size * 0.08, sz: size * 0.07, color: col.orbit2, delay: '0.7s',  dur: '2.8s' },
        { x: size * 0.88, y: size * 0.78, sz: size * 0.08, color: col.orbit1, delay: '1.4s',  dur: '2.3s' },
        { x: size * 0.05, y: size * 0.72, sz: size * 0.07, color: col.orbit2, delay: '0.3s',  dur: '3.1s' },
      ].map((p, i) => (
        <div key={`sp-${i}`}
          className="af3-particle twinkle"
          style={{ left: p.x - p.sz/2, top: p.y - p.sz/2, '--dur': p.dur, '--delay': p.delay }}
        >
          <StarSVG size={p.sz} color={p.color} />
        </div>
      ))}
    </>
  );
}

// SVG de cometa (diamante com cauda)
function CometSVG({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="-6 -6 12 12">
      <path d="M0,-5 C0.4,-2 2,-0.4 5,0 C2,0.4 0.4,2 0,5 C-0.4,2 -2,0.4 -5,0 C-2,-0.4 -0.4,-2 0,-5Z"
        fill={color} />
      <ellipse cx={0} cy={0} rx={2} ry={2} fill="white" opacity="0.8" />
    </svg>
  );
}

// SVG de estrela de 5 pontas
function StarSVG({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="-6 -6 12 12">
      <path d="M0,-5 L1.2,-1.6 L4.8,-1.6 L1.9,0.6 L3,4 L0,1.8 L-3,4 L-1.9,0.6 L-4.8,-1.6 L-1.2,-1.6Z"
        fill={color} />
    </svg>
  );
}

// ── Acessórios por estado ────────────────────────────────────────────────────
function Dots({ size, color }) {
  const dots = [0, 1, 2];
  return (
    <div style={{ position:'absolute', bottom: size * 0.04, left:'50%', transform:'translateX(-50%)', display:'flex', gap: size * 0.055, alignItems:'center' }}>
      {dots.map(i => (
        <div key={i} style={{
          width: size * 0.062, height: size * 0.062,
          borderRadius: '50%', background: color,
          animation: `af3-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
        }}/>
      ))}
    </div>
  );
}

// ── Configurações de wrap por estado ─────────────────────────────────────────
const WRAP_CLASS = {
  idle:     's-breathe',
  thinking: 's-breathe',
  upload:   's-wiggle',
  done:     's-bounce',
  text:     's-nod',
  photo:    's-bounce',
  code:     's-breathe',
  book:     's-nod',
  audio:    's-breathe',
  happy:    's-pop',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyizFace({ size = 62, state = 'idle' }) {
  injectCSS();
  const resolvedState = STATE_COLORS[state] ? state : 'idle';
  const col = STATE_COLORS[resolvedState];
  const wc  = WRAP_CLASS[resolvedState] || 's-breathe';

  return (
    <div className={`af3-wrap ${wc}`} style={{ width: size, height: size, position: 'relative' }}>
      {/* Partículas orbitais */}
      <OrbitParticles size={size} state={resolvedState} />

      {/* Rosto SVG principal */}
      <div style={{ position:'relative', zIndex:2, width:size, height:size }}>
        <FaceSVG size={size} state={resolvedState} />
      </div>

      {/* Dots de "pensando" (apenas no estado thinking) */}
      {resolvedState === 'thinking' && (
        <Dots size={size} color={col.cheek} />
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
  fileType     = null,
} = {}) {
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