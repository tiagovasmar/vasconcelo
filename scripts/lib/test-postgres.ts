import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import EmbeddedPostgres from "embedded-postgres";
import { runMigrations } from "../../src/db/client";

/**
 * PostgreSQL REAL para pruebas (no es una simulación): un servidor PostgreSQL de verdad, descargado como binario por el paquete `embedded-postgres`,
 * que arranca en una carpeta temporal y puerto libre de esta computadora y se descarta al terminar. Nunca toca Supabase ni ningún dato real.
 *
 * Se crea UNA base «plantilla» con todas las migraciones aplicadas; cada prueba obtiene su propia base copiada de esa plantilla (rápido y aislado).
 * Alternativa: `TEST_DATABASE_URL` apunta a un PostgreSQL de prueba propio (con permiso CREATE DATABASE); se usa en lugar del embebido.
 */
export const TEMPLATE_DB = "tienda_plantilla";

export type TestPostgres = { adminUrl: string; urlFor: (db: string) => string; stop: () => Promise<void>; embedded: boolean };

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

export function urlWithDatabase(adminUrl: string, db: string): string {
  const u = new URL(adminUrl);
  u.pathname = `/${db}`;
  return u.toString();
}

export async function startTestPostgres(opts: { port?: number } = {}): Promise<TestPostgres> {
  let adminUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
  let stop = async () => {};
  const embedded = !adminUrl;
  if (embedded) {
    const port = opts.port ?? (await freePort());
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tienda-pg-"));
    const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, "data"), user: "postgres", password: "postgres", port, persistent: false, postgresFlags: ["-c", "max_connections=400", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"], onLog: () => undefined, onError: () => undefined });
    await pg.initialise();
    await pg.start();
    adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
    stop = async () => {
      await pg.stop().catch(() => undefined);
      fs.rmSync(dir, { recursive: true, force: true });
    };
  }
  // Plantilla con las migraciones aplicadas (se recrea si ya existía).
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined, ssl: false });
  try {
    await admin.unsafe(`drop database if exists ${TEMPLATE_DB}`);
    await admin.unsafe(`create database ${TEMPLATE_DB}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  await runMigrations(urlWithDatabase(adminUrl, TEMPLATE_DB));
  return { adminUrl, urlFor: (db) => urlWithDatabase(adminUrl, db), stop, embedded };
}

/** Crea una base nueva copiada de la plantilla. */
export async function createDatabaseFromTemplate(adminUrl: string, name: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined, ssl: false });
  try {
    await admin.unsafe(`create database ${name} template ${TEMPLATE_DB}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

export async function dropDatabase(adminUrl: string, name: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined, ssl: false });
  try {
    await admin.unsafe(`drop database if exists ${name} with (force)`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}
