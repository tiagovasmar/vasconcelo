# Lote de colecciones japonesas (catálogo real)

Integrado desde `outputs/colecciones-para-claude/`. El catálogo real tiene **8 expansiones y 16 fichas** (una caja y un sobre individual por colección, siempre separados). Todos los precios y el stock están **pendientes**: las fichas se ven como «Precio a confirmar» / «Disponibilidad a confirmar» y el servidor rechaza consultas con importe para esos SKU (409 `pending_commercial`). Nunca se muestra $0 ni «agotado» inventado.

## Cobertura de cartas por colección

Las cartas salen del buscador oficial (pokemon-card.com), consultado el 12 de octubre de 2026. «Completa» significa: numeración contigua sin huecos y cantidad igual a la de la fuente. Si no, la ficha muestra «Galería parcial» y dice qué falta.

| Colección | Código | Cartas | Estado | Falta |
| --- | --- | --- | --- | --- |
| Black Bolt | SV11B | 174 | completa | — |
| White Flare | SV11W | 174 | completa | — |
| Heat Wave Arena | SV9a | 92 | completa | — |
| Inferno X | M2 | 116 | completa | — |
| MEGA Dream ex | M2a | 250 | completa | — |
| Abyss Eye | M5 | 118 | completa | — |
| Storm Emeralda | M6 | 110 | **parcial** | n.º 071, 073 y 075 (no figuran en la fuente) |
| 30th CELEBRATION | M6a | 140 | **parcial** | n.º 104–135 y 151; 8 Energías básicas sin número |

Total: 1174 cartas con imagen. La rareza se toma del ícono del buscador oficial y se contrastó con el JSON oficial de M5/M6; donde no hay ícono no se informa. Las variantes de acabado (espejo, etc.) no se listan. **No hay tasas de aparición** (no se cargó ninguna: sin dato, «Dato no disponible»).

## Correcciones respecto del paquete
- Heat Wave Arena: el paquete indicaba `pg=922`, que pertenece a otra expansión (SV7a). Se corrigió a `pg=940` (`scripts/colecciones/config.mjs`).
- No existe una segunda «Storm Emeralda»: una sola expansión (M6) con su caja y su sobre.
- Black Bolt y White Flare son las ediciones **estándar**, no Deluxe; no hay packs mixtos ni accesorios.

## Garantías de composición (solo con fuente y alcance exacto)
Cada ficha tiene su garantía de contenido físico. Además: 2 cartas brillantes por sobre (Black Bolt, White Flare), 1 carta ex por sobre (MEGA Dream ex) y, en 30th CELEBRATION, 1 Pikachu especial y 1 Energía (+ todas brillantes), según el texto del envase o la página oficial. No hay garantías de rareza ni de promos de Pokémon Center, ni de Deluxe o AR.

## Imágenes
- **24 fotos de producto** (por colección: caja cerrada, caja con exhibidor, sobre) en `public/images/products/<colección>/*-original.*`, conservadas en su formato nativo con sha256 (`src/content/colecciones/imagenes.json`, generado por `scripts/colecciones/registrar-imagenes.mjs`). Caja cerrada = principal. Se muestran con `contain`.
- **1174 imágenes de cartas** (WebP 360 px) en `public/images/expansions/<id>/cards/`.
- Estado de todas: `reference` (foto/carta oficial de referencia). **El enlace de origen no concede permiso de uso**; mientras no haya permiso o fotos propias, `npm run release:check` lo informa como bloqueante. No se generó arte.
- Las imágenes de sobre de Black Bolt y White Flare tienen baja resolución en el paquete; se ven más blandas.

## Cómo actualizar
- Cartas: `npm run colecciones:cartas` (rastreo secuencial con caché en `.local/cache`; escribe `src/content/colecciones/cartas/*.json`) y `npm run colecciones:imagenes`. Después `npm run catalog:check`.
- Precios y stock: ver [OPERACION.md](OPERACION.md) (planilla `datos/precios-y-stock.csv`).
- URLs: se redirigen las URL de la demo anterior que cambiaron (`next.config.ts`). El catálogo ficticio vive solo en `src/content/fixtures/demo/` y se activa con `CATALOG_FIXTURE=demo` (únicamente pruebas).
