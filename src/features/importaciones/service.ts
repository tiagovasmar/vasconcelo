import { noticeForOrder } from "@/features/avisos/outbox";
import { holdState, paymentEvidence } from "./hold-state";
import { paymentTotals } from "@/features/pedidos/service";
import { senaFor } from "@/features/pedidos/etapas";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { catalog } from "@/content/catalog";
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
import { getEffectiveRate } from "@/features/fx/service";
import { moveStockInTransaction, newSaleId } from "@/features/sales/service";

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
    if (before) {
      await assertEditableDestination(tx, before.saleLineId);
      await assertUnshipped(tx, before.id);
    }
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
      const [row] = await tx.select({ line: saleLines, status: sales.status, imported: sales.stockFromImport }).from(saleLines).innerJoin(sales, eq(sales.id, saleLines.saleId))
        .where(eq(saleLines.id, saleLineId));
      if (!row || row.imported || row.status !== "registrada" || row.line.productId !== item.productId) return conflict("Elegí una venta vigente del mismo producto.");
      const [used] = await tx.select({ n: sql<number>`coalesce(sum(${importAllocations.quantity}),0)::int` }).from(importAllocations)
        .where(and(eq(importAllocations.saleLineId, saleLineId), v.id ? ne(importAllocations.id, v.id) : undefined));
      const [sameOrder] = await tx.select({ n: sql<number>`coalesce(sum(${importAllocations.quantity}),0)::int` }).from(inquirySales)
        .innerJoin(inquiryLines, eq(inquirySales.inquiryId, inquiryLines.inquiryId))
        .innerJoin(importAllocations, eq(importAllocations.orderLineId, inquiryLines.id))
        .where(and(eq(inquirySales.saleId, row.line.saleId), eq(inquirySales.active, true), eq(inquiryLines.productId, row.line.productId), v.id ? ne(importAllocations.id, v.id) : undefined));
      if (used.n + sameOrder.n + v.quantity > row.line.quantity) return conflict("La venta ya tiene unidades asignadas.");
    }
    const fields = { itemId: item.id, destination: v.destination, quantity: v.quantity, orderLineId, saleLineId,
      visibility: before?.destination === v.destination ? before.visibility : v.destination === "reventa" ? "proximamente" : "privado",
      offerMinor: before?.destination === v.destination ? before.offerMinor : null };
    const [saved] = before
      ? await tx.update(importAllocations).set(fields).where(eq(importAllocations.id, before.id)).returning()
      : await tx.insert(importAllocations).values(fields).returning();
    return { id: saved.id };
  });
}

const CustomerSale = z.object({
  purchaseId: ref,
  customerContact: z.string().trim().min(2, "Ingresá el nombre o contacto del cliente.").max(150),
  items: z.array(z.object({ itemId: id, quantity: qty.positive(), unitPriceMinor: z.number().int().positive().max(100_000_000_000) })).min(1).max(100),
  idempotencyKey: key,
});

