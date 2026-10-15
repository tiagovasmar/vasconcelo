"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatARS } from "@/lib/format";
import { cartActions, cartCount, cartDrawer, useCart, useCartDrawerOpen } from "@/features/cart/store";
import { preloadCartDrawer } from "./cart-drawer";
import { ENCARGO_EXPLICACION } from "@/features/politicas/encargos";
import { encargo as encargoPolitica } from "@/content/politicas";
import { ENCARGO_MAX } from "@/features/inquiries/pricing";
import { CartIcon, PlusIcon } from "./icons";

/**
 * Ícono del carrito en la cabecera, con la cantidad de unidades. Abre el panel lateral; dentro del pedido (/carrito) ya se está viendo el carrito y
 * el ícono lleva a esa página.
 */
export function CartLink() {
  const cart = useCart();
  const open = useCartDrawerOpen();
  const pathname = usePathname();
  const count = cartCount(cart);
  const label = count ? `Carrito, ${count} ${count === 1 ? "unidad" : "unidades"}` : "Carrito, vacío";
  const cls = "relative flex min-h-11 items-center gap-2 px-3 py-2 text-sm hover:bg-ink/5";
  const badge = count > 0 && (
    <span className="absolute -right-0.5 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[.7rem] font-extrabold text-ink" aria-hidden="true" data-testid="cart-count">
      {count}
    </span>
  );
  if (pathname.startsWith("/carrito")) {
    return <Link href="/carrito" className={cls} aria-label={label} data-cart-trigger>{<CartIcon />}{badge}</Link>;
  }
  return (
    <button type="button" className={cls} aria-label={label} aria-haspopup="dialog" aria-expanded={open} data-cart-trigger onPointerEnter={preloadCartDrawer} onFocus={preloadCartDrawer} onClick={() => cartDrawer.open()}>
      <CartIcon />
      {badge}
    </button>
  );
}

type AddProps = { productId: string; title: string; /** Foto de portada (solo para mostrar el producto en el panel lateral). */ imageSrc?: string | null; priceMinor: number; max: number; state: "available" | "soldout" | "pending"; /** Producto «solo por encargo» (no se vende de stock). */ orderOnly?: boolean; /** Hay unidades en stock confirmadas (solo falta el precio). */ stockKnown?: boolean };

/** Botón «agregar» de las tarjetas (sin cantidad: suma 1). */
export function AddToCartIcon({ productId, title, imageSrc, priceMinor, max, state }: AddProps) {
  const cart = useCart();
  const inCart = cart.items.find((i) => i.productId === productId)?.quantity ?? 0;
  const atLimit = inCart >= max;
  if (state !== "available" || max === 0) {
    // Sin precio o sin stock confirmado no se puede comprar, pero sí consultar por encargo (no reserva nada ni fija un precio).
    const queued = cart.items.find((i) => i.productId === productId)?.mode === "encargo";
    return (
      <button
        type="button"
        onClick={() => cartActions.add(productId, title, 1, 0, ENCARGO_MAX, "encargo", imageSrc)}
        aria-label={`Consultar por encargo: ${title}${queued ? " (ya está en tu consulta; suma una unidad)" : ""}`}
        title="Consultar por encargo: la disponibilidad y la cotización se confirman con la tienda"
        data-testid="consultar-encargo"
        className="flex min-h-11 shrink-0 items-center justify-center border border-ink bg-white px-2.5 text-xs font-bold hover:bg-gold sm:min-h-12 sm:px-3 sm:text-sm"
      >
        {queued ? "Sumar encargo" : "Por encargo"}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={atLimit}
      onClick={() => cartActions.add(productId, title, 1, priceMinor, max, "buy", imageSrc)}
      aria-label={atLimit ? `${title}: ya tenés el máximo en el carrito` : `Agregar ${title} al carrito`}
      className="flex h-11 w-11 shrink-0 items-center justify-center bg-ink text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-12"
    >
      <PlusIcon />
    </button>
  );
}

/**
 * Barra inferior de la ficha (solo celular): precio y acción siempre a mano mientras el bloque de compra no se ve en pantalla. Comparte la cantidad
 * con el bloque principal y respeta la disponibilidad (sin stock o sin precio solo ofrece «Consultar encargo»: nada se compra ni se señal sin confirmar).
 * Sus botones tienen nombres distintos a los del bloque principal para no duplicar controles de igual nombre.
 */
function useOutOfView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [out, setOut] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOut(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, out] as const;
}

