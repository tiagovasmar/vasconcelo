import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { mediaAssets, productAudit, productGalleries } from "@/db/schema";
import type { ImageAsset, Product } from "@/content/schema";
import { AdminError, parseGallery, type Actor } from "./overrides";

/**
 * Galería de un producto elegida desde /admin: lista ORDENADA (la primera es la portada), con texto alternativo editable.
 * Reemplaza a la del catálogo por código (que no se modifica) y se guarda aparte, con su propia versión y registro de cambios.
 * Solo se aceptan imágenes que el servidor conoce: las de la galería por código de ESTE producto, las de cualquier otra ficha del
 * catálogo (biblioteca) y las subidas desde el panel y registradas en `media_assets`. Nunca una URL ni una ruta arbitraria.
 */
export const MAX_GALLERY = 12;
const sources = ["store", "supplier", "manufacturer"] as const;
const views = ["front", "back", "left", "right", "top", "bottom", "detail", "contents", "closed", "display-open"] as const;

export const GalleryEditSchema = z.object({
  items: z.array(z.object({
    src: z.string().max(300),
    alt: z.string().trim().min(3, "Cada foto necesita un texto alternativo (al menos 3 caracteres).").max(250, "El texto alternativo es demasiado largo (máximo 250)."),
    /** Quién sacó la foto. Solo se usa para imágenes subidas desde el panel; el resto conserva el origen que ya tiene registrado. */
    source: z.enum(sources).optional(),
    view: z.enum(views).optional(),
  })).min(1, "El producto necesita al menos una foto.").max(MAX_GALLERY, `Una ficha admite hasta ${MAX_GALLERY} fotos.`),
  expectedVersion: z.number().int().min(0),
});
export type GalleryEdit = z.input<typeof GalleryEditSchema>;

/** Biblioteca: todas las imágenes del catálogo por código y las subidas, sin repetir. */
export type LibraryImage = { src: string; alt: string; width: number; height: number; from: string };
export async function libraryImages(db: Db, catalogProducts: Product[]): Promise<LibraryImage[]> {
  const seen = new Map<string, LibraryImage>();
  for (const p of catalogProducts) for (const im of p.images) if (!seen.has(im.src)) seen.set(im.src, { src: im.src, alt: im.alt, width: im.width, height: im.height, from: p.title });
  for (const m of await db.select().from(mediaAssets)) {
    const src = `/images/uploads/${m.id}`;
    if (!seen.has(src)) seen.set(src, { src, alt: "", width: m.width, height: m.height, from: "Subida desde el panel" });
  }
  return [...seen.values()];
}

/** Lo mínimo que se necesita para leer: sirve tanto la conexión como una transacción. */
type Reader = Pick<Db, "select">;

async function findKnown(db: Reader, catalogProducts: Product[], product: Product, src: string): Promise<ImageAsset | { upload: typeof mediaAssets.$inferSelect } | null> {
  const own = product.images.find((i) => i.src === src);
  if (own) return own;
  for (const p of catalogProducts) {
    const hit = p.images.find((i) => i.src === src);
    if (hit) return hit;
  }
  if (src.startsWith("/images/uploads/")) {
    const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, src.slice("/images/uploads/".length)));
    if (row) return { upload: row };
  }
  return null;
}

