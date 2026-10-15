# CONTINUIDAD — cómo retomar el proyecto desde cero

Documento autosuficiente para continuar en otra sesión sin el historial de esta conversación. Complementa (no reemplaza) `CLAUDE.md` (reglas permanentes), `docs/ESTADO.md` (estado por hitos) y `docs/COLECCIONES.md` (detalle del lote).

Última actualización: 12 de octubre de 2026. Rama `feature/tienda-pokemon`, último commit del lote: `d4a8421`. Árbol de trabajo limpio al momento de escribir esto (salvo este archivo, que se commitea aparte). No hay remoto `origin`: solo commits locales. **Nada está publicado.**

---

## 1. Estado actual y arquitectura

**Qué es:** tienda Pokémon TCG de un solo vendedor (sellados japoneses, venta coordinada por WhatsApp). Sin pagos en línea, sin panel de productos: el catálogo se edita **en código/archivos**. Español rioplatense, moneda ARS.

**Pila:** Next.js 16.4 (App Router, Turbopack) · React 19 · Tailwind 4 · TypeScript 5.9 · Zod 4 · Drizzle + better-sqlite3 · Better Auth 1.7 · Vitest 5 · Playwright + axe-core · sharp.

**Hitos:** 1–5 aprobados/implementados (base, catálogo, carrito y consulta, cuentas, integración final). Sobre eso se integró el **lote de colecciones** (esta sesión), **pendiente de revisión del dueño**.

**Capas relevantes:**
- `src/content/schema.ts` — esquemas del catálogo (imágenes con estado `final|demo|reference`, `opaque`, precio/stock **nulables**, composición, extras de expansión).
- `src/content/catalog.ts` — elige catálogo: `CATALOG_FIXTURE=demo` → catálogo ficticio (solo pruebas); si no → **catálogo real**. Exporta también `demoCatalog` y `realCatalog`.
- `src/content/real/` — catálogo real: `expansions.ts` (cartas desde JSON), `products.ts` (16 SKU), `guarantees.ts`, `sources.ts`, `pull-rates.ts` (vacío), `search-groups.ts`, `commercial.json` (precios/stock por SKU, hoy `items: {}`), `index.ts`.
- `src/content/fixtures/demo/` — catálogo ficticio (antes `src/content/*`), solo pruebas.
- `src/content/colecciones/` — datos del lote: `origen/` (paquete original: `colecciones.json`, `productos-pendientes.json`, `imagenes-productos.json`), `cartas/<id>.json` (rastreo oficial), `imagenes.json` (24 fotos + sha256), `imagenes-cartas.json`.
- `src/features/catalog/` — `commercial.ts` (`commercialState`: pending/soldout/available), `commercial-import.ts` (parser del CSV), `coverage.ts` (completa/parcial por numeración), `rarity.ts` (ícono → rareza), `query.ts`, `validate.ts`, `data.ts`, `pull-rates.ts`.
- `src/features/inquiries/` — `pricing.ts` y `service.ts`: el servidor recalcula precios y rechaza SKU pendientes con **409 `pending_commercial`**.
- UI: `src/components/{product-image,product-card,cart-widgets,cart-view,card-gallery}.tsx`; páginas `src/app/{sellados,expansiones,expansiones/[slug],productos/[slug]}`.
- `next.config.ts` — redirecciones de URLs viejas de la demo (solo con catálogo real).
- Cuentas, consultas, WhatsApp, correo local, backups: **sin cambios** en esta sesión (ver `docs/CUENTAS.md`, `docs/OPERACION.md`).

---

## 2. Modificaciones de esta sesión (resumen)

