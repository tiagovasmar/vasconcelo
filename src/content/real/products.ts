import type { ImageAsset, Product } from "../schema";
import lote from "../colecciones/origen/colecciones.json";
import pendientes from "../colecciones/origen/productos-pendientes.json";
import imagenes from "../colecciones/imagenes.json";
import recortes from "../colecciones/imagenes-recortes.json";
import commercial from "./commercial.json";
import { expansions } from "./expansions";
import { storePhotosFor } from "./store-photos";

/**
 * 16 productos reales (8 colecciones × caja y sobre individual, japonés/JP). Precio y stock vienen de `commercial.json`
 * (por SKU): mientras falten, el producto se ve en el sitio como «Precio a confirmar» y no se puede consultar con importe.
 *
 * IDs: se conservan `storm-caja` y `storm-sobre` (ya existían para Storm Emeralda, así que los favoritos y las consultas
 * históricas siguen apuntando a ellos); el resto usa `<colección>-caja` / `<colección>-sobre`.
 */
const LEGACY_IDS: Record<string, string> = { "m6-jp-box": "storm-caja", "m6-jp-booster": "storm-sobre" };

type CommercialItem = { priceMinor?: number | null; stockQuantity?: number | null; maxPerOrder?: number | null; ownerSealCondition?: string | null };
const comercial = (commercial as { items: Record<string, CommercialItem> }).items;

const LICENCIA = "Sin permiso de uso concedido por el enlace de origen. Foto de referencia del fabricante: no acredita el estado del inventario de la tienda.";

/**
 * Se muestra la versión de presentación (`*-recorte.webp`: solo se quita el margen de fondo uniforme, sin escalar ni tocar el
 * envase); el original y su huella siguen en `imagenes.json` y el origen (`origin`) es siempre el de la foto original.
 */
function image(collectionId: string, role: string, alt: string, view: NonNullable<ImageAsset["view"]>): ImageAsset {
  const img = imagenes.find((i) => i.collectionId === collectionId && i.role === role);
  if (!img) throw new Error(`Falta la imagen ${role} de ${collectionId}`);
  const rec = recortes.find((r) => r.original === img.src);
  if (!rec) throw new Error(`Falta el recorte de presentación de ${img.src}: ejecutá node scripts/colecciones/recortar-imagenes.mjs`);
  return { src: rec.src, alt, width: rec.width, height: rec.height, status: "reference", source: "manufacturer", view, opaque: !rec.hasAlpha, origin: img.sourceUrl, license: LICENCIA + " Versión de presentación a partir del archivo original (" + img.src + "): " + rec.operacion + "." };
}

/**
 * Revisión de rarezas garantizadas de una caja japonesa estándar (13/10/2026). Se leyeron la ficha de la caja en Pokémon Center Online y la
 * página oficial de la expansión: informan sobres por caja, cartas por sobre y que las cartas se encapsulan «al azar», y NO declaran una
 * rareza (AR, SAR, SR…) garantizada por sobre ni por caja. Que no figure no significa que no exista un patrón habitual: significa que no hay
 * respaldo documental para prometerlo. Los formatos Deluxe de Black Bolt / White Flare (1 AR por sobre) son otro producto que esta tienda no vende.
 */
const rarityReviewJa = (id: string, code: string): NonNullable<Product["rarityReview"]> => ({
  status: "not_documented",
  checkedAt: "2026-10-13",
  sourceIds: [`box-${id}`, `exp-${id}`],
  note: `Revisadas la ficha de la caja (${code}) en Pokémon Center Online y la página oficial de la expansión: indican la cantidad de sobres y de cartas por sobre y que las cartas son aleatorias, sin mencionar ninguna rareza garantizada por sobre ni por caja. No se trasladan garantías de otros productos (otras presentaciones de la misma expansión, sobres sueltos, otras ediciones).`,
});

export const products: Product[] = pendientes.products.map((p): Product => {
  const col = lote.collections.find((c) => c.id === p.expansionId)!;
  const exp = expansions.find((e) => e.id === p.expansionId)!;
  const isBox = p.kind === "box";
  const id = LEGACY_IDS[p.id] ?? `${col.id}-${isBox ? "caja" : "sobre"}`;
  const c = comercial[p.sku] ?? {};
  const cardsPer = col.physicalContents.cardsPerBooster;
  const boosters = col.physicalContents.boostersPerBox;
  const nombre = `${col.displayName} (${col.code})`;

  // Fotos de referencia del fabricante (oficiales) primero; después, si el dueño las aportó, las fotos reales del stock (store-photos.json).
  const images: ImageAsset[] = (isBox
    ? [
        image(col.id, "caja-referencia-2", `Caja cerrada de ${nombre}, foto de referencia del fabricante`, "closed"),
        image(col.id, "caja-referencia-1", `Caja de ${nombre} abierta: presentación de exhibición del fabricante (no es el estado del artículo que se vende)`, "display-open"),
      ]
    : [image(col.id, "sobre", `Sobre individual de ${nombre}, foto de referencia del fabricante`, "front")]).concat(storePhotosFor(p.sku));

  return {
    id,
    sku: p.sku,
    slug: p.slug,
    title: isBox ? `${col.displayName} · Caja de ${boosters} sobres` : `${col.displayName} · Sobre individual`,
    kind: isBox ? "box" : "booster",
    language: "ja",
    region: "JP",
    expansionIds: [col.id],
    currency: "ARS",
    priceMinor: c.priceMinor ?? null,
    stockQuantity: c.stockQuantity ?? null,
    ...(c.maxPerOrder ? { maxPerOrder: c.maxPerOrder } : {}),
    ownerSealCondition: c.ownerSealCondition ?? null,
    active: true,
    isDemo: false,
    // Cajas: qué se revisó sobre rarezas garantizadas (13/10/2026). El resultado es el mismo en las ocho: ninguna fuente revisada declara una.
    ...(isBox ? { rarityReview: rarityReviewJa(col.id, col.code) } : {}),
    // Para «más recientes» se usa la fecha de lanzamiento japonés de la colección.
    createdAt: col.releaseDate,
    images,
    fallbackTone: exp.tone,
    description: isBox
      ? `Caja de ${boosters} sobres de la expansión japonesa ${nombre}. Cada sobre trae ${cardsPer} cartas al azar: ${boosters * cardsPer} posiciones de carta por caja, que no implican cartas todas distintas ni la colección completa. Edición japonesa: no equivale a las versiones internacionales.`
      : `Un sobre individual de la expansión japonesa ${nombre}, con ${cardsPer} cartas al azar. Edición japonesa: no equivale a las versiones internacionales.`,
    contents: isBox
      ? [
          { label: "Sobres por caja", quantity: boosters, unit: "sobres" },
          { label: "Cartas por sobre", quantity: cardsPer, unit: "cartas" },
          { label: "Posiciones de carta por caja", quantity: boosters * cardsPer, unit: "cartas", note: "Al azar: no son cartas todas distintas ni la colección completa." },
        ]
      : [{ label: "Cartas por sobre", quantity: cardsPer, unit: "cartas", note: "Al azar." }],
    guaranteeIds: [], // se completan en guarantees.ts
  };
});
