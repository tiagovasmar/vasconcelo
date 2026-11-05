import { getDb } from "@/db/client";
import { requestPreorder } from "@/features/importaciones/preorders";
import { SaleError } from "@/features/sales/errors";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthorized", "Ingresá con tu cuenta para solicitar la reserva.");
  if (!user.emailVerified) return errorJson(403, "forbidden", "Confirmá tu correo antes de solicitar la reserva.");
  if (await rateLimited(req, `preventa:${user.id}`, 12, 60)) return errorJson(429, "rate_limited", "Esperá antes de enviar otra solicitud.");
  const body = await readJson(req, 2048).catch(() => null);
  try {
    return json(await requestPreorder(getDb(), body, user));
  } catch (e) {
    if (e instanceof SaleError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}
