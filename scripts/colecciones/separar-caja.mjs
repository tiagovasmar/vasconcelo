// Separa del fondo blanco las fotos de las cajas de Black Bolt y White Flare, cuyo arte blanco TOCA el fondo blanco: un relleno por
// inundación (como en quitar-fondo.mjs) se «filtra» por esos tramos y se come el envase, y un borrado global de blancos vuelve
// transparente el arte. Estas fotos son renders de una caja con aristas rectas, así que la silueta se reconstruye por GEOMETRÍA:
//   1. relleno por inundación del fondo (blanco ≥ 250) para localizar el producto; se conserva solo la componente principal;
//   2. por fila, borde izquierdo y derecho del producto (L(y), R(y));
//   3. donde el arte blanco llega al borde, esos extremos «entran» en la caja: se detectan como atípicos respecto de la tendencia local
//      (mediana móvil) y se reemplazan por la interpolación entre los tramos confiables a ambos lados (las aristas son rectas);
//   4. máscara = filas entre L'(y) y R'(y), suavizada y erosionada ~1 px (sin el halo blanco del borde antialiasado).
// No se toca ningún píxel del envase (colores, textos, ilustración, proporciones): solo cambia el canal alfa.
import sharp from "sharp";

/** Envolvente convexa (cadena monótona de Andrew). */
function envolvente(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  const up = [];
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Douglas-Peucker sobre una polilínea abierta. */
function simplificar(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts.at(-1), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  let mi = 0, md = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / L; if (d > md) { md = d; mi = i; } }
  return md > eps ? simplificar(pts.slice(0, mi + 1), eps).slice(0, -1).concat(simplificar(pts.slice(mi), eps)) : [a, b];
}

function interseccion(p1, p2, p3, p4) {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(d) < 1e-9) return null;
  const a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
  return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
}

/**
 * Silueta de una caja CERRADA (hexágono convexo): envolvente del producto, simplificada; los vértices que el arte blanco «achaflanó»
 * (cadenas de aristas cortas entre dos aristas largas) se reconstruyen intersectando las rectas de las aristas largas vecinas.
 */
function poligonoConvexo(puntos, { eps = 3, largo = 150 } = {}) {
  const H = envolvente(puntos);
  let lejos = 0, fd = 0;
  for (let i = 0; i < H.length; i++) { const d = Math.hypot(H[i][0] - H[0][0], H[i][1] - H[0][1]); if (d > fd) { fd = d; lejos = i; } }
  const V = simplificar(H.slice(0, lejos + 1), eps).slice(0, -1).concat(simplificar(H.slice(lejos).concat([H[0]]), eps).slice(0, -1));
  const n = V.length;
  const aristas = V.map((p, i) => ({ a: p, b: V[(i + 1) % n], len: Math.hypot(V[(i + 1) % n][0] - p[0], V[(i + 1) % n][1] - p[1]) }));
  const largas = aristas.map((e, i) => (e.len >= largo ? i : -1)).filter((i) => i >= 0);
  const verts = [];
  for (let k = 0; k < largas.length; k++) {
    const e1 = aristas[largas[k]], e2 = aristas[largas[(k + 1) % largas.length]];
    const contiguas = (largas[k] + 1) % n === largas[(k + 1) % largas.length];
    verts.push(contiguas ? e1.b : (interseccion(e1.a, e1.b, e2.a, e2.b) ?? e1.b));
  }
  return verts;
}

/** Intervalo [xmin, xmax] de un polígono convexo en la fila y (NaN si no la cruza). */
function cruce(poly, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) { const x = a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]); lo = Math.min(lo, x); hi = Math.max(hi, x); }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Mediana móvil de una serie (ventana ±r) ignorando los NaN. */
function medianaMovil(v, r) {
  return v.map((_, i) => {
    const w = [];
    for (let j = Math.max(0, i - r); j <= Math.min(v.length - 1, i + r); j++) if (!Number.isNaN(v[j])) w.push(v[j]);
    w.sort((a, b) => a - b);
    return w.length ? w[w.length >> 1] : NaN;
  });
}

/** Reemplaza los atípicos (|v − mediana| > tol) por interpolación lineal entre los valores confiables vecinos. */
function regularizar(v, r, tol) {
  const med = medianaMovil(v, r);
  const buenos = v.map((x, i) => !Number.isNaN(x) && Math.abs(x - med[i]) <= tol);
  const out = v.slice();
  let prev = -1;
  for (let i = 0; i < v.length; i++) {
    if (!buenos[i]) continue;
    if (prev >= 0 && i - prev > 1) for (let k = prev + 1; k < i; k++) out[k] = v[prev] + ((v[i] - v[prev]) * (k - prev)) / (i - prev);
    prev = i;
  }
  return { out, buenos };
}

