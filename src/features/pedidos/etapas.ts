import { encargo } from "@/content/politicas";
import { percentOf } from "@/lib/money";

/**
 * Etapas LOGÍSTICAS de un pedido y estado de PAGO derivado. Son dos cosas separadas: una etapa nunca implica un pago ni al revés.
 * Módulo puro (sin base de datos ni servidor): también lo usan las pantallas.
 */
export type TrackKind = "stock" | "encargo" | "mayorista";

export const STOCK_STAGES = ["confirmado", "preparando", "enviado", "listo_retiro", "entregado"] as const;
/** Encargos y mayoristas: el proceso acordado con el dueño, en orden. «enviado» (al cliente) y «listo_retiro» son alternativas del mismo paso. */
export const ENCARGO_STAGES = [
  "solicitud_recibida",
  "confirmado_tienda",
  "sena_confirmada",
  "comprado_proveedor",
  "enviado_proveedor",
  "recibido_origen",
  "en_transito",
  "recibido_argentina",
  "enviado",
  "listo_retiro",
  "entregado",
] as const;
export type Stage = (typeof STOCK_STAGES)[number] | (typeof ENCARGO_STAGES)[number];

export const stagesFor = (kind: TrackKind): readonly Stage[] => (kind === "stock" ? STOCK_STAGES : ENCARGO_STAGES);
export const firstStage = (kind: TrackKind): Stage => stagesFor(kind)[0];

export const STAGE_LABEL: Record<Stage, string> = {
  solicitud_recibida: "Solicitud recibida",
  confirmado_tienda: "Producto, disponibilidad e importe confirmados por la tienda",
  sena_confirmada: "Seña del 20% confirmada",
  comprado_proveedor: "Comprado al proveedor",
  enviado_proveedor: "Enviado por el proveedor",
  recibido_origen: "Recibido en el depósito de origen",
  en_transito: "En tránsito a Argentina",
  recibido_argentina: "Recibido en Argentina",
  confirmado: "Pedido confirmado",
  preparando: "Preparando tu pedido",
  enviado: "Enviado",
  listo_retiro: "Listo para retirar",
  entregado: "Entregado",
};

/** Texto corto para la etapa que ve la cliente en el aviso. */
export const rank = (kind: TrackKind, stage: string): number => stagesFor(kind).indexOf(stage as Stage);

/** Etapas de transporte internacional: las gobiernan los envíos agrupados (`shipments`), no un clic suelto. */
export const SHIPPING_STAGES = ["enviado_proveedor", "recibido_origen", "en_transito", "recibido_argentina"] as const;
export const isShippingStage = (s: string): boolean => (SHIPPING_STAGES as readonly string[]).includes(s);

/** Estados de un envío agrupado, en orden (el primero «preparando» todavía no salió). */
export const SHIPMENT_STATUSES = ["preparando", "enviado_proveedor", "recibido_origen", "en_transito", "recibido_argentina"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  preparando: "Armando el envío",
  enviado_proveedor: "Enviado por el proveedor",
  recibido_origen: "Recibido en el depósito de origen",
  en_transito: "En tránsito a Argentina",
  recibido_argentina: "Recibido en Argentina",
};
export const shipmentRank = (s: string): number => SHIPMENT_STATUSES.indexOf(s as ShipmentStatus);

/* ---------- Pago (separado de la logística) ---------- */

export type PaymentSummary = {
  confirmedMinor: number;
  pendingReceipts: number;
  /** sin_pago · comprobante_en_revision · parcial · completo (siempre relativo al importe ACORDADO; sin importe acordado no hay «completo»). */
  status: "sin_pago" | "comprobante_en_revision" | "parcial" | "completo";
};

export function summarizePayments(p: { agreedMinor: number | null; confirmedMinor: number; pendingReceipts: number }): PaymentSummary {
  const { agreedMinor, confirmedMinor, pendingReceipts } = p;
  let status: PaymentSummary["status"] = "sin_pago";
  if (agreedMinor !== null && agreedMinor > 0 && confirmedMinor >= agreedMinor) status = "completo";
  else if (confirmedMinor > 0) status = "parcial";
  else if (pendingReceipts > 0) status = "comprobante_en_revision";
  return { confirmedMinor, pendingReceipts, status };
}

export const PAYMENT_STATUS_LABEL: Record<PaymentSummary["status"], string> = {
  sin_pago: "Sin pagos confirmados",
  comprobante_en_revision: "Comprobante en revisión",
  parcial: "Pago parcial confirmado",
  completo: "Pago completo confirmado",
};

/** Importe de la seña (20% del importe acordado y confirmado). null mientras no haya importe acordado: nunca se calcula sobre un precio inexistente. */
export const senaFor = (agreedMinor: number | null): number | null => (agreedMinor && agreedMinor > 0 ? percentOf(agreedMinor, encargo.senaPercent) : null);

/**
 * Qué acción corresponde a la cliente, sin tablero de deuda: una frase según el tipo, la etapa y lo ya confirmado.
 * El saldo (80%) se pide recién cuando el pedido llegó a Argentina y antes del despacho o del retiro.
 */
export function nextAction(p: { kind: TrackKind; stage: string; agreedMinor: number | null; confirmedMinor: number; pendingReceipts: number; cancelled: boolean }, fmt: (minor: number) => string): string | null {
  if (p.cancelled || p.stage === "entregado") return null;
  const sena = senaFor(p.agreedMinor);
  if (p.kind !== "stock") {
    if (p.agreedMinor === null) return "La tienda te va a confirmar el producto, la disponibilidad y el importe. Todavía no hace falta pagar nada.";
    if (p.confirmedMinor <= 0) {
      if (p.pendingReceipts > 0) return "Recibimos tu comprobante. Lo revisamos y, cuando confirmemos el ingreso, avanzamos con la compra.";
      return sena !== null ? `Para avanzar con la compra, abonar la seña del ${encargo.senaPercent}% (${fmt(sena)}). Podés adjuntar el comprobante acá.` : null;
    }
    const r = rank(p.kind, p.stage);
    if (r >= rank(p.kind, "recibido_argentina") && r < rank(p.kind, "entregado") && p.confirmedMinor < p.agreedMinor) return `Tu pedido ya está en Argentina. Falta abonar el resto del importe acordado (${fmt(p.agreedMinor - p.confirmedMinor)}) antes del despacho o del retiro. Podés adjuntar el comprobante acá.`;
    return `Cuando tu pedido llegue a Argentina te avisamos para abonar el ${100 - encargo.senaPercent}% restante, antes del despacho o del retiro.`;
  }
  if (p.agreedMinor !== null && p.confirmedMinor < p.agreedMinor && p.pendingReceipts === 0 && rank("stock", p.stage) < rank("stock", "entregado")) return "Si ya transferiste, adjuntá el comprobante acá para que lo revisemos.";
  if (p.pendingReceipts > 0) return "Recibimos tu comprobante y lo estamos revisando.";
  return null;
}
