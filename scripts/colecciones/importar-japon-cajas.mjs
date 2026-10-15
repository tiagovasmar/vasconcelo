// Descarga las fotos oficiales del sobre de las seis cajas japonesas agregadas el 14/10/2026 (páginas de expansión de pokemon-card.com),
// las pasa a WebP (sin escalar ni retocar colores; conservan su transparencia) y escribe src/content/colecciones/imagenes-japon-cajas.json
// con la huella del original y del derivado. La web no depende de enlaces externos. Idempotente: si el archivo y su registro existen y
// coinciden, no vuelve a descargar (usar --force para repetir).
//   node scripts/colecciones/importar-japon-cajas.mjs [--force]
import crypto from "node:crypto";
import fs from "node:fs";
import sharp from "sharp";

const force = process.argv.includes("--force");
const datos = JSON.parse(fs.readFileSync("src/content/colecciones/origen/japon-cajas.json", "utf8"));
const regFile = "src/content/colecciones/imagenes-japon-cajas.json";
const previo = fs.existsSync(regFile) ? JSON.parse(fs.readFileSync(regFile, "utf8")) : [];
const outDir = "public/images/products/japon-cajas";
fs.mkdirSync(outDir, { recursive: true });
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const registro = [];
for (const c of datos.cajas) {
  const dest = `${outDir}/${c.id}-sobre.webp`;
  const prev = previo.find((r) => r.collectionId === c.id);
  if (!force && prev && fs.existsSync(dest) && sha(fs.readFileSync(dest)) === prev.sha256) {
    registro.push(prev);
    console.log(`igual     ${c.id}`);
    continue;
  }
  const res = await fetch(c.imagen.url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${c.imagen.url}: HTTP ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(original).metadata();
  const buf = await sharp(original).webp({ quality: 96, alphaQuality: 100, effort: 6 }).toBuffer();
  fs.writeFileSync(dest, buf);
  const out = await sharp(buf).metadata();
  registro.push({
    collectionId: c.id,
    src: `/images/products/japon-cajas/${c.id}-sobre.webp`,
    width: out.width,
    height: out.height,
    hasAlpha: Boolean(out.hasAlpha),
    bytes: buf.length,
    sha256: sha(buf),
    originalSha256: sha(original),
    originalFormat: meta.format,
    originalBytes: original.length,
    sourceUrl: c.imagen.url,
    sourcePage: c.urlOficial,
    permissionStatus: "not_granted_by_source_link",
    operacion: `convertida a WebP desde el ${meta.format?.toUpperCase()} original de ${meta.width}×${meta.height} px; sin escalado ni retoque de color`,
    reviewedAt: datos.consultado,
  });
  console.log(`descargada ${c.id} ${out.width}x${out.height} ${buf.length} bytes`);
}
fs.writeFileSync(regFile, JSON.stringify(registro, null, 2) + "\n");
