"use client";

import Image from "next/image";
import { useState } from "react";
import type { CartItem } from "@/features/cart/store";
import type { AddonCatalog, AddonOption, AddonPreview } from "@/features/promos/adicionales";
import { formatARS } from "@/lib/format";

/**
 * Selector de adicionales de la ficha de una caja: sobres con 10% OFF («cápsulas») y protectores. No selecciona nada por defecto.
 * Muestra solo opciones que el servidor ya filtró (publicadas, con stock y precio confirmado); los importes del desglose también vienen del servidor.
 * El cupo restante que se ve acá es una ayuda para no pedir de más: el reparto real del descuento lo calcula el servidor.
 */
export type Selection = Record<string, number>;

const VISIBLE = 6;
const btn = "grid h-11 w-11 place-items-center rounded-full border border-ink/40 bg-white text-lg leading-none hover:bg-gold disabled:cursor-not-allowed disabled:opacity-40";

function Thumb({ o, size = 44 }: { o: AddonOption; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white" style={{ width: size, height: size }} aria-hidden="true">
      {o.imageSrc ? <Image src={o.imageSrc} alt="" width={size * 2} height={size * 2} sizes={`${size}px`} className="h-full w-full object-contain" /> : <span className="text-[.55rem] font-bold uppercase text-ink/70">{o.presentation.slice(0, 6)}</span>}
    </span>
  );
}

function Stepper({ o, qty, max, onChange, unit }: { o: AddonOption; qty: number; max: number; onChange: (n: number) => void; unit: string }) {
  return (
    <span className="flex items-center gap-1.5" role="group" aria-label={`Cantidad de ${o.shortTitle}`}>
      <button type="button" className={btn} onClick={() => onChange(qty - 1)} aria-label={`Menos ${o.shortTitle}`} data-testid={`adicional-menos-${o.productId}`}>−</button>
      <output className="w-6 text-center text-sm font-bold" aria-label={`${unit} elegidos de ${o.shortTitle}`} data-testid={`adicional-cantidad-${o.productId}`}>{qty}</output>
      <button type="button" className={btn} onClick={() => onChange(qty + 1)} disabled={qty >= max} aria-label={`Más ${o.shortTitle}`} data-testid={`adicional-mas-${o.productId}`}>+</button>
    </span>
  );
}

function Capsule({ o, qty, max, onChange, kind }: { o: AddonOption; qty: number; max: number; onChange: (n: number) => void; kind: "booster" | "protection" }) {
  const on = qty > 0;
  const unit = kind === "booster" ? "sobres" : "packs";
  const blocked = !on && max < 1;
  return (
    <li
      className={`flex min-w-0 items-center gap-3 rounded-2xl border-2 px-2.5 py-2 transition-colors ${on ? "border-emerald bg-emerald/10 shadow-[0_0_0_1px_var(--color-emerald)]" : "border-ink/25 bg-white/80"} ${blocked ? "opacity-60" : ""}`}
      data-testid={`adicional-${o.productId}`}
      data-selected={on ? "true" : "false"}
    >
      <Thumb o={o} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-tight">{o.shortTitle}</span>
        <span className="block text-xs text-ink/70">{kind === "booster" ? (o.language ?? "Sobre") : o.presentation}</span>
        {/* Los precios pueden pasar a otra línea: con importes de 5 cifras en 360 px no deben ensanchar la columna. */}
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-sm" data-testid={`adicional-precio-${o.productId}`}>
          {o.comboPriceMinor !== null ? <><s className="text-xs font-semibold text-ink/75">{formatARS(o.listPriceMinor)}</s><b className="text-base text-emerald">{formatARS(o.comboPriceMinor)}</b></> : <b className="text-base">{formatARS(o.listPriceMinor)}</b>}
        </span>
      </span>
      {on ? (
        <Stepper o={o} qty={qty} max={max} onChange={onChange} unit={unit} />
      ) : (
        <button
          type="button"
          onClick={() => onChange(1)}
          disabled={blocked}

          aria-label={kind === "booster" ? `Elegir sobre ${o.shortTitle}` : `Elegir ${o.shortTitle}, pack de ${o.packSize ?? 5} unidades`}
          className="min-h-11 shrink-0 rounded-full border-2 border-ink px-4 text-sm font-bold hover:bg-gold disabled:cursor-not-allowed"
          data-testid={`adicional-elegir-${o.productId}`}
        >
          Elegir
        </button>
      )}
    </li>
  );
}

