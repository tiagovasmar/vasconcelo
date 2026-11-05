import { noticeForOrder } from "@/features/avisos/outbox";
import { holdState, paymentEvidence } from "./hold-state";
import { paymentTotals } from "@/features/pedidos/service";
import { senaFor } from "@/features/pedidos/etapas";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey, type Tx } from "@/db/lock";
import {
  accountingExpenses, costPurchaseItems, costPurchases, importAllocations, importDisbursements, importDocuments, importParcels,
  importReceipts, importReservations, inquiries, inquiryLines, inquirySales, orderEvents, orderTracks, saleLines, sales, shipmentItems, shipments,
} from "@/db/schema";
import type { Actor } from "@/features/catalog/overrides";
import { registerExpense } from "@/features/contabilidad/service";
import { advanceFromFacts, lineProgress, sha, trackLock } from "@/features/pedidos/service";
import { rank, type TrackKind } from "@/features/pedidos/etapas";
import { SaleError } from "@/features/sales/errors";
import { moveStockInTransaction } from "@/features/sales/service";

const id = z.number().int().positive();
const ref = z.string().trim().min(1).max(80);
const qty = z.number().int().min(0).max(1_000_000);
const date = z.number().int().positive().max(4_102_444_800_000);
const key = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

const conflict = (message: string): never => { throw new SaleError(409, "order_rule", message); };
const missing = (message: string): never => { throw new SaleError(404, "not_found", message); };
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const input = schema.safeParse(body);
  if (!input.success) throw new SaleError(400, "invalid_input", input.error.issues[0].message);
  return input.data;
}

async function purchase(tx: Tx, purchaseId: string) {
  await lockKey(tx, `cost-purchase:${purchaseId}`);
  return (await tx.select().from(costPurchases).where(eq(costPurchases.id, purchaseId)))[0] ?? missing("La compra no existe.");
}

async function purchaseItem(tx: Tx, itemId: number) {
  const [item] = await tx.select().from(costPurchaseItems).where(eq(costPurchaseItems.id, itemId));
  if (!item) return missing("El artículo de compra no existe.");
  const p = await purchase(tx, item.purchaseId);
  const [current] = await tx.select().from(costPurchaseItems).where(eq(costPurchaseItems.id, itemId));
  if (!current) return missing("El artículo cambió. Volvé a abrir la compra.");
  return { p, item: current };
}

async function lockOrderLine(tx: Tx, lineId: number, productId: string, allowCancelled = false) {
  const [row] = await tx.select({ line: inquiryLines, track: orderTracks }).from(inquiryLines)
    .innerJoin(orderTracks, eq(orderTracks.inquiryId, inquiryLines.inquiryId)).where(eq(inquiryLines.id, lineId));
  if (!row || row.line.productId !== productId) return missing("Elegí una línea del mismo producto en un pedido con seguimiento.");
  await trackLock(tx, row.line.inquiryId);
  const [track] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, row.line.inquiryId));
  if (track.cancelledAt && !allowCancelled) return conflict("El pedido está cancelado.");
  return { line: row.line, track };
}

const Destination = z.object({
  id: id.optional(), itemId: id, destination: z.enum(["reventa", "encargo", "vendido", "personal"]),
  quantity: qty.positive(), orderLineId: id.nullish(), saleLineId: id.nullish(),
});

