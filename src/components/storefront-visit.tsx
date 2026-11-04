"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const publicPaths = ["/sellados", "/productos", "/expansiones", "/como-comprar", "/mayoristas", "/carrito"];

export function StorefrontVisit() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/" && !publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"))) return;
    try {
      const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
      const key = "vasconcelo-visita";
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { day: string; browser: string; counted: boolean } | null;
      if (saved?.day === day && saved.counted) return;
      const browser = saved?.day === day ? saved.browser : crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify({ day, browser, counted: false }));
      void fetch("/api/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browser }),
        keepalive: true,
      }).then((response) => {
        if (response.ok) localStorage.setItem(key, JSON.stringify({ day, browser, counted: true }));
      }).catch(() => {});
    } catch {
      // La medición es opcional para el funcionamiento de la tienda.
    }
  }, [pathname]);
  return null;
}
