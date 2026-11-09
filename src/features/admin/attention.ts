import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { costPurchaseItems, importAllocations, importParcels, notificationOutbox, orderTracks, paymentReceipts, shipments } from "@/db/schema";

export async function adminAttention(db: Db) {
  const [receipts, ready, purchases, notices] = await Promise.all([
    db.select({ id: paymentReceipts.inquiryId, n: sql<number>`(sum(count(*)) over ())::int` })
      .from(paymentReceipts).innerJoin(orderTracks, eq(orderTracks.inquiryId, paymentReceipts.inquiryId))
      .where(eq(paymentReceipts.status, "pendiente_revision")).groupBy(paymentReceipts.inquiryId)
      .orderBy(sql`min(${paymentReceipts.createdAt})`).limit(1),
    db.select({ id: orderTracks.inquiryId, n: sql<number>`(count(*) over ())::int` }).from(orderTracks)
      .where(and(eq(orderTracks.stage, "listo_retiro"), isNull(orderTracks.cancelledAt)))
      .orderBy(orderTracks.updatedAt).limit(1),
    db.select({ id: costPurchaseItems.purchaseId, n: sql<number>`(count(*) over ())::int` }).from(importParcels)
      .innerJoin(shipments, eq(shipments.id, importParcels.shipmentId))
      .innerJoin(importAllocations, eq(importAllocations.id, importParcels.allocationId))
      .innerJoin(costPurchaseItems, eq(costPurchaseItems.id, importAllocations.itemId))
      .where(and(ne(shipments.status, "preparando"), gt(importParcels.quantity, sql`${importParcels.accepted} + ${importParcels.missing} + ${importParcels.damaged}`)))
      .groupBy(costPurchaseItems.purchaseId)
      .orderBy(desc(sql`bool_or(${shipments.status} = 'recibido_argentina')`), costPurchaseItems.purchaseId).limit(1),
    db.select({ id: notificationOutbox.id, n: sql<number>`(count(*) over ())::int` }).from(notificationOutbox)
      .where(eq(notificationOutbox.status, "fallido")).orderBy(desc(notificationOutbox.createdAt), desc(notificationOutbox.id)).limit(1),
  ]);
  return { receipt: receipts[0], ready: ready[0], purchase: purchases[0], failed: notices[0] };
}
