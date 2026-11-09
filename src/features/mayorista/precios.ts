import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { adminSettings, inquiries, inquiryEvents, inquiryLines, wholesaleTiers } from "@/db/schema";
import { catalog } from "@/content/catalog";
import { listProducts } from "@/features/catalog/data";
import type { Actor } from "@/features/catalog/overrides";
import { currentRate } from "@/features/fx/service";
import { usdToArsMinor, type EffectiveRate } from "@/features/fx/convert";
import { newReference } from "@/features/inquiries/service";
import { isFullName, normalizeName } from "@/features/inquiries/schemas";
import { SaleError, type SaleErrorCode } from "@/features/sales/errors";
import { wholesaleStatusFor } from "@/features/wholesale/service";
import { ensureTrack, trackLock } from "@/features/pedidos/service";
import { formatARS } from "@/lib/format";
import { hasBasePrice, missingForOpening, quote, type Quote, type WholesaleRow, type WholesaleRules } from "./calc";

/**
 * Catálogo y precios MAYORISTAS. Reglas:
 *  - Solo cuentas aprobadas (manual, por el dueño) ven precios mayoristas; la decisión es SIEMPRE del servidor, con la sesión y la base: nada que mande el navegador la altera.
 *  - Mayorista es exclusivamente POR PEDIDO: el stock minorista no representa stock mayorista, y un pedido mayorista no descuenta ni reserva stock.
 *  - El precio depende de la cantidad (tramos por producto). Los fija el dueño; la referencia interna conversada es costo final × 1,5 (recargo del 50% sobre costo,
 *    NO un margen sobre venta y NO un «30% menos que el minorista»). Sin tramo o sin costo: «A cotizar».
 *  - Los beneficios minoristas quedan fuera de la venta mayorista. Pago por transferencia o efectivo.
 *  - Mientras el dueño no defina compra mínima, regla de combinación de productos y demora estimada, el catálogo NO se abre (los campos existen y se prueban con datos ficticios).
 */
