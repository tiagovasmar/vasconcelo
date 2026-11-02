import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { inquiries, inquiryLines, lineDeliveries, orderEvents, orderTracks, shipmentItems, shipments } from "@/db/schema";
import type { Actor } from "@/features/catalog/overrides";
import { noticeForOrder } from "@/features/avisos/outbox";
import { SaleError, type SaleErrorCode } from "@/features/sales/errors";
import { formatARS } from "@/lib/format";
import { advanceFromFacts, ensureTrack, lineProgress, newId, paymentTotals, sha, trackLock } from "./service";
import { rank, SHIPMENT_LABEL, shipmentRank, SHIPMENT_STATUSES, senaFor, type ShipmentStatus, type Stage, type TrackKind } from "./etapas";

/**
 * Envíos internacionales agrupados y entregas parciales. El avance de un envío se refleja SOLO en los artículos (y cantidades) que viajaron en él:
 * lo que quedó fuera sigue como «todavía no viajó». Un pedido puede llegar en varios envíos y entregarse en partes; solo figura «entregado» cuando
 * todas sus unidades fueron entregadas. Nada cambia por el paso del tiempo: cada etapa la carga el dueño con su fecha real.
 *
 * Orden de candados (evita interbloqueos): envío (`shipment:<id>`) → pedidos afectados (`track:<consulta>`, en orden alfabético).
 */
const fail = (status: number, code: SaleErrorCode, message: string, details?: unknown): never => { throw new SaleError(status, code, message, details); };
function parseOr400<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) return fail(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}
const KEY = z.string().min(16, "Falta la clave de la operación.").max(64).regex(/^[A-Za-z0-9_-]+$/, "La clave de la operación no es válida.");
const DATE = z.number({ error: "Elegí la fecha real." }).int().positive().max(4_102_444_800_000);
const TEXT = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).nullish().transform((v) => (v ? v : null));

const DATE_COLUMN: Record<Exclude<ShipmentStatus, "preparando">, "sentAt" | "originReceivedAt" | "transitAt" | "arrivedAt"> = {
  enviado_proveedor: "sentAt", recibido_origen: "originReceivedAt", en_transito: "transitAt", recibido_argentina: "arrivedAt",
};

const shipmentIdFor = (key: string) => `EN-${sha(key).slice(0, 10).toUpperCase()}`;

export const NewShipmentSchema = z.object({ label: z.string().trim().min(2, "Poné un nombre al envío.").max(80), supplier: TEXT(80), internalNote: TEXT(500), idempotencyKey: KEY });

export async function createShipment(db: Db, body: unknown, actor: Actor, now = Date.now()): Promise<{ id: string; replayed: boolean }> {
  const input = parseOr400(NewShipmentSchema, body);
  return db.transaction(async (tx) => {
    await lockKey(tx, `shipment-new:${input.idempotencyKey}`);
    const [again] = await tx.select().from(shipments).where(eq(shipments.id, shipmentIdFor(input.idempotencyKey)));
    if (again) return { id: again.id, replayed: true };
    const id = shipmentIdFor(input.idempotencyKey);
    await tx.insert(shipments).values({ id, label: input.label, supplier: input.supplier, internalNote: input.internalNote, status: "preparando", createdAt: now, createdByEmail: actor.email, updatedAt: now });
    return { id, replayed: false };
  });
}

