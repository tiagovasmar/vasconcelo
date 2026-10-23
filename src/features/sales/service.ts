import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { inquiries, inquiryLines, inquirySales, productOverrides, saleLines, sales, stockMovements } from "@/db/schema";
import { discountKindOf } from "@/features/promos/combo";
import { assertConvertible, attachSale, closeLinkOnVoid, lockInquiry } from "@/features/consultas/links";
import { SaleError } from "./errors";
import { catalog } from "@/content/catalog";
import { paymentMethods } from "@/content/checkout-options";
import type { Language, Product } from "@/content/schema";
import { AdminError, writeStock, type Actor } from "@/features/catalog/overrides";
import { listAllProducts } from "@/features/catalog/data";
import { defaultStock } from "@/features/catalog/commercial";
import { currentRate } from "@/features/fx/service";
import type { EffectiveRate } from "@/features/fx/convert";

/**
 * Ventas manuales (incluidas las hechas fuera de la web) y movimientos de stock.
 *
 * Reglas que NO se negocian (todas se hacen cumplir acá, en el servidor, dentro de UNA transacción):
 *  - registrar una venta descuenta el stock una sola vez y deja venta + líneas + movimientos + historial de cambios, o no deja nada;
 *  - nunca se vende más de lo que hay (ni stock pendiente/desconocido) y el stock nunca queda negativo;
 *  - un doble clic o un reintento con la misma clave de idempotencia devuelve la MISMA venta, no una segunda;
 *  - los precios guardados son los realmente cobrados y no cambian aunque después cambien el catálogo o la cotización;
 *  - ventas, líneas y movimientos no se editan ni se borran (también lo impide la base); un error se corrige anulando la venta, que devuelve el stock.
 * Una consulta por WhatsApp o un carrito armado NO pasan por acá: nunca descuentan stock.
 */
export const SALE_PAYMENT_IDS = paymentMethods.map((p) => p.id) as [string, ...string[]];
export const paymentLabelOf = (id: string) => paymentMethods.find((p) => p.id === id)?.label ?? id;

export { SaleError, type SaleErrorCode } from "./errors";

const KEY = z.string().min(16, "Falta la clave de la operación.").max(64).regex(/^[A-Za-z0-9_-]+$/, "La clave de la operación no es válida.");

export const SaleInputSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(80),
        quantity: z.number({ error: "La cantidad debe ser un número." }).int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1.").max(999, "La cantidad es demasiado alta."),
        /** Precio unitario cobrado, en centavos de ARS; siempre en pesos enteros. */
        unitPriceMinor: z.number({ error: "Escribí el precio de venta." }).int("El precio debe ser un número entero.").min(100, "El precio de venta debe ser de al menos $1.").max(1_000_000_000, "El precio es demasiado alto.").multipleOf(100, "El precio debe estar en pesos enteros."),
        /** Descuento TOTAL de la línea (combo caja + sobres y/o transferencia), en pesos enteros. Al convertir una consulta viene ya calculado: la venta NO vuelve a aplicar ninguna promoción. */
        discountMinor: z.number({ error: "El descuento debe ser un número." }).int("El descuento debe ser un número entero.").min(0, "El descuento no puede ser negativo.").max(1_000_000_000, "El descuento es demasiado alto.").multipleOf(100, "El descuento debe estar en pesos enteros.").optional().default(0),
      }),
    )
    .min(1, "Elegí al menos un producto.")
    .max(30, "Demasiados productos en una sola venta."),
  paymentMethod: z.enum(SALE_PAYMENT_IDS, { error: "Elegí un método de pago." }),
  note: z.string().trim().max(300, "La observación es demasiado larga (máximo 300).").optional().transform((v) => (v ? v : undefined)),
  /** Si la venta convierte una consulta: la venta, el descuento de stock y el vínculo se guardan en la MISMA transacción. */
  inquiryId: z.string().trim().min(1).max(40).optional(),
  idempotencyKey: KEY,
});
export type SaleInput = z.input<typeof SaleInputSchema>;

