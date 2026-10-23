# Resiliencia ante conexiones lentas, cortes de red y errores de carga

**23/10/2026 · rama `fix/resiliencia-carga` (sobre `af4c812`) · un commit local · sin push, sin despliegue, sin migraciones ni escrituras en producción.**
Parte de la auditoría de carga del 23/10/2026 (`auditoria-carga/AUDITORIA.md`, fuera del repositorio). Cada hallazgo se confirmó contra el código antes de tocarlo. No se cambió ningún precio, stock, promoción ni condición comercial. Los tres archivos del favicon (`src/app/apple-icon.png`, `favicon.ico`, `icon.svg`) siguen pendientes y **no** están en este trabajo.

## Resumen

| Tema | Antes (confirmado en el código y, donde se indica, medido en el commit base) | Ahora |
|---|---|---|
| 1. Cálculo de adicionales | Un error o una respuesta que no llega dejaba «Calculando tu selección…» para siempre; un `catch` vacío tragaba el error. | Estados calculando / listo / error, plazo de 8 s, «Reintentar», selección intacta, respuestas viejas descartadas, ningún total viejo ante un error. |
| 2. Carrito y consulta | `fetch` sin plazo en la validación, en «Agregar caja y adicionales» y en «Continuar por WhatsApp». Ante un corte, el aviso afirmaba «Tu consulta **no** se guardó» (no se puede saber). | Plazos de 10 s / 10 s / 20 s, botones siempre liberados, mensajes por tipo de fallo, «Reintentar» sin perder carrito ni formulario. El reintento reutiliza la clave de idempotencia: **no duplica** (probado). Nunca se reintenta solo. |
| 3. Carrito lateral | Mientras bajaba su módulo no se podía cerrar (ni botón, ni Escape, ni fondo); `preloaded = true` antes de saber el resultado y sin captura del rechazo. | Se cierra desde el primer instante; foco, Tab y bloqueo de desplazamiento correctos; si falla la descarga: aviso, «Reintentar» e «Ir al pedido»; sin recargas ni pérdida del carrito. |
| 4. Páginas | Sin `error.tsx` ni `global-error.tsx`. | Pantalla de error propia (mismo diseño que la 404) con «Reintentar» y «Volver al catálogo». `loading.tsx` **probado y descartado** (empeoraba el LCP; ver Mediciones). |
| 5. Imágenes | Si una foto «existente» devolvía 404/500 quedaba rota. | Ilustración de reserva en el mismo recuadro, mismo texto alternativo, una sola vez por dirección, sin bucles. |
| 6. Cupos de sobres | Con la caja ya en su máximo la ficha contaba una caja más: en el build base, caja ×2 (máximo) → «te quedan **15** cupos» (el servidor da 10). | Solo cuenta la caja que de verdad puede agregarse. Ficha, carrito y servidor coinciden (prueba con varias cajas y sobres). |

## Hallazgos confirmados y qué se hizo

### 1. Cálculo de adicionales (`src/components/cart-widgets.tsx`)
- **Confirmado:** el efecto del desglose hacía `if (r.ok) setPreview(...)` y un `catch {}` vacío; sin respuesta 2xx el estado no cambiaba y `previewLoading` seguía en `true`. Además, `add()` no tenía plazo y dejaba pasar un cambio de selección durante la validación.
- **Hecho:**
  - El resultado se guarda **por selección** (`key`): `listo` o `error`. Solo vale si su clave es la de la selección actual; una respuesta tardía de una selección anterior no pisa a la nueva (además se cancela la solicitud vieja).
  - Plazo de 8 s (`requestJson`, ver abajo). Error → recuadro con el motivo (lenta / sin conexión / 429 / error del servidor), **sin ningún total** y con «Reintentar»; la selección y las cantidades no se tocan. Mientras se recalcula sigue visible, atenuado, el último desglose bueno (comportamiento anterior, sin saltos).
  - «Agregar caja y adicionales»: plazo de 10 s, el botón siempre se libera, error propio con «Reintentar»; si la selección cambió mientras se validaba **no se agrega nada** y se avisa.
  - La validación de precios, stock, cupos y descuentos sigue siendo **solo del servidor** (`/api/cart/adicionales`, sin cambios).

