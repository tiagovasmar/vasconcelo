/**
 * Opciones de entrega y pago visibles para el cliente (se usan también en el navegador, por eso viven aparte de store.ts,
 * que contiene la configuración de la tienda).
 */

/** Único punto de retiro. El horario y la dirección exacta NO están definidos en la web: se consultan por WhatsApp antes de ir. */
export const PICKUP_ADDRESS = "Av. Rivadavia 14600";
/** Texto que se muestra al elegir «Retiro» (checkout, resumen y páginas públicas lo reutilizan para no contradecirse). */
export const PICKUP_NOTICE = `Retiro en ${PICKUP_ADDRESS}. Consultá por WhatsApp el horario para retirar y la dirección exacta.`;
/** Versión del mismo dato para el mensaje que recibe la tienda (no se promete retirar sin confirmación previa). */
export const PICKUP_MESSAGE = `Retiro en ${PICKUP_ADDRESS} (horario y dirección exacta a confirmar por WhatsApp)`;
export const PAY_ON_DELIVERY_NOTICE = "En CABA, Ramos Mejía y alrededores podés pagar al recibir.";

/** Preferencias de pago. El cobro se coordina por WhatsApp. */
export const paymentMethods = [
  { id: "transferencia", label: "Transferencia" },
  { id: "efectivo", label: "Efectivo · a coordinar" },
] as const;

export type PaymentMethodId = (typeof paymentMethods)[number]["id"];

/** Opciones que existieron antes y ya no se ofrecen. Solo sirven para mostrar consultas viejas; el servidor NO las acepta. */
export const legacyPaymentLabels: Record<string, string> = { "tarjeta-3-cuotas": "Tarjeta de crédito · 3 cuotas sin interés (opción anterior)", preventa: "Transferencia · seña de preventa", coordinar: "A coordinar por WhatsApp (opción anterior)", mayorista: "Transferencia o efectivo · sin descuento adicional (pedido mayorista)" };