export type PreviewLine = {
  productId: string; sku: string; title: string; quantity: number; unitPriceMinor: number; discountMinor: number; lineTotalMinor: number;
  /** Stock actual (null = pendiente) y cómo quedaría. */
  stockNow: number | null; stockAfter: number | null; problem: string | null;
};
export type SalePreview = { lines: PreviewLine[]; totalMinor: number; ok: boolean };

export type SaleView = {
  id: string; status: string; paymentMethod: string; paymentLabel: string; note: string | null; totalMinor: number; createdAt: number; createdByEmail: string;
  voidedAt: number | null; voidedByEmail: string | null; voidReason: string | null;
  /** Consulta de origen (y su persona), si la venta salió de una consulta o se vinculó a una. */
  inquiry?: { id: string; name: string | null; kind: string; active: boolean } | null;
  lines: Array<{ productId: string; sku: string; title: string; language: Language; quantity: number; unitPriceMinor: number; catalogPriceMinor: number | null; catalogPriceUsdMinor: number | null; lineTotalMinor: number; discountMinor: number; discountKind: string | null; baseCurrency: string | null; packSize: number | null }>;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export function newSaleId(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "VT-" + Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

type Parsed = z.output<typeof SaleInputSchema>;
const hashOf = (i: Parsed) => sha(JSON.stringify({ items: [...i.items].map((x) => [x.productId, x.quantity, x.unitPriceMinor, x.discountMinor]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), p: i.paymentMethod, n: i.note ?? "", q: i.inquiryId ?? "" }));

function parse(body: unknown): Parsed {
  const r = SaleInputSchema.safeParse(body);
  if (!r.success) throw new SaleError(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos de la venta.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const ids = r.data.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) throw new SaleError(400, "invalid_input", "Un producto no puede repetirse en la misma venta: sumá las cantidades en una sola línea.");
  return r.data;
}

const productOf = (id: string): Product => {
  const p = catalog.products.find((x) => x.id === id);
  if (!p) throw new SaleError(404, "not_found", "Hay un producto que no existe en el catálogo.");
  if (p.retired) throw new SaleError(409, "retired", `«${p.title}» está retirado de la oferta: no se puede registrar una venta.`);
  return p;
};

/** Vista previa SIN escribir nada: qué stock hay ahora y cómo quedaría. El servidor es la autoridad; el navegador solo la muestra. */
export async function previewSale(db: Db, body: unknown): Promise<SalePreview> {
  const input = parse(body);
  if (input.inquiryId) {
    const [inq] = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.id, input.inquiryId));
    if (!inq) throw new SaleError(404, "not_found", "La consulta no existe.");
    const [active] = await db.select().from(inquirySales).where(and(eq(inquirySales.inquiryId, input.inquiryId), eq(inquirySales.active, true)));
    if (active) throw new SaleError(409, "already_converted", `Esta consulta ya tiene una venta vigente (${active.saleId}).`, { saleId: active.saleId });
  }
  const rows = new Map((await db.select().from(productOverrides).where(inArray(productOverrides.productId, input.items.map((i) => i.productId)))).map((r) => [r.productId, r]));
  const lines = input.items.map((it): PreviewLine => {
    const p = productOf(it.productId);
    const row = rows.get(p.id);
    const stockNow = row ? row.stockQuantity : defaultStock(p);
    const orderOnly = row ? row.orderOnly : Boolean(p.orderOnly);
    if (it.discountMinor > it.unitPriceMinor * it.quantity) throw new SaleError(400, "invalid_input", `El descuento de «${p.title}» no puede superar el importe de la línea.`);
    let problem: string | null = null;
    if (stockNow === null) problem = "El stock está pendiente: cargalo en Productos o con un ajuste antes de vender.";
    else if (orderOnly && stockNow === 0) problem = "Este producto es solo por encargo y no tiene stock cargado: registrá primero la entrada.";
    else if (it.quantity > stockNow) problem = `Stock insuficiente: hay ${stockNow} y querés vender ${it.quantity}.`;
    return { productId: p.id, sku: p.sku, title: row?.title ?? p.title, quantity: it.quantity, unitPriceMinor: it.unitPriceMinor, discountMinor: it.discountMinor, lineTotalMinor: it.unitPriceMinor * it.quantity - it.discountMinor, stockNow, stockAfter: problem || stockNow === null ? null : stockNow - it.quantity, problem };
  });
  return { lines, totalMinor: lines.reduce((n, l) => n + l.lineTotalMinor, 0), ok: lines.every((l) => !l.problem) };
}

