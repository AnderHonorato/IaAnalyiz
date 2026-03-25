// AnalyizFace.jsx — rosto fofo da Analyiz com expressões por contexto
// Uso: <AnalyizFace size={62} state="thinking" />
//
// States disponíveis:
//   idle      → olha pros lados, pisca, descansado
//   thinking  → olhos semicerrados + bolinhas de pensamento (SEM anel orbital — a estrela já gira)
//   text      → nodding + coração flutuando
//   audio     → ondas sonoras + olhos relaxados
//   photo     → flash + olhos arregalados + bochecha corada
//   code      → olhos alternando + colchetes < >
//   book      → sobrancelhas franzidas de concentração + páginas flutuando
//   done      → olhos de "UWU" (feliz) + check verde + saltitando
//   upload    → olhos arregalados surpresos + seta subindo
//   happy     → olhos em meia-lua feliz + estrelinhas

import React, { useEffect } from 'react';

const CSS = `
@keyframes af-breathe   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }
@keyframes af-blink     { 0%,85%,100%{transform:scaleY(1)} 92%{transform:scaleY(0.05)} }
@keyframes af-dots      { 0%,100%{opacity:0.3;transform:scale(0.6)} 50%{opacity:1;transform:scale(1)} }
@keyframes af-float     { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-28px) scale(0.3)} }
@keyframes af-spark     { 0%,100%{opacity:0;transform:scale(0.2)} 50%{opacity:1;transform:scale(1)} }
@keyframes af-bounce    { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} 60%{transform:translateY(-2px)} }
@keyframes af-nod       { 0%,100%{transform:translateY(0) rotate(0deg)} 30%{transform:translateY(-3px) rotate(-2deg)} 70%{transform:translateY(2px) rotate(2deg)} }
@keyframes af-wave      { 0%,100%{transform:scaleY(0.35)} 50%{transform:scaleY(1)} }
@keyframes af-pulse     { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:0.1;transform:scale(1.15)} }
@keyframes af-wiggle    { 0%,100%{transform:rotate(0deg)} 25%{transform:rotate(-4deg)} 75%{transform:rotate(4deg)} }
@keyframes af-eye-side  { 0%,100%{transform:translateX(0)} 50%{transform:translateX(3px)} }
@keyframes af-pop       { 0%{transform:scale(1)} 50%{transform:scale(1.06)} 100%{transform:scale(1)} }

.af-wrap { position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0 }
.af-wrap.s-breathe { animation:af-breathe 3.2s ease-in-out infinite }
.af-wrap.s-bounce  { animation:af-bounce 0.5s ease-out 4 }
.af-wrap.s-nod     { animation:af-nod 1.1s ease-in-out infinite }
.af-wrap.s-wiggle  { animation:af-wiggle 0.7s ease-in-out infinite }
.af-wrap.s-pop     { animation:af-pop 0.6s ease-in-out infinite }

.af-sparkle { position:absolute; pointer-events:none }
.af-sparkle svg { display:block }
.af-sk0 { animation:af-spark 2.4s ease-in-out 0.0s infinite }
.af-sk1 { animation:af-spark 2.4s ease-in-out 0.6s infinite }
.af-sk2 { animation:af-spark 2.4s ease-in-out 1.2s infinite }
.af-sk3 { animation:af-spark 2.4s ease-in-out 1.8s infinite }

.af-dot0 { animation:af-dots 1.1s ease-in-out 0.00s infinite; transform-origin:center; transform-box:fill-box }
.af-dot1 { animation:af-dots 1.1s ease-in-out 0.20s infinite; transform-origin:center; transform-box:fill-box }
.af-dot2 { animation:af-dots 1.1s ease-in-out 0.40s infinite; transform-origin:center; transform-box:fill-box }
.af-float0 { animation:af-float 2.0s ease-out 0.0s infinite }
.af-float1 { animation:af-float 2.0s ease-out 0.8s infinite }
.af-wave0 { animation:af-wave 0.75s ease-in-out 0.00s infinite; transform-origin:center; transform-box:fill-box }
.af-wave1 { animation:af-wave 0.75s ease-in-out 0.12s infinite; transform-origin:center; transform-box:fill-box }
.af-wave2 { animation:af-wave 0.75s ease-in-out 0.24s infinite; transform-origin:center; transform-box:fill-box }
.af-wave3 { animation:af-wave 0.75s ease-in-out 0.36s infinite; transform-origin:center; transform-box:fill-box }
.af-wave4 { animation:af-wave 0.75s ease-in-out 0.48s infinite; transform-origin:center; transform-box:fill-box }
.af-check { animation:af-bounce 0.5s ease-out 1 }
.af-pulse-ring { animation:af-pulse 0.55s ease-out 2; transform-origin:center; transform-box:fill-box }
.af-eye-anim { animation:af-eye-side 2s ease-in-out infinite }
`;

