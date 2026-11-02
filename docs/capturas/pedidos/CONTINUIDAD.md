# Capturas finales de continuidad

Datos ficticios de la vista previa local `http://localhost:3010`. Cuenta mayorista aprobada y cantidades cargadas. Condiciones reales pendientes; no se abrió un catálogo de producción.

| Pantalla | Escritorio | 360 px | 390 px | 430 px |
| --- | --- | --- | --- | --- |
| Catálogo aprobado | [escritorio](mayorista-catalogo-escritorio.png) | [movil-360](mayorista-catalogo-movil-360.png) | [movil-390](mayorista-catalogo-movil-390.png) | [movil-430](mayorista-catalogo-movil-430.png) |
| Ficha con aviso de reposición | [escritorio](cliente-ficha-agotado-avisame-escritorio.png) | [movil-360](cliente-ficha-agotado-avisame-movil-360.png) | [movil-390](cliente-ficha-agotado-avisame-movil-390.png) | [movil-430](cliente-ficha-agotado-avisame-movil-430.png) |

Prueba con nombre largo y precios grandes: [360 px](mayorista-regresion-360.png), [390 px](mayorista-regresion-390.png), [430 px](mayorista-regresion-430.png), [escritorio](mayorista-regresion-1440.png).

[Antes de corregir, 390 px](mayorista-antes-390.png) · [Diagnóstico exacto de 552 px](diagnostico-desborde.json) · [Informe de controles, consola e imágenes](INFORME.txt).

El [manifiesto](MANIFIESTO-CONTINUIDAD.json) identifica las 48 capturas de esta ejecución, con dimensiones y huellas. Incluye seguimiento de cliente y pantallas de pedidos, envíos, costos, mayoristas, reposición y avisos del administrador en escritorio y los tres anchos móviles. Las capturas históricas de la misma carpeta se conservan; el manifiesto distingue las actuales.

Los accesos se guardan únicamente en `.local/preview-pedidos-continuidad/acceso.txt` y sus archivos locales de contraseña, fuera de Git.
