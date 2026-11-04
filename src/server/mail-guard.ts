import { mailTransportAvailable } from "./mail";

/** Rutas de autenticación que dependen de poder enviar un correo. */
const NEEDS_MAIL = ["/request-password-reset", "/send-verification-email", "/forget-password"];

/**
 * Si el entorno no puede enviar correos, rechaza de forma explícita (503) las acciones que lo necesitan, en vez de
 * responder «ok» sin haber enviado nada. Devuelve null cuando la petición puede seguir.
 */
export function guardMail(req: Request): Response | null {
  if (mailTransportAvailable()) return null;
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "");
  if (req.method !== "POST" || !NEEDS_MAIL.includes(path)) return null;
  return Response.json(
    { code: "MAIL_UNAVAILABLE", message: "En este entorno todavía no se pueden enviar correos, así que esta acción no está disponible." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
