import type { Db } from "@/db/client";
import { ageLabel, formatRate } from "./convert";
import { currentRate } from "./service";

const when = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));

/** Texto público sobre la cotización vigente (tasa, fecha y antigüedad real de la consulta). */
export async function describeRate(db: Db, now = Date.now()): Promise<string> {
  const fx = await currentRate(db, now);
  if (fx.rate10k === null) {
    return fx.mode === "manual" ? "La tienda todavía no cargó la cotización: los precios en pesos se confirman por consulta." : "Por ahora no hay una cotización del dólar vigente, por eso no mostramos el valor en pesos. Consultá y te confirmamos el precio.";
  }
  if (fx.mode === "manual") return `Cotización fijada por la tienda: ${formatRate(fx.rate10k)} por dólar${fx.asOf ? ` (cargada el ${when(fx.asOf)})` : ""}.`;
  return `Dólar blue, valor de venta: ${formatRate(fx.rate10k)}${fx.providerUpdatedAt ? ` (publicado por el proveedor el ${when(fx.providerUpdatedAt)})` : ""}${fx.asOf ? `; última consulta ${ageLabel(now - fx.asOf)}` : ""}.${fx.warn ? " La consulta es más vieja de lo habitual: el valor puede haber cambiado." : ""}`;
}
