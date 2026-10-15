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

/** Cuenta mayorista. Lo único definido es el 30%; todo lo demás lo define el dueño después. */
export const mayorista = {
  /** Descuento sobre el precio minorista de catálogo (interpretación de trabajo: la base de comparación es el precio de lista). */
  discountPercent: 30,
  /**
   * Habilitar la revisión y el uso de los beneficios. Mientras sea `false`: las solicitudes quedan «pendiente», ningún usuario
   * tiene precio mayorista y el servidor rechaza cambiar estados. Pasar a `true` solo cuando el dueño defina las políticas de abajo.
   */
  activationEnabled: false,
  /** Compra mínima (importe o unidades). PENDIENTE de definir por el dueño. */
  minimumPurchase: null as null | { minor?: number; units?: number },
  /** ¿El 30% se acumula con el 10% por transferencia? PENDIENTE (hoy no se aplica ningún acumulado). */
  stacksWithTransferDiscount: null as null | boolean,
  /** Aprobación de cuentas: manual o automática. PENDIENTE (hoy toda solicitud queda pendiente de revisión). */
  approval: null as null | "manual" | "automatic",
};

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