async function loadSale(db: Db, id: string): Promise<SaleView | null> {
  const [s] = await db.select().from(sales).where(eq(sales.id, id));
  if (!s) return null;
  const [origin] = await originsOf(db, [id]);
  return { ...toView(s, await db.select().from(saleLines).where(eq(saleLines.saleId, id)).orderBy(saleLines.id)), inquiry: origin?.inquiry ?? null };
}

/** Consulta de origen de cada venta (si la tiene), con el nombre de la persona. */
async function originsOf(db: Db, saleIds: string[]): Promise<Array<{ saleId: string; inquiry: NonNullable<SaleView["inquiry"]> }>> {
  if (!saleIds.length) return [];
  const rows = await db
    .select({ saleId: inquirySales.saleId, inquiryId: inquirySales.inquiryId, kind: inquirySales.kind, active: inquirySales.active, name: inquiries.contactName })
    .from(inquirySales).innerJoin(inquiries, eq(inquiries.id, inquirySales.inquiryId)).where(inArray(inquirySales.saleId, saleIds));
  return rows.map((r) => ({ saleId: r.saleId, inquiry: { id: r.inquiryId, name: r.name, kind: r.kind, active: r.active } }));
}

function toView(s: typeof sales.$inferSelect, lines: Array<typeof saleLines.$inferSelect>): SaleView {
  return {
    id: s.id, status: s.status, paymentMethod: s.paymentMethod, paymentLabel: paymentLabelOf(s.paymentMethod), note: s.note, totalMinor: s.totalMinor, createdAt: s.createdAt, createdByEmail: s.createdByEmail,
    voidedAt: s.voidedAt, voidedByEmail: s.voidedByEmail, voidReason: s.voidReason,
    lines: lines.map((l) => ({ productId: l.productId, sku: l.sku, title: l.title, language: l.language as Language, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, catalogPriceMinor: l.catalogPriceMinor, catalogPriceUsdMinor: l.catalogPriceUsdMinor, lineTotalMinor: l.lineTotalMinor, discountMinor: l.discountMinor, discountKind: l.discountKind, baseCurrency: l.baseCurrency, packSize: l.packSize })),
  };
}

/**
 * Registra la venta y descuenta el stock en UNA transacción. Toma los candados `override:<producto>` (los mismos que usa el panel al editar un
 * producto) en orden fijo, así dos ventas o una venta y una edición simultáneas se serializan sin interbloqueos y la segunda ve el stock ya descontado.
 */
