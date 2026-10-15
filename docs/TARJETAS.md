# Tarjetas del catálogo, estados de stock y fotos de cajas (14/10/2026)

## Tarjetas más compactas (`src/components/product-card.tsx`)
- Se quitó el `flex-1` que estiraba el bloque de precio y dejaba un hueco entre título y precio; si la grilla estira una tarjeta, el sobrante queda **arriba del enlace final**, no en el medio. Menos relleno (`p-3`), título `text-base` en escritorio.
- Área de imagen más baja (4:3 en lugar de 5:4) sin la franja de 24 px reservada arriba: los **sobres** (verticales) ocupan ~96 % del alto (antes ~58 % del recuadro) y las cajas ~90 % del ancho, siempre con `object-contain` (sin deformar ni recortar).
- Misma grilla en escritorio (4 columnas) y celular (2 columnas, 1 por debajo de 360 px); probada con títulos largos (nombres chinos en inglés, «The Glory of Team Rocket · Caja de 30 sobres»).

## Etiqueta «BAJO STOCK» (diseño aprobado del 14/10/2026)
Cápsula ovalada naranja, **pequeña (≈ 160 × 24 px)**, **centrada sobre el borde superior** de la tarjeta (sobresale ~8 px y entra ~16 px). Texto «BAJO STOCK» en blanco y negrita con **una llama a cada lado**: SVG monocromático blanco inline (`FlameIcon`, hereda el color; sin emojis), nítido a cualquier tamaño y con `aria-hidden`, así que el lector de pantalla dice solo «Bajo stock». Naranja `#c2500b` (contraste con el blanco ≈ 4,7:1, AA). En celular se achica (llamas de 10 px, sin salto de línea, nunca más ancha que la tarjeta); no ocupa todo el ancho. Para no tapar nada, en las tarjetas con etiqueta el formato y el corazón de favoritos bajan 12 px y la imagen deja un respiro arriba.
Regla (sin cambios, `isLowStock`, la misma del panel): producto publicado, **stock entre 1 y el umbral** configurado en `/admin` (por defecto 3), que no sea «solo por encargo». **Stock 0 → «Sin stock», nunca «Bajo stock». Umbral 0 → sin etiqueta.** No se tocan precios ni cantidades.

## Etiqueta de disponibilidad (`stock-badge.tsx`)
Cerca del precio, en tarjetas y fichas, con la regla de siempre (`availabilityLabel`): **«✓ Disponible»** (relleno verde oscuro, texto blanco en negrita) o **«✕ Sin stock»** (recuadro punteado rojo, fondo blanco, negrita), además de «Disponible por encargo» y «Disponibilidad a confirmar» con su propia forma. No depende solo del color (texto + forma + símbolo); el símbolo es CSS (`before:`), no forma parte del texto.

## Fotos de caja: Nihil Zero, Mega Symphonia, Ninja Spinner (y Team Rocket)
`node scripts/colecciones/limpiar-cajas-center.mjs` (idempotente; `--rehacer` repite desde el original):
- **Originales** (foto oficial de Pokémon Center convertida a WebP al importarla, 1500×1500 con fondo blanco) conservados en `recursos-originales/japon-cajas/<id>-closed-original.webp`, con huella en `imagenes-cajas-center.json`.
- **Derivados** transparentes en `public/images/products/japon-cajas/<id>-closed-v2.webp` (≈ 1100×655 px, 150–175 KB, calidad 95 con alfa sin pérdida), del mismo tamaño que las cajas más viejas del catálogo (≈ 1100×650). Solo cambia el canal alfa y el recorte (3 % de aire): ningún píxel del envase se toca ni se escala.
- Un relleno simple desde el borde se «comía» el arte claro de la tapa; por eso se usa la silueta de la caja (`separar-caja.mjs`, la misma técnica de Black Bolt / White Flare) y un suavizado del borde.
- **Team Rocket tenía exactamente el mismo problema** (fondo blanco y margen enorme, se veía como un cuadrado blanco en la tarjeta) y se procesó igual aunque no estaba en el pedido. La caja de Terastal Festival ex es una imagen vertical con su propio fondo y no se tocó. Las fotos de exhibición abierta no se tocaron.
- Capturas del antes y después en `docs/capturas/tarjetas/` (`antes-*`, `despues-*`, `fotos-cajas-antes-y-despues.png`; ampliación y miniaturas en escritorio y celular). Las cantidades de stock de esas capturas son de prueba, en una copia descartable de la base.

## Pruebas
`tests/e2e/admin.spec.ts` (cartel con 1–umbral, sin cartel por encima del umbral, con umbral 0, «Sin stock» con 0, etiqueta de ≈ 28 px de alto, centrada, que sobresale del borde, no ocupa todo el ancho, texto blanco, 2 llamas SVG `aria-hidden`, sin emojis, y que no se superpone con el formato ni los favoritos, misma etiqueta en tarjeta y ficha) y `tests/japon-cajas.test.ts` (derivados transparentes, tamaño comparable y original conservado con su huella).
