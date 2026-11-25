import { z } from "zod";
import { RATE_MAX, RATE_MIN, RATE_SCALE, usdToArsExactMinor } from "@/features/fx/convert";
import { SaleError } from "./errors";

export const SaleUsdRate = z.number().int().min(RATE_MIN * RATE_SCALE).max(RATE_MAX * RATE_SCALE);

export function saleAmountsInPesos<T extends { unitPriceMinor: number; quantity: number; discountMinor: number }>(lines: T[], rate?: number) {
  let subtotalUsd = 0;
  const items = lines.map((line) => {
    const lineTotal = line.unitPriceMinor * line.quantity - line.discountMinor;
    const previous = subtotalUsd;
    subtotalUsd += lineTotal;
    if (!Number.isSafeInteger(subtotalUsd)) throw new SaleError(400, "invalid_input", "El total es demasiado alto.");
    return {
      ...line,
      unitPriceMinor: rate ? usdToArsExactMinor(line.unitPriceMinor, rate) : line.unitPriceMinor,
      discountMinor: rate ? usdToArsExactMinor(line.discountMinor, rate) : line.discountMinor,
      lineTotalMinor: rate ? usdToArsExactMinor(subtotalUsd, rate) - usdToArsExactMinor(previous, rate) : lineTotal,
      unitPriceUsdMinor: rate ? line.unitPriceMinor : null,
      discountUsdMinor: rate ? line.discountMinor : null,
    };
  });
  const totalMinor = items.reduce((total, line) => total + line.lineTotalMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor > 30_000_000_000_000 || items.some((line) => !Number.isSafeInteger(line.unitPriceMinor) || !Number.isSafeInteger(line.discountMinor))) throw new SaleError(400, "invalid_input", "El importe convertido a pesos es demasiado alto.");
  return { items, totalMinor, totalUsdMinor: rate ? subtotalUsd : null };
}
