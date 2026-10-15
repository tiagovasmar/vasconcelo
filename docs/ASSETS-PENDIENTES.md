# Recursos gráficos pendientes (imágenes raster)

Las imágenes actuales de reserva son vectoriales y **no alcanzan el nivel de las referencias aprobadas**. La web ya está
preparada para recibir las definitivas: basta con copiar los archivos con estos nombres exactos en `public/images/`
(reiniciar `npm run dev` o rehacer `npm run build`) y reemplazan automáticamente a la reserva, sin tocar código.
Mientras un archivo no exista, se muestra la reserva vectorial.

Las referencias de `referencias/` sirven de guía de composición. No se pueden usar ilustraciones, packaging ni cartas con
derechos de terceros sin permiso: cada imagen debe registrarse con fuente, licencia/permiso y estado demo/final.
Las cartas que aparezcan en imágenes ilustrativas no deben presentarse como cartas reales del catálogo.

| Archivo (en `public/images/`) | Dónde se usa | Formato / tamaño | Contenido |
| --- | --- | --- | --- |
| `hero/hero-bg.webp` | Fondo a pantalla completa del hero del inicio | 2400×1350, WebP, 16:9 | Escena ilustrada (cielo tormentoso, islas, criatura grande en el tercio derecho) con la mitad izquierda calma y oscura para el titular. Sin texto. |
| `hero/hero-productos.png` | Primer plano del hero, derecha | 1400×1200, PNG transparente | Caja sellada + 2 sobres, ángulo tres cuartos, sombra suave, fondo transparente. Debe leerse como producto reconocible. |
| `categories/cat-cajas.png` | Tarjeta «Cajas» | 900×900, PNG transparente | Una o dos cajas selladas apiladas. |
| `categories/cat-sobres.png` | Tarjeta «Sobres» | 900×900, PNG transparente | Dos sobres en abanico. |
| `categories/cat-packs.png` | Tarjeta «Packs» | 900×900, PNG transparente | Tres sobres distintos agrupados. |
| `products/demo-sobre.png` | Destacado «Sobre» | 1000×1000, PNG transparente | Un sobre, frente. |
| `products/demo-caja.png` | Destacado «Caja» | 1000×1000, PNG transparente | Una caja cerrada (sin sobres de regalo). |
| `products/demo-pack.png` | Destacado «Pack de 5 sobres» | 1000×1000, PNG transparente | Cinco sobres en abanico. |
| `products/demo-bundle.png` | Destacado «Booster bundle» | 1000×1000, PNG transparente | Bundle sellado. |
| `expansions/expansion-cartas.png` | Banda «Antes de abrir…» | 1400×1000, PNG transparente | Abanico de 3 cartas ilustrativas con arte rico. |

Para el catálogo real (hito 2) harán falta además, por SKU: `products/<sku>/01.webp…` (4:5, ≥1200×1500) y, por expansión,
`expansions/<slug>/cards/<n>.webp` (5:7, ≥600×840).

Con estas 10 imágenes el inicio queda en el nivel de las referencias. Las pueden aportar el dueño (fotos de producto reales
o arte con permiso) o un ilustrador; no puedo generarlas con las herramientas disponibles en esta sesión.

## Catálogo demo (hito 2)

Cada producto de demostración declara 3 imágenes: `products/<SKU>/01.webp` (frente), `02.webp` (ángulo) y `03.webp` (detalle), 4:5, ≥ 1200×1500. SKUs demo actuales: `DEMO-STORM-SOBRE`, `DEMO-STORM-CAJA`, `DEMO-STORM-PACK5`, `DEMO-EJ-SOBRE`, `DEMO-EJ-CAJA`, `DEMO-EJ-PACKMIX`, `DEMO-PAR-SOBRE`, `DEMO-PAR-BUNDLE`. Mientras no existan, se muestra la ilustración de reserva. El validador (`npm run catalog:check`) cuenta las imágenes faltantes.

## Catálogo real (lote de colecciones)

Incorporadas 24 fotos de producto (3 por colección) y 1174 imágenes de cartas, todas con estado `reference`: son fotos o cartas oficiales de referencia y **no hay permiso de uso concedido**. Pendiente: obtener permiso o reemplazarlas por fotos propias del inventario (marcar `status: "final"` con `origin` y `license`). Las 6 imágenes del inicio siguen pendientes. Detalle y procedencia: [COLECCIONES.md](COLECCIONES.md).


## Arte del banner del inicio
`public/images/inicio/hero-<colección>.webp` (8 archivos, ≈722–780 px de ancho): recortes de ilustraciones de cartas oficiales de cada colección. Registro: `src/content/colecciones/imagenes-inicio.json`. Sin permiso de uso concedido (estado `reference`). Reemplazable por un arte con permiso o propio manteniendo el registro.


## Fotos reales del stock
Ninguna cargada todavía: ver `docs/FOTOS-A-TOMAR.md` y `src/content/real/store-photos.json`.
