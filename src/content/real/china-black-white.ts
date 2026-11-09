import type { Expansion, Product, Source } from "../schema";

const reviewedAt = "2026-11-07";
const releaseDate = "2026-11-06";
const officialUrl = "https://www.pokemon.cn/products_category/products/p/12";
const retailerUrl = "https://monketic.com/products/cn-pokemon-black-bolt-white-flare-booster-box-csv10-5c-slim-simplified-chinese";

export const sources: Source[] = [
  {
    id: "zh-black-white-oficial",
    url: officialUrl,
    publisher: "Pokémon China",
    consultedAt: reviewedAt,
    scope: "Nombres en chino simplificado, lanzamiento y composición de los sobres de 5 cartas.",
  },
  {
    id: "zh-black-white-slim-comercio",
    url: retailerUrl,
    publisher: "Monketic",
    consultedAt: reviewedAt,
    scope: "Nombres comerciales en inglés, códigos y cantidad de sobres por caja Slim.",
  },
];

const sets = [
  {
    id: "zh-black-bolt",
    name: "Black Bolt",
    originalName: "黑雷奔流",
    code: "CSV10.5C",
    pokemon: "Zekrom",
    image: { file: "sobre-referencia.png", width: 750, height: 1331, view: "front" as const,
      alt: "Sobre chino de Black Bolt de 5 cartas, referencia del diseño de la colección.",
      origin: retailerUrl },
    tone: "ink" as const,
  },
  {
    id: "zh-white-flare",
    name: "White Flare",
    originalName: "白焰迸涌",
    code: "CSV10.6C",
    pokemon: "Reshiram",
    image: { file: "caja-referencia.png", width: 344, height: 574, view: "closed" as const,
      alt: "Caja Slim china de White Flare con Reshiram.",
      origin: "Foto de Taobao aportada por el dueño, con el fondo recortado." },
    tone: "paper" as const,
  },
];

export const expansions: Expansion[] = sets.map((set) => ({
  id: set.id,
  slug: set.id,
  name: set.name,
  originalName: set.originalName,
  code: set.code,
  nameInfo: {
    kind: "community",
    certainty: "sources_agree",
    variants: [],
    sourceIds: ["zh-black-white-slim-comercio"],
    verifiedAt: reviewedAt,
  },
  language: "zh",
  region: "CN",
  series: "Scarlet & Violet",
  releaseDate,
  summary: `Expansión de Escarlata y Púrpura en chino simplificado centrada en ${set.pokemon}.`,
  isDemo: false,
  sourceIds: sources.map((source) => source.id),
  cardListStatus: "unavailable",
  cards: [],
  tone: set.tone,
}));

export const products: Product[] = sets.map((set) => {
  const id = `${set.id}-slim-caja`;
  const referenceNote = set.image.view === "front" ? " La imagen muestra el sobre como referencia del diseño de la colección." : "";
  return {
    id,
    slug: id,
    sku: `ZH-${set.code}-SLIM-BOX`,
    title: `${set.name} · Caja Slim de 15 sobres`,
    originalTitle: set.originalName,
    kind: "box",
    variant: "Slim · 15 sobres de 5 cartas",
    language: "zh",
    region: "CN",
    expansionIds: [set.id],
    currency: "ARS",
    priceBase: "usd",
    priceUsdMinor: null,
    priceMinor: null,
    stockQuantity: null,
    active: true,
    isDemo: false,
    createdAt: reviewedAt,
    images: [{
      src: `/images/products/${id}/${set.image.file}`,
      alt: set.image.alt,
      width: set.image.width,
      height: set.image.height,
      view: set.image.view,
      origin: set.image.origin,
      opaque: false,
      status: "reference",
      source: "supplier",
      license: "Imagen de referencia del producto.",
    }],
    fallbackTone: set.tone,
    description: `Caja Slim de ${set.name} (${set.code}) en chino simplificado, con ${set.pokemon} en el arte del envase. Contiene 15 sobres de 5 cartas aleatorias, incluida una holográfica por sobre.${referenceNote}`,
    contents: [
      { label: "Sobres por caja", quantity: 15, unit: "sobres" },
      { label: "Cartas por sobre", quantity: 5, unit: "cartas", note: "Al azar, con 1 holográfica por sobre." },
    ],
    packComposition: [{ expansionId: set.id, packCount: 15 }],
    guaranteeIds: [],
  };
});
