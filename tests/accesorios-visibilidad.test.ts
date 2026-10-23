import { describe, expect, it } from "vitest";
import { demoCatalog } from "@/content/catalog";
import { products as accessories, SLEEVES_ID, TOPLOADERS_ID } from "@/content/real/accesorios";
import { isListedProduct } from "@/features/catalog/visibility";
import { filterProducts, parseQuery } from "@/features/catalog/query";
import { isInStock } from "@/features/catalog/commercial";
import { buildAddonCatalog, previewAddons } from "@/features/promos/adicionales";

const products = demoCatalog.products.map((p) => [SLEEVES_ID, TOPLOADERS_ID].includes(p.id)
  ? { ...p, addonOnly: true, stockQuantity: 20 } : p);
const combo = { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre"] };

describe("accesorios exclusivos de adicionales", () => {
  it("los dos protectores reales permanecen activos pero fuera de listados", () => {
    expect(accessories).toHaveLength(2);
    for (const p of accessories) {
      expect(p.active).toBe(true);
      expect(p.addonOnly).toBe(true);
      const stocked = { ...p, stockQuantity: 20 };
      expect(isListedProduct(stocked)).toBe(false);
    }
  });
  it("no entran en catálogo, búsqueda o filtro en stock aunque tengan existencias", () => {
    for (const raw of [{}, { disp: "stock" }, { q: "sleeves" }, { q: "top loaders" }, { formato: "accesorios" }]) {
      expect(filterProducts(products, demoCatalog.expansions, parseQuery(raw)).some((p) => p.addonOnly)).toBe(false);
    }
    expect(products.filter(isListedProduct).filter(isInStock).some((p) => p.addonOnly)).toBe(false);
    expect(isListedProduct({ active: true })).toBe(true);
    expect(isListedProduct({ active: false })).toBe(false);
  });
  it("siguen ofrecidos en la ficha y comprables al precio de pack", () => {
    const box = products.find((p) => p.id === "storm-caja")!;
    const addons = buildAddonCatalog(products, combo, box, () => ({ src: null, alt: "" }))!;
    expect(addons.protection.map((p) => p.productId)).toEqual([SLEEVES_ID, TOPLOADERS_ID]);
    const preview = previewAddons(products, combo, [], [
      { productId: box.id, quantity: 1, expectedPriceMinor: box.priceMinor! },
      { productId: SLEEVES_ID, quantity: 2, expectedPriceMinor: 100000 },
    ]);
    expect(preview.ok).toBe(true);
    expect(preview.breakdown.protectionMinor).toBe(200000);
  });
});
