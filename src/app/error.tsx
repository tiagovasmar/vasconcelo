"use client";

import { PantallaError } from "@/components/pantalla-error";

/** Error al cargar o dibujar una página: se mantiene el encabezado y el pie del sitio y se ofrece reintentar o volver al catálogo. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PantallaError onRetry={retry} digest={error.digest} />;
}
