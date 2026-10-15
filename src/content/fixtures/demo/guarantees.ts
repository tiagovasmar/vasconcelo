import type { Guarantee } from "../../schema";

/** Garantías por producto. Solo se afirma lo que tiene fuente o es composición propia del vendedor. */
export const guarantees: Guarantee[] = [
  {
    id: "g-storm-caja-fisico",
    scope: "storm-caja",
    language: "ja",
    region: "JP",
    statement: "30 sobres de 5 cartas por caja. El contenido de los sobres es aleatorio.",
    type: "physical_contents",
    evidence: "official",
    sourceIds: ["pokemon-center-storm-box"],
    reviewedAt: "2026-10-12",
  },
  {
    id: "g-storm-pack-composicion",
    scope: "storm-pack5",
    language: "ja",
    region: "JP",
    statement: "5 sobres sellados de Storm Emeralda (JP), armados por la tienda. Es una composición propia: no hereda garantías de una caja de fábrica.",
    type: "physical_contents",
    evidence: "seller_pack_contents",
    sourceIds: [],
    reviewedAt: "2026-10-12",
  },
  {
    id: "g-ejemplo-pack-mixto",
    scope: "ejemplo-pack-mixto",
    language: "en",
    region: "US",
    statement: "3 sobres del Set de ejemplo + 2 sobres del Set parcial de ejemplo, armados por la tienda (datos ficticios de demostración).",
    type: "physical_contents",
    evidence: "seller_pack_contents",
    sourceIds: [],
    reviewedAt: "2026-10-12",
  },
  {
    id: "g-ejemplo-caja-rareza",
    scope: "ejemplo-caja",
    language: "en",
    region: "US",
    statement: "Afirmación de ejemplo sin fuente sobre una rareza por caja.",
    type: "rarity",
    evidence: "unverified",
    sourceIds: [],
    reviewedAt: "2026-10-12",
  },
];
