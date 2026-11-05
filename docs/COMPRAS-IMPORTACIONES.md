# Compras e importaciones

## Registrar una compra desde cero

1. Entrá a **Compras e importaciones → Registrar compra**. Cargá proveedor, referencia, fecha, moneda y cotización histórica. Elegí los productos del catálogo y guardá el borrador. Adjuntá facturas y comprobantes en **Adjuntos privados**.
2. En **Destinos y publicación**, distribuí cada artículo entre reventa, encargo, vendido y personal. Si elegís encargo o vendido, vinculá la línea de un pedido o de una venta vigente. Para un encargo, confirmá la seña y marcá la compra al proveedor en **Pedidos** antes de asignarlo al envío.
3. Marcá la fecha real de compra al proveedor. Creá el envío en **Envíos** y asigná cantidades de cada destino desde la compra. Podés repartir un destino entre envíos y agrupar varias compras en un envío. Cargá las etapas del viaje con su fecha real.
4. Cuando el envío figure recibido en Argentina, abrí **Revisar recepción** en cada tramo. Ingresá las cantidades acumuladas de buenas, faltantes y dañadas. Las demás siguen pendientes. Una corrección conserva la revisión anterior y registra la diferencia en el historial. Si el stock de reventa todavía figura pendiente o el producto está marcado solo por encargo, regularizá el conteo o el modo de venta en **Productos** antes de acreditar entradas.
5. Completá el envío, la aduana y los demás gastos en **Editar compra y gastos**, incluso después de recibir. Para un gasto real de cero, elegí **Definitivo** y escribí 0. El costo por unidad del borrador es provisional. Al cerrar costos se guardan el reparto por artículo y el costo final. Las unidades personales participan del reparto y su parte queda fuera del promedio comercial. Los costos ya aplicados a ventas permanecen congelados.
6. En **Egresos pagados**, vinculá un egreso ya registrado en Contabilidad o ingresá uno nuevo cuando efectivamente pagues. Los costos de la compra y el dinero pagado se consultan por separado.

Una recepción de reventa registra una entrada por las unidades buenas. Las unidades de pedidos, ventas previas y uso personal se registran en la recepción y conservan su destino. Una venta ya descontada conserva su movimiento original. Si una corrección contradice una entrega o una llegada ya confirmada de un encargo, usá **Incidencias** del pedido para registrar la novedad.

## Publicación y preventa

- **No mostrar** deja el destino privado. **Próximamente** anuncia la cantidad entrante de reventa. **Preventa** guarda el precio confirmado del destino y habilita la solicitud por tramo cuando el envío ya salió y la configuración comercial está activa. Las cantidades disponibles para entrega inmediata siguen el stock físico.
- Al solicitar la reserva con una cuenta verificada, se toma el cupo de un tramo concreto en una transacción. El pedido registra la solicitud y la retención. La seña del 20% se paga con los datos de transferencia del seguimiento y el comprobante queda en revisión. La reserva se confirma cuando la tienda registra la seña. El seguimiento solicita el 80% restante al llegar las unidades revisadas a Argentina, antes del despacho o al retirar.
- Si vence el plazo sin comprobante en revisión ni pago confirmado, el seguimiento deja de pedir transferencias y el cupo se recupera al procesar otra solicitud del tramo. El administrador también puede usar **Liberar unidades** en Compras. Un comprobante en revisión conserva el cupo hasta que el administrador lo revise. Si se rechaza tras el vencimiento y no hay un pago confirmado, las unidades pueden liberarse. Ante una transferencia tardía, la persona debe contactar a la tienda con su referencia.
- Para cancelar, usá el flujo de Pedidos y, si corresponde, su registro de reintegro. En Compras se pueden devolver las unidades del pedido cancelado al tramo de reventa antes de que se revise su recepción. Una vez revisadas, cualquier reclasificación de mercadería requiere revisar el caso en Pedidos y registrar el ajuste explícito de stock que corresponda.
- La preventa viene deshabilitada. Antes de habilitarla, definí el plazo de retención y cómo atender transferencias tardías y comprobantes en revisión. Configurá `IMPORT_PREORDERS_ENABLED=1` y `IMPORT_PREORDER_HOLD_HOURS` con el plazo elegido en horas enteras (entre 1 y 168). El precio confirmado debe ser de al menos $500 y múltiplo de $5 para que la seña sea un importe entero aceptado por el sistema de pagos.

Los adjuntos de compra y los comprobantes de clientes usan el almacén privado de comprobantes. Conservá el respaldo del almacén privado junto con el de PostgreSQL. La descarga de adjuntos de compra exige sesión de administrador.

## Vista previa local en Windows

Desde la raíz del proyecto, ejecutá `./scripts/preview-compras.ps1`. Usa el PostgreSQL aislado de `.local/dev-pg-compras`, puerto 54571, y el sitio en `http://127.0.0.1:3127`. Si la vista previa ya está abierta, podés usar la misma URL. La configuración de prueba habilita una retención de 24 horas y guarda adjuntos y correos localmente.

- Administrador: `admin.compras@example.test`
- Cliente: `cliente.compras@example.test`
- Segunda cuenta: `otra.compras@example.test`
- Contraseña de las tres cuentas: `Demo-Compras-2026!`

Entrá a `/admin/compras` para comenzar. En `/proximamente` podés recorrer las publicaciones creadas desde el panel. Usá importes y archivos ficticios para la prueba.
