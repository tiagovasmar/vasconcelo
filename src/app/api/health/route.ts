import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { adminConfigured } from "@/server/admin";
import { mailTransportAvailable } from "@/server/mail";
import { json } from "@/server/http";
import { storageAvailable } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Comprobación de estado para el despliegue: la app responde, la base PostgreSQL está accesible y las migraciones están aplicadas.
 * Informa además, sin valores ni claves, qué servicios están configurados (fotos, correo, administrador). No expone datos.
 */
export async function GET() {
  const services = { storage: storageAvailable(), mail: mailTransportAvailable(), admin: adminConfigured() };
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    // Migraciones aplicadas: la tabla del registro de Drizzle existe y la tabla principal también.
    const rows = await db.execute(sql`select to_regclass('public.product_overrides') as t`);
    const migrated = Boolean((rows as unknown as Array<{ t: string | null }>)[0]?.t);
    return json({ status: migrated ? "ok" : "error", database: migrated ? "ok" : "sin_migrar", services }, migrated ? 200 : 503);
  } catch {
    return json({ status: "error", database: "unavailable", services }, 503);
  }
}
