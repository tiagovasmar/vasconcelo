# Estado del proyecto

> **Continuidad en Codex — 02/11/2026:** el trabajo reciente se encontró en `vasconcelo-publicacion`, rama `feature/cuentas-pedidos-mayorista` (`e6b24c1` al comenzar). `kit-claude-pokemon` conserva una implementación anterior y no se modificó ni mezcló. Se reprodujo el desborde mayorista con una cuenta aprobada y cantidades: 546/390 en el fixture; 552/390 al reconstruir la geometría anterior con el catálogo real y datos ficticios. Causa: las etiquetas accesibles absolutas escapaban del contenedor de la tabla. Corregido con contención local y tarjetas móviles. Los resultados y límites de la continuación se registran en [CONTINUIDAD-PEDIDOS.md](CONTINUIDAD-PEDIDOS.md). Las afirmaciones anteriores de «sin desborde» no cubrían el catálogo autorizado en móvil. Verificación propia final: verify 592 correctas/1 omitida; Playwright completo más repetición del bloque admin, 634 escenarios cubiertos/9 omitidos; 48 capturas y cuatro casos extremos. Una expectativa antigua de aprobación se corrigió y el bloque admin pasó 19/19; los detalles y la falla original están en el informe.


> **02/11/2026 — Cuentas Google, pedidos y encargos, comprobantes, envíos agrupados, costos privados y catálogo mayorista (rama `feature/cuentas-pedidos-mayorista`, commits locales sobre `2d2ca08`, SIN push, SIN migración en Supabase real y SIN publicación; pendiente de revisión del dueño):** ver [PEDIDOS.md](PEDIDOS.md) (cómo funciona), [GOOGLE.md](GOOGLE.md) (qué falta configurar), [DECISIONES-PENDIENTES-PEDIDOS.md](DECISIONES-PENDIENTES-PEDIDOS.md) (lo comercial que falta definir) y [PUBLICACION-PEDIDOS.md](PUBLICACION-PEDIDOS.md) (plan de publicación y vuelta atrás, no ejecutado). **Migración nueva `drizzle/0004_pedidos_encargos_mayorista`** (solo agrega 18 tablas y la columna `inquiries.order_kind`; ensayada sobre una base descartable con datos previos). Los archivos `src/app/apple-icon.png`, `favicon.ico` e `icon.svg` siguen siendo del dueño y sin commitear (se verificó que ningún commit de la rama los incluye).
> **Pruebas ejecutadas sobre este código:** ver «Pedidos y mayoristas: pruebas y límites» al final de este archivo. **No se probó el OAuth real contra Google, ni correo real, ni Supabase Storage real.**

> **23/10/2026 — Cierre de pendientes de la auditoría (misma rama `fix/resiliencia-carga`, un segundo commit local, SIN push ni publicación):** corregida la causa de las solicitudes colgadas con la base caída (espera entre intentos de `postgres.js` de hasta 20 s compartida + sin plazo de consulta): ahora conexión 8 s, consulta 10 s con cancelación en el servidor y descarte de la conexión, recuperación sin reiniciar; 5 pruebas desactualizadas actualizadas al comportamiento aprobado; `global-error` disparado y comprobado; pestaña vieja → «La tienda se actualizó»; recuperación de imágenes en banners e inicio; arreglada una carrera de foco del carrito lateral (mía, anterior) y un defecto de idempotencia de invitados hallado con WebKit; mediciones sin regresiones. Detalle y límites: [CIERRE-PENDIENTES-AUDITORIA.md](CIERRE-PENDIENTES-AUDITORIA.md).

> **23/10/2026 — Recuperación ante conexiones lentas, cortes y errores de carga (rama `fix/resiliencia-carga`, un commit local sobre `af4c812`, SIN push ni publicación; pendiente de revisión del dueño):** cálculo de adicionales con estados de carga/éxito/error, plazo y «Reintentar» (selección conservada, respuestas viejas descartadas); validación del carrito y preparación de la consulta con plazo máximo y botones siempre liberados (la consulta no se reintenta sola; reintentar a mano es seguro por la clave de idempotencia); panel lateral operable desde el primer momento y con recuperación si falla su descarga; `error.tsx` y `global-error.tsx`; ilustración de reserva si una foto no se descarga; corregido el contador de cupos de sobres de la ficha. Sin cambios de precios, stock, promociones ni condiciones. Informe, método y mediciones: [RESILIENCIA-CARGA.md](RESILIENCIA-CARGA.md). `loading.tsx` se probó y se descartó por empeorar el LCP.

> **23/10/2026 — Next.js 16.4.1 y «Ver más» (rama `feature/adicionales-en-ficha`, commits locales, SIN push ni publicación; pendiente de aprobación del dueño):** actualización de seguridad de Next.js 16.4.0 → 16.4.1 en un commit propio (avisos GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr y GHSA-p3m5-59mp-jv5r; ver [SEGURIDAD-NEXTJS.md](SEGURIDAD-NEXTJS.md)). «Ver más» del selector de sobres probado con 15 opciones en una base aislada (servidor de pruebas «extra»): se corrigieron un desborde horizontal en 360 px con precios de 5 cifras y la desaparición de una opción al volver a 0 con la lista contraída. Verificación final: tsc, lint y catálogo sin errores; vitest 33 archivos / 509 pruebas; Playwright 227 (tienda de prueba) + 3 (WhatsApp) + 219 (panel y catálogo real) + 50 (consultas y promoción) + 7 («Ver más»), 0 fallas. Sin migraciones; producción no se tocó.