let _css = false;
function injectCSS() {
  if (_css || typeof document === 'undefined') return;
  _css = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── SVG base — olhos GRANDES e expressivos ───────────────────────────────────
function BaseFace({ size, cheekOpacity = 1 }) {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const r = s * 0.433;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`fg-${s}`} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#2d2f3e"/>
          <stop offset="100%" stopColor="#191b26"/>
        </radialGradient>
        <radialGradient id={`ck-${s}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e87a8a" stopOpacity={0.42 * Math.min(cheekOpacity, 2)}/>
          <stop offset="100%" stopColor="#e87a8a" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* Face */}
      <circle cx={cx} cy={cy} r={r} fill={`url(#fg-${s})`}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3d4060" strokeWidth={s * 0.013}/>

      {/* Bochechas */}
      <ellipse cx={cx * 0.46} cy={cy * 1.14} rx={r * 0.26} ry={r * 0.16} fill={`url(#ck-${s})`}/>
      <ellipse cx={cx * 1.54} cy={cy * 1.14} rx={r * 0.26} ry={r * 0.16} fill={`url(#ck-${s})`}/>
    </svg>
  );
}

// ── Olhos grandes separados com animação ────────────────────────────────────
function Eyes({ size, state }) {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const r = s * 0.433;

  // Posições dos olhos — mais centralizados e GRANDES
  const eyeLx = cx * 0.63;
  const eyeRx = cx * 1.37;
  const eyeY  = cy * 0.92;

  // Tamanho dos olhos — MUITO maiores (era ~0.208 × r, agora ~0.30 × r)
  const erx = r * 0.30;   // raio horizontal do olho
  const ery = r * 0.34;   // raio vertical do olho (mais alto = mais expressivo)
  const prx = r * 0.175;  // pupila
  const glr = r * 0.105;  // brilho principal

  // Configurações por estado
  const cfg = {
    idle: {
      scaleY: 1, translateX: -3, translateY: 0,
      pupilScale: 1, isClosed: false, isHappy: false, isSurprised: false,
      animClass: 'af-eye-anim',
    },
    thinking: {
      scaleY: 0.55, translateX: 0, translateY: -2,
      pupilScale: 0.85, isClosed: false, isHappy: false, isSurprised: false,
      animClass: '',
    },
    text: {
      scaleY: 1.1, translateX: 0, translateY: 0,
      pupilScale: 1.1, isClosed: false, isHappy: false, isSurprised: false,
      animClass: '',
    },
    audio: {
      scaleY: 0.75, translateX: 0, translateY: 0,
      pupilScale: 0.9, isClosed: false, isHappy: false, isSurprised: false,
      animClass: '',
    },
    photo: {
      scaleY: 1.35, translateX: 0, translateY: 0,
      pupilScale: 1.3, isClosed: false, isHappy: false, isSurprised: true,
      animClass: '',
    },
    upload: {
      scaleY: 1.35, translateX: 0, translateY: 0,
      pupilScale: 1.25, isClosed: false, isHappy: false, isSurprised: true,
      animClass: '',
    },
    code: {
      scaleY: 0.88, translateX: -5, translateY: 0,
      pupilScale: 0.95, isClosed: false, isHappy: false, isSurprised: false,
      animClass: 'af-eye-anim',
    },
    book: {
      scaleY: 0.62, translateX: 0, translateY: -4,
      pupilScale: 0.9, isClosed: false, isHappy: false, isSurprised: false,
      animClass: '',
    },
    done: {
      scaleY: 0.42, translateX: 0, translateY: 4,
      pupilScale: 1, isClosed: false, isHappy: true, isSurprised: false,
      animClass: '',
    },
    happy: {
      scaleY: 0.45, translateX: 0, translateY: 3,
      pupilScale: 1, isClosed: false, isHappy: true, isSurprised: false,
      animClass: '',
    },
  };

  const c = cfg[state] || cfg.idle;

  // Transformação dos olhos
  const eyeStyleL = {
    transform: `translate(${c.translateX}px, ${c.translateY}px) scaleY(${c.scaleY})`,
    transformOrigin: `${eyeLx}px ${eyeY}px`,
    transformBox: 'view-box',
    transition: 'transform 0.4s cubic-bezier(0.34, 1.3, 0.64, 1)',
  };
  const eyeStyleR = {
    transform: `translate(${-c.translateX}px, ${c.translateY}px) scaleY(${c.scaleY})`,
    transformOrigin: `${eyeRx}px ${eyeY}px`,
    transformBox: 'view-box',
    transition: 'transform 0.4s cubic-bezier(0.34, 1.3, 0.64, 1)',
  };

  const pupR = prx * c.pupilScale;

  // Olho feliz (UWU) — arco curvado para cima
  function HappyEye({ x }) {
    const w = erx * 2.1;
    const h = ery * 1.1;
    return (
      <g>
        <ellipse cx={x} cy={eyeY} rx={erx * 1.05} ry={ery * 0.55} fill="white" opacity="0.97"/>
        <path
          d={`M${x - erx * 0.9} ${eyeY + ery * 0.1} Q${x} ${eyeY - ery * 0.85} ${x + erx * 0.9} ${eyeY + ery * 0.1}`}
          fill="#1a2550"
          clipPath={`circle(${erx * 1.0}px at ${x}px ${eyeY}px)`}
        />
        <ellipse cx={x - erx * 0.25} cy={eyeY - ery * 0.1} rx={glr * 0.9} ry={glr * 0.9} fill="rgba(255,255,255,0.9)"/>
      </g>
    );
  }

  // Olho surpreso — muito grande com íris grande
  function SurprisedEye({ x }) {
    return (
      <g>
        <ellipse cx={x} cy={eyeY} rx={erx * 1.15} ry={ery * 1.15} fill="white" opacity="0.97"/>
        <ellipse cx={x} cy={eyeY} rx={erx * 0.78} ry={ery * 0.78} fill="#1a2550"/>
        <ellipse cx={x} cy={eyeY} rx={pupR * 1.2} ry={pupR * 1.2} fill="#080d1e"/>
        <ellipse cx={x - erx * 0.28} cy={eyeY - ery * 0.32} rx={glr * 1.1} ry={glr * 1.1} fill="white" opacity="0.95"/>
        <ellipse cx={x + erx * 0.2} cy={eyeY + ery * 0.24} rx={glr * 0.5} ry={glr * 0.5} fill="white" opacity="0.5"/>
      </g>
    );
  }

  function NormalEye({ x, style }) {
    return (
      <g style={style} className={c.animClass}>
        <ellipse cx={x} cy={eyeY} rx={erx} ry={ery} fill="white" opacity="0.97"/>
        <ellipse cx={x} cy={eyeY} rx={erx * 0.70} ry={ery * 0.71} fill="#1a2550"/>
        <ellipse cx={x} cy={eyeY} rx={pupR} ry={pupR} fill="#080d1e"/>
        <ellipse cx={x - erx * 0.24} cy={eyeY - ery * 0.30} rx={glr} ry={glr} fill="white" opacity="0.92"/>
        <ellipse cx={x + erx * 0.19} cy={eyeY + ery * 0.24} rx={glr * 0.46} ry={glr * 0.46} fill="white" opacity="0.5"/>
      </g>
    );
  }

  const gradId = `eg-eyes-${s}`;

  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={s} height={s}
      viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={gradId} cx="35%" cy="28%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#c8d8f8" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* Olho esquerdo */}
      {c.isHappy
        ? <HappyEye x={eyeLx} />
        : c.isSurprised
          ? <SurprisedEye x={eyeLx} />
          : <NormalEye x={eyeLx} style={eyeStyleL} />
      }

      {/* Olho direito */}
      {c.isHappy
        ? <HappyEye x={eyeRx} />
        : c.isSurprised
          ? <SurprisedEye x={eyeRx} />
          : <NormalEye x={eyeRx} style={eyeStyleR} />
      }

      {/* Sobrancelhas franzidas (book/concentrado) */}
      {state === 'book' && (
        <>
          <path d={`M${eyeLx - erx * 0.7} ${eyeY - ery * 1.05} L${eyeLx + erx * 0.5} ${eyeY - ery * 0.82}`}
            fill="none" stroke="#9B72CB" strokeWidth={s * 0.022} strokeLinecap="round" opacity="0.75"/>
          <path d={`M${eyeRx + erx * 0.7} ${eyeY - ery * 1.05} L${eyeRx - erx * 0.5} ${eyeY - ery * 0.82}`}
            fill="none" stroke="#9B72CB" strokeWidth={s * 0.022} strokeLinecap="round" opacity="0.75"/>
        </>
      )}

      {/* Sobrancelhas animadas (thinking) */}
      {state === 'thinking' && (
        <>
          <path d={`M${eyeLx - erx * 0.6} ${eyeY - ery * 0.9} Q${eyeLx} ${eyeY - ery * 1.1} ${eyeLx + erx * 0.6} ${eyeY - ery * 0.9}`}
            fill="none" stroke="#9B72CB" strokeWidth={s * 0.020} strokeLinecap="round" opacity="0.6"/>
          <path d={`M${eyeRx - erx * 0.6} ${eyeY - ery * 0.9} Q${eyeRx} ${eyeY - ery * 1.1} ${eyeRx + erx * 0.6} ${eyeY - ery * 0.9}`}
            fill="none" stroke="#9B72CB" strokeWidth={s * 0.020} strokeLinecap="round" opacity="0.6"/>
        </>
      )}

      {/* Bocas por estado */}
      {(state === 'done' || state === 'happy' || state === 'text') && (
        <path d={`M${cx - s*0.14} ${cy * 1.22} Q${cx} ${cy * 1.34} ${cx + s*0.14} ${cy * 1.22}`}
          fill="none" stroke="#D96570" strokeWidth={s * 0.028} strokeLinecap="round" opacity="0.85"/>
      )}
      {state === 'upload' && (
        <path d={`M${cx - s*0.08} ${cy * 1.22} Q${cx} ${cy * 1.16} ${cx + s*0.08} ${cy * 1.22}`}
          fill="none" stroke="#4285F4" strokeWidth={s * 0.025} strokeLinecap="round" opacity="0.8"/>
      )}
      {(state === 'idle' || state === 'audio') && (
        <path d={`M${cx - s*0.09} ${cy * 1.22} Q${cx} ${cy * 1.28} ${cx + s*0.09} ${cy * 1.22}`}
          fill="none" stroke="#9B72CB" strokeWidth={s * 0.022} strokeLinecap="round" opacity="0.5"/>
      )}
    </svg>
  );
}

