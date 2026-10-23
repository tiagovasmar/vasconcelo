# Cierre de pendientes de la auditoría de carga

**23/10/2026 · rama `fix/resiliencia-carga` (sobre `40657f3`) · un commit local · sin push, sin despliegue, sin migraciones ni escrituras en Supabase.**
Continúa [RESILIENCIA-CARGA.md](RESILIENCIA-CARGA.md). Los tres archivos del favicon siguen pendientes y fuera de este trabajo. Todo se ejecutó con PostgreSQL embebido descartable y datos de prueba; no se usaron credenciales de producción ni se cambiaron precios, stock, promociones ni condiciones comerciales. **No se cambió la cadena ni el modo de conexión** (sesión 5432, `prepare: false`).

## Resumen

| # | Pendiente | Resultado |
|---|---|---|
| 1 | Solicitudes bloqueadas por la base | **Causa encontrada y corregida.** Con la base caída la 5.ª solicitud ya esperaba >12 s (y, en conjunto, más de 100 s). Ahora cada solicitud responde un error controlado en pocos segundos y la aplicación se recupera sola cuando vuelve la base. |
| 2 | Suite completa en verde | Las 5 pruebas desactualizadas se actualizaron al comportamiento aprobado. Apareció (y se corrigió) una carrera real de foco en el carrito lateral que mi trabajo anterior había introducido. **Playwright completo con WebKit de laboratorio: 618 OK, 9 omitidas por diseño, 0 sin ejecutar; la única falla (WebKit) era una expectativa de foco ya corregida y verificada** |
| 3 | `global-error` y pestañas viejas | `global-error.tsx` disparado y comprobado con una falla real del diseño raíz. Pestaña vieja: «La tienda se actualizó» y «Actualizar la página» (manual, una sola recarga). WebKit reveló además un defecto de idempotencia para invitados (corregido). |
| 4 | Imágenes restantes | Banners de colección y cartas destacadas del inicio con reemplazo si la descarga falla. |
| 5 | Rendimiento | Sin regresiones medidas. Análisis del LCP de la ficha con foto (4,88 s): ver abajo; no encontré una mejora que pudiera medir y no apliqué ninguna. WebKit probado como navegador de laboratorio. |

## 1. Base de datos: solicitudes colgadas

**Reproducción (solo con bases descartables).** Un servidor de producción local cuya base no existe: `/api/health` y `/sellados` respondieron en 0,15 s, 0,48 s, 1,1 s y 1,6 s; las siguientes no respondieron en 12 s, y más tarde ni en 100 s. Con el cliente solo (`createDb`) el patrón era el mismo en las pruebas.

**Causa.** `postgres.js` lleva un contador de fallos de conexión **compartido** y espera `3^fallos / 100` segundos (hasta **20 s**) antes de cada nuevo intento de conexión. Con una sola conexión (`max: 1`, la configuración serverless) cada solicitud que llega espera ese retardo y, si falla, lo alarga: diez solicitudes seguidas suman minutos (la prueba con la espera original no terminó en 60 s). Además, `connect_timeout` era 15 s, no existía plazo de consulta (una base que acepta la conexión y deja de contestar dejaba la solicitud pendiente sin límite) y, en ese caso, la consulta seguía abierta en la conexión.

