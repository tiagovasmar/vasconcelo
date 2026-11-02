import { describe, expect, it } from "vitest";
import { catalog } from "@/content/catalog";
import { encargo, mayorista, promo } from "@/content/politicas";
import { evaluateCart } from "@/features/inquiries/pricing";
import { senaYSaldo } from "@/features/politicas/encargos";
import { boxCount, isBoxKind, paymentAllowed, qualifiesForBoxPromo, transferDiscountMinor, type PromoLine } from "@/features/politicas/promociones";
import { percentOf, percentOff, roundToPeso } from "@/lib/money";

const line = (kind: PromoLine["kind"], quantity: number, unitPriceMinor: number): PromoLine => ({ kind, quantity, unitPriceMinor });

describe("promociones minoristas: mínimo de una caja", () => {
  it("la configuración refleja lo confirmado por el dueño", () => {
    expect(promo.minBoxes).toBe(1);
    expect(promo.installments).toBe(3);
    expect(promo.transferDiscountPercent).toBe(10);
    expect(promo.boxKinds).toEqual(["box"]);
  });
  it("una caja sola califica; caja + sobre califica; sobres solos no", () => {
    expect(qualifiesForBoxPromo([line("box", 1, 18500000)])).toBe(true);
    expect(qualifiesForBoxPromo([line("box", 1, 18500000), line("booster", 3, 950000)])).toBe(true);
    expect(qualifiesForBoxPromo([line("booster", 12, 950000)])).toBe(false);
    expect(qualifiesForBoxPromo([])).toBe(false);
    expect(boxCount([line("box", 2, 1), line("booster", 5, 1)])).toBe(2);
  });
  it("kits, bundles, cajas especiales, packs y sets NO cuentan como caja sin una política explícita", () => {
    for (const k of ["kit", "bundle", "special-box", "pack", "illustration-set", "booster"] as const) {
      expect(isBoxKind(k), k).toBe(false);
      expect(qualifiesForBoxPromo([line(k, 1, 100000)]), k).toBe(false);
    }
  });
  it("cuotas y transferencia con descuento solo se pueden elegir si el pedido califica; las demás preferencias siempre", () => {
    for (const id of ["tarjeta-3-cuotas", "transferencia"]) {
      expect(paymentAllowed(id, true)).toBe(true);
      expect(paymentAllowed(id, false)).toBe(false);
    }
    for (const id of ["efectivo"]) {
      expect(paymentAllowed(id, false)).toBe(true);
      expect(paymentAllowed(id, true)).toBe(true);
    }
  });
  it("el 10% se calcula sobre el subtotal de productos del pedido que califica; sin caja o con otro medio de pago es 0", () => {
    const ls = [line("box", 1, 18500000), line("booster", 2, 950000)];
    expect(transferDiscountMinor(ls, "transferencia")).toBe(2040000); // 10% de 20.400.000
    expect(transferDiscountMinor(ls, "tarjeta-3-cuotas")).toBe(0); // cuotas y descuento no se acumulan
    expect(transferDiscountMinor(ls, "efectivo")).toBe(0); // no se extendió al efectivo
    expect(transferDiscountMinor([line("booster", 4, 950000)], "transferencia")).toBe(0);
  });
  it("el alcance es configurable: boxes-only descuenta solo las cajas (sin tocar el envío, que nunca entra)", () => {
    const original = promo.discountScope;
    try {
      (promo as { discountScope: string }).discountScope = "boxes-only";
      expect(transferDiscountMinor([line("box", 1, 18500000), line("booster", 2, 950000)], "transferencia")).toBe(1850000);
    } finally {
      (promo as { discountScope: string }).discountScope = original;
    }
  });
});

describe("criterio monetario único", () => {
  it("redondea al peso entero (mitad hacia arriba) y los porcentajes salen de ahí", () => {
    expect(roundToPeso(12349)).toBe(12300);
    expect(roundToPeso(12350)).toBe(12400);
    expect(percentOf(955500, 10)).toBe(95600); // 95.550 → 95.600 (peso entero)
    expect(percentOff(955500, 10)).toBe(859900);
    expect(percentOf(18500000, 10) % 100).toBe(0);
  });
});

