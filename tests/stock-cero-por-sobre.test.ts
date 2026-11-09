import { beforeEach, describe, expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { availabilityLabel, commercialState, defaultStock, isInStock, isPurchasable } from "@/features/catalog/commercial";
import { applyOverrides, initializeStockToZero, listAudit, loadOverrides, saveProductChange } from "@/features/catalog/overrides";
import { confirmedBoosters, pricePerBooster } from "@/features/catalog/per-booster";
import { filterProducts, parseQuery } from "@/features/catalog/query";
import { evaluateCart } from "@/features/inquiries/pricing";
import type { EffectiveRate } from "@/features/fx/convert";
import type { Product } from "@/content/schema";

const base = realCatalog.products;
const actor = { id: "u", email: "dueno@example.com" };
const init = { id: "inicializacion-stock", email: "script:stock-inicial-cero" };
const rate = (r: number): EffectiveRate => ({ status: "manual", mode: "manual", rate10k: Math.round(r * 10_000), asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false });
let db: Db;
beforeEach(async () => { db = await openTestDb(); });
const vista = async (fx: EffectiveRate | null = rate(1400)) => applyOverrides(base, await loadOverrides(db), fx);

describe("sin stock: estado, etiqueta y regla única", () => {
  it("cantidad 0 es «Sin stock» aunque el precio esté pendiente; el precio pendiente es un estado aparte", async () => {
    expect(commercialState({ priceMinor: 1000_00, stockQuantity: 0 })).toBe("soldout");
    expect(commercialState({ priceMinor: null, stockQuantity: 0 })).toBe("soldout");
    expect(commercialState({ priceMinor: null, stockQuantity: null })).toBe("pending"); // «desconocida» marcada por el dueño
    expect(commercialState({ priceMinor: null, stockQuantity: 3 })).toBe("pending"); // hay stock pero falta precio
    expect(commercialState({ priceMinor: 100_00, stockQuantity: 3 })).toBe("available");
    expect(availabilityLabel({ stockQuantity: 0 })).toEqual({ text: "Sin stock", tone: "bad" });
    expect(availabilityLabel({ stockQuantity: null }).text).toBe("Disponibilidad a confirmar");
    expect(availabilityLabel({ stockQuantity: 2 }).text).toBe("Disponible");
  });

  it("un producto sin stock no se compra, no figura En stock y se puede consultar por encargo; retirados y ocultos no", async () => {
    const p = (await vista()).find((x) => x.id === "abyss-eye-caja")!;
    expect(p.stockQuantity).toBe(0);
    expect(isPurchasable(p)).toBe(false);
    expect(isInStock(p)).toBe(false);
    const comprar = evaluateCart([{ productId: p.id, quantity: 1 }], await vista());
    expect(["out_of_stock", "pending_commercial"]).toContain(comprar.lines[0].status);
    expect(comprar.lines[0].maxQuantity).toBe(0);
    expect(evaluateCart([{ productId: p.id, quantity: 2, mode: "encargo" }], await vista()).lines[0].status).toBe("encargo");
    // retirado: ni compra ni encargo
    const retirado = base.find((x) => x.retired)!;
    expect(evaluateCart([{ productId: retirado.id, quantity: 1, mode: "encargo" }], await vista()).lines[0].status).toBe("retired");
    // borrador / no publicado: tampoco
    const borrador = base.find((x) => x.draftNote)!;
    expect(borrador.active).toBe(false);
    expect(evaluateCart([{ productId: borrador.id, quantity: 1, mode: "encargo" }], await vista()).lines[0].status).toBe("unavailable");
    expect(filterProducts(await vista(), realCatalog.expansions, parseQuery({ disp: "stock" }))).toEqual([]);
  });

  it("el stock inicial del catálogo real es 0 también para fichas nuevas; los productos de demostración no cambian", async () => {
    expect((await vista()).filter((p) => !p.retired && !p.draftNote).every((p) => p.stockQuantity === 0)).toBe(true);
    expect(defaultStock({ stockQuantity: null, isDemo: true })).toBeNull();
    expect(defaultStock({ stockQuantity: 5, isDemo: false })).toBe(5);
    // editar solo el precio de una ficha sin fila no la deja en «pendiente»
    await saveProductChange(db, base, "ninja-spinner-caja", { priceUsdMinor: 11_500, expectedVersion: 0 }, actor);
    expect((await loadOverrides(db)).get("ninja-spinner-caja")!.stockQuantity).toBe(0);
  });
});

describe("inicialización única del stock en 0", () => {
  it("pone en 0 las fichas actuales, deja ocultos los borradores, omite los retirados y registra el historial", async () => {
    const r = await initializeStockToZero(db, base, init);
    const esperadas = base.filter((p) => !p.retired && !p.isDemo && p.stockQuantity !== 0);
    expect(r).toEqual({ applied: true, updated: esperadas.length });
    const filas = await loadOverrides(db);
    expect(filas.size).toBe(esperadas.length);
    for (const p of esperadas) expect(filas.get(p.id)!.stockQuantity, p.id).toBe(0);
    for (const p of base.filter((x) => x.retired)) expect(filas.has(p.id), p.id).toBe(false);
    const borrador = base.find((x) => x.draftNote)!;
    expect(filas.get(borrador.id)!.visible).toBe(false);
    const hist = await listAudit(db, { productId: "abyss-eye-caja" });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ field: "stock_quantity", oldValue: "null", newValue: "0" });
    expect(hist[0].userEmail).toMatch(/inicialización/);
  });

  it("se ejecuta una sola vez: no vuelve a poner en cero lo que el dueño carga después", async () => {
    await initializeStockToZero(db, base, init);
    const v = async () => (await loadOverrides(db)).get("inferno-x-caja")!.updatedAt;
    await saveProductChange(db, base, "inferno-x-caja", { stock: 6, expectedVersion: await v() }, actor);
    expect(await initializeStockToZero(db, base, init)).toEqual({ applied: false, updated: 0 });
    expect((await loadOverrides(db)).get("inferno-x-caja")!.stockQuantity).toBe(6);
    expect(filterProducts(await vista(), realCatalog.expansions, parseQuery({ disp: "stock" })).map((p) => p.id)).toEqual(["inferno-x-caja"]);
    // «desconocida» marcada después por el dueño tampoco se pisa
    await saveProductChange(db, base, "inferno-x-caja", { stock: null, expectedVersion: await v() }, actor);
    await initializeStockToZero(db, base, init);
    expect((await loadOverrides(db)).get("inferno-x-caja")!.stockQuantity).toBeNull();
  });

  it("conserva precios, cantidades positivas ya cargadas y demás datos comerciales", async () => {
    await saveProductChange(db, base, "white-flare-caja", { priceUsdMinor: 14_400, stock: 4, maxPerOrder: 2, expectedVersion: 0 }, actor);
    await saveProductChange(db, base, "black-bolt-caja", { priceUsdMinor: 14_400, stock: null, expectedVersion: 0 }, actor);
    await initializeStockToZero(db, base, init);
    expect((await loadOverrides(db)).get("white-flare-caja")).toMatchObject({ priceUsdMinor: 14_400, stockQuantity: 4, maxPerOrder: 2 });
    expect((await loadOverrides(db)).get("black-bolt-caja")).toMatchObject({ priceUsdMinor: 14_400, stockQuantity: 0 }); // estaba «pendiente»: pasa a 0 sin tocar el precio
  });
});

