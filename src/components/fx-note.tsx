import { getDb } from "@/db/client";
import { rateOncePerRequest } from "@/features/fx/request";
import { describeRate } from "@/features/fx/describe";

/** Explica brevemente la conversión y deja la cotización y su fecha a un toque (sin ocupar la tarjeta). Solo servidor. */
export async function FxNote({ className = "" }: { className?: string }) {
  const detail = await describeRate(getDb(), undefined, await rateOncePerRequest());
  return (
    <details className={`text-xs text-ink/70 ${className}`} data-testid="fx-note">
      <summary className="cursor-pointer select-none underline-offset-2 hover:underline">Precios en pesos según el dólar blue (venta)</summary>
      <p className="mt-1 max-w-xl">Convertimos el precio en USD con el dólar blue (valor de venta) y lo redondeamos a múltiplos de $100. {detail} La fuente es un servicio de terceros, no una cotización oficial del BCRA. El precio de una consulta ya preparada no cambia.</p>
    </details>
  );
}
