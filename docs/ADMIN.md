> **Aviso (14/10/2026):** la base pasó de SQLite a PostgreSQL (Supabase) en la rama `migracion/netlify-supabase`. Donde este documento diga SQLite, `DATABASE_PATH` o `UPLOADS_DIR`, ver [DESPLIEGUE-NETLIFY-SUPABASE.md](DESPLIEGUE-NETLIFY-SUPABASE.md) (esos mecanismos solo valen para el entorno local anterior).

# Panel del dueño (`/admin`)

Cambios de alcance pedidos por el dueño: el 13/10/2026 precio y stock desde la web; el 14/10/2026 (tanda 6) **precios en USD con conversión a pesos, fotos, textos de la ficha y cotización del dólar**, sin tocar código. **Sigue sin haber** alta de productos nuevos desde la web, pagos en línea ni multivendedor: las fichas nuevas (como la de Bulbasaur) siguen entrando por código y luego se editan desde el panel.

## Cómo entra el dueño (obligatorio, explícito)

1. Registrá tu cuenta en `/cuenta/registro` con **tu** correo y confirmá el correo con el enlace que llega (sin confirmar no hay acceso).
2. Definí en el entorno del servidor `ADMIN_EMAIL=tu-correo@dominio.com` (en desarrollo: en `.env.local`) y reiniciá el servidor. Ver `.env.example`.
3. Entrá a `/admin` (también hay un enlace en «Mi cuenta» solo para vos).

No existe una credencial compartida, contraseña pública ni cuenta administradora universal: el único administrador es la cuenta con correo **confirmado** igual a `ADMIN_EMAIL`. Reglas de seguridad (todas en el servidor, `src/server/admin.ts`):
- **Sin `ADMIN_EMAIL` el panel queda cerrado para todos.** No hay «primer usuario administrador», ni contraseña por defecto, ni un campo para declararse administrador.
- Invitados: las páginas redirigen al ingreso y las operaciones responden 401. Cuentas comunes o mayoristas: las páginas responden 404 y las operaciones 403. Cabeceras, cookies o campos extra enviados por el navegador no cambian esa decisión.
- Valen igual para **páginas, API de productos, API de fotos (`/api/admin/media`, galerías), API de cotización (`/api/admin/fx`)** y la vista previa de fichas no publicadas. Todas las operaciones además exigen mismo origen, tienen límite de uso y validan los datos con Zod.
- El único endpoint de escritura que no es del administrador es `/api/fx/refresh` (para una tarea programada): exige `Authorization: Bearer <CRON_SECRET>` y sin esa variable no existe.

## Menú

**Productos** (lista y edición rápida) · **Cotización** (dólar blue) · **Mayoristas** (solo lectura) · **Historial de cambios**.

## Lista de productos (`/admin`)

Columnas: foto chica, producto (título, colección, SKU, formato), **idioma**, **precio base en USD**, **precio en pesos convertido**, **stock** y **estado**. Se busca por nombre, nombre original, colección o SKU (sin distinguir tildes ni mayúsculas) y se filtra por estado (Pendientes, Disponibles, Agotados, Por encargo, Ocultos y borradores, Retirados) e idioma.

- **Edición rápida**: escribí USD y stock en la fila; mientras escribís ves en vivo el precio en pesos que resultará («→ $12.300»). «Guardar» por fila o «Guardar N cambios» para todas. Las filas con cambios sin guardar se marcan y, si intentás salir de la página con cambios pendientes, el panel avisa (cierre de pestaña, recarga o un enlace).
- La edición rápida solo toca precio y stock: **no pisa** título, descripción, máximo, publicación ni fotos.
- «Editar ficha» abre el editor completo.

## Editor de ficha (`/admin/productos/<id>`)

- **Título y descripción breve** editables (con enlace para volver a los del catálogo). Idioma, formato, colección, fuentes, contenido y garantías **no** se editan: siguen viniendo del catálogo verificado.
- **Precio base (USD)**, con decimales (`10`, `10,50`); vacío = pendiente (no es USD 0). Debajo se ve el precio en pesos resultante con la cotización vigente.
- **Stock**, con cuatro situaciones que no se confunden: **cantidad** (0 = agotado), **cantidad desconocida** (pendiente), **disponible por encargo** (no se vende de stock; se consulta y se cotiza con la tienda) y **retirado** (lo define el código; no se puede volver a mostrar desde el panel).
- **Máximo por pedido** y **Publicada** (visible en la tienda). Una ficha en **borrador** (hoy, la de Bulbasaur) muestra su aviso y para publicarla hay que tildar que el dato pendiente ya está resuelto.
- **Fotos**: la primera es la **portada** (la de tarjetas y listas). Se puede subir una foto, elegir una de la biblioteca (todas las del catálogo y las subidas), reordenar (↑ ↓ o «Hacer portada»), editar el texto alternativo y quitar. Siempre queda al menos una (máx. 12). Cada foto subida se rotula según quién la sacó: **mi stock real** (queda como foto final de la tienda) o referencia de proveedor/fabricante. Las fotos de proveedor del catálogo siguen identificadas como referencia.
- **Previsualizar ficha pública** (`/productos/<slug>?preview=1`): muestra la ficha tal como se vería, **incluso si está oculta o en borrador**, solo para el administrador y con un cartel «vista previa». Para cualquier otra persona sigue siendo 404.
- Guardar muestra confirmación o errores por campo. Las ediciones simultáneas se rechazan en vez de pisarse.

