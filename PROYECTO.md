# Especificación de implementación — tienda Pokémon

## 1. Objetivo y alcance cerrado

Crear una tienda propia, atractiva y funcional para vender sobres y packs Pokémon sellados en Argentina. Un solo vendedor. El visitante explora el catálogo, conoce el contenido de cada producto, arma un carrito, elige entrega y preferencia de pago, y abre WhatsApp con el pedido preparado. El vendedor confirma disponibilidad, importe final, pago y entrega fuera de la web.

El nombre definitivo no existe aún. Usar `TU TIENDA`, configurable en un único lugar. Español rioplatense, moneda ARS, formato `es-AR`, zona horaria `America/Argentina/Buenos_Aires`. Sin conversión a dólares.

Categorías iniciales: sobres, packs y cajas selladas. Una caja/bundle es un formato de producto sellado. Dejar el modelo extensible para accesorios/cartas en el futuro, pero no crear esas categorías visibles ni sus flujos ahora.

Incluir cuentas de clientes opcionales. No exigir registro para consultar. Los productos, imágenes, precios, disponibilidad y contenido editorial se administran mediante archivos versionados, no mediante un panel de alta de productos.

No implementar pasarelas, formularios de tarjeta, cobros en línea, WhatsApp Business API, mensajes enviados sin intervención del cliente, multivendedor, comisiones, reseñas falsas, sorteos, simulador de sobres, newsletter ni integración automática con transportistas. No comprar dominio, hosting ni servicios.

## 2. Base técnica definida

Para un proyecto nuevo, usar Next.js App Router + React + TypeScript, Tailwind CSS con componentes propios, Zod para validación, Drizzle ORM y SQLite local para datos de clientes/consultas, Better Auth para cuentas y sesiones. Pruebas de reglas con Vitest y recorridos con Playwright. Usar npm y un único lockfile.

Verificar versiones estables compatibles en documentación oficial al iniciar; fijarlas en el lockfile. No adivinar APIs de una versión anterior ni escoger versiones experimentales. Usar una versión LTS de Node compatible. Si existe una incompatibilidad real, resolver la alternativa mínima y documentarla, sin volver a abrir todo el stack con el dueño.

No hace falta Docker para empezar. La aplicación debe funcionar localmente con instalación, preparación de base y arranque documentados. Implementar Node como runtime de servidor para SQLite; no desplegar este adaptador en un runtime Edge.

Arquitectura simple: una aplicación, módulos de catálogo, carrito, consultas, cuentas y contenido. No microservicios. Separar acceso a datos de componentes para permitir migración futura.

Para publicar más adelante, soportar un servidor Node con disco persistente y backups. No asumir que un hosting estático o un sistema de archivos efímero sirve para cuentas y SQLite. Si el dueño luego prefiere alojamiento serverless, planificar una migración probada a base persistente compatible. No cotizar hosting ni contratarlo en esta etapa.

## 3. Estructura esperada

```text
src/
  app/                    # rutas, layouts y endpoints
  components/             # componentes visuales accesibles
  features/
    catalog/
    cart/
    inquiries/
    account/
  content/
    store.ts              # marca, WhatsApp, entregas, pagos habilitados
    products/             # productos tipados editables por código
    expansions/           # expansiones, cartas, probabilidades y fuentes
  lib/                    # formato ARS, validadores, WhatsApp
  server/                 # autenticación, servicios y validación confiable
  db/                     # esquema y migraciones
public/images/            # recursos optimizados, organizados por SKU/set
scripts/                  # validación de catálogo y tareas locales
tests/                    # pruebas de reglas y recorridos
docs/                     # operación, decisiones, estado y despliegue futuro
referencias/              # bocetos aprobados, no servidos como sitio
```

Catálogo como fuente de verdad en código. No duplicarlo en una base que luego pueda divergir. Leer precios/disponibilidad de esos archivos en servidor. Persistir en SQLite cuentas, sesiones, favoritos y snapshots de consultas. El carrito de invitado puede usar localStorage para IDs/cantidades; eso no lo convierte en una fuente confiable de precios.

