import { getDb } from "@/db/client";
import { createWholesaleRequest, getWholesaleRequest, WholesaleError } from "@/features/wholesale/service";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

/** Solicitud mayorista de la cuenta con sesión iniciada. Solo la propia: el usuario sale de la sesión, nunca del cuerpo. */
export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthorized", "Ingresá con tu cuenta para continuar.");
  return json({ request: await getWholesaleRequest(getDb(), user.id) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthorized", "Ingresá con tu cuenta para solicitar la cuenta mayorista.");
  if (await rateLimited(req, "mayorista", Number(process.env.RATE_LIMIT_WHOLESALE_PER_HOUR || 20), 3600)) {
    return errorJson(429, "rate_limited", "Hiciste muchos intentos seguidos. Esperá un rato e intentá de nuevo.");
  }
  let body: unknown;
  try {
    body = await readJson(req, 4_000);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  try {
    const { request, replayed } = await createWholesaleRequest(getDb(), user.id, body);
    return json({ request, replayed }, replayed ? 200 : 201);
  } catch (e) {
    if (e instanceof WholesaleError) return errorJson(e.info.status, e.info.code, e.info.message, e.info.details);
    console.error("[mayorista] error inesperado al guardar la solicitud"); // sin datos personales
    return errorJson(500, "persistence_error", "No pudimos guardar tu solicitud. Intentá de nuevo.");
  }
}
