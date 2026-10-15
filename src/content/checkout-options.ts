/**
 * Opciones de entrega y pago visibles para el cliente (se usan también en el navegador, por eso viven aparte de store.ts,
 * que contiene la configuración de la tienda).
 */
export const pickupPoints = [
  { id: "ramos-mejia", label: "Ramos Mejía" },
  { id: "haedo", label: "Haedo" },
] as const;

/**
 * Preferencias de pago. Cuotas y transferencia con descuento valen solo para pedidos que incluyen al menos una caja
 * (`features/politicas/promociones.ts`; el servidor lo valida). El 10% OFF es por TRANSFERENCIA: no se extendió al efectivo
 * porque el dueño no lo confirmó. El cobro se coordina por WhatsApp.
 */
export const paymentMethods = [
  { id: "coordinar", label: "A coordinar por WhatsApp" },
  { id: "tarjeta-3-cuotas", label: "Tarjeta de crédito · 3 cuotas sin interés (con una caja)" },
  { id: "transferencia", label: "Transferencia · 10% OFF (con una caja)" },
  { id: "efectivo", label: "Efectivo · a coordinar" },
] as const;

export type PaymentMethodId = (typeof paymentMethods)[number]["id"];
