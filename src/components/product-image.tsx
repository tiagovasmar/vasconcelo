import { ArtSlot } from "./slot";
import { BoxArt, PackArt } from "./art";
import { kindLabel, wideKinds } from "@/content/labels";
import type { Product } from "@/content/schema";
import { hasAsset } from "./slot";
import { toneBg } from "./tones";

export { toneBg };

/**
 * Fondo del recuadro del producto: las fotos reales se muestran sobre un crema suave (`tile-soft`) con `object-contain`
 * (sin recortar el envase); la ilustración de reserva usa el tono de la expansión.
 */
export function tileBg(product: Product, index = 0): string {
  const img = product.images[index] ?? product.images[0];
  return img.status !== "demo" && hasAsset(img.src) ? "tile-soft" : toneBg[product.fallbackTone];
}

/** ¿El recuadro es oscuro? (para elegir colores de texto superpuestos). */
export const tileIsDark = (product: Product, index = 0) => tileBg(product, index) !== "tile-soft" && (product.fallbackTone === "ink" || product.fallbackTone === "violet");


/**
 * Imagen del producto: usa la foto de `product.images[index]` si el archivo existe; si no, una ilustración de reserva
 * (se reemplaza solo al agregar el archivo, sin tocar componentes).
 */
export function ProductImage({ product, index = 0, className = "", sizes = "(min-width:1024px) 300px, 45vw", priority = false, lowPriority = false, lightPhotos = false }: {
  product: Product; index?: number; className?: string; sizes?: string; priority?: boolean; lowPriority?: boolean; /** Fotos opacas (de proveedor) con calidad 60: menos bytes en la ficha. */ lightPhotos?: boolean;
}) {
  const img = product.images[index] ?? product.images[0];
  const wide = wideKinds.includes(product.kind);
  const label = kindLabel[product.kind].toUpperCase();
  const tilt = ["", "rotate-6 scale-110", "-rotate-3 scale-150 translate-y-8"][index % 3];
  const fallback = wide ? (
    <BoxArt tone={product.fallbackTone} label={label} className={`w-[84%] transition ${tilt}`} />
  ) : (
    <PackArt tone={product.fallbackTone} label={label} className={`h-[84%] w-auto transition ${tilt}`} />
  );
  return (
    <ArtSlot src={img.src} alt={img.alt} width={img.width} height={img.height} sizes={sizes} priority={priority} lowPriority={lowPriority} quality={lightPhotos && img.opaque ? 60 : undefined} reserve={{ wide, tone: product.fallbackTone, label, alt: img.alt, tilt }} className={`${className || "h-[88%] w-[88%] object-contain"} ${img.opaque ? "rounded-[3px] shadow-[0_6px_14px_rgba(11,64,50,.22)] ring-1 ring-ink/10" : "drop-shadow-[0_8px_10px_rgba(11,64,50,.28)]"}`} fallback={<div className="flex h-full w-full items-center justify-center overflow-hidden" role="img" aria-label={img.alt}>{fallback}</div>} />
  );
}
