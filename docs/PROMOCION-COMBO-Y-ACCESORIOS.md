# Promoción caja + sobres, accesorios y recomendaciones del carrito

Rama `feature/combo-accesorios-recomendaciones` (commit local; **sin push, sin migración en Supabase, sin publicación**). Migración propuesta para revisión: `drizzle/0003_accesorios_y_combo.sql`.

## 1. Promoción «Sumá hasta 5 sobres con 10% OFF por cada caja»

- **Regla:** cada caja participante que está en el carrito habilita el 10% en hasta 5 sobres individuales participantes (2 cajas → 10 cupos, etc.). Constantes en `src/features/promos/combo.ts` (`COMBO`).
- **Qué participa** lo elige el dueño en `/admin/promociones` (cajas y sobres por separado, botón de activar/desactivar). **No hay una selección definitiva cargada:** por defecto está apagada y sin productos; la selección de ejemplo existe solo en las bases de prueba y en la vista previa local.
- **Guardado:** tabla `admin_settings`, clave `promo_combo` (JSON `{enabled, boxIds, boosterIds}`), con versión optimista (dos pestañas no se pisan) e historial en `product_audit` (`productId = promo-combo`, campo `promo_combo`). Activarla exige al menos una caja y un sobre; solo acepta productos de tipo caja/sobre no retirados.
- **Cálculo (única fuente: `priceCart`)**: el servidor recalcula siempre; el navegador solo muestra lo que devuelve `/api/cart/validate`.
  - Cupos = 5 × cajas participantes en el carrito (por cantidad, no por líneas).
  - Si hay más sobres que cupos, el descuento va primero a los de **mayor precio unitario** y, a igual precio, por `productId` (regla estable; no depende del orden del carrito).
  - Redondeo por unidad al peso entero, igual que el resto del sitio. El subtotal es la suma de las líneas.
  - Al quitar cajas o cambiar cantidades se recalcula sin intervención. Quitar la última caja elimina el beneficio.
- **Convivencia con los medios de pago** (decisión de trabajo, a validar con el dueño):
  - El combo y el 10% por transferencia **no se acumulan sobre el mismo sobre**: se aplica el más favorable; si empatan, gana transferencia.
  - Las cajas conservan sus condiciones actuales (10% por transferencia o cuotas sin interés).
  - Con la tarjeta (cuotas) rige el combo, y las cuotas se calculan sobre el total ya descontado.
  - Los **accesorios no entran** ni en el combo ni en el 10% por transferencia (la promoción de pago sigue exigiendo una caja; los accesorios no son cajas ni sobres).
  - No se extiende a mayoristas.
- **Dónde se ve:** ficha/tarjeta (texto de la promoción), panel lateral y página del carrito (precio original tachado, precio final, «Ahorrás $X», cupos usados y libres), resumen, mensaje de WhatsApp, detalle de la consulta guardada.

## 2. Accesorios (nuevo formato «Accesorios»)

| Producto | SKU | Precio fijo | Stock inicial |
|---|---|---|---|
| Sleeves transparentes · Pack de 5 unidades | `ACC-SLEEVES-TRANSP-X5` | $1.000 ARS | 0 packs |
| Top loaders transparentes · Pack de 5 unidades | `ACC-TOPLOADERS-TRANSP-X5` | $3.500 ARS | 0 packs |

- **Precio fijo en pesos** (`priceBase: "ars"`): no sigue al dólar ni inventa USD; editable en `/admin` (campo «Precio fijo (ARS)»; el servidor rechaza cargar USD a un accesorio o ARS a un producto en dólares). Los productos en USD no cambian.
- **Unidad de venta y de stock = pack de 5.** Comprar 1 es llevar un pack de 5 y descuenta 1 pack. El panel muestra «packs disponibles»; carrito, consulta, mensaje y venta dicen «pack de 5 unidades».
- **Stock inicial 0:** no se supone mercadería recibida. Mientras tanto la tarjeta dice «Sin stock» y permite consultar por encargo (comportamiento general de la tienda). No se sugieren en el carrito hasta tener stock.
- **Imágenes:** ilustraciones generadas (no fotos del stock real). Originales y prompts en `recursos-originales/accesorios/`; versiones optimizadas con `scripts/accesorios/optimizar-portadas.mjs`. El detalle de la imagen lo dice: «Imagen ilustrativa: no es una foto del stock real».
- **Sin datos inventados:** no se afirma marca, medidas, espesor, material ni certificaciones. El texto de los top loaders solo explica su uso junto con una sleeve.
- No son cajas ni sobres: no se pueden elegir en la promoción, no tienen stock de combos y no tienen promociones de pago nuevas.
- La **idioma** es «No aplica» (`language: "na"`), oculto en insignias, filtros y mensajes.
- El orden por defecto del catálogo los pone al final; se encuentran con el formato «Accesorios» y en la búsqueda.

