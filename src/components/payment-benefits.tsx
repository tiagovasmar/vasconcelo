import { promo } from "@/content/politicas";
import type { ProductKind } from "@/content/schema";
import { isBoxKind, PROMO_CONDITION } from "@/features/politicas/promociones";

/**
 * Promociones de pago (confirmadas por el dueño): cuotas sin interés o 10% OFF por transferencia, solo en compras que incluyan al
 * menos una caja. La elegibilidad vive en `features/politicas/promociones.ts`; acá solo se muestra, de forma coherente:
 * - caja: el beneficio junto al precio, con su condición;
 * - sobre/pack: no es un beneficio propio, se alcanza al sumar una caja;
 * - kits, bundles, cajas especiales y sets: sin beneficio propio (no cuentan como caja salvo que el dueño lo defina).
 */
export function PaymentBenefits({ kind, compact = false }: { kind?: ProductKind; compact?: boolean }) {
  // En las tarjetas: una línea de resumen y las condiciones completas en un desplegable (sin párrafos repetidos en cada producto).
  const resumen = "cursor-pointer select-none py-1.5 font-semibold text-ink underline-offset-2 hover:underline";
  // Accesorios: no cuentan como caja ni tienen descuentos de pago propios (los de las cajas y los sobres siguen igual).
  if (kind === "accessory") {
    if (compact) return null;
    return <p className="mt-3 text-sm leading-relaxed text-ink/75" data-testid="promo-condicion">Los accesorios no cuentan como caja y no tienen descuentos propios. Las promociones de las cajas siguen valiendo en el resto de tu pedido.</p>;
  }
  if (kind && !isBoxKind(kind)) {
    const sumable = kind === "booster" || kind === "pack";
    if (compact && !sumable) return null; // en las tarjetas, los kits y sets no repiten una aclaración que ya está en su ficha
    if (compact) {
      return (
        <details className="mt-1 text-xs leading-snug text-ink/75" data-testid="promo-condicion">
          <summary className={resumen}>Promos al sumar una caja</summary>
          <p className="pb-1"><b className="font-medium text-ink">Disponible al sumar una caja a tu pedido:</b> {promo.installments} cuotas sin interés o {promo.transferDiscountPercent}% OFF por transferencia.</p>
        </details>
      );
    }
    return (
      <p className={compact ? "mt-3 text-xs leading-relaxed text-ink/70" : "mt-3 text-sm leading-relaxed text-ink/75"} data-testid="promo-condicion">
        {sumable
          ? <><b className="font-medium text-ink">Disponible al sumar una caja a tu pedido:</b> {promo.installments} cuotas sin interés o {promo.transferDiscountPercent}% OFF por transferencia.</>
          : <>Este formato no cuenta como caja: las cuotas y el {promo.transferDiscountPercent}% OFF por transferencia valen en pedidos con al menos una caja.</>}
      </p>
    );
  }
  if (kind && compact) {
    return (
      <details className="mt-1 text-xs leading-snug text-ink/75" data-testid="promo-caja">
        <summary className={resumen}>{promo.installments} cuotas o {promo.transferDiscountPercent}% OFF</summary>
        <div className="space-y-0.5 pb-1">
          <p><b className="font-semibold text-ink">{promo.installments} cuotas sin interés</b> con tarjeta de crédito</p>
          <p><b className="font-semibold text-ink">{promo.transferDiscountPercent}% OFF</b> por transferencia</p>
          <p className="text-ink/65">En {PROMO_CONDITION}. Son alternativas: no se acumulan.</p>
        </div>
      </details>
    );
  }
  if (kind) {
    return (
      <div className={compact ? "mt-3 space-y-0.5 text-xs leading-relaxed text-ink/75" : "mt-3 space-y-1 text-sm leading-relaxed text-ink/75"} data-testid="promo-caja">
        <p><b className="font-semibold text-ink">{promo.installments} cuotas sin interés</b> con tarjeta de crédito</p>
        <p><b className="font-semibold text-ink">{promo.transferDiscountPercent}% OFF</b> por transferencia</p>
        <p className="text-ink/65">En {PROMO_CONDITION}. Son alternativas: no se acumulan.</p>
      </div>
    );
  }
  return (
    <div className={compact ? "mt-3 space-y-1 text-xs leading-relaxed text-ink/70" : "border-t border-ink/10 pt-4 text-sm leading-relaxed text-ink/70"}>
      <p><b className="font-medium text-ink">{promo.installments} cuotas sin interés</b> con tarjeta de crédito o <b className="font-medium text-ink">{promo.transferDiscountPercent}% OFF</b> por transferencia</p>
      <p>Para {PROMO_CONDITION}; los sobres solos no califican. No se acumulan entre sí.</p>
      {!compact && <p className="mt-2 text-xs text-ink/65">Elegí tu preferencia en el carrito. El pago se coordina por WhatsApp.</p>}
    </div>
  );
}

/** Franja visible del inicio, con la condición a la vista. */
export function PromoStrip() {
  return (
    <section aria-label="Promociones de pago" className="mt-5 rounded-xl border border-gold/60 bg-ink text-paper" data-testid="franja-promos">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-center">
        <p className="text-sm font-semibold sm:text-base"><span className="text-gold">{promo.installments} cuotas sin interés</span> o <span className="text-gold">{promo.transferDiscountPercent}% OFF por transferencia</span></p>
        <p className="text-xs text-paper/80 sm:text-sm">{" · "}{PROMO_CONDITION}</p>
      </div>
    </section>
  );
}
