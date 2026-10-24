"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";
import { BoxArt, PackArt } from "./art-reserva";

/** Imágenes que ya fallaron en esta sesión: no se vuelven a pedir ni a intentar al volver a dibujar la tarjeta (sin bucles ni descargas repetidas). */
const failedSrcs = new Set<string>();

/**
 * Las fotos que no están en pantalla (ni cerca) no se piden hasta que se acercan: con `loading="lazy"` Chrome en una conexión lenta adelanta hasta ≈ 2500 px, y en una
 * página larga (inicio, catálogo) eso hace que decenas de fotos compitan por el ancho de banda con el JavaScript que activa la página. Se piden recién a 400 px de entrar
 * en pantalla (medido: en el celular con conexión lenta el inicio queda interactivo ≈ 25 % antes y el catálogo ≈ 36 % antes, con 40 % menos bytes durante la carga). La imagen principal (`priority` / `loading="eager"`) no se toca. Mientras tanto queda un recuadro con las mismas dimensiones y el mismo texto alternativo.
 */

/**
 * `next/image` con imagen de reemplazo cuando la descarga falla (404 de una foto que figura en el manifiesto o en Storage, error 5xx del optimizador, red cortada).
 * El reemplazo ocupa el mismo recuadro que la foto (el contenedor ya tiene sus dimensiones) y se intenta UNA sola vez por dirección.
 * Si la foto falló antes de que React tomara el control de la página (el evento `error` ya pasó), se detecta al montar mirando el estado del elemento.
 */
export function SafeImage({ fallback, onError, ...props }: ImageProps & { fallback: React.ReactNode }) {
  const src = typeof props.src === "string" ? props.src : "";
  const [failedFor, setFailedFor] = useState<string | null>(() => (src && failedSrcs.has(src) ? src : null));
  const ref = useRef<HTMLImageElement>(null);
  const lazy = !props.priority && props.loading !== "eager";
  const [near, setNear] = useState(!lazy);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (near) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
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
  if (!near) {
    return <span ref={box} role="img" aria-label={props.alt} className={`block ${props.className ?? ""}`} style={{ ...props.style, aspectRatio: `${props.width} / ${props.height}` }} />;
  }
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
