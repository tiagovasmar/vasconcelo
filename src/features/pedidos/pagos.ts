import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/db/client";
import { inquiries, orderEvents, orderIncidents, orderPayments, orderRefunds, orderTracks, paymentReceipts } from "@/db/schema";
import type { Actor } from "@/features/catalog/overrides";
import { noticeForOrder } from "@/features/avisos/outbox";
import { SaleError, type SaleErrorCode } from "@/features/sales/errors";
import type { ReceiptStore } from "@/server/receipt-store";
import { formatARS } from "@/lib/format";
import { encargo } from "@/content/politicas";
import { advanceFromFacts, ensureTrack, newId, paymentTotals, sha, trackLock } from "./service";
import { rank, senaFor, type TrackKind } from "./etapas";

/**
 * Pagos, comprobantes, incidentes y reintegros de un pedido. Reglas que NO se negocian:
 *  - subir un comprobante NO confirma un pago: queda «pendiente de revisión» hasta que el dueño registra el ingreso (`confirmPayment`);
 *  - pagos y reintegros se registran con clave de idempotencia (doble clic y reintentos no duplican) y nunca se borran (un pago se anula con motivo);
 *  - el sistema NO transfiere dinero: «reintegrado» es una constancia que carga el dueño (fecha, importe y comprobante/referencia). Cancelar un pedido no equivale a reintegrar;
 *  - los datos bancarios no se guardan ni se muestran en ningún aviso.
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
const PESOS = (label: string) => z.number({ error: `${label}: escribí un importe.` }).int(`${label}: debe ser un número entero.`).min(10_000, `${label}: mínimo $100.`).max(1_000_000_000_00, `${label}: es demasiado alto.`).multipleOf(100, `${label}: en pesos enteros.`);

/* ---------- Comprobantes ---------- */

/** 4 MB: deja margen bajo el límite de 6 MB de las funciones de Netlify para el cuerpo de la petición (con el formulario). */
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const MAX_PENDING_RECEIPTS = 6;
export const RECEIPT_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type ReceiptType = keyof typeof RECEIPT_TYPES;

