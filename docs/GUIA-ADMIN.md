# Guía breve del panel (`/admin`)

Para el dueño. Todo lo que hacés acá se ve en la tienda al recargar; no hace falta tocar archivos.

## Entrar
1. Registrá tu cuenta en `/cuenta/registro` con el correo que figura en `ADMIN_EMAIL` y confirmá el correo.
2. Entrá a `/admin` (o desde «Mi cuenta»). Si `ADMIN_EMAIL` no está configurado, el panel está cerrado para todos.

## La lista de productos
- **Buscar:** por nombre, colección o SKU (sin importar tildes ni mayúsculas).
- **Filtrar:** por idioma, **formato** (caja, sobre, kit…), **colección** y estado: Pendientes, Disponibles, **Sin stock**, **Stock bajo**, Por encargo, Ocultos y Retirados. Los filtros se combinan y los números de cada estado se ven en la fila de botones.
- **Cada fila:** precio base en **USD**, el precio en pesos que resulta (con el dólar blue venta, redondeado a $100) y el **stock**.

## Cargar precio y stock
- **Una fila:** escribí USD y/o stock y pulsá «Guardar». Verás el precio en pesos en vivo (`→ $ 228.000`).
- **Varias filas a la vez (a mano):** editá todas las que quieras y pulsá «Guardar N cambios».
- **Edición múltiple (en masa):** tildá las filas (o «Seleccionar los N productos de esta lista»). Aparece una barra:
  - **Stock:** «Poner en», «Sumar» o «Restar» una cantidad.
  - **Precio base (USD):** «Fijar en USD» o «Ajustar en %» (por ejemplo `10` sube un 10 %, `-5` baja un 5 %).
  - «Aplicar a N» solo **prepara** los cambios en las filas (quedan marcadas); revisalos y pulsá **«Guardar N cambios»** para confirmarlos. Las filas por encargo (en stock) o sin precio (en %) se omiten y te lo avisa.
- **Stock:** `0` = «Sin stock» (se puede consultar por encargo); un número positivo = disponible y entra en «En stock»; «desconocida» y «por encargo» están en el editor de cada ficha.
- Si dos personas editan lo mismo a la vez, el panel rechaza el segundo cambio en vez de pisar el primero. Todo queda en el **Historial de cambios**.

## Aviso de stock bajo
Arriba de la lista, «Aviso de stock bajo»: elegí cuántas unidades alcanzan para avisar (por defecto 3; `0` lo apaga). Los productos publicados con entre 1 y esa cantidad se marcan **«Stock bajo»** y se filtran con el botón del mismo nombre. Es solo para vos: **no cambia la tienda ni envía correos ni mensajes**.

## Fotos de un producto («Editar ficha» → Fotos)
- **Subir varias a la vez:** elegí varios archivos o arrastralos a la zona punteada. JPG, PNG o WebP de hasta 8 MB y 300 px o más. Se suben en el orden elegido; las que el servidor rechaza (por tipo, tamaño o duplicadas) se listan una por una, sin frenar a las demás.
- **Orden y portada:** la **primera foto es la portada** (la que se ve en tarjetas y listas). Usá ↑ Subir, ↓ Bajar o «Hacer portada». Cada foto necesita un texto alternativo.
- **Quién sacó la foto:** marcá «mi stock real» solo para fotos propias; las de proveedor quedan como referencia.
- Nada se publica hasta que pulsás **«Guardar fotos»**. «Volver a las fotos del catálogo» deshace todo.

## Cotización del dólar (`/admin/cotizacion`)
La tienda usa el dólar blue (venta), consultado cada 15 minutos. Si el proveedor falla, se **conserva la última cotización válida**; si pasan más de 24 horas sin una consulta exitosa, el precio en pesos queda como «Precio a confirmar» (se sigue viendo el USD). Podés fijar un valor manual (rige hasta que vuelvas a automático). Detalle y pruebas en `docs/COTIZACION.md` y `docs/MEDICIONES.md`.

## Cosas que el panel no hace
Alta de productos nuevos, pagos en línea, avisos automáticos a clientes, ni descuento automático de stock al abrir WhatsApp: el stock lo manejás vos.
