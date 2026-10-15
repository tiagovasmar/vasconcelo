import type { Product } from "@/content/schema";
import { pricePerBooster } from "@/features/catalog/per-booster";
import { formatUSD } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";

/**
 * Equivalente por sobre al comprar la caja (precio de la caja ÷ sobres por caja confirmados). Informativo: no es un precio de venta del
 * sobre ni habilita comprar sobres sueltos. Sin precio o sin cantidad de sobres verificada no se muestra nada.
 */
export function PricePerBooster({ product, className = "" }: { product: Pick<Product, "kind" | "contents" | "priceMinor" | "priceUsdMinor">; className?: string }) {
  const r = pricePerBooster(product);
  if (!r) return null;
  return (
    <div className={`border-l-4 border-gold bg-white/70 px-3 py-2 ${className}`} data-testid="precio-por-sobre">
      <p className="text-sm font-semibold sm:text-base">
        <span data-testid="precio-por-sobre-ars">{r.approxArs ? "Aprox. " : ""}{formatARS(r.arsMinor)}</span> por sobre comprando la caja
        {r.usdMinor !== null && <span className="ml-1 text-xs font-medium text-ink/65 sm:text-sm" data-testid="precio-por-sobre-usd">· {r.approxUsd ? "aprox. " : ""}{formatUSD(r.usdMinor)} por sobre</span>}
      </p>
      <p className="mt-0.5 text-xs text-ink/65">Caja de {r.boosters} sobres. Valor informativo: no incluye promociones, no cambia el precio de la caja y no permite comprar sobres sueltos de ella.</p>
    </div>
  );
}
