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
    <details className={`text-xs leading-relaxed text-ink/75 ${className}`} data-testid="precio-por-sobre">
      <summary className="w-fit cursor-pointer py-1 marker:text-ink/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="font-semibold" data-testid="precio-por-sobre-ars">{r.approxArs ? "Aprox. " : ""}{formatARS(r.arsMinor)}</span> por sobre comprando la caja
        {r.usdMinor !== null && <span className="inline-block" data-testid="precio-por-sobre-usd"> · {r.approxUsd ? "aprox. " : ""}{formatUSD(r.usdMinor)} por sobre</span>}
      </summary>
      <p className="pb-1 pl-3">Precio de la caja dividido por sus {r.boosters} sobres, antes de promociones. Los sobres adicionales tienen su propio precio.</p>
    </details>
  );
}