## 4. Páginas y comportamiento

### Inicio `/`

Seguir `DISENO.md`: hero elaborado, productos/categorías reales del catálogo de demo, expansión destacada, cómo comprar, entregas y footer. Todos los enlaces tienen destino. Sin reseñas, ventas, descuentos, escasez o garantías inventadas.

### Catálogo `/sellados`

Búsqueda por nombre, expansión y código/SKU. Filtros por formato, idioma, expansión, disponibilidad y precio. Orden por novedades y precio ascendente/descendente. Mantener búsqueda, filtros y orden en URL para compartir y volver atrás. Estado sin resultados con opción de limpiar filtros. Paginación o carga incremental, sin bajar todo el catálogo de cartas al inicio.

Productos con imagen, título, idioma, precio ARS, disponibilidad, ficha y agregar al carrito. SKU agotado: desactivar agregar, permitir consultar. No activar una categoría vacía por algo planificado para el futuro.

### Expansiones `/expansiones` y `/expansiones/[slug]`

Listado derivado de los datos; detalle editorial reutilizando galería y filtros de cartas de la ficha. Mostrar los productos sellados relacionados. El objetivo es explorar el contenido de una expansión, no comprar singles. No duplicar los datos de cartas en cada SKU.

### Producto `/productos/[slug]`

Galería con miniaturas, zoom accesible, imagen principal clara, título, idioma, expansión, formato, precio, cantidad, disponibilidad, CTA de carrito, consulta individual por WhatsApp y métodos de entrega. Los datos cambian por SKU; no reutilizar las cantidades de una caja para un sobre o pack armado.

Descripción elaborada con anclas y estos bloques:

1. Qué producto se está comprando y qué contiene físicamente.
2. Cartas de la expansión, con imagen ampliable, nombre, número, rareza y variantes cuando se verifiquen.
3. Buscador y filtros de cartas por nombre/número/rareza; paginación/carga diferida. Contador de resultados y estado de datos completos o parciales.
4. Probabilidad por carta y/o rareza, con unidad clara y evidencia según sección 6.
5. Qué asegura el producto, diferenciando cantidades físicas, promos fijas y garantías documentadas de rareza.
6. Fuente oficial y fecha de revisión de la información.
7. Productos sellados relacionados.

Si el set tiene lista verificada completa, mostrarla completa por páginas. Si solo hay parte verificada, indicar `Galería parcial` y enlace oficial; nunca presentar cinco cartas como si fueran todas. Mostrar `No disponible` o `No publicada` según la evidencia, no una cifra falsa. La ficha debe verse terminada también en esos estados.

### Carrito `/carrito`

Persistencia al recargar, agregar/quitar, editar cantidades y subtotal. Evitar duplicar líneas del mismo SKU. Distinguir SKUs/idiomas diferentes. Aceptar solo cantidades enteras positivas y respetar límites del catálogo. Importe en centavos enteros; formatear ARS al mostrar.

Si cambió el precio o desapareció un producto desde que se agregó, explicar y actualizar con confirmación del cliente antes de continuar. Carrito vacío con acceso al catálogo. No perder el carrito al iniciar sesión.

Entregas:

- Andreani: solicitar localidad, provincia y código postal; costo/plazo a coordinar, sin integración ni tarifa supuesta.
- Moto: CABA y AMBA; localidad y código postal, cobertura a confirmar por WhatsApp. No prometer que cualquier dirección de Buenos Aires está cubierta.
- Retiro: selector Ramos Mejía o Haedo; dirección y horario exactos se acuerdan por WhatsApp. No publicar direcciones inventadas.

No pedir DNI ni dirección completa en esta primera consulta. Nombre de contacto opcional; aprovechar perfil si existe, pero permitir consultar como invitado.

Preferencia de pago configurable: inicialmente solo `A coordinar por WhatsApp`. Preparar la configuración para activar transferencia/efectivo u otros métodos cuando el dueño los confirme. No mostrar métodos que todavía no acepta ni pedir datos bancarios del cliente.

