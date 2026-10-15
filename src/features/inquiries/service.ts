import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { inquiries, inquiryLines, rateLimits } from "@/db/schema";
import { listAllProducts } from "@/features/catalog/data";
import type { EffectiveRate } from "@/features/fx/convert";
import { currentRate } from "@/features/fx/service";
import type { Language, Product } from "@/content/schema";
import { legacyPaymentLabels, paymentMethods } from "@/content/checkout-options";
import { isPromoPayment } from "@/features/politicas/promociones";
import { evaluateCart, type EvaluatedLine } from "./pricing";
import { buildLaunch, buildMessage, type Launch, type MessageData } from "./message";
import { CreateInquirySchema, type Delivery } from "./schemas";

export type ServiceError = {
  status: number;
  code: "invalid_input" | "promo_not_eligible" | "price_changed" | "pending_commercial" | "out_of_stock" | "unavailable" | "over_limit" | "idempotency_conflict" | "rate_limited" | "persistence_error";
  message: string;
  details?: unknown;
};
export class InquiryError extends Error {
  constructor(public readonly info: ServiceError) {
    super(info.message);
  }
}

export type InquiryView = {
  reference: string;
  status: string;
  createdAt: number;
  /** Subtotal de los productos disponibles (sin los por encargo), antes de descuentos. */
  subtotalMinor: number;
  /** 10% OFF por transferencia (solo con al menos una caja). 0 = sin descuento. */
  discountMinor: number;
  /** Cotización usada al preparar la consulta (instantánea: no cambia aunque el dólar se actualice). null si ningún producto tenía precio en USD. */
  fx: { rate10k: number; mode: "auto" | "manual"; source: string; asOf: number | null } | null;
  delivery: Delivery;
  paymentLabel: string;
  contactName?: string;
  /** Líneas por encargo: `fulfillment: "encargo"`, sin precio ni cotización (importes null). */
  lines: Array<{ productId: string; sku: string; title: string; language: Language; quantity: number; fulfillment: "stock" | "encargo"; unitPriceMinor: number | null; unitPriceUsdMinor: number | null; lineSubtotalMinor: number | null }>;
  message: string;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashToken = sha;
export const newSessionToken = () => randomBytes(24).toString("base64url");

/** Referencia pública no secuencial: 8 caracteres de un alfabeto sin ambigüedades (≈ 40 bits). */
export function newReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return "TT-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function contentHash(input: { items: Array<{ productId: string; quantity: number; mode?: string }>; delivery: Delivery; payment: string; contactName?: string }): string {
  const items = [...input.items].map((i) => ({ productId: i.productId, quantity: i.quantity, mode: i.mode === "encargo" ? "encargo" : "buy" })).sort((a, b) => a.productId.localeCompare(b.productId));
  const d = input.delivery;
  const delivery = d.method === "retiro" ? { m: d.method } : d.method === "moto" ? { m: d.method, l: d.locality.trim().toLowerCase(), c: d.postalCode.toUpperCase() } : { m: d.method, l: d.locality.trim().toLowerCase(), pr: d.province, c: d.postalCode.toUpperCase() };
  return sha(JSON.stringify({ items, delivery, payment: input.payment, name: input.contactName ?? "" }));
}

/**
 * Límite persistente por clave (p. ej. IP hasheada + acción). Devuelve true si todavía se permite.
 * Es UNA sola sentencia atómica (insertar o actualizar y devolver el contador): varias instancias del servidor contando a la vez no se pisan.
 */
export async function allowRequest(db: Db, key: string, limit: number, windowSeconds: number, now = Date.now()): Promise<boolean> {
  const k = sha(key);
  const windowMs = windowSeconds * 1000;
  const expired = sql`(${now}::bigint - ${rateLimits.windowStart} > ${windowMs}::bigint)`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: k, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`case when ${expired} then ${now}::bigint else ${rateLimits.windowStart} end`,
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count <= limit;
}

function paymentLabel(id: string): string {
  return paymentMethods.find((p) => p.id === id)?.label ?? legacyPaymentLabels[id] ?? id;
}

