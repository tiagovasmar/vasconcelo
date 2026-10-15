"use client";

import { useEffect } from "react";

/**
 * Marca el documento cuando React ya tomó el control de la página (`data-hydrated="true"`).
 * Sirve para que las pruebas esperen una condición observable (los botones ya responden) en lugar de adivinar tiempos.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
