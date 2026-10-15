// Registra las 24 fotos originales de producto: verifica su huella (sha256) contra el manifiesto del paquete de origen,
// lee dimensiones y transparencia, y escribe src/content/colecciones/imagenes.json (lo que usa el catálogo).
// Los originales NO se modifican: se sirven tal cual desde public/images/products/ y Next los optimiza al entregarlos.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const manifiesto = JSON.parse(fs.readFileSync("src/content/colecciones/origen/imagenes-productos.json", "utf8"));
const salida = [];
const problemas = [];
for (const m of manifiesto) {
  const rel = m.path.replace(/^recursos\/productos\//, "");
  const file = path.join("public/images/products", rel);
  if (!fs.existsSync(file)) {
    problemas.push(`falta ${file}`);
    continue;
  }
  const buf = fs.readFileSync(file);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (sha !== m.sha256) problemas.push(`${rel}: la huella no coincide con el manifiesto (archivo modificado o dañado)`);
  const meta = await sharp(buf).metadata();
  salida.push({
    collectionId: m.collectionId,
    role: m.role,
    src: "/images/products/" + rel.replaceAll("\\", "/"),
    contentType: m.contentType,
    width: meta.width,
    height: meta.height,
    hasAlpha: Boolean(meta.hasAlpha),
    bytes: buf.length,
    sha256: sha,
    sourceUrl: m.sourceUrl,
    sourcePage: m.sourcePage,
    permissionStatus: m.permissionStatus,
    classificationStatus: m.classificationStatus,
    reviewedAt: m.reviewedAt,
  });
}
if (problemas.length) {
  console.error("PROBLEMAS:\n" + problemas.join("\n"));
  process.exit(1);
}
salida.sort((a, b) => a.src.localeCompare(b.src));
fs.writeFileSync("src/content/colecciones/imagenes.json", JSON.stringify(salida, null, 1) + "\n");
console.log(`${salida.length} imágenes registradas, huellas verificadas.`);
console.table(salida.map((s) => ({ src: s.src.replace("/images/products/", ""), px: `${s.width}×${s.height}`, alfa: s.hasAlpha, KB: Math.round(s.bytes / 1024) })));
