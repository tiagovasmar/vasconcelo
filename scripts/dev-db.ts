import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import EmbeddedPostgres from "embedded-postgres";
import { runMigrations } from "../src/db/client";

/**
 * Base de DESARROLLO local, separada de producción: un PostgreSQL real (binario de `embedded-postgres`) con datos persistentes en `.local/dev-pg`.
 *   npm run dev:db        → la deja corriendo (Ctrl+C la detiene; los datos se conservan)
 *   npm run dev:db -- --reset   → borra los datos locales y empieza de cero
 * Escucha solo en 127.0.0.1:54400, base `vasconcelo_dev`. No lee `.env.local` ni ninguna credencial: no puede tocar Supabase.
 */
const PORT = Number(process.env.DEV_PG_PORT || 54400);
const DB = "vasconcelo_dev";
const dir = path.resolve(".local/dev-pg");
const url = `postgres://postgres:postgres@127.0.0.1:${PORT}/${DB}`;

async function main() {
  if (process.argv.includes("--reset")) fs.rmSync(dir, { recursive: true, force: true });
  const fresh = !fs.existsSync(path.join(dir, "data", "PG_VERSION"));
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, "data"), user: "postgres", password: "postgres", port: PORT, persistent: true, postgresFlags: ["-c", "max_connections=100"], onLog: () => undefined, onError: () => undefined });
  if (fresh) await pg.initialise();
  await pg.start();
  const admin = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, ssl: false, onnotice: () => undefined });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${DB}`;
    if (!rows.length) await admin.unsafe(`create database ${DB}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  await runMigrations(url);
  console.log(`PostgreSQL de desarrollo listo en 127.0.0.1:${PORT}/${DB} (datos en .local/dev-pg).`);
  const stop = async () => { await pg.stop().catch(() => undefined); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => undefined, 1 << 30);
}
main().catch((e) => { console.error(e); process.exit(1); });
