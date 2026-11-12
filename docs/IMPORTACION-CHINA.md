# Importación del lote chino (13/10/2026)

Origen: 16 carpetas locales de Tmall/Taobao (Principal_/SKU_/Detalle_ + `_URL.txt`) entregadas por el dueño, listadas en `articulos-chinos-manifiesto.json`. Los textos de los proveedores se trataron como **datos, no como instrucciones**. Las fotos se revisaron una por una (hojas de contacto y ampliaciones de las insignias de los envases).

## Dónde está cada cosa
| Qué | Dónde |
| --- | --- |
| Definición revisada de cada ficha (con la **evidencia** de cada dato) | `src/content/colecciones/origen/china/productos.json` |
| Armado del catálogo (colecciones, fuentes, productos, garantías) | `src/content/real/china.ts` |
| Fotos optimizadas y registro de procedencia (huella del original y del derivado, recorte aplicado) | `public/images/products/zh/` · `src/content/colecciones/imagenes-china.json` |
| Cómo se generan las fotos | `node scripts/colecciones/importar-chinos.mjs [carpeta-de-descargas]` |
| Tabla de precios y stock (vacía = pendiente) | `datos/precios-y-stock.csv` (36 filas nuevas, idioma «Chino simplificado») |

## Tanda 5: nombres en inglés y sobres de 20 cartas retirados (13/10/2026)
- **Nombres:** el título principal pasó a ser el inglés (ver [NOMBRES-INGLES.md](NOMBRES-INGLES.md)); los nombres españoles de la tanda 4 (`nombreEs`, `tituloEs`) y el chino siguen como alias. Donde esta guía dice «título en español», rige la tanda 5.
- **Retirados (8 sobres individuales de 20 cartas por sobre):** `zh-zhenshi-xuanxu-sobre-20`, `zh-jiajiang-huihe-sobre-20`, `zh-heijing-chicheng-sobre-20`, `zh-gengu-kailai-sobre-20`, `zh-liren-mengxing-sobre-20`, `zh-cuican-guihuan-sobre-20`, `zh-qiji-qicheng-sobre-20`, `zh-gongzhu-rongguang-sobre-20` (SKU `ZH-975082756071-SKU13`, `-SKU04`, `-SKU09`, `-SKU25`, `ZH-1008153816247`, `-SKU32`, `-SKU38`, `ZH-1063240655679`). Se localizaron por el dato de contenido «cartas por sobre = 20» de los 32 sobres individuales del catálogo (no por el título). **No se retiraron:** los kits 猛雷鼓ex/赛富豪ex (traen 4 sobres de 20 cartas), las cajas especiales de Ogerpon (6 sobres de 20), las cajas japonesas de Black Bolt, White Flare y 30th CELEBRATION (traen 20 sobres) ni ningún sobre de 5, 6, 7 o 10 cartas. Ningún sobre japonés de 20 cartas existía.
- **Total público:** 44 productos (36 → 28 chinos + 16 japoneses). Las fuentes y el historial se conservan; los SKU retirados salieron de `datos/precios-y-stock.csv`.

## Reglas aplicadas
- **Idioma:** `zh` (chino simplificado) con bandera de China y el texto «Chino simplificado»; región `CN`. Todas las fichas salen de publicaciones cuyo envase está en chino simplificado (los kits y las cajas especiales lo declaran con «简中» en el título o traen sobres de esa edición).
- **Nombres (actualizado en la tanda 4):** el título principal es **en español** (traducción *descriptiva* de la tienda a partir del nombre chino, p. ej. «Gran Reunión Teracristal · Caja»; no es un nombre oficial y se rotula así en cada ficha) y el nombre original chino queda como dato secundario (`originalTitle`/`originalName`, buscable). Los nombres en español están en `productos.json` (`colecciones[].nombreEs`, `productos[].titulo`; el título anterior en `tituloOriginal`). No hay equivalencias con expansiones japonesas ni internacionales. El nombre en español de los Pokémon de los kits no se verificó: se conserva el chino.
- **Códigos:** solo los **impresos en los envases** (p. ej. «csv6C», leídos en las fotos). Donde no se ve ninguno (共逐荣光, 宝石包, 30周年庆典) no hay código.
- **Cartas por sobre ≠ sobres por caja ≠ stock.** Las cantidades salen de insignias y fichas; los sobres por caja solo se informan donde la ficha o el rótulo del proveedor los dicen (aclarando que son del proveedor); donde no se leen, la ficha dice «dato pendiente».
- **Sin precios, stock, garantías de rareza ni tasas de aparición.** Todas las fichas dicen «Precio a confirmar» y «Disponibilidad a confirmar» y la compra está deshabilitada (el servidor las rechaza con 409). Las tablas de probabilidades que traen las imágenes del proveedor no se transcribieron.
- **Sin listas de cartas:** las colecciones chinas muestran «Lista no disponible aún»; no se reutiliza la lista japonesa.
- **Fotos:** son de los proveedores (`source: "supplier"`, estado `reference`): no acreditan el estado del inventario de la tienda y **no se afirma que haya permiso de uso** (el enlace de origen no lo concede; sigue siendo un bloqueante de `release:check`). Se quitó el fondo blanco solo cuando era limpio; los gráficos de contenido y las fotos con fondo propio se conservan sin retocar y se rotulan «según el gráfico del proveedor».

