import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { productAudit, productGalleries, productOverrides, systemFlags } from "@/db/schema";
import { defaultStock } from "./commercial";
import { ImageAssetSchema, type ImageAsset, type Product } from "@/content/schema";
import { usdToArsMinor, type EffectiveRate } from "@/features/fx/convert";

/**
 * Valores comerciales y de presentación administrados desde /admin.
 *
 * Convivencia con el catálogo por código: el código es la BASE. Si un producto tiene una fila en `product_overrides`, sus valores
 * reemplazan a los del código (precio USD, stock, máximo por pedido, visibilidad, «por encargo», y título/descripción si se editaron);
 * sin fila rige el código. «Restablecer» borra la fila. La galería elegida en el panel vive aparte (`product_galleries`).
 * Importadores, seeds y scripts del catálogo NUNCA escriben estas tablas: lo que carga el dueño no se pisa en silencio.
 *
 * Precio: el dato guardado es el USD (`priceUsdMinor`, centavos de dólar). El precio en pesos NO se guarda: se calcula acá, con la
 * cotización vigente, en un único punto (`usdToArsMinor`) y todo el sitio lo consume desde `product.priceMinor`.
 */
export type OverrideRow = typeof productOverrides.$inferSelect;
export type GalleryRow = typeof productGalleries.$inferSelect;
export type Actor = { id: string; email: string };

export async function loadOverrides(db: Db): Promise<Map<string, OverrideRow>> {
  return new Map((await db.select().from(productOverrides)).map((r) => [r.productId, r]));
}
export async function loadGalleries(db: Db): Promise<Map<string, GalleryRow>> {
  return new Map((await db.select().from(productGalleries)).map((r) => [r.productId, r]));
}

/** Galería guardada → imágenes válidas (las inválidas se descartan; si no queda ninguna, rige la del código). */
export function parseGallery(row: GalleryRow | undefined): ImageAsset[] | null {
  if (!row) return null;
  try {
    const raw = JSON.parse(row.itemsJson) as unknown[];
    const items = raw.map((x) => ImageAssetSchema.safeParse(x)).filter((r) => r.success).map((r) => r.data!);
    return items.length ? items : null;
  } catch {
    return null;
  }
}

/**
 * Aplica los valores del panel y la conversión USD → ARS sobre los productos del catálogo base (devuelve copias; no muta el catálogo).
 * - Con precio USD: ARS = conversión con la cotización vigente; sin cotización utilizable queda PENDIENTE (null), nunca $0.
 * - Sin precio USD y sin fila del panel: rige el precio ARS fijo del código SOLO en productos de demostración/prueba. En el catálogo real un
 *   precio ARS del código (p. ej. `commercial.json`) es un dato anterior: se conserva pero no rige ni se convierte; el precio queda pendiente.
 * - Sin precio USD y con fila del panel: pendiente (un precio ARS anterior del panel no se convierte ni se sigue usando).
 */
export function applyOverrides(base: Product[], rows: Map<string, OverrideRow>, fx: EffectiveRate | null = null, galleries: Map<string, GalleryRow> = new Map()): Product[] {
  return base.map((p) => {
    const o = rows.get(p.id);
    const gallery = parseGallery(galleries.get(p.id));
    const usd = o ? o.priceUsdMinor : p.priceUsdMinor ?? null;
    const ars = usd !== null && usd !== undefined ? (fx?.rate10k ? usdToArsMinor(usd, fx.rate10k) : null) : o || !p.isDemo ? null : p.priceMinor;
    // Sin valores propios en el panel: el stock inicial del catálogo real es 0 («Sin stock»), nunca «pendiente».
    if (!o) return { ...p, priceUsdMinor: usd ?? null, priceMinor: ars, stockQuantity: defaultStock(p), ...(gallery ? { images: gallery } : {}) };
    const { maxPerOrder: _unused, ...rest } = p;
    void _unused;
    return {
      ...rest,
      title: o.title ?? p.title,
      description: o.description ?? p.description,
      priceUsdMinor: usd,
      priceMinor: ars,
      stockQuantity: o.stockQuantity,
      orderOnly: o.orderOnly,
      // Un producto retirado por código NO se puede volver a mostrar desde el panel.
      active: o.visible && !p.retired,
      ...(o.maxPerOrder ? { maxPerOrder: o.maxPerOrder } : {}),
      ...(gallery ? { images: gallery } : {}),
    };
  });
}