## 3. «Completá tu compra» (panel lateral)

Entre los productos y el resumen, hasta **3** sugerencias compactas, calculadas por el servidor (`src/features/promos/sugerencias.ts`):

- Solo productos publicados, no retirados, con precio confirmado y stock, y que no estén ya en el carrito.
- Sleeves primero si no hay protección; luego sobres de la promoción (solo si hay una caja participante y cupos libres, el de mayor precio primero, con su precio de promoción y el aviso de que depende de los cupos) y top loaders. Se mezclan para que no sean solo sobres.
- «Agregar» no reordena ni cierra el panel, conserva la posición, actualiza cantidades, subtotal y descuentos, y deja el foco en el título del bloque. No se reordena mientras el foco o el puntero están dentro.
- Se pueden ocultar (se respeta durante la sesión: `sessionStorage`) y volver a mostrar.
- No se agrega nada solo ni se selecciona nada.

## 4. Datos guardados y compatibilidad

- `inquiries.combo_discount_minor`; por línea: `base_currency`, `combo_units`, `combo_discount_minor`, `transfer_discount_minor`, `pack_size`. `product_overrides.price_ars_minor`. `sale_lines.discount_minor`, `discount_kind`, `base_currency`, `pack_size`. Todas son `ADD COLUMN` con valor por defecto: las filas históricas siguen igual (sin descuento, moneda USD donde corresponde).
- **Convertir consulta → venta:** el descuento llega precargado por línea (editable, con aviso) y **no se recalcula** ninguna promoción; la venta guarda la misma cantidad. La consulta original no se reescribe y las consultas/ventas viejas conservan sus importes aunque cambie o se apague la promoción.
- **Stock:** agregar al carrito o generar una consulta no reserva ni descuenta. Una venta confirmada descuenta con los movimientos existentes (accesorios en packs); anular devuelve una sola vez.
- **Carritos guardados** de versiones anteriores (sin título/imagen, medio de pago viejo) siguen funcionando.
- `expectedTotalMinor`: si el total que vio el cliente ya no coincide con el del servidor (cambió elegibilidad, precio o stock), responde 409 `price_changed` y el cliente muestra los nuevos importes para revisar antes de confirmar.

## 5. Pruebas

- `tests/promo-combo.test.ts` (motor y sugerencias) y `tests/combo-pedidos.test.ts` (base real): una o varias cajas, cantidades repartidas en líneas, más sobres que cupos, no participantes, quitar la última caja, transferencia sin doble descuento, cuotas, accesorios fijos aunque el dólar cambie o falle, sin stock/precio/retirados, manipulación del cliente, consulta→venta, importes históricos, stock en packs, anulación.
- `tests/e2e/promo-accesorios.spec.ts` (servidor `consultas`): configuración y historial, catálogo/búsqueda/filtro/ficha, panel, recomendaciones (orden, agregar, ocultar, teclado), carrito con transferencia y cuotas, manipulación por API, conversión y anulación, axe, móvil 360/390/430 y layout shift.
- Los servidores de prueba compilan con `next build`; Next 16 imprime un aviso de seguridad de versión que frena el primer intento: reintentar el mismo comando.

## 6. Pendientes / a definir por el dueño

- Qué cajas y sobres participan (no se cargó ninguna selección real).
- Confirmar que los accesorios queden fuera del 10% por transferencia y que el «más favorable» sea la regla para cajas+sobres con transferencia.
- Fotos reales de los accesorios y mercadería (cargar stock en packs desde el panel).
- Aplicar la migración `0003` en Supabase (requiere respaldo previo y aprobación).
