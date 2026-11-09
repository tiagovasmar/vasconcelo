# Precios mayoristas en Precios y stock

En `/admin`, cada producto editable incluye el desplegable «Precios mayoristas», junto al stock y precio minorista. También aparece en «Editar ficha». Permite leer los tramos publicados y borradores, editar sus precios USD, agregar o quitar tramos y publicar o pasar a borrador. Reutiliza el servicio existente: no cambia stock ni precio minorista y mantiene la validación de precios decrecientes por volumen.

Guardar un tramo lo deja como borrador. «Publicar precios mayoristas» lo muestra al cliente aprobado si el catálogo está abierto. Los cambios pendientes se advierten antes de abandonar la página. Las condiciones y aprobación de cuentas siguen en `/admin/mayoristas`, con un enlace al editor integrado; se retiró el formulario separado de precios.

El catálogo mayorista coloca primero los productos con precio publicado, en orden alfabético, y al final los pendientes. Se aplica a los mismos datos que se exportan a PNG/PDF. El panel principal también prioriza productos que tienen precio minorista o mayorista.

Verificación: 41 pruebas específicas de autenticación, Google, permisos del desplegable, mayorista y exportación; recorrido Playwright de solicitud/aprobación → edición de tramos → publicación → pedido/seña/envío; recorrido local de edición en tabla y ficha, comprobando stock y precio minorista intactos y catálogo ordenado; revisión a 360, 390, 430 y 1440 px. Base ficticia local en `http://localhost:3130`, sin migraciones ni publicación.
