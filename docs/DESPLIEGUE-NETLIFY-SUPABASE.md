# Publicación gratuita: Netlify + Supabase (vista previa)

Estado: **preparado, NO publicado**. Rama `migracion/netlify-supabase` (punto de partida: tag `pre-migracion-postgres`, commit `f38dc40`). No se hizo push, no se creó ningún servicio ni se copiaron datos a servicios externos.

## Qué cambió respecto de la tienda local

| Antes (local) | Ahora (Netlify + Supabase) |
|---|---|
| SQLite en un archivo | PostgreSQL en Supabase (`DATABASE_URL`), acceso 100 % asíncrono |
| Fotos subidas en una carpeta | Supabase Storage, bucket `product-images` (las rutas `/images/uploads/<nombre>` no cambian) |
| Temporizador de la cotización en memoria | La cotización se renueva en el primer pedido que la encuentra vencida (15 min), coordinada por la base |
| `hasAsset` miraba el disco | Listado generado en cada build (`src/generated/public-assets.json`) |
| Respaldo = copia del archivo | Respaldo = carpeta con filas + fotos, verificada por huellas |

El esquema, ids, relaciones, índices y datos históricos se conservan; `tests/postgres-esquema.test.ts` compara el esquema nuevo con el SQLite original (tablas, columnas, NOT NULL, claves, índices y relaciones con cascada). Las migraciones SQLite originales quedaron en `drizzle-sqlite-legacy/` (solo referencia). Las de PostgreSQL están en `drizzle/`.

## Lo que tenés que hacer vos (en este orden)

1. **Supabase**: crear un proyecto (plan Free). Elegí la región más cercana a las funciones de Netlify (por defecto EE. UU. este). Guardá la contraseña de la base.
2. **Cadenas de conexión** (Supabase > Connect): copiá la de *Transaction pooler* (puerto 6543) para `DATABASE_URL` y la de *Session pooler* (puerto 5432) para `DIRECT_URL`. La conexión directa es solo IPv6.
3. **Storage**: crear el bucket `product-images`, **público**, límite de archivo 5 MB, tipos `image/webp`. **No agregues políticas** de escritura: la subida se hace solo desde el servidor con la secret key.
4. **Claves**: Project Settings > API: `SUPABASE_URL` y la *secret key* (`SUPABASE_SECRET_KEY`). Nunca con prefijo `NEXT_PUBLIC_`.
5. **Archivo local `.env.local`** (ignorado por Git) con `DIRECT_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL` (ver `.env.example`).
6. **Migrar el esquema**: `npm run db:migrate`.
7. **Ensayo de migración de datos** (no escribe nada): `npm run db:migrar-sqlite -- --origen .local/backups/pre-postgres/<archivo>.db --uploads .local/backups/pre-postgres/uploads`. Para escribir primero en una **base de prueba** (otro proyecto Supabase o PostgreSQL local), y recién con tu visto bueno al definitivo: agregar `--ejecutar` y, si el destino no es tu computadora, `--destino-publico`. Repetirlo es seguro (no pisa cambios posteriores). **Esto copia datos de clientes (cuentas, consultas) a Supabase: no lo ejecuto sin tu autorización expresa.**
8. **Administrador**: o bien la migración trae tu cuenta existente (correo confirmado), o corré `npm run admin:crear` (pide la contraseña por teclado; crea la cuenta de `ADMIN_EMAIL` ya confirmada). Sin esto no podrás entrar a `/admin` porque aún no hay correo.
9. **Netlify**: crear la cuenta, *Add new site > Import from Git* (GitHub), rama a publicar. Build: `npm run build` (ya está en `netlify.toml`). Cargar las variables (abajo) en *Site configuration > Environment variables* (ámbito *Functions* y *Builds*).
10. **Primer deploy**, abrir `https://<sitio>.netlify.app/api/health` (debe decir `status: ok`) y recorrer la tienda. Poné `BETTER_AUTH_URL=https://<sitio>.netlify.app` y volvé a desplegar.
11. **Vista previa con acceso controlado**: en Netlify activá *Password protection* / acceso restringido de la vista previa si tu plan lo permite (puede requerir un plan de pago: verificalo en tu panel) o no compartas la URL hasta el lanzamiento. Hasta definir esto, el sitio con datos reales **no debería** difundirse.
12. **Push**: el repositorio pesa ~750 MB de historia (fotos). Antes de subirlo a GitHub revisá `git count-objects -vH` y los límites de GitHub; no hice push.

## Variables