### 2. Carrito y consultas (`src/lib/request.ts`, `features/cart/validation.ts`, `components/cart-view.tsx`)
- **Ayudante único `requestJson`:** el plazo cubre cabeceras **y cuerpo**; distingue plazo vencido, sin red y cancelación propia (esta última no es un error para mostrar); **nunca reintenta**.
- Validación del carrito (panel y pedido): 10 s; el error conserva el carrito y bloquea «Continuar» (no se continúa sin verificar); `fresh` sigue impidiendo usar importes de otro contenido.
- Preparación de la consulta: 20 s, guarda contra doble toque (`submittingRef`), el botón se libera siempre. Ante un corte el aviso dice **«No sabemos si llegó a guardarse»** y que reintentar es seguro. Probado: el servidor guarda la consulta, la respuesta se corta, la persona reintenta y recibe `replayed: true` con **la misma referencia** (una sola consulta).
- No se tocó la lógica de idempotencia del servidor (`createInquiry`) ni la clave del cliente.

### 3. Carrito lateral (`cart-drawer.tsx`, nuevo `cart-drawer-shell.ts`)
- **Confirmado:** el marco «Cargando…» no tenía cierre; `preloaded = true` se marcaba antes de saber si `import()` salía bien y no capturaba el rechazo.
- **Hecho:** el comportamiento del panel (foco, bloqueo de desplazamiento, Escape, Tab, cierre al navegar) pasó a un gancho compartido (`useDrawerShell`) que usan el **marco** y el panel completo. La promesa del módulo se comparte y, si falla, se descarta (no queda «envenenada»); la precarga automática espera 30 s tras un fallo; abrir el panel o «Reintentar» sí reintentan al instante. Un error al dibujar el panel cae a «Reintentar» (límite de error). Nunca se recarga la página sola.

### 4. Páginas (`error.tsx`, `global-error.tsx`)
- Pantalla coherente con la 404 (texto claro, «Reintentar» → `retry()` de Next, «Volver al catálogo»), sin mostrar el error técnico (solo el código `digest` para soporte) ni importes.
- `loading.tsx`: se implementó (esqueleto con aparición retrasada) y **se retiró** tras medirlo: ver Mediciones.

### 5. Imágenes (`safe-image.tsx`, `slot.tsx`, `art-reserva.tsx`)
- `SafeImage` envuelve `next/image`: `onError` (y una revisión al montar, por si el error ocurrió antes de la hidratación) cambia a la ilustración de reserva; recuerda las direcciones que fallaron (sin reintentos ni descargas nuevas). Cubre catálogo y fichas (`ArtSlot`/`ProductImage`), líneas del pedido, panel lateral, adicionales, recomendaciones y cartas de la galería.
- Las ilustraciones de sobre/caja se movieron a un módulo chico (`art-reserva.tsx`) para no arrastrar la escena del inicio al navegador; `art.tsx` las reexporta.
- **No cubierto:** los banners de colección y las cartas destacadas del inicio (server components con arte propio).

### 6. Cupos de sobres (`features/promos/cupos.ts`)
- **Causa exacta:** `BoxAddons` recibía `boxQty = q`, y `q = min(max(1, qty), max(1, room))` **nunca baja de 1**; con la caja en su máximo (`room = 0`) la ficha igual sumaba una caja (+5 cupos). El mismo valor entraba en el cálculo del desglose.
- **Hecho:** `boxesAddable(chosen, room)` devuelve 0 si no hay lugar; la ficha y el pedido al servidor usan ese valor. `comboSlots` es la misma cuenta de antes, aislada para poder probarla contra `priceCart`/`evaluateCart`.
- El servidor **no** otorgaba de más: su cuenta sale del carrito resultante (`cupos.test.ts` lo verifica con 1, 2 y 3 cajas y sobres ya agregados).
- Observación (no se cambió): con la caja en su máximo, el botón queda en «Máximo en el carrito» aunque haya adicionales elegidos; no se pueden sumar solo los adicionales desde la ficha. Es el comportamiento anterior.

