import type { Product, Source } from "../schema";

const consultedAt = "2026-11-07";
const expansionId = "zh-30-zhounian";
const sourceId = "zh-30th-sets-oficial";

export const source: Source = {
  id: sourceId,
  url: "https://www.pokemon.cn/tcg/product/21608.html",
  publisher: "Pokémon China",
  consultedAt,
  scope: "Contenido de los kits de mazo y los sets de exhibición del 30.º aniversario.",
};

const deckKits = [
  { slug: "espeon", name: "Espeon", original: "太阳伊布" },
  { slug: "umbreon", name: "Umbreon", original: "月亮伊布" },
].map(({ slug, name, original }) => ({
  slug: `${slug}-kit`,
  title: `${name} · Kit de mazo deluxe`,
  variant: name,
  original: `豪华卡组套装 ${original}`,
  description: `Kit del 30.º aniversario en chino simplificado para jugar con ${name} ex. Incluye mazo, caja metálica con estuche para contadores, moneda temática, tapete de papel y guías. Trae dos sobres de seis cartas aleatorias.`,
  kind: "kit" as const,
  packCount: 2,
  size: 1000,
  contents: [
    { label: `Mazo de ${name} ex`, quantity: 1 },
    { label: "Caja metálica para el mazo con estuche para contadores", quantity: 1 },
    { label: "Moneda", quantity: 1 },
    { label: "Tapete de papel", quantity: 1 },
    { label: "Contadores de daño de cartón" },
    { label: "Instrucciones y guía de juego" },
  ],
}));

const displaySets = [
  { slug: "greninja", name: "Greninja", original: "甲贺忍蛙" },
  { slug: "sylveon", name: "Sylveon", original: "仙子伊布" },
].map(({ slug, name, original }) => ({
  slug: `${slug}-ex-exhibicion`,
  title: `${name} ex · Set de exhibición`,
  variant: `${name} ex`,
  original: `卡牌展示套套装 ${original}ex`,
  description: `Set del 30.º aniversario en chino simplificado para exhibir a ${name} ex: incluye su carta holográfica con nueva ilustración y un protector temático a juego. Se completa con tres sobres de seis cartas aleatorias.`,
  kind: "special-box" as const,
  packCount: 3,
  size: 1000,
  contents: [
    { label: `Carta holográfica de ${name} ex`, quantity: 1 },
    { label: "Protector temático para exhibir la carta", quantity: 1 },
  ],
}));

const collectorBox = {
  slug: "espeon-umbreon-ex-coleccionista",
  title: "Espeon ex y Umbreon ex · Caja de colección",
  variant: "Espeon ex y Umbreon ex",
  original: "收藏展示礼盒 太阳伊布ex&月亮伊布ex",
  description: "Caja del 30.º aniversario en chino simplificado con Espeon ex y Umbreon ex holográficos en escenas diurnas y nocturnas. Incluye marco doble, dos imanes de tres capas con efecto de profundidad y quince sobres de seis cartas aleatorias.",
  kind: "special-box" as const,
  packCount: 15,
  size: 800,
  contents: [
    { label: "Carta holográfica de Espeon ex", quantity: 1 },
    { label: "Carta holográfica de Umbreon ex", quantity: 1 },
    { label: "Marco doble para exhibir las cartas", quantity: 1 },
    { label: "Imanes temáticos de día y noche", quantity: 2 },
  ],
};

const covers: Record<string, { width: number; height: number; official?: boolean }> = {
  "espeon-kit": { width: 531, height: 437, official: true },
  "greninja-ex-exhibicion": { width: 533, height: 430, official: true },
  "espeon-umbreon-ex-coleccionista": { width: 501, height: 464, official: true },
  "umbreon-kit": { width: 864, height: 709 },
  "sylveon-ex-exhibicion": { width: 1050, height: 842 },
};

export const products: Product[] = [...deckKits, ...displaySets, collectorBox].map((set) => {
  const id = `zh-30th-${set.slug}`;
  const cover = covers[set.slug];
  return {
    id,
    slug: id,
    sku: id.toUpperCase(),
    title: `30th Celebration · ${set.title}`,
    originalTitle: `30周年庆典 ${set.original}`,
    kind: set.kind,
    variant: set.variant,
    language: "zh",
    region: "CN",
    expansionIds: [expansionId],
    currency: "ARS",
    priceBase: "usd",
    priceUsdMinor: null,
    priceMinor: null,
    stockQuantity: null,
    active: true,
    isDemo: false,
    createdAt: consultedAt,
    images: [{
      src: `/images/products/${id}/portada-original-v2.webp`,
      alt: `Envase de 30th Celebration · ${set.title}`,
      width: cover.width,
      height: cover.height,
      opaque: false,
      status: "reference",
      source: cover.official ? "manufacturer" : "supplier",
      view: "front",
      origin: cover.official ? "https://campaign-30th.pokemon.cn/products/" : "Foto de Taobao aportada por el dueño el 7 de noviembre de 2026, recortada sobre el original.",
      license: cover.official ? "Imagen de referencia publicada por Pokémon China." : "Imagen de referencia del proveedor, aportada por el dueño.",
    }, {
      src: `/images/products/${id}/portada.webp`,
      alt: `Foto original del proveedor · ${set.title}`,
      width: set.size,
      height: set.size,
      opaque: true,
      status: "reference",
      source: "supplier",
      view: "front",
      origin: "Foto original de Taobao aportada por el dueño el 7 de noviembre de 2026.",
      license: "Imagen aportada por el dueño para el catálogo, como referencia de proveedor.",
    }],
    fallbackTone: "paper",
    description: set.description,
    contents: [
      ...set.contents,
      { label: "Sobres del 30.º aniversario", quantity: set.packCount, unit: "sobres", note: "6 cartas por sobre. Contenido aleatorio." },
    ],
    packComposition: [{ expansionId, packCount: set.packCount }],
    rarityReview: {
      status: "not_documented",
      checkedAt: consultedAt,
      sourceIds: [sourceId],
      note: "La ficha oficial detalla el contenido fijo del set y la cantidad de sobres. Las cartas de los sobres son aleatorias.",
    },
    guaranteeIds: [],
  };
});
