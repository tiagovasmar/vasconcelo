import { holdState } from "@/features/importaciones/hold-state";
import { importShipmentItems } from "@/features/importaciones/tracking";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey, type Tx } from "@/db/lock";
import {
  inquiries, inquiryLines, lineDeliveries, notificationOutbox, orderEvents, orderIncidents, orderPayments, orderRefunds, orderTracks, paymentReceipts, shipmentItems, shipments,
} from "@/db/schema";
import type { Actor } from "@/features/catalog/overrides";
import { noticeForOrder, type NoticeEvent } from "@/features/avisos/outbox";
import { SaleError, type SaleErrorCode } from "@/features/sales/errors";
import { formatARS } from "@/lib/format";
import { encargo } from "@/content/politicas";
import {
  firstStage, isShippingStage, nextAction, rank, senaFor, shipmentRank, STAGE_LABEL, stagesFor, summarizePayments, type Stage, type TrackKind,
} from "./etapas";

/**
 * Seguimiento de pedidos sobre las consultas y ventas existentes (no hay un sistema paralelo). Reglas:
 *  - TODA mutación toma el candado `track:<consulta>` y es idempotente (clave de operación o cambio nulo);
 *  - las etapas las carga el dueño con fechas reales: nada avanza por el paso del tiempo;
 *  - un envío agrupado marca como llegados solo los artículos que viajaron en él; el pedido figura «entregado» únicamente con todas sus unidades entregadas;
 *  - las notas internas, los costos y los datos bancarios JAMÁS salen en la vista de la cliente (`CustomerOrderView` no tiene esos campos).
 */
export const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newId = (prefix: string): string => `${prefix}-${Array.from(randomBytes(8), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("")}`;
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const fail = (status: number, code: SaleErrorCode, message: string, details?: unknown): never => { throw new SaleError(status, code, message, details); };

export const trackLock = (tx: Tx, inquiryId: string) => lockKey(tx, `track:${inquiryId}`);

/* ---------- Apertura del seguimiento ---------- */

type TrackRow = typeof orderTracks.$inferSelect;
type LineRow = typeof inquiryLines.$inferSelect;

export function kindOf(inq: { orderKind: string }, lines: Array<{ fulfillment: string }>): TrackKind {
  if (inq.orderKind === "mayorista") return "mayorista";
  return lines.some((l) => l.fulfillment === "encargo") ? "encargo" : "stock";
}

/** Abre el seguimiento si no existe (idempotente). Hay que haber tomado `trackLock` si se llama dentro de una transacción de escritura concurrente. */
export async function ensureTrack(tx: Tx, inquiryId: string, now: number, opts: { agreedMinor?: number | null; stage?: Stage; text?: string } = {}): Promise<TrackRow> {
  const [existing] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId));
  if (existing) return existing;
  const [inq] = await tx.select().from(inquiries).where(eq(inquiries.id, inquiryId));
  if (!inq) return fail(404, "not_found", "La consulta no existe.");
  const lines = await tx.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, inquiryId));
  const kind = kindOf(inq, lines);
  const stage = opts.stage ?? firstStage(kind);
  const [row] = await tx.insert(orderTracks).values({ inquiryId, kind, stage, agreedMinor: opts.agreedMinor ?? null, createdAt: now, updatedAt: now }).onConflictDoNothing().returning();
  if (!row) return (await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId)))[0];
  await tx.insert(orderEvents).values({ inquiryId, kind: "stage", stage, publicText: opts.text ?? STAGE_LABEL[stage], occurredAt: now, createdAt: now, actorEmail: null });
  return row;
}

/** Abre el seguimiento de una consulta desde el panel. */
export async function openTracking(db: Db, inquiryId: string, now = Date.now()): Promise<{ track: TrackRow }> {
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    return { track: await ensureTrack(tx, inquiryId, now) };
  });
}

/* ---------- Progreso por artículo (entregas parciales) ---------- */