### Subida de fotos (seguridad y optimización)

JPG, PNG o WebP de hasta 8 MB, al menos 300 px y a lo sumo 12.000 px de lado. Se **identifica el formato por el contenido** (no por la extensión ni el tipo declarado), se decodifica y se **re-codifica a WebP** (máx. 1.600 px de lado; sin metadatos ni cargas anexadas) y se genera una **miniatura de 400 px** para listas. El nombre final lo genera el servidor (hash del resultado): el nombre original nunca se usa como ruta y un archivo subido jamás se ejecuta. Se guardan en `.local/data/uploads` (junto a la base; `UPLOADS_DIR` para cambiarlo) y se sirven por `/images/uploads/<nombre>` con caché larga. En producción esa carpeta debe estar en un disco persistente con backup. Nada depende de rutas de Descargas.

## Cotización (`/admin/cotizacion`)

Ver [COTIZACION.md](COTIZACION.md): tasa vigente, fuente, fecha de publicación, última consulta exitosa, errores, modo automático/manual, valor manual con nota, vista previa del efecto sobre los precios e historial.

## Cómo conviven con el catálogo por código

- `src/content/real/commercial.json`, `productos.json` y demás archivos son la **base**. Lo que se carga en el panel se guarda en la **base de datos**: `product_overrides` (una fila por producto editado), `product_galleries` (galería elegida), `media_assets` (fotos subidas), `fx_settings`/`fx_log` (cotización), `product_audit` (historial).
- **Si un producto tiene fila en el panel, sus valores (precio USD, stock, máximo, publicación, por encargo y, si se editaron, título y descripción) reemplazan a los del código**, incluso si el código cambia después. Si no tiene fila, rige el código. «Restablecer» borra la fila y deja constancia en el historial; las fotos se restablecen aparte.
- **Los importadores, seeds y scripts del catálogo no pisan lo cargado por el dueño**: `npm run precios:importar -- --write`, `importar-chinos.mjs` y demás solo cambian archivos de código y fotos del repositorio; nunca escriben `product_overrides`, `product_galleries` ni `fx_settings`. Un valor del CSV no rige sobre un producto ya editado en el panel (ver COTIZACION.md sobre el precio en ARS).
- Los valores se leen de la base en cada pedido: un cambio se ve enseguida en catálogo, fichas, inicio, expansiones y carrito, **sin editar archivos ni recompilar**.
- Los backups (`npm run db:backup`) incluyen estas tablas (las fotos subidas están en `uploads/`: copiar esa carpeta junto con la base).
- `npm run release:check` calcula «pendientes» con los valores del panel de la base local y avisa si falta `ADMIN_EMAIL`.

## Garantías de consistencia

- **Consultas históricas:** guardan una copia (snapshot) de importes, productos **y cotización usada**. Cambiar un precio o el dólar no las modifica.
- **Carrito:** el servidor recalcula con los valores y la cotización vigentes; si el precio cambió pide aceptar el nuevo importe (`price_changed`), y avisa si hay agotado, límite superado, pendiente u oculto.
- **Abrir WhatsApp o preparar una consulta no descuenta stock.** El stock lo maneja el dueño desde el panel.
- Cada cambio se guarda junto con su registro en una única transacción. Guardar sin cambios reales no escribe nada.
- **Historial** (`/admin/historial`, o por producto): quién, cuándo, valor anterior y nuevo de cada dato (precio USD, stock, máximo, publicación, por encargo, título, descripción, fotos, restablecimientos). La cotización tiene su propio historial. No se edita ni se borra desde la web.

## Solicitudes mayoristas (tanda 4)

`/admin/mayoristas` lista las solicitudes (comercio, contacto, ubicación, nota, estado) en **solo lectura**. Aprobar o rechazar (`PATCH /api/admin/mayoristas/[id]`, solo el administrador) está preparado pero **apagado** hasta que el dueño defina las políticas: responde 409 `policy_pending` y no cambia nada. Ver [POLITICAS.md](POLITICAS.md).

## Pruebas

