"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { SafeImage } from "./safe-image";
import { useDrawerShell } from "./cart-drawer-shell";
import { cartActions, cartCount, cartDrawer, useCart, type CartItem } from "@/features/cart/store";
import { pricingFor, useCartValidation, type ServerLine, type ServerPricedLine } from "@/features/cart/validation";
import { CartSuggestions } from "./cart-suggestions";
import { formatARS } from "@/lib/format";
import { LanguageBadge } from "./language-badge";
import { kindLabel } from "@/content/labels";

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

function Line({ item, line, priced, onNavigate }: { item: CartItem; line?: ServerLine; priced?: ServerPricedLine; onNavigate: () => void }) {
  const p = line?.product;
  const name = p?.title ?? item.title ?? "Producto";
  const src = item.imageSrc ?? p?.imageSrc ?? null;
  const porEncargo = item.mode === "encargo";
  const unit = line?.unitPriceMinor ?? item.priceMinor;
  const pendiente = line?.status === "pending_commercial";
  const max = Math.max(1, line ? line.maxQuantity || 99 : 99);
  const pack = p?.packSize ?? null;
  const saving = priced ? priced.comboDiscountMinor + priced.transferDiscountMinor : 0;
  const hasPrice = !porEncargo && !pendiente && (Boolean(line) || unit > 0);
  const aviso =
    line?.status === "price_changed" ? "Cambió el precio: confirmalo en el pedido." :
    line?.status === "retired" ? "Producto retirado de la tienda: quitalo para continuar." :
    line?.status === "unavailable" ? "Ya no está en el catálogo: quitalo para continuar." :
    line?.status === "out_of_stock" ? "Sin stock por ahora: podés consultarlo por encargo en el pedido." :
    pendiente ? "Precio por confirmar: podés consultarlo por encargo en el pedido." : "";
  const sinFoto = <span className="text-[.6rem] font-bold uppercase text-ink/75">{p ? kindLabel[p.kind] : "—"}</span>;
  return (
    <li className="py-4" data-testid={`drawer-linea-${item.productId}`}>
      <div className="grid grid-cols-[64px_1fr] gap-3">
        <div className="flex aspect-square items-center justify-center overflow-hidden bg-white">
          {src ? <SafeImage src={src} alt="" width={96} height={96} sizes="64px" className="h-full w-full object-contain" fallback={sinFoto} /> : sinFoto}
        </div>
        <div className="min-w-0">
          {p ? <Link href={`/productos/${p.slug}`} onClick={onNavigate} className="block font-bold leading-tight hover:underline">{name}</Link> : <p className="font-bold leading-tight">{name}</p>}
          {p && (pack
            ? <p className="mt-0.5 text-xs text-ink/65" data-testid={`drawer-pack-${item.productId}`}>{kindLabel[p.kind]} · pack de {pack} unidades (cada unidad del carrito es un pack)</p>
            : <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink/65"><LanguageBadge language={p.language} size="plain" /> · {kindLabel[p.kind]}</p>)}
          <p className="mt-1 text-sm">
            {porEncargo ? <b>Cotización a confirmar</b> : pendiente ? <b>Precio a confirmar</b> : unit > 0 || line ? <><b>{formatARS(unit)}</b> <span className="text-ink/60">{pack ? "por pack" : "c/u"}</span></> : <span className="text-ink/60">Verificando precio…</span>}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <Quantity item={item} name={name} max={max} />
        <p className="text-right text-base font-extrabold" data-testid={`drawer-subtotal-${item.productId}`}>
          {!hasPrice ? "—" : saving > 0 && priced ? <><s className="mr-1 text-sm font-semibold text-ink/75" data-testid={`drawer-original-${item.productId}`}>{formatARS(priced.listTotalMinor)}</s>{formatARS(priced.finalTotalMinor)}</> : formatARS(unit * item.quantity)}
        </p>
        <button type="button" onClick={() => cartActions.remove(item.productId)} aria-label={`Quitar ${name} del carrito`} className="min-h-11 px-1 text-sm font-semibold underline hover:text-vermilion">Quitar</button>
      </div>
      {saving > 0 && priced && (
        <p className="mt-1 text-xs font-semibold text-emerald" data-testid={`drawer-ahorro-${item.productId}`}>
          Ahorrás {formatARS(saving)}{priced.comboDiscountMinor > 0 ? ` · combo caja + sobres: 10% OFF en ${priced.comboUnits} ${priced.comboUnits === 1 ? "sobre" : "sobres"}` : " · 10% OFF por transferencia"}
        </p>
      )}
      {aviso && <p role="status" className="mt-2 border-l-4 border-vermilion bg-vermilion/10 p-2 text-xs">{aviso}</p>}
    </li>
  );
}

export default function CartDrawerPanel() {
  const cart = useCart();
  const { data, fresh, error, retry, notices, clearNotices } = useCartValidation(true);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipRestore = useRef(false);
  const units = cartCount(cart);

  // Foco, bloqueo del desplazamiento, Escape, Tab y cierre al cambiar de página: comunes con el marco de carga (cart-drawer-shell.ts).
  useDrawerShell(panelRef, titleRef, skipRestore);

  const leave = () => { skipRestore.current = true; };
  const stockItems = cart.items.filter((i) => i.mode !== "encargo");
  const encargoCount = cart.items.length - stockItems.length;
  const subtotal = stockItems.reduce((n, i) => {
    const l = data?.lines[i.productId];
    if (!l) return n + i.priceMinor * i.quantity;
    return l.status === "ok" || l.status === "price_changed" ? n + (l.unitPriceMinor ?? 0) * i.quantity : n;
  }, 0);
  const last = cart.lastAdded;
  // Importes del servidor para el medio de pago elegido (lista, combo caja + sobres, transferencia y total); mientras llega la validación se usa la cuenta local.
  // Solo se usan los importes del servidor cuando corresponden al contenido ACTUAL del carrito (así lista, descuentos y total nunca se mezclan de dos momentos distintos).
  const sp = fresh ? pricingFor(data, cart.payment) : null;
  const listSubtotal = sp?.subtotalMinor ?? subtotal;
  const comboOff = sp?.comboDiscountMinor ?? 0;
  const transferOff = sp?.transferDiscountMinor ?? 0;
  const total = sp ? sp.totalMinor : subtotal;

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
                {cart.items.map((item) => <Line key={item.productId} item={item} line={data?.lines[item.productId]} priced={sp?.lines.find((l) => l.productId === item.productId)} onNavigate={leave} />)}
              </ul>
              {stockItems.length > 0 && <CartSuggestions suggestions={data?.suggestions ?? []} combo={data?.combo ?? null} />}
            </div>
            <footer className="border-t-2 border-ink bg-white/70 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {stockItems.length > 0 ? (
                <>
                  {(comboOff > 0 || transferOff > 0) && (
                    <dl className="mb-1 space-y-0.5 text-sm" data-testid="drawer-descuentos">
                      <div className="flex justify-between gap-3"><dt>Productos (precio de lista)</dt><dd data-testid="drawer-lista">{formatARS(listSubtotal)}</dd></div>
                      {comboOff > 0 && <div className="flex justify-between gap-3 font-semibold text-emerald"><dt>Combo caja + sobres</dt><dd data-testid="drawer-descuento-combo">−{formatARS(comboOff)}</dd></div>}
                      {transferOff > 0 && <div className="flex justify-between gap-3 font-semibold text-emerald"><dt>10% OFF por transferencia</dt><dd data-testid="drawer-descuento-transferencia">−{formatARS(transferOff)}</dd></div>}
                    </dl>
                  )}
                  <p className="flex items-end justify-between gap-3"><span className="text-sm font-bold">{comboOff > 0 || transferOff > 0 ? "Total de productos" : "Subtotal de productos"}</span><b className="text-2xl font-extrabold" data-testid="drawer-subtotal">{!data && subtotal === 0 ? "…" : formatARS(total)}</b></p>
                  {data?.combo?.enabled && data.combo.boxes > 0 && <p className="mt-1 text-xs text-ink/75" data-testid="drawer-cupos">Combo caja + sobres: {data.combo.usedSlots} de {data.combo.slots} cupos usados{data.combo.freeSlots > 0 ? `; te quedan ${data.combo.freeSlots}` : ""}.</p>}
                </>
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
