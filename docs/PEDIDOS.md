# Pedidos, encargos, pagos, envíos, costos y mayoristas

Tanda de noviembre de 2026 (rama `feature/cuentas-pedidos-mayorista`, commits locales, **sin push, sin migración en Supabase real y sin publicación**).
Todo se apoya en lo que ya existía: `inquiries` (el pedido), `inquiry_lines` (sus artículos), `sales` y `stock_movements`, los candados de `src/db/lock.ts`, el historial de cambios y el correo. No hay un segundo sistema de pedidos ni de stock.

## 1. Cómo se conectan las piezas

| Pieza | Dónde vive | Qué hace |
| --- | --- | --- |
| Pedido con seguimiento | `order_tracks` (1 por consulta) + `order_events` (línea de tiempo) | Etapa logística, importe acordado, cancelación, enlace privado para invitados. |
| Pagos | `order_payments` | Ingresos **confirmados por el dueño**. Separados de la logística. |
| Comprobantes | `payment_receipts` + almacén privado | Archivo subido por la cliente. **No confirma nada.** |
| Incidentes y reintegros | `order_incidents`, `order_refunds` | Constancias. El sistema **no transfiere dinero**. |
| Envíos agrupados | `shipments`, `shipment_items` | Un envío lleva artículos de varios pedidos. |
| Entregas | `line_deliveries` | Entregas parciales o totales por artículo. |
| Avisos | `notification_outbox` | Cola de correos con reintento y sin duplicados. |
| Reposición | `restock_alerts` | «Avisame cuando vuelva». |
| Costos | `cost_purchases`, `cost_purchase_items`, `cost_expenses`, `cost_expense_shares`, `applied_costs`, `sale_commissions` | **Solo panel.** |
| Mayorista | `wholesale_tiers` + `admin_settings` (`wholesale.*`) + `inquiries.order_kind = 'mayorista'` | Tramos de precio, condiciones y pedidos. |

Una venta confirmada (`registerSale`) o vinculada abre el seguimiento sola (`consultas/links.ts`); una venta anulada cancela el seguimiento y, si se vuelve a convertir, lo reabre. Un pedido mayorista y un encargo nacen con seguimiento en «Solicitud recibida».

## 2. Seguimiento de una compra de stock

`Confirmado → Preparando → Enviado | Listo para retirar → Entregado`.
El estado del **pago** (`sin pago · comprobante en revisión · parcial · completo`) se calcula aparte y se muestra aparte. La cliente ve: línea de seguimiento con fechas reales, **importe acordado**, **pagos confirmados**, la acción que corresponde (una frase, nunca un tablero de deuda), sus artículos con avance, notas **públicas** y un acceso a WhatsApp con la referencia.

Las **notas internas, costos, proveedores, correos del equipo y claves del almacén no existen en la vista de la cliente** (`CustomerOrderView` no tiene esos campos; hay una prueba que lo verifica).

## 3. Encargos («traer a pedido»)

Etapas: solicitud recibida → producto, disponibilidad e importe confirmados → seña del 20% confirmada → comprado al proveedor → enviado por el proveedor → recibido en el depósito de origen → en tránsito a Argentina → recibido en Argentina → enviado al cliente / listo para retirar → entregado.

Reglas que el servidor hace cumplir (no la interfaz):

- Las etapas las carga el dueño con **fecha real**. Nada avanza por el paso del tiempo (hay una prueba que lo comprueba).
- No se confirma el producto sin **importe acordado**; no se compra al proveedor sin la **seña del 20%** confirmada; la seña confirmada registra sola la etapa «Seña del 20% confirmada» con la fecha del pago.
- Las etapas de transporte las gobiernan los envíos agrupados: el pedido avanza solo cuando **todas** sus unidades llegaron a esa etapa.
- Antes de despachar o retirar (`enviado`, `listo_retiro`) o de registrar una entrega tiene que estar confirmado el **pago completo** (seña + 80%). *Decisión de trabajo: ver DECISIONES-PENDIENTES-PEDIDOS.md §7.*
- No se puede marcar «entregado» por entregar solo una parte.
- Condiciones visibles para la cliente antes de pagar: seña del 20% del importe confirmado, 80% al llegar a Argentina (antes del despacho o del retiro) y reintegro de la seña si el paquete se pierde o un problema impide cumplir el encargo. **No se inventaron** el plazo de reintegro ni reglas de cancelación voluntaria.