Resumen: productos, cantidades, precios unitarios, subtotales, subtotal de productos, entrega, preferencia de pago. Si envío es desconocido, mostrar `Envío: a coordinar` y `Subtotal de productos`; no poner envío $0 ni llamarlo importe final.

CTA `Continuar por WhatsApp`, con texto `Se abrirá el chat con tu pedido listo. Solo tenés que enviarlo.` No usar `Pagar ahora` como si hubiese un cobro en la web.

### Cómo comprar `/como-comprar`

Explicar carrito → elección de entrega/pago → WhatsApp → confirmación del vendedor → pago/entrega acordados. FAQ sobre envíos, retiros, productos sellados y contenido aleatorio, sin condiciones comerciales inventadas.

### Cuenta `/cuenta`

Registro, inicio/cierre de sesión, perfil básico, favoritos y mis consultas guardadas. Recuperación de acceso mediante flujo de token de un solo uso del sistema de autenticación. Rutas privadas validadas en servidor. Un cliente nunca ve consultas ni datos de otro.

Usar la librería de autenticación para hash de contraseñas, sesiones y recuperación, no criptografía casera. Cookies seguras según entorno, protección de origen/CSRF y límites contra abuso. Validación del servidor para todo cambio sensible.

En desarrollo, correo de verificación/recuperación mediante transporte local a archivos ignorados dentro de `.local/mail/`, o servidor de correo local existente; documentar cómo verlo. Esos correos contienen tokens: no versionarlos, servirlos públicamente ni imprimirlos en logs compartidos. El transporte local se deshabilita en producción. No afirmar que se envió un email real cuando solo existe localmente.

Al publicar, configurar correo transaccional y verificación de email antes de habilitar cuentas públicas. En la demo, la verificación y recuperación deben poder probarse de punta a punta con el transporte local. No usar un endpoint público de bypass.

Perfil mínimo: nombre y email. No almacenar direcciones completas ni información de pagos. Historial llamado `Mis consultas`, no `Compras pagadas`. Favoritos son productos sellados y enlazan su ficha.

## 5. Flujo confiable de consulta y WhatsApp

El botón hace una petición al servidor con IDs, cantidades, modalidad de entrega y preferencia de pago. El servidor valida esquema, catálogo actual, disponibilidad y métodos habilitados, y calcula importes. No aceptar precio/título/total del navegador como verdad.

Generar un snapshot inmutable de la consulta con identificador público no secuencial, moneda, líneas con SKU/nombre/idioma/cantidad/precio de ese momento, subtotal, entrega, preferencia de pago, fecha y userId de sesión cuando exista. El vínculo con cuenta se toma de la sesión, nunca del body. No incluir contraseñas ni datos innecesarios.

Estado inicial `consulta_preparada`. La tienda no puede saber con un enlace wa.me si el cliente realmente envió el mensaje. No cambiar a `mensaje_enviado`, `pagado` o `confirmado` por abrir WhatsApp. No reservar ni descontar stock en este paso. Informar que disponibilidad e importe final se confirman en el chat.

Usar clave de idempotencia para que un doble clic/reintento no cree dos consultas idénticas; no reutilizar la misma clave si cambia el contenido del carrito. Mantener la posibilidad de reabrir/copiar el mismo mensaje. No vaciar el carrito al abrir WhatsApp.

Formato orientativo de mensaje:

```text
Hola, quiero consultar este pedido:
Referencia: {id}

{cantidad} × {producto} [{idioma}] — SKU {sku}
Unitario: {precioARS} · Subtotal: {subtotalLineaARS}

Subtotal de productos: {subtotalARS}
Entrega: {modalidad y zona o punto de retiro}
Envío: a coordinar
Preferencia de pago: {metodo}

¿Me confirmás disponibilidad e importe final?
```