export type LineProgress = {
  lineId: number; productId: string; sku: string; title: string; language: string; quantity: number; fulfillment: string;
  /** Unidades en envíos que todavía no llegaron a Argentina. */
  inTransit: number;
  /** Unidades ya recibidas en Argentina (en artículos de stock: todas). */
  arrived: number;
  delivered: number;
  /** Unidades que todavía no viajaron en ningún envío (solo encargos y mayoristas). */
  notShipped: number;
  /** Unidades listas para entregar ahora (llegadas y todavía no entregadas). */
  deliverable: number;
  shipments: Array<{ id: string; label: string; status: string; quantity: number }>;
};

const SHIPPABLE = (f: string) => f === "encargo" || f === "mayorista";

export async function lineProgress(q: Db | Tx, inquiryId: string): Promise<LineProgress[]> {
  const lines = await q.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, inquiryId)).orderBy(inquiryLines.id);
  if (!lines.length) return [];
  const ids = lines.map((l) => l.id);
  const [legacy, dl, imports] = await Promise.all([
    q.select({ lineId: shipmentItems.lineId, qty: shipmentItems.quantity, id: shipments.id, label: shipments.label, status: shipments.status }).from(shipmentItems).innerJoin(shipments, eq(shipments.id, shipmentItems.shipmentId)).where(inArray(shipmentItems.lineId, ids)),
    q.select({ lineId: lineDeliveries.lineId, qty: sql<number>`sum(${lineDeliveries.quantity})::int` }).from(lineDeliveries).where(inArray(lineDeliveries.lineId, ids)).groupBy(lineDeliveries.lineId),
    importShipmentItems(q, { lineIds: ids }),
  ]);
  const sh = [...legacy, ...imports.flatMap((r) => {
    if (r.status !== "recibido_argentina") return [r];
    return [
      { ...r, qty: r.accepted },
      { ...r, qty: r.pending, status: "pendiente_revision" },
    ].filter((row) => row.qty > 0);
  })];
  return lines.map((l) => {
    const mine = sh.filter((s) => s.lineId === l.id);
    const delivered = dl.find((d) => d.lineId === l.id)?.qty ?? 0;
    if (!SHIPPABLE(l.fulfillment)) return { lineId: l.id, productId: l.productId, sku: l.sku, title: l.title, language: l.language, quantity: l.quantity, fulfillment: l.fulfillment, inTransit: 0, arrived: l.quantity, delivered, notShipped: 0, deliverable: l.quantity - delivered, shipments: [] };
    const arrived = mine.filter((s) => s.status === "recibido_argentina").reduce((n, s) => n + s.qty, 0);
    const inTransit = mine.filter((s) => s.status !== "recibido_argentina").reduce((n, s) => n + s.qty, 0);
    const shipped = arrived + inTransit;
    return { lineId: l.id, productId: l.productId, sku: l.sku, title: l.title, language: l.language, quantity: l.quantity, fulfillment: l.fulfillment, inTransit, arrived, delivered, notShipped: Math.max(l.quantity - shipped, 0), deliverable: Math.max(arrived - delivered, 0), shipments: mine.map((s) => ({ id: s.id, label: s.label, status: s.status, quantity: s.qty })) };
  });
}

/* ---------- Pagos del pedido ---------- */

export async function paymentTotals(q: Db | Tx, inquiryId: string): Promise<{ confirmedMinor: number; pendingReceipts: number }> {
  const [p] = await q.select({ n: sql<number>`coalesce(sum(${orderPayments.amountMinor}), 0)::bigint` }).from(orderPayments).where(and(eq(orderPayments.inquiryId, inquiryId), eq(orderPayments.status, "confirmado")));
  const [r] = await q.select({ n: sql<number>`count(*)::int` }).from(paymentReceipts).where(and(eq(paymentReceipts.inquiryId, inquiryId), eq(paymentReceipts.status, "pendiente_revision")));
  return { confirmedMinor: Number(p.n), pendingReceipts: r.n };
}

/* ---------- Cambios de etapa ---------- */