**Corrección (`src/db/resilient.ts`, `src/db/client.ts`).**
- **Espera entre intentos de conexión acotada** (≤ 1 s, con variación) en lugar de hasta 20 s.
- **Conexión:** plazo de 8 s (`DATABASE_CONNECT_TIMEOUT_S`).
- **Consulta (espera en cola + ejecución):** 10 s (`DATABASE_QUERY_TIMEOUT_MS`; 0 lo desactiva; las migraciones, respaldos y herramientas no lo usan). Al vencer **se cancela en el servidor** (`cancel()`): una consulta en cola se rechaza al instante y una que se está ejecutando se detiene (se comprobó que ya no figura como activa en `pg_stat_activity`).
- **Si el servidor tampoco confirma la cancelación** (red cortada a medio camino) pasan 3 s más y se **descarta la conexión** (`end({ timeout: 0 })`) y se crea una nueva para la próxima solicitud: no quedan conexiones bloqueadas ni consultas ejecutándose en segundo plano, y quien esperaba recibe un `DbTimeoutError` (error controlado). No es un `Promise.race` suelto: cancelar y cerrar es lo que libera los recursos.
- **Nada se reintenta**, ni lecturas ni escrituras. Una **transacción** cuya sentencia vence se revierte entera (el servidor la deshace al cerrar la sesión): se comprobó que un `insert` previo no queda guardado y que la función se ejecuta una sola vez.
- Lo que se mantiene: sesión 5432, `prepare: false`, `max` por instancia, SSL y la forma de usar `getDb()` (Better Auth y los servicios siguen igual).
- No usé `statement_timeout` como parámetro de arranque: la documentación y los reportes públicos indican que el pooler de Supabase no honra de forma fiable las opciones de arranque; el plazo de aplicación funciona igual en cualquier modo.

**Pruebas (`tests/db-resiliencia.test.ts`, 7, con PostgreSQL real y un proxy TCP que apaga, enmudece y devuelve la base):** espera acotada; base caída con 8 solicitudes concurrentes + 10 rondas seguidas (total < 15 s; con la espera original esa prueba no termina en 60 s); recuperación sin reiniciar; base muda → `DbTimeoutError`, conexión descartada, una sola sesión después; `pg_sleep` cancelado en el servidor; transacción revertida sin reintento; transacción normal confirma; sin plazo configurado no se cancela nada. Recorrido real (`resiliencia.spec.ts`, servidor `caido`): 12 solicitudes seguidas con la base quitada responden 5xx en < 12 s cada una; se **vuelve a crear la base** y la misma instancia responde 200 sin reiniciar.

**Límites reales:** no se probó contra Supabase/Supavisor (no se usan credenciales ni servicios reales); no sé cómo responde el pooler a una cancelación — por eso existe el descarte de la conexión como respaldo. Tampoco se probó un corte real de red hacia un host remoto (sí un proxy que corta y enmudece).

## 2. Suite completa

**Las 5 pruebas que fallaban desde el commit base** eran expectativas anteriores al comportamiento aprobado en `docs/ACCESORIOS-SOLO-ADICIONALES.md` (los dos protectores son solo adicionales: no se listan en inicio, catálogo, búsqueda ni filtros):
- `catalogo.spec` ×2: la primera página del catálogo de prueba lista 8 productos (antes 10, con los 2 protectores).
- `colecciones.spec` y `colecciones-tanda5.spec`: 50 productos públicos (antes 52); última página de 2 (antes 4); los 2 botones «por encargo» de esa página son los de los chinos sin precio; se agregó que no aparezcan «sleeves» ni «top loaders».
- `promo-accesorios.spec`: la prueba de «formato Accesorios» ahora verifica lo contrario y más: `?q=sleeves`, `?q=top loaders` y `?formato=accesorios` no listan nada, el filtro «Accesorios» ya no existe, la ficha directa sigue funcionando (precio, pack, imagen ilustrativa, sin probabilidades) y **lleva `noindex`** (comprobación nueva). Esa falla cortaba una serie de 30 pruebas que antes quedaban «sin ejecutar»; ahora corren todas.
No se eliminó ninguna comprobación útil ni se debilitó una expectativa para que pase.

