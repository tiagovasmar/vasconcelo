# Publicación y reversión de pedidos y mayoristas (NO ejecutadas)

Este es un plan para una autorización futura. En esta continuación no hubo push, merge, despliegue, migración real ni cambios de precios, stock, cuentas o pedidos reales. Las verificaciones locales se detallan en [CONTINUIDAD-PEDIDOS.md](CONTINUIDAD-PEDIDOS.md).

## 1. Revisión local antes de cualquier acción externa
- Usar `C:\Users\tiago\Documents\Codex\2026-10-13\rev\work\vasconcelo-publicacion`, rama `feature/cuentas-pedidos-mayorista`. No publicar desde la copia anterior `kit-claude-pokemon` ni mezclar archivos.
- Revisar los commits locales nuevos, pruebas, capturas 360/390/430/escritorio y mediciones del build de producción. Ver `CONTINUIDAD-PEDIDOS.md` y `capturas/pedidos/CONTINUIDAD.md`.
- Mantener los tres favicons del dueño fuera de estos commits. Su publicación, si se desea, se trata por separado y sin sobrescribirlos.
- El dueño dejó pendientes mínimo mayorista, combinación, tramos/precios, demora y origen del cómputo, plazo de reintegro y cancelación. Son editables desde `/admin/mayoristas`. El servidor impide abrir mientras falten condiciones o tramos publicados. No trasladar valores ficticios de la vista previa.
- Cobro en entregas parciales: pendiente. Se conserva el control actual de pago completo antes de la primera entrega, sin presentarlo como decisión comercial aprobada.

## 2. Vista previa alojada aislada (requiere autorización futura)
1. Identificar los destinos de Netlify y Supabase y el último despliegue exitoso real. Los hashes de publicaciones antiguas de otros documentos son antecedentes, no una comprobación del estado externo actual.
2. Preparar una base de staging NUEVA, separada de producción, y un bucket PRIVADO distinto para comprobantes. Una vista previa no debe compartir credenciales ni escribir a la base, el correo o el Storage de producción.
3. Revisar `drizzle/0004_pedidos_encargos_mayorista.sql`: aditiva (18 tablas y columna `inquiries.order_kind`, índices y claves). Ensayar sobre staging con el esquema anterior y datos ficticios; si se autoriza utilizar una copia real, restaurarla únicamente en un destino aislado y proteger/anonimizar sus datos.
4. Publicar la rama únicamente en una vista previa autorizada. Usar destinatarios de prueba o transporte de correo aislado; no enviar a clientes reales.
5. Verificar allí invitados/cuentas/administrador, aprobación y catálogo cerrado, comprobantes privados, aislamiento entre cuentas, costos privados, reintentos y duplicados, envíos agrupados y entregas parciales. Las pruebas de operaciones con escritura deben usar solo pedidos y datos de prueba de staging.

## 3. Configuración externa pendiente (requiere autorización futura)
- **PostgreSQL/Supabase:** conservar la conexión de sesión 5432 y `prepare: false`; verificar variables de la instancia elegida, sin imprimir cadenas completas ni secretos. No cambiar a 6543 por asumir que es equivalente.
- **Comprobantes:** bucket privado `payment-receipts` o nombre elegido mediante `SUPABASE_RECEIPTS_BUCKET`, distinto del bucket público de productos. Sin políticas de lectura pública; accesos solo mediante el servidor. Comprobar carga, descarga autorizada y denegación desde otra cuenta con el servicio real.
- **Correo:** proveedor, API key y remitente/dominio verificados (`MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`; `CORREO.md`). Probar envío y reintento reales solo con autorización y destinatarios de prueba. Los cambios del pedido deben conservarse si falla el proveedor.
- **Google (opcional):** configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, pantalla de consentimiento y callback exacto de la vista previa o producción (`GOOGLE.md`). Probar vinculación con una cuenta real de prueba; no asumir que la simulación local verifica OAuth real. Revisar marca/logotipo y textos de privacidad.
- **Negocio/legal:** definir las condiciones pendientes antes de abrir el catálogo; revisar condiciones y privacidad. Nunca convertir los valores ficticios de la siembra en condiciones de producción.

## 4. Publicación de producción (requiere autorización futura)
1. Registrar el despliegue actual al que se podría volver. Preparar una ventana y responsables de revisión sin inventar una fecha de publicación.
2. Respaldar la base existente con destino verificado y probar la recuperación en un destino aislado. `db:backup` exporta tablas existentes; las tablas opcionales de migraciones no aplicadas se omiten. Los archivos de comprobantes no están incluidos: si ya existen, requieren copia privada e inventario aparte y un procedimiento de recuperación comprobado.
3. Confirmar que la migración ensayada es exactamente la que se aplicará. Aplicar 0004 a producción únicamente con autorización explícita y comprobar el historial de migraciones y el esquema. Nunca usar la base habitual 54400 como descartable ni limpiar 54401 por suponer que es de prueba.
4. Push/merge y despliegue a producción únicamente cuando el dueño los autorice. La prueba de humo de producción debe ser de lectura; las pruebas con pagos, stock y escrituras ya se hicieron en staging.
5. Mantener el catálogo mayorista cerrado. Una vez definidas las condiciones, el dueño carga precios reales por tramo, revisa/publica y abre manualmente desde el admin. Validar denegación para invitados y cuentas no aprobadas.

## 5. Reversión
- Volver la aplicación al despliegue exitoso identificado antes de publicar. No asumir un hash histórico ni ejecutar una reversión sin autorización.
- Conservar la migración aditiva, sus tablas, datos e historial; la aplicación anterior ignora las tablas y columnas nuevas. No borrar tablas, columnas ni registros del historial para volver atrás.
- Conservar comprobantes privados y pagos/reintegros registrados. Un registro de pago/reintegro es una constancia: no se borra ni implica una transferencia automática de dinero.
- Si hay un incidente de datos, preparar un plan separado con respaldo verificado, alcance de recuperación y autorización explícita. No restaurar automáticamente sobre una base existente.
- Desactivar Google o el proveedor de correo, si fuera necesario, mediante un cambio de variables y un despliegue autorizado. Los avisos pendientes deben conservarse para revisión y reintento.
