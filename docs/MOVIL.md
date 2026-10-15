# Optimización de la presentación móvil (14/10/2026)

Sin cambios en precios, inventario, condiciones comerciales ni datos. No se reinicializó el stock. Sin push ni despliegue.

## Qué cambió

**Fotos transparentes en caché.** Los derivados de Ninja Spinner, Nihil Zero, Mega Symphonia y The Glory of Team Rocket se publicaban siempre bajo la misma URL (`<id>-closed.webp`), así que un navegador o el optimizador de imágenes podían seguir sirviendo la versión anterior. Ahora tienen un nombre nuevo (`<id>-closed-v2.webp`) y se actualizaron las referencias (`imagenes-cajas-center.json`, scripts y `docs/TARJETAS.md`). Los originales siguen intactos en `recursos-originales/japon-cajas/`; no se borró ninguna caché ni archivo ajeno. `scripts/colecciones/limpiar-cajas-center.mjs --rehacer` ahora **sube la versión** (`-v3`, …) en lugar de pisar el archivo: una URL nunca cambia de contenido.

**Inicio.** Carrusel más bajo en celular (arte al 80 % del ancho, títulos y bajada más chicos, descripción a 2 líneas, menos aire inferior).

**Catálogo.** Los dos encabezados (portada «Explorá tu próxima apertura» y «El archivo de aperturas») ocupan mucho menos; se compactaron los espacios hasta la primera tarjeta. Filtros, búsqueda (dentro de «Filtros y orden») y la nota del dólar siguen a un toque.

**Tarjetas.** El párrafo comercial repetido pasó a una línea de resumen con las condiciones en un desplegable («3 cuotas o 10% OFF» → condición completa; sobres: «Promos al sumar una caja»). El botón de acción quedó pegado al precio (si no entra al lado, baja justo debajo) y la disponibilidad debajo. «Ver contenido ↗» cabe en una línea (escritorio conserva «Ver cartas y contenido ↗» sin separar la flecha). Menos huecos entre tarjetas, foto de las cajas más baja (misma proporción de la imagen, `object-contain`), etiquetas a ≥ 11 px. La cápsula «Bajo stock» no se tocó.

**Fichas.** Foto y miniaturas más compactas, aclaraciones sobre las fotos en un desplegable («Sobre estas fotos», con el rótulo de origen siempre visible), texto de entrega más corto y menos espacio vertical entre bloques.
- **Barra inferior móvil** (evaluada y adoptada): aparece solo cuando el bloque de compra no se ve y se oculta en escritorio. Disponible: precio + cantidad (compartida con el bloque principal) + «Agregar». Sin stock / sin precio: solo «Consultar encargo» y el aviso «Disponibilidad y cotización se confirman antes de cualquier seña». No tapa contenido (la página reserva espacio al final) ni teclado (la ficha no tiene campos de texto). Sus botones tienen nombres distintos a los del bloque principal para no duplicar controles. No hay seña ni importe hasta la confirmación, igual que antes.

**Carrito.** Título más corto, atajo «Siguiente: elegí cómo lo recibís ↓» con el subtotal tras la lista y barra inferior (subtotal + «Ver resumen y continuar») que desaparece cuando el resumen ya se ve y mientras se escribe en un campo. Se conserva toda la validación existente.

**Formularios.** Campos de 16 px como mínimo en pantallas < 640 px (regla global en `globals.css`, evita el zoom automático de iOS).

## Qué se midió (servidor de desarrollo, copia de la base)
Alturas con `scripts/capturas-movil.mjs` (`docs/capturas/movil/medidas-antes.json` / `medidas-despues.json`); ver tabla en el reporte de entrega y en `MEDICIONES-MOVIL` más abajo.

Interacciones comprobadas con `scripts/capturas-movil-interacciones.mjs` en 360, 390 y 430 px (`docs/capturas/movil/interacciones-despues.txt`): menú abre/cierra, filtros abren/cierran y «Aplicar» alcanzable con teclado emulado, búsqueda, tarjetas sin texto < 11 px y sin envolver la flecha, fichas disponible / bajo stock / sin stock / título largo (sin desborde, barra correcta), cantidad compartida barra ↔ bloque, galería (foto principal, miniatura y zoom con nombres `-v2` cargando) y carrito (barra, atajo, resumen, sin barra con teclado, campos ≥ 16 px). No se pulsó «Continuar por WhatsApp»: no se envió ningún mensaje.

