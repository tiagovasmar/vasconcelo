import { getDb } from "@/db/client";
import { cancelRestock } from "@/features/avisos/reposicion";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

/** Cancela un aviso de reposición: con el enlace secreto (`token`) o, desde la cuenta, por `id`. Repetirlo no hace nada. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  if (await rateLimited(req, "avisos-cancelar", 30, 3600)) return errorJson(429, "rate_limited", "Demasiados intentos. Esperá un rato.");
  let body: { token?: unknown; id?: unknown } | null;
  try {
    body = (await readJson(req, 1_000)) as { token?: unknown; id?: unknown } | null;
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const user = await userFromRequest(req);
  const r = await cancelRestock(getDb(), { token: typeof body?.token === "string" ? body.token : undefined, id: typeof body?.id === "string" ? body.id : undefined, userId: user?.id ?? null });
  if (!r.found) return errorJson(404, "not_found", "No encontramos ese aviso.");
  return json({ cancelled: true, changed: r.changed });
}
