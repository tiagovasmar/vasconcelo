# Ingreso y registro con Google

## Dominio propio: cambio local del 6/11/2026, pendiente de publicar y configurar en Google

La autenticación ahora admite exclusivamente `vasconcelo.shop`, `www.vasconcelo.shop` y `vasconcelo.netlify.app` cuando la URL configurada pertenece a uno de esos dominios HTTPS. Resuelve el origen por petición con la lista cerrada de Better Auth; localhost y vistas aisladas no heredan esos permisos. Conserva cookies separadas por dominio, sin compartirlas entre sitios. No desactiva controles de origen ni validación de correo del administrador.

En el cliente OAuth existente hay que mantener el callback de Netlify y agregar `https://vasconcelo.shop/api/auth/callback/google` y `https://www.vasconcelo.shop/api/auth/callback/google`, junto con los correspondientes orígenes JavaScript. No hace falta generar ni reemplazar claves. Las modificaciones externas no se hicieron: Chrome no respondió al intentar abrir el panel. El cambio de código requiere un despliegue; no está publicado. Tampoco se han configurado orígenes nuevos automáticamente en Google. Las pruebas simulan Google y verifican retorno por cada dominio, sin afirmar que el OAuth real funciona.

El mensaje del formulario también se corrigió: un 403 genérico o dominio no autorizado ya no dice que falta confirmar el correo.

«Continuar con Google» está implementado sobre la autenticación existente (Better Auth), **apagado por defecto**: aparece solo si el servidor tiene `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. **No hay credenciales en el repositorio ni se piden por chat.**

## Qué falta configurar (lo hace el dueño, cuando la implementación esté publicada en una vista previa)

### En Google Cloud Console
1. Crear (o elegir) un proyecto en <https://console.cloud.google.com/>.
2. *APIs y servicios → Pantalla de consentimiento de OAuth*: tipo **Externo**, nombre de la app «Vasconcelo», correo de soporte, dominios autorizados (cuando exista dominio propio) y los alcances **`openid`, `email`, `profile`** (son los únicos que se piden). Publicar la app (pasar de «Pruebas» a «En producción») para que cualquier persona pueda ingresar.
3. *Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web*:
   - **Orígenes autorizados de JavaScript:** la URL pública del sitio (p. ej. `https://TU-SITIO.netlify.app`) y `http://localhost:3000` para desarrollo.
   - **URI de redireccionamiento autorizados:** `https://TU-SITIO.netlify.app/api/auth/callback/google` y `http://localhost:3000/api/auth/callback/google`.
4. Copiar el *ID de cliente* y el *secreto* **directamente a las variables de entorno** (no al chat ni a archivos del repositorio).

### En el entorno (Netlify → variables del sitio, y `.env.local` para desarrollo)
| Variable | Valor |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID de cliente de Google. |
| `GOOGLE_CLIENT_SECRET` | Secreto del cliente (solo servidor). |
| `BETTER_AUTH_URL` | URL pública exacta del sitio (ya existe; debe coincidir con el origen autorizado). |

Después de cargar las variables hay que **redesplegar** (se leen al iniciar).

## Cómo se vinculan las cuentas (seguridad)

- Si el correo de Google **no existe** en la tienda, se crea una cuenta nueva con el correo verificado por Google (sin contraseña inventada).
- Si el correo **ya existe**, se vincula la cuenta de Google **solo si** (a) el correo es el mismo, (b) Google lo informa como verificado y (c) la cuenta de la tienda **también tiene el correo confirmado**. No se vincula con otro correo.
- Una cuenta registrada pero **sin confirmar** el correo **no** se une a Google: se evita que alguien se apropie de una cuenta registrando antes el correo ajeno. La persona ve un mensaje claro y puede confirmar el correo o recuperar el acceso.
- Se conservan los favoritos, las consultas y la contraseña de las cuentas existentes; no se duplican usuarios.
- Google **no** se declara «proveedor de confianza» a propósito: si Google no marcara el correo como verificado, no se vincula.
- **El administrador** sigue siendo únicamente el correo de `ADMIN_EMAIL` con correo verificado; el panel valida en el servidor. Un nombre, un correo o un encabezado que mande el navegador no otorgan permisos. Entrar al panel con Google funciona porque Google entrega el correo ya verificado. La cuenta **mayorista** también se valida en el servidor con la solicitud aprobada por el dueño.

## Qué se probó y qué no

- Se probó con la lógica **real** de Better Auth sobre PostgreSQL real, **simulando únicamente la respuesta del servidor de tokens de Google** (`tests/google.test.ts`): alta de cuenta nueva, vinculación a una cuenta confirmada sin duplicar ni perder datos, rechazo para correo sin confirmar, para correo no verificado por Google y para otro correo, y que el administrador solo es `ADMIN_EMAIL`.
- **No se probó el OAuth real contra Google**: no hay credenciales ni se pidieron. Falta la verificación manual extremo a extremo (ingresar con una cuenta Google real en la vista previa) después de cargar las credenciales.
- Pendiente de revisión legal/marca: la guía de marca de Google pide el logotipo oficial «G» en el botón; hoy el botón usa un texto «G» neutro. Y actualizar la política de privacidad (menciona el proveedor de identidad, los comprobantes y los avisos por correo).
