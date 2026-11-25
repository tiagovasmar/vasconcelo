import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { inquiries, orderPayments, orderTracks } from "@/db/schema";
import { openTestDb } from "./helpers/pg";
import { createManualWholesaleOrder } from "@/features/pedidos/mayorista-manual";
import { adminOrderDetail, customerOrderView, setAgreedAmount, setStage } from "@/features/pedidos/service";
import { confirmPayment, voidPayment } from "@/features/pedidos/pagos";
import { wholesaleReceipts } from "@/features/contabilidad/service";
import { profitReport } from "@/features/costos/service";
import { usdOrderPayment } from "@/features/pedidos/payment-money";
import { senaFor, senaUsdFor } from "@/features/pedidos/etapas";

let db: Db;
const at = Date.UTC(2026, 10, 25, 15);
const actor = { id: "admin", email: "admin@example.test" };
const input = { contactName: "Comercio de prueba", amountUsdMinor: 170600, rateMinor: 157000, note: null,
  lines: [{ productId: "storm-sobre", quantity: 2 }], idempotencyKey: "pedido-usd-deposito-prueba" };
beforeEach(async () => { db = await openTestDb({ max: 2 }); });

describe("cobros de pedidos mayoristas en USD", () => {
  it("guarda la seña con centavos, descuenta el saldo y lo refleja una sola vez en facturación", async () => {
    const { reference } = await createManualWholesaleOrder(db, input, actor, at);
    await setStage(db, reference, { stage: "confirmado_tienda", occurredAt: at, idempotencyKey: "confirmar-pedido-usd-001" }, actor, at);
    const before = (await adminOrderDetail(db, reference))!;
    const body = { kind: "sena", currency: "USD", amountMinor: 17060, method: "efectivo", paidAt: at, idempotencyKey: "pago-usd-deposito-prueba" };
    const [first, repeat] = await Promise.all([confirmPayment(db, reference, body, actor, at), confirmPayment(db, reference, body, actor, at)]);
    expect(first.payment.id).toBe(repeat.payment.id);
    expect(first.payment).toMatchObject({ currency: "USD", amountUsdMinor: 17060, amountMinor: 26784000 });
    expect((await adminOrderDetail(db, reference))?.track?.stage).toBe("sena_confirmada");
    expect((await customerOrderView(db, reference))?.payments).toMatchObject([{ currency: "USD", amountUsdMinor: 17060 }]);
    await expect(confirmPayment(db, reference, { ...body, currency: "ARS", amountMinor: 26784000 }, actor, at)).rejects.toMatchObject({ code: "idempotency_conflict" });
    // Incluso si cambia la referencia de cambio, el total histórico del pedido gobierna el saldo.
    await db.update(inquiries).set({ fxRate10k: 20_000_000 }).where(eq(inquiries.id, reference));
    await confirmPayment(db, reference, { ...body, kind: "saldo", amountMinor: 153540, idempotencyKey: "pago-usd-saldo-prueba-01" }, actor, at + 1);
    expect((await adminOrderDetail(db, reference))?.totals.confirmedMinor).toBe(before.track?.agreedMinor);
    expect((await profitReport(db)).totals).toMatchObject({ billedMinor: 267840000, collectedMinor: 267840000, outstandingMinor: 0 });
    expect((await wholesaleReceipts(db)).rows.map((row) => row.amountUsdMinor).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([17060, 153540]);
    await voidPayment(db, first.payment.id, { reason: "Se cargó una seña duplicada" }, actor, at + 2);
    expect((await wholesaleReceipts(db)).rows).toHaveLength(1);
    expect((await profitReport(db)).totals.outstandingMinor).toBe(26784000);
  });

  it("admite combinar una seña en pesos con el saldo en dólares", async () => {
    const { reference } = await createManualWholesaleOrder(db, { ...input, amountUsdMinor: 10000, rateMinor: 150000 }, actor, at);
    await confirmPayment(db, reference, { kind: "sena", amountMinor: 1500000, method: "transferencia", paidAt: at, idempotencyKey: "pago-ars-sena-mixta-001" }, actor, at);
    await confirmPayment(db, reference, { kind: "saldo", currency: "USD", amountMinor: 9000, method: "efectivo", paidAt: at, idempotencyKey: "pago-usd-saldo-mixto-001" }, actor, at);
    expect((await profitReport(db)).totals).toMatchObject({ collectedMinor: 15000000, outstandingMinor: 0 });
    expect((await db.select().from(orderPayments)).map((payment) => payment.currency).sort()).toEqual(["ARS", "USD"]);
  });

  it("no inventa un cambio para pedidos sin conversión acordada", async () => {
    const { reference } = await createManualWholesaleOrder(db, { ...input, amountUsdMinor: null, rateMinor: null }, actor, at);
    await setAgreedAmount(db, reference, { agreedMinor: 15000000 }, actor, at);
    await db.update(inquiries).set({ fxRate10k: null }).where(eq(inquiries.id, reference));
    await expect(confirmPayment(db, reference, { kind: "sena", currency: "USD", amountMinor: 1000, method: "efectivo", paidAt: at, idempotencyKey: "pago-sin-cambio-usd-001" }, actor, at)).rejects.toMatchObject({ code: "order_rule" });
    expect(await db.select().from(orderPayments)).toEqual([]);
    await db.update(orderTracks).set({ kind: "stock" }).where(eq(orderTracks.inquiryId, reference));
    await expect(confirmPayment(db, reference, { kind: "pago_total", currency: "USD", amountMinor: 10000, method: "efectivo", paidAt: at, idempotencyKey: "pago-stock-no-usd-0001" }, actor, at)).rejects.toMatchObject({ code: "order_rule" });
  });

  it("conserva el total histórico y la seña aun si el precio en pesos se había redondeado", () => {
    const order = { agreedMinor: 267840000, agreedUsdMinor: 170600, rate10k: 15700000 };
    const deposit = senaUsdFor(order.agreedUsdMinor, "mayorista")!;
    const first = usdOrderPayment(deposit, order, 0)!;
    expect(first.amountMinor).toBe(senaFor(order.agreedMinor, "mayorista", order.agreedUsdMinor));
    expect(usdOrderPayment(order.agreedUsdMinor - deposit, order, first.amountMinor)!.amountMinor + first.amountMinor).toBe(order.agreedMinor);
  });
});
