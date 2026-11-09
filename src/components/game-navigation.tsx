import Link from "next/link";
import { catalogGames, catalogHref, gameLabel, type CatalogGame } from "@/content/games";

export function GameNavigation({ current, emphasizePokemon = false }: { current?: CatalogGame; emphasizePokemon?: boolean }) {
  return (
    <nav aria-label="Juegos de cartas" className="flex flex-wrap gap-2">
      {catalogGames.map((game) => (
        <Link key={game} href={catalogHref(game)} aria-current={current === game ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold transition hover:border-emerald ${current === game || (emphasizePokemon && game === "pokemon") ? "border-emerald bg-emerald text-white" : "border-ink/25 bg-white text-ink"}`}>
          {gameLabel[game]}
        </Link>
      ))}
    </nav>
  );
}
