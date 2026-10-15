import type { Guarantee } from "../schema";
import lote from "../colecciones/origen/colecciones.json";
import { products } from "./products";

/**
 * Garantías de COMPOSICIÓN con su alcance exacto, por producto (caja y sobre por separado). Solo contenido físico
 * verificado en las fichas oficiales y texto leído en el envase oficial. NO se incluyen:
 *  · las promociones de compra de Pokémon Center (p. ej. el promo del concurso de Heat Wave Arena): no son contenido del SKU;
 *  · la AR garantizada del formato Deluxe de Black Bolt / White Flare: este catálogo vende el formato estándar;
 *  · ninguna garantía de rareza (SR/SAR/UR…) ni probabilidad: no están verificadas.
 */
type Comp = { key: string; statement: string; sources: string[]; quantityKind?: "fixed" | "minimum" | "alternatives" };

const composicion: Record<string, Comp[]> = {
  "black-bolt": [{ key: "2-brillantes", statement: "Cada sobre incluye 2 cartas con acabado brillante (キラ), según el texto del envase («必ず2枚キラカード»). No indica qué cartas son ni su rareza: dos cartas brillantes no equivalen a dos AR ni a una cantidad de AR por caja.", sources: ["envase-black-bolt"] }],
  "white-flare": [{ key: "2-brillantes", statement: "Cada sobre incluye 2 cartas con acabado brillante (キラ), según el texto del envase («必ず2枚キラカード»). No indica qué cartas son ni su rareza: dos cartas brillantes no equivalen a dos AR ni a una cantidad de AR por caja.", sources: ["envase-white-flare"] }],
  "mega-dream-ex": [{ key: "1-ex", statement: "Cada sobre incluye 1 carta Pokémon ex o Mega Evolution ex, según el texto del envase («ポケモンexまたはメガシンカex 1枚確定！»). No es una carta concreta ni una SAR. Es una de dos alternativas (ex o Mega Evolution ex): no se suman.", sources: ["envase-mega-dream-ex", "box-mega-dream-ex"], quantityKind: "alternatives" }],
  "30th-celebration": [
    { key: "pikachu-energia", statement: "Cada sobre de 6 cartas incluye 1 carta especial de Pikachu del 30.º aniversario y 1 carta de Energía básica. No garantiza una ilustración concreta de Pikachu.", sources: ["box-30th-celebration", "exp-30th-celebration"] },
    { key: "todas-brillantes", statement: "Las 6 cartas de cada sobre tienen acabado brillante (キラ), según el envase («すべてがキラカード！») y la página oficial de la expansión.", sources: ["envase-30th-celebration", "exp-30th-celebration"] },
  ],
};

export const guarantees: Guarantee[] = products.flatMap((p) => {
  const col = lote.collections.find((c) => c.id === p.expansionIds[0])!;
  const { cardsPerBooster: m, boostersPerBox: n } = col.physicalContents;
  const isBox = p.kind === "box";
  const base = { scope: p.id, language: "ja" as const, region: "JP", evidence: "official" as const, reviewedAt: "2026-10-12" };
  const list: Guarantee[] = [
    isBox
      ? { ...base, id: `g-${p.id}-contenido`, type: "physical_contents", quantityKind: "fixed" as const, statement: `${n} sobres por caja, de ${m} cartas cada uno (${n * m} posiciones de carta). Las cartas vienen al azar: no implica cartas todas distintas.`, sourceIds: [`box-${col.id}`] }
      : { ...base, id: `g-${p.id}-contenido`, type: "physical_contents", quantityKind: "fixed" as const, statement: `${m} cartas por sobre, al azar.`, sourceIds: [`exp-${col.id}`, `box-${col.id}`] },
  ];
  for (const c of composicion[col.id] ?? []) {
    list.push({ ...base, id: `g-${p.id}-${c.key}`, type: "composition", quantityKind: c.quantityKind ?? "fixed", statement: isBox ? c.statement.replace(/^Cada sobre/, "Cada sobre de la caja").replace(/^Las 6 cartas de cada sobre/, "Las 6 cartas de cada sobre de la caja") : c.statement, sourceIds: c.sources });
  }
  return list;
});

// Cada producto referencia sus garantías (sin duplicar datos).
for (const p of products) p.guaranteeIds = guarantees.filter((g) => g.scope === p.id).map((g) => g.id);