export async function registerSale(db: Db, body: unknown, actor: Actor, ctx: { fx?: EffectiveRate; products?: Product[]; now?: number } = {}): Promise<{ sale: SaleView; replayed: boolean }> {
  const input = parse(body);
  const hash = hashOf(input);
  const existing = await loadByKey(db, input.idempotencyKey);
  if (existing) return replay(existing, hash);

  // Referencia de catálogo (solo informativa): precio vigente en pesos y en dólares al momento de vender.
  const fx = ctx.fx ?? (await currentRate(db));
  const current = new Map((ctx.products ?? (await listAllProducts(fx, db))).map((p) => [p.id, p]));
  const catalogProducts = input.items.map((i) => productOf(i.productId));
  const now = ctx.now ?? Date.now();
  const id = newSaleId();
  const ordered = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId));

  try {
    await db.transaction(async (tx) => {
      await lockKey(tx, `sale:${input.idempotencyKey}`);
      const again = await tx.select({ id: sales.id }).from(sales).where(eq(sales.idempotencyKey, input.idempotencyKey));
      if (again.length) throw new Replayed();
      // Orden de candados: clave → consulta → productos. La consulta se verifica bajo su candado: dos conversiones simultáneas no pueden pasar las dos.
      let inquiry: Awaited<ReturnType<typeof assertConvertible>> | null = null;
      if (input.inquiryId) {
        await lockInquiry(tx, input.inquiryId);
        inquiry = await assertConvertible(tx, input.inquiryId);
      }
      for (const it of ordered) await lockKey(tx, `override:${it.productId}`);
      const rows = new Map((await tx.select().from(productOverrides).where(inArray(productOverrides.productId, ordered.map((i) => i.productId)))).map((r) => [r.productId, r]));
      for (const i of input.items) if (i.discountMinor > i.unitPriceMinor * i.quantity) throw new SaleError(400, "invalid_input", "El descuento de una línea no puede superar su importe.");
      const total = input.items.reduce((n, i) => n + i.unitPriceMinor * i.quantity - i.discountMinor, 0);
      // Si la venta convierte una consulta, el detalle del descuento sale de ESA consulta (no se recalcula nada): si coincide con lo que se cotizó, conserva su tipo.
      const inquiryLinesByProduct = new Map<string, typeof inquiryLines.$inferSelect>();
      if (inquiry) for (const l of await tx.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, inquiry.id))) inquiryLinesByProduct.set(l.productId, l);
      await tx.insert(sales).values({
        id, idempotencyKey: input.idempotencyKey, contentHash: hash, paymentMethod: input.paymentMethod, note: input.note ?? null, totalMinor: total,
        fxRate10k: fx.rate10k ?? null, status: "registrada", createdAt: now, createdByUserId: actor.id, createdByEmail: actor.email,
      });
      for (const it of input.items) {
        const p = catalogProducts.find((x) => x.id === it.productId)!;
        const row = rows.get(p.id);
        const stock = row ? row.stockQuantity : defaultStock(p);
        const orderOnly = row ? row.orderOnly : Boolean(p.orderOnly);
        if (stock === null) throw new SaleError(409, "stock_pending", `El stock de «${p.title}» está pendiente: cargalo antes de vender.`, { productId: p.id });
        if (orderOnly && stock === 0) throw new SaleError(409, "order_only", `«${p.title}» es solo por encargo y no tiene stock cargado.`, { productId: p.id });
        if (it.quantity > stock) throw new SaleError(409, "insufficient_stock", `Stock insuficiente de «${p.title}»: hay ${stock} y querés vender ${it.quantity}.`, { productId: p.id, stock, quantity: it.quantity });
        const title = row?.title ?? p.title;
        const w = await writeStock(tx, p, row, stock - it.quantity, actor, `${actor.email} (venta ${id})`, now);
        await tx.insert(stockMovements).values({ productId: p.id, sku: p.sku, title, kind: "venta", delta: -it.quantity, stockBefore: stock, stockAfter: stock - it.quantity, reason: `Venta ${id}`, saleId: id, userId: actor.id, userEmail: actor.email, createdAt: w.version });
        const live = current.get(p.id);
        await tx.insert(saleLines).values({ saleId: id, productId: p.id, sku: p.sku, title, language: p.language, quantity: it.quantity, unitPriceMinor: it.unitPriceMinor, catalogPriceMinor: live?.priceMinor ?? null, catalogPriceUsdMinor: live?.priceUsdMinor ?? null, lineTotalMinor: it.unitPriceMinor * it.quantity - it.discountMinor,
          discountMinor: it.discountMinor, baseCurrency: (live?.priceUsdMinor ?? null) !== null ? "USD" : "ARS", packSize: p.packSize ?? null,
          discountKind: it.discountMinor === 0 ? null : (() => { const q = inquiryLinesByProduct.get(p.id); return q && q.comboDiscountMinor + q.transferDiscountMinor === it.discountMinor ? discountKindOf(q) : "manual"; })() });
      }
      if (inquiry) await attachSale(tx, { inquiry, saleId: id, kind: "convertida", totalMinor: total, actor, now });
    });
  } catch (e) {
    if (e instanceof Replayed) {
      const raced = await loadByKey(db, input.idempotencyKey);
      if (raced) return replay(raced, hash);
    }
    throw e;
  }
  return { sale: (await loadSale(db, id))!, replayed: false };
}

