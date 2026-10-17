# Decisiones técnicas

## Hito 1
- Next.js 16.4 (App Router) + React 19.3 + Tailwind 4.3 + TypeScript 5.9 (no 7.x: compatibilidad con Next/ESLint) + ESLint 9 + Vitest.
- Fuentes locales con `@fontsource` (Anton y Figtree, OFL).
- Imágenes como "slots" (`src/components/slot.tsx`): si el archivo existe en `public/images/` se usa; si no, una ilustración de reserva. Permite reemplazar el arte sin tocar componentes.

## Hito 2
- **Catálogo en código** (`src/content/`) con esquemas Zod (`schema.ts`) y validación propia (`src/features/catalog/validate.ts`, comando `catalog:check`). Acceso separado en `src/features/catalog/data.ts` para poder migrar la fuente luego.
- **Búsqueda/filtros en servidor** sobre la URL (`/sellados?q=&formato=&idioma=&expansion=&disp=&pmin=&pmax=&orden=&pagina=`), con URL canónica (redirige y quita parámetros vacíos/inválidos). Funciona sin JavaScript; en escritorio los selectores aplican al cambiar y en móvil hay una hoja modal (`<dialog>`).
- **Paginación** por 12 productos. Las cartas de una ficha se pagan en cliente de 12 en 12 (el volumen actual es pequeño); cuando existan sets de cientos de cartas conviene paginar desde el servidor.
- **Probabilidades**: solo se muestran tasas del mismo idioma, región y unidad (por sobre → sobres/packs; por caja → cajas/bundles). `null` = "Dato no disponible", nunca 0 %. No se carga ningún porcentaje: no hay evidencia verificada.
- **Garantías**: se separan contenido físico, promos fijas y rareza. Las `unverified` no se muestran como promesa (solo un aviso). La rareza exige fuente oficial.
- **Datos demo**: Storm Emeralda es una expansión real con lista de cartas **no disponible** (enlace a la fuente oficial). "Set de ejemplo" (lista completa) y "Set parcial de ejemplo" son **ficticios** y existen para revisar la galería. Todos los productos son `isDemo`.
- **Aún deshabilitado** (hito 3): agregar al carrito, cantidad y consulta por WhatsApp. Los botones existen, están deshabilitados y avisan que se habilitan pronto.
- `id="principal"` para `<main>` (el id `contenido` pertenece a una sección de la ficha).