/** Tipo REAL del archivo por su contenido (no por el nombre ni por el tipo que declara el navegador). null = no admitido. */
export function sniffReceiptType(b: Buffer): ReceiptType | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Quita los metadatos de las imágenes (ubicación, cámara) y las orienta; los PDF se guardan tal cual. Una imagen que no se puede decodificar se rechaza. */
async function sanitize(bytes: Buffer, type: ReceiptType): Promise<Buffer> {
  if (type === "application/pdf") return bytes;
  const sharp = (await import("sharp")).default;
  try {
    const img = sharp(bytes, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
    return await (type === "image/jpeg" ? img.jpeg({ quality: 90 }) : type === "image/png" ? img.png() : img.webp({ quality: 90 })).toBuffer();
  } catch {
    return fail(400, "unsupported", "No pudimos leer la imagen. Probá con otra captura o con un PDF.");
  }
}

export type ReceiptViewer = { kind: "cuenta" | "invitado" | "enlace"; userId?: string | null };

export type ReceiptUploadResult = { id: string; duplicate: boolean };

/**
 * Guarda un comprobante en el almacén PRIVADO y lo deja «pendiente de revisión». Quien llama debe haber verificado antes que la persona puede ver el pedido (`canView`).
 * El mismo archivo subido dos veces al mismo pedido devuelve el comprobante existente (sin duplicar). Tope por pedido de comprobantes pendientes (anti-abuso).
 */
export async function uploadReceipt(db: Db, store: ReceiptStore, p: { inquiryId: string; viewer: ReceiptViewer; file: Buffer; originalName?: string | null; declaredAmountMinor?: number | null; note?: string | null }, now = Date.now()): Promise<ReceiptUploadResult> {
  if (p.file.length === 0) return fail(400, "invalid_input", "El archivo está vacío.");
  if (p.file.length > MAX_RECEIPT_BYTES) return fail(413, "too_large", `El archivo supera los ${MAX_RECEIPT_BYTES / 1024 / 1024} MB permitidos.`);
  const type = sniffReceiptType(p.file);
  if (!type) return fail(415, "unsupported", "Solo se admiten fotos (JPG, PNG, WebP) o PDF.");
  if (p.declaredAmountMinor != null && (!Number.isInteger(p.declaredAmountMinor) || p.declaredAmountMinor <= 0 || p.declaredAmountMinor > 1_000_000_000_00)) return fail(400, "invalid_input", "El importe indicado no es válido.");
  const note = (p.note ?? "").trim().slice(0, 300) || null;
  const originalName = (p.originalName ?? "").replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 80) || null;
  const digest = sha(p.file.toString("binary"));
  const existing = async () => (await db.select({ id: paymentReceipts.id }).from(paymentReceipts).where(and(eq(paymentReceipts.inquiryId, p.inquiryId), eq(paymentReceipts.sha256, digest))))[0];
  const dup = await existing();
  if (dup) return { id: dup.id, duplicate: true };
  const [track] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, p.inquiryId));
  if (!track) return fail(409, "order_rule", "Este pedido todavía no tiene seguimiento: la tienda lo abre cuando confirma el pedido.");
  if (track.cancelledAt || track.stage === "entregado") return fail(409, "order_rule", "Este pedido ya no admite comprobantes.");
  const [pend] = await db.select({ n: sql<number>`count(*)::int` }).from(paymentReceipts).where(and(eq(paymentReceipts.inquiryId, p.inquiryId), eq(paymentReceipts.status, "pendiente_revision")));
  if (pend.n >= MAX_PENDING_RECEIPTS) return fail(429, "order_rule", "Ya hay varios comprobantes esperando revisión. Esperá a que la tienda los revise.");
  const clean = await sanitize(p.file, type);
  const key = `rc-${randomBytes(18).toString("hex")}.${RECEIPT_TYPES[type]}`;
  await store.put(key, clean, type);
  const id = newId("CP");
  try {
    await db.transaction(async (tx) => {
      await trackLock(tx, p.inquiryId);
      await tx.insert(paymentReceipts).values({ id, inquiryId: p.inquiryId, uploadedByUserId: p.viewer.userId ?? null, uploaderKind: p.viewer.kind, storageKey: key, contentType: type, bytes: clean.length, sha256: digest, originalName, declaredAmountMinor: p.declaredAmountMinor ?? null, note, status: "pendiente_revision", createdAt: now });
      await tx.insert(orderEvents).values({ inquiryId: p.inquiryId, kind: "receipt", publicText: "Recibimos tu comprobante. Está en revisión: todavía no confirma el pago.", internalText: `Comprobante ${id}${p.declaredAmountMinor ? ` · dice haber transferido ${formatARS(p.declaredAmountMinor)}` : ""}`, occurredAt: now, createdAt: now });
    });
  } catch (e) {
    // Carrera de doble subida del mismo archivo: gana la primera; el archivo huérfano se borra.
    await store.remove(key);
    const raced = await existing();
    if (raced) return { id: raced.id, duplicate: true };
    throw e;
  }
  return { id, duplicate: false };
}

export const RejectSchema = z.object({ reason: z.string().trim().min(3, "Escribí el motivo del rechazo.").max(200) });

/** Rechaza un comprobante (por ejemplo, ilegible). No crea ni anula ningún pago. */
export async function rejectReceipt(db: Db, receiptId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  const { reason } = parseOr400(RejectSchema, body);
  const [r0] = await db.select().from(paymentReceipts).where(eq(paymentReceipts.id, receiptId));
  if (!r0) return fail(404, "not_found", "El comprobante no existe.");
  return db.transaction(async (tx) => {
    await trackLock(tx, r0.inquiryId);
    const [r] = await tx.select().from(paymentReceipts).where(eq(paymentReceipts.id, receiptId));
    if (r.status === "rechazado") return { changed: false };
    if (r.status === "aceptado") return fail(409, "order_rule", "Ese comprobante ya respalda un pago confirmado.");
    await tx.update(paymentReceipts).set({ status: "rechazado", rejectReason: reason, reviewedAt: now, reviewedByEmail: actor.email }).where(eq(paymentReceipts.id, receiptId));
    await tx.insert(orderEvents).values({ inquiryId: r.inquiryId, kind: "receipt", publicText: `Revisamos tu comprobante y no pudimos usarlo: ${reason}. Podés subir otro.`, internalText: `Comprobante ${receiptId} rechazado`, occurredAt: now, createdAt: now, actorEmail: actor.email });
    return { changed: true };
  });
}

/** Quién puede descargar un comprobante: el dueño del pedido (según `canView`, resuelto por quien llama) o el administrador. */
export async function receiptFile(db: Db, store: ReceiptStore, receiptId: string): Promise<{ bytes: Buffer; contentType: string; inquiryId: string; name: string } | null> {
  const [r] = await db.select().from(paymentReceipts).where(eq(paymentReceipts.id, receiptId));
  if (!r) return null;
  const bytes = await store.get(r.storageKey);
  return bytes ? { bytes, contentType: r.contentType, inquiryId: r.inquiryId, name: `comprobante-${r.id}.${RECEIPT_TYPES[r.contentType as ReceiptType] ?? "bin"}` } : null;
}

