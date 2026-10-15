import type { PullRate } from "../../schema";

/**
 * Tasas de aparición. NO se carga ningún porcentaje sin evidencia: hoy no existe ninguna fuente verificada para
 * los productos del catálogo, por lo que solo hay registros "unavailable" (dato no disponible, nunca 0%).
 */
export const pullRates: PullRate[] = [
  {
    id: "pr-storm-sar",
    expansionId: "storm-emeralda",
    language: "ja",
    region: "JP",
    target: { kind: "rarity", id: "SAR" },
    unit: "box",
    productScope: "storm-caja",
    probability: null,
    evidence: "unavailable",
    sourceIds: [],
    reviewedAt: "2026-10-12",
  },
  {
    id: "pr-storm-sobre",
    expansionId: "storm-emeralda",
    language: "ja",
    region: "JP",
    target: { kind: "rarity", id: "SAR" },
    unit: "booster",
    productScope: "storm-sobre",
    probability: null,
    evidence: "unavailable",
    sourceIds: [],
    reviewedAt: "2026-10-12",
  },
  {
    id: "pr-ejemplo-ultra",
    expansionId: "set-ejemplo",
    language: "en",
    region: "US",
    target: { kind: "rarity", id: "Ultra rara" },
    unit: "booster",
    productScope: "ejemplo-sobre",
    probability: null,
    evidence: "unavailable",
    sourceIds: [],
    reviewedAt: "2026-10-12",
  },
  {
    id: "pr-ejemplo-ultra-box",
    expansionId: "set-ejemplo",
    language: "en",
    region: "US",
    target: { kind: "rarity", id: "Ultra rara" },
    unit: "box",
    productScope: "ejemplo-caja",
    probability: null,
    evidence: "unavailable",
    sourceIds: [],
    reviewedAt: "2026-10-12",
  },
];
