// Genera las versiones de presentación de las 24 fotos de producto: recorta SOLO el margen de fondo uniforme (blanco o
// transparente) y deja un pequeño aire alrededor; no escala, no estira, no toca el envase. Los originales no se modifican.
// Salida: <nombre>-limpio.webp junto al original + src/content/colecciones/imagenes-recortes.json (huella del original y del derivado).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { quitarFondoBlanco } from "./quitar-fondo.mjs";
import { separarCaja } from "./separar-caja.mjs";

const registro = JSON.parse(fs.readFileSync("src/content/colecciones/imagenes.json", "utf8"));
const salida = [];
for (const img of registro) {
  const file = path.join("public", img.src);
  const buf = fs.readFileSync(file);
  if (crypto.createHash("sha256").update(buf).digest("hex") !== img.sha256) throw new Error(`${img.src}: la huella del original no coincide`);
  const meta = await sharp(buf).metadata();
  const opaco = !meta.hasAlpha;
  // Fondo blanco incrustado (JPG): se pasa a transparente SOLO el blanco conectado con el borde (relleno por inundación),
  // así los detalles blancos propios del envase no se tocan. En PNG/WebP con alfa solo se recorta el margen.
  // Black Bolt y White Flare: el arte blanco de la caja TOCA el fondo blanco, así que el relleno por inundación se filtra por esos tramos.
  // Esas cuatro fotos se separan por geometría (silueta de la caja reconstruida, ver separar-caja.mjs): el canal alfa sigue el contorno
  // de la caja y los blancos del envase quedan intactos. La caja cerrada es un hexágono convexo; la abierta tiene tapa y cuerpo.
  const porGeometria = img.role.startsWith("caja") && ["black-bolt", "white-flare"].includes(img.collectionId);
  let base = buf;
  if (porGeometria) {
    const geom = await separarCaja(buf, img.role === "caja-referencia-2" ? { convexa: true } : { buscarHombro: [250, 400] });
    base = await sharp(geom.rgba, { raw: { width: geom.width, height: geom.height, channels: 4 } }).png().toBuffer();
  } else if (opaco) base = await quitarFondoBlanco(buf, meta.width, meta.height);
  const trimmed = await sharp(base).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const w = trimmed.info.width, h = trimmed.info.height;
  const pad = Math.max(6, Math.round(Math.max(w, h) * 0.03));
  const fondo = { r: 0, g: 0, b: 0, alpha: 0 };
  const out = await sharp(trimmed.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: fondo }).webp({ quality: 92, alphaQuality: 100, effort: 5 }).toBuffer({ resolveWithObject: true });
  const dst = img.src.replace(/\.[a-z]+$/i, porGeometria ? "-sin-fondo.webp" : "-limpio.webp"); // nombre nuevo: no hereda la caché de la versión con fondo blanco
  fs.writeFileSync(path.join("public", dst), out.data);
  salida.push({
    collectionId: img.collectionId,
    role: img.role,
    original: img.src,
    originalSha256: img.sha256,
    originalWidth: img.width,
    originalHeight: img.height,
    src: dst,
    width: out.info.width,
    height: out.info.height,
    hasAlpha: true,
    bytes: out.data.length,
    sha256: crypto.createHash("sha256").update(out.data).digest("hex"),
    operacion: porGeometria ? `fondo blanco separado por geometría (silueta de la caja reconstruida a partir de sus aristas rectas; los blancos del envase no se tocan), borde erosionado ~1 px para quitar el halo blanco, recorte (+${pad}px de aire); sin escalado ni retoque de color` : opaco ? `fondo blanco del borde pasado a transparente por relleno desde el borde (blancos interiores del envase conservados) y recorte (+${pad}px de aire); sin escalado ni retoque de color` : `recorte del margen transparente (+${pad}px de aire); sin escalado ni retoque del envase`,
  });
}
salida.sort((a, b) => a.src.localeCompare(b.src));
fs.writeFileSync("src/content/colecciones/imagenes-recortes.json", JSON.stringify(salida, null, 1) + "\n");
console.table(salida.map((s) => ({ src: s.src.replace("/images/products/", ""), orig: `${s.originalWidth}×${s.originalHeight}`, recorte: `${s.width}×${s.height}`, KB: Math.round(s.bytes / 1024) })));
