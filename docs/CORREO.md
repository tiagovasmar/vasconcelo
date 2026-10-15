# Correo transaccional (confirmar cuentas y recuperar acceso)

## Situación
La tienda necesita enviar dos correos: **confirmar el correo** al registrarse y **recuperar el acceso**. No hay dominio propio, y `netlify.app` **no se puede verificar como remitente** (no controlás su DNS). Por eso, hasta que haya un remitente y un proveedor válidos:

- el **registro público y la recuperación quedan deshabilitados** (el servidor responde 503 «MAIL_UNAVAILABLE»; no se simula ningún envío),
- el **administrador sigue ingresando** con su contraseña (`npm run admin:crear` o la cuenta migrada).

Esto se activa solo: sin `MAIL_PROVIDER` + `MAIL_API_KEY` + `MAIL_FROM` válidos, `mailTransportAvailable()` es falso en producción.

## Cuando quieras activarlo
El código ya envía por la API HTTP de **Resend** o **Brevo** (`MAIL_PROVIDER=resend|brevo`). Lo que falta es tuyo:

1. **Con dominio propio** (lo ideal): verificar el dominio en el proveedor (registros SPF/DKIM) y usar `MAIL_FROM="Vasconcelo <tienda@tu-dominio.com>"`.
2. **Sin dominio**: Brevo permite verificar **una dirección de correo individual** como remitente. Funciona, pero un remitente tipo Gmail enviado desde otro servidor suele caer en spam por falta de alineación DMARC: sirve para pruebas, no para un lanzamiento. Resend sin dominio solo envía a la propia cuenta del dueño (modo de prueba).
3. Cargar las tres variables en Netlify, redesplegar y **probar un registro real** con una casilla tuya.

Los límites y condiciones de cada proveedor cambian: verificalos en sus páginas antes de elegir. Esta preparación **no contrató ningún servicio** ni probó un envío real (queda pendiente).