const KEY = z.string().min(16, "Falta la clave de la operación.").max(64).regex(/^[A-Za-z0-9_-]+$/, "La clave de la operación no es válida.");
const DATE = z.number({ error: "Elegí la fecha real del hecho." }).int().positive().max(4_102_444_800_000);
const TEXT = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).nullish().transform((v) => (v ? v : null));

export const StageInputSchema = z.object({
  stage: z.string().min(1).max(40),
  occurredAt: DATE,
  publicNote: TEXT(300),
  internalNote: TEXT(500),
  /** Permite retroceder una etapa cargada por error (queda registrado como corrección). */
  correction: z.boolean().optional().default(false),
  idempotencyKey: KEY,
});

const NOTICE_FOR_STAGE: Partial<Record<Stage, NoticeEvent>> = { enviado_proveedor: "enviado_proveedor", recibido_argentina: "llegada_argentina", listo_retiro: "listo_retirar", enviado: "despachado", entregado: "entregado" };

function parseOr400<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) return fail(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

/** Verifica las reglas de negocio que impiden contradecir los hechos registrados (pagos, envíos, entregas). */
async function assertStageAllowed(tx: Tx, track: TrackRow, stage: Stage): Promise<void> {
  const kind = track.kind as TrackKind;
  const { confirmedMinor } = await paymentTotals(tx, track.inquiryId);
  const progress = await lineProgress(tx, track.inquiryId);
  const shippable = progress.filter((l) => SHIPPABLE(l.fulfillment));
  if (kind !== "stock" && rank(kind, stage) >= rank(kind, "confirmado_tienda") && track.agreedMinor === null) {
    fail(409, "order_rule", "Primero confirmá el importe acordado del pedido.");
  }
  if (kind !== "stock" && stage === "sena_confirmada") {
    const sena = senaFor(track.agreedMinor);
    if (sena === null || confirmedMinor < sena) fail(409, "order_rule", `La seña del ${encargo.senaPercent}% (${sena === null ? "sin importe acordado" : formatARS(sena)}) todavía no está confirmada: registrá antes el pago recibido.`);
  }
  if (kind !== "stock" && rank(kind, stage) >= rank(kind, "comprado_proveedor") && rank(kind, track.stage) < rank(kind, "sena_confirmada")) {
    const sena = senaFor(track.agreedMinor);
    if (sena === null || confirmedMinor < sena) fail(409, "order_rule", "No se puede comprar al proveedor sin la seña confirmada.");
  }
  if (isShippingStage(stage) && kind !== "stock") {
    const need = shipmentRank(stage);
    const short = shippable.filter((l) => l.quantity - delivered0(l) > 0).reduce((n, l) => n + Math.max(unitsBelow(l, progress, need), 0), 0);
    if (short > 0) fail(409, "order_rule", `Todavía hay ${short} ${short === 1 ? "unidad" : "unidades"} que no ${short === 1 ? "alcanzó" : "alcanzaron"} esa etapa en un envío. Actualizá el envío agrupado (el pedido avanza solo cuando todas las unidades llegaron a esa etapa) o dejá el pedido en su etapa actual.`);
  }
  if ((stage === "enviado" || stage === "listo_retiro") && kind !== "stock") {
    const allArrived = shippable.every((l) => l.arrived >= l.quantity || l.delivered >= l.quantity);
    if (!allArrived) fail(409, "order_rule", "Hay artículos que todavía no llegaron a Argentina: usá «Entrega parcial» para entregar lo que ya llegó.");
    if (track.agreedMinor !== null && confirmedMinor < track.agreedMinor) fail(409, "order_rule", `Antes del despacho o del retiro tiene que estar confirmado el pago completo (${formatARS(track.agreedMinor)}). Hay confirmado ${formatARS(confirmedMinor)}.`);
  }
  if (stage === "entregado") {
    const open = progress.filter((l) => l.delivered < l.quantity);
    if (open.length) fail(409, "order_rule", `No se puede marcar entregado: faltan entregar ${open.reduce((n, l) => n + (l.quantity - l.delivered), 0)} unidades. Registrá cada entrega (parcial o total) y el pedido figura entregado cuando estén todas.`);
  }
}
const delivered0 = (l: LineProgress) => l.delivered;
/** Unidades del artículo que NO llegaron al menos a la etapa `need` (las ya entregadas cuentan como cumplidas). */
function unitsBelow(l: LineProgress, all: LineProgress[], need: number): number {
  void all;
  const reached = l.shipments.filter((s) => shipmentRank(s.status) >= need).reduce((n, s) => n + s.quantity, 0);
  return l.quantity - Math.max(reached, l.delivered);
}

export async function setStage(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now(), opts: { skipChecks?: boolean } = {}): Promise<{ stage: string; changed: boolean; replayed: boolean }> {
  const input = parseOr400(StageInputSchema, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    const done = await tx.select({ id: orderEvents.id }).from(orderEvents).where(eq(orderEvents.opKey, `stage:${input.idempotencyKey}`));
    if (done.length) { const t = await ensureTrack(tx, inquiryId, now); return { stage: t.stage, changed: false, replayed: true }; }
    const track = await ensureTrack(tx, inquiryId, now);
    const kind = track.kind as TrackKind;
    if (track.cancelledAt) return fail(409, "order_rule", "El pedido está cancelado: no se puede cambiar su etapa.");
    if (!stagesFor(kind).includes(input.stage as Stage)) return fail(400, "invalid_input", "Esa etapa no existe para este tipo de pedido.");
    const stage = input.stage as Stage;
    if (stage === track.stage) return { stage, changed: false, replayed: false };
    const backwards = rank(kind, stage) < rank(kind, track.stage);
    if (backwards && !input.correction) return fail(409, "order_rule", "La etapa es anterior a la actual. Si cargaste una etapa por error, marcá «Corregir».");
    if (!backwards && !opts.skipChecks) await assertStageAllowed(tx, track, stage);
    if (track.stage === "entregado" && !input.correction) return fail(409, "order_rule", "El pedido ya figura entregado.");
    await tx.update(orderTracks).set({ stage, updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
    await tx.insert(orderEvents).values({ inquiryId, kind: "stage", stage, publicText: backwards ? `Corrección: ${STAGE_LABEL[stage]}` : (input.publicNote ? `${STAGE_LABEL[stage]}. ${input.publicNote}` : STAGE_LABEL[stage]), internalText: input.internalNote, occurredAt: input.occurredAt, createdAt: now, actorEmail: actor.email, opKey: `stage:${input.idempotencyKey}` });
    const ev = NOTICE_FOR_STAGE[stage];
    if (ev && !backwards) await noticeForOrder(tx, inquiryId, ev, stage, now);
    return { stage, changed: true, replayed: false };
  });
}

/** Cambia la etapa como consecuencia de un hecho ya registrado por el dueño (llegada de un envío, entrega final): reutiliza las mismas reglas, sin clave propia. */
export async function advanceFromFacts(tx: Tx, inquiryId: string, stage: Stage, occurredAt: number, actor: Actor, now: number, once: string, publicNote?: string): Promise<boolean> {
  const track = await ensureTrack(tx, inquiryId, now);
  const kind = track.kind as TrackKind;
  if (track.cancelledAt || !stagesFor(kind).includes(stage) || rank(kind, stage) <= rank(kind, track.stage)) return false;
  await assertStageAllowed(tx, track, stage);
  await tx.update(orderTracks).set({ stage, updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
  await tx.insert(orderEvents).values({ inquiryId, kind: "stage", stage, publicText: publicNote ? `${STAGE_LABEL[stage]}. ${publicNote}` : STAGE_LABEL[stage], occurredAt, createdAt: now, actorEmail: actor.email, opKey: `stage-auto:${inquiryId}:${stage}:${once}` });
  const ev = NOTICE_FOR_STAGE[stage];
  if (ev) await noticeForOrder(tx, inquiryId, ev, stage, now);
  return true;
}

/* ---------- Importe acordado, notas y cancelación ---------- */

export const AgreedSchema = z.object({
  agreedMinor: z.number({ error: "Escribí el importe acordado." }).int().min(10_000, "El importe acordado debe ser de al menos $100.").max(1_000_000_000_00, "El importe es demasiado alto.").multipleOf(100, "El importe debe estar en pesos enteros."),
});

/** Fija el importe acordado y confirmado por la tienda. Mientras no haya pagos confirmados se puede corregir; después, no (cambiaría el cálculo de lo ya abonado). */
export async function setAgreedAmount(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ agreedMinor: number; changed: boolean }> {
  const { agreedMinor } = parseOr400(AgreedSchema, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    const track = await ensureTrack(tx, inquiryId, now);
    if (await holdState(tx, inquiryId, now) && agreedMinor !== track.agreedMinor) return fail(409, "order_rule", "El importe de la preventa quedó acordado al solicitar la reserva.");
    if (track.cancelledAt) return fail(409, "order_rule", "El pedido está cancelado.");
    if (track.agreedMinor === agreedMinor) return { agreedMinor, changed: false };
    const { confirmedMinor } = await paymentTotals(tx, inquiryId);
    if (confirmedMinor > 0) return fail(409, "order_rule", "Ya hay pagos confirmados: el importe acordado no se puede cambiar. Registrá la diferencia como una nota o un ajuste explícito.");
    await tx.update(orderTracks).set({ agreedMinor, updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
    await tx.insert(orderEvents).values({ inquiryId, kind: "system", publicText: `Importe acordado: ${formatARS(agreedMinor)}.`, internalText: track.agreedMinor === null ? null : `Antes: ${formatARS(track.agreedMinor)}`, occurredAt: now, createdAt: now, actorEmail: actor.email });
    return { agreedMinor, changed: true };
  });
}

export const NoteSchema = z.object({
  publicText: TEXT(400),
  internalText: TEXT(1000),
  occurredAt: DATE.optional(),
  idempotencyKey: KEY,
}).refine((v) => v.publicText || v.internalText, "Escribí una nota pública o interna.");

export async function addNote(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ replayed: boolean }> {
  const input = parseOr400(NoteSchema, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    const done = await tx.select({ id: orderEvents.id }).from(orderEvents).where(eq(orderEvents.opKey, `note:${input.idempotencyKey}`));
    if (done.length) return { replayed: true };
    await ensureTrack(tx, inquiryId, now);
    await tx.insert(orderEvents).values({ inquiryId, kind: "note", publicText: input.publicText, internalText: input.internalText, occurredAt: input.occurredAt ?? now, createdAt: now, actorEmail: actor.email, opKey: `note:${input.idempotencyKey}` });
    return { replayed: false };
  });
}

export const CancelSchema = z.object({ reason: z.string().trim().min(3, "Escribí el motivo.").max(300), publicText: TEXT(300), idempotencyKey: KEY });

/** Cancela el pedido. NO reintegra dinero ni devuelve stock: los reintegros se registran aparte (y el stock, si correspondiera, con la anulación de la venta). */
export async function cancelOrder(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  const input = parseOr400(CancelSchema, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    const track = await ensureTrack(tx, inquiryId, now);
    if (track.cancelledAt) return { changed: false };
    if (track.stage === "entregado") return fail(409, "order_rule", "Un pedido entregado no se puede cancelar.");
    await tx.update(orderTracks).set({ cancelledAt: now, updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
    await tx.insert(orderEvents).values({ inquiryId, kind: "system", publicText: input.publicText ?? "El pedido fue cancelado. Si corresponde un reintegro, su estado se informa acá.", internalText: `Cancelado: ${input.reason}`, occurredAt: now, createdAt: now, actorEmail: actor.email, opKey: `cancel:${input.idempotencyKey}` });
    return { changed: true };
  });
}

/* ---------- Enlace privado de seguimiento para invitados ---------- */

/** Genera (o reemplaza) el enlace privado. El valor se devuelve UNA vez; en la base solo queda su hash. Generar uno nuevo invalida el anterior. */
export async function issueAccessLink(db: Db, inquiryId: string, now = Date.now()): Promise<{ token: string }> {
  const token = randomBytes(24).toString("base64url");
  await db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    await ensureTrack(tx, inquiryId, now);
    await tx.update(orderTracks).set({ accessTokenHash: sha(token), updatedAt: now }).where(eq(orderTracks.inquiryId, inquiryId));
  });
  return { token };
}

export type Viewer = { userId?: string | null; sessionTokenHash?: string | null; accessToken?: string | null };

/**
 * ¿Puede esta persona ver este pedido? Cuenta: solo su dueña. Invitado: la sesión que lo creó (cookie) o quien tiene el enlace privado.
 * Conocer la referencia (TT-…) nunca alcanza. Un pedido de una cuenta no se abre con enlace ni con cookie de invitado.
 */
export function canView(inq: { userId: string | null; sessionTokenHash: string }, track: { accessTokenHash: string | null } | undefined, v: Viewer): boolean {
  if (inq.userId) return Boolean(v.userId && v.userId === inq.userId);
  if (v.sessionTokenHash && v.sessionTokenHash === inq.sessionTokenHash) return true;
  return Boolean(v.accessToken && track?.accessTokenHash && sha(v.accessToken) === track.accessTokenHash);
}

/* ---------- Vistas ---------- */

export type CustomerOrderView = {
  preorder?: { expiresAt: number; status: "retenida" | "confirmada" | "liberada" | "cancelada" };
  reference: string; kind: TrackKind; stage: string; stageLabel: string; cancelled: boolean; createdAt: number; agreedMinor: number | null;
  steps: Array<{ stage: string; label: string; reachedAt: number | null; current: boolean }>;
  timeline: Array<{ at: number; text: string; kind: string }>;
  payments: Array<{ id: string; kind: string; amountMinor: number; method: string; paidAt: number }>;
  paymentStatus: string; paymentStatusLabel: string; pendingReceipts: number;
  receipts: Array<{ id: string; status: string; createdAt: number; declaredAmountMinor: number | null; rejectReason: string | null }>;
  action: string | null;
  items: Array<Omit<LineProgress, "productId" | "fulfillment"> & { fulfillment: string }>;
  incidents: Array<{ id: string; kind: string; publicText: string | null; status: string; openedAt: number }>;
  refunds: Array<{ id: string; amountMinor: number; status: string; refundedAt: number | null }>;
  /** Una nota de vez en cuando: ¿el pedido admite comprobantes? (no si está cancelado o entregado). */
  canUploadReceipt: boolean;
};

export const REFUND_STATUS_LABEL: Record<string, string> = { pendiente: "Reintegro pendiente", reintegrado: "Reintegrado" };
export const INCIDENT_KIND_LABEL: Record<string, string> = { paquete_perdido: "Paquete perdido", problema_proveedor: "Problema con el proveedor", danio: "Mercadería dañada", otro: "Novedad" };

/** Vista PARA LA CLIENTE: sin notas internas, sin costos, sin datos bancarios ni de otras personas. `null` si no hay seguimiento abierto. */
export async function customerOrderView(db: Db, inquiryId: string): Promise<CustomerOrderView | null> {
  const [track] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId));
  if (!track) return null;
  const [inq] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
  const kind = track.kind as TrackKind;
  const [events, pays, receipts, incidents, refunds, items, totals, hold] = await Promise.all([
    db.select().from(orderEvents).where(eq(orderEvents.inquiryId, inquiryId)).orderBy(orderEvents.occurredAt, orderEvents.id),
    db.select().from(orderPayments).where(and(eq(orderPayments.inquiryId, inquiryId), eq(orderPayments.status, "confirmado"))).orderBy(orderPayments.paidAt),
    db.select().from(paymentReceipts).where(eq(paymentReceipts.inquiryId, inquiryId)).orderBy(desc(paymentReceipts.createdAt)),
    db.select().from(orderIncidents).where(eq(orderIncidents.inquiryId, inquiryId)).orderBy(orderIncidents.openedAt),
    db.select().from(orderRefunds).where(eq(orderRefunds.inquiryId, inquiryId)).orderBy(orderRefunds.createdAt),
    lineProgress(db, inquiryId),
    paymentTotals(db, inquiryId),
    holdState(db, inquiryId),
  ]);
  const reachedAt = new Map<string, number>();
  for (const e of events) if (e.kind === "stage" && e.stage && !reachedAt.has(e.stage)) reachedAt.set(e.stage, e.occurredAt);
  const stages = stagesFor(kind).filter((s) => !(kind !== "stock" && s === "listo_retiro" && track.stage !== "listo_retiro" && !reachedAt.has("listo_retiro") && reachedAt.has("enviado")));
  const pay = summarizePayments({ agreedMinor: track.agreedMinor, ...totals });
  const cancelled = track.cancelledAt !== null || Boolean(hold?.expired);
  return {
    preorder: hold ? { expiresAt: hold.expiresAt, status: hold.expired ? "liberada" : track.cancelledAt ? "cancelada" : totals.confirmedMinor >= (senaFor(track.agreedMinor) ?? Infinity) ? "confirmada" : "retenida" } : undefined,
    reference: inquiryId, kind, stage: track.stage, stageLabel: STAGE_LABEL[track.stage as Stage] ?? track.stage, cancelled: cancelled, createdAt: inq?.createdAt ?? track.createdAt, agreedMinor: track.agreedMinor,
    steps: stages.map((s) => ({ stage: s, label: STAGE_LABEL[s], reachedAt: reachedAt.get(s) ?? null, current: s === track.stage })),
    // Solo texto PÚBLICO: `internalText` no se selecciona hacia afuera.
    timeline: events.filter((e) => e.publicText).map((e) => ({ at: e.occurredAt, text: e.publicText as string, kind: e.kind })),
    payments: pays.map((p) => ({ id: p.id, kind: p.kind, amountMinor: p.amountMinor, method: p.method, paidAt: p.paidAt })),
    paymentStatus: pay.status, paymentStatusLabel: ({ sin_pago: "Sin pagos confirmados", comprobante_en_revision: "Comprobante en revisión", parcial: "Pago parcial confirmado", completo: "Pago completo confirmado" } as const)[pay.status], pendingReceipts: totals.pendingReceipts,
    receipts: receipts.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, declaredAmountMinor: r.declaredAmountMinor, rejectReason: r.status === "rechazado" ? r.rejectReason : null })),
    action: nextAction({ kind, stage: track.stage, agreedMinor: track.agreedMinor, confirmedMinor: totals.confirmedMinor, pendingReceipts: totals.pendingReceipts, cancelled: cancelled }, formatARS),
    items: items.map(({ productId, ...l }) => { void productId; return l; }),
    incidents: incidents.map((i) => ({ id: i.id, kind: i.kind, publicText: i.publicText, status: i.status, openedAt: i.openedAt })),
    refunds: refunds.map((r) => ({ id: r.id, amountMinor: r.amountMinor, status: r.status, refundedAt: r.refundedAt })),
    canUploadReceipt: !cancelled && track.stage !== "entregado",
  };
}

