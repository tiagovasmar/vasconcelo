"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { cartDrawer } from "@/features/cart/store";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento común del panel lateral del carrito, tanto del marco que se ve mientras se descarga el panel completo como del panel ya cargado:
 * cierra al cambiar de página, bloquea el desplazamiento del fondo, lleva el foco al título (y lo devuelve al cerrar), cierra con Escape y mantiene Tab dentro.
 * Vive aparte para que el marco sea operable desde el primer momento (cerrar, Escape, fondo) sin esperar al módulo pesado.
 */
export function useDrawerShell(panelRef: RefObject<HTMLElement | null>, titleRef: RefObject<HTMLElement | null>, skipRestore: RefObject<boolean>) {
  const pathname = usePathname();
  // Se cierra solo al cambiar de página (p. ej. al tocar un producto o «Continuar»).
  const first = useRef(pathname);
  useEffect(() => {
    if (first.current !== pathname) cartDrawer.close();
  }, [pathname]);

  // Foco, bloqueo del desplazamiento del fondo y devolución del foco al cerrar.
  useEffect(() => {
    const html = document.documentElement;
    const scrollbar = window.innerWidth - html.clientWidth;
    const prevPad = document.body.style.paddingRight;
    html.dataset.cartDrawer = "open";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    titleRef.current?.focus();
    return () => {
      delete html.dataset.cartDrawer;
      document.body.style.paddingRight = prevPad;
      // Relevo del marco al panel completo: el panel sigue abierto y toma el foco; el foco de origen se devuelve solo cuando de verdad se cierra.
      if (cartDrawer.isOpen()) return;
      const el = cartDrawer.peekReturnFocus();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- la marca se activa mientras el panel está abierto y se lee justo al cerrar
      if (skipRestore.current) return;
      const target = el && el.isConnected ? el : (document.querySelector("[data-cart-trigger]") as HTMLElement | null);
      target?.focus();
    };
  }, [titleRef, skipRestore]);

  // Escape cierra; Tab queda dentro del panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cartDrawer.close();
      } else if (e.key === "Tab" && panelRef.current) {
        const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const firstEl = els[0];
        const lastEl = els[els.length - 1];
        const active = document.activeElement;
        if (!panelRef.current.contains(active)) { e.preventDefault(); firstEl.focus(); }
        else if (e.shiftKey && (active === firstEl || active === titleRef.current)) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelRef, titleRef]);
}
