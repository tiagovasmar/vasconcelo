import "server-only";
import { notFound, redirect } from "next/navigation";
import { getUser, userFromRequest, type SessionUser } from "./session";

/**
 * Quién administra: SOLO la cuenta cuyo correo está en la variable de entorno `ADMIN_EMAIL` (configuración explícita del dueño).
 * - Sin `ADMIN_EMAIL` el panel queda cerrado para todos: no hay primer usuario ni valor por defecto.
 * - Se exige sesión válida y correo VERIFICADO (el registro ya obliga a verificarlo con un enlace enviado a esa casilla),
 *   así nadie puede «declararse» administrador registrando el correo del dueño sin controlar su bandeja.
 * - La decisión es siempre del servidor; nada que mande el navegador (cookies propias, encabezados, cuerpo) la altera.
 */
export function adminEmail(): string | null {
  const v = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export const adminConfigured = () => adminEmail() !== null;

export function isAdmin(user: SessionUser | null): user is SessionUser {
  const admin = adminEmail();
  return Boolean(user && admin && user.emailVerified && user.email.trim().toLowerCase() === admin);
}

/** Páginas: sin sesión → ingreso; con sesión pero sin permiso (o panel sin configurar) → 404, sin revelar el motivo. */
export async function requireAdmin(next: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/cuenta/ingresar?next=${encodeURIComponent(next)}`);
  if (!isAdmin(user)) notFound();
  return user;
}

/** Operaciones (API): devuelve el administrador o un motivo de rechazo (401 sin sesión, 403 si no es el dueño o no está configurado). */
export async function adminFromRequest(req: Request): Promise<{ user: SessionUser } | { status: 401 | 403; code: string; message: string }> {
  const user = await userFromRequest(req);
  if (!user) return { status: 401, code: "unauthorized", message: "Ingresá con tu cuenta para continuar." };
  if (!isAdmin(user)) return { status: 403, code: "forbidden", message: "No tenés permiso para esta operación." };
  return { user };
}
