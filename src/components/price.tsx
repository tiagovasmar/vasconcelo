import { PRICE_PENDING } from "@/features/catalog/commercial";
import { formatUSD } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";
import type { Product } from "@/content/schema";

/**
 * Precio público: pesos como precio principal y, debajo, el valor base en USD en tamaño menor. El precio en pesos ya viene convertido
 * por el servidor (dólar blue venta, múltiplos de $100); acá solo se muestra. Pendiente nunca se ve como $0.
 */
export function Price({ product, size = "card", className = "" }: { product: Pick<Product, "priceMinor" | "priceUsdMinor">; size?: "card" | "page"; className?: string }) {
  const ars = product.priceMinor;
  const usd = product.priceUsdMinor ?? null;
  const big = ars === null ? (size === "page" ? "text-2xl sm:text-4xl" : "text-base leading-tight sm:text-xl") : size === "page" ? "text-3xl sm:text-5xl" : "text-lg sm:text-2xl";
  return (
    <div className={className}>
      <p className={`font-extrabold ${big}`} data-testid="precio">{ars === null ? PRICE_PENDING : formatARS(ars)}</p>
      {usd !== null && (
        <p className={`font-semibold text-ink/65 ${size === "page" ? "mt-0.5 text-sm" : "text-[.7rem] sm:text-xs"}`} data-testid="precio-usd">
          {formatUSD(usd)}{ars === null ? " · valor en pesos no disponible por ahora" : size === "card" ? <span className="max-sm:hidden"> · dólar blue venta</span> : " · dólar blue venta"}
        </p>
      )}
    </div>
  );
}
