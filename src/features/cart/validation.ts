"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { kindLabel, Language } from "@/content/schema";
import type { toneBg } from "@/components/tones";
import { failureMessage, failureOf, failureOfStatus, isAbort, requestJson, type FailureKind } from "@/lib/request";
import { cartActions, useCart, type CartItem } from "./store";

/** Plazo máximo de la verificación del carrito (la respuesta normal tarda menos de un segundo). */
const VALIDATE_TIMEOUT_MS = 10_000;

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
  product?: { slug: string; title: string; sku: string; language: Language; kind: keyof typeof kindLabel; fallbackTone: keyof typeof toneBg; packSize?: number | null; imageSrc: string | null; imageAlt: string };
};
export type Fx = { rate10k: number; mode: "auto" | "manual"; warn: boolean };
/** Importes de una línea calculados por el SERVIDOR (lista, combo caja + sobres y total a pagar). */
export type ServerPricedLine = { productId: string; quantity: number; listUnitMinor: number; listTotalMinor: number; comboUnits: number; comboDiscountMinor: number; finalTotalMinor: number };
export type ServerPricing = { lines: ServerPricedLine[]; subtotalMinor: number; comboDiscountMinor: number; totalMinor: number };
export type ComboInfo = { headline: string; percent: number; perBox: number; enabled: boolean; boxes: number; slots: number; usedSlots: number; freeSlots: number };
export type ServerSuggestion = { productId: string; slug: string; title: string; presentation: string; kind: keyof typeof kindLabel; reason: string; priceMinor: number; comboPriceMinor: number | null; imageSrc: string | null; imageAlt: string; maxQuantity: number; packSize: number | null };
export type Validation = { key: string; lines: Record<string, ServerLine>; fx: Fx | null; pricing: { base: ServerPricing } | null; combo: ComboInfo | null; suggestions: ServerSuggestion[] };

export const pricingFor = (v: Validation | null | undefined): ServerPricing | null => v?.pricing?.base ?? null;

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
    // Plazo máximo: sin él, una red colgada deja «Verificando…» y los botones del pedido en espera hasta que el navegador corte (minutos).
    const res = await requestJson<{ lines: ServerLine[]; fx?: Fx | null; pricing?: { base: ServerPricing }; combo?: ComboInfo; suggestions?: ServerSuggestion[] }>("/api/cart/validate", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, timeoutMs: VALIDATE_TIMEOUT_MS,
      body: JSON.stringify({ items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, mode: i.mode, ...(i.mode === "buy" ? { expectedPriceMinor: i.priceMinor } : {}) })) }),
    });
    const body = res.data;
    if (!res.ok || !body || !Array.isArray(body.lines)) throw Object.assign(new Error(String(res.status)), { failure: failureOfStatus(res.status) });
    if (ctl.signal.aborted) return;
    const added: string[] = [];
    // Cantidades por encima de lo disponible: se ajustan y se avisa (la nueva cantidad dispara una nueva validación).
    for (const l of body.lines) {
      if (l.status === "over_limit" && l.maxQuantity > 0) {
        cartActions.setQuantity(l.productId, l.maxQuantity);
        added.push(`Ajustamos la cantidad de «${l.product?.title ?? "un producto"}» a ${l.maxQuantity}: es lo máximo disponible por pedido.`);
      }
    }
    set({ data: { key, lines: Object.fromEntries(body.lines.map((l) => [l.productId, l])), fx: body.fx ?? null, pricing: body.pricing ?? null, combo: body.combo ?? null, suggestions: body.suggestions ?? [] }, error: "", pendingKey: null, notices: added.length ? [...snap.notices, ...added] : snap.notices });
  } catch (e) {
    if (isAbort(e) || ctl.signal.aborted) return; // lo reemplazó un pedido más nuevo
    requestedKey = null;
    const kind = (e as { failure?: FailureKind }).failure ?? failureOf(e);
    // El error no borra la última respuesta buena: `fresh` ya indica que NO corresponde al contenido actual, así que sus importes no se usan.
    set({ error: failureMessage(kind, "verificar precios y disponibilidad"), pendingKey: null });
  }
}

/** Pide la validación de este contenido (con una pequeña espera por si el cliente sigue tocando «+»). No repite lo que ya se pidió o ya se respondió. */
function request(key: string, items: CartItem[]) {
  lastRequest = { key, items };
  if (key === snap.data?.key || key === requestedKey) return;
  requestedKey = key;
  if (timer) clearTimeout(timer);
  set({ pendingKey: key });
  // La primera validación sale enseguida (no hay nada que juntar); las siguientes esperan un instante por si la persona sigue tocando «+».
  timer = setTimeout(() => void run(key, items), snap.data ? 150 : 0);
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
