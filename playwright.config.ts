import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Servidores aislados: sin número de WhatsApp (modo demo), con número de prueba, catálogo real y panel del dueño. Cada uno usa su propia
// carpeta de build y su propia base PostgreSQL REAL y descartable (scripts/pg-test-server.ts), así las pruebas nunca tocan datos reales.
// La marca de tiempo se fija una vez (el proceso principal la exporta y los workers la heredan).
process.env.E2E_STAMP ??= String(Date.now());
const stamp = process.env.E2E_STAMP;
const dataDir = path.resolve(".local/data");
if (!process.env.TEST_WORKER_INDEX) {
  // Limpieza de bases de corridas anteriores (solo desde el proceso principal).
  try {
    for (const f of fs.readdirSync(dataDir)) if (/^e2e-/.test(f)) fs.rmSync(path.join(dataDir, f), { recursive: true, force: true });
  } catch {
    /* no existe todavía */
  }
}
// `fixture`: catálogo de PRUEBA ficticio (productos con precio y stock de ejemplo) para probar carrito y filtros.
// Sin fixture, el servidor usa el catálogo REAL (16 productos con precio/stock pendientes).
const PG_PORT = Number(process.env.PG_TEST_PORT || 54398);
const pgServer = { command: "npx tsx scripts/pg-test-server.ts demo,live,real,admin,consultas", url: `http://127.0.0.1:${process.env.PG_TEST_READY_PORT || 54399}`, reuseExistingServer: false, timeout: 180_000, env: { PG_TEST_PORT: String(PG_PORT) } };
const server = (port: number, tag: string, whatsapp: string, fixture = true, adminEmail = "") => ({
  // Se prueba el BUILD DE PRODUCCIÓN (sin compilación bajo demanda: tiempos estables y es lo que se entrega).
  // E2E_SKIP_BUILD=1 reutiliza el build anterior (solo para iterar localmente; la entrega siempre se prueba con build nuevo).
  command: process.env.E2E_SKIP_BUILD === "1" ? `npx next start -p ${port}` : `npx next build && npx next start -p ${port}`,
  url: `http://localhost:${port}`,
  reuseExistingServer: false,
  timeout: 300_000,
  env: {
    NEXT_DIST_DIR: `.next-e2e-${tag}`,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/e2e_${tag}`,
    STORAGE_DRIVER: "local", // sin Supabase en las pruebas de recorrido: las fotos subidas van a una carpeta local
    // Las fotos que suben las pruebas viven en una carpeta propia (se borra con las demás bases e2e-*), nunca en la del desarrollo.
    UPLOADS_DIR: `.local/data/e2e-${stamp}-${tag}-uploads`,
    WHATSAPP_NUMBER: whatsapp,
    BETTER_AUTH_URL: `http://localhost:${port}`,
    // Correo local aislado por servidor (los tests leen los enlaces de acá, nunca de un proveedor real).
    MAIL_DIR: `.local/data/e2e-${stamp}-${tag}-mail`,
    BETTER_AUTH_SECRET: `e2e-secret-${stamp}-${tag}-0123456789abcdef0123456789abcdef`,
    MAIL_TRANSPORT: "local", // solo para estas pruebas locales: el build de producción no envía correo real
    CATALOG_FIXTURE: fixture ? "demo" : "",
    // Sin salida a internet: la cotización se prueba con valores manuales y el proveedor simulado en las pruebas de reglas.
    FX_AUTO_REFRESH: "0",
    // Dueño del panel /admin: solo el servidor «admin» lo tiene configurado; los demás prueban que queda cerrado.
    ADMIN_EMAIL: adminEmail,
    AUTH_SECRET_FILE: `.local/data/e2e-${stamp}-${tag}.secret`,
  },
});

export default defineConfig({
  workers: 1,
  testDir: "tests/e2e",
  timeout: 45_000,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: { reducedMotion: "reduce" },
  // E2E_SERVERS=real,admin levanta solo esos servidores (para iterar sobre un grupo de pruebas); sin definir, se levantan los cuatro.
  webServer: [pgServer as never, server(3100, "demo", ""), server(3101, "live", "5491155550000"), server(3102, "real", "", false), server(3103, "admin", "", true, "dueno-e2e@example.com"), server(3104, "consultas", "", true, "dueno-e2e@example.com")].filter((w) => !process.env.E2E_SERVERS || !(w.env as Record<string, string>).NEXT_DIST_DIR || process.env.E2E_SERVERS.split(",").some((t) => (w.env as Record<string, string>).NEXT_DIST_DIR.endsWith(`-${t}`))),
  projects: [
    { name: "escritorio", testIgnore: /whatsapp|colecciones|admin|promo-accesorios/, use: { baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } } },
    { name: "movil", testIgnore: /whatsapp|colecciones|admin|promo-accesorios/, use: { baseURL: "http://localhost:3100", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: "whatsapp", testMatch: /whatsapp/, use: { baseURL: "http://localhost:3101", viewport: { width: 1440, height: 900 } } },
    // Panel del dueño (catálogo de prueba, ADMIN_EMAIL configurado); su propia base y su propio correo local.
    { name: "admin", testMatch: /admin.spec/, use: { baseURL: "http://localhost:3103", viewport: { width: 1440, height: 900 } } },
    // Consultas, ventas y stock del panel: servidor y base propios (mueven stock y precios de los productos de prueba y no deben alterar los conteos de admin.spec.ts).
    { name: "consultas", testMatch: /admin-consultas.spec|promo-accesorios.spec/, use: { baseURL: "http://localhost:3104", viewport: { width: 1440, height: 900 } } },
    // Catálogo real (8 colecciones, 16 fichas): escritorio y móvil.
    { name: "real-escritorio", testMatch: /colecciones/, use: { baseURL: "http://localhost:3102", viewport: { width: 1440, height: 900 } } },
    { name: "real-movil", testMatch: /colecciones/, use: { baseURL: "http://localhost:3102", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
