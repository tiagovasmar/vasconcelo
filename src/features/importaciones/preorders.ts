import { DeliverySchema } from "@/features/inquiries/schemas";
import { and, eq, inArray, isNull, lt, not, sql } from "drizzle-orm";
import { z } from "zod";
import { catalog } from "@/content/catalog";
import type { Db } from "@/db/client";
import { lockKey, type Tx } from "@/db/lock";
import { costPurchaseItems, costPurchases, importAllocations, importParcels, importReservations, inquiries, inquiryEvents, inquiryLines, orderEvents, orderTracks, productOverrides, shipments } from "@/db/schema";
import { advanceFromFacts, ensureTrack, newId, sha, trackLock } from "@/features/pedidos/service";
import { SHIPPING_STAGES, type Stage } from "@/features/pedidos/etapas";
import { SaleError } from "@/features/sales/errors";
import { holdState, paymentEvidence, preorderHours } from "./hold-state";

const activeShipment = ["enviado_proveedor", "recibido_origen", "en_transito"];
const conflict = (text: string): never => { throw new SaleError(409, "order_rule", text); };
const Request = z.object({
  parcelId: z.number().int().positive(), quantity: z.number().int().min(1).max(20),
  delivery: DeliverySchema,
  expectedUnitMinor: z.number().int().positive(), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

function source(q: Db | Tx) {
  return q.select({ parcel: importParcels, a: importAllocations, item: costPurchaseItems, p: costPurchases, sh: shipments })
    .from(importParcels).innerJoin(importAllocations, eq(importParcels.allocationId, importAllocations.id))
    .innerJoin(costPurchaseItems, eq(importAllocations.itemId, costPurchaseItems.id))
    .innerJoin(costPurchases, eq(costPurchaseItems.purchaseId, costPurchases.id))
    .innerJoin(shipments, eq(importParcels.shipmentId, shipments.id));
}

const expiredFilter = (now: number) => and(isNull(importReservations.releasedAt), lt(importReservations.expiresAt, now + 1), not(paymentEvidence(importReservations.inquiryId)));

export async function preorderOffers(db: Db, productId: string, now = Date.now()) {
  const hours = preorderHours();
  if (!hours) return [];
  const rows = await source(db).where(and(eq(costPurchaseItems.productId, productId), eq(importAllocations.visibility, "preventa"), eq(importAllocations.destination, "reventa"), inArray(shipments.status, activeShipment)));
  const expired = await db.select({ parcelId: importReservations.sourceParcelId, quantity: sql<number>`sum(${importReservations.quantity})::int` })
    .from(importReservations).where(and(inArray(importReservations.sourceParcelId, rows.map((r) => r.parcel.id)), expiredFilter(now))).groupBy(importReservations.sourceParcelId);
  return rows.flatMap(({ parcel, a }) => {
    const quantity = parcel.quantity + (expired.find((e) => e.parcelId === parcel.id)?.quantity ?? 0);
    return quantity > 0 && a.offerMinor && a.offerMinor >= 50_000 && a.offerMinor % 500 === 0
      ? [{ parcelId: parcel.id, quantity, unitMinor: a.offerMinor, hours }]
      : [];
  });
}

/** Se llama con envío y compra bloqueados. El bloqueo del pedido arbitra el vencimiento frente a un comprobante simultáneo. */
async function release(tx: Tx, inquiryId: string, now: number, allowCancelled: boolean) {
  await trackLock(tx, inquiryId);
  const [r] = await tx.select().from(importReservations).where(eq(importReservations.inquiryId, inquiryId));
  if (!r?.heldParcelId || r.releasedAt) return false;
  const state = await holdState(tx, inquiryId, now);
  const [track] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId));
  if (!state?.expired && !(allowCancelled && track.cancelledAt)) return false;
  const [held] = await tx.select().from(importParcels).where(eq(importParcels.id, r.heldParcelId));
  if (held.revision) return false;
  const [free] = await tx.select().from(importParcels).where(eq(importParcels.id, r.sourceParcelId));
  // Incrementar revisión invalida un formulario de recepción abierto con el cupo anterior.
  await tx.update(importParcels).set({ quantity: free.quantity + r.quantity, revision: free.revision + 1 }).where(eq(importParcels.id, free.id));
  await tx.update(importAllocations).set({ quantity: sql`${importAllocations.quantity} + ${r.quantity}` }).where(eq(importAllocations.id, free.allocationId));
  await tx.update(importReservations).set({ heldParcelId: null, releasedAt: now }).where(eq(importReservations.inquiryId, inquiryId));
  await tx.delete(importParcels).where(eq(importParcels.id, held.id));
  await tx.delete(importAllocations).where(eq(importAllocations.id, held.allocationId));
  if (!track.cancelledAt) {
    await tx.update(orderTracks).set({ cancelledAt: now, updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
  }
  await tx.insert(orderEvents).values({ inquiryId, kind: "note", publicText: "Las unidades de preventa se liberaron.", occurredAt: now, createdAt: now });
  return true;
}

export async function releaseReservation(db: Db, inquiryId: string, now = Date.now()) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(importReservations).where(eq(importReservations.inquiryId, inquiryId));
    if (!r) return conflict("La reserva no existe.");
    const [row] = await source(tx).where(eq(importParcels.id, r.sourceParcelId));
    await lockKey(tx, `shipment:${row.sh.id}`);
    await lockKey(tx, `cost-purchase:${row.p.id}`);
    if (!await release(tx, inquiryId, now, true)) return conflict("La retención sigue activa o su recepción ya fue revisada.");
    return { changed: true };
  });
}

