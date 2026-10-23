import type { ImageAsset, Product } from "../schema";

/**
 * Accesorios (22/10/2026): dos packs de protectores para cartas. Reglas:
 *  - Precio FIJO en pesos (`priceBase: "ars"`): no depende del dólar ni de la cotización y no tiene precio en USD. El dueño lo puede cambiar desde /admin.
 *  - Se venden y se cuentan en PACKS de 5 unidades: comprar una unidad del producto = comprar un pack de 5 y descontar un pack del stock.
 *  - Stock inicial 0 (no se asume que la mercadería comprada ya fue recibida): el dueño carga los packs disponibles desde /admin.
 *  - No son cajas ni sobres: no habilitan ni reciben el descuento de caja + sobres ni las promociones de pago de las cajas.
 *  - Sin marca, medidas, espesor, material ni certificaciones inventados: solo lo que dice la ficha.
 *  - Las portadas son ILUSTRACIONES generadas (recursos-originales/accesorios/PROMPTS.txt), no fotos del stock real.
 * Se definen en el código: repetir cualquier script o carga nunca los duplica.
 */
const ORIGEN = "Ilustración generada para la tienda con una herramienta de imágenes (descripción en recursos-originales/accesorios/PROMPTS.txt). No es una fotografía del producto real.";
const LICENCIA = "Imagen generada para Vasconcelo: no es una foto del stock real ni de un fabricante.";

function portada(file: string, alt: string): ImageAsset {
  return { src: `/images/products/accesorios/${file}`, alt, width: 1000, height: 1000, status: "final", source: "illustration", view: "front", origin: ORIGEN, license: LICENCIA };
}

export const SLEEVES_ID = "sleeves-transparentes-pack-5";
export const TOPLOADERS_ID = "top-loaders-transparentes-pack-5";

export const products: Product[] = [
  {
    id: SLEEVES_ID, sku: "ACC-SLEEVES-TRANSP-X5", slug: "sleeves-transparentes-pack-5", title: "Sleeves transparentes · Pack de 5 unidades",
    kind: "accessory", language: "na", region: "No aplica", expansionIds: [], currency: "ARS",
    priceBase: "ars", fixedPriceMinor: 100000, priceMinor: 100000, packSize: 5, stockQuantity: null, active: true, isDemo: false, createdAt: "2026-10-22",
    images: [portada("sleeves-transparentes-pack-5.webp", "Ilustración de una sleeve transparente vacía (imagen ilustrativa; la compra incluye 5 unidades)")],
    fallbackTone: "paper",
    description: "Pack de 5 sleeves transparentes para proteger cartas desde que abrís los sobres. La compra incluye 5 unidades por pack. No incluye cartas.",
    contents: [{ label: "Sleeves transparentes", quantity: 5, unit: "unidades", note: "Una compra = un pack de 5. Medidas, espesor y material: sin información confirmada." }],
    guaranteeIds: [],
  },
  {
    id: TOPLOADERS_ID, sku: "ACC-TOPLOADERS-TRANSP-X5", slug: "top-loaders-transparentes-pack-5", title: "Top loaders transparentes · Pack de 5 unidades",
    kind: "accessory", language: "na", region: "No aplica", expansionIds: [], currency: "ARS",
    priceBase: "ars", fixedPriceMinor: 350000, priceMinor: 350000, packSize: 5, stockQuantity: null, active: true, isDemo: false, createdAt: "2026-10-22",
    images: [portada("top-loaders-transparentes-pack-5.webp", "Ilustración de un top loader transparente vacío (imagen ilustrativa; la compra incluye 5 unidades)")],
    fallbackTone: "paper",
    description: "Pack de 5 top loaders transparentes: protección rígida para tus mejores cartas. Se usan junto con una sleeve (la carta va primero en la sleeve y después en el top loader). La compra incluye 5 unidades por pack. No incluye cartas.",
    contents: [{ label: "Top loaders transparentes", quantity: 5, unit: "unidades", note: "Una compra = un pack de 5. Se usan junto con una sleeve. Medidas, espesor y material: sin información confirmada." }],
    guaranteeIds: [],
  },
];
