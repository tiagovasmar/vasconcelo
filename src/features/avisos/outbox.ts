import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Tx } from "@/db/lock";
import { inquiries, notificationOutbox, user } from "@/db/schema";
import { sendMail, type Mail } from "@/server/mail";

/**
 * Avisos por correo con cola (outbox). Reglas:
 *  - el aviso se ENCOLA en la misma transacción que el cambio de estado: si el envío falla, el cambio queda igual y el panel muestra «pendiente» o «falló»;
 *  - `dedupeKey` impide encolar dos veces el mismo hecho; un aviso «enviado» nunca se vuelve a enviar (ni por reintento ni por doble clic: el envío se RECLAMA con un UPDATE atómico);
 *  - en la web el estado del pedido se consulta siempre, llegue o no el correo; solo se avisa a cuentas con correo verificado (los invitados no dejan correo);
 *  - el canal inicial es el correo. WhatsApp automático no se implementa: requiere una integración y una autorización específicas.
 */
export type Aviso = { dedupeKey: string; inquiryId?: string | null; alertId?: string | null; event: string; toEmail: string; subject: string; body: string; link?: string | null };

type Runner = Db | Tx;

/** Encola un aviso. Devuelve false si ya existía (mismo hecho). */
export async function enqueueNotice(q: Runner, n: Aviso, now = Date.now()): Promise<boolean> {
  const rows = await q.insert(notificationOutbox).values({ dedupeKey: n.dedupeKey, inquiryId: n.inquiryId ?? null, alertId: n.alertId ?? null, event: n.event, channel: "email", toEmail: n.toEmail.trim().toLowerCase(), subject: n.subject, body: n.body, link: n.link ?? null, status: "pendiente", createdAt: now }).onConflictDoNothing({ target: notificationOutbox.dedupeKey }).returning({ id: notificationOutbox.id });
  return rows.length > 0;
}

/** Correo al que se avisa de un pedido: el de la cuenta si está verificado. null = invitado (sin correo): solo se ve en la web. */
export async function recipientOf(q: Runner, inquiryId: string): Promise<{ email: string; name: string } | null> {
  const [row] = await q.select({ email: user.email, name: user.name, verified: user.emailVerified }).from(inquiries).innerJoin(user, eq(user.id, inquiries.userId)).where(eq(inquiries.id, inquiryId));
  return row && row.verified ? { email: row.email, name: row.name } : null;
}

export const siteBaseUrl = (): string => (process.env.BETTER_AUTH_URL || process.env.URL || "http://localhost:3000").replace(/\/+$/, "");

type Sender = (mail: Mail) => Promise<void>;
const STALE_CLAIM_MS = 10 * 60_000;

/**
 * Envía los avisos pendientes o fallidos (o los ids indicados). Cada envío se reclama de forma atómica antes de salir; el resultado se guarda aparte, así un
 * fallo del proveedor no deshace nada. Un reclamo que quedó colgado (caída del servidor) se puede reintentar pasados 10 minutos.
 */
export async function flushOutbox(db: Db, opts: { ids?: number[]; limit?: number; send?: Sender; now?: number } = {}): Promise<{ sent: number; failed: number; skipped: number }> {
  const send = opts.send ?? sendMail;
  const now = opts.now ?? Date.now();
  const retryable = or(inArray(notificationOutbox.status, ["pendiente", "fallido"]), and(eq(notificationOutbox.status, "enviando"), lt(notificationOutbox.claimedAt, now - STALE_CLAIM_MS)));
  const candidates = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(opts.ids ? and(inArray(notificationOutbox.id, opts.ids), retryable) : retryable).orderBy(notificationOutbox.id).limit(Math.min(opts.limit ?? 25, 100));
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const c of candidates) {
    const [row] = await db.update(notificationOutbox).set({ status: "enviando", claimedAt: now, attempts: sql`${notificationOutbox.attempts} + 1` })
      .where(and(eq(notificationOutbox.id, c.id), retryable)).returning();
    if (!row) { out.skipped++; continue; } // otro proceso lo reclamó primero
    try {
      await send({ to: row.toEmail, subject: row.subject, text: row.body, kind: "aviso", link: row.link ?? undefined });
      await db.update(notificationOutbox).set({ status: "enviado", sentAt: Date.now(), lastError: null }).where(eq(notificationOutbox.id, row.id));
      out.sent++;
    } catch (e) {
      // Nunca se guarda el cuerpo del correo ni la respuesta completa del proveedor.
      await db.update(notificationOutbox).set({ status: "fallido", lastError: (e instanceof Error ? e.message : "error desconocido").slice(0, 200) }).where(eq(notificationOutbox.id, row.id));
      out.failed++;
    }
  }
  return out;
}

