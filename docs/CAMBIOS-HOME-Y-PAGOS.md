# Inicio y condiciones de pago

## Décima revisión (13/10/2026) — galerías con fuentes separadas

Detalle y resultado de la búsqueda en [GALERIAS.md](GALERIAS.md); fotos que debería tomar el dueño en [FOTOS-A-TOMAR.md](FOTOS-A-TOMAR.md). Resumen: la galería de la ficha rotula cada foto («Foto de referencia del fabricante» / «Foto real del stock de la tienda») y su vista; la caja abierta de exhibición está identificada como tal; las cartas se presentan aparte como «ilustrativas, no contenido garantizado»; no se rellena con duplicados ni vistas generadas. No hay vistas oficiales adicionales del SKU exacto (se documenta cuáles se descartaron y por qué). Las fotos propias se cargan en `src/content/real/store-photos.json`.

## Novena revisión (13/10/2026) — etiquetas de colección e idioma

Cada tarjeta de producto muestra, debajo de la imagen, dos etiquetas discretas (`src/components/product-tags.tsx`): **colección** con nombre y código (p. ej. «Storm Emeralda · M6», enlazada a `/expansiones/<slug>`) e **idioma escrito** («Japonés», sin depender de una bandera). La ficha repite las mismas etiquetas, más grandes, pegadas al título. Los datos salen del catálogo (`expansion.name`, `expansion.code`, `product.language`); un pack con varias expansiones muestra una etiqueta por cada una. Las condiciones de pago siguen como información secundaria. Pruebas: `tests/e2e/colecciones-etiquetas.spec.ts`; capturas `docs/capturas/etiquetas-*`.

## Octava revisión (13/10/2026) — un banner por colección y carrusel

**Vigente; amplía la séptima** (el banner de Storm Emeralda se mantiene como primero y como modelo).

1. **Ocho banners** (`src/content/banners.ts` + `src/components/collection-banner.tsx`): Storm Emeralda, 30th CELEBRATION, Abyss Eye, MEGA Dream ex, Inferno X, Heat Wave Arena, White Flare y Black Bolt. Cada uno con arte, paleta, texto fantasma y composición propios (panel de arte a un lado u otro, inclinaciones distintas), textos en español sin fechas ni campañas, y los accesos «Ver productos» (`/sellados?expansion=<id>`) y «Galería de cartas» (`/expansiones/<slug>#exp-cartas`).
2. **Arte:** recortes de la ilustración de una carta oficial de la propia colección (Zekrom ex, Reshiram ex, Ho-Oh ex, Mega Charizard X ex, Mega Gengar ex, Zacian V, Mega Darkrai ex, Mega Rayquaza ex), sin nombre ni texto de la carta, desde los originales de 868×1212 de la caché local (no se descargó nada; las páginas oficiales de las colecciones se revisaron y sus imágenes clave traen texto/fechas/campañas japonesas incrustados, por eso no se usan). Script `scripts/colecciones/crear-arte-inicio.mjs`; registro `src/content/colecciones/imagenes-inicio.json` (origen, huellas, recorte; estado `reference`, sin permiso concedido). Se suman las fotos registradas del sobre y la caja cerrada de cada colección.
3. **Carrusel en el inicio** (`src/components/home-carousel.tsx`): arranca con Storm Emeralda, **sin rotación automática**, flechas, indicadores, teclado (← → Inicio Fin; el foco pasa al carrusel para no perderse), deslizado táctil nativo (scroll-snap), anuncio para lectores de pantalla, banners ocultos `inert` (fuera de la tabulación). `h1` único (oculto visualmente) y `h2` en cada banner.
4. **Carga diferida:** el primer banner pide sus imágenes con prioridad; las de los demás se piden recién al interactuar o cuando el banner contiguo está por mostrarse (verificado en la prueba e2e: antes de interactuar no hay pedidos de otras colecciones).
5. **Detalle de cada expansión:** usa el banner de su colección como encabezado (`h1`), con los botones que bajan a «Cartas» y «Productos» y el resumen de datos de la expansión.
6. Capturas: `docs/capturas/banner-escritorio-*`, `banner-movil-*`, `expansion-*`. Para agregar una colección: sumar una entrada en `banners.ts` y su arte en `crear-arte-inicio.mjs`.