export async function saveDestination(db: Db, body: unknown) {
  const v = parse(Destination, body);
  return db.transaction(async (tx) => {
    const { p, item } = await purchaseItem(tx, v.itemId);
    if (!p.managedImport || p.status !== "borrador") return conflict("Los destinos se editan en una compra de importación con costos abiertos.");
    const existing = await tx.select().from(importAllocations).where(eq(importAllocations.itemId, item.id));
    const before = existing.find((a) => a.id === v.id);
    if (v.id && !before) return missing("La asignación no existe.");
    if (before) await assertUnshipped(tx, before.id);
    const matching = existing.find((a) => a.id !== v.id && a.destination === v.destination && a.orderLineId === (v.orderLineId ?? null) && a.saleLineId === (v.saleLineId ?? null));
    if (matching) {
      if (!before && matching.quantity === v.quantity) return { id: matching.id, replayed: true };
      return conflict("Ya existe ese destino para el artículo. Editá la asignación existente.");
    }
    if (existing.filter((a) => a.id !== v.id).reduce((n, a) => n + a.quantity, 0) + v.quantity > item.quantity) return conflict("Las asignaciones superan la cantidad comprada.");
    const orderLineId = v.orderLineId ?? null;
    const saleLineId = v.saleLineId ?? null;
    if (v.destination === "encargo" ? !orderLineId || !!saleLineId : v.destination === "vendido" ? Boolean(orderLineId) === Boolean(saleLineId) : !!orderLineId || !!saleLineId) {
      return conflict("Elegí el vínculo correspondiente al destino.");
    }
    if (orderLineId || saleLineId) await lockKey(tx, "import-commitments");
    if (orderLineId) {
      const { line, track } = await lockOrderLine(tx, orderLineId, item.productId);
      if (v.destination === "encargo" && !["encargo", "mayorista"].includes(line.fulfillment)) return conflict("Elegí un artículo por encargo.");
      if (v.destination === "vendido" && !await isSoldOrder(tx, track.inquiryId, track.agreedMinor)) return conflict("El pedido todavía no tiene importe confirmado ni venta vinculada.");
      const [used] = await tx.select({ n: sql<number>`coalesce(sum(${importAllocations.quantity}),0)::int` }).from(importAllocations)
        .where(and(eq(importAllocations.orderLineId, orderLineId), v.id ? ne(importAllocations.id, v.id) : undefined));
      const [legacy] = await tx.select({ n: sql<number>`coalesce(sum(${shipmentItems.quantity}),0)::int` }).from(shipmentItems).where(eq(shipmentItems.lineId, orderLineId));
      const [sameSale] = await tx.select({ n: sql<number>`coalesce(sum(${importAllocations.quantity}),0)::int` }).from(inquirySales)
        .innerJoin(saleLines, eq(inquirySales.saleId, saleLines.saleId))
        .innerJoin(importAllocations, eq(importAllocations.saleLineId, saleLines.id))
        .where(and(eq(inquirySales.inquiryId, line.inquiryId), eq(inquirySales.active, true), eq(saleLines.productId, line.productId), v.id ? ne(importAllocations.id, v.id) : undefined));
      if (used.n + legacy.n + sameSale.n + v.quantity > line.quantity) return conflict("El pedido ya tiene unidades asignadas o enviadas.");
    }
    if (saleLineId) {
      await lockKey(tx, `import-sale-line:${saleLineId}`);
      const [row] = await tx.select({ line: saleLines, status: sales.status }).from(saleLines).innerJoin(sales, eq(sales.id, saleLines.saleId))
        .where(eq(saleLines.id, saleLineId));
      if (!row || row.status !== "registrada" || row.line.productId !== item.productId) return conflict("Elegí una venta vigente del mismo producto.");
      const [used] = await tx.select({ n: sql<number>`coalesce(sum(${importAllocations.quantity}),0)::int` }).from(importAllocations)
        .where(and(eq(importAllocations.saleLineId, saleLineId), v.id ? ne(importAllocations.id, v.id) : undefined));
      const [sameOrder] = await tx.select({ n: sql<number>`coalesce(sum(${importAllocations.quantity}),0)::int` }).from(inquirySales)
        .innerJoin(inquiryLines, eq(inquirySales.inquiryId, inquiryLines.inquiryId))
        .innerJoin(importAllocations, eq(importAllocations.orderLineId, inquiryLines.id))
        .where(and(eq(inquirySales.saleId, row.line.saleId), eq(inquirySales.active, true), eq(inquiryLines.productId, row.line.productId), v.id ? ne(importAllocations.id, v.id) : undefined));
      if (used.n + sameOrder.n + v.quantity > row.line.quantity) return conflict("La venta ya tiene unidades asignadas.");
    }
    const fields = { itemId: item.id, destination: v.destination, quantity: v.quantity, orderLineId, saleLineId,
      visibility: before?.destination === v.destination ? before.visibility : "privado",
      offerMinor: before?.destination === v.destination ? before.offerMinor : null };
    const [saved] = before
      ? await tx.update(importAllocations).set(fields).where(eq(importAllocations.id, before.id)).returning()
      : await tx.insert(importAllocations).values(fields).returning();
    return { id: saved.id };
  });
}

async function isSoldOrder(tx: Tx, inquiryId: string, agreedMinor: number | null) {
  if (agreedMinor !== null) return true;
  const [sale] = await tx.select({ id: inquirySales.id }).from(inquirySales)
    .where(and(eq(inquirySales.inquiryId, inquiryId), eq(inquirySales.active, true)));
  return Boolean(sale);
}

