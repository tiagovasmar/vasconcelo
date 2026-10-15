"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cartActions, cartCount, cartDrawer, useCart, type CartItem } from "@/features/cart/store";
import { useCartValidation, type ServerLine } from "@/features/cart/validation";
import { formatARS } from "@/lib/format";
import { LanguageBadge } from "./language-badge";
import { kindLabel } from "@/content/labels";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Cantidad editable: se puede tocar «−»/«+» o escribir el número (se confirma al salir del campo o con Enter; se ajusta a 1 … máximo). */
function Quantity({ item, name, max }: { item: CartItem; name: string; max: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.floor(Number(draft));
    const empty = draft.trim() === "";
    setDraft(null);
    if (empty || !Number.isFinite(n)) return;
    cartActions.setQuantity(item.productId, Math.min(Math.max(1, n), max));
  };
  return (
    <div className="flex h-11 items-center border border-ink/40 bg-white" role="group" aria-label={`Cantidad de ${name}`}>
      <button type="button" disabled={item.quantity <= 1} onClick={() => cartActions.setQuantity(item.productId, item.quantity - 1)} aria-label={`Disminuir cantidad de ${name}`} className="h-11 w-10 text-xl hover:bg-gold disabled:opacity-40">−</button>
      <input
        type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" aria-label={`Cantidad de ${name} (escribí un número)`} data-testid={`drawer-cantidad-${item.productId}`}
        value={draft ?? String(item.quantity)} onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))} onFocus={(e) => e.currentTarget.select()}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape" && draft !== null) { e.stopPropagation(); setDraft(null); } }}
        className="h-11 w-11 border-x border-ink/20 bg-transparent text-center text-base font-bold outline-none focus:bg-gold/30"
      />
      <button type="button" disabled={item.quantity >= max} onClick={() => cartActions.setQuantity(item.productId, item.quantity + 1)} aria-label={`Aumentar cantidad de ${name}`} className="h-11 w-10 text-xl hover:bg-gold disabled:opacity-40">+</button>
    </div>
  );
}

