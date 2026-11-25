import type { Product, Source } from "../schema";
import photos from "../colecciones/imagenes-pokebolas-figura.json";

const sourceId = "zh-pikachu-legendary-celebration-balls-oficial";
const verifiedAt = "2026-11-10";

export const source: Source = {
  id: sourceId,
  url: "https://www.pokemon.cn/tcg/product/16031.html",
  publisher: "Pokémon China",
  consultedAt: verifiedAt,
  scope: "Presentación y contenido de las dos cajas Pikachu Legendary Celebration.",
  note: "Las variantes roja y azul coinciden con las imágenes del proveedor aportadas por el dueño.",
};

const variants = [
  { slug: "poke-ball", name: "Poké Ball", color: "roja", original: "精灵球礼盒", aliases: ["Pokeball", "Pokébola"] },
  { slug: "super-ball", name: "Super Ball", color: "azul", original: "超级球礼盒", aliases: ["Great Ball", "Superball"] },
];

export const products: Product[] = variants.map((variant) => {
  const id = `zh-pikachu-legendary-celebration-${variant.slug}`;
  const photo = photos.find((image) => image.id === id);
  if (!photo) throw new Error(`Falta la portada de ${id}`);
  return {
    id, slug: id, sku: id.toUpperCase(),
    title: `Pikachu Legendary Celebration · ${variant.name} ${variant.color}`,
    originalTitle: `${variant.original}：皮卡丘传奇庆典`,
    aliases: variant.aliases,
    variant: `${variant.name} ${variant.color}`,
    nameInfo: { kind: "descriptive", certainty: "inferred", variants: variant.aliases, sourceIds: [sourceId], verifiedAt },
    kind: "special-box", language: "zh", region: "CN", expansionIds: [],
    currency: "ARS", priceUsdMinor: null, priceMinor: null, stockQuantity: 0,
    active: true, isDemo: false, createdAt: verifiedAt,
    images: [{
      src: photo.src,
      alt: photo.alt,
      width: photo.width, height: photo.height, opaque: false,
      status: "reference", source: "supplier", view: "closed",
      origin: photo.origin,
      license: photo.license,
    }],
    fallbackTone: "paper",
    description: `Caja de colección de Pokémon TCG en chino simplificado con una ${variant.name} ${variant.color} para guardar objetos. Incluye dos cartas holográficas aleatorias y un sobre de Espada y Escudo de 25 cartas.`,
    contents: [
      { label: `${variant.name} ${variant.color} para guardar objetos`, quantity: 1 },
      { label: "Carta holográfica aleatoria de Pikachu", quantity: 1 },
      { label: "Carta holográfica aleatoria de la selección de Pokémon legendarios y Mew", quantity: 1 },
      { label: "Sobre 洪荒演武", quantity: 1, note: "25 cartas. Se incluye una de las dos variantes al azar (茂 o 激)." },
    ],
    guaranteeIds: [],
  };
});
