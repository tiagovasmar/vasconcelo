import "server-only";
import { adminFromRequest } from "./admin";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "./http";
import { SaleError } from "@/features/sales/service";

/**
 * Envoltorio común de las operaciones del panel: mismo origen, SOLO el administrador configurado (401/403 desde el servidor), límite de uso y JSON válido.
 * Nada que mande el navegador decide quién es administrador. Los errores de negocio de ventas/stock salen con su código y mensaje en español.
 */
export async function adminAction(req: Request, name: string, run: (ctx: { user: { id: string; email: string }; body: unknown }) => Promise<unknown>, opts: { body?: boolean; limit?: number; bodyLimit?: number } = {}) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, `admin-${name}`, opts.limit ?? 60, 60)) return errorJson(429, "rate_limited", "Demasiadas operaciones seguidas. Esperá un momento.");
  let body: unknown = undefined;
  if (opts.body !== false) {
    try {
      body = await readJson(req, opts.bodyLimit);
    } catch {
      return errorJson(400, "invalid_input", "La solicitud no es válida.");
    }
  }
  try {
    return json(await run({ user: { id: auth.user.id, email: auth.user.email }, body }));
  } catch (e) {
    if (e instanceof SaleError) return errorJson(e.status, e.code, e.message, e.details);
    throw e;
  }
}
