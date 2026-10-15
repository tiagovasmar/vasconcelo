import { z } from "zod";
import { coverageOf } from "./coverage";
import {
  ExpansionSchema, GuaranteeSchema, ProductSchema, PullRateSchema, SourceSchema,
  type Catalog,
} from "@/content/schema";

export type Issue = { level: "error" | "warning"; where: string; message: string };

const CatalogSchema = z.object({
  sources: z.array(SourceSchema),
  expansions: z.array(ExpansionSchema),
  products: z.array(ProductSchema),
  pullRates: z.array(PullRateSchema),
  guarantees: z.array(GuaranteeSchema),
});

function dups(ids: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const i of ids) (seen.has(i) ? out : seen).add(i);
  return [...out];
}

/** Valida esquema, duplicados, referencias, imágenes, tasas y garantías. `fileExists` se inyecta para poder probar. */
export function validateCatalog(raw: Catalog, fileExists: (publicPath: string) => boolean = () => true): Issue[] {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message });

  const parsed = CatalogSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err(i.path.join("."), i.message);
    return issues; // sin esquema válido no tiene sentido seguir
  }
  const c = parsed.data;

  const cards = c.expansions.flatMap((e) => e.cards);
  const groups: Array<[string, string[]]> = [
    ["fuentes", c.sources.map((s) => s.id)],
    ["expansiones (id)", c.expansions.map((e) => e.id)],
    ["expansiones (slug)", c.expansions.map((e) => e.slug)],
    ["productos (id)", c.products.map((p) => p.id)],
    ["productos (sku)", c.products.map((p) => p.sku)],
    ["productos (slug)", c.products.map((p) => p.slug)],
    ["cartas", cards.map((x) => x.id)],
    ["tasas", c.pullRates.map((r) => r.id)],
    ["garantías", c.guarantees.map((g) => g.id)],
  ];
  for (const [name, ids] of groups) for (const d of dups(ids)) err(name, `duplicado: ${d}`);

  const sourceIds = new Set(c.sources.map((s) => s.id));
  const expById = new Map(c.expansions.map((e) => [e.id, e]));
  const rateIds = new Set(c.pullRates.map((r) => r.id));
  const guaranteeById = new Map(c.guarantees.map((g) => [g.id, g]));
  const productById = new Map(c.products.map((p) => [p.id, p]));
  const checkSources = (where: string, ids: string[]) => {
    for (const s of ids) if (!sourceIds.has(s)) err(where, `fuente inexistente: ${s}`);
  };
  const checkImage = (where: string, img: { src: string; status: "demo" | "reference" | "final" }) => {
    if (fileExists(img.src)) return;
    if (img.status === "demo") warn(where, `imagen de reserva sin archivo: ${img.src}`);
    else err(where, `imagen ${img.status === "final" ? "final" : "de referencia"} inexistente: ${img.src}`);
  };

  for (const e of c.expansions) {
    const w = `expansión ${e.id}`;
    checkSources(w, e.sourceIds);
    if (e.cardListStatus === "complete" && e.cards.length === 0) err(w, "lista completa sin cartas");
    if (e.cardListStatus === "partial" && e.cards.length === 0) err(w, "lista parcial sin cartas (usar estado unavailable)");
    if (e.cardListStatus === "unavailable" && e.cards.length > 0) err(w, "lista unavailable con cartas cargadas");
    if (e.cardListStatus === "complete") {
      // «Completa» solo si los números impresos van de 1 al máximo sin huecos ni repetidos (y coincide con lo que informa la fuente).
      const cov = coverageOf(e.cards.map((c) => c.number));
      if (cov.status !== "complete") err(w, `lista marcada como completa pero con huecos o repetidos en la numeración (faltan ${cov.missing.slice(0, 8).join(", ")}${cov.missing.length > 8 ? "…" : ""})`);
      if (e.officialCardCount !== undefined && e.officialCardCount !== e.cards.length) err(w, `lista completa: la fuente informa ${e.officialCardCount} cartas y hay ${e.cards.length} cargadas`);
    }
    if (e.cardListStatus === "partial" && !e.cardListNote) warn(w, "lista parcial sin nota que documente qué falta");
    if (e.cardListStatus !== "complete" && e.sourceIds.length === 0) warn(w, "lista incompleta sin fuente oficial para enlazar");
    for (const card of e.cards) {
      const cw = `carta ${card.id}`;
      if (card.expansionId !== e.id) err(cw, `expansionId ${card.expansionId} no coincide con ${e.id}`);
      checkSources(cw, card.sourceIds);
      for (const r of card.pullRateIds) if (!rateIds.has(r)) err(cw, `tasa inexistente: ${r}`);
      checkImage(cw, card.image);
    }
  }

  for (const r of c.pullRates) {
    const w = `tasa ${r.id}`;
    const e = expById.get(r.expansionId);
    if (!e) err(w, `expansión inexistente: ${r.expansionId}`);
    else if (e.language !== r.language || e.region !== r.region) err(w, "idioma/región distintos a los de la expansión");
    checkSources(w, r.sourceIds);
    if (r.evidence === "unavailable" && r.probability !== null) err(w, "evidencia unavailable no puede traer un número");
    if (r.evidence !== "unavailable" && r.probability === null) err(w, `evidencia ${r.evidence} requiere probabilidad`);
    if (r.evidence === "official" && r.sourceIds.length === 0) err(w, "tasa oficial sin fuente");
    if (r.evidence === "observed") {
      if (r.sourceIds.length === 0) err(w, "estimación observada sin fuente");
      if (!r.sampleSize || r.observedHits === undefined || !r.sampleUnit || !r.method) {
        err(w, "estimación observada requiere sampleSize, observedHits, sampleUnit y method");
      } else if (r.observedHits > r.sampleSize) err(w, "observedHits mayor que sampleSize");
    }
    if (r.interval && r.interval.low > r.interval.high) err(w, "intervalo invertido");
  }

  for (const g of c.guarantees) {
    const w = `garantía ${g.id}`;
    checkSources(w, g.sourceIds);
    const p = productById.get(g.scope);
    if (!p) err(w, `producto inexistente en scope: ${g.scope}`);
    else {
      if (p.language !== g.language || p.region !== g.region) err(w, "idioma/región distintos a los del producto");
      if (!p.guaranteeIds.includes(g.id)) err(w, `el producto ${p.id} no la referencia`);
    }
    if (g.evidence === "official" && g.sourceIds.length === 0) err(w, "garantía oficial sin fuente");
    if ((g.type === "rarity" || g.type === "composition") && g.evidence !== "official" && g.evidence !== "unverified") {
      err(w, `una garantía de ${g.type === "rarity" ? "rareza" : "composición por sobre"} necesita fuente explícita (official), no composición del vendedor`);
    }
    if (g.evidence === "unverified") warn(w, "garantía sin verificar: no se muestra como promesa");
  }

  // Caja y sobre individual no se duplican: un solo producto activo por expansión + formato + idioma + región.
  const seenKinds = new Map<string, string>();
  for (const p of c.products.filter((x) => x.active)) {
    if (p.expansionIds.length === 0) continue; // kits y cajas especiales: se distinguen por SKU, que ya se comprueba arriba
    const key = [p.expansionIds.join("+"), p.kind, p.variant ?? "", p.language, p.region].join("|");
    const prev = seenKinds.get(key);
    if (prev) err(`producto ${p.id}`, `duplica a ${prev} (misma colección, formato, variante, idioma y región)`);
    else seenKinds.set(key, p.id);
  }

  for (const p of c.products) {
    if (p.retired && p.active) err(`producto ${p.id}`, "retirado pero activo: un producto retirado debe tener active: false");
  }
  for (const p of c.products) {
    const w = `producto ${p.id}`;
    for (const x of p.expansionIds) {
      const e = expById.get(x);
      if (!e) err(w, `expansión inexistente: ${x}`);
      else if (e.language !== p.language || e.region !== p.region) err(w, `idioma/región distintos a los de la expansión ${x}`);
    }
    for (const gId of p.guaranteeIds) {
      const g = guaranteeById.get(gId);
      if (!g) err(w, `garantía inexistente: ${gId}`);
      else if (g.scope !== p.id) err(w, `la garantía ${gId} pertenece a ${g.scope}`);
    }
    for (const pc of p.packComposition ?? []) {
      if (!p.expansionIds.includes(pc.expansionId)) err(w, `packComposition usa ${pc.expansionId}, ausente en expansionIds`);
    }
    if (p.kind === "pack" && p.expansionIds.length > 1 && !p.packComposition) err(w, "pack de varias expansiones requiere packComposition");
    for (const img of p.images) checkImage(w, img);
    // Galería sin relleno: ninguna imagen repetida, y las fotos de la tienda son propias (estado final).
    const seenSrc = new Set<string>();
    for (const img of p.images) {
      if (seenSrc.has(img.src)) err(w, `imagen repetida en la galería: ${img.src}`);
      seenSrc.add(img.src);
      if (img.source === "store" && img.status !== "final") err(w, `foto de la tienda con estado ${img.status}: debe ser final (foto propia)`);
    }
    if (p.rarityReview) checkSources(w, p.rarityReview.sourceIds);
    if (p.rarityReview && !(["box", "special-box", "kit"] as string[]).includes(p.kind)) err(w, "la revisión de rarezas solo aplica a cajas, cajas especiales y kits (no a sobres sueltos)");
    if (p.isDemo && p.active) warn(w, "producto demo activo (bloquea la salida comercial)");
    if (!p.isDemo && p.active && (p.priceMinor === null || p.stockQuantity === null)) warn(w, "precio o stock pendientes: se ve en el sitio pero no se puede consultar con importe");
  }
  return issues;
}