/**
 * Lo que envía el panel. Precio en centavos de dólar; `null` = pendiente / sin valor propio. Cada campo es OPCIONAL: lo que no se
 * envía conserva su valor actual (así la edición rápida de la lista, que solo manda precio y stock, no pisa título, descripción ni fotos).
 */
export const ProductEditSchema = z.object({
  priceUsdMinor: z.number().int("El precio en dólares debe tener a lo sumo dos decimales.").min(1, "El precio debe ser de al menos USD 0,01 (dejalo vacío si todavía está pendiente).").max(100_000_000, "El precio es demasiado alto.").nullable().optional(),
  stock: z.number().int("El stock debe ser un número entero.").min(0, "El stock no puede ser negativo.").max(1_000_000, "El stock es demasiado alto.").nullable().optional(),
  maxPerOrder: z.number().int("El máximo por pedido debe ser un número entero.").min(1, "El máximo por pedido debe ser al menos 1 (dejalo vacío si no hay tope).").max(99, "El máximo por pedido no puede superar 99.").nullable().optional(),
  visible: z.boolean().optional(),
  /** Disponible solo por encargo: no se vende de stock, se consulta y se cotiza con la tienda. */
  orderOnly: z.boolean().optional(),
  /** Título editado; null = el del catálogo. */
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres.").max(160, "El título es demasiado largo (máximo 160).").nullable().optional(),
  /** Descripción breve editada; null = la del catálogo. */
  description: z.string().trim().min(10, "La descripción debe tener al menos 10 caracteres.").max(1500, "La descripción es demasiado larga (máximo 1500).").nullable().optional(),
  /** Para publicar una ficha en borrador hay que confirmar expresamente que se resolvió el dato pendiente. */
  acknowledgeDraft: z.boolean().optional(),
  /** Versión que el panel tenía cargada (0 = sin cambios guardados todavía). */
  expectedVersion: z.number().int().min(0),
});
export type ProductEdit = z.input<typeof ProductEditSchema>;
type ProductEditParsed = z.output<typeof ProductEditSchema>;

export class AdminError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Values = { priceUsdMinor: number | null; stockQuantity: number | null; maxPerOrder: number | null; visible: boolean; orderOnly: boolean; title: string | null; description: string | null };
const FIELD_OF: Record<keyof Values, string> = { priceUsdMinor: "price_usd_minor", stockQuantity: "stock_quantity", maxPerOrder: "max_per_order", visible: "visible", orderOnly: "order_only", title: "title", description: "description" };

function baseValues(p: Product): Values {
  return { priceUsdMinor: p.priceUsdMinor ?? null, stockQuantity: defaultStock(p), maxPerOrder: p.maxPerOrder ?? null, visible: p.active, orderOnly: p.orderOnly ?? false, title: null, description: null };
}
function rowValues(o: OverrideRow): Values {
  return { priceUsdMinor: o.priceUsdMinor, stockQuantity: o.stockQuantity, maxPerOrder: o.maxPerOrder, visible: o.visible, orderOnly: o.orderOnly, title: o.title, description: o.description };
}

export type AdminProduct = {
  product: Product; // valores vigentes (código + panel + conversión)
  base: Values; // valores del código
  overridden: boolean;
  version: number;
  updatedAt: number | null;
  updatedByEmail: string | null;
  /** Precio fijo en ARS cargado antes de la tanda 6 (dato anterior; no rige ni se convierte). */
  legacyPriceMinor: number | null;
  /** Título y descripción propios del código (para mostrar lo que hay si se restablece). */
  codeTitle: string;
  codeDescription: string;
  gallery: { custom: boolean; version: number };
};

/** Todos los productos del catálogo base con sus valores vigentes, incluidos los ocultos. */
export async function adminProducts(db: Db, base: Product[], fx: EffectiveRate | null): Promise<AdminProduct[]> {
  const [rows, galleries] = await Promise.all([loadOverrides(db), loadGalleries(db)]);
  return base.map((p) => {
    const o = rows.get(p.id);
    const g = galleries.get(p.id);
    return {
      product: applyOverrides([p], rows, fx, galleries)[0],
      base: baseValues(p),
      overridden: Boolean(o),
      version: o?.updatedAt ?? 0,
      updatedAt: o?.updatedAt ?? null,
      updatedByEmail: o?.updatedByEmail ?? null,
      legacyPriceMinor: o?.priceMinor ?? (p.isDemo ? null : p.priceMinor),
      codeTitle: p.title,
      codeDescription: p.description,
      gallery: { custom: Boolean(parseGallery(g)), version: g?.updatedAt ?? 0 },
    };
  });
}

