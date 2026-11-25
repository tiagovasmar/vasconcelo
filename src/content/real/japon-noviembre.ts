import type { Expansion, Product, Source } from "../schema";
import sets from "../colecciones/origen/japon-noviembre.json";
import images from "../colecciones/imagenes-japon-noviembre.json";

const checkedAt = "2026-11-24";

export const sources: Source[] = sets.map((set) => ({
  id: `jp-noviembre-${set.id}`, url: `https://www.pokemon-card.com/ex/${set.path}/`,
  publisher: "Pokémon Card Japón", consultedAt: checkedAt,
  scope: `Nombre, edición y contenido de los sobres de ${set.name} (${set.code}).`,
}));

export const expansions: Expansion[] = sets.map((set) => ({
  id: set.id, slug: set.id, name: set.name, japaneseName: set.original, code: set.code,
  aliases: [set.original, set.code], language: "ja", region: "JP", series: set.series, releaseDate: set.date,
  summary: `Colección japonesa ${set.name} (${set.code}).`,
  isDemo: false, sourceIds: [`jp-noviembre-${set.id}`], cardListStatus: "unavailable", cards: [], tone: "paper",
}));

export const products: Product[] = sets.map((set) => {
  const image = images.find((entry) => entry.id === set.id);
  if (!image) throw new Error(`Falta la imagen oficial de ${set.id}.`);
  return {
    id: `${set.id}-caja`, slug: `${set.id}-caja`, sku: `${set.code.toUpperCase()}-JP-BOX`,
    title: `${set.name} · Caja de ${set.packs} sobres`, originalTitle: set.original,
    aliases: [set.code, set.original], kind: "box", language: "ja", region: "JP", expansionIds: [set.id],
    currency: "ARS", priceUsdMinor: null, priceMinor: null, stockQuantity: 0, orderOnly: true,
    active: true, isDemo: false, createdAt: checkedAt,
    images: [{
      src: image.src, width: image.width, height: image.height, opaque: false,
      status: "reference", source: "manufacturer", view: image.view as "closed" | "display-open",
      alt: `Caja de ${set.name} (${set.code}), imagen de referencia del fabricante`,
      origin: image.sourcePage,
      license: `Imagen de referencia de Pokémon Center. ${image.archivePage ? `Copia archivada en ${image.archivePage}. ` : ""}Fondo eliminado para presentación en la tienda.`,
    }],
    fallbackTone: "paper",
    description: `Caja japonesa de ${set.name} con ${set.packs} sobres de ${set.cards} cartas aleatorias. La fotografía muestra la presentación del fabricante.`,
    contents: [
      { label: "Sobres por caja", quantity: set.packs, unit: "sobres" },
      { label: "Cartas por sobre", quantity: set.cards, unit: "cartas", note: "Contenido aleatorio." },
    ],
    packComposition: [{ expansionId: set.id, packCount: set.packs }], guaranteeIds: [],
  };
});
