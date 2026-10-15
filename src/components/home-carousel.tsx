"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { Banner } from "@/content/banners";
import { CollectionBanner } from "./collection-banner";

/** Milisegundos entre banners cuando el avance automático está activo. */
export const AUTOPLAY_MS = 6000;
/** Duración de la transición horizontal entre banners. */
const SLIDE_MS = 650;

const reducedQuery = "(prefers-reduced-motion: reduce)";
const reducedNow = () => typeof window !== "undefined" && window.matchMedia(reducedQuery).matches;
const subscribeReduced = (cb: () => void) => { const m = window.matchMedia(reducedQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const subscribeVisibility = (cb: () => void) => { document.addEventListener("visibilitychange", cb); return () => document.removeEventListener("visibilitychange", cb); };

type Move = { to: number; dir: 1 | -1 };

/** Ejecuta `cb` en una tarea posterior (no depende de requestAnimationFrame ni de temporizadores: sigue funcionando aunque la pestaña esté en segundo plano). */
const later = (cb: () => void) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); cb(); };
  ch.port2.postMessage(0);
};

/**
 * Carrusel de banners por colección, CONTINUO: avanza solo cada 6 s y, con las flechas, se desplaza horizontalmente (transición de carrusel). Después del último
 * sigue hacia adelante con el primero (sin retroceder por todos ni saltar) y la flecha anterior desde el primero lleva al último, indefinidamente. No hay banners
 * duplicados: los mismos se reordenan con CSS (`order`) para que el siguiente, o el anterior, esté siempre al lado del actual; al terminar la transición el
 * actual vuelve al centro sin que se note. Se pausa si la persona lo pide, con el mouse encima, el foco adentro o la pestaña oculta; con movimiento reducido
 * arranca detenido y los cambios son instantáneos. Teclado (← → Inicio Fin con el foco dentro), flechas, indicadores y deslizado táctil (el banner sigue al dedo).
 * Solo el primer banner pide sus imágenes con prioridad; las de los demás cuando la persona interactúa o el banner contiguo está por mostrarse. El avance
 * automático no mueve el foco ni se anuncia. Los banners que no son el actual son `inert` (no se llega a ellos con teclado ni lector de pantalla).
 */