const fail = (status: number, code: SaleErrorCode, message: string, details?: unknown): never => { throw new SaleError(status, code, message, details); };
function parseOr400<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) return fail(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/* ---------- Reglas comerciales (configurables; vacías hasta que el dueño decida) ---------- */

const K = { minBoxes: "wholesale.minBoxes", minUnits: "wholesale.minUnits", minAmount: "wholesale.minAmountMinor", combine: "wholesale.combine", delayText: "wholesale.delayText", delayFrom: "wholesale.delayFrom", refundPeriod: "wholesale.refundPeriod", cancellationPolicy: "wholesale.cancellationPolicy", open: "wholesale.open" } as const;

export async function getRules(db: Db): Promise<WholesaleRules> {
  const rows = await db.select().from(adminSettings).where(inArray(adminSettings.key, Object.values(K)));
  const g = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
  const int = (v: string | null) => (v !== null && /^\d+$/.test(v) ? Number(v) : null);
  const combine = g(K.combine);
  return { minBoxes: int(g(K.minBoxes)), minUnits: int(g(K.minUnits)), minAmountMinor: int(g(K.minAmount)), combine: combine === "producto" || combine === "pedido" ? combine : null, delayText: g(K.delayText), delayFrom: g(K.delayFrom), refundPeriod: g(K.refundPeriod), cancellationPolicy: g(K.cancellationPolicy), open: g(K.open) === "1" };
}

export const RulesSchema = z.object({
  minBoxes: z.number().int().min(1).max(100_000).nullable().optional(),
  minUnits: z.number().int().min(1).max(100_000).nullable(),
  minAmountMinor: z.number().int().min(100).max(1_000_000_000_00).nullable(),
  combine: z.enum(["producto", "pedido"]).nullable(),
  delayText: z.string().trim().min(3).max(200).nullable(),
  delayFrom: z.string().trim().min(3).max(120).nullable(),
  refundPeriod: z.string().trim().min(3).max(500).nullable().default(null),
  cancellationPolicy: z.string().trim().min(3).max(1000).nullable().default(null),
  open: z.boolean(),
});

export async function saveRules(db: Db, body: unknown, actor: Actor, now = Date.now()): Promise<WholesaleRules> {
  const v = parseOr400(RulesSchema, body);
  if (v.open) {
    const missing = missingForOpening(v, (await db.select({ n: wholesaleTiers.productId }).from(wholesaleTiers).where(eq(wholesaleTiers.state, "publicado"))).length);
    if (missing.length) return fail(409, "order_rule", `No se puede abrir el catálogo mayorista: falta definir ${missing.join(", ")}.`);
  }
  await db.transaction(async (tx) => {
    await lockKey(tx, "wholesale-rules");
    const put = async (key: string, value: string | null) => {
      if (value === null) { await tx.delete(adminSettings).where(eq(adminSettings.key, key)); return; }
      const vals = { value, updatedAt: now, updatedByEmail: actor.email };
      await tx.insert(adminSettings).values({ key, ...vals }).onConflictDoUpdate({ target: adminSettings.key, set: vals });
    };
    if (v.minBoxes !== undefined) await put(K.minBoxes, v.minBoxes === null ? null : String(v.minBoxes));
    await put(K.minUnits, v.minUnits === null ? null : String(v.minUnits));
    await put(K.minAmount, v.minAmountMinor === null ? null : String(v.minAmountMinor));
    await put(K.combine, v.combine);
    await put(K.delayText, v.delayText);
    await put(K.delayFrom, v.delayFrom);
    await put(K.refundPeriod, v.refundPeriod);
    await put(K.cancellationPolicy, v.cancellationPolicy);
    await put(K.open, v.open ? "1" : null);
  });
  return getRules(db);
}

/* ---------- Tramos ---------- */

export const TierSchema = z.object({
  productId: z.string().min(1).max(80),
  minQty: z.number({ error: "Escribí la cantidad desde la que rige el precio." }).int().min(1, "La cantidad mínima es 1.").max(1_000_000),
  unitPriceUsdMinor: z.number({ error: "Escribí el precio unitario en USD." }).int().min(1, "El precio debe ser mayor que cero.").max(100_000_000),
});

/** Guarda un tramo como BORRADOR (lo ve solo el panel). Un tramo ya publicado vuelve a borrador al cambiarlo: hay que revisarlo y publicarlo de nuevo. */
export async function saveTier(db: Db, body: unknown, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  const v = parseOr400(TierSchema, body);
  if (!catalog.products.some((p) => p.id === v.productId)) return fail(404, "not_found", "El producto no existe.");
  return db.transaction(async (tx) => {
    await lockKey(tx, `wholesale-tier:${v.productId}`);
    const [cur] = await tx.select().from(wholesaleTiers).where(and(eq(wholesaleTiers.productId, v.productId), eq(wholesaleTiers.minQty, v.minQty)));
    if (cur && cur.unitPriceUsdMinor === v.unitPriceUsdMinor) return { changed: false };
    const vals = { unitPriceUsdMinor: v.unitPriceUsdMinor, state: "borrador", updatedAt: now, updatedByEmail: actor.email };
    await tx.insert(wholesaleTiers).values({ productId: v.productId, minQty: v.minQty, ...vals }).onConflictDoUpdate({ target: [wholesaleTiers.productId, wholesaleTiers.minQty], set: vals });
    return { changed: true };
  });
}

export async function deleteTier(db: Db, productId: string, minQty: number): Promise<{ changed: boolean }> {
  const gone = await db.delete(wholesaleTiers).where(and(eq(wholesaleTiers.productId, productId), eq(wholesaleTiers.minQty, minQty))).returning({ p: wholesaleTiers.productId });
  return { changed: gone.length > 0 };
}

/** Publica los tramos de un producto: exige que el precio unitario BAJE (o se mantenga) al crecer la cantidad. */
export async function publishTiers(db: Db, productId: string, actor: Actor, now = Date.now()): Promise<{ published: number }> {
  return db.transaction(async (tx) => {
    await lockKey(tx, `wholesale-tier:${productId}`);
    const tiers = await tx.select().from(wholesaleTiers).where(eq(wholesaleTiers.productId, productId)).orderBy(asc(wholesaleTiers.minQty));
    if (!tiers.length) return fail(404, "not_found", "El producto no tiene tramos cargados.");
    for (let i = 1; i < tiers.length; i++) if (tiers[i].unitPriceUsdMinor > tiers[i - 1].unitPriceUsdMinor) return fail(409, "order_rule", `Los precios deberían bajar al comprar más: ${tiers[i].minQty} unidades cuesta más que ${tiers[i - 1].minQty}. Revisalos antes de publicar.`);
    const done = await tx.update(wholesaleTiers).set({ state: "publicado", updatedAt: now, updatedByEmail: actor.email }).where(and(eq(wholesaleTiers.productId, productId), eq(wholesaleTiers.state, "borrador"))).returning({ p: wholesaleTiers.productId });
    return { published: done.length };
  });
}

export const unpublishTiers = async (db: Db, productId: string, actor: Actor, now = Date.now()) =>
  (await db.update(wholesaleTiers).set({ state: "borrador", updatedAt: now, updatedByEmail: actor.email }).where(and(eq(wholesaleTiers.productId, productId), eq(wholesaleTiers.state, "publicado"))).returning({ p: wholesaleTiers.productId })).length;

/* ---------- Catálogo para cuentas aprobadas ---------- */

export type WholesaleAccess = { ok: true } | { ok: false; reason: "no_session" | "sin_solicitud" | "pendiente" | "rechazada" | "cerrado"; missing?: string[] };

/** ¿Puede esta cuenta ver y pedir precios mayoristas? Valida solicitud aprobada + catálogo abierto + condiciones definidas. */
export async function wholesaleAccess(db: Db, userId: string | null): Promise<WholesaleAccess> {
  if (!userId) return { ok: false, reason: "no_session" };
  const status = await wholesaleStatusFor(db, userId);
  if (status === null) return { ok: false, reason: "sin_solicitud" };
  if (status === "pendiente") return { ok: false, reason: "pendiente" };
  if (status === "rechazada") return { ok: false, reason: "rechazada" };
  const rules = await getRules(db);
  const tiers = (await db.select({ p: wholesaleTiers.productId }).from(wholesaleTiers).where(eq(wholesaleTiers.state, "publicado"))).length;
  const missing = missingForOpening(rules, tiers);
  if (!rules.open || missing.length) return { ok: false, reason: "cerrado", missing };
  return { ok: true };
}

/** Productos de la tienda con sus tramos PUBLICADOS, si tienen. No incluye costos, stock minorista ni nada interno. Solo se llama tras `wholesaleAccess`. */
export async function wholesaleCatalog(db: Db): Promise<{ rows: WholesaleRow[]; rules: WholesaleRules; rate10k: number | null; fx: EffectiveRate }> {
  const [rules, tiers, products, fx] = await Promise.all([getRules(db), db.select().from(wholesaleTiers).where(eq(wholesaleTiers.state, "publicado")).orderBy(asc(wholesaleTiers.minQty)), listProducts(db), currentRate(db)]);
  const rate = fx.rate10k ?? null;
  const rows: WholesaleRow[] = [];
  for (const p of products) {
    const mine = tiers.filter((t) => t.productId === p.id);
    const img = p.images[0];
    rows.push({ productId: p.id, slug: p.slug, sku: p.sku, title: p.title, language: p.language, kind: p.kind, image: img && img.status !== "demo" ? { src: img.src, alt: img.alt } : null, tiers: mine.map((t) => ({ minQty: t.minQty, unitUsdMinor: t.unitPriceUsdMinor, unitArsMinor: rate ? usdToArsMinor(t.unitPriceUsdMinor, rate) : null })) });
  }
  rows.sort((a, b) => Number(hasBasePrice(b)) - Number(hasBasePrice(a)) || a.title.localeCompare(b.title, "es"));
  return { rows, rules, rate10k: rate, fx };
}

/* ---------- Pedido mayorista ---------- */

export const WholesaleOrderSchema = z.object({
  lines: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number({ error: "La cantidad debe ser un número." }).int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1.").max(100_000) })).min(1, "Elegí al menos un producto.").max(60),
  contactName: z.string({ error: "Escribí el nombre y apellido." }).transform(normalizeName).refine(isFullName, "Escribí el nombre y apellido (solo letras)."),
  contactPhone: z.string().trim().max(20).nullish().transform((v) => (v ? v : null)).refine((v) => v === null || (/^[0-9+()\-\s]+$/.test(v) && v.replace(/\D/g, "").length >= 6), "Teléfono: usá solo números, espacios, + y guiones (mínimo 6 dígitos)."),
  note: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)),
  idempotencyKey: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

/**
 * Crea el pedido mayorista como una CONSULTA del sistema existente (`orderKind = mayorista`, líneas `mayorista`), con seguimiento abierto en «Solicitud recibida».
 * Guarda el precio por tramo que se mostró (con la cotización del momento), sin descuentos minoristas. No reserva ni descuenta stock. Idempotente por clave.
 * El importe acordado lo confirma la tienda después (disponibilidad e importe), y recién entonces corresponde la seña del 20%.
 */
export async function createWholesaleOrder(db: Db, userId: string, body: unknown, now = Date.now()): Promise<{ reference: string; replayed: boolean; quote: Quote }> {
  const v = parseOr400(WholesaleOrderSchema, body);
  const access = await wholesaleAccess(db, userId);
  if (!access.ok) return fail(403, "forbidden", access.reason === "cerrado" ? "El catálogo mayorista todavía no está habilitado." : "Tu cuenta mayorista no está aprobada.");
  const ids = v.lines.map((l) => l.productId);
  if (new Set(ids).size !== ids.length) return fail(400, "invalid_input", "Un producto no puede repetirse: sumá las cantidades en una sola línea.");
  const { rows, rules, rate10k } = await wholesaleCatalog(db);
  const q = quote(rows, rules, v.lines, rate10k);
  if (!q.ok) return fail(409, "order_rule", q.problems[0] ?? "El pedido no cumple las condiciones mayoristas.", q.problems);
  const key = `mayorista-${v.idempotencyKey}`;
  const hash = sha(JSON.stringify([userId, v.lines.map((l) => [l.productId, l.quantity]).sort(), v.contactName]));
  const [dup] = await db.select().from(inquiries).where(eq(inquiries.idempotencyKey, key));
  if (dup) return dup.contentHash === hash && dup.userId === userId ? { reference: dup.id, replayed: true, quote: q } : fail(422, "idempotency_conflict", "Esa clave ya se usó con otro pedido.");
  const id = newReference();
  const msg = [`Pedido MAYORISTA ${id} (por pedido: no usa stock minorista).`, ...q.lines.map((l) => `${l.quantity} × ${l.title} — ${formatARS(l.unitArsMinor!)} c/u`), `Total estimado: ${formatARS(q.totalArsMinor)} (a confirmar disponibilidad e importe).`, "Pago: transferencia o efectivo, sin descuento adicional.", ...(rules.delayText ? [`Demora estimada: ${rules.delayText} (${rules.delayFrom}).`] : []), ...(v.note ? [`Nota: ${v.note}`] : [])].join("\n");
  try {
    await db.transaction(async (tx) => {
      await lockKey(tx, `wholesale-order:${key}`);
      await tx.insert(inquiries).values({
        id, idempotencyKey: key, contentHash: hash, sessionTokenHash: sha(randomBytes(24).toString("hex")), userId, status: "consulta_mayorista", currency: "ARS", subtotalMinor: q.totalArsMinor, discountMinor: 0, comboDiscountMinor: 0,
        fxRate10k: rate10k, fxMode: null, fxSource: null, fxAsOf: now, deliveryMethod: "a_coordinar", deliveryJson: JSON.stringify({ method: "a_coordinar" }), paymentPreference: "mayorista",
        contactName: v.contactName, contactPhone: v.contactPhone, message: msg, createdAt: now, source: "web", crmStatus: "pendiente", orderKind: "mayorista",
      });
      await tx.insert(inquiryLines).values(q.lines.map((l) => {
        const p = catalog.products.find((x) => x.id === l.productId)!;
        return { inquiryId: id, productId: p.id, sku: p.sku, title: p.title, language: p.language, quantity: l.quantity, fulfillment: "mayorista", unitPriceUsdMinor: l.unitUsdMinor, unitPriceMinor: l.unitArsMinor!, lineSubtotalMinor: l.totalArsMinor!, baseCurrency: "USD" };
      }));
      await tx.insert(inquiryEvents).values({ inquiryId: id, kind: "created", detail: "Pedido mayorista creado desde el catálogo mayorista.", actorEmail: null, createdAt: now });
      await trackLock(tx, id);
      await ensureTrack(tx, id, now, { text: "Recibimos tu solicitud de pedido mayorista." });
    });
  } catch (e) {
    const [raced] = await db.select().from(inquiries).where(eq(inquiries.idempotencyKey, key));
    if (raced && raced.contentHash === hash && raced.userId === userId) return { reference: raced.id, replayed: true, quote: q };
    throw e;
  }
  return { reference: id, replayed: false, quote: q };
}

export async function listTiersForAdmin(db: Db) {
  return db.select().from(wholesaleTiers).orderBy(asc(wholesaleTiers.productId), asc(wholesaleTiers.minQty));
}

export { missingForOpening, quote, suggestedFromCost, tierFor, type Quote, type QuoteLine, type Tier, type WholesaleRow, type WholesaleRules } from "./calc";
