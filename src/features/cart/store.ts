"use client";

import { useSyncExternalStore } from "react";

/**
 * Carrito del navegador (localStorage). Guarda SOLO ids, cantidades y el precio que el cliente vio (para poder avisar
 * cambios). No es una fuente confiable de importes: el servidor revalida todo.
 */
/** `mode`: buy = compra de lo disponible · encargo = consulta por encargo (sin precio ni cotización; el servidor decide). */
export type CartMode = "buy" | "encargo";
export type CartItem = { productId: string; quantity: number; priceMinor: number; mode: CartMode };
export type DeliveryDraft = { method: "" | "andreani" | "moto" | "retiro"; locality: string; province: string; postalCode: string; pickupPoint: string };
export type CartState = {
  items: CartItem[];
  delivery: DeliveryDraft;
  payment: string;
  contactName: string;
  /** Clave de idempotencia vigente y la huella del contenido al que pertenece. */
  idem: { sig: string; key: string } | null;
  /** Último producto agregado (para el aviso flotante). */
  lastAdded: { title: string; quantity: number; seq: number; mode?: CartMode } | null;
};

const KEY = "tienda-carrito-v1";
const emptyDelivery: DeliveryDraft = { method: "", locality: "", province: "", postalCode: "", pickupPoint: "" };
const empty: CartState = { items: [], delivery: emptyDelivery, payment: "coordinar", contactName: "", idem: null, lastAdded: null };

let state: CartState = empty;
let loaded = false;
const listeners = new Set<() => void>();

const int = (n: unknown, min: number, max: number) => (Number.isInteger(n) && (n as number) >= min && (n as number) <= max ? (n as number) : null);

/** Lee y sanea lo guardado: ignora cualquier cosa que no tenga la forma esperada. */
function sanitize(raw: unknown): CartState {
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const items: CartItem[] = [];
  if (Array.isArray(r.items)) {
    for (const it of r.items) {
      const o = it as Record<string, unknown>;
      const q = int(o?.quantity, 1, 99);
      const p = int(o?.priceMinor, 0, 1_000_000_000);
      if (typeof o?.productId === "string" && o.productId.length <= 80 && q !== null && p !== null && !seen.has(o.productId)) {
        seen.add(o.productId);
        items.push({ productId: o.productId, quantity: q, priceMinor: p, mode: o.mode === "encargo" ? "encargo" : "buy" });
      }
    }
  }
  const d = (r.delivery ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
  const method = ["andreani", "moto", "retiro"].includes(d.method as string) ? (d.method as DeliveryDraft["method"]) : "";
  const idem = r.idem as { sig?: unknown; key?: unknown } | null;
  return {
    items,
    delivery: { method, locality: str(d.locality), province: str(d.province), postalCode: str(d.postalCode, 12), pickupPoint: str(d.pickupPoint, 30) },
    payment: str(r.payment, 30) || "coordinar",
    contactName: str(r.contactName, 60),
    idem: idem && typeof idem.sig === "string" && typeof idem.key === "string" ? { sig: idem.sig, key: idem.key } : null,
    lastAdded: null,
  };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = sanitize(JSON.parse(raw));
  } catch {
    state = empty; // localStorage no disponible o dañado: se trabaja en memoria
  }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      try {
        state = { ...sanitize(e.newValue ? JSON.parse(e.newValue) : null), lastAdded: state.lastAdded };
      } catch {
        /* ignorar */
      }
      emit();
    }
  });
}

function emit() {
  listeners.forEach((l) => l());
}
function commit(next: CartState) {
  state = next;
  try {
    const { lastAdded, ...persist } = next;
    void lastAdded;
    window.localStorage.setItem(KEY, JSON.stringify(persist));
  } catch {
    /* sin persistencia: el carrito sigue funcionando en memoria */
  }
  emit();
}

export const cartActions = {
  /** Suma al carrito sin duplicar líneas; respeta `max` (stock/límite por pedido). Devuelve cuántas unidades quedaron. */
  add(productId: string, title: string, quantity: number, priceMinor: number, max = 99, mode: CartMode = "buy") {
    load();
    const q = Math.max(1, Math.floor(quantity));
    const cur = state.items.find((i) => i.productId === productId);
    // Un producto es una sola línea: si ya estaba con otro modo, pasa al nuevo y la cantidad previa se conserva solo si es del mismo modo.
    const base = cur && cur.mode === mode ? cur.quantity : 0;
    const nextQty = Math.min(max, base + q);
    const items = cur ? state.items.map((i) => (i.productId === productId ? { ...i, quantity: nextQty, priceMinor, mode } : i)) : [...state.items, { productId, quantity: nextQty, priceMinor, mode }];
    commit({ ...state, items, lastAdded: { title, quantity: nextQty - base, seq: (state.lastAdded?.seq ?? 0) + 1, mode } });
    return { quantity: nextQty, clamped: base + q > max };
  },
  /** Pasa una línea a compra o a consulta por encargo (p. ej. un producto que quedó sin precio o sin stock). */
  setMode(productId: string, mode: CartMode) {
    load();
    commit({ ...state, items: state.items.map((i) => (i.productId === productId ? { ...i, mode } : i)) });
  },
  setQuantity(productId: string, quantity: number) {
    load();
    const q = int(quantity, 1, 99);
    if (q === null) return;
    commit({ ...state, items: state.items.map((i) => (i.productId === productId ? { ...i, quantity: q } : i)) });
  },
  remove(productId: string) {
    load();
    commit({ ...state, items: state.items.filter((i) => i.productId !== productId) });
  },
  /** El cliente aceptó el precio nuevo. */
  acceptPrice(productId: string, priceMinor: number) {
    load();
    commit({ ...state, items: state.items.map((i) => (i.productId === productId ? { ...i, priceMinor } : i)) });
  },
  setDelivery(patch: Partial<DeliveryDraft>) {
    load();
    commit({ ...state, delivery: { ...state.delivery, ...patch } });
  },
  setPayment(payment: string) {
    load();
    commit({ ...state, payment });
  },
  setContactName(contactName: string) {
    load();
    commit({ ...state, contactName: contactName.slice(0, 60) });
  },
  setIdempotency(idem: { sig: string; key: string } | null) {
    load();
    commit({ ...state, idem });
  },
  /** Al cerrar sesión: se conservan los productos pero se borran el nombre y los datos de entrega del formulario. */
  clearPersonal() {
    load();
    commit({ ...state, delivery: emptyDelivery, contactName: "", idem: null });
  },
  clear() {
    load();
    commit({ ...empty, delivery: state.delivery, payment: state.payment, contactName: state.contactName });
  },
};

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getSnapshot = () => {
  load();
  return state;
};

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, () => empty);
}

export const cartCount = (s: CartState) => s.items.reduce((n, i) => n + i.quantity, 0);
