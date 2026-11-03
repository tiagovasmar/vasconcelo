# Seña y comprobante en el encargo — 02/11/2026

Pedido del dueño: mostrar directamente la seña del 20%, el alias `vasconcelotiago`, el titular Tiago Vasconcelo Marostica y el formulario de comprobante. Se aplica también al seguimiento mayorista, que reutiliza el mismo componente.

## Comportamiento

- La seña se calcula con `senaFor` sobre el importe acordado del seguimiento (misma regla monetaria que administra pagos; pesos enteros). No se toma un precio enviado por el cliente ni se aplica sobre un carrito mixto sin cotizar.
- Un importe guardado no basta para pedir dinero: debe estar confirmada por la tienda la disponibilidad y cotización.
- Si hubo un pago parcial, la instrucción muestra solo lo que falta para completar la seña. La cifra del 20% del total sigue visible para referencia.
- Con un comprobante pendiente de revisión se retira la instrucción de transferencia y se pide esperar; subirlo no confirma el pago. El formulario y la consulta privada del archivo mantienen su autorización y validaciones existentes.
- Con la seña abonada no se solicita el 80% mientras viaja. Al llegar a Argentina se indica la diferencia entre el total y los pagos confirmados, antes del despacho o retiro.
- Sin importe, sin confirmación, con pago completo, cancelación o entrega no se muestra un nuevo pedido de transferencia.
- Los datos de cobro del comercio son contenido público autorizado en `src/content/transferencia.ts`, no secretos ni datos bancarios de clientes.

## Vista previa aislada

Se agregó un encargo FICTICIO para Ana, de $100.000 con seña de $20.000 y sin pagos, además de los anteriores de tránsito y reintegro. No se debe transferir dinero por la demostración.

`PREVIEW_PEDIDOS_PORT=3011` permite levantar otra vista sin cerrar la anterior: base nueva descartable, contraseñas, archivos y build independientes. Accesos en `.local/preview-pedidos-3011/acceso.txt`; contraseña de clientes en su `clientes.txt`. No compartir estos archivos ni incorporarlos a Git.

Capturas: `capturas/transferencia-encargo/seguimiento-{360,390,430,1440}.png`. Revisión visual del caso de 390 px y comprobación de ancho en los cuatro tamaños, sin desborde.

## Verificaciones y alcance

- Pruebas de cálculo y reglas de pedidos: 25/25, incluyendo seis nuevas sobre seña, pagos parciales, confirmación, comprobantes en revisión, llegada, pago completo y cancelación.
- Playwright del proyecto `pedidos`, con build nuevo: 9/9. Incluye permisos, subida del comprobante, revisión sin confirmación automática, mayoristas, accesibilidad y móvil a tres anchos. Se agregaron controles específicos del alias, titular, seña y desaparición de la instrucción al subir el comprobante.
- En el log E2E hubo tres respuestas 404 de una imagen del catálogo DEMO; no se presenta esa corrida como una auditoría de imágenes. Los nueve casos pasaron.
- `npm run verify`: typecheck, catálogo y lint sin errores (cuatro advertencias preexistentes); 46 archivos de pruebas correctos, 598 pruebas correctas y una omitida por diseño. No se repitieron todos los proyectos de Playwright: se ejecutó el proyecto afectado de pedidos y mayoristas.

No hay migraciones nuevas, cambios de producción ni configuración de proveedores reales. Mayoristas conserva sus condiciones pendientes editables y el bloqueo de apertura; no se inventaron mínimos, tramos ni demoras. Google real, correo real, Storage privado real y la política de cobro de entregas parciales siguen pendientes según `DECISIONES-PENDIENTES-PEDIDOS.md`.