## Hito 3
- **Carrito en el navegador** (`src/features/cart/store.ts`, localStorage): solo ids, cantidades y el precio que el cliente vio (para avisar cambios). Se sanea al leer (cantidades enteras 1–99, sin líneas repetidas, ignora datos corruptos). No es fuente de importes.
- **El servidor valida todo**: `POST /api/cart/validate` (estado por línea: ok, precio cambiado, agotado, retirado, sobre el límite) y `POST /api/inquiries` (revalida catálogo, stock, límite por pedido = mín(maxPerOrder, stock), precios, entrega y pago). Los importes salen del catálogo en centavos; precio/título/total enviados por el navegador se ignoran. Si cambió un precio, responde 409 y el cliente debe aceptar el nuevo antes de continuar.
- **SQLite + Drizzle** (`src/db`, migraciones en `drizzle/`, se aplican solas al abrir la base y con `npm run db:migrate`, sin borrar datos). Tablas: `inquiries` (snapshot inmutable), `inquiry_lines`, `rate_limits` (límite persistente por IP hasheada). Base en `.local/data/tienda.db` (ignorada por Git) o `DATABASE_PATH`.
- **Idempotencia**: el cliente genera una clave por contenido (misma clave mientras no cambie el carrito/entrega/pago/nombre; clave nueva si cambia). El servidor guarda hash del contenido: misma clave + mismo contenido = misma consulta (200 vs 201); misma clave + otro contenido o distinta sesión = 422. Una carrera de doble envío se resuelve con la restricción única.
- **Privacidad de consultas**: referencia pública aleatoria (`TT-XXXXXXXX`, no secuencial). Una cookie httpOnly `consulta_sid` (se crea al entrar al carrito, `src/proxy.ts`) identifica la sesión de invitado; solo esa sesión puede ver `/carrito/consulta/[ref]`. El vínculo con cuenta se tomará de la sesión autenticada en el hito 4, nunca del body. Origen validado en los POST; límites de uso persistentes.
- **WhatsApp**: `https://wa.me/{número}?text=` con `encodeURIComponent`. Número validado (8–15 dígitos) desde `WHATSAPP_NUMBER` o `store.ts`; si falta → modo demo (sin enlace a ningún chat, con vista previa y copiar). Con número, al llegar desde el carrito se abre el chat una sola vez (navegación en la misma pestaña, no bloqueable) y la página de la consulta conserva un enlace «Reabrir» y «Copiar mensaje». Abrir WhatsApp no cambia el estado (`consulta_preparada`), no reserva ni descuenta stock y no vacía el carrito.
- **Carritos largos**: límite conservador de 1.800 caracteres para la URL codificada (decisión de diseño; **no** es un límite universal ni está medido en todos los clientes). Si se supera: el chat se abre con un resumen legible + referencia y se ofrece copiar el detalle íntegro; el detalle nunca se trunca.
- **Entrega**: Andreani (localidad, provincia, CP), moto CABA/AMBA (localidad, CP; cobertura a confirmar) y retiro (Ramos Mejía o Haedo). CP argentino de 4 dígitos o formato CPA. No se pide DNI ni dirección completa.
- **Pago**: `src/content/checkout-options.ts`; hoy solo «A coordinar por WhatsApp». Para sumar un método, agregar una entrada (id + texto).
- `src/content/checkout-options.ts` está separado de `store.ts` para que el navegador no reciba la configuración de la tienda.

## Hito 4
- **Better Auth 1.7** con adaptador Drizzle/SQLite (`src/server/auth.ts`, tablas en `src/db/auth-schema.ts`, migración `drizzle/0001`). Contraseñas con scrypt; mínimo 10 caracteres; verificación de correo obligatoria para ingresar; recuperación con token de un solo uso (1 h) que revoca sesiones.
- **Límites de uso**: los de Better Auth (almacenados en la base, no en memoria) para auth y los propios (`rate_limits`) para consultas, validación de carrito y favoritos. Válido para un servidor único; para varios servidores hay que migrar a un almacenamiento compartido.
- **Correo local** (`src/server/mail.ts`): archivos JSON en `.local/mail`, deshabilitado en producción (falla explícitamente en vez de simular). Ver `docs/CUENTAS.md`.
- **Asociación de consultas de invitado**: por token de sesión (cookie httpOnly), nunca por referencia; rota el token al reclamar. Detalle en `docs/CUENTAS.md`.
- **Una consulta hecha con sesión** pertenece solo a la cuenta (el token de invitado no la abre); la idempotencia compara dueño (usuario o sesión de invitado).
- **Favoritos** en la tabla `favorites` (PK usuario+producto, borrado en cascada). El corazón usa un `AccountProvider` en el navegador que consulta `/api/account`; la autorización real es siempre del servidor.
- **Pruebas e2e**: cada prueba usa su propia IP (`x-forwarded-for`) para no mezclar límites de uso; el correo y la base de cada servidor de prueba son temporales.