## 4. Pagos, comprobantes, incidentes y reintegros

- La cliente adjunta el comprobante en su pedido. Queda **«pendiente de revisión»**. El dueño lo abre, y recién cuando ve el ingreso registra el pago (puede elegir el comprobante que lo respalda, que pasa a «aceptado») o lo rechaza con un motivo.
- **Archivo privado.** Va a un bucket privado distinto del de las fotos de productos (`SUPABASE_RECEIPTS_BUCKET`, por defecto `payment-receipts`) o, en desarrollo, a `RECEIPTS_DIR` (fuera de `public/`). Si no está configurado en producción, subir responde «no disponible»: **nunca** se cae al bucket público, y el código se niega a usar el bucket de fotos como bucket de comprobantes.
- **Validación en el servidor:** tipo REAL por el contenido (JPG, PNG, WebP o PDF; un ejecutable renombrado se rechaza con 415), tamaño máximo 4 MB (margen bajo el límite de 6 MB de las funciones de Netlify), hasta 6 comprobantes pendientes por pedido, límite de uso por IP, mismo origen. Las imágenes se re-codifican (se quitan EXIF y ubicación); los PDF se guardan tal cual.
- **Sin duplicados:** el mismo archivo en el mismo pedido (hash SHA-256) devuelve el existente, también en subidas simultáneas.
- **Descarga:** `/api/comprobantes/[id]` solo para la cuenta dueña, la sesión de invitado que creó el pedido, quien tiene el enlace privado o el administrador. Para cualquier otra persona responde 404. Encabezados `private, no-store`, `nosniff` y `Content-Security-Policy: sandbox`.
- **Pagos y reintegros con clave de idempotencia:** un doble clic o un reintento tras un corte de red devuelve el mismo registro; con otros datos responde 422. Un pago no puede superar el importe acordado. Un pago se **anula** (con motivo), nunca se borra.
- **Reintegros:** se registra el reintegro a devolver (no puede superar lo pagado y confirmado) y, cuando el dueño lo devolvió por su cuenta, lo marca con **fecha y constancia** (número de operación). La constancia es interna. **Cancelar un pedido no equivale a haber reintegrado**: la cancelación y el reintegro son registros distintos.

## 5. Envíos internacionales agrupados y entregas parciales

`/admin/envios`. Un envío se arma con artículos de varios pedidos (solo encargos y mayoristas ya comprados al proveedor; nunca más de lo pedido entre todos los envíos). Estados: armando → enviado por el proveedor → recibido en origen → en tránsito → recibido en Argentina, cada uno con su fecha real y solo hacia adelante.

El avance se **deriva por artículo**: la cliente ve, por cada artículo, «llegaron / en camino / todavía no viajaron / entregadas». Lo que no viajó nunca figura como recibido. Un pedido puede llegar en varios envíos. La entrega se registra por artículo y cantidad (solo lo que llegó y no se entregó).

## 6. Avisos por correo

Eventos: pago confirmado, proveedor despachó, llegada a Argentina (total o parcial), entrega parcial, listo para retirar, despacho, entregado, problema, reintegro y reposición. El aviso se **encola en la misma transacción** que el cambio; después se intenta enviar. Si falla: el cambio **se conserva**, el aviso figura *pendiente* o *falló* en `/admin/avisos` y en el pedido, con reintento. `dedupe_key` evita duplicados y el envío se reclama con un `UPDATE` atómico, así un reintento simultáneo no manda dos veces. Los avisos no llevan datos bancarios ni notas internas. Solo reciben avisos las cuentas con correo verificado; los invitados no dejan correo y ven el estado en la web. **No hay WhatsApp automático.**
Transporte: el de `src/server/mail.ts` (Resend/Brevo en producción, archivos locales en desarrollo y pruebas). Las pruebas nunca envían a clientes reales.

## 7. «Avisame cuando vuelva»