## Límites
- El teclado es **emulado** (se reduce la altura del viewport); no se probó en un teléfono real ni en iOS.
- Las mediciones de alto son de Chromium con viewport móvil, no de dispositivos reales.
- La caché vieja de un navegador concreto no se pudo reproducir; la corrección es el cambio de nombre.
- Con la barra de la ficha abierta, el aviso flotante «Agregaste…» (abajo) se superpone brevemente a la barra.

## Medidas antes → después (px, `scripts/capturas-movil.mjs`)

| Ancho | Carrusel (inicio) | 1.ª tarjeta del catálogo (distancia desde arriba) | Alto de una tarjeta de caja | Alto del catálogo de cajas | Campos < 16 px (ficha) |
|---|---|---|---|---|---|
| 360 | 520 → 458 | 705 → 506 | 595 → 419 | 5395 → 4086 | 2 → 0 |
| 390 | 536 → 472 | 673 → 490 | 571 → 409 | 5218 → 4096 | 2 → 0 |
| 430 | 564 → 496 | 633 → 480 | 549 → 407 | 5032 → 4134 | 2 → 0 |

## Rendimiento (build de producción local, Chromium con CPU 4× y red limitada; mediana de 3 corridas, catálogo real)

| Perfil | Página | FCP ms | LCP ms | CLS | TBT ms | KB |
|---|---|---|---|---|---|---|
| móvil | inicio | 1280 | 1308 | 0 | 90 | 549 |
| móvil | catálogo (cajas JP) | 1056 | 1056 | 0 | 99 | 421 |
| móvil | ficha caja | 1224 | 1284 | 0 | 106 | 290 |
| móvil | carrito | 920 | 920 | 0 | 166 | 261 |
| móvil lento | inicio | 2968 | 3776 | 0 | 124 | 656 |
| móvil lento | catálogo | 2620 | 2620 | 0 | 53 | 495 |
| móvil lento | ficha caja | 2824 | 4968 | 0 | 41 | 290 |
| móvil lento | carrito | 2508 | 2508 | 0 | 116 | 261 |

Todo dentro de los presupuestos del script. **No se midió el «antes» en producción**, así que no se afirma mejora de velocidad: los cambios apuntan a alto y legibilidad. Son mediciones locales, no de teléfonos reales.

## Pruebas
`npm run verify` OK (typecheck, lint, catálogo, 318 pruebas). `npx playwright test` completo con build nuevo: 419 pasadas, 7 omitidas por diseño, 1 intermitente (`colecciones-autoplay`, reloj real bajo carga; pasa sola: 19 pasadas, ya documentado). Interacciones móviles: 144 comprobaciones OK en 360/390/430 contra el build de producción.

## Seguimiento (14/10/2026, segunda pasada)
- **Aviso «Agregaste…» sobre la barra inferior:** corregido. La barra de la ficha y la del carrito marcan el <body> (data-barra-inferior, use-barra-inferior.ts) y, en pantallas < 1024 px, el aviso sube a 4,75 rem y queda por encima de la barra. Prueba nueva: tests/e2e/barra-inferior-movil.spec.ts (el aviso termina antes del borde superior de la barra; en escritorio no hay barra).
- **Prueba del carrusel estabilizada:** el reloj simulado de Playwright corre con el tiempo real, así que bajo carga el primer avance podía dispararse antes de la primera comprobación. Ahora abrir() congela el reloj (pauseAt, con margen creciente porque no admite el pasado) y solo avanza con runFor. Estrés: 114 corridas seguidas con 8 trabajadores en paralelo, 0 fallas.
- **Suite final sobre el código final:** npm run verify OK (318 pruebas, lint sin avisos) y npx playwright test completo con build nuevo: **422 pasadas, 9 omitidas por diseño, 0 fallas**.
- **Respaldo y restauración:** node scripts/verificar-respaldo.mjs (y --desde-copia-de <base>), ver [OPERACION.md](OPERACION.md).
