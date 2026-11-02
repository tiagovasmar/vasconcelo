# Plan de publicación y vuelta atrás (NO ejecutado)

Este plan describe cómo publicar la tanda de pedidos, encargos, costos y mayoristas. **No se ejecutó nada de esto**: no hay push, ni migración en Supabase real, ni despliegue, ni cambios de precios, stock o datos de producción. Hace falta una autorización explícita del dueño para cada paso marcado con 🔒.

## 0. Antes de empezar
- Revisión del dueño de la tanda (capturas, `docs/DECISIONES-PENDIENTES-PEDIDOS.md`).
- Conservar la conexión de Supabase en **sesión (5432)** con `prepare: false` (`DATABASE_URL` y `DIRECT_URL`). No pasar a 6543.
- La rama de partida es `perf/velocidad-de-carga` (último commit publicado informado `2d2ca08`). Los archivos de favicon (`src/app/apple-icon.png`, `favicon.ico`, `icon.svg`) **no** están en ningún commit de esta rama.

## 1. Preparación (sin tocar producción)
1. 🔒 Respaldo: `npm run db:backup` apuntando a producción (`DIRECT_URL`). Guarda cada tabla en NDJSON con huellas (ya incluye las tablas nuevas, vacías). **Los comprobantes viven en Storage y no están en este respaldo** (la tanda no los crea hasta que se use).
2. Revisar la migración `drizzle/0004_pedidos_encargos_mayorista.sql`: **solo agrega** (`CREATE TABLE`, un `ADD COLUMN ... DEFAULT 'minorista'` en `inquiries`, índices y claves). No borra ni modifica filas.
3. Ensayo en una base descartable (ya hecho en local con `embedded-postgres`; repetir con la copia de Supabase si se quiere): `DIRECT_URL=<base de ensayo> npm run db:migrate`.

## 2. Configuración externa (la hace el dueño)
1. 🔒 **Supabase Storage**: crear el bucket **privado** `payment-receipts` (con *Public bucket* **desactivado**). Verificar que NO tenga políticas de lectura pública. Las escrituras y lecturas las hace solo el servidor con `SUPABASE_SECRET_KEY`. Cargar `SUPABASE_RECEIPTS_BUCKET=payment-receipts` en Netlify.
2. 🔒 **Correo**: proveedor y remitente verificados (`MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`; ver `docs/CORREO.md`). Sin esto, los avisos quedan «pendientes» (los cambios se conservan).
3. 🔒 **Google** (opcional, se puede publicar sin esto): `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` según `docs/GOOGLE.md`.

## 3. Publicación
1. 🔒 Push de la rama a `origin` y **vista previa** de Netlify (no producción). Verificar con un `netlify.toml` sin cambios.
2. 🔒 Aplicar la migración en Supabase: `DIRECT_URL=<sesión 5432> npm run db:migrate`. Comprobar `drizzle.__drizzle_migrations` y que existan las 18 tablas nuevas y la columna `inquiries.order_kind`.
3. Prueba de humo en la vista previa con datos reales sin tocarlos: `/api/health`, un producto agotado (aparece «Avisame cuando vuelva»), `/mayoristas`, `/mayoristas/catalogo` (cerrado: «todavía no está habilitado»), `/admin/pedidos` con el dueño, y una subida de comprobante de prueba **a un pedido de prueba** (no a clientes).
4. 🔒 Fusionar y desplegar a producción cuando el dueño lo autorice.
5. Después: abrir el catálogo mayorista **solo** cuando el dueño defina las condiciones (`/admin/mayoristas`).

## 4. Vuelta atrás
- **Aplicación**: en Netlify, *Deploys → Publish deploy* del despliegue anterior (`0687e6a` o el último publicado). Es inmediato y no toca la base.
- **Base de datos**: la migración es aditiva; el código anterior ignora las tablas y la columna nuevas, así que **no hace falta deshacerla** para volver atrás. Si igual se quiere dejar el esquema como antes (solo si no se cargó ningún dato en las tablas nuevas, y después de un respaldo): `DROP TABLE` de las tablas nuevas en orden inverso a las dependencias y `ALTER TABLE inquiries DROP COLUMN order_kind`, y borrar la fila 0004 de `drizzle.__drizzle_migrations`. Con datos cargados, **no** borrar: conservarlos y volver solo la aplicación.
- **Comprobantes**: quedan en el bucket privado; no se exponen aunque se vuelva atrás. Borrarlos solo con decisión del dueño.
- **Google / correo**: quitar las variables y redesplegar apaga el botón y los envíos.
- Los pagos y reintegros registrados son constancias; no se borran (se anulan con motivo).
