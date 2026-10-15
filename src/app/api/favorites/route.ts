import { z } from "zod";
import { getDb } from "@/db/client";
import { addFavorite, FavoriteError, removeFavorite } from "@/features/account/favorites";
import { errorJson, json, rateLimited, readJson, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

const Body = z.object({ productId: z.string().min(1).max(80) });

async function handle(req: Request, action: "add" | "remove") {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const user = await userFromRequest(req);
  if (!user) return errorJson(401, "unauthenticated", "Iniciá sesión para guardar favoritos.");
  if (await rateLimited(req, "favoritos", 120, 60)) return errorJson(429, "rate_limited", "Demasiadas acciones seguidas. Esperá un momento.");
  let body: unknown;
  try {
    body = await readJson(req, 2000);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return errorJson(400, "invalid_input", "Falta el producto.");
  try {
    // El usuario sale de la sesión: el body nunca puede indicar de quién es el favorito.
    if (action === "add") await addFavorite(getDb(), user.id, parsed.data.productId);
    else await removeFavorite(getDb(), user.id, parsed.data.productId);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof FavoriteError) return errorJson(e.status, "not_found", e.message);
    console.error("[favoritos] error inesperado");
    return errorJson(500, "persistence_error", "No pudimos guardar el cambio. Intentá de nuevo.");
  }
}

export const POST = (req: Request) => handle(req, "add");
export const DELETE = (req: Request) => handle(req, "remove");
