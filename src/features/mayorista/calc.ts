import { usdToArsMinor } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";

/**
 * Cálculo mayorista PURO (sin base de datos ni servidor): lo usan el servidor, que es quien decide, y el navegador, solo para mostrar el total mientras la persona elige cantidades.
 * El importe que cuenta es siempre el que vuelve a calcular el servidor al crear el pedido.
 */
/** Referencia interna: costo final × 1,5 (recargo del 50% sobre el costo). Entero, mitades hacia arriba. null si no hay costo. */
export const suggestedFromCost = (costMinor: number | null | undefined): number | null => (costMinor && costMinor > 0 ? Math.floor((costMinor * 3 + 1) / 2) : null);

export type WholesaleRules = {
  /** Compra mínima en unidades (null = sin definir). */
  minUnits: number | null;
  minBoxes?: number | null;
  /** Compra mínima en pesos (centavos; null = sin definir). */
  minAmountMinor: number | null;
  /** producto = cada producto llega a su propio tramo · pedido = las unidades de todos los productos suman para el tramo y el mínimo. null = sin definir. */
  combine: "producto" | "pedido" | null;
  /** Demora estimada y desde cuándo se cuenta, SIN fechas garantizadas (null = sin definir). */
  delayText: string | null;
  delayFrom: string | null;
  /** Textos definidos por el dueño; null mientras sigan pendientes. */
  refundPeriod: string | null;
  cancellationPolicy: string | null;
  /** Interruptor final del dueño. */
  open: boolean;
};

/** Qué falta definir para abrir el catálogo (el mínimo puede ser en unidades o en importe, pero tiene que haber alguno). */
export function missingForOpening(r: Pick<WholesaleRules, "minBoxes" | "minUnits" | "minAmountMinor" | "combine" | "delayText" | "delayFrom" | "refundPeriod" | "cancellationPolicy">, publishedTiers: number): string[] {
  const out: string[] = [];
  if (r.minBoxes == null && r.minUnits === null && r.minAmountMinor === null) out.push("la compra mínima");
  if (r.combine === null) out.push("si los productos se combinan para alcanzar el mínimo y cada tramo");
  if (!r.delayText || !r.delayFrom) out.push("la demora estimada y desde cuándo se cuenta");
  if (!r.refundPeriod) out.push("el plazo de reintegro");
  if (!r.cancellationPolicy) out.push("las condiciones de cancelación");
  if (publishedTiers === 0) out.push("al menos un tramo de precios publicado");
  return out;
}

export type Tier = { minQty: number; unitPriceUsdMinor: number };
/** Tramo que rige para una cantidad: el de mayor cantidad mínima que no la supere. null = «A cotizar» (no llega al primer tramo o no hay tramos). */
export function tierFor(tiers: Tier[], qty: number): Tier | null {
  let best: Tier | null = null;
  for (const t of tiers) if (t.minQty <= qty && (!best || t.minQty > best.minQty)) best = t;
  return best;
}

export type WholesaleRow = {
  productId: string; slug: string; sku: string; title: string; language: string; kind: string; image: { src: string; alt: string } | null;
  /** Precios por tramo en USD y en pesos (conversión única del sitio). */
  tiers: Array<{ minQty: number; unitUsdMinor: number; unitArsMinor: number | null }>;
};

/** Primer tramo publicado: precio base por producto, independiente del descuento por volumen. */
export function baseTier(row: WholesaleRow) {
  return row.tiers.reduce<WholesaleRow["tiers"][number] | null>((first, tier) => !first || tier.minQty < first.minQty ? tier : first, null);
}
export function hasBasePrice(row: WholesaleRow): boolean {
  const tier = baseTier(row);
  return !!tier && Number.isSafeInteger(tier.unitUsdMinor) && tier.unitUsdMinor > 0;
}

export type QuoteLine = { productId: string; quantity: number };
export type Quote = {
  lines: Array<{ productId: string; title: string; quantity: number; tier: Tier | null; unitUsdMinor: number | null; unitArsMinor: number | null; totalArsMinor: number | null; status: "ok" | "a_cotizar" }>;
  units: number; totalArsMinor: number; problems: string[]; ok: boolean;
};

/** Cotiza un pedido mayorista en el servidor: tramo por cantidad (según la regla de combinación), mínimos y «A cotizar». Los importes del navegador no cuentan. */
export function quote(rows: WholesaleRow[], rules: WholesaleRules, lines: QuoteLine[], rate10k: number | null): Quote {
  const units = lines.reduce((n, l) => n + l.quantity, 0);
  const out: Quote["lines"] = [];
  const problems: string[] = [];
  for (const l of lines) {
    const row = rows.find((r) => r.productId === l.productId);
    if (!row) { problems.push("Hay productos que no están en el catálogo mayorista."); continue; }
    const tiers = row.tiers.map((t) => ({ minQty: t.minQty, unitPriceUsdMinor: t.unitUsdMinor }));
    const basis = rules.combine === "pedido" ? units : l.quantity;
    const tier = tierFor(tiers, basis);
    const usd = tier?.unitPriceUsdMinor ?? null;
    const ars = usd !== null && rate10k ? usdToArsMinor(usd, rate10k) : null;
    out.push({ productId: l.productId, title: row.title, quantity: l.quantity, tier, unitUsdMinor: usd, unitArsMinor: ars, totalArsMinor: ars === null ? null : ars * l.quantity, status: ars === null ? "a_cotizar" : "ok" });
  }
  const total = out.reduce((n, l) => n + (l.totalArsMinor ?? 0), 0);
  const boxes = lines.reduce((n, l) => rows.some((r) => r.productId === l.productId && r.kind === "box") ? n + l.quantity : n, 0);
  if (rules.minBoxes != null && boxes < rules.minBoxes) problems.push(`La compra mínima es de ${rules.minBoxes} cajas (llevás ${boxes}).`);
  if (rules.minUnits !== null && units < rules.minUnits) problems.push(`La compra mínima es de ${rules.minUnits} unidades (llevás ${units}).`);
  if (rules.minAmountMinor !== null && total < rules.minAmountMinor) problems.push(`La compra mínima es de ${formatARS(rules.minAmountMinor)} (llevás ${formatARS(total)}).`);
  if (out.some((l) => l.status === "a_cotizar")) problems.push("Hay productos «A cotizar»: no llegan al primer tramo de precios o no tienen precio. Subí la cantidad o consultanos.");
  return { lines: out, units, totalArsMinor: total, problems, ok: problems.length === 0 && out.length === lines.length && lines.length > 0 };
}

