> **Aviso (14/10/2026):** la base pasó de SQLite a PostgreSQL (Supabase) en la rama `migracion/netlify-supabase`. Donde este documento diga SQLite, `DATABASE_PATH` o `UPLOADS_DIR`, ver [DESPLIEGUE-NETLIFY-SUPABASE.md](DESPLIEGUE-NETLIFY-SUPABASE.md) (esos mecanismos solo valen para el entorno local anterior).

# Operación del día a día

**Precios, stock, máximo por pedido y visibilidad se administran desde el panel `/admin`** (ver [ADMIN.md](ADMIN.md): cómo habilitarlo con `ADMIN_EMAIL`, qué hace y cómo conviven con el catálogo por código). Lo demás (textos, imágenes, composición, garantías, altas de productos) se edita **en archivos del proyecto**. Flujo: editar → `npm run catalog:check` → mirar en `npm run dev` → commit → (cuando haya hosting) publicar.

## Productos, precios y stock
> Si un producto ya fue editado en el panel, sus valores del panel tienen prioridad sobre `commercial.json` y sobre el CSV; para volver a los del código usá «Restablecer» en `/admin`. Lo que sigue describe los valores **base por código**.

**Catálogo real (8 colecciones, 16 fichas):** el dueño completa `datos/precios-y-stock.csv` (separador `;`, columnas `sku;coleccion;formato;idioma;precio_ars;stock_unidades;estado_del_sellado;observaciones`; precio en pesos enteros). Después:
1. `npm run precios:importar` (revisa y muestra qué cambiaría, no escribe).
2. `npm run precios:importar -- --write` (escribe `src/content/real/commercial.json`).
3. `npm run catalog:check`.

Celda vacía = pendiente (no es $0 ni agotado). Precio y stock son independientes **por SKU** (caja y sobre no comparten). Un SKU sin precio o sin stock sigue sin poder consultarse con importe. Abrir WhatsApp no descuenta stock. Detalle del lote: [COLECCIONES.md](COLECCIONES.md).

Para altas manuales: `src/content/real/products.ts`. Un producto = un objeto (ver el ejemplo completo en [CATALOGO.md](CATALOGO.md)).
- **Precio**: `priceMinor` en **centavos enteros** (`$9.500` → `950000`). El servidor lee siempre este valor; el navegador nunca fija precios.
- **Stock**: `stockQuantity` (entero ≥ 0). Es **manual**: después de cerrar una venta por WhatsApp, cambiás el número y publicás. Abrir WhatsApp **no** reserva ni descuenta stock. Con `0` el producto figura «Agotado» (no se puede agregar al carrito, sí consultar).
- **Máximo por pedido**: `maxPerOrder`. El límite efectivo es el menor entre este valor y el stock.
- **Retirar un producto**: `active: false` (no se borra: las consultas ya guardadas conservan su copia del pedido).
- Si un cliente tiene en el carrito un producto cuyo precio cambió, el carrito le avisa y le pide aceptar el nuevo precio antes de continuar.

## Cartas, probabilidades, garantías y fuentes
Ver [CATALOGO.md](CATALOGO.md). Resumen de reglas (el validador las hace cumplir):
- **Cartas** en `src/content/real/expansions.ts` (cartas generadas por `npm run colecciones:cartas`). Si no hay lista verificada: `cardListStatus: "unavailable"` y `cards: []` (la ficha lo dice y enlaza la fuente). Parcial = `"partial"` («Galería parcial»).
- **Probabilidades** en `src/content/real/pull-rates.ts`: solo con evidencia (`official` con fuente, u `observed` con muestra, método y fuente). Sin evidencia: `probability: null` → «Dato no disponible» (nunca 0 %). No se convierte una tasa por sobre en tasa por caja ni se traslada entre idiomas o regiones.
- **Garantías** en `src/content/real/guarantees.ts`: una garantía de rareza exige fuente oficial aplicable al producto. Los packs armados por la tienda no heredan garantías de una caja de fábrica.
- **Fuentes** en `src/content/real/sources.ts` (URL, editor, fecha de consulta, alcance, nota).
- **Imágenes**: copiar el archivo a la ruta declarada en `public/images/...` y marcarla `status: "final"` con `origin` y `license`. Mientras no exista, se usa una ilustración de reserva. Tamaños y nombres: [ASSETS-PENDIENTES.md](ASSETS-PENDIENTES.md).

