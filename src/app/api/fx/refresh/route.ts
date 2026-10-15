import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { refreshRate } from "@/features/fx/service";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";

/**
 * Actualización de la cotización para una tarea programada externa (cron, Vercel Cron, etc.): `Authorization: Bearer <CRON_SECRET>`.
 * Sin `CRON_SECRET` configurado el endpoint no existe (404). No expone la cotización ni acepta otros datos.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return errorJson(404, "not_found", "No encontrado.");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return errorJson(401, "unauthorized", "No autorizado.");
  const r = await refreshRate(getDb(), { force: true });
  if ("skipped" in r && r.skipped) return json({ skipped: true });
  return json("ok" in r && r.ok ? { ok: true, changed: r.changed } : { ok: false, error: "error" in r ? r.error : "desconocido" });
}
export const GET = handle;
export const POST = handle;
