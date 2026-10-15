import fs from "node:fs";
import path from "node:path";
import { realCatalog } from "../src/content/catalog";
import { parseCommercialCsv, type CommercialItem } from "../src/features/catalog/commercial-import";

// Pasa precio y stock de datos/precios-y-stock.csv al catálogo (src/content/real/commercial.json).
//   npm run precios:importar            → revisa el archivo y muestra qué cambiaría (no escribe nada)
//   npm run precios:importar -- --write → escribe commercial.json (después: npm run catalog:check)
// Las celdas vacías son «pendiente» (no $0 ni agotado). Un SKU sin precio O sin stock sigue sin poder consultarse con importe.
const write = process.argv.includes("--write");
const csvFile = path.resolve(process.env.PRECIOS_CSV || "datos/precios-y-stock.csv");
const jsonFile = path.resolve("src/content/real/commercial.json");

if (!fs.existsSync(csvFile)) {
  console.error(`No existe ${csvFile}`);
  process.exit(1);
}
const skus = realCatalog.products.map((p) => p.sku);
const result = parseCommercialCsv(fs.readFileSync(csvFile, "utf8"), skus);
for (const w of result.warnings) console.log(`AVISO  ${w}`);
for (const e of result.errors) console.error(`ERROR  ${e}`);
if (result.errors.length) {
  console.error(`\n${result.errors.length} error(es): no se modificó nada.`);
  process.exit(1);
}

const actual = JSON.parse(fs.readFileSync(jsonFile, "utf8")) as { _ayuda?: string; items: Record<string, CommercialItem> };
// Lo que no figura en el CSV queda como estaba; maxPerOrder (no está en el CSV) se conserva si ya estaba cargado.
const nuevo: Record<string, CommercialItem> = { ...actual.items };
for (const sku of Object.keys(result.items)) nuevo[sku] = { ...result.items[sku], ...(actual.items[sku]?.maxPerOrder ? { maxPerOrder: actual.items[sku].maxPerOrder } : {}) };
for (const sku of skus) {
  const r = result.items[sku];
  if (!r && actual.items[sku]) {
    // fila presente pero sin ningún dato: vuelve a pendiente
    const row = fs.readFileSync(csvFile, "utf8").split(/\r?\n/).find((l) => l.split(";")[0].trim() === sku);
    if (row) delete nuevo[sku];
  }
}

const lines = skus.map((sku) => {
  const a = actual.items[sku];
  const n = nuevo[sku];
  const fmt = (c?: CommercialItem) => (c ? `precio ${c.priceMinor === null ? "—" : `$${(c.priceMinor / 100).toLocaleString("es-AR")}`} · stock ${c.stockQuantity ?? "—"}` : "pendiente");
  const changed = JSON.stringify(a ?? null) !== JSON.stringify(n ?? null);
  return `${changed ? "CAMBIA " : "igual  "} ${sku.padEnd(18)} ${fmt(a)}  →  ${fmt(n)}`;
});
console.log("\n" + lines.join("\n"));

if (!write) {
  console.log("\nSolo revisión: agregá --write para guardar los cambios.");
} else {
  fs.writeFileSync(jsonFile, JSON.stringify({ _ayuda: actual._ayuda, items: nuevo }, null, 2) + "\n");
  console.log(`\nGuardado ${jsonFile}. Ahora ejecutá: npm run catalog:check`);
}
