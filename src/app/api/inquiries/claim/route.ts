import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { claimGuestInquiries, hashToken } from "@/features/inquiries/service";
import { SESSION_COOKIE, errorJson, json, rateLimited, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

/**
 * Asocia a la cuenta las consultas de invitado de ESTE navegador. No recibe ninguna referencia: la prueba de pertenencia
 * es la cookie httpOnly de la sesión de invitado. Conocer la referencia de un pedido no permite reclamarlo.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthenticated", "Iniciá sesión para continuar.");
  if (await rateLimited(req, "reclamar", 20, 3600)) return errorJson(429, "rate_limited", "Demasiados intentos. Esperá un rato.");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ claimed: 0 });
  const claimed = await claimGuestInquiries(getDb(), user.id, hashToken(token));
  return json({ claimed });
}
