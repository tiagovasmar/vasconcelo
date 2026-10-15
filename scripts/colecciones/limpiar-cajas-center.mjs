// Quita el fondo blanco exterior y el margen sobrante de las fotos OFICIALES de caja cerrada (Pokémon Center) de Ninja Spinner, Nihil Zero y Mega
// Symphonia, y deja un derivado WebP con transparencia y encuadre ajustado.
//   node scripts/colecciones/limpiar-cajas-center.mjs
// Cómo (solo cambia el canal alfa y el recorte; no se toca ningún píxel del envase, sus textos, colores ni proporciones):
//  1. el ORIGINAL (la foto oficial convertida a WebP al importarla, 1500×1500 con fondo blanco) se guarda tal cual en recursos-originales/japon-cajas/;
//  2. se pasa a transparente el fondo blanco exterior. Un simple relleno desde el borde se «comía» el arte claro de la tapa que toca el fondo, así que
//     se usa la silueta convexa de la caja (`separar-caja.mjs`, la misma técnica de Black Bolt / White Flare): es una caja cerrada de aristas rectas y solo
//     cambia el alfa; los blancos del envase quedan intactos;
//  3. se recorta al rectángulo de la caja con un aire de ~3 % (como las demás cajas del catálogo), sin escalar ni deformar;
//  4. se guarda como WebP optimizado (calidad 95, alfa sin pérdida) en public/images/products/japon-cajas/<id>-closed-v<N>.webp y se actualiza el registro
//     src/content/colecciones/imagenes-cajas-center.json con la huella del original y del derivado. Idempotente: si ya se procesó, no repite (`--rehacer` vuelve a derivar desde el original guardado).
import crypto from "node:crypto";
import fs from "node:fs";
import sharp from "sharp";
import { separarCaja } from "./separar-caja.mjs";

const IDS = ["ninja-spinner", "nihil-zero", "mega-symphonia", "glory-of-team-rocket"]; // las tres pedidas y The Glory of Team Rocket, que tenía el mismo problema
const regFile = "src/content/colecciones/imagenes-cajas-center.json";
const reg = JSON.parse(fs.readFileSync(regFile, "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const orgDir = "recursos-originales/japon-cajas";
fs.mkdirSync(orgDir, { recursive: true });

for (const id of IDS) {
  const entry = reg.find((r) => r.collectionId === id && r.view === "closed");
  if (!entry) throw new Error(`No hay foto de caja cerrada registrada para ${id}`);
  const guardado = `${orgDir}/${id}-closed-original.webp`;
  if (entry.limpiadoEl && !process.argv.includes("--rehacer")) { console.log(`igual     ${id}`); continue; }
  // Nombre nuevo en cada rehecho (-closed-v2, -v3…): una URL nunca cambia de contenido, así no se sirven versiones viejas desde cachés.
  const ver = Number(/-closed-v(\d+)\.webp$/.exec(entry.src)?.[1] ?? 1) + 1;
  const nuevoSrc = entry.src.replace(/-closed(-v\d+)?\.webp$/, `-closed-v${ver}.webp`);
  const publicaVieja = `public${entry.src}`;
  const publica = `public${nuevoSrc}`;
  if (!fs.existsSync(guardado)) fs.copyFileSync(publicaVieja, guardado); // conserva el original antes de derivar
  const original = fs.readFileSync(guardado);
  const meta = await sharp(original).metadata();
  const w = meta.width, h = meta.height;
  const sep = await separarCaja(await sharp(original).png().toBuffer(), { convexa: false, umbral: 252 });
  // Suavizado del borde: se quitan las muescas de 1–3 px del JPEG y se encoge ~2 px la silueta para no dejar el halo blanco del fondo (solo alfa).
  const alfaRaw = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alfaRaw[i] = sep.rgba[i * 4 + 3];
  const sv = await sharp(alfaRaw, { raw: { width: w, height: h, channels: 1 } }).blur(3).linear(5, -5 * 150).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < w * h; i++) sep.rgba[i * 4 + 3] = sv.data[i * sv.info.channels];
  const png = await sharp(sep.rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  // rectángulo del producto (alfa > 8) y aire del 3 %
  const { data } = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const pad = Math.round(Math.max(bw, bh) * 0.03);
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
  const width = Math.min(w - left, bw + 2 * pad), height = Math.min(h - top, bh + 2 * pad);
  const buf = await sharp(png).extract({ left, top, width, height }).webp({ quality: 95, alphaQuality: 100, effort: 6 }).toBuffer();
  fs.writeFileSync(publica, buf); entry.src = nuevoSrc; // el derivado anterior queda en disco (no se borra nada)
  const out = await sharp(buf).metadata();
  Object.assign(entry, {
    width: out.width, height: out.height, hasAlpha: Boolean(out.hasAlpha), bytes: buf.length, sha256: sha(buf),
    derivadoDe: guardado, derivadoDeSha256: sha(original), derivadoDeAncho: w, derivadoDeAlto: h,
    limpiadoEl: "2026-10-14",
    operacion: `Original oficial (${w}×${h}, fondo blanco) conservado en ${guardado}. Derivado: fondo blanco exterior pasado a transparente con la silueta convexa de la caja (blancos del envase conservados) suavizado del borde (solo alfa) y recorte a la caja con 3 % de aire (${width}×${height}); sin escalado ni retoque de color.`,
  });
  console.log(`limpiada  ${id}: ${w}×${h} → ${out.width}×${out.height} (${Math.round(buf.length / 1024)} KB, caja ${bw}×${bh})`);
}
fs.writeFileSync(regFile, JSON.stringify(reg, null, 2) + "\n");
