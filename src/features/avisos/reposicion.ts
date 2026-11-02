import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { restockAlerts, user } from "@/db/schema";
import { catalog } from "@/content/catalog";
import { listAllProducts } from "@/features/catalog/data";
import type { Actor } from "@/features/catalog/overrides";
import { SaleError, type SaleErrorCode } from "@/features/sales/errors";
import { signText, verifyText } from "@/server/secret";
import { RESTOCK_CONSENT_TEXT } from "./consent";
import { enqueueNotice, siteBaseUrl } from "./outbox";

/**
 * «Avisame cuando vuelva». Es un REGISTRO DE INTERÉS: no es una consulta ni una venta, no reserva stock y no garantiza precio ni cantidad.
 *  - Se pide consentimiento expreso para enviar el aviso (se guarda el texto aceptado y la fecha).
 *  - Un aviso activo por producto y correo (índice único parcial): repetir no duplica.
 *  - Se puede cancelar siempre: desde la cuenta, o con el enlace secreto que lleva el propio aviso.
 *  - El panel cuenta cuántas personas esperan cada producto y es el dueño quien dispara el aviso cuando repone.
 */
export { RESTOCK_CONSENT_TEXT };

const fail = (status: number, code: SaleErrorCode, message: string, details?: unknown): never => { throw new SaleError(status, code, message, details); };
/** Enlace secreto para cancelar un aviso: `id.firma`. Se puede volver a generar para el correo del aviso sin guardarlo en claro. */
export const cancelTokenFor = (alertId: string): string => `${alertId}.${signText(`restock-cancel:${alertId}`)}`;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const newId = () => `AV-${Array.from(randomBytes(8), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("")}`;

export const SubscribeSchema = z.object({
  productId: z.string().min(1).max(80),
  consent: z.literal(true, { error: "Para anotarte tenés que aceptar que te enviemos el aviso." }),
  /** Solo invitados. Con cuenta se usa SIEMPRE el correo verificado de la cuenta. */
  email: z.string().trim().toLowerCase().email("Escribí un correo válido.").max(120).optional(),
});

export type RestockResult = { id: string; status: "activo"; replayed: boolean; cancelToken: string | null };