export type AdminOrderRow = {
  reference: string; kind: TrackKind; stage: string; cancelled: boolean; createdAt: number; name: string | null; agreedMinor: number | null; confirmedMinor: number; pendingReceipts: number; openIncidents: number; failedNotices: number;
};

export async function listOrders(db: Db, opts: { kind?: string; stage?: string; limit?: number } = {}): Promise<AdminOrderRow[]> {
  const rows = await db.select({ t: orderTracks, name: inquiries.contactName, createdAt: inquiries.createdAt }).from(orderTracks).innerJoin(inquiries, eq(inquiries.id, orderTracks.inquiryId))
    .where(and(opts.kind ? eq(orderTracks.kind, opts.kind) : undefined, opts.stage ? eq(orderTracks.stage, opts.stage) : undefined)).orderBy(desc(orderTracks.updatedAt)).limit(Math.min(opts.limit ?? 200, 500));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.t.inquiryId);
  const [pays, recs, incs, notices] = await Promise.all([
    db.select({ id: orderPayments.inquiryId, n: sql<number>`sum(${orderPayments.amountMinor})::bigint` }).from(orderPayments).where(and(inArray(orderPayments.inquiryId, ids), eq(orderPayments.status, "confirmado"))).groupBy(orderPayments.inquiryId),
    db.select({ id: paymentReceipts.inquiryId, n: sql<number>`count(*)::int` }).from(paymentReceipts).where(and(inArray(paymentReceipts.inquiryId, ids), eq(paymentReceipts.status, "pendiente_revision"))).groupBy(paymentReceipts.inquiryId),
    db.select({ id: orderIncidents.inquiryId, n: sql<number>`count(*)::int` }).from(orderIncidents).where(and(inArray(orderIncidents.inquiryId, ids), eq(orderIncidents.status, "abierto"))).groupBy(orderIncidents.inquiryId),
    db.select({ id: notificationOutbox.inquiryId, n: sql<number>`count(*)::int` }).from(notificationOutbox).where(and(inArray(notificationOutbox.inquiryId, ids), inArray(notificationOutbox.status, ["pendiente", "fallido"]))).groupBy(notificationOutbox.inquiryId),
  ]);
  const by = <T extends { id: string | null; n: unknown }>(a: T[], id: string) => Number(a.find((x) => x.id === id)?.n ?? 0);
  return rows.map(({ t, name, createdAt }) => ({ reference: t.inquiryId, kind: t.kind as TrackKind, stage: t.stage, cancelled: t.cancelledAt !== null, createdAt, name, agreedMinor: t.agreedMinor, confirmedMinor: by(pays, t.inquiryId), pendingReceipts: by(recs, t.inquiryId), openIncidents: by(incs, t.inquiryId), failedNotices: by(notices, t.inquiryId) }));
}

