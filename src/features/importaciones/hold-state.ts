import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Tx } from "@/db/lock";
import { importParcels, importReservations, orderPayments, paymentReceipts } from "@/db/schema";
import { SaleError } from "@/features/sales/errors";

export function preorderHours(): number | null {
  const hours = Number(process.env.IMPORT_PREORDER_HOLD_HOURS);
  return process.env.IMPORT_PREORDERS_ENABLED === "1" && Number.isInteger(hours) && hours >= 1 && hours <= 168 ? hours : null;
}

export const paymentEvidence = (inquiryId: typeof importReservations.inquiryId) => sql<boolean>`(
  exists (select 1 from ${paymentReceipts} where ${paymentReceipts.inquiryId} = ${inquiryId} and ${paymentReceipts.status} = 'pendiente_revision')
  or exists (select 1 from ${orderPayments} where ${orderPayments.inquiryId} = ${inquiryId} and ${orderPayments.status} = 'confirmado')
)`;

export async function holdState(q: Db | Tx, inquiryId: string, now = Date.now()) {
  const [hold] = await q.select({ expiresAt: importReservations.expiresAt, releasedAt: importReservations.releasedAt, hasEvidence: paymentEvidence(importReservations.inquiryId), accepted: importParcels.accepted })
    .from(importReservations).leftJoin(importParcels, eq(importReservations.heldParcelId, importParcels.id)).where(eq(importReservations.inquiryId, inquiryId));
  if (!hold) return null;
  return { ...hold, expired: Boolean(hold.releasedAt) || (hold.expiresAt <= now && !hold.hasEvidence && !hold.accepted) };
}

export async function assertHoldActive(tx: Tx, inquiryId: string, now: number) {
  const hold = await holdState(tx, inquiryId, now);
  if (hold?.expired) throw new SaleError(409, "order_rule", "La retención venció. Si ya transferiste, contactá a la tienda con la referencia de este pedido.");
  return hold;
}
