import { describe, expect, it } from "vitest";
import { demoCatalog } from "@/content/catalog";
import { COMBO_OFF, priceCart, type ComboConfig, type PricingInput } from "@/features/promos/combo";
import { evaluateCart } from "@/features/inquiries/pricing";
import { buildSuggestions } from "@/features/promos/sugerencias";
import { SLEEVES_ID, TOPLOADERS_ID } from "@/content/real/accesorios";

/**
 * Motor de precios de la promoción caja + sobres (lo usan el carrito lateral, la página del pedido, el mensaje de WhatsApp, la consulta y la venta):
 * cupos, orden de reparto, no acumulación con transferencia, accesorios fuera de las promociones y una sola regla monetaria.
 */
const CFG: ComboConfig = { enabled: true, boxIds: ["caja-a", "caja-b"], boosterIds: ["sobre-caro", "sobre-medio", "sobre-barato", "sobre-igual-a", "sobre-igual-b"] };
const peso = (p: number) => p * 100;
const caja = (q = 1, id = "caja-a", price = 185000): PricingInput => ({ productId: id, kind: "box", quantity: q, unitPriceMinor: peso(price) });
const sobre = (id: string, q: number, price: number): PricingInput => ({ productId: id, kind: "booster", quantity: q, unitPriceMinor: peso(price) });
const acc = (id: string, q: number, price: number): PricingInput => ({ productId: id, kind: "accessory", quantity: q, unitPriceMinor: peso(price) });
const line = (p: ReturnType<typeof priceCart>, id: string) => p.lines.find((l) => l.productId === id)!;

describe("cupos: cada caja participante habilita hasta 5 sobres con 10% OFF", () => {
  it("una caja y 5 sobres: los 5 con descuento; 6 sobres: el sexto sin descuento", () => {
    const cinco = priceCart([caja(), sobre("sobre-medio", 5, 9500)], "efectivo", CFG);
    expect(cinco.combo).toMatchObject({ boxes: 1, slots: 5, usedSlots: 5, freeSlots: 0 });
    expect(line(cinco, "sobre-medio")).toMatchObject({ comboUnits: 5, comboDiscountMinor: peso(950) * 5, finalTotalMinor: peso(9500) * 5 - peso(950) * 5 });
    const seis = priceCart([caja(), sobre("sobre-medio", 6, 9500)], "efectivo", CFG);
    expect(line(seis, "sobre-medio")).toMatchObject({ comboUnits: 5, comboDiscountMinor: peso(950) * 5, finalTotalMinor: peso(9500) * 6 - peso(950) * 5 });
  });
  it("dos cajas habilitan 10 sobres; tres, 15 (también de cajas distintas)", () => {
    const dos = priceCart([caja(2), sobre("sobre-medio", 12, 9500)], "efectivo", CFG);
    expect(dos.combo).toMatchObject({ boxes: 2, slots: 10, usedSlots: 10 });
    expect(line(dos, "sobre-medio").comboUnits).toBe(10);
    const distintas = priceCart([caja(1, "caja-a"), caja(2, "caja-b", 210000), sobre("sobre-medio", 20, 9500)], "efectivo", CFG);
    expect(distintas.combo).toMatchObject({ boxes: 3, slots: 15, usedSlots: 15, freeSlots: 0 });
  });
  it("sin caja no hay combo; quitar la última caja recalcula y elimina el descuento", () => {
    const con = priceCart([caja(), sobre("sobre-medio", 3, 9500)], "efectivo", CFG);
    expect(con.comboDiscountMinor).toBeGreaterThan(0);
    const sin = priceCart([sobre("sobre-medio", 3, 9500)], "efectivo", CFG);
    expect(sin.comboDiscountMinor).toBe(0);
    expect(sin.totalMinor).toBe(peso(9500) * 3);
    expect(sin.combo).toMatchObject({ boxes: 0, slots: 0 });
  });
  it("modificar cantidades recalcula los cupos", () => {
    const a = priceCart([caja(1), sobre("sobre-medio", 5, 9500)], "efectivo", CFG);
    const b = priceCart([caja(2), sobre("sobre-medio", 5, 9500)], "efectivo", CFG);
    expect(a.combo.freeSlots).toBe(0);
    expect(b.combo.freeSlots).toBe(5);
    expect(a.comboDiscountMinor).toBe(b.comboDiscountMinor); // 5 sobres con descuento en los dos casos
  });
});

