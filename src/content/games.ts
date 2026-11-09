export const catalogGames = ["pokemon", "one-piece", "dragon-ball"] as const;
export type CatalogGame = (typeof catalogGames)[number];

export const gameLabel: Record<CatalogGame, string> = {
  pokemon: "Pokémon",
  "one-piece": "One Piece",
  "dragon-ball": "Dragon Ball",
};

export function parseGame(value: string | string[] | undefined): CatalogGame {
  return catalogGames.find((game) => game === value) ?? "pokemon";
}

export function gameSearchParams(game: CatalogGame | "todos", params = new URLSearchParams()) {
  const result = new URLSearchParams(params);
  if (game !== "pokemon") result.set("juego", game);
  return result;
}

export function catalogHref(game: CatalogGame | "todos" = "pokemon", params?: URLSearchParams) {
  const search = gameSearchParams(game, params);
  return search.size ? `/sellados?${search}` : "/sellados";
}