/** Detalle completo para el panel (incluye notas internas). Nunca se usa para la cliente. */
export async function adminOrderDetail(db: Db, inquiryId: string) {
  const [track] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId));
  const [inq] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
  if (!inq) return null;
  const [events, pays, receipts, incidents, refunds, items, totals, notices] = await Promise.all([
    db.select().from(orderEvents).where(eq(orderEvents.inquiryId, inquiryId)).orderBy(desc(orderEvents.occurredAt), desc(orderEvents.id)),
    db.select().from(orderPayments).where(eq(orderPayments.inquiryId, inquiryId)).orderBy(orderPayments.paidAt),
    db.select().from(paymentReceipts).where(eq(paymentReceipts.inquiryId, inquiryId)).orderBy(desc(paymentReceipts.createdAt)),
    db.select().from(orderIncidents).where(eq(orderIncidents.inquiryId, inquiryId)).orderBy(orderIncidents.openedAt),
    db.select().from(orderRefunds).where(eq(orderRefunds.inquiryId, inquiryId)).orderBy(orderRefunds.createdAt),
    lineProgress(db, inquiryId),
    paymentTotals(db, inquiryId),
    db.select().from(notificationOutbox).where(eq(notificationOutbox.inquiryId, inquiryId)).orderBy(desc(notificationOutbox.createdAt)),
  ]);
  const deliveries = await db.select().from(lineDeliveries).where(eq(lineDeliveries.inquiryId, inquiryId)).orderBy(desc(lineDeliveries.deliveredAt));
  return { inquiry: inq, track: track ?? null, events, payments: pays, receipts, incidents, refunds, items, totals, notices, deliveries, senaMinor: senaFor(track?.agreedMinor ?? null) };
}
