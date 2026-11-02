import { getDb } from "@/db/client";
import { createWholesaleOrder } from "@/features/mayorista/precios";
import { SaleError } from "@/features/sales/errors";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

/**
 * Pedido mayorista de una cuenta APROBADA. El servidor vuelve a validar la cuenta, el catálogo abierto, los tramos y los mínimos y calcula todos los importes:
 * lo que mande el navegador (precios, totales, rol) se ignora. No reserva ni descuenta stock minorista.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthorized", "Ingresá con tu cuenta para pedir.");
  if (await rateLimited(req, "pedido-mayorista", 20, 3600)) return errorJson(429, "rate_limited", "Hiciste varios pedidos seguidos. Esperá un rato.");
  let body: unknown;
  try {
    body = await readJson(req, 20_000);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  try {
    const r = await createWholesaleOrder(getDb(), user.id, body);
    return json({ reference: r.reference, replayed: r.replayed, totalArsMinor: r.quote.totalArsMinor }, r.replayed ? 200 : 201);
  } catch (e) {
    if (e instanceof SaleError) return errorJson(e.status, e.code, e.message, e.details);
    throw e;
  }
}