> **22/10/2026 — Adicionales en la ficha de la caja (rama `feature/adicionales-en-ficha`, commit local, SIN push ni publicación; pendiente de aprobación del dueño):** el selector de sobres con 10% OFF y de protección (sleeves/top loaders) está ahora en la ficha de cada caja, con desglose y validación del conjunto en el servidor antes de agregar. El carrito lateral conserva «Completá tu compra» como bloque secundario. Sin migraciones nuevas. Ver [PROMOCION-COMBO-Y-ACCESORIOS.md](PROMOCION-COMBO-Y-ACCESORIOS.md) (sección 7). Producción sigue en `0687e6a` con la migración 0003.

> **22/10/2026 — Promoción caja + sobres, accesorios y recomendaciones del carrito (rama `feature/combo-accesorios-recomendaciones`, commit local, SIN push, SIN migración en Supabase, SIN publicación; pendiente de aprobación del dueño):** promoción «Sumá hasta 5 sobres con 10% OFF por cada caja» configurable en `/admin/promociones` (apagada y sin selección por defecto), dos accesorios en pack de 5 con precio fijo en pesos y stock en packs (inicial 0), bloque «Completá tu compra» de hasta 3 sugerencias, recálculo siempre en el servidor, descuentos guardados en consultas y ventas. Migración propuesta: `drizzle/0003_accesorios_y_combo.sql` (solo `ADD COLUMN` con valores por defecto). Ver [PROMOCION-COMBO-Y-ACCESORIOS.md](PROMOCION-COMBO-Y-ACCESORIOS.md).

> **17/10/2026 — Consultas del dueño conectadas con ventas y stock (rama `feature/consultas-ventas`, commit local, SIN push ni despliegue ni migración en Supabase):** `/admin/consultas` (listado, detalle, métricas, consultas manuales, estados, notas, contacto confirmado a mano, convertir en venta, vincular venta existente, anulación y nueva conversión). Reutiliza `registerSale`/`voidSale` del sistema de ventas; vínculo en la tabla nueva `inquiry_sales`. Ver [CONSULTAS.md](CONSULTAS.md). **Migración `drizzle/0002_consultas.sql`** (solo agrega; producción tiene aplicadas 0000 y 0001 según lectura de `drizzle.__drizzle_migrations` del 17/10/2026; NO se aplicó la 0002). Teléfono opcional en el carrito. **Pruebas:** typecheck y lint OK · `vitest` completo OK (nuevas: `consultas` y `consultas-ventas`, con reintentos, pedidos simultáneos, falta de stock, vinculación, anulación y reconversión; `postgres-esquema` actualizado a propósito) · `admin-consultas.spec` (17 pruebas e2e con axe y celular, servidor/base propios :3104). El PostgreSQL de pruebas ahora se inicializa en UTF-8.

> **15/10/2026 — Correcciones de la tanda 7 (commit local, sin push):** (1) con retiro ya no figura «Envío a coordinar» (resumen: «No aplica: retiro»; el mensaje de WhatsApp omite la línea; con Andreani o moto vuelve la aclaración; vale también para el mensaje definitivo del servidor y el detalle de la consulta); (2) CLS del pedido en celular de 0,173/0,207 a 0 (ver [RENDIMIENTO-TANDA7.md](RENDIMIENTO-TANDA7.md)); (3) carrusel de banners **continuo** con transición horizontal (avance automático y flechas; último → primero hacia adelante, anterior desde el primero → último; sin banners duplicados, deslizado táctil que sigue al dedo, movimiento reducido respetado). No se tocó la ayuda del admin. Capturas en `docs/capturas/tanda7b/`.

> **15/10/2026 — Tanda 7 (rama `feature/carrito-ventas-rendimiento`, commits locales, SIN push ni despliegue; pendiente de revisión del dueño):** carrito lateral, nombre y apellido obligatorio, retiro único (Av. Rivadavia 14600), pagos sin «Coordinar por WhatsApp», negritas de subtotal/total en WhatsApp, Admin → Ventas con stock atómico e historial inmutable, avatar de «Mi cuenta» y mejoras de rendimiento. **Mayoristas: pendiente de definición del dueño (no se tocó).** Ver [VENTAS-Y-STOCK.md](VENTAS-Y-STOCK.md), [RENDIMIENTO-TANDA7.md](RENDIMIENTO-TANDA7.md) y el séptimo lote de `CLAUDE.md`. Pruebas ejecutadas sobre este código: typecheck y lint sin avisos, **405 pruebas de reglas** (PostgreSQL real) y **441 de recorrido** en navegador (escritorio y móvil emulados); capturas en `docs/capturas/tanda7/`. **Antes de publicar:** aplicar la migración `0001` en Supabase (`npm run db:migrate` con `DIRECT_URL`), conservar conexión de sesión 5432 y `DATABASE_POOL_MAX=1`, y revisar con el dueño. Desarrollo local: `npm run dev:db` (base separada, `.env.local` apunta ahí; las credenciales reales están respaldadas en `.local/backups/`).

