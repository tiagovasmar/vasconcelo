"use client";

import { useState } from "react";
import { useAccount } from "./account-provider";

/** Corazón para guardar/quitar un producto de favoritos. Sin sesión, lleva al ingreso y vuelve a la misma página. */
export function FavoriteButton({ productId, title, className = "", withLabel = false }: { productId: string; title: string; className?: string; withLabel?: boolean }) {
  const { favorites, toggleFavorite, user, ready } = useAccount();
  const [error, setError] = useState(false);
  const on = favorites.has(productId);
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        // Hasta saber si hay sesión no se puede decidir entre guardar o pedir ingreso: el botón espera (evita un clic en falso).
        disabled={!ready}
        aria-label={on ? `Quitar ${title} de favoritos` : user ? `Guardar ${title} en favoritos` : `Guardar ${title} en favoritos (requiere iniciar sesión)`}
        onClick={async () => setError((await toggleFavorite(productId)) === "error")}
        className={`inline-flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-60 ${className}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.9 3.6 5 6.7 5c2 0 3.4 1.1 5.3 3.2C13.9 6.1 15.3 5 17.3 5c3.1 0 5.1 2.9 3.9 6.2-1.7 4.7-9.2 9.3-9.2 9.3Z" />
        </svg>
        {withLabel && <span>{on ? "En favoritos" : "Guardar en favoritos"}</span>}
      </button>
      {error && <span role="alert" className="sr-only">No pudimos guardar el cambio. Intentá de nuevo.</span>}
    </>
  );
}
