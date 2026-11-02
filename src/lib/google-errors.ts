/** Mensajes del regreso de Google (la librería agrega ?error=… a la dirección de error). Nunca revelan si un correo ya estaba registrado. */
export function googleErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code === "access_denied") return "Cancelaste el ingreso con Google. Podés intentarlo de nuevo o ingresar con tu correo.";
  if (/account_not_linked|unable_to_link|email_doesn't_match|email_does_not_match/i.test(code)) return "No pudimos unir Google a una cuenta existente. Ingresá con tu correo y contraseña (si todavía no confirmaste ese correo, confirmalo o recuperá el acceso) y probá de nuevo.";
  return "No pudimos completar el ingreso con Google. Intentá de nuevo o ingresá con tu correo.";
}