## Pruebas

**Aislamiento.** Todas las pruebas usan PostgreSQL **embebido y descartable** (puerto propio, bases `e2e_*` creadas desde una plantilla) con `STORAGE_DRIVER=local`, `MAIL_TRANSPORT=local`, secretos de prueba y `FX_AUTO_REFRESH=0`. El `.env.local` del repositorio apunta a `127.0.0.1:54400/vasconcelo_dev` con `ENTORNO_LOCAL=1` (nunca se conecta a un servidor remoto). Las credenciales de producción están en `.local/backups/env.local.produccion` (fuera de Git) y **solo las leen scripts sueltos de `.local/`** (`leer-combo.cjs`, `prod-run.cjs`, `verif-prod-0003.cjs`…): ninguno es de pruebas ni se ejecutó. Los scripts nuevos exigen `BASE` en localhost y no cargan archivos `.env`. No se corrió ninguna migración, semilla ni escritura contra Supabase/Netlify.

**Unitarias (Vitest, 16 nuevas):** `tests/request.test.ts` (plazo, plazo sobre el cuerpo, red caída, cancelación propia, un solo `fetch` por fallo, mensajes) y `tests/cupos.test.ts` (ficha vs servidor con varias cajas y sobres).

**Recorridos (Playwright, servidor `resil` :3106 con build de producción, y `real` :3102):** `tests/e2e/resiliencia.spec.ts` (28 pruebas, en escritorio 1440 y celular 390 táctil) y `resiliencia-imagenes.spec.ts` (4 × 2). Las fallas se inyectan con `page.route`:
- Adicionales: respuesta lenta; servidor mudo (error a los 8 s, sin total, selección intacta, «Reintentar»); HTTP 500, 502 y 429; red caída; un error tras un total bueno no deja el total viejo; **respuestas fuera de orden**.
- Agregar: HTTP 500 (carrito intacto, botón libre, «Reintentar» agrega); mudo (se libera a los 10 s); selección cambiada durante la validación.
- Cupos: caja en el máximo (10, no 15) y caja con lugar para otra.
- Pedido: verificación muda (10 s), 500 y 429; panel lateral con el mismo error; consulta muda (20 s, datos del formulario intactos); respuesta cortada **después** de guardar → reintento recupera la misma consulta (`replayed`, misma referencia, 2 llamadas exactas); 500/429 sin reintento automático; doble toque = una sola solicitud.
- Panel lateral: archivo del módulo retenido → se cierra con botón, Escape y fondo, foco y Tab correctos, desplazamiento liberado; el módulo que llega después no reabre un panel cerrado; el marco se vuelve panel al llegar; **descarga fallida** → aviso, sin bucle, «Reintentar» con red caída (un intento exacto) y luego con red sana (abre el panel, sin recarga).
- Imágenes: 404, 500 y red cortada en todas las fotos del catálogo real (reserva visible con su `aria-label`, mismo tamaño de tarjeta ±1 px, sin imágenes rotas, sin nuevas solicitudes pasados 2,5 s) y ficha con la foto principal rota.
- Pantalla de error: servidor con la base de datos caída (error real del servidor) → pantalla propia, «Reintentar», «Volver al catálogo», sin importes.

**Resultados sobre el código final:**
- `npm run verify`: typecheck, lint, `catalog:check` y **528 pruebas Vitest OK** (1 omitida, anterior a este trabajo).
- Playwright, **suite completa** (7 servidores aislados, escritorio y celular, build de producción): **531 OK**, 9 fallas que corresponden a **5 pruebas distintas que fallan idénticas en el commit base** (`catalogo.spec` ×2, `promo-accesorios` «formato Accesorios», `colecciones` y `colecciones-tanda5` «52 productos»: expectativas desactualizadas tras «Ocultar protectores del catálogo»; no son de este trabajo y no se tocaron) y 30 que **no se ejecutaron** porque la serie de `promo-accesorios` se corta en la falla anterior: se corrieron aparte excluyendo esa prueba (**32 OK**).
- Tras el último retoque de texto (el título del recuadro de error del desglose) se **repitieron las 64 pruebas de resiliencia** (escritorio, celular y fotos): **64 OK**.
- **Las pruebas detectan los defectos:** corridas contra el build del commit base (copia desechable `af4c812`) fallan en las pruebas de cupos («te quedan **15** cupos» en vez de 10), de cierre del panel durante la carga (no hay marco operable ni bloqueo de desplazamiento) y de estados de error/«Reintentar».

