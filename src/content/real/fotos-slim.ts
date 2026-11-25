import type { ImageAsset, Product } from "../schema";
import images from "../colecciones/imagenes-slim.json";

/** Las Slim muestran únicamente su sobre de referencia; la unidad de venta sigue siendo la caja. */
export function withSlimPackPhoto(product: Product): Product {
  const entry = images.find((image) => image.id === product.id);
  if (!entry) return product;
  const image: ImageAsset = {
    src: entry.src, width: entry.width, height: entry.height,
    alt: `Sobre de referencia de ${product.title}. Se vende la caja completa de 15 sobres.`,
    opaque: false, status: "reference", source: entry.source as ImageAsset["source"], view: "front",
    origin: entry.origin, license: entry.license,
  };
  return {
    ...product, images: [image],
    description: `${product.title} en chino simplificado. Contiene 15 sobres de 5 cartas aleatorias. La imagen muestra únicamente el sobre como referencia del diseño; el producto y el precio corresponden a la caja completa.`,
  };
}