| Variable | Dónde | Qué es |
|---|---|---|
| `DATABASE_URL` | Netlify (servidor) | Pooler Supabase, modo transacción, puerto 6543 |
| `DIRECT_URL` | Solo tu `.env.local` | Pooler modo sesión 5432 (migraciones, respaldos, scripts) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` | Netlify (servidor) | Storage de fotos |
| `BETTER_AUTH_SECRET` | Netlify | Secreto largo y aleatorio (≥ 32 caracteres) |
| `BETTER_AUTH_URL` | Netlify | URL pública `https://…netlify.app` |
| `ADMIN_EMAIL` | Netlify | Único correo administrador |
| `WHATSAPP_NUMBER` | Netlify | Opcional; vacío = modo demo |
| `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM` | Netlify | Correo transaccional (ver `CORREO.md`); vacío = registro público deshabilitado |
| `CRON_SECRET` | Netlify | Opcional: habilita `/api/fx/refresh` para una tarea externa |
| `FX_AUTO_REFRESH`, `FX_PROVIDER_URL` | Netlify | Opcionales de cotización |

Todas las claves privilegiadas son de servidor. Ninguna se llama `NEXT_PUBLIC_*`. **No pegues credenciales en chats ni en el repositorio**: cargalas en los paneles o en `.env.local`.

## Detalles técnicos y límites a conocer

- **Conexiones**: `prepare: false` (el pooler en modo transacción no admite sentencias preparadas) y 1 conexión por instancia (recomendación de Supabase para serverless). Dentro de una transacción siempre se usa `tx`.
- **Concurrencia**: las ediciones del panel usan `pg_advisory_xact_lock` por producto además de la versión (detecta ediciones simultáneas); los límites de uso son una sola sentencia atómica; la consulta a la cotización se «reclama» con un UPDATE condicional. Probado con conexiones independientes (`tests/postgres.test.ts`).
- **Cotización**: sin proceso encendido, el primer pedido tras 15 minutos espera hasta 3 s la consulta al proveedor y usa la última válida si falla. Se mantienen los estados de antigüedad (fresca 2 h, usable 24 h). No hay tarea programada ni tráfico artificial; `/api/fx/refresh` queda disponible si preferís una externa.
- **Subidas**: 5 MB por foto (antes 8 MB): las funciones de Netlify tienen un tope de cuerpo del pedido cercano a 6 MB (no pude verificar la cifra exacta en la documentación consultada: confirmala). El procesado con `sharp` debe terminar dentro del tiempo de la función (por defecto unos 10 s en el plan gratuito; verificalo en tu panel).
- **Sesiones**: las sesiones locales no se migran (expiran). Cambiar el secreto o el origen invalida las sesiones y hay que volver a ingresar.
- **Orígenes**: la protección de origen compara contra `x-forwarded-host`; las vistas previas por rama (otra URL) no están en `trustedOrigins`: usá la URL principal.
- **Fotos de `public/images`** (2.074 archivos, ~96 MB) viajan con el sitio; no se subieron a Storage.

## Límites de los planes gratuitos (consultados el 14/10/2026 en las páginas oficiales)

**Supabase Free** (supabase.com/pricing): 500 MB de base, 1 GB de archivos, subida máxima 50 MB, 5 GB de tráfico + 5 GB en caché, 2 proyectos activos, **el proyecto se pausa tras 1 semana sin actividad**. No incluye respaldos descargables automáticos: corré `npm run db:backup` periódicamente y guardá la carpeta fuera de la computadora. Al pausarse, el sitio deja de funcionar (`/api/health` devuelve 503) hasta reanudar el proyecto desde el panel; los datos se conservan mientras no se supere el período de retención que indique Supabase (verificalo). No agregué tráfico artificial para evitar la pausa.

**Netlify Free** (credit-based): 300 créditos por mes, límite duro, sin recarga automática, sin acumulación. Costos: 15 créditos por deploy de producción, 20 por GB transferido, 2 por cada 10.000 pedidos web, 10 por GB-hora de cómputo (≈ 20 deploys, o ~15 GB, o ~30 GB-h con una sola de estas cosas). **No pude confirmar qué ocurre con el sitio al agotar los créditos** (la documentación consultada no lo detalla): verificá «Resume paused projects» y tu panel de facturación. Cada foto de producto optimizada y cada página dinámica consume pedidos y cómputo: la tienda no es estática.

Esto cambia con el tiempo; confirmalo en https://www.netlify.com/pricing/ y https://supabase.com/pricing antes de lanzar.

## Respaldo y restauración

```
npm run db:backup                         # carpeta backups/tienda-AAAAMMDD-HHMMSS (filas + fotos), verificada
npm run db:restore -- backups/tienda-… --yes [--reemplazar]
```
Restaurar exige un destino vacío salvo `--reemplazar`, guarda antes un respaldo de seguridad (`pre-restauracion-*`) y vuelve a leer todo para comparar. Probado en bases descartables (`tests/backup.test.ts`, `tests/scripts.test.ts`). El respaldo SQLite original está en `.local/backups/pre-postgres/` (base + fotos): **no lo borres**, es la vuelta atrás.

## Pruebas

Ver `docs/ESTADO.md` (sección «Migración a Netlify + Supabase») para qué se probó con PostgreSQL real local y qué sigue **pendiente** porque exige credenciales reales (Storage real, Netlify, correo real).