Usar `https://wa.me/{numero}?text={textoCodificado}` con `encodeURIComponent`; número configurado en formato internacional solo dígitos, validado, sin inventarlo. El botón abre el chat y el cliente envía el mensaje. Evitar ventanas bloqueadas por el navegador: proporcionar un enlace directo clicable tras preparar la consulta o navegar de forma compatible. Dar opciones `Copiar mensaje` y `Reabrir WhatsApp`.

Sin número configurado: modo demo explícito, vista previa y copiar mensaje; no navegar a un número falso ni dejar un botón sin explicación. Producción no se habilita hasta configurar el número.

Probar un carrito largo. Si supera el límite conservador de URL documentado/probado para los clientes objetivo, usar un resumen legible con referencia y ofrecer copiar el detalle íntegro; nunca truncar productos o precios silenciosamente. No afirmar un límite universal sin evidencia.

No exponer una consulta por un ID fácil de adivinar. Invitados pueden ver su resumen en la sesión actual; su ID no otorga acceso público a datos personales. Los endpoints privados requieren pertenencia/autorización. No incluir datos personales en query strings, analítica ni logs.

El stock es manual en esta versión: después de cerrar una venta, el dueño solicita un cambio en el archivo del producto. Documentar que la disponibilidad visible se actualiza al aplicar/publicar ese cambio, no por abrir WhatsApp. No prometer reservas en tiempo real. Cada SKU de pack tiene stock manual propio; no deducir cantidades de otros SKUs implícitamente.

## 6. Datos de catálogo, cartas y evidencia

Crear esquemas tipados con validación automática. Modelo mínimo, adaptándolo a la implementación sin eliminar información:

```ts
type Product = {
  id: string; sku: string; slug: string; title: string;
  kind: 'booster' | 'pack' | 'box' | 'bundle';
  language: 'ja' | 'en' | 'es'; region: string;
  expansionIds: string[]; currency: 'ARS'; priceMinor: number;
  stockQuantity: number; active: boolean; isDemo: boolean;
  images: ImageAsset[]; description: string;
  contents: ContentItem[]; guaranteeIds: string[];
  packComposition?: Array<{ expansionId: string; packCount: number }>;
};
type Expansion = {
  id: string; slug: string; name: string; code: string;
  language: string; region: string; sourceIds: string[];
  cardListStatus: 'complete' | 'partial' | 'unavailable';
  cards: Card[];
};
type Card = {
  id: string; expansionId: string; name: string;
  number: string; rarity?: string; variant?: string;
  image: ImageAsset; sourceIds: string[]; pullRateIds: string[];
};
type PullRate = {
  id: string; expansionId: string; language: string; region: string;
  target: { kind: 'card' | 'rarity'; id: string };
  unit: 'booster' | 'box'; productScope: string;
  probability: number | null;
  evidence: 'official' | 'observed' | 'unavailable';
  sampleSize?: number; observedHits?: number; sampleUnit?: string;
  interval?: { low: number; high: number; method: string };
  method?: string; sourceIds: string[]; reviewedAt: string;
};
type Guarantee = {
  id: string; scope: string; language: string; region: string;
  statement: string; type: 'physical_contents' | 'fixed_promo' | 'rarity';
  evidence: 'official' | 'seller_pack_contents' | 'unverified';
  sourceIds: string[]; reviewedAt: string;
};
```

Completar tipos referenciados para imágenes, fuentes y contenido físico. Una fuente lleva URL, editor, fecha de consulta, alcance y nota relevante; las imágenes llevan ruta, texto alternativo y estado demo/final. Campos desconocidos quedan nulos/ausentes, no se rellenan con certezas ficticias.

Reglas obligatorias:

