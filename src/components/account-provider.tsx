"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserIcon } from "./icons";

type AccountUser = { name: string; email: string };
type Ctx = {
  ready: boolean;
  user: AccountUser | null;
  favorites: ReadonlySet<string>;
  refresh: () => Promise<void>;
  toggleFavorite: (productId: string) => Promise<"needs-login" | "ok" | "error">;
};

const AccountContext = createContext<Ctx>({ ready: false, user: null, favorites: new Set(), refresh: async () => {}, toggleFavorite: async () => "error" });
export const useAccount = () => useContext(AccountContext);

/** Estado de sesión y favoritos para la interfaz. La autorización real siempre ocurre en el servidor. */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{ ready: boolean; user: AccountUser | null; favorites: Set<string> }>({ ready: false, user: null, favorites: new Set() });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      const data = (await res.json()) as { user: AccountUser | null; favorites: string[] };
      setState({ ready: true, user: data.user, favorites: new Set(data.favorites) });
    } catch {
      setState((s) => ({ ...s, ready: true }));
    }
  }, []);

  // Al cargar la página, y cada vez que cambia la ruta (p. ej. tras iniciar o cerrar sesión).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh, pathname]);

  const toggleFavorite = useCallback(
    async (productId: string) => {
      if (!state.user) {
        router.push(`/cuenta/ingresar?next=${encodeURIComponent(window.location.pathname + window.location.search)}&motivo=favoritos`);
        return "needs-login" as const;
      }
      const on = state.favorites.has(productId);
      // Actualización inmediata; si el servidor falla se revierte.
      setState((s) => {
        const next = new Set(s.favorites);
        if (on) next.delete(productId);
        else next.add(productId);
        return { ...s, favorites: next };
      });
      try {
        const res = await fetch("/api/favorites", { method: on ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
        if (!res.ok) throw new Error(String(res.status));
        return "ok" as const;
      } catch {
        await refresh();
        return "error" as const;
      }
    },
    [state.user, state.favorites, router, refresh],
  );

  const value = useMemo<Ctx>(() => ({ ...state, refresh, toggleFavorite }), [state, refresh, toggleFavorite]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/** Enlace «Mi cuenta» de la cabecera: muestra el primer nombre cuando hay sesión. */
export function AccountLink() {
  const { user } = useAccount();
  const first = user?.name.split(" ")[0];
  return (
    <Link href="/cuenta" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-ink/5" aria-label={user ? `Mi cuenta, sesión iniciada como ${user.name}` : "Mi cuenta"}>
      <UserIcon />
      <span className="hidden max-w-[10rem] truncate sm:inline">{first ? `Hola, ${first}` : "Mi cuenta"}</span>
    </Link>
  );
}
