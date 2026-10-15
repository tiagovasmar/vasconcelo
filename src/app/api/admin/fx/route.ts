import { z } from "zod";
import { getDb } from "@/db/client";
import { parseRateInput } from "@/features/fx/convert";
import { FxError, refreshRate, setManualRate, setMode } from "@/features/fx/service";
import { adminFromRequest } from "@/server/admin";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("auto") }),
  z.object({ action: z.literal("manual"), rate: z.string().max(30), note: z.string().max(200).optional() }),
]);

/** Ajustes de cotización (solo el dueño): consultar ahora, volver a automático, o fijar un valor manual. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-fx", 30, 60)) return errorJson(429, "rate_limited", "Demasiados cambios seguidos. Esperá un momento.");
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return errorJson(400, "invalid_input", "Revisá los datos.");
  const db = getDb();
  const actor = { id: auth.user.id, email: auth.user.email };
  try {
    if (parsed.data.action === "refresh") {
      const r = await refreshRate(db, { force: true });
      if ("skipped" in r && r.skipped) return errorJson(409, "refresh_disabled", r.reason);
      if (!("ok" in r) || !r.ok) return errorJson(502, "provider_error", ("error" in r && r.error) || "No se pudo consultar al proveedor. Se conserva la última cotización válida.");
      return json({ ok: true, changed: r.changed, rate10k: r.rate10k });
    }
    if (parsed.data.action === "auto") {
      await setMode(db, "auto", actor);
      // Al volver a automático se intenta traer un valor fresco, pero el cambio de modo ya quedó guardado aunque falle.
      await refreshRate(db, { force: true });
      return json({ ok: true });
    }
    const rate = parseRateInput(parsed.data.rate);
    if (rate === null) return errorJson(400, "invalid_rate", "Escribí la cotización como un número positivo, por ejemplo 1425 o 1.425,50.");
    await setManualRate(db, rate, actor, parsed.data.note ?? null);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof FxError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}
