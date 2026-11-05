import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Tx } from "@/db/lock";
import { importAllocations, importParcels, inquiryLines, shipments } from "@/db/schema";

export function importShipmentItems(q: Db | Tx, filters: { shipmentId?: string; lineIds?: number[] }) {
  return q.select({
    lineId: inquiryLines.id, inquiryId: inquiryLines.inquiryId, title: inquiryLines.title, sku: inquiryLines.sku,
    qty: importParcels.quantity, accepted: importParcels.accepted, pending: sql<number>`(${importParcels.quantity} - ${importParcels.accepted} - ${importParcels.missing} - ${importParcels.damaged})::int`,
    id: shipments.id, label: sql<string>`'Envío internacional'`, status: shipments.status,
  }).from(importParcels).innerJoin(importAllocations, eq(importParcels.allocationId, importAllocations.id))
    .innerJoin(inquiryLines, eq(importAllocations.orderLineId, inquiryLines.id)).innerJoin(shipments, eq(importParcels.shipmentId, shipments.id))
    .where(and(
      inArray(inquiryLines.fulfillment, ["encargo", "mayorista"]),
      filters.shipmentId ? eq(shipments.id, filters.shipmentId) : undefined,
      filters.lineIds ? inArray(inquiryLines.id, filters.lineIds) : undefined,
    ));
}
