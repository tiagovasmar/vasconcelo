"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { cartActions } from "@/features/cart/store";
import type { ComboInfo, ServerSuggestion } from "@/features/cart/validation";
import { formatARS } from "@/lib/format";

const HIDE_KEY = "tienda-recomendaciones-ocultas";
const read = () => {
  try {
    return window.sessionStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};
const write = (hidden: boolean) => {
  try {
    if (hidden) window.sessionStorage.setItem(HIDE_KEY, "1");
    else window.sessionStorage.removeItem(HIDE_KEY);
  } catch {
    /* sin almacenamiento: la elección vale mientras el panel siga abierto */
  }
};

/**
 * «Completá tu compra»: hasta 3 sugerencias compactas (calculadas por el servidor, con reglas fijas: nada cambia solo de orden).
 *  - Agregar suma UNA unidad (un pack, en los accesorios) con el mismo mecanismo de las tarjetas: el panel sigue abierto, no se mueve de lugar y se actualizan
 *    cantidades, subtotal y descuentos con la siguiente validación del servidor.
 *  - Mientras la persona tiene el foco o el puntero dentro del bloque, las sugerencias NO se reordenan ni se reemplazan: la actualización espera a que salga.
 *  - Se puede ocultar durante la sesión (sessionStorage) y se respeta; un botón chico permite volver a verlas.
 * Después de agregar, el foco queda en el título del bloque (la sugerencia agregada deja de estar), sin desplazar el panel; el aviso «Agregaste…» lo anuncia el panel.
 */
export function CartSuggestions({ suggestions, combo }: { suggestions: ServerSuggestion[]; combo: ComboInfo | null }) {
  const [hidden, setHidden] = useState(read);
  const [shown, setShown] = useState<ServerSuggestion[]>(suggestions);
  const interacting = useRef(false);
  const latest = useRef(suggestions);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const titleId = useId();

  // Las sugerencias nuevas reemplazan a las mostradas solo si la persona no está interactuando con el bloque.
  const key = suggestions.map((s) => `${s.productId}:${s.comboPriceMinor ?? ""}:${s.priceMinor}`).join("|");
  useEffect(() => {
    latest.current = suggestions; // siempre las más recientes (los efectos corren en orden: esta línea va antes que la siguiente)
  });
  useEffect(() => {
    if (!interacting.current) setShown(latest.current);
  }, [key]);

  const enter = () => { interacting.current = true; };
  const leave = (e: React.FocusEvent | React.PointerEvent) => {
    const next = (e as React.FocusEvent).relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return; // el foco sigue dentro del bloque
    interacting.current = false;
    setShown(latest.current);
  };

  const hide = () => { write(true); setHidden(true); };
  const show = () => { write(false); setHidden(false); };

  if (hidden) {
    if (suggestions.length === 0) return null;
    return (
      <div className="mt-3 border-t border-ink/15 py-2" data-testid="recomendaciones-ocultas">
        <button type="button" onClick={show} className="min-h-11 text-sm font-semibold underline underline-offset-2 hover:text-emerald">Ver sugerencias para completar tu compra</button>
      </div>
    );
  }
  if (shown.length === 0) return null;

  return (
    <section ref={rootRef} aria-labelledby={titleId} className="mt-4 border-t-2 border-ink/20 pt-3 pb-4" data-testid="recomendaciones"
      onFocusCapture={enter} onBlurCapture={leave} onPointerEnter={enter} onPointerLeave={leave}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={titleId} ref={headingRef} tabIndex={-1} className="text-base font-extrabold outline-none">Completá tu compra</h3>
        <button type="button" onClick={hide} className="min-h-11 shrink-0 px-1 text-xs font-semibold underline underline-offset-2 hover:text-vermilion" aria-label="Ocultar las sugerencias en esta sesión" data-testid="ocultar-recomendaciones">Ocultar</button>
      </div>
      {shown.some((s) => s.comboPriceMinor !== null) && combo && <p className="-mt-1 mb-2 text-xs font-semibold text-emerald" data-testid="reco-combo">{combo.headline}. Depende de los cupos disponibles ({combo.freeSlots} libre{combo.freeSlots === 1 ? "" : "s"}).</p>}
      <ul className="space-y-2">
        {shown.map((s) => (
          <li key={s.productId} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border border-ink/15 bg-white p-2" data-testid={`reco-${s.productId}`}>
            <div className="flex aspect-square h-14 w-14 items-center justify-center overflow-hidden bg-white">
              {s.imageSrc ? <Image src={s.imageSrc} alt="" width={112} height={112} sizes="56px" className="h-full w-full object-contain" /> : <span className="text-[.55rem] font-bold uppercase text-ink/70">{s.presentation.slice(0, 8)}</span>}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">{s.title}</p>
              <p className="text-xs text-ink/70">{s.presentation}</p>
              <p className="text-xs text-ink/80">{s.reason}</p>
              <p className="mt-0.5 text-sm" data-testid={`reco-precio-${s.productId}`}>
                {s.comboPriceMinor !== null ? (
                  <><s className="text-ink/75">{formatARS(s.priceMinor)}</s> <b>{formatARS(s.comboPriceMinor)}</b> <span className="text-xs font-semibold text-emerald">10% OFF con tu caja</span></>
                ) : <b>{formatARS(s.priceMinor)}</b>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                cartActions.add(s.productId, s.title, 1, s.priceMinor, s.maxQuantity, "buy", s.imageSrc);
                // La sugerencia agregada deja de mostrarse (las demás conservan su lugar); el foco pasa al título del bloque sin mover el panel.
                setShown((cur) => cur.filter((x) => x.productId !== s.productId));
                headingRef.current?.focus({ preventScroll: true });
                interacting.current = false; // las sugerencias nuevas del servidor se pueden aplicar apenas lleguen
              }}
              aria-label={`Agregar ${s.title}, ${s.presentation}, al carrito`}
              data-testid={`reco-agregar-${s.productId}`}
              className="min-h-11 shrink-0 self-center bg-ink px-3 text-sm font-bold text-paper hover:bg-emerald"
            >Agregar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
