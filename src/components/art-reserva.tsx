/**
 * Ilustraciones de RESERVA de sobres y cajas (se muestran cuando no hay foto, o cuando la foto no se pudo descargar). Módulo chico y sin cálculos al importarlo:
 * se usa también en el navegador (src/components/safe-image.tsx); la escena grande del inicio vive en art.tsx.
 */
type Tone = { a: string; b: string; c: string; d: string };
export const tones: Record<string, Tone> = {
  mint: { a: "#0b4032", b: "#43c29a", c: "#d4b872", d: "#baf3d9" },
  ink: { a: "#0a1210", b: "#1f7a5c", c: "#d4b872", d: "#79e0b4" },
  paper: { a: "#8a2a1a", b: "#f0a246", c: "#fff2c4", d: "#ffd27a" },
  violet: { a: "#251650", b: "#8a63d9", c: "#f2e3ff", d: "#c9a6ff" },
  gold: { a: "#5a2f0a", b: "#f0b238", c: "#fff2c4", d: "#ffe08a" },
};
export const T = (k: string) => tones[k] ?? tones.mint;

function Crimp({ y, fill }: { y: number; fill: string }) {
  const teeth = Array.from({ length: 17 }, (_, i) => i);
  return (
    <g>
      <rect x="10" y={y} width="140" height="16" fill={fill} />
      {teeth.map((i) => <rect key={i} x={12 + i * 8.2} y={y} width="3" height="16" fill="#0003" />)}
    </g>
  );
}

export function PackArt({ tone = "mint", label = "DEMO", className = "" }: { tone?: string; label?: string; className?: string }) {
  const t = T(tone);
  const k = `${tone}-${label.replace(/\W/g, "")}`;
  return (
    <svg viewBox="0 0 160 270" className={className} role="img" aria-label="Ilustración de sobre sellado (demo)">
      <defs>
        <linearGradient id={`pg-${k}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.b} /><stop offset=".6" stopColor={t.a} /><stop offset="1" stopColor={t.a} />
        </linearGradient>
        <linearGradient id={`ps-${k}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".38" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`pc-${k}`}><rect x="10" y="22" width="140" height="226" /></clipPath>
      </defs>
      <rect x="10" y="10" width="140" height="250" fill="#c9ceca" />
      <g clipPath={`url(#pc-${k})`}>
        <rect x="10" y="22" width="140" height="226" fill={`url(#pg-${k})`} />
        <circle cx="86" cy="118" r="62" fill={t.c} opacity=".18" />
        {Array.from({ length: 14 }, (_, i) => <line key={i} x1="80" y1="118" x2={80 + 110 * Math.cos((i * Math.PI) / 7)} y2={118 + 110 * Math.sin((i * Math.PI) / 7)} stroke={t.c} strokeWidth="1.2" opacity=".28" />)}
        <path d="M-10 190C20 120 60 150 90 90S150 70 190 20" stroke={t.c} strokeWidth="9" fill="none" strokeLinecap="round" opacity=".9" />
        <path d="M-10 205C30 150 70 180 100 120S150 100 190 50" stroke={t.d} strokeWidth="3" fill="none" opacity=".7" />
        <path d="M118 70c-16 0-24 12-24 24 8-6 16-6 24 0 8-6 16-6 24 0 0-12-8-24-24-24Z" fill="#06241b" opacity=".55" />
        <rect x="-20" y="30" width="60" height="320" fill={`url(#ps-${k})`} transform="rotate(25 0 0) translate(30 -40)" />
      </g>
      <Crimp y={10} fill="#d9dcd6" />
      <Crimp y={244} fill="#d9dcd6" />
      <rect x="14" y="30" width="132" height="26" fill="#050a08" opacity=".78" />
      <text x="80" y="49" textAnchor="middle" style={{ fontFamily: "var(--font-display)" }} fontSize="18" fill={t.c} letterSpacing="3">POKÉMON</text>
      <rect x="14" y="200" width="132" height="34" fill="#050a08" opacity=".82" />
      <text x="80" y="223" textAnchor="middle" style={{ fontFamily: "var(--font-display)" }} fontSize="17" fill="#fff" letterSpacing="3">{label}</text>
    </svg>
  );
}

export function BoxArt({ tone = "ink", label = "DEMO", className = "" }: { tone?: string; label?: string; className?: string }) {
  const t = T(tone);
  const k = `${tone}-${label.replace(/\W/g, "")}`;
  return (
    <svg viewBox="0 0 300 250" className={className} role="img" aria-label="Ilustración de caja sellada (demo)">
      <defs>
        <linearGradient id={`bf-${k}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.b} /><stop offset=".7" stopColor={t.a} /><stop offset="1" stopColor={t.a} />
        </linearGradient>
        <linearGradient id={`bs-${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.a} /><stop offset="1" stopColor="#000" /></linearGradient>
        <clipPath id={`bc-${k}`}><path d="M24 62L196 38V212L24 232Z" /></clipPath>
      </defs>
      <ellipse cx="150" cy="238" rx="132" ry="9" fill="#0007" />
      {/* lateral */}
      <path d="M196 38L276 64V196L196 212Z" fill={`url(#bs-${k})`} stroke="#0008" />
      <path d="M205 74L268 94" stroke={t.c} strokeWidth="3" opacity=".8" />
      <path d="M205 150L268 134" stroke={t.c} strokeWidth="3" opacity=".6" />
      <text x="236" y="136" textAnchor="middle" style={{ fontFamily: "var(--font-display)" }} fontSize="19" fill="#fff" opacity=".85" letterSpacing="3" transform="rotate(90 236 136) skewX(0)">{label}</text>
      {/* frente */}
      <path d="M24 62L196 38V212L24 232Z" fill={`url(#bf-${k})`} />
      <g clipPath={`url(#bc-${k})`}>
        <circle cx="130" cy="130" r="84" fill={t.c} opacity=".15" />
        <path d="M10 210C50 120 100 170 140 100S200 70 230 30" stroke={t.c} strokeWidth="12" fill="none" strokeLinecap="round" opacity=".92" />
        <path d="M10 226C60 150 110 200 150 130S200 100 230 62" stroke={t.d} strokeWidth="3.5" fill="none" opacity=".7" />
        <path d="M80 150l14-34 14 34-14 -8Z" fill="#06241b" opacity=".4" />
        <rect x="0" y="0" width="60" height="320" fill="#fff" opacity=".13" transform="rotate(14 90 120) translate(70 -40)" />
      </g>
      {/* tapa */}
      <path d="M24 62L196 38L276 64L98 92Z" fill="#fff" opacity=".2" />
      <path d="M24 62L196 38L276 64L98 92Z" fill="none" stroke="#0007" />
      <rect x="40" y="76" width="140" height="26" fill="#050a08" opacity=".8" transform="rotate(-4 110 90)" />
      <text x="110" y="95" textAnchor="middle" style={{ fontFamily: "var(--font-display)" }} fontSize="20" fill={t.c} letterSpacing="3" transform="rotate(-4 110 90)">POKÉMON</text>
      <rect x="40" y="186" width="140" height="30" fill="#050a08" opacity=".82" transform="rotate(-4 110 200)" />
      <text x="110" y="208" textAnchor="middle" style={{ fontFamily: "var(--font-display)" }} fontSize="18" fill="#fff" letterSpacing="3" transform="rotate(-4 110 200)">{label}</text>
    </svg>
  );
}

