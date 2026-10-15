"use client";

import { useEffect, useRef } from "react";
import { MenuIcon } from "./icons";

/** Menú móvil con <details>: se cierra con Escape, al elegir un enlace y al hacer clic fuera. */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = () => el.removeAttribute("open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        close();
        el.querySelector("summary")?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <details ref={ref} className="lg:hidden" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) ref.current?.removeAttribute("open"); }}>
      <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center hover:bg-ink/5" aria-label="Menú">
        <MenuIcon />
      </summary>
      {children}
    </details>
  );
}