## Mediciones (build de producción, laboratorio)

**Método.** Chromium de Playwright sobre `next start` del build de producción de cada commit (`antes` = `af4c812`; `después` = esta rama), misma base PostgreSQL descartable, mismo script (`scripts/medir-resiliencia.mjs`), **mediana de 5 corridas**, contexto nuevo en cada corrida. Limitación por el protocolo de Chrome (CDP): **«móvil»** = 390×844 táctil, CPU 4× más lenta, 1,6 Mb/s de bajada, 150 ms de latencia; **«móvil lento»** = CPU 4×, 400 kb/s, 400 ms (≈ 3G); **escritorio** sin límites. LCP, CLS y TBT con `PerformanceObserver`; **INP de laboratorio** = la interacción más lenta (Event Timing, `interactionId`) de un recorrido guionado de la ficha: elegir un sobre → esperar el total → «+» → «Agregar caja y adicionales» (valida en el servidor y abre el panel lateral) → Escape. Se espera a que la red se aquiete antes de leer las métricas. Se hicieron dos series: **catálogo de prueba** (para las interacciones, porque tiene precios y stock) y **catálogo real** (fotos reales; sin adicionales porque los precios están por confirmar).

> Esto es **laboratorio local**: no equivale a usuarios reales, a un teléfono físico, a Safari/iOS ni al hosting (Netlify, funciones en frío, Supabase remoto). No hay datos de campo. El «INP de laboratorio» no es el INP que reportaría un navegador real en una sesión larga.

### Catálogo de prueba (con adicionales e interacciones)
Cada celda: antes → después.

| Perfil | Página | LCP ms | CLS | TBT ms | INP lab ms | KB transferidos |
|---|---|---|---|---|---|---|
| móvil | inicio | 1120 → 1104 | 0 → 0 | 69 → 68 | — | 360 → 368 |
| móvil | catálogo | 988 → 988 | 0 → 0 | 58 → 63 | — | 247 → 256 |
| móvil | ficha caja con adicionales | 1072 → 1076 | 0.032 → 0 | 57 → 66 | 32 → 40 | 265 → 268 |
| móvil | carrito (2 sobres) | 904 → 908 | 0 → 0 | 86 → 84 | — | 279 → 283 |
| móvil lento | inicio | 2720 → 2720 | 0 → 0 | 63 → 60 | — | 360 → 368 |
| móvil lento | catálogo | 2492 → 2484 | 0 → 0 | 59 → 61 | — | 247 → 256 |
| móvil lento | ficha caja con adicionales | 2576 → 2600 | 0.114 → 0 | 55 → 59 | 32 → 40 | 262 → 268 |
| móvil lento | carrito (2 sobres) | 2448 → 2384 | 0 → 0 | 96 → 84 | — | 279 → 283 |
| escritorio | inicio | 144 → 148 | 0 → 0 | 0 → 0 | — | 368 → 377 |
| escritorio | catálogo | 132 → 136 | 0 → 0 | 0 → 0 | — | 250 → 256 |
| escritorio | ficha caja con adicionales | 136 → 136 | 0 → 0 | 0 → 0 | 24 → 24 | 272 → 279 |
| escritorio | carrito (2 sobres) | 104 → 68 | 0 → 0 | 0 → 0 | — | 291 → 297 |

### Catálogo real (fotos reales, sin interacciones)
Cada celda: antes → después.

