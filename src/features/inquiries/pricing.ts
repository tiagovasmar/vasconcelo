import type { Product } from "@/content/schema";
import { commercialState } from "@/features/catalog/commercial";
import { COMBO_OFF, priceCart, type ComboConfig, type Pricing, type PricingInput } from "@/features/promos/combo";
import type { CartItemInput } from "./schemas";

/** `encargo` = consulta por encargo: no tiene precio ni se bloquea (la cotización y la disponibilidad se confirman con la tienda). */
export type LineStatus = "retired" | "ok" | "price_changed" | "out_of_stock" | "unavailable" | "over_limit" | "pending_commercial" | "encargo";

export type EvaluatedLine = {
  productId: string;
  requestedQuantity: number;
  status: LineStatus;
  /** Cantidad máxima comprable ahora (mín. entre límite por pedido y stock); 0 si no hay o si precio/stock están pendientes. */
  maxQuantity: number;
  product?: Product;
  /** Precio vigente del catálogo (centavos). El único que cuenta. Ausente si el precio está pendiente. */
  unitPriceMinor?: number;
  previousPriceMinor?: number;
};

export type Evaluation = {
  lines: EvaluatedLine[];
  blocking: EvaluatedLine[];
  /** Subtotal de los productos disponibles (no incluye los que se encargan). */
  subtotalMinor: number;
  /** Importes del pedido, iguales para todos los medios de pago. */
  pricing: Pricing;
};

/** Tope de unidades por línea de encargo (no hay stock que limitar: la disponibilidad se consulta). */
export const ENCARGO_MAX = 99;

/** Tope técnico de unidades por línea cuando el dueño no definió un máximo por pedido. */
const DEFAULT_MAX = 99;

export const maxFor = (p: Product) =>
  p.active && commercialState(p) === "available" ? Math.max(0, Math.min(p.maxPerOrder ?? DEFAULT_MAX, p.stockQuantity ?? 0)) : 0;

/**
 * Evalúa un carrito contra el catálogo actual, en servidor. Los importes siempre salen del catálogo (centavos enteros):
 * el precio que mandó el cliente solo se usa para detectar que cambió. Un producto con precio o stock PENDIENTE de confirmar
 * nunca es comprable (estado `pending_commercial`), aunque el cliente mande un precio o una cantidad cualquiera.
 */
export function evaluateCart(items: CartItemInput[], products: Product[], combo: ComboConfig = COMBO_OFF): Evaluation {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: EvaluatedLine[] = items.map((it) => {
    const p = byId.get(it.productId);
    // Retirado de la oferta pública: ni se compra ni se encarga (aunque el carrito viejo lo traiga como encargo).
    if (p?.retired) return { productId: p.id, requestedQuantity: it.quantity, status: "retired", maxQuantity: 0, product: p };
    if (!p || !p.active) return { productId: it.productId, requestedQuantity: it.quantity, status: "unavailable", maxQuantity: 0 };
    // Encargo: no se usa ningún precio ni stock del producto; el importe y la disponibilidad se cotizan con la tienda.
    if (it.mode === "encargo") return { productId: p.id, requestedQuantity: it.quantity, status: "encargo", maxQuantity: ENCARGO_MAX, product: p };
    // Sin precio (o con cantidad desconocida) no hay importe confiable: pendiente. Con precio y sin stock: «sin stock» (más abajo).
    if (p.priceMinor === null || p.stockQuantity === null) return { productId: p.id, requestedQuantity: it.quantity, status: "pending_commercial", maxQuantity: 0, product: p };
    const price = p.priceMinor as number;
    const max = maxFor(p);
    const base = { productId: p.id, requestedQuantity: it.quantity, product: p, unitPriceMinor: price, maxQuantity: max };
    if (max === 0) return { ...base, status: "out_of_stock" };
    if (it.quantity > max) return { ...base, status: "over_limit" };
    if (it.expectedPriceMinor !== undefined && it.expectedPriceMinor !== price) {
      return { ...base, status: "price_changed", previousPriceMinor: it.expectedPriceMinor };
    }
    return { ...base, status: "ok" };
  });
  const blocking = lines.filter((l) => l.status !== "ok" && l.status !== "encargo");
  // Subtotal de productos al precio vigente del catálogo (solo es definitivo si no hay líneas bloqueantes).
  const subtotalMinor = lines.reduce((n, l) => (l.unitPriceMinor !== undefined ? n + l.unitPriceMinor * l.requestedQuantity : n), 0);
  const pricingInput: PricingInput[] = lines
    .filter((l) => l.product && l.unitPriceMinor !== undefined && (l.status === "ok" || l.status === "price_changed"))
    .map((l) => ({ productId: l.productId, kind: l.product!.kind, quantity: l.requestedQuantity, unitPriceMinor: l.unitPriceMinor! }));
  return { lines, blocking, subtotalMinor, pricing: priceCart(pricingInput, combo) };
}
