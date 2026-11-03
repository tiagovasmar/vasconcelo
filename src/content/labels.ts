import type { Language, ProductKind } from "./schema";

/**
 * Etiquetas de idioma y formato, SIN dependencias (solo tipos). Viven aparte de `schema.ts` (que arrastra la librería de validación zod) para que los
 * componentes del navegador —carrito, panel lateral, insignia de idioma— no descarguen zod solo por leer un texto. `schema.ts` las vuelve a exportar.
 */
export const languageLabel: Record<Language, string> = { ja: "Japonés", en: "Inglés", es: "Español", zh: "Chino simplificado", "zh-TW": "Chino tradicional", na: "No aplica" };
export const kindLabel = { booster: "Sobre", pack: "Pack", box: "Caja", bundle: "Bundle", kit: "Kit de mazo", "special-box": "Caja especial", "illustration-set": "Set de ilustraciones", accessory: "Accesorio" } as const;
/** Formatos que se dibujan con la caja ancha (ilustración de reserva y carrito). */
export const wideKinds: readonly ProductKind[] = ["box", "bundle", "kit", "special-box", "illustration-set"];