export function BoxAddons({ catalog, sel, setSel, cart, boxQty }: { catalog: AddonCatalog; sel: Selection; setSel: (s: Selection) => void; cart: CartItem[]; boxQty: number }) {
  const [more, setMore] = useState(false);
  // Una opción que se eligió estando la lista contraída queda visible aunque se vuelva a 0: no desaparece bajo el dedo; se limpia al expandir o contraer.
  const [pinned, setPinned] = useState<string[]>([]);
  const qtyIn = (id: string) => cart.find((i) => i.productId === id && i.mode === "buy")?.quantity ?? 0;
  const set = (id: string, n: number) => {
    const next = { ...sel };
    if (n <= 0) delete next[id];
    else next[id] = n;
    if (n > 0 && !pinned.includes(id)) setPinned([...pinned, id]);
    setSel(next);
  };

  // Cupos: cajas participantes (las del carrito y la que se está agregando) × 5, menos los sobres participantes ya elegidos o ya en el carrito.
  const boxesInCart = catalog.participatingBoxIds.reduce((n, id) => n + qtyIn(id), 0);
  const slots = catalog.perBox * (boxesInCart + boxQty);
  const inCartBoosters = catalog.participatingBoosterIds.reduce((n, id) => n + qtyIn(id), 0);
  const picked = catalog.boosters.reduce((n, o) => n + (sel[o.productId] ?? 0), 0);
  const free = Math.max(0, slots - inCartBoosters - picked);
  const boosterMax = (o: AddonOption) => Math.max(0, Math.min(o.maxQuantity - qtyIn(o.productId), (sel[o.productId] ?? 0) + free));
  const protMax = (o: AddonOption) => Math.max(0, o.maxQuantity - qtyIn(o.productId));

  const shown = more ? catalog.boosters : catalog.boosters.filter((o, i) => i < VISIBLE || (sel[o.productId] ?? 0) > 0 || pinned.includes(o.productId));
  const hidden = catalog.boosters.length - shown.length;

  return (
    <div className="mt-4 space-y-4" data-testid="adicionales">
      {catalog.comboActive && catalog.boosters.length > 0 && (
        <section aria-labelledby="adic-sobres" className="rounded-2xl border border-emerald/40 bg-white/60 p-3" data-testid="adicionales-sobres">
          <h3 id="adic-sobres" className="text-base font-extrabold">Sumá sobres con 10% OFF</h3>
          <p className="mt-0.5 text-xs text-ink/75">Hasta {catalog.perBox} sobres con descuento por cada caja. Son sobres adicionales: no reemplazan ni modifican los de la caja.</p>
          <p className="mt-1 text-sm font-semibold text-emerald" role="status" aria-live="polite" data-testid="adicionales-cupos">
            {picked} {picked === 1 ? "elegido" : "elegidos"} · {free === 0 ? "sin cupos libres" : `te ${free === 1 ? "queda" : "quedan"} ${free} ${free === 1 ? "cupo" : "cupos"}`}
          </p>
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2">
            {shown.map((o) => <Capsule key={o.productId} o={o} qty={sel[o.productId] ?? 0} max={boosterMax(o)} onChange={(n) => set(o.productId, n)} kind="booster" />)}
          </ul>
          {catalog.boosters.length > VISIBLE && (
            <button type="button" onClick={() => { setPinned([]); setMore(!more); }} aria-expanded={more} className="mt-2 min-h-11 text-sm font-semibold underline" data-testid="adicionales-ver-mas">
              {more ? "Ver menos" : `Ver ${hidden > 0 ? `${hidden} más` : "menos"}`}
            </button>
          )}
        </section>
      )}
      {catalog.protection.length > 0 && (
        <section aria-labelledby="adic-prot" className="rounded-2xl border border-ink/25 bg-white/60 p-3" data-testid="adicionales-proteccion">
          <h3 id="adic-prot" className="text-base font-extrabold">Protegé tus cartas</h3>
          <p className="mt-0.5 text-xs text-ink/75">Cada opción es un pack de 5 unidades. El top loader se usa junto con una sleeve. No incluyen cartas.</p>
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2">
            {catalog.protection.map((o) => <Capsule key={o.productId} o={o} qty={sel[o.productId] ?? 0} max={protMax(o)} onChange={(n) => set(o.productId, n)} kind="protection" />)}
          </ul>
        </section>
      )}
    </div>
  );
}

export function AddonBreakdown({ preview, boxQty, loading }: { preview: AddonPreview | null; boxQty: number; loading: boolean }) {
  const b = preview?.breakdown;
  return (
    <div className="mt-3 rounded-2xl border-2 border-ink bg-white p-3 text-sm" role="status" aria-live="polite" aria-busy={loading} data-testid="adicionales-desglose">
      {!b ? <p className="min-h-[7.5rem] text-ink/70">Calculando tu selección…</p> : (
        <dl className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 ${loading ? "opacity-60" : ""}`}>
          <dt>Caja × {boxQty}</dt><dd className="text-right" data-testid="desglose-caja">{formatARS(b.boxMinor)}</dd>
          {b.boostersUnits > 0 && <><dt>Sobres adicionales × {b.boostersUnits}</dt><dd className="text-right" data-testid="desglose-sobres">{formatARS(b.boostersListMinor)}</dd></>}
          {b.protectionUnits > 0 && <><dt>Protección × {b.protectionUnits} {b.protectionUnits === 1 ? "pack" : "packs"}</dt><dd className="text-right" data-testid="desglose-proteccion">{formatARS(b.protectionMinor)}</dd></>}
          {b.savingMinor > 0 && <><dt className="font-semibold text-emerald">Ahorro combo caja + sobres{b.boostersDiscountedUnits > 0 ? ` (${b.boostersDiscountedUnits} ${b.boostersDiscountedUnits === 1 ? "sobre" : "sobres"})` : ""}</dt><dd className="text-right font-semibold text-emerald" data-testid="desglose-ahorro">−{formatARS(b.savingMinor)}</dd></>}
          <dt className="border-t border-ink/30 pt-1 text-base font-extrabold">Total</dt><dd className="border-t border-ink/30 pt-1 text-right text-lg font-extrabold" data-testid="desglose-total">{formatARS(b.totalMinor)}</dd>
        </dl>
      )}
    </div>
  );
}
