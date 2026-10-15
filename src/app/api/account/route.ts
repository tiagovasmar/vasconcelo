import { getDb } from "@/db/client";
import { listFavoriteIds } from "@/features/account/favorites";
import { json } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

/** Estado de la sesión para la interfaz: usuario (si hay) y sus favoritos. Nunca devuelve datos de otros usuarios. */
export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ user: null, favorites: [] });
  return json({ user: { name: user.name, email: user.email }, favorites: await listFavoriteIds(getDb(), user.id) });
}