async function assertUnshipped(tx: Tx, allocationId: number) {
  const [row] = await tx.select({ id: importParcels.id }).from(importParcels).where(eq(importParcels.allocationId, allocationId)).limit(1);
  if (row) return conflict("Quitá las unidades de los envíos en preparación antes de editar el destino.");
}

async function allocation(tx: Tx, allocationId: number) {
  const [first] = await tx.select().from(importAllocations).where(eq(importAllocations.id, allocationId));
  if (!first) return missing("La asignación no existe.");
  const data = await purchaseItem(tx, first.itemId);
  const [a] = await tx.select().from(importAllocations).where(eq(importAllocations.id, allocationId));
  if (!a) return missing("La asignación no existe.");
  return { ...data, a };
}

export async function removeDestination(db: Db, body: unknown) {
  const v = parse(z.object({ allocationId: id }), body);
  return db.transaction(async (tx) => {
    const { p, a } = await allocation(tx, v.allocationId);
    if (p.status !== "borrador") return conflict("El costo de esta compra ya se cerró.");
    await assertUnshipped(tx, a.id);
    await tx.delete(importAllocations).where(eq(importAllocations.id, a.id));
    return { changed: true };
  });
}

export async function setPublication(db: Db, body: unknown) {
  const v = parse(z.object({ allocationId: id, visibility: z.enum(["privado", "proximamente", "preventa"]), offerMinor: z.number().int().positive().max(100_000_000_000).nullish() }), body);
  return db.transaction(async (tx) => {
    const { a } = await allocation(tx, v.allocationId);
    if (a.destination !== "reventa") return conflict("Solo se publican unidades para reventa.");
    if (v.visibility === "preventa" && (!v.offerMinor || v.offerMinor < 50_000 || v.offerMinor % 500 !== 0)) return conflict("Cargá un precio confirmado desde $500, en múltiplos de $5, para que la seña del 20% quede en pesos enteros.");
    await tx.update(importAllocations).set({ visibility: v.visibility, offerMinor: v.visibility === "preventa" ? v.offerMinor : null }).where(eq(importAllocations.id, a.id));
    return { changed: true };
  });
}

export async function markOrdered(db: Db, body: unknown) {
  const v = parse(z.object({ purchaseId: ref, occurredAt: date }), body);
  return db.transaction(async (tx) => {
    const p = await purchase(tx, v.purchaseId);
    if (!p.managedImport) return conflict("Guardá primero la compra como importación.");
    const [sent] = await tx.select({ sentAt: shipments.sentAt }).from(importParcels)
      .innerJoin(importAllocations, eq(importParcels.allocationId, importAllocations.id))
      .innerJoin(costPurchaseItems, eq(importAllocations.itemId, costPurchaseItems.id))
      .innerJoin(shipments, eq(importParcels.shipmentId, shipments.id))
      .where(and(eq(costPurchaseItems.purchaseId, p.id), sql`${shipments.sentAt} < ${v.occurredAt}`)).limit(1);
    if (sent) return conflict("La fecha de compra es posterior a la salida de un envío.");
    await tx.update(costPurchases).set({ orderedAt: v.occurredAt }).where(eq(costPurchases.id, p.id));
    return { changed: true };
  });
}

export async function setParcel(db: Db, body: unknown) {
  const v = parse(z.object({ allocationId: id, shipmentId: ref, quantity: qty }), body);
  return db.transaction(async (tx) => {
    await lockKey(tx, `shipment:${v.shipmentId}`);
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, v.shipmentId));
    if (!shipment) return missing("El envío no existe.");
    if (shipment.status !== "preparando") return conflict("El envío ya salió.");
    const { a, item, p } = await allocation(tx, v.allocationId);
    if (!p.orderedAt) return conflict("Registrá primero la fecha real de compra al proveedor.");
    const rows = await tx.select().from(importParcels).where(eq(importParcels.allocationId, a.id));
    const current = rows.find((r) => r.shipmentId === shipment.id);
    if (rows.filter((r) => r.id !== current?.id).reduce((n, r) => n + r.quantity, 0) + v.quantity > a.quantity) return conflict("Los envíos superan las unidades de este destino.");
    if (v.quantity && a.orderLineId) {
      const { track, line } = await lockOrderLine(tx, a.orderLineId, item.productId);
      if (line.fulfillment !== "stock" && rank(track.kind as TrackKind, track.stage) < rank(track.kind as TrackKind, "comprado_proveedor")) {
        return conflict("Marcá el encargo como comprado al proveedor en Pedidos, después de confirmar su seña.");
      }
    }
    if (current && !v.quantity) await tx.delete(importParcels).where(eq(importParcels.id, current.id));
    else if (current) await tx.update(importParcels).set({ quantity: v.quantity }).where(eq(importParcels.id, current.id));
    else if (v.quantity) await tx.insert(importParcels).values({ allocationId: a.id, shipmentId: shipment.id, quantity: v.quantity });
    return { changed: true };
  });
}