| Perfil | Página | LCP ms | CLS | TBT ms | INP lab ms | KB transferidos |
|---|---|---|---|---|---|---|
| móvil | inicio | 1192 → 1192 | 0 → 0 | 57 → 62 | — | 555 → 563 |
| móvil | catálogo | 1012 → 1020 | 0 → 0 | 54 → 64 | — | 463 → 472 |
| móvil | ficha caja con adicionales | 1276 → 1244 | 0 → 0 | 54 → 63 | — | 292 → 299 |
| móvil | carrito (2 sobres) | 2236 → 2248 | 0 → 0 | 82 → 98 | — | 307 → 312 |
| móvil lento | inicio | 3252 → 3344 | 0 → 0 | 84 → 58 | — | 643 → 618 |
| móvil lento | catálogo | 2480 → 2492 | 0 → 0 | 63 → 53 | — | 586 → 592 |
| móvil lento | ficha caja con adicionales | 4848 → 4884 | 0 → 0 | 60 → 65 | — | 292 → 299 |
| móvil lento | carrito (2 sobres) | 2424 → 2376 | 0 → 0 | 96 → 90 | — | 307 → 312 |
| escritorio | inicio | 204 → 208 | 0 → 0 | 0 → 0 | — | 893 → 900 |
| escritorio | catálogo | 140 → 128 | 0 → 0 | 0 → 0 | — | 590 → 598 |
| escritorio | ficha caja con adicionales | 168 → 168 | 0 → 0 | 0 → 0 | — | 390 → 396 |
| escritorio | carrito (2 sobres) | 68 → 80 | 0 → 0 | 0 → 0 | — | 318 → 325 |

### Desborde horizontal
Barrido de 4 páginas (inicio, catálogo, ficha con adicionales, carrito con 2 sobres) × 4 anchos (360, 390, 430 px y 1366 px) en **ambos builds**: 32 comprobaciones, **desborde horizontal 0 px en todas** (`scrollWidth − clientWidth`). Además, las 36 capturas de `docs/capturas/resiliencia/` (incluidos los estados de error) midieron 0 px (`desborde.json`).

### Lectura
- **Carga (LCP):** sin diferencias fuera del ruido de laboratorio (±40 ms en «móvil», ±100 ms en «móvil lento»). La ficha real con foto en «móvil lento» pasa de 4848 a 4884 ms (+0,7 %): ese LCP lo domina la foto principal (≈ 87 KB a 400 kb/s) y esta tarea no la toca.
- **CLS:** 0 en todas las páginas después. En la ficha de prueba, durante el recorrido con adicionales, antes había 0,032 (móvil) y 0,114 (móvil lento) y ahora 0; **no investigué la causa de esa mejora** (la medición de CLS con interacciones depende de cuándo llega la respuesta), así que no la atribuyo a nada.
- **Interactividad (INP de laboratorio):** 40 ms en la ficha con el celular simulado (antes 32 ms) y 24 ms en escritorio (igual): muy por debajo de 200 ms; la diferencia de 8 ms está dentro del ruido. TBT: ≈ 55–100 ms antes y después.
- **Peso:** +8 a +9 KB transferidos por página (≈ +2–3 %): el ayudante de pedidos con plazo, los estados de error, el cambio de imagen y la pantalla de error. No se nota en el LCP medido.
- Los valores absolutos de «móvil lento» (LCP 2,4–3,3 s; 4,9 s la ficha con foto) son anteriores a este trabajo y no se atacaron aquí.

### `loading.tsx`: probado y descartado
Con el catálogo real y el perfil «móvil lento», 9 corridas por servidor (`docs/mediciones/resiliencia-ab-loading.txt`: una ronda completa con los tres servidores —base, rama con `loading.tsx`, rama sin `loading.tsx`— más una repetición del base que dio lo mismo; la rama sin `loading.tsx` equivale al base: 4888 ms):

| Página | Sin `loading.tsx` (base) | Con `loading.tsx` |
|---|---|---|
| Ficha con foto | LCP ≈ 4,88 s | LCP ≈ 5,80 s (+0,9 s) |
| Catálogo | LCP ≈ 2,5 s | LCP ≈ 2,8 s (+0,3 s) |

