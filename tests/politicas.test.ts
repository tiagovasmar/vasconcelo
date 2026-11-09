import { describe, expect, it } from "vitest";
import { catalog } from "@/content/catalog";
import { encargo, mayorista } from "@/content/politicas";
import { evaluateCart } from "@/features/inquiries/pricing";
import { senaYSaldo } from "@/features/politicas/encargos";
import type { ComboConfig } from "@/features/promos/combo";
import { percentOf, percentOff, roundToPeso } from "@/lib/money";

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
  const combo: ComboConfig = { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre"] };
  it("al quitar la última caja desaparece el descuento del combo", () => {
    const sobre = { productId: "storm-sobre", quantity: 1 };
    const con = evaluateCart([{ productId: "storm-caja", quantity: 1 }, sobre], products, combo);
    const sin = evaluateCart([sobre], products, combo);
    expect(con.pricing.comboDiscountMinor).toBe(95000);
    expect(sin.pricing.comboDiscountMinor).toBe(0);
    expect(sin.pricing.totalMinor).toBe(950000);
  });
  it("una caja agotada, sin precio o consultada por encargo no habilita el combo", () => {
    const caja = { productId: "storm-caja", quantity: 1 };
    const sobre = { productId: "storm-sobre", quantity: 1 };
    const agotada = products.map((p) => p.id === caja.productId ? { ...p, stockQuantity: 0 } : p);
    const pendiente = products.map((p) => p.id === caja.productId ? { ...p, priceMinor: null, stockQuantity: null } : p);
    expect(evaluateCart([caja, sobre], agotada, combo).pricing.combo.slots).toBe(0);
    expect(evaluateCart([caja, sobre], pendiente, combo).pricing.combo.slots).toBe(0);
    expect(evaluateCart([{ ...caja, mode: "encargo" }, sobre], products, combo).pricing.combo.slots).toBe(0);
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
