import http from "node:http";
import postgres from "postgres";
import { startTestPostgres, createDatabaseFromTemplate } from "./lib/test-postgres";

/**
 * Levanta un PostgreSQL REAL descartable para las pruebas de recorrido (Playwright) y las deja listas: una base migrada por cada servidor.
 *   npm run pg:test -- demo,live,real,admin
 * Puerto fijo (PG_TEST_PORT, 54398) y bases `e2e_<servidor>`: playwright.config.ts arma las URLs sin leer nada. Mantiene el proceso vivo (Ctrl+C lo detiene y borra los datos). Abre un puerto «listo» (PG_TEST_READY_PORT,
 * por defecto 54399) cuando todo está preparado, para que Playwright espere.
 */
async function main() {
  const tags = (process.argv[2] || "demo,live,real,admin,consultas,extra,resil,layout").split(",");
  const readyPort = Number(process.env.PG_TEST_READY_PORT || 54399);
  const pg = await startTestPostgres({ port: Number(process.env.PG_TEST_PORT || 54398) });
  const names: Record<string, string> = {};
  for (const t of tags) {
    const name = `e2e_${t}`;
    await createDatabaseFromTemplate(pg.adminUrl, name);
    names[t] = pg.urlFor(name);
  }
  void names;
  const ready = http.createServer((_q, r) => r.end("ok")).listen(readyPort);
  console.log(`PostgreSQL de prueba listo (${tags.join(", ")}).`);
  const stop = async () => { ready.close(); await pg.stop(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  void postgres;
}
main().catch((e) => { console.error(e); process.exit(1); });
