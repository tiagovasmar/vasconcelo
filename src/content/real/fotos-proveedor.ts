import type { ImageAsset, Product } from "../schema";
import photos from "./fotos-proveedor-noviembre.json";

/** Fotos aportadas por el dueño para las galerías secundarias, 05/11/2026. */
export function withSupplierPhotos(product: Product): Product {
  const extra = photos[product.id as keyof typeof photos];
  if (!extra) return product;
  const images: ImageAsset[] = extra.map((photo) => ({
    ...photo,
    view: photo.view as ImageAsset["view"],
    alt: `${product.title}, foto adicional de referencia del proveedor (${photo.view === "back" ? "dorso" : photo.view === "detail" ? "detalle del envase" : "frente"})`,
    opaque: true,
    status: "reference",
    source: "supplier",
    origin: "Fotografía aportada por el dueño en el archivo WhatsApp del 5 de noviembre de 2026.",
    license: "Imagen aportada por el dueño para la galería de referencia del producto.",
  }));
  return { ...product, images: [...product.images, ...images] };
}
