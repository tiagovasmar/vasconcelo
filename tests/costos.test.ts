import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { appliedCosts, costExpenseShares, costPurchaseItems, saleLines } from "@/db/schema";
import { addCommission, allocateProportional, applyLineCost, averageCosts, confirmPurchase, createPurchase, itemBaseCostMinor, listPurchases, profitReport } from "@/features/costos/service";
import { registerSale, SaleError } from "@/features/sales/service";
import { suggestedFromCost } from "@/features/mayorista/precios";
import { listProductCosts, saveProductCost } from "@/features/costos/product-costs";
import type { EffectiveRate } from "@/features/fx/convert";

/**
 * Costos privados: compras, reparto verificable de gastos, costo histórico por venta, «Costo pendiente» y ganancia.
 * Catálogo de prueba: storm-sobre (stock 24), ejemplo-sobre (40), storm-caja (3).
 */
let db: Db;
const actor = { id: "admin-1", email: "dueno@example.com" };
const FX: EffectiveRate = { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false };
let n = 0;
const key = () => `clave-costos-${String(++n).padStart(10, "0")}`;
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof SaleError) return e.code; throw e; } throw new Error("se esperaba un error"); };
const T = Date.UTC(2026, 10, 2, 12);

const compra = (over: Record<string, unknown> = {}) => ({
  supplier: "Proveedor de prueba", purchasedAt: T, currency: "RMB", rateToArs10k: 2_000_000, // 1 RMB = $200
  items: [{ productId: "storm-sobre", quantity: 10, unitPriceOriginalMinor: 1250 }, { productId: "ejemplo-sobre", quantity: 30, unitPriceOriginalMinor: 800 }], // 12,50 y 8,00 RMB
  expenses: [{ kind: "envio", amountMinor: 100_000, allocation: "unidades" }, { kind: "impuestos", amountMinor: 33_333, allocation: "valor" }],
  idempotencyKey: key(), ...over,
});

beforeEach(async () => {
  db = await openTestDb({ max: 4 });
  n = 0;
});