describe("más sobres que cupos: se descuenta primero a los de mayor precio, con una regla estable", () => {
  const sobres = [sobre("sobre-barato", 3, 9000), sobre("sobre-caro", 2, 13000), sobre("sobre-medio", 4, 11000)];
  it("1 caja (5 cupos): los 2 caros y 3 de los medios; los baratos, ninguno", () => {
    const r = priceCart([caja(), ...sobres], "efectivo", CFG);
    expect(line(r, "sobre-caro").comboUnits).toBe(2);
    expect(line(r, "sobre-medio").comboUnits).toBe(3); // cantidad fraccionada entre líneas: 2 + 3 = 5
    expect(line(r, "sobre-barato").comboUnits).toBe(0);
    expect(r.comboDiscountMinor).toBe(peso(1300) * 2 + peso(1100) * 3);
    expect(r.combo).toMatchObject({ usedSlots: 5, freeSlots: 0 });
  });
  it("el resultado no depende del orden de las líneas en el carrito", () => {
    const a = priceCart([caja(), ...sobres], "efectivo", CFG);
    const b = priceCart([...[...sobres].reverse(), caja()], "efectivo", CFG);
    expect(b.comboDiscountMinor).toBe(a.comboDiscountMinor);
    for (const l of a.lines) expect(line(b, l.productId)).toEqual(l);
  });
  it("a igual precio unitario manda el id del producto (orden estable)", () => {
    const r = priceCart([caja(), sobre("sobre-igual-b", 3, 10000), sobre("sobre-igual-a", 3, 10000)], "efectivo", CFG);
    expect(line(r, "sobre-igual-a").comboUnits).toBe(3);
    expect(line(r, "sobre-igual-b").comboUnits).toBe(2);
  });
  it("la cantidad fraccionada entre líneas de sobres usa exactamente los cupos de las cajas", () => {
    const r = priceCart([caja(), sobre("sobre-caro", 1, 13000), sobre("sobre-medio", 1, 11000), sobre("sobre-barato", 1, 9000), sobre("sobre-igual-a", 1, 8000), sobre("sobre-igual-b", 1, 7000)], "efectivo", CFG);
    expect(r.lines.filter((l) => l.comboUnits > 0).map((l) => l.productId).sort()).toEqual(["sobre-barato", "sobre-caro", "sobre-igual-a", "sobre-igual-b", "sobre-medio"]);
  });
});

describe("participantes: solo lo que el dueño eligió", () => {
  it("un sobre no participante no recibe descuento; una caja no participante no habilita cupos (aunque el pedido califique para las promociones de pago)", () => {
    const r = priceCart([caja(1, "caja-a"), sobre("sobre-no-participa", 3, 9500)], "efectivo", CFG);
    expect(line(r, "sobre-no-participa")).toMatchObject({ comboUnits: 0, comboDiscountMinor: 0 });
    const noCaja = priceCart([caja(1, "caja-c"), sobre("sobre-medio", 3, 9500)], "efectivo", CFG);
    expect(noCaja.combo.boxes).toBe(0);
    expect(noCaja.comboDiscountMinor).toBe(0);
    expect(noCaja.qualifies).toBe(true); // las cajas conservan sus condiciones comerciales actuales (cuotas / transferencia)
  });
  it("apagada (o sin configurar) no descuenta nada; los pesos quedan igual", () => {
    for (const cfg of [COMBO_OFF, { ...CFG, enabled: false }]) {
      const r = priceCart([caja(), sobre("sobre-medio", 5, 9500)], "efectivo", cfg);
      expect(r.comboDiscountMinor).toBe(0);
      expect(r.totalMinor).toBe(r.subtotalMinor);
    }
  });
});

