"use client";

import { useSyncExternalStore } from "react";
import { paymentMethods } from "@/content/checkout-options";

/**
 * Carrito del navegador (localStorage). Guarda SOLO ids, cantidades y el precio que el cliente vio (para poder avisar
 * cambios). No es una fuente confiable de importes: el servidor revalida todo.
 */
/** `mode`: buy = compra de lo disponible · encargo = consulta por encargo (sin precio ni cotización; el servidor decide). */
export type CartMode = "buy" | "encargo";
/** `title` e `imageSrc` son solo para mostrar el panel lateral al instante (sin esperar al servidor); nunca se usan para calcular nada. */
export type CartItem = { productId: string; quantity: number; priceMinor: number; mode: CartMode; title?: string; imageSrc?: string | null };
export type DeliveryDraft = { method: "" | "andreani" | "moto" | "retiro"; locality: string; province: string; postalCode: string };
export type CartState = {
  items: CartItem[];
  delivery: DeliveryDraft;
  /** Método de pago elegido; vacío = todavía no eligió uno vigente (también el caso de un carrito viejo con una opción que ya no existe). */
  payment: string;
  contactName: string;
  /** Teléfono opcional para que la tienda pueda responder. */
  contactPhone: string;
  /** Clave de idempotencia vigente y la huella del contenido al que pertenece. */
  idem: { sig: string; key: string } | null;
  /** Último producto agregado (para el aviso flotante). */
  lastAdded: { title: string; quantity: number; seq: number; mode?: CartMode } | null;
};

const KEY = "tienda-carrito-v1";
const emptyDelivery: DeliveryDraft = { method: "", locality: "", province: "", postalCode: "" };
const empty: CartState = { items: [], delivery: emptyDelivery, payment: "", contactName: "", contactPhone: "", idem: null, lastAdded: null };
const validPayments: string[] = paymentMethods.map((p) => p.id);

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
        items.push({ productId: o.productId, quantity: q, priceMinor: p, mode: o.mode === "encargo" ? "encargo" : "buy", ...(typeof o.title === "string" && o.title ? { title: o.title.slice(0, 160) } : {}), ...(typeof o.imageSrc === "string" && o.imageSrc.startsWith("/") && o.imageSrc.length <= 300 ? { imageSrc: o.imageSrc } : {}) });
      }
    }
  }
  const d = (r.delivery ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
  const method = ["andreani", "moto", "retiro"].includes(d.method as string) ? (d.method as DeliveryDraft["method"]) : "";
  const idem = r.idem as { sig?: unknown; key?: unknown } | null;
  return {
    items,
    delivery: { method, locality: str(d.locality), province: str(d.province), postalCode: str(d.postalCode, 12) },
    // Un método que ya no existe (p. ej. «coordinar» de un carrito viejo) no se conserva: hay que elegir uno vigente.
    payment: validPayments.includes(str(r.payment, 30)) ? str(r.payment, 30) : "",
    contactName: str(r.contactName, 60),
    contactPhone: str(r.contactPhone, 20),
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

/**
 * Panel lateral del carrito (no se guarda: arranca cerrado). Comparte el estado de `cartActions` con el pedido (/carrito): es la misma lista, no una copia.
 * Al abrir recuerda qué elemento tenía el foco para devolvérselo al cerrar.
 */
let drawerOpen = false;
let returnFocusTo: HTMLElement | null = null;
const drawerListeners = new Set<() => void>();
export const cartDrawer = {
  open() {
    if (drawerOpen) return;
    if (typeof document !== "undefined") {
      const a = document.activeElement;
      returnFocusTo = a instanceof HTMLElement && a !== document.body ? a : null;
    }
    drawerOpen = true;
    drawerListeners.forEach((l) => l());
  },
  close() {
    if (!drawerOpen) return;
    drawerOpen = false;
    drawerListeners.forEach((l) => l());
  },
  isOpen: () => drawerOpen,
  /** Elemento al que corresponde devolver el foco (una sola vez). */
  takeReturnFocus(): HTMLElement | null {
    const el = returnFocusTo;
    returnFocusTo = null;
    return el;
  },
};
export function useCartDrawerOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      drawerListeners.add(cb);
      return () => drawerListeners.delete(cb);
    },
    () => drawerOpen,
    () => false,
  );
}

export const cartActions = {
  /** Suma al carrito sin duplicar líneas; respeta `max` (stock/límite por pedido). Devuelve cuántas unidades quedaron. */
  add(productId: string, title: string, quantity: number, priceMinor: number, max = 99, mode: CartMode = "buy", imageSrc?: string | null) {
    load();
    const q = Math.max(1, Math.floor(quantity));
    const cur = state.items.find((i) => i.productId === productId);
    // Un producto es una sola línea: si ya estaba con otro modo, pasa al nuevo y la cantidad previa se conserva solo si es del mismo modo.
    const base = cur && cur.mode === mode ? cur.quantity : 0;
    const nextQty = Math.min(max, base + q);
    const shown = { title: title.slice(0, 160), ...(imageSrc && imageSrc.startsWith("/") && imageSrc.length <= 300 ? { imageSrc } : {}) };
    const items = cur ? state.items.map((i) => (i.productId === productId ? { ...i, quantity: nextQty, priceMinor, mode, ...shown } : i)) : [...state.items, { productId, quantity: nextQty, priceMinor, mode, ...shown }];
    commit({ ...state, items, lastAdded: { title, quantity: nextQty - base, seq: (state.lastAdded?.seq ?? 0) + 1, mode } });
    // Se abre el panel lateral solo si realmente se sumó algo (si ya estaba en el máximo no pasó nada nuevo).
    if (nextQty - base > 0) cartDrawer.open();
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
  setContactPhone(contactPhone: string) {
    load();
    commit({ ...state, contactPhone: contactPhone.slice(0, 20) });
  },
  setIdempotency(idem: { sig: string; key: string } | null) {
    load();
    commit({ ...state, idem });
  },
  /** Al cerrar sesión: se conservan los productos pero se borran el nombre y los datos de entrega del formulario. */
  clearPersonal() {
    load();
    commit({ ...state, delivery: emptyDelivery, contactName: "", contactPhone: "", idem: null });
  },
  clear() {
    load();
    commit({ ...empty, delivery: state.delivery, payment: state.payment, contactName: state.contactName, contactPhone: state.contactPhone });
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

/**
 * Lee solo un dato del carrito (número, texto o booleano): el componente se vuelve a dibujar únicamente si ESE dato cambia. Las tarjetas del catálogo usan
 * esto para no redibujarse todas juntas cada vez que se agrega o se cambia otra cosa del carrito.
 */
export function useCartSelect<T extends string | number | boolean | null>(select: (s: CartState) => T): T {
  return useSyncExternalStore(subscribe, () => select(getSnapshot()), () => select(empty));
}

export const cartCount = (s: CartState) => s.items.reduce((n, i) => n + i.quantity, 0);