export const ShipmentItemSchema = z.object({ lineId: z.number().int().positive(), quantity: z.number({ error: "Escribí la cantidad." }).int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1.").max(100_000) });

/** Suma (o ajusta) un artículo de un pedido al envío, mientras el envío se está armando. No se puede enviar más de lo pedido en total entre todos los envíos. */
export async function setShipmentItem(db: Db, shipmentId: string, body: unknown, now = Date.now()): Promise<{ changed: boolean }> {
  const { lineId, quantity } = parseOr400(ShipmentItemSchema, body);
  return db.transaction(async (tx) => {
    await lockKey(tx, `shipment:${shipmentId}`);
    const [sh] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId));
    if (!sh) return fail(404, "not_found", "El envío no existe.");
    if (sh.status !== "preparando") return fail(409, "order_rule", "El envío ya salió: no se pueden cambiar sus artículos.");
    const [line] = await tx.select().from(inquiryLines).where(eq(inquiryLines.id, lineId));
    if (!line) return fail(404, "not_found", "El artículo no existe.");
    if (line.fulfillment !== "encargo" && line.fulfillment !== "mayorista") return fail(409, "order_rule", "Solo los artículos por encargo o mayoristas viajan en un envío internacional (el stock propio ya está en Argentina).");
    await trackLock(tx, line.inquiryId);
    const [track] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, line.inquiryId));
    if (!track || track.cancelledAt) return fail(409, "order_rule", "El pedido no tiene seguimiento activo.");
    if (rank(track.kind as TrackKind, track.stage) < rank(track.kind as TrackKind, "comprado_proveedor")) return fail(409, "order_rule", "El pedido todavía no figura como comprado al proveedor.");
    const [others] = await tx.select({ n: sql<number>`coalesce(sum(${shipmentItems.quantity}), 0)::int` }).from(shipmentItems).where(and(eq(shipmentItems.lineId, lineId), sql`${shipmentItems.shipmentId} <> ${shipmentId}`));
    if (others.n + quantity > line.quantity) return fail(409, "order_rule", `Se pidieron ${line.quantity} unidades y ya hay ${others.n} en otros envíos: en este solo caben ${line.quantity - others.n}.`);
    const [mine] = await tx.select().from(shipmentItems).where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.lineId, lineId)));
    if (mine && mine.quantity === quantity) return { changed: false };
    if (mine) await tx.update(shipmentItems).set({ quantity }).where(eq(shipmentItems.id, mine.id));
    else await tx.insert(shipmentItems).values({ shipmentId, lineId, quantity });
    await tx.update(shipments).set({ updatedAt: now }).where(eq(shipments.id, shipmentId));
    return { changed: true };
  });
}

export async function removeShipmentItem(db: Db, shipmentId: string, lineId: number, now = Date.now()): Promise<{ changed: boolean }> {
  return db.transaction(async (tx) => {
    await lockKey(tx, `shipment:${shipmentId}`);
    const [sh] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId));
    if (!sh) return fail(404, "not_found", "El envío no existe.");
    if (sh.status !== "preparando") return fail(409, "order_rule", "El envío ya salió: no se pueden cambiar sus artículos.");
    const gone = await tx.delete(shipmentItems).where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.lineId, lineId))).returning({ id: shipmentItems.id });
    if (gone.length) await tx.update(shipments).set({ updatedAt: now }).where(eq(shipments.id, shipmentId));
    return { changed: gone.length > 0 };
  });
}

export const ShipmentStatusSchema = z.object({
  status: z.enum(["enviado_proveedor", "recibido_origen", "en_transito", "recibido_argentina"], { error: "Elegí el estado del envío." }),
  occurredAt: DATE,
  publicNote: TEXT(300),
  idempotencyKey: KEY,
});

const ARRIVAL_STAGE: Record<string, Stage> = { enviado_proveedor: "enviado_proveedor", recibido_origen: "recibido_origen", en_transito: "en_transito", recibido_argentina: "recibido_argentina" };

/**
 * Avanza un envío agrupado (siempre hacia adelante, con la fecha real). Para cada pedido con artículos en el envío: deja un hecho en su línea de tiempo con QUÉ viajó, avisa
 * (una sola vez) y, solo si TODAS las unidades del pedido ya alcanzaron esa etapa, avanza también la etapa del pedido. Lo que no viajó no se marca como recibido.
 */