## WhatsApp
- **Número**: en `src/content/store.ts` (`whatsappNumber`) o en la variable de entorno `WHATSAPP_NUMBER`, que tiene prioridad. Formato internacional, **solo dígitos** (ej.: `54911XXXXXXXX`; sin `+`, espacios ni guiones). Un valor inválido se trata como «no configurado».
- **Sin número = modo demo**: se prepara y guarda la consulta, se muestra la vista previa y se puede copiar el mensaje; no se abre ningún chat.
- **Con número**: al tocar «Continuar por WhatsApp» se guarda la consulta y se abre `https://wa.me/<número>?text=...` con el pedido escrito; la persona toca *Enviar*. La página de la consulta conserva «Reabrir WhatsApp» y «Copiar mensaje». Abrir el chat **no** confirma pago, reserva ni venta; la consulta queda como «consulta preparada».
- **Pedidos muy largos**: si el enlace codificado supera 1.800 caracteres (límite conservador de diseño, no un límite oficial de WhatsApp), el chat se abre con un resumen + referencia y se ofrece copiar el detalle completo. Nunca se trunca nada.
- Cada consulta tiene una **referencia** (`TT-XXXXXXXX`): usala para encontrarla (sección «Mis consultas» del cliente) o para pedirle al cliente que la mencione.

## Correo (confirmación de cuenta y recuperación)
- **Desarrollo**: transporte local. Los correos se guardan como archivos en `.local/mail/` (carpeta ignorada por Git, nunca servida por la web). Contienen enlaces con tokens: no los pegues en chats ni logs compartidos. Ver el último: `npm run mail:last`.
- **Producción**: el transporte local está deshabilitado y **falla explícitamente** (no simula envíos). Falta implementar/configurar un proveedor transaccional en `src/server/mail.ts`: ver [DESPLIEGUE.md](DESPLIEGUE.md). Sin proveedor, nadie puede confirmar su correo ni recuperar su acceso, así que **no habilitar cuentas públicas** hasta resolverlo (o desactivar el registro).

## Base de datos y backups
La base es un archivo SQLite (`.local/data/tienda.db` o `DATABASE_PATH`). Contiene cuentas, sesiones, favoritos y consultas. **No** se versiona (está en `.gitignore`).

**Copia de seguridad** (se puede hacer con el servidor encendido):
```bash
npm run db:backup
# Copia creada y verificada: backups/tienda-20261012-103000.db
```
- Variables opcionales: `BACKUP_DIR` (carpeta destino, por defecto `./backups`) y `BACKUP_KEEP` (cuántas copias conservar).
- La copia es un único archivo, verificada con `integrity_check`. **Guardá copias fuera del equipo/servidor** (otro disco, almacenamiento externo): una copia en el mismo disco no protege de una falla del disco.
- Frecuencia sugerida al publicar: diaria, más una antes de cada actualización de la app.

**Restauración**:
1. **Detené el servidor.**
2. Elegí la copia y ejecutá:
   ```bash
   npm run db:restore -- backups/tienda-20261012-103000.db --yes
   ```
   Se verifica la copia, se guarda la base actual como `backups/pre-restauracion-*.db` (por si hay que volver atrás) y se reemplaza.
3. Iniciá el servidor. Si la copia es de una versión anterior de la app, las migraciones pendientes se aplican solas al arrancar.
4. Probá: `GET /api/health`, ingresar y ver «Mis consultas».

Sin `--yes` el comando no hace nada (solo explica). Una copia dañada o que no sea de esta tienda se rechaza sin tocar la base actual.

## Si algo falla
- `GET /api/health` responde `{"status":"ok"}` cuando la app y la base funcionan; `503` si no hay acceso a la base.
- Errores de consulta: el carrito se conserva y se puede reintentar; nunca se afirma que se guardó algo que falló.
- Límites de uso: 60 consultas por hora y por IP, 8 intentos de ingreso por minuto (ajustables con `RATE_LIMIT_INQUIRIES_PER_HOUR` y en `src/server/auth.ts`). Son válidos para **un solo servidor**.

### Verificación de respaldo y restauración (14/10/2026)
`node scripts/verificar-respaldo.mjs` ejecuta los comandos reales (`db:backup`, `db:restore`) sobre una base descartable en una carpeta temporal (se borra al terminar; nunca toca `.local/data/tienda.db`). Con `--desde-copia-de .local/data/tienda.db` parte de una copia de la base real (solo lectura sobre el original). Comprueba, comparando una huella del contenido de las 19 tablas: la copia es idéntica y de un solo archivo; `db:restore` sin `--yes` se niega; una copia corrupta o de otra aplicación se rechaza sin tocar la base; con `--yes` los datos vuelven exactamente a los del respaldo, queda `pre-restauracion-*` para volver atrás y la integridad es `ok`. **Límite:** la huella cubre la base, no la carpeta `uploads/` (fotos subidas desde el panel): respaldala aparte.
