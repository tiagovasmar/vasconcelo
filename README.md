# Tienda Pokémon TCG (entrega local)

Tienda de un solo vendedor de **sobres, packs y cajas selladas Pokémon TCG** para Argentina (ARS). El visitante explora el catálogo, ve qué contiene cada producto, arma un carrito y abre WhatsApp con el pedido ya escrito; el vendedor confirma disponibilidad, importe final, pago y entrega en el chat. **No hay pagos en línea.** Las cuentas son opcionales.

> Estado: **aplicación local terminada** con datos de demostración. **No está lista para vender públicamente**: faltan imágenes finales, datos comerciales reales y la configuración de producción. Ver [docs/PENDIENTES-PUBLICACION.md](docs/PENDIENTES-PUBLICACION.md) y ejecutá `npm run release:check`.

## Requisitos
- **Node.js 22 o superior** (probado con 24; hay un `.nvmrc`) y npm.
- Windows, macOS o Linux. No hace falta Docker ni cuentas externas.

## Instalar, preparar la base y arrancar
```bash
npm ci                    # instala exactamente las versiones del package-lock.json (el .npmrc evita compilar better-sqlite3: usa binarios precompilados)
npm run db:migrate        # aplica las migraciones de PostgreSQL (DIRECT_URL en .env.local); no borra datos. Ver docs/DESPLIEGUE-NETLIFY-SUPABASE.md
npm run dev               # http://localhost:3000
```
- La base y los secretos de desarrollo se crean solos en `.local/` (ignorada por Git). Podés repetir `db:migrate` cuando quieras: es seguro.
- `npm run db:seed` está disponible pero hoy no siembra nada (el catálogo vive en el código).
- Correo de desarrollo: **no sale a internet**. Los correos de confirmación y recuperación se guardan en `.local/mail/`; verlos con `npm run mail:last`.
- WhatsApp: sin número configurado, la tienda funciona en **modo demo** (vista previa y copiar el mensaje, sin abrir ningún chat). Ver [docs/OPERACION.md](docs/OPERACION.md#whatsapp).

### Modo producción local
```bash
npm run build
BETTER_AUTH_SECRET=<valor-largo-aleatorio> BETTER_AUTH_URL=http://localhost:3000 npm run start
```
En producción el transporte de correo local está **deshabilitado** (todavía no hay proveedor): el catálogo, el carrito y las consultas funcionan, y registrarse y recuperar el acceso aparecen como «no disponibles» (no se simula ningún envío). Para evaluar cuentas usá `npm run dev`. Con el servidor iniciado, `npm run smoke` hace una prueba de humo.

## Comandos
| Comando | Qué hace |
| --- | --- |
| `npm run dev` / `build` / `start` | Desarrollo, build de producción y servidor de producción |
| `npm run verify` | typecheck + lint + validación del catálogo + pruebas de reglas (rápido, sin servidores) |
| `npm run test` | Pruebas de reglas (Vitest) |
| `npm run test:e2e` | Recorridos y accesibilidad en navegador (Playwright). Primero: `npx playwright install chromium`. Levanta tres servidores aislados (:3100 demo de prueba, :3101 con WhatsApp de prueba, :3102 catálogo real) con base y correo temporales |
| `npm run catalog:check` | Valida productos, expansiones, cartas, tasas, garantías, fuentes e imágenes |
| `npm run precios:importar` | Pasa `datos/precios-y-stock.csv` al catálogo (`-- --write` para escribir). Ver docs/OPERACION.md |
| `npm run colecciones:cartas` / `colecciones:imagenes` | Rastrea las cartas del buscador oficial y descarga sus imágenes (docs/COLECCIONES.md) |
| `npm run release:check` | Lista lo que falta antes de publicar (sale con error mientras haya bloqueantes) |
| `npm run db:generate` / `db:migrate` / `db:seed` | Migraciones de la base (Drizzle) |
| `npm run db:backup` / `db:restore -- <archivo> --yes` | Copia de seguridad y restauración de la base |
| `npm run mail:last` | Muestra los últimos correos del transporte local de desarrollo |
| `node scripts/rendimiento.mjs` | Mide rendimiento sobre el build de producción (ver [docs/RENDIMIENTO.md](docs/RENDIMIENTO.md)) |

## Qué hay adentro
```
src/app/            rutas: inicio, /sellados, /productos/[slug], /expansiones, /carrito, /cuenta/*, /como-comprar, /privacidad, /condiciones, /api/*
src/content/        marca, WhatsApp, entregas y pagos · productos, expansiones/cartas, tasas, garantías, fuentes · textos legales
src/features/       catálogo (búsqueda, filtros, validación) · consultas (precios, mensaje, WhatsApp) · cuentas (favoritos)
src/server/         autenticación, correo, sesión (solo servidor) · src/db: esquema PostgreSQL, respaldo y migración desde SQLite
drizzle/            migraciones · scripts/ validación, release, backup, capturas y medición · tests/ reglas y recorridos
docs/               ESTADO, OPERACION, CATALOGO, CUENTAS, DESPLIEGUE, PENDIENTES-PUBLICACION, RENDIMIENTO, DECISIONES, ASSETS-PENDIENTES, capturas/
referencias/        bocetos aprobados (no se sirven como sitio)
```

## Documentación
- [docs/OPERACION.md](docs/OPERACION.md): el día a día (productos, precios, stock, WhatsApp, correo, backups).
- [docs/CATALOGO.md](docs/CATALOGO.md): cómo cargar productos, cartas, probabilidades y fuentes (con ejemplo completo).
- [docs/CUENTAS.md](docs/CUENTAS.md): cuentas, correo local y cómo se asocian las consultas de invitado.
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md): requisitos para publicar más adelante (no se contrató ni publicó nada).
- [docs/PENDIENTES-PUBLICACION.md](docs/PENDIENTES-PUBLICACION.md): lista concreta de pendientes.
- [docs/ESTADO.md](docs/ESTADO.md) y [docs/DECISIONES.md](docs/DECISIONES.md): estado, pruebas y decisiones técnicas.
