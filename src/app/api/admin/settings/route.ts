import { getDb } from "@/db/client";
import { LowStockInputSchema, setLowStock } from "@/features/admin/settings";
import { adminFromRequest } from "@/server/admin";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

/** Guarda el umbral del aviso de stock bajo. Solo el dueño configurado; mismo origen; se valida con Zod. */
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-ajustes", 30, 60)) return errorJson(429, "rate_limited", "Demasiados cambios seguidos. Esperá un momento.");
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = LowStockInputSchema.safeParse(body);
  if (!parsed.success) return errorJson(400, "invalid_input", parsed.error.issues[0]?.message ?? "Revisá el valor.");
  const s = await setLowStock(getDb(), parsed.data.lowStockThreshold, { email: auth.user.email });
  return json({ ok: true, threshold: s.threshold });
}
