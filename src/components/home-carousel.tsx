"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Banner } from "@/content/banners";
import { CollectionBanner } from "./collection-banner";

/** Milisegundos entre banners cuando el avance automático está activo. */
export const AUTOPLAY_MS = 6000;

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => { const m = window.matchMedia(reducedQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const subscribeVisibility = (cb: () => void) => { document.addEventListener("visibilitychange", cb); return () => document.removeEventListener("visibilitychange", cb); };

/**
 * Carrusel de banners por colección. Avanza solo cada 6 s (y vuelve al primero tras el último) salvo que la persona lo pause,
 * tenga el mouse encima, el foco adentro, la pestaña oculta o prefiera movimiento reducido (en ese caso arranca detenido). Cada
 * navegación manual reinicia la cuenta. Teclado (← → Inicio Fin con el foco dentro), botones de flecha, indicadores y deslizado
 * táctil nativo (scroll-snap). Solo el primer banner pide sus imágenes con prioridad; las de los demás se piden recién cuando la
 * persona interactúa o cuando el banner contiguo está por mostrarse. El avance automático no mueve el foco ni se anuncia.
 */
export function HomeCarousel({ banners }: { banners: Banner[] }) {
  const n = banners.length;
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<number[]>([0]);
  const track = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  // Banner al que va un desplazamiento programático en curso (clic, flecha o avance automático): mientras llega, los eventos de scroll
  // no mueven el índice (si no, el indicador «rebotaría» al banner de salida durante la animación).
  const target = useRef<number | null>(null);
  const fallback = useRef(0);
  // Avance automático: «paused» es la elección de la persona (se conserva al quitar el mouse); las demás pausas son transitorias.
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  // Preferencia de movimiento y visibilidad de la pestaña, leídas del navegador (en el servidor: sin reducción y visible).
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "hidden", () => false);
  // Con movimiento reducido el avance automático arranca detenido; la elección de la persona (botón) manda sobre la preferencia.
  const paused = userPaused ?? reduced;
  // Texto anunciado a lectores de pantalla: solo cambia con navegación manual, nunca con el avance automático.
  const [said, setSaid] = useState("");

  const near = useCallback((i: number) => setLoaded((l) => { const add = [i - 1, i, i + 1].filter((x) => x >= 0 && x < n && !l.includes(x)); return add.length ? [...l, ...add] : l; }), [n]);

  const goTo = useCallback((i: number, manual = true) => {
    const el = track.current;
    if (!el) return;
    const t = Math.max(0, Math.min(n - 1, i));
    if (manual) setSaid(`Banner ${t + 1} de ${n}: ${banners[t]?.title ?? ""}`);
    near(t);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.current = reduce ? null : t;
    window.clearTimeout(fallback.current);
    // por si el navegador interrumpe la animación sin llegar al destino
    if (!reduce) fallback.current = window.setTimeout(() => { target.current = null; }, 1500);
    el.scrollTo({ left: t * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
    setIndex(t);
  }, [n, near, banners]);

  const running = n > 1 && !paused && !hover && !focusIn && !hidden;
  // Un solo temporizador por banner: cualquier cambio de banner (manual o automático) lo reinicia y el cleanup lo limpia al desmontar.
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => goTo((index + 1) % n, false), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [running, index, n, goTo]);

  // El deslizado táctil o con rueda mueve el scroll: el índice sigue a la posición.
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (!el || !el.clientWidth) return;
      if (target.current !== null) {
        if (Math.abs(el.scrollLeft - target.current * el.clientWidth) > 2) return; // todavía en camino
        target.current = null;
      }
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setIndex((cur) => (cur === i ? cur : i));
      near(i);
    });
  };

  useEffect(() => () => window.clearTimeout(fallback.current), []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onResize = () => el.scrollTo({ left: index * el.clientWidth, behavior: "auto" });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [index]);

  // Al cambiar de banner con el teclado, el foco pasa al propio carrusel: el enlace que lo tenía queda en un banner oculto (inert)
  // y, si no, se perdería el foco y las flechas dejarían de funcionar.
  const key = (i: number) => { goTo(i); region.current?.focus({ preventScroll: true }); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); key(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); key(index - 1); }
    else if (e.key === "Home") { e.preventDefault(); key(0); }
    else if (e.key === "End") { e.preventDefault(); key(n - 1); }
  };

  const ctl = "btn-cut btn-cut-gold !min-h-10 !w-10 !p-0 sm:!min-h-11 sm:!w-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-40";
  return (
    <div ref={region} tabIndex={-1} role="region" aria-roledescription="carrusel" aria-label="Colecciones destacadas" className="relative outline-none" onKeyDown={onKeyDown} onPointerEnter={(e) => { near(index); if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)} onFocusCapture={() => { near(index); setFocusIn(true); }} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false); }} onTouchStart={() => near(index)} data-testid="carrusel" data-autoplay={running ? "on" : "off"}>
      <div ref={track} onScroll={onScroll} onTouchStart={() => { target.current = null; }} onWheel={() => { target.current = null; }} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain" data-testid="carrusel-pista">
        {banners.map((b, i) => (
          <div key={b.expansionId} role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${n}: ${b.title}`} className="w-full shrink-0 snap-center" inert={i !== index} data-testid={`diapositiva-${b.expansionId}`} data-active={i === index}>
            <CollectionBanner banner={b} as="h2" priority={i === 0} loadImages={loaded.includes(i)} bottomSpace={n > 1} />
          </div>
        ))}
      </div>

      {n > 1 && (
        <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5 sm:bottom-6 sm:gap-3">
          <button type="button" onClick={() => index > 0 && goTo(index - 1)} aria-disabled={index === 0} aria-label="Banner anterior" className={ctl} data-testid="carrusel-anterior"><span aria-hidden="true" className="rotate-180"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span></button>
          <ul className="flex items-center" aria-label="Elegir banner">
            {banners.map((b, i) => (
              <li key={b.expansionId}>
                <button type="button" onClick={() => goTo(i)} aria-label={`Ir al banner ${i + 1}: ${b.title}`} aria-current={i === index ? "true" : undefined} className="group flex min-h-10 min-w-6 items-center justify-center px-0.5 sm:min-h-11 sm:px-1" data-testid={`indicador-${b.expansionId}`}>
                  <span className={`block h-1.5 skew-x-[-35deg] transition-all ${i === index ? "w-7 bg-gold" : "w-3.5 bg-paper/50 group-hover:bg-paper"}`} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => index < n - 1 && goTo(index + 1)} aria-disabled={index === n - 1} aria-label="Banner siguiente" className={ctl} data-testid="carrusel-siguiente"><span aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span></button>
        </div>
      )}
      {n > 1 && (
        <button type="button" onClick={() => setUserPaused(!paused)} aria-label={paused ? "Reanudar el avance automático de los banners" : "Pausar el avance automático de los banners"} className={`${ctl} absolute right-3 top-3 z-20 sm:bottom-6 sm:right-8 sm:top-auto`} data-testid="carrusel-pausa">
            {paused ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
            )}
          </button>
      )}
      <p className="sr-only" aria-live="polite" data-testid="carrusel-anuncio">{said}</p>
    </div>
  );
}
