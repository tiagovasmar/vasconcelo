# Lo que tiene que aportar el dueño (lista consolidada, 13/10/2026)

Nada de esto frena el desarrollo: son datos y decisiones que **solo el dueño puede dar**. No se inventó ninguno. Los chequeos de publicación (`npm run release:check`) siguen marcándolos como bloqueantes; no se ocultó ni desactivó ninguno.

## 1. Datos del comercio y textos legales (bloquean sacar el borrador de Privacidad y Condiciones)
Se completan en `src/content/legal.ts` (hoy todos en `null`; las páginas muestran «[A completar por el comercio]»):
- [ ] Razón social o nombre y apellido del titular — Privacidad §1, Condiciones §9
- [ ] CUIT/CUIL — Privacidad §1, Condiciones §9
- [ ] Domicilio legal — Privacidad §1, Condiciones §9
- [ ] Correo de contacto (privacidad y baja de cuenta) — Privacidad §1, Condiciones §7
- [ ] Ley aplicable y jurisdicción — Condiciones §9
- [ ] Política de cambios, devoluciones y garantías — Condiciones §6
- [ ] Plazos de conservación de datos — Privacidad
- [ ] Revisión del texto por el comercio o su asesor, y recién ahí `legal.isDraft = false` (las etiquetas «borrador» y «Sitio en preparación» **se retiran solo cuando la sección esté realmente terminada**)

## 2. Marca, contacto y publicación
- [ ] Logo definitivo (hoy es solo texto «Vasconcelo») y `store.isDemo = false`
- [ ] Número de WhatsApp (variable `WHATSAPP_NUMBER` o `store.whatsappNumber`): sin él la consulta funciona en modo demostración
- [ ] Proveedor de correo para confirmar cuentas y recuperar acceso
- [ ] Hosting, dominio y backups (el proyecto no contrata nada); `DATABASE_PATH` en un disco persistente
- [ ] `ADMIN_EMAIL` del panel `/admin` (sin configurar, el panel está cerrado)

## 3. Comercial de las 52 fichas (precio, stock, máximo por pedido, estado del sellado)
Todas dicen «Precio a confirmar» y la compra está deshabilitada. Se cargan en `datos/precios-y-stock.csv` (`npm run precios:importar -- --write`) o desde `/admin`. Esta tanda no modificó precios ni stock.

## 4. Fotos reales del stock
**El proyecto no tiene ninguna foto del stock real** (`src/content/real/store-photos.json` está vacío y `public/images/tienda/` no existe): todas las fichas muestran fotos de **referencia** (del fabricante en las japonesas, del proveedor en las chinas), rotuladas como tales. No se generaron ni simularon fotos. Cómo tomarlas y cargarlas: [FOTOS-A-TOMAR.md](FOTOS-A-TOMAR.md). Fotos necesarias por producto:

