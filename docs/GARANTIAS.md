# Qué garantiza cada caja (investigación del 13/10/2026)

Pedido del dueño: ver con claridad qué asegura una caja sellada (sobres, cartas por sobre, accesorios y, **si hay respaldo**, rarezas). El ejemplo «4 AR por caja» expresa el tipo de dato buscado; **no es un dato confirmado ni una regla**.

## Resultado en una línea
Ninguna fuente revisada documenta una **rareza garantizada por sobre ni por caja** para las 8 cajas japonesas estándar. Lo que sí está documentado es el contenido físico y, en cuatro colecciones, una composición **por sobre**. La ficha lo dice así: «Rarezas garantizadas: sin confirmación documental» (que **no** significa que no haya un patrón habitual).

## Cómo se presenta (una sola sección, sin bloques duplicados)
En cada **caja, caja especial y kit**, el bloque «Qué garantiza esta caja» (o «Qué incluye este kit») está junto al precio y **antes** de la galería de cartas, con tres cosas separadas:

1. **Contenido físico confirmado**: sobres, cartas por sobre y accesorios/promos fijos.
2. **Garantizado en cada sobre** (composición/promos fijas, solo si la fuente lo respalda): con una etiqueta que dice cómo leer la cantidad — *Cantidad fija*, *Mínimo garantizado* o *Una de varias alternativas* (no se suman) — y la etiqueta de evidencia.
3. **Rarezas garantizadas**: lo documentado, o «Sin confirmación documental».
   Una cuarta fila, **«Composición habitual observada»**, solo aparecería si hubiera una estimación de aperturas cargada (hoy no hay ninguna): siempre aparte, rotulada «no es una garantía».

El desplegable «Detalle, fuentes y alcance» (cerrado al inicio) conserva cada enunciado con su fuente, fecha y alcance, y la revisión de rarezas (qué se miró, cuándo y con qué resultado). **Los sobres sueltos no llevan este encabezado ni la fila de rarezas** («Contenido del sobre»).

Datos: `Product.rarityReview` (revisión), `Guarantee.quantityKind` (cómo leer la cantidad) y las garantías existentes. Textos y reglas: `src/features/catalog/garantias.ts`; vista: `src/components/garantias-resumen.tsx`.

## Qué se investigó
| Fuente | Qué dice |
| --- | --- |
| Ficha de cada caja en Pokémon Center Online (8 páginas, leídas el 13/10/2026) | Sobres por caja, cartas por sobre y «las cartas se encapsulan al azar». Ninguna usa «確定», «必ず» ni «保証» para una rareza por sobre o por caja. |
| Página oficial de la expansión (SV11, M6, M5, M2, M2a, SV9a, 30th) | Cartas por sobre y «al azar». La de Black Bolt / White Flare informa que el **formato Deluxe** («拡張パックデラックス», 35 cartas) trae **1 AR confirmada por sobre**: es **otro producto** que esta tienda no vende. El «4 AR» del ejemplo corresponde a ese formato (4 sobres Deluxe × 1 AR), no a la caja estándar. |
| Texto del envase (4 sobres) | «必ず2枚キラカード» (Black Bolt / White Flare), «ポケモンexまたはメガシンカex 1枚確定！» (MEGA Dream ex) y, en 30th CELEBRATION, 1 Pikachu del aniversario + 1 Energía básica y todas brillantes. Son garantías de **composición por sobre**, no de rarezas. |
| Búsquedas web generales (minoristas, guías) | Solo listados de tiendas, con cifras que no coinciden entre sí (20 o 30 sobres, 5 o 7 cartas): **no se usaron** como evidencia. Las afirmaciones genéricas de que las cajas japonesas «suelen» traer cierta rareza no están respaldadas para estos productos y no se cargaron. |