class Replayed extends Error {}

async function loadByKey(db: Db, key: string) {
  const [s] = await db.select().from(sales).where(eq(sales.idempotencyKey, key));
  if (!s) return null;
  return { s, lines: await db.select().from(saleLines).where(eq(saleLines.saleId, s.id)).orderBy(saleLines.id) };
}
function replay(found: NonNullable<Awaited<ReturnType<typeof loadByKey>>>, hash: string): { sale: SaleView; replayed: true } {
  if (found.s.contentHash !== hash) throw new SaleError(422, "idempotency_conflict", "Esa operación ya se registró con otros datos. Armá la venta de nuevo.");
  return { sale: toView(found.s, found.lines), replayed: true };
}

/** Anula una venta registrada: devuelve el stock, deja el motivo y la marca de anulada. Una sola vez, de forma atómica. */
export async function voidSale(db: Db, saleId: string, reasonRaw: string, actor: Actor, now = Date.now()): Promise<SaleView> {
  const reason = (reasonRaw ?? "").trim();
  if (reason.length < 5 || reason.length > 200) throw new SaleError(400, "invalid_input", "Escribí el motivo de la anulación (entre 5 y 200 caracteres).");
  // Orden de candados: consulta (si la venta está vinculada) → venta → productos. El vínculo se mira antes de bloquear y se confirma después; si cambió justo en
  // ese instante (alguien vinculó la venta), se reintenta con el candado correcto en lugar de tocar la consulta sin su candado.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await voidOnce(db, saleId, reason, actor, now);
      return (await loadSale(db, saleId))!;
    } catch (e) {
      if (e instanceof LinkChanged && attempt < 3) continue;
      throw e;
    }
  }
  throw new SaleError(409, "not_found", "No se pudo anular la venta por un cambio simultáneo. Intentá de nuevo.");
}

class LinkChanged extends Error {}

async function voidOnce(db: Db, saleId: string, reason: string, actor: Actor, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [peek] = await tx.select().from(inquirySales).where(and(eq(inquirySales.saleId, saleId), eq(inquirySales.active, true)));
    if (peek) await lockInquiry(tx, peek.inquiryId);
    await lockKey(tx, `sale-void:${saleId}`);
    const [link] = await tx.select().from(inquirySales).where(and(eq(inquirySales.saleId, saleId), eq(inquirySales.active, true)));
    if ((link?.inquiryId ?? null) !== (peek?.inquiryId ?? null)) throw new LinkChanged();
    const [s] = await tx.select().from(sales).where(eq(sales.id, saleId));
    if (!s) throw new SaleError(404, "not_found", "La venta no existe.");
    if (s.status === "anulada") throw new SaleError(409, "already_voided", "Esa venta ya está anulada.");
    const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(saleLines.productId);
    for (const l of lines) await lockKey(tx, `override:${l.productId}`);
    const rows = new Map((await tx.select().from(productOverrides).where(inArray(productOverrides.productId, lines.map((l) => l.productId)))).map((r) => [r.productId, r]));
    for (const l of lines) {
      const p = catalog.products.find((x) => x.id === l.productId);
      if (!p) throw new SaleError(404, "not_found", `El producto ${l.sku} ya no está en el catálogo.`);
      const row = rows.get(p.id);
      const stock = row ? row.stockQuantity : defaultStock(p);
      if (stock === null) throw new SaleError(409, "stock_pending", `El stock de «${l.title}» quedó pendiente: fijalo con un ajuste antes de anular.`, { productId: p.id });
      const w = await writeStock(tx, p, row, stock + l.quantity, actor, `${actor.email} (anulación de ${saleId})`, now);
      await tx.insert(stockMovements).values({ productId: p.id, sku: p.sku, title: l.title, kind: "anulacion", delta: l.quantity, stockBefore: stock, stockAfter: stock + l.quantity, reason: `Anulación de ${saleId}: ${reason}`, saleId, userId: actor.id, userEmail: actor.email, createdAt: w.version });
    }
    await tx.update(sales).set({ status: "anulada", voidedAt: now, voidedByEmail: actor.email, voidReason: reason }).where(eq(sales.id, saleId));
    if (link) await closeLinkOnVoid(tx, link, { saleId, reason, stockReturned: lines.length > 0, actor, now });
  });
}

