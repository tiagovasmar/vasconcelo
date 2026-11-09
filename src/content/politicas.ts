/**
 * Condiciones comerciales de la tienda. Lo CONFIRMADO por el dueño está como valor; lo que sigue sin definir es `null`
 * o `false` y NO se inventa: ver docs/POLITICAS.md.
 */

/**
 * Cuenta y catálogo mayorista. Confirmado por el dueño (02/11/2026): la cuenta se solicita y el dueño la aprueba A MANO; es exclusivamente POR PEDIDO (el stock minorista no cuenta);
 * pago por transferencia o efectivo SIN descuento adicional ni beneficios minoristas; seña del 20% después de confirmar disponibilidad e importe, y el resto al retirar o antes del despacho,
 * con la mercadería ya en Argentina; los precios dependen de la cantidad. La referencia interna de precio es costo final × 1,5 (recargo del 50% sobre costo, NO un descuento sobre el minorista).
 * SIGUE SIN DEFINIR (y vive en el panel, vacío hasta que el dueño decida; el catálogo no se abre sin esto): compra mínima, si los productos se combinan para alcanzar el mínimo y cada tramo,
 * las cantidades y precios de los tramos y las demoras estimadas. La financiación a 3 o 6 meses solo se puede CONSULTAR: no se promete aprobación, cuotas ni tasas.
 */
export const mayorista = {
  cancellationPolicy: "Podés solicitar la cancelación voluntaria. Una vez confirmada la orden al proveedor, la seña no se devuelve porque el producto ya está pagado.",
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
