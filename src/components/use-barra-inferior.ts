"use client";

import { useEffect } from "react";

/**
 * Marca el <body> mientras hay una barra fija inferior en el celular (ficha o carrito). El aviso flotante «Agregaste…» usa la marca
 * para subir y no taparla (ver `.cart-toast` en globals.css). Varias barras no conviven: la marca se quita al desmontar o al ocultarse.
 */
export function useBarraInferior(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.body.dataset.barraInferior = "1";
    return () => { delete document.body.dataset.barraInferior; };
  }, [active]);
}