/**
 * Guarda los valores de un producto de forma atómica, con control de versión y un registro por dato modificado
 * (quién, cuándo, valor anterior y nuevo). Si no cambió nada, no escribe nada. El precio en ARS no se guarda: sale de la conversión.
 */
export async function saveProductChange(db: Db, base: Product[], productId: string, input: ProductEdit, actor: Actor, now = Date.now()): Promise<{ changed: string[]; version: number }> {
  const edit: ProductEditParsed = ProductEditSchema.parse(input);
  const p = base.find((x) => x.id === productId);
  if (!p) throw new AdminError(404, "not_found", "El producto no existe.");
  if (p.retired) throw new AdminError(409, "retired", "Este producto está retirado de la oferta: no se edita desde el panel.");
  return db.transaction(async (tx) => {
    await lockKey(tx, `override:${productId}`);
    const [current] = await tx.select().from(productOverrides).where(eq(productOverrides.productId, productId));
    const version = current?.updatedAt ?? 0;
    if (edit.expectedVersion !== version) {
      throw new AdminError(409, "stale", "Este producto se modificó mientras lo editabas. Recargá la página para ver los valores actuales y volvé a intentarlo.");
    }
    const before = current ? rowValues(current) : baseValues(p);
    // Un título o descripción igual al del código no se guarda como reemplazo (así el catálogo sigue mandando mientras no se edite de verdad).
    const keep = <T,>(sent: T | undefined, current: T): T => (sent === undefined ? current : sent);
    const after: Values = {
      priceUsdMinor: keep(edit.priceUsdMinor, before.priceUsdMinor),
      stockQuantity: keep(edit.stock, before.stockQuantity),
      maxPerOrder: keep(edit.maxPerOrder, before.maxPerOrder),
      visible: keep(edit.visible, before.visible),
      orderOnly: keep(edit.orderOnly, before.orderOnly),
      title: edit.title === undefined ? before.title : edit.title && edit.title !== p.title ? edit.title : null,
      description: edit.description === undefined ? before.description : edit.description && edit.description !== p.description ? edit.description : null,
    };
    if (after.orderOnly && after.stockQuantity !== null && after.stockQuantity > 0) {
      throw new AdminError(400, "invalid_input", "Un producto «solo por encargo» no puede tener stock disponible: dejá el stock en 0 o vacío, o desmarcá «por encargo».");
    }
    const changedKeys = (Object.keys(after) as Array<keyof Values>).filter((k) => before[k] !== after[k]);
    if (!changedKeys.length) return { changed: [], version };
    if (p.draftNote && after.visible && !before.visible && !edit.acknowledgeDraft) {
      throw new AdminError(409, "draft_unconfirmed", `Esta ficha está en borrador: ${p.draftNote} Para publicarla confirmá que ese dato ya está resuelto.`);
    }
    const nextVersion = Math.max(now, version + 1);
    // `price_minor` (legado en ARS) no se toca: queda como dato anterior.
    const values = { priceUsdMinor: after.priceUsdMinor, stockQuantity: after.stockQuantity, maxPerOrder: after.maxPerOrder, visible: after.visible, orderOnly: after.orderOnly, title: after.title, description: after.description, updatedAt: nextVersion, updatedByEmail: actor.email };
    await tx.insert(productOverrides).values({ productId, ...values }).onConflictDoUpdate({ target: productOverrides.productId, set: values });
    await tx.insert(productAudit).values(changedKeys.map((k) => ({
      productId, sku: p.sku, field: FIELD_OF[k], oldValue: JSON.stringify(before[k]), newValue: JSON.stringify(after[k]), userId: actor.id, userEmail: actor.email, createdAt: nextVersion,
    })));
    return { changed: changedKeys.map((k) => FIELD_OF[k]), version: nextVersion };
  });
}