1. Se separó el catálogo ficticio (a `fixtures/demo`) del catálogo real; `catalog.ts` conmuta por variable de entorno.
2. Precio y stock pasaron a poder ser `null` = **pendiente** (no 0). UI: «Precio a confirmar» / «Disponibilidad a confirmar», botón «Agregar al carrito» deshabilitado; carrito con aviso (`data-testid="aviso-pendiente"`); servidor rechaza con 409.
3. Alta de 8 expansiones y 16 productos (caja y sobre por separado) con composición física y garantías con fuente.
4. Integración de 24 fotos originales (formato nativo, `contain`, caja cerrada principal, caja con exhibidor secundaria).
5. Rastreo del buscador oficial de cartas (caché + solicitudes acotadas y secuenciales) y descarga/convertido de 1174 imágenes de cartas a WebP 360 px.
6. Galería «completa» solo si la numeración es contigua sin huecos y el total coincide con la fuente; si no, «Galería parcial» documentando faltantes.
7. Planilla del dueño `datos/precios-y-stock.csv` + importador `npm run precios:importar`.
8. `catalog:check` y `release:check` actualizados (nuevos bloqueantes: precios/stock pendientes, permiso de imágenes).
9. Pruebas nuevas: `tests/colecciones.test.ts` (unitarias) y `tests/e2e/colecciones.spec.ts` (catálogo real); `playwright.config.ts` ahora levanta **3 servidores**.
10. Documentación: `docs/COLECCIONES.md` (nuevo), `ESTADO`, `OPERACION`, `CATALOGO`, `DECISIONES`, `ASSETS-PENDIENTES`, `PENDIENTES-PUBLICACION`, `README`.
11. Capturas del lote: `docs/capturas/col-*` (escritorio y móvil 390) generadas con `scripts/capturas-colecciones.mjs`.

---

## 3. Las ocho colecciones

Todas: idioma japonés, región JP. Un SKU de caja y uno de sobre por colección. SKU = `<código>-JP-BOX` / `<código>-JP-BOOSTER` (p. ej. `SV11B-JP-BOX`; códigos exactos en `datos/precios-y-stock.csv`).

| Id (expansión) | Código | Lanzamiento | Cartas | Lista | Falta |
| --- | --- | --- | --- | --- | --- |
| `black-bolt` (estándar, no Deluxe) | SV11B | 2025-06-06 | 174 | completa | — |
| `white-flare` (estándar, no Deluxe) | SV11W | 2025-06-06 | 174 | completa | — |
| `heat-wave-arena` | SV9a | 2025-03-14 | 92 | completa | — |
| `inferno-x` | M2 | 2025-09-26 | 116 | completa | — |
| `mega-dream-ex` | M2a | 2025-11-28 | 250 | completa | — |
| `30th-celebration` | M6a | 2026-09-16 | 140 | **parcial** | n.º 104–135 y 151; 8 Energías sin número |
| `storm-emeralda` | M6 | 2026-07-31 | 110 | **parcial** | n.º 071, 073, 075 |
| `abyss-eye` | M5 | 2026-05-22 | 118 | completa | — |

- **Ids/slugs de producto:** `<colección>-caja` / `<colección>-sobre`, **salvo Storm Emeralda**, cuyos ids históricos `storm-caja` y `storm-sobre` se conservaron (favoritos y consultas guardadas). Su slug de URL es `storm-emeralda-caja` / `storm-emeralda-sobre`. Verificar siempre en `src/content/real/products.ts`.
- **Imágenes de producto** (`public/images/products/<colección>/`): `caja-referencia-1-original.*`, `caja-referencia-2-original.*`, `sobre-original.*` (jpg/png nativos). Caja: principal = caja cerrada, secundaria = con exhibidor; sobre: una imagen. Baja resolución en los sobres de Black Bolt y White Flare. Estado `reference`: **sin permiso concedido**.
- **Imágenes de cartas:** `public/images/expansions/<id>/cards/<cardId>.webp` (360×504).
- **Garantías de composición** (`real/guarantees.ts`): `g-<id>-contenido` (físico) por producto; `2-brillantes` (Black Bolt, White Flare, por sobre), `1-ex` (MEGA Dream ex, por sobre), `pikachu-energia` y `todas-brillantes` (30th CELEBRATION). Sin garantías de rareza ni promos de Pokémon Center ni Deluxe/AR. **Sin tasas de aparición** (`pull-rates.ts` vacío).

---

## 4. Archivos creados y modificados (lote; commit `d4a8421`)

**Nuevos:** `CONTINUIDAD.md` · `datos/precios-y-stock.csv` · `docs/COLECCIONES.md` · `public/images/products/**` (24) · `public/images/expansions/**` (1174 WebP) · `scripts/colecciones/{config,obtener-cartas,descargar-imagenes-cartas,registrar-imagenes}.mjs` · `scripts/importar-precios.ts` · `scripts/capturas-colecciones.mjs` · `src/content/catalog.ts` (nuevo, reemplaza al movido) · `src/content/colecciones/**` · `src/content/real/**` · `src/features/catalog/{commercial,commercial-import,coverage,rarity}.ts` · `tests/colecciones.test.ts` · `tests/e2e/colecciones.spec.ts` · `docs/capturas/col-*`.