## Hito 5
- **Correo no disponible ≠ «te enviamos un correo»**: al probar el build de producción se vio que, sin proveedor, el registro respondía 200 sin enviar nada. Ahora `mailTransportAvailable()` (`src/server/mail.ts`) y `guardMail` (`src/server/mail-guard.ts`) responden 503 explícito a registro, recuperación y reenvío, y las pantallas muestran «Por ahora no está disponible». Al implementar un proveedor real, es el único lugar a actualizar.
- **Páginas legales como borradores configurables** (`src/content/legal.ts`): describen cómo funciona el sitio (datos, cookies, WhatsApp) y dejan «[A completar por el comercio]» en CUIT, domicilio, contacto, retención, devoluciones y jurisdicción. `release:check` los marca como bloqueantes.
- **`release:check`** (`scripts/release-check.ts`): bloqueantes/avisos/informativo; sale con código 1 mientras haya bloqueantes (demo ⇒ esperable). No contrata ni publica nada.
- **Backup/restauración** (`src/db/backup.ts`): copia en caliente con la API de backup de SQLite, un solo archivo, verificada con `integrity_check` y tablas requeridas; restaurar exige `--yes`, valida la copia, resguarda la base actual y descarta -wal/-shm. Probado con ida y vuelta.
- **Rendimiento medido con Playwright/CDP** (`scripts/rendimiento.mjs`), no con Lighthouse (no pudo lanzar el navegador desde la línea de comandos en este entorno). Presupuestos que hacen fallar el script. Fuentes servidas con `next/font/local` (CLS 0).
- **Accesibilidad**: axe-core en las pruebas de recorrido (WCAG 2.x A/AA). Dos tonos de bermellón (`--color-vermilion` para fondos claros, `--color-vermilion-bright` para oscuros).
- **Pruebas estables sin ampliar tiempos**: marcador de hidratación, calentamiento global de rutas y esperas de respuesta de red (ver ESTADO.md).
- **`/api/health`** para el despliegue y **`npm run smoke`** como prueba de humo contra un servidor ya iniciado.

## Lote de colecciones
- **Precio/stock pendientes = `null`** (no 0): un SKU pendiente se muestra, pero el servidor lo rechaza con 409 `pending_commercial`.
- **Catálogo real separado del de prueba**: el ficticio vive en `src/content/fixtures/demo/` y solo se activa con `CATALOG_FIXTURE=demo` (vitest y e2e).
- **Galería completa solo si es verificable**: numeración contigua sin huecos y total igual al de la fuente; si no, «Galería parcial» con lo que falta.
- **Imágenes `reference`**: el enlace oficial no concede permiso; se informa como bloqueante en `release:check`.
- **Rareza por ícono oficial** (contrastada con JSON oficial); sin ícono, no se informa.
- **Heat Wave Arena `pg=940`** (el paquete traía 922, que es otra expansión).

## Catálogo chino y carrusel (13/10/2026)
- **Una ficha por unidad identificable, no por publicación.** La publicación surtida 975082756071 se desarma en sobres de 5, 6, 10 y 20 cartas leídos en las insignias de los envases; lo que ya existía en otra carpeta se concilió (no se duplicó). Las variantes ilegibles quedan como pendiente puntual, sin frenar el lote.
- **Colecciones chinas reales, sin expansiones ficticias.** El nombre es el original chino; el código es solo el impreso en el envase (opcional). Sin lista de cartas: «Lista no disponible aún» (no se reutiliza la japonesa). Kits y cajas especiales no pertenecen a una colección (`expansionIds: []`).
- **Formatos nuevos en el modelo** (kit, caja especial, set de ilustraciones) en vez de forzarlos a «caja de sobres»; `variant` para distinguir 5/20 cartas y Vol.2/Vol.3 (el validador ya no los toma por duplicados).
- **Fotos de proveedor, rotuladas como tales** (`source: "supplier"`): no se llaman «del fabricante» ni «de la tienda», y no se afirma permiso de uso. Fondo blanco quitado solo cuando era limpio; gráficos y fotos con fondo propio sin retocar.
- **«Más recientes» ordena por incorporación** al catálogo para las fichas chinas (13/10/2026): quedan primero en el orden por defecto.
- **Carrusel**: un temporizador por banner (se reinicia con cualquier cambio de banner) en vez de un `setInterval`; `useSyncExternalStore` para movimiento reducido y visibilidad de la pestaña; el avance automático no actualiza el texto anunciado. Las pruebas usan reloj simulado (`page.clock`); el movimiento reducido es la configuración por defecto de las pruebas.

