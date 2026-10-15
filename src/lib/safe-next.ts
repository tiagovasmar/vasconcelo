/** Solo se permite volver a rutas internas (evita redirecciones abiertas hacia otros sitios). */
export function safeNext(next: string | null | undefined, fallback = "/cuenta"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
