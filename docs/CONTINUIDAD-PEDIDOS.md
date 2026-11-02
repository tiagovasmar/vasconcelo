# Continuidad de pedidos y mayoristas — 02/11/2026

**Agregado posterior al cierre `ab20b00`:** invitación al grupo de WhatsApp en el inicio. Sus cambios, 14 verificaciones selectivas y capturas están en [GRUPO-WHATSAPP.md](GRUPO-WHATSAPP.md). Los resultados completos documentados debajo corresponden al cierre anterior y no se atribuyen al agregado como una ejecución nueva.

## Repositorios y archivos preservados
- Carpeta de la implementación reciente: `C:\Users\tiago\Documents\Codex\2026-10-13\rev\work\vasconcelo-publicacion`.
- Rama: `feature/cuentas-pedidos-mayorista`; punto de partida `e6b24c1`. Estaban los documentos solicitados, las capturas y el código de Google, pedidos, envíos, comprobantes, costos y mayoristas.
- La carpeta abierta `kit-claude-pokemon` está en `migracion/netlify-supabase`, commit `8a7480e`. No contiene `PEDIDOS.md`, `GOOGLE.md`, `DECISIONES-PENDIENTES-PEDIDOS.md` ni `PUBLICACION-PEDIDOS.md`; tenía un cambio previo en `next-env.d.ts`, que se preservó. No se copiaron archivos ni se cambiaron ramas.
- En el repositorio reciente solo había tres favicons sin seguimiento. Se preservaron y se excluyen de los nuevos commits: `src/app/apple-icon.png`, `favicon.ico`, `icon.svg`. La historia del rango `2d2ca08..e6b24c1` no los incluye; no se reescribió historia. No se afirma que no existan en otras referencias históricas.
- No se hizo push, merge, despliegue, configuración externa ni migración sobre Supabase o bases existentes.

## Reproducción y corrección
La regresión entra con una cuenta verificada, solicita acceso, recibe aprobación del dueño y abre el catálogo con condiciones ficticias completas. Con 50 unidades y viewport 390, el código anterior produjo documento **546 px**, 156 px de desborde. Evidencia: `capturas/pedidos/mayorista-antes-390.png` y registro local `.local/regresion-antes.log`.

Se aisló el problema con los productos reales y cantidades ficticias de la vista previa: reconstruir en el DOM la geometría anterior reproduce exactamente **552 px**; solo posicionar el contenedor la baja a **390 px** (`capturas/pedidos/diagnostico-desborde.json`). Las etiquetas `sr-only` de cantidad son absolutas y se ubicaban a x=550,56 fuera del área desplazable al no tener un contenedor posicionado. La tabla además exigía 820 px, lo que dejaba los controles fuera de la vista móvil.

Ahora hay un solo conjunto de campos: tarjetas a menos de 1024 px y tabla de ancho fijo adaptable en escritorio. Los nombres y SKU pueden partirse cuando hace falta; cantidad, tramos, precio, subtotal y resumen permanecen visibles. No se agregó `overflow-x:hidden` global, recorte de controles ni reducción general de fuente. El ocultamiento horizontal del body ya existía; no es la solución empleada. La revisión visual también detectó y corrigió una regla de ancho de escritorio que comprimía el nombre en móvil.

La regresión comprueba 360/390/430/1440 px, cantidades 1/10/50/100000, precios grandes, un nombre largo con secuencia sin espacios, ancho útil del título, acceso y uso de controles, documento sin desborde, accesibilidad y envío validado por el servidor. Antes de enviar restablece los importes ficticios pequeños.

## Condiciones y datos
El dueño dejó pendientes mínimo, combinación, tramos/precios, demoras, plazo de reintegro y cancelación voluntaria. Los dos últimos ahora tienen campos de texto en `/admin/mayoristas`; se guardan en `admin_settings` sin otra migración. Nacen vacíos. El servidor bloquea la apertura si falta cualquiera de las condiciones o no hay tramos publicados. Solo la vista previa aislada tiene valores explícitamente FICTICIOS.

Se mantienen por pedido, seña 20%, resto al llegar a Argentina antes de despacho/retiro, transferencia/efectivo sin descuento adicional, financiación por consulta y reintegro de seña por pérdida/incumplimiento. Cobro proporcional o completo en entregas parciales: pendiente; se conserva la protección actual de pago completo antes de la primera entrega. No se agregaron chat, vencimientos, consultas por foto/enlace ni panel de deuda.

## Aislamiento
Los puertos 3000, 54400 y 54401 no tenían servicios activos al revisar. No se reutilizaron ni detuvieron procesos ajenos. Vitest y Playwright crearon PostgreSQL embebido nuevo con migraciones de prueba. Se anuló `TEST_DATABASE_URL`, se omitieron los archivos de entorno en scripts, y los servidores E2E tienen destinos explícitos, correo local y Storage local, Google/proveedores reales desactivados.

La vista previa `scripts/preview-pedidos.ts` anula las claves de archivos `.env*` sin imprimir valores y prepara una base nueva en un puerto libre. `dev:pedidos` rechaza 54400 y exige la marca de entorno descartable. El lanzador utiliza nombres separados para las contraseñas ficticias; no cambia credenciales reales.

## Verificación de esta continuación
Resultados propios de Codex, con procesos terminados:

