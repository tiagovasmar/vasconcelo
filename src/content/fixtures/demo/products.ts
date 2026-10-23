import type { Product } from "../../schema";
import { demoImage } from "./helpers";
import { products as accesoriosReales } from "../../real/accesorios";

/**
 * Productos DE DEMOSTRACIÓN (isDemo: true): precios, stock y existencia son ejemplos para revisar la tienda.
 * Para publicar un producto real: ver docs/CATALOGO.md.
 */
const imgs = (sku: string, title: string) => [
  demoImage(`/images/products/${sku}/01.webp`, `${title}: frente`),
  demoImage(`/images/products/${sku}/02.webp`, `${title}: ángulo`),
  demoImage(`/images/products/${sku}/03.webp`, `${title}: detalle`),
];

export const products: Product[] = [
  {
    id: "storm-sobre", sku: "DEMO-STORM-SOBRE", slug: "storm-emeralda-sobre", title: "Storm Emeralda · Sobre",
    kind: "booster", language: "ja", region: "JP", expansionIds: ["storm-emeralda"], currency: "ARS",
    priceMinor: 950000, stockQuantity: 24, maxPerOrder: 10, active: true, isDemo: true, createdAt: "2026-10-01",
    images: imgs("DEMO-STORM-SOBRE", "Sobre Storm Emeralda"), fallbackTone: "mint",
    description: "Un sobre sellado de la expansión japonesa Storm Emeralda. El contenido de cada sobre es aleatorio.",
    contents: [{ label: "Sobre sellado", quantity: 1, note: "Cantidad de cartas por sobre: ver la ficha oficial del producto." }],
    guaranteeIds: [],
  },
  {
    id: "storm-caja", sku: "DEMO-STORM-CAJA", slug: "storm-emeralda-caja", title: "Storm Emeralda · Caja",
    kind: "box", language: "ja", region: "JP", expansionIds: ["storm-emeralda"], currency: "ARS",
    priceMinor: 18500000, stockQuantity: 3, maxPerOrder: 2, active: true, isDemo: true, createdAt: "2026-10-02",
    images: imgs("DEMO-STORM-CAJA", "Caja Storm Emeralda"), fallbackTone: "ink",
    description: "Caja sellada de Storm Emeralda (JP) con 30 sobres. Se vende cerrada: no incluye sobres de regalo ni otros extras.",
    contents: [
      { label: "Sobres por caja", quantity: 30, unit: "sobres" },
      { label: "Cartas por sobre", quantity: 5, unit: "cartas" },
    ],
    guaranteeIds: ["g-storm-caja-fisico"],
  },
  {
    id: "storm-pack5", sku: "DEMO-STORM-PACK5", slug: "storm-emeralda-pack-5-sobres", title: "Pack de 5 sobres · Storm Emeralda",
    kind: "pack", language: "ja", region: "JP", expansionIds: ["storm-emeralda"], currency: "ARS",
    priceMinor: 4200000, stockQuantity: 6, maxPerOrder: 5, active: true, isDemo: true, createdAt: "2026-10-03",
    images: imgs("DEMO-STORM-PACK5", "Pack de 5 sobres"), fallbackTone: "paper",
    description: "Pack armado por la tienda con 5 sobres sellados de Storm Emeralda (JP).",
    contents: [{ label: "Sobres sellados de Storm Emeralda", quantity: 5, unit: "sobres" }],
    guaranteeIds: ["g-storm-pack-composicion"],
    packComposition: [{ expansionId: "storm-emeralda", packCount: 5 }],
  },
  {
    id: "ejemplo-sobre", sku: "DEMO-EJ-SOBRE", slug: "set-de-ejemplo-sobre", title: "Set de ejemplo · Sobre",
    kind: "booster", language: "en", region: "US", expansionIds: ["set-ejemplo"], currency: "ARS",
    priceMinor: 1250000, stockQuantity: 40, maxPerOrder: 10, active: true, isDemo: true, createdAt: "2026-09-20",
    images: imgs("DEMO-EJ-SOBRE", "Sobre Set de ejemplo"), fallbackTone: "gold",
    description: "Sobre de la expansión FICTICIA «Set de ejemplo», con lista completa de cartas de demostración.",
    contents: [{ label: "Sobre sellado", quantity: 1 }],
    guaranteeIds: [],
  },
  {
    id: "ejemplo-caja", sku: "DEMO-EJ-CAJA", slug: "set-de-ejemplo-caja", title: "Set de ejemplo · Caja",
    kind: "box", language: "en", region: "US", expansionIds: ["set-ejemplo"], currency: "ARS",
    priceMinor: 21000000, stockQuantity: 2, maxPerOrder: 2, active: true, isDemo: true, createdAt: "2026-09-18",
    images: imgs("DEMO-EJ-CAJA", "Caja Set de ejemplo"), fallbackTone: "gold",
    description: "Caja FICTICIA de demostración. Sirve para revisar cómo se muestra una afirmación de rareza sin verificar.",
    contents: [{ label: "Caja sellada", quantity: 1, note: "Cantidad de sobres: dato no cargado." }],
    guaranteeIds: ["g-ejemplo-caja-rareza"],
  },
  {
    id: "ejemplo-pack-mixto", sku: "DEMO-EJ-PACKMIX", slug: "pack-mixto-de-ejemplo", title: "Pack mixto de ejemplo",
    kind: "pack", language: "en", region: "US", expansionIds: ["set-ejemplo", "set-parcial"], currency: "ARS",
    priceMinor: 5900000, stockQuantity: 5, maxPerOrder: 5, active: true, isDemo: true, createdAt: "2026-09-25",
    images: imgs("DEMO-EJ-PACKMIX", "Pack mixto"), fallbackTone: "paper",
    description: "Pack FICTICIO que mezcla dos expansiones: las cartas se muestran agrupadas por expansión.",
    contents: [
      { label: "Sobres del Set de ejemplo", quantity: 3, unit: "sobres" },
      { label: "Sobres del Set parcial de ejemplo", quantity: 2, unit: "sobres" },
    ],
    guaranteeIds: ["g-ejemplo-pack-mixto"],
    packComposition: [{ expansionId: "set-ejemplo", packCount: 3 }, { expansionId: "set-parcial", packCount: 2 }],
  },
  {
    id: "parcial-sobre", sku: "DEMO-PAR-SOBRE", slug: "set-parcial-de-ejemplo-sobre", title: "Set parcial de ejemplo · Sobre",
    kind: "booster", language: "en", region: "US", expansionIds: ["set-parcial"], currency: "ARS",
    priceMinor: 1100000, stockQuantity: 12, maxPerOrder: 10, active: true, isDemo: true, createdAt: "2026-09-10",
    images: imgs("DEMO-PAR-SOBRE", "Sobre Set parcial"), fallbackTone: "violet",
    description: "Sobre de la expansión FICTICIA «Set parcial de ejemplo», con lista parcial de cartas.",
    contents: [{ label: "Sobre sellado", quantity: 1 }],
    guaranteeIds: [],
  },
  {
    id: "parcial-bundle", sku: "DEMO-PAR-BUNDLE", slug: "set-parcial-de-ejemplo-bundle", title: "Booster bundle de ejemplo",
    kind: "bundle", language: "en", region: "US", expansionIds: ["set-parcial"], currency: "ARS",
    priceMinor: 6800000, stockQuantity: 0, maxPerOrder: 3, active: true, isDemo: true, createdAt: "2026-09-05",
    images: imgs("DEMO-PAR-BUNDLE", "Booster bundle"), fallbackTone: "violet",
    description: "Bundle FICTICIO agotado, para revisar el estado sin stock.",
    contents: [{ label: "Bundle sellado", quantity: 1, note: "Cantidad de sobres: dato no cargado." }],
    guaranteeIds: [],
  },
  // Los dos accesorios reales (mismos ids, precio fijo en pesos y portadas), pero con packs de ejemplo en stock para probar carrito, recomendaciones y ventas.
  ...accesoriosReales.map((a, i): Product => ({ ...a, isDemo: true, stockQuantity: i === 0 ? 20 : 12 })),
  ...extraBoosters(),
];

