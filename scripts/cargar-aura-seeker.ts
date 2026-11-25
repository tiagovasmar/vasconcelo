import { realCatalog } from "../src/content/catalog";
import { loadGalleries, loadOverrides, saveProductChange } from "../src/features/catalog/overrides";
import { saveGallery } from "../src/features/catalog/gallery";
import { publishTiers, saveTier } from "../src/features/mayorista/precios";
import { describeTarget, scriptDb, scriptUrl } from "./lib/env";

async function main() {
  const product = realCatalog.products.find((item) => item.id === "aura-seeker-caja")!;
  if (!process.argv.includes("--write")) {
    console.log(`${product.title}: USD 140 minorista, USD 108 mayorista, por encargo.`);
    return;
  }
  const db = scriptDb();
  const actor = { id: "catalogo-aura-seeker", email: "script:catalogo-aura-seeker" };
  try {
    const overrides = await loadOverrides(db);
    const galleries = await loadGalleries(db);
    await saveProductChange(db, realCatalog.products, product.id, {
      priceUsdMinor: 14000, orderOnly: true, visible: true,
      expectedVersion: overrides.get(product.id)?.updatedAt ?? 0,
    }, actor);
    await saveTier(db, { productId: product.id, minQty: 1, unitPriceUsdMinor: 10800 }, actor);
    await publishTiers(db, product.id, actor);
    await saveGallery(db, realCatalog.products, product.id, {
      expectedVersion: galleries.get(product.id)?.updatedAt ?? 0,
      items: product.images.map(({ src, alt, view }) => ({ src, alt, view })),
    }, actor);
    console.log(`Aura Seeker: precio minorista, mayorista publicado y foto guardados en ${describeTarget(scriptUrl())}.`);
  } finally { await db.$client.end({ timeout: 5 }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
