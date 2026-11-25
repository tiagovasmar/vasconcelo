import { and, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { adminRecordArchives, costPurchases, orderEvents, orderTracks } from "@/db/schema";
import type { Actor } from "@/features/catalog/overrides";
import { SaleError } from "@/features/sales/errors";

export type RecordKind = "purchase" | "wholesale";
const inputSchema = z.object({
  kind: z.enum(["purchase", "wholesale"]),
  recordId: z.string().trim().min(1).max(80),
  archived: z.boolean(),
});

export function recordArchiveFilter(kind: RecordKind, recordId: SQL, archived = false) {
  const exists = sql`exists (select 1 from ${adminRecordArchives} where ${adminRecordArchives.kind} = ${kind} and ${adminRecordArchives.recordId} = ${recordId} and ${adminRecordArchives.archivedAt} is not null)`;
  return archived ? exists : sql`not ${exists}`;
}

export async function isRecordArchived(db: Db, kind: RecordKind, recordId: string) {
  const [row] = await db.select().from(adminRecordArchives).where(and(eq(adminRecordArchives.kind, kind), eq(adminRecordArchives.recordId, recordId)));
  return row?.archivedAt != null;
}

/** Solo cambia visibilidad administrativa. No cancela operaciones ni borra hechos financieros. */
export async function setRecordArchived(db: Db, body: unknown, actor: Actor, now = Date.now()) {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Elegí un pedido mayorista o una compra válidos.");
  const { kind, recordId, archived } = parsed.data;
  return db.transaction(async (tx) => {
    await lockKey(tx, kind === "purchase" ? `cost-purchase:${recordId}` : `track:${recordId}`);
    if (kind === "purchase") {
      const [purchase] = await tx.select({ id: costPurchases.id }).from(costPurchases).where(eq(costPurchases.id, recordId));
      if (!purchase) throw new SaleError(404, "not_found", "La compra no existe.");
    } else {
      const [track] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, recordId));
      if (!track || track.kind !== "mayorista") throw new SaleError(404, "not_found", "El pedido mayorista no existe.");
    }
    const where = and(eq(adminRecordArchives.kind, kind), eq(adminRecordArchives.recordId, recordId));
    const [current] = await tx.select().from(adminRecordArchives).where(where);
    if ((current?.archivedAt != null) === archived) return { changed: false };
    const values = { archivedAt: archived ? now : null, updatedAt: now, updatedByEmail: actor.email };
    await tx.insert(adminRecordArchives).values({ kind, recordId, ...values }).onConflictDoUpdate({ target: [adminRecordArchives.kind, adminRecordArchives.recordId], set: values });
    if (kind === "wholesale") await tx.insert(orderEvents).values({ inquiryId: recordId, kind: "system", internalText: archived ? "Eliminado de la lista principal del panel. Pagos y operaciones conservados." : "Restaurado en la lista principal del panel.", occurredAt: now, createdAt: now, actorEmail: actor.email });
    return { changed: true };
  });
}