/* ---------- Pagos confirmados ---------- */

export const PaymentSchema = z.object({
  kind: z.enum(["sena", "saldo", "pago_total", "otro"], { error: "Elegí el tipo de pago." }),
  amountMinor: PESOS("Importe"),
  method: z.enum(["transferencia", "efectivo", "otro"], { error: "Elegí el medio de pago." }),
  paidAt: DATE,
  receiptId: z.string().min(1).max(40).nullish().transform((v) => v ?? null),
  internalNote: TEXT(500),
  idempotencyKey: KEY,
});

export type PaymentRow = typeof orderPayments.$inferSelect;

/**
 * Registra un pago CONFIRMADO por el dueño (lo hace tras ver el ingreso). Idempotente por clave: repetir con los mismos datos devuelve el mismo pago; con otros datos, 422.
 * No admite pagar más que el importe acordado. Si es el pago de la seña de un encargo, la etapa «Seña del 20% confirmada» se registra con la fecha del pago.
 */
export async function confirmPayment(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ payment: PaymentRow; replayed: boolean }> {
  const input = parseOr400(PaymentSchema, body);
  const hash = sha(JSON.stringify([inquiryId, input.kind, input.amountMinor, input.method, input.paidAt, input.receiptId]));
  try {
    return await db.transaction(async (tx) => {
      await trackLock(tx, inquiryId);
      const [again] = await tx.select().from(orderPayments).where(eq(orderPayments.idempotencyKey, input.idempotencyKey));
      if (again) {
        if (again.inquiryId !== inquiryId || sha(JSON.stringify([again.inquiryId, again.kind, again.amountMinor, again.method, again.paidAt, again.receiptId])) !== hash) return fail(422, "idempotency_conflict", "Esa operación ya se registró con otros datos.");
        return { payment: again, replayed: true };
      }
      const track = await ensureTrack(tx, inquiryId, now);
      if (track.cancelledAt) return fail(409, "order_rule", "El pedido está cancelado: no se registran pagos nuevos.");
      if (input.receiptId) {
        const [rc] = await tx.select().from(paymentReceipts).where(eq(paymentReceipts.id, input.receiptId));
        if (!rc || rc.inquiryId !== inquiryId) return fail(404, "not_found", "Ese comprobante no pertenece a este pedido.");
        if (rc.status !== "pendiente_revision") return fail(409, "order_rule", "Ese comprobante ya fue revisado.");
      }
      const { confirmedMinor } = await paymentTotals(tx, inquiryId);
      if (track.agreedMinor === null) return fail(409, "order_rule", "Primero confirmá el importe acordado del pedido.");
      if (confirmedMinor + input.amountMinor > track.agreedMinor) return fail(409, "order_rule", `El pago superaría el importe acordado (${formatARS(track.agreedMinor)}): ya hay confirmado ${formatARS(confirmedMinor)}.`);
      const id = newId("PG");
      const [payment] = await tx.insert(orderPayments).values({ id, inquiryId, kind: input.kind, amountMinor: input.amountMinor, method: input.method, status: "confirmado", receiptId: input.receiptId, paidAt: input.paidAt, internalNote: input.internalNote, idempotencyKey: input.idempotencyKey, createdAt: now, createdByEmail: actor.email }).returning();
      if (input.receiptId) await tx.update(paymentReceipts).set({ status: "aceptado", reviewedAt: now, reviewedByEmail: actor.email }).where(eq(paymentReceipts.id, input.receiptId));
      await tx.insert(orderEvents).values({ inquiryId, kind: "payment", publicText: `Confirmamos tu pago de ${formatARS(input.amountMinor)}.`, internalText: `Pago ${id} (${input.kind}, ${input.method})${input.internalNote ? ` · ${input.internalNote}` : ""}`, occurredAt: input.paidAt, createdAt: now, actorEmail: actor.email });
      await noticeForOrder(tx, inquiryId, "pago_confirmado", id, now, `Importe confirmado: ${formatARS(input.amountMinor)}.`);
      const kind = track.kind as TrackKind;
      const sena = senaFor(track.agreedMinor);
      if (kind !== "stock" && sena !== null && confirmedMinor + input.amountMinor >= sena && rank(kind, track.stage) >= rank(kind, "confirmado_tienda") && rank(kind, track.stage) < rank(kind, "sena_confirmada")) {
        await advanceFromFacts(tx, inquiryId, "sena_confirmada", input.paidAt, actor, now, id, `Abonaste la seña del ${encargo.senaPercent}%.`);
      }
      return { payment, replayed: false };
    });
  } catch (e) {
    const [raced] = await db.select().from(orderPayments).where(eq(orderPayments.idempotencyKey, input.idempotencyKey));
    if (raced && raced.inquiryId === inquiryId && sha(JSON.stringify([raced.inquiryId, raced.kind, raced.amountMinor, raced.method, raced.paidAt, raced.receiptId])) === hash) return { payment: raced, replayed: true };
    throw e;
  }
}