- Una tasa oficial es diferente de una estimación observada. Estimaciones visibles: muestra, unidad, fecha, fuente y método. Si no hay evidencia suficiente, no cargar un número.
- Una tasa de rareza no es la tasa de una carta concreta. No repartir por igual la rareza entre cartas sin evidencia.
- Una probabilidad desconocida no es 0%. Mostrar `Dato no disponible`; reservar `No publicada` para lo que la fuente no publica.
- No convertir una tasa por sobre en tasa por caja con `1 - (1-p)^n` suponiendo independencia: la distribución de una caja puede depender de su colación. Solo usar un modelo defendible, explicado y etiquetado; en otro caso dejar sin dato.
- No trasladar tasas/garantías entre inglés, japonés y español, entre regiones, versiones o tiradas, ni entre caja sellada y sobres sueltos.
- El número de cartas por sobre y sobres por caja es contenido físico. No implica una carta especial garantizada ni cartas todas distintas.
- Una promo fija verificada puede mostrarse como incluida. Una garantía de rareza necesita fuente explícita aplicable al SKU.
- Los packs armados por la tienda tienen composición propia; no heredan las garantías de una caja de fábrica.
- Un pack que mezcla expansiones muestra cartas agrupadas por expansión, sin atribuirle la lista ni la garantía de un solo set.
- No mostrar una garantía `unverified` como promesa. Mostrar una explicación de falta de verificación cuando corresponda.

Ejemplo verificado para orientar el modelo: la ficha japonesa de Storm Emeralda enlazada en FUENTES.md indica 30 sobres de 5 cartas y distribución aleatoria. No prueba una tasa de SAR ni una rareza garantizada. Las imágenes de referencia no sirven como evidencia.

### Alta por código

Crear una guía `docs/CATALOGO.md` con ejemplo completo válido: agregar imagen, producto, expansión/cartas, fuentes, precio, stock y publicación local. Un comando `npm run catalog:check` valida duplicados, referencias inexistentes, imágenes faltantes, precios negativos/no enteros, stocks inválidos, probabilidades fuera de [0,1], tasas sin evidencia y garantías sin fuentes según tipo.

Usar IDs estables aunque cambien títulos/precios. Retirar un producto del catálogo no borra snapshots históricos. No hacer scraping de precios de terceros ni actualizaciones automáticas de inventario.

Preparar suficientes productos demo para revisar grilla/filtros, con `isDemo: true`, separados del contenido final. Datos faltantes de cartas se representan honestamente. La validación de salida comercial debe detectar productos demo activos, imágenes ilustrativas, datos obligatorios ausentes y WhatsApp sin configurar.

## 7. Integridad, privacidad y estados de error

Separar módulos servidor/cliente y no empaquetar secretos en el navegador. Variables públicas solo cuando corresponda. `.env.example` documentado con valores vacíos; secretos locales generados en archivo ignorado. No registrar tokens ni contenido sensible de consultas.

Limitar abuso de endpoints de registro, login, recuperación y creación de consultas. Para un servidor único, usar mecanismo persistente o adecuado a ese despliegue; no afirmar protección distribuida por un mapa en memoria. Validar tamaños y sanear cualquier contenido enriquecido.

Persistir datos tras reiniciar el servidor. Migraciones locales repetibles sin destruir usuarios. Tests con base aislada. Ante error de persistencia, mostrar reintento; no afirmar que se guardó una consulta que falló. Favoritos no deben duplicarse.

No activar analítica de terceros ni cookies no necesarias en esta fase. Incluir páginas de privacidad/condiciones como borradores identificados y configurables, sin inventar CUIT, domicilio, políticas legales ni afirmar cumplimiento. Los datos y textos finales se completan antes de publicar, sin frenar el prototipo local.

## 8. Hitos y revisión humana

La revisión del dueño ocurre al final de cada hito, después de tu revisión técnica. Una aprobación autoriza avanzar al siguiente; no implica contratar o publicar.

