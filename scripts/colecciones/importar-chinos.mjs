// Importa las fotos del lote chino (carpetas de Downloads con Principal_/SKU_/Detalle_ de Tmall/Taobao) al proyecto.
//   node scripts/colecciones/importar-chinos.mjs [carpeta-de-descargas]      (por defecto ~/Downloads)
// Lee src/content/colecciones/origen/china/productos.json y, por cada imagen elegida:
//  · si es una foto de producto (sin keepBg): recorta lo pedido (crop), pasa a transparente SOLO el fondo blanco conectado con el borde
//    (blancos interiores del envase conservados) y recorta el margen; no retoca colores ni deforma;
//  · si es un gráfico o una foto con fondo propio (keepBg): se conserva tal cual, solo optimizada (WebP, máximo 1100 px de lado largo);
// y escribe public/images/products/zh/<producto>-<n>.webp + src/content/colecciones/imagenes-china.json (huella del original y del
// derivado). La web no depende de rutas del equipo ni de enlaces del proveedor. Los originales no se modifican.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { quitarFondoBlanco } from "./quitar-fondo.mjs";

const descargas = process.argv[2] ?? path.join(os.homedir(), "Downloads");
const datos = JSON.parse(fs.readFileSync("src/content/colecciones/origen/china/productos.json", "utf8"));
const MAX = 1100;
const carpetas = new Map();
for (const f of fs.readdirSync(descargas)) {
  const m = f.match(/_(\d{12,13})_images$/);
  if (m && fs.statSync(path.join(descargas, f)).isDirectory()) carpetas.set(m[1], path.join(descargas, f));
}
for (const f of datos.fuentes) if (!carpetas.has(f.id)) throw new Error(`No encuentro la carpeta de la fuente ${f.id} en ${descargas}`);

const outDir = "public/images/products/zh";
fs.mkdirSync(outDir, { recursive: true });
const registro = [];
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

for (const p of datos.productos) {
  for (const [i, im] of p.imagenes.entries()) {
    const archivo = path.join(carpetas.get(im.fuente), im.archivo);
    const original = fs.readFileSync(archivo);
    let meta = await sharp(original).metadata();
    let buf = original;
    const ops = [];
    if (im.crop) {
      const [x, y, w, h] = im.crop;
      const box = { left: Math.round(x * meta.width), top: Math.round(y * meta.height), width: Math.round(w * meta.width), height: Math.round(h * meta.height) };
      buf = await sharp(buf).extract(box).toBuffer();
      ops.push(`recorte rectangular (${box.width}×${box.height} desde ${box.left},${box.top}) para dejar solo el producto`);
    }
    let out;
    let hasAlpha = false;
    if (im.keepBg) {
      out = await sharp(buf).resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, effort: 5 }).toBuffer({ resolveWithObject: true });
      ops.push("conservada con su fondo; solo optimizada (WebP)");
    } else {
      let m2 = await sharp(buf).metadata();
      // Un PNG con canal alfa totalmente opaco (fondo blanco «horneado») se trata como foto sin transparencia.
      if (m2.hasAlpha && (await sharp(buf).stats()).channels[3].min === 255) {
        buf = await sharp(buf).removeAlpha().toBuffer();
        m2 = await sharp(buf).metadata();
      }
      let base = buf;
      if (!m2.hasAlpha) {
        base = await quitarFondoBlanco(buf, m2.width, m2.height);
        ops.push("fondo blanco del borde pasado a transparente por relleno desde el borde (blancos interiores del envase conservados)");
      } else ops.push("ya traía transparencia");
      const trimmed = await sharp(base).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
      const pad = Math.max(6, Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.03));
      out = await sharp(trimmed.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toBuffer({ resolveWithObject: true });
      hasAlpha = true;
      ops.push(`recorte del margen (+${pad}px de aire); sin retoque de color`);
    }
    const nombre = `${p.id}-${i + 1}.webp`;
    fs.writeFileSync(path.join(outDir, nombre), out.data);
    registro.push({
      productId: p.id, index: i, view: im.view, src: `/images/products/zh/${nombre}`, width: out.info.width, height: out.info.height, hasAlpha,
      bytes: out.data.length, sha256: sha(out.data),
      origen: { fuente: im.fuente, archivo: im.archivo, sha256: sha(original), ancho: meta.width, alto: meta.height, urlPublicacion: datos.fuentes.find((f) => f.id === im.fuente).url },
      operacion: ops.join("; "),
    });
  }
}
fs.writeFileSync("src/content/colecciones/imagenes-china.json", JSON.stringify(registro, null, 1) + "\n");
console.table(registro.map((r) => ({ src: r.src.replace("/images/products/zh/", ""), orig: `${r.origen.ancho}×${r.origen.alto}`, final: `${r.width}×${r.height}`, alfa: r.hasAlpha, KB: Math.round(r.bytes / 1024) })));
console.log(registro.length, "imágenes");