> **14/10/2026 — Migración a Netlify + Supabase (rama `migracion/netlify-supabase`, preparada y NO publicada):** PostgreSQL + Storage, servicios asíncronos, respaldo/restauración y migración desde SQLite. Guía: [DESPLIEGUE-NETLIFY-SUPABASE.md](DESPLIEGUE-NETLIFY-SUPABASE.md), [CORREO.md](CORREO.md). Detalle de pruebas abajo en «Migración a Netlify + Supabase». Sin push, sin servicios creados, sin datos copiados fuera de esta computadora.

> **14/10/2026 (2.ª pasada móvil):** el aviso «Agregaste…» ya no tapa la barra inferior, prueba del carrusel estabilizada (114 corridas en estrés sin fallas), suite completa final 422 OK / 0 fallas, respaldo y restauración verificados en bases descartables (`scripts/verificar-respaldo.mjs`). Ver [MOVIL.md](MOVIL.md). Sin cambios de precios ni stock; sin push ni despliegue.

> **14/10/2026 — Optimización móvil:** derivados de 4 cajas renombrados `-closed-v2` (anti-caché), carrusel/encabezados/tarjetas/fichas compactados, barra inferior en fichas y carrito, campos ≥ 16 px. Ver [MOVIL.md](MOVIL.md) (medidas antes/después, límites). verify OK (318) y e2e 419 OK (+1 intermitente conocida). Sin cambios de datos, sin push ni despliegue.

> **14/10/2026 — Precios de venta y «En stock»:** 21 precios USD cargados (idempotente, `npm run precios:cargar`), acceso/sección/vista «En stock» con regla única `isInStock`, 6 filas sin ficha. Ver [PRECIOS-VENTA.md](PRECIOS-VENTA.md). verify OK (296 unitarias) y e2e completo OK (tras subir el contraste de dos textos de relleno del panel). Sin push ni despliegue.

> **14/10/2026 — Mejoras del admin, cotización y rendimiento:** filtros por formato/colección, stock bajo configurable, edición múltiple, subida de varias fotos, `kickRefreshIfDue` blindado, 19 escenarios de fallos de cotización verificados contra un build de producción, rendimiento medido (escritorio / móvil / móvil lento) y corregido (miniaturas, cartas, calidad de fotos), foto de Terastal Gathering mejorada. Ver docs/MEDICIONES.md, GUIA-ADMIN.md y GALERIAS-JAPONESAS.md. Sin reinicializar stock ni tocar precios.

> **14/10/2026 — Stock 0, «Sin stock», precio por sobre y foto de 151:** stock inicial 0 para todas las fichas (inicialización única con respaldo, `npm run stock:inicializar`), widget «Sin stock disponible» con consulta por encargo, «Sin stock» en tarjetas, precio equivalente por sobre en las cajas con sobres confirmados y foto de la caja cerrada de 151 (proveedor). Ver ADMIN.md y GALERIAS-JAPONESAS.md. verify (315 pruebas) y e2e completo (417) OK.

> **14/10/2026 — Seis cajas japonesas:** fichas, colecciones y precios (USD 120/115/136/195/130/317) de Terastal Festival ex, Ninja Spinner, Nihil Zero, The Glory of Team Rocket, Mega Symphonia y Pokémon Card 151; stock desconocido, fuera de «En stock». Catálogo: 50 fichas públicas. Ver PRECIOS-VENTA.md. verify (304 pruebas) y e2e OK.

> Aprobaciones del dueño: hito 1 (base estructural), 2 (base funcional), 3 y 4 aprobados. Hito 5 implementado: **entrega local completa, pendiente de la revisión final del dueño**. Imágenes finales y datos comerciales reales: pendientes y **sin bloqueo** para la aplicación local.

## Tanda 6 (14/10/2026, pendiente de revisión del dueño): administrador completo, precios USD/ARS y portadas del aniversario

