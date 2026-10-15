import { mayorista } from "@/content/politicas";
import { percentOff } from "@/lib/money";

export type WholesaleStatus = "pendiente" | "aprobada" | "rechazada";

/** Precio mayorista = precio minorista de catálogo − 30%, redondeado al peso (mismo criterio que los demás importes). */
export const wholesalePriceMinor = (retailMinor: number): number => percentOff(retailMinor, mayorista.discountPercent);

/**
 * Precio mayorista aplicable a un usuario. NULL (= rige el minorista) siempre que: no haya precio minorista, la activación no esté
 * habilitada por configuración o la solicitud no esté aprobada. Debe llamarse SOLO en el servidor con el estado leído de la base:
 * el navegador no decide ni el rol ni el porcentaje.
 */
export function wholesalePriceFor(status: WholesaleStatus | null, retailMinor: number | null): number | null {
  if (retailMinor === null || !mayorista.activationEnabled || status !== "aprobada") return null;
  return wholesalePriceMinor(retailMinor);
}
