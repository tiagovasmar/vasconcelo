import { formatRate, formatUSD } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";
import { PICKUP_MESSAGE } from "@/content/checkout-options";
import { encargo as politicaEncargo } from "@/content/politicas";
import { languageLabel, type Language } from "@/content/schema";
import type { Delivery } from "./schemas";

/** `unitPriceMinor` es null en las líneas por encargo (sin precio ni cotización todavía). */
export type MessageLine = { quantity: number; title: string; language: Language; sku: string; unitPriceMinor: number | null; /** Precio base en USD (centavos) si el producto lo tiene. */ unitPriceUsdMinor?: number | null };
export type MessageData = {
  reference: string;
  contactName?: string;
  lines: MessageLine[];
  /** Subtotal de los productos disponibles (sin los que se encargan), antes de descuentos. */
  subtotalMinor: number;
  /** 10% OFF por transferencia (solo pedidos con una caja). 0/ausente = sin descuento. */
  discountMinor?: number;
  /** Cotización usada para convertir los precios USD (solo si algún producto tenía precio en USD). */
  fx?: { rate10k: number; mode: "auto" | "manual" } | null;
  delivery: Delivery;
  paymentLabel: string;
};

const money = (m: number) => formatARS(m).replace(/[  ]/g, " ");

export function describeDelivery(d: Delivery): string {
  if (d.method === "andreani") return `Andreani · ${d.locality}, ${d.province} (CP ${d.postalCode.toUpperCase()})`;
  if (d.method === "moto") return `Moto CABA/AMBA · ${d.locality} (CP ${d.postalCode.toUpperCase()}) · cobertura a confirmar`;
  return PICKUP_MESSAGE;
}

/** Negrita de WhatsApp: un asterisco por lado, sin espacios pegados a los asteriscos. */
const bold = (t: string) => `*${t.trim()}*`;

const titleOf = (l: MessageLine) => `${l.quantity} × ${l.title} [${languageLabel[l.language]}] — SKU ${l.sku}`;

/** Mensaje completo, con el formato acordado. Importes siempre calculados por el servidor. Los productos por encargo van aparte y sin importe. */
export function buildMessage(m: MessageData): string {
  const head = m.contactName ? `Hola, soy ${m.contactName}. Quiero consultar este pedido:` : "Hola, quiero consultar este pedido:";
  const stock = m.lines.filter((l) => l.unitPriceMinor !== null);
  const encargo = m.lines.filter((l) => l.unitPriceMinor === null);
  const mixed = stock.length > 0 && encargo.length > 0;
  const discount = m.discountMinor ?? 0;
  const out: string[] = [head, `Referencia: ${m.reference}`, ...(m.contactName ? [`Nombre y apellido: ${m.contactName}`] : []), ""];
  if (stock.length) {
    if (mixed) out.push("Para comprar (disponibles):");
    out.push(stock.map((l) => `${titleOf(l)}\nUnitario: ${money(l.unitPriceMinor!)}${l.unitPriceUsdMinor ? ` (${formatUSD(l.unitPriceUsdMinor)})` : ""} · Importe: ${money(l.unitPriceMinor! * l.quantity)}`).join("\n\n"), "");
  }
  if (encargo.length) out.push("Por encargo (disponibilidad y cotización a confirmar):", encargo.map(titleOf).join("\n"), "");
  if (stock.length) {
    out.push(`${bold(`Subtotal: ${money(m.subtotalMinor)}`)}${mixed ? " (sin los productos por encargo)" : ""}`);
    if (discount > 0) out.push(`Descuento por transferencia: -${money(discount)}`);
    out.push(bold(`Total: ${money(m.subtotalMinor - discount)}`));
  }
  if (m.fx && stock.length) out.push(`Precios en pesos: ${m.fx.mode === "manual" ? "cotización fijada por la tienda" : "dólar blue (venta)"} ${formatRate(m.fx.rate10k).replace(/[  ]/g, " ")} por dólar, redondeado a múltiplos de $100.`);
  out.push(`Entrega: ${describeDelivery(m.delivery)}`, "Envío: a coordinar (no está incluido en el total)", `Método de pago: ${m.paymentLabel}`);
  if (encargo.length) out.push(`Encargo: sin cotización todavía. Si se confirman disponibilidad y cotización, la seña es del ${politicaEncargo.senaPercent}% de lo cotizado y el saldo del ${100 - politicaEncargo.senaPercent}%; el pago y la entrega se coordinan con la tienda.`);
  out.push("", encargo.length ? "¿Me confirmás disponibilidad y cotización de lo que pedí por encargo?" : "¿Me confirmás disponibilidad e importe final?");
  return out.join("\n");
}

/**
 * Límite CONSERVADOR de longitud para la URL wa.me ya codificada. No es un límite universal ni está medido en todos los
 * clientes: es una decisión de diseño para no depender de comportamientos no probados. Si se supera, se abre el chat con un
 * resumen legible + referencia y se ofrece copiar el detalle íntegro; nunca se trunca nada en silencio.
 */
export const WA_URL_SOFT_LIMIT = 1800;

export type Launch = { mode: "full" | "summary"; text: string; url: string | null };

export function summaryMessage(m: MessageData): string {
  const items = m.lines.reduce((n, l) => n + l.quantity, 0);
  return [
    "Hola, quiero consultar un pedido con muchos productos.",
    `Referencia: ${m.reference}`,
    ...(m.contactName ? [`Nombre y apellido: ${m.contactName}`] : []),
    `${m.lines.length} productos distintos (${items} unidades)${m.lines.some((l) => l.unitPriceMinor === null) ? " · incluye productos por encargo (sin cotizar)" : ""}`,
    ...(m.lines.some((l) => l.unitPriceMinor !== null) ? [bold(`Subtotal: ${money(m.subtotalMinor)}`), ...((m.discountMinor ?? 0) > 0 ? [`Descuento por transferencia: -${money(m.discountMinor!)}`] : []), bold(`Total: ${money(m.subtotalMinor - (m.discountMinor ?? 0))}`)] : []),
    `Entrega: ${describeDelivery(m.delivery)}`,
    "Envío: a coordinar (no está incluido en el total)",
    `Método de pago: ${m.paymentLabel}`,
    "Te paso el detalle completo en el siguiente mensaje.",
  ].join("\n");
}

/** Construye el enlace wa.me. Con número ausente devuelve url null (modo demo). */
export function buildLaunch(number: string | null, m: MessageData, full: string): Launch {
  const encodedLen = (t: string) => `https://wa.me/${number ?? "0"}?text=${encodeURIComponent(t)}`.length;
  const useFull = encodedLen(full) <= WA_URL_SOFT_LIMIT;
  const text = useFull ? full : summaryMessage(m);
  return { mode: useFull ? "full" : "summary", text, url: number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null };
}
