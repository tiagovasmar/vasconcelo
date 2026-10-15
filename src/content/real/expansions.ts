import type { Card, Expansion } from "../schema";
import { coverageOf, formatRanges } from "@/features/catalog/coverage";
import { rarityFromIcon } from "@/features/catalog/rarity";
import lote from "../colecciones/origen/colecciones.json";
import blackBolt from "../colecciones/cartas/black-bolt.json";
import whiteFlare from "../colecciones/cartas/white-flare.json";
import heatWave from "../colecciones/cartas/heat-wave-arena.json";
import infernoX from "../colecciones/cartas/inferno-x.json";
import megaDream from "../colecciones/cartas/mega-dream-ex.json";
import celebration from "../colecciones/cartas/30th-celebration.json";
import storm from "../colecciones/cartas/storm-emeralda.json";
import abyss from "../colecciones/cartas/abyss-eye.json";

type CartasJson = { collectionId: string; officialCount: number; fetchedAt: string; cards: Array<{ cardId: string; name: string; number: string | null; total: string | null; setMark: string | null; rarityIcon: string | null }> };
const cartasPorColeccion: Record<string, CartasJson> = {
  "black-bolt": blackBolt, "white-flare": whiteFlare, "heat-wave-arena": heatWave, "inferno-x": infernoX,
  "mega-dream-ex": megaDream, "30th-celebration": celebration, "storm-emeralda": storm, "abyss-eye": abyss,
};

/** Tono visual de apoyo (solo afecta a ilustraciones de reserva y detalles de color). */
const tones: Record<string, Expansion["tone"]> = {
  "black-bolt": "ink", "white-flare": "paper", "heat-wave-arena": "gold", "inferno-x": "paper",
  "mega-dream-ex": "gold", "30th-celebration": "gold", "storm-emeralda": "mint", "abyss-eye": "violet",
};

const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} de ${meses[m - 1]} de ${y}`; };
const pad = (n: string) => n.padStart(3, "0");

const NOTA_RAREZA = "La rareza figura según el ícono del buscador oficial; donde la fuente no muestra ícono no se informa (no se infiere).";
const NOTA_VARIANTES = "Las variantes de acabado (por ejemplo, espejo) no figuran como entradas separadas en esa fuente y no se listan.";

export function buildCards(expansionId: string, nombre: string, json: CartasJson): Card[] {
  const cards = json.cards.map((c) => {
    const number = c.number ? pad(c.number) : "S/N";
    return {
      id: `${expansionId}-${c.cardId}`,
      expansionId,
      name: c.name.normalize("NFC"),
      number,
      rarity: rarityFromIcon(c.rarityIcon),
      image: {
        src: `/images/expansions/${expansionId}/cards/${c.cardId}.webp`,
        alt: `${c.name.normalize("NFC")}, carta ${number} de ${nombre} (imagen oficial de referencia)`,
        width: 360,
        height: 504,
        status: "reference" as const,
        origin: `Buscador oficial de cartas (pokemon-card.com), ficha de la carta ${c.cardId}`,
        license: "Sin permiso de uso concedido por el enlace de origen (referencia)",
      },
      sourceIds: [`cartas-${expansionId}`],
      pullRateIds: [],
      isDemo: false,
    } satisfies Card;
  });
  // por número impreso; las cartas sin número (p. ej. Energías básicas) van al final
  return cards.sort((a, b) => (a.number === "S/N" ? 1 : b.number === "S/N" ? -1 : a.number.localeCompare(b.number)) || a.name.localeCompare(b.name));
}

export const expansions: Expansion[] = lote.collections.map((c) => {
  const json = cartasPorColeccion[c.id];
  const cards = buildCards(c.id, c.displayName, json);
  const cov = coverageOf(json.cards.map((x) => x.number));
  const cardListStatus = cov.status;
  const base = `Fuente: buscador oficial de cartas (consultado el ${fechaLarga(json.fetchedAt)}), ${cards.length} cartas.`;
  const cardListNote =
    cardListStatus === "complete"
      ? `${base} Los números van de 001 a ${pad(String(cov.maxNumber))} sin huecos, incluidas las secretas numeradas${cov.unnumbered ? `; además figuran ${cov.unnumbered} cartas sin número (Energías básicas)` : ""}. ${NOTA_VARIANTES} ${NOTA_RAREZA}`
      : `${base} Faltan en esa lista los números ${formatRanges(cov.missing)}: no se pudieron verificar y por eso no se muestran. ${cov.unnumbered ? `Figuran además ${cov.unnumbered} cartas sin número (Energías básicas). ` : ""}${NOTA_VARIANTES} ${NOTA_RAREZA}`;
  return {
    id: c.id,
    slug: c.id,
    name: c.displayName,
    code: c.code,
    language: "ja",
    region: "JP",
    japaneseName: c.japaneseName,
    series: c.series,
    releaseDate: c.releaseDate,
    summary: `Expansión japonesa de ${c.series} (${c.code}), lanzada el ${fechaLarga(c.releaseDate)}. Nombre original: ${c.japaneseName}.`,
    isDemo: false,
    sourceIds: [`exp-${c.id}`, `box-${c.id}`, `cartas-${c.id}`],
    cardListStatus,
    cardListNote,
    officialCardCount: json.officialCount,
    cards,
    tone: tones[c.id],
  } satisfies Expansion;
});
