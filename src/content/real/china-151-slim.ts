import type { Product } from "../schema";

/** Variantes y contenido informados por el dueño y su captura de proveedor, 05/11/2026. */
export const products: Product[] = [
  { code: "jing", name: "Surprise", original: "151 惊 瘦版" },
  { code: "wang", name: "Hope", original: "151 望 瘦版" },
].map(({ code, name, original }) => ({
  id: `zh-151-${code}-slim-caja`, slug: `zh-151-${code}-slim-caja`,
  sku: `ZH-151-${code.toUpperCase()}-SLIM-BOX`,
  title: `151 ${name} · Caja Slim de 15 sobres`, originalTitle: original,
  aliases: [original, `151 ${name}`, "151 slim", "15包5张"],
  kind: "box", variant: "Slim · 15 sobres de 5 cartas", language: "zh", region: "CN",
  expansionIds: [], currency: "ARS", priceBase: "usd", priceUsdMinor: 6000,
  priceMinor: null, stockQuantity: 0, active: true, isDemo: false,
  createdAt: "2026-11-05", images: [{ src: `/images/products/zh-151-${code}-slim-caja/caja-transparente-v2.webp`, alt: `Caja cerrada de 151 ${name} Slim de 15 sobres`, width: 1254, height: 1254, opaque: false, status: "reference", source: "illustration", view: "closed", origin: "Imagen editada con IA y fondo transparente aportada por el dueño el 5 de noviembre de 2026.", license: "Imagen aportada por el dueño para el catálogo, como referencia de proveedor." }, { src: `/images/products/zh-151-${code}-slim-caja/referencia.webp`, alt: `Sobre oficial de 151 ${name}, referencia del diseño de la colección. La compra incluye una caja de 15 sobres.`, width: 1000, height: 1775, status: "reference", source: "manufacturer", view: "front", origin: code === "wang" ? "https://www.pokemon.cn/tcg/product/15541.html" : "https://www.pokemon.cn/tcg/product/15486.html", license: "Imagen de referencia del fabricante. Sin permiso de uso concedido por el enlace." }], fallbackTone: "paper",
  description: `Caja 151 ${name}, versión Slim en chino simplificado. Contiene 15 sobres de 5 cartas según la información del proveedor aportada por el dueño. ${name} es una denominación descriptiva en inglés. La portada es una imagen de referencia editada con IA y aportada por el dueño. La segunda imagen muestra el sobre oficial de la colección.`,
  contents: [{ label: "Sobres", quantity: 15, unit: "sobres", note: "5 cartas por sobre. Contenido informado por el proveedor; cartas aleatorias." }],
  guaranteeIds: [],
}));
