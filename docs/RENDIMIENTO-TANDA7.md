# Rendimiento: antes y después (tanda 7, 15/10/2026)

**Son mediciones de LABORATORIO**, no datos de usuarios reales: Chromium de Playwright sobre un **build de producción local** (`next start`), con la **base de desarrollo local** (PostgreSQL embebido, datos de prueba) y la red/CPU emuladas. No garantizan los mismos tiempos en Netlify (otra red, funciones serverless con arranque en frío, Supabase remoto). No hay datos de campo (CrUX/RUM) de la tienda. **TBT no es INP**: se informa aparte y no se presenta como respuesta a interacciones.

- Perfil «escritorio»: 1350×940, sin límites. Perfil «celular de gama baja»: 390×844, **CPU 6× más lenta**, red 1,6 Mb/s de bajada con 150 ms de latencia.
- Mismas condiciones, mismo script (`scripts/medir-rendimiento.mjs`), **mediana de 5 corridas** (7 en la verificación móvil). «Antes» = commit `29f0b0b` (código original más las herramientas de medición), «después» = rama `feature/carrito-ventas-rendimiento`. Resultados crudos en `docs/mediciones/*.json`.
- Referencias: LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms.

## Carga de páginas (antes → después)
| Página | Perfil | LCP ms | CLS | JS KB (gz) | Imágenes KB | Consultas a la base |
|---|---|---|---|---|---|---|
| Inicio | escritorio / móvil | 212→208 / 1444→1412 | 0 / 0 | 153→156 | 709→709 / 333→333 | **26→17 / 20→11** |
| Catálogo | escritorio / móvil | 172→204 / 1200→1308 | 0 / 0 | 150→153 | 345→345 / 220→220 | 20→17 |
| Ficha | escritorio / móvil | 228→216 / 1460→1660* | 0 / 0 | 156→159 | 90→90 | **10→4** |
| Pedido (/carrito) | escritorio / móvil | 100→100 / 932→920 | **0,126→0,057 / 0,207→0,169** (0,094→0,040 con carrito de productos agregados recientemente) | 195→210 | 40→40 | 13→13 |
| Admin (/admin) | escritorio / móvil | 184→160 / 1200→1488* | 0 / 0 | 156→159 | **4479→121 / 187→3** | 9→9 |
| Admin · Ventas (nueva) | escritorio / móvil | 136 / 1020 | 0 | 151 | 0 | 10 |

\* Los LCP y TBT del celular **varían entre corridas más que las mejoras que se buscan**: la verificación con 7 corridas dio, antes→después, inicio 1744→1580, catálogo 1264→1216, ficha 1584→1604, pedido 920→900, admin 1388→1416 ms de LCP y TBT 251→172, 206→172, 199→200, 322→348, 209→232 ms. Conclusión honesta: **no hay mejora ni empeoramiento demostrables en LCP/TBT del celular**; todas las páginas quedan por debajo de 2,5 s de LCP en este laboratorio. El TBT del pedido es el más alto (≈ 350 ms en un celular 6× más lento) y no se resolvió.

## Interacciones guionadas (latencia de laboratorio; el peor evento medido con Event Timing)
Antes, el ícono del carrito navegaba a `/carrito`; ahora abre el panel. Mediana en ms.
| Gesto | Escritorio antes → después | Celular antes → después |
|---|---|---|
| Agregar desde tarjeta: contador visible | 47 → 48 | 90 → 100–190 (varía) |
| Agregar: evento más lento | 24 → 24 | 16 → 32–72 |
| Abrir el carrito (hasta ver los productos) | 123 (página) → 361 (panel) | 927 (página) → 945 (panel) |
| Abrir el carrito: primer feedback visible | — → 34 | — → ≈ 180 |
| Cambiar cantidad | 52 → 22 | 108 → 66–156 |
| Quitar producto | 23 → 25 | 46 → 50–70 |
| Evento más lento en estos gestos | 16–32 → 16–24 | 16–56 → 24–72 |

Todos los gestos quedan **muy por debajo de 200 ms de duración de evento**. Es la duración del evento de un gesto guionado, **no el INP de la página en uso real**. «Contenido del panel visible» tarda más que antes en escritorio (≈ 360 ms) porque el panel valida con el servidor y se descarga aparte; por eso el panel muestra al instante un marco («Cargando…») y los precios llegan después.

## Qué se cambió y por qué (según lo medido)
1. **Admin: miniaturas.** La lista cargaba las fotos originales como miniaturas (**4,5 MB** en escritorio). Ahora usan el optimizador a 96 px (**121 KB**).
2. **Consultas repetidas.** Cada página armaba el catálogo completo (cotización + valores del panel + galerías = 3 consultas) varias veces. Ahora se arma una vez por pedido de página (`cache` de React): inicio 26→17 / 20→11, ficha 10→4. No se memoriza entre pedidos: un cambio del panel se ve en el pedido siguiente.
3. **Pedido: saltos de diseño.** CLS 0,126→0,057 en escritorio. La causa eran el texto «Verificando…» que desaparecía, el aviso de cotización que aparecía y el título/idioma de cada línea que llegaban después. Ahora esos huecos están reservados y la línea muestra el título guardado al agregar. Además se detectó que, mientras la página se movía, un toque en «Continuar» podía caer fuera del botón (mala experiencia real, no solo de pruebas).
4. **Una sola validación con el servidor** compartida por el panel y el pedido (un pedido por contenido del carrito, no dos).
5. **Tarjetas del catálogo:** ya no se redibujan todas juntas cuando cambia otra cosa del carrito (solo la del producto afectado).
6. **JavaScript:** el panel lateral se descarga aparte, solo cuando hay productos en el carrito (en un tiempo libre) o al acercarse al ícono o a un botón de agregar. Las etiquetas de idioma/formato salieron de `schema.ts` (que arrastra zod) a `labels.ts`. Resultado: +3 KB en las páginas públicas (153→156) y +15 KB en el pedido, que sí necesita el panel y la validación.

## Lo que NO se hizo / límites
- No se midió en teléfonos físicos ni en Safari de iPhone (solo Chromium emulado), ni en Netlify, ni con datos reales de usuarios.
- No se midió el servidor bajo carga simultánea. Con Supabase en la conexión de sesión (5432) y `DATABASE_POOL_MAX=1`, menos consultas por página también significa menos espera en una sola conexión, pero no se probó en producción.
- Las imágenes del inicio (709 KB en escritorio) no se tocaron: el LCP ya está por debajo de la referencia y se cargan de forma diferida.
- El TBT del pedido en celular de gama baja (≈ 350 ms) queda como oportunidad (validación de formulario con zod en el navegador).

## Cómo repetirlo
```bash
npm run dev:db                         # otra terminal: base local de desarrollo
npm run precios:cargar -- --write && npm run dev:datos && npm run dev:admin
npm run build && DB_QUERY_LOG=.local/dbq.log npx next start -p 3300
BASE=http://localhost:3300 ETIQUETA=medicion RUNS=5 node scripts/medir-rendimiento.mjs
```
