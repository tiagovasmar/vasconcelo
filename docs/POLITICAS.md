# Políticas comerciales: promociones, mayoristas y encargos (13/10/2026, cuarta tanda)

Fuente única de la configuración: `src/content/politicas.ts`. Los cálculos viven en `src/features/politicas/` y el criterio monetario en `src/lib/money.ts`. **Lo confirmado por el dueño está como valor; lo que sigue sin definir es `null`/`false` y no se inventa.**

## 1. Promociones minoristas

Transferencia y efectivo tienen el mismo precio. El descuento histórico por transferencia se conserva en las consultas ya guardadas.

La promoción caja + sobres se configura en el panel. Por cada caja participante, hasta cinco sobres participantes reciben el 10% de descuento, con cualquier medio de pago. Los encargos y accesorios quedan fuera del combo.

## 2. Cuenta mayorista (solo el 30% está definido)

- **30% sobre el precio minorista de catálogo** (interpretación de trabajo: la base de comparación es el precio de lista). `precio mayorista = minorista − 30%`, redondeado al peso (`wholesalePriceMinor`).
- **Pendiente de definir por el dueño** (en `politicas.ts`, hoy `null`): compra mínima por importe/unidades · aprobación manual o automática.
- **Activación apagada** (`mayorista.activationEnabled = false`): las solicitudes se guardan y quedan **pendientes**; ningún usuario tiene precio mayorista (`wholesalePriceFor` devuelve `null`), el servidor rechaza cambiar estados (409 `policy_pending`) y el sitio no presenta la solicitud como descuento activo. No se aplica ningún descuento acumulado.
- Sin precio minorista → «Precio a confirmar»; no se inventa un precio mayorista.

**Cómo se activará cuando el dueño decida:** (1) completar compra mínima, acumulación y aprobación en `politicas.ts`; (2) pasar `activationEnabled` a `true`; (3) usar `reviewWholesaleRequest`/`PATCH /api/admin/mayoristas/[id]` (solo el administrador, validado en el servidor); (4) conectar `wholesalePriceFor(wholesaleStatusFor(db, userId), precio)` en `evaluateCart` (servidor) y mostrar el precio mayorista en tarjetas/ficha/carrito con el mismo redondeo. Los pasos 3 y 4 están preparados y probados con la activación simulada; el 4 **no está conectado** a propósito.

Datos de la solicitud (tabla `wholesale_requests`, una por usuario): nombre comercial o actividad, localidad, provincia, nota opcional, estado, fechas y, si se revisa, quién. Sin documentos ni identificaciones. Detalle de cuenta: [CUENTAS.md](CUENTAS.md). Panel del dueño (solo lectura): `/admin/mayoristas`.

## 3. Encargos con seña del 20%

- **Consultar por encargo** (tarjeta, ficha y carrito) arma una consulta con líneas `mode: "encargo"`. Se guarda en la misma tabla de consultas (`inquiry_lines.fulfillment = "encargo"`) **sin precio ni cotización** (importes en 0 = «no cotizado», que el servidor presenta como `null`). No reserva mercadería, no fija precio ni acredita un pago.
- Disponible cuando falta precio o stock (los 52 productos reales hoy) o está agotado; un producto inexistente o inactivo no se puede consultar.
- **Seña = 20% del importe cotizado y confirmado de lo que se encarga** (`senaYSaldo`), saldo 80%. Sin cotización devuelve `null`: nunca se calcula sobre un precio inexistente ni sobre el envío. En un pedido mixto, la seña no se calcula sobre el carrito completo: lo disponible va con su importe y lo encargado aparte.
- **Todavía no hay forma de cargar una cotización** (no estaba en el pedido): la función de seña está lista y probada, pero la web hoy solo informa la regla («una vez cotizado, la seña es del 20% y el saldo del 80%»). Falta decidir cómo se registra y comunica la cotización.
- **Sin definir (no se inventó):** plazos, seña reembolsable o no, momento del pago del saldo, vigencia de la cotización, cancelación, y si el 30% mayorista o las promociones aplican a un encargo (`encargo.*` en `politicas.ts`).

## 4. Criterio monetario

Importes en centavos enteros; descuentos, precio mayorista y seña se redondean **al peso** (mitad hacia arriba) con `percentOf`/`percentOff`, el mismo criterio en tarjetas, ficha, carrito, consulta y mensaje. Ejemplo: 12.345 − 30% → descuento 3.703,5 → 3.704 → precio 8.641.

## 5. Pruebas

`tests/politicas.test.ts` (promoción, redondeo, mayorista, seña, `evaluateCart`), `tests/encargos-y-mayoristas.test.ts` (consultas por encargo y solicitudes, con base en memoria), `tests/e2e/promos-encargos.spec.ts`, `tests/e2e/mayoristas.spec.ts`, el caso de `/admin/mayoristas` en `tests/e2e/admin.spec.ts` y `tests/e2e/colecciones-tanda4.spec.ts` (catálogo real). Las pruebas funcionales **no** miden rendimiento.
