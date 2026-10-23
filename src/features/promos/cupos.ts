import { COMBO } from "./combo";

/**
 * Cupos del combo caja + sobres que muestra la ficha (ayuda para no pedir de más; el reparto real del descuento lo calcula el servidor con `priceCart`).
 * Cada caja participante del carrito, MÁS las cajas que se están por agregar, habilita `perBox` sobres; se descuentan los sobres participantes que ya están
 * en el carrito y los que ya se eligieron en la ficha.
 *
 * `boxesToAdd` es lo que REALMENTE se puede sumar ahora (0 si la caja ya está en su máximo): nunca la cantidad que muestra el selector, que no baja de 1.
 */
export function comboSlots(input: {
  perBox?: number;
  participatingBoxIds: string[];
  participatingBoosterIds: string[];
  /** Cantidad por producto en el carrito (solo líneas de compra). */
  qtyInCart: (productId: string) => number;
  boxesToAdd: number;
  /** Sobres participantes elegidos en la ficha (todavía sin agregar). */
  pickedBoosters: number;
}) {
  const perBox = input.perBox ?? COMBO.boostersPerBox;
  const boxesInCart = input.participatingBoxIds.reduce((n, id) => n + input.qtyInCart(id), 0);
  const slots = perBox * (boxesInCart + Math.max(0, input.boxesToAdd));
  const inCartBoosters = input.participatingBoosterIds.reduce((n, id) => n + input.qtyInCart(id), 0);
  const free = Math.max(0, slots - inCartBoosters - input.pickedBoosters);
  return { slots, inCartBoosters, free };
}

/** Cantidad de la caja que de verdad se puede sumar con el botón: lo que queda hasta su máximo, y como mucho lo elegido en el selector. */
export const boxesAddable = (chosen: number, room: number) => (room > 0 ? Math.min(Math.max(1, chosen), room) : 0);