/**
 * @param {Buffer} jpg foto original (fondo blanco)
 * @returns {Promise<{ rgba: Buffer, width: number, height: number, info: object }>}
 */
export async function separarCaja(jpg, { umbral = 250, saltoHombro = 50, buscarHombro = null, convexa = false } = {}) {
  const { data: rgb, info } = await sharp(jpg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const blanco = (i) => rgb[i * 3] >= umbral && rgb[i * 3 + 1] >= umbral && rgb[i * 3 + 2] >= umbral;
  const fondo = new Uint8Array(w * h);
  const pila = [];
  const empujar = (x, y) => { const i = y * w + x; if (!fondo[i] && blanco(i)) { fondo[i] = 1; pila.push(i); } };
  for (let x = 0; x < w; x++) { empujar(x, 0); empujar(x, h - 1); }
  for (let y = 0; y < h; y++) { empujar(0, y); empujar(w - 1, y); }
  while (pila.length) {
    const i = pila.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) empujar(x - 1, y);
    if (x < w - 1) empujar(x + 1, y);
    if (y > 0) empujar(x, y - 1);
    if (y < h - 1) empujar(x, y + 1);
  }
  // componente principal del producto (descarta motas de ruido JPEG fuera de la caja)
  const comp = new Int32Array(w * h);
  let mejor = 0, mejorN = 0, id = 0;
  for (let s = 0; s < w * h; s++) {
    if (fondo[s] || comp[s]) continue;
    id++; let n = 0; const st = [s]; comp[s] = id;
    while (st.length) {
      const i = st.pop(); n++; const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) if (j >= 0 && !fondo[j] && !comp[j]) { comp[j] = id; st.push(j); }
    }
    if (n > mejorN) { mejorN = n; mejor = id; }
  }
  const L = new Array(h).fill(NaN), R = new Array(h).fill(NaN);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (comp[y * w + x] === mejor) { if (Number.isNaN(L[y])) L[y] = x; R[y] = x; }
  }
  const puntos = [];
  for (let y = 0; y < h; y++) if (!Number.isNaN(L[y])) puntos.push([L[y], y], [R[y], y]);
  const poli = convexa ? poligonoConvexo(puntos) : null;
  const filas = L.map((x, y) => (Number.isNaN(x) ? -1 : y)).filter((y) => y >= 0);
  const y0 = filas[0], y1 = filas.at(-1);
  // la caja abierta tiene dos cuerpos (tapa y caja) con un escalón de ancho: se regulariza cada uno por separado
  let hombro = -1;
  // (solo se busca en la franja indicada; las cajas cerradas son un único cuerpo convexo)
  if (buscarHombro) for (let y = Math.max(y0 + 1, buscarHombro[0]); y <= Math.min(y1, buscarHombro[1]); y++) if (Math.abs(L[y] - L[y - 1]) > saltoHombro) { hombro = y; break; }
  const tramos = hombro > 0 ? [[y0, hombro - 1], [hombro, y1]] : [[y0, y1]];
  const L2 = L.slice(), R2 = R.slice();
  const tolerancia = 3;
  const ventana = 60;
  const detalle = [];
  for (const [a, b] of tramos) {
    const rl = regularizar(L.slice(a, b + 1), ventana, tolerancia);
    const rr = regularizar(R.slice(a, b + 1), ventana, tolerancia);
    for (let k = 0; k <= b - a; k++) { L2[a + k] = rl.out[k]; R2[a + k] = rr.out[k]; }
    detalle.push({ filas: [a, b], atipicosIzq: rl.buenos.filter((x) => !x).length, atipicosDer: rr.buenos.filter((x) => !x).length });
  }
  // máscara: filas completas entre L' y R' (con medio píxel de cobertura en los extremos), después suavizado y erosión de ~1 px
  const alfa = Buffer.alloc(w * h);
  const yTop = poli ? Math.floor(Math.min(...poli.map((p) => p[1]))) : y0, yBot = poli ? Math.ceil(Math.max(...poli.map((p) => p[1]))) : y1;
  for (let y = yTop; y <= yBot; y++) {
    let l = L2[y], r = R2[y];
    if (poli) { const c = cruce(poli, y + 0.5); if (!c) continue; [l, r] = c; }
    if (Number.isNaN(l) || Number.isNaN(r)) continue;
    for (let x = Math.max(0, Math.floor(l)); x <= Math.min(w - 1, Math.ceil(r)); x++) alfa[y * w + x] = 255;
  }
  const sv = await sharp(alfa, { raw: { width: w, height: h, channels: 1 } }).blur(1.2).linear(4, -4 * 150).raw().toBuffer({ resolveWithObject: true });
  const suave = sv.data, canales = sv.info.channels;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = suave[i * canales]; }
  return { rgba, width: w, height: h, info: { filas: [y0, y1], hombro, tramos: detalle, poligono: poli?.map((p) => p.map(Math.round)) } };
}
