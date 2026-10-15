"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useCartDrawerOpen } from "@/features/cart/store";

/**
 * Cáscara del panel lateral del carrito: vive en el layout y es mínima. El panel completo (lista, cantidades, foco, teclado) se descarga aparte,
 * recién cuando hay tiempo libre después de cargar la página o cuando se acerca el mouse/dedo al ícono del carrito, así no suma peso a la primera carga.
 */
const loadPanel = () => import("./cart-drawer-panel");
const Panel = dynamic(loadPanel, { ssr: false });

let preloaded = false;
export function preloadCartDrawer() {
  if (preloaded) return;
  preloaded = true;
  void loadPanel();
}

export function CartDrawer() {
  const open = useCartDrawerOpen();
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadCartDrawer, { timeout: 6000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(preloadCartDrawer, 4000);
    return () => clearTimeout(t);
  }, []);
  return open ? <Panel /> : null;
}
