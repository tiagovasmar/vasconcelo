# Ventas manuales y movimientos de stock (tanda 7, 15/10/2026)

Sección «Ventas» del panel del dueño (`/admin/ventas` y `/admin/ventas/movimientos`). Solo el administrador configurado (`ADMIN_EMAIL`, correo confirmado) puede verla o usar sus rutas: lo decide el servidor (401 sin sesión, 403 si no es el dueño, 404 en las páginas). Ver [ADMIN.md](ADMIN.md).

## Qué hace
- **Registrar una venta** (también las hechas fuera de la web): productos, cantidades, **precio de venta realmente cobrado** (pesos enteros, editable; se sugiere el precio de lista), método de pago (los tres vigentes) y observación opcional. No se aplican descuentos solos.
- **Resumen antes de confirmar**: lo calcula el servidor (`POST /api/admin/ventas/previsualizar`, no escribe nada) y muestra, por producto, el stock actual y **cómo quedará** (`20 → 17`). Si algo no se puede vender (stock insuficiente o pendiente) lo marca y no deja confirmar.
- **Confirmar**: registra la venta y descuenta el stock **en una sola transacción** (`src/features/sales/service.ts`, `registerSale`). O queda todo (venta, líneas, movimiento, historial de cambios y nuevo stock) o no queda nada.
- **Anular** una venta (corrección de un error): devuelve el stock una sola vez, exige un motivo y deja la venta marcada «ANULADA» (no se borra).
- **Entradas y ajustes de stock** (`/admin/ventas/movimientos`): entrada de mercadería (suma) o ajuste a la cantidad contada (fija el valor); los dos piden motivo. Editar el stock desde «Productos» también queda como movimiento (ajuste, con motivo «Edición directa en Productos» o el que se escriba).
- **Historial de movimientos**: entradas, ventas, ajustes y anulaciones con fecha, tipo, producto, variación, stock antes → después, motivo y **responsable** (correo del administrador). Filtrable por tipo y por producto.
- Los filtros y el aviso de **stock bajo** de «Productos» siguen igual; en el buscador de ventas se ve «stock bajo» junto a cada producto.

## Garantías y cómo se hacen cumplir
| Garantía | Mecanismo |
|---|---|
| Descuenta una sola vez; sin ventas duplicadas por doble clic o reintento | Clave de operación (`idempotencyKey`) única en la base + candado por clave. Misma clave y mismo contenido devuelve la misma venta (`replayed`); misma clave con otro contenido se rechaza. El botón se bloquea mientras la operación está en curso. |
| Sin cantidades negativas | El servicio verifica el stock bajo candado; además la base lo impide (`CHECK` en `product_overrides.stock_quantity` y `stock_movements.stock_after`). |
| Dos ventas simultáneas del mismo producto | Candado `override:<producto>` (el mismo que usa el panel al editar), tomado en orden fijo: la segunda ve el stock ya descontado. |
| Fallo a medias | Todo ocurre dentro de `db.transaction`: si la segunda línea falla, la primera se revierte. |
| Precios conservados | `sale_lines.unit_price_minor` guarda lo cobrado; también el precio de lista y el USD de ese momento, solo como referencia. No se recalcula nunca. |
| El historial no se edita ni se borra | No existen rutas ni pantallas para editar/borrar, y la base rechaza `UPDATE`/`DELETE` con disparadores (`historial_inmutable`, `venta_solo_se_anula`: lo único permitido sobre una venta es anularla una vez). |
| Consultas y carritos no descuentan stock | Las consultas por WhatsApp (`/api/inquiries`) no tocan stock (probado). Solo una venta confirmada acá lo hace. |
| Acceso | `adminAction` (`src/server/admin-api.ts`): mismo origen, administrador, límite de uso y JSON válido. |

## Reglas de negocio que quedaron fijadas (revisar)
- Solo se vende lo que tiene **stock cargado**. Stock pendiente (desconocido) → hay que cargarlo primero (ajuste). Un producto «solo por encargo» sin stock → registrar primero una entrada (y desmarcar «por encargo» si corresponde).
- Los productos ocultos o en borrador se pueden vender (el stock es del dueño); los **retirados por código** no.
- Una anulación necesita que el stock del producto no esté «pendiente».
- Las ventas no tienen cliente asociado ni número de pedido de la web (no se pidió).

## Base de datos
Migración `drizzle/0001_ventas_y_movimientos_de_stock.sql`: tablas `sales`, `sale_lines`, `stock_movements`, restricciones y disparadores. **No está aplicada en producción**: hay que correr `npm run db:migrate` con la conexión directa de Supabase (`DIRECT_URL`) antes de publicar esta rama. Las tres tablas entran en el respaldo/restauración (`optional`: un respaldo anterior sigue siendo válido).

## Pruebas
- `tests/ventas.test.ts` (PostgreSQL real): descuento único, atomicidad, concurrencia (misma clave desde dos instancias; dos ventas distintas por el último stock), precios congelados, validaciones, anulación, entradas/ajustes con idempotencia, inmutabilidad del historial, rutas con 401/403/origen.
- `tests/e2e/admin.spec.ts` («ventas: …»): recorrido en el navegador con doble clic, stock insuficiente, entrada, anulación y accesibilidad (axe) en escritorio y móvil.
