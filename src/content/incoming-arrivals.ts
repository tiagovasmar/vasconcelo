/** Ventana estimada informada por el dueño para la compra de noviembre de 2026. */
const novemberProducts = new Set(["inferno-x-caja", "mega-dream-ex-caja", "storm-caja", "zh-30-zhounian-caja", "zh-151-jing-slim-caja", "zh-151-wang-slim-caja"]);

export function arrivalEstimate(productId: string, now = Date.now()): string | null {
  return novemberProducts.has(productId) && now <= Date.parse("2026-11-17T00:00:00-03:00")
    ? "Llegada estimada del 11 al 16 de noviembre de 2026"
    : null;
}
