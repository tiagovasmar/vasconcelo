import { describe, expect, it } from "vitest";
import { demoCatalog } from "@/content/catalog";
import { SLEEVES_ID, TOPLOADERS_ID } from "@/content/real/accesorios";
import { buildAddonCatalog, previewAddons } from "@/features/promos/adicionales";
import type { ComboConfig } from "@/features/promos/combo";

/**
 * Adicionales de la ficha de una caja: qué opciones se ofrecen (solo lo vendible y participante) y la validación del conjunto «caja + sobres + protección»
 * contra el catálogo vigente y lo que ya hay en el carrito. Mismo motor de precios que el carrito, el pedido, la consulta y la venta.
 */
const products = demoCatalog.products;
const CFG: ComboConfig = { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "ejemplo-sobre", "parcial-sobre"] };
const img = () => ({ src: null, alt: "x" });
const box = (id = "storm-caja") => products.find((p) => p.id === id)!;
const catalogFor = (cfg = CFG, prods = products, id = "storm-caja") => buildAddonCatalog(prods, cfg, prods.find((p) => p.id === id)!, img);
const caja = { productId: "storm-caja", quantity: 1, expectedPriceMinor: 18500000 };
const sobre = (q: number, id = "storm-sobre", price = 950000) => ({ productId: id, quantity: q, expectedPriceMinor: price });
const prot = (id: string, q: number, price: number) => ({ productId: id, quantity: q, expectedPriceMinor: price });

describe("opciones de la ficha de una caja", () => {
  it("caja participante con la promoción encendida: sobres elegibles (orden estable) con su precio con 10% OFF, y los dos protectores", () => {
    const c = catalogFor()!;
    expect(c.comboActive).toBe(true);
    expect(c.boosters.map((o) => o.productId)).toEqual(["ejemplo-sobre", "parcial-sobre", "storm-sobre"].sort((a, b) => (products.find((p) => p.id === a)!.title).localeCompare(products.find((p) => p.id === b)!.title, "es")));
    const storm = c.boosters.find((o) => o.productId === "storm-sobre")!;
    expect(storm).toMatchObject({ listPriceMinor: 950000, comboPriceMinor: 855000, shortTitle: "Storm Emeralda" });
    expect(c.protection.map((o) => o.productId)).toEqual([SLEEVES_ID, TOPLOADERS_ID]);
    expect(c.protection[0]).toMatchObject({ listPriceMinor: 100000, comboPriceMinor: null, packSize: 5, language: null });
    expect(c.participatingBoxIds).toEqual(["storm-caja"]);
  });
  it("caja que no participa o promoción apagada: no se anuncia el 10% OFF ni se ofrecen sobres (la protección sí)", () => {
    for (const cat of [catalogFor(CFG, products, "ejemplo-caja")!, catalogFor({ ...CFG, enabled: false })!]) {
      expect(cat.comboActive).toBe(false);
      expect(cat.boosters).toEqual([]);
      expect(cat.participatingBoxIds).toEqual([]);
      expect(cat.protection).toHaveLength(2);
    }
  });
  it("solo cajas: un sobre, un pack o un accesorio no tienen selector", () => {
    expect(catalogFor(CFG, products, "storm-sobre")).toBeNull();
    expect(catalogFor(CFG, products, SLEEVES_ID)).toBeNull();
  });
  it("filtra lo que no se puede comprar: oculto, retirado, sin precio, sin stock o por encargo; un accesorio sin stock no se ofrece", () => {
    const filtrados = products.map((p) =>
      p.id === "ejemplo-sobre" ? { ...p, active: false } : p.id === "parcial-sobre" ? { ...p, priceMinor: null } : p.id === "storm-sobre" ? { ...p, stockQuantity: 0 } : p.id === SLEEVES_ID ? { ...p, stockQuantity: 0 } : p);
    const c = catalogFor(CFG, filtrados)!;
    expect(c.boosters).toEqual([]);
    expect(c.protection.map((o) => o.productId)).toEqual([TOPLOADERS_ID]);
    const retirado = products.map((p) => (p.id === "storm-sobre" ? { ...p, retired: { reason: "prueba" } } : p)) as typeof products;
    expect(catalogFor(CFG, retirado)!.boosters.map((o) => o.productId)).not.toContain("storm-sobre");
    const encargo = products.map((p) => (p.id === "storm-sobre" ? { ...p, orderOnly: true } : p));
    expect(catalogFor(CFG, encargo)!.boosters.map((o) => o.productId)).not.toContain("storm-sobre");
  });
  it("una caja sin stock no ofrece nada de la promoción", () => {
    const sin = products.map((p) => (p.id === "storm-caja" ? { ...p, stockQuantity: 0 } : p));
    expect(catalogFor(CFG, sin)!.comboActive).toBe(false);
  });
});

