import { kindLabel, languageLabel, type Product } from "@/content/schema";
import { SLEEVES_ID, TOPLOADERS_ID } from "@/content/real/accesorios";
import { evaluateCart, maxFor, type LineStatus } from "@/features/inquiries/pricing";
import type { CartItemInput } from "@/features/inquiries/schemas";
import { percentOf } from "@/lib/money";
import { COMBO, COMBO_HEADLINE, type ComboConfig, type Pricing } from "./combo";
import { sellable } from "./sugerencias";

/**
 * Adicionales de la ficha de una caja: sobres con el 10% OFF del combo y protectores (sleeves / top loaders). TODO se calcula en el servidor:
 * qué opciones se ofrecen, sus precios y, antes de agregar, la validación del conjunto contra el catálogo vigente y lo que ya hay en el carrito.
 * El navegador solo muestra lo que recibe; nunca determina un importe ni un cupo.
 */
export type AddonOption = {
  productId: string;
  slug: string;
  title: string;
  /** Nombre corto para las cápsulas («Storm Emeralda», «Sleeves transparentes»). */
  shortTitle: string;
  /** «Japonés», «Inglés»… o null (accesorios). */
  language: string | null;
  /** «Sobre · Japonés» o «Pack de 5 unidades». */
  presentation: string;
  kind: Product["kind"];
  imageSrc: string | null;
  imageAlt: string;
  listPriceMinor: number;
  /** Precio con el 10% OFF del combo (solo sobres elegibles); null en el resto. */
  comboPriceMinor: number | null;
  maxQuantity: number;
  packSize: number | null;
};

export type AddonCatalog = {
  boxId: string;
  headline: string;
  /** ¿La caja participa y la promoción está encendida? Si no, no se anuncia ningún 10% OFF ni se ofrecen sobres. */
  comboActive: boolean;
  perBox: number;
  participatingBoxIds: string[];
  participatingBoosterIds: string[];
  boosters: AddonOption[];
  protection: AddonOption[];
};

type ImageOf = (p: Product) => { src: string | null; alt: string };

const shortOf = (p: Product) => p.title.replace(/\s*·\s*(Sobre|Booster|Pack de.*)$/i, "").trim() || p.title;

function option(p: Product, imageOf: ImageOf, withCombo: boolean): AddonOption {
  const img = imageOf(p);
  const price = p.priceMinor as number;
  return {
    productId: p.id, slug: p.slug, title: p.title, shortTitle: shortOf(p), language: p.language === "na" ? null : languageLabel[p.language],
    presentation: p.packSize ? `Pack de ${p.packSize} unidades` : `${kindLabel[p.kind]}${p.language === "na" ? "" : ` · ${languageLabel[p.language]}`}`,
    kind: p.kind, imageSrc: img.src, imageAlt: img.alt, listPriceMinor: price, comboPriceMinor: withCombo ? price - percentOf(price, COMBO.percent) : null,
    maxQuantity: maxFor(p), packSize: p.packSize ?? null,
  };
}

/** Opciones de la ficha de una caja; null si el producto no es una caja. Solo productos publicados, no retirados, con precio confirmado y stock. */
export function buildAddonCatalog(products: Product[], combo: ComboConfig, box: Product, imageOf: ImageOf): AddonCatalog | null {
  if (box.kind !== "box") return null;
  const byId = new Map(products.map((p) => [p.id, p]));
  const comboActive = combo.enabled && combo.boxIds.includes(box.id) && sellable(box);
  const boosters = comboActive
    ? combo.boosterIds.map((id) => byId.get(id)).filter((p): p is Product => sellable(p) && p.kind === "booster")
      .sort((a, b) => a.title.localeCompare(b.title, "es") || a.id.localeCompare(b.id)).map((p) => option(p, imageOf, true))
    : [];
  const protection = [SLEEVES_ID, TOPLOADERS_ID].map((id) => byId.get(id)).filter((p): p is Product => sellable(p) && p.kind === "accessory").map((p) => option(p, imageOf, false));
  return {
    boxId: box.id, headline: COMBO_HEADLINE, comboActive, perBox: COMBO.boostersPerBox,
    participatingBoxIds: comboActive ? combo.boxIds : [], participatingBoosterIds: comboActive ? boosters.map((b) => b.productId) : [], boosters, protection,
  };
}

export type AddonProblem = {
  productId: string;
  title: string;
  status: LineStatus;
  message: string;
  /** Cantidad que todavía se puede sumar (descontado lo que ya hay en el carrito). */
  room: number;
  unitPriceMinor: number | null;
};