**Hallazgo de esta revisión (mío, del trabajo anterior):** en la suite completa falló una prueba de foco del carrito (`carrito.spec`, «desde la tarjeta»). Reproduje que **fallaba ≈ 30 % de las veces también en `40657f3`** (en la corrida anterior había pasado por azar). Causa: si se aprieta Escape justo entre el dibujo del panel completo y sus efectos, la cierra el marco de carga (que todavía tiene su atajo activo); el marco «consumía» el elemento al que había que devolver el foco y el panel, al desmontarse después, caía al botón del carrito. Corrección: el elemento no se consume (`peekReturnFocus`), así los dos devuelven el foco al mismo botón. Prueba nueva (10 vueltas de «Escape apenas aparece el panel»): 12 de 12 corridas OK; `carrito.spec` repetido ×6: OK.

**Resultados sobre el código final** — 
- **`npm run verify`** (typecheck, lint, `catalog:check`, Vitest): **537 pasaron, 1 omitida** (anterior a este trabajo), 37 archivos; 0 fallas. La advertencia de lint es anterior (`capturas-adicionales.mjs`).
- **Playwright, suite completa sobre el código final** (8 servidores aislados + WebKit): **618 pasaron, 9 omitidas, 0 «no ejecutadas»**, 1 falla. La falla fue **solo en WebKit**: el foco tras Escape. Safari/WebKit no da foco a un botón al tocarlo, así que no hay elemento de origen y el foco vuelve al ícono del carrito (el respaldo previsto); la expectativa ahora lo distingue por navegador y esa prueba se volvió a correr en WebKit: **OK**. El resto de los proyectos (escritorio, celular, WhatsApp, admin, consultas, extra, catálogo real y resiliencia) no tuvo fallas.
- **Las 9 omitidas** son condicionales por diseño (pruebas solo de celular que se omiten en escritorio y viceversa: menú móvil, barra inferior, hoja de filtros, teclado en celular, desborde de cuentas en móvil, ficha en celular, autoplay con mouse); no se omitió nada para evitar una falla.
- **Los 5 casos anteriores:** ya pasan (151 pruebas de catálogo, accesorios, colecciones y tanda 5 en un recorrido aparte, y de nuevo en la suite completa).
- Los resultados de **antes** de los arreglos de esta tanda, para distinguir: la suite del commit anterior daba 531 OK, 9 fallas (5 pruebas distintas), 30 sin ejecutar.

## 3. Recuperación de errores

- **`global-error.tsx` disparado de verdad.** Hay un gancho solo para pruebas (`src/server/test-hooks.ts`, activo únicamente si existe la variable `E2E_LAYOUT_FAIL_FILE`, que nunca se define fuera de las pruebas) que hace fallar el **diseño raíz** mientras exista un archivo. Servidor aislado `layout` (:3108): responde **500** con el documento propio de `global-error` (sin encabezado ni pie), título «No pudimos cargar esta página.», «Reintentar» y «Volver al catálogo». Comprobado: el texto del error simulado, rutas, trazas y nombres internos **no aparecen ni en pantalla ni en el HTML recibido** (solo un código opaco `digest`); el **carrito de `localStorage` queda intacto**; «Reintentar» con el fallo presente vuelve a mostrar la pantalla sin romper; al quitar el fallo, «Reintentar» trae la página sin reiniciar el servidor y el carrito aparece en el encabezado.
- **Pestaña abierta antes de un despliegue.** Simulado quitando de golpe los archivos de código que la pestaña todavía no había descargado (responden 404, como tras reemplazar un despliegue). Dos puntos de falla, ambos resueltos:
  - *Carrito lateral:* si falla la descarga, junto a «Reintentar» (que no alcanza: el archivo viejo no vuelve) y «Ir al pedido» aparece **«Actualizar la página»**.
  - *Cualquier página:* si el error es de módulo/archivo de código (`ChunkLoadError`, «Failed to load chunk», «dynamically imported module»…) la pantalla de error pasa a **«La tienda se actualizó.»** con «Actualizar la página».
  La recarga **la decide la persona** y se prueba que es **una sola** (un único documento pedido) y que el carrito sigue; nunca se recarga sola, así que no hay bucle posible. Limitación: es una simulación del 404 de archivos viejos, no un despliegue real de dos versiones.
