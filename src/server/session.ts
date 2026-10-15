import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export type SessionUser = { id: string; name: string; email: string; emailVerified: boolean };

/** Usuario de la sesión actual, validado en el servidor (o null). */
export async function getUser(): Promise<SessionUser | null> {
  const s = await getAuth().api.getSession({ headers: await headers() });
  return s ? { id: s.user.id, name: s.user.name, email: s.user.email, emailVerified: s.user.emailVerified } : null;
}

export async function userFromRequest(req: Request): Promise<SessionUser | null> {
  const s = await getAuth().api.getSession({ headers: req.headers });
  return s ? { id: s.user.id, name: s.user.name, email: s.user.email, emailVerified: s.user.emailVerified } : null;
}

/** Rutas privadas: sin sesión válida se redirige al ingreso. La validación es siempre del servidor. */
export async function requireUser(next: string): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect(`/cuenta/ingresar?next=${encodeURIComponent(next)}`);
  return u;
}
