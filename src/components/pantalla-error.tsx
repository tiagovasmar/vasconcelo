import Link from "next/link";

/**
 * Pantalla de error de página con la misma voz y diseño que la 404. No muestra el detalle técnico del error (puede filtrar datos): solo un código para
 * buscarlo en los registros del servidor. Se usa sin hooks para poder dibujarse también en `global-error` (sin el diseño del sitio).
 *
 * Si el error es de una versión vieja de la tienda (la pestaña quedó abierta antes de un despliegue y pide un archivo de código que ya no existe), reintentar no sirve:
 * se ofrece «Actualizar la página» (una recarga que decide la persona; nunca se recarga sola, así no hay bucles). El carrito vive en el navegador y se conserva.
 */
const STALE = /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported/i;
export const isStaleBuildError = (error: { name?: string; message?: string } | null | undefined) => Boolean(error && STALE.test(`${error.name ?? ""} ${error.message ?? ""}`));

export function PantallaError({ onRetry, digest, plain = false, stale = false }: { onRetry: () => void; digest?: string; plain?: boolean; stale?: boolean }) {
  const volver = plain
    ? <a href="/sellados" className="border border-ink px-6 py-3 font-bold hover:bg-gold">Volver al catálogo</a>
    : <Link href="/sellados" className="border border-ink px-6 py-3 font-bold hover:bg-gold">Volver al catálogo</Link>;
  return (
    <section className="paper-texture" role="alert" data-testid="pantalla-error" data-tipo={stale ? "version-vieja" : "error"}>
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-8">
        <p className="eyebrow text-vermilion">{stale ? "Hay una versión nueva" : "Algo salió mal"}</p>
        <h1 className="display mt-4 text-[clamp(2.4rem,8vw,5rem)] normal-case">{stale ? "La tienda se actualizó." : "No pudimos cargar esta página."}</h1>
        <p className="mt-6 max-w-xl text-lg text-ink/80">
          {stale
            ? "Esta pestaña quedó abierta con una versión anterior. Actualizá la página para seguir: tu carrito sigue guardado en este dispositivo."
            : "Puede ser un corte de conexión o un problema nuestro. No se perdió nada: tu carrito sigue guardado en este dispositivo y no mostramos precios ni disponibilidad sin confirmarlos."}
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          {stale
            ? <button type="button" onClick={() => window.location.reload()} className="bg-ink px-6 py-3 font-bold text-paper hover:bg-emerald" data-testid="error-actualizar">Actualizar la página</button>
            : <button type="button" onClick={onRetry} className="bg-ink px-6 py-3 font-bold text-paper hover:bg-emerald" data-testid="error-reintentar">Reintentar</button>}
          {volver}
        </div>
        {digest ? <p className="mt-8 text-xs text-ink/60">Código para soporte: {digest}</p> : null}
      </div>
    </section>
  );
}
