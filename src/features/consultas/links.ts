import { and, eq } from "drizzle-orm";
import { lockKey, type Tx } from "@/db/lock";
import { inquiries, inquiryEvents, inquirySales } from "@/db/schema";
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
  await addEvent(tx, link.inquiryId, "sale_voided", `Venta ${p.saleId} anulada: ${p.reason}. ${p.stockReturned ? "Stock devuelto una vez." : "No había stock que devolver."} La consulta vuelve a «En seguimiento».`, p.actor, p.now);
}
