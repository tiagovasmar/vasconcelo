import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { adminSettings, fxSettings, productGalleries, productOverrides } from "@/db/schema";
import { getLowStock, lowStockOf, LOW_STOCK_KEY } from "@/features/admin/settings";
import { loadGalleries, loadOverrides } from "@/features/catalog/overrides";
import { getFxRow } from "@/features/fx/service";
import { openTestDb } from "./helpers/pg";

// `react.cache` solo memoriza dentro de un pedido de página; fuera de uno no hace nada: se llama directo a la función sin memoria.
vi.mock("server-only", () => ({}));
const { loadPageData } = await import("@/features/catalog/page-data");

/**
 * Las páginas leen valores del panel, galerías, cotización y umbral de «Bajo stock» con UNA consulta (antes cuatro seguidas). Esta prueba exige que el resultado sea
 * IDÉNTICO al de las lecturas separadas de siempre, con todos los tipos de columna (números grandes, booleanos, nulos, texto).
 */
let db: Db;
beforeEach(async () => {
  db = await openTestDb();
});

describe("lectura única de datos de página", () => {
  it("base vacía: sin valores del panel, sin galerías, sin fila de cotización y con el umbral predeterminado", async () => {
    const d = await loadPageData(db);
    expect(d.overrides.size).toBe(0);
    expect(d.galleries.size).toBe(0);
    expect(d.fxRow).toBeNull();
    expect(lowStockOf(d.lowStockRow)).toEqual(await getLowStock(db));
  });

  it("con datos: mismas filas que las lecturas separadas (booleanos, nulos, bigint, texto con comillas y acentos)", async () => {
    await db.insert(productOverrides).values([
      { productId: "a", priceMinor: 123456789012, priceUsdMinor: 1250, priceArsMinor: null, title: "Título «con» \"comillas\" y ñandú", description: null, orderOnly: true, stockQuantity: 0, maxPerOrder: null, visible: false, updatedAt: 1760000000123, updatedByEmail: "x@e.com" },
      { productId: "b", priceMinor: null, priceUsdMinor: null, priceArsMinor: 100000, title: null, description: "d", orderOnly: false, stockQuantity: null, maxPerOrder: 3, visible: true, updatedAt: 5, updatedByEmail: "y@e.com" },
    ]);
    await db.insert(productGalleries).values({ productId: "a", itemsJson: JSON.stringify([{ src: "/x.webp", alt: "á" }]), updatedAt: 1760000000999, updatedByEmail: "x@e.com" });
    await db.insert(fxSettings).values({ id: 1, mode: "manual", autoRate10k: 12345000, autoProviderUpdatedAt: 1760000000000, autoFetchedAt: 1760000000001, lastAttemptAt: 1760000000002, lastError: "falló", lastErrorAt: 1760000000003, manualRate10k: 13000000, manualSetAt: 1760000000004, manualSetByEmail: "o@e.com", manualNote: "nota ✓", updatedAt: 1760000000005 });
    await db.insert(adminSettings).values({ key: LOW_STOCK_KEY, value: "7", updatedAt: 1760000000006, updatedByEmail: "o@e.com" });
    const d = await loadPageData(db);
    expect([...d.overrides]).toEqual([...(await loadOverrides(db))]);
    expect([...d.galleries]).toEqual([...(await loadGalleries(db))]);
    expect(d.fxRow).toEqual(await getFxRow(db));
    expect(lowStockOf(d.lowStockRow)).toEqual({ threshold: 7, custom: true, updatedAt: 1760000000006, updatedByEmail: "o@e.com" });
    expect(lowStockOf(d.lowStockRow)).toEqual(await getLowStock(db));
  });

  it("es UNA sola consulta a la base", async () => {
    let consultas = 0;
    const proxied = new Proxy(db, {
      get(t, p, r) {
        if (p === "execute") return (...a: unknown[]) => { consultas++; return (t.execute as (...x: unknown[]) => unknown)(...a); };
        return Reflect.get(t, p, r);
      },
    });
    await loadPageData(proxied as Db);
    expect(consultas).toBe(1);
  });
});
