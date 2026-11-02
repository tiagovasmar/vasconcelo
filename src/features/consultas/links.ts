import { and, desc, eq, like } from "drizzle-orm";
import { lockKey, type Tx } from "@/db/lock";
import { inquiries, inquiryEvents, inquirySales, orderEvents, orderTracks } from "@/db/schema";
import { ensureTrack, trackLock } from "@/features/pedidos/service";
import { SaleError } from "@/features/sales/errors";
import type { Actor } from "@/features/catalog/overrides";
import { formatARS } from "@/lib/format";

/**
 * Vínculo consulta ↔ venta. Todo corre DENTRO de la transacción de quien lo llama (registrar la venta, vincular una existente o anularla), así la venta, su
 * descuento de stock, el vínculo y el estado de la consulta quedan juntos o no queda nada.
 *
 * Orden de candados en todo el sistema (evita interbloqueos): clave de la operación → consulta (`inquiry:<id>`) → venta (`sale-void:<id>`) → productos (`override:<id>`, ordenados).
 */
export type InquiryRow = typeof inquiries.$inferSelect;
export type LinkRow = typeof inquirySales.$inferSelect;

export const lockInquiry = (tx: Tx, inquiryId: string) => lockKey(tx, `inquiry:${inquiryId}`);

/** La consulta existe y todavía no tiene una venta vigente. Hay que haber tomado `lockInquiry` antes (la verificación y la inserción quedan serializadas). */
export async function assertConvertible(tx: Tx, inquiryId: string): Promise<InquiryRow> {
  const [inquiry] = await tx.select().from(inquiries).where(eq(inquiries.id, inquiryId));
  if (!inquiry) throw new SaleError(404, "not_found", "La consulta no existe.");
  const [active] = await tx.select().from(inquirySales).where(and(eq(inquirySales.inquiryId, inquiryId), eq(inquirySales.active, true)));
  if (active) throw new SaleError(409, "already_converted", `Esta consulta ya tiene una venta vigente (${active.saleId}). Si fue un error, anulala primero.`, { saleId: active.saleId });
  return inquiry;
}

const addEvent = (tx: Tx, inquiryId: string, kind: string, detail: string, actor: Actor, at: number) =>
  tx.insert(inquiryEvents).values({ inquiryId, kind, detail, actorEmail: actor.email, createdAt: at });

/** Registra el vínculo y marca la consulta como «convertida» (con el contacto confirmado: convertir implica que hubo contacto). */
export async function attachSale(tx: Tx, p: { inquiry: InquiryRow; saleId: string; kind: "convertida" | "vinculada"; totalMinor: number; actor: Actor; now: number }): Promise<void> {
  const { inquiry, saleId, kind, totalMinor, actor, now } = p;
  await tx.insert(inquirySales).values({ inquiryId: inquiry.id, saleId, kind, active: true, createdAt: now, createdByEmail: actor.email });
  await tx.update(inquiries).set({ crmStatus: "convertida", lostReason: null, contactConfirmedAt: inquiry.contactConfirmedAt ?? now }).where(eq(inquiries.id, inquiry.id));
  await openOrderTracking(tx, inquiry.id, saleId, totalMinor, now);
  if (!inquiry.contactConfirmedAt) await addEvent(tx, inquiry.id, "contact_confirmed", kind === "convertida" ? "Contacto confirmado automáticamente al registrar la venta." : "Contacto confirmado automáticamente al vincular la venta.", actor, now);
  await addEvent(tx, inquiry.id, kind === "convertida" ? "sale_created" : "sale_linked",
    kind === "convertida" ? `Venta ${saleId} registrada por ${formatARS(totalMinor)}; descontó el stock de lo vendido.` : `Venta ${saleId} (${formatARS(totalMinor)}) vinculada. No se tocó el stock: ya estaba descontado.`, actor, now);
}

/**
 * La venta se anuló: el vínculo se cierra (queda como historia), la consulta vuelve a «En seguimiento» y puede convertirse de nuevo con otra venta.
 * Solo se llama con el candado de la consulta tomado.
 */
export async function closeLinkOnVoid(tx: Tx, link: LinkRow, p: { saleId: string; reason: string; stockReturned: boolean; actor: Actor; now: number }): Promise<void> {
  await tx.update(inquirySales).set({ active: false, endedAt: p.now, endedReason: p.reason }).where(and(eq(inquirySales.id, link.id), eq(inquirySales.active, true)));
  await tx.update(inquiries).set({ crmStatus: "en_seguimiento" }).where(and(eq(inquiries.id, link.inquiryId), eq(inquiries.crmStatus, "convertida")));
  await cancelOrderTrackingOnVoid(tx, link.inquiryId, p.saleId, p.now, p.actor);
  await addEvent(tx, link.inquiryId, "sale_voided", `Venta ${p.saleId} anulada: ${p.reason}. ${p.stockReturned ? "Stock devuelto una vez." : "No había stock que devolver."} La consulta vuelve a «En seguimiento».`, p.actor, p.now);
}

/**
 * Al confirmarse una venta, el pedido pasa a tener seguimiento (el importe acordado es lo cobrado). Si el seguimiento había quedado cancelado solo por una venta anulada, se reabre;
 * un seguimiento cancelado a mano por el dueño no se toca. Orden de candados: ... → consulta → pedido (`track:`).
 */
async function openOrderTracking(tx: Tx, inquiryId: string, saleId: string, totalMinor: number, now: number): Promise<void> {
  await trackLock(tx, inquiryId);
  const [existing] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId));
  if (!existing) {
    await ensureTrack(tx, inquiryId, now, { agreedMinor: totalMinor, text: "Confirmamos tu pedido." });
    return;
  }
  if (existing.cancelledAt === null) return;
  const [lastVoid] = await tx.select({ id: orderEvents.id }).from(orderEvents).where(and(eq(orderEvents.inquiryId, inquiryId), like(orderEvents.opKey, "void:%"))).orderBy(desc(orderEvents.id)).limit(1);
  const [lastCancel] = await tx.select({ id: orderEvents.id }).from(orderEvents).where(and(eq(orderEvents.inquiryId, inquiryId), like(orderEvents.opKey, "cancel:%"))).orderBy(desc(orderEvents.id)).limit(1);
  if (!lastVoid || (lastCancel && lastCancel.id > lastVoid.id)) return;
  await tx.update(orderTracks).set({ cancelledAt: null, agreedMinor: totalMinor, updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
  await tx.insert(orderEvents).values({ inquiryId, kind: "system", publicText: "Confirmamos nuevamente tu pedido.", internalText: `Reabierto por la venta ${saleId}`, occurredAt: now, createdAt: now });
}

async function cancelOrderTrackingOnVoid(tx: Tx, inquiryId: string, saleId: string, now: number, actor: Actor): Promise<void> {
  await trackLock(tx, inquiryId);
  const [t] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId));
  if (!t || t.cancelledAt !== null || t.stage === "entregado") return;
  await tx.update(orderTracks).set({ cancelledAt: now, updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
  await tx.insert(orderEvents).values({ inquiryId, kind: "system", publicText: "La venta de este pedido se anuló. La tienda se va a comunicar con vos.", internalText: `Venta ${saleId} anulada`, occurredAt: now, createdAt: now, actorEmail: actor.email, opKey: `void:${saleId}` });
}
