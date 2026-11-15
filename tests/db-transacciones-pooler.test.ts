import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { resilientPostgres } from "@/db/resilient";
import { openTestDb } from "./helpers/pg";

/**
 * Con el pooler de Supabase se pide `max_pipeline: 0` (una consulta a la vez por conexión). Postgres.js NO puede abrir una transacción (`begin`) con ese valor
 * («Cannot set properties of undefined (setting 'onclose')»), así que las transacciones van por un cliente propio. Estas pruebas ejercen exactamente ese caso
 * contra PostgreSQL real: antes de la corrección, crear un despacho, una venta o una compra fallaba y dejaba transacciones abiertas.
 */
const abrir = async (maxPipeline?: number) => {
  const base = await openTestDb({ max: 1 });
  const client = resilientPostgres(base.testUrl, { prepare: false, fetch_types: false, max: 1, ssl: false, onnotice: () => undefined, ...(maxPipeline === undefined ? {} : { max_pipeline: maxPipeline }) } as never, { queryTimeoutMs: 10_000 });
  const db = drizzle(client);
  await db.execute(sql`create table t_pool(id int primary key, v text)`);
  return { db, client };
};

describe.each([undefined, 0])("transacciones con max_pipeline = %s", (mp) => {
  it("una transacción con varias consultas, también en paralelo, se confirma y no deja nada abierto", async () => {
    const { db, client } = await abrir(mp);
    await db.transaction(async (tx) => {
      await tx.execute(sql`insert into t_pool values (1, 'a')`);
      await Promise.all([tx.execute(sql`select count(*) from t_pool`), tx.execute(sql`insert into t_pool values (2, 'b')`)]);
      await tx.execute(sql`insert into t_pool values (3, 'c')`);
    });
    const rows = (await db.execute(sql`select count(*)::int as n from t_pool`)) as unknown as Array<{ n: number }>;
    expect(rows[0].n).toBe(3);
    const open = (await db.execute(sql`select count(*)::int as n from pg_stat_activity where state like 'idle in transaction%' and datname = current_database()`)) as unknown as Array<{ n: number }>;
    expect(open[0].n).toBe(0);
    await client.end({ timeout: 2 });
  });

  it("una transacción que falla se revierte por completo", async () => {
    const { db, client } = await abrir(mp);
    await expect(db.transaction(async (tx) => {
      await tx.execute(sql`insert into t_pool values (1, 'a')`);
      await tx.execute(sql`insert into t_pool values (1, 'repetida')`);
    })).rejects.toThrow();
    const rows = (await db.execute(sql`select count(*)::int as n from t_pool`)) as unknown as Array<{ n: number }>;
    expect(rows[0].n).toBe(0);
    await client.end({ timeout: 2 });
  });

  it("las lecturas en paralelo fuera de transacción siguen funcionando", async () => {
    const { db, client } = await abrir(mp);
    const r = await Promise.all([db.execute(sql`select 1 as a`), db.execute(sql`select 2 as a`), db.execute(sql`select 3 as a`)]);
    expect(r).toHaveLength(3);
    await client.end({ timeout: 2 });
  });
});
