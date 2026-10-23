// Genera las portadas optimizadas de los accesorios a partir de los originales de `recursos-originales/accesorios/`.
// Son imágenes ILUSTRATIVAS generadas (ver PROMPTS.txt de esa carpeta): no son fotos del stock real. Idempotente: vuelve a escribir los mismos archivos.
//   node scripts/accesorios/optimizar-portadas.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const origen = path.resolve("recursos-originales/accesorios");
const destino = path.resolve("public/images/products/accesorios");
fs.mkdirSync(destino, { recursive: true });

// original → archivo publicado. 1000 × 1000 px basta para la ficha a 560 px de ancho en pantallas de alta densidad; Next entrega la medida justa a cada pantalla.
const mapa = { "sleeve-portada.png": "sleeves-transparentes-pack-5.webp", "toploader-portada.png": "top-loaders-transparentes-pack-5.webp" };
for (const [src, out] of Object.entries(mapa)) {
  const info = await sharp(path.join(origen, src)).resize(1000, 1000, { fit: "contain", background: "#ffffff" }).webp({ quality: 82, effort: 5 }).toFile(path.join(destino, out));
  console.log(`${out}: ${info.width}×${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
}
