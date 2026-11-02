# Grupo de WhatsApp en el inicio — 02/11/2026

Implementado localmente en `vasconcelo-publicacion`, rama `feature/cuentas-pedidos-mayorista`, sobre el cierre `ab20b00`. Sin push ni publicación.

El bloque compacto aparece inmediatamente debajo del carrusel, en el flujo normal de la página: esmeralda, texto claro y botón oro. Usa los textos solicitados: «Sumate al grupo de Vasconcelo», «Enterate de ofertas limitadas, sorteos, cupones y novedades.» y «Unirme al grupo de WhatsApp». No hay ventanas emergentes automáticas ni elementos flotantes que tapen productos o controles.

El enlace exacto `https://chat.whatsapp.com/J36bbxgvyLvAP1G54N5R5x` está en `store.whatsappGroupUrl`, separado de `whatsappNumber` para atención/pedidos. Es un enlace HTML nativo, sin JavaScript añadido ni precarga del destino. Abre solo al pulsarlo, con `target="_blank"`, `rel="noopener noreferrer"` y `referrerPolicy="no-referrer"`. Se informa la pestaña nueva a tecnologías de asistencia. Funciona sin JavaScript.

## Verificaciones de este agregado
- Build de producción local y vista previa `http://localhost:3010` actualizados con datos ficticios en PostgreSQL nuevo descartable. Sin conexiones a producción, correo real ni Storage real.
- Playwright selectivo: **14/14, cero fallas y cero omisiones**. Bloque a 360/390/430/1440 px en los proyectos escritorio y móvil, sin desborde; botón de al menos 44 px; bloque compacto y sin superposición con productos; enlace exacto, atributos de protección, ninguna apertura/solicitud automática; pestaña nueva con `window.opener === null`; funcionamiento sin JavaScript; axe WCAG A/AA del bloque y del inicio; enlaces internos del inicio/cabecera/pie.
- El destino de WhatsApp se interceptó con HTML de prueba. No se contactó el servicio ni se ingresó al grupo durante las pruebas.
- `npm run typecheck`: sin errores. `npm run lint`: cero errores, las mismas cuatro advertencias preexistentes por variables/tipos sin uso.
- La suite completa de pedidos y mayoristas del cierre anterior no se repitió para este agregado de contenido. Sus resultados históricos permanecen separados en `CONTINUIDAD-PEDIDOS.md`; no se presentan como una corrida nueva.
- Ocho capturas desde la vista previa final: bloque y contexto del inicio a los cuatro anchos. Revisión visual móvil/escritorio realizada. El [informe de captura](capturas/grupo-home/INFORME.json) registra ancho de documento igual al viewport y cero solicitudes al grupo.

## Repetir
Con la vista previa local activa: `node scripts/capturas-grupo-home.mjs`. El script no carga variables de archivos `.env`, rechaza destinos no locales y no pulsa el enlace.

Pruebas: `E2E_SERVERS=demo` y `npx playwright test grupo-home.spec.ts a11y.spec.ts recorrido.spec.ts --project=escritorio --project=movil --grep "grupo del inicio|invitación|axe: inicio|todos los enlaces internos"`. Configurar las variables mediante la sintaxis del shell utilizado. La configuración utiliza bases descartables, correo local y servicios externos desactivados. `E2E_SKIP_BUILD=1` solo reutiliza un build previamente generado de este mismo código.

[Capturas para revisar](capturas/grupo-home/README.md). Los favicons del dueño se preservan y quedan fuera del commit.