function BottomBar({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-paper px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_rgba(18,23,21,.18)] lg:hidden" data-testid="barra-compra">
      <div className="mx-auto flex max-w-[640px] items-center gap-2">{children}</div>
    </div>
  );
}

/** Compra desde la ficha: cantidad + agregar. */
export function AddToCartPanel({ productId, title, imageSrc, priceMinor, max, state, stockKnown = false, orderOnly = false }: AddProps) {
  const cart = useCart();
  const inCart = cart.items.find((i) => i.productId === productId)?.quantity ?? 0;
  const room = Math.max(0, max - inCart);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  const q = Math.min(Math.max(1, qty), Math.max(1, room));
  const [panelRef, out] = useOutOfView<HTMLDivElement>();
  const add = () => {
    const r = cartActions.add(productId, title, q, priceMinor, max, "buy", imageSrc);
    setMsg(`Agregaste ${q} ${q === 1 ? "unidad" : "unidades"}. Tenés ${r.quantity} en el carrito.${r.clamped ? " Llegaste al máximo por pedido." : ""}`);
    setQty(1);
  };

  if (state === "pending" || state === "soldout" || max === 0) {
    return <EncargoPanel productId={productId} title={title} imageSrc={imageSrc} pending={state === "pending"} stockKnown={stockKnown} orderOnly={orderOnly} />;
  }
  return (
    <div className="mt-4 sm:mt-6" ref={panelRef}>
      <BottomBar show={out}>
        <p className="min-w-0 flex-1 text-lg font-extrabold leading-tight" data-testid="barra-precio">{formatARS(priceMinor)}</p>
        <div className="flex h-11 items-center border border-ink/40 bg-white" role="group" aria-label="Cantidad (barra inferior)">
          <button type="button" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1} aria-label="Bajar cantidad" className="h-11 w-10 text-xl disabled:opacity-40">−</button>
          <output className="w-7 text-center font-bold" aria-label="Cantidad elegida">{q}</output>
          <button type="button" onClick={() => setQty(Math.min(room, q + 1))} disabled={q >= room} aria-label="Subir cantidad" className="h-11 w-10 text-xl disabled:opacity-40">+</button>
        </div>
        <button type="button" disabled={room === 0} onClick={add} aria-label={room === 0 ? "Máximo en el carrito" : `Sumar ${q} al pedido`} className="h-11 bg-ink px-4 text-sm font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50">
          {room === 0 ? "Máximo" : "Agregar"}
        </button>
      </BottomBar>
      <div className="flex flex-wrap gap-3">
        <div className="flex h-14 items-center border border-ink/40 bg-white" role="group" aria-label="Cantidad">
          <button type="button" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1} aria-label="Menos" className="h-14 w-12 text-xl hover:bg-gold disabled:opacity-40">−</button>
          <output className="w-10 text-center font-bold" aria-live="polite">{q}</output>
          <button type="button" onClick={() => setQty(Math.min(room, q + 1))} disabled={q >= room} aria-label="Más" className="h-14 w-12 text-xl hover:bg-gold disabled:opacity-40">+</button>
        </div>
        <button
          type="button"
          disabled={room === 0}
          onClick={add}
          className="h-14 flex-1 bg-ink px-6 font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          {room === 0 ? "Máximo en el carrito" : "Agregar al carrito"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink/65">Máximo {max} por pedido. {inCart > 0 && <>Ya tenés {inCart} en el carrito. </>}</p>
      <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm font-semibold text-emerald">
        {msg} {msg && <Link href="/carrito" className="underline">Ver carrito</Link>}
      </p>
    </div>
  );
}