function toView(row: typeof inquiries.$inferSelect, lines: Array<typeof inquiryLines.$inferSelect>): InquiryView {
  return {
    reference: row.id,
    status: row.status,
    createdAt: row.createdAt,
    subtotalMinor: row.subtotalMinor,
    discountMinor: row.discountMinor,
    fx: row.fxRate10k ? { rate10k: row.fxRate10k, mode: row.fxMode === "manual" ? "manual" : "auto", source: row.fxSource ?? "", asOf: row.fxAsOf } : null,
    delivery: JSON.parse(row.deliveryJson) as Delivery,
    paymentLabel: paymentLabel(row.paymentPreference),
    contactName: row.contactName ?? undefined,
    lines: lines.map((l) => {
      const encargo = l.fulfillment === "encargo";
      return { productId: l.productId, sku: l.sku, title: l.title, language: l.language as Language, quantity: l.quantity, fulfillment: encargo ? ("encargo" as const) : ("stock" as const), unitPriceMinor: encargo ? null : l.unitPriceMinor, unitPriceUsdMinor: encargo ? null : l.unitPriceUsdMinor, lineSubtotalMinor: encargo ? null : l.lineSubtotalMinor };
    }),
    message: row.message,
  };
}

/** ¿La consulta existente pertenece a quien repite la petición? (usuario autenticado o la misma sesión de invitado) */
function sameOwner(row: typeof inquiries.$inferSelect, ctx: { sessionTokenHash: string; userId?: string | null }) {
  return ctx.userId ? row.userId === ctx.userId : row.userId === null && row.sessionTokenHash === ctx.sessionTokenHash;
}

async function loadByKey(db: Db, key: string) {
  const [row] = await db.select().from(inquiries).where(eq(inquiries.idempotencyKey, key));
  if (!row) return null;
  return { row, lines: await db.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, row.id)).orderBy(inquiryLines.id) };
}

export function messageDataOf(v: InquiryView): MessageData {
  return { reference: v.reference, contactName: v.contactName, lines: v.lines.map((l) => ({ quantity: l.quantity, title: l.title, language: l.language, sku: l.sku, unitPriceMinor: l.unitPriceMinor, unitPriceUsdMinor: l.unitPriceUsdMinor })), subtotalMinor: v.subtotalMinor, discountMinor: v.discountMinor, fx: v.fx ? { rate10k: v.fx.rate10k, mode: v.fx.mode } : null, delivery: v.delivery, paymentLabel: v.paymentLabel };
}

export function launchFor(v: InquiryView, number: string | null): Launch {
  return buildLaunch(number, messageDataOf(v), v.message);
}

const describeIssue = (l: EvaluatedLine) => ({ productId: l.productId, status: l.status, title: l.product?.title, requestedQuantity: l.requestedQuantity, maxQuantity: l.maxQuantity, unitPriceMinor: l.unitPriceMinor, previousPriceMinor: l.previousPriceMinor });

/**
 * Crea la consulta: valida esquema, catálogo, disponibilidad, precios, entrega y pago en servidor, y guarda un snapshot
 * inmutable. No reserva ni descuenta stock y no cambia de estado por abrir WhatsApp.
 * Idempotente por `idempotencyKey`: misma clave + mismo contenido → la misma consulta; misma clave + otro contenido → error.
 */