- `npm run verify` sobre la entrega: **592 correctas, 1 omitida, 45 archivos correctos**. Typecheck, catálogo y lint sin errores; **4 advertencias de lint preexistentes** (variables/tipos sin uso). La omisión es el ensayo opcional con una copia SQLite histórica del dueño que no existe en esta carpeta. No se buscó ni utilizó una base real para completarlo.
- Ocho builds de producción nuevos, construidos secuencialmente, más el build de la vista previa. No se ejecutaron builds simultáneos para la entrega.
- Playwright completo con WebKit: **643 casos previstos; 627 pasados, 9 omisiones por diseño, 1 falla y 6 sin ejecutar**. La falla fue una expectativa obsoleta en `admin.spec.ts`: todavía exigía 409 `policy_pending` al aprobar una cuenta, aunque la aprobación manual por el dueño está implementada y acordada. Es distinta de abrir el catálogo con condiciones incompletas.
- Corregida esa prueba para aprobar mediante el botón real, comprobar persistencia, conservar el rechazo a cuentas comunes y comprobar que la cuenta aprobada sigue sin catálogo cuando faltan condiciones. Se corrigió también un comentario antiguo del endpoint; **no cambió su código ejecutable**. Se repitió **TODO el bloque administrador: 19/19, cero fallas**, incluidos los seis casos que la configuración en serie había dejado sin ejecutar. Después se comprobaron nuevamente typecheck y lint: sin errores, mismas cuatro advertencias.
- Cobertura final sin contar dos veces los 12 casos admin repetidos: **634 escenarios ejecutables cubiertos, 9 omisiones por diseño y ninguna falla sin resolver**. Es el resultado de la corrida completa más la repetición de todo el bloque admin; **no se presenta como una segunda corrida monolítica verde**. Los informes JSON completos quedan ignorados en `.local/playwright-final.json` y `.local/playwright-admin-final.json`; el resumen sin configuración ni datos sensibles es [RESULTADOS-CONTINUIDAD.json](RESULTADOS-CONTINUIDAD.json).
- WebKit: **33/33** del proyecto `resil-webkit`. Es el motor en Windows, no un iPhone/Safari físico. Los cuatro anchos del catálogo aprobado se comprobaron con Chromium; no se afirma cobertura de ese flujo en WebKit.
- Pedidos: **9/9**, incluido el catálogo aprobado a cuatro anchos, comprobantes privados, cliente/invitado/otra cuenta/admin, seguimiento y accesibilidad. Las reglas de pagos/reintegros/entregas/stock repetidos, envíos de varios pedidos y cantidades parciales, costos históricos privados y fallos/reintentos de avisos están cubiertas por las pruebas de reglas que pasaron.
- Capturas finales: **48 normales + 4 de regresión**, más la captura anterior para comparar. Sin desborde, imágenes rotas ni errores de consola en el recorrido final. Revisión visual de catálogo móvil, caso extremo y panel móvil realizada.
- Rendimiento en producción local: cuatro pantallas autenticadas, escritorio y móvil, tres navegaciones por caso (medianas, caché reutilizada). LCP máximo **448 ms**, CLS máximo **<0,001**, TBT máximo **7 ms**; sin incumplimientos de presupuestos ni desborde. Móvil: CPU 4×, red 1,6 Mb/s y 150 ms de latencia. [Datos completos](rendimiento-pedidos.json). Son medidas de laboratorio local, sin línea base comparativa; no equivalen a Netlify/Supabase ni usuarios reales.


La primera corrida de verify produjo 591 correctas, 1 omitida y 1 timeout (prueba de scripts de respaldo/restauración, 30 s) con alta concurrencia. Repetida con `VITEST_MAX_WORKERS=2`: 592 correctas, 1 omitida, 45 archivos correctos. Sin modificar expectativas ni ampliar el timeout. Lint informó cuatro advertencias existentes (variables/tipos no usados), cero errores. La suite completa con builds simultáneos se interrumpió para aplicar una corrección visual y evitar saturación; no se cuenta como una ejecución exitosa.

## Vista previa y capturas
`npx tsx --conditions=react-server scripts/preview-pedidos.ts` → `http://localhost:3010` (solo local, proceso necesario). Accesos en `.local/preview-pedidos-continuidad/acceso.txt`, con contraseñas en archivos locales ignorados. Clienta Ana, mayorista Marta y administrador ficticios.

Capturas en `docs/capturas/pedidos/`: seguimiento, ficha con reposición, catálogo aprobado y pantallas del administrador en 360/390/430 y escritorio. El script ahora exige encontrar el campo de cantidad: una pantalla sin acceso ya no se acepta como captura de catálogo. Informe de geometría/consola/imágenes: `INFORME.txt`. Las imágenes de pruebas son ficticias o del catálogo; no contienen secretos ni datos de clientes reales.

## Pendiente fuera del trabajo local
OAuth real Google; proveedor y remitente real de correo; bucket privado real de comprobantes y su autorización; comprobación en vista previa alojada y Supabase real; revisión legal y marca Google. La evidencia de tokens Google simulados, correos en archivos y almacenamiento local/HTTP simulado no verifica esos servicios. No se configuraron ni se usaron.

Plan de publicación/reversión actualizado en [PUBLICACION-PEDIDOS.md](PUBLICACION-PEDIDOS.md), sin ejecutarlo. La reversión habitual conserva las tablas, los registros y el historial de migraciones; no propone borrarlos para volver a la aplicación anterior.

## Commits locales
- `0af935d` — corrección del catálogo móvil, condiciones editables, aislamiento de vista previa y regresiones.
- `Documenta la continuidad de pedidos y las verificaciones locales finales` — informe, plan, resultados y capturas de esta entrega. Su identificador queda en el historial local de esta misma rama.

Los favicons, archivos de entorno, bases, accesos de prueba y registros privados quedan excluidos.
