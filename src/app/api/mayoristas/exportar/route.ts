import { getDb } from "@/db/client";
import { wholesaleAccess, wholesaleCatalog } from "@/features/mayorista/precios";
import { hasBasePrice } from "@/features/mayorista/calc";
import { errorJson, json } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Misma autorización que el catálogo; no publica costos ni datos de clientes. */
export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthorized", "Ingresá para exportar el catálogo.");
  try {
    const db = getDb();
    if (!(await wholesaleAccess(db, user.id)).ok) return errorJson(403, "forbidden", "Necesitás una cuenta mayorista aprobada y el catálogo habilitado.");
    const { rows, fx, rules } = await wholesaleCatalog(db);
    return json({ rows: rows.filter(hasBasePrice), fx, minBoxes: rules.minBoxes, generatedAt: Date.now() });
  } catch {
    return errorJson(503, "unavailable", "No pudimos actualizar los precios. Intentá nuevamente.");
  }
}
