// AnalyizFace.jsx — rosto fofo da Analyiz com expressões por contexto
// Uso: <AnalyizFace size={62} state="thinking" />
//
// States disponíveis:
//   idle      → olha pros lados, pisca, descansado
//   thinking  → anel orbital + olhos semicerrados mexendo pra lado + bolinhas de pensamento
//   text      → nodding + coração flutuando
//   audio     → ondas sonoras + olhos relaxados
//   photo     → flash + olhos arregalados + bochecha corada
//   code      → olhos alternando + colchetes < >
//   book      → sobrancelhas franzidas de concentração + páginas flutuando
//   done      → olhos de "UWU" + check verde + saltitando

import React, { useEffect, useRef, useCallback } from 'react';

const CSS = `
@keyframes af-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}
@keyframes af-orbit{to{transform:rotate(360deg)}}
@keyframes af-blink{0%,88%,100%{transform:scaleY(1) var(--eye-extra,)}95%{transform:scaleY(0.07) var(--eye-extra,)}}
@keyframes af-dots{0%,100%{opacity:0.3;transform:scale(0.65)}50%{opacity:1;transform:scale(1)}}
@keyframes af-float{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-30px) scale(0.4)}}
@keyframes af-spark{0%,100%{opacity:0;transform:scale(0.2)}50%{opacity:1;transform:scale(1)}}
@keyframes af-bounce{0%,100%{transform:translateY(0)}25%,75%{transform:translateY(-5px)}50%{transform:translateY(-2px)}}
@keyframes af-nod{0%,100%{transform:translateY(0) rotate(0deg)}30%{transform:translateY(-3px) rotate(-1.5deg)}70%{transform:translateY(2px) rotate(1.5deg)}}
@keyframes af-wave{0%,100%{transform:scaleY(0.4)}50%{transform:scaleY(1)}}
@keyframes af-pulse{0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:0.1;transform:scale(1.12)}}

.af-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.af-wrap.s-breathe{animation:af-breathe 3s ease-in-out infinite}
.af-wrap.s-bounce{animation:af-bounce 0.45s ease-out 4}
.af-wrap.s-nod{animation:af-nod 1.1s ease-in-out infinite}

.af-orbit-ring{position:absolute;inset:0;border-radius:50%;pointer-events:none;transition:opacity 0.3s}
.af-orbit-ring.hidden{opacity:0}
.af-orbit-ring.visible{opacity:1;animation:af-orbit 1.5s linear infinite}

.af-sparkle{position:absolute;pointer-events:none}
.af-sparkle svg{display:block}
.af-sk0{animation:af-spark 2.2s ease-in-out 0.0s infinite}
.af-sk1{animation:af-spark 2.2s ease-in-out 0.6s infinite}
.af-sk2{animation:af-spark 2.2s ease-in-out 1.1s infinite}
.af-sk3{animation:af-spark 2.2s ease-in-out 1.7s infinite}

.af-eye{transform-origin:center;transform-box:fill-box;transition:transform 0.45s cubic-bezier(0.34,1.3,0.64,1)}
.af-dot0{animation:af-dots 1.2s ease-in-out 0.00s infinite;transform-origin:center;transform-box:fill-box}
.af-dot1{animation:af-dots 1.2s ease-in-out 0.22s infinite;transform-origin:center;transform-box:fill-box}
.af-dot2{animation:af-dots 1.2s ease-in-out 0.44s infinite;transform-origin:center;transform-box:fill-box}
.af-float0{animation:af-float 2.2s ease-out 0.0s infinite}
.af-float1{animation:af-float 2.2s ease-out 0.8s infinite}
.af-wave0{animation:af-wave 0.8s ease-in-out 0.00s infinite;transform-origin:center;transform-box:fill-box}
.af-wave1{animation:af-wave 0.8s ease-in-out 0.12s infinite;transform-origin:center;transform-box:fill-box}
.af-wave2{animation:af-wave 0.8s ease-in-out 0.24s infinite;transform-origin:center;transform-box:fill-box}
.af-wave3{animation:af-wave 0.8s ease-in-out 0.36s infinite;transform-origin:center;transform-box:fill-box}
.af-wave4{animation:af-wave 0.8s ease-in-out 0.48s infinite;transform-origin:center;transform-box:fill-box}
.af-check{animation:af-bounce 0.5s ease-out 1}
.af-pulse-ring{animation:af-pulse 0.6s ease-out 2;transform-origin:center;transform-box:fill-box}
`;

