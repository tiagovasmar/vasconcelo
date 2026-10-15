import fs from "node:fs";
import path from "node:path";
import { demoCatalog, realCatalog } from "../src/content/catalog";
import { commercialState } from "../src/features/catalog/commercial";
import { validateCatalog, type Issue } from "../src/features/catalog/validate";

const exists = (p: string) => fs.existsSync(path.join(process.cwd(), "public", p.replace(/^\//, "")));

/** Catálogo comercial real: estricto (las imágenes declaradas deben existir). */
const real = validateCatalog(realCatalog, exists);
/** Catálogo de prueba (ficticio, solo para pruebas): solo se valida su estructura. */
const demo = validateCatalog(demoCatalog);

const errors: Issue[] = [...real.filter((i) => i.level === "error"), ...demo.filter((i) => i.level === "error").map((i) => ({ ...i, where: `[catálogo de prueba] ${i.where}` }))];
const warnings = real.filter((i) => i.level === "warning");
const missingImgs = warnings.filter((w) => w.message.startsWith("imagen de reserva"));
const pendientes = warnings.filter((w) => w.message.startsWith("precio o stock pendientes"));

for (const i of [...errors, ...warnings.filter((w) => !missingImgs.includes(w) && !pendientes.includes(w))]) {
  console.log(`${i.level === "error" ? "ERROR" : "AVISO"}  ${i.where}: ${i.message}`);
}
if (missingImgs.length) console.log(`AVISO  ${missingImgs.length} imágenes de reserva sin archivo (ver docs/ASSETS-PENDIENTES.md)`);
if (pendientes.length) console.log(`AVISO  ${pendientes.length} producto(s) con precio o stock pendientes (se ven en el sitio, pero no se pueden consultar con importe)`);

const cards = realCatalog.expansions.reduce((n, e) => n + e.cards.length, 0);
const noRetirados = realCatalog.products.filter((p) => !p.retired);
const borradores = noRetirados.filter((p) => p.draftNote).length;
const publicados = noRetirados.filter((p) => !p.draftNote);
const retirados = realCatalog.products.length - noRetirados.length;
const estado = (s: string) => publicados.filter((p) => commercialState(p) === s).length;
console.log(
  `\nCatálogo real: ${publicados.length} productos publicados, ${borradores} en borrador (sin publicar), ${retirados} retirados (${estado("available")} a la venta, ${estado("soldout")} agotados, ${estado("pending")} con precio/stock pendientes), ` +
    `${realCatalog.expansions.length} expansiones (${realCatalog.expansions.filter((e) => e.cardListStatus === "complete").length} con lista completa, ${realCatalog.expansions.filter((e) => e.cardListStatus === "partial").length} parcial), ` +
    `${cards} cartas, ${realCatalog.pullRates.length} tasas, ${realCatalog.guarantees.length} garantías.`,
);
console.log(`Catálogo de prueba: ${demoCatalog.products.length} productos y ${demoCatalog.expansions.length} expansiones ficticios (solo para pruebas).`);
console.log(errors.length ? `${errors.length} error(es).` : "Sin errores.");
process.exit(errors.length ? 1 : 0);