export async function createImportCustomerSale(db: Db, body: unknown, actor: Actor, now = Date.now()) {
  const v = parse(CustomerSale, body);
  const selected = [...v.items].sort((a, b) => a.itemId - b.itemId);
  if (new Set(selected.map((line) => line.itemId)).size !== selected.length) return conflict("Cargá una sola línea por artículo de la compra.");
  const totalMinor = selected.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor > 30_000_000_000_000) return conflict("Revisá el total de la venta.");
  const contentHash = sha(JSON.stringify([v.purchaseId, v.customerContact, selected]));
  const fx = await getEffectiveRate(db, now);
  return db.transaction(async (tx) => {
    await lockKey(tx, `sale:${v.idempotencyKey}`);
    const [previous] = await tx.select({ id: sales.id, hash: sales.contentHash }).from(sales).where(eq(sales.idempotencyKey, v.idempotencyKey));
    if (previous) {
      if (previous.hash !== contentHash) return conflict("Ya existe otra venta con esta operación.");
      return { id: previous.id, replayed: true };
    }
    const p = await purchase(tx, v.purchaseId);
    if (!p.managedImport || p.status !== "borrador") return conflict("Registrá el destino en una compra de importación con costos abiertos.");
    const items = await tx.select().from(costPurchaseItems).where(eq(costPurchaseItems.purchaseId, p.id));
    const allocations = await tx.select().from(importAllocations).where(inArray(importAllocations.itemId, items.map((item) => item.id)));
    const saleId = newSaleId();
    await tx.insert(sales).values({
      id: saleId, idempotencyKey: v.idempotencyKey, contentHash, totalMinor, customerContact: v.customerContact,
      stockFromImport: true, paymentMethod: "pendiente", status: "agendada", fxRate10k: fx.rate10k,
      createdAt: now, createdByUserId: actor.id, createdByEmail: actor.email,
    });
    for (const line of selected) {
      const item = items.find((candidate) => candidate.id === line.itemId);
      if (!item) return missing("Uno de los artículos no pertenece a esta compra.");
      const product = catalog.products.find((candidate) => candidate.id === item.productId);
      if (!product) return missing("Uno de los productos ya no figura en el catálogo.");
      const taken = allocations.filter((a) => a.itemId === item.id).reduce((sum, a) => sum + a.quantity, 0);
      if (line.quantity > item.quantity - taken) return conflict(`Hay ${item.quantity - taken} unidades de «${product.title}» libres para asignar.`);
      const [saleLine] = await tx.insert(saleLines).values({
        saleId, productId: product.id, sku: product.sku, title: product.title, language: product.language,
        quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.quantity * line.unitPriceMinor, baseCurrency: "ARS",
      }).returning({ id: saleLines.id });
      await tx.insert(importAllocations).values({ itemId: item.id, destination: "vendido", saleLineId: saleLine.id, quantity: line.quantity });
    }
    return { id: saleId, replayed: false };
  });
}