export async function requestPreorder(db: Db, body: unknown, customer: { id: string; name: string }, now = Date.now()) {
  const parsed = Request.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Revisá la cantidad y el precio confirmado.");
  const v = parsed.data;
  const idempotencyKey = "preventa-" + sha(v.idempotencyKey).slice(0, 40);
  const contentHash = sha(JSON.stringify([v.parcelId, v.quantity, v.expectedUnitMinor, v.delivery]));
  return db.transaction(async (tx) => {
    await lockKey(tx, `preorder-request:${idempotencyKey}`);
    const [previous] = await tx.select().from(inquiries).where(eq(inquiries.idempotencyKey, idempotencyKey));
    if (previous) {
      if (previous.userId !== customer.id || previous.contentHash !== contentHash) return conflict("La solicitud ya se usó con otros datos.");
      return { reference: previous.id, replayed: true };
    }
    const hours = preorderHours();
    if (!hours) return conflict("La preventa todavía no está habilitada.");
    await lockKey(tx, `preorder-customer:${customer.id}`);
    const [first] = await source(tx).where(eq(importParcels.id, v.parcelId));
    if (!first) return conflict("El lote ya no está publicado.");
    await lockKey(tx, `shipment:${first.sh.id}`);
    await lockKey(tx, `cost-purchase:${first.p.id}`);
    const [row] = await source(tx).where(eq(importParcels.id, v.parcelId));
    if (!row || !activeShipment.includes(row.sh.status) || row.a.visibility !== "preventa" || row.a.destination !== "reventa" || !row.a.offerMinor) {
      return conflict("El lote ya no está abierto para reservas.");
    }
    const price = row.a.offerMinor;
    if (price * v.quantity > 100_000_000_000) return conflict("El importe supera el máximo admitido por pedido.");
    if (price !== v.expectedUnitMinor || price < 50_000 || price % 500 !== 0) return conflict("Cambió el precio o las condiciones. Volvé a abrir la ficha.");
    const product = catalog.products.find((p) => p.id === row.item.productId);
    const [override] = await tx.select().from(productOverrides).where(eq(productOverrides.productId, row.item.productId));
    if (!product || !(override?.visible ?? product.active) || product.retired || product.addonOnly) return conflict("El producto ya no se ofrece.");
    const expired = await tx.select({ inquiryId: importReservations.inquiryId }).from(importReservations).where(and(eq(importReservations.sourceParcelId, row.parcel.id), expiredFilter(now))).orderBy(importReservations.inquiryId);
    for (const old of expired) await release(tx, old.inquiryId, now, false);
    const [available] = await tx.select().from(importParcels).where(eq(importParcels.id, row.parcel.id));
    const [allocation] = await tx.select().from(importAllocations).where(eq(importAllocations.id, row.a.id));
    if (v.quantity > available.quantity || v.quantity > (override?.maxPerOrder ?? product.maxPerOrder ?? 20)) return conflict("No quedan suficientes unidades libres para esa solicitud.");
    const [duplicate] = await tx.select({ id: inquiries.id }).from(importReservations).innerJoin(inquiries, eq(importReservations.inquiryId, inquiries.id))
      .where(and(eq(inquiries.userId, customer.id), eq(importReservations.sourceParcelId, row.parcel.id), isNull(importReservations.releasedAt)));
    if (duplicate) return conflict("Ya tenés una reserva activa en este lote. Podés verla en tus pedidos.");
    const reference = newId("PR");
    const expiresAt = now + hours * 3_600_000;
    await tx.insert(inquiries).values({
      id: reference, idempotencyKey, contentHash, sessionTokenHash: sha(newId("PR")), userId: customer.id,
      currency: "ARS", subtotalMinor: price * v.quantity, deliveryMethod: v.delivery.method, deliveryJson: JSON.stringify(v.delivery),
      paymentPreference: "preventa", contactName: customer.name, message: `Solicitud de preventa ${reference} · ${v.quantity} × ${product.title}`, createdAt: now,
    });
    await tx.insert(inquiryEvents).values({ inquiryId: reference, kind: "created", detail: "Solicitud de preventa desde la ficha del producto.", createdAt: now });
    const [line] = await tx.insert(inquiryLines).values({
      inquiryId: reference, productId: product.id, sku: product.sku, title: product.title, language: product.language,
      quantity: v.quantity, fulfillment: "encargo", unitPriceMinor: price, lineSubtotalMinor: price * v.quantity, baseCurrency: "ARS", packSize: product.packSize ?? null,
    }).returning({ id: inquiryLines.id });
    await ensureTrack(tx, reference, now, { text: "Recibimos tu solicitud de reserva." });
    await tx.update(orderTracks).set({ stage: "confirmado_tienda", agreedMinor: price * v.quantity }).where(eq(orderTracks.inquiryId, reference));
    await tx.insert(orderEvents).values({ inquiryId: reference, kind: "stage", stage: "confirmado_tienda", publicText: "Unidades retenidas. La reserva se confirma cuando la tienda verifica la seña.", occurredAt: now, createdAt: now });
    // Se traslada la cantidad a un destino de encargo en la misma compra y envío. No se toca el stock físico.
    await tx.update(importParcels).set({ quantity: available.quantity - v.quantity }).where(eq(importParcels.id, available.id));
    // Si se agotó la asignación se conserva la fila fuente para poder liberarla.
    await tx.update(importAllocations).set({ quantity: allocation.quantity - v.quantity }).where(eq(importAllocations.id, allocation.id));
    const [held] = await tx.insert(importAllocations).values({ itemId: row.item.id, destination: "encargo", quantity: v.quantity, orderLineId: line.id }).returning();
    const [parcel] = await tx.insert(importParcels).values({ allocationId: held.id, shipmentId: row.sh.id, quantity: v.quantity }).returning();
    await tx.insert(importReservations).values({ inquiryId: reference, sourceParcelId: row.parcel.id, heldParcelId: parcel.id, quantity: v.quantity, unitPriceMinor: price, expiresAt });
    return { reference, replayed: false };
  });
}

