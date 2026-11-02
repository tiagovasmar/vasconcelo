import type { ProductKind } from "./schema";

/**
 * Condiciones comerciales de la tienda. Lo CONFIRMADO por el dueño está como valor; lo que sigue sin definir es `null`
 * o `false` y NO se inventa: ver docs/POLITICAS.md.
 */

/** Promociones minoristas (confirmadas por el dueño el 13/10/2026): 3 cuotas sin interés o 10% OFF por transferencia con al menos una caja. */
export const promo = {
  /** Cantidad mínima de cajas en el pedido para habilitar las promociones. Con sobres solos no aplican. */
  minBoxes: 1,
  /** Formatos que cuentan como «caja». Kits, bundles y cajas especiales NO cuentan hasta que el dueño lo defina. */
  boxKinds: ["box"] as readonly ProductKind[],
  installments: 3,
  transferDiscountPercent: 10,
  /**
   * A qué importe se aplica el 10%: `order-products` = todo el subtotal de productos de un pedido que califica (interpretación de
   * trabajo: el dueño no detalló el tratamiento de los sobres que acompañan a la caja); `boxes-only` = solo las cajas. El envío nunca entra.
   */
  discountScope: "order-products" as "order-products" | "boxes-only",
};

/**
 * Cuenta y catálogo mayorista. Confirmado por el dueño (02/11/2026): la cuenta se solicita y el dueño la aprueba A MANO; es exclusivamente POR PEDIDO (el stock minorista no cuenta);
 * pago por transferencia o efectivo SIN descuento adicional ni beneficios minoristas; seña del 20% después de confirmar disponibilidad e importe, y el resto al retirar o antes del despacho,
 * con la mercadería ya en Argentina; los precios dependen de la cantidad. La referencia interna de precio es costo final × 1,5 (recargo del 50% sobre costo, NO un descuento sobre el minorista).
 * SIGUE SIN DEFINIR (y vive en el panel, vacío hasta que el dueño decida; el catálogo no se abre sin esto): compra mínima, si los productos se combinan para alcanzar el mínimo y cada tramo,
 * las cantidades y precios de los tramos y las demoras estimadas. La financiación a 3 o 6 meses solo se puede CONSULTAR: no se promete aprobación, cuotas ni tasas.
 */
export const mayorista = {
  approval: "manual" as const,
  /** La revisión (aprobar / rechazar) está habilitada: la hace el dueño a mano. */
  activationEnabled: true,
  /** Recargo interno sobre el costo final (referencia de trabajo para proponer precios; el dueño fija cada tramo). */
  referenceMarkupOverCostPercent: 50,
  senaPercent: 20,
  paymentNote: "Transferencia o efectivo, sin descuento adicional.",
} as const;

/** Encargos (confirmado el 13/10/2026: seña del 20%). El resto de las condiciones sigue sin definir. */
export const encargo = {
  senaPercent: 20,
  /** Sin definir (no se inventan): plazos, seña reembolsable o no, momento de pago del saldo, vigencia de la cotización y cancelación. */
  plazos: null as string | null,
  senaReembolsable: null as boolean | null,
  vigenciaCotizacion: null as string | null,
  /** ¿Las promociones y el 30% mayorista aplican a un encargo? PENDIENTE. Hoy no se aplica ningún beneficio a una seña ni a un encargo. */
  beneficiosAplican: null as null | boolean,
};