- **Hallazgo en WebKit → corregido (idempotencia de invitados).** Con una primera visita (sin cookie), si la consulta **se guardaba pero la respuesta se perdía**, el reintento llegaba sin la cookie de sesión nueva (la respuesta que la traía no llegó) y el servidor lo rechazaba con `idempotency_conflict`: **no duplicaba, pero tampoco se podía recuperar** (en Chromium la prueba pasaba solo porque Playwright conserva la cookie de `route.fetch`). Ahora, si llega la **misma clave secreta con exactamente el mismo contenido**, de un invitado **sin cookie válida**, dentro de **30 minutos** y sobre una consulta de invitado, se asocia esa consulta a la sesión nueva y se devuelve la misma (`replayed: true`). No aplica con otro contenido, pasada la ventana, con cuenta iniciada ni si la petición traía una cookie distinta. 2 pruebas nuevas en `inquiries.test.ts` y el recorrido borra la cookie antes de reintentar.

## 4. Imágenes restantes
Banner de colección (`collection-banner.tsx`): el arte principal conserva su recuadro y su `aria-label`; la caja y el sobre (adornos con posición absoluta) dejan su texto alternativo. Cartas destacadas del inicio: recuadro con la proporción de la carta y su texto alternativo. Ambos usan `SafeImage`: una sola vez por dirección, carga diferida y `sizes` sin cambios. Pruebas con 404 y con red cortada (inicio, banner del inicio y de `/expansiones/storm-emeralda`): mismo tamaño ±1 px, sin imágenes rotas, pedidos estables pasados 2,5 s (como mucho 3 por dirección: precarga, imagen y candidato del `srcset`). Pendiente: otras imágenes decorativas de páginas informativas.

## 5. Rendimiento y comprobación final

**Método.** El mismo de la tanda anterior (`scripts/medir-resiliencia.mjs`): Chromium de Playwright sobre el build de producción, base descartable, mediana de 5 corridas, CPU 4× y 1,6 Mb/s / 150 ms («móvil») o 400 kb/s / 400 ms («móvil lento»), y sin límites en escritorio. «Antes» = build de `40657f3`, «después» = esta rama, **medidos en la misma sesión** con servidores en paralelo sobre la misma base. Dos series: catálogo de prueba (con interacción) y catálogo real (fotos). Es laboratorio local; no es un teléfono real.

### Catálogo de prueba
Cada celda: antes (`40657f3`) → después.

| Perfil | Página | LCP ms | CLS | TBT ms | INP lab ms | KB transferidos |
|---|---|---|---|---|---|---|
| móvil | inicio | 1128 → 1128 | 0 → 0 | 73 → 71 | — | 367 → 369 |
| móvil | catálogo | 980 → 1000 | 0 → 0 | 77 → 61 | — | 254 → 257 |
| móvil | ficha caja con adicionales | 1084 → 1064 | 0 → 0 | 57 → 76 | 48 → 24 | 267 → 269 |
| móvil | carrito (2 sobres) | 912 → 912 | 0 → 0 | 99 → 89 | — | 283 → 284 |
| móvil lento | inicio | 2776 → 2716 | 0 → 0 | 0 → 40 | — | 366 → 369 |
| móvil lento | catálogo | 2500 → 2488 | 0 → 0 | 0 → 6 | — | 252 → 255 |
| móvil lento | ficha caja con adicionales | 2596 → 2556 | 0 → 0 | 0 → 0 | 32 → 24 | 267 → 269 |
| móvil lento | carrito (2 sobres) | 2460 → 2480 | 0 → 0 | 6 → 9 | — | 283 → 284 |
| escritorio | inicio | 176 → 172 | 0 → 0 | 0 → 0 | — | 372 → 375 |
| escritorio | catálogo | 172 → 184 | 0 → 0 | 0 → 0 | — | 254 → 257 |
| escritorio | ficha caja con adicionales | 156 → 144 | 0 → 0 | 0 → 0 | 40 → 48 | 276 → 277 |
| escritorio | carrito (2 sobres) | 60 → 92 | 0 → 0 | 0 → 0 | — | 296 → 297 |