const Receipt = z.object({
  parcelId: id, expectedRevision: qty, accepted: qty, damaged: qty, missing: qty,
  occurredAt: date, idempotencyKey: key, reason: z.string().trim().min(3).max(160),
});

export async function receiveParcel(db: Db, body: unknown, actor: Actor, now = Date.now()) {
  const v = parse(Receipt, body);
  return db.transaction(async (tx) => {
    await lockKey(tx, `import-receipt:${v.idempotencyKey}`);
    const [replay] = await tx.select().from(importReceipts).where(eq(importReceipts.operationKey, v.idempotencyKey));
    if (replay) {
      if (replay.parcelId !== v.parcelId || replay.revision !== v.expectedRevision + 1 || replay.accepted !== v.accepted || replay.missing !== v.missing || replay.damaged !== v.damaged || replay.reason !== v.reason || replay.occurredAt !== v.occurredAt) return conflict("La clave de recepción ya corresponde a otro registro.");
      return { replayed: true };
    }
    const [first] = await tx.select().from(importParcels).where(eq(importParcels.id, v.parcelId));
    if (!first) return missing("El tramo de compra no existe.");
    await lockKey(tx, `shipment:${first.shipmentId}`);
    const [sh] = await tx.select().from(shipments).where(eq(shipments.id, first.shipmentId));
    if (sh.status !== "recibido_argentina" || (sh.arrivedAt && v.occurredAt < sh.arrivedAt)) return conflict("Registrá la llegada del envío a Argentina y verificá la fecha de recepción.");
    const [parcel] = await tx.select().from(importParcels).where(eq(importParcels.id, first.id));
    if (!parcel) return missing("El tramo se liberó. Actualizá la pantalla.");
    const { p, a, item } = await allocation(tx, parcel.allocationId);
    if (parcel.revision !== v.expectedRevision) return conflict("Ya se registró otra recepción. Actualizá la pantalla y revisá las cantidades.");
    if (v.accepted + v.damaged + v.missing > parcel.quantity) return conflict("La recepción supera la cantidad del envío.");
    const delta = v.accepted - parcel.accepted;
    if (!delta && v.damaged === parcel.damaged && v.missing === parcel.missing) return { replayed: true };
    const order = a.orderLineId ? await lockOrderLine(tx, a.orderLineId, item.productId, true) : null;
    if (order) {
      const hold = await holdState(tx, order.line.inquiryId, now);
      if (hold && (order.track.cancelledAt || hold.expired || (await paymentTotals(tx, order.line.inquiryId)).confirmedMinor < (senaFor(order.track.agreedMinor) ?? Infinity))) {
        return conflict("Confirmá la seña o liberá la retención vencida antes de revisar estas unidades.");
      }
    }
    const trackOrder = order && !order.track.cancelledAt && order.line.fulfillment !== "stock" ? order : null;
    if (trackOrder && delta < 0) {
      const row = (await lineProgress(tx, trackOrder.line.inquiryId)).find((l) => l.lineId === trackOrder.line.id);
      const t = trackOrder.track;
      if (row && (row.arrived + delta < row.delivered || rank(t.kind as TrackKind, t.stage) >= rank(t.kind as TrackKind, "recibido_argentina") && row.arrived + delta < row.quantity)) {
        return conflict("La corrección contradice una llegada o entrega confirmada al cliente. Registrá una incidencia en su pedido.");
      }
    }
    if (a.destination === "reventa" && delta) {
      const common = { productId: item.productId, reason: `Recepción ${p.id} / ${sh.id}: ${v.reason}`, idempotencyKey: sha(`import:${v.idempotencyKey}`) };
      await moveStockInTransaction(tx, delta > 0 ? { ...common, kind: "entrada", quantity: delta } : { ...common, kind: "ajuste", newQuantity: 0 }, actor, now, delta < 0 ? delta : undefined);
    }
    const revision = parcel.revision + 1;
    await tx.update(importParcels).set({ accepted: v.accepted, damaged: v.damaged, missing: v.missing, revision }).where(eq(importParcels.id, parcel.id));
    await tx.insert(importReceipts).values({ operationKey: v.idempotencyKey, parcelId: parcel.id, accepted: v.accepted, damaged: v.damaged, missing: v.missing, revision, reason: v.reason, occurredAt: v.occurredAt, createdAt: now, actorEmail: actor.email });
    if (trackOrder && delta > 0) {
      const inquiryId = trackOrder.line.inquiryId;
      const progress = await lineProgress(tx, inquiryId);
      await tx.insert(orderEvents).values({ inquiryId, kind: "shipment", publicText: `Recepción revisada: ${delta} × ${trackOrder.line.title}.`, occurredAt: v.occurredAt, createdAt: now, actorEmail: actor.email });
      if (progress.every((l) => l.arrived >= l.quantity)) {
        await advanceFromFacts(tx, inquiryId, "recibido_argentina", v.occurredAt, actor, now, `import:${v.idempotencyKey}`);
      } else {
        await noticeForOrder(tx, inquiryId, "llegada_parcial", `import:${v.idempotencyKey}`, now, `Recepción revisada: ${delta} × ${trackOrder.line.title}.`);
      }
    }
    return { replayed: false };
  });
}

