// AnalyizFace.jsx — v6 — Cópia Fiel da Imagem de Referência do Mercado Livre
// Rosto oval azul vibrante, visual flat 2D.
// Detalhes fiéis: Olhos ovais retos, nariz de gota, boca reta, pálpebra azul.
// Animação: APENAS piscando os olhos (nunca some completamente).

import React from 'react';

const FACE_CSS = `
  @keyframes af6-blink {
    0%, 88%, 100% { transform: scaleY(1); }
    93% { transform: scaleY(0.12); } /* Nunca some completamente */
  }

  .af6-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Olhos piscando - aplicada diretamente nos grupos dos olhos */
  .af6-eye-blink {
    animation: af6-blink 3.8s ease-in-out infinite;
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

// ── Paleta Única para Reproduzir a Imagem ─────────────────────────────────
const FACE_COLORS = {
  bg: '#1273EA',          // Azul vibrante sólido (Flat)
  eyelid: '#1273EA',      // Pálpebra azul (mesma cor do rosto)
  eyeWhite: '#FFFFFF',    // Branco do olho
  pupil: '#0A4CAA',       // Azul escuro da pupila
  mouthNariz: '#FFFFFF',  // Branco para nariz e boca
};

export default function AnalyizFace({ size = 64 }) {
  injectCSS();

  const cx = size / 2;
  const cy = size / 2;

  // AJUSTE CRUCIAL: Formato OVAL alongado verticalmente (rx < ry)
  const faceRx = size * 0.40;
  const faceRy = size * 0.48;

  // Posição e dimensões dos olhos grandes e ovais
  const eyeY = cy * 0.88;
  const eyeGap = faceRx * 0.52;
  const eyeLx = cx - eyeGap;
  const eyeRx = cx + eyeGap;

  // Tamanho dos olhos grandes e retos (sem rotação)
  const erxBase = faceRx * 0.32;
  const eryBase = faceRy * 0.34;

  // Pupila grande e centralizada
  const prx = erxBase * 0.70;
  const pry = eryBase * 0.75;

  // Nariz e Boca fiéis
  const mouthY = cy * 1.38;
  const mouthW = faceRx * 0.35;
  const narizY = cy * 1.15;
  const narizW = size * 0.022;

  return (
    <div className="af6-wrap" style={{ width: size, height: size * 1.2, position: 'relative' }}>
      <svg width={size} height={size * 1.2} viewBox={`0 0 ${size} ${size * 1.2}`} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
        {/* ClipPath para o rosto oval */}
        <defs>
          <clipPath id={`af6-clip-${Math.round(size)}`}>
            <ellipse cx={cx} cy={cy} rx={faceRx} ry={faceRy} />
          </clipPath>
        </defs>

        {/* Rosto - COR SÓLIDA FLAT, FORMATO OVAL */}
        <ellipse cx={cx} cy={cy} rx={faceRx} ry={faceRy} fill={FACE_COLORS.bg} />

        {/* Grupo de olhos com animação de piscada */}
        <g clipPath={`url(#af6-clip-${Math.round(size)})`}>
          
          {/* Olho esquerdo */}
          <g transform={`translate(${eyeLx}, ${eyeY})`}>
            {/* Grupo que pisca */}
            <g className="af6-eye-blink" style={{ transformOrigin: '0px 0px' }}>
              {/* Branco do olho */}
              <ellipse cx={0} cy={0} rx={erxBase} ry={eryBase} fill={FACE_COLORS.eyeWhite} />
              {/* Pupila centralizada */}
              <ellipse cx={0} cy={eryBase * 0.1} rx={prx} ry={pry} fill={FACE_COLORS.pupil} />
              {/* Brilho único flat */}
              <circle cx={-erxBase * 0.25} cy={-eryBase * 0.35} r={erxBase * 0.25} fill="#FFFFFF" />
            </g>
            {/* Pálpebra azul fixa em cima */}
            <rect x={-erxBase} y={-eryBase * 1.1} width={erxBase * 2} height={eryBase * 1.2} fill={FACE_COLORS.eyelid} />
          </g>

          {/* Olho direito - pequeno delay */}
          <g transform={`translate(${eyeRx}, ${eyeY})`}>
            {/* Grupo que pisca */}
            <g className="af6-eye-blink" style={{ transformOrigin: '0px 0px', animationDelay: '0.1s' }}>
              {/* Branco do olho */}
              <ellipse cx={0} cy={0} rx={erxBase} ry={eryBase} fill={FACE_COLORS.eyeWhite} />
              {/* Pupila centralizada */}
              <ellipse cx={0} cy={eryBase * 0.1} rx={prx} ry={pry} fill={FACE_COLORS.pupil} />
              {/* Brilho único flat */}
              <circle cx={-erxBase * 0.25} cy={-eryBase * 0.35} r={erxBase * 0.25} fill="#FFFFFF" />
            </g>
            {/* Pálpebra azul fixa em cima */}
            <rect x={-erxBase} y={-eryBase * 1.1} width={erxBase * 2} height={eryBase * 1.2} fill={FACE_COLORS.eyelid} />
          </g>
        </g>

        {/* Nariz - DOIS FURINHOS GOTA FIÉIS (Branco) */}
        <path d={`M${cx - size*0.02} ${narizY} Q${cx - size*0.02} ${narizY - size*0.01} ${cx - size*0.015} ${narizY - size*0.01} L${cx - size*0.01} ${narizY} Z`} fill={FACE_COLORS.mouthNariz} opacity="0.9" />
        <path d={`M${cx + size*0.02} ${narizY} Q${cx + size*0.02} ${narizY - size*0.01} ${cx + size*0.015} ${narizY - size*0.01} L${cx + size*0.01} ${narizY} Z`} fill={FACE_COLORS.mouthNariz} opacity="0.9" />

        {/* Boca - RETA E FINA FIEL (Branco) */}
        <path d={`M${cx - mouthW} ${mouthY} L${cx + mouthW} ${mouthY}`}
          fill="none" stroke={FACE_COLORS.mouthNariz} strokeWidth={size * 0.03} strokeLinecap="round" />
      </svg>
    </div>
  );
}