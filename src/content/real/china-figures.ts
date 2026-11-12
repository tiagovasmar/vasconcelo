import type { Product, Source } from "../schema";

const id = "zh-30th-pikachu-figura";

const pikachuSource: Source = {
  id: "zh-30th-pikachu-figura-oficial",
  url: "https://www.pokemon.cn/products_category/products/p/12",
  publisher: "Pokémon China",
  consultedAt: "2026-11-10",
  scope: "Contenido del set de figura de Pikachu del 30.º aniversario.",
  note: "Variante individual identificada en la tienda oficial de Tmall. https://detail.tmall.com/item.htm?id=1082955160912&skuId=6134829125725",
};

const pikachu: Product = {
  id,
  slug: id,
  sku: "ZH-30TH-PIKACHU-FIGURA",
  title: "30th Celebration · Set de figura de Pikachu",
  originalTitle: "绘梦点睛 30周年皮卡丘手办套装",
  aliases: ["Dreams Brought to Life", "figura Pikachu", "blind box"],
  kind: "special-box",
  language: "zh",
  region: "CN",
  expansionIds: ["zh-30-zhounian"],
  currency: "ARS",
  priceUsdMinor: null,
  priceMinor: null,
  stockQuantity: 0,
  active: true,
  isDemo: false,
  createdAt: "2026-11-10",
  images: [{
    src: `/images/products/${id}/portada.webp`,
    alt: "Envase amarillo del set de figura de Pikachu del 30.º aniversario",
    width: 1100,
    height: 1007,
    opaque: true,
    status: "reference",
    source: "supplier",
    view: "front",
    origin: "Imagen de la variante SKU_01 aportada por el dueño. https://item.taobao.com/item.htm?id=1079986406064",
    license: "Imagen de referencia del proveedor aportada por el dueño.",
  }],
  fallbackTone: "gold",
  description: "Set de colección del 30.º aniversario en chino simplificado. Cada caja individual trae una figura sorpresa, su carta correspondiente y un sobre de la expansión 30th Celebration.",
  contents: [
    { label: "Figura sorpresa de Pikachu", quantity: 1, note: "Uno de 13 diseños posibles, incluido un diseño secreto." },
    { label: "Carta de Pokémon correspondiente a la figura", quantity: 1 },
    { label: "Sobre 30th Celebration", quantity: 1, note: "6 cartas por sobre." },
  ],
  guaranteeIds: [],
};

const otherSets = [
  {
    id: "zh-eevee-evoluciones-figura",
    title: "Eevee y sus evoluciones · Set de figura sorpresa",
    originalTitle: "绘梦点睛 伊布“们”的手办套装",
    officialUrl: "https://www.pokemon.cn/tcg/product/20466.html",
    supplierUrl: "https://detail.tmall.com/item.htm?id=1078195403792&skuId=6131911656846",
    aliases: ["Dreams Brought to Life", "Eeveelutions", "figura Eevee", "blind box"],
    description: "Caja individual en chino simplificado con una figura al azar de Eevee o sus evoluciones, la carta correspondiente y un sobre Terastal Gathering.",
    figure: "Figura sorpresa de Eevee o una de sus evoluciones",
    designs: 10,
    booster: { label: "Sobre Terastal Gathering", quantity: 1 },
  },
  {
    id: "zh-ecosistema-acuatico-figura",
    title: "Ecosistema acuático · Set de figura Pokémon sorpresa",
    originalTitle: "绘梦点睛 水生态手办套装",
    officialUrl: "https://www.pokemon.cn/tcg/product/20463.html",
    supplierUrl: "https://detail.tmall.com/item.htm?id=1044387395690&skuId=6070192229812",
    aliases: ["Dreams Brought to Life", "Water Ecology", "figuras acuáticas", "blind box"],
    description: "Caja individual en chino simplificado con una figura al azar de Pokémon de tipo Agua, su carta correspondiente y dos sobres de cinco cartas de 璀璨诡幻.",
    figure: "Figura sorpresa de Pokémon de tipo Agua",
    designs: 13,
    booster: { label: "Sobres 璀璨诡幻", quantity: 2, note: "5 cartas por sobre." },
  },
];

export const sources: Source[] = [pikachuSource, ...otherSets.map((set) => ({
  id: `${set.id}-oficial`, url: set.officialUrl, publisher: "Pokémon China",
  consultedAt: "2026-11-10", scope: `Contenido de ${set.title}.`,
  note: `Variante individual identificada en la tienda oficial de Tmall. ${set.supplierUrl}`,
}))];

export const products: Product[] = [pikachu, ...otherSets.map((set): Product => ({
  id: set.id, slug: set.id, sku: set.id.toUpperCase(),
  title: set.title, originalTitle: set.originalTitle, aliases: set.aliases,
  kind: "special-box", language: "zh", region: "CN", expansionIds: [],
  currency: "ARS", priceUsdMinor: null, priceMinor: null, stockQuantity: 0,
  active: true, isDemo: false, createdAt: "2026-11-10",
  images: [{
    src: `/images/products/${set.id}/portada.webp`,
    alt: `Envase oficial de ${set.title}`,
    width: 1000, height: 1021,
    status: "reference", source: "manufacturer", view: "front",
    origin: set.officialUrl, license: "Imagen de referencia publicada por Pokémon China.",
  }],
  fallbackTone: "paper", description: set.description,
  contents: [
    { label: set.figure, quantity: 1, note: `Uno de ${set.designs} diseños posibles, incluido un diseño secreto.` },
    { label: "Carta de Pokémon correspondiente a la figura", quantity: 1 },
    set.booster,
  ],
  guaranteeIds: [],
}))];
