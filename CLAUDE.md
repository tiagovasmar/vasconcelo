# Instrucciones permanentes para Claude Code

## Encargo y prioridad

Construí una tienda Pokémon de un solo vendedor según `PROYECTO.md` y `DISENO.md`. Leé ambos y mirá las cuatro imágenes de `referencias/` antes de implementar. Los mensajes posteriores del dueño prevalecen sobre estos documentos. Registrá los cambios de alcance acordados para no perderlos entre sesiones.

La dirección visual ya fue aprobada. No vuelvas a preguntar si se quiere una tienda o marketplace, país, moneda, estilo, panel administrativo o pagos en línea. No vuelvas a proponer las versiones básicas descartadas.

Respondé en español rioplatense claro. El dueño no necesita supervisar tus decisiones técnicas ni cada línea de código.

## Forma de trabajar

1. Inspeccioná la carpeta y preservá cualquier trabajo existente. No sobrescribas un proyecto ajeno con un scaffold.
2. Ejecutá el hito actual de principio a fin: implementar, probar, corregir, revisar visualmente y preparar la entrega.
3. No preguntes `¿sigo?`, `¿instalo?`, `¿hago el commit?` o `¿corrijo este error?` dentro del alcance autorizado.
4. Resolvé decisiones técnicas normales por tu cuenta; documentá las importantes en `docs/DECISIONES.md`.
5. Enviá actualizaciones breves cuando haya un avance significativo o un bloqueo real, sin narrar cada comando.
6. Pedí revisión humana únicamente al completar un hito. Mostrá una URL local y capturas de escritorio/móvil si las herramientas lo permiten, resumen de lo que funciona, pruebas y limitaciones reales.
7. Esperá la aprobación de ese hito antes de comenzar el siguiente. No confundas este punto de revisión con permisos por cambios menores.
8. Si recibís correcciones, aplicalas juntas, verificá y volvé a mostrar el hito. No rehagas partes ya aprobadas sin necesidad.
9. Si faltan nombre, WhatsApp, fotos o catálogo real, usá configuración/demo explícita y seguí. No inventes esos datos.
10. Preguntá solo si la respuesta cambia el negocio y no está decidida, si falta una credencial indispensable o si una acción exige una autorización que no existe. Agrupá las preguntas.

## Autorización para desarrollo y Git

Están autorizados los cambios locales del proyecto, instalación de sus dependencias, migraciones de la base local de desarrollo, ejecución de pruebas, correcciones y commits de tu trabajo. Inspeccioná los scripts antes de ejecutarlos. No cambies configuración global de la computadora.

Si no hay repositorio propio en esta carpeta, inicializalo localmente; primero verificá que no estés usando accidentalmente un repositorio de una carpeta superior. Si Git no tiene identidad, no inventes un nombre/correo: seguí desarrollando y reportá ese pendiente una vez.

Usá una rama `feature/tienda-pokemon` para el desarrollo inicial, o conservá la rama de trabajo que el dueño haya elegido. Prepará commits lógicos, normalmente uno por hito validado técnicamente. Agregá solo archivos de este trabajo; inspeccioná el diff antes de commitear.

Si el dueño ya conectó `origin` para este proyecto, su destino es inequívoco y hay autenticación, hacé un push normal con `git push origin HEAD` al terminar un hito probado, sin reconfirmación. Publicar código en esa rama no equivale a aprobar el diseño ni a publicar el sitio. Si ese push dispara un despliegue público conocido, primero acordá una rama de preview o esperá autorización de publicación.

Sin remoto, conservá commits locales y no bloquees el desarrollo. No crees repositorios públicos ni configures un remoto supuesto. Un rechazo de autenticación o de protección de rama no autoriza a cambiar políticas ni a forzar el push.

No uses force-push, borrado de ramas ajenas, reset destructivo, reescritura de historia compartida ni cambios de visibilidad. No subas `.env`, bases de datos, usuarios, tokens o credenciales. No hagas merge a una rama protegida ni despliegues producción sin instrucción del dueño.

La configuración `.claude/settings.json` reduce confirmaciones rutinarias; no reemplaza los controles del entorno. No intentes evadir una denegación usando otro shell o cambiando la sintaxis. Ante un bloqueo, explicá qué falta y continuá las tareas independientes.

## Calidad obligatoria

