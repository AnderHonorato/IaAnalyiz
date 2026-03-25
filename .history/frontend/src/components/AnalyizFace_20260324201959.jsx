// AnalyizFace.jsx — v5 — Estilo Flat 2D Inspirado Mercado Livre
// Rosto redondo azul vibrante, visual flat sem sombras/gradientes.
// Animação: APENAS piscando os olhos (scaleY nunca vai a 0).
// Estados: idle | thinking | upload | done | text | photo | code | book | audio | happy | error | alert

import React from 'react';

const FACE_CSS = `
  @keyframes af5-blink {
    0%, 88%, 100% { transform: scaleY(1); }
    93% { transform: scaleY(0.1); } /* Nunca some completamente */
  }

  .af5-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Olhos piscando - aplicada diretamente nos grupos dos olhos */
  .af5-eye-blink {
    animation: af5-blink 4s ease-in-out infinite;
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

// ── Paleta por estado — CORES SÓLIDAS FLAT ─────────────────────────────────
const STATE_CONFIG = {
  idle:     { bg: '#1273EA', cheek: 'rgba(255,255,255,0.1)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', mouthColor: '#FFFFFF' },
  thinking: { bg: '#1273EA', cheek: 'rgba(255,255,255,0.08)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', mouthColor: '#FFFFFF' },
  upload:   { bg: '#0A5DC2', cheek: 'rgba(255,255,255,0.12)', eyeWhite: '#FFFFFF', pupil: '#063A80', mouthColor: '#FFFFFF' },
  done:     { bg: '#00A650', cheek: 'rgba(255,255,255,0.1)', eyeWhite: '#FFFFFF', pupil: '#005A2B', mouthColor: '#FFFFFF' },
  text:     { bg: '#1273EA', cheek: 'rgba(255,255,255,0.08)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', mouthColor: '#FFFFFF' },
  photo:    { bg: '#FF6B00', cheek: 'rgba(255,255,255,0.1)', eyeWhite: '#FFFFFF', pupil: '#8B3500', mouthColor: '#FFFFFF' },
  code:     { bg: '#0D47A1', cheek: 'rgba(255,255,255,0.08)', eyeWhite: '#FFFFFF', pupil: '#071F5E', mouthColor: '#FFFFFF' },
  book:     { bg: '#00695C', cheek: 'rgba(255,255,255,0.08)', eyeWhite: '#FFFFFF', pupil: '#003D33', mouthColor: '#FFFFFF' },
  audio:    { bg: '#6A1B9A', cheek: 'rgba(255,255,255,0.1)', eyeWhite: '#FFFFFF', pupil: '#3A0050', mouthColor: '#FFFFFF' },
  happy:    { bg: '#1273EA', cheek: 'rgba(255,255,255,0.12)', eyeWhite: '#FFFFFF', pupil: '#0A4CAA', mouthColor: '#FFFFFF' },
  error:    { bg: '#D32F2F', cheek: 'rgba(255,255,255,0.08)', eyeWhite: '#FFFFFF', pupil: '#7A0000', mouthColor: '#FFFFFF' },
  alert:    { bg: '#F57C00', cheek: 'rgba(255,255,255,0.1)', eyeWhite: '#FFFFFF', pupil: '#7A3C00', mouthColor: '#FFFFFF' },
};

// ── Configuração dos Olhos — FLAT E SEM MOVIMENTO ──────────────────────────
const EYE_CONFIG = {
  // Simplificado: scaleY padrão e formato, piscada ativada
  default:  { scaleY: 1.0, shape: 'round', blink: true },
  wide:     { scaleY: 1.1, shape: 'round', blink: true },
  happy:    { scaleY: 0.6, shape: 'happy', blink: false }, // Olho "^" não pisca
  sad:      { scaleY: 0.8, shape: 'sad',   blink: true },
};

// Mapeamento de estado para config de olho
const STATE_TO_EYE = {
  idle: 'default', thinking: 'default', upload: 'wide', done: 'happy',
  text: 'default', photo: 'wide', code: 'default', book: 'default',
  audio: 'default', happy: 'happy', error: 'sad', alert: 'wide'
};

function FaceSVG({ size, state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.idle;
  const eyeKey = STATE_TO_EYE[state] || 'default';
  const ec = EYE_CONFIG[eyeKey];
  
  const cx = size / 2;
  const cy = size / 2;
  // R$ bem definido para visual flat
  const r = size * 0.45;

  const eyeY = cy * 0.90;
  const eyeGap = r * 0.52;
  const eyeLx = cx - eyeGap;
  const eyeRx = cx + eyeGap;

  // Tamanho dos olhos grandes e ovais
  const erxBase = r * 0.30;
  const eryBase = r * 0.32;
  const erx = erxBase;
  const ery = eryBase * ec.scaleY;

  // Pupila centralizada
  const prx = erxBase * 0.55;
  const pry = erxBase * 0.58;

  function Eye({ x }) {
    if (ec.shape === 'happy') {
      // Olho "^" sorridente flat
      return (
        <g transform={`translate(${x}, ${eyeY})`}>
          <path
            d={`M${-erx * 0.9} ${ery * 0.2} Q0 ${-ery * 0.8} ${erx * 0.9} ${ery * 0.2}`}
            fill="none"
            stroke={cfg.pupil}
            strokeWidth={size * 0.05}
            strokeLinecap="round"
          />
        </g>
      );
    }

    // Olho padrão / wide / sad (Sad muda a rotação, não o shape)
    const eyeRotation = ec.shape === 'sad' ? (x < cx ? -15 : 15) : 0;

    return (
      <g transform={`translate(${x}, ${eyeY}) rotate(${eyeRotation})`}>
        {/* Branco do olho */}
        <ellipse cx={0} cy={0} rx={erx} ry={ery} fill={cfg.eyeWhite} />
        {/* Íris/Pupila centralizada (sem animação de olhar) */}
        <ellipse cx={0} cy={0} rx={prx} ry={pry} fill={cfg.pupil} />
        {/* Brilho único flat */}
        <circle cx={-erx * 0.25} cy={-ery * 0.3} r={erx * 0.22} fill="#FFFFFF" />
      </g>
    );
  }

  function Mouth() {
    const my = cy * 1.25;
    const mw = r * 0.40;
    const sw = size * 0.035;

    if (state === 'done' || state === 'happy') {
      // Sorriso grande flat
      return <path d={`M${cx - mw} ${my - r * 0.05} Q${cx} ${my + r * 0.25} ${cx + mw} ${my - r * 0.05}`}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw} strokeLinecap="round" />;
    }
    if (state === 'upload' || state === 'photo' || state === 'alert') {
      // "O" surpresa flat
      return <ellipse cx={cx} cy={my} rx={mw * 0.4} ry={mw * 0.35}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw} />;
    }
    if (state === 'thinking' || state === 'book') {
      // Boca reta flat
      return <path d={`M${cx - mw * 0.6} ${my} L${cx + mw * 0.6} ${my}`}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw} strokeLinecap="round" />;
    }
    if (state === 'error') {
      // Boca curvada para baixo flat
      return <path d={`M${cx - mw * 0.8} ${my + r * 0.08} Q${cx} ${my - r * 0.12} ${cx + mw * 0.8} ${my + r * 0.08}`}
        fill="none" stroke={cfg.mouthColor} strokeWidth={sw} strokeLinecap="round" />;
    }
    // Sorriso suave padrão flat
    return <path d={`M${cx - mw * 0.7} ${my} Q${cx} ${my + r * 0.15} ${cx + mw * 0.7} ${my}`}
      fill="none" stroke={cfg.mouthColor} strokeWidth={sw} strokeLinecap="round" />;
  }

  function Eyebrows() {
    if (state !== 'thinking' && state !== 'book' && state !== 'error') return null;
    const byY = eyeY - eryBase - size * 0.06;
    const bw = erx * 0.8;
    const sw = size * 0.025;
    
    if (state === 'error') {
      // Sobrancelhas bravas/tristes
      return (
        <>
          <path d={`M${eyeLx - bw} ${byY + size*0.02} L${eyeLx + bw*0.8} ${byY}`} fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" />
          <path d={`M${eyeRx + bw} ${byY + size*0.02} L${eyeRx - bw*0.8} ${byY}`} fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" />
        </>
      );
    }
    // Sobrancelhas retas pensativas
    return (
      <>
        <path d={`M${eyeLx - bw} ${byY} L${eyeLx + bw} ${byY}`} fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" />
        <path d={`M${eyeRx - bw} ${byY} L${eyeRx + bw} ${byY}`} fill="none" stroke={cfg.eyeWhite} strokeWidth={sw} strokeLinecap="round" />
      </>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
      {/* ClipPath para garantir que nada saia do rosto */}
      <defs>
        <clipPath id={`af5-clip-${Math.round(size)}`}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>

      {/* Face - COR SÓLIDA FLAT, SEM GRADIENTE/SOMBRA */}
      <circle cx={cx} cy={cy} r={r} fill={cfg.bg} />

      {/* Bochechas sutis flat */}
      <ellipse cx={cx * 0.45} cy={cy * 1.15} rx={r * 0.28} ry={r * 0.15} fill={cfg.cheek} />
      <ellipse cx={cx * 1.55} cy={cy * 1.15} rx={r * 0.28} ry={r * 0.15} fill={cfg.cheek} />

      {/* Grupo de olhos com animação de piscada condicional */}
      <g clipPath={`url(#af5-clip-${Math.round(size)})`}>
        <Eyebrows />
        {/* Olho esquerdo */}
        <g
          className={ec.blink ? 'af5-eye-blink' : ''}
          style={ec.blink ? { transformOrigin: `${eyeLx}px ${eyeY}px` } : {}}
        >
          <Eye x={eyeLx} />
        </g>
        {/* Olho direito - pequeno delay para naturalidade */}
        <g
          className={ec.blink ? 'af5-eye-blink' : ''}
          style={ec.blink ? { transformOrigin: `${eyeRx}px ${eyeY}px`, animationDelay: '0.1s' } : {}}
        >
          <Eye x={eyeRx} />
        </g>
      </g>

      {/* Boca */}
      <Mouth />
    </svg>
  );
}

// ── Dots "pensando" — MANTIDOS MAS ESTÁTICOS ─────────────────────────────────
function ThinkingDots({ size }) {
  return (
    <div style={{ position: 'absolute', bottom: size * 0.05, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: size * 0.06, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width:  size * 0.07,
          height: size * 0.07,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)',
          // Removi a animação af4-dot-bounce
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — TOTALMENTE ESTÁTICO (SÓ PISCA)
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyizFace({ size = 60, state = 'idle' }) {
  injectCSS();
  const resolvedState = STATE_CONFIG[state] ? state : 'idle';

  return (
    <div className="af5-wrap" style={{ width: size, height: size, position: 'relative' }}>
      {/* Removido OrbitParticles */}

      <div style={{ position: 'relative', zIndex: 2, width: size, height: size }}>
        <FaceSVG size={size} state={resolvedState} />
      </div>

      {/* Dots estáticos no estado thinking */}
      {resolvedState === 'thinking' && (
        <ThinkingDots size={size} />
      )}
    </div>
  );
}

// ── Hook utilitário — MANTIDO ────────────────────────────────────────────────
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