Ver [ADMIN.md](ADMIN.md) (cómo entrar, cargar precios/stock/fotos), [COTIZACION.md](COTIZACION.md) (dólar blue, redondeo, antigüedad, modo manual), la sección «Tanda 6» de [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md) y [PENDIENTES-DEL-DUENO.md](PENDIENTES-DEL-DUENO.md) §10. **Migración nueva `drizzle/0004_tanda6_usd_fx_media`** (solo agrega columnas y tablas; correr `npm run db:migrate`; los datos existentes se conservan). Sin push ni despliegue.
- **Hecho:** precio base en USD (decimales) con conversión central a pesos (dólar blue venta, múltiplos de $100, mitades hacia arriba) en catálogo, fichas, filtros/orden, carrito y consultas; cotización compartida cada 15 min (temporizador, renovación en pedido vencido, `/api/fx/refresh` con `CRON_SECRET`, `npm run fx:refresh`), última válida ante fallos, 24 h máximo, modo manual persistente; `/admin` con lista (idioma, USD, pesos, stock, estado, búsqueda y filtros, edición rápida, aviso de cambios sin guardar), editor de ficha (título, descripción, precio, stock cantidad/desconocido/por encargo, máximo, publicación, vista previa), fotos (subir, biblioteca, portada, orden, texto alternativo, quitar, restablecer), cotización y historial; instantánea de cotización y precio USD en cada consulta; cuotas con residuo repartido; portadas de Vol.2 (Totodile) y Vol.3 (Torchic); ficha nueva de **Bulbasaur como borrador**; +4 fotos de contenido en las cajas de Ogerpon.
- **Pruebas (ejecutadas sobre este código):** `npm run verify` OK (typecheck, lint, `catalog:check`, **287 pruebas de reglas**; nuevas: `fx.test.ts`, `media-gallery.test.ts`, `aniversario.test.ts` y la reescritura de `admin.test.ts`) · `npx playwright test` completo con build nuevo: **409 pasadas, 7 omitidas por diseño, 1 falla de tiempo** (`colecciones-autoplay`: el carrusel con reloj real se adelantó bajo la carga de la suite completa; **pasa sola: 19 pasadas**, sin relación con esta tanda) · e2e del panel (`admin.spec.ts`, 14 pruebas): acceso, cotización manual, edición rápida, carrito/consulta con cambio de dólar, editor, fotos válidas e inválidas (escritorio y móvil), historial, restablecer, ediciones simultáneas, mayoristas, accesibilidad y móvil · verificación manual de **persistencia tras reiniciar el servidor** (precio, USD y foto subida) · consulta real al proveedor (DolarAPI devolvió venta $1.550, publicada el 13/10 20:57 UTC; las pruebas usan cotizaciones sintéticas).
- **Capturas:** `docs/capturas/tanda6/` (`node scripts/capturas-tanda6.mjs`; valores y cotización de PRUEBA solo en bases descartables; sin desborde, imágenes rotas ni errores de consola).
- **Límites reales:** no hay cotización de **encargos** (solo precios de catálogo); los umbrales de antigüedad y el sentido del redondeo de la mitad son propuestas a confirmar; Bulbasaur sigue sin confirmar (envase de 9 tipos al azar); ninguna foto es del stock real; las fotos subidas viven en disco local (`uploads/`: incluirlas en los backups); sin lector de pantalla; el e2e completo no mide rendimiento.
- **Operación:** sin `ADMIN_EMAIL` el panel está cerrado; no se creó ninguna credencial compartida ni cuenta administradora de prueba (las pruebas registran cuentas temporales en bases descartables).

## Tanda 5 (13/10/2026, pendiente de revisión del dueño): nombres en inglés, sobres de 20 cartas retirados e inicio integrado

Ver [NOMBRES-INGLES.md](NOMBRES-INGLES.md) (tabla de nombres, fuentes, tipo de denominación y casos pendientes), la decimoquinta revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md` y la sección «Retirados» de [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md). **Catálogo público ahora: 44 productos (16 japoneses + 28 chinos), 25 colecciones listadas** (8 ya retirados siguen en el catálogo para el historial). Capturas: `docs/capturas/tanda5/` (`node scripts/capturas-tanda5.mjs`). No hubo migración de base. **Pruebas (tanda 5, ejecutadas sobre este código):** `npm run verify` OK (typecheck, lint, `catalog:check`, **205 pruebas de reglas**; nuevas en `china.test.ts`: nombres en inglés, alias, retirados, cajas/kits no retirados, carrito viejo, panel) · `npx playwright test` completo: **408 pasadas, 7 omitidas por diseño, 0 fallas** (nuevo `colecciones-tanda5.spec.ts`; actualizadas las pruebas de conteos, títulos e inicio). Capturas sin desborde, imágenes rotas ni errores de consola. **Límites:** los nombres en inglés se contrastaron con fuentes comerciales/comunitarias (no oficiales; no es verificación oficial); sin lector de pantalla ni medición de rendimiento.

## Tanda 4 (13/10/2026, pendiente de revisión del dueño): mayoristas, encargos, promociones con caja, títulos en español y mejores fotos chinas

Ver decimocuarta revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md` y [POLITICAS.md](POLITICAS.md) (qué está confirmado, qué sigue pendiente y cómo configurarlo). Migración nueva `drizzle/0003_*` (tabla `wholesale_requests`, columnas `inquiries.discount_minor` e `inquiry_lines.fulfillment`): correr `npm run db:migrate`. 
**Pruebas (tanda 4, ejecutadas sobre este código):** `npm run verify` OK (typecheck, lint, `catalog:check`, **197 pruebas de reglas**; nuevas: `politicas.test.ts`, `encargos-y-mayoristas.test.ts` y bloques en `china.test.ts`) · `npx playwright test` completo: **390 pasadas, 7 omitidas por diseño, 0 fallas** (nuevas: `promos-encargos.spec.ts`, `mayoristas.spec.ts`, `colecciones-tanda4.spec.ts` y el caso de `/admin/mayoristas` en `admin.spec.ts`; se actualizaron las pruebas que describían el comportamiento viejo). Durante la tanda aparecieron 3 intermitencias de pruebas ya existentes y se corrigieron: lectura de miniaturas diferidas (`currentSrc` vacío), y un 500 del contador de uso ante un bloqueo momentáneo de SQLite (`rateLimited` ahora no rompe la petición). Capturas: `docs/capturas/tanda4/` (`node scripts/capturas-tanda4.mjs`; sin desborde, imágenes rotas ni errores de consola). **Límites:** no se probó con lector de pantalla ni se midió rendimiento (las pruebas son funcionales); la activación mayorista y la cotización de encargos **no están conectadas** a propósito; las fotos de 太晶盛聚 son de baja resolución.

## Tanda 3 (13/10/2026, pendiente de revisión del dueño): banner móvil, fichas, garantías por caja y cajas sin fondo blanco

