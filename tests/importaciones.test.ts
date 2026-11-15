import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalog } from "@/content/catalog";
import { appliedCosts, costPurchaseItems, importParcels, importReservations, orderTracks, productOverrides, saleLines, stockMovements, user } from "@/db/schema";
import { loadOverrides } from "@/features/catalog/overrides";
import { accountingOverview } from "@/features/contabilidad/service";
import { averageCosts, confirmPurchase, createPurchase, listPurchases } from "@/features/costos/service";
import { preorderOffers, releaseReservation, requestPreorder } from "@/features/importaciones/preorders";
import { addPurchasesToShipment, createImportCustomerSale, receiveShipment, incomingProducts, markOrdered, payPurchase, receiveParcel, releaseDueImportStock, saveDestination, setParcel, setPublication, shippablePurchases } from "@/features/importaciones/service";
import { createShipment, listShipments, scheduleShipmentStock, updateShipmentCosts, updateShipmentCustomsPayment, updateShipmentStatus } from "@/features/pedidos/envios";
import { confirmPayment, uploadReceipt } from "@/features/pedidos/pagos";
import { customerOrderView, lineProgress } from "@/features/pedidos/service";
import { completeScheduledSale, loadSale, registerSale, voidSale } from "@/features/sales/service";
import type { ReceiptStore } from "@/server/receipt-store";
import { openTestDb, type TestDb } from "./helpers/pg";

const actor = { id: "admin", email: "admin@example.test" };
const productId = "storm-sobre";
const item = { productId, quantity: 4, unitPriceOriginalMinor: 10_000 };
const at = Date.now();
const hour = 3_600_000;
const buyer = (id: string) => ({ id, name: `Cliente ${id}` });
const price = 100_000;
let db: TestDb;
let n = 0;
const key = () => `compra-prueba-${String(++n).padStart(8, "0")}`;

beforeEach(async () => {
  db = await openTestDb({ max: 5 });
  n = 0;
  vi.stubEnv("IMPORT_PREORDERS_ENABLED", "1");
  vi.stubEnv("IMPORT_PREORDER_HOLD_HOURS", "1");
  await db.insert(user).values(["ana", "bia", "cami"].map((id) => ({ ...buyer(id), email: `${id}@example.test`, emailVerified: true, createdAt: new Date(at), updatedAt: new Date(at) })));
});
afterEach(() => vi.unstubAllEnvs());

const stock = async () => (await loadOverrides(db)).get(productId)?.stockQuantity ?? catalog.products.find((p) => p.id === productId)!.stockQuantity!;
const purchaseBody = (quantity = 4) => ({
  supplier: "Proveedor ficticio", reference: "REF-01", purchasedAt: at, currency: "ARS", items: [{ ...item, quantity }], idempotencyKey: key(),
  expenses: [{ kind: "envio", amountMinor: 4000, allocation: "unidades" }, { kind: "impuestos", amountMinor: 0, allocation: "valor" }],
});
async function purchase(quantity = 4) {
  const body = purchaseBody(quantity);
  const { id } = await createPurchase(db, body, actor, at, { managedImport: true });
  const [line] = await db.select().from(costPurchaseItems).where(eq(costPurchaseItems.purchaseId, id));
  await markOrdered(db, { purchaseId: id, occurredAt: at });
  return { id, itemId: line.id, body };
}
async function shipment() {
  const sh = await createShipment(db, { label: "Envío ficticio", idempotencyKey: key() }, actor, at);
  return { ...sh, step: (status: string, elapsed = 0) => updateShipmentStatus(db, sh.id, { status, occurredAt: at + elapsed, idempotencyKey: key() }, actor, at + elapsed) };
}
async function offer(quantity: number) {
  const p = await purchase(quantity);
  const a = await saveDestination(db, { itemId: p.itemId, quantity, destination: "reventa" });
  const sh = await shipment();
  await setParcel(db, { allocationId: a.id, shipmentId: sh.id, quantity });
  await setPublication(db, { allocationId: a.id, visibility: "preventa", offerMinor: price });
  await sh.step("enviado_proveedor");
  await sh.step("en_transito");
  const [parcel] = await db.select().from(importParcels).where(eq(importParcels.allocationId, a.id));
  return { ...p, sh, parcel, a };
}
const request = (parcelId: number, id: string, now = at, quantity = 1) => requestPreorder(db, { parcelId, quantity, expectedUnitMinor: price, delivery: { method: "retiro" }, idempotencyKey: key() }, buyer(id), now);
const review = (parcelId: number, accepted: number, expectedRevision = 0, overrides = {}) => ({
  parcelId, accepted, expectedRevision, missing: 0, damaged: 0, reason: "Control de recepción", occurredAt: at + 2 * hour, idempotencyKey: key(), ...overrides,
});
const receiptStore: ReceiptStore = { driver: "local", put: async () => {}, get: async () => null, remove: async () => {} };

