# Consultas del dueño (`/admin/consultas`)

Cambio de alcance del dueño (17/10/2026): sección «Consultas» conectada con el sistema de ventas y stock que ya existía ([VENTAS-Y-STOCK.md](VENTAS-Y-STOCK.md)). **Sigue sin haber** pagos en línea, alta de productos desde la web ni multivendedor. Migración nueva: `drizzle/0002_consultas.sql` (ver «Base de datos»).

## Qué se reutiliza y qué se agrega

No hay un segundo sistema de ventas ni de stock. «Convertir en venta» llama a `registerSale` y «Anular» a `voidSale` (`src/features/sales/service.ts`), con su misma transacción, sus mismos candados `override:<producto>`, su idempotencia, el stock siempre ≥ 0, los movimientos y el historial inmutable. Lo que se agregó:

- Columnas de gestión en `inquiries` (teléfono, origen, estado de gestión, contacto confirmado, motivo) y la tabla `inquiry_events` (historial de gestión).
- Tabla **`inquiry_sales`**: el vínculo consulta ↔ venta. Las ventas son un registro inmutable (la base solo deja anularlas), por eso el vínculo **no** se guarda en `sales`: vive aparte.
- `registerSale` acepta `inquiryId` (la venta, el descuento de stock y el vínculo van en la **misma transacción**); `linkSaleToInquiry` vincula una venta existente; `voidSale` cierra el vínculo.

## Registro de consultas

- La consulta se guarda **al confirmar el pedido en la tienda, antes de abrir WhatsApp** (ya era así). Agregar al carrito o abrirlo no registra nada.
- Guarda nombre y apellido (ya era obligatorio), **teléfono opcional** (campo nuevo del carrito, validado en el servidor), productos, cantidades, precios cotizados, moneda y cotización del dólar, entrega, pago y fecha. Es una copia: **no cambia** aunque cambien precios o productos.
- Sin duplicados: misma clave de idempotencia = misma consulta (probado con reintentos y envíos simultáneos).
- **«Consulta generada» ≠ «Contacto confirmado».** Abrir WhatsApp no demuestra que el mensaje se envió: toda consulta nace «generada» y el dueño marca «Confirmar contacto» a mano.
- **Consultas manuales** (`/admin/consultas/nueva`): para las que llegan por otro medio (WhatsApp directo, Instagram, Facebook, llamada, en persona, otro). Nacen con el contacto confirmado, con fecha editable (no futura) y no pertenecen a ninguna cuenta ni sesión.

## Gestión

- Listado con **búsqueda** por persona (sin distinguir tildes ni mayúsculas), teléfono (con o sin formato) o número de consulta, y filtros por **fecha** (días de Argentina, UTC-3), **estado** y **contacto**. Detalle con la consulta original, el historial, las notas y la venta vigente.
- Estados: **Pendiente, En seguimiento, Convertida en venta, No concretada**. «Convertida» solo se alcanza registrando o vinculando una venta y se abandona anulándola (vuelve a «En seguimiento»). «No concretada» admite un **motivo opcional**.
- **Notas internas** e historial (quién, cuándo, qué): no se editan ni se borran (la base lo impide).
- **Generar una consulta o cambiarla de estado no reserva ni descuenta stock.** Solo una venta confirmada lo hace.

## Convertir en venta

1. **«Convertir en venta»** abre el formulario de ventas existente con la persona, los productos «del stock», las cantidades y los precios de la consulta precargados; se puede editar todo (por ejemplo vender menos unidades).
2. El resumen (calculado por el servidor) muestra el **total final** y **cómo quedaría el stock** (`22 → 20`); si falta stock lo marca y no deja confirmar.
3. Al confirmar, **en una sola transacción**: se valida todo de nuevo, se toman los candados (clave → consulta → productos ordenados), se registra la venta, se descuentan **solo las unidades realmente vendidas**, se crea el vínculo y la consulta pasa a «Convertida» con el contacto confirmado. Si algo falla no queda nada.
4. **Sin duplicados:** la misma clave devuelve la misma venta (doble clic o reintento); dos conversiones simultáneas de una consulta → una gana y las otras reciben «ya convertida»; además hay un **índice único parcial** (una sola venta vigente por consulta).
5. **Productos por encargo:** no entran en la venta (el sistema de ventas solo vende lo que hay en stock y no admite stock negativo). Se listan aparte en la pantalla de conversión; no tocan el stock.
6. **Venta ya registrada a mano:** desde el detalle de la consulta, «Vincular una venta ya registrada» (ventas vigentes sin consulta). **No vuelve a descontar stock** ni modifica la venta.
7. El descuento por transferencia de la consulta no se aplica solo: las ventas guardan el precio realmente cobrado y el formulario avisa.

## Anulación y nueva conversión

«Anular venta» (desde la consulta o desde Ventas) pide un motivo, **devuelve el stock una sola vez**, deja la venta «anulada», **cierra el vínculo** (queda como historia, inactivo) y devuelve la consulta a «En seguimiento»: deja de contar como conversión y como ingreso. Después se puede **convertir de nuevo** con otra venta. El detalle muestra las ventas anuladas anteriores y el historial completo (venta registrada → anulada → registrada). Anular dos veces, o muchas a la vez, no devuelve nada más. Vincular y anular la misma venta a la vez deja un estado coherente (probado).

## Métricas

Consultas generadas, contactos confirmados, pendientes, en seguimiento, no concretadas y convertidas; **conversión sobre generadas** (convertidas ÷ generadas) y **sobre contactos confirmados** (convertidas ÷ con contacto); cada tarjeta muestra su cuenta y sin datos muestra «—». Con un período, las cifras de consultas son de las **consultas creadas en ese período, aunque se hayan convertido después**; **ventas e ingresos van aparte y por fecha de la venta**; las anuladas no cuentan. Cada venta muestra su cliente y consulta de origen (y viceversa).

## Base de datos (migración `0002_consultas`)

Solo **agrega**: columnas a `inquiries` con valores por defecto (las consultas existentes quedan «Pendiente / Consulta generada / de la tienda») y las tablas `inquiry_events` e `inquiry_sales`, con restricciones (estados válidos), un índice único parcial y disparadores (historial de gestión inmutable; el vínculo no se borra y solo se cierra una vez). No toca ni reescribe ninguna fila existente. Entra al respaldo/restauración como tablas opcionales. Antes de publicar: `npm run db:backup` y `npm run db:migrate` con `DIRECT_URL` (conexión directa o pooler en modo sesión).

## Límites y decisiones a revisar

- Las ventas no tienen fecha editable: la «fecha de la venta» es cuando se registra (así lo definió el sistema de ventas existente).
- Los productos por encargo no se pueden vender desde esta pantalla (ver arriba).
- Nombre y apellido ya eran obligatorios en el carrito; el teléfono es opcional.
- No hay exportación ni gráficos de las métricas.
