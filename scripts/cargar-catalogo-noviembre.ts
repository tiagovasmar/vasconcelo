import { realCatalog } from "../src/content/catalog";
import prices from "../src/content/real/precios-noviembre.json";
import proposal from "../src/content/real/propuesta-mayorista.json";
import { loadGalleries, loadOverrides, saveProductChange } from "../src/features/catalog/overrides";
import { saveGallery } from "../src/features/catalog/gallery";
import { listProductCosts, saveProductCost } from "../src/features/costos/product-costs";
import slimPhotos from "../src/content/colecciones/imagenes-slim.json";
import specialPhotos from "../src/content/colecciones/imagenes-pokebolas-figura.json";
import { publishTiers, saveTier } from "../src/features/mayorista/precios";
import { describeTarget, scriptDb, scriptUrl } from "./lib/env";

/** Carga del lote aprobado: precios, costos de referencia calculables y portadas revisadas. Sin --write no escribe. No modifica stock. */
async function main() {
  const entries = Object.entries(prices);
  if (!process.argv.includes("--write")) {
    for (const [id, retail] of entries) console.log(`${id}: público USD ${retail}, mayorista USD ${proposal.find((p) => p.id === id)?.tiers[0]?.[1] ?? "pendiente"}`);
    return;
  }
  const db = scriptDb();
  const actor = { id: "catalogo-noviembre", email: "script:catalogo-noviembre" };
  try {
    const overrides = await loadOverrides(db);
    const galleries = await loadGalleries(db);
    const costs = await listProductCosts(db, entries.map(([id]) => id));
    const revisedPhotos = new Set([...slimPhotos, ...specialPhotos].map((photo) => photo.id));
    let updatedCosts = 0, updatedPhotos = 0;
    for (const [id, retail] of entries) {
      await saveProductChange(db, realCatalog.products, id, { priceUsdMinor: retail * 100, expectedVersion: overrides.get(id)?.updatedAt ?? 0 }, actor);
      const p = proposal.find((item) => item.id === id);
      if (p?.tiers.length) {
        for (const [minQty, usd] of p.tiers) await saveTier(db, { productId: id, minQty, unitPriceUsdMinor: Math.round(usd * 100) }, actor);
        await publishTiers(db, id, actor);
      }
      if (p?.providerRmb !== null && p?.providerRmb !== undefined && p.logisticsUsd !== null) {
        // Referencia estimada acordada el 24/11/2026. No crea compras, gastos ni costos históricos.
        const amountMinor = Math.round((p.providerRmb / 6.7111 + p.logisticsUsd) * 100);
        await saveProductCost(db, { productId: id, currency: "USD", amountMinor, expectedVersion: costs.get(id)?.version ?? 0 }, actor.email);
        updatedCosts++;
      }
      if (revisedPhotos.has(id)) {
        const product = realCatalog.products.find((item) => item.id === id)!;
        await saveGallery(db, realCatalog.products, id, {
          expectedVersion: galleries.get(id)?.updatedAt ?? 0,
          items: product.images.map((image) => ({ src: image.src, alt: image.alt, view: image.view })),
        }, actor);
        updatedPhotos++;
      }
    }
    console.log(`${entries.length} precios, ${updatedCosts} costos de referencia y ${updatedPhotos} portadas actualizados en ${describeTarget(scriptUrl())}.`);
  } finally { await db.$client.end({ timeout: 5 }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
