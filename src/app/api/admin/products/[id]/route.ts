import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { AdminError, ProductEditSchema, resetProduct, saveProductChange } from "@/features/catalog/overrides";
import { adminFromRequest } from "@/server/admin";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

/** Guarda precio, stock, máximo por pedido y visibilidad de UN producto. Solo el dueño configurado; todo se valida acá. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-guardar", 120, 60)) return errorJson(429, "rate_limited", "Demasiados cambios seguidos. Esperá un momento.");
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = ProductEditSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(400, "invalid_input", parsed.error.issues[0]?.message ?? "Revisá los datos.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const { id } = await ctx.params;
  try {
    const r = await saveProductChange(getDb(), catalog.products, id, parsed.data, { id: auth.user.id, email: auth.user.email });
    return json({ ok: true, changed: r.changed, version: r.version });
  } catch (e) {
    if (e instanceof AdminError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}

/** Restablece un producto a los valores del catálogo por código (borra los valores del panel y deja constancia). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-guardar", 120, 60)) return errorJson(429, "rate_limited", "Demasiados cambios seguidos. Esperá un momento.");
  const version = Number(new URL(req.url).searchParams.get("version"));
  if (!Number.isInteger(version) || version < 0) return errorJson(400, "invalid_input", "Falta la versión del producto.");
  const { id } = await ctx.params;
  try {
    const r = await resetProduct(getDb(), catalog.products, id, version, { id: auth.user.id, email: auth.user.email });
    return json({ ok: true, version: r.version });
  } catch (e) {
    if (e instanceof AdminError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}