/**
 * Vincula una venta que YA estaba registrada (descontó su stock cuando se registró) a una consulta. No toca el stock ni la venta: solo agrega el vínculo y marca la
 * consulta como convertida. Repetirlo con la misma consulta no hace nada; una venta anulada o ya vinculada a otra consulta se rechaza.
 */
export async function linkSaleToInquiry(db: Db, saleId: string, inquiryId: string, actor: Actor, now = Date.now()): Promise<{ sale: SaleView; replayed: boolean }> {
  const replayed = await db.transaction(async (tx) => {
    await lockInquiry(tx, inquiryId);
    await lockKey(tx, `sale-void:${saleId}`);
    const [s] = await tx.select().from(sales).where(eq(sales.id, saleId));
    if (!s) throw new SaleError(404, "not_found", "La venta no existe.");
    const [existing] = await tx.select().from(inquirySales).where(eq(inquirySales.saleId, saleId));
    if (existing) {
      if (existing.inquiryId === inquiryId && existing.active) return true; // reintento: ya estaba vinculada a esta consulta
      throw new SaleError(409, "already_linked", existing.inquiryId === inquiryId ? "Esa venta ya estuvo vinculada a esta consulta y fue anulada." : `Esa venta ya está vinculada a la consulta ${existing.inquiryId}.`);
    }
    if (s.status !== "registrada") throw new SaleError(409, "voided", "Una venta anulada no se puede vincular a una consulta.");
    const inquiry = await assertConvertible(tx, inquiryId);
    await attachSale(tx, { inquiry, saleId, kind: "vinculada", totalMinor: s.totalMinor, actor, now });
    return false;
  });
  return { sale: (await loadSale(db, saleId))!, replayed };
}

/* ---------- Entradas y ajustes de stock ---------- */

export const StockMoveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entrada"), productId: z.string().min(1).max(80), quantity: z.number({ error: "Escribí cuántas unidades entraron." }).int("La cantidad debe ser un número entero.").min(1, "Tiene que entrar al menos 1 unidad.").max(100000, "La cantidad es demasiado alta."), reason: z.string().trim().min(3, "Escribí el motivo (mínimo 3 caracteres).").max(200, "El motivo es demasiado largo (máximo 200)."), idempotencyKey: KEY }),
  z.object({ kind: z.literal("ajuste"), productId: z.string().min(1).max(80), newQuantity: z.number({ error: "Escribí la cantidad que hay realmente." }).int("La cantidad debe ser un número entero.").min(0, "El stock no puede ser negativo.").max(1_000_000, "La cantidad es demasiado alta."), reason: z.string().trim().min(3, "Escribí el motivo (mínimo 3 caracteres).").max(200, "El motivo es demasiado largo (máximo 200)."), idempotencyKey: KEY }),
]);
export type StockMoveInput = z.input<typeof StockMoveSchema>;

/**
 * Entrada de mercadería (suma) o ajuste a la cantidad realmente contada (fija el valor). Ambos exigen motivo y quedan en el historial con quién y cuándo.
 * La clave de idempotencia evita repetir el mismo movimiento por un doble clic: la marca vive en la razón del movimiento (`[op:<clave>]`) bajo el mismo candado.
 */