export type AddonPreview = {
  ok: boolean;
  problems: AddonProblem[];
  /** Importes de LO QUE SE AGREGA (diferencia contra el carrito actual), en centavos. */
  breakdown: {
    boxMinor: number; boxUnits: number;
    boostersListMinor: number; boostersUnits: number; boostersDiscountedUnits: number;
    protectionMinor: number; protectionUnits: number;
    savingMinor: number; totalMinor: number;
  };
  combo: Pricing["combo"];
};

const MESSAGES: Partial<Record<LineStatus, string>> = {
  price_changed: "cambió de precio.",
  out_of_stock: "se quedó sin stock.",
  unavailable: "ya no está disponible.",
  retired: "ya no está disponible.",
  pending_commercial: "todavía no tiene precio o stock confirmado.",
  over_limit: "no alcanza para esa cantidad.",
};

/**
 * Valida el conjunto «caja + adicionales» antes de agregarlo al carrito y calcula el desglose de lo que se suma. Usa el MISMO motor que el carrito, el pedido y la consulta
 * (`evaluateCart` + `priceCart`): ficha, panel lateral y mensaje no pueden mostrar números distintos. No reserva ni descuenta stock.
 */
export function previewAddons(products: Product[], combo: ComboConfig, cart: CartItemInput[], add: CartItemInput[]): AddonPreview {
  const addIds = new Set(add.map((a) => a.productId));
  // Una línea por producto, como el carrito: si la línea vieja era un encargo del mismo producto, la compra la reemplaza.
  const kept = cart.filter((c) => !(addIds.has(c.productId) && c.mode === "encargo"));
  const qtyIn = new Map(kept.map((c) => [c.productId, c.quantity]));
  const merged: CartItemInput[] = kept.map((c) => {
    const a = add.find((x) => x.productId === c.productId);
    return a ? { ...c, quantity: c.quantity + a.quantity, expectedPriceMinor: a.expectedPriceMinor ?? c.expectedPriceMinor } : c;
  });
  for (const a of add) if (!qtyIn.has(a.productId)) merged.push({ ...a, mode: "buy" });

  const before = evaluateCart(kept, products, combo);
  const after = evaluateCart(merged, products, combo);
  const problems: AddonProblem[] = [];
  for (const a of add) {
    const line = after.lines.find((l) => l.productId === a.productId);
    const inCart = qtyIn.get(a.productId) ?? 0;
    if (line && line.status !== "ok") {
      const room = Math.max(0, (line.maxQuantity ?? 0) - inCart);
      problems.push({
        productId: a.productId, title: line.product?.title ?? a.productId, status: line.status, room, unitPriceMinor: line.unitPriceMinor ?? null,
        message: `${line.product?.title ?? "Un producto"} ${MESSAGES[line.status] ?? "no se pudo validar."}${line.status === "over_limit" ? ` Podés sumar hasta ${room}.` : ""}`,
      });
    } else if (!line) problems.push({ productId: a.productId, title: a.productId, status: "unavailable", room: 0, unitPriceMinor: null, message: "Un producto ya no está disponible." });
  }

  const pb = before.pricing("");
  const pa = after.pricing("");
  const kindOf = (id: string) => products.find((p) => p.id === id)?.kind;
  const delta = (id: string) => {
    const x = pa.lines.find((l) => l.productId === id);
    const y = pb.lines.find((l) => l.productId === id);
    return { list: (x?.listTotalMinor ?? 0) - (y?.listTotalMinor ?? 0), units: (x?.quantity ?? 0) - (y?.quantity ?? 0), comboUnits: (x?.comboUnits ?? 0) - (y?.comboUnits ?? 0) };
  };
  const b = { boxMinor: 0, boxUnits: 0, boostersListMinor: 0, boostersUnits: 0, boostersDiscountedUnits: 0, protectionMinor: 0, protectionUnits: 0 };
  for (const a of add) {
    const d = delta(a.productId);
    const k = kindOf(a.productId);
    if (k === "box") { b.boxMinor += d.list; b.boxUnits += d.units; }
    else if (k === "booster") { b.boostersListMinor += d.list; b.boostersUnits += d.units; b.boostersDiscountedUnits += d.comboUnits; }
    else if (k === "accessory") { b.protectionMinor += d.list; b.protectionUnits += d.units; }
  }
  const savingMinor = pa.comboDiscountMinor - pb.comboDiscountMinor;
  return { ok: problems.length === 0, problems, breakdown: { ...b, savingMinor, totalMinor: pa.totalMinor - pb.totalMinor }, combo: pa.combo };
}
