"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatARS } from "@/lib/format";
import { cartActions, cartCount, cartDrawer, useCart, useCartDrawerOpen, useCartSelect } from "@/features/cart/store";
import { preloadCartDrawer } from "./cart-drawer";
import { boxesAddable } from "@/features/promos/cupos";
import { failureMessage, failureOf, failureOfStatus, isAbort, requestJson } from "@/lib/request";
import { ENCARGO_EXPLICACION } from "@/features/politicas/encargos";
import { encargo as encargoPolitica } from "@/content/politicas";
import { ENCARGO_MAX } from "@/features/inquiries/pricing";
import { CartIcon, PlusIcon } from "./icons";
import { AddonBreakdown, BoxAddons, type Selection } from "./box-addons";
import type { AddonCatalog, AddonPreview } from "@/features/promos/adicionales";

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

/** Plazos máximos (la respuesta normal tarda menos de un segundo): el cálculo del desglose y la validación previa a agregar. */
const PREVIEW_TIMEOUT_MS = 8_000;
const ADD_TIMEOUT_MS = 10_000;

type AddProps = { productId: string; title: string; /** Foto de portada (solo para mostrar el producto en el panel lateral). */ imageSrc?: string | null; priceMinor: number; max: number; state: "available" | "soldout" | "pending"; /** Producto «solo por encargo» (no se vende de stock). */ orderOnly?: boolean; /** Hay unidades en stock confirmadas (solo falta el precio). */ stockKnown?: boolean; /** Unidades por pack (accesorios): la cantidad del carrito se cuenta en PACKS. */ packSize?: number | null; /** Adicionales de la ficha de una caja (sobres con combo y protectores); el servidor ya filtró lo que se puede comprar. */ addons?: AddonCatalog | null };