describe("Compras e importaciones", () => {
  it("anuncia una compra sola y libera únicamente unidades revisadas a partir de la fecha elegida", async () => {
    const start = await stock();
    const { id } = await createPurchase(db, purchaseBody(3), actor, at, { managedImport: true });
    expect((await incomingProducts(db)).get(productId)?.quantity).toBe(3);
    const sh = await shipment();
    await addPurchasesToShipment(db, { shipmentId: sh.id, purchaseIds: [id] });
    const day = at + 48 * hour;
    const releaseAt = day - 12 * hour;
    await scheduleShipmentStock(db, sh.id, { availableAt: day });
    await sh.step("en_transito", hour);
    expect((await incomingProducts(db, productId, at)).get(productId)).toMatchObject({ quantity: 3, availableAt: releaseAt });
    await sh.step("recibido_argentina", 2 * hour);
    const [parcel] = await db.select().from(importParcels).where(eq(importParcels.shipmentId, sh.id));
    await receiveParcel(db, review(parcel.id, 2, 0, { damaged: 1 }), actor, at + 2 * hour);
    expect(await stock()).toBe(start);
    await releaseDueImportStock(db, releaseAt - 1);
    expect(await stock()).toBe(start);
    expect((await incomingProducts(db, productId, at)).get(productId)?.quantity).toBe(2);
    await Promise.all([releaseDueImportStock(db, releaseAt), releaseDueImportStock(db, releaseAt)]);
    expect(await stock()).toBe(start + 2);
    expect((await incomingProducts(db, productId, releaseAt)).has(productId)).toBe(false);
  });

  it("vende varios artículos de una compra como una sola venta sin tocar stock disponible", async () => {
    const before = await stock();
    await db.insert(productOverrides).values({ productId: "ejemplo-sobre", stockQuantity: null, orderOnly: true, visible: true, updatedAt: at, updatedByEmail: actor.email });

    const purchase = await createPurchase(db, {
      ...purchaseBody(3), items: [{ ...item, quantity: 3 }, { ...item, productId: "ejemplo-sobre", quantity: 2 }],
    }, actor, at, { managedImport: true });
    const items = (await listPurchases(db, purchase.id))[0].items;
    const saleBody = { purchaseId: purchase.id, customerContact: "Cliente de prueba", idempotencyKey: key(),
      items: items.map(({ id }) => ({ itemId: id, quantity: 1, unitPriceMinor: price })) };
    const sale = await createImportCustomerSale(db, saleBody, actor, at);
    expect(await createImportCustomerSale(db, saleBody, actor, at)).toEqual({ id: sale.id, replayed: true });
    expect(await loadSale(db, sale.id)).toMatchObject({ status: "agendada", stockFromImport: true, totalMinor: 2 * price, lines: [{ quantity: 1 }, { quantity: 1 }] });
    expect(await stock()).toBe(before);
    expect((await incomingProducts(db)).get(productId)?.quantity).toBe(2);
    await expect(completeScheduledSale(db, sale.id, { paymentMethod: "efectivo", soldAt: at }, at)).rejects.toThrow(/recepción/i);

    const sh = await shipment();
    await addPurchasesToShipment(db, { shipmentId: sh.id, purchaseIds: [purchase.id] });
    await updateShipmentCosts(db, sh.id, { freightUsdMinor: 1234, freightRateText: "1500", customsMinor: 5000 });
    expect((await listShipments(db))[0]).toMatchObject({ freightUsdMinor: 1234, freightRate10k: 15_000_000, freightMinor: 1_851_000, customsMinor: 5000 });
    await sh.step("en_transito", hour);
    await sh.step("recibido_argentina", 2 * hour);
    expect((await receiveShipment(db, sh.id, actor, at + 2 * hour)).changed).toBe(true);
    expect((await receiveShipment(db, sh.id, actor, at + 2 * hour)).changed).toBe(false);
    expect(await stock()).toBe(before + 2);
    expect((await loadOverrides(db)).get("ejemplo-sobre")?.stockQuantity).toBe(1);
    expect((await loadOverrides(db)).get("ejemplo-sobre")?.orderOnly).toBe(false);
    expect((await completeScheduledSale(db, sale.id, { paymentMethod: "efectivo", soldAt: at + 2 * hour }, at + 2 * hour)).replayed).toBe(false);
    expect(await stock()).toBe(before + 2);
    expect((await voidSale(db, sale.id, "Cliente canceló la compra", actor, at + 2 * hour)).status).toBe("anulada");
    expect(await stock()).toBe(before + 2);
    await releaseDueImportStock(db, at + 2 * hour);
    expect(await stock()).toBe(before + 3);
  });

  it("devuelve a la compra las unidades quitadas de un despacho en preparación", async () => {
    const p = await purchase(2);
    const sh = await shipment();
    await addPurchasesToShipment(db, { shipmentId: sh.id, purchaseIds: [p.id] });
    const [{ allocationId }] = await db.select().from(importParcels).where(eq(importParcels.shipmentId, sh.id));
    await setParcel(db, { shipmentId: sh.id, allocationId, quantity: 0 });
    expect((await listShipments(db))[0].importedUnits).toBe(0);
    expect(await shippablePurchases(db)).toEqual([expect.objectContaining({ id: p.id, quantity: 2 })]);
    expect((await listPurchases(db, p.id))[0].items[0].quantity).toBe(2);
  });

  it("reparte el envío y la aduana del despacho entre compras sin duplicar gastos anteriores", async () => {
    const first = await purchase(2);
    const second = await purchase(3);
    const sh = await shipment();
    await addPurchasesToShipment(db, { shipmentId: sh.id, purchaseIds: [first.id, second.id] });
    await updateShipmentCosts(db, sh.id, { freightMinor: 6000, customsMinor: 4000 });
    await expect(confirmPurchase(db, first.id, actor)).rejects.toThrow(/despacho/);
    await sh.step("en_transito", hour);
    await confirmPurchase(db, first.id, actor);
    await confirmPurchase(db, second.id, actor);
    const [a] = await listPurchases(db, first.id);
    const [b] = await listPurchases(db, second.id);
    expect(a.items[0].totalCostMinor).toBe(24000);
    expect(b.items[0].totalCostMinor).toBe(36000);
    await expect(updateShipmentCosts(db, sh.id, { freightMinor: 1, customsMinor: 2 })).rejects.toThrow(/costos cerrados/);
  });

  it("guarda y corrige el pago de aduana del envío sin cambiar su fecha de despacho", async () => {
    const p = await purchase(2);
    const sh = await shipment();
    await addPurchasesToShipment(db, { shipmentId: sh.id, purchaseIds: [p.id] });
    await sh.step("en_transito", hour);
    await updateShipmentCustomsPayment(db, sh.id, { customsPaidAt: at + 2 * hour });
    const [saved] = await listShipments(db);
    expect(saved).toMatchObject({ status: "en_transito", transitAt: at + hour, customsPaidAt: at + 2 * hour });
    await sh.step("recibido_argentina", 3 * hour);
    await updateShipmentCustomsPayment(db, sh.id, { customsPaidAt: null });
    const [updated] = await listShipments(db);
    expect(updated).toMatchObject({ status: "recibido_argentina", transitAt: at + hour, customsPaidAt: null });
  });

  it("agrupa compras de fechas distintas y reparte la diferencia pagada en USD", async () => {
    const olderDate = at - 24 * hour;
    const firstBody = { ...purchaseBody(2), purchasedAt: olderDate,
      currency: "RMB", rmbPerUsd10k: 62_500, usdToArs10k: 12_500_000, rateToArs10k: 2_000_000, paidUsdMinor: 3500 };
    const first = await createPurchase(db, firstBody, actor, at, { managedImport: true });
    const second = await purchase(3);
    const personal = await saveDestination(db, { itemId: second.itemId, destination: "personal", quantity: 1 });
    const sh = await shipment();
    const other = await shipment();
    await setParcel(db, { shipmentId: other.id, allocationId: personal.id, quantity: 1 });

    const selected = { shipmentId: sh.id, purchaseIds: [first.id, second.id] };
    expect(await addPurchasesToShipment(db, selected)).toEqual({ replayed: false, quantity: 4 });
    expect(await addPurchasesToShipment(db, selected)).toEqual({ replayed: true, quantity: 0 });
    expect(await shippablePurchases(db)).toEqual([]);
    const summary = (await listShipments(db)).find((s) => s.id === sh.id)!;
    expect(summary.purchases).toEqual([
      expect.objectContaining({ purchaseId: first.id, date: olderDate, quantity: 2 }),
      expect.objectContaining({ purchaseId: second.id, date: at, quantity: 2 }),
    ]);
    const [saved] = await listPurchases(db, first.id);
    expect(saved.paidUsdMinor).toBe(3500);
    expect(saved.expenses).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "comisiones_compra", amountMinor: 375_000, allocation: "valor" })]));
    await confirmPurchase(db, first.id, actor);
    const [closed] = await listPurchases(db, first.id);
    expect(closed.items[0].finalUnitCostMinor).toBe(2_189_500);
    await expect(sh.step("enviado_proveedor", -hour)).rejects.toThrow(/anterior/);
  });

  it("valida destinos concurrentes, conserva cotización y distingue gastos pendientes de cero", async () => {
    const { id, itemId, body } = await purchase();
    const outcomes = await Promise.allSettled([
      saveDestination(db, { itemId, quantity: 3, destination: "reventa" }),
      saveDestination(db, { itemId, quantity: 3, destination: "personal" }),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const winner = outcomes[0].status === "fulfilled" ? "reventa" : "personal";
    await saveDestination(db, { itemId, quantity: 1, destination: winner === "personal" ? "reventa" : "personal" });
    const edit = { ...body, currency: "RMB", rateToArs10k: 123_456, expenses: [{ kind: "envio", amountMinor: null, allocation: "valor", certainty: "pendiente" }, body.expenses[1]] };
    await createPurchase(db, edit, actor, at, { editId: id });
    await expect(confirmPurchase(db, id, actor)).rejects.toThrow(/pendientes/);
    await createPurchase(db, { ...edit, expenses: body.expenses }, actor, at, { editId: id });
    await confirmPurchase(db, id, actor);
    const [saved] = await db.select().from(costPurchaseItems).where(eq(costPurchaseItems.id, itemId));
    expect(saved.commercialQuantity).toBe(winner === "reventa" ? 3 : 1);
    expect((await averageCosts(db, [productId])).get(productId)).toBe(124_456);
    await expect(createPurchase(db, body, actor, at, { editId: id })).rejects.toThrow(/cerró/);
  });

  it("recibe en partes, acredita solo reventa y no toca la venta previamente descontada", async () => {
    const historical = await createPurchase(db, purchaseBody(1), actor);
    await confirmPurchase(db, historical.id, actor);
    const start = await stock();
    const { sale } = await registerSale(db, { items: [{ productId, quantity: 1, unitPriceMinor: price }], paymentMethod: "efectivo", idempotencyKey: key() }, actor);
    const [sold] = await db.select().from(saleLines).where(eq(saleLines.saleId, sale.id));
    const [snapshot] = await db.select().from(appliedCosts).where(eq(appliedCosts.refId, sold.id));
    const p = await purchase(5);
    const soldDest = await saveDestination(db, { itemId: p.itemId, quantity: 1, destination: "vendido", saleLineId: sold.id });
    const personal = await saveDestination(db, { itemId: p.itemId, quantity: 1, destination: "personal" });
    const free = await saveDestination(db, { itemId: p.itemId, quantity: 3, destination: "reventa" });
    const sh = await shipment();
    const sh2 = await shipment();
    await setPublication(db, { allocationId: free.id, visibility: "proximamente" });
    for (const [allocationId, quantity] of [[soldDest.id, 1], [personal.id, 1], [free.id, 2]]) await setParcel(db, { shipmentId: sh.id, allocationId, quantity });
    await setParcel(db, { shipmentId: sh2.id, allocationId: free.id, quantity: 1 });
    await expect(setParcel(db, { shipmentId: sh2.id, allocationId: free.id, quantity: 2 })).rejects.toThrow(/superan/);
    expect((await incomingProducts(db)).get(productId)?.quantity).toBe(3);
    expect(await stock()).toBe(start - 1);
    await sh.step("recibido_argentina");
    const parcels = await db.select().from(importParcels).where(eq(importParcels.shipmentId, sh.id));
    const freeId = parcels.find((r) => r.allocationId === free.id)!.id;
    const first = review(freeId, 1);
    const replay = await Promise.all([receiveParcel(db, first, actor), receiveParcel(db, first, actor)]);
    expect(replay.map((r) => r.replayed).sort()).toEqual([false, true]);
    await expect(receiveParcel(db, review(freeId, 2), actor)).rejects.toThrow(/otra recepción/);
    expect(await stock()).toBe(start);
    for (const r of parcels.filter((r) => r.id !== freeId)) await receiveParcel(db, review(r.id, 1), actor);
    expect(await stock()).toBe(start);
    await receiveParcel(db, review(freeId, 0, 1, { damaged: 1 }), actor);
    expect(await stock()).toBe(start - 1);
    expect((await db.select().from(stockMovements)).map((m) => m.delta)).toEqual([-1, 1, -1]);
    await confirmPurchase(db, p.id, actor);
    expect((await db.select().from(appliedCosts).where(eq(appliedCosts.refId, sold.id)))[0]).toEqual(snapshot);
    const pay = { purchaseId: p.id, spentAt: at, amountMinor: 17_000, description: "Pago de prueba", paymentMethod: "transferencia", idempotencyKey: key() };
    await Promise.all([payPurchase(db, pay, actor), payPurchase(db, pay, actor)]);
    expect((await accountingOverview(db)).spent).toBe(17_000);
  });

  it("serializa reservas, libera un abandono y rechaza comprobantes después del vencimiento", async () => {
    const { parcel } = await offer(1);
    const initial = await stock();
    expect(await preorderOffers(db, productId, at)).toHaveLength(1);
    const results = await Promise.allSettled([request(parcel.id, "ana"), request(parcel.id, "bia")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const winner = results.find((r) => r.status === "fulfilled")!;
    const ref = winner.value.reference;
    expect(await preorderOffers(db, productId, at)).toEqual([]);
    expect(await stock()).toBe(initial);
    vi.stubEnv("IMPORT_PREORDERS_ENABLED", "0");
    await expect(request(parcel.id, "cami", at + hour + 1)).rejects.toThrow(/habilitada/);
    vi.stubEnv("IMPORT_PREORDERS_ENABLED", "1");
    const proof = { inquiryId: ref, viewer: { kind: "cuenta" as const }, file: Buffer.from("%PDF-1.4 prueba") };
    await expect(uploadReceipt(db, receiptStore, proof, at + hour + 1)).rejects.toThrow(/venció/);
    const next = await request(parcel.id, "cami", at + hour + 1);
    expect(next.reference).not.toBe(ref);
    expect((await db.select().from(importReservations).where(eq(importReservations.inquiryId, ref)))[0].releasedAt).toBe(at + hour + 1);
    expect((await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, ref)))[0].cancelledAt).toBe(at + hour + 1);
  });

  it("retiene con comprobante en revisión, confirma con seña y respeta la recepción parcial del encargo", async () => {
    const { parcel, sh } = await offer(2);
    const initial = await stock();
    const { reference } = await request(parcel.id, "ana", at, 2);
    expect((await customerOrderView(db, reference))?.preorder?.status).toBe("retenida");
    const receipt = await uploadReceipt(db, receiptStore, { inquiryId: reference, viewer: { kind: "cuenta", userId: "ana" }, file: Buffer.from("%PDF-1.4 prueba") }, at + 100);
    await expect(releaseReservation(db, reference, at + 2 * hour)).rejects.toThrow(/activa/);
    const [hold] = await db.select().from(importReservations).where(eq(importReservations.inquiryId, reference));
    await sh.step("recibido_argentina", 2 * hour);
    await expect(receiveParcel(db, review(hold.heldParcelId!, 1), actor, at + 2 * hour)).rejects.toThrow(/seña/);
    await confirmPayment(db, reference, { kind: "sena", amountMinor: 40_000, method: "transferencia", paidAt: at + 100, receiptId: receipt.id, idempotencyKey: key() }, actor, at + 2 * hour);
    await receiveParcel(db, review(hold.heldParcelId!, 1), actor, at + 2 * hour);
    expect((await lineProgress(db, reference))[0]).toMatchObject({ arrived: 1, inTransit: 1, deliverable: 1 });
    expect((await customerOrderView(db, reference))?.stage).toBe("en_transito");
    await receiveParcel(db, review(hold.heldParcelId!, 2, 1), actor, at + 2 * hour);
    expect((await customerOrderView(db, reference))).toMatchObject({ stage: "recibido_argentina", preorder: { status: "confirmada" } });
    expect(await stock()).toBe(initial);
  });
});
