import type { Catalog } from "../schema";
import { sources as sourcesJa } from "./sources";
import { expansions as expansionsJa } from "./expansions";
import { products as productsJa } from "./products";
import { guarantees as guaranteesJa } from "./guarantees";
import * as zh from "./china";
import * as jaCajas from "./japon-cajas";
import { products as accesorios } from "./accesorios";
import { products as china151Slim } from "./china-151-slim";
import { pullRates } from "./pull-rates";

/**
 * Catálogo comercial real: 8 colecciones japonesas (caja y sobre individual por separado, 16 fichas) y las ediciones en chino simplificado
 * importadas desde publicaciones de proveedores (china.ts). Los dos lotes no comparten colecciones, SKU ni galerías.
 */
export const realCatalog: Catalog = {
  // Destacados del inicio, en orden. Storm Emeralda es la expansión destacada del hero.
  featuredIds: ["storm-caja", "storm-sobre", "abyss-eye-caja", "30th-celebration-caja"],
  sources: [...sourcesJa, ...jaCajas.sources, ...zh.sources],
  expansions: [...expansionsJa, ...jaCajas.expansions, ...zh.expansions],
  products: [...productsJa, ...jaCajas.products, ...zh.products, ...china151Slim, ...accesorios],
  pullRates,
  guarantees: [...guaranteesJa, ...jaCajas.guarantees, ...zh.guarantees],
};
