import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { commercialState, isInStock, isPurchasable } from "@/features/catalog/commercial";
import { applyOverrides, loadOverrides, saveProductChange } from "@/features/catalog/overrides";
import { filterProducts, parseQuery } from "@/features/catalog/query";
import type { EffectiveRate } from "@/features/fx/convert";

const lote = JSON.parse(fs.readFileSync("src/content/real/precios-venta-usd.json", "utf8")) as { items: Array<{ id: string; usd: number }>; sinFicha: Array<{ fila: string }> };
const base = realCatalog.products;
const rate = (r: number): EffectiveRate => ({ status: "manual", mode: "manual", rate10k: Math.round(r * 10_000), asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false });
const actor = { id: "u", email: "carga@example.com" };
let db: Db;
beforeEach(async () => { db = await openTestDb(); });
/** Misma regla que scripts/cargar-precios-venta.ts: solo completa precios que faltan. */
const cargar = async () => {
  for (const it of lote.items) {
    const o = (await loadOverrides(db)).get(it.id);
    if (!o || o.priceUsdMinor === null) await saveProductChange(db, base, it.id, { priceUsdMinor: it.usd * 100, expectedVersion: o?.updatedAt ?? 0 }, actor);
  }
};
const vista = async (fx: EffectiveRate | null = rate(1234)) => applyOverrides(base, await loadOverrides(db), fx);

describe("lote de precios de venta (USD)", () => {
  it("todas las filas con ficha apuntan a un producto vigente del idioma y formato correctos", async () => {
    for (const it of lote.items) {
      const p = base.find((x) => x.id === it.id);
      expect(p, it.id).toBeDefined();
      expect(p!.retired, it.id).toBeUndefined();
    }
    const por = (id: string) => base.find((x) => x.id === id)!;
    for (const id of ["abyss-eye-caja", "mega-dream-ex-caja", "black-bolt-caja", "heat-wave-arena-caja", "inferno-x-caja", "storm-caja", "white-flare-caja"]) expect(por(id)).toMatchObject({ kind: "box", language: "ja" });
    expect(por("abyss-eye-sobre")).toMatchObject({ kind: "booster", language: "ja" });
    expect(por("zh-30-zhounian-set-monedas")).toMatchObject({ kind: "bundle", language: "zh" });
    expect(lote.items.filter((i) => i.id.startsWith("zh-") && /sobre-[56]$/.test(i.id))).toHaveLength(12);
    expect(lote.sinFicha).toHaveLength(0); // las seis cajas sin ficha se agregaron el 14/10/2026
  });

  it("el sobre vale lo definido (5 / 6 / 8) y no se contagia a la caja ni a otras variantes", async () => {
    await cargar();
    const v = await vista();
    const usd = (id: string) => v.find((p) => p.id === id)!.priceUsdMinor;
    expect(usd("abyss-eye-sobre")).toBe(800);
    expect(usd("abyss-eye-caja")).toBe(15200);
    for (const id of ["zh-gongzhu-rongguang-sobre-5", "zh-xingcai-jingli-sobre-5", "zh-cuican-guihuan-sobre-5", "zh-zhenshi-xuanxu-sobre-5", "zh-liren-mengxing-sobre-5", "zh-jiajiang-huihe-sobre-5", "zh-heijing-chicheng-sobre-5"]) expect(usd(id), id).toBe(500);
    for (const id of ["zh-wuwei-taijing-sobre-5", "zh-nuyan-zhuotian-sobre-6", "zh-anying-duohui-sobre-6", "zh-jiju-gongfang-sobre-6", "zh-gengu-kailai-sobre-5"]) expect(usd(id), id).toBe(600);
    // variantes retiradas de 20 cartas y productos fuera del lote: siguen sin precio
    for (const p of v.filter((x) => x.retired)) expect(p.priceUsdMinor, p.id).toBeNull();
    expect(usd("zh-30-zhounian-caja")).toBe(14_000);
    expect(v.filter((p) => p.priceUsdMinor !== null)).toHaveLength(lote.items.length + 3);
    expect(usd("zh-taijing-shengju-sobre-10")).toBeNull();
    expect(usd("zh-taijing-shengju-caja")).toBeNull();
  });

  it("convierte con el dólar blue y redondea a múltiplos de $100 (mitades hacia arriba)", async () => {
    await cargar();
    const ars = async (fx: EffectiveRate, id: string) => (await vista(fx)).find((p) => p.id === id)!.priceMinor! / 100;
    expect(await ars(rate(1400), "abyss-eye-caja")).toBe(212_800);
    expect(await ars(rate(1234), "zh-gongzhu-rongguang-sobre-5")).toBe(6_200); // 6.170
    expect(await ars(rate(1235), "zh-gongzhu-rongguang-sobre-5")).toBe(6_200); // 6.175 → mitad hacia arriba
    expect(await ars(rate(1234), "abyss-eye-sobre")).toBe(9_900); // 9.872
    expect(await ars(rate(1234), "zh-30-zhounian-set-monedas")).toBe(42_000); // 41.956
  });

  it("es idempotente y no pisa lo que el dueño ya cargó", async () => {
    await cargar();
    const n = (await loadOverrides(db)).size;
    expect(n).toBe(lote.items.length);
    await cargar();
    expect((await loadOverrides(db)).size).toBe(n);
    const o = (await loadOverrides(db)).get("white-flare-caja")!;
    await saveProductChange(db, base, "white-flare-caja", { priceUsdMinor: 15000, stock: 4, expectedVersion: o.updatedAt }, actor);
    await cargar();
    expect((await loadOverrides(db)).get("white-flare-caja")).toMatchObject({ priceUsdMinor: 15000, stockQuantity: 4 });
  });

  it("sin cotización utilizable el precio en pesos queda pendiente, no $0", async () => {
    await cargar();
    expect((await vista(null)).filter((p) => p.priceUsdMinor !== null).every((p) => p.priceMinor === null)).toBe(true);
  });

  it("cargar precios no inventa stock: nada queda en stock ni se puede comprar", async () => {
    await cargar();
    const v = await vista();
    expect(v.every((p) => p.stockQuantity === 0)).toBe(true); // stock inicial 0 («Sin stock»), no cantidades inventadas
    expect(v.some((p) => isInStock(p))).toBe(false);
    expect(v.some((p) => isPurchasable(p))).toBe(false);
    expect(filterProducts(v, realCatalog.expansions, parseQuery({ disp: "stock" }))).toHaveLength(0);
  });
});

