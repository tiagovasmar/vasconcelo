import { describe, expect, it } from "vitest";
import { catalog } from "@/content/catalog";
import type { Catalog, PullRate } from "@/content/schema";
import { filterProducts, paginate, parseQuery, toSearchParams } from "@/features/catalog/query";
import { formatProbability, groupGuarantees, ratesForProduct } from "@/features/catalog/pull-rates";
import { validateCatalog } from "@/features/catalog/validate";

const run = (params: Record<string, string>) => filterProducts(catalog.products, catalog.expansions, parseQuery(params));
const clone = (): Catalog => structuredClone(catalog);
const errors = (c: Catalog) => validateCatalog(c).filter((i) => i.level === "error").map((i) => i.message);

describe("búsqueda y filtros", () => {
  it("busca por nombre, expansión y SKU, sin tildes ni mayúsculas", () => {
    expect(run({ q: "storm" }).length).toBe(3);
    expect(run({ q: "EMERALDA caja" }).map((p) => p.id)).toEqual(["storm-caja"]);
    expect(run({ q: "demo-ej-sobre" }).map((p) => p.id)).toEqual(["ejemplo-sobre"]);
    expect(run({ q: "m6" }).length).toBe(3); // código de expansión
    expect(run({ q: "japones" }).length).toBe(3);
  });
  it("combina filtros y la URL reproduce el mismo resultado", () => {
    const params = { formato: "caja", idioma: "en", disp: "stock", orden: "precio-desc" };
    const q = parseQuery(params);
    const url = toSearchParams(q).toString();
    expect(run(Object.fromEntries(new URLSearchParams(url))).map((p) => p.id)).toEqual(run(params).map((p) => p.id));
    expect(run(params).map((p) => p.id)).toEqual(["ejemplo-caja"]);
  });
  it("filtra por precio en pesos y disponibilidad", () => {
    expect(run({ pmax: "10000" }).every((p) => (p.priceMinor ?? 0) <= 1000000)).toBe(true);
    expect(run({ disp: "stock" }).some((p) => p.stockQuantity === 0)).toBe(false);
    expect(run({}).some((p) => p.stockQuantity === 0)).toBe(true);
  });
  it("ordena por precio y por novedades", () => {
    const asc = run({ orden: "precio-asc" }).map((p) => p.priceMinor as number);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const todos = run({});
    const resto = todos.filter((p) => p.kind !== "accessory");
    const novedades = resto.map((p) => p.createdAt);
    expect(novedades).toEqual([...novedades].sort().reverse());
    expect(todos.slice(resto.length).every((p) => p.kind === "accessory")).toBe(true); // los accesorios van al final del orden por defecto
  });
  it("ignora parámetros inválidos sin romper", () => {
    const q = parseQuery({ formato: "xx", idioma: "fr", orden: "raro", pagina: "-3", pmin: "abc", pmax: "-1" });
    expect(q).toMatchObject({ kind: "", language: "", sort: "nuevos", page: 1, minPrice: null, maxPrice: null });
  });
  it("sin resultados devuelve lista vacía; pagina sin pasarse", () => {
    expect(run({ q: "no-existe-xyz" })).toEqual([]);
    const p = paginate([1, 2, 3, 4, 5], 99, 2);
    expect(p).toMatchObject({ page: 3, pages: 3, from: 5, to: 5 });
  });
});

describe("probabilidades y garantías", () => {
  it("una probabilidad desconocida nunca se muestra como 0%", () => {
    expect(formatProbability(null)).toBe("Dato no disponible");
    expect(formatProbability(null)).not.toMatch(/0/);
    expect(formatProbability(0.0125)).toBe("1,25 %");
  });
  it("no traslada tasas entre formatos, idiomas ni regiones", () => {
    const rate = (o: Partial<PullRate>): PullRate => ({ ...catalog.pullRates[0], ...o });
    const box = catalog.products.find((p) => p.id === "storm-caja")!;
    const booster = catalog.products.find((p) => p.id === "storm-sobre")!;
    const rates = [rate({ id: "a", unit: "box" }), rate({ id: "b", unit: "booster" }), rate({ id: "c", unit: "box", language: "en" }), rate({ id: "d", unit: "box", region: "US" })];
    expect(ratesForProduct(box, rates).map((r) => r.id)).toEqual(["a"]);
    expect(ratesForProduct(booster, rates).map((r) => r.id)).toEqual(["b"]);
  });
  it("las garantías sin verificar no se presentan como promesa", () => {
    const g = groupGuarantees(catalog.guarantees.filter((x) => x.scope === "ejemplo-caja"));
    expect(g.rarity).toEqual([]);
    expect(g.unverifiedCount).toBe(1);
  });
  it("el catálogo no carga ningún porcentaje sin evidencia", () => {
    expect(catalog.pullRates.every((r) => r.probability === null && r.evidence === "unavailable")).toBe(true);
  });
});

describe("validación del catálogo", () => {
  it("el catálogo actual no tiene errores", () => {
    expect(errors(catalog)).toEqual([]);
  });
  it("detecta duplicados, referencias inexistentes y valores inválidos", () => {
    const c = clone();
    c.products.push({ ...c.products[0] });
    expect(errors(c).join()).toMatch(/duplicado/);
    const d = clone();
    d.products[0].expansionIds = ["no-existe"];
    expect(errors(d).join()).toMatch(/expansión inexistente/);
    const e = clone();
    e.products[0].priceMinor = -5;
    expect(errors(e).length).toBeGreaterThan(0);
    const f = clone();
    f.products[0].priceMinor = 10.5;
    expect(errors(f).length).toBeGreaterThan(0);
    const g = clone();
    g.products[0].stockQuantity = -1;
    expect(errors(g).length).toBeGreaterThan(0);
  });
  it("rechaza probabilidades fuera de rango y tasas sin evidencia", () => {
    const c = clone();
    c.pullRates[0].probability = 1.5;
    expect(errors(c).length).toBeGreaterThan(0);
    const d = clone();
    d.pullRates[0].probability = 0.1; // evidencia unavailable con número
    expect(errors(d).join()).toMatch(/unavailable/);
    const e = clone();
    e.pullRates[0].evidence = "official";
    e.pullRates[0].probability = 0.1;
    expect(errors(e).join()).toMatch(/sin fuente/);
    const f = clone();
    f.pullRates[0].evidence = "observed";
    f.pullRates[0].probability = 0.1;
    f.pullRates[0].sourceIds = ["pokemon-card-storm"];
    expect(errors(f).join()).toMatch(/sampleSize/);
  });
  it("exige fuente a garantías oficiales y prohíbe rareza por composición del vendedor", () => {
    const c = clone();
    c.guarantees[0].sourceIds = [];
    expect(errors(c).join()).toMatch(/sin fuente/);
    const d = clone();
    const g = d.guarantees.find((x) => x.type === "rarity")!;
    g.evidence = "seller_pack_contents";
    expect(errors(d).join()).toMatch(/rareza/);
  });
  it("detecta idioma distinto entre garantía/tasa y producto/expansión, e imágenes finales faltantes", () => {
    const c = clone();
    c.guarantees[0].language = "en";
    expect(errors(c).join()).toMatch(/idioma/);
    const d = clone();
    d.products[0].images[0].status = "final";
    expect(validateCatalog(d, () => false).some((i) => i.level === "error" && /imagen final/.test(i.message))).toBe(true);
  });
  it("coherencia de lista de cartas con su estado", () => {
    const c = clone();
    c.expansions[0].cardListStatus = "complete";
    expect(errors(c).join()).toMatch(/sin cartas/);
  });
});