Ver decimotercera revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md`, [GARANTIAS.md](GARANTIAS.md) (investigación y tabla por caja) y [PENDIENTES-DEL-DUENO.md](PENDIENTES-DEL-DUENO.md) (lista final de lo que aporta el dueño, incluidas las fotos de stock necesarias por SKU). Capturas antes/después: `docs/capturas/tanda3/` (`node scripts/capturas-tanda3.mjs antes|despues`). Regeneración de las fotos de las cajas: `node scripts/colecciones/recortar-imagenes.mjs`.

**Pruebas (tanda 3):** `npm run verify` OK (149 pruebas de reglas; nuevas en `tests/garantias.test.ts`) · `npx playwright test` completo: **341 pasadas, 7 omitidas por diseño, 0 fallas** (nuevas en `colecciones-tanda3.spec.ts`: alturas del banner en 320/390/430, ficha móvil, desplegables por teclado, garantías, cajas sin fondo) · `release:check`: 12 bloqueantes, todos conocidos (marca/logo, datos legales, borrador legal, WhatsApp, precios y stock, permiso de imágenes, correo, hosting…): ninguno se ocultó.

## Vasconcelo, carrusel automático y catálogo chino (13/10/2026, pendiente de revisión del dueño)

Ver duodécima revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md` y el informe por ID en [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md). **Catálogo real ahora: 52 fichas (16 japonesas + 36 chinas) y 26 colecciones.** Todo con precio y stock pendientes (compra deshabilitada). Pendiente de lo anterior: el artículo 1027185914261 (sin carpeta). Comando nuevo: `node scripts/colecciones/importar-chinos.mjs [carpeta]` (regenera las fotos desde Downloads). 
**Pruebas ejecutadas sobre este código (13/10/2026):** `npm run verify` OK (typecheck, lint, `catalog:check`, **137 pruebas de reglas**, 16 nuevas en `tests/china.test.ts`) · `npx playwright test` completo: **314 pasadas, 6 omitidas por diseño, 0 fallas** (incluye `colecciones-autoplay.spec.ts` con reloj simulado y `colecciones-china.spec.ts`, en escritorio y móvil) · `node scripts/capturas-vasconcelo.mjs`: sin desborde, sin errores de consola, sin imágenes rotas y el carrusel avanza solo y respeta la pausa (capturas `docs/capturas/vc-*`). `release:check`: 12 bloqueantes (se suma el permiso de uso de las fotos de proveedores). **Límites:** las 16 fuentes se revisaron desde las fotos guardadas (los enlaces de Tmall/Taobao piden login y no se consultaron); no se probó con lector de pantalla; las fotos son de proveedores sin permiso de uso concedido; Vol.3 y 宝石包 usan imágenes de presentación del proveedor.

## Fondos de fotos, banderas e importación china anterior (13/10/2026)

Ver undécima revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md`. Verificado: typecheck, lint, `catalog:check`, 121 pruebas de reglas y 104 e2e (inicio, banners, colecciones, catálogo, etiquetas). Las 5 referencias de Tmall siguen sin verificar.

## Lote de colecciones japonesas (integrado, pendiente de revisión del dueño)
Detalle completo en [COLECCIONES.md](COLECCIONES.md). Resumen:
- **8 expansiones y 16 fichas** (caja y sobre separados). Precio y stock **pendientes en las 16**: «Precio a confirmar», sin compra con importe (el servidor responde 409 `pending_commercial`).
- **1174 cartas** con imagen: completas Black Bolt 174, White Flare 174, Heat Wave Arena 92, Inferno X 116, MEGA Dream ex 250, Abyss Eye 118; **parciales** Storm Emeralda 110 (faltan 071, 073, 075) y 30th CELEBRATION 140 (faltan 104–135 y 151). Sin tasas de aparición.
- 24 fotos de producto incorporadas (estado `reference`: **sin permiso de uso concedido**).
- El catálogo ficticio quedó solo para pruebas (`src/content/fixtures/demo/`, `CATALOG_FIXTURE=demo`).
- Planilla del dueño: `datos/precios-y-stock.csv` → `npm run precios:importar -- --write` (ver OPERACION.md).
- Pruebas sobre este código: `npm run verify` (typecheck, lint, catalog:check, **85 pruebas**) y `npx playwright test` (220 pasadas, 5 omitidas por diseño; incluye 50 del catálogo real en escritorio y móvil). Una falla de texto viejo (garantías) se corrigió y se volvió a correr. Capturas en `docs/capturas/col-*` sin desborde, sin errores de consola ni imágenes rotas (`node scripts/capturas-colecciones.mjs`, servidor en :3000).
- `release:check`: 11 bloqueantes (agrega precios/stock pendientes y permiso de imágenes).

## Etiquetas de colección/idioma y galerías con fuentes separadas (13/10/2026, pendiente de revisión del dueño)

Ver novena y décima revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md`, `docs/GALERIAS.md` y `docs/FOTOS-A-TOMAR.md`.

## Banners por colección y carrusel (13/10/2026, pendiente de revisión del dueño)

Ver la octava revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md`.

## Banner con identidad Pokémon (13/10/2026)

Ver la séptima revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md`.

## Panel del dueño `/admin` (13/10/2026, pendiente de revisión del dueño)

Precio, stock, máximo por pedido y visibilidad desde la web, con historial y control de versiones. Solo el correo de `ADMIN_EMAIL` (sin configurar = cerrado). Detalle, límites y pruebas en [ADMIN.md](ADMIN.md). Migración `drizzle/0002_*` (tablas `product_overrides` y `product_audit`); correr `npm run db:migrate`.

