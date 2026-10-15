import type { Card, Expansion } from "../../schema";
import { demoImage } from "./helpers";

/**
 * Expansiones. Storm Emeralda es real pero su lista de cartas NO está verificada aquí (estado "unavailable").
 * "Set de ejemplo" y "Set parcial de ejemplo" son FICTICIOS: sirven para revisar la galería con lista completa y parcial.
 */
function exampleCards(expansionId: string, slug: string, names: Array<[string, string]>): Card[] {
  return names.map(([name, rarity], i) => {
    const n = String(i + 1).padStart(3, "0");
    return {
      id: `${expansionId}-${n}`,
      expansionId,
      name,
      number: n,
      rarity,
      image: demoImage(`/images/expansions/${slug}/cards/${n}.webp`, `${name}, carta ${n} (ilustración de ejemplo)`, 600, 840),
      sourceIds: [],
      pullRateIds: [],
      isDemo: true,
    };
  });
}

const rarities = ["Común", "Común", "Común", "Poco común", "Poco común", "Rara", "Rara", "Ultra rara"];

export const expansions: Expansion[] = [
  {
    id: "storm-emeralda",
    slug: "storm-emeralda",
    name: "Storm Emeralda",
    code: "M6",
    language: "ja",
    region: "JP",
    summary:
      "Expansión japonesa destacada. Mientras se verifica la lista de cartas, podés consultarla en la fuente oficial.",
    isDemo: false,
    sourceIds: ["pokemon-card-storm", "pokemon-center-storm-box"],
    cardListStatus: "unavailable",
    cards: [],
    tone: "mint",
  },
  {
    id: "set-ejemplo",
    slug: "set-de-ejemplo",
    name: "Set de ejemplo",
    code: "EJ-1",
    language: "en",
    region: "US",
    summary: "Expansión FICTICIA de demostración con lista completa, para revisar la galería, la búsqueda y los filtros de cartas.",
    isDemo: true,
    sourceIds: [],
    cardListStatus: "complete",
    cards: exampleCards(
      "set-ejemplo",
      "set-de-ejemplo",
      Array.from({ length: 26 }, (_, i) => [`Carta de ejemplo ${String.fromCharCode(65 + i)}`, rarities[i % rarities.length]] as [string, string]),
    ),
    tone: "gold",
  },
  {
    id: "set-parcial",
    slug: "set-parcial-de-ejemplo",
    name: "Set parcial de ejemplo",
    code: "EJ-2",
    language: "en",
    region: "US",
    summary: "Expansión FICTICIA de demostración con lista parcial: solo se muestran las cartas cargadas.",
    isDemo: true,
    sourceIds: [],
    cardListStatus: "partial",
    cards: exampleCards("set-parcial", "set-parcial-de-ejemplo", [
      ["Muestra uno", "Común"],
      ["Muestra dos", "Poco común"],
      ["Muestra tres", "Rara"],
      ["Muestra cuatro", "Rara"],
      ["Muestra cinco", "Ultra rara"],
    ]),
    tone: "violet",
  },
];
