"use client";

import { useRef, useState } from "react";

export type Slide = { alt: string; node: React.ReactNode; /** Versión liviana para la miniatura (con `sizes` chicos): si falta, se usa `node`. */ thumb?: React.ReactNode; source: "manufacturer" | "store" | "supplier"; view?: string };

const viewLabel: Record<string, string> = { front: "Frente", back: "Dorso", left: "Lateral izquierdo", right: "Lateral derecho", top: "Parte superior", bottom: "Base", detail: "Detalle", contents: "Contenido físico", closed: "Caja cerrada", "display-open": "Caja abierta de exhibición" };

/** Qué es lo que se está viendo: foto del fabricante o del stock real, y si es una exhibición abierta. */
function describe(s: Slide) {
  const origin = s.source === "store" ? "Foto real del stock de la tienda" : s.source === "supplier" ? "Foto de referencia del proveedor" : "Foto de referencia del fabricante";
  const open = s.view === "display-open";
  return { origin, view: s.view ? viewLabel[s.view] : undefined, open };
}

/** Galería con miniaturas, flechas y zoom accesible (<dialog> modal: foco gestionado, Escape para cerrar). */
export function ProductGallery({ slides, bgClass }: { slides: Slide[]; bgClass: string }) {
  const [active, setActive] = useState(0);
  const zoom = useRef<HTMLDialogElement>(null);
  const go = (d: number) => setActive((i) => (i + d + slides.length) % slides.length);
  const current = slides[active];
  const info = describe(current);
  const hasStore = slides.some((s) => s.source === "store");

  return (
    <div onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}>
      <div className={`relative flex aspect-[4/3] items-center sm:aspect-square sm:max-h-[62vh] lg:aspect-[4/4.4] lg:max-h-none justify-center overflow-hidden border border-ink/20 ${bgClass}`}>
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(255,255,255,.35),transparent_62%)]" aria-hidden="true" />
        <div className="relative flex h-full w-full items-center justify-center">{current.node}</div>
        <button type="button" onClick={() => zoom.current?.showModal()} aria-haspopup="dialog" className="absolute bottom-2 right-2 flex min-h-11 items-center gap-2 bg-ink px-3 text-sm font-semibold text-paper hover:bg-emerald sm:bottom-3 sm:right-3 sm:px-4">
          <span aria-hidden="true">⤢</span> Ampliar
        </button>
        {slides.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Imagen anterior" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-paper/90 text-xl hover:bg-gold">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="Imagen siguiente" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-paper/90 text-xl hover:bg-gold">›</button>
          </>
        )}
        <p className="sr-only" aria-live="polite">Imagen {active + 1} de {slides.length}: {current.alt}</p>
      </div>

      <div className="mt-1.5 text-xs sm:mt-2 sm:text-sm" data-testid="galeria-etiqueta">
        <p>
          <span className={`mr-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${current.source === "store" ? "bg-emerald text-paper" : "border border-ink/30 bg-white"}`}>{info.origin}</span>
          {info.view && <span className="font-medium">{info.view}</span>}
        </p>
        {info.open && <p className="mt-1 font-medium text-vermilion" data-testid="galeria-exhibicion">Caja abierta de exhibición: es una presentación del fabricante, no es el estado del artículo que se vende.</p>}
        {/* Aclaraciones secundarias en un desplegable cerrado: el rótulo de arriba ya dice de quién es la foto. */}
        <details className="mt-1 text-ink/70" data-testid="galeria-aclaraciones">
          <summary className="cursor-pointer select-none py-1 font-medium underline-offset-2 hover:underline">Sobre estas fotos</summary>
          {current.source !== "store" && <p className="mt-1 text-ink/65">{current.source === "supplier" ? "Foto de referencia del proveedor: no acredita el estado del artículo ni es del stock de la tienda." : "Foto de referencia del fabricante: no acredita el estado ni el sellado de cada artículo."}</p>}
          {!hasStore && <p className="mt-1 text-ink/65" data-testid="galeria-sin-fotos-tienda">Todavía no hay fotos del stock real de este producto.</p>}
        </details>
      </div>

      {slides.length > 1 && (
        <ul className="mt-1.5 grid grid-cols-6 gap-1.5 sm:mt-2 sm:grid-cols-4 sm:gap-3" aria-label="Miniaturas">
          {slides.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => setActive(i)} aria-pressed={i === active} aria-label={`Ver imagen ${i + 1}: ${s.alt}`} className={`relative flex aspect-square w-full items-center justify-center overflow-hidden border-2 ${bgClass} ${i === active ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`}>
                {s.thumb ?? s.node}
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={zoom}
        aria-label={`Imagen ampliada: ${current.alt}`}
        onClick={(e) => { if (e.target === zoom.current) zoom.current?.close(); }}
        className="m-auto max-h-[94dvh] w-[min(94vw,820px)] overflow-hidden border-2 border-ink bg-paper p-0 backdrop:bg-ink/80"
      >
        <div className="flex items-center justify-between border-b border-ink/20 px-4 py-2">
          <p className="text-sm font-semibold">{info.origin}{info.view ? ` · ${info.view}` : ""}: {current.alt}</p>
          <button type="button" onClick={() => zoom.current?.close()} aria-label="Cerrar imagen ampliada" className="flex h-11 w-11 items-center justify-center border border-ink text-xl">×</button>
        </div>
        <div className={`flex aspect-square max-h-[76dvh] w-full items-center justify-center ${bgClass}`}>{current.node}</div>
      </dialog>
    </div>
  );
}
