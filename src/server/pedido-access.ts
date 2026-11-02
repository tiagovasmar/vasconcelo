import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { inquiries, orderTracks } from "@/db/schema";
import { hashToken } from "@/features/inquiries/service";
import { canView, type Viewer } from "@/features/pedidos/service";
import { SESSION_COOKIE } from "./http";
import { isAdmin } from "./admin";
import { getUser, userFromRequest, type SessionUser } from "./session";

/**
 * Quién pregunta por un pedido, siempre resuelto en el servidor: la cuenta de la sesión, la cookie de invitado (httpOnly) o el enlace privado que entrega el dueño.
 * La referencia (TT-…) NO es una credencial. Un pedido ajeno responde 404 igual que uno inexistente (no se revela cuál existe).
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const LINK_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function viewerFrom(user: SessionUser | null, cookieToken: string | undefined, linkToken?: string | null): Viewer {
  return {
    userId: user?.id ?? null,
    sessionTokenHash: cookieToken && TOKEN_RE.test(cookieToken) ? hashToken(cookieToken) : null,
    accessToken: linkToken && LINK_RE.test(linkToken) ? linkToken : null,
  };
}

/** Para páginas del servidor. */
export async function viewerForPage(linkToken?: string | null): Promise<{ viewer: Viewer; user: SessionUser | null }> {
  const user = await getUser();
  return { viewer: viewerFrom(user, (await cookies()).get(SESSION_COOKIE)?.value, linkToken), user };
}

/** Para rutas de la API. */
export async function viewerForRequest(req: Request, linkToken?: string | null): Promise<{ viewer: Viewer; user: SessionUser | null }> {
  const user = await userFromRequest(req);
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return { viewer: viewerFrom(user, m?.[1], linkToken), user };
}

/** La consulta y su seguimiento, solo si quien pregunta puede verlos (o es el administrador). */
export async function orderIfAllowed(db: Db, ref: string, who: { viewer: Viewer; user: SessionUser | null }) {
  const [inq] = await db.select().from(inquiries).where(eq(inquiries.id, ref));
  if (!inq) return null;
  const [track] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, ref));
  const allowed = canView(inq, track, who.viewer) || isAdmin(who.user);
  return allowed ? { inquiry: inq, track: track ?? null } : null;
}
