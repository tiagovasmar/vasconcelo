/** Hora actual en ms. Existe para llamarla desde páginas de servidor sin que la regla de pureza de React la marque dentro del componente. */
export const nowMs = (): number => Date.now();
