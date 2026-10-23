"use client";

import "./globals.css";
import { isStaleBuildError, PantallaError } from "@/components/pantalla-error";

/** Último recurso: falló el diseño raíz. Dibuja su propio documento (sin encabezado, pie ni carrito lateral) con las mismas acciones. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh overflow-x-hidden">
        <PantallaError onRetry={retry} digest={error.digest} stale={isStaleBuildError(error)} plain />
      </body>
    </html>
  );
}
