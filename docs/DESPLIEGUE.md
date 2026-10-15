> **Aviso (14/10/2026):** la base pasó de SQLite a PostgreSQL (Supabase) en la rama `migracion/netlify-supabase`. Donde este documento diga SQLite, `DATABASE_PATH` o `UPLOADS_DIR`, ver [DESPLIEGUE-NETLIFY-SUPABASE.md](DESPLIEGUE-NETLIFY-SUPABASE.md) (esos mecanismos solo valen para el entorno local anterior).

# Despliegue futuro (referencia: no se contrató ni se publicó nada)

Este documento describe qué hace falta para publicar la tienda cuando el dueño lo decida. **Nada de esto se hizo.** No hay dominio, hosting, correo transaccional ni cuentas contratadas.

## Qué tipo de hosting sirve
La app es una aplicación Next.js con **runtime Node** y una base **SQLite en un archivo**. Por eso necesita:
- Un **servidor Node.js ≥ 22** que corra de forma continua (`npm run start`), con **disco persistente**.
- **No sirve** un hosting estático ni un sistema de archivos efímero (cada reinicio perdería cuentas y consultas), ni un runtime Edge (SQLite nativo).
- Una sola instancia: SQLite y los límites de uso guardados en la base están pensados para **un servidor**. Escalar a varios servidores exige migrar a una base compartida (p. ej. PostgreSQL) y a un límite de uso distribuido; no está hecho.
- Si más adelante se prefiere un hosting *serverless*, hay que planificar una migración **probada** de la base (Drizzle facilita cambiar de motor) antes de usarlo.

## Requisitos
| Tema | Requisito |
| --- | --- |
| Node | ≥ 22 (`.nvmrc` = 24). `npm ci` + `npm run build` en el servidor, o build en CI y copiar el resultado |
| Disco | Persistente, con la carpeta de la base (`DATABASE_PATH`) y espacio para backups |
| HTTPS | Obligatorio (las cookies de sesión son `Secure` en producción). Terminar TLS en un proxy inverso (nginx, Caddy, etc.) |
| Proxy | Debe enviar `x-forwarded-for` con la IP real del cliente (los límites de uso la usan) y `Host`/`Origin` coherentes con `BETTER_AUTH_URL` |
| Correo | Proveedor transaccional con dominio verificado (SPF/DKIM). **Hoy no hay ninguno implementado** |
| Backups | `npm run db:backup` programado (diario) + copia fuera del servidor. Ver [OPERACION.md](OPERACION.md) |

## Variables de entorno (producción)
| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `NODE_ENV` | sí | `production` (lo fija `npm run start`) |
| `BETTER_AUTH_SECRET` | **sí** | Secreto largo y aleatorio (≥ 32 bytes). Sin él la app **no inicia sesiones** en producción. Nunca en el repositorio |
| `BETTER_AUTH_URL` | **sí** | URL pública `https://tu-dominio` (se usa para enlaces de correo y para validar el origen) |
| `DATABASE_PATH` | sí | Ruta del archivo SQLite en el disco persistente |
| `WHATSAPP_NUMBER` | sí | Número de la tienda, solo dígitos, formato internacional |
| `BACKUP_DIR`, `BACKUP_KEEP` | no | Destino y retención de `db:backup` |
| `RATE_LIMIT_INQUIRIES_PER_HOUR`, `RATE_LIMIT_VALIDATE_PER_MIN` | no | Límites de uso (por defecto 60/hora y 120/min) |
| *(variables del proveedor de correo)* | sí, cuando se implemente | Credenciales del proveedor elegido, en el entorno del servidor |

`.env.example` documenta los nombres con valores vacíos. Los secretos reales **no se versionan**.

## Pasos sugeridos (cuando se decida publicar)
1. Completar los pendientes de [PENDIENTES-PUBLICACION.md](PENDIENTES-PUBLICACION.md) (datos del comercio, textos legales, catálogo e imágenes reales, número de WhatsApp).
2. Elegir hosting y dominio. Preparar el servidor: Node ≥ 22, proxy con HTTPS, disco persistente.
3. Implementar el proveedor de correo en `src/server/mail.ts` (interfaz `sendMail`) y verificar el dominio emisor. Probar confirmación de cuenta y recuperación de punta a punta con un correo real.
4. Definir las variables de entorno de la tabla anterior.
5. `npm ci && npm run build`, `npm run db:migrate`, y `npm run start` bajo un supervisor (systemd, pm2, etc.) con reinicio automático.
6. Programar `npm run db:backup` y copiar los archivos fuera del servidor. **Probar una restauración** antes de abrir al público.
7. Verificar `GET /api/health`, el recorrido completo (catálogo → ficha → carrito → consulta → WhatsApp), registro, recuperación, favoritos y «Mis consultas».
8. Ejecutar `npm run release:check` con las variables de producción cargadas: **debe salir sin bloqueantes**.
9. Aprobación explícita del dueño para publicar.

## Actualizar la aplicación
1. `npm run db:backup`.
2. Traer el código nuevo, `npm ci`, `npm run build`, `npm run db:migrate` (las migraciones son repetibles y no borran datos).
3. Reiniciar el servicio y comprobar `/api/health`.
4. Si algo sale mal: volver al código anterior y, si hizo falta, restaurar la copia (`db:restore`).

## Seguridad: qué ya está y qué falta
- Ya está: contraseñas con hash (scrypt), cookies `httpOnly` + `SameSite=Lax` (+ `Secure` en producción), verificación de correo, tokens de un solo uso, validación de origen en los POST, límites de uso persistentes, validación de precios/cantidades/disponibilidad en el servidor, consultas visibles solo para su dueño, sin analítica ni cookies de terceros.
- Falta/decidir: proveedor de correo, política de retención de datos, encabezados de seguridad adicionales en el proxy (HSTS, CSP) según el hosting, monitoreo y alertas, y una revisión de seguridad independiente antes de abrir cuentas públicas.
