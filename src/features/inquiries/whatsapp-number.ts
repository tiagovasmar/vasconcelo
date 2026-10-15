/** Número de WhatsApp válido (8–15 dígitos, formato internacional sin «+») o null → modo demo. Nunca se inventa un número. */
export function parseWhatsappNumber(raw: string | undefined | null): string | null {
  const digits = (raw ?? "").trim();
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
