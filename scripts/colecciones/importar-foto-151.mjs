// Foto de la caja cerrada de Pokémon Card 151 (SV2a) aportada por el dueño como captura de una publicación de un proveedor.
//   node scripts/colecciones/importar-foto-151.mjs <captura.png>
// Conserva el ORIGINAL (la captura completa) en recursos-originales/japon-cajas/, recorta solo el área de la foto del producto (sin la interfaz de la
// publicación ni los bordes redondeados) y la guarda como WebP optimizado en public/images/products/japon-cajas/. No retoca el arte impreso ni los
// colores. Escribe src/content/colecciones/imagenes-cajas-proveedor.json con la huella del original y del derivado.
import crypto from "node:crypto";
import fs from "node:fs";
import sharp from "sharp";

const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) throw new Error("Uso: node scripts/colecciones/importar-foto-151.mjs <captura.png>");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const original = fs.readFileSync(origen);
const guardado = "recursos-originales/japon-cajas/pokemon-card-151-captura-proveedor-original.png";
fs.mkdirSync("recursos-originales/japon-cajas", { recursive: true });
fs.writeFileSync(guardado, original);
const meta = await sharp(original).metadata();
const area = { left: 66, top: 72, width: 906, height: 907 }; // dentro de la foto, sin esquinas redondeadas ni la interfaz de la publicación
const buf = await sharp(original).extract(area).flatten({ background: "#ffffff" }).webp({ quality: 92, effort: 6 }).toBuffer();
const destino = "public/images/products/japon-cajas/pokemon-card-151-closed.webp";
fs.writeFileSync(destino, buf);
const out = await sharp(buf).metadata();
fs.writeFileSync("src/content/colecciones/imagenes-cajas-proveedor.json", JSON.stringify([{
  collectionId: "pokemon-card-151",
  view: "closed",
  src: "/images/products/japon-cajas/pokemon-card-151-closed.webp",
  width: out.width, height: out.height, bytes: buf.length, sha256: sha(buf),
  original: guardado, originalSha256: sha(original), originalWidth: meta.width, originalHeight: meta.height,
  fuente: "Captura de pantalla de una publicación de un proveedor (Taobao/Tmall) aportada por el dueño el 14/10/2026. La dirección de la publicación no quedó registrada.",
  operacion: `recorte del área de la foto (${area.width}×${area.height} px) y conversión a WebP; sin escalado ni retoque de color`,
  reviewedAt: "2026-10-14",
}], null, 2) + "\n");
console.log("ok", out.width, out.height, buf.length);
