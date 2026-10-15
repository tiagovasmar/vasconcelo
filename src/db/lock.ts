import { sql } from "drizzle-orm";
import type { Db } from "./client";

/** Transacción de Drizzle (el argumento del callback de `db.transaction`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Candado de aviso (advisory lock) a nivel de transacción, por clave de texto. En PostgreSQL (READ COMMITTED) dos transacciones que leen la misma
 * versión podrían escribir las dos; con este candado la segunda espera a que termine la primera y entonces ve la versión nueva (y responde «stale»).
 * Se libera solo al terminar la transacción, así que funciona con el pooler de Supabase en modo transacción.
 */
export async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