### Catálogo real
Cada celda: antes → después.

| Perfil | Página | LCP ms | CLS | TBT ms | INP lab ms | KB transferidos |
|---|---|---|---|---|---|---|
| móvil | inicio | 1200 → 1228 | 0 → 0 | 63 → 80 | — | 562 → 564 |
| móvil | catálogo | 1008 → 1040 | 0 → 0 | 61 → 71 | — | 470 → 471 |
| móvil | ficha caja con adicionales | 1256 → 1248 | 0 → 0 | 76 → 70 | — | 298 → 299 |
| móvil | carrito (2 sobres) | 912 → 2276 | 0 → 0 | 96 → 100 | — | 311 → 313 |
| móvil lento | inicio | 3340 → 3336 | 0 → 0 | 74 → 57 | — | 617 → 619 |
| móvil lento | catálogo | 2512 → 2468 | 0 → 0 | 56 → 71 | — | 593 → 592 |
| móvil lento | ficha caja con adicionales | 4876 → 4852 | 0 → 0 | 55 → 67 | — | 298 → 299 |
| móvil lento | carrito (2 sobres) | 2440 → 2412 | 0 → 0 | 101 → 107 | — | 311 → 313 |
| escritorio | inicio | 216 → 216 | 0 → 0 | 0 → 0 | — | 899 → 903 |
| escritorio | catálogo | 132 → 136 | 0 → 0 | 0 → 0 | — | 597 → 599 |
| escritorio | ficha caja con adicionales | 172 → 168 | 0 → 0 | 0 → 0 | — | 395 → 398 |
| escritorio | carrito (2 sobres) | 92 → 72 | 0 → 0 | 0 → 0 | — | 323 → 326 |

### Desborde horizontal
32 comprobaciones (4 páginas × 360, 390, 430 y 1366 px, en ambos builds): **desborde horizontal 0 px en todas**. Las 36 capturas de `docs/capturas/resiliencia/` (incluidos los estados de error) también midieron 0 px (`desborde.json`).

### Lectura
- **Sin regresiones medibles** entre `40657f3` y esta rama (misma sesión, mismas condiciones): LCP, TBT e INP de laboratorio dentro del ruido (±40 ms «móvil», ±100 ms «móvil lento»); CLS 0 en todo; +2 a +4 KB transferidos por página (el plazo de consultas y el reemplazo de imágenes en banners/inicio casi no pesan).
- **Un dato raro que se repitió:** el carrito del catálogo real en «móvil» salió 912 → 2276 ms. Lo medí de nuevo con 9 corridas alternando servidores (2388, 2420, 2424 y 2444 ms): **ambos builds dan ≈ 2,4 s**; el 912 era una corrida en la que el elemento de LCP cambia (el LCP de esa página depende de qué texto se pinta primero). No es una regresión.
- **Interactividad (INP de laboratorio):** 24–48 ms en la ficha (antes 24–40): muy por debajo de 200 ms; las diferencias de ±24 ms son ruido de una sola interacción guionada.
- Las cifras absolutas de «móvil lento» (LCP 2,4–3,3 s; 4,85 s la ficha con foto) son anteriores a este trabajo; ver el análisis siguiente.

