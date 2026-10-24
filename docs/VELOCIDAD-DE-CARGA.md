# Velocidad de carga (23/10/2026)

Pedido del dueño: que la tienda cargue más rápido, sobre todo en celulares con conexión lenta. Rama `perf/velocidad-de-carga`, sobre `fix/resiliencia-carga` (`808c8d4`).

**Alcance de las mediciones.** Todas son de **laboratorio local**: build de producción (`next start`) con PostgreSQL embebido descartable, Chromium con CPU y red limitadas por CDP (móvil: 4× CPU, 150 ms, 1,6 Mbit/s; móvil lento: 4× CPU, 400 ms, 0,4 Mbit/s; escritorio sin límites). No son usuarios reales, ni un iPhone, ni el hosting (Netlify/Supabase). WebKit se probó como motor de laboratorio, no como un iPhone.

## Qué demoraba y qué se cambió

| Causa | Cambio | Resultado |
|---|---|---|
| Cada página hacía 5 consultas a la base (la de cotización, duplicada) en 3 tandas seguidas | Una sola consulta por pedido (`src/features/catalog/page-data.ts`, `src/features/fx/request.ts`). Mismos datos, leídos en cada pedido | Con una base «lejana» simulada (25 ms por sentido): respuesta tibia 0,465 s → 0,145 s; primera solicitud ≈0,9 s → 0,42 s. *Medido en la sesión anterior; no se repitió hoy.* |
| Cada conexión nueva consultaba los tipos de la base | `fetch_types: false` en `src/db/client.ts` (el esquema no usa arreglos) | Una consulta menos por conexión nueva |
| `zod` (≈31 KB gzip) viajaba al navegador por el carrito, el formulario de mayoristas y el de consultas manuales | Validación de entrega sin dependencias en `src/features/inquiries/delivery.ts` (prueba de paridad con 21 mil casos); los componentes importan de `delivery.ts` y `labels.ts` | JS del carrito 214 → **181 KB** transferidos. No llegó a los ≈167 KB previstos: el resto es código propio del carrito |
| Las fotos fuera de pantalla competían por el ancho de banda con el JavaScript | `SafeImage` pide las fotos no prioritarias a 400 px de entrar en pantalla, con un recuadro del mismo tamaño y texto alternativo hasta entonces | Ver tabla. Los banners del carrusel se piden sin esperar (el carrusel ya decide cuándo cargarlos) |

## Resultados (medición intercalada)

**Cuántas corridas.** Cada celda es la **mediana de 7 corridas** de una pasada, con su rango (mín–máx) entre paréntesis. Hubo **2 pasadas por versión** (línea base `808c8d4` y build final, alternadas: base, final, base, final), o sea **14 corridas por versión, página y perfil**. Las dos pasadas de cada lado coinciden entre sí con una diferencia de 1–3 %, mucho menor que el efecto en el inicio y el catálogo. Valores en ms; «hidratada» = la página ya responde.

Se alternaron las versiones en la misma sesión porque entre sesiones la máquina tuvo una deriva mayor que el efecto: una primera medición «después» contra el «antes» guardado salió peor en todo, incluso en escritorio donde el código no cambió. **Esa comparación no se usa** (`perf-despues-*.json` y `perf-antes-*.json` quedan como registro de ese intento; los datos válidos son `perf-ab-*.json`).

| Perfil | Página | Antes, pasada 1 | Antes, pasada 2 | Después, pasada 1 | Después, pasada 2 | Imágenes KB antes → después |
|---|---|---|---|---|---|---|
| móvil lento | inicio | 10840 (10736–11065) | 10713 (10573–10764) | 7879 (7845–7938) | 7778 (7775–7884) | 357 → 218 |
| móvil lento | catálogo | 8809 (8481–9094) | 8623 (8529–8787) | 5557 (5497–5692) | 5455 (5435–5512) | 345 → 135 |
| móvil lento | carrito | 6288 (6232–6609) | 6434 (6395–6527) | 5809 (5776–5825) | 5704 (5696–5751) | 30 → 30 |
| móvil lento | ficha Storm Emeralda | 6632 (6421–6958) | 6565 (6547–6595) | 6512 (6481–6549) | 6444 (6414–6498) | 46 → 44 |
| móvil | inicio | 2855 (2750–3243) | 2967 (2869–3393) | 2418 (2331–2678) | 2276 (2243–2511) | 302 → 218 |
| móvil | catálogo | 2248 (2005–2766) | 2370 (2192–2442) | 1756 (1747–1906) | 1685 (1662–1775) | 220 → 135 |
| móvil | carrito | 2326 (2287–2525) | 2105 (2073–2244) | 1840 (1807–1911) | 1775 (1762–1809) | 30 → 30 |
| móvil | ficha Storm Emeralda | 2312 (2096–2505) | 2070 (2001–2138) | 2018 (1972–2126) | 1936 (1899–1975) | 46 → 44 |


Escritorio (7 + 7 corridas, sin límites de red ni CPU): las diferencias (p. ej. inicio, hidratada 245/202 → 224/141 ms) están **dentro del ruido**; no se declara mejora. CLS: 0 antes y después. TBT y LCP en móvil y móvil lento: iguales o algo mejores, salvo la ficha en móvil lento (sin cambio).

