import { paymentMethods } from "@/content/checkout-options";

const FMT = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
export const when = (ms: number) => FMT.format(new Date(ms));
export const pct = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(v));

/** Texto legible de la forma de pago guardada en una consulta. */
export const paymentText = (stored: string) => paymentMethods.find((p) => p.id === stored)?.label ?? stored;

/** Texto legible de la entrega guardada en una consulta (JSON de la tienda o `{ method: "manual", label }`). */
export function deliveryText(json: string): string {
  try {
    const d = JSON.parse(json) as { method: string; locality?: string; province?: string; postalCode?: string; label?: string };
    if (d.method === "andreani") return `Andreani · ${d.locality}, ${d.province} (CP ${d.postalCode})`;
    if (d.method === "moto") return `Moto · ${d.locality} (CP ${d.postalCode})`;
    if (d.method === "retiro") return "Retiro";
    return d.label ?? "";
  } catch {
    return "";
  }
}

/** Valor de un método de pago para una venta: si la preferencia de la consulta es uno de los métodos vigentes se usa; si no, hay que elegirlo. */
export const salePaymentOf = (stored: string): string => (paymentMethods.some((p) => p.id === stored) ? stored : "");
