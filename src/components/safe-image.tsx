"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";
import { BoxArt, PackArt } from "./art-reserva";

/** Imágenes que ya fallaron en esta sesión: no se vuelven a pedir ni a intentar al volver a dibujar la tarjeta (sin bucles ni descargas repetidas). */
const failedSrcs = new Set<string>();

/**
 * `next/image` con imagen de reemplazo cuando la descarga falla (404 de una foto que figura en el manifiesto o en Storage, error 5xx del optimizador, red cortada).
 * El reemplazo ocupa el mismo recuadro que la foto (el contenedor ya tiene sus dimensiones) y se intenta UNA sola vez por dirección.
 * Si la foto falló antes de que React tomara el control de la página (el evento `error` ya pasó), se detecta al montar mirando el estado del elemento.
 */
export function SafeImage({ fallback, onError, ...props }: ImageProps & { fallback: React.ReactNode }) {
  const src = typeof props.src === "string" ? props.src : "";
  const [failedFor, setFailedFor] = useState<string | null>(() => (src && failedSrcs.has(src) ? src : null));
  const ref = useRef<HTMLImageElement>(null);
  const mark = () => {
    if (!src) return;
    failedSrcs.add(src);
    setFailedFor(src);
  };
  useEffect(() => {
    const img = ref.current;
    if (img && src && img.complete && img.naturalWidth === 0 && img.currentSrc) {
      failedSrcs.add(src);
      setFailedFor(src);
    }
  }, [src]);
  if (src && failedFor === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line jsx-a11y/alt-text -- el texto alternativo llega en `props` (ImageProps lo exige)
    <Image
      {...props}
      ref={ref}
      onError={(e) => {
        mark();
        onError?.(e);
      }}
    />
  );
}

/** Ilustración de reserva de un producto (sobre o caja): lo que se muestra mientras no hay foto o si la foto no se pudo descargar. */
export type Reserve = { wide: boolean; tone: string; label: string; alt: string; tilt: string };

export function ReserveArt({ r }: { r: Reserve }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden" role="img" aria-label={r.alt}>
      {r.wide ? <BoxArt tone={r.tone} label={r.label} className={`w-[84%] transition ${r.tilt}`} /> : <PackArt tone={r.tone} label={r.label} className={`h-[84%] w-auto transition ${r.tilt}`} />}
    </div>
  );
}

/** Foto de un producto con su ilustración de reserva como reemplazo si la descarga falla (conserva el texto alternativo en ambos casos). */
export function ProductPhoto({ reserve, ...props }: ImageProps & { reserve: Reserve }) {
  return <SafeImage {...props} fallback={<ReserveArt r={reserve} />} />;
}