- Una tienda utilizable, no una maqueta de enlaces vacíos ni una captura puesta como fondo.
- Conservá la fuerza visual de las referencias: composición japonesa, ilustración grande, tipografía con carácter y producto protagonista.
- La imagen de una carta en la ficha informa sobre la expansión; no crea una venta de cartas sueltas.
- Precios y cantidades se validan en servidor al preparar una consulta. El cliente no determina el total confiable.
- Abrir WhatsApp no acredita envío de mensaje, pago, reserva ni venta.
- Ninguna tasa de aparición se inventa. Toda garantía corresponde al SKU, idioma y región documentados.
- Cuentas y consultas se guardan en una base real. No simules autenticación con localStorage.
- Todas las acciones visibles deben funcionar o mostrar honestamente la limitación de demo.
- No agregues pagos, multivendedor, alta de productos desde la web, suscripciones, chat interno ni otras funciones fuera del alcance. **Cambio de alcance del dueño (13/10/2026):** existe un panel privado `/admin` solo para precio, stock, máximo por pedido y visibilidad (ver `docs/ADMIN.md`); el administrador es únicamente el correo de `ADMIN_EMAIL`, sin configuración el panel está cerrado.

## Continuidad

Creá y mantené `docs/ESTADO.md` con hito actual, aprobado/pendiente, decisiones, comandos útiles, pruebas ejecutadas, fallas pendientes y próximos pasos. Antes de terminar una sesión, dejalo actualizado. Al retomar, continuá desde ese estado en lugar de reiniciar el proyecto.

No marques como probado algo que no ejecutaste. Si faltan herramientas para una verificación visual o una integración, documentá exactamente ese límite. No ocultes errores ni reemplaces una integración real por una simulación sin identificarla.

## Entrega de cada hito

Respuesta breve: qué quedó listo, dónde verlo, qué comprobaste y qué necesita revisión del dueño. Las credenciales de prueba son solo locales y se entregan por un mecanismo local documentado, nunca como secretos reales en el repositorio.

La implementación empieza ahora con el hito 1. La revisión técnica es tu responsabilidad; la aprobación del dueño es sobre una sección completa y su experiencia.
# Cambios recientes que deben conservarse

Antes de continuar, leer la última revisión en `docs/CAMBIOS-HOME-Y-PAGOS.md` y el comienzo de `DISENO.md`. El dueño restauró la paleta original esmeralda/lima/crema/tinta, conservando el inicio tranquilo, productos protagonistas y condiciones de pago discretas. No restaurar el exceso de protagonismo de pagos ni banners antiguos. Estas correcciones prevalecen sobre las referencias anteriores. Mantener el cobro coordinado por WhatsApp y la búsqueda de cartas actual.

# Cambios de alcance del dueño (13/10/2026, segundo lote)

- La marca pública es **Vasconcelo** (`src/content/store.ts`). No inventar dominio, redes, teléfono ni identidad legal.
- El catálogo incluye **ediciones chinas (chino simplificado)** importadas desde las 16 carpetas locales del dueño: informe por ID en `docs/IMPORTACION-CHINA.md`, datos en `src/content/colecciones/origen/china/productos.json`. Siguen sin precio ni stock («Precio a confirmar», compra deshabilitada). Las fotos son de proveedores (`source: "supplier"`): no afirmar permiso de uso ni que sean del fabricante o del stock. El artículo 1027185914261 sigue pendiente (sin carpeta).
- El carrusel del inicio avanza solo cada 6 s (con pausa por mouse, foco, pestaña oculta y botón; arranca detenido con movimiento reducido).

# Cambios de alcance del dueño (13/10/2026, tercer lote)

- Banner móvil más corto; ficha de producto simplificada (nombre e idioma antes de la galería en celular; fuentes, probabilidades y detalle de garantías en desplegables cerrados).
- Cada caja/caja especial/kit muestra «Qué garantiza…» con tres cosas separadas: contenido físico confirmado, rarezas garantizadas **documentadas** (hoy ninguna: «sin confirmación documental») y, si existiera, composición observada (estimación, nunca garantía). Ver `docs/GARANTIAS.md`. No trasladar garantías entre cajas, sobres, ediciones o regiones.
- Las cajas de White Flare y Black Bolt van sin fondo blanco (derivados `*-sin-fondo.webp`, `scripts/colecciones/separar-caja.mjs`); no volver a una placa blanca.
- No hay fotos del stock real: no simular ninguna. Lo que falta aportar el dueño está en `docs/PENDIENTES-DEL-DUENO.md`. Los avisos «borrador» y «en preparación» se retiran solo cuando la sección esté realmente terminada.