/** Envío «lo mejor posible» después de confirmar un cambio: jamás lanza (el cambio de estado ya está guardado). */
export async function flushQuietly(db: Db, send?: Sender): Promise<void> {
  try {
    await flushOutbox(db, { send, limit: 10 });
  } catch {
    // El aviso queda pendiente y el panel lo muestra.
  }
}

export type OutboxRow = typeof notificationOutbox.$inferSelect;
export async function listOutbox(db: Db, opts: { status?: string; inquiryId?: string; limit?: number } = {}): Promise<OutboxRow[]> {
  const conds = [opts.status ? eq(notificationOutbox.status, opts.status) : undefined, opts.inquiryId ? eq(notificationOutbox.inquiryId, opts.inquiryId) : undefined].filter((c): c is NonNullable<typeof c> => Boolean(c));
  return db.select().from(notificationOutbox).where(conds.length ? and(...conds) : undefined).orderBy(desc(notificationOutbox.createdAt), desc(notificationOutbox.id)).limit(Math.min(opts.limit ?? 100, 500));
}

/* ---------- Textos de los avisos del pedido ---------- */

export type NoticeEvent = "pago_confirmado" | "enviado_proveedor" | "llegada_argentina" | "llegada_parcial" | "entrega_parcial" | "listo_retirar" | "despachado" | "entregado" | "problema" | "reintegro";

const TEXTS: Record<NoticeEvent, { subject: string; line: string }> = {
  pago_confirmado: { subject: "Confirmamos tu pago", line: "Confirmamos el ingreso de tu pago. Ya podés ver el detalle en tu pedido." },
  enviado_proveedor: { subject: "Tu pedido salió del proveedor", line: "El proveedor despachó tu pedido o una parte de él (el detalle está en la web). Cuando llegue al depósito de origen y viaje a Argentina te vamos actualizando en la web." },
  llegada_argentina: { subject: "Tu pedido llegó a Argentina", line: "Tu pedido ya está en Argentina. Antes del despacho o del retiro coordinamos el pago del saldo, según lo acordado." },
  llegada_parcial: { subject: "Llegó una parte de tu pedido a Argentina", line: "Llegó a Argentina una parte de tu pedido. El resto sigue en camino: en la web ves qué artículos ya llegaron y cuáles faltan." },
  entrega_parcial: { subject: "Te entregamos una parte de tu pedido", line: "Registramos una entrega parcial. En la web ves qué artículos ya recibiste y cuáles siguen pendientes." },
  listo_retirar: { subject: "Tu pedido está listo para retirar", line: "Tu pedido está listo para retirar. Coordinamos el día y el horario por WhatsApp." },
  despachado: { subject: "Despachamos tu pedido", line: "Despachamos tu pedido. Ya figura como enviado en tu seguimiento." },
  entregado: { subject: "Tu pedido figura como entregado", line: "Tu pedido figura como entregado. Gracias por tu compra." },
  problema: { subject: "Novedad sobre tu pedido", line: "Surgió una novedad con tu pedido. Mirá el detalle en la web y escribinos por WhatsApp si tenés dudas." },
  reintegro: { subject: "Novedad sobre el reintegro de tu seña", line: "Actualizamos el estado del reintegro. Mirá el detalle en tu pedido." },
};

/** Arma y encola el aviso de un evento del pedido si la cuenta tiene correo. `once` distingue hechos repetibles (p. ej. una entrega parcial concreta). */
export async function noticeForOrder(q: Runner, inquiryId: string, event: NoticeEvent, once: string, now: number, extra?: string): Promise<"encolado" | "duplicado" | "sin_correo"> {
  const to = await recipientOf(q, inquiryId);
  if (!to) return "sin_correo";
  const t = TEXTS[event];
  const link = `${siteBaseUrl()}/cuenta/consultas/${inquiryId}`;
  const body = `Hola ${to.name}:\n\n${t.line}${extra ? `\n\n${extra}` : ""}\n\nPedido ${inquiryId}: ${link}\n\nEste correo es solo informativo: el estado siempre puede consultarse en la web. No incluye datos bancarios.`;
  const queued = await enqueueNotice(q, { dedupeKey: `pedido:${inquiryId}:${event}:${once}`, inquiryId, event, toEmail: to.email, subject: t.subject, body, link }, now);
  return queued ? "encolado" : "duplicado";
}