## Tabla por caja
| Caja (SKU) | Contenido físico confirmado | Garantizado en cada sobre | Rarezas documentadas | Fuente (fecha) | Datos no confirmados |
| --- | --- | --- | --- | --- | --- |
| Black Bolt `SV11B-JP-BOX` | 20 sobres × 7 cartas (140 posiciones, al azar) | 2 cartas brillantes por sobre (**cantidad fija**, envase). **No equivale a 2 AR** ni a una cantidad de AR por caja | Ninguna | Ficha de la caja y página SV11 (13/10/2026); envase | Cantidad de AR u otras rarezas por caja; el AR por sobre es del formato Deluxe (otro producto) |
| White Flare `SV11W-JP-BOX` | 20 sobres × 7 cartas | Ídem Black Bolt | Ninguna | Ídem | Ídem |
| Heat Wave Arena `SV9A-JP-BOX` | 30 sobres × 5 cartas (150) | Ninguna documentada | Ninguna | Ficha de la caja (13/10/2026) | Rarezas por sobre/caja. La promo de compra (concurso de ilustraciones 2024) es de Pokémon Center, **no** contenido de la caja |
| Inferno X `M2-JP-BOX` | 30 × 5 (150) | Ninguna | Ninguna | Ficha de la caja y página M2 | Rarezas |
| MEGA Dream ex `M2A-JP-BOX` | 10 sobres × 10 cartas (100) | 1 carta Pokémon ex **o** Mega Evolution ex por sobre (**una de dos alternativas**: no se suman; envase) | Ninguna | Ficha de la caja y envase | Qué carta es, si es SAR u otra rareza |
| 30th CELEBRATION `M6A-JP-BOX` | 20 × 6 (120) | 1 Pikachu del 30.º aniversario + 1 Energía básica (**fijas**); las 6 cartas brillantes | Ninguna | Ficha de la caja (13/10/2026) y página del aniversario | Cuál de las ilustraciones de Pikachu |
| Storm Emeralda `M6-JP-BOX` | 30 × 5 (150) | Ninguna | Ninguna | Ficha de la caja (13/10/2026) | Rarezas |
| Abyss Eye `M5-JP-BOX` | 30 × 5 (150) | Ninguna | Ninguna | Ficha de la caja (13/10/2026) | Rarezas |

### Cajas chinas, cajas especiales y kits (no se mezclan con las reglas japonesas)
| Producto | Contenido físico (ficha del proveedor) | Rarezas documentadas | Pendiente |
| --- | --- | --- | --- |
| 太晶盛聚 · Caja | Sobres de 10 cartas | Ninguna | Sobres por caja y unidad de venta (el título dice «补充包10张装», las fotos muestran una caja) |
| 胜象星引 · Caja / 暗影夺辉 · Caja | Sobres de 6 cartas | Ninguna | Sobres por caja (la foto es pequeña y no lo muestra) |
| 宝石包 VOL.6 · Caja | 18 sobres × 4 cartas (72 posiciones) | Ninguna | Unidad de venta final («盲盒») |
| 厄诡椪 · Cajas especiales (agua y fuego) | 3 sobres de 璀璨诡幻 (20) + 3 de 星彩晶璃 (20) + 1 sobre «北上乡专题包» (5) y accesorios. **El sobre «北上乡专题包» trae 5 cartas brillantes: 3 de Pokémon, 1 Pokémon ex fija y 1 de Entrenador** (ficha, Detalle_04–06) | Ninguna | La tabla de probabilidades por carta que trae la imagen del proveedor **no se transcribió**; composición de los sobres de 20 cartas |
| Kits 猛雷鼓ex / 赛富豪ex / 嗨皮组合 | Mazo(s) de 60 cartas, packs de mejora, sobres de 共逐荣光 (20) o 嗨皮包 (2) y accesorios, con cantidades de la ficha. El mazo y los accesorios son fijos | Ninguna | Qué cartas salen en los sobres |

En todas las chinas: la revisión consultó solo la ficha del proveedor (guardada por el dueño); **no se consultó una fuente oficial de la edición china** ni se trasladó ninguna garantía japonesa.

## Qué haría falta para completar «rarezas»
- Una fuente oficial del fabricante (o del packaging de la caja concreta) que declare una rareza por sobre o por caja para **ese SKU, idioma y región**. Si aparece, se carga como `Guarantee` de tipo `rarity` con fuente, fecha y alcance (el validador exige fuente oficial) y, si es un mínimo, `quantityKind: "minimum"`.
- Una muestra suficiente de aperturas de **cajas selladas de ese SKU** (con tamaño de muestra y método) para mostrar una «composición habitual observada». Hoy no hay ninguna cargada y no se inventó ninguna cifra.
