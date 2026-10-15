# Pendientes concretos para publicar

La **aplicación local está terminada**. Para vender públicamente falta lo de esta lista. `npm run release:check` la verifica automáticamente (hoy sale con 13 bloqueantes, que es lo esperado en la demo).

## A. Lo que debe aportar el dueño
1. **Logo definitivo y `isDemo: false`**. El nombre comercial **Vasconcelo** quedó confirmado el 13/10/2026 (`src/content/store.ts`, `name`); sigue pendiente el logo (hoy es solo texto) y los datos legales (razón social, CUIT, domicilio), sin inventar dominio, redes ni teléfono.
2. **Número de WhatsApp** de la tienda → `WHATSAPP_NUMBER` (o `store.whatsappNumber`). Sin él no se abre ningún chat.
3. **Catálogo real**: productos (SKU, título, idioma, región, formato), precios en ARS, stock inicial y límite por pedido → `src/content/products/index.ts`. Retirar los 8 productos de demostración y las 2 expansiones ficticias («Set de ejemplo» y «Set parcial de ejemplo»).
4. **Fotos reales** de cada producto (3 por SKU: frente, ángulo, detalle; 4:5, ≥ 1200×1500) y las **6 imágenes del inicio**, con permiso de uso registrado (`origin` y `license`). Lista exacta con nombres y tamaños: [ASSETS-PENDIENTES.md](ASSETS-PENDIENTES.md).
5. **Cartas de cada expansión** (si se quieren mostrar): lista verificada con imágenes y fuente. Si no hay lista verificada se deja como «no disponible» (es honesto y la ficha igual se ve terminada).
6. **Probabilidades y garantías**: cargar **solo** con fuente (oficial) o con muestra y método (observada). Si no hay evidencia, se deja «Dato no disponible». Verificar o eliminar la garantía «sin verificar» de ejemplo.
7. **Datos del comercio** para los textos legales → `src/content/legal.ts`: razón social/titular, CUIT/CUIL, domicilio legal, correo de contacto, ley aplicable y jurisdicción, política de cambios/devoluciones/garantías, plazos de conservación de datos. **Revisar Privacidad y Condiciones con asesoramiento legal** y recién entonces `isDraft: false`.
8. **Medios de pago** que realmente acepta (hoy solo «a coordinar por WhatsApp») → `src/content/checkout-options.ts`.
9. **Condiciones de entrega** reales para Andreani, moto (zonas) y retiro (direcciones y horarios de Ramos Mejía y Haedo) para responder por WhatsApp; el sitio no publica direcciones.
10. **Quién actualiza el stock** y cuándo, después de cada venta (es manual).

## B. Lo que hay que contratar/configurar (no se hizo)
11. **Hosting** con Node ≥ 22, disco persistente y HTTPS, y **dominio**. Ver [DESPLIEGUE.md](DESPLIEGUE.md).
12. **Correo transaccional** (proveedor + dominio verificado con SPF/DKIM) e **implementarlo en `src/server/mail.ts`**. Sin esto, las cuentas no pueden confirmar su correo ni recuperar el acceso en producción (el transporte local está deshabilitado a propósito). Alternativa: no habilitar el registro hasta tenerlo.
13. **Variables de entorno** de producción: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (https), `DATABASE_PATH`, `WHATSAPP_NUMBER`.
14. **Backups**: programar `npm run db:backup`, guardar copias fuera del servidor y **probar una restauración** antes de publicar.

## C. Verificaciones antes de abrir al público
15. `npm run release:check` **sin bloqueantes**, con las variables de producción cargadas.
16. `npm run verify` y `npm run test:e2e` en verde sobre el código final.
17. **Prueba manual con lector de pantalla** (las pruebas automáticas de accesibilidad no la reemplazan) y revisión en un celular real.
18. **Medir rendimiento de nuevo** con las imágenes finales (`node scripts/rendimiento.mjs`): las mediciones actuales se hicieron con arte vectorial de reserva.
19. Revisar encabezados de seguridad en el proxy (HSTS, CSP), monitoreo básico y el plan de respuesta ante incidentes.
20. **Aprobación explícita del dueño** para publicar.

## D. Limitaciones conocidas (decisiones de alcance, no errores)
- Un solo servidor (SQLite; límites de uso en la base). Escalar requiere migrar a una base compartida.
- No hay panel de administración ni cobros en línea ni integración automática con transportistas (fuera de alcance).
- No se puede cambiar el correo de una cuenta ni darla de baja desde la web.
- Las cartas de una ficha se paginan en el navegador: para sets de cientos de cartas conviene paginar desde el servidor.
- El límite de 1.800 caracteres del enlace de WhatsApp es conservador y no está medido en todos los clientes.

## D. Lote de colecciones (agregado)
21. **Precios y stock de los 16 SKU** en `datos/precios-y-stock.csv` → `npm run precios:importar -- --write` (hoy todos «a confirmar»).
22. **Permiso de uso de las 1198 imágenes de referencia** (24 de producto + 1174 de cartas) o fotos propias.
23. **Galerías parciales**: Storm Emeralda (faltan 071, 073, 075) y 30th CELEBRATION (faltan 104–135 y 151): completar cuando la fuente oficial las incluya.
24. **Tasas de aparición**: ninguna cargada; solo con fuente oficial u observación documentada.