| Hito | Entrega completa | Verificación antes de mostrar |
| --- | --- | --- |
| 1 | Proyecto local, tokens, cabecera/footer e inicio elaborado responsive | Arranque, typecheck/lint, build y revisión visual escritorio/móvil; enlaces a rutas en preparación con estado explícito |
| 2 | Catálogo, filtros, expansiones y ficha completa con cartas/probabilidades/contenido | Filtros/URL, producto inexistente, imágenes, galería, datos parciales, validación de catálogo y responsive |
| 3 | Carrito, entrega/pago, consulta persistente, WhatsApp y modo demo | Cantidades, importes, cambio de precio, agotados, idempotencia, encoding y errores; no envío real en pruebas |
| 4 | Registro, sesiones, perfil, favoritos, recuperación y mis consultas | Flujos reales en base local, transporte de correo local, autorización entre dos usuarios, invitado y persistencia |
| 5 | Integración final, accesibilidad/rendimiento, documentación y preparación de entrega | Suite completa, build de producción local, screenshots finales, revisión de datos demo/pendientes y comandos reproducibles |

En hito 1 no crear botones engañosos: las rutas aún pendientes pueden mostrar un estado de desarrollo claro solo en la demo. En la entrega final no deben quedar esos destinos sin implementar.

Por hito: ejecutar checks relevantes, corregir fallas, actualizar `docs/ESTADO.md`, commit y push si procede según CLAUDE.md. Mostrar algo concreto y revisable. No dejar al dueño las pruebas técnicas como sustituto de las tuyas.

## 9. Comandos y pruebas de aceptación

Crear scripts reproducibles, apropiados al entorno:

`npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`, `npm run catalog:check`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm run verify` y `npm run release:check`.

`verify` agrupa los checks automatizados estables sin levantar servidores duplicados; documentar si E2E requiere un paso aparte. `db:seed` solo agrega fixtures de desarrollo de forma idempotente; nunca borra una base real. `release:check` marca pendientes comerciales/de producción; durante demo esos pendientes no impiden el desarrollo, pero impiden afirmar que está listo para venta pública.

Pruebas mínimas significativas:

- Buscar y combinar filtros, refrescar URL y recuperar el mismo resultado.
- Visitar un producto, cambiar imagen y navegar las secciones/cartas.
- Sumar dos unidades de $9.500 y un pack de $42.000: subtotal $61.000, envío pendiente separado.
- Modificar un precio en el navegador: servidor usa el precio de catálogo y no acepta la manipulación.
- Cantidades negativas, fraccionarias, SKU desconocido/agotado, precio cambiado y producto retirado.
- Carrito persistente y doble clic: una sola consulta para la misma clave.
- Mensaje WhatsApp con tildes, saltos, datos de entrega/pago; teléfono ausente; copiar/reabrir; carrito largo.
- WhatsApp abierto no marca pago, envío de mensaje ni reserva, y no reduce stock.
- Registro/login/logout, email de verificación/recuperación local, token inválido/expirado/reutilizado y no pérdida del carrito.
- Dos usuarios: ninguno puede leer/modificar consultas o favoritos del otro; invitado no recibe historial privado.
- Probabilidad desconocida no aparece como 0%; fuente/muestra visibles cuando existe una estimación; garantías sin evidencia no aparecen como oficiales.
- Navegación por teclado, foco de modal, errores del formulario, estados vacío/carga y móvil sin desborde.

Interceptar salidas a WhatsApp en pruebas automatizadas: comprobar URL y mensaje sin enviar consultas reales. No guardar datos reales de clientes en fixtures o capturas.

## 10. Entrega local final

Código completo y mantenible, lockfile, migraciones, fixtures, `.env.example`, guía de arranque, catálogo editable, pruebas, capturas finales y documentación de pendientes. Agregar `docs/DESPLIEGUE.md` con requisitos de Node/base persistente/backups/HTTPS/correo, sin contratar servicios ni hacer deployment.

La tienda local debe seguir siendo evaluable sin cuentas externas pagas. Antes de producción: catálogo/fotos reales, marca y contacto, condiciones del comercio, pagos aceptados, correo autenticación, teléfono WhatsApp, configuración segura, backups y aprobación explícita del dueño.

No declarar el trabajo completo únicamente porque compila. Debe respetar las referencias, funcionar de punta a punta en local y pasar los criterios correspondientes. Separar claramente `aplicación local terminada` de `lista para vender públicamente`.