export const VoidPaymentSchema = z.object({ reason: z.string().trim().min(5, "Escribí el motivo (mínimo 5 caracteres).").max(200) });
/** Anula un pago cargado por error (queda como historia). No toca reintegros ni etapas ya registradas. */
export async function voidPayment(db: Db, paymentId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  const { reason } = parseOr400(VoidPaymentSchema, body);
  const [p0] = await db.select().from(orderPayments).where(eq(orderPayments.id, paymentId));
  if (!p0) return fail(404, "not_found", "El pago no existe.");
  return db.transaction(async (tx) => {
    await trackLock(tx, p0.inquiryId);
    const [p] = await tx.select().from(orderPayments).where(eq(orderPayments.id, paymentId));
    if (p.status === "anulado") return { changed: false };
    await tx.update(orderPayments).set({ status: "anulado", voidedAt: now, voidReason: reason }).where(eq(orderPayments.id, paymentId));
    await tx.insert(orderEvents).values({ inquiryId: p.inquiryId, kind: "payment", internalText: `Pago ${paymentId} anulado: ${reason}`, publicText: "Corregimos el registro de un pago.", occurredAt: now, createdAt: now, actorEmail: actor.email });
    return { changed: true };
  });
}

/* ---------- Incidentes y reintegros ---------- */

export const IncidentSchema = z.object({
  kind: z.enum(["paquete_perdido", "problema_proveedor", "danio", "otro"], { error: "Elegí el tipo de incidente." }),
  internalDetail: TEXT(1000),
  publicText: TEXT(300),
  openedAt: DATE,
  idempotencyKey: KEY,
});

export async function openIncident(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ id: string; replayed: boolean }> {
  const input = parseOr400(IncidentSchema, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    const [again] = await tx.select().from(orderIncidents).where(eq(orderIncidents.idempotencyKey, input.idempotencyKey));
    if (again) return { id: again.id, replayed: again.inquiryId === inquiryId } ;
    await ensureTrack(tx, inquiryId, now);
    const id = newId("IN");
    await tx.insert(orderIncidents).values({ id, inquiryId, kind: input.kind, internalDetail: input.internalDetail, publicText: input.publicText ?? "Surgió una novedad con tu pedido. Te mantenemos al tanto.", status: "abierto", openedAt: input.openedAt, idempotencyKey: input.idempotencyKey, createdByEmail: actor.email, createdAt: now });
    await tx.insert(orderEvents).values({ inquiryId, kind: "incident", publicText: input.publicText ?? "Surgió una novedad con tu pedido. Te mantenemos al tanto.", internalText: `Incidente ${id} (${input.kind})${input.internalDetail ? `: ${input.internalDetail}` : ""}`, occurredAt: input.openedAt, createdAt: now, actorEmail: actor.email });
    await noticeForOrder(tx, inquiryId, "problema", id, now, input.publicText ?? undefined);
    return { id, replayed: false };
  });
}

export const ResolveSchema = z.object({ resolution: z.string().trim().min(3, "Escribí cómo se resolvió.").max(300), resolvedAt: DATE });
export async function resolveIncident(db: Db, incidentId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  const input = parseOr400(ResolveSchema, body);
  const [i0] = await db.select().from(orderIncidents).where(eq(orderIncidents.id, incidentId));
  if (!i0) return fail(404, "not_found", "El incidente no existe.");
  return db.transaction(async (tx) => {
    await trackLock(tx, i0.inquiryId);
    const [i] = await tx.select().from(orderIncidents).where(eq(orderIncidents.id, incidentId));
    if (i.status === "resuelto") return { changed: false };
    await tx.update(orderIncidents).set({ status: "resuelto", resolvedAt: input.resolvedAt, resolution: input.resolution }).where(eq(orderIncidents.id, incidentId));
    await tx.insert(orderEvents).values({ inquiryId: i.inquiryId, kind: "incident", publicText: `Novedad resuelta: ${input.resolution}`, internalText: `Incidente ${incidentId} resuelto`, occurredAt: input.resolvedAt, createdAt: now, actorEmail: actor.email });
    return { changed: true };
  });
}

