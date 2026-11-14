import "server-only";
import { getDb } from "@/db/client";
import { storefrontOnce } from "@/features/admin/storefront";
import { incomingProducts } from "./service";
import { arrivalEstimate } from "@/content/incoming-arrivals";

const dayLabel = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });

export function upcomingArrivalLabel(id: string, availableAt?: number | null) {
  return availableAt ? `Disponibilidad estimada desde el ${dayLabel.format(availableAt)}` : arrivalEstimate(id) ?? "Fecha de ingreso a confirmar.";
}

export async function publicUpcoming(productId?: string) {
  const settings = await storefrontOnce();
  const result = new Map<string, { traveling: boolean; fromPurchase: boolean; availableAt?: number | null }>();
  if (!settings.upcomingEnabled) return result;
  for (const [id, incoming] of await incomingProducts(getDb(), productId)) {
    if (settings.products[id] !== "ocultar") result.set(id, { traveling: incoming.traveling > 0, fromPurchase: true, availableAt: incoming.availableAt });
  }
  for (const [id, choice] of Object.entries(settings.products)) {
    if (choice === "mostrar" && (!productId || id === productId) && !result.has(id)) {
      result.set(id, { traveling: false, fromPurchase: false });
    }
  }
  return result;
}