## Resultado por fuente (16 IDs)

### 978760878054 · 真实玄虚 5 cartas
- Origen: https://detail.tmall.com/item.htm?id=978760878054&skuId=5958455496985 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-zhenshi-xuanxu-sobre-5` — 真实玄虚 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-978760878054`)
- Es el sobre de 5 cartas. En la publicación surtida 975082756071 (SKU_11/12) aparece el mismo sobre: **conciliado, no duplicado**.

### 975082756071 · Publicación surtida de cajas y sobres (16.0 / 17.5, 星彩晶璃, 嘉奖回合 y otros)
- Origen: https://item.taobao.com/item.htm?id=975082756071 · tienda «百变怪TCG卡牌» (Taobao)
- **Fichas creadas (20):**
  - `zh-zhenshi-xuanxu-sobre-20` — 真实玄虚 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-975082756071-SKU13`)
  - `zh-jiajiang-huihe-sobre-5` — 嘉奖回合 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-975082756071-SKU01`)
  - `zh-jiajiang-huihe-sobre-20` — 嘉奖回合 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-975082756071-SKU04`)
  - `zh-heijing-chicheng-sobre-5` — 黑晶炽诚 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-975082756071-SKU07`)
  - `zh-heijing-chicheng-sobre-20` — 黑晶炽诚 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-975082756071-SKU09`)
  - `zh-wuwei-taijing-sobre-5` — 无畏太晶 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-975082756071-SKU19`)
  - `zh-gengu-kailai-sobre-5` — 亘古开来 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-975082756071-SKU24`)
  - `zh-gengu-kailai-sobre-20` — 亘古开来 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-975082756071-SKU25`)
  - `zh-liren-mengxing-sobre-5` — 利刃猛醒 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-975082756071-SKU26`)
  - `zh-cuican-guihuan-sobre-5` — 璀璨诡幻 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-975082756071-SKU30`)
  - `zh-cuican-guihuan-sobre-20` — 璀璨诡幻 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-975082756071-SKU32`)
  - `zh-qiji-qicheng-sobre-20` — 奇迹启程 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-975082756071-SKU38`)
  - `zh-taijing-shengju-sobre-10` — 太晶盛聚 · Sobre de 10 cartas · Sobre · 10 cartas (SKU `ZH-975082756071-SKU40`)
  - `zh-shengxiang-xingyin-sobre-6` — 胜象星引 · Sobre de 6 cartas · Sobre · 6 cartas (SKU `ZH-975082756071-SKU15`)
  - `zh-anying-duohui-sobre-6` — 暗影夺辉 · Sobre de 6 cartas · Sobre · 6 cartas (SKU `ZH-975082756071-SKU17`)
  - `zh-nuyan-zhuotian-sobre-6` — 怒炎灼天 · Sobre de 6 cartas · Sobre · 6 cartas (SKU `ZH-975082756071-SKU20`)
  - `zh-jiju-gongfang-sobre-6` — 极巨攻防 · Sobre de 6 cartas · Sobre · 6 cartas (SKU `ZH-975082756071-SKU22`)
  - `zh-zhongmo-yanwu-sobre-6` — 终末炎舞 · Sobre de 6 cartas · Sobre · 6 cartas (SKU `ZH-975082756071-SKU23`)
  - `zh-shengxiang-xingyin-caja` — 胜象星引 · Caja · Caja (SKU `ZH-975082756071-SKU16`)
  - `zh-anying-duohui-caja` — 暗影夺辉 · Caja · Caja (SKU `ZH-975082756071-SKU18`)
