import { encargo } from "@/content/politicas";
import { percentOf } from "@/lib/money";

/**
 * Seña de un encargo: 20% del importe COTIZADO y CONFIRMADO de los productos que se encargan (no del carrito completo ni del envío).
 * Sin una cotización confirmada devuelve null: nunca se calcula sobre un precio inexistente.
 */
export function senaYSaldo(quotedMinor: number | null | undefined): { senaMinor: number; saldoMinor: number } | null {
  if (quotedMinor === null || quotedMinor === undefined || !Number.isInteger(quotedMinor) || quotedMinor <= 0) return null;
  const senaMinor = percentOf(quotedMinor, encargo.senaPercent);
  return { senaMinor, saldoMinor: quotedMinor - senaMinor };
}

export const ENCARGO_EXPLICACION = `Consultá por encargo los productos del catálogo. Una vez confirmadas la disponibilidad y la cotización, podés encargar abonando una seña del ${encargo.senaPercent}%. El saldo restante es del ${100 - encargo.senaPercent}%; pago y entrega se coordinan con la tienda.`;
