import type { Guarantee, Product, PullRate, Source } from "@/content/schema";

/** Muestra una probabilidad. null = dato desconocido: NUNCA se muestra como 0%. */
export function formatProbability(p: number | null): string {
  if (p === null) return "Dato no disponible";
  const pct = p * 100;
  const text = pct >= 10 ? pct.toFixed(1) : pct >= 1 ? pct.toFixed(2) : pct.toFixed(3);
  return `${text.replace(".", ",")} %`;
}

/** Una tasa solo se muestra en el formato al que corresponde: por sobre → sobres/packs; por caja → cajas/bundles. */
export function unitForProduct(kind: Product["kind"]): PullRate["unit"] {
  return kind === "box" || kind === "bundle" ? "box" : "booster";
}

/** Tasas aplicables: misma expansión, idioma, región y unidad del producto. No se trasladan entre idiomas, regiones ni formatos. */
export function ratesForProduct(product: Product, rates: PullRate[]): PullRate[] {
  const unit = unitForProduct(product.kind);
  return rates.filter(
    (r) => product.expansionIds.includes(r.expansionId) && r.language === product.language && r.region === product.region && r.unit === unit,
  );
}

export const evidenceLabel: Record<PullRate["evidence"], string> = {
  official: "Dato oficial",
  observed: "Estimación observada",
  unavailable: "Dato no disponible",
};

export const unitLabel: Record<PullRate["unit"], string> = { booster: "por sobre", box: "por caja" };

export type GuaranteeView = { physical: Guarantee[]; promos: Guarantee[]; composition: Guarantee[]; rarity: Guarantee[]; unverifiedCount: number };

/** Separa cantidades físicas, promos fijas y garantías de rareza. Las no verificadas nunca se presentan como promesa. */
export function groupGuarantees(list: Guarantee[]): GuaranteeView {
  const verified = list.filter((g) => g.evidence !== "unverified");
  return {
    physical: verified.filter((g) => g.type === "physical_contents"),
    promos: verified.filter((g) => g.type === "fixed_promo"),
    composition: verified.filter((g) => g.type === "composition" && g.evidence === "official"),
    rarity: verified.filter((g) => g.type === "rarity" && g.evidence === "official"),
    unverifiedCount: list.length - verified.length,
  };
}

export function sourcesFor(ids: string[], all: Source[]): Source[] {
  const set = new Set(ids);
  return all.filter((s) => set.has(s.id));
}
