import fs from "node:fs";
import path from "node:path";
import { realCatalog } from "../src/content/catalog";
import { scriptDb } from "./lib/env";
import { loadOverrides, saveProductChange } from "../src/features/catalog/overrides";

// Carga los precios finales de venta en USD (src/content/real/precios-venta-usd.json) en la base del panel /admin.
//   npm run precios:cargar            → muestra qué haría (no escribe)
//   npm run precios:cargar -- --write → guarda (idempotente)
// Reglas: es un precio de LISTA (no se le suma margen ni envío). Solo completa precios que faltan: si el producto ya tiene un precio
// distinto cargado en el panel, se respeta y se informa. No toca stock, visibilidad, títulos ni fotos; queda en el historial del panel.
const write = process.argv.includes("--write");
const file = path.resolve("src/content/real/precios-venta-usd.json");
const data = JSON.parse(fs.readFileSync(file, "utf8")) as { items: Array<{ id: string; usd: number; fila: string }>; sinFicha: Array<{ fila: string; usd: number }> };
const products = realCatalog.products;
const actor = { id: "carga-precios-venta", email: "script:precios-venta-usd" };
const usd = (minor: number | null) => (minor === null ? "—" : `USD ${(minor / 100).toLocaleString("es-AR")}`);

async function main() {
const db = scriptDb();
const overrides = await loadOverrides(db);
let cargados = 0, iguales = 0, respetados = 0, errores = 0;
for (const it of data.items) {
  const p = products.find((x) => x.id === it.id);
  if (!p) { console.error(`ERROR   ${it.fila}: no existe la ficha «${it.id}»`); errores++; continue; }
  if (p.retired) { console.error(`ERROR   ${it.fila}: la ficha «${it.id}» está retirada`); errores++; continue; }
  const target = Math.round(it.usd * 100);
  const o = overrides.get(p.id);
  const current = o ? o.priceUsdMinor : p.priceUsdMinor ?? null;
  if (current === target) { console.log(`igual    ${it.id.padEnd(34)} ${usd(current)}`); iguales++; continue; }
  if (current !== null) { console.log(`RESPETA  ${it.id.padEnd(34)} panel/catálogo tiene ${usd(current)}; el lote decía ${usd(target)} (no se pisa)`); respetados++; continue; }
  console.log(`${write ? "CARGA  " : "cargaría"} ${it.id.padEnd(34)} ${usd(target)}`);
  if (write) await saveProductChange(db, products, p.id, { priceUsdMinor: target, expectedVersion: o?.updatedAt ?? 0 }, actor);
  cargados++;
}
for (const s of data.sinFicha) console.log(`SIN FICHA ${s.fila} (${usd(Math.round(s.usd * 100))}): no hay ficha; no se asignó a otro producto`);
console.log(`\n${write ? "Cargados" : "A cargar"}: ${cargados} · ya iguales: ${iguales} · respetados: ${respetados} · errores: ${errores} · sin ficha: ${data.sinFicha.length}`);
if (!write && cargados) console.log("Solo revisión: agregá --write para guardar.");
await db.$client.end({ timeout: 5 });
process.exit(errores ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
