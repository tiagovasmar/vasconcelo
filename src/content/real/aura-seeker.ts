import type { Expansion, Product, Source } from "../schema";

const checkedAt = "2026-11-25";
const supplierPage = "https://www.ebicollectibles.com/products/pokemon-japanese-aura-seeker-m7-booster-box";

export const sources: Source[] = [
  { id: "jp-aura-seeker-official", url: "https://www.pokemon-card.com/ex/m7/", publisher: "Pokémon Card Japón", consultedAt: checkedAt, scope: "Nombre original, código M7, fecha de lanzamiento y 5 cartas aleatorias por sobre." },
  { id: "jp-aura-seeker-box", url: supplierPage, publisher: "EBI Collectibles", consultedAt: checkedAt, scope: "Presentación de la caja japonesa de 30 sobres y fotografía de referencia de la caja cerrada." },
];

export const expansions: Expansion[] = [{
  id: "aura-seeker", slug: "aura-seeker", name: "Aura Seeker", japaneseName: "ハドウシーカー", code: "M7",
  aliases: ["Hadou Seeker", "Hadō Seeker", "ハドウシーカー", "M7"], language: "ja", region: "JP", series: "MEGA",
  releaseDate: "2026-11-27", summary: "Expansión japonesa Aura Seeker (M7), con Mega Lucario Z ex.",
  isDemo: false, sourceIds: sources.map((source) => source.id), cardListStatus: "unavailable", cards: [], tone: "mint",
}];

export const products: Product[] = [{
  id: "aura-seeker-caja", slug: "aura-seeker-caja", sku: "M7-JP-BOX",
  title: "Aura Seeker · Caja de 30 sobres", originalTitle: "ハドウシーカー",
  aliases: ["Hadou Seeker", "Hadō Seeker", "ハドウシーカー", "M7"],
  kind: "box", language: "ja", region: "JP", expansionIds: ["aura-seeker"],
  currency: "ARS", priceBase: "usd", priceUsdMinor: 14000, priceMinor: null,
  stockQuantity: 0, orderOnly: true, active: true, isDemo: false, createdAt: checkedAt,
  images: [{
    src: "/images/products/aura-seeker/caja-sin-fondo.webp", width: 1087, height: 642,
    opaque: false, status: "reference", source: "supplier", view: "closed",
    alt: "Caja japonesa cerrada de Aura Seeker (M7), con Mega Lucario Z ex, sin fondo",
    origin: "https://ebicollectibles.com/assets/products/pokemon-japanese-aura-seeker-m7-booster-box-02.webp",
    license: "Fotografía de referencia publicada por EBI Collectibles. Fondo eliminado siguiendo el contorno de la caja original, sin reconstruir el arte ni el texto del envase.",
  }],
  fallbackTone: "mint",
  description: "Caja japonesa de Aura Seeker (M7), de la serie MEGA. Incluye 30 sobres de 5 cartas aleatorias cada uno. Lanzamiento en Japón: 27 de noviembre de 2026. Disponible por encargo; la fecha de entrega se confirma al coordinar el pedido.",
  contents: [
    { label: "Sobres por caja", quantity: 30, unit: "sobres" },
    { label: "Cartas por sobre", quantity: 5, unit: "cartas", note: "Contenido aleatorio." },
  ],
  packComposition: [{ expansionId: "aura-seeker", packCount: 30 }], guaranteeIds: [],
}];