El esqueleto adelanta el primer pintado pero parte la respuesta en dos y la foto principal se descubre más tarde. Se retiró; las navegaciones lentas conservan el comportamiento anterior (la página vieja sigue visible hasta que llega la nueva).

## Medido vs. detectado solo por código
- **Medido / probado en un navegador (Chromium de Playwright):** todo lo listado en «Pruebas» y las tablas de mediciones. Las fallas fueron simuladas con `page.route` (demora, silencio, HTTP 500/502/429, aborto de red, módulo y fotos que fallan) y con un servidor real sin base de datos.
- **Detectado por lectura de código, no probado:** (a) `global-error.tsx` compila y se incluye en el build, pero **no se disparó** (requiere que falle el diseño raíz); (b) los banners de colección y las cartas destacadas del inicio no tienen reemplazo de imagen; (c) otras llamadas del navegador sin plazo (`account-provider`: sesión y favoritos, formulario de mayoristas y todo `/admin`) conservan el comportamiento anterior; (d) recuperación tras un despliegue con una pestaña vieja abierta (archivos de código con otro nombre) y fallas de Supabase/Storage reales; (e) comportamiento con `loading="lazy"` y restricciones de Safari/WebKit (la revisión de «imagen rota al montar» usa `complete`/`naturalWidth`, que difiere entre navegadores).
- **No se probó:** Safari/iOS, Android físico, teclado real de teléfono, lectores de pantalla, sesiones largas ni concurrencia.

## Limitaciones y pendientes
1. Aplicar `requestJson` al resto de las llamadas del navegador (cuenta, favoritos, mayoristas, admin).
2. Imagen de reemplazo en banners e inicio.
3. Probar en un iPhone y en un Android reales y medir con red/CPU reales (o con PageSpeed/CrUX cuando haya cuota y tráfico).
4. Probar `global-error` forzando un fallo del diseño en un entorno de pruebas.
5. Cinco pruebas de recorrido anteriores a este trabajo siguen fallando por expectativas desactualizadas del catálogo (ver arriba).
6. **Hallazgo fuera del alcance (capa de datos):** con un servidor al que **le falta la base de datos** (la prueba `caido`), la primera solicitud responde 500/503 en menos de un segundo, pero **las siguientes pueden quedar sin respuesta durante más de 100 s** (visto con `curl` y con el navegador, sobre PostgreSQL local; `postgres.js` con una sola conexión). En Netlify el límite de la función las cortaría antes (504) y no se vería la pantalla de error propia. No es un corte de red real hacia Supabase, así que no se sabe si ocurre igual; no se tocó `src/db`. Conviene un plazo propio en las consultas de las páginas.
7. Hay procesos de PostgreSQL embebido huérfanos de una sesión anterior en esta computadora (no son de este trabajo); no se detuvieron.
8. Transparencia del método: una primera serie de «catálogo real» se descartó porque los servidores comparados usaban catálogos distintos (una variable de entorno vacía se ignoró al iniciar); las tablas de arriba son de una segunda serie con los servidores verificados (fotos reales presentes en el HTML).

## Cómo reproducir
```bash
npm run verify                          # typecheck + lint + catálogo + Vitest
npx playwright test tests/e2e/resiliencia.spec.ts tests/e2e/resiliencia-imagenes.spec.ts   # E2E_SERVERS=resil,caido,real para levantar solo esos servidores
BASE=http://localhost:3300 RUNS=5 node scripts/medir-resiliencia.mjs     # contra un `next start` local con base descartable
BASE=http://localhost:3300 node scripts/capturas-resiliencia.mjs         # capturas → docs/capturas/resiliencia/
```
Capturas: `docs/capturas/resiliencia/` (360, 390, 430 px y escritorio). Datos crudos: `docs/mediciones/resiliencia-*.json` y `resiliencia-*.txt` (registro de la medición final y del A/B de `loading.tsx`).
