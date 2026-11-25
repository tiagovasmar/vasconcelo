import type { Product } from "../schema";
import records from "../colecciones/origen/china-noviembre.json";
import images from "../colecciones/imagenes-china-noviembre.json";

/** Presentaciones concretas elegidas en las capturas del dueño del 24/11/2026. */
export const products: Product[] = records.map((item) => {
  const image = images.find((entry) => entry.id === item.id);
  if (!image) throw new Error(`Falta la referencia de ${item.id}`);
  const isPackPhoto = image.view === "front";
  return {
    id: item.id, slug: item.id, sku: item.sku, title: item.title,
    originalTitle: item.original, aliases: item.aliases,
    kind: item.packs ? "box" : "special-box", language: "zh", region: "CN",
    expansionIds: item.expansion ? [item.expansion] : [],
    currency: "ARS", priceBase: "usd", priceUsdMinor: item.retail * 100,
    priceMinor: null, stockQuantity: 0, orderOnly: true, active: true,
    isDemo: false, createdAt: "2026-11-24", fallbackTone: "paper",
    images: [{ src: image.src, width: image.width, height: image.height,
      alt: isPackPhoto ? `Sobre de ${item.title}; referencia del diseño, se vende la caja completa` : item.title,
      status: "reference", source: "supplier", opaque: false,
      view: image.view as "front" | "closed" | "display-open",
      origin: image.origin, license: image.license }],
    description: `${item.description}${isPackPhoto ? " La foto muestra el diseño del sobre; el precio corresponde a la caja completa." : ""}`,
    contents: item.packs ? [
      { label: "Sobres por caja", quantity: item.packs, unit: "sobres", note: "Según la variante seleccionada del proveedor." },
      { label: "Cartas por sobre", quantity: item.cards, unit: "cartas", note: "Contenido aleatorio." },
    ] : [{ label: "Presentación", note: "Caja de exhibición temática. Contenido según la presentación del proveedor; no se garantiza ninguna carta aleatoria." }],
    guaranteeIds: item.id === "zh-baoshibao-vol6-caja" ? ["g-zh-baoshibao-vol6-caja-contenido"] : [],
  };
});