- Publicación de un revendedor con ~42 imágenes de variante. Se importaron las variantes TCG cuya cantidad de cartas se lee en la insignia del envase. **Conciliados con otras carpetas (no duplicados):** 真实玄虚 de 5 cartas (→ 978760878054), 利刃猛醒 de 20 cartas (→ 1008153816247), 星彩晶璃 de 5 cartas (→ 1050867876169) y la caja de 太晶盛聚 (→ 1064307763243). **Pendientes puntuales:** 星彩晶璃 de 20 cartas (solo hay una imagen compuesta de baja resolución, SKU_34–37, aunque las cajas de Ogerpon confirman que existe); 无畏太晶 de 20 cartas (no aparece en la publicación); las cajas «瘦盒/肥盒» de las colecciones 朱&紫 (la imagen solo rotula «×15» o «×6»: no hay foto de la caja ni se confirma qué unidad se vende; la cantidad de sobres se informó como dato del proveedor en la ficha del sobre); la caja de 奇迹启程 (SKU_39) y las ventas por cantidad («原箱», precio de referencia del proveedor).

### 1079986406064 · 30周年庆典
- Origen: https://item.taobao.com/item.htm?id=1079986406064 · tienda «Hamburger Toy工作室» (Taobao)
- **Fichas creadas (2):**
  - `zh-30-zhounian-sobre-6` — 30周年庆典 · Sobre de 6 cartas · Sobre · 6 cartas (SKU `ZH-1079986406064-SOBRE`)
  - `zh-30-zhounian-set-monedas` — 30周年庆典 · Set con monedas · Set · Set con monedas (SKU `ZH-1079986406064-SKU08`)
- Importados en este lote: sobre de 6 cartas y set con monedas. La variante SKU_01 se incorporó después como set de figura de Pikachu del 30.º aniversario. Pokémon China confirma que incluye una figura sorpresa, la carta correspondiente y un sobre. **Pendientes puntuales:** las cajas de regalo de SKU_14–21 (Eevee solar, Eevee lunar, Eevee hada y Greninja ex), la caja amarilla SKU_06 y el exhibidor SKU_11: sus contenidos no se leen en las imágenes.

### 1064307763243 · 太晶盛聚 (17.5)
- Origen: https://item.taobao.com/item.htm?id=1064307763243&skuId=6114037237060 · tienda «jc19950904的小店1» (Taobao)
- **Fichas creadas (1):**
  - `zh-taijing-shengju-caja` — 太晶盛聚 · Caja · Caja (SKU `ZH-1064307763243`)
- Las fotos son del vendedor y muestran una **caja**; el título habla de «补充包10张装». Se publicó como caja (sobres de 10 cartas) con la cantidad de sobres por caja pendiente. **Tanda 4:** la foto principal pasó de la mano sosteniendo el envase a un recorte frontal de un solo envase (Principal_03; es la mejor resolución disponible y queda algo blanda: ver FOTOS-A-TOMAR.md); la foto con la mano y la de varios envases quedan como vistas secundarias. La unidad de venta (caja o sobre) sigue sin confirmarse y se aclara igual en la ficha. El sobre suelto de la misma colección sale de la publicación 975082756071 (SKU_40).

### 1063240655679 · 共逐荣光 20 cartas
- Origen: https://detail.tmall.com/item.htm?id=1063240655679&skuId=6111536584650 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-gongzhu-rongguang-sobre-20` — 共逐荣光 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-1063240655679`)
- Sobre de 20 cartas (la ficha dice «每盒6包»: 6 sobres por caja; la ficha es el sobre). Comparte colección con la de 5 cartas (1065055849565) pero son fichas distintas. Resuelve el antiguo pendiente 1063240655679.

### 1065661862776 · Kit de mazo 猛雷鼓ex
- Origen: https://detail.tmall.com/item.htm?id=1065661862776&skuId=6114038368150 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-kit-mengleigu-ex` — 大师战略卡组构筑套装 · 猛雷鼓ex · Kit de mazo (SKU `ZH-1065661862776`)
- Kit de mazo con identificación china conservada (猛雷鼓ex). El nombre en español del Pokémon no se verificó y no se traduce.

