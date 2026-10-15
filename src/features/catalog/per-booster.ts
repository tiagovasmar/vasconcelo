import type { Product } from "@/content/schema";
import { PRICE_STEP_PESOS } from "@/features/fx/convert";

/**
 * Precio equivalente por sobre al comprar una CAJA: precio vigente de la caja ÷ cantidad confirmada de sobres por caja (no cartas).
 * Es solo informativo: no cambia el precio de la caja ni el del sobre individual (que puede ser otro) ni habilita comprar sobres sueltos.
 * Parte del precio principal ya convertido (dólar blue venta, múltiplos de $100) y del USD base de la caja; no consulta otra cotización ni
 * aplica el 10% de transferencia ni las cuotas. No se calcula si falta el precio o si la cantidad de sobres no está confirmada.
 */
export type PerBooster = {
  boosters: number;
  /** Centavos de peso por sobre, redondeados a múltiplos de $100 (mitades hacia arriba). */
  arsMinor: number;
  /** Centavos de dólar por sobre (redondeo al centavo), si la caja tiene precio USD. */
  usdMinor: number | null;
  /** true si el valor mostrado en pesos (o en dólares) no es el cociente exacto. */
  approxArs: boolean;
  approxUsd: boolean;
};

/** Cantidad de sobres por caja confirmada en el contenido de la ficha («Sobres por caja», en sobres); null si no hay un dato verificado. */
export function confirmedBoosters(p: Pick<Product, "kind" | "contents">): number | null {
  if (p.kind !== "box") return null; // kits, bundles, cajas especiales, cartas promocionales y sobres no se dividen
  const item = p.contents.find((c) => c.label === "Sobres por caja" && c.unit === "sobres");
  return item?.quantity && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : null;
}

export function pricePerBooster(p: Pick<Product, "kind" | "contents" | "priceMinor" | "priceUsdMinor">): PerBooster | null {
  const n = confirmedBoosters(p);
  if (n === null || p.priceMinor === null || p.priceMinor <= 0) return null;
  const step = PRICE_STEP_PESOS * 100; // centavos de un múltiplo de $100
  const exact = p.priceMinor / n;
  const rounded = Math.floor(exact / step + 0.5) * step;
  // Con precios muy bajos el redondeo podría dar 0: en ese caso se muestra el cociente al peso, nunca $0.
  const arsMinor = rounded > 0 ? rounded : Math.max(100, Math.round(exact / 100) * 100);
  const usd = p.priceUsdMinor ?? null;
  const usdMinor = usd !== null && usd > 0 ? Math.max(1, Math.round(usd / n)) : null;
  return { boosters: n, arsMinor, usdMinor, approxArs: p.priceMinor % n !== 0 || arsMinor !== exact, approxUsd: usd !== null && usdMinor !== null && usd % n !== 0 };
}
