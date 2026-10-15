import { realCatalog } from "../src/content/catalog";
import { describeTarget, isLocalTarget, scriptDb, scriptUrl } from "./lib/env";
import { loadOverrides, saveProductChange } from "../src/features/catalog/overrides";
import { setManualRate } from "../src/features/fx/service";

/**
 * Datos de PRUEBA para la base de desarrollo local (nunca para producción): cotización manual ficticia y stock de ejemplo para los productos que ya tienen precio.
 *   npm run dev:datos        (después de `npm run dev:db` y `npm run precios:cargar -- --write`)
 * Se niega a correr contra un servidor que no sea local.
 */
async function main() {
  const url = scriptUrl();
  if (!isLocalTarget(url)) { console.error(`Rechazado: ${describeTarget(url)} no es una base local. Este script solo siembra datos de prueba en desarrollo.`); process.exit(1); }
  const db = scriptDb();
  const actor = { id: "dev-datos", email: "script:dev-datos" };
  await setManualRate(db, 1300, actor, "Cotización de PRUEBA para desarrollo local");
  const rows = await loadOverrides(db);
  let n = 0;
  for (const p of realCatalog.products) {
    if (p.retired || !p.active) continue;
    const o = rows.get(p.id);
    const usd = o ? o.priceUsdMinor : p.priceUsdMinor ?? null;
    if (usd === null) continue;
    const stock = 3 + (n % 9); // 3..11 unidades de ejemplo
    await saveProductChange(db, realCatalog.products, p.id, { stock, expectedVersion: o?.updatedAt ?? 0 }, actor);
    n++;
  }
  console.log(`Base local ${describeTarget(url)}: cotización de prueba $1.300 y stock de ejemplo en ${n} productos.`);
  await db.$client.end({ timeout: 5 });
}
main().catch((e) => { console.error(e); process.exit(1); });
