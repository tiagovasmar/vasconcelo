import { promo } from "@/content/politicas";
import type { ProductKind } from "@/content/schema";
import { percentOf } from "@/lib/money";

/**
 * Elegibilidad de las promociones minoristas, en UN solo lugar (inicio, tarjetas, ficha, carrito y servidor).
 * El pedido completo califica si incluye al menos `promo.minBoxes` cajas (unidades de formato «caja»).
 * Se evalúa con lo que se COMPRA (líneas disponibles con precio): un producto por encargo no cuenta ni recibe el beneficio.
 */
export type PromoLine = { kind: ProductKind; quantity: number; unitPriceMinor: number };

export const isBoxKind = (kind: ProductKind): boolean => promo.boxKinds.includes(kind);

export function boxCount(lines: Array<Pick<PromoLine, "kind" | "quantity">>): number {
  return lines.reduce((n, l) => (isBoxKind(l.kind) ? n + l.quantity : n), 0);
}

export const qualifiesForBoxPromo = (lines: Array<Pick<PromoLine, "kind" | "quantity">>): boolean => boxCount(lines) >= promo.minBoxes;

/** Medios de pago que dependen de la promoción (cuotas y transferencia con descuento). */
export const promoPaymentIds = ["tarjeta-3-cuotas", "transferencia"] as const;
export const isPromoPayment = (id: string): boolean => (promoPaymentIds as readonly string[]).includes(id);

/** ¿Se puede elegir este medio de pago para el pedido? (Los de promoción exigen que el pedido califique.) */
export const paymentAllowed = (paymentId: string, qualifies: boolean): boolean => !isPromoPayment(paymentId) || qualifies;

/**
 * 10% OFF por transferencia sobre el subtotal de productos (o solo las cajas, según `promo.discountScope`). 0 si el pedido no califica
 * o el medio no es transferencia. Cuotas y descuento no se acumulan: lo decide el medio de pago elegido.
 */
export function transferDiscountMinor(lines: PromoLine[], paymentId: string): number {
  if (paymentId !== "transferencia" || !qualifiesForBoxPromo(lines)) return 0;
  const base = lines.reduce((n, l) => (promo.discountScope === "boxes-only" && !isBoxKind(l.kind) ? n : n + l.unitPriceMinor * l.quantity), 0);
  return percentOf(base, promo.transferDiscountPercent);
}

/** Textos cortos únicos de la condición (inicio, tarjetas, ficha y carrito). */
export const PROMO_HEADLINE = `${promo.installments} cuotas sin interés o ${promo.transferDiscountPercent}% OFF por transferencia`;
export const PROMO_CONDITION = "compras que incluyan al menos una caja";
