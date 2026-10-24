import "server-only";
import { cache } from "react";
import { pageDataOncePerRequest } from "@/features/catalog/page-data";
import { lowStockOf } from "./settings";

/** Umbral del aviso de «Bajo stock» configurado en /admin, leído una sola vez por pedido (las tarjetas lo consultan todas). 0 = desactivado. */
export const lowStockThreshold = cache(async (): Promise<number> => {
  try {
    return lowStockOf((await pageDataOncePerRequest()).lowStockRow).threshold;
  } catch {
    return 0; // si la base no responde, se omite el cartel (nunca se rompe la tarjeta)
  }
});