export async function updateShipmentStatus(db: Db, shipmentId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ status: string; changed: boolean; orders: number }> {
  const input = parseOr400(ShipmentStatusSchema, body);
  return db.transaction(async (tx) => {
    await lockKey(tx, `shipment:${shipmentId}`);
    const [sh] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId));
    if (!sh) return fail(404, "not_found", "El envío no existe.");
    if (sh.status === input.status) return { status: sh.status, changed: false, orders: 0 };
    if (shipmentRank(input.status) < shipmentRank(sh.status)) return fail(409, "order_rule", "El envío ya pasó por esa etapa: los estados solo avanzan.");
    const items = await tx.select({ si: shipmentItems, line: inquiryLines }).from(shipmentItems).innerJoin(inquiryLines, eq(inquiryLines.id, shipmentItems.lineId)).where(eq(shipmentItems.shipmentId, shipmentId));
    if (!items.length) return fail(409, "order_rule", "El envío no tiene artículos: agregá al menos uno antes de marcarlo como enviado.");
    const inquiryIds = [...new Set(items.map((i) => i.line.inquiryId))].sort();
    for (const id of inquiryIds) await trackLock(tx, id);
    await tx.update(shipments).set({ status: input.status, [DATE_COLUMN[input.status]]: input.occurredAt, updatedAt: now }).where(eq(shipments.id, shipmentId));
    for (const inquiryId of inquiryIds) {
      const mine = items.filter((i) => i.line.inquiryId === inquiryId);
      const detail = mine.map((i) => `${i.si.quantity} × ${i.line.title}`).join(", ");
      await tx.insert(orderEvents).values({ inquiryId, kind: "shipment", publicText: `${SHIPMENT_LABEL[input.status]}: ${detail}.${input.publicNote ? ` ${input.publicNote}` : ""}`, internalText: `Envío ${shipmentId} (${sh.label}) → ${input.status}`, occurredAt: input.occurredAt, createdAt: now, actorEmail: actor.email, opKey: `ship:${input.idempotencyKey}:${inquiryId}` });
      let advanced = false;
      try {
        advanced = await advanceFromFacts(tx, inquiryId, ARRIVAL_STAGE[input.status], input.occurredAt, actor, now, shipmentId);
      } catch (e) {
        if (!(e instanceof SaleError)) throw e; // todavía no llegaron todas las unidades: el pedido sigue en su etapa y los artículos muestran su avance
      }
      if (!advanced) {
        if (input.status === "recibido_argentina") await noticeForOrder(tx, inquiryId, "llegada_parcial", shipmentId, now, `Llegó: ${detail}.`);
        else if (input.status === "enviado_proveedor") await noticeForOrder(tx, inquiryId, "enviado_proveedor", shipmentId, now, `Salió: ${detail}.`);
      }
    }
    return { status: input.status, changed: true, orders: inquiryIds.length };
  });
}

/* ---------- Entregas parciales ---------- */

