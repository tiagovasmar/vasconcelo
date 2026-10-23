import Link from "next/link";

/**
 * Pantalla de error de página con la misma voz y diseño que la 404. No muestra el detalle técnico del error (puede filtrar datos): solo un código para
 * buscarlo en los registros del servidor. Se usa sin hooks para poder dibujarse también en `global-error` (sin el diseño del sitio).
 */
export function PantallaError({ onRetry, digest, plain = false }: { onRetry: () => void; digest?: string; plain?: boolean }) {
  const volver = plain
    ? <a href="/sellados" className="border border-ink px-6 py-3 font-bold hover:bg-gold">Volver al catálogo</a>
    : <Link href="/sellados" className="border border-ink px-6 py-3 font-bold hover:bg-gold">Volver al catálogo</Link>;
  return (
    <section className="paper-texture" role="alert" data-testid="pantalla-error">
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-8">
        <p className="eyebrow text-vermilion">Algo salió mal</p>
        <h1 className="display mt-4 text-[clamp(2.4rem,8vw,5rem)] normal-case">No pudimos cargar esta página.</h1>
        <p className="mt-6 max-w-xl text-lg text-ink/80">Puede ser un corte de conexión o un problema nuestro. No se perdió nada: tu carrito sigue guardado en este dispositivo y no mostramos precios ni disponibilidad sin confirmarlos.</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <button type="button" onClick={onRetry} className="bg-ink px-6 py-3 font-bold text-paper hover:bg-emerald" data-testid="error-reintentar">Reintentar</button>
          {volver}
        </div>
        {digest ? <p className="mt-8 text-xs text-ink/60">Código para soporte: {digest}</p> : null}
      </div>
    </section>
  );
}
