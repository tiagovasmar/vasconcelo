/**
 * Ilustraciones vectoriales de RESERVA: solo se muestran mientras no exista la imagen raster
 * correspondiente en public/images (ver docs/ASSETS-PENDIENTES.md y src/components/slot.tsx).
 */

import { T } from "./art-reserva";

export { BoxArt, PackArt } from "./art-reserva";

/* ---------- geometría del dragón celeste ---------- */
type P = [number, number];
function catmull(pts: P[], per = 24): P[] {
  const out: P[] = [];
  const g = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [g(i - 1), g(i), g(i + 1), g(i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const spine = catmull([
  [640, 700], [520, 600], [600, 470], [440, 380], [250, 440], [120, 320], [240, 210], [430, 250], [540, 150], [420, 92],
]);
const widthAt = (t: number) => 8 + 84 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.02)), 0.55) * (t > 0.9 ? 1 - (t - 0.9) * 2 : 1);

function ribbon(side: -1 | 1 | 0, scale = 1, shift = 0) {
  const left: P[] = [], right: P[] = [];
  spine.forEach((p, i) => {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = (widthAt(i / (spine.length - 1)) / 2) * scale;
    const o = shift * (widthAt(i / (spine.length - 1)) / 2);
    left.push([p[0] + nx * (w + o), p[1] + ny * (w + o)]);
    right.push([p[0] - nx * (w - o), p[1] - ny * (w - o)]);
  });
  void side;
  const pts = [...left, ...right.reverse()];
  return "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L") + "Z";
}
const bodyPath = ribbon(0);
const bellyPath = ribbon(0, 0.4, 0.55);
const ridges = spine
  .map((p, i) => {
    if (i % 5 !== 0 || i < 8 || i > spine.length - 14) return "";
    const a = spine[i - 1], b = spine[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = dy / l, ny = -dx / l, w = widthAt(i / (spine.length - 1)) / 2;
    const bx = p[0] + nx * w, by = p[1] + ny * w;
    const s = 5 + w * 0.5;
    return `M${bx - dx / l * s} ${by - dy / l * s}L${bx + nx * s * 1.7} ${by + ny * s * 1.7}L${bx + dx / l * s} ${by + dy / l * s}Z`;
  })
  .join("");
const bands = spine
  .map((p, i) => {
    if (i % 11 !== 3 || i < 10 || i > spine.length - 16) return "";
    const a = spine[i - 1], b = spine[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = widthAt(i / (spine.length - 1)) / 2;
    return `M${p[0] + nx * w} ${p[1] + ny * w}L${p[0] - nx * w} ${p[1] - ny * w}`;
  })
  .join("");
const headAt = spine[spine.length - 1];
const headPrev = spine[spine.length - 4];
const headAngle = (Math.atan2(headAt[1] - headPrev[1], headAt[0] - headPrev[0]) * 180) / Math.PI;
const headFlip = Math.cos((headAngle * Math.PI) / 180) < 0 ? -1 : 1;

/** Dragón celeste original (no es un personaje existente): cuerpo ondulado, aletas, cabeza con mandíbula abierta. */
export function SkySerpent({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 700 760" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sp-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3fe0a0" /><stop offset=".55" stopColor="#12805c" /><stop offset="1" stopColor="#0a3d2e" />
        </linearGradient>
        <linearGradient id="sp-belly" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f6ffb0" /><stop offset="1" stopColor="#d4b872" />
        </linearGradient>
        <filter id="sp-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <path d={bodyPath} fill="#d4b872" opacity=".35" filter="url(#sp-glow)" />
      <path d={bodyPath} fill="url(#sp-body)" stroke="#06241b" strokeWidth="3" strokeLinejoin="round" />
      <path d={bellyPath} fill="url(#sp-belly)" opacity=".9" />
      <path d={bands} stroke="#06241b" strokeWidth="3" opacity=".35" fill="none" />
      <path d={ridges} fill="#d4b872" stroke="#06241b" strokeWidth="1.5" strokeLinejoin="round" />
      <g transform={`translate(${headAt[0]} ${headAt[1]}) rotate(${headAngle}) scale(1.9 ${1.9 * headFlip})`}>
        {/* cuernos */}
        <path d="M-6 -22L-60 -50L-46 -14Z" fill="#d4b872" stroke="#06241b" strokeWidth="2" />
        <path d="M-10 -8L-74 -12L-48 6Z" fill="#a8d83a" stroke="#06241b" strokeWidth="2" />
        {/* mandíbula inferior */}
        <path d="M-4 14C20 30 62 42 104 30L92 20C60 24 30 14 8 4Z" fill="#0f6a4c" stroke="#06241b" strokeWidth="3" strokeLinejoin="round" />
        <path d="M92 20L100 8L84 14ZM70 22L74 11L62 17Z" fill="#fff" />
        {/* boca */}
        <path d="M4 4C34 18 70 20 96 16L100 8C70 14 34 6 8 -6Z" fill="#7a1230" />
        {/* cráneo / mandíbula superior */}
        <path d="M-12 -26C20 -48 70 -42 112 -12C118 -6 112 0 100 4L8 -6C-8 -6 -18 -16 -12 -26Z" fill="url(#sp-body)" stroke="#06241b" strokeWidth="3" strokeLinejoin="round" />
        <path d="M96 4L104 12L90 1ZM72 -1L76 9L64 -2Z" fill="#fff" />
        <path d="M14 -26C40 -40 70 -32 98 -12" stroke="#d4b872" strokeWidth="3" fill="none" opacity=".8" />
        {/* ojo */}
        <path d="M30 -20L56 -18L48 -10L28 -12Z" fill="#06241b" />
        <path d="M36 -17L50 -16L46 -12L35 -13Z" fill="#ffd54a" />
        <circle cx="44" cy="-14.5" r="2.2" fill="#06241b" />
      </g>
    </svg>
  );
}

/* ---------- fondo de escena ---------- */
function Island({ x, y, s = 1, delay = "" }: { x: number; y: number; s?: number; delay?: string }) {
  return (
    <g className={`drift ${delay}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-70 0H70L50 26 24 52 0 78-22 52-46 26Z" fill="#0a1f19" stroke="#2a8c68" strokeOpacity=".5" />
      <path d="M-56 0H56L40 -8 20 -4 0 -12-22 -4-44 -8Z" fill="#1b6b4f" />
      {/* templo */}
      <path d="M-26 -8V-30H26V-8Z" fill="#0d2a21" />
      <path d="M-34 -30L0 -52 34 -30Z" fill="#0b4032" stroke="#d4b872" strokeOpacity=".6" />
      <path d="M-18 -50L0 -64 18 -50Z" fill="#0b4032" stroke="#d4b872" strokeOpacity=".6" />
      <rect x="-4" y="-24" width="8" height="16" fill="#d4b872" opacity=".7" />
    </g>
  );
}

export function HeroScene() {
  const rain = Array.from({ length: 34 }, (_, i) => ({ x: (i * 97) % 1000, y: (i * 53) % 600, l: 40 + ((i * 29) % 60) }));
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_28%,#27a073_0%,#0f5a45_32%,#0a2a21_68%,#0c110f_100%)]" />
      <div className="grid-lines absolute inset-0 opacity-50" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="blur-cloud" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="18" /></filter>
          <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6ffb0" /><stop offset="1" stopColor="#d4b872" stopOpacity=".1" /></linearGradient>
        </defs>
        {/* nubes */}
        <g filter="url(#blur-cloud)" fill="#bff5dc" opacity=".22">
          <ellipse cx="780" cy="150" rx="190" ry="34" /><ellipse cx="560" cy="330" rx="170" ry="26" /><ellipse cx="900" cy="410" rx="140" ry="26" />
        </g>
        {/* lluvia */}
        <g stroke="#d4b872" strokeOpacity=".16" strokeWidth="1.3">
          {rain.map((r, i) => <line key={i} x1={r.x} y1={r.y} x2={r.x - r.l * 0.25} y2={r.y + r.l} />)}
        </g>
        {/* rayos */}
        <path d="M640 0L612 120 650 120 604 260" stroke="url(#bolt)" strokeWidth="3" fill="none" opacity=".7" />
        <path d="M905 20L880 100 908 100 872 190" stroke="url(#bolt)" strokeWidth="2" fill="none" opacity=".55" />
        {/* islas */}
        <Island x={560} y={110} s={0.7} />
        <Island x={930} y={330} s={0.95} delay="drift-2" />
        <Island x={90} y={90} s={0.6} delay="drift-2" />
        {/* cordillera */}
        <path d="M0 640V470L90 400 170 470 270 380 380 480 480 410 590 490 700 400 810 480 920 410 1000 460V640Z" fill="#0b3328" opacity=".85" />
        <path d="M0 640V520L120 460 220 520 340 450 460 530 580 470 700 540 830 470 1000 530V640Z" fill="#081c16" />
        <path d="M0 640V580C160 560 300 600 480 575S800 560 1000 585V640Z" fill="#0c110f" />
        {/* chispas */}
        <g fill="#d4b872" opacity=".75">
          {[[520, 250, 3], [700, 90, 2.4], [860, 200, 3.4], [610, 520, 2.6], [960, 520, 2.4], [440, 120, 2]].map(([x, y, r], i) => (
            <path key={i} d={`M${x} ${y - r * 3}L${x + r} ${y - r}L${x + r * 3} ${y}L${x + r} ${y + r}L${x} ${y + r * 3}L${x - r} ${y + r}L${x - r * 3} ${y}L${x - r} ${y - r}Z`} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ---------- sobre y caja ---------- */
/** Carta de coleccionista ILUSTRATIVA: marco, ventana de arte y barras; no representa una carta real. */
export function CardArt({ tone = "mint", label = "CARTA ILUSTRATIVA", className = "" }: { tone?: string; label?: string; className?: string }) {
  const t = T(tone);
  const k = `${tone}-c`;
  return (
    <svg viewBox="0 0 200 280" className={className} role="img" aria-label="Carta ilustrativa (demo)">
      <defs>
        <linearGradient id={`cf-${k}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.c} /><stop offset=".35" stopColor={t.b} /><stop offset=".7" stopColor={t.d} /><stop offset="1" stopColor={t.a} />
        </linearGradient>
        <linearGradient id={`ca-${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.d} /><stop offset="1" stopColor={t.a} /></linearGradient>
      </defs>
      <rect width="200" height="280" rx="12" fill={`url(#cf-${k})`} />
      <rect x="9" y="9" width="182" height="262" rx="7" fill="#0a1210" opacity=".25" />
      <rect x="14" y="14" width="172" height="22" fill="#fff" opacity=".85" />
      <text x="20" y="30" style={{ fontFamily: "var(--font-display)" }} fontSize="13" fill="#0a1210" letterSpacing="2">{label}</text>
      <rect x="14" y="42" width="172" height="124" fill={`url(#ca-${k})`} stroke="#fff" strokeOpacity=".8" strokeWidth="2" />
      <path d="M14 140C50 90 80 130 110 80S160 60 186 50V166H14Z" fill="#06241b" opacity=".55" />
      <path d="M14 122C50 80 82 112 112 66S160 52 186 44" stroke={t.c} strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="150" cy="70" r="14" fill={t.c} opacity=".8" />
      <rect x="14" y="176" width="172" height="84" fill="#fff" opacity=".82" />
      <rect x="22" y="188" width="96" height="5" fill="#0a1210" opacity=".5" />
      <rect x="22" y="200" width="140" height="4" fill="#0a1210" opacity=".3" />
      <rect x="22" y="210" width="120" height="4" fill="#0a1210" opacity=".3" />
      <rect x="22" y="220" width="130" height="4" fill="#0a1210" opacity=".3" />
      <rect width="200" height="280" rx="12" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" />
    </svg>
  );
}
