import { getDb } from "@/db/client";
import { subscribeRestock } from "@/features/avisos/reposicion";
import { SaleError } from "@/features/sales/errors";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

/**
 * «Avisame cuando vuelva». Con cuenta usa el correo VERIFICADO de la cuenta (el que mande el navegador se ignora); de invitado exige un correo y el consentimiento.
 * Es un registro de interés: no crea una consulta ni una venta, no reserva stock y no garantiza el precio.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  if (await rateLimited(req, "avisos-reposicion", 10, 3600)) return errorJson(429, "rate_limited", "Hiciste varios pedidos seguidos. Esperá un rato.");
  let body: unknown;
  try {
    body = await readJson(req, 2_000);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const user = await userFromRequest(req);
  try {
    const r = await subscribeRestock(getDb(), body, { userId: user?.id ?? null, accountEmail: user?.email ?? null, emailVerified: user?.emailVerified ?? false });
    return json(r, r.replayed ? 200 : 201);
  } catch (e) {
    if (e instanceof SaleError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}