### 1065668842312 · Kit de mazo 赛富豪ex
- Origen: https://detail.tmall.com/item.htm?id=1065668842312&skuId=6114790741135 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-kit-saifuhao-ex` — 大师战略卡组构筑套装 · 赛富豪ex · Kit de mazo (SKU `ZH-1065668842312`)
- Kit distinto del anterior (赛富豪ex), con el mismo tipo de accesorios.

### 1070975018438 · 宝石包 VOL.6
- Origen: https://detail.tmall.com/item.htm?id=1070975018438&skuId=6285978162895 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-baoshibao-vol6-caja` — 宝石包 VOL.6 · Caja de 18 sobres · Caja (SKU `ZH-1070975018438`)
- **Caja de 18 sobres de 4 cartas confirmada** por la ficha del proveedor (Principal_04: «每盒18包 每包含有4张卡牌»; Detalle_06: «每盒18包»). Se quitó el aviso obsoleto sobre «盲盒»/unidad de venta. No hay foto limpia de la caja (solo un render diminuto dentro del cartel): la primera imagen son **los sobres que trae**, recortados del gráfico del proveedor, y el cartel queda como vista secundaria.

### 1008153816247 · 利刃猛醒 20 cartas
- Origen: https://detail.tmall.com/item.htm?id=1008153816247&skuId=6179560326837 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-liren-mengxing-sobre-20` — 利刃猛醒 · Sobre de 20 cartas · Sobre · 20 cartas (SKU `ZH-1008153816247`)
- Sobre de 20 cartas (la ficha dice 6 sobres por caja). La publicación surtida 975082756071 trae el mismo producto (SKU_28/29): **conciliado, no duplicado**.

### 1070165751188 · 最初的伙伴 特别插画闪卡套装 Vol.3
- Origen: https://detail.tmall.com/item.htm?id=1070165751188&skuId=6121938069378 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-30-zhounian-ilustraciones-vol3` — 最初的伙伴 · Set de ilustraciones Vol.3 · Set de ilustraciones · Vol.3 (SKU `ZH-1070165751188`)
- Set de ilustraciones Vol.3 (no se confunde con el Vol.2): 1 carta de 9 posibles, marco acrílico y un sobre de 共逐荣光 de 5 cartas. Sin foto limpia: se usa su imagen de presentación. Resuelve el antiguo pendiente 1070165751188.

### 1065354470710 · 嗨皮组合
- Origen: https://detail.tmall.com/item.htm?id=1065354470710&skuId=6113656668432 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-kit-haipi-zuhe` — 嗨皮组合 · Kit de 4 mazos · Kit de mazo (SKU `ZH-1065354470710`)
- Un solo producto con los 4 mazos juntos (no son 4 variantes).

### 1059308989628 · 最初的伙伴 特别插画闪卡套装 Vol.2
- Origen: https://detail.tmall.com/item.htm?id=1059308989628&skuId=6267133714161 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-30-zhounian-ilustraciones-vol2` — 最初的伙伴 · Set de ilustraciones Vol.2 · Set de ilustraciones · Vol.2 (SKU `ZH-1059308989628`)
- Set de ilustraciones Vol.2 (con un sobre de 星彩晶璃 de 5 cartas).

### 1065055849565 · 共逐荣光 5 cartas
- Origen: https://detail.tmall.com/item.htm?id=1065055849565&skuId=6276681015552 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-gongzhu-rongguang-sobre-5` — 共逐荣光 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-1065055849565`)
- Sobre de 5 cartas de 共逐荣光; comparte colección con la ficha de 20 cartas.

### 1050867876169 · 星彩晶璃 5 cartas
- Origen: https://detail.tmall.com/item.htm?id=1050867876169&skuId=6078990300639 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-xingcai-jingli-sobre-5` — 星彩晶璃 · Sobre de 5 cartas · Sobre · 5 cartas (SKU `ZH-1050867876169`)
- Sobre de 5 cartas de 星彩晶璃. Resuelve el antiguo pendiente 1050867876169. El sobre de 20 cartas queda pendiente (ver 975082756071).

### 1049188091485 · 厄诡椪 水井面具礼盒
- Origen: https://detail.tmall.com/item.htm?id=1049188091485&skuId=6245970290772 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-caja-ogerpon-agua` — 厄诡椪 水井面具礼盒 · Caja especial · Caja especial (SKU `ZH-1049188091485`)
- Caja especial de Ogerpon, máscara de agua. Resuelve el antiguo pendiente 1049188091485.

