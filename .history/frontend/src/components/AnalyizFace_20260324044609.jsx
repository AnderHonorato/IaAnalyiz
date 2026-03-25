// AnalyizFace.jsx — rosto da Analyiz com olhos estilo ANIME
// ✅ Olhos grandes, expressivos, íris gradiente azul profundo
// ✅ Cílios superiores curvados e espessos estilo anime
// ✅ 3 pontos de brilho (reflexo principal, secundário, flash)
// ✅ Pupila com gradiente radial escuro
// ✅ Olhos animados: olha frente / lados / cima periodicamente
// ✅ Pisca com animação suave (fecha + leve rebote)
// ✅ Estrelas orbitando em anéis próprios (rosto nunca gira)

import React, { useEffect, useRef, useState, useCallback } from 'react';

const CSS = `
  @keyframes af-breathe    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.025)} }
  @keyframes af-orbit-cw   { to{transform:rotate(360deg)} }
  @keyframes af-orbit-ccw  { to{transform:rotate(-360deg)} }
  @keyframes af-spark      { 0%,100%{opacity:0;transform:scale(.2)} 50%{opacity:1;transform:scale(1)} }
  @keyframes af-shimmer    { 0%,100%{opacity:.55} 50%{opacity:1} }
  @keyframes af-glint      { 0%,100%{opacity:0} 20%,40%{opacity:1} }
  @keyframes af-dots       { 0%,100%{opacity:.3;transform:scale(.65)} 50%{opacity:1;transform:scale(1)} }
  @keyframes af-float      { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-30px) scale(.4)} }
  @keyframes af-bounce     { 0%,100%{transform:translateY(0)} 25%,75%{transform:translateY(-5px)} 50%{transform:translateY(-2px)} }
  @keyframes af-nod        { 0%,100%{transform:translateY(0) rotate(0deg)} 30%{transform:translateY(-3px) rotate(-1.5deg)} 70%{transform:translateY(2px) rotate(1.5deg)} }
  @keyframes af-wave       { 0%,100%{transform:scaleY(.4)} 50%{transform:scaleY(1)} }
  @keyframes af-pulse      { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.1;transform:scale(1.12)} }
  @keyframes af-check-pop  { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }

  .af-wrap { position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0 }
  .af-wrap.s-breathe { animation: af-breathe 3.2s ease-in-out infinite }
  .af-wrap.s-bounce  { animation: af-bounce  .45s ease-out 4 }
  .af-wrap.s-nod     { animation: af-nod     1.1s ease-in-out infinite }

  .af-spark-orbit     { position:absolute; border-radius:50%; pointer-events:none }
  .af-spark-orbit.cw  { animation: af-orbit-cw  var(--dur) linear infinite }
  .af-spark-orbit.ccw { animation: af-orbit-ccw var(--dur) linear infinite }
  .af-spark-dot { position:absolute; top:0; left:50%; transform:translateX(-50%);
    animation: af-spark var(--pdur) ease-in-out var(--pdelay) infinite }

  .af-glint-main  { animation: af-shimmer 2.8s ease-in-out infinite }
  .af-glint-flash { animation: af-glint   4.0s ease-in-out infinite }

  .af-dot0 { animation: af-dots 1.2s ease-in-out 0s    infinite; transform-origin:center; transform-box:fill-box }
  .af-dot1 { animation: af-dots 1.2s ease-in-out .22s  infinite; transform-origin:center; transform-box:fill-box }
  .af-dot2 { animation: af-dots 1.2s ease-in-out .44s  infinite; transform-origin:center; transform-box:fill-box }
  .af-float0 { animation: af-float 2.2s ease-out 0s  infinite }
  .af-float1 { animation: af-float 2.2s ease-out .8s infinite }
  .af-wave0  { animation: af-wave .8s ease-in-out .00s infinite; transform-origin:center; transform-box:fill-box }
  .af-wave1  { animation: af-wave .8s ease-in-out .12s infinite; transform-origin:center; transform-box:fill-box }
  .af-wave2  { animation: af-wave .8s ease-in-out .24s infinite; transform-origin:center; transform-box:fill-box }
  .af-wave3  { animation: af-wave .8s ease-in-out .36s infinite; transform-origin:center; transform-box:fill-box }
  .af-wave4  { animation: af-wave .8s ease-in-out .48s infinite; transform-origin:center; transform-box:fill-box }
  .af-pulse-ring { animation: af-pulse .6s ease-out 2; transform-origin:center; transform-box:fill-box }
`;

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── Direções de olhar ─────────────────────────────────────────────────────────
// { lx, ly, lsy, rx, ry, rsy } — multiplicado por (size * 0.012) em runtime
const LOOK_OFFSETS = [
  { lx: 0,    ly: 0,    lsy: 1,    rx: 0,    ry: 0,    rsy: 1    }, // frente
  { lx: -1.5, ly: 0,    lsy: 0.9,  rx: -1.5, ry: 0,    rsy: 0.9  }, // esquerda
  { lx:  1.5, ly: 0,    lsy: 0.9,  rx:  1.5, ry: 0,    rsy: 0.9  }, // direita
  { lx: 0,    ly: -1.2, lsy: 1.05, rx: 0,    ry: -1.2, rsy: 1.05 }, // cima
  { lx: -1.0, ly:  0.8, lsy: 0.78, rx:  1.0, ry:  0.8, rsy: 0.78 }, // pensativo
];

