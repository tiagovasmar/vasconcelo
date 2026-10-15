import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { adminSettings } from "@/db/schema";

/**
 * Aviso de STOCK BAJO (solo para el dueño, dentro de /admin): cuando un producto publicado tiene entre 1 y N unidades se marca «Stock bajo» en
 * la lista y se puede filtrar. N lo elige el dueño (0 = sin aviso). No cambia nada de la tienda pública ni envía correos o mensajes.
 */
export const LOW_STOCK_KEY = "low_stock_threshold";
export const LOW_STOCK_DEFAULT = 3;
export const LOW_STOCK_MAX = 999;

export const LowStockInputSchema = z.object({
  lowStockThreshold: z.number({ message: "Escribí un número entero." }).int("El umbral debe ser un número entero.").min(0, "El umbral no puede ser negativo (0 = sin aviso).").max(LOW_STOCK_MAX, `El umbral no puede superar ${LOW_STOCK_MAX}.`),
});

export type LowStockSetting = { threshold: number; custom: boolean; updatedAt: number | null; updatedByEmail: string | null };

export async function getLowStock(db: Db): Promise<LowStockSetting> {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, LOW_STOCK_KEY));
  const n = row ? Number(row.value) : NaN;
  if (!row || !Number.isInteger(n) || n < 0 || n > LOW_STOCK_MAX) return { threshold: LOW_STOCK_DEFAULT, custom: false, updatedAt: null, updatedByEmail: null };
  return { threshold: n, custom: true, updatedAt: row.updatedAt, updatedByEmail: row.updatedByEmail };
}

export async function setLowStock(db: Db, threshold: number, actor: { email: string }, now = Date.now()): Promise<LowStockSetting> {
  const parsed = LowStockInputSchema.parse({ lowStockThreshold: threshold });
  const values = { value: String(parsed.lowStockThreshold), updatedAt: now, updatedByEmail: actor.email };
  await db.insert(adminSettings).values({ key: LOW_STOCK_KEY, ...values }).onConflictDoUpdate({ target: adminSettings.key, set: values });
  return getLowStock(db);
}

/** ¿Hay pocas unidades? Solo con cantidad positiva (0 es «Sin stock», no «bajo»), producto que se vende de stock y aviso activado. */
export const isLowStock = (stock: number | null, orderOnly: boolean, threshold: number): boolean => threshold > 0 && !orderOnly && stock !== null && stock > 0 && stock <= threshold;