async function assertEditableDestination(tx: Tx, saleLineId: number | null) {
  if (saleLineId === null) return;
  const [row] = await tx.select({ imported: sales.stockFromImport }).from(sales)
    .innerJoin(saleLines, eq(sales.id, saleLines.saleId)).where(eq(saleLines.id, saleLineId));
  if (row?.imported) return conflict("Esta asignación pertenece a una venta de importación. Anulá la venta para liberar las unidades.");
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
    await assertEditableDestination(tx, a.saleLineId);
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

async function purchaseShipmentRows(db: Db | Tx, purchaseIds?: string[]) {
  return db.select({
    purchaseId: costPurchases.id, supplier: costPurchases.supplier, reference: costPurchases.reference, purchasedAt: costPurchases.purchasedAt,
    orderedAt: costPurchases.orderedAt, status: costPurchases.status, itemId: costPurchaseItems.id, productId: costPurchaseItems.productId,
    quantity: costPurchaseItems.quantity, allocation: importAllocations,
    shipped: sql<number>`(select coalesce(sum(p.quantity), 0)::int from import_parcels p where p.allocation_id = ${importAllocations.id})`,
  }).from(costPurchases).innerJoin(costPurchaseItems, eq(costPurchases.id, costPurchaseItems.purchaseId))
    .leftJoin(importAllocations, eq(costPurchaseItems.id, importAllocations.itemId))
    .where(and(eq(costPurchases.managedImport, true), purchaseIds ? inArray(costPurchases.id, purchaseIds) : undefined))
    .orderBy(costPurchases.id, costPurchaseItems.id, importAllocations.id);
}

function planPurchaseShipment(rows: Awaited<ReturnType<typeof purchaseShipmentRows>>) {
  const items = new Map<number, { row: (typeof rows)[number]; assigned: number; remaining: number }>();
  for (const row of rows) {
    const item = items.get(row.itemId) ?? { row, assigned: 0, remaining: 0 };
    item.assigned += row.allocation?.quantity ?? 0;
    item.remaining += (row.allocation?.quantity ?? 0) - row.shipped;
    items.set(row.itemId, item);
  }
  return [...items.values()].map(({ row, assigned, remaining }) => ({
    row, unassigned: row.status === "borrador" ? row.quantity - assigned : 0, remaining,
  }));
}

export async function shippablePurchases(db: Db) {
  const purchases = new Map<string, { id: string; supplier: string; reference: string | null; date: number; quantity: number }>();
  for (const { row, unassigned, remaining } of planPurchaseShipment(await purchaseShipmentRows(db))) {
    if (!unassigned && !remaining) continue;
    const purchase = purchases.get(row.purchaseId) ?? { id: row.purchaseId, supplier: row.supplier, reference: row.reference, date: row.orderedAt ?? row.purchasedAt, quantity: 0 };
    purchase.quantity += unassigned + remaining;
    purchases.set(purchase.id, purchase);
  }
  return [...purchases.values()].sort((a, b) => b.date - a.date);
}

export async function addPurchasesToShipment(db: Db | Tx, body: unknown) {
  const v = parse(z.object({ shipmentId: ref, purchaseIds: z.array(ref).min(1, "Elegí al menos una compra.").max(100) }), body);
  return db.transaction(async (tx) => {
    await lockKey(tx, `shipment:${v.shipmentId}`);
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, v.shipmentId));
    if (!shipment) return missing("El envío no existe.");
    if (shipment.status !== "preparando") return conflict("El envío ya salió.");
    const ids = [...new Set(v.purchaseIds)].sort();
    for (const purchaseId of ids) await lockKey(tx, `cost-purchase:${purchaseId}`);
    const rows = await purchaseShipmentRows(tx, ids);
    if (new Set(rows.map((row) => row.purchaseId)).size !== ids.length) return missing("Alguna de las compras seleccionadas ya no está disponible.");

    const pending = rows.filter((row) => row.allocation && row.allocation.quantity > row.shipped);
    const orderLineIds = pending.flatMap(({ allocation }) => allocation?.orderLineId ? [allocation.orderLineId] : []);
    if (orderLineIds.length) {
      const orderLines = await tx.select().from(inquiryLines).where(inArray(inquiryLines.id, orderLineIds));
      for (const inquiryId of [...new Set(orderLines.map((line) => line.inquiryId))].sort()) await trackLock(tx, inquiryId);
      for (const row of pending) {
        if (!row.allocation?.orderLineId) continue;
        const { track, line } = await lockOrderLine(tx, row.allocation.orderLineId, row.productId);
        if (line.fulfillment !== "stock" && rank(track.kind as TrackKind, track.stage) < rank(track.kind as TrackKind, "comprado_proveedor")) {
          return conflict("Marcá los encargos como comprados al proveedor en Pedidos antes de incluirlos en el envío.");
        }
      }
    }

    const quantities = new Map(pending.map((row) => [row.allocation!.id, row.allocation!.quantity - row.shipped]));
    const plan = planPurchaseShipment(rows);
    const active = [...new Set(plan.filter((item) => item.unassigned || item.remaining).map((item) => item.row.purchaseId))];
    for (const purchaseId of active) {
      const row = rows.find((row) => row.purchaseId === purchaseId)!;
      if (!row.orderedAt) await tx.update(costPurchases).set({ orderedAt: row.purchasedAt }).where(eq(costPurchases.id, purchaseId));
    }
    for (const { row, unassigned } of plan) {
      if (!unassigned) continue;
      const free = rows.find((r) => r.itemId === row.itemId && r.allocation?.destination === "reventa" && r.allocation.visibility === "proximamente")?.allocation;
      if (free) {
        await tx.update(importAllocations).set({ quantity: free.quantity + unassigned }).where(eq(importAllocations.id, free.id));
        quantities.set(free.id, (quantities.get(free.id) ?? 0) + unassigned);
      } else {
        const [created] = await tx.insert(importAllocations).values({ itemId: row.itemId, destination: "reventa", quantity: unassigned, visibility: "proximamente" }).returning({ id: importAllocations.id });
        quantities.set(created.id, unassigned);
      }
    }
    if (quantities.size) {
      await tx.insert(importParcels).values([...quantities].map(([allocationId, quantity]) => ({ shipmentId: shipment.id, allocationId, quantity })))
        .onConflictDoUpdate({ target: [importParcels.shipmentId, importParcels.allocationId], set: { quantity: sql`${importParcels.quantity} + excluded.quantity` } });
    }
    return { replayed: quantities.size === 0, quantity: [...quantities.values()].reduce((sum, n) => sum + n, 0) };
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

export async function releaseDueImportStock(db: Db, now = Date.now()) {
  const due = await db.select({ parcel: importParcels.id, shipmentId: shipments.id, productId: costPurchaseItems.productId })
    .from(importParcels).innerJoin(shipments, eq(shipments.id, importParcels.shipmentId))
    .innerJoin(importAllocations, eq(importAllocations.id, importParcels.allocationId))
    .innerJoin(costPurchaseItems, eq(costPurchaseItems.id, importAllocations.itemId))
    .where(and(eq(importAllocations.destination, "reventa"), eq(shipments.status, "recibido_argentina"),
      or(isNull(shipments.availableAt), sql`${shipments.availableAt} <= ${now}`),
      sql`${importParcels.accepted} > ${importParcels.releasedStock}`)).orderBy(importParcels.id);
  for (const entry of due) {
    if (!catalog.products.some((p) => p.id === entry.productId && !p.retired)) continue;
    await db.transaction(async (tx) => {
      await lockKey(tx, `shipment:${entry.shipmentId}`);
      const [sh] = await tx.select().from(shipments).where(eq(shipments.id, entry.shipmentId));
      const [parcel] = await tx.select().from(importParcels).where(eq(importParcels.id, entry.parcel));
      if (!sh || (sh.availableAt !== null && sh.availableAt > now) || !parcel || parcel.accepted <= parcel.releasedStock) return;
      await moveStockInTransaction(tx, {
        productId: entry.productId, kind: "entrada", quantity: parcel.accepted - parcel.releasedStock,
        reason: `Disponibilidad programada · ${sh.id}`, idempotencyKey: sha(`import-release:${parcel.id}:${parcel.revision}`),
      }, { id: "import-stock", email: "stock-automatico@vasconcelo.shop" }, now, undefined, true);
      await tx.update(importParcels).set({ releasedStock: parcel.accepted }).where(eq(importParcels.id, parcel.id));
    });
  }
}

export async function receiveParcel(db: Db | Tx, body: unknown, actor: Actor, now = Date.now()) {
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
    const releasedStock = a.destination !== "reventa" ? 0 : sh.availableAt !== null && sh.availableAt > now ? 0 : v.accepted;
    const stockDelta = releasedStock - parcel.releasedStock;
    if (stockDelta) {
      const common = { productId: item.productId, reason: `Recepción ${p.id} / ${sh.id}: ${v.reason}`, idempotencyKey: sha(`import:${v.idempotencyKey}`) };
      await moveStockInTransaction(tx, stockDelta > 0 ? { ...common, kind: "entrada", quantity: stockDelta } : { ...common, kind: "ajuste", newQuantity: 0 }, actor, now, stockDelta < 0 ? stockDelta : undefined, true);
    }
    const revision = parcel.revision + 1;
    await tx.update(importParcels).set({ accepted: v.accepted, releasedStock, damaged: v.damaged, missing: v.missing, revision }).where(eq(importParcels.id, parcel.id));
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

export async function receiveShipment(db: Db, shipmentId: string, actor: Actor, now = Date.now()) {
  return db.transaction(async (tx) => {
    await lockKey(tx, `shipment:${shipmentId}`);
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId));
    if (!shipment || shipment.status !== "recibido_argentina") return conflict("Primero registrá la llegada del despacho a Argentina.");
    const items = await tx.selectDistinct({ purchaseId: costPurchaseItems.purchaseId, productId: costPurchaseItems.productId, orderLineId: importAllocations.orderLineId }).from(importParcels)
      .innerJoin(importAllocations, eq(importAllocations.id, importParcels.allocationId))
      .innerJoin(costPurchaseItems, eq(costPurchaseItems.id, importAllocations.itemId)).where(eq(importParcels.shipmentId, shipmentId));
    for (const purchaseId of [...new Set(items.map((item) => item.purchaseId))].sort()) await lockKey(tx, `cost-purchase:${purchaseId}`);
    const orderIds = items.flatMap((item) => item.orderLineId === null ? [] : [item.orderLineId]);
    const orders = await tx.selectDistinct({ id: inquiryLines.inquiryId }).from(inquiryLines).where(inArray(inquiryLines.id, orderIds)).orderBy(inquiryLines.inquiryId);
    for (const order of orders) await trackLock(tx, order.id);
    for (const productId of [...new Set(items.map((item) => item.productId))].sort()) await lockKey(tx, `override:${productId}`);
    const rows = await tx.select().from(importParcels).where(eq(importParcels.shipmentId, shipmentId)).orderBy(importParcels.id);
    // Un envío puede tener varios artículos o artículos repetidos de distintas compras.
    const pending = rows.filter((row) => row.accepted + row.missing + row.damaged < row.quantity);
    for (const row of pending) {
      await receiveParcel(tx, {
        parcelId: row.id, accepted: row.quantity - row.missing - row.damaged, missing: row.missing, damaged: row.damaged,
        expectedRevision: row.revision, occurredAt: Math.max(now, shipment.arrivedAt ?? 0),
        reason: "Recepción del despacho", idempotencyKey: sha(`shipment-receipt:${row.id}:${row.revision}`),
      }, actor, now);
    }
    return { changed: pending.length > 0 };
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
  const parcels = await db.select({ parcel: importParcels, shipment: shipments }).from(importParcels)
    .innerJoin(shipments, eq(importParcels.shipmentId, shipments.id))
    .where(inArray(importParcels.allocationId, allocations.map((a) => a.id)));
  const documents = await db.select().from(importDocuments).where(eq(importDocuments.purchaseId, purchaseId));
  const payments = await db.select({ expense: accountingExpenses }).from(importDisbursements)
    .innerJoin(accountingExpenses, eq(importDisbursements.expenseId, accountingExpenses.id)).where(eq(importDisbursements.purchaseId, purchaseId));
  const availablePayments = await db.select().from(accountingExpenses)
    .leftJoin(importDisbursements, eq(accountingExpenses.id, importDisbursements.expenseId))
    .where(isNull(importDisbursements.expenseId)).orderBy(sql`${accountingExpenses.spentAt} desc`).limit(100);
  const history = await db.select().from(importReceipts).where(inArray(importReceipts.parcelId, parcels.map(({ parcel }) => parcel.id))).orderBy(sql`${importReceipts.createdAt} desc`);
  const reservations = await db.select({ r: importReservations, track: orderTracks }).from(importReservations)
    .innerJoin(orderTracks, eq(importReservations.inquiryId, orderTracks.inquiryId)).where(inArray(importReservations.sourceParcelId, parcels.map(({ parcel }) => parcel.id)));
  const holds = [];
  for (const { r, track } of reservations) {
    holds.push({ ...r, track, state: await holdState(db, r.inquiryId), totals: await paymentTotals(db, r.inquiryId) });
  }
  return { allocations, parcels, documents, payments, holds, availablePayments: availablePayments.map((p) => p.accounting_expenses), history };
}

export async function linkableLines(db: Db, productIds: string[]) {
  const orders = await db.select({ id: inquiryLines.id, productId: inquiryLines.productId, ref: inquiryLines.inquiryId, quantity: inquiryLines.quantity, name: inquiries.contactName, fulfillment: inquiryLines.fulfillment })
    .from(inquiryLines).innerJoin(orderTracks, eq(inquiryLines.inquiryId, orderTracks.inquiryId)).innerJoin(inquiries, eq(inquiryLines.inquiryId, inquiries.id))
    .where(and(inArray(inquiryLines.productId, productIds), isNull(orderTracks.cancelledAt)));
  const sold = await db.select({ id: saleLines.id, productId: saleLines.productId, ref: saleLines.saleId, quantity: saleLines.quantity, imported: sales.stockFromImport, status: sales.status })
    .from(saleLines).innerJoin(sales, eq(saleLines.saleId, sales.id))
    .where(and(inArray(saleLines.productId, productIds), or(eq(sales.status, "registrada"), and(eq(sales.status, "agendada"), eq(sales.stockFromImport, true)))));
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
  const reconciled = sql`coalesce((select sum(p.released_stock + p.missing + p.damaged) from import_parcels p where p.allocation_id = ${importAllocations.id}), 0)`;
  const expired = sql`coalesce((select sum(${importReservations.quantity}) from ${importReservations}
    inner join import_parcels p on p.id = ${importReservations.sourceParcelId}
    inner join shipments s on s.id = p.shipment_id
    where p.allocation_id = ${importAllocations.id} and ${importReservations.releasedAt} is null
    and ${importReservations.expiresAt} <= ${now} and not ${paymentEvidence(importReservations.inquiryId)}
    and s.status <> 'recibido_argentina'), 0)`;
  const traveling = sql<number>`(coalesce((select sum(p.quantity) from import_parcels p join shipments s on s.id = p.shipment_id
    where p.allocation_id = ${importAllocations.id} and s.status in ('enviado_proveedor', 'recibido_origen', 'en_transito')), 0) + ${expired})::int`;
  const remaining = sql<number>`(${importAllocations.quantity} - ${reconciled} + ${expired})::int`;
  const availableAt = sql<number | null>`(select min(s.available_at) from import_parcels p join shipments s on s.id = p.shipment_id
    where p.allocation_id = ${importAllocations.id} and p.quantity > p.released_stock + p.missing + p.damaged and s.available_at > ${now})`.mapWith(Number);
  const rows = await db.select({ productId: costPurchaseItems.productId, quantity: remaining, traveling, availableAt })
    .from(importAllocations).innerJoin(costPurchaseItems, eq(importAllocations.itemId, costPurchaseItems.id))
    .innerJoin(costPurchases, eq(costPurchaseItems.purchaseId, costPurchases.id))
    .where(and(eq(importAllocations.destination, "reventa"), or(eq(importAllocations.visibility, "proximamente"), eq(importAllocations.visibility, "preventa")),
      or(sql`${costPurchases.orderedAt} is not null`, eq(costPurchases.managedImport, true)), productId ? eq(costPurchaseItems.productId, productId) : undefined));
  const unassigned = await db.select({ productId: costPurchaseItems.productId,
    quantity: sql<number>`(${costPurchaseItems.quantity} - coalesce((select sum(a.quantity) from import_allocations a where a.item_id = ${costPurchaseItems.id}), 0))::int` })
    .from(costPurchaseItems).innerJoin(costPurchases, eq(costPurchaseItems.purchaseId, costPurchases.id))
    .where(and(eq(costPurchases.managedImport, true), eq(costPurchases.status, "borrador"), productId ? eq(costPurchaseItems.productId, productId) : undefined));
  const result = new Map<string, { quantity: number; traveling: number; availableAt: number | null }>();
  for (const r of [...rows, ...unassigned.map((row) => ({ ...row, traveling: 0, availableAt: null }))]) {
    if (r.quantity <= 0) continue;
    const prev = result.get(r.productId);
    result.set(r.productId, { quantity: (prev?.quantity ?? 0) + r.quantity, traveling: (prev?.traveling ?? 0) + r.traveling,
      availableAt: prev?.availableAt && r.availableAt ? Math.min(prev.availableAt, r.availableAt) : prev?.availableAt ?? r.availableAt });
  }
  return result;
}