export const DeliverySchema = z.object({
  lines: z.array(z.object({ lineId: z.number().int().positive(), quantity: z.number({ error: "Escribí la cantidad." }).int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1.") })).min(1, "Elegí qué artículos se entregaron.").max(60),
  method: z.enum(["envio", "retiro"], { error: "Elegí si se envió o se retiró." }),
  deliveredAt: DATE,
  publicNote: TEXT(300),
  idempotencyKey: KEY,
});

/** Registra una entrega (parcial o total). Solo puede entregarse lo que ya está en Argentina y no fue entregado. El pedido pasa a «entregado» cuando no queda ninguna unidad por entregar. */
export async function recordDelivery(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ replayed: boolean; complete: boolean }> {
  const input = parseOr400(DeliverySchema, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    const opKey = `${input.idempotencyKey}`;
    const [again] = await tx.select({ id: lineDeliveries.id }).from(lineDeliveries).where(eq(lineDeliveries.opKey, `${opKey}:${input.lines[0].lineId}`));
    if (again) return { replayed: true, complete: false };
    const track = await ensureTrack(tx, inquiryId, now);
    if (track.cancelledAt) return fail(409, "order_rule", "El pedido está cancelado.");
    const kind = track.kind as TrackKind;
    if (new Set(input.lines.map((l) => l.lineId)).size !== input.lines.length) return fail(400, "invalid_input", "Un artículo no puede repetirse en la misma entrega.");
    const progress = await lineProgress(tx, inquiryId);
    for (const l of input.lines) {
      const p = progress.find((x) => x.lineId === l.lineId);
      if (!p) return fail(404, "not_found", "Ese artículo no pertenece al pedido.");
      if (l.quantity > p.deliverable) return fail(409, "order_rule", `De «${p.title}» solo hay ${p.deliverable} ${p.deliverable === 1 ? "unidad lista" : "unidades listas"} para entregar (llegadas y sin entregar); querés entregar ${l.quantity}.`);
    }
    if (kind !== "stock") {
      const { confirmedMinor } = await paymentTotals(tx, inquiryId);
      const sena = senaFor(track.agreedMinor);
      if (track.agreedMinor === null || sena === null) return fail(409, "order_rule", "Falta confirmar el importe acordado.");
      if (confirmedMinor < track.agreedMinor) return fail(409, "order_rule", `Antes de entregar tiene que estar confirmado el pago completo (${formatARS(track.agreedMinor)}); hay confirmado ${formatARS(confirmedMinor)}.`);
    }
    for (const l of input.lines) await tx.insert(lineDeliveries).values({ inquiryId, lineId: l.lineId, quantity: l.quantity, method: input.method, deliveredAt: input.deliveredAt, publicNote: input.publicNote, opKey: `${opKey}:${l.lineId}`, createdByEmail: actor.email, createdAt: now });
    const detail = input.lines.map((l) => `${l.quantity} × ${progress.find((x) => x.lineId === l.lineId)!.title}`).join(", ");
    await tx.insert(orderEvents).values({ inquiryId, kind: "delivery", publicText: `${input.method === "retiro" ? "Retiraste" : "Te enviamos"}: ${detail}.${input.publicNote ? ` ${input.publicNote}` : ""}`, internalText: null, occurredAt: input.deliveredAt, createdAt: now, actorEmail: actor.email });
    const after = await lineProgress(tx, inquiryId);
    const complete = after.every((l) => l.delivered >= l.quantity);
    if (complete) {
      await advanceFromFacts(tx, inquiryId, "entregado", input.deliveredAt, actor, now, opKey);
    } else {
      await noticeForOrder(tx, inquiryId, "entrega_parcial", opKey, now, `Entrega registrada: ${detail}.`);
    }
    return { replayed: false, complete };
  });
}

/* ---------- Consultas para el panel ---------- */

export async function listShipments(db: Db) {
  const rows = await db.select().from(shipments).orderBy(desc(shipments.createdAt));
  if (!rows.length) return [];
  const items = await db.select({ si: shipmentItems, line: inquiryLines }).from(shipmentItems).innerJoin(inquiryLines, eq(inquiryLines.id, shipmentItems.lineId)).where(inArray(shipmentItems.shipmentId, rows.map((r) => r.id)));
  return rows.map((s) => ({ ...s, items: items.filter((i) => i.si.shipmentId === s.id).map((i) => ({ lineId: i.line.id, inquiryId: i.line.inquiryId, title: i.line.title, sku: i.line.sku, quantity: i.si.quantity })) }));
}

/** Artículos de encargos y mayoristas que pueden sumarse a un envío (pedido comprado al proveedor, con unidades sin enviar). */
export async function shippableLines(db: Db) {
  const rows = await db.select({ line: inquiryLines, track: orderTracks, name: inquiries.contactName }).from(inquiryLines).innerJoin(orderTracks, eq(orderTracks.inquiryId, inquiryLines.inquiryId)).innerJoin(inquiries, eq(inquiries.id, inquiryLines.inquiryId))
    .where(and(inArray(inquiryLines.fulfillment, ["encargo", "mayorista"]), sql`${orderTracks.cancelledAt} is null`));
  const out: Array<{ lineId: number; inquiryId: string; name: string | null; title: string; sku: string; quantity: number; notShipped: number }> = [];
  for (const r of rows) {
    const kind = r.track.kind as TrackKind;
    if (rank(kind, r.track.stage) < rank(kind, "comprado_proveedor")) continue;
    const [used] = await db.select({ n: sql<number>`coalesce(sum(${shipmentItems.quantity}), 0)::int` }).from(shipmentItems).where(eq(shipmentItems.lineId, r.line.id));
    if (r.line.quantity - used.n > 0) out.push({ lineId: r.line.id, inquiryId: r.line.inquiryId, name: r.name, title: r.line.title, sku: r.line.sku, quantity: r.line.quantity, notShipped: r.line.quantity - used.n });
  }
  return out;
}

export { SHIPMENT_STATUSES, newId };