// ── Estrelinhas ao redor ─────────────────────────────────────────────────────
function Sparkles({ size, colors = ['#4285F4','#9B72CB','#D96570','#4285F4'] }) {
  const sz = Math.max(5, size * 0.11);
  const d  = size * 0.53;
  const h  = size / 2;
  const pos = [
    { x: h - d*0.62, y: h - d*0.62, cls: 'af-sk0' },
    { x: h + d*0.55, y: h - d*0.58, cls: 'af-sk1' },
    { x: h + d*0.50, y: h + d*0.65, cls: 'af-sk2' },
    { x: h - d*0.58, y: h + d*0.60, cls: 'af-sk3' },
  ];
  return (
    <>
      {pos.map((p, i) => (
        <div key={i} className={`af-sparkle ${p.cls}`}
          style={{ left: p.x - sz/2, top: p.y - sz/2, width: sz, height: sz }}>
          <svg width={sz} height={sz} viewBox="-5 -5 10 10">
            <path d="M0,-4C.3,-1.5 1.5,-.3 4,0C1.5,.3.3,1.5 0,4C-.3,1.5-1.5,.3-4,0C-1.5,-.3-.3,-1.5 0,-4Z"
              fill={colors[i] || '#fff'} opacity="0.88"/>
          </svg>
        </div>
      ))}
    </>
  );
}

