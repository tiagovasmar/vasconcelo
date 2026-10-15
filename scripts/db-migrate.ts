import { describeTarget, scriptUrl } from "./lib/env";
import { runMigrations } from "../src/db/client";

// Aplica las migraciones de PostgreSQL pendientes sin tocar los datos existentes.
// Usa DIRECT_URL (pooler de Supabase en modo SESIÓN, puerto 5432, o conexión directa); nunca corre solo en el servidor web.
async function main() {
  const url = scriptUrl();
  await runMigrations(url);
  console.log(`Base lista y migrada: ${describeTarget(url)}`);
}
main().catch((e) => {
  console.error(`No se pudo migrar: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