- Unitarias: `tests/admin.test.ts` (reglas, versiones, historial, USD→ARS, por encargo, edición parcial, restablecer, validación, quién es administrador), `tests/fx.test.ts` (conversión, antigüedad, proveedor simulado, modo manual, cuotas, seña), `tests/media-gallery.test.ts` (subida y galerías), `tests/aniversario.test.ts` (portadas y ficha de Bulbasaur).
- e2e (`tests/e2e/admin.spec.ts`, servidor `:3103` con `ADMIN_EMAIL=dueno-e2e@example.com`, sin red para el dólar y base propia): invitado, otra cuenta y panel cerrado (también para fotos y cotización), cotización manual, edición rápida y aviso de cambios sin guardar, reflejo en catálogo/ficha/carrito/filtros, cambio de cotización entre carrito y consulta, snapshot de consultas, editor de ficha, estados de stock, vista previa, subida y orden de fotos (válidas e inválidas, escritorio y móvil), historial, restablecer, ediciones simultáneas, accesibilidad y móvil.

## Límites conocidos

- Un solo administrador (un correo). Para cambiarlo: cambiar `ADMIN_EMAIL` y reiniciar.
- No hay alta de productos nuevos desde la web (entran por código y se editan en el panel); no se editan idioma, formato, colección, fuentes, contenido ni garantías.
- No hay recuperación propia del panel: si perdés el acceso a la cuenta, se usa la recuperación de contraseña de siempre.
- Las fotos subidas viven en disco local (`uploads/`): con varios servidores o hosting efímero habría que moverlas a un almacenamiento compartido.

## Stock inicial en 0 y cómo cargar cantidades (14/10/2026)

- **Todas las fichas empiezan con stock propio 0** («Sin stock»): las existentes por una inicialización única (`npm run stock:inicializar -- --write`, con respaldo previo en `.local/backups/`, registrada en el historial como «inicialización») y las nuevas por defecto. Las ocultas y los borradores siguen ocultos; los retirados no se tocan. La inicialización queda marcada en la base (`system_flags`): **no se repite** al reiniciar, construir o volver a ejecutarla, y nunca baja una cantidad que cargues vos. Para volver atrás: `npm run db:restore` con el respaldo.
- **Cargar stock:** en `/admin`, escribí la cantidad en la columna «Stock» de la fila (o en el editor de la ficha) y «Guardar». Con una cantidad positiva el producto pasa a «Disponible», se puede comprar (si tiene precio) y entra en «En stock» y su vista filtrada; con 0 vuelve a «Sin stock» y a ofrecer la consulta por encargo. «Cantidad desconocida» sigue existiendo como opción explícita, pero ya no es el estado de partida.
- **Sin stock:** la ficha muestra «Sin stock disponible», explica que se puede consultar por encargo (seña del 20% solo después de confirmar disponibilidad y cotización; no se cobra antes ni se prometen fechas o avisos de reposición) y el botón «Consultar por encargo». Las tarjetas dicen «Sin stock». Productos retirados u ocultos no ofrecen encargo.
- **Precio por sobre** (solo cajas con «Sobres por caja» confirmado): precio vigente de la caja ÷ sobres, con el redondeo a $100 del sitio («Aprox.» si no es exacto) y el USD por sobre; se actualiza con el precio y la cotización. Es informativo: no cambia ningún precio ni habilita sobres sueltos.

## Mejoras del panel (14/10/2026, segunda pasada)

Se revisó qué había y **no se duplicó nada**: ya existían la búsqueda por nombre/colección/SKU, el filtro de idioma y de estado, la edición de varias filas con «Guardar N cambios» y la subida de **una** foto con orden y portada. Se agregó:
- **Filtros por formato y por colección** (se combinan con los anteriores; los botones de estado «Sin stock» —antes «Agotados»— y «Stock bajo» llevan su cuenta).
- **Aviso de stock bajo configurable** (tabla `admin_settings`, `PATCH /api/admin/settings`, valor inicial sugerido 3, 0 = sin aviso): marca «Stock bajo» en la lista y se filtra; solo dentro del panel, no cambia la tienda ni envía nada.
- **Edición múltiple**: selección de filas y acciones en masa (poner/sumar/restar stock; fijar USD o ajustar en %) que **solo preparan los borradores**; se confirman con «Guardar N cambios» (cada fila usa el mismo guardado con control de versión e historial).
- **Subida de varias fotos** a la vez (también arrastrando), en el orden elegido, con rechazos informados uno por uno, límite de 12 y portada/orden antes de guardar.
Guía corta: [GUIA-ADMIN.md](GUIA-ADMIN.md). Pruebas: `tests/admin-mejoras.test.ts` y los tests nuevos de `tests/e2e/admin.spec.ts`.