export async function payPurchase(db: Db, body: unknown, actor: Actor) {
  const v = parse(z.object({ purchaseId: ref, expenseId: key.optional() }), body);
  return db.transaction(async (tx) => {
    const p = await purchase(tx, v.purchaseId);
    const raw = body as Record<string, unknown>;
    const expenseId = v.expenseId ?? parse(key, raw.idempotencyKey);
    await lockKey(tx, `import-disbursement:${expenseId}`);
    const [existing] = await tx.select().from(importDisbursements).where(eq(importDisbursements.expenseId, expenseId));
    if (existing && existing.purchaseId !== p.id) return conflict("Ese egreso ya se vinculó a otra compra.");
    if (!v.expenseId) await registerExpense(tx, body, actor.email);
    else if (!(await tx.select({ id: accountingExpenses.id }).from(accountingExpenses).where(eq(accountingExpenses.id, expenseId)))[0]) return missing("El egreso no existe.");
    await tx.insert(importDisbursements).values({ purchaseId: p.id, expenseId }).onConflictDoNothing();
    return { changed: !existing };
  });
}

export async function purchaseRelations(db: Db, purchaseId: string, itemIds: number[]) {
  const allocations = await db.select().from(importAllocations).where(inArray(importAllocations.itemId, itemIds)).orderBy(importAllocations.id);
  const [parcels, documents, payments, availablePayments] = await Promise.all([
    db.select({ parcel: importParcels, shipment: shipments }).from(importParcels)
      .innerJoin(shipments, eq(importParcels.shipmentId, shipments.id))
      .where(inArray(importParcels.allocationId, allocations.map((a) => a.id))),
    db.select().from(importDocuments).where(eq(importDocuments.purchaseId, purchaseId)),
    db.select({ expense: accountingExpenses }).from(importDisbursements).innerJoin(accountingExpenses, eq(importDisbursements.expenseId, accountingExpenses.id)).where(eq(importDisbursements.purchaseId, purchaseId)),
    db.select().from(accountingExpenses).leftJoin(importDisbursements, eq(accountingExpenses.id, importDisbursements.expenseId)).where(isNull(importDisbursements.expenseId)).orderBy(sql`${accountingExpenses.spentAt} desc`).limit(100),
  ]);
  const history = await db.select().from(importReceipts).where(inArray(importReceipts.parcelId, parcels.map(({ parcel }) => parcel.id))).orderBy(sql`${importReceipts.createdAt} desc`);
  const reservations = await db.select({ r: importReservations, track: orderTracks }).from(importReservations)
    .innerJoin(orderTracks, eq(importReservations.inquiryId, orderTracks.inquiryId)).where(inArray(importReservations.sourceParcelId, parcels.map(({ parcel }) => parcel.id)));
  const holds = await Promise.all(reservations.map(async ({ r, track }) => ({ ...r, track, state: await holdState(db, r.inquiryId), totals: await paymentTotals(db, r.inquiryId) })));
  return { allocations, parcels, documents, payments, holds, availablePayments: availablePayments.map((p) => p.accounting_expenses), history };
}