function Line({ item, line, onNavigate }: { item: CartItem; line?: ServerLine; onNavigate: () => void }) {
  const p = line?.product;
  const name = p?.title ?? item.title ?? "Producto";
  const src = item.imageSrc ?? p?.imageSrc ?? null;
  const porEncargo = item.mode === "encargo";
  const unit = line?.unitPriceMinor ?? item.priceMinor;
  const pendiente = line?.status === "pending_commercial";
  const max = Math.max(1, line ? line.maxQuantity || 99 : 99);
  const aviso =
    line?.status === "price_changed" ? "Cambió el precio: confirmalo en el pedido." :
    line?.status === "retired" ? "Producto retirado de la tienda: quitalo para continuar." :
    line?.status === "unavailable" ? "Ya no está en el catálogo: quitalo para continuar." :
    line?.status === "out_of_stock" ? "Sin stock por ahora: podés consultarlo por encargo en el pedido." :
    pendiente ? "Precio por confirmar: podés consultarlo por encargo en el pedido." : "";
  return (
    <li className="py-4" data-testid={`drawer-linea-${item.productId}`}>
      <div className="grid grid-cols-[64px_1fr] gap-3">
        <div className="flex aspect-square items-center justify-center overflow-hidden bg-white">
          {src ? <Image src={src} alt="" width={96} height={96} sizes="64px" className="h-full w-full object-contain" /> : <span className="text-[.6rem] font-bold uppercase text-ink/75">{p ? kindLabel[p.kind] : "—"}</span>}
        </div>
        <div className="min-w-0">
          {p ? <Link href={`/productos/${p.slug}`} onClick={onNavigate} className="block font-bold leading-tight hover:underline">{name}</Link> : <p className="font-bold leading-tight">{name}</p>}
          {p && <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink/65"><LanguageBadge language={p.language} size="plain" /> · {kindLabel[p.kind]}</p>}
          <p className="mt-1 text-sm">
            {porEncargo ? <b>Cotización a confirmar</b> : pendiente ? <b>Precio a confirmar</b> : unit > 0 || line ? <><b>{formatARS(unit)}</b> <span className="text-ink/60">c/u</span></> : <span className="text-ink/60">Verificando precio…</span>}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <Quantity item={item} name={name} max={max} />
        <p className="text-base font-extrabold" data-testid={`drawer-subtotal-${item.productId}`}>{porEncargo || pendiente || (!line && unit === 0) ? "—" : formatARS(unit * item.quantity)}</p>
        <button type="button" onClick={() => cartActions.remove(item.productId)} aria-label={`Quitar ${name} del carrito`} className="min-h-11 px-1 text-sm font-semibold underline hover:text-vermilion">Quitar</button>
      </div>
      {aviso && <p role="status" className="mt-2 border-l-4 border-vermilion bg-vermilion/10 p-2 text-xs">{aviso}</p>}
    </li>
  );
}

export default function CartDrawerPanel() {
  const cart = useCart();
  const pathname = usePathname();
  const { data, error, retry, notices, clearNotices } = useCartValidation(true);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipRestore = useRef(false);
  const units = cartCount(cart);

  // Se cierra solo al cambiar de página (p. ej. al tocar un producto o «Continuar»).
  const first = useRef(pathname);
  useEffect(() => {
    if (first.current !== pathname) cartDrawer.close();
  }, [pathname]);

  // Foco, bloqueo del desplazamiento del fondo y devolución del foco al cerrar.
  useEffect(() => {
    const html = document.documentElement;
    const scrollbar = window.innerWidth - html.clientWidth;
    const prevPad = document.body.style.paddingRight;
    html.dataset.cartDrawer = "open";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    titleRef.current?.focus();
    return () => {
      delete html.dataset.cartDrawer;
      document.body.style.paddingRight = prevPad;
      const el = cartDrawer.takeReturnFocus();
      if (skipRestore.current) return;
      const target = el && el.isConnected ? el : (document.querySelector("[data-cart-trigger]") as HTMLElement | null);
      target?.focus();
    };
  }, []);

  // Escape cierra; Tab queda dentro del panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cartDrawer.close();
      } else if (e.key === "Tab" && panelRef.current) {
        const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const firstEl = els[0];
        const lastEl = els[els.length - 1];
        const active = document.activeElement;
        if (!panelRef.current.contains(active)) { e.preventDefault(); firstEl.focus(); }
        else if (e.shiftKey && (active === firstEl || active === titleRef.current)) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const leave = () => { skipRestore.current = true; };
  const stockItems = cart.items.filter((i) => i.mode !== "encargo");
  const encargoCount = cart.items.length - stockItems.length;
  const subtotal = stockItems.reduce((n, i) => {
    const l = data?.lines[i.productId];
    if (!l) return n + i.priceMinor * i.quantity;
    return l.status === "ok" || l.status === "price_changed" ? n + (l.unitPriceMinor ?? 0) * i.quantity : n;
  }, 0);
  const last = cart.lastAdded;

  return (
    <div className="fixed inset-0 z-[120]" data-testid="cart-drawer-root">
      <div className="cart-drawer-backdrop absolute inset-0 bg-ink/60" onClick={() => cartDrawer.close()} aria-hidden="true" />
      <aside
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" data-testid="cart-drawer"
        className="cart-drawer-panel absolute inset-y-0 right-0 flex h-dvh w-full max-w-[26rem] flex-col bg-paper shadow-[-12px_0_32px_rgba(18,23,21,.35)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-ink/20 bg-white/60 px-4 py-3">
          <h2 id="cart-drawer-title" ref={titleRef} tabIndex={-1} className="display text-3xl normal-case outline-none">Tu carrito{units > 0 && <span className="ml-2 text-lg text-ink/60" data-testid="drawer-unidades">({units})</span>}</h2>
          <button type="button" onClick={() => cartDrawer.close()} aria-label="Cerrar el carrito" className="flex h-11 w-11 items-center justify-center text-3xl leading-none hover:bg-gold">×</button>
        </header>
        <p role="status" aria-live="polite" className="sr-only">{last ? `${last.mode === "encargo" ? "Sumaste por encargo" : "Agregaste"} ${last.quantity} ${last.title}` : ""}</p>

        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="display text-3xl normal-case">Tu carrito está vacío.</p>
            <p className="text-sm text-ink/70">Explorá los sellados y sumá lo que quieras: después coordinamos por WhatsApp.</p>
            <Link href="/sellados" onClick={leave} className="bg-gold px-5 py-3 font-bold hover:bg-ink hover:text-paper">Ver todos los sellados</Link>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
              {notices.length > 0 && (
                <div role="status" className="mt-3 border-l-4 border-emerald bg-emerald/10 p-3 text-sm">
                  {notices.map((n, i) => <p key={i}>{n}</p>)}
                  <button type="button" onClick={clearNotices} className="mt-1 font-semibold underline">Entendido</button>
                </div>
              )}
              {error && (
                <div role="alert" className="mt-3 border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm">
                  <p>{error}</p>
                  <button type="button" onClick={retry} className="mt-1 min-h-11 font-semibold underline">Reintentar</button>
                </div>
              )}
              <ul className="divide-y divide-ink/15">
                {cart.items.map((item) => <Line key={item.productId} item={item} line={data?.lines[item.productId]} onNavigate={leave} />)}
              </ul>
            </div>
            <footer className="border-t-2 border-ink bg-white/70 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {stockItems.length > 0 ? (
                <p className="flex items-end justify-between gap-3"><span className="text-sm font-bold">Subtotal de productos</span><b className="text-2xl font-extrabold" data-testid="drawer-subtotal">{!data && subtotal === 0 ? "…" : formatARS(subtotal)}</b></p>
              ) : (
                <p className="text-sm font-bold">Consulta por encargo: sin importe todavía.</p>
              )}
              <p className="mt-1 text-xs text-ink/70">{encargoCount > 0 && stockItems.length > 0 ? "No incluye los productos por encargo. " : ""}Envío a coordinar. Los importes finales los confirma la tienda por WhatsApp.</p>
              <Link href="/carrito" onClick={leave} data-testid="drawer-continuar" className="mt-3 flex min-h-12 w-full items-center justify-center bg-emerald px-6 text-base font-bold text-paper hover:bg-emerald-2">Continuar con el pedido</Link>
              <button type="button" onClick={() => cartDrawer.close()} className="mt-1 min-h-11 w-full text-sm font-semibold underline">Seguir comprando</button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