## Séptima revisión (13/10/2026) — banner con identidad Pokémon y lenguaje de la referencia

**Vigente; reemplaza la dirección de «banner neutro» de la sexta revisión.** Referencia visual: la página oficial de la expansión (https://www.pokemon-card.com/ex/m6/), revisada visualmente; **solo se toma el lenguaje visual** (profundidad, diagonales, luces, texto fantasma, esquinas cortadas, flechas), nunca su interfaz, textos, campañas, promociones ni fechas japonesas.

1. **Banner** (`src/components/home-hero.tsx`): Storm Emeralda y Mega Rayquaza ex como protagonistas. Fondo esmeralda/negro con diagonales, luces, relámpagos dorados y texto fantasma «STORM EMERALDA» (SVG/CSS). Título, texto y los dos botones son componentes reales: «Explorar productos» (`/sellados`) y «Ver Storm Emeralda» (`/expansiones/storm-emeralda`). Sin cuotas ni descuentos dentro del banner. Altura de escritorio ≈ 500 px; en móvil el arte va primero (Rayquaza visible en la primera pantalla) y luego texto y botones.
2. **Arte y registro:** panel con la ilustración de Mega Rayquaza ex (recorte de la carta oficial 095/076 SR, del original de 868×1212 que ya estaba en la caché local; no se descargó nada nuevo; script `scripts/colecciones/crear-arte-inicio.mjs`) más las fotos registradas del sobre y la caja cerrada de Storm Emeralda. Registro en `src/content/colecciones/imagenes-inicio.json` (origen, huella del original y del derivado, recorte, estado `reference`, sin permiso concedido); `release:check` lo cuenta como imagen sin permiso. Límite: si el dueño autoriza un arte clave oficial de mayor calidad, se reemplaza el archivo y su registro.
3. **Cajas y Sobres, colecciones distintas:** Cajas = Inferno X y MEGA Dream ex; Sobres = Black Bolt y White Flare. Mismo tamaño, fotos con proporción real (`object-fit: contain`, sin deformar). Packs · Próximamente sigue debajo como franja sin enlace; luego Expansiones.
4. **Lenguaje de la referencia, solo donde ayuda a navegar:** rótulos con barra dorada oblicua y filete bajo los títulos; accesos con chip de flecha dorado; botones y paneles principales (Cajas, Sobres, Packs, banner) con esquinas cortadas y borde dorado también en las diagonales (el foco de teclado sigue visible); **cartas destacadas con zoom** al pasar el mouse o enfocar (llevan a la galería de la expansión). Las demás secciones, el catálogo, carrito, cuentas, panel y compra por WhatsApp no cambian.
5. Capturas: `docs/capturas/inicio-*` (incluye `inicio-escritorio-cartas-zoom.png`).

## Sexta revisión (12/10/2026) — banner, Cajas/Sobres al mismo nivel, fotos recortadas

Vigente; se suma a la quinta (paleta y orden general).

1. **Banner principal** antes de las categorías (`#banner-title`): presentación de la tienda, frase breve, acceso al catálogo y fotos originales de Storm Emeralda, 30th CELEBRATION, Abyss Eye y Heat Wave Arena. Compacto, esmeralda/crema/oro, sin promociones de pago.
2. **Categorías:** Cajas y Sobres en la primera fila con el mismo tamaño; **Packs · Próximamente** como franja de ancho completo debajo, sin enlace mientras no exista un producto de formato `pack` (si existe, la franja pasa a enlazar a `/sellados?formato=pack`).
3. **Imágenes de categoría:** Inferno X y MEGA Dream ex (cajas cerradas y sobres individuales), para no repetir Black Bolt/White Flare. El banner usa otras colecciones.
4. **Fotos:** se muestran versiones de presentación `*-recorte.webp` que solo quitan el margen de fondo uniforme (sin escalar, estirar ni tocar el envase). Las generó `node scripts/colecciones/recortar-imagenes.mjs`; los originales siguen intactos y registrados con su huella en `src/content/colecciones/imagenes.json`; los derivados, con huella y operación, en `imagenes-recortes.json`. El `origin` de cada imagen sigue siendo el de la foto original. Cada foto se muestra con su proporción (misma altura, ancho natural, `object-fit: contain`).
   - Límite real: los sobres de Black Bolt, White Flare e Inferno X vienen de origen en baja resolución (≈264–278 px de ancho) y no se agrandan; se muestran pequeños. Hay que conseguir mejores archivos para mejorarlos.
5. Orden final: banner, categorías, expansiones, destacados, cartas, cómo comprar. Cuotas y descuento: una línea secundaria.
6. Capturas: `docs/capturas/inicio-*`.

## Quinta revisión (12/10/2026) — categorías primero, expansiones aparte, esmeralda y oro

Vigente; prioridad sobre las anteriores.

1. **Orden del inicio:** (a) tres categorías protagonistas bajo la cabecera: Cajas, Sobres y Packs, con fotos reales de producto y sin hero grande; (b) sección independiente «Elegí tu expansión» con las ocho colecciones (imagen, nombre y acceso a sus productos); (c) destacados; (d) galería de cartas; (e) explicación de compra por WhatsApp.
2. **Cajas y Sobres** abren el catálogo filtrado (`/sellados?formato=caja` y `?formato=sobre`). **Packs** muestra «Próximamente», sin enlace, mientras no exista un producto de formato `pack`; si se carga uno, el acceso pasa solo a `/sellados?formato=pack`. No se inventan composiciones, precios ni stock.
3. **Paleta esmeralda y oro** (inspirada en Storm Emeralda): esmeralda profundo `#0B4032` principal, crema `#F3F0E7` para superficies claras, oro suave `#D4B872` (token `gold`, reemplaza a `lime`) para detalles, bordes y acentos. El oro se usa como texto solo sobre fondos oscuros; sobre claro solo en bordes/relleno suave. Sin amarillo chillón ni grandes superficies doradas.
4. **Estilo tranquilo:** productos protagonistas, títulos moderados. Las 3 cuotas sin interés y el 10% con transferencia o efectivo quedan como línea informativa secundaria.
5. Se conserva la búsqueda actual y toda la funcionalidad. Capturas: `docs/capturas/inicio-*` (`node scripts/capturas-inicio.mjs`).


**Versión vigente: quinta revisión (ver abajo); la cuarta fue: colores originales con inicio tranquilo y pagos secundarios.** Las revisiones anteriores debajo documentan el historial; no son instrucciones para restaurar los diseños descartados.

Cambios pedidos por el dueño el 12 de octubre de 2026.

## Decisiones

- Priorizar la estética del inicio. Mantener la búsqueda de cartas actual; no cargar traducciones ni alias ahora.
- Mostrar en los productos: tarjeta de crédito en **3 cuotas sin interés**, o **10% OFF con transferencia o efectivo**.
- Mantener el cobro coordinado por WhatsApp. No incorporar pasarela ni pedir datos de tarjeta en la web.

## Implementación

- Inicio con fotos reales del catálogo: Black Bolt y White Flare en el hero; ocho colecciones con enlace al catálogo filtrado; accesos a sobres y cajas; productos destacados; cartas reales y pasos de compra.
- Se retiraron del inicio las ilustraciones de reserva y el acceso a Packs sin productos. Se conservaron las imágenes existentes y su registro de origen.
- Beneficios visibles en inicio, tarjetas, fichas y Cómo comprar.
- Carrito con crédito en tres cuotas, transferencia y efectivo como preferencias. Se conserva A coordinar para consultas anteriores y como valor inicial.
- Preferencia y beneficio incluidos en el mensaje completo y en el resumen de WhatsApp para pedidos largos. El resumen también conserva la entrega.
- El subtotal sigue siendo el valor de catálogo antes del descuento; se explica en el carrito. El descuento se aplica a los productos al coordinar el pago, con envío e importe final a confirmar. No se inventan precios, stock, número, bancos ni condiciones de una pasarela.
- Capturas del inicio: carpeta externa `outputs/home-redisenado/`.

## Verificación

- Typecheck, lint, catálogo y 88 pruebas de reglas pasaron.
- Build de producción aislado pasó; 37 páginas generadas.
- Revisión visual del inicio en escritorio y móvil, más enlace de Black Bolt al catálogo filtrado.
- Se actualizaron las pruebas de preferencias de pago y el script de capturas para la nueva sección de colecciones.
- No se envió ningún mensaje ni se procesó un pago. Las pruebas de recorrido completas no se volvieron a ejecutar en esta revisión.

## Pendiente comercial

Los 16 productos siguen con precio y stock pendientes y no permiten agregar al carrito. Hace falta cargar los valores del dueño y su WhatsApp para probar un pedido real. No confundir la publicidad de las condiciones de pago con una integración de cobro.

## Segunda revisión: protagonismo de pagos y nueva paleta

- El dueño pidió mayor protagonismo para las cuotas y el descuento, cambiar la paleta y el fondo del banner principal.
- Propuesta implementada: azul noche, azul, blanco frío y amarillo. Fondo claro con diagonales suaves, título «Tu próxima apertura, en 3 cuotas», aclaración sin interés y bloque amarillo de 10% OFF.
- Beneficios reforzados en la banda bajo el hero y en tarjetas/fichas. Paleta aplicada también a cabecera, botones, catálogo y banners de expansiones.
- Se actualizó `DISENO.md` y `CLAUDE.md` para que las referencias verdes anteriores no reemplacen esta revisión.
- Typecheck y lint de archivos modificados pasaron. Revisión visual a 390 y 320 px: beneficios legibles y sin desborde del hero. Contrastes de los pares principales: azul/blanco 6,67:1; azul noche/amarillo 11,77:1.
- Capturas de esta revisión en `outputs/home-azul-cuotas/` (fuera de la carpeta del proyecto). No se repitió la suite completa de pruebas funcionales: esta revisión modifica presentación y textos.

## Tercera revisión: un inicio mucho más tranquilo

- El dueño rechazó el protagonismo excesivo de cuotas/transferencia, el banner y la paleta llamativa.
- Productos y colecciones vuelven al frente. Hero neutro con título en sans «Tu próxima colección empieza acá», botón grafito y fotos sobre blanco. Títulos de secciones más moderados.
- Cuotas y descuento siguen disponibles, comunicados en texto pequeño y legible. Se retiraron el bloque amarillo, los badges promocionales y la banda de números gigantes; la banda ahora informa entregas.
- Paleta vigente: grafito, blanco, gris y azul pizarra. Fotos originales conservadas, sin recolorear los envases.
- Typecheck y lint de archivos modificados pasaron. La lógica de importes, las opciones de pago y el mensaje de WhatsApp no se modificaron.
- Capturas de esta revisión en `outputs/home-sobrio/`, fuera de la carpeta del proyecto.

## Cuarta revisión: volver a los colores originales

- Pedido del dueño: volver a los primeros colores.
- Restaurados tinta, papel crema, esmeralda y lima en el tema, banners secundarios, controles y detalles.
- Se conserva el diseño tranquilo del inicio. Fondo esmeralda suave, productos reales y pagos en texto discreto; no se recuperan las promociones grandes ni ilustraciones de reserva.
- Instrucciones de Claude y dirección visual actualizadas para conservar esta combinación.

## Undécima revisión (13/10/2026) — fondos de las fotos, banderas de idioma y referencias chinas

1. **Fondos blancos:** `scripts/colecciones/recortar-imagenes.mjs` ahora pasa a transparente el blanco del JPG **conectado con el borde** (relleno por inundación: los blancos interiores del envase se conservan), con borde suavizado de 1 px y sin tocar colores. Los derivados se llaman `*-limpio.webp` (nombre nuevo para no heredar la caché de imágenes). Las fotos van sobre un crema suave (`.tile-soft`) con sombra, en tarjetas, formatos, expansiones, fichas y banners; las tarjetas del catálogo pasaron de 1:1 a 5:4 para reducir el vacío.
   - **Límite real:** las 4 cajas de **Black Bolt y White Flare** tienen arte blanco que toca el fondo; un recorte se comería el envase. Se conservan con su fondo blanco, mostradas como placa clara con borde. **Pendiente: conseguir esas fotos con fondo transparente o en mejor archivo.** Los sobres de Black Bolt, White Flare e Inferno X siguen en baja resolución.
2. **Idioma con bandera:** componente `LanguageBadge`/`Flag` (`src/components/language-badge.tsx`, SVG propios) en tarjetas, fichas, expansiones y carrito. Mapeo central en `src/content/schema.ts` (`languages`, `languageLabel`). Se agregó el idioma `zh` = «Chino simplificado» (China continental); **ningún producto lo usa todavía**. Los filtros mantienen los mismos valores (`?idioma=ja`); el `<select>` es texto (no admite SVG).
3. **Referencias de Tmall:** 5 únicas en `src/content/colecciones/origen/tmall-pendientes.json`, **fuera del catálogo público**. No se pudieron verificar (la consulta devolvió una página vacía; no se eludió el login de Taobao). Un test garantiza que no haya productos `zh` publicados ni datos inventados. Faltan, por referencia: nombre/colección, idioma/mercado, formato y contenido de la variante, foto real y datos comerciales (precio, cantidad, disponibilidad).
4. Capturas: `docs/capturas/imagenes-idiomas/despues-*` (`node scripts/capturas-imagenes.mjs <prefijo>`). No quedaron capturas «antes» guardadas.

## Duodécima revisión (13/10/2026) — Vasconcelo, carrusel automático y catálogo chino

1. **Marca Vasconcelo.** `src/content/store.ts` (`name`): logo textual, cabecera, pie, títulos, metadatos y nombre accesible. Se conserva la identidad (verde oscuro, crema, dorado) y la tipografía; **no se inventó** dominio, redes, teléfono ni identidad legal. Textos globales actualizados para incluir las ediciones chinas (descripción del sitio, `h1` del inicio, catálogo).
2. **Carrusel del inicio con avance automático** (`src/components/home-carousel.tsx`): cada 6 s, con vuelta al primero tras el último. Pausa con el mouse encima, con el foco adentro, con la pestaña oculta y con un **botón accesible de pausa/reanudar** (la pausa manual se conserva al quitar el mouse o el foco). Con movimiento reducido arranca detenido. Cada navegación manual reinicia la cuenta. Un solo temporizador a la vez, limpiado al desmontar. El avance automático no mueve el foco ni se anuncia a lectores de pantalla (solo se anuncia la navegación manual). Mientras dura un desplazamiento programático el indicador ya no «rebota» al banner de salida.
3. **Catálogo chino**: 16 carpetas → 36 fichas y 18 colecciones en chino simplificado, con formatos nuevos (kit de mazo, caja especial, set de ilustraciones). Detalle por cada ID, evidencia, duplicados conciliados y pendientes puntuales en [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md). Todas con «Precio a confirmar» y compra deshabilitada.
4. **Modelo y filtros**: `Product.kind` suma `kit`, `special-box` e `illustration-set`; `Product.variant` (5 vs 20 cartas, Vol.2 vs Vol.3) y `aliases` (búsqueda por romanización); `expansionIds` puede ser vacío (kits y cajas especiales no pertenecen a una sola colección); `Expansion.code` es opcional; las fotos de proveedores tienen `source: "supplier"` y se rotulan «Foto de referencia del proveedor». Filtro `?formato=kit|especial|ilustraciones`.
5. **Inicio**: se agregó «Más formatos» (solo porque hay productos reales de esos formatos) y la sección «Ediciones chinas» (muestra de 8 de las 18 colecciones; el resto, desde el catálogo filtrado por idioma). Las 8 colecciones japonesas y sus banners no cambian. `/expansiones` agrupa por idioma.
6. **Fuente oficial**: las colecciones chinas no muestran «Ver fuente oficial» (la fuente es la publicación de un proveedor, listada en «Fuentes»).

## Decimotercera revisión (13/10/2026) — banner móvil, fichas simplificadas, garantías por caja y cajas sin fondo blanco

1. **Banner móvil más corto** (`collection-banner.tsx`, `home-carousel.tsx`): 390 px 688→536 (−22 %), 320 px 661→529 (−20 %), 430 px 650→564 (−13 %). Espaciado y disposición, sin alto fijo: botones en una fila («Galería» abrevia visualmente pero conserva el nombre accesible «Galería de cartas»), títulos un paso más chicos, controles más abajo. El botón de pausa/reanudar pasó a una esquina (arriba a la derecha en celular, abajo a la derecha desde `sm`) para que flechas + 8 indicadores quepan en 320 px con zonas táctiles de 40 px (flechas) y 24 px (indicadores). Avance de 6 s, vuelta al primero, pausas y movimiento reducido: sin cambios.
2. **Ficha simplificada** (`src/app/productos/[slug]/page.tsx`): en celular el orden es nombre + idioma → fotos → precio/compra/entrega → qué garantiza (el título pasó de ~900 px a ~200 px; precio y disponibilidad dentro de la primera pantalla). Idioma, disponibilidad y condiciones de pago aparecen una vez. Probabilidades (un solo desplegable, cerrado mientras diga «Dato no disponible»), fuentes y detalle de garantías: desplegables cerrados y accesibles por teclado. Contenido unificado (ya no se repite entre descripción y garantías), aleatoriedad limitada a lo documentado, y «La ficha muestra su contenido.» en vez de prometer cartas.
3. **Fotos y borradores:** no hay fotos del stock real en el proyecto (se dejó la etiqueta breve de referencia y la lista por producto en [PENDIENTES-DEL-DUENO.md](PENDIENTES-DEL-DUENO.md)). Condiciones §8 ya no dice «de demostración»: describe fotos de referencia del fabricante/proveedor, sin afirmar stock real ni licencias verificadas. Se conservan los avisos de borrador y «Sitio en preparación» (los datos legales siguen pendientes).
4. **Qué garantiza esta caja** (`garantias-resumen.tsx`, `garantias.ts`; detalle en [GARANTIAS.md](GARANTIAS.md)): un solo bloque junto al precio (reemplaza al «¿Qué asegura…?» del final de la página). Ninguna fuente documenta rarezas garantizadas en las 8 cajas japonesas: «Rarezas garantizadas: sin confirmación documental».
5. **Cajas de White Flare y Black Bolt sin fondo blanco** (`scripts/colecciones/separar-caja.mjs`): el relleno por inundación se filtraba por el arte blanco, así que la silueta se reconstruye por geometría (caja cerrada = hexágono convexo con vértices recuperados; caja abierta = tapa + cuerpo, con bordes rectos regularizados). Solo cambia el canal alfa; los blancos del envase no se tocan. Derivados nuevos `*-sin-fondo.webp` (se borraron los `*-limpio.webp` con fondo blanco de esas 4 fotos); originales intactos. Capturas antes/después en `docs/capturas/tanda3/`.

## Decimocuarta revisión (13/10/2026) — mayoristas, encargos, promociones con caja, títulos en español y fotos chinas

Detalle de reglas, valores y lo que sigue pendiente en [POLITICAS.md](POLITICAS.md).

1. **Mayoristas** (`/mayoristas`, `/mayoristas/solicitar`): 30% sobre el precio minorista de catálogo, **sujeto a condiciones por definir** (compra mínima, acumulación con el 10% y tipo de aprobación). Acceso desde el menú, el pie y una llamada breve en el inicio. «Solicitar cuenta mayorista» (persona nueva: crea la cuenta, confirma el correo y vuelve a la solicitud; cuenta existente: solicita sin crear otra) guarda nombre comercial o actividad, localidad, provincia y nota opcional; **una por usuario, estado «pendiente»**, visible en Mi cuenta. No activa ningún descuento ni acumula nada. Privacidad actualizada. Panel del dueño: `/admin/mayoristas` (solo lectura); aprobar/rechazar está preparado pero apagado (409 `policy_pending`).
2. **Consultar por encargo** (tarjeta, ficha y carrito): para productos sin precio/stock o agotados. Va en la misma consulta, sin precio ni cotización; el carrito separa «Para comprar» y «Por encargo»; el mensaje de WhatsApp y el detalle guardado también. Texto público: «una vez confirmadas la disponibilidad y la cotización, podés encargar abonando una seña del 20%; el saldo es del 80%». La seña (`senaYSaldo`) solo se calcula sobre una cotización confirmada: hoy la web informa la regla, no un importe.
3. **Promociones con mínimo de una caja:** franja visible en la primera sección bajo el banner del inicio («3 cuotas sin interés o 10% OFF por transferencia · compras que incluyan al menos una caja»); cajas con el beneficio junto al precio; sobres «Disponible al sumar una caja a tu pedido»; kits/bundles/cajas especiales sin beneficio propio. Carrito: las opciones de cuotas y transferencia se habilitan solo con una caja disponible, el 10% se muestra como línea aparte y se recalcula al quitar la última caja; el servidor lo valida (409 `promo_not_eligible`). Textos viejos «transferencia o efectivo» retirados (el efectivo ya no anuncia descuento).
4. **Cartas destacadas más arriba:** «Las cartas que querés encontrar» pasó justo después de los formatos (antes de las colecciones y de las listas de productos); mismo componente, sin duplicar.
5. **Chinos:** títulos principales en español (traducción descriptiva, no oficial; rotulada en cada ficha) con el nombre chino como dato secundario y buscable; slugs intactos. Fotos principales nuevas: 太晶盛聚 (envase de frente en lugar de la mano), 宝石包 VOL.6 (los sobres que trae, en lugar del cartel) y Vol.3 (el envase en lugar del cartel completo). 宝石包 VOL.6 queda como **caja de 18 sobres confirmada** por la ficha del proveedor.
6. **Next.js:** `<html data-scroll-behavior="smooth">` elimina la advertencia de desplazamiento suave (Next 16.4.0) sin cambiar el comportamiento.

## Decimoquinta revisión (13/10/2026) — nombres en inglés, sobres de 20 cartas retirados e inicio integrado

1. **Nombres en inglés** para las 18 colecciones y los productos con nombre propio de las ediciones chinas (tabla, fuentes y reservas en [NOMBRES-INGLES.md](NOMBRES-INGLES.md)). Reemplaza los títulos en español de la tanda 4, que quedan como alias. Formato: «Terastal Gathering · Caja», «Gem Pack Vol. 6 · Caja de 18 sobres». Cada ficha aclara de dónde sale el nombre (oficial, comunitario o descriptivo), las variantes y el nombre anterior en español; las fuentes consultadas aparecen en «Fuentes».
2. **Retirados** (`Product.retired`, `active: false`): los 8 sobres individuales de 20 cartas (lista en IMPORTACION-CHINA.md). Fuera de catálogo, búsqueda, destacados, relacionados y colecciones; la ficha directa responde «Producto retirado» (200, noindex); un carrito viejo los marca «retirados» (no ofrece pasarlos a encargo) y el servidor los rechaza (409); el panel del dueño no puede volver a mostrarlos. Los registros y consultas históricas se conservan. 奇迹启程 / Miracle Journey quedó sin productos publicados y deja de listarse (su enlace directo sigue respondiendo).
3. **Inicio sin sección china independiente:** se quitó «Ediciones chinas» y sus textos; «Elegí tu colección» muestra las 8 japonesas y 4 chinas seleccionadas (Terastal Gathering, Stellar Crystal, Brilliant Illusions, 30th Celebration), con bandera y nombre del idioma. El resto se recorre desde «Ver cartas de cada colección» y el filtro de idioma del catálogo.


## Decimosexta revisión (14/10/2026) — administrador completo, precios USD/ARS y portadas del aniversario

Ver [ADMIN.md](ADMIN.md), [COTIZACION.md](COTIZACION.md) y la sección «Tanda 6» de [IMPORTACION-CHINA.md](IMPORTACION-CHINA.md). Resumen: precios base en USD con conversión al dólar blue (venta) y redondeo a múltiplos de $100; panel con edición de precio, stock, título, descripción, publicación, fotos y cotización; instantánea de cotización en cada consulta; portadas de Vol.2 (Totodile) y Vol.3 (Torchic) del 30.º aniversario chino; ficha nueva de Bulbasaur como **borrador sin confirmar**. El inicio (banner y cartas destacadas) no cambió.
