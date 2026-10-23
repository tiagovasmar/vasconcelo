import { promo } from "@/content/politicas";
import type { ProductKind } from "@/content/schema";
import { percentOf } from "@/lib/money";
import { isBoxKind, qualifiesForBoxPromo } from "@/features/politicas/promociones";

/**
 * Precios de un pedido con la promoción caja + sobres y la de transferencia, en UN solo lugar (catálogo, carrito lateral, página del pedido, mensaje de
 * WhatsApp, consulta guardada y venta). El servidor lo calcula siempre; el navegador solo muestra lo que recibe.
 *
 * Reglas (acordadas 22/10/2026):
 *  - Cada caja PARTICIPANTE del pedido habilita 10% de descuento en hasta 5 sobres PARTICIPANTES. Dos cajas → hasta 10 sobres, y así sucesivamente.
 *  - Si hay más sobres que cupos, el descuento va primero a los de mayor precio unitario; a igual precio, por id de producto (regla estable, sin azar ni orden de carga).
 *  - No se acumula con el 10% por transferencia sobre una misma unidad: para cada unidad rige el beneficio MÁS FAVORABLE (a igual valor, el de transferencia, que ya
 *    existía), nunca los dos. Los accesorios no reciben el 10% por transferencia ni habilitan ni reciben el combo.
 *  - Criterio monetario único: el descuento se calcula POR UNIDAD, redondeado al peso (`percentOf`), y las líneas y los totales son la suma de esos importes.
 *    Así el subtotal, la suma de las líneas y el total nunca difieren por redondeos.
 *  - Todo parte de líneas YA validadas (con precio y stock): un producto sin precio, sin stock, retirado o por encargo no participa.
 */
export const COMBO = {
  /** Porcentaje de descuento sobre cada sobre cubierto. */
  percent: 10,
  /** Sobres que habilita cada caja participante. */
  boostersPerBox: 5,
} as const;

export const COMBO_HEADLINE = `Sumá hasta ${COMBO.boostersPerBox} sobres con ${COMBO.percent}% OFF por cada caja`;

/** Configuración del combo (la define el dueño en /admin). Apagada y sin productos mientras no la configure. */
export type ComboConfig = { enabled: boolean; boxIds: string[]; boosterIds: string[] };
export const COMBO_OFF: ComboConfig = { enabled: false, boxIds: [], boosterIds: [] };

export type PricingInput = { productId: string; kind: ProductKind; quantity: number; unitPriceMinor: number };

export type PricedLine = {
  productId: string;
  quantity: number;
  /** Precio de lista unitario (centavos). */
  listUnitMinor: number;
  listTotalMinor: number;
  /** Unidades de la línea que ocuparon un cupo del combo (reciban o no el descuento del combo: con transferencia manda el de transferencia). */
  comboUnits: number;
  comboDiscountMinor: number;
  transferDiscountMinor: number;
  /** Total de la línea a pagar: lista − descuentos. */
  finalTotalMinor: number;
};

export type Pricing = {
  lines: PricedLine[];
  /** Suma de los precios de lista (antes de descuentos). */
  subtotalMinor: number;
  comboDiscountMinor: number;
  transferDiscountMinor: number;
  totalMinor: number;
  /** ¿El pedido califica para cuotas / 10% por transferencia? (al menos una caja). */
  qualifies: boolean;
  combo: { enabled: boolean; boxes: number; slots: number; usedSlots: number; freeSlots: number };
};

const isPartBox = (l: PricingInput, cfg: ComboConfig) => l.kind === "box" && isBoxKind(l.kind) && cfg.boxIds.includes(l.productId);
const isPartBooster = (l: PricingInput, cfg: ComboConfig) => l.kind === "booster" && cfg.boosterIds.includes(l.productId);

/** Orden estable para repartir cupos: mayor precio unitario primero; a igual precio, por id de producto. */
const byPriceThenId = (a: PricingInput, b: PricingInput) => b.unitPriceMinor - a.unitPriceMinor || a.productId.localeCompare(b.productId);