describe("precio equivalente por sobre al comprar la caja", () => {
  const caja = (n: number | null, priceMinor: number | null, priceUsdMinor: number | null = null) =>
    ({ kind: "box" as const, contents: n === null ? [{ label: "Sobres por caja", note: "Dato pendiente" }] : [{ label: "Sobres por caja", quantity: n, unit: "sobres" }, { label: "Cartas por sobre", quantity: 5, unit: "cartas" }], priceMinor, priceUsdMinor });

  it("$252.000 ÷ 30 = $8.400 exacto; 10 sobres = $25.200; usa sobres, no cartas", async () => {
    expect(pricePerBooster(caja(30, 252_000_00))).toMatchObject({ boosters: 30, arsMinor: 8_400_00, approxArs: false });
    expect(pricePerBooster(caja(10, 252_000_00))).toMatchObject({ boosters: 10, arsMinor: 25_200_00, approxArs: false });
    expect(pricePerBooster(caja(20, 252_000_00))!.arsMinor).toBe(12_600_00);
  });

  it("si el cociente se redondea a $100 lo marca como aproximado, con el USD calculado desde el USD base", async () => {
    const r = pricePerBooster(caja(30, 235_600_00, 152_00))!; // 235.600 / 30 = 7.853,33 → 7.900
    expect(r).toMatchObject({ arsMinor: 7_900_00, approxArs: true, usdMinor: 5_07, approxUsd: true });
    const exacto = pricePerBooster(caja(30, 252_000_00, 150_00))!;
    expect(exacto).toMatchObject({ usdMinor: 5_00, approxUsd: false });
  });

  it("sin precio o sin cantidad de sobres confirmada no inventa nada; no divide kits, bundles, sobres ni cajas sin dato", async () => {
    expect(pricePerBooster(caja(30, null))).toBeNull();
    expect(pricePerBooster(caja(null, 100_000_00))).toBeNull();
    expect(pricePerBooster(caja(0, 100_000_00))).toBeNull();
    expect(pricePerBooster({ ...caja(30, 100_000_00), kind: "kit" })).toBeNull();
    expect(pricePerBooster({ ...caja(3, 42_000_00), kind: "bundle" })).toBeNull();
    expect(pricePerBooster({ ...caja(30, 100_000_00), kind: "booster" })).toBeNull();
    expect(pricePerBooster({ ...caja(30, 100_000_00), kind: "special-box" })).toBeNull();
    expect(confirmedBoosters({ kind: "box", contents: [{ label: "Cartas por sobre", quantity: 5, unit: "cartas" }] })).toBeNull();
  });

  it("en el catálogo real solo calcula en cajas con sobres confirmados y se actualiza con el precio y la cotización", async () => {
    const ids = new Set(["abyss-eye-caja", "zh-30-zhounian-set-monedas", "zh-taijing-shengju-caja", "zh-baoshibao-vol6-caja"]);
    const calculables = (ps: Product[]) => ps.filter((p) => ids.has(p.id) && pricePerBooster(p) !== null).map((p) => p.id);
    await saveProductChange(db, base, "abyss-eye-caja", { priceUsdMinor: 152_00, expectedVersion: 0 }, actor);
    await saveProductChange(db, base, "zh-30-zhounian-set-monedas", { priceUsdMinor: 34_00, expectedVersion: 0 }, actor);
    await saveProductChange(db, base, "zh-taijing-shengju-caja", { priceUsdMinor: 20_00, expectedVersion: 0 }, actor);
    await saveProductChange(db, base, "zh-baoshibao-vol6-caja", { priceUsdMinor: 36_00, expectedVersion: 0 }, actor);
    expect(calculables(await vista(rate(1400)))).toEqual(["abyss-eye-caja", "zh-taijing-shengju-caja", "zh-baoshibao-vol6-caja"]); // el set con monedas no cuenta como caja
    const a = async (fx: EffectiveRate | null) => pricePerBooster((await vista(fx)).find((p) => p.id === "abyss-eye-caja")!);
    expect(await a(rate(1400))).toMatchObject({ boosters: 30, arsMinor: 7_100_00 }); // 212.800 / 30 = 7.093 → 7.100
    expect(await a(rate(1500))).toMatchObject({ arsMinor: 7_600_00 }); // 228.000 / 30 = 7.600 exacto
    expect((await a(rate(1500)))!.approxArs).toBe(false);
    expect(await a(null)).toBeNull(); // sin cotización utilizable no hay precio en pesos ni cálculo
    const v = (await loadOverrides(db)).get("abyss-eye-caja")!.updatedAt;
    await saveProductChange(db, base, "abyss-eye-caja", { priceUsdMinor: 180_00, expectedVersion: v }, actor);
    expect((await a(rate(1500)))!.arsMinor).toBe(9_000_00);
  });
});
