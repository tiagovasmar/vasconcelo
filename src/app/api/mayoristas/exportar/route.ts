import { getDb } from "@/db/client";
import { wholesaleAccess, wholesaleCatalog } from "@/features/mayorista/precios";
import { hasBasePrice } from "@/features/mayorista/calc";
import { isAdmin } from "@/server/admin";
import { errorJson, json } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** La exportación con borradores está reservada al dueño. */
export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthorized", "Ingresá para exportar el catálogo.");
  const userId = user.id;
  const owner = isAdmin(user);
  const includeDrafts = new URL(req.url).searchParams.get("incluirBorradores") === "1";
  if (includeDrafts && !owner) return errorJson(403, "forbidden", "Solo el administrador puede exportar precios en borrador.");
  try {
    const db = getDb();
    if (!owner && !(await wholesaleAccess(db, userId)).ok) return errorJson(403, "forbidden", "Necesitás una cuenta mayorista aprobada y el catálogo habilitado.");
    const { rows, fx, rules } = await wholesaleCatalog(db, { includeDrafts });
    return json({ rows: rows.filter(hasBasePrice), fx, minBoxes: rules.minBoxes, generatedAt: Date.now() });
  } catch {
    return errorJson(503, "unavailable", "No pudimos actualizar los precios. Intentá nuevamente.");
  }
}
