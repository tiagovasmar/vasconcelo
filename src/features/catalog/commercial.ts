import type { Product } from "@/content/schema";
import { formatARS } from "@/lib/format";

/**
 * Estado comercial de un producto. «Sin stock» (cantidad 0) es un estado propio y manda sobre un precio pendiente: el precio
 * pendiente se muestra aparte («Precio a confirmar»). PENDIENTE queda para lo que el dueño marcó como cantidad desconocida (`null`) o
 * para un producto con stock sin precio. Un producto no disponible NO se puede agregar al carrito, pero sí consultar por encargo.
 */
export type CommercialState = "pending" | "soldout" | "available";

export function commercialState(p: Pick<Product, "priceMinor" | "stockQuantity"> & { orderOnly?: boolean }): CommercialState {
  // «Solo por encargo»: no se vende de stock; se comporta como no disponible para comprar (se consulta y se cotiza con la tienda).
  if (p.orderOnly) return "soldout";
  if (p.stockQuantity === 0) return "soldout";
  if (p.priceMinor === null || p.stockQuantity === null) return "pending";
  return p.stockQuantity > 0 ? "available" : "soldout";
}

/**
 * «En stock»: stock propio confirmado (cantidad positiva cargada en el panel) en un producto publicado y no «solo por encargo».
 * Es independiente del precio: una unidad en stock con precio pendiente figura como disponible, pero no se puede comprar con un importe
 * inventado (`isPurchasable` exige además precio). Stock desconocido (null), cero, retirado, oculto o por encargo quedan fuera.
 */
export const isInStock = (p: Pick<Product, "active" | "stockQuantity"> & { orderOnly?: boolean; retired?: unknown }) =>
  p.active && !p.retired && !p.orderOnly && p.stockQuantity !== null && p.stockQuantity > 0;

/** ¿Se puede agregar a una consulta con importe? Requiere activo, precio ARS y stock válidos. */
export const isPurchasable = (p: Product) => p.active && commercialState(p) === "available";

export const PRICE_PENDING = "Precio a confirmar";
export const priceLabel = (p: Pick<Product, "priceMinor">) => (p.priceMinor === null ? PRICE_PENDING : formatARS(p.priceMinor));

export function availabilityLabel(p: Pick<Product, "stockQuantity"> & { orderOnly?: boolean }): { text: string; tone: "ok" | "bad" | "pending" | "order" } {
  if (p.orderOnly) return { text: "Disponible por encargo", tone: "order" };
  if (p.stockQuantity === null) return { text: "Disponibilidad a confirmar", tone: "pending" };
  return p.stockQuantity > 0 ? { text: "Disponible", tone: "ok" } : { text: "Sin stock", tone: "bad" };
}

/**
 * Stock inicial de un producto del catálogo real que todavía no tiene valores propios en el panel: 0 («Sin stock»). Los productos de
 * demostración conservan el suyo (o pendiente). Una cantidad cargada en /admin (incluida «desconocida») siempre manda sobre este valor.
 */
export const defaultStock = (p: Pick<Product, "stockQuantity" | "isDemo">): number | null => p.stockQuantity ?? (p.isDemo ? null : 0);