describe("validación y desglose del conjunto", () => {
  it("caja + 3 sobres + 1 sleeve desde un carrito vacío: ahorro del 10% solo en los sobres; los accesorios no tienen descuento", () => {
    const r = previewAddons(products, CFG, [], [caja, sobre(3), prot(SLEEVES_ID, 1, 100000)]);
    expect(r.ok).toBe(true);
    expect(r.breakdown).toMatchObject({ boxMinor: 18500000, boxUnits: 1, boostersListMinor: 3 * 950000, boostersUnits: 3, boostersDiscountedUnits: 3, protectionMinor: 100000, protectionUnits: 1, savingMinor: 3 * 95000 });
    expect(r.breakdown.totalMinor).toBe(18500000 + 3 * 950000 + 100000 - 3 * 95000);
    expect(r.combo).toMatchObject({ boxes: 1, slots: 5, usedSlots: 3, freeSlots: 2 });
  });
  it("considera lo que ya hay en el carrito: los cupos ya usados no se vuelven a regalar", () => {
    const cart = [{ ...caja }, sobre(2)];
    const r = previewAddons(products, CFG, cart, [sobre(4)]); // 5 cupos: 2 usados, quedan 3
    expect(r.ok).toBe(true);
    expect(r.breakdown).toMatchObject({ boostersUnits: 4, boostersDiscountedUnits: 3, savingMinor: 3 * 95000 });
    expect(r.breakdown.totalMinor).toBe(4 * 950000 - 3 * 95000);
    expect(r.combo).toMatchObject({ slots: 5, usedSlots: 5, freeSlots: 0 });
  });
  it("sumar otra caja habilita 5 cupos más; una caja nueva sobre sobres que ya estaban en el carrito les da el descuento", () => {
    const dos = previewAddons(products, CFG, [{ ...caja }, sobre(5)], [caja, sobre(5)]);
    expect(dos.combo).toMatchObject({ boxes: 2, slots: 10, usedSlots: 10 });
    expect(dos.breakdown.boostersDiscountedUnits).toBe(5);
    const sueltos = previewAddons(products, CFG, [sobre(5)], [caja]);
    expect(sueltos.breakdown.savingMinor).toBe(5 * 95000); // la caja habilitó el descuento de los sobres ya presentes
    expect(sueltos.breakdown.boxMinor).toBe(18500000);
  });
  it("más sobres que cupos: el descuento va primero a los de mayor precio unitario y no se muestran descontadas unidades de más", () => {
    const r = previewAddons(products, CFG, [{ ...caja }, sobre(5)], [sobre(2, "parcial-sobre", 1100000)]);
    // 7 sobres, 5 cupos: los 2 de $11.000 entran primero; de los $9.500 quedan 3 con descuento (antes eran 5).
    expect(r.breakdown).toMatchObject({ boostersUnits: 2, boostersDiscountedUnits: 2, savingMinor: 2 * 110000 + 3 * 95000 - 5 * 95000 });
    expect(r.combo.usedSlots).toBe(5);
    const mas = previewAddons(products, CFG, [{ ...caja }], [sobre(8, "ejemplo-sobre", 1250000)]);
    expect(mas.breakdown).toMatchObject({ boostersUnits: 8, boostersDiscountedUnits: 5, savingMinor: 5 * 125000 });
  });
  it("caja no participante, promoción apagada o sobre no participante: ningún descuento", () => {
    expect(previewAddons(products, CFG, [], [{ productId: "ejemplo-caja", quantity: 1 }, sobre(2)]).breakdown.savingMinor).toBe(0);
    expect(previewAddons(products, { ...CFG, enabled: false }, [], [caja, sobre(2)]).breakdown.savingMinor).toBe(0);
    expect(previewAddons(products, { ...CFG, boosterIds: ["ejemplo-sobre"] }, [], [caja, sobre(2)]).breakdown.savingMinor).toBe(0);
  });
  it("los protectores no usan cupos ni reciben descuento y no habilitan nada por sí solos", () => {
    const r = previewAddons(products, CFG, [], [prot(SLEEVES_ID, 2, 100000), prot(TOPLOADERS_ID, 1, 350000)]);
    expect(r.ok).toBe(true);
    expect(r.breakdown).toMatchObject({ protectionMinor: 2 * 100000 + 350000, protectionUnits: 3, savingMinor: 0, totalMinor: 550000 });
    expect(r.combo).toMatchObject({ boxes: 0, slots: 0 });
  });
  it("no confía en el navegador: un precio esperado distinto avisa el cambio y no agrega; los importes salen del catálogo", () => {
    const r = previewAddons(products, CFG, [], [{ ...caja, expectedPriceMinor: 1 }, sobre(1)]);
    expect(r.ok).toBe(false);
    expect(r.problems).toMatchObject([{ productId: "storm-caja", status: "price_changed", unitPriceMinor: 18500000 }]);
    expect(r.breakdown.boxMinor).toBe(18500000);
  });
  it("stock y límites con lo que ya hay en el carrito: informa cuánto se puede sumar", () => {
    const r = previewAddons(products, CFG, [sobre(6)], [sobre(8)]); // máximo por pedido 10 (stock 24): quedan 4
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatchObject({ productId: "storm-sobre", status: "over_limit", room: 4 });
    expect(r.problems[0].message).toContain("Podés sumar hasta 4");
    const sinStock = products.map((p) => (p.id === SLEEVES_ID ? { ...p, stockQuantity: 0 } : p));
    const s = previewAddons(sinStock, CFG, [], [caja, prot(SLEEVES_ID, 1, 100000)]);
    expect(s.problems).toMatchObject([{ productId: SLEEVES_ID, status: "out_of_stock", room: 0 }]);
    expect(previewAddons(products, CFG, [], [prot(SLEEVES_ID, 21, 100000)]).problems[0]).toMatchObject({ status: "over_limit", room: 20 });
  });
  it("producto inexistente, oculto o sin precio: se informa y nada se da por agregado", () => {
    expect(previewAddons(products, CFG, [], [{ productId: "no-existe", quantity: 1 }]).problems[0].status).toBe("unavailable");
    const sinPrecio = products.map((p) => (p.id === "storm-sobre" ? { ...p, priceMinor: null } : p));
    expect(previewAddons(sinPrecio, CFG, [], [caja, sobre(1)]).problems[0]).toMatchObject({ productId: "storm-sobre", status: "pending_commercial" });
    const oculto = products.map((p) => (p.id === "storm-sobre" ? { ...p, active: false } : p));
    expect(previewAddons(oculto, CFG, [], [caja, sobre(1)]).ok).toBe(false);
  });
  it("un encargo previo del mismo producto lo reemplaza la compra (una sola línea por producto, como el carrito)", () => {
    const r = previewAddons(products, CFG, [{ productId: "storm-sobre", quantity: 3, mode: "encargo" }], [caja, sobre(2)]);
    expect(r.ok).toBe(true);
    expect(r.breakdown.boostersUnits).toBe(2);
  });
  it("no modifica el catálogo ni reserva stock: es una función pura", () => {
    const antes = JSON.stringify(products.map((p) => [p.id, p.stockQuantity]));
    previewAddons(products, CFG, [], [caja, sobre(3)]);
    expect(JSON.stringify(products.map((p) => [p.id, p.stockQuantity]))).toBe(antes);
    expect(box().stockQuantity).toBe(3);
  });
});
