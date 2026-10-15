import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { GalleryEditSchema, resetGallery, saveGallery } from "@/features/catalog/gallery";
import { AdminError } from "@/features/catalog/overrides";
import { adminFromRequest } from "@/server/admin";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

/** Guarda la galería (orden, portada, textos alternativos, fotos retiradas) de UN producto. Solo el dueño configurado. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-guardar", 120, 60)) return errorJson(429, "rate_limited", "Demasiados cambios seguidos. Esperá un momento.");
  let body: unknown;
  try {
    body = await readJson(req, 60_000);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = GalleryEditSchema.safeParse(body);
  if (!parsed.success) return errorJson(400, "invalid_input", parsed.error.issues[0]?.message ?? "Revisá los datos.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const { id } = await ctx.params;
  try {
    const r = await saveGallery(getDb(), catalog.products, id, parsed.data, { id: auth.user.id, email: auth.user.email });
    return json({ ok: true, version: r.version });
  } catch (e) {
    if (e instanceof AdminError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}

/** Vuelve a la galería del catálogo por código. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-guardar", 120, 60)) return errorJson(429, "rate_limited", "Demasiados cambios seguidos. Esperá un momento.");
  const version = Number(new URL(req.url).searchParams.get("version"));
  if (!Number.isInteger(version) || version < 0) return errorJson(400, "invalid_input", "Falta la versión de la galería.");
  const { id } = await ctx.params;
  try {
    const r = await resetGallery(getDb(), catalog.products, id, version, { id: auth.user.id, email: auth.user.email });
    return json({ ok: true, version: r.version });
  } catch (e) {
    if (e instanceof AdminError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}