// ── Acessórios por estado ────────────────────────────────────────────────────
function ThinkDots({ size }) {
  const s = size, cx = s/2;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {[0,1,2].map(i => (
        <circle key={i} className={`af-dot${i}`}
          cx={cx - s*0.09 + i*s*0.09} cy={s*0.89} r={s*0.030}
          fill="#9B72CB"/>
      ))}
    </svg>
  );
}

function AudioWaves({ size }) {
  const s = size, cx = s/2;
  const hs = [s*0.05, s*0.1, s*0.14, s*0.1, s*0.05];
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {hs.map((h, i) => (
        <line key={i} className={`af-wave${i}`}
          x1={cx - s*0.18 + i*s*0.09} y1={s*0.88 - h/2}
          x2={cx - s*0.18 + i*s*0.09} y2={s*0.88 + h/2}
          stroke="#D96570" strokeWidth={s*0.024} strokeLinecap="round"/>
      ))}
    </svg>
  );
}

function HeartFloat({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <g className="af-float0">
        <path d={`M${s*0.83} ${s*0.20} C${s*0.83},${s*0.12} ${s*0.73},${s*0.12} ${s*0.73},${s*0.20} C${s*0.73},${s*0.12} ${s*0.63},${s*0.12} ${s*0.63},${s*0.20} C${s*0.63},${s*0.29} ${s*0.73},${s*0.37} ${s*0.73},${s*0.37}Z`} fill="#D96570"/>
      </g>
      <g className="af-float1">
        <path d={`M${s*0.96} ${s*0.28} C${s*0.96},${s*0.22} ${s*0.89},${s*0.22} ${s*0.89},${s*0.28} C${s*0.89},${s*0.22} ${s*0.82},${s*0.22} ${s*0.82},${s*0.28} C${s*0.82},${s*0.34} ${s*0.89},${s*0.40} ${s*0.89},${s*0.40}Z`} fill="#9B72CB" opacity="0.8"/>
      </g>
    </svg>
  );
}

