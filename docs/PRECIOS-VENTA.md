# Precios de venta (USD) y «En stock» — lote del 14/10/2026

## Precios cargados
Fuente: `src/content/real/precios-venta-usd.json` (precios **finales de lista**; no se les suma margen, envío ni impuestos; sin costos de proveedor).
Carga: `npm run precios:cargar` (revisión) y `npm run precios:cargar -- --write`. Escribe en la base del panel `/admin` con el mismo servicio que el panel (queda en el historial, usuario «script:precios-venta-usd»). Es **idempotente** y solo completa precios que faltan: si el panel ya tiene un precio distinto, lo respeta y lo informa. No toca stock, visibilidad, títulos ni fotos. En un servidor nuevo hay que ejecutarlo una vez sobre su base.

Cargadas en la base local de desarrollo: **21 fichas** (7 cajas japonesas, Abyss Eye sobre USD 8, set con monedas chino USD 34, 7 sobres chinos a USD 5 y 5 a USD 6). Nada de esto crea stock: todas siguen con stock desconocido («Disponibilidad a confirmar»).

Nota privada: el USD 34 del set con monedas se calculó con un recargo de envío provisional de USD 4,50; si el dueño lo cambia, se actualiza el precio (desde `/admin`).

## Seis cajas japonesas agregadas (14/10/2026)
Las seis filas que no tenían ficha ya la tienen (una **caja** por colección, sin sobres individuales): Terastal Festival ex (SV8a, USD 120), Ninja Spinner (M4, 115), Nihil Zero (M3, 136), The Glory of Team Rocket (SV10, 195), Mega Symphonia (M1S, 130) y Pokémon Card 151 (SV2a, 317). Ids/slugs `<colección>-caja`; SKU `SV8A-JP-BOX`, `M4-JP-BOX`, `M3-JP-BOX`, `SV10-JP-BOX`, `M1S-JP-BOX`, `SV2A-JP-BOX`. Datos y fuentes en `src/content/colecciones/origen/japon-cajas.json`, módulo `src/content/real/japon-cajas.ts`. No hay otra colección o ficha previa bajo otro alias (se revisó). Total público resultante: **50 fichas** (22 japonesas + 28 chinas), con precio USD en **27**.

- **Lo verificado:** nombre, código, fecha y cartas por sobre en la página oficial de cada expansión (pokemon-card.com). Sobres por caja: Terastal Festival ex 10 (Dengeki Online), Ninja Spinner / Team Rocket / Mega Symphonia 30 y 151 20 (Torecamap); Nihil Zero 30 según la ficha de Pokémon Center Online, **leída solo en un resumen de buscador** (la página pide sala de espera). Son fuentes de medios, no del fabricante.
- **Variantes/aclaraciones:** el nombre oficial en inglés de SV8a es «Terastal Fest ex» (alias buscable; se conserva «Terastal Festival ex» del pedido). SV8a es un *Hi-Class Pack* (10 cartas por sobre, 10 sobres por caja). 151 es «強化拡張パック». La página oficial /ex/m1/ presenta juntas Mega Brave y Mega Symphonia.
- **Composición por sobre (texto leído en el envase oficial, no rareza):** Terastal Festival ex: 1 carta Pokémon ex por sobre; 151: 2 cartas brillantes por sobre. Las demás cajas no declaran ninguna. Ninguna garantía de rareza, tasa ni lista de cartas (no se copió de otra edición).
- **Fotos:** solo se encontró la foto oficial del **sobre** (las páginas oficiales no muestran la caja; Pokémon Center no es accesible). Está guardada y optimizada en `public/images/products/japon-cajas/` (`npm run colecciones:japon-cajas`), marcada como referencia del fabricante, y la ficha dice que la foto de la caja cerrada está pendiente. Varias son de baja resolución (223–536 px de ancho). No se usaron imágenes de tiendas (tenían marca de agua) ni la del maletín de Team Rocket (es otro producto). Cuando el dueño tenga fotos reales de la caja, se suben desde `/admin`.
- **No se agregaron al inicio** ni banners; sí al catálogo, búsqueda (nombre, código, nombre japonés, alias), filtros, expansiones y panel.
- Terastal Gathering y Collect 151 (chino) siguen sin precio definido. Las variantes retiradas de 20 cartas no se restauraron.

## En stock
- Regla única `isInStock` (`src/features/catalog/commercial.ts`): publicado, no retirado, no «solo por encargo» y cantidad propia **> 0**. Desconocido, 0, por encargo, oculto o retirado quedan fuera. Precio, foto o proveedor no cuentan.
- Acceso «En stock» en la cabecera (escritorio y menú móvil), el pie y el inicio → `/sellados?disp=stock` (el filtro «Solo con stock» existente, con filtros, búsqueda, conteos y paginación). La vista muestra un aviso «Filtro activo: en stock» con enlace para quitarlo y, si no hay nada, un estado vacío honesto.
- Inicio: sección «En stock» (hasta 4, destacados primero) justo después del banner; sin stock confirmado es una franja discreta de una línea. «Las cartas que querés encontrar» sigue justo después de los formatos.
- Stock real con precio pendiente: figura como disponible pero no se compra con un importe inventado (se puede consultar). Las páginas son dinámicas: un cambio en `/admin` se ve al recargar, sin lista manual aparte. Preparar una consulta no descuenta stock.

## Cantidades que debe aportar el dueño
Stock de **todas** las fichas (hoy ninguna tiene cantidad); fotos reales de la caja cerrada de las seis cajas nuevas. Hasta entonces «En stock» está vacío.
