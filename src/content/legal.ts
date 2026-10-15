/**
 * Datos del comercio para los textos legales. TODO es provisorio: no se inventan CUIT, domicilio ni políticas.
 * Completar antes de publicar (ver docs/PENDIENTES-PUBLICACION.md). Mientras un dato sea `null`, la página muestra
 * «[A completar por el comercio]» y `npm run release:check` lo marca como pendiente.
 */
export const legal = {
  /** Mientras sea true, las páginas muestran el aviso de borrador. Pasar a false solo con el texto revisado por el comercio. */
  isDraft: true,
  lastUpdated: "2026-10-13",
  legalName: null as string | null, // razón social o nombre y apellido del titular
  taxId: null as string | null, // CUIT/CUIL
  address: null as string | null, // domicilio legal
  contactEmail: null as string | null,
  jurisdiction: null as string | null, // ley aplicable y jurisdicción
  returnsPolicy: null as string | null, // cambios, devoluciones y garantías de venta
  dataRetention: null as string | null, // plazos de conservación de datos
};

export const PENDING_TEXT = "[A completar por el comercio]";
export const orPending = (v: string | null) => v ?? PENDING_TEXT;

/** Campos legales que todavía faltan (los usa `release:check`). */
export function pendingLegalFields(): string[] {
  const labels: Record<string, string> = {
    legalName: "razón social / titular",
    taxId: "CUIT/CUIL",
    address: "domicilio legal",
    contactEmail: "correo de contacto",
    jurisdiction: "ley aplicable y jurisdicción",
    returnsPolicy: "política de cambios, devoluciones y garantías",
    dataRetention: "plazos de conservación de datos",
  };
  return Object.entries(labels).filter(([k]) => (legal as Record<string, unknown>)[k] === null).map(([, v]) => v);
}