function CheckMark({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <g className="af-check">
        <circle cx={s*0.82} cy={s*0.20} r={s*0.10} fill="#639922"/>
        <path d={`M${s*0.76} ${s*0.20} L${s*0.80} ${s*0.24} L${s*0.88} ${s*0.16}`}
          fill="none" stroke="white" strokeWidth={s*0.024} strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </svg>
  );
}

function CodeTag({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}
      className="af-float0">
      <text x={s*0.70} y={s*0.26} fontSize={s*0.20} fill="#378ADD" fontFamily="monospace" fontWeight="bold">&lt;&gt;</text>
    </svg>
  );
}

function BookPages({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}
      className="af-float0">
      <rect x={s*0.68} y={s*0.10} width={s*0.10} height={s*0.14} rx={s*0.015} fill="#1D9E75"/>
      <rect x={s*0.80} y={s*0.13} width={s*0.10} height={s*0.14} rx={s*0.015} fill="#0F6E56"/>
    </svg>
  );
}

function CameraFlash({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={s/2} cy={s/2} r={s*0.46} fill="white" opacity="0.14" className="af-pulse-ring"/>
      <path d={`M${s*0.78} ${s*0.18} C${s*0.80},${s*0.10} ${s*0.90},${s*0.14} ${s*0.86},${s*0.24}Z`}
        fill="#EF9F27" opacity="0.9" className="af-float0"/>
    </svg>
  );
}

function UploadArrow({ size }) {
  const s = size, cx = s/2;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}
      className="af-float0">
      <path d={`M${cx} ${s*0.08} L${cx - s*0.06} ${s*0.16} L${cx} ${s*0.12} L${cx + s*0.06} ${s*0.16}Z`}
        fill="#4285F4"/>
      <line x1={cx} y1={s*0.12} x2={cx} y2={s*0.22} stroke="#4285F4" strokeWidth={s*0.025} strokeLinecap="round"/>
    </svg>
  );
}