/** Vuelve a los valores del código: borra la fila de reemplazo (el precio ARS anterior queda solo en el historial). */
export async function resetProduct(db: Db, base: Product[], productId: string, expectedVersion: number, actor: Actor, now = Date.now()): Promise<{ version: number }> {
  const p = base.find((x) => x.id === productId);
  if (!p) throw new AdminError(404, "not_found", "El producto no existe.");
  return db.transaction(async (tx) => {
    await lockKey(tx, `override:${productId}`);
    const [current] = await tx.select().from(productOverrides).where(eq(productOverrides.productId, productId));
    if (!current) return { version: 0 };
    if (current.updatedAt !== expectedVersion) throw new AdminError(409, "stale", "Este producto se modificó mientras lo editabas. Recargá la página y volvé a intentarlo.");
    await tx.delete(productOverrides).where(eq(productOverrides.productId, productId));
    await tx.insert(productAudit).values({ productId, sku: p.sku, field: "reset", oldValue: JSON.stringify({ ...rowValues(current), legacyPriceMinor: current.priceMinor }), newValue: JSON.stringify(baseValues(p)), userId: actor.id, userEmail: actor.email, createdAt: Math.max(now, current.updatedAt + 1) });
    return { version: 0 };
  });
}

export type AuditEntry = typeof productAudit.$inferSelect;
export async function listAudit(db: Db, opts: { productId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const q = db.select().from(productAudit);
  const rows = opts.productId ? q.where(eq(productAudit.productId, opts.productId)) : q;
  return rows.orderBy(desc(productAudit.createdAt), desc(productAudit.id)).limit(Math.min(opts.limit ?? 200, 1000));
}

export const STOCK_INIT_FLAG = "stock-inicial-cero-2026-10-14";

/**
 * Inicialización ÚNICA: deja el stock propio de todas las fichas actuales en 0 y lo registra en el historial (valor anterior → 0, con la
 * etiqueta «inicialización»). Alcanza solo a fichas no retiradas; las ocultas y los borradores quedan ocultos (no se cambia su visibilidad).
 * Cambia únicamente stock «pendiente» (null): nunca baja una cantidad positiva ni toca precios, fotos, títulos o visibilidad.
 * Queda marcada en `system_flags`: si se vuelve a ejecutar, no hace nada, así lo que el dueño cargue después no se pisa nunca.
 * El respaldo previo lo hace el script que la invoca.
 */
export async function initializeStockToZero(db: Db, base: Product[], actor: Actor, now = Date.now()): Promise<{ applied: boolean; updated: number }> {
  return db.transaction(async (tx) => {
    await lockKey(tx, `flag:${STOCK_INIT_FLAG}`);
    const [flag] = await tx.select().from(systemFlags).where(eq(systemFlags.key, STOCK_INIT_FLAG));
    if (flag) return { applied: false, updated: 0 };
    let updated = 0;
    const rows = new Map((await tx.select().from(productOverrides)).map((r) => [r.productId, r]));
    for (const p of base) {
      if (p.retired || p.isDemo) continue;
      const row = rows.get(p.id);
      const current = row ? row.stockQuantity : p.stockQuantity ?? null;
      if (current !== null) continue; // ya tiene una cantidad (0 o positiva): se respeta
      const stamp = Math.max(now, (row?.updatedAt ?? 0) + 1);
      if (row) await tx.update(productOverrides).set({ stockQuantity: 0, updatedAt: stamp, updatedByEmail: actor.email }).where(eq(productOverrides.productId, p.id));
      else {
        const v = baseValues(p);
        await tx.insert(productOverrides).values({ productId: p.id, priceUsdMinor: v.priceUsdMinor, stockQuantity: 0, maxPerOrder: v.maxPerOrder, visible: v.visible, orderOnly: v.orderOnly, title: null, description: null, updatedAt: stamp, updatedByEmail: actor.email });
      }
      await tx.insert(productAudit).values({ productId: p.id, sku: p.sku, field: "stock_quantity", oldValue: "null", newValue: "0", userId: actor.id, userEmail: `${actor.email} (inicialización)`, createdAt: stamp });
      updated++;
    }
    await tx.insert(systemFlags).values({ key: STOCK_INIT_FLAG, appliedAt: now, note: `Stock inicial en 0 para ${updated} fichas.` });
    return { applied: true, updated };
  });
}
