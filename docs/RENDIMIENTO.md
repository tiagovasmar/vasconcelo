# Rendimiento y accesibilidad: qué se midió y cómo

## Rendimiento (medido)
`node scripts/rendimiento.mjs` abre cada página en Chromium (Playwright) sobre el **build de producción local** (`npm run build` + `next start`) y toma la **mediana de 7 corridas**: FCP, LCP, CLS, TBT aproximado y KB transferidos. Perfil *móvil*: 390×844, CPU 4× más lenta, red ≈ 1,6 Mb/s con 150 ms de latencia (parecido al perfil móvil de Lighthouse). Perfil *escritorio*: sin límites. El resultado completo queda en `docs/rendimiento.json`.

Medición del 12/10/2026 (8 páginas × 2 perfiles):

| | Móvil (limitado) | Escritorio |
| --- | --- | --- |
| FCP / LCP | 0,84 – 1,15 s | 0,08 – 0,16 s |
| CLS | 0 en todas | 0 en todas |
| TBT aprox. | 89 – 117 ms | 0 ms |
| Peso transferido | 234 – 304 KB | 240 – 304 KB |

Presupuestos que el script hace cumplir (falla si se superan): CLS < 0,1 · TBT < 300 ms · LCP < 2,5 s escritorio y < 4 s móvil. **Se cumplen en todas las páginas medidas.**

Qué se corrigió gracias a la medición:
- El carrito movía el pie al terminar de cargar (CLS 0,05): se reservó el espacio de la página → 0.
- Las fuentes causaban un salto de diseño en el inicio (CLS 0,05): ahora se cargan con `next/font` (precarga + fuente de reemplazo del mismo tamaño) → 0.

**Límites de esta medición (importante):**
- Es una medición **local** y simulada: no son datos de usuarios reales ni de un hosting concreto.
- El arte actual es **vectorial de reserva**. Las **imágenes finales** (fotos y arte del inicio) cambiarán el peso y el LCP: hay que **volver a medir** antes de publicar (usar `loading="lazy"`/tamaños adecuados, formatos WebP/AVIF; el hero usa `priority`).
- No se midió con Lighthouse: no pudo ejecutarse el navegador por línea de comandos en este entorno. Estas cifras no son un puntaje de Lighthouse.
- No se midió el servidor bajo carga (varios usuarios simultáneos).

## Accesibilidad (verificada automáticamente + revisión de teclado)
- **axe-core (WCAG 2.0/2.1, A y AA)** en `tests/e2e/a11y.spec.ts` y `recorrido.spec.ts`: 18 pantallas públicas, carrito con avisos y formulario de entrega, consulta preparada, menú móvil y hoja de filtros abiertos, y las 4 pantallas con sesión iniciada, en escritorio y móvil. **0 violaciones.**
- Lo que la revisión encontró y se corrigió: contraste insuficiente del bermellón sobre fondos claros y oscuros (ahora dos tonos con contraste AA), texto del pie con poca opacidad y una región con scroll sin acceso por teclado (vista previa del mensaje).
- Teclado y foco: «Saltar al contenido», foco visible (probado), menú móvil con Escape, hoja de filtros, zoom de imagen y de carta con foco gestionado y cierre con Escape (todo con pruebas), etiquetas reales y `aria-invalid` en formularios, estados de carga/error/vacío, `prefers-reduced-motion`.
- **No reemplaza** una prueba con **lector de pantalla** ni una revisión manual con personas usuarias: figura como pendiente en [PENDIENTES-PUBLICACION.md](PENDIENTES-PUBLICACION.md).