/** Después de confirmar la seña, refleja los hechos logísticos ya cargados para las unidades reservadas. */
export async function syncPaidPreorder(tx: Tx, inquiryId: string, actor: { id: string; email: string }, now: number) {
  const [r] = await tx.select().from(importReservations).where(eq(importReservations.inquiryId, inquiryId));
  if (!r?.heldParcelId) return;
  const [row] = await source(tx).where(eq(importParcels.id, r.heldParcelId));
  if (!row) return;
  await advanceFromFacts(tx, inquiryId, "comprado_proveedor", row.p.orderedAt ?? now, actor, now, inquiryId);
  const stage = row.sh.status === "recibido_argentina"
    ? (row.sh.transitAt ? "en_transito" : row.sh.originReceivedAt ? "recibido_origen" : "enviado_proveedor")
    : row.sh.status;
  if (SHIPPING_STAGES.some((s) => s === stage)) {
    // Si el envío ya llegó y falta revisión, el progreso de la línea sigue en tránsito.
    const occurredAt = (stage === "en_transito" ? row.sh.transitAt : stage === "recibido_origen" ? row.sh.originReceivedAt : row.sh.sentAt) ?? now;
    await advanceFromFacts(tx, inquiryId, stage as Stage, occurredAt, actor, now, inquiryId);
  }
}