**Peso total del JavaScript del carrito** (transferido, comprimido, incluye los fragmentos compartidos de la tienda; idéntico en las 14 corridas de cada versión): **214 KB antes → 181 KB después** (−33 KB, el chunk de `zod`). Inicio y ficha: 167 KB; catálogo: 163 KB (sin cambio). Quedan 14 KB de CSS y 38 KB de tipografías en todas las páginas.

**Imágenes: qué se mide y qué no.** La columna «Imágenes KB» es lo que la página **descargó hasta quedar en reposo sin hacer scroll** (red inactiva + 1,2 s). Incluye la foto principal/primer banner (prioritarias), las que están en pantalla o a menos de 400 px, y el banner contiguo del carrusel. **Las fotos de más abajo no se eliminaron: se piden recién cuando la persona se acerca al lugar donde aparecen.** Es decir, no es un ahorro de bytes totales, sino bytes que dejan de competir con el JavaScript durante la carga; quien recorre toda la página termina descargando lo mismo. Mientras una foto diferida espera se muestra un recuadro del mismo tamaño (sin saltos de diseño, CLS 0) y con el mismo texto alternativo. En el catálogo en móvil lento la cifra «después» (135 KB) es la de las tarjetas que caben en la primera pantalla; el resto llega al hacer scroll.

## Lo que no mejoró

- **Ficha de producto en conexión lenta**: LCP ≈4,88 s antes y después. Está limitada por el ancho de banda (documento 26 KB, CSS 14, tipografías 38, JS 167 y la foto 41 comparten ≈50 KB/s). Solo bajaría con menos bytes previos, HTTP/2 y una CDN.
- **Inicio en móvil lento**: las imágenes quedan en 218 KB (no 128 KB) porque el carrusel pide a propósito el banner siguiente.
- **JS del carrito**: 181 KB, no ≈167.

## Descartado

- **AVIF en lugar de WebP**: ahorro ≈15 % con calidad no demostrada; no se aplica.
- **`fetchPriority="high"` en la foto principal**: el laboratorio (HTTP/1.1) no puede medir prioridades; no se aplica.
- **Más división de JavaScript**: ganancia esperable <10 KB, dentro del ruido.
- **Hacer `/carrito` estática**: hoy es dinámica solo para leer `WHATSAPP_NUMBER` al responder. Ahorraría ≈0,2 s de TTFB en producción, no medible en laboratorio; no se tocó.

## Depende de la red y del hosting (no se puede resolver en el código)

Lecturas moderadas del sitio publicado (`.local/perf/prod-curl.txt`, sin generar pedidos): HTML con Brotli (≈30 KB); TTFB 0,5–0,8 s en páginas dinámicas, 0,3–0,5 s en estáticas y 1,5–5 s en la primera petición fría; `Cache-Control: private,no-cache` en las dinámicas. La latencia de la función y de la base en producción domina el TTFB; la mejora de consultas ayuda pero no se midió contra Supabase real.

## Verificación

- `npm run verify`: tipos, lint, catálogo y 543 pruebas OK (1 omitida).
- Playwright completo con WebKit (`E2E_WEBKIT=1`): **625 OK, 9 omitidas por diseño, 0 fallas** (incluye las 6 pruebas nuevas de fotos sin JavaScript). En una primera corrida fallaron 2 pruebas (4 con el proyecto móvil) por las imágenes diferidas: se corrigieron (carrusel con `loading="eager"`; espera de carga en la prueba del inicio).
- Anchos 360 / 390 / 430 / 1366 px: 0 desbordes horizontales (`docs/mediciones/velocidad-anchos.json`). Capturas en `docs/capturas/velocidad/`.
- **Fotos sin JavaScript**: cada foto diferida lleva, junto a su recuadro, la misma foto optimizada (`next/image`, mismo `srcset`, mismas dimensiones) dentro de `<noscript>`; un estilo en `<noscript>` del `<head>` oculta el recuadro y vuelve transparente el `<noscript>` para el diseño (`display: contents`; sin eso, dentro de un contenedor flex la foto perdía su altura definida). Con JavaScript el navegador no interpreta el contenido de `<noscript>`: no crea la imagen ni la descarga, y al acercarse la foto reemplaza el recuadro. Probado (`tests/e2e/resiliencia-imagenes-sin-js.spec.ts`, escritorio y móvil, catálogo real): con JavaScript, inicio y catálogo piden cada foto una sola vez y no hay `<img>` dentro de `<noscript>` en el DOM; sin JavaScript, `/sellados` muestra las fotos por el optimizador, el recuadro queda oculto, las seis primeras tarjetas miden igual que con JavaScript (p. ej. 290×210 y 296×224 px en escritorio) y no hay desborde horizontal. La alternativa no se midió en velocidad (no cambia lo que se descarga con JavaScript). Las fotos prioritarias y las del carrusel no usan este mecanismo.

## Cómo repetir

```
BASE=http://localhost:PUERTO PERFIL=regex PAGINA=regex RUNS=7 OUT=archivo.json node scripts/medir-carga.mjs
```

Exige `localhost`. Para comparar, medir línea base y build nuevo alternados en la misma sesión.