## Inicio: banner, Cajas/Sobres/Packs y fotos recortadas (12/10/2026, pendiente de revisión del dueño)

Ver la sexta revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md`.

## Rediseño del inicio anterior (quinta revisión)

Categorías (Cajas/Sobres/Packs «Próximamente»), sección de las ocho expansiones y paleta esmeralda y oro; `lime` → `gold` en todo el sitio. Decisiones en `docs/CAMBIOS-HOME-Y-PAGOS.md`. Capturas en `docs/capturas/inicio-*`.

## Revisión de continuidad (12/10/2026, sin funciones nuevas)

Ejecutado sobre el estado final: `npm run verify` (typecheck, lint, catalog:check, 85 unitarias) OK · `npm run build` OK · `npm run smoke` OK contra el catálogo real (:3000) y contra un build con `CATALOG_FIXTURE=demo` (:3200, temporal) · `npx playwright test` completo: 220 pasadas, 5 omitidas por diseño, 0 fallas · 16 productos, 8 expansiones, 1174 cartas con su WebP, 24 fotos de producto con sha256 coincidente · ningún SKU tiene precio ni stock (todos pendientes; el servidor responde 409).
Correcciones: `smoke.mjs` ahora distingue catálogo real/de prueba (antes fallaba con el real); `next-env.d.ts` estaba commiteado apuntando a `.next-e2e-live` (rompía el typecheck en una copia limpia) → ahora apunta a `.next` y `tests/e2e/global-teardown.ts` lo restaura tras cada corrida e2e.

## Hito actual: 5 — Integración final y entrega local (terminado; esperando revisión final)

| Hito | Estado |
| --- | --- |
| 1 Proyecto + inicio responsive | Aprobado |
| 2 Catálogo, expansiones, ficha | Aprobado |
| 3 Carrito, consulta, WhatsApp | Aprobado |
| 4 Cuentas, favoritos, Mis consultas | Aprobado |
| 5 Integración final y entrega | **Implementado y verificado; esperando revisión final del dueño** |

**Aplicación local terminada ≠ lista para vender públicamente.** `npm run release:check` lista 13 bloqueantes (marca provisoria, datos legales, WhatsApp, catálogo e imágenes demo, entorno de producción, correo y hosting). Ver [PENDIENTES-PUBLICACION.md](PENDIENTES-PUBLICACION.md).

## Cómo arrancar
`npm ci` → `npm run db:migrate` → `npm run dev` (http://localhost:3000). Detalle y comandos: [README.md](../README.md). Operación diaria, WhatsApp, correo y backups: [OPERACION.md](OPERACION.md). Despliegue futuro: [DESPLIEGUE.md](DESPLIEGUE.md).

## Qué incluye
- Inicio, catálogo con búsqueda/filtros en URL, expansiones, fichas con galería, cartas, probabilidades (solo con evidencia), garantías y fuentes.
- Carrito en el navegador validado en el servidor (precios, cantidades, disponibilidad), entrega (Andreani, moto CABA/AMBA, retiro Ramos Mejía/Haedo), pago «a coordinar por WhatsApp», consulta guardada con referencia e idempotencia, WhatsApp (con modo demo sin teléfono, copiar y reabrir, resumen para pedidos largos).
- Cuentas opcionales: registro con confirmación de correo, ingreso/salida, recuperación de acceso, perfil, favoritos, «Mis consultas», asociación de consultas de invitado solo por cookie de sesión.
- «Cómo comprar», «Privacidad» y «Condiciones» (**borradores** identificados; datos legales sin inventar).
- Herramientas: `catalog:check`, `release:check`, `db:backup`/`db:restore`, `mail:last`, `smoke`, medición de rendimiento, capturas.

## Comandos útiles
`npm run dev|build|start|lint|typecheck|test|verify` · `npm run test:e2e` (requiere `npx playwright install chromium`; levanta dos servidores aislados en :3100 y :3101 con base y correo temporales) · `npm run catalog:check` · `npm run release:check` · `npm run db:migrate|db:backup|db:restore` · `npm run mail:last` · `npm run smoke` (contra un servidor ya iniciado) · `node scripts/rendimiento.mjs` · capturas: `node scripts/capturas.mjs`, `capturas-paginas.mjs`, `capturas-carrito.mjs` (servidor en :3000) y `capturas-cuenta.mjs` (servidor propio en :3200, ver cabecera del script).

## Pruebas ejecutadas (hito 5, sobre el código final)
- `npm run verify`: typecheck, lint, catalog:check y **63 pruebas de reglas** (catálogo, consultas, WhatsApp, cuentas, backup/restauración, correo no disponible en producción, y **ejecución real de los scripts** db:migrate/backup/restore, catalog:check y release:check).
- `npm run test:e2e`: **170 pruebas** de recorridos y accesibilidad en escritorio y móvil + modo WhatsApp (catálogo, carrito, cuentas, recorridos completos, enlaces del inicio/cabecera/pie, axe sobre 18+ pantallas), ahora sobre el **build de producción**. Corrió limpia 4 veces seguidas, y también en una copia limpia del repositorio.
- `npm run build` sin advertencias; prueba de humo (`npm run smoke`) contra el servidor de desarrollo y contra el **build de producción**.
- Rendimiento medido sobre el build de producción (ver [RENDIMIENTO.md](RENDIMIENTO.md)): dentro de presupuestos; CLS 0.
- Capturas finales en `docs/capturas/` (1440, 390 y 320 px) sin desborde horizontal.
- Reproducibilidad: en una **copia limpia** del repositorio (`git clone` → `npm ci` → `db:migrate` → `verify` → `build` → prueba de humo contra `next start` → backup con el servidor encendido → restauración → `test:e2e`) todo pasa. Esa prueba encontró dos fallas reales, ya corregidas: `npm ci` intentaba compilar better-sqlite3 (ahora `.npmrc` con `ignore-scripts`) y `db:backup`/`db:restore` no arrancaban por un `await` de nivel superior (ahora hay pruebas que ejecutan los scripts de verdad).

## Sobre el fallo intermitente de pruebas (revisado en el hito 5)
Había causas reales (no un problema de tiempos), corregidas **sin subir tiempos de espera**:
1. **Clics antes de que React tomara el control de la página** (hoja de filtros, favoritos): las pruebas esperan una condición observable de la aplicación, `data-hydrated="true"` en `<html>` (`src/components/hydration-marker.tsx`), en lugar de «networkidle» o tiempos.
2. **Compilación en frío del modo desarrollo** con varios navegadores en paralelo (el 404 de producto en móvil): un `globalSetup` calienta todas las rutas esperando a que respondan antes de empezar.
3. **Carga lenta del modo desarrollo** al crecer la suite (más de 160 pruebas en paralelo sobre dos servidores de desarrollo): las pruebas ahora corren sobre el **build de producción** (sin compilación bajo demanda), con `MAIL_TRANSPORT=local` solo en esos servidores de prueba.
4. **Un corazón de favoritos que se podía tocar antes de saber si había sesión** (mandaba a ingresar aunque la persona ya hubiera entrado): ahora el botón espera a conocer el estado de la sesión. También se corrigió el orden de favoritos creados en el mismo milisegundo (error real encontrado por una prueba).
Además, cada acción que cambia datos espera la respuesta del servidor antes de recargar (`waitForResponse`), y se revirtió el `expect.timeout` global de 10 s que se había agregado.

## Pendientes / límites (resumen; lista completa en PENDIENTES-PUBLICACION.md)
- Imágenes finales (6 del inicio + 3 por SKU) y catálogo/datos comerciales reales: pendientes, sin bloqueo local.
- Correo: solo transporte local. **En producción sin proveedor, registro y recuperación aparecen como «no disponibles»** (503 explícito; no se simula ningún envío).
- WhatsApp: sin número real (modo demo). El modo con número se probó solo con destino interceptado; no se envió ningún mensaje real.
- No hay hosting, dominio ni servicios contratados; nada se publicó.
- Sin prueba con lector de pantalla; sin Lighthouse (no pudo ejecutarse en este entorno): el rendimiento se midió con Chromium/Playwright.
- Un solo servidor (SQLite); sin cambio de correo ni baja de cuenta; cartas paginadas en el navegador.
- Git: identidad existente (tiagovasmar); sin remoto `origin`, solo commits locales.


## Migración a Netlify + Supabase (14/10/2026)

**Hecho (código):** esquema y migración PostgreSQL (`drizzle/`), `src/db/{client,lock,portable,backup,sqlite-import}.ts`, servicios asíncronos, Better Auth con adaptador pg, Storage (`src/server/storage.ts`), correo (`src/server/mail.ts`), cotización sin temporizador, `netlify.toml`, `.env.example`, scripts `db:migrate`, `db:backup`, `db:restore`, `db:migrar-sqlite`, `admin:crear`, `storage:probar`, `pg:test`.

**Comandos útiles:** `npx vitest run` (arranca un PostgreSQL real descartable solo), `npm run db:migrar-sqlite -- --origen … --uploads …` (revisión previa), `npm run db:backup`.

**Pruebas ejecutadas sobre este código (PostgreSQL 18 real, local y descartable):** typecheck OK · lint OK (incluye no-floating-promises) · `catalog:check` OK · `vitest`: 26 archivos, 371 pruebas OK (nuevas: `postgres-esquema`, `postgres` (concurrencia, transacciones, cascadas, enteros grandes), `sqlite-migracion` (incluye ensayo con la copia real del dueño), `storage`, `auth-pg`, `admin-rutas`; reescritas `backup` y `scripts`) · build de producción sin base configurada OK · **recorrido e2e completo (Playwright, builds de producción + PostgreSQL real por servidor): 415 pasadas, 9 omitidas por diseño, 6 fallas en la primera corrida**: 4 eran pruebas que abrían el SQLite directamente (convertidas a PostgreSQL y vueltas a correr: pasan), 1 es el carrusel con reloj real que ya era intermitente bajo carga (pasa sola) y 1 (`Bajo stock` del panel) falló una vez bajo carga y pasó al repetirla sola: no se investigó más, queda anotada como intermitente a vigilar.

**Límites reales / pendientes:** (1) Storage se probó contra un servidor local que imita la API, NO contra Supabase: falta `npm run storage:probar` con un bucket real. (2) Nada probado en Netlify ni con Supabase real (conexión por pooler, SSL, límites). (3) Correo real no probado y sin remitente válido: registro público deshabilitado. (4) La verificación de origen de Better Auth no es observable bajo Vitest (se omite en NODE_ENV=test): se mira en el recorrido e2e. (5) Límite de cuerpo de las funciones de Netlify y qué pasa al agotar los créditos: no confirmados en la documentación consultada. (6) Las sesiones locales no se migran. (7) Falta la revisión visual móvil de la vista previa publicada (no hay vista previa publicada).


## Velocidad de carga (23/10/2026, rama `perf/velocidad-de-carga`)

Informe completo: `docs/VELOCIDAD-DE-CARGA.md`. Una consulta por página en vez de cinco, `zod` fuera del navegador (carrito 214 → 181 KB de JS), fotos fuera de pantalla diferidas (se piden a 400 px; los banners del carrusel no). Medición intercalada en laboratorio local: en móvil lento el inicio queda interactivo ≈28 % antes y el catálogo ≈37 % antes; la ficha de producto en red lenta **no mejora** (limitada por ancho de banda). Escritorio: dentro del ruido. Probado: `npm run verify` (543 OK, 1 omitida) y Playwright completo con WebKit (625 OK, 9 omitidas por diseño, 0 fallas); 0 desbordes en 360/390/430/1366. Limitaciones: laboratorio, no un iPhone ni el hosting; fotos diferidas con alternativa `<noscript>` (probada con y sin JavaScript); no medido contra Supabase real. Sin push ni despliegue. Los archivos `src/app/apple-icon.png`, `favicon.ico` e `icon.svg` siguen siendo del dueño y pendientes (no incluidos en el commit).

## Pedidos y mayoristas: registro de Claude anterior a la continuación (02/11/2026)

Detalle funcional: [PEDIDOS.md](PEDIDOS.md). Capturas: `docs/capturas/pedidos/` (si existe; ver «Vista previa local» abajo).

**Ejecutado sobre este código (PostgreSQL real y descartable; nada contra Supabase real):**
- `tsc --noEmit`, `eslint .` y `npm run catalog:check`: sin errores.
- `npx vitest run`: **45 archivos, 592 pruebas pasadas, 1 omitida por diseño, 0 fallas.** Nuevas: `pedidos` (19: etapas, pago separado de la logística, idempotencia, comprobantes duplicados/falsos/pendientes, incidentes y reintegros, envíos agrupados, entregas parciales, avisos con fallo y reintento sin duplicados, acceso de cuentas e invitados, vista de la cliente sin datos internos), `reposicion` (6), `costos` (10: reparto exacto de gastos, costo histórico inmutable ante reposiciones, «Costo pendiente», cobrado ≠ facturado ≠ ganancia), `mayorista` (10: acceso solo con cuenta aprobada, catálogo que no se abre sin condiciones, tramos, mínimos, «A cotizar», pedido idempotente que no toca el stock), `google` (6) y `migracion-0004` (ensayo sobre una base con datos de la 0003). Se actualizaron `politicas`, `encargos-y-mayoristas` y `postgres-esquema` (el 30% y el «revisión apagada» ya no existen).
- Recorrido de punta a punta del servidor «pedidos» (:3109, build de producción, `tests/e2e/pedidos.spec.ts`): **9 de 9** — encargo completo con comprobante en almacén privado y aislamiento entre personas (otra cuenta, anónimo, enlace inventado y operaciones del panel: 404/401/403), pedido de invitado con enlace privado, «Avisame cuando vuelva», catálogo mayorista (cuenta sin aprobar, aprobada con catálogo cerrado, abierto, mínimo y pedido), costos y panel inaccesibles para clientes, **sin desborde horizontal a 360, 390 y 430 px** (cliente y panel) y **axe WCAG A/AA** sin violaciones en cliente y panel. Este recorrido encontró y se corrigieron: una función compartida mal ubicada en un módulo de cliente (500 en el ingreso), un selector obligatorio del panel que enviaba vacío y textos de bajo contraste.
- Regresión de pruebas de recorrido existentes que tocan lo modificado (servidores «demo» y «admin»: `mayoristas`, `cuentas`, `a11y`, `promos-encargos`, `admin`): 116 pasadas, 2 omitidas y 3 fallas en la primera corrida — 2 eran textos del 30% que ya no existen (pruebas actualizadas) y 1 necesitaba el servidor «real» que esa corrida no levantó; repetidas esas pruebas con los tres servidores (demo, real y admin): 5 de 5 pasadas.

**NO ejecutado / límites reales:**
- No se ejecutó el Playwright completo de todos los servidores (≈600 pruebas) ni WebKit sobre esta tanda; solo los grupos indicados.
- **OAuth real con Google: no probado** (sin credenciales); solo la lógica de vinculación con el servidor de tokens simulado. **Correo real: no probado** (transporte local de archivos; sin remitente verificado). **Supabase Storage privado real: no probado** (almacén local en pruebas; el cliente HTTP del bucket privado no se ejercitó contra Supabase). Netlify: sin vista previa.
- **Rendimiento: no se midió** en esta tanda. Por diseño no hay cambios en el camino del inicio ni del catálogo; la ficha agrega un componente solo en productos agotados y la cuenta suma una consulta por lista. Falta una medición real con `scripts/rendimiento.mjs` antes de publicar.
- No hay prueba con lector de pantalla. La guía de marca de Google (logotipo «G») está pendiente.
- Los avisos solo llegan a cuentas con correo verificado; los invitados no reciben correos.
- Las notificaciones y correos de pruebas son archivos locales: nada se envió a ninguna persona real.