/**
 * Ficha de un producto SIN precio o stock confirmado (o agotado): no se puede comprar, pero se puede «consultar por encargo».
 * Consultar no reserva mercadería, no fija un precio ni acredita un pago: la disponibilidad y la cotización se confirman con la tienda.
 */
function EncargoPanel({ productId, title, imageSrc, pending, stockKnown, orderOnly }: { productId: string; title: string; imageSrc?: string | null; pending: boolean; stockKnown: boolean; orderOnly: boolean }) {
  const cart = useCart();
  const inCart = cart.items.find((i) => i.productId === productId && i.mode === "encargo")?.quantity ?? 0;
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  const room = Math.max(0, ENCARGO_MAX - inCart);
  const q = Math.min(Math.max(1, qty), Math.max(1, room));
  const [panelRef, out] = useOutOfView<HTMLDivElement>();
  const addEncargo = () => {
    const r = cartActions.add(productId, title, q, 0, ENCARGO_MAX, "encargo", imageSrc);
    setMsg(`Sumaste ${q} ${q === 1 ? "unidad" : "unidades"} a tu consulta por encargo. Tenés ${r.quantity}.`);
    setQty(1);
  };
  return (
    <div className="mt-4" data-testid="pendiente-comercial" ref={panelRef}>
      <BottomBar show={out}>
        <p className="min-w-0 flex-1 text-xs leading-tight text-ink/80">{pending ? "Precio por confirmar." : "Sin stock."} Disponibilidad y cotización se confirman antes de cualquier seña.</p>
        <button type="button" disabled={room === 0} onClick={addEncargo} aria-label={`Sumar ${q} a la consulta`} className="h-11 shrink-0 bg-ink px-4 text-sm font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50">
          Consultar encargo
        </button>
      </BottomBar>
      {!pending && (
        <div className="mb-3 border-l-4 border-vermilion bg-white px-4 py-3" data-testid="sin-stock-widget">
          <p className="text-lg font-extrabold">{orderOnly ? "Disponible solo por encargo" : "Sin stock disponible"}</p>
          <p className="mt-1 text-sm text-ink/80">Podés consultar si lo podemos traer por encargo.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <div className="flex h-14 items-center border border-ink/40 bg-white" role="group" aria-label="Cantidad a consultar">
          <button type="button" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1} aria-label="Menos" className="h-14 w-12 text-xl hover:bg-gold disabled:opacity-40">−</button>
          <output className="w-10 text-center font-bold" aria-live="polite">{q}</output>
          <button type="button" onClick={() => setQty(Math.min(room, q + 1))} disabled={q >= room} aria-label="Más" className="h-14 w-12 text-xl hover:bg-gold disabled:opacity-40">+</button>
        </div>
        <button
          type="button"
          disabled={room === 0}
          data-testid="consultar-encargo"
          onClick={addEncargo}
          className="h-14 flex-1 bg-ink px-6 font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Consultar por encargo
        </button>
      </div>
      <p className="mt-2 text-sm text-ink/80" role="note">
        {pending && stockKnown ? <>Hay unidades en stock, pero el <b>precio</b> está por confirmarse, así que todavía no se puede comprar con un importe.</> : pending ? <>El <b>precio</b> y la <b>disponibilidad</b> de este producto están por confirmarse, así que todavía no se puede comprar. La ficha muestra su contenido.</> : null}
        {pending ? <>{" "}{ENCARGO_EXPLICACION}</> : <>Una vez confirmadas la disponibilidad y la cotización, podés encargar abonando una seña del {encargoPolitica.senaPercent}%; el saldo restante es del {100 - encargoPolitica.senaPercent}%. No se cobra ninguna seña antes de esa confirmación.</>}
      </p>
      <p className="mt-1 text-xs text-ink/65">Consultar no reserva mercadería ni compromete el pedido: la disponibilidad, la cotización y los plazos se confirman con la tienda; no se prometen fechas de reposición ni se envían avisos automáticos.</p>
      <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm font-semibold text-emerald">
        {msg} {msg && <Link href="/carrito" className="underline">Ver consulta</Link>}
      </p>
    </div>
  );
}
