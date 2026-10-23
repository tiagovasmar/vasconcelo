import fs from "node:fs";
import path from "node:path";
import { resilientPostgres } from "./resilient";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";

/**
 * Conexión a PostgreSQL (Supabase). Todo el acceso a datos es ASÍNCRONO.
 *
 * Funciones serverless (Netlify): cada instancia abre pocas conexiones y las suelta enseguida. Por eso:
 *  - `DATABASE_URL` debe ser la cadena del POOLER de Supabase en modo transacción (puerto 6543);
 *  - `prepare: false` es obligatorio con ese modo (el pooler no conserva sentencias preparadas entre conexiones);
 *  - `max` = 1 por defecto (`DATABASE_POOL_MAX`; es lo que recomienda Supabase en serverless) para no agotar los límites del plan gratuito entre muchas instancias. Por eso, dentro de una transacción SIEMPRE se usa `tx`, nunca `db` (con una sola conexión se bloquearía).
 * Las migraciones usan `DIRECT_URL` (conexión directa o pooler en modo sesión, puerto 5432) y nunca corren solas en el servidor web.
 */
export type Db = ReturnType<typeof createDb>;

const isLocalHost = (url: string) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** Plazos (ver resilient.ts). Conexión: 8 s; consulta (espera + ejecución): 10 s, más 3 s para que el servidor confirme la cancelación. Se ajustan con variables de entorno. */
const envNumber = (name: string, fallback: number) => {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};
export const dbLimits = () => ({ connectTimeoutS: envNumber("DATABASE_CONNECT_TIMEOUT_S", 8), queryTimeoutMs: envNumber("DATABASE_QUERY_TIMEOUT_MS", 10_000) });

/** `queryTimeoutMs`: plazo por consulta (0 o sin indicar = sin plazo: migraciones, respaldos y herramientas). La conexión de la aplicación (`getDb`) lo toma del entorno. */
export function createDb(url: string, opts: { max?: number; queryTimeoutMs?: number; connectTimeoutS?: number; graceMs?: number } = {}) {
  // Salvaguarda de desarrollo: con ENTORNO_LOCAL=1 (solo en .env.local de esta computadora) jamás se conecta a un servidor remoto, ni por error de configuración.
  if (process.env.ENTORNO_LOCAL === "1" && !isLocalHost(url)) throw new Error("ENTORNO_LOCAL=1: se rechazó una conexión a un servidor que no es local. Usá la base de desarrollo (npm run dev:db).");
  const ssl = process.env.DATABASE_SSL === "disable" || isLocalHost(url) ? false : ("require" as const);
  const options = {
    prepare: false,
    max: opts.max ?? (Number(process.env.DATABASE_POOL_MAX) || 1),
    idle_timeout: 20,
    connect_timeout: opts.connectTimeoutS ?? 15,
    ssl,
    // Los mensajes informativos del servidor (NOTICE) no se imprimen: podrían incluir datos.
    onnotice: () => undefined,
    // Solo para mediciones locales (scripts/medir-rendimiento.mjs): con DB_QUERY_LOG=<archivo> cada consulta deja una línea. Sin esa variable no hace nada.
    ...(process.env.DB_QUERY_LOG ? { debug: (_c: number, q: string) => fs.appendFileSync(process.env.DB_QUERY_LOG!, `${Date.now()}\t${q.replace(/\s+/g, " ").slice(0, 140)}\n`) } : {}),
  };
  const client = resilientPostgres(url, options, { queryTimeoutMs: opts.queryTimeoutMs ?? 0, graceMs: opts.graceMs });
  return drizzle(client, { schema });
}

/** Carpeta con las migraciones versionadas de PostgreSQL (generadas con drizzle-kit desde `src/db/schema.ts`). */
export const MIGRATIONS_FOLDER = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

/** Aplica las migraciones pendientes (no borra datos). Abre su propia conexión y la cierra. */
export async function runMigrations(url: string): Promise<void> {
  const db = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

export const databaseUrl = (): string => {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Falta DATABASE_URL (cadena de conexión de PostgreSQL / pooler de Supabase). Ver docs/DESPLIEGUE-NETLIFY-SUPABASE.md.");
  return url;
};

const globalForDb = globalThis as unknown as { __tiendaDb?: Db };

/** Conexión única del proceso (se reutiliza entre recargas en desarrollo). Es perezosa: no se conecta hasta la primera consulta. */
export function getDb(): Db {
  const { connectTimeoutS, queryTimeoutMs } = dbLimits();
  return (globalForDb.__tiendaDb ??= createDb(databaseUrl(), { connectTimeoutS, queryTimeoutMs }));
}
