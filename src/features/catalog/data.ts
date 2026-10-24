import "server-only";
import { cache } from "react";
import { catalog } from "@/content/catalog";
import { getDb, type Db } from "@/db/client";
import type { Expansion, Product } from "@/content/schema";
import type { EffectiveRate } from "@/features/fx/convert";
import { currentRate } from "@/features/fx/service";
import { rateOncePerRequest } from "@/features/fx/request";
import { pageDataOncePerRequest } from "./page-data";
import { isInStock } from "./commercial";
import { isListedProduct } from "./visibility";
import { applyOverrides, loadGalleries, loadOverrides } from "./overrides";

/**
 * Acceso a datos del catálogo. Los productos salen del catálogo por código con los valores comerciales administrados desde
 * /admin (precio, stock, máximo por pedido, visibilidad) aplicados encima: se leen de la base en cada pedido, así un cambio
 * del panel se ve enseguida en el catálogo, las fichas y la validación del carrito, sin recompilar. Las páginas que los
 * muestran son dinámicas (no se prerenderizan con precios viejos).
 */
async function loadAllProducts(fx: EffectiveRate | undefined, db: Db, perRequest = false): Promise<Product[]> {
  // Página: una sola consulta trae valores del panel, galerías, cotización y umbral de «Bajo stock» (antes eran cuatro seguidas). La cotización se comparte con la nota de cotización.
  if (perRequest) {
    const data = await pageDataOncePerRequest();
    const rate = await rateOncePerRequest();
    return applyOverrides(catalog.products, data.overrides, rate, data.galleries);
  }
  // Si la cotización venció, este pedido la renueva (con tiempo máximo corto); si falla, usa la guardada.
  const [rate, overrides, galleries] = await Promise.all([fx ? Promise.resolve(fx) : currentRate(db), loadOverrides(db), loadGalleries(db)]);
  return applyOverrides(catalog.products, overrides, rate, galleries);
}

/**
 * Una página llama varias veces a las funciones de abajo (destacados, en stock, colecciones…): cada una armaba el catálogo completo con 3 consultas
 * (cotización, valores del panel y galerías). Dentro de UN mismo pedido de página se arma una sola vez (`cache` de React: vive lo que dura ese pedido,
 * nunca entre pedidos), así un cambio del panel se ve en el pedido siguiente igual que antes. Fuera de una página (rutas de API, scripts, pruebas) no memoriza nada.
 */
const productsOncePerRequest = cache(() => loadAllProducts(undefined, getDb(), true));
export async function listAllProducts(fx?: EffectiveRate, db?: Db): Promise<Product[]> {
  if (!fx && !db) return productsOncePerRequest();
  return loadAllProducts(fx, db ?? getDb());
}
export async function listProducts(db?: Db): Promise<Product[]> {
  return (await listAllProducts(undefined, db)).filter(isListedProduct);
}
export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  // Un adicional conserva su ficha directa para los enlaces del carrito; no se lista públicamente.
  return (await listAllProducts()).find((p) => p.active && p.slug === slug);
}
/** Producto retirado de la oferta pública (su ficha directa responde «retirado», no 404). */
export function getRetiredProductBySlug(slug: string): Product | undefined {
  return catalog.products.find((p) => p.slug === slug && p.retired);
}
/**
 * Colecciones públicas: las que tienen al menos un producto publicado o una lista de cartas. Una colección cuyos únicos productos fueron
 * retirados deja de aparecer en listados, filtros y el inicio (se conserva en el catálogo y su enlace directo responde sin productos).
 */
export async function listExpansions(): Promise<Expansion[]> {
  const active = new Set((await listProducts()).flatMap((p) => p.expansionIds));
  return catalog.expansions.filter((e) => active.has(e.id) || e.cards.length > 0);
}
export function getExpansionBySlug(slug: string): Expansion | undefined {
  return catalog.expansions.find((e) => e.slug === slug);
}
export function getExpansion(id: string): Expansion | undefined {
  return catalog.expansions.find((e) => e.id === id);
}
export async function productsForExpansion(expansionId: string): Promise<Product[]> {
  return (await listProducts()).filter((p) => p.expansionIds.includes(expansionId));
}
export async function relatedProducts(product: Product, limit = 4): Promise<Product[]> {
  return (await listProducts())
    .filter((p) => p.id !== product.id && p.expansionIds.some((e) => product.expansionIds.includes(e)))
    .slice(0, limit);
}
export async function featuredProducts(limit = 4): Promise<Product[]> {
  const all = await listProducts();
  const chosen = (catalog.featuredIds ?? []).map((id) => all.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  if (chosen.length) return chosen.slice(0, limit);
  return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
/** Productos con stock propio confirmado (ver `isInStock`): destacados primero y luego los más recientes. Misma fuente que el filtro «En stock» del catálogo. */
export async function inStockProducts(): Promise<Product[]> {
  const featured = catalog.featuredIds ?? [];
  const rank = (p: Product) => { const i = featured.indexOf(p.id); return i === -1 ? featured.length : i; };
  return (await listProducts()).filter(isInStock).sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
