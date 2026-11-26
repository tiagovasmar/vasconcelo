import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { adminRecordArchives, inquirySales, orderTracks, sales } from "@/db/schema";
import { registerSale } from "@/features/sales/service";
import { openTestDb } from "./helpers/pg";
import { isRecordArchived, setRecordArchived } from "@/features/admin/record-archives";
import { createManualWholesaleOrder } from "@/features/pedidos/mayorista-manual";
import { adminOrderDetail, listOrders } from "@/features/pedidos/service";
import { confirmPayment } from "@/features/pedidos/pagos";
import { createPurchase, listPurchases, profitReport } from "@/features/costos/service";
import { incomingProducts } from "@/features/importaciones/service";
import { wholesaleReceipts } from "@/features/contabilidad/service";

let db: Db;
const at = Date.UTC(2026, 10, 25, 15);
const actor = { id: "admin", email: "admin@example.test" };
beforeEach(async () => { db = await openTestDb({ max: 2 }); });

describe("eliminación recuperable de registros administrativos", () => {
  it("quita el mayorista eliminado del resumen y lo recupera al restaurar, conservando los ingresos reales", async () => {
    const { reference } = await createManualWholesaleOrder(db, { contactName: "Comercio de prueba", amountUsdMinor: 10_000, rateMinor: 150_000, note: null,
      lines: [{ productId: "storm-sobre", quantity: 1 }], idempotencyKey: "mayorista-eliminar-prueba" }, actor, at);
    await confirmPayment(db, reference, { kind: "sena", amountMinor: 1_500_000, method: "efectivo", paidAt: at, idempotencyKey: "pago-eliminar-prueba-0001" }, actor, at);
    const report = await profitReport(db);
    const body = { kind: "wholesale", recordId: reference, archived: true };
    expect(await setRecordArchived(db, body, actor, at)).toEqual({ changed: true });
    expect(await setRecordArchived(db, body, actor, at)).toEqual({ changed: false });
    expect(await listOrders(db, { kind: "mayorista" })).toEqual([]);
    expect(await listOrders(db, { kind: "mayorista", archived: true })).toMatchObject([{ reference, confirmedMinor: 1_500_000 }]);
    expect((await adminOrderDetail(db, reference))?.payments).toHaveLength(1);
    expect((await profitReport(db)).totals).toMatchObject({ billedMinor: 0, collectedMinor: 0, outstandingMinor: 0 });
    expect((await profitReport(db)).rows).toEqual([]);
    expect((await wholesaleReceipts(db)).totalMinor).toBe(1_500_000);
    await setRecordArchived(db, { ...body, archived: false }, actor, at + 1);
    expect(await listOrders(db, { kind: "mayorista" })).toMatchObject([{ reference }]);
    expect(await listOrders(db, { archived: true })).toEqual([]);
    expect(await isRecordArchived(db, "wholesale", reference)).toBe(false);
    expect((await profitReport(db)).totals).toEqual(report.totals);
  });

  it("no suma pedidos eliminados sin cobros en ningún canal ni en el gráfico por día", async () => {
    const body = { contactName: "Comercio de prueba", amountUsdMinor: 341100, rateMinor: 167000, note: null,
      lines: [{ productId: "storm-sobre", quantity: 1 }] };
    const active = await createManualWholesaleOrder(db, { ...body, idempotencyKey: "pedido-activo-grafico-001" }, actor, at);
    const deleted = await createManualWholesaleOrder(db, { ...body, idempotencyKey: "pedido-eliminado-grafico-001" }, actor, at);
    await setRecordArchived(db, { kind: "wholesale", recordId: deleted.reference, archived: true }, actor, at);
    for (const channel of ["todos", "mayorista"] as const) {
      const report = await profitReport(db, { from: "2026-11-01", to: "2026-11-30" }, channel);
      expect(report.rows.map((row) => row.ref)).toEqual([active.reference]);
      expect(report.totals).toMatchObject({ billedMinor: 569640000, collectedMinor: 0, outstandingMinor: 569640000 });
    }
  });

  it("también excluye la venta vinculada del resumen sin anularla ni duplicarla al restaurar", async () => {
    const { reference } = await createManualWholesaleOrder(db, { contactName: "Comercio vinculado", amountUsdMinor: 10000, rateMinor: 150000, note: null,
      lines: [{ productId: "storm-sobre", quantity: 1 }], idempotencyKey: "pedido-vinculado-eliminado-001" }, actor, at);
    const { sale } = await registerSale(db, { items: [{ productId: "storm-sobre", quantity: 1, unitPriceMinor: 15000000 }], paymentMethod: "efectivo", soldOn: "2026-11-25", idempotencyKey: "venta-vinculada-eliminada-001" }, actor, { now: at });
    await db.insert(inquirySales).values({ inquiryId: reference, saleId: sale.id, kind: "vinculada", createdAt: at, createdByEmail: actor.email });
    await setRecordArchived(db, { kind: "wholesale", recordId: reference, archived: true }, actor, at);
    for (const channel of ["todos", "mayorista"] as const) expect((await profitReport(db, {}, channel)).rows).toEqual([]);
    expect(await db.select().from(sales).where(eq(sales.id, sale.id))).toMatchObject([{ status: "registrada" }]);
    await setRecordArchived(db, { kind: "wholesale", recordId: reference, archived: false }, actor, at + 1);
    const report = await profitReport(db);
    expect(report.rows.map((row) => row.ref)).toEqual([sale.id]);
    expect(report.totals.billedMinor).toBe(15000000);
  });

  it("oculta y restaura una compra conservando artículos y stock próximo", async () => {
    const { id } = await createPurchase(db, { supplier: "Proveedor de prueba", currency: "ARS", purchasedAt: at,
      items: [{ productId: "storm-sobre", quantity: 4, unitPriceOriginalMinor: 10000 }], idempotencyKey: "compra-eliminar-prueba" }, actor, at, { managedImport: true });
    const before = await incomingProducts(db);
    await setRecordArchived(db, { kind: "purchase", recordId: id, archived: true }, actor, at);
    expect(await listPurchases(db)).toEqual([]);
    expect(await listPurchases(db, undefined, { archived: true })).toMatchObject([{ id, items: [{ quantity: 4 }] }]);
    expect(await listPurchases(db, id)).toMatchObject([{ id, items: [{ quantity: 4 }] }]);
    expect(await incomingProducts(db)).toEqual(before);
    await setRecordArchived(db, { kind: "purchase", recordId: id, archived: false }, actor, at + 1);
    expect(await listPurchases(db)).toMatchObject([{ id }]);
    expect(await listPurchases(db, undefined, { archived: true })).toEqual([]);
  });

  it("rechaza registros inexistentes y tipos ajenos sin crear eliminaciones fantasma", async () => {
    await expect(setRecordArchived(db, { kind: "purchase", recordId: "no-existe", archived: true }, actor, at)).rejects.toMatchObject({ status: 404 });
    const { reference } = await createManualWholesaleOrder(db, { contactName: "Otro comercio", amountUsdMinor: 10_000, rateMinor: 150_000, note: null,
      lines: [{ productId: "storm-sobre", quantity: 1 }], idempotencyKey: "mayorista-tipo-prueba" }, actor, at);
    await db.update(orderTracks).set({ kind: "stock" }).where(eq(orderTracks.inquiryId, reference));
    await expect(setRecordArchived(db, { kind: "wholesale", recordId: reference, archived: true }, actor, at)).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(adminRecordArchives)).toEqual([]);
  });
});
