"use client";

import Link from "next/link";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { cartCount, cartDrawer, useCart, useCartDrawerOpen, useCartSelect } from "@/features/cart/store";
import { useDrawerShell } from "./cart-drawer-shell";

/**
 * Cáscara del panel lateral del carrito: vive en el layout y es mínima. El panel completo (lista, cantidades, foco, teclado) se descarga aparte,
 * solo cuando hace falta: si ya hay productos en el carrito (en un tiempo libre, para que abrir sea instantáneo) o cuando se acerca el mouse/dedo al ícono del carrito o a un botón
 * de agregar. Con el carrito vacío y sin interacción no se descarga nada: la primera carga de cada página no paga el panel.
 *
 * Mientras el panel completo se descarga se muestra un marco que YA se puede cerrar (botón, Escape y fondo). Si la descarga falla (red cortada, archivo viejo tras un
 * despliegue) o el panel se rompe al dibujarse, el marco ofrece «Reintentar» y una salida a la página del pedido; el carrito vive en el navegador y no se pierde.
 * Nada se recarga solo: ni la página ni la descarga.
 */
type PanelModule = typeof import("./cart-drawer-panel");
let panelModule: PanelModule | null = null;
let inflight: Promise<PanelModule> | null = null;
let lastFailureAt = 0;
/** Tras un fallo, la precarga automática (mouse, foco, tiempo libre) espera un rato antes de volver a intentar: abrir el panel o «Reintentar» sí lo intentan al instante. */
const PRELOAD_COOLDOWN_MS = 30_000;

function loadPanel(): Promise<PanelModule> {
  if (panelModule) return Promise.resolve(panelModule);
  inflight ??= import("./cart-drawer-panel").then(
    (m) => (panelModule = m),
    (e) => {
      inflight = null; // el próximo intento vuelve a pedir el archivo
      lastFailureAt = Date.now();
      throw e;
    },
  );
  return inflight;
}

export function preloadCartDrawer() {
  if (panelModule || inflight) return;
  if (lastFailureAt && Date.now() - lastFailureAt < PRELOAD_COOLDOWN_MS) return;
  loadPanel().catch(() => {}); // un fallo de la precarga no es un error de la persona: se reintenta al abrir el panel
}

/** Marco del panel: se ve al instante al tocar el carrito, mientras llega el panel completo o si no se pudo cargar. */
function Marco({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const cart = useCart();
  const units = cartCount(cart);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipRestore = useRef(false);
  useDrawerShell(panelRef, titleRef, skipRestore);
  return (
    <div className="fixed inset-0 z-[120]" data-testid="cart-drawer-cargando" data-estado={failed ? "error" : "cargando"}>
      <div className="absolute inset-0 bg-ink/60" onClick={() => cartDrawer.close()} aria-hidden="true" data-testid="cart-drawer-fondo" />
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" aria-busy={!failed} className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-[26rem] flex-col bg-paper shadow-[-12px_0_32px_rgba(18,23,21,.35)]">
        <header className="flex items-center justify-between gap-3 border-b border-ink/20 bg-white/60 px-4 py-3">
          <h2 id="cart-drawer-title" ref={titleRef} tabIndex={-1} className="display text-3xl normal-case outline-none">Tu carrito{units > 0 && <span className="ml-2 text-lg text-ink/60">({units})</span>}</h2>
          <button type="button" onClick={() => cartDrawer.close()} aria-label="Cerrar el carrito" className="flex h-11 w-11 items-center justify-center text-3xl leading-none hover:bg-gold" data-testid="cart-drawer-cerrar">×</button>
        </header>
        {failed ? (
          <div className="px-4 py-6 text-sm" role="alert" data-testid="cart-drawer-error">
            <p className="font-bold">No pudimos abrir el carrito.</p>
            <p className="mt-1 text-ink/80">Puede ser la conexión. {units === 0 ? "No se perdió nada." : `${units === 1 ? "Tu producto sigue guardado" : "Tus productos siguen guardados"}: no se perdió nada.`}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={onRetry} className="min-h-11 bg-ink px-5 font-bold text-paper hover:bg-emerald" data-testid="cart-drawer-reintentar">Reintentar</button>
              <Link href="/carrito" className="flex min-h-11 items-center border-2 border-ink px-5 font-bold hover:bg-gold" data-testid="cart-drawer-ir-pedido">Ir al pedido</Link>
              {/* Si la pestaña quedó abierta antes de un despliegue, el archivo viejo ya no existe y reintentar no alcanza: recargar (a pedido de la persona, nunca solo) trae la versión nueva. El carrito está en el navegador y se conserva. */}
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 px-3 text-sm font-semibold underline" data-testid="cart-drawer-actualizar">Actualizar la página</button>
            </div>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-ink/70" role="status">Cargando…</p>
        )}
      </aside>
    </div>
  );
}

/** Si el panel completo lanza un error al dibujarse, se cae al marco con «Reintentar» (sin esto la persona vería una página en blanco con el fondo bloqueado). */
class PanelBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Drawer() {
  const [attempt, setAttempt] = useState(0);
  // Resultado de la descarga del intento `attempt` (null = en curso). Si el módulo ya estaba cargado no hace falta esperar nada.
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);
  const [crashed, setCrashed] = useState(false);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (panelModule) return;
    let live = true;
    loadPanel().then(
      () => live && redraw((n) => n + 1), // llegó el módulo: se redibuja con el panel completo
      () => live && setFailedAttempt(attempt),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = () => {
    setFailedAttempt(null);
    setCrashed(false);
    setAttempt((n) => n + 1);
  };
  const marco = (failed: boolean) => <Marco failed={failed} onRetry={retry} />;
  if (panelModule && !crashed) {
    const Panel = panelModule.default;
    return (
      <PanelBoundary key={attempt} fallback={null} onError={() => setCrashed(true)}>
        <Panel />
      </PanelBoundary>
    );
  }
  return marco(crashed || failedAttempt === attempt);
}

export function CartDrawer() {
  const open = useCartDrawerOpen();
  const hayProductos = useCartSelect((s) => s.items.length > 0);
  useEffect(() => {
    if (!hayProductos) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadCartDrawer, { timeout: 6000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(preloadCartDrawer, 4000);
    return () => clearTimeout(t);
  }, [hayProductos]);
  return open ? <Drawer /> : null;
}
