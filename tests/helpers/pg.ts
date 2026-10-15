import { randomBytes } from "node:crypto";
import { afterAll } from "vitest";
import { createDb, type Db } from "@/db/client";
import { createDatabaseFromTemplate, dropDatabase, urlWithDatabase } from "../../scripts/lib/test-postgres";

export type TestDb = Db & { testUrl: string; testName: string };

const open: Array<{ db: Db; name: string }> = [];

/**
 * Base PostgreSQL nueva, aislada y con todas las migraciones, copiada de la plantilla creada en `pg-global-setup.ts`.
 * `max` = conexiones del pool (1 reproduce el entorno serverless: sirve para detectar usos de `db` dentro de una transacción).
 */
export async function openTestDb(opts: { max?: number } = {}): Promise<TestDb> {
  const admin = process.env.TEST_PG_ADMIN_URL;
  if (!admin) throw new Error("Falta TEST_PG_ADMIN_URL: las pruebas deben correr con Vitest (globalSetup arranca PostgreSQL).");
  const name = `t_${randomBytes(6).toString("hex")}`;
  await createDatabaseFromTemplate(admin, name);
  const url = urlWithDatabase(admin, name);
  const db = createDb(url, { max: opts.max ?? 1 });
  open.push({ db, name });
  return Object.assign(db, { testUrl: url, testName: name });
}

afterAll(async () => {
  const admin = process.env.TEST_PG_ADMIN_URL;
  for (const { db, name } of open.splice(0)) {
    await db.$client.end({ timeout: 5 }).catch(() => undefined);
    if (admin) await dropDatabase(admin, name).catch(() => undefined);
  }
});
