> **Aviso (14/10/2026):** la base pasó de SQLite a PostgreSQL (Supabase) en la rama `migracion/netlify-supabase`. Donde este documento diga SQLite, `DATABASE_PATH` o `UPLOADS_DIR`, ver [DESPLIEGUE-NETLIFY-SUPABASE.md](DESPLIEGUE-NETLIFY-SUPABASE.md) (esos mecanismos solo valen para el entorno local anterior).

# Precios en USD, dólar blue y redondeo (tanda 6)

Decisiones del dueño (14/10/2026): los precios base se cargan en **USD**; la tienda los muestra principalmente en **pesos argentinos** (USD en tamaño menor); la conversión usa el **dólar blue, valor de venta**; los precios unitarios en pesos son **múltiplos de $100**.

## Cómo se calcula

```
precioARS = redondearAlMúltiploDe100(precioUSD × cotizaciónBlueVenta)
```

- Redondeo al múltiplo de $100 **más cercano, con las mitades hacia arriba** (interpretación de trabajo; el dueño no fijó el sentido de la mitad). Un precio USD positivo nunca da menos de $100.
- Ejemplos sintéticos (no son cotizaciones vigentes): USD 10 × 1.234 = $12.340 → **$12.300**; USD 10 × 1.235 = $12.350 → **$12.400**; precio USD pendiente → precio ARS **pendiente** (nunca $0).
- Se calcula en **un solo lugar**: `usdToArsMinor` en `src/features/fx/convert.ts` (aritmética entera con BigInt, sin errores de punto flotante), aplicado una vez en `applyOverrides` (`src/features/catalog/overrides.ts`). Todo el sitio (inicio, catálogo, fichas, filtros y orden por precio, carrito, consultas) consume `product.priceMinor`, que ya viene convertido.
- El **USD es el dato guardado** (centavos de dólar, `product_overrides.price_usd_minor`). El precio en pesos no se guarda ni se reconstruye dividiendo: se recalcula con la cotización vigente.
- El redondeo a $100 aplica al **precio unitario**. El subtotal es `precio unitario × cantidad`. Descuentos, cuotas y seña **no** se redondean a $100 ni en pasos sucesivos:
  - 10% por transferencia: con precios en múltiplos de $100 el 10% es exacto; sigue valiendo solo con al menos una caja (regla única en `src/features/politicas/promociones.ts`, sin cambios).
  - 3 cuotas sin interés: `splitInstallments` reparte el residuo de a un centavo, de modo que **la suma de las cuotas es exactamente el total** (el carrito las muestra al elegir ese medio).
  - Seña del 20% (encargos): `senaYSaldo` calcula la seña sobre la cotización **confirmada** y el saldo **por diferencia** (seña + saldo = importe, sin redondeos independientes).

## De dónde sale la cotización

- Proveedor: **DolarAPI** `GET https://dolarapi.com/v1/dolares/blue`, campo `venta`; se conserva `fechaActualizacion` (fecha de **publicación** del proveedor). Documentación: https://dolarapi.com/docs/argentina/operations/get-dolar-blue (verificada por el dueño el 14/10/2026). Es un servicio de terceros, **no** una cotización oficial del BCRA. Se probó la consulta real el 14/10/2026 (devolvió venta $1.550; fecha de publicación 13/10/2026 20:57 UTC).
- Validación (`parseProviderResponse`): debe ser casa «blue», moneda USD, `venta` numérica, positiva y razonable (entre 1 y 1.000.000), coherente con `compra`. Un salto de más del 50% frente a la última cotización válida se **descarta como sospechoso** (y se informa en el panel); si el cambio es real, se fija el valor manualmente.
- **Una sola consulta compartida** cada **15 minutos**, guardada en la base (`fx_settings`): no consulta cada visitante ni cada tarjeta. Mecanismos (no dependen de que el panel esté abierto):
  1. Temporizador del servidor (`src/instrumentation.ts` → `src/features/fx/timer.ts`), a los 5 s de arrancar y luego cada 15 min.
  2. Pedido que encuentra la cotización vencida: la renueva en segundo plano (`kickRefreshIfDue`) y ese pedido usa la guardada.
  3. Tarea programada externa: `GET/POST /api/fx/refresh` con `Authorization: Bearer <CRON_SECRET>` (sin `CRON_SECRET` el endpoint no existe: 404).
  4. A mano: `npm run fx:refresh` o el botón «Consultar ahora» del panel.
  Las consultas se espacian en la base y se agrupan en un solo vuelo por proceso. `FX_AUTO_REFRESH=0` apaga toda consulta de red (pruebas).