/**
 * Sobres de prueba EXTRA (DEMO_EXTRA_BOOSTERS=N, solo en el servidor de pruebas «extra»): permiten probar el «Ver más» del selector de la ficha de una caja
 * (más de 6 sobres elegibles). Sin la variable no existe ninguno, así que el resto de las pruebas y conteos no cambian.
 */
function extraBoosters(): Product[] {
  const n = Math.min(40, Math.max(0, Number(process.env.DEMO_EXTRA_BOOSTERS || 0) || 0));
  return Array.from({ length: n }, (_, i): Product => {
    const k = String(i + 1).padStart(2, "0");
    return {
      id: `extra-sobre-${k}`, sku: `DEMO-EXTRA-${k}`, slug: `sobre-extra-${k}`, title: `Sobre extra ${k} · Sobre`,
      kind: "booster", language: i % 2 === 0 ? "ja" : "en", region: i % 2 === 0 ? "JP" : "US", expansionIds: ["storm-emeralda"], currency: "ARS",
      priceMinor: (8000 + 500 * i) * 100, stockQuantity: 10, maxPerOrder: 10, active: true, isDemo: true, createdAt: "2026-08-01",
      images: imgs("DEMO-STORM-SOBRE", "Sobre extra"), fallbackTone: "mint",
      description: "Sobre FICTICIO para probar el selector con muchas opciones.",
      contents: [{ label: "Sobre sellado", quantity: 1 }],
      guaranteeIds: [],
    };
  });
}