function HappyStars({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <g className="af-float0">
        <path d={`M${s*0.82} ${s*0.16} L${s*0.84} ${s*0.22} L${s*0.90} ${s*0.22} L${s*0.85} ${s*0.26} L${s*0.87} ${s*0.32} L${s*0.82} ${s*0.28} L${s*0.77} ${s*0.32} L${s*0.79} ${s*0.26} L${s*0.74} ${s*0.22} L${s*0.80} ${s*0.22}Z`}
          fill="#EF9F27" opacity="0.9"/>
      </g>
      <g className="af-float1">
        <path d={`M${s*0.12} ${s*0.22} L${s*0.14} ${s*0.27} L${s*0.19} ${s*0.27} L${s*0.15} ${s*0.30} L${s*0.17} ${s*0.35} L${s*0.12} ${s*0.32} L${s*0.07} ${s*0.35} L${s*0.09} ${s*0.30} L${s*0.05} ${s*0.27} L${s*0.10} ${s*0.27}Z`}
          fill="#9B72CB" opacity="0.8"/>
      </g>
    </svg>
  );
}

// ── Configurações por estado ─────────────────────────────────────────────────
const STATE_CONFIGS = {
  idle: {
    wrapClass:    'af-wrap s-breathe',
    cheekOpacity: 1,
    sparkColors:  ['#4285F4','#9B72CB','#D96570','#4285F4'],
    Accessory:    null,
  },
  thinking: {
    wrapClass:    'af-wrap s-breathe',
    cheekOpacity: 0.6,
    sparkColors:  ['#9B72CB','#9B72CB','#9B72CB','#9B72CB'],
    Accessory:    ThinkDots,
  },
  text: {
    wrapClass:    'af-wrap s-nod',
    cheekOpacity: 1.6,
    sparkColors:  ['#D96570','#9B72CB','#D96570','#9B72CB'],
    Accessory:    HeartFloat,
  },
  audio: {
    wrapClass:    'af-wrap s-breathe',
    cheekOpacity: 1.2,
    sparkColors:  ['#D96570','#D96570','#D96570','#D96570'],
    Accessory:    AudioWaves,
  },
  photo: {
    wrapClass:    'af-wrap s-bounce',
    cheekOpacity: 2,
    sparkColors:  ['#EF9F27','#D96570','#EF9F27','#9B72CB'],
    Accessory:    CameraFlash,
  },
  upload: {
    wrapClass:    'af-wrap s-wiggle',
    cheekOpacity: 1.5,
    sparkColors:  ['#4285F4','#4285F4','#9B72CB','#4285F4'],
    Accessory:    UploadArrow,
  },
  code: {
    wrapClass:    'af-wrap s-breathe',
    cheekOpacity: 0.8,
    sparkColors:  ['#378ADD','#4285F4','#378ADD','#4285F4'],
    Accessory:    CodeTag,
  },
  book: {
    wrapClass:    'af-wrap s-nod',
    cheekOpacity: 1.3,
    sparkColors:  ['#1D9E75','#0F6E56','#1D9E75','#0F6E56'],
    Accessory:    BookPages,
  },
  done: {
    wrapClass:    'af-wrap s-bounce',
    cheekOpacity: 2.2,
    sparkColors:  ['#639922','#1D9E75','#639922','#1D9E75'],
    Accessory:    CheckMark,
  },
  happy: {
    wrapClass:    'af-wrap s-pop',
    cheekOpacity: 2.0,
    sparkColors:  ['#EF9F27','#D96570','#9B72CB','#4285F4'],
    Accessory:    HappyStars,
  },
};

// ── Componente principal ─────────────────────────────────────────────────────
export default function AnalyizFace({ size = 62, state = 'idle' }) {
  injectCSS();

  const resolvedState = STATE_CONFIGS[state] ? state : 'idle';
  const cfg = STATE_CONFIGS[resolvedState];
  const { Accessory } = cfg;

  return (
    <div className={cfg.wrapClass} style={{ width: size, height: size, position: 'relative' }}>
      <BaseFace size={size} cheekOpacity={cfg.cheekOpacity} />
      <Eyes size={size} state={resolvedState} />
      {Accessory && <Accessory size={size} />}
      <Sparkles size={size} colors={cfg.sparkColors} />
    </div>
  );
}

// ── Hook para estado automático do rosto ─────────────────────────────────────
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