/** Botón «agregar» de las tarjetas (sin cantidad: suma 1). */
export function AddToCartIcon({ productId, title, imageSrc, priceMinor, max, state }: AddProps) {
  const inCart = useCartSelect((s) => s.items.find((i) => i.productId === productId)?.quantity ?? 0);
  const queued = useCartSelect((s) => s.items.find((i) => i.productId === productId)?.mode === "encargo");
  const atLimit = inCart >= max;
  if (state !== "available" || max === 0) {
    // Sin precio o sin stock confirmado no se puede comprar, pero sí consultar por encargo (no reserva nada ni fija un precio).
    return (
      <button
        type="button"
        onPointerDown={preloadCartDrawer}
        onFocus={preloadCartDrawer}
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
      onPointerDown={preloadCartDrawer}
      onFocus={preloadCartDrawer}
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
export function AddToCartPanel({ productId, title, imageSrc, priceMinor, max, state, stockKnown = false, orderOnly = false, packSize = null, addons = null }: AddProps) {
  const inCart = useCartSelect((s) => s.items.find((i) => i.productId === productId)?.quantity ?? 0);
  const room = Math.max(0, max - inCart);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  const q = Math.min(Math.max(1, qty), Math.max(1, room));
  const [panelRef, out] = useOutOfView<HTMLDivElement>();
  const cartItems = useCart().items;
  const router = useRouter();
  const [sel, setSel] = useState<Selection>({});
  // Resultado del cálculo para UNA selección (`key`): listo o con error. Solo vale si su clave es la de la selección actual.
  const [preview, setPreview] = useState<{ key: string; data: AddonPreview } | { key: string; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const options = addons ? [...addons.boosters, ...addons.protection] : [];
  const picked = Object.entries(sel).filter(([, n]) => n > 0);
  const hasAddons = Boolean(addons) && picked.length > 0;
  // La caja solo entra en la cuenta si realmente se puede agregar ahora (con la caja en su máximo, el selector sigue mostrando 1 pero no se suma nada).
  const addQty = boxesAddable(qty, room);
  const payload = () => ({
    cart: cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity, expectedPriceMinor: i.priceMinor, mode: i.mode })),
    add: [...(addQty > 0 ? [{ productId, quantity: addQty, expectedPriceMinor: priceMinor }] : []), ...picked.map(([id, n]) => ({ productId: id, quantity: n, expectedPriceMinor: options.find((o) => o.productId === id)?.listPriceMinor }))],
  });
  const selKey = JSON.stringify([sel, addQty, cartItems.map((i) => [i.productId, i.quantity, i.mode])]);
  const selKeyRef = useRef(selKey);
  useEffect(() => {
    selKeyRef.current = selKey;
  }, [selKey]);
  // El desglose sale del servidor (mismo motor que el carrito): se pide con una pequeña espera para no consultar en cada toque.
  // Cada selección tiene su propio resultado (`key`) y su plazo máximo: una respuesta vieja nunca se muestra como si fuera de la selección actual,
  // y si falla o tarda de más se muestra el error con «Reintentar» (la selección se conserva).
  useEffect(() => {
    if (!hasAddons) return;
    const ctl = new AbortController();
    const key = selKey;
    const t = setTimeout(async () => {
      try {
        const r = await requestJson<AddonPreview>("/api/cart/adicionales", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()), signal: ctl.signal, timeoutMs: PREVIEW_TIMEOUT_MS });
        if (ctl.signal.aborted) return;
        setPreview(r.ok && r.data?.breakdown ? { key, data: r.data } : { key, error: failureMessage(failureOfStatus(r.status), "calcular tu selección") });
      } catch (e) {
        if (isAbort(e) || ctl.signal.aborted) return;
        setPreview({ key, error: failureMessage(failureOf(e), "calcular tu selección") });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, hasAddons, attempt]);
  const retryPreview = () => {
    setPreview(null);
    setAttempt((n) => n + 1);
  };
  const current = preview?.key === selKey ? preview : null;
  const previewError = hasAddons && current && "error" in current ? current.error : "";
  // Con la selección nueva se sigue viendo (atenuado) el último desglose bueno; un error nunca deja un total viejo a la vista.
  const shownPreview = hasAddons && preview && "data" in preview ? preview : null;
  const previewLoading = hasAddons && !current;

  const addSimple = () => {
    const r = cartActions.add(productId, title, q, priceMinor, max, "buy", imageSrc);
    const unit = packSize ? (q === 1 ? `pack de ${packSize} unidades` : "packs") : q === 1 ? "unidad" : "unidades";
    setMsg(`Agregaste ${q} ${unit}. Tenés ${r.quantity} en el carrito.${r.clamped ? " Llegaste al máximo por pedido." : ""}`);
    setQty(1);
  };
  /** Caja + adicionales: el servidor valida el conjunto completo (precios, cupos, límites y stock, con lo que ya hay en el carrito) ANTES de agregar nada. */
  const add = async () => {
    if (busyRef.current) return; // doble clic o reintento: una sola operación a la vez
    if (!hasAddons) return addSimple();
    busyRef.current = true;
    setBusy(true);
    setProblems([]);
    setAddError("");
    const startedWith = selKeyRef.current;
    try {
      // Solo se valida (no se guarda nada en el servidor): reintentar es seguro. Con plazo máximo para no dejar el botón en «Validando…».
      const r = await requestJson<AddonPreview>("/api/cart/adicionales", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()), timeoutMs: ADD_TIMEOUT_MS });
      const data = r.ok && r.data?.breakdown ? r.data : null;
      if (!data) {
        setAddError(failureMessage(failureOfStatus(r.status), "validar tu selección"));
        return;
      }
      if (selKeyRef.current !== startedWith) {
        // Tocaron algo mientras se validaba: esa validación ya no corresponde a lo que se ve. No se agrega nada ni se pisa la selección nueva.
        setAddError("Cambiaste tu selección mientras la validábamos, así que no agregamos nada.");
        return;
      }
      if (!data.ok) {
        setProblems(data.problems.map((p) => p.message));
        const next = { ...sel };
        for (const p of data.problems) {
          if (p.productId === productId) continue;
          if (p.status === "price_changed") continue; // se conserva la elección; los precios nuevos llegan al refrescar la ficha
          if (p.status === "over_limit" && p.room > 0) next[p.productId] = Math.min(next[p.productId] ?? 0, p.room);
          else delete next[p.productId];
        }
        setSel(next);
        if (data.problems.some((p) => p.status === "price_changed")) router.refresh();
        return;
      }
      if (addQty > 0) cartActions.add(productId, title, addQty, priceMinor, max, "buy", imageSrc);
      for (const [id, n] of picked) {
        const o = options.find((x) => x.productId === id);
        if (o) cartActions.add(o.productId, o.title, n, o.listPriceMinor, o.maxQuantity, "buy", o.imageSrc);
      }
      setMsg(`Agregaste la caja y ${picked.length === 1 ? "1 adicional" : `${picked.length} adicionales`} al carrito.`);
      setSel({});
      setQty(1);
    } catch (e) {
      setAddError(failureMessage(failureOf(e), "validar tu selección"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const ctaLabel = hasAddons ? "Agregar caja y adicionales" : "Agregar al carrito";

  if (state === "pending" || state === "soldout" || max === 0) {
    return <EncargoPanel productId={productId} title={title} imageSrc={imageSrc} pending={state === "pending"} stockKnown={stockKnown} orderOnly={orderOnly} />;
  }
  return (
    <div className="mt-4 sm:mt-6" ref={panelRef}>
      <BottomBar show={out}>
        <p className="min-w-0 flex-1 text-lg font-extrabold leading-tight" data-testid="barra-precio">{previewError ? "—" : formatARS(hasAddons && shownPreview && !previewLoading ? shownPreview.data.breakdown.totalMinor : priceMinor)}</p>
        <div className="flex h-11 items-center border border-ink/40 bg-white" role="group" aria-label="Cantidad (barra inferior)">
          <button type="button" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1} aria-label="Bajar cantidad" className="h-11 w-10 text-xl disabled:opacity-40">−</button>
          <output className="w-7 text-center font-bold" aria-label="Cantidad elegida">{q}</output>
          <button type="button" onClick={() => setQty(Math.min(room, q + 1))} disabled={q >= room} aria-label="Subir cantidad" className="h-11 w-10 text-xl disabled:opacity-40">+</button>
        </div>
        <button type="button" disabled={room === 0 || busy} onPointerDown={preloadCartDrawer} onClick={add} aria-label={room === 0 ? "Máximo en el carrito" : hasAddons ? "Agregar caja y adicionales" : `Sumar ${q} al pedido`} className="h-11 bg-ink px-4 text-sm font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50">
          {room === 0 ? "Máximo" : hasAddons ? "Agregar todo" : "Agregar"}
        </button>
      </BottomBar>
      {addons && (addons.boosters.length > 0 || addons.protection.length > 0) && <BoxAddons catalog={addons} sel={sel} setSel={setSel} cart={cartItems} boxQty={addQty} />}
      {hasAddons && <AddonBreakdown preview={shownPreview?.data ?? null} boxQty={addQty} loading={previewLoading} error={previewError} onRetry={retryPreview} />}
      {addError && (
        <div role="alert" className="mt-3 rounded-2xl border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm" data-testid="adicionales-error-agregar">
          <p className="font-bold">No agregamos nada al carrito.</p>
          <p className="mt-1">{addError} Tu selección y tu carrito siguen como estaban.</p>
          <button type="button" onClick={add} disabled={busy} className="mt-2 min-h-11 border-2 border-ink px-4 font-bold hover:bg-gold disabled:opacity-50" data-testid="agregar-reintentar">Reintentar</button>
        </div>
      )}
      {problems.length > 0 && (
        <div role="alert" className="mt-3 rounded-2xl border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm" data-testid="adicionales-problemas">
          <p className="font-bold">Revisá tu selección: algo cambió y no agregamos nada.</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      <div className={`${addons ? "mt-3 " : ""}flex flex-wrap gap-3`}>
        <div className="flex h-14 items-center border border-ink/40 bg-white" role="group" aria-label="Cantidad">
          <button type="button" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1} aria-label="Menos" className="h-14 w-12 text-xl hover:bg-gold disabled:opacity-40">−</button>
          <output className="w-10 text-center font-bold" aria-live="polite">{q}</output>
          <button type="button" onClick={() => setQty(Math.min(room, q + 1))} disabled={q >= room} aria-label="Más" className="h-14 w-12 text-xl hover:bg-gold disabled:opacity-40">+</button>
        </div>
        <button
          type="button"
          disabled={room === 0 || busy}
          onPointerDown={preloadCartDrawer}
          onFocus={preloadCartDrawer}
          onClick={add}
          className="h-14 flex-1 bg-ink px-6 font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          data-testid="agregar"
        >
          {room === 0 ? "Máximo en el carrito" : busy ? "Validando…" : ctaLabel}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink/65">Máximo {max} {packSize ? "packs" : ""} por pedido. {inCart > 0 && <>Ya tenés {inCart} {packSize ? "packs " : ""}en el carrito. </>}{packSize ? <>Cada pack trae {packSize} unidades.</> : null}</p>
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
  const inCart = useCartSelect((s) => s.items.find((i) => i.productId === productId && i.mode === "encargo")?.quantity ?? 0);
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
          onPointerDown={preloadCartDrawer}
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