## Panel del dueño (13/10/2026)
- **Cambio de alcance del dueño:** precio y stock se administran desde la web (antes: solo por código). Alcance cerrado a precio, stock, máximo por pedido y visibilidad.
- **Quién administra:** `ADMIN_EMAIL` explícito + sesión + correo confirmado; sin variable, cerrado. Evita «primer usuario = admin» y no hay contraseñas por defecto. Páginas: 404 a otras cuentas (no revela el panel); operaciones: 401/403.
- **Datos:** el catálogo por código sigue siendo la base; los valores del panel (`product_overrides`) reemplazan por producto los cuatro valores comerciales; `product_audit` es un registro de solo agregado (un renglón por dato: quién, cuándo, antes, después). «Restablecer» borra el reemplazo y lo registra.
- **Pendiente ≠ $0 ni agotado:** se guarda como NULL; el panel exige dejar vacío para pendiente y rechaza precio 0.
- **Consistencia:** versión por producto (ediciones simultáneas se rechazan), cambio + registro en una transacción, sin escritura si no hay cambios. Las consultas guardan un snapshot, así que no cambian.
- **Páginas dinámicas:** inicio, expansiones, fichas y catálogo se arman en cada pedido para reflejar la base (no se prerenderizan con precios viejos). Costo: una lectura SQLite chica por pedido.
- **Pruebas:** servidor e2e propio (:3103) con su base y su correo, para que las pruebas que cambian precios no afecten a las demás; los tests unitarios usan base en memoria (`DATABASE_PATH=:memory:`).

## Tanda 4: mayoristas, encargos y promociones con caja (13/10/2026)
- **Una sola fuente de políticas** (`src/content/politicas.ts`): lo confirmado es valor; lo pendiente es `null`/`false`. Ninguna política pendiente (compra mínima mayorista, acumulación con el 10%, aprobación manual/automática, plazos y devolución de seña del encargo) se inventó para completar la función.
- **Mayoristas con activación apagada.** La solicitud se guarda (una por usuario, clave única) y queda «pendiente»; el precio mayorista (`minorista − 30%`, redondeado al peso) está calculado y probado pero **no conectado** al carrito: `wholesalePriceFor` devuelve `null` mientras `activationEnabled` sea false o la solicitud no esté aprobada. La revisión (aprobar/rechazar) existe pero responde 409 `policy_pending`. El usuario y el estado salen de la sesión y de la base, nunca del cuerpo del pedido.
- **Encargo = línea de la misma consulta, no una venta.** `inquiry_lines.fulfillment = "encargo"` con importes en 0 (que el servidor expone como `null`) para no rehacer tablas SQLite; el cliente no puede fijar un precio. La seña (`senaYSaldo`, 20%) solo se calcula sobre una cotización confirmada, que hoy no se carga en ningún lado: la web informa la regla, no un importe.
- **Promociones por pedido, evaluadas en el servidor.** Cuenta lo que se COMPRA (líneas con precio y stock); una caja por encargo, agotada o sin precio no habilita nada. El 10% alcanza al subtotal de productos del pedido que califica (configurable a «solo cajas»); el envío nunca entra. Se retiró el 10% del efectivo porque el dueño solo confirmó «transferencia».
- **Criterio monetario único:** descuentos, mayorista y seña se redondean al peso entero (`src/lib/money.ts`).
- **Títulos chinos en español = traducción descriptiva**, rotulada como tal en cada ficha; `originalTitle`/`originalName` conservan el chino para búsqueda y trazabilidad; no se tocaron slugs. Los nombres de Pokémon de los kits siguen en chino (no se verificó su nombre en español).
- **Fotos:** se eligieron recortes del mismo material del proveedor (sin generar envases ni alterar texto). Excepción documentada: 宝石包 VOL.6 no trae una foto limpia de la caja, así que la primera imagen son los sobres que trae.