### Por qué la ficha con foto tarda ≈ 4,9 s de LCP en conexión lenta
Con el perfil «móvil lento» (400 kb/s ≈ 50 KB/s) se registró la cascada de pedidos de `/productos/storm-emeralda-caja` (catálogo real): el documento (26 KB) llega a los 1,15 s; el CSS (14 KB) a los 2,3 s; los dos tipos de letra (38 KB) a 2,7–2,8 s; **el título (H1) se pinta a los ≈ 2,7 s** y **la foto principal (41 KB) termina a los 4,86 s**, junto con ≈ 160 KB de JavaScript. Es decir: **el LCP está limitado por el ancho de banda**: todo lo que se pide al mismo tiempo (≈ 290 KB en total, hechos de 160 KB de JS, 41 KB de foto, 38 KB de letras y 14 KB de CSS) comparte unos 50 KB/s. La foto ya se pide con `priority` (precarga) y es chica; no hay recorte posible sin bajar calidad visible.
**Probé** `fetchPriority="high"` en la imagen principal: la prioridad pasó de «Low» a «High» y **el tiempo no cambió (4862 → 4866 ms)**. El laboratorio usa HTTP/1.1 con 6 conexiones que se reparten el ancho por igual, así que **no puede medir** el efecto de las prioridades que sí aplican HTTP/2 y los CDN. Como no pude medir ninguna mejora, **revertí el cambio** y no prometo ninguna. Lo que sí reduciría el LCP en esta red (y se mediría) es **bajar bytes antes de la foto** (JavaScript del arranque, tipos de letra), un trabajo aparte; la recomendación es medir en un entorno HTTP/2 real (vista previa de Netlify) antes de tocar prioridades.

### WebKit (navegador de laboratorio)
Playwright WebKit 27.2 (se instaló con `npx playwright install webkit`, 60 MiB desde el CDN oficial de Playwright), en Windows, con viewport y táctil de celular (390×844): **es el motor de Safari, no Safari ni un iPhone físico**, y no emula iOS (teclado, barras del navegador, memoria, red real). Se corrieron las **33 pruebas de `resiliencia.spec.ts`** (adicionales, carrito, consulta, panel lateral, módulo que falla, global-error y versión vieja): **todas pasan** con el código final; una falló en la primera pasada y reveló el defecto de idempotencia descrito arriba. **No hay métricas de rendimiento de WebKit** (no expone LCP ni se pueden limitar CPU/red con CDP): las mediciones son solo de Chromium.

## Pendientes y limitaciones
1. Supabase/Supavisor real: el plazo de consulta, la cancelación y el descarte de conexión se probaron con PostgreSQL local y un proxy; falta una prueba en una vista previa conectada a una base de **pruebas** de Supabase, nunca la de producción.
2. Un despliegue real de dos versiones (con `deploymentId`/protección contra desfase) en lugar de la simulación con 404.
3. iPhone y Android físicos; Safari real; LCP/INP de campo.
4. LCP de la ficha en red lenta: reducir JavaScript y tipos de letra previos a la foto; medir prioridades en HTTP/2.
5. `global-error` dibuja su propio documento sin las tipografías del sitio (usa la del sistema): es lo esperable en ese último recurso.
6. Otras llamadas del navegador sin plazo (cuenta, favoritos, mayoristas, admin) siguen igual; el gancho de pruebas del diseño raíz es código de prueba dentro del código de producción (inactivo sin la variable).
7. Procesos de PostgreSQL embebido huérfanos de una sesión anterior en esta computadora (no son de este trabajo).

## Cómo reproducir
```bash
npm run verify
E2E_WEBKIT=1 npx playwright test          # suite completa (+ proyecto WebKit de laboratorio); E2E_SERVERS=resil,caido,layout,real para un subconjunto
BASE=http://localhost:3300 node scripts/medir-resiliencia.mjs
BASE=http://localhost:3300 node scripts/capturas-resiliencia.mjs
```
Capturas: `docs/capturas/resiliencia/` (360, 390, 430 px y escritorio; además `10-global-error-*` y `11-version-vieja-*` de las pruebas). Datos crudos: `docs/mediciones/resiliencia2-*.json` y `resiliencia2-*.txt`.
