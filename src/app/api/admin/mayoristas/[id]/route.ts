import { z } from "zod";
import { getDb } from "@/db/client";
import { reviewWholesaleRequest, WholesaleError } from "@/features/wholesale/service";
import { adminFromRequest } from "@/server/admin";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

const Body = z.object({ status: z.enum(["aprobada", "rechazada"]) });

/**
 * Revisión de una solicitud mayorista (aprobar o rechazar). Solo el dueño configurado. Mecanismo listo pero APAGADO: mientras la
 * política comercial no esté definida (`mayorista.activationEnabled`) responde 409 `policy_pending` y no cambia nada.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-mayoristas", 120, 60)) return errorJson(429, "rate_limited", "Demasiados cambios seguidos. Esperá un momento.");
  let body: unknown;
  try {
    body = await readJson(req, 1_000);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return errorJson(400, "invalid_input", "El estado debe ser «aprobada» o «rechazada».");
  const { id } = await ctx.params;
  try {
    return json({ request: await reviewWholesaleRequest(getDb(), id, parsed.data.status, auth.user.email) });
  } catch (e) {
    if (e instanceof WholesaleError) return errorJson(e.info.status, e.info.code, e.info.message);
    throw e;
  }
}
