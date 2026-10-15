/**
 * Criterio monetario único (importes en centavos enteros). Todo descuento, precio mayorista o seña se calcula con
 * `percentOf`/`percentOff`, que redondean al PESO entero más cercano (mitad hacia arriba): así lo que se ve en tarjetas,
 * ficha, carrito y consulta (formatARS no muestra centavos) coincide siempre con lo que se calcula.
 */
const PESO = 100;

/** Redondea centavos al peso entero más cercano (mitad hacia arriba). */
export const roundToPeso = (minor: number): number => Math.round(minor / PESO) * PESO;

/** `percent`% de un importe, redondeado al peso. */
export const percentOf = (minor: number, percent: number): number => roundToPeso((minor * percent) / 100);

/** Importe menos `percent`% (descuento redondeado al peso). */
export const percentOff = (minor: number, percent: number): number => minor - percentOf(minor, percent);
