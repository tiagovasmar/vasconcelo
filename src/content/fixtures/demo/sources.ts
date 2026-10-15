import type { Source } from "../../schema";

export const sources: Source[] = [
  {
    id: "pokemon-center-storm-box",
    url: "https://www.pokemoncenter-online.com/9900000008109.html",
    publisher: "Pokémon Center Online (Japón)",
    consultedAt: "2026-10-12",
    scope: "Ficha japonesa de producto: 30 sobres por caja, 5 cartas por sobre, contenido aleatorio.",
    note: "No publica tasas de aparición ni garantiza una rareza concreta.",
  },
  {
    id: "pokemon-card-storm",
    url: "https://www.pokemon-card.com/ex/m6/",
    publisher: "Pokémon Card (sitio oficial, Japón)",
    consultedAt: "2026-10-12",
    scope: "Presentación editorial de la expansión Storm Emeralda y su lista de cartas.",
    note: "La lista completa de cartas no está cargada en esta tienda todavía.",
  },
];