export function priceCart(input: PricingInput[], paymentId: string, cfg: ComboConfig): Pricing {
  const qualifies = qualifiesForBoxPromo(input);
  const boxes = cfg.enabled ? input.reduce((n, l) => (isPartBox(l, cfg) ? n + l.quantity : n), 0) : 0;
  const slots = boxes * COMBO.boostersPerBox;

  // Reparto de cupos entre las líneas de sobres participantes (mayor precio primero).
  const coveredBy = new Map<string, number>();
  let left = slots;
  if (cfg.enabled && slots > 0) {
    for (const l of input.filter((x) => isPartBooster(x, cfg)).sort(byPriceThenId)) {
      const c = Math.min(l.quantity, left);
      if (c > 0) coveredBy.set(l.productId, (coveredBy.get(l.productId) ?? 0) + c);
      left -= c;
    }
  }
  const usedSlots = slots - left;

  const transferOn = paymentId === "transferencia" && qualifies;
  const lines = input.map((l): PricedLine => {
    const covered = Math.min(l.quantity, coveredBy.get(l.productId) ?? 0);
    const accessory = l.kind === "accessory";
    // ¿La transferencia alcanza a este producto? (los accesorios no tienen promociones de pago; con `boxes-only` solo las cajas).
    const transferHere = transferOn && !accessory && !(promo.discountScope === "boxes-only" && !isBoxKind(l.kind));
    const transferUnit = transferHere ? percentOf(l.unitPriceMinor, promo.transferDiscountPercent) : 0;
    const comboUnit = covered > 0 ? percentOf(l.unitPriceMinor, COMBO.percent) : 0;
    let transfer = 0;
    let combo = 0;
    // Unidades cubiertas por el combo: rige el más favorable (a igual valor, transferencia). Resto: solo transferencia.
    if (covered > 0) {
      if (transferUnit >= comboUnit) transfer += transferUnit * covered;
      else combo += comboUnit * covered;
    }
    transfer += transferUnit * (l.quantity - covered);
    const list = l.unitPriceMinor * l.quantity;
    return { productId: l.productId, quantity: l.quantity, listUnitMinor: l.unitPriceMinor, listTotalMinor: list, comboUnits: covered, comboDiscountMinor: combo, transferDiscountMinor: transfer, finalTotalMinor: list - combo - transfer };
  });

  const sum = (pick: (l: PricedLine) => number) => lines.reduce((n, l) => n + pick(l), 0);
  return {
    lines,
    subtotalMinor: sum((l) => l.listTotalMinor),
    comboDiscountMinor: sum((l) => l.comboDiscountMinor),
    transferDiscountMinor: sum((l) => l.transferDiscountMinor),
    totalMinor: sum((l) => l.finalTotalMinor),
    qualifies,
    combo: { enabled: cfg.enabled, boxes, slots, usedSlots, freeSlots: left },
  };
}

/** Tipo de descuento de una línea: combo, transferencia, mixto (las dos en unidades distintas) o ninguno. */
export const discountKindOf = (l: Pick<PricedLine, "comboDiscountMinor" | "transferDiscountMinor">): "combo" | "transferencia" | "mixto" | null =>
  l.comboDiscountMinor > 0 && l.transferDiscountMinor > 0 ? "mixto" : l.comboDiscountMinor > 0 ? "combo" : l.transferDiscountMinor > 0 ? "transferencia" : null;

/** Los dos escenarios que necesita una pantalla de pedido: sin descuento de pago (efectivo, cuotas, sin elegir) y con transferencia. */
export function pricingScenarios(input: PricingInput[], cfg: ComboConfig): { base: Pricing; transferencia: Pricing } {
  return { base: priceCart(input, "efectivo", cfg), transferencia: priceCart(input, "transferencia", cfg) };
}
