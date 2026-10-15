# Dirección visual actual

## Cambios posteriores del dueño (prioridad sobre las referencias antiguas)

**Vigente (13/10/2026, octava revisión): un banner por colección con carrusel en el inicio y banner propio en cada expansión (ver `docs/CAMBIOS-HOME-Y-PAGOS.md`). Antes: banner con identidad Pokémon (Mega Rayquaza y Storm Emeralda, diagonales, luces, oro) y lenguaje visual de la página oficial de la expansión aplicado con medida; ver la séptima revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md`. Sobre eso rige además lo del 12/10: inicio con categorías Cajas/Sobres/Packs primero, luego las ocho expansiones; paleta esmeralda profundo + crema + oro suave (`gold` `#D4B872`) en lugar de lima. Detalle en `docs/CAMBIOS-HOME-Y-PAGOS.md` (quinta revisión). Lo que diga lima más abajo es historial.**

La última corrección del dueño restaura los colores originales: tinta `#121715`, papel crema `#F3F0E7`, esmeralda `#0B4032` y lima `#D8F661`. Se conserva la composición tranquila de la tercera revisión: productos y colecciones protagonistas, pagos secundarios. El hero tiene fondo esmeralda suave, título en sans «Tu próxima colección empieza acá», fotos reales de Black Bolt y White Flare y una línea discreta con las cuotas y el descuento. No restaurar números gigantes ni franjas promocionales. La búsqueda de cartas queda como está.

Conservar esta última revisión al continuar el proyecto: paleta original con la estructura tranquila actual. No restaurar los banners antiguos ni el exceso de énfasis en pagos. Ver `docs/CAMBIOS-HOME-Y-PAGOS.md`.

## Referencias vinculantes

Abrí las imágenes; no deduzcas el diseño únicamente de este texto:

1. `referencias/01-inicio-aprobado.png`: composición del inicio.
2. `referencias/02-catalogo-aprobado.png`: catálogo editorial.
3. `referencias/03-producto-aprobado.png`: ficha y secciones de cartas/contenido/probabilidades.
4. `referencias/04-carrito-aprobado.png`: distribución clara del carrito y preparación del pedido.

El dueño rechazó el primer inicio y catálogo porque parecían demasiado básicos. Aprobó la segunda propuesta y la ficha de producto. Del primer diseño aprobó el carrito; mantené esa claridad y adaptá solo los elementos comunes de marca a la segunda propuesta.

## Identidad

Tienda de coleccionismo Pokémon con energía de una página japonesa de expansión, composición editorial y funcionalidad comercial clara. El diseño debe sentirse trabajado en cada sección, no depender de un único banner bonito encima de una plantilla genérica.

- Marca provisional configurable: `TU TIENDA`; descriptor `POKÉMON TCG`.
- Tinta `#121715`, papel crema `#F3F0E7`, esmeralda `#0B4032`, oro suave `#D4B872` (antes lima) y rojo puntual para avisos. Los tokens son `emerald` y `gold`.
- Titulares condensados, grandes y con carácter. Texto y controles en una sans legible. Elegí fuentes con licencia compatible; guardalas localmente cuando sea posible.
- Grillas precisas, bordes finos, separadores, numeración editorial y texturas sutiles. No llenar todo de tarjetas redondeadas.
- Ilustraciones grandes, recortes de producto, profundidad por capas y composiciones asimétricas. La lectura y los botones tienen prioridad.
- Movimiento discreto: entrada de elementos, hover de imagen, cambio de galería. Nada que interrumpa comprar. Respetar `prefers-reduced-motion`.
- No copiar los errores, japonés decorativo sin validar, coordenadas ficticias ni afirmaciones añadidas por las imágenes generadas.

## Inicio

Cabecera con navegación, búsqueda, cuenta y carrito. Franja de entregas breve. Hero de expansión destacada con arte protagonista, titular muy grande y CTA `Explorar la tienda`. Copia de referencia aprobada: `No es solo un sobre. Es todo lo que puede venir adentro.`

Debajo, categorías Sobres / Packs / Cajas con composición propia, bloque de productos destacados funcional, acceso a expansiones y explicación visual Carrito → WhatsApp → Coordinamos tu entrega. Footer útil. Evitá repetir el hero en todas las secciones.

## Catálogo

Banner de expansión más compacto que el inicio. Filtros horizontales en escritorio, hoja/modal accesible en móvil. Grilla editorial con fondos y composiciones acordes al producto. Cada artículo debe mostrar producto, idioma, precio, disponibilidad y acceso a la ficha. La compra rápida nunca sustituye el acceso a información detallada.

## Ficha de producto

Primera pantalla con galería grande a la izquierda y datos/compra a la derecha. Las imágenes de producto deben dejar claro qué SKU se vende: una caja cerrada no se debe confundir con caja más sobres de regalo.

Anclas: Descripción, Cartas de la expansión, Probabilidades, Contenido de la caja. Galería de cartas como contenido informativo con zoom, filtros y fuentes. Bloque `¿Qué asegura esta caja?` con cantidades físicas y garantías verificadas claramente separadas. Tabla de probabilidades legible y colapsable en móvil. No convertir toda la ficha en una tabla fría ni esconder advertencias relevantes en texto ilegible.

Cada expansión puede tener su propio arte/paleta de apoyo. Rayquaza es el ejemplo de la referencia, no una mascota obligatoria para todos los productos.

## Carrito

Conservar la estructura aprobada: líneas de producto y opciones a la izquierda, resumen y CTA WhatsApp a la derecha. En móvil: productos, entrega, pago y resumen en ese orden. Mostrar subtotal y envío a coordinar sin fingir un total final conocido. Botón principal `Continuar por WhatsApp`.

## Recursos gráficos

Las imágenes de referencia son instrucciones de composición, no recursos comerciales validados. No usar una captura entera como página ni su texto rasterizado como interfaz. Construir componentes HTML reales, controles accesibles y texto seleccionable.

Para producto y cartas, priorizar fotos del dueño o imágenes correspondientes al SKU y set verificados, con registro de origen/uso. No hacer hotlink permanente a recursos ajenos ni descargar automáticamente catálogos completos. No inventar packaging ni usar la imagen generada de una carta como si fuera una carta real.

Durante la demo local se permiten recursos ilustrativos identificados, sin afirmaciones de catálogo real. Si faltan recursos finales, crear `docs/ASSETS-PENDIENTES.md` con archivo esperado, proporción, resolución y uso. Construir igualmente las capas, composición y efectos con CSS e imágenes disponibles. Mantener el nivel visual aprobado; no sustituir todo por rectángulos grises ni exigir que el dueño diseñe cada recurso.

Mantener un manifiesto de imágenes con fuente, licencia/permiso conocido y estado demo/final. Las imágenes no verificadas deben quedar fuera del catálogo de producción.

## Responsive y accesibilidad

Revisar al menos 390 px y 1440 px; comprobar también 320 px sin desborde horizontal. En móvil, hero diseñado para pantalla estrecha, titulares sin cortes, filtro accesible, productos legibles, galería táctil y compra fácil. No achicar simplemente la captura de escritorio.

Navegación por teclado, foco visible, labels reales, contraste suficiente, estados de carga/error/vacío, modal con manejo de foco y cierre con Escape. Imágenes con dimensiones para evitar saltos. Hero optimizado y catálogo/carta con carga diferida. No prometer métricas de rendimiento sin medirlas.