function useAnimeEyes() {
  const [lookIdx, setLookIdx]   = useState(0);
  const [blinking, setBlinking] = useState(false);
  const lookTimer  = useRef(null);
  const blinkTimer = useRef(null);

  const schedLook = useCallback(() => {
    lookTimer.current = setTimeout(() => {
      setLookIdx(Math.floor(Math.random() * LOOK_OFFSETS.length));
      schedLook();
    }, 1800 + Math.random() * 3500);
  }, []);

  const schedBlink = useCallback(() => {
    blinkTimer.current = setTimeout(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 130);
      schedBlink();
    }, 2200 + Math.random() * 4200);
  }, []);

  useEffect(() => {
    schedLook();
    schedBlink();
    return () => {
      clearTimeout(lookTimer.current);
      clearTimeout(blinkTimer.current);
    };
  }, [schedLook, schedBlink]);

  return { lookIdx, blinking };
}

// ── Gradientes SVG (reutilizáveis) ────────────────────────────────────────────
function FaceDefs({ uid }) {
  return (
    <defs>
      <radialGradient id={`fg-${uid}`} cx="50%" cy="38%" r="58%">
        <stop offset="0%"   stopColor="#2a2d40" />
        <stop offset="100%" stopColor="#14151e" />
      </radialGradient>
      <radialGradient id={`ck-${uid}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#ff8fa8" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ff8fa8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`sc-${uid}`} cx="45%" cy="30%" r="65%">
        <stop offset="0%"   stopColor="#f4f8ff" />
        <stop offset="100%" stopColor="#dde8f8" />
      </radialGradient>
      <radialGradient id={`ir-${uid}`} cx="40%" cy="28%" r="62%">
        <stop offset="0%"   stopColor="#6ec0ff" />
        <stop offset="45%"  stopColor="#2979d4" />
        <stop offset="100%" stopColor="#0d2080" />
      </radialGradient>
      <radialGradient id={`pu-${uid}`} cx="38%" cy="30%" r="55%">
        <stop offset="0%"   stopColor="#2a2a4a" />
        <stop offset="100%" stopColor="#050510" />
      </radialGradient>
      <radialGradient id={`g1-${uid}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#ffffff" stopOpacity="1" />
        <stop offset="100%" stopColor="#c8e8ff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

// ── Um olho anime individual ──────────────────────────────────────────────────
function AnimeEye({ cx, cy, size, uid }) {
  const r     = size * 0.44;
  const scRx  = r * 0.285;  // largura esclera — bem maior que antes
  const scRy  = r * 0.32;   // altura esclera — bem maior, quase redondo
  const iR    = scRx * 0.78; // íris
  const pR    = iR   * 0.52; // pupila
  const rimW  = size * 0.022;
  const lashW = Math.max(1, size * 0.024);

  // pontos dos cílios (6 cílios ao longo da pálpebra superior)
  const lashes = Array.from({ length: 6 }, (_, i) => {
    const t     = i / 5;
    const ax    = cx - scRx + scRx * 2 * t;
    const baseY = cy - scRy * (0.85 + 0.5 * Math.sin(Math.PI * t));
    const tipX  = ax + (t - 0.5) * size * 0.04;
    const tipY  = baseY - size * (0.035 + 0.018 * Math.sin(Math.PI * t));
    return { ax, baseY, tipX, tipY, w: lashW * (0.7 + 0.3 * Math.sin(Math.PI * t)) };
  });

  return (
    <g>
      {/* esclera branca */}
      <ellipse cx={cx} cy={cy} rx={scRx} ry={scRy} fill={`url(#sc-${uid})`} />
      {/* íris gradiente azul */}
      <circle  cx={cx} cy={cy} r={iR}  fill={`url(#ir-${uid})`} />
      {/* limbus escuro */}
      <circle  cx={cx} cy={cy} r={iR}  fill="none" stroke="#0a1860" strokeWidth={size * 0.018} />
      {/* pupila */}
      <circle  cx={cx} cy={cy} r={pR}  fill={`url(#pu-${uid})`} />
      {/* reflexo principal (grande, oval) */}
      <ellipse
        className="af-glint-main"
        cx={cx - iR * 0.28} cy={cy - iR * 0.38}
        rx={iR * 0.30} ry={iR * 0.26}
        fill={`url(#g1-${uid})`} opacity="0.92"
      />
      {/* reflexo secundário (pequeno, redondo) */}
      <circle cx={cx + iR * 0.18} cy={cy + iR * 0.28} r={iR * 0.13} fill="#cce8ff" opacity="0.65" />
      {/* flash de brilho (pisca periodicamente) */}
      <ellipse
        className="af-glint-flash"
        cx={cx - iR * 0.05} cy={cy - iR * 0.62}
        rx={iR * 0.12} ry={iR * 0.08}
        fill="white" opacity="0.9"
      />
      {/* pálpebra superior (formato arco anime) */}
      <path
        d={`M ${cx - scRx} ${cy}
            C ${cx - scRx * 0.7} ${cy - scRy * 1.35}
              ${cx + scRx * 0.7} ${cy - scRy * 1.35}
              ${cx + scRx} ${cy}`}
        fill="#1a1b2e"
        stroke="#1a1b2e"
        strokeWidth={rimW}
        strokeLinejoin="round"
      />
      {/* cílios superiores */}
      {lashes.map((l, i) => (
        <line
          key={i}
          x1={l.ax}   y1={l.baseY}
          x2={l.tipX} y2={l.tipY}
          stroke="#1a1b2e"
          strokeWidth={l.w}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

// ── Rosto base (fundo, bochechas — sem olhos) ─────────────────────────────────
function FaceBase({ size, uid, cheekOpacity }) {
  const cx = size / 2, cy = size / 2, r = size * 0.44;
  const ckRx = r * 0.28, ckRy = r * 0.18;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={`url(#fg-${uid})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3a3d58" strokeWidth={size * 0.012} />
      <ellipse cx={cx * 0.44} cy={cy * 1.18} rx={ckRx} ry={ckRy}
        fill={`url(#ck-${uid})`} opacity={Math.min(cheekOpacity, 2)} />
      <ellipse cx={cx * 1.56} cy={cy * 1.18} rx={ckRx} ry={ckRy}
        fill={`url(#ck-${uid})`} opacity={Math.min(cheekOpacity, 2)} />
    </>
  );
}

// ── Camada de olhos animados (sobreposta ao rosto) ────────────────────────────
function EyesLayer({ size, lookIdx, blinking, uid }) {
  const cx        = size / 2;
  const eyeY      = cx * 0.88;
  const eyeSpread = cx * 0.36;
  const eyeLx     = cx - eyeSpread;
  const eyeRx     = cx + eyeSpread;

  const look = LOOK_OFFSETS[lookIdx] || LOOK_OFFSETS[0];
  const mult = size * 0.012;
  const bsy  = blinking ? 0.04 : 1;
  const tr   = blinking
    ? 'transform 0.07s linear'
    : 'transform 0.42s cubic-bezier(.34,1.3,.64,1)';

  const styleL = {
    transform:       `translate(${look.lx * mult}px, ${look.ly * mult}px) scaleY(${look.lsy * bsy})`,
    transformOrigin: `${eyeLx}px ${eyeY}px`,
    transformBox:    'view-box',
    transition:       tr,
  };
  const styleR = {
    transform:       `translate(${look.rx * mult}px, ${look.ry * mult}px) scaleY(${look.rsy * bsy})`,
    transformOrigin: `${eyeRx}px ${eyeY}px`,
    transformBox:    'view-box',
    transition:       tr,
  };

  return (
    <svg
      style={{ position:'absolute', inset:0, pointerEvents:'none' }}
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <FaceDefs uid={`ov-${uid}`} />
      <g style={styleL}>
        <AnimeEye cx={eyeLx} cy={eyeY} size={size} uid={`ov-${uid}`} />
      </g>
      <g style={styleR}>
        <AnimeEye cx={eyeRx} cy={eyeY} size={size} uid={`ov-${uid}`} />
      </g>
    </svg>
  );
}

// ── Sparkles em anéis orbitais (rosto não gira) ───────────────────────────────
function SparkleOrbits({ size, colors }) {
  const orbits = [
    { dist:.58, dir:'cw',  dur:'2.8s', pdur:'2.2s', pdelay:'0s',    sz:Math.max(5,size*.11), color:colors[0] },
    { dist:.62, dir:'ccw', dur:'3.4s', pdur:'2.5s', pdelay:'0.55s', sz:Math.max(4,size*.09), color:colors[1] },
    { dist:.55, dir:'cw',  dur:'4.0s', pdur:'2.0s', pdelay:'1.1s',  sz:Math.max(4,size*.10), color:colors[2] },
    { dist:.66, dir:'ccw', dur:'2.4s', pdur:'2.7s', pdelay:'1.7s',  sz:Math.max(3,size*.08), color:colors[3] },
  ];
  return (
    <>
      {orbits.map((o, i) => {
        const d   = o.dist * 2 * size;
        const off = (size - d) / 2;
        return (
          <div
            key={i}
            className={`af-spark-orbit ${o.dir}`}
            style={{ left:off, top:off, width:d, height:d, '--dur':o.dur }}
          >
            <div
              className="af-spark-dot"
              style={{ width:o.sz, height:o.sz, marginLeft:-o.sz/2, '--pdur':o.pdur, '--pdelay':o.pdelay }}
            >
              <svg width={o.sz} height={o.sz} viewBox="-5 -5 10 10">
                <path
                  d="M0,-4C.3,-1.5 1.5,-.3 4,0C1.5,.3.3,1.5 0,4C-.3,1.5-1.5,.3-4,0C-1.5,-.3-.3,-1.5 0,-4Z"
                  fill={o.color} opacity="0.9"
                />
              </svg>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Acessórios por estado ─────────────────────────────────────────────────────
function ThinkDots({ size }) {
  const s = size, cx = s / 2;
  return (
    <svg style={{ position:'absolute',inset:0,pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {[0,1,2].map(i => (
        <circle key={i} className={`af-dot${i}`}
          cx={cx - s*.1 + i*s*.1} cy={s*.87} r={s*.033} fill="#9B72CB"/>
      ))}
      <path d={`M${cx-s*.08} ${s*.076} Q${cx} ${s*.05} ${cx+s*.08} ${s*.076}`}
        fill="none" stroke="#9B72CB" strokeWidth={s*.022} strokeLinecap="round" opacity=".7"/>
    </svg>
  );
}

function AudioWaves({ size }) {
  const s = size, cx = s / 2;
  const hs = [s*.05, s*.1, s*.15, s*.1, s*.05];
  return (
    <svg style={{ position:'absolute',inset:0,pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {hs.map((h, i) => (
        <line key={i} className={`af-wave${i}`}
          x1={cx - s*.18 + i*s*.09} y1={s*.87 - h/2}
          x2={cx - s*.18 + i*s*.09} y2={s*.87 + h/2}
          stroke="#D96570" strokeWidth={s*.025} strokeLinecap="round"/>
      ))}
    </svg>
  );
}

function HeartFloat({ size }) {
  const s = size;
  const h = (sx, sy) =>
    `M${s*sx} ${s*sy} C${s*sx},${s*(sy-.08)} ${s*(sx-.1)},${s*(sy-.08)} ${s*(sx-.1)},${s*sy} ` +
    `C${s*(sx-.1)},${s*(sy-.08)} ${s*(sx-.2)},${s*(sy-.08)} ${s*(sx-.2)},${s*sy} ` +
    `C${s*(sx-.2)},${s*(sy+.08)} ${s*(sx-.1)},${s*(sy+.16)} ${s*(sx-.1)},${s*(sy+.16)} ` +
    `C${s*(sx-.1)},${s*(sy+.16)} ${s*sx},${s*(sy+.08)} ${s*sx},${s*sy}Z`;
  return (
    <svg style={{ position:'absolute',inset:0,pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <g className="af-float0"><path d={h(.83,.22)} fill="#D96570"/></g>
      <g className="af-float1"><path d={h(.96,.30)} fill="#9B72CB" opacity=".8"/></g>
    </svg>
  );
}

function CheckMark({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute',inset:0,pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <g style={{ transformOrigin:`${s*.8}px ${s*.22}px`, transformBox:'fill-box', animation:'af-check-pop .4s ease-out both' }}>
        <circle cx={s*.8} cy={s*.22} r={s*.1} fill="#639922"/>
        <path d={`M${s*.74} ${s*.22} L${s*.78} ${s*.26} L${s*.86} ${s*.18}`}
          fill="none" stroke="white" strokeWidth={s*.025} strokeLinecap="round" strokeLinejoin="round"/>
      </g>
    </svg>
  );
}

function CodeTag({ size }) {
  return (
    <svg style={{ position:'absolute',inset:0,pointerEvents:'none' }} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="af-float0">
      <text x={size*.7} y={size*.28} fontSize={size*.22} fill="#378ADD"
        fontFamily="'JetBrains Mono',monospace" fontWeight="bold">&lt;&gt;</text>
    </svg>
  );
}

function BookPages({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute',inset:0,pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="af-float0">
      <rect x={s*.68} y={s*.12} width={s*.1} height={s*.14} rx={s*.015} fill="#1D9E75"/>
      <rect x={s*.80} y={s*.14} width={s*.1} height={s*.14} rx={s*.015} fill="#0F6E56"/>
    </svg>
  );
}

function CameraFlash({ size }) {
  const s = size;
  return (
    <svg style={{ position:'absolute',inset:0,pointerEvents:'none' }} width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={s/2} cy={s/2} r={s*.46} fill="white" opacity=".16" className="af-pulse-ring"/>
      <path d={`M${s*.78} ${s*.2} C${s*.8},${s*.12} ${s*.9},${s*.16} ${s*.86},${s*.26}Z`}
        fill="#EF9F27" opacity=".9" className="af-float0"/>
    </svg>
  );
}

// ── Configs por estado ────────────────────────────────────────────────────────
const STATE_CONFIGS = {
  idle:     { wrapClass:'af-wrap s-breathe', cheek:1,   colors:['#4285F4','#9B72CB','#D96570','#A78BFA'], Acc:null        },
  thinking: { wrapClass:'af-wrap s-breathe', cheek:.6,  colors:['#9B72CB','#9B72CB','#A78BFA','#9B72CB'], Acc:ThinkDots   },
  text:     { wrapClass:'af-wrap s-nod',     cheek:1.8, colors:['#D96570','#9B72CB','#D96570','#9B72CB'], Acc:HeartFloat  },
  audio:    { wrapClass:'af-wrap s-breathe', cheek:1.2, colors:['#D96570','#D96570','#D96570','#D96570'], Acc:AudioWaves  },
  photo:    { wrapClass:'af-wrap s-bounce',  cheek:2,   colors:['#EF9F27','#D96570','#EF9F27','#9B72CB'], Acc:CameraFlash },
  code:     { wrapClass:'af-wrap s-breathe', cheek:.8,  colors:['#378ADD','#4285F4','#378ADD','#4285F4'], Acc:CodeTag     },
  book:     { wrapClass:'af-wrap s-nod',     cheek:1.4, colors:['#1D9E75','#0F6E56','#1D9E75','#0F6E56'], Acc:BookPages   },
  done:     { wrapClass:'af-wrap s-bounce',  cheek:2.2, colors:['#639922','#1D9E75','#639922','#1D9E75'], Acc:CheckMark   },
};

let _counter = 0;

// ── Componente principal ──────────────────────────────────────────────────────
export default function AnalyizFace({ size = 62, state = 'idle', animating }) {
  injectCSS();
  const [uid] = useState(() => `af${++_counter}`);

  const resolvedState = animating === true
    ? 'thinking'
    : (STATE_CONFIGS[state] ? state : 'idle');

  const cfg = STATE_CONFIGS[resolvedState];
  const { Acc } = cfg;
  const { lookIdx, blinking } = useAnimeEyes();

  return (
    <div className={cfg.wrapClass} style={{ width:size, height:size }}>

      {/* 1 · Rosto base (fundo + bochechas) */}
      <svg
        style={{ position:'relative', zIndex:2 }}
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <FaceDefs uid={uid} />
        <FaceBase size={size} uid={uid} cheekOpacity={cfg.cheek} />
      </svg>

      {/* 2 · Olhos anime sobrepostos com animação */}
      <EyesLayer size={size} lookIdx={lookIdx} blinking={blinking} uid={uid} />

      {/* 3 · Acessório do estado */}
      {Acc && <Acc size={size} />}

      {/* 4 · Sparkles em anéis orbitais independentes */}
      <SparkleOrbits size={size} colors={cfg.colors} />
    </div>
  );
}

// ── Hook de estado automático ─────────────────────────────────────────────────
export function useAnalyizFaceState({ isLoading = false, fileType = null, justDone = false } = {}) {
  if (justDone)  return 'done';
  if (isLoading) return 'thinking';
  if (!fileType) return 'idle';
  const map = {
    pdf:'book',  xlsx:'book', xls:'book',  csv:'book',
    mp3:'audio', wav:'audio', ogg:'audio', m4a:'audio', webm:'audio',
    jpg:'photo', jpeg:'photo',png:'photo', gif:'photo', webp:'photo',
    js:'code',   jsx:'code',  ts:'code',   tsx:'code',  py:'code',
    html:'code', css:'code',  txt:'text',  md:'book',
  };
  return map[fileType.toLowerCase()] || 'text';
}