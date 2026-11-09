# Exportar el catálogo mayorista a PNG

En `/mayoristas/catalogo`, una cuenta mayorista aprobada puede usar **Generar imágenes**. Se aplican la búsqueda, el idioma y la presentación elegidos. Para exportar solo cajas, seleccionar «Caja» antes de generar.

Se consulta de nuevo el catálogo autorizado en el servidor, sin caché, antes de cada generación. El PNG muestra foto, nombre, idioma, precio BASE en USD (primer tramo por cantidad) y desde cuántas unidades aplica. No usa la cantidad que se haya ingresado para armar un pedido ni el descuento del último tramo. **Solo exporta productos con precio positivo publicado**; los pendientes quedan fuera. Si falla una foto, informa el faltante sin impedir exportar los precios.

Cada lámina tiene hasta seis productos, resolución 1080 × 1560 y un enlace individual para descargarla. Lleva fecha de generación en Buenos Aires y la referencia USD→ARS que efectivamente devuelve el servicio de cotización, con fecha, modo manual o aviso de antigüedad cuando corresponde. Si la cotización venció o falta, no inventa una: informa que no está disponible y mantiene los precios en USD. El precio se acerca al título según ocupe una o dos líneas.

La marca de agua diagonal repetida «VASCONCELO TCG» se incorpora al contenido de todas las imágenes, sobre fotos y texto. Dificulta la reutilización sin atribución; no garantiza impedir copias. «Descargar PDF completo» reúne todas las láminas de esa generación, en el mismo orden y con las mismas marcas, fecha y precios. La biblioteca PDF solo se carga al pedirlo. Si el navegador bloquea la descarga automática, queda un enlace para descargar de nuevo.

El encabezado de la imagen y el bloque de exportación muestran el mínimo configurado en el admin. La base **ficticia local** y el generador de vistas de prueba ahora usan **3 cajas en total**, según el pedido del dueño. No se cambió la configuración de producción.

Las láminas se generan en el navegador y no se guardan en Storage. Una imagen descargada es una instantánea: para compartir nuevos precios hay que volver a generar, sin editar fotos ni código. No se exportan costos internos, datos de clientes, cantidades de stock o pedidos.

Validación local: build de producción, typecheck, pruebas de acceso y actualización de precios, precio base y zona horaria; recorrido real con cuenta ficticia aprobada, descarga de PNG, filtros y regeneración; revisión en 360, 390, 430 y 1440 px sin desborde ni errores JavaScript. Todo contra una base local descartable, sin migraciones ni cambios de producción.

Resultado de esta sesión: 14 pruebas específicas y de mayoristas aprobadas. En `npm run verify` pasan typecheck, lint (cuatro advertencias existentes) y catálogo; Vitest termina con 604 aprobadas, una omitida y cuatro fallas en pruebas de galerías (`china`, `colecciones`, `galerias`) por expectativas sobre procedencia, rutas y cantidad de fotos anteriores. Esta tarea no modifica esas imágenes ni los datos del catálogo. La suite general no queda declarada en verde. Evidencia visual y PNG descargado en `.local/exportar-capturas/`.

Segunda revisión: 16 pruebas específicas y de mayoristas aprobadas, typecheck y lint de archivos modificados sin errores. Descarga real de PDF de tres páginas y PNG, filtros y regeneración, sin desborde en los cuatro anchos. PDF reabierto con pdf-lib y `pdfinfo`, y primera página renderizada con Poppler para revisión visual. No se repitió la suite general, que conserva las cuatro fallas de galerías ya informadas.