describe("transferencia, cuotas y accesorios", () => {
  it("transferencia: nunca se descuenta dos veces la misma unidad (10% del combo y 10% de transferencia = 10%)", () => {
    const r = priceCart([caja(), sobre("sobre-medio", 5, 9500)], "transferencia", CFG);
    const s = line(r, "sobre-medio");
    expect(s.transferDiscountMinor).toBe(peso(950) * 5);
    expect(s.comboDiscountMinor).toBe(0);
    expect(s.finalTotalMinor).toBe(peso(9500) * 5 - peso(950) * 5); // no 20%
    expect(r.comboDiscountMinor + r.transferDiscountMinor).toBe(peso(18500) + peso(950) * 5); // caja 10% ($18.500) + sobres 10%
  });
  it("transferencia sin combo equivale al descuento de siempre (10% de los productos de un pedido con caja)", () => {
    const sinCombo = priceCart([caja(), sobre("sobre-medio", 5, 9500)], "transferencia", COMBO_OFF);
    const conCombo = priceCart([caja(), sobre("sobre-medio", 5, 9500)], "transferencia", CFG);
    expect(conCombo.totalMinor).toBe(sinCombo.totalMinor);
    expect(sinCombo.transferDiscountMinor).toBe(Math.round(sinCombo.subtotalMinor / 10));
  });
  it("transferencia con más sobres que cupos: todos tienen 10% (por transferencia), sin sumar el combo", () => {
    const r = priceCart([caja(), sobre("sobre-medio", 8, 9500)], "transferencia", CFG);
    expect(r.totalMinor).toBe(r.subtotalMinor - r.transferDiscountMinor);
    expect(r.comboDiscountMinor).toBe(0);
  });
  it("cuotas (o efectivo): rige el combo y no hay descuento de transferencia", () => {
    const r = priceCart([caja(), sobre("sobre-medio", 3, 9500)], "tarjeta-3-cuotas", CFG);
    expect(r.transferDiscountMinor).toBe(0);
    expect(r.comboDiscountMinor).toBe(peso(950) * 3);
  });
  it("los accesorios no habilitan, no reciben el combo ni el 10% por transferencia, y no hacen que el pedido califique", () => {
    const sola = priceCart([acc(SLEEVES_ID, 2, 1000), sobre("sobre-medio", 2, 9500)], "efectivo", CFG);
    expect(sola.qualifies).toBe(false);
    expect(sola.comboDiscountMinor).toBe(0);
    const conCaja = priceCart([caja(), sobre("sobre-medio", 2, 9500), acc(SLEEVES_ID, 2, 1000), acc(TOPLOADERS_ID, 1, 3500)], "transferencia", CFG);
    expect(line(conCaja, SLEEVES_ID)).toMatchObject({ comboUnits: 0, comboDiscountMinor: 0, transferDiscountMinor: 0, finalTotalMinor: peso(2000) });
    expect(line(conCaja, TOPLOADERS_ID).transferDiscountMinor).toBe(0);
  });
  it("una sola regla monetaria: subtotal − descuentos = suma de las líneas (también con precios que redondean)", () => {
    for (const pay of ["efectivo", "transferencia", "tarjeta-3-cuotas"]) {
      const lines = [caja(2, "caja-a", 185055), sobre("sobre-caro", 3, 12345), sobre("sobre-medio", 9, 9999), acc(SLEEVES_ID, 3, 1000)];
      const r = priceCart(lines, pay, CFG);
      expect(r.totalMinor).toBe(r.subtotalMinor - r.comboDiscountMinor - r.transferDiscountMinor);
      expect(r.totalMinor).toBe(r.lines.reduce((n, l) => n + l.finalTotalMinor, 0));
      expect(r.subtotalMinor).toBe(lines.reduce((n, l) => n + l.unitPriceMinor * l.quantity, 0));
      for (const l of r.lines) expect(l.finalTotalMinor).toBe(l.listTotalMinor - l.comboDiscountMinor - l.transferDiscountMinor);
      expect(Number.isInteger(r.totalMinor / 100)).toBe(true); // siempre en pesos enteros
    }
  });
});

describe("evaluateCart: el cálculo sale del catálogo del servidor y no del navegador", () => {
  const products = demoCatalog.products;
  const cfg: ComboConfig = { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "ejemplo-sobre"] };
  it("ignora el precio que manda el cliente: solo avisa que cambió", () => {
    const ev = evaluateCart([{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 1 }, { productId: "storm-sobre", quantity: 2, expectedPriceMinor: 1 }], products, cfg);
    expect(ev.lines.map((l) => l.status)).toEqual(["price_changed", "price_changed"]);
    expect(ev.pricing("efectivo").comboDiscountMinor).toBe(95000 * 2); // con los precios del catálogo ($9.500 → $950 de descuento por sobre)
  });
  it("un producto sin stock, sin precio, retirado o por encargo no entra en el cálculo ni ocupa cupos", () => {
    const ev = evaluateCart([{ productId: "storm-caja", quantity: 1 }, { productId: "parcial-bundle", quantity: 1 }, { productId: "storm-sobre", quantity: 1, mode: "encargo" }, { productId: "no-existe", quantity: 1 }], products, cfg);
    expect(ev.pricingInput.map((l) => l.productId)).toEqual(["storm-caja"]);
    expect(ev.pricing("efectivo").combo.usedSlots).toBe(0);
  });
  it("un accesorio con precio fijo en pesos: $1.000 y $3.500, sin USD", () => {
    const ev = evaluateCart([{ productId: SLEEVES_ID, quantity: 2 }, { productId: TOPLOADERS_ID, quantity: 1 }], products, cfg);
    expect(ev.lines.map((l) => [l.productId, l.status, l.unitPriceMinor, l.product?.priceUsdMinor ?? null])).toEqual([[SLEEVES_ID, "ok", 100000, null], [TOPLOADERS_ID, "ok", 350000, null]]);
    expect(ev.qualifiesForPromo).toBe(false);
    expect(ev.pricing("transferencia").totalMinor).toBe(100000 * 2 + 350000);
  });
});

