import { paymentMethods, PICKUP_ADDRESS } from "./checkout-options";

/** Configuración única de la tienda. Todo lo marcado como demo se reemplaza antes de vender. */
export const store = {
  name: "Vasconcelo",
  descriptor: "POKÉMON TCG",
  isDemo: true,
  locale: "es-AR",
  currency: "ARS",
  timeZone: "America/Argentina/Buenos_Aires",
  /**
   * Número de WhatsApp en formato internacional, solo dígitos (p. ej. 54911XXXXXXXX). Vacío = modo demo:
   * se prepara la consulta y se muestra vista previa + copiar mensaje, sin abrir ningún chat.
   * También puede definirse con la variable de entorno WHATSAPP_NUMBER (tiene prioridad).
   */
  whatsappNumber: "",
  /** Invitación al grupo; independiente del número para atención y pedidos. */
  whatsappGroupUrl: "https://chat.whatsapp.com/J36bbxgvyLvAP1G54N5R5x",
  delivery: {
    andreani: "Andreani a todo el país",
    moto: "Moto en CABA y AMBA",
    pickup: `Retiro en ${PICKUP_ADDRESS}`,
  },
  pickupAddress: PICKUP_ADDRESS,
  paymentMethods,
} as const;