let _css = false;
function injectCSS() {
  if (_css || typeof document === 'undefined') return;
  _css = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── SVG do rosto base ────────────────────────────────────────────────────────
function BaseFace({ size, eyeTransform, cheekOpacity = 1 }) {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const r = s * 0.433;
  const eyeLx = cx * 0.617, eyeRx = cx * 1.383;
  const eyeY  = cy * 0.9;
  const eyeRx2 = r * 0.208, eyeRy2 = r * 0.248;
  const pRx = r * 0.128, pRy = r * 0.128;
  const glRx = r * 0.088;

  const eyeStyle = { transformOrigin: 'center', transformBox: 'fill-box', transition: 'transform 0.45s cubic-bezier(0.34,1.3,0.64,1)', ...eyeTransform };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`fg-${s}`} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#2d2f3e"/>
          <stop offset="100%" stopColor="#191b26"/>
        </radialGradient>
        <radialGradient id={`eg-${s}`} cx="35%" cy="28%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#c8d8f8" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id={`ck-${s}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e87a8a" stopOpacity={0.38 * cheekOpacity}/>
          <stop offset="100%" stopColor="#e87a8a" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* Face */}
      <circle cx={cx} cy={cy} r={r} fill={`url(#fg-${s})`}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3d4060" strokeWidth={s*0.013}/>

      {/* Bochechas */}
      <ellipse cx={cx*0.5} cy={cy*1.13} rx={r*0.24} ry={r*0.155} fill={`url(#ck-${s})`}/>
      <ellipse cx={cx*1.5} cy={cy*1.13} rx={r*0.24} ry={r*0.155} fill={`url(#ck-${s})`}/>

      {/* Olho esquerdo */}
      <g className="af-eye" style={eyeStyle && eyeStyle.left ? eyeStyle.left : (eyeStyle.all || {})}>
        <ellipse cx={eyeLx} cy={eyeY} rx={eyeRx2} ry={eyeRy2} fill="white" opacity="0.97"/>
        <ellipse cx={eyeLx} cy={eyeY} rx={eyeRx2*0.68} ry={eyeRy2*0.69} fill="#1a2550"/>
        <ellipse cx={eyeLx} cy={eyeY} rx={pRx} ry={pRy} fill="#080d1e"/>
        <ellipse cx={eyeLx-eyeRx2*0.22} cy={eyeY-eyeRy2*0.3} rx={glRx} ry={glRx} fill={`url(#eg-${s})`}/>
        <ellipse cx={eyeLx+eyeRx2*0.18} cy={eyeY+eyeRy2*0.22} rx={glRx*0.44} ry={glRx*0.44} fill="white" opacity="0.5"/>
      </g>

      {/* Olho direito */}
      <g className="af-eye" style={eyeStyle && eyeStyle.right ? eyeStyle.right : (eyeStyle.all || {})}>
        <ellipse cx={eyeRx} cy={eyeY} rx={eyeRx2} ry={eyeRy2} fill="white" opacity="0.97"/>
        <ellipse cx={eyeRx} cy={eyeY} rx={eyeRx2*0.68} ry={eyeRy2*0.69} fill="#1a2550"/>
        <ellipse cx={eyeRx} cy={eyeY} rx={pRx} ry={pRy} fill="#080d1e"/>
        <ellipse cx={eyeRx-eyeRx2*0.22} cy={eyeY-eyeRy2*0.3} rx={glRx} ry={glRx} fill={`url(#eg-${s})`}/>
        <ellipse cx={eyeRx+eyeRx2*0.18} cy={eyeY+eyeRy2*0.22} rx={glRx*0.44} ry={glRx*0.44} fill="white" opacity="0.5"/>
      </g>
    </svg>
  );
}

// ── Anel orbital ─────────────────────────────────────────────────────────────
function OrbitRing({ size, visible }) {
  const r = size / 2 - size * 0.022;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75, gap = circ * 0.25;
  const sw = Math.max(2, size * 0.047);
  return (
    <div className={`af-orbit-ring ${visible ? 'visible' : 'hidden'}`} style={{ position: 'absolute', inset: 0, borderRadius: '50%' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`og-${size}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#4285F4" stopOpacity="0"/>
            <stop offset="35%"  stopColor="#9B72CB" stopOpacity="0.8"/>
            <stop offset="75%"  stopColor="#D96570" stopOpacity="1"/>
            <stop offset="100%" stopColor="#4285F4" stopOpacity="0.9"/>
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={Math.max(1.5, size*0.035)}/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={`url(#og-${size})`} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={circ*0.1}/>
        <circle cx={cx + r} cy={cx} r={Math.max(2, size*0.052)} fill="#D96570"/>
      </svg>
    </div>
  );
}

// ── Estrelinhas ──────────────────────────────────────────────────────────────
function Sparkles({ size, colors = ['#4285F4','#9B72CB','#D96570','#4285F4'] }) {
  const sz = Math.max(6, size * 0.13);
  const d  = size * 0.52;
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
        <circle key={i} className={`af-dot${i}`} cx={cx - s*0.1 + i*s*0.1} cy={s*0.87} r={s*0.033}
          fill="#9B72CB"/>
      ))}
      <path d={`M${cx-s*0.08} ${s*0.076} Q${cx} ${s*0.05} ${cx+s*0.08} ${s*0.076}`}
        fill="none" stroke="#9B72CB" strokeWidth={s*0.022} strokeLinecap="round" opacity="0.7"/>
    </svg>
  );
}