describe("En stock", () => {
  const p = (o: Record<string, unknown>) => ({ active: true, stockQuantity: 3, ...o }) as Parameters<typeof isInStock>[0];
  it("solo cuenta stock propio positivo en un producto publicado y que no es solo por encargo", async () => {
    expect(isInStock(p({}))).toBe(true);
    expect(isInStock(p({ stockQuantity: 0 }))).toBe(false); // agotado
    expect(isInStock(p({ stockQuantity: null }))).toBe(false); // desconocido
    expect(isInStock(p({ orderOnly: true }))).toBe(false); // por encargo
    expect(isInStock(p({ active: false }))).toBe(false); // oculto
    expect(isInStock(p({ retired: { date: "2026-10-13", reason: "x" } }))).toBe(false);
  });

  it("stock real con precio pendiente figura en stock pero no se puede comprar", async () => {
    const sin = { active: true, stockQuantity: 2, priceMinor: null };
    expect(isInStock(sin)).toBe(true);
    expect(commercialState(sin)).toBe("pending");
  });

  it("los cambios del panel se reflejan en el filtro, que usa la misma regla", async () => {
    await cargar();
    const q = parseQuery({ disp: "stock" });
    const run = async () => filterProducts(await vista(), realCatalog.expansions, q).map((x) => x.id);
    const ver = async () => (await loadOverrides(db)).get("abyss-eye-caja")!.updatedAt;
    expect(await run()).toEqual([]);
    await saveProductChange(db, base, "abyss-eye-caja", { stock: 5, expectedVersion: await ver() }, actor);
    expect(await run()).toEqual(["abyss-eye-caja"]);
    await saveProductChange(db, base, "abyss-eye-caja", { orderOnly: true, stock: 0, expectedVersion: await ver() }, actor);
    expect(await run()).toEqual([]);
    await saveProductChange(db, base, "abyss-eye-caja", { orderOnly: false, stock: 1, visible: false, expectedVersion: await ver() }, actor);
    expect(await run()).toEqual([]);
    // una ficha con stock real y sin precio también figura en stock
    await saveProductChange(db, base, "zh-taijing-shengju-caja", { stock: 2, expectedVersion: 0 }, actor);
    expect(await run()).toEqual(["zh-taijing-shengju-caja"]);
  });
});
