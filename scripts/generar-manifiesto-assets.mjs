// Genera src/generated/public-assets.json: listado de los archivos de /public (rutas relativas, ordenadas).
// `hasAsset` lo usa en lugar de consultar el disco, porque en un despliegue serverless /public no está en el sistema de archivos de la función.
// Se ejecuta solo antes de dev/build/pruebas (scripts predev, prebuild, pretest). El archivo se versiona para que typecheck y pruebas funcionen sin pasos previos.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("public");
const out = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else out.push(path.relative(root, full).split(path.sep).join("/"));
  }
})(root);
out.sort();
const target = path.resolve("src/generated/public-assets.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
const next = JSON.stringify(out, null, 0) + "\n";
if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== next) fs.writeFileSync(target, next);
console.log(`Manifiesto de assets: ${out.length} archivos de /public.`);
