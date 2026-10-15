> **Aviso (14/10/2026):** la base pasó de SQLite a PostgreSQL (Supabase) en la rama `migracion/netlify-supabase`. Donde este documento diga SQLite, `DATABASE_PATH` o `UPLOADS_DIR`, ver [DESPLIEGUE-NETLIFY-SUPABASE.md](DESPLIEGUE-NETLIFY-SUPABASE.md) (esos mecanismos solo valen para el entorno local anterior).

# Cuentas, sesiones y consultas (hito 4)

Las cuentas son **opcionales**: se puede armar el carrito y consultar por WhatsApp como invitado. Con cuenta se guardan favoritos y se ve «Mis consultas».

## Cómo funciona
- **Autenticación**: Better Auth (`src/server/auth.ts`) sobre SQLite/Drizzle. Contraseñas con scrypt (la librería; nunca texto plano), mínimo 10 caracteres. Sesiones en cookie `httpOnly` + `SameSite=Lax` (`Secure` en producción), 14 días. Origen validado en los POST (protección CSRF) y límites de uso persistentes en base de datos (ingreso 8/min, registro 5/min, recuperación 5/min por IP; detrás de un proxy la IP sale de `x-forwarded-for`).
- **Verificación de correo obligatoria**: sin confirmar el correo no se puede ingresar (se ofrece reenviar). Al confirmar con el enlace, se inicia sesión. Registrar un correo ya existente responde igual que uno nuevo (no revela cuentas).
- **Recuperación**: enlace de un solo uso, vale 1 hora; al cambiar la contraseña se cierran las demás sesiones. Pedirla para un correo inexistente responde igual y no envía nada.
- **Datos guardados**: nombre y correo. Sin direcciones completas ni datos de pago. Las rutas privadas se validan en el servidor (`src/server/session.ts`); un usuario nunca ve consultas ni favoritos de otro.
- **Favoritos**: solo productos sellados activos; sin duplicados (clave primaria usuario+producto); el usuario sale de la sesión, nunca del body.
- **Mis consultas**: solo consultas del usuario; estado «Consulta preparada». Nunca se muestran como compras ni pagos. Incluyen las consultas por encargo (líneas sin precio, «Por encargo · sin cotizar»).
- **Cuenta mayorista (tanda 4)**: la cuenta común puede *solicitar* la condición mayorista (`/mayoristas/solicitar`). Se guarda una solicitud por usuario (nombre comercial o actividad, localidad, provincia, nota opcional, estado y fechas); el estado se ve en Mi cuenta. La solicitud no cambia permisos ni precios: un mayorista **nunca** recibe permisos de administrador (el administrador sigue siendo solo el correo de `ADMIN_EMAIL`). Una persona nueva puede crear la cuenta desde la solicitud: `/cuenta/registro?next=/mayoristas/solicitar` conserva el destino hasta confirmar el correo. Ver [POLITICAS.md](POLITICAS.md).

## Correo en desarrollo (transporte local)
El correo **no sale a internet**. Cada mensaje se guarda como archivo JSON en `.local/mail/` (ignorado por Git, nunca servido por la web). Contienen enlaces con tokens: no los versiones, ni los pegues en chats o logs compartidos.

```bash
npm run mail:last        # muestra los últimos 3 correos (asunto y enlace)
```
En producción el transporte local está **deshabilitado**: hasta configurar un proveedor transaccional, el envío falla con un error explícito (no se simula). Antes de habilitar cuentas públicas hay que configurar el proveedor, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` y HTTPS (ver `docs/DESPLIEGUE.md`, hito 5).

## Asociar una consulta de invitado a una cuenta
Regla: **solo con prueba de pertenencia de la sesión, nunca por conocer la referencia**.
- Cada navegador que entra al carrito recibe una cookie `httpOnly` (`consulta_sid`) con un token aleatorio; la base guarda solo su hash. Las consultas de invitado quedan atadas a ese hash.
- Al iniciar sesión, en «Mis consultas» aparece «Tenés N consultas de invitado en este navegador» con el botón **Agregar a mi cuenta** (`POST /api/inquiries/claim`). El endpoint **no recibe referencias**: usa la cookie y la sesión. Asocia solo las consultas aún sin cuenta de ese navegador.
- Al asociarlas, el token de invitado se rota: el navegador deja de poder abrirlas como invitado y quedan visibles solo para la cuenta. Otro usuario, otro navegador o alguien que conozca la referencia no puede reclamarlas ni verlas (404).
- Una consulta preparada con la sesión iniciada pertenece directamente a la cuenta (el vínculo sale de la sesión, nunca del body).
- Al cerrar sesión se conservan los productos del carrito, pero se borran el nombre y los datos de entrega del formulario.

## Pruebas
`npm run test` (Vitest: favoritos, propiedad, asociación, persistencia al reabrir la base, correo local/producción, redirecciones seguras) y `npm run test:e2e` (`tests/e2e/cuentas.spec.ts`: registro, verificación, ingreso, salida, recuperación, tokens inválidos/vencidos/reutilizados, límite de intentos, favoritos, dos usuarios, asociación de invitado, perfil, carrito conservado).