export const RefundSchema = z.object({
  incidentId: z.string().min(1).max(40).nullish().transform((v) => v ?? null),
  amountMinor: PESOS("Importe"),
  internalNote: TEXT(500),
  idempotencyKey: KEY,
});

const refundedOrPending = async (q: Db | Parameters<Parameters<Db["transaction"]>[0]>[0], inquiryId: string): Promise<number> => {
  const [r] = await q.select({ n: sql<number>`coalesce(sum(${orderRefunds.amountMinor}), 0)::bigint` }).from(orderRefunds).where(eq(orderRefunds.inquiryId, inquiryId));
  return Number(r.n);
};

/** Registra un reintegro PENDIENTE (a devolver). No mueve dinero. No puede superar lo efectivamente confirmado menos lo ya registrado como reintegro. */
export async function registerRefund(db: Db, inquiryId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ id: string; replayed: boolean }> {
  const input = parseOr400(RefundSchema, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, inquiryId);
    const [again] = await tx.select().from(orderRefunds).where(eq(orderRefunds.idempotencyKey, input.idempotencyKey));
    if (again) {
      if (again.inquiryId !== inquiryId || again.amountMinor !== input.amountMinor) return fail(422, "idempotency_conflict", "Esa operación ya se registró con otros datos.");
      return { id: again.id, replayed: true };
    }
    const track = await ensureTrack(tx, inquiryId, now);
    void track;
    if (input.incidentId) {
      const [inc] = await tx.select().from(orderIncidents).where(eq(orderIncidents.id, input.incidentId));
      if (!inc || inc.inquiryId !== inquiryId) return fail(404, "not_found", "Ese incidente no pertenece a este pedido.");
    }
    const { confirmedMinor } = await paymentTotals(tx, inquiryId);
    const already = await refundedOrPending(tx, inquiryId);
    if (already + input.amountMinor > confirmedMinor) return fail(409, "order_rule", `El reintegro supera lo pagado y confirmado (${formatARS(confirmedMinor)}; ya registrado para reintegrar: ${formatARS(already)}).`);
    const id = newId("RE");
    await tx.insert(orderRefunds).values({ id, inquiryId, incidentId: input.incidentId, amountMinor: input.amountMinor, status: "pendiente", internalNote: input.internalNote, idempotencyKey: input.idempotencyKey, createdByEmail: actor.email, createdAt: now });
    await tx.insert(orderEvents).values({ inquiryId, kind: "refund", publicText: `Registramos el reintegro de ${formatARS(input.amountMinor)}. Está pendiente de devolución.`, internalText: `Reintegro ${id} pendiente`, occurredAt: now, createdAt: now, actorEmail: actor.email });
    await noticeForOrder(tx, inquiryId, "reintegro", `${id}:pendiente`, now);
    return { id, replayed: false };
  });
}

export const MarkRefundedSchema = z.object({
  refundedAt: DATE,
  evidence: z.string().trim().min(4, "Cargá la constancia (número de operación o referencia).").max(200),
});

/** Marca un reintegro como EFECTIVAMENTE devuelto, con fecha y constancia. El dinero lo mueve el dueño por fuera del sistema. Repetir no duplica. */
export async function markRefunded(db: Db, refundId: string, body: unknown, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  const input = parseOr400(MarkRefundedSchema, body);
  const [r0] = await db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId));
  if (!r0) return fail(404, "not_found", "El reintegro no existe.");
  return db.transaction(async (tx) => {
    await trackLock(tx, r0.inquiryId);
    const [r] = await tx.select().from(orderRefunds).where(eq(orderRefunds.id, refundId));
    if (r.status === "reintegrado") return { changed: false };
    await tx.update(orderRefunds).set({ status: "reintegrado", refundedAt: input.refundedAt, evidence: input.evidence }).where(eq(orderRefunds.id, refundId));
    await tx.insert(orderEvents).values({ inquiryId: r.inquiryId, kind: "refund", publicText: `Reintegramos ${formatARS(r.amountMinor)}.`, internalText: `Reintegro ${refundId} efectuado · constancia: ${input.evidence}`, occurredAt: input.refundedAt, createdAt: now, actorEmail: actor.email });
    await noticeForOrder(tx, r.inquiryId, "reintegro", `${refundId}:reintegrado`, now);
    return { changed: true };
  });
}

void inquiries;