En un producto agotado (`stock = 0`) se pide el correo (invitados) o se usa el verificado de la cuenta, con **consentimiento expreso** (se guarda el texto y la fecha). Un aviso activo por producto y correo; se cancela desde la ficha, desde `/cuenta/avisos` o con el enlace firmado del correo. `/admin/reposicion` muestra cuántas personas esperan cada producto y deja avisar con un botón cuando hay stock. No es una consulta ni una venta, no reserva stock y no garantiza precio.

## 8. Costos privados, compras y ganancia (`/admin/costos`)

- Compra o lote: proveedor, fecha, moneda original (RMB, USD o ARS), **cotización usada**, artículos con su precio original y gastos compartidos (envío, impuestos, otros).
- **Cada gasto tiene una regla de reparto visible**: por unidades, por valor o manual (debe sumar el gasto). Se reparte en centavos exactos (mayor resto, desempate por orden) y el reparto queda guardado fila por fila. Al confirmar la compra se congelan costo total y **costo final por unidad puesta en Argentina**.
- **Costo histórico por venta:** al registrar una venta se guarda el costo promedio ponderado de las compras confirmadas **en ese momento** (`applied_costs`). Una reposición o un cambio de cotización no modifica la ganancia anterior. Sin costo conocido: **«Costo pendiente»**, nunca cero; se puede completar una vez (manual o con el promedio) y queda inmutable.
- Informe: importe de venta, descuentos, costo, comisiones, **cobrado** (pagos confirmados menos reintegrados) y ganancia calculada, separados. Las operaciones con costo pendiente no se cuentan como costo cero en la ganancia total.
- Costos, proveedores y márgenes **solo viven en páginas `/admin/*` y rutas `/api/admin/*`** (404/401/403 para cualquier otra persona). Una prueba verifica que una ficha pública no los contiene.

## 9. Catálogo y metodología mayorista

`/mayoristas` (información), `/mayoristas/solicitar` (la cuenta se **solicita y el dueño la aprueba a mano**), `/mayoristas/catalogo` (solo cuentas aprobadas, validado en el servidor).

- Tabla de pedido: buscar, filtrar por idioma y presentación, cantidades y, por producto: foto pequeña, idioma/edición, presentación, tramos, **precio unitario según el tramo** y total. Sin tramo alcanzado o sin precio: **«A cotizar»**.
- **Siempre por pedido**: el stock minorista no es stock mayorista y un pedido mayorista no reserva ni descuenta stock. Transferencia o efectivo **sin descuento adicional**; no se aplican el 10% por transferencia ni las cuotas sin interés. Financiación a 3 o 6 meses: solo consulta, sin prometer aprobación, cuotas ni tasas.
- **Precios:** los fija el dueño por tramo (en USD, convertidos a pesos con la conversión única del sitio). La referencia interna es **costo final × 1,5** (recargo del 50% sobre el costo, *no* un margen sobre la venta y *no* «30% menos que el minorista»); `/admin/mayoristas` la muestra junto al costo promedio. Los tramos nacen en borrador y se publican tras revisarlos; los precios deben bajar al comprar más.
- **Condiciones sin definir y por eso vacías** (campos listos, probados con datos ficticios): compra mínima, si los productos se combinan para el mínimo y cada tramo, tramos y demoras. **El catálogo no se puede abrir** (el servidor lo rechaza) hasta que estén definidas y haya un tramo publicado. La demora se informa con «desde cuándo se cuenta» y sin fechas garantizadas.
- Seguimiento, pagos, incidentes y entregas parciales: **los mismos que los encargos** (seña del 20% tras confirmar disponibilidad e importe; resto al retirar o antes del despacho).
- Se retiró el «30% sobre el precio minorista» de la lógica y de todos los textos (inicio, cuenta, cómo comprar, mayoristas, solicitud, panel).

## 10. Cuentas

«Continuar con Google» en ingreso y registro (ver [GOOGLE.md](GOOGLE.md)). La compra minorista como invitado sigue disponible. Los permisos de administrador y mayorista se validan siempre en el servidor con la sesión y la base.

## 11. Pruebas

Ver `docs/ESTADO.md` (sección de esta tanda) para lo ejecutado y sus límites.