export function HomeCarousel({ banners }: { banners: Banner[] }) {
  const n = banners.length;
  const [index, setIndex] = useState(0);
  // Desplazamiento en curso: banner de destino y sentido (1 = hacia adelante, -1 = hacia atrás).
  const [move, setMove] = useState<Move | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [instant, setInstant] = useState(false);
  const [loaded, setLoaded] = useState<number[]>([0]);
  const track = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const moveRef = useRef<Move | null>(null);
  const pending = useRef<Move | null>(null);
  const fallback = useRef(0);
  const startRef = useRef<(to: number, dir: 1 | -1, manual: boolean) => void>(() => undefined);
  const dragInfo = useRef<{ x: number; y: number; id: number; active: boolean; moved: boolean } | null>(null);
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

  const near = useCallback((i: number) => setLoaded((l) => { const add = [i - 1, i, i + 1].map((x) => (x + n) % n).filter((x) => !l.includes(x)); return add.length ? [...l, ...add] : l; }), [n]);

  /** Termina el desplazamiento en curso: el destino pasa a ser el banner actual y, si la persona pidió otro mientras tanto, se inicia. */
  const finish = useCallback(() => {
    const m = moveRef.current;
    if (!m) return;
    window.clearTimeout(fallback.current);
    moveRef.current = null;
    // El actual vuelve al centro SIN animación (se ve igual: ya ocupa esa posición): se confirma el cambio de inmediato, se fuerza el cálculo de estilos y recién
    // después se vuelven a permitir las transiciones. Si no, el navegador animaría ese regreso al centro.
    flushSync(() => { setInstant(true); setIndex(m.to); setMove(null); });
    void track.current?.offsetWidth;
    later(() => setInstant(false));
    const p = pending.current;
    pending.current = null;
    // el pedido que llegó durante la transición arranca recién cuando el banner nuevo ya está asentado (dos cuadros después)
    if (p && p.to !== m.to) later(() => later(() => startRef.current(p.to, p.dir, false)));
  }, []);

  const start = useCallback((to: number, dir: 1 | -1, manual: boolean) => {
    if (n < 2) return;
    if (manual) setSaid(`Banner ${to + 1} de ${n}: ${banners[to]?.title ?? ""}`);
    near(to);
    if (moveRef.current) { pending.current = { to, dir }; return; }
    if (reducedNow()) { setIndex(to); return; }
    const m = { to, dir };
    moveRef.current = m;
    setMove(m);
    window.clearTimeout(fallback.current);
    // por si el navegador no avisa el final de la transición (pestaña en segundo plano, interrupciones)
    fallback.current = window.setTimeout(finish, SLIDE_MS + 350);
  }, [n, near, banners, finish]);
  useEffect(() => { startRef.current = start; }, [start]);

  const next = useCallback((manual = true) => start((index + 1) % n, 1, manual), [start, index, n]);
  const prev = useCallback(() => start((index - 1 + n) % n, -1, true), [start, index, n]);
  const goTo = useCallback((i: number) => { if (i !== index) start(i, i > index ? 1 : -1, true); }, [start, index]);

  const running = n > 1 && !paused && !hover && !focusIn && !hidden && !move;
  // Un solo temporizador por banner: cualquier cambio de banner (manual o automático) lo reinicia y el cleanup lo limpia al desmontar.
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => next(false), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [running, index, next]);

  useEffect(() => () => window.clearTimeout(fallback.current), []);

  // Al cambiar de banner con el teclado, el foco pasa al propio carrusel: el enlace que lo tenía queda en un banner oculto (inert)
  // y, si no, se perdería el foco y las flechas dejarían de funcionar.
  const focusRegion = () => region.current?.focus({ preventScroll: true });
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); focusRegion(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); focusRegion(); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); focusRegion(); }
    else if (e.key === "End") { e.preventDefault(); goTo(n - 1); focusRegion(); }
  };

  // Deslizado táctil: el banner sigue al dedo (con 3 o más banners hay uno a cada lado) y al soltar se decide por distancia.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || n < 2 || moveRef.current) return;
    dragInfo.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      d.active = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sin captura igual funciona */ }
      near(index);
    }
    d.moved = true;
    if (n >= 3) setDrag(dx);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) { dragInfo.current = null; return; }
    const dx = e.clientX - d.x;
    const w = track.current?.clientWidth || 1;
    setDrag(null);
    if (Math.abs(dx) > w * 0.18) { if (dx < 0) next(); else prev(); }
    // el «clic» que sigue al soltar se descarta (no debe abrir el enlace sobre el que terminó el deslizado)
    window.setTimeout(() => { dragInfo.current = null; }, 0);
  };
  const onClickCapture = (e: React.MouseEvent) => { if (dragInfo.current?.moved) { e.preventDefault(); e.stopPropagation(); } };

  // Posición de cada banner: izquierda (anterior, o destino si se retrocede), centro (actual) y derecha (siguiente, o destino si se avanza); el resto, después.
  const right = move && move.dir === 1 ? move.to : (index + 1) % n;
  const left = move && move.dir === -1 ? move.to : (index - 1 + n) % n;
  const orderOf = (i: number) => {
    if (i === index) return 1;
    if (left === right) return i === left ? (move?.dir === -1 ? 0 : 2) : 3 + i; // con solo 2 banners el otro va a un lado según el sentido
    if (i === left) return 0;
    if (i === right) return 2;
    return 3 + i;
  };
  const x = move ? (move.dir === 1 ? "-200%" : "0%") : "-100%";
  const transform = `translate3d(calc(${x} + ${drag ?? 0}px), 0, 0)`;
  const animate = !instant && drag === null && !reduced;

  const ctl = "btn-cut btn-cut-gold !min-h-10 !w-10 !p-0 sm:!min-h-11 sm:!w-11";
  const near3 = () => { near(index); near(index + 1); near(index - 1); };
  return (
    <div ref={region} tabIndex={-1} role="region" aria-roledescription="carrusel" aria-label="Colecciones destacadas" className="relative outline-none" onKeyDown={onKeyDown} onPointerEnter={(e) => { near3(); if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)} onFocusCapture={() => { near3(); setFocusIn(true); }} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false); }} onTouchStart={near3} data-testid="carrusel" data-autoplay={running ? "on" : "off"}>
      <div className="touch-pan-y overflow-hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture}>
        <div
          ref={track}
          onTransitionEnd={(e) => { if (e.target === track.current && e.propertyName === "transform") finish(); }}
          className={`flex will-change-transform ${animate ? "transition-transform ease-in-out" : ""}`}
          style={{ transform, transitionDuration: animate ? `${SLIDE_MS}ms` : undefined }}
          data-testid="carrusel-pista"
          data-moviendo={move ? "true" : "false"}
        >
          {banners.map((b, i) => (
            <div key={b.expansionId} role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${n}: ${b.title}`} className="w-full shrink-0" style={{ order: orderOf(i) }} inert={i !== index} data-testid={`diapositiva-${b.expansionId}`} data-active={i === index}>
              <CollectionBanner banner={b} as="h2" priority={i === 0} loadImages={loaded.includes(i)} bottomSpace={n > 1} />
            </div>
          ))}
        </div>
      </div>

      {n > 1 && (
        <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5 sm:bottom-6 sm:gap-3">
          <button type="button" onClick={() => prev()} aria-label="Banner anterior" className={ctl} data-testid="carrusel-anterior"><span aria-hidden="true" className="rotate-180"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span></button>
          <ul className="flex items-center" aria-label="Elegir banner">
            {banners.map((b, i) => (
              <li key={b.expansionId}>
                <button type="button" onClick={() => goTo(i)} aria-label={`Ir al banner ${i + 1}: ${b.title}`} aria-current={i === index ? "true" : undefined} className="group flex min-h-10 min-w-6 items-center justify-center px-0.5 sm:min-h-11 sm:px-1" data-testid={`indicador-${b.expansionId}`}>
                  <span className={`block h-1.5 skew-x-[-35deg] transition-all ${i === index ? "w-7 bg-gold" : "w-3.5 bg-paper/50 group-hover:bg-paper"}`} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => next()} aria-label="Banner siguiente" className={ctl} data-testid="carrusel-siguiente"><span aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span></button>
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