# Cambios de alcance del dueño (13/10/2026, cuarto lote)

- Existen **mayoristas**: `/mayoristas` (30% sobre el precio minorista de catálogo, sujeto a condiciones por definir) y solicitud de cuenta mayorista (`/mayoristas/solicitar`, tabla `wholesale_requests`, estado en Mi cuenta, vista de solo lectura en `/admin/mayoristas`). **Siguen sin definir y no se deben inventar:** compra mínima, si el 30% se acumula con el 10% por transferencia y si la aprobación es manual o automática. Con `mayorista.activationEnabled = false` toda solicitud queda pendiente y nadie tiene precio mayorista. Ver `docs/POLITICAS.md`.
- **Consultar por encargo** (producto sin precio/stock o agotado) con **seña del 20%** sobre el importe cotizado y confirmado (saldo 80%). No es una compra ni una reserva; no se calcula seña sobre un precio inexistente ni sobre el carrito completo. Plazos, devolución de la seña, vigencia de la cotización y si aplican otros descuentos siguen sin definir.
- **Promociones:** «3 cuotas sin interés o 10% OFF por transferencia» valen para compras que incluyan **al menos una caja** (solo `kind: "box"`; no kits, bundles ni cajas especiales). Sobres solos no califican. El 10% no se extendió al efectivo. Regla única en `src/features/politicas/promociones.ts`.
- Los productos chinos tienen **título principal en español** (traducción descriptiva de la tienda, no oficial) y el nombre chino como dato secundario (`originalTitle`/`originalName`). No se cambiaron slugs.
- «Las cartas que querés encontrar» va justo después de los formatos del inicio.

# Cambios de alcance del dueño (13/10/2026, quinto lote)

- **Reemplaza** la instrucción del cuarto lote sobre títulos chinos en español: el nombre principal de las colecciones y productos chinos es **en inglés** (contrastado entre fuentes y rotulado como oficial, comunitario o descriptivo; ver `docs/NOMBRES-INGLES.md`). El sitio sigue en español: formato, contenido, botones y descripciones. El chino original, los nombres españoles de la tanda 4, las romanizaciones y las variantes en inglés son alias buscables. No se renombra una colección china con el nombre de una expansión inglesa distinta; «sparking» sigue sin asignar (pendiente del dueño).
- **Retirados:** los 8 sobres individuales de 20 cartas (`retired` en el catálogo, `active: false`; ficha directa «producto retirado», carrito viejo avisa, sin compra ni encargo). No se retiran cajas de 20 sobres, kits ni cajas especiales con sobres de 20 cartas. Una colección sin productos publicados deja de listarse.
- **Inicio:** se quitó la sección exclusiva «Ediciones chinas»; las colecciones chinas seleccionadas van en «Elegí tu colección» junto a las japonesas, con su idioma a la vista. Se conservan las cartas destacadas arriba y la franja de promociones.


# Cambios de alcance del dueño (14/10/2026, sexto lote)

- **Precios base en USD** (se cargan en `/admin`); la tienda muestra **pesos** como precio principal y USD en tamaño menor. Conversión con el **dólar blue, valor de venta** (DolarAPI, no oficial), precio unitario redondeado a **múltiplos de $100** (más cercano, mitades hacia arriba: interpretación de trabajo). Un solo servicio de conversión (`src/features/fx/convert.ts`); sin cotización utilizable el precio en pesos queda pendiente, nunca $0. Ver `docs/COTIZACION.md`. No se convirtieron precios ARS anteriores.
- El panel `/admin` ahora también edita **título, descripción, publicación, estado de stock (cantidad, desconocida, por encargo), fotos y cotización**; sigue sin alta de productos nuevos ni pagos. Seeds e importadores nunca pisan lo cargado en el panel. Ver `docs/ADMIN.md`.
- Cada consulta guarda una **instantánea de cotización** y precio USD; esta tanda **no** implementa cotización de encargos (solo precios de catálogo).
- **Portadas del aniversario** (solo fichas Vol.2 y Vol.3) y **ficha nueva de Bulbasaur como borrador sin confirmar**: el envase indica 9 tipos y 1 carta al azar; no se promete Bulbasaur hasta confirmarlo con el proveedor. No cambiar el banner ni las cartas destacadas del inicio.