describe("reparto de gastos compartidos", () => {
  it("siempre suma EXACTO el gasto y es determinista (mayor resto, desempate por orden)", () => {
    expect(allocateProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    for (const [total, w] of [[99_999, [3, 7, 11]], [1, [5, 5]], [0, [1, 2]], [1_000_003, [13, 1, 1, 400]]] as Array<[number, number[]]>) {
      expect(allocateProportional(total, w).reduce((a, b) => a + b, 0)).toBe(total);
    }
    expect(() => allocateProportional(10, [0, 0])).toThrow(SaleError); // sin base no hay reparto silencioso
  });
  it("el costo base es exacto: precio original × cantidad × cotización", () => {
    expect(itemBaseCostMinor({ currency: "RMB", rateToArs10k: 2_000_000 }, 1250, 10)).toBe(2_500_000);
    expect(itemBaseCostMinor({ currency: "ARS", rateToArs10k: null }, 1250, 10)).toBe(12_500);
    expect(itemBaseCostMinor({ currency: "USD", rateToArs10k: 12_345_000 }, 333, 3)).toBe(1_233_266); // 333×3×1234,5 = 1.233.265,5 → mitad hacia arriba
  });
});

describe("compras: borrador, confirmación y costo final por unidad", () => {
  it("calcula y congela el reparto fila por fila; confirmar dos veces no recalcula", async () => {
    const { id } = await createPurchase(db, compra(), actor, T);
    const before = (await listPurchases(db))[0];
    expect(before.status).toBe("borrador");
    expect(before.items.every((i) => i.finalUnitCostMinor === null)).toBe(true); // nada está calculado hasta confirmar
    expect(await confirmPurchase(db, id, actor, T + 1)).toEqual({ changed: true });
    expect(await confirmPurchase(db, id, actor, T + 2)).toEqual({ changed: false });
    const p = (await listPurchases(db))[0];
    const [a, b] = p.items;
    // Base: A = 10 × 12,50 × 200 = $25.000; B = 30 × 8 × 200 = $48.000.
    // Envío $1.000 por unidades (10/40, 30/40): 250,00 y 750,00. Impuestos $333,33 por valor (25/73, 48/73).
    expect(p.expenses[0].shares.map((s) => s.shareMinor).sort((x, y) => x - y)).toEqual([25_000, 75_000]);
    const impuestos = p.expenses[1].shares.map((s) => s.shareMinor);
    expect(impuestos.reduce((x, y) => x + y, 0)).toBe(33_333);
    expect(a.allocatedExpensesMinor).toBe(25_000 + impuestos[0]);
    expect(a.totalCostMinor).toBe(2_500_000 + a.allocatedExpensesMinor!);
    expect(a.finalUnitCostMinor).toBe(Math.round(a.totalCostMinor! / 10));
    expect(b.totalCostMinor! + a.totalCostMinor!).toBe(2_500_000 + 4_800_000 + 100_000 + 33_333); // nada se pierde ni se inventa
    expect((await db.select().from(costExpenseShares))).toHaveLength(4);
  });

  it("reparto manual: debe sumar el gasto; moneda extranjera exige cotización; productos inexistentes se rechazan", async () => {
    expect(await code(createPurchase(db, compra({ expenses: [{ kind: "envio", amountMinor: 1000, allocation: "manual", manual: { "0": 400, "1": 500 } }] }), actor))).toBe("invalid_input");
    expect(await code(createPurchase(db, compra({ rateToArs10k: null }), actor))).toBe("invalid_input");
    expect(await code(createPurchase(db, compra({ items: [{ productId: "no-existe", quantity: 1, unitPriceOriginalMinor: 100 }] }), actor))).toBe("invalid_input");
    const ok = await createPurchase(db, compra({ expenses: [{ kind: "envio", amountMinor: 1000, allocation: "manual", manual: { "0": 400, "1": 600 } }] }), actor, T);
    await confirmPurchase(db, ok.id, actor, T);
    expect((await listPurchases(db))[0].expenses[0].shares.map((s) => s.shareMinor).sort()).toEqual([400, 600]);
  });

  it("crear dos veces con la misma clave devuelve la misma compra", async () => {
    const body = compra();
    const [a, b] = await Promise.all([createPurchase(db, body, actor, T), createPurchase(db, body, actor, T)]);
    expect(a.id).toBe(b.id);
    expect((await listPurchases(db))).toHaveLength(1);
    expect((await db.select().from(costPurchaseItems))).toHaveLength(2);
  });

  it("el costo promedio ponderado usa solo compras CONFIRMADAS", async () => {
    const a = await createPurchase(db, compra({ items: [{ productId: "storm-sobre", quantity: 10, unitPriceOriginalMinor: 1000 }], expenses: [] }), actor, T); // 10 × $2.000
    const b = await createPurchase(db, compra({ items: [{ productId: "storm-sobre", quantity: 30, unitPriceOriginalMinor: 2000 }], expenses: [] }), actor, T); // 30 × $4.000
    expect((await averageCosts(db, ["storm-sobre"])).size).toBe(0); // nada confirmado: costo pendiente
    await confirmPurchase(db, a.id, actor, T);
    expect((await averageCosts(db, ["storm-sobre"])).get("storm-sobre")).toBe(200_000);
    await confirmPurchase(db, b.id, actor, T);
    expect((await averageCosts(db, ["storm-sobre"])).get("storm-sobre")).toBe(350_000); // (10×2000 + 30×4000)/40 = $3.500
  });
});

describe("costo histórico por venta y ganancia", () => {
  const vender = (productId: string, qty: number, price: number, over: Record<string, unknown> = {}) =>
    registerSale(db, { items: [{ productId, quantity: qty, unitPriceMinor: price * 100 }], paymentMethod: "efectivo", idempotencyKey: key(), ...over }, actor, { fx: FX, now: T });

  it("usa la referencia en USD como respaldo, congela el importe y mantiene prioridad para las compras confirmadas", async () => {
    const input = { productId: "storm-sobre", currency: "USD", amountMinor: 321, expectedVersion: 0 };
    await saveProductCost(db, input, actor.email);
    const { sale } = await vender(input.productId, 2, 6000);
    expect((await db.select().from(appliedCosts))[0]).toMatchObject({ basis: "referencia_producto", unitCostMinor: 396_114 });
    const entry = (await listProductCosts(db, [input.productId])).get(input.productId)!;
    await saveProductCost(db, { ...input, amountMinor: 500, expectedVersion: entry.version }, actor.email);
    expect(await code(saveProductCost(db, input, actor.email))).toBe("stale");
    const purchase = await createPurchase(db, compra({ items: [{ productId: input.productId, quantity: 10, unitPriceOriginalMinor: 1000 }], expenses: [] }), actor, T);
    await confirmPurchase(db, purchase.id, actor, T);
    const next = await vender(input.productId, 1, 6000);
    const report = await profitReport(db);
    expect(report.rows.find((r) => r.ref === sale.id)?.costMinor).toBe(792_228);
    expect(report.rows.find((r) => r.ref === next.sale.id)?.costMinor).toBe(200_000);
  });

  it("congela el costo al vender: una reposición posterior más cara no modifica la ganancia anterior", async () => {
    const c1 = await createPurchase(db, compra({ items: [{ productId: "storm-sobre", quantity: 10, unitPriceOriginalMinor: 1000 }], expenses: [] }), actor, T); // $2.000 c/u
    await confirmPurchase(db, c1.id, actor, T);
    const { sale } = await vender("storm-sobre", 2, 5000);
    const r1 = await profitReport(db);
    expect(r1.rows[0]).toMatchObject({ ref: sale.id, revenueMinor: 1_000_000, costMinor: 400_000, costPending: false, profitMinor: 600_000 });
    // Reposición mucho más cara + cambio de cotización: la venta vieja no cambia; la nueva usa el promedio nuevo.
    const c2 = await createPurchase(db, compra({ rateToArs10k: 9_000_000, items: [{ productId: "storm-sobre", quantity: 10, unitPriceOriginalMinor: 1000 }], expenses: [] }), actor, T + 5); // $9.000 c/u
    await confirmPurchase(db, c2.id, actor, T + 5);
    const r2 = await profitReport(db);
    expect(r2.rows.find((r) => r.ref === sale.id)).toMatchObject({ costMinor: 400_000, profitMinor: 600_000 });
    const nueva = await vender("storm-sobre", 1, 8000);
    expect((await profitReport(db)).rows.find((r) => r.ref === nueva.sale.id)!.costMinor).toBe(550_000); // promedio (10×2000+10×9000)/20
    expect((await db.select().from(appliedCosts))).toHaveLength(2);
  });

  it("un producto sin costo conocido figura «Costo pendiente», no cero; se completa una sola vez y queda inmutable", async () => {
    const { sale } = await vender("ejemplo-sobre", 3, 4000);
    const row = (await profitReport(db)).rows[0];
    expect(row).toMatchObject({ ref: sale.id, costMinor: null, costPending: true, profitMinor: null });
    const rep = await profitReport(db);
    expect(rep.totals.pendingCostRows).toBe(1);
    expect(rep.totals.profitMinor).toBe(0); // la ganancia total NO cuenta lo pendiente como si costara cero
    expect(await code(applyLineCost(db, { refKind: "sale_line", refId: (await db.select().from(saleLines))[0].id }, actor))).toBe("order_rule"); // sin compras: no inventa un costo
    const lineId = (await db.select().from(saleLines))[0].id;
    expect(await applyLineCost(db, { refKind: "sale_line", refId: lineId, unitCostMinor: 150_000 }, actor, T)).toMatchObject({ unitCostMinor: 150_000, basis: "manual", changed: true });
    expect(await applyLineCost(db, { refKind: "sale_line", refId: lineId, unitCostMinor: 999_999 }, actor, T)).toMatchObject({ unitCostMinor: 150_000, changed: false }); // no se reescribe
    expect((await profitReport(db)).rows[0]).toMatchObject({ costMinor: 450_000, profitMinor: 1_200_000 - 450_000 });
  });

  it("separa facturación, dinero cobrado y ganancia; las comisiones restan; descuentos visibles; anuladas no cuentan", async () => {
    const c = await createPurchase(db, compra({ items: [{ productId: "storm-sobre", quantity: 10, unitPriceOriginalMinor: 1000 }], expenses: [] }), actor, T);
    await confirmPurchase(db, c.id, actor, T);
    const { sale } = await registerSale(db, { items: [{ productId: "storm-sobre", quantity: 2, unitPriceMinor: 500_000, discountMinor: 100_000 }], paymentMethod: "transferencia", idempotencyKey: key() }, actor, { fx: FX, now: T });
    await addCommission(db, { saleId: sale.id, amountMinor: 30_000, note: "Cobro", idempotencyKey: "comision-1-aaaaaaaaaa" }, actor, T);
    expect((await addCommission(db, { saleId: sale.id, amountMinor: 30_000, idempotencyKey: "comision-1-aaaaaaaaaa" }, actor, T)).replayed).toBe(true); // no se duplica
    const rep = await profitReport(db);
    expect(rep.rows[0]).toMatchObject({ revenueMinor: 900_000, grossMinor: 1_000_000, discountMinor: 100_000, costMinor: 400_000, commissionMinor: 30_000, profitMinor: 470_000, collectedMinor: 900_000 });
    expect(rep.totals).toMatchObject({ billedMinor: 900_000, collectedMinor: 900_000, outstandingMinor: 0, profitMinor: 470_000 });
  });
});

describe("referencia mayorista: costo × 1,5", () => {
  it("es un recargo del 50% sobre el costo (no un margen sobre la venta ni un descuento sobre el minorista) y sin costo no hay sugerencia", () => {
    expect(suggestedFromCost(200_000)).toBe(300_000);
    expect(suggestedFromCost(333_333)).toBe(500_000); // 499.999,5 → mitad hacia arriba
    expect(suggestedFromCost(null)).toBeNull();
    expect(suggestedFromCost(0)).toBeNull();
  });
});

void eq;