function AudioWaves({ size }) {
  const s = size, cx = s/2;
  const hs = [s*0.05, s*0.1, s*0.15, s*0.1, s*0.05];
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {hs.map((h, i) => (
        <line key={i} className={`af-wave${i}`}
          x1={cx - s*0.18 + i*s*0.09} y1={s*0.87 - h/2}
          x2={cx - s*0.18 + i*s*0.09} y2={s*0.87 + h/2}
          stroke="#D96570" strokeWidth={s*0.025} strokeLinecap="round"/>
      ))}
    </svg>
  );
}

function HeartFloat({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <g className="af-float0">
        <path d={`M${s*0.83} ${s*0.22} C${s*0.83},${s*0.14} ${s*0.73},${s*0.14} ${s*0.73},${s*0.22} C${s*0.73},${s*0.14} ${s*0.63},${s*0.14} ${s*0.63},${s*0.22} C${s*0.63},${s*0.30} ${s*0.73},${s*0.38} ${s*0.73},${s*0.38} C${s*0.73},${s*0.38} ${s*0.83},${s*0.30} ${s*0.83},${s*0.22}Z`}
          fill="#D96570"/>
      </g>
      <g className="af-float1">
        <path d={`M${s*0.96} ${s*0.30} C${s*0.96},${s*0.24} ${s*0.89},${s*0.24} ${s*0.89},${s*0.30} C${s*0.89},${s*0.24} ${s*0.82},${s*0.24} ${s*0.82},${s*0.30} C${s*0.82},${s*0.36} ${s*0.89},${s*0.42} ${s*0.89},${s*0.42} C${s*0.89},${s*0.42} ${s*0.96},${s*0.36} ${s*0.96},${s*0.30}Z`}
          fill="#9B72CB" opacity="0.8"/>
      </g>
    </svg>
  );
}

function CheckMark({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <g className="af-check">
        <circle cx={s*0.8} cy={s*0.22} r={s*0.1} fill="#639922"/>
        <path d={`M${s*0.74} ${s*0.22} L${s*0.78} ${s*0.26} L${s*0.86} ${s*0.18}`}
          fill="none" stroke="white" strokeWidth={s*0.025} strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </svg>
  );
}

function CodeTag({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}
      className="af-float0">
      <text x={s*0.7} y={s*0.28} fontSize={s*0.22} fill="#378ADD" fontFamily="monospace" fontWeight="bold">&lt;&gt;</text>
    </svg>
  );
}

