# Actualización de seguridad de Next.js (23/10/2026)

Rama `feature/adicionales-en-ficha`, commit propio `81677b4`. **Sin publicar** (a la espera de aprobación). No cambia datos, esquema ni configuración de producción.

## Avisos oficiales (consultados el 23/10/2026)

Fuente: GitHub Security Advisories del repositorio `vercel/next.js` y notas de la versión v16.4.1 (<https://github.com/vercel/next.js/releases/tag/v16.4.1>, publicada el 14/10/2026), que lista exactamente estas tres correcciones.

| Identificador | Gravedad | Rango afectado (rama 16) | Corregida en | ¿Afecta a esta aplicación? |
|---|---|---|---|---|
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) — RCE sin autenticación en el optimizador de imágenes cuando se usan SVG | Crítica | >= 16.0.0, <= 16.4.0 | 16.4.1 | Muy poco probable (ver abajo). El origen es una falla de memoria de `sharp` en Linux con glibc; la mitigación oficial es usar `sharp` >= 0.35.5. |
| [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) — RCE sin autenticación en funciones `use cache` que devuelven arreglos tipados | Crítica | >= 16.0.0, <= 16.4.0 | 16.4.1 | No: la aplicación no usa `use cache` ni Cache Components. |
| [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) (CVE-2026-94482) — DoS en App Router con Server Actions | Alta | >= 16.0.0, <= 16.4.0 | 16.4.1 | No: la aplicación no tiene ninguna Server Action (`"use server"`). |

## Por qué el primero es poco probable aquí (análisis de código, no una prueba de ataque)
- `sharp` ya estaba en 0.35.5 (`package-lock.json`), la versión que el aviso pide como mínimo.
- No hay archivos SVG en `public/` ni `remotePatterns`/`dangerouslyAllowSVG` en `next.config.ts`: el optimizador solo procesa imágenes locales.
- Las fotos que sube el dueño se vuelven a codificar con `sharp` a WebP y solo se aceptan JPG, PNG o WebP (`src/server/media.ts`); un SVG se rechaza.

## Qué se hizo
- `next` 16.4.0 → **16.4.1** y `eslint-config-next` (y `@next/eslint-plugin-next`) 16.4.0 → **16.4.1**, alineados. `react`/`react-dom` no cambian. `sharp` sigue en 0.35.5.
- Existe 16.4.2 (15/10/2026: correcciones de Turbopack y documentación, sin avisos de seguridad). Se usó 16.4.1 por ser la versión corregida mínima pedida.
- `npm audit`: `next` ya no figura (antes: 1 crítica). Quedan 9 avisos de **herramientas de desarrollo** (`drizzle-kit`/`esbuild` y la cadena de lint `eslint-config-next` → `braces`/`micromatch`/`fast-glob`): no se despliegan; su arreglo propuesto implica bajar `eslint-config-next` a la versión 14, un cambio mayor que no corresponde a esta tanda.

## Verificación
Ver `docs/ESTADO.md` (suites completas sobre el código final, incluida una compilación de producción por servidor de prueba, que usa Next 16.4.1).
