"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cartActions, useCart, type DeliveryDraft } from "@/features/cart/store";
import { pricingFor, useCartValidation, type ServerLine } from "@/features/cart/validation";
import { CONTACT_NAME_MESSAGE, DeliverySchema, isFullName, normalizeName, provinces } from "@/features/inquiries/schemas";
import { buildMessage } from "@/features/inquiries/message";
import { paymentMethods, PICKUP_ADDRESS, PICKUP_NOTICE } from "@/content/checkout-options";
import { encargo as politicaEncargo, promo } from "@/content/politicas";
import { ENCARGO_EXPLICACION } from "@/features/politicas/encargos";
import { isPromoPayment, PROMO_CONDITION } from "@/features/politicas/promociones";
import { LanguageBadge } from "./language-badge";
import { kindLabel, wideKinds } from "@/content/labels";
import { formatARS } from "@/lib/format";
import { formatRate, splitInstallments } from "@/features/fx/convert";
import { BoxArt, PackArt } from "./art";
import { toneBg } from "./tones";
import { useAccount } from "./account-provider";

const field = "h-12 w-full border border-ink/40 bg-white px-3 text-base sm:text-sm aria-[invalid=true]:border-vermilion aria-[invalid=true]:bg-vermilion/5";
const label = "mb-1 block text-[.7rem] font-bold uppercase tracking-[.14em] text-ink/70";
const money = (m: number) => formatARS(m);

function Thumb({ line }: { line: ServerLine }) {
  const p = line.product;
  if (!p) return <div className="h-full w-full bg-ink/10" />;
  if (p.imageSrc) return <Image src={p.imageSrc} alt={p.imageAlt} width={160} height={160} className="h-full w-full object-contain" />;
  const wide = wideKinds.includes(p.kind);
  const text = kindLabel[p.kind].toUpperCase();
  return wide ? <BoxArt tone={p.fallbackTone} label={text} className="w-[88%]" /> : <PackArt tone={p.fallbackTone} label={text} className="h-[88%] w-auto" />;
}

function deliveryPayload(d: DeliveryDraft) {
  if (d.method === "andreani") return { method: "andreani", locality: d.locality, province: d.province, postalCode: d.postalCode };
  if (d.method === "moto") return { method: "moto", locality: d.locality, postalCode: d.postalCode };
  if (d.method === "retiro") return { method: "retiro" };
  return { method: d.method };
}

