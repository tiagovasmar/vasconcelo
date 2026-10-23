import fs from "node:fs";

/**
 * Gancho SOLO para pruebas automatizadas aisladas: permite provocar un fallo real del diseño raíz (para comprobar `global-error.tsx`).
 * Sin la variable `E2E_LAYOUT_FAIL_FILE` no hace nada. Con ella, el diseño falla mientras exista ese archivo (se crea y se borra desde la prueba,
 * así se puede comprobar también la recuperación sin reiniciar el servidor). Nunca se define en Netlify ni en un entorno real.
 */
export function failLayoutForTests(): void {
  const flag = process.env.E2E_LAYOUT_FAIL_FILE;
  if (flag && fs.existsSync(flag)) throw new Error("Fallo simulado del diseño raíz (solo pruebas): detalle interno que no debe verse en pantalla");
}