function BookPages({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}
      className="af-float0">
      <rect x={s*0.68} y={s*0.12} width={s*0.1} height={s*0.14} rx={s*0.015} fill="#1D9E75"/>
      <rect x={s*0.80} y={s*0.14} width={s*0.1} height={s*0.14} rx={s*0.015} fill="#0F6E56"/>
    </svg>
  );
}

function CameraFlash({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={s/2} cy={s/2} r={s*0.46} fill="white" opacity="0.16" className="af-pulse-ring"/>
      <path d={`M${s*0.78} ${s*0.2} C${s*0.8},${s*0.12} ${s*0.9},${s*0.16} ${s*0.86},${s*0.26}Z`}
        fill="#EF9F27" opacity="0.9" className="af-float0"/>
    </svg>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
const STATE_CONFIGS = {
  idle: {
    wrapClass:    'af-wrap s-breathe',
    orbit:        false,
    eyeLeft:      { transform: 'translateX(-4px)' },
    eyeRight:     { transform: 'translateX(-4px)' },
    cheekOpacity: 1,
    sparkColors:  ['#4285F4','#9B72CB','#D96570','#4285F4'],
    Accessory:    null,
  },
  thinking: {
    wrapClass:    'af-wrap s-breathe',
    orbit:        true,
    eyeLeft:      { transform: 'translateY(-3px) scaleY(0.6)' },
    eyeRight:     { transform: 'translateY(-3px) scaleY(0.6)' },
    cheekOpacity: 0.6,
    sparkColors:  ['#9B72CB','#9B72CB','#9B72CB','#9B72CB'],
    Accessory:    ThinkDots,
  },
  text: {
    wrapClass:    'af-wrap s-nod',
    orbit:        false,
    eyeLeft:      { transform: 'scale(1.12)' },
    eyeRight:     { transform: 'scale(1.12)' },
    cheekOpacity: 1.8,
    sparkColors:  ['#D96570','#9B72CB','#D96570','#9B72CB'],
    Accessory:    HeartFloat,
  },
  audio: {
    wrapClass:    'af-wrap s-breathe',
    orbit:        false,
    eyeLeft:      { transform: 'scaleY(0.8)' },
    eyeRight:     { transform: 'scaleY(0.8)' },
    cheekOpacity: 1.2,
    sparkColors:  ['#D96570','#D96570','#D96570','#D96570'],
    Accessory:    AudioWaves,
  },
  photo: {
    wrapClass:    'af-wrap s-bounce',
    orbit:        false,
    eyeLeft:      { transform: 'scale(1.28)' },
    eyeRight:     { transform: 'scale(1.28)' },
    cheekOpacity: 2,
    sparkColors:  ['#EF9F27','#D96570','#EF9F27','#9B72CB'],
    Accessory:    CameraFlash,
  },
  code: {
    wrapClass:    'af-wrap s-breathe',
    orbit:        true,
    eyeLeft:      { transform: 'translateX(-5px) scaleY(0.85)' },
    eyeRight:     { transform: 'translateX(-5px) scaleY(0.85)' },
    cheekOpacity: 0.8,
    sparkColors:  ['#378ADD','#4285F4','#378ADD','#4285F4'],
    Accessory:    CodeTag,
  },
  book: {
    wrapClass:    'af-wrap s-nod',
    orbit:        false,
    eyeLeft:      { transform: 'translateY(-4px) scaleY(0.65)' },
    eyeRight:     { transform: 'translateY(-4px) scaleY(0.65)' },
    cheekOpacity: 1.4,
    sparkColors:  ['#1D9E75','#0F6E56','#1D9E75','#0F6E56'],
    Accessory:    BookPages,
  },
  done: {
    wrapClass:    'af-wrap s-bounce',
    orbit:        false,
    eyeLeft:      { transform: 'scaleY(0.45) translateY(3px)' },
    eyeRight:     { transform: 'scaleY(0.45) translateY(3px)' },
    cheekOpacity: 2.2,
    sparkColors:  ['#639922','#1D9E75','#639922','#1D9E75'],
    Accessory:    CheckMark,
  },
};

export default function AnalyizFace({ size = 62, state = 'idle', animating }) {
  injectCSS();

  const s = state;
  const resolvedState = animating === true ? 'thinking' : (STATE_CONFIGS[s] ? s : 'idle');
  const cfg = STATE_CONFIGS[resolvedState] || STATE_CONFIGS.idle;
  const { Accessory } = cfg;

  return (
    <div className={cfg.wrapClass} style={{ width: size, height: size }}>
      <OrbitRing size={size} visible={cfg.orbit} />

      <BaseFace
        size={size}
        cheekOpacity={Math.min(cfg.cheekOpacity, 2)}
        eyeTransform={{ all: {} }}
      />

      {/* Olhos com transform inline via wrapper absoluto */}
      <svg style={{ position:'absolute', inset:0, pointerEvents:'none' }} width={size} height={size}
        viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={`eg2-${size}`} cx="35%" cy="28%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
            <stop offset="100%" stopColor="#c8d8f8" stopOpacity="0"/>
          </radialGradient>
        </defs>

        {(() => {
          const cx = size / 2;
          const r  = size * 0.433;
          const eyeLx = cx * 0.617, eyeRx = cx * 1.383;
          const eyeY  = cx * 0.9;
          const erx = r * 0.208, ery = r * 0.248;
          const prx = r * 0.128;
          const glr = r * 0.088;
          return (
            <>
              <g style={{ transform: cfg.eyeLeft?.transform || 'none',
                transformOrigin: `${eyeLx}px ${eyeY}px`, transformBox: 'view-box',
                transition: 'transform 0.45s cubic-bezier(0.34,1.3,0.64,1)' }}>
                <ellipse cx={eyeLx} cy={eyeY} rx={erx} ry={ery} fill="white" opacity="0.97"/>
                <ellipse cx={eyeLx} cy={eyeY} rx={erx*0.68} ry={ery*0.69} fill="#1a2550"/>
                <ellipse cx={eyeLx} cy={eyeY} rx={prx} ry={prx} fill="#080d1e"/>
                <ellipse cx={eyeLx-erx*0.22} cy={eyeY-ery*0.3} rx={glr} ry={glr} fill={`url(#eg2-${size})`}/>
                <ellipse cx={eyeLx+erx*0.18} cy={eyeY+ery*0.22} rx={glr*0.44} ry={glr*0.44} fill="white" opacity="0.5"/>
              </g>
              <g style={{ transform: cfg.eyeRight?.transform || 'none',
                transformOrigin: `${eyeRx}px ${eyeY}px`, transformBox: 'view-box',
                transition: 'transform 0.45s cubic-bezier(0.34,1.3,0.64,1)' }}>
                <ellipse cx={eyeRx} cy={eyeY} rx={erx} ry={ery} fill="white" opacity="0.97"/>
                <ellipse cx={eyeRx} cy={eyeY} rx={erx*0.68} ry={ery*0.69} fill="#1a2550"/>
                <ellipse cx={eyeRx} cy={eyeY} rx={prx} ry={prx} fill="#080d1e"/>
                <ellipse cx={eyeRx-erx*0.22} cy={eyeY-ery*0.3} rx={glr} ry={glr} fill={`url(#eg2-${size})`}/>
                <ellipse cx={eyeRx+erx*0.18} cy={eyeY+ery*0.22} rx={glr*0.44} ry={glr*0.44} fill="white" opacity="0.5"/>
              </g>
            </>
          );
        })()}
      </svg>

      {Accessory && <Accessory size={size} />}

      <Sparkles size={size} colors={cfg.sparkColors} />
    </div>
  );
}

// ── Hook para detectar o estado correto automaticamente ──────────────────────
// Uso: const faceState = useAnalyizFaceState({ isLoading, fileType })
export function useAnalyizFaceState({ isLoading = false, fileType = null, justDone = false } = {}) {
  if (justDone) return 'done';
  if (isLoading) return 'thinking';
  if (!fileType) return 'idle';
  const map = {
    pdf: 'book', xlsx: 'book', xls: 'book', csv: 'book',
    mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', webm: 'audio',
    jpg: 'photo', jpeg: 'photo', png: 'photo', gif: 'photo', webp: 'photo',
    js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code', html: 'code', css: 'code',
    txt: 'text', md: 'book',
  };
  return map[fileType.toLowerCase()] || 'text';
}