### 1050912901200 · 厄诡椪 火灶面具礼盒
- Origen: https://detail.tmall.com/item.htm?id=1050912901200&skuId=6245967410012 · tienda «宝可梦官方旗舰店» (Tmall)
- **Fichas creadas (1):**
  - `zh-caja-ogerpon-fuego` — 厄诡椪 火灶面具礼盒 · Caja especial · Caja especial (SKU `ZH-1050912901200`)
- Caja especial de Ogerpon, máscara de fuego; mismo contenido, otro tema.

## Pendientes anteriores (conciliación)
Los antiguos IDs **1049188091485, 1050867876169, 1070165751188 y 1063240655679** ya son fichas (ver arriba) y se marcaron «importado» en `origen/tmall-pendientes.json` sin duplicarlos. El antiguo **1027185914261** no tiene carpeta en este lote: **sigue pendiente**, sin producto inventado.

## Qué falta (no bloquea la publicación de las fichas)
- **Comercial (lo da el dueño):** precio, stock, máximo por pedido y estado del sellado de las 36 fichas (por `datos/precios-y-stock.csv` o el panel `/admin`).
- **Unidad de venta y sobres por caja** de: 太晶盛聚 (caja), 胜象星引 y 暗影夺辉 (cajas) y 宝石包 VOL.6 («盲盒»).
- **Variantes sin cargar:** 星彩晶璃 de 20 cartas, 无畏太晶 de 20 cartas, cajas «瘦盒/肥盒», 奇迹启程 (caja), las cajas de regalo y el exhibidor del aniversario.
- **Fotos limpias** de 宝石包 VOL.6 y del Vol.3 (hoy imagen de presentación del proveedor) y fotos propias del stock real de todo el lote (ver `FOTOS-A-TOMAR.md`).
- **Permiso de uso** de las imágenes de los proveedores.


## Tanda 6 (14/10/2026): portadas del 30.º aniversario, ficha de Bulbasaur y fotos de las cajas de Ogerpon

- **Publicación nueva 1024232254134** (Taobao, tienda «圣城卡牌游戏», revendedor): «宝可梦 PTCG 卡牌 简中正版 30周年庆典 最初的伙伴 特别插画 P卡». Carpeta local con `Principal_03.jpg` (Bulbasaur 妙蛙种子, 001/30th-P), `Principal_04.jpg` (Totodile 小锯鳄, 006/30th-P) y `Principal_05.png` (Torchic 火稚鸡, 008/30th-P). Los tres `_URL.txt` apuntan al mismo artículo y al mismo `skuId=6053279645670`: **no distinguen una variante seleccionable por Pokémon** (se leyeron como datos).
- **Portadas:** `zh-30-zhounian-ilustraciones-vol2` (su portada ya era el envase de Totodile) ahora usa `Principal_04.jpg`; `zh-30-zhounian-ilustraciones-vol3` (ya era el de Torchic) usa `Principal_05.png` (con transparencia: sin las barras negras del original). Se conservan id, SKU, slug, variante, contenido y su segunda foto. No cambian el banner ni las cartas destacadas del inicio.
- **Ficha nueva `zh-30-zhounian-carta-p-bulbasaur`** (SKU `ZH-1024232254134-BULBASAUR`, formato pack, «30th Anniversary First Partner Special Illustration P Card · Bulbasaur», colección 30th Celebration): **borrador** (`active: false`, `draftNote`). El envase dice «全9种 · 每种等比生产, 随机获得其中1张» y «本商品可能不包含封面展示款»: es un paquete de 1 carta al azar entre 9; no se confirmó que se venda Bulbasaur seleccionada, por eso no se promete. Sin precio ni stock; no copia accesorios ni contenidos de Vol.2/Vol.3. No se llamó «Vol.1»: no hay evidencia.
- **Cajas especiales de Ogerpon (agua y fuego):** +2 fotos de contenido documentado cada una (`Principal_03`: fundas, dados y marcador; `Principal_02`: sobre «北上乡专题包»). Corresponden a la lista de contenido ya cargada.
- Reimportación: `node scripts/colecciones/importar-chinos.mjs` (regenera todas las fotos de forma determinista; el resto de los archivos no cambió).
