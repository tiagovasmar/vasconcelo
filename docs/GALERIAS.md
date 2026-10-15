# Galerías de producto

Decisión del dueño (13/10/2026): galerías más completas **sin relleno**. No se completa con duplicados, ampliaciones de la misma foto, imágenes de otras ediciones ni vistas generadas.

## Cómo se separan las fuentes

| Qué es | Dónde se ve | Cómo se identifica |
| --- | --- | --- |
| **Fotos de referencia del fabricante** (oficiales) | Galería de la ficha | Etiqueta «Foto de referencia del fabricante» + vista («Caja cerrada», «Frente»…) y la aclaración de que no acreditan el estado ni el sellado de cada artículo. |
| **Fotos de referencia del proveedor** (Tmall/Taobao, ediciones chinas) | Galería de la ficha | Etiqueta «Foto de referencia del proveedor» + aclaración de que no acreditan el estado del artículo ni son fotos del stock; los gráficos de contenido se rotulan «según el gráfico del proveedor». `source: "supplier"`. Detalle en [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md). |
| **Fotos reales del stock de la tienda** | Galería de la ficha, a continuación de las del fabricante | Etiqueta «Foto real del stock de la tienda». Hoy **no hay ninguna** y la ficha lo dice. |
| **Cartas ilustrativas de la expansión** | Sección «Cartas ilustrativas de la expansión» de la ficha (y detalle de la expansión) | Texto «ilustrativas, no contenido garantizado»; nunca se mezclan con las fotos del producto. |
| **Caja abierta de exhibición** | Segunda vista de cada caja | Vista `display-open`, etiqueta «Caja abierta de exhibición» y aviso «es una presentación del fabricante, no es el estado del artículo que se vende». |

Datos: cada imagen tiene `source` (`manufacturer` | `supplier` | `store`) y `view` (`front`, `back`, `left`, `right`, `top`, `bottom`, `detail`, `contents`, `closed`, `display-open`) en `src/content/schema.ts`. Los originales siguen intactos (`imagenes.json`, con huella y procedencia); la ficha muestra la versión de presentación recortada (ver `docs/CAMBIOS-HOME-Y-PAGOS.md`, sexta revisión).

## Búsqueda de imágenes oficiales adicionales (13/10/2026)

Se revisaron, una página a la vez y con pausa, las 16 páginas oficiales registradas por colección (sitio de cada expansión y ficha de la caja en Pokémon Center Online) y cada imagen candidata se miró una por una.

Resultado: **no hay vistas oficiales adicionales del SKU exacto**. Cada ficha de caja de Pokémon Center Online publica solo dos fotos (las dos que ya están integradas: caja cerrada y exhibición abierta) y los sitios de las expansiones muestran solo el sobre ya integrado.

Se descartaron expresamente, y no se integraron:
- Heat Wave Arena: una tercera imagen de la ficha de la caja es una gráfica de **campaña promocional** (cartas de regalo con texto japonés), no una foto del producto.
- Black Bolt / White Flare: otras imágenes del sitio son del **formato Deluxe** (35 cartas por sobre; otro SKU), del **set de archivador con carta promocional** (otro producto) y gráficas con texto/campaña.
- 30th CELEBRATION: la «caja» que aparece en el sitio es un **accesorio de almacenamiento**, no el sellado.
- Carteles y gráficas con fechas, textos o campañas japonesas incrustadas (imágenes clave de cada expansión): no se trasladan a la tienda.
- Imágenes de otras ediciones, ampliaciones de la misma foto y duplicados: no se usan.

Las pruebas lo garantizan: `tests/galerias.test.ts` verifica que dentro de un producto y entre colecciones no hay dos imágenes con el mismo contenido, que cada imagen es de su colección, que la caja abierta está identificada y que no hay fotos de la tienda inventadas.

## Qué fotos debería tomar el dueño

Ver [FOTOS-A-TOMAR.md](FOTOS-A-TOMAR.md): lista por producto, formato y cómo cargarlas (`src/content/real/store-photos.json`). No bloquea nada: mientras no existan, las fichas muestran solo las de referencia, rotuladas como tales.