## Tanda 6: USD, dólar blue, panel completo (14/10/2026)
- **El USD es el dato; los pesos se derivan.** Se guarda `price_usd_minor` y los pesos se calculan en `applyOverrides` con la cotización vigente. Así todo el sitio sigue leyendo `priceMinor` (precio unitario ya convertido) sin cambios de contrato, y filtros, orden, carrito, promociones, seña y consultas usan el mismo número.
- **Redondeo:** a múltiplos de $100, el más cercano, mitades hacia arriba (interpretación de trabajo). Aritmética entera con BigInt. Mínimo $100 para un USD positivo; sin cotización utilizable → pendiente, nunca $0.
- **Cotización:** consulta compartida cada 15 min (temporizador del servidor + renovación en pedidos vencidos + endpoint con `CRON_SECRET` + script + botón), última válida conservada ante fallos, 24 h máximo, fecha de publicación del proveedor distinta de la de consulta, salto >50% descartado, modo manual persistente que nunca se reemplaza solo. Umbrales propuestos, no decididos por el dueño.
- **Sin migración retroactiva de pesos:** el precio ARS anterior queda como dato (`price_minor` intacto) y no rige ni se convierte. En el catálogo real un precio ARS del código tampoco rige (solo en productos de demostración, para las pruebas).
- **Edición parcial:** los campos del panel son opcionales (lo no enviado se conserva): la edición rápida no pisa título, descripción ni fotos.
- **Galería separada** (`product_galleries`, con su propia versión y registro): lista ordenada completa que reemplaza a la del código; las fotos subidas viven en disco persistente fuera de `/public` y se sirven por `/images/uploads/`; el servidor valida el formato por contenido, re-codifica a WebP y nombra los archivos.
- **Ficha en borrador** (`draftNote`): la de Bulbasaur nace oculta; publicarla exige confirmar que se resolvió el dato pendiente.
- **Importadores y seeds no tocan las tablas del panel**: lo cargado por el dueño no se pisa en silencio.
- **«Por encargo»** es un estado explícito del producto (`orderOnly`): se comporta como no comprable de stock y deriva al flujo de encargo existente; no es una cotización.


## Migración a Netlify + Supabase (14/10/2026)
- **PostgreSQL con `postgres` (postgres.js) + Drizzle**, acceso asíncrono. Se conserva Better Auth (adaptador `pg`): mismos usuarios, hashes scrypt y correo confirmado; no se usa Supabase Auth. El SQLite original queda como `src/db/legacy-sqlite/`, `drizzle-sqlite-legacy/` y el respaldo `.local/backups/pre-postgres/`.
- **bigint para milisegundos e importes** (un `integer` de PostgreSQL desborda con fechas en ms y con importes grandes en centavos); `timestamptz` solo en las tablas de Better Auth (trabaja con `Date`). Identidad `BY DEFAULT` para conservar ids históricos y reajustar la secuencia.
- **Concurrencia**: `pg_advisory_xact_lock` por producto/galería (READ COMMITTED no serializa solo, SQLite sí), límite de uso en una sentencia atómica, reclamo de la consulta de cotización con UPDATE condicional, `FOR UPDATE` al reclamar consultas.
- **Serverless**: 1 conexión por instancia, `prepare: false`, sin transacciones que mezclen `db` y `tx`, sin temporizadores ni `instrumentation`. Migraciones nunca corren solas en el servidor web. La cotización se renueva en el pedido (espera ≤ 3 s) en vez de en segundo plano porque la función se congela al responder. Se descartó una función programada por defecto: agrega consumo y, a propósito, no se usa para mantener «despierto» a Supabase.
- **Fotos**: Supabase Storage por su API REST (sin SDK, menos peso y fácil de probar); el almacén en disco solo existe fuera de producción o con `STORAGE_DRIVER=local`. Las referencias `/images/uploads/<hash>.webp` no cambian: una ruta las entrega desde Storage con caché inmutable. Tope de subida 5 MB.
- **`hasAsset`** usa un listado generado en el build (`/public` no está en el disco de la función).
- **Correo**: API HTTP de Resend/Brevo; sin proveedor, registro público deshabilitado (503) y el administrador ingresa con `npm run admin:crear` o su cuenta migrada.
- **Respaldo**: carpeta con NDJSON por tabla + fotos + manifiesto con huellas (no `pg_dump`: no hay garantía de que esté instalado y no cubre Storage); lectura en una transacción REPEATABLE READ.
- **Lint**: `no-floating-promises` en `src/` y `scripts/` (ya detectó dos `await` omitidos).