export async function subscribeRestock(db: Db, body: unknown, who: { userId: string | null; accountEmail: string | null; emailVerified: boolean }, now = Date.now()): Promise<RestockResult> {
  const r = SubscribeSchema.safeParse(body);
  if (!r.success) return fail(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos.");
  const input = r.data;
  const product = catalog.products.find((p) => p.id === input.productId);
  if (!product || product.retired) return fail(404, "not_found", "Ese producto no está disponible para avisos.");
  const live = (await listAllProducts(undefined, db)).find((p) => p.id === input.productId);
  if (!live) return fail(404, "not_found", "Ese producto no está disponible para avisos.");
  if (live.stockQuantity !== 0) return fail(409, "order_rule", live.stockQuantity === null ? "Este producto todavía no tiene stock cargado: no hay un aviso para registrar." : "Este producto está disponible: podés comprarlo ahora.");
  let email: string;
  if (who.userId) {
    if (!who.accountEmail || !who.emailVerified) return fail(403, "forbidden", "Confirmá el correo de tu cuenta para anotarte.");
    email = who.accountEmail.trim().toLowerCase();
  } else {
    if (!input.email) return fail(400, "invalid_input", "Escribí tu correo para que podamos avisarte.");
    email = input.email;
  }
  return db.transaction(async (tx) => {
    await lockKey(tx, `restock:${input.productId}:${email}`);
    const [again] = await tx.select().from(restockAlerts).where(and(eq(restockAlerts.productId, input.productId), eq(restockAlerts.email, email), eq(restockAlerts.status, "activo")));
    if (again) return { id: again.id, status: "activo" as const, replayed: true, cancelToken: null };
    const id = newId();
    const token = cancelTokenFor(id);
    await tx.insert(restockAlerts).values({ id, productId: input.productId, userId: who.userId, email, consentAt: now, consentText: RESTOCK_CONSENT_TEXT, status: "activo", cancelTokenHash: hash(token), createdAt: now });
    return { id, status: "activo" as const, replayed: false, cancelToken: token };
  });
}

/** Cancela un aviso: por el enlace secreto (cualquiera) o por la cuenta que lo creó. Repetir no hace nada. */
export async function cancelRestock(db: Db, by: { token?: string; id?: string; userId?: string | null }, now = Date.now()): Promise<{ changed: boolean; found: boolean }> {
  const tokenId = by.token && by.token.includes(".") && verifyText(`restock-cancel:${by.token.slice(0, by.token.indexOf("."))}`, by.token.slice(by.token.indexOf(".") + 1)) ? by.token.slice(0, by.token.indexOf(".")) : null;
  const [row] = by.token
    ? tokenId ? await db.select().from(restockAlerts).where(eq(restockAlerts.id, tokenId)) : []
    : by.id && by.userId
      ? await db.select().from(restockAlerts).where(and(eq(restockAlerts.id, by.id), eq(restockAlerts.userId, by.userId)))
      : [];
  if (!row) return { changed: false, found: false };
  if (row.status !== "activo") return { changed: false, found: true };
  await db.update(restockAlerts).set({ status: "cancelado", cancelledAt: now }).where(and(eq(restockAlerts.id, row.id), eq(restockAlerts.status, "activo")));
  return { changed: true, found: true };
}

export async function listUserAlerts(db: Db, userId: string) {
  const rows = await db.select().from(restockAlerts).where(eq(restockAlerts.userId, userId)).orderBy(sql`${restockAlerts.createdAt} desc`);
  return rows.map((a) => ({ id: a.id, productId: a.productId, title: catalog.products.find((p) => p.id === a.productId)?.title ?? a.productId, status: a.status, createdAt: a.createdAt }));
}

/** ¿Esta cuenta ya tiene un aviso activo para el producto? */
export async function hasActiveAlert(db: Db, userId: string, productId: string): Promise<{ id: string } | null> {
  const [a] = await db.select({ id: restockAlerts.id }).from(restockAlerts).where(and(eq(restockAlerts.userId, userId), eq(restockAlerts.productId, productId), eq(restockAlerts.status, "activo")));
  return a ?? null;
}

/** Cuántas personas esperan cada producto (solo avisos activos). Para el panel. */
export async function waitingCounts(db: Db): Promise<Map<string, number>> {
  const rows = await db.select({ productId: restockAlerts.productId, n: sql<number>`count(*)::int` }).from(restockAlerts).where(eq(restockAlerts.status, "activo")).groupBy(restockAlerts.productId);
  return new Map(rows.map((r) => [r.productId, r.n]));
}

/**
 * El dueño avisa que repuso un producto. Solo se permite si HAY stock cargado; encola un correo por persona (sin duplicar) en la misma transacción que marca el aviso como
 * «avisado». No reserva nada para quienes esperaban: quien llegue primero compra primero.
 */
export async function notifyRestock(db: Db, productId: string, actor: Actor, now = Date.now()): Promise<{ notified: number }> {
  const live = (await listAllProducts(undefined, db)).find((p) => p.id === productId);
  if (!live) return fail(404, "not_found", "El producto no existe.");
  if (!live.stockQuantity || live.stockQuantity <= 0) return fail(409, "order_rule", "El producto no tiene stock cargado: cargá la entrada de mercadería antes de avisar.");
  void actor;
  return db.transaction(async (tx) => {
    await lockKey(tx, `restock-notify:${productId}`);
    const waiting = await tx.select({ a: restockAlerts, name: user.name }).from(restockAlerts).leftJoin(user, eq(user.id, restockAlerts.userId)).where(and(eq(restockAlerts.productId, productId), eq(restockAlerts.status, "activo")));
    let notified = 0;
    for (const { a, name } of waiting) {
      const slug = live.slug;
      const link = `${siteBaseUrl()}/productos/${slug}`;
      const body = `Hola${name ? ` ${name}` : ""}:\n\nPediste que te avisemos cuando volviera «${live.title}». Ya hay unidades cargadas.\n\nVer el producto: ${link}\n\nEste aviso no reserva stock ni garantiza el precio: se vende hasta agotar. Es el único correo que te vamos a mandar por este producto.`;
      const ok = await enqueueNotice(tx, { dedupeKey: `reposicion:${a.id}`, alertId: a.id, event: "reposicion", toEmail: a.email, subject: `Volvió «${live.title}»`, body, link }, now);
      await tx.update(restockAlerts).set({ status: "avisado", notifiedAt: now }).where(eq(restockAlerts.id, a.id));
      if (ok) notified++;
    }
    return { notified };
  });
}