export async function linkableLines(db: Db, productIds: string[]) {
  const [orders, sold] = await Promise.all([
    db.select({ id: inquiryLines.id, productId: inquiryLines.productId, ref: inquiryLines.inquiryId, quantity: inquiryLines.quantity, name: inquiries.contactName, fulfillment: inquiryLines.fulfillment })
      .from(inquiryLines).innerJoin(orderTracks, eq(inquiryLines.inquiryId, orderTracks.inquiryId)).innerJoin(inquiries, eq(inquiryLines.inquiryId, inquiries.id))
      .where(and(inArray(inquiryLines.productId, productIds), isNull(orderTracks.cancelledAt))),
    db.select({ id: saleLines.id, productId: saleLines.productId, ref: saleLines.saleId, quantity: saleLines.quantity }).from(saleLines).innerJoin(sales, eq(saleLines.saleId, sales.id))
      .where(and(inArray(saleLines.productId, productIds), eq(sales.status, "registrada"))),
  ]);
  return { orders, sold };
}

/** Estado logístico más atrasado entre las unidades de la compra. */
export async function importProgress(db: Db) {
  const rows = await db.select({
    purchaseId: costPurchaseItems.purchaseId, status: shipments.status,
    quantity: sql<number>`sum(${importParcels.quantity})::int`,
    reviewed: sql<number>`sum(${importParcels.accepted} + ${importParcels.missing} + ${importParcels.damaged})::int`,
  }).from(importParcels).innerJoin(shipments, eq(importParcels.shipmentId, shipments.id))
    .innerJoin(importAllocations, eq(importParcels.allocationId, importAllocations.id))
    .innerJoin(costPurchaseItems, eq(importAllocations.itemId, costPurchaseItems.id))
    .groupBy(costPurchaseItems.purchaseId, shipments.status);
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = grouped.get(row.purchaseId) ?? [];
    group.push(row);
    grouped.set(row.purchaseId, group);
  }
  return grouped;
}

/** Proyección pública deliberadamente limitada a producto y cantidad entrante. */
export async function incomingProducts(db: Db, productId?: string, now = Date.now()) {
  const reconciled = sql`coalesce((select sum(p.accepted + p.missing + p.damaged) from import_parcels p where p.allocation_id = ${importAllocations.id}), 0)`;
  const expired = sql`coalesce((select sum(${importReservations.quantity}) from ${importReservations}
    inner join import_parcels p on p.id = ${importReservations.sourceParcelId}
    inner join shipments s on s.id = p.shipment_id
    where p.allocation_id = ${importAllocations.id} and ${importReservations.releasedAt} is null
    and ${importReservations.expiresAt} <= ${now} and not ${paymentEvidence(importReservations.inquiryId)}
    and s.status <> 'recibido_argentina'), 0)`;
  const traveling = sql<number>`(coalesce((select sum(p.quantity) from import_parcels p join shipments s on s.id = p.shipment_id
    where p.allocation_id = ${importAllocations.id} and s.status in ('enviado_proveedor', 'recibido_origen', 'en_transito')), 0) + ${expired})::int`;
  const remaining = sql<number>`(${importAllocations.quantity} - ${reconciled} + ${expired})::int`;
  const rows = await db.select({ productId: costPurchaseItems.productId, quantity: remaining, traveling })
    .from(importAllocations).innerJoin(costPurchaseItems, eq(importAllocations.itemId, costPurchaseItems.id))
    .innerJoin(costPurchases, eq(costPurchaseItems.purchaseId, costPurchases.id))
    .where(and(eq(importAllocations.destination, "reventa"), or(eq(importAllocations.visibility, "proximamente"), eq(importAllocations.visibility, "preventa")),
      sql`${costPurchases.orderedAt} is not null`, productId ? eq(costPurchaseItems.productId, productId) : undefined));
  const result = new Map<string, { quantity: number; traveling: number }>();
  for (const r of rows) {
    if (r.quantity <= 0) continue;
    const prev = result.get(r.productId) ?? { quantity: 0, traveling: 0 };
    result.set(r.productId, { quantity: prev.quantity + r.quantity, traveling: prev.traveling + r.traveling });
  }
  return result;
}