**Movidos a `src/content/fixtures/demo/`:** `expansions`, `guarantees`, `helpers`, `index` (antes `catalog.ts`), `products`, `pull-rates`, `sources`.

**Modificados:** `next.config.ts`, `package.json` (scripts `precios:importar`, `colecciones:cartas`, `colecciones:imagenes`), `playwright.config.ts`, `tsconfig.json`, `vitest.config.mts` (env `CATALOG_FIXTURE=demo`), `scripts/{catalog-check,release-check}.ts`, `src/content/schema.ts`, `src/features/catalog/{data,pull-rates,query,validate}.ts`, `src/features/inquiries/{pricing,service}.ts`, `src/components/{card-gallery,cart-view,cart-widgets,product-card,product-image}.tsx`, `src/app/{expansiones/page,expansiones/[slug]/page,productos/[slug]/page,sellados/page}.tsx`, `tests/{catalog,inquiries}.test.ts`, `tests/e2e/{catalogo.spec,global-setup}.ts`, `README.md`, `docs/*`.

No versionado (ignorado): `.local/` (caché del rastreo oficial en `.local/cache`, bases, correo de pruebas), `.next*`, `node_modules`.

---

## 5. Qué funciona y qué falta verificar

**Verificado en esta sesión (ejecutado):**
- `npm run verify`: typecheck, lint, `catalog:check` (sin errores) y 85 pruebas unitarias.
- `npx playwright test` completo: 218 pasadas y 2 fallas (texto viejo de garantías); se actualizó la prueba y esas 2 se re-ejecutaron en verde. 5 omitidas por diseño. **No se re-ejecutó la suite completa tras ese último ajuste.**
- Catálogo real: 50 pruebas e2e (escritorio y móvil) de caja/sobre sin duplicar, filtros JP, imágenes correctas, SKU pendiente no comprable, fuentes de garantías, coherencia galería parcial/completa.
- Capturas: sin desborde horizontal (1440, 390, 320), sin errores de consola, sin imágenes rotas.
- Servidor de desarrollo en :3000 sirviendo el catálogo real.

**Sin verificar / no hecho:**
- `npm run build` de producción **no se ejecutó de forma aislada** (los e2e sí construyen en `.next-e2e-*`) y `npm run smoke` no se volvió a correr tras el lote.
- Compra completa con precio real: no se probó con datos reales (todo pendiente); el flujo con importe se prueba solo con el catálogo ficticio.
- Importación real de un CSV con datos: probada con pruebas unitarias del parser, no con precios definitivos.
- Sin prueba con lector de pantalla; sin Lighthouse; rendimiento no remedido con las 1198 imágenes (`node scripts/rendimiento.mjs`).
- El WhatsApp con número real nunca se probó (no hay número; modo demo).
- Vigencia de las URLs oficiales: consultadas el 12/10/2026; pueden cambiar.

---

## 6. Problemas detectados y decisiones técnicas

- **Código del buscador de Heat Wave Arena**: el paquete traía `pg=922` (otra expansión, SV7a); corregido a `pg=940` (`scripts/colecciones/config.mjs`).
- **Unicode**: un nombre (Abyss Eye) fallaba por caracteres descompuestos → comparación NFKC y nombres NFC.
- **Precio nulo** forzó helpers de comercial y manejo de `null` en pricing/query/UI/ficha.
- **No hay segunda «Storm Emeralda»**; no hay Deluxe ni packs mixtos ni accesorios.
- **Decisiones** (también en `docs/DECISIONES.md`): pendiente = `null`, no 0 · galería «completa» solo si es verificable · imágenes `reference` (el enlace no concede permiso) · rareza solo por ícono oficial (contrastada con JSON oficial M5/M6) · variantes de acabado no se listan · fixture solo para pruebas · servidores e2e aislados (:3100 demo, :3101 WhatsApp de prueba, :3102 real) con `MAIL_TRANSPORT=local` solo ahí · esperar condiciones observables (`data-hydrated="true"`), nunca subir timeouts.
- **Entorno Windows:** no hay Python; los heredocs de Bash con comillas fallan → usar el tool Write + scripts `.mjs` temporales. `next-env.d.ts` debe apuntar a `.next`; tras los e2e lo restaura `tests/e2e/global-teardown.ts` (si un build manual con `NEXT_DIST_DIR` lo cambia, `git checkout next-env.d.ts`). `npm run smoke` detecta solo si el servidor usa catálogo real o de prueba.

---

## 7. Tareas pendientes (por prioridad)