- Si el proveedor falla: se **conserva la última cotización válida**, se registra el error (visible en el panel) y la tienda sigue convirtiendo mientras la última consulta exitosa sea suficientemente reciente.

## Criterio de antigüedad (constantes en `convert.ts`)

| Situación | Qué pasa |
| --- | --- |
| Última consulta exitosa ≤ **2 h** | Al día. |
| Entre 2 h y **24 h** | Se usa con **aviso** («la consulta es más vieja de lo habitual») en el detalle de la cotización y en el panel. |
| Más de **24 h** sin consulta exitosa | **No se convierte**: el precio en pesos queda **pendiente** (se muestra el USD y «valor en pesos no disponible por ahora»; se puede consultar). |
| El proveedor responde pero su fecha de **publicación** tiene más de **5 días** | Sin vigencia (misma consecuencia). La fecha de publicación y la de consulta se muestran por separado. |
| Nunca hubo una cotización | Sin cotización: pesos pendientes. |
| Modo **manual** | Rige el valor que fijó el dueño, sin vencimiento; si tiene más de 7 días el panel avisa «a revisar» (sigue vigente: lo eligió el dueño). |

Estos umbrales son un criterio técnico de partida propuesto, no una decisión del dueño: se pueden ajustar en `convert.ts`.

## Modo manual

En **/admin/cotización** el dueño puede fijar un valor («pesos por dólar»): queda **explícito** (estado «Manual · fijada por la tienda»), **persistente** (base de datos) y registrado (quién, cuándo, nota). **Nunca se reemplaza solo**: la consulta automática sigue corriendo y guarda su valor, pero rige el manual hasta que se pulse «Volver a automático». El valor manual anterior se conserva si se vuelve a activar.

## Panel de cotización (`/admin/cotizacion`)

Tasa vigente y estado, fuente, fecha de publicación del proveedor, **última consulta exitosa con su antigüedad real**, último intento y último error, modo automático/manual, «Consultar ahora», valor manual con nota, **vista previa del efecto** de una cotización de prueba sobre los precios (sin guardar) e historial (`fx_log`: cambios del valor automático, errores, valores manuales y cambios de modo).

## Consultas, carrito y cambios de cotización

- El servidor **revalida precios, cotización y stock** al validar el carrito y al preparar la consulta; el cliente nunca fija el importe. Si el precio cambió (por el precio USD **o** por la cotización) desde que se armó el carrito, el estado es `price_changed` y se pide aceptar el nuevo importe **antes** de confirmar el resumen.
- Cada consulta guarda una **instantánea**: precio USD por unidad, precio ARS, importes y la cotización usada (`inquiries.fx_rate_10k`, `fx_mode`, `fx_source`, `fx_as_of`; `inquiry_lines.unit_price_usd_minor`). Una actualización posterior del dólar **no** la reescribe; el detalle de la consulta y el mensaje de WhatsApp indican la cotización utilizada.
- Preparar una consulta no reserva ni descuenta stock ni acredita pago.

## Qué **no** hace esta tanda (límites)

- **No es un sistema de cotización de encargos.** Solo convierte **precios de catálogo** de USD a pesos. Los productos «por encargo» siguen sin precio ni cotización hasta que la tienda los cotice por WhatsApp; no hay precio de encargo cargable ni un flujo de aceptación de cotización. La seña del 20% sigue calculándose sobre un importe cotizado y confirmado por fuera del sistema.
- No decide ni activa mayoristas (30%, compra mínima, acumulación con el 10%): siguen pendientes.
- No hay pagos en línea ni tarjeta de crédito real: «3 cuotas» sigue siendo una condición coordinada por WhatsApp.

## Datos anteriores en pesos

Todos los productos reales estaban sin precio. Si alguna base local tenía un precio fijo en ARS cargado desde el panel anterior (`product_overrides.price_minor`), **se conserva intacto** como «dato anterior» (el editor lo muestra), **no rige** y **no se convierte** con ninguna cotización: el precio queda pendiente hasta que el dueño cargue el USD. Los productos de demostración (solo para pruebas) conservan su precio ARS fijo del código. La planilla `datos/precios-y-stock.csv` sigue teniendo `precio_ars`, que se importa a `commercial.json` como dato de código; en el catálogo real ese precio fijo **no rige** (se muestra como pendiente): los precios se cargan en USD desde `/admin`.
