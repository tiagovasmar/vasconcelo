import type { Guarantee, Product } from "@/content/schema";

/**
 * Textos y reglas de presentación de «qué garantiza» un producto. Una sola fuente para la ficha: el resumen cerca del precio y el
 * detalle desplegable salen de los mismos datos (contenido físico, garantías documentadas y revisión de rarezas del producto).
 */

/** Formatos que llevan el encabezado «Qué garantiza…» (cajas y kits). Los sobres sueltos NO lo llevan. */
export const tituloGarantia: Partial<Record<Product["kind"], string>> = {
  box: "Qué garantiza esta caja",
  "special-box": "Qué garantiza esta caja especial",
  kit: "Qué incluye este kit",
};
export const conRarezas = (p: Pick<Product, "kind">) => p.kind in tituloGarantia;
export const tituloContenido = (p: Pick<Product, "kind">) => tituloGarantia[p.kind] ?? (p.kind === "booster" ? "Contenido del sobre" : "Qué incluye");

export const cantidadLabel = { fixed: "Cantidad fija", minimum: "Mínimo garantizado", alternatives: "Una de varias alternativas" } as const;

/**
 * Qué es aleatorio y qué no, SOLO a partir de lo documentado en la ficha: no se declara aleatorio el mazo ni los accesorios de un kit.
 */
export function aleatoriedad(p: Pick<Product, "kind">): string {
  switch (p.kind) {
    case "booster":
      return "Las cartas de cada sobre son aleatorias: no se garantiza ninguna carta concreta ni una rareza.";
    case "box":
    case "pack":
    case "bundle":
      return "Las cartas de los sobres son aleatorias: no se garantiza ninguna carta concreta ni una rareza, salvo lo que figure como garantizado más abajo.";
    case "kit":
      return "El mazo, los accesorios y las guías son fijos. Son aleatorias las cartas de los sobres y, donde se indica, el diseño de las fundas de arte.";
    case "special-box":
      return "Los accesorios son fijos. Son aleatorias las cartas de los sobres y la que salga dentro de cada tipo indicado.";
    case "illustration-set":
      return "La carta de ilustración especial es una de varias posibles, al azar; el marco y el sobre son fijos y las cartas del sobre son aleatorias.";
    case "accessory":
      return "Son protectores para cartas: no incluyen cartas y no hay nada aleatorio.";
  }
}

/** Garantías agrupadas para el resumen: composición/promos fijas por sobre y rarezas documentadas. */
export function agruparResumen(guarantees: Guarantee[]) {
  const comp = guarantees.filter((g) => g.type === "composition" || g.type === "fixed_promo");
  const rarezas = guarantees.filter((g) => g.type === "rarity" && g.evidence !== "unverified");
  const fisico = guarantees.filter((g) => g.type === "physical_contents");
  const sinVerificar = guarantees.filter((g) => g.evidence === "unverified").length;
  return { comp, rarezas, fisico, sinVerificar };
}