describe("sugerencias del carrito lateral", () => {
  const products = demoCatalog.products;
  const cfg: ComboConfig = { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "ejemplo-sobre", "parcial-sobre"] };
  const img = () => ({ src: null, alt: "x" });
  const sug = (cart: Array<{ productId: string; quantity: number }>, c = cfg, prods = products) => {
    const ev = evaluateCart(cart, prods, c);
    return buildSuggestions(prods, cart.map((i) => i.productId), ev.pricing("efectivo"), c, img).map((s) => s.productId);
  };
  it("sin protección en el carrito: primero la sleeve; con una caja se intercala un sobre; nunca solo sobres", () => {
    expect(sug([{ productId: "storm-caja", quantity: 1 }])).toEqual([SLEEVES_ID, "ejemplo-sobre", TOPLOADERS_ID]);
    expect(sug([{ productId: "storm-sobre", quantity: 1 }])).toEqual([SLEEVES_ID, TOPLOADERS_ID]); // sin caja participante no se sugieren sobres
  });
  it("no recomienda lo que ya está en el carrito; con sleeve sugiere el top loader y al revés", () => {
    expect(sug([{ productId: "storm-caja", quantity: 1 }, { productId: SLEEVES_ID, quantity: 1 }])).toEqual([TOPLOADERS_ID, "ejemplo-sobre", "parcial-sobre"]);
    expect(sug([{ productId: TOPLOADERS_ID, quantity: 1 }])).toEqual([SLEEVES_ID]);
    expect(sug([{ productId: SLEEVES_ID, quantity: 1 }, { productId: TOPLOADERS_ID, quantity: 1 }])).toEqual([]);
  });
  it("sobres: mayor precio primero, máximo 3 en total, y solo si quedan cupos", () => {
    const completo = sug([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 5 }]); // 5 cupos usados
    expect(completo).toEqual([SLEEVES_ID, TOPLOADERS_ID]);
    const dos = sug([{ productId: "storm-caja", quantity: 1 }, { productId: SLEEVES_ID, quantity: 1 }, { productId: TOPLOADERS_ID, quantity: 1 }]);
    expect(dos).toEqual(["ejemplo-sobre", "parcial-sobre", "storm-sobre"]);
  });
  it("la promoción apagada no sugiere sobres; los accesorios sin stock no se sugieren; el resultado es estable", () => {
    expect(sug([{ productId: "storm-caja", quantity: 1 }], { ...cfg, enabled: false })).toEqual([SLEEVES_ID, TOPLOADERS_ID]);
    const sinStock = products.map((p) => (p.id === SLEEVES_ID ? { ...p, stockQuantity: 0 } : p.id === TOPLOADERS_ID ? { ...p, stockQuantity: null } : p));
    expect(sug([{ productId: "storm-caja", quantity: 1 }], cfg, sinStock)).toEqual(["ejemplo-sobre", "parcial-sobre", "storm-sobre"]);
    const a = sug([{ productId: "storm-caja", quantity: 1 }]);
    expect(sug([{ productId: "storm-caja", quantity: 1 }])).toEqual(a);
  });
  it("el sobre sugerido muestra su precio con 10% OFF; un producto oculto, sin precio o por encargo no se sugiere", () => {
    const ev = evaluateCart([{ productId: "storm-caja", quantity: 1 }], products, cfg);
    const s = buildSuggestions(products, ["storm-caja"], ev.pricing("efectivo"), cfg, img);
    expect(s.find((x) => x.productId === "ejemplo-sobre")).toMatchObject({ priceMinor: 1250000, comboPriceMinor: 1125000 });
    const filtrados = products.map((p) => (p.id === "ejemplo-sobre" ? { ...p, active: false } : p.id === "parcial-sobre" ? { ...p, priceMinor: null } : p.id === "storm-sobre" ? { ...p, orderOnly: true } : p));
    expect(sug([{ productId: "storm-caja", quantity: 1 }], cfg, filtrados)).toEqual([SLEEVES_ID, TOPLOADERS_ID]);
  });
});