## Tanda 7 (15/10/2026)
- **Base de desarrollo separada:** PostgreSQL real y local (`embedded-postgres`, `npm run dev:db`) en vez de un segundo proyecto de Supabase: no usa red ni credenciales, es descartable y reproduce el motor de producción. `ENTORNO_LOCAL=1` hace que `createDb` rechace cualquier host que no sea local. Los scripts de siembra (`dev:datos`, `dev:admin`) se niegan a correr contra una base remota.
- **Panel lateral con carga diferida:** la cáscara vive en el layout y el panel completo se descarga en un tiempo libre (o al acercarse al ícono), para no sumar peso a la primera carga.
- **Una sola validación con el servidor** para panel y pedido (módulo con caché por contenido del carrito): evita pedidos repetidos y garantiza que ambos muestren lo mismo.
- **Ventas inmutables + anulación** (en lugar de editar/borrar): es la forma de que el stock no quede inconsistente; los disparadores de la base lo hacen cumplir aunque falle la aplicación.
- **Precio de venta en pesos enteros**, editable; no se aplican descuentos automáticos en ventas manuales (el dueño escribe lo cobrado).
- **Nombre y apellido:** al menos dos palabras, solo letras, espacios, apóstrofes, puntos y guiones (una persona con un solo nombre tendría que agregar algo; decisión a revisar).
- **Avatar de «Mi cuenta»:** dibujo original en SVG; no se usó arte de Pikachu por no haber un recurso con permiso en el proyecto.

## Consultas conectadas con ventas y stock (17/10/2026)
- **Se reutiliza el sistema de ventas existente** (`registerSale`, `voidSale`, candados `override:<producto>`, historial inmutable): no hay una segunda fuente de verdad del stock.
- **El vínculo vive en `inquiry_sales`, no en `sales`:** una venta es un registro inmutable (disparador `venta_solo_se_anula`), así que vincular una venta existente no puede editarla. Una fila `active` = venta vigente de la consulta; al anular se cierra (`active=false`, queda como historia) y se puede reconvertir. Índice único parcial: una sola vinculación vigente por consulta; `sale_id` único: una venta pertenece a una sola consulta.
- **Orden de candados:** clave de la operación → consulta (`inquiry:<id>`) → venta (`sale-void:<id>`) → productos (`override:<id>`, ordenados). `voidSale` mira el vínculo, toma el candado de la consulta y confirma que no cambió (reintenta si alguien vinculó en ese instante).
- **`inquiries.crm_status` aparte de `inquiries.status`:** el estado de gestión no reemplaza al que ve el cliente en «Mis consultas».
- **Productos por encargo fuera de la venta:** el sistema de ventas solo vende stock cargado y no admite stock negativo; las líneas por encargo se listan aparte y no tocan el stock.
- **«Convertida» solo por venta:** crear o vincular una venta; se sale anulándola. Convertir confirma el contacto (la conversión sobre contactos nunca supera 100%).
- **Pruebas en UTF-8:** el PostgreSQL embebido de pruebas se inicializa con `--encoding=UTF8 --locale=C` (heredaba WIN1252 en Windows).
