# Protectores solo como adicionales — 23/10/2026

Rama local `feature/accesorios-solo-adicionales`. Sin push, despliegue ni migraciones. No se modificaron precios, cantidades ni configuración de producción.

Los dos protectores tienen `addonOnly: true`, independiente de `active` y del stock. `listProducts` y el filtro público excluyen estos productos: no aparecen en inicio (En stock, destacados, formatos), catálogo, búsquedas ni relacionados. El filtro público Accesorios desaparece cuando no hay accesorios listables.

El admin y la validación de carrito/consultas/ventas siguen usando el catálogo completo. El selector de protección y las sugerencias mantienen las reglas actuales de precio y stock. No se deben desactivar estos productos desde el panel para ocultarlos: eso impediría venderlos como adicionales.

Las fichas directas se conservan para enlaces de carrito y detalles; sus metadatos llevan `noindex`. Oculto de listados no significa privado o protegido por autenticación.

## Verificación

- 35 pruebas dirigidas iniciales pasaron (catálogo, adicionales y nueva visibilidad).
- Suite unitaria completa: 511 pasaron, 1 omitida y 1 fallo por el conteo anterior de 52 fichas públicas. Se actualizó a 50 sellados públicos; las 35 pruebas de ese archivo y nueva visibilidad pasaron después.
- Typecheck y lint de los archivos cambiados pasaron; `git diff --check` limpio.
- Navegador mediante CUA sobre `http://localhost:3211`, catálogo ficticio con 10 sobres extra y PostgreSQL descartable. No se leyó ni escribió Supabase.
- Inicio a 360, 390 y 430 px: sin accesorios ni desborde horizontal. Listado en stock y búsqueda de sleeves: sin accesorios; sin filtro público de accesorios vacío.
- Ficha: elegir sobre extra tras Ver más, contraer, elegir sleeve y agregar conjunto. Carrito conserva caja, sobre y sleeve; descuento correcto (198.500 menos 1.250 = 197.250). Protección permanece disponible pese a no aparecer en listados.
- Carrito lateral a 360, 390 y 430 px: ancho interno sin desbordes tras cargar la validación. Resumen del pedido a los tres tamaños sin desborde. No se envió consulta ni mensaje.
- Capturas: `outputs/accesorios-ocultos` del workspace de revisión, fuera del repo.

No se ejecutó toda la suite e2e ni se probó un dispositivo físico/iOS. La revisión móvil abarca inicio, selector, carrito y resumen, no certifica todos los recorridos de la tienda. Las pruebas e2e anteriores que esperan accesorios en el catálogo requieren adaptar esa expectativa al nuevo requisito antes de una publicación.
