import { languageLabel, languages, kindLabel, kindSlug, productKinds, type Expansion, type Product } from "@/content/schema";
import { isInStock } from "./commercial";

export type Sort = "nuevos" | "precio-asc" | "precio-desc";
export type Availability = "todos" | "stock";

export type CatalogQuery = {
  q: string;
  kind: Product["kind"] | "";
  language: Product["language"] | "";
  expansion: string;
  availability: Availability;
  /** Pesos enteros (no centavos); vacío = sin límite. */
  minPrice: number | null;
  maxPrice: number | null;
  sort: Sort;
  page: number;
};

export const PAGE_SIZE = 12;
export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const kinds = productKinds;
const langs = languages;
/** Alias legibles en la URL (los enlaces del inicio usan sobre/pack/caja). */
const kindAlias: Record<string, Product["kind"]> = { sobre: "booster", pack: "pack", caja: "box", bundle: "bundle", kit: "kit", especial: "special-box", ilustraciones: "illustration-set", accesorios: "accessory", accesorio: "accessory", accessory: "accessory", booster: "booster", box: "box", "special-box": "special-box", "illustration-set": "illustration-set" };

function money(v: string): number | null {
  if (!/^\d{1,9}$/.test(v)) return null;
  return Number(v);
}

export function parseQuery(raw: RawParams): CatalogQuery {
  const kind = kindAlias[first(raw.formato).toLowerCase()] ?? "";
  const language = (langs as readonly string[]).includes(first(raw.idioma)) ? (first(raw.idioma) as CatalogQuery["language"]) : "";
  const sort = (["precio-asc", "precio-desc"] as const).find((s) => s === first(raw.orden)) ?? "nuevos";
  const page = Math.max(1, Math.floor(Number(first(raw.pagina))) || 1);
  return {
    q: first(raw.q).trim().slice(0, 80),
    kind: (kinds as readonly string[]).includes(kind) ? kind : "",
    language,
    expansion: first(raw.expansion).slice(0, 60),
    availability: first(raw.disp) === "stock" ? "stock" : "todos",
    minPrice: money(first(raw.pmin)),
    maxPrice: money(first(raw.pmax)),
    sort,
    page,
  };
}

/** Serializa solo lo que difiere del valor por defecto, para URLs cortas y compartibles. */
export function toSearchParams(q: Partial<CatalogQuery>): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.kind) p.set("formato", kindSlug[q.kind]);
  if (q.language) p.set("idioma", q.language);
  if (q.expansion) p.set("expansion", q.expansion);
  if (q.availability === "stock") p.set("disp", "stock");
  if (q.minPrice !== null && q.minPrice !== undefined) p.set("pmin", String(q.minPrice));
  if (q.maxPrice !== null && q.maxPrice !== undefined) p.set("pmax", String(q.maxPrice));
  if (q.sort && q.sort !== "nuevos") p.set("orden", q.sort);
  if (q.page && q.page > 1) p.set("pagina", String(q.page));
  return p;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function isAvailable(p: Product): boolean {
  return isInStock(p);
}

/** Texto buscable: nombre, expansión (nombre y código), SKU, formato, idioma y términos alternativos del producto. */
export function searchText(p: Product, expansions: Expansion[]): string {
  const ex = expansions.filter((e) => p.expansionIds.includes(e.id)).flatMap((e) => [e.name, e.originalName ?? "", e.code ?? "", ...(e.aliases ?? [])]);
  return norm([p.title, p.sku, ...ex, kindLabel[p.kind], languageLabel[p.language], p.variant ?? "", p.originalTitle ?? "", ...(p.aliases ?? [])].join(" "));
}

export function filterProducts(all: Product[], expansions: Expansion[], q: CatalogQuery): Product[] {
  const terms = norm(q.q).split(/\s+/).filter(Boolean);
  const out = all.filter((p) => {
    if (!p.active) return false;
    if (q.kind && p.kind !== q.kind) return false;
    if (q.language && p.language !== q.language) return false;
    if (q.expansion && !p.expansionIds.includes(q.expansion)) return false;
    if (q.availability === "stock" && !isAvailable(p)) return false;
    // Un precio pendiente no se puede comparar: con un rango de precio activo, esos productos no entran.
    if ((q.minPrice !== null || q.maxPrice !== null) && p.priceMinor === null) return false;
    const pesos = (p.priceMinor ?? 0) / 100;
    if (q.minPrice !== null && pesos < q.minPrice) return false;
    if (q.maxPrice !== null && pesos > q.maxPrice) return false;
    if (terms.length) {
      const hay = searchText(p, expansions);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const sorted = [...out];
  // Los precios pendientes van siempre al final (no son $0).
  const byPrice = (dir: 1 | -1) => (a: Product, b: Product) => {
    if (a.priceMinor === null || b.priceMinor === null) return a.priceMinor === b.priceMinor ? a.id.localeCompare(b.id) : a.priceMinor === null ? 1 : -1;
    return dir * (a.priceMinor - b.priceMinor) || a.id.localeCompare(b.id);
  };
  if (q.sort === "precio-asc") sorted.sort(byPrice(1));
  else if (q.sort === "precio-desc") sorted.sort(byPrice(-1));
  // Los accesorios van al final del orden por defecto: el catálogo se abre con los productos sellados y los accesorios se encuentran con el formato «Accesorios».
  else sorted.sort((a, b) => Number(a.kind === "accessory") - Number(b.kind === "accessory") || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return sorted;
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages, total: items.length, from: items.length ? start + 1 : 0, to: Math.min(start + size, items.length) };
}

export function hasActiveFilters(q: CatalogQuery): boolean {
  return Boolean(q.q || q.kind || q.language || q.expansion || q.availability === "stock" || q.minPrice !== null || q.maxPrice !== null);
}
