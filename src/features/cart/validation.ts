"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { kindLabel, Language } from "@/content/schema";
import type { toneBg } from "@/components/tones";
import { cartActions, useCart, type CartItem } from "./store";

/**
 * Revalidación del carrito con el servidor (precios, disponibilidad y límites), COMPARTIDA entre el panel lateral y el pedido (/carrito).
 * Un solo pedido por contenido del carrito: si el panel y la página piden lo mismo, se hace una vez; si el contenido no cambió desde la última
 * respuesta, no se vuelve a pedir. El servidor sigue siendo la única fuente de importes: lo que llega acá es solo lo que se muestra.
 */
export type ServerLine = {
  productId: string;
  status: "retired" | "ok" | "price_changed" | "out_of_stock" | "unavailable" | "over_limit" | "pending_commercial" | "encargo";
  requestedQuantity: number;
  maxQuantity: number;
  unitPriceMinor: number | null;
  unitPriceUsdMinor?: number | null;
  previousPriceMinor: number | null;
  product?: { slug: string; title: string; sku: string; language: Language; kind: keyof typeof kindLabel; fallbackTone: keyof typeof toneBg; imageSrc: string | null; imageAlt: string };
};
export type Fx = { rate10k: number; mode: "auto" | "manual"; warn: boolean };
export type Validation = { key: string; lines: Record<string, ServerLine>; qualifies: boolean; fx: Fx | null };

export const itemsKeyOf = (items: CartItem[]) => items.map((i) => `${i.productId}:${i.quantity}:${i.priceMinor}:${i.mode}`).join("|");

type Snapshot = { data: Validation | null; error: string; notices: string[]; pendingKey: string | null };
let snap: Snapshot = { data: null, error: "", notices: [], pendingKey: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<Snapshot>) => {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
};

let timer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;
let requestedKey: string | null = null;
let lastRequest: { key: string; items: CartItem[] } | null = null;

async function run(key: string, items: CartItem[]) {
  controller?.abort();
  const ctl = new AbortController();
  controller = ctl;
  try {
    const res = await fetch("/api/cart/validate", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, mode: i.mode, ...(i.mode === "buy" ? { expectedPriceMinor: i.priceMinor } : {}) })) }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { lines: ServerLine[]; qualifiesForPromo: boolean; fx?: Fx | null };
    if (ctl.signal.aborted) return;
    const added: string[] = [];
    // Cantidades por encima de lo disponible: se ajustan y se avisa (la nueva cantidad dispara una nueva validación).
    for (const l of body.lines) {
      if (l.status === "over_limit" && l.maxQuantity > 0) {
        cartActions.setQuantity(l.productId, l.maxQuantity);
        added.push(`Ajustamos la cantidad de «${l.product?.title ?? "un producto"}» a ${l.maxQuantity}: es lo máximo disponible por pedido.`);
      }
    }
    set({ data: { key, lines: Object.fromEntries(body.lines.map((l) => [l.productId, l])), qualifies: Boolean(body.qualifiesForPromo), fx: body.fx ?? null }, error: "", pendingKey: null, notices: added.length ? [...snap.notices, ...added] : snap.notices });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    requestedKey = null;
    set({ error: "No pudimos verificar precios y disponibilidad.", pendingKey: null });
  }
}

/** Pide la validación de este contenido (con una pequeña espera por si el cliente sigue tocando «+»). No repite lo que ya se pidió o ya se respondió. */
function request(key: string, items: CartItem[]) {
  lastRequest = { key, items };
  if (key === snap.data?.key || key === requestedKey) return;
  requestedKey = key;
  if (timer) clearTimeout(timer);
  set({ pendingKey: key });
  timer = setTimeout(() => void run(key, items), 150);
}

function retry() {
  requestedKey = null;
  set({ data: null, error: "" });
  if (lastRequest) request(lastRequest.key, lastRequest.items);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => snap;
const serverSnapshot: Snapshot = { data: null, error: "", notices: [], pendingKey: null };

/**
 * `active`: solo valida mientras alguien lo está mostrando (panel abierto o página del pedido).
 * `data` conserva la última respuesta mientras llega la siguiente (los precios no «parpadean» al tocar «+»); `fresh` indica que ya corresponde al contenido actual.
 */
export function useCartValidation(active: boolean) {
  const cart = useCart();
  const s = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
  const key = itemsKeyOf(cart.items);
  useEffect(() => {
    if (!active || cart.items.length === 0) return;
    request(key, cart.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);
  return {
    data: s.data,
    fresh: s.data?.key === key,
    error: s.error,
    notices: s.notices,
    retry,
    clearNotices: () => set({ notices: [] }),
  };
}
