// Descarga las imágenes de las cartas listadas por el buscador oficial y las guarda optimizadas (WebP, 360 px de ancho) en
// public/images/expansions/<colección>/cards/<cardId>.webp, de forma acotada:
//  · una descarga a la vez con pausa y User-Agent propio (nada de cientos de llamadas simultáneas),
//  · el original descargado queda en caché (.local/cache/colecciones/img, ignorada por Git) y lo ya generado no se repite,
//  · el origen de cada archivo queda registrado en src/content/colecciones/imagenes-cartas.json (URL, huella, tamaño).
// Las imágenes provienen del sitio oficial y NO tienen un permiso de uso concedido por estar enlazadas: estado «reference».
// Uso: node scripts/colecciones/descargar-imagenes-cartas.mjs [id-de-coleccion ...]     (FORZAR=1 regenera)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { COLECCIONES } from "./config.mjs";

const BASE = "https://www.pokemon-card.com";
const UA = "TiendaPokemonLocal/1.0 (descarga acotada y con cache de imagenes oficiales; una a la vez)";
const PAUSA_MS = Number(process.env.PAUSA_MS ?? 300);
const CACHE = path.resolve(".local/cache/colecciones/img");
const forzar = process.env.FORZAR === "1";
// REGENERAR=1: vuelve a generar los WebP desde la caché local (sin descargar nada).
const regenerar = process.env.REGENERAR === "1";
const ANCHO = Number(process.env.ANCHO ?? 360);
const CALIDAD = Number(process.env.CALIDAD ?? 72);
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ultima = 0;
async function descargar(url) {
  for (let intento = 1; intento <= 4; intento++) {
    const espera = ultima + PAUSA_MS - Date.now();
    if (espera > 0) await sleep(espera);
    ultima = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (/HTTP 4/.test(String(e.message))) throw e;
    }
    await sleep(1500 * intento);
  }
  throw new Error(`Sin respuesta tras 4 intentos: ${url}`);
}

const pedidos = process.argv.slice(2);
const registroFile = path.resolve("src/content/colecciones/imagenes-cartas.json");
const registro = fs.existsSync(registroFile) ? JSON.parse(fs.readFileSync(registroFile, "utf8")) : {};
let hechas = 0;
let saltadas = 0;
const fallos = [];
for (const c of COLECCIONES.filter((x) => pedidos.length === 0 || pedidos.includes(x.id))) {
  const datos = JSON.parse(fs.readFileSync(path.resolve(`src/content/colecciones/cartas/${c.id}.json`), "utf8"));
  const outDir = path.resolve(`public/images/expansions/${c.id}/cards`);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`\n== ${c.id}: ${datos.cards.length} cartas`);
  for (const [i, carta] of datos.cards.entries()) {
    const out = path.join(outDir, `${carta.cardId}.webp`);
    if (!forzar && !regenerar && fs.existsSync(out) && registro[`${c.id}/${carta.cardId}`]) {
      saltadas++;
      continue;
    }
    try {
      const cacheFile = path.join(CACHE, `${carta.cardId}.jpg`);
      let buf;
      if (!forzar && fs.existsSync(cacheFile)) buf = fs.readFileSync(cacheFile);
      else {
        buf = await descargar(BASE + carta.thumb);
        fs.writeFileSync(cacheFile, buf);
      }
      const meta = await sharp(buf).metadata();
      await sharp(buf).resize({ width: ANCHO }).webp({ quality: CALIDAD }).toFile(out);
      const outMeta = await sharp(out).metadata();
      registro[`${c.id}/${carta.cardId}`] = {
        sourceUrl: BASE + carta.thumb,
        sourceSha256: crypto.createHash("sha256").update(buf).digest("hex"),
        sourceBytes: buf.length,
        sourceSize: `${meta.width}x${meta.height}`,
        file: `/images/expansions/${c.id}/cards/${carta.cardId}.webp`,
        width: outMeta.width,
        height: outMeta.height,
        permissionStatus: "not_granted_by_source_link",
        fetchedAt: new Date().toISOString().slice(0, 10),
      };
      hechas++;
    } catch (e) {
      fallos.push(`${c.id}/${carta.cardId}: ${e.message}`);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`   ${i + 1}/${datos.cards.length}`);
      fs.writeFileSync(registroFile, JSON.stringify(registro, null, 1) + "\n"); // guarda el avance
    }
  }
  fs.writeFileSync(registroFile, JSON.stringify(registro, null, 1) + "\n");
}
console.log(`\nDescargadas ${hechas}, ya existentes ${saltadas}, fallos ${fallos.length}.`);
if (fallos.length) {
  console.log(fallos.join("\n"));
  process.exitCode = 1;
}
