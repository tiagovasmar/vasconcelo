import Link from "next/link";
import { getExpansion } from "@/features/catalog/data";
import { LanguageBadge } from "./language-badge";
import type { Product } from "@/content/schema";

/**
 * Etiquetas discretas de un producto: colección (nombre y código, con enlace a su detalle) e idioma escrito.
 * Los datos salen del catálogo; el idioma nunca depende solo de una bandera.
 */
export function ProductTags({ product, size = "sm", className = "" }: { product: Product; size?: "sm" | "lg"; className?: string }) {
  const exps = product.expansionIds.map((id) => getExpansion(id)).filter((e) => e !== undefined);
  const chip = size === "lg" ? "min-h-8 px-3 text-sm" : "min-h-6 px-2 text-[.72rem] sm:text-xs";
  return (
    <div role="group" className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Etiquetas del producto" data-testid="etiquetas">
      {exps.map((e) => (
        <span key={e.id}>
          <Link href={`/expansiones/${e.slug}`} className={`inline-flex items-center rounded-full border border-gold bg-paper font-medium text-emerald underline-offset-2 hover:bg-gold/30 hover:underline ${chip}`} data-testid="etiqueta-coleccion">
            {e.name}{e.code ? ` · ${e.code}` : ""}
          </Link>
        </span>
      ))}
      <LanguageBadge language={product.language} size={size} />
    </div>
  );
}