| SKU | Producto | Idioma | Fotos necesarias |
| --- | --- | --- | --- |
| `SV11B-JP-BOX` | Black Bolt · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `SV11B-JP-BOOSTER` | Black Bolt · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `SV11W-JP-BOX` | White Flare · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `SV11W-JP-BOOSTER` | White Flare · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `SV9A-JP-BOX` | Heat Wave Arena · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `SV9A-JP-BOOSTER` | Heat Wave Arena · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `M2-JP-BOX` | Inferno X · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `M2-JP-BOOSTER` | Inferno X · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `M2A-JP-BOX` | MEGA Dream ex · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `M2A-JP-BOOSTER` | MEGA Dream ex · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `M6A-JP-BOX` | 30th CELEBRATION · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `M6A-JP-BOOSTER` | 30th CELEBRATION · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `M6-JP-BOX` | Storm Emeralda · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `M6-JP-BOOSTER` | Storm Emeralda · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `M5-JP-BOX` | Abyss Eye · Caja | Japones | Frente, dorso, laterales izquierdo y derecho, parte superior y base, detalle del film/sello y de la etiqueta (ver FOTOS-A-TOMAR.md) |
| `M5-JP-BOOSTER` | Abyss Eye · Sobre | Japones | Frente y dorso, detalle del sellado superior e inferior |
| `ZH-978760878054` | 真实玄虚 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU13` | 真实玄虚 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU01` | 嘉奖回合 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU04` | 嘉奖回合 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU07` | 黑晶炽诚 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU09` | 黑晶炽诚 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU19` | 无畏太晶 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU24` | 亘古开来 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU25` | 亘古开来 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU26` | 利刃猛醒 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-1008153816247` | 利刃猛醒 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU30` | 璀璨诡幻 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU32` | 璀璨诡幻 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-1050867876169` | 星彩晶璃 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU38` | 奇迹启程 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU40` | 太晶盛聚 · Sobre 10 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-1065055849565` | 共逐荣光 · Sobre 5 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-1063240655679` | 共逐荣光 · Sobre 20 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU15` | 胜象星引 · Sobre 6 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU17` | 暗影夺辉 · Sobre 6 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU20` | 怒炎灼天 · Sobre 6 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU22` | 极巨攻防 · Sobre 6 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU23` | 终末炎舞 · Sobre 6 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-975082756071-SKU16` | 胜象星引 · Caja | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-975082756071-SKU18` | 暗影夺辉 · Caja | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1064307763243` | 太晶盛聚 · Caja | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1079986406064-SOBRE` | 30周年庆典 · Sobre 6 cartas | Chino simplificado | Frente y dorso del sobre, detalle del sellado |
| `ZH-1079986406064-SKU08` | 30周年庆典 · Bundle Set con monedas | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1059308989628` | 30周年庆典 · Set de ilustraciones Vol.2 | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1070165751188` | 30周年庆典 · Set de ilustraciones Vol.3 | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1065661862776` | 宝可梦集换式卡牌游戏 大师战略卡组构筑套装 猛雷鼓ex · Kit de mazo | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1065668842312` | 宝可梦集换式卡牌游戏 大师战略卡组构筑套装 赛富豪ex · Kit de mazo | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1065354470710` | 宝可梦集换式卡牌游戏 嗨皮组合 快龙&超梦&喷火驼&来悲粗茶 · Kit de mazo | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1070975018438` | 宝石包 VOL.6 · Caja | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1049188091485` | 宝可梦集换式卡牌游戏 PTCG 简中 朱&紫 厄诡椪水井面具礼盒 · Caja especial | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |
| `ZH-1050912901200` | 宝可梦集换式卡牌游戏 PTCG 简中 朱&紫 厄诡椪火灶面具礼盒 · Caja especial | Chino simplificado | Frente cerrado, dorso, laterales, detalle del sellado; si vendés el contenido por separado, una foto de cada tipo |

Prioridad sugerida: (1) lo que efectivamente vas a vender primero; (2) 宝石包 VOL.6 y el Vol.3 de 最初的伙伴 (hoy con imagen de presentación del proveedor); (3) las cajas de 胜象星引 y 暗影夺辉 (foto pequeña); (4) los sobres de Black Bolt, White Flare e Inferno X (foto oficial de baja resolución).

## 5. Imágenes: permiso de uso
- [ ] Permiso (o reemplazo por fotos propias) de las imágenes de referencia: las del fabricante (enlace oficial sin permiso concedido) y las de los proveedores de Tmall/Taobao. **No se afirma que se hayan verificado licencias.**

## 6. Confirmaciones de producto (lote chino)
- [ ] Unidad de venta (caja o sobre) y sobres por caja de 太晶盛聚 («Gran Reunión Teracristal»; el título de la publicación habla de «补充包10张装» y las fotos muestran un envase alargado), y sobres por caja de 胜象星引 y 暗影夺辉. *(宝石包 VOL.6 ya está confirmada: caja de 18 sobres de 4 cartas.)*
- [ ] Variantes sin cargar por falta de datos legibles: 星彩晶璃 de 20 cartas, 无畏太晶 de 20 cartas, cajas «瘦盒/肥盒», 奇迹启程 (caja), cajas de regalo y exhibidor del aniversario (ver [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md))
- [ ] Artículo 1027185914261 (sin carpeta de fotos: sigue pendiente)

## 7. Mayoristas y encargos (decisiones del dueño, no se inventaron)
- [ ] **Compra mínima mayorista** (por importe y/o unidades).
- [ ] **¿El 30% se acumula con el 10% por transferencia (y con las cuotas)?** Hoy no se aplica ningún descuento acumulado.
- [ ] **Aprobación de cuentas mayoristas: manual o automática.** Hoy toda solicitud queda «pendiente» y nadie tiene precio mayorista.
- [ ] Confirmar la **base del 30%** (interpretación de trabajo: precio minorista de lista) y el **alcance del 10%** (interpretación de trabajo: todo el subtotal de productos del pedido con caja; configurable a «solo cajas»).
- [ ] Encargos: plazos, si la seña (20%) es reembolsable, cuándo se paga el saldo, vigencia de la cotización, cancelación y si el 30% o las promociones aplican a un encargo. También **cómo se carga y comunica la cotización** (hoy la web solo informa la regla del 20%).
- [ ] ¿Kits, bundles o cajas especiales cuentan como «caja» para las promociones? Hoy no.
- [ ] ¿El efectivo también lleva 10%? Hoy no (el pedido solo dice transferencia).

## 8. Referencias que faltan
- [ ] **Nombres en inglés (tanda 5):** revisá la tabla de [NOMBRES-INGLES.md](NOMBRES-INGLES.md). Todos son nombres comunitarios o descriptivos (no oficiales) salvo «30th Celebration». Confirmá o corregí los que tienen variantes: 璀璨诡幻 («Brilliant Illusions» / «Brilliant Fantasy» / «Sparkling Fantasy»), 真实玄虚, 嘉奖回合, 黑晶炽诚, 利刃猛醒, 胜象星引 y los sets 最初的伙伴.
- [ ] **«sparking»:** sigue sin asignar (ver NOMBRES-INGLES.md); no es «Surging Sparks». Pasá el nombre chino, el número de artículo o una foto.
- [ ] «Prismatic Evolutions chino» se tomó como 太晶盛聚 / Terastal Gathering (temática Eevee) **como referencia tuya, no como equivalencia**: no se lo nombró «Prismatic Evolutions».
- [ ] Mejor foto de la caja de 太晶盛聚 y de 宝石包 VOL.6 (el material del proveedor solo trae fotos de baja resolución o sin la caja): ver [FOTOS-A-TOMAR.md](FOTOS-A-TOMAR.md).

## 9. Garantías de rareza (opcional)
- [ ] Si tenés una fuente oficial o el packaging de una caja concreta que declare una rareza garantizada, pasala: se carga con fuente, fecha y alcance. Hoy **ninguna** caja tiene una garantía de rareza documentada (ver [GARANTIAS.md](GARANTIAS.md)).

## 10. Tanda 6: precios en USD, dólar, fotos y aniversario (14/10/2026)
- [ ] **Cargar el precio base en USD y el stock** de cada producto desde `/admin` (ningún producto tiene precio todavía; no se inventó ninguno). Si tenías precios en pesos de antes, no se convirtieron: quedan como «dato anterior».
- [ ] **Confirmar el redondeo:** se interpretó «múltiplo de $100 más cercano, con las mitades hacia arriba» (USD 10 × 1.235 → $12.400). Decime si preferís siempre hacia arriba o hacia abajo.
- [ ] **Confirmar el criterio de antigüedad de la cotización** (propuesto, no decidido): al día hasta 2 h; entre 2 h y 24 h se usa con aviso; pasadas 24 h sin consulta exitosa los precios en pesos quedan pendientes; el valor del proveedor con más de 5 días de publicado se descarta; un salto de más del 50% se descarta como sospechoso. Ver [COTIZACION.md](COTIZACION.md).
- [ ] **Bulbasaur (borrador):** el envase de las tres imágenes (Bulbasaur, Totodile y Torchic) dice «全9种 · 每种等比生产, 随机获得其中1张» (9 tipos, 1 carta al azar) y aclara que el producto puede no incluir la carta de la portada. Los tres enlaces de Taobao son del mismo artículo 1024232254134 y del mismo SKU 6053279645670: **no prueban que se pueda elegir Bulbasaur**. Antes de publicar la ficha hay que confirmar con el proveedor si se vende la carta de Bulbasaur seleccionada o un paquete aleatorio. Está oculta, sin precio ni stock, y no promete Bulbasaur.
- [ ] **Portadas de Vol.2 y Vol.3:** se usaron las imágenes que elegiste (Totodile → Vol.2, Torchic → Vol.3) porque esas fichas ya mostraban esos mismos envases. Pero esas imágenes son del artículo de «cartas P» (1024232254134), no de las publicaciones de los sets Vol.2/Vol.3 (carta + marco + sobre de 5): si querés la foto exacta de cada set, hay que pedirla al proveedor.
- [ ] **Fotos de tu stock real:** ninguna foto es de tu stock. Subilas desde `/admin` cuando las tengas (ver la lista de faltantes en [FOTOS-A-TOMAR.md](FOTOS-A-TOMAR.md)).
- [ ] **Encargos:** esta tanda solo convierte precios de catálogo; **no hay todavía un flujo para cargar y aceptar la cotización de un encargo** (sigue siendo por WhatsApp).
- [ ] `CRON_SECRET` (opcional) si querés que un programador externo actualice el dólar; y, en producción, un disco persistente con copias de seguridad para la base **y** la carpeta `uploads/`.
