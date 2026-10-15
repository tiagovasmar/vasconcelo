/** Importes siempre en centavos enteros; se formatean como ARS al mostrar. */
export function formatARS(minor: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