export async function createInquiry(
  db: Db,
  body: unknown,
  ctx: { sessionTokenHash: string; userId?: string | null; products?: Product[]; fx?: EffectiveRate; now?: number },
): Promise<{ inquiry: InquiryView; replayed: boolean }> {
  const parsed = CreateInquirySchema.safeParse(body);
  if (!parsed.success) {
    throw new InquiryError({ status: 400, code: "invalid_input", message: "Revisá los datos del pedido.", details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  const input = parsed.data;
  const ids = input.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) {
    throw new InquiryError({ status: 400, code: "invalid_input", message: "Hay productos repetidos en el pedido.", details: [{ path: "items", message: "Un mismo producto no puede repetirse en dos líneas" }] });
  }

  const hash = contentHash(input);
  const existing = await loadByKey(db, input.idempotencyKey);
  if (existing) {
    if (existing.row.contentHash !== hash || !sameOwner(existing.row, ctx)) {
      throw new InquiryError({ status: 422, code: "idempotency_conflict", message: "Esa clave ya se usó con otro pedido. Volvé a intentarlo." });
    }
    return { inquiry: toView(existing.row, existing.lines), replayed: true };
  }

  // Una sola lectura de la cotización: la misma que convierte los precios es la que se guarda en la consulta.
  const fx = ctx.fx ?? (await currentRate(db));
  const products = ctx.products ?? (await listAllProducts(fx, db));
  const ev = evaluateCart(input.items, products);
  const retired = ev.lines.filter((l) => l.status === "retired");
  if (retired.length) throw new InquiryError({ status: 409, code: "unavailable", message: "Algunos productos fueron retirados de la tienda y no se pueden comprar ni encargar. Sacalos del carrito.", details: retired.map(describeIssue) });
  const gone = ev.lines.filter((l) => l.status === "unavailable");
  if (gone.length) throw new InquiryError({ status: 409, code: "unavailable", message: "Hay productos que ya no están en el catálogo.", details: gone.map(describeIssue) });
  // Precio o stock todavía sin confirmar por el dueño: nunca se acepta (aunque el cliente mande otro precio o cantidad).
  const pending = ev.lines.filter((l) => l.status === "pending_commercial");
  if (pending.length) throw new InquiryError({ status: 409, code: "pending_commercial", message: "Hay productos sin precio o disponibilidad confirmados: todavía no se pueden consultar con importe.", details: pending.map(describeIssue) });
  const out = ev.lines.filter((l) => l.status === "out_of_stock");
  if (out.length) throw new InquiryError({ status: 409, code: "out_of_stock", message: "Hay productos sin stock.", details: out.map(describeIssue) });
  const over = ev.lines.filter((l) => l.status === "over_limit");
  if (over.length) throw new InquiryError({ status: 409, code: "over_limit", message: "Alguna cantidad supera lo disponible o el máximo por pedido.", details: over.map(describeIssue) });
  const changed = ev.lines.filter((l) => l.status === "price_changed");
  if (changed.length && !input.acceptPriceChanges) {
    throw new InquiryError({ status: 409, code: "price_changed", message: "Cambió el precio de algún producto. Revisalo antes de continuar.", details: changed.map(describeIssue) });
  }

  // Cuotas y transferencia con descuento solo valen con al menos una caja DISPONIBLE en el pedido (los encargos no cuentan).
  if (isPromoPayment(input.payment) && !ev.qualifiesForPromo) {
    throw new InquiryError({ status: 409, code: "promo_not_eligible", message: "Las cuotas sin interés y el 10% OFF por transferencia valen para compras que incluyan al menos una caja. Elegí otra preferencia de pago o sumá una caja.", details: [{ path: "payment", message: "El pedido no incluye una caja" }] });
  }
  const lines = ev.lines.map((l) => ({ product: l.product!, quantity: l.requestedQuantity, unit: l.status === "encargo" ? null : l.unitPriceMinor!, usd: l.status === "encargo" ? null : l.product!.priceUsdMinor ?? null }));
  const usesFx = lines.some((l) => l.usd !== null) && fx.rate10k !== null;
  const subtotalMinor = lines.reduce((n, l) => (l.unit === null ? n : n + l.unit * l.quantity), 0);
  const discountMinor = ev.discountFor(input.payment);
  const reference = newReference();
  const data: MessageData = {
    reference,
    contactName: input.contactName,
    lines: lines.map((l) => ({ quantity: l.quantity, title: l.product.title, language: l.product.language, sku: l.product.sku, unitPriceMinor: l.unit, unitPriceUsdMinor: l.usd })),
    subtotalMinor,
    discountMinor,
    fx: usesFx ? { rate10k: fx.rate10k!, mode: fx.mode } : null,
    delivery: input.delivery,
    paymentLabel: paymentLabel(input.payment),
  };
  const message = buildMessage(data);
  const createdAt = ctx.now ?? Date.now();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(inquiries).values({
        id: reference, idempotencyKey: input.idempotencyKey, contentHash: hash,
        // Si hay cuenta, la consulta pertenece SOLO a la cuenta: el token de invitado no sirve para leerla.
        sessionTokenHash: ctx.userId ? hashToken(newSessionToken()) : ctx.sessionTokenHash, userId: ctx.userId ?? null,
        status: "consulta_preparada", currency: "ARS", subtotalMinor, discountMinor,
        ...(usesFx ? { fxRate10k: fx.rate10k, fxMode: fx.mode, fxSource: fx.source, fxAsOf: fx.asOf } : {}),
        deliveryMethod: input.delivery.method, deliveryJson: JSON.stringify(input.delivery),
        paymentPreference: input.payment, contactName: input.contactName ?? null, message, createdAt,
      });
      await tx.insert(inquiryLines).values(lines.map((l) => ({
        inquiryId: reference, productId: l.product.id, sku: l.product.sku, title: l.product.title, language: l.product.language,
        quantity: l.quantity, fulfillment: l.unit === null ? "encargo" : "stock", unitPriceUsdMinor: l.usd, unitPriceMinor: l.unit ?? 0, lineSubtotalMinor: l.unit === null ? 0 : l.unit * l.quantity,
      })));
    });
  } catch (e) {
    // Carrera de doble clic: otra petición con la misma clave ganó (violación de la clave única); devolver esa consulta.
    const raced = await loadByKey(db, input.idempotencyKey);
    if (raced && raced.row.contentHash === hash && sameOwner(raced.row, ctx)) return { inquiry: toView(raced.row, raced.lines), replayed: true };
    throw new InquiryError({ status: 500, code: "persistence_error", message: "No pudimos guardar tu consulta. Intentá de nuevo.", details: e instanceof Error ? e.message : undefined });
  }
  const saved = (await loadByKey(db, input.idempotencyKey))!;
  return { inquiry: toView(saved.row, saved.lines), replayed: false };
}

