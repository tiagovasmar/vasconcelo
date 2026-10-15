/**
 * Código de grupo (`pg`) de cada colección en el buscador oficial de cartas. Se leyeron del propio selector de
 * expansiones del buscador y el importador los valida contra el título que devuelve (scripts/colecciones/config.mjs).
 * Ojo: el paquete de origen traía pg=922 para Heat Wave Arena, que corresponde a otra expansión (SV7a); el correcto es 940.
 */
export const COLECCIONES_PG: Record<string, number> = {
  "black-bolt": 942,
  "white-flare": 943,
  "heat-wave-arena": 940,
  "inferno-x": 949,
  "mega-dream-ex": 950,
  "30th-celebration": 961,
  "storm-emeralda": 955,
  "abyss-eye": 954,
};
