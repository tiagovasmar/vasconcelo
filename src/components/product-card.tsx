import Link from "next/link";
import { AddToCartIcon } from "./cart-widgets";
import { FavoriteButton } from "./favorite-button";
import { PaymentBenefits } from "./payment-benefits";
import { ProductTags } from "./product-tags";
import { ProductImage, tileBg, tileIsDark } from "./product-image";
import { StockBadge } from "./stock-badge";
import { commercialState } from "@/features/catalog/commercial";
import { isLowStock } from "@/features/admin/settings";
import { lowStockThreshold } from "@/features/admin/low-stock-server";
import { Price } from "./price";
import { maxFor } from "@/features/inquiries/pricing";
import { kindLabel, type Product } from "@/content/schema";

/** Llama monocromática (SVG, hereda el color del texto): nítida a cualquier tamaño y sin depender de emojis de color. */
function FlameIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="currentColor">
      <path d="M12.6 1.2c.4 3.1-1.2 4.7-2.6 6.3C8.5 9.2 7 10.9 7 13.6c0 2.9 2.1 5.4 5 5.4s5-2.3 5-5.1c0-2-.9-3.4-1.7-4.6-.5-.8-.9-1.4-1-2.3-.4.5-.8 1-.9 1.7-.7-.9-1.2-2.3-1.1-4.1 0-.9.3-1.6.3-3.4z" />
      <path d="M12 21.9c-3.6 0-6.4-2.7-6.4-6 0-.9.2-1.7.5-2.4.2 1.3 1.2 2.1 1.9 2.4.2 2.1 2 3.7 4 3.7s3.8-1.6 4-3.7c.7-.3 1.7-1.1 1.9-2.4.3.7.5 1.5.5 2.4 0 3.3-2.8 6-6.4 6z" opacity=".55" />
    </svg>
  );
}

/**
 * Tarjeta del catálogo. Compacta: sin altura mínima reservada entre título y precio (si la grilla estira la tarjeta, el sobrante queda arriba del
 * enlace final, no en el medio). El área de imagen es más baja y la imagen la aprovecha casi entera (los sobres, verticales, ganan presencia).
 * Etiqueta naranja «BAJO STOCK» (cápsula con dos llamas SVG blancas a cada lado) centrada sobre el borde superior, cuando hay entre 1 y N unidades
 * (N lo define el dueño en /admin; 0 = sin etiqueta). Con stock 0 va «Sin stock», nunca la etiqueta. Es pequeña (≈ 28 px de alto) y deja libres el formato y los favoritos.
 */
export async function ProductCard({ product: p, index, lowPriority = false }: { product: Product; index?: number; lowPriority?: boolean }) {
  const state = commercialState(p);
  const dark = tileIsDark(p);
  const low = p.active && isLowStock(p.stockQuantity, Boolean(p.orderOnly), await lowStockThreshold());
  const vertical = p.kind === "booster" || p.kind === "pack";
  const href = `/productos/${p.slug}`;
  const num = index ? String(index).padStart(2, "0") : null;
  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-ink/15 bg-white" data-testid="tarjeta">
      {low && (
        <p
          className="absolute left-1/2 top-0 z-30 flex h-6 w-max max-w-[calc(100%-0.5rem)] -translate-x-1/2 -translate-y-[32%] items-center justify-center gap-1 whitespace-nowrap rounded-full bg-[#c2500b] px-2 text-[.58rem] font-extrabold uppercase leading-none tracking-wide text-white shadow-[0_1px_3px_rgba(18,23,21,.3)] ring-1 ring-white sm:min-w-[160px] sm:gap-1.5 sm:px-3 sm:text-[.625rem] sm:tracking-wider"
          data-testid="bajo-stock"
        >
          <FlameIcon className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
          <span>Bajo stock</span>
          <FlameIcon className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
        </p>
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[11px] max-[359px]:flex-row min-[360px]:flex-col">
        <FavoriteButton productId={p.id} title={p.title} className={`absolute right-2 z-20 h-10 w-10 bg-paper/90 text-ink hover:bg-gold ${low ? "top-5" : "top-2"}`} />
        <Link href={href} tabIndex={-1} aria-hidden="true" className={`relative flex ${vertical ? "aspect-[4/3]" : "aspect-[3/2] sm:aspect-[4/3]"} items-center justify-center overflow-hidden max-[359px]:w-[44%] max-[359px]:shrink-0 ${tileBg(p)}`}>
          {num && (
            <span className="display pointer-events-none absolute -bottom-2 left-1 text-6xl leading-none opacity-[.09] sm:text-[6rem]" aria-hidden="true">
              {num}
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(255,255,255,.35),transparent_60%)]" aria-hidden="true" />
          <p className={`absolute left-2 z-10 text-[.7rem] font-bold tracking-widest sm:left-3 sm:text-[.65rem] ${low ? "top-5" : "top-2 sm:top-2.5"}`}>
            {num && <span className={dark ? "text-vermilion-bright" : "text-vermilion"}>{num} / </span>}
            {kindLabel[p.kind].toUpperCase()}
          </p>
          <div className={`img-hover flex h-full w-full items-center justify-center px-1.5 pb-1.5 ${low ? "pt-4" : "pt-1.5"}`}>
            <ProductImage product={p} lowPriority={lowPriority} className={vertical ? "h-[96%] w-[94%] object-contain" : "h-[90%] w-[92%] object-contain"} />
          </div>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
          <ProductTags product={p} className="mb-1" />
          <h3 className="text-sm font-bold leading-tight sm:text-base">
            <Link href={href} className="hover:text-emerald hover:underline">
              {p.title}
            </Link>
          </h3>
          {p.originalTitle && <p className="mt-0.5 text-[.7rem] leading-tight text-ink/60 sm:text-xs" data-testid="nombre-original"><span lang="zh-Hans">{p.originalTitle}</span></p>}
          {/* La acción va pegada al precio (si no entra al lado, baja justo debajo) y la disponibilidad queda debajo de ambos. */}
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <Price product={p} className="min-w-0" />
            <AddToCartIcon productId={p.id} title={p.title} priceMinor={p.priceMinor ?? 0} max={maxFor(p)} state={state} />
          </div>
          <StockBadge product={p} className="mt-1.5 self-start" />
          <PaymentBenefits kind={p.kind} compact />
          <Link href={href} className="mt-auto inline-block self-start whitespace-nowrap border-b border-ink pt-2 text-xs font-medium hover:text-emerald sm:text-sm">
            <span className="sm:hidden">Ver contenido</span><span className="hidden sm:inline">Ver cartas y contenido</span>&nbsp;↗
          </Link>
        </div>
      </div>
    </article>
  );
}