/** Solo devuelve la consulta si pertenece a la sesión de invitado (cookie) o al usuario autenticado. */
export async function getInquiryFor(db: Db, reference: string, owner: { sessionTokenHash?: string; userId?: string | null }): Promise<InquiryView | null> {
  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, reference));
  if (!row) return null;
  const mine = (owner.sessionTokenHash && row.sessionTokenHash === owner.sessionTokenHash) || (owner.userId && row.userId === owner.userId);
  if (!mine) return null;
  return toView(row, await db.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, row.id)).orderBy(inquiryLines.id));
}

export type InquirySummary = { reference: string; status: string; createdAt: number; subtotalMinor: number; units: number; lineCount: number; encargoLines: number };

/** «Mis consultas»: solo las del usuario indicado, más recientes primero. */
export async function listInquiriesForUser(db: Db, userId: string): Promise<InquirySummary[]> {
  const rows = await db.select().from(inquiries).where(eq(inquiries.userId, userId)).orderBy(desc(inquiries.createdAt));
  const allLines = rows.length ? await db.select().from(inquiryLines).where(inArray(inquiryLines.inquiryId, rows.map((r) => r.id))) : [];
  return rows.map((r) => {
    const lines = allLines.filter((l) => l.inquiryId === r.id);
    return { reference: r.id, status: r.status, createdAt: r.createdAt, subtotalMinor: r.subtotalMinor, units: lines.reduce((n, l) => n + l.quantity, 0), lineCount: lines.length, encargoLines: lines.filter((l) => l.fulfillment === "encargo").length };
  });
}

/** Cuántas consultas de invitado, todavía sin cuenta, pertenecen a esta sesión (cookie). */
export async function countGuestInquiries(db: Db, sessionTokenHash: string): Promise<number> {
  return (await db.select({ id: inquiries.id }).from(inquiries).where(and(eq(inquiries.sessionTokenHash, sessionTokenHash), isNull(inquiries.userId)))).length;
}

/**
 * Asocia a una cuenta las consultas de invitado de ESTA sesión. La prueba de pertenencia es el token de la sesión de
 * invitado (cookie httpOnly): no existe forma de reclamar una consulta por su referencia. Al reclamarla, se invalida el
 * acceso de invitado (el token se rota) y queda visible solo para la cuenta.
 */
export async function claimGuestInquiries(db: Db, userId: string, sessionTokenHash: string): Promise<number> {
  return db.transaction(async (tx) => {
    // `for update`: dos pedidos simultáneos de reclamo no se pisan (el segundo espera y ya no encuentra consultas de invitado).
    const mine = await tx.select().from(inquiries).where(and(eq(inquiries.sessionTokenHash, sessionTokenHash), isNull(inquiries.userId))).for("update");
    for (const r of mine) {
      await tx.update(inquiries).set({ userId, sessionTokenHash: hashToken(newSessionToken()) }).where(and(eq(inquiries.id, r.id), isNull(inquiries.userId)));
    }
    return mine.length;
  });
}