describe("mayorista: lo confirmado y lo que sigue sin definirse", () => {
  it("aprobación manual, recargo de referencia de 50% sobre costo (no un descuento sobre el minorista) y seña del 20%", () => {
    expect(mayorista.approval).toBe("manual");
    expect(mayorista.referenceMarkupOverCostPercent).toBe(50);
    expect(mayorista.senaPercent).toBe(20);
    expect(mayorista).not.toHaveProperty("discountPercent");
    expect(mayorista).not.toHaveProperty("stacksWithTransferDiscount");
  });
});

describe("encargo: seña del 20% sobre el importe cotizado", () => {
  it("20% de seña y 80% de saldo sobre una cotización confirmada", () => {
    expect(encargo.senaPercent).toBe(20);
    expect(senaYSaldo(10000000)).toEqual({ senaMinor: 2000000, saldoMinor: 8000000 });
    expect(senaYSaldo(1234500)).toEqual({ senaMinor: 246900, saldoMinor: 987600 });
    const r = senaYSaldo(7777700)!;
    expect(r.senaMinor + r.saldoMinor).toBe(7777700);
  });
  it("sin cotización (null, 0, negativo o no entero) no calcula nada", () => {
    for (const v of [null, undefined, 0, -100, 100.5]) expect(senaYSaldo(v as number | null | undefined)).toBeNull();
  });
  it("las demás condiciones del encargo siguen sin definirse", () => {
    expect(encargo.plazos).toBeNull();
    expect(encargo.senaReembolsable).toBeNull();
    expect(encargo.vigenciaCotizacion).toBeNull();
    expect(encargo.beneficiosAplican).toBeNull();
  });
});

describe("evaluateCart con promoción y encargos", () => {
  const products = catalog.products;
  it("caja sola, caja + sobre y sobres solos", () => {
    const sola = evaluateCart([{ productId: "storm-caja", quantity: 1 }], products);
    expect(sola.qualifiesForPromo).toBe(true);
    expect(sola.discountFor("transferencia")).toBe(1850000);
    expect(sola.discountFor("tarjeta-3-cuotas")).toBe(0);
    const mixta = evaluateCart([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }], products);
    expect(mixta.qualifiesForPromo).toBe(true);
    expect(mixta.discountFor("transferencia")).toBe(2040000);
    const sobres = evaluateCart([{ productId: "storm-sobre", quantity: 5 }], products);
    expect(sobres.qualifiesForPromo).toBe(false);
    expect(sobres.discountFor("transferencia")).toBe(0);
  });
  it("al quitar la última caja se pierden los beneficios y el resumen se recalcula", () => {
    const con = evaluateCart([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 1 }], products);
    const sin = evaluateCart([{ productId: "storm-sobre", quantity: 1 }], products);
    expect(con.qualifiesForPromo).toBe(true);
    expect(sin.qualifiesForPromo).toBe(false);
    expect(sin.discountFor("transferencia")).toBe(0);
    expect(sin.subtotalMinor).toBe(950000);
  });
  it("una caja agotada, sin precio o consultada por encargo NO habilita la promoción", () => {
    const agotada = products.map((p) => (p.id === "storm-caja" ? { ...p, stockQuantity: 0 } : p));
    expect(evaluateCart([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 1 }], agotada).qualifiesForPromo).toBe(false);
    const pendiente = products.map((p) => (p.id === "storm-caja" ? { ...p, priceMinor: null, stockQuantity: null } : p));
    expect(evaluateCart([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 1 }], pendiente).qualifiesForPromo).toBe(false);
    expect(evaluateCart([{ productId: "storm-caja", quantity: 1, mode: "encargo" }, { productId: "storm-sobre", quantity: 1 }], products).qualifiesForPromo).toBe(false);
  });
  it("un encargo no bloquea, no suma importe y no lleva precio", () => {
    const ev = evaluateCart([{ productId: "storm-sobre", quantity: 3 }, { productId: "storm-caja", quantity: 4, mode: "encargo" }], products);
    expect(ev.blocking).toHaveLength(0);
    expect(ev.subtotalMinor).toBe(2850000);
    const e = ev.lines.find((l) => l.productId === "storm-caja")!;
    expect(e.status).toBe("encargo");
    expect(e.unitPriceMinor).toBeUndefined();
  });
});
