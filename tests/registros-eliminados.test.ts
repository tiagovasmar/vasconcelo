import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { adminRecordArchives, orderTracks } from "@/db/schema";
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
  it("oculta y restaura un mayorista con seña sin borrar pagos ni cambiar facturación", async () => {
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
    expect((await profitReport(db)).totals).toEqual(report.totals);
    expect((await wholesaleReceipts(db)).totalMinor).toBe(1_500_000);
    await setRecordArchived(db, { ...body, archived: false }, actor, at + 1);
    expect(await listOrders(db, { kind: "mayorista" })).toMatchObject([{ reference }]);
    expect(await listOrders(db, { archived: true })).toEqual([]);
    expect(await isRecordArchived(db, "wholesale", reference)).toBe(false);
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
