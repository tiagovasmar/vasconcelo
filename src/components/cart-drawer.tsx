"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useCartDrawerOpen, useCartSelect } from "@/features/cart/store";

/**
 * Cáscara del panel lateral del carrito: vive en el layout y es mínima. El panel completo (lista, cantidades, foco, teclado) se descarga aparte,
 * solo cuando hace falta: si ya hay productos en el carrito (en un tiempo libre, para que abrir sea instantáneo) o cuando se acerca el mouse/dedo al ícono del carrito o a un botón
 * de agregar. Con el carrito vacío y sin interacción no se descarga nada: la primera carga de cada página no paga el panel.
 */
const loadPanel = () => import("./cart-drawer-panel");
/** Mientras llega el panel completo (solo la primera vez, en redes lentas) se muestra al instante el marco: la persona ve que el toque funcionó. */
function Marco() {
  return (
    <div className="fixed inset-0 z-[120]" data-testid="cart-drawer-cargando">
      <div className="absolute inset-0 bg-ink/60" aria-hidden="true" />
      <aside className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-[26rem] flex-col bg-paper shadow-[-12px_0_32px_rgba(18,23,21,.35)]" aria-label="Tu carrito" aria-busy="true">
        <header className="flex items-center justify-between border-b border-ink/20 bg-white/60 px-4 py-3">
          <p className="display text-3xl normal-case">Tu carrito</p>
        </header>
        <p className="px-4 py-6 text-sm text-ink/70" role="status">Cargando…</p>
      </aside>
    </div>
  );
}
const Panel = dynamic(loadPanel, { ssr: false, loading: () => <Marco /> });

let preloaded = false;
export function preloadCartDrawer() {
  if (preloaded) return;
  preloaded = true;
  void loadPanel();
}

export function CartDrawer() {
  const open = useCartDrawerOpen();
  const hayProductos = useCartSelect((s) => s.items.length > 0);
  useEffect(() => {
    if (!hayProductos) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadCartDrawer, { timeout: 6000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(preloadCartDrawer, 4000);
    return () => clearTimeout(t);
  }, [hayProductos]);
  return open ? <Panel /> : null;
}
