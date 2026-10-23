import { kindLabel, languageLabel, type Product } from "@/content/schema";
import { maxFor } from "@/features/inquiries/pricing";
import { percentOf } from "@/lib/money";
import { SLEEVES_ID, TOPLOADERS_ID } from "@/content/real/accesorios";
import { COMBO, type ComboConfig, type Pricing } from "./combo";

/**
 * Sugerencias del carrito lateral («Completá tu compra»), calculadas en el SERVIDOR y deterministas: con el mismo carrito y el mismo catálogo salen siempre
 * las mismas, en el mismo orden (nada de azar ni de orden de carga), para que el panel no reordene controles por su cuenta.
 *
 * Reglas:
 *  - Solo productos publicados, no retirados, que se venden de stock, con precio confirmado y stock cargado. Nunca uno que ya está en el carrito.
 *  - Hasta 3. Sin protección en el carrito se prioriza la sleeve; después se intercalan sobres elegibles del combo (solo si hay una caja participante
 *    y quedan cupos libres) y el top loader: nunca quedan solo sobres si hay un accesorio disponible.
 *  - Con una sleeve en el carrito se sugiere el top loader (y al revés: con un top loader, la sleeve, porque se usan juntos).
 *  - El precio de un sobre con la promoción es exacto: si se sugiere es porque quedan cupos libres, y un sobre más los usaría.
 */
export type Suggestion = {
  productId: string;
  slug: string;
  title: string;
  /** «Pack de 5 unidades» o «Sobre · Japonés». */
  presentation: string;
  kind: Product["kind"];
  reason: string;
  priceMinor: number;
  /** Precio con el 10% OFF del combo (solo sobres elegibles); null en el resto. */
  comboPriceMinor: number | null;
  imageSrc: string | null;
  imageAlt: string;
  maxQuantity: number;
  packSize: number | null;
};

export const REASON_SLEEVE = "Protegé tus cartas desde que abrís los sobres.";
export const REASON_TOPLOADER = "Protección rígida para tus mejores cartas. Usalos con una sleeve.";
export const REASON_BOOSTER = "Sumalo con 10% OFF: depende de los cupos disponibles de tus cajas.";
export const MAX_SUGGESTIONS = 3;

export const sellable = (p: Product | undefined): p is Product => Boolean(p && p.active && !p.retired && !p.orderOnly && p.priceMinor !== null && p.stockQuantity !== null && p.stockQuantity > 0 && maxFor(p) > 0);

export function buildSuggestions(products: Product[], cartIds: string[], pricing: Pricing, combo: ComboConfig, imageOf: (p: Product) => { src: string | null; alt: string }): Suggestion[] {
  const inCart = new Set(cartIds);
  const byId = new Map(products.map((p) => [p.id, p]));
  const make = (p: Product, reason: string, comboPrice: boolean): Suggestion => {
    const img = imageOf(p);
    const price = p.priceMinor as number;
    return {
      productId: p.id, slug: p.slug, title: p.title, kind: p.kind, reason,
      presentation: p.packSize ? `Pack de ${p.packSize} unidades` : `${kindLabel[p.kind]}${p.language === "na" ? "" : ` · ${languageLabel[p.language]}`}`,
      priceMinor: price, comboPriceMinor: comboPrice ? price - percentOf(price, COMBO.percent) : null,
      imageSrc: img.src, imageAlt: img.alt, maxQuantity: maxFor(p), packSize: p.packSize ?? null,
    };
  };

  const sleeve = byId.get(SLEEVES_ID);
  const toploader = byId.get(TOPLOADERS_ID);
  const hasSleeve = inCart.has(SLEEVES_ID);
  const hasTop = inCart.has(TOPLOADERS_ID);
  const accessories: Suggestion[] = [];
  const addSleeve = () => sellable(sleeve) && !hasSleeve && accessories.push(make(sleeve, REASON_SLEEVE, false));
  const addTop = () => sellable(toploader) && !hasTop && accessories.push(make(toploader, REASON_TOPLOADER, false));
  if (!hasSleeve && !hasTop) { addSleeve(); addTop(); } // sin protección: primero la sleeve
  else if (hasSleeve) addTop(); // con sleeve: el top loader se usa junto
  else addSleeve(); // con top loader: falta la sleeve

  // Sobres elegibles: solo con una caja participante en el carrito y cupos libres; mayor precio primero (la misma regla estable del reparto).
  const boosters: Suggestion[] = [];
  if (combo.enabled && pricing.combo.boxes > 0 && pricing.combo.freeSlots > 0) {
    const cands = combo.boosterIds.map((id) => byId.get(id)).filter((p): p is Product => sellable(p) && p.kind === "booster" && !inCart.has(p.id));
    cands.sort((a, b) => (b.priceMinor as number) - (a.priceMinor as number) || a.id.localeCompare(b.id));
    for (const p of cands.slice(0, MAX_SUGGESTIONS)) boosters.push(make(p, REASON_BOOSTER, true));
  }

  // Se intercalan para no mostrar únicamente sobres: accesorio, sobre, accesorio, sobre…
  const out: Suggestion[] = [];
  for (let i = 0; out.length < MAX_SUGGESTIONS && (i < accessories.length || i < boosters.length); i++) {
    if (accessories[i]) out.push(accessories[i]);
    if (out.length < MAX_SUGGESTIONS && boosters[i]) out.push(boosters[i]);
  }
  return out;
}
