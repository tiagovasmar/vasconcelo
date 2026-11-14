export const pokemon151Versions = [
  { productId: "zh-151-wang-slim-caja", label: "151 Hope · Slim", largeLabel: "151 Hope · sobre de 20 cartas" },
  { productId: "zh-151-jing-slim-caja", label: "151 Surprise · Slim", largeLabel: "151 Surprise · sobre de 20 cartas" },
  { productId: "pokemon-card-151-caja", label: "Pokémon Card 151 · SV2a" },
] as const;

export const chinese151Cards: Record<string, { source: string; gallery: "151-hope" | "151-surprise"; checklist: string; finishes: string }> = {
  "zh-151-wang-slim-caja": {
    source: "https://www.pokemon.cn/tcg/product/15541.html",
    gallery: "151-hope",
    checklist: "https://pokecottage.com/chinese-sets/collect-151-hope-card-list/",
    finishes: "Pokémon China destaca las variantes Poké Ball y Master Ball de tipo Agua, Dragón e Incoloro.",
  },
  "zh-151-jing-slim-caja": {
    source: "https://www.pokemon.cn/tcg/product/15486.html",
    gallery: "151-surprise",
    checklist: "https://pokecottage.com/chinese-sets/collect-151-surprise-card-list/",
    finishes: "Pokémon China destaca las variantes Poké Ball y Master Ball de tipo Planta, Psíquico y Oscuridad.",
  },
};