export function CartView({ whatsappConfigured }: { whatsappConfigured: boolean }) {
  const cart = useCart();
  const { user } = useAccount();
  const prefilled = useRef(false);
  const router = useRouter();
  // false en el servidor y true en el navegador: evita diferencias de hidratación con el carrito guardado.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  // Validación compartida con el panel lateral: un solo pedido al servidor por contenido del carrito.
  const validation = useCartValidation(mounted);
  const lines: Record<string, ServerLine> | null = validation.data?.lines ?? null;
  /** ¿El pedido califica para cuotas / 10% OFF por transferencia? Lo informa el servidor (al menos una caja disponible). */
  const qualifies = validation.data?.qualifies ?? false;
  /** Cotización con la que el servidor convirtió los precios USD (null si ningún precio depende del dólar). */
  const fx = validation.data?.fx ?? null;
  const loadError = validation.error;
  const notices = validation.notices;
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  // Barra inferior del celular (resumen + próximo paso): se oculta cuando el resumen ya se ve y mientras se escribe en un campo (teclado abierto).
  const [resumenVisible, setResumenVisible] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  useEffect(() => {
    // La barra también se oculta mientras se ve el botón «Continuar»: si no, al tocarlo podía aparecer la barra justo encima y quedarse con el toque.
    const els = ["resumen-title", "cta-continuar"].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const visibles = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visibles.add(e.target);
        else visibles.delete(e.target);
      }
      setResumenVisible(visibles.size > 0);
    }, { threshold: 0 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [mounted, cart.items.length]);
  useEffect(() => {
    const campo = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !["radio", "checkbox"].includes((t as HTMLInputElement).type);
    // La barra inferior vuelve un instante DESPUÉS de salir del campo: el toque que provocó la salida (p. ej. sobre una opción de entrega cerca del borde de la pantalla)
    // no puede caer sobre una barra que aparece justo en ese momento.
    let espera = 0;
    const on = (e: FocusEvent) => { if (campo(e.target)) { window.clearTimeout(espera); setEscribiendo(true); } };
    const off = () => { window.clearTimeout(espera); espera = window.setTimeout(() => setEscribiendo(false), 400); };
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => { window.clearTimeout(espera); document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);

  // Con sesión iniciada, se aprovecha el nombre del perfil (una sola vez) para no volver a escribirlo; igual se puede corregir.
  useEffect(() => {
    if (user && !prefilled.current && !cart.contactName) {
      prefilled.current = true;
      cartActions.setContactName(user.name);
    }
  }, [user, cart.contactName]);

  const view = cart.items.map((item) => ({ item, line: lines?.[item.productId] }));
  const blocking = view.filter(({ line }) => line && line.status !== "ok" && line.status !== "encargo");
  const verifying = !lines || view.some(({ line }) => !line);
  const unitOf = (v: (typeof view)[number]) => v.line?.unitPriceMinor ?? v.item.priceMinor;
  // Lo que se compra (con precio) y lo que se consulta por encargo (sin precio ni cotización) van separados.
  const stockView = view.filter((v) => v.item.mode !== "encargo");
  const encargoView = view.filter((v) => v.item.mode === "encargo");
  const mixed = stockView.length > 0 && encargoView.length > 0;
  const subtotal = stockView.reduce((n, v) => n + (v.line?.status === "unavailable" || v.line?.status === "retired" || v.line?.status === "out_of_stock" || v.line?.status === "pending_commercial" ? 0 : unitOf(v) * v.item.quantity), 0);
  const units = stockView.reduce((n, v) => n + v.item.quantity, 0);
  const encargoUnits = encargoView.reduce((n, v) => n + v.item.quantity, 0);
  // Importes (lista, combo caja + sobres, transferencia y total) del SERVIDOR para el medio de pago elegido, solo si corresponden al contenido actual del carrito.
  // El navegador no calcula ningún descuento: el servidor los vuelve a calcular al preparar la consulta y avisa si algo cambió.
  const sp = validation.fresh ? pricingFor(validation.data, cart.payment) : null;
  const discount = sp?.transferDiscountMinor ?? 0;
  const comboOff = sp?.comboDiscountMinor ?? 0;
  const totalFinal = sp ? sp.totalMinor : subtotal;
  const anyOff = discount > 0 || comboOff > 0;
  const pricedOf = (id: string) => sp?.lines.find((l) => l.productId === id);

  // Si el pedido dejó de calificar (p. ej. se quitó la última caja), no puede quedar elegido un medio de pago de promoción.
  useEffect(() => {
    if (lines && !qualifies && isPromoPayment(cart.payment)) cartActions.setPayment("");
  }, [lines, qualifies, cart.payment]);

  const delivery = cart.delivery;
  /** Con retiro no hay envío; con Andreani, moto o sin elegir sigue «A coordinar». */
  const envioTexto = delivery.method === "retiro" ? "No aplica: retiro" : "A coordinar";
  const parsed = useMemo(() => (delivery.method ? DeliverySchema.safeParse(deliveryPayload(delivery)) : null), [delivery]);
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!isFullName(cart.contactName)) out.contactName = CONTACT_NAME_MESSAGE;
    if (!delivery.method) out.method = "Elegí cómo querés recibirlo.";
    else if (parsed && !parsed.success) for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
    if (!paymentMethods.some((p) => p.id === cart.payment)) out.payment = "Elegí cómo preferís pagar.";
    // Un error del servidor sobre un campo solo se muestra mientras ese campo no cambie (si ya lo corrigió, deja de molestar).
    return { ...out, ...serverFieldErrors };
  }, [cart.contactName, cart.payment, delivery.method, parsed, serverFieldErrors]);
  const show = (k: string) => (attempted || touched[k]) && errors[k];
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));
  const deliveryOk = Boolean(parsed?.success);
  const formOk = deliveryOk && !errors.contactName && !errors.payment;

  const preview = (() => {
    if (cart.items.length === 0 || verifying) return "";
    const okLines = view.filter((v) => v.line?.product && v.line.status !== "unavailable");
    // Sin datos de entrega completos se usa un valor provisional solo para armar la vista previa (la línea «Entrega» se reemplaza más abajo); con retiro no hay envío, con cualquier otra modalidad (o sin elegir) sí.
    const method = parsed?.success ? parsed.data : delivery.method === "retiro" ? { method: "retiro" as const } : { method: "moto" as const, locality: "", postalCode: "" };
    let text = buildMessage({
      reference: "(se asigna al preparar la consulta)", contactName: normalizeName(cart.contactName) || undefined,
      lines: okLines.map((v) => { const pl = pricedOf(v.item.productId); return { quantity: v.item.quantity, title: v.line!.product!.title, language: v.line!.product!.language, sku: v.line!.product!.sku, unitPriceMinor: v.item.mode === "encargo" ? null : unitOf(v), packSize: v.line!.product!.packSize ?? null, comboUnits: pl?.comboUnits ?? 0, comboDiscountMinor: pl?.comboDiscountMinor ?? 0, transferDiscountMinor: pl?.transferDiscountMinor ?? 0 }; }),
      subtotalMinor: subtotal, discountMinor: discount, comboDiscountMinor: comboOff, delivery: method, paymentLabel: paymentMethods.find((p) => p.id === cart.payment)?.label ?? "",
    });
    if (!parsed?.success) text = text.replace(/Entrega: .*/, "Entrega: (completá los datos de entrega)");
    if (!cart.payment) text = text.replace(/Método de pago: .*/, "Método de pago: (elegí cómo preferís pagar)");
    return text;
  })();

  const canContinue = cart.items.length > 0 && !verifying && blocking.length === 0 && !loadError && !submitting;
  const scrollToError = () => {
    const id = errors.contactName ? "contactName" : errors.method || !deliveryOk ? "entrega" : "pago-title";
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "center" });
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
  };

  const renderLine = ({ item, line }: (typeof view)[number]) => {
    const porEncargo = item.mode === "encargo";
    const pendingPrice = line?.status === "pending_commercial";
    const unit = line?.unitPriceMinor ?? item.priceMinor;
    const bad = line && line.status !== "ok" && line.status !== "encargo";
    return (
      <li key={item.productId} className="py-4" data-testid={`linea-${item.productId}`}>
        <div className="grid grid-cols-[84px_1fr] gap-3 sm:grid-cols-[96px_1fr_auto] sm:gap-4">
          <div className={`flex aspect-square items-center justify-center overflow-hidden ${line?.product ? (line.product.imageSrc ? "bg-white" : toneBg[line.product.fallbackTone]) : "bg-ink/10"}`}>{line ? <Thumb line={line} /> : item.imageSrc ? <Image src={item.imageSrc} alt="" width={160} height={160} className="h-full w-full object-contain" /> : null}</div>
          <div className="min-w-0">
            {line?.product ? (
              <>
                <Link href={`/productos/${line.product.slug}`} className="font-bold leading-tight hover:underline">{line.product.title}</Link>
                {line.product.packSize
                  ? <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink/65" data-testid={`pack-${item.productId}`}>{kindLabel[line.product.kind]} · pack de {line.product.packSize} unidades (cada unidad del carrito es un pack) · SKU {line.product.sku}</p>
                  : <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink/65"><LanguageBadge language={line.product.language} size="plain" /> · {kindLabel[line.product.kind]} sellado · SKU {line.product.sku}</p>}
              </>
            ) : (
              <>
                <p className="font-bold leading-tight">{line ? "Producto ya no disponible" : item.title ?? "Cargando…"}</p>
                {/* Misma altura que la fila de idioma y SKU que aparece al validar: así nada se mueve cuando llega la respuesta. */}
                <p className="mt-0.5 min-h-[2.45rem] text-xs sm:min-h-6" aria-hidden="true">&nbsp;</p>
              </>
            )}
            <p className="mt-1 text-sm">
              {porEncargo ? <b data-testid={`cotizacion-${item.productId}`}>Cotización a confirmar</b> : (
                <>
                  {line?.status === "price_changed" && line.previousPriceMinor !== null && <s className="mr-2 text-ink/50">{money(line.previousPriceMinor)}</s>}
                  {pendingPrice ? <b>Precio a confirmar</b> : (<><b>{money(unit)}</b> <span className="text-ink/60">{line?.product?.packSize ? "por pack" : "c/u"}</span></>)}
                </>
              )}
            </p>
          </div>
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
            <div className="flex h-12 items-center border border-ink/40 bg-white" role="group" aria-label={`Cantidad de ${line?.product?.title ?? "producto"}`}>
              <button type="button" onClick={() => (item.quantity <= 1 ? cartActions.remove(item.productId) : cartActions.setQuantity(item.productId, item.quantity - 1))} aria-label={item.quantity <= 1 ? "Quitar del carrito" : "Menos"} className="h-12 w-11 text-xl hover:bg-gold">−</button>
              <output className="w-9 text-center font-bold" aria-live="polite" data-testid={`cantidad-${item.productId}`}>{item.quantity}</output>
              <button type="button" onClick={() => cartActions.setQuantity(item.productId, item.quantity + 1)} disabled={Boolean(line && item.quantity >= (line.maxQuantity || 99))} aria-label="Más" className="h-12 w-11 text-xl hover:bg-gold disabled:opacity-40">+</button>
            </div>
            <p className="text-right text-lg font-extrabold" data-testid={`subtotal-${item.productId}`}>
              {porEncargo || pendingPrice ? "—" : (() => {
                const pl = pricedOf(item.productId);
                const off = pl ? pl.comboDiscountMinor + pl.transferDiscountMinor : 0;
                return off > 0 && pl ? <><s className="mr-1.5 text-sm font-semibold text-ink/75" data-testid={`original-${item.productId}`}>{money(pl.listTotalMinor)}</s>{money(pl.finalTotalMinor)}</> : money(unit * item.quantity);
              })()}
            </p>
            <button type="button" onClick={() => cartActions.remove(item.productId)} className="min-h-11 text-sm font-semibold underline hover:text-vermilion" aria-label={`Quitar ${line?.product?.title ?? "producto"} del carrito`}>Quitar</button>
            {(() => {
              const pl = pricedOf(item.productId);
              const off = pl ? pl.comboDiscountMinor + pl.transferDiscountMinor : 0;
              return off > 0 && pl ? (
                <p className="w-full basis-full text-right text-xs font-semibold text-emerald sm:w-52 sm:basis-auto" data-testid={`ahorro-${item.productId}`}>
                  Ahorrás {money(off)}{pl.comboDiscountMinor > 0 ? ` · combo caja + sobres: 10% OFF en ${pl.comboUnits} ${pl.comboUnits === 1 ? "sobre" : "sobres"}` : " · 10% OFF por transferencia"}
                </p>
              ) : null;
            })()}
          </div>
        </div>
        {bad && line.status === "price_changed" && (
          <div role="alert" className="mt-3 border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm">
            <p><b>Cambió el precio.</b> Antes {money(line.previousPriceMinor ?? 0)}, ahora {money(line.unitPriceMinor ?? 0)}. Confirmalo para continuar.</p>
            <button type="button" onClick={() => cartActions.acceptPrice(item.productId, line.unitPriceMinor ?? item.priceMinor)} className="mt-2 min-h-11 bg-ink px-4 font-bold text-paper hover:bg-emerald">Aceptar el nuevo precio</button>
          </div>
        )}
        {bad && line.status === "pending_commercial" && (
          <div role="alert" className="mt-3 border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm" data-testid="aviso-pendiente">
            <p><b>Todavía no se puede comprar.</b> El precio y la disponibilidad de este producto están por confirmarse. Podés consultarlo por encargo o quitarlo del carrito.</p>
            <button type="button" onClick={() => cartActions.setMode(item.productId, "encargo")} className="mt-2 min-h-11 bg-ink px-4 font-bold text-paper hover:bg-emerald">Consultar por encargo</button>
          </div>
        )}
        {bad && line.status === "retired" && (
          <p role="alert" className="mt-3 border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm" data-testid="aviso-retirado">
            <b>Este producto fue retirado de la tienda.</b> Ya no se puede comprar ni consultar por encargo: quitalo del carrito para continuar.
          </p>
        )}
        {bad && (line.status === "out_of_stock" || line.status === "unavailable") && (
          <div role="alert" className="mt-3 border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm">
            <p><b>{line.status === "out_of_stock" ? "Sin stock por ahora." : "Este producto ya no está en el catálogo."}</b> {line.status === "out_of_stock" ? "Podés consultarlo por encargo o quitarlo del carrito para continuar." : "Quitalo del carrito para continuar."}</p>
            {line.status === "out_of_stock" && <button type="button" onClick={() => cartActions.setMode(item.productId, "encargo")} className="mt-2 min-h-11 bg-ink px-4 font-bold text-paper hover:bg-emerald">Consultar por encargo</button>}
          </div>
        )}
      </li>
    );
  };

  async function submit() {
    setAttempted(true);
    setSubmitError("");
    setServerFieldErrors({});
    if (!canContinue) return;
    if (!parsed?.success || !formOk) {
      scrollToError();
      return;
    }
    const itemsPayload = cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, mode: i.mode, ...(i.mode === "buy" ? { expectedPriceMinor: i.priceMinor } : {}) }));
    const sig = JSON.stringify([[...itemsPayload].sort((a, b) => a.productId.localeCompare(b.productId)).map((i) => [i.productId, i.quantity, i.mode]), parsed.data, cart.payment, normalizeName(cart.contactName), cart.contactPhone.trim()]);
    // Misma clave mientras el contenido no cambie; si cambia, clave nueva.
    const key = cart.idem?.sig === sig ? cart.idem.key : crypto.randomUUID().replace(/-/g, "");
    if (cart.idem?.sig !== sig) cartActions.setIdempotency({ sig, key });
    setSubmitting(true);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsPayload, delivery: parsed.data, payment: cart.payment, contactName: normalizeName(cart.contactName), contactPhone: cart.contactPhone.trim() || undefined, ...(sp ? { expectedTotalMinor: sp.totalMinor } : {}), idempotencyKey: key }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.reference) {
        router.push(`/carrito/consulta/${data.reference}?abrir=1`);
        return; // el carrito se conserva
      }
      const err = data?.error;
      if (err?.code === "invalid_input" && Array.isArray(err.details)) {
        const fe: Record<string, string> = {};
        for (const d of err.details as Array<{ path: string; message: string }>) fe[d.path.split(".")[1] ?? d.path] ??= d.message;
        setServerFieldErrors(fe);
      }
      if (["price_changed", "pending_commercial", "out_of_stock", "unavailable", "retired", "over_limit", "promo_not_eligible"].includes(err?.code)) validation.retry();
      setSubmitError(err?.message ?? "No pudimos preparar tu consulta. Intentá de nuevo.");
    } catch {
      setSubmitError("No pudimos conectarnos. Tu consulta no se guardó: revisá tu conexión e intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) {
    return <p className="py-16 text-center text-ink/60" role="status">Cargando tu carrito…</p>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="border border-dashed border-ink/40 bg-white/60 p-8 text-center sm:p-16">
        <p className="display text-4xl normal-case sm:text-5xl">Tu carrito está vacío.</p>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink/70">Explorá los sellados y sumá lo que quieras: después coordinamos por WhatsApp.</p>
        <Link href="/sellados" className="mt-6 inline-block bg-gold px-6 py-3.5 font-bold hover:bg-ink hover:text-paper">Ver todos los sellados</Link>
      </div>
    );
  }

  // Primera validación pendiente: no se dibuja el pedido a medias. Un marco de altura fija evita que, al llegar los precios, los avisos (cambió el precio, sin stock)
  // y los datos de cada línea empujen todo lo que ya se veía. Si la validación falla se muestra el pedido con el error y el botón de reintento.
  if (!lines && !loadError) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[70vh] items-start border border-dashed border-ink/30 bg-white/50 p-6 text-sm text-ink/70" data-testid="verificando-pedido">
        <p>Verificando precios y disponibilidad de tu carrito…</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-20 sm:gap-6 lg:grid-cols-[1.55fr_1fr] lg:items-start lg:pb-0">
      <div className="space-y-4 sm:space-y-6">
        {notices.length > 0 && (
          <div role="status" className="border-l-4 border-emerald bg-emerald/10 p-4 text-sm">
            {notices.map((n, i) => <p key={i}>{n}</p>)}
            <button type="button" onClick={validation.clearNotices} className="mt-2 font-semibold underline">Entendido</button>
          </div>
        )}
        {loadError && (
          <div role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-4 text-sm">
            <p>{loadError} No podemos continuar hasta verificar tu pedido.</p>
            <button type="button" onClick={validation.retry} className="mt-2 font-semibold underline">Reintentar</button>
          </div>
        )}

        <section aria-labelledby="carrito-items" className="border border-ink/25 bg-white/70 p-4 sm:p-6">
          <h2 id="carrito-items" className="display text-3xl normal-case">Tu carrito</h2>
          <p className="mt-1 min-h-4 text-xs text-ink/60" role="status">{verifying && !loadError ? "Verificando precios y disponibilidad…" : ""}</p>
          {stockView.length > 0 && (
            <>
              {mixed && <h3 className="mt-4 text-sm font-bold uppercase tracking-[.12em] text-ink/70">Para comprar (disponibles)</h3>}
              <ul className="mt-4 divide-y divide-ink/15" data-testid="lineas-compra">{stockView.map(renderLine)}</ul>
            </>
          )}
          {encargoView.length > 0 && (
            <div className={stockView.length > 0 ? "mt-8 border-t border-ink/25 pt-5" : ""} data-testid="seccion-encargo">
              <h3 id="encargo-title" className="text-sm font-bold uppercase tracking-[.12em] text-ink/70">Por encargo · sin cotizar</h3>
              <p className="mt-2 text-sm text-ink/80">{ENCARGO_EXPLICACION}</p>
              <p className="mt-1 text-xs text-ink/65">Consultar no reserva mercadería ni compromete el pedido: el proveedor, la disponibilidad, la cotización y la fecha se confirman antes. No hay precio ni seña hasta que se cotice.</p>
              <ul className="mt-3 divide-y divide-ink/15" data-testid="lineas-encargo">{encargoView.map(renderLine)}</ul>
            </div>
          )}
          <p className="mt-4 border-t border-ink/15 pt-3 text-sm lg:hidden" data-testid="proximo-paso">
            {stockView.length > 0 && <><b data-testid="proximo-paso-subtotal">{money(subtotal)}</b> en productos · </>}
            <a href="#entrega" className="font-semibold underline">Siguiente: elegí cómo lo recibís ↓</a>
          </p>
        </section>

        <section id="entrega" aria-labelledby="entrega-title" className="scroll-mt-4 border border-ink/25 bg-white/70 p-4 sm:p-6">
          <h2 id="entrega-title" className="display text-3xl normal-case">¿Cómo lo recibís?</h2>
          <div className="mt-4 max-w-sm">
            <label htmlFor="contactName" className={label}>Nombre y apellido <span className="text-vermilion" aria-hidden="true">*</span></label>
            <input id="contactName" name="contactName" required aria-required="true" autoComplete="name" maxLength={60} value={cart.contactName} onChange={(e) => { cartActions.setContactName(e.target.value); setServerFieldErrors(({ contactName: _drop, ...rest }) => { void _drop; return rest; }); }} onBlur={() => touch("contactName")} aria-invalid={Boolean(show("contactName"))} aria-describedby={show("contactName") ? "err-contactName" : "ayuda-contactName"} className={field} />
            {show("contactName") ? <p id="err-contactName" role="alert" className="mt-1 text-sm font-semibold text-vermilion">{errors.contactName}</p> : <p id="ayuda-contactName" className="mt-1 text-xs text-ink/65">Obligatorio, también si retirás. Lo usamos para identificar tu pedido.</p>}
          </div>
          <div className="mt-4 max-w-sm">
            <label htmlFor="contactPhone" className={label}>Teléfono (opcional)</label>
            <input id="contactPhone" name="contactPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={cart.contactPhone} onChange={(e) => { cartActions.setContactPhone(e.target.value); setServerFieldErrors(({ contactPhone: _drop, ...rest }) => { void _drop; return rest; }); }} aria-invalid={Boolean(errors.contactPhone)} aria-describedby={errors.contactPhone ? "err-contactPhone" : "ayuda-contactPhone"} className={field} />
            {errors.contactPhone ? <p id="err-contactPhone" role="alert" className="mt-1 text-sm font-semibold text-vermilion">{errors.contactPhone}</p> : <p id="ayuda-contactPhone" className="mt-1 text-xs text-ink/65">Opcional. Solo para que podamos responderte.</p>}
          </div>
          <fieldset className="mt-5" aria-describedby={show("method") ? "err-method" : undefined}>
            <legend className="sr-only">Modalidad de entrega</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ["andreani", "Andreani", "Envío a todo el país. Costo y plazo a coordinar."],
                ["moto", "Moto — CABA y AMBA", "Cobertura a confirmar por WhatsApp."],
                ["retiro", "Retiro", "Av. Rivadavia 14600. Horario y dirección exacta por WhatsApp."],
              ] as const).map(([id, title, hint]) => (
                <label key={id} className={`flex min-h-20 cursor-pointer gap-3 border p-3 text-sm ${delivery.method === id ? "border-ink bg-gold/30" : "border-ink/30 bg-white hover:border-ink"}`}>
                  <input type="radio" name="entrega" value={id} checked={delivery.method === id} onChange={() => { cartActions.setDelivery({ method: id }); setServerFieldErrors({}); touch("method"); }} className="mt-1 h-5 w-5 accent-[#0b4032]" />
                  <span><b className="block">{title}</b><span className="text-ink/65">{hint}</span></span>
                </label>
              ))}
            </div>
            {show("method") && <p id="err-method" role="alert" className="mt-2 text-sm font-semibold text-vermilion">{errors.method}</p>}
          </fieldset>

          {(delivery.method === "andreani" || delivery.method === "moto") && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field id="locality" label="Localidad" error={show("locality") ? errors.locality : undefined}>
                <input id="locality" autoComplete="address-level2" value={delivery.locality} onChange={(e) => cartActions.setDelivery({ locality: e.target.value })} onBlur={() => touch("locality")} aria-invalid={Boolean(show("locality"))} aria-describedby={show("locality") ? "err-locality" : undefined} className={field} />
              </Field>
              {delivery.method === "andreani" && (
                <Field id="province" label="Provincia" error={show("province") ? errors.province : undefined}>
                  <select id="province" autoComplete="address-level1" value={delivery.province} onChange={(e) => cartActions.setDelivery({ province: e.target.value })} onBlur={() => touch("province")} aria-invalid={Boolean(show("province"))} aria-describedby={show("province") ? "err-province" : undefined} className={field}>
                    <option value="">Elegí una provincia</option>
                    {provinces.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              )}
              <Field id="postalCode" label="Código postal" error={show("postalCode") ? errors.postalCode : undefined}>
                <input id="postalCode" autoComplete="postal-code" inputMode="text" value={delivery.postalCode} onChange={(e) => cartActions.setDelivery({ postalCode: e.target.value })} onBlur={() => touch("postalCode")} aria-invalid={Boolean(show("postalCode"))} aria-describedby={show("postalCode") ? "err-postalCode" : undefined} placeholder="Ej.: 1704" className={field} />
              </Field>
              <p className="self-end text-xs text-ink/65">{delivery.method === "moto" ? "Solo CABA y AMBA: confirmamos la cobertura por WhatsApp. " : "El costo y el plazo se coordinan por WhatsApp. "}No pedimos DNI ni dirección completa ahora.</p>
            </div>
          )}
          {delivery.method === "retiro" && (
            <p className="mt-5 max-w-xl border-l-4 border-emerald bg-emerald/10 p-3 text-sm font-semibold" data-testid="aviso-retiro" role="note">{PICKUP_NOTICE}</p>
          )}
        </section>

        <section aria-labelledby="pago-title" className="border border-ink/25 bg-white/70 p-4 sm:p-6">
          <h2 id="pago-title" className="display text-3xl normal-case">¿Cómo preferís pagar?</h2>
          <p className={`mt-2 text-sm ${qualifies ? "font-semibold text-emerald" : "text-ink/75"}`} data-testid="promo-estado" role="status">
            {qualifies
              ? `Tu pedido incluye una caja: podés elegir ${promo.installments} cuotas sin interés o ${promo.transferDiscountPercent}% OFF por transferencia (alternativas, no se acumulan).`
              : `${promo.installments} cuotas sin interés o ${promo.transferDiscountPercent}% OFF por transferencia: para ${PROMO_CONDITION}. Con sobres solos o con productos por encargo no aplican.`}
          </p>
          <fieldset className="mt-4 space-y-2" aria-describedby={show("payment") ? "err-payment" : undefined}>
            <legend className="sr-only">Método de pago</legend>
            {paymentMethods.map((m) => {
              const locked = isPromoPayment(m.id) && !qualifies;
              return (
                <label key={m.id} className={`flex min-h-12 items-center gap-3 border p-3 text-sm ${locked ? "cursor-not-allowed border-ink/20 bg-ink/5 text-ink/55" : `cursor-pointer ${cart.payment === m.id ? "border-ink bg-gold/30" : "border-ink/30 bg-white"}`}`}>
                  <input type="radio" name="pago" value={m.id} checked={cart.payment === m.id} disabled={locked} onChange={() => { cartActions.setPayment(m.id); touch("payment"); }} className="h-5 w-5 accent-[#0b4032]" />
                  <span><b>{m.label}</b>{locked && <span className="block text-xs font-normal">Disponible al sumar una caja a tu pedido.</span>}</span>
                </label>
              );
            })}
            {show("payment") && <p id="err-payment" role="alert" className="text-sm font-semibold text-vermilion">{errors.payment}</p>}
          </fieldset>
          <p className="mt-2 text-xs text-ink/65">El pago se acuerda con la tienda en el chat. No se cobra nada en esta web ni te pedimos datos bancarios.</p>
        </section>
        <p className="text-sm">¿Ya tenés cuenta? <Link href="/cuenta" className="font-semibold underline">Iniciá sesión</Link> (opcional: podés consultar como invitado).</p>
      </div>

      <aside id="resumen" className="scroll-mt-4 space-y-4 sm:space-y-6 lg:sticky lg:top-4" aria-label="Resumen del pedido">
        <section className="border border-emerald/40 bg-emerald/10 p-5 sm:p-6" aria-labelledby="resumen-title">
          <h2 id="resumen-title" className="display text-3xl normal-case">Resumen del pedido</h2>
          {stockView.length > 0 ? (
            <>
              <dl className="mt-4 space-y-2 text-base">
                <div className="flex justify-between"><dt>{mixed ? "Productos disponibles" : "Productos"} ({units})</dt><dd data-testid="resumen-productos">{money(subtotal)}</dd></div>
                {comboOff > 0 && <div className="flex justify-between text-emerald"><dt>Descuento combo caja + sobres ({"10"}%)</dt><dd className="font-semibold" data-testid="resumen-descuento-combo">−{money(comboOff)}</dd></div>}
                {discount > 0 && <div className="flex justify-between text-emerald"><dt>Descuento por transferencia ({promo.transferDiscountPercent}%)</dt><dd className="font-semibold" data-testid="resumen-descuento">−{money(discount)}</dd></div>}
                <div className="flex justify-between"><dt>Envío</dt><dd className="font-semibold" data-testid="resumen-envio">{envioTexto}</dd></div>
                <div className="flex items-end justify-between border-t border-ink/20 pt-3"><dt className="text-lg font-bold">{anyOff ? "Subtotal sin descuento" : "Subtotal de productos"}</dt><dd className="text-3xl font-extrabold" data-testid="resumen-subtotal">{money(subtotal)}</dd></div>
                {anyOff && <div className="flex items-end justify-between"><dt className="font-bold">Productos con descuento</dt><dd className="text-2xl font-extrabold" data-testid="resumen-total-descuento">{money(totalFinal)}</dd></div>}
              </dl>
              {cart.payment === "tarjeta-3-cuotas" && qualifies && totalFinal > 0 && (
                <p className="mt-2 text-sm font-semibold" data-testid="resumen-cuotas">{promo.installments} cuotas sin interés: {splitInstallments(totalFinal, promo.installments).map((c) => money(c)).join(" + ")} = {money(totalFinal)}</p>
              )}
              <div className="min-h-[3.1rem]">{fx && stockView.some((v) => v.line?.unitPriceUsdMinor) && <p className="mt-1 text-xs text-ink/70" data-testid="resumen-fx">Precios en pesos calculados con {fx.mode === "manual" ? "la cotización fijada por la tienda" : "el dólar blue (venta)"} a {formatRate(fx.rate10k)} por dólar, redondeados a múltiplos de $100 por unidad. La consulta que prepares guarda esta cotización.</p>}</div>
              <p className="mt-1 text-xs text-ink/70">{discount > 0 ? "El 10% OFF por transferencia se calcula sobre los productos de un pedido con caja (sin los accesorios); el envío no entra. " : ""}{comboOff > 0 ? "El combo caja + sobres no se suma al 10% por transferencia sobre un mismo sobre: rige el más favorable. " : ""}{mixed ? "No incluye los productos por encargo (sin cotizar). " : ""}{delivery.method === "retiro" ? "El importe final y el horario de retiro se confirman por WhatsApp." : "Envío e importe final se confirman por WhatsApp."}</p>
            </>
          ) : (
            <dl className="mt-4 space-y-2 text-base">
              <div className="flex justify-between"><dt>Productos con precio</dt><dd data-testid="resumen-productos">—</dd></div>
              <div className="flex justify-between"><dt>Envío</dt><dd className="font-semibold" data-testid="resumen-envio">{envioTexto}</dd></div>
            </dl>
          )}
          {encargoView.length > 0 && (
            <div className="mt-3 border-t border-ink/15 pt-3 text-sm" data-testid="resumen-encargo">
              <p><b>Por encargo:</b> {encargoView.length} {encargoView.length === 1 ? "producto" : "productos"} ({encargoUnits} {encargoUnits === 1 ? "unidad" : "unidades"}) · cotización a confirmar.</p>
              <p className="mt-1 text-xs text-ink/70">Si se confirman la disponibilidad y la cotización, la seña es del {politicaEncargo.senaPercent}% de lo cotizado y el saldo del {100 - politicaEncargo.senaPercent}%. Todavía no hay importe ni seña que pagar. Los descuentos no se aplican a los encargos.</p>
            </div>
          )}
          <dl className="mt-3 space-y-1 border-t border-ink/15 pt-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink/65">Nombre y apellido</dt><dd className="text-right font-semibold" data-testid="resumen-nombre">{normalizeName(cart.contactName) || "Falta completar"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink/65">Entrega</dt><dd className="text-right font-semibold" data-testid="resumen-entrega">{delivery.method === "andreani" ? "Andreani" : delivery.method === "moto" ? "Moto CABA/AMBA" : delivery.method === "retiro" ? `Retiro en ${PICKUP_ADDRESS}` : "Sin elegir"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink/65">Pago</dt><dd className="text-right font-semibold" data-testid="resumen-pago">{paymentMethods.find((p) => p.id === cart.payment)?.label ?? "Sin elegir"}</dd></div>
          </dl>

          {blocking.length > 0 && <p role="alert" className="mt-4 text-sm font-semibold text-vermilion">Resolvé los avisos del carrito para continuar.</p>}
          {submitError && <p role="alert" className="mt-4 border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm font-semibold">{submitError}</p>}
          <button id="cta-continuar" type="button" onClick={submit} disabled={!canContinue} aria-describedby="cta-nota" className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 bg-emerald px-6 text-lg font-bold text-paper hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? "Preparando tu consulta…" : stockView.length === 0 && encargoView.length > 0 ? "Consultar por encargo por WhatsApp" : "Continuar por WhatsApp"}
          </button>
          {attempted && !formOk && canContinue && <p role="alert" className="mt-2 text-sm font-semibold text-vermilion" data-testid="faltan-datos">{errors.contactName ? "Completá tu nombre y apellido para continuar." : errors.payment && deliveryOk ? "Elegí cómo preferís pagar para continuar." : "Completá los datos de entrega para continuar."}</p>}
          <p id="cta-nota" className="mt-3 text-center text-sm">
            {whatsappConfigured ? "Se abrirá el chat con tu pedido listo. Solo tenés que enviarlo." : "Modo demostración: se prepara tu consulta y verás el mensaje para copiarlo; todavía no hay un chat configurado."}
          </p>
          <p className="mt-2 text-center text-xs text-ink/65">Abrir WhatsApp no confirma pago, reserva ni venta. Disponibilidad y pago sujetos a confirmación.</p>
        </section>

        <section className="border border-ink/25 bg-white/70 p-5 sm:p-6" aria-labelledby="preview-title">
          <h2 id="preview-title" className="display text-2xl normal-case">Así llega tu consulta</h2>
          <pre tabIndex={0} aria-label="Vista previa del mensaje" className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words border border-ink/15 bg-paper-2 p-3 font-mono text-xs leading-relaxed" data-testid="vista-previa">{preview || "Estamos verificando tu pedido…"}</pre>
          <p className="mt-2 text-xs text-ink/60">Vista previa: la referencia y los importes finales los fija el servidor al preparar la consulta.</p>
        </section>
      </aside>
      {!resumenVisible && !escribiendo && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-paper px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_rgba(18,23,21,.18)] lg:hidden" data-testid="barra-carrito">
          <div className="mx-auto flex max-w-[640px] items-center gap-3">
            <p className="min-w-0 flex-1 text-sm leading-tight">
              {stockView.length > 0 ? <><span className="block text-xs text-ink/70">{anyOff ? "Total de productos" : "Subtotal de productos"} ({units})</span><b className="text-lg">{money(totalFinal)}</b></> : <b>Consulta por encargo</b>}
            </p>
            <button type="button" onClick={() => document.getElementById("resumen")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="h-11 shrink-0 bg-emerald px-4 text-sm font-bold text-paper hover:bg-emerald-2">
              Ver resumen y continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ id, label: text, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {error && <p id={`err-${id}`} role="alert" className="mt-1 text-sm font-semibold text-vermilion">{error}</p>}
    </div>
  );
}