**Alta — depende del dueño**
1. Revisar y aprobar el lote (visual y de contenido).
2. Precios (ARS enteros) y stock de los 16 SKU en `datos/precios-y-stock.csv`; luego `npm run precios:importar` (revisión) y `npm run precios:importar -- --write` y `npm run catalog:check`.
3. Permiso de uso de las 1198 imágenes (24 producto + 1174 cartas) o fotos propias del inventario (pasar a `status: "final"` con `origin` y `license`).
4. Número de WhatsApp real, nombre/logo definitivos, datos legales, imágenes del inicio (6) — ver `docs/PENDIENTES-PUBLICACION.md` (ítems 1–10, 21–24).

**Media — técnico**
5. Correr `npm run build`, `npm run smoke` y la suite e2e completa de nuevo sobre el estado final.
6. Completar galerías parciales cuando la fuente oficial lo permita (`npm run colecciones:cartas` y `colecciones:imagenes`).
7. Remedir rendimiento con las imágenes reales; mejorar los sobres de Black Bolt/White Flare si se consiguen archivos mejores.
8. Cargar tasas de aparición solo con fuente oficial u observación documentada.

**Baja / publicación (solo con instrucción del dueño)**
9. Hosting, dominio, correo transaccional, variables de producción, backups programados (`docs/DESPLIEGUE.md`). `npm run release:check` hoy: 11 bloqueantes.
10. Prueba con lector de pantalla y revisión en celular real.

---

## 8. Cómo continuar desde otra sesión

```bash
git status && git log --oneline -5            # esperado: rama feature/tienda-pokemon, commit d4a8421 o posterior
npm ci                                         # .npmrc ya usa ignore-scripts (better-sqlite3 con binarios precompilados)
npm run db:migrate
npm run verify                                 # typecheck + lint + catalog:check + 85 pruebas
npm run dev                                    # http://localhost:3000 (catálogo real)
npm run release:check                          # lista de bloqueantes
npx playwright install chromium                # una vez
npx playwright test                            # 3 servidores aislados sobre build de producción (~1.5 min)
node scripts/capturas-colecciones.mjs          # requiere el dev server en :3000
```

Reglas que no hay que perder: nada de datos inventados (precios, stock, tasas, teléfono); no publicar ni contratar; no push (no hay `origin`); no commitear `.env`, bases, tokens ni `.local/`; no usar force-push ni reescribir historia; comprobar que todo SKU pendiente siga sin ser comprable; actualizar `docs/ESTADO.md` al cerrar cada tarea; responder en español rioplatense y pedir revisión humana solo al completar un hito. Si cambian los ids de producto, mantener redirecciones y no romper consultas/favoritos existentes.

---

## Actualización 13/10/2026

- **Inicio** rediseñado (banner, Cajas/Sobres, Packs «Próximamente», expansiones, paleta esmeralda y oro, fotos recortadas con registro): ver `docs/CAMBIOS-HOME-Y-PAGOS.md`.
- **Panel `/admin`** (precio, stock, máximo por pedido, visibilidad, historial): ver `docs/ADMIN.md`. Requiere `ADMIN_EMAIL`; `product_overrides` reemplaza por producto a `commercial.json`. Las páginas con precios son dinámicas. `playwright.config.ts` levanta ahora **4 servidores** (:3100 demo, :3101 WhatsApp, :3102 real, :3103 admin).
- Cambio de alcance registrado en `CLAUDE.md`: el panel de precios/stock ya no está fuera de alcance.
- **Banner nuevo (13/10/2026):** `src/components/home-hero.tsx` con arte registrado en `imagenes-inicio.json`; Cajas = Inferno X + MEGA Dream ex, Sobres = Black Bolt + White Flare; clases `kicker`, `title-rule`, `link-arrow`, `btn-cut`, `panel-cut`, `card-zoom` en `globals.css`. Ver `docs/CAMBIOS-HOME-Y-PAGOS.md` (séptima revisión).
- **Carrusel de banners (13/10/2026):** `src/content/banners.ts`, `collection-banner.tsx`, `home-carousel.tsx`; arte en `public/images/inicio/hero-<id>.webp`. Pruebas en `tests/e2e/colecciones-banners.spec.ts`.
- **Galerías y etiquetas (13/10/2026):** `product-tags.tsx` (colección e idioma), galería con `source`/`view` en el esquema de imagen, `store-photos.json` para fotos propias (vacío). Ver `docs/GALERIAS.md`.
