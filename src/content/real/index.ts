import type { Catalog } from "../schema";
import { sources as sourcesJa } from "./sources";
import { expansions as expansionsJa } from "./expansions";
import { products as productsJa } from "./products";
import { guarantees as guaranteesJa } from "./guarantees";
import * as zh from "./china";
import { products as chinaNoviembre } from "./china-noviembre";
import pricesNovember from "./precios-noviembre.json";
import * as jaCajas from "./japon-cajas";
import * as jaNoviembre from "./japon-noviembre";
import { products as accesorios } from "./accesorios";
import { products as china151Slim } from "./china-151-slim";
import * as china30thSets from "./china-30th-sets";
import * as chinaFigures from "./china-figures";
import * as chinaPikachuBalls from "./china-pikachu-balls";
import * as chinaBlackWhite from "./china-black-white";
import * as bandai from "./bandai";
import { pullRates } from "./pull-rates";
import { withSupplierPhotos } from "./fotos-proveedor";
import { withSlimPackPhoto } from "./fotos-slim";

/**
 * Catálogo comercial real: 8 colecciones japonesas (caja y sobre individual por separado, 16 fichas) y las ediciones en chino simplificado
 * importadas desde publicaciones de proveedores (china.ts). Los dos lotes no comparten colecciones, SKU ni galerías.
 */
export const realCatalog: Catalog = {
  // Destacados del inicio, en orden. Storm Emeralda es la expansión destacada del hero.
  featuredIds: ["storm-caja", "storm-sobre", "abyss-eye-caja", "30th-celebration-caja"],
  sources: [...sourcesJa, ...jaCajas.sources, ...jaNoviembre.sources, ...zh.sources, china30thSets.source, ...chinaFigures.sources, chinaPikachuBalls.source, ...chinaBlackWhite.sources, ...bandai.sources],
  expansions: [...expansionsJa, ...jaCajas.expansions, ...jaNoviembre.expansions, ...zh.expansions, ...chinaBlackWhite.expansions],
  products: [...productsJa, ...jaCajas.products, ...jaNoviembre.products, ...zh.products.filter((p) => !chinaNoviembre.some((n) => n.id === p.id)), ...chinaNoviembre, ...china151Slim, ...china30thSets.products, ...chinaFigures.products, ...chinaPikachuBalls.products, ...chinaBlackWhite.products, ...accesorios].map((p) => { const usd = (pricesNovember as Record<string, number>)[p.id]; return withSlimPackPhoto(withSupplierPhotos(usd === undefined ? p : { ...p, priceBase: "usd", priceUsdMinor: Math.round(usd * 100) })); }).concat(bandai.products),
  pullRates,
  guarantees: [...guaranteesJa, ...jaCajas.guarantees, ...zh.guarantees],
};