/** Valida y completa los metadatos de cada foto desde fuentes confiables del servidor (no del cliente). */
export async function resolveGallery(db: Reader, catalogProducts: Product[], product: Product, items: z.output<typeof GalleryEditSchema>["items"], actor: Actor): Promise<ImageAsset[]> {
  const seen = new Set<string>();
  const out: ImageAsset[] = [];
  for (const it of items) {
    if (seen.has(it.src)) throw new AdminError(400, "invalid_input", "Hay una foto repetida en la galería.");
    seen.add(it.src);
    const known = await findKnown(db, catalogProducts, product, it.src);
    if (!known) throw new AdminError(400, "unknown_image", "Una de las fotos no existe en la biblioteca. Subila de nuevo desde el panel.");
    if ("upload" in known) {
      const u = known.upload;
      const source = it.source ?? "store";
      out.push({
        src: it.src, alt: it.alt, width: u.width, height: u.height,
        status: source === "store" ? "final" : "reference", opaque: !u.hasAlpha, source,
        origin: `Subida desde el panel por ${u.uploadedByEmail} (${new Date(u.createdAt).toISOString().slice(0, 10)}); archivo ${u.id}`,
        license: source === "store" ? "Foto propia de la tienda subida por el dueño desde el panel." : "Referencia subida desde el panel: el dueño es responsable de contar con permiso para usarla.",
        ...(it.view ? { view: it.view } : {}),
      } satisfies ImageAsset);
      continue;
    }
    // Imagen ya registrada en el catálogo: conserva su origen, licencia y estado; solo se ajusta el texto alternativo (y la vista si se indicó).
    void actor;
    out.push({ ...known, alt: it.alt, ...(it.view ? { view: it.view } : {}) });
  }
  return out;
}

export async function saveGallery(db: Db, catalogProducts: Product[], productId: string, input: GalleryEdit, actor: Actor, now = Date.now()): Promise<{ version: number }> {
  const edit = GalleryEditSchema.parse(input);
  const product = catalogProducts.find((p) => p.id === productId);
  if (!product) throw new AdminError(404, "not_found", "El producto no existe.");
  if (product.retired) throw new AdminError(409, "retired", "Este producto está retirado de la oferta: no se edita desde el panel.");
  return db.transaction(async (tx) => {
    await lockKey(tx, `gallery:${productId}`);
    const [current] = await tx.select().from(productGalleries).where(eq(productGalleries.productId, productId));
    const version = current?.updatedAt ?? 0;
    if (edit.expectedVersion !== version) throw new AdminError(409, "stale", "Las fotos de este producto se modificaron mientras editabas. Recargá la página y volvé a intentarlo.");
    const resolved = await resolveGallery(tx, catalogProducts, product, edit.items, actor);
    const before = (parseGallery(current) ?? product.images).map((i) => ({ src: i.src, alt: i.alt }));
    const after = resolved.map((i) => ({ src: i.src, alt: i.alt }));
    if (JSON.stringify(before) === JSON.stringify(after)) return { version };
    const next = Math.max(now, version + 1);
    const values = { itemsJson: JSON.stringify(resolved), updatedAt: next, updatedByEmail: actor.email };
    await tx.insert(productGalleries).values({ productId, ...values }).onConflictDoUpdate({ target: productGalleries.productId, set: values });
    await tx.insert(productAudit).values({ productId, sku: product.sku, field: "gallery", oldValue: JSON.stringify(before), newValue: JSON.stringify(after), userId: actor.id, userEmail: actor.email, createdAt: next });
    return { version: next };
  });
}

/** Vuelve a la galería del catálogo por código. */
export async function resetGallery(db: Db, catalogProducts: Product[], productId: string, expectedVersion: number, actor: Actor, now = Date.now()): Promise<{ version: number }> {
  const product = catalogProducts.find((p) => p.id === productId);
  if (!product) throw new AdminError(404, "not_found", "El producto no existe.");
  return db.transaction(async (tx) => {
    await lockKey(tx, `gallery:${productId}`);
    const [current] = await tx.select().from(productGalleries).where(eq(productGalleries.productId, productId));
    if (!current) return { version: 0 };
    if (current.updatedAt !== expectedVersion) throw new AdminError(409, "stale", "Las fotos se modificaron mientras editabas. Recargá la página y volvé a intentarlo.");
    const before = (parseGallery(current) ?? []).map((i) => ({ src: i.src, alt: i.alt }));
    await tx.delete(productGalleries).where(eq(productGalleries.productId, productId));
    await tx.insert(productAudit).values({ productId, sku: product.sku, field: "gallery_reset", oldValue: JSON.stringify(before), newValue: JSON.stringify(product.images.map((i) => ({ src: i.src, alt: i.alt }))), userId: actor.id, userEmail: actor.email, createdAt: Math.max(now, current.updatedAt + 1) });
    return { version: 0 };
  });
}
