import { availabilityLabel } from "@/features/catalog/commercial";
import type { Product } from "@/content/schema";

/**
 * Etiqueta de disponibilidad cerca del precio (tarjetas y fichas). Usa la regla única de `availabilityLabel`.
 * No depende solo del color: el texto va en negrita y cada estado tiene su forma (relleno verde oscuro con ✓ / recuadro punteado con ✕ / recuadro
 * simple). El símbolo se dibuja con CSS (`before:`), así no forma parte del texto leído por los lectores de pantalla ni de las búsquedas.
 */
const estilos = {
  ok: "bg-emerald text-white before:content-['✓']",
  bad: "border-2 border-dashed border-vermilion bg-white text-vermilion before:content-['✕']",
  order: "border-2 border-ink bg-paper text-ink before:content-['◆']",
  pending: "border-2 border-ink/50 bg-white text-ink/80 before:content-['…']",
} as const;

export function StockBadge({ product, size = "card", className = "" }: { product: Pick<Product, "stockQuantity"> & { orderOnly?: boolean }; size?: "card" | "page"; className?: string }) {
  const a = availabilityLabel(product);
  const dim = size === "page" ? "px-3 py-1 text-sm sm:text-base" : "px-2 py-0.5 text-xs sm:text-sm";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-bold leading-tight before:text-[.9em] before:font-extrabold ${estilos[a.tone]} ${dim} ${className}`} data-testid="disponibilidad">
      {a.text}
    </span>
  );
}