export async function moveStock(db: Db, body: unknown, actor: Actor, now = Date.now()): Promise<{ stockBefore: number | null; stockAfter: number; replayed: boolean }> {
  const r = StockMoveSchema.safeParse(body);
  if (!r.success) throw new SaleError(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const input = r.data;
  const p = productOf(input.productId);
  const mark = `[op:${input.idempotencyKey}]`;
  try {
    return await db.transaction(async (tx) => {
      await lockKey(tx, `override:${p.id}`);
      const done = await tx.select().from(stockMovements).where(sql`${stockMovements.productId} = ${p.id} and position(${mark} in ${stockMovements.reason}) > 0`);
      if (done.length) return { stockBefore: done[0].stockBefore, stockAfter: done[0].stockAfter, replayed: true };
      const [row] = await tx.select().from(productOverrides).where(eq(productOverrides.productId, p.id));
      const stock = row ? row.stockQuantity : defaultStock(p);
      let after: number;
      if (input.kind === "entrada") {
        if (stock === null) throw new SaleError(409, "stock_pending", "El stock de este producto está pendiente: usá «Ajuste» para fijar la cantidad contada.");
        after = stock + input.quantity;
      } else {
        after = input.newQuantity;
        if (stock === after) throw new SaleError(400, "invalid_input", "El stock ya es esa cantidad: no hay nada que ajustar.");
      }
      const orderOnly = row ? row.orderOnly : Boolean(p.orderOnly);
      if (orderOnly && after > 0) throw new SaleError(409, "order_only", "Este producto está marcado «solo por encargo»: desmarcalo en Productos antes de cargarle stock.");
      const label = input.kind === "entrada" ? "entrada" : "ajuste";
      const w = await writeStock(tx, p, row, after, actor, `${actor.email} (${label} de stock)`, now);
      await tx.insert(stockMovements).values({ productId: p.id, sku: p.sku, title: row?.title ?? p.title, kind: input.kind, delta: after - (stock ?? 0), stockBefore: stock, stockAfter: after, reason: `${input.reason} ${mark}`, saleId: null, userId: actor.id, userEmail: actor.email, createdAt: w.version });
      return { stockBefore: stock, stockAfter: after, replayed: false };
    });
  } catch (e) {
    if (e instanceof AdminError) throw new SaleError(e.status, "invalid_input", e.message);
    throw e;
  }
}

/* ---------- Listados ---------- */

export async function listSales(db: Db, limit = 50): Promise<SaleView[]> {
  const rows = await db.select().from(sales).orderBy(desc(sales.createdAt), desc(sales.id)).limit(Math.min(limit, 500));
  if (!rows.length) return [];
  const ids = rows.map((s) => s.id);
  const [lines, origins] = await Promise.all([db.select().from(saleLines).where(inArray(saleLines.saleId, ids)).orderBy(saleLines.id), originsOf(db, ids)]);
  return rows.map((s) => ({ ...toView(s, lines.filter((l) => l.saleId === s.id)), inquiry: origins.find((o) => o.saleId === s.id)?.inquiry ?? null }));
}

export type MovementView = typeof stockMovements.$inferSelect;
/** El marcador interno de idempotencia `[op:…]` no se muestra. */
export const cleanReason = (r: string) => r.replace(/\s*\[op:[A-Za-z0-9_-]+\]$/, "");
export async function listMovements(db: Db, opts: { productId?: string; kind?: string; limit?: number } = {}): Promise<MovementView[]> {
  const conds = [opts.productId ? eq(stockMovements.productId, opts.productId) : undefined, opts.kind ? eq(stockMovements.kind, opts.kind) : undefined].filter((c): c is NonNullable<typeof c> => Boolean(c));
  const q = db.select().from(stockMovements);
  const filtered = conds.length ? q.where(conds.length === 1 ? conds[0] : sql.join(conds, sql` and `)) : q;
  return filtered.orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(Math.min(opts.limit ?? 100, 1000));
}
